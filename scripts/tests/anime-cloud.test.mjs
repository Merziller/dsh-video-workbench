#!/usr/bin/env node
/**
 * 「我的动漫形象」 云端档 (anime-cloud.js) — Vidu / 火山引擎 / Runway with a simulated network: no real request, no paid
 * call. FFmpeg makes the "provider" videos (a character box on the key colour) so the real keying / joining / cropping
 * pipeline runs.
 *   - signing: the TOS (S3-compatible) presign = the official AWS SigV4 test vector; the 火山引擎 OpenAPI signature =
 *     a port of the official volc-sdk-nodejs Signer
 *   - config: saved keys never come back (masked), masked / empty input keeps them, clear, validation, status
 *   - estimates (official prices, rounding per piece, the 火山引擎 形象 fee only once)
 *   - pieces cut at pauses (frame-exact, the fewest pieces), key colour choice, the 3:4 key-colour picture
 *   - Vidu / 火山引擎 / Runway end to end: requests as documented, ledger, cached re-use, the cost gate (nothing is sent
 *     without confirmation), resume after a stop without paying again, error codes
 *   - free connection tests, routes, planAnimePresenter with a cloud engine
 *
 *   node scripts/tests/anime-cloud.test.mjs
 *
 * Scratch data only (<repo>/.tmp/anime-cloud-test/<stamp>).
 */
import { spawnSync } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'anime-cloud-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client'), proj: join(SCR, 'ws', 'proj'), media: join(SCR, 'media') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
const CFG = join(SCR, 'anime-cloud.json')
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
  DSH_VIDEO_CLOUD_MEDIA_CONFIG: join(SCR, 'cloud-media.json'),
  DSH_VIDEO_ANIME_CLOUD_CONFIG: CFG,
})
globalThis.fetch = async () => {
  throw new Error('network disabled in this test')
}

let passed = 0
let failed = 0
const ok = (cond, label, extra) => {
  if (cond) passed++
  else {
    failed++
    console.log(`  ✗ ${label}${extra !== undefined ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`)
  }
}
const rejects = async (fn, code, label) => {
  try {
    await fn()
    ok(false, label, 'did not throw')
    return null
  } catch (err) {
    ok(!code || err?.code === code || err?.name === code, label, `${err?.code || err?.name}: ${err?.message}`)
    return err
  }
}
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)

const SH = await imp('packages/shared/index.js')
const SP = await imp('packages/dsh-tool-avatar/anime-sprite.js')
const CH = await imp('packages/dsh-tool-avatar/anime-character.js')
const EN = await imp('packages/dsh-tool-avatar/anime-engines.js')
const CL = await imp('packages/dsh-tool-avatar/anime-cloud.js')
const RA = await imp('packages/dsh-web-video-workbench/lib/routes-anime.js')
const { ffmpeg, ffprobe } = SH.resolveBinaries()

/* ------------------------------------------------------------------------------------------------ helpers */

const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const hmac = (k, s, enc) => createHmac('sha256', k).update(s).digest(enc)

const ff = (args) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true, maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-400)}`)
  return r
}
const probe = (abs) => JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:stream_tags=alpha_mode:format=duration', '-of', 'json', abs], { encoding: 'utf8', windowsHide: true }).stdout)
/** First frame of a VP9 + alpha WebM: how many pixels are fully transparent / opaque, and the centre's alpha. */
const alphaStats = (abs, w, h) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', abs, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20, windowsHide: true })
  const buf = r.stdout
  let zero = 0
  let full = 0
  for (let i = 3; i < buf.length; i += 4) {
    if (buf[i] < 8) zero++
    else if (buf[i] > 247) full++
  }
  const at = (x, y) => buf[(y * w + x) * 4 + 3]
  return { px: buf.length / 4, zero, full, centre: at(w >> 1, Math.round(h * 0.8)), corner: at(1, 1), green: buf[(Math.round(h * 0.8) * w + (w >> 1)) * 4 + 1] }
}

/** 16-bit mono WAV: «talk» (harmonic tone) and pauses, so the piece planner has quiet places to cut. */
function writeVoice(abs, pattern, sr = 16000) {
  const parts = []
  for (const [kind, sec] of pattern) {
    const n = Math.round(sec * sr)
    const a = new Float32Array(n)
    if (kind === 'talk') for (let i = 0; i < n; i++) a[i] = 0.25 * (Math.sin((2 * Math.PI * 180 * i) / sr) + 0.5 * Math.sin((2 * Math.PI * 760 * i) / sr) + 0.3 * Math.sin((2 * Math.PI * 1220 * i) / sr)) * Math.min(1, i / (0.02 * sr), (n - i) / (0.02 * sr))
    parts.push(a)
  }
  const total = parts.reduce((s, p) => s + p.length, 0)
  const buf = Buffer.alloc(44 + total * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + total * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sr, 24)
  buf.writeUInt32LE(sr * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(total * 2, 40)
  let o = 44
  for (const p of parts) for (let i = 0; i < p.length; i++, o += 2) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(p[i] * 32767))), o)
  writeFileSync(abs, buf)
  return abs
}
const talkPattern = (sec) => {
  const out = []
  let t = 0
  while (t < sec - 0.01) {
    const talk = Math.min(1.1, sec - t)
    out.push(['talk', talk])
    t += talk
    if (t < sec - 0.01) {
      const pause = Math.min(0.45, sec - t)
      out.push(['pause', pause])
      t += pause
    }
  }
  return out
}

/** What a provider would return: a skin-coloured «character» standing on the bottom edge of a key-colour frame. */
function providerVideo(abs, { sec, w, h, color = '0x00FF00', fps = 25 }) {
  if (existsSync(abs)) return abs
  const bw = Math.round(w * 0.4) & ~1
  const bh = Math.round(h * 0.7) & ~1
  ff(['-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${w}x${h}:r=${fps}:d=${sec}`, '-vf', `drawbox=x=${(w - bw) >> 1}:y=${h - bh}:w=${bw}:h=${bh}:color=0xF0C8B4@1.0:t=fill`, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', abs])
  return abs
}

/** A clean cartoon portrait on green (hair, face, eyes, mouth line, shirt) — the library cuts the green out. */
function cartoonPortrait(W = 600, H = 800, { shirt = [70, 110, 190] } = {}) {
  const px = Buffer.alloc(W * H * 4)
  const SKIN = [250, 224, 210]
  const HAIR = [74, 48, 42]
  const LINE = [58, 38, 38]
  const WHITE = [255, 255, 255]
  const IRIS = [60, 90, 160]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = [0, 255, 0]
      const inE = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
      if (y > 560) {
        const half = 90 + (y - 560) * 0.9
        if (Math.abs(x - 300) < half) c = shirt
      }
      if (y >= 470 && y <= 580 && Math.abs(x - 300) < 32) c = SKIN
      if (inE(300, 330, 130, 160)) c = SKIN
      if (inE(300, 270, 150, 145) && y < 300) c = HAIR
      if ((inE(175, 380, 30, 120) || inE(425, 380, 30, 120)) && y > 250) c = HAIR
      for (const ex of [250, 350]) {
        if (inE(ex, 362, 26, 30)) c = WHITE
        if (inE(ex, 366, 16, 24)) c = IRIS
        if (inE(ex, 340, 30, 9) && y < 345) c = LINE
      }
      if (y >= 438 && y <= 442 && Math.abs(x - 300) < 16) c = LINE
      const i = (y * W + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  return px
}

/* -------------------------------------------------------------------------------------- simulated network */

let clock = Date.parse('2026-11-24T08:00:00Z')
const net = { calls: [], routes: [] }
const resetNet = () => {
  net.calls = []
  net.routes = []
}
const route = (method, test, handler) => net.routes.push({ method, test, handler })
const jsonRes = (obj, status = 200) => new Response(typeof obj === 'string' ? obj : JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
const fileRes = (abs) => new Response(readFileSync(abs), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(statSync(abs).size) } })
const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError', code: 'ABORT_ERR' })
const hooks = { onSleep: null }
CL.__setAnimeCloudTransportForTests({
  now: () => new Date(clock),
  sleep: async (ms, signal) => {
    if (signal?.aborted) throw abortError()
    clock += ms
    if (hooks.onSleep) await hooks.onSleep(ms)
    if (signal?.aborted) throw abortError()
  },
  fetch: async (url, init = {}) => {
    const u = String(url)
    const method = String(init.method || 'GET').toUpperCase()
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]))
    const body = init.body
    const call = { method, url: u, headers, body, json: null }
    if (typeof body === 'string') {
      try {
        call.json = JSON.parse(body)
      } catch {}
    }
    net.calls.push(call)
    for (const r of net.routes) if (r.method === method && (typeof r.test === 'string' ? u.startsWith(r.test) : r.test.test(u))) return r.handler(call)
    return jsonRes({ error: `no simulated route for ${method} ${u}` }, 599)
  },
})
const callsTo = (rx, method) => net.calls.filter((c) => rx.test(c.url) && (!method || c.method === method))

/* ------------------------------------------------------------------------------------------------ signing */
console.log('· signing')
{
  // AWS documentation example (query-string authentication, GET examplebucket/test.txt, 2013-05-24, 86400 s). The
  // credentials are AWS's published sample values, not real keys; they are assembled here so secret scanners do not
  // mistake them for a leaked key.
  const docKeyId = ['AKIA', 'IOSFODNN7', 'EXAMPLE'].join('')
  const docSecret = ['wJalrXUtnFEMI', 'K7MDENG', 'bPxRfiCYEXAMPLEKEY'].join('/')
  const url = CL.presignS3Url({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', region: 'us-east-1', accessKeyId: docKeyId, secretAccessKey: docSecret, expiresSec: 86400, now: new Date('2013-05-24T00:00:00Z') })
  ok(
    url ===
      `https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${docKeyId}%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404`,
    'TOS presign = the official AWS SigV4 test vector',
    url,
  )

  /** Port of volc-sdk-nodejs src/base/sign.ts (addAuthorization): every header but the unsignable ones is signed. */
  const sdkAuthorization = ({ method, params, headers, body, region, service, ak, sk, date }) => {
    const unsignable = ['authorization', 'content-type', 'content-length', 'user-agent', 'presigned-expires', 'expect']
    const uriEscape = (str) =>
      encodeURIComponent(str)
        .replace(/[^A-Za-z0-9_.~\-%]+/g, escape)
        .replace(/[*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    const datetime = date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[:\-]|\.\d{3}/g, '')
    const h = { ...headers, 'X-Date': datetime, 'X-Content-Sha256': sha256(body) }
    const sorted = Object.keys(params).sort()
    const query = sorted.map((k) => `${uriEscape(k)}=${uriEscape(params[k])}`).join('&')
    const pairs = Object.keys(h)
      .map((k) => [k, h[k]])
      .sort((a, b) => (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1))
      .filter(([k]) => !unsignable.includes(k.toLowerCase()))
    const canonHeaders = pairs.map(([k, v]) => `${k.toLowerCase()}:${String(v).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '')}`).join('\n')
    const signedHeaders = Object.keys(h)
      .map((k) => k.toLowerCase())
      .filter((k) => !unsignable.includes(k))
      .sort()
      .join(';')
    const canonical = [method, '/', query, `${canonHeaders}\n`, signedHeaders, h['X-Content-Sha256']].join('\n')
    const scope = [datetime.slice(0, 8), region, service, 'request'].join('/')
    const toSign = ['HMAC-SHA256', datetime, scope, sha256(canonical)].join('\n')
    const key = hmac(hmac(hmac(hmac(sk, datetime.slice(0, 8)), region), service), 'request')
    return `HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(key, toSign, 'hex')}`
  }
  const body = JSON.stringify({ req_key: 'realman_avatar_picture_loopy', task_id: '7392616336519610409' })
  const date = new Date('2026-11-24T08:09:10.123Z')
  const signed = CL.signVolcRequest({ query: { Action: 'CVGetResult', Version: '2022-08-31' }, body, accessKeyId: 'AKLTtest1234567890', secretAccessKey: 'c2VjcmV0LXNlY3JldA==', now: date })
  ok(signed.url === 'https://visual.volcengineapi.com/?Action=CVGetResult&Version=2022-08-31', '火山引擎: documented endpoint + Action / Version query', signed.url)
  ok(signed.headers['X-Date'] === '20261124T080910Z' && signed.headers['X-Content-Sha256'] === sha256(body), '火山引擎: X-Date / X-Content-Sha256 headers', signed.headers)
  const expected = sdkAuthorization({ method: 'POST', params: { Action: 'CVGetResult', Version: '2022-08-31' }, headers: { 'Content-Type': 'application/json' }, body, region: 'cn-north-1', service: 'cv', ak: 'AKLTtest1234567890', sk: 'c2VjcmV0LXNlY3JldA==', date })
  ok(signed.headers.Authorization === expected, '火山引擎: Authorization = the official SDK signer (cn-north-1 / cv)', { got: signed.headers.Authorization, expected })
}

/* ------------------------------------------------------------------------------------------------ config */
console.log('· config')
{
  const st0 = CL.getAnimeCloudStatus().engines
  ok(!st0.vidu.configured && !st0.volc.configured && !st0.runway.configured, 'nothing configured at first', st0)
  ok(st0.volc.modes.map((m) => m.value).join() === 'loopy,normal,loopyb' && st0.vidu.modes.map((m) => m.value).join() === '540p,720p', 'modes offered (火山引擎 3, Vidu 2)')
  CL.saveAnimeCloudConfig({ vidu: { apiKey: 'vda_test_key_123456789', region: 'cn', resolution: '720p' } })
  let sum = CL.getAnimeCloudConfigSummary()
  ok(sum.vidu.hasApiKey && sum.vidu.apiKeyMasked === 'vda_***6789' && sum.vidu.resolution === '720p' && sum.vidu.configured, 'Vidu key saved, shown masked', sum.vidu)
  ok(!JSON.stringify(sum).includes('vda_test_key_123456789'), 'the summary never contains a saved key')
  CL.saveAnimeCloudConfig({ vidu: { apiKey: 'vda_***6789', resolution: '540p' } })
  ok(CL.loadAnimeCloudConfig().vidu.apiKey === 'vda_test_key_123456789' && CL.loadAnimeCloudConfig().vidu.resolution === '540p', 'masked input keeps the saved key')
  CL.saveAnimeCloudConfig({ vidu: { apiKey: '' } })
  ok(CL.loadAnimeCloudConfig().vidu.apiKey === 'vda_test_key_123456789', 'empty input keeps the saved key')
  let bad = null
  try {
    CL.saveAnimeCloudConfig({ volc: { tosBucket: 'Bad_Bucket!' } })
  } catch (err) {
    bad = err
  }
  ok(bad?.code === 'BAD_REQUEST', 'invalid bucket name refused', bad?.message)
  try {
    bad = null
    CL.saveAnimeCloudConfig({ runway: { apiKey: 'has space in it' } })
  } catch (err) {
    bad = err
  }
  ok(bad?.code === 'BAD_REQUEST', 'a key with spaces refused', bad?.message)
  CL.saveAnimeCloudConfig({ volc: { accessKeyId: 'AKLTtest1234567890', secretAccessKey: 'c2VjcmV0LXNlY3JldA==' } })
  let st = CL.getAnimeCloudStatus().engines.volc
  ok(!st.configured && /存储桶|TOS/.test(st.reason), '火山引擎 needs a TOS bucket too', st.reason)
  CL.saveAnimeCloudConfig({ volc: { tosBucket: 'My-Anime-Bucket', tosRegion: 'cn-beijing', mode: 'loopy' } })
  st = CL.getAnimeCloudStatus().engines.volc
  ok(st.configured && CL.loadAnimeCloudConfig().volc.tosBucket === 'my-anime-bucket', '火山引擎 configured (bucket name lower-cased)', st)
  CL.saveAnimeCloudConfig({ runway: { apiKey: 'key_runway_test_0123456789' } })
  sum = CL.getAnimeCloudConfigSummary()
  ok(sum.runway.configured && sum.volc.accessKeyIdMasked === 'AKLT***7890' && sum.volc.hasSecretAccessKey && !JSON.stringify(sum).includes('c2VjcmV0'), 'all three configured; secrets masked / hidden')
  const raw = JSON.parse(readFileSync(CFG, 'utf8'))
  ok(raw.runway.apiKey === 'key_runway_test_0123456789' && raw.volc.secretAccessKey === 'c2VjcmV0LXNlY3JldA==', 'keys stored in the scratch config file only')
  const engines = await EN.getPresenterEngines()
  const vi = engines.find((e) => e.id === 'vidu')
  ok(vi.available && vi.paid && Array.isArray(vi.modes) && vi.defaultMode === '540p', 'engine picker: Vidu available with its modes', vi)
}

/* ------------------------------------------------------------------------------------------------ estimates */
console.log('· estimates')
{
  const v60 = await CL.estimatePresenterCost({ engine: 'vidu', durationSec: 60 })
  ok(v60.rmb === 1.88 && v60.credits === 60 && v60.pieces === 1 && v60.sourceUrl.includes('vidu'), 'Vidu: 60 s = 60 credits = 1.88 元', v60)
  const v130 = await CL.estimatePresenterCost({ engine: 'vidu', durationSec: 130 })
  ok(v130.pieces === 3 && v130.credits === 132 && v130.rmb === 4.13, 'Vidu: 130 s in 3 pieces, each rounded up (worst case)', v130)
  const volc100 = await CL.estimatePresenterCost({ engine: 'volc', durationSec: 100, mode: 'loopyb' })
  ok(volc100.pieces === 3 && volc100.seconds === 102 && volc100.createRmb === 0.1 && volc100.rmb === 30.7, '火山引擎 大画幅: 3 pieces of ≤ 45 s, 0.3 元/秒 + 0.1 元 形象', volc100)
  const volcDefault = await CL.estimatePresenterCost({ engine: 'volc', durationSec: 10 })
  ok(volcDefault.mode === 'loopy' && volcDefault.rmb === 3.1, '火山引擎 default mode = the saved one (灵动)', volcDefault)
  const rw = await CL.estimatePresenterCost({ engine: 'runway', durationSec: 90 })
  ok(rw.credits === 30 && rw.usd === 0.3 && rw.rmb === 2.19, 'Runway: 90 s = 30 credits = 0.30 美元 ≈ 2.19 元', rw)
  const viaEngines = await EN.estimatePresenterCost({ engine: 'vidu', durationSec: 60 })
  ok(viaEngines.rmb === 1.88 && viaEngines.engine === 'vidu', 'anime-engines delegates to the cloud estimate')
}

/* ------------------------------------------------------------------------------------------------ pieces */
console.log('· pieces & picture')
{
  const fps = 30
  const total = 200 * fps
  const open = new Array(total).fill(0.8)
  // quiet moments at 40 s, 75 s, 95 s, 150 s: 75 s is too early for a 4-piece plan (the rest would not fit), 95 s fits
  for (const s of [40, 75, 95, 150]) for (let f = s * fps - 6; f <= s * fps + 6; f++) open[f] = 0
  const pieces = CL.planPieces({ track: { fps, open, talk: open }, totalFrames: total, fps, maxSec: 60 })
  ok(pieces.length === 4, 'fewest pieces: ceil(200 / 60) = 4', pieces)
  ok(pieces[0].f0 === 0 && pieces.at(-1).f1 === total && pieces.every((p, i) => i === 0 || p.f0 === pieces[i - 1].f1), 'pieces are contiguous and cover every frame')
  ok(pieces.every((p) => p.f1 - p.f0 <= 60 * fps), 'every piece ≤ the limit', pieces.map((p) => (p.f1 - p.f0) / fps))
  ok(pieces.slice(0, -1).every((p, i) => Math.abs(p.f1 / fps - [40, 95, 150][i]) < 0.25), 'cuts land in the pauses that keep the fewest pieces', pieces.map((p) => p.f1 / fps))
  ok(CL.planPieces({ totalFrames: 90, fps, maxSec: 60 }).length === 1, 'short voice: one piece')

  const greenShirt = cartoonPortrait(600, 800, { shirt: [40, 170, 60] })
  for (let i = 0; i < 600 * 800; i++) if (greenShirt[i * 4] === 0 && greenShirt[i * 4 + 1] === 255) greenShirt[i * 4 + 3] = 0
  ok(CL.chooseKeyColor(greenShirt, 600, 800) === 'blue', 'a character wearing green gets a blue key')
  const blueShirt = cartoonPortrait()
  for (let i = 0; i < 600 * 800; i++) if (blueShirt[i * 4] === 0 && blueShirt[i * 4 + 1] === 255) blueShirt[i * 4 + 3] = 0
  ok(CL.chooseKeyColor(blueShirt, 600, 800) === 'green', 'otherwise green')
  const crop = CL.planCloudCrop({ x: 100, y: 150, w: 200, h: 330 }, { w: 400, h: 480 }, { maxHeight: 240 })
  ok(crop.y + crop.h === 480 && crop.w % 2 === 0 && crop.h % 2 === 0 && crop.outH === 240 && crop.x < 100, 'crop: margin, keeps the bottom edge, even sizes, scaled to the height limit', crop)
}

/* ------------------------------------------------------------------------------------------------ character */
const srcAbs = join(dirs.media, 'cartoon.png')
await SP.writePngRgba(srcAbs, cartoonPortrait(), 600, 800)
const char = await CH.createCharacter({ name: '云端测试', sourceAbs: srcAbs, kind: 'cartoon', stylize: 'none' })
{
  const pic = await CL.prepareCloudPicture(char)
  const img = await SP.readImageRgba(pic.abs, { maxSide: 4096 })
  ok(pic.ratio === '3:4' && img.width * 4 === img.height * 3, 'the picture for the service is exactly 3:4', { w: img.width, h: img.height })
  const px = (x, y) => [...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)]
  ok(JSON.stringify(px(2, 2)) === '[0,255,0]' && JSON.stringify(px(img.width - 3, 3)) === '[0,255,0]', 'flat key-colour background', px(2, 2))
  ok(px(img.width >> 1, img.height - 4)[1] < 200, 'the character stands on the bottom edge, centred', px(img.width >> 1, img.height - 4))
  ok((await CL.prepareCloudPicture(char)).abs === pic.abs && pic.abs.startsWith(char.dir), 'kept in the character folder, made once')
}

/* ------------------------------------------------------------------------------------------------ Vidu */
console.log('· Vidu end to end')
const outDir = join(dirs.proj, 'assets', '.mascot')
mkdirSync(outDir, { recursive: true })
const voiceA = writeVoice(join(dirs.media, 'voice-a.wav'), talkPattern(4))
let viduTask = 0
const viduState = new Map()
const viduRoutes = ({ succeedAfter = 2, videoFor = null } = {}) => {
  route('POST', 'https://api.vidu.cn/ent/s_avatar/offline', (c) => {
    viduTask++
    const id = `99564006672853${8000 + viduTask}`
    viduState.set(id, { polls: 0, sec: c.json?.__sec })
    // unquoted 64-bit id: JSON.parse would round it — the module must keep every digit
    return jsonRes(`{"task_id": ${id}, "state": "created", "model": "vidu-s1", "resolution": "${c.json?.resolution}"}`)
  })
  route('GET', /^https:\/\/api\.vidu\.cn\/ent\/v2\/tasks\/\d+\/creations$/, (c) => {
    const id = /tasks\/(\d+)\//.exec(c.url)[1]
    const s = viduState.get(id)
    if (!s) return jsonRes({ code: 404, reason: 'TaskNotFound', message: 'task not found' }, 404)
    s.polls++
    if (s.polls < succeedAfter) return jsonRes({ id, state: 'processing', progress: 40 })
    return jsonRes({ id, state: 'success', progress: 100, credits: 5, duration: 5, creations: [{ id: '1', url: `https://cdn.vidu.test/${id}.mp4`, watermarked_url: '' }] })
  })
  route('GET', /^https:\/\/cdn\.vidu\.test\//, (c) => fileRes(videoFor ? videoFor(c) : providerVideo(join(dirs.media, 'vidu-404x540-5s.mp4'), { sec: 5, w: 404, h: 540 })))
}
{
  resetNet()
  viduRoutes()
  const outAbs = join(outDir, 'vidu-a.webm')
  await rejects(() => CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceA, outAbs, confirmedRmb: 0.05 }), 'COST_NOT_CONFIRMED', 'Vidu: not enough confirmed → refused')
  ok(net.calls.length === 0, 'nothing was sent before the confirmation', net.calls.map((c) => c.url))
  const progress = []
  const res = await CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceA, outAbs, confirmedRmb: 1, fps: 30, maxHeight: 360, onProgress: (p) => progress.push(p.message) })
  const submits = callsTo(/s_avatar\/offline/, 'POST')
  ok(submits.length === 1, 'Vidu: one task for a 4 s voice', submits.length)
  const sub = submits[0]
  ok(sub.headers.authorization === 'Token vda_test_key_123456789' && sub.json.model === 'vidu-s1' && sub.json.resolution === '540p' && sub.json.watermark === false, 'Vidu: documented request (Token auth, vidu-s1, resolution, no watermark)', { auth: sub.headers.authorization, model: sub.json.model })
  ok(String(sub.json.image).startsWith('data:image/png;base64,') && String(sub.json.audio).startsWith('data:audio/mpeg;base64,'), 'Vidu: picture and voice sent inline (data URIs)')
  const polled = callsTo(/creations$/)
  ok(polled.length >= 2 && polled.every((c) => c.url.includes('995640066728538001')), 'Vidu: the 64-bit task id is kept exactly while polling', polled.map((c) => c.url))
  ok(res.ok && existsSync(outAbs) && res.engine === 'vidu' && res.pieces === 1, 'Vidu: clip written', res)
  const p = probe(outAbs)
  const s0 = p.streams[0]
  ok(s0.codec_name === 'vp9' && String(s0.tags?.alpha_mode ?? s0.tags?.ALPHA_MODE) === '1', 'VP9 + alpha WebM', s0)
  ok(Math.abs(Number(p.format.duration) - 4) < 0.08, 'clip as long as the voice (provider video was longer)', p.format.duration)
  ok(s0.height === 360 && s0.width < 404 && res.height === 360, 'cropped to the character and scaled to the height limit', { w: s0.width, h: s0.height })
  const a = alphaStats(outAbs, s0.width, s0.height)
  ok(a.zero > a.px * 0.05 && a.full > a.px * 0.6 && a.corner < 8 && a.centre > 247, 'green keyed out (the margins), the character stays opaque', a)
  ok(a.green < 230, 'no green left on the character (despill)', a)
  ok(res.cost.rmb === 0.16 && /0\.16 元/.test(res.note), 'cost from the provider-reported credits (5 × 0.03125)', res.cost)
  ok(progress.some((m) => /1 \/ 1 段完成/.test(m)), 'progress counts the pieces', progress.slice(-3))
  const jobs = (await import('node:fs')).readdirSync(join(outDir, '.anime-cache')).filter((n) => n.startsWith('cloud-vidu-'))
  const job = JSON.parse(readFileSync(join(outDir, '.anime-cache', jobs[0], 'job.json'), 'utf8'))
  ok(job.pieces[0].taskId === '995640066728538001' && job.pieces[0].raw === 'raw-0.mp4' && job.result?.rmb === 0.16, 'ledger: task id, downloaded piece, result', job.pieces[0])

  const before = net.calls.length
  const again = await CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceA, outAbs: join(outDir, 'vidu-a2.webm'), fps: 30, maxHeight: 360 })
  ok(again.cached && net.calls.length === before && existsSync(join(outDir, 'vidu-a2.webm')), 'same voice again: re-used without confirmation, nothing sent', { cached: again.cached, sent: net.calls.length - before })
  const rekey = await CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceA, outAbs: join(outDir, 'vidu-a3.webm'), fps: 30, maxHeight: 240 })
  ok(rekey.cached && rekey.height === 240 && net.calls.length === before && rekey.cost.rmb === 0.16, 'another size: re-keyed from the downloaded piece, nothing paid', rekey)
}

console.log('· resume after a stop')
{
  resetNet()
  viduRoutes({ succeedAfter: 1000 })
  const voiceB = writeVoice(join(dirs.media, 'voice-b.wav'), talkPattern(3))
  const ctrl = new AbortController()
  let polls = 0
  hooks.onSleep = async () => {
    polls++
    if (polls === 2) ctrl.abort()
  }
  await rejects(() => CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceB, outAbs: join(outDir, 'vidu-b.webm'), confirmedRmb: 1, signal: ctrl.signal }), 'AbortError', 'stopped while the service was still generating')
  hooks.onSleep = null
  ok(callsTo(/s_avatar\/offline/, 'POST').length === 1, 'one task had been submitted')
  // the service finishes; the next run (even without a new confirmation) only collects it
  net.routes = []
  viduRoutes({ succeedAfter: 1 })
  for (const s of viduState.values()) s.polls = 5
  const res = await CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceB, outAbs: join(outDir, 'vidu-b.webm'), confirmedRmb: 0, maxHeight: 360 })
  ok(res.ok && callsTo(/s_avatar\/offline/, 'POST').length === 1, 'resumed: the same task polled and downloaded, nothing submitted (paid) again', callsTo(/s_avatar\/offline/, 'POST').length)
}

console.log('· pieces joined')
{
  resetNet()
  viduRoutes({ videoFor: (c) => providerVideo(join(dirs.media, `vidu-piece-${/(\d+)\.mp4/.exec(c.url)[1].slice(-1)}.mp4`), { sec: 2.2, w: 404, h: 540 }) })
  const voiceC = writeVoice(join(dirs.media, 'voice-c.wav'), talkPattern(6))
  const res = await CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceC, outAbs: join(outDir, 'vidu-c.webm'), confirmedRmb: 5, maxPieceSec: 2.5, concurrency: 2, maxHeight: 300 })
  ok(res.pieces === 3 && callsTo(/s_avatar\/offline/, 'POST').length === 3, 'a 6 s voice with 2.5 s pieces: 3 tasks', res.pieces)
  const audios = callsTo(/s_avatar\/offline/, 'POST').map((c) => Buffer.from(String(c.json.audio).split(',')[1], 'base64').length)
  ok(audios.every((n) => n > 1000), 'each task carries its own piece of the voice', audios)
  const p = probe(join(outDir, 'vidu-c.webm'))
  ok(Math.abs(Number(p.format.duration) - 6) < 0.08, 'joined clip = the whole voice, frame-exact', p.format.duration)
}

console.log('· Vidu errors')
{
  resetNet()
  route('POST', 'https://api.vidu.cn/ent/s_avatar/offline', () => jsonRes({ code: 400, reason: 'CreditInsufficient', message: 'credit insufficient' }, 400))
  const voiceD = writeVoice(join(dirs.media, 'voice-d.wav'), talkPattern(2))
  await rejects(() => CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceD, outAbs: join(outDir, 'vidu-d.webm'), confirmedRmb: 1 }), 'BILLING', 'Vidu: no credits → BILLING')
  resetNet()
  route('POST', 'https://api.vidu.cn/ent/s_avatar/offline', () => jsonRes({ code: 401, reason: 'Unauthorized', message: 'bad token' }, 401))
  await rejects(() => CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceD, outAbs: join(outDir, 'vidu-d.webm'), confirmedRmb: 1 }), 'NO_KEY', 'Vidu: wrong key → NO_KEY')
  resetNet()
  viduRoutes()
  net.routes.splice(1, 1, { method: 'GET', test: /creations$/, handler: () => jsonRes({ state: 'failed', err_code: 'ImageCheckFaceFailed', err_msg: 'no face', credits: 0 }) })
  await rejects(() => CL.renderPresenterClip({ engine: 'vidu', character: char, audioAbs: voiceD, outAbs: join(outDir, 'vidu-d.webm'), confirmedRmb: 1 }), 'UNSUPPORTED_IMAGE', 'Vidu: face check failed → UNSUPPORTED_IMAGE')
}

/* ------------------------------------------------------------------------------------------------ 火山引擎 */
console.log('· 火山引擎 end to end')
const volcLog = { creates: 0, videos: 0, puts: [], deletes: [], auth: [] }
const volcRoutes = ({ videoStatus = ['generating', 'done'], createFail = 0 } = {}) => {
  const polls = new Map()
  route('PUT', /^https:\/\/my-anime-bucket\.tos-s3-cn-beijing\.volces\.com\//, (c) => {
    volcLog.puts.push(c.url.split('?')[0])
    return new Response('', { status: 200 })
  })
  route('DELETE', /^https:\/\/my-anime-bucket\.tos-s3-cn-beijing\.volces\.com\//, (c) => {
    volcLog.deletes.push(c.url.split('?')[0])
    return new Response(null, { status: 204 })
  })
  route('POST', 'https://visual.volcengineapi.com/?Action=CVSubmitTask&Version=2022-08-31', (c) => {
    volcLog.auth.push(c.headers.authorization)
    const j = c.json
    if (/create_role/.test(j.req_key)) {
      if (createFail) return jsonRes({ code: createFail, message: 'ECJPFaceDetect', data: null }, 400)
      volcLog.creates++
      return jsonRes({ code: 10000, data: { task_id: `role-${volcLog.creates}` }, message: 'Success' })
    }
    volcLog.videos++
    return jsonRes({ code: 10000, data: { task_id: `vid-${volcLog.videos}` }, message: 'Success', _echo: j })
  })
  route('POST', 'https://visual.volcengineapi.com/?Action=CVGetResult&Version=2022-08-31', (c) => {
    const j = c.json
    if (/create_role/.test(j.req_key)) return jsonRes({ code: 10000, data: { status: 'done', resp_data: JSON.stringify({ code: 0, msg: 'success', resource_id: 'res-abc', status: 0, refuse_code: [], role_type: 'anime' }) }, message: 'Success' })
    const n = (polls.get(j.task_id) || 0) + 1
    polls.set(j.task_id, n)
    const st = videoStatus[Math.min(n - 1, videoStatus.length - 1)]
    if (st !== 'done') return jsonRes({ code: 10000, data: { status: st }, message: 'Success' })
    return jsonRes({ code: 10000, data: { status: 'done', binary_data_base64: null, resp_data: JSON.stringify({ code: 0, msg: 'success', preview_url: [`https://v3-default.volc.test/${j.task_id}.mp4?lr=unwatermarked`], url: null }) }, message: 'Success' })
  })
  route('GET', /^https:\/\/v3-default\.volc\.test\//, () => fileRes(providerVideo(join(dirs.media, 'volc-512-5s.mp4'), { sec: 5, w: 512, h: 512 })))
}
{
  resetNet()
  volcRoutes()
  const est = await CL.estimatePresenterCost({ engine: 'volc', durationSec: 4, character: CH.getCharacter(char.id) })
  ok(est.createRmb === 0.1 && est.rmb === 1.3, 'first time: 4 s × 0.3 + 形象 0.1 = 1.30 元', est)
  const voiceV = writeVoice(join(dirs.media, 'voice-v.wav'), talkPattern(4))
  await rejects(() => CL.renderPresenterClip({ engine: 'volc', character: char, audioAbs: voiceV, outAbs: join(outDir, 'volc-a.webm'), confirmedRmb: 1.2 }), 'COST_NOT_CONFIRMED', '火山引擎: the 形象 fee must be covered too')
  ok(net.calls.length === 0, 'nothing sent before the confirmation')
  const res = await CL.renderPresenterClip({ engine: 'volc', character: char, audioAbs: voiceV, outAbs: join(outDir, 'volc-a.webm'), confirmedRmb: 1.3, maxHeight: 360 })
  ok(res.ok && res.mode === 'loopy' && /灵动模式/.test(res.note) && res.cost.rmb === 1.3, '火山引擎 灵动: clip made, cost includes the 形象', res)
  const subs = callsTo(/Action=CVSubmitTask/)
  ok(subs[0].json.req_key === 'realman_avatar_picture_create_role_loopy' && /^https:\/\/my-anime-bucket\.tos-s3-cn-beijing\.volces\.com\/dsh-anime\/.+\.png\?X-Amz-Algorithm=AWS4-HMAC-SHA256&/.test(subs[0].json.image_url), '形象: documented req_key + pre-signed link to the picture in the user\'s bucket', subs[0].json)
  ok(subs[1].json.req_key === 'realman_avatar_picture_loopy' && subs[1].json.resource_id === 'res-abc' && /\.mp3\?X-Amz-/.test(subs[1].json.audio_url), '视频: documented req_key + resource_id + pre-signed voice link', subs[1].json)
  ok(volcLog.auth.every((h) => /^HMAC-SHA256 Credential=AKLTtest1234567890\/\d{8}\/cn-north-1\/cv\/request, SignedHeaders=x-content-sha256;x-date, Signature=[0-9a-f]{64}$/.test(h)), 'every call signed (cn-north-1 / cv)', volcLog.auth[0])
  ok(volcLog.puts.length === 2 && volcLog.deletes.length === 2 && volcLog.puts.every((u) => volcLog.deletes.includes(u)), 'picture and voice put in the bucket, then deleted', { puts: volcLog.puts, deletes: volcLog.deletes })
  const saved = CH.getCharacter(char.id).cloud.volc
  ok(saved.roles.loopy.resourceId === 'res-abc' && saved.avatarId === 'res-abc' && CH.characterEngines(CH.getCharacter(char.id)).volc, '形象 id saved on the character (reused next time)', saved)
  const est2 = await CL.estimatePresenterCost({ engine: 'volc', durationSec: 4, character: CH.getCharacter(char.id) })
  ok(est2.createRmb === 0 && est2.rmb === 1.2, 'second time: no 形象 fee', est2)
  const voiceV2 = writeVoice(join(dirs.media, 'voice-v2.wav'), talkPattern(3))
  const res2 = await CL.renderPresenterClip({ engine: 'volc', character: CH.getCharacter(char.id), audioAbs: voiceV2, outAbs: join(outDir, 'volc-b.webm'), confirmedRmb: 0.9, maxHeight: 360 })
  ok(res2.ok && volcLog.creates === 1 && volcLog.videos === 2 && res2.cost.rmb === 0.9, 'another voice: the 形象 is reused, only the seconds are paid', { creates: volcLog.creates, cost: res2.cost })
  const s0 = probe(join(outDir, 'volc-b.webm')).streams[0]
  const a = alphaStats(join(outDir, 'volc-b.webm'), s0.width, s0.height)
  ok(a.corner < 8 && a.centre > 247, '火山引擎 512×512 output keyed too', a)
}
{
  resetNet()
  volcRoutes({ createFail: 60102 })
  const voiceN = writeVoice(join(dirs.media, 'voice-n.wav'), talkPattern(2))
  await rejects(() => CL.renderPresenterClip({ engine: 'volc', character: CH.getCharacter(char.id), audioAbs: voiceN, outAbs: join(outDir, 'volc-n.webm'), mode: 'normal', confirmedRmb: 1 }), 'UNSUPPORTED_IMAGE', '火山引擎: no face found (60102) → UNSUPPORTED_IMAGE')
  ok(volcLog.deletes.some((u) => /role-.*-normal\.png$/.test(u)), 'the picture is removed from the bucket after a refused 形象')
  resetNet()
  route('POST', /^https:\/\/visual\.volcengineapi\.com\//, () => jsonRes({ ResponseMetadata: { RequestId: 'x', Action: 'CVSubmitTask', Version: '2022-08-31', Service: 'cv', Region: 'cn-north-1', Error: { CodeN: 100010, Code: 'SignatureDoesNotMatch', Message: 'signature mismatch' } } }, 401))
  route('PUT', /tos-s3/, () => new Response('', { status: 200 }))
  route('DELETE', /tos-s3/, () => new Response(null, { status: 204 }))
  await rejects(() => CL.renderPresenterClip({ engine: 'volc', character: CH.getCharacter(char.id), audioAbs: voiceN, outAbs: join(outDir, 'volc-n.webm'), mode: 'loopyb', confirmedRmb: 1 }), 'NO_KEY', '火山引擎: gateway signature error → NO_KEY')
}

/* ------------------------------------------------------------------------------------------------ Runway */
console.log('· Runway end to end')
{
  resetNet()
  let avatarPolls = 0
  route('POST', 'https://api.dev.runwayml.com/v1/avatars', () => jsonRes({ id: 'av-runway-1', name: 'x', status: 'PROCESSING' }))
  route('GET', 'https://api.dev.runwayml.com/v1/avatars/av-runway-1', () => jsonRes({ id: 'av-runway-1', status: ++avatarPolls < 2 ? 'PROCESSING' : 'READY' }))
  route('POST', 'https://api.dev.runwayml.com/v1/uploads', (c) => jsonRes({ uploadUrl: 'https://upload.runway.test/bucket', fields: { key: `uploads/${c.json.filename}`, policy: 'p' }, runwayUri: `runway://uploads/${c.json.filename}` }))
  route('POST', 'https://upload.runway.test/bucket', () => new Response(null, { status: 204 }))
  route('POST', 'https://api.dev.runwayml.com/v1/avatar_videos', () => jsonRes({ id: 'task-rw-1' }))
  let taskPolls = 0
  route('GET', 'https://api.dev.runwayml.com/v1/tasks/task-rw-1', () => jsonRes(++taskPolls < 2 ? { id: 'task-rw-1', status: 'RUNNING', progress: 0.5 } : { id: 'task-rw-1', status: 'SUCCEEDED', output: ['https://dnznrvs05pmza.runway.test/out.mp4'], cost: { credits: 2 } }))
  route('GET', /^https:\/\/dnznrvs05pmza\.runway\.test\//, () => fileRes(providerVideo(join(dirs.media, 'runway-720x960.mp4'), { sec: 5, w: 540, h: 720 })))
  const voiceR = writeVoice(join(dirs.media, 'voice-r.wav'), talkPattern(4))
  const res = await CL.renderPresenterClip({ engine: 'runway', character: CH.getCharacter(char.id), audioAbs: voiceR, outAbs: join(outDir, 'runway-a.webm'), confirmedRmb: 0.2, maxHeight: 360, dataUriMax: 1000 })
  const create = callsTo(/\/v1\/avatars$/, 'POST')[0]
  ok(create && create.headers.authorization === 'Bearer key_runway_test_0123456789' && create.headers['x-runway-version'] === '2024-11-06', 'Runway: Bearer key + API version header', create?.headers)
  ok(create.json.voice?.type === 'runway-live-preset' && create.json.personality && create.json.imageProcessing === 'none' && create.json.referenceImage === 'runway://uploads/presenter.png', 'Runway avatar: documented fields; a big picture goes through an upload', create.json)
  const video = callsTo(/avatar_videos/, 'POST')[0]
  ok(video.json.model === 'gwm1_avatars' && video.json.avatar.type === 'custom' && video.json.avatar.avatarId === 'av-runway-1' && video.json.speech.type === 'audio' && video.json.speech.audio === 'runway://uploads/piece-0.mp3', 'Runway video: gwm1_avatars + custom avatar + our voice', video.json)
  const uploadForm = callsTo(/upload\.runway\.test/, 'POST')[0]
  ok(uploadForm && uploadForm.body instanceof FormData && uploadForm.body.get('key') === 'uploads/presenter.png', 'upload: the provided form fields + the file', uploadForm && [...uploadForm.body.keys()])
  ok(res.ok && res.cost.rmb === 0.15 && CH.getCharacter(char.id).cloud.runway.avatarId === 'av-runway-1', 'Runway: clip made, provider credits → cost, avatar saved', res.cost)
  const before = callsTo(/\/v1\/avatars$/, 'POST').length
  avatarPolls = 5
  const voiceR2 = writeVoice(join(dirs.media, 'voice-r2.wav'), talkPattern(3))
  taskPolls = 5
  await CL.renderPresenterClip({ engine: 'runway', character: CH.getCharacter(char.id), audioAbs: voiceR2, outAbs: join(outDir, 'runway-b.webm'), confirmedRmb: 0.2, maxHeight: 360 })
  ok(callsTo(/\/v1\/avatars$/, 'POST').length === before, 'the Runway avatar is made once and reused')
}

/* ------------------------------------------------------------------------------------------------ key tests */
console.log('· connection tests')
{
  resetNet()
  route('GET', /api\.vidu\.cn\/ent\/v2\/tasks\/1\/creations/, () => jsonRes({ code: 404, reason: 'TaskNotFound' }, 404))
  route('GET', 'https://api.dev.runwayml.com/v1/avatars?limit=1', () => jsonRes({ code: 'unauthorized' }, 401))
  route('POST', /visual\.volcengineapi\.com/, () => jsonRes({ code: 50200, message: 'task not found', data: null }, 400))
  route('PUT', /tos-s3/, () => new Response('', { status: 200 }))
  route('DELETE', /tos-s3/, () => new Response(null, { status: 204 }))
  const v = await CL.testAnimeCloudConnection({ engine: 'vidu' })
  ok(v.ok && /不收费/.test(v.message), 'Vidu key test: a made-up task id answers «not found» → key accepted, free', v)
  const r = await CL.testAnimeCloudConnection({ engine: 'runway' })
  ok(!r.ok && r.code === 'NO_KEY', 'Runway key test: 401 → the key is wrong', r)
  const vo = await CL.testAnimeCloudConnection({ engine: 'volc' })
  ok(vo.ok && callsTo(/tos-s3/, 'PUT').length === 1 && callsTo(/tos-s3/, 'DELETE').length === 1, '火山引擎 key test: signature accepted + bucket write / delete', vo)
  ok(!net.calls.some((c) => /CVSubmitTask|s_avatar\/offline|avatar_videos/.test(c.url)), 'key tests never submit a paid task')
  resetNet()
  route('PUT', /tos-s3/, () => new Response('<Error><Code>NoSuchBucket</Code></Error>', { status: 404 }))
  route('POST', /visual\.volcengineapi\.com/, () => jsonRes({ code: 50200, message: 'x', data: null }, 400))
  const vb = await CL.testAnimeCloudConnection({ engine: 'volc' })
  ok(!vb.ok && /桶名称和地域/.test(vb.message), '火山引擎 key test: wrong bucket explained', vb)
}

/* ------------------------------------------------------------------------------------------------ routes */
console.log('· routes')
{
  resetNet()
  route('GET', /api\.vidu\.cn\/ent\/v2\/tasks\/1\/creations/, () => jsonRes({ reason: 'TaskNotFound' }, 404))
  const call = async (method, path, { query = null, body = null } = {}) => {
    const qs = query ? `?${new URLSearchParams(query)}` : ''
    const req = new Request(`http://localhost/api/video-workbench/${path}${qs}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const res = await RA.handleAnimeApiRequest(req, new URL(req.url), { createBackgroundJob: () => ({ id: 'job-1' }) })
    return { status: res.status, body: await res.json() }
  }
  const g = await call('GET', 'anime/cloud')
  ok(g.status === 200 && g.body.config.vidu.hasApiKey && !JSON.stringify(g.body).includes('vda_test_key_123456789') && !JSON.stringify(g.body).includes('c2VjcmV0'), 'GET anime/cloud: masked summary only', g.body.config.vidu)
  const s = await call('POST', 'anime/cloud', { body: { config: { vidu: { resolution: '720p' } } } })
  ok(s.status === 200 && s.body.config.vidu.resolution === '720p' && CL.loadAnimeCloudConfig().vidu.apiKey === 'vda_test_key_123456789', 'POST anime/cloud: saves, keeps the key', s.body.config.vidu)
  const bad = await call('POST', 'anime/cloud', { body: { config: { volc: { tosBucket: 'NO!' } } } })
  ok(bad.status === 400 && bad.body.code === 'BAD_REQUEST', 'POST anime/cloud: bad input → 400', bad.body)
  const t = await call('POST', 'anime/cloud/test', { body: { engine: 'vidu' } })
  ok(t.status === 200 && t.body.result.ok, 'POST anime/cloud/test', t.body)
  const e = await call('GET', 'anime/estimate', { query: { engine: 'volc', durationSec: '10', characterId: char.id } })
  ok(e.status === 200 && e.body.estimate.createRmb === 0 && e.body.estimate.rmb === 3, 'estimate with the character: its 形象 is not counted again', e.body.estimate)
  const e2 = await call('GET', 'anime/estimate', { query: { engine: 'volc', durationSec: '10', mode: 'loopyb' } })
  ok(e2.body.estimate.createRmb === 0.1 && e2.body.estimate.mode === 'loopyb', 'estimate without the character: includes the 形象 fee', e2.body.estimate)
  CL.saveAnimeCloudConfig({ vidu: { resolution: '540p' } })
}

/* ------------------------------------------------------------------------------------------------ one cut */
console.log('· planAnimePresenter with a cloud engine')
{
  resetNet()
  viduRoutes()
  const voiceP = writeVoice(join(dirs.media, 'voice-p.wav'), talkPattern(3.5))
  const fallback = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: char.id, engine: 'vidu' }, wavAbs: voiceP, totalSec: 3.5 })
  ok(fallback.type === 'anime' && fallback.fallback?.code === 'COST_NOT_CONFIRMED' && net.calls.length === 0, 'no confirmation → free tier, nothing sent', fallback.fallback)
  const plan = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: char.id, engine: 'vidu', confirmedRmb: 0.2, corner: 'br' }, wavAbs: voiceP, totalSec: 3.5 })
  ok(plan.type === 'anime-clip' && plan.engine === 'vidu' && plan.path.startsWith('assets/.mascot/') && existsSync(join(dirs.proj, plan.path)), 'confirmed → a transparent clip in the project', plan)
  ok(Math.abs(plan.durationSec - 3.5) < 0.05 && plan.corner === 'br' && plan.cost?.rmb > 0 && /Vidu/.test(plan.note), 'clip length, corner, cost and note', { d: plan.durationSec, cost: plan.cost, note: plan.note })
  const n = net.calls.length
  const again = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: char.id, engine: 'vidu' }, wavAbs: voiceP, totalSec: 3.5 })
  ok(again.type === 'anime-clip' && net.calls.length === n, 're-planning the same cut re-uses the clip without asking again')
}

CL.__setAnimeCloudTransportForTests(null)
console.log(`\nanime-cloud: ${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
