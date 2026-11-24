/**
 * Temporal post-render QA detectors (photosensitive flash risk · frozen frames · unplanned jump cuts).
 *
 * One FFmpeg decode pass (downscaled to 320px) collects:
 *   - per-frame average luma (`signalstats` YAVG, printed via `metadata`)
 *   - a 16×16 luma grid per frame (rawvideo) for area-aware (≥25% of frame) flash detection
 *   - `freezedetect` freeze intervals
 *   - `scdet` hard-cut scores
 * The detectors themselves are pure functions so they can be unit-tested with synthetic arrays.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { REPO_ROOT, runCommandRedirected } from '../shared/index.js'

export const QA_GRID_SIZE = 16

export const DEFAULT_TEMPORAL_QA_OPTIONS = Object.freeze({
  // Harding-style strong transition: ≥ 20% of full-scale luma, concurrently on ≥ 25% of the frame
  flashDelta: 0.2,
  // WCAG 2.x "general flash" floor (10%) — only used for the warning tier
  flashSoftDelta: 0.1,
  flashAreaMin: 0.25,
  // The darker image of a flash pair must be below ~0.8 relative luminance (≈ 0.9 gamma-encoded luma)
  flashDarkMax: 0.9,
  maxFlashesPerSec: 3,
  freezeThresholdSec: 2.5,
  freezeNoise: '-60dB',
  scdetThreshold: 10,
  cutToleranceFrames: 2,
})

const round3 = (n) => Number(Number(n).toFixed(3))
const fmtSec = (s) => `${Number(s).toFixed(2)}s`

/**
 * Run the single FFmpeg analysis pass and return raw per-frame signals.
 */
export async function collectTemporalSignals({
  ffmpeg,
  mp4Path,
  durationSec = 0,
  freezeNoise = DEFAULT_TEMPORAL_QA_OPTIONS.freezeNoise,
  freezeMinSec = DEFAULT_TEMPORAL_QA_OPTIONS.freezeThresholdSec,
  scdetThreshold = DEFAULT_TEMPORAL_QA_OPTIONS.scdetThreshold,
  filters,
  signal,
  timeoutMs,
} = {}) {
  const startedAt = Date.now()
  const tmpDir = join(REPO_ROOT, '.tmp')
  mkdirSync(tmpDir, { recursive: true })
  const gridPath = join(tmpDir, `qa-grid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.gray`)
  const g = QA_GRID_SIZE
  const safeFreezeSec = Math.max(0.2, Number(freezeMinSec) || DEFAULT_TEMPORAL_QA_OPTIONS.freezeThresholdSec)
  const cutThreshold = Number(scdetThreshold) || 10
  // Only filters this FFmpeg build has are used; a missing one is replaced by an equivalent measurement instead of
  // failing the whole pass (the bundled 2018 build has no `scdet`).
  const caps = filters ? new Set(filters) : await probeFfmpegFilters(ffmpeg)
  const plan = buildTemporalFilterGraph({ filters: caps, gridSize: g, freezeNoise, freezeSec: safeFreezeSec, scdetThreshold: cutThreshold })
  const graph = plan.graph
  const lumaFullRange = true

  let res
  try {
    res = await runCommandRedirected(
      ffmpeg,
      ['-hide_banner', '-nostats', '-threads', '4', '-i', mp4Path, '-an', '-sn', '-dn', '-filter_complex', graph, '-map', '[grid]', '-f', 'rawvideo', '-y', gridPath],
      { timeoutMs: timeoutMs || Math.max(120_000, Math.round((Number(durationSec) || 60) * 2500)), signal },
    )
  } catch (err) {
    try { unlinkSync(gridPath) } catch {}
    throw err
  }

  let gridBuf = Buffer.alloc(0)
  try {
    if (existsSync(gridPath)) gridBuf = readFileSync(gridPath)
  } finally {
    try { unlinkSync(gridPath) } catch {}
  }
  if (res.code !== 0 && gridBuf.length === 0) {
    throw new Error(`时序分析 FFmpeg 失败: ${String(res.stderr || '').slice(-600)}`)
  }

  const cells = g * g
  const gridFrames = Math.floor(gridBuf.length / cells)
  const log = `${res.stderr || ''}\n${res.stdout || ''}`
  const yavgByFrame = []
  const ydifByFrame = []
  const freezes = []
  const cuts = []
  const sceneScoreByFrame = []
  const timeByFrame = []
  let curFrame = -1
  let pendingFreezeStart = null
  for (const line of log.split(/\r?\n/)) {
    let m = /\bframe:(\d+)\s+pts:\S+\s+pts_time:([-\d.eE+]+)?/.exec(line)
    if (m) {
      curFrame = Number(m[1])
      if (m[2] !== undefined && curFrame >= 0) timeByFrame[curFrame] = Number(m[2])
      continue
    }
    m = /lavfi\.scene_score=([-\d.eE+]+)/.exec(line)
    if (m) {
      if (curFrame >= 0) sceneScoreByFrame[curFrame] = Number(m[1])
      continue
    }
    m = /lavfi\.signalstats\.YAVG=([-\d.eE+]+)/.exec(line)
    if (m) {
      if (curFrame >= 0) yavgByFrame[curFrame] = Number(m[1])
      continue
    }
    m = /lavfi\.signalstats\.YDIF=([-\d.eE+]+)/.exec(line)
    if (m) {
      if (curFrame >= 0) ydifByFrame[curFrame] = Number(m[1])
      continue
    }
    m = /lavfi\.freezedetect\.freeze_start:\s*([-\d.eE+]+)/.exec(line)
    if (m) {
      pendingFreezeStart = Number(m[1])
      continue
    }
    m = /lavfi\.freezedetect\.freeze_end:\s*([-\d.eE+]+)/.exec(line)
    if (m) {
      const end = Number(m[1])
      const start = pendingFreezeStart !== null ? pendingFreezeStart : end
      freezes.push({ startSec: round3(start), endSec: round3(end), durationSec: round3(Math.max(0, end - start)) })
      pendingFreezeStart = null
      continue
    }
    m = /lavfi\.scd\.score:\s*([-\d.eE+]+),\s*lavfi\.scd\.time:\s*([-\d.eE+]+)/.exec(line)
    if (m) cuts.push({ timeSec: round3(Number(m[2])), score: Number(Number(m[1]).toFixed(3)) })
  }
  const frameCount = Math.max(gridFrames, yavgByFrame.length, sceneScoreByFrame.length)
  if (pendingFreezeStart !== null) {
    // Freeze still running at end of file (no freeze_end line printed)
    const end = Number(durationSec) > pendingFreezeStart ? Number(durationSec) : pendingFreezeStart
    freezes.push({ startSec: round3(pendingFreezeStart), endSec: round3(end), durationSec: round3(Math.max(0, end - pendingFreezeStart)), openEnded: true })
  }

  const grid = new Uint8Array(gridBuf.buffer, gridBuf.byteOffset, gridFrames * cells)
  const yavg = new Float64Array(frameCount)
  const ydif = new Float64Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    const v = yavgByFrame[i]
    yavg[i] = Number.isFinite(v) ? normalizeLuma(v, lumaFullRange) : NaN
    const d = ydifByFrame[i]
    ydif[i] = Number.isFinite(d) ? d : NaN
  }
  // Frame times: printed pts_time when available, otherwise evenly spread over the probed duration
  const spreadFps = frameCount > 0 && Number(durationSec) > 0 ? frameCount / Number(durationSec) : 30
  const timeOf = (f) => (Number.isFinite(timeByFrame[f]) ? timeByFrame[f] : f / spreadFps)

  const degraded = []
  if (!plan.stats) {
    // Frame luma from the 16×16 grid (flash analysis still works); the picture-activity check needs signalstats
    for (let i = 0; i < gridFrames; i++) {
      let s = 0
      for (let c = 0; c < cells; c++) s += grid[i * cells + c]
      yavg[i] = normalizeLuma(s / cells, true)
    }
    degraded.push('本机 FFmpeg 缺少 signalstats 滤镜：闪烁检测改用亮度网格，「画面动势」检查跳过')
  }
  if (plan.cuts === 'select') {
    // `select` scene score = min(mafd, |Δmafd|) / 100 on 8-bit values; scdet reports the same quantity in % of full scale
    for (let f = 0; f < sceneScoreByFrame.length; f++) {
      const s = sceneScoreByFrame[f]
      if (!Number.isFinite(s)) continue
      const score = (s * 100 * 100) / 256
      if (score >= cutThreshold) cuts.push({ timeSec: round3(timeOf(f)), score: Number(score.toFixed(3)) })
    }
    degraded.push('本机 FFmpeg 缺少 scdet 滤镜：硬切检测改用 select 场景分数（同一算法）')
  } else if (plan.cuts === 'grid') {
    cuts.push(...detectGridCuts({ grid, gridCells: cells, frameCount: gridFrames, threshold: cutThreshold, timeOf }))
    degraded.push('本机 FFmpeg 缺少 scdet / select 场景检测：硬切检测改用亮度网格帧差（较粗略）')
  }
  if (!plan.freeze) {
    freezes.push(...deriveFreezesFromFrames({ ydif, grid, gridCells: cells, frameCount, minSec: safeFreezeSec, timeOf, durationSec }))
    degraded.push('本机 FFmpeg 缺少 freezedetect 滤镜：冻结画面改用逐帧差值判断')
  }

  return {
    frameCount,
    gridFrames,
    gridCells: cells,
    grid,
    yavg,
    ydif,
    fullRange: lumaFullRange,
    freezes,
    cuts,
    capabilities: { stats: plan.stats ? 'signalstats' : 'grid', cuts: plan.cuts, freeze: plan.freeze ? 'freezedetect' : 'frame-diff' },
    degraded,
    analysisMs: Date.now() - startedAt,
  }
}

/* ---------- FFmpeg capability probe (filters differ a lot between builds) ---------- */

const FILTER_CACHE = new Map()

/** Filter names from `ffmpeg -filters` output (lines like ` T.C scale   V->V   Scale the input video size…`). */
export function parseFfmpegFilterList(text) {
  const out = new Set()
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*[A-Z.|]{2,3}\s+([A-Za-z0-9_]+)\s+\S*->\S*/.exec(line)
    if (m) out.add(m[1])
  }
  return out
}

/**
 * Filters the given FFmpeg binary provides, detected once per binary path and cached for the process.
 * Returns an empty set when the list cannot be read — callers then use only long-standing filters.
 */
export async function probeFfmpegFilters(ffmpeg, { timeoutMs = 20_000 } = {}) {
  const key = String(ffmpeg || '')
  if (!key) return new Set()
  if (!FILTER_CACHE.has(key)) {
    FILTER_CACHE.set(
      key,
      runCommandRedirected(key, ['-hide_banner', '-filters'], { timeoutMs })
        .then((res) => parseFfmpegFilterList(`${res.stdout || ''}\n${res.stderr || ''}`))
        .catch(() => new Set()),
    )
  }
  const set = await FILTER_CACHE.get(key)
  // An empty answer (probe failed) is not cached, so the next QA run asks again
  if (!set.size) FILTER_CACHE.delete(key)
  return set
}

/**
 * The temporal-QA filter graph for a given filter set: `scdet` → `select` scene score → grid frame difference for
 * hard cuts, `freezedetect` → frame-difference runs for frozen frames, `signalstats` → luma grid for frame luma.
 * An empty / unknown filter set takes the long-standing filters only (`select`, `signalstats`, `metadata`).
 */
export function buildTemporalFilterGraph({ filters, gridSize = QA_GRID_SIZE, freezeNoise = DEFAULT_TEMPORAL_QA_OPTIONS.freezeNoise, freezeSec = DEFAULT_TEMPORAL_QA_OPTIONS.freezeThresholdSec, scdetThreshold = DEFAULT_TEMPORAL_QA_OPTIONS.scdetThreshold } = {}) {
  const known = filters instanceof Set ? filters : new Set(filters || [])
  const unknown = known.size === 0
  const has = (name) => known.has(name) || (unknown && ['select', 'signalstats', 'metadata'].includes(name))
  const stats = has('signalstats') && has('metadata')
  const freeze = has('freezedetect')
  const cuts = has('scdet') ? 'scdet' : has('select') && has('metadata') ? 'select' : 'grid'
  const branches = ['qg']
  if (stats) branches.push('qy')
  if (freeze) branches.push('qf')
  if (cuts !== 'grid') branches.push('qs')
  // Everything is converted to full-range (pc) luma first, so YAVG and the grid are 0–255 regardless of the
  // source range (Remotion emits yuvj420p/pc, the HTML engine yuv420p/tv).
  const parts = [`[0:v]scale=w=320:h=-2:flags=bilinear:out_range=pc,format=yuv420p,split=${branches.length}${branches.map((b) => `[${b}]`).join('')}`]
  // YAVG = frame luma (flash analysis); YDIF = mean |frame − previous frame| (picture activity)
  if (stats) parts.push('[qy]signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG,metadata=mode=print:key=lavfi.signalstats.YDIF,nullsink')
  if (freeze) parts.push(`[qf]freezedetect=n=${freezeNoise}:d=${freezeSec},nullsink`)
  if (cuts === 'scdet') parts.push(`[qs]scdet=threshold=${Number(scdetThreshold) || 10},nullsink`)
  else if (cuts === 'select') parts.push('[qs]select=gte(scene\\,0),metadata=mode=print:key=lavfi.scene_score,nullsink')
  parts.push(`[qg]scale=w=${gridSize}:h=${gridSize}:flags=area:out_range=pc,format=gray[grid]`)
  return { graph: parts.join(';'), stats, freeze, cuts }
}

/** scdet-style hard cuts from the luma grid: score = min(mafd, |mafd − previous mafd|) in % of full scale. */
export function detectGridCuts({ grid, gridCells = QA_GRID_SIZE * QA_GRID_SIZE, frameCount, threshold = 10, timeOf = (f) => f / 30 } = {}) {
  const out = []
  const n = Math.min(Number(frameCount) || 0, Math.floor((grid?.length || 0) / gridCells))
  let prev = 0
  for (let f = 1; f < n; f++) {
    let s = 0
    for (let c = 0; c < gridCells; c++) s += Math.abs(grid[f * gridCells + c] - grid[(f - 1) * gridCells + c])
    const mafd = (s / gridCells / 255) * 100
    const score = Math.min(mafd, Math.abs(mafd - prev))
    prev = mafd
    if (score >= threshold) out.push({ timeSec: round3(timeOf(f)), score: Number(score.toFixed(3)) })
  }
  return out
}

/**
 * Frozen stretches without `freezedetect`: consecutive frames whose difference stays below ≈ −60 dB of full scale
 * (signalstats YDIF, else the luma grid) and that never drift away from the run's first frame, lasting ≥ minSec.
 */
export function deriveFreezesFromFrames({ ydif, grid, gridCells = QA_GRID_SIZE * QA_GRID_SIZE, frameCount, minSec = 2.5, timeOf = (f) => f / 30, durationSec = 0 } = {}) {
  const n = Number(frameCount) || 0
  const gridN = Math.floor((grid?.length || 0) / gridCells)
  const stepLimit = 0.3
  const driftLimit = 0.8
  const gdist = (a, b) => {
    let s = 0
    for (let c = 0; c < gridCells; c++) s += Math.abs(grid[a * gridCells + c] - grid[b * gridCells + c])
    return s / gridCells
  }
  const still = (f, runStart) => {
    const d = ydif && Number.isFinite(ydif[f]) ? ydif[f] : f < gridN ? gdist(f, f - 1) : Infinity
    if (!(d <= stepLimit)) return false
    return f < gridN && runStart < gridN ? gdist(f, runStart) <= driftLimit : true
  }
  const out = []
  let runStart = -1
  const close = (endFrame) => {
    if (runStart < 0) return
    const start = timeOf(runStart)
    const end = endFrame >= n ? Math.max(timeOf(n - 1), Number(durationSec) || 0) : timeOf(endFrame)
    if (end - start >= minSec) out.push({ startSec: round3(start), endSec: round3(end), durationSec: round3(end - start), source: 'frame-diff' })
    runStart = -1
  }
  for (let f = 1; f < n; f++) {
    if (still(f, runStart >= 0 ? runStart : f - 1)) {
      if (runStart < 0) runStart = f - 1
    } else close(f)
  }
  close(n)
  return out
}

/** Map an 8-bit luma code value to 0..1 of full scale (limited 16–235 or full 0–255). */
export function normalizeLuma(v, fullRange = false) {
  const n = fullRange ? v / 255 : (v - 16) / 219
  return Math.max(0, Math.min(1, n))
}

/**
 * Harding-style extremum tracker: emits monotonic luminance runs (transitions) whose amplitude ≥ minAmp
 * and whose darker end lies below darkMax. Reversals smaller than `noise` do not split a run.
 */
export function trackLumaTransitions(getVal, n, { minAmp, noise, darkMax }, onTransition) {
  if (n < 2) return
  let dir = 0
  let anchorVal = getVal(0)
  let anchorIdx = 0
  let extVal = anchorVal
  let extIdx = 0
  const emit = (d, startIdx, endIdx, amp, darker) => {
    if (amp >= minAmp && darker < darkMax) onTransition(d, startIdx, endIdx, amp)
  }
  for (let i = 1; i < n; i++) {
    const v = getVal(i)
    if (!Number.isFinite(v)) continue
    if (dir === 0) {
      if (!Number.isFinite(anchorVal)) {
        anchorVal = v
        anchorIdx = i
        continue
      }
      if (v - anchorVal > noise) {
        dir = 1
        extVal = v
        extIdx = i
      } else if (anchorVal - v > noise) {
        dir = -1
        extVal = v
        extIdx = i
      }
      continue
    }
    if (dir === 1) {
      if (v > extVal) {
        extVal = v
        extIdx = i
      } else if (extVal - v > noise) {
        emit(1, anchorIdx, extIdx, extVal - anchorVal, anchorVal)
        anchorVal = extVal
        anchorIdx = extIdx
        dir = -1
        extVal = v
        extIdx = i
      }
    } else {
      if (v < extVal) {
        extVal = v
        extIdx = i
      } else if (v - extVal > noise) {
        emit(-1, anchorIdx, extIdx, anchorVal - extVal, extVal)
        anchorVal = extVal
        anchorIdx = extIdx
        dir = 1
        extVal = v
        extIdx = i
      }
    }
  }
  if (dir === 1) emit(1, anchorIdx, extIdx, extVal - anchorVal, anchorVal)
  else if (dir === -1) emit(-1, anchorIdx, extIdx, anchorVal - extVal, extVal)
}

function clusterAreaEvents(counts, ampMax, n, cells, areaMin, dir) {
  const thr = Math.max(1, areaMin * cells)
  const sum3 = (f) => (f > 0 ? counts[f - 1] : 0) + counts[f] + (f + 1 < n ? counts[f + 1] : 0)
  const amp3 = (f) => Math.max(f > 0 ? ampMax[f - 1] : 0, ampMax[f], f + 1 < n ? ampMax[f + 1] : 0)
  const out = []
  let f = 0
  while (f < n) {
    const s = sum3(f)
    if (s < thr) {
      f++
      continue
    }
    // Threshold on the 3-frame area sum, but place the event on the single frame where most cells peaked
    let best = f
    let bestS = s
    let peakFrame = f
    let g = f
    while (g < n) {
      const sg = sum3(g)
      if (sg < thr) break
      if (sg > bestS) {
        bestS = sg
        best = g
      }
      if (counts[g] > counts[peakFrame]) peakFrame = g
      g++
    }
    out.push({ frame: peakFrame, dir, area: Math.min(1, bestS / cells), amp: amp3(best) })
    f = g + 1
  }
  return out
}

function countFlashPairs(evs) {
  let pairs = 0
  for (let k = 0; k + 1 < evs.length; ) {
    if (evs[k].dir !== evs[k + 1].dir) {
      pairs++
      k += 2
    } else {
      k++
    }
  }
  return pairs
}

/**
 * Area-aware transition events for one amplitude tier.
 */
export function extractFlashEvents({ grid, gridCells, frameCount, yavg, fullRange = true, minAmp, areaMin, darkMax }) {
  const n = Math.max(0, Number(frameCount) || 0)
  const noise = Math.max(0.01, minAmp / 4)
  const opts = { minAmp, noise, darkMax }
  const events = []
  const hasGrid = grid && gridCells > 0 && grid.length >= n * gridCells && n > 1
  if (hasGrid) {
    const up = new Float64Array(n)
    const down = new Float64Array(n)
    const upAmp = new Float64Array(n)
    const downAmp = new Float64Array(n)
    for (let c = 0; c < gridCells; c++) {
      trackLumaTransitions(
        (f) => normalizeLuma(grid[f * gridCells + c], fullRange),
        n,
        opts,
        (d, _s, endIdx, amp) => {
          if (d > 0) {
            up[endIdx] += 1
            if (amp > upAmp[endIdx]) upAmp[endIdx] = amp
          } else {
            down[endIdx] += 1
            if (amp > downAmp[endIdx]) downAmp[endIdx] = amp
          }
        },
      )
    }
    events.push(...clusterAreaEvents(up, upAmp, n, gridCells, areaMin, 1))
    events.push(...clusterAreaEvents(down, downAmp, n, gridCells, areaMin, -1))
  } else if (yavg && yavg.length > 1) {
    // Fallback: global average luma only (a ≥ minAmp swing of the mean implies ≥ minAmp of the frame changed)
    trackLumaTransitions((f) => yavg[f], Math.min(n || yavg.length, yavg.length), opts, (d, _s, endIdx, amp) => {
      events.push({ frame: endIdx, dir: d, area: null, amp })
    })
  }
  events.sort((a, b) => a.frame - b.frame || a.dir - b.dir)
  if (yavg && yavg.length > 0) {
    for (const ev of events) {
      let lo = Infinity
      let hi = -Infinity
      for (let k = Math.max(0, ev.frame - 3); k <= Math.min(yavg.length - 1, ev.frame + 3); k++) {
        const v = yavg[k]
        if (!Number.isFinite(v)) continue
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      ev.lumaSwing = Number.isFinite(hi - lo) ? round3(hi - lo) : null
    }
  }
  return events
}

function evaluateFlashWindows(events, fps, maxPerSec) {
  const winFrames = Math.max(1, Math.round(fps))
  const windows = []
  let maxFlashes = 0
  for (let i = 0; i < events.length; i++) {
    const startF = events[i].frame
    const inWin = []
    for (let j = i; j < events.length && events[j].frame < startF + winFrames; j++) inWin.push(events[j])
    const flashes = countFlashPairs(inWin)
    if (flashes > maxFlashes) maxFlashes = flashes
    if (flashes >= maxPerSec) {
      windows.push({
        startFrame: startF,
        endFrame: inWin[inWin.length - 1].frame,
        flashes,
        transitions: inWin.length,
        maxAreaPct: inWin.some((e) => e.area !== null) ? Math.round(Math.max(...inWin.map((e) => e.area || 0)) * 100) : null,
        maxAmp: round3(Math.max(...inWin.map((e) => e.amp || 0))),
        maxLumaSwing: round3(Math.max(0, ...inWin.map((e) => e.lumaSwing || 0))),
      })
    }
  }
  return { windows, maxFlashes }
}

function pickWorstWindows(windows, limit = 5) {
  const sorted = [...windows].sort((a, b) => b.flashes - a.flashes || b.maxAmp - a.maxAmp || a.startFrame - b.startFrame)
  const picked = []
  for (const w of sorted) {
    if (picked.some((p) => w.startFrame <= p.endFrame && w.endFrame >= p.startFrame)) continue
    picked.push(w)
    if (picked.length >= limit) break
  }
  return picked.sort((a, b) => a.startFrame - b.startFrame)
}

/**
 * Photosensitive flash-risk evaluation (WCAG 2.x / ITU-R BT.1702 "no more than 3 flashes in any 1-second window").
 * - fail: any 1 s window with > 3 strong flashes (≥ flashDelta luma swing on ≥ 25% of the frame)
 * - warning: exactly 3 strong flashes in a window (at the limit), or > 3 softer (10–20%) flashes
 */
export function detectPhotosensitiveFlashes({
  grid,
  gridCells = QA_GRID_SIZE * QA_GRID_SIZE,
  frameCount,
  yavg,
  fps = 30,
  fullRange = true,
  intentionalTimes = [],
  options = {},
} = {}) {
  const o = { ...DEFAULT_TEMPORAL_QA_OPTIONS, ...options }
  const safeFps = Number(fps) > 0 ? Number(fps) : 30
  const n = Math.max(0, Number(frameCount) || (yavg ? yavg.length : 0))
  const common = { grid, gridCells, frameCount: n, yavg, fullRange, areaMin: o.flashAreaMin, darkMax: o.flashDarkMax }
  const strongEvents = extractFlashEvents({ ...common, minAmp: o.flashDelta })
  const softEvents = extractFlashEvents({ ...common, minAmp: o.flashSoftDelta })
  const strong = evaluateFlashWindows(strongEvents, safeFps, o.maxFlashesPerSec)
  const soft = evaluateFlashWindows(softEvents, safeFps, o.maxFlashesPerSec)

  const intentional = (intentionalTimes || []).filter((t) => Number.isFinite(Number(t))).map(Number)
  const isIntentional = (w) => {
    const a = w.startFrame / safeFps - 0.2
    const b = (w.endFrame + 1) / safeFps + 0.2
    return intentional.some((t) => t >= a && t <= b)
  }
  const decorate = (w, tier) => {
    const level =
      tier === 'strong'
        ? w.flashes > o.maxFlashesPerSec
          ? 'fail'
          : 'warning'
        : w.flashes > o.maxFlashesPerSec
          ? 'warning'
          : 'pass'
    return {
      startSec: round3(w.startFrame / safeFps),
      endSec: round3((w.endFrame + 1) / safeFps),
      flashesPerSec: w.flashes,
      transitions: w.transitions,
      maxAreaPct: w.maxAreaPct,
      maxLumaDeltaPct: Math.round(w.maxAmp * 100),
      maxFrameLumaSwingPct: Math.round(w.maxLumaSwing * 100),
      tier,
      level,
      intentional: isIntentional(w),
    }
  }

  const strongWorst = pickWorstWindows(strong.windows).map((w) => decorate(w, 'strong'))
  const softOver = soft.windows.filter((w) => w.flashes > o.maxFlashesPerSec)
  const softWorst = strong.maxFlashes > o.maxFlashesPerSec ? [] : pickWorstWindows(softOver).map((w) => decorate(w, 'soft'))
  const severity =
    strong.maxFlashes > o.maxFlashesPerSec
      ? 'fail'
      : strong.maxFlashes === o.maxFlashesPerSec || soft.maxFlashes > o.maxFlashesPerSec
        ? 'warning'
        : 'pass'

  return {
    severity,
    maxFlashesPerSec: strong.maxFlashes,
    softMaxFlashesPerSec: soft.maxFlashes,
    strongTransitionCount: strongEvents.length,
    softTransitionCount: softEvents.length,
    worstWindows: [...strongWorst, ...softWorst].sort((a, b) => a.startSec - b.startSec),
    transitions: strongEvents.slice(0, 400).map((e) => ({
      frame: e.frame,
      timeSec: round3(e.frame / safeFps),
      dir: e.dir > 0 ? 'up' : 'down',
      areaPct: e.area === null ? null : Math.round(e.area * 100),
      lumaDeltaPct: Math.round(e.amp * 100),
    })),
    softTransitionFrames: softEvents.map((e) => e.frame),
    method: grid && grid.length ? 'grid16x16+signalstats' : 'signalstats-yavg',
    thresholds: {
      lumaDeltaPct: Math.round(o.flashDelta * 100),
      softLumaDeltaPct: Math.round(o.flashSoftDelta * 100),
      minAreaPct: Math.round(o.flashAreaMin * 100),
      maxFlashesPerSec: o.maxFlashesPerSec,
    },
  }
}

const STATIC_SCENE_TOKENS = new Set(['hold', 'static', 'still', 'freeze', 'freeze_end', 'freeze-end', 'locked', 'fixed', 'none', 'off', 'static-hold'])

/** Whether the planned shot list marks a scene as an intentional static hold (frozen frames allowed). */
export function isPlannedStaticScene(scene) {
  if (!scene || typeof scene !== 'object') return false
  if ([scene.staticHold, scene.hold, scene.freeze, scene.isStatic, scene.static].some((v) => v === true)) return true
  if (scene.qa && typeof scene.qa === 'object' && (scene.qa.allowFreeze === true || scene.qa.staticHold === true)) return true
  for (const key of ['recipe', 'kenBurns', 'camera', 'cameraMove', 'motion', 'shotType']) {
    const raw = scene[key]
    const val = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.type || raw.kind || raw.mode || '' : ''
    if (STATIC_SCENE_TOKENS.has(String(val).trim().toLowerCase())) return true
  }
  return false
}

/**
 * Normalized scene timeline in frames & seconds (prefers exact `startFrame`/`durationInFrames`).
 */
export function buildSceneTimeline(script, fps = 30) {
  const safeFps = Number(fps) > 0 ? Number(fps) : Number(script?.fps) || 30
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []
  const out = []
  let cursorFrame = 0
  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i] || {}
    const startFrame = Number.isFinite(Number(sc.startFrame))
      ? Math.max(0, Math.round(Number(sc.startFrame)))
      : Number.isFinite(Number(sc.startSec))
        ? Math.max(0, Math.round(Number(sc.startSec) * safeFps))
        : cursorFrame
    const durFrames =
      Number(sc.durationInFrames) > 0
        ? Math.round(Number(sc.durationInFrames))
        : Math.max(1, Math.round((Number(sc.durationSec) || 4) * safeFps))
    out.push({
      index: i,
      id: sc.id || `scene-${String(i + 1).padStart(2, '0')}`,
      title: sc.title || '',
      startFrame,
      endFrame: startFrame + durFrames,
      startSec: round3(startFrame / safeFps),
      endSec: round3((startFrame + durFrames) / safeFps),
      transition: sc.transition || '',
      scene: sc,
    })
    cursorFrame = startFrame + durFrames
  }
  return out
}

/**
 * Times (seconds) of intentional flashes / impacts declared by the plan: sword-clash action events and flash-style cuts.
 */
export function collectIntentionalImpactTimes(script, timeline = null) {
  const fps = Number(script?.fps) || 30
  const tl = timeline || buildSceneTimeline(script, fps)
  const times = []
  for (const row of tl) {
    const sc = row.scene || {}
    for (const ev of Array.isArray(sc.actionEvents) ? sc.actionEvents : []) {
      const tag = `${ev?.kind || ''} ${ev?.role || ''}`
      if (!/clash|impact|flash|hit|strike|slash|stab|explo|boom/i.test(tag)) continue
      const t = Number.isFinite(Number(ev.hitSec))
        ? Number(ev.hitSec)
        : Number.isFinite(Number(ev.absSec))
          ? Number(ev.absSec)
          : row.startSec + (Number(ev.offsetSec) || 0)
      if (Number.isFinite(t)) times.push(round3(t))
    }
    if (row.index > 0 && /flash|white|strobe|punch|impact|glitch/i.test(String(row.transition || ''))) {
      times.push(row.startSec)
    }
  }
  return [...new Set(times)].sort((a, b) => a - b)
}

function mergeIntervals(list) {
  const sorted = list.filter((iv) => iv.end > iv.start).sort((a, b) => a.start - b.start)
  const out = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

function overlapSec(a0, a1, intervals) {
  let sum = 0
  for (const iv of intervals) {
    const lo = Math.max(a0, iv.start)
    const hi = Math.min(a1, iv.end)
    if (hi > lo) sum += hi - lo
  }
  return sum
}

/**
 * Frozen-frame analysis: freezes longer than `thresholdSec` that the planned shot list does not explain.
 */
export function analyzeFrozenFrames({ freezes = [], timeline = [], totalSec = 0, thresholdSec = 2.5, allowedIntervals = [] } = {}) {
  const pad = 0.15
  const planned = mergeIntervals([
    ...timeline.filter((r) => isPlannedStaticScene(r.scene)).map((r) => ({ start: r.startSec - pad, end: r.endSec + pad })),
    ...(Array.isArray(allowedIntervals) ? allowedIntervals : [])
      .map((iv) => ({ start: Number(iv?.startSec ?? iv?.start) - pad, end: Number(iv?.endSec ?? iv?.end) + pad }))
      .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end)),
  ])
  const items = freezes.map((fz) => {
    const start = Number(fz.startSec) || 0
    const end = Number(fz.endSec) || start
    const dur = Math.max(0, end - start)
    const covered = Math.min(dur, overlapSec(start, end, planned))
    const unexplained = round3(Math.max(0, dur - covered))
    // Ignore edge overlaps of a frame or two (freezedetect starts on the last moving frame)
    const minOverlap = Math.min(0.25, dur * 0.1)
    const scenes = timeline.filter((r) => Math.min(end, r.endSec) - Math.max(start, r.startSec) >= minOverlap)
    return {
      startSec: round3(start),
      endSec: round3(end),
      durationSec: round3(dur),
      unexplainedSec: unexplained,
      explained: unexplained < thresholdSec,
      sceneIds: scenes.map((r) => r.id),
      plannedStaticSceneIds: scenes.filter((r) => isPlannedStaticScene(r.scene)).map((r) => r.id),
    }
  })
  const unexplained = items.filter((it) => !it.explained && it.durationSec >= thresholdSec)
  const unexplainedTotal = unexplained.reduce((a, it) => a + it.unexplainedSec, 0)
  const severity = unexplained.length === 0 ? 'pass' : totalSec > 0 && unexplainedTotal > totalSec * 0.4 ? 'fail' : 'warning'
  return {
    severity,
    thresholdSec,
    freezes: items,
    unexplained,
    unexplainedTotalSec: round3(unexplainedTotal),
    plannedStaticSceneIds: timeline.filter((r) => isPlannedStaticScene(r.scene)).map((r) => r.id),
  }
}

/**
 * Frame-difference spike detector for 1–`maxBurst`-frame foreign bursts (A → X → A): both edges jump by at least
 * `minJump` (mean absolute luma difference on the 16×16 grid, 0–1) while the frames before and after the burst match.
 * This catches the classic single bad frame that `scdet` misses — scdet scores min(mafd, |mafd − prev_mafd|),
 * so the second, equally large edge of a one-frame glitch is suppressed.
 */
export function detectOutlierFrameBursts({ grid, gridCells = QA_GRID_SIZE * QA_GRID_SIZE, frameCount, maxBurst = 2, minJump = 0.08, returnRatio = 3 } = {}) {
  const n = Math.max(0, Number(frameCount) || 0)
  const cells = gridCells
  if (!grid || n < 3 || grid.length < n * cells) return []
  const mad = (a, b) => {
    let s = 0
    const oa = a * cells
    const ob = b * cells
    for (let c = 0; c < cells; c++) s += Math.abs(grid[oa + c] - grid[ob + c])
    return s / cells / 255
  }
  const step = new Float64Array(n)
  for (let f = 1; f < n; f++) step[f] = mad(f - 1, f)
  const out = []
  for (let f = 1; f < n - 1; f++) {
    if (step[f] < minJump) continue
    for (let k = 1; k <= maxBurst && f + k < n; k++) {
      const into = step[f]
      const outOf = step[f + k]
      if (outOf < minJump) continue
      const across = mad(f - 1, f + k)
      if (across * returnRatio <= Math.min(into, outOf)) {
        out.push({ frame: f, frames: k, into: round3(into), outOf: round3(outOf), across: round3(across) })
        f += k
        break
      }
    }
  }
  return out
}

/**
 * Hard-cut / glitch analysis: `scdet` cuts not within ±toleranceFrames of a planned scene boundary.
 * Cuts explained by detected flashes or declared impacts (sword clashes) are reported separately.
 */
export function analyzeJumpCuts({ cuts = [], timeline = [], fps = 30, flashFrames = [], impactTimes = [], outlierBursts = [], toleranceFrames = 2 } = {}) {
  const safeFps = Number(fps) > 0 ? Number(fps) : 30
  const tol = Math.max(0, Math.round(Number(toleranceFrames) || 0))
  const boundaries = timeline.filter((r) => r.index > 0).map((r) => r.startFrame)
  const impactFrames = (impactTimes || []).map((t) => Math.round(Number(t) * safeFps)).filter(Number.isFinite)
  const near = (frame, list, d) => list.some((b) => Math.abs(frame - b) <= d)
  // planned scene cut → declared impact/flash-cut → undeclared luminance flash → unplanned jump
  const classified = cuts
    .map((c) => {
      const frame = Math.round(Number(c.timeSec) * safeFps)
      let kind = 'unplanned'
      if (near(frame, boundaries, tol)) kind = 'planned'
      else if (near(frame, impactFrames, tol + 1)) kind = 'impact'
      else if (near(frame, flashFrames, tol)) kind = 'flash'
      return { timeSec: round3(Number(c.timeSec)), frame, score: c.score, kind }
    })
    .sort((a, b) => a.frame - b.frame)
  const unplanned = classified.filter((c) => c.kind === 'unplanned')
  // A 1–3 frame burst (cut in + cut out) that the plan does not explain is the classic render glitch:
  // blank/white/foreign frame. Undeclared flashes are included because a glitch frame usually changes luminance too.
  const suspects = classified.filter((c) => c.kind === 'unplanned' || c.kind === 'flash')
  const glitches = []
  for (let i = 0; i + 1 < suspects.length; i++) {
    const a = suspects[i]
    const b = suspects[i + 1]
    if (b.frame - a.frame <= 3) {
      glitches.push({
        startSec: a.timeSec,
        endSec: round3((b.frame + 1) / safeFps),
        startFrame: a.frame,
        frames: b.frame - a.frame,
        scores: [a.score, b.score],
        kinds: [a.kind, b.kind],
        source: 'scdet',
      })
      i++
    }
  }
  // Foreign 1–2 frame bursts from the luma-grid frame-difference spikes (not explained by a cut or declared impact)
  for (const ob of outlierBursts || []) {
    const f = Number(ob.frame)
    const k = Math.max(1, Number(ob.frames) || 1)
    if (!Number.isFinite(f)) continue
    if (near(f, boundaries, tol) || near(f + k, boundaries, tol)) continue
    if (near(f, impactFrames, tol + 1)) continue
    if (glitches.some((gl) => Math.abs(gl.startFrame - f) <= 2)) continue
    glitches.push({
      startSec: round3(f / safeFps),
      endSec: round3((f + k) / safeFps),
      startFrame: f,
      frames: k,
      scores: [],
      kinds: ['frame-diff'],
      source: 'frame-diff',
      jumpPct: Math.round(Math.min(ob.into, ob.outOf) * 100),
      returnPct: Math.round(ob.across * 100),
    })
  }
  glitches.sort((x, y) => x.startFrame - y.startFrame)
  const count = (k) => classified.filter((c) => c.kind === k).length
  return {
    severity: unplanned.length > 0 || glitches.length > 0 ? 'warning' : 'pass',
    toleranceFrames: tol,
    totalCuts: classified.length,
    plannedCount: count('planned'),
    flashCount: count('flash'),
    impactCount: count('impact'),
    unplanned,
    glitchCandidates: glitches,
    plannedBoundaryCount: boundaries.length,
  }
}

const listSecs = (arr, pick, max = 6) => {
  const head = arr.slice(0, max).map(pick).join('、')
  return arr.length > max ? `${head} 等 ${arr.length} 处` : head
}

/** Build the three Chinese QA check rows (name/passed/value/severity) from detector results. */
/**
 * Seconds whose average frame-to-frame change (full-range luma, 320 px, cut frames excluded) is below this read as
 * "nothing moves". Calibrated on rendered films: a calm shot whose figure breathes / turns its head over drifting
 * particles measures 0.22–0.26, the frozen second halves of the 6th 项羽 run 0.11–0.17.
 */
export const NEAR_STILL_YDIF = 0.2
/** More than this share of near-still seconds turns the picture-activity entry into a warning (never a failure). */
export const NEAR_STILL_WARN_RATIO = 0.2

/**
 * Picture activity: per-second mean |frame − previous frame| (YDIF) without the cut frames (a cut changes the whole
 * frame and would hide a frozen second), the near-still seconds and where they cluster (runs of ≥ 2 s, with the shots
 * they belong to). A hint for static stretches, not a pass/fail criterion.
 */
export function analyzeMotionActivity({ ydif, fps = 30, timeline = [], cutTimes = [], threshold = NEAR_STILL_YDIF } = {}) {
  const n = ydif?.length || 0
  const f = Math.max(1, Math.round(Number(fps) || 30))
  const skip = new Set()
  const tl = Array.isArray(timeline) ? timeline : []
  for (const t of tl) {
    const sf = Number.isFinite(Number(t.startFrame)) ? Number(t.startFrame) : Math.round(Number(t.startSec || 0) * f)
    for (let k = -1; k <= 1; k++) skip.add(sf + k)
  }
  for (const c of Array.isArray(cutTimes) ? cutTimes : []) {
    const cf = Math.round(Number(c) * f)
    for (let k = -1; k <= 1; k++) skip.add(cf + k)
  }
  const perSec = []
  for (let s = 0; s * f < n; s++) {
    let sum = 0
    let cnt = 0
    for (let i = s * f; i < Math.min(n, (s + 1) * f); i++) {
      if (i === 0 || skip.has(i) || !Number.isFinite(ydif[i])) continue
      sum += ydif[i]
      cnt++
    }
    perSec.push(cnt ? Number((sum / cnt).toFixed(3)) : null)
  }
  const measured = perSec.filter((v) => v !== null)
  const still = perSec.map((v) => v !== null && v < threshold)
  const ranges = []
  for (let s = 0; s < still.length; s++) {
    if (!still[s]) continue
    let e = s
    while (e + 1 < still.length && still[e + 1]) e++
    if (e - s + 1 >= 2) {
      const sceneIds = tl.filter((t) => t.startSec < e + 1 && t.endSec > s).map((t) => t.id)
      ranges.push({ startSec: s, endSec: e + 1, durationSec: e - s + 1, sceneIds })
    }
    s = e
  }
  const sorted = [...measured].sort((a, b) => a - b)
  return {
    threshold,
    totalSec: measured.length,
    nearStillSec: still.filter(Boolean).length,
    medianPerSec: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    perSec,
    ranges,
  }
}

export function buildTemporalQaChecks({ flash, freeze, jumps, motion, capabilities = null }) {
  const checks = []
  // name the measurement actually used (a build without scdet / freezedetect gets an equivalent measurement)
  const freezeTool = capabilities?.freeze === 'frame-diff' ? '逐帧差值' : 'freezedetect'
  const cutTool = capabilities?.cuts === 'select' ? 'select 场景分数' : capabilities?.cuts === 'grid' ? '亮度网格帧差' : 'scdet'
  if (flash) {
    const t = flash.thresholds
    const worst = flash.worstWindows.filter((w) => w.level !== 'pass')
    const desc = (w) => `${fmtSec(w.startSec)}–${fmtSec(w.endSec)} ${w.flashesPerSec}次/秒${w.maxAreaPct !== null ? `·面积${w.maxAreaPct}%` : ''}${w.intentional ? '(含剧情闪白)' : ''}`
    let value
    if (flash.severity === 'fail') {
      value = `✕ 超标：${listSecs(worst.filter((w) => w.level === 'fail'), desc, 4)}（任意 1 秒内 > ${t.maxFlashesPerSec} 次强闪烁，亮度跳变 ≥${t.lumaDeltaPct}% 且面积 ≥${t.minAreaPct}%）；请拉开闪白间隔或把闪白强度降到 ${t.lumaDeltaPct}% 以下`
    } else if (flash.severity === 'warning') {
      value = `⚠ 警告：${listSecs(worst, desc, 4)}（已达 ${t.maxFlashesPerSec} 次/秒上限或存在 ${t.softLumaDeltaPct}–${t.lumaDeltaPct}% 中等强度频闪），建议适当拉开闪白节奏`
    } else {
      value = `最高 ${flash.maxFlashesPerSec} 次强闪烁/秒 (上限 ${t.maxFlashesPerSec} 次/秒，亮度跳变 ≥${t.lumaDeltaPct}% 且面积 ≥${t.minAreaPct}%)，无光敏癫痫风险`
    }
    checks.push({ name: '光敏癫痫闪烁风险 (WCAG/Harding ≤3次/秒)', passed: flash.severity !== 'fail', severity: flash.severity, value })
  }
  if (freeze) {
    const desc = (f) => `${fmtSec(f.startSec)}–${fmtSec(f.endSec)}(${f.durationSec.toFixed(1)}s${f.sceneIds.length ? `·${f.sceneIds.slice(0, 2).join('/')}` : ''})`
    const explainedCount = freeze.freezes.length - freeze.unexplained.length
    const value =
      freeze.severity === 'pass'
        ? freeze.freezes.length === 0
          ? `全片无 > ${freeze.thresholdSec}s 的冻结画面`
          : `检测到 ${freeze.freezes.length} 处静止画面，均属计划内定格镜头`
        : `${freeze.severity === 'fail' ? '✕ 大面积冻结' : '⚠ 警告'}：计划外冻结 ${listSecs(freeze.unexplained, desc, 4)}${explainedCount > 0 ? `；另有 ${explainedCount} 处计划内定格` : ''}（> ${freeze.thresholdSec}s，可能是动画卡死/素材未加载）`
    checks.push({ name: `冻结帧检测 (${freezeTool} > ${freeze.thresholdSec}s)`, passed: freeze.severity !== 'fail', severity: freeze.severity, value })
  }
  if (jumps) {
    const extra = [
      jumps.flashCount ? `闪白 ${jumps.flashCount}` : '',
      jumps.impactCount ? `动作冲击 ${jumps.impactCount}` : '',
    ].filter(Boolean).join(' / ')
    const problems = [
      jumps.unplanned.length ? `${jumps.unplanned.length} 处计划外跳切 ${listSecs(jumps.unplanned, (c) => fmtSec(c.timeSec), 6)}` : '',
      jumps.glitchCandidates.length ? `疑似单帧坏帧/未声明闪帧 ${listSecs(jumps.glitchCandidates, (g) => `${fmtSec(g.startSec)}(${g.frames}帧)`, 4)}` : '',
    ].filter(Boolean).join('；')
    const value =
      jumps.severity === 'pass'
        ? `检测到 ${jumps.totalCuts} 处硬切，均可由分镜切点 ±${jumps.toleranceFrames} 帧或计划内冲击/闪白解释${extra ? `（${extra}）` : ''}`
        : `⚠ 警告：${problems}（计划内 ${jumps.plannedCount}${extra ? ` / ${extra}` : ''}）`
    checks.push({ name: `跳帧/渲染故障检测 (${cutTool} + 帧差离群 · 分镜外 ±${jumps.toleranceFrames} 帧)`, passed: true, severity: jumps.severity, value })
  }
  if (motion && motion.totalSec > 0) {
    const ratio = motion.nearStillSec / motion.totalSec
    const where = motion.ranges.length
      ? `，集中在 ${listSecs(motion.ranges, (r) => `${fmtSec(r.startSec)}–${fmtSec(r.endSec)}${r.sceneIds.length ? `(${r.sceneIds.slice(0, 2).join('/')})` : ''}`, 4)}`
      : ''
    checks.push({
      name: '画面动势（几乎不动的秒数）',
      passed: true,
      severity: ratio > NEAR_STILL_WARN_RATIO ? 'warning' : 'pass',
      value: `几乎不动 ${motion.nearStillSec}/${motion.totalSec} 秒${where}${ratio > NEAR_STILL_WARN_RATIO ? '；这些地方除了缓慢运镜几乎没有元素在动（入场动画做完就定住），画面显得呆板' : ''}`,
    })
  }
  return checks
}

/* ---------- Held pictures: how long the film shows the same picture ---------- */

/**
 * Held-picture analysis. Frames are decoded small (≈ 96×54 gray at 4 fps) and compared on a coarse ≈ 16×9 grid of
 * block means, so small local motion (rotating rays, a flickering light, drifting dust, a moving cursor) and the
 * subtitle line barely register, while a cut or a new composition changes most of the grid. A picture "holds" while
 * every frame stays within `tolerance` of the hold's first frame — allowing for a slow zoom / pan of up to
 * `maxZoom` / `maxShift` (Ken Burns) — and a change has to persist for `persistFrames` frames (flash frames,
 * flicker and camera shakes do not end a hold).
 *
 * Calibrated on rendered films (share of the film in holds ≥ 4 s): a beat film that is one composition with rotating
 * rays ≈ 100 %, a beat film of 13 slow reveals of ≈ 10.7 s ≈ 90 %, a screen-recording tutorial ≈ 44 %, dense beat
 * films (a new picture every 1–3 s, also dark infographic slides) 0–5 %, narrated films 30–96 %.
 */
export const HELD_PICTURE_DEFAULTS = Object.freeze({
  fps: 4,
  cellPx: 6,
  gridCells: 144,
  // mean |Δluma| (0–255) over the coarse grid under which two frames show the same picture
  tolerance: 10,
  // low-contrast pictures (dark slides: grid σ < contrastRef) are compared proportionally stricter
  contrastRef: 30,
  contrastFloor: 8,
  persistFrames: 3,
  maxZoom: 1.15,
  maxShift: 0.05,
  // an instant re-frame of the same artwork (scene.cuts: wide 1.0 / medium 1.18 / close 1.36 …) counts as a new picture
  reframeIsNewPicture: true,
  minHoldSec: 4,
  // the first / last seconds (title and end card) are not judged
  edgeSec: 3,
  beatShareFail: 0.3,
  beatHoldFailSec: 6,
  otherShareWarn: 0.85,
  otherHoldWarnSec: 25,
  otherHoldAlwaysWarnSec: 45,
})

/** Decode size and comparison grid for a video: ≈ `gridCells` square cells of `cellPx` pixels, following the aspect. */
export function heldPictureGeometry(width, height, { cellPx = HELD_PICTURE_DEFAULTS.cellPx, gridCells = HELD_PICTURE_DEFAULTS.gridCells } = {}) {
  const w = Number(width) > 0 ? Number(width) : 16
  const h = Number(height) > 0 ? Number(height) : 9
  const GW = Math.max(4, Math.min(32, Math.round(Math.sqrt(gridCells * (w / h)))))
  const GH = Math.max(4, Math.min(32, Math.round(gridCells / GW)))
  return { GW, GH, W: GW * cellPx, H: GH * cellPx }
}

/** Decode the film to small gray frames at a low frame rate (one cheap FFmpeg pass, rawvideo via a temp file). */
export async function collectHoldFrames({ ffmpeg, mp4Path, width, height, durationSec = 0, fps = HELD_PICTURE_DEFAULTS.fps, signal, timeoutMs } = {}) {
  const startedAt = Date.now()
  const geo = heldPictureGeometry(width, height)
  const tmpDir = join(REPO_ROOT, '.tmp')
  mkdirSync(tmpDir, { recursive: true })
  // file output instead of a stdout pipe: pipes can fail with EPERM in sandboxed Windows hosts
  const outPath = join(tmpDir, `qa-hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.gray`)
  let res
  try {
    res = await runCommandRedirected(
      ffmpeg,
      ['-hide_banner', '-nostats', '-loglevel', 'error', '-i', mp4Path, '-an', '-sn', '-dn', '-vf', `fps=${fps},scale=${geo.W}:${geo.H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-y', outPath],
      { timeoutMs: timeoutMs || Math.max(60_000, Math.round((Number(durationSec) || 60) * 1000)), signal },
    )
  } catch (err) {
    try { unlinkSync(outPath) } catch {}
    throw err
  }
  let buf = Buffer.alloc(0)
  try {
    if (existsSync(outPath)) buf = readFileSync(outPath)
  } finally {
    try { unlinkSync(outPath) } catch {}
  }
  const frameBytes = geo.W * geo.H
  const count = Math.floor(buf.length / frameBytes)
  if (count === 0) throw new Error(`画面停留分析解码失败: ${String(res?.stderr || '').slice(-400)}`)
  return { ...geo, fps, count, frames: new Uint8Array(buf.buffer, buf.byteOffset, count * frameBytes), analysisMs: Date.now() - startedAt }
}

/**
 * Split decoded frames into "pictures": segments in which every frame shows the segment's first picture (see
 * HELD_PICTURE_DEFAULTS). Pure function; `frames` holds `count` gray W×H frames.
 */
export function segmentHeldPictures({ frames, count, W, H, GW, GH, fps = HELD_PICTURE_DEFAULTS.fps, options = {} } = {}) {
  const o = { ...HELD_PICTURE_DEFAULTS, ...options }
  const n = Math.max(0, Math.min(Number(count) || 0, Math.floor((frames?.length || 0) / Math.max(1, W * H))))
  const NC = GW * GH
  const bw = W / GW
  const bh = H / GH
  const FS = W * H
  const grids = new Float32Array(n * NC)
  const means = new Float32Array(n)
  const sigmas = new Float32Array(n)
  const stats = (g, off) => {
    let s = 0
    for (let c = 0; c < NC; c++) s += g[off + c]
    const m = s / NC
    let v = 0
    for (let c = 0; c < NC; c++) v += (g[off + c] - m) * (g[off + c] - m)
    return [m, Math.sqrt(v / NC)]
  }
  for (let i = 0; i < n; i++) {
    const off = i * NC
    const fo = i * FS
    for (let y = 0; y < H; y++) {
      const row = off + Math.min(GH - 1, Math.floor(y / bh)) * GW
      for (let x = 0; x < W; x++) grids[row + Math.min(GW - 1, Math.floor(x / bw))] += frames[fo + y * W + x]
    }
    for (let c = 0; c < NC; c++) grids[off + c] /= bw * bh
    ;[means[i], sigmas[i]] = stats(grids, off)
  }
  // zoom / pan hypotheses: the frame shows the anchor scaled by z around the centre and shifted by (dx, dy)
  const warps = []
  const zSteps = 3
  for (let k = -zSteps; k <= zSteps; k++) {
    const z = Math.pow(o.maxZoom, k / zSteps)
    for (const sx of [-1, -0.5, 0, 0.5, 1]) for (const sy of [-1, -0.5, 0, 0.5, 1]) warps.push({ z, dx: sx * o.maxShift * W, dy: sy * o.maxShift * H })
  }
  const S = new Float64Array((W + 1) * (H + 1))
  const sat = (x, y) => {
    const cx = Math.max(0, Math.min(W, x))
    const cy = Math.max(0, Math.min(H, y))
    const x0 = Math.floor(cx)
    const y0 = Math.floor(cy)
    const x1 = Math.min(W, x0 + 1)
    const y1 = Math.min(H, y0 + 1)
    const fx = cx - x0
    const fy = cy - y0
    const r0 = y0 * (W + 1)
    const r1 = y1 * (W + 1)
    return (S[r0 + x0] * (1 - fx) + S[r0 + x1] * fx) * (1 - fy) + (S[r1 + x0] * (1 - fx) + S[r1 + x1] * fx) * fy
  }
  // block means of the anchor frame under every warp (box sums on an integral image)
  const anchorGrids = (a) => {
    const fo = a * FS
    for (let y = 0; y < H; y++) {
      let row = 0
      for (let x = 0; x < W; x++) {
        row += frames[fo + y * W + x]
        S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row
      }
    }
    return warps.map(({ z, dx, dy }) => {
      const g = new Float32Array(NC)
      for (let gy = 0; gy < GH; gy++) {
        let y0 = (gy * bh - H / 2) / z + H / 2 + dy
        let y1 = ((gy + 1) * bh - H / 2) / z + H / 2 + dy
        y0 = Math.max(0, Math.min(H - 1, y0))
        y1 = Math.max(y0 + 1, Math.min(H, y1))
        for (let gx = 0; gx < GW; gx++) {
          let x0 = (gx * bw - W / 2) / z + W / 2 + dx
          let x1 = ((gx + 1) * bw - W / 2) / z + W / 2 + dx
          x0 = Math.max(0, Math.min(W - 1, x0))
          x1 = Math.max(x0 + 1, Math.min(W, x1))
          g[gy * GW + gx] = (sat(x1, y1) - sat(x0, y1) - sat(x1, y0) + sat(x0, y0)) / ((x1 - x0) * (y1 - y0))
        }
      }
      const [, sd] = stats(g, 0)
      return { g, sd }
    })
  }
  const dist = (i, wg) => {
    const off = i * NC
    let best = Infinity
    for (const w of wg) {
      let s = 0
      for (let c = 0; c < NC; c++) s += Math.abs(grids[off + c] - w.g[c])
      s = (s / NC) * Math.max(1, o.contrastRef / Math.max(o.contrastFloor, (sigmas[i] + w.sd) / 2))
      if (s < best) best = s
    }
    return best
  }
  const plain = (a, b) => {
    let s = 0
    for (let c = 0; c < NC; c++) s += Math.abs(grids[a * NC + c] - grids[b * NC + c])
    return s / NC
  }
  const segments = []
  const push = (a, b) => segments.push({ startFrame: a, endFrame: b, startSec: round3(a / fps), endSec: round3(b / fps), durationSec: round3((b - a) / fps) })
  if (n === 0) return { segments, frameCount: 0, fps }
  const scaled = (a, b) => plain(a, b) * Math.max(1, o.contrastRef / Math.max(o.contrastFloor, (sigmas[a] + sigmas[b]) / 2))
  // A hard re-frame (an instant cut to a closer / wider / shifted view of the same artwork, e.g. the renderer's
  // scene.cuts) is a new picture, although a slow zoom / pan of the same size is not: the view jumps between two
  // samples, stays off the old view for persistFrames samples and keeps resembling the new view (flicker and
  // flash frames fall back to the old view).
  const reframedAt = (i, anchor) => {
    if (!o.reframeIsNewPicture || scaled(i - 1, i) <= o.tolerance) return false
    for (let k = 0; k < o.persistFrames && i + k < n; k++) {
      if (scaled(anchor, i + k) <= o.tolerance) return false
      if (k > 0 && scaled(i, i + k) >= scaled(anchor, i + k)) return false
    }
    return true
  }
  let segStart = 0
  let anchor = 0
  let wg = anchorGrids(0)
  for (let i = 1; i < n; i++) {
    if (dist(i, wg) <= o.tolerance) {
      if (!reframedAt(i, anchor)) continue
    } else {
      let persistent = true
      for (let k = 1; k < o.persistFrames && i + k < n; k++) {
        if (dist(i + k, wg) <= o.tolerance) {
          persistent = false
          break
        }
      }
      if (!persistent) continue
    }
    push(segStart, i)
    segStart = i
    // a transition frame (dissolve / wipe in progress) is not a good reference: compare to the next frame instead
    anchor = i + 1 < n && plain(i, i + 1) > o.tolerance ? i + 1 : i
    wg = anchorGrids(anchor)
  }
  push(segStart, n)
  return { segments, frameCount: n, fps }
}

const TITLE_END_TOKENS = /^(title|title-?card|opening-?title|cover|intro-?card|end|end-?card|ending|ending-?card|outro|outro-?card|credits?|cta|片头|片尾|标题卡|片尾卡|片尾字幕|结尾卡)$/i

/** Whether the plan marks a scene as a title / end card (its picture may stand still). */
export function isTitleOrEndScene(scene) {
  if (!scene || typeof scene !== 'object') return false
  if ([scene.titleCard, scene.endCard, scene.isTitleCard, scene.isEndCard].some((v) => v === true)) return true
  if (scene.qa && typeof scene.qa === 'object' && [scene.qa.titleCard, scene.qa.endCard, scene.qa.allowHold].some((v) => v === true)) return true
  // the diorama end card (channel name / closing title) holds its picture by design
  if (scene.stageSpec && typeof scene.stageSpec === 'object' && String(scene.stageSpec.archetype || '') === 'channel-end') return true
  for (const key of ['kind', 'type', 'sceneType', 'sceneRole', 'purpose', 'cardType', 'layout', 'shotType']) {
    const v = scene[key]
    if (typeof v === 'string' && TITLE_END_TOKENS.test(v.trim())) return true
  }
  return false
}

const BEAT_TEXT = /高燃|卡点|踩点|燃剪|快剪|beat[\s-]?(sync|cut|lock)/i

/**
 * Whether a film is cut to the beat (subtitle MV / beat-synced narration / dynamic or 高燃 pacing) — held pictures
 * fail such a film — or a narrated / other film, where long holds are normal and only extreme ones are reported.
 */
export function classifyFilmRhythm(script, override = '') {
  const pick = String(override || script?.qa?.filmRhythm || '').toLowerCase()
  if (pick === 'beat' || pick === 'narration') return { kind: pick, label: pick === 'beat' ? '卡点/高燃类' : '解说/其他类', reasons: ['指定'] }
  const s = script && typeof script === 'object' ? script : {}
  const reasons = []
  const mode = String(s.narrationMode || '').toLowerCase()
  if (mode === 'subtitle-mv' || mode === 'tts-beat-sync') reasons.push(mode === 'subtitle-mv' ? '纯字幕卡点 MV' : '配音 + 卡点')
  if (String(s.pacingMode || s.pacing || '').toLowerCase() === 'dynamic') reasons.push('高燃快节奏')
  if (s.beatSync === true) reasons.push('画面卡 BGM 节拍')
  const text = [s.title, s.displayTitle, s.topic, s.goal, s.brief, s.userPrompt].filter((v) => typeof v === 'string').join(' ')
  if (BEAT_TEXT.test(text)) reasons.push('主题要求高燃/卡点')
  if (reasons.length) return { kind: 'beat', label: '卡点/高燃类', reasons }
  // no script.json (an imported MP4): judged as a narrated film, which the report says
  return { kind: 'narration', label: '解说/其他类', reasons: [], unknown: !script || typeof script !== 'object' || !Array.isArray(script.scenes) }
}

const clock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const secTxt = (sec) => `${Number(sec).toFixed(Number(sec) >= 10 ? 0 : 1)} 秒`
const idsTxt = (ids, max = 3) => (ids.length ? (ids.length > max ? `${ids.slice(0, max).join('、')} 等 ${ids.length} 个分镜` : ids.join('、')) : '')

/** Pieces of [a, b) not covered by the (merged) intervals. */
function subtractIntervals(a, b, intervals) {
  const out = []
  let cur = a
  for (const iv of intervals) {
    if (iv.end <= cur || iv.start >= b) continue
    if (iv.start > cur) out.push({ start: cur, end: Math.min(b, iv.start) })
    cur = Math.max(cur, iv.end)
    if (cur >= b) break
  }
  if (cur < b) out.push({ start: cur, end: b })
  return out
}

/**
 * Judge the held pictures of a film. Beat films fail when more than `beatShareFail` of the judged time is held
 * pictures (≥ `minHoldSec`) or any single hold is longer than `beatHoldFailSec`; other films only get a warning for
 * extreme holds. Title / end cards (first and last `edgeSec`, scenes flagged as title / end, `script.qa.allowedHolds`)
 * are not judged.
 */
export function analyzeHeldPictures({ segments = [], totalSec = 0, timeline = [], rhythm = { kind: 'narration' }, allowedIntervals = [], options = {} } = {}) {
  const o = { ...HELD_PICTURE_DEFAULTS, ...options }
  const total = Math.max(0, Number(totalSec) || (segments.length ? segments[segments.length - 1].endSec : 0))
  const tl = Array.isArray(timeline) ? timeline : []
  const beat = rhythm?.kind === 'beat'
  const edge = Math.min(o.edgeSec, total / 4)
  const excluded = mergeIntervals([
    { start: 0, end: edge, why: 'edge' },
    { start: Math.max(0, total - edge), end: total, why: 'edge' },
    ...tl.filter((r) => isTitleOrEndScene(r.scene)).map((r) => ({ start: r.startSec, end: r.endSec })),
    ...(Array.isArray(allowedIntervals) ? allowedIntervals : [])
      .map((iv) => ({ start: Number(iv?.startSec ?? iv?.start), end: Number(iv?.endSec ?? iv?.end) }))
      .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end)),
  ])
  const judgedSec = Math.max(0, total - overlapSec(0, total, excluded))
  const overlapOf = (r, a, b) => Math.min(b, r.endSec) - Math.max(a, r.startSec)
  const scenesIn = (a, b) => tl.filter((r) => overlapOf(r, a, b) >= Math.min(0.4, Math.max(0.05, (r.endSec - r.startSec) * 0.3))).map((r) => r.id)
  // scenes a hold clearly covers (≥ 1 s or half the scene): two or more means a planned cut did not change the picture
  const scenesCovered = (a, b) => tl.filter((r) => overlapOf(r, a, b) >= Math.min(1, (r.endSec - r.startSec) * 0.5)).map((r) => r.id)
  const holds = segments
    .filter((s) => s.durationSec >= o.minHoldSec)
    .map((s) => {
      const pieces = subtractIntervals(s.startSec, s.endSec, excluded)
      const judged = pieces.reduce((acc, p) => acc + p.end - p.start, 0)
      const longestPiece = pieces.reduce((m, p) => Math.max(m, p.end - p.start), 0)
      return {
        startSec: s.startSec,
        endSec: s.endSec,
        durationSec: s.durationSec,
        judgedSec: round3(judged),
        longestJudgedSec: round3(longestPiece),
        sceneIds: scenesIn(s.startSec, s.endSec),
        coveredSceneIds: scenesCovered(s.startSec, s.endSec),
        // what is left after removing the title / end card is no longer a hold
        titleOrEnd: longestPiece < o.minHoldSec,
      }
    })
  const heldTotal = holds.reduce((acc, h) => acc + h.durationSec, 0)
  const counted = holds.filter((h) => !h.titleOrEnd)
  const judgedHeld = counted.reduce((acc, h) => acc + h.judgedSec, 0)
  const share = judgedSec > 0 ? judgedHeld / judgedSec : 0
  const longest = counted.reduce((m, h) => (!m || h.longestJudgedSec > m.longestJudgedSec ? h : m), null)
  const longestSec = longest ? longest.longestJudgedSec : 0
  const durations = segments.map((s) => s.durationSec).sort((a, b) => a - b)
  let severity = 'pass'
  if (beat) {
    if (judgedSec >= o.minHoldSec && (share > o.beatShareFail || longestSec > o.beatHoldFailSec)) severity = 'fail'
  } else if ((share >= o.otherShareWarn && longestSec >= o.otherHoldWarnSec) || longestSec >= o.otherHoldAlwaysWarnSec) {
    severity = 'warning'
  }
  return {
    severity,
    rhythm: { kind: beat ? 'beat' : 'narration', label: rhythm?.label || (beat ? '卡点/高燃类' : '解说/其他类'), reasons: rhythm?.reasons || [], unknown: Boolean(rhythm?.unknown) },
    // share of the whole film in holds ≥ minHoldSec (comparable across films) and of the judged part (verdict)
    shareOfFilm: total > 0 ? round3(heldTotal / total) : 0,
    judgedShare: round3(share),
    judgedSec: round3(judgedSec),
    longestSec: round3(longestSec),
    longest: longest ? { startSec: longest.startSec, endSec: longest.endSec, durationSec: longest.durationSec, sceneIds: longest.sceneIds } : null,
    holds,
    pictureCount: segments.length,
    medianPictureSec: durations.length ? durations[Math.floor(durations.length / 2)] : 0,
    excludedRanges: excluded.map((iv) => ({ startSec: round3(iv.start), endSec: round3(iv.end) })),
    thresholds: {
      minHoldSec: o.minHoldSec,
      edgeSec: round3(edge),
      ...(beat ? { maxSharePct: Math.round(o.beatShareFail * 100), maxHoldSec: o.beatHoldFailSec } : { warnSharePct: Math.round(o.otherShareWarn * 100), warnHoldSec: o.otherHoldWarnSec, alwaysWarnHoldSec: o.otherHoldAlwaysWarnSec }),
    },
  }
}

/** One readable line per hold: "0:12–0:24 同一画面 12 秒 · scene-03、scene-04". */
export function describeHolds(held, max = 8) {
  return (held?.holds || [])
    .filter((h) => !h.titleOrEnd)
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, max)
    .sort((a, b) => a.startSec - b.startSec)
    .map((h) => `${clock(h.startSec)}–${clock(h.endSec)} 同一画面 ${secTxt(h.durationSec)}${h.sceneIds.length ? ` · ${idsTxt(h.sceneIds, 4)}` : ''}`)
}

/** The QA check row for held pictures (plain Chinese, time ranges and scene ids first). */
export function buildHeldPictureCheck(held) {
  if (!held) return null
  const beat = held.rhythm?.kind === 'beat'
  const t = held.thresholds || {}
  const pct = Math.round((held.judgedShare || 0) * 100)
  const lg = held.longest
  const longestTxt = lg ? `最长 ${clock(lg.startSec)}–${clock(lg.endSec)} 同一画面 ${secTxt(lg.durationSec)}${lg.sceneIds.length ? `（${idsTxt(lg.sceneIds)}）` : ''}` : ''
  const details = describeHolds(held)
  const name = beat ? `画面停留检测（卡点片：同一画面 ≤ ${t.maxHoldSec} 秒，停留合计 ≤ ${t.maxSharePct}%）` : `画面停留检测（同一画面 ≥ ${t.minHoldSec} 秒的段落）`
  let value
  if (held.severity === 'fail') {
    const counted = held.holds.filter((h) => !h.titleOrEnd)
    const compact = (h) => `${clock(h.startSec)}–${clock(h.endSec)}${h.sceneIds.length ? `(${h.sceneIds[0]}${h.sceneIds.length > 1 ? '等' : ''})` : ''}`
    const others = counted.length > 1 ? `；停留段：${counted.slice(0, 4).map(compact).join('、')}${counted.length > 4 ? ` 等 ${counted.length} 段` : ''}` : ''
    value = `✕ 画面停留过久：去掉片头片尾后 ${pct}% 的时间画面基本不变（卡点片应 ≤ ${t.maxSharePct}%），${longestTxt}${others}。建议在这些分镜里加切镜头或换画面（每 1–3 秒换一次），或把它们拆成更短的分镜后重新生成`
  } else if (held.severity === 'warning') {
    value = held.rhythm?.unknown
      ? `⚠ 提示：${pct}% 的时间画面基本不变，${longestTxt}；没有分镜信息，按解说类视频判断——如果这是卡点/高燃视频，这个停留时长就不合格（卡点片同一画面应 ≤ 6 秒）`
      : `⚠ 提示：${pct}% 的时间画面基本不变，${longestTxt}；解说类视频可以接受，但这么长的静止画面容易让人走神，可以考虑加插图或换镜头`
  } else {
    value = lg
      ? `同一画面停留 ≥ ${t.minHoldSec} 秒的时间占 ${pct}%，${longestTxt}${beat ? `（卡点片上限：单段 ${t.maxHoldSec} 秒、合计 ${t.maxSharePct}%）` : '（正常范围）'}`
      : `没有同一画面停留 ≥ ${t.minHoldSec} 秒的段落${held.holds.length ? '（片头片尾除外）' : ''}，画面切换正常`
  }
  return { name, passed: held.severity !== 'fail', severity: held.severity, value, details }
}

/**
 * Shot rhythm: planned shot lengths (script.json timing) against the measured picture changes. Flags, for beat films,
 * planned shots longer than the hold limit and planned cuts where the rendered picture did not change.
 */
export function analyzeShotRhythm({ timeline = [], held = null, totalSec = 0, options = {} } = {}) {
  const o = { ...HELD_PICTURE_DEFAULTS, ...options }
  const tl = Array.isArray(timeline) ? timeline : []
  const beat = held?.rhythm?.kind === 'beat'
  // planned pictures: the sub-shots of a scene that has beat-aligned cuts (scene.cuts, scene-local frames), else the scene
  const planned = []
  for (const r of tl) {
    const titleOrEnd = isTitleOrEndScene(r.scene)
    const sceneSec = r.endSec - r.startSec
    const fpsOf = sceneSec > 0 && r.endFrame > r.startFrame ? (r.endFrame - r.startFrame) / sceneSec : 30
    const durFrames = r.endFrame - r.startFrame
    const cuts = (Array.isArray(r.scene?.cuts) ? r.scene.cuts : [])
      .map((c) => ({ s: Math.max(0, Math.round(Number(c?.start))), e: Math.min(durFrames, Math.round(Number(c?.end))) }))
      .filter((c) => Number.isFinite(c.s) && Number.isFinite(c.e) && c.e > c.s)
      .sort((a, b) => a.s - b.s)
    if (cuts.length >= 2) {
      cuts.forEach((c, k) => {
        const startSec = round3(r.startSec + c.s / fpsOf)
        const endSec = round3(r.startSec + (k + 1 < cuts.length ? cuts[k + 1].s : durFrames) / fpsOf)
        planned.push({ id: `${r.id} 第${k + 1}镜`, sceneId: r.id, durationSec: round3(endSec - startSec), startSec, endSec, titleOrEnd })
      })
    } else {
      planned.push({ id: r.id, sceneId: r.id, durationSec: round3(sceneSec), startSec: r.startSec, endSec: r.endSec, titleOrEnd })
    }
  }
  const judgedPlanned = planned.filter((p) => !p.titleOrEnd)
  const longest = judgedPlanned.reduce((m, p) => (!m || p.durationSec > m.durationSec ? p : m), null)
  const longPlanned = beat ? judgedPlanned.filter((p) => p.durationSec > o.beatHoldFailSec) : []
  // holds that run across planned cuts: the plan changes picture, the rendered picture does not
  const covered = (a, b) => planned.filter((p) => Math.min(b, p.endSec) - Math.max(a, p.startSec) >= Math.min(1, (p.endSec - p.startSec) * 0.5))
  const crossScene = (held?.holds || [])
    .filter((h) => !h.titleOrEnd)
    .map((h) => ({ h, shots: covered(h.startSec, h.endSec) }))
    .filter((x) => x.shots.length >= 2)
    .map(({ h, shots }) => ({ startSec: h.startSec, endSec: h.endSec, durationSec: h.durationSec, sceneIds: shots.map((p) => p.id) }))
  const pictures = Number(held?.pictureCount) || 0
  const total = Number(totalSec) || 0
  const severity = beat && (longPlanned.length || crossScene.length) ? 'warning' : 'pass'
  return {
    severity,
    plannedCount: planned.length,
    plannedAvgSec: judgedPlanned.length ? round3(judgedPlanned.reduce((a, p) => a + p.durationSec, 0) / judgedPlanned.length) : null,
    plannedLongest: longest ? { id: longest.id, durationSec: longest.durationSec } : null,
    longPlannedScenes: longPlanned.map((p) => ({ id: p.id, durationSec: p.durationSec, startSec: p.startSec, endSec: p.endSec })),
    crossSceneHolds: crossScene,
    measuredPictureCount: pictures,
    measuredAvgPictureSec: pictures > 0 && total > 0 ? round3(total / pictures) : null,
    limitSec: beat ? o.beatHoldFailSec : null,
  }
}

/** The QA check row for the shot rhythm. */
export function buildShotRhythmCheck(rhythm, { beat = false } = {}) {
  if (!rhythm) return null
  const parts = []
  if (rhythm.plannedCount) {
    parts.push(`规划 ${rhythm.plannedCount} 个镜头，平均 ${secTxt(rhythm.plannedAvgSec || 0)}${rhythm.plannedLongest ? `、最长 ${secTxt(rhythm.plannedLongest.durationSec)}（${rhythm.plannedLongest.id}）` : ''}`)
  }
  if (rhythm.measuredPictureCount) parts.push(`成片实测换了 ${Math.max(0, rhythm.measuredPictureCount - 1)} 次画面，平均 ${secTxt(rhythm.measuredAvgPictureSec || 0)} 一个画面`)
  const issues = []
  if (rhythm.longPlannedScenes.length) {
    issues.push(`${rhythm.longPlannedScenes.length} 个镜头规划时长超过 ${rhythm.limitSec} 秒（${idsTxt(rhythm.longPlannedScenes.map((p) => `${p.id} ${secTxt(p.durationSec)}`), 4)}），卡点片建议每镜 1–3 秒`)
  }
  if (rhythm.crossSceneHolds.length) {
    const h = rhythm.crossSceneHolds
    issues.push(`${h.length} 处切镜后画面几乎没变（${h.slice(0, 3).map((x) => `${clock(x.startSec)}–${clock(x.endSec)} ${idsTxt(x.sceneIds, 4)}`).join('；')}${h.length > 3 ? ' 等' : ''}），观众看不出换了镜头`)
  }
  const value = `${rhythm.severity === 'warning' ? '⚠ ' : ''}${parts.join('；') || '无分镜时间轴'}${issues.length ? `。${issues.join('；')}` : ''}`
  const details = [
    ...rhythm.longPlannedScenes.map((p) => `${p.id}：${clock(p.startSec)}–${clock(p.endSec)} 规划 ${secTxt(p.durationSec)}${beat ? '（超过卡点片单镜上限）' : ''}`),
    ...rhythm.crossSceneHolds.map((x) => `${clock(x.startSec)}–${clock(x.endSec)}：${x.sceneIds.join('、')} 画面基本一样`),
  ]
  return { name: '镜头时长与换画面节奏', passed: true, severity: rhythm.severity, value, details }
}
