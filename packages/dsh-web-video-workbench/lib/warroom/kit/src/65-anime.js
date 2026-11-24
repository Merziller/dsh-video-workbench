/**
 * 「我的动漫形象」 (panel `animeChars`): the reusable anime presenter library.
 *  - make a character once: from the user's photo (drawn as an anime likeness by the user's own cloud image service or
 *    by the optional local model) or from a cartoon picture the user already has
 *  - check where its mouth and eyes are (click to move them) and watch the mouth shapes / blink it will use
 *  - see the three ways it can move (free / local model / cloud) and install / configure them
 * Routes: anime/* (lib/routes-anime.js). Paid steps always ask first (PK.confirm with the estimate).
 */
;(function () {
  'use strict'
  const PK = window.PK
  const U = PK.util
  const h = PK.h
  const ui = PK.ui
  const S = (v) => (v === undefined || v === null ? '' : String(v))
  const MARKS = [
    { key: 'mouth', label: '嘴巴' },
    { key: 'eye0', label: '左眼' },
    { key: 'eye1', label: '右眼' },
  ]
  const PREVIEW_SHAPES = ['closed', 'half', 'a', 'o', 'i', 'a', 'half', 'o', 'closed', 'i', 'half', 'closed']
  const fileUrl = (c, name) => (c && name ? PK.routeUrl('anime/file', { id: c.id, name, v: c.version || 1 }) : '')
  const yuan = (v) => `${(Math.round(Number(v || 0) * 100) / 100).toFixed(2)} 元`
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))

  /* -------------------------------------------------------------------------------------------- data */
  async function loadLib(ctx, { quiet = false } = {}) {
    const L = ctx.local
    try {
      L.lib = await PK.get('anime/characters')
      L.libErr = null
    } catch (err) {
      L.libErr = err
      if (!quiet) PK.toast(`读取形象库失败：${S(err && err.message)}`, 'error')
    }
    ctx.update()
  }

  function faceDraft(c) {
    const f = (c && c.face) || {}
    const eyes = Array.isArray(f.eyes) && f.eyes.length >= 2 ? f.eyes : [{ x: 0.42, y: 0.27, w: 0.08 }, { x: 0.58, y: 0.27, w: 0.08 }]
    const m = f.mouth || { x: 0.5, y: 0.36, w: 0.1 }
    const pick = (o) => ({ x: Number(o.x) || 0.5, y: Number(o.y) || 0.5, w: Number(o.w) || 0.08, ...(Number(o.h) > 0 ? { h: Number(o.h) } : {}) })
    return { mouth: pick(m), eye0: pick(eyes[0]), eye1: pick(eyes[1]), mouthOriginal: f.mouthOriginal === 'open' ? 'open' : 'closed' }
  }

  async function openEditor(ctx, id) {
    const L = ctx.local
    L.editId = id
    L.edit = null
    L.preview = false
    ctx.update()
    try {
      const r = await PK.get('anime/character', { id })
      L.edit = { character: r.character, face: faceDraft(r.character), sel: 'mouth', dirty: false }
    } catch (err) {
      L.editId = ''
      PK.toast(`打开形象失败：${S(err && err.message)}`, 'error')
    }
    ctx.update()
  }

  async function saveFace(ctx) {
    const L = ctx.local
    const e = L.edit
    if (!e) return
    const f = e.face
    const r = await PK.post('anime/update', { id: e.character.id, face: { mouth: f.mouth, eyes: [f.eye0, f.eye1], mouthOriginal: f.mouthOriginal } })
    L.edit = { ...e, character: r.character, face: faceDraft(r.character), dirty: false }
    PK.toast('位置已保存，嘴型和闭眼图已按新位置重画', 'success')
    await loadLib(ctx, { quiet: true })
  }

  async function renameCharacter(ctx, c) {
    const name = await PK.prompt({ title: '给形象改个名字', label: '名字（24 个字以内）', value: S(c.name) })
    if (name === null || name === undefined) return
    const v = String(name).trim()
    if (!v) return
    await PK.post('anime/update', { id: c.id, name: v.slice(0, 24) })
    await loadLib(ctx, { quiet: true })
    if (ctx.local.edit && ctx.local.edit.character.id === c.id) await openEditor(ctx, c.id)
  }

  async function removeCharacter(ctx, c) {
    const ok = await PK.confirm({ title: `删除「${S(c.name)}」？`, text: '形象会移到形象库的回收文件夹里（.trash），已经做好的视频不受影响。', ok: '删除', danger: true })
    if (!ok) return
    await PK.post('anime/delete', { id: c.id })
    if (ctx.local.editId === c.id) {
      ctx.local.editId = ''
      ctx.local.edit = null
    }
    PK.toast('已删除', 'success')
    await loadLib(ctx, { quiet: true })
  }

  /** The cloud likeness costs money: always ask first, with the estimate of the configured service. */
  async function confirmCloudStylize(lib) {
    const st = (lib && lib.stylize) || {}
    if (!st.supported) {
      PK.toast(S(st.reason) || '云端生图服务还不能用', 'error', { action: { label: '去设置云端生图', onClick: () => PK.open('cloud') } })
      return false
    }
    return PK.confirm({
      title: '用云端生成动漫形象？',
      text: `会用你配置的云端生图服务生成 1 张图：大约 ${yuan(st.rmbLow)}～${yuan(st.rmbHigh)}（${S(st.note)}）。以服务商账单为准；同一张照片、同样的要求重试不会重复收费。`,
      ok: '确认生成',
    })
  }

  async function createFromForm(ctx) {
    const L = ctx.local
    const f = L.form
    const kind = f.kind
    const stylize = kind === 'cartoon' ? 'none' : f.stylize
    if (!f.file && !f.assetPath) throw new PK.Error('请先选一张图片')
    let confirmedCost = false
    if (stylize === 'cloud') {
      if (!(await confirmCloudStylize(L.lib))) return
      confirmedCost = true
    }
    if (stylize === 'local' && !localStylizeReady(L.lib)) throw new PK.Error('本地动漫化模型还没有安装：请先在下面「让形象动起来」里安装本地模型，或改用云端生成')
    const meta = { name: S(f.name).trim().slice(0, 24), kind, stylize, style: f.style || 'anime', extraPrompt: S(f.extra).slice(0, 200), confirmedCost: confirmedCost ? '1' : '' }
    let res
    if (f.file) res = await PK.upload('anime/upload', f.file, { query: { ...meta, fileName: f.file.name || 'photo.png' } })
    else res = await PK.post('anime/create', { ...meta, projectDir: PK.dir(), assetPath: f.assetPath, confirmedCost })
    L.creating = { jobId: res.jobId, message: '正在提交…', pct: 5 }
    ctx.update()
    try {
      const out = await PK.job(res.jobId, {
        onProgress: (job) => {
          L.creating = { jobId: res.jobId, message: S(job.message) || '生成中…', pct: U.num(job.progress, 5) }
          ctx.update()
        },
      })
      L.form = { ...L.form, file: null, assetPath: '', name: '', extra: '' }
      PK.toast('动漫形象做好了：请看一下嘴巴和眼睛的位置对不对', 'success')
      await loadLib(ctx, { quiet: true })
      if (out && out.character && out.character.id) await openEditor(ctx, out.character.id)
    } finally {
      L.creating = null
      ctx.update()
    }
  }

  async function rebuild(ctx, c, { restyle = false } = {}) {
    // list summaries carry the method as a string, full records as { method }
    const method = typeof c.stylize === 'string' ? c.stylize : c.stylize && c.stylize.method
    let confirmedCost = false
    if (method === 'cloud' && restyle) {
      if (!(await confirmCloudStylize(ctx.local.lib))) return
      confirmedCost = true
    }
    const res = await PK.post('anime/rebuild', { id: c.id, restyle, confirmedCost })
    ctx.local.creating = { jobId: res.jobId, message: '正在重新生成…', pct: 5 }
    ctx.update()
    try {
      await PK.job(res.jobId, {
        onProgress: (job) => {
          ctx.local.creating = { jobId: res.jobId, message: S(job.message) || '生成中…', pct: U.num(job.progress, 5) }
          ctx.update()
        },
      })
      PK.toast('已重新生成', 'success')
      await loadLib(ctx, { quiet: true })
      await openEditor(ctx, c.id)
    } finally {
      ctx.local.creating = null
      ctx.update()
    }
  }

  const engineOf = (lib, id) => ((lib && lib.engines) || []).find((e) => e.id === id) || null
  const localStylizeReady = (lib) => {
    const st = lib && lib.local
    if (!st) return false
    return Boolean((st.installed && st.installed.stylize) || (st.stylize && st.stylize.installed) || st.stylizeReady)
  }

  async function installLocal(ctx) {
    const L = ctx.local
    const ok = await PK.confirm({
      title: '安装本地动漫模型？',
      text: '会下载并安装「Talking Head Anime 3」（让动漫形象的脸和身体跟着声音动）和本地照片动漫化模型，需要几 GB 空间，下载可能要十几分钟。有 NVIDIA 显卡会快很多；没有也能用，但会很慢。安装完全免费。',
      ok: '开始安装',
    })
    if (!ok) return
    const res = await PK.post('anime/local/install', { installDir: S(L.localDir).trim(), mirror: L.localMirror === 'global' ? 'global' : 'cn' })
    L.installing = { message: '正在提交…', pct: 2 }
    ctx.update()
    try {
      await PK.job(res.jobId, {
        maxMs: 6 * 3600 * 1000,
        onProgress: (job) => {
          L.installing = { message: S(job.message) || '安装中…', pct: U.num(job.progress, 2) }
          ctx.update()
        },
      })
      PK.toast('本地动漫模型已安装', 'success')
    } finally {
      L.installing = null
      await loadLib(ctx, { quiet: true })
    }
  }

  /* -------------------------------------------------------------------------------------------- views */
  function libraryView(ctx) {
    const L = ctx.local
    const list = (L.lib && L.lib.characters) || []
    if (!list.length) {
      return ui.empty({ icon: 'user', title: '还没有动漫形象', text: '在下面用你的照片（或现成的卡通图）做一个，以后每条口播视频都能用它当讲解员。' })
    }
    return ui.grid(
      list.map((c) => {
        const ready = c.status === 'ready' && c.hasPortrait
        const eng = c.engines || {}
        const tags = [ready ? null : c.status === 'creating' ? '生成中' : '没有生成好']
          .concat(eng.sprite ? ['免费档可用'] : [])
          .concat(eng.tha3 ? ['显卡档可用'] : [])
          .concat(['vidu', 'volc', 'runway'].filter((k) => eng[k]).map((k) => `云端已建形象：${k === 'volc' ? '火山引擎' : k === 'runway' ? 'Runway' : 'Vidu'}`))
          .filter(Boolean)
        return ui.card({
          key: `an-${c.id}`,
          media: ready ? h('img.pk-an-thumb', { src: fileUrl(c, 'portrait.png'), alt: '', loading: 'lazy', draggable: 'false' }) : h('div.pk-an-thumb.pk-an-thumb--empty', null, PK.icon('user', 28)),
          aspect: '3 / 4',
          title: S(c.name) || '我的动漫形象',
          sub: c.error ? S(c.error) : `${c.source === 'photo' ? (c.stylize === 'cloud' ? '照片 · 云端动漫化' : '照片 · 本地动漫化') : '卡通图'}${c.faceChecked ? '' : ' · 嘴和眼睛的位置还没确认'}`,
          tags,
          active: L.editId === c.id,
          onClick: ready ? () => openEditor(ctx, c.id) : null,
          actions: [
            ready ? ui.btn('嘴和眼睛', () => openEditor(ctx, c.id), { size: 'sm', icon: 'target' }) : null,
            ui.iconBtn('edit', () => renameCharacter(ctx, c).catch((err) => PK.toast(S(err && err.message), 'error')), { title: '改名' }),
            !ready ? ui.btn('重试', () => rebuild(ctx, c).catch((err) => PK.toast(`没有完成：${S(err && err.message)}`, 'error')), { size: 'sm', icon: 'retry', title: '用已经画好的图（或原图）再试一次，不会再收费' }) : null,
            !ready && c.source === 'photo' && c.stylize !== 'none'
              ? ui.btn('重新画一张', () => rebuild(ctx, c, { restyle: true }).catch((err) => PK.toast(`没有完成：${S(err && err.message)}`, 'error')), { size: 'sm', kind: 'ghost', icon: 'wand', title: c.stylize === 'cloud' ? '会再收一张图的钱（生成前会先确认）' : '本地模型重新画，不花钱' })
              : null,
            ui.iconBtn('trash', () => removeCharacter(ctx, c).catch((err) => PK.toast(S(err && err.message), 'error')), { title: '删除' }),
          ].filter(Boolean),
        })
      }),
      { min: 180 },
    )
  }

  /** Click on the portrait to move the selected mark; markers show where the mouth / eyes are. */
  function faceEditor(ctx) {
    const L = ctx.local
    const e = L.edit
    if (!L.editId) return null
    if (!e) return ui.section({ title: '嘴巴和眼睛的位置', en: 'FACE MARKS', icon: 'target' }, ui.loading('正在打开…'))
    const c = e.character
    const f = e.face
    const W = U.num(c.width, 600)
    const H = U.num(c.height, 800)
    const markOf = (k) => f[k]
    const setMark = (k, patch) => {
      e.face = { ...f, [k]: { ...f[k], ...patch } }
      e.dirty = true
      ctx.update()
    }
    const boxes = (c.sprites && c.sprites.boxes) || {}
    const mouths = (c.sprites && c.sprites.mouths) || {}
    const pct = (v) => `${(clamp01(v) * 100).toFixed(2)}%`
    const pv = (L._pv = { mouth: null, blink: null })
    const preview = L.preview && !e.dirty
    const stage = h(
      'div.pk-an-face',
      {
        style: { aspectRatio: `${W} / ${H}` },
        title: preview ? '' : `点一下图片，把「${(MARKS.find((m) => m.key === e.sel) || MARKS[0]).label}」移到这里`,
        onClick: (ev) => {
          if (preview) return
          const r = ev.currentTarget.getBoundingClientRect()
          if (!r.width || !r.height) return
          setMark(e.sel, { x: Math.round(((ev.clientX - r.left) / r.width) * 1000) / 1000, y: Math.round(((ev.clientY - r.top) / r.height) * 1000) / 1000 })
        },
      },
      h('img.pk-an-face-img', { src: fileUrl(c, c.portrait || 'portrait.png'), alt: '', draggable: 'false' }),
      preview && boxes.mouth
        ? (pv.mouth = h('img.pk-an-pv', { src: mouths.half ? fileUrl(c, mouths.half) : '', alt: '', draggable: 'false', style: { left: pct(boxes.mouth.x), top: pct(boxes.mouth.y), width: pct(boxes.mouth.w), height: pct(boxes.mouth.h), visibility: 'hidden' } }))
        : null,
      preview && boxes.blink && c.sprites && c.sprites.blink
        ? (pv.blink = h('img.pk-an-pv', { src: fileUrl(c, c.sprites.blink), alt: '', draggable: 'false', style: { left: pct(boxes.blink.x), top: pct(boxes.blink.y), width: pct(boxes.blink.w), height: pct(boxes.blink.h), visibility: 'hidden' } }))
        : null,
      preview
        ? null
        : MARKS.map((m) => {
            const v = markOf(m.key)
            const wPx = clamp01(v.w)
            const hShare = Number(v.h) > 0 ? v.h : m.key === 'mouth' ? v.w * 0.55 * (W / H) : v.w * 1.1 * (W / H)
            return h(
              'span.pk-an-mark',
              {
                class: { 'is-sel': e.sel === m.key, 'is-mouth': m.key === 'mouth' },
                style: { left: pct(v.x), top: pct(v.y), width: pct(wPx), height: pct(hShare) },
                onClick: (ev) => {
                  ev.stopPropagation()
                  e.sel = m.key
                  ctx.update()
                },
              },
              h('b.pk-an-mark-l', null, m.label),
            )
          }),
    )
    const sel = markOf(e.sel)
    const controls = ui.stack(
      [
        ui.field(
          { label: '要调整哪个位置', en: 'MARK', hint: '选好后在左边图片上点一下，标记就会移过去。框要刚好盖住嘴 / 眼睛（含睫毛）。' },
          ui.seg({ value: e.sel, options: MARKS.map((m) => ({ value: m.key, label: m.label })), disabled: preview, onChange: (v) => ((e.sel = v), ctx.update()) }),
        ),
        ui.field(
          { label: '框的大小', en: 'SIZE' },
          ui.slider({ value: Math.round(clamp01(sel.w) * 1000) / 10, min: 2, max: 30, step: 0.5, format: (v) => `${v}%`, disabled: preview, onChange: (v) => setMark(e.sel, { w: Math.round(v * 10) / 1000, ...(e.sel !== 'mouth' && Number(sel.h) > 0 ? { h: Math.round(((sel.h * v) / (sel.w * 100)) * 1000) / 1000 } : {}) }) }),
        ),
        ui.toggle({
          value: f.mouthOriginal === 'open',
          label: '原图里嘴巴是张开的',
          hint: '打开后会多画一张「闭嘴」图，停顿时嘴会合上',
          onChange: (v) => {
            e.face = { ...f, mouthOriginal: v ? 'open' : 'closed' }
            e.dirty = true
            ctx.update()
          },
        }),
        ui.row(
          [
            ui.btn(e.dirty ? '保存位置并重画嘴型' : '位置已保存', () => saveFace(ctx), { kind: e.dirty ? 'primary' : 'ghost', icon: 'check', disabled: !e.dirty, busyText: '保存中…' }),
            ui.btn(preview ? '停止试看' : '试看嘴型和眨眼', () => {
              L.preview = !preview
              L.pvTick = 0
              ctx.update()
            }, { icon: preview ? 'stop' : 'play', disabled: e.dirty, title: e.dirty ? '先保存位置' : '' }),
          ],
          { wrap: true },
        ),
        e.dirty ? ui.hint('改了位置还没保存：保存后才会按新位置重画嘴型和闭眼图。') : null,
        c.source && c.source.kind === 'photo' && c.stylize && c.stylize.method !== 'none'
          ? ui.row([ui.btn('不满意，重新画一张', () => rebuild(ctx, c, { restyle: true }).catch((err) => PK.toast(`没有完成：${S(err && err.message)}`, 'error')), { size: 'sm', icon: 'retry', kind: 'ghost' }), ui.hint(c.stylize.method === 'cloud' ? '会再收一张图的钱（生成前会先确认）' : '本地模型重新画，不花钱')], { wrap: true })
          : null,
        ui.hint('试看用的是保存后的图：嘴型按 闭 → 半张 → 啊 → 哦 → 衣 轮流变化，每隔两三秒眨一次眼。真正出片时嘴型跟着你说的每个字变。'),
      ],
      { gap: 10 },
    )
    return ui.section(
      { title: `「${S(c.name)}」的嘴巴和眼睛`, en: 'FACE MARKS', icon: 'target', actions: [ui.btn('收起', () => ((L.editId = ''), (L.edit = null), (L.preview = false), ctx.update()), { size: 'sm', kind: 'ghost', icon: 'collapse' })] },
      c.face && c.face.detected === false && !c.face.checked ? ui.note('没能自动找到嘴巴和眼睛，现在是估计的位置：请在图上点一下，把三个框移到对的地方。', { level: 'warn' }) : null,
      ui.split(h('div.pk-an-face-wrap', null, stage), controls, { ratio: 0.48 }),
    )
  }

  function createSection(ctx) {
    const L = ctx.local
    const f = (L.form = L.form || { kind: 'photo', stylize: 'cloud', style: 'anime', name: '', extra: '', file: null, assetPath: '' })
    const lib = L.lib || {}
    const st = lib.stylize || {}
    const localOk = localStylizeReady(lib)
    const set = (patch) => {
      L.form = { ...L.form, ...patch }
      ctx.update()
    }
    const busy = Boolean(L.creating)
    const images = ((L.projectImages || []).length ? L.projectImages : []).map((it) => ({ value: it.path, label: `🖼 ${S(it.name)}` }))
    return ui.section(
      { title: '新建动漫形象', en: 'NEW CHARACTER', icon: 'wand', desc: '做一次，以后每条口播视频都能用它当讲解员。真人照片要先画成动漫形象；已经有卡通图的话可以直接用。' },
      ui.field(
        { label: '用什么做', en: 'SOURCE' },
        ui.seg({ value: f.kind, options: [{ value: 'photo', label: '我的照片 → 动漫形象' }, { value: 'cartoon', label: '现成的卡通图' }], disabled: busy, onChange: (v) => set({ kind: v }) }),
      ),
      f.kind === 'photo'
        ? ui.field(
            { label: '怎么画成动漫形象', en: 'STYLIZE', hint: f.stylize === 'cloud' ? (st.supported ? `用你在「云端生图」里配置的服务，约 ${yuan(st.rmbLow)}～${yuan(st.rmbHigh)} 一张（${S(st.note)}），生成前会再确认` : S(st.reason)) : localOk ? '在你的电脑上画，不花钱' : '本地模型还没有安装（下面「让形象动起来」里可以安装）' },
            ui.seg({
              value: f.stylize,
              options: [
                { value: 'cloud', label: '云端生图（最像本人）' },
                { value: 'local', label: '本地模型（免费）' },
              ],
              disabled: busy,
              onChange: (v) => set({ stylize: v }),
            }),
          )
        : null,
      f.kind === 'photo' ? ui.field({ label: '画风', en: 'STYLE' }, ui.chips({ value: f.style, options: (lib.styles || []).map((s) => ({ value: s.value, label: s.label })), disabled: busy, onChange: (v) => set({ style: v }) })) : null,
      f.kind === 'photo' && f.stylize === 'cloud'
        ? ui.field({ label: '额外要求（可不填）', en: 'EXTRA', hint: '例如：穿蓝色西装、短发、戴眼镜' }, ui.input({ key: 'an-extra', value: S(f.extra), maxLength: 200, placeholder: '可不填', onInput: (v) => (L.form.extra = v) }))
        : null,
      ui.grid(
        [
          ui.field(
            { label: f.kind === 'photo' ? '照片' : '卡通图', en: 'PICTURE', hint: f.kind === 'photo' ? '正面、五官清楚、光线均匀的半身照最好' : '透明背景的 PNG 最好；纯白 / 纯绿等纯色背景会自动抠掉' },
            ui.drop({
              label: f.file ? `已选：${S(f.file.name)}` : '拖入图片，或点击选择',
              hint: 'PNG / JPG / WebP，30 MB 以内',
              accept: 'image/*',
              icon: 'image',
              onFiles: (files) => set({ file: files[0] || null, assetPath: '' }),
            }),
          ),
          images.length
            ? ui.field({ label: '或者用素材库里的图片', en: 'FROM LIBRARY' }, ui.select({ value: f.assetPath || '', options: [{ value: '', label: '不用' }, ...images], disabled: busy, onChange: (v) => set({ assetPath: v, file: v ? null : f.file }) }))
            : null,
        ].filter(Boolean),
        { min: 240, fit: true },
      ),
      ui.field({ label: '名字（可不填）', en: 'NAME' }, ui.input({ key: 'an-name', value: S(f.name), maxLength: 24, placeholder: '我的动漫形象', onInput: (v) => (L.form.name = v) })),
      L.creating ? ui.meter(U.num(L.creating.pct, 5), { label: S(L.creating.message) || '生成中…' }) : null,
      ui.row(
        [
          ui.btn(f.kind === 'photo' && f.stylize === 'cloud' ? '生成动漫形象（先确认费用）' : '生成动漫形象', () => createFromForm(ctx), {
            kind: 'primary',
            icon: 'wand',
            busyText: '生成中…',
            disabled: busy || (!f.file && !f.assetPath) || (f.kind === 'photo' && f.stylize === 'cloud' && !st.supported) || (f.kind === 'photo' && f.stylize === 'local' && !localOk),
          }),
          f.kind === 'photo' && f.stylize === 'cloud' && !st.supported ? ui.btn('去设置云端生图', () => PK.open('cloud'), { size: 'sm', kind: 'ghost', icon: 'cloud' }) : null,
        ].filter(Boolean),
        { wrap: true },
      ),
    )
  }

  function enginesSection(ctx) {
    const L = ctx.local
    const lib = L.lib || {}
    const local = lib.local || null
    const tha = engineOf(lib, 'tha3')
    const clouds = ['vidu', 'volc', 'runway'].map((id) => engineOf(lib, id)).filter(Boolean)
    return ui.section(
      { title: '让形象动起来', en: 'PRESENTER ENGINES', icon: 'bolt', desc: '在「AI 剪辑 · 口播粗剪 → 口播包装 → 卡通讲解员」里选择用哪一种。' },
      ui.list(
        [
          ui.item({ icon: 'check', title: '免费档 · 会张嘴眨眼的立绘', sub: '嘴型跟着每个字开合，会眨眼、点头和呼吸。所有电脑都能用，不花钱。', right: ui.pill('可用', 'ok', { dot: true }), key: 'en-sprite' }),
          ui.item({
            icon: 'cpu',
            title: '显卡档 · 本地模型（脸和身体都会动）',
            sub: tha && tha.available ? S(tha.reason) || '已安装' : `嘴型、眼睛、眉毛、转头和身体摇摆都跟着声音动，在你的电脑上生成，不花钱。有 NVIDIA 显卡会快很多，没有也能用但很慢。${tha && tha.reason ? `（${S(tha.reason)}）` : ''}`,
            right: ui.pill(tha && tha.available ? '已安装' : '未安装', tha && tha.available ? 'ok' : 'mute', { dot: true }),
            key: 'en-tha3',
          }),
          ...clouds.map((e) =>
            ui.item({
              icon: 'cloud',
              title: S(e.label),
              sub: e.available ? S(e.reason) || '已填写密钥' : `${S(e.reason)}。按秒收费，每次生成前都会先告诉你价格。`,
              right: ui.pill(e.available ? '可用' : '未设置', e.available ? 'ok' : 'mute', { dot: true }),
              key: `en-${e.id}`,
            }),
          ),
        ],
        { dense: true },
      ),
      tha && !tha.available
        ? ui.stack(
            [
              ui.grid(
                [
                  ui.field({ label: '安装位置（可选）', en: 'INSTALL DIR', hint: '留空 = 插件数据目录；建议放在空间充足的非系统盘、纯英文路径' }, ui.input({ key: 'an-local-dir', value: S(L.localDir), placeholder: '例如 D:/dsh-ai/anime', onInput: (v) => (L.localDir = v) })),
                  ui.field({ label: '下载源', en: 'MIRROR' }, ui.seg({ value: L.localMirror || 'cn', options: [{ value: 'cn', label: '国内镜像' }, { value: 'global', label: '官方源' }], onChange: (v) => ((L.localMirror = v), ctx.update()) })),
                ],
                { min: 220, fit: true },
              ),
              L.installing ? ui.meter(U.num(L.installing.pct, 2), { label: S(L.installing.message) || '安装中…' }) : null,
              ui.row([ui.btn('安装本地动漫模型（免费）', () => installLocal(ctx), { icon: 'download', busyText: '安装中…', disabled: Boolean(L.installing) }), local && local.summary ? ui.hint(S(local.summary)) : null].filter(Boolean), { wrap: true }),
            ],
            { gap: 8 },
          )
        : null,
      ui.row(
        [
          ui.hint('云端档用你自己的账号密钥：Vidu 最便宜（约 1.9 元/分钟），火山引擎官方支持动漫形象（约 18 元/分钟），Runway 需要国际信用卡（约 1.5 元/分钟）。'),
          ui.btn(clouds.some((e) => !e.available) ? '填写云端密钥' : '云端密钥设置', () => PK.open('animeCloud'), { size: 'sm', icon: 'key', kind: 'ghost' }),
        ],
        { wrap: true },
      ),
      ui.hint(
        S(local && local.notice)
          ? `本地模型的来源与许可：${S(local.notice)}`
          : '显卡档使用 Talking Head Anime 3（作者 Pramook Khungurn，模型以 CC BY 4.0 许可发布）；照片动漫化使用 DCT-Net（阿里巴巴达摩院，Apache-2.0）。',
      ),
    )
  }

  /* ---------------------------------------------------------------- cloud keys (panel animeCloud, tier 3) */
  const CLOUD_INFO = [
    {
      id: 'vidu',
      name: 'Vidu 数字人',
      tag: '国内 · 最便宜',
      desc: '一张形象图 + 你的声音，生成会说话的视频；官方写明任何画风都可以。约 1.9 元/分钟（每秒 1 积分，1 积分 0.03125 元），生成失败自动退还积分。',
    },
    {
      id: 'volc',
      name: '火山引擎 · 单图音频驱动',
      tag: '国内 · 官方支持动漫',
      desc: '官方写明支持动漫形象。约 18 元/分钟（0.3 元/秒），每张形象图第一次使用时建形象 0.1 元，失败不收费。火山引擎只认网络链接：图片和声音会临时放进你自己的对象存储（TOS）桶，生成完就删除。需要先在火山引擎控制台开通「智能视觉 · 视频生成」。',
    },
    {
      id: 'runway',
      name: 'Runway Characters',
      tag: '海外 · 需要国际信用卡',
      desc: '约 1.5 元/分钟（每 3 秒 1 积分，1 积分 0.01 美元）。海外服务，国内网络可能需要代理。',
    },
  ]
  const VOLC_REGIONS = [
    { value: 'cn-beijing', label: '华北2（北京）cn-beijing' },
    { value: 'cn-shanghai', label: '华东2（上海）cn-shanghai' },
    { value: 'cn-guangzhou', label: '华南1（广州）cn-guangzhou' },
    { value: 'cn-hongkong', label: '中国香港 cn-hongkong' },
    { value: 'ap-southeast-1', label: '亚太东南（柔佛）ap-southeast-1' },
  ]

  async function loadCloud(ctx) {
    const L = ctx.local
    try {
      const r = await PK.get('anime/cloud')
      L.cloud = r.config || {}
      L.cloudAvailable = r.available !== false
      L.cloudReason = S(r.reason)
      L.cloudErr = null
      const c = L.cloud
      const d = (L.draft = L.draft || {})
      if (!d.inited) {
        Object.assign(d, {
          inited: true,
          viduRegion: (c.vidu && c.vidu.region) || 'cn',
          viduRes: (c.vidu && c.vidu.resolution) || '540p',
          volcBucket: (c.volc && c.volc.tosBucket) || '',
          volcRegion: (c.volc && c.volc.tosRegion) || 'cn-beijing',
          volcMode: (c.volc && c.volc.mode) || 'loopy',
        })
      }
    } catch (err) {
      L.cloudErr = err
    }
    ctx.update()
  }

  /** Secret field: a saved key is never shown, only its masked form; empty = keep the saved one. */
  function secretInput(ctx, key, saved, masked, placeholder) {
    const d = ctx.local.draft
    return ui.input({
      key: `ac-${key}`,
      type: 'password',
      value: S(d[key]),
      placeholder: saved ? `已保存${masked ? `（${masked}）` : ''} · 不修改请留空` : placeholder,
      autocomplete: 'new-password',
      onInput: (v) => (d[key] = v),
      title: false,
    })
  }

  async function saveCloud(ctx, id, extra = null) {
    const L = ctx.local
    const d = L.draft
    const patch =
      id === 'vidu'
        ? { vidu: { apiKey: S(d.viduKey).trim(), region: d.viduRegion, resolution: d.viduRes, ...(extra || {}) } }
        : id === 'volc'
          ? { volc: { accessKeyId: S(d.volcAk).trim(), secretAccessKey: S(d.volcSk).trim(), tosBucket: S(d.volcBucket).trim().toLowerCase(), tosRegion: d.volcRegion, mode: d.volcMode, ...(extra || {}) } }
          : { runway: { apiKey: S(d.runwayKey).trim(), ...(extra || {}) } }
    const r = await PK.post('anime/cloud', { config: patch })
    L.cloud = r.config || L.cloud
    for (const k of ['viduKey', 'volcAk', 'volcSk', 'runwayKey']) d[k] = ''
    L.tests = { ...(L.tests || {}), [id]: null }
    PK.toast(extra ? '已清除保存的密钥' : '已保存：密钥只存在你的电脑上', 'success')
    ctx.update()
  }

  async function clearCloud(ctx, id, name) {
    const ok = await PK.confirm({ title: `清除「${name}」保存的密钥？`, text: '清除后这个云端服务就不能用了，可以随时重新填写。已经做好的视频不受影响。', ok: '清除', danger: true })
    if (!ok) return
    await saveCloud(ctx, id, id === 'volc' ? { clear: true } : { clearApiKey: true })
  }

  async function testCloud(ctx, id) {
    const r = await PK.post('anime/cloud/test', { engine: id })
    const res = (r && r.result) || {}
    ctx.local.tests = { ...(ctx.local.tests || {}), [id]: res }
    ctx.update()
    PK.toast(res.ok ? S(res.message) : `测试没有通过：${S(res.message)}`, res.ok ? 'success' : 'error')
  }

  function cloudEngineSection(ctx, info) {
    const L = ctx.local
    const c = (L.cloud && L.cloud[info.id]) || {}
    const d = L.draft
    const test = (L.tests || {})[info.id]
    const links = c.links || {}
    const modes = Array.isArray(c.modes) ? c.modes : []
    let fields
    let saved = false
    if (info.id === 'vidu') {
      saved = Boolean(c.hasApiKey)
      fields = ui.grid(
        [
          ui.field({ label: 'API Key', en: 'KEY', hint: '在 Vidu 开放平台的「API Keys」页面创建' }, secretInput(ctx, 'viduKey', c.hasApiKey, c.apiKeyMasked, '粘贴 Vidu API Key（vda_ 开头）')),
          ui.field({ label: '站点', en: 'REGION', hint: '国内账号选国内站' }, ui.seg({ value: d.viduRegion || 'cn', options: [{ value: 'cn', label: '国内 vidu.cn' }, { value: 'global', label: '海外 vidu.com' }], onChange: (v) => ((d.viduRegion = v), ctx.update()) })),
          ui.field({ label: '清晰度', en: 'RESOLUTION', hint: '两种清晰度价格一样' }, ui.seg({ value: d.viduRes || '540p', options: modes.length ? modes.map((m) => ({ value: m.value, label: m.value })) : [{ value: '540p', label: '540p' }, { value: '720p', label: '720p' }], onChange: (v) => ((d.viduRes = v), ctx.update()) })),
        ],
        { min: 220, fit: true },
      )
    } else if (info.id === 'volc') {
      saved = Boolean(c.hasAccessKeyId || c.hasSecretAccessKey)
      fields = ui.stack(
        [
          ui.grid(
            [
              ui.field({ label: 'AccessKey ID', en: 'AK', hint: '控制台 → 访问控制 → 密钥管理' }, secretInput(ctx, 'volcAk', c.hasAccessKeyId, c.accessKeyIdMasked, '粘贴 AccessKey ID（AKLT 开头）')),
              ui.field({ label: 'Secret Access Key', en: 'SK' }, secretInput(ctx, 'volcSk', c.hasSecretAccessKey, '', '粘贴 Secret Access Key')),
            ],
            { min: 240, fit: true },
          ),
          ui.grid(
            [
              ui.field({ label: '对象存储（TOS）桶名称', en: 'BUCKET', hint: '在火山引擎「对象存储」里新建一个私有桶即可；只临时放图片和声音，用完就删' }, ui.input({ key: 'ac-volc-bucket', value: S(d.volcBucket), placeholder: '例如 my-anime-presenter', maxLength: 63, onInput: (v) => (d.volcBucket = v) })),
              ui.field({ label: '桶所在地域', en: 'REGION' }, ui.select({ value: d.volcRegion || 'cn-beijing', options: VOLC_REGIONS, onChange: (v) => ((d.volcRegion = v), ctx.update()) })),
            ],
            { min: 240, fit: true },
          ),
          ui.field(
            { label: '默认模式', en: 'MODE', hint: '动漫形象建议用「灵动」：漫画式的嘴和鼻子用「普通」可能带不动。每种模式第一次用一张形象图时各建一次形象（0.1 元）' },
            ui.seg({ value: d.volcMode || 'loopy', options: (modes.length ? modes : [{ value: 'loopy', label: '灵动' }, { value: 'normal', label: '普通' }, { value: 'loopyb', label: '大画幅灵动' }]).map((m) => ({ value: m.value, label: S(m.label).split('（')[0] })), onChange: (v) => ((d.volcMode = v), ctx.update()) }),
          ),
        ],
        { gap: 8 },
      )
    } else {
      saved = Boolean(c.hasApiKey)
      fields = ui.field({ label: 'API Key', en: 'KEY', hint: '在 Runway 开发者后台（dev.runwayml.com）创建，并充值积分' }, secretInput(ctx, 'runwayKey', c.hasApiKey, c.apiKeyMasked, '粘贴 Runway API Key'))
    }
    return ui.section(
      {
        title: info.name,
        en: info.id.toUpperCase(),
        icon: 'cloud',
        key: `ac-sec-${info.id}`,
        actions: [ui.pill(c.configured ? '已设置' : '未设置', c.configured ? 'ok' : 'mute', { dot: true })],
        desc: `${info.tag}。${info.desc}`,
      },
      fields,
      !c.configured && c.reason ? ui.hint(S(c.reason)) : null,
      test ? ui.note(S(test.message), { level: test.ok ? 'ok' : 'error' }) : null,
      ui.row(
        [
          ui.btn('保存', () => saveCloud(ctx, info.id), { kind: 'primary', icon: 'check', busyText: '保存中…' }),
          c.configured ? ui.btn('测试连接（不收费）', () => testCloud(ctx, info.id), { icon: 'bolt', busyText: '测试中…', title: '只验证密钥能不能用，不生成视频' }) : null,
          saved ? ui.btn('清除密钥', () => clearCloud(ctx, info.id, info.name), { kind: 'ghost', size: 'sm', icon: 'trash' }) : null,
          links.console ? ui.link('去申请密钥', links.console) : null,
          info.id === 'vidu' && links.consoleGlobal ? ui.link('海外站', links.consoleGlobal) : null,
          info.id === 'volc' && links.tos ? ui.link('新建存储桶', links.tos) : null,
          links.docs ? ui.link('官方说明', links.docs) : null,
        ].filter(Boolean),
        { wrap: true },
      ),
    )
  }

  PK.panel('animeCloud', {
    title: '云端动漫数字人 · 密钥',
    en: 'CLOUD PRESENTER KEYS',
    idx: 'AC',
    icon: 'key',
    kind: 'modal',
    size: 'lg',
    group: 'hidden',
    order: 15,
    desc: '填写你自己的 Vidu / 火山引擎 / Runway 密钥，让动漫形象整张脸跟着声音动',
    needsProject: false,
    aliases: { animeCloudKeys: {} },
    async mount(ctx) {
      ctx.local.draft = {}
      ctx.local.tests = {}
      await loadCloud(ctx)
    },
    render(ctx) {
      const L = ctx.local
      if (!L.cloud) return L.cloudErr ? ui.errorBox(L.cloudErr, () => loadCloud(ctx)) : ui.loading('正在读取云端设置…')
      ctx.foot([ui.hint('密钥只保存在你的电脑上（工作目录里的 .dsh-video-anime-cloud.json），只发给对应的服务本身。'), ui.spacer(), ui.btn('回到我的动漫形象', () => PK.open('animeChars'), { size: 'sm', kind: 'ghost', icon: 'user' })])
      if (L.cloudAvailable === false) return ui.note(L.cloudReason || '云端动漫数字人还没有就绪', { level: 'warn' })
      return [
        ui.note('云端按秒收费：每次生成前都会先告诉你这段视频大约多少钱，你确认后才会提交；同一段声音、同一个形象不会重复收费。测试连接只验证密钥，不生成视频、不收费。', { level: 'info' }),
        ...CLOUD_INFO.map((info) => cloudEngineSection(ctx, info)),
      ]
    },
  })

  PK.panel('animeChars', {
    title: '我的动漫形象',
    en: 'MY ANIME PRESENTER',
    idx: 'AN',
    icon: 'user',
    kind: 'modal',
    size: 'lg',
    group: 'tools',
    order: 14,
    desc: '用你的照片做一个会说话的动漫讲解员，做一次，每条视频都能用',
    needsProject: false,
    aliases: { anime: {}, animeCharacters: {}, presenter: {} },
    async mount(ctx) {
      ctx.local.form = null
      if (ctx.args && ctx.args.editId) ctx.local.editId = ctx.args.editId
      await loadLib(ctx, { quiet: true })
      if (ctx.local.editId) openEditor(ctx, ctx.local.editId)
      // the project's pictures (for 「用素材库里的图片」)
      if (PK.hasProject && PK.hasProject()) {
        try {
          const d = await PK.store.load()
          const items = (d && d.activeProject && d.activeProject.assets && d.activeProject.assets.items) || []
          ctx.local.projectImages = items.filter((it) => it && it.type === 'image').map((it) => ({ path: it.path, name: it.originalName || it.name || it.path }))
          ctx.update()
        } catch {}
      }
      // mouth-shape preview: swap the patch pictures without re-rendering the panel
      ctx.every(150, () => {
        const L = ctx.local
        if (!L.preview || !L.edit || !L._pv) return
        const c = L.edit.character
        const mouths = (c.sprites && c.sprites.mouths) || {}
        L.pvTick = (U.num(L.pvTick, 0) + 1) % 1000
        const shape = PREVIEW_SHAPES[Math.floor(L.pvTick / 2) % PREVIEW_SHAPES.length]
        if (L._pv.mouth) {
          const file = shape === 'closed' ? mouths.closed : mouths[shape]
          if (file) {
            const src = fileUrl(c, file)
            if (L._pv.mouth.getAttribute('src') !== src) L._pv.mouth.setAttribute('src', src)
            L._pv.mouth.style.visibility = 'visible'
          } else L._pv.mouth.style.visibility = 'hidden'
        }
        if (L._pv.blink) L._pv.blink.style.visibility = L.pvTick % 18 === 0 || L.pvTick % 18 === 1 ? 'visible' : 'hidden'
      })
    },
    render(ctx) {
      const L = ctx.local
      if (!L.lib) return L.libErr ? ui.errorBox(L.libErr, () => loadLib(ctx)) : ui.loading('正在读取形象库…')
      ctx.foot([ui.hint('照片只保存在你的电脑上；只有选「云端生图」时才会把照片发给你自己配置的生图服务。'), ui.spacer(), ui.btn('刷新', () => loadLib(ctx), { size: 'sm', kind: 'ghost', icon: 'refresh' })])
      return [ui.section({ title: '形象库', en: 'LIBRARY', icon: 'user', count: ((L.lib && L.lib.characters) || []).length }, libraryView(ctx)), faceEditor(ctx), createSection(ctx), enginesSection(ctx)].filter(Boolean)
    },
  })
})()
