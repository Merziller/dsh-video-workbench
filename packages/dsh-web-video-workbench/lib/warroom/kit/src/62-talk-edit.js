/* ============================================================================================================
 * PK · AI 剪辑 · 口播粗剪 (talkEdit panel) — the user's own talking-head recording, cut by the computer:
 *   1. 本地语音识别 engine: status, one-click install (folder + download source), licences
 *   2. pick the recording, the cut rules (停顿 / 口头禅 / 结巴 / 重录 / 声音增强 / 语言)
 *   3. 识别并规划: the transcript with every cut shown in place (struck through, reason on hover) — click a cut to bring
 *      it back, click a kept word to cut it; the list of cuts with 恢复 / 剪掉; stats
 *   4. 生成口播剪辑 (project: picture + own voice + real captions) → preview the cut, 一键出片 / 去分步精修
 * Routes (routes-talk.js): GET asr/status · POST asr/install · GET talk/state · POST talk/roughcut · POST talk/build.
 * Long jobs are tracked in a module-level registry (progress survives closing / reopening the panel).
 * ============================================================================================================ */
;(function () {
  'use strict'
  const PK = window.PK
  if (!PK || typeof PK.panel !== 'function') return
  const U = PK.util
  const h = PK.h
  const ui = PK.ui

  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const st = () => PK.state || {}
  const fmtSec = (s) => {
    const v = Math.max(0, Math.round(Number(s) || 0))
    return v >= 60 ? `${Math.floor(v / 60)} 分 ${String(v % 60).padStart(2, '0')} 秒` : `${v} 秒`
  }
  const fmtClock = (s) => {
    const v = Math.max(0, Number(s) || 0)
    const m = Math.floor(v / 60)
    return `${String(m).padStart(2, '0')}:${(v - m * 60).toFixed(1).padStart(4, '0')}`
  }
  const LANGS = [
    { value: 'auto', label: '自动识别' },
    { value: 'zh', label: '普通话' },
    { value: 'yue', label: '粤语' },
    { value: 'en', label: '英语' },
    { value: 'ja', label: '日语' },
    { value: 'ko', label: '韩语' },
  ]
  const KIND_TONE = { pause: 'mute', noise: 'mute', head: 'mute', tail: 'mute', filler: 'warn', stutter: 'warn', fragment: 'warn', retake: 'acc', 'false-start': 'acc', manual: 'err' }

  /* -------------------------------------------------------------------------------------------- job registry */
  const JOBS = new Map() // key → { key, label, state, pct, msg, startedAt, result, error, dir }
  const jobHosts = new Set()
  const jobRunning = (key) => {
    const j = JOBS.get(key)
    return Boolean(j && j.state === 'running')
  }
  function paintJob(el) {
    const j = JOBS.get(el.getAttribute('data-pk-tejob'))
    PK.clear(el)
    if (!j) {
      el.hidden = true
      return
    }
    el.hidden = false
    const elapsed = U.fmtDur((Date.now() - j.startedAt) / 1000)
    const tone = j.state === 'error' ? 'err' : j.state === 'done' ? 'ok' : ''
    const label = j.state === 'running' ? `${j.label} · 进行中 · 已用 ${elapsed}` : j.state === 'done' ? `${j.label} · 已完成` : `${j.label} · 未完成`
    PK.append(
      el,
      ui.meter(j.state === 'error' ? 100 : j.pct, { label, valueText: j.state === 'error' ? '失败' : `${Math.round(j.pct)}%`, tone, indeterminate: j.state === 'running' && j.pct <= 3 }),
      j.msg ? ui.text(j.msg, { tone: j.state === 'error' ? null : 'muted', class: j.state === 'error' ? 'pk-text--err' : '' }) : null,
    )
  }
  function jobsChanged() {
    for (const el of [...jobHosts]) {
      if (!el.isConnected) jobHosts.delete(el)
      else paintJob(el)
    }
  }
  function jobView(key) {
    const el = h('div.pk-stack.pk-te-job', { 'data-pk-tejob': key, role: 'status' })
    paintJob(el)
    jobHosts.add(el)
    return el
  }
  async function startJob(key, o) {
    if (jobRunning(key)) throw new PK.Error(`「${JOBS.get(key).label}」正在进行中，请等它完成`)
    const j = { key, label: o.label, state: 'running', pct: 2, msg: o.startText || '正在提交…', startedAt: Date.now(), result: null, error: '', dir: PK.dir() }
    JOBS.set(key, j)
    jobsChanged()
    try {
      const init = await o.start()
      const jobId = init && (init.jobId || (init.job && init.job.id))
      if (!jobId) throw new PK.Error(S(init && (init.error || init.message)) || '后台任务没有启动，请重试')
      const result = await PK.job(jobId, {
        interval: 1000,
        maxMs: o.maxMs || 6 * 3600 * 1000,
        onProgress: (job) => {
          const msg = S(job && job.message).trim()
          if (msg) j.msg = msg
          const p = U.num(job && job.progress, j.pct)
          if (p > 0) j.pct = U.clamp(p, 0, 100)
          jobsChanged()
        },
      })
      if (result && result.ok === false) throw new PK.Error(S(result.error || result.message) || '任务没有完成')
      j.state = 'done'
      j.pct = 100
      j.result = result
      j.msg = typeof o.doneText === 'function' ? o.doneText(result) : o.doneText || '已完成'
      jobsChanged()
      return result
    } catch (err) {
      j.state = 'error'
      j.error = S(err && err.message) || '任务失败'
      j.msg = j.error
      jobsChanged()
      throw err
    }
  }

  /* -------------------------------------------------------------------------------------------- data */
  async function loadState(ctx, { quiet = false } = {}) {
    const L = ctx.local
    if (!PK.hasProject()) return
    try {
      const res = await PK.get('talk/state', { projectDir: PK.dir(), ...(L.source ? { source: L.source } : {}) }, { timeout: 60000 })
      L.data = res
      L.err = null
      if (!L.source && res && res.source) L.source = res.source.path
      // the saved options / overrides of this recording become the editable drafts (once per loaded rough cut)
      const rc = res && res.roughcut
      const sig = rc ? `${rc.transcriptHash}|${rc.updatedAt}` : `none|${L.source}`
      if (L.rcSig !== sig) {
        L.rcSig = sig
        L.opts = { ...(res.defaults || {}), ...(rc ? rc.options : {}) }
        L.restore = new Set(rc && rc.overrides ? rc.overrides.restore || [] : [])
        L.cutWords = rc && rc.overrides ? (rc.overrides.cutWords || []).map((r) => [r[0], r[1]]) : []
        L.dirty = false
      }
      // the project's saved 口播包装 settings become the editable draft (unless the user is editing it)
      if (!L.packDirty && res && res.pack) L.pack = { ...(res.pack.settings || {}) }
    } catch (err) {
      L.err = err
      if (!quiet) PK.toast(`读取口播剪辑状态失败：${S(err && err.message)}`, 'error')
    }
    ctx.update()
  }
  async function loadEngine(ctx, deep) {
    const res = await PK.get('asr/status', deep ? { deep: 1 } : undefined, { timeout: deep ? 120000 : 30000 })
    ctx.local.asr = (res && res.asr) || null
    ctx.local.installer = (res && res.installer) || null
    if (ctx.local.installer && !ctx.local.installDir) ctx.local.installDir = S(ctx.local.installer.recommendedHome)
    return res
  }

  const overridesOf = (L) => ({ restore: [...(L.restore || [])], cutWords: (L.cutWords || []).map((r) => [r[0], r[1]]) })
  const optionsOf = (L) => {
    const o = L.opts || {}
    return {
      cutPauses: o.cutPauses !== false,
      maxPauseSec: U.clamp(U.num(o.maxPauseSec, 0.5), 0.25, 3),
      cutFillers: o.cutFillers !== false,
      cutStutters: o.cutStutters !== false,
      cutRetakes: o.cutRetakes !== false,
      enhanceVoice: o.enhanceVoice !== false,
      language: S(o.language) || 'auto',
    }
  }

  /* -------------------------------------------------------------------------------------------- actions */
  async function installEngine(ctx) {
    const L = ctx.local
    const pkg = (L.installer && L.installer.package) || {}
    const dir = S(L.installDir).trim()
    if (!dir) throw new PK.Error('请先填写安装位置，例如 D:/dsh-ai/asr')
    if (/[^\x20-\x7e]/.test(dir)) throw new PK.Error('安装位置里不能有中文或特殊字符，请换一个纯英文路径，例如 D:/dsh-ai/asr')
    const mirror = L.mirror === 'global' ? 'global' : 'cn'
    const ok = await PK.confirm({
      title: '一键安装本地语音识别？',
      text: `将下载并安装「${S(pkg.name) || '本地语音识别'}」：\n· 用途：${(pkg.uses || []).join('、')}\n· 语言：${S(pkg.languages)}\n· 磁盘占用：${S(pkg.diskRequired)}\n· 安装位置：${dir}\n· 下载源：${mirror === 'global' ? '官方全球源（npm 官方仓库 + Hugging Face）' : '国内高速镜像优先（npmmirror + HF-Mirror）'}\n· 每个文件都会校验指纹，装好后完全离线、不花钱。\n\n授权说明：\n${(pkg.license || []).join('\n')}`,
      ok: '开始安装',
    })
    if (!ok) return
    startJob('install', {
      label: '安装本地语音识别',
      startText: '正在启动安装…',
      start: () => PK.post('asr/install', { installDir: dir, mirror }),
      doneText: (r) => (r && r.ok ? '安装完成并通过自检' : `已安装，但自检没通过：${S(r && r.status && r.status.reason)}`),
      maxMs: 3 * 3600 * 1000,
    })
      .then(async () => {
        PK.toast('本地语音识别安装完成，可以开始口播粗剪了', 'success')
        await loadEngine(ctx).catch(() => {})
        await loadState(ctx, { quiet: true })
      })
      .catch((err) => PK.toast(`本地语音识别安装未完成：${S(err && err.message)}`, 'error', { title: '安装失败', timeout: 0 }))
    ctx.update()
  }

  async function runPlan(ctx, { force = false } = {}) {
    PK.needProject()
    const L = ctx.local
    if (!L.source) throw new PK.Error('请先选择要剪辑的视频')
    const key = `plan:${PK.dir()}`
    await startJob(key, {
      label: L.data && L.data.roughcut ? '重新规划粗剪' : '识别并规划粗剪',
      startText: '正在提交…',
      start: () => PK.postP('talk/roughcut', { sourcePath: L.source, options: optionsOf(L), overrides: overridesOf(L), render: false, force }),
      doneText: (r) => S(r && r.summary) || '粗剪规划完成',
    })
    L.rcSig = '' // reload the drafts from the saved result
    await loadState(ctx, { quiet: true })
    PK.toast('粗剪规划完成：删掉的地方用删除线标出，点一下就能恢复', 'success')
  }

  /**
   * A cloud anime presenter costs money: ask first, with the estimate for this cut's length. → undefined (nothing to
   * pay: no cloud presenter, or the clip of this unchanged cut is re-used for free), the confirmed amount (sent with
   * this request only, never stored) or false (the user said no).
   */
  async function presenterCostGate(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const P = d.pack || {}
    const p = L.pack || P.settings || {}
    const m = p.mascot
    if (!m || !m.characterId) return undefined
    const eng = (P.presenterEngines || []).find((e) => e.id === m.engine)
    if (!eng || !eng.paid) return undefined
    const last = P.mascotLast
    const char = (P.characters || []).find((c) => c.id === m.characterId)
    if (last && last.type === 'anime-clip' && !last.fellBack && last.engine === m.engine && last.characterId === m.characterId && char && Number(last.characterVersion) === Number(char.version) && !L.dirty) return undefined
    const sec = U.num(d.roughcut && d.roughcut.plan && d.roughcut.plan.outputDurationSec, 0)
    const r = await PK.get('anime/estimate', { engine: m.engine, durationSec: Math.ceil(sec), mode: m.mode || '', characterId: m.characterId })
    const est = (r && r.estimate) || {}
    const cap = Math.ceil(U.num(est.rmb, 0) * 1.05 * 100) / 100
    const ok = await PK.confirm({
      title: `用「${S(eng.short || eng.label)}」生成会说话的动漫形象？`,
      text: `剪好的视频约 ${fmtSec(sec)}，${S(est.basis) || '按秒计费'}：大约 ${U.num(est.rmb, 0).toFixed(2)} 元，最多 ${cap.toFixed(2)} 元（多留 5% 给时长误差）。以服务商账单为准；这段声音以后重复使用不会再收费。不同意的话，这次会用免费档代替。`,
      ok: '确认，按这个价格生成',
    })
    return ok ? cap : false
  }

  /** The pack draft (or the saved settings) with this request's presenter cost confirmation. */
  function packWithConfirm(ctx, confirmed) {
    const L = ctx.local
    const P = (L.data && L.data.pack) || {}
    const base = L.pack || P.settings || null
    if (typeof confirmed !== 'number' || !base || !base.mascot) return base
    return { ...base, mascot: { ...base.mascot, confirmedRmb: confirmed } }
  }

  async function runBuild(ctx) {
    PK.needProject()
    const L = ctx.local
    if (!L.source) throw new PK.Error('请先选择要剪辑的视频')
    const confirmed = await presenterCostGate(ctx)
    const hasProject = Boolean(L.data && L.data.project && L.data.project.scenes > 0 && L.data.project.productionType !== 'talk-edit')
    if (hasProject) {
      const ok = await PK.confirm({
        title: '把这个工程改成口播剪辑？',
        text: '当前工程里已经有 AI 生成的分镜。生成口播剪辑会用你的视频重新生成分镜、原声和字幕（旧版本会保存在「版本历史」里，随时可以恢复）。',
        ok: '生成口播剪辑',
      })
      if (!ok) return
    }
    const key = `build:${PK.dir()}`
    await startJob(key, {
      label: '生成口播剪辑',
      startText: '正在提交…',
      start: () => {
        const pack = typeof confirmed === 'number' ? packWithConfirm(ctx, confirmed) : L.pack
        return PK.postP('talk/build', { sourcePath: L.source, options: optionsOf(L), overrides: overridesOf(L), ...(pack ? { pack } : {}) })
      },
      doneText: (r) => `${S(r && r.summary)} · ${U.num(r && r.scenes, 0)} 段 · ${U.num(r && r.captionsCount, 0)} 条字幕`,
      maxMs: 4 * 3600 * 1000,
    })
    try {
      await PK.action('setDirector', { patch: { productionType: 'talk-edit' } })
    } catch {}
    await PK.action('refresh', {}).catch(() => {})
    L.rcSig = ''
    await loadState(ctx, { quiet: true })
    L.packDirty = false
    PK.toast('口播剪辑工程已生成：可以先预览剪好的视频，再一键出片', 'success')
  }

  /** save the 口播包装 draft on the project (a built 口播剪辑 gets its packaging re-planned right away) */
  async function savePack(ctx, { quiet = false, presenterCost = true } = {}) {
    PK.needProject()
    const L = ctx.local
    if (!L.pack) return
    // a built 口播剪辑 gets its packaging re-planned right away: a cloud presenter would be generated now
    const built = Boolean(L.data && L.data.project && L.data.project.productionType === 'talk-edit' && L.data.project.scenes > 0)
    const confirmed = built && presenterCost ? await presenterCostGate(ctx) : undefined
    L.packSaving = true
    ctx.update()
    try {
      // a background job: re-planning a built cut may render a talking anime presenter (minutes)
      const started = await PK.postP('talk/pack', { async: true, pack: typeof confirmed === 'number' ? packWithConfirm(ctx, confirmed) : L.pack })
      const res = started && started.jobId ? await PK.job(started.jobId, { maxMs: 4 * 3600 * 1000 }) : started
      L.packDirty = false
      if (res && res.pack && L.data) L.data.pack = res.pack
      if (!quiet) PK.toast(res && res.applied ? '包装已更新到剪辑工程（出片时生效）' : '包装设置已保存，生成剪辑工程 / 一键出片时会用上', 'success')
      if (res && res.applied) await PK.action('refresh', {}).catch(() => {})
    } finally {
      L.packSaving = false
      ctx.update()
    }
  }
  async function indexLibrary(ctx) {
    PK.needProject()
    const key = `footage:${PK.dir()}`
    await startJob(key, {
      label: '分析空镜素材的镜头',
      startText: '正在提交…',
      start: () => PK.postP('footage/index', { transcribe: 'off' }),
      doneText: (r) => `已分析 ${U.num(r && r.indexed && r.indexed.length, 0)} 段素材`,
      maxMs: 3 * 3600 * 1000,
    })
    await loadState(ctx, { quiet: true })
  }

  async function produce(ctx) {
    PK.needProject()
    const L = ctx.local
    if (L.dirty) {
      const ok = await PK.confirm({ title: '还有没应用的修改', text: '你恢复 / 删掉的地方还没有重新规划。出片会按修改后的样子来剪。', ok: '按修改后的出片' })
      if (!ok) return
    }
    // ask about a cloud presenter's cost once, for the run (the save below never pays)
    const confirmed = await presenterCostGate(ctx)
    if (L.packDirty) await savePack(ctx, { quiet: true, presenterCost: false })
    if (L.dirty) await runPlan(ctx)
    await PK.action('setDirector', { patch: { productionType: 'talk-edit' } })
    const ok = await PK.action('run', typeof confirmed === 'number' ? { presenterConfirmedRmb: confirmed } : {}).then(
      () => true,
      (err) => {
        PK.toast(`出片任务没有启动：${S(err && err.message)}`, 'error')
        return false
      },
    )
    if (ok) {
      PK.toast('口播剪辑出片已启动，可以在任务中心看进度', 'success')
      ctx.close()
    }
  }

  /* -------------------------------------------------------------------------------------------- views */
  function engineSection(ctx) {
    const L = ctx.local
    const a = L.asr
    const inst = L.installer || {}
    const pkg = inst.package || {}
    const installing = jobRunning('install')
    if (!a) return ui.section({ title: '本地语音识别', en: 'SPEECH ENGINE', icon: 'mic' }, L.asrErr ? ui.errorBox(L.asrErr, () => loadEngine(ctx).then(() => ctx.update(), () => {})) : ui.loading('正在检测…'))
    if (a.ready) {
      return ui.section(
        { title: '本地语音识别', en: 'SPEECH ENGINE', icon: 'mic', actions: [ui.btn('检测引擎', () => loadEngine(ctx, true).then(() => PK.toast(L.asr && L.asr.ready ? `引擎正常（加载 ${U.num(L.asr.loadMs, 0)} 毫秒）` : `引擎有问题：${S(L.asr && L.asr.reason)}`, L.asr && L.asr.ready ? 'success' : 'error'), ctx.update), { size: 'sm', kind: 'ghost', icon: 'refresh', busyText: '检测中…' })] },
        ui.row([ui.pill('已就绪 · 免费离线', 'ok', { dot: true }), ui.text(`普通话 / 粤语 / 英语 / 日语 / 韩语 · 安装在 ${S(a.home)}`, { tone: 'muted' })], { wrap: true }),
      )
    }
    if (a.supportedPlatform === false) {
      return ui.section({ title: '本地语音识别', en: 'SPEECH ENGINE', icon: 'mic' }, ui.note(`当前系统（${S(a.platform)}）没有可用的识别引擎：支持 Windows / macOS / Linux 的 x64 与 arm64。`, { level: 'warn' }))
    }
    const free = inst.freeBytes
    return ui.section(
      { title: '先安装本地语音识别', en: 'SPEECH ENGINE · ONE-TIME SETUP', icon: 'mic', desc: '口播粗剪要先“听懂”你说了什么。识别在你自己的电脑上完成：不上传、不花钱，装一次以后一直能用。' },
      ui.kv([
        ['能做什么', (pkg.uses || []).join('、') || '口播粗剪、真实字幕'],
        ['支持语言', S(pkg.languages) || '普通话 · 粤语 · 英语 · 日语 · 韩语'],
        ['占用空间', S(pkg.diskRequired) || '约 260 MB'],
        ['预计耗时', S(pkg.etaLabel) || '几分钟'],
      ]),
      ui.field(
        { label: '安装位置', en: 'FOLDER', hint: `建议放在系统盘以外、纯英文路径的文件夹${free ? `（这个盘还剩 ${(free / 1024 ** 3).toFixed(1)} GB）` : ''}` },
        ui.input({ key: 'te-dir', value: S(L.installDir), mono: true, placeholder: 'D:/dsh-ai/asr', onInput: (v) => (L.installDir = v), disabled: installing }),
      ),
      ui.field(
        { label: '下载源', en: 'SOURCE' },
        ui.seg({ value: L.mirror === 'global' ? 'global' : 'cn', options: [{ value: 'cn', label: '国内镜像（推荐）' }, { value: 'global', label: '官方全球源' }], onChange: (v) => (L.mirror = v), disabled: installing }),
      ),
      ui.row([ui.btn(installing ? '正在安装…' : '一键安装（约 260 MB）', () => installEngine(ctx), { kind: 'primary', icon: 'download', disabled: installing })]),
      jobView('install'),
      licenseToggle(ctx, pkg.license || a.attribution || []),
    )
  }
  /** 开源授权与出处: collapsed by default (a toggle, so hidden text is never laid out over the rest) */
  function licenseToggle(ctx, lines) {
    const L = ctx.local
    return ui.stack(
      [
        ui.btn(L.showLicense ? '收起开源授权与出处' : '开源授权与出处', () => {
          L.showLicense = !L.showLicense
          ctx.update()
        }, { size: 'sm', kind: 'link', icon: L.showLicense ? 'collapse' : 'info' }),
        L.showLicense ? ui.stack(lines.map((t) => ui.hint(t)), { gap: 2 }) : null,
      ],
      { gap: 4 },
    )
  }

  function sourceSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const sources = (d.sources || []).filter((s) => s.hasAudio !== false)
    const busy = jobRunning(`plan:${PK.dir()}`) || jobRunning(`build:${PK.dir()}`)
    if (!sources.length) {
      return ui.section(
        { title: '要剪辑的视频', en: 'RECORDING', icon: 'film' },
        ui.empty({
          icon: 'cam',
          title: '素材库里还没有带声音的视频',
          text: '把你对着镜头说话的视频上传到素材库（手机拍的也可以），或者用提词器直接录一段。',
          actions: [ui.btn('去素材库上传', () => PK.open('studio', { step: 'assets' }), { kind: 'primary', icon: 'upload' }), ui.btn('用提词器录一段', () => PK.open('teleprompter'), { icon: 'cam' })],
        }),
      )
    }
    const o = L.opts || {}
    const setOpt = (k, v) => {
      L.opts = { ...(L.opts || {}), [k]: v }
      L.dirty = true
      ctx.update()
    }
    return ui.section(
      { title: '要剪辑的视频与剪辑规则', en: 'RECORDING · RULES', icon: 'film' },
      ui.field(
        { label: '视频', en: 'RECORDING' },
        ui.select({
          key: 'te-src',
          value: S(L.source),
          options: sources.map((s) => ({ value: s.path, label: `${s.role === 'host_video' ? '🎥 ' : ''}${S(s.name) || S(s.path)}`, hint: `${s.type === 'audio' ? '音频' : '视频'} · ${fmtSec(s.durationSec)}${s.role === 'host_video' ? ' · 真人出镜' : ''}` })),
          showHint: true,
          disabled: busy,
          aria: '要剪辑的视频',
          onChange: (v) => {
            L.source = v
            L.rcSig = ''
            loadState(ctx, { quiet: true })
          },
        }),
      ),
      ui.grid(
        [
          ui.toggle({ value: o.cutPauses !== false, label: '缩短长停顿', hint: `超过 ${U.num(o.maxPauseSec, 0.5).toFixed(1)} 秒的停顿缩到约 0.2 秒`, onChange: (v) => setOpt('cutPauses', v) }),
          ui.toggle({ value: o.cutFillers !== false, label: '去掉口头禅', hint: '嗯、呃、额、um、uh…（“好啊”这类正常说法不动）', onChange: (v) => setOpt('cutFillers', v) }),
          ui.toggle({ value: o.cutStutters !== false, label: '去掉结巴重复', hint: '“我我我觉得”只留一个“我”', onChange: (v) => setOpt('cutStutters', v) }),
          ui.toggle({ value: o.cutRetakes !== false, label: '重录只留最后一遍', hint: '同一句说了几遍、说了半句重来，只保留最后完整的那遍', onChange: (v) => setOpt('cutRetakes', v) }),
          ui.toggle({ value: o.enhanceVoice !== false, label: '人声增强', hint: '去掉低频嗡嗡声，音量统一到平台标准', onChange: (v) => setOpt('enhanceVoice', v) }),
        ],
        { min: 230, fit: true },
      ),
      ui.grid(
        [
          ui.field({ label: '多长算长停顿', en: 'PAUSE' }, ui.slider({ value: U.num(o.maxPauseSec, 0.5), min: 0.3, max: 2, step: 0.1, format: (v) => `${Number(v).toFixed(1)} 秒`, aria: '多长算长停顿', onChange: (v) => setOpt('maxPauseSec', v) })),
          ui.field({ label: '说话语言', en: 'LANGUAGE' }, ui.select({ key: 'te-lang', value: S(o.language) || 'auto', options: LANGS, searchable: false, aria: '说话语言', onChange: (v) => setOpt('language', v) })),
        ],
        { min: 220, fit: true },
      ),
    )
  }

  /** the transcript with every cut in place: click a cut word to restore its cut, a kept word to cut it */
  function transcriptView(ctx, rc) {
    const L = ctx.local
    const words = (rc.plan && rc.plan.words) || []
    const byId = new Map((rc.plan.removals || []).map((r) => [r.id, r]))
    const restore = L.restore || new Set()
    const manual = new Set()
    for (const [a, b] of L.cutWords || []) for (let k = a; k <= b; k++) manual.add(k)
    const savedManual = new Set()
    for (const r of rc.plan.removals || []) if (r.kind === 'manual' && r.applied && Array.isArray(r.words)) for (let k = r.words[0]; k <= r.words[1]; k++) savedManual.add(k)
    const nodes = []
    let prevSeg = null
    for (const w of words) {
      if (w.punct) {
        nodes.push(h('span.pk-te-p', null, w.text))
        continue
      }
      const rid = w.removedBy || ''
      const rem = rid ? byId.get(rid) : null
      const restored = rem && restore.has(rid)
      const autoCut = rem && rem.kind !== 'manual' && !restored
      const manualCut = manual.has(w.i)
      const cut = autoCut || manualCut
      const pending = (manualCut && !savedManual.has(w.i)) || (rem && rem.kind === 'manual' && !manualCut) || (restored && rem.applied) || (rem && !restored && !rem.applied)
      if (prevSeg !== null && w.onset - prevSeg > 1.2) nodes.push(h('span.pk-te-gap', { title: `停顿 ${(w.onset - prevSeg).toFixed(1)} 秒` }, '⏸'))
      prevSeg = w.end
      const el = h(
        'span.pk-te-w',
        {
          class: { 'is-cut': cut, 'is-pending': pending, [`is-${(rem && rem.kind) || (manualCut ? 'manual' : '')}`]: Boolean(rem || manualCut) },
          title: cut ? `${rem && !manualCut ? rem.label : '手动删除'}（点一下恢复）· ${fmtClock(w.onset)}` : `${fmtClock(w.onset)} · 点一下删掉这个词`,
          role: 'button',
          tabindex: '0',
        },
        `${w.space && /^[A-Za-z0-9]/.test(w.text) ? ' ' : ''}${w.text}`,
      )
      const toggle = () => {
        if (rem && rem.kind !== 'manual') {
          if (restore.has(rid)) restore.delete(rid)
          else restore.add(rid)
          L.restore = restore
        } else if (manualCut) {
          L.cutWords = (L.cutWords || [])
            .flatMap(([a, b]) => (w.i < a || w.i > b ? [[a, b]] : [[a, w.i - 1], [w.i + 1, b]]))
            .filter(([a, b]) => b >= a)
        } else {
          L.cutWords = [...(L.cutWords || []), [w.i, w.i]]
        }
        L.dirty = true
        ctx.update()
      }
      el.addEventListener('click', toggle)
      el.addEventListener('keydown', (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), toggle()))
      nodes.push(el)
    }
    return h('div.pk-te-text', { 'data-pk-scroll': 'te-text', lang: 'zh' }, nodes)
  }

  function removalTable(ctx, rc) {
    const L = ctx.local
    const restore = L.restore || new Set()
    const rows = (rc.plan.removals || []).filter((r) => r.kind !== 'manual')
    return ui.table({
      class: 'pk-te-table',
      columns: [
        { key: 'start', label: '位置', width: '78px', render: (r) => ui.mono(fmtClock(r.start)) },
        { key: 'label', label: '原因', width: '150px', render: (r) => ui.pill(r.label, KIND_TONE[r.kind] || 'mute') },
        { key: 'text', label: '内容', render: (r) => (r.text ? (r.keptText ? `${r.text}（保留：${U.trimText(r.keptText, 24)}）` : r.text) : `${(r.end - r.start).toFixed(1)} 秒没有说话`) },
        {
          key: 'act',
          label: '',
          width: '86px',
          align: 'right',
          render: (r) => {
            const on = restore.has(r.id) ? false : true
            return ui.btn(on ? '恢复' : '剪掉', () => {
              if (restore.has(r.id)) restore.delete(r.id)
              else restore.add(r.id)
              L.restore = restore
              L.dirty = true
              ctx.update()
            }, { size: 'sm', kind: on ? 'ghost' : 'secondary', icon: on ? 'retry' : 'scissors' })
          },
        },
      ],
      rows,
      empty: '没有需要剪掉的地方',
    })
  }

  function resultSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const rc = d.roughcut
    const key = `plan:${PK.dir()}`
    const busy = jobRunning(key) || jobRunning(`build:${PK.dir()}`)
    const engineReady = Boolean(L.asr && L.asr.ready)
    const head = ui.row(
      [
        ui.btn(rc ? (L.dirty ? '应用修改并重新规划' : '重新识别并规划') : '识别并规划粗剪', () => runPlan(ctx), { kind: rc && !L.dirty ? 'secondary' : 'primary', icon: 'wave', disabled: busy || !engineReady || !L.source, busyText: '处理中…' }),
        rc && !L.dirty ? ui.btn('从头重新识别', () => runPlan(ctx, { force: true }), { kind: 'ghost', size: 'sm', icon: 'refresh', disabled: busy || !engineReady, title: '识别结果有误时：忽略缓存，重新听写一遍' }) : null,
        ui.spacer(),
        L.dirty ? ui.pill('有未应用的修改', 'warn', { dot: true }) : null,
      ],
      { wrap: true },
    )
    if (!rc) {
      return ui.section(
        { title: '粗剪结果', en: 'ROUGH CUT', icon: 'scissors', desc: '先“听写”整段视频，再按上面的规则标出要剪掉的地方。第一次识别 1 分钟的视频大约需要几秒钟。' },
        engineReady ? null : ui.note('请先在上面安装本地语音识别。', { level: 'info' }),
        head,
        jobView(key),
      )
    }
    const stats = (rc.plan && rc.plan.stats) || {}
    const by = stats.byKind || {}
    const count = (k) => (by[k] ? by[k].count : 0)
    return ui.section(
      { title: '粗剪结果', en: 'ROUGH CUT', icon: 'scissors', desc: '删掉的地方用删除线标出：点一下文字就能恢复，点没被删的词可以把它删掉；改完点「应用修改」。' },
      ui.row(
        [
          ui.stat(fmtSec(stats.sourceDurationSec), '原视频'),
          ui.stat(fmtSec(stats.outputDurationSec), '剪辑后'),
          ui.stat(fmtSec(stats.savedSec), '省掉'),
          ui.stat(String(count('pause') + count('noise')), '长停顿'),
          ui.stat(String(count('filler') + count('fragment')), '口头禅 / 口误'),
          ui.stat(String(count('stutter')), '结巴'),
          ui.stat(String(count('retake') + count('false-start')), '重录'),
        ],
        { wrap: true },
      ),
      head,
      jobView(key),
      ui.tabs({
        value: L.view || 'text',
        items: [
          { value: 'text', label: '逐字稿', icon: 'list' },
          { value: 'list', label: '剪掉的地方', icon: 'scissors', badge: String((rc.plan.removals || []).filter((r) => r.applied).length) },
          { value: 'subs', label: '字幕预览', icon: 'prompt', badge: String((rc.captions || []).length) },
        ],
        onChange: (v) => {
          L.view = v
          ctx.update()
        },
      }),
      (L.view || 'text') === 'text'
        ? transcriptView(ctx, rc)
        : L.view === 'list'
          ? removalTable(ctx, rc)
          : ui.list(
              (rc.captions || []).slice(0, 400).map((c) => ui.item({ lead: ui.mono(fmtClock(c.startSec)), title: c.text, key: `cap-${c.index}` })),
              { dense: true },
            ),
      L.dirty ? ui.hint('修改还没应用：点上面的「应用修改并重新规划」，字幕和时长会一起更新（不用重新识别，几秒钟）。') : null,
    )
  }

  /** 口播包装: style, which decorations, the lower-third name strip, and what the rules would place on this cut */
  /** 录屏讲解 + 卡通讲解员: captions on / off, no zoom at the cuts for screen recordings, a cartoon host in a corner. */
  /** 「我的动漫形象」 as the presenter: which character, which way it moves (free / local model / cloud), corner, size. */
  function animePresenterFields(ctx, P, p, set, busy) {
    const chars = Array.isArray(P.characters) ? P.characters : []
    const engines = Array.isArray(P.presenterEngines) && P.presenterEngines.length ? P.presenterEngines : [{ id: 'sprite', label: '免费 · 会张嘴眨眼的立绘', available: true, paid: false }]
    const m = p.mascot && p.mascot.characterId ? p.mascot : null
    const setM = (patch) => set('mascot', { corner: 'bl', size: 'm', engine: 'sprite', ...(m || {}), ...patch })
    const eng = engines.find((e) => e.id === ((m && m.engine) || 'sprite')) || engines[0]
    const missing = m && !chars.some((c) => c.id === m.characterId)
    return ui.stack(
      [
        chars.length
          ? ui.grid(
              [
                ui.field(
                  { label: '用哪个形象', en: 'CHARACTER' },
                  ui.select({ value: m && !missing ? m.characterId : '', options: [{ value: '', label: '请选择' }, ...chars.map((c) => ({ value: c.id, label: S(c.name) || '我的动漫形象' }))], disabled: busy, onChange: (v) => (v ? setM({ characterId: v }) : set('mascot', null)) }),
                ),
                ui.field(
                  { label: '怎么动', en: 'MOTION', hint: S(eng && eng.reason) },
                  ui.select({
                    value: (m && m.engine) || 'sprite',
                    options: engines.map((e) => ({ value: e.id, label: `${S(e.label)}${e.available ? '' : '（还不能用）'}` })),
                    disabled: busy || !m,
                    onChange: (v) => {
                      const e = engines.find((x) => x.id === v)
                      if (e && !e.available) {
                        PK.toast(`「${S(e.label)}」还不能用：${S(e.reason)}`, 'warn', { action: { label: e.paid ? '去填写云端密钥' : '去形象库设置', onClick: () => PK.open(e.paid ? 'animeCloud' : 'animeChars') } })
                        return
                      }
                      setM({ engine: v, mode: '' })
                    },
                  }),
                ),
                m && eng && Array.isArray(eng.modes) && eng.modes.length
                  ? ui.field(
                      { label: eng.id === 'vidu' ? '清晰度' : '模式', en: 'MODE', hint: eng.id === 'volc' ? '动漫形象建议「灵动」；「大画幅灵动」脸和上半身都动，但最慢' : eng.id === 'vidu' ? '两种清晰度价格一样' : '' },
                      ui.select({ value: m.mode || eng.defaultMode || eng.modes[0].value, options: eng.modes.map((x) => ({ value: x.value, label: S(x.label) })), disabled: busy, onChange: (v) => setM({ mode: v }) }),
                    )
                  : null,
              ].filter(Boolean),
              { min: 220, fit: true },
            )
          : ui.note('还没有动漫形象：先在「我的动漫形象」里用你的照片（或现成的卡通图）做一个，做一次以后每条视频都能用。', { level: 'info', actions: [ui.btn('去做一个', () => PK.open('animeChars'), { size: 'sm', icon: 'wand' })] }),
        missing ? ui.hint('之前选的形象已经不在形象库里了，请重新选一个。') : null,
        m && eng && eng.paid ? ui.hint('云端按秒收费：生成剪辑工程或一键出片前，会先告诉你这段视频大约多少钱，你确认后才生成；同一段声音不会重复收费。') : null,
        m && eng && eng.id === 'tha3' ? ui.hint('显卡档在你的电脑上生成，不花钱；有 NVIDIA 显卡几分钟，没有显卡会慢很多。') : null,
        m
          ? ui.grid(
              [
                ui.field({ label: '位置', en: 'CORNER' }, ui.seg({ value: m.corner || 'bl', options: [{ value: 'bl', label: '左下角' }, { value: 'br', label: '右下角' }], disabled: busy, aria: '讲解员位置', onChange: (v) => setM({ corner: v }) })),
                ui.field({ label: '大小', en: 'SIZE' }, ui.seg({ value: m.size || 'm', options: [{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }], disabled: busy, aria: '讲解员大小', onChange: (v) => setM({ size: v }) })),
              ],
              { min: 220, fit: true },
            )
          : null,
        ui.row([ui.btn('打开「我的动漫形象」', () => PK.open('animeChars'), { size: 'sm', kind: 'ghost', icon: 'user' }), ui.hint('新建形象、调整嘴和眼睛的位置、安装本地模型或填写云端密钥')], { wrap: true }),
      ],
      { gap: 8 },
    )
  }

  function mascotBlock(ctx, P, p, set, busy) {
    const cands = Array.isArray(P.mascotCandidates) ? P.mascotCandidates : []
    const L = ctx.local
    const kind = p.mascot && p.mascot.characterId ? 'anime' : p.mascot && p.mascot.assetId ? 'asset' : L.mascotKind || ''
    const m = p.mascot && p.mascot.assetId ? p.mascot : null
    const setM = (patch) => set('mascot', patch === null ? null : { corner: 'bl', size: 'm', ...(m || {}), ...patch })
    const label = (it) => `${it.type === 'video' ? '🎬' : '🖼'} ${S(it.name)}${it.type === 'video' && it.durationSec ? `（${fmtSec(it.durationSec)}）` : ''}`
    const options = [{ value: '', label: '请选择' }, ...cands.map((it) => ({ value: it.id, label: label(it) }))]
    const picked = m && !cands.some((it) => it.id === m.assetId) ? null : m
    const kindSeg = ui.field(
      { label: '卡通讲解员', en: 'CARTOON HOST', hint: '站在画面角落、跟着你的声音一起动。「我的动漫形象」会张嘴、眨眼、点头，比整张图片跳动自然得多。' },
      ui.seg({
        value: kind,
        options: [
          { value: '', label: '不加' },
          { value: 'anime', label: '我的动漫形象（推荐）' },
          { value: 'asset', label: '素材库里的图片' },
        ],
        disabled: busy,
        aria: '卡通讲解员',
        onChange: (v) => {
          L.mascotKind = v
          if (!v) set('mascot', null)
          else if (v === 'anime') {
            const first = (P.characters || [])[0]
            set('mascot', first ? { characterId: first.id, engine: 'sprite', corner: (p.mascot && p.mascot.corner) || 'bl', size: (p.mascot && p.mascot.size) || 'm' } : null)
          } else set('mascot', null)
        },
      }),
    )
    const fallback = P.mascotFallback ? ui.note(`上次生成时${S(P.mascotNote)}`, { level: 'warn' }) : null
    if (kind === 'anime' || kind === '') {
      return ui.stack(
        [
          ui.grid(
            [
              ui.toggle({ value: p.captions !== false, label: '显示字幕', hint: '按真实说的话逐字出字幕。像软件教程那样只要声音和画面时，可以关掉', onChange: (v) => set('captions', v) }),
              ui.toggle({ value: Boolean(p.screen), label: '这是录屏讲解', hint: '剪掉停顿时不做画面放大（放大会裁掉界面边缘），适合软件操作、网页演示这类录屏', onChange: (v) => set('screen', v) }),
            ],
            { min: 230, fit: true },
          ),
          kindSeg,
          kind === 'anime' ? animePresenterFields(ctx, P, p, set, busy) : null,
          kind === 'anime' && p.mascot && S(P.mascotNote) && !P.mascotFallback ? ui.hint(`上次生成：${S(P.mascotNote)}`) : null,
          kind === 'anime' ? fallback : null,
        ],
        { gap: 8 },
      )
    }
    return ui.stack(
      [
        ui.grid(
          [
            ui.toggle({ value: p.captions !== false, label: '显示字幕', hint: '按真实说的话逐字出字幕。像软件教程那样只要声音和画面时，可以关掉', onChange: (v) => set('captions', v) }),
            ui.toggle({ value: Boolean(p.screen), label: '这是录屏讲解', hint: '剪掉停顿时不做画面放大（放大会裁掉界面边缘），适合软件操作、网页演示这类录屏', onChange: (v) => set('screen', v) }),
          ],
          { min: 230, fit: true },
        ),
        kindSeg,
        ui.field(
          {
            label: '用哪张图片',
            en: 'PICTURE',
            hint: '说话时点头蹦跳、停顿时呼吸摆动。透明背景的 PNG 最好，纯白 / 纯绿等纯色背景会自动抠掉；也可以用一段纯色背景的卡通说话小视频（20 秒以内，嘴会跟着动）。',
          },
          ui.select({ value: picked ? picked.assetId : '', options, disabled: busy || !cands.length, onChange: (v) => setM(v ? { assetId: v } : null) }),
        ),
        !cands.length ? ui.hint('素材库里还没有图片或短视频：先在「素材」里上传一张卡通形象（可以用豆包、即梦等工具生成，或在「设置 → 云端生成」里生成一张）。') : null,
        picked
          ? ui.grid(
              [
                ui.field({ label: '位置', en: 'CORNER' }, ui.seg({ value: picked.corner || 'bl', options: [{ value: 'bl', label: '左下角' }, { value: 'br', label: '右下角' }], disabled: busy, aria: '卡通讲解员位置', onChange: (v) => setM({ corner: v }) })),
                ui.field({ label: '大小', en: 'SIZE' }, ui.seg({ value: picked.size || 'm', options: [{ value: 's', label: '小' }, { value: 'm', label: '中' }, { value: 'l', label: '大' }], disabled: busy, aria: '卡通讲解员大小', onChange: (v) => setM({ size: v }) })),
              ],
              { min: 220, fit: true },
            )
          : null,
        picked && S(P.mascotNote) ? ui.hint(`上次生成：${S(P.mascotNote)}`) : null,
      ],
      { gap: 8 },
    )
  }

  function packSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const P = d.pack
    if (!d.roughcut || !P) return null
    const p = L.pack || P.settings || {}
    const busy = jobRunning(`plan:${PK.dir()}`) || jobRunning(`build:${PK.dir()}`) || jobRunning(`footage:${PK.dir()}`) || L.packSaving
    const set = (k, v) => {
      L.pack = { ...p, [k]: v }
      L.packDirty = true
      ctx.update()
    }
    const lt = p.lowerThird || { name: '', title: '' }
    const setLt = (k, v) => {
      const next = { ...lt, [k]: v }
      L.pack = { ...p, lowerThird: String(next.name || '').trim() ? next : null }
      L.packDirty = true
    }
    const pv = P.preview || null
    const kwChips = pv && pv.keywords && pv.keywords.length ? pv.keywords.map((k) => ui.tag(`${S(k.text)} · ${fmtSec(k.startSec)}`)) : null
    const chChips = pv && pv.chapters && pv.chapters.length ? pv.chapters.map((c) => ui.tag(`${String(c.index).padStart(2, '0')} ${S(c.title)} · ${fmtSec(c.startSec)}`)) : null
    const brItems = pv && pv.broll && pv.broll.length
      ? pv.broll.map((b) => ui.tag(`${fmtSec(b.startSec)}–${fmtSec(b.endSec)} · ${S(b.path).split('/').pop()}（匹配：${(b.match || []).join('、')}）`))
      : null
    return ui.section(
      { title: '口播包装', en: 'PACKAGING', icon: 'sparkle', desc: '关键词大字、章节卡、进度条和名字条，并按你讲的内容自动插入空镜（素材库里文件名或内容对得上的视频 / 图片）。全部按规则在本机完成，不调用大模型、不花钱。' },
      ui.field(
        { label: '包装风格', en: 'STYLE' },
        ui.seg({ value: S(p.preset) || 'knowledge', options: (P.presets || []).map((x) => ({ value: x.value, label: x.label })), disabled: busy, aria: '包装风格', onChange: (v) => set('preset', v) }),
      ),
      ui.grid(
        [
          ui.toggle({ value: p.keywords !== false, label: '关键词大字', hint: '说到数字、第几步、“关键是…”和反复强调的词时，在画面上弹出大字', onChange: (v) => set('keywords', v) }),
          ui.toggle({ value: p.chapters !== false, label: '章节卡', hint: '说到“第一步 / 首先 / 接下来 / 最后”时弹出章节标题', onChange: (v) => set('chapters', v) }),
          ui.toggle({ value: p.progressBar !== false, label: '顶部进度条', hint: '细进度条，章节处有刻度', onChange: (v) => set('progressBar', v) }),
          ui.toggle({ value: p.broll !== false, label: '按讲话内容插空镜', hint: '讲到的内容和素材对得上时，插入 2~4 秒空镜，声音不断', onChange: (v) => set('broll', v) }),
          ui.toggle({ value: p.sfx !== false, label: '包装音效', hint: '弹出关键词和切空镜时加轻微的“啵 / 嗖”声，压在人声下面', onChange: (v) => set('sfx', v) }),
        ],
        { min: 230, fit: true },
      ),
      ui.grid(
        [
          ui.field({ label: '名字条 · 名字', en: 'LOWER THIRD', hint: '开头 1 秒出现，约 3.5 秒；留空就不显示' }, ui.input({ key: 'te-lt-name', value: S(lt.name), maxLength: 20, placeholder: '例如：王老师', onInput: (v) => setLt('name', v), onChange: () => ctx.update() })),
          ui.field({ label: '身份 / 一句介绍', en: 'TITLE' }, ui.input({ key: 'te-lt-title', value: S(lt.title), maxLength: 30, placeholder: '例如：视频剪辑讲师', onInput: (v) => setLt('title', v), onChange: () => ctx.update() })),
        ],
        { min: 220, fit: true },
      ),
      mascotBlock(ctx, P, p, set, busy),
      pv
        ? ui.stack(
            [
              ui.hint('按当前设置，这条视频会放这些（重新生成剪辑工程时按最新的说话内容再算一遍）：'),
              kwChips ? ui.row([ui.strong('关键词'), ...kwChips], { wrap: true }) : ui.hint('关键词：这段话里没有找到适合弹出的词（数字、第几步、强调的词）。'),
              chChips ? ui.row([ui.strong('章节'), ...chChips], { wrap: true }) : ui.hint('章节：没有找到“第一步 / 首先 / 最后”这类分段说法，不显示章节卡。'),
              brItems ? ui.row([ui.strong('空镜'), ...brItems], { wrap: true }) : ui.hint(U.num(P.libraryCount, 0) ? '空镜：素材库里的视频 / 图片和讲话内容对不上。给素材起个能看懂的文件名（如“素材整理演示.mp4”）就能自动匹配。' : '空镜：素材库里还没有可以当空镜的视频或图片。'),
            ],
            { gap: 6 },
          )
        : null,
      U.num(P.unindexed, 0) > 0
        ? ui.row([ui.hint(`有 ${U.num(P.unindexed, 0)} 段空镜视频还没分析镜头（分析后会挑最清楚、最稳的一段来用）。`), ui.btn('分析空镜素材（本地免费）', () => indexLibrary(ctx).catch((err) => PK.toast(`分析没有完成：${S(err && err.message)}`, 'error')), { size: 'sm', icon: 'film', disabled: busy })], { wrap: true })
        : null,
      jobView(`footage:${PK.dir()}`),
      ui.row([ui.btn(L.packDirty ? '保存包装设置' : '包装设置已保存', () => savePack(ctx).catch((err) => PK.toast(`保存失败：${S(err && err.message)}`, 'error')), { size: 'sm', kind: L.packDirty ? 'primary' : 'ghost', icon: 'check', disabled: busy || !L.packDirty, busyText: '保存中…' }), ui.hint('一键出片、重新生成剪辑工程都会按这里的设置包装。')], { wrap: true }),
    )
  }

  function buildSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const rc = d.roughcut
    if (!rc) return null
    const busy = jobRunning(`plan:${PK.dir()}`) || jobRunning(`build:${PK.dir()}`)
    const built = d.project && d.project.productionType === 'talk-edit' && d.project.builtFrom === S(d.source && d.source.path)
    const video = rc.render && rc.render.video ? PK.assetUrl(rc.render.video) : ''
    const portrait = rc.source && rc.source.height > rc.source.width
    return ui.section(
      { title: '生成成片', en: 'BUILD · PRODUCE', icon: 'bolt', desc: '剪好的视频做画面，你自己的声音做配音，字幕按真实说的话逐字出现，再配一首压在人声下面的轻音乐。' },
      built && video && !L.dirty ? ui.video(video, { aspect: portrait ? '9 / 16' : '16 / 9', class: 'pk-te-video' }) : null,
      built && rc.render && rc.render.srt ? ui.row([ui.link('下载字幕文件 SRT', PK.assetUrl(rc.render.srt)), ui.hint('（剪辑后时间轴）')]) : null,
      ui.grid(
        [
          ui.stack([ui.btn('一键出片', () => produce(ctx), { kind: 'primary', size: 'lg', block: true, icon: 'bolt', disabled: busy, busyText: '启动中…' }), ui.hint('剪辑 → 原声分段 → 字幕 → 配乐 → 渲染 MP4，可以在任务中心看进度。')], { gap: 4 }),
          ui.stack([ui.btn(built ? '重新生成剪辑工程' : '只生成剪辑工程（先看看）', () => runBuild(ctx), { block: true, icon: 'scissors', disabled: busy, busyText: '生成中…' }), ui.hint('生成剪好的视频、原声分段和字幕，然后可以去「分步精修」逐段看、改字幕。')], { gap: 4 }),
        ],
        { min: 240, fit: true },
      ),
      jobView(`build:${PK.dir()}`),
      built ? ui.row([ui.btn('去分步精修看字幕', () => PK.open('studio', { step: 'scenes' }), { size: 'sm', icon: 'film' }), ui.btn('调整配乐', () => PK.open('studio', { step: 'director' }), { size: 'sm', icon: 'music', kind: 'ghost' })], { wrap: true }) : null,
    )
  }

  PK.panel('talkEdit', {
    title: 'AI 剪辑 · 口播粗剪',
    en: 'AI EDIT · TALKING HEAD',
    idx: 'AE',
    icon: 'scissors',
    kind: 'modal',
    size: 'xl',
    group: 'tools',
    order: 12,
    desc: '真人出镜视频：自动去停顿、口头禅和重录，配真实字幕',
    needsProject: true,
    aliases: { aiEdit: {}, roughCut: {}, talk: {} },
    watch: (s) => s && s.project && s.project.dir,
    onWatch: (ctx) => {
      if (!PK.hasProject()) {
        ctx.close()
        return
      }
      ctx.local.source = ''
      ctx.local.rcSig = ''
      ctx.local.data = null
      loadState(ctx, { quiet: true })
    },
    mount(ctx) {
      const L = ctx.local
      L.mirror = 'cn'
      L.view = 'text'
      loadEngine(ctx).then(
        () => ctx.update(),
        (err) => {
          L.asrErr = err
          ctx.update()
        },
      )
      loadState(ctx, { quiet: true })
    },
    render(ctx) {
      const L = ctx.local
      ctx.foot([
        ui.hint('全部在本机完成：本地语音识别 + 剪辑，不上传、不调用大模型、不花钱。'),
        ui.spacer(),
        ui.btn('任务中心', () => PK.open('tasks'), { kind: 'ghost', icon: 'tasks' }),
      ])
      if (!L.data && !L.err) return [engineSection(ctx), ui.loading('正在读取工程素材…')]
      if (L.err && !L.data) return [engineSection(ctx), ui.errorBox(L.err, () => loadState(ctx))]
      return [engineSection(ctx), sourceSection(ctx), resultSection(ctx), packSection(ctx), buildSection(ctx)]
    },
  })
})()
