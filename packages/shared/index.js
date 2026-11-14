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
 * Spawn a child process using file-redirected stdio to avoid Windows sandbox pipe `EPERM`.
 * Adapted from MIT-licensed `dsh-video-studio/dsh/ffmpeg.js`.
 */
export function runCommandRedirected(bin, args = [], options = {}) {
  const { cwd = REPO_ROOT, env = process.env, timeoutMs = 180_000 } = options
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

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled) return
        settled = true
        try { child.kill() } catch {}
        const { stdout, stderr } = cleanupAndRead()
        rejectPromise(new Error(`Command timed out after ${timeoutMs}ms: ${bin}\n${stderr || stdout}`))
      }, timeoutMs)
    }

    child.on('error', (err) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      cleanupAndRead()
      rejectPromise(err)
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
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

/**
 * Split narration text into clean single-line subtitle cues proportional to character count.
 * Splits long sentences cleanly at commas/pauses (~16 CJK chars max) and strips trailing punctuation.
 */
export function buildSentenceSubtitles(narration, durationSec, fps = 30) {
  const clean = String(narration || '').trim()
  if (!clean || durationSec <= 0) return []

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
    if (displayWidth(cleanSent) <= 18) {
      if (cleanSent) parts.push(cleanSent)
      continue
    }
    const subChunks = sent
      .split(/(?<=[，,、：:])/)
      .map((c) => stripTailPunct(c))
      .filter(Boolean)
    for (const c of subChunks) {
      if (parts.length > 0 && c.length <= 4 && displayWidth(`${parts[parts.length - 1]} ${c}`) <= 19) {
        parts[parts.length - 1] = `${parts[parts.length - 1]} ${c}`
      } else if (displayWidth(c) > 20) {
        parts.push(...wrapClauseRespectingWords(c, 16))
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

      const subtitles =
        Array.isArray(scene.subtitles) && scene.subtitles.length > 0
          ? scene.subtitles
          : buildSentenceSubtitles(scene.narration || scene.text || '', durationSec, fps)

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
  scriptData.width = Number(scriptData.width) || 1920
  scriptData.height = Number(scriptData.height) || 1080
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
