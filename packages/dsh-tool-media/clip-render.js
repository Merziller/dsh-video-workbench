/**
 * @dsh-video/tool-media — 长视频拆条: one clip rendered with FFmpeg (no browser — a one-minute clip takes seconds).
 *
 * Layouts for a 竖屏 / 3:4 / 横屏 target (ideas from AutoClip, https://github.com/zhouxiaoka/autoclip, MIT,
 * Copyright (c) 2024 AutoClip Team; written anew for this plugin):
 *   fit     the whole picture on a blurred, dimmed copy of itself — never cuts anyone off and keeps captions that are
 *           already burned into the recording whole (the default when the shapes differ)
 *   window  访谈小窗: the picture cut to 4:3 in a window on a dark canvas, title above, captions below (portrait only)
 *   crop    fill the canvas from the centre (one person in the middle of the frame)
 *   fill    the recording already has the target's shape: just scaled
 *   audio   a recording without picture: dark canvas, title, large captions
 * Captions that are already burned into the recording are detected (bright text with a dark edge, in the bottom third,
 * changing between samples — a static logo does not count) so a second caption track is not put on top of them.
 * Title, captions (the keyword of a line in the heavy weight and accent colour) and the progress line are one ASS file
 * drawn by libass with the plugin's own fonts (caption-fonts.js). Loudness is measured first and set to −14 LUFS with
 * peaks under −1 dBTP in the render (what the short-video platforms play at).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createAbortError, REPO_ROOT, resolveBinaries, runCommandRedirected } from '../shared/index.js'
import { ensureCaptionFonts } from '../shared/caption-fonts.js'
import { formatBalancedTitle } from './html-generator.js'
import { keepFrames } from './rough-cut.js'

/** Canvas sizes per target aspect. */
export const CLIP_CANVAS = Object.freeze({ '9:16': [1080, 1920], '3:4': [1080, 1440], '1:1': [1080, 1080], '16:9': [1920, 1080] })
export const CLIP_LAYOUTS = Object.freeze(['auto', 'fit', 'window', 'crop'])
export const CLIP_LOUDNESS = Object.freeze({ I: -14, TP: -1, LRA: 11 })
export const CLIP_ENCODE_VERSION = 1

/** even sizes (H.264 4:2:0) and even positions (0 allowed) */
const even = (x) => Math.max(2, Math.round(Number(x) / 2) * 2)
const evenPos = (x) => Math.max(0, Math.round(Number(x) / 2) * 2)
const r3 = (x) => Math.round(Number(x) * 1000) / 1000

/** Canvas for a target aspect; 'source' keeps the recording's shape (long side ≤ 1920, even sizes). */
export function canvasFor(aspect, probe = {}) {
  const preset = CLIP_CANVAS[aspect]
  if (preset) return { W: preset[0], H: preset[1], aspect }
  const w = Number(probe.width) || 1920
  const h = Number(probe.height) || 1080
  const k = Math.min(1, 1920 / Math.max(w, h))
  return { W: even(w * k), H: even(h * k), aspect: 'source' }
}

/** The layout actually used: same shape → fill; auto → fit; window needs a portrait canvas. */
export function chooseLayout(requested, { canvas, source, hasVideo = true } = {}) {
  if (!hasVideo || !source?.w || !source?.h) return 'audio'
  const ca = canvas.W / canvas.H
  const sa = source.w / source.h
  if (Math.abs(sa - ca) / ca < 0.08) return 'fill'
  if (requested === 'crop') return 'crop'
  if (requested === 'window' && canvas.H > canvas.W) return 'window'
  return 'fit'
}

/**
 * Where everything goes on the canvas: the picture (fg), the source crop (window / crop), title and caption styles,
 * the progress line. All numbers are canvas pixels.
 */
export function layoutGeometry(layout, canvas, source = {}) {
  const { W, H } = canvas
  const portrait = H > W * 1.05
  const square = !portrait && W <= H * 1.05
  const g = {
    layout,
    W,
    H,
    portrait,
    fg: null,
    crop: null,
    bg: '0x0D0F12',
    title: { fontSize: portrait ? (H >= 1800 ? 80 : 72) : square ? 70 : 72, maxLineChars: portrait || square ? 11 : 16, align: 8, marginV: Math.round(H * 0.11) },
    caption: { fontSize: portrait ? (H >= 1800 ? 68 : 62) : square ? 60 : 58, align: 2, marginV: Math.round(H * (portrait ? 0.26 : 0.07)), maxLineWidth: portrait || square ? 11 : 16 },
    bar: null,
    // a title over the picture stays for the first seconds only on a landscape / square canvas (it would cover the
    // picture); in a band of its own, or on a portrait canvas (抖音-style top title), it stays the whole clip
    titleSec: portrait ? 0 : 5,
  }
  const sw = Number(source.w) || W
  const sh = Number(source.h) || H
  if (layout === 'fit') {
    let fw = W
    let fh = even((W * sh) / sw)
    if (fh > H) {
      fh = H
      fw = even((H * sw) / sh)
    }
    const fx = evenPos((W - fw) / 2)
    const fy = portrait ? evenPos((H - fh) / 2 - H * 0.03) : evenPos((H - fh) / 2)
    g.fg = { x: fx, y: fy, w: fw, h: fh }
    if (portrait && fh < H * 0.8) {
      g.title = { ...g.title, align: 2, marginV: H - (fy - Math.round(H * 0.022)), band: [Math.round(H * 0.07), fy - Math.round(H * 0.022)] }
      g.caption = { ...g.caption, align: 8, marginV: fy + fh + Math.round(H * 0.035) }
      g.bar = { y: fy + fh, h: H >= 1800 ? 8 : 6 }
      g.titleSec = 0
    }
  } else if (layout === 'window') {
    const ww = W
    const wh = even((W * 3) / 4)
    const wy = evenPos((H - wh) * 0.42)
    g.fg = { x: 0, y: wy, w: ww, h: wh }
    // the 4:3 part of the recording: centred across, upper-middle down (faces sit in the upper half)
    if (sw / sh > 4 / 3) {
      const cw = even((sh * 4) / 3)
      g.crop = { w: cw, h: even(sh), x: evenPos((sw - cw) / 2), y: 0 }
    } else {
      const ch = even((sw * 3) / 4)
      g.crop = { w: even(sw), h: ch, x: 0, y: evenPos((sh - ch) * 0.3) }
    }
    g.title = { ...g.title, align: 2, marginV: H - (wy - Math.round(H * 0.025)), band: [Math.round(H * 0.07), wy - Math.round(H * 0.025)] }
    g.caption = { ...g.caption, align: 8, marginV: wy + wh + Math.round(H * 0.035) }
    g.bar = { y: wy + wh, h: H >= 1800 ? 8 : 6 }
    g.titleSec = 0
  } else if (layout === 'crop' || layout === 'fill') {
    // vertical anchor slightly above the middle when cutting a tall picture (heads stay in)
    g.cropBias = sh / sw > H / W ? 0.4 : 0.5
  } else if (layout === 'audio') {
    g.title = { ...g.title, align: 8, marginV: Math.round(H * (portrait ? 0.2 : 0.14)) }
    g.caption = { ...g.caption, fontSize: Math.round(g.caption.fontSize * 1.15), align: 5, marginV: 0 }
    g.bar = { y: Math.round(H * (portrait ? 0.72 : 0.8)), h: 6, inset: Math.round(W * 0.12) }
    g.titleSec = 0
  }
  // a title band too small for two lines: smaller type (a one-line title may use more of the band)
  if (g.title.band) {
    const room = g.title.band[1] - g.title.band[0]
    const full = g.title.fontSize
    g.title.fontSize = Math.max(44, Math.min(full, Math.floor(room / 2.6)))
    g.title.oneLineSize = Math.max(g.title.fontSize, Math.min(full, Math.floor(room / 1.35)))
  }
  return g
}

/* ------------------------------------------------------------------------------------------- burned-in captions */

const SAMPLE_W = 960
const SAMPLE_H = 192

/**
 * Burned-in captions from grey samples of the bottom 35 % of the picture (each `SAMPLE_W × SAMPLE_H` bytes): text =
 * bright pixels (≥ 200) with a dark pixel (< 80) within 2 px, in the middle 70 % across; a sample has text when such
 * pixels form a line; captions = text in ≥ 60 % of the samples (and ≥ 3) whose pixels CHANGE between samples (a logo
 * or watermark stays put). Returns { burned, textSamples, samples, overlap, band: [top, bottom] (fraction of height) }.
 */
export function analyzeSubtitleSamples(samples, { w = SAMPLE_W, h = SAMPLE_H, regionTop = 0.65 } = {}) {
  const x0 = Math.floor(w * 0.15)
  const x1 = Math.ceil(w * 0.85)
  const masks = []
  for (const buf of samples) {
    if (!buf || buf.length < w * h) continue
    // dark pixels dilated by 2 (separable box max)
    const dark = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) dark[i] = buf[i] < 80 ? 1 : 0
    const tmp = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0
        for (let d = -2; d <= 2 && !v; d++) {
          const xx = x + d
          if (xx >= 0 && xx < w && dark[y * w + xx]) v = 1
        }
        tmp[y * w + x] = v
      }
    }
    const near = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0
        for (let d = -2; d <= 2 && !v; d++) {
          const yy = y + d
          if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1
        }
        near[y * w + x] = v
      }
    }
    const pix = []
    const cols = new Uint8Array(w)
    for (let y = 0; y < h; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x
        if (buf[i] >= 200 && near[i]) {
          pix.push(i)
          cols[x] = 1
        }
      }
    }
    let colCount = 0
    for (let x = x0; x < x1; x++) colCount += cols[x]
    let textLike = false
    let band = null
    if (pix.length >= 150 && colCount >= (x1 - x0) * 0.05) {
      const ys = pix.map((i) => Math.floor(i / w)).sort((a, b) => a - b)
      const lo = ys[Math.floor(ys.length * 0.1)]
      const hi = ys[Math.floor(ys.length * 0.9)]
      if (hi - lo <= h * 0.6) {
        textLike = true
        band = [lo, hi]
      }
    }
    masks.push({ textLike, pix: new Set(pix), band })
  }
  const text = masks.filter((m) => m.textLike)
  const overlaps = []
  for (let k = 1; k < text.length; k++) {
    const a = text[k - 1].pix
    const b = text[k].pix
    let both = 0
    for (const i of a) if (b.has(i)) both++
    overlaps.push(both / Math.max(1, Math.min(a.size, b.size)))
  }
  overlaps.sort((a, b) => a - b)
  const median = overlaps.length ? overlaps[Math.floor(overlaps.length / 2)] : 1
  const burned = text.length >= Math.max(3, Math.ceil(masks.length * 0.6)) && median < 0.5
  let band = null
  if (text.length) {
    const lo = Math.min(...text.map((m) => m.band[0]))
    const hi = Math.max(...text.map((m) => m.band[1]))
    band = [r3(regionTop + (lo / h) * (1 - regionTop)), r3(regionTop + (hi / h) * (1 - regionTop))]
  }
  return { burned, textSamples: text.length, samples: masks.length, overlap: r3(median), band }
}

/** Grey samples of the bottom 35 % at `times` (one FFmpeg run, one input per time), analysed. */
export async function detectBurnedSubtitles({ sourcePath, times = [], signal, onChild } = {}) {
  const ts = [...new Set(times.map((t) => r3(Math.max(0, Number(t) || 0))))].slice(0, 12)
  if (ts.length < 3) return { burned: false, textSamples: 0, samples: 0, overlap: 1, band: null, skipped: true }
  const { ffmpeg } = resolveBinaries()
  const work = join(REPO_ROOT, '.tmp', 'clips', `subs-${process.pid}-${Date.now().toString(36)}`)
  mkdirSync(work, { recursive: true })
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-y']
    for (const t of ts) args.push('-ss', String(t), '-i', sourcePath)
    const graph = ts.map((_, k) => `[${k}:v]crop=iw:ih*0.35:0:ih*0.65,scale=${SAMPLE_W}:${SAMPLE_H},format=gray[o${k}]`).join(';')
    args.push('-filter_complex', graph)
    ts.forEach((_, k) => args.push('-map', `[o${k}]`, '-frames:v', '1', '-f', 'rawvideo', join(work, `s${k}.gray`)))
    const res = await runCommandRedirected(ffmpeg, args, { timeoutMs: 120_000, signal, onChild })
    if (signal?.aborted) throw createAbortError()
    const samples = ts.map((_, k) => {
      try {
        return readFileSync(join(work, `s${k}.gray`))
      } catch {
        return null
      }
    })
    const out = analyzeSubtitleSamples(samples.filter(Boolean))
    return { ...out, ...(res.code !== 0 && !out.samples ? { error: String(res.stderr || '').trim().split(/\r?\n/).slice(-2).join(' | ') } : {}) }
  } finally {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {}
  }
}

/* ------------------------------------------------------------------------------------------- ASS */

/** '#RRGGBB' → ASS '&HAABBGGRR' (alpha 0 = opaque). */
export function assColor(hex, alpha = 0) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  const v = m ? m[1].toUpperCase() : 'FFD400'
  return `&H${Math.max(0, Math.min(255, alpha)).toString(16).toUpperCase().padStart(2, '0')}${v.slice(4, 6)}${v.slice(2, 4)}${v.slice(0, 2)}`
}

/** '#RRGGBB' → the inline override form '&HBBGGRR&'. */
export function assInlineColor(hex) {
  return `${assColor(hex).slice(0, 2)}${assColor(hex).slice(4)}&`
}

/** Text safe inside an ASS event: no override braces or backslash sequences from the speech. */
export const assText = (s) =>
  String(s ?? '')
    .replace(/\\/g, '＼')
    .replace(/\{/g, '｛')
    .replace(/\}/g, '｝')
    .replace(/\s*\r?\n\s*/g, ' ')

const assTime = (sec) => {
  const cs = Math.max(0, Math.round(Number(sec) * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

/**
 * The ASS file of one clip: title (2 balanced lines, the second in the accent colour), captions (one line each; the
 * line's keyword in the heavy weight + accent colour), progress line. `fonts.families` from ensureCaptionFonts.
 */
export function buildClipAss({ geom, fonts, durationSec, title = '', captions = [], keywords = [], showTitle = true, showCaptions = true, showBar = true, accent = '#FFD400' }) {
  const { W, H } = geom
  const fam = fonts?.families || { sans: 'DSH Caption Sans', black: 'DSH Caption Black', serif: 'DSH Title Serif' }
  const acc = assColor(accent)
  const accIn = assInlineColor(accent)
  const t = geom.title
  const c = geom.caption
  const outline = (size) => Math.max(3, Math.round(size * 0.075))
  const lines = [
    '[Script Info]',
    '; 长视频拆条 — DSH Video Workbench',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Title,${fam.serif},${t.fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H64000000,0,0,0,0,100,100,${Math.round(t.fontSize * 0.04)},0,1,${outline(t.fontSize)},${Math.round(t.fontSize * 0.04)},${t.align},${Math.round(W * 0.06)},${Math.round(W * 0.06)},${t.marginV},1`,
    `Style: Cap,${fam.sans},${c.fontSize},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,0,0,0,0,100,100,${Math.round(c.fontSize * 0.03)},0,1,${outline(c.fontSize)},${Math.round(c.fontSize * 0.03)},${c.align},${Math.round(W * 0.07)},${Math.round(W * 0.07)},${c.marginV},1`,
    `Style: Track,${fam.sans},20,&HB4FFFFFF,&HB4FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Bar,${fam.sans},20,${acc},${acc},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ]
  const end = assTime(Math.max(0.1, Number(durationSec) || 0))
  if (showTitle && String(title || '').trim()) {
    const parts = formatBalancedTitle(String(title).trim(), t.maxLineChars).slice(0, 2)
    const text = parts.map((p, k) => (k === 1 ? `{\\c${accIn}}${assText(p)}` : assText(p))).join('\\N')
    const limited = Number(geom.titleSec) > 0 && Number(durationSec) > Number(geom.titleSec) + 1
    const big = parts.length === 1 && Number(t.oneLineSize) > t.fontSize ? `{\\fs${t.oneLineSize}}` : ''
    lines.push(`Dialogue: 2,0:00:00.00,${limited ? assTime(geom.titleSec) : end},Title,,0,0,0,,${limited ? '{\\fad(250,450)}' : ''}${big}${text}`)
  }
  if (showCaptions) {
    const byLine = new Map()
    for (const k of keywords || []) if (Number.isInteger(k?.line) && !byLine.has(k.line)) byLine.set(k.line, String(k.text || ''))
    captions.forEach((cap, li) => {
      let text = assText(cap.text)
      const kw = assText(byLine.get(li) || '')
      const at = kw ? text.indexOf(kw) : -1
      if (at >= 0) text = `${text.slice(0, at)}{\\fn${fam.black}\\c${accIn}}${kw}{\\r}${text.slice(at + kw.length)}`
      if (text.trim()) lines.push(`Dialogue: 1,${assTime(cap.startSec)},${assTime(cap.endSec)},Cap,,0,0,0,,${text}`)
    })
  }
  if (showBar && geom.bar) {
    const { y, h } = geom.bar
    const x0 = geom.bar.inset || 0
    const x1 = W - x0
    const ms = Math.max(100, Math.round((Number(durationSec) || 0) * 1000))
    const shape = `m 0 0 l ${x1 - x0} 0 ${x1 - x0} ${h} 0 ${h}`
    lines.push(`Dialogue: 0,0:00:00.00,${end},Track,,0,0,0,,{\\pos(${x0},${y})\\p1}${shape}{\\p0}`)
    lines.push(`Dialogue: 1,0:00:00.00,${end},Bar,,0,0,0,,{\\pos(${x0},${y})\\clip(${x0},${y},${x0},${y + h})\\t(0,${ms},\\clip(${x0},${y},${x1},${y + h}))\\p1}${shape}{\\p0}`)
  }
  return `${lines.join('\n')}\n`
}

/* ------------------------------------------------------------------------------------------- FFmpeg graph */

/** A path inside an FFmpeg filter argument (Windows drive colons and quotes escaped). */
export const filterPath = (p) => `'${String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")}'`

/** The picture of the layout from `[in]` to `[out]` (no captions yet). */
function layoutChain(geom, inLabel, outLabel, { fps = 30, durationSec = 1 } = {}) {
  const { W, H } = geom
  if (geom.layout === 'fit') {
    const bw = even(W / 8)
    const bh = even(H / 8)
    const { x, y, w, h } = geom.fg
    return [
      `${inLabel}split=2[lbg][lfg]`,
      `[lbg]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},gblur=sigma=5,colorchannelmixer=rr=0.45:gg=0.45:bb=0.45,scale=${W}:${H}:flags=bicubic[lbb]`,
      `[lfg]scale=${w}:${h}:flags=lanczos[lff]`,
      `[lbb][lff]overlay=x=${x}:y=${y}${outLabel}`,
    ]
  }
  if (geom.layout === 'window') {
    const { x, y, w, h } = geom.fg
    const c = geom.crop
    return [`${inLabel}crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${w}:${h}:flags=lanczos,pad=${W}:${H}:${x}:${y}:color=${geom.bg}${outLabel}`]
  }
  if (geom.layout === 'audio') return [`color=c=${geom.bg}:s=${W}x${H}:r=${fps}:d=${Math.max(0.1, durationSec).toFixed(3)}${outLabel}`]
  // crop / fill
  const bias = Number(geom.cropBias) || 0.5
  return [`${inLabel}scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})/2:(ih-${H})*${bias}${outLabel}`]
}

/**
 * The whole clip as one filter graph on a seeked input (times relative to the seek point): frame-exact trims on a
 * constant `fps` grid (48 kHz audio cut at the same frame boundaries, tiny fades against clicks), concat, layout,
 * captions, loudness. `frames` = [{ sf, ef }] relative to the seek point.
 */
export function buildClipFilter({ frames, fps = 30, geom, hasVideo = true, hasAudio = true, assPath = '', fontsDir = '', gain = null, fadeSec = 0.008 }) {
  const n = frames.length
  if (!n) throw new Error('片段为空')
  const t6 = (x) => Math.max(0, x).toFixed(6)
  const parts = []
  const useVideo = hasVideo && geom.layout !== 'audio'
  if (useVideo) parts.push(`[0:v]fps=${fps}${n > 1 ? `,split=${n}${frames.map((_, k) => `[vs${k}]`).join('')}` : '[vs0]'}`)
  if (hasAudio) parts.push(`[0:a]${AUDIO_IN}${n > 1 ? `,asplit=${n}${frames.map((_, k) => `[as${k}]`).join('')}` : '[as0]'}`)
  const labels = []
  let total = 0
  frames.forEach(({ sf, ef }, k) => {
    const d = (ef - sf) / fps
    total += d
    const fd = Math.min(fadeSec, d / 4)
    if (useVideo) {
      parts.push(`[vs${k}]trim=start=${t6(sf / fps)}:end=${t6(ef / fps)},setpts=PTS-STARTPTS[v${k}]`)
      labels.push(`[v${k}]`)
    }
    if (hasAudio) {
      parts.push(`[as${k}]atrim=start=${t6(sf / fps)}:end=${t6(ef / fps)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fd.toFixed(4)},afade=t=out:st=${Math.max(0, d - fd).toFixed(4)}:d=${fd.toFixed(4)}[a${k}]`)
      labels.push(`[a${k}]`)
    }
  })
  const vOut = useVideo ? '[vc]' : ''
  const aOut = hasAudio ? '[ac]' : ''
  parts.push(`${labels.join('')}concat=n=${n}:v=${useVideo ? 1 : 0}:a=${hasAudio ? 1 : 0}${vOut}${aOut}`)
  parts.push(...layoutChain(geom, '[vc]', '[lay]', { fps, durationSec: total }))
  const subs = assPath ? `,subtitles=filename=${filterPath(assPath)}${fontsDir ? `:fontsdir=${filterPath(fontsDir)}` : ''}` : ''
  parts.push(`[lay]format=yuv420p${subs},setsar=1[vo]`)
  if (hasAudio) parts.push(`[ac]${voiceChain(gain)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ao]`)
  return parts.join(';\n')
}

/*
 * Loudness for speech. Speech peaks sit 15–20 dB above its average loudness, so one plain gain to −14 LUFS would push
 * peaks over 0 dB (and FFmpeg's loudnorm then leaves its exact mode and undershoots). Instead, in the podcast way:
 * rumble filter → a fixed level (−20 LUFS) → gentle compression (3:1 above −26 dBFS) → the gain measured on exactly
 * that → a peak limiter (auto level off) → a final trim measured on the whole chain (the bundled FFmpeg's limiters stop
 * peaks lower than asked, which costs about 1 dB of loudness), capped so peaks stay ≤ −1.5 dBTP before AAC.
 * Result: −14 LUFS ±0.5, peaks ≤ −1 dBTP. Every step is measured on exactly the audio that is kept.
 */
/** Every clip's sound is 48 kHz stereo from the first filter on (a mono voice gets the standard −3 dB per side), so
 * each measurement sees exactly the channels that are delivered. */
const AUDIO_IN = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
const VOICE_PRE_TARGET = -20
const VOICE_COMPRESSOR = 'acompressor=threshold=0.05:ratio=3:attack=10:release=200:knee=2.5'
const VOICE_LIMITER = 'alimiter=limit=0.794:attack=5:release=60:level=0'
const clampDb = (x, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(x) * 100) / 100))

/** Gain before the compressor from the raw loudness (silence or unmeasurable → no boost of the noise floor). */
export function voicePreGain(rawI) {
  const i = Number(rawI)
  return Number.isFinite(i) && i > -60 ? clampDb(VOICE_PRE_TARGET - i, -20, 24) : 0
}

/** Gain after the compressor from the loudness measured after it. */
export function voicePostGain(compI) {
  const i = Number(compI)
  return Number.isFinite(i) && i > -60 ? clampDb(CLIP_LOUDNESS.I - i, -20, 24) : 0
}

/** Final trim from the loudness / true peak of the whole chain; never lifts peaks above −1.5 dBTP. */
export function voiceTrimGain(fullI, fullTP) {
  const i = Number(fullI)
  if (!Number.isFinite(i) || i <= -60) return 0
  let trim = clampDb(CLIP_LOUDNESS.I - i, -6, 6)
  const tp = Number(fullTP)
  if (Number.isFinite(tp) && tp + trim > -1.5) trim = clampDb(-1.5 - tp, -6, 6)
  return trim
}

/**
 * The voice chain: `measure: 'raw' | 'compressed' | 'full'` for the measuring passes (loudnorm prints the loudness of
 * its input), otherwise the render chain with `gain = { pre, post, trim }`; without a measurement, loudnorm's dynamic
 * mode.
 */
export function voiceChain(gain = null, { measure = '' } = {}) {
  const meter = `loudnorm=I=${CLIP_LOUDNESS.I}:TP=${CLIP_LOUDNESS.TP}:LRA=${CLIP_LOUDNESS.LRA}:print_format=json`
  if (measure === 'raw') return `highpass=f=60,${meter}`
  const pre = Number(gain?.pre) || 0
  if (measure === 'compressed') return `highpass=f=60,volume=${pre}dB,${VOICE_COMPRESSOR},${meter}`
  if (!gain || !Number.isFinite(Number(gain.post))) return `highpass=f=60,loudnorm=I=${CLIP_LOUDNESS.I}:TP=${CLIP_LOUDNESS.TP}:LRA=${CLIP_LOUDNESS.LRA}`
  const chain = `highpass=f=60,volume=${pre}dB,${VOICE_COMPRESSOR},volume=${Number(gain.post)}dB,${VOICE_LIMITER}`
  if (measure === 'full') return `${chain},${meter}`
  const trim = Number(gain.trim) || 0
  return trim ? `${chain},volume=${trim}dB` : chain
}

/** The loudnorm JSON block printed by a measuring pass. */
export function parseLoudnormJson(stderr) {
  const s = String(stderr || '')
  const at = s.lastIndexOf('{')
  const end = s.lastIndexOf('}')
  if (at < 0 || end < at) return null
  try {
    const j = JSON.parse(s.slice(at, end + 1))
    return j && typeof j === 'object' && 'input_i' in j ? j : null
  } catch {
    return null
  }
}

/** The seek point and the relative frame ranges of a cut: start a little before the first kept frame. */
export function seekPlan(keep, fps, { leadSec = 1.5 } = {}) {
  const frames = keepFrames(keep, fps)
  if (!frames.length) throw new Error('片段为空')
  const s0 = Math.max(0, frames[0].sf - Math.round(leadSec * fps))
  const rel = frames.map((r) => ({ sf: r.sf - s0, ef: r.ef - s0 }))
  const durationSec = frames.reduce((a, r) => a + (r.ef - r.sf), 0) / fps
  return { seekSec: s0 / fps, readSec: (frames[frames.length - 1].ef - s0) / fps + 1, frames: rel, durationSec: r3(durationSec), frameCount: frames.reduce((a, r) => a + (r.ef - r.sf), 0) }
}

/** Source time of a moment on the cut timeline (for the cover frame). */
export function sourceTimeAt(keep, fps, cutSec) {
  const frames = keepFrames(keep, fps)
  let acc = 0
  for (const r of frames) {
    const d = (r.ef - r.sf) / fps
    if (cutSec <= acc + d) return r.sf / fps + Math.max(0, cutSec - acc)
    acc += d
  }
  const last = frames[frames.length - 1]
  return last ? last.ef / fps - 1 / fps : 0
}

/** Sharpness of a grey frame: variance of the Laplacian (higher = sharper). */
export function frameSharpness(buf, w, h) {
  if (!buf || buf.length < w * h) return 0
  let sum = 0
  let sq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = 4 * buf[i] - buf[i - 1] - buf[i + 1] - buf[i - w] - buf[i + w]
      sum += v
      sq += v * v
      n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sq / n - mean * mean
}

/** The sharpest of a few moments (source times) — one FFmpeg run. Returns the chosen source time. */
async function pickCoverTime({ sourcePath, times, signal, onChild }) {
  if (times.length < 2) return times[0] || 0
  const { ffmpeg } = resolveBinaries()
  const work = join(REPO_ROOT, '.tmp', 'clips', `cover-${process.pid}-${Date.now().toString(36)}`)
  mkdirSync(work, { recursive: true })
  try {
    const args = ['-hide_banner', '-loglevel', 'error', '-y']
    for (const t of times) args.push('-ss', String(r3(t)), '-i', sourcePath)
    args.push('-filter_complex', times.map((_, k) => `[${k}:v]scale=320:180,format=gray[o${k}]`).join(';'))
    times.forEach((_, k) => args.push('-map', `[o${k}]`, '-frames:v', '1', '-f', 'rawvideo', join(work, `c${k}.gray`)))
    await runCommandRedirected(ffmpeg, args, { timeoutMs: 60_000, signal, onChild })
    let best = 0
    let bestScore = -1
    times.forEach((t, k) => {
      let buf = null
      try {
        buf = readFileSync(join(work, `c${k}.gray`))
      } catch {}
      const s = frameSharpness(buf, 320, 180)
      if (s > bestScore) {
        bestScore = s
        best = t
      }
    })
    return best
  } finally {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {}
  }
}

const tail = (stderr) => String(stderr || '').trim().split(/\r?\n/).slice(-4).join(' | ')

/** Delete a file a just-killed process may still hold open (retries for up to ~3 s). */
async function removeWhenReleased(file) {
  for (let k = 0; k < 15; k++) {
    try {
      rmSync(file, { force: true })
      if (!existsSync(file)) return true
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  return !existsSync(file)
}

/**
 * Render one clip: `keep` (source-time ranges on the `fps` grid, from planClipCut) → outVideo (H.264 + AAC, −14 LUFS),
 * outCover (JPG with the title), the ASS beside them only while rendering. Returns
 * { video, cover, durationSec, layout, canvas, loudness, bytes }.
 */
export async function renderClip({
  sourcePath,
  probe,
  keep,
  fps = 30,
  captions = [],
  keywords = [],
  title = '',
  aspect = '9:16',
  layout = 'auto',
  showTitle = true,
  showCaptions = true,
  showBar = true,
  accent = '#FFD400',
  outVideo,
  outCover = '',
  fontsCacheDir = join(REPO_ROOT, '.tmp', 'caption-fonts'),
  signal,
  onChild,
  onProgress,
}) {
  if (!Array.isArray(keep) || !keep.length) throw new Error('片段为空：没有可保留的内容')
  if (!outVideo) throw new Error('缺少输出文件路径')
  const hasVideo = Boolean(probe?.hasVideo)
  const hasAudio = probe?.hasAudio !== false
  const canvas = canvasFor(aspect, probe)
  const lay = chooseLayout(layout, { canvas, source: { w: probe?.width, h: probe?.height }, hasVideo })
  const geom = layoutGeometry(lay, canvas, { w: probe?.width, h: probe?.height })
  const fonts = ensureCaptionFonts(fontsCacheDir)
  const plan = seekPlan(keep, fps)
  const { ffmpeg } = resolveBinaries()
  const work = join(REPO_ROOT, '.tmp', 'clips', `r-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  mkdirSync(work, { recursive: true })
  mkdirSync(dirname(outVideo), { recursive: true })
  const report = (p, message) => onProgress?.({ progress: Math.max(0, Math.min(100, Math.round(p))), message })
  try {
    const assPath = join(work, 'clip.ass')
    writeFileSync(assPath, `\ufeff${buildClipAss({ geom, fonts, durationSec: plan.durationSec, title, captions, keywords, showTitle, showCaptions, showBar, accent })}`, 'utf8')
    const seek = ['-ss', plan.seekSec.toFixed(6), '-t', plan.readSec.toFixed(3), '-i', sourcePath]
    // 1. loudness of exactly what is kept: raw, then after the fixed level + compressor (two quick audio-only passes)
    const measure = async (chain, name) => {
      const g = [`[0:a]${AUDIO_IN}${plan.frames.length > 1 ? `,asplit=${plan.frames.length}${plan.frames.map((_, k) => `[as${k}]`).join('')}` : '[as0]'}`]
      plan.frames.forEach(({ sf, ef }, k) => g.push(`[as${k}]atrim=start=${(sf / fps).toFixed(6)}:end=${(ef / fps).toFixed(6)},asetpts=PTS-STARTPTS[a${k}]`))
      g.push(`${plan.frames.map((_, k) => `[a${k}]`).join('')}concat=n=${plan.frames.length}:v=0:a=1,${chain}[aout]`)
      const gp = join(work, `${name}.txt`)
      writeFileSync(gp, g.join(';\n'), 'utf8')
      const r = await runCommandRedirected(ffmpeg, ['-hide_banner', '-nostats', '-vn', ...seek, '-filter_complex_script', gp, '-map', '[aout]', '-f', 'null', '-'], { timeoutMs: Math.max(120_000, plan.durationSec * 2000), signal, onChild })
      if (signal?.aborted) throw createAbortError()
      const j = r.code === 0 ? parseLoudnormJson(r.stderr) : null
      return j && Number.isFinite(Number(j.input_i)) ? j : null
    }
    let gain = null
    let raw = null
    if (hasAudio) {
      report(2, '正在测量响度…')
      raw = await measure(voiceChain(null, { measure: 'raw' }), 'loud-raw')
      if (raw) {
        const pre = voicePreGain(raw.input_i)
        report(5, '正在测量响度…')
        const comp = await measure(voiceChain({ pre }, { measure: 'compressed' }), 'loud-comp')
        if (comp) {
          const post = voicePostGain(comp.input_i)
          report(7, '正在测量响度…')
          const full = await measure(voiceChain({ pre, post }, { measure: 'full' }), 'loud-full')
          gain = { pre, post, trim: full ? voiceTrimGain(full.input_i, full.input_tp) : 0 }
        }
      }
    }
    // 2. the clip
    const graphPath = join(work, 'graph.txt')
    writeFileSync(graphPath, buildClipFilter({ frames: plan.frames, fps, geom, hasVideo, hasAudio, assPath, fontsDir: fonts.dir, gain }), 'utf8')
    const progressPath = join(work, 'progress.txt')
    const args = ['-hide_banner', '-nostats', '-y', '-progress', progressPath, ...seek, '-filter_complex_script', graphPath, '-map', '[vo]']
    if (hasAudio) args.push('-map', '[ao]')
    args.push('-c:v', 'libx264', '-preset', 'faster', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(Math.max(1, Math.round(fps * 2))))
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2')
    // written beside the final name and renamed only when complete: a stopped or failed render never leaves a half file
    const partVideo = outVideo.replace(/(\.[^.\\/]+)?$/, '.part$1')
    rmSync(partVideo, { force: true })
    args.push('-movflags', '+faststart', partVideo)
    const timer = setInterval(() => {
      try {
        const m = [...readFileSync(progressPath, 'utf8').matchAll(/out_time_ms=(\d+)/g)].pop()
        if (m && plan.durationSec > 0) {
          const pct = Math.min(99, (Number(m[1]) / 1e6 / plan.durationSec) * 100)
          report(8 + pct * 0.85, `正在出片 ${Math.round(pct)}%`)
        }
      } catch {}
    }, 700)
    let r2
    try {
      r2 = await runCommandRedirected(ffmpeg, args, { timeoutMs: Math.max(600_000, plan.durationSec * 6000), signal, onChild })
    } catch (err) {
      // stopped or timed out: its half file goes too (Windows releases the file a moment after the kill)
      await removeWhenReleased(partVideo)
      throw err
    } finally {
      clearInterval(timer)
    }
    const partOk = !signal?.aborted && r2.code === 0 && existsSync(partVideo) && statSync(partVideo).size >= 1024
    if (!partOk) rmSync(partVideo, { force: true })
    if (signal?.aborted) throw createAbortError()
    if (!partOk) throw new Error(`拆条出片失败：${tail(r2.stderr) || `FFmpeg 退出码 ${r2.code}`}`)
    rmSync(outVideo, { force: true })
    renameSync(partVideo, outVideo)
    // 3. what the finished file actually measures (reported, so the panel / QA can show it)
    let output = null
    if (hasAudio) {
      const r = await runCommandRedirected(ffmpeg, ['-hide_banner', '-nostats', '-vn', '-i', outVideo, '-af', voiceChain(null, { measure: 'raw' }).replace(/^highpass=f=60,/, ''), '-f', 'null', '-'], { timeoutMs: Math.max(120_000, plan.durationSec * 2000), signal, onChild })
      if (signal?.aborted) throw createAbortError()
      const j = r.code === 0 ? parseLoudnormJson(r.stderr) : null
      if (j && Number.isFinite(Number(j.input_i))) output = { i: Number(j.input_i), tp: Number(j.input_tp) }
    }
    // 4. cover: the sharpest of three moments, with the title
    let cover = ''
    if (outCover) {
      report(95, '正在做封面…')
      const at = (f) => sourceTimeAt(keep, fps, plan.durationSec * f)
      const coverAt = hasVideo ? await pickCoverTime({ sourcePath, times: [at(0.3), at(0.5), at(0.7)], signal, onChild }) : 0
      const coverAss = join(work, 'cover.ass')
      writeFileSync(coverAss, `\ufeff${buildClipAss({ geom, fonts, durationSec: 5, title, captions: [], showTitle: Boolean(String(title || '').trim()), showCaptions: false, showBar: false, accent })}`, 'utf8')
      const cg = [...layoutChain(geom, '[0:v]', '[lay]', { fps, durationSec: 1 }), `[lay]format=yuv420p,subtitles=filename=${filterPath(coverAss)}:fontsdir=${filterPath(fonts.dir)},setsar=1[vo]`]
      const cgPath = join(work, 'cover.txt')
      writeFileSync(cgPath, cg.join(';\n'), 'utf8')
      const inArgs = hasVideo ? ['-ss', r3(coverAt).toFixed(3), '-i', sourcePath] : []
      mkdirSync(dirname(outCover), { recursive: true })
      const r3c = await runCommandRedirected(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...inArgs, '-filter_complex_script', cgPath, '-map', '[vo]', '-frames:v', '1', '-q:v', '2', outCover], { timeoutMs: 60_000, signal, onChild })
      if (r3c.code === 0 && existsSync(outCover)) cover = outCover
    }
    report(100, '这条出好了')
    return {
      video: outVideo,
      cover,
      durationSec: plan.durationSec,
      frames: plan.frameCount,
      layout: lay,
      canvas: { width: canvas.W, height: canvas.H, aspect: canvas.aspect },
      loudness: {
        mode: !hasAudio ? 'none' : gain ? 'measured' : 'dynamic',
        targetI: CLIP_LOUDNESS.I,
        targetTP: CLIP_LOUDNESS.TP,
        sourceI: raw ? Number(raw.input_i) : null,
        outputI: output ? output.i : null,
        outputTP: output ? output.tp : null,
        ...(gain ? { preDb: gain.pre, postDb: gain.post, trimDb: gain.trim } : {}),
      },
      bytes: statSync(outVideo).size,
    }
  } finally {
    try {
      rmSync(work, { recursive: true, force: true })
    } catch {}
  }
}
