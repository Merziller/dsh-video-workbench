/**
 * talk-kit — deterministic building blocks for 口播剪辑 (a real person talking to camera, cut by the computer).
 *
 * PresenterStage  the rough-cut recording, playing continuously across scenes (`scene.presenter.startFrame` = where this
 *                 scene starts inside the cut recording); jump cuts are hidden with an alternating punch-in (1.0 ↔ zoom)
 *                 at every cut the edit made, the classic talking-head technique; portrait / landscape reframing with a
 *                 focus point, or a blurred fill behind a `contain` picture.
 * TalkCaption     captions from what was really said: big, bold, outlined, word-by-word highlight from the recognised
 *                 timing (`sub.words[{ text, at, end }]`, seconds from the line start); plain line when the display text
 *                 no longer matches the words (numerals rewritten for reading).
 * TalkPackLayer   口播包装 over the whole cut (global timeline): B-roll cutaways matched to what is said (the voice
 *                 goes on), keyword pops on the word, chapter banners + a progress bar with chapter ticks, a lower-third
 *                 name strip — themed by a packaging preset.
 *                 The cartoon presenter in a corner: a library picture / loop that hops with the voice, or 「我的动漫形象」
 *                 — free tier: portrait + mouth / blink pictures switched per frame from the voice; local model / cloud:
 *                 a transparent talking clip played once from the start.
 * Everything is driven by the frame number (no CSS animation, no randomness) so every render is identical.
 */
import React from 'react'
import { AbsoluteFill, Img, Loop, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'

export type PresenterSpec = {
  path: string
  startFrame?: number
  fit?: 'cover' | 'contain'
  focusX?: number
  focusY?: number
  /** scene-local frames where the edit joined two takes (jump cuts) */
  cuts?: number[]
  /** zoom state at the scene start (number of punch-ins before it, mod 2) */
  cutParity?: number
  punchZoom?: number
  jumpZoom?: boolean
  /** a slow zoom across the scene (Vlog 高光): [scale at the start, scale at the end] over `durF` frames */
  kenBurns?: [number, number]
  durF?: number
}

const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt
}

const relPath = (p: unknown): string => String(p || '').replace(/^\/+/, '').replace(/\\/g, '/')

export const PresenterStage: React.FC<{ scene: { presenter?: PresenterSpec } }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const p: PresenterSpec = scene && scene.presenter ? scene.presenter : { path: '' }
  const rel = relPath(p.path)
  if (!rel) return <AbsoluteFill style={{ backgroundColor: '#000' }} />
  const startFrom = Math.max(0, Math.round(Number(p.startFrame) || 0))
  const fit: 'cover' | 'contain' = p.fit === 'contain' ? 'contain' : 'cover'
  const fx = clampNum(p.focusX, 0, 100, 50)
  const fy = clampNum(p.focusY, 0, 100, 42)
  const zoomTo = clampNum(p.punchZoom, 1, 1.35, 1.09)
  let parity = Math.round(Number(p.cutParity) || 0)
  if (p.jumpZoom !== false && Array.isArray(p.cuts)) {
    for (const c of p.cuts) {
      if (Number.isFinite(Number(c)) && frame >= Number(c)) parity += 1
    }
  }
  let zoom = p.jumpZoom === false ? 1 : parity % 2 === 1 ? zoomTo : 1
  if (Array.isArray(p.kenBurns) && p.kenBurns.length === 2) {
    const durF = Math.max(1, Math.round(Number(p.durF) || 1))
    const k0 = clampNum(p.kenBurns[0], 1, 1.4, 1)
    const k1 = clampNum(p.kenBurns[1], 1, 1.4, 1)
    zoom *= interpolate(frame, [0, durF], [k0, k1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  }
  const videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: fit,
    objectPosition: `${fx}% ${fy}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${fx}% ${fy}%`,
  }
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {fit === 'contain' ? (
        <AbsoluteFill style={{ transform: 'scale(1.15)', filter: 'blur(36px) brightness(0.55) saturate(1.2)' }}>
          <OffthreadVideo src={staticFile(rel)} trimBefore={startFrom > 0 ? startFrom : undefined} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : null}
      <OffthreadVideo src={staticFile(rel)} trimBefore={startFrom > 0 ? startFrom : undefined} muted style={videoStyle} />
    </AbsoluteFill>
  )
}

export type CaptionWord = { text: string; at: number; end: number }
export type CaptionLine = {
  text: string
  words?: CaptionWord[]
  startFrame?: number
  globalStartFrame?: number
  startSec?: number
  globalStartSec?: number
}

type CaptionPiece = { text: string; word?: CaptionWord }

/**
 * Lay the timed words over the display text in order (the text keeps its own spaces / punctuation between words);
 * null when a word cannot be found (the text was rewritten for reading, e.g. numerals) → plain line.
 */
export function alignCaptionWords(text: string, words: CaptionWord[]): CaptionPiece[] | null {
  if (!text || !Array.isArray(words) || words.length === 0) return null
  const pieces: CaptionPiece[] = []
  let pos = 0
  for (const w of words) {
    const wt = String((w && w.text) || '').trim()
    if (!wt) continue
    let idx = text.indexOf(wt, pos)
    if (idx < 0) idx = text.toLowerCase().indexOf(wt.toLowerCase(), pos)
    if (idx < 0) return null
    if (idx > pos) pieces.push({ text: text.slice(pos, idx) })
    pieces.push({ text: text.slice(idx, idx + wt.length), word: w })
    pos = idx + wt.length
  }
  if (pos < text.length) pieces.push({ text: text.slice(pos) })
  return pieces
}

export const TalkCaption: React.FC<{
  sub: CaptionLine
  bottom: number
  highlight?: string
  fontFamily?: string
  maxWidth?: number
}> = ({ sub, bottom, highlight = '#FFE14D', fontFamily, maxWidth }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  if (!sub || !sub.text) return null
  const portrait = width < height
  const startF = Number(
    sub.globalStartFrame ?? sub.startFrame ?? Math.round(Number(sub.globalStartSec ?? sub.startSec ?? 0) * fps),
  )
  const t = (frame - startF) / fps
  const enter = spring({ frame: Math.max(0, frame - startF), fps, config: { damping: 18, stiffness: 240, mass: 0.55 } })
  const fontSize = portrait ? Math.round(width * 0.064) : Math.round(width * 0.031)
  const pieces = alignCaptionWords(String(sub.text), Array.isArray(sub.words) ? sub.words : [])
  const base: React.CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight: 900,
    lineHeight: 1.22,
    letterSpacing: '0.02em',
    color: '#FFFFFF',
    WebkitTextStroke: `${Math.max(2, Math.round(fontSize * 0.07))}px rgba(0,0,0,0.92)`,
    paintOrder: 'stroke fill',
    textShadow: '0 4px 14px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,0.9)',
  }
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: bottom, pointerEvents: 'none', zIndex: 40 }}>
      <div
        style={{
          maxWidth: maxWidth || Math.round(width * 0.9),
          textAlign: 'center',
          transform: `translateY(${interpolate(enter, [0, 1], [fontSize * 0.35, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
          opacity: interpolate(enter, [0, 0.4, 1], [0, 1, 1]),
          ...base,
        }}
      >
        {pieces
          ? pieces.map((pc, i) => {
              if (!pc.word) return <React.Fragment key={i}>{pc.text}</React.Fragment>
              const active = t >= Number(pc.word.at) && t < Number(pc.word.end)
              return (
                <span key={i} style={{ color: active ? highlight : '#FFFFFF' }}>
                  {pc.text}
                </span>
              )
            })
          : sub.text}
      </div>
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------------------------------------ 口播包装 */

export type TalkPackTheme = {
  accent: string
  accent2: string
  ink: string
  panel: string
  text: string
  keywordStyle: 'card' | 'sticker' | 'bar' | 'underline'
  radius: number
}
export type TalkKeyword = { text: string; startSec: number; endSec: number; kind?: string }
export type TalkChapter = { index: number; title: string; startSec: number }
export type TalkBroll = { startSec: number; endSec: number; path: string; type?: string; inSec?: number; outSec?: number }
/** A patch box as a share (0..1) of the presenter picture. */
export type TalkPatchBox = { x: number; y: number; w: number; h: number }
export type TalkMascot = {
  path: string
  /**
   * image / video: a library picture or loop (hops with the voice). anime: 「我的动漫形象」 free tier — the portrait plus
   * mouth / blink pictures switched per frame from `visemes`. anime-clip: a rendered talking clip (local model / cloud)
   * that plays once from the start (its own motion, no extra hops).
   */
  type?: 'image' | 'video' | 'anime' | 'anime-clip'
  keyed?: boolean
  aspect?: number
  loopSec?: number
  corner?: 'bl' | 'br'
  size?: 's' | 'm' | 'l'
  envHz?: number
  env?: number[]
  words?: number[]
  sprites?: { mouths?: Record<string, string>; blink?: string; boxes?: { mouth?: TalkPatchBox | null; blink?: TalkPatchBox | null } }
  /** one letter per frame: c closed · h half · a · o · i; `blinks` = frames where a blink starts */
  visemes?: { fps?: number; shapes?: string; blinks?: number[] }
  durationSec?: number
}
export type TalkPack = {
  theme: TalkPackTheme
  keywords?: TalkKeyword[]
  chapters?: TalkChapter[]
  broll?: TalkBroll[]
  progressBar?: boolean
  lowerThird?: { name: string; title?: string } | null
  totalSec?: number
  captions?: boolean
  mascot?: TalkMascot | null
  screen?: boolean
}

const secToFrame = (s: unknown, fps: number): number => Math.max(0, Math.round((Number(s) || 0) * fps))

/** Fade in / out over `edge` frames of a `dur`-frame window (local frame). */
const edgeFade = (f: number, dur: number, edge: number): number =>
  Math.min(
    interpolate(f, [0, edge], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(f, [dur - edge, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  )

const BrollShot: React.FC<{ b: TalkBroll; durF: number }> = ({ b, durF }) => {
  const f = useCurrentFrame()
  const { fps } = useVideoConfig()
  const rel = relPath(b.path)
  const op = edgeFade(f, durF, 5)
  const zoom = interpolate(f, [0, durF], [1.0, 1.06])
  const isVid = b.type === 'video' || /\.(mp4|mov|webm|mkv)$/i.test(rel)
  const style: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})` }
  const trim = secToFrame(b.inSec, fps)
  return (
    <AbsoluteFill style={{ opacity: op, backgroundColor: '#000' }}>
      {isVid ? <OffthreadVideo src={staticFile(rel)} muted trimBefore={trim > 0 ? trim : undefined} style={style} /> : <Img src={staticFile(rel)} style={style} />}
    </AbsoluteFill>
  )
}

const KeywordPop: React.FC<{ k: TalkKeyword; theme: TalkPackTheme; durF: number; side: number; fontFamily?: string }> = ({ k, theme, durF, side, fontFamily }) => {
  const f = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const portrait = width < height
  const s = spring({ frame: f, fps, config: { damping: 13, stiffness: 210, mass: 0.6 } })
  const out = interpolate(f, [durF - 7, durF], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const fontSize = portrait ? Math.round(width * 0.085) : Math.round(width * 0.046)
  const pad = Math.round(fontSize * 0.34)
  const pos: React.CSSProperties = portrait
    ? { top: Math.round(height * 0.17), left: 0, right: 0, display: 'flex', justifyContent: 'center' }
    : { top: Math.round(height * 0.14), ...(side % 2 === 0 ? { left: Math.round(width * 0.06) } : { right: Math.round(width * 0.06) }) }
  const rot = theme.keywordStyle === 'sticker' ? (side % 2 === 0 ? -4 : 4) : 0
  const box: React.CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight: 900,
    lineHeight: 1.1,
    letterSpacing: '0.02em',
    padding: `${pad}px ${Math.round(pad * 1.6)}px`,
    borderRadius: theme.radius,
    transform: `scale(${interpolate(s, [0, 1], [0.55, 1])}) rotate(${rot}deg)`,
    opacity: Math.min(interpolate(s, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' }), out),
    whiteSpace: 'nowrap',
  }
  if (theme.keywordStyle === 'sticker') {
    Object.assign(box, { background: theme.panel, color: theme.accent, boxShadow: `0 ${Math.round(fontSize * 0.12)}px 0 ${theme.accent2}, 0 10px 28px rgba(0,0,0,0.35)` })
  } else if (theme.keywordStyle === 'bar') {
    Object.assign(box, { background: theme.panel, color: theme.text, borderLeft: `${Math.round(fontSize * 0.16)}px solid ${theme.accent}` })
  } else if (theme.keywordStyle === 'underline') {
    const u = interpolate(f, [3, 14], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    Object.assign(box, {
      color: theme.text,
      textShadow: '0 4px 16px rgba(0,0,0,0.8)',
      backgroundImage: `linear-gradient(${theme.accent}, ${theme.accent})`,
      backgroundSize: `${u}% ${Math.max(4, Math.round(fontSize * 0.1))}px`,
      backgroundPosition: '0 100%',
      backgroundRepeat: 'no-repeat',
    })
  } else {
    Object.assign(box, { background: theme.panel, color: theme.accent, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' })
  }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 34 }}>
      <div style={{ position: 'absolute', ...pos }}>
        <div style={box}>{k.text}</div>
      </div>
    </AbsoluteFill>
  )
}

const ChapterBanner: React.FC<{ c: TalkChapter; theme: TalkPackTheme; durF: number; fontFamily?: string }> = ({ c, theme, durF, fontFamily }) => {
  const f = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const portrait = width < height
  const s = spring({ frame: f, fps, config: { damping: 16, stiffness: 180, mass: 0.7 } })
  const out = interpolate(f, [durF - 8, durF], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const fontSize = portrait ? Math.round(width * 0.05) : Math.round(width * 0.024)
  const transparentPanel = /,\s*0\)\s*$/.test(theme.panel)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 33 }}>
      <div
        style={{
          position: 'absolute',
          top: Math.round(height * (portrait ? 0.075 : 0.06)),
          left: Math.round(width * 0.04),
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(fontSize * 0.5),
          transform: `translateX(${interpolate(s, [0, 1], [-width * 0.4, 0])}px)`,
          opacity: out,
          fontFamily,
        }}
      >
        <div style={{ background: theme.accent, color: theme.ink, fontWeight: 900, fontSize: Math.round(fontSize * 1.1), padding: `${Math.round(fontSize * 0.2)}px ${Math.round(fontSize * 0.45)}px`, borderRadius: theme.radius }}>
          {String(c.index).padStart(2, '0')}
        </div>
        <div
          style={{
            background: theme.panel,
            color: theme.text,
            fontWeight: 800,
            fontSize,
            padding: `${Math.round(fontSize * 0.28)}px ${Math.round(fontSize * 0.6)}px`,
            borderRadius: theme.radius,
            textShadow: transparentPanel ? '0 3px 12px rgba(0,0,0,0.85)' : undefined,
          }}
        >
          {c.title}
        </div>
      </div>
    </AbsoluteFill>
  )
}

const ProgressStrip: React.FC<{ pack: TalkPack; totalF: number }> = ({ pack, totalF }) => {
  const f = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const portrait = width < height
  const h = portrait ? 8 : 6
  const p = totalF > 1 ? Math.min(1, f / (totalF - 1)) : 0
  const ticks = (pack.chapters || []).filter((c) => c.index > 1).map((c) => Math.min(1, secToFrame(c.startSec, fps) / Math.max(1, totalF)))
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 32 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h, background: 'rgba(255,255,255,0.18)' }}>
        <div style={{ width: `${(p * 100).toFixed(3)}%`, height: '100%', background: pack.theme.accent }} />
        {ticks.map((x, i) => (
          <div key={i} style={{ position: 'absolute', top: 0, left: `${(x * 100).toFixed(3)}%`, width: Math.max(2, Math.round(h / 2)), height: h, background: 'rgba(0,0,0,0.75)' }} />
        ))}
      </div>
    </AbsoluteFill>
  )
}

const LowerThirdStrip: React.FC<{ lt: { name: string; title?: string }; theme: TalkPackTheme; durF: number; fontFamily?: string }> = ({ lt, theme, durF, fontFamily }) => {
  const f = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const portrait = width < height
  const s = spring({ frame: f, fps, config: { damping: 18, stiffness: 160, mass: 0.8 } })
  const out = interpolate(f, [durF - 10, durF], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const fontSize = portrait ? Math.round(width * 0.055) : Math.round(width * 0.028)
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 35 }}>
      <div style={{ position: 'absolute', left: Math.round(width * 0.05), bottom: Math.round(height * (portrait ? 0.3 : 0.2)), fontFamily, opacity: out, transform: `translateY(${interpolate(s, [0, 1], [fontSize, 0])}px)` }}>
        <div style={{ display: 'inline-block', background: theme.accent, color: theme.ink, fontWeight: 900, fontSize, padding: `${Math.round(fontSize * 0.18)}px ${Math.round(fontSize * 0.5)}px`, borderRadius: theme.radius, clipPath: `inset(0 ${interpolate(s, [0, 1], [100, 0])}% 0 0)` }}>
          {lt.name}
        </div>
        {lt.title ? (
          <div>
            <div
              style={{
                marginTop: Math.round(fontSize * 0.2),
                display: 'inline-block',
                background: theme.panel,
                color: theme.text,
                fontWeight: 700,
                fontSize: Math.round(fontSize * 0.62),
                padding: `${Math.round(fontSize * 0.14)}px ${Math.round(fontSize * 0.45)}px`,
                borderRadius: theme.radius,
                opacity: interpolate(f, [6, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
              }}
            >
              {lt.title}
            </div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  )
}

/* ------------------------------------------------------------------------------------------------ 卡通讲解员 */

const MASCOT_SIZES: Record<string, number> = { s: 0.26, m: 0.34, l: 0.44 }

/** The character's pose at `t` seconds — the same formula as talk-mascot.js `mascotPose` (keep them identical). */
export function mascotPose(m: TalkMascot, t: number): { ty: number; sx: number; sy: number; rot: number; shadow: number } {
  const env = Array.isArray(m.env) ? m.env : []
  const hz = Number(m.envHz) || 12.5
  const x = Math.max(0, t * hz)
  const k = Math.floor(x)
  const a0 = (env[k] ?? 0) / 100
  const a1 = (env[k + 1] ?? env[k] ?? 0) / 100
  const amp = a0 + (a1 - a0) * (x - k)
  const talk = Math.max(0, Math.min(1, (amp - 0.08) / 0.3))
  const words = Array.isArray(m.words) ? m.words : []
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
  const gain = m.type === 'anime-clip' ? 0 : m.type === 'video' ? 0.5 : 1
  const ty = -gain * (0.016 * talk + 0.045 * pop)
  const sy = 1 + gain * (0.012 * breathe * (1 - talk) + 0.05 * pop)
  const sx = 1 - gain * 0.03 * pop
  const rot = gain * (0.9 * sway * (1 - talk) + dir * 2.6 * pop + 1.1 * talk * Math.sin(2 * Math.PI * t * 1.6))
  return { ty, sx, sy, rot, shadow: 1 + ty * 2.2 }
}

/** Where the character stands (pixels) — the same geometry as talk-mascot.js `mascotBox`. */
export function mascotBox(m: TalkMascot, width: number, height: number): { boxW: number; boxH: number; left: number; bottom: number; reserveX: number } {
  const portrait = width < height
  const frac = (MASCOT_SIZES[String(m.size || 'm')] || MASCOT_SIZES.m) * (portrait ? 0.72 : 1)
  let boxH = Math.round(height * frac)
  let boxW = Math.round(boxH * (Number(m.aspect) || 0.75))
  const maxW = Math.round(width * (portrait ? 0.42 : 0.3))
  if (boxW > maxW) {
    boxH = Math.round((boxH * maxW) / boxW)
    boxW = maxW
  }
  const side = Math.round(width * (portrait ? 0.03 : 0.022))
  const bottom = m.keyed ? Math.round(height * 0.004) : Math.round(height * 0.04)
  const left = m.corner === 'br' ? width - side - boxW : side
  return { boxW, boxH, left, bottom, reserveX: boxW + side + Math.round(width * 0.012) }
}

/** Horizontal room the captions should leave on each side for the character (0 when there is none). */
export function talkCaptionReserve(pack: TalkPack | null | undefined, width: number, height: number): number {
  const m = pack && pack.mascot
  if (!m || !m.path || width < height) return 0
  return mascotBox(m, width, height).reserveX
}

const VISEME_MOUTH: Record<string, string> = { c: 'closed', h: 'half', a: 'a', o: 'o', i: 'i' }

/** 「我的动漫形象」 mouth shape (closed / half / a / o / i) and eyelids at `t` seconds — free tier. */
export function animeFace(m: TalkMascot, t: number): { mouth: string; blink: boolean } {
  const v = m.visemes || {}
  const vf = Number(v.fps) || 30
  const shapes = String(v.shapes || '')
  const k = Math.max(0, Math.floor(t * vf + 1e-6))
  const mouth = VISEME_MOUTH[shapes.charAt(Math.min(k, Math.max(0, shapes.length - 1)))] || 'closed'
  // a blink keeps the eyes shut for ~0.1 s from its start frame
  const len = Math.max(2, Math.round(vf * 0.1))
  const blink = (Array.isArray(v.blinks) ? v.blinks : []).some((b) => k >= b && k < b + len)
  return { mouth, blink }
}

/** A patch picture over the portrait, placed by its share box; every patch is mounted (loaded) and only shown. */
const FacePatch: React.FC<{ src: string; box: TalkPatchBox; show: boolean }> = ({ src, box, show }) => (
  <Img
    src={staticFile(src)}
    style={{
      position: 'absolute',
      left: `${(box.x * 100).toFixed(3)}%`,
      top: `${(box.y * 100).toFixed(3)}%`,
      width: `${(box.w * 100).toFixed(3)}%`,
      height: `${(box.h * 100).toFixed(3)}%`,
      opacity: show ? 1 : 0,
    }}
  />
)

const MascotPresenter: React.FC<{ m: TalkMascot }> = ({ m }) => {
  const f = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const t = f / fps
  const rel = relPath(m.path)
  if (!rel) return null
  const p = mascotPose(m, t)
  const b = mascotBox(m, width, height)
  const keyed = m.keyed !== false
  const loopF = Math.max(1, Math.round((Number(m.loopSec) || 0) * fps))
  const media: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
  const isAnime = m.type === 'anime'
  const face = isAnime ? animeFace(m, t) : null
  const mouths = (m.sprites && m.sprites.mouths) || {}
  const boxes = (m.sprites && m.sprites.boxes) || {}
  const clipF = Math.max(1, Math.round((Number(m.durationSec) || 0) * fps))
  const card: React.CSSProperties = keyed ? {} : { borderRadius: Math.round(b.boxW * 0.08), overflow: 'hidden', boxShadow: '0 14px 36px rgba(0,0,0,0.45)', border: '3px solid rgba(255,255,255,0.85)' }
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 31 }}>
      {keyed ? (
        <div
          style={{
            position: 'absolute',
            left: b.left + b.boxW * 0.12,
            bottom: b.bottom - Math.round(b.boxH * 0.015),
            width: b.boxW * 0.76,
            height: Math.round(b.boxH * 0.05),
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(0,0,0,0.38), rgba(0,0,0,0))',
            transform: `scaleX(${p.shadow.toFixed(3)})`,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: b.left,
          bottom: b.bottom,
          width: b.boxW,
          height: b.boxH,
          transformOrigin: '50% 100%',
          transform: `translateY(${(p.ty * b.boxH).toFixed(2)}px) rotate(${p.rot.toFixed(3)}deg) scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`,
          filter: keyed ? 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))' : undefined,
          ...card,
        }}
      >
        {m.type === 'anime-clip' ? (
          // a talking clip from the local model / the cloud: plays once from the start of the cut, in sync with the voice
          <Sequence from={0} durationInFrames={clipF} layout="none">
            <OffthreadVideo src={staticFile(rel)} muted transparent style={media} />
          </Sequence>
        ) : m.type === 'video' ? (
          <Loop durationInFrames={loopF} layout="none">
            <OffthreadVideo src={staticFile(rel)} muted transparent={keyed} style={media} />
          </Loop>
        ) : isAnime ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Img src={staticFile(rel)} style={media} />
            {boxes.mouth
              ? Object.entries(mouths).map(([shape, file]) => (file ? <FacePatch key={`m-${shape}`} src={relPath(file)} box={boxes.mouth as TalkPatchBox} show={Boolean(face && face.mouth === shape)} /> : null))
              : null}
            {boxes.blink && m.sprites && m.sprites.blink ? <FacePatch src={relPath(m.sprites.blink)} box={boxes.blink} show={Boolean(face && face.blink)} /> : null}
          </div>
        ) : (
          <Img src={staticFile(rel)} style={media} />
        )}
      </div>
    </AbsoluteFill>
  )
}

/**
 * The whole 口播包装 layer on the global timeline. Put it above the scenes and below the captions: B-roll covers the
 * talking head while the voice goes on, the decorations sit on top of whatever is on screen.
 */
export const TalkPackLayer: React.FC<{ pack?: TalkPack | null; totalFrames: number; fontFamily?: string }> = ({ pack, totalFrames, fontFamily }) => {
  const { fps } = useVideoConfig()
  if (!pack || !pack.theme) return null
  const theme = pack.theme
  const total = Math.max(1, Math.round(totalFrames))
  const win = (startSec: unknown, endSec: unknown, minF: number) => {
    const from = Math.min(total - 1, secToFrame(startSec, fps))
    const to = Math.min(total, Math.max(from + minF, secToFrame(endSec, fps)))
    return { from, dur: Math.max(1, to - from) }
  }
  const ltFrom = Math.min(total - 1, Math.round(fps * 0.6))
  const ltDur = Math.max(1, Math.min(total - ltFrom, Math.round(fps * 3.6)))
  return (
    <>
      {(pack.broll || []).map((b, i) => {
        const w = win(b.startSec, b.endSec, Math.round(fps * 0.8))
        return (
          <Sequence key={`b${i}`} from={w.from} durationInFrames={w.dur} layout="none">
            <BrollShot b={b} durF={w.dur} />
          </Sequence>
        )
      })}
      {pack.progressBar ? <ProgressStrip pack={pack} totalF={total} /> : null}
      {(pack.chapters || []).map((c, i) => {
        const w = win(c.startSec, Number(c.startSec) + 2.4, Math.round(fps * 1.2))
        return (
          <Sequence key={`c${i}`} from={w.from} durationInFrames={w.dur} layout="none">
            <ChapterBanner c={c} theme={theme} durF={w.dur} fontFamily={fontFamily} />
          </Sequence>
        )
      })}
      {(pack.keywords || []).map((k, i) => {
        const w = win(k.startSec, k.endSec, Math.round(fps * 0.9))
        return (
          <Sequence key={`k${i}`} from={w.from} durationInFrames={w.dur} layout="none">
            <KeywordPop k={k} theme={theme} durF={w.dur} side={i} fontFamily={fontFamily} />
          </Sequence>
        )
      })}
      {pack.lowerThird && pack.lowerThird.name ? (
        <Sequence from={ltFrom} durationInFrames={ltDur} layout="none">
          <LowerThirdStrip lt={pack.lowerThird} theme={theme} durF={ltDur} fontFamily={fontFamily} />
        </Sequence>
      ) : null}
      {pack.mascot && pack.mascot.path ? <MascotPresenter m={pack.mascot} /> : null}
    </>
  )
}
