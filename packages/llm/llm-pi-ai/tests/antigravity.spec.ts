import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Api, AssistantMessage, AssistantMessageEvent, Model, OAuthCredential } from '@earendil-works/pi-ai'
import type { AuthEvent, AuthPrompt } from '@earendil-works/pi-ai'
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript'
import { antigravityProvider, ANTIGRAVITY_PROVIDER_ID } from '../src/antigravity.ts'
import {
  ANTIGRAVITY_ACCOUNT_HEADER,
  ANTIGRAVITY_PROJECT_HEADER,
  antigravityStream,
  antigravityStreamSimple,
} from '../src/antigravity-stream.ts'

/** The requests the suite's fetch stub has answered, in order. */
const calls: { url: string; init: RequestInit | undefined }[] = []
const realFetch = globalThis.fetch

/**
 * A fetch stub: loopback URLs go to the real network (the OAuth callback
 * listener under test is a real server); everything else is scripted by url
 * substring, defaulting to 404.
 */
interface StubAnswer {
  status?: number
  body?: unknown
  /** SSE wire lines; `|`-prefixed entries are written verbatim, others as `data:`. */
  stream?: string[]
  /** A verbatim non-JSON body. */
  raw?: string
  /** A response whose body stream errors, so `text()`/`json()` reject. */
  unreadable?: boolean
  /** A bodyless response. */
  empty?: boolean
  /** The fetch itself rejects, as a transport failure does. */
  fail?: string
}

function stubFetch(script: Record<string, StubAnswer>): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = fetchUrl(input)
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return realFetch(input, init)
    }
    calls.push({ url, init })
    const match = Object.entries(script).find(([fragment]) => url.includes(fragment))
    if (match === undefined) return new Response('not found', { status: 404 })
    const { status = 200, body, stream, raw, unreadable, empty, fail } = match[1]
    if (fail !== undefined) throw new Error(fail)
    if (empty === true) return new Response(null, { status })
    if (unreadable === true) {
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.error(new Error('stream gone')) },
      }), { status })
    }
    if (raw !== undefined) return new Response(raw, { status, headers: { 'Content-Type': 'text/plain' } })
    if (stream !== undefined) {
      const bytes = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const line of stream) {
            // `|` marks a verbatim wire line — keep-alives, comments, blanks —
            // anything else is a `data:` payload.
            const wire = line.startsWith('|') ? line.slice(1) : `data: ${line}`
            controller.enqueue(new TextEncoder().encode(`${wire}\n\n`))
          }
          controller.close()
        },
      })
      return new Response(bytes, { status, headers: { 'Content-Type': 'text/event-stream' } })
    }
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }))
}

afterEach(() => {
  calls.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A fetch input's URL, typed so a Request object never stringifies to [object Request]. */
function fetchUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

/** A posted request's body as text — the calls here send JSON or form-encoded bodies. */
function bodyText(init: RequestInit | undefined): string {
  const body = init?.body
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  throw new Error('expected a textual request body')
}

const model = (over: Partial<Model<Api>> = {}): Model<Api> => ({
  id: 'gemini-3.8-flash-medium',
  name: 'Gemini 3.8 Flash (Medium)',
  api: 'google-generative-ai',
  provider: ANTIGRAVITY_PROVIDER_ID,
  baseUrl: 'https://daily-cloudcode-pa.googleapis.com',
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  reasoning: false,
  contextWindow: 1_048_576,
  maxTokens: 64_000,
  upstreamId: 'gemini-3.8-flash-medium(medium)',
  ...over,
} as Model<Api>)

const textContext = (text = 'hi') =>
  normalizeContext({ messages: [{ role: 'user', content: [{ type: 'text', text }], timestamp: 0 }] })

/** Drain an event stream into its event list. */
async function drain(stream: ReturnType<typeof antigravityStream>): Promise<AssistantMessageEvent[]> {
  const events: AssistantMessageEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

/** The last envelope a stream posted, parsed. */
/** A posted request's body, parsed — every upstream call here sends a JSON string. */
function bodyJson(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(bodyText(init)) as Record<string, unknown>
}

function postedEnvelope(): Record<string, unknown> {
  const request = calls.find(call => call.url.includes('streamGenerateContent'))
  if (request === undefined) throw new Error('no streamGenerateContent request was made')
  return bodyJson(request.init)
}

describe('antigravity stream', () => {
  it('wraps the request in the Code Assist envelope and unwraps the SSE response', async () => {
    stubFetch({
      'streamGenerateContent': {
        stream: [
          JSON.stringify({ response: { responseId: 'r1', candidates: [{ content: { parts: [{ text: 'hel' }] } }] } }),
          JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'lo' }] } }] } }),
          JSON.stringify({ response: {
            candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
          } }),
        ],
      },
    })
    const events = await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at-1',
      headers: { [ANTIGRAVITY_PROJECT_HEADER]: 'proj-7' },
      sessionId: 'session-1',
      signal: new AbortController().signal,
    }))

    const envelope = postedEnvelope()
    expect(envelope['project']).toBe('proj-7')
    expect(envelope['model']).toBe('gemini-3.8-flash-medium(medium)')
    expect(envelope['userAgent']).toBe('antigravity')
    expect(String(envelope['requestId'])).toMatch(/^agent\/[0-9a-f-]+\/\d+\/[0-9a-f-]+\/\d+$/)
    const inner = envelope['request'] as Record<string, unknown>
    expect(typeof inner['sessionId']).toBe('string')
    expect(inner['contents']).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }])

    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer at-1')
    expect(headers['User-Agent']).toBe('antigravity/ide/2.22.0 darwin/arm64')
    // The carrier header is consumed into the envelope, never forwarded.
    expect(headers[ANTIGRAVITY_PROJECT_HEADER]).toBeUndefined()

    expect(events.map(event => event.type)).toEqual(
      ['start', 'text_start', 'text_delta', 'text_delta', 'text_end', 'done'],
    )
    const done = events.at(-1) as Extract<AssistantMessageEvent, { type: 'done' }>
    expect(done.message.stopReason).toBe('stop')
    expect(done.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(done.message.usage).toMatchObject({ input: 10, output: 2, totalTokens: 12 })
  })

  it('emits thinking blocks with their signatures and tool calls as blocks', async () => {
    stubFetch({
      'streamGenerateContent': {
        stream: [
          JSON.stringify({ response: { candidates: [{ content: { parts: [
            { text: 'hmm', thought: true, thoughtSignature: 'sig-1' },
            { functionCall: { name: 'read', args: { path: '/a' } } },
            { text: 'done' },
          ] } }] } }),
          JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
        ],
      },
    })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))

    const types = events.map(event => event.type)
    expect(types).toContain('thinking_start')
    expect(types).toContain('toolcall_start')
    const done = events.at(-1) as Extract<AssistantMessageEvent, { type: 'done' }>
    expect(done.message.stopReason).toBe('toolUse')
    const [thinking, call, text] = done.message.content
    expect(thinking).toMatchObject({ type: 'thinking', thinking: 'hmm', thinkingSignature: 'sig-1' })
    expect(call).toMatchObject({ type: 'toolCall', name: 'read', arguments: { path: '/a' } })
    expect(text).toMatchObject({ type: 'text', text: 'done' })
  })

  it('turns a refusal into an error event carrying the upstream status', async () => {
    stubFetch({ 'streamGenerateContent': { status: 429, body: { error: { message: 'quota' } } } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at', maxRetries: 0 }))

    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.error.errorMessage).toContain('429')
  })

  it('fails the stream when no credential was resolved', async () => {
    const events = await drain(antigravityStream(model(), textContext(), { signal: new AbortController().signal }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.error.errorMessage).toContain('No API key')
  })

  it('surfaces an upstream error finish reason as an error event', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'MALFORMED_FUNCTION_CALL' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
  })

  it('ends as aborted when the signal fired while chunks were arriving', async () => {
    const controller = new AbortController()
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'x' }] } }] } }),
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at',
      signal: controller.signal,
      onProviderStreamEvent: () => { controller.abort() },
    }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.reason).toBe('aborted')
  })

  it('reports a stream that closes without a finish reason', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'x' }] } }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.error.errorMessage).toContain('finish reason')
  })

  it('tolerates junk lines, [DONE], and unwrapped responses in the SSE body', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      '|: keep-alive',
      '|',
      '|data: ',
      '|data: [DONE]',
      // A bare GenerateContentResponse line — not wrapped in `response`.
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const done = events.at(-1) as Extract<AssistantMessageEvent, { type: 'done' }>
    expect(done.message.content).toEqual([{ type: 'text', text: 'ok' }])
  })

  it('carries request options, the system prompt, and tools into the inner request', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    await drain(antigravityStream(model({ reasoning: true }), normalizeContext({
      systemPrompt: 'You are Fiwen.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 0 }],
      tools: [{
        name: 'read',
        description: 'read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }],
    }), {
      apiKey: 'at',
      temperature: 0.4,
      maxTokens: 200_000,
      toolChoice: 'any',
      thinking: { enabled: true, level: 'high' },
      headers: { [ANTIGRAVITY_PROJECT_HEADER]: 'p', 'x-extra': 'kept', 'Content-Type': null },
      sessionId: 'not-numeric',
      signal: new AbortController().signal,
      onPayload: inner => ({ ...(inner as Record<string, unknown>), hooked: true }),
      onResponse: () => {},
      onProviderStreamEvent: () => {},
    }))

    const inner = postedEnvelope()['request'] as Record<string, unknown>
    expect(inner['sessionId']).toMatch(/^-\d+$/)
    expect(inner['systemInstruction']).toEqual({ parts: [{ text: 'You are Fiwen.' }] })
    expect(inner['hooked']).toBe(true)
    const generation = inner['generationConfig'] as Record<string, unknown>
    expect(generation['temperature']).toBe(0.4)
    expect(generation['maxOutputTokens']).toBe(64_000)
    expect(generation['thinkingConfig']).toEqual({ includeThoughts: true, thinkingLevel: 'high' })
    expect(Array.isArray(inner['tools'])).toBe(true)
    const toolConfig = inner['toolConfig'] as { functionCallingConfig?: { mode?: unknown } } | undefined
    expect(typeof toolConfig?.functionCallingConfig?.mode).toBe('string')
    // Custom headers ride through; a null-valued one strips its default.
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers['x-extra']).toBe('kept')
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('sends the disabled-thinking config when the level resolves to off', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    await drain(antigravityStream(model({ reasoning: true }), textContext(), {
      apiKey: 'at',
      thinking: { enabled: false },
    }))
    const inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toBeDefined()
  })

  it('emits a second tool call under a generated id when the first took its id', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ content: { parts: [
        { functionCall: { id: 'dup', name: 'a', args: {} } },
        { functionCall: { id: 'dup', name: 'b', args: { x: 1 } } },
        { functionCall: { name: 'c' } },
      ] } }] } }),
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const done = events.at(-1) as Extract<AssistantMessageEvent, { type: 'done' }>
    const [first, second, third] = done.message.content as Extract<AssistantMessage['content'][number], { type: 'toolCall' }>[]
    expect(first!.id).toBe('dup')
    expect(second!.id).not.toBe('dup')
    expect(third!.id).toContain('c_')
  })

  it('keeps a text block open across consecutive text parts and ends it on a signature-less part', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ content: { parts: [
        { text: 'a' }, { text: 'b' },
      ] } }] } }),
      JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'c', thought: true }] } }] } }),
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const types = events.map(event => event.type)
    // One text block, then thinking: 'a'+'b' share the block; 'c' opens a new one.
    expect(types).toEqual(['start', 'text_start', 'text_delta', 'text_delta', 'text_end', 'thinking_start', 'thinking_delta', 'thinking_end', 'done'])
  })

  it('resolves the reasoning argument into the tiered thinking directive', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const reasoningModel = model({ id: 'gemini-3.8-flash-medium', reasoning: true })

    await drain(antigravityStreamSimple(reasoningModel, textContext(), { apiKey: 'at', reasoning: 'high' }))
    let inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toEqual({ includeThoughts: true, thinkingLevel: 'HIGH' })

    calls.length = 0
    // Every level mapped null leaves 'off' the only supported level, so any
    // request clamps there and the disabled-thinking config is what ships.
    const offOnly = model({ reasoning: true, thinkingLevelMap: { minimal: null, low: null, medium: null, high: null } })
    await drain(antigravityStreamSimple(offOnly, textContext(), { apiKey: 'at', reasoning: 'low' }))
    inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toBeDefined()
    expect((inner.generationConfig?.['thinkingConfig'] as Record<string, unknown>)['includeThoughts']).not.toBe(true)

    calls.length = 0
    // A model that takes the token-budget control instead of a discrete level.
    await drain(antigravityStreamSimple(model({ id: 'claude-sonnet-5-5-high', reasoning: true }), textContext(), { apiKey: 'at', reasoning: 'low' }))
    inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toEqual({ includeThoughts: true })

    calls.length = 0
    await drain(antigravityStreamSimple(reasoningModel, textContext(), { apiKey: 'at' }))
    inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toBeDefined()
    expect((inner.generationConfig?.['thinkingConfig'] as Record<string, unknown>)['includeThoughts']).not.toBe(true)
  })

  it('dispatches a tiered model by wire name, with no thinking parameter at all', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    // The consolidated catalog shape: one picker model whose clamped level
    // selects the wire spelling, `upstreamId` answering the default tier.
    const tiered = {
      ...model({ id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', reasoning: true }),
      upstreamId: 'gemini-3.8-flash-high(high)',
      upstreamIds: {
        low: 'gemini-3.8-flash-low(low)',
        medium: 'gemini-3.8-flash-medium(medium)',
        high: 'gemini-3.8-flash-high(high)',
      },
      thinkingLevelMap: {
        off: null, minimal: null,
        low: 'gemini-3.8-flash-low(low)', medium: 'gemini-3.8-flash-medium(medium)',
        high: 'gemini-3.8-flash-high(high)', xhigh: null, max: null,
      },
    } as Model<Api>

    await drain(antigravityStreamSimple(tiered, textContext(), { apiKey: 'at', reasoning: 'low' }))
    let envelope = postedEnvelope()
    expect(envelope['model']).toBe('gemini-3.8-flash-low(low)')
    // The tier already travels in the wire name; a thinkingConfig beside it
    // would state the same thing twice, so none is sent.
    expect((envelope['request'] as { generationConfig?: Record<string, unknown> })
      .generationConfig?.['thinkingConfig']).toBeUndefined()

    calls.length = 0
    await drain(antigravityStreamSimple(tiered, textContext(), { apiKey: 'at', reasoning: 'medium' }))
    envelope = postedEnvelope()
    expect(envelope['model']).toBe('gemini-3.8-flash-medium(medium)')

    calls.length = 0
    // No level requested: the default tier answers under its own wire name.
    await drain(antigravityStreamSimple(tiered, textContext(), { apiKey: 'at' }))
    envelope = postedEnvelope()
    expect(envelope['model']).toBe('gemini-3.8-flash-high(high)')

    calls.length = 0
    // A level with no wire spelling clamps to the nearest offered tier:
    // `xhigh` finds nothing upward and lands on `high`.
    await drain(antigravityStreamSimple(tiered, textContext(), { apiKey: 'at', reasoning: 'xhigh' }))
    envelope = postedEnvelope()
    expect(envelope['model']).toBe('gemini-3.8-flash-high(high)')
  })

  it('throws synchronously when streamSimple has no credential', () => {
    expect(() => antigravityStreamSimple(model(), textContext(), {})).toThrow('No API key')
  })

  it('delegates the provider\'s stream members to this implementation', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const provider = antigravityProvider()
    const events = await drain(provider.stream(model(), textContext(), { apiKey: 'at' }))
    expect(events.at(-1)!.type).toBe('done')

    const simple = await drain(provider.streamSimple(model(), textContext(), { apiKey: 'at' }))
    expect(simple.at(-1)!.type).toBe('done')
  })

  it('passes a numeric session id through verbatim and hashes a text one', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    await drain(antigravityStream(model(), textContext(), { apiKey: 'at', sessionId: '42' }))
    expect((postedEnvelope()['request'] as Record<string, unknown>)['sessionId']).toBe('42')

    calls.length = 0
    await drain(antigravityStream(model(), textContext(), { apiKey: 'at', sessionId: 'session-text' }))
    const derived = String((postedEnvelope()['request'] as Record<string, unknown>)['sessionId'])
    expect(derived).toMatch(/^-\d+$/)

    // Headers present without a session id — the account carrier seeds it when set.
    calls.length = 0
    await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at',
      headers: { [ANTIGRAVITY_ACCOUNT_HEADER]: 'u@x.dev' },
    }))
    const seeded = String((postedEnvelope()['request'] as Record<string, unknown>)['sessionId'])
    expect(seeded).toMatch(/^-\d+$/)
  })

  it('names the model itself when it carries no upstream spelling', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    await drain(antigravityStream(model({ upstreamId: '' } as Partial<Model<Api>>), textContext(), { apiKey: 'at' }))
    expect(postedEnvelope()['model']).toBe('gemini-3.8-flash-medium')
  })

  it('fails the stream when the credential is an empty key', async () => {
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: '' }))
    expect(events.at(-1)!.type).toBe('error')
  })

  it('lets onPayload replace the inner request wholesale', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at',
      onPayload: () => ({ contents: [{ role: 'user', parts: [{ text: 'rewritten' }] }] }),
    }))
    expect((postedEnvelope()['request'] as Record<string, unknown>)['contents'])
      .toEqual([{ role: 'user', parts: [{ text: 'rewritten' }] }])
    expect(events.at(-1)!.type).toBe('done')

    // A payload that drops contents still envelopes — the request id reads the
    // empty-content step and the body posts what the hook returned.
    calls.length = 0
    await drain(antigravityStream(model(), textContext(), { apiKey: 'at', onPayload: () => ({}) }))
    expect((postedEnvelope()['request'] as Record<string, unknown>)['contents']).toBeUndefined()
  })

  it('runs with no options object at all, then reports the missing key', async () => {
    const events = await drain(antigravityStream(model(), textContext()))
    expect(events.at(-1)!.type).toBe('error')
  })

  it('forwards retry tuning to the retry wrapper', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at',
      maxRetries: 0,
      maxRetryDelayMs: 0,
    }))
    expect(events.at(-1)!.type).toBe('done')
  })

  it('names the status alone when the error body cannot be read', async () => {
    stubFetch({ 'streamGenerateContent': { status: 500, unreadable: true } })
    const events = await drain(antigravityStream(model(), textContext(), {
      apiKey: 'at',
      maxRetries: 0,
    }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.error.errorMessage).toContain('500')
  })

  it('fails an answered request that arrived with no body stream', async () => {
    stubFetch({ 'streamGenerateContent': { status: 200, empty: true } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const last = events.at(-1) as Extract<AssistantMessageEvent, { type: 'error' }>
    expect(last.type).toBe('error')
    expect(last.error.errorMessage).toContain('empty body')
  })

  it('handles every block transition and signature-bearing part in one response', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ content: { parts: [
        { text: 'plain', thoughtSignature: 'sig-text' },
        { text: 'ponder', thought: true },
        { text: 'after' },
        { functionCall: { id: 'dup', name: 'search', args: { q: 'a' } }, thoughtSignature: 'sig-call' },
        { functionCall: { id: 'dup', name: 'fetch', args: {} } },
        { functionCall: { args: {} } },
      ] } }] } }),
      JSON.stringify({ response: {
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: {},
      } }),
    ] } })
    const events = await drain(antigravityStream(model(), textContext(), { apiKey: 'at' }))
    const types = events.map(event => event.type)
    // text → thinking → text → calls exercises every close-open transition.
    expect(types).toEqual([
      'start', 'text_start', 'text_delta', 'text_end',
      'thinking_start', 'thinking_delta', 'thinking_end',
      'text_start', 'text_delta', 'text_end',
      'toolcall_start', 'toolcall_delta', 'toolcall_end',
      'toolcall_start', 'toolcall_delta', 'toolcall_end',
      'toolcall_start', 'toolcall_delta', 'toolcall_end',
      'done',
    ])
    const done = events.at(-1) as Extract<AssistantMessageEvent, { type: 'done' }>
    const calls_ = done.message.content.filter(block => block.type === 'toolCall')
    expect(calls_).toHaveLength(3)
    // The duplicate upstream id was replaced with a generated one.
    expect(new Set(calls_.map(call => call.id)).size).toBe(3)
    // The signed call kept its signature on the part.
    expect(calls_[0]).toMatchObject({ thoughtSignature: 'sig-call' })
    // The nameless call fell back to a generated 'tool_*' id and empty name.
    expect(calls_[2]).toMatchObject({ name: '' })
    // Empty usageMetadata reads as zeroed counters, not a crash.
    expect(done.message.usage.totalTokens).toBe(0)
  })

  it('passes a token-budget thinking directive through when the caller sets one', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    await drain(antigravityStream(model({ reasoning: true }), textContext(), {
      apiKey: 'at',
      thinking: { enabled: true, budgetTokens: 2048 },
    }))
    const inner = postedEnvelope()['request'] as { generationConfig?: Record<string, unknown> }
    expect(inner.generationConfig?.['thinkingConfig']).toEqual({ includeThoughts: true, thinkingBudget: 2048 })
  })

  it('replays a transcript that carries unsigned function calls', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const context = normalizeContext({ messages: [
      { role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 0 },
      { role: 'assistant', content: [
        { type: 'toolCall', id: 'c1', name: 'search', arguments: { q: 'a' } },
        { type: 'toolCall', id: 'c2', name: 'search', arguments: { q: 'b' } },
      ], api: 'google-generative-ai', provider: 'antigravity', model: 'm', usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      }, stopReason: 'toolUse', timestamp: 1 },
      { role: 'toolResult', toolCallId: 'c1', toolName: 'search', content: [{ type: 'text', text: 'r1' }], isError: false, timestamp: 2 },
      { role: 'toolResult', toolCallId: 'c2', toolName: 'search', content: [{ type: 'text', text: 'r2' }], isError: false, timestamp: 3 },
      { role: 'user', content: [{ type: 'text', text: 'next' }], timestamp: 4 },
    ] })
    await drain(antigravityStream(model(), context, { apiKey: 'at' }))
    const inner = postedEnvelope()['request'] as { contents: { role?: string; parts?: Record<string, unknown>[] }[] }
    // Tool results ride under 'user'; the first unsigned call gained the
    // placeholder signature and the second stayed bare.
    const results = inner.contents.filter(content => content.parts?.some(part => part['functionResponse'] !== undefined))
    expect(results.every(content => content.role === 'user')).toBe(true)
    const calls = inner.contents.flatMap(content => content.parts ?? [])
      .filter(part => part['functionCall'] !== undefined)
    expect(calls).toHaveLength(2)
  })

  it('resolves a toolConfig mode of VALIDATED when no strict tool pins one', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    // A claude-id model never declares strict sampling, so the resolver answers
    // undefined and the provider's own default applies.
    const context = normalizeContext({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 0 }],
      tools: [{ name: 'search', description: 'search', parameters: { type: 'object' } }],
    })
    await drain(antigravityStream(model({ id: 'claude-sonnet-5-5-high' }), context, { apiKey: 'at' }))
    const inner = postedEnvelope()['request'] as Record<string, unknown>
    expect(inner['toolConfig']).toEqual({ functionCallingConfig: { mode: 'VALIDATED' } })
  })

  it('forwards a toolChoice through streamSimple', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const context = normalizeContext({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: 0 }],
      tools: [{ name: 'search', description: 'search', parameters: { type: 'object' } }],
    })
    await drain(antigravityStreamSimple(model(), context, { apiKey: 'at', toolChoice: 'none' }))
    const inner = postedEnvelope()['request'] as Record<string, unknown>
    expect(inner['toolConfig']).toEqual({ functionCallingConfig: { mode: 'NONE' } })
  })

  it('rejects streamSimple on an empty key', () => {
    expect(() => antigravityStreamSimple(model(), textContext(), { apiKey: '' })).toThrow('No API key')
  })

  it('fills the first parallel tool call with the placeholder signature in replayed history', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } })] } })
    await drain(antigravityStream(model(), normalizeContext({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'go' }], timestamp: 0 },
        {
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'c1', name: 'read', arguments: {} }],
          api: 'google-generative-ai',
          provider: ANTIGRAVITY_PROVIDER_ID,
          model: 'gemini-3.8-flash-medium',
          usage: {
            input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'toolUse',
          timestamp: 1,
        },
        { role: 'toolResult', toolCallId: 'c1', toolName: 'read', content: [{ type: 'text', text: 'ok' }], isError: false, timestamp: 2 },
      ],
    }), { apiKey: 'at' }))

    const inner = postedEnvelope()['request'] as { contents: Array<{ parts: Array<Record<string, unknown>> }> }
    const callPart = inner.contents[1]!.parts.find(part => part['functionCall'] !== undefined)!
    expect(callPart['thoughtSignature']).toBeTypeOf('string')
    // A tool result rides under `user` — Claude-via-Code-Assist rejects `function`.
    expect(inner.contents[2]!.parts[0]!['functionResponse']).not.toBeUndefined()
  })
})

describe('antigravity provider', () => {
  it('exposes the oauth flow, the catalog, and carrier-header auth', async () => {
    const provider = antigravityProvider()
    expect(provider.id).toBe('antigravity')
    expect(provider.auth.oauth?.isSubscription).toBe(true)
    expect(provider.getModels().length).toBeGreaterThan(0)
    expect(provider.getModels().every(entry => entry.provider === 'antigravity')).toBe(true)

    const auth = await provider.auth.oauth!.toAuth({
      type: 'oauth', access: 'at', refresh: 'rt', expires: 1, projectId: 'p', email: 'e@x.test',
    })
    expect(auth.apiKey).toBe('at')
    expect(auth.headers?.[ANTIGRAVITY_PROJECT_HEADER]).toBe('p')
    expect(auth.headers?.['x-antigravity-account']).toBe('e@x.test')
  })

  it('lists one reasoning model per tiered family, the tiers spelled by wire name', () => {
    const models = antigravityProvider().getModels()
    // The wire table's per-tier spellings collapse into one picker entry;
    // nothing suffixed remains for a picker to list beside it.
    expect(models.filter(entry => entry.id.startsWith('gemini-3.8-flash')).map(entry => entry.id))
      .toEqual(['gemini-3.8-flash'])
    const flash = models.find(entry => entry.id === 'gemini-3.8-flash')
    expect(flash).toMatchObject({
      reasoning: true,
      upstreamId: 'gemini-3.8-flash-high(high)',
      upstreamIds: {
        low: 'gemini-3.8-flash-low(low)',
        medium: 'gemini-3.8-flash-medium(medium)',
        high: 'gemini-3.8-flash-high(high)',
      },
      // Every unspelled level is pinned out, `off` included: the picker offers
      // exactly the tiers a wire name exists for.
      thinkingLevelMap: {
        off: null, minimal: null,
        low: 'gemini-3.8-flash-low(low)', medium: 'gemini-3.8-flash-medium(medium)',
        high: 'gemini-3.8-flash-high(high)', xhigh: null, max: null,
      },
    })
    // Level sets are per model, not per family: a fixed-thinking entry spells
    // its single level once, and an entry upstream reports no tiers for is
    // non-reasoning.
    expect(models.find(entry => entry.id === 'claude-sonnet-4-6')).toMatchObject({
      reasoning: true,
      upstreamIds: { low: 'claude-sonnet-4-6' },
      thinkingLevelMap: {
        off: null, minimal: null, low: 'claude-sonnet-4-6',
        medium: null, high: null, xhigh: null, max: null,
      },
    })
    expect(models.find(entry => entry.id === 'gpt-oss-120b-medium'))
      .toMatchObject({ reasoning: true, upstreamIds: { medium: 'gpt-oss-120b-medium' } })
    expect(models.find(entry => entry.id === 'gemini-3.7-flash')?.reasoning).toBe(false)
  })

  it('dispatches a single-level thinking model under its one wire name', async () => {
    stubFetch({ 'streamGenerateContent': { stream: [
      JSON.stringify({ response: { candidates: [{ finishReason: 'STOP' }] } }),
    ] } })
    const fixed = antigravityProvider().getModels()
      .find(entry => entry.id === 'claude-sonnet-4-6')
    expect((fixed as { upstreamIds?: unknown } | undefined)?.upstreamIds)
      .toEqual({ low: 'claude-sonnet-4-6' })

    // Any requested level clamps to the one spelled tier, and the tier still
    // travels in the wire name — no thinking parameter is sent.
    await drain(antigravityStreamSimple(fixed!, textContext(), { apiKey: 'at', reasoning: 'medium' }))
    const envelope = postedEnvelope()
    expect(envelope['model']).toBe('claude-sonnet-4-6')
    expect((envelope['request'] as { generationConfig?: Record<string, unknown> })
      .generationConfig?.['thinkingConfig']).toBeUndefined()

    calls.length = 0
    // No level requested: the default tier answers under the same name.
    await drain(antigravityStreamSimple(fixed!, textContext(), { apiKey: 'at' }))
    expect(postedEnvelope()['model']).toBe('claude-sonnet-4-6')
  })

  it('runs the full sign-in: loopback code, exchange, discovery, stored project and email', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at-9', refresh_token: 'rt-9', expires_in: 3600, scope: 'sc' } },
      'userinfo': { body: { email: 'human@gmail.test' } },
      'loadCodeAssist': { body: { cloudaicompanionProject: 'provisioned-proj' } },
    })
    const notices: AuthEvent[] = []
    const prompts: AuthPrompt[] = []
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => { notices.push(event) },
      prompt: (prompt) => {
        prompts.push(prompt)
        return new Promise(() => {})
      },
    }) as Promise<OAuthCredential & { projectId?: string; email?: string }>

    // The loopback callback races the (never-answered) manual prompt: once the
    // auth URL arrives, a real request hits the listener like a browser would.
    await vi.waitFor(() => { expect(notices.some(event => event.type === 'auth_url')).toBe(true) })
    const notice = notices.find(event => event.type === 'auth_url')!
    const authUrl = new URL((notice as { url: string }).url)
    expect(authUrl.hostname).toBe('accounts.google.com')
    const redirect = new URL(authUrl.searchParams.get('redirect_uri')!)
    const hit = await realFetch(
      `http://127.0.0.1:${redirect.port}/callback?code=authcode-1&state=${authUrl.searchParams.get('state')!}`,
      { redirect: 'manual' },
    )
    expect(hit.status).toBe(200)
    const result = await pending
    expect(result.type).toBe('oauth')
    expect(result.access).toBe('at-9')
    expect(result.refresh).toBe('rt-9')
    expect(result.projectId).toBe('provisioned-proj')
    expect(result.email).toBe('human@gmail.test')
    expect(prompts[0]!.type).toBe('manual_code')

    const exchange = calls.find(call => call.url.includes('oauth2.googleapis.com/token'))!
    expect(bodyText(exchange.init)).toContain('grant_type=authorization_code')
    expect(bodyText(exchange.init)).toContain('code=authcode-1')
  })

  it('onboards an unprovisioned account through its default tier', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } },
      'userinfo': { body: {} },
      'loadCodeAssist': { body: { allowedTiers: [{ id: 'free-tier', isDefault: true }] } },
      'onboardUser': { body: { done: true, response: { cloudaicompanionProject: { id: 'onboarded-proj' } } } },
    })
    const provider = antigravityProvider()
    let sawUrl = false
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url' && !sawUrl) {
          sawUrl = true
          const redirect = new URL(new URL(event.url).searchParams.get('redirect_uri')!)
          void realFetch(
            `http://127.0.0.1:${redirect.port}/callback?code=c&state=${new URL(event.url).searchParams.get('state')!}`,
            { redirect: 'manual' },
          ).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    }) as Promise<OAuthCredential & { projectId?: string }>

    const result = await pending
    expect(result.projectId).toBe('onboarded-proj')
    const onboard = calls.find(call => call.url.includes('onboardUser'))!
    expect(bodyJson(onboard.init)).toMatchObject({ tierId: 'free-tier' })
  })

  it('rotates the access token and keeps the stored identity fields', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at-2', expires_in: 3600, refresh_token: 'rt-2' } },
    })
    const provider = antigravityProvider()
    const rotated = await provider.auth.oauth!.refresh({
      type: 'oauth', access: 'old', refresh: 'rt-1', expires: 1, projectId: 'p-1', email: 'e@x.test',
    }, new AbortController().signal)

    expect(rotated).toMatchObject({ access: 'at-2', refresh: 'rt-2', projectId: 'p-1', email: 'e@x.test' })
    expect(bodyText(calls[0]!.init)).toContain('grant_type=refresh_token')
    expect(bodyText(calls[0]!.init)).toContain('refresh_token=rt-1')
  })

  it('fails refresh loud when Google refuses the grant', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant', error_description: 'revoked' } } })
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.refresh(
      { type: 'oauth', access: 'a', refresh: 'r', expires: 1 },
      new AbortController().signal,
    )).rejects.toThrow('revoked')
  })

  it('keeps the stored refresh token when rotation returns none', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { body: { access_token: 'at-3', expires_in: 60 } } })
    const provider = antigravityProvider()
    const rotated = await provider.auth.oauth!.refresh(
      { type: 'oauth', access: 'a', refresh: 'rt-keep', expires: 1 },
      new AbortController().signal,
    )
    expect(rotated.refresh).toBe('rt-keep')
    expect(rotated.expires).toBeLessThan(Date.now() + 60_000)
  })

  it('accepts a manually pasted code, and decodes a pasted redirect URL', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at-m', refresh_token: 'rt-m', expires_in: 3600 } },
      'userinfo': { status: 500, body: {} },
      'loadCodeAssist': { status: 500, body: {} },
    })
    const provider = antigravityProvider()
    const answers: Record<number, string> = {}
    let promptCount = 0
    let listenerPort = 0
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          listenerPort = Number(new URL(new URL(event.url).searchParams.get('redirect_uri')!).port)
        }
      },
      prompt: async () => {
        // A stray request to a path the listener does not own answers 404 and
        // leaves the callback armed for the real redirect — or the manual path.
        const stray = await realFetch(`http://127.0.0.1:${String(listenerPort)}/not-the-callback`)
        expect(stray.status).toBe(404)
        return answers[promptCount++] ?? 'pasted-code-1'
      },
    }) as Promise<OAuthCredential & { projectId?: string; email?: string }>

    const result = await pending
    expect(result.access).toBe('at-m')
    // userinfo failed → no email; loadCodeAssist refused → generated project.
    expect(result.email).toBeUndefined()
    expect(result.projectId).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{5}$/)

    calls.length = 0
    promptCount = 0
    answers[0] = 'http://localhost:1234/callback?code=url-code-9&state=x'
    const second = await provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve(answers[promptCount++] ?? ''),
    })
    expect(bodyText(calls.find(call => call.url.includes('/token'))!.init)).toContain('code=url-code-9')
    expect(second.access).toBe('at-m')
  })

  it('rejects the flow when the browser reports an OAuth error', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { body: {} } })
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?error=access_denied&state=${url.searchParams.get('state')!}`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    })
    await expect(pending).rejects.toThrow(/access_denied/)
  })

  it('rejects when the returned state does not match the attempt', async () => {
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?code=x&state=wrong-state`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    })
    await expect(pending).rejects.toThrow(/state mismatch|did not complete/)
  })

  it('cancels cleanly when the signal aborts during the code wait', async () => {
    const controller = new AbortController()
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: controller.signal,
      notify: (event) => { if (event.type === 'auth_url') controller.abort() },
      prompt: () => new Promise(() => {}),
    })
    await expect(pending).rejects.toThrow()
  })

  it('names the exchange failure reason when the token endpoint refuses', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant', error_description: 'code expired' } },
    })
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('dead-code'),
    })).rejects.toThrow('code expired')
  })

  it('names a token answer that carries no credential pair', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { body: { access_token: 'only' } } })
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('code'),
    })).rejects.toThrow('no access/refresh token')
  })

  it('polls onboarding until done, then stores the provisioned project', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    let onboardCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = fetchUrl(input)
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return realFetch(input, init)
      calls.push({ url, init })
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }))
      }
      if (url.includes('userinfo')) return new Response('{}')
      if (url.includes('loadCodeAssist')) {
        return new Response(JSON.stringify({ allowedTiers: [{ id: 'other' }, { id: 'free-tier', isDefault: true }] }))
      }
      if (url.includes('onboardUser')) {
        onboardCalls += 1
        return new Response(JSON.stringify(
          onboardCalls < 2 ? { done: false } : { done: true, response: { cloudaicompanionProject: 'proj-final' } },
        ))
      }
      return new Response('not found', { status: 404 })
    }))
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(60_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?code=c&state=${url.searchParams.get('state')!}`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    }) as Promise<OAuthCredential & { projectId?: string }>
    // Flush the exchange/discovery microtasks, then let the onboard waits run.
    for (let i = 0; i < 12 && onboardCalls < 2; i++) {
      await new Promise(resolve => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(5_500)
    }
    const result = await pending
    expect(result.projectId).toBe('proj-final')
    expect(onboardCalls).toBe(2)
    vi.useRealTimers()
  })

  it('falls back to a generated project when onboarding never completes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } },
      'userinfo': { body: {} },
      'loadCodeAssist': { body: {} },
      'onboardUser': { body: { done: false } },
    })
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(120_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?code=c&state=${url.searchParams.get('state')!}`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    }) as Promise<OAuthCredential & { projectId?: string }>
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setImmediate(resolve))
      await vi.advanceTimersByTimeAsync(5_500)
    }
    const result = await pending
    expect(result.projectId).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{5}$/)
    expect(calls.filter(call => call.url.includes('onboardUser'))).toHaveLength(6)
    vi.useRealTimers()
  })

  it('onboards against legacy-tier when the account reports no default', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } },
      'userinfo': { body: {} },
      'loadCodeAssist': { body: { allowedTiers: [{ id: 'paid-tier' }] } },
      'onboardUser': { body: { done: true, response: { cloudaicompanionProject: 'p' } } },
    })
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?code=c&state=${url.searchParams.get('state')!}`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    })
    await pending
    expect(bodyJson(calls.find(call => call.url.includes('onboardUser'))!.init)).toMatchObject({ tierId: 'legacy-tier' })
  })

  it('aborts a wait between onboarding polls when the signal fires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } },
      'userinfo': { body: {} },
      'loadCodeAssist': { body: { allowedTiers: [{ id: 't', isDefault: true }] } },
      'onboardUser': { body: { done: false } },
    })
    const controller = new AbortController()
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: controller.signal,
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(`http://127.0.0.1:${redirect.port}/callback?code=c&state=${url.searchParams.get('state')!}`).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    })
    // Reach the first onboard wait, then fire the signal inside it.
    for (let i = 0; i < 8 && !calls.some(call => call.url.includes('onboardUser')); i++) {
      await new Promise(resolve => setImmediate(resolve))
    }
    controller.abort()
    await expect(pending).rejects.toThrow()
    vi.useRealTimers()
  })

  it('fails the attempt when the callback arrives without a code', async () => {
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: (event) => {
        if (event.type === 'auth_url') {
          const url = new URL(event.url)
          const redirect = new URL(url.searchParams.get('redirect_uri')!)
          void realFetch(
            `http://127.0.0.1:${redirect.port}/callback?state=${url.searchParams.get('state')!}`,
          ).catch(() => {})
        }
      },
      prompt: () => new Promise(() => {}),
    })
    await expect(pending).rejects.toThrow('missing authorization code')
  })

  it('names a non-Error abort reason with the generic cancellation message', async () => {
    const controller = new AbortController()
    const provider = antigravityProvider()
    const pending = provider.auth.oauth!.login({
      signal: controller.signal,
      notify: (event) => {
        // Abort once the flow is inside the code wait, with a bare reason.
        if (event.type === 'auth_url') queueMicrotask(() => { controller.abort('halt') })
      },
      prompt: () => new Promise(() => {}),
    })
    await expect(pending).rejects.toThrow()
  })

  it('propagates a declined manual prompt as the flow\'s rejection', async () => {
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.reject(new Error('user declined')),
    })).rejects.toThrow('user declined')
  })

  it('takes a pasted URL that carries no code parameter verbatim', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt' } },
      'userinfo': { fail: 'network unreachable' },
      'loadCodeAssist': { body: { cloudaicompanionProject: 'proj-x' } },
    })
    const provider = antigravityProvider()
    const result = await provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('http://localhost:1/callback?state=no-code-here'),
    }) as OAuthCredential & { projectId?: string }
    // The whole pasted text went out as the code; a project came back anyway.
    expect(bodyText(calls.find(call => call.url.includes('/token'))!.init)).toContain(
      'code=http%3A%2F%2Flocalhost%3A1%2Fcallback',
    )
    expect(result.projectId).toBe('proj-x')
    // No expires_in on the token answer → the default hour minus the lead.
    expect(result.expires).toBeLessThanOrEqual(Date.now() + 3_600_000 - 60_000 + 1000)
  })

  it('tolerates a userinfo transport failure and malformed discovery payloads', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } },
      'userinfo': { fail: 'socket reset' },
      // An object-shaped project with no string id, plus junk tiers — the
      // discovery reads them as absent and falls back to onboarding.
      'loadCodeAssist': { body: { cloudaicompanionProject: { id: 7 }, allowedTiers: [5, null, 'x'] } },
      'onboardUser': { body: { done: true, response: {} } },
    })
    const provider = antigravityProvider()
    const result = await provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('code'),
    }) as OAuthCredential & { projectId?: string; email?: string }
    expect(result.email).toBeUndefined()
    // done:true without a project in the response → generated placeholder.
    expect(result.projectId).toMatch(/^[a-z]+-[a-z]+-[0-9a-f]{5}$/)
  })

  it('reads an unparseable discovery body as an empty answer', async () => {
    stubFetch({
      'oauth2.googleapis.com/token': { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } },
      'userinfo': { raw: 'garbage' },
      'loadCodeAssist': { raw: 'not json at all' },
      'onboardUser': { body: { done: true, response: { cloudaicompanionProject: 'p' } } },
    })
    const provider = antigravityProvider()
    const result = await provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('code'),
    }) as OAuthCredential & { projectId?: string }
    expect(result.projectId).toBe('p')
  })

  it('names the bare error field when a token refusal carries no description', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { status: 400, body: { error: 'access_denied' } } })
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('code'),
    })).rejects.toThrow('access_denied')
  })

  it('names the status when the token endpoint answers non-JSON', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { status: 502, raw: 'Bad Gateway' } })
    const provider = antigravityProvider()
    await expect(provider.auth.oauth!.login({
      signal: AbortSignal.timeout(10_000),
      notify: () => {},
      prompt: () => Promise.resolve('code'),
    })).rejects.toThrow('status 502')
  })

  it('falls back to the error field and then the status on refresh', async () => {
    const provider = antigravityProvider()
    const credential = { type: 'oauth', access: 'a', refresh: 'r', expires: 1 } as OAuthCredential

    stubFetch({ 'oauth2.googleapis.com/token': { status: 400, body: { error: 'invalid_grant' } } })
    await expect(provider.auth.oauth!.refresh(credential, new AbortController().signal))
      .rejects.toThrow('invalid_grant')

    stubFetch({ 'oauth2.googleapis.com/token': { status: 503, raw: 'down' } })
    await expect(provider.auth.oauth!.refresh(credential, new AbortController().signal))
      .rejects.toThrow('status 503')
  })

  it('carries a rotated refresh token and scope through refresh', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { body: {
      access_token: 'at-new', refresh_token: 'rt-new', expires_in: 3600, scope: 'openid email',
    } } })
    const provider = antigravityProvider()
    const rotated = await provider.auth.oauth!.refresh(
      { type: 'oauth', access: 'a', refresh: 'rt-old', expires: 1, projectId: 'p' },
      new AbortController().signal,
    ) as OAuthCredential & { scope?: string; projectId?: string }
    expect(rotated.refresh).toBe('rt-new')
    expect(rotated.scope).toBe('openid email')
    expect(rotated.projectId).toBe('p')
  })

  it('ignores an empty scope on refresh', async () => {
    stubFetch({ 'oauth2.googleapis.com/token': { body: {
      access_token: 'at-new', expires_in: 3600, scope: '',
    } } })
    const provider = antigravityProvider()
    const rotated = await provider.auth.oauth!.refresh(
      { type: 'oauth', access: 'a', refresh: 'rt', expires: 1, scope: 'kept' },
      new AbortController().signal,
    ) as OAuthCredential & { scope?: string }
    expect(rotated.scope).toBe('kept')
  })

  it('projects only the non-empty credential fields into carrier headers', async () => {
    const provider = antigravityProvider()
    const oauth = provider.auth.oauth!
    const bare = await oauth.toAuth({ type: 'oauth', access: 'a', refresh: 'r', expires: 1 })
    expect(bare.headers).toEqual({})
    const full = await oauth.toAuth({
      type: 'oauth', access: 'a', refresh: 'r', expires: 1, projectId: 'proj-9', email: 'u@x.dev',
    })
    expect(full.headers).toEqual({
      [ANTIGRAVITY_PROJECT_HEADER]: 'proj-9',
      [ANTIGRAVITY_ACCOUNT_HEADER]: 'u@x.dev',
    })
    const blank = await oauth.toAuth({
      type: 'oauth', access: 'a', refresh: 'r', expires: 1, projectId: '', email: '',
    })
    expect(blank.headers).toEqual({})
  })
})
