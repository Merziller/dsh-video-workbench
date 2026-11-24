/**
 * 动漫形象 · 免费档的口型图和闭眼图 (free tier mouth / blink pictures) + the small image helpers of the character library.
 *
 * From the character's portrait and the face marks (mouth and eye centres, 0..1 of the portrait) this draws, once per
 * character version, a few transparent patches the renderers lay over the portrait frame by frame:
 *   m-half / m-a / m-o / m-i .png — the mouth half open, open 「a」, round 「o」, wide 「i」 (teeth showing)
 *   m-closed.png                  — only when the original picture's mouth is open (then 「closed」 is drawn too)
 *   eyes-closed.png               — both eyes closed (a blink)
 * Each patch first paints the character's own skin colour over the original mouth / eyes (soft edge), then draws the
 * new shape in the character's own line colour — so it matches the picture's style. Plain JavaScript (4×4 super-
 * sampled anti-aliasing) + FFmpeg for PNG reading / writing: local, free, no GPU.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createAbortError, resolveBinaries } from '../shared/index.js'

export const SPRITE_VERSION = 1
export const MOUTH_SHAPES = ['half', 'a', 'o', 'i']

const r3 = (v) => Number(Number(v || 0).toFixed(3))
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/* -------------------------------------------------------------------------------------------- process helpers */

function runBuffer(bin, args, { input = null, signal, onChild, timeoutMs = 120_000 } = {}) {
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
      finish(new Error('处理图片超时'))
    }, timeoutMs)
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => (err = (err + d).slice(-3000)))
    child.on('error', (e) => finish(e))
    child.on('close', (code) => (code === 0 ? finish(null, Buffer.concat(out)) : finish(new Error(err.trim().split(/\r?\n/).slice(-2).join(' | ') || `exit ${code}`))))
    if (input) {
      child.stdin.on('error', () => {})
      child.stdin.end(input)
    }
  })
}

/** Decode a picture to RGBA, scaled down to at most `maxSide` (even sizes). → { rgba, width, height } */
export async function readImageRgba(abs, { maxSide = 1024, signal, onChild } = {}) {
  const { ffmpeg, ffprobe } = resolveBinaries()
  const probe = await runBuffer(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', abs], { signal, onChild })
  const s = (JSON.parse(probe.toString('utf8') || '{}').streams || [])[0] || {}
  const W = Number(s.width) || 0
  const H = Number(s.height) || 0
  if (!W || !H) throw Object.assign(new Error('读不出这张图片'), { code: 'UNSUPPORTED_IMAGE' })
  const k = Math.min(1, maxSide / Math.max(W, H))
  const width = Math.max(2, Math.round((W * k) / 2) * 2)
  const height = Math.max(2, Math.round((H * k) / 2) * 2)
  const buf = await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-i', abs, '-frames:v', '1', '-vf', `scale=${width}:${height}:flags=lanczos,format=rgba`, '-f', 'rawvideo', '-'], { signal, onChild })
  if (buf.length < width * height * 4) throw Object.assign(new Error('读不出这张图片的像素'), { code: 'UNSUPPORTED_IMAGE' })
  return { rgba: buf.subarray(0, width * height * 4), width, height }
}

/** Write RGBA pixels as a PNG (atomic: temp file + rename). */
export async function writePngRgba(abs, rgba, width, height, { signal, onChild } = {}) {
  mkdirSync(dirname(abs), { recursive: true })
  const tmp = `${abs}.${process.pid}.tmp.png`
  const { ffmpeg } = resolveBinaries()
  await runBuffer(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-i', '-', '-frames:v', '1', tmp], { input: rgba, signal, onChild })
  try {
    if (existsSync(abs)) unlinkSync(abs)
  } catch {}
  renameSync(tmp, abs)
  return abs
}

/* ------------------------------------------------------------------------------------------------ face marks */

const DEFAULT_FACE = {
  mouth: { x: 0.5, y: 0.36, w: 0.1 },
  eyes: [
    { x: 0.42, y: 0.27, w: 0.08 },
    { x: 0.58, y: 0.27, w: 0.08 },
  ],
  mouthOriginal: 'closed',
}

/**
 * A first guess of where the mouth and eyes are (the user confirms or moves them by clicking). In a half-length
 * portrait the head is the top blob above the narrowest row (the neck); an anime face puts the eyes a bit below the
 * middle of that blob and the mouth near its lower end.
 */
export function guessFaceMarks(rgba, w, h) {
  if (!rgba || !w || !h) return JSON.parse(JSON.stringify(DEFAULT_FACE))
  const rows = new Array(h)
  let top = -1
  for (let y = 0; y < h; y++) {
    let x0 = -1
    let x1 = -1
    let n = 0
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= 128) {
        if (x0 < 0) x0 = x
        x1 = x
        n++
      }
    }
    rows[y] = { x0, x1, n }
    if (top < 0 && n > w * 0.02) top = y
  }
  if (top < 0) return JSON.parse(JSON.stringify(DEFAULT_FACE))
  const figH = h - top
  // the neck: the narrowest row between 18 % and 55 % of the figure (a little smoothing against stray hair strands)
  let neck = -1
  let best = Infinity
  for (let y = top + Math.round(figH * 0.18); y < top + Math.round(figH * 0.55) && y < h - 2; y++) {
    const n = (rows[y - 1].n + rows[y].n + rows[y + 1].n) / 3
    if (n > 0 && n < best) {
      best = n
      neck = y
    }
  }
  // a neck is only believable when the shoulders below are clearly wider
  const below = neck > 0 ? Math.max(...rows.slice(neck, Math.min(h, neck + Math.round(figH * 0.25))).map((r) => r.n)) : 0
  const headH = neck > 0 && below > best * 1.35 ? neck - top : Math.round(figH * 0.42)
  const headRows = rows.slice(top + Math.round(headH * 0.3), top + Math.round(headH * 0.85)).filter((r) => r.n > 0)
  const cx = headRows.length ? headRows.reduce((s, r) => s + (r.x0 + r.x1) / 2, 0) / headRows.length : w / 2
  const headW = headRows.length ? headRows.map((r) => r.n).sort((a, b) => a - b)[Math.floor(headRows.length / 2)] : w * 0.4
  const faceW = headW * 0.72
  const detected = detectFaceFeatures(rgba, w, h, { top, headH, headW, cx })
  if (detected) return detected
  const eyeY = top + headH * 0.56
  const mouthY = top + headH * 0.82
  const eyeW = faceW * 0.2
  return {
    mouth: { x: r3(cx / w), y: r3(mouthY / h), w: r3((faceW * 0.2) / w) },
    eyes: [
      { x: r3((cx - faceW * 0.21) / w), y: r3(eyeY / h), w: r3(eyeW / w) },
      { x: r3((cx + faceW * 0.21) / w), y: r3(eyeY / h), w: r3(eyeW / w) },
    ],
    mouthOriginal: 'closed',
    detected: false,
  }
}

/** 4-neighbour connected components of `mask` inside `box` → [{ area, x0, y0, x1, y1, cx, cy, edge }]. */
function maskComponents(mask, w, box) {
  const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = box
  const bw = bx1 - bx0 + 1
  const seen = new Uint8Array(bw * (by1 - by0 + 1))
  const stack = new Int32Array(seen.length)
  const out = []
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const li = (y - by0) * bw + (x - bx0)
      if (seen[li] || !mask[y * w + x]) continue
      seen[li] = 1
      let sp = 0
      stack[sp++] = li
      const c = { area: 0, x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0, edge: false }
      while (sp) {
        const q = stack[--sp]
        const qx = (q % bw) + bx0
        const qy = Math.floor(q / bw) + by0
        c.area++
        c.sx += qx
        c.sy += qy
        if (qx < c.x0) c.x0 = qx
        if (qx > c.x1) c.x1 = qx
        if (qy < c.y0) c.y0 = qy
        if (qy > c.y1) c.y1 = qy
        // touching the left / right / top edge of the face window = hair, face outline (not a facial feature)
        if (qx === bx0 || qx === bx1 || qy === by0) c.edge = true
        const visit = (nx, ny) => {
          if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) return
          const nl = (ny - by0) * bw + (nx - bx0)
          if (!seen[nl] && mask[ny * w + nx]) {
            seen[nl] = 1
            stack[sp++] = nl
          }
        }
        visit(qx - 1, qy)
        visit(qx + 1, qy)
        visit(qx, qy - 1)
        visit(qx, qy + 1)
      }
      c.cx = c.sx / c.area
      c.cy = c.sy / c.area
      out.push(c)
    }
  }
  return out
}

/**
 * Find the eyes and the mouth of a clean anime / cartoon face: in the face window, the dark strokes (lashes, irises,
 * mouth line — well below the skin's brightness) form blobs; the eyes are the biggest pair of blobs side by side
 * around the face's middle, the mouth the blob below them on the middle line. Null when no believable pair is found
 * (the proportional guess is used and the user is asked to click).
 */
export function detectFaceFeatures(rgba, w, h, { top, headH, headW, cx }) {
  const box = {
    x0: clamp(Math.round(cx - headW * 0.48), 0, w - 1),
    x1: clamp(Math.round(cx + headW * 0.48), 0, w - 1),
    y0: clamp(Math.round(top + headH * 0.22), 0, h - 1),
    y1: clamp(Math.round(top + headH * 1.02), 0, h - 1),
  }
  if (box.x1 - box.x0 < 24 || box.y1 - box.y0 < 24) return null
  // skin = the most common bright colour in the lower middle of the face
  const bins = new Map()
  const sy0 = Math.round(top + headH * 0.45)
  const sy1 = Math.min(h - 1, Math.round(top + headH * 0.95))
  for (let y = sy0; y <= sy1; y += 2) {
    for (let x = Math.round(cx - headW * 0.25); x <= Math.round(cx + headW * 0.25); x += 2) {
      if (x < 0 || x >= w) continue
      const i = (y * w + x) * 4
      if (rgba[i + 3] < 200) continue
      const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4)
      const b = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 }
      b.n++
      b.r += rgba[i]
      b.g += rgba[i + 1]
      b.b += rgba[i + 2]
      bins.set(k, b)
    }
  }
  let skinBin = null
  for (const b of bins.values()) {
    const l = lum(b.r / b.n, b.g / b.n, b.b / b.n)
    if (l < 110) continue
    if (!skinBin || b.n > skinBin.n) skinBin = b
  }
  if (!skinBin) return null
  const skinLum = lum(skinBin.r / skinBin.n, skinBin.g / skinBin.n, skinBin.b / skinBin.n)
  const mask = new Uint8Array(w * h)
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = (y * w + x) * 4
      if (rgba[i + 3] >= 200 && lum(rgba[i], rgba[i + 1], rgba[i + 2]) < skinLum * 0.62) mask[y * w + x] = 1
    }
  }
  const minArea = Math.max(6, (headW * 0.025) ** 2)
  const blobs = maskComponents(mask, w, box).filter((c) => !c.edge && c.area >= minArea && c.x1 - c.x0 + 1 <= headW * 0.42 && c.y1 - c.y0 + 1 <= headH * 0.35)
  let pair = null
  for (let i = 0; i < blobs.length; i++) {
    for (let j = i + 1; j < blobs.length; j++) {
      const [a, b] = blobs[i].cx < blobs[j].cx ? [blobs[i], blobs[j]] : [blobs[j], blobs[i]]
      if (!(a.cx < cx && b.cx > cx)) continue
      const dist = b.cx - a.cx
      if (dist < headW * 0.18 || dist > headW * 0.8 || Math.abs(a.cy - b.cy) > dist * 0.25) continue
      if (Math.min(a.area, b.area) / Math.max(a.area, b.area) < 0.35) continue
      const asym = Math.abs((a.cx + b.cx) / 2 - cx) / headW
      const score = (a.area + b.area) * (1 - Math.min(0.8, asym * 3))
      if (!pair || score > pair.score) pair = { a, b, score, dist }
    }
  }
  if (!pair) return null
  const { a, b, dist } = pair
  const eyeY = (a.cy + b.cy) / 2
  const midX = (a.cx + b.cx) / 2
  const eye = (c) => ({
    x: r3((c.x0 + c.x1 + 1) / 2 / w),
    y: r3((c.y0 + c.y1 + 1) / 2 / h),
    w: r3(((c.x1 - c.x0 + 1) * 1.12) / w),
    h: r3(((c.y1 - c.y0 + 1) * 1.25) / h),
  })
  // the mouth: below the eyes on the middle line (the nose, when drawn, is smaller and higher)
  let mouth = null
  for (const c of blobs) {
    if (c === a || c === b) continue
    if (Math.abs(c.cx - midX) > dist * 0.4 || c.cy < eyeY + dist * 0.45 || c.cy > eyeY + dist * 1.7) continue
    const score = c.area * (1 + (0.5 * (c.cy - eyeY)) / dist)
    if (!mouth || score > mouth.score) mouth = { c, score }
  }
  const mw = mouth ? Math.max((mouth.c.x1 - mouth.c.x0 + 1) * 1.25, dist * 0.26) : dist * 0.3
  return {
    mouth: mouth ? { x: r3((mouth.c.x0 + mouth.c.x1 + 1) / 2 / w), y: r3((mouth.c.y0 + mouth.c.y1 + 1) / 2 / h), w: r3(mw / w) } : { x: r3(midX / w), y: r3((eyeY + dist * 0.9) / h), w: r3(mw / w) },
    eyes: [eye(a), eye(b)],
    mouthOriginal: mouth && mouth.c.y1 - mouth.c.y0 + 1 > dist * 0.16 ? 'open' : 'closed',
    detected: mouth ? 'eyes+mouth' : 'eyes',
  }
}

/* ------------------------------------------------------------------------------------------------ colours */

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

function medianColor(list) {
  if (!list.length) return null
  const ch = (k) => list.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(list.length / 2)]
  return { r: ch(0), g: ch(1), b: ch(2) }
}

/** Opaque pixels of a box (clipped), as [r, g, b, lum]. */
function samplePixels(rgba, w, h, x0, y0, x1, y1, keep = () => true) {
  const out = []
  const xa = clamp(Math.floor(x0), 0, w - 1)
  const xb = clamp(Math.ceil(x1), 0, w - 1)
  const ya = clamp(Math.floor(y0), 0, h - 1)
  const yb = clamp(Math.ceil(y1), 0, h - 1)
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const i = (y * w + x) * 4
      if (rgba[i + 3] < 200 || !keep(x, y)) continue
      out.push([rgba[i], rgba[i + 1], rgba[i + 2], lum(rgba[i], rgba[i + 1], rgba[i + 2])])
    }
  }
  return out
}

/**
 * The character's skin colour (the bright, flat colour around the mouth, away from the line art) and line colour
 * (the darkest strokes of the eyes / mouth), plus the derived mouth colours.
 */
export function sampleFaceColors(rgba, w, h, face) {
  const mx = face.mouth.x * w
  const my = face.mouth.y * h
  const mw = Math.max(4, face.mouth.w * w)
  const ring = samplePixels(rgba, w, h, mx - mw * 1.4, my - mw * 0.9, mx + mw * 1.4, my + mw * 1.1, (x, y) => {
    const d = Math.hypot((x - mx) / (mw * 1.4), (y - my) / (mw * 1.0))
    return d > 0.55 && d <= 1
  })
  const bright = ring.sort((a, b) => b[3] - a[3]).slice(0, Math.max(1, Math.round(ring.length * 0.6)))
  const skin = medianColor(bright) || { r: 250, g: 226, b: 212 }
  const ey = (face.eyes[0].y + face.eyes[1].y) / 2
  const ew = Math.max(4, Math.max(face.eyes[0].w, face.eyes[1].w) * w)
  const box = samplePixels(rgba, w, h, Math.min(face.eyes[0].x, face.eyes[1].x) * w - ew, ey * h - ew, Math.max(face.eyes[0].x, face.eyes[1].x) * w + ew, my + mw * 0.6)
  const dark = box.sort((a, b) => a[3] - b[3]).slice(0, Math.max(1, Math.round(box.length * 0.05)))
  let line = medianColor(dark) || { r: 58, g: 42, b: 42 }
  if (lum(line.r, line.g, line.b) > lum(skin.r, skin.g, skin.b) * 0.6) line = { r: Math.round(skin.r * 0.25), g: Math.round(skin.g * 0.18), b: Math.round(skin.b * 0.18) }
  const mix = (a, b, t) => ({ r: Math.round(a.r * (1 - t) + b.r * t), g: Math.round(a.g * (1 - t) + b.g * t), b: Math.round(a.b * (1 - t) + b.b * t) })
  return {
    skin,
    line,
    inner: mix(line, { r: 128, g: 34, b: 46 }, 0.62),
    tongue: mix({ r: 222, g: 112, b: 120 }, skin, 0.25),
    teeth: { r: 252, g: 252, b: 250 },
  }
}

/* ------------------------------------------------------------------------------------------------ drawing */

/** A piecewise ellipse (flatter top, rounder bottom): normalised radius at (dx, dy). */
const lobe = (dx, dy, rx, rTop, rBottom) => Math.hypot(dx / rx, dy / (dy < 0 ? rTop : rBottom))

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1)
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t))
}

/** Distance from a point to the curve y = cy + depth·(1 − (x/half)²), |x| ≤ half (sampled polyline). */
function distToCurve(px, py, cx, cy, half, depth) {
  let best = Infinity
  const n = 16
  let prev = null
  for (let k = 0; k <= n; k++) {
    const x = -half + (2 * half * k) / n
    const p = { x: cx + x, y: cy + depth * (1 - (x / half) ** 2) }
    if (prev) best = Math.min(best, distToSegment(px, py, prev.x, prev.y, p.x, p.y))
    prev = p
  }
  return best
}

/**
 * Rasterise one patch: `paint(x, y)` → { c: {r,g,b}, a: 0..1 } | null at a sub-pixel position (patch coordinates),
 * 4×4 super-sampled. → RGBA Buffer.
 */
function rasterise(pw, ph, paint) {
  const out = Buffer.alloc(pw * ph * 4)
  const S = 4
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const p = paint(x + (sx + 0.5) / S, y + (sy + 0.5) / S)
          if (!p || p.a <= 0) continue
          r += p.c.r * p.a
          g += p.c.g * p.a
          b += p.c.b * p.a
          a += p.a
        }
      }
      if (a <= 0) continue
      const i = (y * pw + x) * 4
      out[i] = Math.round(r / a)
      out[i + 1] = Math.round(g / a)
      out[i + 2] = Math.round(b / a)
      out[i + 3] = Math.round((a / (S * S)) * 255)
    }
  }
  return out
}

/** Soft cover: 1 inside 86 % of the radius, fading to 0 at the edge (no ghost of the original strokes). */
const feather = (d) => (d <= 0.86 ? 1 : d >= 1 ? 0 : 1 - (d - 0.86) / 0.14)

/** The mouth geometry of each shape, in multiples of the mouth width (centre = the mouth mark). */
const MOUTH_GEOMETRY = {
  half: { rx: 0.3, top: 0.07, bottom: 0.13, dy: 0.02, tongue: 0 },
  a: { rx: 0.36, top: 0.11, bottom: 0.36, dy: 0.06, tongue: 0.55 },
  o: { rx: 0.22, top: 0.16, bottom: 0.25, dy: 0.05, tongue: 0.45 },
  i: { rx: 0.42, top: 0.06, bottom: 0.13, dy: 0.02, tongue: 0, teeth: true },
}

/** Patch box of the mouth, in portrait pixels (the mark sits 40 % down the patch). */
export function mouthPatchBox(face, w, h) {
  const mw = Math.max(6, face.mouth.w * w)
  const pw = Math.max(8, Math.round(mw * 1.9))
  const ph = Math.max(8, Math.round(mw * 1.5))
  const x = Math.round(face.mouth.x * w - pw / 2)
  const y = Math.round(face.mouth.y * h - ph * 0.4)
  return { x, y, w: pw, h: ph, mw }
}

/** One mouth patch (RGBA, box from mouthPatchBox). `shape`: closed | half | a | o | i. */
export function drawMouthPatch(shape, box, colors) {
  const { w: pw, h: ph, mw } = box
  const cx = pw / 2
  const cy = ph * 0.4
  const eraseRx = mw * 0.62
  const eraseRy = mw * 0.42
  const t = Math.max(1.1, mw * 0.055)
  const g = MOUTH_GEOMETRY[shape]
  return rasterise(pw, ph, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    if (g) {
      const oy = dy - g.dy * mw
      const d = lobe(dx, oy, g.rx * mw, g.top * mw, g.bottom * mw)
      if (d <= 1) {
        // teeth (i): the upper part of the opening; tongue (a / o): a round shape at the bottom
        if (g.teeth && oy < g.bottom * mw * 0.15) return { c: colors.teeth, a: 1 }
        if (g.tongue && Math.hypot(dx / (g.rx * mw * 0.62), (oy - g.bottom * mw * 0.62) / (g.bottom * mw * g.tongue)) <= 1) return { c: colors.tongue, a: 1 }
        return { c: colors.inner, a: 1 }
      }
      // outline: full width at the top, thinner at the bottom (anime style)
      const tt = oy < 0 ? t : t * 0.65
      const rmin = Math.min(g.rx, oy < 0 ? g.top : g.bottom) * mw
      if (d <= 1 + tt / Math.max(1, rmin)) return { c: colors.line, a: 1 }
    } else if (shape === 'closed') {
      // a short, slightly smiling line
      const half = mw * 0.28
      if (Math.abs(dx) <= half + t && distToCurve(x, y, cx, cy + mw * 0.05, half, -mw * 0.06) <= t * 0.6) return { c: colors.line, a: 1 }
    }
    const e = Math.hypot(dx / eraseRx, (dy - mw * 0.05) / eraseRy)
    return e < 1 ? { c: colors.skin, a: feather(e) } : null
  })
}

/** Eye size in portrait pixels: the marked width, and the marked height (or a typical anime eye: a bit taller than wide). */
const eyeSize = (e, w, h) => {
  const ew = Math.max(6, (Number(e.w) || 0.08) * w)
  return { ew, eh: Number(e.h) > 0 ? Math.max(6, e.h * h) : ew * 1.15 }
}

/** Patch box covering both eyes, in portrait pixels. */
export function blinkPatchBox(face, w, h) {
  const [l, r] = face.eyes[0].x <= face.eyes[1].x ? face.eyes : [face.eyes[1], face.eyes[0]]
  const sl = eyeSize(l, w, h)
  const sr = eyeSize(r, w, h)
  const x0 = Math.floor(l.x * w - sl.ew * 0.75)
  const x1 = Math.ceil(r.x * w + sr.ew * 0.75)
  const y0 = Math.floor(Math.min(l.y * h - sl.eh * 0.68, r.y * h - sr.eh * 0.68))
  const y1 = Math.ceil(Math.max(l.y * h + sl.eh * 0.68, r.y * h + sr.eh * 0.68))
  return { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) }
}

/** Both eyes closed (RGBA, box from blinkPatchBox): skin over each eye, a 「‿」 lash line with a flick at the outer corner. */
export function drawBlinkPatch(box, face, w, h, colors) {
  const [l, r] = face.eyes[0].x <= face.eyes[1].x ? face.eyes : [face.eyes[1], face.eyes[0]]
  const eyes = [
    { cx: l.x * w - box.x, cy: l.y * h - box.y, ...eyeSize(l, w, h), outer: -1 },
    { cx: r.x * w - box.x, cy: r.y * h - box.y, ...eyeSize(r, w, h), outer: 1 },
  ]
  return rasterise(box.w, box.h, (x, y) => {
    let skin = 0
    for (const e of eyes) {
      const t = Math.max(1.3, e.ew * 0.08)
      const half = e.ew * 0.5
      const ly = e.cy + e.eh * 0.08
      if (Math.abs(x - e.cx) <= half + t && distToCurve(x, y, e.cx, ly, half, e.eh * 0.12) <= t * 0.55) return { c: colors.line, a: 1 }
      // lash flick at the outer corner
      const ox = e.cx + e.outer * half
      if (distToSegment(x, y, ox, ly, ox + e.outer * e.ew * 0.16, ly - e.eh * 0.11) <= t * 0.45) return { c: colors.line, a: 1 }
      // a rounded rectangle (superellipse): covers the eye's corners — where the lash line ends — without growing taller
      const sx = Math.abs(x - e.cx) / (e.ew * 0.58)
      const sy = Math.abs(y - e.cy) / (e.eh * 0.6)
      const d = Math.pow(sx ** 4 + sy ** 4, 0.25)
      if (d < 1) skin = Math.max(skin, feather(d))
    }
    return skin > 0 ? { c: colors.skin, a: skin } : null
  })
}

/**
 * Draw and save every patch of a character into its folder. → the record's `sprites` block:
 * { source, version, mouths: { half, a, o, i, closed? }, blink, boxes: { mouth, blink } (0..1 of the portrait), colors }
 */
export async function buildCharacterSprites({ dir, rgba, width, height, face, signal, onChild } = {}) {
  const colors = sampleFaceColors(rgba, width, height, face)
  const mb = mouthPatchBox(face, width, height)
  const bb = blinkPatchBox(face, width, height)
  const mouths = {}
  const shapes = face.mouthOriginal === 'open' ? ['closed', ...MOUTH_SHAPES] : MOUTH_SHAPES
  for (const s of shapes) {
    if (signal?.aborted) throw createAbortError()
    const file = `m-${s}.png`
    await writePngRgba(join(dir, file), drawMouthPatch(s, mb, colors), mb.w, mb.h, { signal, onChild })
    mouths[s] = file
  }
  await writePngRgba(join(dir, 'eyes-closed.png'), drawBlinkPatch(bb, face, width, height, colors), bb.w, bb.h, { signal, onChild })
  const norm = (b) => ({ x: r3(b.x / width), y: r3(b.y / height), w: r3(b.w / width), h: r3(b.h / height) })
  return {
    source: 'procedural',
    version: SPRITE_VERSION,
    mouths,
    blink: 'eyes-closed.png',
    boxes: { mouth: norm(mb), blink: norm(bb) },
    colors: { skin: colors.skin, line: colors.line },
  }
}
