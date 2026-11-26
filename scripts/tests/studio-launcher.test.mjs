// Studio launcher (start-workbench / `dsh-video-cli studio`): a background studio of the same folder that still runs
// the code it started with — the plugin folder was updated while it ran — is restarted with the code on disk instead of
// being reused (its routes no longer match the pages it serves: every war-room skin timed out); never in the middle of
// a render; a current studio is still reused. Real runner processes on test ports (never the user's 4399 / 4400)
// against fake "old" studios, plus the code stamp itself on a scratch folder.
//
// usage: node scripts/tests/studio-launcher.test.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// tests never download the local speech engine (the studio's startup self-check would start it)
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0'
const stampDir = new Date().toISOString().replace(/[:.]/g, '-')
const scratch = join(ROOT, '.tmp', 'studio-launcher-test', stampDir)
mkdirSync(scratch, { recursive: true })
process.env.DSH_VIDEO_WORKSPACE = join(scratch, 'ws')
process.env.DSH_VIDEO_HOME = join(scratch, 'home')
mkdirSync(process.env.DSH_VIDEO_WORKSPACE, { recursive: true })
mkdirSync(process.env.DSH_VIDEO_HOME, { recursive: true })

const { pluginCodeStamp } = await import('../dsh-runner.mjs')
const { REPO_ROOT } = await import('../../packages/shared/index.js')
const PKG_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version

let passed = 0
let failed = 0
const check = (name, ok, detail = '') => {
  if (ok) passed++
  else failed++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${String(detail).slice(0, 400)}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------- the code stamp
{
  const fake = join(scratch, 'pkg')
  const put = (rel, text) => {
    mkdirSync(dirname(join(fake, rel)), { recursive: true })
    writeFileSync(join(fake, rel), text)
  }
  put('package.json', JSON.stringify({ name: 'x', version: '1.2.3' }))
  put('packages/a/lib.js', 'export const a = 1\n')
  put('packages/a/data.json', '{"n":1}\n')
  put('packages/a/node_modules/dep/index.js', 'module.exports = 1\n')
  put('bin/cli.mjs', 'console.log(1)\n')
  put('index.js', 'export default 1\n')
  put('scripts/dsh-runner.mjs', '// runner\n')
  put('scripts/other.mjs', '// not loaded by the studio\n')
  const s1 = pluginCodeStamp(fake)
  const s2 = pluginCodeStamp(fake)
  check('code stamp: version, stable for the same files', s1.version === '1.2.3' && /^[0-9a-f]{16}$/.test(s1.stamp) && s1.stamp === s2.stamp && s1.files === 4, JSON.stringify(s1))
  put('packages/a/data.json', '{"n":2,"m":3}\n')
  put('packages/a/node_modules/dep/index.js', 'module.exports = 22\n')
  put('scripts/other.mjs', '// changed, still not loaded\n')
  check('code stamp: data files, dependencies and other scripts do not count', pluginCodeStamp(fake).stamp === s1.stamp)
  put('packages/a/lib.js', 'export const a = 2 // changed\n')
  const s3 = pluginCodeStamp(fake)
  check('code stamp: a changed code file changes it', s3.stamp !== s1.stamp)
  const t = new Date(Date.now() - 3600_000)
  utimesSync(join(fake, 'bin', 'cli.mjs'), t, t)
  const s4 = pluginCodeStamp(fake)
  check('code stamp: a re-written file (same size, new time) changes it', s4.stamp !== s3.stamp)
  put('package.json', JSON.stringify({ name: 'x', version: '1.2.4' }))
  const s5 = pluginCodeStamp(fake)
  check('code stamp: a new version changes it', s5.stamp !== s4.stamp && s5.version === '1.2.4')
  const real = pluginCodeStamp()
  check('code stamp of this plugin: its version and its code files', real.version === PKG_VERSION && real.files > 50, JSON.stringify(real))
}

// ---------------------------------------------------------------- fake studios and the real launcher
// A fake studio of this folder as an older runner answers: runner-info (no code stamp = started before v0.8.1, or a
// given stamp), its task list, and the stop route (then it really stops listening). It reports no PID, so the launcher
// can never fall back to killing a process in this test.
function fakeStudio(port, { codeStamp = '', busy = false } = {}) {
  const state = { stopRequested: false }
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (url.pathname === '/api/video-workbench/runner-info') {
      res.end(JSON.stringify({ ok: true, version: 'v9', port, url: `http://127.0.0.1:${port}`, repoRoot: REPO_ROOT, daemonMode: true, ...(codeStamp ? { codeStamp, pkgVersion: PKG_VERSION } : {}) }))
      return
    }
    if (url.pathname === '/api/video-workbench/tasks') {
      res.end(JSON.stringify({ ok: true, runs: busy ? [{ id: 'run-busy', status: 'running' }] : [{ id: 'run-old', status: 'completed' }] }))
      return
    }
    if (url.pathname === '/api/video-workbench/runner-stop' && req.method === 'POST') {
      state.stopRequested = true
      res.end(JSON.stringify({ ok: true, stopping: true }))
      setTimeout(() => {
        server.close()
        server.closeAllConnections?.()
      }, 80)
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ ok: false, error: `Route not found: ${url.pathname}` }))
  })
  return new Promise((resolveListen, rejectListen) => server.once('error', rejectListen).listen(port, '127.0.0.1', () => resolveListen({ server, state })))
}

// The real runner in the foreground (`--keep-alive`, not isolated: the launcher check runs) on a test port.
function startLauncher(port) {
  const env = { ...process.env, DSH_VIDEO_PORT: String(port), DSH_VIDEO_SKIP_PROFILE_MOUNT: '1', DSH_ASR_AUTO_INSTALL: '0' }
  delete env.DSH_VIDEO_RUNNER_ISOLATED
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'dsh-runner.mjs'), 'video', '--keep-alive'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const run = { child, out: '', code: null }
  child.stdout.on('data', (d) => (run.out += d))
  child.stderr.on('data', (d) => (run.out += d))
  run.exited = new Promise((r) => child.once('exit', (code) => r((run.code = code))))
  return run
}
const until = async (pred, ms) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await pred()) return true
    await sleep(250)
  }
  return false
}
const runnerInfo = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/video-workbench/runner-info`, { signal: AbortSignal.timeout(1500) })
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}
const stopReal = async (run, port) => {
  try {
    await fetch(`http://127.0.0.1:${port}/api/video-workbench/runner-stop`, { method: 'POST', signal: AbortSignal.timeout(3000) })
  } catch {}
  const done = await Promise.race([run.exited.then(() => true), sleep(15_000).then(() => false)])
  if (!done) run.child.kill()
}

const CURRENT = pluginCodeStamp().stamp
// 1. an old studio (no code stamp), idle → stopped and replaced by the current code on the same port
{
  const port = 4481
  const fake = await fakeStudio(port)
  const run = startLauncher(port)
  const up = await until(async () => (await runnerInfo(port))?.codeStamp === CURRENT, 90_000)
  const info = await runnerInfo(port)
  check(
    'an old studio of this folder (idle) is restarted with the current code on the same port',
    fake.state.stopRequested && up && info && info.pkgVersion === PKG_VERSION && info.busy && typeof info.busy.runs === 'number' && /正在自动换成新版/.test(run.out),
    JSON.stringify({ stopRequested: fake.state.stopRequested, up, info, out: run.out.split('\n').filter((l) => /换成新版|listening|旧程序/.test(l)) }),
  )
  await stopReal(run, port)
  check('the restarted studio stops on request', run.code === 0, `exit ${run.code}`)
}
// 2. an old studio in the middle of a render → left running (reused), never stopped
{
  const port = 4482
  const fake = await fakeStudio(port, { busy: true })
  const run = startLauncher(port)
  const exited = await Promise.race([run.exited.then(() => true), sleep(90_000).then(() => false)])
  if (!exited) run.child.kill()
  check('an old studio that is rendering is not stopped (restart later)', exited && run.code === 0 && !fake.state.stopRequested && /正在出片/.test(run.out), JSON.stringify({ exited, code: run.code, stopRequested: fake.state.stopRequested }))
  fake.server.close()
}
// 3. a studio that runs the current code → reused as before
{
  const port = 4483
  const fake = await fakeStudio(port, { codeStamp: CURRENT })
  const run = startLauncher(port)
  const exited = await Promise.race([run.exited.then(() => true), sleep(90_000).then(() => false)])
  if (!exited) run.child.kill()
  check('a studio running the current code is reused, not restarted', exited && run.code === 0 && !fake.state.stopRequested && /already listening/.test(run.out), JSON.stringify({ exited, code: run.code, stopRequested: fake.state.stopRequested }))
  fake.server.close()
}

try {
  rmSync(join(ROOT, '.tmp', 'studio-launcher-test'), { recursive: true, force: true })
} catch {}
console.log(`\n${passed}/${passed + failed} passed`)
process.exit(failed ? 1 : 0)
