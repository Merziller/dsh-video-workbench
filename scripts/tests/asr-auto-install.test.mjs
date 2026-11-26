#!/usr/bin/env node
/**
 * 本地语音识别 · automatic install (speech-recognition.js shared install) — tests. Nothing is ever downloaded: every
 * install below runs a fake installer (setAsrInstallerForTests) and the network is blocked.
 *   - the switch: DSH_ASR_AUTO_INSTALL=0 / false / off / no turns the automatic install off; importing starts nothing
 *   - folders: an engine pre-placed in vendor/asr, the default folder and the recommended folder are found by their
 *     manifest, in this order (an install survives a lost .env); DSH_ASR_HOME / an explicit folder win; the read-only
 *     vendor copy is never installed into
 *   - the shared install: idle → running → done with progress and a lock file, one install at a time (later calls
 *     join; another folder → BUSY 409)
 *   - on demand: transcribeMedia waits for the install and reports 「正在自动准备本地语音识别 45%（首次约 260 MB，只需
 *     一次）」; stopping a waiting job only stops the wait; with DSH_ASR_TEST_HOME = an installed engine the
 *     transcription then really runs
 *   - switched off: nothing starts, the error names more than one way to install, installing by hand still works
 *   - failure: a plain-Chinese reason, no automatic retry for 10 minutes (state, features), an explicit install retries
 *     at once, the automatic path tries again once a (shortened) pause is over; low disk / broken download / server
 *     down / failed self-test reasons
 *   - another process installing the same folder (its lock file) is waited for and never installed twice; a lock of a
 *     process that is gone or went silent is taken over
 *   - the narration check starts the background install and skips with one log line (quiet when switched off)
 *   - routes asr/status, talk/state and clips/state start the install and return its state; asr/install joins it or
 *     answers 409 BUSY for another folder; the War Room state's delayed start; the MCP server never installs at start
 *
 *   node scripts/tests/asr-auto-install.test.mjs
 *
 * Scratch data only (<repo>/.tmp/asr-auto-install-test/<stamp>); the real `.env` / DSH client are never read.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'asr-auto-install-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client'), asr: join(SCR, 'asr'), media: join(SCR, 'media') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
writeFileSync(join(SCR, 'empty.env'), '# intentionally empty\n')
const testAsrHome = String(process.env.DSH_ASR_TEST_HOME || '').trim()
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'DSH_ASR_HOME', 'AVATAR_LIPSYNC_HOME', 'DSH_NARRATION_CHECK']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: join(SCR, 'empty.env'),
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
// tests never download the local speech engine: a section switches the automatic install on only with a fake installer
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0'
const AUTO_DEFAULT = process.env.DSH_ASR_AUTO_INSTALL
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  } finally {
    process.env.DSH_ASR_AUTO_INSTALL = AUTO_DEFAULT
    delete process.env.DSH_ASR_HOME
  }
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (cond, ms = 4000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) return false
    await sleep(10)
  }
  return true
}
const same = (a, b) => (process.platform === 'win32' ? resolve(String(a)).toLowerCase() === resolve(String(b)).toLowerCase() : resolve(String(a)) === resolve(String(b)))

const SR = await imp('packages/dsh-tool-media/speech-recognition.js')
const importedState = SR.getAsrInstallState().state
const testReady = testAsrHome ? (await SR.getAsrStatus({ home: testAsrHome, force: true })).ready : false

/** Folders of one section: the pre-placed vendor copy, the default and the recommended folder, another folder. */
const box = (name) => {
  const b = join(dirs.asr, name)
  return { vendor: join(b, 'vendor-asr'), defaultHome: join(b, 'ai-engines-asr'), recommended: join(b, 'dsh-ai-asr'), other: join(b, 'other-asr') }
}
const pathsOf = (b) => ({ vendor: b.vendor, defaultHome: b.defaultHome, recommended: b.recommended })
const reset = (fn, opts = {}) => SR.setAsrInstallerForTests(fn, { lockPollMs: 25, ...opts })
const manifest = (dir) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'asr-engine.json'), JSON.stringify({ engine: 'test' }))
}

/** A fake installer: records its calls, reports progress when asked and finishes when the test says so. */
function fakeInstaller({ result = (o) => ({ ok: true, home: o.installDir }) } = {}) {
  const calls = []
  let release = null
  let current = null
  const fn = async (opts) => {
    calls.push(opts)
    current = opts
    opts.onProgress?.({ stage: 'asr-install', progress: 3, message: '正在下载识别引擎（测试）' })
    await new Promise((r) => (release = r))
    return result(opts)
  }
  return {
    fn,
    calls,
    progress: (pct, message) => current?.onProgress?.({ stage: 'asr-install', progress: pct, message }),
    finish: () => release?.(),
  }
}

/** A silent 16 kHz mono WAV. */
function tinyWav(file, seconds = 0.5) {
  const rate = 16000
  const n = Math.round(rate * seconds)
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, b)
  return file
}

/* ------------------------------------------------------------------------------------------- the switch */
await section('the automatic install switch', async () => {
  check('importing the module starts nothing', importedState === 'idle' || importedState === 'disabled', importedState)
  const seen = []
  for (const [v, want] of [['0', false], ['false', false], ['OFF', false], ['no', false], ['', true], ['1', true], ['on', true]]) {
    process.env.DSH_ASR_AUTO_INSTALL = v
    seen.push(SR.isAsrAutoInstallEnabled() === want)
  }
  delete process.env.DSH_ASR_AUTO_INSTALL
  seen.push(SR.isAsrAutoInstallEnabled() === true)
  check('DSH_ASR_AUTO_INSTALL=0 / false / off / no turns it off; unset or anything else keeps it on', seen.every(Boolean), JSON.stringify(seen))
  check('after a failure the automatic path waits 10 minutes', SR.ASR_AUTO_RETRY_MS === 10 * 60 * 1000)
})

/* ------------------------------------------------------------------------------------------- folders */
await section('folders: vendor/asr → default → recommended, found by their manifest', async () => {
  const b = box('discovery')
  const paths = pathsOf(b)
  reset(null, { paths })
  check('nothing installed: the default folder; a fresh install goes to the recommended folder', same(SR.resolveAsrHome(), b.defaultHome) && same(SR.recommendAsrHome(), b.recommended), `${SR.resolveAsrHome()} / ${SR.recommendAsrHome()}`)
  manifest(b.recommended)
  reset(null, { paths })
  check('an install in the recommended folder is found without DSH_ASR_HOME (a lost .env)', same(SR.resolveAsrHome(), b.recommended) && same(SR.recommendAsrHome(), b.recommended), SR.resolveAsrHome())
  manifest(b.defaultHome)
  reset(null, { paths })
  check('the default folder comes before the recommended one', same(SR.resolveAsrHome(), b.defaultHome) && same(SR.recommendAsrHome(), b.defaultHome), SR.resolveAsrHome())
  manifest(b.vendor)
  reset(null, { paths })
  check('an engine pre-placed in vendor/asr comes first', same(SR.resolveAsrHome(), b.vendor), SR.resolveAsrHome())
  check('a repair / a new install never goes into vendor/asr (read-only)', same(SR.recommendAsrHome(), b.defaultHome), SR.recommendAsrHome())
  const st = await SR.getAsrStatus({ force: true })
  check('engine status looks at the folder that was found', same(st.home, b.vendor) && st.ready === false, st.home)
  let verr = null
  try {
    await SR.installAsrEngine({ installDir: b.vendor, writeEnv: false })
  } catch (e) {
    verr = e
  }
  check('installing into vendor/asr is refused before any download', verr && /只读/.test(verr.message) && !existsSync(join(b.vendor, 'runtime')), verr?.message)
  process.env.DSH_ASR_HOME = b.other
  check('DSH_ASR_HOME wins over every install that was found', same(SR.resolveAsrHome(), b.other) && same(SR.recommendAsrHome(), b.other))
  check('an explicit folder wins over DSH_ASR_HOME', same(SR.resolveAsrHome(b.recommended), b.recommended))
  delete process.env.DSH_ASR_HOME
  rmSync(join(b.vendor, 'asr-engine.json'))
  check('the folder probe is cached briefly (no disk scan per request)', same(SR.resolveAsrHome(), b.vendor))
  reset(null, { paths })
  check('… and looked at again after a reset / an install', same(SR.resolveAsrHome(), b.defaultHome), SR.resolveAsrHome())
  const cat = SR.getAsrInstallerCatalog()
  check('installer catalog: recommended folder (never vendor) and whether the automatic install is on', same(cat.recommendedHome, b.defaultHome) && typeof cat.autoInstall === 'boolean')
})

/* ------------------------------------------------------------------------------------------- shared install */
await section('shared install: idle → running → done, one install at a time', async () => {
  const b = box('single')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  const s0 = SR.getAsrInstallState()
  check('before anything: idle, the automatic install allowed', s0.state === 'idle' && s0.auto === true && s0.progress === 0 && s0.supportedPlatform === true, JSON.stringify(s0))
  const seen = []
  const a = SR.startAsrInstall({ trigger: 'auto', onProgress: (p) => seen.push(p.progress) })
  const s1 = SR.getAsrInstallState()
  check('started: running, into the recommended folder, domestic mirror, a start time', !a.joined && s1.state === 'running' && same(s1.home, b.recommended) && s1.trigger === 'auto' && s1.mirror === 'cn' && Boolean(s1.startedAt), JSON.stringify(s1))
  const b2 = SR.startAsrInstall({})
  const b3 = SR.startAsrInstall({ installDir: b.recommended })
  await SR.maybeStartAsrAutoInstall()
  await until(() => fake.calls.length > 0)
  await sleep(30)
  check('single flight: later calls join the same install, the installer runs once', b2.joined && b3.joined && b2.promise === a.promise && fake.calls.length === 1, `${fake.calls.length} calls`)
  check('the installer gets the folder and the domestic mirror', same(fake.calls[0]?.installDir, b.recommended) && fake.calls[0]?.mirror === 'cn')
  let busy = null
  try {
    SR.startAsrInstall({ installDir: b.other })
  } catch (e) {
    busy = e
  }
  check('another folder while an install runs → BUSY (409) with a plain reason', busy?.code === 'BUSY' && busy?.status === 409 && /正在安装到/.test(busy.message), busy?.message)
  fake.progress(45, '下载 SenseVoice-Small 识别模型（int8）: 100 / 228 MB')
  const s2 = SR.getAsrInstallState()
  check('progress and message of the running install reach the state and the listeners', s2.progress === 45 && /100 \/ 228 MB/.test(s2.message) && seen.includes(45), JSON.stringify({ p: s2.progress, m: s2.message }))
  check('a lock file marks the folder as being installed', existsSync(join(b.recommended, '.install.lock')) && existsSync(join(b.recommended, '.install.progress.json')))
  fake.finish()
  const res = await a.promise
  const s3 = SR.getAsrInstallState()
  check('finished: done, 100 %, an end time, no error', res?.ok === true && s3.state === 'done' && s3.progress === 100 && Boolean(s3.finishedAt) && !s3.error, JSON.stringify(s3))
  check('the lock files are removed afterwards', !existsSync(join(b.recommended, '.install.lock')) && !existsSync(join(b.recommended, '.install.progress.json')))
  const again = SR.startAsrInstall({ trigger: 'manual' })
  await until(() => fake.calls.length === 2)
  check('a new install after the end starts a new run', !again.joined && fake.calls.length === 2 && SR.getAsrInstallState().trigger === 'manual')
  fake.finish()
  await again.promise
  // the fake leaves the engine missing: status requests must not start install after install
  await SR.maybeStartAsrAutoInstall()
  await SR.maybeStartAsrAutoInstall()
  await sleep(40)
  check('no loop: an install that ended while the engine is still missing is not repeated automatically', fake.calls.length === 2 && SR.getAsrInstallState().state === 'done', `${fake.calls.length} calls`)
})

/* ------------------------------------------------------------------------------------------- on demand */
await section('on demand: transcribeMedia waits for the install and reports its progress', async () => {
  const b = box('demand')
  const wav = tinyWav(join(dirs.media, 'demand.wav'))
  const fake = fakeInstaller({
    result: (o) => {
      // the real installer remembers its folder in process.env (and .env): the installed test engine plays that part
      if (testReady) process.env.DSH_ASR_HOME = testAsrHome
      return { ok: true, home: o.installDir }
    },
  })
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  const msgs = []
  const p = SR.transcribeMedia({ mediaPath: wav, onProgress: (x) => msgs.push(x) })
  p.catch(() => {})
  await until(() => fake.calls.length === 1)
  const s = SR.getAsrInstallState()
  check('a missing engine starts the automatic install', fake.calls.length === 1 && s.state === 'running' && s.trigger === 'auto', JSON.stringify(s))
  const msgs2 = []
  const p2 = SR.transcribeMedia({ mediaPath: tinyWav(join(dirs.media, 'demand-2.wav')), onProgress: (x) => msgs2.push(x) })
  p2.catch(() => {})
  await sleep(30)
  check('a second job joins the same install', fake.calls.length === 1 && msgs2.length > 0, `${fake.calls.length} calls`)
  fake.progress(45, '下载中')
  await until(() => msgs.some((m) => /45%/.test(m.message)))
  check('the waiting job shows 「正在自动准备本地语音识别 45%（首次约 260 MB，只需一次）」', msgs.some((m) => m.message === '正在自动准备本地语音识别 45%（首次约 260 MB，只需一次）' && m.progress === 1), msgs.map((m) => m.message).join(' | '))
  fake.finish()
  let t = null
  let terr = null
  try {
    t = await p
  } catch (e) {
    terr = e
  }
  await p2.catch(() => {})
  if (testReady) {
    check('after the install the transcription runs (installed test engine)', t && Array.isArray(t.segments) && Number.isFinite(t.durationSec), terr?.message || '')
  } else {
    console.log('  (DSH_ASR_TEST_HOME not set or not an installed engine: the transcription after the install is not run)')
    check('after the install the engine is checked again: still missing → a clear error, nothing waits forever', terr?.code === 'ASR_NOT_INSTALLED' && /安装已经结束/.test(terr.message), terr?.message)
  }
  delete process.env.DSH_ASR_HOME
  // the stop button only stops the wait
  const fake2 = fakeInstaller()
  reset(fake2.fn, { paths: pathsOf(b) })
  const ac = new AbortController()
  const p3 = SR.transcribeMedia({ mediaPath: tinyWav(join(dirs.media, 'demand-3.wav')), signal: ac.signal })
  p3.catch(() => {})
  await until(() => fake2.calls.length === 1)
  ac.abort()
  let aerr = null
  try {
    await p3
  } catch (e) {
    aerr = e
  }
  check('stopping a waiting job ends only the wait: the install goes on', aerr?.name === 'AbortError' && SR.getAsrInstallState().state === 'running', aerr?.message)
  fake2.finish()
  await until(() => SR.getAsrInstallState().state === 'done')
  check('… and finishes by itself', SR.getAsrInstallState().state === 'done')
})

/* ------------------------------------------------------------------------------------------- switched off */
await section('switched off (DSH_ASR_AUTO_INSTALL=0): nothing starts, a clear error, a manual install still works', async () => {
  const b = box('off')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '0'
  const s = await SR.maybeStartAsrAutoInstall()
  check('state disabled (switched off), nothing started', s.state === 'disabled' && s.disabledReason === 'switched-off' && s.auto === false && fake.calls.length === 0, JSON.stringify(s))
  let err = null
  try {
    await SR.transcribeMedia({ mediaPath: tinyWav(join(dirs.media, 'off.wav')) })
  } catch (e) {
    err = e
  }
  check('transcription: code ASR_NOT_INSTALLED, says the automatic install is off and how to turn it back on', err?.code === 'ASR_NOT_INSTALLED' && /DSH_ASR_AUTO_INSTALL=0/.test(err.message) && /去掉这个设置/.test(err.message), err?.message)
  check('… and names more than one way to install (「一键安装」 in the panel, the speech_engine tool)', /一键安装/.test(err?.message) && /speech_engine/.test(err?.message) && fake.calls.length === 0)
  const m = SR.startAsrInstall({ trigger: 'manual' })
  await until(() => fake.calls.length === 1)
  fake.finish()
  await m.promise
  check('installing by hand still works while the automatic install is off', fake.calls.length === 1 && SR.getAsrInstallState().state === 'done')
  let herr = null
  try {
    await SR.transcribeMedia({ mediaPath: tinyWav(join(dirs.media, 'off-2.wav')), home: b.other })
  } catch (e) {
    herr = e
  }
  check('an explicit folder without an engine is never installed into from here; the message says how', herr?.code === 'ASR_NOT_INSTALLED' && /一键安装/.test(herr.message) && fake.calls.length === 1, herr?.message)
})

/* ------------------------------------------------------------------------------------------- failure */
await section('failure: a plain reason, no automatic retry for 10 minutes, an explicit install retries at once', async () => {
  const b = box('fail')
  let calls = 0
  const failing = async () => {
    calls++
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
  }
  reset(failing, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  await SR.maybeStartAsrAutoInstall()
  await until(() => SR.getAsrInstallState().state === 'failed')
  const s = SR.getAsrInstallState()
  check('a network failure → failed with a plain-Chinese reason', s.state === 'failed' && /网络连不上下载服务器/.test(s.error) && calls === 1, s.error)
  check('the state says when the automatic path may try again (about 10 minutes later)', Boolean(s.autoRetryAt) && Date.parse(s.autoRetryAt) - Date.now() > 9 * 60 * 1000, s.autoRetryAt)
  await SR.maybeStartAsrAutoInstall()
  await SR.maybeStartAsrAutoInstall({ delayMs: 5 })
  await sleep(50)
  check('no retry loop: the automatic path does not try again within 10 minutes', calls === 1 && SR.getAsrInstallState().state === 'failed', `${calls} calls`)
  let terr = null
  try {
    await SR.transcribeMedia({ mediaPath: tinyWav(join(dirs.media, 'fail.wav')) })
  } catch (e) {
    terr = e
  }
  check('a feature that needs the engine gets the reason right away (no new download)', terr?.code === 'ASR_NOT_INSTALLED' && /自动准备没有成功/.test(terr.message) && /网络连不上/.test(terr.message) && /重试/.test(terr.message) && calls === 1, terr?.message)
  let eerr = null
  try {
    await SR.startAsrInstall({ trigger: 'manual' }).promise
  } catch (e) {
    eerr = e
  }
  check('an explicit install (「重试」 / speech_engine install) runs at once', calls === 2 && eerr?.code === 'ASR_INSTALL_FAILED' && /网络/.test(eerr.message), eerr?.message)
  // a shortened pause: the automatic path tries again once it is over
  reset(failing, { paths: pathsOf(b), retryAfterMs: 80 })
  await SR.maybeStartAsrAutoInstall()
  await until(() => SR.getAsrInstallState().state === 'failed')
  const n = calls
  await SR.maybeStartAsrAutoInstall()
  check('within the pause: still no retry', calls === n)
  await sleep(120)
  await SR.maybeStartAsrAutoInstall()
  await until(() => calls === n + 1)
  check('once the pause is over the automatic path tries again (once)', calls === n + 1, `${calls - n} new calls`)
  await until(() => SR.getAsrInstallState().state === 'failed')
  const reasons = []
  for (const [fn, want] of [
    [async () => { throw new Error('磁盘空间不足：X 所在分区只剩 100 MB，安装本地语音识别至少需要 420 MB。请换一个空间更大的盘。') }, /^磁盘空间不足/],
    [async () => { throw Object.assign(new Error('文件校验失败（大小 1 · SHA-256 abc…）：https://example.invalid/x'), { code: 'EINTEGRITY' }) }, /校验没通过/],
    [async () => { throw new Error('下载 SenseVoice 失败：HTTP 503 Service Unavailable · https://example.invalid/x') }, /下载服务器暂时不可用/],
    [async () => ({ ok: false, status: { reason: '识别引擎自检失败：缺少运行库' } }), /自检没通过/],
  ]) {
    reset(fn, { paths: pathsOf(b) })
    await SR.startAsrInstall({ trigger: 'manual' }).promise.catch(() => {})
    const st = SR.getAsrInstallState()
    reasons.push(st.state === 'failed' && want.test(st.error) ? 'ok' : `${st.state}: ${st.error}`)
  }
  check('plain reasons: low disk, broken download, server down, failed self-test', reasons.every((x) => x === 'ok'), reasons.join(' | '))
})

/* ------------------------------------------------------------------------------------------- another process */
await section('another process installing the same folder is waited for, never installed twice', async () => {
  if (/[^\x20-\x7e]/.test(SCR)) {
    console.log('SKIP lock test: the scratch path is not ASCII (folders like that get no lock)')
    return
  }
  const b = box('lock')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  mkdirSync(b.recommended, { recursive: true })
  // the parent process (this test's runner / shell) stands in for a studio that is installing right now
  writeFileSync(join(b.recommended, '.install.lock'), JSON.stringify({ pid: process.ppid, token: 'other', startedAt: new Date().toISOString() }))
  writeFileSync(join(b.recommended, '.install.progress.json'), JSON.stringify({ pid: process.ppid, progress: 30, message: '下载中' }))
  const r = SR.startAsrInstall({ trigger: 'auto' })
  await until(() => /另一个窗口正在安装/.test(SR.getAsrInstallState().message))
  await sleep(120)
  const s = SR.getAsrInstallState()
  check('a live lock of another process: wait and show its progress, no second download', fake.calls.length === 0 && s.state === 'running' && s.progress === 30 && /另一个窗口正在安装本地语音识别（30%）/.test(s.message), JSON.stringify({ calls: fake.calls.length, m: s.message, p: s.progress }))
  manifest(b.recommended)
  rmSync(join(b.recommended, '.install.lock'))
  rmSync(join(b.recommended, '.install.progress.json'))
  const res = await r.promise
  check('when it is done its install is used (still no second download)', res?.ok === true && res.sharedInstall === true && fake.calls.length === 0 && SR.getAsrInstallState().state === 'done')
  // a lock left by a process that is gone
  const b2 = box('lock-dead')
  reset(fake.fn, { paths: pathsOf(b2) })
  mkdirSync(b2.recommended, { recursive: true })
  writeFileSync(join(b2.recommended, '.install.lock'), JSON.stringify({ pid: 999999, token: 'gone', startedAt: '2020-01-01T00:00:00Z' }))
  const r2 = SR.startAsrInstall({ trigger: 'auto' })
  await until(() => fake.calls.length === 1)
  let owner = null
  try {
    owner = JSON.parse(readFileSync(join(b2.recommended, '.install.lock'), 'utf8'))
  } catch {}
  check('a lock of a process that is gone is taken over', fake.calls.length === 1 && owner?.pid === process.pid, JSON.stringify(owner))
  fake.finish()
  await r2.promise
  check('the taken-over lock is released at the end', !existsSync(join(b2.recommended, '.install.lock')))
  // a lock of a live process that went silent for longer than 5 minutes
  const b3 = box('lock-silent')
  reset(fake.fn, { paths: pathsOf(b3) })
  mkdirSync(b3.recommended, { recursive: true })
  const lockFile = join(b3.recommended, '.install.lock')
  writeFileSync(lockFile, JSON.stringify({ pid: process.ppid, token: 'silent', startedAt: '2020-01-01T00:00:00Z' }))
  const old = new Date(Date.now() - 10 * 60 * 1000)
  utimesSync(lockFile, old, old)
  const r3 = SR.startAsrInstall({ trigger: 'auto' })
  await until(() => fake.calls.length === 2)
  check('a lock that went silent for more than 5 minutes is taken over', fake.calls.length === 2, `${fake.calls.length} calls`)
  fake.finish()
  await r3.promise
})

/* ------------------------------------------------------------------------------------------- narration check */
await section('narration check: a missing engine starts the background install, the check is skipped with one log line', async () => {
  const b = box('narration')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  const NC = await imp('packages/dsh-tool-media/narration-check.js')
  const { writeScriptJson } = await imp('packages/shared/index.js')
  const proj = join(dirs.ws, 'nc')
  tinyWav(join(proj, 'audio', 'scene-01.wav'), 1)
  writeScriptJson(proj, { title: '回听测试', fps: 30, width: 1280, height: 720, scenes: [{ id: 'scene-01', title: '开场', narration: '今天我们来学习如何剪辑一条短视频。', audioFile: 'audio/scene-01.wav', durationSec: 3, durationInFrames: 90 }] })
  const logs = []
  const res = await Promise.race([
    NC.runNarrationCheck({ projectDir: proj, takes: [{ sceneId: 'scene-01' }], onLog: (m) => logs.push(m), onWarn: (m) => logs.push(m) }),
    sleep(8000).then(() => 'timeout'),
  ])
  await until(() => fake.calls.length === 1)
  check('the check does not wait for the install and skips this film', res !== 'timeout' && res?.ran === false && res?.skipped === 'asr-installing', JSON.stringify(res))
  check('the background install was started', fake.calls.length === 1 && SR.getAsrInstallState().state === 'running')
  check('one log line: 「本地语音识别正在自动准备，准备好后出片会自动回听配音」', logs.length === 1 && logs[0].includes('本地语音识别正在自动准备，准备好后出片会自动回听配音'), logs.join(' | '))
  fake.finish()
  await until(() => SR.getAsrInstallState().state === 'done')
  const fake2 = fakeInstaller()
  reset(fake2.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '0'
  const quiet = []
  const off = await NC.runNarrationCheck({ projectDir: proj, takes: [{ sceneId: 'scene-01' }], onLog: (m) => quiet.push(m), onWarn: (m) => quiet.push(m) })
  check('switched off: skipped quietly as before, nothing installed', off.skipped === 'asr-not-installed' && quiet.length === 0 && fake2.calls.length === 0, quiet.join(' | '))
})

/* ------------------------------------------------------------------------------------------- routes */
await section('routes: asr/status, talk/state and clips/state start the install and return its state', async () => {
  const b = box('routes')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  const routes = await imp('packages/dsh-web-video-workbench/lib/routes-talk.js')
  const jobs = new Map()
  const createBackgroundJob = (msg, runner) => {
    const job = { id: `job-${jobs.size + 1}`, status: 'running', message: msg, progress: 0 }
    const onProgress = (p) => {
      if (!p || typeof p !== 'object') return
      if (Number.isFinite(Number(p.progress))) job.progress = Number(p.progress)
      if (p.message) job.message = String(p.message)
    }
    const done = runner(onProgress).then(
      (r) => Object.assign(job, { status: 'done', result: r }),
      (e) => Object.assign(job, { status: 'error', error: String(e?.message || e) }),
    )
    jobs.set(job.id, { job, done })
    return job
  }
  const call = async (method, path, body, query = '') => {
    const url = new URL(`http://localhost/api/video-workbench/${path}${query}`)
    const req = new Request(url, method === 'GET' ? { method } : { method, body: JSON.stringify(body || {}), headers: { 'Content-Type': 'application/json' } })
    const res = await routes.handleTalkApiRequest(req, url, { createBackgroundJob })
    return { status: res.status, body: await res.json() }
  }
  const proj = join(dirs.ws, 'routes-proj')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: '路由测试', fps: 30, width: 1080, height: 1920, scenes: [] }))
  const st = await call('GET', 'asr/status')
  await until(() => fake.calls.length === 1)
  check('GET asr/status starts the automatic install and returns its state', st.status === 200 && st.body.install?.state === 'running' && Boolean(st.body.installing) && st.body.asr?.ready === false && st.body.installer?.autoInstall === true && fake.calls.length === 1, JSON.stringify(st.body.install))
  const q = `?projectDir=${encodeURIComponent(proj)}`
  const ts = await call('GET', 'talk/state', null, q)
  check('GET talk/state includes the install state (no second install)', ts.status === 200 && ts.body.install?.state === 'running' && ts.body.engine?.ready === false && fake.calls.length === 1, ts.body.error || '')
  const cs = await call('GET', 'clips/state', null, q)
  check('GET clips/state includes the install state', cs.status === 200 && cs.body.install?.state === 'running' && cs.body.engine?.ready === false && fake.calls.length === 1, cs.body.error || '')
  const other = await call('POST', 'asr/install', { installDir: b.other })
  check('POST asr/install into another folder while one runs → 409 BUSY', other.status === 409 && other.body.code === 'BUSY', JSON.stringify(other.body))
  const rel = await call('POST', 'asr/install', { installDir: 'relative/asr' })
  check('POST asr/install with a relative folder → 400', rel.status === 400)
  const joined = await call('POST', 'asr/install', { mirror: 'cn' })
  check('POST asr/install while one runs joins it (a job that follows the same install)', joined.status === 200 && joined.body.joined === true && Boolean(joined.body.jobId) && joined.body.install?.state === 'running' && fake.calls.length === 1, JSON.stringify(joined.body))
  const rec = jobs.get(joined.body.jobId)
  fake.progress(60, '下载中 60%')
  await until(() => rec.job.progress === 60)
  check('the job follows the shared progress', rec.job.progress === 60, JSON.stringify(rec.job))
  fake.finish()
  await rec.done
  const st2 = await call('GET', 'asr/status')
  check('after the install: the job is done, the state says done', rec.job.status === 'done' && st2.body.install?.state === 'done', JSON.stringify(st2.body.install))
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '0'
  const off = await call('GET', 'asr/status')
  check('switched off: asr/status starts nothing and says so', off.body.install?.state === 'disabled' && off.body.install?.disabledReason === 'switched-off' && off.body.installer?.autoInstall === false && fake.calls.length === 1, JSON.stringify(off.body.install))
  const manual = await call('POST', 'asr/install', {})
  await until(() => fake.calls.length === 2)
  check('switched off: 「一键安装」 still installs (a new install, not joined)', manual.status === 200 && manual.body.joined === false && fake.calls.length === 2)
  fake.finish()
  await jobs.get(manual.body.jobId).done
})

/* ------------------------------------------------------------------------------------------- War Room state, MCP */
await section('the War Room state starts it later (unref\'d timer); the MCP server never installs at start', async () => {
  const b = box('delay')
  const fake = fakeInstaller()
  reset(fake.fn, { paths: pathsOf(b) })
  process.env.DSH_ASR_AUTO_INSTALL = '1'
  const s = await SR.maybeStartAsrAutoInstall({ delayMs: 60 })
  await SR.maybeStartAsrAutoInstall({ delayMs: 60 })
  check('a delayed start returns at once, nothing started yet', s.state === 'idle' && fake.calls.length === 0)
  await until(() => fake.calls.length > 0, 3000)
  await sleep(80)
  check('it starts after the delay, once', fake.calls.length === 1 && SR.getAsrInstallState().state === 'running', `${fake.calls.length} calls`)
  fake.finish()
  await until(() => SR.getAsrInstallState().state === 'done')
  const read = (rel) => readFileSync(join(ROOT, ...rel.split('/')), 'utf8')
  check('GET /state schedules it 15 s later', /void maybeStartAsrAutoInstall\(\{ delayMs: 15_000 \}\)/.test(read('packages/dsh-web-video-workbench/lib/index.js')))
  check('the MCP stdio server never starts it at startup', !/maybeStartAsrAutoInstall|startAsrInstall/.test(read('bin/dsh-video-mcp.mjs')))
  check('MCP speech_engine install goes through the shared install', /startAsrInstall\(\{ installDir: args\.installDir \|\| ''/.test(read('packages/dsh-tool-media/index.js')))
  check('vendor/asr/ is never committed; packing still refuses model files', /^vendor\/asr\/$/m.test(read('.gitignore')) && /onnx/.test(read('scripts/pack-bundle.mjs')))
  const kit = read('packages/dsh-web-video-workbench/lib/warroom/kit.js')
  check('the rebuilt panel kit shows the automatic install (口播粗剪 / 长视频拆条)', kit.includes('正在自动准备本地语音识别（首次约 260 MB，装好后一直能用，不用你操作）') && kit.includes('自己选安装位置（高级）') && kit.includes('pollInstall'))
})

SR.setAsrInstallerForTests(null)
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  - ${f.name}`).join('\n'))
  process.exit(1)
}
process.exit(0)
