import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
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
  buildHtmlSceneTemplate,
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
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
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
 * List all video projects in `DSH_VIDEO_WORKSPACE` (ensuring `demo-html-project` exists).
 */
export function listVideoProjects() {
  const wsRoot = getWorkspaceRoot()
  const demoDir = join(wsRoot, 'demo-html-project')
  if (!existsSync(join(demoDir, 'script.json'))) {
    scaffoldVideoProject(demoDir, {
      title: 'DeepSeek Harness 双引擎视频工作台演示 (HTML/GSAP)',
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
      projects.push({
        id: entry,
        name: data.title || entry,
        projectDir: fullDir,
        engine: data.engine || 'html',
        fps: data.fps || 30,
        totalDurationSec: data.totalDurationSec || 0,
        totalDurationInFrames: data.totalDurationInFrames || 0,
        sceneCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
        voiceMode: data.voiceMode || 'auto',
        defaultVoiceId: data.defaultVoiceId || 'auto',
        hasMp4,
        hasSnapshot,
        updatedAt: data.updatedAt || null,
      })
    } catch {}
  }
  return { workspaceRoot: wsRoot, projects }
}

/**
 * Handle API calls from the frontend Video Workbench UI (`/api/video-workbench/*`).
 * Reuses the `connection.fetch.register` pattern from MIT-licensed `dsh-workbench` and `dsh-ppt`.
 */
export async function handleWorkbenchApiRequest(req) {
  const url = new URL(req.url, 'http://localhost')
  const pathname = url.pathname

  try {
    // 1. GET /api/video-workbench/state
    if (pathname === '/api/video-workbench/state' && req.method === 'GET') {
      const { workspaceRoot, projects } = listVideoProjects()
      const requestedProject = url.searchParams.get('projectDir') || projects[0]?.projectDir || ''
      let activeProject = null
      if (requestedProject && existsSync(join(requestedProject, 'script.json'))) {
        const { data } = readScriptJson(requestedProject)
        activeProject = {
          projectDir: requestedProject,
          script: data,
          hasMp4: existsSync(join(requestedProject, 'output', 'final.mp4')),
          hasSnapshot: existsSync(join(requestedProject, 'output', 'snapshot-3x3.png')),
        }
      }
      const catalog = getVoiceCatalog()
      return jsonResponse({
        ok: true,
        workspaceRoot,
        projects,
        activeProject,
        voiceCatalog: catalog.voices,
        voiceCategories: catalog.categories,
        availableEmotions: Object.keys(catalog.emotionReferences),
        presetId: 'video-maker',
        presetName: '视频制作模式',
      })
    }

    // 1b. GET /api/video-workbench/voices/preview?id=... (stream original WAV sample for browser audition)
    if (pathname === '/api/video-workbench/voices/preview' && req.method === 'GET') {
      const voiceId = url.searchParams.get('id') || ''
      const catalog = getVoiceCatalog()
      const hit = catalog.voices.find((v) => v.id === voiceId)
      if (!hit || !hit.resolvedRefPath || !existsSync(hit.resolvedRefPath)) {
        return new Response('Voice reference audio not found', { status: 404 })
      }
      const ext = extname(hit.resolvedRefPath).toLowerCase()
      if (ext === '.pt') {
        return jsonResponse({ ok: false, error: 'IndexTTS .pt speaker tensor does not have a raw WAV stream; synthesize a scene to preview.' }, 400)
      }
      const buf = readFileSync(hit.resolvedRefPath)
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': MIME_MAP[ext] || 'audio/wav',
          'Cache-Control': 'public, max-age=3600',
        },
      })
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
        audience: body.audience || '通用受众',
        goal: body.goal || '高质感知识可视化视频',
        voiceMode: body.voiceMode || 'auto',
        defaultVoiceId: body.defaultVoiceId || 'auto',
      })
      matchAllScenesInScript(projectDir, { voiceId: body.defaultVoiceId || 'auto' })
      const reloaded = readScriptJson(projectDir)
      writeFileSync(join(projectDir, 'index.html'), buildHtmlSceneTemplate(reloaded.data), 'utf8')
      return jsonResponse({
        ok: true,
        projectDir: created.projectDir,
        script: reloaded.data,
      })
    }

    // 3. POST /api/video-workbench/script (save script.json & sync HTML template)
    if (pathname === '/api/video-workbench/script' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      if (!body.projectDir || !body.script) {
        return jsonResponse({ ok: false, error: 'projectDir and script are required' }, 400)
      }
      const saved = writeScriptJson(body.projectDir, body.script)
      if ((saved.data.engine || 'html') === 'html' && body.regenerateHtml !== false) {
        writeFileSync(join(saved.projectDir, 'index.html'), buildHtmlSceneTemplate(saved.data), 'utf8')
      }
      return jsonResponse({
        ok: true,
        projectDir: saved.projectDir,
        script: saved.data,
      })
    }

    // 4. POST /api/video-workbench/voices/import (import custom voice pack)
    if (pathname === '/api/video-workbench/voices/import' && req.method === 'POST') {
      const body = await parseRequestJson(req)
      const res = await importVoicePack(body)
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
      if ((reloaded.data.engine || 'html') === 'html') {
        writeFileSync(join(reloaded.projectDir, 'index.html'), buildHtmlSceneTemplate(reloaded.data), 'utf8')
      }
      return jsonResponse({
        ok: true,
        ...matchRes,
        script: reloaded.data,
      })
    }

    // 6. POST /api/video-workbench/action (tts-scene, tts-all, lint, snapshot, render)
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
        })
        const updated = readScriptJson(projectDir)
        if ((updated.data.engine || 'html') === 'html') {
          writeFileSync(join(projectDir, 'index.html'), buildHtmlSceneTemplate(updated.data), 'utf8')
        }
        return jsonResponse({ ok: true, action, result, script: updated.data })
      }

      if (action === 'tts-all') {
        const { data } = readScriptJson(projectDir)
        const results = []
        for (const scene of data.scenes || []) {
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
          })
          results.push(res)
        }
        const updated = readScriptJson(projectDir)
        if ((updated.data.engine || 'html') === 'html') {
          writeFileSync(join(projectDir, 'index.html'), buildHtmlSceneTemplate(updated.data), 'utf8')
        }
        return jsonResponse({ ok: true, action, results, script: updated.data })
      }

      if (action === 'snapshot') {
        const result = await executeVideoSnapshot({ projectDir, engine: body.engine })
        return jsonResponse({ ok: true, action, result })
      }

      if (action === 'render') {
        const result = await executeVideoRender({ projectDir, engine: body.engine })
        return jsonResponse({ ok: true, action, result })
      }

      return jsonResponse({ ok: false, error: `Unknown action: ${action}` }, 400)
    }

    // 7. GET /api/video-workbench/asset?projectDir=...&rel=... (stream HTML, WAV, PNG, MP4)
    if (pathname === '/api/video-workbench/asset' && req.method === 'GET') {
      const projectDir = url.searchParams.get('projectDir') || ''
      const rel = url.searchParams.get('rel') || 'index.html'
      const absProject = resolve(projectDir)
      const targetFile = resolve(absProject, rel)
      if (!targetFile.startsWith(absProject) || !existsSync(targetFile)) {
        return new Response('Asset Not Found', { status: 404 })
      }
      const ext = extname(targetFile).toLowerCase()
      const contentType = MIME_MAP[ext] || 'application/octet-stream'
      const buf = readFileSync(targetFile)
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      })
    }

    return jsonResponse({ ok: false, error: `Route not found: ${pathname}` }, 404)
  } catch (err) {
    return jsonResponse({ ok: false, error: err?.message || String(err) }, 500)
  }
}

export const name = 'dsh-web-video-workbench'

export function apply(ctx) {
  // Ensure demo project is initialized on startup
  try {
    listVideoProjects()
  } catch {}

  // 1. Register Web Fetch API routes (`connection.fetch.register`)
  ctx.inject(['connection'], (innerCtx) => {
    const routes = [
      { path: '/api/video-workbench/state', methods: ['GET'] },
      { path: '/api/video-workbench/voices/preview', methods: ['GET'] },
      { path: '/api/video-workbench/projects', methods: ['POST'] },
      { path: '/api/video-workbench/script', methods: ['POST'] },
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
