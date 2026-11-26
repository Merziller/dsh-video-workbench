/**
 * @dsh-video/tool-media — Optional local speech recognition (口播粗剪 · 真实字幕 · 素材理解)
 *
 * Engine (all free, offline after a one-time ~260 MB download; no audio ever leaves the computer):
 *   - sherpa-onnx Node addon (k2-fsa / Next-gen Kaldi, Apache-2.0) — prebuilt N-API binaries from the npm registry,
 *     verified against the registry's sha512 integrity and unpacked by this module (no npm / compiler needed);
 *   - SenseVoice-Small int8 (FunAudioLLM, FunASR Model License v1.1: commercial use allowed, keep the attribution) —
 *     Mandarin, Cantonese, English, Japanese, Korean; punctuation + inverse text normalisation; per-token timestamps;
 *   - silero VAD (MIT) to cut long recordings into speech segments.
 * Every download is pinned (version + SHA-256 / sha512) and lands in one folder (default `$DSH_ASR_HOME`, an existing
 * install, or the recommended folder — see recommendAsrHome), never in a system cache. The model is never bundled
 * with the plugin.
 *
 * Automatic install (nobody has to click 「一键安装」): one shared install state machine (single flight per process, a
 * lock file per engine folder across processes) is used by the studio's 「一键安装」 / 「重试」 route, the MCP
 * speech_engine tool, the automatic install and the features waiting for the engine:
 *   - maybeStartAsrAutoInstall(): the War Room asks for state → the install starts in the background (cn mirror first);
 *   - ensureAsrEngine() (transcribeMedia): a feature that needs the engine waits for that install;
 *   - `DSH_ASR_AUTO_INSTALL=0` turns the automatic install off (installing by hand still works); after a failure the
 *     automatic path waits 10 minutes before trying again (a click / an install call retries at once).
 * An engine pre-placed in the plugin package (`vendor/asr`, offline bundles) is used where it is, read-only.
 *
 * Transcription runs `asr-worker.cjs` in a child Node process (the native addon never loads into the studio
 * process; a crash or an abort only ends that child). Results are cached next to the project's media.
 */
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { arch as osArch, cpus, platform as osPlatform } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createAbortError, loadEnv, PACKAGE_ROOT, REPO_ROOT, resolveBinaries, runCommandRedirected } from '../shared/index.js'
import { upsertDotEnvKeys } from '../dsh-tool-avatar/lipsync-installer.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ASR_WORKER_PATH = join(__dirname, 'asr-worker.cjs')

export const ASR_RUNTIME = {
  name: 'sherpa-onnx-node',
  version: '2.0.3',
  integrity: 'sha512-aReA35w32vyoFvX6W1D7nfcN2E7ITOSvs7IU8hjSIN2GaiqIJnjpGhTECC+TwL37DqCTWHqWAMVCQdyBgIC2CA==',
  license: 'Apache-2.0',
  homepage: 'https://github.com/k2-fsa/sherpa-onnx',
}

/** Prebuilt native addon packages of sherpa-onnx-node 2.0.3 (registry metadata: os / cpu / sha512). */
export const ASR_PLATFORM_PACKAGES = {
  'win32-x64': { name: 'sherpa-onnx-win-x64', integrity: 'sha512-UDPUCNmuhWWC0oNMphHjgdRE0M8bVbUFXk9AyyJUuOtubmxhQBLz2sd2v6RWIAXSDh/7GwPbImLqAWI51ITTNQ==', unpackedBytes: 23449661 },
  'win32-arm64': { name: 'sherpa-onnx-win-arm64', integrity: 'sha512-oRBCmaF705o+LD9gMexG2yUcQRT619xD+HGKpuTTYyxM3BB/4GtNkt5rXrKT9Z9ZzFt8guKeAw29Xob3K6LMlg==', unpackedBytes: 23372865 },
  'win32-ia32': { name: 'sherpa-onnx-win-ia32', integrity: 'sha512-Y2t59PcLLCkMm0EYAFN+Qy8/PEaM04hTmIRTwnL5xo5c9G/EsAvwFw7LODALomBFNNoOE/MOLI3RIaTpO7MZTg==', unpackedBytes: 19970111 },
  'linux-x64': { name: 'sherpa-onnx-linux-x64', integrity: 'sha512-cORrflhfgu/vD22UAfU4DvwCjKC6cSmVGM2o2fXnM6O9meN8Mpu5enqb/afIi+Nwweo9eS6YmaQcvmT+L6ia2A==', unpackedBytes: 33840972 },
  'linux-arm64': { name: 'sherpa-onnx-linux-arm64', integrity: 'sha512-F4cciAFw4rrV39CR6o1yNLG1e/Gcd4Je2wGxi4Q+jl1NJh7VSvE3n4NCz4bQzBlvZWgU8ThhV9ggD6xC5iJWFQ==', unpackedBytes: 40791815 },
  'darwin-x64': { name: 'sherpa-onnx-darwin-x64', integrity: 'sha512-ZFSsikOf0xrnvEl8Xj5Z8IpG0hqWGFDy3HwLFagwV1apftVgh/SVXbwQ+pIf0xFRBrAr+SaR3asvoCEc6DxOSg==', unpackedBytes: 38419413 },
  'darwin-arm64': { name: 'sherpa-onnx-darwin-arm64', integrity: 'sha512-PuPsSgMvzKYYBG+/CwEZbbtl4kmztravlpN8KmsQy2jWGJ3WjEJ1NkPzUNgEbrq/9s5xnyd20FFlWJXOIcAHoA==', unpackedBytes: 34909193 },
}

const SENSEVOICE_REPO = 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'

/** Model files: every accepted copy is pinned by size + SHA-256 (two silero builds are published; both work). */
export const ASR_MODEL_FILES = [
  {
    id: 'sensevoice-model',
    rel: 'models/sense-voice/model.int8.onnx',
    label: 'SenseVoice-Small 识别模型（int8）',
    approxMb: 228,
    accept: [{ size: 239233841, sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51' }],
    sources: { hf: { repo: SENSEVOICE_REPO, file: 'model.int8.onnx' } },
  },
  {
    id: 'sensevoice-tokens',
    rel: 'models/sense-voice/tokens.txt',
    label: 'SenseVoice 词表',
    approxMb: 0.3,
    accept: [{ size: 315894, sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc' }],
    sources: { hf: { repo: SENSEVOICE_REPO, file: 'tokens.txt' } },
  },
  {
    id: 'silero-vad',
    rel: 'models/silero_vad.onnx',
    label: 'silero 语音活动检测（VAD）',
    approxMb: 1.7,
    accept: [
      { size: 643854, sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6' },
      { size: 1807522, sha256: 'a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28' },
    ],
    sources: {
      github: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
      hf: { repo: 'csukuangfj/vad', file: 'silero_vad.onnx' },
    },
  },
]

export const ASR_ATTRIBUTION = [
  '语音识别模型：SenseVoice-Small（阿里巴巴通义实验室 FunAudioLLM 团队 · https://github.com/FunAudioLLM/SenseVoice），按《FunASR 模型开源协议 v1.1》使用（允许商用，需保留出处）；ONNX 版本由 k2-fsa 社区（csukuangfj）转换发布。',
  '识别引擎：sherpa-onnx（k2-fsa / 新一代 Kaldi · Apache-2.0 · https://github.com/k2-fsa/sherpa-onnx）。',
  '人声检测：silero-vad（Silero Team · MIT · https://github.com/snakers4/silero-vad）。',
]

export const ASR_INSTALLER_PACKAGE = {
  id: 'sensevoice',
  name: '本地语音识别（SenseVoice-Small · 免费离线）',
  shortName: '本地语音识别',
  diskRequired: '约 260 MB（识别模型 228 MB + 运行库约 25 MB）',
  etaLabel: '约 1~5 分钟（视网速）',
  languages: '普通话 · 粤语 · 英语 · 日语 · 韩语',
  uses: ['口播粗剪（去停顿、口头禅、重复和重录）', '真实字幕（按真实说的话和时间点出字幕）', '看懂素材里的说话内容'],
  license: ASR_ATTRIBUTION,
}

const MANIFEST_NAME = 'asr-engine.json'
const MIN_FREE_BYTES = 420 * 1024 * 1024

export function asrPlatformKey(platform = osPlatform(), arch = osArch()) {
  return `${platform}-${arch}`
}

/* ------------------------------------------------------------------------------------------------ folders */

// the folder probe may look at every drive: cached briefly (reset when an install ends)
const FOLDER_PROBE_TTL_MS = 30_000
let pathOverrides = null // tests only (setAsrInstallerForTests)
let freshHomeCache = { at: 0, home: '' }
let discoveryCache = { at: 0, list: null }

/** An engine pre-placed in the plugin package (offline bundles): used where it is, never installed into. */
const vendorAsrHome = () => resolve(pathOverrides?.vendor || join(PACKAGE_ROOT, 'vendor', 'asr'))
const defaultAsrHome = () => resolve(pathOverrides?.defaultHome || join(REPO_ROOT, 'ai-engines', 'asr'))
const isAsciiPath = (p) => !/[^\x20-\x7e]/.test(String(p))
const samePath = (a, b) => {
  const x = resolve(String(a))
  const y = resolve(String(b))
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * Where a fresh install goes when nothing is configured or installed yet: next to the other local AI engines
 * (`AVATAR_LIPSYNC_HOME` → `<parent>/asr`); else, on Windows when the default folder sits on the system drive (or has
 * non-ASCII characters), the first other local drive with room (`<X>:/dsh-ai/asr`); else the default. Always ASCII.
 */
function recommendFreshHome() {
  if (pathOverrides?.recommended) return resolve(pathOverrides.recommended)
  const now = Date.now()
  if (freshHomeCache.home && now - freshHomeCache.at < FOLDER_PROBE_TTL_MS) return freshHomeCache.home
  const def = defaultAsrHome()
  let pick = ''
  const lip = String(process.env.AVATAR_LIPSYNC_HOME || '').trim()
  if (lip && isAsciiPath(lip)) pick = resolve(dirname(resolve(lip)), 'asr')
  else if (process.platform === 'win32') {
    const sysDrive = String(process.env.SystemDrive || 'C:').toUpperCase()
    if (def.slice(0, 2).toUpperCase() === sysDrive || !isAsciiPath(def)) {
      for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
        const root = `${letter}:\\`
        if (`${letter}:` === sysDrive || !existsSync(root)) continue
        if (freeBytesOf(root) >= 2 * 1024 ** 3) {
          pick = `${letter}:\\dsh-ai\\asr`
          break
        }
      }
    }
  }
  if (!pick) pick = isAsciiPath(def) ? def : resolve(dirname(REPO_ROOT), 'dsh-ai-asr')
  freshHomeCache = { at: now, home: pick }
  return pick
}

/** `<X>:\dsh-ai\asr` of the other local drives (Windows, when the default folder sits on the system drive). */
function otherDriveHomes() {
  if (process.platform !== 'win32' || pathOverrides) return []
  const def = defaultAsrHome()
  const sysDrive = String(process.env.SystemDrive || 'C:').toUpperCase()
  if (def.slice(0, 2).toUpperCase() !== sysDrive && isAsciiPath(def)) return []
  const out = []
  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    if (`${letter}:` !== sysDrive && existsSync(`${letter}:\\`)) out.push(`${letter}:\\dsh-ai\\asr`)
  }
  return out
}

/**
 * Folders that hold a complete install (their `asr-engine.json`), in this order: the engine pre-placed in the plugin
 * (`vendor/asr`, read-only), `<workspace>/ai-engines/asr`, the recommended folder (e.g. `X:\dsh-ai\asr` — found again
 * after `.env` was lost), the same folder on the other drives. Cached briefly.
 */
function installedHomes() {
  const now = Date.now()
  if (discoveryCache.list && now - discoveryCache.at < FOLDER_PROBE_TTL_MS) return discoveryCache.list
  const vendor = vendorAsrHome()
  const seen = new Set()
  const list = []
  for (const dir of [vendor, defaultAsrHome(), recommendFreshHome(), ...otherDriveHomes()]) {
    const key = process.platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(key)) continue
    seen.add(key)
    if (existsSync(join(dir, MANIFEST_NAME))) list.push({ dir, vendor: samePath(dir, vendor) })
  }
  discoveryCache = { at: now, list }
  return list
}

function resetAsrCaches() {
  statusCache = { key: '', at: 0, value: null }
  freshHomeCache = { at: 0, home: '' }
  discoveryCache = { at: 0, list: null }
}

/**
 * Engine folder: explicit dir > `DSH_ASR_HOME` > the first folder that already holds a complete install (`vendor/asr`
 * in the plugin → `<workspace>/ai-engines/asr` → the recommended folder) > `<workspace>/ai-engines/asr`.
 */
export function resolveAsrHome(explicit = '') {
  loadEnv()
  const pick = String(explicit || '').trim() || String(process.env.DSH_ASR_HOME || '').trim()
  if (pick) return resolve(pick)
  return installedHomes()[0]?.dir || defaultAsrHome()
}

export function resolveAsrConfig({ home = '' } = {}) {
  const root = resolveAsrHome(home)
  const runtimeDir = join(root, 'runtime')
  const pkgKey = asrPlatformKey()
  const plat = ASR_PLATFORM_PACKAGES[pkgKey] || null
  const runtimePkgDir = join(runtimeDir, 'node_modules', ASR_RUNTIME.name)
  const platformPkgDir = plat ? join(runtimeDir, 'node_modules', plat.name) : ''
  const files = Object.fromEntries(ASR_MODEL_FILES.map((f) => [f.id, join(root, ...f.rel.split('/'))]))
  return {
    home: root,
    runtimeDir,
    runtimePkgDir,
    platformKey: pkgKey,
    platformPackage: plat ? plat.name : '',
    platformPkgDir,
    modelsDir: join(root, 'models'),
    senseVoiceDir: join(root, 'models', 'sense-voice'),
    vadPath: files['silero-vad'],
    files,
    manifestPath: join(root, MANIFEST_NAME),
  }
}

function readManifest(cfg) {
  try {
    return JSON.parse(readFileSync(cfg.manifestPath, 'utf8'))
  } catch {
    return null
  }
}

function fileSizeOrZero(p) {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}

let statusCache = { key: '', at: 0, value: null }

/**
 * Engine status (cheap file checks by default; `deep` loads the addon + models in a child process, ~1–2 s).
 * Never throws: `{ ready, reason, missing[], … }`.
 */
export async function getAsrStatus({ deep = false, force = false, home = '' } = {}) {
  const cfg = resolveAsrConfig({ home })
  const key = `${cfg.home}|${deep ? 1 : 0}`
  if (!force && statusCache.key === key && Date.now() - statusCache.at < (deep ? 600_000 : 4000) && statusCache.value) return statusCache.value
  const missing = []
  if (!cfg.platformPackage) missing.push(`当前系统 ${cfg.platformKey} 没有可用的预编译识别引擎`)
  if (!existsSync(join(cfg.runtimePkgDir, 'package.json'))) missing.push('识别引擎运行库')
  if (cfg.platformPackage && !existsSync(cfg.platformPkgDir)) missing.push(`本机原生库（${cfg.platformPackage}）`)
  for (const f of ASR_MODEL_FILES) {
    const size = fileSizeOrZero(cfg.files[f.id])
    if (!f.accept.some((a) => a.size === size)) missing.push(f.label)
  }
  const manifest = readManifest(cfg)
  const base = {
    ready: missing.length === 0,
    home: cfg.home,
    platform: cfg.platformKey,
    supportedPlatform: Boolean(cfg.platformPackage),
    runtimeVersion: manifest?.runtime?.version || '',
    installedAt: manifest?.installedAt || '',
    missing,
    reason: missing.length ? `还没有安装：${missing.join('、')}` : '',
    attribution: ASR_ATTRIBUTION,
    package: ASR_INSTALLER_PACKAGE,
  }
  let value = base
  if (deep && base.ready) {
    const probe = await runAsrWorker({ mode: 'selftest' }, { home: cfg.home, timeoutMs: 90_000 }).catch((err) => ({ ok: false, error: err?.message || String(err) }))
    value = probe?.ok
      ? { ...base, deepChecked: true, loadMs: probe.loadMs, providers: probe.providers || ['cpu'] }
      : { ...base, ready: false, deepChecked: true, reason: `识别引擎自检失败：${probe?.error || '未知原因'}` }
  }
  statusCache = { key, at: Date.now(), value }
  return value
}

/**
 * Folder for an install / a repair: the configured one (`DSH_ASR_HOME`); else an existing complete install (never the
 * read-only `vendor/asr`); else the fresh-install folder (next to the other local AI engines, or `<X>:/dsh-ai/asr` on
 * another drive when the workspace sits on the Windows system drive, or the default). Always ASCII unless configured.
 */
export function recommendAsrHome() {
  loadEnv()
  const env = String(process.env.DSH_ASR_HOME || '').trim()
  if (env) return resolve(env)
  return installedHomes().find((h) => !h.vendor)?.dir || recommendFreshHome()
}

export function getAsrInstallerCatalog() {
  const cfg = resolveAsrConfig()
  const recommendedHome = recommendAsrHome()
  const freeBytes = freeBytesOf(recommendedHome)
  return {
    defaultHome: cfg.home,
    recommendedHome,
    installed: existsSync(cfg.manifestPath),
    platform: cfg.platformKey,
    supportedPlatform: Boolean(cfg.platformPackage),
    autoInstall: isAsrAutoInstallEnabled(),
    freeBytes: Number.isFinite(freeBytes) ? freeBytes : null,
    needBytes: MIN_FREE_BYTES,
    package: ASR_INSTALLER_PACKAGE,
  }
}

function freeBytesOf(dir) {
  try {
    let probe = resolve(dir)
    while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
    const s = statfsSync(probe)
    return Number(s.bavail) * Number(s.bsize)
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/* ------------------------------------------------------------------------------------------------ downloads */

async function fetchWithTimeout(url, { signal, timeoutMs = 3_600_000, headers = {} } = {}) {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()
  signal?.addEventListener?.('abort', onAbort, { once: true })
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'dsh-video-workbench-asr-installer', ...headers }, redirect: 'follow', signal: ctrl.signal })
    return { resp, done: () => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort) } }
  } catch (err) {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', onAbort)
    throw err
  }
}

async function sha256OfFile(p) {
  const hash = createHash('sha256')
  await pipeline(createReadStream(p), hash)
  return hash.digest('hex')
}

/** Resumable streaming download (`.part` + HTTP Range), then size + SHA-256 check against the pinned copies. */
async function downloadVerified({ url, destPath, accept, onBytes, signal }) {
  mkdirSync(dirname(destPath), { recursive: true })
  const partPath = `${destPath}.part`
  const startAt = existsSync(partPath) ? statSync(partPath).size : 0
  const headers = {}
  const hfToken = String(process.env.HF_TOKEN || '').trim()
  if (hfToken && /huggingface\.co|hf-mirror\.com/.test(url)) headers.Authorization = `Bearer ${hfToken}`
  if (startAt > 0) headers.Range = `bytes=${startAt}-`
  const { resp, done } = await fetchWithTimeout(url, { signal, headers })
  try {
    if (resp.status === 416 && startAt > 0) {
      // the .part already holds the whole file
    } else {
      if (!(resp.status === 200 || resp.status === 206)) throw new Error(`HTTP ${resp.status} ${resp.statusText} · ${url}`)
      const append = resp.status === 206 && startAt > 0
      const totalHeader = Number(resp.headers.get('content-length') || 0)
      const expectedTotal = append ? startAt + totalHeader : totalHeader
      let received = append ? startAt : 0
      const out = createWriteStream(partPath, { flags: append ? 'a' : 'w' })
      const body = Readable.fromWeb(resp.body)
      body.on('data', (chunk) => {
        received += chunk.length
        onBytes?.(received, expectedTotal)
      })
      await pipeline(body, out)
      if (expectedTotal > 0 && statSync(partPath).size !== expectedTotal) {
        throw new Error(`下载不完整（${statSync(partPath).size}/${expectedTotal} 字节）：${url}`)
      }
    }
  } finally {
    done()
  }
  const size = statSync(partPath).size
  const sha = await sha256OfFile(partPath)
  if (!accept.some((a) => a.size === size && a.sha256 === sha)) {
    rmSync(partPath, { force: true })
    throw Object.assign(new Error(`文件校验失败（大小 ${size} · SHA-256 ${sha.slice(0, 12)}…）：${url}`), { code: 'EINTEGRITY' })
  }
  if (existsSync(destPath)) rmSync(destPath, { force: true })
  renameSync(partPath, destPath)
  return { url, bytes: size, sha256: sha }
}

function modelUrls(f, { useCn }) {
  const hfHosts = useCn ? ['https://hf-mirror.com', 'https://huggingface.co'] : ['https://huggingface.co', 'https://hf-mirror.com']
  const envHf = String(process.env.HF_ENDPOINT || '').trim().replace(/\/+$/, '')
  if (envHf && !hfHosts.includes(envHf)) hfHosts.unshift(envHf)
  const urls = []
  if (f.sources.github && !useCn) urls.push(f.sources.github)
  if (f.sources.hf) {
    for (const host of hfHosts) urls.push(`${host}/${f.sources.hf.repo}/resolve/main/${f.sources.hf.file}`)
  }
  if (f.sources.github && useCn) urls.push(f.sources.github)
  return urls
}

/* ------------------------------------------------------------------------------------------------ npm tarballs */

function tarString(buf, start, len) {
  const slice = buf.subarray(start, start + len)
  const nul = slice.indexOf(0)
  return slice.subarray(0, nul >= 0 ? nul : slice.length).toString('utf8')
}

function tarOctal(buf, start, len) {
  const s = tarString(buf, start, len).trim()
  return s ? parseInt(s, 8) : 0
}

function parsePax(buf) {
  const out = {}
  let off = 0
  while (off < buf.length) {
    const sp = buf.indexOf(0x20, off)
    if (sp < 0) break
    const len = parseInt(buf.subarray(off, sp).toString('utf8'), 10)
    if (!Number.isFinite(len) || len <= 0) break
    const rec = buf.subarray(sp + 1, off + len - 1).toString('utf8')
    const eq = rec.indexOf('=')
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1)
    off += len
  }
  return out
}

/** Safe relative path inside `root` for a tar entry name (strips `package/`; rejects absolute / `..` / drive paths). */
function safeTarTarget(root, name, stripPrefix) {
  let n = String(name || '').replace(/\\/g, '/')
  if (stripPrefix && n.startsWith(stripPrefix)) n = n.slice(stripPrefix.length)
  else if (stripPrefix) n = n.replace(/^[^/]+\//, '')
  if (!n || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) return null
  const parts = n.split('/').filter((p) => p && p !== '.')
  if (parts.some((p) => p === '..')) return null
  if (parts.length === 0) return null
  const target = resolve(root, ...parts)
  const rootAbs = resolve(root)
  if (target !== rootAbs && !target.startsWith(rootAbs + sep)) return null
  return target
}

/** Unpack an npm `.tgz` (ustar + pax / GNU long names) into `destDir`, stripping the leading `package/` folder. */
export function extractNpmTarball(tgzBuffer, destDir) {
  const tar = gunzipSync(tgzBuffer)
  mkdirSync(destDir, { recursive: true })
  let off = 0
  let paxPath = null
  let longName = null
  let files = 0
  while (off + 512 <= tar.length) {
    const hdr = tar.subarray(off, off + 512)
    if (hdr.every((b) => b === 0)) break
    const name = tarString(hdr, 0, 100)
    const mode = tarOctal(hdr, 100, 8)
    const size = tarOctal(hdr, 124, 12)
    const type = String.fromCharCode(hdr[156] || 48)
    const isUstar = tarString(hdr, 257, 6).startsWith('ustar')
    const prefix = isUstar ? tarString(hdr, 345, 155) : ''
    const dataStart = off + 512
    const data = tar.subarray(dataStart, dataStart + size)
    if (type === 'x') {
      paxPath = parsePax(data).path || null
    } else if (type === 'L') {
      longName = tarString(data, 0, data.length)
    } else if (type === 'g') {
      // global pax header: nothing we need
    } else {
      const full = longName || paxPath || (prefix ? `${prefix}/${name}` : name)
      longName = null
      paxPath = null
      const target = safeTarTarget(destDir, full, 'package/')
      if (target) {
        if (type === '5') {
          mkdirSync(target, { recursive: true })
        } else if (type === '0' || type === '\0' || type === '7') {
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, data, process.platform === 'win32' ? undefined : { mode: (mode & 0o777) | 0o644 })
          files++
        }
        // symlinks / hard links / devices are never created
      }
    }
    off = dataStart + Math.ceil(size / 512) * 512
  }
  return { files }
}

function verifyIntegrity(buf, integrity) {
  const m = /^sha512-(.+)$/.exec(String(integrity || ''))
  if (!m) return false
  return createHash('sha512').update(buf).digest('base64') === m[1]
}

async function fetchNpmTarball(name, version, integrity, { useCn, signal, onBytes }) {
  const registries = useCn ? ['https://registry.npmmirror.com', 'https://registry.npmjs.org'] : ['https://registry.npmjs.org', 'https://registry.npmmirror.com']
  const errors = []
  for (const reg of registries) {
    const url = `${reg}/${name}/-/${name}-${version}.tgz`
    try {
      const { resp, done } = await fetchWithTimeout(url, { signal, timeoutMs: 900_000 })
      try {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const total = Number(resp.headers.get('content-length') || 0)
        const chunks = []
        let got = 0
        for await (const chunk of Readable.fromWeb(resp.body)) {
          chunks.push(chunk)
          got += chunk.length
          onBytes?.(got, total)
        }
        const buf = Buffer.concat(chunks)
        if (!verifyIntegrity(buf, integrity)) throw new Error('sha512 校验不一致')
        return { buf, url }
      } finally {
        done()
      }
    } catch (err) {
      if (signal?.aborted) throw createAbortError('安装已手动停止')
      errors.push(`${reg.replace('https://', '')}: ${err?.message || err}`)
    }
  }
  throw new Error(`下载 ${name}@${version} 失败（${errors.join('；')}）`)
}

/* ------------------------------------------------------------------------------------------------ installer */

/**
 * The installer itself (idempotent: verified files are kept, so a re-run only repairs what is missing). Features and
 * routes go through the shared install (startAsrInstall / ensureAsrEngine) instead of calling it directly.
 * `installDir` '' = recommendAsrHome(). `mirror`: 'cn' (npmmirror + hf-mirror first) | 'global'.
 */
export async function installAsrEngine(options = {}) {
  loadEnv()
  const { installDir = '', mirror = 'cn', writeEnv = true, signal, onProgress } = options
  const useCn = String(mirror || 'cn').toLowerCase() !== 'global'
  const cfg = resolveAsrConfig({ home: String(installDir || '').trim() || recommendAsrHome() })
  const logs = []
  const emit = (progress, message) => {
    logs.push(message)
    if (logs.length > 200) logs.shift()
    onProgress?.({ stage: 'asr-install', progress, message, logs: logs.slice(-24) })
  }
  if (!cfg.platformPackage) {
    throw new Error(`当前系统（${cfg.platformKey}）没有可用的预编译语音识别引擎，支持 Windows / macOS / Linux 的 x64 与 arm64。`)
  }
  if (/[^\x20-\x7e]/.test(cfg.home)) {
    throw new Error(`安装目录里不能有中文或特殊字符（识别模型在这类路径下可能加载失败）：${cfg.home}。请换一个纯英文路径，例如 D:/dsh-ai/asr`)
  }
  if (samePath(cfg.home, vendorAsrHome())) {
    throw new Error(`${cfg.home} 是插件自带的语音识别引擎目录（只读，不能往里安装）。请换一个安装位置，例如 D:/dsh-ai/asr`)
  }
  mkdirSync(cfg.home, { recursive: true })
  const free = freeBytesOf(cfg.home)
  emit(2, `安装目录 ${cfg.home} · 可用空间 ${Number.isFinite(free) ? (free / 1024 ** 3).toFixed(1) + ' GB' : '未知'} · 需要约 0.4 GB`)
  if (Number.isFinite(free) && free < MIN_FREE_BYTES) {
    throw new Error(`磁盘空间不足：${cfg.home} 所在分区只剩 ${(free / 1024 ** 2).toFixed(0)} MB，安装本地语音识别至少需要 420 MB。请换一个空间更大的盘。`)
  }

  // 1. runtime (two npm tarballs, sha512-verified, unpacked without npm)
  const runtimeTargets = [
    { name: ASR_RUNTIME.name, version: ASR_RUNTIME.version, integrity: ASR_RUNTIME.integrity, dir: cfg.runtimePkgDir },
    { name: cfg.platformPackage, version: ASR_RUNTIME.version, integrity: ASR_PLATFORM_PACKAGES[cfg.platformKey].integrity, dir: cfg.platformPkgDir },
  ]
  mkdirSync(cfg.runtimeDir, { recursive: true })
  writeFileSync(join(cfg.runtimeDir, 'package.json'), JSON.stringify({ name: 'dsh-asr-runtime', private: true, version: ASR_RUNTIME.version }, null, 2) + '\n', 'utf8')
  const manifestPrev = readManifest(cfg)
  for (const [i, t] of runtimeTargets.entries()) {
    const already = existsSync(join(t.dir, 'package.json')) && manifestPrev?.runtime?.integrity?.[t.name] === t.integrity
    if (already) {
      emit(4 + i * 4, `已安装 ${t.name}@${t.version}，跳过`)
      continue
    }
    if (signal?.aborted) throw createAbortError('安装已手动停止')
    emit(4 + i * 4, `正在下载识别引擎 ${t.name}@${t.version}（npm 官方包，校验 sha512）...`)
    let lastEmit = 0
    const { buf, url } = await fetchNpmTarball(t.name, t.version, t.integrity, {
      useCn,
      signal,
      onBytes: (got, total) => {
        if (Date.now() - lastEmit < 1500) return
        lastEmit = Date.now()
        emit(4 + i * 4, `下载 ${t.name}: ${(got / 1048576).toFixed(1)}${total ? ` / ${(total / 1048576).toFixed(1)}` : ''} MB`)
      },
    })
    rmSync(t.dir, { recursive: true, force: true })
    const { files } = extractNpmTarball(buf, t.dir)
    emit(6 + i * 4, `✓ ${t.name} 已解压（${files} 个文件，来源 ${new URL(url).host}）`)
  }

  // 2. models (pinned SHA-256, resumable)
  const totalMb = ASR_MODEL_FILES.reduce((a, f) => a + f.approxMb, 0)
  let doneMb = 0
  const downloaded = []
  for (const f of ASR_MODEL_FILES) {
    const dest = cfg.files[f.id]
    const size = fileSizeOrZero(dest)
    if (size && f.accept.some((a) => a.size === size)) {
      const sha = manifestPrev?.models?.[f.id]?.sha256 === f.accept.find((a) => a.size === size).sha256 ? manifestPrev.models[f.id].sha256 : await sha256OfFile(dest)
      if (f.accept.some((a) => a.sha256 === sha)) {
        doneMb += f.approxMb
        downloaded.push({ id: f.id, path: dest, bytes: size, sha256: sha, skipped: true })
        emit(14 + Math.round((doneMb / totalMb) * 76), `已有 ${f.label}，校验通过，跳过`)
        continue
      }
      rmSync(dest, { force: true })
    }
    const urls = modelUrls(f, { useCn })
    let res = null
    let lastErr = null
    for (const url of urls) {
      for (let attempt = 1; attempt <= 5 && !res; attempt++) {
        if (signal?.aborted) throw createAbortError('安装已手动停止')
        try {
          emit(14 + Math.round((doneMb / totalMb) * 76), `正在下载 ${f.label}（${new URL(url).host}）...`)
          let lastEmit = 0
          res = await downloadVerified({
            url,
            destPath: dest,
            accept: f.accept,
            signal,
            onBytes: (got, total) => {
              if (Date.now() - lastEmit < 2000) return
              lastEmit = Date.now()
              const gotMb = got / 1048576
              emit(Math.min(90, 14 + Math.round(((doneMb + Math.min(gotMb, f.approxMb)) / totalMb) * 76)), `下载 ${f.label}: ${gotMb.toFixed(0)}${total ? ` / ${(total / 1048576).toFixed(0)}` : ''} MB`)
            },
          })
        } catch (err) {
          lastErr = err
          if (signal?.aborted || err?.name === 'AbortError') throw createAbortError('安装已手动停止')
          if (err?.code === 'EINTEGRITY' || /HTTP 4(0[134]|10)/.test(String(err?.message))) break // try the next source
          if (attempt < 5) {
            const waitSec = Math.min(20, 2 ** attempt)
            emit(14 + Math.round((doneMb / totalMb) * 76), `⚠ 下载中断（${err?.message || err}），${waitSec} 秒后断点续传...`)
            await new Promise((r) => setTimeout(r, waitSec * 1000))
          }
        }
      }
      if (res) break
    }
    if (!res) throw new Error(`下载 ${f.label} 失败：${lastErr?.message || lastErr || '所有下载源都不可用'}`)
    doneMb += f.approxMb
    downloaded.push({ id: f.id, path: dest, bytes: res.bytes, sha256: res.sha256, url: res.url })
  }

  // 3. license notes + manifest + .env
  mkdirSync(join(cfg.home, 'LICENSES'), { recursive: true })
  writeFileSync(join(cfg.home, 'LICENSES', 'NOTICE.txt'), `${ASR_ATTRIBUTION.join('\n')}\n`, 'utf8')
  const manifest = {
    engine: 'sherpa-onnx-sensevoice',
    home: cfg.home,
    platform: cfg.platformKey,
    runtime: {
      name: ASR_RUNTIME.name,
      version: ASR_RUNTIME.version,
      platformPackage: cfg.platformPackage,
      integrity: { [ASR_RUNTIME.name]: ASR_RUNTIME.integrity, [cfg.platformPackage]: ASR_PLATFORM_PACKAGES[cfg.platformKey].integrity },
    },
    models: Object.fromEntries(downloaded.map((d) => [d.id, { path: relative(cfg.home, d.path).replace(/\\/g, '/'), bytes: d.bytes, sha256: d.sha256 }])),
    attribution: ASR_ATTRIBUTION,
    installedAt: new Date().toISOString(),
  }
  writeFileSync(cfg.manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  let envWrite = { envPath: '', written: [] }
  if (writeEnv && !samePath(cfg.home, defaultAsrHome())) {
    envWrite = upsertDotEnvKeys({ DSH_ASR_HOME: cfg.home })
    emit(93, `已记住安装位置（${envWrite.written.join(', ') || '无变化'}）`)
  } else if (writeEnv) {
    process.env.DSH_ASR_HOME = cfg.home
  }

  // 4. self-test (loads the addon + both models in a child process)
  emit(95, '正在自检：加载识别模型并识别一段静音...')
  const status = await getAsrStatus({ deep: true, force: true, home: cfg.home })
  emit(100, status.ready ? `✅ 本地语音识别安装完成并通过自检（模型加载 ${status.loadMs || '?'} ms）` : `⚠ 已安装，但自检没通过：${status.reason}`)
  return { ok: Boolean(status.ready), home: cfg.home, manifest, downloaded, env: envWrite, status, logs }
}

/* ------------------------------------------------------------------------------------------------ shared install */

/** After an install ended (failed, or done while the engine still is not usable) the automatic path waits this long
 *  before starting another one (a click / an install call retries at once). */
export const ASR_AUTO_RETRY_MS = 10 * 60 * 1000
const LOCK_NAME = '.install.lock'
const LOCK_PROGRESS_NAME = '.install.progress.json'
// a lock whose owner shows no sign of life for this long is taken over (the owner refreshes it at least every 30 s)
const LOCK_IDLE_MS = 5 * 60 * 1000

/** `DSH_ASR_AUTO_INSTALL=0` (or false / off / no) turns the automatic install off; installing by hand still works. */
export function isAsrAutoInstallEnabled() {
  loadEnv()
  return !['0', 'false', 'off', 'no'].includes(String(process.env.DSH_ASR_AUTO_INSTALL ?? '').trim().toLowerCase())
}

const idleInstall = () => ({ state: 'idle', progress: 0, message: '', error: '', home: '', mirror: '', trigger: '', startedAt: '', finishedAt: '', logs: [] })
let install = idleInstall()
let installRun = null // the install in flight: { gen, promise, listeners }
let installGen = 0
let lastEndAt = 0 // when the last install of this process ended (done or failed)
let autoRetryMs = ASR_AUTO_RETRY_MS
let lockPollMs = 2000
let installerImpl = null // tests only
let autoTimer = null

// no retry loop: after an install ended — failed, or done while the engine still is not usable — the automatic path
// waits before starting another one (explicit installs never wait)
const inAutoBackoff = () => (install.state === 'failed' || install.state === 'done') && Date.now() - lastEndAt < autoRetryMs

/**
 * The shared install, for status routes and panels: `{ state: 'idle' | 'running' | 'done' | 'failed' | 'disabled',
 * progress (0–100), message, error, home, mirror, trigger ('auto' | 'manual'), startedAt, finishedAt, logs[], auto (the
 * automatic install is allowed), supportedPlatform, platform, disabledReason?, autoRetryAt? }`. 'disabled' = nothing
 * ran in this process and the automatic install is switched off (DSH_ASR_AUTO_INSTALL=0) or impossible on this system.
 * Whether the engine is ready is getAsrStatus()'s answer, not this.
 */
export function getAsrInstallState() {
  const platform = asrPlatformKey()
  const supportedPlatform = Boolean(ASR_PLATFORM_PACKAGES[platform])
  const auto = isAsrAutoInstallEnabled()
  const s = { ...install, logs: install.logs.slice(-12), auto, supportedPlatform, platform }
  if (s.state === 'idle' && (!supportedPlatform || !auto)) {
    s.state = 'disabled'
    s.disabledReason = supportedPlatform ? 'switched-off' : 'unsupported-platform'
    s.message = supportedPlatform ? '自动安装已关闭（DSH_ASR_AUTO_INSTALL=0），需要时可以手动安装' : `当前系统（${platform}）用不了本地语音识别`
  }
  if (s.state === 'failed' && auto && lastEndAt + autoRetryMs > Date.now()) s.autoRetryAt = new Date(lastEndAt + autoRetryMs).toISOString()
  return s
}

/**
 * Start the install, or join the one already running — the single flight shared by 「一键安装」 / 「重试」, the MCP
 * speech_engine tool, the automatic install and the features waiting for the engine. `installDir` '' = the folder of
 * the running install, else recommendAsrHome(). A running install into another folder → error code 'BUSY' (409).
 * `onProgress({ stage, progress, message })` follows the shared install until it ends. Returns `{ promise, joined,
 * state }`: the promise resolves with the installer's result (`ok: false` = installed but the self-test failed) and
 * rejects (code ASR_INSTALL_FAILED, plain-Chinese message) when the install failed. Explicit calls never wait for the
 * automatic retry pause.
 */
export function startAsrInstall({ installDir = '', mirror = 'cn', writeEnv = true, trigger = 'manual', onProgress } = {}) {
  const wanted = String(installDir || '').trim()
  if (installRun) {
    if (wanted && !samePath(wanted, install.home)) {
      throw Object.assign(new Error(`本地语音识别正在安装到 ${install.home}（已完成 ${Math.round(install.progress)}%），请等它装完再换别的位置`), { code: 'BUSY', status: 409 })
    }
    if (typeof onProgress === 'function') installRun.listeners.add(onProgress)
    return { promise: installRun.promise, joined: true, state: getAsrInstallState() }
  }
  const home = wanted ? resolve(wanted) : recommendAsrHome()
  const useMirror = String(mirror || '').toLowerCase() === 'global' ? 'global' : 'cn'
  const kind = trigger === 'auto' ? 'auto' : 'manual'
  install = {
    ...idleInstall(),
    state: 'running',
    message: kind === 'auto' ? '正在自动准备本地语音识别…' : '正在准备安装本地语音识别…',
    home,
    mirror: useMirror,
    trigger: kind,
    startedAt: new Date().toISOString(),
  }
  const run = { gen: ++installGen, listeners: new Set(typeof onProgress === 'function' ? [onProgress] : []), promise: null }
  run.promise = Promise.resolve().then(() => runSharedInstall(run, { home, mirror: useMirror, writeEnv: writeEnv !== false }))
  // a background start may have nobody waiting: the failure is kept in the state, never an unhandled rejection
  run.promise.catch(() => {})
  installRun = run
  return { promise: run.promise, joined: false, state: getAsrInstallState() }
}

async function runSharedInstall(run, { home, mirror, writeEnv }) {
  const live = () => run.gen === installGen
  let lock = null
  const notify = () => {
    for (const fn of run.listeners) {
      try {
        fn({ stage: 'asr-install', progress: install.progress, message: install.message })
      } catch {}
    }
  }
  const update = (p) => {
    if (!live()) return
    const pct = Number(p?.progress)
    if (p?.progress !== undefined && Number.isFinite(pct)) install.progress = Math.max(0, Math.min(100, pct))
    if (p?.message) {
      install.message = String(p.message)
      install.logs.push(install.message)
      if (install.logs.length > 40) install.logs.shift()
    }
    lock?.touch?.(install)
    notify()
  }
  try {
    lock = await acquireInstallLock(home, { onWait: update, isLive: live })
    if (!live()) return { ok: false, home, cancelled: true }
    // another process (the studio, an MCP server, DSH) installed this folder meanwhile: use it
    const res = lock?.done ? { ok: true, home, sharedInstall: true } : await (installerImpl || installAsrEngine)({ installDir: home, mirror, writeEnv, onProgress: update })
    if (live()) {
      if (res && res.ok === false) finishInstall('failed', `已经装好了，但自检没通过（${res.status?.reason || '原因未知'}）`)
      else finishInstall('done', '本地语音识别已经准备好了')
      notify()
    }
    return res
  } catch (err) {
    const reason = friendlyInstallError(err)
    if (live()) {
      finishInstall('failed', reason, err)
      notify()
    }
    throw Object.assign(new Error(reason), { code: 'ASR_INSTALL_FAILED', cause: err })
  } finally {
    if (lock && !lock.done) lock.release()
    if (installRun === run) installRun = null
    run.listeners.clear()
  }
}

function finishInstall(state, message, err = null) {
  install = {
    ...install,
    state,
    progress: state === 'done' ? 100 : install.progress,
    message,
    error: state === 'failed' ? message : '',
    detail: err ? String(err?.message || err).slice(0, 400) : '',
    finishedAt: new Date().toISOString(),
  }
  lastEndAt = Date.now()
  resetAsrCaches()
}

/** A plain-Chinese reason for a failed install (no call to action: the panel shows 「重试」 next to it). */
function friendlyInstallError(err) {
  const raw = String(err?.message || err || '').replace(/\s+/g, ' ').trim()
  const short = raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
  const code = `${err?.code || ''} ${err?.cause?.code || ''}`
  if (err?.name === 'AbortError' || /安装已手动停止/.test(raw)) return '下载太久没有完成（网络太慢或连接被中断了）'
  if (/^磁盘空间不足/.test(raw)) return raw
  if (/ENOSPC/.test(code) || /ENOSPC|no space left/i.test(raw)) return '磁盘空间不够（安装本地语音识别至少需要 420 MB 可用空间）'
  if (/EINTEGRITY/.test(code) || /校验失败|校验不一致/.test(raw)) return '下载的文件不完整（校验没通过，已经删掉了）'
  const net = /ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|UND_ERR/
  if (net.test(code) || net.test(raw) || /fetch failed|socket hang up|getaddrinfo|network|下载不完整/i.test(raw)) return `网络连不上下载服务器（${short}）`
  if (/HTTP [45]\d\d/.test(raw)) return `下载服务器暂时不可用（${short}）`
  if (/EACCES|EPERM|EROFS/.test(`${code} ${raw}`)) return `没有权限写入安装文件夹（${short}）`
  return /[\u4e00-\u9fff]/.test(raw) ? raw.slice(0, 300) : `安装没有成功（${short || '原因未知'}）`
}

const readJsonOrNull = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const mtimeOf = (p) => {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}
const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * One install per engine folder across processes (the studio, an MCP server and DSH may all want the engine): a lock
 * file `<home>/.install.lock` (owner pid) plus `.install.progress.json` (refreshed by the owner). While another live
 * process holds it, wait and show its progress; when it released the lock and the folder has `asr-engine.json`, its
 * install is used (`{ done: true }`); a lock whose owner died or went silent for 5 minutes is taken over. Folders the
 * installer refuses anyway (non-ASCII, the read-only `vendor/asr`) or that cannot be written get no lock (null).
 */
async function acquireInstallLock(home, { onWait, isLive }) {
  if (!isAsciiPath(home) || samePath(home, vendorAsrHome())) return null
  const lockPath = join(home, LOCK_NAME)
  const progressPath = join(home, LOCK_PROGRESS_NAME)
  try {
    mkdirSync(home, { recursive: true })
  } catch {
    return null
  }
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  for (let takeovers = 0; ; ) {
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }), { flag: 'wx' })
      return ownInstallLock(lockPath, progressPath, token)
    } catch (err) {
      if (err?.code !== 'EEXIST') return null
    }
    const owner = readJsonOrNull(lockPath)
    const lastSign = Math.max(mtimeOf(lockPath), mtimeOf(progressPath))
    // a lock file that cannot be read yet is being written right now
    const alive = owner ? Number(owner.pid) !== process.pid && pidAlive(Number(owner.pid)) : Date.now() - mtimeOf(lockPath) < 10_000
    if (!alive || Date.now() - lastSign > LOCK_IDLE_MS) {
      if (++takeovers > 3) return null
      try {
        rmSync(lockPath, { force: true })
      } catch {
        return null
      }
      continue
    }
    const pct = Number(readJsonOrNull(progressPath)?.progress)
    const known = Number.isFinite(pct)
    onWait({ ...(known ? { progress: pct } : {}), message: `另一个窗口正在安装本地语音识别${known ? `（${Math.round(pct)}%）` : ''}，等它装完就能用…` })
    await sleep(lockPollMs)
    if (!isLive()) return null
    if (!existsSync(lockPath) && existsSync(join(home, MANIFEST_NAME))) return { done: true }
  }
}

function ownInstallLock(lockPath, progressPath, token) {
  let lastWrite = 0
  let latest = { progress: 0, message: '' }
  const write = () => {
    lastWrite = Date.now()
    try {
      writeFileSync(progressPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), progress: latest.progress, message: latest.message }))
    } catch {}
  }
  write()
  const beat = setInterval(write, 30_000)
  beat.unref?.()
  return {
    touch(s) {
      latest = { progress: Number(s?.progress) || 0, message: String(s?.message || '') }
      if (Date.now() - lastWrite >= 1500) write()
    },
    release() {
      clearInterval(beat)
      if (readJsonOrNull(lockPath)?.token !== token) return
      for (const p of [progressPath, lockPath]) {
        try {
          rmSync(p, { force: true })
        } catch {}
      }
    },
  }
}

/** Wait for the install in flight (if any), forwarding 「正在自动准备本地语音识别 45%（首次约 260 MB，只需一次）」. The
 *  signal only stops this wait: the shared install goes on. */
function joinAsrInstall({ signal, onProgress } = {}) {
  const run = installRun
  if (!run) return Promise.resolve()
  let lastPct = -1
  const forward = () => {
    if (install.state !== 'running') return
    const pct = Math.round(install.progress || 0)
    if (pct === lastPct) return
    lastPct = pct
    const what = install.trigger === 'auto' ? '正在自动准备本地语音识别' : '正在安装本地语音识别'
    try {
      onProgress?.({ progress: 1, message: `${what} ${pct}%（首次约 260 MB，只需一次）` })
    } catch {}
  }
  forward()
  run.listeners.add(forward)
  return new Promise((resolveWait, rejectWait) => {
    const onAbort = () => {
      cleanup()
      rejectWait(createAbortError())
    }
    const cleanup = () => {
      run.listeners.delete(forward)
      signal?.removeEventListener?.('abort', onAbort)
    }
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const settle = () => {
      cleanup()
      resolveWait()
    }
    run.promise.then(settle, settle)
  })
}

/**
 * Cheap, idempotent, never waits, never throws (status routes, the War Room's state, the narration check): when the
 * engine is missing and the automatic install is allowed (not switched off, a supported system, no install of this
 * process ended in the last 10 minutes), start it in the background — recommended folder, domestic mirror first.
 * `delayMs` schedules the check once instead (an unref'd timer: a short-lived process exits before it fires).
 * Returns getAsrInstallState().
 */
export async function maybeStartAsrAutoInstall({ delayMs = 0 } = {}) {
  try {
    if (!installRun && isAsrAutoInstallEnabled() && ASR_PLATFORM_PACKAGES[asrPlatformKey()] && !inAutoBackoff()) {
      if (Number(delayMs) > 0) {
        if (!autoTimer) {
          autoTimer = setTimeout(() => {
            autoTimer = null
            maybeStartAsrAutoInstall().catch(() => {})
          }, Number(delayMs))
          autoTimer.unref?.()
        }
      } else {
        const st = await getAsrStatus()
        if (!st.ready && !installRun) startAsrInstall({ trigger: 'auto', mirror: 'cn' })
      }
    }
  } catch {}
  return getAsrInstallState()
}

function asrMissingError(status, why) {
  const missing = (status?.missing || []).join('、') || '识别引擎'
  const texts = {
    platform: `当前系统（${status?.platform || asrPlatformKey()}）用不了本地语音识别：只支持 Windows、macOS、Linux 的 x64 和 arm64 电脑。`,
    'switched-off': `本地语音识别还没有安装（缺少：${missing}）。自动安装已关闭（设置了 DSH_ASR_AUTO_INSTALL=0）：去掉这个设置，下次用到时就会自动安装；也可以在「AI 剪辑 · 口播粗剪」面板点「一键安装」，或让 AI 助手用 speech_engine 工具安装（约 260 MB，只需一次）。`,
    failed: `本地语音识别自动准备没有成功：${install.error || '原因未知'}。可以在「AI 剪辑 · 口播粗剪」面板点「重试」，或让 AI 助手用 speech_engine 工具重新安装。`,
    'other-folder': `本地语音识别还没有安装在 ${status?.home || ''}（缺少：${missing}）。可以在「AI 剪辑 · 口播粗剪」面板点「一键安装」，或用 speech_engine 工具安装到这个文件夹（约 260 MB，只需一次）。`,
    'still-missing': `本地语音识别的安装已经结束，但还是找不到它（缺少：${missing}）。请在「AI 剪辑 · 口播粗剪」面板点「重试」，或换一个安装位置。`,
  }
  return Object.assign(new Error(texts[why] || texts['still-missing']), { code: 'ASR_NOT_INSTALLED', status: 412, reason: why })
}

/**
 * The engine, ready to use — a feature that needs it waits for the shared install: joins the one running, or starts
 * the automatic one (unless it is switched off, impossible here, or an install ended less than 10 minutes ago).
 * `onProgress` receives `{ progress: 1, message: '正在自动准备本地语音识别 45%（首次约 260 MB，只需一次）' }`; `signal`
 * only stops this wait. Nothing is installed into an explicit `home` from here. Throws code ASR_NOT_INSTALLED (status
 * 412) with a plain-Chinese reason. Returns getAsrStatus().
 */
export async function ensureAsrEngine({ home = '', signal, onProgress } = {}) {
  if (signal?.aborted) throw createAbortError()
  let status = await getAsrStatus({ home })
  if (status.ready) return status
  if (String(home || '').trim()) throw asrMissingError(status, 'other-folder')
  if (!status.supportedPlatform) throw asrMissingError(status, 'platform')
  if (!installRun) {
    if (!isAsrAutoInstallEnabled()) throw asrMissingError(status, 'switched-off')
    if (inAutoBackoff()) throw asrMissingError(status, install.state === 'failed' ? 'failed' : 'still-missing')
    startAsrInstall({ trigger: 'auto', mirror: 'cn' })
  }
  await joinAsrInstall({ signal, onProgress })
  status = await getAsrStatus({ force: true })
  if (status.ready) return status
  throw asrMissingError(status, install.state === 'failed' ? 'failed' : 'still-missing')
}

/**
 * Tests only (nothing is ever downloaded): `fn(options)` replaces installAsrEngine in the shared install (null = the
 * real one again). Resets the shared state, the failure time, a scheduled automatic start and the folder caches.
 * Options: `retryAfterMs` (the automatic retry pause), `lockPollMs` (how often another process's lock is looked at),
 * `paths` `{ vendor, defaultHome, recommended }` (the folders the engine is looked for in).
 */
export function setAsrInstallerForTests(fn, { retryAfterMs = 0, lockPollMs: pollMs = 0, paths = null } = {}) {
  installerImpl = typeof fn === 'function' ? fn : null
  autoRetryMs = Number(retryAfterMs) > 0 ? Number(retryAfterMs) : ASR_AUTO_RETRY_MS
  lockPollMs = Number(pollMs) > 0 ? Number(pollMs) : 2000
  pathOverrides = paths && typeof paths === 'object' ? { ...paths } : null
  installGen++
  installRun = null
  install = idleInstall()
  lastEndAt = 0
  if (autoTimer) clearTimeout(autoTimer)
  autoTimer = null
  resetAsrCaches()
}

/* ------------------------------------------------------------------------------------------------ worker */

let workerSeq = 0

/**
 * Run `asr-worker.cjs` with a job description (JSON file in, JSON file out, progress file polled).
 * `job.mode`: 'selftest' | 'transcribe' | 'transcribe-batch' (see transcribeClips).
 */
export async function runAsrWorker(job, { home = '', timeoutMs = 3_600_000, signal, onChild, onProgress, tmpDir = '' } = {}) {
  const cfg = resolveAsrConfig({ home })
  const dir = resolve(tmpDir || join(REPO_ROOT, '.tmp', 'asr'))
  mkdirSync(dir, { recursive: true })
  const id = `${process.pid}-${Date.now()}-${++workerSeq}`
  const jobPath = join(dir, `job-${id}.json`)
  const outPath = join(dir, `out-${id}.json`)
  const progressPath = join(dir, `progress-${id}.json`)
  const threads = Math.max(1, Math.min(4, (cpus()?.length || 4) - 1))
  writeFileSync(
    jobPath,
    JSON.stringify({
      ...job,
      runtimeDir: cfg.runtimeDir,
      senseVoiceDir: cfg.senseVoiceDir,
      vadPath: cfg.vadPath,
      numThreads: job.numThreads || threads,
      outPath,
      progressPath,
    }),
    'utf8',
  )
  let timer = null
  let lastPct = -1
  if (onProgress) {
    timer = setInterval(() => {
      try {
        const p = JSON.parse(readFileSync(progressPath, 'utf8'))
        if (Number.isFinite(p.progress) && p.progress !== lastPct) {
          lastPct = p.progress
          onProgress(p)
        }
      } catch {}
    }, 600)
  }
  try {
    const res = await runCommandRedirected(process.execPath, [ASR_WORKER_PATH, jobPath], {
      cwd: dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeoutMs,
      signal,
      onChild,
    })
    let out = null
    try {
      out = JSON.parse(readFileSync(outPath, 'utf8'))
    } catch {}
    if (res.code !== 0 || !out) {
      const tail = `${res.stderr || ''}\n${res.stdout || ''}`.trim().split(/\r?\n/).slice(-6).join(' | ')
      throw new Error(out?.error || tail || `识别进程退出码 ${res.code}`)
    }
    if (out.ok === false) throw new Error(out.error || '识别失败')
    return out
  } finally {
    if (timer) clearInterval(timer)
    for (const p of [jobPath, outPath, progressPath]) {
      try {
        rmSync(p, { force: true })
      } catch {}
    }
  }
}

/* ------------------------------------------------------------------------------------------------ transcription */

// bump whenever the worker's segmentation / decoding changes: cached transcripts of older versions are re-made
export const TRANSCRIPT_VERSION = 2

function sourceFingerprint(abs) {
  const st = statSync(abs)
  return { size: st.size, mtimeMs: Math.round(st.mtimeMs) }
}

/** `<projectDir>/assets/transcripts/<name>.<hash>.transcript.json` (or next to the media when no project). */
export function transcriptCachePath(mediaAbs, projectDir = '') {
  const fp = sourceFingerprint(mediaAbs)
  const key = createHash('sha1').update(`${resolve(mediaAbs).toLowerCase()}|${fp.size}|${fp.mtimeMs}`).digest('hex').slice(0, 12)
  const stem = basename(mediaAbs).replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 60) || 'media'
  const dir = projectDir ? join(resolve(projectDir), 'assets', 'transcripts') : join(dirname(mediaAbs), '.transcripts')
  return join(dir, `${stem}.${key}.transcript.json`)
}

export function readCachedTranscript(mediaAbs, projectDir = '') {
  try {
    const p = transcriptCachePath(mediaAbs, projectDir)
    if (!existsSync(p)) return null
    const t = JSON.parse(readFileSync(p, 'utf8'))
    const fp = sourceFingerprint(mediaAbs)
    if (t?.version !== TRANSCRIPT_VERSION || t?.source?.size !== fp.size || t?.source?.mtimeMs !== fp.mtimeMs) return null
    return { ...t, cachePath: p }
  } catch {
    return null
  }
}

/** Decode the base64 Int8 energy envelope (dBFS per `hopSec`) of a transcript into a plain array. */
export function decodeEnergyEnvelope(transcript) {
  const e = transcript?.energy
  if (!e?.db) return { hopSec: 0.01, db: [] }
  if (Array.isArray(e.db)) return { hopSec: Number(e.hopSec) || 0.01, db: e.db }
  const buf = Buffer.from(String(e.db), 'base64')
  const db = new Array(buf.length)
  for (let i = 0; i < buf.length; i++) db[i] = buf.readInt8(i)
  return { hopSec: Number(e.hopSec) || 0.01, db }
}

/**
 * Transcribe a video / audio file with the local engine. Returns the transcript (also cached on disk; a second call
 * with the same unchanged file is instant). When the engine is missing it waits for the shared install (started
 * automatically unless switched off; progress 「正在自动准备本地语音识别 45%…」 via onProgress, see ensureAsrEngine);
 * otherwise throws `code: 'ASR_NOT_INSTALLED'` with a plain-Chinese reason.
 *
 * Transcript: `{ version, engine, source{path,size,mtimeMs}, durationSec, language, sampleRate,
 *   segments[{ start, end, lang, emotion, event, text, tokens[{ t, s }] }], energy{ hopSec, db(base64 Int8) } }`
 * (times in seconds from the start of the file; token `s` = start time reported by the model, ±60 ms).
 */
export async function transcribeMedia({ mediaPath, projectDir = '', language = 'auto', force = false, signal, onChild, onProgress, home = '' } = {}) {
  if (!mediaPath) throw new Error('缺少要识别的视频或音频文件')
  const mediaAbs = isAbsolute(mediaPath) ? mediaPath : resolve(projectDir || REPO_ROOT, mediaPath)
  if (!existsSync(mediaAbs)) throw new Error(`找不到文件：${mediaPath}`)
  if (!force) {
    const cached = readCachedTranscript(mediaAbs, projectDir)
    if (cached && (language === 'auto' || cached.requestedLanguage === language)) {
      onProgress?.({ progress: 100, message: '已使用上次的识别结果（文件没有变化）' })
      return cached
    }
  }
  await ensureAsrEngine({ home, signal, onProgress })
  const cfg = resolveAsrConfig({ home })
  const { ffmpeg } = resolveBinaries()
  const workDir = join(REPO_ROOT, '.tmp', 'asr')
  mkdirSync(workDir, { recursive: true })
  const wavPath = join(workDir, `pcm-${process.pid}-${Date.now()}.wav`)
  onProgress?.({ progress: 3, message: '正在提取音轨（16 kHz 单声道）...' })
  try {
    const ext = await runCommandRedirected(
      ffmpeg,
      ['-hide_banner', '-nostats', '-y', '-i', mediaAbs, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', wavPath],
      { timeoutMs: 1_800_000, signal, onChild },
    )
    if (ext.code !== 0 || !existsSync(wavPath)) {
      const msg = `${ext.stderr || ''}`.trim().split(/\r?\n/).slice(-3).join(' | ')
      throw new Error(/does not contain any stream|Output file #0 does not contain|matches no streams/i.test(msg) ? '这个文件里没有声音，无法识别' : `提取音轨失败：${msg}`)
    }
    const started = Date.now()
    const out = await runAsrWorker(
      { mode: 'transcribe', wavPath, language: language || 'auto' },
      {
        home: cfg.home,
        signal,
        onChild,
        timeoutMs: 6 * 3_600_000,
        onProgress: (p) => onProgress?.({ progress: Math.max(5, Math.min(98, Math.round(5 + (Number(p.progress) || 0) * 0.93))), message: p.message || '正在识别...' }),
      },
    )
    const fp = sourceFingerprint(mediaAbs)
    const transcript = {
      version: TRANSCRIPT_VERSION,
      engine: 'sherpa-onnx-sensevoice-int8',
      engineVersion: ASR_RUNTIME.version,
      requestedLanguage: language || 'auto',
      source: { path: projectDir ? relative(resolve(projectDir), mediaAbs).replace(/\\/g, '/') : mediaAbs.replace(/\\/g, '/'), name: basename(mediaAbs), ...fp },
      durationSec: out.durationSec,
      sampleRate: out.sampleRate,
      language: out.language,
      segments: out.segments,
      energy: out.energy,
      stats: { ...out.stats, wallMs: Date.now() - started },
      createdAt: new Date().toISOString(),
    }
    const cachePath = transcriptCachePath(mediaAbs, projectDir)
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify(transcript) + '\n', 'utf8')
    onProgress?.({ progress: 100, message: `识别完成：${transcript.segments.length} 段，${Math.round(transcript.durationSec)} 秒` })
    return { ...transcript, cachePath }
  } finally {
    try {
      rmSync(wavPath, { force: true })
    } catch {}
  }
}

/**
 * Recognise many short clips (e.g. every scene's narration take) with ONE model load — no transcript cache, no
 * timestamps. `clips`: [{ id, path }] (any audio FFmpeg reads; converted to 16 kHz mono PCM first).
 * Returns `{ items: [{ id, ok, text, language, durationSec, decodeMs } | { id, ok: false, error }], stats }`.
 * Throws `code: 'ASR_NOT_INSTALLED'` when the engine is missing (never waits for the install: its caller, the
 * narration check, must not hold up a production).
 */
export async function transcribeClips({ clips = [], language = 'auto', signal, onChild, onProgress, home = '', tmpDir = '' } = {}) {
  const list = (Array.isArray(clips) ? clips : []).filter((c) => c && c.path)
  if (list.length === 0) return { items: [], stats: { loadMs: 0, decodeMs: 0, items: 0, convertMs: 0 } }
  const status = await getAsrStatus({ home })
  if (!status.ready) {
    throw Object.assign(new Error(`本地语音识别还没有安装（${status.missing.join('、')}）`), { code: 'ASR_NOT_INSTALLED', status: 412 })
  }
  const cfg = resolveAsrConfig({ home })
  const { ffmpeg } = resolveBinaries()
  const workDir = resolve(tmpDir || join(REPO_ROOT, '.tmp', 'asr'), `clips-${process.pid}-${Date.now()}-${++workerSeq}`)
  mkdirSync(workDir, { recursive: true })
  const t0 = Date.now()
  try {
    const items = []
    const failed = []
    let next = 0
    const convert = async () => {
      while (next < list.length) {
        const k = next++
        const c = list[k]
        if (signal?.aborted) throw createAbortError()
        const wavPath = join(workDir, `c${k}.wav`)
        let res
        try {
          res = await runCommandRedirected(
            ffmpeg,
            ['-hide_banner', '-nostats', '-y', '-i', c.path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', wavPath],
            { timeoutMs: 120_000, signal, onChild },
          )
        } catch (err) {
          if (signal?.aborted || err?.name === 'AbortError') throw createAbortError()
          res = { code: -1, stderr: String(err?.message || err) }
        }
        if (res.code === 0 && existsSync(wavPath)) items[k] = { id: c.id, wavPath }
        else failed.push({ id: c.id, ok: false, error: `读取音频失败：${String(res.stderr || '').trim().split(/\r?\n/).slice(-1)[0] || `退出码 ${res.code}`}` })
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, convert))
    const convertMs = Date.now() - t0
    const jobItems = items.filter(Boolean)
    onProgress?.({ progress: 5, message: '正在加载识别模型...' })
    const out = jobItems.length
      ? await runAsrWorker(
          { mode: 'transcribe-batch', items: jobItems, language: language || 'auto' },
          {
            home: cfg.home,
            signal,
            onChild,
            timeoutMs: 120_000 + jobItems.length * 20_000,
            onProgress: (p) => onProgress?.({ progress: Math.max(5, Math.min(99, Math.round(Number(p.progress) || 0))), message: p.message || '正在识别...' }),
          },
        )
      : { items: [], stats: { loadMs: 0, decodeMs: 0, items: 0 } }
    return { items: [...(out.items || []), ...failed], stats: { ...(out.stats || {}), convertMs, wallMs: Date.now() - t0 } }
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true })
    } catch {}
  }
}

/** Plain text of a transcript (segments joined; English segments separated by spaces). */
export function transcriptPlainText(transcript) {
  return (transcript?.segments || [])
    .map((s) => String(s.text || '').trim())
    .filter(Boolean)
    .reduce((acc, t) => (acc && /[A-Za-z0-9.,!?;:]$/.test(acc) && /^[A-Za-z0-9]/.test(t) ? `${acc} ${t}` : acc + t), '')
}

/** Remove cached transcripts of a project (used by tests / “重新识别”). */
export function clearTranscriptCache(projectDir) {
  const dir = join(resolve(projectDir), 'assets', 'transcripts')
  if (!existsSync(dir)) return 0
  let n = 0
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.transcript.json')) {
      rmSync(join(dir, f), { force: true })
      n++
    }
  }
  return n
}
