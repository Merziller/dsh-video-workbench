/**
 * Footage index — "看懂素材库": splits every imported video into shots and measures each one, so long uploads are
 * not always played from their first second.
 *
 *   - shots: FFmpeg scene-change detection on a small copy of the picture (cuts inside the recording), merged when
 *     shorter than `minShotSec`, split into pieces of at most `maxShotSec` (a long take still offers several windows)
 *   - per shot: a thumbnail, exposure (brightness / contrast), sharpness (variance of the Laplacian), motion (picture
 *     change across the shot), loudness, and — when the local speech engine is installed — what is said in it
 *   - a quality score that prefers sharp, well exposed, steady shots
 *
 * Everything runs locally (FFmpeg + optional local speech recognition): no model calls, no cost. The result is kept
 * on the asset in `assets.json` (`item.footage`) and re-used until the file changes. `pickSegment` / `planFootage`
 * choose an in / out window for a scene of a given length without reusing a shot until the library runs out.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createAbortError, REPO_ROOT, resolveBinaries, runCommandRedirected } from '../shared/index.js'
import { readAssets, writeAssets } from './asset-manager.js'

export const FOOTAGE_INDEX_VERSION = 1
export const FOOTAGE_DEFAULTS = Object.freeze({
  sceneThreshold: 0.32,
  minShotSec: 0.8,
  maxShotSec: 8,
  thumbWidth: 320,
  statWidth: 160,
  samplesPerShot: 3,
  concurrency: 3,
})

const r3 = (v) => Number(Number(v || 0).toFixed(3))
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))

/* ------------------------------------------------------------------------------------------------ pure helpers */

/** Parse `pts_time:` of the frames FFmpeg's showinfo printed (the selected scene changes), sorted and de-duplicated. */
export function parseSceneTimes(stderr) {
  const out = []
  for (const m of String(stderr || '').matchAll(/pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
    const t = Number(m[1])
    if (Number.isFinite(t) && t > 0) out.push(t)
  }
  return [...new Set(out.map((t) => r3(t)))].sort((a, b) => a - b)
}

/**
 * Cut points → shots covering [0, durationSec]: cuts closer than `minShotSec` to the previous one (or to the end) are
 * dropped, then every shot longer than `maxShotSec` is split into equal pieces (each a usable window on its own).
 * Shots carry `take` (index of the recorded take they come from) so pieces of one take can be told apart.
 */
export function buildShots(cutTimes, durationSec, { minShotSec = FOOTAGE_DEFAULTS.minShotSec, maxShotSec = FOOTAGE_DEFAULTS.maxShotSec } = {}) {
  const dur = Math.max(0, Number(durationSec) || 0)
  if (dur <= 0) return []
  const cuts = []
  let prev = 0
  for (const t of [...(cutTimes || [])].map(Number).filter((t) => Number.isFinite(t)).sort((a, b) => a - b)) {
    if (t - prev >= minShotSec && dur - t >= minShotSec) {
      cuts.push(t)
      prev = t
    }
  }
  const takes = []
  let s = 0
  for (const c of [...cuts, dur]) {
    takes.push({ start: s, end: c })
    s = c
  }
  const shots = []
  takes.forEach((tk, take) => {
    const len = tk.end - tk.start
    const pieces = Math.max(1, Math.ceil(len / Math.max(minShotSec * 2, maxShotSec) - 1e-9))
    for (let k = 0; k < pieces; k++) {
      const a = tk.start + (len * k) / pieces
      const b = k === pieces - 1 ? tk.end : tk.start + (len * (k + 1)) / pieces
      shots.push({ i: shots.length, take, start: r3(a), end: r3(b), dur: r3(b - a) })
    }
  })
  return shots
}

/**
 * Picture statistics from small grayscale frames (row-major, one byte per pixel): brightness / contrast of the middle
 * frame (0..1), sharpness = variance of its 4-neighbour Laplacian mapped to 0..1 (log scale), motion = mean absolute
 * difference between consecutive frames (0..1).
 */
export function frameStats(frames, width, height) {
  const list = (frames || []).filter((f) => f && f.length >= width * height)
  if (!list.length || width < 3 || height < 3) return { brightness: 0, contrast: 0, sharpness: 0, motion: 0 }
  const mid = list[Math.floor(list.length / 2)]
  const n = width * height
  let sum = 0
  for (let p = 0; p < n; p++) sum += mid[p]
  const mean = sum / n
  let varSum = 0
  for (let p = 0; p < n; p++) varSum += (mid[p] - mean) ** 2
  const std = Math.sqrt(varSum / n)
  let lapSum = 0
  let lapSq = 0
  let cnt = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      const l = mid[p - 1] + mid[p + 1] + mid[p - width] + mid[p + width] - 4 * mid[p]
      lapSum += l
      lapSq += l * l
      cnt++
    }
  }
  const lapMean = lapSum / cnt
  const lapVar = lapSq / cnt - lapMean * lapMean
  let motion = 0
  if (list.length > 1) {
    let diffs = 0
    for (let k = 1; k < list.length; k++) {
      let d = 0
      const a = list[k - 1]
      const b = list[k]
      for (let p = 0; p < n; p++) d += Math.abs(a[p] - b[p])
      diffs += d / n
    }
    motion = diffs / (list.length - 1) / 255
  }
  return {
    brightness: r3(mean / 255),
    contrast: r3(std / 128),
    sharpness: r3(clamp01(Math.log10(1 + Math.max(0, lapVar)) / 3.2)),
    motion: r3(clamp01(motion * 4)),
  }
}

/**
 * 0..1 quality: sharp, well exposed, with some contrast and steady enough. Very dark / blown out, flat (a wall, a
 * black frame) or blurred-and-shaking shots score low.
 */
export function scoreShot(st = {}) {
  const b = Number(st.brightness) || 0
  const exposure = b < 0.08 || b > 0.94 ? 0 : b < 0.18 ? (b - 0.08) / 0.1 : b > 0.85 ? (0.94 - b) / 0.09 : 1
  const contrast = clamp01((Number(st.contrast) || 0) / 0.32)
  const sharp = clamp01(Number(st.sharpness) || 0)
  const motion = Number(st.motion) || 0
  const steady = motion <= 0.35 ? 1 : clamp01(1 - (motion - 0.35) / 0.5)
  return r3(0.38 * sharp + 0.27 * exposure + 0.17 * contrast + 0.18 * steady)
}

/** RMS level (dBFS, -90 floor) of a span of a mono s16 PCM buffer. */
export function spanLoudness(pcm, sampleRate, start, end) {
  if (!pcm || !pcm.length) return -90
  const total = Math.floor(pcm.length / 2)
  const a = Math.max(0, Math.floor(start * sampleRate))
  const b = Math.min(total, Math.ceil(end * sampleRate))
  if (b <= a) return -90
  let acc = 0
  for (let i = a; i < b; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768
    acc += v * v
  }
  const rms = Math.sqrt(acc / (b - a))
  return rms > 0 ? Math.max(-90, r3(20 * Math.log10(rms))) : -90
}

/** Attach recognised speech (segments with start / end / text) to the shots they overlap. */
export function attachSpeech(shots, segments) {
  const segs = (segments || []).filter((s) => s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && String(s.text || '').trim())
  for (const sh of shots) {
    const texts = []
    let secs = 0
    for (const sg of segs) {
      const ov = Math.min(sh.end, Number(sg.end)) - Math.max(sh.start, Number(sg.start))
      if (ov <= 0) continue
      secs += ov
      // a segment shared by several shots is quoted where most of it lies
      const len = Math.max(0.001, Number(sg.end) - Number(sg.start))
      if (ov / len >= 0.5 || ov >= 1.2) texts.push(String(sg.text).trim())
    }
    sh.speechSec = r3(secs)
    if (texts.length) sh.speech = texts.join(' ').slice(0, 240)
  }
  return shots
}

/**
 * Choose an in / out window of `needSec` for one scene from an indexed asset.
 *   mode 'quality' (default) — the best looking unused shot that is long enough
 *   mode 'speech'            — prefer shots where someone talks (vlog / interview pieces)
 *   mode 'quiet'             — prefer shots without speech (B-roll under a voice-over)
 *   mode 'action'            — prefer lively shots (highlights, beat cuts)
 * `used` is a Set of `${assetId}#${shotIndex}` already placed; shots are only reused when every one is taken.
 * Returns null when the asset has no footage index.
 */
export function pickSegment(item, needSec, { used = new Set(), mode = 'quality' } = {}) {
  const shots = item?.footage?.shots
  if (!Array.isArray(shots) || !shots.length) return null
  const need = Math.max(0.2, Number(needSec) || 0)
  const bonus = (s) => {
    const talk = clamp01((Number(s.speechSec) || 0) / Math.max(0.5, s.dur))
    if (mode === 'speech') return 0.35 * talk
    if (mode === 'quiet') return -0.35 * talk
    if (mode === 'action') return 0.3 * clamp01((Number(s.motion) || 0) / 0.4)
    return 0
  }
  const rank = (s) => (Number(s.quality) || 0) + bonus(s) + (s.dur + 0.05 >= need ? 0.25 : -0.25 * (1 - s.dur / need))
  const key = (s) => `${item.id}#${s.i}`
  let pool = shots.filter((s) => !used.has(key(s)))
  if (!pool.length) pool = shots
  const best = [...pool].sort((a, b) => rank(b) - rank(a) || a.i - b.i)[0]
  used.add(key(best))
  // skip the first frames after a cut (motion blur, exposure settling) when there is room
  const room = Math.max(0, best.dur - need)
  const lead = Math.min(0.25, room / 2)
  const inSec = r3(best.start + lead)
  const outSec = r3(Math.min(best.end, inSec + need))
  return { assetId: item.id, shotIndex: best.i, inSec, outSec, fits: best.dur + 0.05 >= need }
}

/** Compact shot list of one asset for a planning prompt (one line per shot, best first when truncated). */
export function describeFootageForPrompt(item, { maxShots = 24 } = {}) {
  const shots = item?.footage?.shots
  if (!Array.isArray(shots) || !shots.length) return ''
  const chosen = shots.length <= maxShots ? shots : [...shots].sort((a, b) => (b.quality || 0) - (a.quality || 0)).slice(0, maxShots).sort((a, b) => a.i - b.i)
  const tag = (s) => {
    const t = []
    if ((s.brightness || 0) < 0.18) t.push('偏暗')
    if ((s.sharpness || 0) < 0.35) t.push('偏糊')
    if ((s.motion || 0) > 0.45) t.push('晃动大')
    else if ((s.motion || 0) > 0.18) t.push('有动作')
    else t.push('稳定')
    return t.join('/')
  }
  const lines = chosen.map((s) => `#${s.i} ${s.start.toFixed(1)}-${s.end.toFixed(1)}s 质量${Math.round((s.quality || 0) * 100)} ${tag(s)}${s.speech ? ` 说：「${s.speech.slice(0, 60)}」` : ''}`)
  return `${item.originalName || item.name}（${Math.round(Number(item.durationSec) || 0)} 秒，${shots.length} 个镜头）\n${lines.join('\n')}`
}

/* ------------------------------------------------------------------------------------------------ ffmpeg side */

function fileKey(abs) {
  const st = statSync(abs)
  return createHash('sha1').update(`${st.size}:${Math.round(st.mtimeMs)}:${FOOTAGE_INDEX_VERSION}`).digest('hex').slice(0, 12)
}

async function detectCuts(ffmpeg, abs, { threshold, signal, onChild, timeoutMs }) {
  const res = await runCommandRedirected(
    ffmpeg,
    ['-hide_banner', '-nostats', '-i', abs, '-map', '0:v:0', '-an', '-sn', '-vf', `scale=192:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
    { timeoutMs, signal, onChild },
  )
  if (res.code !== 0) throw new Error(`镜头检测失败：${String(res.stderr || '').trim().split(/\r?\n/).slice(-2).join(' | ')}`)
  return parseSceneTimes(res.stderr)
}

async function readAudioEnvelope(ffmpeg, abs, tmp, { signal, onChild, timeoutMs }) {
  const out = join(tmp, 'audio.s16')
  const res = await runCommandRedirected(ffmpeg, ['-hide_banner', '-nostats', '-y', '-i', abs, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', out], { timeoutMs, signal, onChild })
  if (res.code !== 0 || !existsSync(out)) return null
  return readFileSync(out)
}

async function measureShot(ffmpeg, abs, shot, { tmp, thumbAbs, statWidth, thumbWidth, samples, signal, onChild }) {
  const span = Math.max(0.1, shot.dur)
  const at = (k) => shot.start + (span * (k + 0.5)) / samples
  const raw = join(tmp, `shot-${shot.i}.gray`)
  // a few evenly spread frames of the shot, small and grayscale, for the statistics
  const pick = Array.from({ length: samples }, (_, k) => r3(at(k)))
  const frames = []
  let w = 0
  let h = 0
  for (const t of pick) {
    const res = await runCommandRedirected(
      ffmpeg,
      ['-hide_banner', '-nostats', '-y', '-ss', String(t), '-i', abs, '-map', '0:v:0', '-frames:v', '1', '-vf', `scale=${statWidth}:-2,format=gray`, '-f', 'rawvideo', raw],
      { timeoutMs: 60_000, signal, onChild },
    )
    if (res.code !== 0 || !existsSync(raw)) continue
    if (!w) {
      const m = /Output #0[\s\S]*?Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(res.stderr || '')
      if (m) {
        w = Number(m[1])
        h = Number(m[2])
      }
    }
    frames.push(readFileSync(raw))
    rmSync(raw, { force: true })
  }
  if (!w && frames.length) {
    w = statWidth
    h = Math.floor(frames[0].length / statWidth)
  }
  const stats = frameStats(frames, w, h)
  const res = await runCommandRedirected(
    ffmpeg,
    ['-hide_banner', '-nostats', '-y', '-ss', String(r3(shot.start + span / 2)), '-i', abs, '-map', '0:v:0', '-frames:v', '1', '-vf', `scale=${thumbWidth}:-2`, '-q:v', '5', thumbAbs],
    { timeoutMs: 60_000, signal, onChild },
  )
  return { ...stats, thumbOk: res.code === 0 && existsSync(thumbAbs) }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const k = next++
      out[k] = await fn(items[k], k)
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Index the project's videos (all, or `assetIds`). Re-uses an index while the file is unchanged unless `force`.
 * `transcribe`: 'auto' (use the local speech engine when it is installed), 'on' (required), 'off'.
 */
export async function indexFootage({ projectDir, assetIds = null, force = false, transcribe = 'auto', options = {}, signal, onChild, onProgress } = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)
  const opts = { ...FOOTAGE_DEFAULTS, ...(options || {}) }
  const { ffmpeg } = resolveBinaries()
  const manifest = readAssets(absDir)
  const wanted = Array.isArray(assetIds) && assetIds.length ? new Set(assetIds) : null
  const videos = (manifest.items || []).filter((it) => it.type === 'video' && (!wanted || wanted.has(it.id)))
  const done = []
  const skipped = []
  let speechApi = null
  if (transcribe !== 'off') {
    try {
      speechApi = await import('./speech-recognition.js')
      const st = await speechApi.getAsrStatus()
      if (!st.ready) {
        if (transcribe === 'on') throw Object.assign(new Error(st.reason || '本地语音识别引擎未安装'), { code: 'ASR_NOT_INSTALLED' })
        speechApi = null
      }
    } catch (err) {
      if (transcribe === 'on') throw err
      speechApi = null
    }
  }
  for (let vi = 0; vi < videos.length; vi++) {
    if (signal?.aborted) throw createAbortError()
    const item = videos[vi]
    const abs = isAbsolute(item.path) ? item.path : join(absDir, item.path)
    if (!existsSync(abs)) {
      skipped.push({ assetId: item.id, reason: '文件不存在' })
      continue
    }
    const key = fileKey(abs)
    if (!force && item.footage?.key === key && Array.isArray(item.footage.shots) && item.footage.shots.length) {
      skipped.push({ assetId: item.id, reason: '已分析（文件未变）' })
      continue
    }
    const label = item.originalName || item.name || item.id
    const report = (pct, message) => onProgress?.({ progress: Math.round(((vi + pct / 100) / videos.length) * 100), message: `${label}：${message}`, assetId: item.id })
    const dur = Number(item.durationSec) || 0
    const timeoutMs = Math.max(120_000, Math.round(dur * 3000))
    report(2, '正在检测镜头切换…')
    const cuts = await detectCuts(ffmpeg, abs, { threshold: opts.sceneThreshold, signal, onChild, timeoutMs })
    const shots = buildShots(cuts, dur, opts)
    const tmp = join(REPO_ROOT, '.tmp', 'footage', `${item.id}-${process.pid}-${Date.now()}`)
    mkdirSync(tmp, { recursive: true })
    const thumbDir = join(absDir, 'assets', '.footage', item.id)
    rmSync(thumbDir, { recursive: true, force: true })
    mkdirSync(thumbDir, { recursive: true })
    try {
      let measured = 0
      await mapLimit(shots, opts.concurrency, async (sh) => {
        if (signal?.aborted) throw createAbortError()
        const thumbRel = `assets/.footage/${item.id}/shot-${String(sh.i).padStart(3, '0')}.jpg`
        const st = await measureShot(ffmpeg, abs, sh, { tmp, thumbAbs: join(absDir, thumbRel), statWidth: opts.statWidth, thumbWidth: opts.thumbWidth, samples: opts.samplesPerShot, signal, onChild })
        Object.assign(sh, { brightness: st.brightness, contrast: st.contrast, sharpness: st.sharpness, motion: st.motion, thumb: st.thumbOk ? thumbRel : '' })
        sh.quality = scoreShot(sh)
        measured++
        report(10 + Math.round((measured / shots.length) * 70), `正在分析第 ${measured}/${shots.length} 个镜头…`)
      })
      if (item.hasAudio) {
        report(82, '正在测量声音…')
        const pcm = await readAudioEnvelope(ffmpeg, abs, tmp, { signal, onChild, timeoutMs })
        if (pcm) for (const sh of shots) sh.loudness = spanLoudness(pcm, 8000, sh.start, sh.end)
        if (speechApi) {
          report(88, '正在识别说话内容（本地语音识别）…')
          try {
            const tr = await speechApi.transcribeMedia({ mediaPath: abs, projectDir: absDir, signal, onChild })
            attachSpeech(shots, tr?.segments || [])
          } catch (err) {
            if (transcribe === 'on') throw err
          }
        }
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    const speechSec = shots.reduce((a, s) => a + (Number(s.speechSec) || 0), 0)
    const footage = {
      version: FOOTAGE_INDEX_VERSION,
      key,
      analyzedAt: new Date().toISOString(),
      durationSec: dur,
      sceneThreshold: opts.sceneThreshold,
      takes: shots.length ? shots[shots.length - 1].take + 1 : 0,
      speechSec: r3(speechSec),
      shots,
    }
    // re-read: other writers (imports, proxies) may have touched the manifest meanwhile
    const cur = readAssets(absDir)
    const hit = (cur.items || []).find((x) => x.id === item.id)
    if (hit) {
      hit.footage = footage
      writeAssets(absDir, cur)
    }
    done.push({ assetId: item.id, name: label, shots: shots.length, takes: footage.takes, durationSec: dur, speechSec: footage.speechSec })
    report(100, `完成：${footage.takes} 段原始镜头 → ${shots.length} 个可用片段`)
  }
  return { ok: true, indexed: done, skipped }
}

/**
 * Plan in / out windows for a list of needs `[{ key, needSec, assetId?, mode? }]` across the indexed videos of the
 * project (or the one named by `assetId`), never reusing a shot while unused ones remain.
 * Returns `{ [key]: { assetId, path, shotIndex, inSec, outSec, fits } }`.
 */
/* ------------------------------------------------------------------------------------- scene media windows */

const VIDEO_EXT_RX = /\.(mp4|mov|m4v|webm|mkv|avi)$/i
const bigrams = (s) => {
  const t = String(s || '').replace(/[\s\p{P}\p{S}]+/gu, '')
  const out = new Set()
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2))
  return out
}
/** Share of the scene text's character pairs that also occur in what is said in the shot (0..1). */
function textAffinity(sceneGrams, speech) {
  if (!sceneGrams.size || !speech) return 0
  const g = bigrams(speech)
  if (!g.size) return 0
  let hit = 0
  for (const x of sceneGrams) if (g.has(x)) hit++
  return hit / sceneGrams.size
}

/**
 * Extend a window that is shorter than needed into the next shots of the same take (a long take split into pieces,
 * or a cut that is not a real change of place), so a long scene does not freeze on a short piece.
 */
function extendWithinTake(item, pick, needSec, used) {
  const shots = item.footage.shots
  let out = pick.outSec
  let k = pick.shotIndex
  while (out - pick.inSec + 0.05 < needSec && k + 1 < shots.length) {
    const cur = shots[k]
    const nxt = shots[k + 1]
    if (nxt.take !== cur.take || Math.abs(nxt.start - cur.end) > 0.12 || (nxt.quality || 0) < 0.25) break
    k++
    used.add(`${item.id}#${k}`)
    out = Math.min(nxt.end, pick.inSec + needSec)
  }
  return { ...pick, outSec: r3(out), lastShotIndex: k, fits: out - pick.inSec + 0.05 >= needSec }
}

/**
 * Choose where each scene's video clips start and stop (the 「长视频只用需要的那段」 fix). For every scene video whose
 * asset has a footage index and is clearly longer than the scene, picks the best matching window — sharp, steady,
 * well exposed, not used by another scene yet, and (when the shot's speech was recognised) about what the scene
 * says — and writes `trimStartSec` / `trimEndSec` on the media item. Windows the user set (no `trimAuto` flag) are
 * never touched; windows this function set earlier are re-chosen (scene lengths may have changed).
 * Returns { script, assigned, skipped } (the script object is updated in place and returned).
 */
export function assignFootageWindows(script, manifest, { fps = 0, minLongerBySec = 1, leadSec = 0 } = {}) {
  const items = (manifest?.items || []).filter((it) => it && it.type === 'video' && Array.isArray(it.footage?.shots) && it.footage.shots.length)
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []
  const f = Number(fps) || Number(script?.fps) || 30
  const byId = new Map(items.map((it) => [it.id, it]))
  const byPath = new Map()
  for (const it of items) for (const p of [it.path, it.editedPath, it.webPath, it.editedWebPath]) if (p) byPath.set(String(p).replace(/\\/g, '/').replace(/^\/+/, ''), it)
  const used = new Set()
  // windows chosen by the user (or kept from an earlier run) count as used first, so new picks avoid them
  for (const sc of scenes) {
    for (const m of Array.isArray(sc?.media) ? sc.media : []) {
      const it = byId.get(m?.assetId) || byPath.get(String(m?.path || '').replace(/\\/g, '/').replace(/^\/+/, ''))
      if (!it || m.trimAuto || !(Number(m.trimEndSec) > 0)) continue
      for (const s of it.footage.shots) if (s.end > Number(m.trimStartSec || 0) && s.start < Number(m.trimEndSec)) used.add(`${it.id}#${s.i}`)
    }
  }
  let assigned = 0
  let skipped = 0
  // every scene video, in the order they choose: scenes whose words match what is said in a shot go first, so a
  // generic scene cannot take "their" shot just because it comes earlier in the film
  const jobs = []
  scenes.forEach((sc, si) => {
    const media = Array.isArray(sc?.media) ? sc.media : []
    const videos = media.filter((m) => m && (m.type === 'video' || VIDEO_EXT_RX.test(String(m.path || ''))))
    if (!videos.length) return
    const grams = bigrams([sc.narration, sc.subtitleText, sc.subtitleLine, sc.title, sc.visualPrompt].filter(Boolean).join(' '))
    for (const m of videos) {
      const it = byId.get(m.assetId) || byPath.get(String(m.path || '').replace(/\\/g, '/').replace(/^\/+/, ''))
      const match = it ? Math.max(0, ...it.footage.shots.map((s) => textAffinity(grams, s.speech))) : 0
      jobs.push({ sc, si, m, it, grams, match })
    }
  })
  jobs.sort((a, b) => (b.match >= 0.3 ? 1 : 0) - (a.match >= 0.3 ? 1 : 0) || (b.match >= 0.3 ? b.match - a.match : 0) || a.si - b.si)
  for (const { sc, m, it, grams } of jobs) {
    const sceneSec = Number(sc.durationSec) > 0 ? Number(sc.durationSec) : Number(sc.durationInFrames) > 0 ? Number(sc.durationInFrames) / f : 4
    const userSet = !m.trimAuto && (Number(m.trimEndSec) > 0 || Number(m.trimStartSec) > 0)
    if (!it || userSet) {
      skipped++
      continue
    }
    const total = Number(it.footage.durationSec || it.durationSec) || 0
    // a little more than the scene: narration timing can still move the scene a bit
    const needSec = Math.max(0.5, sceneSec + Math.max(0, Number(leadSec) || 0))
    if (total > 0 && total <= needSec + minLongerBySec) {
      skipped++
      continue
    }
    const presenter = /presenter|talking|真人|出镜/i.test(String(m.role || it.role || ''))
    let best = null
    for (const s of it.footage.shots) {
      const trial = new Set(used)
      const p = pickSegment({ ...it, footage: { ...it.footage, shots: [s] } }, needSec, { used: trial, mode: presenter ? 'speech' : 'quality' })
      if (!p) continue
      const fit = s.dur + 0.05 >= needSec ? 0.25 : -0.25 * (1 - s.dur / needSec)
      const score = (s.quality || 0) + fit + 0.6 * textAffinity(grams, s.speech) - (used.has(`${it.id}#${s.i}`) ? 1 : 0)
      if (!best || score > best.score) best = { score, p }
    }
    if (!best) {
      skipped++
      continue
    }
    used.add(`${it.id}#${best.p.shotIndex}`)
    const win = best.p.fits ? best.p : extendWithinTake(it, best.p, needSec, used)
    m.trimStartSec = win.inSec
    m.trimEndSec = win.outSec
    m.trimAuto = true
    m.footageShot = win.shotIndex
    assigned++
  }
  return { script, assigned, skipped }
}

/**
 * Index the long videos a script uses (when not indexed yet) and choose their windows (assignFootageWindows).
 * `minDurationSec`: shorter clips are played whole and need no index. Speech is only recognised when asked
 * (`transcribe`), so this stays quick inside a planning step. Never throws: a failed index leaves the clips as they were.
 * Returns { script, assigned, indexed, errors }.
 */
export async function ensureFootageWindows({ projectDir, script, minDurationSec = 12, transcribe = 'off', signal, onChild, onProgress } = {}) {
  const absDir = resolve(projectDir)
  const errors = []
  let indexed = 0
  let manifest = readAssets(absDir)
  try {
    const usedIds = new Set()
    const usedPaths = new Set()
    for (const sc of script?.scenes || []) {
      for (const m of sc?.media || []) {
        if (m?.assetId) usedIds.add(m.assetId)
        if (m?.path) usedPaths.add(String(m.path).replace(/\\/g, '/').replace(/^\/+/, ''))
      }
    }
    const need = (manifest.items || []).filter(
      (it) =>
        it.type === 'video' &&
        (usedIds.has(it.id) || [it.path, it.editedPath].some((p) => p && usedPaths.has(String(p).replace(/\\/g, '/').replace(/^\/+/, '')))) &&
        Number(it.durationSec) >= minDurationSec &&
        !(Array.isArray(it.footage?.shots) && it.footage.shots.length),
    )
    if (need.length) {
      onProgress?.({ stage: 'footage', message: `正在看懂 ${need.length} 段长视频素材，挑出每个镜头要用的那一段…` })
      const r = await indexFootage({ projectDir: absDir, assetIds: need.map((it) => it.id), transcribe, signal, onChild })
      indexed = Array.isArray(r?.indexed) ? r.indexed.length : Number(r?.indexed) || 0
      manifest = readAssets(absDir)
    }
  } catch (err) {
    if (signal?.aborted) throw err
    errors.push(String(err?.message || err))
  }
  const res = assignFootageWindows(script, manifest, { fps: script?.fps })
  return { script: res.script, assigned: res.assigned, indexed, errors }
}

export function planFootage(manifest, needs, { mode = 'quality' } = {}) {
  const items = (manifest?.items || []).filter((it) => it.type === 'video' && Array.isArray(it.footage?.shots) && it.footage.shots.length)
  const used = new Set()
  const out = {}
  for (const n of needs || []) {
    const pool = n.assetId ? items.filter((it) => it.id === n.assetId) : items
    let best = null
    for (const it of pool) {
      const trial = new Set(used)
      const p = pickSegment(it, n.needSec, { used: trial, mode: n.mode || mode })
      if (!p) continue
      const shot = it.footage.shots[p.shotIndex]
      const score = (shot.quality || 0) + (p.fits ? 0.25 : 0) - (used.has(`${it.id}#${p.shotIndex}`) ? 1 : 0)
      if (!best || score > best.score) best = { score, p, it }
    }
    if (!best) continue
    used.add(`${best.it.id}#${best.p.shotIndex}`)
    out[n.key] = { ...best.p, path: best.it.editedPath || best.it.path }
  }
  return out
}
