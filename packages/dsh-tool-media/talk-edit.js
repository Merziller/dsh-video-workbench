/**
 * @dsh-video/tool-media — 口播剪辑 (talk-edit): a real person talking to camera, edited by the computer.
 *
 * runTalkRoughCut      transcribe (local ASR, cached) → plan the rough cut → render roughcut.mp4 / .wav / .srt / .json
 * buildTalkEditProject roughcut → scenes at sentence boundaries (frame grid, whole milliseconds) → the host's own voice
 *                      sliced per scene (voiceLeadSec 0, sample-exact, seamless) → real captions with per-word timing →
 *                      script.json (productionType 'talk-edit', engine remotion) + the Remotion project (presenter layer)
 * executeTalkEditRunner the Task Center pipeline for productionType 'talk-edit' (same five agent cards as an AI film;
 *                      no AI script, no TTS — the person's own words and voice are the film)
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import {
  buildGlobalSubtitleTrack,
  createAbortError,
  readScriptJson,
  REPO_ROOT,
  resolveBinaries,
  runCommandRedirected,
  subtitleLineWidthFor,
  writeScriptJson,
} from '../shared/index.js'
import { readAssets, updateAsset } from './asset-manager.js'
import { safeProjectSnapshot } from './project-history.js'
import { writeRemotionProjectFiles } from './remotion-generator.js'
import { buildRichHtmlVideo } from './html-generator.js'
import {
  buildCaptions,
  captionsToSrt,
  chooseProjectFps,
  hashTranscript,
  joinWordTexts,
  keepFrames,
  planRoughCut,
  planTexts,
  probeCutSource,
  REMOVAL_KINDS,
  renderRoughCut,
  ROUGH_CUT_DEFAULTS,
  ROUGH_CUT_ENCODE_VERSION,
} from './rough-cut.js'
import { getAsrStatus, transcribeMedia } from './speech-recognition.js'
import { indexFootage } from './footage-index.js'
import { cleanMascotSetting, detectChapters, extractKeywords, planBroll, resolveTalkPack, storedMascotSetting, TALK_PACK_PRESETS } from './talk-pack.js'
import { planMascot } from './talk-mascot.js'

/** Roles that are never B-roll for a talk (the talking head itself, avatar bases, audio). */
const NOT_BROLL_ROLES = new Set(['host_video', 'avatar_base', 'voice_clone', 'music', 'sfx'])

/** Only known packaging settings pass (from the panel / MCP); values are validated again by resolveTalkPack. */
export function cleanTalkPackSettings(p) {
  if (!p || typeof p !== 'object') return undefined
  const out = {}
  for (const k of ['keywords', 'chapters', 'progressBar', 'broll', 'sfx', 'captions', 'screen']) if (typeof p[k] === 'boolean') out[k] = p[k]
  if (typeof p.preset === 'string') out.preset = p.preset.slice(0, 24)
  if (p.lowerThird === null) out.lowerThird = null
  else if (p.lowerThird && typeof p.lowerThird === 'object') out.lowerThird = { name: String(p.lowerThird.name || '').slice(0, 20), title: String(p.lowerThird.title || '').slice(0, 30) }
  if (p.mascot === null) out.mascot = null
  else if (p.mascot && typeof p.mascot === 'object') out.mascot = cleanMascotSetting(p.mascot)
  return out
}

/** The packaging settings as stored on the project (script.talkEdit.pack). */
function storedPackSettings(s) {
  return {
    preset: s.preset,
    keywords: Boolean(s.keywords),
    chapters: Boolean(s.chapters),
    progressBar: Boolean(s.progressBar),
    broll: Boolean(s.broll),
    sfx: s.sfx !== false,
    lowerThird: s.lowerThird,
    captions: s.captions !== false,
    mascot: storedMascotSetting(s.mascot),
    screen: Boolean(s.screen),
  }
}

/**
 * 口播包装 for a cut: keyword pops, chapters, progress bar, B-roll matched to what is said (library videos are shot-
 * indexed first when needed, locally) and the lower third. Returns { settings, pack } (pack null when all is off).
 */
export async function planTalkPack({ absDir, captions, totalSec, sourceAssetId = '', settings = {}, indexLibrary = true, wavAbs = '', fps = 30, signal, onChild, onProgress } = {}) {
  const s = resolveTalkPack(settings)
  const any = s.keywords || s.chapters || s.progressBar || s.broll || s.lowerThird || s.mascot || s.captions === false
  if (!any) return { settings: s, pack: null }
  // 卡通讲解员: the character picture / loop, cut out, plus its motion track from this cut's voice
  let mascot = null
  if (s.mascot) {
    try {
      mascot = await planMascot({ projectDir: absDir, manifest: readAssets(absDir), setting: s.mascot, captions, wavAbs, totalSec, fps, signal, onChild, onProgress })
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      onProgress?.({ message: `卡通讲解员没有加上：${String(err?.message || err).slice(0, 120)}` })
    }
  }
  let broll = []
  if (s.broll) {
    // the character itself is never used as B-roll
    const libraryOf = (m) => (m.items || []).filter((it) => (it.type === 'video' || it.type === 'image') && it.id !== sourceAssetId && it.id !== s.mascot?.assetId && !NOT_BROLL_ROLES.has(it.role))
    let manifest = readAssets(absDir)
    const unindexed = libraryOf(manifest).filter((it) => it.type === 'video' && !(it.footage?.shots || []).length)
    if (indexLibrary && unindexed.length) {
      onProgress?.({ message: `正在分析 ${unindexed.length} 段空镜素材的镜头（本地，不花钱）...` })
      try {
        await indexFootage({ projectDir: absDir, assetIds: unindexed.map((x) => x.id), transcribe: 'off', signal, onChild })
        manifest = readAssets(absDir)
      } catch (err) {
        if (err?.name === 'AbortError') throw err
      }
    }
    broll = planBroll(captions, libraryOf(manifest), { totalSec })
  }
  const pack = {
    preset: s.preset,
    theme: s.theme,
    keywords: s.keywords ? extractKeywords(captions, { totalSec }) : [],
    chapters: s.chapters ? detectChapters(captions) : [],
    broll,
    progressBar: Boolean(s.progressBar),
    lowerThird: s.lowerThird,
    totalSec: r3(totalSec),
    captions: s.captions !== false,
    ...(mascot ? { mascot } : {}),
    ...(s.screen ? { screen: true } : {}),
  }
  return { settings: s, pack }
}

/**
 * Write the project's code from its script: the Remotion project (the talk kit, no AI scene registry) and the HTML
 * draft the studio previews (so the scene editor shows the cut, its packaging and the cartoon host right away).
 */
export function writeTalkProjectCode(projectDir, script) {
  const absDir = resolve(projectDir)
  const data = script || readScriptJson(absDir).data
  writeRemotionProjectFiles(absDir, data, { useCustomSceneRegistry: false })
  try {
    writeFileSync(join(absDir, 'index.html'), buildRichHtmlVideo(data), 'utf8')
  } catch {}
}

/** 录屏讲解: no punch-in at the jump cuts (the zoom would crop the interface); a face recording keeps it. */
function applyScreenSetting(scenes, screen) {
  for (const sc of scenes || []) {
    if (!sc?.presenter) continue
    if (screen) sc.presenter.jumpZoom = false
    else delete sc.presenter.jumpZoom
  }
}

/**
 * Save the 口播包装 settings on the project (used by the next build / one-click run). When the project already is a
 * built 口播剪辑, the packaging on its timeline is re-planned right away (no re-cut, no re-render of the recording).
 */
export async function saveTalkPackSettings(projectDir, pack, { signal, onChild, onProgress } = {}) {
  const absDir = resolve(projectDir)
  const { data } = readScriptJson(absDir)
  const clean = cleanTalkPackSettings(pack) || {}
  const settings = resolveTalkPack({ ...(data.talkEdit?.pack || {}), ...clean })
  const saved = storedPackSettings(settings)
  data.talkEdit = { ...(data.talkEdit || {}), pack: saved }
  let applied = false
  if (data.productionType === 'talk-edit' && Array.isArray(data.scenes) && data.scenes.length && data.talkEdit.roughcutPlan) {
    const doc = readJsonSafe(join(absDir, data.talkEdit.roughcutPlan))
    if (doc && Array.isArray(doc.captions)) {
      const fps = Number(data.fps) || 30
      const totalFrames = data.scenes.reduce((a, s) => Math.max(a, (Number(s.startFrame) || 0) + (Number(s.durationInFrames) || 0)), 0)
      const wavAbs = doc.render?.wav ? join(absDir, doc.render.wav) : ''
      // the cloud presenter's one-time cost confirmation is used for this planning only (never stored)
      const plan = await planTalkPack({ absDir, captions: doc.captions, totalSec: totalFrames / fps, sourceAssetId: doc.source?.assetId || '', settings: { ...saved, mascot: settings.mascot }, wavAbs, fps, signal, onChild, onProgress })
      applyScreenSetting(data.scenes, saved.screen)
      for (const sc of data.scenes) sc.sfxCues = (Array.isArray(sc.sfxCues) ? sc.sfxCues : []).filter((c) => c?.source !== 'talk-pack')
      if (plan.pack) {
        data.talkPack = plan.pack
        if (saved.sfx) addTalkPackSfx(data.scenes, plan.pack, fps)
      } else {
        delete data.talkPack
      }
      applied = true
    }
  }
  writeScriptJson(absDir, data)
  if (applied) {
    try {
      writeTalkProjectCode(absDir, readScriptJson(absDir).data)
    } catch {}
  }
  return { ok: true, settings: saved, applied }
}

/** Soft sound accents for the packaging, as scene sfx cues (pop on a keyword, whoosh on a chapter / cutaway). */
export function addTalkPackSfx(scenes, pack, fps) {
  if (!pack) return scenes
  const events = [
    ...(pack.keywords || []).map((k) => ({ at: k.startSec, cue: { type: 'pop', volume: 0.3, pan: 0 } })),
    ...(pack.chapters || []).map((c) => ({ at: c.startSec, cue: { type: 'whoosh', volume: 0.34, leadSec: 0.12, pan: 0 } })),
    ...(pack.broll || []).map((b) => ({ at: b.startSec, cue: { type: 'whoosh', volume: 0.22, leadSec: 0.15, pan: 0 } })),
  ]
  for (const ev of events) {
    const f = Math.round(ev.at * fps)
    const sc = scenes.find((x) => f >= x.startFrame && f < x.startFrame + x.durationInFrames)
    if (!sc) continue
    sc.sfxCues = [...(Array.isArray(sc.sfxCues) ? sc.sfxCues : []), { ...ev.cue, offsetSec: r3(ev.at - sc.startFrame / fps), source: 'talk-pack' }]
  }
  return scenes
}

export const TALK_EDIT_DEFAULTS = Object.freeze({ sceneTargetSec: 8, sceneMinSec: 3, sceneMaxSec: 16 })

const toRel = (projectDir, abs) => relative(resolve(projectDir), abs).replace(/\\/g, '/')
const absIn = (projectDir, p) => (isAbsolute(p) ? p : resolve(projectDir, p))
const r3 = (x) => Math.round(x * 1000) / 1000

/** The recording whose rough cut was planned last in this project (what the user worked on in 「AI 剪辑」). */
function lastPlannedSource(projectDir, items) {
  const dir = join(resolve(projectDir), 'assets', 'edited')
  if (!existsSync(dir)) return null
  let best = null
  for (const f of readdirSync(dir)) {
    if (!/^talk-[0-9a-f]{8}\.roughcut\.json$/.test(f)) continue
    const doc = readJsonSafe(join(dir, f))
    const rel = doc?.source?.path
    if (!rel) continue
    const abs = absIn(projectDir, rel)
    if (!existsSync(abs)) continue
    const at = Date.parse(doc.updatedAt || '') || 0
    if (!best || at > best.at) best = { at, abs, asset: items.find((it) => resolve(absIn(projectDir, it.path)) === resolve(abs)) || null }
  }
  return best ? { abs: best.abs, asset: best.asset } : null
}

/**
 * The recording to edit: an explicit path / asset id, else the one planned last in 「AI 剪辑」, else the 真人出镜 video,
 * else the longest video with sound.
 */
export function pickTalkSource(projectDir, wanted = '') {
  const items = readAssets(projectDir).items || []
  if (wanted) {
    const byId = items.find((it) => it.id === wanted)
    if (byId) return { abs: absIn(projectDir, byId.path), asset: byId }
    const abs = absIn(projectDir, wanted)
    const byPath = items.find((it) => resolve(absIn(projectDir, it.path)) === resolve(abs))
    return { abs, asset: byPath || null }
  }
  const last = lastPlannedSource(projectDir, items)
  if (last) return last
  const media = items.filter((it) => (it.type === 'video' || it.type === 'audio') && it.hasAudio !== false && it.role !== 'music' && it.role !== 'sfx')
  const host = media.find((it) => it.role === 'host_video' && it.type === 'video')
  const pick = host || media.filter((it) => it.type === 'video').sort((a, b) => (Number(b.durationSec) || 0) - (Number(a.durationSec) || 0))[0] || media[0]
  return pick ? { abs: absIn(projectDir, pick.path), asset: pick } : null
}

function stemFor(sourceAbs) {
  return `talk-${createHash('sha1').update(resolve(sourceAbs).toLowerCase()).digest('hex').slice(0, 8)}`
}

export function talkFilesFor(projectDir, sourceAbs) {
  const stem = stemFor(sourceAbs)
  const dir = join(resolve(projectDir), 'assets', 'edited')
  return {
    stem,
    dir,
    json: join(dir, `${stem}.roughcut.json`),
    video: join(dir, `${stem}.roughcut.mp4`),
    wav: join(dir, `${stem}.roughcut.wav`),
    srt: join(dir, `${stem}.roughcut.srt`),
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

const pickOptions = (o = {}) => {
  const out = {}
  for (const k of ['cutPauses', 'cutFillers', 'cutStutters', 'cutRetakes', 'cutNoise']) if (typeof o[k] === 'boolean') out[k] = o[k]
  for (const [k, lo, hi] of [['maxPauseSec', 0.25, 3], ['keepPauseSec', 0.05, 1.5], ['headPadSec', 0, 2], ['tailPadSec', 0, 3], ['fadeMs', 0, 60]]) {
    const v = Number(o[k])
    if (o[k] !== undefined && o[k] !== null && o[k] !== '' && Number.isFinite(v)) out[k] = Math.max(lo, Math.min(hi, v))
  }
  if (typeof o.enhanceVoice === 'boolean') out.enhanceVoice = o.enhanceVoice
  if (['auto', 'zh', 'en', 'ja', 'ko', 'yue'].includes(o.language)) out.language = o.language
  return out
}

/**
 * Transcribe + plan (+ render) the rough cut of one recording. `options` (persisted per recording; omitted fields keep
 * the saved / default values): cutPauses, maxPauseSec, keepPauseSec, cutFillers, cutStutters, cutRetakes, enhanceVoice,
 * language. `overrides` `{ restore: [removalId], cutWords: [[from, to]] }` replace the saved ones when given.
 */
export async function runTalkRoughCut({ projectDir, sourcePath = '', options = undefined, overrides = undefined, render = true, force = false, signal, onChild, onProgress } = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)
  const src = pickTalkSource(absDir, sourcePath)
  if (!src || !existsSync(src.abs)) throw new Error(sourcePath ? `找不到要剪辑的视频：${sourcePath}` : '素材库里还没有带声音的口播视频，请先上传（或用提词器录一段）。')
  const files = talkFilesFor(absDir, src.abs)
  const saved = readJsonSafe(files.json)
  const report = (pct, message) => onProgress?.({ progress: Math.round(pct), message })

  const probe = await probeCutSource(src.abs)
  if (!probe.hasAudio) throw new Error('这个视频没有声音，口播粗剪需要有人说话的视频。')
  const opts = { ...ROUGH_CUT_DEFAULTS, enhanceVoice: true, language: 'auto', ...(saved?.options ? pickOptions(saved.options) : {}), ...pickOptions(options || {}) }

  const transcript = await transcribeMedia({
    mediaPath: src.abs,
    projectDir: absDir,
    language: opts.language,
    force,
    signal,
    onChild,
    onProgress: (p) => report(Math.min(55, (Number(p.progress) || 0) * 0.55), p.message || '正在识别说话内容...'),
  })
  if (signal?.aborted) throw createAbortError()
  const transcriptHash = hashTranscript(transcript)
  const sameTranscript = saved?.transcriptHash === transcriptHash
  const ov = overrides !== undefined ? overrides || {} : sameTranscript ? saved?.overrides || {} : {}
  const fps = probe.hasVideo ? chooseProjectFps(probe.fps) : 30
  report(57, '正在规划粗剪（停顿、口头禅、重复、重录）...')
  const plan = planRoughCut(transcript, { ...opts, fps, offsetSec: probe.audioOffsetSec, sourceDurationSec: probe.durationSec || transcript.durationSec }, ov)
  if (!plan.keep.length) throw new Error('没有识别到说话内容（可能是纯音乐或噪音），无法粗剪。')
  const dims = projectDims(probe)
  const captions = buildCaptions(plan, { maxLineWidth: subtitleLineWidthFor(dims), fps })
  const keepHash = createHash('sha1')
    .update(JSON.stringify({ keep: plan.keep, fps, enhance: opts.enhanceVoice, fade: opts.fadeMs, size: statSync(src.abs).size, mtime: Math.round(statSync(src.abs).mtimeMs), enc: ROUGH_CUT_ENCODE_VERSION }))
    .digest('hex')
    .slice(0, 16)

  let rendered = false
  const haveRender = saved?.render?.keepHash === keepHash && existsSync(files.wav) && (!probe.hasVideo || existsSync(files.video))
  if (render && !haveRender) {
    report(60, `正在剪辑：保留 ${plan.keep.length} 段，原长 ${fmtSec(plan.sourceDurationSec)} → ${fmtSec(plan.outputDurationSec)}`)
    await renderRoughCut({
      sourcePath: src.abs,
      keep: plan.keep,
      fps,
      outVideo: probe.hasVideo ? files.video : '',
      outWav: files.wav,
      fadeMs: opts.fadeMs,
      enhanceVoice: opts.enhanceVoice,
      hasVideo: probe.hasVideo,
      signal,
      onChild,
      onProgress: (p) => report(60 + (Number(p.progress) || 0) * 0.37, p.message),
    })
    rendered = true
  }
  mkdirSync(files.dir, { recursive: true })
  writeFileSync(files.srt, captionsToSrt(captions), 'utf8')
  const texts = planTexts(plan)
  const doc = {
    version: 1,
    source: { path: toRel(absDir, src.abs), name: src.asset?.name || basename(src.abs), assetId: src.asset?.id || '', durationSec: probe.durationSec, width: probe.width, height: probe.height, fps: probe.fps, hasVideo: probe.hasVideo, rotation: probe.rotation, audioOffsetSec: probe.audioOffsetSec },
    transcript: { path: transcript.cachePath ? toRel(absDir, transcript.cachePath) : '', language: transcript.language, durationSec: transcript.durationSec, segments: (transcript.segments || []).length, engine: transcript.engine },
    transcriptHash,
    options: { ...opts, fps },
    overrides: { restore: Array.isArray(ov.restore) ? ov.restore : [], cutWords: Array.isArray(ov.cutWords) ? ov.cutWords : [] },
    plan,
    captions,
    texts,
    // the rendered files are current only when they were cut from exactly these keep ranges
    render:
      rendered || haveRender
        ? { keepHash, video: probe.hasVideo ? toRel(absDir, files.video) : '', wav: toRel(absDir, files.wav), srt: toRel(absDir, files.srt), renderedAt: rendered ? new Date().toISOString() : saved?.render?.renderedAt || '' }
        : { keepHash: '', video: '', wav: '', srt: toRel(absDir, files.srt), renderedAt: '', stale: Boolean(saved?.render?.keepHash) },
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(files.json, JSON.stringify(doc) + '\n', 'utf8')
  report(100, `粗剪完成：${fmtSec(plan.sourceDurationSec)} → ${fmtSec(plan.outputDurationSec)}（省掉 ${fmtSec(plan.stats.savedSec)}）`)
  return { ok: true, projectDir: absDir, source: { abs: src.abs, rel: doc.source.path, asset: src.asset }, probe, transcript, plan, captions, texts, files, doc, rendered, summary: summarizePlan(plan) }
}

function fmtSec(s) {
  const v = Math.max(0, Math.round(Number(s) || 0))
  return v >= 60 ? `${Math.floor(v / 60)} 分 ${String(v % 60).padStart(2, '0')} 秒` : `${v} 秒`
}

/** One plain-Chinese line about what the rough cut did (task log / tool result). */
export function summarizePlan(plan) {
  const k = plan?.stats?.byKind || {}
  const parts = []
  if (k.pause) parts.push(`缩短 ${k.pause.count} 处长停顿`)
  if (k.filler || k.fragment) parts.push(`去掉 ${(k.filler?.count || 0) + (k.fragment?.count || 0)} 个口头禅 / 口误`)
  if (k.stutter) parts.push(`${k.stutter.count} 处结巴重复`)
  if (k.retake || k['false-start']) parts.push(`${(k.retake?.count || 0) + (k['false-start']?.count || 0)} 处重录 / 说了半句重来（只留最后一遍）`)
  if (k.noise) parts.push(`${k.noise.count} 段杂音`)
  if (k.head || k.tail) parts.push('去掉开头结尾空白')
  return `${fmtSec(plan?.sourceDurationSec)} → ${fmtSec(plan?.outputDurationSec)}${parts.length ? `：${parts.join('、')}` : '：没有需要剪掉的地方'}`
}

/** Project canvas for a recording: its display size (rotation applied), even, long side ≤ 1920. */
export function projectDims(probe) {
  let w = Number(probe?.width) || 1920
  let h = Number(probe?.height) || 1080
  const long = Math.max(w, h)
  if (long > 1920) {
    const k = 1920 / long
    w *= k
    h *= k
  }
  const even = (x) => Math.max(320, Math.round(x / 2) * 2)
  return { width: even(w), height: even(h) }
}

/* -------------------------------------------------------------------------------------------- scenes */

/** Frames whose time is a whole number of milliseconds (24 fps → every 3rd, 25 → all, 30 → every 3rd, 60 → every 3rd). */
export function msGridStep(fps) {
  const f = Math.round(Number(fps) || 30)
  const gcd = (a, b) => (b ? gcd(b, a % b) : a)
  return Math.max(1, f / gcd(f, 1000))
}

/**
 * Group captions into scenes of about `targetSec` (between minSec and maxSec), cutting only between captions — at a
 * sentence end when possible — in the middle of the pause, on a whole-millisecond frame (so the host's voice can be
 * cut into sample-exact per-scene slices that join seamlessly). Returns `[{ startFrame, endFrame, captions[] }]`.
 */
export function groupCaptionsIntoScenes(captions, plan, { fps = 30, totalFrames = 0, targetSec = TALK_EDIT_DEFAULTS.sceneTargetSec, minSec = TALK_EDIT_DEFAULTS.sceneMinSec, maxSec = TALK_EDIT_DEFAULTS.sceneMaxSec } = {}) {
  const caps = Array.isArray(captions) ? captions : []
  const f = Number(fps) > 0 ? Number(fps) : 30
  const step = msGridStep(f)
  const total = Math.max(1, Math.round(Number(totalFrames) || Math.ceil((caps[caps.length - 1]?.endSec || 1) * f)))
  if (!caps.length) return [{ startFrame: 0, endFrame: total, captions: [] }]
  const words = Array.isArray(plan?.words) ? plan.words : []
  const sentenceEndAfter = (c, next) => {
    if (!next || !Array.isArray(c.wordRange) || !Array.isArray(next.wordRange)) return true
    for (let i = c.wordRange[1] + 1; i < next.wordRange[0] && i < words.length; i++) if (words[i]?.punct && words[i]?.strong) return true
    return false
  }
  const snap = (t) => Math.round((t * f) / step) * step
  const cutTimeBetween = (c, next) => {
    const a = c.words?.length ? c.words[c.words.length - 1].endSec : c.endSec
    const b = next.words?.length ? next.words[0].startSec : next.startSec
    return (Math.min(a, b) + Math.max(a, b)) / 2
  }
  const groups = []
  let cur = { start: 0, caps: [] }
  for (let k = 0; k < caps.length; k++) {
    const c = caps[k]
    const next = caps[k + 1]
    cur.caps.push(c)
    if (!next) break
    const len = c.endSec - (cur.caps[0]?.startSec ?? cur.start)
    const lenWithNext = next.endSec - (cur.caps[0]?.startSec ?? cur.start)
    const sentence = sentenceEndAfter(c, next)
    if ((len >= targetSec && sentence) || (lenWithNext > maxSec && len >= minSec) || (len >= maxSec)) {
      const t = cutTimeBetween(c, next)
      groups.push({ caps: cur.caps, endTime: t })
      cur = { start: t, caps: [] }
    }
  }
  groups.push({ caps: cur.caps, endTime: total / f })
  // a short tail merges into the scene before it
  if (groups.length > 1) {
    const last = groups[groups.length - 1]
    const prev = groups[groups.length - 2]
    const lastStart = prev.endTime
    if (last.endTime - lastStart < minSec) {
      prev.caps.push(...last.caps)
      prev.endTime = last.endTime
      groups.pop()
    }
  }
  const out = []
  let startFrame = 0
  groups.forEach((g, gi) => {
    const isLast = gi === groups.length - 1
    let endFrame = isLast ? total : snap(g.endTime)
    if (!isLast) endFrame = Math.max(startFrame + step, Math.min(total - step, endFrame))
    if (endFrame <= startFrame) return
    out.push({ startFrame, endFrame, captions: g.caps })
    startFrame = endFrame
  })
  if (out.length) out[out.length - 1].endFrame = total
  return out
}

/**
 * Output frames where the edit joined two parts of the recording (the jump cuts), thinned to one punch-in every
 * `minGapSec`: the presenter alternates 1.0 ↔ zoom at each of them so the jumps read as deliberate camera moves.
 */
export function jumpCutFrames(keep, fps, { minGapSec = 1.0 } = {}) {
  const out = []
  let acc = 0
  const ranges = keepFrames(keep, fps)
  for (let k = 0; k < ranges.length - 1; k++) {
    acc += ranges[k].ef - ranges[k].sf
    if (!out.length || acc - out[out.length - 1] >= minGapSec * fps) out.push(acc)
  }
  return out
}

/** Cut the roughcut WAV into per-scene WAVs at sample-exact positions (one FFmpeg pass). */
export async function sliceSceneAudio({ wavAbs, scenes, fps, outDir, signal, onChild }) {
  const { ffmpeg } = resolveBinaries()
  mkdirSync(outDir, { recursive: true })
  const SR = 48000
  const work = join(REPO_ROOT, '.tmp', 'roughcut')
  mkdirSync(work, { recursive: true })
  const scriptPath = join(work, `slice-${process.pid}-${Date.now()}.txt`)
  const n = scenes.length
  const parts = [`[0:a]aresample=${SR},asplit=${n}${scenes.map((_, i) => `[s${i}]`).join('')}`]
  scenes.forEach((sc, i) => {
    const a = Math.round((sc.startFrame / fps) * SR)
    const b = Math.round((sc.endFrame / fps) * SR)
    parts.push(`[s${i}]atrim=start_sample=${a}${i < n - 1 ? `:end_sample=${b}` : ''},asetpts=PTS-STARTPTS[o${i}]`)
  })
  writeFileSync(scriptPath, parts.join(';\n'), 'utf8')
  const args = ['-hide_banner', '-nostats', '-y', '-i', wavAbs, '-filter_complex_script', scriptPath]
  scenes.forEach((sc, i) => args.push('-map', `[o${i}]`, '-c:a', 'pcm_s16le', '-ar', String(SR), '-ac', '2', join(outDir, `${sc.id}-host.wav`)))
  try {
    const res = await runCommandRedirected(ffmpeg, args, { timeoutMs: 600_000, signal, onChild })
    if (res.code !== 0) throw new Error(`切分原声失败：${String(res.stderr || '').trim().split(/\r?\n/).slice(-3).join(' | ')}`)
  } finally {
    try {
      rmSync(scriptPath, { force: true })
    } catch {}
  }
  return scenes.map((sc) => join(outDir, `${sc.id}-host.wav`))
}

/**
 * Turn the rough cut into a 口播剪辑 project: script.json scenes that play the cut recording continuously, the host's
 * own voice per scene, real captions; then the Remotion project files. The previous script is kept in version history.
 */
export async function buildTalkEditProject({ projectDir, sourcePath = '', options = undefined, overrides = undefined, sceneTargetSec = TALK_EDIT_DEFAULTS.sceneTargetSec, title = '', pack = undefined, writeRemotion = true, force = false, signal, onChild, onProgress } = {}) {
  const absDir = resolve(projectDir)
  const res = await runTalkRoughCut({ projectDir: absDir, sourcePath, options, overrides, render: true, force, signal, onChild, onProgress: (p) => onProgress?.({ progress: Math.round((Number(p.progress) || 0) * 0.88), message: p.message }) })
  if (!res.probe.hasVideo) throw new Error('这是一段纯音频：已生成粗剪音频和字幕，口播成片需要有画面的视频。')
  if (signal?.aborted) throw createAbortError()
  const fps = res.plan.options.fps
  const dims = projectDims(res.probe)
  const totalFrames = Math.max(1, Number(res.plan.outputFrames) || Math.round(res.plan.outputDurationSec * fps))
  const captions = res.captions
  const groups = groupCaptionsIntoScenes(captions, res.plan, { fps, totalFrames, targetSec: sceneTargetSec })
  onProgress?.({ progress: 90, message: `正在把原声切成 ${groups.length} 段（按句子断开，无缝衔接）...` })
  const presenterRel = toRel(absDir, res.files.video)
  const punchIns = jumpCutFrames(res.plan.keep, fps)
  const scenes = groups.map((g, i) => {
    const id = `talk-${String(i + 1).padStart(2, '0')}`
    const startSec = g.startFrame / fps
    const durationInFrames = g.endFrame - g.startFrame
    const durationSec = durationInFrames / fps
    const wr = g.captions.length ? [g.captions[0].wordRange?.[0], g.captions[g.captions.length - 1].wordRange?.[1]] : null
    const narration = wr && Number.isFinite(wr[0]) ? joinWordTexts(res.plan.words.slice(wr[0], wr[1] + 2).filter((w) => !w.removed && (w.i <= wr[1] || w.punct))).trim() : g.captions.map((c) => c.text).join('，')
    const subtitles = g.captions.map((c, k) => {
      const s0 = Math.max(0, c.startSec - startSec)
      const s1 = Math.max(s0 + 0.1, Math.min(durationSec, c.endSec - startSec))
      return {
        index: k + 1,
        text: c.text,
        startSec: r3(s0),
        endSec: r3(s1),
        startFrame: Math.floor(s0 * fps),
        endFrame: Math.max(Math.floor(s0 * fps) + 1, Math.min(durationInFrames, Math.ceil(s1 * fps))),
        words: (c.words || []).map((w) => ({ text: w.text, at: r3(Math.max(0, w.startSec - c.startSec)), end: r3(Math.max(0, w.endSec - c.startSec)) })),
      }
    })
    const firstLine = (g.captions[0]?.text || narration || `片段 ${i + 1}`).replace(/\s+/g, ' ')
    return {
      id,
      title: firstLine.length > 14 ? `${firstLine.slice(0, 14)}…` : firstLine,
      narration,
      subtitleText: g.captions.map((c) => c.text).join('，'),
      subChunks: g.captions.map((c) => c.text),
      subtitles,
      startFrame: g.startFrame,
      durationInFrames,
      durationSec: r3(durationSec),
      audioFile: `audio/${id}-host.wav`,
      voiceDurationSec: r3(durationSec),
      voiceLeadSec: 0,
      voiceSource: 'host',
      voiceLocked: true,
      layout: 'presenter',
      presenter: {
        path: presenterRel,
        startFrame: g.startFrame,
        fit: 'cover',
        cuts: punchIns.filter((f) => f > g.startFrame && f < g.endFrame).map((f) => f - g.startFrame),
        cutParity: punchIns.filter((f) => f <= g.startFrame).length % 2,
      },
      transition: 'cut',
      sfxCues: [],
      ambience: 'none',
      emotion: '平静',
      role: 'host',
      visualPrompt: '',
    }
  })
  await sliceSceneAudio({ wavAbs: res.files.wav, scenes: scenes.map((s) => ({ id: s.id, startFrame: s.startFrame, endFrame: s.startFrame + s.durationInFrames })), fps, outDir: join(absDir, 'audio'), signal, onChild })

  // the source recording is the 真人出镜 video of this project
  if (res.source.asset && res.source.asset.role !== 'host_video' && res.source.asset.type === 'video') {
    try {
      updateAsset(absDir, res.source.asset.id, { role: 'host_video' })
    } catch {}
  }
  let prev = {}
  if (existsSync(join(absDir, 'script.json'))) {
    try {
      prev = readScriptJson(absDir).data || {}
    } catch {}
    safeProjectSnapshot(absDir, { label: 'talk-edit:before', stage: 'talk-edit', author: 'user', kind: 'checkpoint', note: '生成口播剪辑前的工程' })
  }
  // 口播包装: the user's settings (this call, else the project's last ones), then keywords / chapters / B-roll
  onProgress?.({ progress: 92, message: '正在做口播包装（关键词、章节、按讲话插空镜）...' })
  const packPlan = await planTalkPack({
    absDir,
    captions,
    totalSec: totalFrames / fps,
    sourceAssetId: res.source.asset?.id || '',
    settings: pack !== undefined ? { ...(prev?.talkEdit?.pack || {}), ...(cleanTalkPackSettings(pack) || {}) } : prev?.talkEdit?.pack || {},
    wavAbs: res.files.wav,
    fps,
    signal,
    onChild,
    onProgress: (p) => onProgress?.({ progress: 93, message: p.message }),
  })
  if (packPlan.settings.sfx !== false) addTalkPackSfx(scenes, packPlan.pack, fps)
  applyScreenSetting(scenes, packPlan.settings.screen)
  const keepFromPrev = ['displayTitle', 'brandKit', 'brandMark', 'aiBadgeEnabled', 'aiBadgePosition', 'aiBadgeText', 'targetPlatform', 'figureStyleChoice', 'figureStyleChoiceNote', 'genre', 'genreLabel']
  const script = {
    ...Object.fromEntries(keepFromPrev.filter((k) => prev[k] !== undefined).map((k) => [k, prev[k]])),
    title: title || prev.title || res.source.asset?.name?.replace(/\.[^.]+$/, '') || '口播剪辑',
    productionType: 'talk-edit',
    engine: 'remotion',
    authoringMode: 'talk-kit',
    narrationMode: 'tts',
    voiceSource: 'host',
    voiceMode: 'manual',
    fps,
    width: dims.width,
    height: dims.height,
    aspectRatio: undefined,
    style: prev.style || 'tech',
    subtitleStyle: 'talk',
    ambienceBed: false,
    bgm: prev.bgm && typeof prev.bgm === 'object' ? { ...prev.bgm, volume: Number(prev.bgm.volume) > 0 ? Math.min(Number(prev.bgm.volume), 0.32) : 0.24 } : { enabled: true, mood: 'warm', volume: 0.24 },
    talkEdit: {
      source: res.doc.source,
      roughcut: res.doc.render,
      roughcutPlan: toRel(absDir, res.files.json),
      transcript: res.doc.transcript,
      stats: res.plan.stats,
      summary: res.summary,
      options: res.doc.options,
      sceneTargetSec,
      pack: storedPackSettings(packPlan.settings),
      builtAt: new Date().toISOString(),
    },
    scenes,
  }
  if (packPlan.pack) script.talkPack = packPlan.pack
  delete script.aspectRatio
  // a real person's own recording: the corner AI badge stays off unless the user switched it on for this project
  // (remembered, so an AI film made in this project later gets its default badge back)
  if (script.aiBadgeEnabled === undefined) {
    script.aiBadgeEnabled = false
    script.talkEdit.autoBadgeOff = true
  }
  script.subtitles = buildGlobalSubtitleTrack(scenes, fps)
  writeScriptJson(absDir, script)
  if (writeRemotion) {
    onProgress?.({ progress: 96, message: '正在生成 Remotion 工程（画面 + 真实字幕）...' })
    writeTalkProjectCode(absDir, readScriptJson(absDir).data)
  }
  onProgress?.({ progress: 100, message: `口播工程已生成：${scenes.length} 段 · ${fmtSec(res.plan.outputDurationSec)} · ${captions.length} 条字幕` })
  return { ...res, scenes: scenes.length, captionsCount: captions.length, script: readScriptJson(absDir).data }
}

/**
 * Script-level settings only a 口播剪辑 uses (real-caption style, no ambience bed, the host voice, the automatic badge
 * switch-off). An AI film made in the same project afterwards must not inherit them: returns a copy without them
 * (scenes untouched — the AI run replaces them); the same object when there is nothing to strip.
 */
export function stripTalkEditFields(script) {
  if (!script || typeof script !== 'object') return script
  const te = script.talkEdit
  const isTalk = script.productionType === 'talk-edit' || script.subtitleStyle === 'talk' || Boolean(te)
  if (!isTalk) return script
  const out = { ...script }
  if (out.productionType === 'talk-edit') out.productionType = 'ai-film'
  if (out.subtitleStyle === 'talk') delete out.subtitleStyle
  if (out.authoringMode === 'talk-kit') delete out.authoringMode
  if (out.voiceSource === 'host') delete out.voiceSource
  if (out.ambienceBed === false && te) delete out.ambienceBed
  if (te?.autoBadgeOff && out.aiBadgeEnabled === false) delete out.aiBadgeEnabled
  delete out.talkEdit
  delete out.talkPack
  return out
}

/** Strip the 口播剪辑-only settings from a project's script.json before an AI film run (no-op for other projects). */
export function clearTalkEditSettings(projectDir) {
  try {
    const { data } = readScriptJson(projectDir)
    const cleaned = stripTalkEditFields(data)
    if (cleaned !== data) {
      writeScriptJson(projectDir, cleaned)
      return true
    }
  } catch {}
  return false
}

/** What the studio panel needs: engine status, the chosen recording and the last rough cut (no recognition run). */
export async function readTalkEditState(projectDir, { sourcePath = '' } = {}) {
  const absDir = resolve(projectDir)
  const engine = await getAsrStatus()
  let src = null
  try {
    src = pickTalkSource(absDir, sourcePath)
  } catch {}
  const items = (() => {
    try {
      return (readAssets(absDir).items || []).filter((it) => (it.type === 'video' || it.type === 'audio') && it.role !== 'music' && it.role !== 'sfx')
    } catch {
      return []
    }
  })()
  const doc = src ? readJsonSafe(talkFilesFor(absDir, src.abs).json) : null
  let script = null
  try {
    script = readScriptJson(absDir).data
  } catch {}
  // 口播包装: saved settings + what they would place on the current cut (library videos are not analysed here)
  const packSettings = resolveTalkPack(script?.talkEdit?.pack || {})
  let packPreview = null
  if (doc && Array.isArray(doc.captions) && doc.captions.length) {
    try {
      // the preview never prepares the cartoon character (cut-out / voice envelope happen when the cut is built)
      const plan = await planTalkPack({ absDir, captions: doc.captions, totalSec: Number(doc.plan?.outputDurationSec) || 0, sourceAssetId: doc.source?.assetId || '', settings: { ...packSettings, mascot: null }, indexLibrary: false })
      packPreview = plan.pack ? { keywords: plan.pack.keywords, chapters: plan.pack.chapters, broll: plan.pack.broll } : { keywords: [], chapters: [], broll: [] }
    } catch {}
  }
  // 「我的动漫形象」: the reusable character library + which presenter engines this computer can use
  let characters = []
  let presenterEngines = []
  try {
    characters = (await import('../dsh-tool-avatar/anime-character.js')).listCharacters().filter((c) => c.status === 'ready' && c.hasPortrait)
  } catch {}
  try {
    presenterEngines = await (await import('../dsh-tool-avatar/anime-engines.js')).getPresenterEngines()
  } catch {}
  const srcAssetId = doc?.source?.assetId || src?.asset?.id || ''
  const libraryVideos = items.filter((it) => it.type === 'video' && it.id !== srcAssetId && !NOT_BROLL_ROLES.has(it.role))
  const libraryImages = (() => {
    try {
      return (readAssets(absDir).items || []).filter((it) => it.type === 'image' && !NOT_BROLL_ROLES.has(it.role))
    } catch {
      return []
    }
  })()
  return {
    ok: true,
    pack: {
      settings: storedPackSettings(packSettings),
      presets: Object.values(TALK_PACK_PRESETS).map((p) => ({ value: p.id, label: p.label, accent: p.accent })),
      preview: packPreview,
      libraryCount: libraryVideos.length + libraryImages.length,
      unindexed: libraryVideos.filter((it) => !(it.footage?.shots || []).length).length,
      // 卡通讲解员 candidates: pictures and short clips of the library (never the recording itself); a picture with a
      // transparent background works best
      mascotCandidates: [...libraryImages, ...libraryVideos.filter((it) => !(Number(it.durationSec) > 60))]
        .filter((it) => it.role !== 'host_video')
        .map((it) => ({ id: it.id, name: it.name, type: it.type, path: it.path, role: it.role || '', durationSec: Number(it.durationSec) || 0 })),
      // what was used in the last build (cut-out note, e.g. 已自动抠掉纯色背景 / 背景不是纯色…)
      mascotNote: script?.talkPack?.mascot ? String(script.talkPack.mascot.note || '') : '',
      mascotFallback: script?.talkPack?.mascot?.fallback || null,
      // what the last build actually used (a cloud clip of an unchanged cut is re-used for free)
      mascotLast: script?.talkPack?.mascot
        ? { type: script.talkPack.mascot.type || '', engine: script.talkPack.mascot.engine || '', characterId: script.talkPack.mascot.characterId || '', characterVersion: script.talkPack.mascot.characterVersion || 0, fellBack: Boolean(script.talkPack.mascot.fallback) }
        : null,
      characters,
      presenterEngines: presenterEngines.map((e) => ({ id: e.id, tier: e.tier, label: e.label, short: e.short, paid: e.paid, available: e.available, reason: e.reason, modes: e.modes })),
    },
    engine: { ready: engine.ready, reason: engine.reason, missing: engine.missing, home: engine.home, supportedPlatform: engine.supportedPlatform, attribution: engine.attribution },
    sources: items.map((it) => ({ id: it.id, name: it.name, path: it.path, type: it.type, role: it.role, durationSec: it.durationSec, hasAudio: it.hasAudio !== false })),
    source: src ? { path: toRel(absDir, src.abs), assetId: src.asset?.id || '', name: src.asset?.name || basename(src.abs) } : null,
    roughcut: doc ? { ...doc, summary: summarizePlan(doc.plan) } : null,
    defaults: { ...ROUGH_CUT_DEFAULTS, enhanceVoice: true, language: 'auto', sceneTargetSec: TALK_EDIT_DEFAULTS.sceneTargetSec },
    kinds: REMOVAL_KINDS,
    project: script ? { productionType: script.productionType || '', scenes: (script.scenes || []).length, builtFrom: script.talkEdit?.source?.path || '' } : null,
  }
}

/* -------------------------------------------------------------------------------------------- pipeline */

export const TALK_EDIT_SUBTASKS = [
  { id: 't-director', stage: 'director', name: '听写口播与粗剪规划', kind: 'script_plan' },
  { id: 't-editor', stage: 'editor', name: '口播粗剪（停顿 / 口头禅 / 重录）', kind: 'media_edit' },
  { id: 't-audio', stage: 'audio', name: '原声分段与配乐混音', kind: 'audio_mix' },
  { id: 't-motion', stage: 'motion_qa', name: '真实字幕与画面合成', kind: 'motion_qa' },
  { id: 't-render', stage: 'motion_qa', name: '高清成片 MP4 编码导出', kind: 'mp4_render' },
]

/**
 * Task Center runner for `productionType: 'talk-edit'`. `deps` = { executeVideoRender, executeVideoLint,
 * executeVideoSnapshot } (injected by the orchestrator to keep this module free of the render suite).
 */
export async function executeTalkEditRunner(run, helpers, deps = {}) {
  const { signal, onChild, waitIfPaused, updateTask, appendLog } = helpers
  const spec = run.spec || {}
  const absDir = resolve(spec.projectDir || run.projectDir)
  const warnings = []
  const warn = (stage, msg) => {
    warnings.push({ stage, message: msg })
    appendLog(stage, msg, 'warn')
  }
  const done = (id) => (run.tasks || []).find((t) => t.id === id)?.status === 'completed'
  const talkOpts = spec.talkEdit && typeof spec.talkEdit === 'object' ? spec.talkEdit : {}

  if (!done('t-director')) {
    await waitIfPaused('t-director')
    const engine = await getAsrStatus()
    if (!engine.ready) {
      throw Object.assign(new Error(`口播剪辑需要先安装「本地语音识别」（免费、离线，约 260 MB）：${engine.reason}。打开「AI 剪辑 · 口播粗剪」面板即可一键安装。`), { code: 'ASR_NOT_INSTALLED' })
    }
    updateTask('t-director', { status: 'running', progress: 5, message: '正在听写口播：本地语音识别（不联网、不花钱）...' })
    if (spec.avatarEnabled) appendLog('director', '口播剪辑用的是你本人的出镜视频，已跳过数字人合成。')
    const res = await runTalkRoughCut({
      projectDir: absDir,
      sourcePath: talkOpts.sourcePath || spec.talkSource || '',
      options: talkOpts.options || undefined,
      overrides: talkOpts.overrides,
      render: false,
      signal,
      onChild,
      onProgress: (p) => updateTask('t-director', { status: 'running', progress: Math.max(5, Math.min(95, Number(p.progress) || 0)), message: p.message, log: false }),
    })
    appendLog('director', `识别完成：${res.transcript.segments.length} 段话（${res.transcript.language || '自动'}），粗剪规划 ${res.summary}`)
    updateTask('t-director', { status: 'completed', progress: 100, message: `听写与粗剪规划完成：${res.summary}` })
  }
  if (signal?.aborted) throw createAbortError()

  let built = null
  if (!done('t-editor') || !done('t-audio')) {
    await waitIfPaused('t-editor')
    updateTask('t-editor', { status: 'running', progress: 5, message: '正在剪辑：去掉停顿、口头禅和重录...' })
    // a cloud anime presenter may only be paid for with the cost the user confirmed for this run (never stored)
    let presenterPack
    const confirmedRmb = Number(talkOpts.presenterConfirmedRmb)
    if (talkOpts.presenterConfirmedRmb !== undefined && talkOpts.presenterConfirmedRmb !== null && Number.isFinite(confirmedRmb) && confirmedRmb >= 0) {
      try {
        const saved = readScriptJson(absDir).data?.talkEdit?.pack
        if (saved?.mascot?.characterId) presenterPack = { mascot: { ...saved.mascot, confirmedRmb } }
      } catch {}
    }
    built = await buildTalkEditProject({
      projectDir: absDir,
      sourcePath: talkOpts.sourcePath || spec.talkSource || '',
      options: talkOpts.options || undefined,
      overrides: talkOpts.overrides,
      sceneTargetSec: Number(talkOpts.sceneTargetSec) || TALK_EDIT_DEFAULTS.sceneTargetSec,
      ...(presenterPack ? { pack: presenterPack } : {}),
      title: spec.displayTitle || spec.title || '',
      writeRemotion: false,
      signal,
      onChild,
      onProgress: (p) => {
        const pct = Number(p.progress) || 0
        if (pct < 90) updateTask('t-editor', { status: 'running', progress: Math.max(5, Math.min(97, pct)), message: p.message, log: false })
        else updateTask('t-audio', { status: 'running', progress: Math.max(10, Math.min(90, (pct - 88) * 8)), message: p.message, log: false })
      },
    })
    updateTask('t-editor', { status: 'completed', progress: 100, message: `粗剪完成：${built.summary}` })
    updateTask('t-audio', { status: 'completed', progress: 100, message: `原声已按句子切成 ${built.scenes} 段（无缝衔接），配乐在成片时压在人声下面` })
  }
  if (signal?.aborted) throw createAbortError()

  if (!done('t-motion')) {
    await waitIfPaused('t-motion')
    updateTask('t-motion', { status: 'running', progress: 20, message: '正在合成画面与真实字幕（Remotion 工程）...' })
    const sc = readScriptJson(absDir).data
    writeTalkProjectCode(absDir, sc)
    if (deps.executeVideoLint) {
      try {
        const lint = await deps.executeVideoLint({ projectDir: absDir })
        const errs = Array.isArray(lint?.errors) ? lint.errors : []
        if (errs.length) warn('motion_qa', `video_lint：${errs.slice(0, 3).join('；')}`)
      } catch {}
    }
    updateTask('t-motion', { status: 'completed', progress: 100, message: `字幕与画面已合成：${(sc.scenes || []).length} 段 · ${(sc.subtitles || []).length} 条字幕` })
  }
  if (signal?.aborted) throw createAbortError()

  let finalRender = null
  if (!done('t-render')) {
    await waitIfPaused('t-render')
    updateTask('t-render', { status: 'running', progress: 8, message: '正在渲染成片（画面 + 原声 + 配乐 + 字幕）...' })
    if (!deps.executeVideoRender) throw new Error('render suite unavailable')
    finalRender = await deps.executeVideoRender({
      projectDir: absDir,
      engine: 'remotion',
      signal,
      onProgress: (p) => {
        const pct = p && typeof p === 'object' ? (p.progress ?? p.pct) : undefined
        updateTask('t-render', { status: 'running', progress: Math.max(8, Math.min(97, Number(pct) || 50)), message: p?.message || '渲染中...', log: false })
      },
    })
    const qa = finalRender?.qaReport || finalRender?.qa || null
    const failed = qa && qa.passed === false ? (qa.checks || []).filter((c) => c && c.passed === false) : []
    for (const c of failed.slice(0, 4)) warn('motion_qa', `⚠ 成片质检未通过：${c.name || c.id || '未命名检查'}${c.value ? ` — ${String(c.value).slice(0, 160)}` : ''}`)
    updateTask('t-render', { status: 'completed', progress: 100, message: `成片导出成功：${finalRender?.resolution || ''} · ${finalRender?.durationSec || ''}s${qa ? (qa.passed === false ? ` · ⚠ 质检 ${Math.max(1, failed.length)} 项未通过` : ' · 质检通过') : ''}` })
  }
  const qaFinal = finalRender?.qaReport || finalRender?.qa || null
  return {
    ok: true,
    projectDir: absDir,
    engine: 'remotion',
    mode: 'talk-edit',
    outputPath: finalRender?.outputPath || join(absDir, 'output', 'final.mp4'),
    snapshotPath: finalRender?.snapshotPath || join(absDir, 'output', 'snapshot-3x3.png'),
    qa: qaFinal,
    qaPassed: qaFinal ? qaFinal.passed !== false : null,
    warnings,
  }
}
