/**
 * @dsh-video/tool-media — 「测试连接」 for every cloud connection the user can fill in, using the values typed in the
 * form (before saving) and WITHOUT generating anything or sending any billable request.
 *
 *   runConnectionTest({ target, … }) — target:
 *     cloud-media      { category: 'image'|'video'|'audio', config }  BYOK cloud image / video / music & audio presets
 *     tts-builtin      { engineId: 'minimax-tts'|'doubao-tts', config } cloud TTS channels of the 配音引擎 tab
 *     tts-custom       { engine }                                     custom OpenAI /v1/audio/speech or HTTP JSON TTS model
 *     avatar-provider  { config: { provider, endpoint, apiKey } }     external MuseTalk / LatentSync HTTP service
 *     lipsync-cloud    {}                                             fal.ai cloud lip-sync key configured in .env
 *     stock            { provider: 'pexels'|'pixabay', apiKey }         free stock libraries (stock-media.js)
 *
 * How a key is proven:
 *   1. one documented free, read-only request — account balance / credits / pricing, model or voice list — or a status
 *      query for a task id that cannot exist. Doubao TTS has no such endpoint: it gets a synthesis request with EMPTY
 *      text, which the service rejects before any audio is made. A "Custom HTTP JSON" protocol only gets reachability
 *      and auth-rejection checks: its submit URL is never called with its own method (a GET on a POST-only route).
 *   2. the same request again with a deliberately wrong key (the control). The key counts as valid only when the
 *      service rejects the wrong key (401 / 403 / an auth error code) but not the user's key — a public endpoint, a
 *      catch-all 404 or a gateway that ignores auth can never produce a false 「✅」.
 * A typed key is used as-is; an empty / masked (`***`) / KEEP_EXISTING key means "the saved one", read server-side.
 * Results are plain Chinese with the HTTP status and a hint, say that nothing was generated, and never contain a key
 * (every secret is scrubbed from texts and URLs). 15 s per request, ≤ 40 s per test, abortable through `signal`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadEnv, resolveEnvPath } from '../shared/index.js'
import { loadTtsConfig } from '../dsh-tool-local-tts/tts-config.js'
import { buildKlingAuthHeader, CLOUD_MEDIA_PRESETS, joinUrl, loadCloudMediaConfig, renderCustomHeaders, renderTemplateValue } from './cloud-media.js'
import { testStockMediaKey } from './stock-media.js'

export const CONNECTION_TEST_TIMEOUT_MS = 15_000
export const CONNECTION_TEST_BUDGET_MS = 40_000
export const CONNECTION_TEST_TARGETS = Object.freeze(['cloud-media', 'tts-builtin', 'tts-custom', 'avatar-provider', 'lipsync-cloud', 'stock'])
/** a task / request id that cannot exist at any provider */
export const DUMMY_TASK_ID = 'dsh-connection-test-0000'
const DUMMY_UUID = '00000000-0000-4000-8000-000000000000'
/** the deliberately wrong key of the control request */
export const FAKE_KEY = 'dsh-connection-test-invalid-key-0000'
const FAKE_KLING_AKSK = 'dshconnectiontestak0000:dshconnectiontestsk0000'
const FAKE_DOUBAO = 'dsh-connection-test-appid:dsh-connection-test-invalid-token'
const MAX_BODY_BYTES = 2 * 1024 * 1024
const KEEP_EXISTING = 'KEEP_EXISTING'
const NO_CHARGE = '本次测试没有生成任何内容，不会扣费。'
const NO_CHARGE_EMPTY_TEXT = '测试只发送了一段空文本：服务商不会合成声音，不会扣费。'

const str = (v) => (typeof v === 'string' ? v.trim() : v === undefined || v === null ? '' : String(v).trim())
/** a key the user actually typed (not empty, not the masked placeholder of a saved key, not KEEP_EXISTING) */
const isTypedSecret = (v) => {
  const s = str(v)
  return Boolean(s) && s !== KEEP_EXISTING && !/\*{3,}/.test(s)
}
const shortName = (name) => str(name).replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim() || str(name)

class ConnectionTestInputError extends Error {
  constructor(message) {
    super(message)
    this.status = 400
    this.expose = true
  }
}

function parseHttpUrl(raw) {
  const s = str(raw)
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}
const stripSlash = (s) => str(s).replace(/\/+$/, '')

/* ---------------------------------------------------------------------------------------------- secrets */
function makeScrubber(secrets = []) {
  const list = []
  for (const raw of secrets) {
    const s = str(raw)
    if (s.length < 4) continue
    list.push(s)
    const enc = encodeURIComponent(s)
    if (enc !== s) list.push(enc)
  }
  const uniq = [...new Set(list)].sort((a, b) => b.length - a.length)
  return (text) => {
    let out = String(text ?? '')
    for (const s of uniq) out = out.split(s).join('***')
    return out
  }
}
/** values of credential-looking headers (the JWT of a Kling AK:SK key, `Bearer;token` …) are secrets too */
function headerSecrets(headers = {}) {
  return Object.entries(headers || {})
    .filter(([k]) => /auth|key|token|secret|sign|cookie/i.test(k))
    .flatMap(([, v]) => {
      const s = str(v)
      return [s, s.replace(/^(bearer|key|token)[;\s]+/i, '')]
    })
}

/* ---------------------------------------------------------------------------------------------- HTTP */
async function readBodyLimited(resp, limit) {
  if (resp?.body && typeof resp.body.getReader === 'function') {
    const reader = resp.body.getReader()
    const chunks = []
    let size = 0
    let truncated = false
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      if (size + chunk.byteLength > limit) {
        chunks.push(chunk.subarray(0, limit - size))
        truncated = true
        try {
          await reader.cancel()
        } catch {}
        break
      }
      size += chunk.byteLength
      chunks.push(chunk)
    }
    return { text: Buffer.concat(chunks).toString('utf8'), truncated }
  }
  const text = typeof resp?.text === 'function' ? await resp.text() : ''
  return { text: text.length > limit ? text.slice(0, limit) : text, truncated: text.length > limit }
}

function networkErrorOf(err, timedOut, aborted) {
  if (aborted) return { kind: 'aborted' }
  if (timedOut) return { kind: 'timeout' }
  const codes = [err?.cause?.code, err?.code, err?.cause?.cause?.code, err?.cause?.errors?.[0]?.code].filter(Boolean).map(String)
  const msg = `${err?.message || ''} ${err?.cause?.message || ''}`
  const has = (re) => codes.some((c) => re.test(c)) || re.test(msg)
  if (has(/ENOTFOUND|EAI_AGAIN|EAI_NONAME|EAI_NODATA|EAI_FAIL|getaddrinfo/i)) return { kind: 'dns' }
  if (has(/ECONNREFUSED/)) return { kind: 'refused' }
  if (has(/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT/)) return { kind: 'timeout' }
  if (has(/CERT|SSL|TLS|EPROTO|self[- ]signed|UNABLE_TO_(?:GET|VERIFY)/i)) return { kind: 'tls' }
  if (has(/ENETUNREACH|EHOSTUNREACH|ENETDOWN/)) return { kind: 'unreachable' }
  if (has(/ECONNRESET|EPIPE|UND_ERR_SOCKET|socket hang up|other side closed/i)) return { kind: 'reset' }
  if (err?.name === 'AbortError') return { kind: 'timeout' }
  return { kind: 'other', message: String(err?.message || err || '').slice(0, 160) }
}

/** One HTTP request with the per-request timeout (bounded by the test deadline) and the caller's abort signal. */
async function sendRequest(req, env) {
  const ms = Math.max(1, Math.min(env.timeoutMs, env.deadline - Date.now()))
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, ms)
  const onAbort = () => ctrl.abort()
  if (env.signal) {
    if (env.signal.aborted) ctrl.abort()
    else env.signal.addEventListener('abort', onAbort, { once: true })
  }
  const t0 = Date.now()
  try {
    const resp = await env.fetchFn(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal, redirect: 'follow' })
    const contentType = String(resp?.headers?.get?.('content-type') || '').toLowerCase()
    const { text, truncated } = await readBodyLimited(resp, MAX_BODY_BYTES)
    let json = null
    const t = text.trimStart()
    if (!truncated && (t.startsWith('{') || t.startsWith('['))) {
      try {
        json = JSON.parse(t)
      } catch {}
    }
    // judged by the body: some gateways label their JSON answers text/html
    const isHtml =
      !json && (/^(?:<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(t) || (/text\/html|application\/xhtml/.test(contentType) && /<(?:html|head|body|title|div|script)[\s>]/i.test(t.slice(0, 4000))))
    return { status: Number(resp?.status) || 0, contentType, text, json, isHtml, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { netError: networkErrorOf(err, timedOut, Boolean(env.signal?.aborted)), latencyMs: Date.now() - t0, timeoutMs: ms }
  } finally {
    clearTimeout(timer)
    env.signal?.removeEventListener?.('abort', onAbort)
  }
}

/* ---------------------------------------------------------------------------------------------- classification */
const AUTH_RE =
  /(?:invalid|incorrect|missing|wrong|bad)(?:\s+or\s+\w+)?[\s_-]*(?:api[\s_-]*)?(?:key|token)\b|api[\s_-]*key\b[^.]{0,40}\b(?:invalid|not valid|expired|incorrect|required)|unauthori[sz]ed|not[\s_-]*authenticated|authenticat(?:e|ion)[\s_-]*(?:failed|error|required|request)|no user found|无效的?(?:令牌|密钥|token|key|api ?key)|令牌(?:无效|已过期|错误)|密钥(?:无效|错误)|鉴权失败|认证失败|身份验证失败|login fail|load grant|grant not found/i
const PERM_RE = /missing[\s_-]*(?:the[\s_-]*)?permission|insufficient[\s_-]*(?:permission|scope)|missing scopes?|permission denied|access denied|not granted|no permission|not authori[sz]ed to|权限不足|没有权限|无权/i
const BILLING_RE =
  /insufficient[\s_-]*(?:balance|credit|fund|quota)|balance[\s_-]*(?:is[\s_-]*)?(?:not enough|insufficient)|quota[\s_-]*exceeded|exceeded your (?:current )?quota|out of credits|no credits|余额不足|额度不足|欠费|积分不足|资源包(?:已用完|不足)/i
/** 401 / 403: a permission problem means the key itself was recognised (e.g. ElevenLabs `missing_permissions`) */
const authOrForbidden401 = (msg) => (PERM_RE.test(msg) ? 'forbidden' : 'auth')
const authOrForbidden403 = (msg) => (AUTH_RE.test(msg) && !PERM_RE.test(msg) ? 'auth' : BILLING_RE.test(msg) ? 'billing' : 'forbidden')

/** the provider's own error wording (never the whole body; scrubbed later) */
function errorText(r) {
  const j = r.json
  const parts = []
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    const e = j.error
    if (typeof e === 'string') parts.push(e)
    else if (e && typeof e === 'object') parts.push(str(e.message), str(e.code), str(e.type), str(e.status))
    const d = j.detail
    if (typeof d === 'string') parts.push(d)
    else if (d && typeof d === 'object' && !Array.isArray(d)) parts.push(str(d.status), str(d.message))
    else if (Array.isArray(d)) parts.push(...d.slice(0, 3).map((x) => str(x?.msg || x?.message || '')))
    parts.push(str(j.message), str(j.msg), str(j.error_msg), str(j.errorMessage))
    if (j.base_resp && typeof j.base_resp === 'object') parts.push(str(j.base_resp.status_msg))
    if (typeof j.status === 'string') parts.push(j.status)
  } else if (!r.isHtml) {
    parts.push(String(r.text || '').slice(0, 300))
  }
  return parts.filter(Boolean).join(' · ').slice(0, 300)
}

function classifyEmbedded(r, msg) {
  const j = r.json
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null
  const code = typeof j.code === 'number' ? j.code : /^\d{3}$/.test(str(j.code)) ? Number(j.code) : NaN
  if (code >= 400 && code <= 599) {
    if (code === 401) return { cls: authOrForbidden401(msg), msg, code }
    if (code === 403) return { cls: authOrForbidden403(msg), msg, code }
    if (code === 402) return { cls: 'billing', msg, code }
    if (code === 404) return { cls: 'notfound', msg, code }
    if (code === 429) return { cls: BILLING_RE.test(msg) ? 'billing' : 'ratelimit', msg, code }
    if (code >= 500) return { cls: 'server', msg, code }
    return { cls: AUTH_RE.test(msg) ? 'auth' : 'badrequest', msg, code }
  }
  const failed = j.success === false || j.ok === false || (j.error && typeof j.error !== 'boolean') || j.status === 'error'
  if (!failed) return null
  if (AUTH_RE.test(msg)) return { cls: 'auth', msg }
  if (BILLING_RE.test(msg)) return { cls: 'billing', msg }
  if (PERM_RE.test(msg)) return { cls: 'forbidden', msg }
  return { cls: 'badrequest', msg }
}

/**
 * → { cls, msg, code? } with cls: success | auth | forbidden | billing | ratelimit | notfound | badrequest | server |
 * html-page | other. Provider interpreters (JSON error codes inside HTTP 200 answers) go first.
 */
function classifyResponse(r, interpret) {
  if (typeof interpret === 'function') {
    const v = interpret(r)
    if (v) return { ...v, msg: v.msg !== undefined ? v.msg : errorText(r) }
  }
  const st = r.status
  const msg = errorText(r)
  if (st >= 200 && st < 400 && r.isHtml) return { cls: 'html-page', msg: '' }
  if (st === 401) return { cls: authOrForbidden401(msg), msg }
  if (st === 403) return { cls: authOrForbidden403(msg), msg }
  if (st === 402) return { cls: 'billing', msg }
  if (st === 429) return { cls: BILLING_RE.test(msg) ? 'billing' : 'ratelimit', msg }
  if (st === 404 || st === 410) return { cls: 'notfound', msg }
  if (st >= 400 && st < 500) return { cls: AUTH_RE.test(msg) ? 'auth' : BILLING_RE.test(msg) ? 'billing' : 'badrequest', msg }
  if (st >= 500) return { cls: 'server', msg }
  if (st >= 200 && st < 300) return classifyEmbedded(r, msg) || { cls: 'success', msg: '' }
  return { cls: 'other', msg }
}

/** MiniMax answers HTTP 200 with `base_resp.status_code` (official error-code table) */
function interpretMinimax(r) {
  const br = r.json && typeof r.json === 'object' ? r.json.base_resp : null
  if (!br || typeof br !== 'object') return null
  const code = Number(br.status_code)
  if (!Number.isFinite(code)) return null
  const msg = str(br.status_msg)
  if (code === 0) return r.status >= 200 && r.status < 300 ? { cls: 'success', msg: '' } : null
  if (code === 1004 || code === 2049) return { cls: 'auth', msg, code }
  if ([1008, 2053, 2067].includes(code)) return { cls: 'billing', msg, code }
  if ([1002, 1041, 1045, 2045, 2047, 2056, 2062].includes(code)) return { cls: 'ratelimit', msg, code }
  if ([2022, 2057, 2061, 2068, 2069].includes(code)) return { cls: 'forbidden', msg, code }
  if ([1000, 1001, 1024, 1033, 2064, 2066].includes(code)) return { cls: 'server', msg, code }
  return { cls: 'badrequest', msg, code } // 2013 invalid params, 2014 empty input … (answered after the key check)
}
/** Kling: `code` 0 = ok, 1000-1004 auth, 1101/1102 arrears, 11xx account, 12xx params, 13xx limits, 5xxx server */
function interpretKling(r) {
  const j = r.json
  if (!j || typeof j !== 'object' || j.code === undefined || j.code === null) return null
  const code = Number(j.code)
  if (!Number.isFinite(code)) return null
  const msg = str(j.message || j.msg)
  if (code === 0) return r.status >= 200 && r.status < 300 ? { cls: 'success', msg: '' } : null
  if (code >= 1000 && code <= 1004) return { cls: 'auth', msg, code }
  if (code === 1101 || code === 1102) return { cls: 'billing', msg, code }
  if (code >= 1100 && code <= 1199) return { cls: 'forbidden', msg, code }
  if (code >= 1200 && code <= 1299) return { cls: 'badrequest', msg, code }
  if (code === 1304) return { cls: 'forbidden', msg, code }
  if (code >= 1300 && code <= 1399) return { cls: 'ratelimit', msg, code }
  if (code >= 5000) return { cls: 'server', msg, code }
  return null
}
/** Volcengine openspeech v1 TTS: 3000 ok, auth failures say "authenticate request: load grant …" */
function interpretDoubao(r) {
  const j = r.json && typeof r.json === 'object' ? r.json : null
  const msg = str((j && (j.message || j.msg || (typeof j.error === 'string' ? j.error : j.error?.message))) || (r.isHtml ? '' : String(r.text || '').slice(0, 300)))
  if (/authenticate request|load grant|grant not found|invalid (?:token|appid)|unauthori[sz]ed/i.test(msg)) return { cls: 'auth', msg }
  if (/access denied|not granted/i.test(msg)) return { cls: 'forbidden', msg }
  const code = j ? Number(j.code) : NaN
  if (code === 3000) return { cls: 'success', msg: '' }
  if ([3001, 3010, 3011, 3050].includes(code)) return { cls: 'badrequest', msg, code } // validated after the credentials
  if (code === 3003) return { cls: 'ratelimit', msg, code }
  if ([3005, 3006, 3030, 3031, 3032, 3040].includes(code)) return { cls: 'server', msg, code }
  return null
}
/** sunoapi.org style `{ code, msg }` (HTTP 200): 401 key, 429 = 积分不足, 405 / 430 rate limits */
function interpretSuno(r) {
  const j = r.json
  if (!j || typeof j !== 'object' || typeof j.code !== 'number') return null
  const code = j.code
  const msg = str(j.msg || j.message)
  if (code === 200 || code === 0) return r.status >= 200 && r.status < 300 ? { cls: 'success', msg: '' } : null
  if (code === 401 || code === 403) return { cls: 'auth', msg, code }
  if (code === 402 || code === 429) return { cls: 'billing', msg, code }
  if (code === 404) return { cls: 'notfound', msg, code }
  if (code === 405 || code === 430) return { cls: 'ratelimit', msg, code }
  if (code === 455 || code >= 500) return { cls: 'server', msg, code }
  if (code >= 400) return { cls: 'badrequest', msg, code }
  return null
}

const OUTCOME_ZH = {
  success: '正常返回',
  auth: '密钥被拒绝',
  forbidden: '没有权限',
  billing: '余额 / 额度不足',
  ratelimit: '请求太频繁',
  notfound: '接口或任务不存在',
  badrequest: '请求被拒绝（参数 / 方法不对）',
  server: '服务端出错',
  'html-page': '返回的是网页',
  other: '其他回应',
}

/* ---------------------------------------------------------------------------------------------- probe chain */
/**
 * probe: { id, label, method, url(key) | url, headers(key), body(key)?, kind: 'list'|'account'|'task'|'input'|'reach',
 *          interpret?(r), onValid?(r, cls) → string[] (extra notes) }
 * env:   { fetchFn, key, fakeKey, hasKey, timeoutMs, deadline, signal, scrub }
 */
function buildRequest(p, key) {
  const pick = (v) => (typeof v === 'function' ? v(key) : v)
  return { method: (p.method || 'GET').toUpperCase(), url: pick(p.url), headers: pick(p.headers) || {}, body: pick(p.body) }
}
const sameRequest = (a, b) => a.method === b.method && a.url === b.url && a.body === b.body && JSON.stringify(a.headers) === JSON.stringify(b.headers)

function describeRequest(req, scrub) {
  try {
    const u = new URL(req.url)
    return scrub(`${req.method} ${u.host}${u.pathname}`)
  } catch {
    return scrub(`${req.method} ${String(req.url || '').slice(0, 120)}`)
  }
}
function checkRow(p, req, r, c, who, scrub) {
  return {
    step: p.label,
    request: describeRequest(req, scrub),
    who, // 'yours' | 'fake' | 'none'
    status: r.netError ? 0 : r.status,
    outcome: r.netError ? `连接失败（${r.netError.kind}）` : OUTCOME_ZH[c?.cls] || '其他回应',
    latencyMs: r.latencyMs,
  }
}

async function runProbeChain(probes, env) {
  const checks = []
  const seen = []
  for (const p of probes) {
    if (env.signal?.aborted) return { verdict: 'aborted', checks }
    if (Date.now() >= env.deadline - 250) break
    const realReq = buildRequest(p, env.key)
    const r = await sendRequest(realReq, env)
    const rc = r.netError ? null : classifyResponse(r, p.interpret)
    checks.push(checkRow(p, realReq, r, rc, env.hasKey ? 'yours' : 'none', env.scrub))
    if (r.netError) {
      if (r.netError.kind === 'aborted') return { verdict: 'aborted', checks }
      return { verdict: 'network', net: r.netError, probe: p, req: realReq, timeoutMs: r.timeoutMs, checks }
    }
    if (rc.cls === 'html-page') return { verdict: 'not-api', probe: p, status: r.status, checks }
    if (!env.hasKey) {
      if (rc.cls === 'auth' || rc.cls === 'forbidden') return { verdict: 'needs-key', probe: p, status: r.status, msg: rc.msg, checks }
      if (rc.cls === 'ratelimit') return { verdict: 'rate-limited', probe: p, status: r.status, checks }
      if (rc.cls === 'success' || rc.cls === 'badrequest' || rc.cls === 'billing' || (p.kind === 'reach' && rc.cls === 'notfound')) {
        return { verdict: 'online-no-key', probe: p, status: r.status, cls: rc.cls, notes: rc.cls === 'success' && p.onValid ? p.onValid(r, rc) : [], checks }
      }
      seen.push({ p, r, rc })
      continue
    }
    if (rc.cls === 'auth') return { verdict: 'rejected', probe: p, status: r.status, msg: rc.msg, code: rc.code, checks }
    if (rc.cls === 'ratelimit') return { verdict: 'rate-limited', probe: p, status: r.status, checks }
    // control: the same request with a deliberately wrong key
    const ctlReq = buildRequest(p, env.fakeKey)
    if (sameRequest(ctlReq, realReq)) {
      seen.push({ p, r, rc, same: true })
      continue
    }
    const c = await sendRequest(ctlReq, env)
    const cc = c.netError ? { cls: 'net' } : classifyResponse(c, p.interpret)
    checks.push(checkRow(p, ctlReq, c, cc.cls === 'net' ? null : cc, 'fake', env.scrub))
    if (c.netError?.kind === 'aborted') return { verdict: 'aborted', checks }
    if ((cc.cls === 'auth' || cc.cls === 'forbidden') && rc.cls !== cc.cls) {
      // the service told the wrong key apart from the user's key → the user's key is recognised
      if (rc.cls === 'billing') return { verdict: 'valid-billing', probe: p, status: r.status, msg: rc.msg, code: rc.code, checks }
      if (rc.cls === 'forbidden') {
        // recognised but not allowed to use this check: keep looking for a check it may use
        seen.push({ p, r, rc, cc, restricted: true })
        continue
      }
      const restricted = seen.find((s) => s.restricted)
      const notes = [...(restricted ? [`这个密钥没有「${restricted.p.label}」的权限，但可以正常使用。`] : []), ...(p.onValid ? p.onValid(r, rc) : [])]
      return { verdict: 'valid', probe: p, status: r.status, notes, checks }
    }
    seen.push({ p, r, rc, cc })
  }
  if (!seen.length) return { verdict: env.signal?.aborted ? 'aborted' : 'incomplete', checks }
  const any = (f) => seen.find(f)
  const restricted = any((s) => s.restricted)
  if (restricted) return { verdict: 'valid-restricted', probe: restricted.p, status: restricted.r.status, msg: restricted.rc.msg, checks }
  const forb = any((s) => s.rc.cls === 'forbidden')
  if (forb) return { verdict: env.hasKey ? 'forbidden' : 'needs-key', probe: forb.p, status: forb.r.status, msg: forb.rc.msg, checks }
  const bill = any((s) => s.rc.cls === 'billing')
  if (bill) return { verdict: 'billing-unconfirmed', probe: bill.p, status: bill.r.status, msg: bill.rc.msg, checks }
  const srv = any((s) => s.rc.cls === 'server')
  if (srv && !any((s) => s.rc.cls === 'success' || s.rc.cls === 'badrequest')) return { verdict: 'server-error', probe: srv.p, status: srv.r.status, checks }
  if (seen.every((s) => s.rc.cls === 'notfound' && s.p.kind !== 'reach')) return { verdict: 'not-found', probe: seen[0].p, status: seen[0].r.status, checks }
  const last = seen[seen.length - 1]
  const reason = seen.some((s) => s.same) ? 'same-request' : seen.some((s) => s.rc.cls === 'success' && s.cc?.cls === 'success') ? 'public' : 'no-free-check'
  return { verdict: 'reachable', probe: last.p, status: last.r.status, reason, checks }
}

/* ---------------------------------------------------------------------------------------------- texts */
const NET_TEXT = {
  timeout: (o) => [`❌ 连接超时（${o.sec} 秒没有响应）`, `「${o.host}」在 ${o.sec} 秒内没有回应：请检查地址和端口是否正确、网络或代理是否可用（国内访问海外服务可能需要代理）。`],
  dns: (o) => ['❌ 地址错误：找不到这个服务器（DNS 失败）', `找不到「${o.host}」：请检查网址有没有拼错，或者网络是否正常。`],
  refused: (o) => ['❌ 连接被拒绝：服务没有启动或端口不对', `「${o.host}」拒绝了连接：如果是本机服务，请先把它启动；否则检查端口号。`],
  tls: (o) => ['❌ 安全连接失败（HTTPS / 证书问题）', `和「${o.host}」建立安全连接失败：可能把 http 和 https 写反了，或者对方的证书有问题。`],
  unreachable: (o) => ['❌ 网络不通', `连不上「${o.host}」：请检查网络或代理。`],
  reset: (o) => ['❌ 连接被中途断开', `和「${o.host}」的连接被断开了：可能是网络或代理不稳定，稍后再试。`],
  other: (o) => ['❌ 连接失败', `连不上「${o.host}」${o.message ? `（${o.message}）` : ''}：请检查地址、网络或代理。`],
}

function finish(out, ctx) {
  const scrub = ctx.scrub || ((s) => s)
  const name = ctx.name || '服务商'
  const label = out.probe?.label || '测试接口'
  const st = Number(out.status) || 0
  const pm = out.msg ? `：${scrub(String(out.msg)).slice(0, 160)}` : ''
  const http = st ? `HTTP ${st}` : ''
  let level = 'warn'
  let title = ''
  let msg = ''
  let keyValid = null
  let ok = false
  switch (out.verdict) {
    case 'valid':
      level = 'ok'
      ok = true
      keyValid = true
      title = '✅ 连接成功：密钥有效（未生成内容，不扣费）'
      msg = `${name} 确认这个密钥可以使用（${http}）。测试只调用了免费的「${label}」接口。`
      break
    case 'valid-restricted':
      level = 'warn'
      keyValid = true
      title = `⚠️ 密钥有效，但权限不够（${http}）`
      msg = `${name} 认得这个密钥，但它没有「${label}」的权限${pm}。如果生成时也被拒绝，请到服务商后台检查这个密钥的权限、IP 白名单，或是否开通了对应服务 / 模型。`
      break
    case 'valid-billing':
      level = 'warn'
      keyValid = true
      title = '⚠️ 密钥有效，但账户余额或额度不足'
      msg = `${name} 认得这个密钥，但提示余额或额度不足（${http}${pm}）。充值或购买资源包后就能生成。`
      break
    case 'rejected':
      level = 'error'
      keyValid = false
      title = `❌ 密钥被拒绝（${http || '鉴权失败'}）`
      msg = `${name} 不接受这个密钥${pm}。请检查：是否复制完整、前后有没有多余空格、是否已过期或被删除，以及是不是这个服务商的密钥。${ctx.keyHint || ''}`
      break
    case 'forbidden':
      level = 'error'
      title = `❌ 访问被拒绝（${http}）`
      msg = `服务器拒绝了访问${pm}。可能是密钥无效、没有开通这项服务，或者 IP 不在白名单里（也可能被防火墙拦截）。`
      break
    case 'needs-key':
      level = 'error'
      keyValid = false
      title = `❌ 这个服务需要密钥（${http}）`
      msg = `服务器要求提供密钥${pm}：请先填写 API Key，再测试。`
      break
    case 'not-api':
      level = 'error'
      title = '❌ 地址不是该服务的接口（返回 HTML 网页）'
      msg = `这个地址返回的是一个网页（${http}），不是 API 接口。请填写服务商文档里的「接口地址 / Base URL」，不要填官网或控制台的网址。`
      break
    case 'not-found':
      level = 'warn'
      title = `⚠️ 能连上服务器，但没找到接口（${http}）`
      msg = '服务器有回应，但测试用到的接口都不存在：请检查「接口根地址 / Endpoint」是否填对（例如是否漏了 /v1、/api/v3）。'
      break
    case 'reachable':
      level = 'warn'
      title = '⚠️ 网关可以访问，但无法确认密钥是否有效'
      msg =
        out.reason === 'same-request'
          ? `服务器有回应（${http}），但请求头 / 地址里没有用到 {{apiKey}}，没法单独测试密钥。`
          : ctx.custom
            ? `服务器有回应（${http}）。自定义接口只检查「能不能连上」和「会不会拒绝密钥」：为了不误触发收费生成，测试不会调用提交接口，所以没法完全确认密钥。`
            : out.reason === 'public'
              ? `服务器有回应（${http}），但测试接口不需要密钥也能访问，所以没法用它确认密钥。第一次生成时如果提示密钥无效，再回来检查密钥。`
              : `服务器有回应（${http}），但这个服务没有可以免费验证密钥的接口，测试也不会去调用会扣费的生成接口。第一次生成时如果提示密钥无效，再回来检查密钥。`
      break
    case 'online-no-key': {
      level = 'ok'
      ok = true
      title = ctx.custom ? '✅ 网关可以访问（这个配置没有使用密钥）' : '✅ 连接成功：服务在线（没有设置密钥）'
      const reach = out.probe?.kind === 'reach'
      const how = reach && out.cls === 'badrequest' ? '，接口地址存在' : reach && out.cls === 'notfound' ? '（用 GET 访问返回 404：只接受 POST 的接口常常这样，属于正常）' : ''
      msg = `服务器有回应（${http}）${how}。${ctx.custom ? '自定义接口只检查能不能连上，测试不会调用提交接口。' : ''}`
      break
    }
    case 'rate-limited':
      level = 'warn'
      title = `⚠️ 请求太频繁（${http || 'HTTP 429'}）`
      msg = '服务商暂时限制了请求：密钥本身可能没问题，过一会儿再测试。'
      break
    case 'server-error':
      level = 'warn'
      title = `⚠️ 服务商暂时出错（${http}）`
      msg = '服务器那边出了问题（一般不是你的设置问题），稍后再试。'
      break
    case 'billing-unconfirmed':
      level = 'warn'
      title = `⚠️ 服务商提示余额或额度不足（${http}）`
      msg = `${name} 提示余额或额度不足${pm}，但没法确认密钥本身是否有效。`
      break
    case 'network': {
      level = 'error'
      let host = ''
      try {
        host = new URL(out.req?.url).host
      } catch {}
      const t = (NET_TEXT[out.net?.kind] || NET_TEXT.other)({ host: scrub(host || '服务器'), sec: Math.round((out.timeoutMs || ctx.timeoutMs || CONNECTION_TEST_TIMEOUT_MS) / 1000), message: scrub(out.net?.message || '') })
      title = t[0]
      msg = t[1]
      break
    }
    case 'aborted':
      level = 'warn'
      title = '测试已取消'
      msg = ''
      break
    case 'config':
      level = 'error'
      title = out.title || '❌ 信息没填完整'
      msg = out.message || ''
      break
    case 'not-applicable':
      level = 'info'
      title = out.title || '这个配置不需要网络连接'
      msg = out.message || ''
      break
    default:
      level = 'warn'
      title = '⚠️ 测试没有完成'
      msg = '在规定时间内没有得到明确结果，请稍后再试。'
  }
  const sentRequests = (out.checks || []).length > 0
  const tail = sentRequests ? (ctx.emptyText ? NO_CHARGE_EMPTY_TEXT : NO_CHARGE) : ''
  const keyLine =
    ctx.keySource === 'typed' ? '测试用的是你刚填写、还没保存的密钥。' : ctx.keySource === 'saved' ? `测试用的是已保存的密钥${ctx.switchedProvider ? '（你换了服务商：如果是新服务商，请填写它的密钥）' : ''}。` : ctx.keySource === 'env' ? '测试用的是 .env 里配置的密钥。' : ''
  const message = [msg, sentRequests && keyLine && out.verdict !== 'aborted' ? keyLine : '', tail].filter(Boolean).join('\n')
  return {
    ok,
    verdict: out.verdict,
    level,
    title: scrub(title),
    message: scrub(message),
    status: st,
    keyValid,
    keySource: ctx.keySource || 'none',
    billable: false,
    target: ctx.target || '',
    ...(ctx.category ? { category: ctx.category } : {}),
    ...(ctx.provider ? { provider: ctx.provider } : {}),
    notes: (out.notes || []).map((n) => scrub(n)),
    checks: (out.checks || []).map((c) => ({ ...c, step: scrub(c.step), request: scrub(c.request) })),
    testedAt: new Date().toISOString(),
  }
}

function configResult(ctx, title, message) {
  return finish({ verdict: 'config', title, message, checks: [] }, ctx)
}
/** where a JSON.parse error happened — never its quoted snippet of the text (it may contain a key) */
function jsonErrorWhere(err) {
  const m = String(err?.message || '')
  const lc = /line (\d+) column (\d+)/i.exec(m)
  if (lc) return `（第 ${lc[1]} 行第 ${lc[2]} 列附近）`
  const pos = /position (\d+)/i.exec(m)
  return pos ? `（第 ${Number(pos[1]) + 1} 个字符附近）` : ''
}

function makeEnv(opts = {}, key, fakeKey, extraSecrets = []) {
  const timeoutMs = Math.max(50, Number(opts.timeoutMs) || CONNECTION_TEST_TIMEOUT_MS)
  return {
    fetchFn: typeof opts.fetchImpl === 'function' ? opts.fetchImpl : globalThis.fetch,
    key,
    fakeKey,
    hasKey: Boolean(key),
    timeoutMs,
    deadline: Date.now() + Math.max(50, Number(opts.budgetMs) || CONNECTION_TEST_BUDGET_MS),
    signal: opts.signal,
    extraSecrets,
  }
}

async function runChecked(probes, env, ctx) {
  // the key, its parts (AK:SK, AppID:Token) and every credential header built from it are scrubbed from the result
  env.scrub = makeScrubber([env.key, ...String(env.key || '').split(':'), ...env.extraSecrets, ...probes.flatMap((p) => headerSecrets(buildRequest(p, env.key).headers))])
  const out = await runProbeChain(probes, env)
  return finish(out, { ...ctx, scrub: env.scrub, timeoutMs: env.timeoutMs })
}

/* ---------------------------------------------------------------------------------------------- probe builders */
const jsonHeaders = (h) => ({ Accept: 'application/json', ...h })
function modelListNote(model) {
  return (r) => {
    const list = Array.isArray(r.json?.data) ? r.json.data : Array.isArray(r.json?.models) ? r.json.models : []
    const ids = list.map((m) => str(typeof m === 'string' ? m : m?.id || m?.name).replace(/^models\//, '')).filter(Boolean)
    const want = str(model)
    if (!want || !ids.length) return []
    if (ids.some((id) => id.toLowerCase() === want.toLowerCase())) return [`模型「${want}」在这个接口的可用模型列表里。`]
    return [`不过这个接口的模型列表里没有「${want}」：如果生成时提示模型不存在，请核对模型 ID（列表里有：${ids.slice(0, 6).join('、')}${ids.length > 6 ? ' …' : ''}）。`]
  }
}
const probe = {
  openaiModels: (base, auth, model) => ({ id: 'models', label: '查询可用模型列表', kind: 'list', url: joinUrl(base, '/models'), headers: (k) => jsonHeaders(auth(k)), onValid: modelListNote(model) }),
  arkTaskList: (base, auth) => ({ id: 'ark-tasks', label: '查询任务列表', kind: 'list', url: joinUrl(base, '/contents/generations/tasks?page_num=1&page_size=1'), headers: (k) => jsonHeaders(auth(k)) }),
  taskQuery: (url, auth, interpret) => ({ id: 'task', label: '查询一个不存在的任务号', kind: 'task', url: `${stripSlash(url)}/${DUMMY_TASK_ID}`, headers: (k) => jsonHeaders(auth(k)), interpret }),
  bflCredits: (base, auth) => ({
    id: 'bfl-credits',
    label: '查询账户余额',
    kind: 'account',
    url: joinUrl(base, '/v1/credits'),
    headers: (k) => jsonHeaders(auth(k)),
    onValid: (r) => (typeof r.json?.credits === 'number' ? [`账户余额：${r.json.credits} credits。`] : []),
  }),
  bflResult: (base, auth) => ({ id: 'bfl-result', label: '查询一个不存在的任务号', kind: 'task', url: joinUrl(base, `/v1/get_result?id=${DUMMY_UUID}`), headers: (k) => jsonHeaders(auth(k)) }),
  falPricing: (platformBase, auth, model) => ({
    id: 'fal-pricing',
    label: '查询模型价格',
    kind: 'account',
    url: `${stripSlash(platformBase)}/models/pricing?endpoint_id=${encodeURIComponent(model)}`,
    headers: (k) => jsonHeaders(auth(k)),
    onValid: (r) => {
      const prices = Array.isArray(r.json?.prices) ? r.json.prices : null
      if (!prices) return []
      const hit = prices.find((p) => str(p?.endpoint_id) === model)
      if (hit && hit.unit_price !== undefined) return [`模型「${model}」的价格：${hit.unit_price} ${str(hit.currency) || 'USD'} / ${str(hit.unit) || '次'}。`]
      return [`不过价格表里没有「${model}」：请核对模型 ID。`]
    },
  }),
  falStatus: (queueBase, auth, model) => {
    const [owner, app] = str(model).replace(/^\/+/, '').split('/')
    return { id: 'fal-status', label: '查询一个不存在的任务号', kind: 'task', url: `${stripSlash(queueBase)}/${owner || 'fal-ai'}/${app || 'flux'}/requests/${DUMMY_UUID}/status`, headers: (k) => jsonHeaders(auth(k)) }
  },
  klingCosts: (base, auth, now) => ({
    id: 'kling-costs',
    label: '查询账户资源包余量',
    kind: 'account',
    url: joinUrl(base, `/account/costs?start_time=${now - 30 * 24 * 3600 * 1000}&end_time=${now}`),
    headers: (k) => jsonHeaders(auth(k)),
    interpret: interpretKling,
    onValid: (r) => {
      const packs = r.json?.data?.resource_pack_subscribe_infos
      if (!Array.isArray(packs)) return []
      const live = packs.filter((p) => !p?.status || p.status === 'online')
      const left = live.reduce((s, p) => s + (Number(p?.remaining_quantity) || 0), 0)
      return [`资源包：${live.length} 个可用，剩余约 ${left}。`]
    },
  }),
  minimaxVoices: (base, auth, voiceId) => ({
    id: 'minimax-voices',
    label: '查询可用音色列表',
    kind: 'list',
    method: 'POST',
    url: joinUrl(base, '/v1/get_voice'),
    headers: (k) => jsonHeaders({ 'Content-Type': 'application/json', ...auth(k) }),
    body: JSON.stringify({ voice_type: 'all' }),
    interpret: interpretMinimax,
    onValid: (r) => {
      const want = str(voiceId)
      if (!want || !r.json || typeof r.json !== 'object') return []
      const ids = Object.values(r.json)
        .filter(Array.isArray)
        .flat()
        .map((v) => str(v?.voice_id))
        .filter(Boolean)
      if (!ids.length || ids.includes(want)) return []
      return [`不过你填的音色 ID「${want}」不在这个账号可用的音色列表里：请核对音色 ID。`]
    },
  }),
  minimaxVideoQuery: (base, auth) => ({ id: 'minimax-query', label: '查询一个不存在的任务号', kind: 'task', url: joinUrl(base, `/v1/query/video_generation?task_id=${DUMMY_TASK_ID}`), headers: (k) => jsonHeaders(auth(k)), interpret: interpretMinimax }),
  sunoCredit: (base, auth) => ({
    id: 'suno-credit',
    label: '查询剩余积分',
    kind: 'account',
    url: joinUrl(base, '/api/v1/generate/credit'),
    headers: (k) => jsonHeaders(auth(k)),
    interpret: interpretSuno,
    onValid: (r) => (typeof r.json?.data === 'number' ? [`剩余积分：${r.json.data}。`] : []),
  }),
  sunoFetch: (base, auth) => ({ id: 'suno-fetch', label: '查询一个不存在的任务号', kind: 'task', url: joinUrl(base, `/suno/fetch/${DUMMY_TASK_ID}`), headers: (k) => jsonHeaders(auth(k)), interpret: interpretSuno }),
  elevenUser: (base, auth) => ({
    id: 'eleven-user',
    label: '查询账户额度',
    kind: 'account',
    url: joinUrl(base, '/v1/user'),
    headers: (k) => jsonHeaders(auth(k)),
    onValid: (r) => {
      const s = r.json?.subscription
      return s && Number.isFinite(Number(s.character_count)) && Number.isFinite(Number(s.character_limit)) ? [`本月已用字符：${s.character_count} / ${s.character_limit}。`] : []
    },
  }),
  elevenModels: (base, auth) => ({ id: 'eleven-models', label: '查询可用模型列表', kind: 'list', url: joinUrl(base, '/v1/models'), headers: (k) => jsonHeaders(auth(k)) }),
  /** Volcengine openspeech v1: a synthesis request with EMPTY text is rejected (3011) before any audio is made */
  doubaoEmptyText: (url, { cluster, voiceType }) => ({
    id: 'doubao-empty',
    label: '发送空文本（不会合成声音）',
    kind: 'input',
    method: 'POST',
    url,
    headers: (k) => {
      const [, ...rest] = String(k || '').split(':')
      return jsonHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer;${rest.join(':').trim()}` })
    },
    body: (k) => {
      const [appId, ...rest] = String(k || '').split(':')
      const token = rest.join(':').trim()
      return JSON.stringify({
        app: { appid: str(appId), token, cluster: str(cluster) || 'volcano_tts' },
        user: { uid: 'dsh-video-workbench' },
        audio: { voice_type: str(voiceType) || 'zh_male_m392_conversation_wvae_bigtts', encoding: 'mp3', speed_ratio: 1.0 },
        request: { reqid: `dsh-conntest-${Date.now().toString(36)}`, text: '', text_type: 'plain', operation: 'query' },
      })
    },
    interpret: interpretDoubao,
  }),
  /** GET on a POST-only route: proves the address answers, never submits anything */
  reach: (url, headers, label = '访问接口地址（不提交任务）') => ({ id: 'reach', label, kind: 'reach', url, headers }),
}

const isArkHost = (base) => /volces\.com|volcengineapi\.com|ark\.[a-z-]+\.volces/i.test(str(base))
function falPlatformBase(base) {
  const u = parseHttpUrl(base)
  if (u && /(^|\.)fal\.(run|ai|media)$/i.test(u.hostname)) return 'https://api.fal.ai/v1'
  return joinUrl(stripSlash(base), '/v1')
}
function falQueueBase(base) {
  const u = parseHttpUrl(base)
  if (u && /^fal\.run$/i.test(u.hostname)) return 'https://queue.fal.run'
  return stripSlash(base)
}
function authFor(protocol) {
  switch (protocol) {
    case 'bfl-flux':
      return (k) => ({ 'x-key': k })
    case 'fal-image':
      return (k) => ({ Authorization: `Key ${k}` })
    case 'kling-image':
    case 'kling-video':
      return (k) => ({ Authorization: buildKlingAuthHeader(k) })
    case 'elevenlabs-sfx':
      return (k) => ({ 'xi-api-key': k })
    default:
      return (k) => ({ Authorization: `Bearer ${k}` })
  }
}
function fakeKeyFor(protocol, key) {
  if ((protocol === 'kling-image' || protocol === 'kling-video') && key.includes(':') && !key.startsWith('eyJ')) return FAKE_KLING_AKSK
  if (protocol === 'volcengine-doubao-tts') return FAKE_DOUBAO
  return FAKE_KEY
}

/* ---------------------------------------------------------------------------------------------- custom protocol */
function customVars(cfg, key) {
  return {
    apiKey: key,
    model: str(cfg.model),
    prompt: '',
    lyrics: '',
    tags: '',
    title: '',
    duration: 5,
    aspectRatio: '16:9',
    imageUrl: '',
    instrumental: false,
    characterDescription: '',
    referenceImage: '',
    taskId: DUMMY_TASK_ID,
  }
}
/** reachability + auth-rejection only: never sends the submit request (the method that would start a job) */
function customProbes(cfg) {
  const c = cfg.custom || {}
  const headers = (k) => renderCustomHeaders(c, customVars(cfg, k))
  const submitTpl = str(c.submitUrl) || joinUrl(cfg.baseUrl, cfg.endpoint)
  const submitUrl = (k) => renderTemplateValue(submitTpl, customVars(cfg, k), false)
  const probes = []
  if (c.mode === 'async-poll' && str(c.pollUrlTemplate)) {
    probes.push({
      id: 'custom-poll',
      label: '用不存在的任务号查询一次',
      kind: 'task',
      method: str(c.pollMethod).toUpperCase() === 'POST' ? 'POST' : 'GET',
      url: (k) => renderTemplateValue(c.pollUrlTemplate, customVars(cfg, k), false),
      headers,
    })
  }
  const m = /^(https?:\/\/[^?#]+?\/v\d+)(?:\/|$)/i.exec(submitUrl(''))
  if (m && !/\{\{/.test(m[1])) probes.push({ ...probe.openaiModels(m[1], () => ({}), ''), headers: (k) => ({ Accept: 'application/json', ...headers(k) }) })
  const method = str(c.method || 'POST').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    probes.push(probe.reach(submitUrl, headers, '用 GET 访问提交地址（不提交任务）'))
  } else {
    const u = parseHttpUrl(submitUrl(''))
    if (u) probes.push(probe.reach(`${u.origin}/`, headers, '访问服务器根地址（不调用生成接口）'))
  }
  return probes
}

/* ---------------------------------------------------------------------------------------------- cloud media */
/** The cloud-media probes for one category config (exported for the tests). */
export function buildCloudMediaProbes(category, cfg, { now = Date.now() } = {}) {
  const protocol = cfg.protocol
  const base = stripSlash(cfg.baseUrl)
  const auth = authFor(protocol)
  const ep = joinUrl(base, cfg.endpoint)
  switch (protocol) {
    case 'openai-image':
      return isArkHost(base) || cfg.providerId === 'volcengine-seedream' ? [probe.arkTaskList(base, auth), probe.openaiModels(base, auth, cfg.model)] : [probe.openaiModels(base, auth, cfg.model)]
    case 'bfl-flux':
      return [probe.bflCredits(base, auth), probe.bflResult(base, auth)]
    case 'fal-image': {
      const model = str(cfg.endpoint).replace(/^\/+/, '') || str(cfg.model) || 'fal-ai/flux/schnell'
      const modelId = /^https?:\/\//i.test(model) ? new URL(model).pathname.replace(/^\/+/, '') : model
      return [probe.falPricing(falPlatformBase(base), auth, modelId), probe.falStatus(falQueueBase(base), auth, modelId)]
    }
    case 'kling-image':
    case 'kling-video':
      return [probe.klingCosts(base, auth, now), probe.taskQuery(ep, auth, interpretKling)]
    case 'volcengine-seedance':
      return [probe.arkTaskList(base, auth), probe.taskQuery(ep, auth), probe.openaiModels(base, auth, cfg.model)]
    case 'minimax-hailuo':
      return [probe.minimaxVoices(base, auth), probe.minimaxVideoQuery(base, auth)]
    case 'minimax-music':
    case 'minimax-speech':
      return [probe.minimaxVoices(base, auth)]
    case 'openai-video':
      return [probe.openaiModels(base, auth, cfg.model), probe.taskQuery(ep, auth)]
    case 'suno-music':
      return [probe.sunoCredit(base, auth), probe.sunoFetch(base, auth), probe.openaiModels(joinUrl(base, '/v1'), auth, '')]
    case 'volcengine-doubao-tts':
      return [probe.doubaoEmptyText(ep, { voiceType: cfg.model })]
    case 'elevenlabs-sfx':
      return [probe.elevenUser(base, auth), probe.elevenModels(base, auth)]
    case 'custom':
      return customProbes(cfg)
    default:
      return [probe.openaiModels(base, auth, cfg.model)]
  }
}

/**
 * 「测试连接」 for one cloud-media category, with the draft values of the form. `saved` = the saved config (defaults to
 * loadCloudMediaConfig(); tests pass their own).
 */
export async function testCloudMediaConnection(opts = {}) {
  const category = str(opts.category)
  if (!['image', 'video', 'audio'].includes(category)) throw new ConnectionTestInputError('category 只能是 image / video / audio')
  const draft = opts.config && typeof opts.config === 'object' && !Array.isArray(opts.config) ? opts.config : {}
  const savedAll = opts.saved !== undefined ? opts.saved : loadCloudMediaConfig()
  const savedCat = (savedAll && savedAll[category]) || {}
  const presets = CLOUD_MEDIA_PRESETS[category]
  const providerId = str(draft.providerId) || str(savedCat.providerId) || presets[0].id
  const preset = presets.find((p) => p.id === providerId) || null
  const switchedProvider = Boolean(str(savedCat.providerId) && providerId !== str(savedCat.providerId))
  // switching to another preset in the draft: fields the draft does not carry come from that preset, not the old one
  const basis = switchedProvider || !str(savedCat.providerId) ? { baseUrl: preset?.baseUrl || '', endpoint: preset?.endpoint || '', model: preset?.defaultModel || '' } : savedCat
  const pick = (k) => (draft[k] !== undefined && draft[k] !== null ? str(draft[k]) : str(basis[k]))
  const protocol = str(draft.protocol) || preset?.protocol || str(savedCat.protocol) || 'custom'
  const cfg = {
    providerId,
    protocol,
    baseUrl: pick('baseUrl') || preset?.baseUrl || '',
    endpoint: pick('endpoint') || (protocol === 'custom' ? '' : preset?.endpoint || ''),
    model: pick('model') || preset?.defaultModel || '',
    custom: { ...(savedCat.custom || {}), ...(draft.custom && typeof draft.custom === 'object' ? draft.custom : {}) },
  }
  const typed = isTypedSecret(draft.apiKey)
  const key = typed ? str(draft.apiKey) : draft.clearApiKey === true ? '' : str(savedCat.apiKey)
  const name = shortName(preset?.name || providerId)
  const ctx = {
    target: 'cloud-media',
    category,
    provider: { id: providerId, name },
    name,
    keySource: typed ? 'typed' : key ? 'saved' : 'none',
    switchedProvider: !typed && Boolean(key) && switchedProvider,
    custom: protocol === 'custom',
    emptyText: protocol === 'volcengine-doubao-tts',
    keyHint: protocol === 'kling-image' || protocol === 'kling-video' ? '可灵可以填 Bearer Token，也可以填「AccessKey:SecretKey」。' : protocol === 'volcengine-doubao-tts' ? '豆包语音要按「AppID:Token」格式填写。' : '',
    scrub: makeScrubber([key, ...key.split(':')]),
  }
  if (protocol === 'custom') {
    const submit = str(cfg.custom.submitUrl) || joinUrl(cfg.baseUrl, cfg.endpoint)
    if (!submit) return configResult(ctx, '❌ 还没有填写提交 URL', '自定义接口要先填写「提交 URL（Submit URL）」，再测试。')
    if (!parseHttpUrl(renderTemplateValue(submit, customVars(cfg, ''), false))) return configResult(ctx, '❌ 提交 URL 格式不对', '提交 URL 需要以 http:// 或 https:// 开头。')
    try {
      // a placeholder key: the JSON parser's message may quote the text (never echo a secret)
      renderCustomHeaders(cfg.custom, customVars(cfg, 'placeholder-key'))
    } catch (err) {
      return configResult(ctx, '❌ 请求头 Headers JSON 格式不对', `Headers JSON 不是合法的 JSON${jsonErrorWhere(err)}：请检查引号、逗号和大括号是否成对。`)
    }
  } else {
    if (!parseHttpUrl(cfg.baseUrl)) return configResult(ctx, '❌ 接口根地址格式不对', '「接口根地址 Base URL」需要以 http:// 或 https:// 开头，例如 https://api.example.com/v1。')
    if (!key) return configResult(ctx, '❌ 还没有填写 API Key', `先在上面粘贴 ${name} 的 API Key，再点「测试连接」。`)
    if (protocol === 'volcengine-doubao-tts' && !/^[^:]+:.+$/.test(key)) {
      return configResult(ctx, '❌ 密钥格式不对', '豆包语音的密钥要按「AppID:Token」格式填写（中间用英文冒号隔开）。')
    }
  }
  const probes = buildCloudMediaProbes(category, cfg, { now: Number(opts.now) || Date.now() })
  const env = makeEnv(opts, key, key ? fakeKeyFor(protocol, key) : '')
  return runChecked(probes, env, ctx)
}

/* ---------------------------------------------------------------------------------------------- TTS */
function minimaxBaseFromEndpoint(endpoint) {
  return stripSlash(endpoint)
    .replace(/\/v1\/t2a_v2$/i, '')
    .replace(/\/t2a_v2$/i, '')
    .replace(/\/v1$/i, '')
}

/** 「测试连接」 for the cloud TTS channels of the 配音引擎 tab (MiniMax Speech · 火山方舟豆包语音). */
export async function testTtsBuiltinConnection(opts = {}) {
  const engineId = str(opts.engineId)
  const draft = opts.config && typeof opts.config === 'object' ? opts.config : {}
  const savedAll = opts.saved !== undefined ? opts.saved : loadTtsConfig().builtins
  const saved = (savedAll && savedAll[engineId]) || {}
  if (engineId === 'minimax-tts') {
    const endpoint = str(draft.endpoint) || str(saved.endpoint) || 'https://api.minimaxi.com/v1/t2a_v2'
    const typed = isTypedSecret(draft.apiKey)
    const key = typed ? str(draft.apiKey) : draft.clearApiKey === true ? '' : str(saved.apiKey)
    const ctx = { target: 'tts-builtin', provider: { id: engineId, name: 'MiniMax Speech' }, name: 'MiniMax', keySource: typed ? 'typed' : key ? 'saved' : 'none' }
    if (!parseHttpUrl(endpoint)) return configResult(ctx, '❌ 接口地址格式不对', '接口地址需要以 http:// 或 https:// 开头，例如 https://api.minimaxi.com/v1/t2a_v2。')
    if (!key) return configResult(ctx, '❌ 还没有填写 MiniMax API Key', '先粘贴 MiniMax 的 API Key，再点「测试连接」。')
    const auth = authFor('minimax-speech')
    const probes = [probe.minimaxVoices(minimaxBaseFromEndpoint(endpoint), auth, str(draft.voiceId) || str(saved.voiceId))]
    return runChecked(probes, makeEnv(opts, key, FAKE_KEY), ctx)
  }
  if (engineId === 'doubao-tts') {
    const endpoint = str(draft.endpoint) || str(saved.endpoint) || 'https://openspeech.bytedance.com/api/v1/tts'
    const appId = draft.appId !== undefined ? str(draft.appId) : str(saved.appId)
    const typed = isTypedSecret(draft.token)
    const token = typed ? str(draft.token) : draft.clearToken === true ? '' : str(saved.token)
    const ctx = { target: 'tts-builtin', provider: { id: engineId, name: '豆包语音' }, name: '火山引擎豆包语音', keySource: typed ? 'typed' : token ? 'saved' : 'none', emptyText: true }
    if (!parseHttpUrl(endpoint)) return configResult(ctx, '❌ 接口地址格式不对', '接口地址需要以 http:// 或 https:// 开头。')
    if (!appId) return configResult(ctx, '❌ 还没有填写火山 AppID', '先填写火山引擎控制台里的 AppID，再测试。')
    if (!token) return configResult(ctx, '❌ 还没有填写 Access Token', '先粘贴火山引擎控制台里的 Access Token，再测试。')
    const key = `${appId}:${token}`
    const probes = [probe.doubaoEmptyText(endpoint, { cluster: str(draft.cluster) || str(saved.cluster), voiceType: str(draft.voiceType) || str(saved.voiceType) })]
    return runChecked(probes, makeEnv(opts, key, FAKE_DOUBAO, [appId, token]), ctx)
  }
  throw new ConnectionTestInputError(`不支持测试的配音引擎：${engineId || '(空)'}`)
}

/** 「测试连接」 for a custom TTS model (OpenAI /v1/audio/speech or HTTP JSON) — the synthesis request is never sent. */
export async function testTtsCustomConnection(opts = {}) {
  const e = opts.engine && typeof opts.engine === 'object' ? opts.engine : {}
  const kind = ['openai-tts', 'http-json', 'cli-command'].includes(e.kind) ? e.kind : 'http-json'
  const savedList = opts.saved !== undefined ? opts.saved : loadTtsConfig().customEngines
  const saved = (Array.isArray(savedList) ? savedList : []).find((x) => x && str(e.editingId) && x.id === str(e.editingId)) || {}
  const name = str(e.name) || str(saved.name) || '自定义配音模型'
  const typed = isTypedSecret(e.apiKey)
  const key = typed ? str(e.apiKey) : e.clearApiKey === true ? '' : str(saved.apiKey)
  const ctx = { target: 'tts-custom', provider: { id: str(e.editingId) || str(e.id), name }, name, keySource: typed ? 'typed' : key ? 'saved' : 'none' }
  if (kind === 'cli-command') {
    return finish({ verdict: 'not-applicable', title: '本地命令行模型不需要网络连接', message: '这类模型直接在本机运行：保存并启用后，在「选择与配置引擎」里点「试听测试」检查是否能出声。', checks: [] }, ctx)
  }
  const endpoint = str(e.endpoint)
  if (!endpoint) return configResult(ctx, '❌ 还没有填写接口地址', '先填写这个配音模型的接口地址，再测试。')
  if (!parseHttpUrl(endpoint)) return configResult(ctx, '❌ 接口地址格式不对', '接口地址需要以 http:// 或 https:// 开头，例如 http://127.0.0.1:8080/v1/audio/speech。')
  const extraHeaders = saved.headers && typeof saved.headers === 'object' ? saved.headers : {}
  const headers = (k) => {
    const h = { ...extraHeaders }
    if (k && !h.Authorization && !h.authorization) h.Authorization = `Bearer ${k}`
    return h
  }
  let probes
  if (kind === 'openai-tts') {
    const target = /\/audio\/speech\/?$/i.test(endpoint) ? stripSlash(endpoint) : `${stripSlash(endpoint)}/audio/speech`
    const base = target.replace(/\/audio\/speech$/i, '')
    probes = [{ ...probe.openaiModels(base, () => ({}), str(e.model)), headers: (k) => jsonHeaders(headers(k)) }, probe.reach(target, headers, '用 GET 访问合成地址（不合成）')]
  } else if (str(e.method).toUpperCase() === 'GET') {
    probes = [probe.reach(`${parseHttpUrl(endpoint).origin}/`, headers, '访问服务器根地址（不调用合成接口）')]
  } else {
    probes = [probe.reach(stripSlash(endpoint), headers, '用 GET 访问合成地址（不合成）')]
  }
  return runChecked(probes, makeEnv(opts, key, key ? FAKE_KEY : ''), ctx)
}

/* ---------------------------------------------------------------------------------------------- avatar / lip-sync */
/** the saved external avatar service (same file and .env fallback as dsh-tool-avatar/avatar-engine.js) */
function readSavedAvatarProvider() {
  loadEnv()
  let file = {}
  try {
    const p = join(resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home'), 'avatar-config.json')
    if (existsSync(p)) file = JSON.parse(readFileSync(p, 'utf8')) || {}
  } catch {}
  return {
    provider: str(file.provider || process.env.AVATAR_PROVIDER || 'auto').toLowerCase() || 'auto',
    endpoint: str(file.endpoint || process.env.AVATAR_ENDPOINT || ''),
    apiKey: str(file.apiKey || process.env.AVATAR_API_KEY || ''),
  }
}

/** 「测试连接」 for the external MuseTalk / LatentSync avatar service (never calls its generate route with POST). */
export async function testAvatarProviderConnection(opts = {}) {
  const draft = opts.config && typeof opts.config === 'object' ? opts.config : {}
  const saved = opts.saved !== undefined ? opts.saved || {} : readSavedAvatarProvider()
  const provider = str(draft.provider) || str(saved.provider) || 'auto'
  const endpoint = draft.endpoint !== undefined ? str(draft.endpoint) : str(saved.endpoint)
  const typed = isTypedSecret(draft.apiKey)
  const key = typed ? str(draft.apiKey) : str(saved.apiKey)
  const ctx = { target: 'avatar-provider', provider: { id: provider, name: '外接数字人服务' }, name: '外接数字人服务', keySource: typed ? 'typed' : key ? 'saved' : 'none' }
  if (provider === 'local-composite') {
    return finish({ verdict: 'not-applicable', title: '「仅本地合成」不需要外接服务', message: '当前选择的是仅本地合成：数字人在本机生成，不会连接外部接口。', checks: [] }, ctx)
  }
  if (!endpoint) return configResult(ctx, '❌ 还没有填写接口地址', '先填写外接服务的接口地址（例如 http://127.0.0.1:7865），再测试。')
  const u = parseHttpUrl(endpoint)
  if (!u) return configResult(ctx, '❌ 接口地址格式不对', '接口地址需要以 http:// 或 https:// 开头，例如 http://127.0.0.1:7865。')
  const clean = stripSlash(endpoint)
  const target = /\/generate/.test(clean) ? clean : `${clean}/api/generate_avatar`
  const headers = (k) => (k ? { Authorization: `Bearer ${k}` } : {})
  const probes = [probe.reach(target, headers, '用 GET 访问生成地址（不生成）'), probe.reach(`${u.origin}/`, headers, '访问服务器根地址')]
  return runChecked(probes, makeEnv(opts, key, key ? FAKE_KEY : ''), ctx)
}

/** 「测试连接」 for the fal.ai cloud lip-sync key (from .env: AVATAR_LIPSYNC_CLOUD_API_KEY / FAL_KEY). */
export async function testLipsyncCloudConnection(opts = {}) {
  let cloud = opts.cloud
  if (!cloud) {
    const { resolveLipsyncConfig } = await import('../dsh-tool-avatar/lipsync-engine.js')
    cloud = resolveLipsyncConfig().cloud || {}
  }
  const key = str(cloud.apiKey)
  const endpoint = str(cloud.endpoint) || 'https://queue.fal.run'
  const model = str(cloud.model) || 'fal-ai/latentsync'
  const ctx = { target: 'lipsync-cloud', provider: { id: 'fal', name: 'fal.ai' }, name: 'fal.ai', keySource: key ? 'env' : 'none' }
  if (!key) return configResult(ctx, '❌ 没有配置 fal.ai 密钥', '云端口型同步的密钥写在 .env 里：AVATAR_LIPSYNC_CLOUD_API_KEY 或 FAL_KEY（可在 fal.ai 后台免费创建），保存 .env 后再测试。')
  if (!parseHttpUrl(endpoint)) return configResult(ctx, '❌ 接口地址格式不对', 'AVATAR_LIPSYNC_CLOUD_ENDPOINT 需要以 https:// 开头（默认 https://queue.fal.run）。')
  const auth = authFor('fal-image')
  const probes = [probe.falPricing(falPlatformBase(endpoint), auth, model), probe.falStatus(falQueueBase(endpoint), auth, model)]
  return runChecked(probes, makeEnv(opts, key, FAKE_KEY), ctx)
}

/* ---------------------------------------------------------------------------------------------- stock */
/** Pexels / Pixabay: reuse stock-media.js testStockMediaKey (free APIs), mapped onto the common result shape. */
export async function testStockConnection(opts = {}) {
  const provider = str(opts.provider) === 'pixabay' ? 'pixabay' : 'pexels'
  const name = provider === 'pixabay' ? 'Pixabay' : 'Pexels'
  const res = await testStockMediaKey({ provider, apiKey: typeof opts.apiKey === 'string' ? opts.apiKey : '', fetchImpl: opts.fetchImpl || null, timeoutMs: Number(opts.timeoutMs) || CONNECTION_TEST_TIMEOUT_MS })
  const status = Number(res?.status) || 0
  let level = 'error'
  let title = `❌ 连接失败${status ? `（HTTP ${status}）` : ''}`
  let verdict = 'network'
  if (res?.ok) {
    level = 'ok'
    title = '✅ 连接成功：密钥有效（免费接口，不扣费）'
    verdict = 'valid'
  } else if (res?.configured === false) {
    title = `❌ 还没有填写 ${name} API Key`
    verdict = 'config'
  } else if (res?.invalidKey) {
    title = `❌ 密钥被拒绝${status ? `（HTTP ${status}）` : ''}`
    verdict = 'rejected'
  } else if (res?.rateLimited) {
    level = 'warn'
    title = '⚠️ 请求太频繁，请稍后再测'
    verdict = 'rate-limited'
  }
  const keySource = res?.source === 'typed' ? 'typed' : res?.source === 'saved' ? 'saved' : res?.source === 'env' ? 'env' : 'none'
  return {
    ok: Boolean(res?.ok),
    verdict,
    level,
    title,
    message: [str(res?.message), keySource === 'typed' ? '测试用的是你刚填写、还没保存的 Key。' : keySource === 'saved' ? '测试用的是已保存的 Key。' : keySource === 'env' ? '测试用的是 .env 里的 Key。' : ''].filter(Boolean).join('\n'),
    status,
    keyValid: res?.ok ? true : res?.invalidKey ? false : null,
    keySource,
    billable: false,
    target: 'stock',
    provider: { id: provider, name },
    notes: [],
    checks: [],
    testedAt: new Date().toISOString(),
  }
}

/* ---------------------------------------------------------------------------------------------- dispatcher */
/** POST connection-test body → result. Throws (status 400) on an unknown target / malformed input. */
export async function runConnectionTest(payload = {}, opts = {}) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const target = str(p.target)
  switch (target) {
    case 'cloud-media':
      return testCloudMediaConnection({ ...opts, category: p.category, config: p.config })
    case 'tts-builtin':
      return testTtsBuiltinConnection({ ...opts, engineId: p.engineId, config: p.config })
    case 'tts-custom':
      return testTtsCustomConnection({ ...opts, engine: p.engine })
    case 'avatar-provider':
      return testAvatarProviderConnection({ ...opts, config: p.config })
    case 'lipsync-cloud':
      return testLipsyncCloudConnection({ ...opts })
    case 'stock':
      return testStockConnection({ ...opts, provider: p.provider, apiKey: p.apiKey })
    default:
      throw new ConnectionTestInputError(`未知的测试对象 target：${target || '(空)'}（可选：${CONNECTION_TEST_TARGETS.join(' / ')}）`)
  }
}
