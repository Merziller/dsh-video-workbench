/**
 * 卡通讲解员 (cartoon presenter) for 口播剪辑 / 录屏讲解 — a cartoon character from the user's library stands in a
 * corner of the cut and moves with the real voice: a little hop on every word, a lean while talking, breathing and a
 * soft sway in the pauses. Like the screen-tutorial videos where a cartoon host stands next to the recording.
 *
 *   - a still picture (PNG with a transparent background is best): a plain background (white, green …) is cut out
 *     automatically — only the background that touches the picture's edge is removed, so white eyes or a white shirt
 *     stay — and the empty margin is trimmed so the character stands on the bottom edge
 *   - a short video loop (e.g. a talking character made with a video AI on a plain background): cut out the same way,
 *     frame by frame, into a transparent WebM loop (mouth movement included)
 *   - a picture whose background is not plain stays a rounded card
 *
 * Motion comes from the cut's own voice: a loudness envelope (12.5 values per second) and the word start times of the
 * recognised speech. `mascotPose(m, t)` is the motion formula; the Remotion talk kit and the HTML draft use the same
 * numbers. Everything runs locally (FFmpeg + plain JavaScript): no model calls, no cost.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createAbortError, resolveBinaries } from '../shared/index.js'
import { MASCOT_SIZES } from './talk-pack.js'

export const MASCOT_VERSION = 1
export const MASCOT_ENV_HZ = 12.5
const STILL_MAX_SIDE = 1024
const VIDEO_MAX_H = 640
const VIDEO_MAX_SEC = 20
const VIDEO_MAX_FPS = 30
const KEY_TOL = 42 // colour distance (0..441) still counted as background
const KEY_SEED_TOL = 64 // border pixels this close to the key colour start the fill

const r3 = (v) => Number(Number(v || 0).toFixed(3))
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))

/* ------------------------------------------------------------------------------------------------ process helpers */

/** Run a binary, collect stdout as a Buffer (optionally feeding stdin). Rejects on a non-zero exit with stderr. */
function runBuffer(bin, args, { input = null, signal, onChild, timeoutMs = 300_000 } = {}) {
  if (signal?.aborted) return Promise.reject(createAbortError())
  return new Promise((resolveP, rejectP) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] })
    onChild?.(child)
    const out = []
    let err = ''
    let done = false
    const finish = (e, v) => {
      if (done) return
      done = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (e) rejectP(e)
      else resolveP(v)
    }
    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {}
      finish(createAbortError())
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      finish(new Error('处理超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    child.on('error', (e) => finish(e))
    child.on('close', (code) => (code === 0 ? finish(null, Buffer.concat(out)) : finish(new Error(err.trim().split(/\r?\n/).slice(-2).join(' | ') || `exit ${code}`))))
    if (input) {
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }
  })
}

async function probeVisual(ffprobe, abs, opts) {
  const buf = await runBuffer(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt,codec_name,avg_frame_rate:stream_tags=alpha_mode:format=duration', '-of', 'json', abs], opts)
  const j = JSON.parse(buf.toString('utf8') || '{}')
  const s = (j.streams || [])[0] || {}
  const [n, d] = String(s.avg_frame_rate || '0/1').split('/').map(Number)
  const pix = String(s.pix_fmt || '')
  return {
    width: Number(s.width) || 0,
    height: Number(s.height) || 0,
    pixFmt: pix,
    codec: String(s.codec_name || ''),
    fps: d ? n / d : 0,
    durationSec: Number(j.format?.duration) || 0,
    // rgba / bgra / ya8 / yuva420p / gbrap / argb …, or a VP8/VP9 WebM carrying an alpha plane
    alpha: /^(rgba|bgra|argb|abgr|ya8|ya16|yuva|gbrap|rgba64|bgra64)/i.test(pix) || String(s.tags?.alpha_mode || s.tags?.ALPHA_MODE || '') === '1',
  }
}

/* ------------------------------------------------------------------------------------------------ pure image work */

/** Mean RGBA of a small block in each corner of an RGBA frame. */
export function cornerColors(rgba, w, h, block = 3) {
  const at = (x0, y0) => {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    let n = 0
    for (let y = y0; y < y0 + block && y < h; y++) {
      for (let x = x0; x < x0 + block && x < w; x++) {
        const i = (y * w + x) * 4
        r += rgba[i]
        g += rgba[i + 1]
        b += rgba[i + 2]
        a += rgba[i + 3]
        n++
      }
    }
    return { r: r / n, g: g / n, b: b / n, a: a / n }
  }
  return [at(0, 0), at(Math.max(0, w - block), 0), at(0, Math.max(0, h - block)), at(Math.max(0, w - block), Math.max(0, h - block))]
}

const dist = (a, b) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2)

/**
 * How the picture's background can be removed: 'alpha' (already transparent at the corners), 'key' with the plain
 * background colour, or 'none' (a busy background — keep the picture as a card).
 */
export function chooseBackgroundKey(corners) {
  if (corners.every((c) => c.a < 24)) return { mode: 'alpha' }
  const opaque = corners.filter((c) => c.a >= 24)
  const mean = { r: 0, g: 0, b: 0 }
  for (const c of opaque) {
    mean.r += c.r / opaque.length
    mean.g += c.g / opaque.length
    mean.b += c.b / opaque.length
  }
  const spread = Math.max(...opaque.map((c) => dist(c, mean)))
  return spread <= 36 ? { mode: 'key', color: { r: Math.round(mean.r), g: Math.round(mean.g), b: Math.round(mean.b) } } : { mode: 'none' }
}

/**
 * Remove the plain background that touches the picture's edge (flood fill from the border), in place on an RGBA
 * buffer. Pixels near the boundary get a soft alpha and lose the background tint. Interior areas of the same colour
 * (eyes, a white shirt) are kept because they are not connected to the edge through background.
 */
export function cutOutBackground(rgba, w, h, key, { tol = KEY_TOL, seedTol = KEY_SEED_TOL } = {}) {
  const n = w * h
  const d = new Float32Array(n)
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const dr = rgba[i] - key.r
    const dg = rgba[i + 1] - key.g
    const db = rgba[i + 2] - key.b
    d[p] = Math.sqrt(dr * dr + dg * dg + db * db)
  }
  const bg = new Uint8Array(n)
  const queue = new Int32Array(n)
  let qh = 0
  let qt = 0
  const seed = (p) => {
    if (!bg[p] && d[p] <= seedTol) {
      bg[p] = 1
      queue[qt++] = p
    }
  }
  for (let x = 0; x < w; x++) {
    seed(x)
    seed((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    seed(y * w)
    seed(y * w + w - 1)
  }
  while (qh < qt) {
    const p = queue[qh++]
    const x = p % w
    const y = (p - x) / w
    const visit = (q) => {
      if (!bg[q] && d[q] <= tol) {
        bg[q] = 1
        queue[qt++] = q
      }
    }
    if (x > 0) visit(p - 1)
    if (x < w - 1) visit(p + 1)
    if (y > 0) visit(p - w)
    if (y < h - 1) visit(p + w)
  }
  // pixels within two steps of the background (video edges are blurred by chroma subsampling over ~2 px)
  const ring = new Uint8Array(n)
  for (let pass = 1; pass <= 2; pass++) {
    const src = pass === 1 ? bg : ring
    const mark = pass === 1 ? 1 : 2
    for (let p = 0; p < n; p++) {
      if (bg[p] || ring[p]) continue
      const x = p % w
      const y = (p - x) / w
      const hit = (q) => (pass === 1 ? src[q] : src[q] === 1 || bg[q])
      if ((x > 0 && hit(p - 1)) || (x < w - 1 && hit(p + 1)) || (y > 0 && hit(p - w)) || (y < h - 1 && hit(p + w))) ring[p] = mark
    }
  }
  // a strongly coloured key (green / blue screen): its tint on the edges is removed (despill)
  const chans = [key.r, key.g, key.b]
  const dom = chans.indexOf(Math.max(...chans))
  const chromatic = chans[dom] - Math.max(...chans.filter((_, c) => c !== dom)) > 50
  let removed = 0
  for (let p = 0; p < n; p++) {
    const i = p * 4
    if (bg[p]) {
      // neutral grey under full transparency: a video encoder shares colour between neighbouring pixels (4:2:0),
      // so the screen colour left here would tint the character's edge
      rgba[i] = 128
      rgba[i + 1] = 128
      rgba[i + 2] = 128
      rgba[i + 3] = 0
      removed++
      continue
    }
    if (chromatic && ring[p]) {
      // average despill (the key channel may not exceed the mean of the other two), and the outermost pixel row is
      // choked: it is mostly screen colour mixed in by the video's soft edges
      const mean = (rgba[i + ((dom + 1) % 3)] + rgba[i + ((dom + 2) % 3)]) / 2
      if (rgba[i + dom] > mean) rgba[i + dom] = Math.round(mean)
      if (ring[p] === 1) {
        rgba[i + 3] = Math.round(rgba[i + 3] * 0.3)
        continue
      }
    }
    // a boundary pixel (next to background) close to the key colour: partly transparent, background tint removed
    const nearBg = ring[p] === 1
    if (!nearBg || d[p] >= tol * 2.2) continue
    const a = clamp01((d[p] - tol * 0.6) / (tol * 1.6))
    if (a <= 0.02) {
      rgba[i + 3] = 0
      continue
    }
    const keep = a
    rgba[i] = Math.max(0, Math.min(255, Math.round((rgba[i] - (1 - keep) * key.r) / keep)))
    rgba[i + 1] = Math.max(0, Math.min(255, Math.round((rgba[i + 1] - (1 - keep) * key.g) / keep)))
    rgba[i + 2] = Math.max(0, Math.min(255, Math.round((rgba[i + 2] - (1 - keep) * key.b) / keep)))
    rgba[i + 3] = Math.round(rgba[i + 3] * keep)
  }
  return { removed, share: removed / n }
}

/** Bounding box of the visible pixels (alpha above a threshold); null when nothing is visible. */
export function opaqueBounds(rgba, w, h, minAlpha = 24) {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= minAlpha) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

/** Grow a box by a margin (share of its size), keep it inside the frame and on even pixel sizes (video encoders). */
function padBox(box, w, h, margin = 0.02) {
  const mx = Math.round(box.w * margin)
  const my = Math.round(box.h * margin)
  let x = Math.max(0, box.x - mx)
  let y = Math.max(0, box.y - my)
  let bw = Math.min(w - x, box.w + 2 * mx)
  let bh = Math.min(h - y, box.h + 2 * my)
  bw -= bw % 2
  bh -= bh % 2
  return { x, y, w: Math.max(2, bw), h: Math.max(2, bh) }
}

function cropRgba(rgba, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) rgba.copy(out, y * box.w * 4, ((box.y + y) * w + box.x) * 4, ((box.y + y) * w + box.x + box.w) * 4)
  return out
}

/* ------------------------------------------------------------------------------------------------ voice → motion */

/**
 * Loudness envelope of a voice track: `hz` values per second, 0..100 (100 ≈ the loud speaking level of this file, 0 =
 * silence / room noise), lightly smoothed (fast attack, slower release) so the motion follows syllables, not noise.
 */
export function voiceEnvelopeFromPcm(pcm, sampleRate, { hz = MASCOT_ENV_HZ } = {}) {
  const samples = Math.floor(pcm.length / 2)
  const win = Math.max(1, Math.round(sampleRate / hz))
  const count = Math.ceil(samples / win)
  const db = new Float32Array(count)
  for (let k = 0; k < count; k++) {
    let sum = 0
    const from = k * win
    const to = Math.min(samples, from + win)
    for (let s = from; s < to; s++) {
      const v = pcm.readInt16LE(s * 2) / 32768
      sum += v * v
    }
    const rms = Math.sqrt(sum / Math.max(1, to - from))
    db[k] = rms > 1e-6 ? 20 * Math.log10(rms) : -120
  }
  const sorted = [...db].filter((x) => x > -100).sort((a, b) => a - b)
  const hi = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : -20
  const floor = Math.max(-60, hi - 34)
  const out = new Array(count)
  let level = 0
  for (let k = 0; k < count; k++) {
    const target = clamp01((db[k] - floor) / Math.max(6, hi - floor))
    level = target > level ? level + (target - level) * 0.75 : level + (target - level) * 0.35
    out[k] = Math.round(level * 100)
  }
  return out
}

/** Loudness envelope of an audio / video file (see voiceEnvelopeFromPcm). */
export async function voiceEnvelope(fileAbs, { hz = MASCOT_ENV_HZ, signal, onChild } = {}) {
  const { ffmpeg } = resolveBinaries()
  const pcm = await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-i', fileAbs, '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { signal, onChild, timeoutMs: 600_000 })
  return voiceEnvelopeFromPcm(pcm, 8000, { hz })
}

/** Word onsets on the cut timeline (seconds), from the captions' recognised words; at least `minGap` apart. */
export function wordOnsets(captions, { minGap = 0.14 } = {}) {
  const out = []
  for (const c of Array.isArray(captions) ? captions : []) {
    const words = Array.isArray(c?.words) && c.words.length ? c.words : [{ startSec: c?.startSec }]
    for (const w of words) {
      const at = Number(w?.startSec)
      if (!Number.isFinite(at)) continue
      if (out.length && at - out[out.length - 1] < minGap) continue
      out.push(r3(at))
    }
  }
  return out.sort((a, b) => a - b)
}

/**
 * The character's pose at time `t` (seconds on the cut): { ty (share of the character's height, negative = up),
 * sx, sy (scale), rot (degrees), shadow (shadow width scale) }. The talk kit and the HTML draft use this formula.
 */
export function mascotPose(m, t) {
  const env = Array.isArray(m?.env) ? m.env : []
  const hz = Number(m?.envHz) || MASCOT_ENV_HZ
  const x = Math.max(0, t * hz)
  const k = Math.floor(x)
  const a0 = (env[k] ?? 0) / 100
  const a1 = (env[k + 1] ?? env[k] ?? 0) / 100
  const amp = a0 + (a1 - a0) * (x - k)
  const talk = Math.max(0, Math.min(1, (amp - 0.08) / 0.3))
  // the last word start at or before t (binary search)
  const words = Array.isArray(m?.words) ? m.words : []
  let lo = 0
  let hi = words.length - 1
  let wi = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid] <= t) {
      wi = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  const dt = wi >= 0 ? t - words[wi] : 99
  const pop = dt < 0.4 ? Math.exp(-dt * 8) * (1 - Math.exp(-dt * 55)) : 0
  const dir = wi % 2 === 0 ? 1 : -1
  const breathe = Math.sin((2 * Math.PI * t) / 3.4)
  const sway = Math.sin((2 * Math.PI * t) / 5.3 + 0.8)
  const gain = m?.type === 'anime-clip' ? 0 : m?.type === 'video' ? 0.5 : 1
  const ty = -gain * (0.016 * talk + 0.045 * pop)
  const sy = 1 + gain * (0.012 * breathe * (1 - talk) + 0.05 * pop)
  const sx = 1 - gain * 0.03 * pop
  const rot = gain * (0.9 * sway * (1 - talk) + dir * 2.6 * pop + 1.1 * talk * Math.sin(2 * Math.PI * t * 1.6))
  return { ty: r3(ty), sx: r3(sx), sy: r3(sy), rot: r3(rot), shadow: r3(1 + ty * 2.2) }
}

/**
 * Where the character goes in a frame of `width` × `height`: { boxW, boxH, left, bottom } in pixels. `m.aspect` =
 * width / height of the cut-out picture; a keyed character stands on the bottom edge, a card floats a bit above it.
 */
export function mascotBox(m, width, height) {
  const portrait = width < height
  const frac = (MASCOT_SIZES[m?.size] || MASCOT_SIZES.m) * (portrait ? 0.72 : 1)
  let boxH = Math.round(height * frac)
  let boxW = Math.round(boxH * (Number(m?.aspect) || 0.75))
  const maxW = Math.round(width * (portrait ? 0.42 : 0.3))
  if (boxW > maxW) {
    boxH = Math.round((boxH * maxW) / boxW)
    boxW = maxW
  }
  const side = Math.round(width * (portrait ? 0.03 : 0.022))
  const bottom = m?.keyed ? Math.round(height * 0.004) : Math.round(height * 0.04)
  const left = m?.corner === 'br' ? width - side - boxW : side
  return { boxW, boxH, left, bottom, reserveX: boxW + side + Math.round(width * 0.012) }
}

/**
 * Everything the renderers need for one cut: the prepared character, its corner / size and the motion track.
 * `setting` = { assetId, corner, size } (talk-pack cleanMascotSetting). Returns null when the asset is gone.
 */
export async function planMascot({ projectDir, manifest, setting, captions, wavAbs, totalSec, fps = 30, signal, onChild, onProgress } = {}) {
  // 「我的动漫形象」: mouth shapes / blinks (free) or a clip from the local model / the user's cloud key
  if (setting?.characterId) {
    const { planAnimePresenter } = await import('../dsh-tool-avatar/anime-engines.js')
    return planAnimePresenter({ projectDir, setting, captions, wavAbs, totalSec, fps, signal, onChild, onProgress })
  }
  if (!setting?.assetId) return null
  const asset = (manifest?.items || []).find((it) => it && it.id === setting.assetId && (it.type === 'image' || it.type === 'video'))
  if (!asset) return null
  const prepared = await prepareMascotAsset({ projectDir, asset, signal, onChild, onProgress })
  let env = []
  if (wavAbs && existsSync(wavAbs)) {
    try {
      env = await voiceEnvelope(wavAbs, { signal, onChild })
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }
  const maxLen = Math.ceil((Number(totalSec) || 0) * MASCOT_ENV_HZ) + 2
  return {
    path: prepared.path,
    type: prepared.type,
    keyed: Boolean(prepared.keyed),
    aspect: prepared.aspect,
    loopSec: prepared.loopSec || 0,
    note: prepared.note || '',
    assetId: setting.assetId,
    corner: setting.corner || 'bl',
    size: setting.size || 'm',
    envHz: MASCOT_ENV_HZ,
    env: maxLen > 2 ? env.slice(0, maxLen) : env,
    words: wordOnsets(captions),
  }
}

/* ------------------------------------------------------------------------------------------------ asset preparation */

async function readFrameRgba(ffmpeg, abs, w, h, opts, atSec = 0) {
  const args = ['-hide_banner', '-v', 'error']
  if (atSec > 0) args.push('-ss', String(atSec))
  args.push('-i', abs, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=area,format=rgba`, '-f', 'rawvideo', '-')
  const buf = await runBuffer(ffmpeg, args, opts)
  if (buf.length < w * h * 4) throw new Error('读不出这张图片的像素')
  return buf.subarray(0, w * h * 4)
}

function fitSize(w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h))
  const ew = Math.max(2, Math.round((w * s) / 2) * 2)
  const eh = Math.max(2, Math.round((h * s) / 2) * 2)
  return { w: ew, h: eh }
}

/**
 * Turn a library picture / video into the cut-out character the talk kit draws, under `assets/.mascot/`. Re-uses the
 * result while the source file is unchanged. Returns { path (project-relative), type, keyed, aspect, width, height,
 * loopSec, note }.
 */
export async function prepareMascotAsset({ projectDir, asset, signal, onChild, onProgress } = {}) {
  if (!asset || !asset.path) throw new Error('没有找到卡通形象素材')
  const absDir = resolve(projectDir)
  const srcAbs = isAbsolute(asset.path) ? asset.path : join(absDir, asset.path)
  if (!existsSync(srcAbs)) throw new Error(`卡通形象素材不存在：${asset.name || asset.path}`)
  const { ffmpeg, ffprobe } = resolveBinaries()
  const opts = { signal, onChild }
  const st = statSync(srcAbs)
  const key = createHash('sha1').update(`${srcAbs}:${st.size}:${Math.round(st.mtimeMs)}:${MASCOT_VERSION}`).digest('hex').slice(0, 10)
  const outDir = join(absDir, 'assets', '.mascot')
  mkdirSync(outDir, { recursive: true })
  const isVideo = asset.type === 'video'
  const outAbs = join(outDir, `${String(asset.id || 'mascot').replace(/[^\w.-]+/g, '_')}-${key}.${isVideo ? 'webm' : 'png'}`)
  const metaAbs = `${outAbs}.json`
  if (existsSync(outAbs) && existsSync(metaAbs)) {
    try {
      return JSON.parse(readFileSync(metaAbs, 'utf8'))
    } catch {}
  }
  const info = await probeVisual(ffprobe, srcAbs, opts)
  if (!info.width || !info.height) throw new Error('这个卡通形象素材没有可用的画面')
  const rel = relative(absDir, outAbs).replace(/\\/g, '/')
  const writeMeta = (meta) => {
    const tmp = `${metaAbs}.tmp`
    writeFileSync(tmp, JSON.stringify(meta))
    renameSync(tmp, metaAbs)
    return meta
  }

  if (!isVideo) {
    onProgress?.({ message: '正在给卡通形象抠图…' })
    const { w, h } = fitSize(info.width, info.height, STILL_MAX_SIDE)
    const rgba = Buffer.from(await readFrameRgba(ffmpeg, srcAbs, w, h, opts))
    const plan = chooseBackgroundKey(cornerColors(rgba, w, h))
    let keyed = plan.mode === 'alpha'
    let note = plan.mode === 'alpha' ? '透明背景' : ''
    if (plan.mode === 'key') {
      const cut = cutOutBackground(rgba, w, h, plan.color)
      keyed = cut.share > 0.04
      note = keyed ? '已自动抠掉纯色背景' : '背景太少，按原图显示'
    } else if (plan.mode === 'none') note = '背景不是纯色，无法自动抠图（建议上传透明背景 PNG），先按圆角卡片显示'
    const box = keyed ? padBox(opaqueBounds(rgba, w, h) || { x: 0, y: 0, w, h }, w, h) : { x: 0, y: 0, w, h }
    const out = keyed ? cropRgba(rgba, w, box) : rgba
    await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${box.w}x${box.h}`, '-i', '-', '-frames:v', '1', outAbs], { ...opts, input: out })
    return writeMeta({ path: rel, type: 'image', keyed, aspect: r3(box.w / box.h), width: box.w, height: box.h, loopSec: 0, note, sourceId: asset.id || '' })
  }

  // a video loop: cut out frame by frame (at most 20 s, 640 px high, 30 fps) into a transparent WebM
  const loopSec = Math.min(VIDEO_MAX_SEC, info.durationSec || VIDEO_MAX_SEC)
  const fps = Math.max(10, Math.min(VIDEO_MAX_FPS, Math.round(info.fps) || 25))
  const { w, h } = fitSize(info.width, info.height, Math.max(VIDEO_MAX_H, 2))
  const first = Buffer.from(await readFrameRgba(ffmpeg, srcAbs, w, h, opts))
  const plan = info.alpha ? { mode: 'alpha' } : chooseBackgroundKey(cornerColors(first, w, h))
  if (plan.mode === 'none') {
    // a busy background: keep the clip as a rounded card (no cut-out), just shortened / scaled for the loop
    onProgress?.({ message: '卡通形象视频的背景不是纯色：按圆角卡片显示' })
    await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-t', String(loopSec), '-i', srcAbs, '-an', '-vf', `scale=${w}:${h},fps=${fps}`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-deadline', 'good', '-cpu-used', '4', outAbs], { ...opts, timeoutMs: 600_000 })
    return writeMeta({ path: rel, type: 'video', keyed: false, aspect: r3(w / h), width: w, height: h, loopSec: r3(loopSec), note: '背景不是纯色，无法自动抠图，先按圆角卡片显示', sourceId: asset.id || '' })
  }
  onProgress?.({ message: '正在给卡通形象视频逐帧抠图（本地，不花钱）…' })
  // all frames, decoded once (bounded: ≤ 20 s × 30 fps × 640 px high)
  const raw = await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-t', String(loopSec), '-i', srcAbs, '-an', '-vf', `scale=${w}:${h}:flags=area,fps=${fps},format=rgba`, '-f', 'rawvideo', '-'], { ...opts, timeoutMs: 600_000 })
  const frameBytes = w * h * 4
  const count = Math.floor(raw.length / frameBytes)
  if (!count) throw new Error('读不出这个卡通形象视频的画面')
  let union = null
  for (let k = 0; k < count; k++) {
    const fr = raw.subarray(k * frameBytes, (k + 1) * frameBytes)
    if (plan.mode === 'key') cutOutBackground(fr, w, h, plan.color)
    const b = opaqueBounds(fr, w, h)
    if (b) union = union ? { x: Math.min(union.x, b.x), y: Math.min(union.y, b.y), w: Math.max(union.x + union.w, b.x + b.w) - Math.min(union.x, b.x), h: Math.max(union.y + union.h, b.y + b.h) - Math.min(union.y, b.y) } : b
  }
  const box = padBox(union || { x: 0, y: 0, w, h }, w, h)
  const cropped = Buffer.alloc(box.w * box.h * 4 * count)
  for (let k = 0; k < count; k++) cropRgba(raw.subarray(k * frameBytes, (k + 1) * frameBytes), w, box).copy(cropped, k * box.w * box.h * 4)
  await runBuffer(
    ffmpeg,
    ['-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${box.w}x${box.h}`, '-r', String(fps), '-i', '-', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-deadline', 'good', '-cpu-used', '4', '-auto-alt-ref', '0', outAbs],
    { ...opts, input: cropped, timeoutMs: 900_000 },
  )
  return writeMeta({ path: rel, type: 'video', keyed: true, aspect: r3(box.w / box.h), width: box.w, height: box.h, loopSec: r3(count / fps), note: plan.mode === 'alpha' ? '透明背景视频' : '已逐帧抠掉纯色背景', sourceId: asset.id || '' })
}
