import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadEnv,
  REPO_ROOT,
  resolveEnvPath,
  runCommandRedirected,
} from '../packages/shared/index.js'
import { setupDshVideoProfile } from './install-profile.mjs'
import LocalTtsPlugin from '../packages/dsh-tool-local-tts/index.js'
import VideoSuitePlugin from '../packages/dsh-tool-video-suite/index.js'
import PresetVideoPlugin from '../packages/dsh-preset-video/index.js'
import WebVideoWorkbenchPlugin, {
  handleWorkbenchApiRequest,
  listVideoProjects,
} from '../packages/dsh-web-video-workbench/lib/index.js'

/**
 * Verify Cordis plugin registration (`ctx.tools`, `ctx.agentPresets`, `ctx.connection`, `ctx.webui`)
 * in a mock/lightweight Cordis host context.
 */
export function verifyCordisPluginMounting() {
  const registeredTools = []
  const registeredPresets = []
  const registeredRoutes = []
  const registeredStaticModules = []

  const mockCtx = {
    tools: {
      register(def) {
        registeredTools.push({
          name: def.name,
          description: def.description,
          required: def.parameters?.required || [],
          execute: def.execute,
        })
      },
    },
    agentPresets: {
      register(def) {
        registeredPresets.push({
          id: def.id,
          name: def.name,
          pluginCount: Array.isArray(def.plugins) ? def.plugins.length : 0,
        })
      },
    },
    connection: {
      fetch: {
        register(def) {
          registeredRoutes.push({ path: def.path, methods: def.methods })
        },
      },
    },
    webui: {
      addStaticModule(def) {
        registeredStaticModules.push(def)
      },
    },
    plugin(plg) {
      if (typeof plg === 'function') plg(mockCtx)
      else if (plg && typeof plg.apply === 'function') plg.apply(mockCtx)
    },
    inject(_deps, fn) {
      fn(mockCtx)
    },
  }

  PresetVideoPlugin.apply(mockCtx)
  WebVideoWorkbenchPlugin.apply(mockCtx)

  return {
    tools: registeredTools.map((t) => t.name),
    toolDefinitions: registeredTools,
    presets: registeredPresets,
    routes: registeredRoutes,
    staticModules: registeredStaticModules,
  }
}

async function main() {
  loadEnv()
  const rawArgs = process.argv.slice(2)
  // Handle `pnpm.cmd dsh video ...` or `node dsh-runner.mjs video ...`
  const args = rawArgs[0] === 'dsh' ? rawArgs.slice(1) : rawArgs
  const profileName = args[0] && !args[0].startsWith('-') ? args[0] : 'video'
  const flags = new Set(args.filter((a) => a.startsWith('-')))

  const profileSetup = setupDshVideoProfile()
  const projectsInfo = listVideoProjects()
  const cordisMount = verifyCordisPluginMounting()

  console.log('======================================================================')
  console.log(`🎬 DeepSeek Harness Video Workbench — Profile: [${profileName}]`)
  console.log('======================================================================')
  console.log(`• Profile Config : ${profileSetup.profilePatchPath}`)
  console.log(`• Desktop Mount  : ${profileSetup.desktopMounted ? `Mounted (${profileSetup.desktopPatchPath})` : 'Isolated (.dsh-home)'}`)
  console.log(`• Registered Preset : ${cordisMount.presets.map((p) => `${p.name} (${p.id})`).join(', ')}`)
  console.log(`• Registered Tools  : ${cordisMount.tools.join(', ')}`)
  console.log(`• Registered Routes : ${cordisMount.routes.map((r) => r.path).join(', ')}`)
  console.log(`• Active Projects   : ${projectsInfo.projects.map((p) => `${p.name} [${p.engine}]`).join(', ')}`)

  if (flags.has('--dump-config')) {
    const patchContent = readFileSync(profileSetup.profilePatchPath, 'utf8')
    console.log('\n--- [cordis.patch.yml (profile: video)] ---')
    console.log(patchContent.trim())
    console.log('-------------------------------------------')
    return
  }

  // Try probing DSH CLI if available and requested
  const dshAppRoot = resolveEnvPath('DSH_APP_ROOT', '')
  const dshCliCmd = dshAppRoot ? join(dshAppRoot, 'resources', 'runtime', 'cli', 'bin', 'dsh.cmd') : ''

  if (flags.has('--dsh-native') && dshCliCmd && existsSync(dshCliCmd)) {
    console.log(`\n🚀 Launching native DSH CLI with profile '${profileName}'...`)
    const res = await runCommandRedirected(
      'cmd.exe',
      ['/d', '/s', '/c', `"${dshCliCmd}" --profile ${profileName} --version`],
      {
        env: { ...process.env, DSH_HOME: profileSetup.dshHome },
        timeoutMs: 30_000,
      },
    )
    console.log('DSH CLI Output:', (res.stdout || res.stderr).trim())
  }

  // Start HTTP Verification / Standalone Preview Server for `dsh-web-video-workbench`
  const port = Number(process.env.DSH_VIDEO_PORT || 4399)
  const smokeMode = flags.has('--smoke') || flags.has('--verify') || !flags.has('--keep-alive')

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
    if (url.pathname.startsWith('/api/video-workbench/')) {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const bodyBuf = Buffer.concat(chunks)
      const webReq = new Request(url.href, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : bodyBuf,
      })
      const webRes = await handleWorkbenchApiRequest(webReq)
      res.statusCode = webRes.status
      webRes.headers.forEach((v, k) => res.setHeader(k, v))
      const arrayBuf = await webRes.arrayBuffer()
      res.end(Buffer.from(arrayBuf))
      return
    }

    if (url.pathname === '/client.js') {
      const clientJsPath = join(REPO_ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js')
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(readFileSync(clientJsPath, 'utf8'))
      return
    }

    // Serve standalone interactive preview shell hosting `dsh-web-video-workbench` (`client.js`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DeepSeek Harness — 双引擎视频工作台 (Profile: ${profileName})</title>
  <style>
    html, body, #root { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background: #090d18; color: #f8fafc; font-family: 'Microsoft YaHei', Consolas, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    import React from 'https://esm.sh/react@18.3.1';
    import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';

    const slots = new Map();
    window.__ModuleLoader__ = {
      load: async ({ factory }) => {
        const plugin = await factory(async (mod) => {
          if (mod === 'react') return React;
          return null;
        });
        const ctx = {
          connection: { fetch: window.fetch.bind(window) },
          slots: {
            register(slotName, def) {
              slots.set(slotName, def);
            }
          }
        };
        plugin.apply(ctx);
        const overlaySlot = slots.get('shell.overlay');
        const mainSlot = slots.get('main');
        const root = createRoot(document.getElementById('root'));
        root.render(
          React.createElement(
            React.Fragment,
            null,
            overlaySlot ? overlaySlot.render() : null,
            mainSlot ? mainSlot.render() : null
          )
        );
      }
    };

    const s = document.createElement('script');
    s.src = '/client.js';
    document.body.appendChild(s);
  </script>
</body>
</html>`)
  })

  await new Promise((resolveListen) => server.listen(port, '127.0.0.1', resolveListen))
  console.log(`\n✅ DSH Video Workbench Service listening at: http://127.0.0.1:${port}`)

  // Perform quick live HTTP self-check against `/api/video-workbench/state`
  const stateResp = await fetch(`http://127.0.0.1:${port}/api/video-workbench/state`)
  const stateJson = await stateResp.json()
  console.log(
    `✅ Live API Health Check (/api/video-workbench/state): HTTP ${stateResp.status} · Voices Loaded: ${stateJson.voiceCatalog?.length || 0} · Active Preset: ${stateJson.presetName}`,
  )

  if (smokeMode) {
    server.close()
    console.log('✅ `pnpm dsh video` startup & live verification completed with 0 errors.')
  } else {
    console.log('💡 Press Ctrl+C to stop the server.')
  }
}

const isDirectEntry =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectEntry) {
  main().catch((err) => {
    console.error('❌ [dsh-runner] Error:', err)
    process.exit(1)
  })
}
