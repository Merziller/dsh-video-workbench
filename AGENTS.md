# AGENTS.md — 禾杨视频工坊 · DSH Video Workbench (Universal Multi-Agent Guide)

> **Copyright**: `Copyright (c) 2026 绍兴市柯桥区禾杨智绘软件开发工作室 & Merziller (子墨)` · **Studio (出品)**: 禾杨智绘（绍兴市柯桥区禾杨智绘软件开发工作室）  
> **Original Author**: Merziller · **QQ**: `1411574209` · **WeChat**: `Merziller` · **Email**: `k26789228@gmail.com`  
> **Repository**: https://github.com/Merziller/dsh-video-workbench (MIT License)

This repository is a **universal, agent-agnostic Dual-Engine AI Video Studio** compatible with **OpenAI Codex CLI, Claude Code, WorkBuddy, Cursor, Windsurf, Cline, OpenCode, Antigravity, Gemini CLI, and DeepSeek Harness (DSH)**.

## Quick Start for Any Local Agent
1. Install Node dependencies once: `npm install` (or `pnpm install`).
2. Expose all **49 video production tools** over standard MCP stdio:
   ```bash
   node ./bin/dsh-video-mcp.mjs
   ```
3. Launch the standalone visual Web Studio — the **AI Agent War Room** with three switchable skins (default **棱镜实验室 Prism Lab**, plus **星舰剪辑甲板 Nova Deck** and **墨韵织机 Ink Loom**) — silently in background (zero black CMD window on Windows; stop via `stop-workbench.cmd` or `node ./bin/dsh-video-cli.mjs stop`; after a plugin update, starting it again replaces a background studio that still runs the old code — never in the middle of a render):
   ```bash
   node ./bin/dsh-video-cli.mjs studio --open
   ```
4. Check hardware & environment readiness:
   ```bash
   node ./bin/dsh-video-cli.mjs doctor
   ```
5. Print ready-to-paste MCP config for your agent (`claude`, `codex`, `workbuddy`, `cursor`, `dsh`):
   ```bash
   node ./bin/dsh-video-cli.mjs print-config
   ```

## No model API key? 「由当前智能体代写」 (host-agent writing)
- Users on a subscription (Codex, Claude Code, Cursor …) can choose 「由当前智能体代写」 in Settings · 模型与密钥, or you call `configure_llm_model({ mode: 'host-agent' })`.
- Tools that need a model then return `{ background: true, hostJobId }` and queue writing tasks: serve them with `host_llm_task` — `next` (the task: system prompt, messages, exact output rules, images as local files) → write the answer with your own model → `reply { id, text }` — until the job appears in `finishedJobs`.
- The plugin never reads or reuses any agent login, token or credential file; do not offer to either.

## Newer features agents can drive
- **Local speech recognition installs itself**: the first time the War Room opens (or a tool needs it) the engine (~260 MB, once, domestic mirrors) is downloaded and installed in the background; `transcribe_media`, `rough_cut_talking_head`, `make_short_clips` and `index_footage` with `transcribe: 'on'` wait for it — never ask the user to install it first. `speech_engine({ action: 'status' })` shows the progress (`install`), `action: 'install'` retries at once after a failure; `DSH_ASR_AUTO_INSTALL=0` turns the automatic install off.
- **AI 剪辑 (local, free)**: `speech_engine`, `transcribe_media`, `rough_cut_talking_head` (talking-head rough cut + real captions + packaging, incl. `screen` for screen recordings and the cartoon presenter `mascot`), `index_footage`, `make_highlight_reel`.
- **长视频拆条 (`make_short_clips`)**: `find` (one model call per ~60 min of speech; host-agent mode runs in the background) → `update` (titles, on / off, one sentence earlier / later) → `render` (local FFmpeg, free) → `output/clips/<recording>/` with MP4, cover, SRT and 发布文案.md. Only recordings the user imported; never download or publish.
- **Music start and narration check**: `bgmStartFrom` ('auto' default = an uploaded song longer than the film starts at its best bar line; 'head' = from the top) and `narrationCheck` (default on: local speech recognition listens to each TTS take, one automatic re-dub, advisory warnings) on `run_agent_pipeline` / `ai_create_video`.
- **End notice off by default**: `endNotice` / `endNoticeCredit` (the last line of a film and the plugin credit in it) are opt-in; turn them on only when the user asks. The LICENSE / NOTICE attribution is unchanged.
- **「我的动漫形象」 talking anime presenter**: `manage_anime_presenter` (`list` / `create` / `update` / `delete` / `engines` / `estimate`). A character is made once (photo → anime likeness via the user's cloud image service = paid per picture, or the optional local model; or a cartoon picture as it is) and used in any cut via `rough_cut_talking_head` `pack.mascot { characterId, engine }`: `sprite` (free, local mouth shapes + blinks + nods, default), `tha3` (free optional local model), `vidu` / `volc` / `runway` (the user's own key, entered by the user in the studio panel 「云端动漫数字人 · 密钥」 — never ask for it in chat; billed per second, ≈ 1.9 / 18 / 1.5 元 per minute; optional `mode`: volc `loopy` | `normal` | `loopyb`, vidu `540p` | `720p`). **Never pay without the user's consent**: show `estimate` first, then pass `confirmedCost: true` (likeness) / `confirmedRmb` (clip); without it the free tier is used.
- **Fine visual self-review**: `visualReviewFine` (default on) reviews every re-framed sub-shot; each run writes `output/llm-usage.json` (model calls, tokens, pictures per stage).
- **模板填空**: `manage_template_plaza` actions `slots` and `fill` (see `SKILL.md` → 「Fill a template」).
- **DSH NEXT**: the plugin installs its 「视频制作模式」 agent preset into DSH's `.agent-presets` folder (`node bin/dsh-video-cli.mjs install-preset` by hand; a preset the user edited is kept).

## Guiding a User Through the War Room (since v0.6.0)
- The brief box (棱镜 「创意简报」 / 星舰 「创意需求」 / 墨韵 「题 · 需求输入」) opens the big editor 「创意需求 · 导演指令」; 「保存需求」 saves, 「保存并一键出片」 saves and renders.
- Parameters (`P`): 棱镜 「参数控制单」 / 星舰 「飞控面板」 / 墨韵 「经折 · 出片参数」. Without an LLM, set the creation mode to 「本地极速草稿」.
- Render with 「一键出片」 (`R`); 「暂停」 / 「停止」 / 「重试」 control the run; per-scene edits live in 「分步精修 → 03 分镜精修」, exports in 「04 交付」 and 「发布包导出」.
- All tools: 棱镜 「实验工具」, 星舰 gear 「设置与工具」, 墨韵 「工坊百宝格」. The full beginner guide is README section 「三、工作台使用指南」.

## Web Studio UI Architecture (for agents editing the UI)
- **Host**: `packages/dsh-web-video-workbench/lib/client.js` — loads the selected skin in a same-origin iframe, keeps project / run state, executes bridge actions and remembers the skin choice. Bridge protocol: `packages/dsh-web-video-workbench/lib/warroom/BRIDGE.md`.
- **Skins**: `packages/dsh-web-video-workbench/lib/warroom/prism-lab.html` (default), `nova-deck.html`, `ink-loom.html` are generated files — edit their sources under `design-prototypes/` and rebuild as described in `design-prototypes/README.md`.
- **Native panel kit** (`PK`, shared by all skins): sources in `packages/dsh-web-video-workbench/lib/warroom/kit/src/*.js`; contract in `kit/KIT.md`. Rebuild after every change (never hand-edit the generated `lib/warroom/kit.js` / `kit.css`):
   ```bash
   node packages/dsh-web-video-workbench/lib/warroom/kit/build.mjs
   ```
- **UI acceptance test** (all skins × panels × window sizes; checks clipped / overlapping text and console errors):
   ```bash
   node scripts/tests/warroom-ui.e2e.mjs --gpu
   ```

## Core Engineering Rules
- **Attribution**: Retain the dual credit — the studio `绍兴市柯桥区禾杨智绘软件开发工作室` and the original author (`Merziller`, `QQ: 1411574209`, `WeChat: Merziller`, `Email: k26789228@gmail.com`) — per `LICENSE` and `NOTICE`.
- **Brand names**: the UI product name is 「禾杨视频工坊」; every product name / credit text comes from `packages/shared/brand.js` (`BRAND`). Never rename identifiers: the package name `dsh-video-workbench`, the repository URL, `bin/dsh-video-cli.mjs` / `bin/dsh-video-mcp.mjs`, MCP tool names, `/api/video-workbench/*` routes, `DSH_*` environment variables, or the titles of users' projects.
- **Zero Hardcoded Secrets/Paths**: Keep API keys and personal directories in `.env` (never tracked in git).
- **Commercial-Safe Fonts**: Generated videos must use bundled SIL OFL fonts (`Noto Sans SC`, `Source Han Serif SC Heavy`, `JetBrains Mono`) — never `Microsoft YaHei` / `SimSun` / `SimHei`.
- **Verification**: Run `npm test` (full automated self-test suite) and `npm run pack:bundle` before releasing.
