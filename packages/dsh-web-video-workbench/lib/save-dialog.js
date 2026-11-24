/**
 * 「另存为」 for finished deliverables (成片 MP4, 交付包 / 发布包文件 …). The studio server runs on the user's own computer,
 * so when the browser frame cannot show its own save picker (File System Access API missing or blocked, e.g. Firefox or
 * a cross-origin frame), the panel kit asks this module to show the operating system's Save-As window and copy the
 * project file to the place picked there (route POST /api/video-workbench/delivery/save-as, see routes-delivery.js).
 *
 * Safety rules (unit-tested in scripts/tests/save-as.test.mjs):
 *   - the source must be an existing regular file inside an existing video project (projectDir containing script.json);
 *     `rel` is relative — never absolute, `..` or NUL — and a symlink / junction may not lead out of the project;
 *   - the destination ALWAYS comes from the native dialog: a request has no destination field at all;
 *   - the dialog is only shown for a studio page on this computer (loopback Host / Origin, not a cross-site or same-site
 *     foreign page), one dialog at a time; DSH_VIDEO_NATIVE_DIALOG=off disables it (tests, kiosks, remote setups).
 * Windows only (PowerShell + System.Windows.Forms.SaveFileDialog with a TopMost owner, so it opens in front of the
 * browser); elsewhere the route answers NATIVE_DIALOG_UNAVAILABLE and the kit falls back to a plain download.
 */
import { spawn } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { copyFile, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export class SaveAsError extends Error {
  constructor(message, code, status = 400) {
    super(message)
    this.name = 'SaveAsError'
    this.code = code
    this.status = status
    this.expose = true
  }
}

const isInside = (base, p) => {
  const r = relative(base, p)
  return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r)
}
const samePath = (a, b) => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b))

/**
 * Validate the file to save: `projectDir` (absolute, an existing video project) + `rel` (a file inside it).
 * → { projectDir, rel, source, bytes, name } or throws SaveAsError (400 bad input / 404 missing).
 */
export function resolveDeliverableSource({ projectDir, rel } = {}) {
  const dirRaw = typeof projectDir === 'string' ? projectDir.trim() : ''
  if (!dirRaw) throw new SaveAsError('缺少 projectDir（视频工程文件夹）', 'BAD_PROJECT', 400)
  if (dirRaw.length > 1024 || dirRaw.includes('\0') || !isAbsolute(dirRaw)) throw new SaveAsError('projectDir 无效：必须是视频工程文件夹的完整路径', 'BAD_PROJECT', 400)
  const root = resolve(dirRaw)
  let dirStat = null
  try {
    dirStat = statSync(root)
  } catch {}
  if (!dirStat || !dirStat.isDirectory() || !existsSync(join(root, 'script.json'))) {
    throw new SaveAsError('找不到这个视频工程（文件夹不存在，或里面没有 script.json）', 'PROJECT_NOT_FOUND', 404)
  }
  const relRaw = typeof rel === 'string' ? rel.trim() : ''
  if (!relRaw || relRaw.length > 1024 || relRaw.includes('\0')) throw new SaveAsError('缺少要保存的文件', 'BAD_REL', 400)
  const relNorm = relRaw.replace(/\\/g, '/')
  if (isAbsolute(relRaw) || relNorm.startsWith('/') || /^[a-zA-Z]:/.test(relNorm) || relNorm.split('/').includes('..')) {
    throw new SaveAsError('只能保存工程文件夹里的文件', 'OUTSIDE_PROJECT', 400)
  }
  const source = resolve(root, relNorm)
  if (!isInside(root, source)) throw new SaveAsError('只能保存工程文件夹里的文件', 'OUTSIDE_PROJECT', 400)
  let fileStat = null
  try {
    fileStat = statSync(source)
  } catch {}
  if (!fileStat) throw new SaveAsError(`文件不存在：${relNorm}（可能还没有生成，或已经被删除）`, 'SOURCE_NOT_FOUND', 404)
  if (!fileStat.isFile()) throw new SaveAsError('只能保存单个文件', 'NOT_A_FILE', 400)
  // a symlink / junction inside the project may not lead out of it
  let realRoot = root
  let realSource = source
  try {
    realRoot = realpathSync(root)
    realSource = realpathSync(source)
  } catch {}
  if (!isInside(realRoot, realSource)) throw new SaveAsError('只能保存工程文件夹里的文件', 'OUTSIDE_PROJECT', 400)
  return { projectDir: root, rel: relNorm, source, bytes: fileStat.size, name: basename(source) }
}

const BAD_NAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g
const RESERVED_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** A safe file name for the dialog: the suggested name (e.g. the film title) with the source file's own extension. */
export function suggestedFileName(suggested, sourceName) {
  const ext = extname(String(sourceName || ''))
  let base = String(suggested || '').replace(BAD_NAME_CHARS, '_').replace(/\s+/g, ' ').trim()
  if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length)
  base = base.replace(/[. ]+$/, '').slice(0, 120).trim()
  if (!base || RESERVED_NAME.test(base)) base = basename(String(sourceName || ''), ext).replace(BAD_NAME_CHARS, '_') || 'file'
  return `${base}${ext}`
}

const TYPE_LABELS = {
  mp4: 'MP4 视频', mov: 'MOV 视频', webm: 'WebM 视频', mkv: 'MKV 视频',
  wav: 'WAV 音频', mp3: 'MP3 音频', m4a: 'M4A 音频', aac: 'AAC 音频', flac: 'FLAC 音频',
  png: 'PNG 图片', jpg: 'JPEG 图片', jpeg: 'JPEG 图片', webp: 'WebP 图片', gif: 'GIF 图片',
  srt: 'SRT 字幕', vtt: 'WebVTT 字幕', ass: 'ASS 字幕',
  xml: 'XML 剪辑时间线', fcpxml: 'Final Cut Pro 时间线', edl: 'EDL 剪辑表', otio: 'OTIO 时间线',
  json: 'JSON 文件', md: 'Markdown 文档', txt: '文本文件', csv: 'CSV 表格', zip: 'ZIP 压缩包', cube: 'LUT 调色文件',
}
/** Windows SaveFileDialog filter for one extension: "MP4 视频 (*.mp4)|*.mp4|所有文件 (*.*)|*.*" */
export function dialogFilter(ext) {
  const e = String(ext || '').replace(/^\./, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase()
  if (!e) return '所有文件 (*.*)|*.*'
  return `${TYPE_LABELS[e] || `${e.toUpperCase()} 文件`} (*.${e})|*.${e}|所有文件 (*.*)|*.*`
}

const LOOPBACK = (name) => name === 'localhost' || name.endsWith('.localhost') || name === '::1' || /^127(?:\.\d{1,3}){3}$/.test(name)
const hostnameOf = (hostHeader) =>
  String(hostHeader || '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')

/**
 * '' when a native dialog may be shown for this request, else why not ('host' | 'origin' | 'site'): it must come from a
 * studio page served on this computer (loopback Host and Origin) and not from another web page (Sec-Fetch-Site).
 * Accepts a Fetch API Request or a plain headers object.
 */
export function nativeDialogRejection(req) {
  const headers = req && req.headers
  const get = (k) => String((typeof headers?.get === 'function' ? headers.get(k) : headers?.[k]) || '')
  let host = hostnameOf(get('host'))
  if (!host) {
    try {
      host = hostnameOf(new URL(String(req && req.url)).host)
    } catch {}
  }
  if (!host || !LOOPBACK(host)) return 'host'
  const origin = get('origin').trim()
  if (origin) {
    let oh = ''
    try {
      oh = hostnameOf(new URL(origin).host)
    } catch {}
    if (!oh || !LOOPBACK(oh)) return 'origin'
  }
  const site = get('sec-fetch-site').trim().toLowerCase()
  if (site === 'cross-site' || site === 'same-site') return 'site'
  return ''
}

export function nativeDialogDisabled(env = process.env) {
  return ['0', 'off', 'false', 'no'].includes(String(env.DSH_VIDEO_NATIVE_DIALOG || '').trim().toLowerCase())
}

/**
 * The PowerShell command behind the dialog (one readable line, passed with -Command). It has no inputs of its own:
 * title, file name, filter and default extension come from environment variables, so no caller text is ever part of
 * the code. Prints exactly one line: `OK:<base64 of the UTF-8 path>` or `CANCEL`.
 */
export function windowsSaveDialogScript() {
  return [
    "$ErrorActionPreference = 'Stop'",
    // no progress records (PowerShell serialises them to stderr as CLIXML when the output is redirected)
    "$ProgressPreference = 'SilentlyContinue'",
    'Add-Type -AssemblyName System.Windows.Forms',
    '[System.Windows.Forms.Application]::EnableVisualStyles()',
    // an invisible TopMost owner keeps the dialog in front of the browser window (the server has no window of its own)
    '$owner = New-Object System.Windows.Forms.Form',
    '$owner.TopMost = $true',
    '$owner.ShowInTaskbar = $false',
    '$dlg = New-Object System.Windows.Forms.SaveFileDialog',
    '$dlg.Title = $env:DSH_SAVE_TITLE',
    '$dlg.FileName = $env:DSH_SAVE_NAME',
    'if ($env:DSH_SAVE_FILTER) { $dlg.Filter = $env:DSH_SAVE_FILTER }',
    'if ($env:DSH_SAVE_EXT) { $dlg.DefaultExt = $env:DSH_SAVE_EXT; $dlg.AddExtension = $true }',
    '$dlg.OverwritePrompt = $true',
    '$dlg.CheckPathExists = $true',
    '$dlg.ValidateNames = $true',
    'try { $r = $dlg.ShowDialog($owner) } finally { $owner.Dispose() }',
    "if ($r -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.FileName) { [Console]::Out.Write('OK:' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($dlg.FileName))) } else { [Console]::Out.Write('CANCEL') }",
  ].join('; ')
}

/** Parse the script's answer: { path } | { cancelled: true } | null (no valid answer). */
export function parseDialogOutput(out) {
  const lines = String(out || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
  const last = (lines[lines.length - 1] || '').trim()
  if (last === 'CANCEL') return { cancelled: true }
  const m = /^OK:([A-Za-z0-9+/]+={0,2})$/.exec(last)
  if (!m) return null
  const path = Buffer.from(m[1], 'base64').toString('utf8')
  return path && !path.includes('\0') ? { path } : null
}

function powershellExe() {
  const root = process.env.SystemRoot || process.env.windir || ''
  const exe = root ? join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : ''
  return exe && existsSync(exe) ? exe : 'powershell.exe'
}

function killTree(child) {
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {})
    }
    child.kill('SIGKILL')
  } catch {}
}

/**
 * Show the operating system's Save-As window (Windows). Resolves { path } | { cancelled: true [, timedOut: true] };
 * rejects SaveAsError NATIVE_DIALOG_UNAVAILABLE (501) when no dialog can be shown here.
 */
export function showNativeSaveDialog({ title = '另存为', fileName = '', ext = '', timeoutMs = 10 * 60_000, spawnImpl = spawn, platform = process.platform } = {}) {
  if (nativeDialogDisabled()) {
    return Promise.reject(new SaveAsError('系统「另存为」窗口已被关闭（DSH_VIDEO_NATIVE_DIALOG=off）', 'NATIVE_DIALOG_UNAVAILABLE', 501))
  }
  if (platform !== 'win32') {
    return Promise.reject(new SaveAsError('这台电脑上没法弹出系统的「另存为」窗口', 'NATIVE_DIALOG_UNAVAILABLE', 501))
  }
  const e = String(ext || '').replace(/^\./, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)
  return new Promise((resolvePromise, rejectPromise) => {
    let child
    try {
      // STA: WinForms dialogs need a single-threaded apartment; windowsHide: no console window, only the dialog
      child = spawnImpl(powershellExe(), ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsSaveDialogScript()], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          DSH_SAVE_TITLE: String(title || '另存为').slice(0, 120),
          DSH_SAVE_NAME: String(fileName || '').slice(0, 200),
          DSH_SAVE_FILTER: dialogFilter(e),
          DSH_SAVE_EXT: e,
        },
      })
    } catch (err) {
      rejectPromise(new SaveAsError(`没能打开「另存为」窗口：${err?.message || err}`, 'NATIVE_DIALOG_UNAVAILABLE', 501))
      return
    }
    let out = ''
    let errText = ''
    let settled = false
    let timedOut = false
    const done = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    child.stdout?.on('data', (c) => (out = (out + c.toString('utf8')).slice(-70000)))
    child.stderr?.on('data', (c) => (errText = (errText + c.toString('utf8')).slice(-2000)))
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    child.on('error', (err) => done(() => rejectPromise(new SaveAsError(`没能打开「另存为」窗口：${err?.message || err}`, 'NATIVE_DIALOG_UNAVAILABLE', 501))))
    child.on('close', (code) =>
      done(() => {
        if (timedOut) return resolvePromise({ cancelled: true, timedOut: true })
        const parsed = parseDialogOutput(out)
        if (parsed) return resolvePromise(parsed)
        rejectPromise(new SaveAsError(`「另存为」窗口没能正常打开（exit ${code}）${errText.trim() ? `：${errText.trim().slice(-300)}` : ''}`, 'NATIVE_DIALOG_UNAVAILABLE', 501))
      }),
    )
  })
}

/** The dialog's answer must be a plain absolute file path (it is still validated: the dialog is just another process). */
export function validateDialogPath(p) {
  const s = typeof p === 'string' ? p.trim() : ''
  if (!s || s.length > 32000 || s.includes('\0') || !isAbsolute(s)) throw new SaveAsError('「另存为」窗口返回的位置无效，请重新选择', 'BAD_DESTINATION', 400)
  const dest = resolve(s)
  let st = null
  try {
    st = statSync(dest)
  } catch {}
  if (st && st.isDirectory()) throw new SaveAsError('选择的是一个文件夹，请输入文件名后再保存', 'BAD_DESTINATION', 400)
  return dest
}

function friendlyCopyError(err) {
  const code = String(err?.code || '')
  if (code === 'ENOSPC') return '目标磁盘空间不够，请换一个位置或清理出空间后再保存'
  if (code === 'EACCES' || code === 'EPERM') return '没有权限写到这个位置（或同名文件正被其他程序打开），请换一个文件夹再试'
  if (code === 'EBUSY') return '同名文件正被其他程序占用，请先关闭它再保存'
  if (code === 'ENOENT') return '目标文件夹已经不存在了，请重新选择保存位置'
  return `保存失败：${err?.message || err}`
}

let dialogOpen = false

/**
 * Show the native Save-As window for one project file and copy it to the place picked there.
 * → { cancelled: true [, timedOut] } | { cancelled: false, savedPath, fileName, bytes, unchanged }
 * `request` (the incoming Fetch API Request) is checked with nativeDialogRejection; `dialog` is injectable for tests.
 */
export async function saveDeliverableAs({ projectDir, rel, suggestedName = '', what = '', request = null, dialog = showNativeSaveDialog } = {}) {
  const src = resolveDeliverableSource({ projectDir, rel })
  if (request && nativeDialogRejection(request)) {
    throw new SaveAsError('只能在运行工作台的这台电脑上弹出「另存为」窗口', 'NATIVE_DIALOG_REMOTE', 403)
  }
  if (dialogOpen) {
    throw new SaveAsError('已经打开了一个「另存为」窗口：请先在那个窗口里选好位置（它可能被其他窗口挡住了，看看任务栏）', 'NATIVE_DIALOG_BUSY', 409)
  }
  const label = String(what || '').replace(/[\u0000-\u001f|]/g, '').trim().slice(0, 20) || '文件'
  dialogOpen = true
  let picked
  try {
    picked = await dialog({ title: `选择${label}的保存位置`, fileName: suggestedFileName(suggestedName || src.name, src.name), ext: extname(src.source).slice(1) })
  } finally {
    dialogOpen = false
  }
  if (!picked || picked.cancelled || !picked.path) return { cancelled: true, ...(picked && picked.timedOut ? { timedOut: true } : {}) }
  const dest = validateDialogPath(picked.path)
  if (samePath(dest, src.source)) return { cancelled: false, savedPath: dest, fileName: basename(dest), bytes: src.bytes, unchanged: true }
  // copy next to the destination first, then move it into place: a failed copy never leaves a half-written file under
  // the chosen name (the dialog already asked before replacing an existing file)
  const tmp = `${dest}.dsh-saving-${process.pid}-${Date.now().toString(36)}`
  try {
    await copyFile(src.source, tmp)
    await rename(tmp, dest)
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {})
    throw new SaveAsError(friendlyCopyError(err), 'COPY_FAILED', 500)
  }
  const bytes = await stat(dest).then((s) => s.size, () => src.bytes)
  return { cancelled: false, savedPath: dest, fileName: basename(dest), bytes, unchanged: false }
}
