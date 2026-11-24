/* ============================================================================================================
 * PK · AI 剪辑 · Vlog 高光 (highlightReel panel) — the user's own clips cut to the beat of a song, all on this computer:
 *   1. what is in the library (clips, total length, how many are analysed) and which music to cut to
 *   2. settings: length (auto / 15 / 30 / 60 s), order (按拍摄顺序 / 精彩优先), frame (auto / 16:9 / 9:16 / 1:1),
 *      an optional title
 *   3. 生成高光工程 (then 分步精修 to look at every cut) or 一键出片 (build + render the MP4)
 * Routes (routes-talk.js): GET highlight/state · POST highlight/build. No model call, no cost.
 * ============================================================================================================ */
;(function () {
  'use strict'
  const PK = window.PK
  if (!PK || typeof PK.panel !== 'function') return
  const U = PK.util
  const ui = PK.ui

  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const fmtSec = (s) => {
    const v = Math.max(0, Math.round(Number(s) || 0))
    return v >= 60 ? `${Math.floor(v / 60)} 分 ${String(v % 60).padStart(2, '0')} 秒` : `${v} 秒`
  }

  // one build per project at a time; progress survives closing / reopening the panel
  const RUN = { dir: '', state: '', pct: 0, msg: '', startedAt: 0, result: null }

  async function loadState(ctx, { quiet = false } = {}) {
    const L = ctx.local
    if (!PK.hasProject()) return
    try {
      L.data = await PK.get('highlight/state', { projectDir: PK.dir() }, { timeout: 60000 })
      L.err = null
      const d = L.data || {}
      if (L.form.musicAssetId === undefined) L.form.musicAssetId = d.built && d.built.musicAssetId ? d.built.musicAssetId : d.music && d.music[0] ? d.music[0].id : ''
      if (d.built && !L.touched) {
        L.form.order = d.built.order || L.form.order
        L.form.aspect = d.built.aspect || L.form.aspect
        L.form.title = S(d.built.title)
      }
    } catch (err) {
      L.err = err
      if (!quiet) PK.reportError(err)
    }
    ctx.update()
  }

  async function build(ctx, render) {
    const L = ctx.local
    const f = L.form
    if (RUN.state === 'running') return
    RUN.dir = PK.dir()
    RUN.state = 'running'
    RUN.pct = 2
    RUN.msg = '正在提交…'
    RUN.startedAt = Date.now()
    RUN.result = null
    ctx.update()
    const tick = setInterval(() => ctx.update(), 1000)
    try {
      const init = await PK.postP('highlight/build', { musicAssetId: f.musicAssetId || '', targetSec: Number(f.targetSec) || 0, order: f.order, aspect: f.aspect, title: S(f.title).trim(), render })
      const jobId = init && (init.jobId || (init.job && init.job.id))
      if (!jobId) throw new PK.Error(S(init && (init.error || init.message)) || '后台任务没有启动，请重试')
      const res = await PK.job(jobId, {
        interval: 1000,
        maxMs: 3 * 3600 * 1000,
        onProgress: (job) => {
          if (S(job && job.message).trim()) RUN.msg = S(job.message).trim()
          const p = U.num(job && job.progress, RUN.pct)
          if (p > 0) RUN.pct = U.clamp(p, 0, 100)
        },
      })
      RUN.state = 'done'
      RUN.pct = 100
      RUN.result = res
      RUN.msg = `已生成：${U.num(res && res.scenes, 0)} 个镜头 · ${fmtSec(res && res.durationSec)} · 用了 ${U.num(res && res.clipsUsed, 0)} 段素材${res && res.bpm ? ` · ${res.bpm} BPM` : ''}${render ? (res && res.outputPath ? ' · 成片已渲染' : '') : ''}`
      if (res && res.state) L.data = { ...(L.data || {}), ...res.state }
      PK.toast(render ? 'Vlog 高光成片已生成，可以在「交付」里预览和下载' : 'Vlog 高光工程已生成：去「分步精修」看看每个镜头', 'success')
      try {
        await PK.action('refresh', {}, { timeout: 60000 })
      } catch {}
    } catch (err) {
      RUN.state = 'error'
      RUN.msg = S(err && err.message) || '没有完成'
      PK.reportError(err, '剪 Vlog 高光没有完成')
    } finally {
      clearInterval(tick)
      ctx.update()
    }
  }

  function librarySection(ctx) {
    const d = ctx.local.data || {}
    const clips = Array.isArray(d.clips) ? d.clips : []
    const analysed = clips.filter((c) => c.analyzed).length
    return ui.section(
      { title: '素材', en: 'CLIPS', icon: 'film', desc: '素材库里的所有视频片段都会参与挑选：每段先切成镜头，按清晰度、曝光、稳定程度和动感打分，糊的、黑的、晃得厉害的不用。' },
      clips.length
        ? ui.row([ui.pill(`${clips.length} 段视频`, 'acc'), ui.pill(`共 ${fmtSec(d.totalSec)}`, 'mute'), ui.pill(analysed === clips.length ? '都已分析' : `已分析 ${analysed} 段（其余生成时自动分析）`, analysed === clips.length ? 'ok' : 'mute')], { wrap: true })
        : ui.note('素材库里还没有视频片段：先在「素材」里上传几段旅行、聚会、日常拍的视频（手机拍的就行）。', { level: 'warn', actions: [ui.btn('去上传素材', () => PK.open('studio', { step: 'assets' }), { size: 'sm', kind: 'primary', icon: 'upload' })] }),
    )
  }

  function settingsSection(ctx) {
    const L = ctx.local
    const f = L.form
    const d = L.data || {}
    const music = Array.isArray(d.music) ? d.music : []
    const busy = RUN.state === 'running'
    const set = (k, v) => {
      f[k] = v
      L.touched = true
      ctx.update()
    }
    return ui.section(
      { title: '怎么剪', en: 'SETTINGS', icon: 'settings', desc: '按音乐节拍切镜头：安静的段落镜头长一些，鼓点和高潮处快切；每个镜头 0.6~4 秒，片尾落在重拍上。' },
      ui.field(
        { label: '配乐', en: 'MUSIC', hint: music.length ? '按这首歌的真实节拍和高潮来剪' : '素材库里还没有音乐：会自动生成一段轻快的配乐（也可以先在「素材」里上传你喜欢的歌）' },
        music.length ? ui.select({ value: S(f.musicAssetId), options: music.map((m) => ({ value: m.id, label: `${S(m.name)}${m.durationSec ? `（${fmtSec(m.durationSec)}）` : ''}` })), disabled: busy, onChange: (v) => set('musicAssetId', v) }) : ui.hint('自动生成配乐'),
      ),
      ui.grid(
        [
          ui.field({ label: '成片长度', en: 'LENGTH' }, ui.seg({ value: String(f.targetSec || 0), options: [{ value: '0', label: '自动' }, { value: '15', label: '15 秒' }, { value: '30', label: '30 秒' }, { value: '60', label: '60 秒' }], disabled: busy, aria: '成片长度', onChange: (v) => set('targetSec', Number(v) || 0) })),
          ui.field({ label: '镜头顺序', en: 'ORDER' }, ui.seg({ value: f.order, options: [{ value: 'story', label: '按拍摄顺序' }, { value: 'best', label: '精彩优先' }], disabled: busy, aria: '镜头顺序', onChange: (v) => set('order', v) })),
          ui.field({ label: '画面比例', en: 'FRAME' }, ui.seg({ value: f.aspect, options: [{ value: 'auto', label: '跟随素材' }, { value: '16:9', label: '横屏' }, { value: '9:16', label: '竖屏' }, { value: '1:1', label: '方形' }], disabled: busy, aria: '画面比例', onChange: (v) => set('aspect', v) })),
        ],
        { min: 220, fit: true },
      ),
      ui.field({ label: '片头标题（可不填）', en: 'TITLE', hint: '开头 1 秒出现，约 3.5 秒' }, ui.input({ key: 'hl-title', value: S(f.title), maxLength: 20, placeholder: '例如：周末去海边', onInput: (v) => ((f.title = v), (L.touched = true)), onChange: () => ctx.update() })),
      ui.hint('「自动」长度：素材够多时最长 60 秒，不超过配乐长度。「按拍摄顺序」适合旅行记录；「精彩优先」把最有动感的镜头放在音乐最燃的地方。'),
    )
  }

  function runSection(ctx) {
    const d = ctx.local.data || {}
    const clips = Array.isArray(d.clips) ? d.clips : []
    const busy = RUN.state === 'running'
    const mine = RUN.dir === PK.dir()
    const elapsed = RUN.startedAt ? U.fmtDur((Date.now() - RUN.startedAt) / 1000) : ''
    return ui.section(
      { title: '生成', en: 'BUILD · PRODUCE', icon: 'bolt', desc: '只用你的素材和音乐，本机完成，不调用大模型、不花钱。原视频的声音会关掉，只保留配乐。' },
      d.built ? ui.hint(`这个工程上次生成：${U.num(d.built.scenes, 0)} 个镜头 · ${fmtSec(d.built.targetSec)}${d.built.order === 'best' ? ' · 精彩优先' : ' · 按拍摄顺序'}`) : null,
      ui.grid(
        [
          ui.stack([ui.btn('一键出片', () => build(ctx, true), { kind: 'primary', size: 'lg', block: true, icon: 'bolt', disabled: busy || !clips.length, busyText: '剪辑中…' }), ui.hint('挑片段 → 按节拍剪 → 配乐 → 渲染 MP4')], { gap: 4 }),
          ui.stack([ui.btn('只生成剪辑工程（先看看）', () => build(ctx, false), { block: true, icon: 'scissors', disabled: busy || !clips.length, busyText: '生成中…' }), ui.hint('生成后可以去「分步精修」逐个镜头看，再出片。')], { gap: 4 }),
        ],
        { min: 240, fit: true },
      ),
      mine && RUN.state
        ? ui.stack(
            [
              ui.meter(RUN.state === 'error' ? 100 : RUN.pct, {
                label: RUN.state === 'running' ? `Vlog 高光 · 进行中 · 已用 ${elapsed}` : RUN.state === 'done' ? 'Vlog 高光 · 已完成' : 'Vlog 高光 · 未完成',
                valueText: RUN.state === 'error' ? '失败' : `${Math.round(RUN.pct)}%`,
                tone: RUN.state === 'error' ? 'err' : RUN.state === 'done' ? 'ok' : '',
                indeterminate: RUN.state === 'running' && RUN.pct <= 3,
              }),
              RUN.msg ? ui.text(RUN.msg, { tone: RUN.state === 'error' ? null : 'muted', class: RUN.state === 'error' ? 'pk-text--err' : '' }) : null,
            ],
            { gap: 6 },
          )
        : null,
      mine && RUN.state === 'done'
        ? ui.row([ui.btn('去分步精修', () => PK.open('studio', { step: 'scenes' }), { size: 'sm', icon: 'film' }), RUN.result && RUN.result.outputPath ? ui.btn('去交付预览 / 下载', () => PK.open('delivery'), { size: 'sm', icon: 'download', kind: 'primary' }) : null], { wrap: true })
        : null,
    )
  }

  PK.panel('highlightReel', {
    title: 'AI 剪辑 · Vlog 高光',
    en: 'AI EDIT · HIGHLIGHTS',
    idx: 'HL',
    icon: 'film',
    kind: 'modal',
    size: 'lg',
    group: 'tools',
    order: 13,
    desc: '把一堆随手拍的视频，按音乐节拍自动剪成精彩短片',
    needsProject: true,
    aliases: { highlight: {}, vlog: {} },
    watch: (s) => s && s.project && s.project.dir,
    onWatch: (ctx) => {
      if (!PK.hasProject()) {
        ctx.close()
        return
      }
      ctx.local.data = null
      loadState(ctx, { quiet: true })
    },
    mount(ctx) {
      const L = ctx.local
      L.form = L.form || { targetSec: 0, order: 'story', aspect: 'auto', title: '', musicAssetId: undefined }
      loadState(ctx, { quiet: true })
    },
    render(ctx) {
      const L = ctx.local
      ctx.foot([ui.hint('全部在本机完成：镜头分析 + 节拍分析 + 剪辑，不上传、不调用大模型、不花钱。'), ui.spacer(), ui.btn('任务中心', () => PK.open('tasks'), { kind: 'ghost', icon: 'tasks' })])
      if (!L.data && !L.err) return [ui.loading('正在读取素材库…')]
      if (L.err && !L.data) return [ui.errorBox(L.err, () => loadState(ctx))]
      return [librarySection(ctx), settingsSection(ctx), runSection(ctx)]
    },
  })
})()
