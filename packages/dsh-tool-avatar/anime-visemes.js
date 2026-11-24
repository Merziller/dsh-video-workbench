/**
 * 动漫形象数字人 · 声音 → 口型 / 眨眼 / 头部动作 (voice → motion), shared by every presenter tier (see ANIME-AVATAR.md).
 *
 * Language independent — no dictionary, no model: the loudness of the voice opens the mouth, the spectral shape picks
 * the vowel family (energy high up = spread lips 「i / e」, energy low and dark = rounded 「o / u」, otherwise the open
 * 「a」), and captions (optional) add exact word onsets. Thresholds adapt to each recording (percentiles of its own
 * voiced frames), so a deep or a bright voice both get the full range of shapes.
 *
 * computeVisemeTrack({ audioAbs, fps, captions }) → { fps, frames, durationSec, open[], shape[], vowels{a,i,u,e,o}[],
 * blink[], talk[], words[] }; analyzeVisemesFromPcm() is the same on decoded samples (unit tests).
 */
import { spawn } from 'node:child_process'
import { createAbortError, resolveBinaries } from '../shared/index.js'

export const VISEME_SHAPES = ['closed', 'half', 'a', 'o', 'i']
export const VISEME_VERSION = 1
const SR = 16000
const WIN = 1024 // 64 ms at 16 kHz
const BIN_HZ = SR / WIN

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))
const r2 = (v) => Math.round(v * 100) / 100

/** Decode any audio / video file to mono float samples at `sampleRate` (FFmpeg). */
export function decodeMonoPcm(fileAbs, { sampleRate = SR, signal, onChild, timeoutMs = 600_000 } = {}) {
  if (signal?.aborted) return Promise.reject(createAbortError())
  const { ffmpeg } = resolveBinaries()
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpeg, ['-hide_banner', '-v', 'error', '-i', fileAbs, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-'], { windowsHide: true })
    onChild?.(child)
    const chunks = []
    let err = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    const onAbort = () => child.kill('SIGKILL')
    signal?.addEventListener?.('abort', onAbort, { once: true })
    child.stdout.on('data', (d) => chunks.push(d))
    child.stderr.on('data', (d) => {
      if (err.length < 4000) err += d
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', onAbort)
      if (signal?.aborted) return reject(createAbortError())
      if (code !== 0) return reject(new Error(`读取声音失败：${err.slice(-300) || `ffmpeg exit ${code}`}`))
      const buf = Buffer.concat(chunks)
      const n = Math.floor(buf.length / 2)
      const out = new Float32Array(n)
      for (let k = 0; k < n; k++) out[k] = buf.readInt16LE(k * 2) / 32768
      resolvePromise(out)
    })
  })
}

/* --------------------------------------------------------------------------------------------------------- FFT */

const fftCache = new Map()
function fftTables(n) {
  if (fftCache.has(n)) return fftCache.get(n)
  const rev = new Uint32Array(n)
  const bits = Math.log2(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    rev[i] = r
  }
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = -Math.sin((2 * Math.PI * i) / n)
  }
  const hann = new Float64Array(n)
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  const t = { rev, cos, sin, hann }
  fftCache.set(n, t)
  return t
}

/** Power spectrum (bins 0..n/2) of `n` samples starting at `from` (zero padded at the edges), Hann windowed. */
function powerSpectrum(samples, from, n, re, im) {
  const { rev, cos, sin, hann } = fftTables(n)
  for (let i = 0; i < n; i++) {
    const s = from + i
    const v = s >= 0 && s < samples.length ? samples[s] * hann[i] : 0
    re[rev[i]] = v
    im[rev[i]] = 0
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]
        const wi = sin[k * step]
        const a = start + k
        const b = a + half
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
  const out = new Float64Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k]
  return out
}

const band = (p, lo, hi) => {
  let s = 0
  for (let k = Math.max(1, Math.floor(lo / BIN_HZ)); k <= Math.min(p.length - 1, Math.ceil(hi / BIN_HZ)); k++) s += p[k]
  return s
}

/** Rank (0..1) of each value among `ref` (sorted ascending). */
function rankIn(sortedRef, v) {
  if (!sortedRef.length) return 0.5
  let lo = 0
  let hi = sortedRef.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedRef[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo / sortedRef.length
}

/** A small deterministic random generator (the same voice always blinks the same way). */
function lcg(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* ---------------------------------------------------------------------------------------------------- analysis */

/**
 * Viseme track of mono `samples` at `sampleRate` (see the module comment). `captions` = [{ startSec, endSec, words:
 * [{ startSec }] }] on the same timeline (optional: word onsets for the bob / head nods).
 */
export function analyzeVisemesFromPcm(samples, sampleRate = SR, { fps = 30, captions = [] } = {}) {
  const rate = Number(fps) > 0 ? Number(fps) : 30
  const durationSec = samples.length / sampleRate
  const frames = Math.max(1, Math.ceil(durationSec * rate))
  const re = new Float64Array(WIN)
  const im = new Float64Array(WIN)
  const db = new Float64Array(frames)
  const hiR = new Float64Array(frames)
  const loR = new Float64Array(frames)
  const cen = new Float64Array(frames)
  for (let f = 0; f < frames; f++) {
    const center = Math.round(((f + 0.5) / rate) * sampleRate)
    const from = center - WIN / 2
    let sum = 0
    let cnt = 0
    for (let s = Math.max(0, from); s < Math.min(samples.length, from + WIN); s++) {
      sum += samples[s] * samples[s]
      cnt++
    }
    const rms = Math.sqrt(sum / Math.max(1, cnt))
    db[f] = rms > 1e-6 ? 20 * Math.log10(rms) : -120
    const p = powerSpectrum(samples, from, WIN, re, im)
    const total = band(p, 200, 4000) + 1e-12
    hiR[f] = band(p, 1800, 4000) / total
    loR[f] = band(p, 200, 900) / total
    let num = 0
    let den = 0
    for (let k = Math.floor(200 / BIN_HZ); k <= Math.ceil(4000 / BIN_HZ) && k < p.length; k++) {
      num += k * BIN_HZ * p[k]
      den += p[k]
    }
    cen[f] = den > 0 ? num / den : 0
  }
  // loudness → voice level 0..1 relative to this recording's loud speaking level (as talk-mascot.js voiceEnvelope)
  const loud = [...db].filter((x) => x > -100).sort((a, b) => a - b)
  const hi = loud.length ? loud[Math.floor(loud.length * 0.95)] : -20
  const floor = Math.max(-60, hi - 34)
  const level = new Float64Array(frames)
  for (let f = 0; f < frames; f++) level[f] = clamp01((db[f] - floor) / Math.max(6, hi - floor))
  // opening: fast attack, a slightly slower release, a little curve so quiet syllables still open
  const open = new Array(frames)
  let o = 0
  for (let f = 0; f < frames; f++) {
    const target = level[f] < 0.14 ? 0 : Math.pow(clamp01((level[f] - 0.14) / 0.6), 0.8)
    o = target > o ? o + (target - o) * 0.7 : o + (target - o) * 0.45
    open[f] = r2(o)
  }
  // spectral ranks among this voice's voiced frames
  const voiced = []
  for (let f = 0; f < frames; f++) if (level[f] >= 0.3) voiced.push(f)
  const sortHi = voiced.map((f) => hiR[f]).sort((a, b) => a - b)
  const sortLo = voiced.map((f) => loR[f]).sort((a, b) => a - b)
  const sortCen = voiced.map((f) => cen[f]).sort((a, b) => a - b)
  const raw = new Array(frames)
  const vowels = { a: new Array(frames), i: new Array(frames), u: new Array(frames), e: new Array(frames), o: new Array(frames) }
  for (let f = 0; f < frames; f++) {
    const op = open[f]
    const hr = rankIn(sortHi, hiR[f])
    const lr = rankIn(sortLo, loR[f])
    const cr = rankIn(sortCen, cen[f])
    const wI = clamp01((hr - 0.55) / 0.35)
    const wO = clamp01((Math.max(lr, 1 - cr) - 0.55) / 0.35) * (1 - wI)
    const wA = clamp01(1 - wI - wO)
    vowels.a[f] = r2(op * wA)
    vowels.i[f] = r2(op * wI * 0.6)
    vowels.e[f] = r2(op * wI * 0.4)
    vowels.o[f] = r2(op * wO * 0.6)
    vowels.u[f] = r2(op * wO * 0.4)
    if (op < 0.06) raw[f] = 'closed'
    else if (op < 0.32) raw[f] = 'half'
    else if (wI >= 0.5) raw[f] = 'i'
    else if (wO >= 0.5) raw[f] = 'o'
    else raw[f] = 'a'
  }
  // no one-frame flicker: a shape holds at least 2 frames (a lone frame takes its neighbour's shape)
  const shape = raw.slice()
  for (let f = 1; f < frames - 1; f++) {
    if (shape[f] !== shape[f - 1] && shape[f] !== shape[f + 1]) shape[f] = shape[f - 1]
  }
  // speaking activity (head motion): ~0.4 s moving average of the voice level
  const talk = new Array(frames)
  const half = Math.max(1, Math.round(rate * 0.2))
  let acc = 0
  const pref = new Float64Array(frames + 1)
  for (let f = 0; f < frames; f++) pref[f + 1] = pref[f] + (level[f] >= 0.14 ? level[f] : 0)
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - half)
    const b = Math.min(frames, f + half + 1)
    acc = (pref[b] - pref[a]) / (b - a)
    talk[f] = r2(clamp01(acc / 0.6))
  }
  // word onsets: captions when given, otherwise rises of the voice level after a short pause
  let words = []
  for (const c of Array.isArray(captions) ? captions : []) {
    const ws = Array.isArray(c?.words) && c.words.length ? c.words : [{ startSec: c?.startSec }]
    for (const w of ws) {
      const at = Number(w?.startSec)
      if (Number.isFinite(at) && at >= 0 && at <= durationSec + 0.5) words.push(Math.round(at * 1000) / 1000)
    }
  }
  if (!words.length) {
    let quiet = rate
    for (let f = 0; f < frames; f++) {
      if (level[f] < 0.14) quiet++
      else {
        if (quiet >= Math.round(rate * 0.12)) words.push(Math.round((f / rate) * 1000) / 1000)
        quiet = 0
      }
    }
  }
  words = [...new Set(words)].sort((a, b) => a - b)
  // blinks every 2.2–5.8 s (now and then a double blink), ~130 ms each, the same for the same recording
  const blink = new Array(frames).fill(0)
  const rnd = lcg(Math.round(durationSec * 1000) * 2654435761 + frames)
  const curve = [0.55, 1, 1, 0.5].map((v) => r2(v))
  let t = 1.2 + rnd() * 1.8
  while (t < durationSec - 0.3) {
    const at = Math.round(t * rate)
    for (let k = 0; k < curve.length && at + k < frames; k++) blink[at + k] = Math.max(blink[at + k], curve[k])
    if (rnd() < 0.18) {
      const again = at + curve.length + Math.round(rate * 0.12)
      for (let k = 0; k < curve.length && again + k < frames; k++) blink[again + k] = Math.max(blink[again + k], curve[k])
    }
    t += 2.2 + rnd() * 3.6
  }
  return { version: VISEME_VERSION, fps: rate, frames, durationSec: Math.round(durationSec * 1000) / 1000, open, shape, vowels, blink, talk, words }
}

/** Viseme track of an audio / video file (decoded at 16 kHz mono). */
export async function computeVisemeTrack({ audioAbs, fps = 30, captions = [], signal, onChild } = {}) {
  const samples = await decodeMonoPcm(audioAbs, { sampleRate: SR, signal, onChild })
  return analyzeVisemesFromPcm(samples, SR, { fps, captions })
}

/**
 * The compact form the renderers embed (script.json / talk pack): one character per frame for the mouth shape
 * (c=closed h=half a o i), the frames where a blink starts, and the word onsets.
 */
export function compactVisemeTrack(track) {
  const code = { closed: 'c', half: 'h', a: 'a', o: 'o', i: 'i' }
  const shapes = (track?.shape || []).map((s) => code[s] || 'c').join('')
  const blinks = []
  const b = track?.blink || []
  for (let f = 0; f < b.length; f++) if (b[f] >= 0.5 && (f === 0 || b[f - 1] < 0.5)) blinks.push(f)
  return { fps: track?.fps || 30, shapes, blinks, words: track?.words || [] }
}
