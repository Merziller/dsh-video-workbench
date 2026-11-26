/* ============================================================================================================
 * PK · 模板填空 (templateFill panel) — 可填空模板: use a plaza template like a video-template app. Its shots, timing,
 * layouts, transitions and sound design stay; the user swaps in their own words, pictures / clips and music.
 *   1. choose a template (when opened without one) — opened from 影核广场 with { templateId }
 *   2. the whole film: title, music (a library song or a track generated at the template's tempo), banner character,
 *      and an optional topic for 「AI 按主题写文字」 (the configured model fills the empty text blanks, user reviews)
 *   3. shot by shot (pages of 8): title, the spoken / subtitle line, key words, the history stage's big words, a
 *      window title, the picture places (auto-pick from the library / a chosen item / the template's animation)
 *   4. 生成工程 (then 分步精修) or 一键出片 (fill → 一键配音 when the template speaks → render)
 * An empty blank keeps the template's text (shown as the placeholder); a shot with new words gets all of its on-screen
 * words from them. Routes (routes-talk.js): GET plaza/slots · POST plaza/fill · POST plaza/fill-suggest.
 * ============================================================================================================ */
;(function () {
  'use strict'
  const PK = window.PK
  if (!PK || typeof PK.panel !== 'function') return
  const U = PK.util
  const ui = PK.ui
  const h = PK.h

  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const PAGE = 8
  const fmtSec = (s) => {
    const v = Math.max(0, Math.round(Number(s) || 0))
    return v >= 60 ? `${Math.floor(v / 60)} 分 ${String(v % 60).padStart(2, '0')} 秒` : `${v} 秒`
  }
  const sec1 = (s) => `${(Math.round((Number(s) || 0) * 10) / 10).toFixed(1)} 秒`

  // one fill / suggestion / production per project at a time; progress survives closing / reopening the panel
  const RUN = { dir: '', state: '', kind: '', pct: 0, msg: '', startedAt: 0, result: null }

  const allSlots = (d) => (d ? [...(d.filmSlots || []), ...(d.scenes || []).flatMap((sc) => sc.slots || [])] : [])
  const isPicture = (slot) => slot.kind !== 'text' && slot.kind !== 'music'

  function defaultMusic(d) {
    const songs = (d && d.library && d.library.music) || []
    return songs.length ? songs[0].id : 'generate'
  }

  async function loadTemplates(ctx) {
    const L = ctx.local
    try {
      const d = await PK.get('plaza/templates', { category: 'all', q: '' }, { timeout: 60000 })
      L.templates = ((d && d.templates) || []).filter((t) => U.num(t.shotCount, 0) > 0)
      L.listErr = null
    } catch (err) {
      L.listErr = err
    }
    ctx.update()
  }

  async function load(ctx, { quiet = false } = {}) {
    const L = ctx.local
    const id = S(L.templateId)
    if (!id) return
    try {
      const d = await PK.get('plaza/slots', { id, projectDir: PK.hasProject() ? PK.dir() : '' }, { timeout: 60000 })
      L.data = d
      L.err = null
      if (L.formFor !== id) {
        // the last fills of this template in this project come back for another round
        const last = d && d.last
        L.form = { ...((last && last.fills) || {}) }
        L.topic = S(last && last.topic)
        L.autoFill = last ? last.autoFillMedia !== false : true
        L.formFor = id
        L.page = 0
        L.dirty = false
      }
      if (L.form['film.music'] === undefined || (L.form['film.music'] !== 'generate' && !(((d.library && d.library.music) || []).some((m) => m.id === L.form['film.music'])))) L.form['film.music'] = defaultMusic(d)
    } catch (err) {
      L.err = err
      if (!quiet) PK.reportError(err)
    }
    ctx.update()
  }

  function setField(ctx, id, value) {
    const L = ctx.local
    L.form[id] = value
    L.dirty = true
  }

  function counts(L) {
    const slots = allSlots(L.data)
    const texts = slots.filter((s) => s.kind === 'text')
    const pics = slots.filter((s) => isPicture(s) && s.required)
    const extra = slots.filter((s) => isPicture(s) && !s.required)
    const has = (s) => S(L.form[s.id]).trim() !== ''
    return {
      texts: texts.length,
      textsFilled: texts.filter(has).length,
      pics: pics.length,
      picsChosen: pics.filter(has).length,
      extraChosen: extra.filter(has).length,
      shotsTouched: ((L.data && L.data.scenes) || []).filter((sc) => (sc.slots || []).some((s) => s.kind === 'text' && has(s))).length,
    }
  }

  async function runJob(ctx, kind, label, start) {
    RUN.dir = PK.dir()
    RUN.state = 'running'
    RUN.kind = kind
    RUN.pct = 2
    RUN.msg = '正在提交…'
    RUN.startedAt = Date.now()
    ctx.update()
    const tick = setInterval(() => ctx.update(), 1000)
    try {
      const init = await start()
      const jobId = init && (init.jobId || (init.job && init.job.id))
      if (!jobId) throw new PK.Error(S(init && (init.error || init.message)) || `${label}没有启动，请重试`)
      const res = await PK.job(jobId, {
        interval: 1000,
        maxMs: 3 * 3600 * 1000,
        onProgress: (job) => {
          if (S(job && job.message).trim()) RUN.msg = S(job.message).trim()
          const p = U.num(job && job.progress, RUN.pct)
          if (p > 0) RUN.pct = U.clamp(p, 0, 100)
        },
      })
      return res
    } finally {
      clearInterval(tick)
    }
  }

  async function suggest(ctx) {
    const L = ctx.local
    const topic = S(L.topic).trim()
    if (!topic) {
      PK.toast('先在上面写一句话：这条视频讲什么', 'info')
      return
    }
    const c = counts(L)
    const ok = await PK.confirm({
      title: '请 AI 按模板写文字？',
      text: `会调用你在「模型设置」里配置的大模型（按模型价格计费，长模板会分几次写），按模板每一镜的作用和长短，为「${topic.slice(0, 40)}」写好全部文字（共 ${c.texts} 处）。写好后只填进还空着的格子里，你填过的不会被改；看过、改好之后再点「生成工程」。`,
      ok: '让 AI 写',
    })
    if (!ok) return
    try {
      const res = await runJob(ctx, 'suggest', 'AI 写文字', () => PK.postP('plaza/fill-suggest', { templateId: L.templateId, topic }, { timeout: 60000 }))
      const fills = (res && res.fills) || {}
      let n = 0
      for (const [k, v] of Object.entries(fills)) {
        if (S(L.form[k]).trim()) continue
        L.form[k] = S(v)
        n++
      }
      L.dirty = true
      RUN.state = 'done'
      RUN.pct = 100
      RUN.msg = `AI 写好了 ${n} 处文字，已经填进空格里${n < U.num(res && res.filled, n) ? '（你填过的没动）' : ''}。请检查一遍，再点「生成工程」。`
      PK.toast(RUN.msg, 'success', { timeout: 8000 })
    } catch (err) {
      RUN.state = 'error'
      RUN.msg = S(err && err.message) || 'AI 没有写完'
      PK.reportError(err, 'AI 写文字没有完成')
    } finally {
      ctx.update()
    }
  }

  function cleanedFills(L) {
    const out = {}
    for (const s of allSlots(L.data)) {
      const v = S(L.form[s.id]).trim()
      if (v) out[s.id] = v
    }
    return out
  }

  async function generate(ctx, produce) {
    const L = ctx.local
    const d = L.data
    if (!d || RUN.state === 'running') return
    const t = d.template || {}
    const cur = PK.state && PK.state.project && PK.state.project.sceneCount
    const ok = await PK.confirm({
      title: produce ? '套用模板并一键出片？' : '套用模板生成工程？',
      text: `会用模板「${S(t.name)}」的 ${U.num(t.shotCount, 0)} 个镜头（${t.aspectRatio || ''}）替换当前工程的分镜${cur ? `（现在有 ${cur} 个）` : ''}，风格、配色和节奏跟模板一样；生成前会自动存一个版本，随时可以在「版本历史」里找回。${produce ? (t.narrationMode === 'subtitle-mv' ? '然后直接渲染成片。' : '然后用你的配音引擎给每一镜配音，再渲染成片。') : ''}`,
      ok: produce ? '套用并出片' : '套用模板',
      danger: true,
    })
    if (!ok) return
    try {
      const res = await runJob(ctx, 'fill', '套用模板', () => PK.postP('plaza/fill', { templateId: L.templateId, fills: cleanedFills(L), autoFillMedia: L.autoFill !== false, topic: S(L.topic).trim() }, { timeout: 60000 }))
      RUN.result = res
      L.dirty = false
      if (produce) {
        if (res && res.needsVoice) {
          RUN.msg = '正在给每一镜配音…'
          await runJob(ctx, 'voice', '配音', () => PK.postP('action', { action: 'tts-all', async: true }, { timeout: 60000 }))
        }
        RUN.msg = '正在渲染成片…'
        RUN.result = { ...res, rendered: await runJob(ctx, 'render', '渲染', () => PK.postP('action', { action: 'render', async: true, engine: res && res.engine }, { timeout: 60000 })) }
      }
      RUN.state = 'done'
      RUN.pct = 100
      RUN.msg = summaryLine(res, produce)
      PK.toast(produce ? '模板成片已生成，可以在「交付」里预览和下载' : '模板已套用：去「分步精修」看看每个镜头', 'success')
      try {
        await PK.action('refresh', {}, { timeout: 60000 })
      } catch {}
      PK.store.invalidate()
      await load(ctx, { quiet: true })
    } catch (err) {
      RUN.state = 'error'
      RUN.msg = S(err && err.message) || '没有完成'
      const msg = S(err && err.message) || '没有完成'
      if (RUN.kind === 'voice') PK.toast(`配音没有完成：${msg}`, 'error', { action: { label: '去配音引擎设置', onClick: () => PK.open('keys', { tab: 'tts' }) }, timeout: 12000 })
      else PK.reportError(err, produce ? '模板出片没有完成' : '套用模板没有完成')
    } finally {
      ctx.update()
    }
  }

  function summaryLine(res, produce) {
    if (!res) return '已完成'
    const bits = [`${U.num(res.scenes, 0)} 个镜头 · ${fmtSec(res.durationSec)}`]
    if (U.num(res.changedShots, 0)) bits.push(`${res.changedShots} 镜换成了你的文字`)
    const pics = U.num(res.filledMedia, 0) + U.num(res.autoFilledMedia, 0)
    if (pics) bits.push(`放进 ${pics} 处画面${U.num(res.autoFilledMedia, 0) ? `（自动挑了 ${res.autoFilledMedia} 处）` : ''}`)
    if (U.num(res.emptyMedia, 0)) bits.push(`${res.emptyMedia} 处画面位没有素材，改成了文字动画`)
    const musicFrom = U.num(res.music && res.music.startSec, 0)
    const fromLine = musicFrom > 0 ? `（从 ${Math.floor(Math.round(musicFrom) / 60)}:${String(Math.round(musicFrom) % 60).padStart(2, '0')} 开始）` : ''
    bits.push(res.music && res.music.generated ? `配乐按模板节奏自动生成（${res.music.bpm} BPM）` : `配乐：${S(res.music && res.music.name)}${fromLine}`)
    if (!produce && res.needsVoice) bits.push('下一步：一键配音，再渲染')
    return `已套用：${bits.join(' · ')}`
  }

  /* ---------------- views ---------------- */

  function chooserView(ctx) {
    const L = ctx.local
    if (L.listErr) return [ui.errorBox(L.listErr, () => loadTemplates(ctx))]
    if (!L.templates) return [ui.loading('正在读取影核广场的模板…')]
    if (!L.templates.length) return [ui.empty({ icon: 'layers', title: '影核广场里还没有带分镜的模板', text: '刷新在线模板，或者把自己的作品发布成模板后再来填空。', actions: [ui.btn('去影核广场', () => PK.open('plaza'), { size: 'sm', icon: 'hub' })] })]
    return [
      ui.section(
        { title: '选一个模板', en: 'CHOOSE A TEMPLATE', icon: 'layers', desc: '选好后可以把模板里的文字、图片、视频和配乐换成你自己的，镜头节奏、版式、转场和音效都保持模板原样。' },
        ui.grid(
          L.templates.map((t) =>
            ui.card({
              key: `tf-pick-${t.id}`,
              media: t.coverUrl || t.coverFile ? h('img', { src: PK.routeUrl('plaza/cover', { id: t.id }), alt: '', loading: 'lazy', draggable: 'false' }) : null,
              aspect: '16 / 9',
              title: t.name || t.id,
              sub: `${U.num(t.shotCount, 0)} 镜 · ${t.aspectRatio || ''}${t.durationSec ? ` · 约 ${fmtSec(t.durationSec)}` : ''}`,
              actions: [
                ui.btn('用这个模板', () => {
                  L.templateId = t.id
                  L.data = null
                  L.err = null
                  load(ctx)
                  ctx.update()
                }, { kind: 'primary', size: 'sm', icon: 'wand' }),
              ],
            }),
          ),
          { min: 240 },
        ),
      ),
    ]
  }

  function headSection(ctx) {
    const L = ctx.local
    const d = L.data
    const t = d.template || {}
    const c = counts(L)
    const speaks = t.narrationMode !== 'subtitle-mv'
    return ui.section(
      {
        title: S(t.name),
        en: 'TEMPLATE',
        icon: 'layers',
        actions: [ui.btn('换模板', () => ((L.templateId = ''), (L.data = null), (L.formFor = ''), loadTemplates(ctx)), { size: 'sm', kind: 'ghost', icon: 'grid', disabled: RUN.state === 'running' })],
      },
      ui.row(
        [
          ui.pill(`${U.num(t.shotCount, 0)} 个镜头`, 'acc'),
          ui.pill(`约 ${fmtSec(t.durationSec)}`, 'mute'),
          ui.pill(t.aspectRatio === '9:16' ? '竖屏 9:16' : t.aspectRatio === '1:1' ? '方形 1:1' : `横屏 ${t.aspectRatio || '16:9'}`, 'mute'),
          ui.pill(speaks ? '有配音旁白' : '纯音乐卡点（文字显示在画面上）', 'mute'),
          t.bpm ? ui.pill(`${t.bpm} BPM`, 'mute') : null,
        ],
        { wrap: true },
      ),
      ui.hint(
        `空着的格子保留模板原来的文字（灰色提示就是原文）。只要改了某一镜的文字，这一镜画面上的标题、重点词、大字也会跟着换成你的，不会和模板原文混在一起。${U.num(d.counts && d.counts.media, 0) ? '画面位可以选你素材库里的图片或视频，不选就自动挑。' : '这个模板以动画为主，每一镜也可以换成你自己的画面。'}`,
      ),
      ui.row(
        [
          ui.pill(`文字 ${c.textsFilled}/${c.texts}`, c.textsFilled ? 'ok' : 'mute'),
          c.pics ? ui.pill(`画面 ${c.picsChosen}/${c.pics}${L.autoFill !== false && c.picsChosen < c.pics ? '（其余自动挑）' : ''}`, c.picsChosen ? 'ok' : 'mute') : null,
          c.extraChosen ? ui.pill(`另有 ${c.extraChosen} 镜换成你的画面`, 'ok') : null,
          c.shotsTouched ? ui.pill(`${c.shotsTouched} 镜换了文字`, 'ok') : null,
        ],
        { wrap: true },
      ),
    )
  }

  function filmSection(ctx) {
    const L = ctx.local
    const d = L.data
    const busy = RUN.state === 'running'
    const songs = (d.library && d.library.music) || []
    const film = d.filmSlots || []
    const slot = (id) => film.find((s) => s.id === id)
    const titleSlot = slot('film.title')
    const bannerSlot = slot('film.bannerChar')
    const musicOptions = [...songs.map((m) => ({ value: m.id, label: `🎵 ${S(m.name)}${m.durationSec ? `（${fmtSec(m.durationSec)}）` : ''}` })), { value: 'generate', label: `按模板节奏自动生成${d.template && d.template.bpm ? `（${d.template.bpm} BPM）` : ''}` }]
    return ui.section(
      { title: '整条片子', en: 'THE FILM', icon: 'film' },
      ui.grid(
        [
          titleSlot ? ui.field({ label: '片名', en: 'TITLE', hint: '不填就用模板的片名' }, ui.input({ key: 'tf-film-title', value: S(L.form['film.title']), maxLength: titleSlot.maxLength, placeholder: S(titleSlot.example), disabled: busy, onInput: (v) => setField(ctx, 'film.title', v), onChange: () => ctx.update() })) : null,
          ui.field(
            { label: '配乐', en: 'MUSIC', hint: songs.length ? '镜头会按这首歌的节拍重新卡点' : '素材库里没有音乐：按模板的节奏自动生成一段（也可以先在「素材」里上传你的歌）' },
            ui.select({ value: S(L.form['film.music']), options: musicOptions, disabled: busy, onChange: (v) => (setField(ctx, 'film.music', v), ctx.update()) }),
          ),
          bannerSlot
            ? ui.field({ label: '旗帜上的字', en: 'BANNER', hint: '一个字，如 汉、宋、唐；不填会按你写的人物自动判断' }, ui.input({ key: 'tf-film-banner', value: S(L.form['film.bannerChar']), maxLength: 2, placeholder: S(bannerSlot.example), disabled: busy, onInput: (v) => setField(ctx, 'film.bannerChar', v), onChange: () => ctx.update() }))
            : null,
        ],
        { min: 220, fit: true },
      ),
      ui.field(
        { label: '这条视频讲什么', en: 'TOPIC', hint: '一句话就行，例如「岳飞的一生」「我们新出的记账 App」。点右边的按钮，AI 会按模板每一镜的作用帮你写好全部文字（要调用你配置的大模型，会产生费用）；也可以不用 AI，自己在下面逐镜填。' },
        ui.row(
          [
            ui.input({ key: 'tf-topic', value: S(L.topic), maxLength: 200, placeholder: '这条视频讲什么（可不填）', disabled: busy, onInput: (v) => ((L.topic = v), (L.dirty = true)), onChange: () => ctx.update() }),
            ui.btn('AI 按主题写文字', () => suggest(ctx), { icon: 'sparkle', disabled: busy || !S(L.topic).trim(), busyText: 'AI 写作中…', title: '用你配置的大模型，按模板每一镜写新文字（只填空着的格子）' }),
          ],
          { wrap: false },
        ),
      ),
    )
  }

  function textField(ctx, slot) {
    const L = ctx.local
    const busy = RUN.state === 'running'
    const short = S(slot.label).replace(/（.*?）/g, '')
    const common = {
      key: `tf-${slot.id}`,
      value: S(L.form[slot.id]),
      maxLength: slot.maxLength,
      placeholder: S(slot.example) || '（模板这里是空的）',
      disabled: busy,
      onInput: (v) => setField(ctx, slot.id, v),
      onChange: () => ctx.update(),
    }
    return ui.field(
      { label: short, aside: slot.suggestChars ? `模板 ${slot.suggestChars} 字` : slot.list ? '用、分隔' : null, wide: Boolean(slot.multiline) },
      slot.multiline ? ui.textarea({ ...common, rows: 2, minRows: 1, maxRows: 6, counter: true }) : ui.input(common),
    )
  }

  function pictureField(ctx, slot) {
    const L = ctx.local
    const d = L.data
    const busy = RUN.state === 'running'
    const lib = (d.library && d.library.visuals) || []
    const items = lib.filter((v) => slot.kind === 'visual' || v.type === slot.kind)
    const empty = slot.required ? (L.autoFill !== false ? (items.length ? '自动挑选（素材库里的）' : '素材库里没有，改成文字动画') : '空着（改成文字动画）') : '用模板动画（不放我的画面）'
    const options = [{ value: '', label: empty }, ...items.map((v) => ({ value: v.id, label: `${v.type === 'video' ? '🎬' : '🖼'} ${S(v.name)}${v.type === 'video' && v.durationSec ? `（${fmtSec(v.durationSec)}）` : ''}` }))]
    const cur = S(L.form[slot.id])
    const asset = items.find((v) => v.id === cur)
    const thumbRel = asset ? (asset.type === 'image' ? asset.thumb || asset.path : asset.thumb) : ''
    return ui.field(
      { label: S(slot.label), aside: slot.durationSec ? `这一镜 ${sec1(slot.durationSec)}` : null, wide: true },
      ui.row(
        [
          thumbRel ? h('img.pk-tf-thumb', { src: PK.assetUrl(thumbRel), alt: '', loading: 'lazy', draggable: 'false' }) : null,
          ui.select({ value: cur, options, disabled: busy || !items.length, onChange: (v) => (setField(ctx, slot.id, v), ctx.update()) }),
        ],
        { wrap: false },
      ),
    )
  }

  function shotCard(ctx, sc) {
    const L = ctx.local
    const texts = (sc.slots || []).filter((s) => s.kind === 'text')
    const pics = (sc.slots || []).filter(isPicture)
    const changed = (sc.slots || []).some((s) => S(L.form[s.id]).trim())
    return h(
      'div.pk-tf-shot',
      { key: `tf-shot-${sc.index}`, class: { 'is-changed': changed } },
      h('div.pk-tf-shot-h', null, h('b', null, `第 ${sc.index} 镜`), h('span', null, sec1(sc.durationSec)), sc.stage ? ui.pill('历史动画', 'mute') : null, changed ? ui.pill('已改', 'ok') : null),
      ui.grid(texts.map((s) => textField(ctx, s)), { min: 220, fit: true }),
      ...pics.map((s) => pictureField(ctx, s)),
    )
  }

  function shotsSection(ctx) {
    const L = ctx.local
    const scenes = (L.data && L.data.scenes) || []
    const pages = Math.max(1, Math.ceil(scenes.length / PAGE))
    const page = U.clamp(U.num(L.page, 0), 0, pages - 1)
    const from = page * PAGE
    const list = scenes.slice(from, from + PAGE)
    const go = (p) => {
      L.page = U.clamp(p, 0, pages - 1)
      ctx.update()
      try {
        ctx.frame.body.scrollTop = 0
      } catch {}
    }
    const pager =
      pages > 1
        ? ui.row(
            [
              ui.btn('上一页', () => go(page - 1), { size: 'sm', icon: 'chevL', disabled: page === 0 }),
              ui.hint(`第 ${from + 1}–${Math.min(scenes.length, from + PAGE)} 镜 / 共 ${scenes.length} 镜`),
              ui.btn('下一页', () => go(page + 1), { size: 'sm', icon: 'chevR', disabled: page >= pages - 1 }),
            ],
            { wrap: true, center: true },
          )
        : null
    return ui.section(
      { title: '逐镜填空', en: 'SHOT BY SHOT', icon: 'film', count: scenes.length, desc: '灰色提示是模板原文；不填就保留原文。旁白 / 字幕尽量和模板原文差不多长，镜头时长才合适。' },
      pager,
      ui.stack(list.map((sc) => shotCard(ctx, sc)), { gap: 10 }),
      pager,
    )
  }

  function runSection(ctx) {
    const L = ctx.local
    const d = L.data
    const busy = RUN.state === 'running'
    const mine = RUN.dir === PK.dir()
    const t = d.template || {}
    const c = counts(L)
    const elapsed = RUN.startedAt ? U.fmtDur((Date.now() - RUN.startedAt) / 1000) : ''
    const noPictures = c.pics > 0 && !((d.library && d.library.visuals) || []).length
    return ui.section(
      { title: '生成', en: 'BUILD · PRODUCE', icon: 'bolt', desc: '套用和换素材都在本机完成，不调用大模型、不花钱。' },
      c.pics
        ? ui.toggle({
            value: L.autoFill !== false,
            label: '空着的画面位自动用素材库的素材',
            hint: '优先用没用过的图片 / 视频；素材比画面位少时会轮流用，同一段视频每次用不同的片段。关掉后，空着的画面位改成文字动画。',
            disabled: busy,
            onChange: (v) => ((L.autoFill = v), ctx.update()),
          })
        : null,
      noPictures ? ui.note(`这个模板有 ${c.pics} 个画面位，你的素材库里还没有图片或视频：不放素材也能生成（这些镜头改成文字动画），想要模板原样的效果，先去「素材」上传图片或视频。`, { level: 'warn', actions: [ui.btn('去上传素材', () => PK.open('studio', { step: 'assets' }), { size: 'sm', icon: 'upload' })] }) : null,
      ui.grid(
        [
          ui.stack(
            [
              ui.btn('一键出片', () => generate(ctx, true), { kind: 'primary', size: 'lg', block: true, icon: 'bolt', disabled: busy, busyText: '出片中…' }),
              ui.hint(t.narrationMode === 'subtitle-mv' ? '套用模板 → 按音乐卡点 → 渲染 MP4' : '套用模板 → 一键配音 → 渲染 MP4（配音用你在「配音引擎」里选的引擎）'),
            ],
            { gap: 4 },
          ),
          ui.stack([ui.btn('只生成工程（先看看）', () => generate(ctx, false), { block: true, icon: 'layers', disabled: busy, busyText: '生成中…' }), ui.hint('生成后可以去「分步精修」逐镜查看、修改，再配音出片。')], { gap: 4 }),
        ],
        { min: 240, fit: true },
      ),
      mine && RUN.state
        ? ui.stack(
            [
              ui.meter(RUN.state === 'error' ? 100 : RUN.pct, {
                label: RUN.state === 'running' ? `${RUN.kind === 'suggest' ? 'AI 写文字' : RUN.kind === 'voice' ? '配音' : RUN.kind === 'render' ? '渲染' : '套用模板'} · 进行中 · 已用 ${elapsed}` : RUN.state === 'done' ? '已完成' : '没有完成',
                valueText: RUN.state === 'error' ? '失败' : `${Math.round(RUN.pct)}%`,
                tone: RUN.state === 'error' ? 'err' : RUN.state === 'done' ? 'ok' : '',
                indeterminate: RUN.state === 'running' && RUN.pct <= 3,
              }),
              RUN.msg ? ui.text(RUN.msg, { tone: RUN.state === 'error' ? null : 'muted', class: RUN.state === 'error' ? 'pk-text--err' : '' }) : null,
            ],
            { gap: 6 },
          )
        : null,
      mine && RUN.state === 'done' && RUN.kind !== 'suggest'
        ? ui.row(
            [
              ui.btn('去分步精修', () => PK.open('studio', { step: 'scenes' }), { size: 'sm', icon: 'film' }),
              RUN.result && RUN.result.rendered ? ui.btn('去交付预览 / 下载', () => PK.open('delivery'), { size: 'sm', icon: 'download', kind: 'primary' }) : null,
            ],
            { wrap: true },
          )
        : null,
    )
  }

  PK.panel('templateFill', {
    title: '模板填空',
    en: 'TEMPLATE · FILL IN',
    idx: 'TF',
    icon: 'layers',
    kind: 'modal',
    size: 'lg',
    group: 'tools',
    order: 14,
    desc: '套用影核广场的模板，把文字、图片、视频和配乐换成你自己的',
    needsProject: true,
    aliases: { 'template-fill': {}, fillTemplate: {} },
    watch: (s) => s && s.project && s.project.dir,
    onWatch: (ctx) => {
      if (!PK.hasProject()) {
        ctx.close()
        return
      }
      ctx.local.formFor = ''
      ctx.local.data = null
      load(ctx, { quiet: true })
    },
    onArgs: (ctx, a) => {
      const L = ctx.local
      const next = S(a && a.templateId)
      if (!next || next === L.templateId) {
        ctx.render()
        return
      }
      const switchTo = () => {
        L.templateId = next
        L.data = null
        L.err = null
        L.formFor = ''
        L.dirty = false
        load(ctx)
        ctx.render()
      }
      if (!L.dirty) return switchTo()
      PK.confirm({ title: '换一个模板？', text: '这里还有没生成的填写内容，换模板后会清空。', ok: '换模板', cancel: '继续填这个', danger: true }).then((ok) => ok && switchTo())
    },
    beforeClose: (ctx) => {
      const L = ctx.local
      if (L.asking) return false
      if (!L.dirty || RUN.state === 'running') return true
      L.asking = true
      PK.confirm({ title: '关闭模板填空？', text: '填写的内容还没有生成工程，关闭后不会保存。', ok: '关闭', cancel: '继续填写', danger: true }).then((ok) => {
        L.asking = false
        if (!ok) return
        L.dirty = false
        ctx.frame.close('force')
      })
      return false
    },
    mount(ctx) {
      const L = ctx.local
      L.templateId = S(ctx.args && ctx.args.templateId)
      L.form = L.form || {}
      if (L.templateId) load(ctx, { quiet: true })
      else loadTemplates(ctx)
    },
    render(ctx) {
      const L = ctx.local
      ctx.foot([ui.hint('文字和素材都只在本机处理；只有点「AI 按主题写文字」时才会调用你配置的大模型。'), ui.spacer(), ui.btn('影核广场', () => PK.open('plaza'), { kind: 'ghost', icon: 'hub' })])
      if (!L.templateId) return chooserView(ctx)
      if (!L.data && !L.err) return [ui.loading('正在读取模板的分镜…')]
      if (L.err && !L.data) return [ui.errorBox(L.err, () => load(ctx))]
      return [headSection(ctx), filmSection(ctx), shotsSection(ctx), runSection(ctx)]
    },
  })
})()
