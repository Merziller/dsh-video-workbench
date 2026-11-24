#!/usr/bin/env node
/**
 * Standalone tests: 「另存为」 for deliverables — the server side of the panel kit's save flow
 * (packages/dsh-web-video-workbench/lib/save-dialog.js + POST /api/video-workbench/delivery/save-as in routes-delivery.js).
 * Covers: the source must be a file inside an existing project (no `..`, absolute paths, NUL, symlink/junction escapes),
 * the destination only ever comes from the dialog (never from the request), local-page-only checks (Host / Origin /
 * Sec-Fetch-Site), one dialog at a time, the copy itself (Chinese paths, overwrite, failure cleanup), the PowerShell
 * dialog launcher (arguments / environment / output parsing / timeout) with a fake process, and the allow-list entry.
 *
 *   node scripts/tests/save-as.test.mjs
 *
 * No real dialog is ever opened: DSH_VIDEO_NATIVE_DIALOG=off for the whole run and every launcher test injects a fake
 * spawn. Env: DSH_SAVE_AS_TEST_DIR (scratch root), DSH_SAVE_AS_TEST_FILTER=<regex>.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.DSH_VIDEO_NATIVE_DIALOG = 'off'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const SCRATCH = resolve(process.env.DSH_SAVE_AS_TEST_DIR || join(REPO, '.tmp', 'save-as-test', `run-${process.pid}`))
mkdirSync(SCRATCH, { recursive: true })
const ENV_FILE = join(SCRATCH, 'test.env')
writeFileSync(ENV_FILE, '# save-as test\n')
process.env.DSH_VIDEO_ENV_PATH = ENV_FILE

const imp = (rel) => import(pathToFileURL(join(REPO, rel)).href)
const sd = await imp('packages/dsh-web-video-workbench/lib/save-dialog.js')
const routes = await imp('packages/dsh-web-video-workbench/lib/routes-delivery.js')
const {
  dialogFilter,
  nativeDialogRejection,
  parseDialogOutput,
  resolveDeliverableSource,
  SaveAsError,
  saveDeliverableAs,
  showNativeSaveDialog,
  suggestedFileName,
  validateDialogPath,
  windowsSaveDialogScript,
} = sd

// ------------------------------------------------------------------------------------------
// Harness + fixtures
// ------------------------------------------------------------------------------------------
const results = []
const FILTER = process.env.DSH_SAVE_AS_TEST_FILTER ? new RegExp(process.env.DSH_SAVE_AS_TEST_FILTER, 'i') : null
async function test(name, fn) {
  if (FILTER && !FILTER.test(name)) return
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass' })
    console.log(`✔ ${name} (${Date.now() - t0} ms)`)
  } catch (err) {
    results.push({ name, status: 'fail', err })
    console.log(`✘ ${name}\n    ${String(err?.stack || err).split('\n').slice(0, 6).join('\n    ')}`)
  }
}
const rejectsCode = (p, code, status) =>
  assert.rejects(p, (err) => {
    assert.ok(err instanceof SaveAsError, `SaveAsError expected, got ${err?.name}: ${err?.message}`)
    assert.equal(err.code, code, err.message)
    if (status) assert.equal(err.status, status)
    return true
  })
const throwsCode = (fn, code) => {
  try {
    fn()
  } catch (err) {
    assert.ok(err instanceof SaveAsError, `SaveAsError expected, got ${err?.name}: ${err?.message}`)
    assert.equal(err.code, code, err.message)
    return
  }
  assert.fail(`expected ${code}`)
}

const PROJECT = join(SCRATCH, 'ws', '秋日 咖啡馆 project')
const FILM = randomBytes(3 * 1024 * 1024 + 123)
mkdirSync(join(PROJECT, 'output', 'export'), { recursive: true })
writeFileSync(join(PROJECT, 'script.json'), JSON.stringify({ title: 'test', scenes: [] }))
writeFileSync(join(PROJECT, 'output', 'final.mp4'), FILM)
writeFileSync(join(PROJECT, 'output', 'export', 'final.srt'), '1\n00:00:00,000 --> 00:00:01,000\n测试\n')
const OUTSIDE = join(SCRATCH, 'outside')
mkdirSync(OUTSIDE, { recursive: true })
writeFileSync(join(OUTSIDE, 'secret.txt'), 'not part of the project')
let junctionOk = false
try {
  symlinkSync(OUTSIDE, join(PROJECT, 'output', 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  junctionOk = true
} catch {}
const NOT_A_PROJECT = join(SCRATCH, 'not-a-project')
mkdirSync(NOT_A_PROJECT, { recursive: true })
writeFileSync(join(NOT_A_PROJECT, 'final.mp4'), 'x')
const DEST_DIR = join(SCRATCH, '导出 位置')
mkdirSync(DEST_DIR, { recursive: true })
const LOCAL_REQ = { headers: { host: '127.0.0.1:4463', origin: 'http://127.0.0.1:4463', 'sec-fetch-site': 'same-origin' } }

/** fake child_process.spawn: records the call, the child behaves as scripted (never a real process) */
function fakeSpawn(behave) {
  const calls = []
  const impl = (cmd, args, opts) => {
    calls.push({ cmd, args, opts })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => setImmediate(() => child.emit('close', null))
    setImmediate(() => behave(child))
    return child
  }
  return { impl, calls }
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64')
/** run fn with the native dialog switched on (the launcher still gets a fake spawn), restoring 'off' right after the call */
const withDialogOn = (fn) => {
  delete process.env.DSH_VIDEO_NATIVE_DIALOG
  try {
    return fn()
  } finally {
    process.env.DSH_VIDEO_NATIVE_DIALOG = 'off'
  }
}

// ------------------------------------------------------------------------------------------
// Source validation
// ------------------------------------------------------------------------------------------
await test('source: a file inside the project resolves (size, name, normalised rel)', () => {
  const s = resolveDeliverableSource({ projectDir: PROJECT, rel: 'output/final.mp4' })
  assert.equal(s.source, join(PROJECT, 'output', 'final.mp4'))
  assert.equal(s.bytes, FILM.length)
  assert.equal(s.name, 'final.mp4')
  assert.equal(resolveDeliverableSource({ projectDir: PROJECT, rel: 'output\\export\\final.srt' }).rel, 'output/export/final.srt')
})

await test('source: anything outside the project is refused (.., absolute, drive, NUL)', () => {
  for (const rel of ['../outside/secret.txt', 'output/../../outside/secret.txt', '..\\outside\\secret.txt', join(OUTSIDE, 'secret.txt'), '/etc/passwd', 'C:/Windows/win.ini', 'c:secret.txt']) {
    throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel }), 'OUTSIDE_PROJECT')
  }
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: 'output/final.mp4\0.txt' }), 'BAD_REL')
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: '' }), 'BAD_REL')
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: 42 }), 'BAD_REL')
})

await test('source: a junction / symlink inside the project may not lead out of it', () => {
  if (!junctionOk) return console.log('    (could not create a junction here — check skipped)')
  assert.ok(existsSync(join(PROJECT, 'output', 'escape', 'secret.txt')), 'fixture: the junction works')
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: 'output/escape/secret.txt' }), 'OUTSIDE_PROJECT')
})

await test('source: the project must exist and be a video project; the file must exist and be a file', () => {
  throwsCode(() => resolveDeliverableSource({ projectDir: '', rel: 'output/final.mp4' }), 'BAD_PROJECT')
  throwsCode(() => resolveDeliverableSource({ projectDir: 'relative/project', rel: 'output/final.mp4' }), 'BAD_PROJECT')
  throwsCode(() => resolveDeliverableSource({ projectDir: `${PROJECT}\0`, rel: 'output/final.mp4' }), 'BAD_PROJECT')
  throwsCode(() => resolveDeliverableSource({ projectDir: join(SCRATCH, 'missing'), rel: 'output/final.mp4' }), 'PROJECT_NOT_FOUND')
  throwsCode(() => resolveDeliverableSource({ projectDir: NOT_A_PROJECT, rel: 'final.mp4' }), 'PROJECT_NOT_FOUND')
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: 'output/missing.mp4' }), 'SOURCE_NOT_FOUND')
  throwsCode(() => resolveDeliverableSource({ projectDir: PROJECT, rel: 'output/export' }), 'NOT_A_FILE')
})

// ------------------------------------------------------------------------------------------
// Names, filters, dialog answers, request checks
// ------------------------------------------------------------------------------------------
await test('suggested name: safe characters, always the real extension, reserved / empty names fall back', () => {
  assert.equal(suggestedFileName('秋日咖啡馆 新品宣传', 'final.mp4'), '秋日咖啡馆 新品宣传.mp4')
  assert.equal(suggestedFileName('a/b\\c:d*?"<>|e', 'final.mp4'), 'a_b_c_d_e.mp4')
  assert.equal(suggestedFileName('Film.MP4', 'final.mp4'), 'Film.mp4')
  assert.equal(suggestedFileName('trailing. . ', 'x.srt'), 'trailing.srt')
  assert.equal(suggestedFileName('CON', 'final.mp4'), 'final.mp4')
  assert.equal(suggestedFileName('', 'final.mp4'), 'final.mp4')
  assert.equal(suggestedFileName('line\nbreak\ttab', 'final.mp4'), 'line_break_tab.mp4')
  assert.ok(suggestedFileName('长'.repeat(400), 'a.mp4').length <= 124)
})

await test('dialog filter per extension', () => {
  assert.equal(dialogFilter('mp4'), 'MP4 视频 (*.mp4)|*.mp4|所有文件 (*.*)|*.*')
  assert.equal(dialogFilter('.SRT'), 'SRT 字幕 (*.srt)|*.srt|所有文件 (*.*)|*.*')
  assert.equal(dialogFilter(''), '所有文件 (*.*)|*.*')
  assert.equal(dialogFilter('x|y'), 'XY 文件 (*.xy)|*.xy|所有文件 (*.*)|*.*', 'no filter separators from the input')
})

await test('dialog answer parsing: OK:<base64 UTF-8 path> / CANCEL / anything else is no answer', () => {
  const p = 'D:\\视频 导出\\我的成片.mp4'
  assert.deepEqual(parseDialogOutput(`OK:${b64(p)}`), { path: p })
  assert.deepEqual(parseDialogOutput(`\uFEFFWARNING: something\r\nOK:${b64(p)}\r\n`), { path: p }, 'only the last line counts')
  assert.deepEqual(parseDialogOutput('CANCEL'), { cancelled: true })
  for (const bad of ['', 'OK:', 'OK:!!!', `OK:${b64(p)} extra`, 'Exception: boom', `OK:${b64('a\0b')}`]) assert.equal(parseDialogOutput(bad), null, bad)
})

await test('dialog path validation: absolute file paths only', () => {
  assert.equal(validateDialogPath(join(DEST_DIR, 'a.mp4')), join(DEST_DIR, 'a.mp4'))
  for (const bad of ['', 'relative/a.mp4', 'a.mp4', `${join(DEST_DIR, 'a')}\0.mp4`, null]) throwsCode(() => validateDialogPath(bad), 'BAD_DESTINATION')
  throwsCode(() => validateDialogPath(DEST_DIR), 'BAD_DESTINATION')
})

await test('request check: only studio pages on this computer may open the dialog', () => {
  const H = (headers) => nativeDialogRejection({ headers })
  assert.equal(H({ host: '127.0.0.1:4463' }), '')
  assert.equal(H({ host: 'localhost:4399', origin: 'http://localhost:4399', 'sec-fetch-site': 'same-origin' }), '')
  assert.equal(H({ host: '[::1]:4463', origin: 'http://[::1]:4463' }), '')
  assert.equal(H({ host: 'studio.localhost:5140' }), '')
  assert.equal(H({ host: '192.168.1.20:4399' }), 'host', 'a page opened from another computer')
  assert.equal(H({ host: 'evil.example' }), 'host', 'DNS rebinding')
  assert.equal(H({ host: '127.0.0.1:4463', origin: 'https://evil.example' }), 'origin')
  assert.equal(H({ host: '127.0.0.1:4463', origin: 'null' }), 'origin')
  assert.equal(H({ host: '127.0.0.1:4463', 'sec-fetch-site': 'cross-site' }), 'site')
  assert.equal(H({ host: '127.0.0.1:4463', 'sec-fetch-site': 'same-site' }), 'site', 'another local web server')
  // Fetch API Request objects (what the router receives), incl. a Request without a Host header
  assert.equal(nativeDialogRejection(new Request('http://127.0.0.1:4463/api/video-workbench/delivery/save-as', { method: 'POST' })), '')
  assert.equal(nativeDialogRejection(new Request('http://192.168.1.20:4399/api/video-workbench/delivery/save-as', { method: 'POST' })), 'host')
  assert.equal(nativeDialogRejection(new Request('http://127.0.0.1:4463/x', { method: 'POST', headers: { origin: 'https://evil.example' } })), 'origin')
  assert.equal(nativeDialogRejection(null), 'host')
})

// ------------------------------------------------------------------------------------------
// The PowerShell launcher (fake spawn — no window ever opens)
// ------------------------------------------------------------------------------------------
await test('launcher: switched off / not Windows → NATIVE_DIALOG_UNAVAILABLE without starting anything', async () => {
  const f = fakeSpawn(() => {})
  await rejectsCode(showNativeSaveDialog({ fileName: 'a.mp4', ext: 'mp4', spawnImpl: f.impl, platform: 'win32' }), 'NATIVE_DIALOG_UNAVAILABLE', 501)
  await rejectsCode(withDialogOn(() => showNativeSaveDialog({ fileName: 'a.mp4', ext: 'mp4', spawnImpl: f.impl, platform: 'linux' })), 'NATIVE_DIALOG_UNAVAILABLE', 501)
  assert.equal(f.calls.length, 0)
})

await test('launcher: hidden STA PowerShell, one readable -Command line, every caller text only in env vars', async () => {
  const picked = 'D:\\视频 导出\\我的成片.mp4'
  const f = fakeSpawn((c) => {
    c.stdout.emit('data', Buffer.from(`OK:${b64(picked)}`))
    c.emit('close', 0)
  })
  const evilName = '成片 "x"; Remove-Item -Recurse C:\\ #.mp4'
  const res = await withDialogOn(() => showNativeSaveDialog({ title: '选择成片的保存位置', fileName: evilName, ext: 'mp4', spawnImpl: f.impl, platform: 'win32' }))
  assert.deepEqual(res, { path: picked })
  assert.equal(f.calls.length, 1)
  const { cmd, args, opts } = f.calls[0]
  assert.match(cmd, /powershell\.exe$/i)
  for (const a of ['-NoProfile', '-NonInteractive', '-STA', '-Command']) assert.ok(args.includes(a), a)
  assert.ok(!args.includes('-EncodedCommand'), 'a readable command, no encoded blob')
  const script = args[args.indexOf('-Command') + 1]
  assert.equal(script, windowsSaveDialogScript())
  assert.ok(!/["\r\n]/.test(script), 'one line without double quotes: reaches PowerShell unchanged through the Windows command line')
  assert.ok(!script.includes('Remove-Item') && !script.includes('成片'), 'no caller text inside the script')
  assert.match(script, /TopMost = \$true/)
  assert.match(script, /SaveFileDialog/)
  assert.match(script, /OverwritePrompt = \$true/)
  assert.equal(opts.windowsHide, true)
  assert.equal(opts.env.DSH_SAVE_NAME, evilName)
  assert.equal(opts.env.DSH_SAVE_TITLE, '选择成片的保存位置')
  assert.equal(opts.env.DSH_SAVE_FILTER, 'MP4 视频 (*.mp4)|*.mp4|所有文件 (*.*)|*.*')
  assert.equal(opts.env.DSH_SAVE_EXT, 'mp4')
})

await test('launcher: cancel, crash and timeout answers', async () => {
  const cancel = fakeSpawn((c) => {
    c.stdout.emit('data', Buffer.from('CANCEL'))
    c.emit('close', 0)
  })
  assert.deepEqual(await withDialogOn(() => showNativeSaveDialog({ spawnImpl: cancel.impl, platform: 'win32' })), { cancelled: true })
  const crash = fakeSpawn((c) => {
    c.stderr.emit('data', Buffer.from('Add-Type : Cannot load System.Windows.Forms'))
    c.emit('close', 1)
  })
  await rejectsCode(withDialogOn(() => showNativeSaveDialog({ spawnImpl: crash.impl, platform: 'win32' })), 'NATIVE_DIALOG_UNAVAILABLE', 501)
  const spawnErr = fakeSpawn((c) => c.emit('error', new Error('spawn powershell.exe ENOENT')))
  await rejectsCode(withDialogOn(() => showNativeSaveDialog({ spawnImpl: spawnErr.impl, platform: 'win32' })), 'NATIVE_DIALOG_UNAVAILABLE', 501)
  const hang = fakeSpawn(() => {})
  assert.deepEqual(await withDialogOn(() => showNativeSaveDialog({ spawnImpl: hang.impl, platform: 'win32', timeoutMs: 60 })), { cancelled: true, timedOut: true })
})

await test('launcher: the real PowerShell script runs up to the dialog (ShowDialog swapped out — no window ever opens)', async () => {
  if (process.platform !== 'win32') return console.log('    (Windows only — skipped)')
  const script = windowsSaveDialogScript()
  const SHOW = 'try { $r = $dlg.ShowDialog($owner) } finally { $owner.Dispose() }'
  assert.ok(script.includes(SHOW), 'fixture: the dialog line to swap out')
  const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  for (const [result, expect] of [
    ['Cancel', (out) => assert.deepEqual(parseDialogOutput(out), { cancelled: true })],
    // "OK": the script reports $dlg.FileName (here the suggested name) → checks the UTF-8 base64 round trip of a Chinese path
    ['OK', (out) => assert.deepEqual(parseDialogOutput(out), { path: 'D:\\视频 导出\\秋日 咖啡馆.mp4' })],
  ]) {
    const dry = script.replace(SHOW, `$r = [System.Windows.Forms.DialogResult]::${result}; $owner.Dispose()`)
    assert.ok(!/ShowDialog|\.Show\(/.test(dry), 'the dry run must never open a window')
    const r = spawnSync(ps, ['-NoProfile', '-NonInteractive', '-STA', '-Command', dry], {
      env: { ...process.env, DSH_SAVE_TITLE: '选择成片的保存位置', DSH_SAVE_NAME: 'D:\\视频 导出\\秋日 咖啡馆.mp4', DSH_SAVE_FILTER: dialogFilter('mp4'), DSH_SAVE_EXT: 'mp4' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90_000,
    })
    assert.equal(r.status, 0, `${result}: ${r.stderr}`)
    assert.equal(String(r.stderr || '').trim(), '', 'no PowerShell errors (Add-Type, filter format, property names)')
    expect(r.stdout)
  }
})

// ------------------------------------------------------------------------------------------
// saveDeliverableAs (injected dialog)
// ------------------------------------------------------------------------------------------
const leftovers = (dir) => readdirSync(dir).filter((n) => n.includes('.dsh-saving-'))

await test('save: copies the project file to the place picked in the dialog (Chinese path)', async () => {
  const dest = join(DEST_DIR, '我的成片.mp4')
  let asked = null
  const res = await saveDeliverableAs({
    projectDir: PROJECT,
    rel: 'output/final.mp4',
    suggestedName: '秋日咖啡馆',
    what: '成片',
    request: LOCAL_REQ,
    dialog: async (o) => {
      asked = o
      return { path: dest }
    },
  })
  assert.deepEqual(asked, { title: '选择成片的保存位置', fileName: '秋日咖啡馆.mp4', ext: 'mp4' })
  assert.equal(res.cancelled, false)
  assert.equal(res.savedPath, dest)
  assert.equal(res.fileName, '我的成片.mp4')
  assert.equal(res.bytes, FILM.length)
  assert.ok(readFileSync(dest).equals(FILM), 'identical bytes')
  assert.deepEqual(leftovers(DEST_DIR), [])
})

await test('save: an existing file at the picked place is replaced (the dialog asked before)', async () => {
  const dest = join(DEST_DIR, 'existing.srt')
  writeFileSync(dest, 'old content')
  await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/export/final.srt', dialog: async () => ({ path: dest }) })
  assert.equal(readFileSync(dest, 'utf8'), readFileSync(join(PROJECT, 'output', 'export', 'final.srt'), 'utf8'))
  assert.deepEqual(leftovers(DEST_DIR), [])
})

await test('save: cancelling / timing out writes nothing', async () => {
  const before = readdirSync(DEST_DIR).sort()
  assert.deepEqual(await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ cancelled: true }) }), { cancelled: true })
  assert.deepEqual(await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ cancelled: true, timedOut: true }) }), { cancelled: true, timedOut: true })
  assert.deepEqual(await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => null }), { cancelled: true })
  assert.deepEqual(readdirSync(DEST_DIR).sort(), before)
})

await test('save: picking the file itself changes nothing', async () => {
  const res = await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ path: join(PROJECT, 'output', 'final.mp4') }) })
  assert.equal(res.unchanged, true)
  assert.ok(readFileSync(join(PROJECT, 'output', 'final.mp4')).equals(FILM))
})

await test('save: invalid dialog answers and copy failures are clear errors, never half-written files', async () => {
  await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ path: 'relative.mp4' }) }), 'BAD_DESTINATION', 400)
  await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ path: DEST_DIR }) }), 'BAD_DESTINATION', 400)
  const gone = join(SCRATCH, 'no-such-folder', 'x.mp4')
  await assert.rejects(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ path: gone }) }), (err) => {
    assert.equal(err.code, 'COPY_FAILED')
    assert.match(err.message, /文件夹已经不存在|重新选择/)
    return true
  })
  assert.equal(existsSync(dirname(gone)), false)
})

await test('save: the source is validated before any dialog is shown', async () => {
  let shown = 0
  const dialog = async () => {
    shown++
    return { path: join(DEST_DIR, 'never.txt') }
  }
  await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: '../outside/secret.txt', dialog }), 'OUTSIDE_PROJECT', 400)
  await rejectsCode(saveDeliverableAs({ projectDir: NOT_A_PROJECT, rel: 'final.mp4', dialog }), 'PROJECT_NOT_FOUND', 404)
  await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/missing.mp4', dialog }), 'SOURCE_NOT_FOUND', 404)
  assert.equal(shown, 0)
  assert.equal(existsSync(join(DEST_DIR, 'never.txt')), false)
})

await test('save: a request from another computer / website never opens the dialog', async () => {
  let shown = 0
  const dialog = async () => {
    shown++
    return { cancelled: true }
  }
  for (const headers of [{ host: '192.168.1.20:4399' }, { host: '127.0.0.1:4463', origin: 'https://evil.example' }, { host: '127.0.0.1:4463', 'sec-fetch-site': 'cross-site' }]) {
    await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', request: { headers }, dialog }), 'NATIVE_DIALOG_REMOTE', 403)
  }
  assert.equal(shown, 0)
})

await test('save: one dialog at a time (second request → NATIVE_DIALOG_BUSY, works again afterwards)', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const first = saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: () => gate })
  await new Promise((r) => setImmediate(r))
  await rejectsCode(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ cancelled: true }) }), 'NATIVE_DIALOG_BUSY', 409)
  release({ cancelled: true })
  assert.deepEqual(await first, { cancelled: true })
  assert.deepEqual(await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ cancelled: true }) }), { cancelled: true })
  // a failing dialog also frees the slot
  await assert.rejects(saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => Promise.reject(new SaveAsError('x', 'NATIVE_DIALOG_UNAVAILABLE', 501)) }))
  assert.deepEqual(await saveDeliverableAs({ projectDir: PROJECT, rel: 'output/final.mp4', dialog: async () => ({ cancelled: true }) }), { cancelled: true })
})

// ------------------------------------------------------------------------------------------
// The route
// ------------------------------------------------------------------------------------------
const ROUTE = '/api/video-workbench/delivery/save-as'
const call = async (body, { method = 'POST', host = '127.0.0.1:4463', headers = {} } = {}) => {
  const req = new Request(`http://${host}${ROUTE}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  })
  const res = await routes.handleDeliveryApiRequest(req, new URL(req.url))
  return { status: res.status, body: await res.json() }
}

await test('route: registered with the delivery routes (DSH host registration + kit allow-list)', () => {
  assert.ok(routes.DELIVERY_ROUTES.some((r) => r.path === ROUTE && r.methods.includes('POST')))
  assert.equal(routes.isDeliveryRoute(ROUTE), true)
  const client = readFileSync(join(REPO, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js'), 'utf8')
  const setOf = (name) => (new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(client) || [])[1] || ''
  assert.match(setOf('KIT_API_POST'), /'delivery\/save-as'/)
  assert.match(setOf('KIT_API_NO_REFRESH'), /'delivery\/save-as'/, 'saving a copy changes no project data')
  assert.doesNotMatch(setOf('KIT_API_GET'), /delivery\/save-as/)
})

await test('route: bad input → 400/404 with a code, wrong method → 405', async () => {
  let r = await call({ projectDir: PROJECT, rel: '../outside/secret.txt' })
  assert.equal(r.status, 400)
  assert.equal(r.body.code, 'OUTSIDE_PROJECT')
  r = await call({ projectDir: PROJECT, rel: 'output/missing.mp4' })
  assert.equal(r.status, 404)
  assert.equal(r.body.code, 'SOURCE_NOT_FOUND')
  r = await call('[1,2,3]')
  assert.equal(r.status, 400)
  r = await call('not json')
  assert.equal(r.status, 400)
  r = await call(null, { method: 'GET' })
  assert.equal(r.status, 405)
})

await test('route: a destination in the request is ignored — with the dialog off nothing is written anywhere', async () => {
  const sneaky = join(SCRATCH, 'sneaky', 'stolen.mp4')
  const r = await call({ projectDir: PROJECT, rel: 'output/final.mp4', destPath: sneaky, savedPath: sneaky, path: sneaky, dest: sneaky })
  assert.equal(r.status, 501)
  assert.equal(r.body.ok, false)
  assert.equal(r.body.code, 'NATIVE_DIALOG_UNAVAILABLE', 'the kit falls back to a plain download')
  assert.equal(existsSync(sneaky), false)
  assert.equal(existsSync(dirname(sneaky)), false)
})

await test('route: requests from another computer / website → 403 NATIVE_DIALOG_REMOTE', async () => {
  let r = await call({ projectDir: PROJECT, rel: 'output/final.mp4' }, { host: '192.168.1.20:4399' })
  assert.equal(r.status, 403)
  assert.equal(r.body.code, 'NATIVE_DIALOG_REMOTE')
  r = await call({ projectDir: PROJECT, rel: 'output/final.mp4' }, { headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
  r = await call({ projectDir: PROJECT, rel: 'output/final.mp4' }, { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(r.status, 403)
})

await test('kit: the save module is in the built kit.js (rebuilt after the source changed)', () => {
  const kit = readFileSync(join(REPO, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit.js'), 'utf8')
  const src = readFileSync(join(REPO, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit', 'src', '55-save-file.js'), 'utf8').replace(/^\uFEFF/, '')
  assert.ok(kit.includes('/* ---- 55-save-file.js ---- */'))
  assert.ok(kit.includes(src.trim().split('\n').slice(-12).join('\n')), 'kit.js holds the current 55-save-file.js (run kit/build.mjs)')
  assert.match(src, /delivery\/save-as/)
  assert.match(src, /showSaveFilePicker/)
})

// ------------------------------------------------------------------------------------------
// Summary + cleanup
// ------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.status === 'fail')
const passed = results.filter((r) => r.status === 'pass')
if (!process.env.DSH_SAVE_AS_TEST_DIR) {
  try {
    rmSync(SCRATCH, { recursive: true, force: true })
    if (!readdirSync(dirname(SCRATCH)).length) rmdirSync(dirname(SCRATCH))
  } catch {}
}
console.log(`\n${passed.length} passed, ${failed.length} failed`)
process.exitCode = failed.length ? 1 : 0
