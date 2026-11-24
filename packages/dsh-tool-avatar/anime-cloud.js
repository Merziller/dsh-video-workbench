/**
 * 动漫形象数字人 · 云端档（tier 3）— the user's own account at Vidu / 火山引擎 / Runway (contract: ANIME-AVATAR.md).
 *
 * One clip = the character speaking one cut's voice, as a transparent VP9 WebM (the same output as tier 2):
 *   1. the portrait is put on a flat key colour (green; blue when the character itself wears a lot of green), 3:4
 *   2. the voice is split at pauses into pieces the service accepts (火山引擎 普通 / 灵动 ≤ 180 s, 大画幅 ≤ 45 s, …),
 *      on frame boundaries, so the pieces join frame-exactly
 *   3. each piece is submitted with the user's own key, polled and downloaded
 *   4. FFmpeg keys the colour out (chromakey + despill), joins the pieces, crops to the character, VP9 + alpha
 *
 * Money: nothing is submitted unless `confirmedRmb` ≥ this module's own estimate of what is still to pay (the caller,
 * planAnimePresenter, checks as well). Every submitted task id and every downloaded piece is written to a ledger next to
 * the clip before going on, so a retry (crash, stop, re-key) polls the same tasks / re-uses the files instead of paying
 * again. Provider-side avatars (Runway avatar, 火山引擎 形象) are made once per portrait picture and saved on the
 * character. 火山引擎 only takes public links: the picture / voice are put in the user's own TOS bucket for the job
 * (pre-signed, S3-compatible endpoint) and deleted afterwards.
 *
 * Keys live in `.dsh-video-anime-cloud.json` in the writable workspace (never in a project; only ever sent to the
 * service itself). `DSH_VIDEO_ANIME_CLOUD_CONFIG` points tests at a scratch file.
 * Prices (official pages, checked 2026-11-24): see CLOUD_PRICES.
 */
import { spawn } from 'node:child_process'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createAbortError, killProcessTree, loadEnv, probeAudioDuration, REPO_ROOT, resolveBinaries } from '../shared/index.js'
import { characterFileAbs, getCharacter, saveCharacterCloudId } from './anime-character.js'
import { readImageRgba, writePngRgba } from './anime-sprite.js'
import { computeVisemeTrack } from './anime-visemes.js'

export const ANIME_CLOUD_VERSION = 1
export const ANIME_CLOUD_ENGINES = Object.freeze(['vidu', 'volc', 'runway'])
export const ANIME_CLOUD_CONFIG_FILENAME = '.dsh-video-anime-cloud.json'
const PRICE_DATE = '2026-11-24'
const USD_TO_RMB = 7.3

/** Official prices (per piece, rounded up by the provider's own unit). */
export const CLOUD_PRICES = Object.freeze({
  vidu: { rmbPerCredit: 0.03125, secPerCredit: 1, sourceUrl: 'https://platform.vidu.com/vidu-stream/doc/s2-avatar/async/parameters', basis: 'Vidu 数字人（非实时）每秒 1 积分、1 积分 0.03125 元，失败自动退款' },
  volc: { rmbPerSec: 0.3, createRmb: 0.1, sourceUrl: 'https://www.volcengine.com/docs/85128/1433887', basis: '火山引擎单图音频驱动 0.3 元/秒；第一次用这张形象图（每种模式）建形象 0.1 元；失败不收费' },
  runway: { usdPerCredit: 0.01, secPerCredit: 3, sourceUrl: 'https://docs.dev.runwayml.com/guides/pricing/', basis: `Runway 数字人视频每 3 秒 1 积分、1 积分 0.01 美元（按 1 美元≈${USD_TO_RMB} 元估算）` },
})

/** 火山引擎 drive modes (req_key per step) — official limits: 普通 / 灵动 ≤ 180 s, 大画幅灵动 ≤ 45 s of audio. */
export const VOLC_MODES = Object.freeze({
  loopy: { label: '灵动（整张脸都动，输出 512×512，推荐动漫形象用）', createKey: 'realman_avatar_picture_create_role_loopy', videoKey: 'realman_avatar_picture_loopy', maxSec: 170 },
  normal: { label: '普通（只动嘴，保持原图比例；漫画式的嘴可能带不动）', createKey: 'realman_avatar_picture_create_role', videoKey: 'realman_avatar_picture_v2', maxSec: 170 },
  loopyb: { label: '大画幅灵动（脸和上半身都动，最慢，每段最长 45 秒）', createKey: 'realman_avatar_picture_create_role_loopyb', videoKey: 'realman_avatar_picture_loopyb', maxSec: 42 },
})
export const VIDU_MODES = Object.freeze({
  '540p': { label: '540p（默认）' },
  '720p': { label: '720p（更清楚，同价）' },
})
// the longest piece sent in one task (Vidu / Runway publish no limit: one minute / two minutes keeps tasks short)
const MAX_PIECE_SEC = { vidu: 60, runway: 120 }
const CONCURRENCY = { vidu: 3, runway: 2, volc: 2 }

const VOLC_HOST = 'visual.volcengineapi.com'
const VOLC_REGION = 'cn-north-1'
const VOLC_SERVICE = 'cv'
const VOLC_VERSION = '2022-08-31'
const RUNWAY_BASE = 'https://api.dev.runwayml.com'
const RUNWAY_VERSION = '2024-11-06'
const RUNWAY_DATA_URI_MAX = 3_200_000 // raw bytes: a data URI may be 5 MB encoded (base64 adds a third)
const KEY_COLORS = Object.freeze({
  green: { rgb: [0, 255, 0], hex: '0x00FF00', despill: 'green' },
  blue: { rgb: [0, 0, 255], hex: '0x0000FF', despill: 'blue' },
})
const KEY_SIMILARITY = 0.16
const KEY_BLEND = 0.08

const ENGINE_NAMES = { vidu: 'Vidu', volc: '火山引擎', runway: 'Runway' }
const LINKS = {
  vidu: { console: 'https://platform.vidu.cn/api-keys', consoleGlobal: 'https://platform.vidu.com/api-keys', docs: 'https://platform.vidu.com/vidu-stream/doc/s2-avatar/async/introduction' },
  volc: { console: 'https://console.volcengine.com/iam/keymanage/', tos: 'https://console.volcengine.com/tos/bucket', docs: 'https://www.volcengine.com/docs/85128/1433887' },
  runway: { console: 'https://dev.runwayml.com/', docs: 'https://docs.dev.runwayml.com/' },
}

const r2up = (v) => Math.ceil(Math.max(0, Number(v) || 0) * 100 - 1e-6) / 100
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function coded(message, code, extra = {}) {
  const err = new Error(message)
  err.code = code
  Object.assign(err, extra)
  return err
}

/* --------------------------------------------------------------------------------------------- transport */

function sleepAbortable(ms, signal) {
  return new Promise((resolveP, rejectP) => {
    if (signal?.aborted) return rejectP(createAbortError())
    const t = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolveP()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      rejectP(createAbortError())
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}
const DEFAULT_IO = Object.freeze({ fetch: (...a) => globalThis.fetch(...a), sleep: sleepAbortable, now: () => new Date() })
let IO = { ...DEFAULT_IO }

/** Tests only: replace the network / clock (`{ fetch, sleep, now }`); `null` restores the real ones. */
export function __setAnimeCloudTransportForTests(t = null) {
  IO = t ? { ...DEFAULT_IO, ...t } : { ...DEFAULT_IO }
}

const NEVER_SENT = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|CERT|certificate/i

/** The caller's stop signal combined with a deadline (AbortSignal.any needs Node 20.3+; older Node gets a manual one). */
function withDeadline(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  if (!signal) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([signal, timeout])
  const ctrl = new AbortController()
  const stop = (s) => () => ctrl.abort(s.reason)
  if (signal.aborted || timeout.aborted) ctrl.abort((signal.aborted ? signal : timeout).reason)
  signal.addEventListener('abort', stop(signal), { once: true })
  timeout.addEventListener('abort', stop(timeout), { once: true })
  return ctrl.signal
}

/** One HTTP call → { status, ok, json, text }. Network problems become plain-Chinese coded errors. */
async function http(url, { method = 'GET', headers = {}, body, signal, timeoutMs = 60_000, label = '云端服务' } = {}) {
  if (signal?.aborted) throw createAbortError()
  let resp
  try {
    resp = await IO.fetch(url, { method, headers, body, signal: withDeadline(signal, timeoutMs) })
  } catch (err) {
    if (signal?.aborted) throw createAbortError()
    const why = `${err?.name || ''} ${err?.message || ''} ${err?.cause?.code || ''} ${err?.cause?.message || ''}`
    if (/Timeout/i.test(why)) throw coded(`连接${label}超时，请检查网络（海外服务可能需要代理）`, 'TIMEOUT', { network: true, maybeSent: true })
    throw coded(`连不上${label}：${String(err?.cause?.code || err?.message || err).slice(0, 120)}（请检查网络；海外服务可能需要代理）`, 'PROVIDER_ERROR', { network: true, maybeSent: !NEVER_SENT.test(why) })
  }
  const text = await resp.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {}
  return { status: resp.status, ok: resp.ok, json, text }
}

/** Stream a provider result (https only) to `abs`. */
async function downloadTo(url, abs, { signal, timeoutMs = 600_000, maxBytes = 2 * 1024 ** 3, label = '云端服务' } = {}) {
  if (!/^https:\/\//i.test(String(url || ''))) throw coded(`${label}返回的视频地址不对`, 'PROVIDER_ERROR')
  let resp
  try {
    resp = await IO.fetch(url, { method: 'GET', signal: withDeadline(signal, timeoutMs) })
  } catch (err) {
    if (signal?.aborted) throw createAbortError()
    throw coded(`下载${label}生成的视频失败：${String(err?.cause?.code || err?.message || err).slice(0, 120)}`, 'PROVIDER_ERROR', { network: true })
  }
  if (!resp.ok || !resp.body) throw coded(`下载${label}生成的视频失败（HTTP ${resp.status}）`, 'PROVIDER_ERROR')
  const len = Number(resp.headers?.get?.('content-length') || 0)
  if (len > maxBytes) throw coded(`${label}生成的视频太大了`, 'PROVIDER_ERROR')
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.part`
  try {
    await pipeline(Readable.fromWeb(resp.body), createWriteStream(tmp))
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {}
    if (signal?.aborted) throw createAbortError()
    throw coded(`下载${label}生成的视频中断了：${String(err?.message || err).slice(0, 120)}`, 'PROVIDER_ERROR', { network: true })
  }
  if (statSync(tmp).size < 256) {
    unlinkSync(tmp)
    throw coded(`${label}生成的视频是空的`, 'PROVIDER_ERROR')
  }
  renameSync(tmp, abs)
  return abs
}

/* ---------------------------------------------------------------------------------------------- config */

export function animeCloudConfigPath() {
  loadEnv()
  const o = String(process.env.DSH_VIDEO_ANIME_CLOUD_CONFIG || '').trim()
  if (o) return isAbsolute(o) ? o : resolve(REPO_ROOT, o)
  return join(REPO_ROOT, ANIME_CLOUD_CONFIG_FILENAME)
}

const defaultConfig = () => ({
  vidu: { apiKey: '', region: 'cn', resolution: '540p' },
  volc: { accessKeyId: '', secretAccessKey: '', tosBucket: '', tosRegion: 'cn-beijing', mode: 'loopy' },
  runway: { apiKey: '' },
  updatedAt: '',
})

export function loadAnimeCloudConfig() {
  const cfg = defaultConfig()
  const p = animeCloudConfigPath()
  if (!existsSync(p)) return cfg
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8'))
    for (const k of ANIME_CLOUD_ENGINES) if (raw?.[k] && typeof raw[k] === 'object') cfg[k] = { ...cfg[k], ...raw[k] }
    cfg.updatedAt = String(raw?.updatedAt || '')
  } catch {}
  return cfg
}

function maskKey(k = '') {
  const s = String(k || '').trim()
  if (!s) return ''
  if (s.length <= 8) return '***'
  return `${s.slice(0, 4)}***${s.slice(-4)}`
}

const KEY_RX = /^[\x21-\x7e]{8,512}$/
const BUCKET_RX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
const REGION_RX = /^[a-z]{2}-[a-z0-9-]{2,30}$/

/** A new secret from the panel: typed → set; empty / masked / KEEP_EXISTING → keep; clear flag → remove. */
function nextSecret(cur, incoming, clear, label) {
  if (clear === true) return ''
  if (typeof incoming !== 'string') return cur
  const v = incoming.trim()
  if (!v || v.includes('***') || v === 'KEEP_EXISTING') return cur
  if (!KEY_RX.test(v)) throw coded(`${label}的格式不对（不能有空格或中文，至少 8 个字符）`, 'BAD_REQUEST')
  return v
}

/**
 * Save part of the config (`{ vidu: { apiKey, clearApiKey, region, resolution }, volc: { accessKeyId,
 * secretAccessKey, clear, tosBucket, tosRegion, mode }, runway: { apiKey, clearApiKey } }`). Masked / empty secrets keep
 * the stored ones. → the masked summary.
 */
export function saveAnimeCloudConfig(patch = {}) {
  const cur = loadAnimeCloudConfig()
  const p = patch && typeof patch === 'object' ? patch : {}
  if (p.vidu && typeof p.vidu === 'object') {
    const v = p.vidu
    cur.vidu.apiKey = nextSecret(cur.vidu.apiKey, v.apiKey, v.clearApiKey, 'Vidu API Key')
    if (v.region === 'cn' || v.region === 'global') cur.vidu.region = v.region
    if (VIDU_MODES[v.resolution]) cur.vidu.resolution = v.resolution
  }
  if (p.volc && typeof p.volc === 'object') {
    const v = p.volc
    cur.volc.accessKeyId = nextSecret(cur.volc.accessKeyId, v.accessKeyId, v.clear, 'AccessKey ID')
    cur.volc.secretAccessKey = nextSecret(cur.volc.secretAccessKey, v.secretAccessKey, v.clear, 'Secret Access Key')
    if (typeof v.tosBucket === 'string') {
      const b = v.tosBucket.trim().toLowerCase()
      if (b && !BUCKET_RX.test(b)) throw coded('存储桶名称不对：只能有小写字母、数字和短横线，3～63 个字符', 'BAD_REQUEST')
      cur.volc.tosBucket = b
    }
    if (typeof v.tosRegion === 'string' && v.tosRegion.trim()) {
      const r = v.tosRegion.trim().toLowerCase()
      if (!REGION_RX.test(r)) throw coded('存储桶地域不对，例如 cn-beijing、cn-shanghai、cn-guangzhou', 'BAD_REQUEST')
      cur.volc.tosRegion = r
    }
    if (VOLC_MODES[v.mode]) cur.volc.mode = v.mode
  }
  if (p.runway && typeof p.runway === 'object') cur.runway.apiKey = nextSecret(cur.runway.apiKey, p.runway.apiKey, p.runway.clearApiKey, 'Runway API Key')
  cur.updatedAt = new Date().toISOString()
  const file = animeCloudConfigPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, `${JSON.stringify(cur, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, file)
  return getAnimeCloudConfigSummary()
}

const modeList = (table) => Object.entries(table).map(([value, m]) => ({ value, label: m.label }))

function engineStatus(id, cfg) {
  if (id === 'vidu') {
    const ok = Boolean(cfg.vidu.apiKey)
    return {
      configured: ok,
      summary: ok ? `已填写密钥 · ${cfg.vidu.region === 'global' ? '海外站' : '国内站'} · ${cfg.vidu.resolution} · 约 1.9 元/分钟` : '',
      reason: ok ? '' : '还没有填写 Vidu 的 API Key',
      modes: modeList(VIDU_MODES),
      defaultMode: cfg.vidu.resolution,
    }
  }
  if (id === 'volc') {
    const keys = Boolean(cfg.volc.accessKeyId && cfg.volc.secretAccessKey)
    const ok = keys && Boolean(cfg.volc.tosBucket)
    return {
      configured: ok,
      summary: ok ? `已填写密钥 · 存储桶 ${cfg.volc.tosBucket}（${cfg.volc.tosRegion}）· 默认${(VOLC_MODES[cfg.volc.mode] || VOLC_MODES.loopy).label.split('（')[0]}模式 · 约 18 元/分钟` : '',
      reason: ok ? '' : keys ? '还需要填写一个对象存储（TOS）桶：火山引擎只认网络链接，图片和声音要临时放在你自己的桶里' : '还没有填写火山引擎的 AccessKey',
      modes: modeList(VOLC_MODES),
      defaultMode: VOLC_MODES[cfg.volc.mode] ? cfg.volc.mode : 'loopy',
    }
  }
  const ok = Boolean(cfg.runway.apiKey)
  return { configured: ok, summary: ok ? '已填写密钥 · 约 1.5 元/分钟（按美元计费）' : '', reason: ok ? '' : '还没有填写 Runway 的 API Key（需要国际信用卡）', modes: undefined, defaultMode: '' }
}

/** `{ engines: { vidu, volc, runway: { configured, summary, reason, modes } } }` (for the engine picker). */
export function getAnimeCloudStatus() {
  const cfg = loadAnimeCloudConfig()
  return { engines: Object.fromEntries(ANIME_CLOUD_ENGINES.map((id) => [id, engineStatus(id, cfg)])) }
}

/** What the key panel shows: never a secret, only whether it is saved and its masked form. */
export function getAnimeCloudConfigSummary() {
  const cfg = loadAnimeCloudConfig()
  const st = getAnimeCloudStatus().engines
  return {
    vidu: { hasApiKey: Boolean(cfg.vidu.apiKey), apiKeyMasked: maskKey(cfg.vidu.apiKey), region: cfg.vidu.region, resolution: cfg.vidu.resolution, ...st.vidu, links: LINKS.vidu, price: CLOUD_PRICES.vidu },
    volc: {
      hasAccessKeyId: Boolean(cfg.volc.accessKeyId),
      accessKeyIdMasked: maskKey(cfg.volc.accessKeyId),
      hasSecretAccessKey: Boolean(cfg.volc.secretAccessKey),
      tosBucket: cfg.volc.tosBucket,
      tosRegion: cfg.volc.tosRegion,
      mode: cfg.volc.mode,
      ...st.volc,
      links: LINKS.volc,
      price: CLOUD_PRICES.volc,
    },
    runway: { hasApiKey: Boolean(cfg.runway.apiKey), apiKeyMasked: maskKey(cfg.runway.apiKey), ...st.runway, links: LINKS.runway, price: CLOUD_PRICES.runway },
    updatedAt: cfg.updatedAt,
  }
}

/* --------------------------------------------------------------------------------------------- signing */

const sha256Hex = (data) => createHash('sha256').update(data).digest('hex')
const hmac = (key, data, enc) => createHmac('sha256', key).update(data).digest(enc)
const rfc3986 = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const amzDate = (now) => now.toISOString().replace(/[:-]|\.\d{3}/g, '')

/**
 * AWS Signature V4 query pre-signing (UNSIGNED-PAYLOAD, signed header `host`) — what TOS's S3-compatible endpoint
 * `<bucket>.tos-s3-<region>.volces.com` accepts. `path` is the already-encoded object path (`/a/b.mp3`).
 */
export function presignS3Url({ method = 'GET', host, path = '/', region, accessKeyId, secretAccessKey, expiresSec = 3600, now = new Date(), service = 's3' }) {
  const date = amzDate(now)
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/${service}/aws4_request`
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.round(expiresSec)))),
    'X-Amz-SignedHeaders': 'host',
  }
  const query = Object.keys(q)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(q[k])}`)
    .join('&')
  const canonical = [method.toUpperCase(), path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256Hex(canonical)].join('\n')
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), service), 'aws4_request')
  return `https://${host}${path}?${query}&X-Amz-Signature=${hmac(kSigning, toSign, 'hex')}`
}

/**
 * 火山引擎 OpenAPI signature (HMAC-SHA256, as the official volc-sdk-nodejs Signer): signed headers x-content-sha256 +
 * x-date, credential scope `<day>/<region>/<service>/request`. → { url, headers } for a JSON POST.
 */
export function signVolcRequest({ method = 'POST', host = VOLC_HOST, path = '/', query = {}, body = '', region = VOLC_REGION, service = VOLC_SERVICE, accessKeyId, secretAccessKey, now = new Date() }) {
  const xDate = amzDate(now)
  const day = xDate.slice(0, 8)
  const bodyHash = sha256Hex(body)
  const qs = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join('&')
  const signed = ['x-content-sha256', 'x-date']
  const canonicalHeaders = `x-content-sha256:${bodyHash}\nx-date:${xDate}`
  const canonical = [method.toUpperCase(), path, qs, `${canonicalHeaders}\n`, signed.join(';'), bodyHash].join('\n')
  const scope = `${day}/${region}/${service}/request`
  const toSign = ['HMAC-SHA256', xDate, scope, sha256Hex(canonical)].join('\n')
  const kSigning = hmac(hmac(hmac(hmac(secretAccessKey, day), region), service), 'request')
  const signature = hmac(kSigning, toSign, 'hex')
  return {
    url: `https://${host}${path}${qs ? `?${qs}` : ''}`,
    headers: {
      'Content-Type': 'application/json',
      'X-Date': xDate,
      'X-Content-Sha256': bodyHash,
      Authorization: `HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
    },
  }
}

/* -------------------------------------------------------------------------------------------- estimate */

function resolveMode(engine, mode, cfg = loadAnimeCloudConfig()) {
  if (engine === 'volc') return VOLC_MODES[mode] ? mode : VOLC_MODES[cfg.volc.mode] ? cfg.volc.mode : 'loopy'
  if (engine === 'vidu') return VIDU_MODES[mode] ? mode : VIDU_MODES[cfg.vidu.resolution] ? cfg.vidu.resolution : '540p'
  return ''
}

/** The longest piece of voice one task may carry. */
export function pieceLimitSec(engine, mode) {
  if (engine === 'volc') return (VOLC_MODES[mode] || VOLC_MODES.loopy).maxSec
  return MAX_PIECE_SEC[engine] || 60
}

function sha256FileSync(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

function portraitShaOf(character) {
  const abs = character ? characterFileAbs(character, character.portrait) : ''
  return abs && existsSync(abs) ? sha256FileSync(abs) : ''
}

/** Is there a 火山引擎 形象 for this portrait in `mode` already (no 0.1 元 creation)? */
function volcRoleOf(character, mode, portraitSha) {
  const r = character?.cloud?.volc?.roles?.[mode]
  return r?.resourceId && portraitSha && r.portraitSha === portraitSha ? r : null
}

/**
 * The most one clip of `durationSec` can cost (each piece rounded up by the provider's unit; a 火山引擎 形象 is included
 * unless `character` already has one for this picture and mode). → { engine, mode, rmb, usd?, unit, basis, pieces,
 * priceDate, sourceUrl }
 */
export async function estimatePresenterCost({ engine, durationSec = 0, mode = '', character = null } = {}) {
  if (!ANIME_CLOUD_ENGINES.includes(engine)) throw coded('不认识的云端数字人服务', 'BAD_REQUEST')
  const m = resolveMode(engine, mode)
  const sec = Math.max(0, Number(durationSec) || 0)
  const pieces = Math.max(1, Math.ceil(sec / pieceLimitSec(engine, m) - 1e-9))
  const out = { engine, mode: m, pieces, priceDate: PRICE_DATE, sourceUrl: CLOUD_PRICES[engine].sourceUrl }
  if (engine === 'vidu') {
    const credits = sec > 0 ? Math.ceil(sec - 1e-9) + (pieces - 1) : 0
    return { ...out, rmb: r2up(credits * CLOUD_PRICES.vidu.rmbPerCredit), credits, unit: '元', basis: `${CLOUD_PRICES.vidu.basis}；这段约 ${credits} 积分${pieces > 1 ? `（分 ${pieces} 段生成）` : ''}` }
  }
  if (engine === 'volc') {
    const secs = sec > 0 ? Math.ceil(sec - 1e-9) + (pieces - 1) : 0
    const portraitSha = character ? portraitShaOf(character) : ''
    const create = volcRoleOf(character, m, portraitSha) ? 0 : CLOUD_PRICES.volc.createRmb
    return {
      ...out,
      rmb: r2up(secs * CLOUD_PRICES.volc.rmbPerSec + create),
      seconds: secs,
      createRmb: create,
      unit: '元',
      basis: `${CLOUD_PRICES.volc.basis}；这段按 ${secs} 秒计${create ? '，含第一次建形象 0.1 元' : ''}${pieces > 1 ? `（分 ${pieces} 段生成）` : ''}`,
    }
  }
  const credits = sec > 0 ? Math.ceil(sec / CLOUD_PRICES.runway.secPerCredit - 1e-9) + (pieces - 1) : 0
  const usd = Math.round(credits * CLOUD_PRICES.runway.usdPerCredit * 100) / 100
  return { ...out, rmb: r2up(usd * USD_TO_RMB), usd, credits, unit: '元', basis: `${CLOUD_PRICES.runway.basis}；这段约 ${credits} 积分（${usd.toFixed(2)} 美元）${pieces > 1 ? `，分 ${pieces} 段生成` : ''}` }
}

/* ------------------------------------------------------------------------------------- picture & pieces */

function rgbToHueSat(r, g, b) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  const s = mx ? d / mx : 0
  let h = 0
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, v: mx / 255 }
}

/** Green unless the character itself has a fair share of green (then blue). */
export function chooseKeyColor(rgba, width, height) {
  let green = 0
  let blue = 0
  let n = 0
  const total = width * height
  const step = Math.max(1, Math.floor(total / 60000))
  for (let i = 0; i < total; i += step) {
    if (rgba[i * 4 + 3] < 128) continue
    n++
    const { h, s, v } = rgbToHueSat(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2])
    if (s < 0.3 || v < 0.2) continue
    if (h >= 75 && h <= 165) green++
    else if (h >= 195 && h <= 265) blue++
  }
  if (!n) return 'green'
  return green / n > 0.03 && blue < green ? 'blue' : 'green'
}

/**
 * The picture the service gets: the transparent portrait, bottom-centred on a flat key colour, exactly 3:4 (4:3 for a
 * wide character — 火山引擎 大画幅 only takes 16:9 / 9:16 / 3:4 / 4:3). Kept in the character folder per portrait.
 */
export async function prepareCloudPicture(character, { signal, onChild } = {}) {
  const portraitAbs = characterFileAbs(character, character?.portrait)
  if (!portraitAbs || !existsSync(portraitAbs)) throw coded('这个动漫形象的图片丢失了，请在形象库里重新生成', 'NO_SOURCE')
  const portraitSha = sha256FileSync(portraitAbs)
  const img = await readImageRgba(portraitAbs, { maxSide: 900, signal, onChild })
  const { width: pw, height: ph, rgba } = img
  const color = chooseKeyColor(rgba, pw, ph)
  const wide = pw > ph
  // canvas: 8 % above the head, 5 % at each side, the character standing on the bottom edge; k even → both sides even
  const k = 2 * Math.ceil(Math.max(ph / 0.92 / (wide ? 3 : 4), pw / 0.9 / (wide ? 4 : 3)) / 2)
  const W = wide ? 4 * k : 3 * k
  const H = wide ? 3 * k : 4 * k
  const name = `cloud-input-${portraitSha.slice(0, 12)}-${color}-${W}x${H}.png`
  const abs = join(character.dir, name)
  if (!existsSync(abs)) {
    const [kr, kg, kb] = KEY_COLORS[color].rgb
    const out = Buffer.alloc(W * H * 4)
    for (let i = 0; i < W * H; i++) {
      out[i * 4] = kr
      out[i * 4 + 1] = kg
      out[i * 4 + 2] = kb
      out[i * 4 + 3] = 255
    }
    const ox = Math.floor((W - pw) / 2)
    const oy = H - ph
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const s = (y * pw + x) * 4
        const a = rgba[s + 3] / 255
        if (a <= 0) continue
        const d = ((oy + y) * W + ox + x) * 4
        out[d] = Math.round(rgba[s] * a + kr * (1 - a))
        out[d + 1] = Math.round(rgba[s + 1] * a + kg * (1 - a))
        out[d + 2] = Math.round(rgba[s + 2] * a + kb * (1 - a))
      }
    }
    await writePngRgba(abs, out, W, H, { signal, onChild })
  }
  return { abs, portraitSha, color, width: W, height: H, ratio: wide ? '4:3' : '3:4' }
}

/**
 * Split `totalFrames` (at `fps`) into the fewest pieces of at most `maxSec` (ceil(total / max), what the price estimate
 * assumes), each cut at the quietest moment (the voice's mouth-openness track) of the window that still lets the rest
 * fit, on frame boundaries. → [{ i, f0, f1 }]
 */
export function planPieces({ track = null, totalFrames, fps = 30, maxSec = 60 }) {
  const maxF = Math.max(1, Math.floor(maxSec * fps))
  if (totalFrames <= maxF) return [{ i: 0, f0: 0, f1: totalFrames }]
  const n = Math.ceil(totalFrames / maxF)
  const tf = Number(track?.fps) || fps
  const open = Array.isArray(track?.open) ? track.open : []
  const talk = Array.isArray(track?.talk) ? track.talk : []
  const loud = (f) => {
    const t = Math.round((f * tf) / fps)
    return 0.75 * (Number(open[t]) || 0) + 0.25 * (Number(talk[t]) || 0)
  }
  const half = Math.max(2, Math.round(fps * 0.15))
  const pieces = []
  let f0 = 0
  for (let k = 0; k < n - 1; k++) {
    const hi = Math.max(f0 + 1, Math.min(f0 + maxF, totalFrames - Math.max(1, Math.round(fps))))
    const lo = Math.min(hi, Math.max(f0 + Math.floor(maxF * 0.55), totalFrames - (n - k - 1) * maxF))
    let best = hi
    let bestV = Infinity
    for (let f = lo; f <= hi; f++) {
      let v = 0
      for (let d = -half; d <= half; d++) v += loud(clamp(f + d, 0, totalFrames - 1))
      if (v <= bestV + 1e-9) {
        bestV = v
        best = f
      }
    }
    pieces.push({ i: k, f0, f1: best })
    f0 = best
  }
  pieces.push({ i: n - 1, f0, f1: totalFrames })
  return pieces
}

/* ------------------------------------------------------------------------------------------------ ffmpeg */

function runFfmpeg(args, { signal, onChild, timeoutMs = 600_000, onStdout = null, bin = '' } = {}) {
  const exe = bin || resolveBinaries().ffmpeg
  return new Promise((resolveP, rejectP) => {
    if (signal?.aborted) return rejectP(createAbortError())
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    onChild?.(child)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      if (onStdout) onStdout(d)
      else if (out.length < 400_000) out += d
    })
    child.stderr.on('data', (d) => {
      err = (err + d).slice(-4000)
    })
    let settled = false
    const finish = (e, v) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (e) {
        killProcessTree(child)
        const gone = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise((r) => child.once('close', r))
        Promise.race([gone, new Promise((r) => setTimeout(r, 8000))]).then(() => rejectP(e))
      } else resolveP(v)
    }
    const onAbort = () => finish(createAbortError())
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const timer = setTimeout(() => finish(coded('处理视频超时，已停止', 'TIMEOUT')), timeoutMs)
    child.on('error', (e) => finish(coded(`启动 FFmpeg 失败：${e.message}`, 'PROVIDER_ERROR')))
    child.on('close', (code) => (code === 0 ? finish(null, { stdout: out, stderr: err }) : finish(coded(`处理视频失败：${err.slice(-300) || `exit ${code}`}`, 'PROVIDER_ERROR'))))
  })
}

async function probeVideo(abs, { signal } = {}) {
  const { ffprobe } = resolveBinaries()
  const r = await runFfmpeg(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:stream_tags=alpha_mode:format=duration', '-of', 'json', abs], { signal, timeoutMs: 60_000, bin: ffprobe })
  let j = {}
  try {
    j = JSON.parse(r.stdout || '{}')
  } catch {}
  const s = j.streams?.[0] || {}
  return { codec: s.codec_name || '', width: Number(s.width) || 0, height: Number(s.height) || 0, alpha: String(s.tags?.alpha_mode ?? s.tags?.ALPHA_MODE ?? '') === '1', durationSec: Number(j.format?.duration) || 0 }
}

/** One piece of the voice as MP3 (frame-exact cut). */
async function cutPieceAudio({ audioAbs, piece, fps, outAbs, signal, onChild }) {
  if (existsSync(outAbs) && statSync(outAbs).size > 64) return outAbs
  const t0 = (piece.f0 / fps).toFixed(6)
  const t1 = (piece.f1 / fps).toFixed(6)
  const tmp = `${outAbs}.${process.pid}.tmp.mp3`
  await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-y', '-i', audioAbs, '-af', `atrim=start=${t0}:end=${t1},asetpts=PTS-STARTPTS`, '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', tmp], { signal, onChild, timeoutMs: 300_000 })
  renameSync(tmp, outAbs)
  return outAbs
}

const keyChain = (color) => `format=yuva444p,chromakey=${KEY_COLORS[color].hex}:${KEY_SIMILARITY}:${KEY_BLEND},format=rgba,despill=type=${KEY_COLORS[color].despill}`

/**
 * Where the character is in the keyed pieces (2 frames per second, half size): the union of every frame's opaque
 * rows / columns (specks ignored) and the average opaque share (a background that was not keyed out is caught here).
 */
async function analyzeKeyed({ raws, size, color, signal, onChild }) {
  const w = Math.max(2, Math.round(size.w / 4) * 2)
  const h = Math.max(2, Math.round(size.h / 4) * 2)
  const args = ['-hide_banner', '-loglevel', 'error']
  for (const r of raws) args.push('-i', r)
  const parts = raws.map((_, i) => `[${i}:v]fps=2,scale=${w}:${h}:flags=bicubic,setsar=1,${keyChain(color)}[a${i}]`)
  const graph = `${parts.join(';')};${raws.map((_, i) => `[a${i}]`).join('')}concat=n=${raws.length}:v=1:a=0[out]`
  args.push('-filter_complex', graph, '-map', '[out]', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-')
  const frameBytes = w * h * 4
  let carry = Buffer.alloc(0)
  let frames = 0
  let opaqueShare = 0
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  const rows = new Uint32Array(h)
  const cols = new Uint32Array(w)
  const eat = (buf) => {
    rows.fill(0)
    cols.fill(0)
    let opaque = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (buf[(y * w + x) * 4 + 3] > 48) {
          rows[y]++
          cols[x]++
          opaque++
        }
      }
    }
    const minRow = Math.max(2, Math.round(w * 0.004))
    const minCol = Math.max(2, Math.round(h * 0.004))
    for (let y = 0; y < h; y++) {
      if (rows[y] >= minRow) {
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    }
    for (let x = 0; x < w; x++) {
      if (cols[x] >= minCol) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
      }
    }
    opaqueShare += opaque / (w * h)
    frames++
  }
  await runFfmpeg(args, {
    signal,
    onChild,
    timeoutMs: 1_800_000,
    onStdout: (d) => {
      carry = carry.length ? Buffer.concat([carry, d]) : d
      while (carry.length >= frameBytes) {
        eat(carry.subarray(0, frameBytes))
        carry = carry.subarray(frameBytes)
      }
    },
  })
  if (!frames) throw coded('读不出云端生成的视频画面', 'PROVIDER_ERROR')
  const share = opaqueShare / frames
  if (x1 < 0 || y1 < 0) throw coded('云端生成的视频里没找到人物（背景抠掉后什么都不剩）', 'PROVIDER_ERROR')
  if (share > 0.85) throw coded('云端生成的视频背景没能抠掉（服务改动了纯色背景）。可以换一种模式或别的服务再试', 'PROVIDER_ERROR')
  const sx = size.w / w
  const sy = size.h / h
  return { box: { x: Math.floor(x0 * sx), y: Math.floor(y0 * sy), w: Math.ceil((x1 - x0 + 1) * sx), h: Math.ceil((y1 - y0 + 1) * sy) }, share: r3(share), frames }
}

/** Crop (+ a small margin; the bottom stays when the character touches it) → even sizes, at most `maxHeight` high. */
export function planCloudCrop(box, size, { maxHeight = 720 } = {}) {
  const mx = Math.round(box.w * 0.04)
  const my = Math.round(box.h * 0.04)
  let x = Math.max(0, box.x - mx)
  let y = Math.max(0, box.y - my)
  const x2 = Math.min(size.w, box.x + box.w + mx)
  const onBottom = box.y + box.h >= size.h - Math.max(2, Math.round(size.h * 0.01))
  const y2 = onBottom ? size.h : Math.min(size.h, box.y + box.h + my)
  let w = x2 - x
  let h = y2 - y
  w -= w % 2
  h -= h % 2
  w = Math.max(16, Math.min(w, size.w - (size.w % 2)))
  h = Math.max(16, Math.min(h, size.h - (size.h % 2)))
  // a character cut by the frame's bottom edge stays on the bottom edge (even sizes trim the top instead)
  if (onBottom) y = Math.max(0, size.h - h)
  if (x + w > size.w) x = Math.max(0, size.w - w)
  if (y + h > size.h) y = Math.max(0, size.h - h)
  let outH = Math.min(h, Math.max(64, Math.round(Number(maxHeight) || 720)))
  outH -= outH % 2
  const outW = Math.max(2, Math.round((w * outH) / h / 2) * 2)
  return { x, y, w, h, outW, outH }
}

/** Key, join frame-exactly, crop, VP9 + alpha WebM of exactly totalFrames / fps seconds. */
async function keyAndEncode({ raws, pieces, size, color, crop, fps, totalFrames, outWebm, signal, onChild }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  for (const r of raws) args.push('-i', r)
  const parts = raws.map((_, i) => {
    const n = pieces[i].f1 - pieces[i].f0
    return `[${i}:v]fps=${fps},tpad=stop_mode=clone:stop_duration=${Math.ceil(n / fps) + 2},trim=end_frame=${n},setpts=PTS-STARTPTS,scale=${size.w}:${size.h}:flags=bicubic,setsar=1,${keyChain(color)}[k${i}]`
  })
  const scale = crop.outH !== crop.h ? `,scale=${crop.outW}:${crop.outH}:flags=lanczos` : ''
  const graph = `${parts.join(';')};${raws.map((_, i) => `[k${i}]`).join('')}concat=n=${raws.length}:v=1:a=0,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}${scale},format=yuva420p[out]`
  const durationSec = totalFrames / fps
  args.push('-filter_complex', graph, '-map', '[out]', '-t', durationSec.toFixed(4), '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '22', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '8', '-metadata:s:v:0', 'alpha_mode=1', outWebm)
  await runFfmpeg(args, { signal, onChild, timeoutMs: Math.max(600_000, durationSec * 30_000) })
  if (!existsSync(outWebm) || statSync(outWebm).size < 64) throw coded('压制透明视频失败', 'PROVIDER_ERROR')
}

/* --------------------------------------------------------------------------------------------- providers */

const b64 = (abs) => readFileSync(abs).toString('base64')
const dataUri = (abs, mime) => `data:${mime};base64,${b64(abs)}`

const viduHost = (cfg) => (cfg.vidu.region === 'global' ? 'api.vidu.com' : 'api.vidu.cn')
const VIDU_RUNNING = new Set(['created', 'queueing', 'processing'])

function viduError(status, json, text) {
  const reason = String(json?.reason || json?.err_code || json?.code || '')
  const msg = String(json?.message || json?.err_msg || text || '').slice(0, 200)
  if (status === 401 || /Unauthorized/i.test(reason)) return coded('Vidu 的 API Key 不对或已失效，请重新填写', 'NO_KEY')
  if (/CreditInsufficient/i.test(reason) || /credit/i.test(msg)) return coded('Vidu 账户积分不够了，请充值后再试（余额低于 45 积分时不能开始任务）', 'BILLING')
  if (/QuotaExceeded|TooManyRequests/i.test(reason) || status === 429) return coded('Vidu 同时进行的任务太多了，稍等一下', 'PROVIDER_ERROR', { retryable: true })
  if (/ImageCheck|NoFaceDetected|MultiFaceDetected|ImageObjectsUndetected|ImageFormat|ImageSize/i.test(reason)) return coded(`Vidu 认不出这张形象图里的人物（${reason}）：请换一张正脸清楚的单人形象`, 'UNSUPPORTED_IMAGE')
  if (/Audit|PolicyViolation/i.test(reason)) return coded(`Vidu 的内容审核没有通过（${reason}）`, 'PROVIDER_ERROR')
  if (status === 403 || /Forbidden/i.test(reason)) return coded('Vidu 拒绝了这个请求：这个密钥没有权限，请确认开通了「Vidu 数字人」', 'NO_KEY')
  return coded(`Vidu 返回错误${reason ? `（${reason}）` : ''}：${msg || `HTTP ${status}`}`, 'PROVIDER_ERROR')
}

const vidu = {
  label: 'Vidu',
  pollStartMs: 4000,
  pollMaxMs: 15000,
  async submit(ctx, piece) {
    const { cfg, picture, signal } = ctx
    const body = JSON.stringify({
      model: 'vidu-s1',
      image: dataUri(picture.abs, 'image/png'),
      audio: dataUri(piece.audioAbs, 'audio/mpeg'),
      resolution: ctx.mode,
      watermark: false,
      payload: `dsh-anime:${ctx.key.slice(0, 12)}:${piece.i}`,
    })
    const r = await http(`https://${viduHost(cfg)}/ent/s_avatar/offline`, { method: 'POST', headers: { Authorization: `Token ${cfg.vidu.apiKey}`, 'Content-Type': 'application/json' }, body, signal, timeoutMs: 120_000, label: 'Vidu' })
    if (!r.ok) throw viduError(r.status, r.json, r.text)
    const id = (/"task_id"\s*:\s*"?(\d+)"?/.exec(r.text) || [])[1] || String(r.json?.task_id || '')
    if (!id) throw coded('Vidu 没有返回任务编号', 'PROVIDER_ERROR')
    return { taskId: id }
  },
  async poll(ctx, taskId) {
    const { cfg, signal } = ctx
    const r = await http(`https://${viduHost(cfg)}/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`, { headers: { Authorization: `Token ${cfg.vidu.apiKey}` }, signal, timeoutMs: 60_000, label: 'Vidu' })
    if (r.status === 404 || /TaskNotFound/i.test(String(r.json?.reason || ''))) return { state: 'lost' }
    if (!r.ok) {
      const e = viduError(r.status, r.json, r.text)
      if (e.retryable) return { state: 'running' }
      throw e
    }
    const j = r.json || {}
    const state = String(j.state || '')
    if (state === 'success') {
      const url = j.creations?.[0]?.url
      if (!url) throw coded('Vidu 生成成功但没有返回视频地址', 'PROVIDER_ERROR')
      return { state: 'done', url, credits: Number(j.credits) || 0 }
    }
    if (state === 'failed') return { state: 'failed', error: viduError(400, { reason: j.err_code, message: j.err_msg }, '') }
    // created / queueing / processing (and anything new) → keep polling
    return { state: 'running', progress: VIDU_RUNNING.has(state) ? Number(j.progress) || 0 : 0 }
  },
}

function runwayHeaders(cfg, json = true) {
  return { Authorization: `Bearer ${cfg.runway.apiKey}`, 'X-Runway-Version': RUNWAY_VERSION, ...(json ? { 'Content-Type': 'application/json' } : {}) }
}

function runwayError(status, json, text, what = '') {
  const raw = json?.error?.message || json?.error || json?.message || json?.failure || text || ''
  const msg = String(typeof raw === 'string' ? raw : JSON.stringify(raw)).slice(0, 200)
  if (status === 401) return coded('Runway 的 API Key 不对或已失效，请重新填写', 'NO_KEY')
  if (/credit|balance|insufficient|billing/i.test(msg) || status === 402) return coded('Runway 账户积分不够了，请在 Runway 开发者后台充值', 'BILLING')
  if (status === 429) return coded('Runway 请求太频繁，稍等一下', 'PROVIDER_ERROR', { retryable: true })
  if (status === 403) return coded('Runway 拒绝了这个请求：这个密钥没有权限使用数字人（Characters）', 'NO_KEY')
  return coded(`Runway ${what}失败：${msg || `HTTP ${status}`}`, status >= 400 && status < 500 && /image|face|avatar/i.test(msg) ? 'UNSUPPORTED_IMAGE' : 'PROVIDER_ERROR')
}

/** A file for a Runway field: a data URI when small, else an ephemeral upload (runway:// URI). */
async function runwayMedia(ctx, abs, mime, filename) {
  const size = statSync(abs).size
  if (size <= (ctx.dataUriMax || RUNWAY_DATA_URI_MAX)) return dataUri(abs, mime)
  const { cfg, signal } = ctx
  const r = await http(`${RUNWAY_BASE}/v1/uploads`, { method: 'POST', headers: runwayHeaders(cfg), body: JSON.stringify({ filename, type: 'ephemeral' }), signal, label: 'Runway' })
  if (!r.ok) throw runwayError(r.status, r.json, r.text, '上传文件')
  const { uploadUrl, fields, runwayUri } = r.json || {}
  if (!uploadUrl || !runwayUri) throw coded('Runway 没有返回上传地址', 'PROVIDER_ERROR')
  const form = new FormData()
  for (const [k, v] of Object.entries(fields || {})) form.append(k, String(v))
  form.append('file', new Blob([readFileSync(abs)], { type: mime }), filename)
  const up = await http(uploadUrl, { method: 'POST', body: form, signal, timeoutMs: 600_000, label: 'Runway 上传' })
  if (up.status >= 300) throw coded(`上传到 Runway 失败（HTTP ${up.status}）`, 'PROVIDER_ERROR')
  return runwayUri
}

const runway = {
  label: 'Runway',
  pollStartMs: 5000,
  pollMaxMs: 15000,
  async ensureAvatar(ctx) {
    const { cfg, character, picture, signal, saveCloud } = ctx
    const have = getCharacter(character.id)?.cloud?.runway || character.cloud?.runway || null
    const check = async (id) => {
      const r = await http(`${RUNWAY_BASE}/v1/avatars/${encodeURIComponent(id)}`, { headers: runwayHeaders(cfg, false), signal, label: 'Runway' })
      if (r.status === 404) return { status: 'GONE' }
      if (!r.ok) throw runwayError(r.status, r.json, r.text, '读取数字人形象')
      return r.json || {}
    }
    let id = have?.avatarId && have.portraitSha === picture.portraitSha && have.keyColor === picture.color ? have.avatarId : ''
    if (id) {
      const st = await check(id)
      if (st.status === 'READY') return id
      if (st.status === 'GONE' || st.status === 'FAILED') id = ''
    }
    if (!id) {
      ctx.progress('正在 Runway 上建立这个动漫形象（只需要一次，不收费）…', 4)
      const body = JSON.stringify({
        name: String(character.name || '动漫讲解员').slice(0, 40),
        referenceImage: await runwayMedia(ctx, picture.abs, 'image/png', 'presenter.png'),
        personality: 'A friendly presenter who narrates short videos.',
        voice: { type: 'runway-live-preset', presetId: 'clara' },
        imageProcessing: 'none',
      })
      const r = await http(`${RUNWAY_BASE}/v1/avatars`, { method: 'POST', headers: runwayHeaders(cfg), body, signal, timeoutMs: 120_000, label: 'Runway' })
      if (!r.ok) throw runwayError(r.status, r.json, r.text, '建立数字人形象')
      id = String(r.json?.id || '')
      if (!id) throw coded('Runway 没有返回形象编号', 'PROVIDER_ERROR')
      await saveCloud('runway', { avatarId: id, portraitSha: picture.portraitSha, keyColor: picture.color, status: 'PROCESSING', createdAt: IO.now().toISOString() })
    }
    const start = IO.now().getTime()
    for (;;) {
      const st = await check(id)
      if (st.status === 'READY') {
        await saveCloud('runway', { avatarId: id, portraitSha: picture.portraitSha, keyColor: picture.color, status: 'READY', createdAt: IO.now().toISOString() })
        return id
      }
      if (st.status === 'FAILED' || st.status === 'GONE') {
        await saveCloud('runway', null)
        throw coded(`Runway 没能用这张图建立形象${st.failureReason ? `：${String(st.failureReason).slice(0, 160)}` : ''}`, 'UNSUPPORTED_IMAGE')
      }
      if (IO.now().getTime() - start > 15 * 60_000) throw coded('Runway 建立形象超时，请稍后再试', 'TIMEOUT')
      await IO.sleep(5000, signal)
    }
  },
  async submit(ctx, piece) {
    const { cfg, signal } = ctx
    const audio = await runwayMedia(ctx, piece.audioAbs, 'audio/mpeg', `piece-${piece.i}.mp3`)
    const body = JSON.stringify({ model: 'gwm1_avatars', avatar: { type: 'custom', avatarId: ctx.avatarId }, speech: { type: 'audio', audio } })
    const r = await http(`${RUNWAY_BASE}/v1/avatar_videos`, { method: 'POST', headers: runwayHeaders(cfg), body, signal, timeoutMs: 120_000, label: 'Runway' })
    if (!r.ok) throw runwayError(r.status, r.json, r.text, '提交生成')
    const id = String(r.json?.id || '')
    if (!id) throw coded('Runway 没有返回任务编号', 'PROVIDER_ERROR')
    return { taskId: id }
  },
  async poll(ctx, taskId) {
    const { cfg, signal } = ctx
    const r = await http(`${RUNWAY_BASE}/v1/tasks/${encodeURIComponent(taskId)}`, { headers: runwayHeaders(cfg, false), signal, label: 'Runway' })
    if (r.status === 404) return { state: 'lost' }
    if (!r.ok) {
      const e = runwayError(r.status, r.json, r.text, '查询任务')
      if (e.retryable) return { state: 'running' }
      throw e
    }
    const j = r.json || {}
    if (j.status === 'SUCCEEDED') {
      const url = Array.isArray(j.output) ? j.output[0] : ''
      if (!url) throw coded('Runway 生成成功但没有返回视频地址', 'PROVIDER_ERROR')
      return { state: 'done', url, credits: Number(j.cost?.credits) || 0 }
    }
    if (j.status === 'FAILED' || j.status === 'CANCELLED') return { state: 'failed', error: runwayError(400, { error: j.failure || j.failureCode || j.status }, '', '生成') }
    return { state: 'running', progress: Math.round((Number(j.progress) || 0) * 100) }
  },
}

/** 火山引擎 visual OpenAPI call → the parsed body (code 10000) or a coded error. */
async function volcCall(ctx, action, payload) {
  const { cfg, signal } = ctx
  const body = JSON.stringify(payload)
  const { url, headers } = signVolcRequest({ query: { Action: action, Version: VOLC_VERSION }, body, accessKeyId: cfg.volc.accessKeyId, secretAccessKey: cfg.volc.secretAccessKey, now: IO.now() })
  const r = await http(url, { method: 'POST', headers, body, signal, timeoutMs: 90_000, label: '火山引擎' })
  const j = r.json || {}
  const gw = j.ResponseMetadata?.Error
  if (gw) {
    const c = String(gw.Code || '')
    if (/AccessKey|Signature|Credential|Timestamp|Authorization/i.test(c)) throw coded('火山引擎的 AccessKey / Secret 不对（或电脑时间不准），请重新填写', 'NO_KEY')
    if (/Denied|Forbidden|NotAuthorized|Permission|NotActivated|ServiceNotOpen/i.test(c)) throw coded('这个火山引擎密钥没有权限：请在控制台开通「智能视觉 · 视频生成」并给这个密钥授权', 'NO_KEY')
    if (/Throttl|Limit|TooMany/i.test(c)) throw coded('火山引擎请求太频繁，稍等一下', 'PROVIDER_ERROR', { retryable: true })
    throw coded(`火山引擎返回错误（${c}）：${String(gw.Message || '').slice(0, 160)}`, 'PROVIDER_ERROR')
  }
  const code = Number(j.code ?? j.status ?? (r.ok ? 10000 : r.status))
  if (code === 10000) return j
  const msg = String(j.message || r.text || '').slice(0, 160)
  if (code === 50430 || code === 50429) throw coded('火山引擎同时进行的任务太多了，稍等一下', 'PROVIDER_ERROR', { retryable: true })
  if (code === 50400) throw coded('火山引擎权限校验失败：请确认在控制台开通了「智能视觉 · 视频生成」，并且这个密钥有权限', 'NO_KEY')
  if (code === 60102) throw coded('火山引擎在这张形象图里没找到脸：请换一张正脸清楚的形象，或换「灵动」模式', 'UNSUPPORTED_IMAGE')
  if ([50411, 50412, 50413, 50511, 50512, 50516, 50517, 50518, 50519, 60208].includes(code)) throw coded(`火山引擎的内容审核没有通过（${code} ${msg}）`, 'PROVIDER_ERROR')
  if (code === 50213 || code === 50205) throw coded('交给火山引擎的文件太大了', 'PROVIDER_ERROR')
  throw coded(`火山引擎返回错误（${code}）：${msg}`, 'PROVIDER_ERROR')
}

function tosHost(cfg) {
  return `${cfg.volc.tosBucket}.tos-s3-${cfg.volc.tosRegion}.volces.com`
}
function tosUrl(cfg, key, method, expiresSec) {
  const path = `/${key.split('/').map(rfc3986).join('/')}`
  return presignS3Url({ method, host: tosHost(cfg), path, region: cfg.volc.tosRegion, accessKeyId: cfg.volc.accessKeyId, secretAccessKey: cfg.volc.secretAccessKey, expiresSec, now: IO.now() })
}
function tosError(status, text) {
  const c = (/<Code>([^<]+)<\/Code>/.exec(String(text || '')) || [])[1] || ''
  if (status === 404 || /NoSuchBucket/i.test(c)) return coded('找不到这个存储桶：请检查桶名称和地域是否填对', 'NO_KEY')
  if (status === 403 || /AccessDenied|SignatureDoesNotMatch|InvalidAccessKey/i.test(c)) return coded(`这个火山引擎密钥不能读写存储桶（${c || 'AccessDenied'}）：请给密钥授予 TOS 读写权限，或检查桶的地域`, 'NO_KEY')
  return coded(`上传到存储桶失败（HTTP ${status}${c ? ` ${c}` : ''}）`, 'PROVIDER_ERROR')
}
async function tosPut(ctx, key, abs, contentType) {
  const r = await http(tosUrl(ctx.cfg, key, 'PUT', 900), { method: 'PUT', headers: { 'Content-Type': contentType }, body: readFileSync(abs), signal: ctx.signal, timeoutMs: 600_000, label: '火山引擎存储桶' })
  if (!r.ok) throw tosError(r.status, r.text)
}
async function tosDelete(ctx, key) {
  try {
    await http(tosUrl(ctx.cfg, key, 'DELETE', 900), { method: 'DELETE', timeoutMs: 30_000, label: '火山引擎存储桶' })
  } catch {}
}
// fixed object names: a retry overwrites the same object instead of leaving copies in the user's bucket
const tosKeyFor = (ctx, name) => `dsh-anime/${ctx.character.id}/${ctx.key.slice(0, 12)}/${name}`

function parseResp(j) {
  try {
    return typeof j?.data?.resp_data === 'string' ? JSON.parse(j.data.resp_data) : j?.data?.resp_data || {}
  } catch {
    return {}
  }
}

const volc = {
  label: '火山引擎',
  pollStartMs: 4000,
  pollMaxMs: 20000,
  async ensureAvatar(ctx) {
    const { character, picture, mode, saveCloud } = ctx
    const spec = VOLC_MODES[mode]
    const cur = () => getCharacter(character.id)?.cloud?.volc || character.cloud?.volc || {}
    const save = async (patch) => {
      const c = cur()
      const next = { ...c, ...patch, roles: { ...(c.roles || {}), ...(patch.roles || {}) } }
      const any = Object.values(next.roles).find((r) => r?.resourceId)
      next.avatarId = any?.resourceId || ''
      await saveCloud('volc', next)
    }
    const have = cur().roles?.[mode]
    if (have?.resourceId && have.portraitSha === picture.portraitSha && have.keyColor === picture.color) return have.resourceId
    let taskId = have?.pending && have.portraitSha === picture.portraitSha && have.keyColor === picture.color ? have.taskId : ''
    let tosKey = have?.tosKey || ''
    if (!taskId) {
      ctx.progress('正在火山引擎上建立这个动漫形象（每种模式只需一次，0.1 元）…', 4)
      tosKey = `dsh-anime/${character.id}/role-${picture.portraitSha.slice(0, 12)}-${picture.color}-${mode}.png`
      await tosPut(ctx, tosKey, picture.abs, 'image/png')
      let j
      try {
        j = await withRetry(ctx, () => volcCall(ctx, 'CVSubmitTask', { req_key: spec.createKey, image_url: tosUrl(ctx.cfg, tosKey, 'GET', 3600) }))
      } catch (err) {
        await tosDelete(ctx, tosKey)
        throw err
      }
      taskId = String(j.data?.task_id || '')
      if (!taskId) throw coded('火山引擎没有返回任务编号', 'PROVIDER_ERROR')
      await save({ roles: { [mode]: { pending: true, taskId, tosKey, portraitSha: picture.portraitSha, keyColor: picture.color, submittedAt: IO.now().toISOString() } } })
    }
    const start = IO.now().getTime()
    let wait = 3000
    for (;;) {
      const j = await volcCall(ctx, 'CVGetResult', { req_key: spec.createKey, task_id: taskId })
      const status = String(j.data?.status || '')
      if (status === 'done') {
        const resp = parseResp(j)
        const id = String(resp.resource_id || j.data?.resource_id || '')
        if (tosKey) await tosDelete(ctx, tosKey)
        if (!id || (Array.isArray(resp.refuse_code) && resp.refuse_code.length)) {
          await save({ roles: { [mode]: null } })
          throw coded(`火山引擎没能用这张图建立形象${resp.msg && resp.msg !== 'success' ? `：${String(resp.msg).slice(0, 120)}` : ''}（形象图要有清楚的正脸）`, 'UNSUPPORTED_IMAGE')
        }
        await save({ roles: { [mode]: { resourceId: id, portraitSha: picture.portraitSha, keyColor: picture.color, createdAt: IO.now().toISOString() } } })
        return id
      }
      if (status === 'not_found' || status === 'expired') {
        await save({ roles: { [mode]: null } })
        throw coded('火山引擎建立形象的任务已经过期，请重新生成（这次没有成功的不收费）', 'PROVIDER_ERROR')
      }
      if (IO.now().getTime() - start > 20 * 60_000) throw coded('火山引擎建立形象超时；任务已记下，下次会接着查，不会重复收费', 'TIMEOUT')
      await IO.sleep(wait, ctx.signal)
      wait = Math.min(15000, Math.round(wait * 1.4))
    }
  },
  async submit(ctx, piece) {
    const spec = VOLC_MODES[ctx.mode]
    const tosKey = tosKeyFor(ctx, `piece-${piece.i}.mp3`)
    await tosPut(ctx, tosKey, piece.audioAbs, 'audio/mpeg')
    let j
    try {
      j = await volcCall(ctx, 'CVSubmitTask', { req_key: spec.videoKey, audio_url: tosUrl(ctx.cfg, tosKey, 'GET', 3 * 3600), resource_id: ctx.avatarId })
    } catch (err) {
      // a retry (busy service) uploads the same object again; anything else: nothing may stay in the user's bucket
      if (!err?.retryable) await tosDelete(ctx, tosKey)
      throw err
    }
    const taskId = String(j.data?.task_id || '')
    if (!taskId) throw coded('火山引擎没有返回任务编号', 'PROVIDER_ERROR')
    return { taskId, tosKey }
  },
  async poll(ctx, taskId) {
    const spec = VOLC_MODES[ctx.mode]
    let j
    try {
      j = await volcCall(ctx, 'CVGetResult', { req_key: spec.videoKey, task_id: taskId })
    } catch (err) {
      if (err.retryable) return { state: 'running' }
      if (err.code === 'NO_KEY' || err.network) throw err
      return { state: 'failed', error: err }
    }
    const status = String(j.data?.status || '')
    if (status === 'done') {
      const resp = parseResp(j)
      const url = j.data?.video_url || (Array.isArray(resp.preview_url) ? resp.preview_url[0] : '') || resp.url || resp.video_url || ''
      if (!url) return { state: 'failed', error: coded(`火山引擎没有生成出视频${resp.msg && resp.msg !== 'success' ? `：${String(resp.msg).slice(0, 120)}` : ''}`, 'PROVIDER_ERROR') }
      return { state: 'done', url }
    }
    if (status === 'not_found' || status === 'expired') return { state: 'lost' }
    return { state: 'running' }
  },
  async afterPiece(ctx, piece) {
    if (piece.tosKey) await tosDelete(ctx, piece.tosKey)
  },
}

const ADAPTERS = { vidu, runway, volc }

async function withRetry(ctx, fn, { tries = 40, waitMs = 15000 } = {}) {
  for (let k = 0; ; k++) {
    try {
      return await fn()
    } catch (err) {
      if (!err?.retryable || k >= tries - 1) throw err
      ctx.progress(`${ctx.adapter?.label || '云端'}正在排队（同时进行的任务太多），稍等再提交…`)
      await IO.sleep(waitMs, ctx.signal)
    }
  }
}

/* ------------------------------------------------------------------------------------------------- render */

function readJson(abs) {
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
}
function writeJsonAtomic(abs, data) {
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, abs)
}

/** The cost of what still has to be submitted (pieces without a task, a missing 火山引擎 形象). */
function remainingCost({ engine, pieces, fps, needsRole }) {
  let rmb = 0
  for (const p of pieces) {
    if (p.taskId || p.raw) continue
    const sec = (p.f1 - p.f0) / fps
    if (engine === 'vidu') rmb += Math.ceil(sec - 1e-9) * CLOUD_PRICES.vidu.rmbPerCredit
    else if (engine === 'volc') rmb += Math.ceil(sec - 1e-9) * CLOUD_PRICES.volc.rmbPerSec
    else rmb += Math.ceil(sec / CLOUD_PRICES.runway.secPerCredit - 1e-9) * CLOUD_PRICES.runway.usdPerCredit * USD_TO_RMB
  }
  if (engine === 'volc' && needsRole) rmb += CLOUD_PRICES.volc.createRmb
  return r2up(rmb)
}

/** What the clip actually cost (provider-reported credits when available). */
function actualCost(engine, pieces, fps, createdRole) {
  let rmb = 0
  for (const p of pieces) {
    const sec = (p.f1 - p.f0) / fps
    if (engine === 'vidu') rmb += (p.credits || Math.ceil(sec - 1e-9)) * CLOUD_PRICES.vidu.rmbPerCredit
    else if (engine === 'volc') rmb += Math.ceil(sec - 1e-9) * CLOUD_PRICES.volc.rmbPerSec
    else rmb += (p.credits || Math.ceil(sec / CLOUD_PRICES.runway.secPerCredit - 1e-9)) * CLOUD_PRICES.runway.usdPerCredit * USD_TO_RMB
  }
  if (createdRole) rmb += CLOUD_PRICES.volc.createRmb
  return Math.round(rmb * 100) / 100
}

const inflight = new Map()

/**
 * Tier-3 presenter clip (ANIME-AVATAR.md engine interface): `character` speaking `audioAbs` as a transparent VP9 WebM
 * at `outAbs` (from 0 to exactly the voice's length, cropped to the character). Needs `confirmedRmb` ≥ what still has
 * to be paid. Options beyond the contract: `concurrency`, `pollTimeoutMs`, `dataUriMax`, `maxPieceSec` (tests).
 * → { ok, path, durationSec, fps, width, height, engine, mode, note, cost: { rmb, unit, basis }, pieces, cached }
 */
export async function renderPresenterClip({ engine, character, audioAbs, outAbs, fps = 30, maxHeight = 720, track = null, mode = '', confirmedRmb, saveCloudId, signal, onProgress, onChild, concurrency = 0, pollTimeoutMs = 0, dataUriMax = 0, maxPieceSec = 0 } = {}) {
  if (signal?.aborted) throw createAbortError()
  if (!ANIME_CLOUD_ENGINES.includes(engine)) throw coded('不认识的云端数字人服务', 'BAD_REQUEST')
  if (!character?.id || !character?.dir) throw coded('没有找到这个动漫形象', 'NOT_FOUND')
  if (!audioAbs || !existsSync(audioAbs)) throw coded('没有找到这段配音', 'PROVIDER_ERROR')
  if (!outAbs) throw coded('没有指定输出文件', 'PROVIDER_ERROR')
  const cfg = loadAnimeCloudConfig()
  const st = engineStatus(engine, cfg)
  if (!st.configured) throw coded(`${ENGINE_NAMES[engine]}：${st.reason}`, 'NO_KEY')
  const rate = clamp(Math.round(Number(fps) || 30), 10, 60)
  const m = resolveMode(engine, mode, cfg)
  const adapter = ADAPTERS[engine]
  const progress = (message, pct) => onProgress?.({ message, ...(Number.isFinite(pct) ? { pct } : {}) })

  progress(`正在准备交给「${ENGINE_NAMES[engine]}」的形象图和声音…`, 1)
  const { durationSec } = await probeAudioDuration(audioAbs, rate)
  if (!(durationSec > 0)) throw coded('读不出这段配音的长度', 'PROVIDER_ERROR')
  const totalFrames = Math.max(1, Math.round(durationSec * rate))
  const picture = await prepareCloudPicture(character, { signal, onChild })
  const audioSha = sha256FileSync(audioAbs)
  const key = createHash('sha1').update(JSON.stringify([ANIME_CLOUD_VERSION, engine, m, character.id, picture.portraitSha, picture.color, audioSha, rate])).digest('hex')
  const jobDir = join(dirname(resolve(outAbs)), '.anime-cache', `cloud-${engine}-${key.slice(0, 16)}`)
  const jobAbs = join(jobDir, 'job.json')
  mkdirSync(jobDir, { recursive: true })

  if (inflight.has(key)) {
    await inflight.get(key)
    return renderPresenterClip({ engine, character, audioAbs, outAbs, fps, maxHeight, track, mode, confirmedRmb, saveCloudId, signal, onProgress, onChild, concurrency, pollTimeoutMs, dataUriMax, maxPieceSec })
  }
  const job = (async () => {
    let state = readJson(jobAbs)
    if (!state || state.key !== key || !Array.isArray(state.pieces)) {
      let tr = track
      if (!tr || !Array.isArray(tr.open)) tr = await computeVisemeTrack({ audioAbs, fps: rate, signal, onChild })
      const pieces = planPieces({ track: tr, totalFrames, fps: rate, maxSec: Number(maxPieceSec) > 0 ? Number(maxPieceSec) : pieceLimitSec(engine, m) })
      state = { version: ANIME_CLOUD_VERSION, key, engine, mode: m, characterId: character.id, portraitSha: picture.portraitSha, keyColor: picture.color, audioSha, fps: rate, totalFrames, pieces, createdAt: IO.now().toISOString() }
      writeJsonAtomic(jobAbs, state)
    }
    const save = () => writeJsonAtomic(jobAbs, { ...state, updatedAt: IO.now().toISOString() })
    const pieces = state.pieces
    for (const p of pieces) if (p.raw && !existsSync(join(jobDir, p.raw))) p.raw = ''
    const finalAbs = join(jobDir, 'clip.webm')
    const modeLabel = engine === 'volc' ? `${(VOLC_MODES[m] || VOLC_MODES.loopy).label.split('（')[0]}模式` : engine === 'vidu' ? m : ''
    const noteFor = (rmb) => `云端 · ${ENGINE_NAMES[engine]}${modeLabel ? `（${modeLabel}）` : ''}：整张脸跟着声音动${pieces.length > 1 ? `，分 ${pieces.length} 段生成` : ''}；约 ${rmb.toFixed(2)} 元，以服务商账单为准`
    const deliver = (res, cached) => {
      mkdirSync(dirname(resolve(outAbs)), { recursive: true })
      const tmpOut = `${outAbs}.${process.pid}.tmp`
      copyFileSync(finalAbs, tmpOut)
      renameSync(tmpOut, outAbs)
      progress('会说话的动漫形象已生成', 100)
      return { ok: true, path: resolve(outAbs), durationSec: res.durationSec, fps: rate, width: res.width, height: res.height, engine, mode: m, note: noteFor(res.rmb), cost: { rmb: res.rmb, unit: '元', basis: CLOUD_PRICES[engine].basis }, pieces: pieces.length, cached }
    }
    // already finished before (another cut / a re-plan with the same voice): nothing to pay, nothing to re-key
    if (state.result && existsSync(finalAbs) && pieces.every((p) => p.raw) && Number(state.result.maxHeight) === Number(maxHeight)) return deliver(state.result, true)

    // money gate: what is still to pay must be covered by the caller's confirmation
    const fresh = getCharacter(character.id) || character
    const needsRole = engine === 'volc' && !volcRoleOf(fresh, m, picture.portraitSha)
    const owed = remainingCost({ engine, pieces, fps: rate, needsRole })
    const confirmed = Number(confirmedRmb)
    if (owed > 0 && !(Number.isFinite(confirmed) && confirmed + 1e-9 >= owed)) {
      throw coded(`云端数字人这段约 ${owed.toFixed(2)} 元，需要先确认费用`, 'COST_NOT_CONFIRMED', { estimateRmb: owed })
    }

    const saveCloud = typeof saveCloudId === 'function' ? (provider, data) => saveCloudId(provider, data) : (provider, data) => saveCharacterCloudId(character.id, provider, data)
    const ctx = { cfg, character: fresh, picture, mode: m, key, signal, onChild, adapter, saveCloud, progress, dataUriMax }
    const allDownloaded = pieces.every((p) => p.raw)
    let createdRole = false
    if (!allDownloaded && adapter.ensureAvatar) {
      const before = needsRole
      ctx.avatarId = await adapter.ensureAvatar(ctx)
      createdRole = before && engine === 'volc'
    }

    // pieces: cut → submit (ledger first) → poll → download
    const doneCount = () => pieces.filter((p) => p.raw).length
    const report = (extra = '') => progress(`「${ENGINE_NAMES[engine]}」正在生成会说话的动漫形象：${doneCount()} / ${pieces.length} 段完成${extra}`, 10 + Math.round((doneCount() / pieces.length) * 75))
    let firstError = null
    let stopSubmitting = false
    const limit = Math.max(1, Number(concurrency) || CONCURRENCY[engine] || 1)
    const queue = pieces.filter((p) => !p.raw)
    const deadlineFor = (p) => Number(pollTimeoutMs) || Math.min(3 * 3600_000, 15 * 60_000 + ((p.f1 - p.f0) / rate) * 30_000)
    const work = async (p) => {
      if (!p.taskId) {
        if (stopSubmitting) return
        const audioAbsPiece = join(jobDir, `piece-${p.i}.mp3`)
        await cutPieceAudio({ audioAbs, piece: p, fps: rate, outAbs: audioAbsPiece, signal, onChild })
        if (stopSubmitting) return
        const sub = await withRetry(ctx, () => adapter.submit(ctx, { ...p, audioAbs: audioAbsPiece }))
        // the ledger first: from here on a retry polls this task instead of paying again
        p.taskId = sub.taskId
        if (sub.tosKey) p.tosKey = sub.tosKey
        p.submittedAt = IO.now().toISOString()
        p.state = 'submitted'
        p.error = ''
        save()
      }
      report()
      const start = IO.now().getTime()
      let wait = adapter.pollStartMs
      let hiccups = 0
      for (;;) {
        let r
        try {
          r = await adapter.poll(ctx, p.taskId)
          hiccups = 0
        } catch (err) {
          // a short network drop while waiting must not give up a paid task
          if (err?.name === 'AbortError' || signal?.aborted || !(err?.network || err?.code === 'TIMEOUT') || ++hiccups > 6) throw err
          report('（网络有点慢，正在重试…）')
          await IO.sleep(Math.min(30_000, wait * hiccups), signal)
          continue
        }
        if (r.state === 'done') {
          const rawName = `raw-${p.i}.mp4`
          await downloadTo(r.url, join(jobDir, rawName), { signal, label: ENGINE_NAMES[engine] })
          p.raw = rawName
          p.state = 'done'
          if (r.credits) p.credits = r.credits
          save()
          if (adapter.afterPiece) await adapter.afterPiece(ctx, p)
          report()
          return
        }
        if (r.state === 'failed') {
          p.state = 'failed'
          p.taskId = ''
          p.error = String(r.error?.message || '').slice(0, 300)
          save()
          if (adapter.afterPiece) await adapter.afterPiece(ctx, p)
          throw r.error || coded(`${ENGINE_NAMES[engine]}没有生成出这一段`, 'PROVIDER_ERROR')
        }
        if (r.state === 'lost') {
          p.state = 'lost'
          p.taskId = ''
          save()
          throw coded(`${ENGINE_NAMES[engine]}找不到之前提交的任务了（可能已过期）；下次出片会重新提交这一段`, 'PROVIDER_ERROR')
        }
        if (IO.now().getTime() - start > deadlineFor(p)) throw coded(`${ENGINE_NAMES[engine]}生成得太久了；任务已记下，下次出片会接着取结果，不会重复收费`, 'TIMEOUT')
        report(r.progress ? `（当前一段 ${Math.round(r.progress)}%）` : '')
        await IO.sleep(wait, signal)
        wait = Math.min(adapter.pollMaxMs, Math.round(wait * 1.3))
      }
    }
    let next = 0
    const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (next < queue.length) {
        const p = queue[next++]
        try {
          await work(p)
        } catch (err) {
          if (err?.name === 'AbortError' || signal?.aborted) throw err
          if (!firstError) firstError = err
          stopSubmitting = true
        }
      }
    })
    await Promise.all(runners)
    if (firstError) throw firstError
    if (!pieces.every((p) => p.raw)) throw coded(`${ENGINE_NAMES[engine]}还有没生成完的部分`, 'PROVIDER_ERROR')

    // key + join + crop
    progress('正在抠掉背景、拼接成透明视频…', 88)
    const raws = pieces.map((p) => join(jobDir, p.raw))
    const first = await probeVideo(raws[0], { signal })
    if (!first.width || !first.height) throw coded(`${ENGINE_NAMES[engine]}生成的视频读不出来`, 'PROVIDER_ERROR')
    const size = { w: first.width - (first.width % 2), h: first.height - (first.height % 2) }
    const ana = await analyzeKeyed({ raws, size, color: picture.color, signal, onChild })
    const crop = planCloudCrop(ana.box, size, { maxHeight })
    const tmpWebm = join(jobDir, `clip.${process.pid}.webm`)
    await keyAndEncode({ raws, pieces, size, color: picture.color, crop, fps: rate, totalFrames, outWebm: tmpWebm, signal, onChild })
    const probe = await probeVideo(tmpWebm, { signal })
    const wantSec = totalFrames / rate
    if (Math.abs(probe.durationSec - wantSec) > 1 / rate + 0.06) throw coded(`拼好的视频长度不对（${probe.durationSec.toFixed(2)} 秒 / 配音 ${wantSec.toFixed(2)} 秒）`, 'PROVIDER_ERROR')
    renameSync(tmpWebm, finalAbs)
    // what was paid is remembered with the result: re-keying later (another size) reports the same amount
    const rmb = state.result?.rmb ?? actualCost(engine, pieces, rate, createdRole)
    state.result = { width: probe.width, height: probe.height, durationSec: r3(wantSec), rmb, maxHeight: Number(maxHeight), keyShare: ana.share, crop, finishedAt: IO.now().toISOString() }
    save()
    // the voice pieces were only needed for submitting
    for (const p of pieces) {
      try {
        rmSync(join(jobDir, `piece-${p.i}.mp3`), { force: true })
      } catch {}
    }
    return deliver(state.result, allDownloaded)
  })()
  inflight.set(key, job.catch(() => {}))
  try {
    return await job
  } finally {
    inflight.delete(key)
  }
}

/* -------------------------------------------------------------------------------------------- test key */

/**
 * Check a service's key without generating anything (free): Vidu / Runway read-only calls, 火山引擎 a result query for
 * a task that does not exist plus a tiny write + delete in the TOS bucket. → { ok, engine, message }
 */
export async function testAnimeCloudConnection({ engine, signal } = {}) {
  if (!ANIME_CLOUD_ENGINES.includes(engine)) throw coded('不认识的云端数字人服务', 'BAD_REQUEST')
  const cfg = loadAnimeCloudConfig()
  const st = engineStatus(engine, cfg)
  if (!st.configured) return { ok: false, engine, code: 'NO_KEY', message: st.reason }
  try {
    if (engine === 'vidu') {
      const r = await http(`https://${viduHost(cfg)}/ent/v2/tasks/1/creations`, { headers: { Authorization: `Token ${cfg.vidu.apiKey}` }, signal, timeoutMs: 30_000, label: 'Vidu' })
      if (r.status === 401 || /Unauthorized/i.test(String(r.json?.reason || ''))) throw viduError(401, r.json, r.text)
      if (r.status >= 500) throw coded(`Vidu 服务暂时不可用（HTTP ${r.status}）`, 'PROVIDER_ERROR')
      return { ok: true, engine, message: `Vidu 密钥可用（${cfg.vidu.region === 'global' ? '海外站' : '国内站'}）。测试不生成视频，不收费` }
    }
    if (engine === 'runway') {
      const r = await http(`${RUNWAY_BASE}/v1/avatars?limit=1`, { headers: runwayHeaders(cfg, false), signal, timeoutMs: 30_000, label: 'Runway' })
      if (!r.ok) throw runwayError(r.status, r.json, r.text, '验证密钥')
      return { ok: true, engine, message: 'Runway 密钥可用。测试不生成视频，不收费' }
    }
    const ctx = { cfg, signal, character: { id: 'connection-test' }, key: randomBytes(8).toString('hex') }
    try {
      await volcCall(ctx, 'CVGetResult', { req_key: VOLC_MODES.loopy.videoKey, task_id: '1' })
    } catch (err) {
      if (err.code === 'NO_KEY' || err.network) throw err
      // any business answer about the made-up task means the key and the signature were accepted
    }
    const tmpAbs = join(dirname(animeCloudConfigPath()), `.anime-cloud-test-${process.pid}.txt`)
    writeFileSync(tmpAbs, 'dsh anime cloud connection test')
    const k = `dsh-anime/connection-test-${randomBytes(4).toString('hex')}.txt`
    try {
      await tosPut(ctx, k, tmpAbs, 'text/plain')
      await tosDelete(ctx, k)
    } finally {
      try {
        unlinkSync(tmpAbs)
      } catch {}
    }
    return { ok: true, engine, message: `火山引擎密钥可用，存储桶 ${cfg.volc.tosBucket} 可以读写。测试不生成视频，不收生成费` }
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    return { ok: false, engine, code: err?.code || 'PROVIDER_ERROR', message: String(err?.message || err).slice(0, 300) }
  }
}
