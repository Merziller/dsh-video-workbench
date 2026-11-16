# 🎬 DSH Video Workbench (`dsh-video-workbench`)

> **面向 DeepSeek Harness (DSH) 的双引擎（Remotion 4.x TSX & HyperFrames HTML5/Canvas）多智能体 AI 视频全链路工作台插件套件**  
> **Dual-Engine (Remotion & HTML5) Multi-Agent AI Video Studio for DeepSeek Harness — Import Assets, AI Script & Prompt Polish, BGM Beat-Sync, IndexTTS-2.5 Voice & Clone, Custom TSX Coding & Full-FPS MP4**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows%2011-0078D6.svg)](#)
[![Engine: Remotion 4.x & HTML5](https://img.shields.io/badge/Engine-Remotion%204.x%20%7C%20HTML5-38bdf8.svg)](#)
[![TTS: IndexTTS-2.5 & GPT-SoVITS](https://img.shields.io/badge/TTS-IndexTTS--2.5%20%7C%20GPT--SoVITS-10b981.svg)](#)

---

## 📖 目录 / Table of Contents
- [一、核心特性 (Features)](#-一核心特性-features)
- [二、系统架构图 (Architecture)](#-二系统架构图-architecture)
- [三、工作台使用指南（AI 作战大屏 + 分步精修）](#-三工作台使用指南ai-作战大屏--分步精修)
- [四、Windows 11 安装与挂载 DeepSeek Harness (Quick Start)](#-四windows-11-安装与挂载-deepseek-harness-quick-start)
- [五、本地 IndexTTS-2.5 与声音克隆指南](#-五本地-indextts-25-与声音克隆指南)
- [六、数字人叠加引擎说明 (`@dsh-video/tool-avatar`)](#-六数字人叠加引擎说明-dsh-videotool-avatar)
- [七、常见问题排查 (Troubleshooting)](#-七常见问题排查-troubleshooting)
- [八、English Documentation](#-八english-documentation)

---

## ✨ 一、核心特性 (Features)

1. **⚡ 4-Agent AI 作战大屏 + 分步精修工作台 + 实时任务监控**：
   - **策划导演 Agent → 素材剪辑 Agent → 配音混音 Agent → 动效质检 & MP4 导出 Agent** 全程可视化接力运行，支持随时暂停、恢复、强停子进程与断点单步重试。
   - 接入 DeepSeek Harness 桌面端后，顶部标题栏提供 **`💬 DeepSeek 对话 | 🎬 AI 视频工坊`** 胶囊自由左右切换（同时左侧栏亦保留入口），不会困在插件页回不去对话。
2. **🧠 通用四协议大模型接入 + ✨ AI 一键润色提示词**：
   - 支持 **跟随 DSH 客户端自动同步 (`follow-dsh`)** 或插件独立配置，原生兼容 **OpenAI `/v1/chat/completions`**、**Anthropic `/v1/messages`**、**OpenAI `/v1/responses`** 与 **Google Gemini `/v1beta/models`** 四种接口协议。
   - **第 2 步「✨ AI 一键润色提示词」**：只需写一句大白话需求，AI 会结合已上传的图片/视频/BGM 与笔记内容一键扩写成专业导演指令并覆盖替换，支持 **「↩ 恢复原句」**。
3. **🥁 音乐节拍踩点引擎 & 三种配音节奏模式 (`tts` / `tts-beat-sync` / `subtitle-mv`)**：
   - 上传个人 BGM 后自动调用 FFmpeg 波形能量包络探测 **真实 BPM、首拍相位与高潮突降点 (Drops)**。
   - 前端提供明确选择器自由切换：
     - `🗣️ AI 真人配音`：逐幕调用本地 `IndexTTS-2.5` 合成人声旁白 + AI 声学修音 + 自动闪避混音；
     - `⚡ AI 配音+踩拍切镜`：保留真人旁白并让分镜切入贴合音乐节拍；
     - `🔥 纯音乐卡点 (免 TTS)`：跳过语音合成，按 `0.5` / `1` / `2` / `4` 拍自动对准重拍与高潮切镜，输出高燃纯动画 MV 与卡点音效。
   - **依题材自适应节奏 (`auto` / `calm` / `balanced` / `dynamic`)**：不再一刀切套用历史片快闪节奏——品牌故事温情短片自动保持 `4~7s/镜` 从容留白，产品功能/教程保持 `3~5s/镜` 清晰解说，历史卡点 MV 才启用高速半拍闪烁切镜。
4. **🎬 Remotion 批量自定义 TSX 编码 + Step 3 成片原画同步精修**：
   - **Remotion 4.x 引擎** 由大模型分批次手写逐镜 TSX 矢量动画/排版组件（经静态安全沙箱 + `video_lint` + `tsc --noEmit` 最多 3 轮自动修复），无素材题材同样可生成高密度矢量舞台与视觉演出。
   - **Step 3 监看台与作战大屏互动分镜预览**：自动通过 FFmpeg 从 `final.mp4` 为全部分镜抽取实景关键帧缩略图 (`output/scene-thumbs/*.jpg`)，Remotion AI 成片直接支持 **「🎬 成片原画时间轴」** 点击分镜精准跳转，彻底避免 HTML5 骨架稿与 Remotion 实景成片画面不一致的错位感。
   - **AI 辅助创作角标 (`aiBadge`)**：支持自由开启/关闭及 **右上角（默认）/ 左上角 / 右下角 / 左下角** 四角自由切换，避免遮挡主体标题。
5. **🎙️ 常驻本机 `IndexTTS-2.5` 真人配音 + 声纹克隆实验室 (`@dsh-video/tool-local-tts`)**：
   - 通过 `scripts/tts-server.py` 常驻加载 `IndexTTS-2.5`（`indextts.infer_v2_5.IndexTTS2`，兼容回退旧版 `IndexTTS-2` 及 `GPT-SoVITS`），按 205+ 音色库标签与情感参考逐句生成 48kHz 人声并用 `ffprobe` 实测时长回填帧数；支持在浏览器上传干声或麦录采样一键降噪克隆声线并试听选用。
6. **开源商用合规 & 零硬编码敏感路径**：
   - 内置商用免费开源 OFL 字体族（`Noto Sans SC`、`Source Han Serif SC Heavy`、`JetBrains Mono`），`video_lint` 自动拦截未授权商用系统字体。
   - 全部本机路径与接口密钥均由未追踪的 `.env` 驱动，仓库内零硬编码私人路径与密钥。

---

## 🏗️ 二、系统架构图 (Architecture)

```mermaid
flowchart TB
  subgraph UI["前端层: @dsh-video/web-video-workbench (DSH 顶部胶囊切换 · 作战大屏 · 分步精修 · 任务中心)"]
    WarRoom["⚡ AI 作战大屏 (4-Agent 协同 · 互动分镜预览 · 提示词润色 · 配音/节奏选择器)"]
    Studio["🎛 分步精修 (01 素材/提词自拍 · 02 导演/音色/数字人 · 03 成片时间轴与逐幕声线 · 04 质检发布包)"]
  end

  subgraph Core["Cordis 插件层 (@dsh-video/preset-video + web-video-workbench)"]
    Media["@dsh-video/tool-media (导演/Schema 4档降级 · 节拍分析 · BGM/SFX合成 · 批量TSX编码 · 四协议LLM)"]
    Avatar["@dsh-video/tool-avatar (内置声波SVG / 本地抠像合成 / 外接MuseTalk·LatentSync透明WebM)"]
    TTS["@dsh-video/tool-local-tts (IndexTTS-2.5 常驻服务 · 205+音色库 · 声纹克隆)"]
    Suite["@dsh-video/tool-video-suite (video_lint · snapshot-3x3 · 逐帧渲染 · 分镜抽帧 · FFmpeg QA)"]
  end

  subgraph Engines["本机媒体与 AI 引擎 (.env 驱动)"]
    IndexTTS["IndexTTS-2.5 HTTP (scripts/tts-server.py) & GPT-SoVITS"]
    FFmpeg["FFmpeg / ffprobe (侧链闪避混音 · 节拍能量探测 · 关键帧抽取 · H.264 编码)"]
    Renderers["@remotion/renderer (逐帧 TSX) & 无头 Chromium CDP (全帧率 HTML5)"]
  end

  WarRoom & Studio <-->|"/api/video-workbench/*"| Core
  Media --> TTS & Suite & FFmpeg
  Avatar --> TTS & FFmpeg
  TTS --> IndexTTS & FFmpeg
  Suite --> Renderers & FFmpeg
```

---

## 🎯 三、工作台使用指南（AI 作战大屏 + 分步精修）

1. **创建或切换视频工程**：点击左上角工程下拉胶囊，新建空工程或切换现有工程；顶栏支持随时在 **`← DeepSeek 对话`** 与 **`🎬 AI 视频工坊`** 之间无损切换。
2. **Card 1 · 导入素材 / 极速备料**：拖拽图片、视频片段、背景音乐 (`BGM`)、文本笔记 (`txt`/`md`)，或点击「一键加载演示素材」/「打开提词器自拍」。
3. **Card 2 · 编写或 AI 润色指令 + 选定节奏与配音方式**：
   - 输入一句简单想法，点击右上角 **「✨ AI 一键润色提示词」** 自动生成专业导演指令（不满意可点 **「↩ 恢复原句」**）；
   - 按需选择 **画面比例**、**视觉基调风格**、**节奏适配方案 (`AI智能适配` / `舒缓` / `稳健` / `高燃`)**、**AI 辅助角标开关与四角位置**，以及 **配音与卡点节奏模式 (`AI真人配音` / `配音+踩拍` / `纯音乐卡点免TTS`)**。
4. **Card 3 · 发车检查并启动 4-Agent 全自动出片**：等待 4 张 Agent 卡片接力跑完，中心自动切出高清 MP4 播放器或跳转 **第 3 步「监看台与改片」** 逐幕精修文案、替换单幕配音音色或用自然语言让 AI 重写单幕特效。

---

## 🚀 四、Windows 11 安装与挂载 DeepSeek Harness (Quick Start)

### 前置依赖（按需准备）
- **必装**：
  - [Node.js](https://nodejs.org/) `>= 20.0.0`（推荐 Node 22 / 24）
  - `FFmpeg` 与 `ffprobe`（已加入系统 `PATH`，或稍后在 `.env` 中指定绝对路径）
  - Windows 系统已安装 **Microsoft Edge** 或 Chrome（用于 HTML5 无头 Chromium CDP 逐帧渲染）
- **可选（按需开启对应引擎）**：
  - **本地真人配音 / 克隆 (`IndexTTS-2.5` 推荐)**：本机准备 [IndexTTS-2.5](https://github.com/index-tts/index-tts) 仓库目录（包含 `indextts/infer_v2_5.py`、`checkpoints/config.yaml` 与模型权重），并拥有可运行其推理的 Python 环境（支持 GPU BF16 推理，亦兼容旧版 `IndexTTS-2` 与 `GPT-SoVITS`）。如暂未部署本地 TTS，仍可使用「纯音乐卡点 (免 TTS)」模式或配置外接语音/字幕工作流。
  - **Remotion 引擎**：本机准备一个包含 `@remotion/bundler`、`@remotion/renderer`、`remotion`、`react` 的模板工程目录（在 `.env` 填入 `REMOTION_TEMPLATE_ROOT`）；如暂不安装 Remotion，可直接使用开箱即用的 **HTML5 动效引擎**。

### 安装步骤

```powershell
# 1. 克隆仓库
git clone https://github.com/Merziller/dsh-video-workbench.git
cd dsh-video-workbench

# 2. 复制环境变量模板并填写你本机的真实路径
Copy-Item .env.example .env
```

编辑 `.env`（常用核心字段如下，具体见 [`.env.example`](./.env.example)）：

```env
# 必填/推荐：FFmpeg 与 ffprobe 可执行文件路径
FFMPEG_PATH=D:/your_tools/ffmpeg/ffmpeg.exe
FFPROBE_PATH=D:/your_tools/ffmpeg/ffprobe.exe

# 本地 IndexTTS-2.5（推荐）
DEFAULT_TTS_ENGINE=indextts25
INDEXTTS_ROOT=D:/your_path/index-tts
INDEXTTS_PYTHON=D:/your_path/index-tts/.venv/Scripts/python.exe
INDEXTTS_ENDPOINT=http://127.0.0.1:9880

# Remotion 引擎模板目录（若需使用 Remotion 4.x 渲染）
REMOTION_TEMPLATE_ROOT=D:/your_path/remotion-template
```

### 方式 A：一键挂载到本机 DeepSeek Harness 桌面端（推荐）

```powershell
# 创建工作区内部包软链，并自动写入 ~/.dsh/profiles/desktop 的 bundles、依赖与插件软链
node scripts/install-profile.mjs
```

执行成功后：**完全退出并重新启动 DeepSeek Harness 客户端**，顶部标题栏中央即出现 **`💬 DeepSeek 对话 | 🎬 AI 视频工坊`** 切换胶囊（左侧栏亦可直达），大模型预设会自动挂载 **`视频制作模式 (video-maker)`**（会自动同步读取你在 DSH 客户端中配置好的模型与 API Key）。

### 方式 B：独立浏览器运行（支持系统浏览器直接开启摄像头自拍）

```powershell
# 启动独立 Web 控制台（默认监听 http://127.0.0.1:4399，可用 DSH_VIDEO_PORT 改端口）
node scripts/dsh-runner.mjs video --keep-alive

# 或者使用快捷脚本（Windows 下若 4399 已被旧进程占用请先关闭旧窗口或改 DSH_VIDEO_PORT）
.\pnpm.cmd dsh video --keep-alive
```

### 验证安装（全链条 16 关自动化自检）

```powershell
node scripts/self-test.mjs
```

> 说明：`self-test.mjs` 会完整测试 FFmpeg 解析、23 个 Cordis 工具注册、`IndexTTS-2.5` 常驻健康检查与真人配音（需已配置 `INDEXTTS_ROOT` / 可访问服务端）、HTML5 & Remotion 双引擎渲染（Remotion 阶段需 `REMOTION_TEMPLATE_ROOT`）、四协议 LLM 模拟自愈、BGM 节拍解析、DSH 同步槽位加载，以及开源合规与脱敏路径扫描。

---

## 🎙️ 五、本地 IndexTTS-2.5 与声音克隆指南

- **常驻服务自动拉起**：调用 `generate_speech` 或工作台「一键出片 / 配音」时，插件会自动探测 `INDEXTTS_ENDPOINT`（默认 `http://127.0.0.1:9880`），若尚未启动则会使用 `INDEXTTS_PYTHON` 自动拉起 [`scripts/tts-server.py`](./scripts/tts-server.py) 加载 `IndexTTS-2.5` 常驻内存（支持通过 `.env` 的 `INDEXTTS_QWEN_EMO=1` 启用 Qwen 情绪控制），无需每次配音冷启动。
- **205+ 音色库 & 一键声纹克隆**：打开 **「选音色 / 克隆我的声音」** 弹窗，支持试听预置/本地扫描音色，也支持上传任意清晰干声 `.wav` / `.mp3` 或麦克风录音一键降噪标准化入库，并即时用 `IndexTTS-2.5` 合成试听。

---

## 🤖 六、数字人叠加引擎说明 (`@dsh-video/tool-avatar`)

插件本着工程诚实原则，在工作台与后端均清楚区分了两种模式（均为带透明 Alpha 通道 `yuva420p` `.webm` 输出）：
1. **免外部 GPU 算力的内置模式（开箱即用）**：
   - **纯 AI 主播形象 (`ai-human`)**：读取逐句合成的语音 WAV 振幅包络（RMS），驱动内置赛博/温暖/极客矢量人物进行实时口型张合与眨眼动画，经无头 Chromium 录制成透明 `.webm` 叠加到画面角落或全屏。
   - **克隆真人底板 (`cloned-human`)**：用 `IndexTTS-2.5` 克隆本人声音，并用 FFmpeg 对上传的本人写真图/出镜视频做圆角画中画或绿幕色键 (`chromakey`) 抠像叠加（**此默认本地模式不做静态照神经网络唇形改写**）。
2. **外接真实神经网络对口型服务（可选扩展）**：
   - 在 Step 2 数字人卡片右上角点 **「⚙ 引擎配置」**（或编辑 `.env` 中的 `AVATAR_PROVIDER` / `AVATAR_ENDPOINT` / `AVATAR_API_KEY`），填入你部署的 **MuseTalk** 或 **LatentSync** 推理接口，插件即可把真人头像+配音提交到远程生成真实唇形驱动的透明 `.webm`。

---

## 🔧 七、常见问题排查 (Troubleshooting)

1. **在 DSH Desktop 客户端里点击「开启摄像头与麦克风」提示 `Permission denied` 怎么办？**
   - 原因通常为 Electron 桌面客户端内置 Webview 默认未放行相机权限，或 Windows「设置 → 隐私和安全性 → 相机/麦克风 → 允许桌面应用访问」被关闭。
   - 解决：工作台提词自拍弹窗已内置零阻塞退路——会先尝试单独降级为仅麦克风录音；若均被拦截，可直接点弹窗内的 **「🌐 在系统浏览器中打开自拍」**（用 Chrome/Edge 打开独立网页端口 `4399` 正常授权录制），或点 **「📁 直接上传本机已录视频/音频入库」** 把手机/系统相机录好的文件一键导入为出镜底板并提取克隆声纹。
2. **为何单独打开 `pnpm dsh video` 报 `EADDRINUSE: 127.0.0.1:4399`？**
   - 说明本机已有另一个工坊进程正在占用 `4399` 端口。可关闭旧窗口，或在启动前设置 `$env:DSH_VIDEO_PORT='4400'` 换用新端口；在 DSH Desktop 内部面板则走 Cordis 鉴权通道不受该端口影响。
3. **如何制作“纯音乐卡点动画（完全跳过 AI 配音）”？**
   - 在 AI 作战大屏 **第 2 张卡片最下方「🥁 配音与卡点节奏模式」**（或分步创作台第 2 步右侧）直接切换为 **「🔥 纯音乐卡点 (免 TTS)」** 即可；上传个人 BGM 后会自动对齐重拍与高潮段落。

---

## 🌐 八、English Documentation

### Overview
**DSH Video Workbench (`dsh-video-workbench`)** is an open-source multi-agent Cordis plugin suite for **DeepSeek Harness (DSH)** on Windows 11. It orchestrates a 4-Agent pipeline (`Director → Asset Editor → TTS/SFX/BGM Mixer → Motion Coder & QA Renderer`) supporting **Remotion 4.x TSX** and **HyperFrames HTML5/Canvas** engines, adaptive genre pacing, FFT/RMS BGM beat-sync (`tts`, `tts-beat-sync`, `subtitle-mv`), **IndexTTS-2.5** local voice synthesis & voice cloning, commercial-safe OFL typography (`Noto Sans SC`, `Source Han Serif SC Heavy`, `JetBrains Mono`), and model-agnostic 4-protocol LLM authoring (`OpenAI Chat`, `Anthropic Messages`, `OpenAI Responses`, `Gemini Native`).

### Package Structure
- `packages/shared`: Zero-hardcode `.env` loader, Windows sandbox-safe `ffmpeg`/`ffprobe` runner, OFL font sync, and safe-zone compliance calculator.
- `packages/dsh-tool-media`: Multimodal director & 4-tier schema degradation planner (`plan-schema.js`), FFT/energy BGM beat analyzer (`beat-analyzer.js`), DSP 48kHz WAV synthesizer & ducked mixer, adaptive genre pacing, and batched Remotion TSX / HTML5 coder (`ai-coder.js`).
- `packages/dsh-tool-local-tts`: Persistent `IndexTTS-2.5` (plus `IndexTTS-2` / `GPT-SoVITS` fallback) manager (`scripts/tts-server.py`), 205+ voice catalog, voice cloning, and `ffprobe` duration alignment.
- `packages/dsh-tool-avatar`: Transparent `yuva420p` WebM digital human compositor (RMS-driven SVG anchor, FFmpeg squircle/chromakey overlay, and pluggable external MuseTalk / LatentSync REST adapter).
- `packages/dsh-tool-video-suite`: Static sandbox linter, 3×3 contact sheet snapshots, keyframe thumbnail extractor (`output/scene-thumbs/*.jpg`), full-FPS CDP / `@remotion/renderer` exporter, and FFmpeg loudness/black-frame QA.
- `packages/dsh-preset-video`: Registers the `视频制作模式` (`video-maker`) DSH Agent Preset and project scaffolder.
- `packages/dsh-web-video-workbench`: Registers `/api/video-workbench/*` endpoints and the DSH Desktop `shell.overlay` top-bar switcher + `main` / `sidebar.panellist` / `tool.call.toolview` UI slots.

### License
Released under the [MIT License](./LICENSE).
