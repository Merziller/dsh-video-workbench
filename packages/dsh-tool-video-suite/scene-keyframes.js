/**
 * Render a few keyframes per scene of a Remotion project as small JPEGs — the eyes of the visual self-review
 * (packages/dsh-tool-media/visual-review.js): the AI coder's scenes are looked at before the film is rendered.
 *
 * One throwaway bundle + one headless browser for all stills; the bundle is always deleted afterwards. Frames are
 * absolute composition frames of `MainVideo` (so the compositor's subtitles / badge are visible, as in the film).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createAbortError,
  ensureRemotionJunction,
  REPO_ROOT,
  resolveBinaries,
  resolveBrowserExecutable,
  resolveLowSpecPolicy,
  resolveRemotionRuntime,
} from '../shared/index.js'
import { findRemotionBrowser, removeRemotionBundleDir } from './frame-renderer.js'

/** Absolute start / length (frames) of every scene, from the locked timing or the running sum of durations. */
export function sceneFrameSpans(scenes = [], fps = 30) {
  const out = []
  let cursor = 0
  for (const sc of Array.isArray(scenes) ? scenes : []) {
    const dur = Number(sc?.durationInFrames) > 0 ? Math.round(Number(sc.durationInFrames)) : Math.max(1, Math.round((Number(sc?.durationSec) || 4) * fps))
    const start = Number.isFinite(Number(sc?.startFrame)) ? Math.max(0, Math.round(Number(sc.startFrame))) : cursor
    out.push({ id: sc?.id, start, dur })
    cursor = start + dur
  }
  return out
}

/**
 * Keyframes to look at for each scene: `fractions` of the way through the shot (entry animations finish within the
 * first ~25%, so 0.35 shows the composed shot and 0.8 shows whether it is still alive near the end).
 */
export function planSceneKeyframes(scenes = [], fps = 30, fractions = [0.35, 0.8]) {
  const spans = sceneFrameSpans(scenes, fps)
  const out = []
  for (const sp of spans) {
    if (!sp.id) continue
    for (const f of fractions) {
      const local = Math.min(sp.dur - 1, Math.max(0, Math.round(sp.dur * f)))
      out.push({ sceneId: sp.id, fraction: f, frame: sp.start + local })
    }
  }
  return out
}

/**
 * Keyframes for the visual self-review. `fine: false` → the classic pair per scene (35% / 80%, planSceneKeyframes).
 * `fine: true` (「逐个机位看图」) → every picture the audience sees is looked at: one still in the middle of every
 * sub-shot when the scene is cut into re-framed sub-shots (`scene.cuts`, beat-analyzer.js contract; each still carries
 * `cut: { index, count, framing }`), otherwise one still about every `secondsPerStill` seconds (at least the 35% / 80%
 * pair). At most `maxPerScene` stills per scene (evenly picked, first and last kept).
 */
export function planSceneReviewFrames(scenes = [], fps = 30, { fine = false, secondsPerStill = 4, maxPerScene = 6 } = {}) {
  const list = Array.isArray(scenes) ? scenes : []
  const spans = sceneFrameSpans(list, fps)
  const cutsOf = (i, sp) =>
    (Array.isArray(list[i]?.cuts) ? list[i].cuts : [])
      .map((c) => ({ s: Math.round(Number(c?.start)), e: Math.round(Number(c?.end)), framing: String(c?.framing || '') }))
      .filter((c) => Number.isFinite(c.s) && Number.isFinite(c.e) && c.e > c.s && c.s < sp.dur)
      .sort((a, b) => a.s - b.s)
  if (!fine) {
    // the classic pair; a still that lands inside a re-framed sub-shot still says which 机位 it shows
    const byId = new Map(spans.map((sp, i) => [sp.id, { sp, cuts: cutsOf(i, sp) }]))
    return planSceneKeyframes(list, fps).map((k) => {
      const s = byId.get(k.sceneId)
      if (!s || s.cuts.length < 2) return k
      const local = k.frame - s.sp.start
      const idx = s.cuts.findIndex((c) => local >= c.s && local < c.e)
      return idx >= 0 ? { ...k, cut: { index: idx, count: s.cuts.length, framing: s.cuts[idx].framing || 'wide' } } : k
    })
  }
  const rate = Number(fps) > 0 ? Number(fps) : 30
  const cap = Math.max(2, Math.round(Number(maxPerScene) || 6))
  const pick = (arr) => (arr.length <= cap ? arr : Array.from({ length: cap }, (_, k) => arr[Math.round((k * (arr.length - 1)) / (cap - 1))]))
  const out = []
  spans.forEach((sp, i) => {
    if (!sp.id) return
    const cuts = cutsOf(i, sp)
    let items
    if (cuts.length >= 2) {
      items = cuts.map((c, k) => ({ local: Math.round((c.s + Math.min(c.e, sp.dur)) / 2), cut: { index: k, count: cuts.length, framing: c.framing || 'wide' } }))
    } else {
      const n = Math.max(2, Math.min(cap, Math.ceil(sp.dur / rate / Math.max(1, Number(secondsPerStill) || 4))))
      const fr = n === 2 ? [0.35, 0.8] : Array.from({ length: n }, (_, k) => 0.2 + (0.65 * k) / (n - 1))
      items = fr.map((f) => ({ local: Math.round(sp.dur * f), fraction: f, cut: null }))
    }
    const seen = new Set()
    for (const it of pick(items)) {
      const local = Math.min(sp.dur - 1, Math.max(0, it.local))
      if (seen.has(local)) continue
      seen.add(local)
      // planned positions keep their round fraction (labels read 「35%」 as in the classic pair)
      const fraction = Number((it.fraction ?? local / sp.dur).toFixed(3))
      out.push({ sceneId: sp.id, fraction, frame: sp.start + local, ...(it.cut ? { cut: it.cut } : {}) })
    }
  })
  return out
}

/**
 * Frames for the scene-motion check: the midpoint of every sub-shot when the scene has `cuts` (beat-analyzer.js
 * contract), otherwise `count` evenly spaced frames after the entry animation; at most `maxPerScene` per scene.
 */
export function planSceneMotionFrames(scenes = [], fps = 30, { count = 4, maxPerScene = 6 } = {}) {
  const list = Array.isArray(scenes) ? scenes : []
  const spans = sceneFrameSpans(list, fps)
  const out = []
  spans.forEach((sp, i) => {
    if (!sp.id || sp.dur < 4) return
    const cuts = (Array.isArray(list[i]?.cuts) ? list[i].cuts : [])
      .map((c) => ({ s: Math.round(Number(c?.start)), e: Math.round(Number(c?.end)) }))
      .filter((c) => Number.isFinite(c.s) && Number.isFinite(c.e) && c.e > c.s && c.s < sp.dur)
      .sort((a, b) => a.s - b.s)
    let locals = cuts.length >= 2
      ? cuts.map((c) => Math.round((c.s + Math.min(c.e, sp.dur)) / 2))
      : Array.from({ length: Math.max(2, count) }, (_, k) => Math.round(sp.dur * (0.22 + (0.72 * k) / Math.max(1, Math.max(2, count) - 1))))
    locals = [...new Set(locals.map((f) => Math.min(sp.dur - 1, Math.max(0, f))))]
    if (locals.length > maxPerScene) locals = Array.from({ length: maxPerScene }, (_, k) => locals[Math.round((k * (locals.length - 1)) / (maxPerScene - 1))])
    locals.forEach((lf, k) => out.push({ sceneId: sp.id, fraction: Number((lf / sp.dur).toFixed(3)), frame: sp.start + lf, slot: k }))
  })
  return out
}

/** Mean absolute difference (0–255) of two coarse picture grids (Uint8 arrays of equal length). */
export function gridDistance(a, b) {
  const n = Math.min(a?.length || 0, b?.length || 0)
  if (!n) return 0
  let s = 0
  for (let k = 0; k < n; k++) s += Math.abs(a[k] - b[k])
  return s / n
}

/**
 * How much each scene's picture changes between its motion frames: the largest step between consecutive frames
 * (16×9 RGB grid, area average — particles or a slow push barely move it, a new composition does).
 * `grids` is [{ sceneId, grid }] in time order. Returns { [sceneId]: { stills, maxStep, steps } }.
 */
export function summarizeSceneMotion(grids = []) {
  const by = {}
  for (const g of grids) {
    if (!g?.sceneId || !g.grid) continue
    ;(by[g.sceneId] = by[g.sceneId] || []).push(g.grid)
  }
  const out = {}
  for (const [id, list] of Object.entries(by)) {
    const steps = []
    for (let k = 1; k < list.length; k++) steps.push(Number(gridDistance(list[k - 1], list[k]).toFixed(2)))
    out[id] = { stills: list.length, maxStep: steps.length ? Math.max(...steps) : 0, steps }
  }
  return out
}

/** Below this largest step (mean |Δ| on 0–255) every still of a scene looks the same: a held picture. */
export const STATIC_SCENE_GRID_TOL = 5

/**
 * Scene-motion check for AI-coded scenes (local, no model): render the motion frames of `sceneIds` with the
 * compositor's own re-frames, camera and subtitles switched off (input prop `dshSceneOnly`), reduce every still to a
 * 16×9 grid with FFmpeg and report each scene's largest change. At most `maxStills` stills; { ok: false, reason }
 * when rendering is unavailable.
 */
export async function measureSceneMotion({ projectDir, scenes = [], fps = 30, sceneIds = null, maxStills = 96, signal } = {}) {
  const wanted = sceneIds ? new Set(sceneIds) : null
  let frames = planSceneMotionFrames(scenes, fps).filter((k) => !wanted || wanted.has(k.sceneId))
  if (frames.length > maxStills) {
    // keep whole scenes (every still of a checked scene), drop the rest
    const keep = new Set()
    let n = 0
    for (const k of frames) {
      if (keep.has(k.sceneId)) continue
      const c = frames.filter((x) => x.sceneId === k.sceneId).length
      if (n + c > maxStills) break
      keep.add(k.sceneId)
      n += c
    }
    frames = frames.filter((k) => keep.has(k.sceneId))
  }
  if (frames.length < 2) return { ok: false, scenes: {}, reason: 'no frames' }
  const rendered = await renderSceneKeyframes({ projectDir, keyframes: frames, scale: 0.25, jpegQuality: 70, signal, inputProps: { dshSceneOnly: true } })
  if (!rendered?.ok || !rendered.frames.length) return { ok: false, scenes: {}, reason: rendered?.reason || 'render failed' }
  const { ffmpeg } = resolveBinaries()
  const tmp = join(projectDir, 'output', '.motion-check')
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  try {
    rendered.frames.forEach((f, i) => writeFileSync(join(tmp, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.base64, 'base64')))
    const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-framerate', '1', '-i', join(tmp, '%04d.jpg'), '-vf', 'scale=16:9:flags=area,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { maxBuffer: 1 << 24, windowsHide: true })
    const N = 16 * 9 * 3
    const buf = r.stdout || Buffer.alloc(0)
    if (r.status !== 0 || buf.length < N * rendered.frames.length) return { ok: false, scenes: {}, reason: 'grid decode failed' }
    const grids = rendered.frames.map((f, i) => ({ sceneId: f.sceneId, grid: buf.subarray(i * N, (i + 1) * N) }))
    return { ok: true, scenes: summarizeSceneMotion(grids), reason: '' }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/**
 * Render the planned keyframes. Returns { ok, frames: [{ sceneId, fraction, frame, base64, file }], reason }.
 * `scale` shrinks the stills (0.5 → 960×540 for a 1080p film); `outDir` (optional) keeps a copy of every JPEG;
 * `inputProps` reach the composition (e.g. { dshSceneOnly: true } for the scene-motion check).
 */
export async function renderSceneKeyframes({ projectDir, keyframes = [], scale = 0.5, jpegQuality = 78, outDir = '', signal, onProgress, inputProps } = {}) {
  if (!projectDir || keyframes.length === 0) return { ok: false, frames: [], reason: 'no keyframes' }
  const runtime = resolveRemotionRuntime()
  if (!runtime || !existsSync(runtime.rendererEntry) || !existsSync(runtime.bundlerEntry)) {
    return { ok: false, frames: [], reason: 'Remotion runtime not found' }
  }
  ensureRemotionJunction(projectDir)
  const bundlerMod = await import(pathToFileURL(runtime.bundlerEntry).href)
  const rendererMod = await import(pathToFileURL(runtime.rendererEntry).href)
  const entryPoint = existsSync(join(projectDir, 'src', 'index.ts')) ? join(projectDir, 'src', 'index.ts') : join(projectDir, 'src', 'Root.tsx')
  const publicDir = join(projectDir, 'public')
  const browserExecutable = findRemotionBrowser(runtime) || resolveBrowserExecutable() || undefined
  const hw = resolveLowSpecPolicy({ repoRoot: REPO_ROOT, requestedFps: 30, totalDurationSec: 30 })
  if (outDir) mkdirSync(outDir, { recursive: true })
  let bundleDir = ''
  let browser = null
  const onAbort = () => {
    try {
      browser?.close({ silent: true })
    } catch {}
  }
  signal?.addEventListener('abort', onAbort, { once: true })
  const frames = []
  try {
    const serveUrl = await bundlerMod.bundle({
      entryPoint,
      publicDir: existsSync(publicDir) ? publicDir : undefined,
      onProgress: () => {},
      onDirectoryCreated: (dir) => {
        bundleDir = dir
      },
    })
    bundleDir = bundleDir || serveUrl
    if (signal?.aborted) throw createAbortError()
    browser = await rendererMod.openBrowser('chrome', {
      browserExecutable: browserExecutable || null,
      chromiumOptions: { gl: hw.chromiumGl || undefined },
    })
    const composition = await rendererMod.selectComposition({ serveUrl, id: 'MainVideo', browserExecutable, puppeteerInstance: browser, ...(inputProps ? { inputProps } : {}) })
    const last = Math.max(0, (composition.durationInFrames || 1) - 1)
    for (let i = 0; i < keyframes.length; i++) {
      if (signal?.aborted) throw createAbortError()
      const kf = keyframes[i]
      const frame = Math.min(last, Math.max(0, Math.round(kf.frame)))
      const res = await rendererMod.renderStill({
        composition,
        serveUrl,
        frame,
        output: null,
        imageFormat: 'jpeg',
        jpegQuality,
        scale,
        puppeteerInstance: browser,
        browserExecutable,
        offthreadVideoThreads: 1,
        offthreadVideoCacheSizeInBytes: 128 * 1024 * 1024,
        ...(inputProps ? { inputProps } : {}),
      })
      const buf = Buffer.from(res.buffer)
      let file = ''
      if (outDir) {
        // a sub-shot still is named after its 机位 (scene-03-c2-45.jpg), so the saved review frames read in order
        const cutTag = kf.cut && Number.isInteger(kf.cut.index) ? `-c${kf.cut.index + 1}` : ''
        file = join(outDir, `${String(kf.sceneId).replace(/[^\w-]+/g, '_')}${cutTag}-${Math.round(kf.fraction * 100)}.jpg`)
        try {
          writeFileSync(file, buf)
        } catch {
          file = ''
        }
      }
      frames.push({ ...kf, frame, base64: buf.toString('base64'), file })
      onProgress?.(Math.round(((i + 1) / keyframes.length) * 100), `${i + 1}/${keyframes.length}`)
    }
    return { ok: frames.length > 0, frames, reason: '' }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') throw err
    return { ok: frames.length > 0, frames, reason: String(err?.message || err).slice(0, 300) }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    try {
      await browser?.close({ silent: true })
    } catch {}
    removeRemotionBundleDir(bundleDir)
  }
}
