/**
 * 画面自检 (visual self-review) for AI-coded Remotion scenes — genre-agnostic.
 *
 * Compiling is not seeing: a scene can pass tsc and still show paper-doll people, an empty sky, text on top of text or
 * a black frame. After the batches compile, a few keyframes per scene are rendered (scene-keyframes.js) and the
 * configured multimodal model looks at them batch by batch against each shot's storyboard. Shots with a major
 * problem get one targeted rewrite with their screenshots attached; the rewrite still has to compile.
 *
 * Costs: one review call per batch, plus one rewrite call per batch that has a major problem. Whether the model can see
 * is decided by the shared 看图能力 check (vision-capability.js) before any keyframe is rendered; a model that cannot
 * see is skipped with the reason in plain Chinese, without breaking the pipeline.
 *
 * 「逐个机位看图」 (fine review, `fine: true`): a shot cut into re-framed sub-shots (beat-analyzer.js `scene.cuts`) gets one
 * still per 机位 and long shots one still about every 4 s, so every picture the audience sees is looked at. The reviewer
 * names the 机位 of a problem (`shot`); a title or face cut off by a sub-shot's zoom (`crop`) is fixed locally by a looser
 * framing (loosenCroppedCuts, no model call), and rewritten shots are looked at once more afterwards.
 */
import { CUT_FRAMING_LOOSER, CUT_FRAMING_SPEC, CUT_FRAMING_ZH } from './beat-analyzer.js'
import { castIdsForScene, describeFigureZh, FIGURE_STYLE_ZH } from './figure-kit.js'
import { extractJsonFromLlmText } from './llm-client.js'
import { classifyVisionError } from './vision-capability.js'

export const REVIEW_ISSUE_KINDS = ['figure', 'empty', 'mismatch', 'text', 'dark', 'clutter', 'broken', 'static', 'cast', 'crop']

const KIND_ZH = {
  figure: '人物/动物画得简陋或怪异',
  empty: '画面空洞',
  mismatch: '与分镜不符',
  text: '文字问题',
  dark: '主体过暗',
  clutter: '杂乱遮挡',
  broken: '渲染异常',
  static: '画面不动',
  cast: '指定人物没出镜',
  crop: '推近后被裁切',
}

/** How to fix each kind of problem (sent with the rewrite request). */
export const REVIEW_FIX_HINTS = {
  figure: "按本片的人物画风把人物重画到成片水准：比例协调、关节连贯、姿态自然、服装道具清楚，不要用方块椭圆拼纸片人；本片画风是人物库现成的（剪影 / 剪纸 / 皮影 / 水墨 / 扁平侧身 / 火柴人）时，也可以直接换成 '../lib/figure-kit' 的 <Figure look={castLook(scene, 'id')} style=… action=…/>、<Horse>、<Troop>",
  empty: '按 visualBlueprint 补上主体（人物 / 物件 / 图形）并做出前景、中景、背景三层，主体占画面 30% 以上',
  mismatch: '按 visualBlueprint 重做这一镜的构图，确保分镜里写的关键主体与动作出现在画面中',
  text: '调整文字位置、字号与换行：文字之间、文字与主体之间不重叠，不出画；底部字幕区与右上角角标区不放文字；去掉指令性文字与占位符',
  dark: '提亮主体：加轮廓光 / 补光 / 提高主体与背景的明暗对比，压暗叠层不透明度不超过 0.35',
  clutter: '减少同时出现的元素，分清主次，主体周围留白，前后景不要互相遮挡关键信息',
  broken: '修复导致白屏 / 黑屏 / 大色块 / 元素飞出画面的代码（检查坐标、viewBox、透明度与 interpolate 的输入范围）',
  static: '加入覆盖整镜的持续运动（人物动作、镜头缓推 2–4%、前后景差速漂移、粒子光影流动）',
  cast: '把分镜要求出镜的人物清楚画进画面主要位置：按演员表的服装、发型、配色和道具画成完整可辨的人物，全片同一形象，不出画、不被遮挡；不要用图标、文字、剪影小点、背影或画外暗示代替',
  crop: '标题、关键文字和人物的头脸放在画面中间约 70% 的安全区里，四周留出边距；镜头按机位推近（scene.cut.framing 为 close / detail）时也不能被裁出画面，必要时缩小字号或把它们往画面中心挪',
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** How a still is named in prompts: 「机位2·特写」 for a sub-shot still, the shot position (「35%」) otherwise. */
export function reviewFrameLabel(f = {}) {
  if (f.cut && Number.isInteger(f.cut.index)) return `机位${f.cut.index + 1}·${CUT_FRAMING_ZH[f.cut.framing] || '画面'}`
  return `${Math.round((Number(f.fraction) || 0) * 100)}%`
}

/**
 * People a shot must show, as { name, look }: from the film cast (`castIds` / `cast` of the scene plus the names its
 * text mentions, see figure-kit castIdsForScene) when the caller passes it, else from the names the pipeline stored on
 * the scene (`castNames`) or person objects in `scene.cast`.
 */
export function sceneCastForReview(scene = {}, cast = []) {
  const film = Array.isArray(cast) ? cast.filter((c) => c && typeof c === 'object' && c.id) : []
  if (film.length) {
    return castIdsForScene(scene, film)
      .map((id) => film.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => ({ name: String(c.name || c.id), look: clip(c.look || describeFigureZh(c.figure || c.rig || {}), 80) }))
  }
  if (Array.isArray(scene.castNames) && scene.castNames.length) return scene.castNames.map((n) => ({ name: clip(n, 24), look: '' })).filter((c) => c.name)
  if (Array.isArray(scene.cast)) return scene.cast.filter((c) => c && typeof c === 'object' && c.name).map((c) => ({ name: clip(c.name, 24), look: clip(c.look || '', 80) }))
  return []
}

const castLine = (people) => people.map((p) => `${p.name}${p.look ? `（${p.look}）` : ''}`).join('、')

/**
 * Review request for one batch: storyboard text and the keyframes of each shot, interleaved.
 * frames: [{ sceneId, fraction, base64 }]
 */
/** Chinese name of the film's character style for review / fix prompts ('' when the film did not set one). */
function figureStyleText(figureStyle = '', figureStyleNote = '') {
  if (figureStyle === 'custom') return `自定义（${figureStyleNote || '见分镜与导演备注'}）`
  if (!figureStyle || figureStyle === 'auto') return ''
  return FIGURE_STYLE_ZH[figureStyle] || String(figureStyle)
}

export function buildVisualReviewRequest({ batchScenes = [], frames = [], genreLabel = '', figureStyle = '', figureStyleNote = '', width = 1920, height = 1080, cast = [], fine = false } = {}) {
  const styleText = figureStyleText(figureStyle, figureStyleNote)
  const anyCast = batchScenes.some((sc) => sceneCastForReview(sc, cast).length > 0)
  const ids = new Set(batchScenes.map((sc) => sc.id))
  // 机位 stills (a sub-shot of a re-framed shot) need their own explanation and the 机位 number in the answer
  const anyCut = frames.some((f) => ids.has(f.sceneId) && f.cut && Number.isInteger(f.cut.index))
  const intro = fine
    ? `你会看到一批镜头的截图和每个镜头的分镜描述。较长的镜头会按音乐节拍切成几个「机位」（远景、中景、近景、特写等，是系统对同一画面做的推近或拉远，属于正常剪辑），每个机位一张截图，标成「机位N·景别」；没有切机位的镜头大约每 4 秒一张截图，标成镜头进行到的百分比。请逐个机位、逐张截图判断画面是否达到可以交付的成片水准，只报告真正影响观感的问题。`
    : `你会看到一批镜头的关键帧截图（每个镜头一般 2 张：镜头进行到 35% 与 80% 时的画面${anyCut ? '；镜头切了机位时标成「机位N·景别」，机位是系统对同一画面做的推近或拉远，属于正常剪辑' : ''}）和每个镜头的分镜描述。请逐镜判断画面是否达到可以交付的成片水准，只报告真正影响观感的问题。`
  const system = `你是严格的动画成片质检导演。${intro}
说明：
- 画面底部的字幕条、角落的「AI 辅助创作」角标由系统统一叠加，不算问题。
- 剪影、剪纸、皮影、水墨、扁平、火柴人、Q版、动漫、绘本、像素等风格化画法都是有意为之：人物不需要写实，但必须比例协调、关节连贯、姿态自然、能看出在做什么；如果说明了本片人物画风，而画面里的人物明显是另一种画风，记为 mismatch。
- 问题类型 kind：figure（人物或动物画得简陋/怪异：几个方块椭圆拼成的纸片人、比例失调、肢体错位扭曲、头身分离、五官诡异）· empty（画面空洞，只有背景/渐变/几条线，缺少分镜要求的主体）· mismatch（画面与分镜描述明显不符）· text（文字重叠、出画、遮挡主体、乱码、出现指令性文字或英文占位符）· dark（主体过暗看不清）· clutter（元素杂乱、互相遮挡、构图失衡）· broken（白屏、黑屏、大色块、元素飞出画面等渲染异常）· static（同一镜头的截图除了机位推近拉远之外几乎一样，画面里什么都没有动）· cast（分镜写明必须出镜的人物在画面里看不到或认不出）${anyCut || fine ? '· crop（某个机位推近后，标题、关键文字或人物的头脸被裁出画面边缘）' : ''}。
- severity：major = 观众一眼就能看出、必须返工的问题；minor = 可以接受的小瑕疵；none = 没有问题。不要为了挑错而挑错，好的镜头直接给 none。
- seen：用 10~30 个字写出你在截图里实际看到的内容（用来核对你真的看了图）。${
    anyCut
      ? `
- 问题只出现在某个机位时，在这条 issue 里用 "shot" 写出机位编号（数字，例如机位2 写 2）；没有机位的镜头不写 shot。`
      : ''
  }${
    anyCast
      ? `
- 必须出镜：镜头说明里列了「必须出镜」的人物时，逐个判断截图里能不能清楚认出这个人（按括号里的外观：服装、发型、配色、道具）。看不到、出画、被挡住、只剩图标/文字/剪影小点/背影，或者画成了别的样子都算 "visible": false，写进 cast 数组；任何一个人 visible 为 false，这一镜 severity 给 major，并在 issues 里记一条 kind 为 cast 的问题。`
      : ''
  }
只输出严格 JSON（不要 Markdown 围栏）：{"scenes":[{"id":"scene-01","seen":"…","severity":"none|minor|major",${anyCast ? '"cast":[{"name":"人物名","visible":true,"where":"在画面哪里、在做什么"}],' : ''}"issues":[{"kind":"figure",${anyCut ? '"shot":1,' : ''}"detail":"具体问题，指出画面位置","fix":"具体怎么改"}]}]}`
  const content = [
    {
      type: 'text',
      text: `作品类型：${genreLabel || '未指定'}${styleText ? `；本片人物画风：${styleText}` : ''}；画布 ${width}x${height}。下面共 ${batchScenes.length} 个镜头，请逐镜检查。`,
    },
  ]
  for (const sc of batchScenes) {
    const shots = frames.filter((f) => f.sceneId === sc.id && f.base64)
    if (!shots.length) continue
    const people = sceneCastForReview(sc, cast)
    content.push({
      type: 'text',
      text: `【${sc.id}】${clip(sc.title, 24)}｜分镜：${clip(sc.visualBlueprint || sc.motionNotes || sc.visualPrompt || '', 220)}${sc.narration ? `｜旁白：${clip(sc.narration, 60)}` : ''}${people.length ? `｜必须出镜：${castLine(people)}` : ''}｜截图 ${shots.map(reviewFrameLabel).join('、')}：`,
    })
    for (const f of shots) {
      // with several stills per shot each picture is announced right before it, so the 机位 numbers can't drift
      if (shots.length > 2 || f.cut) content.push({ type: 'text', text: `${sc.id} ${reviewFrameLabel(f)}：` })
      content.push({ type: 'image', mimeType: 'image/jpeg', base64: f.base64 })
    }
  }
  return { system, messages: [{ role: 'user', content }] }
}

const NOT_VISIBLE_RX = /^(?:false|no|n|0|否|不|无|没有|看不到|不可见|未出现|缺失|missing|absent|hidden|not visible)$/i

/** The reviewer's per-person presence verdicts of one shot: [{ name, visible, where }] (unknown entries dropped). */
function parsePresence(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.entries(raw).map(([name, v]) => (v && typeof v === 'object' ? { name, ...v } : { name, visible: v })) : []
  const out = []
  for (const p of list) {
    if (!p || typeof p !== 'object') continue
    const name = clip(p.name ?? p.person ?? p.character ?? '', 24)
    if (!name) continue
    const v = p.visible ?? p.present ?? p.onScreen ?? p.seen
    if (v === undefined || v === null || v === '') continue
    const visible = typeof v === 'boolean' ? v : typeof v === 'number' ? v > 0 : !NOT_VISIBLE_RX.test(String(v).trim())
    out.push({ name, visible, where: clip(p.where ?? p.note ?? p.detail ?? '', 60) })
  }
  return out
}

/**
 * Normalised review: { scenes: { [id]: { severity, issues, seen, cast? } }, looked: boolean }. A person the shot must
 * show (see sceneCastForReview) whom the reviewer marks as not visible becomes a major `cast` issue whose fix names
 * exactly who to draw and how. `opts` ({ batchScenes, cast }) is optional: old callers and old replies parse as before.
 */
export function parseVisualReview(text = '', sceneIds = [], opts = {}) {
  const parsed = extractJsonFromLlmText(String(text || ''))
  const list = Array.isArray(parsed?.scenes) ? parsed.scenes : Array.isArray(parsed) ? parsed : []
  const want = new Set(sceneIds)
  const byId = new Map((Array.isArray(opts?.batchScenes) ? opts.batchScenes : []).map((s) => [s.id, s]))
  const scenes = {}
  let seenCount = 0
  for (const item of list) {
    const id = String(item?.id || item?.sceneId || '').trim()
    if (!want.has(id) || scenes[id]) continue
    let issues = (Array.isArray(item?.issues) ? item.issues : [])
      .map((it) => {
        // the 机位 the problem is in (1-based, as shown to the reviewer); "机位2" / "2" / 2 all read as 2
        const shotRaw = it?.shot ?? it?.cut ?? it?.angle
        const shot = Number.parseInt(String(shotRaw ?? '').replace(/[^\d]/g, ''), 10)
        return {
          kind: REVIEW_ISSUE_KINDS.includes(String(it?.kind || '').trim()) ? String(it.kind).trim() : 'mismatch',
          detail: clip(it?.detail || it?.problem || '', 200),
          fix: clip(it?.fix || it?.suggestion || '', 200),
          ...(Number.isInteger(shot) && shot >= 1 && shot <= 64 ? { shot } : {}),
        }
      })
      .filter((it) => it.detail)
    // presence check: everyone the shot must show and the reviewer could not see
    const expected = byId.has(id) ? sceneCastForReview(byId.get(id), opts?.cast) : []
    const presence = parsePresence(item?.cast ?? item?.people ?? item?.castCheck)
    const missing = []
    for (const p of presence) {
      if (p.visible) continue
      const exp = expected.find((e) => e.name === p.name || e.name.includes(p.name) || p.name.includes(e.name))
      if (expected.length && !exp) continue
      const who = exp || { name: p.name, look: '' }
      if (!missing.some((m) => m.name === who.name)) missing.push({ ...who, where: p.where })
    }
    if (missing.length) {
      // the reviewer's own cast issues are replaced by one precise issue per missing person
      issues = issues.filter((it) => it.kind !== 'cast')
      issues.unshift(
        ...missing.map((m) => ({
          kind: 'cast',
          detail: clip(`画面里看不到必须出镜的「${m.name}」${m.where ? `（${m.where}）` : ''}`, 200),
          fix: clip(`在本镜画面主要位置清楚画出「${m.name}」${m.look ? `：${m.look}` : ''}，画成完整可辨的人物，全片同一形象，不出画、不被遮挡；不要用图标、文字、剪影小点、背影或画外暗示代替`, 200),
        })),
      )
    }
    issues = issues.slice(0, Math.max(4, missing.length + 2))
    let severity = String(item?.severity || '').trim().toLowerCase()
    if (!['none', 'minor', 'major'].includes(severity)) severity = issues.length ? 'minor' : 'none'
    if (severity !== 'none' && issues.length === 0) severity = 'none'
    if (missing.length) severity = 'major'
    const seen = clip(item?.seen || '', 80)
    if (seen) seenCount++
    scenes[id] = { severity, issues, seen, ...(presence.length ? { cast: presence.map(({ name, visible }) => ({ name, visible })) } : {}) }
  }
  // a model that never describes what it saw did not look at the images (text-only model behind an image API)
  return { scenes, looked: seenCount > 0 }
}

/** Rewrite request for the flagged shots of one batch (screenshots of those shots attached). */
export function buildVisualFixRequest({ filePath, exportName, code, batchScenes = [], review = {}, frames = [], figureStyle = '', figureStyleNote = '', cast = [] } = {}) {
  const byId = new Map(batchScenes.map((s) => [s.id, s]))
  const styleText = figureStyleText(figureStyle, figureStyleNote)
  // a film with its own character style is never pushed onto the library's look by a rewrite
  const howFor = (kind, it = {}) =>
    kind === 'cast'
      ? `${it.fix || REVIEW_FIX_HINTS.cast}${styleText ? `；按本片人物画风（${styleText}）画` : ''}${figureStyle === 'custom' ? '，不要换成人物库的侧身人形' : ''}`
      : kind === 'figure' && figureStyle === 'custom'
        ? `按本片的人物画风（${styleText}）把人物重画到成片水准：比例协调、关节连贯、姿态自然、服装道具清楚，同一角色每个镜头保持一致；不要换成人物库的侧身人形`
        : REVIEW_FIX_HINTS[kind]
  const flagged = Object.entries(review).filter(([, r]) => r.severity === 'major')
  const task = {
    task: `请根据画面自检结果修改 ${filePath}：下列镜头渲染出来的画面有明显问题（附当前画面截图）。只修改这些镜头，其它镜头保持原样；保留每镜的文字内容、时长节奏与 scene.actionEvents 接触帧对齐，只解决列出的问题。`,
    problems: flagged.map(([id, r]) => {
      const people = byId.has(id) ? sceneCastForReview(byId.get(id), cast) : []
      return {
        sceneId: id,
        visualBlueprint: clip(byId.get(id)?.visualBlueprint || byId.get(id)?.motionNotes || '', 260) || undefined,
        // everyone this shot must show (name + look), so a rewrite never drops a person while fixing something else
        mustShow: people.length ? people.map((p) => (p.look ? `${p.name}：${p.look}` : p.name)) : undefined,
        issues: r.issues.map((it) => ({
          kind: it.kind,
          // the 机位 the problem was seen in: scene.cut.index + 1 inside the component
          ...(it.shot ? { shot: `机位${it.shot}（scene.cut.index === ${it.shot - 1}）` } : {}),
          problem: it.detail,
          suggestion: it.fix || undefined,
          how: howFor(it.kind, it),
        })),
      }
    }),
    filmFigureStyle: styleText || undefined,
    currentCode: code,
    requiredExportName: exportName,
    requiredSceneIds: batchScenes.map((s) => s.id),
    strictReminder: `仅输出严格 JSON { "files": { "${filePath}": "<完整代码>" } }；TypeScript strict 零错误；禁止 Math.random()、@keyframes 与 transition 冒号写法。`,
  }
  const content = [{ type: 'text', text: JSON.stringify(task, null, 2) }]
  for (const [id] of flagged) {
    const shots = frames.filter((f) => f.sceneId === id && f.base64)
    if (!shots.length) continue
    content.push({ type: 'text', text: `【${id}】当前画面（${shots.map(reviewFrameLabel).join('、')}）：` })
    for (const f of shots) {
      if (shots.length > 2 || f.cut) content.push({ type: 'text', text: `${id} ${reviewFrameLabel(f)}：` })
      content.push({ type: 'image', mimeType: 'image/jpeg', base64: f.base64 })
    }
  }
  return { messages: [{ role: 'user', content }] }
}

/**
 * Local fix for 「crop」 findings (no model call): the 机位 whose re-frame zoom cuts off a title or a face gets one
 * step looser (特写 / 近景 / 高低机位 → 中景, 中景 → 远景) and its zoom centre back on the framing's default. A crop
 * finding without a 机位 number loosens every tight sub-shot of that shot. Mutates `scene.cuts` of `scenes`.
 * Returns { loosened: [{ sceneId, shot, from, to }], resolved: { [sceneId]: issueCount } } — `resolved` counts the crop
 * issues of a shot that a looser framing took care of (a crop at a 远景 / an unknown 机位 stays for the rewrite).
 */
export function loosenCroppedCuts(scenes = [], review = {}) {
  const byId = new Map((Array.isArray(scenes) ? scenes : []).filter((s) => s && s.id).map((s) => [s.id, s]))
  const loosened = []
  const resolved = {}
  for (const [id, r] of Object.entries(review || {})) {
    const sc = byId.get(id)
    const cuts = Array.isArray(sc?.cuts) ? sc.cuts : []
    if (!cuts.length) continue
    // each sub-shot is loosened at most one step per review, however many findings name it
    const touched = new Set()
    for (const it of Array.isArray(r?.issues) ? r.issues : []) {
      if (it.kind !== 'crop') continue
      const targets = it.shot ? [it.shot - 1] : cuts.map((c, k) => (CUT_FRAMING_SPEC[c?.framing]?.scale || 1) > 1.2 ? k : -1).filter((k) => k >= 0)
      let done = 0
      for (const k of targets) {
        const c = cuts[k]
        if (!c) continue
        if (touched.has(k)) {
          done++
          continue
        }
        const from = CUT_FRAMING_SPEC[c.framing] ? c.framing : 'wide'
        const to = CUT_FRAMING_LOOSER[from] || ''
        if (!to) continue
        c.framing = to
        c.focus = { ...CUT_FRAMING_SPEC[to].focus }
        touched.add(k)
        loosened.push({ sceneId: id, shot: k + 1, from, to })
        done++
      }
      if (done > 0) {
        // this finding needs no rewrite any more (callers leave it out of the fix request)
        it.resolvedLocally = true
        resolved[id] = (resolved[id] || 0) + 1
      }
    }
  }
  return { loosened, resolved }
}

/**
 * True when an LLM error means "this model / endpoint cannot take images" (stop reviewing, keep the film). Uses the
 * shared 看图能力 classification (vision-capability.js), so 画面自检, 参考复刻 and 截图定位 agree on what an image
 * refusal looks like; an ambiguous 4xx also counts here (the review stops instead of retrying every batch).
 */
export function isVisionUnsupportedError(err) {
  const c = classifyVisionError(err)
  return c.conclusive || c.code === 'bad-request'
}

/** One-line Chinese summary for the task log. */
export function summarizeVisualReview(report) {
  if (!report) return ''
  if (report.skipped) return `画面自检跳过：${report.skipped}`
  const kinds = {}
  for (const r of Object.values(report.scenes || {})) {
    if (r.severity !== 'major') continue
    for (const it of r.issues) kinds[it.kind] = (kinds[it.kind] || 0) + 1
  }
  const kindText = Object.entries(kinds).map(([k, n]) => `${KIND_ZH[k] || k} ${n}`).join('、')
  const loose = Array.isArray(report.loosenedCuts) ? report.loosenedCuts.length : 0
  const rc = report.recheck
  const recheckText = rc
    ? rc.skipped
      ? `；返工后复查跳过：${rc.skipped}`
      : `；返工后复查 ${rc.reviewedScenes} 个镜头：${(rc.resolvedScenes || []).length} 个问题已解决${(rc.remainingScenes || []).length ? `，${rc.remainingScenes.length} 个仍有问题（${rc.remainingScenes.slice(0, 6).join('、')}${rc.remainingScenes.length > 6 ? '…' : ''}）` : ''}${(rc.revertedBatches || []).length ? `，${rc.revertedBatches.length} 批返工后更差，已退回返工前的画面` : ''}`
    : ''
  return `画面自检${report.detail === 'fine' ? '（逐个机位看图）' : ''}：看了 ${report.reviewedScenes} 个镜头 ${report.frameCount} 张${report.detail === 'fine' ? '截图' : '关键帧'}，${report.majorScenes} 个镜头有明显问题${kindText ? `（${kindText}）` : ''}${report.majorScenes ? `，已返工 ${report.fixedScenes} 个` : ''}${loose ? `；${loose} 个机位推近后裁掉了标题或人物，已改成更宽的景别（不用重写代码）` : ''}${report.failedBatches ? `，${report.failedBatches} 批返工未通过编译已保留原画面` : ''}${recheckText}`
}
