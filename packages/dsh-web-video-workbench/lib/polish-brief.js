/**
 * AI 润色 (topic polish) — prompt and reply helpers for `polishTopicPrompt` (lib/index.js).
 *
 * The polished brief is read by the AI director (plan-schema), the scene coder (shotcraft-lib) and the visual
 * self-review; only 【作品标题】 and 【内容要点】 ever reach the audience. Rules that keep it that way:
 *   - every AI-only section lives inside 【导演备注…】 (sub-headed with ▍, never with 【】), so `splitDirectorBrief` and
 *     everything else that parses the brief keeps working unchanged;
 *   - the visual vocabulary comes from the content family of the brief (genre-router CONTENT_FAMILIES), so a theory
 *     lesson never inherits the battle-epic effects of another genre;
 *   - a cast bible plus a time-coded segment plan name every person who must be visible in each segment;
 *   - downstream stages read the brief with keyword rules (人物画风, 纯音乐 / 卡点, duration phrases) that ignore
 *     negation: words the model did not mean as a choice are neutralised before the brief is shown.
 */
import {
  buildContentFamilyGuide,
  CONTENT_FAMILIES,
  detectContentFamily,
  detectGenre,
  GENRE_PROFILES,
  getContentFamily,
  getGenreProfile,
  isHistoricalContent,
  isWarCombatContent,
  listContentFamiliesForPrompt,
  listGenresForPrompt,
} from '../../dsh-tool-media/genre-router.js'
import { inferFigureStyle, inferFigureStyleNote } from '../../dsh-tool-media/figure-kit.js'
import { extractJsonFromLlmText } from '../../dsh-tool-media/llm-client.js'
import { resolvePacingProfile } from '../../dsh-tool-media/plan-schema.js'
import {
  deriveDisplayTitle,
  formatDurationLabel,
  isMetaInstructionText,
  resolveTargetDurationPolicy,
  splitDirectorBrief,
} from '../../shared/index.js'

export const POLISH_NOTES_HEADER = '【导演备注（仅供 AI 制作，不会出现在视频里）】'
// the studio's director-notes box holds 8000 characters: the brief stays below that with room for edits
export const MAX_POLISHED_NOTES_CHARS = 7600
const BEAT_STEPS = [0.5, 1, 2, 4, 8]

/* ------------------------------------------------------------------------------------------ small text helpers */

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
/** Plain text of any reply value (objects and arrays are flattened), single line, 【】 replaced by 「」. */
function textOf(v) {
  if (v === undefined || v === null) return ''
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join('、')
  if (isObj(v)) return Object.values(v).map(textOf).filter(Boolean).join('；')
  return String(v)
    .replace(/【/g, '「')
    .replace(/】/g, '」')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
/** Short list from an array or a delimited string. */
function listOf(v, max = 12) {
  const items = Array.isArray(v) ? v.map(textOf) : textOf(v).split(/[、，,；;\n]+/)
  const out = []
  for (const it of items.map((x) => x.trim()).filter(Boolean)) if (!out.includes(it)) out.push(it)
  return out.slice(0, max)
}
const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** m:ss (never "XX 秒": the duration parser of the pipeline would read a time code as the film's target length). */
export function formatClock(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------------------------------------ keyword-safety guards */

// Negated clauses naming another genre's signature elements or a character look: downstream keyword rules ignore the
// negation ("不要刀光斩击" reads as 刀光斩击), so such clauses are dropped — the positive lists carry the intent.
const NEGATION_RX = /不要|不用|不使用|不得|不出现|不能|不可|不加|禁止|严禁|避免|切勿|勿用|无需|不需要|别用|拒绝|杜绝|去掉|去除/
const FOREIGN_VOCAB_RX =
  /刀光|斩击|劈砍|兵器|兵刃|刀剑|战鼓|军阵|军队|大军|战马|骑兵|攻城|攻占|战场|厮杀|冲锋|铁骑|烽烟|竹简|盔甲|铠甲|史诗|战争|武打|剪影|剪纸|皮影|水墨|写意|国画|火柴人|扁平|q版|萌系|动漫|二次元|绘本|像素|黏土|粘土|卡通|漫画|写实/i
export function dropNegatedForeignClauses(text) {
  const s = String(text || '')
  if (!NEGATION_RX.test(s)) return s
  const parts = s.split(/(?<=[，。；;！!？?,])/)
  return parts
    .filter((p) => !(NEGATION_RX.test(p) && FOREIGN_VOCAB_RX.test(p)))
    .join('')
    .replace(/^[，。；;,\s]+/, '')
    .replace(/[，；;,\s]+$/, '')
    .trim()
}

// The film's character look is read from the brief by keyword (figure-kit KIT_STYLE_CUES first, in a fixed order, then
// CUSTOM_STYLE_CUES): one stray 剪影 / 水墨 / 卡通 elsewhere in the notes overrides the 人物画风 line. These groups
// mirror those cue lists; words of the other looks are replaced by neutral wording outside the 人物画风 line.
const KIT_STYLE_WORDS = {
  puppet: [[/皮影/g, '彩色戏偶'], [/影戏/g, '偶戏'], [/shadow puppet/gi, 'puppet theatre']],
  papercut: [[/剪纸/g, '纸艺镂空'], [/窗花/g, '镂空花纹'], [/paper-?cut/gi, 'paper craft']],
  ink: [[/水墨/g, '墨色'], [/写意/g, '意境'], [/国画/g, '中式绘画'], [/ink wash/gi, 'ink tone']],
  stick: [[/火柴人/g, '线条小人'], [/简笔小人/g, '线条小人'], [/stick ?man|stick figure/gi, 'line figure']],
  silhouette: [[/逆光轮廓/g, '逆光勾边'], [/剪影/g, '暗色轮廓'], [/silhouette/gi, 'dark outline']],
  flat: [[/扁平/g, '平面化'], [/flat illustration/gi, 'plain illustration'], [/\bmbe\b/gi, 'outline icon']],
}
const CUSTOM_STYLE_WORDS = {
  Q版萌系: [[/q版/gi, '大头比例'], [/萌系/g, '可爱风'], [/大头娃娃/g, '大头比例'], [/chibi/gi, 'big-head']],
  日系动漫: [[/二次元/g, '动画感'], [/动漫/g, '动画'], [/日漫/g, '日式动画'], [/\banime\b/gi, 'animation']],
  美式卡通: [[/美式卡通/g, '美式画风'], [/美漫/g, '美式画风']],
  绘本手绘: [[/手绘(?:风|画风|动画|人物|插画)/g, '手工描绘'], [/蜡笔(?:画|风)/g, '蜡笔质感'], [/水彩(?:风|画|插画)/g, '水彩质感'], [/绘本/g, '图画书']],
  年画: [[/年画/g, '民俗画']],
  像素风: [[/像素(?:风|画|游戏)/g, '像素质感'], [/pixel art/gi, 'pixel look']],
  低多边形: [[/低多边形/g, '多面体造型'], [/low.?poly/gi, 'faceted']],
  黏土定格: [[/定格动画/g, '逐帧质感'], [/[黏粘]土/g, '泥塑'], [/claymation/gi, 'stop motion']],
  三维卡通: [[/三维卡通|3d\s*卡通/gi, '三维造型'], [/c4d/gi, '三维软件']],
  国风插画: [[/国风插画/g, '中式插图'], [/工笔/g, '细线描'], [/国潮/g, '中式潮流']],
  写实插画: [[/写实(?:风|画风|人物|插画)/g, '真实质感'], [/realistic/gi, 'lifelike']],
  漫画: [[/漫画/g, '图格'], [/\bmanga\b/gi, 'panel'], [/\bcomic/gi, 'panel']],
  卡通: [[/卡通/g, '动画'], [/cartoon/gi, 'animated']],
}
// the custom groups in the order figure-kit checks them (longer, earlier labels first)
const CUSTOM_ORDER = ['Q版萌系', '日系动漫', '美式卡通', '绘本手绘', '年画', '像素风', '低多边形', '黏土定格', '三维卡通', '国风插画', '写实插画', '漫画', '卡通']

/**
 * The character look a 人物画风 text names, as the downstream stages will read it ({ style: 'auto' } when it names
 * none). The placeholder genre keeps figure-kit's genre defaults (history → silhouette) out: only words count here.
 */
export function intendedFigureStyle(figureStyleText) {
  const t = String(figureStyleText || '')
  if (!t.trim()) return { style: 'auto', note: '' }
  const style = inferFigureStyle({ userText: t, genre: 'named-look-only' })
  return { style, note: style === 'custom' ? inferFigureStyleNote(t) : '' }
}

/** Replace character-look words that would override the intended look (no-op when the look is unknown). */
export function neutralizeStrayStyleWords(text, intended = { style: 'auto', note: '' }) {
  let s = String(text || '')
  const style = intended?.style || 'auto'
  if (!s || style === 'auto') return s
  for (const [kit, pairs] of Object.entries(KIT_STYLE_WORDS)) {
    if (kit === style) continue
    for (const [rx, rep] of pairs) s = s.replace(rx, rep)
  }
  if (style === 'custom') {
    for (const label of CUSTOM_ORDER) {
      if (label === intended.note) continue
      for (const [rx, rep] of CUSTOM_STYLE_WORDS[label]) s = s.replace(rx, rep)
    }
  }
  return s
}

// The pipeline switches to pure-music (免 TTS) or beat-sync editing when such words appear anywhere in the brief
// (pipeline-orchestrator wantsPureMusicByPrompt / wantsBeatSyncByPrompt). In a film without that mode the words are
// rephrased so a remark such as "片尾 3 秒无旁白" cannot silently change the narration mode.
const PURE_MUSIC_WORDS = [
  [/卡点\s*MV/gi, '节奏 MV'],
  [/纯卡点/g, '节奏剪辑'],
  [/纯音乐/g, '仅配乐'],
  [/免配音|无配音|不要配音|不用配音|去掉配音|无需配音/g, '暂停配音'],
  [/无旁白/g, '旁白留白'],
  [/无解说/g, '解说留白'],
  [/免\s*TTS/gi, 'TTS 留白'],
]
const BEAT_SYNC_WORDS = [
  [/高潮突降|主高潮/g, '音乐高潮'],
  [/突降/g, '转折'],
  [/踩死|踩准|踩拍|踩点/g, '跟随节奏'],
  [/卡点|卡拍/g, '跟随节奏'],
  [/重拍/g, '强拍'],
  [/切镜/g, '换镜'],
  [/同步节拍|节拍同步/g, '跟随节奏'],
  [/beat[- ]?sync/gi, 'rhythm edit'],
]
export function defuseModeTriggers(text, { pureMusic = false, beatSync = false } = {}) {
  let s = String(text || '')
  if (!pureMusic) for (const [rx, rep] of PURE_MUSIC_WORDS) s = s.replace(rx, rep)
  if (!pureMusic && !beatSync) for (const [rx, rep] of BEAT_SYNC_WORDS) s = s.replace(rx, rep)
  return s
}

// "AI 自由匹配" films: the pipeline reads the first "15 秒 / 2 分钟 / 1分30秒" of the brief as the target length. Durations
// written inside the AI-only notes are rewritten with ′ / ″ so they stay readable but never set the film's length.
export function defuseDurationPhrases(text) {
  return String(text || '')
    .replace(/(\d{1,2})\s*分\s*半/g, '$1′30″')
    .replace(/(\d{1,2})\s*分\s*(\d{1,2})\s*(?:秒钟|秒)?/g, '$1′$2″')
    .replace(/(\d+(?:\.\d+)?)\s*(?:分钟|min(?:ute)?s?\b)/gi, '$1′')
    .replace(/(\d{1,3})\s*(?:秒钟|秒|sec\b)/gi, '$1″')
}

/* ------------------------------------------------------------------------------------------ request */

const PACING_NAMES = { calm: '舒缓叙事', balanced: '稳健讲解', dynamic: '高密度快节奏' }
const PACING_HINTS = {
  calm: '每镜约 4.5~10 秒，从容留白，让观众看清情绪与细节，不急促闪切。',
  balanced: '每镜约 3~8 秒，把一个信息讲清楚再切；开场与收尾可以更利落。',
  dynamic: '每镜约 1.3~3 秒（2~4 拍），高潮与转折处 0.5~1 拍连切，紧贴音乐节拍。',
}
const segmentRange = (sec) => {
  const t = Math.max(10, Number(sec) || 60)
  const min = Math.max(3, Math.min(10, Math.round(t / 20)))
  return { min, max: Math.max(min + 2, Math.min(18, Math.round(t / 8))) }
}
const beatLen = (beatSec, n) => Number((beatSec * n).toFixed(2))

/**
 * Prompt context shared by the request and the reply rendering: content family, genre guess, pacing, duration plan
 * and beat grid, computed the way the director computes them so the brief's shot plan matches the later storyboard.
 * opts: { rawPrompt, noteSnippets[], refStyle, durationMode, targetDurationSec, pacingMode, style, narrationMode,
 *         pureMusic, beatSync, hasVisuals, musicList[], bgm: { bpm, measured, durationSec, drops[] } }
 */
export function buildPolishContext(opts = {}) {
  const rawPrompt = String(opts.rawPrompt || '').trim()
  // the subject comes from the user's own words (and uploaded notes), never from a reference film's style recipe
  const contextText = `${rawPrompt} ${(opts.noteSnippets || []).join(' ')}`.trim()
  const family = getContentFamily(detectContentFamily(contextText))
  const refStyle = opts.refStyle || null
  const detected = detectGenre(contextText, Boolean(opts.hasVisuals))
  // a reference film lends its genre only when the new subject fits it (the analyser labels every fast-cut film a
  // history epic when the vision model is offline)
  const refGenre = refStyle?.genre && refStyle.genre !== 'other' ? refStyle.genre : ''
  let guessedGenre = refGenre && (refGenre !== 'history-theater' || isHistoricalContent(contextText)) ? refGenre : detected
  // history-theater is the battle-epic route downstream: a non-war brief gets its family's genre (or the open one)
  if (guessedGenre === 'history-theater' && !isWarCombatContent(contextText)) guessedGenre = family.genre || 'other'
  // 卡点 / 纯音乐 is a way of cutting (narrationMode), not a subject: a theory lesson cut to music stays a theory lesson
  if (guessedGenre === 'mv-lyric' && family.id !== 'music' && family.id !== 'general') guessedGenre = family.genre || 'other'
  const narrationMode = opts.narrationMode || 'tts'
  const pacingMode = opts.pureMusic || refStyle?.pacingSignature?.recommendedPacingMode === 'dynamic' ? 'dynamic' : opts.pacingMode || 'auto'
  const pacingProfile = resolvePacingProfile({ topic: rawPrompt, style: opts.style || 'tech', narrationMode, hasAssets: Boolean(opts.hasVisuals), pacingMode })
  const durationPolicy = resolveTargetDurationPolicy({
    durationMode: opts.durationMode || 'auto',
    targetDurationSec: Number(opts.targetDurationSec) || 0,
    text: rawPrompt,
    pacingProfile,
    narrationMode,
    hasVisualAssets: Boolean(opts.hasVisuals),
    bgmDurationSec: Number(opts.bgm?.durationSec) || 0,
    referenceShotCount: Number(refStyle?.pacingSignature?.targetShotCount || refStyle?.shotCount || 0),
    referenceDurationSec: Number(refStyle?.durationSec || 0),
  })
  const totalSec = Math.max(10, Number(durationPolicy.targetSec) || 60)
  const bpm = Math.max(50, Math.min(200, Number(opts.bgm?.bpm) || (pacingProfile.id === 'calm' ? 88 : 110)))
  return {
    ...opts,
    rawPrompt,
    refStyle,
    contextText,
    family,
    guessedGenre,
    narrationMode,
    pacingMode,
    pacingProfile,
    durationPolicy,
    totalSec,
    enforced: Boolean(durationPolicy.enforced),
    segments: segmentRange(totalSec),
    beatSec: Number((60 / bpm).toFixed(4)),
    bpm,
    bpmMeasured: Boolean(opts.bgm?.measured && Number(opts.bgm?.bpm) > 0),
  }
}

/** The model's input: the user's words plus the facts of the project the plan must respect. */
export function buildPolishUserPayload(ctx, extra = {}) {
  const dp = ctx.durationPolicy
  return {
    userInput: ctx.rawPrompt,
    guessedGenre: ctx.guessedGenre,
    contentFamilyGuess: `${ctx.family.id}（${ctx.family.label}）`,
    ...extra,
    pacingMode: ctx.pacingMode,
    narrationMode: ctx.narrationMode,
    durationPolicy: dp.enforced
      ? { mode: dp.mode, targetSec: dp.targetSec, minSec: dp.minSec, outlineCount: `${dp.outlineCountMin}~${dp.outlineCountMax}` }
      : { mode: 'auto', hint: 'AI自由匹配最佳时长', suggestedSec: `${dp.minSec}~${dp.maxSec}` },
    shotPlan: { segments: `${ctx.segments.min}~${ctx.segments.max}`, shots: `${dp.targetShotsMin}~${dp.targetShotsMax}` },
    ...(ctx.beatSync
      ? {
          beatGrid: {
            bpm: ctx.bpm,
            measured: ctx.bpmMeasured,
            beatSec: ctx.beatSec,
            ...(Number(ctx.bgm?.durationSec) > 0 ? { musicLength: formatClock(ctx.bgm.durationSec) } : {}),
            ...((ctx.bgm?.drops || []).length ? { drops: ctx.bgm.drops.slice(0, 8).map(formatClock) } : {}),
          },
        }
      : {}),
  }
}

function timingLines(ctx) {
  const dp = ctx.durationPolicy || {}
  const lines = []
  lines.push(
    ctx.enforced
      ? `- 目标时长：${dp.label}（不少于 ${dp.minSec} 秒）。segments 从 0 一直排到 ${dp.targetSec} 秒，内容要撑满，不能缩水。`
      : `- 时长：AI 自由匹配。按内容决定总长，建议 ${dp.minSec}~${dp.maxSec} 秒（参考 ${dp.targetSec} 秒）；最后一段的 end 就是你定的总长。`,
  )
  lines.push(`- 全片约 ${dp.targetShotsMin}~${dp.targetShotsMax} 个镜头，分成 ${ctx.segments.min}~${ctx.segments.max} 段。`)
  // the pacing profile's own label and rule name example genres (历史史诗 / 产品功能…): neutral wording goes to the model
  if (ctx.pacingProfile) {
    const id = ctx.pacingProfile.id
    lines.push(`- 剪辑节奏「${PACING_NAMES[id] || '按内容自定'}」：${PACING_HINTS[id] || ctx.pacingProfile.ruleHint}`)
  }
  if (/^(?:9:16|3:4)$/.test(String(ctx.aspectRatio || ''))) lines.push('- 竖屏构图：主体放在画面中部偏上，字幕与文字避开底部和右侧的平台互动区。')
  if (ctx.narrationMode === 'subtitle-mv') {
    lines.push('- 纯音乐卡点：没有旁白，叙事靠画面动作和屏幕上的字幕金句（每条 6~12 个字）。')
  } else if (ctx.narrationMode === 'tts-beat-sync') {
    lines.push(`- 旁白 + 卡点：全片旁白约 ${dp.requiredCharsMin}~${dp.requiredCharsMax} 字（由下游按内容要点撰写），旁白段落的起止对齐音乐乐句，换镜落在重拍上。`)
  } else {
    lines.push(`- 有 TTS 旁白：全片旁白约 ${dp.requiredCharsMin}~${dp.requiredCharsMax} 字（由下游按内容要点撰写），每个镜头的时长跟着旁白走。`)
  }
  if (ctx.beatSync) {
    const b = ctx.beatSec
    lines.push(
      `- 配乐速度 ${ctx.bpm} BPM（${ctx.bpmMeasured ? '上传 BGM 实测' : '配乐由 AI 生成，按这个速度规划'}）：1 拍≈${beatLen(b, 1)} 秒，2 拍≈${beatLen(b, 2)} 秒，4 拍≈${beatLen(b, 4)} 秒，8 拍≈${beatLen(b, 8)} 秒。常规镜头 2~4 拍，高潮附近 0.5~1 拍连切；每段时长 ≈ 镜头数 × 每镜拍数 × 拍长。`,
    )
    const drops = (ctx.bgm?.drops || []).filter((t) => t > 1 && t < ctx.totalSec - 1).slice(0, 6)
    if (drops.length) lines.push(`- BGM 的高潮突降点约在 ${drops.map(formatClock).join('、')}：把情绪最强的段落放在这里。`)
  }
  if (Array.isArray(ctx.musicList) && ctx.musicList.length) {
    const dur = Number(ctx.bgm?.durationSec) || 0
    lines.push(
      `- 背景音乐：用户上传了 ${ctx.musicList.join('、')}，全程使用它${dur > 0 && Math.abs(dur - ctx.totalSec) > 5 ? `（音乐长 ${formatClock(dur)}，成片按自己的时长使用它）` : ''}；段落起伏跟随它的情绪变化${ctx.beatSync ? '，切点和关键动作落在它的真实节拍上' : '，有旁白时音乐自动压低'}。`,
    )
  }
  return lines.join('\n')
}

function voiceLines(ctx) {
  const uploaded = Array.isArray(ctx.musicList) && ctx.musicList.length > 0
  if (ctx.pureMusic) {
    return [
      '- 本片是纯音乐卡点作品，没有 TTS 旁白：voiceStyle 写「无旁白」；叙事完全靠画面动作和屏幕字幕。',
      `- music 写清配乐方案与卡点规则${uploaded ? '（上传的 BGM 在各段怎么用）' : '（曲风、速度、情绪曲线）'}；sound 只写与本片题材相符的音效，让关键动作和字幕落在重拍上。`,
    ].join('\n')
  }
  return [
    '- voiceStyle 写配音音色与情绪（例如：沉稳真诚的中年男声，语速稍慢），要与体裁相符。',
    `- music 写配乐的曲风、速度和情绪曲线${uploaded ? '，以及上传的 BGM 在各段怎么用' : ''}；sound 只写与本片题材相符的音效。`,
  ].join('\n')
}

function referenceRule(ref) {
  if (!ref?.replicationPrompt) return ''
  return `\n9. 已挂载参考视频「${ref.sourceName || '参考样片'}」（实测 ${ref.shotCount || 0} 镜 / ${ref.bpm || '?'} BPM / ${ref.narrationMode || 'tts'}），它的风格基因：${String(ref.replicationPrompt).slice(0, 700)}。沿用它的剪辑节奏、镜头密度、构图、色彩、字体与转场手法；参考片里属于它原来题材的具体元素（例如兵器、军队、古装、战场地图、特定人物）要换成本片主题里对应的元素，本片不是战争题材时不要照搬。`
}

/** System prompt + user message for the polish call. */
export function buildPolishRequest(ctx, userPayload = {}) {
  const dp = ctx.durationPolicy || {}
  const f = ctx.family
  const outlineRule = ctx.enforced
    ? `按目标时长写 ${dp.outlineCountMin}~${dp.outlineCountMax} 条扎实的要点，保证分镜能自然展开到 ${dp.targetSec} 秒。`
    : '条数按内容而定（通常 4~10 条）。'
  const beatField = ctx.beatSync ? '"beats": 4, ' : ''
  const system = `你是全品类视频的总导演兼分镜编剧。任务：把用户的一句话想法扩写成一份结构化创作方案，交给 AI 制作团队（分镜导演 → 动效程序员 → 画面质检）直接照做。方案要具体到能画出来、能剪出来。

一、先判断体裁，再定视觉语言
1. 视频题材没有任何限制：知识讲解、名人名事、科普、历史讲解、理论学习、产品介绍、美食、教程、Vlog、音乐 MV……都可能。先想清楚这条视频讲什么、给谁看、观众看完要记住什么，再决定画面怎么拍。
2. 系统初判：内容大类「${f.label}」（${f.id}），体裁 id「${ctx.guessedGenre}」。初判只供参考，可能不准，以需求内容为准。
3. 各内容大类常用的画面方向（起点而非模板）：
${listContentFamiliesForPrompt()}
4. ${buildContentFamilyGuide(f.id, { beatSync: ctx.beatSync })}
如果你判断本片属于别的大类，就按那一类的画面方向来写。
5. 铁律：画面主体、特效、转场、音效全部从本片主题推导，只用与本片体裁相符的元素；某一体裁的标志性元素不能搬到别的体裁里。例如刀光斩击、军阵冲锋、攻城地图、战鼓与兵器声只属于真正描写战争或武打的内容，理论、知识、科普、产品、美食、生活类作品一律不用（用户明确要求的除外）。
6. genre 字段从下表选一个；都不合适就填 other，并在 genreLabel 写准确的体裁名（例如：理论学习动画、历史文化讲解、美食探店 Vlog）：
${listGenresForPrompt()}

二、人物设定（文案和分镜里写到的人物，成片里必须真的画出来）
1. cast 列出全片所有出场人物（主角、配角、有代表性的群像，最多 8 个）。每个人物写：name（全片统一的称呼，要点和分镜里一字不差地用它）、role（身份与在片中的作用）、appearance（年龄、性别、体型、发型、神态）、costume（服装、配色 #hex、标志性道具）、actions（2~4 个招牌动作）。同一人物全片外观保持一致。
2. 纯产品、纯图表、纯风景的作品可以没有人物，cast 给 []。
3. 人物画风（visualStyle.figureStyle）全片统一，只写一种：剪影、剪纸、皮影、水墨、扁平插画、火柴人，或 Q版萌系、日系动漫、绘本手绘、写实插画等。按体裁和气质选：历史战争常用剪影，现代生活、理论、科普、产品常用扁平插画或写实插画，童趣内容可用 Q版或绘本。除了这一处，方案里其它地方不要再出现任何画风名词（下游按关键词识别画风，多写会被误判）。

三、分段分镜（时长、节奏、音乐对齐）
${timingLines(ctx)}
- segments 按时间顺序覆盖全片：第一段 start 为 0，每段的 start 等于上一段的 end，最后一段的 end 等于全片时长（单位：秒）。每段包含 shots 个镜头。
- 每段写清：title（段落名）；points（对应 contentOutline 的第几条，从 1 开始）；cast（本段必须出现在画面里的人物 name，没有人物写 []）；picture（画面：谁、在什么场景、做什么，景别与构图，cast 里的每个人物都要写清在画面中的位置和动作）；action（人物或主体的具体动作，按镜头顺序）；camera（镜头运动：推、拉、摇、移、跟、环绕、俯拍、仰拍……）；transition（进入下一段的转场）；text（画面上出现的文字或字幕关键词，每条不超过 12 个字；完整旁白由下游按内容要点撰写，这里不写长句）；sound（本段音效与音乐处理）${ctx.beatSync ? '；beats（每个镜头占几拍：0.5、1、2、4 或 8）' : ''}。
- 要点、字幕或画面里点名的人物，必须写进该段 cast，让观众在画面里看到 TA；不打算画出来的人物，就不要在该段点名。
- 第一段要在开头几秒内抓住注意力（一个强画面或一个问题），最后一段要有收束（总结、升华或行动号召）；相邻两段的景别、机位或主体位置要有变化。

四、声音
${voiceLines(ctx)}

五、输出格式：严格只输出一个 JSON 对象，不要 Markdown、代码围栏或任何解释。
{
  "genre": "体裁 id（见上表），都不合适填 other",
  "genreLabel": "精准的体裁中文名",
  "contentFamily": "内容大类 id（见上表）",
  "displayTitle": "观众可见的作品标题，≤16 个字，只写作品名，不含任何制作要求",
  "logline": "一句话说明这部片子讲什么、给谁看",
  "tone": "整体基调，例如：沉稳真诚、温暖有力量",
  "contentOutline": ["观众将看到、听到的内容要点 1", "要点 2"],
  "visualStyle": {
    "look": "整体画风、质感、构图与光影（60~120 字）",
    "palette": "主色、辅色、点缀色（写 #hex）与明暗基调",
    "typography": "标题与字幕的字体气质、字号层级、位置与关键词高亮方式",
    "figureStyle": "人物画风（只写一种）",
    "camera": "全片镜头运动规则",
    "transitions": ["本片用的转场"],
    "effects": ["本片用的特效"],
    "sfx": ["本片用的音效"]
  },
  "cast": [{ "name": "人物称呼", "role": "身份与作用", "appearance": "年龄性别、体型、发型、神态", "costume": "服装配色（#hex）与标志道具", "actions": ["招牌动作"] }],
  "segments": [{ "title": "段落名", "start": 0, "end": 8, "shots": 3, ${beatField}"points": [1], "cast": ["本段必须出镜的人物 name"], "picture": "画面", "action": "动作", "camera": "镜头运动", "transition": "转场", "text": ["字幕关键词"], "sound": "音效与音乐" }],
  "music": "配乐方案",
  "voiceStyle": "${ctx.pureMusic ? '无旁白' : '配音音色与情绪'}",
  "notes": "其它补充（可选，≤200 字）",
  "suggestedStyle": "tech|cinematic|documentary|energetic|warm|emerald 之一"
}

六、硬性规则
1. displayTitle 和 contentOutline 是观众能看到、听到的内容；其它所有字段只给 AI 制作团队看，绝不会出现在视频里。
2. contentOutline 写事实、情节、步骤或观点的要点（名词短语或短句），不要写成「本视频要求…」「请制作…」之类的指令，也不要以「开场：」「结尾：」「画面：」等制作术语开头。${outlineRule}
3. 结合 uploadedVisualAssets、uploadedNotes、uploadedMusic：有素材就写明在哪一段、怎么用；没有素材就由代码动画绘制（Three.js、SVG、Canvas），不受固定模板限制。
4. 严禁虚构数据、事实和引文：数字、时间、地名、原文只写你确定的；引用原著或名言时拿不准原文就用转述，不加引号。用户给出的产品名、网址原样保留在 contentOutline 中。
5. 数字一律用阿拉伯数字（206 年、3000 人）。
6. 各字段只写本片要用的元素，不写「不要 X」「禁止 X」这类否定句（下游按关键词识别，写出来反而会被采用）。
7. 时间只写在 segments 的 start、end 里（单位：秒），其它字段不要写时长数字。
8. 不要使用【】符号；字符串里需要引号时用「」，不要用英文双引号。${referenceRule(ctx.refStyle)}`

  return {
    system,
    user: JSON.stringify(userPayload),
    // a cast bible plus a time-coded segment plan is far longer than the old one-paragraph brief
    maxTokens: ctx.totalSec >= 240 ? 16000 : 12000,
  }
}

/**
 * Run the polish model call. A provider that caps the output below the requested budget answers HTTP 400 about the
 * token limit (e.g. an 8K-output chat model): retried once with 8000 tokens — a cut-off reply is still repaired below.
 */
export async function callPolishModel(callFn, args) {
  try {
    return await callFn(args)
  } catch (err) {
    const msg = String(err?.message || '')
    const tokenLimit = /max[_ ]?(?:output[_ ]?|completion[_ ]?)?tokens|maxOutputTokens/i.test(msg)
    if (Number(err?.status) === 400 && tokenLimit && Number(args?.maxTokens) > 8000) return await callFn({ ...args, maxTokens: 8000 })
    throw err
  }
}

/* ------------------------------------------------------------------------------------------ reply parsing */

/**
 * Close a JSON object cut off by the output token limit: keep everything up to the last complete value and close the
 * open arrays / objects. null when nothing usable is left.
 */
export function repairTruncatedJson(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start < 0) return null
  const stack = []
  let inStr = false
  let esc = false
  let safe = null
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') {
      stack.pop()
      if (!stack.length) return s.slice(start, i + 1)
      safe = { at: i + 1, closers: stack.slice() }
    } else if (ch === ',') safe = { at: i, closers: stack.slice() }
  }
  if (!safe) return null
  return s.slice(start, safe.at).replace(/,\s*$/, '') + safe.closers.reverse().join('')
}

/** Parse the model reply: { data: object|null, truncated }. Fences, commentary, trailing commas and cut-off JSON are tolerated. */
export function parsePolishReply(rawText) {
  const text = String(rawText || '')
    .replace(/^```[\w]*\r?\n?/, '')
    .replace(/\r?\n?```$/, '')
    .trim()
  const asObject = (v) => (isObj(v) ? v : null)
  try {
    const v = asObject(extractJsonFromLlmText(text))
    if (v) return { data: v, truncated: false }
  } catch {}
  const noTrailing = text.replace(/,\s*([}\]])/g, '$1')
  if (noTrailing !== text) {
    try {
      const v = asObject(extractJsonFromLlmText(noTrailing))
      if (v) return { data: v, truncated: false }
    } catch {}
  }
  const repaired = repairTruncatedJson(noTrailing)
  if (repaired) {
    try {
      const v = asObject(JSON.parse(repaired))
      if (v) return { data: v, truncated: true }
    } catch {}
  }
  return { data: null, truncated: false }
}

/* ------------------------------------------------------------------------------------------ reply rendering */

function normalizeCastBible(raw) {
  let items = raw
  if (isObj(items)) items = Object.entries(items).map(([name, v]) => (isObj(v) ? { name, ...v } : { name, role: textOf(v) }))
  if (!Array.isArray(items)) return []
  const out = []
  for (const c of items) {
    const o = isObj(c) ? c : { name: textOf(c).split(/[（(：:，,]/)[0] }
    const name = textOf(o.name ?? o.displayName ?? o.id).replace(/[「」]/g, '').slice(0, 24)
    if (!name || out.some((x) => x.name === name)) continue
    out.push({
      name,
      role: textOf(o.role ?? o.identity),
      appearance: textOf(o.appearance ?? o.look ?? o.description),
      costume: textOf(o.costume ?? o.outfit ?? o.clothing),
      actions: listOf(o.actions ?? o.signatureActions ?? o.moves, 6),
      aliases: listOf(o.aliases, 6).filter((a) => a !== name),
    })
  }
  return out.slice(0, 8)
}

const NO_PEOPLE_RX = /^(?:无|无人物|无人|空镜|没有人物|none|null|n\/a)$/i
function mapCastName(entry, bible) {
  const e = textOf(entry).replace(/[「」]/g, '')
  if (!e || NO_PEOPLE_RX.test(e)) return ''
  const exact = bible.find((c) => c.name === e || c.aliases.includes(e))
  if (exact) return exact.name
  const named = bible.find((c) => (c.name.length >= 2 && e.includes(c.name)) || c.aliases.some((a) => a.length >= 2 && e.includes(a)))
  if (named) return named.name
  // a shortened name ("小林" for 店长小林)
  const short = e.length >= 2 ? bible.find((c) => c.name.includes(e)) : null
  if (short) return short.name
  const byRole = bible.find((c) => c.role && e.length >= 2 && c.role.includes(e))
  return byRole ? byRole.name : e.slice(0, 24)
}

/**
 * Field cleaner for AI-only text: single line, no 【】, no negated foreign vocabulary, no stray character-look words.
 * An object value keeps its keys ({ 主色: '#C8102E' } → 主色：#C8102E).
 */
const aiText = (v, intended) => {
  const flat = isObj(v)
    ? Object.entries(v)
        .map(([k, x]) => (textOf(x) ? `${k}：${textOf(x)}` : ''))
        .filter(Boolean)
        .join('；')
    : textOf(v)
  return neutralizeStrayStyleWords(dropNegatedForeignClauses(flat), intended)
}
const aiList = (v, intended, max = 10) =>
  listOf(v, max)
    .map((x) => neutralizeStrayStyleWords(dropNegatedForeignClauses(x), intended))
    .filter(Boolean)

const snapBeat = (b) => BEAT_STEPS.reduce((best, x) => (Math.abs(x - b) < Math.abs(best - b) ? x : best), 4)

function normalizeSegments(raw, ctx, bible, intended) {
  const list = (Array.isArray(raw) ? raw : []).filter(isObj).slice(0, 40)
  if (!list.length) return []
  const pacingSecPerShot = ctx.pacingProfile?.shotsPerMin ? 60 / ctx.pacingProfile.shotsPerMin : 5
  const segs = list.map((s) => {
    const start = num(s.start ?? s.startSec ?? s.from)
    const end = num(s.end ?? s.endSec ?? s.to)
    const declared = num(s.durationSec ?? s.duration)
    const shots = Math.round(num(s.shots ?? s.shotCount ?? s.shotsCount))
    const beats = num(s.beats ?? s.beatsPerShot)
    return {
      title: aiText(s.title ?? s.segment ?? s.name, intended).slice(0, 30),
      points: (Array.isArray(s.points) ? s.points : listOf(s.points ?? s.outlineRefs))
        .map((p) => Math.round(num(p)))
        .filter((p) => p >= 1 && p <= 99)
        .slice(0, 6),
      dur: end > start ? end - start : declared > 0 ? declared : NaN,
      shots: shots >= 1 ? Math.min(40, shots) : 0,
      beats: beats > 0 ? beats : NaN,
      castRaw: s.cast ?? s.onScreen ?? s.characters ?? s.mustShow,
      picture: aiText(s.picture ?? s.visual ?? s.scene, intended),
      action: aiText(s.action ?? s.actions, intended),
      camera: aiText(s.camera ?? s.cameraMove, intended),
      transition: aiText(s.transition, intended),
      text: aiList(s.text ?? s.onScreenText ?? s.subtitle ?? s.caption, intended, 6).map((t) => clip(t.replace(/[「」]/g, ''), 16)),
      sound: aiText(s.sound ?? s.sfx ?? s.audio, intended),
    }
  })
  // durations: declared span, else shots × beats × beat length, else an even share of the film
  const known = segs.filter((g) => g.dur > 0)
  for (const g of segs) {
    if (g.dur > 0) continue
    if (ctx.beatSync && g.shots && g.beats > 0) g.dur = g.shots * g.beats * ctx.beatSec
    else g.dur = known.length ? known.reduce((a, x) => a + x.dur, 0) / known.length : ctx.totalSec / segs.length
  }
  const sum = segs.reduce((a, g) => a + g.dur, 0)
  // a fixed target length is always met exactly; a free length keeps the model's own timeline unless it is absurd
  const scale = ctx.enforced || sum < ctx.totalSec * 0.4 || sum > ctx.totalSec * 2.5 ? ctx.totalSec / sum : 1
  let t = 0
  return segs.map((g) => {
    const startSec = Math.round(t)
    t += g.dur * scale
    const endSec = Math.max(startSec + 1, Math.round(t))
    const span = endSec - startSec
    const shots = g.shots || Math.max(1, Math.round(span / (ctx.beatSync && g.beats > 0 ? g.beats * ctx.beatSec : pacingSecPerShot)))
    const beats = ctx.beatSync ? snapBeat(g.beats > 0 ? g.beats : span / Math.max(1, shots) / ctx.beatSec) : 0
    // who must be visible: the listed cast, plus every cast member the segment's picture / action / text names
    const cast = []
    for (const c of listOf(g.castRaw, 8).map((x) => mapCastName(x, bible)).filter(Boolean)) if (!cast.includes(c)) cast.push(c)
    const named = `${g.picture} ${g.action} ${g.text.join(' ')}`
    for (const c of bible) {
      if (cast.includes(c.name)) continue
      if ((c.name.length >= 2 && named.includes(c.name)) || c.aliases.some((a) => a.length >= 2 && named.includes(a))) cast.push(c.name)
    }
    return { title: g.title, points: g.points, startSec, endSec, shots, beats, cast, picture: g.picture, action: g.action, camera: g.camera, transition: g.transition, text: g.text, sound: g.sound }
  })
}

function renderSegmentLines(seg, i, { beatSync, limit }) {
  const cut = (s) => (limit ? clip(s, limit) : s)
  const head = [
    `第${i + 1}段 ${formatClock(seg.startSec)}–${formatClock(seg.endSec)}`,
    seg.title,
    `${seg.shots} 镜${beatSync && seg.beats ? ` · 每镜 ${seg.beats} 拍` : ''}`,
    seg.points.length ? `对应要点 ${seg.points.join('、')}` : '',
    `出镜：${seg.cast.length ? seg.cast.join('、') : '无人物'}`,
  ].filter(Boolean)
  const lines = [head.join('｜')]
  if (seg.picture) lines.push(`  画面：${cut(seg.picture)}`)
  const mid = [seg.action && `动作：${cut(seg.action)}`, seg.camera && `镜头：${cut(seg.camera)}`, seg.transition && `转场：${cut(seg.transition)}`].filter(Boolean)
  if (mid.length) lines.push(`  ${mid.join('｜')}`)
  const tail = [seg.text.length && `字幕：${seg.text.map((x) => `「${x}」`).join(' ')}`, seg.sound && `音效：${cut(seg.sound)}`].filter(Boolean)
  if (tail.length) lines.push(`  ${tail.join('｜')}`)
  return lines
}

const hasStructuredBrief = (d) =>
  isObj(d.visualStyle) ||
  (Array.isArray(d.cast) && d.cast.length > 0) ||
  isObj(d.cast) ||
  ['segments', 'shotPlan', 'storyboard'].some((k) => Array.isArray(d[k]) && d[k].length > 0) ||
  Boolean(textOf(d.music))

/** AI-only notes of a structured reply (ordered so the first ~900 characters, all the scene coder reads, carry the look). */
function renderStructuredNotes(d, ctx, { genreLabel, family, castBible, segments, intended }) {
  const vs = isObj(d.visualStyle) ? d.visualStyle : {}
  const figureStyle = textOf(vs.figureStyle ?? d.figureStyle).replace(/[；;。]+$/, '')
  const out = []
  const tone = aiText(d.tone, intended)
  out.push(`▍创作定位：${genreLabel}（${family.label}）${tone ? `；基调：${tone}` : ''}`)
  const look = aiText(vs.look ?? vs.style ?? d.look, intended)
  if (look) out.push(`▍画面风格：${look}`)
  const palette = aiText(vs.palette ?? vs.colors ?? vs.colorPalette ?? d.palette, intended)
  if (palette) out.push(`▍色彩：${palette}`)
  const typography = aiText(vs.typography ?? vs.fonts ?? vs.subtitleStyle ?? d.typography, intended)
  if (typography) out.push(`▍字体与字幕：${typography}`)
  if (figureStyle) out.push(`▍人物画风：${figureStyle}（全片统一）`)
  const camera = aiText(vs.camera ?? vs.cameraLanguage ?? d.camera, intended)
  if (camera) out.push(`▍镜头运动：${camera}`)
  const transitions = aiList(vs.transitions ?? d.transitions, intended)
  if (transitions.length) out.push(`▍转场：${transitions.join('、')}`)
  const effects = aiList(vs.effects ?? vs.vfx ?? d.effects, intended)
  if (effects.length) out.push(`▍特效：${effects.join('、')}`)
  const sfx = aiList(vs.sfx ?? vs.soundEffects ?? d.sfx, intended)
  if (sfx.length) out.push(`▍音效：${sfx.join('、')}`)
  const head = out.slice()

  const castLines = castBible.length
    ? [
        '▍人物设定（每个人物全片外观一致；分镜里写到的人物必须清楚地出现在画面上）：',
        ...castBible.map((c) => {
          const role = aiText(c.role, intended)
          const appearance = aiText(c.appearance, intended)
          const costume = aiText(c.costume, intended)
          const actions = aiList(c.actions, intended, 6)
          const parts = [appearance, costume && `服装：${costume}`, actions.length && `招牌动作：${actions.join('、')}`].filter(Boolean)
          return `· ${c.name}${role ? `｜${role}` : ''}${parts.length ? `：${parts.join('；')}` : ''}`
        }),
      ]
    : []
  const totalShots = segments.reduce((a, s) => a + s.shots, 0)
  const tailLines = []
  const music = aiText(d.music ?? d.musicPlan ?? d.bgm, intended)
  if (music) tailLines.push(`${ctx.beatSync ? '▍配乐与卡点' : '▍配乐'}：${music}`)
  const extra = aiText(d.notes ?? d.directorNotes, intended)
  if (extra) tailLines.push(`▍补充：${extra}`)
  const voice = ctx.pureMusic ? '无旁白（纯音乐卡点），叙事靠画面动作与字幕' : aiText(d.voiceStyle, intended)
  if (voice) tailLines.push(`配音取向：${voice}`)

  // keep within the studio's notes box: shorten the long segment fields step by step, never drop a segment
  for (const limit of [0, 90, 60, 40, 24]) {
    const segLines = segments.length
      ? [`▍分镜段落（共 ${segments.length} 段，约 ${totalShots} 镜，时间码按成片计）：`, ...segments.flatMap((s, i) => renderSegmentLines(s, i, { beatSync: ctx.beatSync, limit }))]
      : []
    const text = [...head, ...castLines, ...segLines, ...tailLines].join('\n')
    if (text.length <= MAX_POLISHED_NOTES_CHARS || limit === 24) return text.slice(0, MAX_POLISHED_NOTES_CHARS)
  }
  return ''
}

function finalizeNotes(notes, ctx) {
  let s = defuseModeTriggers(notes, { pureMusic: ctx.pureMusic, beatSync: ctx.beatSync })
  if (!ctx.enforced) s = defuseDurationPhrases(s)
  return s.replace(/【/g, '「').replace(/】/g, '」').trim()
}

function composeBrief({ displayTitle, genreLabel, logline, outline, notes, ctx }) {
  const dp = ctx.durationPolicy || {}
  return [
    `【作品标题】${displayTitle}`,
    `【体裁】${genreLabel}`,
    ctx.enforced ? `【目标时长】${dp.targetSec} 秒（${formatDurationLabel(dp.targetSec)}）` : '',
    logline ? `【一句话】${logline}` : '',
    outline.length ? `【内容要点】\n${outline.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
    `${POLISH_NOTES_HEADER}\n${notes}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Turn the model reply into the polish result (without `model`). Structured replies (visualStyle / cast / segments)
 * render the full brief; the older one-paragraph JSON and free text still work.
 */
export function renderPolishResult(rawText, ctx) {
  const dp = ctx.durationPolicy || {}
  const { data, truncated } = parsePolishReply(rawText)
  const durationFields = {
    durationMode: dp.enforced ? 'custom' : 'auto',
    targetDurationSec: dp.enforced ? dp.targetSec : 0,
    durationLabel: dp.label,
  }
  if (!data) {
    // Free text (or JSON beyond repair): kept strictly as director notes, never as a title. A reply that already uses
    // the 【…】 brief layout is re-read section by section so its notes are not cut at the first marker.
    const text = String(rawText || '').replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```$/, '').trim()
    const marked = /【\s*(?:作品标题|内容要点|导演备注)/.test(text) ? splitDirectorBrief({ topic: text }) : null
    const title = textOf((marked?.displayTitle && marked.displayTitle !== '作品' ? marked.displayTitle : '') || deriveDisplayTitle(ctx.rawPrompt, '') || deriveDisplayTitle(text, '作品'))
    const genreLabel = getGenreProfile(ctx.guessedGenre).label
    const outline = (marked?.contentOutline || []).map(textOf).filter((x) => x && !isMetaInstructionText(x))
    const notes = finalizeNotes(textOf(marked ? marked.directorNotes : text), ctx)
    return {
      ok: true,
      polishedTopic: composeBrief({ displayTitle: title, genreLabel, logline: '', outline, notes, ctx }),
      displayTitle: title,
      genre: ctx.guessedGenre,
      genreLabel,
      ...durationFields,
      logline: '',
      contentOutline: outline,
      directorNotes: notes,
      voiceStyle: '',
      suggestedStyle: ctx.refStyle?.style || '',
      contentFamily: ctx.family.id,
      contentFamilyLabel: ctx.family.label,
      castBible: [],
      shotPlan: [],
    }
  }

  const rawGenre = textOf(data.genre)
  const matched = rawGenre ? GENRE_PROFILES.find((g) => g.id === rawGenre || g.label === rawGenre) : null
  let genreId = matched ? matched.id : rawGenre ? 'other' : ctx.guessedGenre
  let genreLabel = textOf(data.genreLabel) || (genreId === 'other' && rawGenre && rawGenre !== 'other' ? rawGenre : getGenreProfile(genreId).label)
  // strip list numbering only ("1. " / "2、" / "- "): a point that starts with a number ("400℃ 黑烟囱") keeps it
  const outline = (Array.isArray(data.contentOutline) ? data.contentOutline : String(data.contentOutline ?? '').split(/\r?\n+/))
    .map((x) => textOf(x).replace(/^(?:[-*•·]\s*|\d{1,2}\s*(?:[、．)）]|\.(?!\d))\s*)/, ''))
    .filter((x) => x && !isMetaInstructionText(x))
  const logline = textOf(data.logline)
  const displayTitle = textOf(data.displayTitle).slice(0, 24) || deriveDisplayTitle(ctx.rawPrompt, '作品')
  const family = CONTENT_FAMILIES.find((f) => f.id === textOf(data.contentFamily)) || ctx.family
  // the battle-epic genre is for war / battle content only (it switches on war drums, blade clashes, conquest maps)
  const contentText = `${ctx.contextText} ${displayTitle} ${logline} ${outline.join(' ')}`
  if (genreId === 'history-theater' && !isWarCombatContent(contentText)) {
    genreId = 'other'
    if (!textOf(data.genreLabel) || genreLabel === getGenreProfile('history-theater').label) {
      genreLabel = isHistoricalContent(contentText) ? getContentFamily('history-lecture').label : family.label
    }
  }
  const voiceStyle = ctx.pureMusic && hasStructuredBrief(data) ? '无旁白' : textOf(data.voiceStyle)

  let notes
  let castBible = []
  let shotPlan = []
  let intended = { style: 'auto', note: '' }
  let briefLogline = logline
  if (hasStructuredBrief(data)) {
    const vs = isObj(data.visualStyle) ? data.visualStyle : {}
    intended = intendedFigureStyle(textOf(vs.figureStyle ?? data.figureStyle))
    castBible = normalizeCastBible(data.cast ?? data.characters)
    shotPlan = normalizeSegments(data.segments ?? data.shotPlan ?? data.storyboard, ctx, castBible, intended)
    notes = renderStructuredNotes(data, ctx, { genreLabel, family, castBible, segments: shotPlan, intended })
    // the logline is a line for the director too: a stray character-look word there would override the 人物画风 line
    briefLogline = neutralizeStrayStyleWords(logline, intended)
  } else {
    // the pre-structure reply: one director-notes paragraph + voice line, as before (its own line breaks are kept)
    const dnRaw = data.directorNotes
    const dn = (Array.isArray(dnRaw) ? dnRaw.map(textOf).join('\n') : isObj(dnRaw) ? textOf(dnRaw) : String(dnRaw ?? '')).trim()
    notes = `${dn}${voiceStyle ? `\n配音取向：${voiceStyle}` : ''}`
  }
  notes = finalizeNotes(notes, ctx)

  return {
    ok: true,
    polishedTopic: composeBrief({ displayTitle, genreLabel, logline: briefLogline, outline, notes, ctx }),
    displayTitle,
    genre: genreId,
    genreLabel,
    ...durationFields,
    logline: briefLogline,
    contentOutline: outline,
    directorNotes: notes,
    voiceStyle,
    suggestedStyle: textOf(data.suggestedStyle) || ctx.refStyle?.style || '',
    contentFamily: family.id,
    contentFamilyLabel: family.label,
    castBible: castBible.map(({ aliases, ...c }) => (aliases.length ? { ...c, aliases } : c)),
    shotPlan,
    ...(intended.style !== 'auto' ? { suggestedFigureStyle: intended.style, ...(intended.note ? { suggestedFigureStyleNote: intended.note } : {}) } : {}),
    ...(truncated ? { truncated: true } : {}),
  }
}
