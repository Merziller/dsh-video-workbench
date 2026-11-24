/**
 * 本地语音识别 + 口播剪辑 REST routes (all local: no model provider, no cost):
 *   GET  /api/video-workbench/asr/status       ?deep=1 → engine status (deep: loads the models in a child process),
 *                                               installer catalog (size, languages, recommended folder, licences)
 *   POST /api/video-workbench/asr/install      { installDir?, mirror: 'cn'|'global' } → { jobId } (one install at a time)
 *   GET  /api/video-workbench/talk/state       ?projectDir=…&source=… → engine readiness, the project's recordings, the
 *                                               chosen recording's last rough cut (plan + captions), defaults
 *   POST /api/video-workbench/talk/roughcut    { projectDir, sourcePath?, options?, overrides?, render?, force? }
 *                                               → { jobId } (recognise + plan; render the cut when render=true)
 *   POST /api/video-workbench/talk/build       { projectDir, sourcePath?, options?, overrides?, sceneTargetSec? }
 *                                               → { jobId } (rough cut → 口播剪辑 project: scenes, host voice, captions)
 *   POST /api/video-workbench/talk/transcribe  { projectDir, mediaPath, language? } → { jobId } (听写任意素材:
 *                                               text + SRT saved next to the project's transcripts)
 *   GET  /api/video-workbench/footage/state    ?projectDir=… → the project's videos with their shot index (看懂素材库)
 *   POST /api/video-workbench/footage/index    { projectDir, assetIds?, force?, transcribe?: 'auto'|'off' } → { jobId }
 *                                               (shot detection + per-shot quality / speech, all local and free)
 *   GET  /api/video-workbench/plaza/slots      ?id=<template>&projectDir=… → 可填空模板: every blank of the template
 *                                               (words / pictures / music), the project's media for the picture and
 *                                               music blanks, and the last fills when the project came from it
 *   POST /api/video-workbench/plaza/fill       { projectDir, templateId, fills, autoFillMedia?, topic? } → { jobId }
 *                                               (the template's look + shots with the fills; local, no model call)
 *   POST /api/video-workbench/plaza/fill-suggest { projectDir, templateId, topic, notes? } → { jobId } (the configured
 *                                               model writes the text blanks for a topic; nothing is written)
 * One recognition / build / analysis job per project at a time. Registered in index.js; allow-listed for the panel
 * kit (client.js KIT_API_GET / KIT_API_POST).
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { getAsrInstallerCatalog, getAsrStatus, installAsrEngine, transcribeMedia, transcriptPlainText } from '../../dsh-tool-media/speech-recognition.js'
import { buildCaptions, captionsToSrt, planRoughCut } from '../../dsh-tool-media/rough-cut.js'
import { buildTalkEditProject, cleanTalkPackSettings, readTalkEditState, runTalkRoughCut, saveTalkPackSettings } from '../../dsh-tool-media/talk-edit.js'
import { indexFootage } from '../../dsh-tool-media/footage-index.js'
import { readAssets } from '../../dsh-tool-media/asset-manager.js'
import { buildHighlightProject } from '../../dsh-tool-media/highlight-reel.js'
import { describeTemplateSlots, fillTemplateIntoProject, suggestTemplateTexts, templateFillLibrary } from '../../dsh-tool-media/template-fill.js'
import { isValidPlazaTemplateId } from '../../dsh-tool-media/template-plaza.js'
import { readScriptJson } from '../../shared/index.js'

export const TALK_ROUTES = Object.freeze([
  { path: '/api/video-workbench/asr/status', methods: ['GET'] },
  { path: '/api/video-workbench/asr/install', methods: ['POST'] },
  { path: '/api/video-workbench/talk/state', methods: ['GET'] },
  { path: '/api/video-workbench/talk/roughcut', methods: ['POST'] },
  { path: '/api/video-workbench/talk/build', methods: ['POST'] },
  { path: '/api/video-workbench/talk/transcribe', methods: ['POST'] },
  { path: '/api/video-workbench/footage/state', methods: ['GET'] },
  { path: '/api/video-workbench/footage/index', methods: ['POST'] },
  { path: '/api/video-workbench/talk/pack', methods: ['POST'] },
  { path: '/api/video-workbench/highlight/state', methods: ['GET'] },
  { path: '/api/video-workbench/plaza/slots', methods: ['GET'] },
  { path: '/api/video-workbench/plaza/fill', methods: ['POST'] },
  { path: '/api/video-workbench/plaza/fill-suggest', methods: ['POST'] },
  { path: '/api/video-workbench/highlight/build', methods: ['POST'] },
])

/** Vlog 高光 panel state: the clips and music of the library, the last highlight settings of this project. */
export function highlightState(projectDir) {
  const items = readAssets(projectDir).items || []
  const clips = items.filter((it) => it.type === 'video' && !['music', 'sfx', 'voice_clone', 'avatar_base'].includes(it.role) && (Number(it.durationSec) || 0) >= 1.2)
  const music = items.filter((it) => (it.role === 'music' || it.type === 'audio') && it.role !== 'sfx' && it.role !== 'voice_clone')
  let script = null
  try {
    script = readScriptJson(projectDir).data
  } catch {}
  return {
    ok: true,
    clips: clips.map((it) => ({ id: it.id, name: it.originalName || it.name, durationSec: Number(it.durationSec) || 0, analyzed: Boolean(it.footage?.shots?.length), shots: (it.footage?.shots || []).length, thumb: it.thumb || '', width: Number(it.width) || 0, height: Number(it.height) || 0 })),
    music: music.map((it) => ({ id: it.id, name: it.originalName || it.name, durationSec: Number(it.durationSec) || 0 })),
    totalSec: clips.reduce((a, it) => a + (Number(it.durationSec) || 0), 0),
    built: script?.productionType === 'highlight' ? { ...(script.highlight || {}), scenes: (script.scenes || []).length, title: script.displayTitle || '' } : null,
  }
}

/** The project's videos with their shot index, lean enough for the panel (thumbnails are project files). */
export function footageState(projectDir) {
  const manifest = readAssets(projectDir)
  const videos = (manifest.items || [])
    .filter((it) => it.type === 'video')
    .map((it) => {
      const fx = it.footage
      const shots = Array.isArray(fx?.shots) ? fx.shots : []
      return {
        assetId: it.id,
        name: it.originalName || it.name || it.id,
        path: it.editedPath || it.path,
        durationSec: Number(it.durationSec) || 0,
        width: Number(it.width) || 0,
        height: Number(it.height) || 0,
        role: it.role || '',
        thumb: it.thumb || '',
        analyzed: shots.length > 0,
        analyzedAt: fx?.analyzedAt || '',
        takes: Number(fx?.takes) || 0,
        speechSec: Number(fx?.speechSec) || 0,
        shots: shots.map((s) => ({ i: s.i, start: s.start, end: s.end, dur: s.dur, thumb: s.thumb || '', quality: s.quality, motion: s.motion, brightness: s.brightness, speech: s.speech || '' })),
      }
    })
  return { ok: true, videos }
}
const TALK_PATHS = new Set(TALK_ROUTES.map((r) => r.path))

export function isTalkRoute(pathname) {
  return TALK_PATHS.has(pathname)
}

class TalkRouteError extends Error {
  constructor(message, status = 400, code = '') {
    super(message)
    this.status = status
    this.expose = true
    if (code) this.code = code
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

async function readBody(req) {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  } catch {
    return {}
  }
}

function resolveProjectDir(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) throw new TalkRouteError('缺少 projectDir（视频工程目录）')
  if (s.length > 1024 || s.includes('\0')) throw new TalkRouteError('projectDir 无效')
  if (!isAbsolute(s)) throw new TalkRouteError('projectDir 必须是绝对路径')
  const abs = resolve(s)
  let st = null
  try {
    st = statSync(abs)
  } catch {}
  if (!st?.isDirectory()) throw new TalkRouteError(`视频工程目录不存在: ${abs}`, 404)
  if (!existsSync(resolve(abs, 'script.json'))) throw new TalkRouteError(`该目录不是视频工程（缺少 script.json）: ${abs}`, 404)
  return abs
}

/** A media path inside the project (relative, or absolute but inside it). */
function resolveMediaInProject(projectDir, raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return ''
  if (s.length > 1024 || s.includes('\0')) throw new TalkRouteError('素材路径无效')
  const abs = isAbsolute(s) ? resolve(s) : resolve(projectDir, s)
  const rel = relative(projectDir, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new TalkRouteError('只能处理工程素材库里的文件')
  if (!existsSync(abs)) throw new TalkRouteError(`找不到素材文件：${s}`, 404)
  return abs
}

const bool = (v) => v === true || v === 'true' || v === 1 || v === '1'

/** Only known options / override shapes pass (talk-edit validates the values again). */
function cleanOptions(o) {
  if (!o || typeof o !== 'object') return undefined
  const out = {}
  for (const k of ['cutPauses', 'cutFillers', 'cutStutters', 'cutRetakes', 'cutNoise', 'enhanceVoice']) if (typeof o[k] === 'boolean') out[k] = o[k]
  for (const k of ['maxPauseSec', 'keepPauseSec', 'headPadSec', 'tailPadSec', 'fadeMs']) if (o[k] !== undefined && Number.isFinite(Number(o[k]))) out[k] = Number(o[k])
  if (typeof o.language === 'string') out.language = o.language
  return out
}

function cleanOverrides(o) {
  if (o === undefined) return undefined
  if (!o || typeof o !== 'object') return { restore: [], cutWords: [] }
  const restore = (Array.isArray(o.restore) ? o.restore : []).map((x) => String(x || '').slice(0, 64)).filter(Boolean).slice(0, 5000)
  const cutWords = (Array.isArray(o.cutWords) ? o.cutWords : [])
    .filter((r) => Array.isArray(r) && r.length >= 1)
    .map((r) => [Math.max(0, Math.floor(Number(r[0]) || 0)), Math.max(0, Math.floor(Number(r[1] ?? r[0]) || 0))])
    .slice(0, 5000)
  return { restore, cutWords }
}

function errorStatus(err) {
  const status = Number(err?.status)
  return err?.expose === true && Number.isInteger(status) && status >= 400 && status < 500 ? status : 500
}

const PROJECT_JOBS = new Map() // project dir (lower-case) → { jobId, kind, startedAt }
let installJob = null

function startProjectJob(createBackgroundJob, projectDir, kind, message, runner) {
  const key = projectDir.toLowerCase()
  const cur = PROJECT_JOBS.get(key)
  if (cur) throw new TalkRouteError(`这个工程正在${cur.label}，请等它完成`, 409, 'BUSY')
  const JOB_LABELS = {
    build: '生成口播剪辑',
    transcribe: '听写素材',
    footage: '分析素材镜头',
    highlight: '剪 Vlog 高光',
    pack: '更新口播包装',
    'template-fill': '套用模板',
    'template-suggest': '用 AI 写模板文字',
  }
  const label = JOB_LABELS[kind] || '识别和粗剪'
  PROJECT_JOBS.set(key, { kind, label, startedAt: Date.now() })
  const job = createBackgroundJob(message, async (onProgress) => {
    try {
      return await runner(onProgress)
    } finally {
      PROJECT_JOBS.delete(key)
    }
  })
  PROJECT_JOBS.set(key, { kind, label, startedAt: Date.now(), jobId: job.id })
  return job
}

/** A plaza template id from a request (a slug: anything else could walk out of the plaza folders). */
function templateIdOf(raw) {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!id) throw new TalkRouteError('缺少模板 id')
  if (!isValidPlazaTemplateId(id)) throw new TalkRouteError('模板 id 无效')
  return id
}

/** The fills of a 模板填空 request: slot id → string, bounded. */
function cleanFillsBody(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let n = 0
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 2000) break
    if (typeof k !== 'string' || !/^(film|s\d{1,3})\.[A-Za-z.\d]{1,40}$/.test(k) || typeof v !== 'string') continue
    out[k] = v.slice(0, 400)
    n++
  }
  return out
}

/** Lean summary of a rough cut for the job result (the panel reloads talk/state for the full plan). */
function roughcutSummary(res) {
  return {
    ok: true,
    summary: res.summary,
    source: res.doc?.source || null,
    stats: res.plan?.stats || null,
    removals: (res.plan?.removals || []).length,
    captions: (res.captions || []).length,
    render: res.doc?.render || null,
    language: res.transcript?.language || '',
  }
}

/**
 * Returns a Response for the talk / asr routes, or null when the path is not one of them.
 * @param {{ createBackgroundJob: (message: string, runner: (onProgress: Function) => Promise<any>) => { id: string } }} opts
 */
export async function handleTalkApiRequest(req, url = new URL(req.url, 'http://localhost'), opts = {}) {
  const { pathname } = url
  if (!isTalkRoute(pathname)) return null
  const createBackgroundJob = opts.createBackgroundJob
  try {
    if (pathname === '/api/video-workbench/asr/status') {
      const deep = bool(url.searchParams.get('deep'))
      const asr = await getAsrStatus({ deep, force: deep })
      return json({ ok: true, asr, installer: getAsrInstallerCatalog(), installing: installJob ? { jobId: installJob.id } : null })
    }
    if (pathname === '/api/video-workbench/asr/install') {
      if (installJob) throw new TalkRouteError('本地语音识别正在安装中，请等它完成', 409, 'BUSY')
      const body = await readBody(req)
      const installDir = typeof body.installDir === 'string' ? body.installDir.trim().slice(0, 400) : ''
      if (installDir && !isAbsolute(installDir)) throw new TalkRouteError('安装目录要写完整路径，例如 D:/dsh-ai/asr')
      const mirror = body.mirror === 'global' ? 'global' : 'cn'
      const job = createBackgroundJob('📦 正在安装本地语音识别（SenseVoice，约 260 MB）...', async (onProgress) => {
        try {
          return await installAsrEngine({ installDir, mirror, writeEnv: body.writeEnv !== false, onProgress })
        } finally {
          installJob = null
        }
      })
      installJob = job
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/talk/state') {
      const projectDir = resolveProjectDir(url.searchParams.get('projectDir'))
      const source = url.searchParams.get('source') ? resolveMediaInProject(projectDir, url.searchParams.get('source')) : ''
      const state = await readTalkEditState(projectDir, { sourcePath: source })
      const job = PROJECT_JOBS.get(projectDir.toLowerCase()) || null
      return json({ ...state, job })
    }
    if (pathname === '/api/video-workbench/footage/state') {
      const projectDir = resolveProjectDir(url.searchParams.get('projectDir'))
      const job = PROJECT_JOBS.get(projectDir.toLowerCase()) || null
      return json({ ...footageState(projectDir), job })
    }
    if (pathname === '/api/video-workbench/highlight/state') {
      const projectDir = resolveProjectDir(url.searchParams.get('projectDir'))
      const job = PROJECT_JOBS.get(projectDir.toLowerCase()) || null
      return json({ ...highlightState(projectDir), job })
    }
    if (pathname === '/api/video-workbench/plaza/slots') {
      const templateId = templateIdOf(url.searchParams.get('id'))
      const rawDir = url.searchParams.get('projectDir')
      const projectDir = rawDir ? resolveProjectDir(rawDir) : ''
      const slots = describeTemplateSlots(templateId)
      let last = null
      if (projectDir) {
        try {
          const tf = readScriptJson(projectDir).data?.templateFill
          if (tf && tf.templateId === templateId) last = tf
        } catch {}
      }
      const job = projectDir ? PROJECT_JOBS.get(projectDir.toLowerCase()) || null : null
      return json({ ...slots, library: projectDir ? templateFillLibrary(projectDir) : null, last, job })
    }
    const body = await readBody(req)
    const projectDir = resolveProjectDir(body.projectDir)
    if (pathname === '/api/video-workbench/plaza/fill') {
      const templateId = templateIdOf(body.templateId)
      const fills = cleanFillsBody(body.fills)
      const autoFillMedia = body.autoFillMedia !== false && body.autoFillMedia !== 'false'
      const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 200) : ''
      const job = startProjectJob(createBackgroundJob, projectDir, 'template-fill', '🧩 正在套用模板（换上你的文字和素材，本地运行，不花钱）...', async (onProgress) =>
        fillTemplateIntoProject({
          projectDir,
          templateId,
          fills,
          autoFillMedia,
          topic,
          onProgress: (p) => onProgress?.({ progress: Math.max(4, Math.min(99, Number(p.pct) || 0)), message: p.message || '' }),
        }),
      )
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/plaza/fill-suggest') {
      const templateId = templateIdOf(body.templateId)
      const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 300) : ''
      if (!topic) throw new TalkRouteError('请先写一句话说明这条视频讲什么')
      const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 400) : ''
      const job = startProjectJob(createBackgroundJob, projectDir, 'template-suggest', '✍️ 正在请 AI 按模板写文字（会调用你配置的大模型）...', async (onProgress) =>
        suggestTemplateTexts({
          templateId,
          topic,
          notes,
          onProgress: (p) => onProgress?.({ progress: Math.max(4, Math.min(99, Number(p.pct) || 0)), message: p.message || '' }),
          onWait: (w) => onProgress?.({ message: w?.hostAgent ? '正在等当前智能体写模板文字…' : `AI 正在写模板文字…（已等 ${Math.round((Number(w?.elapsedMs) || 0) / 1000)} 秒）` }),
        }),
      )
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/highlight/build') {
      const order = body.order === 'best' ? 'best' : 'story'
      const aspect = ['auto', '16:9', '9:16', '1:1'].includes(body.aspect) ? body.aspect : 'auto'
      const targetSec = Number(body.targetSec) > 0 ? Math.max(6, Math.min(90, Number(body.targetSec))) : 0
      const musicAssetId = typeof body.musicAssetId === 'string' ? body.musicAssetId.slice(0, 120) : ''
      const title = typeof body.title === 'string' ? body.title.trim().slice(0, 20) : ''
      const render = bool(body.render)
      const job = startProjectJob(createBackgroundJob, projectDir, 'highlight', '🎬 正在剪 Vlog 高光（按音乐节拍挑片段，本地运行，不花钱）...', async (onProgress) => {
        const res = await buildHighlightProject({ projectDir, musicAssetId, targetSec, order, aspect, title, onProgress: (p) => onProgress?.({ progress: Math.max(4, Math.min(render ? 60 : 99, Math.round((Number(p.progress) || 0) * (render ? 0.6 : 1)))), message: p.message || '' }) })
        let rendered = null
        if (render && typeof opts.renderProject === 'function') {
          onProgress?.({ progress: 62, message: '正在渲染成片（画面 + 配乐）...' })
          rendered = await opts.renderProject({
            projectDir,
            onProgress: (p) => {
              const pct = p && typeof p === 'object' ? Number(p.progress ?? p.pct) : NaN
              onProgress?.({ progress: Number.isFinite(pct) ? Math.max(62, Math.min(99, 62 + pct * 0.37)) : 80, message: p?.message || '渲染中...' })
            },
          })
        }
        const { script, ...rest } = res
        return { ...rest, ...(rendered ? { outputPath: rendered.outputPath || '', qaPassed: rendered.qaReport ? rendered.qaReport.passed !== false : null } : {}), state: highlightState(projectDir) }
      })
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/footage/index') {
      const assetIds = Array.isArray(body.assetIds) ? body.assetIds.map((x) => String(x || '').slice(0, 120)).filter(Boolean).slice(0, 500) : null
      const transcribe = body.transcribe === 'off' ? 'off' : 'auto'
      const job = startProjectJob(createBackgroundJob, projectDir, 'footage', '🎞 正在分析素材镜头（本地运行，不花钱）...', async (onProgress) => {
        const res = await indexFootage({ projectDir, assetIds, force: bool(body.force), transcribe, onProgress: (p) => onProgress?.({ progress: Math.max(5, Math.min(99, Number(p.progress) || 0)), message: p.message || '' }) })
        return { ...res, state: footageState(projectDir) }
      })
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/talk/pack') {
      const key = projectDir.toLowerCase()
      if (PROJECT_JOBS.get(key)) throw new TalkRouteError(`这个工程正在${PROJECT_JOBS.get(key).label}，请等它完成`, 409, 'BUSY')
      // async (the panel): re-planning a built cut may render a talking anime presenter (local model / cloud), minutes
      if (bool(body.async)) {
        const job = startProjectJob(createBackgroundJob, projectDir, 'pack', '正在更新口播包装…', async (onProgress) => {
          const saved = await saveTalkPackSettings(projectDir, body.pack || {}, { onProgress })
          const state = await readTalkEditState(projectDir, {})
          return { ok: true, ...saved, pack: state.pack }
        })
        return json({ ok: true, async: true, jobId: job.id, job })
      }
      const saved = await saveTalkPackSettings(projectDir, body.pack || {})
      const state = await readTalkEditState(projectDir, {})
      return json({ ok: true, ...saved, pack: state.pack })
    }
    if (pathname === '/api/video-workbench/talk/transcribe') {
      const media = resolveMediaInProject(projectDir, body.mediaPath)
      if (!media) throw new TalkRouteError('请选择要听写的视频或音频')
      const language = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'].includes(body.language) ? body.language : 'auto'
      const job = startProjectJob(createBackgroundJob, projectDir, 'transcribe', '🎧 正在听写（本地语音识别）...', async (onProgress) => {
        const t = await transcribeMedia({ mediaPath: media, projectDir, language, force: bool(body.force), onProgress })
        const plan = planRoughCut(t, { fps: 30, cutPauses: false, cutFillers: false, cutStutters: false, cutRetakes: false, cutNoise: false, headPadSec: 0, tailPadSec: 0 })
        const caps = buildCaptions({ ...plan, keep: [{ start: 0, end: Math.max(plan.sourceDurationSec, t.durationSec) }], options: { fps: 30 } }, { maxLineWidth: 16, fps: 30 })
        const dir = join(projectDir, 'assets', 'transcripts')
        mkdirSync(dir, { recursive: true })
        const stem = basename(media).replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 60) || 'media'
        const srtPath = join(dir, `${stem}.srt`)
        const txtPath = join(dir, `${stem}.txt`)
        const text = transcriptPlainText(t)
        writeFileSync(srtPath, captionsToSrt(caps), 'utf8')
        writeFileSync(txtPath, `${text}\n`, 'utf8')
        return { ok: true, text, language: t.language, durationSec: t.durationSec, segments: t.segments.length, srt: relative(projectDir, srtPath).replace(/\\/g, '/'), txt: relative(projectDir, txtPath).replace(/\\/g, '/') }
      })
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    const sourcePath = body.sourcePath ? resolveMediaInProject(projectDir, body.sourcePath) : ''
    const options = cleanOptions(body.options)
    const overrides = cleanOverrides(body.overrides)
    if (pathname === '/api/video-workbench/talk/roughcut') {
      const render = bool(body.render)
      const job = startProjectJob(createBackgroundJob, projectDir, 'roughcut', '🎙 正在识别口播并规划粗剪（本地运行，不花钱）...', async (onProgress) =>
        roughcutSummary(await runTalkRoughCut({ projectDir, sourcePath, options, overrides, render, force: bool(body.force), onProgress })),
      )
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    if (pathname === '/api/video-workbench/talk/build') {
      const target = Number(body.sceneTargetSec)
      const job = startProjectJob(createBackgroundJob, projectDir, 'build', '✂️ 正在生成口播剪辑工程...', async (onProgress) => {
        const res = await buildTalkEditProject({
          projectDir,
          sourcePath,
          options,
          overrides,
          sceneTargetSec: Number.isFinite(target) && target >= 3 && target <= 30 ? target : undefined,
          title: typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '',
          pack: body.pack !== undefined ? cleanTalkPackSettings(body.pack) || {} : undefined,
          onProgress,
        })
        return { ...roughcutSummary(res), scenes: res.scenes, captionsCount: res.captionsCount }
      })
      return json({ ok: true, async: true, jobId: job.id, job })
    }
    return json({ ok: false, error: `Route not found: ${pathname}` }, 404)
  } catch (err) {
    return json({ ok: false, error: err?.message || String(err), code: err?.code || undefined }, errorStatus(err))
  }
}
