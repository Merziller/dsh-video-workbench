#!/usr/bin/env node
/**
 * Characters named in the shot copy must be on screen (field report: some shots showed the people the copy named,
 * others did not). Backend only — no network, no model, no render:
 *   - brief-cast.js reads the 人物设定 / 分镜段落 sections of a real 「AI 润色」 brief (rendered by the web workbench's
 *     polish step from a canned reply), edited briefs and old briefs without those sections
 *   - the director takes the brief's cast bible as the film's cast (names verbatim, looks from the brief) and every shot
 *     lists everyone its text names, plus the 出镜 list of the brief segment its time falls in; densified sub-shots keep
 *     their parent's cast
 *   - figure-kit: who a shot must show (director list ∪ names in the text, none for 空镜), the coder guide line
 *   - 画面自检 (visual-review.js): the request lists each shot's cast, a person marked missing becomes a major problem
 *     with a precise fix, old replies and old callers still work
 *
 *   node scripts/tests/cast-presence.test.mjs
 *
 * Scratch data only (<repo>/.tmp/cast-presence-test/<stamp>); network is blocked; the real `.env` / DSH client are
 * never read.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'cast-presence-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}

const bc = await imp('packages/dsh-tool-media/brief-cast.js')
const ps = await imp('packages/dsh-tool-media/plan-schema.js')
const fk = await imp('packages/dsh-tool-media/figure-kit.js')
const vr = await imp('packages/dsh-tool-media/visual-review.js')

// a canned 「AI 润色」 reply (the 毛选 field report: three working people, a no-people opening, everyone at the end)
const POLISH_REPLY = {
  genre: 'other',
  genreLabel: '理论学习卡点动画',
  contentFamily: 'theory',
  displayTitle: '读毛选解难题',
  logline: '用方法看懂普通劳动者的处境',
  tone: '沉稳真诚',
  contentOutline: ['原著方法：先分清处境再找出路', '外卖骑手小李在暴雨中被系统催单', '工厂工人老周面临裁员', '小店主王姐被房租和电商挤压', '用阶级分析的方法看清处境', '团结与互助的力量'],
  visualStyle: { look: '扁平插画风格的现实场景与书页质感结合', palette: { 主色: '中国红 #C8102E' }, figureStyle: '扁平插画', camera: '推近细节再拉远' },
  cast: [
    { name: '外卖骑手小李', role: '城市打工人', appearance: '28 岁男性，瘦高，短发，神情疲惫', costume: '黄色骑手服 #F5B800、头盔、透明雨衣', actions: ['看手机催单', '冒雨骑行'] },
    { name: '老周', role: '工厂工人', appearance: '50 岁男性，微胖，寸头', costume: '蓝色工装 #2F5D8A、安全帽', actions: ['拧螺丝', '看通知'] },
    { name: '王姐', role: '小店主', appearance: '40 岁女性，齐肩发', costume: '围裙 #8B5E3C', actions: ['算账', '锁门'] },
  ],
  segments: [
    { title: '开篇·原著书页', start: 0, end: 8, shots: 4, beats: 4, points: [1], cast: [], picture: '翻开的书页，关键词逐字浮现', action: '书页翻动', camera: '缓推', transition: '翻书页', text: ['先分清处境'], sound: '翻书' },
    { title: '困境一·暴雨中的骑手', start: 8, end: 26, shots: 8, beats: 4, points: [2], cast: ['外卖骑手'], picture: '暴雨夜的街口，小李骑车穿过积水', action: '看手机、加速', camera: '跟拍', transition: '匹配剪辑', text: ['超时扣款'], sound: '雨声' },
    { title: '困境二·车间', start: 26, end: 44, shots: 8, beats: 4, points: [3], cast: ['老周'], picture: '车间流水线，老周拧螺丝', action: '停下扳手', camera: '横移', transition: '分屏滑入', text: ['裁员通知'], sound: '机器声' },
    { title: '困境三·小店', start: 44, end: 62, shots: 8, beats: 4, points: [4], cast: ['王姐'], picture: '街角小店，王姐对着账本叹气；小李在门口取餐', action: '算账、锁门', camera: '推近账本', transition: '光线转暗', text: ['房租又涨'], sound: '钟表' },
    { title: '方法·关系图', start: 62, end: 80, shots: 8, beats: 2, points: [5], cast: [], picture: '人群分层的关系图，节点连线生长', action: '连线点亮', camera: '拉远', transition: '由暗转亮', text: ['看清处境'], sound: '提示音' },
    { title: '升华·团结', start: 80, end: 90, shots: 4, beats: 4, points: [6], cast: ['小李', '老周', '王姐'], picture: '三人在晨光中并肩', action: '相视而笑', camera: '缓慢拉远', transition: '淡出', text: ['团结起来'], sound: '温暖和弦' },
  ],
  music: '全程卡点',
  voiceStyle: '沉稳男声',
  notes: '结尾留白',
  suggestedStyle: 'documentary',
}

/** Render a real brief with the web workbench's polish step (fake model reply, no network). */
async function renderBrief(reply, body = {}) {
  const { polishTopicPrompt } = await imp('packages/dsh-web-video-workbench/lib/index.js')
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 })
  return polishTopicPrompt({ llmOverride: { provider: 'openai', format: 'openai-completions', baseUrl: 'https://mock-polish.invalid/v1', apiKey: 'mock-key', model: 'mock-director' }, rawPrompt: '读毛选解难题：外卖骑手、工厂工人、小店主的动画故事，纯音乐卡点，90秒', durationMode: 'custom', targetDurationSec: 90, ...body }, { fetchImpl })
}

let BRIEF_NOTES = ''

/* ----------------------------------------------------------------------------------------------- brief-cast */
await section('brief-cast parser', async () => {
  const polished = await renderBrief(POLISH_REPLY)
  BRIEF_NOTES = String(polished.directorNotes || '')
  check('the polish step renders the 人物设定 and 分镜段落 sections', /▍人物设定/.test(BRIEF_NOTES) && /▍分镜段落/.test(BRIEF_NOTES) && /出镜：/.test(BRIEF_NOTES), BRIEF_NOTES.slice(0, 120))
  const p = bc.parseBriefCast(BRIEF_NOTES)
  check('figure style line', p.figureStyle === '扁平插画', p.figureStyle)
  check('cast bible: names verbatim, role, appearance, costume (with #hex), actions', p.cast.map((c) => c.name).join() === '外卖骑手小李,老周,王姐' && p.cast[0].role === '城市打工人' && p.cast[0].appearance.includes('28 岁男性') && p.cast[0].costume.includes('#F5B800') && p.cast[0].actions.join() === '看手机催单,冒雨骑行' && p.cast[2].costume.includes('围裙'), JSON.stringify(p.cast[0]))
  check('a long name gets its short form as an alias (外卖骑手小李 → 小李); generic words never do', p.cast[0].aliases.includes('小李') && bc.deriveCastAliases('城市打工人').length === 0 && bc.deriveCastAliases('老周').length === 0)
  const seg = p.segments
  check('six segments with their time ranges, shot counts and beats', seg.length === 6 && seg[0].startSec === 0 && seg[0].endSec === 8 && seg[1].startSec === 8 && seg[1].endSec === 26 && seg[5].endSec === 90 && seg[1].shots === 8 && seg[1].beats === 4, seg.map((g) => `${g.startSec}-${g.endSec}/${g.shots}`).join(' '))
  check('出镜 lists map onto the bible names; 无人物 is empty; a person the picture names is on screen', seg[0].cast.length === 0 && seg[1].cast.join() === '外卖骑手小李' && seg[2].cast.join() === '老周' && seg[3].cast.includes('王姐') && seg[3].cast.includes('外卖骑手小李') && seg[5].cast.length === 3, seg.map((g) => g.cast.join('+') || '-').join(' | '))
  check('segment details: title, picture, subtitles', seg[1].title === '困境一·暴雨中的骑手' && seg[1].picture.includes('暴雨夜') && seg[1].text.join() === '超时扣款')

  // a brief the user edited by hand: half-width separators, no ▍ markers, other bullets, renamed / missing fields
  const edited = [
    '人物画风: 绘本手绘',
    '人物设定:',
    '- 阿强 | 快递员: 30岁男性，偏瘦; 服饰: 蓝色工服 #1E40AF; 动作: 搬箱子',
    '• 小梅（店员）：长发女孩',
    '',
    '分镜段落:',
    '第1段 0:00-0:10 | 清晨 | 3 镜 | 出镜: 阿强',
    '  画面: 阿强推着小车出门',
    '第2段 0:10-0:30 | 午后小店 | 5镜 | 出镜: 小梅、阿强',
    '第3段 0:30–0:45｜收尾｜2 镜｜出镜：无',
  ].join('\n')
  const e = bc.parseBriefCast(edited)
  check('an edited brief still parses (| :, no ▍, - / • bullets, 服饰 / 动作 labels, role in brackets)', e.figureStyle === '绘本手绘' && e.cast.length === 2 && e.cast[0].name === '阿强' && e.cast[0].role === '快递员' && e.cast[0].costume.includes('#1E40AF') && e.cast[0].actions.join() === '搬箱子' && e.cast[1].name === '小梅' && e.cast[1].role === '店员', JSON.stringify(e.cast))
  check('…with its segments, times and casts', e.segments.length === 3 && e.segments[0].endSec === 10 && e.segments[1].cast.join() === '小梅,阿强' && e.segments[2].cast.length === 0 && e.segments[2].startSec === 30 && e.segments[0].picture.includes('小车'), JSON.stringify(e.segments.map((g) => [g.startSec, g.endSec, g.cast])))
  const old = bc.parseBriefCast('【作品标题】秋日咖啡馆\n【导演备注（仅供 AI 制作，不会出现在视频里）】\n温暖治愈的秋日咖啡馆宣传片，暖色调，节奏舒缓。')
  check('an older brief without these sections → empty lists (no guessing)', old.cast.length === 0 && old.segments.length === 0 && old.figureStyle === '')
  let threw = false
  try {
    bc.parseBriefCast(null)
    bc.parseBriefCast(undefined)
    bc.parseBriefCast('▍人物设定：\n·\n第x段\n第2段 ｜｜｜')
  } catch {
    threw = true
  }
  check('garbage never throws', !threw)
})

/* ---------------------------------------------------------------------------------- director: the cast */
await section('director cast', async () => {
  // the director forgot 老周, renamed 小李 and left most shots' cast empty
  const planShots = [
    { title: '先分清处境', narration: '一本书，一套方法', durationSec: 8, cast: [] },
    { title: '暴雨催单', narration: '暴雨夜，订单倒计时只剩三分钟', durationSec: 9, cast: [] },
    { title: '街口积水', narration: '雨越下越大', visualBlueprint: '空镜：雨夜街口的积水，霓虹倒影', durationSec: 9, cast: [] },
    { title: '车间', narration: '老周停下手中的扳手', durationSec: 18, cast: [] },
    { title: '小店', narration: '王姐对着账本叹气，小李在门口取餐', durationSec: 18, cast: ['wang'] },
    { title: '关系图', narration: '看清处境', visualBlueprint: '人群分层的关系图，节点连线生长', durationSec: 18, cast: [] },
    { title: '团结起来', narration: '三个人在晨光中并肩', durationSec: 10, cast: [] },
  ].map((s, i) => ({ id: `scene-${String(i + 1).padStart(2, '0')}`, layout: 'freeform-stage', visualBlueprint: s.visualBlueprint || `${s.title}的画面`, ...s }))
  const plan = { version: 'promo-plan/1', title: '读毛选解难题', cast: [{ id: 'rider', name: '小李', role: '骑手', figure: { outfit: 'uniform' } }, { id: 'wang', name: '王姐' }], shots: planShots }
  const seen = []
  const res = await ps.runSchemaDirectorWithDegradation({
    topic: '读毛选解难题',
    directorNotes: BRIEF_NOTES,
    genre: 'other',
    genreLabel: '理论学习卡点动画',
    style: 'documentary',
    scriptData: { title: '读毛选解难题', scenes: [] },
    assetsManifest: { items: [] },
    narrationMode: 'tts',
    pacingMode: 'calm',
    durationMode: 'custom',
    targetDurationSec: 90,
    callLlmChatFn: async (a) => (seen.push(a), { text: JSON.stringify(plan), finishReason: 'stop' }),
    transientRetryDelayMs: 0,
  })
  const sys = String(seen[0]?.system || '')
  const user = JSON.parse(String(seen[0]?.messages?.[0]?.content || '{}'))
  check('the director prompt binds the cast bible and asks every shot to list everyone it names', /人物设定以用户方案为准/.test(sys) && /外卖骑手小李/.test(sys) && /写到谁就画谁/.test(sys) && Array.isArray(user.castBible) && user.castBible[0].name === '外卖骑手小李' && user.castBible[0].look.includes('#F5B800'))
  const cast = res.plan.cast || []
  const by = (name) => cast.find((c) => c.name === name)
  check('plan.cast = the brief\'s people, names verbatim (the renamed one keeps its id), the forgotten one added', by('外卖骑手小李')?.id === 'rider' && by('王姐')?.id === 'wang' && Boolean(by('老周')) && cast.length === 3, cast.map((c) => `${c.id}=${c.name}`).join(' '))
  check('looks come from the brief (appearance + costume), the director\'s figure fields stay, the #hex fills a colour', by('外卖骑手小李').look.includes('黄色骑手服') && by('外卖骑手小李').look.includes('28 岁男性') && by('外卖骑手小李').figure.outfit === 'uniform' && by('老周').figure.colors?.top === '#2F5D8A' && by('王姐').figure.gender === 'female', JSON.stringify(by('老周')))
  const ids = res.plan.shots.map((s) => (s.castIds || []).join('+') || '-')
  const zhou = by('老周').id
  check('no-people opening (出镜：无人物) and a 空镜 shot show nobody', ids[0] === '-' && ids[2] === '-', ids.join(' | '))
  check('a shot that names nobody gets the 出镜 list of the brief segment it falls in', ids[1] === 'rider' && ids[6].split('+').sort().join() === ['rider', 'wang', zhou].sort().join(), ids.join(' | '))
  check('a shot whose copy names a person gets that person even when the director left the cast empty', ids[3] === zhou, ids.join(' | '))
  check('the director\'s list is kept and the names in the copy are added', ids[4] === 'wang+rider', ids.join(' | '))

  // densified sub-shots keep their parent's cast (90 s pure-music film from a 3-shot plan)
  const tiny = { version: 'promo-plan/1', title: '读毛选解难题', cast: plan.cast, shots: [
    { id: 'scene-01', title: '开篇', narration: '一本书，一套方法。分清处境，才能找到出路。', beatCount: 4, durationSec: 2.5, visualBlueprint: '书页翻开', cast: [] },
    { id: 'scene-02', title: '骑手', narration: '暴雨夜。订单倒计时。超时扣款。一单接一单。', beatCount: 4, durationSec: 2.5, visualBlueprint: '小李骑车穿过积水', cast: ['rider'] },
    { id: 'scene-03', title: '团结', narration: '处境相通，命运相连。团结起来，才有力量。', beatCount: 4, durationSec: 2.5, visualBlueprint: '三人并肩', cast: ['rider', 'wang'] },
  ] }
  const beats = []
  for (let i = 0, t = 0; t <= 96; i++, t += 60 / 96) beats.push({ time: Number(t.toFixed(4)), strong: i % 4 === 0, index: i })
  const dense = await ps.runSchemaDirectorWithDegradation({
    topic: '读毛选解难题', directorNotes: BRIEF_NOTES, genre: 'other', style: 'documentary',
    scriptData: { title: '读毛选解难题', narrationMode: 'subtitle-mv', scenes: [] }, assetsManifest: { items: [] },
    bgmMeta: { analyzed: true, bpm: 96, beatSec: 60 / 96, phaseSec: 0, durationSec: 96, beats },
    narrationMode: 'subtitle-mv', pacingMode: 'dynamic', durationMode: 'custom', targetDurationSec: 90,
    callLlmChatFn: async () => ({ text: JSON.stringify(tiny), finishReason: 'stop' }), transientRetryDelayMs: 0,
  })
  const riderSubs = dense.plan.shots.filter((s) => s.title === '骑手')
  const unitySubs = dense.plan.shots.filter((s) => s.title === '团结')
  check('densified sub-shots keep their parent\'s cast', dense.planCheck.densified && riderSubs.length >= 5 && riderSubs.every((s) => (s.castIds || []).includes('rider')) && unitySubs.every((s) => (s.castIds || []).includes('rider') && (s.castIds || []).includes('wang')), `${dense.plan.shots.length} shots, 骑手 × ${riderSubs.length}`)
})

/* ------------------------------------------------------------------------------------------ figure-kit */
await section('figure-kit cast', async () => {
  const cast = fk.normalizeCast([
    { id: '项羽', name: '项羽', aliases: ['你'], figure: { outfit: '铠甲' } },
    { name: '虞姬', rig: { gender: '女' } },
    { id: 'clerk', name: '店员', figure: { outfit: '围裙' } },
  ])
  check('the stored per-shot list (castIds) is read, not only `cast`', fk.castIdsForScene({ castIds: ['clerk'] }, cast).join() === 'clerk')
  check('director list ∪ every person the copy names (title / narration / subtitles / picture)', fk.castIdsForScene({ castIds: ['cast1'], narration: '虞姬起舞' }, cast).join() === 'cast1,cast2' && fk.castIdsForScene({ subChunks: ['店员递来咖啡'] }, cast).join() === 'clerk' && fk.castIdsForScene({ subtitleText: '虞姬回眸' }, cast).join() === 'cast2')
  check('a shot that says it shows nobody (空镜 / 字卡) keeps only the director\'s list', fk.castIdsForScene({ visualBlueprint: '空镜：乌江边的晨雾', narration: '项羽走了' }, cast).length === 0 && fk.castIdsForScene({ castIds: ['cast2'], visualBlueprint: '字卡：垓下之围', narration: '项羽被围' }, cast).join() === 'cast2' && fk.sceneSaysNoPeople({ visualBlueprint: '空镜' }) && !fk.sceneSaysNoPeople({ visualBlueprint: '项羽横戟' }))
  const script = { genre: 'history-theater', topic: '项羽生平', cast, scenes: [{ id: 's1', castIds: ['cast1'], visualBlueprint: '虞姬起舞' }, { id: 's2', visualBlueprint: '空镜：江面' }] }
  fk.enrichScenesForVisuals(script)
  check('the pipeline stores who each shot must show (ids and names) for the coder and 画面自检', script.scenes[0].castIds.join() === 'cast1,cast2' && script.scenes[0].castNames.join() === '项羽,虞姬' && !script.scenes[1].castIds && !script.scenes[1].castNames)
  const { planSceneTools } = await imp('packages/dsh-tool-media/scene-tool-plan.js')
  const { getVibeToolkitStatus } = await imp('packages/dsh-tool-media/vibe-toolkit-lib.js')
  const plan = planSceneTools({ scenes: [{ id: 'scene-01', title: '登场', visualBlueprint: '江边的战马', castIds: ['cast2'] }], cast, genre: 'history-theater', status: getVibeToolkitStatus() })
  check('the coder\'s per-shot cast follows the stored list even when the picture text names nobody', plan.perScene['scene-01'].cast.join() === 'cast2')
  const guide = fk.buildFigureKitCoderGuide({ cast, figureStyle: 'flat' })
  check('coder guide: every person in the shot\'s cast drawn clearly and recognisably, no stand-ins, no invented leads', guide.includes('必须出镜的人物') && guide.includes('清楚可辨的完整人物') && guide.includes('不能只用图标') && guide.includes('演员表以外的人只能做背景') && guide.includes('`cast2` = 虞姬'))
  const customGuide = fk.buildFigureKitCoderGuide({ cast, figureStyle: 'custom', figureStyleNote: 'Q版萌系' })
  check('…in a custom character style too; without a cast the line is absent', customGuide.includes('必须出镜的人物') && !fk.buildFigureKitCoderGuide({ figureStyle: 'flat' }).includes('必须出镜的人物'))
})

/* -------------------------------------------------------------------------------------- 画面自检 presence */
await section('visual review presence', async () => {
  const brief = bc.parseBriefCast(BRIEF_NOTES)
  const plan = { cast: [{ id: 'rider', name: '小李' }, { id: 'wang', name: '王姐' }], shots: [] }
  ps.applyBriefCastToPlan(plan, brief)
  const cast = plan.cast
  const scenes = [
    { id: 'scene-04', title: '小店', narration: '王姐对着账本叹气，小李在门口取餐', visualBlueprint: '街角小店', castIds: ['wang'] },
    { id: 'scene-05', title: '关系图', narration: '看清处境', visualBlueprint: '关系图，节点连线生长' },
  ]
  const frames = scenes.flatMap((s) => [0.35, 0.8].map((fraction) => ({ sceneId: s.id, fraction, base64: 'AAAA' })))
  const req = vr.buildVisualReviewRequest({ batchScenes: scenes, frames, genreLabel: '理论学习卡点动画', figureStyle: 'flat', cast })
  const texts = req.messages[0].content.filter((c) => c.type === 'text').map((c) => c.text)
  const s4 = texts.find((t) => t.startsWith('【scene-04】')) || ''
  const s5 = texts.find((t) => t.startsWith('【scene-05】')) || ''
  check('the review request lists each shot\'s cast with a short look', s4.includes('必须出镜：') && s4.includes('王姐（40 岁女性') && s4.includes('外卖骑手小李（28 岁男性') && !s5.includes('必须出镜'), s4.slice(0, 160))
  check('…and asks for a per-person visible verdict (kind cast = major)', /"visible":true/.test(req.system) && /kind 为 cast/.test(req.system) && /cast（分镜写明必须出镜的人物/.test(req.system))
  const plain = vr.buildVisualReviewRequest({ batchScenes: [scenes[1]], frames })
  check('a batch without people keeps the old request shape (no cast field asked)', !/"cast":\[/.test(plain.system) && !plain.messages[0].content.some((c) => c.type === 'text' && c.text.includes('必须出镜')))
  const byNames = vr.buildVisualReviewRequest({ batchScenes: [{ ...scenes[0], castIds: undefined, castNames: ['王姐', '外卖骑手小李'] }], frames })
  check('old callers (no cast passed) still get the names the pipeline stored on the scene', byNames.messages[0].content.some((c) => c.type === 'text' && c.text.includes('必须出镜：王姐、外卖骑手小李')))

  const reply = JSON.stringify({ scenes: [
    { id: 'scene-04', seen: '小店柜台前王姐在算账，门口没有人', severity: 'none', cast: [{ name: '王姐', visible: true, where: '柜台后' }, { name: '外卖骑手小李', visible: false, where: '门口空着' }], issues: [] },
    { id: 'scene-05', seen: '节点连线的关系图', severity: 'minor', issues: [{ kind: 'text', detail: '标题略贴边', fix: '内收 40px' }] },
  ] })
  const parsed = vr.parseVisualReview(reply, ['scene-04', 'scene-05'], { batchScenes: scenes, cast })
  const p4 = parsed.scenes['scene-04']
  check('a person marked not visible makes the shot a major problem (even if the reviewer said none)', parsed.looked && p4.severity === 'major' && p4.issues[0].kind === 'cast' && p4.cast.some((c) => c.name === '外卖骑手小李' && !c.visible), JSON.stringify(p4))
  check('…with a fix that says exactly who to draw and how (the look from the cast)', p4.issues[0].detail.includes('外卖骑手小李') && p4.issues[0].fix.includes('外卖骑手小李') && p4.issues[0].fix.includes('黄色骑手服') && p4.issues[0].fix.includes('不要用图标'), p4.issues[0].fix)
  check('other shots parse as before', parsed.scenes['scene-05'].severity === 'minor' && parsed.scenes['scene-05'].issues[0].kind === 'text' && !parsed.scenes['scene-05'].cast)
  const oldReply = JSON.stringify({ scenes: [{ id: 'scene-04', seen: '小店里两个人', severity: 'major', issues: [{ kind: 'figure', detail: '人物像纸片', fix: '重画' }, { kind: 'dark', detail: '偏暗', fix: '提亮' }, { kind: 'clutter', detail: 'a', fix: 'b' }, { kind: 'text', detail: 'c', fix: 'd' }, { kind: 'static', detail: 'e', fix: 'f' }] }] })
  const oldParsed = vr.parseVisualReview(oldReply, ['scene-04'])
  check('an old reply (no cast verdicts) and an old caller (two arguments) parse exactly as before', oldParsed.scenes['scene-04'].severity === 'major' && oldParsed.scenes['scene-04'].issues.length === 4 && oldParsed.scenes['scene-04'].issues[0].kind === 'figure' && !oldParsed.scenes['scene-04'].cast)
  const noOpts = vr.parseVisualReview(JSON.stringify({ scenes: [{ id: 'scene-04', seen: 'x', severity: 'none', cast: [{ name: '王姐', visible: 'no' }] }] }), ['scene-04'])
  check('without opts a reviewer\'s "no" still becomes a major cast problem (name only)', noOpts.scenes['scene-04'].severity === 'major' && noOpts.scenes['scene-04'].issues[0].fix.includes('王姐'))
  const stranger = vr.parseVisualReview(JSON.stringify({ scenes: [{ id: 'scene-04', seen: 'x', severity: 'none', cast: [{ name: '路人甲', visible: false }] }] }), ['scene-04'], { batchScenes: scenes, cast })
  check('a person the shot does not need is ignored', stranger.scenes['scene-04'].severity === 'none')

  const fix = vr.buildVisualFixRequest({ filePath: 'src/scenes/Batch02.tsx', exportName: 'BATCH_02_SCENES', code: '/* code */', batchScenes: scenes, review: parsed.scenes, frames, figureStyle: 'flat', cast })
  const task = JSON.parse(fix.messages[0].content[0].text)
  const prob = task.problems.find((x) => x.sceneId === 'scene-04')
  check('the rewrite request names everyone the shot must show and how to draw the missing person', prob?.mustShow?.some((m) => m.startsWith('外卖骑手小李：')) && prob.issues[0].kind === 'cast' && prob.issues[0].how.includes('黄色骑手服') && prob.issues[0].how.includes('扁平侧身插画'), JSON.stringify(prob))
  const summary = vr.summarizeVisualReview({ reviewedScenes: 2, frameCount: 4, majorScenes: 1, fixedScenes: 1, failedBatches: 0, scenes: parsed.scenes })
  check('the log summary names the missing-person problem in plain Chinese', summary.includes('指定人物没出镜'), summary)
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.name).join(' | ')}`)
  process.exit(1)
}
