# AGENTS.md — DSH Video Workbench (Universal Multi-Agent Guide)

> **Original Author**: Merziller · **QQ**: `1411574209` · **WeChat**: `Merziller` · **Email**: `k26789228@gmail.com`  
> **Repository**: https://github.com/Merziller/dsh-video-workbench (MIT License)

This repository is a **universal, agent-agnostic Dual-Engine AI Video Studio** compatible with **OpenAI Codex CLI, Claude Code, WorkBuddy, Cursor, Windsurf, Cline, OpenCode, Antigravity, Gemini CLI, and DeepSeek Harness (DSH)**.

## Quick Start for Any Local Agent
1. Install Node dependencies once: `npm install` (or `pnpm install`).
2. Expose all **48 video production tools** over standard MCP stdio:
   ```bash
   node ./bin/dsh-video-mcp.mjs
   ```
3. Launch the standalone visual Web Studio — the **AI Agent War Room** with three switchable skins (default **棱镜实验室 Prism Lab**, plus **星舰剪辑甲板 Nova Deck** and **墨韵织机 Ink Loom**) — silently in background (zero black CMD window on Windows; stop via `stop-workbench.cmd` or `node ./bin/dsh-video-cli.mjs stop`):
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
- **AI 剪辑 (local, free)**: `speech_engine`, `transcribe_media`, `rough_cut_talking_head` (talking-head rough cut + real captions + packaging, incl. `screen` for screen recordings and the cartoon presenter `mascot`), `index_footage`, `make_highlight_reel`.
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
- **Attribution**: Retain original author credit (`Merziller`, `QQ: 1411574209`, `WeChat: Merziller`, `Email: k26789228@gmail.com`) per `LICENSE` and `NOTICE`.
- **Zero Hardcoded Secrets/Paths**: Keep API keys and personal directories in `.env` (never tracked in git).
- **Commercial-Safe Fonts**: Generated videos must use bundled SIL OFL fonts (`Noto Sans SC`, `Source Han Serif SC Heavy`, `JetBrains Mono`) — never `Microsoft YaHei` / `SimSun` / `SimHei`.
- **Verification**: Run `npm test` (full automated self-test suite) and `npm run pack:bundle` before releasing.
