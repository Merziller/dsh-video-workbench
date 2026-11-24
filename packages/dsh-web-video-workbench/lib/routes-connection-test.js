/**
 * 「测试连接」 REST routes — check a cloud connection with the values typed in a settings form (before saving), without
 * generating anything (dsh-tool-media/cloud-connection-test.js):
 *   POST /api/video-workbench/cloud-media/test   { category: 'image'|'video'|'audio', config }  → result
 *   POST /api/video-workbench/connection-test    { target, … }                                  → result
 *        target 'cloud-media' { category, config } · 'tts-builtin' { engineId, config } · 'tts-custom' { engine }
 *               'avatar-provider' { config } · 'lipsync-cloud' {} · 'stock' { provider, apiKey }
 * result = { ok, verdict, level: ok|warn|error|info, title, message, status, keyValid, keySource, billable: false,
 *            notes[], checks[] } (HTTP 200 for every finished test; 400 for malformed input). A key field left empty or
 * masked means "use the saved key" (read server-side, never returned). Registered in index.js; allow-listed for the
 * panel kit (client.js KIT_API_POST, no host refresh afterwards).
 */
import { runConnectionTest } from '../../dsh-tool-media/cloud-connection-test.js'

export const CONNECTION_TEST_ROUTES = Object.freeze([
  { path: '/api/video-workbench/cloud-media/test', methods: ['POST'] },
  { path: '/api/video-workbench/connection-test', methods: ['POST'] },
])

const PATHS = new Set(CONNECTION_TEST_ROUTES.map((r) => r.path))

export function isConnectionTestRoute(pathname) {
  return PATHS.has(pathname)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function readBody(req) {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  } catch {
    return {}
  }
}

/**
 * Returns a Response for the connection-test routes, or null when the path is not one of them.
 * @param {Request} req
 * @param {URL} [url]
 * @param {{ fetchImpl?: Function, timeoutMs?: number }} [opts] test hooks
 */
export async function handleConnectionTestApiRequest(req, url = new URL(req.url, 'http://localhost'), opts = {}) {
  if (!isConnectionTestRoute(url.pathname)) return null
  if (req.method !== 'POST') return json({ ok: false, error: `不支持的请求方法 ${req.method}` }, 405)
  const body = await readBody(req)
  const payload = url.pathname.endsWith('/cloud-media/test') ? { ...body, target: 'cloud-media' } : body
  try {
    const result = await runConnectionTest(payload, { ...opts, signal: req.signal })
    return json(result)
  } catch (err) {
    const status = err?.expose === true && Number(err?.status) >= 400 && Number(err?.status) < 500 ? Number(err.status) : 500
    return json({ ok: false, error: scrubTyped(String(err?.message || err), payload) }, status)
  }
}

/** an unexpected error message must never carry a key the user typed into the form */
function scrubTyped(text, payload) {
  const secrets = []
  const collect = (o) => {
    if (!o || typeof o !== 'object') return
    for (const k of ['apiKey', 'token']) if (typeof o[k] === 'string' && o[k].trim().length >= 4) secrets.push(o[k].trim(), ...o[k].trim().split(':'))
  }
  collect(payload)
  collect(payload?.config)
  collect(payload?.engine)
  let out = text
  for (const s of secrets.filter((x) => x.length >= 4).sort((a, b) => b.length - a.length)) out = out.split(s).join('***')
  return out
}
