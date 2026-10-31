import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import { once } from 'node:events'
import { start } from './server.mjs'

let server
let port

before(async () => {
  server = start(0)
  await once(server, 'listening')
  port = server.address().port
})

after(() => new Promise((resolve) => { server.close(resolve) }))

/** Send one request and resolve its status code. */
function send({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      res.resume()
      res.on('end', () => { resolve(res.statusCode) })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

test('serves the editor to the expected host', async () => {
  assert.equal(await send(), 200)
})

test('rejects a spoofed Host header (DNS rebinding)', async () => {
  assert.equal(await send({ headers: { host: 'evil.example' } }), 403)
})

test('rejects a save without a JSON content type', async () => {
  assert.equal(await send({
    method: 'POST', path: '/api/save', headers: { 'content-type': 'text/plain' }, body: '{}',
  }), 403)
})

test('rejects a save from a foreign Origin', async () => {
  assert.equal(await send({
    method: 'POST',
    path: '/api/save',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: '{}',
  }), 403)
})

test('rejects a save body above 1 MiB', async () => {
  const body = 'x'.repeat(1024 * 1024 + 1)
  assert.equal(await send({
    method: 'POST',
    path: '/api/save',
    headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
    body,
  }), 413)
})

test('accepts a well-formed save and reports an unknown entry', async () => {
  assert.equal(await send({
    method: 'POST',
    path: '/api/save',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entryId: 'missing', key: 'k', value: 'v', expected: null }),
  }), 404)
})
