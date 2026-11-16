import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncProjectFonts } from './compliance.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(__dirname, '..', '..')

let envLoaded = false

/**
 * Load `.env` from repository root without hardcoding any machine-specific paths.
 */
export function loadEnv(force = false) {
  if (envLoaded && !force) return process.env
  const envPath = process.env.DSH_VIDEO_ENV_PATH || join(REPO_ROOT, '.env')
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
  // Ensure temporary directories default to repo `.tmp` on the project drive (preventing C: drive temp bloat)
  const localTmp = join(REPO_ROOT, '.tmp')
  try {
    if (!existsSync(localTmp)) mkdirSync(localTmp, { recursive: true })
    process.env.TMP = localTmp
    process.env.TEMP = localTmp
    process.env.TMPDIR = localTmp
  } catch {}
  envLoaded = true
  return process.env
}

/**
 * Resolve a path from env (supports relative paths anchored to REPO_ROOT).
 */
export function resolveEnvPath(envKey, fallbackRelative = '') {
  loadEnv()
  const raw = (process.env[envKey] || fallbackRelative || '').trim()
  if (!raw) return ''
  return isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw)
}

/**
 * Resolve ffmpeg & ffprobe binaries from `.env` (FFMPEG_PATH / FFPROBE_PATH) or system PATH.
 * Adapted from MIT-licensed `dsh-video-studio/dsh/ffmpeg.js`.
 */
export function resolveBinaries() {
  loadEnv()
  const ffmpegEnv = (process.env.FFMPEG_PATH || '').trim()
  const ffprobeEnv = (process.env.FFPROBE_PATH || '').trim()

  const ffmpeg = ffmpegEnv && existsSync(ffmpegEnv) ? ffmpegEnv : (ffmpegEnv || 'ffmpeg')
  let ffprobe = ffprobeEnv && existsSync(ffprobeEnv) ? ffprobeEnv : ''
  if (!ffprobe && ffmpegEnv && existsSync(ffmpegEnv)) {
    const sibling = join(dirname(ffmpegEnv), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
    if (existsSync(sibling)) ffprobe = sibling
  }
  if (!ffprobe) ffprobe = ffprobeEnv || 'ffprobe'

  return { ffmpeg, ffprobe }
}

/**
 * Forcefully terminate a spawned child process tree (Windows `taskkill /T /F` fallback `SIGKILL`).
 */
export function killProcessTree(child) {
  if (!child) return
  try {
    if (process.platform === 'win32' && child.pid) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.on('error', () => {})
    }
  } catch {}
  try {
    child.kill('SIGKILL')
  } catch {
    try {
      child.kill()
    } catch {}
  }
}

export function createAbortError(message = '任务已手动停止 (Aborted)') {
  const err = new Error(message)
  err.name = 'AbortError'
  err.code = 'ABORT_ERR'
  return err
}

/**
 * Spawn a child process using file-redirected stdio to avoid Windows sandbox pipe `EPERM`.
 * Supports AbortSignal cancellation and immediate process-tree cleanup.
 * Adapted from MIT-licensed `dsh-video-studio/dsh/ffmpeg.js`.
 */
export function runCommandRedirected(bin, args = [], options = {}) {
  const { cwd = REPO_ROOT, env = process.env, timeoutMs = 180_000, signal, onChild } = options
  if (signal?.aborted) {
    return Promise.reject(createAbortError())
  }
  const tempRoot = join(REPO_ROOT, '.tmp')
  if (!existsSync(tempRoot)) {
    try {
      mkdirSync(tempRoot, { recursive: true })
    } catch {
      // Fallback to OS tmpdir if repo .tmp is unavailable
    }
  }
  const baseTmp = existsSync(tempRoot) ? tempRoot : tmpdir()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const stdoutFile = join(baseTmp, `cmd-${id}.stdout.log`)
  const stderrFile = join(baseTmp, `cmd-${id}.stderr.log`)

  return new Promise((resolvePromise, rejectPromise) => {
    let stdoutFd
    let stderrFd
    try {
      stdoutFd = openSync(stdoutFile, 'w')
      stderrFd = openSync(stderrFile, 'w')
    } catch (err) {
      rejectPromise(err)
      return
    }

    let settled = false
    let timer = null

    const cleanupAndRead = () => {
      try { closeSync(stdoutFd) } catch {}
      try { closeSync(stderrFd) } catch {}
      let stdout = ''
      let stderr = ''
      try { stdout = readFileSync(stdoutFile, 'utf8') } catch {}
      try { stderr = readFileSync(stderrFile, 'utf8') } catch {}
      try { unlinkSync(stdoutFile) } catch {}
      try { unlinkSync(stderrFile) } catch {}
      return { stdout, stderr }
    }

    const child = spawn(bin, args, {
      cwd,
      env,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    })
    if (typeof onChild === 'function') {
      try { onChild(child) } catch {}
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      killProcessTree(child)
      cleanupAndRead()
      rejectPromise(createAbortError('子进程已响应停止指令并终止'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        signal?.removeEventListener?.('abort', onAbort)
        killProcessTree(child)
        const { stdout, stderr } = cleanupAndRead()
        rejectPromise(new Error(`Command timed out after ${timeoutMs}ms: ${bin}\n${stderr || stdout}`))
      }, timeoutMs)
    }

    child.on('error', (err) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      cleanupAndRead()
      rejectPromise(err)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      const { stdout, stderr } = cleanupAndRead()
      resolvePromise({ code: code ?? 0, stdout, stderr })
    })
  })
}

/**
 * Fallback duration measurement from WAV header if ffprobe is not available.
 */
function parseWavHeaderDurationSec(filePath) {
  const buf = readFileSync(filePath)
  if (buf.length < 44) return 0
  const riff = buf.toString('ascii', 0, 4)
  const wave = buf.toString('ascii', 8, 12)
  if (riff !== 'RIFF' || wave !== 'WAVE') return 0
  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4)
    const chunkSize = buf.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ' && offset + 20 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16)
    } else if (chunkId === 'data') {
      dataSize = chunkSize
      break
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  if (byteRate > 0 && dataSize > 0) {
    return Number((dataSize / byteRate).toFixed(4))
  }
  return 0
}

/**
 * Probe exact audio duration in seconds and frames using `ffprobe` (never guess duration).
 */
export async function probeAudioDuration(audioPath, fps = 30) {
  const absPath = resolve(audioPath)
  if (!existsSync(absPath)) {
    throw new Error(`Audio file does not exist: ${absPath}`)
  }

  const { ffprobe } = resolveBinaries()
  let durationSec = 0
  let sampleRate = 0
  let channels = 0
  let proberUsed = 'ffprobe'

  try {
    const { code, stdout, stderr } = await runCommandRedirected(ffprobe, [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=sample_rate,channels',
      '-of', 'json',
      absPath,
    ])
    if (code === 0 && stdout.trim()) {
      const parsed = JSON.parse(stdout)
      const rawDur = Number(parsed?.format?.duration || 0)
      if (Number.isFinite(rawDur) && rawDur > 0) {
        durationSec = Number(rawDur.toFixed(4))
      }
      const stream = parsed?.streams?.[0]
      if (stream) {
        sampleRate = Number(stream.sample_rate || 0)
        channels = Number(stream.channels || 0)
      }
    } else {
      throw new Error(stderr || `ffprobe exited with code ${code}`)
    }
  } catch (err) {
    durationSec = parseWavHeaderDurationSec(absPath)
    proberUsed = 'wav-header-fallback'
    if (durationSec <= 0) {
      throw new Error(`Failed to measure audio duration via ffprobe (${ffprobe}): ${err.message}`)
    }
  }

  const safeFps = Number(fps) > 0 ? Number(fps) : 30
  const durationInFrames = Math.max(1, Math.ceil(durationSec * safeFps))

  return {
    audioPath: absPath,
    durationSec,
    durationInFrames,
    fps: safeFps,
    sampleRate,
    channels,
    proberUsed,
  }
}

export const ASPECT_RATIO_PRESETS = {
  '16:9': { label: '16:9 横屏大片 (B站 / YouTube / 官网发布)', wRatio: 16, hRatio: 9 },
  '9:16': { label: '9:16 竖屏短视频 (抖音 / 快手 / 视频号)', wRatio: 9, hRatio: 16 },
  '3:4': { label: '3:4 图文封面比例 (小红书)', wRatio: 3, hRatio: 4 },
  '1:1': { label: '1:1 正方形 (朋友圈 / 信息流)', wRatio: 1, hRatio: 1 },
}

export const QUALITY_PRESETS = {
  '720p': { label: '720P 高清草稿 (快速预览)', shortEdge: 720 },
  '1080p': { label: '1080P 全高清 (成片推荐)', shortEdge: 1080 },
  '2k': { label: '2K 超清影院', shortEdge: 1440 },
  '4k': { label: '4K 极致画质', shortEdge: 2160 },
}

function makeEven(n, min = 320) {
  const v = Math.max(min, Math.round(Number(n) || min))
  return v % 2 === 0 ? v : v + 1
}

/**
 * Resolve exact H.264-safe (even) pixel dimensions from user preset, custom values, or AI-auto topic/asset inference.
 */
export function resolveVideoDimensions({
  aspectRatio = 'auto',
  quality = '1080p',
  width,
  height,
  topic = '',
  assets = [],
} = {}) {
  const rawQuality = String(quality || '1080p').toLowerCase()
  const resolvedQuality = QUALITY_PRESETS[rawQuality] ? rawQuality : rawQuality === 'custom' ? 'custom' : '1080p'
  const rawRatio = String(aspectRatio || 'auto').toLowerCase()

  if ((rawRatio === 'custom' || resolvedQuality === 'custom') && Number(width) >= 320 && Number(height) >= 320) {
    const w = makeEven(width)
    const h = makeEven(height)
    const g = (a, b) => (b === 0 ? a : g(b, a % b))
    const d = g(w, h)
    return {
      width: w,
      height: h,
      aspectRatio: rawRatio === 'custom' ? `${w / d}:${h / d}` : rawRatio,
      requestedAspectRatio: rawRatio,
      quality: 'custom',
      reason: `自定义尺寸 ${w}×${h}`,
    }
  }

  let pickedRatio = ASPECT_RATIO_PRESETS[rawRatio] ? rawRatio : 'auto'
  let reason = ''

  if (pickedRatio === 'auto') {
    const text = String(topic || '').toLowerCase()
    if (/小红书|种草|图文笔记|3:4/.test(text)) {
      pickedRatio = '3:4'
      reason = 'AI 根据主题识别为小红书/种草场景，自动选择 3:4 比例'
    } else if (/抖音|快手|视频号|reels|shorts|竖屏|9:16|手机短视频/.test(text)) {
      pickedRatio = '9:16'
      reason = 'AI 根据主题识别为移动端竖屏短视频，自动选择 9:16 比例'
    } else if (/方屏|朋友圈卡片|1:1|正方形/.test(text)) {
      pickedRatio = '1:1'
      reason = 'AI 根据主题识别为信息流方屏场景，自动选择 1:1 比例'
    } else if (Array.isArray(assets) && assets.length > 0) {
      let portraitCount = 0
      let squareCount = 0
      let landscapeCount = 0
      for (const a of assets) {
        const aw = Number(a?.width || 0)
        const ah = Number(a?.height || 0)
        if (aw > 0 && ah > 0) {
          const r = aw / ah
          if (r < 0.85) portraitCount++
          else if (r > 1.18) landscapeCount++
          else squareCount++
        }
      }
      if (portraitCount > landscapeCount && portraitCount >= squareCount) {
        pickedRatio = '9:16'
        reason = `AI 分析导入素材多为竖构图 (${portraitCount} 竖 vs ${landscapeCount} 横)，自动匹配 9:16`
      } else if (squareCount > landscapeCount && squareCount > portraitCount) {
        pickedRatio = '1:1'
        reason = 'AI 分析导入素材以方形为主，自动匹配 1:1'
      } else {
        pickedRatio = '16:9'
        reason = 'AI 综合主题与素材横纵比，选用 16:9 影院横屏'
      }
    } else {
      pickedRatio = '16:9'
      reason = 'AI 判定为通用宣传/演示叙事，默认采用 16:9 电影横屏'
    }
  } else {
    reason = `用户指定 ${pickedRatio} · ${resolvedQuality.toUpperCase()}`
  }

  const ratioSpec = ASPECT_RATIO_PRESETS[pickedRatio] || ASPECT_RATIO_PRESETS['16:9']
  const shortEdge = (QUALITY_PRESETS[resolvedQuality] || QUALITY_PRESETS['1080p']).shortEdge

  let outW
  let outH
  if (ratioSpec.wRatio >= ratioSpec.hRatio) {
    outH = makeEven(shortEdge)
    outW = makeEven((outH * ratioSpec.wRatio) / ratioSpec.hRatio)
  } else {
    outW = makeEven(shortEdge)
    outH = makeEven((outW * ratioSpec.hRatio) / ratioSpec.wRatio)
  }

  return {
    width: outW,
    height: outH,
    aspectRatio: pickedRatio,
    requestedAspectRatio: rawRatio,
    quality: resolvedQuality,
    reason,
  }
}

/**
 * Strip web search citations, markdown links, bare URLs, and citation brackets cleanly
 * so LLM-grounded narration/subtitles never show `utm_source` or broken `https:` strings.
 */
export function sanitizeSpokenNarration(raw = '') {
  return String(raw || '')
    .replace(/\(\s*\[[^\]]*\]\(\s*https?:\/\/[^)]*\)\s*\)/gi, '')
    .replace(/\[([^\]]+)\]\(\s*https?:\/\/[^)]*\)/gi, '$1')
    .replace(/\(\s*https?:\/\/[^)]*\)/gi, '')
    .replace(/https?:\/\/[^\s)）\]】"']+/gi, '')
    .replace(/\[cite[:：\s][^\]]*\]/gi, '')
    .replace(/\(\s*\)|（\s*）/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Split narration text into clean single-line subtitle cues proportional to character count.
 * Adapts line width automatically for portrait (11 CJK chars), square (13), or landscape (16).
 */
export function buildSentenceSubtitles(narration, durationSec, fps = 30, opts = {}) {
  const clean = sanitizeSpokenNarration(narration)
  if (!clean || durationSec <= 0) return []

  const maxW = Math.max(8, Math.min(20, Number(opts?.maxLineWidth) || 16))
  const stripTailPunct = (s) => s.replace(/[，。！？；,!;、]+$/g, '').trim()

  const rawSentences = clean
    .split(/(?<=[。！？；!?;…\n])/)
    .map((s) => s.trim())
    .filter(Boolean)

  const displayWidth = (s) =>
    [...s].reduce((acc, ch) => acc + (/[\u0000-\u00ff]/.test(ch) ? 0.58 : 1), 0)

  const wrapClauseRespectingWords = (c, maxW = 16) => {
    const out = []
    let cur = ''
    // Split keeping spaces & CJK chars atomic while keeping ASCII words unbroken
    const tokens = c.match(/[A-Za-z0-9_.\-+]+|[\u4e00-\u9fff]|[^\sA-Za-z0-9_.\-+\u4e00-\u9fff]|\s+/g) || [c]
    for (const tok of tokens) {
      if (!cur) {
        if (!/^\s+$/.test(tok)) cur = tok
        continue
      }
      if (displayWidth(cur + tok) > maxW && !/^\s+$/.test(tok)) {
        out.push(cur.trim())
        cur = tok
      } else {
        cur += tok
      }
    }
    if (cur.trim()) out.push(cur.trim())
    return out
  }

  const parts = []
  for (const sent of rawSentences.length > 0 ? rawSentences : [clean]) {
    const cleanSent = stripTailPunct(sent)
    if (displayWidth(cleanSent) <= maxW + 2) {
      if (cleanSent) parts.push(cleanSent)
      continue
    }
    const subChunks = sent
      .split(/(?<=[，,、：:])/)
      .map((c) => stripTailPunct(c))
      .filter(Boolean)
    for (const c of subChunks) {
      if (parts.length > 0 && c.length <= 4 && displayWidth(`${parts[parts.length - 1]} ${c}`) <= maxW + 3) {
        parts[parts.length - 1] = `${parts[parts.length - 1]} ${c}`
      } else if (displayWidth(c) > maxW + 4) {
        parts.push(...wrapClauseRespectingWords(c, maxW))
      } else {
        parts.push(c)
      }
    }
  }

  const finalParts = parts.length > 0 ? parts : [stripTailPunct(clean) || clean]
  const totalWeight = finalParts.reduce(
    (acc, s) => acc + Math.max(1, s.replace(/[^\w\u4e00-\u9fa5]/g, '').length),
    0,
  )

  let cursorSec = 0
  return finalParts.map((text, idx) => {
    const weight = Math.max(1, text.replace(/[^\w\u4e00-\u9fa5]/g, '').length)
    const isLast = idx === finalParts.length - 1
    const segDur = isLast
      ? Math.max(0.1, Number((durationSec - cursorSec).toFixed(3)))
      : Number(((durationSec * weight) / totalWeight).toFixed(3))
    const startSec = Number(cursorSec.toFixed(3))
    const endSec = Number((isLast ? durationSec : cursorSec + segDur).toFixed(3))
    cursorSec = endSec
    return {
      index: idx + 1,
      text,
      startSec,
      endSec,
      startFrame: Math.floor(startSec * fps),
      endFrame: Math.ceil(endSec * fps),
    }
  })
}

const stripSubNorm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\s，。！？；、,!?;:："'""''·｜|\-—_()（）【】\[\]]+/g, '')

/**
 * Guarantee displayed subtitles match the actual spoken narration words in sequential order.
 * Rejects paraphrased slogan chunks that diverge from the audio transcript.
 */
export function deriveVerbalSubtitleParts(narration, subChunks = null, subtitleText = '', maxLineWidth = 16) {
  const cleanNar = sanitizeSpokenNarration(narration)
  const normNar = stripSubNorm(cleanNar)

  if (Array.isArray(subChunks) && subChunks.length > 0) {
    const cleanChunks = subChunks.map((c) => sanitizeSpokenNarration(c)).filter(Boolean)
    if (cleanChunks.length > 0) {
      if (!normNar) return cleanChunks
      const normChunks = stripSubNorm(cleanChunks.join(''))
      // Check sequential overlap: ensure chunks cover at least 75% of spoken characters
      let matchedChars = 0
      let pos = 0
      for (const ch of normChunks) {
        const hit = normNar.indexOf(ch, pos)
        if (hit >= 0) {
          matchedChars++
          pos = hit + 1
        }
      }
      const coverage = matchedChars / Math.max(1, normNar.length)
      const ratio = normChunks.length / Math.max(1, normNar.length)
      if (coverage >= 0.72 && ratio >= 0.72 && ratio <= 1.28) {
        return cleanChunks
      }
    }
  }

  const fallbackSrc = cleanNar || String(subtitleText || '').trim()
  if (!fallbackSrc) return []
  return buildSentenceSubtitles(fallbackSrc, 10, 30, { maxLineWidth }).map((s) => s.text)
}

/**
 * Detect acoustic pause midpoints and true speech onset/end inside a speech WAV via FFmpeg silencedetect.
 */
export async function detectSpeechPauses(audioPath, totalDurationSec = 0) {
  const result = {
    onsetSec: 0,
    speechEndSec: totalDurationSec,
    pauseMidpoints: [],
  }
  if (!audioPath || !existsSync(audioPath)) return result

  try {
    const { ffmpeg } = resolveBinaries()
    const res = await runCommandRedirected(
      ffmpeg,
      [
        '-hide_banner',
        '-i',
        audioPath,
        '-af',
        'silencedetect=noise=-38dB:d=0.14',
        '-f',
        'null',
        process.platform === 'win32' ? 'NUL' : '/dev/null',
      ],
      { timeoutMs: 25_000 },
    )
    const log = `${res.stderr || ''}\n${res.stdout || ''}`
    const intervals = []
    let curStart = null
    for (const line of log.split(/\r?\n/)) {
      const sm = /silence_start:\s*([\d.]+)/i.exec(line)
      if (sm) curStart = Number(sm[1])
      const em = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/i.exec(line)
      if (em) {
        const end = Number(em[1])
        const dur = Number(em[2])
        const start = curStart !== null ? curStart : Math.max(0, end - dur)
        intervals.push({ start, end, dur, mid: Number(((start + end) / 2).toFixed(3)) })
        curStart = null
      }
    }
    if (curStart !== null && totalDurationSec > curStart) {
      intervals.push({
        start: curStart,
        end: totalDurationSec,
        dur: totalDurationSec - curStart,
        mid: Number(((curStart + totalDurationSec) / 2).toFixed(3)),
      })
    }

    if (intervals.length > 0 && intervals[0].start <= 0.08 && intervals[0].end < totalDurationSec * 0.45) {
      result.onsetSec = Math.max(0, Number((intervals[0].end - 0.04).toFixed(3)))
    }
    const last = intervals[intervals.length - 1]
    if (last && totalDurationSec > 0 && Math.abs(last.end - totalDurationSec) <= 0.18 && last.start > result.onsetSec + 0.35) {
      result.speechEndSec = Math.max(result.onsetSec + 0.35, Number((last.start + 0.05).toFixed(3)))
    }
    result.pauseMidpoints = intervals
      .filter((iv) => iv.mid > result.onsetSec + 0.25 && iv.mid < (result.speechEndSec || totalDurationSec) - 0.25)
      .map((iv) => iv.mid)
  } catch {}
  return result
}

/**
 * Align exact sequential spoken subtitle parts onto acoustic pause midpoints in the actual TTS/mastered WAV.
 */
export async function alignSubtitlesToSpeechAudio({
  audioPath = '',
  narration = '',
  subtitleText = '',
  subChunks = null,
  leadSec = 0.35,
  durationSec = 0,
  fps = 30,
  maxLineWidth = 16,
} = {}) {
  const safeFps = Number(fps) > 0 ? Number(fps) : 30
  const dur = Math.max(0.2, Number(durationSec) || 0)
  const parts = deriveVerbalSubtitleParts(narration, subChunks, subtitleText, maxLineWidth)
  if (parts.length === 0) return []

  const pauses = await detectSpeechPauses(audioPath, dur)
  const onset = Math.max(0, Math.min(dur * 0.35, Number(pauses.onsetSec || 0)))
  const finish = Math.max(onset + 0.3, Math.min(dur, Number(pauses.speechEndSec || dur)))
  const activeDur = Math.max(0.3, finish - onset)

  if (parts.length === 1) {
    const s0 = Number(leadSec.toFixed(3))
    const s1 = Number((leadSec + Math.max(finish, onset + 0.4)).toFixed(3))
    const sf = Math.floor(s0 * safeFps)
    const ef = Math.max(sf + 1, Math.ceil(s1 * safeFps))
    return [{ index: 1, text: parts[0], startSec: s0, endSec: s1, startFrame: sf, endFrame: ef }]
  }

  const weights = parts.map((c) => Math.max(2, c.replace(/[^\w\u4e00-\u9fa5]/g, '').length))
  const totalW = weights.reduce((a, b) => a + b, 0) || 1
  const rawBoundaries = [onset]
  let accW = 0
  for (let i = 0; i < parts.length - 1; i++) {
    accW += weights[i]
    rawBoundaries.push(onset + (activeDur * accW) / totalW)
  }
  rawBoundaries.push(finish)

  // Snap internal boundaries onto nearest unclaimed FFmpeg-detected breath pauses with minimum readability floors
  const snapped = [onset]
  const usedPauseIdx = new Set()
  const maxSnapWindow = Math.max(0.45, activeDur * 0.24)
  const minDurFor = (idx) => Math.min(activeDur / parts.length, Math.max(0.72, weights[idx] * 0.085))
  for (let i = 1; i < parts.length; i++) {
    const target = rawBoundaries[i]
    const prevBound = snapped[i - 1]
    const prevMinDur = minDurFor(i - 1)
    let remMin = 0
    for (let k = i; k < parts.length; k++) remMin += minDurFor(k)
    const minBound = prevBound + prevMinDur
    const maxAllowed = Math.max(minBound, finish - remMin)
    const idealSpan = rawBoundaries[i] - rawBoundaries[i - 1]
    let bestMid = Math.max(minBound, Math.min(maxAllowed, target))
    let bestDist = Infinity
    let bestIdx = -1

    for (let pi = 0; pi < pauses.pauseMidpoints.length; pi++) {
      if (usedPauseIdx.has(pi)) continue
      const cand = pauses.pauseMidpoints[pi]
      if (cand < minBound || cand > maxAllowed) continue
      const candSpan = cand - prevBound
      if (candSpan < idealSpan * 0.48) continue
      const d = Math.abs(cand - target)
      if (d <= maxSnapWindow && d < bestDist) {
        bestDist = d
        bestMid = cand
        bestIdx = pi
      }
    }
    if (bestIdx >= 0) usedPauseIdx.add(bestIdx)
    snapped.push(Math.max(minBound, Math.min(maxAllowed, Number(bestMid.toFixed(3)))))
  }
  snapped.push(finish)

  return parts.map((text, ci) => {
    const s0 = Number((leadSec + (ci === 0 ? 0 : snapped[ci])).toFixed(3))
    const s1 = Number((leadSec + (ci === parts.length - 1 ? dur : snapped[ci + 1])).toFixed(3))
    const sf = Math.floor(s0 * safeFps)
    const ef = Math.max(sf + 1, Math.ceil(s1 * safeFps))
    return {
      index: ci + 1,
      text,
      startSec: s0,
      endSec: s1,
      startFrame: sf,
      endFrame: ef,
    }
  })
}

/**
 * Ensure Windows 11 project guards (`.npmrc` with local cache to prevent sandbox `EPERM`).
 */
export function ensureWin11ProjectGuards(projectDir) {
  const absDir = resolve(projectDir)
  if (!existsSync(absDir)) {
    mkdirSync(absDir, { recursive: true })
  }
  const npmrcPath = join(absDir, '.npmrc')
  if (!existsSync(npmrcPath)) {
    writeFileSync(
      npmrcPath,
      [
        '# Auto-generated by DSH Video Workbench for Windows 11 sandbox EPERM protection',
        'cache=./.npm-cache',
        'prefer-offline=true',
        'fund=false',
        'audit=false',
        '',
      ].join('\n'),
      'utf8',
    )
  }
  syncProjectFonts(absDir)
  return { npmrcPath }
}

/**
 * Read and normalize `script.json` from a project directory or explicit file path.
 */
export function resolveScriptJsonPath(projectOrFile) {
  const abs = resolve(projectOrFile)
  if (existsSync(abs) && statSync(abs).isDirectory()) {
    return join(abs, 'script.json')
  }
  if (abs.toLowerCase().endsWith('.json')) {
    return abs
  }
  return join(abs, 'script.json')
}

export function readScriptJson(projectOrFile) {
  const scriptPath = resolveScriptJsonPath(projectOrFile)
  if (!existsSync(scriptPath)) {
    throw new Error(`script.json not found at: ${scriptPath}`)
  }
  const data = JSON.parse(readFileSync(scriptPath, 'utf8'))
  return { scriptPath, projectDir: dirname(scriptPath), data }
}

export function writeScriptJson(projectOrFile, scriptData) {
  const scriptPath = resolveScriptJsonPath(projectOrFile)
  const projectDir = dirname(scriptPath)
  ensureWin11ProjectGuards(projectDir)

  const fps = Number(scriptData.fps) > 0 ? Number(scriptData.fps) : 30
  const resolvedWidth = Number(scriptData.width) || 1920
  const resolvedHeight = Number(scriptData.height) || 1080
  const subtitleMaxW = resolvedWidth < resolvedHeight ? 11 : resolvedWidth === resolvedHeight ? 13 : 16
  let currentFrame = 0
  let currentSec = 0

  if (Array.isArray(scriptData.scenes)) {
    scriptData.scenes = scriptData.scenes.map((scene, idx) => {
      const durationSec = Number(scene.durationSec || 4)
      const durationInFrames =
        Number(scene.durationInFrames) > 0
          ? Number(scene.durationInFrames)
          : Math.max(1, Math.ceil(durationSec * fps))
      const startFrame = currentFrame
      const startSec = Number(currentSec.toFixed(3))
      currentFrame += durationInFrames
      currentSec += durationSec

      const buildChunkedSubtitles = (chunks) => {
        const cleanChunks = chunks.map((c) => String(c || '').trim()).filter(Boolean)
        if (cleanChunks.length === 0) return []
        const weights = cleanChunks.map((c) => Math.max(2, c.replace(/[^\w\u4e00-\u9fa5]/g, '').length))
        const sumW = weights.reduce((a, b) => a + b, 0) || 1
        let cSec = 0
        return cleanChunks.map((text, ci) => {
          const isLast = ci === cleanChunks.length - 1
          const seg = isLast ? Math.max(0.1, Number((durationSec - cSec).toFixed(3))) : Number(((durationSec * weights[ci]) / sumW).toFixed(3))
          const s0 = Number(cSec.toFixed(3))
          const s1 = Number((isLast ? durationSec : cSec + seg).toFixed(3))
          cSec = s1
          return {
            index: ci + 1,
            text,
            startSec: s0,
            endSec: s1,
            startFrame: Math.floor(s0 * fps),
            endFrame: Math.ceil(s1 * fps),
          }
        })
      }

      const resolvedParts = deriveVerbalSubtitleParts(
        scene.narration ?? scene.text ?? '',
        scene.subChunks,
        scene.subtitleText || scene.caption || '',
        subtitleMaxW,
      )
      const subtitles =
        Array.isArray(scene.subtitles) && scene.subtitles.length > 0
          ? scene.subtitles
          : resolvedParts.length > 0
            ? buildChunkedSubtitles(resolvedParts)
            : buildSentenceSubtitles(scene.narration || scene.text || scene.subtitleText || '', durationSec, fps, {
                maxLineWidth: subtitleMaxW,
              })

      return {
        id: scene.id || `scene-${String(idx + 1).padStart(2, '0')}`,
        index: idx + 1,
        title: scene.title || `分镜 ${idx + 1}`,
        narration: scene.narration ?? scene.text ?? '',
        emotion: scene.emotion || '平静',
        role: scene.role || 'narrator',
        voiceId: scene.voiceId || scriptData.defaultVoiceId || 'auto',
        voiceLocked: Boolean(scene.voiceLocked),
        voiceMatchReason: scene.voiceMatchReason || '',
        visualPrompt: scene.visualPrompt || '',
        audioFile: scene.audioFile || '',
        durationSec: Number(durationSec.toFixed(4)),
        durationInFrames,
        startFrame,
        startSec,
        subtitles,
        ...scene,
        durationSec: Number(durationSec.toFixed(4)),
        durationInFrames,
        startFrame,
        startSec,
        subtitles,
      }
    })
  }

  scriptData.fps = fps
  scriptData.width = resolvedWidth
  scriptData.height = resolvedHeight
  if (!scriptData.aspectRatio) {
    scriptData.aspectRatio =
      resolvedWidth < resolvedHeight
        ? Math.abs(resolvedWidth / resolvedHeight - 0.75) < 0.05
          ? '3:4'
          : '9:16'
        : resolvedWidth === resolvedHeight
          ? '1:1'
          : '16:9'
  }
  scriptData.quality = scriptData.quality || (Math.min(resolvedWidth, resolvedHeight) <= 720 ? '720p' : '1080p')
  scriptData.engine = scriptData.engine === 'remotion' ? 'remotion' : 'html'
  scriptData.voiceMode = scriptData.voiceMode === 'manual' ? 'manual' : 'auto'
  scriptData.defaultVoiceId = scriptData.defaultVoiceId || 'auto'
  scriptData.totalDurationSec = Number(currentSec.toFixed(4))
  scriptData.totalDurationInFrames = currentFrame
  scriptData.updatedAt = new Date().toISOString()

  writeFileSync(scriptPath, JSON.stringify(scriptData, null, 2) + '\n', 'utf8')

  // Automatically keep embedded `#dsh-script-data` in `index.html` synchronized with `script.json`
  const htmlPath = join(projectDir, 'index.html')
  if (existsSync(htmlPath)) {
    try {
      const htmlContent = readFileSync(htmlPath, 'utf8')
      const scriptTagPattern = /(<script\s+id=["']dsh-script-data["']\s+type=["']application\/json["']>)([\s\S]*?)(<\/script>)/i
      if (scriptTagPattern.test(htmlContent)) {
        const syncedHtml = htmlContent.replace(
          scriptTagPattern,
          `$1\n${JSON.stringify(scriptData, null, 2)}\n  $3`,
        )
        if (syncedHtml !== htmlContent) {
          writeFileSync(htmlPath, syncedHtml, 'utf8')
        }
      }
    } catch {}
  }

  return { scriptPath, projectDir, data: scriptData }
}

export * from './compliance.js'
