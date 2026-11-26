/* ============================================================================================================
 * PK · AI 剪辑 · 长视频拆条 (shortClips panel) — a long recording of the user's own (访谈 / 播客 / 直播回放 / 课程)
 * turned into stand-alone short clips:
 *   1. which recording, which platform (canvas + clip length), how many clips, an optional wish
 *   2. 找精彩片段: local speech recognition (cached) + ONE model call per ~60 min of speech (or the current agent)
 *   3. the clips: title (editable), why it was picked, where it sits in the recording, on / off, one sentence
 *      earlier / later at either end
 *   4. look (layout, captions, title, progress line, accent) → 出片 (local FFmpeg, free) → play, 另存为, open folder
 * The local speech recognition prepares itself automatically (clips/state starts it): its progress is shown (polled
 * from asr/status every 2 s) and 「找精彩片段」 can already be clicked (the job waits for it); 「重试」 when it failed.
 * Routes (routes-talk.js): GET clips/state · asr/status · POST clips/find · clips/update · clips/render · clips/reveal ·
 * asr/install.
 * ============================================================================================================ */
;(function () {
  'use strict'
  const PK = window.PK
  if (!PK || typeof PK.panel !== 'function') return
  const U = PK.util
  const ui = PK.ui

  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const fmtLen = (s) => {
    const v = Math.max(0, Math.round(Number(s) || 0))
    return v >= 60 ? `${Math.floor(v / 60)} 分 ${String(v % 60).padStart(2, '0')} 秒` : `${v} 秒`
  }
  const fmtClock = (s) => {
    const v = Math.max(0, Math.floor(Number(s) || 0))
    const h = Math.floor(v / 3600)
    const m = Math.floor((v % 3600) / 60)
    const ss = String(v % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
  }
  const LAYOUTS = [
    { value: 'auto', label: '自动', hint: '画面比例和平台一样就直接铺满；不一样就把整个画面放在模糊背景上，不会切掉人' },
    { value: 'fit', label: '模糊背景', hint: '完整画面 + 模糊的同一画面做背景，最稳妥' },
    { value: 'window', label: '访谈小窗', hint: '画面放进上方的小窗，标题在上、字幕在下（只用于竖屏）' },
    { value: 'crop', label: '裁成竖屏', hint: '从画面中间裁成竖屏，适合一个人坐在正中间的视频' },
  ]
  const CAPTIONS = [
    { value: 'auto', label: '自动', hint: '原视频已经有字幕时不再重复加' },
    { value: 'on', label: '加字幕' },
    { value: 'off', label: '不加' },
  ]

  // one job per project at a time; progress survives closing / reopening the panel
  const RUN = { dir: '', kind: '', state: '', pct: 0, msg: '', startedAt: 0, result: null }

  async function loadState(ctx, { quiet = false } = {}) {
    const L = ctx.local
    if (!PK.hasProject()) return
    try {
      const d = await PK.get('clips/state', { projectDir: PK.dir(), ...(L.source ? { source: L.source } : {}) }, { timeout: 60000 })
      L.data = d
      L.err = null
      if (!L.source && d && d.source) L.source = d.source.path
      const plan = d && d.plan
      if (plan && !L.touched) {
        L.form.platform = plan.platform || L.form.platform
        L.form.count = Number(plan.count) || 0
        L.form.focus = S(plan.focus)
      }
      if (plan && plan.render && !L.lookTouched) L.look = { ...L.look, ...plan.render }
    } catch (err) {
      L.err = err
      if (!quiet) PK.reportError(err)
    }
    ctx.update()
  }

  async function runJob(ctx, kind, label, start, doneText) {
    if (RUN.state === 'running') return
    RUN.dir = PK.dir()
    RUN.kind = kind
    RUN.state = 'running'
    RUN.pct = 2
    RUN.msg = '正在提交…'
    RUN.startedAt = Date.now()
    RUN.result = null
    ctx.update()
    const tick = setInterval(() => ctx.update(), 1000)
    try {
      const init = await start()
      const jobId = init && (init.jobId || (init.job && init.job.id))
      if (!jobId) throw new PK.Error(S(init && (init.error || init.message)) || '后台任务没有启动，请重试')
      const res = await PK.job(jobId, {
        interval: 1000,
        maxMs: 6 * 3600 * 1000,
        onProgress: (job) => {
          if (S(job && job.message).trim()) RUN.msg = S(job.message).trim()
          const p = U.num(job && job.progress, RUN.pct)
          if (p > 0) RUN.pct = U.clamp(p, 0, 100)
        },
      })
      RUN.state = 'done'
      RUN.pct = 100
      RUN.result = res
      RUN.msg = doneText(res)
      PK.toast(RUN.msg, 'success')
    } catch (err) {
      RUN.state = 'error'
      RUN.msg = S(err && err.message) || `${label}没有完成`
      PK.reportError(err, `${label}没有完成`)
    } finally {
      clearInterval(tick)
      await loadState(ctx, { quiet: true })
    }
  }

  const find = (ctx, force = false) => {
    const L = ctx.local
    const f = L.form
    return runJob(
      ctx,
      'find',
      '找精彩片段',
      () => PK.postP('clips/find', { sourcePath: L.source, platform: f.platform, count: Number(f.count) || 0, focus: S(f.focus).trim(), force }),
      (r) => `找到 ${U.num(r && r.clips, 0)} 个精彩片段，看一下标题和内容，再出片`,
    )
  }
  const render = (ctx, indexes = null, force = false) => {
    const L = ctx.local
    return runJob(
      ctx,
      'render',
      '出片',
      () => PK.postP('clips/render', { sourcePath: L.source, ...(indexes ? { indexes } : {}), settings: L.look, force }),
      (r) => {
        const list = (r && r.clips) || []
        const ok = list.filter((c) => !c.error).length
        return `出好了 ${ok} 条短视频${list.some((c) => c.reused) ? '（没改动的沿用了上次的）' : ''}`
      },
    )
  }
  async function edit(ctx, edits) {
    const L = ctx.local
    const res = await PK.postP('clips/update', { sourcePath: L.source, edits })
    if (res && res.plan && L.data) L.data = { ...L.data, plan: res.plan }
    ctx.update()
  }

  /* -------------------------------------------------------------------------------------------- speech engine */
  const installOf = (d) => (d && d.install) || {}
  /** every ~2 s while the engine is being prepared: the light asr/status, then the full state once it ended */
  async function pollInstall(ctx) {
    const L = ctx.local
    if (!L.data || L.installPolling || installOf(L.data).state !== 'running') return
    L.installPolling = true
    try {
      const res = await PK.get('asr/status', undefined, { timeout: 30000 })
      const asr = (res && res.asr) || {}
      const inst = (res && res.install) || {}
      if (!L.data) return
      L.data = { ...L.data, install: inst, engine: { ...(L.data.engine || {}), ready: Boolean(asr.ready), reason: asr.reason, missing: asr.missing, supportedPlatform: asr.supportedPlatform } }
      if (inst.state === 'running') ctx.update()
      else {
        if (asr.ready) PK.toast('本地语音识别已经准备好了', 'success')
        await loadState(ctx, { quiet: true })
      }
    } catch {
      // the next tick tries again
    } finally {
      L.installPolling = false
    }
  }
  /** 「重试」 / 「现在安装」: the shared install on the server (same folder and download source as the last attempt) */
  async function startInstall(ctx) {
    const L = ctx.local
    const inst = installOf(L.data)
    const res = await PK.post('asr/install', { mirror: inst.mirror === 'global' ? 'global' : 'cn', ...(inst.home ? { installDir: S(inst.home) } : {}) })
    if (L.data) L.data = { ...L.data, install: (res && res.install) || { ...inst, state: 'running', progress: 0 } }
    ctx.update()
  }
  async function installNow(ctx) {
    const ok = await PK.confirm({
      title: '现在安装本地语音识别？',
      text: '会下载约 260 MB（识别模型和运行库），装在推荐的位置；装好后完全离线、不花钱，以后一直能用。想自己选安装位置，可以到「AI 剪辑 · 口播粗剪」里安装。',
      ok: '开始安装',
    })
    if (ok) await startInstall(ctx)
  }

  /* -------------------------------------------------------------------------------------------- sections */
  function readinessNotes(ctx) {
    const d = ctx.local.data || {}
    const out = []
    const inst = installOf(d)
    if (d.engine && !d.engine.ready) {
      if (d.engine.supportedPlatform === false) {
        out.push(ui.note('这台电脑的系统暂时用不了本地语音识别（只支持 Windows、macOS、Linux 的 x64 和 arm64 电脑）。', { level: 'warn' }))
      } else if (inst.state === 'running') {
        const pct = Math.round(U.clamp(U.num(inst.progress, 0), 0, 100))
        out.push(ui.note(`本地语音识别正在自动准备：${pct}%（首次约 260 MB，只需一次，不用你操作）。现在就可以点「找精彩片段」，它会等准备好后自动开始。`, { level: 'info' }))
      } else if (inst.state === 'failed' || inst.state === 'done') {
        // done but still not usable (files moved / deleted meanwhile): the same way out as a failure
        out.push(
          ui.note(`本地语音识别没有准备好：${S(inst.error) || (d.engine.missing && d.engine.missing.length ? `还缺 ${d.engine.missing.join('、')}` : '原因未知')}`, {
            level: 'warn',
            actions: [ui.btn('重试', () => startInstall(ctx), { size: 'sm', kind: 'primary', icon: 'retry', busyText: '正在重试…' }), ui.btn('自己选安装位置', () => PK.open('talkEdit'), { size: 'sm', kind: 'ghost', icon: 'folder' })],
          }),
        )
      } else if (inst.state === 'disabled') {
        out.push(
          ui.note('拆条要先“听懂”视频里说了什么，需要本地语音识别（约 260 MB，装一次，免费离线）。自动安装已经关掉了：可以现在安装，或者去「口播粗剪」里自己选安装位置。', {
            level: 'warn',
            actions: [ui.btn('现在安装', () => installNow(ctx), { size: 'sm', kind: 'primary', icon: 'download', busyText: '正在启动…' }), ui.btn('自己选安装位置', () => PK.open('talkEdit'), { size: 'sm', kind: 'ghost', icon: 'folder' })],
          }),
        )
      } else {
        out.push(ui.note('拆条要先“听懂”视频里说了什么：第一次使用时会自动准备本地语音识别（约 260 MB，只需一次，不用你操作），可以直接点「找精彩片段」。', { level: 'info' }))
      }
    }
    if (d.llm && !d.llm.configured) {
      out.push(ui.note('挑片段要用到大模型：请先在「设置 · 模型与密钥」里选一个模型（也可以选「由当前智能体代写」）。', { level: 'warn', actions: [ui.btn('去设置', () => PK.open('llm'), { size: 'sm', icon: 'settings' })] }))
    }
    return out
  }

  function sourceSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const f = L.form
    const sources = Array.isArray(d.sources) ? d.sources : []
    const busy = RUN.state === 'running'
    const set = (k, v) => {
      f[k] = v
      L.touched = true
      ctx.update()
    }
    if (!sources.length) {
      return ui.section(
        { title: '要拆的长视频', en: 'RECORDING', icon: 'film' },
        ui.empty({
          icon: 'film',
          title: '素材库里还没有带声音的视频',
          text: '把访谈、播客、直播回放或课程录像上传到素材库。只用你自己的视频，插件不会去网上下载。',
          actions: [ui.btn('去素材库上传', () => PK.open('studio', { step: 'assets' }), { kind: 'primary', icon: 'upload' })],
        }),
      )
    }
    const platforms = Array.isArray(d.platforms) ? d.platforms : []
    const plat = platforms.find((p) => p.value === f.platform) || platforms[0] || {}
    const est = d.estimate
    const estText = !est
      ? ''
      : est.transcribed
        ? `这段视频约需调用大模型 ${U.num(est.calls, 1)} 次（约 ${Math.round(U.num(est.inputTokens, 0) / 1000)} 千 token）${est.local ? '，用的是本机模型，不花钱' : ''}${d.llm && d.llm.mode === 'host-agent' ? '，由当前智能体代写' : ''}`
        : '第一次会先在本机识别说话内容（不花钱，长视频要几分钟），然后每 1 小时内容调用一次大模型'
    return ui.section(
      { title: '要拆的长视频', en: 'RECORDING · PLATFORM', icon: 'film', desc: 'AI 会从整段内容里挑出能单独发布的片段：从一个问题或观点的第一句开始，到讲完为止，不会停在半句话上。' },
      ui.field(
        { label: '视频', en: 'RECORDING' },
        ui.select({
          value: S(L.source),
          options: sources.map((s) => ({ value: s.path, label: `${s.type === 'audio' ? '🎧' : '🎬'} ${S(s.name)}${s.durationSec ? `（${fmtLen(s.durationSec)}）` : ''}` })),
          disabled: busy,
          onChange: (v) => {
            L.source = v
            L.data = { ...(L.data || {}), plan: null, rendered: [] }
            L.touched = false
            L.lookTouched = false
            loadState(ctx)
          },
        }),
      ),
      ui.grid(
        [
          ui.field(
            { label: '发到哪里', en: 'PLATFORM', hint: plat.value ? `${plat.aspect === 'source' ? '保持原画幅' : plat.aspect} · 每条 ${plat.minSec}–${plat.maxSec} 秒，最好 ${plat.targetLo}–${plat.targetHi} 秒` : '' },
            ui.select({ value: S(f.platform), options: platforms.map((p) => ({ value: p.value, label: p.label })), disabled: busy, onChange: (v) => set('platform', v) }),
          ),
          ui.field({ label: '要几条', en: 'COUNT' }, ui.seg({ value: String(Number(f.count) || 0), options: [{ value: '0', label: '自动' }, { value: '3', label: '3 条' }, { value: '5', label: '5 条' }, { value: '8', label: '8 条' }], disabled: busy, aria: '要几条', onChange: (v) => set('count', Number(v) || 0) })),
        ],
        { min: 240, fit: true },
      ),
      ui.field(
        { label: '想要哪些内容（可不填）', en: 'FOCUS', hint: '例如：只要讲方法的部分 / 嘉宾讲个人经历的片段' },
        ui.input({ key: 'sc-focus', value: S(f.focus), maxLength: 120, placeholder: '不填就让 AI 自己挑最精彩的', disabled: busy, onInput: (v) => ((f.focus = v), (L.touched = true)), onChange: () => ctx.update() }),
      ),
      estText ? ui.hint(estText) : null,
    )
  }

  function clipCard(ctx, c, rendered) {
    const busy = RUN.state === 'running'
    const r = rendered[c.index]
    const off = c.enabled === false
    return ui.card({
      key: `clip-${c.index}`,
      class: ['pk-sc-card', off ? 'pk-sc-off' : ''].filter(Boolean).join(' '),
      // portrait clips are shown whole (letterboxed) in a 4:3 window so the cards stay a sensible height
      media: r && r.video ? ui.video(PK.assetUrl(r.video), { poster: r.cover ? PK.assetUrl(r.cover) : '' }) : null,
      title: null,
      body: ui.stack(
        [
          ui.row(
            [
              ui.pill(`#${c.index}`, 'acc'),
              ui.pill(fmtLen(c.spanSec), 'mute'),
              ui.pill(`原视频 ${fmtClock(c.sourceStart)}–${fmtClock(c.sourceEnd)}`, 'mute'),
              Number(c.score) ? ui.pill(`AI 评分 ${Math.round(Number(c.score) * 100)}`, Number(c.score) >= 0.7 ? 'ok' : 'mute') : null,
              r && r.video ? ui.pill('已出片', 'ok', { dot: true }) : null,
            ],
            { wrap: true },
          ),
          ui.input({
            key: `sc-title-${c.index}`,
            value: S(c.title),
            maxLength: 30,
            disabled: busy,
            aria: `第 ${c.index} 条的标题`,
            onChange: (v) => {
              const t = S(v).trim()
              if (t && t !== c.title) edit(ctx, [{ index: c.index, title: t }]).catch((e) => PK.reportError(e))
            },
          }),
          c.reason ? ui.hint(`入选理由：${S(c.reason)}`) : null,
          ui.text(U.trimText(S(c.text), 160), { tone: 'muted' }),
          c.tags && c.tags.length ? ui.row(c.tags.map((t) => ui.tag(`#${t}`)), { wrap: true }) : null,
        ],
        { gap: 6 },
      ),
      actions: [
        ui.toggle({ value: !off, label: off ? '不出这条' : '出这条', disabled: busy, onChange: (v) => edit(ctx, [{ index: c.index, enabled: v }]).catch((e) => PK.reportError(e)) }),
        ui.row(
          [
            ui.btn('开头往前一句', () => edit(ctx, [{ index: c.index, startDelta: -1 }]), { size: 'sm', kind: 'ghost', disabled: busy, title: '把前面一句话也包含进来' }),
            ui.btn('开头往后一句', () => edit(ctx, [{ index: c.index, startDelta: 1 }]), { size: 'sm', kind: 'ghost', disabled: busy }),
            ui.btn('结尾往前一句', () => edit(ctx, [{ index: c.index, endDelta: -1 }]), { size: 'sm', kind: 'ghost', disabled: busy }),
            ui.btn('结尾往后一句', () => edit(ctx, [{ index: c.index, endDelta: 1 }]), { size: 'sm', kind: 'ghost', disabled: busy, title: '把后面一句话也包含进来' }),
          ],
          { wrap: true },
        ),
        r && r.video
          ? ui.row(
              [
                ui.btn('另存为', () => PK.saveFile({ rel: r.video, name: `${S(c.title) || `片段${c.index}`}.mp4`, what: '短视频' }), { size: 'sm', icon: 'download' }),
                r.cover ? ui.btn('封面', () => PK.saveFile({ rel: r.cover, name: `${S(c.title) || `片段${c.index}`}.jpg`, what: '封面' }), { size: 'sm', kind: 'ghost', icon: 'image' }) : null,
                ui.btn('只重出这条', () => render(ctx, [c.index], true), { size: 'sm', kind: 'ghost', icon: 'refresh', disabled: busy }),
              ],
              { wrap: true },
            )
          : null,
      ],
    })
  }

  function clipsSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const plan = d.plan
    if (!plan || !Array.isArray(plan.clips) || !plan.clips.length) return null
    const rendered = {}
    for (const r of d.rendered || []) rendered[r.index] = r
    const on = plan.clips.filter((c) => c.enabled !== false).length
    const found = plan.found || {}
    return ui.section(
      {
        title: '挑出来的片段',
        en: 'CLIPS',
        icon: 'scissors',
        count: plan.clips.length,
        desc: `标题可以直接改；觉得开头或结尾不完整，就按「往前一句 / 往后一句」调整。${found.dropped && found.dropped.length ? `另有 ${found.dropped.length} 个片段太短，已经去掉。` : ''}`,
      },
      ui.grid(plan.clips.map((c) => clipCard(ctx, c, rendered)), { min: 300 }),
      ui.hint(`将出 ${on} 条 · 关掉的片段不出片`),
    )
  }

  function lookSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const plan = d.plan
    if (!plan || !plan.clips || !plan.clips.length) return null
    const look = L.look
    const busy = RUN.state === 'running'
    const set = (k, v) => {
      L.look = { ...L.look, [k]: v }
      L.lookTouched = true
      ctx.update()
    }
    const lay = LAYOUTS.find((x) => x.value === (look.layout || 'auto')) || LAYOUTS[0]
    const burned = plan.burned && plan.burned.burned
    return ui.section(
      { title: '成片样式', en: 'LOOK', icon: 'brush', desc: '每条片段里的停顿、口头禅、重复和重录也会自动剪掉；声音统一到短视频平台的标准音量。' },
      ui.grid(
        [
          ui.field({ label: '画面', en: 'LAYOUT', hint: lay.hint }, ui.seg({ value: look.layout || 'auto', options: LAYOUTS.map(({ value, label }) => ({ value, label })), disabled: busy, aria: '画面', onChange: (v) => set('layout', v) })),
          ui.field({ label: '字幕', en: 'CAPTIONS', hint: burned ? '检测到原视频已经带字幕，「自动」时不再重复加' : (CAPTIONS.find((x) => x.value === (look.captions || 'auto')) || CAPTIONS[0]).hint || '' }, ui.seg({ value: look.captions || 'auto', options: CAPTIONS.map(({ value, label }) => ({ value, label })), disabled: busy, aria: '字幕', onChange: (v) => set('captions', v) })),
        ],
        { min: 260, fit: true },
      ),
      ui.row(
        [
          ui.toggle({ value: look.title !== false, label: '显示标题', disabled: busy, onChange: (v) => set('title', v) }),
          ui.toggle({ value: look.progressBar !== false, label: '进度条', disabled: busy, onChange: (v) => set('progressBar', v) }),
          ui.field({ label: '强调色', en: 'ACCENT', inline: true }, ui.color({ value: look.accent || '#FFD400', onChange: (v) => set('accent', v) })),
        ],
        { wrap: true },
      ),
    )
  }

  function runSection(ctx) {
    const L = ctx.local
    const d = L.data || {}
    const plan = d.plan
    const busy = RUN.state === 'running'
    const mine = RUN.dir === PK.dir()
    // the engine being prepared (or about to be, on first use) is fine: the find job waits for it on the server
    const engineOk = d.engine && (d.engine.ready || ['running', 'idle'].includes(installOf(d).state))
    const ready = engineOk && d.llm && d.llm.configured && L.source
    const hasClips = plan && plan.clips && plan.clips.length
    const enabled = hasClips ? plan.clips.filter((c) => c.enabled !== false).length : 0
    const elapsed = RUN.startedAt ? U.fmtDur((Date.now() - RUN.startedAt) / 1000) : ''
    const rendered = (d.rendered || []).length
    return ui.section(
      { title: hasClips ? '出片' : '开始', en: hasClips ? 'RENDER' : 'FIND', icon: 'bolt' },
      ui.grid(
        [
          hasClips
            ? ui.stack([ui.btn(`出片（${enabled} 条）`, () => render(ctx), { kind: 'primary', size: 'lg', block: true, icon: 'bolt', disabled: busy || !enabled, busyText: '出片中…' }), ui.hint('本机剪辑，不花钱；没改过的片段直接沿用上次的成片')], { gap: 4 })
            : null,
          ui.stack(
            [
              ui.btn(hasClips ? '重新找片段' : '找精彩片段', () => find(ctx), { kind: hasClips ? 'secondary' : 'primary', size: hasClips ? 'md' : 'lg', block: true, icon: 'wand', disabled: busy || !ready, busyText: '寻找中…', confirm: hasClips ? '重新找会替换当前这批片段（已出的成片文件保留），确定吗？' : null }),
              ui.hint(hasClips ? '换了平台、条数或想要的内容后，可以重新找' : '识别说话内容 → AI 挑片段 → 检查每个片段是否完整'),
            ],
            { gap: 4 },
          ),
        ],
        { min: 240, fit: true },
      ),
      mine && RUN.state
        ? ui.stack(
            [
              ui.meter(RUN.state === 'error' ? 100 : RUN.pct, {
                label: `${RUN.kind === 'render' ? '出片' : '找精彩片段'} · ${RUN.state === 'running' ? `进行中 · 已用 ${elapsed}` : RUN.state === 'done' ? '已完成' : '未完成'}`,
                valueText: RUN.state === 'error' ? '失败' : `${Math.round(RUN.pct)}%`,
                tone: RUN.state === 'error' ? 'err' : RUN.state === 'done' ? 'ok' : '',
                indeterminate: RUN.state === 'running' && RUN.pct <= 3,
              }),
              RUN.msg ? ui.text(RUN.msg, { tone: RUN.state === 'error' ? null : 'muted', class: RUN.state === 'error' ? 'pk-text--err' : '' }) : null,
            ],
            { gap: 6 },
          )
        : null,
      rendered
        ? ui.row(
            [
              ui.btn('打开成片文件夹', () => PK.postP('clips/reveal', { sourcePath: L.source }).then((r) => PK.toast(r && r.opened ? '已在文件管理器里打开' : `成片在工程的 ${S(r && r.folder)} 文件夹里`, 'info')), { size: 'sm', icon: 'folder' }),
              ui.hint('文件夹里还有每条的字幕文件和「发布文案.md」（标题、简介、话题）'),
            ],
            { wrap: true },
          )
        : null,
    )
  }

  PK.panel('shortClips', {
    title: 'AI 剪辑 · 长视频拆条',
    en: 'AI EDIT · SHORT CLIPS',
    idx: 'SC',
    icon: 'scissors',
    kind: 'modal',
    size: 'xl',
    group: 'tools',
    order: 12.5,
    desc: '把访谈、播客、直播回放剪成多条能单独发布的短视频',
    needsProject: true,
    aliases: { clips: {}, clipFactory: {}, shorts: {} },
    watch: (s) => s && s.project && s.project.dir,
    onWatch: (ctx) => {
      if (!PK.hasProject()) {
        ctx.close()
        return
      }
      ctx.local.source = ''
      ctx.local.data = null
      ctx.local.touched = false
      ctx.local.lookTouched = false
      loadState(ctx, { quiet: true })
    },
    mount(ctx) {
      const L = ctx.local
      L.form = L.form || { platform: 'douyin', count: 0, focus: '' }
      L.look = L.look || { layout: 'auto', captions: 'auto', title: true, progressBar: true, accent: '#FFD400' }
      loadState(ctx, { quiet: true })
      // the speech engine prepares itself in the background: follow its progress until it is done
      ctx.every(2000, () => pollInstall(ctx))
    },
    render(ctx) {
      const L = ctx.local
      ctx.foot([ui.hint('识别和剪辑都在本机完成；只有挑片段这一步调用大模型（每 1 小时内容约 1 次）。'), ui.spacer(), ui.btn('任务中心', () => PK.open('tasks'), { kind: 'ghost', icon: 'tasks' })])
      if (!L.data && !L.err) return [ui.loading('正在读取素材库…')]
      if (L.err && !L.data) return [ui.errorBox(L.err, () => loadState(ctx))]
      return [...readinessNotes(ctx), sourceSection(ctx), clipsSection(ctx), lookSection(ctx), runSection(ctx)]
    },
  })
})()
