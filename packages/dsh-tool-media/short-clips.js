/**
 * @dsh-video/tool-media — 长视频拆条: a long recording of the user's own (interview, podcast, live stream, lesson, talk)
 * turned into stand-alone short clips for 抖音 / 视频号 / 小红书 / 快手 / B站.
 *
 *   findShortClips    local speech recognition (cached) → sentences → the configured model (or the current agent) picks
 *                     the clips, code checks every pick (clip-factory.js) → saved plan <stem>.clips.json
 *   updateShortClips  the user's edits: titles, on / off, one sentence earlier / later at either end
 *   renderShortClips  per clip: the rough-cut rules inside the clip (pauses, fillers, stutters, retakes), layout for the
 *                     platform, title + captions (keyword highlight) + progress line, −14 LUFS (clip-render.js) →
 *                     output/clips/<name>/NN-标题.mp4 / .jpg / .srt + clips.json + 发布文案.md
 *
 * One model call per ~60 minutes of speech (20 minutes for a local model); rendering is local and free. Nothing is
 * downloaded or uploaded: only recordings already in the project library are used.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { createAbortError } from '../shared/index.js'
import { readAssets } from './asset-manager.js'
import { resolveLlmConfig } from './llm-client.js'
import { buildCaptions, captionsToSrt, chooseProjectFps, hashTranscript, planRoughCut, probeCutSource, ROUGH_CUT_DEFAULTS } from './rough-cut.js'
import { getAsrStatus, readCachedTranscript, transcribeMedia } from './speech-recognition.js'
import { extractKeywords } from './talk-pack.js'
import { buildClipRows, CLIP_DEFAULTS, CLIP_PLATFORMS, clipProfile, estimateFinderWork, findClips, isLocalModelConfig, nudgeClipRows, planClipCut } from './clip-factory.js'
import { canvasFor, chooseLayout, CLIP_ENCODE_VERSION, CLIP_LAYOUTS, detectBurnedSubtitles, layoutGeometry, renderClip } from './clip-render.js'

export const SHORT_CLIPS_DEFAULTS = Object.freeze({
  platform: CLIP_DEFAULTS.platform,
  count: 0,
  focus: '',
  layout: 'auto',
  captions: 'auto', // auto = off when the recording already has captions burned in
  title: true,
  progressBar: true,
  accent: '#FFD400',
  language: 'auto',
})

const r3 = (x) => Math.round(Number(x) * 1000) / 1000
const toRel = (projectDir, abs) => relative(resolve(projectDir), abs).replace(/\\/g, '/')
const absIn = (projectDir, p) => (isAbsolute(p) ? p : resolve(projectDir, p))
const readJsonSafe = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}
const fmtClock = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
const fmtLen = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return s >= 60 ? `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒` : `${s} 秒`
}

/** A file name from a clip title (Windows-safe, no leading dots, ≤ 28 characters). */
export function safeClipFileName(title, index) {
  const t = Array.from(
    String(title || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^[.\s]+|[.\s]+$/g, ''),
  )
    .slice(0, 28)
    .join('')
    .trim()
  return `${String(index).padStart(2, '0')}-${t || '片段'}`
}

/** Recordings in the library that can be cut into clips: videos / audio with sound, longest first. */
export function listClipSources(projectDir) {
  let items = []
  try {
    items = readAssets(projectDir).items || []
  } catch {}
  return items
    .filter((it) => (it.type === 'video' || it.type === 'audio') && it.hasAudio !== false && !['music', 'sfx', 'voice_clone', 'avatar_base'].includes(it.role))
    .sort((a, b) => (Number(b.durationSec) || 0) - (Number(a.durationSec) || 0))
    .map((it) => ({ id: it.id, name: it.originalName || it.name || basename(String(it.path || '')), path: it.path, type: it.type, role: it.role || '', durationSec: Number(it.durationSec) || 0, width: Number(it.width) || 0, height: Number(it.height) || 0 }))
}

/** The recording to cut: an asset id / project path, else the longest recording with sound. */
export function pickClipSource(projectDir, wanted = '') {
  const absDir = resolve(projectDir)
  const list = listClipSources(absDir)
  if (wanted) {
    const byId = list.find((it) => it.id === wanted)
    if (byId) return { abs: absIn(absDir, byId.path), asset: byId }
    const abs = absIn(absDir, wanted)
    const rel = relative(absDir, abs)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('只能处理工程素材库里的文件')
    return { abs, asset: list.find((it) => resolve(absIn(absDir, it.path)) === resolve(abs)) || null }
  }
  return list[0] ? { abs: absIn(absDir, list[0].path), asset: list[0] } : null
}

/** Where the plan and the clips of one recording live. */
export function clipFilesFor(projectDir, sourceAbs) {
  const absDir = resolve(projectDir)
  const hash = createHash('sha1').update(resolve(sourceAbs).toLowerCase()).digest('hex')
  const base =
    basename(sourceAbs)
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w一-鿿.-]+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, 40) || 'clips'
  const outDir = join(absDir, 'output', 'clips', `${base}-${hash.slice(0, 6)}`)
  return { plan: join(absDir, 'assets', 'edited', `clips-${hash.slice(0, 8)}.clips.json`), outDir }
}

/** Only known rough-cut switches pass (the clip is cleaned with the same rules as 口播粗剪). */
export function cleanCutOptions(o = {}) {
  const out = {}
  for (const k of ['cutPauses', 'cutFillers', 'cutStutters', 'cutRetakes', 'cutNoise']) if (typeof o?.[k] === 'boolean') out[k] = o[k]
  for (const [k, lo, hi] of [['maxPauseSec', 0.25, 3], ['keepPauseSec', 0.05, 1.5]]) {
    const v = Number(o?.[k])
    if (o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== '' && Number.isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v))
  }
  return out
}

/** Only known render settings pass. */
export function cleanRenderSettings(s = {}) {
  const out = {}
  if (CLIP_LAYOUTS.includes(s?.layout)) out.layout = s.layout
  if (['auto', 'on', 'off'].includes(s?.captions)) out.captions = s.captions
  if (typeof s?.title === 'boolean') out.title = s.title
  if (typeof s?.progressBar === 'boolean') out.progressBar = s.progressBar
  if (typeof s?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(s.accent)) out.accent = s.accent.toUpperCase()
  return out
}

/** Recognition (cached) + the sentence rows of a recording. `transcribe: false` uses only a cached transcript. */
async function prepareSource({ projectDir, sourcePath = '', language = 'auto', cut = {}, transcribe = true, force = false, signal, onChild, onProgress }) {
  const absDir = resolve(projectDir)
  const src = pickClipSource(absDir, sourcePath)
  if (!src || !existsSync(src.abs)) throw new Error(sourcePath ? `找不到要拆条的视频：${sourcePath}` : '素材库里还没有带声音的长视频，请先在「素材」里上传（访谈、播客、直播回放、课程录像都可以）。')
  const probe = await probeCutSource(src.abs)
  if (!probe.hasAudio) throw new Error('这个视频没有声音：拆条要靠说话内容来挑片段。')
  let transcript = null
  if (transcribe) {
    transcript = await transcribeMedia({ mediaPath: src.abs, projectDir: absDir, language, force, signal, onChild, onProgress })
  } else {
    transcript = readCachedTranscript(src.abs, absDir)
    if (!transcript) throw new Error('这个视频的识别结果不在了（文件可能被改动过），请重新「找精彩片段」。')
  }
  if (signal?.aborted) throw createAbortError()
  const fps = probe.hasVideo ? chooseProjectFps(probe.fps) : 30
  const options = { ...ROUGH_CUT_DEFAULTS, ...cleanCutOptions(cut), fps, offsetSec: probe.audioOffsetSec, sourceDurationSec: probe.durationSec || transcript.durationSec }
  const base = planRoughCut(transcript, options)
  const rows = buildClipRows(base.words)
  return { absDir, src, probe, transcript, fps, options, rows, totalSec: Number(probe.durationSec) || Number(transcript.durationSec) || 0 }
}

const clipView = (c) => ({
  index: c.index,
  title: c.title,
  reason: c.reason || '',
  score: c.score,
  tags: c.tags || [],
  selectedBy: c.selectedBy || '',
  enabled: c.enabled !== false,
  startRow: c.startRow,
  endRow: c.endRow,
  firstWord: c.firstWord,
  lastWord: c.lastWord,
  sourceStart: r3(c.sourceStart),
  sourceEnd: r3(c.sourceEnd),
  spanSec: r3(c.spanSec),
  text: Array.from(String(c.text || '')).slice(0, 400).join(''),
  edited: Boolean(c.edited),
})

/** The saved plan of a recording (or null). */
export function readClipPlan(projectDir, sourceAbs) {
  const doc = readJsonSafe(clipFilesFor(projectDir, sourceAbs).plan)
  return doc && doc.version === 1 && Array.isArray(doc.clips) ? doc : null
}

function writeClipPlan(projectDir, sourceAbs, doc) {
  const p = clipFilesFor(projectDir, sourceAbs).plan
  mkdirSync(join(p, '..'), { recursive: true })
  // write then rename: an interrupted save never leaves a half plan behind
  const tmp = `${p}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ ...doc, updatedAt: new Date().toISOString() })}\n`, 'utf8')
  renameSync(tmp, p)
}

/**
 * Find the clips of a recording. Options: platform (douyin / shipinhao / xiaohongshu / kuaishou / bilibili / original),
 * count (0 = automatic), focus (what the user wants, optional), cut (rough-cut switches), language.
 */
export async function findShortClips({ projectDir, sourcePath = '', platform = SHORT_CLIPS_DEFAULTS.platform, count = 0, focus = '', cut = {}, language = 'auto', force = false, signal, onChild, onProgress, onWait, callModel } = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  const report = (pct, message) => onProgress?.({ progress: Math.round(pct), message })
  const prep = await prepareSource({ projectDir, sourcePath, language, cut, force, signal, onChild, onProgress: (p) => report(Math.min(45, (Number(p.progress) || 0) * 0.45), p.message || '正在识别说话内容…') })
  const { absDir, src, probe, transcript, rows, totalSec } = prep
  if (rows.length < 3) throw new Error('这段视频里能识别出的说话内容太少，拆不出片段（至少要有几句完整的话）。')
  const plat = CLIP_PLATFORMS[platform] ? platform : SHORT_CLIPS_DEFAULTS.platform
  const profile = clipProfile({ totalSec, platform: plat, count })
  let local = false
  try {
    local = isLocalModelConfig(resolveLlmConfig())
  } catch {}
  report(48, '正在请 AI 挑精彩片段…')
  const res = await findClips({
    rows,
    profile,
    focus: String(focus || '').slice(0, 300),
    local,
    callModel,
    signal,
    onWait,
    onProgress: (p) => report(48 + (Math.max(0, p.window - 1) / Math.max(1, p.windows)) * 45, p.message),
  })
  const prev = readClipPlan(absDir, src.abs)
  const doc = {
    version: 1,
    source: { path: toRel(absDir, src.abs), name: src.asset?.name || basename(src.abs), assetId: src.asset?.id || '', durationSec: r3(totalSec), width: probe.width, height: probe.height, hasVideo: probe.hasVideo },
    transcriptHash: hashTranscript(transcript),
    language: transcript.language || '',
    platform: plat,
    count: profile.exactCount,
    focus: String(focus || '').slice(0, 300),
    cut: cleanCutOptions(cut),
    profile,
    render: { ...SHORT_CLIPS_DEFAULTS, ...cleanRenderSettings(prev?.render || {}) },
    clips: res.clips.map((c) => ({ ...clipView(c), enabled: true })),
    found: { candidates: res.candidates, windows: res.windows, failedWindows: res.failedWindows, local, rows: rows.length, dropped: res.report?.dropped || [] },
    rendered: {},
    burned: prev?.transcriptHash === hashTranscript(transcript) ? prev?.burned || null : null,
    createdAt: new Date().toISOString(),
  }
  writeClipPlan(absDir, src.abs, doc)
  report(100, `找到 ${doc.clips.length} 个精彩片段`)
  return { ok: true, plan: doc, source: { abs: src.abs, rel: doc.source.path } }
}

/**
 * Edits from the panel / agent: [{ index, title?, enabled?, startDelta?, endDelta? }] (deltas in whole sentences).
 * Returns the updated plan.
 */
export async function updateShortClips({ projectDir, sourcePath = '', edits = [], render = undefined } = {}) {
  const absDir = resolve(projectDir)
  const src = pickClipSource(absDir, sourcePath)
  if (!src) throw new Error('找不到这个视频')
  const doc = readClipPlan(absDir, src.abs)
  if (!doc) throw new Error('这个视频还没有拆条结果，请先「找精彩片段」。')
  const needRows = (Array.isArray(edits) ? edits : []).some((e) => Number(e?.startDelta) || Number(e?.endDelta))
  let rows = null
  if (needRows) {
    const prep = await prepareSource({ projectDir: absDir, sourcePath: doc.source.path, cut: doc.cut || {}, transcribe: false })
    if (hashTranscript(prep.transcript) !== doc.transcriptHash) throw new Error('这个视频的识别结果变了，请重新「找精彩片段」。')
    rows = prep.rows
  }
  for (const e of Array.isArray(edits) ? edits.slice(0, 200) : []) {
    const k = doc.clips.findIndex((c) => c.index === Number(e?.index))
    if (k < 0) continue
    let c = { ...doc.clips[k] }
    if (typeof e.title === 'string' && e.title.trim()) c.title = Array.from(e.title.replace(/[\r\n]+/g, ' ').trim()).slice(0, 30).join('')
    if (typeof e.enabled === 'boolean') c.enabled = e.enabled
    if (rows && (Number(e.startDelta) || Number(e.endDelta))) {
      // the clip's sentences in the current rows (rows are rebuilt from the cached transcript)
      const sr = rows.findIndex((r) => r.lastWord >= c.firstWord)
      let er = -1
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].firstWord <= c.lastWord) {
          er = i
          break
        }
      }
      if (sr >= 0 && er >= sr) c = { ...c, ...clipView({ ...c, ...nudgeClipRows({ ...c, startRow: sr, endRow: er }, rows, { startDelta: e.startDelta, endDelta: e.endDelta }) }) }
    }
    c.edited = true
    doc.clips[k] = c
  }
  if (render && typeof render === 'object') doc.render = { ...SHORT_CLIPS_DEFAULTS, ...doc.render, ...cleanRenderSettings(render) }
  writeClipPlan(absDir, src.abs, doc)
  return { ok: true, plan: doc }
}

/** Times (source seconds) for the burned-caption check: 12 sentences spread over the recording. */
function subtitleSampleTimes(rows) {
  if (rows.length < 3) return []
  const n = Math.min(12, rows.length)
  const out = []
  for (let k = 0; k < n; k++) {
    const r = rows[Math.floor(((k + 0.5) * rows.length) / n)]
    out.push((r.start + r.end) / 2)
  }
  return out
}

const keyOf = (obj) => createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 16)

/** The publishing notes for every rendered clip. */
export function buildPublishNotes(doc, items) {
  const plat = CLIP_PLATFORMS[doc.platform] || CLIP_PLATFORMS.douyin
  const lines = [
    `# 拆条发布文案 · ${doc.source?.name || ''}`,
    '',
    `平台：${plat.label}（${plat.aspect === 'source' ? '原画幅' : plat.aspect}）· 共 ${items.length} 条 · ${new Date().toISOString().slice(0, 10)}`,
    '',
    '> 片段由 AI 按说话内容挑选并自动剪辑，字幕来自本地语音识别。发布前请看一遍：字幕有没有错字、标题是否符合原意。',
    '',
  ]
  for (const it of items) {
    const tags = (it.tags || []).map((t) => `#${t}`).join(' ')
    lines.push(`## ${String(it.index).padStart(2, '0')} · ${it.title}`, '')
    lines.push(`- 文件：${it.file}（${fmtLen(it.durationSec)}${it.cover ? `，封面 ${it.cover}` : ''}）`)
    lines.push(`- 原视频位置：${fmtClock(it.sourceStart)} – ${fmtClock(it.sourceEnd)}`)
    lines.push(`- 标题：${it.title}`)
    if (it.reason) lines.push(`- 简介：${it.reason}`)
    if (tags) lines.push(`- 话题：${tags}`)
    lines.push('')
  }
  return `${lines.join('\n').trim()}\n`
}

/**
 * Render clips of the saved plan: `indexes` (default every enabled clip), `settings` (layout, captions, title,
 * progressBar, accent; saved for next time). Clips whose cut and look did not change are not rendered again.
 */
export async function renderShortClips({ projectDir, sourcePath = '', indexes = null, settings = undefined, force = false, signal, onChild, onProgress } = {}) {
  const absDir = resolve(projectDir)
  const src = pickClipSource(absDir, sourcePath)
  if (!src) throw new Error('找不到这个视频')
  const doc = readClipPlan(absDir, src.abs)
  if (!doc) throw new Error('这个视频还没有拆条结果，请先「找精彩片段」。')
  if (settings && typeof settings === 'object') doc.render = { ...SHORT_CLIPS_DEFAULTS, ...doc.render, ...cleanRenderSettings(settings) }
  const rs = { ...SHORT_CLIPS_DEFAULTS, ...doc.render }
  const wanted = Array.isArray(indexes) && indexes.length ? new Set(indexes.map(Number)) : null
  const todo = doc.clips.filter((c) => (wanted ? wanted.has(c.index) : c.enabled !== false))
  if (!todo.length) throw new Error('没有要出片的片段（全部被关掉了？）')
  const report = (pct, message) => onProgress?.({ progress: Math.round(pct), message })
  report(2, '正在准备…')
  const prep = await prepareSource({ projectDir: absDir, sourcePath: doc.source.path, cut: doc.cut || {}, transcribe: false })
  if (hashTranscript(prep.transcript) !== doc.transcriptHash) throw new Error('这个视频的识别结果变了，请重新「找精彩片段」。')
  const { probe, transcript, fps, rows } = prep
  const files = clipFilesFor(absDir, src.abs)
  mkdirSync(files.outDir, { recursive: true })
  // captions already burned into the picture? (checked once per recording)
  if (!doc.burned && probe.hasVideo) {
    report(4, '正在检查原视频里有没有字幕…')
    try {
      doc.burned = await detectBurnedSubtitles({ sourcePath: src.abs, times: subtitleSampleTimes(rows), signal, onChild })
    } catch (err) {
      if (signal?.aborted) throw createAbortError()
      doc.burned = { burned: false, error: String(err?.message || err).slice(0, 200) }
    }
  }
  const burned = Boolean(doc.burned?.burned)
  const showCaptions = rs.captions === 'on' || (rs.captions === 'auto' && !burned)
  // cropping would cut burned captions apart: the whole picture instead
  const layoutWanted = burned && rs.layout === 'crop' ? 'fit' : rs.layout
  const aspect = (CLIP_PLATFORMS[doc.platform] || CLIP_PLATFORMS.douyin).aspect
  const canvas = canvasFor(aspect, probe)
  const layout = chooseLayout(layoutWanted, { canvas, source: { w: probe.width, h: probe.height }, hasVideo: probe.hasVideo })
  const geom = layoutGeometry(layout, canvas, { w: probe.width, h: probe.height })
  const st = statSync(src.abs)
  const results = []
  doc.rendered = doc.rendered && typeof doc.rendered === 'object' ? doc.rendered : {}
  for (let k = 0; k < todo.length; k++) {
    if (signal?.aborted) throw createAbortError()
    const clip = todo[k]
    const span = [8 + (k / todo.length) * 88, 8 + ((k + 1) / todo.length) * 88]
    const { plan, captions, durationSec } = planClipCut(transcript, clip, { options: doc.cut || {}, fps, sourceDurationSec: prep.options.sourceDurationSec, offsetSec: probe.audioOffsetSec, maxLineWidth: geom.caption.maxLineWidth })
    if (!plan.keep.length) {
      results.push({ index: clip.index, title: clip.title, error: '这一段没有可保留的内容' })
      continue
    }
    const keywords = showCaptions ? extractKeywords(captions, { totalSec: durationSec }) : []
    const name = safeClipFileName(clip.title, clip.index)
    const out = { video: join(files.outDir, `${name}.mp4`), cover: join(files.outDir, `${name}.jpg`), srt: join(files.outDir, `${name}.srt`) }
    const renderKey = keyOf({ keep: plan.keep, fps, layout, aspect, showCaptions, title: rs.title ? clip.title : '', bar: rs.progressBar, accent: rs.accent, caps: showCaptions ? captions.map((c) => [c.text, c.startSec, c.endSec]) : 0, kw: keywords.map((x) => x.text), size: st.size, mtime: Math.round(st.mtimeMs), v: CLIP_ENCODE_VERSION })
    const prev = doc.rendered[clip.index]
    // files of an earlier render under another name (the title changed) are replaced
    if (prev && prev.video && prev.video !== toRel(absDir, out.video)) {
      for (const rel of [prev.video, prev.cover, prev.srt]) {
        if (!rel) continue
        const abs = absIn(absDir, rel)
        const inside = relative(files.outDir, abs)
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) continue
        try {
          rmSync(abs, { force: true })
        } catch {}
      }
    }
    let r = null
    if (!force && prev?.key === renderKey && existsSync(out.video)) {
      r = { video: out.video, cover: existsSync(out.cover) ? out.cover : '', durationSec: prev.durationSec, layout: prev.layout, canvas: prev.canvas, loudness: prev.loudness, reused: true }
      report(span[1], `第 ${k + 1}/${todo.length} 条没有变化，沿用上次的成片`)
    } else {
      report(span[0], `正在出第 ${k + 1}/${todo.length} 条：${clip.title}`)
      r = await renderClip({
        sourcePath: src.abs,
        probe,
        keep: plan.keep,
        fps,
        captions: showCaptions ? captions : [],
        keywords,
        title: clip.title,
        aspect,
        layout: layoutWanted,
        showTitle: rs.title,
        showCaptions,
        showBar: rs.progressBar,
        accent: rs.accent,
        outVideo: out.video,
        outCover: out.cover,
        signal,
        onChild,
        onProgress: (p) => report(span[0] + ((span[1] - span[0]) * (Number(p.progress) || 0)) / 100, `第 ${k + 1}/${todo.length} 条 · ${p.message || ''}`),
      })
    }
    writeFileSync(out.srt, captionsToSrt(captions), 'utf8')
    doc.rendered[clip.index] = { key: renderKey, video: toRel(absDir, out.video), cover: r.cover ? toRel(absDir, r.cover) : '', srt: toRel(absDir, out.srt), durationSec: r.durationSec, layout: r.layout, canvas: r.canvas, loudness: r.loudness, renderedAt: r.reused ? prev?.renderedAt || '' : new Date().toISOString() }
    results.push({ index: clip.index, title: clip.title, reason: clip.reason, tags: clip.tags, sourceStart: clip.sourceStart, sourceEnd: clip.sourceEnd, ...doc.rendered[clip.index], file: basename(out.video), coverFile: r.cover ? basename(r.cover) : '', reused: Boolean(r.reused), captions: captions.length })
  }
  // summary files for every clip rendered so far (not only this run)
  const all = doc.clips
    .filter((c) => doc.rendered[c.index] && existsSync(absIn(absDir, doc.rendered[c.index].video)))
    .map((c) => ({ index: c.index, title: c.title, reason: c.reason, tags: c.tags, sourceStart: c.sourceStart, sourceEnd: c.sourceEnd, durationSec: doc.rendered[c.index].durationSec, file: basename(doc.rendered[c.index].video), cover: doc.rendered[c.index].cover ? basename(doc.rendered[c.index].cover) : '', score: c.score }))
  writeFileSync(join(files.outDir, 'clips.json'), `${JSON.stringify({ source: doc.source.name, platform: doc.platform, layout, captions: showCaptions, clips: all }, null, 2)}\n`, 'utf8')
  writeFileSync(join(files.outDir, '发布文案.md'), buildPublishNotes(doc, all.map((c) => ({ ...c, cover: c.cover }))), 'utf8')
  doc.lastRender = { at: new Date().toISOString(), layout, aspect, captions: showCaptions, burned, folder: toRel(absDir, files.outDir) }
  writeClipPlan(absDir, src.abs, doc)
  const okCount = results.filter((x) => !x.error).length
  report(100, `出好了 ${okCount} 条短视频`)
  return { ok: true, folder: toRel(absDir, files.outDir), layout, captions: showCaptions, burned, clips: results, plan: doc }
}

/**
 * Show the clips folder of a recording in Explorer / Finder (only folders under <project>/output/clips; elsewhere the
 * path is returned). `DSH_CLIPS_REVEAL=0` never launches anything (tests).
 */
export function revealClipsFolder(projectDir, { sourcePath = '', launch = process.env.DSH_CLIPS_REVEAL !== '0' } = {}) {
  const absDir = resolve(projectDir)
  const src = pickClipSource(absDir, sourcePath)
  if (!src) throw new Error('找不到这个视频')
  const { outDir } = clipFilesFor(absDir, src.abs)
  const root = join(absDir, 'output', 'clips')
  const inside = relative(root, outDir)
  if (!inside || inside.startsWith('..') || isAbsolute(inside) || outDir.includes('"')) throw new Error('拆条文件夹路径无效')
  if (!existsSync(outDir)) throw new Error('这个视频还没有出过片，出片后才有文件夹。')
  let opened = false
  if (launch) {
    try {
      let child = null
      if (process.platform === 'win32') child = spawn('explorer.exe', [outDir], { detached: true, stdio: 'ignore', windowsHide: false })
      else if (process.platform === 'darwin') child = spawn('open', [outDir], { detached: true, stdio: 'ignore' })
      if (child) {
        child.on('error', () => {})
        child.unref()
        opened = true
      }
    } catch {}
  }
  return { ok: true, opened, folder: toRel(absDir, outDir) }
}

/** Panel state: recordings, the engine, the chosen recording's plan and rendered clips, what finding would cost. */
export async function readShortClipsState(projectDir, { sourcePath = '' } = {}) {
  const absDir = resolve(projectDir)
  const engine = await getAsrStatus()
  const sources = listClipSources(absDir)
  let src = null
  try {
    src = pickClipSource(absDir, sourcePath)
  } catch {}
  const doc = src ? readClipPlan(absDir, src.abs) : null
  let estimate = null
  if (src && existsSync(src.abs)) {
    const t = readCachedTranscript(src.abs, absDir)
    if (t) {
      try {
        const base = planRoughCut(t, { ...ROUGH_CUT_DEFAULTS, fps: 30 })
        const rows = buildClipRows(base.words)
        let local = false
        try {
          local = isLocalModelConfig(resolveLlmConfig())
        } catch {}
        const plat = doc?.platform || SHORT_CLIPS_DEFAULTS.platform
        const w = estimateFinderWork(rows, clipProfile({ totalSec: Number(t.durationSec) || 0, platform: plat }), { local })
        estimate = { transcribed: true, rows: rows.length, ...w, local }
      } catch {}
    } else estimate = { transcribed: false }
  }
  let llm = null
  try {
    const cfg = resolveLlmConfig()
    llm = { mode: cfg.mode === 'host-agent' ? 'host-agent' : 'api', configured: cfg.mode === 'host-agent' || Boolean(cfg.baseUrl && cfg.model), local: isLocalModelConfig(cfg), model: cfg.mode === 'host-agent' ? '' : String(cfg.model || '') }
  } catch {}
  const rendered = doc
    ? doc.clips
        .filter((c) => doc.rendered?.[c.index] && existsSync(absIn(absDir, doc.rendered[c.index].video)))
        .map((c) => ({ index: c.index, ...doc.rendered[c.index], current: true }))
    : []
  return {
    ok: true,
    engine: { ready: engine.ready, reason: engine.reason, missing: engine.missing, supportedPlatform: engine.supportedPlatform },
    llm,
    sources,
    source: src ? { path: toRel(absDir, src.abs), assetId: src.asset?.id || '', name: src.asset?.name || basename(src.abs), durationSec: src.asset?.durationSec || 0 } : null,
    plan: doc,
    rendered,
    estimate,
    platforms: Object.values(CLIP_PLATFORMS).map((p) => ({ value: p.id, label: p.label, aspect: p.aspect, minSec: p.minSec, maxSec: p.maxSec, targetLo: p.targetLo, targetHi: p.targetHi })),
    defaults: SHORT_CLIPS_DEFAULTS,
  }
}
