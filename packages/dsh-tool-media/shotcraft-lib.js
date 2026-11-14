import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Distilled Shotcraft Primitives & LLM Skills Prompt Builder
 *
 * Incorporates engineering patterns and component abstractions adapted cleanly under open-source
 * permissive licenses from:
 * - Vincentwei1021/video-shotcraft (Apache-2.0): PageCam, ClipCard, DigitRoll, FlashCut, ShotCaption
 * - remotion-dev/skills (MIT/Apache-2.0): Frame-deterministic Remotion animation & TypeScript best practices
 * - heygen-com/hyperframes (Apache-2.0): Deterministic seekable HTML5/GSAP composition standards
 */

export const SHOTCRAFT_TSX_SOURCE = `/**
 * @dsh-video/shotcraft — Reusable Remotion Motion Primitives
 * Adapted from Apache-2.0 open-source video-shotcraft & remotion-dev/skills patterns.
 * Strictly driven by useCurrentFrame() + spring() + interpolate() — zero CSS transition / keyframes.
 */
import React from 'react'
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

export const FONT_SANS = "'Noto Sans SC', 'Source Han Sans SC', 'PingFang SC', 'HarmonyOS Sans SC', sans-serif"
export const FONT_SERIF = "'Source Han Serif SC Heavy', 'Noto Serif SC', 'Noto Sans SC', serif"
export const FONT_MONO = "'JetBrains Mono', 'Cascadia Mono', 'Liberation Mono', ui-monospace, monospace"

export interface PageCamProps {
  children: React.ReactNode
  startFrame?: number
  durationFrames?: number
  fromScale?: number
  toScale?: number
  fromX?: number
  toX?: number
  fromY?: number
  toY?: number
  tiltDeg?: number
}

export const PageCam: React.FC<PageCamProps> = ({
  children,
  startFrame = 0,
  durationFrames = 90,
  fromScale = 1.06,
  toScale = 1.0,
  fromX = 0,
  toX = 0,
  fromY = 18,
  toY = 0,
  tiltDeg = 0,
}) => {
  const frame = useCurrentFrame()
  const progress = interpolate(
    frame,
    [startFrame, startFrame + Math.max(1, durationFrames)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const eased = 1 - Math.pow(1 - progress, 3)
  const scale = fromScale + (toScale - fromScale) * eased
  const x = fromX + (toX - fromX) * eased
  const y = fromY + (toY - fromY) * eased
  const tilt = tiltDeg * (1 - eased)

  return (
    <AbsoluteFill
      style={{
        transform: \`perspective(1400px) translate3d(\${x}px, \${y}px, 0) scale(\${scale}) rotateX(\${tilt}deg)\`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

export interface ClipCardProps {
  children: React.ReactNode
  delay?: number
  fromY?: number
  tiltDeg?: number
  accentColor?: string
  bg?: string
  borderColor?: string
  padding?: number | string
  borderRadius?: number
  style?: React.CSSProperties
}

export const ClipCard: React.FC<ClipCardProps> = ({
  children,
  delay = 0,
  fromY = 36,
  tiltDeg = -2,
  accentColor = '#38BDF8',
  bg = 'rgba(15, 23, 42, 0.78)',
  borderColor = 'rgba(255, 255, 255, 0.14)',
  padding = 28,
  borderRadius = 20,
  style = {},
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const spr = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 14, stiffness: 150, mass: 0.9 },
  })
  const y = interpolate(spr, [0, 1], [fromY, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const opacity = interpolate(spr, [0, 0.35], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const rot = interpolate(spr, [0, 1], [tiltDeg, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const scale = interpolate(spr, [0, 1], [0.94, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  return (
    <div
      style={{
        background: bg,
        border: \`1px solid \${borderColor}\`,
        borderRadius,
        padding,
        boxShadow: \`0 24px 64px rgba(0, 0, 0, 0.45), 0 0 0 1px \${accentColor}22 inset\`,
        opacity,
        transform: \`translate3d(0, \${y}px, 0) scale(\${scale}) rotate(\${rot}deg)\`,
        fontFamily: FONT_SANS,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export interface DigitRollProps {
  from?: number
  to: number
  startFrame?: number
  durationFrames?: number
  prefix?: string
  suffix?: string
  decimals?: number
  color?: string
  fontSize?: number
  style?: React.CSSProperties
}

export const DigitRoll: React.FC<DigitRollProps> = ({
  from = 0,
  to,
  startFrame = 4,
  durationFrames = 36,
  prefix = '',
  suffix = '',
  decimals = 0,
  color = '#F8FAFC',
  fontSize = 68,
  style = {},
}) => {
  const frame = useCurrentFrame()
  const progress = interpolate(
    frame,
    [startFrame, startFrame + Math.max(1, durationFrames)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  )
  const eased = 1 - Math.pow(1 - progress, 4)
  const val = from + (to - from) * eased
  const formatted = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString('en-US')

  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontWeight: 800,
        fontSize,
        color,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        ...style,
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

export interface FlashCutProps {
  atFrame?: number
  durationFrames?: number
  color?: string
  mode?: 'flash' | 'wipe' | 'iris'
}

export const FlashCut: React.FC<FlashCutProps> = ({
  atFrame = 0,
  durationFrames = 10,
  color = '#FFFFFF',
  mode = 'flash',
}) => {
  const frame = useCurrentFrame()
  const local = frame - atFrame
  if (local < 0 || local > durationFrames) return null

  const t = local / Math.max(1, durationFrames)
  if (mode === 'wipe') {
    const x = interpolate(t, [0, 0.5, 1], [-100, 0, 100], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    return (
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: \`linear-gradient(90deg, transparent, \${color}CC, transparent)\`,
          transform: \`translateX(\${x}%)\`,
          zIndex: 80,
        }}
      />
    )
  }

  const opacity = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        backgroundColor: color,
        opacity: Math.max(0, Math.min(0.65, opacity * 0.65)),
        zIndex: 80,
      }}
    />
  )
}

export interface SubtitleCue {
  index?: number
  text: string
  startFrame: number
  endFrame: number
}

export interface ShotCaptionProps {
  subtitles?: SubtitleCue[]
  frameOffset?: number
  accentColor?: string
  isPortrait?: boolean
  bottomPx?: number
}

export const ShotCaption: React.FC<ShotCaptionProps> = ({
  subtitles = [],
  frameOffset = 0,
  accentColor = '#38BDF8',
  isPortrait = false,
  bottomPx,
}) => {
  const frame = useCurrentFrame()
  const { height } = useVideoConfig()
  const globalFrame = frame + frameOffset
  const active = subtitles.find((s) => globalFrame >= s.startFrame && globalFrame <= s.endFrame)
  if (!active || !active.text) return null

  const enter = interpolate(globalFrame, [active.startFrame, active.startFrame + 4], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const resolvedBottom =
    typeof bottomPx === 'number' && bottomPx > 0
      ? bottomPx
      : isPortrait
        ? Math.round(height * 0.22)
        : Math.round(height * 0.13)

  return (
    <div
      style={{
        position: 'absolute',
        left: '6%',
        right: '6%',
        bottom: resolvedBottom,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 60,
        opacity: enter,
        transform: \`translateY(\${(1 - enter) * 8}px)\`,
      }}
    >
      <div
        style={{
          maxWidth: isPortrait ? '92%' : '76%',
          padding: isPortrait ? '12px 22px' : '11px 28px',
          borderRadius: 14,
          background: 'rgba(8, 12, 20, 0.84)',
          border: \`1px solid \${accentColor}55\`,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          color: '#F8FAFC',
          fontFamily: FONT_SANS,
          fontSize: isPortrait ? 34 : 30,
          fontWeight: 700,
          lineHeight: 1.35,
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}
      >
        {active.text}
      </div>
    </div>
  )
}

export interface AIBadgeProps {
  visible?: boolean
  text?: string
  accentColor?: string
}

export const AIBadge: React.FC<AIBadgeProps> = ({
  visible = true,
  text = 'AI 辅助创作',
  accentColor = '#38BDF8',
}) => {
  const { width, height } = useVideoConfig()
  const isPortrait = width < height
  if (!visible) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: isPortrait ? Math.round(height * 0.092) : 24,
        left: 26,
        zIndex: 70,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'rgba(10, 14, 24, 0.78)',
        border: \`1px solid \${accentColor}55\`,
        color: '#E2E8F0',
        fontFamily: FONT_SANS,
        fontSize: isPortrait ? 15 : 16,
        fontWeight: 600,
        letterSpacing: '0.03em',
        backdropFilter: 'blur(6px)',
      }}
    >
      {text}
    </div>
  )
}

export interface EndNoticeProps {
  text?: string
  accentColor?: string
  tailSeconds?: number
}

export const EndNotice: React.FC<EndNoticeProps> = ({
  text = '本片画面与配乐由 DeepSeek Harness AI 编程辅助生成 · 语音由 IndexTTS-2.5 合成',
  accentColor = '#38BDF8',
  tailSeconds = 2.2,
}) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames, width, height } = useVideoConfig()
  const tailFrames = Math.max(12, Math.round(fps * tailSeconds))
  const startF = Math.max(0, durationInFrames - tailFrames)
  if (frame < startF) return null

  const alpha = interpolate(frame, [startF, startF + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const isPortrait = width < height

  return (
    <div
      style={{
        position: 'absolute',
        left: '6%',
        right: '6%',
        bottom: isPortrait ? Math.round(height * 0.30) : Math.round(height * 0.21),
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: alpha,
        zIndex: 75,
      }}
    >
      <div
        style={{
          padding: '8px 20px',
          borderRadius: 999,
          background: 'rgba(6, 10, 18, 0.86)',
          border: \`1px solid \${accentColor}44\`,
          color: '#CBD5E1',
          fontFamily: FONT_SANS,
          fontSize: isPortrait ? 18 : 16,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    </div>
  )
}

export interface AvatarOverlayProps {
  clipPath?: string
  layout?: 'fullscreen' | 'pip-bl' | 'pip-br' | 'off' | string
  accentColor?: string
  muted?: boolean
}

export const AvatarOverlay: React.FC<AvatarOverlayProps> = ({
  clipPath,
  layout = 'pip-br',
  accentColor = '#22D3EE',
  muted = true,
}) => {
  const { width, height } = useVideoConfig()
  if (!clipPath || layout === 'off') return null
  const isPortrait = width < height
  const cleanRel = String(clipPath).replace(/^\\.?[\\\\/]+/, '').replace(/\\\\/g, '/')

  if (layout === 'fullscreen') {
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 25, justifyContent: 'flex-end', alignItems: 'center' }}>
        <OffthreadVideo
          src={staticFile(cleanRel)}
          transparent
          muted={muted}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </AbsoluteFill>
    )
  }

  const boxWidth = isPortrait ? Math.round(width * 0.34) : Math.round(width * 0.22)
  const boxHeight = Math.round(boxWidth * 1.125)
  const sidePx = isPortrait ? 28 : 42
  const bottomPx = isPortrait ? Math.round(height * 0.25) : 96

  return (
    <div
      style={{
        position: 'absolute',
        bottom: bottomPx,
        left: layout === 'pip-bl' ? sidePx : undefined,
        right: layout === 'pip-bl' ? undefined : sidePx,
        width: boxWidth,
        height: boxHeight,
        borderRadius: 20,
        overflow: 'hidden',
        border: \`1.5px solid \${accentColor}55\`,
        background: 'rgba(6, 10, 18, 0.28)',
        boxShadow: \`0 18px 46px rgba(0,0,0,0.55), 0 0 24px \${accentColor}22\`,
        pointerEvents: 'none',
        zIndex: 35,
      }}
    >
      <OffthreadVideo
        src={staticFile(cleanRel)}
        transparent
        muted={muted}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}
`

export function writeShotcraftRemotionLib(projectDir) {
  const absDir = resolve(projectDir)
  const libDir = join(absDir, 'src', 'lib')
  mkdirSync(libDir, { recursive: true })
  const outPath = join(libDir, 'shotcraft.tsx')
  writeFileSync(outPath, SHOTCRAFT_TSX_SOURCE, 'utf8')
  return outPath
}

export function buildDirectorPromptPackage({
  topic,
  userPrompt,
  aspectRatio,
  quality,
  width,
  height,
  targetEngine,
  assets = [],
  draftScript = null,
}) {
  const system = `你是顶级电影动态视觉导演兼音画编曲总监 (AI Director & Sound Designer)。
你的职责不是套模板，而是针对用户提供的主题与真实素材，构思极具大厂发布会/电影预告片质感的视频蓝图与定制合成音乐音效方案。

必须遵循以下规范：
1. 你只输出严格的 JSON 对象，不要包含额外 Markdown 解释文字。
2. 文案口播 (narration) 必须自然有力、节奏明快、无废话套话，每镜字数匹配镜头节奏（通常 15-45 个汉字）。
3. 画面布局与镜头语言必须根据画幅比例 (${aspectRatio}, ${width}x${height}) 量身定制：
   - 竖屏 (9:16 / 3:4): 采用上下构图、中心主体聚焦、大字号大数字、安全边距避开底部 12% 区域。
   - 横屏 (16:9): 采用非对称 60/40 分屏、数字指标仪表台、虚拟摄像机推拉摇移、景深卡片堆叠。
4. 为整部作品编曲：生成 audioSpec，包含：
   - mood: "tech" | "energetic" | "cinematic" | "warm"
   - bpm: 整数 (88-136)
   - drumDensity: 0.0 - 1.0
   - leadStyle: "pluck" | "epiano" | "glock" | "pad-only"
   - padCutoff: 800 - 3200
   - chords: 4组和弦进度，格式为 [[rootMidi, [m1, m2, m3, m4]], ...]，例如 [[38,[62,65,69,72]],[34,[62,65,70,74]],[41,[65,69,72,76]],[36,[64,67,72,76]]]
5. 每个分镜设计 2-5 个精密时间点音效 (sfxCues)，既可使用内置类型 ("hit","whoosh","swoosh","glitch","pop","thud","card","sparkle","chime","riser","sub_drop","crash_cym","counter","typing","stamp")，也可使用 "synth_sfx" 参数化实时合成：
   { "type": "synth_sfx", "offsetSec": 0.15, "volume": 0.55, "pan": -0.3, "freqStart": 920, "freqEnd": 180, "durationMs": 320, "q": 1.4, "wave": "saw" }。
6. 若用户已有参考草稿 (draftScript)，请充分吸收已定稿的分镜数与叙事脉络，但在视觉动效、镜头创意、文案锐度和音效配乐上做电影级跃升。`

  const assetSummary = (assets || []).map((a) => ({
    id: a.id,
    kind: a.kind,
    role: a.role,
    path: a.path,
    width: a.width || null,
    height: a.height || null,
    durationSec: a.durationSec || null,
    name: a.name,
  }))

  const draftSummary = draftScript
    ? {
        title: draftScript.title,
        sceneCount: Array.isArray(draftScript.scenes) ? draftScript.scenes.length : 0,
        scenes: (draftScript.scenes || []).map((s) => ({
          id: s.id,
          title: s.title,
          narration: s.narration,
          emotion: s.emotion,
          assetPaths: s.assetPaths || [],
          durationSec: s.durationSec,
        })),
      }
    : null

  const user = JSON.stringify(
    {
      task: '请生成 promo-plan/1 创作蓝图 JSON',
      topic,
      userPrompt: userPrompt || topic,
      targetEngine,
      format: { aspectRatio, quality, width, height },
      availableAssets: assetSummary,
      confirmedDraftReference: draftSummary,
      requiredOutputSchema: {
        title: 'string (作品主标题)',
        style: 'cyber | cinema | editorial | luxury | minimal',
        theme: {
          bgPrimary: '#hex',
          bgSecondary: '#hex',
          textPrimary: '#hex',
          textMuted: '#hex',
          accentPrimary: '#hex',
          accentSecondary: '#hex',
        },
        audioSpec: {
          mood: 'tech | energetic | cinematic | warm',
          bpm: 118,
          drumDensity: 0.8,
          leadStyle: 'pluck | epiano | glock | pad-only',
          padCutoff: 1900,
          volume: 0.28,
          chords: '[[rootMidi,[m1,m2,m3,m4]], ...] x4',
        },
        scenes: [
          {
            id: 'scene-01',
            title: 'string',
            shotType: 'hero-title | metric-counter | bento-grid | split-showcase | terminal-code | media-spotlight | closing-cta',
            emotion: '激情 | 平静 | 自信 | 温暖 | 科技感',
            role: 'narrator | tech | energetic | calm',
            narration: '口播文案...',
            headline: '画面主大字标题 (短小震撼)',
            kicker: '上方小英文标签',
            metrics: [{ label: '指标名', value: 99, suffix: '%' }],
            assetPaths: ['assets/xxx'],
            motionNotes: '详述该镜头动画时序：例如 0s 激光扫描+PageCam推镜，0.4s 卡片弹簧弹入，1.2s 数字滚动，转场 FlashCut',
            sfxCues: [
              { type: 'riser | whoosh | hit | synth_sfx ...', offsetSec: 0, volume: 0.55, pan: 0 },
            ],
          },
        ],
      },
    },
    null,
    2,
  )

  return { system, user }
}

export function buildRemotionCoderSkillsPrompt({
  plan,
  timingContract,
  width,
  height,
  aspectRatio,
}) {
  const isPortrait = width < height
  const system = `你是顶尖 Remotion (v4) 资深创意前端程序员。
你的任务是根据导演规划与锁定音频时间轴 (timingContract)，编写可直接通过 TypeScript strict 编译与自动化视觉质检的高水准定制视频代码！

=== REMOTION 严苛工程铁律 (违背任何一条都会被 linter 拒绝重修!) ===
1. 必须仅生成如下 3 个文件，使用 JSON 输出格式 { "files": { "src/theme.ts": "...", "src/scenes/Scenes.tsx": "...", "src/VideoComposition.tsx": "..." } }。
2. 禁止出现任何 CSS transition 或 CSS @keyframes 语法（即使在注释里也不允许出现 "transition:" 或 "@keyframes" 字样！）。一切动画必须通过 useCurrentFrame() + interpolate(..., { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) + spring() 逐帧数学计算。
3. 禁止使用 Math.random()，如需随机数必须从 'remotion' 导入 random(seed)。
4. 禁止使用 Node 内置模块 (fs/path/child_process)、eval、new Function、外部网络字体/CDN 脚本链接或本地盘符路径。
5. 商业版权字体安全铁律：禁止声明或使用微软雅黑 (Microsoft YaHei)、宋体 (SimSun)、黑体 (SimHei) 等受限商业字体！必须使用系统随包分发的 SIL OFL 开源商用字体栈：\`FONT_SANS\` ('Noto Sans SC', sans-serif) 与 \`FONT_MONO\` ('JetBrains Mono', monospace)。
6. 可从 '../lib/shotcraft'（在 src/scenes/Scenes.tsx 中）或 './lib/shotcraft'（在 src/VideoComposition.tsx 中）导入已提供的组件：
   - PageCam, ClipCard, DigitRoll, FlashCut, ShotCaption, AIBadge, EndNotice, AvatarOverlay, FONT_SANS, FONT_MONO, FONT_SERIF
7. 合规与数字人叠层铁律：src/VideoComposition.tsx 必须在合成器最外层强制挂载 <AIBadge visible={true} /> 与末尾 <EndNotice />；当 script.json 中存在 avatarClip.path 且 avatarLayout !== 'off' 时，必须渲染 <AvatarOverlay clipPath={scriptData.avatarClip.path} layout={scriptData.avatarLayout || 'pip-br'} />（使用 transparent 透明通道合成）；字幕 <ShotCaption bottomPx={...} /> 必须遵循目标平台安全区留白（竖屏底部至少留白 22%）。
8. 如需使用本地素材图片/视频（如 public/...），必须使用 staticFile('相对路径')（去掉前导 public/），使用 <Img src={staticFile(...)} />。
9. 音轨对齐铁律：src/VideoComposition.tsx 必须导出命名组件 VideoComposition，并在最外层挂载：
   <Audio src={staticFile('master-audio.wav')} />
   且每个 <Sequence from={s.startFrame} durationInFrames={s.durationInFrames}> 的起始帧与帧数必须严格使用 timingContract 里的 exact integers！
10. 画面布局契合当前分辨率 ${width}x${height} (${aspectRatio}, ${isPortrait ? '竖屏移动端构图，字号要大、右侧互动栏 16% 与底部 22% 安全区严格避让' : '横屏影院构图'})：禁止溢出裁切，前景字幕留有 ShotCaption 安全位置。`

  const user = JSON.stringify(
    {
      task: '生成定制 Remotion TSX 代码文件 (严格 JSON { "files": { ... } })',
      canvas: { width, height, aspectRatio, fps: timingContract.fps, totalDurationInFrames: timingContract.totalDurationInFrames },
      aiBadge: Boolean(timingContract.aiBadge),
      theme: plan.theme,
      timingContract: timingContract.scenes.map((s, i) => ({
        id: s.id,
        index: s.index,
        title: s.title,
        startFrame: s.startFrame,
        durationInFrames: s.durationInFrames,
        durationSec: s.durationSec,
        shotType: plan.scenes?.[i]?.shotType || 'hero-title',
        headline: plan.scenes?.[i]?.headline || s.title,
        kicker: plan.scenes?.[i]?.kicker || `SCENE 0${i + 1}`,
        metrics: plan.scenes?.[i]?.metrics || [],
        motionNotes: plan.scenes?.[i]?.motionNotes || s.visualPrompt || '',
        publicAssetFiles: s.publicAssetFiles || [],
        subtitles: s.subtitles || [],
      })),
    },
    null,
    2,
  )

  return { system, user }
}

export function buildHtmlCoderSkillsPrompt({
  plan,
  timingContract,
  width,
  height,
  aspectRatio,
}) {
  const system = `你是精通 HyperFrames HTML5/Canvas + GSAP 帧级视频渲染的创意编程专家。
你需要生成一个完全自包含、纯离线零外链、支持 Chromium CDP 逐帧精确 seek 的单个 HTML 文件！

=== HYPERFRAMES 确定性逐帧铁律 (违背会被拒绝重修!) ===
1. 输出严格 JSON：{ "files": { "index.html": "<!doctype html>..." } }。
2. 画布固定为 ${width}x${height} (${aspectRatio})，body/stage margin:0 overflow:hidden；商业字体合规铁律：必须通过 @font-face 加载 'fonts/NotoSansSC-VF.woff2'，使用 'Noto Sans SC', sans-serif 与 'JetBrains Mono', monospace，严禁声明 Microsoft YaHei / SimSun / SimHei 等受限商业字体！
3. 严禁引用任何外部 http/https CDN (GSAP、字体、图片、SVG 外部链接全部禁止！)，若需使用素材，使用相对路径（如 assets/...）。
4. 严禁出现无限自主驱动动画（不可用 CSS @keyframes、不可在 requestAnimationFrame 内自行推进主时间轴，不可使用 Math.random() 造成前后帧不一致，请使用确定性伪随机函数）。
5. 必须内嵌 <script id="dsh-script-data" type="application/json">PLACEHOLDER</script>（注意请保留该 script 标签占位符或完整嵌入数据，系统会自动写回最新脚本）。
6. 必须保留合成器级强制合规叠层：右上/左上 #ai-badge（「AI 辅助创作」）及片尾最后 2 秒展示 #end-notice，且字幕条 bottom 必须避让目标平台安全区（竖屏 ≥ 22% 高度，横屏 ≥ 13% 高度）；若 script.json 包含 avatarClip.path，需保留 <video id="avatar-overlay-video" muted playsinline> 透明通道画中画/全屏叠层并在 window.__seekToFrame 内按 frame / fps 精确同步 currentTime。
7. 必须向全局暴露确定性 seek 接口：
   window.__totalFrames = <totalDurationInFrames>;
   window.__seekToFrame = function(frameIndex) { ... };
   调用 window.__seekToFrame(f) 时必须立刻、同步地将整个 DOM + Canvas（含多镜头粒子/光晕/3D透视变换/数字滚动/转场闪白/双语或中文字幕/音频节拍律动条）渲染至精确的第 f 帧状态！
8. 必须为每个分镜保留对应的 <template id="scene-01">...</template> 或 <section data-scene-id="scene-01"> 元素以配合系统场景覆盖率检测，同时确保多镜头视觉极具大片质感（背景景深光斑、暗角、胶片微噪点、网格/曲线、弹性缩放、清晰字幕条）。`

  const user = JSON.stringify(
    {
      task: '生成 HyperFrames 逐帧可控完整 index.html (严格 JSON { "files": { "index.html": "..." } })',
      canvas: { width, height, aspectRatio, fps: timingContract.fps, totalDurationInFrames: timingContract.totalDurationInFrames },
      aiBadge: Boolean(timingContract.aiBadge),
      theme: plan.theme,
      scenes: timingContract.scenes.map((s, i) => ({
        id: s.id,
        index: s.index,
        title: s.title,
        startFrame: s.startFrame,
        durationInFrames: s.durationInFrames,
        durationSec: s.durationSec,
        shotType: plan.scenes?.[i]?.shotType || 'hero-title',
        headline: plan.scenes?.[i]?.headline || s.title,
        kicker: plan.scenes?.[i]?.kicker || `SCENE 0${i + 1}`,
        metrics: plan.scenes?.[i]?.metrics || [],
        motionNotes: plan.scenes?.[i]?.motionNotes || s.visualPrompt || '',
        assetPaths: s.assetPaths || [],
        subtitles: s.subtitles || [],
      })),
    },
    null,
    2,
  )

  return { system, user }
}
