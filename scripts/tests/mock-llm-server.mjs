/**
 * Offline stand-in for the four model wire protocols the plugin speaks (used by vision-capability.test.mjs and
 * llm-timeout.test.mjs — no network, no keys, no paid calls). Request paths are exactly the ones llm-client.js builds
 * for a base URL of `<mock>/v1`:
 *   openai-completions  POST /v1/chat/completions
 *   anthropic-messages  POST /v1/messages
 *   openai-responses    POST /v1/responses                     (answered as an SSE stream: the plugin asks stream: true)
 *   gemini-native       POST /v1/models/<model>:generateContent
 *
 * Every request is recorded as { protocol, path, headers, body, model, images, text }. `respond(rec)` decides the answer:
 *   { text }                    a normal reply in that protocol's shape
 *   { status, error }           an API error inside that protocol's error envelope
 *   { status, raw, type }       a raw body (e.g. a plain-text 422 from a relay)
 *   { delayMs }                 combined with any of the above: answer later
 */
import http from 'node:http'

export function protocolOf(path) {
  const p = String(path || '').split('?')[0]
  if (/\/chat\/completions$/.test(p)) return 'openai-completions'
  if (/\/messages$/.test(p)) return 'anthropic-messages'
  if (/\/responses$/.test(p)) return 'openai-responses'
  if (/\/models\/[^/]+:(generateContent|streamGenerateContent)$/.test(p)) return 'gemini-native'
  return ''
}

/** Every picture part in a request body, in the protocol's own shape (so tests can assert the exact encoding). */
export function extractImages(protocol, body) {
  const out = []
  const b = body && typeof body === 'object' ? body : {}
  if (protocol === 'gemini-native') {
    for (const c of b.contents || []) for (const p of c?.parts || []) if (p && (p.inlineData || p.inline_data || p.fileData || p.file_data)) out.push(p)
    return out
  }
  if (protocol === 'openai-responses') {
    for (const m of b.input || []) for (const p of Array.isArray(m?.content) ? m.content : []) if (p?.type === 'input_image') out.push(p)
    return out
  }
  for (const m of b.messages || []) {
    for (const p of Array.isArray(m?.content) ? m.content : []) {
      if (p && (p.type === 'image_url' || p.type === 'image')) out.push(p)
    }
  }
  return out
}

/** All text the model would read (system + messages), joined — enough for a mock to tell requests apart. */
export function extractText(protocol, body) {
  const b = body && typeof body === 'object' ? body : {}
  const bits = []
  const add = (x) => {
    if (typeof x === 'string') bits.push(x)
  }
  if (protocol === 'gemini-native') {
    for (const p of b.systemInstruction?.parts || []) add(p?.text)
    for (const c of b.contents || []) for (const p of c?.parts || []) add(p?.text)
  } else if (protocol === 'openai-responses') {
    add(b.instructions)
    for (const m of b.input || []) {
      if (typeof m?.content === 'string') add(m.content)
      else for (const p of m?.content || []) add(p?.text)
    }
  } else {
    add(b.system)
    for (const m of b.messages || []) {
      if (typeof m?.content === 'string') add(m.content)
      else for (const p of m?.content || []) add(p?.text)
    }
  }
  return bits.join('\n')
}

function modelOf(protocol, path, body) {
  if (protocol === 'gemini-native') return decodeURIComponent(/\/models\/([^/:]+):/.exec(path)?.[1] || '')
  return String(body?.model || '')
}

function replyBody(protocol, model, text) {
  if (protocol === 'anthropic-messages') {
    return { id: 'msg_mock', type: 'message', role: 'assistant', model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }
  }
  if (protocol === 'gemini-native') {
    return { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, modelVersion: model }
  }
  return { id: 'chatcmpl-mock', object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
}

function responsesStream(model, text) {
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`
  const half = Math.ceil(text.length / 2)
  return [
    ev({ type: 'response.created', response: { id: 'resp_mock', object: 'response', status: 'in_progress', model } }),
    ev({ type: 'response.output_text.delta', delta: text.slice(0, half) }),
    ev({ type: 'response.output_text.delta', delta: text.slice(half) }),
    ev({
      type: 'response.completed',
      response: { id: 'resp_mock', object: 'response', status: 'completed', model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] },
    }),
  ].join('')
}

function errorBody(protocol, status, message) {
  if (protocol === 'anthropic-messages') return { type: 'error', error: { type: 'invalid_request_error', message } }
  if (protocol === 'gemini-native') return { error: { code: status, message, status: 'INVALID_ARGUMENT' } }
  return { error: { message, type: 'invalid_request_error', param: null, code: null } }
}

/**
 * Start the mock on 127.0.0.1 (random port). Returns { url (base URL incl. /v1), origin, requests, reset(), close() }.
 * `respond(rec)` may be async; returning nothing gives a 500.
 */
export async function startMockLlm(respond) {
  const requests = []
  const sockets = new Set()
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', async () => {
      const path = req.url || ''
      const protocol = protocolOf(path)
      let body = null
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
      } catch {}
      const rec = {
        protocol,
        path,
        method: req.method,
        headers: { ...req.headers },
        body,
        model: modelOf(protocol, path, body),
        images: extractImages(protocol, body),
        text: extractText(protocol, body),
        at: Date.now(),
      }
      requests.push(rec)
      let plan = null
      try {
        plan = protocol && req.method === 'POST' ? await respond(rec) : { status: 404, error: `no such route: ${path}` }
      } catch (err) {
        plan = { status: 500, error: String(err?.message || err) }
      }
      plan = plan || { status: 500, error: 'mock has no answer' }
      if (plan.delayMs) await new Promise((r) => setTimeout(r, plan.delayMs))
      if (res.destroyed || res.writableEnded) return
      const status = Number(plan.status) || 200
      if (plan.raw !== undefined) {
        res.writeHead(status, { 'content-type': plan.type || 'text/plain; charset=utf-8' })
        res.end(String(plan.raw))
        return
      }
      if (status >= 400) {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(errorBody(protocol, status, String(plan.error || 'error'))))
        return
      }
      const text = String(plan.text ?? '')
      if (protocol === 'openai-responses') {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' })
        res.end(responsesStream(rec.model, text))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(replyBody(protocol, rec.model, text)))
    })
  })
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return {
    origin,
    url: `${origin}/v1`,
    requests,
    reset: () => {
      requests.length = 0
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy()
        server.close(() => resolve())
      }),
  }
}

/** The isolated environment every LLM test runs in: scratch DSH_VIDEO_HOME, an empty .env, no DSH client, no model env. */
export const MODEL_ENV_VARS = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN',
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_API_BASE', 'OPENAI_MODEL',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_BASE_URL', 'GEMINI_MODEL',
  'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'OPENROUTER_MODEL',
  'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_PROVIDER', 'LLM_FORMAT',
  'DSH_VIDEO_HOST_AGENT', 'DSH_VIDEO_HOST_AGENT_VERSION', 'DSH_LLM_TIMEOUT_MS',
]
