import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ensureWin11ProjectGuards,
  REPO_ROOT,
  writeScriptJson,
} from '@dsh-video/shared'
import LocalTtsPlugin from '@dsh-video/tool-local-tts'
import VideoSuitePlugin from '@dsh-video/tool-video-suite'
import MediaPlugin, {
  buildRichHtmlVideo,
  writeRemotionProjectFiles,
} from '@dsh-video/tool-media'

export const VIDEO_MAKER_SYSTEM_PROMPT = `你是 DeepSeek Harness「视频制作模式」(DSH Video Workbench) 的首席多模态视频导演与全栈动效工程师，同时精通 **HTML5/Canvas2D 动效** 与 **Remotion** 双引擎视频工程。

你不仅会写脚本，还能把用户提供的**真实素材（图片、视频片段、背景音乐、音效、文案笔记）**编排成具有**节奏型动态排版 (Kinetic Typography)、3D 透视景深、转场粒子特效 (VFX)、节拍立体音效 (DSP SFX)、镜头推拉摇移 (Ken Burns)、自动闪避配乐 (BPM-synced BGM) 与单行同步字幕**的广播级动态视听成片。

## 一、核心制片工作流

### 阶段 1：素材导入、智能策划与分镜音色匹配（需用户确认）
1. **分析用户素材**：若用户提供了图片/视频/音频文件夹或路径，先调用 \`import_assets\` 扫描并自动通过 \`ffprobe\` 测算分辨率与时长；已有素材可调用 \`list_assets\` 查看。
2. **智能策划分镜（或一键全链路制片）**：
   - 调用 \`plan_video_from_assets\` 根据主题、风格 (\`tech\` / \`cinematic\` / \`documentary\` / \`energetic\` / \`warm\`) 与导入素材生成完整的 \`script.json\`，包含：
     - \`title\`、\`engine\` (\`"html"\` 或 \`"remotion"\`)、\`fps\` (30 或 60)、\`width\` (1920)、\`height\` (1080)、节拍锁定的 \`bgm\` 策略
     - \`theme\` 配色板（确保 WCAG AA 对比度 >= 4.5:1）
     - \`scenes[]\` 分镜列表（自动轮换 6 套高张力版式：\`3d-stage-opener\` / \`media-split-motion\` / \`kinetic-impact\` / \`mosaic-pulse-wall\` / \`compare-dual\` / \`radial-climax\`，含 \`highlights\`、\`transition\`、\`vfx\`、\`sfxCues[]\`、\`subtitles[]\`）。
   - 若用户要求“全自动一键生成完整视频”，也可直接调用 \`produce_video\` 串联素材导入、策划、真人配音、双引擎动效生成、混音与 MP4 导出。
3. **音色包管理与匹配**：若用户指定音色则锁定，否则使用 \`list_voices\` / \`match_scene_voices\` 自由匹配最贴合角色与情绪的本地音色；支持通过 \`import_voice_pack\` 导入自定义音色。
4. 向用户展示分镜脚本、素材映射与音色分配表，**等待用户确认后再进入阶段 2**（若用户明确要求一键全自动生成则直接推进）。

### 阶段 2：真人配音实测时长 + 节拍音效混音 + 双引擎动效生成
1. **真人语音合成与 ffprobe 实测（严禁瞎猜时长）**：
   - 逐幕调用 \`generate_speech\` 启动并调用本机 \`IndexTTS-2\`（或 \`GPTvoice-tts\`）合成真实人声 WAV，自动通过 \`ffprobe\` 测得精确 \`durationSec\` 并按 \`durationInFrames = Math.ceil((0.28 + durationSec + 0.42) * fps)\` 回填 \`script.json\`。
2. **节拍音效与多轨配乐**：调用 \`generate_sfx_bgm\` 生成节拍对齐的立体声 SFX 干声轨道（\`hit\`/\`whoosh\`/\`riser\`/\`counter\`/\`chime\`/\`sub_drop\`）与含鼓组、贝斯、铺底与琶音的多乐器 BGM；如用户已导入 BGM/SFX 则优先采用用户音频。
3. **双引擎代码生成与工程规范体检**：
   - **HTML 引擎**：使用 \`<template>\` 隔离分镜、#world 节拍摄像机震动与缩放、双 Canvas2D（星空/粒子/冲击波/高光扫光/虹膜擦除转场）与逐字弹性排版，暴露 \`window.__seekToFrame(frame)\`。
   - **Remotion 引擎**：使用 \`src/Root.tsx\` + \`src/VideoComposition.tsx\` 的 \`<Img>\`、\`<OffthreadVideo>\`、\`useCurrentFrame()\`、\`spring()\`、\`interpolate()\` 实现同等 6 套动效版式与转场，严禁 CSS \`transition\` / \`@keyframes\`。
   - 调用 \`video_lint\` 核验规范；如需内部逐帧排查构图问题可按需调用 \`video_snapshot\` + \`read_image\`（勿在用户界面强推静态拼图）。

### 阶段 3：多轨闪避混音与全帧率成片 MP4 导出
- 调用 \`video_render\` 将配音、立体声混响 SFX、BPM 配乐经 \`ffmpeg\` 侧链闪避混音输出 \`master-audio.wav\`，再通过无头浏览器 CDP 逐帧渲染或 Remotion 引擎渲染出 BT.709 标准全帧率 H.264 (\`yuv420p\`) MP4 成品。

---

## 二、Windows 11 本机与开源合规铁律
1. **零 C 盘占用**：所有项目工程、临时文件 (\`.tmp\`)、npm 缓存 (\`.npm-cache\`)、音频与 MP4 必须保存在项目所在 D/E 盘目录，并在工程根目录维持 \`.npmrc\`。
2. **Windows 11 本地字体优先**：CSS / TSX 字体栈必须以 \`Microsoft YaHei\` 与 \`Consolas\` 为首选项并声明本地 \`@font-face\`。
3. **零硬编码敏感信息**：所有生成源码严禁出现个人磁盘绝对路径或 API Key。

---

## 三、可用核心工具清单
- 素材与导演策划：\`import_assets\`、\`list_assets\`、\`generate_sfx_bgm\`、\`plan_video_from_assets\`、\`produce_video\`
- 语音与音色包：\`list_voices\`、\`import_voice_pack\`、\`match_scene_voices\`、\`generate_speech\`
- 视频检测与渲染：\`video_lint\`、\`video_snapshot\`、\`video_render\`
- 文件与终端：\`bash\` / \`pwsh\`、\`read\`、\`write\`、\`edit\`、\`read_image\`
`

/**
 * Generate a rich HTML5/Canvas dual-engine `index.html` with `<template>` scene isolation,
 * user image/video rendering, Ken Burns motion, bokeh particles, and async `window.__seekToFrame`.
 */
export function buildHtmlSceneTemplate(script) {
  return buildRichHtmlVideo(script)
}

/**
 * Initialize a new Dual-Engine Video Project with `.npmrc`, `script.json`, and entry files.
 */
export function scaffoldVideoProject(projectDir, options = {}) {
  const absDir = resolve(projectDir)
  ensureWin11ProjectGuards(absDir)

  const title = options.title || 'DeepSeek Harness 双引擎视频演示'
  const engine = options.engine === 'remotion' ? 'remotion' : 'html'
  const fps = Number(options.fps) || 30
  const style = options.style || 'tech'

  const initialScript = {
    title,
    engine,
    style,
    fps,
    width: 1920,
    height: 1080,
    audience: options.audience || '开发者与数字内容创作者',
    goal: options.goal || '展示素材导入、AI 分镜策划、音效配乐混音、双引擎动效与本地真人配音全链路能力',
    voiceMode: options.voiceMode || 'auto',
    defaultVoiceId: options.defaultVoiceId || 'auto',
    bgm: options.bgm || {
      enabled: true,
      mood: style === 'cinematic' ? 'cinematic' : style === 'warm' ? 'warm' : 'tech',
      volume: 0.2,
    },
    theme: options.theme || {
      background: '#070B16',
      surface: '#111A30',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      accent: '#38BDF8',
    },
    scenes: options.scenes || [
      {
        id: 'scene-01',
        title: '双引擎动效：从素材到成片',
        narration:
          '欢迎体验 DeepSeek Harness 视频工作台。导入你的图片、视频与音乐素材，AI 自动完成文案编排、3D 动效、节拍音效与真人配音。',
        emotion: '平静',
        role: 'host',
        voiceId: 'auto',
        layout: '3d-stage-opener',
        camera: 'zoom-in',
        transition: 'iris-circle',
        vfx: '3d-depth+sweep',
        sfxCue: 'hit',
        highlights: ['3D 透视舞台', '双引擎动效', '一键成片'],
        visualPrompt: '3D 透视浮动卡片环绕聚拢，配合逐字弹性冲击标题与光束扫过。',
        durationSec: 4.5,
      },
      {
        id: 'scene-02',
        title: '本地音色匹配：立体声混音',
        narration:
          '内置两百零五个本地音色并支持自定义音色包，配合节拍锁定的立体声转场音效与背景音乐闪避技术，让人声清晰突出、节奏紧凑自然。',
        emotion: '高兴',
        role: 'storyteller',
        voiceId: 'auto',
        layout: 'kinetic-impact',
        camera: 'pan-left',
        transition: 'block-wipe',
        vfx: 'sparks+shockwave',
        sfxCue: 'whoosh',
        highlights: ['205 本地音色', '48kHz 立体声', '节拍自动闪避'],
        visualPrompt: '块状擦除接强力逐字排版，冲击波光环与微粒火花随重拍脉冲跃动。',
        durationSec: 5.0,
      },
      {
        id: 'scene-03',
        title: '全帧率高清渲染：即刻交付',
        narration:
          '双引擎均支持确定性逐帧捕获与多轨合成，一键输出色彩精准的 1080p 高清成片视频。',
        emotion: '激昂',
        role: 'narrator',
        voiceId: 'auto',
        layout: 'radial-climax',
        camera: 'zoom-out',
        transition: 'zoom-punch',
        vfx: 'radial-speedlines',
        sfxCue: 'chime',
        highlights: ['1080p 60fps', 'BT.709 色彩', '即刻成片'],
        visualPrompt: '放射状速度线爆裂展开，盖章特技与流光长条收尾。',
        durationSec: 4.5,
      },
    ],
  }

  const saved = writeScriptJson(absDir, initialScript)
  const htmlPath = join(absDir, 'index.html')
  writeFileSync(htmlPath, buildHtmlSceneTemplate(saved.data), 'utf8')

  if (engine === 'remotion') {
    writeRemotionProjectFiles(absDir, saved.data)
  }

  return {
    projectDir: absDir,
    scriptPath: saved.scriptPath,
    htmlPath,
    script: saved.data,
  }
}

export const name = 'dsh-preset-video'

export function apply(ctx) {
  // 1. Register local TTS, Video Suite, and Media Production tools directly in current context
  ctx.plugin(LocalTtsPlugin)
  ctx.plugin(VideoSuitePlugin)
  ctx.plugin(MediaPlugin)

  // 2. Register the `视频制作模式` (id: `video-maker`) preset if `agentPresets` service is available
  ctx.inject(['agentPresets'], (innerCtx) => {
    innerCtx.agentPresets.register({
      id: 'video-maker',
      name: '视频制作模式',
      description:
        '支持素材导入、AI 分镜策划、音效配乐混音、HTML5/Remotion 双引擎动效与本地真人配音全链路视频工作台。',
      order: 15,
      plugins: [
        {
          path: '@deepseek-ai/dsh-persona',
          config: {
            prompt: VIDEO_MAKER_SYSTEM_PROMPT,
          },
        },
        { path: '@deepseek-ai/dsh-agent-instructions' },
        { path: '@deepseek-ai/dsh-tool-bash' },
        { path: '@deepseek-ai/dsh-tool-pwsh' },
        { path: '@deepseek-ai/dsh-tool-fs' },
        { path: '@deepseek-ai/dsh-tool-fs-search' },
        { path: '@deepseek-ai/dsh-tool-jobs' },
        { path: '@deepseek-ai/dsh-skill-filesystem' },
        { path: '@deepseek-ai/dsh-tool-skill' },
        { path: join(REPO_ROOT, 'packages', 'dsh-tool-local-tts', 'index.js') },
        { path: join(REPO_ROOT, 'packages', 'dsh-tool-video-suite', 'index.js') },
        { path: join(REPO_ROOT, 'packages', 'dsh-tool-media', 'index.js') },
      ],
    })
  })
}

export default { name, apply }
