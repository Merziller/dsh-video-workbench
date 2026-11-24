#!/usr/bin/env node
/**
 * 「测试连接」 for every cloud connection (packages/dsh-tool-media/cloud-connection-test.js + routes-connection-test.js).
 *
 *   node scripts/tests/cloud-connection-test.test.mjs [--keep]
 *
 * Offline and self-contained: local mock HTTP servers on random 127.0.0.1 ports emulate each provider preset's check
 * endpoint (200 / 401 / 403 / 404 / HTML page / provider error codes / hang → timeout / closed port); every other host
 * is blocked. Asserts the verdict, the plain-Chinese result, that typed / masked / saved keys are picked correctly, that
 * no key ever appears in a result, that no generation endpoint is ever hit (only GET queries, MiniMax's voice-list
 * POST and Doubao's EMPTY-text request), plus the HTTP routes, the panel allow-list and the MCP tool action.
 *
 * Scratch data only (<repo>/.tmp/conn-test/<stamp>: isolated DSH_VIDEO_HOME / WORKSPACE / ENV / cloud-media config).
 */
import { createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const KEEP = process.argv.includes('--keep')
const SCR = join(ROOT, '.tmp', 'conn-test', new Date().toISOString().replace(/[:.]/g, '-'))
for (const d of ['home', 'ws']) mkdirSync(join(SCR, d), { recursive: true })
writeFileSync(join(SCR, 'test.env'), '# scratch .env for the connection tests\n')
for (const v of ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'MINIMAX_API_KEY', 'AVATAR_API_KEY', 'AVATAR_ENDPOINT', 'FAL_KEY', 'AVATAR_LIPSYNC_CLOUD_API_KEY']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: join(SCR, 'test.env'),
  DSH_VIDEO_HOME: join(SCR, 'home'),
  DSH_VIDEO_WORKSPACE: join(SCR, 'ws'),
  DSH_VIDEO_CLOUD_MEDIA_CONFIG: join(SCR, 'cloud-media.json'),
})

/* ------------------------------------------------------------------------------------------------ network guard */
const realFetch = globalThis.fetch
const BLOCKED = []
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (new URL(url).hostname !== '127.0.0.1') {
    BLOCKED.push(url)
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  }
  return realFetch(input, init)
}

/* ------------------------------------------------------------------------------------------------ harness */
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail ? `  — ${String(detail).slice(0, 600)}` : ''}`)
}
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const conn = await imp('packages/dsh-tool-media/cloud-connection-test.js')
const cloud = await imp('packages/dsh-tool-media/cloud-media.js')

const KEYS = {
  openai: 'sk-test-openai-VALID-0123456789abcdef',
  openaiWrong: 'sk-test-openai-WRONG-9876543210fedcba',
  ark: 'ark-test-VALID-0123456789abcdef',
  bfl: 'bfl-test-VALID-0123456789',
  fal: 'falkeyid0001:fal-test-secret-VALID-0123',
  klingAk: 'klingtestAK0123456789',
  klingSk: 'klingtestSK0123456789abcdef',
  klingBearer: 'eyJklingTestBearerToken.VALID.0123456789',
  minimax: 'eyJminimax-test-VALID-0123456789',
  minimaxBroke: 'eyJminimax-test-BROKE-0123456789',
  suno: 'suno-test-VALID-0123456789',
  eleven: 'eleven-test-VALID-0123456789',
  elevenRestricted: 'eleven-test-RESTRICTED-0123456789',
  doubaoApp: '8800123456',
  doubaoToken: 'doubao-test-token-VALID-0123456789',
  custom: 'custom-test-VALID-0123456789',
  avatar: 'avatar-test-VALID-0123456789',
  pexels: 'pexels-test-VALID-0123456789abcdefgh',
}
const ALL_SECRETS = Object.entries(KEYS)
  .filter(([k]) => k !== 'doubaoApp')
  .flatMap(([, v]) => [v, ...v.split(':').filter((p) => p.length >= 8)])
/** no secret (whole or AK / SK / token part) anywhere in a result */
const leaks = (res) => {
  const s = JSON.stringify(res)
  return ALL_SECRETS.filter((k) => s.includes(k))
}

/* ------------------------------------------------------------------------------------------------ mock providers */
const GEN_HITS = []
/** anything but a GET query (and the two explicitly free POST checks) would be a generation request */
function checkGeneration(name, hit) {
  if (hit.method === 'GET' || hit.method === 'HEAD') return
  if (hit.path.endsWith('/v1/get_voice')) return // MiniMax voice list (a query)
  if (hit.path.endsWith('/api/v1/tts')) {
    let text = null
    try {
      text = JSON.parse(hit.body).request.text
    } catch {}
    if (text === '') return // Doubao: empty text is rejected before any synthesis
  }
  GEN_HITS.push(`${name} ${hit.method} ${hit.path}`)
}
const servers = []
async function mock(name, handler) {
  const hits = []
  const srv = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const u = new URL(req.url, 'http://127.0.0.1')
    const hit = { method: req.method, path: u.pathname, q: Object.fromEntries(u.searchParams), headers: req.headers, body: Buffer.concat(chunks).toString('utf8') }
    hits.push(hit)
    checkGeneration(name, hit)
    let out
    try {
      out = await handler(hit)
    } catch (err) {
      out = { status: 500, json: { error: String(err?.message || err) } }
    }
    if (out === 'hang') return
    res.statusCode = out.status || 200
    if (out.html !== undefined) {
      res.setHeader('content-type', 'text/html; charset=utf-8')
      res.end(out.html)
    } else if (out.text !== undefined) {
      res.setHeader('content-type', out.type || 'text/plain; charset=utf-8')
      res.end(out.text)
    } else {
      res.setHeader('content-type', out.type || 'application/json')
      res.end(JSON.stringify(out.json ?? {}))
    }
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  servers.push(srv)
  return { base: `http://127.0.0.1:${srv.address().port}`, hits, port: srv.address().port }
}
const bearer = (h) => String(h.authorization || '').replace(/^Bearer\s+/i, '')
const S = { openaiPublic: false, openaiModels: ['gpt-image-1', 'dall-e-3'], falNoPricing: false }

const openai = await mock('openai', (h) => {
  const k = bearer(h.headers)
  const bad = { status: 401, json: { error: { message: `Incorrect API key provided: ${k}. You can find your API key at the dashboard.`, type: 'invalid_request_error', code: 'invalid_api_key' } } }
  if (h.path === '/v1/models') {
    if (!S.openaiPublic && k !== KEYS.openai) return bad
    return { json: { object: 'list', data: S.openaiModels.map((id) => ({ id, object: 'model' })) } }
  }
  if (h.path.startsWith('/v1/videos/generations/')) return k === KEYS.openai ? { status: 404, json: { error: { message: 'task not found' } } } : bad
  return { status: 404, json: { error: { message: 'Unknown request URL' } } }
})
const ark = await mock('ark', (h) => {
  const ok = bearer(h.headers) === KEYS.ark
  const bad = { status: 401, json: { error: { code: 'AuthenticationError', message: 'the API key or AK/SK in the request is missing or invalid' } } }
  if (h.path === '/api/v3/contents/generations/tasks' && h.method === 'GET') return ok ? { json: { items: [], total: 0 } } : bad
  if (h.path.startsWith('/api/v3/contents/generations/tasks/')) return ok ? { status: 404, json: { error: { code: 'ResourceNotFound', message: 'The specified task is not found' } } } : bad
  return { status: 404, json: { error: { code: 'NotFound' } } }
})
const bfl = await mock('bfl', (h) => {
  const ok = h.headers['x-key'] === KEYS.bfl
  const bad = { status: 403, json: { detail: 'Not authenticated - Invalid Authentication' } }
  if (h.path === '/v1/credits') return ok ? { json: { credits: 12.5 } } : bad
  if (h.path === '/v1/get_result') return ok ? { json: { id: h.q.id, status: 'Task not found', result: null } } : bad
  return { status: 404, json: { detail: 'Not Found' } }
})
const fal = await mock('fal', (h) => {
  const ok = h.headers.authorization === `Key ${KEYS.fal}`
  if (h.path === '/v1/models/pricing') {
    if (S.falNoPricing) return { status: 404, json: { detail: 'Not Found' } }
    return ok
      ? { json: { prices: [{ endpoint_id: h.q.endpoint_id, unit_price: 0.003, unit: 'image', currency: 'USD' }], next_cursor: null, has_more: false } }
      : { status: 401, json: { error: { type: 'authorization_error', message: 'Authentication required' } } }
  }
  if (/^\/fal-ai\/[^/]+\/requests\/[^/]+\/status$/.test(h.path)) return ok ? { status: 404, json: { detail: 'Request not found' } } : { status: 401, json: { detail: 'No user found for Key ID and Secret' } }
  return { status: 404, json: { detail: 'Not Found' } }
})
function klingAuthOk(auth) {
  const tok = String(auth || '').replace(/^Bearer\s+/i, '')
  if (tok === KEYS.klingBearer) return true
  const [hd, pl, sig] = tok.split('.')
  if (!sig) return false
  if (createHmac('sha256', KEYS.klingSk).update(`${hd}.${pl}`).digest('base64url') !== sig) return false
  return JSON.parse(Buffer.from(pl, 'base64url').toString()).iss === KEYS.klingAk
}
const kling = await mock('kling', (h) => {
  if (!klingAuthOk(h.headers.authorization)) return { status: 401, json: { code: 1002, message: 'Authorization is invalid', request_id: 'r1' } }
  if (h.path === '/account/costs') return { json: { code: 0, message: 'SUCCEED', data: { code: 0, resource_pack_subscribe_infos: [{ resource_pack_name: 'pack', status: 'online', remaining_quantity: 88 }] } } }
  if (h.path.startsWith('/v1/videos/text2video/') || h.path.startsWith('/v1/images/generations/')) return { status: 400, json: { code: 1201, message: 'task not found' } }
  return { status: 404, json: { code: 1203, message: 'resource not found' } }
})
const minimax = await mock('minimax', (h) => {
  const k = bearer(h.headers)
  const authFail = { json: { base_resp: { status_code: 1004, status_msg: 'login fail: Please carry the API secret key in the Authorization field of the request header' } } }
  if (h.path === '/v1/get_voice') {
    if (k === KEYS.minimaxBroke) return { json: { base_resp: { status_code: 1008, status_msg: 'insufficient balance' } } }
    if (k !== KEYS.minimax) return authFail
    return { json: { system_voice: [{ voice_id: 'male-qn-qingse', voice_name: '青涩青年' }], voice_cloning: [], base_resp: { status_code: 0, status_msg: 'success' } } }
  }
  if (h.path === '/v1/query/video_generation') return k === KEYS.minimax ? { json: { base_resp: { status_code: 2013, status_msg: 'invalid params' } } } : authFail
  return { status: 404, json: {} }
})
const suno = await mock('suno', (h) => {
  const ok = bearer(h.headers) === KEYS.suno
  if (h.path === '/api/v1/generate/credit') return ok ? { json: { code: 200, msg: 'success', data: 120 } } : { json: { code: 401, msg: 'Unauthorized' } }
  if (h.path.startsWith('/suno/fetch/')) return ok ? { json: { code: 'task_not_exist', message: 'task_not_exist' } } : { status: 401, json: { error: { message: '无效的令牌' } } }
  return { status: 404, json: {} }
})
const eleven = await mock('eleven', (h) => {
  const k = h.headers['xi-api-key']
  const invalid = { status: 401, json: { detail: { status: 'invalid_api_key', message: 'Invalid API key' } } }
  if (h.path === '/v1/user') {
    if (k === KEYS.eleven) return { json: { subscription: { tier: 'starter', character_count: 1200, character_limit: 10000 } } }
    if (k === KEYS.elevenRestricted) return { status: 401, json: { detail: { status: 'missing_permissions', message: 'The API key you used is missing the permission user_read to execute this operation.' } } }
    return invalid
  }
  if (h.path === '/v1/models') return k === KEYS.eleven || k === KEYS.elevenRestricted ? { json: [{ model_id: 'eleven_multilingual_v2' }] } : invalid
  return { status: 404, json: {} }
})
const DOUBAO_TEXTS = []
const doubao = await mock('doubao', (h) => {
  let b = {}
  try {
    b = JSON.parse(h.body)
  } catch {}
  DOUBAO_TEXTS.push(b?.request?.text)
  const tok = String(h.headers.authorization || '').replace(/^Bearer;/, '')
  if (tok !== KEYS.doubaoToken || b?.app?.appid !== KEYS.doubaoApp) return { status: 401, json: { reqid: b?.request?.reqid, code: 3001, message: 'authenticate request: load grant: requested grant not found', sequence: 0 } }
  if (!String(b?.request?.text || '').trim()) return { status: 400, json: { reqid: b?.request?.reqid, code: 3011, message: 'illegal input text!', sequence: 0 } }
  return { json: { code: 3000, message: 'Success', data: 'AAAA' } }
})
const customAuth = await mock('custom-auth', (h) => {
  if (bearer(h.headers) !== KEYS.custom) return { status: 401, json: { error: 'invalid token' } }
  if (h.path === '/gen') return { status: 405, json: { detail: 'Method Not Allowed' } }
  if (h.path.startsWith('/tasks/')) return { status: 404, json: { error: 'task not found' } }
  return { status: 404, json: { error: 'not found' } }
})
const customPublic = await mock('custom-public', (h) => (h.path === '/gen' ? { status: 405, json: { detail: 'Method Not Allowed' } } : { status: 404, json: { detail: 'Not Found' } }))
const kokoro = await mock('kokoro', (h) => {
  if (h.path === '/v1/models') return { json: { object: 'list', data: [{ id: 'kokoro' }] } }
  if (h.path === '/v1/audio/speech') return { status: 405, json: { detail: 'Method Not Allowed' } }
  return { status: 404, json: { detail: 'Not Found' } }
})
const avatarSrv = await mock('avatar', (h) => {
  if (bearer(h.headers) !== KEYS.avatar) return { status: 401, json: { detail: 'Invalid token' } }
  if (h.path === '/api/generate_avatar') return { status: 405, json: { detail: 'Method Not Allowed' } }
  return { status: 404, json: { detail: 'Not Found' } }
})
const htmlSite = await mock('html', () => ({ html: '<!DOCTYPE html><html><head><title>Console</title></head><body><div id="app"></div></body></html>' }))
const allNotFound = await mock('notfound', () => ({ status: 404, html: '<!DOCTYPE html><html><body>Cannot GET</body></html>' }))
const serverErr = await mock('server-error', () => ({ status: 503, json: { error: { message: 'upstream unavailable' } } }))
const rateLimited = await mock('ratelimit', () => ({ status: 429, json: { error: { message: 'Too many requests' } } }))
const hang = await mock('hang', () => 'hang')
const closed = await mock('closed', () => ({ json: {} }))
await new Promise((r) => servers.pop().close(r)) // the closed-port server: connections are refused now

/* ------------------------------------------------------------------------------------------------ helpers */
const T = { timeoutMs: 4000 }
const media = (category, config, extra = {}) => conn.testCloudMediaConnection({ category, config, saved: {}, ...T, ...extra })
const hasMethodsOnly = (srv, methods) => srv.hits.every((h) => methods.includes(h.method))

/* ================================================================================================ cloud media presets */
{
  S.openaiModels = ['gpt-image-1', 'dall-e-3']
  const r = await media('image', { providerId: 'openai-image', protocol: 'openai-image', baseUrl: `${openai.base}/v1`, model: 'gpt-image-1', apiKey: KEYS.openai })
  check('OpenAI-compatible image: valid typed key → ✅ 密钥有效', r.verdict === 'valid' && r.level === 'ok' && r.ok && r.keyValid === true && r.title.startsWith('✅ 连接成功：密钥有效（未生成内容，不扣费）'), JSON.stringify(r))
  check('… says nothing was generated, which key was used, model is listed', /没有生成任何内容，不会扣费/.test(r.message) && /刚填写、还没保存/.test(r.message) && r.keySource === 'typed' && r.notes.some((n) => /gpt-image-1/.test(n) && /列表里/.test(n)), JSON.stringify(r))
  check('… proof: your key 200, the deliberately wrong key 401', r.checks.length === 2 && r.checks[0].who === 'yours' && r.checks[0].status === 200 && r.checks[1].who === 'fake' && r.checks[1].status === 401 && /GET 127\.0\.0\.1:\d+\/v1\/models/.test(r.checks[0].request), JSON.stringify(r.checks))
  const w = await media('image', { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, model: 'gpt-image-1', apiKey: KEYS.openaiWrong })
  check('OpenAI-compatible image: wrong key → ❌ 密钥被拒绝（HTTP 401）', w.verdict === 'rejected' && w.level === 'error' && w.keyValid === false && w.title === '❌ 密钥被拒绝（HTTP 401）' && /复制完整/.test(w.message), JSON.stringify(w))
  check('… the provider echoed the wrong key, the result never contains it', leaks(w).length === 0 && !JSON.stringify(w).includes(KEYS.openaiWrong), leaks(w).join(','))
  const nm = await media('image', { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, model: 'flux-ultra-9', apiKey: KEYS.openai })
  check('… valid key but the model is not in the list → ✅ with a model hint', nm.verdict === 'valid' && nm.notes.some((n) => /没有「flux-ultra-9」/.test(n)), JSON.stringify(nm.notes))
  S.openaiPublic = true
  const pub = await media('image', { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, model: 'gpt-image-1', apiKey: KEYS.openaiWrong })
  S.openaiPublic = false
  check('… a public model list (no auth) never yields ✅ → ⚠️ 无法确认密钥', pub.verdict === 'reachable' && pub.level === 'warn' && pub.keyValid === null && /无法确认密钥/.test(pub.title) && /不需要密钥也能访问/.test(pub.message), JSON.stringify(pub))
  check('OpenAI checks used GET only', hasMethodsOnly(openai, ['GET']))
}
{
  const r = await media('image', { providerId: 'volcengine-seedream', protocol: 'openai-image', baseUrl: `${ark.base}/api/v3`, endpoint: '/images/generations', model: 'doubao-seedream-4-0-250828', apiKey: KEYS.ark })
  check('即梦 Seedream (Ark): valid → ✅ via the free task list', r.verdict === 'valid' && r.checks[0].request.includes('/api/v3/contents/generations/tasks') && r.provider.name.includes('即梦'), JSON.stringify(r))
  const v = await media('video', { providerId: 'volcengine-seedance', protocol: 'volcengine-seedance', baseUrl: `${ark.base}/api/v3`, endpoint: '/contents/generations/tasks', model: 'doubao-seedance-2-5-260628', apiKey: KEYS.ark })
  check('Seedance (Ark): valid → ✅', v.verdict === 'valid', JSON.stringify(v))
  const vw = await media('video', { providerId: 'volcengine-seedance', baseUrl: `${ark.base}/api/v3`, apiKey: 'ark-wrong-key-123456' })
  check('Seedance (Ark): wrong key → ❌ 401', vw.verdict === 'rejected' && vw.status === 401, JSON.stringify(vw))
  check('Ark checks used GET only (no task was created)', hasMethodsOnly(ark, ['GET']))
}
{
  const r = await media('image', { providerId: 'bfl-flux', protocol: 'bfl-flux', baseUrl: bfl.base, endpoint: '/v1/flux-pro-1.1', apiKey: KEYS.bfl })
  check('BFL Flux: valid → ✅ + credits', r.verdict === 'valid' && r.notes.some((n) => /12\.5 credits/.test(n)), JSON.stringify(r))
  const w = await media('image', { providerId: 'bfl-flux', baseUrl: bfl.base, apiKey: 'bfl-wrong-key-1234' })
  check('BFL Flux: wrong key (403 Not authenticated) → ❌ 密钥被拒绝', w.verdict === 'rejected' && w.status === 403, JSON.stringify(w))
  check('BFL checks used GET only', hasMethodsOnly(bfl, ['GET']))
}
{
  const r = await media('image', { providerId: 'fal-flux', protocol: 'fal-image', baseUrl: fal.base, endpoint: '/fal-ai/flux/schnell', model: 'fal-ai/flux/schnell', apiKey: KEYS.fal })
  check('fal.ai Flux: valid → ✅ via the free pricing API (+ price)', r.verdict === 'valid' && r.checks[0].request.includes('/v1/models/pricing') && r.notes.some((n) => /0\.003 USD/.test(n)), JSON.stringify(r))
  S.falNoPricing = true
  const q = await media('image', { providerId: 'fal-flux', baseUrl: fal.base, endpoint: '/fal-ai/flux/schnell', apiKey: KEYS.fal })
  S.falNoPricing = false
  check('fal.ai Flux: no pricing API → dummy queue status (404 vs 401) → ✅', q.verdict === 'valid' && /\/fal-ai\/flux\/requests\/.+\/status/.test(q.checks.at(-1).request), JSON.stringify(q.checks))
  const w = await media('image', { providerId: 'fal-flux', baseUrl: fal.base, endpoint: '/fal-ai/flux/schnell', apiKey: 'falkeyid0002:wrong-secret-0000' })
  check('fal.ai Flux: wrong key → ❌', w.verdict === 'rejected' && leaks(w).length === 0, JSON.stringify(w))
  check('fal checks used GET only (fal.run never called)', hasMethodsOnly(fal, ['GET']) && !fal.hits.some((h) => h.path === '/fal-ai/flux/schnell'))
}
{
  const aksk = `${KEYS.klingAk}:${KEYS.klingSk}`
  const r = await media('image', { providerId: 'kling-image', protocol: 'kling-image', baseUrl: kling.base, endpoint: '/v1/images/generations', model: 'kling-v2', apiKey: aksk })
  check('可灵 Kling image: AK:SK → JWT → ✅ (+ 资源包)', r.verdict === 'valid' && r.notes.some((n) => /剩余约 88/.test(n)), JSON.stringify(r))
  check('… neither AccessKey nor SecretKey leaks', leaks(r).length === 0, leaks(r).join(','))
  const v = await media('video', { providerId: 'kling-video', protocol: 'kling-video', baseUrl: kling.base, endpoint: '/v1/videos/text2video', model: 'kling-v2-6', apiKey: KEYS.klingBearer })
  check('可灵 Kling video: Bearer token → ✅', v.verdict === 'valid', JSON.stringify(v))
  const w = await media('video', { providerId: 'kling-video', baseUrl: kling.base, apiKey: `${KEYS.klingAk}:wrongSecretKey0000` })
  check('可灵 Kling: wrong SecretKey → ❌ with the AK:SK hint', w.verdict === 'rejected' && /AccessKey:SecretKey/.test(w.message), JSON.stringify(w))
  check('Kling checks used GET only', hasMethodsOnly(kling, ['GET']))
}
{
  const h = await media('video', { providerId: 'minimax-hailuo', protocol: 'minimax-hailuo', baseUrl: minimax.base, endpoint: '/v1/video_generation', model: 'MiniMax-Hailuo-02', apiKey: KEYS.minimax })
  const m = await media('audio', { providerId: 'minimax-music', protocol: 'minimax-music', baseUrl: minimax.base, endpoint: '/v1/music_generation', model: 'music-3.0', apiKey: KEYS.minimax })
  const sp = await media('audio', { providerId: 'minimax-speech', protocol: 'minimax-speech', baseUrl: minimax.base, endpoint: '/v1/t2a_v2', apiKey: KEYS.minimax })
  check('MiniMax 海螺 / Music / Speech: valid → ✅ via the free voice list', [h, m, sp].every((x) => x.verdict === 'valid' && x.checks[0].request.includes('/v1/get_voice')), JSON.stringify([h.verdict, m.verdict, sp.verdict]))
  const w = await media('audio', { providerId: 'minimax-music', baseUrl: minimax.base, apiKey: 'eyJminimax-wrong-0000' })
  check('MiniMax: wrong key (HTTP 200 + base_resp 1004) → ❌ 密钥被拒绝', w.verdict === 'rejected' && w.status === 200 && /login fail/.test(w.message), JSON.stringify(w))
  const b = await media('audio', { providerId: 'minimax-music', baseUrl: minimax.base, apiKey: KEYS.minimaxBroke })
  check('MiniMax: base_resp 1008 → ⚠️ 密钥有效，但余额不足', b.verdict === 'valid-billing' && b.level === 'warn' && b.keyValid === true && /余额/.test(b.title), JSON.stringify(b))
  check('MiniMax: no music / video / speech generation endpoint hit', !minimax.hits.some((x) => /music_generation|video_generation$|t2a_v2/.test(x.path)))
}
{
  const r = await media('video', { providerId: 'openai-video', protocol: 'openai-video', baseUrl: `${openai.base}/v1`, endpoint: '/videos/generations', model: 'sora-2', apiKey: KEYS.openai })
  check('OpenAI Sora / relay video: valid → ✅', r.verdict === 'valid', JSON.stringify(r))
}
{
  const r = await media('audio', { providerId: 'suno-music', protocol: 'suno-music', baseUrl: suno.base, endpoint: '/suno/submit/music', model: 'chirp-v4-5', apiKey: KEYS.suno })
  check('Suno: valid → ✅ + 剩余积分', r.verdict === 'valid' && r.notes.some((n) => /剩余积分：120/.test(n)), JSON.stringify(r))
  const w = await media('audio', { providerId: 'suno-music', baseUrl: suno.base, apiKey: 'suno-wrong-0000' })
  check('Suno: wrong key ({ code: 401 } in HTTP 200) → ❌', w.verdict === 'rejected', JSON.stringify(w))
  check('Suno: never submitted music', hasMethodsOnly(suno, ['GET']))
}
{
  const r = await media('audio', { providerId: 'elevenlabs-sfx', protocol: 'elevenlabs-sfx', baseUrl: eleven.base, endpoint: '/v1/sound-generation', apiKey: KEYS.eleven })
  check('ElevenLabs: valid → ✅ + 本月已用字符', r.verdict === 'valid' && r.notes.some((n) => /1200 \/ 10000/.test(n)), JSON.stringify(r))
  const rr = await media('audio', { providerId: 'elevenlabs-sfx', baseUrl: eleven.base, apiKey: KEYS.elevenRestricted })
  check('ElevenLabs: key without user_read (401 missing_permissions) is NOT reported invalid → ✅ via the model list', rr.verdict === 'valid' && rr.keyValid === true && rr.notes.some((n) => /没有「查询账户额度」的权限/.test(n)), JSON.stringify(rr))
  const w = await media('audio', { providerId: 'elevenlabs-sfx', baseUrl: eleven.base, apiKey: 'eleven-wrong-0000' })
  check('ElevenLabs: wrong key → ❌', w.verdict === 'rejected', JSON.stringify(w))
  check('ElevenLabs: never generated a sound', hasMethodsOnly(eleven, ['GET']))
}
{
  const ok = await media('audio', { providerId: 'volcengine-doubao-tts', protocol: 'volcengine-doubao-tts', baseUrl: doubao.base, endpoint: '/api/v1/tts', model: 'zh_male_m392_conversation_wvae_bigtts', apiKey: `${KEYS.doubaoApp}:${KEYS.doubaoToken}` })
  check('豆包语音: AppID:Token valid → ✅ (empty text rejected after auth)', ok.verdict === 'valid' && /空文本/.test(ok.message) && /不会合成声音/.test(ok.message), JSON.stringify(ok))
  const w = await media('audio', { providerId: 'volcengine-doubao-tts', baseUrl: doubao.base, endpoint: '/api/v1/tts', apiKey: `${KEYS.doubaoApp}:wrong-token-0000` })
  check('豆包语音: wrong token → ❌ (load grant)', w.verdict === 'rejected' && /load grant/.test(w.message), JSON.stringify(w))
  const bad = await media('audio', { providerId: 'volcengine-doubao-tts', baseUrl: doubao.base, apiKey: 'no-colon-token-0000' })
  check('豆包语音: key without AppID: → ❌ 密钥格式不对 (no request sent)', bad.verdict === 'config' && /AppID:Token/.test(bad.message) && bad.checks.length === 0, JSON.stringify(bad))
  check('豆包语音: every request carried EMPTY text', DOUBAO_TEXTS.length > 0 && DOUBAO_TEXTS.every((t) => t === ''), JSON.stringify(DOUBAO_TEXTS))
}

/* ================================================================================================ custom HTTP JSON */
{
  const cfg = (base, extra = {}) => ({
    providerId: 'custom-image',
    protocol: 'custom',
    custom: { submitUrl: `${base}/gen`, method: 'POST', headersJson: '{"Content-Type":"application/json","Authorization":"Bearer {{apiKey}}"}', bodyTemplateJson: '{"prompt":"{{prompt}}"}', mode: 'sync', ...extra },
  })
  const r = await media('image', { ...cfg(customAuth.base), apiKey: KEYS.custom })
  check('Custom HTTP JSON: gateway rejects a wrong key but not yours → ✅ (GET on the submit URL, no job)', r.verdict === 'valid' && /用 GET 访问提交地址/.test(r.message + JSON.stringify(r.checks)), JSON.stringify(r))
  const w = await media('image', { ...cfg(customAuth.base), apiKey: 'custom-wrong-0000' })
  check('Custom HTTP JSON: wrong key → ❌ 密钥被拒绝', w.verdict === 'rejected', JSON.stringify(w))
  const p = await media('image', { ...cfg(customPublic.base), apiKey: KEYS.custom })
  check('Custom HTTP JSON: server without auth → ⚠️ 网关可以访问，但无法确认密钥', p.verdict === 'reachable' && p.level === 'warn' && /自定义接口只检查/.test(p.message), JSON.stringify(p))
  const poll = await media('video', { ...cfg(customAuth.base, { mode: 'async-poll', pollUrlTemplate: `${customAuth.base}/tasks/{{taskId}}`, pollMethod: 'GET' }), providerId: 'custom-video', apiKey: KEYS.custom })
  check('Custom async-poll: dummy task id on the poll URL (404 vs 401) → ✅', poll.verdict === 'valid' && /\/tasks\/dsh-connection-test-0000/.test(poll.checks[0].request), JSON.stringify(poll.checks))
  const nokey = await media('image', { ...cfg(customPublic.base, { headersJson: '{"Content-Type":"application/json"}' }) })
  check('Custom without a key → ✅ 网关可以访问（没有使用密钥）', nokey.verdict === 'online-no-key' && nokey.level === 'ok' && /网关可以访问/.test(nokey.title), JSON.stringify(nokey))
  const hdr = await media('image', { ...cfg(customAuth.base, { headersJson: '{"Authorization": "Bearer sk-hardcoded-SECRET-777" "X": 1}' }), apiKey: KEYS.custom })
  check('Custom: broken Headers JSON → ❌ with position, no request, no secret quoted', hdr.verdict === 'config' && /Headers JSON/.test(hdr.title) && hdr.checks.length === 0 && !/hardcoded-SECRET/.test(JSON.stringify(hdr)), JSON.stringify(hdr))
  const hitsBefore = customAuth.hits.length
  const getSubmit = await media('image', { ...cfg(customAuth.base, { method: 'GET' }), apiKey: KEYS.custom })
  const newHits = customAuth.hits.slice(hitsBefore)
  check('Custom with GET submit: the submit path is never requested (only the server root)', newHits.length > 0 && newHits.every((x) => x.path === '/') && getSubmit.checks.every((c) => /\/$/.test(c.request)), JSON.stringify(newHits.map((x) => x.path)))
  const relay = await media('image', { providerId: 'custom-image', protocol: 'custom', custom: { submitUrl: `${openai.base}/v1/images/generations`, method: 'POST', headersJson: '{"Authorization":"Bearer {{apiKey}}"}', mode: 'sync' }, apiKey: KEYS.openai })
  check('Custom on an OpenAI-style relay (/v1/…): also checks GET /v1/models → ✅', relay.verdict === 'valid' && relay.checks[0].request.endsWith('/v1/models'), JSON.stringify(relay.checks))
  const noUrl = await media('image', { providerId: 'custom-image', protocol: 'custom', custom: { submitUrl: '' } })
  check('Custom without a submit URL → ❌ 还没有填写提交 URL', noUrl.verdict === 'config' && /提交 URL/.test(noUrl.title), JSON.stringify(noUrl))
  check('Custom: no POST ever reached the custom servers', hasMethodsOnly(customAuth, ['GET']) && hasMethodsOnly(customPublic, ['GET']))
}

/* ================================================================================================ network failures */
{
  const base = { providerId: 'openai-image', protocol: 'openai-image', model: 'gpt-image-1', apiKey: KEYS.openai }
  const t0 = Date.now()
  const to = await media('image', { ...base, baseUrl: `${hang.base}/v1` }, { timeoutMs: 400 })
  check('Hanging server → ❌ 连接超时 (per-request timeout)', to.verdict === 'network' && /连接超时/.test(to.title) && Date.now() - t0 < 3000, `${Date.now() - t0}ms ${JSON.stringify(to)}`)
  const rf = await media('image', { ...base, baseUrl: `${closed.base}/v1` })
  check('Closed port → ❌ 连接被拒绝', rf.verdict === 'network' && /连接被拒绝/.test(rf.title), JSON.stringify(rf))
  const html = await media('image', { ...base, baseUrl: htmlSite.base })
  check('Website instead of the API → ❌ 地址不是该服务的接口（返回 HTML 网页）', html.verdict === 'not-api' && html.level === 'error' && /HTML/.test(html.title), JSON.stringify(html))
  const nf = await media('video', { providerId: 'volcengine-seedance', protocol: 'volcengine-seedance', baseUrl: `${allNotFound.base}/api/v3`, apiKey: KEYS.ark })
  check('Wrong path (404 everywhere) → ⚠️ 能连上服务器，但没找到接口', nf.verdict === 'not-found' && /404/.test(nf.title), JSON.stringify(nf))
  const se = await media('image', { ...base, baseUrl: `${serverErr.base}/v1` })
  check('503 → ⚠️ 服务商暂时出错', se.verdict === 'server-error' && /503/.test(se.title), JSON.stringify(se))
  const rl = await media('image', { ...base, baseUrl: `${rateLimited.base}/v1` })
  check('429 → ⚠️ 请求太频繁', rl.verdict === 'rate-limited' && rl.level === 'warn', JSON.stringify(rl))
  const dnsFetch = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.example.invalid'), { code: 'ENOTFOUND' }) })
  }
  const dns = await media('image', { ...base, baseUrl: 'https://api.example.invalid/v1' }, { fetchImpl: dnsFetch })
  check('DNS failure → ❌ 地址错误：找不到这个服务器（DNS 失败）', dns.verdict === 'network' && /DNS/.test(dns.title) && /api\.example\.invalid/.test(dns.message), JSON.stringify(dns))
  const tlsFetch = async () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) })
  }
  const tls = await media('image', { ...base, baseUrl: 'https://api.example.invalid/v1' }, { fetchImpl: tlsFetch })
  check('TLS failure → ❌ 安全连接失败', tls.verdict === 'network' && /安全连接失败/.test(tls.title), JSON.stringify(tls))
  const bad = await media('image', { ...base, baseUrl: 'api.openai.com/v1' })
  check('Base URL without http(s):// → ❌ 接口根地址格式不对 (no request)', bad.verdict === 'config' && bad.checks.length === 0, JSON.stringify(bad))
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 150)
  const ab = await media('image', { ...base, baseUrl: `${hang.base}/v1` }, { timeoutMs: 5000, signal: ac.signal })
  check('Abort signal → 测试已取消', ab.verdict === 'aborted', JSON.stringify(ab))
  const t1 = Date.now()
  const budget = await media('video', { providerId: 'volcengine-seedance', protocol: 'volcengine-seedance', baseUrl: `${hang.base}/api/v3`, apiKey: KEYS.ark }, { timeoutMs: 5000, budgetMs: 600 })
  check('Whole-test budget caps a hanging server', budget.verdict === 'network' && Date.now() - t1 < 2500, `${Date.now() - t1}ms ${budget.verdict}`)
}

/* ================================================================================================ typed / masked / saved keys */
{
  cloud.saveCloudMediaConfig({ image: { providerId: 'openai-image', protocol: 'openai-image', baseUrl: `${openai.base}/v1`, endpoint: '/images/generations', model: 'gpt-image-1', apiKey: KEYS.openai } })
  const summary = cloud.getCloudMediaConfigSummary()
  const masked = summary.image.apiKeyMasked
  const saved = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, apiKey: '' }, ...T })
  check('Empty key field → the saved key (read server-side) → ✅, keySource saved', saved.verdict === 'valid' && saved.keySource === 'saved' && /已保存的密钥/.test(saved.message), JSON.stringify(saved))
  const fromMasked = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, apiKey: masked }, ...T })
  check('Masked placeholder (abcd***wxyz) → the saved key', masked.includes('***') && fromMasked.verdict === 'valid' && fromMasked.keySource === 'saved', `${masked} ${fromMasked.verdict}`)
  const keep = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, apiKey: 'KEEP_EXISTING' }, ...T })
  check('KEEP_EXISTING → the saved key', keep.keySource === 'saved' && keep.verdict === 'valid')
  const typedWrong = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, apiKey: KEYS.openaiWrong }, ...T })
  check('A typed key wins over the saved one (unsaved draft is tested)', typedWrong.keySource === 'typed' && typedWrong.verdict === 'rejected')
  const cleared = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${openai.base}/v1`, apiKey: '', clearApiKey: true }, ...T })
  check('「保存时清除」 ticked and nothing typed → ❌ 还没有填写 API Key', cleared.verdict === 'config' && /API Key/.test(cleared.title))
  const draftBase = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'openai-image', baseUrl: `${htmlSite.base}/v1` }, ...T })
  check('The draft base URL (not the saved one) is tested', draftBase.verdict === 'not-api')
  const switched = await conn.testCloudMediaConnection({ category: 'image', config: { providerId: 'bfl-flux', protocol: 'bfl-flux', baseUrl: bfl.base }, ...T })
  check('Switched preset without a new key → saved key used, says so', switched.verdict === 'rejected' && /换了服务商/.test(switched.message), JSON.stringify(switched))
  const none = await conn.testCloudMediaConnection({ category: 'video', config: { providerId: 'kling-video', baseUrl: kling.base }, ...T })
  check('No key at all → ❌ 还没有填写 API Key (no request)', none.verdict === 'config' && none.checks.length === 0)
  check('Saved key never leaks into a result', [saved, fromMasked, keep, switched].every((x) => leaks(x).length === 0))
}

/* ================================================================================================ TTS */
{
  const mm = await conn.testTtsBuiltinConnection({ engineId: 'minimax-tts', config: { endpoint: `${minimax.base}/v1/t2a_v2`, model: 'speech-2.6-hd', voiceId: 'male-qn-qingse', apiKey: KEYS.minimax }, saved: {}, ...T })
  check('配音 · MiniMax Speech: valid → ✅ (voice list, no synthesis)', mm.verdict === 'valid' && mm.notes.length === 0, JSON.stringify(mm))
  const mv = await conn.testTtsBuiltinConnection({ engineId: 'minimax-tts', config: { endpoint: `${minimax.base}/v1/t2a_v2`, voiceId: 'no-such-voice', apiKey: KEYS.minimax }, saved: {}, ...T })
  check('… unknown voice ID → ✅ with a voice hint', mv.verdict === 'valid' && mv.notes.some((n) => /no-such-voice/.test(n)), JSON.stringify(mv.notes))
  const ms = await conn.testTtsBuiltinConnection({ engineId: 'minimax-tts', config: { endpoint: `${minimax.base}/v1/t2a_v2`, apiKey: '' }, saved: { 'minimax-tts': { apiKey: KEYS.minimax } }, ...T })
  check('… empty key field → saved MiniMax key', ms.verdict === 'valid' && ms.keySource === 'saved')
  const db = await conn.testTtsBuiltinConnection({ engineId: 'doubao-tts', config: { endpoint: `${doubao.base}/api/v1/tts`, appId: KEYS.doubaoApp, token: KEYS.doubaoToken, cluster: 'volcano_tts', voiceType: 'zh_male_m392_conversation_wvae_bigtts' }, saved: {}, ...T })
  check('配音 · 豆包语音: valid → ✅ (empty text)', db.verdict === 'valid' && /空文本/.test(db.message), JSON.stringify(db))
  const dbn = await conn.testTtsBuiltinConnection({ engineId: 'doubao-tts', config: { endpoint: `${doubao.base}/api/v1/tts`, appId: KEYS.doubaoApp, token: '' }, saved: {}, ...T })
  check('配音 · 豆包语音: no token → ❌ 还没有填写 Access Token', dbn.verdict === 'config' && /Access Token/.test(dbn.title))
  const kk = await conn.testTtsCustomConnection({ engine: { kind: 'openai-tts', name: 'Kokoro', endpoint: `${kokoro.base}/v1/audio/speech`, model: 'kokoro', voice: 'zf_xiaoxiao' }, saved: [], ...T })
  check('自定义配音 · OpenAI /v1/audio/speech without a key → ✅ 服务在线 + model listed', kk.verdict === 'online-no-key' && kk.level === 'ok' && kk.notes.some((n) => /kokoro/.test(n)), JSON.stringify(kk))
  const ko = await conn.testTtsCustomConnection({ engine: { kind: 'openai-tts', name: 'OpenAI TTS', endpoint: `${openai.base}/v1/audio/speech`, model: 'gpt-4o-mini-tts', apiKey: KEYS.openai }, saved: [], ...T })
  check('自定义配音 · OpenAI TTS with a key → ✅ via /v1/models', ko.verdict === 'valid', JSON.stringify(ko))
  const ke = await conn.testTtsCustomConnection({ engine: { kind: 'openai-tts', editingId: 'my-tts', endpoint: `${openai.base}/v1` }, saved: [{ id: 'my-tts', apiKey: KEYS.openai }], ...T })
  check('自定义配音 · editing a saved model, key left empty → its saved key', ke.verdict === 'valid' && ke.keySource === 'saved', JSON.stringify(ke))
  const hj = await conn.testTtsCustomConnection({ engine: { kind: 'http-json', name: 'CosyVoice', endpoint: `${customPublic.base}/gen`, method: 'POST' }, saved: [], ...T })
  check('自定义配音 · HTTP JSON (POST) → GET on its address → ✅ 服务在线，接口地址存在', hj.verdict === 'online-no-key' && /接口地址存在/.test(hj.message), JSON.stringify(hj))
  const cli = await conn.testTtsCustomConnection({ engine: { kind: 'cli-command', name: 'Edge', command: 'edge-tts' }, saved: [], ...T })
  check('自定义配音 · command line → not applicable (no request)', cli.verdict === 'not-applicable' && cli.checks.length === 0)
  check('TTS: no speech was synthesised (kokoro / openai GET only)', hasMethodsOnly(kokoro, ['GET']))
}

/* ================================================================================================ avatar + lip-sync */
{
  const ok = await conn.testAvatarProviderConnection({ config: { provider: 'musetalk', endpoint: avatarSrv.base, apiKey: KEYS.avatar }, saved: {}, ...T })
  check('外接数字人: valid key → ✅ (GET on /api/generate_avatar, nothing generated)', ok.verdict === 'valid', JSON.stringify(ok))
  const w = await conn.testAvatarProviderConnection({ config: { provider: 'musetalk', endpoint: avatarSrv.base, apiKey: 'avatar-wrong-0000' }, saved: {}, ...T })
  check('外接数字人: wrong key → ❌', w.verdict === 'rejected', JSON.stringify(w))
  const sv = await conn.testAvatarProviderConnection({ config: { provider: 'musetalk', endpoint: avatarSrv.base, apiKey: 'abcd****wxyz' }, saved: { apiKey: KEYS.avatar }, ...T })
  check('外接数字人: masked key → saved key', sv.verdict === 'valid' && sv.keySource === 'saved', JSON.stringify(sv))
  const loc = await conn.testAvatarProviderConnection({ config: { provider: 'local-composite', endpoint: '' }, saved: {}, ...T })
  check('外接数字人: 仅本地合成 → not applicable', loc.verdict === 'not-applicable')
  const empty = await conn.testAvatarProviderConnection({ config: { provider: 'auto', endpoint: '' }, saved: {}, ...T })
  check('外接数字人: no address → ❌ 还没有填写接口地址', empty.verdict === 'config')
  check('外接数字人: never POSTed', hasMethodsOnly(avatarSrv, ['GET']))
  const ls = await conn.testLipsyncCloudConnection({ cloud: { endpoint: fal.base, model: 'fal-ai/latentsync', apiKey: KEYS.fal }, ...T })
  check('云端口型 fal.ai (.env key): valid → ✅', ls.verdict === 'valid' && ls.keySource === 'env' && /\.env/.test(ls.message), JSON.stringify(ls))
  const lsn = await conn.testLipsyncCloudConnection({ cloud: { endpoint: fal.base, model: 'fal-ai/latentsync', apiKey: '' }, ...T })
  check('云端口型 fal.ai: no key → ❌ 没有配置 fal.ai 密钥', lsn.verdict === 'config' && /FAL_KEY/.test(lsn.message))
}

/* ================================================================================================ stock (Pexels / Pixabay) */
{
  const stockFetch = async (url, init = {}) => {
    const u = new URL(url)
    if (u.hostname === 'api.pexels.com') {
      const auth = init.headers?.Authorization || ''
      return auth === KEYS.pexels ? new Response(JSON.stringify({ photos: [{ id: 1 }] }), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  }
  const ok = await conn.testStockConnection({ provider: 'pexels', apiKey: KEYS.pexels, fetchImpl: stockFetch })
  check('免费素材 Pexels: valid → ✅（免费接口）', ok.ok && ok.level === 'ok' && ok.keySource === 'typed' && leaks(ok).length === 0, JSON.stringify(ok))
  const w = await conn.testStockConnection({ provider: 'pexels', apiKey: 'pexels-wrong-key-0000', fetchImpl: stockFetch })
  check('免费素材 Pexels: wrong key → ❌ 密钥被拒绝', !w.ok && w.verdict === 'rejected' && w.level === 'error', JSON.stringify(w))
  const none = await conn.testStockConnection({ provider: 'pixabay', apiKey: '', fetchImpl: stockFetch })
  check('免费素材 Pixabay: nothing configured → ❌ 还没有填写', none.verdict === 'config' && /Pixabay/.test(none.title), JSON.stringify(none))
}

/* ================================================================================================ HTTP routes + panel allow-list + MCP */
{
  const { handleWorkbenchApiRequest } = await imp('packages/dsh-web-video-workbench/lib/index.js')
  const api = async (path, body, method = 'POST') => {
    const r = await handleWorkbenchApiRequest(new Request(`http://127.0.0.1/api/video-workbench/${path}`, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined }))
    return { status: r.status, json: await r.json().catch(() => ({})) }
  }
  const a = await api('cloud-media/test', { category: 'audio', config: { providerId: 'suno-music', protocol: 'suno-music', baseUrl: suno.base, apiKey: KEYS.suno } })
  check('POST cloud-media/test → 200 + ✅ result', a.status === 200 && a.json.verdict === 'valid' && a.json.billable === false && leaks(a.json).length === 0, JSON.stringify(a))
  const b = await api('connection-test', { target: 'cloud-media', category: 'image', config: { providerId: 'bfl-flux', protocol: 'bfl-flux', baseUrl: bfl.base, apiKey: 'bfl-wrong-key-1234' } })
  check('POST connection-test (cloud-media) → 200 + ❌ result (ok:false, still HTTP 200)', b.status === 200 && b.json.ok === false && b.json.verdict === 'rejected', JSON.stringify(b))
  const c = await api('connection-test', { target: 'tts-custom', engine: { kind: 'openai-tts', endpoint: `${kokoro.base}/v1/audio/speech` } })
  check('POST connection-test (tts-custom) → ✅ 服务在线', c.status === 200 && c.json.verdict === 'online-no-key', JSON.stringify(c))
  const d = await api('connection-test', { target: 'nope' })
  check('POST connection-test with an unknown target → 400', d.status === 400 && d.json.ok === false && /target/.test(d.json.error), JSON.stringify(d))
  const e = await api('cloud-media/test', { category: 'pictures', config: {} })
  check('POST cloud-media/test with a bad category → 400', e.status === 400, JSON.stringify(e))
  const f = await api('connection-test', null, 'GET')
  check('GET connection-test → 405', f.status === 405, JSON.stringify(f))
  const client = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js'), 'utf8')
  const setOf = (name) => (new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(client) || [])[1] || ''
  check('panel kit allow-list: POST cloud-media/test + connection-test, without host refresh', ['KIT_API_POST', 'KIT_API_NO_REFRESH'].every((n) => /'cloud-media\/test'/.test(setOf(n)) && /'connection-test'/.test(setOf(n))))
  const index = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'index.js'), 'utf8')
  check('routes registered with the DSH connection fetch (CONNECTION_TEST_ROUTES)', /\.\.\.CONNECTION_TEST_ROUTES/.test(index))

  const tools = new Map()
  const media2 = await imp('packages/dsh-tool-media/index.js')
  try {
    media2.apply({ tools: { register: (t) => tools.set(t.name, t) }, inject: () => {}, on: () => {} })
  } catch {}
  const tool = tools.get('configure_cloud_media')
  const enumOk = Boolean(tool && tool.parameters?.properties?.action?.enum?.includes('test'))
  const viaMcp = tool && enumOk ? await tool.execute({ action: 'test', category: 'audio', config: { providerId: 'suno-music', protocol: 'suno-music', baseUrl: suno.base, apiKey: KEYS.suno } }).catch((err) => ({ error: err.message })) : null
  check('MCP configure_cloud_media action "test" → result, nothing saved', enumOk && viaMcp?.test?.verdict === 'valid' && leaks(viaMcp).length === 0, JSON.stringify(viaMcp))
}

/* ================================================================================================ global guarantees */
check('No generation endpoint was ever hit (only free queries / empty-text checks)', GEN_HITS.length === 0, GEN_HITS.join(' | '))
check('No request ever left 127.0.0.1', BLOCKED.length === 0, BLOCKED.join(' | '))

for (const srv of servers) {
  srv.closeAllConnections?.()
  srv.close()
}
if (!KEEP) rmSync(SCR, { recursive: true, force: true })
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? ` — FAILED: ${failed.map((f) => f.name).join(' ; ')}` : ''}`)
process.exit(failed.length ? 1 : 0)
