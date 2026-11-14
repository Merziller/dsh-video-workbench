/**
 * Manages the persistent IndexTTS-2.5 / IndexTTS-2 HTTP server (`scripts/tts-server.py`).
 * The model is loaded once (~15-60s) and then every sentence only costs fast GPU inference time.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadEnv, REPO_ROOT, resolveEnvPath } from '@dsh-video/shared'

let startingPromise = null

function endpoint() {
  loadEnv()
  return (process.env.INDEXTTS_ENDPOINT || 'http://127.0.0.1:9880').replace(/\/+$/, '')
}

export async function getTtsServerHealth(timeoutMs = 2500) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${endpoint()}/health`, { signal: ctrl.signal })
    const data = await res.json()
    return { reachable: true, ...data }
  } catch {
    return { reachable: false, ready: false }
  } finally {
    clearTimeout(t)
  }
}

function collectPythonPathDirs(pythonExe) {
  const pyDir = dirname(pythonExe)
  const pyRoot = existsSync(join(pyDir, 'python.exe')) ? pyDir : dirname(pyDir)
  const dirs = [
    pyDir,
    pyRoot,
    join(pyRoot, 'Scripts'),
    join(pyRoot, 'Lib', 'site-packages', 'torch', 'lib'),
    join(pyRoot, 'Library', 'bin'),
  ]
  const pyvenvCfg = join(pyRoot, 'pyvenv.cfg')
  if (existsSync(pyvenvCfg)) {
    try {
      const m = /^home\s*=\s*(.+)$/im.exec(readFileSync(pyvenvCfg, 'utf8'))
      if (m && m[1]) {
        const baseHome = m[1].trim()
        dirs.push(
          baseHome,
          join(baseHome, 'Scripts'),
          join(baseHome, 'Lib', 'site-packages', 'torch', 'lib'),
          join(baseHome, 'Library', 'bin'),
        )
      }
    } catch {}
  }
  return dirs.filter(Boolean)
}

function spawnServer() {
  const root = resolveEnvPath('INDEXTTS_ROOT', '')
  const python = resolveEnvPath('INDEXTTS_PYTHON', '')
  if (!root || !existsSync(root) || !python || !existsSync(python)) {
    throw new Error('未配置 INDEXTTS_ROOT / INDEXTTS_PYTHON，无法启动本地 IndexTTS-2.5 服务（请检查 .env）。')
  }
  const port = new URL(endpoint()).port || '9880'
  const logDir = join(REPO_ROOT, '.tmp')
  mkdirSync(logDir, { recursive: true })
  const logFd = openSync(join(logDir, 'tts-server.log'), 'a')
  const pyPaths = collectPythonPathDirs(python)
  const env = {
    ...process.env,
    PYTHONIOENCODING: 'utf-8',
    PYTHONHOME: '',
    PYTHONPATH: '',
    HF_HOME: join(root, 'checkpoints'),
    HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
    TRANSFORMERS_CACHE: join(root, 'tf_download'),
    GRADIO_TEMP_DIR: join(REPO_ROOT, '.tmp', 'gradio'),
    XFORMERS_FORCE_DISABLE_TRITON: '1',
    PATH: [...pyPaths, process.env.PATH || ''].join(';'),
  }
  const child = spawn(python, ['-s', join(REPO_ROOT, 'scripts', 'tts-server.py'), '--root', root, '--port', String(port)], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
  })
  child.unref()
  return child.pid
}

/**
 * Ensure the IndexTTS-2.5 / IndexTTS-2 server is running and its model is loaded.
 */
export async function ensureTtsServer({ waitMs = 300_000, onWait } = {}) {
  const h = await getTtsServerHealth()
  if (h.reachable && h.ready) return h
  if (!startingPromise) {
    startingPromise = (async () => {
      if (!h.reachable) spawnServer()
      const deadline = Date.now() + waitMs
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000))
        const cur = await getTtsServerHealth()
        if (cur.reachable && cur.ready) return cur
        if (cur.reachable && cur.error) throw new Error(`IndexTTS-2.5 加载失败: ${cur.error}`)
        onWait?.(Math.round((deadline - Date.now()) / 1000))
      }
      throw new Error('等待 IndexTTS-2.5 模型加载超时（详见 .tmp/tts-server.log）')
    })().finally(() => {
      startingPromise = null
    })
  }
  return startingPromise
}
