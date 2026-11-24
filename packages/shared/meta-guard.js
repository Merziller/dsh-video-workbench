/**
 * Meta-prompt guard: production instructions (director notes, "本视频要求…", style / camera / BGM directives)
 * must NEVER be spoken or rendered on screen. This module
 *   1. splits a raw user / AI-polished brief into { displayTitle, directorNotes, topic },
 *   2. detects & strips meta-instruction sentences,
 *   3. scrubs a script right before it is written / rendered (`sanitizeScriptForRender`).
 */

const META_CLAUSE_RES = [
  /(?:^|[，。；：、\s])(?:请你?|麻烦|务必|切记)[:：]?\s*(?:你|为我|帮我|制作|生成|创作|设计|拍摄|输出|做成|按照|严格)/,
  /(?:本视频|该视频|这条视频|本片|整支视频|整个视频|视频整体|整体视频)(?:要求|需要|须|必须|应当|应该|应|采用|风格|基调|节奏|时长|开头|结尾)/,
  /(?:分镜指令|导演指令|导演备注|制作要求|生成要求|视频要求|画面风格(?:要求)?|镜头语言(?:要求)?|创作指令|制作说明|画面要求|配音要求|字幕要求|音乐要求|转场要求|节奏要求|风格要求|旁白风格|视觉方案|拍摄要求)\s*[:：]/,
  /^\s*(?:\d+|[一二三四五六七八九十]+)\s*[.、．)）]\s*(?:开场|结尾|收尾|画面|配音|节奏|镜头|字幕|音乐|旁白|配乐|转场|风格|素材|时长|分镜|目标|章节)/,
  /^\s*(?:开场|结尾|收尾|中段|画面风格|节奏基调|镜头语言|旁白风格|配乐|字幕要求|黄金\s*3\s*秒|叙事视角)[:：]/,
  /(?:黄金\s*3\s*秒|三秒钩子|开场钩子|结尾号召)(?:[，,：:]|要|需|设置)/,
  /严禁(?:出现|使用|添加|输出|加入|上屏|配音|虚构)/,
]

const BRIEF_MARKER_RES = [
  /【\s*导演备注[^】]*】/,
  /【\s*(?:内容要点|制作要求|视觉方案|导演指令|目标时长)[^】]*】/,
]

const SENTENCE_SPLIT_RE = /(?<=[。！？；!?;\n])/

const normForOverlap = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[\s，。！？；：、,.!?;:"“”'‘’()（）【】\[\]《》\-—_·|｜]+/g, '')

/** True when the text is (or mostly consists of) a production directive instead of audience content. */
export function isMetaInstructionText(text) {
  const s = String(text || '').trim()
  if (!s) return false
  const sentences = s.split(SENTENCE_SPLIT_RE).map((x) => x.trim()).filter(Boolean)
  if (sentences.length === 0) return false
  const metaHits = sentences.filter((sen) => META_CLAUSE_RES.some((re) => re.test(sen))).length
  if (metaHits === 0) return false
  return metaHits >= Math.max(1, Math.ceil(sentences.length * 0.34)) || s.length > 90
}

function sentenceIsMeta(sentence) {
  return META_CLAUSE_RES.some((re) => re.test(sentence))
}

/** Drop meta-instruction sentences; keep the audience-facing remainder. */
export function stripMetaInstructions(text) {
  const s = String(text || '').trim()
  if (!s) return ''
  const keep = s
    .split(SENTENCE_SPLIT_RE)
    .map((x) => x.trim())
    .filter((sen) => sen && !sentenceIsMeta(sen))
  return keep.join('').replace(/\s{2,}/g, ' ').trim()
}

/** Fraction of `text` (normalized) covered by long contiguous runs copied from `brief`. */
export function briefOverlapRatio(text, brief, windowSize = 14) {
  const t = normForOverlap(text)
  const b = normForOverlap(brief)
  if (t.length < windowSize || b.length < windowSize * 2) return 0
  const covered = new Array(t.length).fill(false)
  for (let i = 0; i + windowSize <= t.length; i++) {
    if (b.includes(t.slice(i, i + windowSize))) {
      for (let k = i; k < i + windowSize; k++) covered[k] = true
    }
  }
  return covered.filter(Boolean).length / t.length
}

/** True when `text` is largely a verbatim copy of any registered brief. */
export function leaksBrief(text, briefs = []) {
  return briefs.some((b) => b && briefOverlapRatio(text, b) >= 0.55)
}

/* ---------- Production-directive phrases printed on screen ---------- */

// Effect / camera / motion / typography / editing operations. A short on-screen label made only of these words (and
// the modifiers below) is a motion or production directive that leaked onto the screen as content — e.g. the
// bamboo slips reading 「竹节弹簧回弹」「书法笔画描边」「书法字逐字砸」「斜向刀光长尾」. At least one of these words
// must be present; the modifiers alone never make a directive (「书法」「刀光剑影」「金色年华」 stay).
const DIRECTIVE_TERMS = [
  // typography / text animation
  '描边', '勾边', '笔画', '笔触', '逐字', '逐行', '逐句', '逐词', '砸字', '字砸', '砸入', '砸下', '砸', '打字机', '字幕条', '空心字', '立体字', '字间距', '书写动画', '手写动画',
  // motion
  '回弹', '弹簧', '弹性', '弹跳', '弹入', '弹出', '缓动', '缓入', '缓出', '长尾', '拖尾', '拖影', '残影', '位移', '平移', '横移', '纵移', '推拉', '震屏', '屏震', '抖屏', '抖动', '晃动',
  '慢放', '快放', '倒放', '定格', '升格', '降格', '慢动作', '入场', '出场', '退场', '飞入', '飞出', '滑入', '滑出', '甩入', '甩出', '甩尾', '缩放', '旋转', '翻转', '渐显', '渐隐',
  '淡入', '淡出', '闪烁', '频闪', '闪动', '入场动画', '出场动画',
  // camera
  '推镜', '拉镜', '摇镜', '移镜', '跟镜', '甩镜', '运镜', '推近', '拉远', '拉近', '特写', '大特写', '近景', '中景', '远景', '全景', '大远景', '俯拍', '仰拍', '航拍', '跟拍',
  '环拍', '景深', '虚焦', '对焦', '失焦', '机位', '广角', '长焦', '鱼眼', '主观镜头', '过肩', '推轨', '摇臂', '镜头',
  // editing / transitions
  '转场', '闪切', '闪白', '闪黑', '硬切', '跳切', '叠化', '溶解', '划像', '擦除', '遮罩', '蒙版', '卡点', '踩点', '切镜', '黑场', '白场', '分屏', '画中画', '鼓点', '重拍',
  // effects
  '光效', '特效', '动效', '粒子', '辉光', '光晕', '扫光', '光扫', '溅射', '晕染', '噪点', '颗粒感', '暗角', '色差', '故障风', '外发光', '内发光', '关键帧', '速度线', '光斑',
  '体积光', '冲击波', '残像', '抽帧', '重影', '动态模糊', '径向模糊',
  // English
  'zoom', 'dolly', 'closeup', 'slowmo', 'slowmotion', 'glitch', 'whip', 'swipe', 'wipe', 'fade', 'dissolve', 'parallax', 'bounce', 'overshoot', 'typewriter', 'kinetic',
  'motionblur', 'particles', 'particle', 'glow', 'bloom', 'lensflare', 'flare', 'shake', 'transition', 'crossfade', 'jumpcut', 'smashcut', 'flashcut', 'matchcut', 'kenburns',
  'vfx', 'easing', 'easein', 'easeout', 'keyframe', 'speedlines', 'beatsync', 'popin', 'slidein', 'slideout', 'flyin', 'flyout', 'pushin', 'pullout', 'whippan',
]
// Modifiers, materials and subjects that appear inside directives but are ordinary words on their own
const DIRECTIVE_MODIFIERS = [
  '竹节', '竹简', '竹片', '书法', '书法字', '毛笔字', '毛笔', '墨迹', '墨色', '字', '大字', '文字', '汉字', '标题', '标题字', '字幕', '刀光', '剑光', '刀锋', '光', '光线', '光影',
  '斜向', '横向', '纵向', '斜', '横', '竖', '向上', '向下', '向左', '向右', '上', '下', '左', '右', '画面', '背景', '前景', '镜', '金色', '金', '红色', '白色', '黑色', '线条',
  '边框', '卡片', '质感', '纹理', '高光', '阴影', '投影', '速度', '慢', '快', '慢速', '快速', '急速', '缓慢', '缓缓', '轻微', '轻', '重', '强', '弱', '大', '小', '长', '短',
  '内', '外', '进', '出', '入', '向', '式', '感', '版', '效果', '风格', '节奏', '层', '分层', '叠加', '全屏', '动态', '循环', '连续', '依次', '逐个', '每拍', '拍', '秒', '帧',
  '次', '遍', '个', '的', '与', '和', '及', '加', '再', '后', '先', '带', '做', '并', '同时', '配合', '跟随', '随', '一', '二', '两', '三', '动作', '运动', '处理', '收尾',
  '开场', '起势', '爆发', '冲击', '力度', '强调', '突出', '放大', '缩小', '推', '拉', '摇', '移', '跟', '甩', '切', '闪', '震', '抖', '弹', '旋', '转',
  'in', 'out', 'up', 'down', 'left', 'right', 'slow', 'fast', 'hard', 'soft', 'quick', 'big', 'small', 'with', 'and', 'x', 'fx', 'effect', 'effects', 'style', 'anim',
  'animation', 'motion', 'camera', 'shot', 'cam', 'lens', 'text', 'title', 'line', 'lines', 'letter', 'letters', 'word', 'words', 'by', 'per', 'each', 'frame', 'frames',
  'sec', 's', 'ms', 'push', 'pull', 'pan', 'tilt', 'spin', 'rotate', 'flip', 'scale', 'blur', 'stroke', 'trail', 'streak', 'beat', 'cut', 'flash', 'pop', 'slide', 'fly',
]
const DIRECTIVE_VOCAB = new Map([...DIRECTIVE_MODIFIERS.map((t) => [t, false]), ...DIRECTIVE_TERMS.map((t) => [t, true])])
const DIRECTIVE_MAX_TERM = Math.max(...[...DIRECTIVE_VOCAB.keys()].map((t) => t.length))
// separators inside an on-screen label (kept when content is rebuilt)
const LABEL_SEP_RE = /([，,、·・•|｜/／;；:：+＋&＆~～→⇒>]+|\s+[-—–]+\s+|\s*—+\s*)/
const LABEL_STRIP_RE = /[\s"“”'‘’「」『』《》〈〉【】\[\]()（）·・•.,，、:：;；!！?？~～…—–\-_|｜/／+＋&＆→⇒>*＊#＃]+/g
const BRACKETED_RE = /[（(【\[「『]([^（）()【】\[\]「」『』]{1,24})[）)】\]」』]/g

/**
 * True when a short on-screen label is nothing but a production directive (effect / camera / motion / typography
 * vocabulary): 「竹节弹簧回弹」「书法笔画描边」「推镜」「Zoom In」. Real content — anything with a word outside that
 * vocabulary (「刀光剑影」「封狼居胥」「书法」) — is never a directive.
 */
export function isDirectivePhrase(text) {
  const s = String(text ?? '').toLowerCase().replace(LABEL_STRIP_RE, '')
  if (!s || s.length > 18) return false
  // word break over the vocabulary: state[i] = -1 unreachable, 0 covered by modifiers only, 1 covered with a directive term
  const state = new Array(s.length + 1).fill(-1)
  state[0] = 0
  for (let i = 0; i < s.length; i++) {
    if (state[i] < 0) continue
    const num = /^[0-9.]+/.exec(s.slice(i))
    if (num) state[i + num[0].length] = Math.max(state[i + num[0].length], state[i])
    for (let len = 1; len <= DIRECTIVE_MAX_TERM && i + len <= s.length; len++) {
      const kind = DIRECTIVE_VOCAB.get(s.slice(i, i + len))
      if (kind === undefined) continue
      const next = kind ? 1 : state[i]
      if (next > state[i + len]) state[i + len] = next
    }
  }
  return state[s.length] === 1
}

/**
 * Remove production-directive phrases from an on-screen label and keep the real content: a whole-directive label
 * becomes '', directive parts of a list-like label ("封狼居胥 · 书法字逐字砸") and bracketed stage directions
 * ("（推镜）霍去病策马而来") are dropped. `bracketsOnly` (spoken / subtitle text) removes bracketed directions only.
 */
export function stripDirectivePhrases(text, { bracketsOnly = false } = {}) {
  const s = String(text ?? '')
  if (!s.trim()) return s
  let out = s.replace(BRACKETED_RE, (m, inner) => (isDirectivePhrase(inner) ? ' ' : m))
  if (!bracketsOnly) {
    if (isDirectivePhrase(out)) return ''
    const parts = out.split(LABEL_SEP_RE)
    const kept = []
    let dropped = false
    for (let i = 0; i < parts.length; i += 2) {
      const seg = parts[i]
      if (seg.trim() && isDirectivePhrase(seg)) {
        dropped = true
        continue
      }
      if (seg.trim()) kept.push({ seg, sep: parts[i + 1] || '' })
    }
    if (dropped) out = kept.map((k, idx) => (idx < kept.length - 1 ? k.seg + k.sep : k.seg)).join('')
  }
  if (out === s) return s
  return out.replace(/\s{2,}/g, ' ').replace(/^[\s，,、·・•|｜/／;；:：+＋&＆~～→⇒>—–-]+|[\s，,、·・•|｜/／;；:：+＋&＆~～→⇒>—–-]+$/g, '').trim()
}

// A film about video making or a creative tool (editing tutorials, this workbench, a comic-studio feature tour) uses
// effect words as content: keep them there
const EDITING_TOPIC_RE = /剪辑|视频制作|视频剪|后期|特效制作|动效设计|调色|剪映|premiere|after\s*effects|达芬奇|davinci|final\s*cut|workbench|工作台|教程|tutorial|软件|客户端|功能介绍|功能演示|产品介绍|产品演示|插件|分镜/i
function isEditingTopic(script) {
  if (/tutorial/i.test(String(script?.genre || ''))) return true
  return [script?.title, script?.displayTitle, script?.topic, script?.genreLabel].some((v) => typeof v === 'string' && EDITING_TOPIC_RE.test(v))
}

const IMPERATIVE_PREFIX_RE = /^(?:请你?|麻烦|帮我|给我|我想|我要|想要)?\s*(?:制作|生成|创作|拍摄|做|产出|设计|出)(?:一部|一条|一个|一段|一支|一份)?\s*(?:\d+\s*(?:秒|分钟|分)(?:左右)?(?:的)?)?\s*(?:不限制时长的|不限时长的|完整的|详细的|高质量的|专业的)?/

/** Short, audience-safe title (≤ 18 chars) derived from an arbitrary brief; '' when none can be trusted. */
export function deriveDisplayTitle(brief, fallback = '') {
  const raw = String(brief || '').trim()
  if (!raw) return fallback
  const marked = raw.match(/【\s*作品标题[^】]*】\s*([^\n【]{2,28})/)
  if (marked) return marked[1].trim()
  const book = raw.match(/《([^《》]{2,28})》/)
  if (book) return book[1].trim()
  const labeled = raw.match(/(?:标题|作品名|片名|主题|题目)\s*[:：]\s*([^\n，。；;]{2,28})/)
  if (labeled && !isMetaInstructionText(labeled[1])) return labeled[1].trim()
  const firstSentence = raw.split(/[。！？\n；;]/)[0].trim()
  let t = firstSentence.replace(IMPERATIVE_PREFIX_RE, '').replace(/^(?:关于|有关)/, '').trim()
  t = t.replace(/(?:的)?(?:短视频|视频|动画|宣传片|纪录片|教学片|大片|短片)$/, (m) => m.replace(/^的/, '')).trim()
  const firstClause = t.split(/[，,：:、]/)[0].trim()
  const candidate = firstClause.length >= 2 ? firstClause : t
  if (candidate && !isMetaInstructionText(candidate) && candidate.length <= 26) return candidate.slice(0, 22)
  if (candidate && !isMetaInstructionText(candidate)) return candidate.slice(0, 18)
  return fallback
}

/**
 * Split any raw brief into audience-safe fields.
 *   topic   → short subject (≤ 40 chars), safe to use as a fallback title / topic
 *   title   → short audience-safe title
 *   directorNotes → the full brief, kept ONLY as AI-readable notes (never narrated, never rendered)
 */
function parseBriefSections(raw) {
  const grab = (label) => {
    const re = new RegExp('【\\s*' + label + '[^】]*】\\s*([\\s\\S]*?)(?=【|$)')
    const m = String(raw || '').match(re)
    return m ? m[1].trim() : ''
  }
  const parsedGenreLabel = grab('体裁').split(/\n/)[0].trim()
  const parsedDurationLine = grab('目标时长').split(/\n/)[0].trim()
  return {
    title: grab('作品标题').split(/\n/)[0].trim(),
    genre: parsedGenreLabel,
    genreLabel: parsedGenreLabel,
    durationLine: parsedDurationLine,
    outline: grab('内容要点'),
    notes: grab('导演备注'),
    hasMarkers: /【\s*(?:作品标题|体裁|目标时长|内容要点|导演备注)/.test(String(raw || '')),
  }
}

const BOILERPLATE_GOALS = new Set([
  '带有文案、配音、音效、动效、音乐与字幕的完整成片',
  '呈现具备动态视觉排版、空间运镜、粒子光效、节拍音效、配乐与配音的完整成片',
])

/**
 * A stringified missing value ("undefined" / "null") is never brief content. An old client bug stored briefs such as
 * 「【一句话】undefined」 in script.json — drop the whole value, or every 【marker】 whose value is only that (on its own
 * line, or inline before the next 【marker】 when the brief was flattened to one line).
 */
export function dropMissingBriefValues(text) {
  const s = String(text ?? '')
  if (/^\s*(?:undefined|null)\s*$/i.test(s)) return ''
  return s
    .replace(/^[ \t]*【[^】\r\n]{1,20}】[ \t]*(?:undefined|null)[ \t]*(?:\r?\n|$)/gim, '')
    .replace(/【[^】\r\n]{1,20}】[ \t]*(?:undefined|null)[ \t]*(?=【|\r?\n|$)/gi, '')
}

const BRIEF_TEXT_FIELDS = ['goal', 'userPrompt', 'polishedTopic', 'topic', 'title', 'displayTitle', 'directorNotes', 'genre', 'genreLabel']
function withoutMissingBriefValues(obj) {
  const out = { ...obj }
  for (const k of BRIEF_TEXT_FIELDS) if (typeof out[k] === 'string') out[k] = dropMissingBriefValues(out[k])
  return out
}

export function normalizeContentOutline(val) {
  if (Array.isArray(val)) {
    return val
      .map((x) => String(x ?? '').trim().replace(/^[-\d.、\s]+/, '').trim())
      .filter(Boolean)
  }
  const s = String(val ?? '').trim()
  if (!s) return []
  const byLines = s
    .split(/\r?\n+/)
    .map((x) => x.trim().replace(/^[-\d.、\s]+/, '').trim())
    .filter(Boolean)
  if (byLines.length > 1) return byLines
  // Legacy scripts saved by String(array) joined outline items with commas after '。' or before '标题：'
  const legacySplit = s
    .split(/(?<=。),|,(?=\s*(?:第\s*\d+\s*步|[\u4e00-\u9fa5A-Za-z0-9｜| ]{2,18}[：:]))/)
    .map((x) => x.trim().replace(/^[-\d.、\s]+/, '').trim())
    .filter(Boolean)
  return legacySplit.length > 1 ? legacySplit : byLines
}

export function formatDirectorBrief(scriptLike = {}) {
  if (!scriptLike || typeof scriptLike !== 'object') return ''
  scriptLike = withoutMissingBriefValues(scriptLike)
  const rawGoal = String(scriptLike.goal || scriptLike.userPrompt || scriptLike.polishedTopic || '').trim()
  const notes = String(scriptLike.directorNotes || '').trim()
  const outlineItems = normalizeContentOutline(scriptLike.contentOutline)
  const title = String(scriptLike.displayTitle || scriptLike.topic || scriptLike.title || '').trim()
  const genreLabel = String(scriptLike.genreLabel || '').trim()

  if (rawGoal && !BOILERPLATE_GOALS.has(rawGoal)) {
    // If rawGoal already contains full structured markers or detailed notes, show it directly.
    if (/【\s*(?:作品标题|体裁|内容要点|导演备注)/.test(rawGoal) || (!notes && outlineItems.length === 0) || rawGoal.length >= 60) {
      return rawGoal
    }
  }

  if (notes || outlineItems.length > 0) {
    const parts = []
    if (title) parts.push(`【作品标题】${title}`)
    if (genreLabel) parts.push(`【体裁】${genreLabel}`)
    const targetSec = Math.round(Number(scriptLike.targetDurationSec) || 0)
    if (scriptLike.durationMode === 'custom' && targetSec >= 10) {
      parts.push(`【目标时长】${targetSec} 秒`)
    }
    if (rawGoal && !BOILERPLATE_GOALS.has(rawGoal) && rawGoal !== title) {
      parts.push(`【一句话】${rawGoal}`)
    }
    if (outlineItems.length > 0) {
      parts.push(`【内容要点】\n${outlineItems.map((x, i) => `${i + 1}. ${x}`).join('\n')}`)
    }
    if (notes) {
      parts.push(`【导演备注（仅供 AI 制作，不会出现在视频里）】\n${notes}`)
    }
    return parts.join('\n')
  }

  if (rawGoal && !BOILERPLATE_GOALS.has(rawGoal)) return rawGoal
  return title
}

export function splitDirectorBrief(spec = {}) {
  spec = withoutMissingBriefValues(spec && typeof spec === 'object' ? spec : {})
  const rawTopic = String(spec.topic || '').trim()
  const sections = parseBriefSections(rawTopic)
  const explicitOutline = normalizeContentOutline(spec.contentOutline)
  const sectionOutline = normalizeContentOutline(sections.outline)
  const mergedOutline = explicitOutline.length > 0 ? explicitOutline : sectionOutline
  if (sections.hasMarkers) {
    const displayTitle = String(spec.displayTitle || '').trim() || sections.title || deriveDisplayTitle(rawTopic, '')
    const notes = [spec.directorNotes, sections.notes].map((x) => String(x || '').trim()).filter(Boolean)
    const directorNotes = Array.from(new Set(notes)).join('\n') || stripMetaInstructions(rawTopic) || rawTopic
    return {
      topic: (displayTitle || '作品').slice(0, 40),
      title: displayTitle || '作品',
      displayTitle: displayTitle || '作品',
      directorNotes,
      contentOutline: mergedOutline,
      genre: String(spec.genre || '').trim() || sections.genre,
      genreLabel: String(spec.genreLabel || '').trim() || sections.genreLabel,
      isBrief: true,
    }
  }
  const rawTitle = String(spec.title || '').trim()
  const explicit = String(spec.displayTitle || '').trim()
  const looksLikeBrief =
    rawTopic.length > 36 || isMetaInstructionText(rawTopic) || BRIEF_MARKER_RES.some((re) => re.test(rawTopic))
  const safeRawTitle = rawTitle && rawTitle.length <= 30 && !isMetaInstructionText(rawTitle) && !leaksBrief(rawTitle, [rawTopic]) ? rawTitle : ''

  const displayTitle =
    explicit ||
    (looksLikeBrief ? deriveDisplayTitle(rawTopic, safeRawTitle) : rawTopic) ||
    safeRawTitle ||
    ''

  const notes = []
  if (spec.directorNotes) notes.push(String(spec.directorNotes).trim())
  if (looksLikeBrief && rawTopic) notes.push(rawTopic)
  if (spec.userPrompt && String(spec.userPrompt).trim() !== rawTopic) notes.push(String(spec.userPrompt).trim())
  const directorNotes = Array.from(new Set(notes.filter(Boolean))).join('\n')

  const topic = (displayTitle || stripMetaInstructions(rawTopic) || rawTopic).slice(0, 40)
  return {
    topic,
    title: safeRawTitle || displayTitle || topic,
    displayTitle: displayTitle || topic,
    directorNotes,
    contentOutline: mergedOutline,
    genre: String(spec.genre || '').trim(),
    genreLabel: String(spec.genreLabel || '').trim(),
    isBrief: looksLikeBrief,
  }
}

function scrubText(text, briefs, { allowEmpty = true } = {}) {
  const s = String(text ?? '').trim()
  if (!s) return s
  let out = s
  if (leaksBrief(out, briefs)) return ''
  if (isMetaInstructionText(out)) out = stripMetaInstructions(out)
  else if (sentenceIsMeta(out) && out.length > 26) out = stripMetaInstructions(out)
  if (!out && !allowEmpty) return s.slice(0, 12)
  return out
}

/**
 * Final gate before write / render. Mutates `script` in place and returns { script, removed[] }.
 * Spoken (narration / subtitles) and on-screen (titles / tags / highlights) fields are all scrubbed.
 */
export const SCRUBBED_SCENE_TEXT_KEYS = ['narration', 'subtitleText', 'subtitleLine', 'title', 'tag', 'windowTitle', 'counterLabel', 'caption', 'text', 'kicker', 'headline', 'subheadline']
// spoken / subtitle text and scene titles only lose bracketed stage directions ("（推镜）"); the other keys are labels
const SPOKEN_SCENE_TEXT_KEYS = new Set(['narration', 'subtitleText', 'subtitleLine', 'title'])
// on-screen word lists of a scene (slips, plaques, keyword stamps…)
const SCENE_LABEL_LIST_KEYS = ['highlights', 'accentWords', 'keywords']
const STAGE_LABEL_LIST_KEYS = ['plaques', 'slips', 'calligraphy']

/** Key for `trusted`: a scene text field the user changed in the current save (see writeScriptJson's trustedSceneText). */
export const trustedSceneTextKey = (sceneId, field) => `${sceneId}\u0000${field}`

export function sanitizeScriptForRender(script, { trusted = null } = {}) {
  const removed = []
  if (!script || typeof script !== 'object') return { script, removed }
  // An over-long topic is a brief too (it is moved into directorNotes below). Registering it up front keeps the gate
  // idempotent: a second write of the same script must not scrub anything the first write kept.
  const longTopic = String(script.topic || '').length > 40 ? script.topic : ''
  const briefs = [script.directorNotes, script.goal, script.userPrompt, script.briefRaw, longTopic]
    .map((x) => String(x || '').trim())
    .filter((x) => x.length >= 24)

  // Text the user wrote by hand (recorded in `script.userOverrides` by the editors) is never scrubbed: quoting your own
  // brief in your own narration is legitimate. The gate exists for AI output (brief / director notes echoed on screen).
  const overrides = script.userOverrides && typeof script.userOverrides === 'object' ? script.userOverrides : {}
  const userOwned = (sc, key) => {
    if (trusted && sc && sc.id && trusted.has(trustedSceneTextKey(sc.id, key))) return true
    const o = sc && sc.id ? overrides[sc.id] : null
    return Boolean(o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, key) && String(o[key] ?? '') === String(sc[key] ?? ''))
  }

  // On-screen labels must not show motion / production directives (「竹节弹簧回弹」「书法字逐字砸」) — except in films
  // about video making, where effect words are the content (an editing tutorial listing 「转场 · 特效」).
  const directives = !isEditingTopic(script)
  // mode 'label': whole-directive labels / segments are removed; 'spoken': only bracketed stage directions
  const clean = (text, mode, opts) => {
    const t = scrubText(text, briefs, opts)
    if (!directives || typeof t !== 'string' || !mode) return t
    return stripDirectivePhrases(t, { bracketsOnly: mode === 'spoken' })
  }
  const scrub = (obj, key, opts, mode = 'label') => {
    if (!obj || typeof obj[key] !== 'string') return
    const before = obj[key]
    const after = clean(before, mode, opts)
    if (after !== before) {
      removed.push({ field: key, before: before.slice(0, 60) })
      obj[key] = after
    }
  }
  // word lists (strings, or objects with a text / label / title) → cleaned, emptied entries dropped
  const scrubList = (list, field) =>
    list
      .map((item) => {
        if (typeof item === 'string') {
          const after = clean(item, 'label')
          if (after !== item) removed.push({ field, before: item.slice(0, 60) })
          return after
        }
        if (!item || typeof item !== 'object') return item
        let out = item
        for (const k of ['text', 'label', 'title']) {
          if (typeof out[k] !== 'string') continue
          const after = clean(out[k], 'label')
          if (after !== out[k]) {
            removed.push({ field: `${field}.${k}`, before: out[k].slice(0, 60) })
            out = { ...out, [k]: after }
          }
        }
        return out
      })
      .filter((item) => (typeof item === 'string' ? Boolean(item) : !(item && typeof item === 'object' && ['text', 'label'].some((k) => k in item) && !String(item.text || item.label || '').trim())))

  // Script-level on-screen title. A short title naturally reuses words of the brief ("DSH Video Workbench：双引擎全链路…"),
  // so only a title longer than 40 chars (a pasted brief) gets the brief-overlap test; every title is checked for
  // meta instructions. (Re-deriving a short title from itself only cut it at its first comma / colon.)
  const titleBefore = String(script.title || '')
  const titleAfter = scrubText(titleBefore, titleBefore.length > 40 ? briefs : [])
  if (titleAfter !== titleBefore || titleBefore.length > 40) {
    removed.push({ field: 'title', before: titleBefore.slice(0, 60) })
    script.title = titleAfter && titleAfter.length <= 40 ? titleAfter : deriveDisplayTitle(titleBefore, script.topic && script.topic.length <= 40 ? script.topic : '作品')
  }
  if (String(script.topic || '').length > 40 || isMetaInstructionText(script.topic)) {
    removed.push({ field: 'topic', before: String(script.topic || '').slice(0, 60) })
    script.directorNotes = Array.from(new Set([script.directorNotes, script.topic].filter(Boolean))).join('\n')
    // the topic is a short subject: the (already safe) title is the best one; derive from the brief only without it
    const safeTitle = String(script.title || '').trim()
    script.topic = safeTitle && safeTitle.length <= 40 && !isMetaInstructionText(safeTitle) ? safeTitle : deriveDisplayTitle(script.topic, script.title || '作品')
  }

  for (const sc of script.scenes || []) {
    for (const key of SCRUBBED_SCENE_TEXT_KEYS) {
      if (userOwned(sc, key)) continue
      scrub(sc, key, undefined, SPOKEN_SCENE_TEXT_KEYS.has(key) ? 'spoken' : 'label')
    }
    // subtitle chunks / cues are cut from the narration (or the on-screen subtitle text): user-written → keep them too
    const userSpoken = ['narration', 'subtitleText', 'subtitleLine'].some((k) => userOwned(sc, k))
    if (Array.isArray(sc.subChunks) && !userSpoken) {
      sc.subChunks = sc.subChunks.map((c) => clean(c, 'spoken')).filter(Boolean)
    }
    if (Array.isArray(sc.subtitles) && !userSpoken) {
      sc.subtitles = sc.subtitles
        .map((c) => {
          if (!c || typeof c.text !== 'string') return c
          const text = clean(c.text, 'spoken')
          return text === c.text ? c : { ...c, text }
        })
        .filter((c) => c && scrubText(c.text, briefs))
    }
    // beat-aligned sub-shots carry their subtitle chunk (scene.cuts[].text); the cut itself (timing) always stays
    if (Array.isArray(sc.cuts) && !userSpoken) {
      sc.cuts = sc.cuts.map((c) => {
        if (!c || typeof c.text !== 'string') return c
        const text = clean(c.text, 'spoken')
        return text === c.text ? c : { ...c, text }
      })
    }
    for (const key of SCENE_LABEL_LIST_KEYS) {
      if (Array.isArray(sc[key]) && !userOwned(sc, key)) sc[key] = scrubList(sc[key], key)
    }
    for (const side of ['compareLeft', 'compareRight']) {
      if (sc[side] && typeof sc[side] === 'object') {
        scrub(sc[side], 'label')
        scrub(sc[side], 'text')
      }
    }
    if (Array.isArray(sc.metrics)) {
      for (const m of sc.metrics) scrub(m, 'label')
    }
    if (sc.stageSpec && typeof sc.stageSpec === 'object') {
      for (const key of ['headline', 'subheadline', 'sealText']) scrub(sc.stageSpec, key)
      for (const key of STAGE_LABEL_LIST_KEYS) {
        if (Array.isArray(sc.stageSpec[key])) sc.stageSpec[key] = scrubList(sc.stageSpec[key], `stageSpec.${key}`)
      }
    }
    if (!String(sc.narration || '').trim() && String(sc.title || '').trim() && sc.voiceMode !== 'silent') {
      // Never leave a speaking scene empty after scrubbing
      sc.narration = sc.title
    }
  }
  return { script, removed }
}

