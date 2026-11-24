/**
 * 动漫形象数字人 · tier 2 engine `tha3` + the local photo → anime likeness (contract: ANIME-AVATAR.md).
 *
 *   prepareThaImage(character)  portrait.png + face marks → `tha-512.png`, the 512×512 RGBA input Talking Head Anime 3
 *                               expects (head in the 128×128 box at the middle of the top half, transparent background)
 *   buildThaPoses(track)        the 45 THA3 pose parameters per frame from the voice (mouth vowels, blinks, eyebrow
 *                               lifts on stressed words, glances, nods / sways, body sway, breathing) — pure, seeded
 *   renderPresenterClip(...)    venv Python (scripts/avatar/tha3_render.py) → raw RGBA frames → FFmpeg → VP9 + alpha
 *                               WebM cropped to the union of the visible pixels, exactly the audio's length, cached
 *   stylizePortraitLocal(...)   scripts/avatar/anime_stylize.py (DCT-Net + U²-Net cut-out) → transparent anime PNG
 *
 * Models and the Python environment come from the optional installer (anime-installer.js). Free and local: nothing is
 * uploaded. Errors are plain-Chinese `Error`s with `code` NOT_INSTALLED | UNSUPPORTED_IMAGE | TIMEOUT | PROVIDER_ERROR.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { createAbortError, killProcessTree, probeAudioDuration, resolveBinaries } from '../shared/index.js'
import { computeVisemeTrack } from './anime-visemes.js'
import { animeLocalPythonEnv, DCTNET_STYLES, getAnimeLocalStatus, resolveAnimeLocalConfig, STYLE_TO_DCTNET, THA3_DEVICE_VARIANT } from './anime-installer.js'

export const THA_IMAGE_NAME = 'tha-512.png'
export const THA_IMAGE_SIZE = 512
export const THA_FRAMING_VERSION = 1
export const THA_POSE_VERSION = 1
export const ANIME_LOCAL_ENGINE = 'tha3'
// a CPU renders this many frames per second of video (FFmpeg repeats each one): anime is often drawn "on twos" too
export const CPU_RENDER_FPS = 15

// The 45 THA3 pose parameters in the official order (tha3/poser/modes/pose_parameters.py; arity-2 groups expand to
// `_left`, `_right`). Ranges: [0, 1], except iris_rotation_* / head_* / neck_z / body_* in [-1, 1].
export const THA3_POSE_NAMES = Object.freeze([
  ...['eyebrow_troubled', 'eyebrow_angry', 'eyebrow_lowered', 'eyebrow_raised', 'eyebrow_happy', 'eyebrow_serious'].flatMap((g) => [`${g}_left`, `${g}_right`]),
  ...['eye_wink', 'eye_happy_wink', 'eye_surprised', 'eye_relaxed', 'eye_unimpressed', 'eye_raised_lower_eyelid'].flatMap((g) => [`${g}_left`, `${g}_right`]),
  'iris_small_left',
  'iris_small_right',
  'mouth_aaa',
  'mouth_iii',
  'mouth_uuu',
  'mouth_eee',
  'mouth_ooo',
  'mouth_delta',
  'mouth_lowered_corner_left',
  'mouth_lowered_corner_right',
  'mouth_raised_corner_left',
  'mouth_raised_corner_right',
  'mouth_smirk',
  'iris_rotation_x',
  'iris_rotation_y',
  'head_x',
  'head_y',
  'neck_z',
  'body_y',
  'body_z',
  'breathing',
])
export const THA3_POSE_INDEX = Object.freeze(Object.fromEntries(THA3_POSE_NAMES.map((n, i) => [n, i])))

// Where the face sits in the THA3 input (measured on the official sample characters: eye line ≈ y 147, mouth ≈ y 174,
// eye centres ≈ 43 px apart, so the head fills the 128×128 box x 192–320, y 64–192).
export const THA_TARGET = Object.freeze({ eyeX: 256, eyeY: 147, mouthY: 174, eyeDistance: 43 })
// Motion bounds (THA3 units). The official puppeteer maps ±1 to ±15° (head_x, neck_z) and ±10° (head_y).
export const THA_MOTION_LIMITS = Object.freeze({ head_x: 0.3, head_y: 0.25, neck_z: 0.15, body_y: 0.12, body_z: 0.08, iris_rotation_x: 0.15, iris_rotation_y: 0.3, eyebrow_raised: 0.45 })
// a negative head_x tips the head down in THA3 (measured on rendered frames: the eyes move down for head_x < 0)
const NOD_SIGN = -1

function coded(message, code, extra = {}) {
  const err = new Error(message)
  err.code = code
  Object.assign(err, extra)
  return err
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const clamp01 = (v) => clamp(Number(v) || 0, 0, 1)
const smoothstep = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const r4 = (v) => Math.round(v * 10000) / 10000

/* ------------------------------------------------------------------------------------------------- the poses */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A stable seed of a viseme track (the same recording always moves the same way). */
export function trackSeed(track) {
  const open = Array.isArray(track?.open) ? track.open : []
  const step = Math.max(1, Math.floor(open.length / 64))
  const sample = []
  for (let i = 0; i < open.length; i += step) sample.push(Math.round((Number(open[i]) || 0) * 100))
  return fnv1a(`${open.length}|${Math.round((Number(track?.durationSec) || 0) * 1000)}|${sample.join(',')}|${(track?.words || []).length}`)
}

/** Critically damped follow of `target` (Unity-style SmoothDamp): smooth position and velocity, no overshoot. */
function smoothDamp(values, dt, smoothTime) {
  const out = new Float64Array(values.length)
  if (!values.length) return out
  const omega = 2 / Math.max(1e-3, smoothTime)
  const x = omega * dt
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  let cur = values[0]
  let vel = 0
  for (let i = 0; i < values.length; i++) {
    const change = cur - values[i]
    const temp = (vel + omega * change) * dt
    vel = (vel - omega * temp) * k
    cur = values[i] + (change + temp) * k
    out[i] = cur
  }
  return out
}

/** One-pole follower with separate rise / fall time constants (seconds). */
function follow(values, dt, tauUp, tauDown) {
  const out = new Float64Array(values.length)
  let y = values.length ? values[0] : 0
  for (let i = 0; i < values.length; i++) {
    const tau = values[i] > y ? tauUp : tauDown
    y += (values[i] - y) * (1 - Math.exp(-dt / Math.max(1e-3, tau)))
    out[i] = y
  }
  return out
}

/** Sample a per-frame track array (frame centres at (f + 0.5) / fps) at `frames` output frames of `fps`. */
function resampleTrack(arr, trackFps, frames, fps, mode = 'linear') {
  const src = Array.isArray(arr) || ArrayBuffer.isView(arr) ? arr : []
  const n = src.length
  const out = new Float64Array(frames)
  const at = (i) => (i >= 0 && i < n ? Number(src[i]) || 0 : 0)
  const ratio = trackFps / fps
  for (let g = 0; g < frames; g++) {
    if (mode === 'linear' && Math.abs(ratio - 1) < 1e-9) {
      out[g] = at(g)
      continue
    }
    const a = g * ratio
    const b = (g + 1) * ratio
    const i0 = Math.floor(a)
    const i1 = Math.max(i0 + 1, Math.ceil(b))
    let mx = 0
    let sum = 0
    for (let i = i0; i < i1; i++) {
      const v = at(i)
      mx = Math.max(mx, v)
      sum += v
    }
    const mean = sum / (i1 - i0)
    if (mode === 'max') out[g] = mx
    else if (ratio > 1) out[g] = 0.5 * (mean + mx) // fewer output frames: keep short syllables visible
    else {
      const p = (g + 0.5) * ratio - 0.5
      const f = Math.floor(p)
      const t = p - f
      out[g] = at(f) * (1 - t) + at(f + 1) * t
    }
  }
  return out
}

/**
 * THA3 pose vectors for a viseme track (anime-visemes.js computeVisemeTrack): mouth vowels from `vowels` (+ `open`),
 * eye blinks from `blink`, an eyebrow lift on stressed words, a glance now and then, nods on words and a slow head /
 * body sway driven by `talk` + `words`, breathing as a slow sine. Smooth and deterministic for the same input.
 * → { version, fps, frames, durationSec, seed, names: THA3_POSE_NAMES, poses: number[frames][45] }
 */
export function buildThaPoses(track, { fps = 0, seed, durationSec = 0 } = {}) {
  const trackFps = Number(track?.fps) > 0 ? Number(track.fps) : 30
  const rate = Number(fps) > 0 ? Number(fps) : trackFps
  const dur = Number(durationSec) > 0 ? Number(durationSec) : Number(track?.durationSec) > 0 ? Number(track.durationSec) : (track?.open?.length || 1) / trackFps
  const frames = Math.max(1, Math.ceil(dur * rate - 1e-6))
  const dt = 1 / rate
  const rnd = mulberry32(seed === undefined || seed === null ? trackSeed(track) : Number(seed) >>> 0)
  const rs = (arr, mode) => resampleTrack(arr, trackFps, frames, rate, mode)

  // --- the voice
  const open = rs(track?.open)
  const vow = track?.vowels && typeof track.vowels === 'object' ? track.vowels : null
  const shape = Array.isArray(track?.shape) ? track.shape : []
  const fromShape = (key) => {
    // older tracks without vowel weights: the mouth shape picks the vowel, `open` its size
    const raw = new Array(track?.open?.length || 0)
    for (let i = 0; i < raw.length; i++) {
      const s = shape[i]
      const o = Number(track.open[i]) || 0
      raw[i] = key === 'a' ? (s === 'a' ? o : s === 'half' ? o * 0.7 : 0) : s === key ? o : 0
    }
    return raw
  }
  const v = {}
  for (const k of ['a', 'i', 'u', 'e', 'o']) v[k] = rs(vow ? vow[k] : k === 'u' || k === 'e' ? [] : fromShape(k))
  const talk = rs(track?.talk)
  const blink = rs(track?.blink, 'max')
  const talkSlow = follow(talk, dt, 0.5, 1.4)
  const words = (Array.isArray(track?.words) ? track.words : []).map(Number).filter((w) => Number.isFinite(w) && w >= 0 && w < dur).sort((a, b) => a - b)

  const poses = new Array(frames)
  const P = THA3_POSE_INDEX
  for (let g = 0; g < frames; g++) poses[g] = new Array(THA3_POSE_NAMES.length).fill(0)
  const set = (name, arr) => {
    const k = P[name]
    for (let g = 0; g < frames; g++) poses[g][k] = r4(arr[g])
  }

  // --- mouth: vowel weights (already scaled by the opening), a tiny [1 2 1] blur that keeps the timing, no flutter
  const blur = (arr) => {
    const out = new Float64Array(frames)
    for (let g = 0; g < frames; g++) out[g] = 0.25 * arr[Math.max(0, g - 1)] + 0.5 * arr[g] + 0.25 * arr[Math.min(frames - 1, g + 1)]
    return out
  }
  const gate = (x) => (x < 0.04 ? 0 : clamp01(x))
  const mouth = { a: blur(v.a), i: blur(v.i), u: blur(v.u), e: blur(v.e), o: blur(v.o) }
  set('mouth_aaa', mouth.a.map(gate))
  set('mouth_iii', mouth.i.map(gate))
  set('mouth_uuu', mouth.u.map(gate))
  set('mouth_eee', mouth.e.map(gate))
  set('mouth_ooo', mouth.o.map(gate))
  // a faint friendly smile while the mouth rests
  const restSmile = smoothDamp(open.map((o) => 0.1 * (1 - clamp01(o * 4))), dt, 0.25)
  set('mouth_raised_corner_left', restSmile)
  set('mouth_raised_corner_right', restSmile)

  // --- eyes: blinks close both eyes (eye_wink, as the official puppeteer maps blinks)
  set('eye_wink_left', blink.map(clamp01))
  set('eye_wink_right', blink.map(clamp01))

  // --- stress of every word onset (opening right after it, weighted by speaking activity)
  const stress = words.map((w) => {
    const g0 = Math.floor(w * rate)
    let mx = 0
    for (let g = g0; g < Math.min(frames, g0 + Math.round(0.3 * rate) + 1); g++) mx = Math.max(mx, open[g])
    return mx * (0.5 + 0.5 * (talk[Math.min(frames - 1, g0)] || 0))
  })
  const sorted = stress.slice().sort((a, b) => a - b)
  const rank = (s) => {
    if (sorted.length < 2) return 0.5
    let lo = 0
    while (lo < sorted.length && sorted[lo] < s) lo++
    return lo / (sorted.length - 1)
  }

  // --- eyebrows: lift on the strongest words (at most one every 1.6 s): rise 0.12 s, hold 0.12 s, fall 0.5 s
  const brow = new Float64Array(frames)
  let lastBrow = -10
  words.forEach((w, k) => {
    const r = rank(stress[k])
    if (r < 0.7 || w - lastBrow < 1.6 || stress[k] < 0.2) return
    lastBrow = w
    const amp = 0.22 + 0.18 * clamp01((r - 0.7) / 0.3)
    const g0 = Math.max(0, Math.floor((w - 0.06) * rate))
    for (let g = g0; g < Math.min(frames, g0 + Math.ceil(0.8 * rate)); g++) {
      const t = g * dt - (w - 0.06)
      const e = t < 0.12 ? smoothstep(t / 0.12) : t < 0.24 ? 1 : 1 - smoothstep((t - 0.24) / 0.5)
      brow[g] = Math.max(brow[g], amp * e)
    }
  })
  const browS = smoothDamp(brow, dt, 0.05)
  set('eyebrow_raised_left', browS.map((x) => clamp(x, 0, THA_MOTION_LIMITS.eyebrow_raised)))
  set('eyebrow_raised_right', browS.map((x) => clamp(x * 0.92, 0, THA_MOTION_LIMITS.eyebrow_raised)))

  // --- glances: hold 1.2–3.8 s, then a quick (0.12 s) look somewhere near the camera or back to it
  const gazeX = new Float64Array(frames)
  const gazeY = new Float64Array(frames)
  {
    let t = 0.6 + rnd() * 1.4
    let cur = [0, 0]
    let prev = [0, 0]
    let tChange = -1
    const targets = []
    while (t < dur) {
      const back = rnd() < 0.55 || (cur[0] !== 0 && rnd() < 0.5)
      const nx = back ? 0 : (rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.14)
      const ny = back ? 0 : (rnd() - 0.5) * 0.12
      targets.push({ t, from: cur, to: [nx, ny] })
      cur = [nx, ny]
      t += 1.2 + rnd() * 2.6
    }
    let ti = 0
    for (let g = 0; g < frames; g++) {
      const now = g * dt
      while (ti < targets.length && targets[ti].t <= now) {
        prev = targets[ti].from
        cur = targets[ti].to
        tChange = targets[ti].t
        ti++
      }
      const e = tChange < 0 ? 1 : smoothstep((now - tChange) / 0.12)
      gazeY[g] = prev[0] + (cur[0] - prev[0]) * e // horizontal → iris_rotation_y
      gazeX[g] = prev[1] + (cur[1] - prev[1]) * e // vertical → iris_rotation_x
      if (tChange < 0) gazeY[g] = gazeX[g] = 0
    }
  }
  set('iris_rotation_y', gazeY.map((x) => clamp(x, -THA_MOTION_LIMITS.iris_rotation_y, THA_MOTION_LIMITS.iris_rotation_y)))
  set('iris_rotation_x', gazeX.map((x) => clamp(x, -THA_MOTION_LIMITS.iris_rotation_x, THA_MOTION_LIMITS.iris_rotation_x)))

  // --- head: a slow two-sine sway (wider while talking), nods on words, a tilt that changes at sentence starts
  const ph = Array.from({ length: 8 }, () => rnd() * Math.PI * 2)
  const yaw = new Float64Array(frames)
  const pitch = new Float64Array(frames)
  const roll = new Float64Array(frames)
  for (let g = 0; g < frames; g++) {
    const t = g * dt
    const amp = 0.08 + 0.1 * talkSlow[g]
    yaw[g] = amp * (0.62 * Math.sin(2 * Math.PI * 0.11 * t + ph[0]) + 0.38 * Math.sin(2 * Math.PI * 0.23 * t + ph[1]))
    pitch[g] = 0.035 * talkSlow[g] * Math.sin(2 * Math.PI * 0.09 * t + ph[2])
    roll[g] = 0.045 * Math.sin(2 * Math.PI * 0.07 * t + ph[3]) + 0.025 * Math.sin(2 * Math.PI * 0.17 * t + ph[4])
  }
  // nods: a dip and a small rebound (≈0.8 s), at most one every 0.45 s, size by stress
  let lastNod = -10
  words.forEach((w, k) => {
    const r = rank(stress[k])
    if (r < 0.3 || w - lastNod < 0.45 || stress[k] < 0.12) return
    lastNod = w
    const amp = (0.06 + 0.1 * r) * NOD_SIGN
    const g0 = Math.max(0, Math.floor(w * rate))
    for (let g = g0; g < Math.min(frames, g0 + Math.ceil(0.84 * rate)); g++) {
      const tau = g * dt - w
      if (tau < 0) continue
      pitch[g] += amp * Math.sin((Math.PI * tau) / 0.42) * Math.exp(-tau / 0.3)
    }
  })
  // sentence starts (voice after ≥ 0.7 s of quiet): the head settles to the other side
  const tiltTarget = new Float64Array(frames)
  {
    let quiet = 0
    let side = rnd() < 0.5 ? -1 : 1
    let target = 0
    for (let g = 0; g < frames; g++) {
      if (open[g] < 0.05) quiet += dt
      else {
        if (quiet >= 0.7) {
          side = -side
          target = side * (0.03 + 0.03 * rnd())
        }
        quiet = 0
      }
      tiltTarget[g] = target
    }
  }
  const tilt = smoothDamp(tiltTarget, dt, 0.6)
  const headX = smoothDamp(pitch, dt, 0.06).map((x) => clamp(x, -THA_MOTION_LIMITS.head_x, THA_MOTION_LIMITS.head_x))
  const headY = smoothDamp(yaw, dt, 0.08).map((x) => clamp(x, -THA_MOTION_LIMITS.head_y, THA_MOTION_LIMITS.head_y))
  const neckZ = smoothDamp(roll.map((x, g) => x + tilt[g]), dt, 0.08).map((x) => clamp(x, -THA_MOTION_LIMITS.neck_z, THA_MOTION_LIMITS.neck_z))
  set('head_x', headX)
  set('head_y', headY)
  set('neck_z', neckZ)

  // --- body: follows the head a little later and smaller
  const lag = (arr, sec) => {
    const d = Math.round(sec * rate)
    const out = new Float64Array(frames)
    for (let g = 0; g < frames; g++) out[g] = arr[Math.max(0, g - d)]
    return out
  }
  const bodyY = smoothDamp(lag(headY, 0.3).map((x) => 0.42 * x), dt, 0.25)
  const bodyZ = smoothDamp(
    lag(neckZ, 0.25).map((x, g) => 0.45 * x + 0.015 * Math.sin(2 * Math.PI * 0.05 * g * dt + ph[5])),
    dt,
    0.25,
  )
  set('body_y', bodyY.map((x) => clamp(x, -THA_MOTION_LIMITS.body_y, THA_MOTION_LIMITS.body_y)))
  set('body_z', bodyZ.map((x) => clamp(x, -THA_MOTION_LIMITS.body_z, THA_MOTION_LIMITS.body_z)))

  // --- breathing: slow sine, a little quicker while talking (phase integrated, so it never jumps)
  const breath = new Float64Array(frames)
  {
    let phase = ph[6]
    for (let g = 0; g < frames; g++) {
      const period = 4.2 - 0.8 * talkSlow[g]
      phase += (2 * Math.PI * dt) / period
      breath[g] = 0.85 * (0.5 - 0.5 * Math.cos(phase))
    }
  }
  set('breathing', breath)

  return { version: THA_POSE_VERSION, fps: rate, frames, durationSec: Math.round(dur * 1000) / 1000, seed: seed === undefined || seed === null ? trackSeed(track) : Number(seed) >>> 0, names: THA3_POSE_NAMES.slice(), poses }
}

/* ------------------------------------------------------------------------------------------- the input image */

/**
 * Where the portrait goes in the 512×512 THA3 input: uniform scale + offset that put the eye midpoint at
 * (256, 147) and size the face by the eye distance (60 %) and the eye → mouth distance (40 %). Pure.
 * → { scale, dx, dy, width, height, eyeMid: [x, y], eyeDistance, eyeMouth, note }
 */
export function planThaFraming({ width, height, face } = {}) {
  const W = Number(width) || 0
  const H = Number(height) || 0
  if (W < 16 || H < 16) throw coded('人物图太小了', 'UNSUPPORTED_IMAGE')
  const eyes = Array.isArray(face?.eyes) ? face.eyes.slice(0, 2) : []
  const mouth = face?.mouth
  if (eyes.length < 2 || !mouth || ![eyes[0].x, eyes[0].y, eyes[1].x, eyes[1].y, mouth.x, mouth.y].every((n) => Number.isFinite(Number(n)))) {
    throw coded('这个动漫形象还没有标好眼睛和嘴巴的位置（在形象库里点「标记五官」）', 'UNSUPPORTED_IMAGE')
  }
  const [e1, e2] = eyes.map((e) => [Number(e.x) * W, Number(e.y) * H]).sort((a, b) => a[0] - b[0])
  const mid = [(e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2]
  const dEyes = Math.hypot(e2[0] - e1[0], e2[1] - e1[1])
  const dMouth = Number(mouth.y) * H - mid[1]
  if (dEyes < 4 || dMouth < 2) throw coded('眼睛和嘴巴的位置标得不对（嘴巴要在两只眼睛下面），请重新标记五官', 'UNSUPPORTED_IMAGE')
  const sE = THA_TARGET.eyeDistance / dEyes
  const sM = (THA_TARGET.mouthY - THA_TARGET.eyeY) / dMouth
  // eyes are the steadier measure; a mouth mark far off (ratio outside 0.55–1.8) is ignored
  const ratio = sE / sM
  const scale = ratio > 0.55 && ratio < 1.8 ? Math.exp(0.6 * Math.log(sE) + 0.4 * Math.log(sM)) : sE
  if (!(scale > 0.04 && scale < 8)) throw coded('五官标记的比例不对，请重新标记五官', 'UNSUPPORTED_IMAGE')
  const dx = THA_TARGET.eyeX - scale * mid[0]
  const dy = THA_TARGET.eyeY - scale * mid[1]
  const notes = []
  if (scale > 2.2) notes.push('人物图里的脸偏小，动起来会有点模糊')
  if (Math.abs(e2[1] - e1[1]) > dEyes * 0.18) notes.push('头有点歪，转头时可能不太自然')
  return { scale, dx, dy, width: W, height: H, eyeMid: mid, eyeDistance: dEyes, eyeMouth: dMouth, note: notes.join('；') }
}

/** Antialiased resample of an RGBA image (Buffer, straight alpha) into the 512×512 canvas per `plan` (premultiplied filtering). */
export function renderThaCanvas(img, plan, size = THA_IMAGE_SIZE) {
  const { width: W, height: H } = img
  const src = img.rgba
  const s = plan.scale
  const R = Math.max(1, 1 / s) // triangle filter half-width in source pixels
  // per output column / row: the source taps and weights
  const taps = (outN, offset, srcN) => {
    const list = new Array(outN)
    for (let o = 0; o < outN; o++) {
      const c = (o + 0.5 - offset) / s // source coordinate of the output pixel centre
      const i0 = Math.floor(c - R)
      const i1 = Math.ceil(c + R)
      const idx = []
      const w = []
      let sum = 0
      for (let i = i0; i <= i1; i++) {
        const wt = Math.max(0, 1 - Math.abs(i + 0.5 - c) / R)
        if (wt <= 0) continue
        sum += wt
        if (i < 0 || i >= srcN) continue // outside the portrait: transparent (keeps its weight, so edges fade)
        idx.push(i)
        w.push(wt)
      }
      list[o] = { idx, w: w.map((x) => x / (sum || 1)) }
    }
    return list
  }
  const tx = taps(size, plan.dx, W)
  const ty = taps(size, plan.dy, H)
  // rows of the source that any output row needs
  let rowMin = H
  let rowMax = -1
  for (const t of ty) for (const i of t.idx) {
    rowMin = Math.min(rowMin, i)
    rowMax = Math.max(rowMax, i)
  }
  const out = Buffer.alloc(size * size * 4)
  if (rowMax < rowMin) return out
  const rows = rowMax - rowMin + 1
  const mid = new Float32Array(rows * size * 4) // horizontally filtered, premultiplied
  for (let r = 0; r < rows; r++) {
    const y = rowMin + r
    const base = y * W * 4
    for (let x = 0; x < size; x++) {
      const t = tx[x]
      let pr = 0
      let pg = 0
      let pb = 0
      let pa = 0
      for (let k = 0; k < t.idx.length; k++) {
        const p = base + t.idx[k] * 4
        const a = (src[p + 3] / 255) * t.w[k]
        pr += src[p] * a
        pg += src[p + 1] * a
        pb += src[p + 2] * a
        pa += a
      }
      const m = (r * size + x) * 4
      mid[m] = pr
      mid[m + 1] = pg
      mid[m + 2] = pb
      mid[m + 3] = pa
    }
  }
  for (let y = 0; y < size; y++) {
    const t = ty[y]
    for (let x = 0; x < size; x++) {
      let pr = 0
      let pg = 0
      let pb = 0
      let pa = 0
      for (let k = 0; k < t.idx.length; k++) {
        const m = ((t.idx[k] - rowMin) * size + x) * 4
        const wt = t.w[k]
        pr += mid[m] * wt
        pg += mid[m + 1] * wt
        pb += mid[m + 2] * wt
        pa += mid[m + 3] * wt
      }
      const o = (y * size + x) * 4
      const a8 = Math.round(clamp(pa, 0, 1) * 255)
      if (a8 <= 0) continue // background: (0, 0, 0, 0) as THA3 requires
      out[o] = Math.round(clamp(pr / pa, 0, 255))
      out[o + 1] = Math.round(clamp(pg / pa, 0, 255))
      out[o + 2] = Math.round(clamp(pb / pa, 0, 255))
      out[o + 3] = a8
    }
  }
  return out
}

/* ------------------------------------------------------------------------------------------- PNG in / out */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Encode 8-bit RGBA as PNG (pure JS). */
export function encodePngRgba(rgba, width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

function writeFileAtomic(abs, data) {
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, abs)
}

/** Decode any picture FFmpeg reads to 8-bit RGBA (one PAM frame through a pipe). → { width, height, rgba } */
export function decodeImageRgba(abs, { signal, onChild, timeoutMs = 120_000 } = {}) {
  if (signal?.aborted) return Promise.reject(createAbortError())
  const { ffmpeg } = resolveBinaries()
  return new Promise((resolveP, rejectP) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-v', 'error', '-i', abs, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'pam', '-pix_fmt', 'rgba', '-'], { windowsHide: true })
    onChild?.(child)
    const chunks = []
    let err = ''
    const timer = setTimeout(() => killProcessTree(child), timeoutMs)
    const onAbort = () => killProcessTree(child)
    signal?.addEventListener?.('abort', onAbort, { once: true })
    child.stdout.on('data', (d) => chunks.push(d))
    child.stderr.on('data', (d) => {
      if (err.length < 2000) err += d
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      rejectP(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (signal?.aborted) return rejectP(createAbortError())
      const buf = Buffer.concat(chunks)
      const end = buf.indexOf('ENDHDR\n')
      if (code !== 0 || end < 0) return rejectP(coded(`读不了这张图片：${err.slice(-200) || `ffmpeg exit ${code}`}`, 'UNSUPPORTED_IMAGE'))
      const head = buf.toString('latin1', 0, end)
      const num = (k) => Number((new RegExp(`${k}\\s+(\\d+)`).exec(head) || [])[1] || 0)
      const width = num('WIDTH')
      const height = num('HEIGHT')
      if (num('DEPTH') !== 4 || num('MAXVAL') !== 255 || !width || !height) return rejectP(coded('图片格式不支持', 'UNSUPPORTED_IMAGE'))
      const data = buf.subarray(end + 7, end + 7 + width * height * 4)
      if (data.length !== width * height * 4) return rejectP(coded('图片数据不完整', 'UNSUPPORTED_IMAGE'))
      resolveP({ width, height, rgba: Buffer.from(data) })
    })
  })
}

/**
 * Build `tha-512.png` (the THA3 input) from the character's portrait + face marks and record it on the character
 * (saveCharacterTha). Re-used while the character version and the framing rules are unchanged (unless `force`).
 */
export async function prepareThaImage(character, { force = false, signal, onChild } = {}) {
  if (!character?.id || !character?.dir) throw coded('没有找到这个动漫形象', 'UNSUPPORTED_IMAGE')
  const { characterFileAbs, saveCharacterTha } = await import('./anime-character.js')
  const portraitAbs = characterFileAbs(character, character.portrait)
  if (!portraitAbs || !existsSync(portraitAbs)) throw coded('这个动漫形象还没有人物图，请先在形象库里生成', 'UNSUPPORTED_IMAGE')
  const outAbs = join(character.dir, THA_IMAGE_NAME)
  const tha = character.tha || {}
  const fresh = tha.ok && tha.image === THA_IMAGE_NAME && Number(tha.version) === Number(character.version) && Number(tha.framingVersion) === THA_FRAMING_VERSION && existsSync(outAbs)
  if (fresh && !force) return { path: outAbs, cached: true, framing: tha.framing || null, note: tha.note || '' }
  const img = await decodeImageRgba(portraitAbs, { signal, onChild })
  const plan = planThaFraming({ width: img.width, height: img.height, face: character.face })
  const canvas = renderThaCanvas(img, plan)
  // the head box (x 192–320, y 64–192) must hold the face
  let inBox = 0
  for (let y = 64; y < 192; y++) for (let x = 192; x < 320; x++) if (canvas[(y * THA_IMAGE_SIZE + x) * 4 + 3] > 128) inBox++
  if (inBox < 128 * 128 * 0.25) throw coded('按标出的五官位置，脸没有落在模型需要的位置，请重新标记五官', 'UNSUPPORTED_IMAGE')
  writeFileAtomic(outAbs, encodePngRgba(canvas, THA_IMAGE_SIZE, THA_IMAGE_SIZE))
  const notes = [plan.note, character.face?.mouthOriginal === 'open' ? '原图的嘴是张开的，本地模型按闭嘴来画，嘴型可能不太准' : ''].filter(Boolean).join('；')
  const framing = { scale: Number(plan.scale.toFixed(5)), dx: Number(plan.dx.toFixed(2)), dy: Number(plan.dy.toFixed(2)) }
  await saveCharacterTha(character.id, { image: THA_IMAGE_NAME, ok: true, model: 'tha3', framingVersion: THA_FRAMING_VERSION, framing, note: notes })
  return { path: outAbs, cached: false, framing, note: notes }
}

/* --------------------------------------------------------------------------------------------- render clip */

function sha256File(abs) {
  return new Promise((resolveP, rejectP) => {
    const h = createHash('sha256')
    createReadStream(abs)
      .on('data', (d) => h.update(d))
      .on('error', rejectP)
      .on('end', () => resolveP(h.digest('hex')))
  })
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function copyAtomic(src, dest) {
  if (resolve(src).toLowerCase() === resolve(dest).toLowerCase()) return
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.${process.pid}.${Date.now()}.tmp`
  copyFileSync(src, tmp)
  renameSync(tmp, dest)
}

/** Even crop (with a 2 px margin) of a [x0, y0, x1, y1] box inside the frame, and the output size under maxHeight. */
export function planClipCrop(bbox, { frame = THA_IMAGE_SIZE, maxHeight = 720, margin = 2 } = {}) {
  let [x0, y0, x1, y1] = Array.isArray(bbox) && bbox.length === 4 ? bbox.map(Number) : [0, 0, frame, frame]
  if (!(x1 > x0 && y1 > y0)) [x0, y0, x1, y1] = [0, 0, frame, frame]
  x0 = clamp(Math.floor(x0) - margin, 0, frame)
  y0 = clamp(Math.floor(y0) - margin, 0, frame)
  x1 = clamp(Math.ceil(x1) + margin, 0, frame)
  y1 = clamp(Math.ceil(y1) + margin, 0, frame)
  const even = (lo, hi) => {
    if ((hi - lo) % 2 === 0) return [lo, hi]
    if (hi < frame) return [lo, hi + 1]
    if (lo > 0) return [lo - 1, hi]
    return [lo, hi - 1]
  }
  ;[x0, x1] = even(x0, x1)
  ;[y0, y1] = even(y0, y1)
  const w = Math.max(2, x1 - x0)
  const h = Math.max(2, y1 - y0)
  const cap = Math.max(16, Math.floor(Number(maxHeight) || 720))
  let outW = w
  let outH = h
  if (h > cap) {
    outH = cap - (cap % 2)
    outW = Math.max(2, Math.round((w * outH) / h / 2) * 2)
  }
  return { x: x0, y: y0, w, h, outW, outH }
}

/** Run a child with stderr JSON-line events; resolves with { code, tail }. */
function watchJsonLines(stream, onEvent, onText) {
  let buf = ''
  stream.setEncoding('utf8')
  stream.on('data', (d) => {
    buf += d
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() || ''
    for (const line of lines) {
      const s = line.trim()
      if (!s) continue
      if (s.startsWith('{')) {
        try {
          onEvent(JSON.parse(s))
          continue
        } catch {}
      }
      onText(s)
    }
  })
  stream.on('end', () => {
    const s = buf.trim()
    if (!s) return
    try {
      onEvent(JSON.parse(s))
    } catch {
      onText(s)
    }
  })
}

const fmtSecs = (s) => (s >= 90 ? `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒` : `${Math.max(1, Math.round(s))} 秒`)

/**
 * Pass 1: venv Python renders the posed frames → stdout → FFmpeg → lossless FFV1 (alpha) intermediate. Resolves with
 * the renderer's result event ({ frames, bbox, fps, secs, device, ... }). Kills both process trees on abort / stall.
 */
function renderFrames({ cfg, device, variant, imageAbs, posesAbs, renderFps, totalFrames, tmpMkv, signal, onChild, onProgress, stallMs, startupMs, timeoutMs, runner = null }) {
  const { ffmpeg } = resolveBinaries()
  return new Promise((resolveP, rejectP) => {
    if (signal?.aborted) return rejectP(createAbortError())
    const ff = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${THA_IMAGE_SIZE}x${THA_IMAGE_SIZE}`, '-framerate', String(renderFps), '-i', 'pipe:0', '-c:v', 'ffv1', '-level', '3', '-slices', '4', '-pix_fmt', 'bgra', tmpMkv], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    // `runner` (tests only): { bin, args } replacing `<venv python> -I tha3_render.py`
    const py = spawn(runner?.bin || cfg.python, [...(runner ? runner.args || [] : ['-I', cfg.scripts.tha3]), '--models', cfg.tha3Dir, '--variant', variant, '--device', device, '--image', imageAbs, '--poses', posesAbs], { env: animeLocalPythonEnv(cfg), cwd: cfg.home, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    onChild?.(py)
    onChild?.(ff)
    let result = null
    let failure = null
    let pyText = ''
    let ffText = ''
    let lastProgress = Date.now()
    let started = false
    let settled = false
    let pyCode = null
    let ffCode = null
    const t0 = Date.now()
    let rateFrom = null // { at, done }: the speed is measured after the first frames (model warm-up excluded)
    const killAll = () => {
      killProcessTree(py)
      killProcessTree(ff)
    }
    const exited = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('close', r)))
    const finish = (err, val) => {
      if (settled) return
      settled = true
      clearInterval(watch)
      signal?.removeEventListener?.('abort', onAbort)
      if (err) {
        killAll()
        // reject once both processes are gone: until then Windows keeps their files (the temporary folder) locked
        Promise.race([Promise.all([exited(py), exited(ff)]), new Promise((r) => setTimeout(r, 8000))]).then(() => rejectP(err))
      } else resolveP(val)
    }
    const onAbort = () => finish(createAbortError())
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const watch = setInterval(() => {
      const idle = Date.now() - lastProgress
      if (timeoutMs > 0 && Date.now() - t0 > timeoutMs) finish(coded(`本地模型生成超时（超过 ${fmtSecs(timeoutMs / 1000)}），已停止`, 'TIMEOUT'))
      else if (idle > (started ? stallMs : startupMs)) finish(coded(started ? '本地模型太久没有进展，已停止（电脑可能太忙了，稍后再试）' : '本地模型启动太久没有反应，已停止（电脑可能太忙了，稍后再试）', 'TIMEOUT'))
    }, 1000)
    py.stdout.on('error', () => {})
    ff.stdin.on('error', () => {})
    py.stdout.pipe(ff.stdin)
    watchJsonLines(
      py.stderr,
      (ev) => {
        if (ev.event === 'loaded') {
          started = true
          lastProgress = Date.now()
        } else if (ev.event === 'progress') {
          started = true
          lastProgress = Date.now()
          const done = Number(ev.done) || 0
          const total = Number(ev.total) || totalFrames
          const pct = 8 + Math.round((done / Math.max(1, total)) * 80)
          if (!rateFrom) rateFrom = { at: Date.now(), done }
          const el = (Date.now() - rateFrom.at) / 1000
          const left = el > 1.5 && done > rateFrom.done ? (total - done) / ((done - rateFrom.done) / el) : 0
          onProgress?.({ message: `正在生成动漫形象画面：${done} / ${total} 帧${left > 3 ? `，大约还要 ${fmtSecs(left)}` : ''}`, pct })
        } else if (ev.event === 'result') result = ev
        else if (ev.event === 'error') failure = ev
      },
      (line) => {
        pyText = (pyText + '\n' + line).slice(-3000)
      },
    )
    ff.stderr.setEncoding('utf8')
    ff.stderr.on('data', (d) => {
      ffText = (ffText + d).slice(-2000)
    })
    const done = () => {
      if (pyCode === null || ffCode === null) return
      if (settled) return
      if (pyCode !== 0 || !result) {
        const code = failure?.code || ''
        const err = coded(`本地模型生成失败：${failure?.message || pyText.trim().split('\n').slice(-3).join(' ').slice(-300) || `Python 退出码 ${pyCode}`}`, 'PROVIDER_ERROR', { rendererCode: code, exitCode: pyCode })
        return finish(err)
      }
      if (ffCode !== 0 || !existsSync(tmpMkv)) return finish(coded(`保存画面失败：${ffText.slice(-300) || `ffmpeg 退出码 ${ffCode}`}`, 'PROVIDER_ERROR'))
      finish(null, { ...result, wallSecs: (Date.now() - t0) / 1000 })
    }
    py.on('error', (e) => finish(coded(`启动本地模型失败：${e.message}`, 'NOT_INSTALLED')))
    ff.on('error', (e) => finish(coded(`启动 FFmpeg 失败：${e.message}`, 'PROVIDER_ERROR')))
    py.on('close', (code) => {
      pyCode = code ?? 1
      if (pyCode !== 0) {
        try {
          ff.stdin.end()
        } catch {}
      }
      done()
    })
    ff.on('close', (code) => {
      ffCode = code ?? 1
      if (ffCode !== 0 && pyCode === null) killProcessTree(py)
      done()
    })
  })
}

/** Pass 2: crop to the visible union, repeat frames up to `fps`, cut to the audio's length, VP9 + alpha WebM. */
async function encodeClip({ tmpMkv, outWebm, crop, fps, durationSec, signal, onChild }) {
  const { ffmpeg } = resolveBinaries()
  const vf = [`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`]
  if (crop.outH !== crop.h) vf.push(`scale=${crop.outW}:${crop.outH}:flags=lanczos`)
  vf.push(`fps=${fps}`, 'format=yuva420p')
  // crf 20: crisp lines for a few hundred KB per minute (the alpha plane is coded the same way)
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmpMkv, '-vf', vf.join(','), '-t', durationSec.toFixed(3), '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '20', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '8', '-metadata:s:v:0', 'alpha_mode=1', outWebm]
  await runSimple(ffmpeg, args, { signal, onChild, timeoutMs: Math.max(300_000, durationSec * 20_000) })
  if (!existsSync(outWebm) || statSync(outWebm).size < 64) throw coded('压制透明视频失败', 'PROVIDER_ERROR')
}

function runSimple(bin, args, { signal, onChild, timeoutMs = 300_000 } = {}) {
  return new Promise((resolveP, rejectP) => {
    if (signal?.aborted) return rejectP(createAbortError())
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    onChild?.(child)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      if (out.length < 200_000) out += d
    })
    child.stderr.on('data', (d) => {
      err = (err + d).slice(-3000)
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
    child.on('error', (e) => finish(coded(`启动失败：${e.message}`, 'PROVIDER_ERROR')))
    child.on('close', (code) => (code === 0 ? finish(null, { stdout: out, stderr: err }) : finish(coded(`处理视频失败：${err.slice(-300) || `exit ${code}`}`, 'PROVIDER_ERROR'))))
  })
}

async function probeClip(abs, { signal } = {}) {
  const { ffprobe } = resolveBinaries()
  const r = await runSimple(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:stream_tags=alpha_mode:format=duration', '-of', 'json', abs], { signal, timeoutMs: 60_000 })
  const j = JSON.parse(r.stdout || '{}')
  const s = j.streams?.[0] || {}
  return { codec: s.codec_name || '', width: Number(s.width) || 0, height: Number(s.height) || 0, alpha: String(s.tags?.alpha_mode ?? s.tags?.ALPHA_MODE ?? '') === '1', durationSec: Number(j.format?.duration) || 0 }
}

const inflight = new Map()

/** Cache folder of the clips next to `outAbs` (`.anime-cache/`). */
export function presenterCacheDir(outAbs) {
  return join(dirname(resolve(outAbs)), '.anime-cache')
}

/** The cache key of a clip: sha1(engine + character id + version + audio sha256 + options). */
export function presenterCacheKey({ characterId, characterVersion, audioSha256, options }) {
  return createHash('sha1').update(JSON.stringify([ANIME_LOCAL_ENGINE, characterId, Number(characterVersion) || 1, audioSha256, options])).digest('hex')
}

/**
 * Tier-2 presenter clip (ANIME-AVATAR.md engine interface): the character speaking `audioAbs` as a transparent
 * VP9 WebM at `outAbs`, from 0 to exactly the audio's length, cropped to the character. Cached by
 * sha1(engine + character.id + character.version + audio sha256 + options) in `.anime-cache/` next to `outAbs`.
 * Options beyond the contract: `device` ('cuda' | 'cpu'), `renderFps`, `timeoutMs` (0 = none), `stallMs` (no new frame for
 * that long → TIMEOUT), `startupMs` (model loading allowance); `_runner` is a test seam.
 * → { ok, path, durationSec, fps, width, height, engine, note, cached, device, variant, renderFps, renderSecs }
 */
export async function renderPresenterClip({ character, audioAbs, outAbs, fps = 30, maxHeight = 720, track = null, signal, onProgress, onChild, device: wantDevice = '', renderFps: wantRenderFps = 0, timeoutMs = 0, stallMs = 240_000, startupMs = 420_000, _runner = null } = {}) {
  if (signal?.aborted) throw createAbortError()
  if (!character?.id || !character?.dir) throw coded('没有找到这个动漫形象', 'UNSUPPORTED_IMAGE')
  if (!audioAbs || !existsSync(audioAbs)) throw coded('没有找到这段配音', 'PROVIDER_ERROR')
  if (!outAbs) throw coded('没有指定输出文件', 'PROVIDER_ERROR')
  const status = getAnimeLocalStatus()
  if (!status.ready) throw coded('本地动漫模型还没有安装（设置 → 动漫形象 → 安装本地模型）', 'NOT_INSTALLED')
  const cfg = resolveAnimeLocalConfig()
  const rate = clamp(Math.round(Number(fps) || 30), 10, 60)
  const variants = status.tha3.variants || []
  const pickVariant = (dev) => (dev === 'cuda' && variants.includes(THA3_DEVICE_VARIANT.cuda) ? THA3_DEVICE_VARIANT.cuda : variants.includes(THA3_DEVICE_VARIANT.cpu) ? THA3_DEVICE_VARIANT.cpu : variants[0])
  let device = wantDevice === 'cpu' || wantDevice === 'cuda' ? wantDevice : status.device === 'cuda' ? 'cuda' : 'cpu'
  if (device === 'cpu' && !variants.includes(THA3_DEVICE_VARIANT.cpu) && !variants.includes('standard_float')) throw coded('本地模型缺少 CPU 版本，请重新安装', 'NOT_INSTALLED')
  onProgress?.({ message: '正在准备本地动漫模型…', pct: 1 })
  const audioSha = await sha256File(audioAbs)
  const outDir = presenterCacheDir(outAbs)
  mkdirSync(outDir, { recursive: true })

  const attempt = async (dev, note = '') => {
    const variant = pickVariant(dev)
    const renderFps = clamp(Math.round(Number(wantRenderFps) || (dev === 'cuda' ? rate : Math.min(rate, CPU_RENDER_FPS))), 5, rate)
    const options = { fps: rate, maxHeight: Number(maxHeight) || 720, renderFps, variant, pose: THA_POSE_VERSION, framing: THA_FRAMING_VERSION }
    const key = presenterCacheKey({ characterId: character.id, characterVersion: character.version, audioSha256: audioSha, options })
    const cacheAbs = join(outDir, `tha3-${key}.webm`)
    const metaAbs = `${cacheAbs}.json`
    const meta = readJson(metaAbs)
    if (meta?.key === key && existsSync(cacheAbs) && statSync(cacheAbs).size === meta.bytes) {
      copyAtomic(cacheAbs, outAbs)
      onProgress?.({ message: '已有生成好的动漫形象视频，直接使用', pct: 100 })
      return { ok: true, path: resolve(outAbs), durationSec: meta.durationSec, fps: meta.fps, width: meta.width, height: meta.height, engine: ANIME_LOCAL_ENGINE, note: meta.note, cached: true, device: meta.device, variant: meta.variant, renderFps: meta.renderFps, renderSecs: 0 }
    }
    if (inflight.has(key)) {
      await inflight.get(key)
      return attempt(dev, note)
    }
    const job = (async () => {
      const { durationSec } = await probeAudioDuration(audioAbs, rate)
      if (!(durationSec > 0)) throw coded('读不出这段配音的长度', 'PROVIDER_ERROR')
      let tr = track
      if (!tr || !Array.isArray(tr.open)) {
        onProgress?.({ message: '正在分析声音，安排嘴型和动作…', pct: 3 })
        tr = await computeVisemeTrack({ audioAbs, fps: rate, signal, onChild })
      }
      onProgress?.({ message: '正在准备动漫形象的输入图…', pct: 5 })
      const tha = await prepareThaImage(character, { signal, onChild })
      const seed = (trackSeed(tr) ^ fnv1a(String(character.id))) >>> 0
      const poses = buildThaPoses(tr, { fps: renderFps, seed, durationSec })
      const tmpDir = join(outDir, `tmp-${key.slice(0, 12)}-${process.pid}`)
      mkdirSync(tmpDir, { recursive: true })
      const posesAbs = join(tmpDir, 'poses.json')
      const tmpMkv = join(tmpDir, 'frames.mkv')
      const tmpWebm = join(tmpDir, 'clip.webm')
      try {
        writeFileSync(posesAbs, JSON.stringify({ version: poses.version, fps: poses.fps, frames: poses.frames, names: poses.names, poses: poses.poses }))
        onProgress?.({ message: dev === 'cuda' ? '正在用显卡生成动漫形象画面…' : '正在用 CPU 生成动漫形象画面（较慢，请耐心等待）…', pct: 7 })
        const res = await renderFrames({
          cfg,
          device: dev,
          variant,
          imageAbs: tha.path,
          posesAbs,
          renderFps,
          totalFrames: poses.frames,
          tmpMkv,
          signal,
          onChild,
          onProgress,
          stallMs,
          startupMs: Math.max(stallMs, startupMs),
          runner: _runner,
          timeoutMs,
        })
        onProgress?.({ message: '正在压制透明背景视频…', pct: 90 })
        const crop = planClipCrop(res.bbox, { maxHeight })
        await encodeClip({ tmpMkv, outWebm: tmpWebm, crop, fps: rate, durationSec, signal, onChild })
        const probe = await probeClip(tmpWebm, { signal })
        if (Math.abs(probe.durationSec - durationSec) > 1 / rate + 0.05) throw coded(`生成的视频长度不对（${probe.durationSec.toFixed(2)} 秒 / 配音 ${durationSec.toFixed(2)} 秒）`, 'PROVIDER_ERROR')
        const how = dev === 'cuda' ? `本地显卡生成${status.gpu ? `（${status.gpu}）` : ''}` : `CPU 生成（每秒 ${renderFps} 帧）`
        const noteText = [note, `${how}，用时 ${fmtSecs(res.wallSecs || res.secs || 0)}`, tha.note].filter(Boolean).join('；')
        renameSync(tmpWebm, cacheAbs)
        const m = { key, engine: ANIME_LOCAL_ENGINE, characterId: character.id, characterVersion: character.version || 1, audioSha256: audioSha, options, durationSec: Math.round(durationSec * 1000) / 1000, clipDurationSec: probe.durationSec, fps: rate, width: probe.width, height: probe.height, alpha: probe.alpha, bytes: statSync(cacheAbs).size, device: res.device || dev, variant, renderFps, renderSecs: Math.round((res.wallSecs || 0) * 10) / 10, renderFpsMeasured: res.fps, vramPeakMb: res.vramPeakMb || 0, bbox: res.bbox, crop, note: noteText, createdAt: new Date().toISOString() }
        writeFileAtomic(metaAbs, JSON.stringify(m, null, 2))
        copyAtomic(cacheAbs, outAbs)
        onProgress?.({ message: '动漫形象视频已生成', pct: 100 })
        return { ok: true, path: resolve(outAbs), durationSec: m.durationSec, fps: rate, width: m.width, height: m.height, engine: ANIME_LOCAL_ENGINE, note: noteText, cached: false, device: m.device, variant, renderFps, renderSecs: m.renderSecs }
      } finally {
        // a killed FFmpeg / Python can hold its files for a moment on Windows
        try {
          rmSync(tmpDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 })
        } catch {}
      }
    })()
    inflight.set(key, job.catch(() => {}))
    try {
      return await job
    } finally {
      inflight.delete(key)
    }
  }

  try {
    return await attempt(device)
  } catch (err) {
    // the GPU is busy / out of memory / not usable: render on the CPU instead (slower) when its model is installed
    const gpuProblem = err?.rendererCode === 'CUDA_OOM' || err?.rendererCode === 'NO_CUDA'
    if (device === 'cuda' && gpuProblem && !signal?.aborted && variants.includes(THA3_DEVICE_VARIANT.cpu)) {
      device = 'cpu'
      onProgress?.({ message: err.rendererCode === 'CUDA_OOM' ? '显卡显存不够，改用 CPU 慢速生成…' : '显卡暂时用不了，改用 CPU 慢速生成…', pct: 8 })
      return attempt('cpu', err.rendererCode === 'CUDA_OOM' ? '显卡显存不够，改用了 CPU' : '显卡用不了，改用了 CPU')
    }
    throw err
  }
}

/* ---------------------------------------------------------------------------------------- photo → anime */

const STYLIZE_ERRORS = {
  NO_FACE: ['照片里没找到清楚的正脸，请换一张正面、光线好、脸比较大的照片', 'UNSUPPORTED_IMAGE'],
  NO_PERSON: ['照片里没找到人，请换一张人像照片', 'UNSUPPORTED_IMAGE'],
  BAD_IMAGE: ['读不了这张照片，请换一张 PNG / JPG 照片', 'UNSUPPORTED_IMAGE'],
  NOT_INSTALLED: ['本地照片动漫化模型还没有安装（设置 → 动漫形象 → 安装本地模型）', 'NOT_INSTALLED'],
  MODEL_MISSING: ['本地照片动漫化模型的文件不完整，请重新安装', 'NOT_INSTALLED'],
}

/**
 * The user's photo → an anime likeness with a transparent background (DCT-Net + U²-Net cut-out, CPU, free).
 * `style`: a character-library style (anime / cartoon3d / chibi / flat) or a DCT-Net style id; DCT-Net has the styles
 * anime, 3d, design, handdrawn, sketch, artstyle, illustration (chibi and flat use `design`, the closest).
 * → { path: outAbs, engine: 'dct-net', model, style, styles, faces, note }
 */
export async function stylizePortraitLocal({ inAbs, outAbs, style = 'anime', signal, onChild, onProgress, timeoutMs = 600_000, _runner = null } = {}) {
  if (signal?.aborted) throw createAbortError()
  if (!inAbs || !existsSync(inAbs)) throw coded('没有找到这张照片', 'UNSUPPORTED_IMAGE')
  if (!outAbs) throw coded('没有指定输出文件', 'PROVIDER_ERROR')
  const status = getAnimeLocalStatus()
  if (!status.stylizeReady) throw coded(STYLIZE_ERRORS.NOT_INSTALLED[0], 'NOT_INSTALLED')
  const cfg = resolveAnimeLocalConfig()
  const dct = STYLE_TO_DCTNET[style] || (DCTNET_STYLES[style] ? style : 'anime')
  mkdirSync(dirname(resolve(outAbs)), { recursive: true })
  const stageText = { loading: '正在加载照片动漫化模型…', stylizing: '正在把照片画成动漫风格…', 'cutting out': '正在抠出人物…' }
  return new Promise((resolveP, rejectP) => {
    // `_runner` (tests only): { bin, args } replacing `<venv python> -I anime_stylize.py`
    const child = spawn(_runner?.bin || cfg.python, [...(_runner ? _runner.args || [] : ['-I', cfg.scripts.stylize]), '--models', cfg.modelsDir, '--style', dct, '--input', resolve(inAbs), '--output', resolve(outAbs)], { env: animeLocalPythonEnv(cfg), cwd: cfg.home, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    onChild?.(child)
    let result = null
    let failure = null
    let text = ''
    let settled = false
    const finish = (err, val) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (err) {
        killProcessTree(child)
        rejectP(err)
      } else resolveP(val)
    }
    const onAbort = () => finish(createAbortError())
    signal?.addEventListener?.('abort', onAbort, { once: true })
    const timer = setTimeout(() => finish(coded('本地照片动漫化太久没有完成，已停止', 'TIMEOUT')), timeoutMs)
    watchJsonLines(
      child.stdout,
      (ev) => {
        if (ev.event === 'progress') onProgress?.({ message: stageText[ev.message] || '正在处理照片…', pct: 20 + Math.round((Number(ev.pct) || 0) * 0.5) })
        else if (ev.event === 'result') result = ev
        else if (ev.event === 'error') failure = ev
      },
      (line) => {
        text = (text + '\n' + line).slice(-2000)
      },
    )
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d) => {
      text = (text + d).slice(-3000)
    })
    child.on('error', (e) => finish(coded(`启动本地模型失败：${e.message}`, 'NOT_INSTALLED')))
    child.on('close', (code) => {
      if (settled) return
      if (code === 0 && result?.ok && existsSync(outAbs)) {
        const notes = []
        if (dct !== style && !DCTNET_STYLES[style]) notes.push(style === 'chibi' || style === 'flat' ? '本地模型没有这个风格，用「萌系插画」代替' : '')
        if (result.style && result.style !== dct) notes.push(`本地没有装「${DCTNET_STYLES[dct]?.label || dct}」风格，用「${DCTNET_STYLES[result.style]?.label || result.style}」代替`)
        if (result.faces > 1) notes.push('照片里有好几个人，用了最大的那张脸')
        return finish(null, { path: resolve(outAbs), engine: 'dct-net', model: `DCT-Net ${result.style}（ModelScope iic，Apache-2.0）+ U²-Net 人像分割`, style: result.style, styles: result.styles || [], faces: result.faces, secs: result.secs, note: notes.filter(Boolean).join('；') })
      }
      const known = STYLIZE_ERRORS[failure?.code]
      if (known) return finish(coded(known[0], known[1]))
      finish(coded(`本地照片动漫化失败：${failure?.message || text.trim().split('\n').slice(-2).join(' ').slice(-300) || `退出码 ${code}`}`, 'PROVIDER_ERROR'))
    })
  })
}
