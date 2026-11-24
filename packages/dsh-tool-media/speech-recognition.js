/**
 * @dsh-video/tool-media — Optional local speech recognition (口播粗剪 · 真实字幕 · 素材理解)
 *
 * Engine (all free, offline after a one-time ~260 MB download; no audio ever leaves the computer):
 *   - sherpa-onnx Node addon (k2-fsa / Next-gen Kaldi, Apache-2.0) — prebuilt N-API binaries from the npm registry,
 *     verified against the registry's sha512 integrity and unpacked by this module (no npm / compiler needed);
 *   - SenseVoice-Small int8 (FunAudioLLM, FunASR Model License v1.1: commercial use allowed, keep the attribution) —
 *     Mandarin, Cantonese, English, Japanese, Korean; punctuation + inverse text normalisation; per-token timestamps;
 *   - silero VAD (MIT) to cut long recordings into speech segments.
 * Every download is pinned (version + SHA-256 / sha512) and lands in one folder the user picks (default
 * `$DSH_ASR_HOME` or `<workspace>/ai-engines/asr`), never in a system cache.
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
import { createAbortError, loadEnv, REPO_ROOT, resolveBinaries, runCommandRedirected } from '../shared/index.js'
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

/** Install folder: explicit dir > `DSH_ASR_HOME` > `<workspace>/ai-engines/asr`. */
export function resolveAsrHome(explicit = '') {
  loadEnv()
  const pick = String(explicit || '').trim() || String(process.env.DSH_ASR_HOME || '').trim()
  return resolve(pick || join(REPO_ROOT, 'ai-engines', 'asr'))
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
 * Suggested install folder for a fresh install: the configured / existing one; else next to the other local AI
 * engines (`AVATAR_LIPSYNC_HOME` → `<parent>/asr`); else, on Windows when the workspace sits on the system drive, the
 * first other local drive with room (`<X>:/dsh-ai/asr`); else the default. Always an ASCII path.
 */
export function recommendAsrHome() {
  loadEnv()
  const cfg = resolveAsrConfig()
  if (String(process.env.DSH_ASR_HOME || '').trim() || existsSync(cfg.manifestPath)) return cfg.home
  const ascii = (p) => !/[^\x20-\x7e]/.test(p)
  const lip = String(process.env.AVATAR_LIPSYNC_HOME || '').trim()
  if (lip && ascii(lip)) return resolve(dirname(resolve(lip)), 'asr')
  if (process.platform === 'win32') {
    const sysDrive = String(process.env.SystemDrive || 'C:').toUpperCase()
    const onSystem = cfg.home.slice(0, 2).toUpperCase() === sysDrive
    if (onSystem || !ascii(cfg.home)) {
      for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
        const root = `${letter}:\\`
        if (`${letter}:` === sysDrive || !existsSync(root)) continue
        if (freeBytesOf(root) >= 2 * 1024 ** 3) return `${letter}:\\dsh-ai\\asr`
      }
    }
  }
  return ascii(cfg.home) ? cfg.home : resolve(dirname(REPO_ROOT), 'dsh-ai-asr')
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
 * One-click install (idempotent: verified files are kept, so a re-run only repairs what is missing).
 * `mirror`: 'cn' (npmmirror + hf-mirror first) | 'global'.
 */
export async function installAsrEngine(options = {}) {
  loadEnv()
  const { installDir = '', mirror = 'cn', writeEnv = true, signal, onProgress } = options
  const useCn = String(mirror || 'cn').toLowerCase() !== 'global'
  const cfg = resolveAsrConfig({ home: installDir })
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
  if (writeEnv && cfg.home !== resolve(join(REPO_ROOT, 'ai-engines', 'asr'))) {
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

/* ------------------------------------------------------------------------------------------------ worker */

let workerSeq = 0

/**
 * Run `asr-worker.cjs` with a job description (JSON file in, JSON file out, progress file polled).
 * `job.mode`: 'selftest' | 'transcribe'.
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
 * with the same unchanged file is instant). Throws `code: 'ASR_NOT_INSTALLED'` when the engine is missing.
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
  const status = await getAsrStatus({ home })
  if (!status.ready) {
    throw Object.assign(new Error(`本地语音识别还没有安装（${status.missing.join('、')}）。请先在「AI 剪辑」面板里一键安装，约 260 MB。`), { code: 'ASR_NOT_INSTALLED', status: 412 })
  }
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
