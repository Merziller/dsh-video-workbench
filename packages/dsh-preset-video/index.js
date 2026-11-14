import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ensureWin11ProjectGuards,
  REPO_ROOT,
  writeScriptJson,
} from '@dsh-video/shared'
import LocalTtsPlugin from '@dsh-video/tool-local-tts'
import VideoSuitePlugin from '@dsh-video/tool-video-suite'

export const VIDEO_MAKER_SYSTEM_PROMPT = `你是 DeepSeek Harness「视频制作模式」(DSH Video Workbench) 的首席多模态视频导演与全栈动画工程师，同时精通 **HTML/GSAP** 与 **Remotion** 双引擎视频工程。

## 一、核心三阶段确认工作流（严格按阶段推进）

### 阶段 1：编写脚本、分镜与音色匹配（需用户确认）
1. 在项目根目录创建或更新统一的 \`script.json\`，必须包含：
   - \`title\`、\`engine\` (\`"html"\` 或 \`"remotion"\`)、\`fps\` (默认 30)、\`width\` (1920)、\`height\` (1080)
   - \`theme\` 配色板（\`background\`、\`surface\`、\`textPrimary\`、\`textSecondary\`、\`accent\`，确保符合 WCAG AA 对比度 >= 4.5:1）
   - \`audience\`（目标受众）、\`goal\`（视频核心目标）
   - \`voiceMode\` (\`"auto"\` 或 \`"manual"\`)、\`defaultVoiceId\`
   - \`scenes[]\` 分镜列表（含 \`id\`、\`title\`、\`narration\` 旁白台词、\`emotion\` 情绪、\`role\` 角色、\`voiceId\`、\`visualPrompt\`、\`subtitles[]\` 逐句时间戳）。
2. **音色包导入与智能匹配**：
   - 若用户提供了自己的音频/音色包路径，先调用 \`import_voice_pack\` 导入至本地音色库。
   - 调用 \`list_voices\` 与 \`match_scene_voices\`：若用户指定了某个音色，则锁定该 \`voiceId\`；若未指定（默认 \`voiceId: "auto"\`），根据分镜台词、情绪、角色与受众自由匹配最合适的音色（如知性女主播、苏瑶温婉女声、传统评书、纪录片浑厚男声等）。
3. 向用户展示分镜脚本与音色分配表，**等待用户确认后再进入阶段 2**。

### 阶段 2：配音测算真实时长 + 编写动画代码 + 九宫格视觉自检（需用户确认）
1. **真实时长测算（严禁瞎猜时长）**：
   - 逐幕调用 \`generate_speech\` 合成 WAV 语音（优先使用本机 \`IndexTTS-2\`，支持切换 \`GPTvoice-tts\`）。
   - 工具会自动调用 \`ffprobe\` 测量音频精确秒数 \`durationSec\`，计算 \`durationInFrames = Math.ceil(durationSec * fps)\` 并自动回填至 \`script.json\`。
2. **编写双引擎动画代码**：
   - **HTML/GSAP 模式**：在 \`index.html\` 中将每个分镜包裹在独立的 \`<template id="scene-XX">\` 标签内防止样式/DOM 冲突；使用 GSAP 构建主时间轴并暴露 \`window.__seekToFrame(frame)\` 与 URL \`?frame=\` 参数桥接。
   - **Remotion 模式**：在 \`src/\` 下使用 \`useCurrentFrame()\`、\`interpolate()\`、\`spring()\` 驱动全部动画，严禁使用 CSS \`@keyframes\` 或 \`transition\`。
3. **代码校验与 3×3 九宫格多模态视觉自检**：
   - 调用 \`video_lint\` 检查 \`<template>\` 隔离、SVG/CSS ID 冲突、WCAG AA 对比度与字体规范。
   - 调用 \`video_snapshot\` 生成 **3×3 九宫格视觉自检图 (\`snapshot-3x3.png\`)**。
   - 立即调用 \`read_image\` 读取该九宫格图片进行多模态视觉自检（检查文字溢出、排版重叠、对比度与动画关键帧节奏），修复发现的问题后向用户汇报自检结果，**等待用户确认后再进入阶段 3**。

### 阶段 3：导出成品 MP4
- 调用 \`video_render\` 将画面序列与各分镜 WAV 配音通过 \`ffmpeg\` 混音编码为标准 H.264 (\`yuv420p\`) MP4 视频，并向用户提供成品路径与预览指引。

---

## 二、Windows 11 本机避坑铁律
1. **防沙箱 EPERM 缓存隔离**：新建或初始化任何视频项目时，必须在项目根目录生成本地 \`.npmrc\`（内容包含 \`cache=./.npm-cache\`）。
2. **Windows 11 本地字体优先**：所有 CSS 字体声明必须优先使用 Windows 11 本地自带的 \`Microsoft YaHei\`（微软雅黑）与 \`Consolas\`，并声明 \`@font-face { src: local('Microsoft YaHei'), local('Consolas'); }\`，严禁依赖外网缓慢加载的 WebFont 导致截帧空白。
3. **零硬编码路径**：严禁在生成的代码中硬编码个人绝对路径或 API Key。

---

## 三、可用核心工具清单
- 文件与终端：\`bash\` / \`pwsh\`、\`read\`、\`write\`、\`edit\`、\`read_image\`
- 语音与音色包：\`list_voices\`、\`import_voice_pack\`、\`match_scene_voices\`、\`generate_speech\`
- 视频工程套件：\`video_lint\`、\`video_snapshot\`、\`video_render\`
`

/**
 * Generate a complete HTML/GSAP starter `index.html` with `<template>` scene isolation,
 * Windows 11 local `@font-face` (`Microsoft YaHei` + `Consolas`), and `window.__seekToFrame` bridge.
 */
export function buildHtmlSceneTemplate(script) {
  const theme = script.theme || {
    background: '#0B1020',
    surface: '#131C33',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accent: '#38BDF8',
  }

  const sceneTemplates = (script.scenes || [])
    .map(
      (scene, idx) => `
  <!-- 分镜 ${idx + 1}: ${scene.title} -->
  <template id="${scene.id}">
    <div class="scene-stage" data-scene-id="${scene.id}" data-scene-index="${idx + 1}">
      <div class="scene-bg-glow scene-glow-${(idx % 3) + 1}"></div>
      <header class="scene-header">
        <span class="scene-badge">SCENE 0${idx + 1} · ${scene.emotion || '平静'}</span>
        <span class="scene-voice-tag">🎙️ ${scene.voiceName || scene.voiceId || 'AI Auto'}</span>
      </header>
      <main class="scene-body">
        <h1 class="scene-title">${scene.title}</h1>
        <p class="scene-visual-desc">${scene.visualPrompt || ''}</p>
        <div class="scene-metrics">
          <div class="metric-card">
            <span class="metric-label">DURATION</span>
            <span class="metric-val metric-duration">${Number(scene.durationSec || 4).toFixed(2)}s</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">FRAMES</span>
            <span class="metric-val metric-frames">${scene.durationInFrames || 120}f @ ${script.fps || 30}fps</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">ENGINE</span>
            <span class="metric-val metric-engine">${(script.engine || 'html').toUpperCase()}</span>
          </div>
          <div class="metric-card waveform-card">
            <span class="metric-label">AUDIO WAVEFORM</span>
            <div class="waveform-bars">
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
              <span class="waveform-bar"></span>
            </div>
          </div>
        </div>
      </main>
      <footer class="scene-subtitle-bar">
        <span class="subtitle-text" id="subtitle-text-${scene.id}">${scene.narration || ''}</span>
      </footer>
      <div class="stage-progress-track">
        <div class="stage-progress-fill"></div>
      </div>
    </div>
  </template>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${script.title || 'DSH HTML/GSAP Video Project'}</title>
  <style>
    @font-face {
      font-family: 'DSH-YaHei';
      src: local('Microsoft YaHei UI'), local('Microsoft YaHei'), local('微软雅黑');
      font-weight: 400 700;
    }
    @font-face {
      font-family: 'DSH-Mono';
      src: local('Consolas'), local('Cascadia Mono');
      font-weight: 400 700;
    }
    :root {
      --bg-color: ${theme.background || '#0B1020'};
      --surface-color: ${theme.surface || '#131C33'};
      --text-primary: ${theme.textPrimary || '#F8FAFC'};
      --text-secondary: ${theme.textSecondary || '#CBD5E1'};
      --accent-color: ${theme.accent || '#38BDF8'};
      --font-sans: 'DSH-YaHei', 'Microsoft YaHei', sans-serif;
      --font-mono: 'DSH-Mono', 'Consolas', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: var(--bg-color);
      color: var(--text-primary);
      font-family: var(--font-sans);
      user-select: none;
    }
    #viewport {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 18% 20%, rgba(56, 189, 248, 0.14), transparent 55%),
                  radial-gradient(circle at 82% 80%, rgba(99, 102, 241, 0.14), transparent 55%),
                  var(--bg-color);
    }
    .scene-stage {
      position: relative;
      width: 88%;
      height: 84%;
      background: rgba(19, 28, 51, 0.88);
      border: 1px solid rgba(56, 189, 248, 0.32);
      border-radius: 24px;
      padding: 40px 48px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      overflow: hidden;
    }
    .scene-bg-glow {
      position: absolute;
      width: 420px;
      height: 420px;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.25;
      pointer-events: none;
      z-index: 0;
    }
    .scene-glow-1 { top: -120px; right: -80px; background: #38bdf8; }
    .scene-glow-2 { bottom: -140px; left: -60px; background: #818cf8; }
    .scene-glow-3 { top: -100px; left: 30%; background: #34d399; }
    .scene-header {
      position: relative;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--font-mono);
      font-size: 15px;
      letter-spacing: 0.08em;
    }
    .scene-badge {
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.16);
      color: var(--accent-color);
      border: 1px solid rgba(56, 189, 248, 0.4);
      font-weight: 700;
    }
    .scene-voice-tag {
      color: var(--text-primary);
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.28);
      padding: 6px 14px;
      border-radius: 999px;
    }
    .scene-body {
      margin: auto 0;
      display: flex;
      flex-direction: column;
      gap: 20px;
      z-index: 2;
    }
    .scene-title {
      font-size: clamp(32px, 4.2vw, 54px);
      font-weight: 700;
      line-height: 1.2;
      color: var(--text-primary);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .scene-visual-desc {
      font-size: clamp(16px, 1.8vw, 22px);
      color: var(--text-secondary);
      max-width: 85%;
      line-height: 1.6;
    }
    .scene-metrics {
      display: flex;
      gap: 18px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .metric-card {
      background: rgba(11, 16, 32, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 14px;
      padding: 12px 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-label {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
    }
    .metric-val {
      font-family: var(--font-mono);
      font-size: 18px;
      font-weight: 700;
      color: var(--accent-color);
    }
    .waveform-bars {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      height: 22px;
      padding-top: 2px;
    }
    .waveform-bar {
      width: 5px;
      height: 12px;
      border-radius: 3px;
      background: linear-gradient(180deg, #38bdf8, #34d399);
    }
    .scene-subtitle-bar {
      background: rgba(9, 13, 24, 0.9);
      border-left: 4px solid var(--accent-color);
      padding: 16px 24px;
      border-radius: 12px;
      z-index: 2;
    }
    .subtitle-text {
      font-size: clamp(18px, 2.1vw, 26px);
      color: var(--text-primary);
      line-height: 1.45;
      font-weight: 500;
    }
    .stage-progress-track {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 5px;
      background: rgba(255, 255, 255, 0.08);
      z-index: 3;
    }
    .stage-progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #38bdf8, #818cf8, #34d399);
    }
    #hud-counter {
      position: fixed;
      bottom: 14px;
      right: 22px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      background: rgba(11, 16, 32, 0.8);
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.1);
    }
  </style>
</head>
<body>
  <div id="viewport"></div>
  <div id="hud-counter">FRAME 0</div>

  ${sceneTemplates}

  <script id="dsh-script-data" type="application/json">
${JSON.stringify(script, null, 2)}
  </script>

  <script>
    (function() {
      const rawScript = document.getElementById('dsh-script-data').textContent;
      const scriptData = JSON.parse(rawScript);
      const viewport = document.getElementById('viewport');
      const hud = document.getElementById('hud-counter');
      const fps = Number(scriptData.fps) || 30;
      const scenes = scriptData.scenes || [];
      let currentFrame = 0;

      function findSceneForFrame(frame) {
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          const start = Number(s.startFrame || 0);
          const dur = Number(s.durationInFrames || 90);
          if (frame >= start && frame < start + dur) {
            return {
              scene: s,
              sceneIdx: i,
              localFrame: frame - start,
              progress: (frame - start) / Math.max(1, dur),
            };
          }
        }
        const lastIdx = Math.max(0, scenes.length - 1);
        const last = scenes[lastIdx] || scenes[0];
        const lastDur = Number(last?.durationInFrames || 90);
        return {
          scene: last,
          sceneIdx: lastIdx,
          localFrame: Math.max(0, lastDur - 1),
          progress: 1,
        };
      }

      function renderAtFrame(frame) {
        currentFrame = Math.max(0, Math.floor(Number(frame) || 0));
        const hit = findSceneForFrame(currentFrame);
        if (!hit || !hit.scene) return;

        const tpl = document.getElementById(hit.scene.id);
        if (tpl) {
          viewport.innerHTML = '';
          const clone = tpl.content.cloneNode(true);
          const stage = clone.querySelector('.scene-stage');
          if (stage) {
            const enterProgress = Math.min(1, hit.localFrame / 12);
            stage.style.opacity = String((0.88 + 0.12 * enterProgress).toFixed(3));
            stage.style.transform =
              'translateY(' + ((1 - enterProgress) * 10).toFixed(1) + 'px) scale(' + (0.985 + 0.015 * enterProgress).toFixed(3) + ')';
          }

          // Dynamically sync scene metadata from latest #dsh-script-data
          const badgeEl = clone.querySelector('.scene-badge');
          if (badgeEl) {
            badgeEl.textContent = 'SCENE 0' + (hit.sceneIdx + 1) + ' · ' + (hit.scene.emotion || '平静');
          }
          const voiceTagEl = clone.querySelector('.scene-voice-tag');
          if (voiceTagEl) {
            voiceTagEl.textContent = '🎙️ ' + (hit.scene.voiceName || hit.scene.voiceId || 'AI Auto');
          }
          const durEl = clone.querySelector('.metric-duration');
          if (durEl) {
            durEl.textContent = Number(hit.scene.durationSec || 4).toFixed(2) + 's';
          }
          const framesEl = clone.querySelector('.metric-frames');
          if (framesEl) {
            framesEl.textContent = (hit.scene.durationInFrames || 120) + 'f @ ' + fps + 'fps';
          }

          // Deterministic frame-driven audio waveform bar animation
          const bars = clone.querySelectorAll('.waveform-bar');
          bars.forEach(function(bar, bIdx) {
            const wave = Math.abs(Math.sin(currentFrame * 0.35 + bIdx * 0.9 + hit.sceneIdx));
            const hPx = Math.round(6 + wave * 15);
            bar.style.height = hPx + 'px';
          });

          // Stage progress bar
          const progressFill = clone.querySelector('.stage-progress-fill');
          if (progressFill) {
            progressFill.style.width = Math.min(100, Math.max(2, hit.progress * 100)).toFixed(1) + '%';
          }

          // Active sentence subtitle lookup
          const secInScene = hit.localFrame / fps;
          const subs = hit.scene.subtitles || [];
          const activeSub =
            subs.find(function(sub) {
              return secInScene >= sub.startSec && secInScene <= sub.endSec;
            }) || subs[subs.length - 1];
          const subEl = clone.querySelector('.subtitle-text');
          if (subEl) {
            subEl.textContent = activeSub && activeSub.text ? activeSub.text : hit.scene.narration || '';
          }
          viewport.appendChild(clone);
        }
        if (hud) {
          hud.textContent =
            'SCENE 0' +
            (hit.sceneIdx + 1) +
            ' · FRAME ' +
            currentFrame +
            ' / ' +
            (scriptData.totalDurationInFrames || 0) +
            ' · ' +
            (currentFrame / fps).toFixed(2) +
            's';
        }
      }

      // Deterministic frame-seek bridge for Playwright / Web Workbench iframe
      window.__seekToFrame = function(frame) {
        renderAtFrame(frame);
        return currentFrame;
      };
      window.__getScriptData = function() {
        return scriptData;
      };

      window.addEventListener('message', function(ev) {
        if (!ev.data || typeof ev.data !== 'object') return;
        if (ev.data.type === 'dsh-video:seek') {
          renderAtFrame(ev.data.frame || 0);
        }
      });

      const params = new URLSearchParams(window.location.search);
      const initialFrame = params.has('frame')
        ? Number(params.get('frame'))
        : params.has('time')
          ? Math.floor(Number(params.get('time')) * fps)
          : 8;
      renderAtFrame(initialFrame);
    })();
  </script>
</body>
</html>
`
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

  const initialScript = {
    title,
    engine,
    fps,
    width: 1920,
    height: 1080,
    audience: options.audience || '开发者与数字内容创作者',
    goal: options.goal || '展示 HTML/GSAP 与 Remotion 双引擎工作台及本地音色包智能配音能力',
    voiceMode: options.voiceMode || 'auto',
    defaultVoiceId: options.defaultVoiceId || 'auto',
    theme: {
      background: '#0B1020',
      surface: '#131C33',
      textPrimary: '#F8FAFC',
      textSecondary: '#CBD5E1',
      accent: '#38BDF8',
    },
    scenes: options.scenes || [
      {
        id: 'scene-01',
        title: '双引擎视频工作台：从对话到成片',
        narration: '欢迎体验 DeepSeek Harness 视频工作台。支持 HTML 与 Remotion 双引擎无缝切换，让多模态视频创作真正实现工程化与帧级可控。',
        emotion: '平静',
        role: 'host',
        voiceId: 'auto',
        visualPrompt: '科技蓝流体背景，展示 [DeepSeek Harness | HTML 视频] 胶囊切换器与双引擎架构图。',
        durationSec: 4.5,
      },
      {
        id: 'scene-02',
        title: '自定义音色包导入与 AI 智能声线匹配',
        narration: '无论是温婉叙事、知性主播还是激昂评书，系统都能根据分镜情绪与角色定位自由匹配最佳音色，并支持随时导入你的专属音色包。',
        emotion: '高兴',
        role: 'storyteller',
        voiceId: 'auto',
        visualPrompt: '展示音色包管理矩阵、声波频谱动画与 ffprobe 帧级时长回填流程。',
        durationSec: 5.0,
      },
      {
        id: 'scene-03',
        title: '3×3 九宫格多模态视觉自检与一键渲染',
        narration: '在合成最终视频前，自动抽帧生成三乘三九宫格快照，配合多模态视觉自检消除排版瑕疵，一键编码输出高清成片。',
        emotion: '平静',
        role: 'narrator',
        voiceId: 'auto',
        visualPrompt: '3×3 九宫格分镜快照缩略图矩阵，伴随 H.264 渲染完成徽章。',
        durationSec: 4.5,
      },
    ],
  }

  const saved = writeScriptJson(absDir, initialScript)
  const htmlPath = join(absDir, 'index.html')
  writeFileSync(htmlPath, buildHtmlSceneTemplate(saved.data), 'utf8')

  if (engine === 'remotion') {
    const srcDir = join(absDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const rootTsx = join(srcDir, 'Root.tsx')
    if (!existsSync(rootTsx)) {
      writeFileSync(
        rootTsx,
        `import React from 'react';
import { Composition, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import scriptData from '../script.json';

export const VideoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame % 90, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      flex: 1,
      backgroundColor: scriptData.theme.background,
      color: scriptData.theme.textPrimary,
      fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}>
      <h1>{scriptData.title} (Frame {frame} @ {fps}fps)</h1>
    </div>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={scriptData.totalDurationInFrames || 420}
      fps={scriptData.fps || 30}
      width={scriptData.width || 1920}
      height={scriptData.height || 1080}
    />
  );
};
`,
        'utf8',
      )
    }
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
  // 1. Register local TTS and Video Suite tools directly in current context if `tools` service is active
  ctx.plugin(LocalTtsPlugin)
  ctx.plugin(VideoSuitePlugin)

  // 2. Register the `视频制作模式` (id: `video-maker`) preset if `agentPresets` service is available
  ctx.inject(['agentPresets'], (innerCtx) => {
    innerCtx.agentPresets.register({
      id: 'video-maker',
      name: '视频制作模式',
      description:
        '支持 HTML/GSAP 与 Remotion 双引擎的视频工作台模式：内置三阶段确认流、本地音色包导入与 AI 音色匹配、ffprobe 精确测长及 3×3 九宫格视觉自检。',
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
      ],
    })
  })
}

export default { name, apply }
