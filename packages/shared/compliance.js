import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BRAND } from './brand.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export const BUNDLED_FONTS_DIR = resolve(__dirname, 'fonts')

export const BUNDLED_FONTS = [
  {
    id: 'noto-sans-sc',
    family: 'Noto Sans SC',
    fileName: 'NotoSansSC-VF.woff2',
    weightRange: '100 900',
    license: 'SIL OFL 1.1',
    role: 'sans',
  },
  {
    id: 'source-han-serif-sc',
    family: 'Source Han Serif SC Heavy',
    fileName: 'SourceHanSerifSC-Heavy.woff2',
    weightRange: '900',
    license: 'SIL OFL 1.1',
    role: 'serif',
  },
]

export const COMMERCIAL_FONT_WHITELIST = [
  'Noto Sans SC',
  'Source Han Sans SC',
  'Source Han Serif SC',
  'Source Han Serif SC Heavy',
  'HarmonyOS Sans SC',
  'Alibaba PuHuiTi',
  'PingFang SC',
  'JetBrains Mono',
  'Cascadia Mono',
  'Liberation Mono',
  'DejaVu Sans Mono',
  'ui-monospace',
  'sans-serif',
  'monospace',
  'serif',
]

export const RESTRICTED_COMMERCIAL_FONT_PATTERNS = [
  /Microsoft\s+YaHei/i,
  /微软雅黑/i,
  /\bSimSun\b/i,
  /\bSimHei\b/i,
  /\bFangSong\b/i,
  /\bKaiTi\b/i,
  /\bNSimSun\b/i,
  /\bSTSong\b/i,
  /\bSTKaiti\b/i,
  /方正|汉仪|华康|造字工房/i,
]

export const PRIMARY_SANS_STACK =
  "'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'HarmonyOS Sans SC', sans-serif"
export const PRIMARY_SERIF_STACK =
  "'Source Han Serif SC Heavy', 'Noto Serif SC', 'Noto Sans SC', serif"
export const PRIMARY_MONO_STACK =
  "'JetBrains Mono', 'Cascadia Mono', 'Liberation Mono', ui-monospace, monospace"

export const VIDEO_STYLES = {
  tech: {
    id: 'tech',
    label: '科技前沿',
    desc: '深邃几何 · 精密脉冲',
    swatch: '#38BDF8',
    emotion: '平静',
    mood: 'tech',
    bpm: 118,
    role: 'host',
    colorGrade: 'eq=contrast=1.06:saturation=1.12:brightness=0.01',
  },
  cinematic: {
    id: 'cinematic',
    label: '电影大片',
    desc: '黑金质感 · 史诗运镜',
    swatch: '#E5A93C',
    emotion: '激昂',
    mood: 'cinematic',
    bpm: 104,
    role: 'storyteller',
    colorGrade: 'eq=contrast=1.10:saturation=1.06:brightness=-0.01',
  },
  documentary: {
    id: 'documentary',
    label: '纪实叙事',
    desc: '沉稳叙事 · 克制考究',
    swatch: '#10B981',
    emotion: '深沉',
    mood: 'cinematic',
    bpm: 98,
    role: 'narrator',
    colorGrade: 'eq=contrast=1.04:saturation=0.94:brightness=0.015',
  },
  energetic: {
    id: 'energetic',
    label: '高燃快剪',
    desc: '节拍冲击 · 视觉撞色',
    swatch: '#F43F5E',
    emotion: '高兴',
    mood: 'energetic',
    bpm: 124,
    role: 'host',
    colorGrade: 'eq=contrast=1.09:saturation=1.22:brightness=0.02',
  },
  warm: {
    id: 'warm',
    label: '温暖治愈',
    desc: '柔光漫射 · 细腻故事',
    swatch: '#FB923C',
    emotion: '温柔',
    mood: 'warm',
    bpm: 96,
    role: 'storyteller',
    colorGrade: 'eq=contrast=1.03:saturation=1.08:brightness=0.025',
  },
  emerald: {
    id: 'emerald',
    label: '墨翠轻奢',
    desc: '深翠墨底 · 柔金光影',
    swatch: '#45D1B2',
    emotion: '自信',
    mood: 'emerald',
    bpm: 100,
    role: 'host',
    colorGrade: 'eq=contrast=1.06:saturation=1.10:brightness=0.01',
  },
}

export function normalizeVideoStyle(rawStyle) {
  const key = String(rawStyle || 'tech').trim().toLowerCase()
  if (key === 'minimal-editorial' || key === 'editorial' || key === 'minimal') return 'documentary'
  if (key === 'vibrant-brand') return 'energetic'
  if (key === 'cinema') return 'cinematic'
  if (key === 'cyber') return 'tech'
  if (key === 'mint' || key === 'emerald-trench' || key === 'luxury') return 'emerald'
  return VIDEO_STYLES[key] ? key : 'tech'
}

/**
 * Preset style key for a consumer (BGM mood, colour grade, voice mastering …) that may receive a UI selection value:
 * 'auto' (AI 自由匹配) and 'user:<id>' (我的风格预设) resolve to the project's base preset (`script.style`).
 */
export function resolveStyleKey(style, script) {
  const key = String(style || '').trim().toLowerCase()
  if (key && key !== 'auto' && !key.startsWith('user:')) return normalizeVideoStyle(key)
  return normalizeVideoStyle(script && script.style)
}

/**
 * Copy bundled SIL OFL 1.1 commercial fonts into `<projectDir>/fonts/`
 * (and `<projectDir>/public/fonts/` if `src/` or `public/` exists for Remotion staticFile()).
 */
export function syncProjectFonts(projectDir) {
  const absDir = resolve(projectDir)
  const targetDirs = [join(absDir, 'fonts')]
  if (existsSync(join(absDir, 'src')) || existsSync(join(absDir, 'public'))) {
    targetDirs.push(join(absDir, 'public', 'fonts'))
  }

  const copied = []
  for (const dir of targetDirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    for (const font of BUNDLED_FONTS) {
      const src = join(BUNDLED_FONTS_DIR, font.fileName)
      const dest = join(dir, font.fileName)
      if (existsSync(src) && !existsSync(dest)) {
        copyFileSync(src, dest)
        copied.push(dest)
      }
    }
    const licenseSrc = join(BUNDLED_FONTS_DIR, 'LICENSES.md')
    const licenseDest = join(dir, 'LICENSES.md')
    if (existsSync(licenseSrc) && !existsSync(licenseDest)) {
      copyFileSync(licenseSrc, licenseDest)
      copied.push(licenseDest)
    }
  }
  return { copied, bundledDir: BUNDLED_FONTS_DIR }
}

/**
 * Generate `@font-face` CSS rules loading bundled SIL OFL WOFF2 fonts via HTTP relative path.
 */
export function buildBundledFontFaceCss(basePrefix = 'fonts') {
  const prefix = String(basePrefix || 'fonts').replace(/\/+$/, '')
  return [
    `@font-face {`,
    `  font-family: 'Noto Sans SC';`,
    `  src: url('${prefix}/NotoSansSC-VF.woff2') format('woff2');`,
    `  font-weight: 100 900;`,
    `  font-style: normal;`,
    `  font-display: swap;`,
    `}`,
    `@font-face {`,
    `  font-family: 'Source Han Serif SC Heavy';`,
    `  src: url('${prefix}/SourceHanSerifSC-Heavy.woff2') format('woff2');`,
    `  font-weight: 900;`,
    `  font-style: normal;`,
    `  font-display: swap;`,
    `}`,
  ].join('\n')
}

/**
 * Platform UI exclusion rectangles (normalized 0..1 coordinates) per orientation.
 * Used by pre-render geometry preflight AND Step 3 live monitor safe-zone overlay.
 */
export const PLATFORM_SAFE_ZONES = {
  douyin: {
    id: 'douyin',
    label: '抖音 Douyin',
    portrait: {
      safeInsets: { top: 0.09, bottom: 0.21, left: 0.05, right: 0.16 },
      subtitleBottomPct: 0.22,
      obstructions: [
        { id: 'dy-top', label: '顶部搜索/关注栏', x: 0, y: 0, w: 1, h: 0.085, tone: 'warn' },
        { id: 'dy-right', label: '右侧头像/点赞/评论栏', x: 0.85, y: 0.42, w: 0.15, h: 0.39, tone: 'danger' },
        { id: 'dy-bottom', label: '底部昵称文案与音乐栏', x: 0, y: 0.80, w: 1, h: 0.20, tone: 'danger' },
      ],
    },
    landscape: {
      safeInsets: { top: 0.06, bottom: 0.14, left: 0.05, right: 0.09 },
      subtitleBottomPct: 0.15,
      obstructions: [
        { id: 'dy-l-top', label: '顶部栏', x: 0, y: 0, w: 1, h: 0.06, tone: 'warn' },
        { id: 'dy-l-right', label: '右侧互动栏', x: 0.91, y: 0.36, w: 0.09, h: 0.48, tone: 'danger' },
        { id: 'dy-l-bottom', label: '底部信息进度栏', x: 0, y: 0.86, w: 1, h: 0.14, tone: 'danger' },
      ],
    },
    square: {
      safeInsets: { top: 0.08, bottom: 0.18, left: 0.05, right: 0.12 },
      subtitleBottomPct: 0.19,
      obstructions: [
        { id: 'dy-s-top', label: '顶部栏', x: 0, y: 0, w: 1, h: 0.075, tone: 'warn' },
        { id: 'dy-s-bottom', label: '底部信息栏', x: 0, y: 0.82, w: 1, h: 0.18, tone: 'danger' },
      ],
    },
  },
  kuaishou: {
    id: 'kuaishou',
    label: '快手 Kuaishou',
    portrait: {
      safeInsets: { top: 0.095, bottom: 0.21, left: 0.05, right: 0.16 },
      subtitleBottomPct: 0.22,
      obstructions: [
        { id: 'ks-top', label: '顶部发现/同城栏', x: 0, y: 0, w: 1, h: 0.09, tone: 'warn' },
        { id: 'ks-right', label: '右侧互动控件栏', x: 0.85, y: 0.40, w: 0.15, h: 0.41, tone: 'danger' },
        { id: 'ks-bottom', label: '底部作者文案与进度条', x: 0, y: 0.80, w: 1, h: 0.20, tone: 'danger' },
      ],
    },
    landscape: {
      safeInsets: { top: 0.07, bottom: 0.14, left: 0.05, right: 0.08 },
      subtitleBottomPct: 0.15,
      obstructions: [
        { id: 'ks-l-bottom', label: '底部互动进度栏', x: 0, y: 0.86, w: 1, h: 0.14, tone: 'danger' },
      ],
    },
    square: {
      safeInsets: { top: 0.08, bottom: 0.18, left: 0.05, right: 0.12 },
      subtitleBottomPct: 0.19,
      obstructions: [
        { id: 'ks-s-bottom', label: '底部信息栏', x: 0, y: 0.82, w: 1, h: 0.18, tone: 'danger' },
      ],
    },
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书 REDnote',
    portrait: {
      safeInsets: { top: 0.08, bottom: 0.22, left: 0.05, right: 0.14 },
      subtitleBottomPct: 0.23,
      obstructions: [
        { id: 'xhs-top', label: '顶部返回/搜索栏', x: 0, y: 0, w: 1, h: 0.075, tone: 'warn' },
        { id: 'xhs-right', label: '右下赞藏评栏', x: 0.87, y: 0.48, w: 0.13, h: 0.30, tone: 'danger' },
        { id: 'xhs-bottom', label: '底部笔记正文与话题区', x: 0, y: 0.785, w: 1, h: 0.215, tone: 'danger' },
      ],
    },
    landscape: {
      safeInsets: { top: 0.06, bottom: 0.15, left: 0.05, right: 0.08 },
      subtitleBottomPct: 0.16,
      obstructions: [
        { id: 'xhs-l-bottom', label: '底部正文标签栏', x: 0, y: 0.85, w: 1, h: 0.15, tone: 'danger' },
      ],
    },
    square: {
      safeInsets: { top: 0.07, bottom: 0.18, left: 0.05, right: 0.10 },
      subtitleBottomPct: 0.19,
      obstructions: [
        { id: 'xhs-s-bottom', label: '底部标题栏', x: 0, y: 0.82, w: 1, h: 0.18, tone: 'danger' },
      ],
    },
  },
  bilibili: {
    id: 'bilibili',
    label: '哔哩哔哩 Bilibili',
    landscape: {
      safeInsets: { top: 0.06, bottom: 0.11, left: 0.04, right: 0.04 },
      subtitleBottomPct: 0.11,
      obstructions: [
        { id: 'bili-top', label: '顶部弹幕安全区', x: 0, y: 0, w: 1, h: 0.06, tone: 'warn' },
        { id: 'bili-bottom', label: '底部播放器控制条', x: 0, y: 0.89, w: 1, h: 0.11, tone: 'danger' },
      ],
    },
    portrait: {
      safeInsets: { top: 0.08, bottom: 0.18, left: 0.05, right: 0.15 },
      subtitleBottomPct: 0.19,
      obstructions: [
        { id: 'bili-p-right', label: '右侧三连栏', x: 0.86, y: 0.45, w: 0.14, h: 0.36, tone: 'danger' },
        { id: 'bili-p-bottom', label: '底部视频简介栏', x: 0, y: 0.82, w: 1, h: 0.18, tone: 'danger' },
      ],
    },
    square: {
      safeInsets: { top: 0.07, bottom: 0.13, left: 0.05, right: 0.05 },
      subtitleBottomPct: 0.14,
      obstructions: [
        { id: 'bili-s-bottom', label: '底部控制栏', x: 0, y: 0.87, w: 1, h: 0.13, tone: 'danger' },
      ],
    },
  },
  universal: {
    id: 'universal',
    label: '全平台通用安全框',
    portrait: {
      safeInsets: { top: 0.09, bottom: 0.21, left: 0.05, right: 0.16 },
      subtitleBottomPct: 0.22,
      obstructions: [
        { id: 'uni-p-top', label: '顶部平台导航预留', x: 0, y: 0, w: 1, h: 0.085, tone: 'warn' },
        { id: 'uni-p-right', label: '右侧点赞关注控件预留', x: 0.85, y: 0.40, w: 0.15, h: 0.40, tone: 'danger' },
        { id: 'uni-p-bottom', label: '底部文案简介遮挡区', x: 0, y: 0.79, w: 1, h: 0.21, tone: 'danger' },
      ],
    },
    landscape: {
      safeInsets: { top: 0.06, bottom: 0.13, left: 0.05, right: 0.08 },
      subtitleBottomPct: 0.13,
      obstructions: [
        { id: 'uni-l-top', label: '顶部安全边界', x: 0, y: 0, w: 1, h: 0.06, tone: 'warn' },
        { id: 'uni-l-bottom', label: '底部播放条/文案遮挡区', x: 0, y: 0.87, w: 1, h: 0.13, tone: 'danger' },
      ],
    },
    square: {
      safeInsets: { top: 0.08, bottom: 0.18, left: 0.05, right: 0.12 },
      subtitleBottomPct: 0.18,
      obstructions: [
        { id: 'uni-s-top', label: '顶部安全边界', x: 0, y: 0, w: 1, h: 0.075, tone: 'warn' },
        { id: 'uni-s-bottom', label: '底部平台信息遮挡区', x: 0, y: 0.82, w: 1, h: 0.18, tone: 'danger' },
      ],
    },
  },
}

export function resolveSafeZoneSpec(width = 1920, height = 1080, platform = 'universal') {
  const w = Number(width) || 1920
  const h = Number(height) || 1080
  const orientation = w < h ? 'portrait' : Math.abs(w - h) <= 10 ? 'square' : 'landscape'
  const platformKey = PLATFORM_SAFE_ZONES[platform] ? platform : 'universal'
  const spec = PLATFORM_SAFE_ZONES[platformKey][orientation] || PLATFORM_SAFE_ZONES.universal[orientation]

  return {
    platform: platformKey,
    platformLabel: PLATFORM_SAFE_ZONES[platformKey].label,
    orientation,
    width: w,
    height: h,
    safeInsets: spec.safeInsets,
    subtitleBottomPct: spec.subtitleBottomPct,
    subtitleBottomPx: Math.round(h * spec.subtitleBottomPct),
    safePaddingPx: {
      top: Math.round(h * spec.safeInsets.top),
      bottom: Math.round(h * spec.safeInsets.bottom),
      left: Math.round(w * spec.safeInsets.left),
      right: Math.round(w * spec.safeInsets.right),
    },
    obstructions: spec.obstructions.map((o) => ({
      ...o,
      px: {
        x: Math.round(o.x * w),
        y: Math.round(o.y * h),
        w: Math.round(o.w * w),
        h: Math.round(o.h * h),
      },
    })),
  }
}

function rectsOverlap(a, b, epsilon = 0.004) {
  return (
    a.x < b.x + b.w - epsilon &&
    a.x + a.w > b.x + epsilon &&
    a.y < b.y + b.h - epsilon &&
    a.y + a.h > b.y + epsilon
  )
}

/**
 * Geometric collision preflight check between template UI layers (subtitles, stage content,
 * AI badge, end notice) and target platform HUD obstructions.
 */
export function computeSafeZonePreflight(scriptData, options = {}) {
  const platform = options.platform || scriptData?.targetPlatform || 'universal'
  const w = Number(scriptData?.width) || 1920
  const h = Number(scriptData?.height) || 1080
  const zone = resolveSafeZoneSpec(w, h, platform)

  // Inspect subtitle bottom position from explicit override or rendered HTML CSS
  const htmlCode = String(options.htmlContent || '')
  let subtitleBottomPx = zone.subtitleBottomPx
  const bottomCssMatch = htmlCode.match(/\.caption-bar[\s\S]{0,240}?bottom:\s*(\d+(?:\.\d+)?)px/i)
  if (Number.isFinite(Number(options.subtitleBottomPx))) {
    subtitleBottomPx = Number(options.subtitleBottomPx)
  } else if (Number.isFinite(Number(scriptData?.subtitleBottomPx))) {
    subtitleBottomPx = Number(scriptData.subtitleBottomPx)
  } else if (bottomCssMatch) {
    subtitleBottomPx = Number(bottomCssMatch[1])
  } else {
    // Check default caption offset for portrait vs landscape if unpatched HTML uses low 38px
    const lowSubMatch = htmlCode.match(/bottom:\s*(\d+)px[\s\S]{0,160}?caption/i)
    if (lowSubMatch) subtitleBottomPx = Number(lowSubMatch[1])
  }

  const subtitleHeightPct = zone.orientation === 'portrait' ? 0.055 : 0.068
  const subtitleBottomRatio = Math.max(0, Math.min(1, subtitleBottomPx / h))
  const subtitleRect = {
    id: 'subtitle-band',
    label: '底部字幕条',
    x: zone.safeInsets.left,
    y: Math.max(0, 1 - subtitleBottomRatio - subtitleHeightPct),
    w: Math.max(0.2, 1 - zone.safeInsets.left - zone.safeInsets.right),
    h: subtitleHeightPct,
  }

  const aiBadgeRect = {
    id: 'ai-badge',
    label: '右上/左上 AI 合规角标',
    x: zone.safeInsets.left,
    y: zone.safeInsets.top + 0.01,
    w: 0.14,
    h: 0.036,
  }

  const stageRect = {
    id: 'stage-main',
    label: '核心文案与舞台区',
    x: zone.safeInsets.left,
    y: zone.safeInsets.top + 0.015,
    w: Math.max(0.3, 1 - zone.safeInsets.left - zone.safeInsets.right),
    h: Math.max(0.3, 1 - zone.safeInsets.top - zone.safeInsets.bottom - 0.02),
  }

  const layers = [subtitleRect, aiBadgeRect, stageRect]
  const collisions = []
  for (const layer of layers) {
    for (const obs of zone.obstructions) {
      if (obs.tone === 'danger' && rectsOverlap(layer, obs)) {
        collisions.push({
          layer: layer.id,
          layerLabel: layer.label,
          obstruction: obs.id,
          obstructionLabel: obs.label,
          severity: layer.id === 'subtitle-band' ? 'error' : 'warning',
          suggestion:
            layer.id === 'subtitle-band'
              ? `字幕 bottom=${subtitleBottomPx}px 落入 ${obs.label}，建议提升至 ≥ ${zone.subtitleBottomPx}px`
              : `${layer.label} 与 ${obs.label} 存在重叠风险`,
        })
      }
    }
  }

  const criticalCollisions = collisions.filter((c) => c.severity === 'error')
  return {
    ...zone,
    measuredSubtitleBottomPx: subtitleBottomPx,
    recommendedSubtitleBottomPx: zone.subtitleBottomPx,
    collisions,
    passed: criticalCollisions.length === 0,
  }
}

/**
 * 片尾声明（视频最后一行字）. Off unless the user turns it on (`script.endNotice === true`): the AI corner badge
 * (`aiBadgeEnabled`, on by default for AI films) already labels AI content in the picture, and a creator's film carries
 * no credit for the tool unless they ask for it (`endNoticeCredit === true`, which only counts while the line is shown).
 */
export function resolveEndNotice(scriptData = {}) {
  const visible = scriptData?.endNotice === true
  return { visible, credit: visible && scriptData?.endNoticeCredit === true }
}

/** The product name a credited end line names (片尾署名; see brand.js). */
export const END_NOTICE_CREDIT_NAME = BRAND.productName

/**
 * AI synthesis / editing disclosure reflecting the generation modes actually used.
 *   badgeText            the corner badge (「AI 辅助创作」 / 「AI 辅助剪辑」)
 *   endNoticeAiBody      the disclosure without any tool credit
 *   endNoticeCreditBody  the same disclosure crediting the plugin
 *   endNoticeBody        what this project uses: the credit version only when the end line is shown with the credit
 *   endNoticeVisible     whether the last line of the video is shown at all (片尾声明)
 *   endNoticeCredit      whether that line credits the plugin (片尾署名)
 */
export function buildComplianceNoticeText(scriptData = {}) {
  const { visible, credit } = resolveEndNotice(scriptData)
  const pack = (badgeText, endNoticeTitle, endNoticeAiBody, endNoticeCreditBody) => ({
    badgeText,
    endNoticeTitle,
    endNoticeAiBody,
    endNoticeCreditBody,
    endNoticeBody: credit ? endNoticeCreditBody : endNoticeAiBody,
    endNoticeVisible: visible,
    endNoticeCredit: credit,
  })
  // 口播剪辑: the picture and the voice are the person's own recording — only the editing and the captions are automatic
  if (scriptData?.productionType === 'talk-edit') {
    const music = scriptData?.bgm?.enabled === false ? '' : (scriptData?.audioSpec?.bgmMode || scriptData?.bgmMode) === 'uploaded' ? ' · 用户授权背景音乐' : ' · AI 合成配乐'
    const parts = `真人出镜原声 · 本地语音识别生成字幕 · 自动粗剪${music}`
    return pack('AI 辅助剪辑', '内容生成合规声明 · AI Editing Disclosure', `本视频为 AI 辅助剪辑：${parts}`, `本视频由${END_NOTICE_CREDIT_NAME}剪辑：${parts}`)
  }
  const bgmMode = scriptData?.audioSpec?.bgmMode || scriptData?.bgmMode || 'llm-coded'
  const creationMode = scriptData?.creationMode || 'ai-coded'
  const narrationMode = scriptData?.narrationMode || 'tts'
  const engineName = scriptData?.ttsEngine || 'IndexTTS-2.5'
  const visualPart = creationMode === 'schema-plan' ? 'AI 结构化分镜调度生成' : 'AI 大模型编码驱动视觉合成'
  const audioPart =
    bgmMode === 'uploaded'
      ? '用户授权背景音乐'
      : bgmMode === 'tts-engine'
        ? 'AI 配音引擎氛围声景'
        : 'AI 编程合成配乐'
  const voicePart = narrationMode === 'subtitle-mv' ? ' · 纯音乐节拍卡点' : ` + ${engineName} 语音合成`
  const parts = `${visualPart} · ${audioPart}${voicePart}`
  return pack('AI 辅助创作', '内容生成合规声明 · AI Synthesis Disclosure', `本视频含 AI 生成内容：${parts}`, `本视频由${END_NOTICE_CREDIT_NAME}创作：${parts}`)
}

// ---- keeping already generated compositions in step with the switch (re-render without regenerating) ----

const escapeHtmlText = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** The HTML engine's end-notice element as the generator writes it (hidden with display:none while the switch is off). */
export function renderEndNoticeHtml(notice) {
  const mode = notice.endNoticeVisible ? (notice.endNoticeCredit ? 'credit' : 'ai') : 'off'
  return `<div id="end-notice-wrap" data-end-notice="${mode}"${notice.endNoticeVisible ? '' : ' style="display:none"'}><div id="end-notice">${escapeHtmlText(notice.endNoticeBody)}</div></div>`
}

const HTML_END_NOTICE_RE = /<div id="end-notice-wrap"[^>]*>\s*<div id="end-notice">[\s\S]*?<\/div>\s*<\/div>/
const HTML_SWITCH_STYLE_RE = /<style id="dsh-end-notice-switch">[\s\S]*?<\/style>\n?/g
const HTML_SWITCH_SCRIPT_RE = /<script id="dsh-end-notice-text">[\s\S]*?<\/script>\n?/g
const HTML_ANY_END_NOTICE_RE = /\bid\s*=\s*["']end-notice(?:-wrap)?["']/

const insertBefore = (html, closingTagRe, block) => {
  const m = closingTagRe.exec(html)
  if (!m) return `${html}\n${block}`
  return `${html.slice(0, m.index)}${block}\n${html.slice(m.index)}`
}

/**
 * Bring an index.html written by any version in line with `notice`; returns the same string when nothing changes.
 * Our generated page: its end-notice element is rewritten. A page the model wrote itself: while the line is off a
 * style block hides any #end-notice / #end-notice-wrap (beats inline styles set by its own seek code); while on, a
 * small script puts the chosen text into #end-notice.
 */
export function patchEndNoticeHtml(html, notice) {
  const src = String(html ?? '')
  let out = src.replace(HTML_SWITCH_STYLE_RE, '').replace(HTML_SWITCH_SCRIPT_RE, '')
  if (HTML_END_NOTICE_RE.test(out)) {
    out = out.replace(HTML_END_NOTICE_RE, () => renderEndNoticeHtml(notice))
  } else if (HTML_ANY_END_NOTICE_RE.test(out)) {
    if (!notice.endNoticeVisible) {
      out = insertBefore(out, /<\/head>/i, '<style id="dsh-end-notice-switch">#end-notice-wrap,#end-notice{display:none !important}</style>')
    } else {
      const text = JSON.stringify(String(notice.endNoticeBody || '')).replace(/</g, '\\u003c')
      out = insertBefore(out, /<\/body>/i, `<script id="dsh-end-notice-text">(function(){var n=document.getElementById('end-notice');if(n)n.textContent=${text};})();</script>`)
    }
  }
  return out === src ? src : out
}

/** The constants a generated VideoComposition.tsx carries (both texts, so the switch works at render time). */
export function renderEndNoticeTsxConstants(notice) {
  return [
    `const END_NOTICE_AI = ${JSON.stringify(notice.endNoticeAiBody)};`,
    `const END_NOTICE_CREDIT = ${JSON.stringify(notice.endNoticeCreditBody)};`,
    'const DEFAULT_END_NOTICE = END_NOTICE_AI;',
  ].join('\n')
}

/** The end-notice element of a generated VideoComposition.tsx: shown only when script.json switches it on. */
export const END_NOTICE_TSX_ELEMENT = `{(scriptData as any)?.endNotice === true ? (
        <EndNotice
          text={(scriptData as any)?.endNoticeCredit === true ? END_NOTICE_CREDIT : END_NOTICE_AI}
          accentColor={PALETTE.accent}
        />
      ) : null}`

const TSX_LEGACY_CONST_RE = /^const DEFAULT_END_NOTICE = (?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*');[ \t]*(?=\r?$)/m
const TSX_NEW_CONSTS_RE = /^const END_NOTICE_AI = [^\r\n]*;\r?\nconst END_NOTICE_CREDIT = [^\r\n]*;\r?\nconst DEFAULT_END_NOTICE = END_NOTICE_AI;[ \t]*(?=\r?$)/m
const TSX_LEGACY_ELEMENT_RE = /<EndNotice\s+text=\{DEFAULT_END_NOTICE\}\s+accentColor=\{PALETTE\.accent\}\s*\/>/

/**
 * Bring a generated VideoComposition.tsx (any version since the end notice existed) in line with the switch: refresh
 * the two texts and make the element conditional. Files without our generated markers are returned unchanged.
 */
export function patchEndNoticeTsx(tsx, notice) {
  const src = String(tsx ?? '')
  const consts = renderEndNoticeTsxConstants(notice)
  let out = src
  if (TSX_NEW_CONSTS_RE.test(out)) out = out.replace(TSX_NEW_CONSTS_RE, () => consts)
  else if (TSX_LEGACY_CONST_RE.test(out)) out = out.replace(TSX_LEGACY_CONST_RE, () => consts)
  else return src
  if (TSX_LEGACY_ELEMENT_RE.test(out)) out = out.replace(TSX_LEGACY_ELEMENT_RE, () => END_NOTICE_TSX_ELEMENT)
  // a file that still renders the notice unconditionally (e.g. hand-edited) keeps its element but now uses the texts
  return out
}

/**
 * Apply the switch to the compositions already on disk (index.html of the HTML engine, src/VideoComposition.tsx of
 * the Remotion engine). Only files whose content changes are written. Returns what was done per file.
 */
export function syncEndNoticeFiles(projectDir, scriptData = {}) {
  const notice = buildComplianceNoticeText(scriptData)
  const result = { html: 'absent', remotion: 'absent', visible: notice.endNoticeVisible, credit: notice.endNoticeCredit }
  const targets = [
    ['html', join(projectDir, 'index.html'), patchEndNoticeHtml],
    ['remotion', join(projectDir, 'src', 'VideoComposition.tsx'), patchEndNoticeTsx],
  ]
  for (const [key, file, patch] of targets) {
    if (!existsSync(file)) continue
    try {
      const before = readFileSync(file, 'utf8')
      const after = patch(before, notice)
      if (after === before) {
        result[key] = 'unchanged'
        continue
      }
      writeFileSync(file, after, 'utf8')
      result[key] = 'updated'
    } catch (err) {
      result[key] = `error: ${err?.message || err}`
    }
  }
  return result
}
