/**
 * @dsh-video/tool-media
 * Cordis plugin registering user asset management, procedural SFX/BGM synthesis,
 * multi-track audio mixing, AI storyboard planning, and one-click full video production.
 */
import { join, resolve } from 'node:path'
import { readScriptJson, registerTool, writeScriptJson } from '../shared/index.js'
import { executeGenerateSpeech, getActiveTtsEngineId } from '../dsh-tool-local-tts/index.js'
import {
  importAssets,
  readAssets,
  removeAsset,
  saveUploadedAsset,
  summarizeAssets,
  updateAsset,
} from './asset-manager.js'
import {
  analyzeAudioBeatStructure,
  choreographBeatSfxCues,
  ensureProjectAudioAssets,
  generateBgmWav,
  generateSfxWav,
  mixVideoAudio,
  quantizeScenesToBeatGrid,
} from './audio-synth.js'
import {
  planVideoFromAssets,
  syncProjectCodeFromScript,
} from './ai-director.js'
import { buildRichHtmlVideo } from './html-generator.js'
import { syncRemotionPublicAssets, writeRemotionProjectFiles } from './remotion-generator.js'
import {
  WIRE_PROTOCOLS,
  discoverDshClientConfig,
  getSafeLlmConfigSummary,
  saveLlmConfig,
  testLlmConnection,
  fetchAvailableModels,
  callLlmChat,
  getLlmTimeoutMs,
  resolveLlmConfig,
  saveVisionSettings,
} from './llm-client.js'
import { checkVisionCapability } from './vision-capability.js'
import {
  masterVoiceTracks,
  probeVoiceAcousticTelemetry,
} from './voice-master.js'
import {
  authorBatchedRemotionScenes,
  getAiCodingHistory,
  refineAiScene,
  rollbackAiVersion,
  runAiStudioPipeline,
} from './ai-coder.js'
import { executeCurateAndEditAssets } from './media-editor.js'
import { generateAiCodedSfxCues } from './audio-coder.js'
import { runMultiAgentPipeline, startPipelineBackground } from './pipeline-orchestrator.js'
import { taskManager } from './task-manager.js'
import { getAsrInstallerCatalog, getAsrInstallState, getAsrStatus, startAsrInstall, transcribeMedia, transcriptPlainText } from './speech-recognition.js'
import { buildCaptions, captionsToSrt, planRoughCut } from './rough-cut.js'
import { buildTalkEditProject, runTalkRoughCut } from './talk-edit.js'
import { describeFootageForPrompt, indexFootage } from './footage-index.js'
import {
  HOST_AGENT_MODE,
  describeHostTask,
  listHostTasks,
  listRunningHostJobs,
  nextHostTask,
  startHostJob,
  submitHostReply,
  takeFinishedHostJobs,
} from './host-llm-bridge.js'

/**
 * 宿主智能体代写: a tool that needs model answers must not block the agent that writes them (an agent calls one tool at a
 * time). In that mode the work runs in the background and this returns at once; the agent then serves host_llm_task,
 * which hands back the final result. In every other mode the tool simply runs.
 */
async function runWritingTool(tool, fn) {
  let hostWrites = false
  try {
    hostWrites = resolveLlmConfig().mode === HOST_AGENT_MODE
  } catch {}
  if (!hostWrites) return await fn()
  const job = startHostJob(tool, fn)
  return {
    ok: true,
    background: true,
    hostJobId: job.id,
    message: `已在后台开始（${tool}）。当前是「智能体代写」模式：这项工作需要的每一段 AI 写作都会交给你来完成。请反复调用 host_llm_task（action: "next"），按任务要求写好后用 action: "reply" 交回，直到 host_llm_task 返回本任务（${job.id}）的最终结果。`,
  }
}
import { executeVideoRender as renderProjectVideo } from '../dsh-tool-video-suite/index.js'
import {
  generateAiCodedBgmTrack,
  synthesizeTtsEngineAudioCue,
} from './audio-coder.js'
import {
  normalizeTransitionKind,
  PROMO_SHOT_RECIPES,
  runSchemaDirectorWithDegradation,
  VALID_TRANSITIONS,
} from './plan-schema.js'
import { buildMediaDimsMap, groundVisualAssets, loadSidecarAnchors } from './vision-grounding.js'
import { exportPublishPack } from './publish-pack.js'
import { registerVendorClip, renderVendorClipIsolated } from './vendor-clip.js'
import {
  analyzeReferenceVideo,
  buildMotionMarkdown,
  exportProjectMotionMd,
  loadBrandKit,
  saveBrandKit,
} from './reference-analyzer.js'
import {
  assistCloudMediaPrompt,
  CLOUD_MEDIA_PRESETS,
  commitStagedCloudAsset,
  discardStagedCloudAsset,
  generateCloudMediaAsset,
  getCloudMediaConfigSummary,
  listStagedCloudAssets,
  loadCloudMediaConfig,
  saveCloudMediaConfig,
} from './cloud-media.js'
import {
  applyPlazaTemplateToProject,
  getPlazaTemplate,
  listPlazaTemplates,
  PLAZA_BRAND,
  PLAZA_CATEGORIES,
  publishProjectToPlaza,
} from './template-plaza.js'
import { buildPlazaSubmission, listPlazaSubmissions, previewPlazaSubmission, syncOnlinePlazaTemplates } from './plaza-community.js'
import { listCloudJobs, resolveMediaSourcingPlan } from './cloud-media.js'
import { testCloudMediaConnection } from './cloud-connection-test.js'
import { restoreAiProjectVersion } from './ai-coder.js'
import { createProjectSnapshot, diffProjectVersions, listProjectVersions, pruneProjectHistory } from './project-history.js'
import { listSceneEdits, setSceneLock, setSceneOverrides } from './scene-locks.js'
import { attachCharacter, deleteCharacter, listCharacters, saveCharacter } from './character-bank.js'
import { importStockMedia, searchStockMedia } from './stock-media.js'
import { prepareProjectStyleForRun } from './style-presets.js'
import { describeTemplateSlots, fillTemplateIntoProject, templateFillLibrary } from './template-fill.js'

export {
  analyzeAudioBeatStructure,
  analyzeReferenceVideo,
  buildMotionMarkdown,
  exportProjectMotionMd,
  loadBrandKit,
  saveBrandKit,
  choreographBeatSfxCues,
  quantizeScenesToBeatGrid,
  importAssets,
  readAssets,
  removeAsset,
  saveUploadedAsset,
  summarizeAssets,
  updateAsset,
  ensureProjectAudioAssets,
  generateBgmWav,
  generateSfxWav,
  mixVideoAudio,
  generateAiCodedBgmTrack,
  synthesizeTtsEngineAudioCue,
  PROMO_SHOT_RECIPES,
  VALID_TRANSITIONS,
  normalizeTransitionKind,
  runSchemaDirectorWithDegradation,
  groundVisualAssets,
  loadSidecarAnchors,
  buildMediaDimsMap,
  exportPublishPack,
  registerVendorClip,
  renderVendorClipIsolated,
  masterVoiceTracks,
  probeVoiceAcousticTelemetry,
  planVideoFromAssets,
  syncProjectCodeFromScript,
  buildRichHtmlVideo,
  syncRemotionPublicAssets,
  writeRemotionProjectFiles,
  WIRE_PROTOCOLS,
  discoverDshClientConfig,
  getSafeLlmConfigSummary,
  saveLlmConfig,
  testLlmConnection,
  fetchAvailableModels,
  callLlmChat,
  authorBatchedRemotionScenes,
  runAiStudioPipeline,
  refineAiScene,
  rollbackAiVersion,
  getAiCodingHistory,
}

/**
 * One-click full production pipeline:
 * 1. Import user sources (images/videos/music/sfx/notes)
 * 2. AI plan storyboard, copy, VFX, camera motion, SFX cues & BGM
 * 3. Synthesize REAL human voice narration per scene (IndexTTS-2) + ffprobe duration backfill
 * 4. Generate HTML5 & Remotion code + lint
 * 5. Multi-track audio mix + full-FPS dual-engine MP4 render + 3x3 snapshot
 */
export async function produceFullVideo(options = {}) {
  const {
    projectDir,
    sources,
    title,
    topic,
    style,
    engine = 'html',
    aspectRatio = 'auto',
    quality = '1080p',
    width,
    height,
    aiBadge = true,
    endNotice,
    endNoticeCredit,
    targetPlatform = 'universal',
    bgmMode = 'auto',
    voiceId = 'auto',
    ttsEngine,
    allowPlaceholder = false,
    fps,
    renderWidth,
    renderHeight,
    scenesSpec,
    workflowSteps,
    brandMark,
    curateAssets = false,
    masterVoice = true,
    useLlmMastering = false,
    onProgress,
  } = options

  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)

  if (curateAssets) {
    onProgress?.('0/5 正在智能筛选与无损分辨率适配素材...')
    if (sources && (Array.isArray(sources) ? sources.length > 0 : true)) {
      await importAssets({ projectDir: absDir, sources })
    }
    await executeCurateAndEditAssets({ projectDir: absDir, style, quality, aspectRatio })
  }

  onProgress?.('1/5 正在导入并分析素材（本地草稿快速生成）...')
  const planned = await planVideoFromAssets({
    projectDir: absDir,
    sources: curateAssets ? undefined : sources,
    title,
    topic,
    style,
    engine,
    aspectRatio,
    quality,
    width,
    height,
    aiBadge,
    endNotice,
    endNoticeCredit,
    voiceId,
    scenesSpec,
    workflowSteps,
    brandMark,
    ...(fps ? { fps: Number(fps) } : {}),
  })

  onProgress?.('2/5 正在启动本地配音引擎并逐幕生成真人配音...')
  let curScript = planned.script
  for (let i = 0; i < (curScript.scenes || []).length; i++) {
    const s = curScript.scenes[i]
    onProgress?.(`2/5 正在配音 (${i + 1}/${curScript.scenes.length}): ${s.title}`)
    await executeGenerateSpeech({
      text: s.narration,
      emotion: s.emotion || '平静',
      voiceId: s.voiceId || voiceId || 'auto',
      engine: ttsEngine || getActiveTtsEngineId(),
      speed: Number(s.speechRate) || 1.0,
      fps: curScript.fps || 30,
      outputPath: join(absDir, 'audio', `${s.id}.wav`),
      scriptPath: absDir,
      sceneId: s.id,
      allowPlaceholder,
    })
  }

  if (masterVoice && !allowPlaceholder) {
    try {
      onProgress?.('2.5/5 正在进行 AI 人声声学探测与广播级修音...')
      await masterVoiceTracks({
        projectDir: absDir,
        useLlm: Boolean(useLlmMastering),
        remixMasterAudio: false,
      })
    } catch {}
  }

  curScript = readScriptJson(absDir).data
  curScript.targetPlatform = targetPlatform || curScript.targetPlatform || 'universal'
  if (bgmMode && bgmMode !== 'auto') {
    curScript.bgmMode = bgmMode
    curScript.audioSpec = { ...(curScript.audioSpec || {}), bgmMode }
  }
  curScript = writeScriptJson(absDir, curScript).data
  onProgress?.('3/5 正在生成双引擎画面工程（商用字体/安全区/动效/字幕）...')
  syncProjectCodeFromScript(absDir, curScript)

  const { executeVideoLint, executeVideoRender } = await import('../dsh-tool-video-suite/index.js')
  const lint = await executeVideoLint({ projectDir: absDir, engine })
  if (!lint.ok) {
    throw new Error(`video_lint failed before render: ${lint.errors.join('; ')}`)
  }

  onProgress?.('4/5 正在混音（人声 + 音效 + 自动闪避配乐）并逐帧渲染 MP4...')
  const rendered = await executeVideoRender({
    projectDir: absDir,
    engine,
    renderWidth,
    renderHeight,
    onProgress: ({ frame, totalFrames, pct }) =>
      onProgress?.(`4/5 正在逐帧合成高清视频 (${frame}/${totalFrames} 帧 · ${pct}%)...`),
  })

  onProgress?.('5/5 制作完成！')
  return {
    ok: true,
    projectDir: absDir,
    engine,
    script: readScriptJson(absDir).data,
    assetsSummary: summarizeAssets(readAssets(absDir)),
    lint,
    render: rendered,
  }
}

export const name = 'dsh-tool-media'
export const inject = ['tools']

export function apply(ctx) {
  registerTool(ctx, {
    name: 'import_assets',
    description:
      'Import user media files or folders (images, videos, background music, sound effects, and text notes) into a video project and measure each file via ffprobe.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of local file or folder paths containing user assets.',
        },
      },
      required: ['projectDir', 'sources'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await importAssets(args)
    },
  })

  registerTool(ctx, {
    name: 'list_assets',
    description: 'List all imported images, videos, music, sound effects, and notes in a video project.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 15_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const m = readAssets(args.projectDir)
      return { ok: true, summary: summarizeAssets(m), ...m }
    },
  })

  registerTool(ctx, {
    name: 'generate_sfx_bgm',
    description:
      'Generate studio-grade sound effects (whoosh, impact, pop, chime, riser) and mood-matched background music WAVs, and mix them with voice narration into master-audio.wav.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        mood: {
          type: 'string',
          enum: ['tech', 'cinematic', 'warm', 'energetic', 'emerald'],
          description: 'Music mood when generating BGM.',
        },
        mixMaster: { type: 'boolean', description: 'If true, mix voice + SFX + BGM into output/master-audio.wav.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const { data: script } = readScriptJson(args.projectDir)
      if (args.mood) {
        script.bgm = { ...(script.bgm || {}), mood: args.mood }
      }
      const assets = readAssets(args.projectDir)
      const audioAssets = await ensureProjectAudioAssets(args.projectDir, script, assets)
      if (args.mixMaster) {
        const mix = await mixVideoAudio({ projectDir: args.projectDir, script, assetsManifest: assets })
        return { ok: true, ...audioAssets, mix }
      }
      return { ok: true, ...audioAssets }
    },
  })

  registerTool(ctx, {
    name: 'plan_video_from_assets',
    description:
      'Analyze imported project assets and user topic/style to generate a complete storyboard (script.json) with copy, camera motion, VFX, SFX cues, BGM, and HTML/Remotion scene code.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Optional paths to import first.' },
        title: { type: 'string', description: 'Video title.' },
        topic: { type: 'string', description: 'Creative brief or topic.' },
        style: {
          type: 'string',
          pattern: '^(auto|tech|cinematic|documentary|energetic|warm|emerald|user:[A-Za-z0-9_-]{1,40})$',
          description: "Visual style: 'auto' = AI 自由匹配 (the AI picks the best of the 6 presets for the topic, or designs a new style when none fits; local drafts pick a preset by keyword rules), one of the presets tech (科技锋芒) / cinematic (电影大片) / documentary (极简纪实) / energetic (活力潮牌) / warm (温暖故事) / emerald (墨翠轻奢), or 'user:<id>' for a saved 我的风格预设. Omit to keep the project's current style (new projects: auto).",
        },
        engine: { type: 'string', enum: ['html', 'remotion'], description: 'Target render engine.' },
        aspectRatio: { type: 'string', enum: ['auto', '16:9', '9:16', '3:4', '1:1', '4:3', 'custom'], description: 'Aspect ratio preset or auto AI selection.' },
        quality: { type: 'string', enum: ['720p', '1080p', '2k', '4k', 'custom'], description: 'Output resolution tier.' },
        width: { type: 'number', description: 'Optional custom width (even integer >= 320).' },
        height: { type: 'number', description: 'Optional custom height (even integer >= 320).' },
        aiBadge: { type: 'boolean', description: 'Whether to show an optional AI badge corner watermark.' },
        endNotice: { type: 'boolean', description: '片尾声明: show a one-line AI-content disclosure during the last ~2 s of the film. Default false (the AI corner badge already labels the film). Omit to keep the project\'s saved choice.' },
        endNoticeCredit: { type: 'boolean', description: '片尾署名: with endNotice on, the line also credits the plugin ("由 DSH Video Workbench (by Merziller) 创作"). Default false; only on when the user asks for it.' },
        fps: { type: 'number', description: 'Target frame rate (e.g. 30 or 60).' },
        voiceId: { type: 'string', description: 'Voice ID or "auto" for AI voice matching.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await planVideoFromAssets(args)
    },
  })

  registerTool(ctx, {
    name: 'produce_video',
    description:
      'Local Draft one-click production: import assets -> storyboard -> local IndexTTS-2 narration -> HTML/Remotion code -> SFX/BGM ducked mix -> MP4.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Optional local media folders or files to import.' },
        title: { type: 'string', description: 'Video title.' },
        topic: { type: 'string', description: 'Topic / prompt.' },
        style: { type: 'string', pattern: '^(auto|tech|cinematic|documentary|energetic|warm|emerald|user:[A-Za-z0-9_-]{1,40})$', description: "Visual style: 'auto' = AI 自由匹配 (the AI picks the best of the 6 presets for the topic, or designs a new style when none fits; local drafts pick a preset by keyword rules), one of the presets tech (科技锋芒) / cinematic (电影大片) / documentary (极简纪实) / energetic (活力潮牌) / warm (温暖故事) / emerald (墨翠轻奢), or 'user:<id>' for a saved 我的风格预设. Omit to keep the project's current style (new projects: auto)." },
        engine: { type: 'string', enum: ['html', 'remotion'] },
        aspectRatio: { type: 'string', enum: ['auto', '16:9', '9:16', '3:4', '1:1', '4:3', 'custom'] },
        quality: { type: 'string', enum: ['720p', '1080p', '2k', '4k', 'custom'] },
        width: { type: 'number', description: 'Optional custom width.' },
        height: { type: 'number', description: 'Optional custom height.' },
        aiBadge: { type: 'boolean', description: 'Optional corner AI badge.' },
        endNotice: { type: 'boolean', description: '片尾声明: one-line AI-content disclosure at the end of the film. Default false.' },
        endNoticeCredit: { type: 'boolean', description: '片尾署名: with endNotice on, also credit the plugin in that line. Default false; only when the user asks.' },
        fps: { type: 'number', description: 'Target frame rate (e.g. 30 or 60).' },
        voiceId: { type: 'string', description: 'Voice ID or "auto".' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await produceFullVideo(args)
    },
  })

  registerTool(ctx, {
    name: 'get_llm_config',
    description:
      'Inspect the LLM the plugin uses: mode (auto = follow the host agent / follow-dsh / custom), the detected host agent, where the model came from (DSH channel, the host agent\'s environment API key such as ANTHROPIC_API_KEY / OPENAI_API_KEY, or custom fields), masked key status, baseUrl, model and protocol.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute() {
      return getSafeLlmConfigSummary()
    },
  })

  registerTool(ctx, {
    name: 'configure_llm_model',
    description:
      'Configure the LLM the plugin uses. Default `mode: "auto"` follows the agent hosting the plugin: inside DeepSeek Harness the active DSH channel; inside Claude Code / Codex / opencode / OpenClaw / Hermes / pi / WorkBuddy / Antigravity / Cursor … the model API key found in that agent\'s environment (ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, with *_BASE_URL / *_MODEL); agent logins / subscriptions are never reused. `mode: "follow-dsh"` pins a DSH channel; `mode: "custom"` uses your own endpoint across all 4 wire protocols (`openai-completions`, `anthropic-messages`, `openai-responses`, `gemini-native`). `mode: "host-agent"` (宿主智能体代写) is for agents used through a subscription without an API key (e.g. Codex / Claude Code signed in with a plan): the plugin queues every writing job and YOU answer it with your own model through the `host_llm_task` tool — keep serving `host_llm_task` while a pipeline or studio action runs.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['auto', 'follow-dsh', 'custom', 'host-agent'],
          description: 'auto (default) follows the host agent (DSH channel inside DSH, the agent environment API key elsewhere); follow-dsh pins a DSH channel; custom uses the plugin fields below; host-agent = the calling agent writes the answers itself via host_llm_task (no API key; for subscription users).',
        },
        dshProviderId: { type: 'string', description: 'Optional specific DSH provider ID from cordis.patch.yml (or "active" to track DSH active selection).' },
        provider: { type: 'string', description: 'Preset template ID (custom, anthropic, openai, gemini, deepseek, openrouter, ollama).' },
        format: {
          type: 'string',
          enum: ['auto', 'openai-completions', 'anthropic-messages', 'openai-responses', 'gemini-native', 'openai', 'anthropic'],
          description: 'API wire protocol format.',
        },
        baseUrl: { type: 'string', description: 'LLM API Base URL.' },
        apiKey: { type: 'string', description: 'API Key (never logged or returned).' },
        model: { type: 'string', description: 'Target model ID string (e.g. claude-opus-5-5, gpt-6.1-sol, gemini-2.5-pro).' },
        maxRepairRounds: { type: 'number', description: 'Max compiler/lint self-repair attempts (1-5).' },
        runTest: { type: 'boolean', description: 'If true, also test endpoint connectivity.' },
        visionSupport: {
          type: 'string',
          enum: ['auto', 'yes', 'no'],
          description: '看图能力 for reference analysis / visual self-review / screenshot grounding: auto (default — the model is checked once with a tiny probe picture and the verdict is remembered), yes (the model can see pictures: never skip), no (never send pictures).',
        },
        visionModel: { type: 'string', description: 'Optional dedicated vision model ID used for pictures (on the text model\'s endpoint unless visionBaseUrl is set). Empty string clears it.' },
        visionBaseUrl: { type: 'string', description: 'Optional own endpoint for the dedicated vision model.' },
        visionApiKey: { type: 'string', description: 'API key for the dedicated vision endpoint (never logged or returned).' },
        visionFormat: { type: 'string', enum: ['auto', 'openai-completions', 'anthropic-messages', 'openai-responses', 'gemini-native'], description: 'Wire protocol of the dedicated vision endpoint.' },
        checkVision: { type: 'boolean', description: 'If true, show the vision model a tiny probe picture and report whether it can see (result.visionCheck, plain-Chinese reason and fix).' },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // a connection test / vision check waits as long as any model call
    timeoutMs: getLlmTimeoutMs() * 2 + 60_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const MAIN_KEYS = ['mode', 'dshProviderId', 'provider', 'format', 'baseUrl', 'apiKey', 'model', 'maxRepairRounds']
      let saved = MAIN_KEYS.some((k) => args[k] !== undefined) ? saveLlmConfig(args) : getSafeLlmConfigSummary()
      const visionPatch = {}
      if (args.visionSupport !== undefined) visionPatch.support = args.visionSupport
      if (args.visionModel !== undefined) visionPatch.model = args.visionModel
      if (args.visionBaseUrl !== undefined) visionPatch.baseUrl = args.visionBaseUrl
      if (args.visionApiKey !== undefined) visionPatch.apiKey = args.visionApiKey
      if (args.visionFormat !== undefined) visionPatch.format = args.visionFormat
      if (Object.keys(visionPatch).length) saved = saveVisionSettings(visionPatch)
      const out = { ...saved }
      if (args.runTest) out.test = await testLlmConnection(args)
      if (args.checkVision) {
        const c = await checkVisionCapability({})
        out.visionCheck = { ok: Boolean(c.ok), code: c.code, short: c.short, reason: c.reason, fix: c.fix, detail: c.detail || '', answer: c.answer || '', model: c.model, protocol: c.protocol, latencyMs: c.latencyMs || 0 }
        out.vision = getSafeLlmConfigSummary().vision
      }
      return out
    },
  })

  registerTool(ctx, {
    name: 'ai_master_voice',
    description:
      'Probe acoustic telemetry (LUFS loudness, true peak, crest, silence) on post-TTS scene vocals and use the configured AI LLM (or adaptive studio fallback) + FFmpeg DSP to master every voice track into `audio/mastered/<scene>.wav` and re-mix `output/master-audio.wav`.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sceneIds: { type: 'array', items: { type: 'string' }, description: 'Optional subset of scene IDs to master (defaults to all scenes with WAVs).' },
        useLlm: { type: 'boolean', description: 'Consult configured AI LLM for acoustic mastering EQ/compression/reverb specs (default true).' },
        remixMasterAudio: { type: 'boolean', description: 'Re-mix mastered vocals + SFX + ducked BGM into output/master-audio.wav (default true).' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // the AI mastering advice is one model call (shared limit) + the FFmpeg passes
    timeoutMs: getLlmTimeoutMs() + 300_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const work = async () => {
        const report = await masterVoiceTracks({
          projectDir: args.projectDir,
          sceneIds: args.sceneIds,
          useLlm: args.useLlm !== false,
        })
        if (args.remixMasterAudio !== false) {
          const assets = readAssets(args.projectDir)
          await mixVideoAudio({ projectDir: args.projectDir, script: report.script, assetsManifest: assets })
          syncRemotionPublicAssets(args.projectDir, report.script)
        }
        return report
      }
      return args.useLlm === false ? await work() : await runWritingTool('ai_master_voice', work)
    },
  })

  registerTool(ctx, {
    name: 'ai_create_video',
    description:
      'Use the configured LLM coding model + local IndexTTS-2.5 voices + AI post-TTS voice mastering to author bespoke Remotion TSX or HTML5 motion-engine code, custom DSP BGM/SFX, run TypeScript & lint auto-repair (up to 3 rounds), and render + QA the final MP4.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Optional local asset folders or files.' },
        topic: { type: 'string', description: 'Creative brief or video topic.' },
        userPrompt: { type: 'string', description: 'Detailed visual, pacing, or aesthetic instructions for the AI director/coder.' },
        engine: { type: 'string', enum: ['remotion', 'html'], description: 'Output engine (remotion strongly recommended for AI coding).' },
        creationMode: { type: 'string', enum: ['ai-coded', 'schema-plan'], description: 'ai-coded for max creative ceiling or schema-plan for 4-tier degradation reliability.' },
        bgmMode: { type: 'string', enum: ['llm-coded', 'uploaded', 'tts-engine'], description: 'BGM synthesis mode: llm-coded (LLM writes JS DSP synth code), uploaded (user track), or tts-engine (IndexTTS-2.5 atmospheric).' },
        bgmStartFrom: { type: 'string', enum: ['auto', 'head'], description: "配乐从精彩处开始 for an uploaded song: 'auto' (default) starts a song clearly longer than the film at a well-chosen bar line (skips a long intro, the climax lands about 2/3 into the film); 'head' always plays it from the start. Used with bgmMode 'uploaded' and saved as script.bgm.startFrom; omit to keep the project's choice." },
        narrationMode: { type: 'string', enum: ['tts', 'tts-beat-sync', 'subtitle-mv'], description: 'Narration rhythm mode: tts (standard spoken narration), tts-beat-sync (spoken TTS + cut snapped to BGM downbeats), or subtitle-mv (pure beat-locked music/animation with bold subtitles & SFX, no voiceover).' },
        targetDurationSec: { type: 'number', description: 'Optional target total duration in seconds when generating a beat-synced MV.' },
        targetPlatform: { type: 'string', enum: ['universal', 'douyin', 'kuaishou', 'xiaohongshu', 'bilibili'], description: 'Target publishing platform safe zone preset.' },
        aspectRatio: { type: 'string', enum: ['auto', '16:9', '9:16', '3:4', '1:1', '4:3', 'custom'], description: 'auto lets AI select from topic/assets; or specify exact ratio.' },
        style: { type: 'string', pattern: '^(auto|tech|cinematic|documentary|energetic|warm|emerald|user:[A-Za-z0-9_-]{1,40})$', description: "Visual style: 'auto' = AI 自由匹配 (the AI picks the best of the 6 presets for the topic, or designs a new style when none fits; local drafts pick a preset by keyword rules), one of the presets tech (科技锋芒) / cinematic (电影大片) / documentary (极简纪实) / energetic (活力潮牌) / warm (温暖故事) / emerald (墨翠轻奢), or 'user:<id>' for a saved 我的风格预设. Omit to keep the project's current style (new projects: auto)." },
        quality: { type: 'string', enum: ['720p', '1080p', '2k', '4k', 'custom'], description: 'Output quality preset.' },
        width: { type: 'number', description: 'Custom pixel width.' },
        height: { type: 'number', description: 'Custom pixel height.' },
        voiceId: { type: 'string', description: 'Voice ID or "auto".' },
        aiBadge: { type: 'boolean', description: 'Show optional AI corner attribution badge.' },
        aiBadgeEnabled: { type: 'boolean', description: 'Explicit toggle to enable/disable AI attribution corner badge.' },
        aiBadgePosition: { type: 'string', enum: ['top-right', 'top-left', 'bottom-right', 'bottom-left'], description: 'Corner placement for the AI attribution badge.' },
        aiBadgeText: { type: 'string', description: 'Custom text inside the AI attribution badge.' },
        endNotice: { type: 'boolean', description: '片尾声明: show a one-line AI-content disclosure during the last ~2 s of the film. Default false (the AI corner badge already labels the film). Omit to keep the project\'s saved choice.' },
        endNoticeCredit: { type: 'boolean', description: '片尾署名: with endNotice on, the line also credits the plugin ("由 DSH Video Workbench (by Merziller) 创作"). Default false; only on when the user asks for it.' },
        pacingMode: { type: 'string', enum: ['auto', 'calm', 'balanced', 'dynamic'], description: 'Narrative pacing preset: auto (smart topic fit), calm, balanced, or dynamic.' },
        useDraftReference: { type: 'boolean', description: 'Read existing local draft script/WAVs as pacing baseline.' },
        narrationCheck: { type: 'boolean', description: '配音回听校验: true (default) = after TTS the local speech recognition (when installed) listens to every new take, re-dubs a take that skipped / repeated words or misread a number once, and reports what still fails (output/narration-check.json, QA hint; never fails the run). false = off (also DSH_NARRATION_CHECK=0).' },
        render: { type: 'boolean', description: 'Whether to immediately render MP4 and run FFmpeg QA.' },
        figureStyle: { type: 'string', enum: ['auto', 'silhouette', 'papercut', 'puppet', 'ink', 'flat', 'stick', 'custom'], description: "人物画风 for people and animals in the film: 'auto' (default) lets the AI choose per film (history films default to silhouette); silhouette / papercut / puppet / ink / flat / stick use the built-in side-view figure library in that look; 'custom' makes the AI design its own characters in the look named by figureStyleNote (e.g. Q版萌系, 日系动漫, 绘本手绘). Beats style words in the brief. Omit to keep the project's saved choice." },
        figureStyleNote: { type: 'string', maxLength: 40, description: "With figureStyle 'custom': the character look in a few words (e.g. Q版萌系，圆脸大眼)." },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // a whole film: several model calls of up to getLlmTimeoutMs() each (planning, coding batches, repairs, 画面自检)
    // plus rendering — the old 600 s tool limit cut runs off while a single model call was still allowed 10 minutes
    timeoutMs: Math.max(3_600_000, getLlmTimeoutMs() * 6),
    isConcurrencySafe: () => false,
    async execute(args) {
      return await runWritingTool('ai_create_video', () => runAiStudioPipeline(args))
    },
  })

  registerTool(ctx, {
    name: 'ai_refine_scene',
    description:
      'Apply a natural-language modification request to an AI-coded scene or rollback to the previous snapshot. 指哪改哪: optional timeRange {startSec,endSec} (final timeline) and/or region {x,y,w,h} (normalised 0-1) confine the change to the affected scenes\' local frame window and screen area; only the affected batch/scene files may change. Locked scenes are refused/skipped. Snapshots before/after and returns the version diff.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sceneId: { type: 'string', description: 'Target scene ID (or omit for global polish).' },
        sceneIds: { type: 'array', items: { type: 'string' }, description: 'Optional multiple target scene IDs.' },
        instruction: { type: 'string', description: 'Natural language editing request.' },
        timeRange: {
          type: 'object',
          description: 'Optional global time range on the final timeline (seconds); mapped to affected scenes and their local frame ranges.',
          properties: { startSec: { type: 'number' }, endSec: { type: 'number' } },
          required: ['startSec', 'endSec'],
          additionalProperties: false,
        },
        region: {
          type: 'object',
          description: 'Optional normalised screen region (0-1): only elements inside it may change.',
          properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          required: ['x', 'y', 'w', 'h'],
          additionalProperties: false,
        },
        rollback: { type: 'boolean', description: 'If true, restore the previous saved snapshot instead of editing.' },
        dryRun: { type: 'boolean', description: 'Only map timeRange/region to affected scenes, local frame ranges and editable files (no LLM call, no changes).' },
        render: { type: 'boolean', description: 'Re-render MP4 after passing code validation.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // the refine call + up to a few repair calls (each up to getLlmTimeoutMs()) + re-rendering
    timeoutMs: Math.max(3_600_000, getLlmTimeoutMs() * 4 + 900_000),
    isConcurrencySafe: () => false,
    async execute(args) {
      if (args.rollback) return rollbackAiVersion(args.projectDir)
      // dryRun is handled inside refineAiScene (mapping preview only: no LLM call, nothing written)
      return await runWritingTool('ai_refine_scene', () => refineAiScene(args))
    },
  })

  registerTool(ctx, {
    name: 'manage_project_history',
    description:
      'Project version history (content-addressed snapshots of script.json, assets.json, characters.json and src/**; large media only referenced by path + size + mtime). Actions: list versions, diff two versions (changed scenes + fields, changed files; toVersionId defaults to the working tree), restore a version (takes a "before restore" snapshot first), snapshot (manual), prune to DSH_HISTORY_MAX (default 50) with garbage collection of unreferenced objects.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'diff', 'restore', 'snapshot', 'prune'], description: 'History operation.' },
        projectDir: { type: 'string', description: 'Video project directory.' },
        versionId: { type: 'string', description: 'Version to restore (restore) or the "from" version (diff).' },
        fromVersionId: { type: 'string', description: 'Diff: older version id.' },
        toVersionId: { type: 'string', description: 'Diff: newer version id, or "current" for the working tree (default).' },
        label: { type: 'string', description: 'Snapshot label (snapshot).' },
        limit: { type: 'number', description: 'Max versions to list (default 100).' },
        max: { type: 'number', description: 'Retention cap for prune (default DSH_HISTORY_MAX or 50).' },
      },
      required: ['action', 'projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const absDir = resolve(args.projectDir)
      if (args.action === 'diff') return diffProjectVersions(absDir, args.fromVersionId || args.versionId, args.toVersionId || 'current')
      if (args.action === 'restore') {
        if (!args.versionId) throw new Error('restore 需要 versionId')
        const { script, ...res } = restoreAiProjectVersion(absDir, args.versionId)
        return { ...res, sceneCount: Array.isArray(script?.scenes) ? script.scenes.length : 0 }
      }
      if (args.action === 'snapshot') {
        return { ok: true, version: createProjectSnapshot(absDir, { label: args.label || 'manual', stage: 'manual', author: 'user', kind: 'manual' }) }
      }
      if (args.action === 'prune') return pruneProjectHistory(absDir, { max: args.max })
      return listProjectVersions(absDir, { limit: args.limit })
    },
  })

  registerTool(ctx, {
    name: 'manage_scene_edits',
    description:
      'Human edit protection. lock/unlock scenes (locked scenes keep content + timing in director re-plans, are never re-coded by the batched TSX coder, are refused/skipped by refine, and keep their sfxCues in the audio stage); set_override / clear_override store UI edits as script.userOverrides[sceneId] = { field: value } (dotted paths allowed, sceneId "__project__" for project fields) that are re-applied after every AI regeneration via three-way merge (user wins, conflicts reported); list shows locks, overrides and the last merge report.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'lock', 'unlock', 'set_override', 'clear_override'], description: 'Operation.' },
        projectDir: { type: 'string', description: 'Video project directory.' },
        sceneId: { type: 'string', description: 'Target scene ID ("__project__" for project-level overrides).' },
        sceneIds: { type: 'array', items: { type: 'string' }, description: 'Multiple scene IDs (lock / unlock).' },
        overrides: { type: 'object', additionalProperties: true, description: 'Field → value map, e.g. { "title": "...", "subtitleText": "...", "durationSec": 4.5, "transition": "light-wipe" }. An empty "subtitleText" drops that override: the scene subtitles follow the narration again.' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Fields to clear (clear_override); omit to clear all overrides of the scene.' },
        reason: { type: 'string', description: 'Optional lock reason.' },
      },
      required: ['action', 'projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (args.action === 'lock' || args.action === 'unlock') {
        return setSceneLock({ projectDir: args.projectDir, sceneId: args.sceneId, sceneIds: args.sceneIds || [], locked: args.action === 'lock', reason: args.reason || '' })
      }
      if (args.action === 'set_override') {
        return setSceneOverrides({ projectDir: args.projectDir, sceneId: args.sceneId, overrides: args.overrides || {} })
      }
      if (args.action === 'clear_override') {
        const fields = Array.isArray(args.fields) ? args.fields : []
        return setSceneOverrides({ projectDir: args.projectDir, sceneId: args.sceneId, clearFields: fields, clearAll: fields.length === 0 })
      }
      return listSceneEdits(args.projectDir)
    },
  })

  registerTool(ctx, {
    name: 'manage_characters',
    description:
      'Character consistency bank (per-project characters.json + optional global library under .dsh-home): list / save / delete / attach. A character has name, aliases, description and reference images (face, fullBody, expressions, turnaround) stored as asset paths. attach adds reference images (imported via the asset import path), binds the character to scenes, or copies a global character into the project. Cloud image/video prompts mentioning @角色名 or @别名 then carry the reference images (Seedream 4+, Kling image, Flux, Seedance i2v, MiniMax S2V, custom HTTP templates) or the textual description.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'save', 'delete', 'attach'], description: 'Operation.' },
        projectDir: { type: 'string', description: 'Video project directory (required for project scope / attach).' },
        scope: { type: 'string', enum: ['project', 'global', 'all'], description: 'Bank scope (default project; list defaults to all).' },
        character: { type: 'object', additionalProperties: true, description: '{ id?, name, aliases[], description, references: { face[], fullBody[], expressions[], turnaround[] } } (save).' },
        characterId: { type: 'string', description: 'Character ID (delete / attach).' },
        name: { type: 'string', description: 'Character name or alias (delete / attach).' },
        referenceType: { type: 'string', enum: ['face', 'fullBody', 'expressions', 'turnaround'], description: 'Reference slot for attach paths (default face).' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Reference image paths to attach (project-relative or absolute).' },
        sceneIds: { type: 'array', items: { type: 'string' }, description: 'Scenes to bind the character to (attach).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const scope = args.scope || (args.action === 'list' ? 'all' : 'project')
      if (args.action === 'save') return await saveCharacter({ projectDir: args.projectDir || '', scope, character: args.character || {} })
      if (args.action === 'delete') return deleteCharacter({ projectDir: args.projectDir || '', scope, characterId: args.characterId || '', name: args.name || '' })
      if (args.action === 'attach') {
        return await attachCharacter({
          projectDir: args.projectDir,
          characterId: args.characterId || '',
          name: args.name || '',
          referenceType: args.referenceType || 'face',
          paths: args.paths || [],
          sceneIds: args.sceneIds || [],
        })
      }
      return listCharacters({ projectDir: args.projectDir || '', scope })
    },
  })

  registerTool(ctx, {
    name: 'search_stock_media',
    description:
      'Search royalty-free stock photos / videos through the OFFICIAL Pexels API (api.pexels.com/v1/search, /videos/search) and Pixabay API (pixabay.com/api/, /api/videos/). Keys: the ones saved in the Studio (版本历史与工程安全 → 免费素材, or 设置 → 云端生成) take precedence, else PEXELS_API_KEY / PIXABAY_API_KEY in .env; both keys are free. Filters: orientation, minimum resolution, min/max duration. Returns normalised results (thumb, preview, size, duration, author, source page, license). Responses are cached for 24h and provider rate limits are respected. Without keys returns status "未配置" (the message points to the Studio form).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords (Chinese supported via locale zh-CN / lang zh).' },
        mediaType: { type: 'string', enum: ['image', 'video'], description: 'Photos or videos (default image).' },
        provider: { type: 'string', enum: ['auto', 'pexels', 'pixabay', 'all'], description: 'auto = first configured provider (falls back on error / no hits).' },
        orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Orientation filter.' },
        minWidth: { type: 'number', description: 'Minimum width in pixels.' },
        minHeight: { type: 'number', description: 'Minimum height in pixels.' },
        minDurationSec: { type: 'number', description: 'Minimum video duration (seconds).' },
        maxDurationSec: { type: 'number', description: 'Maximum video duration (seconds).' },
        page: { type: 'number', description: 'Page number (default 1).' },
        perPage: { type: 'number', description: 'Results per page (default 15, max 80).' },
        locale: { type: 'string', description: 'Search locale (default zh-CN).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 60_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      return await searchStockMedia(args)
    },
  })

  registerTool(ctx, {
    name: 'import_stock_media',
    description:
      'Download a chosen Pexels / Pixabay item (a normalised search_stock_media result, or provider + mediaType + id) from the provider\'s official CDN into the project via the regular asset import path, keeping attribution metadata (author, source page, license) in assets.json; optionally bind it to a scene.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        item: { type: 'object', additionalProperties: true, description: 'A result object returned by search_stock_media.' },
        provider: { type: 'string', enum: ['pexels', 'pixabay'], description: 'Provider (when item is omitted).' },
        mediaType: { type: 'string', enum: ['image', 'video'], description: 'Media type (when item is omitted).' },
        id: { type: 'string', description: 'Provider item ID (when item is omitted).' },
        sceneId: { type: 'string', description: 'Optional scene to bind the imported media to.' },
        query: { type: 'string', description: 'Optional original search query (stored with the attribution).' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 300_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await importStockMedia(args)
    },
  })

  registerTool(ctx, {
    name: 'manage_cloud_jobs',
    description:
      'Cloud cost protection: list the paid-job ledger (<project>/output/cloud-jobs.json — provider, category, params hash, status, provider task id, result paths; retries with identical params resume / reuse instead of paying twice), or preview the auto B-roll sourcing plan (user assets → free stock → paid generation, honouring DSH_CLOUD_MAX_PAID_JOBS_PER_RUN).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'sourcing_plan'], description: 'Operation (default list).' },
        projectDir: { type: 'string', description: 'Video project directory.' },
        status: { type: 'string', description: 'Optional ledger status filter (submitting, submitted, result_ready, completed, failed, billing_failed, interrupted).' },
        limit: { type: 'number', description: 'Max jobs to return (default 100).' },
        mediaType: { type: 'string', enum: ['image', 'video'], description: 'Sourcing plan B-roll media type (default image).' },
        maxPaidJobsPerRun: { type: 'number', description: 'Sourcing plan: override the per-run paid cap for the preview.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 30_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.action === 'sourcing_plan') {
        return resolveMediaSourcingPlan({ projectDir: args.projectDir, autoUseCloudBroll: true, mediaType: args.mediaType || 'image', maxPaidJobsPerRun: args.maxPaidJobsPerRun })
      }
      return listCloudJobs(args.projectDir, { status: args.status || '', limit: args.limit })
    },
  })

  registerTool(ctx, {
    name: 'video_qa',
    description: 'Run FFmpeg automated post-render quality check (blackdetect + EBU R128 loudness + stream/duration match, plus photosensitive flash risk (WCAG ≤3 flashes/s), frozen frames vs planned holds, unplanned jump cuts / glitch frames, and held pictures: how long the film shows the same picture — beat films (subtitle MV / beat-synced / dynamic or 高燃 pacing) FAIL when more than 30% of the film, or any single stretch over 6 s, is one picture) on an MP4. The result starts with `headline` and `failures` (plain Chinese, with time ranges and scene ids — show them to the user as they are); `heldPictures.holds` lists every held stretch. deep=true also renders sample frames twice to verify pixel determinism (slower). Never re-run generation automatically because of a failed check: tell the user which scenes to change and let them decide.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        mp4Path: { type: 'string', description: 'Optional MP4 file path (defaults to output/final.mp4).' },
        deep: { type: 'boolean', description: 'Deep mode: re-render sample frames twice (Remotion renderStill / HTML capture) and compare pixel hashes. Default false (fast path).' },
        freezeThresholdSec: { type: 'number', description: 'Report frozen frames longer than this many seconds that the shot list does not plan (default 2.5).' },
        filmRhythm: { type: 'string', enum: ['auto', 'beat', 'narration'], description: 'How held pictures are judged: beat = cut-to-the-beat film (long holds fail), narration = narrated/other film (only extreme holds are hinted). Default auto (read from script.json narrationMode / pacingMode / topic).' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 300_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const { runPostRenderQa } = await import('../dsh-tool-video-suite/index.js')
      const script = readScriptJson(args.projectDir).data
      return await runPostRenderQa({
        projectDir: args.projectDir,
        mp4Path: args.mp4Path,
        script,
        deep: Boolean(args.deep),
        freezeThresholdSec: args.freezeThresholdSec,
        filmRhythm: args.filmRhythm === 'beat' || args.filmRhythm === 'narration' ? args.filmRhythm : undefined,
      })
    },
  })

  registerTool(ctx, {
    name: 'export_publish_pack',
    description:
      'Export a ready-to-publish platform bundle (MP4, cover.png, 3x3 grid, QA report, and meta.md titles/tags/AI compliance statement). cover.png is the cover chosen in the Studio (发布包导出 → 封面): by default the best automatic frame of the film (no black / fade / transition / blurry frame), or a picked video frame, an AI-generated cover or one with the title added. The result reports `cover: { mode, source, timeSec, aspect }`.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        platform: { type: 'string', enum: ['universal', 'douyin', 'kuaishou', 'xiaohongshu', 'bilibili'], description: 'Target platform preset.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 60_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      return await exportPublishPack(args)
    },
  })

  registerTool(ctx, {
    name: 'import_vendor_motion',
    description: 'Render an external third-party HTML/.motion directory in isolated headless Chromium, strip audio (-an), and import as a project video asset.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sourceDir: { type: 'string', description: 'External .motion template folder path.' },
        name: { type: 'string', description: 'Short bundle name.' },
        durationSec: { type: 'number', description: 'Clip duration seconds (default 4).' },
      },
      required: ['projectDir', 'sourceDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await renderVendorClipIsolated(args)
    },
  })

  registerTool(ctx, {
    name: 'curate_and_edit_assets',
    description:
      'Use FFmpeg to smart-crop, color-grade, speed-scale, trim, and optionally chroma-key matte Step 1 imported images and video clips into assets/edited/, updating script.json references.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        aspectRatio: { type: 'string', description: 'Target aspect ratio (auto, 16:9, 9:16, 3:4 小红书, 1:1, 4:3).' },
        quality: { type: 'string', description: 'Quality preset (720p, 1080p, 2k, 4k).' },
        style: { type: 'string', description: "Color grading style preset (tech, cinematic, documentary, energetic, warm, emerald); 'auto' / 'user:<id>' or omitted = the project's base preset." },
        trimSeconds: { type: 'number', description: 'Optional max duration cap per video clip in seconds.' },
        clipSpeed: { type: 'number', description: 'Optional video playback speed multiplier (0.5 to 2.5).' },
        chromaKeyColor: { type: 'string', description: 'Optional hex color (e.g. #00FF00) for green-screen alpha matting to yuva420p WebM.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await executeCurateAndEditAssets(args)
    },
  })

  registerTool(ctx, {
    name: 'run_agent_pipeline',
    description:
      'Launch the coordinated 4-Agent Video Production Pipeline (策划导演 Agent -> 素材剪辑 Agent -> 配音混音 Agent [+ Digital Human] -> 动效质检 Agent & MP4 render), tracked via Task Center with Pause/Stop/Retry controls.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        topic: { type: 'string', description: 'Video creative theme or brief.' },
        mode: { type: 'string', enum: ['ai-coded', 'fast-draft'], description: 'Pipeline mode: ai-coded or fast-draft.' },
        engine: { type: 'string', enum: ['html', 'remotion'], description: 'Target rendering engine.' },
        aspectRatio: { type: 'string', description: '16:9, 9:16, 3:4 (小红书), 1:1, 4:3, or auto.' },
        style: { type: 'string', pattern: '^(auto|tech|cinematic|documentary|energetic|warm|emerald|user:[A-Za-z0-9_-]{1,40})$', description: "Visual style: 'auto' = AI 自由匹配 (the AI picks the best of the 6 presets for the topic, or designs a new style when none fits; local drafts pick a preset by keyword rules), one of the presets tech (科技锋芒) / cinematic (电影大片) / documentary (极简纪实) / energetic (活力潮牌) / warm (温暖故事) / emerald (墨翠轻奢), or 'user:<id>' for a saved 我的风格预设. Omit to keep the project's current style (new projects: auto)." },
        quality: { type: 'string', description: '720p, 1080p, 2k, 4k.' },
        bgmMode: { type: 'string', enum: ['uploaded', 'llm-coded', 'tts-engine'], description: 'BGM source mode.' },
        bgmStartFrom: { type: 'string', enum: ['auto', 'head'], description: "配乐从精彩处开始 for an uploaded song: 'auto' (default) starts a song clearly longer than the film at a well-chosen bar line (skips a long intro, the climax lands about 2/3 into the film); 'head' always plays it from the start. Used with bgmMode 'uploaded' and saved as script.bgm.startFrom; omit to keep the project's choice." },
        narrationMode: { type: 'string', enum: ['tts', 'tts-beat-sync', 'subtitle-mv'], description: 'Voice vs beat-locked subtitle MV mode.' },
        aiAuthorCode: { type: 'boolean', description: 'When true (default in ai-coded mode), LLM authors per-scene bespoke Remotion TSX batch files with tsc verification.' },
        durationMode: { type: 'string', enum: ['auto', 'custom'], description: 'Duration mode: auto (AI free matching) or custom (strictly target targetDurationSec).' },
        targetDurationSec: { type: 'number', description: 'Optional target video duration in seconds (15..600).' },
        avatarEnabled: { type: 'boolean', description: 'Include transparent digital human presenter overlay.' },
        avatarMode: { type: 'string', enum: ['ai-human', 'cloned-human'], description: 'Avatar generation mode.' },
        avatarLayout: { type: 'string', enum: ['pip-br', 'pip-bl', 'fullscreen'], description: 'Avatar compositing layout.' },
        background: { type: 'boolean', description: 'If true, start asynchronously and return Task Center runId immediately.' },
        autoUseCloudBroll: { type: 'boolean', description: 'Auto B-roll for scenes without media: user assets → free stock (Pexels/Pixabay keys) → paid generation (only if maxPaidJobsPerRun / DSH_CLOUD_MAX_PAID_JOBS_PER_RUN > 0). Defaults to the cloud-media config flag.' },
        maxPaidJobsPerRun: { type: 'number', description: 'Explicit per-run cap of NEW paid cloud generations (overrides DSH_CLOUD_MAX_PAID_JOBS_PER_RUN, default 0 = auto paid generation off).' },
        brollMediaType: { type: 'string', enum: ['image', 'video'], description: 'Preferred auto B-roll media type (default image).' },
        figureStyle: { type: 'string', enum: ['auto', 'silhouette', 'papercut', 'puppet', 'ink', 'flat', 'stick', 'custom'], description: "人物画风 for people and animals in the film: 'auto' (default) lets the AI choose per film (history films default to silhouette); silhouette / papercut / puppet / ink / flat / stick use the built-in side-view figure library in that look; 'custom' makes the AI design its own characters in the look named by figureStyleNote (e.g. Q版萌系, 日系动漫, 绘本手绘). Beats style words in the brief. Omit to keep the project's saved choice." },
        figureStyleNote: { type: 'string', maxLength: 40, description: "With figureStyle 'custom': the character look in a few words (e.g. Q版萌系，圆脸大眼)." },
        productionType: { type: 'string', enum: ['ai-film', 'talk-edit'], description: "作品类型: 'ai-film' (default) = the AI writes, voices and animates the film; 'talk-edit' = 口播剪辑 of the user's own talking-head recording in the project (the 真人出镜 video, else the longest video with sound): local speech recognition, automatic rough cut (long pauses, fillers, stutters, retakes — the last take stays), real captions from what was said, the person's own voice, light music. Fully local, no LLM, needs the local speech engine (speech_engine install)." },
        talkSource: { type: 'string', description: "talk-edit: the recording to edit (asset id or project-relative path); default the 真人出镜 video." },
        endNotice: { type: 'boolean', description: '片尾声明: one-line AI-content disclosure during the last ~2 s of the film. Default false. Omit to keep the project\'s saved choice.' },
        endNoticeCredit: { type: 'boolean', description: '片尾署名: with endNotice on, the line also credits the plugin. Default false; only when the user asks.' },
        useDraftReference: { type: 'boolean', description: "出片时参考现有草稿: true (default) = the project's existing storyboard (local draft included) is the pacing reference for the AI director; false = plan from scratch." },
        narrationCheck: { type: 'boolean', description: '配音回听校验: true (default) = after TTS the local speech recognition (when installed) listens to every new take, re-dubs a take that skipped / repeated words or misread a number once, and warns about what still fails (output/narration-check.json, QA hint; never fails the run). false = off (also DSH_NARRATION_CHECK=0).' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // without `background`, the whole run happens inside this call: several model calls of up to getLlmTimeoutMs() each
    timeoutMs: Math.max(3_600_000, getLlmTimeoutMs() * 6),
    isConcurrencySafe: () => false,
    async execute(args) {
      // 视觉风格: resolve 'auto' / 'user:<id>' against the project and persist it; the pipeline itself works with the base preset
      const spec = { ...args }
      if (spec.projectDir && spec.productionType !== 'talk-edit') spec.style = prepareProjectStyleForRun({ projectDir: spec.projectDir, style: spec.style, text: spec.topic || '' }).style
      if (spec.background) return await startPipelineBackground(spec)
      // talk-edit and fast drafts never call a model; AI films may wait for 宿主智能体代写 answers
      if (spec.productionType === 'talk-edit' || spec.mode === 'fast-draft') return await runMultiAgentPipeline(spec)
      return await runWritingTool('run_agent_pipeline', () => runMultiAgentPipeline(spec))
    },
  })

  registerTool(ctx, {
    name: 'speech_engine',
    description:
      'Local speech recognition engine (SenseVoice-Small int8 via sherpa-onnx, free and offline after a one-time ~260 MB download; Mandarin, Cantonese, English, Japanese, Korean). '
      + 'It installs itself automatically the first time a feature needs it (pinned, hash-verified runtime + models into the recommended folder, never the system drive when another drive exists): transcribe_media, rough_cut_talking_head and make_short_clips wait for that install; DSH_ASR_AUTO_INSTALL=0 turns the automatic install off. '
      + "action 'status' (default) reports whether it is ready, what is missing and the shared install (install.state idle / running / done / failed / disabled, progress, error); 'install' starts it now or joins the install already running — only needed to retry at once after a failure, to choose installDir / mirror, or when the automatic install is off.",
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'install'], description: 'status (default) or install.' },
        installDir: { type: 'string', description: 'Absolute install folder (ASCII path, e.g. D:/dsh-ai/asr). Default: the recommended folder.' },
        mirror: { type: 'string', enum: ['cn', 'global'], description: "Download sources: 'cn' (npmmirror + hf-mirror first, default) or 'global'." },
        deep: { type: 'boolean', description: 'status: also load the models once to prove they work (~2 s).' },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 1_800_000,
    isConcurrencySafe: () => false,
    async execute(args = {}) {
      if (args.action === 'install') {
        // the shared install (speech-recognition.js): joins the one already running instead of downloading twice
        const res = await startAsrInstall({ installDir: args.installDir || '', mirror: args.mirror || 'cn', trigger: 'manual' }).promise
        return { ...res, install: getAsrInstallState() }
      }
      return { ok: true, status: await getAsrStatus({ deep: Boolean(args.deep), force: Boolean(args.deep) }), installer: getAsrInstallerCatalog(), install: getAsrInstallState() }
    },
  })

  registerTool(ctx, {
    name: 'transcribe_media',
    description:
      'Transcribe a video or audio file with the local speech engine (no upload, no cost): returns the plain text, language, per-segment timing and writes an SRT next to the project transcripts. Results are cached per file. The engine installs itself automatically on first use (one-time ~260 MB download; this call waits for it).',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory (the transcript cache lives in it).' },
        mediaPath: { type: 'string', description: 'Video / audio file (absolute, or relative to projectDir).' },
        language: { type: 'string', enum: ['auto', 'zh', 'en', 'ja', 'ko', 'yue'], description: 'Spoken language (auto-detected by default).' },
      },
      required: ['mediaPath'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 3_600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const projectDir = args.projectDir ? resolve(args.projectDir) : ''
      const t = await transcribeMedia({ mediaPath: args.mediaPath, projectDir, language: args.language || 'auto' })
      const plan = planRoughCut(t, { fps: 30, cutPauses: false, cutFillers: false, cutStutters: false, cutRetakes: false, cutNoise: false, headPadSec: 0, tailPadSec: 0 })
      const caps = buildCaptions({ ...plan, keep: [{ start: 0, end: Math.max(plan.sourceDurationSec, t.durationSec) }], options: { fps: 30 } }, { maxLineWidth: 16, fps: 30 })
      let srtPath = ''
      if (t.cachePath) {
        srtPath = t.cachePath.replace(/\.transcript\.json$/, '.srt')
        const { writeFileSync } = await import('node:fs')
        writeFileSync(srtPath, captionsToSrt(caps), 'utf8')
      }
      return {
        ok: true,
        text: transcriptPlainText(t),
        language: t.language,
        durationSec: t.durationSec,
        segments: t.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
        srtPath,
      }
    },
  })

  registerTool(ctx, {
    name: 'rough_cut_talking_head',
    description:
      "口播粗剪: cut a talking-head recording automatically with the local speech engine — long pauses shortened, fillers (嗯/呃/um/uh), stutters, false starts and retakes removed (the LAST take stays), head / tail silence trimmed — then (buildProject, default true) turn it into a 口播剪辑 project: the cut recording as the picture, the person's own voice, real captions from what was said (word-by-word highlight), light music under the voice; render=true also renders output/final.mp4. options switch each rule; overrides.restore brings back removals by id (from the previous result), overrides.cutWords removes extra word ranges. Fully local, no LLM. The local speech engine installs itself automatically on first use (one-time ~260 MB download; the call waits for it).",
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory (the recording must be imported into it).' },
        sourcePath: { type: 'string', description: 'Recording to cut (asset id or project-relative path); default the 真人出镜 video, else the longest video with sound.' },
        options: {
          type: 'object',
          properties: {
            cutPauses: { type: 'boolean' },
            maxPauseSec: { type: 'number', description: 'Pauses longer than this are shortened (default 0.5).' },
            keepPauseSec: { type: 'number', description: 'Pause length kept at a cut (default 0.24).' },
            cutFillers: { type: 'boolean' },
            cutStutters: { type: 'boolean' },
            cutRetakes: { type: 'boolean' },
            enhanceVoice: { type: 'boolean', description: 'Light voice clean-up + loudness normalisation (default true).' },
            language: { type: 'string', enum: ['auto', 'zh', 'en', 'ja', 'ko', 'yue'] },
          },
          additionalProperties: false,
        },
        overrides: {
          type: 'object',
          properties: {
            restore: { type: 'array', items: { type: 'string' }, description: 'Removal ids to keep after all.' },
            cutWords: { type: 'array', items: { type: 'array', items: { type: 'number' } }, description: 'Extra [fromWordIndex, toWordIndex] ranges to cut.' },
          },
          additionalProperties: false,
        },
        buildProject: { type: 'boolean', description: 'Build the 口播剪辑 project (default true); false = only plan and render the rough cut files.' },
        render: { type: 'boolean', description: 'Also render output/final.mp4 (default false).' },
        sceneTargetSec: { type: 'number', description: 'Typical scene length in seconds (3..30, default 8).' },
        pack: {
          type: 'object',
          description: '口播包装 (rule-based, local): keyword pops on the spoken word, chapter banners + progress bar from 第一步/首先/最后…, B-roll from the project library matched to what is said (file names / descriptions / recognised speech), a lower-third name strip and soft accent sounds. Omitted = the project\'s saved settings (default: all on, preset knowledge).',
          properties: {
            preset: { type: 'string', enum: ['knowledge', 'energetic', 'business', 'warm', 'minimal'] },
            keywords: { type: 'boolean' },
            chapters: { type: 'boolean' },
            progressBar: { type: 'boolean' },
            broll: { type: 'boolean' },
            sfx: { type: 'boolean' },
            lowerThird: { type: ['object', 'null'], properties: { name: { type: 'string' }, title: { type: 'string' } }, additionalProperties: false },
            captions: { type: 'boolean', description: 'Real captions under the speaker (default true). false = voice + picture only (e.g. a screen tutorial).' },
            screen: { type: 'boolean', description: '录屏讲解: the recording is a screen capture — no punch-in zoom at the jump cuts (it would crop the interface).' },
            mascot: {
              type: ['object', 'null'],
              description:
                '卡通讲解员 standing in a corner and moving with the real voice. Either `characterId` — a reusable character from 「我的动漫形象」 (manage_anime_presenter) that talks: engine sprite = mouth shapes per syllable + blinks + nods (free, local, default), tha3 = local Talking Head Anime 3 model (free, optional install), runway / volc / vidu = the user\'s own cloud key (paid per second: pass confirmedRmb ≥ manage_anime_presenter estimate only after the user agreed; otherwise the free tier is used) — or `assetId`: a library picture (transparent PNG best, plain background cut out) or a ≤20 s plain-background clip that hops on words. null removes it.',
              properties: {
                characterId: { type: 'string', description: '「我的动漫形象」 character id (c-…).' },
                engine: { type: 'string', enum: ['sprite', 'tha3', 'runway', 'volc', 'vidu'], description: 'How the character moves (default sprite).' },
                mode: { type: 'string', description: 'Optional cloud engine mode (e.g. Volcengine normal / lively / lively-large).' },
                confirmedRmb: { type: 'number', description: 'Cloud engines only: the cost in RMB the user confirmed for this run (never stored).' },
                assetId: { type: 'string', description: 'A picture / short clip of the project library (instead of characterId).' },
                corner: { type: 'string', enum: ['bl', 'br'] },
                size: { type: 'string', enum: ['s', 'm', 'l'] },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 3_600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const projectDir = resolve(args.projectDir)
      if (args.buildProject === false) {
        const r = await runTalkRoughCut({ projectDir, sourcePath: args.sourcePath || '', options: args.options, overrides: args.overrides, render: true })
        return { ok: true, summary: r.summary, removals: r.plan.removals, keptText: r.texts.keptText, files: { video: r.doc.render.video, wav: r.doc.render.wav, srt: r.doc.render.srt, plan: r.files.json } }
      }
      const r = await buildTalkEditProject({ projectDir, sourcePath: args.sourcePath || '', options: args.options, overrides: args.overrides, sceneTargetSec: args.sceneTargetSec, ...(args.pack !== undefined ? { pack: args.pack } : {}) })
      let render = null
      if (args.render) render = await renderProjectVideo({ projectDir, engine: 'remotion' })
      const tp = r.script?.talkPack || null
      return {
        ok: true,
        summary: r.summary,
        removals: r.plan.removals,
        keptText: r.texts.keptText,
        scenes: r.scenes,
        captions: r.captionsCount,
        packaging: tp ? { preset: tp.preset, keywords: tp.keywords.map((k) => `${k.text}@${k.startSec}s`), chapters: tp.chapters.map((c) => `${c.index}.${c.title}@${c.startSec}s`), broll: tp.broll.map((b) => `${b.path}@${b.startSec}-${b.endSec}s`), lowerThird: tp.lowerThird } : null,
        outputPath: render?.outputPath || '',
        qaPassed: render ? (render.qaReport || render.qa)?.passed !== false : null,
      }
    },
  })

  registerTool(ctx, {
    name: 'host_llm_task',
    description:
      '宿主智能体代写 — for agents running on a subscription without a model API key (Codex, Claude Code, Cursor …). When the plugin\'s model setting is 「由当前智能体代写」 (configure_llm_model mode "host-agent"), every writing job the plugin needs — AI 润色, storyboard planning, per-scene animation code, refine, visual checks — waits here instead of calling a model provider. action "next" returns the oldest waiting task (its system prompt, messages, exact output rules; images as local file paths you can open) — write the answer with your own model and hand it back with action "reply" { id, text } (or { id, error } when you cannot). Keep calling "next" until it returns no task while a pipeline / studio action is running. "list" shows what is waiting. Nothing is borrowed: the plugin never reads any agent login, token or credential file.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['next', 'reply', 'list'] },
        id: { type: 'string', description: 'Task id (reply).' },
        text: { type: 'string', description: 'Your complete answer (reply): only the requested content — JSON when the task asks for JSON, full code for a code task.' },
        error: { type: 'string', description: 'Why the task cannot be done (reply instead of text).' },
        waitSec: { type: 'number', description: 'next: wait up to this many seconds for a task to appear (0..60, default 20).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 120_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const action = String(args.action || 'next')
      // background work started by this process in 宿主智能体代写 mode (a film, a refine …): finished results are
      // handed out once, running ones tell the agent to keep serving tasks
      const jobsView = () => {
        const finished = takeFinishedHostJobs()
        const running = listRunningHostJobs()
        return { ...(finished.length ? { finishedJobs: finished } : {}), ...(running.length ? { runningJobs: running } : {}) }
      }
      if (action === 'list') return { ok: true, tasks: listHostTasks(), runningJobs: listRunningHostJobs() }
      if (action === 'reply') return { ...submitHostReply({ id: args.id, text: args.text || '', error: args.error || '' }), ...jobsView() }
      const waitMs = Math.max(0, Math.min(60, Number(args.waitSec ?? 20))) * 1000
      // while background jobs run, keep waiting for their next task (a job may be rendering between two writing tasks)
      const t = await nextHostTask({ waitMs: listRunningHostJobs().length ? Math.max(waitMs, 45_000) : waitMs })
      const jobs = jobsView()
      if (!t) {
        const busy = (jobs.runningJobs || []).length
        return {
          ok: true,
          task: null,
          ...jobs,
          message: busy
            ? `现在没有等待中的写作任务，但还有 ${busy} 项后台工作在进行（例如渲染）。请继续调用 host_llm_task（action: "next"），直到返回最终结果。`
            : jobs.finishedJobs
              ? '后台工作已完成，结果见 finishedJobs。'
              : '现在没有等待中的写作任务。',
        }
      }
      return { ok: true, task: describeHostTask(t), ...jobs }
    },
  })

  registerTool(ctx, {
    name: 'make_highlight_reel',
    description:
      'Vlog 高光: cut the project\'s own video clips into a short film on the beats of a song — every clip is split into shots and scored (sharpness, exposure, steadiness, motion; dark / blurry / shaky shots are skipped), the music (an uploaded track, else generated music) is beat-tracked, calm passages get longer shots and the loud part / after a drop quick 2-beat cuts (0.6–4 s per shot, ending on a strong beat), each cut gets the best unused shot that fits (story order follows the recording order; best order puts moving shots on the loudest music). Clip sound is muted under the music; optional opening title. Writes a talk-kit Remotion project + HTML draft; render=true also renders output/final.mp4. Fully local, no LLM, free.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory with the clips (and optionally music) imported.' },
        musicAssetId: { type: 'string', description: 'Music asset to cut to (default: the first uploaded music; none = generated music).' },
        targetSec: { type: 'number', description: 'Film length in seconds (6..90); 0 / omitted = automatic (up to 60 s and the music length).' },
        order: { type: 'string', enum: ['story', 'best'], description: "'story' (default) = recording order; 'best' = the best moving shots on the loudest music." },
        aspect: { type: 'string', enum: ['auto', '16:9', '9:16', '1:1'], description: 'Frame (default auto = the orientation most clips have).' },
        title: { type: 'string', description: 'Optional opening title (≤ 20 characters).' },
        render: { type: 'boolean', description: 'Also render output/final.mp4 (default false).' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 3_600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const projectDir = resolve(args.projectDir)
      const { buildHighlightProject } = await import('./highlight-reel.js')
      const res = await buildHighlightProject({
        projectDir,
        musicAssetId: String(args.musicAssetId || ''),
        targetSec: Number(args.targetSec) > 0 ? Math.max(6, Math.min(90, Number(args.targetSec))) : 0,
        order: args.order === 'best' ? 'best' : 'story',
        aspect: ['16:9', '9:16', '1:1'].includes(args.aspect) ? args.aspect : 'auto',
        title: String(args.title || '').slice(0, 20),
      })
      const { script, ...summary } = res
      const cuts = (script?.scenes || []).map((s) => ({ id: s.id, startSec: Number((s.startFrame / script.fps).toFixed(2)), durationSec: s.durationSec, clip: s.media?.[0]?.path || '', inSec: s.media?.[0]?.trimStartSec, energy: s.energy }))
      if (!args.render) return { ...summary, cuts }
      const { executeVideoRender } = await import('../dsh-tool-video-suite/index.js')
      const rendered = await executeVideoRender({ projectDir, engine: 'remotion' })
      return { ...summary, cuts, outputPath: rendered?.outputPath || '', qa: rendered?.qaReport || rendered?.qa || null }
    },
  })

  registerTool(ctx, {
    name: 'make_short_clips',
    description:
      '长视频拆条: turn a long recording of the user\'s own (interview, podcast, live-stream replay, lesson, talk) in the project library into stand-alone short clips for 抖音 / 视频号 / 小红书 / 快手 / B站. action "find": local speech recognition (cached) → whole sentences → ONE model call per ~60 min of speech picks complete, self-contained passages (title ≤ 20 chars, reason, score, tags); code checks every pick (ids, lengths, overlaps, a trailing next-topic question, a start that leans on what came before) → saved plan. action "update": edits [{ index, title?, enabled?, startDelta?, endDelta? }] (deltas in whole sentences). action "render" (local FFmpeg, free): inside each clip pauses / fillers / stutters / retakes are removed, layout for the platform (fit = whole picture on a blurred backdrop, window = 访谈小窗, crop = fill from the centre), title + captions (keyword highlighted) + progress line, −14 LUFS → output/clips/<recording>/NN-标题.mp4 + .jpg cover + .srt + clips.json + 发布文案.md. Captions already burned into the recording are detected and not doubled. find with render=true does both. action "state" shows the saved plan. Only recordings already imported are used; nothing is downloaded or published — except, once, the local speech engine, which installs itself automatically on first use (~260 MB; find waits for it).',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory (the recording must be imported into it).' },
        action: { type: 'string', enum: ['find', 'update', 'render', 'state'], description: 'Default "find".' },
        sourcePath: { type: 'string', description: 'Recording (asset id or project-relative path); default the longest recording with sound.' },
        platform: { type: 'string', enum: ['douyin', 'shipinhao', 'xiaohongshu', 'kuaishou', 'bilibili', 'original'], description: 'Where the clips go: canvas (9:16 / 3:4 / 16:9 / source) and clip lengths (short-video apps 15–180 s, best 30–90 s; B站 30–300 s). Default douyin.' },
        count: { type: 'number', description: 'Exactly this many clips (1..30); 0 / omitted = automatic by the recording length.' },
        focus: { type: 'string', description: 'Optional wish for the picks, e.g. "只要讲方法的部分" (≤ 300 chars).' },
        edits: {
          type: 'array',
          description: 'update: changes per clip index.',
          items: {
            type: 'object',
            properties: {
              index: { type: 'number' },
              title: { type: 'string' },
              enabled: { type: 'boolean' },
              startDelta: { type: 'number', description: 'Move the start by whole sentences (−5..5; negative = earlier).' },
              endDelta: { type: 'number', description: 'Move the end by whole sentences (−5..5; positive = later).' },
            },
            required: ['index'],
            additionalProperties: false,
          },
        },
        indexes: { type: 'array', items: { type: 'number' }, description: 'render: only these clips (default every enabled clip).' },
        settings: {
          type: 'object',
          description: 'render: look of the clips (saved for next time).',
          properties: {
            layout: { type: 'string', enum: ['auto', 'fit', 'window', 'crop'] },
            captions: { type: 'string', enum: ['auto', 'on', 'off'], description: 'auto = off when the recording already has captions burned in.' },
            title: { type: 'boolean' },
            progressBar: { type: 'boolean' },
            accent: { type: 'string', description: 'Accent colour #RRGGBB (title line 2, keywords, progress line).' },
          },
          additionalProperties: false,
        },
        render: { type: 'boolean', description: 'find: also render every clip right away (default false).' },
        force: { type: 'boolean', description: 'find: recognise the speech again; render: render unchanged clips again.' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 3_600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const projectDir = resolve(args.projectDir)
      const sc = await import('./short-clips.js')
      const action = args.action || 'find'
      const sourcePath = String(args.sourcePath || '')
      const lean = (plan) => ({
        source: plan.source,
        platform: plan.platform,
        clips: plan.clips.map((c) => ({ index: c.index, title: c.title, reason: c.reason, score: c.score, tags: c.tags, enabled: c.enabled, from: c.sourceStart, to: c.sourceEnd, seconds: c.spanSec, text: Array.from(c.text || '').slice(0, 120).join('') })),
        found: plan.found,
      })
      if (action === 'state') {
        const st = await sc.readShortClipsState(projectDir, { sourcePath })
        return { ok: true, engine: st.engine, llm: st.llm, sources: st.sources, plan: st.plan ? lean(st.plan) : null, rendered: st.rendered, estimate: st.estimate }
      }
      if (action === 'update') {
        const res = await sc.updateShortClips({ projectDir, sourcePath, edits: args.edits || [], render: args.settings })
        return { ok: true, ...lean(res.plan) }
      }
      const doRender = async () => {
        const out = await sc.renderShortClips({ projectDir, sourcePath, indexes: args.indexes, settings: args.settings, force: action === 'render' && Boolean(args.force) })
        return { folder: out.folder, layout: out.layout, captions: out.captions, burnedCaptionsInSource: out.burned, clips: out.clips.map(({ key, ...c }) => c) }
      }
      if (action === 'render') return { ok: true, ...(await doRender()) }
      return await runWritingTool('make_short_clips', async () => {
        const res = await sc.findShortClips({ projectDir, sourcePath, platform: args.platform, count: Number(args.count) || 0, focus: String(args.focus || ''), force: Boolean(args.force) })
        return { ok: true, ...lean(res.plan), ...(args.render ? { rendered: await doRender() } : {}) }
      })
    },
  })

  registerTool(ctx, {
    name: 'index_footage',
    description:
      '看懂素材库: split the project\'s videos into shots (FFmpeg scene detection; long takes offer several windows) and measure every shot — thumbnail, exposure, sharpness, motion, loudness and, when the local speech engine is installed, what is said. Long uploads are then no longer always played from their first second: planners pick the best window per scene (scene media trimStartSec / trimEndSec). Fully local, no LLM, free; re-uses the index while a file is unchanged.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        assetIds: { type: 'array', items: { type: 'string' }, description: 'Only these assets (default: every video).' },
        force: { type: 'boolean', description: 'Re-analyse even when unchanged.' },
        transcribe: { type: 'string', enum: ['auto', 'on', 'off'], description: "Recognise speech per shot: 'auto' (when the local engine is installed, default), 'on' (required), 'off'." },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 3_600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const projectDir = resolve(args.projectDir)
      const r = await indexFootage({ projectDir, assetIds: args.assetIds, force: Boolean(args.force), transcribe: args.transcribe || 'auto' })
      const items = (readAssets(projectDir).items || []).filter((it) => it.type === 'video' && it.footage?.shots?.length)
      return {
        ok: true,
        indexed: r.indexed,
        skipped: r.skipped,
        library: items.map((it) => describeFootageForPrompt(it, { maxShots: 16 })),
      }
    },
  })

  registerTool(ctx, {
    name: 'analyze_reference_video',
    description:
      'Reverse-engineer an uploaded reference video using FFprobe + FFmpeg shot-cut detection + audio BPM/drop analysis + 9-frame contact sheet + 4-protocol Multimodal Vision LLM to extract replicable visual/character/VFX/transition/pacing DNA, write MOTION.md, and attach referenceStyle to script.json for same-style video recreation. Whether the model can look at pictures is decided by the shared 看图能力 check (configure_llm_model visionSupport / visionModel / checkVision); `referenceStyle.visionStatus` says in plain Chinese whether vision was used and, if not, why and how to fix it.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        videoPath: { type: 'string', description: 'Path to the reference video file (absolute or relative to projectDir).' },
        extractAudioAsBgm: { type: 'boolean', description: 'If true, also extract the reference video audio track as uploaded BGM.' },
        applyToScript: { type: 'boolean', description: 'If true (default), bind extracted referenceStyle, genre, pacing, and narrationMode directly onto script.json.' },
        useVision: { type: 'boolean', description: 'If true (default), call configured multimodal Vision LLM on the 3x3 keyframe contact sheet.' },
      },
      required: ['projectDir', 'videoPath'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    // FFmpeg measurements + the 看图 probe and the vision call (each up to getLlmTimeoutMs())
    timeoutMs: getLlmTimeoutMs() * 2 + 600_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (args.useVision === false) return await analyzeReferenceVideo(args)
      return await runWritingTool('analyze_reference_video', () => analyzeReferenceVideo(args))
    },
  })

  registerTool(ctx, {
    name: 'manage_brand_kit',
    description:
      'Read or save a reusable Brand Kit (brandName, tagline, primaryColor, accentColor, backgroundColor, logoPath, watermarkText, defaultStyle, defaultPlatform) and/or export a project MOTION.md shot blueprint.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'save', 'export_motion_md'], description: 'Operation to perform.' },
        projectDir: { type: 'string', description: 'Optional project directory (required for export_motion_md).' },
        brandKit: { type: 'object', description: 'Brand kit object when action is save.', additionalProperties: true },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 30_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.action === 'save') {
        return { ok: true, brandKit: saveBrandKit(args.brandKit || {}, args.projectDir || '') }
      }
      if (args.action === 'export_motion_md') {
        if (!args.projectDir) throw new Error('projectDir is required for export_motion_md')
        return exportProjectMotionMd(args.projectDir)
      }
      return { ok: true, brandKit: loadBrandKit(args.projectDir || '') }
    },
  })

  registerTool(ctx, {
    name: 'configure_cloud_media',
    description:
      'Read or save optional BYOK Cloud AI Media Generation connectors for Image (Seedream/OpenAI/Flux/Kling/Custom), Video (Seedance/Kling/MiniMax Hailuo/Sora/Custom), and Audio/Music (Suno/MiniMax Music & Speech/ElevenLabs/Custom HTTP JSON protocol).',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'save', 'test'],
          description: 'Use get to inspect masked config + presets, save to update, or test to check a connector (free check: nothing is generated or charged; config is not saved).',
        },
        category: { type: 'string', enum: ['image', 'video', 'audio'], description: 'Connector to check when action is test.' },
        config: { type: 'object', description: 'Partial config patch { image?, video?, audio?, autoUseCloudBroll? } (for test: the category values to try; an empty apiKey uses the saved key).', additionalProperties: true },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 30_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.action === 'save') {
        return { ok: true, config: saveCloudMediaConfig(args.config || {}) }
      }
      if (args.action === 'test') {
        const category = ['image', 'video', 'audio'].includes(args.category) ? args.category : ''
        if (!category) throw new Error('action "test" needs category: image | video | audio')
        const c = args.config && typeof args.config === 'object' ? args.config : {}
        const draft = c[category] && typeof c[category] === 'object' ? c[category] : c
        return { ok: true, test: await testCloudMediaConnection({ category, config: draft, budgetMs: 25_000 }) }
      }
      return { ok: true, config: getCloudMediaConfigSummary() }
    },
  })

  registerTool(ctx, {
    name: 'generate_cloud_media',
    description:
      'Generate an Image, Live-Action Video B-roll, or AI Song/BGM/Audio track using configured optional BYOK Cloud AI providers (Seedream, Seedance, Kling, Flux, Suno, MiniMax Music/Speech/Hailuo, ElevenLabs, or Custom HTTP JSON protocol) and auto-import into the project.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Target video project directory.' },
        category: { type: 'string', enum: ['image', 'video', 'audio'], description: 'Media type to generate.' },
        prompt: { type: 'string', description: 'Visual or musical description prompt.' },
        lyrics: { type: 'string', description: 'Optional lyrics for Suno / MiniMax Music.' },
        tags: { type: 'string', description: 'Optional musical style tags.' },
        title: { type: 'string', description: 'Optional asset/song title.' },
        durationSec: { type: 'number', description: 'Optional target duration in seconds (e.g. 5 or 10 for video).' },
        aspectRatio: { type: 'string', description: 'Aspect ratio (16:9, 9:16, 1:1).' },
        imageUrl: { type: 'string', description: 'Optional first-frame reference image URL for image-to-video.' },
        instrumental: { type: 'boolean', description: 'Pure instrumental music without vocals (Suno/Custom).' },
        sceneId: { type: 'string', description: 'Optional scene ID to auto-bind generated image/video into.' },
        autoBindToScript: { type: 'boolean', description: 'Automatically bind generated BGM/visual into script.json (default true).' },
        forceNew: { type: 'boolean', description: 'Pay for a NEW generation even if the paid-job ledger already holds a result / running task with identical params (default false: resume or reuse, never charge twice).' },
        characterIds: { type: 'array', items: { type: 'string' }, description: 'Extra character bank IDs to keep consistent (prompts mentioning @角色名 / @别名 are detected automatically).' },
        useCharacterRefs: { type: 'boolean', description: 'Attach character reference images / descriptions for @mentions (default true).' },
      },
      required: ['category', 'prompt'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 300_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await generateCloudMediaAsset(args)
    },
  })

  registerTool(ctx, {
    name: 'manage_template_plaza',
    description:
      'Browse, inspect, apply, or publish reusable MOTION.md video blueprints in the built-in, online & community Template Plaza (影核广场 · CinePulse Hub). '
      + '可填空模板 (fill a template with your own words / pictures / music, like a video-template app): `slots` (templateId, optional projectDir) lists every blank — per shot its words (title, the spoken / subtitle line, key words, the history stage\'s big words, a window title) with the template\'s own text as `example` and a `maxLength`, its picture places (`required` = the template shows a picture there; others replace the template\'s animation) — plus film.title / film.music / film.bannerChar and, with projectDir, the project\'s media (`library`). `fill` (projectDir, templateId, fills: { slotId: text | asset id }, autoFillMedia?, topic?) puts the template into the project: its shots, layouts, transitions, tempo and sound design stay; an empty text blank keeps the template\'s words, a shot whose words you replaced gets all of its on-screen words from them; empty required picture places take library media (autoFillMedia, default true); film.music = a music asset id, \'generate\' (a track at the template\'s tempo) or empty (the library\'s first song, else generated) and the shots are re-cut to its beats. No model call — write the texts yourself (each line about as long as its example so the shot timing still fits), then, when the template speaks (narrationMode not subtitle-mv), voice every scene (generate_speech) and render (video_render). '
      + 'Community: `submit-preview` shows exactly what a submission would share (files, cleaned texts, privacy findings); `submit` (needs consent: true after the user agreed) builds a privacy-checked submission package (zip) on this computer and returns the GitHub issue-form / e-mail links — show them to the user, who sends the package himself (never upload or e-mail anything yourself); `submissions` lists the packages; `sync-online` refreshes the online catalogue of templates the author accepted (only when the user asks).',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'apply', 'publish', 'slots', 'fill', 'submit-preview', 'submit', 'submissions', 'sync-online'], description: 'Plaza operation.' },
        category: { type: 'string', description: 'Optional category filter when listing.' },
        query: { type: 'string', description: 'Optional search keyword when listing.' },
        templateId: { type: 'string', description: 'Template ID for get/apply/publish/slots/fill.' },
        projectDir: { type: 'string', description: 'Project directory for apply/publish/fill (and slots: adds the project\'s media).' },
        fills: { type: 'object', additionalProperties: { type: 'string' }, description: "fill: slot id → new text, or a media / music asset id for picture places and film.music ('generate' = a track at the template\'s tempo). Slot ids come from action 'slots' (film.title, s03.line, s03.media.0 …)." },
        autoFillMedia: { type: 'boolean', description: 'fill: give the template\'s empty picture places unused library media of the right kind (default true).' },
        topic: { type: 'string', description: 'fill: what the film is about (one sentence, stored with the project).' },
        newTopic: { type: 'string', description: 'Optional new topic when applying a template.' },
        copyScenes: { type: 'boolean', description: 'If true, also copy starter scenes from template.' },
        name: { type: 'string', description: 'Display name when publishing.' },
        description: { type: 'string', description: 'Template description when publishing.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags when publishing / submitting.' },
        title: { type: 'string', description: 'Work title for submit-preview / submit (defaults to name).' },
        author: { type: 'string', description: 'Author nickname for a submission.' },
        contact: { type: 'string', description: 'Optional contact shown to the plaza maintainer (public on GitHub).' },
        consent: { type: 'boolean', description: 'Must be true for submit: the user agreed that the maintainer may show / curate / distribute the work and that it infringes nobody\'s rights or privacy.' },
        allowNames: { type: 'boolean', description: 'The user confirmed that a computer / user name found in the content may be published.' },
        previewStartSec: { type: 'number', description: 'Start of the ≤ 15 s sample clip taken from output/final.mp4.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 900_000, // a submission cuts a sample clip with ffmpeg; the online sync downloads templates; a fill analyses long clips
    isConcurrencySafe: () => true,
    async execute(args) {
      if (args.action === 'submit-preview') return previewPlazaSubmission({ ...args, title: args.title || args.name })
      if (args.action === 'submit') return buildPlazaSubmission({ ...args, title: args.title || args.name, consent: args.consent === true })
      if (args.action === 'submissions') return listPlazaSubmissions()
      if (args.action === 'sync-online') return syncOnlinePlazaTemplates()
      if (args.action === 'get') return getPlazaTemplate(args.templateId)
      if (args.action === 'apply') return applyPlazaTemplateToProject(args)
      if (args.action === 'slots') return { ...describeTemplateSlots(args.templateId), library: args.projectDir ? templateFillLibrary(args.projectDir) : null }
      if (args.action === 'fill') {
        if (!args.projectDir) throw new Error('fill 需要 projectDir（要套用模板的视频工程目录）')
        return fillTemplateIntoProject({ projectDir: args.projectDir, templateId: args.templateId, fills: args.fills || {}, autoFillMedia: args.autoFillMedia !== false, topic: args.topic || '' })
      }
      if (args.action === 'publish') return publishProjectToPlaza(args)
      return listPlazaTemplates({ category: args.category, query: args.query })
    },
  })
}

export {
  applyPlazaTemplateToProject,
  assistCloudMediaPrompt,
  CLOUD_MEDIA_PRESETS,
  commitStagedCloudAsset,
  discardStagedCloudAsset,
  executeCurateAndEditAssets,
  generateAiCodedSfxCues,
  generateCloudMediaAsset,
  getCloudMediaConfigSummary,
  getPlazaTemplate,
  listPlazaTemplates,
  listStagedCloudAssets,
  loadCloudMediaConfig,
  PLAZA_BRAND,
  PLAZA_CATEGORIES,
  publishProjectToPlaza,
  runMultiAgentPipeline,
  saveCloudMediaConfig,
  startPipelineBackground,
  taskManager,
}

export default { name, inject, apply }
export * from './genre-router.js'
export { extractJsonFromLlmText } from './llm-client.js'
