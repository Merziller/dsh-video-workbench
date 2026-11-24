/**
 * Genre router — universal creation-category routing.
 *
 * NOT a template library. Each profile only describes the *visual language, pacing and voice casting*
 * that fits a category, and lists which free-coding techniques the AI coder may combine. The LLM is
 * always free to invent new visuals (genre `other` / custom) — profiles are guidance, never a cage.
 */

// Historical content cues. Only multi-character words count: single characters such as 汉 / 明 / 宋 / 楚 / 唐 / 秦 also
// appear in 汉堡, 说明, 宋体, 清楚, 唐老鸭, 秦岭… and used to route coffee-shop or product videos into battle-epic rules.
// Generic cues (历史 / 古代 / 文物…) name no era: alone they also occur in theory and modern-life briefs (see below).
const HISTORY_GENERIC_CUES = '历史|古代|古时候|古人|朝代|王朝|皇朝|帝国|文物|考古|historical|ancient|dynasty'
const HISTORY_SPECIFIC_CUES =
  '战国|春秋|先秦|秦朝|秦国|秦军|秦始皇|始皇帝|大秦|汉朝|汉代|西汉|东汉|大汉|汉武帝|汉军|汉王|楚汉|楚国|楚军|楚王|西楚|霸王|项羽|刘邦|韩信|三国|魏蜀吴|蜀汉|曹操|诸葛亮|唐朝|唐代|大唐|盛唐|李世民|宋朝|宋代|北宋|南宋|元朝|明朝|明代|大明|清朝|清代|大清|晚清|隋朝|晋朝|五代十国|商周|夏商|古装|古风|武侠|演义|战役|冠军侯|霍去病|卫青|封狼居胥|甲骨文|青铜器|丝绸之路|古罗马|罗马帝国|古希腊|中世纪|十字军|维京|法老|拿破仑|二战|一战|抗战|史诗战争|medieval|roman empire|pharaoh|viking|samurai'
const HISTORY_STRONG_CUES = `${HISTORY_GENERIC_CUES}|${HISTORY_SPECIFIC_CUES}`
const HISTORY_WEAK_CUES = '将军|帝王|皇帝|君王|诸侯|宰相|丞相|宫廷|江湖|侠客|兵法|骑士|城池|攻城|铁骑|emperor|knight|warlord'
const HISTORY_SPECIFIC_RX = new RegExp(HISTORY_SPECIFIC_CUES, 'i')
const HISTORY_GENERIC_RX_G = new RegExp(HISTORY_GENERIC_CUES, 'gi')
const HISTORY_WEAK_RX_G = new RegExp(HISTORY_WEAK_CUES, 'gi')
// Words that contain a history cue but name no historical era: theory terms (历史唯物主义 / 历史使命), records and
// statistics (历史新高 / 浏览历史), modern empires (商业帝国) and set phrases (古人云). Removed before any cue test, so
// a 毛选 / 马克思主义 study film or a market report never turns into a battle epic.
export const NON_HISTORICAL_COMPOUNDS_RX =
  /历史唯物主义|历史唯心主义|历史观|历史使命|历史任务|历史责任|历史担当|历史规律|历史潮流|历史必然|历史周期律|历史机遇|历史新高|历史新低|历史最高|历史最低|历史高位|历史低位|历史纪录|历史记录|历史数据|历史版本|历史消息|历史订单|历史账单|历史搜索|浏览历史|搜索历史|播放历史|聊天历史|历史遗留|创历史|改写历史|载入史册|商业帝国|科技帝国|互联网帝国|电商帝国|娱乐帝国|金融帝国|帝国大厦|古人云|古人说|古人讲|古人言|古人曰|古人常说/g
// Modern-life and theory context: with two of these, a bare generic cue (回顾历史, 古代…) is a remark, not a period film
const MODERN_CONTEXT_RX_G =
  /现代|当代|如今|当下|现实|打工人|上班族|职场|外卖|骑手|快递|网约车|工厂|车间|流水线|工人|农民工|裁员|失业|房租|房贷|电商|直播|网购|手机|互联网|公司|员工|毕业生|大学生|考研|算法|大数据|人工智能|理论|毛选|毛泽东选集|马克思|恩格斯|列宁|唯物|辩证|阶级|资本论|剩余价值|政治经济学|哲学|社会学|经济学/g

const withoutNonHistoricalCompounds = (s) => String(s || '').replace(NON_HISTORICAL_COMPOUNDS_RX, ' ')

/**
 * True when the text is clearly about history / ancient times: one era-specific cue (a dynasty, a historical figure,
 * 古装…), a generic cue (历史 / 古代…) that is not just a remark inside a modern-life or theory brief, or two weak cues
 * (将军 + 攻城…). Fairy-tale words alone (皇帝, 公主) and theory terms (历史唯物主义) do not qualify.
 */
export function isHistoricalContent(text = '') {
  const s = withoutNonHistoricalCompounds(text)
  if (!s.trim()) return false
  if (HISTORY_SPECIFIC_RX.test(s)) return true
  const generic = s.match(HISTORY_GENERIC_RX_G)
  if (generic) {
    const modern = new Set(s.match(MODERN_CONTEXT_RX_G) || [])
    if (modern.size < 2) return true
  }
  const weak = s.match(HISTORY_WEAK_RX_G)
  return Boolean(weak && new Set(weak).size >= 2)
}

// War / battle / martial-arts action. Only this content gets battle vocabulary (troops, blade clashes, conquest maps,
// war drums); a history lecture, a theory text or a 职场如战场 metaphor does not.
const WAR_COMBAT_CUES =
  '战争|战役|战场|作战|打仗|开战|交战|激战|鏖战|厮杀|交锋|会战|征战|出征|北伐|东征|西征|南征|远征|攻城|守城|围城|破城|行军|军阵|大军|千军万马|金戈铁马|铁骑|骑兵|冷兵器|刀光剑影|兵法|武将|名将|将领|元帅|武侠|侠客|剑客|抗战|二战|一战|十字军|封狼居胥|霍去病|卫青|项羽|韩信|白起|岳飞|关羽|吕布|赵云|拿破仑|warfare|battlefield|battle|samurai|knight'
const WAR_COMBAT_RX_G = new RegExp(WAR_COMBAT_CUES, 'gi')

/** True for war / battle / martial-arts content: two war cues, or one in a clearly historical text. */
export function isWarCombatContent(text = '') {
  const s = withoutNonHistoricalCompounds(text)
  if (!s.trim()) return false
  const hits = new Set((s.match(WAR_COMBAT_RX_G) || []).map((x) => x.toLowerCase()))
  if (hits.size >= 2) return true
  return hits.size === 1 && isHistoricalContent(s)
}

/** Epic battle treatment (war drums, steel clashes, slash wipes) only for history films and history-themed MVs. */
export function isEpicCombatContext({ genre = '', text = '' } = {}) {
  const g = String(genre || '').toLowerCase()
  if (g === 'history-theater') return true
  if (g === 'mv-lyric') return isHistoricalContent(text)
  return false
}

export const GENRE_PROFILES = [
  {
    id: 'code-animation',
    label: '代码动画 / Vibecoding 科技演示',
    summary: '代码、AI、技术原理的动态演示（代码流、架构图、数据流动）',
    detect: /代码|编程|vibe|算法|架构|开源|api|框架|前端|后端|AI 工具|大模型|agent|智能体|数据结构|程序员|终端|命令行|技术原理/i,
    visualLanguage: '深色或高对比科技底，Three.js 三维几何/粒子空间 + 动态 SVG 架构拓扑 + HUD 代码流/遥测面板；镜头做 3D 透视推拉。',
    techniques: ['FreeformThreeStage 自由 3D 造景', '动态 SVG 架构图/数据包沿路径流动', 'HUD 实时代码流与仪表盘', '节拍同步弹簧物理 spring/interpolate'],
    pacing: '3~6 秒/镜，信息密度高，关键词弹出',
    voice: '清亮、节奏明快、自信的科技解说男声/女声',
    style: 'tech',
  },
  {
    id: 'ui-tutorial',
    label: '软件实操教程 / 产品使用演示',
    summary: '软件界面的操作教程（有截图或录屏时最合适）',
    detect: /教程|实操|使用说明|怎么用|如何使用|操作步骤|上手|入门|演示软件|功能介绍|界面|点击|工作台/i,
    visualLanguage: '亮色高对比真实界面截图（2x 高清）为主角：镜头推近到当前操作的按钮/抽屉，鼠标光标移动 + 点击波纹 + 面板滑出 + 输入逐字打出；步骤编号与要点标注。',
    techniques: ['UiWalkthrough 局部特写推拉运镜', '高拟真光标轨迹与点击涟漪', '抽屉/弹窗滑出过渡', '输入框逐字打字', '步骤角标与高亮框'],
    pacing: '每个操作一个镜头，先讲目的再演示，节奏清晰不拖沓',
    voice: '清亮亲切、抑扬顿挫、略带笑意的真人讲解音色，语速 1.05~1.12',
    style: 'tech',
  },
  {
    id: 'stickman-story',
    label: '火柴人 / 角色故事动画',
    summary: '角色故事动画：名人小故事、寓言童话、搞笑段子（人物画风随故事而定）',
    detect: /火柴人|简笔画|角色|卡通|漫画|小人|故事动画|剧情|搞笑|段子|寓言|童话/i,
    visualLanguage: '角色故事动画：人物画风跟着故事走——火柴人可直接用人物库 Figure style="stick"，卡通、绘本、Q版等画风自己设计角色（同一角色全片统一）；做跑跳、指点、对话等关节动作，场景用简笔背景、拟声字、对话气泡、速度线。',
    techniques: ['火柴人用 Figure style="stick"，其它画风自己设计角色', 'script 动作序列与关节动画', '对话气泡与拟声字', '场景推拉与速度线', '道具切换'],
    pacing: '随剧情起伏，动作镜头短（1.5~3s），对白镜头 3~5s',
    voice: '生动有戏、情绪起伏明显的故事讲述音色，可按角色切换',
    style: 'warm',
  },
  {
    id: 'history-theater',
    label: '历史剧场 / 史诗卡点动画',
    summary: '战争、战役、武侠打斗等古代动作史诗（只用于真正讲战争、打斗的内容；历史文化讲解不用它）',
    detect: new RegExp(`${HISTORY_STRONG_CUES}|${HISTORY_WEAK_CUES}|人物传`, 'i'),
    visualLanguage: '史诗动画：每幕都有活的动画人物主体（用人物库 Figure / Horse / Troop，或按要求的画风自己画，做出将领、帝王、骑兵、军阵的真实动作：挥戟、策马、回首、拱手、跪坐、举杯），配合斩击光与冲击波（SlashBurstOverlay）、疆域攻占地图（StrategicMapStage）、竹简与书法印章（CalligraphyColumnPanel）、火星烟尘与鼓点运镜；没有特别要求时，逆光剪影 + 轮廓光 + 披风盔缨点缀色很出效果（用户要求国风插画、Q版、水墨等其它画风时照用户的）；严禁退化成只有几条空山脉线条的静态宣纸 PPT！',
    techniques: ['Figure / Horse / Troop 人物、战马与军阵（或自绘角色）', 'SlashBurstOverlay 斩击光+冲击波环', 'StrategicMapStage 攻占路线地图+印章落锤', '竹简/牌匾与纵排书法大字', '鼓点镜头推拉+斜劈转场'],
    pacing: '纯音乐高燃卡点快切（常规 2~4 拍约 1.5~3s，高潮突降点 0.5~1 拍连切，镜头数按目标时长换算）；配音解说则张弛有度',
    voice: '纯音乐卡点优先免 TTS；需解说时选用富有张力、史诗浑厚的中年男声',
    style: 'cinematic',
  },
  {
    id: 'talking-head',
    label: '真人口播 / 访谈包装',
    summary: '真人出镜口播、访谈包装',
    detect: /口播|真人出镜|出镜|主播|vlog|采访|访谈|自拍|讲课|知识分享|带货/i,
    visualLanguage: '真人画面为主，包装 B-Roll 画中画、关键词卡片、下三分之一字幕条、数据弹窗与动态强调字幕。',
    techniques: ['动态 B-Roll 画中画', '关键词弹出卡片', '下三分之一信息条', '重点字幕强调', '段落转场与章节标'],
    pacing: '口播为主线，每 6~10 秒一次视觉强调',
    voice: '使用真人原声；无真人时选自然亲切的主播音色',
    style: 'energetic',
  },
  {
    id: 'digital-human',
    label: '数字人口播 / 虚拟主播',
    summary: '数字人 / 虚拟主播口播',
    detect: /数字人|虚拟主播|虚拟人|数字分身|ai 主播|克隆/i,
    visualLanguage: '数字人透明通道叠加在信息画面上，配合图文包装、数据面板、品牌色背景，口型与重音同步。',
    techniques: ['透明数字人叠层', '信息图表与卡片包装', '品牌色背景粒子', '重音动效'],
    pacing: '稳健解说 4~6s/镜',
    voice: '与数字人形象匹配的清晰克隆/主播音色',
    style: 'tech',
  },
  {
    id: 'product-promo',
    label: '产品宣发 / 发布会短片',
    summary: '产品介绍、发布会、门店活动宣传',
    detect: /产品|发布|宣传片|宣发|新品|品牌|上线|更新日志|release|对比|参数|卖点/i,
    visualLanguage: '设备/界面样机、卖点特写、指标计数器、对比滑动、品牌主色光效。',
    techniques: ['设备样机与界面特写', '指标数字滚动', '前后对比擦除', '品牌色光效与粒子', '3D 产品旋转'],
    pacing: '开场钩子 3 秒内，卖点 3~5s/镜，收尾号召',
    voice: '自信、有感染力的商业解说音色',
    style: 'energetic',
  },
  {
    id: 'science-explainer',
    label: '科普讲解 / 概念可视化',
    summary: '科普与原理讲解：示意图、剖面、模型与类比',
    detect: /科普|原理|为什么|是什么|物理|化学|生物|天文|宇宙|数学|公式|实验|地理|医学/i,
    visualLanguage: '用图解说话：SVG 示意图逐步生长、3D 模型旋转拆解、公式推导动画、坐标系与曲线、类比小动画。',
    techniques: ['SVG 图解逐步生长', 'Three.js 3D 模型/分子/星球', '公式推导 KaTeX 式排版动画', '数据曲线与坐标系'],
    pacing: '一镜一概念，4~7s，先问题后结论',
    voice: '温和清晰、有启发感的讲解音色',
    style: 'documentary',
  },
  {
    id: 'data-story',
    label: '数据故事 / 信息图',
    summary: '数据故事与信息图表',
    detect: /数据|图表|统计|报告|趋势|排行|增长|财报|榜单|可视化/i,
    visualLanguage: '动态图表（柱/折线/环形/地图）逐帧生长，计数器与高亮注释，关键数字放大。',
    techniques: ['SVG 动态图表', '计数器滚动', '高亮注释与指向线', '地图/网络图'],
    pacing: '一镜一结论，4~6s',
    voice: '冷静可信的解说音色',
    style: 'documentary',
  },
  {
    id: 'brand-story',
    label: '品牌故事 / 情感短片',
    summary: '品牌故事、情感、公益、纪念短片',
    detect: /品牌故事|情感|温情|回忆|治愈|故事短片|致敬|纪念|公益/i,
    visualLanguage: '温暖留白，摄影/插画图片慢推镜，细腻文字排版与柔光，节奏舒缓。',
    techniques: ['图片 Ken Burns', '文字排版动画', '柔光与颗粒质感', '音乐驱动淡入淡出'],
    pacing: '4~7s/镜，从容留白',
    voice: '温柔、娓娓道来的叙事音色',
    style: 'warm',
  },
  {
    id: 'mv-lyric',
    label: '音乐卡点 / 歌词 MV',
    summary: '音乐 MV、歌词视频、音乐混剪',
    detect: /卡点|歌词|mv|混剪|节奏视频|踩点|律动|音乐视频/i,
    visualLanguage: '节拍驱动的动态字幕与粒子，鼓点瞬间切镜与冲击波。',
    techniques: ['节拍驱动 Kinetic Typography', '粒子冲击波', '0.5/1/2/4 拍切镜', '频谱可视化'],
    pacing: '随 BPM 半拍/一拍切镜',
    voice: '可无旁白，纯音乐',
    style: 'energetic',
  },
  {
    id: 'other',
    label: '自由创作（任意其他题材）',
    summary: '以上都不合适的任何题材',
    detect: /$^/,
    visualLanguage: '根据题材自行发明最贴切的视觉语言：自由组合 Three.js / SVG / Canvas / 图片 / 视频 / 文字排版，不套用任何固定版式。',
    techniques: ['FreeformThreeStage', '动态 SVG', 'Canvas 2D 绘制', '图片视频包装', '弹簧物理'],
    pacing: '依内容自行设计',
    voice: '依题材由 AI 从音色库选择最贴切的一款',
    style: 'cinematic',
  },
]

const OPEN_GENRE_PROFILE = GENRE_PROFILES[GENRE_PROFILES.length - 1]

export function getGenreProfile(id) {
  const key = String(id || '').trim()
  return GENRE_PROFILES.find((g) => g.id === key || g.label === key) || OPEN_GENRE_PROFILE
}

/**
 * Resolve normalized genre id + custom human-readable label (`genreLabel`) across any creative category.
 * Known profiles act only as starter routing hints; custom/unlisted genres always map cleanly to `'other'`
 * while preserving the exact AI-invented or user-specified `label` end-to-end.
 */
export function resolveGenreSelection({ genre = '', genreLabel = '', text = '', hasScreenshots = false } = {}) {
  const rawGenre = String(genre || '').trim()
  const rawLabel = String(genreLabel || '').trim()
  const isGenericOtherLabel = !rawLabel || rawLabel === OPEN_GENRE_PROFILE.label

  const matchBuiltin = (q) =>
    q && q.toLowerCase() !== 'auto' ? GENRE_PROFILES.find((g) => g.id === q || g.label === q) || null : null

  const byGenre = matchBuiltin(rawGenre)
  if (byGenre && byGenre.id !== 'other') {
    return {
      id: byGenre.id,
      label: isGenericOtherLabel ? byGenre.label : rawLabel,
      isCustom: false,
      profile: byGenre,
    }
  }

  if (rawGenre && rawGenre.toLowerCase() !== 'auto') {
    const byLabelFromGenre = rawGenre === 'other' ? matchBuiltin(rawLabel) : null
    if (byLabelFromGenre && byLabelFromGenre.id !== 'other') {
      return {
        id: byLabelFromGenre.id,
        label: rawLabel,
        isCustom: false,
        profile: byLabelFromGenre,
      }
    }
    const preservedLabel = !isGenericOtherLabel
      ? rawLabel
      : rawGenre !== 'other'
        ? rawGenre
        : OPEN_GENRE_PROFILE.label
    return {
      id: 'other',
      label: preservedLabel,
      isCustom: true,
      profile: OPEN_GENRE_PROFILE,
    }
  }

  if (rawLabel) {
    const byLabel = matchBuiltin(rawLabel)
    if (byLabel && byLabel.id !== 'other') {
      return {
        id: byLabel.id,
        label: rawLabel,
        isCustom: false,
        profile: byLabel,
      }
    }
    return {
      id: 'other',
      label: rawLabel,
      isCustom: true,
      profile: OPEN_GENRE_PROFILE,
    }
  }

  const detectedId = detectGenre(text, hasScreenshots)
  const detectedProfile = getGenreProfile(detectedId)
  return {
    id: detectedId,
    label: detectedProfile.label,
    isCustom: detectedId === 'other',
    profile: detectedProfile,
  }
}

/** Detect the most likely genre id from free text or options object; returns 'other' when nothing matches. */
export function detectGenre(textOrOpts = '', hasScreenshots = false) {
  let s = ''
  let hasMedia = Boolean(hasScreenshots)
  if (textOrOpts && typeof textOrOpts === 'object') {
    s = `${textOrOpts.topic || ''} ${textOrOpts.title || ''} ${textOrOpts.goal || ''} ${textOrOpts.style || ''}`.trim()
    hasMedia = Boolean(textOrOpts.hasMedia ?? textOrOpts.hasScreenshots ?? hasScreenshots)
  } else {
    s = String(textOrOpts || '')
  }
  let best = { id: 'other', score: 0 }
  // the battle-epic genre only for historical content (历史唯物主义 / 回顾历史 in a theory or modern-life brief is not)
  const historical = isHistoricalContent(s)
  const sHist = withoutNonHistoricalCompounds(s)
  for (const g of GENRE_PROFILES) {
    if (g.id === 'other') continue
    if (g.id === 'history-theater' && !historical) continue
    const m = (g.id === 'history-theater' ? sHist : s).match(new RegExp(g.detect.source, 'gi'))
    const score = m ? m.length : 0
    if (score > best.score) best = { id: g.id, score }
  }
  if (hasMedia && /教程|实操|使用|演示|操作步骤|界面|功能/.test(s)) {
    return 'ui-tutorial'
  }
  if (/使用教程|操作教程|全量教程|全功能教程|新手教程|怎么用|如何使用/.test(s)) {
    return 'ui-tutorial'
  }
  return best.id
}

/**
 * Compact catalogue for the polish prompt (starter reference only — the LLM is always free to invent any genre).
 * One neutral line per genre: no library component names and no genre-specific effects, so a theory, knowledge or
 * product brief is never offered the battle-epic vocabulary of another genre.
 */
export function listGenresForPrompt() {
  return GENRE_PROFILES.filter((g) => g.id !== 'other')
    .map((g) => `- ${g.id}（${g.label}）：${g.summary || g.label}`)
    .join('\n')
}

/** Genre-specific direction block for director / coder prompts (preserves arbitrary custom `genreLabel`). */
export function buildGenreGuidance(idOrOpts, customLabel = '') {
  const opts =
    idOrOpts && typeof idOrOpts === 'object'
      ? { genre: idOrOpts.genre || idOrOpts.id || '', genreLabel: idOrOpts.genreLabel || customLabel || '' }
      : { genre: String(idOrOpts || ''), genreLabel: String(customLabel || '') }
  const { label, isCustom, profile: g } = resolveGenreSelection(opts)
  return [
    `【体裁定位：${label}${isCustom ? '（自定义开放体裁 · 100% 自由创作）' : '（常见题材参考起点 · 不设任何上限）'}】`,
    `视觉语言建议：${g.visualLanguage}`,
    `可自由组合或全新发明的写码技法：${g.techniques.join('、')}（仅作启发起点 —— 请严格围绕「${label}」自行发明专属视觉语法与 React / Three.js 3D / SVG / Canvas 舞台，严禁生搬硬套其它题材的固定版式或卡片模板）`,
    `节奏参考：${g.pacing}`,
    `配音取向：${g.voice}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------- content families
//
// What a video is ABOUT decides its visual vocabulary (pictures, camera, transitions, effects, sound, type, people,
// voice). The genre ids above route the production pipeline; these families only feed the AI 润色 brief, so a theory
// lesson, a recipe or a product film gets words that fit it instead of another genre's signature effects. Every entry
// is a starting point for the model, never a template. `genre` is the genre id that usually fits ('' = depends).

const WAR_EPIC_CUES = WAR_COMBAT_CUES
export const CONTENT_FAMILIES = [
  {
    id: 'theory',
    label: '理论学习 / 思想解读',
    genre: 'other',
    cues: '毛选|毛泽东选集|毛泽东思想|毛主席|马克思|恩格斯|列宁|资本论|共产党宣言|唯物|辩证|矛盾论|实践论|阶级|剩余价值|政治经济学|哲学|社会学|社科|思政|党课|党史|理论|原著|经典著作|方法论|世界观|价值观|生产关系|生产力|上层建筑|意识形态|读书会|心得体会',
    brief: '原著金句 + 概念关系图 + 现实人物处境，从具体困境讲到普遍规律',
    visuals: '原著书页与金句大字（翻开的书、笔记、批注）；把抽象概念画成看得懂的图：人群分层、天平、阶梯、节点连线、同心圆、对照表；与主题相关的现实人物与生活场景（按需求选择，例如劳动者、学生、店主）；从个人处境推到普遍规律的对照画面',
    camera: '从现实场景推近到能说明问题的细节（例如工资条、订单倒计时、账单），再拉远成概念图；分屏对照两种处境；结论段落稳定缓推',
    transitions: '翻书页、匹配剪辑（现实物件变成图表元素）、分屏滑入、光线由暗转亮',
    effects: '关键词描红高亮、手写批注线、节点连线逐条生长、细节特写标注、金句逐字浮现',
    sfx: '翻书、钢笔书写、钟表滴答、与场景相符的环境声（雨声、车流、机器声等）、钢琴或弦乐',
    look: '标题用衬线体大字（书籍感），正文无衬线；纸张米白或深色底 + 一个主色（如中国红）；现实段落偏冷，结论段落转暖',
    people: '现代普通人物，形象朴实可信，表情和动作贴近生活；常用扁平插画或写实插画',
    voice: '沉稳真诚、有温度的讲述，不浮夸、不喊口号',
    beat: '金句与关键词落在重拍上，翻书、落笔、钟表等音效对齐鼓点；高潮段关键词连续出现、现实画面快切',
  },
  {
    id: 'science',
    label: '科普 / 原理讲解',
    genre: 'science-explainer',
    cues: '科普|原理|物理|化学|生物|天文|宇宙|星系|行星|数学|公式|定理|实验|地理|地质|医学|人体|细胞|分子|原子|基因|量子|气候|能量|进化|病毒|细菌|大脑|神经',
    brief: '示意图逐步生长、剖面分解、尺度缩放，一镜讲清一个概念',
    visuals: '示意图逐步生长、剖面与分解图、3D 模型旋转、坐标系与曲线、从宏观到微观的尺度缩放、实验过程演示、生活中的类比画面',
    camera: '推进穿越尺度（例如地球→城市→细胞）、环绕 3D 模型、跟随粒子或能量流动',
    transitions: '缩放穿越、形状匹配转场、分屏对比',
    effects: '粒子流、能量线、标注引线、公式逐项推导、刻度与数值滚动',
    sfx: '轻柔的科技提示音、计量滴答、低频氛围音、实验器材声',
    look: '无衬线字体 + 等宽数字；深蓝或深灰底配青、橙对比色，或清爽白底',
    people: '需要时出现科学家、讲解员或提问的孩子；常用扁平插画',
    voice: '温和清晰、有启发感的讲解',
    beat: '每个结论或关键数据落在重拍上',
  },
  {
    id: 'food',
    label: '美食 / 探店 / 烹饪',
    genre: 'other',
    cues: '美食|菜谱|做法|烹饪|下厨|料理|食材|小吃|探店|餐厅|饭店|咖啡|奶茶|甜品|烘焙|火锅|面包|蛋糕|饮品|厨房|家常|汉堡|早餐|夜宵',
    brief: '食材特写、烹饪过程、热气与油光、成品与品尝表情',
    visuals: '食材特写、烹饪过程（切配、翻炒、蒸汽、酱汁滴落）、成品摆盘、品尝时的表情、店铺环境与招牌',
    camera: '俯拍、微距推近、慢动作、围绕成品环绕',
    transitions: '俯拍转场、食材划过画面的遮挡转场、旋转、叠化',
    effects: '升腾热气、油光高光、慢动作滴落、手写价格或标签',
    sfx: '切菜、热油滋啦声、沸腾、碗筷碰撞、店内人声、轻快或爵士音乐',
    look: '圆润的手写感或粗体标签字；暖色、高饱和的食物色、柔光',
    people: '厨师、店主、食客；常用扁平插画或写实插画',
    voice: '亲切、有食欲感的讲述',
    beat: '下锅、出锅、上桌等关键动作落在重拍上',
  },
  {
    id: 'tutorial',
    label: '教程 / 操作演示 / 手作',
    genre: '',
    genreNote: '软件界面教程填 ui-tutorial；手工、烹饪等实物教程填 other',
    cues: '教程|教学|步骤|实操|上手|入门|操作|演示|指南|攻略|怎么用|如何使用|手把手|安装|配置|设置|技巧|DIY|手工|手作',
    brief: '一步一镜：操作特写 + 步骤编号 + 前后对比',
    visuals: '每一步一个镜头：操作特写（软件界面或双手动作）、步骤编号、做完前后的对比、易错点提醒',
    camera: '推近到正在操作的位置、步骤之间平移、完成时拉远看全貌',
    transitions: '步骤滑动、放大到操作点、完成后切下一步',
    effects: '点击涟漪、高亮框、箭头指引、完成对勾、步骤进度条',
    sfx: '点击、打字、轻提示音、完成音',
    look: '亮色清爽底，步骤编号大字 + 简短说明',
    people: '操作者的双手或讲解员（需要时）',
    voice: '清晰耐心、语速适中的讲解',
    beat: '每一步完成落在乐句结尾或重拍上',
  },
  {
    id: 'product',
    label: '产品介绍 / 品牌宣传',
    genre: 'product-promo',
    cues: '产品|新品|发布|宣传片|宣发|品牌|卖点|上线|功能|参数|旗舰|插件|工具|服务|活动|促销|门店|上新|开业',
    brief: '产品与界面特写、使用场景、卖点数字、前后对比',
    visuals: '产品或界面样机特写、真实使用场景、卖点数字、前后对比、品牌色光效（有上传素材时以真实素材为主）',
    camera: '环绕产品、推近细节、横移展示多个界面',
    transitions: '光扫转场、缩放转场、滑动、遮罩擦除',
    effects: '光泽扫过、数字滚动、卖点标签弹出、粒子点缀',
    sfx: '利落的 whoosh、点击、闪光提示音、开场与收尾的低频冲击',
    look: '品牌气质的无衬线粗体，卖点数字放大；品牌主色 + 中性底色',
    people: '需要时出现用户、店员或开发者的使用场景；常用扁平插画或写实插画',
    voice: '自信、有感染力的商业解说',
    beat: '卖点出现对齐重拍，开场 3 秒内抓住注意力',
  },
  {
    id: 'tech',
    label: '代码 / AI / 技术原理',
    genre: 'code-animation',
    cues: '代码|编程|算法|架构|大模型|人工智能|\\bAI\\b|agent|智能体|开发者|程序员|\\bAPI\\b|数据库|服务器|开源|源码|技术原理|vibe|前端|后端|终端|命令行',
    brief: '代码流、架构拓扑、数据流动、3D 几何与信息面板',
    visuals: '代码流与终端窗口、架构拓扑图、数据包沿路径流动、3D 几何或粒子空间、HUD 信息面板',
    camera: '3D 透视推拉、沿数据流跟随、从整体架构推近到模块',
    transitions: '数字化切换、缩放穿越、网格擦除',
    effects: '代码逐行打出、连线发光、节点脉冲、数据粒子',
    sfx: '键盘打字、电子提示音、合成器氛围音',
    look: '深色高对比底 + 青色或蓝紫强调色，等宽字体显示代码',
    people: '需要时出现开发者或用户；常用扁平插画',
    voice: '清亮、节奏明快、自信的科技解说',
    beat: '代码打出、节点点亮对齐节拍',
  },
  {
    id: 'data',
    label: '数据故事 / 财经报告',
    genre: 'data-story',
    cues: '数据|统计|图表|报告|财报|趋势|排行|榜单|增长|指数|占比|调研|经济|财经|股市|销量|市场份额',
    brief: '图表逐帧生长、关键数字放大、高亮注释',
    visuals: '柱状、折线、环形、地图等图表逐帧生长；关键数字放大；对比与排名变化',
    camera: '沿时间轴平移、推近关键数据点',
    transitions: '图表变形过渡、数字滚动切换、擦除',
    effects: '计数器滚动、高亮注释与指向线、热力扩散',
    sfx: '数字滚动滴答、轻提示音、低频强调',
    look: '冷静的无衬线字体，深色或白底配 1~2 个数据强调色',
    people: '一般不需要人物，需要时出现讲解员',
    voice: '冷静可信的解说',
    beat: '关键数字出现落在重拍上',
  },
  {
    id: 'war-epic',
    label: '战争史诗 / 历史战役 / 武侠动作',
    genre: 'history-theater',
    cues: WAR_EPIC_CUES,
    brief: '只用于真正讲战争、战役、武侠打斗的内容',
    visuals: '将领、士兵、侠客等人物做出真实动作（挥兵器、策马、冲锋、对峙、行军）；战马与军阵、旌旗烽烟、行军与攻占路线地图、竹简与书法大字',
    camera: '低机位仰拍主角、跟随冲锋的横移、对峙时的正反打、鼓点推拉',
    transitions: '斜劈转场、闪切、推镜冲击',
    effects: '兵器相交处的刀光与火星、冲击波、烟尘、鼓点震屏、印章落锤',
    sfx: '战鼓、兵器交击、马蹄、号角、风沙',
    look: '书法或衬线大字竖排；暗金、朱红、玄黑，逆光与轮廓光',
    people: '古装将领与士兵；常用剪影，也可按需求用水墨、国风插画等画风',
    voice: '纯音乐卡点优先；需要解说时用富有张力、浑厚的史诗旁白',
    beat: '常规 2~4 拍一镜，高潮突降点 0.5~1 拍连切，兵器交击落在重拍上',
  },
  {
    id: 'history-lecture',
    label: '历史讲解 / 文化溯源',
    genre: 'other',
    cues: '历史|朝代|古代|文物|考古|典故|成语|诗词|古诗|文化|传统|非遗|民俗|节日|起源|由来|演变|科举|丝绸之路|博物馆|古建筑|书法|汉字|故宫|长城',
    brief: '时间轴、地点标注地图、文物古籍特写、人物肖像与当时的生活场景',
    visuals: '时间轴、地图上的地点与路线标注、文物/古籍/建筑特写、历史人物肖像与当时的生活场景、年代字卡',
    camera: '沿时间轴平移、地图缓推到地点、文物环绕特写',
    transitions: '卷轴展开、翻页、时间轴滑动、旧纸叠化',
    effects: '纸张与绢本纹理、印章落款、墨迹晕开、年代数字滚动、描金线条',
    sfx: '翻书、毛笔书写、古琴或编钟点缀、钟声、市井环境声',
    look: '衬线或书法标题 + 无衬线说明；米黄纸色、黛青、朱砂、金色点缀',
    people: '按时代服饰绘制的文人、工匠、百姓等；常用国风插画、剪纸或扁平插画',
    voice: '沉稳、有画面感的讲述',
    beat: '年代与地点字卡落在重拍上',
  },
  {
    id: 'story',
    label: '名人名事 / 人物故事 / 寓言童话',
    genre: 'stickman-story',
    cues: '故事|小故事|名人|传记|人物传|生平|一生|童年|奋斗|逆袭|寓言|童话|绘本|小说|剧情|短剧|情节|主人公|主角|搞笑|段子',
    brief: '主人公在具体场景里行动，情节有起伏',
    visuals: '主人公在具体场景中的动作与表情、时间地点字卡、关键道具特写、回忆段落换一种色调',
    camera: '跟随人物平移、关键瞬间推近特写、情绪高点慢镜',
    transitions: '叠化、动作匹配剪辑、翻页、光线转场',
    effects: '光影变化表达情绪、关键瞬间慢动作、手写字卡；喜剧段落可用对话气泡与拟声字',
    sfx: '场景环境声（街道、教室、实验室、雨声等）、脚步、开关门、翻书、随情绪起伏的音乐',
    look: '温和的衬线或手写感标题；回忆暖黄、冲突冷蓝、结局明亮',
    people: '主人公与配角形象统一，按故事气质选择画风（扁平插画、绘本手绘、Q版萌系等）',
    voice: '娓娓道来、有情绪起伏的叙事',
    beat: '情节转折落在乐句与重拍上',
  },
  {
    id: 'knowledge',
    label: '知识讲解 / 干货解读',
    genre: 'other',
    cues: '知识|干货|讲解|解读|揭秘|盘点|冷知识|你知道吗|为什么|方法|技巧|读书|书单|学习方法|认知|思维|心理学|职场|自我提升|成长|理财|健康|养生',
    brief: '关键词大字、图标示意、要点逐条点亮、类比小动画',
    visuals: '关键词大字排版、图标化示意、要点逐条点亮、对比卡片、思维导图或流程图生长、类比小动画、讲解员或主人公角色',
    camera: '随要点推进的缓推与平移，结论处轻微推近',
    transitions: '滑移、遮罩擦除、卡片翻转、缩放过渡',
    effects: '高亮下划线、圈注、箭头指引、数字计数、图标弹出',
    sfx: '轻点击、翻页、弹出提示音、过场轻 whoosh',
    look: '无衬线粗体大字 + 关键词主色描边；干净浅色或深色底 + 1~2 个强调色',
    people: '讲解员或故事主人公，常用扁平插画或 Q版萌系',
    voice: '清晰亲切、节奏明快的讲解',
    beat: '要点出现与关键词弹出落在重拍上',
  },
  {
    id: 'brand',
    label: '品牌故事 / 情感 / 公益',
    genre: 'brand-story',
    cues: '品牌故事|情感|温情|治愈|致敬|纪念|公益|回忆|感恩|亲情|爱情|友情|毕业|告别|母亲|父亲|家乡|陪伴',
    brief: '人物情绪特写、温暖光影、留白构图、慢节奏',
    visuals: '人物情绪特写、生活细节、温暖光影、留白构图、有象征意义的物件',
    camera: '缓慢推拉、跟随、长镜头感的平移',
    transitions: '叠化、光晕转场、淡入淡出',
    effects: '柔光、颗粒质感、光斑、手写字',
    sfx: '环境声、克制的呼吸或心跳声、钢琴或弦乐',
    look: '细腻的衬线或手写字；暖色调、低饱和、柔光',
    people: '真实可信的普通人；常用写实插画或绘本手绘',
    voice: '温柔、娓娓道来的叙事',
    beat: '情绪段落随乐句起伏，重要画面落在重拍上',
  },
  {
    id: 'vlog',
    label: 'Vlog / 旅行 / 日常记录',
    genre: 'other',
    cues: 'vlog|旅行|旅游|游记|打卡|日常|周末|出行|城市漫步|露营|生活记录|探访',
    brief: '第一人称视角、地点字卡、地图打点、生活细节',
    visuals: '第一人称视角、地点字卡、地图打点路线、风景大景与生活细节',
    camera: '手持感跟拍、甩镜、延时感的快速推进',
    transitions: '跳切、甩镜转场、匹配剪辑',
    effects: '手写贴纸、胶片颗粒、日期时间戳、路线描线',
    sfx: '环境声、快门声、脚步、轻快音乐',
    look: '手写感字体、明亮自然的色彩',
    people: '出镜的主人公（形象统一）；常用扁平插画或写实插画',
    voice: '自然随性，像和朋友聊天',
    beat: '地点切换与动作落在重拍上',
  },
  {
    id: 'music',
    label: '音乐 MV / 歌词视频',
    genre: 'mv-lyric',
    cues: '\\bmv\\b|歌词|歌曲|翻唱|原创歌|混剪|音乐视频|演唱|单曲|专辑',
    brief: '节拍驱动的动态歌词与歌词意象画面',
    visuals: '节拍驱动的动态歌词或字幕、与歌词意象对应的画面、人物情绪动作、频谱与光斑',
    camera: '随鼓点推拉与轻微震动、旋转、快速缩放',
    transitions: '卡点闪切、缩放冲击、遮罩擦除',
    effects: '节拍脉冲、光斑、粒子跟随鼓点、文字逐字弹跳',
    sfx: '一般不额外叠加音效（音乐本身就是声音），段落切换可加轻打击',
    look: '大号动态字体，逐字或逐词动画；色彩随歌曲情绪',
    people: '歌手或故事人物（需要时）',
    voice: '无旁白',
    beat: '每镜 1~4 拍，副歌与高潮 0.5~1 拍快切',
  },
  {
    id: 'general',
    label: '其它题材',
    genre: 'other',
    cues: '',
    brief: '按主题自行设计最贴切的视觉语言',
    visuals: '先想清楚观众要看懂什么，再选最直观的画面主体（人物、物件、场景、图解都可以）',
    camera: '与内容节奏相符的推拉摇移，全片统一',
    transitions: '与主题气质相符的 2~4 种转场，全片统一',
    effects: '只用能帮助理解或烘托情绪的特效',
    sfx: '与画面里真实会发出的声音相符',
    look: '按主题气质选择字体与 2~3 个主色',
    people: '需要时设计统一的人物形象',
    voice: '按题材选择最贴切的音色',
    beat: '关键画面落在重拍上',
  },
].map((f) => ({ ...f, rxG: f.cues ? new RegExp(f.cues, 'gi') : null }))

export function getContentFamily(id) {
  return CONTENT_FAMILIES.find((f) => f.id === id) || CONTENT_FAMILIES[CONTENT_FAMILIES.length - 1]
}

/**
 * Most likely content family of a brief ('general' when nothing matches). War vocabulary only for war / battle /
 * martial-arts content, the history lecture only for historical content; ties keep the array order (theory first).
 */
export function detectContentFamily(text = '') {
  const s = withoutNonHistoricalCompounds(text)
  const war = isWarCombatContent(s)
  const historical = isHistoricalContent(s)
  let best = { id: 'general', score: 0 }
  for (const f of CONTENT_FAMILIES) {
    if (!f.rxG) continue
    if (f.id === 'war-epic' && !war) continue
    if (f.id === 'history-lecture' && !historical) continue
    const hits = new Set((s.match(f.rxG) || []).map((x) => x.toLowerCase()))
    // war content always outranks a plain history lecture of the same text
    const score = hits.size + (f.id === 'war-epic' || f.id === 'history-lecture' ? 1 : 0)
    if (hits.size && score > best.score) best = { id: f.id, score }
  }
  return best.id
}

/** One line per family for the polish prompt: the model re-checks the guess against the brief. */
export function listContentFamiliesForPrompt() {
  return CONTENT_FAMILIES.map((f) => `- ${f.id}（${f.label}）：${f.brief}`).join('\n')
}

/** Visual vocabulary of one family for the polish prompt (beat line only for beat-synced films). */
export function buildContentFamilyGuide(id, { beatSync = false } = {}) {
  const f = getContentFamily(id)
  return [
    `「${f.label}」可用的视觉词汇（起点而非模板，按本片内容取舍、补充）：`,
    `- 画面主体：${f.visuals}`,
    `- 镜头运动：${f.camera}`,
    `- 转场：${f.transitions}`,
    `- 特效：${f.effects}`,
    `- 音效：${f.sfx}`,
    `- 字体与色彩：${f.look}`,
    `- 人物：${f.people}`,
    `- 配音：${f.voice}`,
    beatSync ? `- 卡点：${f.beat}` : '',
    f.genreNote ? `- 体裁 id：${f.genreNote}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
