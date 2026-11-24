---
name: dsh-video-workbench
description: Universal Dual-Engine AI Video Studio (Remotion 4.x + Three.js 3D & HyperFrames HTML5) for Claude Code, OpenAI Codex CLI, WorkBuddy, Cursor, Windsurf, Cline, Antigravity, OpenCode, and DeepSeek Harness (DSH). Use when creating animated videos, beat-synced historical/lyric MVs, software tutorials, data/code explainers, reverse-engineering & remaking reference videos via MOTION.md, synthesizing local Chinese TTS/cloning (IndexTTS-2.5, GPT-SoVITS, Edge-TTS, Windows SAPI), or launching the local visual Video Studio.
---

# DSH Video Workbench — Universal Multi-Agent Video Studio Skill

> **Original Author**: Merziller · **QQ**: `1411574209` · **WeChat**: `Merziller` · **Email**: `k26789228@gmail.com`  
> **Repository**: https://github.com/Merziller/dsh-video-workbench (MIT License — retain original author attribution in forks/redistributions)

## Capabilities (48 MCP Tools + AI Agent War Room Web Studio + 影核广场 CinePulse Hub)

1. **Dual-Engine Video Creation**:
   - **Remotion 4.x TSX + Three.js 3D (`<FreeformThreeStage />`) + Dynamic SVG + `NarrativeDioramaStage`** (backlit hero silhouettes, charging cavalry, waving banners, crescent sword slash VFX, red-black conquest maps, 3D bamboo slips)
   - **HyperFrames HTML5/Canvas + Three.js 3D** deterministic full-FPS CDP renderer
2. **CinePulse Hub · 影核广场 (`manage_template_plaza`) & Reference Video Reverse-Engineering (`analyze_reference_video` + `MOTION.md`)**:
   - Browse/apply/publish curated `MOTION.md` blueprints across History, Tech Launch, SaaS Tutorial, Science Explainer, and Data Ranking; or upload any reference `.mp4` for FFmpeg shot-cut + BPM/drop + 9-frame Multimodal Vision reverse-engineering with side-by-side/curtain sync comparison.
3. **Cross-Genre Adaptive Beat-Sync, 48kHz SFX & Mastering (`audioProfile`)**:
   - Automatically adapts FFmpeg beat quantization, 28+ procedural 48kHz SFX palettes (combat, UI clicks/typing, sonar/counters, cartoon boing, shutter, warm chimes), camera beat intensity, and EBU R128 loudness (`-14.0` to `-15.0 LUFS`) across all genres and AI-designed custom profiles.
4. **Optional BYOK Cloud AI Media (`configure_cloud_media` / `generate_cloud_media`)**:
   - Supports Volcengine Seedream/Seedance, Kling AI (JWT/Bearer), Flux, Suno Music, MiniMax Music-2.0 / Speech-02-HD / Hailuo Video, ElevenLabs, plus open Custom HTTP/JSON protocol (sync & async polling) for Image, Video, and Audio.
5. **Optional Multi-Engine TTS (`install_tts_engine` / `generate_speech`) & Silent Windowless Daemon**:
   - Works out-of-the-box with **0GB GPU Windows Native SAPI** or **Pure-Music Beat-Sync (no TTS)**, OR optionally one-click installs `Edge-TTS`, `IndexTTS-2.5`, `IndexTTS-2`, or `GPT-SoVITS`. Launches silently with zero black CMD window (`start-workbench.vbs` / `start-workbench.cmd` / `stop-workbench.cmd`).
6. **AI Agent War Room Web Studio (since v0.6.0)**:
   - Native war-room UI with three switchable skins — **棱镜实验室 Prism Lab (default)**, **星舰剪辑甲板 Nova Deck**, **墨韵织机 Ink Loom**. Every panel (分步精修 step studio, 任务中心 tasks, 影核广场 templates, 配音中心 voices, 云端媒体中心 cloud media, 数字人 avatar, 算力体检 hardware, 设置 · 模型与密钥 settings) is native to the skin; the brief box opens a big editor; 「本地极速草稿」 mode renders without any LLM.
7. **AI 剪辑 — the user's own footage, fully local (no LLM, no cost)**:
   - `speech_engine` (local speech recognition status / install), `transcribe_media` (any clip → text + SRT), `rough_cut_talking_head` (talking-head rough cut: pauses, fillers, stutters, retakes; real captions; packaging `pack`: keywords, chapters, B-roll from the library, `captions`, `screen` for screen recordings, `mascot` = a cartoon presenter from a library picture / plain-background loop), `index_footage` (shots with quality / motion / speech; long uploads then contribute only the window each scene needs), `make_highlight_reel` (Vlog highlights cut to a song's beats).
8. **可填空模板 (`manage_template_plaza` `slots` / `fill`)**: keep a plaza template's shots, timing, layouts, transitions and sound design and fill in the user's words, pictures, clips and music.
9. **由当前智能体代写 — host-agent writing (`configure_llm_model({ mode: 'host-agent' })` + `host_llm_task`)**: for users without an API key (e.g. a Codex / Claude Code subscription). Tools that need a model return `{ background: true, hostJobId }` and queue writing tasks; you answer them with your own model through `host_llm_task` (`next` → write the reply exactly as asked, JSON when asked → `reply`) until the job shows up in `finishedJobs`. Never read or reuse the agent's login / subscription credentials.
10. **「我的动漫形象」 — a reusable talking anime presenter (`manage_anime_presenter`)**: make a character once from the user's photo (anime likeness by the user's own cloud image service — paid per picture, `confirmedCost: true` only after the user agreed — or by the optional local model) or from a cartoon picture; check the face marks (`update face`); use it in talking-head cuts with `rough_cut_talking_head` `pack.mascot { characterId, engine, corner, size }`. Engines: `sprite` (default, free, local: mouth shape per syllable + blinks + nods + breathing, works on every computer), `tha3` (free, optional local Talking Head Anime 3 install; NVIDIA fast, CPU slow), `vidu` / `volc` / `runway` (the user's own key, entered in the studio panel 「云端动漫数字人 · 密钥」, billed per second ≈ 1.9 / 18 / 1.5 元 per minute: `estimate` → user agrees → `confirmedRmb`; otherwise the cut falls back to the free tier).
11. **Visual self-review per sub-shot (`visualReviewFine`, default on) and model usage**: every re-framed sub-shot gets its own review still; a crop issue is fixed by a looser framing without a code rewrite; rewritten shots are re-checked and a worse batch is reverted. Every run writes `output/llm-usage.json` (calls, tokens, pictures, per stage).

## Recommended Agent Workflow

1. **Connect MCP** (if not yet connected):
   - Claude Code: `claude mcp add dsh-video-workbench -- node "<repo>/bin/dsh-video-mcp.mjs"`
   - Codex CLI (`~/.codex/config.toml`): `[mcp_servers.dsh_video_workbench]` -> `command = "node"`, `args = ["<repo>/bin/dsh-video-mcp.mjs"]`
   - WorkBuddy / Cursor / Windsurf / Cline: use `.mcp.json` pointing to `node ./bin/dsh-video-mcp.mjs`
   - DeepSeek Harness (DSH): `dsh plugin --profile desktop add github:Merziller/dsh-video-workbench`
2. **Open Visual Studio UI (optional)**: call `open_video_studio` (or run `node bin/dsh-video-cli.mjs studio --open`) -> `http://127.0.0.1:4399` (the AI Agent War Room). Tell the user: click the brief box (「创意简报」 / 「创意需求」 / 「题 · 需求输入」) to write the brief in the big editor, press `P` for parameters (choose 「本地极速草稿」 if no LLM is configured), then click 「一键出片」 (`R`); per-scene edits are in 「分步精修 → 03 分镜精修」, exports in 「04 交付」 / 「发布包导出」.
3. **Create from Reference Video**:
   - Call `analyze_reference_video({ projectDir, videoPath })` -> inspects cuts, BPM, visual DNA & writes `MOTION.md`.
   - Call `import_assets({ projectDir, sources: [...] })` if user provided BGM or footage.
   - Call `run_agent_pipeline({ projectDir, topic, engine: 'remotion', narrationMode: 'subtitle-mv', mode: 'ai-coded' })`.
4. **Create from Scratch / Assets**:
   - `import_assets` -> `run_agent_pipeline` (or `ai_create_video`) -> `video_qa` -> `export_publish_pack`.
   - Style: leave `style` as `auto` (AI 自由匹配: the AI picks one of emerald / tech / cinematic / documentary / energetic / warm, or designs a custom style when none fits) unless the user names one; `user:<id>` uses a style the user saved as 「我的风格预设」 in the Studio.
   - Aspect: `16:9`, `9:16`, `3:4` (小红书 / image-text notes, 1080×1440), `1:1`, `4:3` or `auto`.
   - Characters (人物画风): leave `figureStyle` unset or `auto` (the AI picks the look per film; history films default to silhouette) unless the user names one: `silhouette` / `papercut` / `puppet` / `ink` / `flat` / `stick` draw people with the built-in side-view figure library in that look; `custom` + `figureStyleNote` (e.g. 'Q版萌系，圆脸大眼') makes the AI design its own characters. Users can also pick it in the Studio (02 导演参数 → 视觉风格 → 人物画风); a pick there beats style words in the brief.
   - Cover: `export_publish_pack` uses the cover chosen in the Studio (发布包导出 → 封面: best automatic frame, a picked frame, an AI-generated cover); tell the user they can change it there.
   - Users can submit their own work to 影核广场 from the Studio (「投稿到影核广场」, sent by the user via a GitHub issue form or e-mail); see `docs/plaza-community.md`.
5. **Optional Local TTS Installation**:
   - Call `install_tts_engine({ action: 'list' })` or `install_tts_engine({ action: 'install', engineId: 'edge-tts' | 'indextts25' | 'gptvoice', mirror: 'cn' })`.
6. **Fill a template (模板填空)**:
   - `manage_template_plaza({ action: 'slots', templateId, projectDir })` lists every blank (with the template's text as `example`, a `maxLength`, picture places with `required` / `kind`) and the project's media (`library`).
   - Write the texts yourself (keep each line about as long as its example so the shot timing still fits; an empty blank keeps the template's words), pick library asset ids for picture places and `film.music` (an asset id, `generate`, or empty = the library's first song), then `manage_template_plaza({ action: 'fill', projectDir, templateId, fills })`.
   - When the template speaks (`narrationMode` is not `subtitle-mv`), voice every scene (`generate_speech` per scene, or tell the user to press 「一键配音」), then `video_render`.
7. **Edit the user's own recording**: `speech_engine({ action: 'status' })` (install only after the user agrees, ~260 MB) → `rough_cut_talking_head({ projectDir, render: true })`; for a pile of holiday clips use `make_highlight_reel({ projectDir })`.
8. **No API key?** Suggest 「由当前智能体代写」: `configure_llm_model({ mode: 'host-agent' })`, then serve the queued writing tasks with `host_llm_task`.
