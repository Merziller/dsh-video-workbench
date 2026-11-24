/* ============================================================================================================
 * PK · 另存为 — the user chooses where a project file (成片 MP4, 交付包 / 发布包文件 …) is saved, instead of the
 * browser silently dropping it into its default 下载 folder.
 *
 *   PK.saveFile({ rel, dir?, name?, what? }) → Promise<{ ok, how: 'picker' | 'native' | 'download', cancelled?, path? }>
 *     rel   file inside the project (e.g. 'output/final.mp4'); dir defaults to the open project
 *     name  suggested file name (its extension is always the file's own); what  e.g. '成片' (dialog titles / messages)
 *   Call it straight from a click handler: the browser's save window needs the click's user activation.
 *
 *   1. File System Access API (`showSaveFilePicker`) in this frame: folder + name are picked in the browser's own save
 *      window, then the file is read from the studio server in 8 MB range requests — the same-origin project-file URL the
 *      kit already hands to <video>, the only network read this module does — with a progress window (取消 stops it).
 *   2. No picker here (Firefox / Safari, a cross-origin frame, a web view without it): the studio server, which runs on
 *      this computer, opens the system's own 「另存为」 window and copies the file to the place picked there
 *      (POST delivery/save-as, Windows; the destination never comes from the page). Only for a real click, never for
 *      an automated browser.
 *   3. Last resort: the plain browser download into the default 下载 folder, with a message saying exactly that.
 *
 * Plain left clicks on any `<a download>` link to a project file (`/api/video-workbench/asset?projectDir=…&rel=…`)
 * use this flow too (交付 links, 发布资料包 files, lightbox 「下载」); Ctrl / Shift / Alt / middle clicks and 右键
 * 「链接另存为」 keep the browser's own behaviour. `data-pk-save-what` on such a link sets `what`.
 * ============================================================================================================ */
;(function () {
  'use strict'
  const PK = window.PK
  if (!PK || !PK.util || !PK.ui) return
  const U = PK.util
  const h = PK.h
  const ui = PK.ui
  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const ASSET_PATH = '/api/video-workbench/asset'
  const CHUNK = 8 * 1024 * 1024

  // [MIME type, label, what, well-known start folder] per extension (unknown extensions: no type filter)
  const TYPES = {
    mp4: ['video/mp4', 'MP4 视频', '视频', 'videos'],
    mov: ['video/quicktime', 'MOV 视频', '视频', 'videos'],
    webm: ['video/webm', 'WebM 视频', '视频', 'videos'],
    mkv: ['video/x-matroska', 'MKV 视频', '视频', 'videos'],
    wav: ['audio/wav', 'WAV 音频', '音频', 'music'],
    mp3: ['audio/mpeg', 'MP3 音频', '音频', 'music'],
    m4a: ['audio/mp4', 'M4A 音频', '音频', 'music'],
    aac: ['audio/aac', 'AAC 音频', '音频', 'music'],
    flac: ['audio/flac', 'FLAC 音频', '音频', 'music'],
    png: ['image/png', 'PNG 图片', '图片', 'pictures'],
    jpg: ['image/jpeg', 'JPEG 图片', '图片', 'pictures'],
    jpeg: ['image/jpeg', 'JPEG 图片', '图片', 'pictures'],
    webp: ['image/webp', 'WebP 图片', '图片', 'pictures'],
    gif: ['image/gif', 'GIF 图片', '图片', 'pictures'],
    srt: ['application/x-subrip', 'SRT 字幕', '字幕', 'documents'],
    vtt: ['text/vtt', 'WebVTT 字幕', '字幕', 'documents'],
    ass: ['text/plain', 'ASS 字幕', '字幕', 'documents'],
    xml: ['application/xml', 'XML 剪辑时间线', '文件', 'documents'],
    fcpxml: ['application/xml', 'Final Cut Pro 时间线', '文件', 'documents'],
    edl: ['text/plain', 'EDL 剪辑表', '文件', 'documents'],
    json: ['application/json', 'JSON 文件', '文件', 'documents'],
    md: ['text/markdown', 'Markdown 文档', '文档', 'documents'],
    txt: ['text/plain', '文本文件', '文件', 'documents'],
    csv: ['text/csv', 'CSV 表格', '文件', 'documents'],
    zip: ['application/zip', 'ZIP 压缩包', '压缩包', 'documents'],
    cube: ['application/octet-stream', 'LUT 调色文件', '文件', 'documents'],
  }
  const extOf = (name) => {
    const m = /\.([A-Za-z0-9]{1,10})$/.exec(S(name))
    return m ? m[1].toLowerCase() : ''
  }
  const relOf = (p) => S(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  /** a file name the save windows accept, always ending with the real file's extension */
  function safeName(name, rel) {
    const ext = extOf(rel)
    let base = S(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim()
    if (ext && base.toLowerCase().endsWith(`.${ext}`)) base = base.slice(0, -ext.length - 1)
    base = base.replace(/[. ]+$/, '').slice(0, 120).trim()
    if (!base) base = U.baseName(rel).replace(/\.[^.]*$/, '') || 'file'
    return ext ? `${base}.${ext}` : base
  }
  const assetUrl = (dir, rel) => `${ASSET_PATH}?projectDir=${encodeURIComponent(dir)}&rel=${encodeURIComponent(rel)}&v=save${Date.now().toString(36)}`

  /** Chromium shows the picker only in a top-level page or a frame with the same origin as the top-level page */
  function pickerAllowed() {
    if (typeof window.showSaveFilePicker !== 'function' || window.isSecureContext === false) return false
    try {
      return window.top === window || window.top.location.origin === window.location.origin
    } catch {
      return false
    }
  }
  function pickerOptions(name) {
    const t = TYPES[extOf(name)]
    const o = { suggestedName: name, id: 'dsh-vw-save' }
    if (t) {
      o.startIn = t[3]
      o.types = [{ description: t[1], accept: { [t[0]]: [`.${extOf(name)}`] } }]
    }
    return o
  }

  /** small window with a progress bar; appears only when saving takes a moment. Close / Esc / 取消 = cancel. */
  function progressWindow(title, name, onCancel) {
    let f = null
    let meter = null
    let line = null
    let last = { done: 0, total: -1 }
    const paint = () => {
      if (!f || f.closed) return
      const known = last.total > 0
      const pct = known ? (last.done / last.total) * 100 : 0
      PK.clear(meter)
      PK.append(meter, ui.meter(pct, { indeterminate: !known, label: '已保存', valueText: known ? `${Math.round(pct)}%` : U.fmtBytes(last.done) }))
      line.textContent = known ? `${U.fmtBytes(last.done)} / ${U.fmtBytes(last.total)}` : ''
    }
    const show = () => {
      if (f) return
      f = PK.frame({
        kind: 'dialog',
        size: 'sm',
        title,
        en: 'SAVING',
        dismissible: false,
        onClose: (reason) => {
          if (reason === 'cancel' || reason === 'x' || reason === 'esc') onCancel()
        },
      })
      meter = h('div.pk-save-meter')
      line = h('p.pk-hint')
      PK.append(f.body, ui.text(`正在保存「${name}」到你选择的位置…`), meter, line)
      f.setFoot([ui.spacer(), ui.btn('取消保存', () => f.close('cancel'), { kind: 'ghost' })])
      paint()
    }
    const timer = setTimeout(show, 350)
    return {
      update(done, total) {
        last = { done, total }
        paint()
      },
      close() {
        clearTimeout(timer)
        if (f && !f.closed) f.close('done')
      },
    }
  }

  const abortError = () => {
    const e = new Error('已取消')
    e.name = 'AbortError'
    return e
  }
  /** read the project file in range requests into the picked file (cancellable; the server never loads it whole) */
  async function copyInto(url, writable, onProgress, signal) {
    let offset = 0
    let total = -1
    for (;;) {
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + CHUNK - 1}` }, credentials: 'same-origin', cache: 'no-store', signal })
      if (res.status === 200) {
        // the server ignored the range: take the whole body as a stream
        if (offset > 0) throw new PK.Error('读取文件时服务器不支持分段读取，请重试')
        total = U.num(res.headers.get('content-length'), -1)
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          await writable.write(value)
          if (signal.aborted) throw abortError()
          offset += value.byteLength
          onProgress(offset, total)
        }
        return offset
      }
      if (res.status !== 206) throw new PK.Error(res.status === 404 ? '文件不存在了（可能被重新渲染或删除），请刷新后再试' : `读取文件失败（HTTP ${res.status}）`)
      const m = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(res.headers.get('content-range') || '')
      const size = m ? Number(m[3]) : -1
      if (total >= 0 && size !== total) throw new PK.Error('文件在保存过程中被改动了（例如重新渲染了成片），请重新保存')
      total = size
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.byteLength) await writable.write(buf)
      // 取消 while the last piece was being written must still win: nothing is committed until close()
      if (signal.aborted) throw abortError()
      offset += buf.byteLength
      onProgress(offset, total)
      if (total < 0 || offset >= total || !buf.byteLength) return offset
    }
  }

  async function saveViaPicker(handle, f) {
    const shown = S(handle && handle.name) || f.name
    const ctrl = new AbortController()
    const win = progressWindow(`正在保存${f.what}`, shown, () => ctrl.abort())
    let writable = null
    try {
      writable = await handle.createWritable()
      await copyInto(f.url, writable, (done, total) => win.update(done, total), ctrl.signal)
      if (ctrl.signal.aborted) throw abortError()
      await writable.close()
      writable = null
      win.close()
      PK.toast(`「${shown}」已保存到你选择的文件夹`, 'success', { title: `${f.what}已保存` })
      return { ok: true, how: 'picker', name: shown }
    } catch (err) {
      if (writable) {
        try {
          await writable.abort()
        } catch {}
      }
      win.close()
      if (ctrl.signal.aborted) {
        PK.toast(`已取消保存「${shown}」`, 'info')
        return { ok: false, cancelled: true, how: 'picker' }
      }
      // reading the project file failed (PK.Error) vs. writing the picked file failed (no permission, disk full …)
      if (err instanceof PK.Error) throw err
      throw new PK.Error(`写入你选择的文件失败：${S(err && err.message) || '未知错误'}（可以换一个文件夹再试）`)
    }
  }

  /** the system's own 「另存为」 window, opened by the studio server on this computer → null when that is not possible */
  async function saveViaServerDialog(f) {
    let win = null
    const timer = setTimeout(() => {
      win = PK.frame({ kind: 'dialog', size: 'sm', title: `选择${f.what}的保存位置`, en: 'SAVE AS', dismissible: false })
      PK.append(
        win.body,
        ui.text('已经打开了系统的「另存为」窗口：请在那个窗口里选好文件夹和文件名，再点「保存」。'),
        ui.hint('没看到这个窗口？它可能被其他窗口挡住了，看看屏幕下方的任务栏。选好后这里会自动完成保存。'),
        ui.spinner('等待你选择保存位置…'),
      )
      win.setFoot([ui.spacer(), ui.btn('收起提示', () => win.close('x'), { kind: 'ghost' })])
    }, 400)
    try {
      const r = await PK.post('delivery/save-as', { projectDir: f.dir, rel: f.rel, suggestedName: f.name, what: f.what }, { timeout: 11 * 60 * 1000 })
      if (!r || r.cancelled) return { ok: false, cancelled: true, how: 'native' }
      PK.toast(`已保存到：${S(r.savedPath)}`, 'success', { title: `${f.what}已保存`, timeout: 10000 })
      return { ok: true, how: 'native', path: S(r.savedPath) }
    } catch (err) {
      const code = S(err && err.code)
      if (code === 'NATIVE_DIALOG_BUSY') {
        PK.toast(S(err.message), 'info', { title: '「另存为」窗口已经打开' })
        return { ok: false, busy: true, how: 'native' }
      }
      // no dialog possible here (not Windows, switched off, a page from another computer, an older host) → plain download
      if (/^NATIVE_DIALOG_(UNAVAILABLE|REMOTE)$/.test(code) || /未开放|Route not found/i.test(S(err && err.message))) return null
      throw err
    } finally {
      clearTimeout(timer)
      if (win && !win.closed) win.close('done')
    }
  }

  function plainDownload(f) {
    const a = h('a', { href: f.url, download: f.name, 'data-pk-plain-download': '1', style: { display: 'none' } })
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 0)
    PK.toast(`「${f.name}」已开始下载，会保存到浏览器默认的「下载」文件夹。想每次自己选位置：在浏览器设置里打开「下载前询问每个文件的保存位置」。`, 'info', { title: '已开始下载', timeout: 12000 })
    return { ok: true, how: 'download' }
  }

  let saving = false
  PK.saveFile = (o = {}) => {
    // stays synchronous up to showSaveFilePicker(): the browser's save window needs the click's user activation
    const dir = S(o.dir) || PK.dir()
    const rel = relOf(o.rel)
    if (!dir || !rel) return Promise.reject(new PK.Error('没有可以保存的文件'))
    if (saving) {
      PK.toast('上一个文件还在保存，请等它完成', 'info')
      return Promise.resolve({ ok: false, busy: true })
    }
    const t = TYPES[extOf(rel)]
    const f = { dir, rel, name: safeName(o.name || U.baseName(rel), rel), what: S(o.what).trim() || (t ? t[2] : '文件'), url: assetUrl(dir, rel) }
    const gesture = navigator.userActivation ? navigator.userActivation.isActive : true
    let picking = null
    if (pickerAllowed()) {
      try {
        picking = window.showSaveFilePicker(pickerOptions(f.name))
      } catch (err) {
        picking = Promise.reject(err)
      }
    }
    saving = true
    return (async () => {
      if (picking) {
        let handle = null
        try {
          handle = await picking
        } catch (err) {
          // the user closed the save window: nothing to do
          if (err && err.name === 'AbortError') return { ok: false, cancelled: true, how: 'picker' }
          // SecurityError / NotAllowedError / TypeError: this frame may not show it → the next way
        }
        if (handle) return await saveViaPicker(handle, f)
      }
      // a desktop window only for a real click, never for an automated browser
      if (gesture && !navigator.webdriver) {
        const r = await saveViaServerDialog(f)
        if (r) return r
      }
      return plainDownload(f)
    })()
      .catch((err) => {
        // every failure reads as one sentence (callers toast it as is)
        throw new PK.Error(`保存「${f.name}」没有完成：${S(err && err.message) || '未知错误'}`, { code: S(err && err.code) })
      })
      .finally(() => {
        saving = false
      })
  }

  /** `<a download>` link → { dir, rel } when it points at a project file of the studio server */
  function projectFileOf(a) {
    let u = null
    try {
      u = new URL(a.getAttribute('href') || '', window.location.href)
    } catch {
      return null
    }
    if (u.origin !== window.location.origin || u.pathname !== ASSET_PATH) return null
    const dir = u.searchParams.get('projectDir') || ''
    const rel = u.searchParams.get('rel') || ''
    return dir && rel ? { dir, rel } : null
  }
  document.addEventListener(
    'click',
    (ev) => {
      if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return
      const a = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('a[download][href]') : null
      if (!a || a.hasAttribute('data-pk-plain-download')) return
      const pf = projectFileOf(a)
      if (!pf) return
      ev.preventDefault()
      PK.saveFile({ dir: pf.dir, rel: pf.rel, name: a.getAttribute('download') || '', what: a.getAttribute('data-pk-save-what') || '' }).catch((err) => PK.reportError(err))
    },
    true,
  )
})()
