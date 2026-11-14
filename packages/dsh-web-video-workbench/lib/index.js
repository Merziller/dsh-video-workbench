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
  loadEnv,
  readScriptJson,
  REPO_ROOT,
  resolveEnvPath,
  writeScriptJson,
} from '@dsh-video/shared'
import {
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
} from '@dsh-video/tool-video-suite'
import {
  importAssets,
  mixVideoAudio,
  planVideoFromAssets,
  produceFullVideo,
  readAssets,
  removeAsset,
  saveUploadedAsset,
  summarizeAssets,
  syncProjectCodeFromScript,
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
  const job = { id, status: 'running', message: initialMessage, result: null, error: '' }
  ASYNC_JOBS.set(id, job)
  if (ASYNC_JOBS.size > 40) {
    const firstKey = ASYNC_JOBS.keys().next().value
    if (firstKey) ASYNC_JOBS.delete(firstKey)
  }
  Promise.resolve()
    .then(() => runner((msg) => { if (msg) job.message = String(msg) }))
    .then((res) => {
      job.status = 'done'
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
        }
      }
      const catalog = getVoiceCatalog()
      const ttsStatus = await getTtsServerHealth()
      return jsonResponse({
        ok: true,
        workspaceRoot,
        projects,
        activeProject,
        voiceCatalog: catalog.voices,
        voiceCategories: catalog.categories,
        availableEmotions: Object.keys(catalog.emotionReferences),
        ttsStatus,
        presetId: 'video-maker',
        presetName: '视频制作模式',
      })
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
      const created = scaffoldVideoProject(projectDir, {
        title: body.title || '新建双引擎视频项目',
        engine: body.engine || 'html',
        style: body.style || 'tech',
        audience: body.audience || '通用受众',
        goal: body.goal || '带有文案、配音、音效、动效、音乐与字幕的完整成片',
        voiceMode: body.voiceMode || 'auto',
        defaultVoiceId: body.defaultVoiceId || 'auto',
      })
      matchAllScenesInScript(projectDir, { voiceId: body.defaultVoiceId || 'auto' })
      const reloaded = readScriptJson(projectDir)
      syncProjectCodeFromScript(projectDir, reloaded.data)
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
      return jsonResponse({
        ok: true,
        ...res,
      })
    }

    // 3f. POST /api/video-workbench/produce (one-click full pipeline: plan + TTS + SFX/BGM + lint + snapshot + MP4)
    if (pathname === '/api/video-workbench/produce' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir) {
        return jsonResponse({ ok: false, error: 'projectDir is required' }, 400)
      }
      if (body.async) {
        const job = createBackgroundJob('正在准备素材与分析分镜...', (onProgress) =>
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
          engine: body.ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts2',
          fps: data.fps || 30,
          outputPath: outWav,
          scriptPath: projectDir,
          sceneId: scene.id,
          allowPlaceholder: Boolean(body.allowPlaceholder),
        })
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
              engine: body.ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts2',
              fps: data.fps || 30,
              outputPath: outWav,
              scriptPath: projectDir,
              sceneId: scene.id,
              allowPlaceholder: Boolean(body.allowPlaceholder),
            })
            results.push(res)
          }
          onProgress?.('正在合成配音、音效与背景音乐混音...')
          const updated = readScriptJson(projectDir)
          syncProjectCodeFromScript(projectDir, updated.data)
          const mixResult = await mixVideoAudio({ projectDir, script: updated.data })
          return { ok: true, action, results, mixResult, script: updated.data }
        }
        if (body.async) {
          const job = createBackgroundJob('正在启动配音引擎...', runTtsAll)
          return jsonResponse({ ok: true, jobId: job.id })
        }
        return jsonResponse(await runTtsAll())
      }

      if (action === 'snapshot') {
        const result = await executeVideoSnapshot({ projectDir, engine: body.engine })
        return jsonResponse({ ok: true, action, result })
      }

      if (action === 'render') {
        const runRender = async (onProgress) => {
          onProgress?.('正在混音与启动逐帧渲染...')
          const result = await executeVideoRender({
            projectDir,
            engine: body.engine,
            renderWidth: body.renderWidth,
            renderHeight: body.renderHeight,
            onProgress: ({ frame, totalFrames, pct }) =>
              onProgress?.(`正在逐帧合成 MP4 (${frame}/${totalFrames} 帧 · ${pct}%)...`),
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
      { path: '/api/video-workbench/voices/preview', methods: ['GET'] },
      { path: '/api/video-workbench/projects', methods: ['POST'] },
      { path: '/api/video-workbench/projects/delete', methods: ['POST'] },
      { path: '/api/video-workbench/script', methods: ['POST'] },
      { path: '/api/video-workbench/assets/import', methods: ['POST'] },
      { path: '/api/video-workbench/assets/upload', methods: ['POST'] },
      { path: '/api/video-workbench/assets/delete', methods: ['POST'] },
      { path: '/api/video-workbench/plan', methods: ['POST'] },
      { path: '/api/video-workbench/produce', methods: ['POST'] },
      { path: '/api/video-workbench/voices/import', methods: ['POST'] },
      { path: '/api/video-workbench/voices/match', methods: ['POST'] },
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
