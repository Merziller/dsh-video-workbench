#!/usr/bin/env node
/**
 * AI 润色 (polishTopicPrompt) — genre-adaptive prompt, structured brief, legacy replies (offline, no model, no render):
 *   - routing: a 毛选 / theory brief (历史唯物主义, 回顾历史, 外卖骑手…) is no history film and gets no battle vocabulary;
 *     a 霍去病 war-history brief still gets the war options; content families pick the right visual vocabulary
 *   - the system prompt and hints offer only the vocabulary of the brief's own content family (the catalogue lines are
 *     neutral, no library component names); the old hard-coded pure-music sentence (刀光斩击…) is gone
 *   - a structured reply (visual style, cast bible, segment plan) renders into the 【…】 brief: AI-only sections stay
 *     inside 【导演备注】 (splitDirectorBrief keeps them whole), every segment lists who must be visible (a person named
 *     in its picture is added), times are contiguous m:ss codes that fill the target length, stray character-look
 *     words and negated foreign vocabulary are neutralised so the downstream style / mode / duration readers agree
 *   - legacy replies still parse: the one-paragraph JSON renders exactly as before, free text, a 【…】 text reply,
 *     newline outlines, trailing commas, a reply cut off by the token limit
 *   - pure music + an uploaded BGM: genre-neutral rules with the measured tempo / drops; a TTS film's brief cannot flip
 *     the narration mode, beat-sync or (in free-duration mode) the target length through stray words
 *
 *   node scripts/tests/polish-prompt.test.mjs
 *
 * Scratch data only (<repo>/.tmp/polish-prompt-test/<stamp>, or $DSH_TEST_SCRATCH); network is blocked; every model
 * reply is a mocked `fetchImpl`; the real `.env` / DSH client are never read.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR_BASE = process.env.DSH_TEST_SCRATCH ? resolve(process.env.DSH_TEST_SCRATCH) : join(ROOT, '.tmp')
const SCR = join(SCR_BASE, 'polish-prompt-test', new Date().toISOString().replace(/[:.]/g, '-'))
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

const gr = await imp('packages/dsh-tool-media/genre-router.js')
const fk = await imp('packages/dsh-tool-media/figure-kit.js')
const shared = await imp('packages/shared/index.js')
const pb = await imp('packages/dsh-web-video-workbench/lib/polish-brief.js')
const { polishTopicPrompt } = await imp('packages/dsh-web-video-workbench/lib/index.js')

const LLM = { provider: 'openai', format: 'openai-completions', baseUrl: 'https://mock-polish.invalid/v1', apiKey: 'mock-key', model: 'mock-director' }
/** Run polishTopicPrompt against a canned reply; returns { res, system, user, maxTokens }. */
async function polish(body, replyContent) {
  let payload = null
  const fetchImpl = async (_url, init) => {
    payload = JSON.parse(init.body)
    const content = typeof replyContent === 'string' ? replyContent : JSON.stringify(replyContent)
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
  }
  const res = await polishTopicPrompt({ llmOverride: LLM, ...body }, { fetchImpl })
  return {
    res,
    system: payload?.messages?.find((m) => m.role === 'system')?.content || '',
    user: payload?.messages?.find((m) => m.role === 'user')?.content || '',
    maxTokens: payload?.max_tokens,
  }
}

// battle-epic vocabulary that must never be offered to a non-war brief (component names, effects, war props)
const WAR_VOCAB_RX = /SlashBurstOverlay|StrategicMapStage|CalligraphyColumnPanel|\bTroop\b|Horse|刀光|斩击|军阵|攻城|攻占|疆域|战鼓|兵器|战马|骑兵|铁骑|冲锋|烽烟|披风|盔缨|竹简|挥戟|策马/
// the two rule lines that name war elements and character looks only to forbid / explain them
const withoutRuleLines = (sys) =>
  sys
    .split('\n')
    .filter((l) => !/^5\. 铁律/.test(l) && !/^3\. 人物画风/.test(l))
    .join('\n')

// the 毛选 brief from the field report: theory + modern workers, pure music, uploaded BGM
const MAO_PROMPT = '读毛选解难题：用毛选第一卷《中国社会各阶级的分析》的方法，结合历史唯物主义，做外卖骑手、工厂工人、小店主的动画故事，纯音乐卡点，90秒'
const WAR_PROMPT = '霍去病封狼居胥，历史卡点动画，纯音乐，60秒'

const MAO_REPLY = {
  genre: 'other',
  genreLabel: '理论学习卡点动画',
  contentFamily: 'theory',
  displayTitle: '读毛选解难题·阶级矛盾',
  logline: '用《中国社会各阶级的分析》的方法，看懂普通劳动者的处境',
  tone: '沉稳真诚、温暖有力量',
  contentOutline: ['原著方法：先分清处境再找出路', '外卖骑手小李在暴雨中被系统催单', '工厂工人老周面临裁员', '小店主王姐被房租和电商挤压', '用阶级分析的方法看清处境', '团结与互助的力量'],
  visualStyle: {
    look: '扁平插画风格的现实场景与书页质感结合，构图干净，雨夜冷蓝转结尾暖金',
    palette: { 主色: '中国红 #C8102E', 纸张: '米白 #F4EBDD', 夜景: '深蓝 #1E2A44' },
    typography: '标题用衬线大字，字幕位于下方三分之一，关键词描红',
    figureStyle: '扁平插画',
    camera: '现实场景推近细节再拉远成概念图，结论缓推',
    transitions: ['翻书页', '匹配剪辑', '分屏滑入'],
    effects: ['关键词描红', '节点连线生长', '不要刀光斩击和军阵', '人物剪影逆光'],
    sfx: ['雨声', '电动车喇叭', '钟表滴答', '翻书'],
  },
  cast: [
    { name: '小李', role: '外卖骑手，主角', appearance: '28 岁男性，瘦高，短发，神情疲惫', costume: '黄色骑手服 #F5B800、头盔、透明雨衣', actions: ['看手机催单', '冒雨骑行'] },
    { name: '老周', role: '工厂工人', appearance: '50 岁男性，微胖，寸头', costume: '蓝色工装 #2F5D8A、安全帽', actions: ['拧螺丝', '看通知'] },
    { name: '王姐', role: '小店主', appearance: '40 岁女性，齐肩发', costume: '围裙 #8B5E3C', actions: ['算账', '锁门'] },
  ],
  segments: [
    { title: '开篇·原著书页', start: 0, end: 8, shots: 4, beats: 4, points: [1], cast: [], picture: '翻开的书页，方法论关键词逐字浮现', action: '书页翻动', camera: '缓推', transition: '翻书页', text: ['先分清处境'], sound: '翻书、钢琴单音' },
    { title: '困境一·暴雨中的骑手', start: 8, end: 26, shots: 8, beats: 4, points: [2], cast: ['外卖骑手'], picture: '暴雨夜的街口，小李骑车穿过积水，车把上的手机订单倒计时闪烁', action: '看手机、加速', camera: '跟拍后推近手机', transition: '匹配剪辑', text: ['超时扣钱'], sound: '雨声、钟表滴答' },
    { title: '困境二·车间', start: 26, end: 44, shots: 8, beats: 4, points: [3], cast: ['老周'], picture: '车间流水线，老周拧螺丝，通知贴在墙上', action: '停下手中扳手', camera: '横移', transition: '分屏滑入', text: ['裁员名单'], sound: '机器声' },
    { title: '困境三·小店', start: 44, end: 62, shots: 8, beats: 4, points: [4], cast: ['王姐'], picture: '街角小店，王姐对着账本叹气；小李在门口取餐', action: '算账、锁门', camera: '推近账本', transition: '光线转暗', text: ['房租又涨了'], sound: '计算器按键声' },
    { title: '方法·关系图', start: 62, end: 80, shots: 8, beats: 2, points: [5], cast: [], picture: '人群分层的关系图，节点连线生长', action: '连线点亮', camera: '拉远成全图', transition: '光线由暗转亮', text: ['看清处境'], sound: '钢琴渐强' },
    { title: '升华·团结', start: 80, end: 90, shots: 4, beats: 4, points: [6], cast: ['小李', '老周', '王姐'], picture: '三人在晨光中并肩', action: '相视而笑', camera: '缓慢拉远', transition: '淡出', text: ['团结起来'], sound: '弦乐收束' },
  ],
  music: '全程使用上传的 BGM，第 5 段落在高潮处，关键词随重拍连续出现',
  voiceStyle: '沉稳男声',
  notes: '结尾留白',
  suggestedStyle: 'documentary',
}

/** Fake project: an uploaded, analysed BGM (assets.json + script.json bgm), as autoBindUploadedAssets leaves it. */
function makeBgmProject(name) {
  const proj = join(dirs.ws, name)
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'assets.json'), JSON.stringify({ version: 1, items: [{ id: 'm1', type: 'audio', role: 'music', name: '开智小曲.mp3', originalName: '开智小曲.mp3', path: 'assets/music/开智小曲.mp3', durationSec: 141 }], notes: [] }))
  writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: name, scenes: [], bgm: { analyzed: true, bpm: 128, beatSec: 0.4688, durationSec: 141, drops: [42.5, { time: 78.3 }, 120.2] } }))
  return proj
}

/* ------------------------------------------------------------------------------------------- routing */
await section('routing', async () => {
  const maoTexts = [MAO_PROMPT, '外卖骑手在暴雨中被催单；工厂工人面临裁员；历史唯物主义告诉我们', '毛泽东选集 矛盾论 实践论 学习动画 回顾历史 打工人 职场']
  check('a theory / modern-life brief is not history (历史唯物主义, 回顾历史 with modern cues)', maoTexts.every((t) => !gr.isHistoricalContent(t)))
  check('…and never routes to the battle-epic genre', maoTexts.every((t) => gr.detectGenre(t) !== 'history-theater'), maoTexts.map((t) => gr.detectGenre(t)).join(','))
  check('history briefs are still history (dynasty, figure, two weak cues)', gr.isHistoricalContent('项羽乌江自刎') && gr.isHistoricalContent('讲讲宋朝的科举制度') && gr.isHistoricalContent('将军率铁骑攻城') && gr.detectGenre('项羽生平历史动画') === 'history-theater')
  check('set phrases and records are no history (古人云, 历史新高, 商业帝国)', !gr.isHistoricalContent('古人云学而时习之，学习方法分享') && !gr.isHistoricalContent('股价创历史新高') && !gr.isHistoricalContent('打造商业帝国的创业故事'))
  check('war content: a battle epic yes, a history lecture or a 职场 metaphor no', gr.isWarCombatContent(WAR_PROMPT) && gr.isWarCombatContent('项羽乌江自刎') && !gr.isWarCombatContent('讲讲宋朝的科举制度') && !gr.isWarCombatContent('职场如战场：新人生存指南') && !gr.isWarCombatContent(MAO_PROMPT))
  const fam = (t) => gr.detectContentFamily(t)
  check('content families: theory / war epic / history lecture / food / science / product / music', fam(MAO_PROMPT) === 'theory' && fam(WAR_PROMPT) === 'war-epic' && fam('讲讲宋朝的科举制度 历史讲解') === 'history-lecture' && fam('番茄炒蛋的家常做法教程') === 'food' && fam('量子计算科普讲解') === 'science' && fam('社区咖啡馆秋季新品宣传片') === 'product' && fam('夏日海边恋爱 MV') === 'music', [MAO_PROMPT, WAR_PROMPT].map(fam).join(','))
  const catalogue = `${gr.listGenresForPrompt()}\n${gr.listContentFamiliesForPrompt()}`
  check('genre / family catalogues are neutral one-liners (no component names, no battle effects)', !WAR_VOCAB_RX.test(catalogue), (catalogue.match(WAR_VOCAB_RX) || [])[0])
  check('only the war-epic family guide carries battle vocabulary', WAR_VOCAB_RX.test(gr.buildContentFamilyGuide('war-epic')) && ['theory', 'knowledge', 'science', 'history-lecture', 'story', 'product', 'food', 'tutorial', 'music', 'general'].every((id) => !WAR_VOCAB_RX.test(gr.buildContentFamilyGuide(id, { beatSync: true }))))
  check('the beat line of a family guide only appears for beat-synced films', gr.buildContentFamilyGuide('theory', { beatSync: true }).includes('卡点') && !gr.buildContentFamilyGuide('theory').includes('卡点'))
})

/* ------------------------------------------------------------------------------------------- prompts */
await section('genre-adaptive prompts', async () => {
  const proj = makeBgmProject('mao-bgm')
  const mao = await polish({ rawPrompt: MAO_PROMPT, projectDir: proj, durationMode: 'custom', targetDurationSec: 90 }, MAO_REPLY)
  const sys = mao.system
  check('毛选 brief: theory family guessed, no history-theater / MV genre guess', /内容大类「理论学习/.test(sys) && /体裁 id「other」/.test(sys) && !/"guessedGenre":"history-theater"/.test(mao.user))
  check('毛选 brief: no battle vocabulary is offered anywhere in the system prompt (rule lines aside)', !WAR_VOCAB_RX.test(withoutRuleLines(sys)), (withoutRuleLines(sys).match(WAR_VOCAB_RX) || [])[0])
  check('毛选 brief: the hints (user message) carry no battle vocabulary either', !WAR_VOCAB_RX.test(mao.user))
  check('the cross-genre rule is stated (war elements only for war content)', /^5\. 铁律/m.test(sys) && /理论、知识、科普、产品、美食、生活类作品一律不用/.test(sys))
  check('the prompt asks for a cast bible, per-segment cast and a timed segment plan', ['"cast": [{ "name"', '"segments": [{', '"start": 0', 'figureStyle', '"points"'].every((k) => sys.includes(k)) && /点名的人物，必须写进该段 cast/.test(sys))
  check('the shot plan matches the director: 31~44 shots for 90 s of pure music, segments 5~11', sys.includes('全片约 31~44 个镜头') && sys.includes('分成 5~11 段'), (sys.match(/全片约 [^\n]*/) || [])[0])
  check('the pacing line uses a neutral name (no 历史史诗 example from the profile label)', /剪辑节奏「高密度快节奏」/.test(sys) && !sys.includes('历史史诗'))
  check('max tokens are sized for the richer brief', mao.maxTokens >= 12000, String(mao.maxTokens))
  const src = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'index.js'), 'utf8')
  const fnSrc = src.slice(src.indexOf('export async function polishTopicPrompt'), src.indexOf('function resolveAssetAbsPath'))
  // 600 s, written out or through the configurable model timeout (DSH_LLM_TIMEOUT_MS, default 600 s)
  const llmClient = await imp('packages/dsh-tool-media/llm-client.js')
  const keeps600 = fnSrc.includes('timeoutMs: 600_000') || (fnSrc.includes('timeoutMs: getLlmTimeoutMs()') && llmClient.DEFAULT_LLM_TIMEOUT_MS === 600_000)
  check('the 600 s polish timeout is kept and the old hard-coded war sentence is gone', keeps600 && !src.includes('刀光斩击特效') && !src.includes('动画人物剪影/动作'))

  // a reference film (or plaza template) analysed as a history epic lends its rhythm, not its war subject
  const refProj = join(dirs.ws, 'mao-ref')
  mkdirSync(refProj, { recursive: true })
  writeFileSync(join(refProj, 'script.json'), JSON.stringify({ title: 'ref', scenes: [], referenceStyle: { sourceName: 'epic.mp4', genre: 'history-theater', narrationMode: 'subtitle-mv', shotCount: 40, bpm: 120, durationSec: 90, pacingSignature: { recommendedPacingMode: 'dynamic', targetShotCount: 40 }, replicationPrompt: '严格复刻参考视频的视觉与节奏基因：高燃快切，闪白与冲击波扩散环，关键词高亮大字。' } }))
  const ref = await polish({ rawPrompt: MAO_PROMPT, projectDir: refProj }, MAO_REPLY)
  check('a history-epic reference does not turn a theory brief into a battle epic (rhythm kept, subject translated)', /"guessedGenre":"other"/.test(ref.user) && /内容大类「理论学习/.test(ref.system) && ref.system.includes('已挂载参考视频「epic.mp4」') && ref.system.includes('本片不是战争题材时不要照搬') && ref.res.suggestedPacingMode === 'dynamic')

  const war = await polish({ rawPrompt: WAR_PROMPT, durationMode: 'custom', targetDurationSec: 60 }, { ...MAO_REPLY, genre: 'history-theater', genreLabel: '历史战役卡点动画', contentFamily: 'war-epic', displayTitle: '封狼居胥', contentOutline: ['霍去病率轻骑出征', '漠北决战', '封狼居胥'], cast: [{ name: '霍去病', role: '主角', appearance: '少年将军', costume: '铠甲红披风', actions: ['策马冲锋'] }], segments: [{ title: '出征', start: 0, end: 60, shots: 24, beats: 2, cast: ['霍去病'], picture: '霍去病策马冲锋，军阵推进', action: '挥兵器', camera: '跟拍', transition: '斜劈', text: ['封狼居胥'], sound: '战鼓、马蹄' }], visualStyle: { ...MAO_REPLY.visualStyle, figureStyle: '剪影', effects: ['兵器相交处的刀光'] } })
  check('霍去病 brief: war family and history-theater guess, war vocabulary offered', /内容大类「战争史诗/.test(war.system) && /体裁 id「history-theater」/.test(war.system) && /战马与军阵/.test(war.system) && /战鼓/.test(war.system))
  check('霍去病 brief: the war genre and its vocabulary survive rendering', war.res.genre === 'history-theater' && /军阵推进/.test(war.res.directorNotes) && /▍人物画风：剪影/.test(war.res.directorNotes) && war.res.suggestedFigureStyle === 'silhouette')
})

/* ------------------------------------------------------------------------------------------- structured reply */
await section('structured brief rendering', async () => {
  const proj = makeBgmProject('mao-render')
  const { res } = await polish({ rawPrompt: MAO_PROMPT, projectDir: proj, durationMode: 'custom', targetDurationSec: 90 }, MAO_REPLY)
  const topic = res.polishedTopic
  const order = ['【作品标题】', '【体裁】', '【目标时长】90 秒', '【一句话】', '【内容要点】', '【导演备注（仅供 AI 制作，不会出现在视频里）】'].map((k) => topic.indexOf(k))
  check('brief sections in order, 导演备注 last', order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1])), JSON.stringify(order))
  const notes = res.directorNotes
  check('AI-only sections stay inside 导演备注 (no 【 inside the notes)', !notes.includes('【') && topic.endsWith(notes))
  const split = shared.splitDirectorBrief({ topic, directorNotes: res.directorNotes, contentOutline: res.contentOutline })
  check('splitDirectorBrief keeps title, outline and the whole notes (no duplicate)', split.displayTitle === '读毛选解难题·阶级矛盾' && split.contentOutline.length === 6 && split.directorNotes === notes && split.genreLabel === '理论学习卡点动画')
  check('the audience-facing outline is untouched by the notes clean-up', JSON.stringify(res.contentOutline) === JSON.stringify(MAO_REPLY.contentOutline))
  check('notes carry the look, palette (keys kept), type, character style, cast bible and segment plan', ['▍画面风格：', '▍色彩：主色：中国红 #C8102E', '▍字体与字幕：', '▍人物画风：扁平插画（全片统一）', '▍人物设定', '· 小李｜外卖骑手，主角：', '▍分镜段落（共 6 段，约 40 镜', '配音取向：无旁白（纯音乐卡点）'].every((k) => notes.includes(k)))
  check('the first ~900 characters (what the scene coder reads) hold the look and the character style', notes.slice(0, 900).includes('▍人物画风：扁平插画') && notes.slice(0, 900).includes('▍特效：'))
  const plan = res.shotPlan
  const contiguous = plan.every((s, i) => s.startSec === (i === 0 ? 0 : plan[i - 1].endSec) && s.endSec > s.startSec)
  check('segment times are contiguous and fill the 90 s target', contiguous && plan[plan.length - 1].endSec === 90, plan.map((s) => `${s.startSec}-${s.endSec}`).join(' '))
  check('time codes are m:ss (never "XX 秒" a duration parser could pick up)', /第2段 0:08–0:26/.test(notes) && /第6段 1:20–1:30/.test(notes))
  check('per-segment cast: a role maps to the cast name, a person named in the picture is added', plan[1].cast.join() === '小李' && plan[3].cast.join() === '王姐,小李' && plan[0].cast.length === 0 && plan[5].cast.length === 3 && /出镜：王姐、小李/.test(notes) && /出镜：无人物/.test(notes))
  check('beats per shot are kept for the beat-synced film', plan[0].beats === 4 && plan[4].beats === 2 && /8 镜 · 每镜 2 拍/.test(notes))
  check('the cast bible is returned for later structured use', res.castBible.map((c) => c.name).join() === '小李,老周,王姐' && res.castBible[0].costume.includes('#F5B800'))
  check('a negated foreign clause is dropped, a stray 剪影 is neutralised', !/刀光|军阵|斩击/.test(notes) && !notes.includes('剪影') && notes.includes('暗色轮廓'))
  check('downstream reads the intended character look from the whole brief (flat)', res.suggestedFigureStyle === 'flat' && fk.inferFigureStyle({ genre: res.genre, userText: topic, text: `${res.genreLabel} ${notes}` }) === 'flat')
  check('the brief stays within the studio notes box', notes.length <= pb.MAX_POLISHED_NOTES_CHARS)
  check('the brief re-saves unchanged (formatDirectorBrief keeps a marked brief as it is)', shared.formatDirectorBrief({ goal: topic, directorNotes: notes, contentOutline: res.contentOutline }) === topic)
  check('pure-music suggestions are returned', res.suggestedNarrationMode === 'subtitle-mv' && res.suggestedPacingMode === 'dynamic' && res.durationMode === 'custom' && res.targetDurationSec === 90)

  // the model insists on the battle genre for a theory brief → the open genre with a label that does not map back
  const insist = await polish({ rawPrompt: MAO_PROMPT, durationMode: 'custom', targetDurationSec: 90 }, { ...MAO_REPLY, genre: 'history-theater', genreLabel: '' })
  const sel = gr.resolveGenreSelection({ genre: insist.res.genre, genreLabel: insist.res.genreLabel })
  check('a battle genre picked for non-war content falls back to the open genre (and stays there downstream)', insist.res.genre === 'other' && sel.id === 'other' && !gr.isEpicCombatContext({ genre: sel.id, text: insist.res.polishedTopic }), `${insist.res.genre} / ${insist.res.genreLabel} / ${sel.id}`)

  // a long plan is shortened field by field to fit, never by dropping segments
  const long = await polish({ rawPrompt: MAO_PROMPT, durationMode: 'custom', targetDurationSec: 300 }, { ...MAO_REPLY, segments: Array.from({ length: 30 }, (_, i) => ({ ...MAO_REPLY.segments[i % 6], start: i * 10, end: i * 10 + 10, picture: `${MAO_REPLY.segments[i % 6].picture}，${'画面细节描写'.repeat(30)}` })) })
  check('a 30-segment plan fits the notes box with every segment kept', long.res.directorNotes.length <= pb.MAX_POLISHED_NOTES_CHARS && long.res.shotPlan.length === 30 && long.res.directorNotes.includes('第30段') && long.maxTokens === 16000, `${long.res.directorNotes.length} chars`)
})

/* ------------------------------------------------------------------------------------------- legacy replies */
await section('legacy reply shapes', async () => {
  // the pre-structure JSON (self-test 17): exactly the old brief layout
  const old = await polish({ rawPrompt: '制作一部深海热液生物纪录动画，风格像透明玻璃解剖图鉴', style: 'cinematic' }, {
    genre: 'deepsea-glass-atlas',
    genreLabel: '深海透明解剖图鉴动画',
    displayTitle: '幽渊之灯',
    logline: '以透明玻璃剖面呈现深海热液生命奇迹',
    contentOutline: ['400℃ 黑烟囱涌泉', '盲虾集群趋光迁徙'],
    directorNotes: '采用玻璃半透剖面、青金光散射粒子与慢推镜。',
    voiceStyle: '沉静带敬畏感的自然纪录片旁白',
    suggestedStyle: 'cinematic',
  })
  const expected = ['【作品标题】幽渊之灯', '【体裁】深海透明解剖图鉴动画', '【一句话】以透明玻璃剖面呈现深海热液生命奇迹', '【内容要点】', '1. 400℃ 黑烟囱涌泉', '2. 盲虾集群趋光迁徙', '【导演备注（仅供 AI 制作，不会出现在视频里）】', '采用玻璃半透剖面、青金光散射粒子与慢推镜。', '配音取向：沉静带敬畏感的自然纪录片旁白'].join('\n')
  check('old one-paragraph JSON renders exactly the old brief', old.res.polishedTopic === expected, old.res.polishedTopic)
  check('old JSON: custom genre pass-through and fields as before', old.res.genre === 'other' && old.res.genreLabel === '深海透明解剖图鉴动画' && old.res.directorNotes === '采用玻璃半透剖面、青金光散射粒子与慢推镜。\n配音取向：沉静带敬畏感的自然纪录片旁白' && old.res.contentOutline.length === 2 && old.res.voiceStyle === '沉静带敬畏感的自然纪录片旁白' && old.res.castBible.length === 0)

  const free = await polish({ rawPrompt: '介绍我的开源视频插件，开源地址 https://github.com/example/video-plugin', style: 'tech' }, '```\n开场3秒以工作台痛点切入，中段分段展示素材分析与双引擎渲染，收尾锁定开源仓库 https://github.com/example/video-plugin 并号召Star。\n```')
  check('free text: kept as director notes, URL kept, no fences', free.res.ok && free.res.polishedTopic.includes('https://github.com/example/video-plugin') && !free.res.polishedTopic.includes('```') && /【作品标题】[^\n]+\n【体裁】[^\n]+\n【导演备注/.test(free.res.polishedTopic) && free.res.polishedTopic.endsWith(free.res.directorNotes))

  const marked = await polish({ rawPrompt: '社区咖啡馆秋季新品宣传片' }, '【作品标题】秋日咖啡馆\n【内容要点】\n1. 桂花拿铁特写\n2. 门店地址\n【导演备注】暖色调，慢推镜头，配轻爵士乐')
  check('a 【…】 text reply is re-read section by section (outline kept, notes not cut)', marked.res.displayTitle === '秋日咖啡馆' && marked.res.contentOutline.length === 2 && marked.res.directorNotes.includes('轻爵士乐') && !marked.res.directorNotes.includes('【'))

  const strOutline = await polish({ rawPrompt: '量子计算科普讲解' }, { genre: 'science-explainer', displayTitle: '量子计算入门', contentOutline: '1. 比特与量子比特\n2. 叠加态\n3. 量子纠缠', directorNotes: '深蓝底，粒子流示意。' })
  check('a newline outline string is split into points', JSON.stringify(strOutline.res.contentOutline) === JSON.stringify(['比特与量子比特', '叠加态', '量子纠缠']))

  const trailing = await polish({ rawPrompt: '量子计算科普讲解' }, '{ "genre": "science-explainer", "displayTitle": "量子计算入门", "contentOutline": ["叠加态", "纠缠",], "directorNotes": "深蓝底。", }')
  check('a reply with trailing commas still parses as JSON', trailing.res.displayTitle === '量子计算入门' && trailing.res.contentOutline.length === 2)

  const full = JSON.stringify(MAO_REPLY)
  const cut = full.slice(0, full.indexOf('"title":"困境三'))
  const truncated = await polish({ rawPrompt: MAO_PROMPT, durationMode: 'custom', targetDurationSec: 90 }, cut)
  check('a reply cut off by the token limit keeps its complete part', truncated.res.truncated === true && truncated.res.castBible.length === 3 && truncated.res.shotPlan.length >= 3 && truncated.res.polishedTopic.includes('【导演备注') && truncated.res.shotPlan[truncated.res.shotPlan.length - 1].endSec === 90, `${truncated.res.shotPlan.length} segments`)
  check('repairTruncatedJson closes open arrays and objects', JSON.stringify(JSON.parse(pb.repairTruncatedJson('{"a":1,"b":[{"c":2},{"d":'))) === '{"a":1,"b":[{"c":2}]}' && pb.repairTruncatedJson('no json') === null)
})

/* ------------------------------------------------------------------------------------------- music & mode safety */
await section('BGM rules and mode safety', async () => {
  const proj = makeBgmProject('bgm-rules')
  const mao = await polish({ rawPrompt: MAO_PROMPT, projectDir: proj, durationMode: 'custom', targetDurationSec: 90 }, MAO_REPLY)
  const bgmLines = mao.system.split('\n').filter((l) => /BGM|背景音乐|配乐|BPM/.test(l)).join('\n')
  check('pure music + uploaded BGM: the measured tempo, the drops inside the film and the file are named', bgmLines.includes('128 BPM（上传 BGM 实测）') && bgmLines.includes('0:43') && bgmLines.includes('1:18') && !bgmLines.includes('2:00') && bgmLines.includes('开智小曲.mp3 (141s)') && bgmLines.includes('全程使用它'), bgmLines)
  check('pure music + uploaded BGM: the music rules are genre-neutral (no blades, silhouettes or war drums)', !WAR_VOCAB_RX.test(bgmLines) && !/剪影|打击音效|高燃/.test(bgmLines))
  check('pure music: no narration voice is asked for, the hints carry the real beat grid', /voiceStyle 写「无旁白」/.test(mao.system) && /"beatGrid":\{"bpm":128,"measured":true/.test(mao.user) && /"drops":\["0:43","1:18","2:00"\]/.test(mao.user))

  // a TTS product film in free-duration mode: stray words must not flip the mode or set the length
  const tts = await polish({ rawPrompt: '社区咖啡馆秋季新品宣传片，突出桂花拿铁' }, {
    genre: 'product-promo',
    genreLabel: '门店新品宣传片',
    displayTitle: '秋日桂花拿铁',
    contentOutline: ['桂花拿铁上新', '门店地址'],
    visualStyle: { look: '暖色柔光', figureStyle: '写实插画', effects: ['热气升腾'], sfx: ['咖啡机蒸汽声'] },
    cast: [{ name: '店长小林', role: '咖啡师', appearance: '短发', costume: '围裙', actions: ['拉花'] }],
    segments: [{ title: '开场', start: 0, end: 30, shots: 6, cast: ['店长小林'], picture: '店长小林拉花', text: ['秋日限定'], sound: '蒸汽声' }],
    music: '轻爵士乐，副歌处卡点切镜，片尾 15 秒无旁白，纯音乐收尾',
    voiceStyle: '亲切女声',
  })
  const n = tts.res.directorNotes
  const pureRx = /(?:纯音乐|免配音|无配音|无旁白|不要配音|不用配音|去掉配音|无需配音|纯卡点|卡点\s*MV|无解说|免\s*TTS)/i
  const beatRx = /(?:踩死|踩准|踩拍|踩点|卡点|卡拍|高潮突降|主高潮|突降|重拍|切镜|同步节拍|节拍同步|beat[- ]?sync)/i
  check('TTS film: the brief cannot switch the pipeline to pure music or beat-sync', !pureRx.test(tts.res.polishedTopic) && !beatRx.test(tts.res.polishedTopic) && n.includes('旁白留白') && n.includes('仅配乐'), n.split('\n').find((l) => l.startsWith('▍配乐')))
  check('TTS film in free-duration mode: no duration phrase for the pipeline to lock', shared.parseDurationFromText(tts.res.polishedTopic) === null && n.includes('15″') && tts.res.durationMode === 'auto')
  check('TTS film: no beat line or beat field in the prompt, the narration budget is', !/配乐速度 \d+ BPM/.test(tts.system) && !tts.system.includes('"beats": 4') && /有 TTS 旁白：全片旁白约 \d+~\d+ 字/.test(tts.system))
  check('TTS film: a custom character look (写实插画) is read downstream as such', tts.res.suggestedFigureStyle === 'custom' && tts.res.suggestedFigureStyleNote === '写实插画' && fk.inferFigureStyle({ genre: tts.res.genre, userText: tts.res.polishedTopic }) === 'custom' && fk.inferFigureStyleNote(tts.res.polishedTopic) === '写实插画')

  // the guards on their own
  check('defuseModeTriggers keeps the words of the chosen mode', pb.defuseModeTriggers('纯音乐卡点', { pureMusic: true }) === '纯音乐卡点' && pb.defuseModeTriggers('卡点切镜', { beatSync: true }) === '卡点切镜' && pb.defuseModeTriggers('卡点切镜') === '跟随节奏换镜')
  check('defuseDurationPhrases rewrites seconds, minutes and m分s秒', pb.defuseDurationPhrases('前 15 秒、2 分钟、1分30秒、3分半') === '前 15″、2′、1′30″、3′30″')
  check('dropNegatedForeignClauses drops only negated foreign clauses', pb.dropNegatedForeignClauses('暖色调，不要刀光斩击，避免整屏闪烁') === '暖色调，避免整屏闪烁')
  const flat = pb.neutralizeStrayStyleWords('剪影楼群，水墨晕开，卡通贴纸', { style: 'flat', note: '' })
  check('neutralizeStrayStyleWords: other kit looks are rephrased, the intended one is untouched', !/剪影|水墨/.test(flat) && flat.includes('卡通') && pb.neutralizeStrayStyleWords('扁平人物', { style: 'flat' }) === '扁平人物' && pb.neutralizeStrayStyleWords('剪影', { style: 'auto' }) === '剪影')
  const q = pb.neutralizeStrayStyleWords('动漫光效，剪纸窗花，写实插画质感', { style: 'custom', note: 'Q版萌系' })
  check('neutralizeStrayStyleWords: a custom look removes kit words and other custom looks', !/动漫|剪纸|窗花|写实插画/.test(q) && fk.inferFigureStyle({ userText: `人物画风：Q版萌系 ${q}` }) === 'custom' && fk.inferFigureStyleNote(`人物画风：Q版萌系 ${q}`) === 'Q版萌系')
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.name).join(' | ')}`)
  process.exit(1)
}
