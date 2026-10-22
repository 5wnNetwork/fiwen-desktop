/**
 * The streaming half of the Antigravity provider. Antigravity is Google's
 * subscription Code Assist surface: requests speak the Gemini
 * `GenerateContent` vocabulary, but wrapped in the Code Assist internal
 * envelope (`project`, `userAgent`, `requestId`, `sessionId`) and posted to
 * the IDE's daily host rather than the public Generative Language endpoint,
 * and each SSE line arrives as `{"response": <GenerateContentResponse>}`.
 *
 * pi-ai's own `google-generative-ai` adapter cannot serve this — it delegates
 * transport to the Google GenAI SDK, which owns its URL and headers — so this
 * file reuses the shared request transforms (`convertMessages`,
 * `convertTools`, thinking-level resolvers) and mirrors that adapter's
 * chunk-to-event mapping over a hand-parsed SSE body, keeping the normalized
 * transcript identical to what a first-party Google route produces.
 *
 * The wire types are declared locally: pi-ai's shared helpers type their
 * inputs against `@google/genai`, which is pi-ai's dependency, not this
 * package's — the declarations below are the subset of that schema the wire
 * actually carries.
 *
 * @module dsh-llm-pi-ai/antigravity-stream
 */

import { createHash, randomUUID } from 'node:crypto'
import type {
  Api,
  AssistantMessage,
  AssistantMessageEventStream,
  JsonObject,
  Model,
  ModelThinkingLevel,
  ProviderHeaders,
  SimpleStreamOptions,
  StreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
  TranscriptContext,
} from '@earendil-works/pi-ai'
import { calculateCost, clampThinkingLevel } from '@earendil-works/pi-ai'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream'
import { formatProviderError, normalizeProviderError } from '@earendil-works/pi-ai/utils/error-body'
import { getSystemMessageText } from '@earendil-works/pi-ai/utils/text'
import { sanitizeSurrogates } from '@earendil-works/pi-ai/utils/sanitize-unicode'
import { collapseSystemMessages, getCurrentTools, getInitialSystemMessage } from '@earendil-works/pi-ai/utils/transcript'
import {
  convertMessages,
  convertTools,
  getDisabledGoogleThinkingConfig,
  isThinkingPart,
  mapStopReasonString,
  resolveGoogleFunctionCallingMode,
  resolveGoogleThinkingLevel,
  retainThoughtSignature,
  retryGoogleRequest,
  supportsGoogleStrictToolSampling,
  toGoogleThinkingLevel,
  usesGoogleThinkingLevel,
} from '@earendil-works/pi-ai/api/google-shared'
import { buildBaseOptions } from '@earendil-works/pi-ai/api/simple-options'

/** The IDE-facing host chat traffic goes to; auth/project discovery stays on the production host. */
export const ANTIGRAVITY_DAILY_HOST = 'https://daily-cloudcode-pa.googleapis.com'
/** The User-Agent the Antigravity IDE identifies itself with on every Code Assist call. */
export const ANTIGRAVITY_IDE_USER_AGENT = 'antigravity/ide/2.22.0 darwin/arm64'
/** The header {@link antigravityProvider}'s `toAuth` uses to hand the discovered project id to this stream. */
export const ANTIGRAVITY_PROJECT_HEADER = 'x-antigravity-project'
/** The header `toAuth` uses to hand the signed-in account email, which seeds the session id. */
export const ANTIGRAVITY_ACCOUNT_HEADER = 'x-antigravity-account'

/** Antigravity refuses output caps above its own ceiling. */
const MAX_OUTPUT_TOKENS = 64_000

/** The `GenerateContentRequest` part shape the wire carries — the subset this stream reads and writes. */
interface WirePart {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> }
}

/** The `Content` shape on the wire. */
interface WireContent {
  role?: string
  parts?: WirePart[]
}

/**
 * The `GenerateContentResponse` shape on the wire, as it arrives inside each
 * SSE `data:` line's `response` member.
 */
interface WireChunk {
  responseId?: string
  candidates?: { content?: { parts?: WirePart[] }; finishReason?: string | null }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
    cachedContentTokenCount?: number
    totalTokenCount?: number
  }
}

/**
 * The session id Code Assist expects is an integer string. A numeric session
 * id passes through; any other seed hashes to a stable negative int64, which
 * is how upstream clients pin a text session id to one signed integer.
 */
function numericSessionId(seed: string): string {
  if (/^-?\d+$/.test(seed)) return seed
  const digest = createHash('sha256').update(seed).digest()
  const value = digest.readBigUInt64BE(0) & 0x7fffffffffffffffn
  return `-${value.toString()}`
}

/** A v5-shaped uuid derived deterministically from a seed, as the IDE builds for its request ids. */
function uuidFromSeed(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest().subarray(0, 16)
  /* v8 ignore next -- a sha256 digest is 32 bytes; indexing a 16-byte slice never misses. */
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  /* v8 ignore next -- a sha256 digest is 32 bytes; indexing a 16-byte slice never misses. */
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The IDE's per-request id, `agent/<conversation>/<epoch-ms>/<trajectory>/<step>`:
 * conversation and trajectory are seeded by the session and model, so a
 * retried request is identifiable as its own step inside one trajectory.
 */
function ideRequestId(sessionId: string, model: string, contents: readonly unknown[]): string {
  const conversationId = uuidFromSeed(`antigravity:conversation:${sessionId}`)
  const trajectoryId = uuidFromSeed(`antigravity:trajectory:${sessionId}:${model}:agent`)
  const step = Math.max(1, contents.length * 2 - 1)
  return `agent/${conversationId}/${Date.now()}/${trajectoryId}/${step}`
}

/**
 * The thinking signature the IDE attaches to a replayed function call whose
 * history lost its signature. Gemini 3+ upstreams reject an unsigned first
 * call in a parallel group; this is the placeholder signature those clients
 * send.
 */
const DEFAULT_THOUGHT_SIGNATURE =
  'EuwGCukGAXLI2nxwZIq54WWSoL/YN0P3TsDZ7zRnLi8g0S4aVr2HUGxvaHKySuY6HAVzcE0GPGjXrytLIldxthSvfxgUlJh6Qa9Z+Oj5QZBlYdg6HaJ6yuY5R7waE6rdwBsRf7Ft2j3DJ9rMi9qhWFqApewYtPhls3VHtuvND3l8Rm09+lbAXQs6KKWEWrxNLKTBkfpMgXhRERc/TQRMZu1twAablm6/Zk1tsYRvfWKLsNbeKF+CCojJdXJKvnR/8Ouuoa+Y2Ti20hcW7aZIIjZDFYPU//k6Ybmhg69J/imbFai2ckhfLaisqdDkdoIiBJScTOUvYqP6AE9d4MsydSC+UlhIMk4hoP76R8vUSCZRMkjOaDXstf/QoVZKbt94wyRZgAJ1G0BqI8L5ow86kLpA4wJEtxsRGymOE4bKUvApveBakYDNM9APkf+LbtbzWSseGjoZcSlycF9iN8Q2XNYKRrHbv3Lr5Y8JjdH/5y/6SHkNehTEZugaeGnSPSyCTWto1kQgHpxdWmhkLfJGNUGLmue7Mesj4TSms4J33mRpYVhNB/J333FCqIP0hr/E7BkkjEn7yZ4X7SQlh+xKPurapsnHRwiKmtsilmEFrnTE9iQr+pMr6M29qqFNv1tr5yumbaJw8JW9sB15tNsRv+dW6BjNanbsKz7HCgKUBc8tGy+7YuhXzAfViyRefcjK7eZW0Fbyt7AbybJTKz78W8NH7ye6LAwzOebXpeZ4D43fNIt8bKh26qgduSQv/7o+pAflkuqHZ99YWgHQ8h8OkZFi3eOiSYjsjhdZ/czWOdoPI/OnqIldzMPF5YlrKBLFX8VhRKVmqgsmWf5PHGulHhMkVlS+XG2UIseGy69ARa93D78Gsa+1n1kJr7EEB7Rh+27vUMxVYLdz1yMSvE5nalTAlg/ZeG8+XQ0cHuAI3KbQpHW2Q++RdXfm5JzD5WdJZUU+Zn8t8UUn85BH4RxZLeE0qJikgSsKoYVBc6YhiMjhPgkR95ReimY4Z0xCJdRo1gjexOFeODZMpQF6Yxnoic7IrdgsFA3iePTbFnPp3IAM1fAThWhXJUn3QInUOTd5o1qmTmn6REbL15g/JQNl+dqUoPkhleeb2V3kjqp1okmO3wMZbPknR3S1LZNmlS72/iBQUm+n2b/RCn4PjmM2'

/**
 * The tier-indexed wire spellings of a model whose thinking tier travels
 * inside the model name, or `undefined` for one whose wire name is fixed.
 */
function tierUpstreamIds(model: Model<Api>): Readonly<Record<string, string>> | undefined {
  const ids = (model as { upstreamIds?: unknown }).upstreamIds
  return typeof ids === 'object' && ids !== null ? ids as Readonly<Record<string, string>> : undefined
}

/**
 * The model id the envelope names. A tiered model spells the request's
 * clamped level (`gemini-3.8-flash` at `low` signs in as
 * `gemini-3.8-flash-low(low)`); its `upstreamId` is the name the default tier
 * answers to. A model without the overrides answers its own id.
 */
function upstreamModelId(model: Model<Api>, tier: ModelThinkingLevel | undefined): string {
  const spelled = tier === undefined ? undefined : tierUpstreamIds(model)?.[tier]
  if (spelled !== undefined) return spelled
  const upstream = (model as { upstreamId?: unknown }).upstreamId
  return typeof upstream === 'string' && upstream.length > 0 ? upstream : model.id
}

/**
 * Project `contents` into the shape the Antigravity endpoint accepts: tool
 * results ride under `user` (Claude-via-Code-Assist rejects a `function`
 * role), thought-only history parts are dropped, and a function call that lost
 * its thought signature gets the placeholder one — Gemini 3+ refuses an
 * unsigned first call in a parallel group.
 */
function antigravityContents(model: Model<Api>, context: TranscriptContext): WireContent[] {
  const contents = convertMessages(model as Model<'google-generative-ai'>, context)
  return contents.map((content): WireContent => {
    const parts = content.parts?.filter(part => part.functionCall !== undefined || part.thought !== true)
    let firstCallSeen = false
    const signed = parts?.map((part): WirePart => {
      if (part.functionCall === undefined) return part
      const kept = part.thoughtSignature ?? (firstCallSeen ? undefined : DEFAULT_THOUGHT_SIGNATURE)
      firstCallSeen = true
      return { ...part, ...kept === undefined ? {} : { thoughtSignature: kept } }
    })
    const role = signed?.some(part => part.functionResponse !== undefined) ? 'user' : content.role
    return {
      /* v8 ignore next -- convertMessages always emits role on every content it returns. */
      ...role === undefined ? {} : { role },
      /* v8 ignore next -- convertMessages always emits parts on every content it returns. */
      ...signed === undefined ? {} : { parts: signed },
    }
  })
}

/**
 * The options the stream reads beyond `StreamOptions`: pi-ai resolves a
 * requested reasoning level into a `thinking` directive before dispatch.
 */
interface AntigravityStreamOptions extends StreamOptions {
  thinking?: { enabled: boolean; level?: string; budgetTokens?: number }
  /** The thinking tier a tiered model's wire name must spell; absent selects its default tier. */
  tier?: ModelThinkingLevel
  /** `ToolChoice` for the dispatching api, or an api-specific richer value — read string-only here. */
  toolChoice?: unknown
}

/**
 * The inner `GenerateContent`-shaped request, before the Code Assist envelope
 * wraps it. Kept close to pi-ai's own `buildParams` so a request here answers
 * the same fields one aimed at the public Gemini endpoint would.
 */
function antigravityRequest(
  model: Model<Api>,
  context: TranscriptContext,
  options: AntigravityStreamOptions,
): Record<string, unknown> {
  const contents = antigravityContents(model, context)
  const initialSystemMessage = getInitialSystemMessage(context.messages)
  const tools = getCurrentTools(context.messages)
  const generationConfig: Record<string, unknown> = {}
  if (options.temperature !== undefined) generationConfig['temperature'] = options.temperature
  if (options.maxTokens !== undefined) {
    generationConfig['maxOutputTokens'] = Math.min(options.maxTokens, MAX_OUTPUT_TOKENS)
  }
  // A tiered model carries its thinking level in the wire name — the
  // `thinkingConfig` block is skipped for it entirely, exactly as the fixed
  // non-reasoning entries sent none.
  if (options.thinking !== undefined && model.reasoning && tierUpstreamIds(model) === undefined) {
    const thinking = options.thinking
    if (thinking.enabled) {
      generationConfig['thinkingConfig'] = {
        includeThoughts: true,
        ...thinking.level !== undefined ? { thinkingLevel: thinking.level } : {},
        ...thinking.level === undefined && thinking.budgetTokens !== undefined
          ? { thinkingBudget: thinking.budgetTokens }
          : {},
      }
    } else {
      generationConfig['thinkingConfig'] = getDisabledGoogleThinkingConfig(model as Model<'google-generative-ai'>)
    }
  }
  const supportsStrictMode = supportsGoogleStrictToolSampling(model.id)
  const toolChoice = typeof options.toolChoice === 'string' ? options.toolChoice : undefined
  const functionCallingMode = tools.length > 0
    ? resolveGoogleFunctionCallingMode(tools, toolChoice, supportsStrictMode) ?? 'VALIDATED'
    : undefined
  const systemInstruction = initialSystemMessage === undefined
    ? ''
    : sanitizeSurrogates(getSystemMessageText(initialSystemMessage))
  return {
    contents,
    ...systemInstruction.length === 0 ? {} : { systemInstruction: { parts: [{ text: systemInstruction }] } },
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    // Code Assist reads the OpenAPI `parameters` field — `parametersJsonSchema`
    // is the AI-Studio-only spelling — which `useParameters` selects.
    ...(tools.length > 0 ? { tools: convertTools(tools, true, supportsStrictMode) } : {}),
    ...functionCallingMode === undefined ? {} : { toolConfig: { functionCallingConfig: { mode: functionCallingMode } } },
  }
}

/** The headers this stream must consume rather than forward — credential metadata, not HTTP. */
const CARRIER_HEADERS: ReadonlySet<string> = new Set([
  ANTIGRAVITY_PROJECT_HEADER,
  ANTIGRAVITY_ACCOUNT_HEADER,
])

/** Headers the request sends: auth plus the IDE user agent, minus carrier metadata. */
function requestHeaders(apiKey: string, extra: ProviderHeaders): Record<string, string> {
  const merged: Record<string, string | null> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': ANTIGRAVITY_IDE_USER_AGENT,
    ...Object.fromEntries(Object.entries(extra)
      .filter(([name]) => !CARRIER_HEADERS.has(name.toLowerCase()))),
  }
  return Object.fromEntries(Object.entries(merged)
    .flatMap(([name, value]) => value === null ? [] : [[name, value]]))
}

/**
 * Read one SSE body into `GenerateContentResponse` chunks. Each `data:` line
 * holds the Code Assist wrapper object; a bare `GenerateContentResponse` line
 * is accepted too, which is what keeps the parser honest if Google ever serves
 * the unwrapped stream.
 */
async function* sseChunks(
  body: ReadableStream<Uint8Array>,
  onChunk: ((chunk: WireChunk) => void) | undefined,
): AsyncGenerator<WireChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload.length === 0 || payload === '[DONE]') continue
        const parsed = JSON.parse(payload) as { response?: WireChunk }
        const chunk = parsed.response ?? (parsed as WireChunk)
        onChunk?.(chunk)
        yield chunk
      }
    }
  } finally {
    reader.releaseLock()
  }
}

let toolCallCounter = 0

/**
 * Stream one request. Mirrors pi-ai's `google-generative-ai` mapping event for
 * event so a transcript read downstream is indistinguishable from a
 * first-party Google route.
 */
export const antigravityStream = (
  model: Model<Api>,
  context: TranscriptContext,
  options?: AntigravityStreamOptions,
): AssistantMessageEventStream => {
  const events = createAssistantMessageEventStream()
  const normalizedContext = collapseSystemMessages(context)
  void (async () => {
    const output: AssistantMessage = {
      role: 'assistant',
      content: [],
      api: 'google-generative-ai',
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'pending',
      timestamp: Date.now(),
    }
    try {
      const apiKey = options?.apiKey
      if (options === undefined || apiKey === undefined || apiKey.length === 0) {
        throw new Error(`No API key for provider: ${model.provider}`)
      }
      const opts = options
      const inner = antigravityRequest(model, normalizedContext, opts)
      const request = await opts.onPayload?.(inner, model) ?? inner
      const sessionId = numericSessionId(
        opts.sessionId ?? opts.headers?.[ANTIGRAVITY_ACCOUNT_HEADER] ?? randomUUID())
      const wire = upstreamModelId(model, opts.tier)
      const project = opts.headers?.[ANTIGRAVITY_PROJECT_HEADER]
      const envelope = {
        // A credential that never learned its project still sends one — the
        // generated placeholder is what upstream clients do for accounts the
        // discovery call could not provision.
        project: typeof project === 'string' && project.length > 0 ? project : `rising-${randomUUID().slice(0, 8)}`,
        model: wire,
        userAgent: 'antigravity',
        requestId: ideRequestId(sessionId, wire, (request as { contents?: unknown[] }).contents ?? []),
        request: { ...(request as Record<string, unknown>), sessionId },
      }
      const response = await retryGoogleRequest(
        () => fetch(`${ANTIGRAVITY_DAILY_HOST}/v1internal:streamGenerateContent?alt=sse`, {
          method: 'POST',
          headers: requestHeaders(apiKey, { ...model.headers, ...opts.headers }),
          body: JSON.stringify(envelope),
          signal: opts.signal ?? null,
          redirect: 'error',
        }),
        {
          ...opts.maxRetries === undefined ? {} : { maxRetries: opts.maxRetries },
          ...opts.maxRetryDelayMs === undefined ? {} : { maxRetryDelayMs: opts.maxRetryDelayMs },
          ...opts.signal === undefined ? {} : { signal: opts.signal },
        },
      )
      await opts.onResponse?.(
        { status: response.status, headers: Object.fromEntries(response.headers.entries()) },
        model,
      )
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Antigravity answered ${String(response.status)}${body.length > 0 ? `: ${body.slice(0, 400)}` : ''}`)
      }
      if (response.body === null) throw new Error('Antigravity answered with an empty body')
      events.push({ type: 'start', partial: output })
      let currentBlock: TextContent | ThinkingContent | null = null
      const blocks = output.content
      const blockIndex = () => blocks.length - 1
      for await (const chunk of sseChunks(response.body, (chunk) => { void opts.onProviderStreamEvent?.(chunk, model) })) {
        if (chunk.responseId !== undefined) output.responseId ??= chunk.responseId
        const candidate = chunk.candidates?.[0]
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text !== undefined) {
              const thinking = isThinkingPart(part)
              if (currentBlock === null
                || (thinking && currentBlock.type !== 'thinking')
                || (!thinking && currentBlock.type !== 'text')) {
                if (currentBlock !== null) {
                  events.push(currentBlock.type === 'text'
                    ? { type: 'text_end', contentIndex: blockIndex(), content: currentBlock.text, partial: output }
                    : { type: 'thinking_end', contentIndex: blockIndex(), content: currentBlock.thinking, partial: output })
                }
                if (thinking) {
                  currentBlock = { type: 'thinking', thinking: '' }
                  output.content.push(currentBlock)
                  events.push({ type: 'thinking_start', contentIndex: blockIndex(), partial: output })
                } else {
                  currentBlock = { type: 'text', text: '' }
                  output.content.push(currentBlock)
                  events.push({ type: 'text_start', contentIndex: blockIndex(), partial: output })
                }
              }
              if (currentBlock.type === 'thinking') {
                currentBlock.thinking += part.text
                const signature = retainThoughtSignature(currentBlock.thinkingSignature, part.thoughtSignature)
                if (signature !== undefined) currentBlock.thinkingSignature = signature
                events.push({ type: 'thinking_delta', contentIndex: blockIndex(), delta: part.text, partial: output })
              } else {
                currentBlock.text += part.text
                const signature = retainThoughtSignature(currentBlock.textSignature, part.thoughtSignature)
                if (signature !== undefined) currentBlock.textSignature = signature
                events.push({ type: 'text_delta', contentIndex: blockIndex(), delta: part.text, partial: output })
              }
            }
            if (part.functionCall !== undefined) {
              if (currentBlock !== null) {
                events.push(currentBlock.type === 'text'
                  ? { type: 'text_end', contentIndex: blockIndex(), content: currentBlock.text, partial: output }
                  : { type: 'thinking_end', contentIndex: blockIndex(), content: currentBlock.thinking, partial: output })
                currentBlock = null
              }
              const providedId = part.functionCall.id
              const needsNewId = providedId === undefined
                || output.content.some(block => block.type === 'toolCall' && block.id === providedId)
              const toolCall: ToolCall = {
                type: 'toolCall',
                id: needsNewId ? `${part.functionCall.name ?? 'tool'}_${String(Date.now())}_${String(++toolCallCounter)}` : providedId,
                name: part.functionCall.name ?? '',
                arguments: (part.functionCall.args ?? {}) as JsonObject,
                ...part.thoughtSignature === undefined ? {} : { thoughtSignature: part.thoughtSignature },
              }
              output.content.push(toolCall)
              events.push({ type: 'toolcall_start', contentIndex: blockIndex(), partial: output })
              events.push({
                type: 'toolcall_delta', contentIndex: blockIndex(), delta: JSON.stringify(toolCall.arguments), partial: output,
              })
              events.push({ type: 'toolcall_end', contentIndex: blockIndex(), toolCall, partial: output })
            }
          }
        }
        if (candidate?.finishReason !== undefined && candidate.finishReason !== null) {
          output.rawStopReason = candidate.finishReason
          output.stopReason = mapStopReasonString(candidate.finishReason)
          if (output.content.some(block => block.type === 'toolCall') && output.stopReason === 'stop') {
            output.stopReason = 'toolUse'
          }
        }
        if (chunk.usageMetadata !== undefined) {
          output.usage = {
            input: (chunk.usageMetadata.promptTokenCount ?? 0) - (chunk.usageMetadata.cachedContentTokenCount ?? 0),
            output: (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0),
            cacheRead: chunk.usageMetadata.cachedContentTokenCount ?? 0,
            cacheWrite: 0,
            reasoning: chunk.usageMetadata.thoughtsTokenCount ?? 0,
            totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          }
          calculateCost(model, output.usage)
        }
      }
      if (currentBlock !== null) {
        events.push(currentBlock.type === 'text'
          ? { type: 'text_end', contentIndex: blockIndex(), content: currentBlock.text, partial: output }
          : { type: 'thinking_end', contentIndex: blockIndex(), content: currentBlock.thinking, partial: output })
      }
      if (opts.signal?.aborted === true) throw new Error('Request was aborted')
      if (output.stopReason === 'pending') throw new Error('Antigravity stream ended without a finish reason')
      if (output.stopReason === 'aborted' || output.stopReason === 'error') {
        /* v8 ignore next -- 'aborted'/'error' only derive from a finishReason, which sets rawStopReason. */
        throw new Error(output.rawStopReason ?? 'An unknown error occurred')
      }
      events.push({ type: 'done', reason: output.stopReason, message: output })
      events.end()
    } catch (error: unknown) {
      output.stopReason = options?.signal?.aborted === true ? 'aborted' : 'error'
      output.errorMessage = formatProviderError(normalizeProviderError(error))
      events.push({ type: 'error', reason: output.stopReason, error: output })
      events.end()
    }
  })()
  return events
}

/**
 * `streamSimple` — the entry point `Models` calls. Resolves pi-ai's reasoning
 * level into the provider's thinking directive exactly as the first-party
 * Google adapter does, then delegates to {@link antigravityStream}.
 */
export const antigravityStreamSimple = (
  model: Model<Api>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
  const apiKey = options?.apiKey
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error(`No API key for provider: ${model.provider}`)
  }
  const base: AntigravityStreamOptions = {
    ...buildBaseOptions(model, context, options, apiKey),
    ...options?.toolChoice === undefined ? {} : { toolChoice: options.toolChoice },
  }
  // A tiered model's reasoning is dispatched into the wire name; the clamped
  // level selects the spelling, and an unrequested level keeps the default.
  const tiers = tierUpstreamIds(model)
  if (tiers !== undefined) {
    const tier = options?.reasoning === undefined
      ? undefined
      : clampThinkingLevel(model, options.reasoning)
    return antigravityStream(model, context, { ...base, ...tier === undefined ? {} : { tier } })
  }
  if (options?.reasoning === undefined) {
    return antigravityStream(model, context, { ...base, thinking: { enabled: false } })
  }
  const clamped = clampThinkingLevel(model, options.reasoning)
  if (clamped === 'off') {
    return antigravityStream(model, context, { ...base, thinking: { enabled: false } })
  }
  const resolved = resolveGoogleThinkingLevel(model as Model<'google-generative-ai'>, clamped)
  if (usesGoogleThinkingLevel(model as Model<'google-generative-ai'>)) {
    return antigravityStream(model, context, { ...base, thinking: { enabled: true, level: toGoogleThinkingLevel(resolved) } })
  }
  return antigravityStream(model, context, { ...base, thinking: { enabled: true } })
}
