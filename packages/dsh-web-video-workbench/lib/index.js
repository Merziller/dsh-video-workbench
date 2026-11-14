import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeSafeZonePreflight,
  loadEnv,
  readScriptJson,
  REPO_ROOT,
  resolveEnvPath,
  resolveVideoDimensions,
  writeScriptJson,
} from '@dsh-video/shared'
import {
  cloneRecordedVoice,
  executeGenerateSpeech,
  getTtsServerHealth,
  getVoiceCatalog,
  importVoicePack,
  matchAllScenesInScript,
} from '@dsh-video/tool-local-tts'
import {
  executeVideoLint,
  executeVideoRender,
  executeVideoSnapshot,
  runPostRenderQa,
} from '@dsh-video/tool-video-suite'
import {
  callLlmChat,
  exportPublishPack,
  generateAiCodedBgmTrack,
  getAiCodingHistory,
  getSafeLlmConfigSummary,
  importAssets,
  masterVoiceTracks,
  mixVideoAudio,
  planVideoFromAssets,
  produceFullVideo,
  readAssets,
  refineAiScene,
  removeAsset,
  renderVendorClipIsolated,
  rollbackAiVersion,
  runAiStudioPipeline,
  saveLlmConfig,
  saveUploadedAsset,
  summarizeAssets,
  syncProjectCodeFromScript,
  synthesizeTtsEngineAudioCue,
  testLlmConnection,
  updateAsset,
} from '@dsh-video/tool-media'
import {
  scaffoldVideoProject,
  VIDEO_MAKER_SYSTEM_PROMPT,
} from '@dsh-video/preset-video'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.md': 'text/markdown; charset=utf-8',
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

async function parseRequestJson(req) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

export function getWorkspaceRoot() {
  loadEnv()
  const dir = resolveEnvPath('DSH_VIDEO_WORKSPACE', './examples')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * List all video projects in `DSH_VIDEO_WORKSPACE` (ensuring starter demo projects exist).
 */
export function listVideoProjects() {
  const wsRoot = getWorkspaceRoot()
  const demoDir = join(wsRoot, 'demo-html-project')
  if (!existsSync(join(demoDir, 'script.json'))) {
    scaffoldVideoProject(demoDir, {
      title: 'DeepSeek Harness 双引擎视频工作台演示 (HTML5 动效)',
      engine: 'html',
    })
  }
  const demoRemotionDir = join(wsRoot, 'demo-remotion-project')
  if (!existsSync(join(demoRemotionDir, 'script.json'))) {
    scaffoldVideoProject(demoRemotionDir, {
      title: 'DeepSeek Harness 双引擎视频工作台演示 (Remotion)',
      engine: 'remotion',
    })
  }

  const projects = []
  for (const entry of readdirSync(wsRoot)) {
    const fullDir = join(wsRoot, entry)
    if (!statSync(fullDir).isDirectory()) continue
    const scriptPath = join(fullDir, 'script.json')
    if (!existsSync(scriptPath)) continue
    try {
      const { data } = readScriptJson(fullDir)
      const hasMp4 = existsSync(join(fullDir, 'output', 'final.mp4'))
      const hasSnapshot = existsSync(join(fullDir, 'output', 'snapshot-3x3.png'))
      const hasMasterAudio = existsSync(join(fullDir, 'output', 'master-audio.wav'))
      const assets = readAssets(fullDir)
      projects.push({
        id: entry,
        name: data.title || entry,
        projectDir: fullDir,
        engine: data.engine || 'html',
        style: data.style || 'tech',
        fps: data.fps || 30,
        totalDurationSec: data.totalDurationSec || 0,
        totalDurationInFrames: data.totalDurationInFrames || 0,
        sceneCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
        assetCount: Array.isArray(assets.items) ? assets.items.length : 0,
        voiceMode: data.voiceMode || 'auto',
        defaultVoiceId: data.defaultVoiceId || 'auto',
        hasMp4,
        hasSnapshot,
        hasMasterAudio,
        updatedAt: data.updatedAt || null,
      })
    } catch {}
  }
  return { workspaceRoot: wsRoot, projects }
}

/**
 * Stream a file cleanly with HTTP Byte-Range support so HTML5 `<video>` and `<audio>` can seek smoothly.
 */
function serveFileWithRange(req, filePath, contentType) {
  const st = statSync(filePath)
  const total = st.size
  const rangeHeader = req.headers?.get?.('range') || req.headers?.range || ''

  if (rangeHeader && typeof rangeHeader === 'string') {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0
      let end = match[2] ? parseInt(match[2], 10) : total - 1
      if (!match[1] && match[2]) {
        start = Math.max(0, total - parseInt(match[2], 10))
        end = total - 1
      }
      start = Math.max(0, Math.min(start, Math.max(0, total - 1)))
      end = Math.max(start, Math.min(end, Math.max(0, total - 1)))
      const chunkSize = total === 0 ? 0 : end - start + 1
      const buf = Buffer.alloc(chunkSize)
      if (chunkSize > 0) {
        const fd = openSync(filePath, 'r')
        try {
          readSync(fd, buf, 0, chunkSize, start)
        } finally {
          closeSync(fd)
        }
      }
      return new Response(buf, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Cache-Control': 'no-cache',
        },
      })
    }
  }

  const buf = readFileSync(filePath)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(total),
      'Cache-Control': 'no-cache',
    },
  })
}

const ASYNC_JOBS = new Map()

function createBackgroundJob(initialMessage, runner) {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const job = { id, status: 'running', stage: 'init', progress: 4, message: initialMessage, result: null, error: '' }
  ASYNC_JOBS.set(id, job)
  if (ASYNC_JOBS.size > 40) {
    const firstKey = ASYNC_JOBS.keys().next().value
    if (firstKey) ASYNC_JOBS.delete(firstKey)
  }
  const handleProgress = (payload) => {
    if (!payload) return
    if (typeof payload === 'string') {
      job.message = payload
      const m = /(\d+)%/.exec(payload)
      if (m) job.progress = Math.max(job.progress, Math.min(99, Number(m[1])))
      return
    }
    if (typeof payload === 'object') {
      if (payload.stage) job.stage = payload.stage
      if (Number.isFinite(Number(payload.progress))) job.progress = Number(payload.progress)
      if (payload.message) job.message = String(payload.message)
    }
  }
  Promise.resolve()
    .then(() => runner(handleProgress))
    .then((res) => {
      job.status = 'done'
      job.stage = 'done'
      job.progress = 100
      job.result = res
      job.message = '处理完成'
    })
    .catch((err) => {
      job.status = 'error'
      job.error = err?.message || String(err)
      job.message = job.error
    })
  return job
}

function readOptionalJson(filePath) {
  try {
    if (existsSync(filePath)) return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {}
  return null
}

function collectProjectSourceFiles(projectDir) {
  const absDir = resolve(projectDir)
  const files = []
  const pushFile = (relPath) => {
    const full = join(absDir, relPath)
    if (!existsSync(full)) return
    try {
      const content = readFileSync(full, 'utf8')
      files.push({ path: relPath.replace(/\\/g, '/'), size: content.length, content: content.slice(0, 80_000) })
    } catch {}
  }
  const srcDir = join(absDir, 'src')
  if (existsSync(srcDir)) {
    const walk = (dir, prefix = 'src') => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === 'node_modules') continue
        const rel = `${prefix}/${ent.name}`
        if (ent.isDirectory()) walk(join(dir, ent.name), rel)
        else if (/\.(tsx|ts|jsx|js|json)$/i.test(ent.name)) pushFile(rel)
      }
    }
    walk(srcDir)
  }
  pushFile('index.html')
  pushFile('plan.json')
  pushFile('plan.resolved.json')
  pushFile('audio/ai_bgm_synth.js')
  pushFile('output/timing-contract.json')
  pushFile('output/ai_build_log.json')
  pushFile('output/qa_report.json')
  return files
}

/**
 * Handle API calls from the frontend Video Workbench UI (`/api/video-workbench/*`).
 */
export async function handleWorkbenchApiRequest(req) {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  try {
    // 0. GET /api/video-workbench/jobs (poll async produce/render job)
    if (pathname === '/api/video-workbench/jobs' && req.method === 'GET') {
      const id = url.searchParams.get('id') || ''
      const job = ASYNC_JOBS.get(id)
      if (!job) {
        return jsonResponse({ ok: false, error: 'Job not found' }, 404)
      }
      return jsonResponse({ ok: true, job })
    }
    // 1. GET /api/video-workbench/state
    if (pathname === '/api/video-workbench/state' && req.method === 'GET') {
      const { workspaceRoot, projects } = listVideoProjects()
      const requestedProject = url.searchParams.get('projectDir') || projects[0]?.projectDir || ''
      let activeProject = null
      if (requestedProject && existsSync(join(requestedProject, 'script.json'))) {
        const { data } = readScriptJson(requestedProject)
        const manifest = readAssets(requestedProject)
        activeProject = {
          projectDir: requestedProject,
          script: data,
          assets: manifest.items || [],
          notes: manifest.notes || [],
          assetSummary: summarizeAssets(manifest),
          hasMp4: existsSync(join(requestedProject, 'output', 'final.mp4')),
          hasSnapshot: existsSync(join(requestedProject, 'output', 'snapshot-3x3.png')),
          hasMasterAudio: existsSync(join(requestedProject, 'output', 'master-audio.wav')),
          qaReport: readOptionalJson(join(requestedProject, 'output', 'qa_report.json')),
          buildLog: readOptionalJson(join(requestedProject, 'output', 'ai_build_log.json')),
          historyCount: getAiCodingHistory(requestedProject).length,
        }
      }
      const catalog = getVoiceCatalog()
      const ttsStatus = await getTtsServerHealth()
      return jsonResponse({
        ok: true,
        workspaceRoot,
        projects,
        activeProject,
        llmConfig: getSafeLlmConfigSummary(),
        voiceCatalog: catalog.voices,
        voiceCategories: catalog.categories,
        availableEmotions: Object.keys(catalog.emotionReferences),
        ttsStatus,
        presetId: 'video-maker',
        presetName: '视频制作模式',
      })
    }

    // 1c. GET / POST /api/video-workbench/llm-config & POST /llm-test
    if (pathname === '/api/video-workbench/llm-config' && req.method === 'GET') {
      return jsonResponse({ ok: true, config: getSafeLlmConfigSummary() })
    }
    if (pathname === '/api/video-workbench/llm-config' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const saved = saveLlmConfig(body)
      return jsonResponse({ ok: true, config: saved })
    }
    if (pathname === '/api/video-workbench/llm-test' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const testRes = await testLlmConnection(body)
      return jsonResponse({ ok: true, ...testRes })
    }

    // 1b. GET /api/video-workbench/voices/preview?id=...
    if (pathname === '/api/video-workbench/voices/preview' && req.method === 'GET') {
      const voiceId = url.searchParams.get('id') || ''
      const catalog = getVoiceCatalog()
      const hit = catalog.voices.find((v) => v.id === voiceId)
      if (!hit || !hit.resolvedRefPath || !existsSync(hit.resolvedRefPath)) {
        return new Response('Voice reference audio not found', { status: 404 })
      }
      const ext = extname(hit.resolvedRefPath).toLowerCase()
      if (ext === '.pt') {
        return jsonResponse(
          {
            ok: false,
            error: 'IndexTTS .pt 音色向量文件暂无原声直出流，请为分镜配音后试听生成效果。',
          },
          400,
        )
      }
      return serveFileWithRange(req, hit.resolvedRefPath, MIME_MAP[ext] || 'audio/wav')
    }

    // 2. POST /api/video-workbench/projects (create new project)
    if (pathname === '/api/video-workbench/projects' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const wsRoot = getWorkspaceRoot()
      const slug =
        String(body.slug || body.title || `video-project-${Date.now()}`)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
          .replace(/^-+|-+$/g, '') || `video-${Date.now()}`
      const projectDir = join(wsRoot, slug)
      const dims = resolveVideoDimensions({
        aspectRatio: body.aspectRatio || 'auto',
        quality: body.quality || '1080p',
        width: body.width,
        height: body.height,
        topic: body.title || body.goal || '',
      })
      const created = scaffoldVideoProject(projectDir, {
        title: body.title || '新建双引擎视频项目',
        engine: body.engine || 'html',
        style: body.style || 'tech',
        audience: body.audience || '通用受众',
        goal: body.goal || '带有文案、配音、音效、动效、音乐与字幕的完整成片',
        voiceMode: body.voiceMode || 'auto',
        defaultVoiceId: body.defaultVoiceId || 'auto',
      })
      const patched = writeScriptJson(projectDir, {
        ...created.script,
        width: dims.width,
        height: dims.height,
        aspectRatio: dims.aspectRatio,
        requestedAspectRatio: dims.requestedAspectRatio,
        quality: dims.quality,
        dimensionReason: dims.reason,
        aiBadge: body.aiBadge !== undefined ? Boolean(body.aiBadge) : true,
        targetPlatform: body.targetPlatform || 'universal',
        bgmMode: body.bgmMode || 'auto',
        creationMode: body.creationMode || 'ai-coded',
      })
      matchAllScenesInScript(projectDir, { voiceId: body.defaultVoiceId || 'auto' })
      const reloaded = readScriptJson(projectDir)
      syncProjectCodeFromScript(projectDir, reloaded.data, { forceOverwrite: true })
      return jsonResponse({
        ok: true,
        projectDir: created.projectDir,
        script: reloaded.data,
      })
    }

    // 2b. POST /api/video-workbench/projects/delete (delete custom project inside workspaceRoot)
    if (pathname === '/api/video-workbench/projects/delete' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      const wsRoot = resolve(getWorkspaceRoot())
      const targetDir = resolve(body.projectDir)
      const folderName = basename(targetDir)
      const protectedNames = new Set(['demo-html-project', 'demo-remotion-project'])
      if (protectedNames.has(folderName)) {
        return jsonResponse({ ok: false, error: '内置演示示例不可删除' }, 400)
      }
      if (!targetDir.startsWith(wsRoot + '\\') && !targetDir.startsWith(wsRoot + '/')) {
        return jsonResponse({ ok: false, error: '仅允许删除工作区内的自定义项目' }, 403)
      }
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true })
      }
      return jsonResponse({
        ok: true,
        workspaceRoot: wsRoot,
        projects: listVideoProjects(),
      })
    }

    // 3. POST /api/video-workbench/script (save script.json & sync HTML/Remotion files)
    if (pathname === '/api/video-workbench/script' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.script) {
        return jsonResponse({ ok: false, error: 'projectDir and script are required' }, 400)
      }
      const saved = writeScriptJson(body.projectDir, body.script)
      if (body.regenerateHtml !== false && body.regenerateCode !== false) {
        syncProjectCodeFromScript(saved.projectDir, saved.data)
      }
      return jsonResponse({
        ok: true,
        projectDir: saved.projectDir,
        script: saved.data,
      })
    }

    // 3b. POST /api/video-workbench/assets/import (import local folders/files by path)
    if (pathname === '/api/video-workbench/assets/import' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.sources) {
        return jsonResponse({ ok: false, error: 'projectDir and sources are required' }, 400)
      }
      const res = await importAssets({
        projectDir: body.projectDir,
        sources: body.sources,
      })
      const manifest = readAssets(body.projectDir)
      return jsonResponse({
        ok: true,
        ...res,
        manifest,
        summary: summarizeAssets(manifest),
      })
    }

    // 3c. POST /api/video-workbench/assets/upload (upload browser-picked files/folders)
    if (pathname === '/api/video-workbench/assets/upload' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const { projectDir, files } = body
      if (!projectDir || !Array.isArray(files) || files.length === 0) {
        return jsonResponse({ ok: false, error: 'projectDir and files[] are required' }, 400)
      }
      const savedPaths = []
      for (const file of files) {
        if (!file?.name || typeof file.dataBase64 !== 'string') continue
        const cleanB64 = file.dataBase64.replace(/^data:[^;]+;base64,/, '')
        const buf = Buffer.from(cleanB64, 'base64')
        const savedPath = await saveUploadedAsset(projectDir, file.name, buf)
        savedPaths.push(savedPath)
      }
      const res = await importAssets({
        projectDir,
        sources: savedPaths,
      })
      const manifest = readAssets(projectDir)
      return jsonResponse({
        ok: true,
        uploadedCount: savedPaths.length,
        ...res,
        manifest,
        summary: summarizeAssets(manifest),
      })
    }

    // 3d. POST /api/video-workbench/assets/delete (remove an imported asset)
    if (pathname === '/api/video-workbench/assets/delete' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.assetId) {
        return jsonResponse({ ok: false, error: 'projectDir and assetId are required' }, 400)
      }
      removeAsset(body.projectDir, body.assetId)
      const manifest = readAssets(body.projectDir)
      return jsonResponse({
        ok: true,
        manifest,
        summary: summarizeAssets(manifest),
      })
    }

    // 3e. POST /api/video-workbench/plan (AI plan storyboard from assets + topic)
    if (pathname === '/api/video-workbench/plan' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      const res = await planVideoFromAssets(body)
      if (body.targetPlatform || body.bgmMode || body.creationMode) {
        const cur = readScriptJson(body.projectDir)
        const updated = writeScriptJson(body.projectDir, {
          ...cur.data,
          ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
          ...(body.bgmMode && body.bgmMode !== 'auto'
            ? { bgmMode: body.bgmMode, audioSpec: { ...(cur.data.audioSpec || {}), bgmMode: body.bgmMode } }
            : {}),
          ...(body.creationMode ? { creationMode: body.creationMode } : {}),
        })
        syncProjectCodeFromScript(body.projectDir, updated.data)
        res.script = updated.data
      }
      return jsonResponse({
        ok: true,
        ...res,
      })
    }

    // 3f. POST /api/video-workbench/produce (Local Draft 0-token pipeline)
    if (pathname === '/api/video-workbench/produce' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      if (body.async) {
        const job = createBackgroundJob('正在生成本地演练草稿...', (onProgress) =>
          produceFullVideo({ ...body, onProgress }),
        )
        return jsonResponse({ ok: true, jobId: job.id })
      }
      const res = await produceFullVideo(body)
      return jsonResponse({
        ok: true,
        ...res,
      })
    }

    // 3g. POST /api/video-workbench/ai-produce (Model-Agnostic LLM Coding Studio pipeline)
    if (pathname === '/api/video-workbench/ai-produce' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      if (body.async) {
        const job = createBackgroundJob('正在启动大模型创意编程工作流...', (onProgress) =>
          runAiStudioPipeline({ ...body, onProgress }),
        )
        return jsonResponse({ ok: true, jobId: job.id })
      }
      const res = await runAiStudioPipeline(body)
      return jsonResponse({ ok: true, ...res })
    }

    // 3h. POST /api/video-workbench/ai-refine (natural language refine OR rollback snapshot)
    if (pathname === '/api/video-workbench/ai-refine' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      if (body.rollback) {
        return jsonResponse(rollbackAiVersion(body.projectDir))
      }
      if (body.async) {
        const job = createBackgroundJob('正在按您的反馈让大模型精修分镜代码...', (onProgress) =>
          refineAiScene({ ...body, onProgress }),
        )
        return jsonResponse({ ok: true, jobId: job.id })
      }
      return jsonResponse(await refineAiScene(body))
    }

    // 3i. GET /api/video-workbench/code & POST /qa
    if (pathname === '/api/video-workbench/code' && req.method === 'GET') {
      const projectDir = url.searchParams.get('projectDir') || ''
      if (!projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      return jsonResponse({
        ok: true,
        files: collectProjectSourceFiles(projectDir),
        history: getAiCodingHistory(projectDir),
      })
    }
    if (pathname === '/api/video-workbench/qa' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      const { data } = readScriptJson(body.projectDir)
      const qa = await runPostRenderQa({ projectDir: body.projectDir, mp4Path: body.mp4Path, script: data })
      return jsonResponse({ ok: true, qa })
    }

    // 4. POST /api/video-workbench/voices/import (import custom voice pack via path or uploaded file)
    if (pathname === '/api/video-workbench/voices/import' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const importPayload = { ...body }
      if (!importPayload.sourcePath && body.dataBase64 && body.fileName) {
        const uploadDir = join(REPO_ROOT, 'voice-packs', 'imported', '_uploads')
        mkdirSync(uploadDir, { recursive: true })
        const safeName = basename(String(body.fileName)).replace(/[<>:"/\\|?*]+/g, '_') || `voice-${Date.now()}.wav`
        const stagedPath = join(uploadDir, `${Date.now()}-${safeName}`)
        const cleanB64 = String(body.dataBase64).replace(/^data:[^;]+;base64,/, '')
        writeFileSync(stagedPath, Buffer.from(cleanB64, 'base64'))
        importPayload.sourcePath = stagedPath
        if (!importPayload.name) {
          importPayload.name = safeName.replace(/\.[^.]+$/, '')
        }
      }
      const res = await importVoicePack(importPayload)
      const catalog = getVoiceCatalog()
      return jsonResponse({
        ok: true,
        ...res,
        voiceCatalog: catalog.voices,
        voiceCategories: catalog.categories,
      })
    }

    // 4b. POST /api/video-workbench/voices/clone-upload (mic WebM or uploaded local audio -> FFmpeg normalized 24kHz WAV clone)
    if (pathname === '/api/video-workbench/voices/clone-upload' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const res = await cloneRecordedVoice(body)
      const catalog = getVoiceCatalog()
      return jsonResponse({
        ok: true,
        ...res,
        voiceCatalog: catalog.voices,
        voiceCategories: catalog.categories,
      })
    }

    // 4c. POST /api/video-workbench/voices/clone-preview (live audition of cloned/selected voice via IndexTTS-2.5)
    if (pathname === '/api/video-workbench/voices/clone-preview' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const previewDir = join(REPO_ROOT, 'voice-packs', 'imported', '_previews')
      mkdirSync(previewDir, { recursive: true })
      const previewWav = join(previewDir, `audition-${Date.now()}.wav`)
      const auditionText =
        String(body.text || '').trim() ||
        '你好，这是用你的声音实时克隆合成的效果试听，音色自然清晰，适合短视频与知识口播旁白。'
      const synth = await executeGenerateSpeech({
        text: auditionText,
        voiceId: body.voiceId || 'auto',
        emotion: body.emotion || '平静',
        outputPath: previewWav,
      })
      const wavB64 = existsSync(synth.audioPath || previewWav)
        ? readFileSync(synth.audioPath || previewWav).toString('base64')
        : ''
      try { rmSync(previewWav, { force: true }) } catch {}
      return jsonResponse({
        ok: true,
        voiceUsed: synth.voiceUsed,
        durationSec: synth.durationSec,
        audioDataUrl: wavB64 ? `data:audio/wav;base64,${wavB64}` : '',
      })
    }

    // 4d. POST /api/video-workbench/bgm/upload (dedicated BGM uploader + script bgmMode binder)
    if (pathname === '/api/video-workbench/bgm/upload' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.fileName || !body.dataBase64) {
        return jsonResponse({ ok: false, error: 'projectDir, fileName, and dataBase64 are required' }, 400)
      }
      const cleanB64 = String(body.dataBase64).replace(/^data:[^;]+;base64,/, '')
      const buf = Buffer.from(cleanB64, 'base64')
      const safeName = `bgm-${basename(body.fileName)}`
      const savedPath = await saveUploadedAsset(body.projectDir, safeName, buf)
      const imp = await importAssets({ projectDir: body.projectDir, sources: [savedPath] })
      const manifestBefore = readAssets(body.projectDir)
      const uploadedItem =
        manifestBefore.items.find((x) => x.id === imp.added?.[0]?.id) ||
        manifestBefore.items.find((x) => x.type === 'audio' && (x.originalName === safeName || x.originalName === basename(body.fileName))) ||
        manifestBefore.items.find((x) => x.role === 'music' || x.type === 'audio')
      if (!uploadedItem) {
        return jsonResponse({ ok: false, error: '上传文件未识别为有效音频格式 (.mp3/.wav/.flac/.m4a/.ogg/.aac)' }, 400)
      }
      const patchedAsset = updateAsset(body.projectDir, uploadedItem.id, {
        role: 'music',
        description: body.description || '用户自由上传的背景音乐 BGM',
      })
      const { data } = readScriptJson(body.projectDir)
      data.bgmMode = 'uploaded'
      data.audioSpec = { ...(data.audioSpec || {}), bgmMode: 'uploaded' }
      data.bgm = {
        ...(data.bgm || {}),
        enabled: true,
        mode: 'uploaded',
        uploadedPath: patchedAsset.path,
        path: patchedAsset.path,
        source: 'user-imported',
      }
      writeScriptJson(body.projectDir, data)
      const manifest = readAssets(body.projectDir)
      return jsonResponse({
        ok: true,
        asset: patchedAsset,
        assets: manifest.items || [],
        script: readScriptJson(body.projectDir).data,
      })
    }

    // 4e. POST /api/video-workbench/audio/llm-compose (AI LLM DSP code generation & WAV synthesis)
    if (pathname === '/api/video-workbench/audio/llm-compose' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      const { data } = readScriptJson(body.projectDir)
      const res = await generateAiCodedBgmTrack({
        projectDir: body.projectDir,
        script: data,
        callLlmChatFn: (p) => callLlmChat(p),
      })
      data.bgmMode = 'llm-coded'
      data.audioSpec = { ...(data.audioSpec || {}), bgmMode: 'llm-coded' }
      data.bgm = {
        ...(data.bgm || {}),
        enabled: true,
        mode: 'llm-coded',
        path: res.relWavPath,
        codeScriptPath: res.relScriptPath,
        source: 'llm-coded',
      }
      writeScriptJson(body.projectDir, data)
      return jsonResponse({
        ok: true,
        ...res,
        previewUrl: `/api/video-workbench/asset?projectDir=${encodeURIComponent(body.projectDir)}&rel=${encodeURIComponent(res.relWavPath)}&t=${Date.now()}`,
        script: readScriptJson(body.projectDir).data,
      })
    }

    // 4f. POST /api/video-workbench/audio/tts-compose (IndexTTS-2.5 atmospheric pad / hook / stinger)
    if (pathname === '/api/video-workbench/audio/tts-compose' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      const { data } = readScriptJson(body.projectDir)
      const res = await synthesizeTtsEngineAudioCue({
        projectDir: body.projectDir,
        promptText: body.promptText || `${data.title || '光影律动'} 沉浸式氛围人声`,
        voiceId: body.voiceId || data.defaultVoiceId || 'auto',
        mode: body.mode || 'bgm-pad',
        durationSec: Number(body.durationSec) || data.totalDurationSec || 10,
        emotion: body.emotion || '深沉空灵',
      })
      if (body.mode !== 'sfx-stinger') {
        data.bgmMode = 'tts-engine'
        data.audioSpec = { ...(data.audioSpec || {}), bgmMode: 'tts-engine' }
        data.bgm = {
          ...(data.bgm || {}),
          enabled: true,
          mode: 'tts-engine',
          path: res.relWavPath,
          source: 'tts-engine',
        }
        writeScriptJson(body.projectDir, data)
      }
      return jsonResponse({
        ok: true,
        ...res,
        previewUrl: `/api/video-workbench/asset?projectDir=${encodeURIComponent(body.projectDir)}&rel=${encodeURIComponent(res.relWavPath)}&t=${Date.now()}`,
        script: readScriptJson(body.projectDir).data,
      })
    }

    // 4g. POST /api/video-workbench/publish-pack (One-click platform export bundle)
    if (pathname === '/api/video-workbench/publish-pack' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      const res = await exportPublishPack({
        projectDir: body.projectDir,
        platform: body.platform || '',
      })
      const absProj = resolve(body.projectDir)
      const relCover = res.files.coverPath ? res.files.coverPath.replace(absProj, '').replace(/^[\\/]+/, '').replace(/\\/g, '/') : ''
      const relSnap = res.files.snapshotPath ? res.files.snapshotPath.replace(absProj, '').replace(/^[\\/]+/, '').replace(/\\/g, '/') : ''
      return jsonResponse({
        ok: true,
        ...res,
        coverUrl: relCover ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(absProj)}&rel=${encodeURIComponent(relCover)}&t=${Date.now()}` : '',
        snapshotUrl: relSnap ? `/api/video-workbench/asset?projectDir=${encodeURIComponent(absProj)}&rel=${encodeURIComponent(relSnap)}&t=${Date.now()}` : '',
      })
    }

    // 4h. POST /api/video-workbench/vendor/import (Isolated .motion ExternalClip importer)
    if (pathname === '/api/video-workbench/vendor/import' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.sourceDir) {
        return jsonResponse({ ok: false, error: 'projectDir and sourceDir are required' }, 400)
      }
      const { data } = readScriptJson(body.projectDir)
      const res = await renderVendorClipIsolated({
        projectDir: body.projectDir,
        sourceDir: body.sourceDir,
        name: body.name || '',
        version: body.version || '1.0.0',
        width: Number(body.width) || Number(data.width) || 1920,
        height: Number(body.height) || Number(data.height) || 1080,
        fps: Number(body.fps) || Number(data.fps) || 30,
        durationSec: Number(body.durationSec) || 4.0,
      })
      const manifest = readAssets(body.projectDir)
      return jsonResponse({
        ok: true,
        ...res,
        assets: manifest.items || [],
        assetSummary: summarizeAssets(manifest),
      })
    }

    // 4i. GET /api/video-workbench/safe-zone (Geometric platform safe-zone geometry & collisions)
    if (pathname === '/api/video-workbench/safe-zone' && req.method === 'GET') {
      const projectDir = url.searchParams.get('projectDir') || ''
      const platform = url.searchParams.get('platform') || ''
      if (!projectDir) return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      const { data } = readScriptJson(projectDir)
      const htmlPath = join(resolve(projectDir), 'index.html')
      const htmlContent = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : ''
      const preflight = computeSafeZonePreflight(data, { platform: platform || data.targetPlatform || 'universal', htmlContent })
      return jsonResponse({ ok: true, preflight })
    }

    // 5. POST /api/video-workbench/voices/match (AI auto-match or lock voice across scenes)
    if (pathname === '/api/video-workbench/voices/match' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      const matchRes = matchAllScenesInScript(body.projectDir, {
        voiceId: body.voiceId || 'auto',
        forceAuto: Boolean(body.forceAuto),
      })
      const reloaded = readScriptJson(body.projectDir)
      syncProjectCodeFromScript(reloaded.projectDir, reloaded.data)
      return jsonResponse({
        ok: true,
        ...matchRes,
        script: reloaded.data,
      })
    }

    // 6. POST /api/video-workbench/action (tts-scene, tts-all, mix, lint, snapshot, render)
    if (pathname === '/api/video-workbench/action' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const { action, projectDir } = body
      if (!projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }

      if (action === 'lint') {
        const result = await executeVideoLint({ projectDir, engine: body.engine })
        return jsonResponse({ ok: true, action, result })
      }

      if (action === 'mix') {
        const { data } = readScriptJson(projectDir)
        const result = await mixVideoAudio({ projectDir, script: data })
        return jsonResponse({ ok: true, action, result, script: data })
      }

      if (action === 'tts-scene') {
        const { data } = readScriptJson(projectDir)
        const scene = (data.scenes || []).find((s) => s.id === body.sceneId) || data.scenes?.[0]
        if (!scene) {
          return jsonResponse({ ok: false, error: 'Scene not found' }, 404)
        }
        const outWav = join(projectDir, 'audio', `${scene.id}.wav`)
        const result = await executeGenerateSpeech({
          text: body.text || scene.narration,
          emotion: body.emotion || scene.emotion || '平静',
          voiceId: body.voiceId || scene.voiceId || data.defaultVoiceId || 'auto',
          engine: body.ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts25',
          fps: data.fps || 30,
          outputPath: outWav,
          scriptPath: projectDir,
          sceneId: scene.id,
          allowPlaceholder: Boolean(body.allowPlaceholder),
        })
        if (body.autoMaster) {
          await masterVoiceTracks({
            projectDir,
            sceneIds: [scene.id],
            useLlm: body.useLlm !== false,
          })
        }
        const updated = readScriptJson(projectDir)
        syncProjectCodeFromScript(projectDir, updated.data)
        const mixResult = await mixVideoAudio({ projectDir, script: updated.data })
        return jsonResponse({ ok: true, action, result, mixResult, script: updated.data })
      }

      if (action === 'tts-all') {
        const runTtsAll = async (onProgress) => {
          const { data } = readScriptJson(projectDir)
          const scenes = data.scenes || []
          const results = []
          for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i]
            onProgress?.(`正在生成全片配音 (${i + 1}/${scenes.length}): ${scene.title || scene.id}`)
            const outWav = join(projectDir, 'audio', `${scene.id}.wav`)
            const res = await executeGenerateSpeech({
              text: scene.narration,
              emotion: scene.emotion || '平静',
              voiceId: scene.voiceId || data.defaultVoiceId || 'auto',
              engine: body.ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts25',
              fps: data.fps || 30,
              outputPath: outWav,
              scriptPath: projectDir,
              sceneId: scene.id,
              allowPlaceholder: Boolean(body.allowPlaceholder),
            })
            results.push(res)
          }
          let mastering = null
          if (body.autoMaster) {
            mastering = await masterVoiceTracks({
              projectDir,
              useLlm: body.useLlm !== false,
              onProgress,
            })
          }
          onProgress?.('正在合成配音、音效与背景音乐混音...')
          const updated = readScriptJson(projectDir)
          syncProjectCodeFromScript(projectDir, updated.data)
          const mixResult = await mixVideoAudio({ projectDir, script: updated.data })
          return { ok: true, action, results, mastering, mixResult, script: updated.data }
        }
        if (body.async) {
          const job = createBackgroundJob('正在启动 IndexTTS-2.5 配音引擎...', runTtsAll)
          return jsonResponse({ ok: true, jobId: job.id })
        }
        return jsonResponse(await runTtsAll())
      }

      if (action === 'ai-master-voice') {
        const runMaster = async (onProgress) => {
          const report = await masterVoiceTracks({
            projectDir,
            sceneIds: Array.isArray(body.sceneIds) ? body.sceneIds : [],
            useLlm: body.useLlm !== false,
            onProgress,
          })
          onProgress?.('正在将 AI 修音人声与音效、背景音乐重新混音...')
          const updated = readScriptJson(projectDir)
          syncProjectCodeFromScript(projectDir, updated.data)
          const mixResult = await mixVideoAudio({ projectDir, script: updated.data })
          return { ok: true, action, report, mixResult, script: updated.data }
        }
        if (body.async) {
          const job = createBackgroundJob('正在执行配音后 AI 大模型声学修音...', runMaster)
          return jsonResponse({ ok: true, jobId: job.id })
        }
        return jsonResponse(await runMaster())
      }

      if (action === 'snapshot') {
        const result = await executeVideoSnapshot({ projectDir, engine: body.engine })
        return jsonResponse({ ok: true, action, result })
      }

      if (action === 'update-format') {
        const { data } = readScriptJson(projectDir)
        const manifest = readAssets(projectDir)
        const visuals = (manifest.items || []).filter((i) => i.type === 'image' || i.type === 'video')
        const dims = resolveVideoDimensions({
          aspectRatio: body.aspectRatio || data.requestedAspectRatio || 'auto',
          quality: body.quality || data.quality || '1080p',
          width: body.width,
          height: body.height,
          topic: data.topic || data.title || '',
          assets: visuals,
        })
        const updated = writeScriptJson(projectDir, {
          ...data,
          width: dims.width,
          height: dims.height,
          aspectRatio: dims.aspectRatio,
          requestedAspectRatio: dims.requestedAspectRatio,
          quality: dims.quality,
          dimensionReason: dims.reason,
          ...(body.aiBadge !== undefined ? { aiBadge: Boolean(body.aiBadge) } : {}),
          ...(body.targetPlatform ? { targetPlatform: body.targetPlatform } : {}),
          ...(body.bgmMode ? { bgmMode: body.bgmMode, audioSpec: { ...(data.audioSpec || {}), bgmMode: body.bgmMode } } : {}),
          ...(body.creationMode ? { creationMode: body.creationMode } : {}),
          ...(body.engine ? { engine: body.engine } : {}),
        })
        syncProjectCodeFromScript(projectDir, updated.data)
        return jsonResponse({ ok: true, action, dimensions: dims, script: updated.data })
      }

      if (action === 'render') {
        const runRender = async (onProgress) => {
          onProgress?.('正在混音与启动逐帧渲染...')
          const { data: sc } = readScriptJson(projectDir)
          let rW = body.renderWidth
          let rH = body.renderHeight
          let draftScale = body.draftScale
          // Keep portrait / square ratios intact when draft720p is requested
          if (body.draft720p && !rW && !rH) {
            const curW = Number(sc.width) || 1920
            const curH = Number(sc.height) || 1080
            const shortEdge = Math.min(curW, curH)
            if (shortEdge > 720) {
              draftScale = 720 / shortEdge
            }
          }
          const result = await executeVideoRender({
            projectDir,
            engine: body.engine,
            renderWidth: rW,
            renderHeight: rH,
            draftScale,
            onProgress: ({ frame, totalFrames, pct }) =>
              onProgress?.({ stage: 'render', progress: pct, message: `正在逐帧合成 MP4 (${frame}/${totalFrames} 帧 · ${pct}%)...` }),
          })
          return { ok: true, action, result }
        }
        if (body.async) {
          const job = createBackgroundJob('正在准备渲染视频...', runRender)
          return jsonResponse({ ok: true, jobId: job.id })
        }
        return jsonResponse(await runRender())
      }

      return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400)
    }

    // 7. GET /api/video-workbench/asset?projectDir=...&rel=... (stream HTML, images, video, WAV, MP4 with Range support)
    if (pathname === '/api/video-workbench/asset' && req.method === 'GET') {
      const projectDir = url.searchParams.get('projectDir') || ''
      const rel = url.searchParams.get('rel') || 'index.html'
      const absProject = resolve(projectDir)
      const targetFile = resolve(absProject, rel)
      if (!targetFile.startsWith(absProject) || !existsSync(targetFile)) {
        return new Response('Asset Not Found', { status: 404 })
      }
      const ext = extname(targetFile).toLowerCase()
      if (ext === '.html' && url.searchParams.get('preview') === '1') {
        const assetBase = `/api/video-workbench/asset?projectDir=${encodeURIComponent(absProject)}&rel=`
        const html = readFileSync(targetFile, 'utf8')
          .replace(/(src|data-media-src)="assets\//g, `$1="${assetBase}assets/`)
          .replace(/fetch\('assets\//g, `fetch('${assetBase}assets/`)
          .replace(/url\((['"]?)fonts\//g, `url($1${assetBase}fonts/`)
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        })
      }
      const contentType = MIME_MAP[ext] || 'application/octet-stream'
      return serveFileWithRange(req, targetFile, contentType)
    }

    return jsonResponse({ ok: false, error: `Route not found: ${pathname}` }, 404)
  } catch (err) {
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500)
  }
}

export const name = 'dsh-web-video-workbench'

export function apply(ctx) {
  try {
    listVideoProjects()
  } catch {}

  // 1. Register Web Fetch API routes (`connection.fetch.register`)
  ctx.inject(['connection'], (innerCtx) => {
    const routes = [
      { path: '/api/video-workbench/state', methods: ['GET'] },
      { path: '/api/video-workbench/jobs', methods: ['GET'] },
      { path: '/api/video-workbench/llm-config', methods: ['GET', 'POST'] },
      { path: '/api/video-workbench/llm-test', methods: ['POST'] },
      { path: '/api/video-workbench/voices/preview', methods: ['GET'] },
      { path: '/api/video-workbench/projects', methods: ['POST'] },
      { path: '/api/video-workbench/projects/delete', methods: ['POST'] },
      { path: '/api/video-workbench/script', methods: ['POST'] },
      { path: '/api/video-workbench/assets/import', methods: ['POST'] },
      { path: '/api/video-workbench/assets/upload', methods: ['POST'] },
      { path: '/api/video-workbench/assets/delete', methods: ['POST'] },
      { path: '/api/video-workbench/plan', methods: ['POST'] },
      { path: '/api/video-workbench/produce', methods: ['POST'] },
      { path: '/api/video-workbench/ai-produce', methods: ['POST'] },
      { path: '/api/video-workbench/ai-refine', methods: ['POST'] },
      { path: '/api/video-workbench/code', methods: ['GET'] },
      { path: '/api/video-workbench/qa', methods: ['POST'] },
      { path: '/api/video-workbench/voices/import', methods: ['POST'] },
      { path: '/api/video-workbench/voices/clone-upload', methods: ['POST'] },
      { path: '/api/video-workbench/voices/clone-preview', methods: ['POST'] },
      { path: '/api/video-workbench/voices/match', methods: ['POST'] },
      { path: '/api/video-workbench/bgm/upload', methods: ['POST'] },
      { path: '/api/video-workbench/audio/llm-compose', methods: ['POST'] },
      { path: '/api/video-workbench/audio/tts-compose', methods: ['POST'] },
      { path: '/api/video-workbench/publish-pack', methods: ['POST'] },
      { path: '/api/video-workbench/vendor/import', methods: ['POST'] },
      { path: '/api/video-workbench/safe-zone', methods: ['GET'] },
      { path: '/api/video-workbench/action', methods: ['POST'] },
      { path: '/api/video-workbench/asset', methods: ['GET'] },
    ]
    for (const r of routes) {
      innerCtx.connection.fetch.register({
        path: r.path,
        methods: r.methods,
        requestBody: 'buffered',
        fetch: handleWorkbenchApiRequest,
      })
    }
  })

  // 2. Inject Frontend Module (`lib/client.js`) into DSH Web UI (`webui.addStaticModule`)
  ctx.inject(['webui'], (innerCtx) => {
    innerCtx.webui.addStaticModule({
      id: 'dsh-web-video-workbench',
      path: join(__dirname, 'client.js'),
    })
  })
}

export { VIDEO_MAKER_SYSTEM_PROMPT }
export default { name, apply }
