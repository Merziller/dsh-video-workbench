/**
 * @dsh-video/tool-media
 * Cordis plugin registering user asset management, procedural SFX/BGM synthesis,
 * multi-track audio mixing, AI storyboard planning, and one-click full video production.
 */
import { join, resolve } from 'node:path'
import { readScriptJson } from '@dsh-video/shared'
import { executeGenerateSpeech } from '@dsh-video/tool-local-tts'
import {
  importAssets,
  readAssets,
  removeAsset,
  saveUploadedAsset,
  summarizeAssets,
  updateAsset,
} from './asset-manager.js'
import {
  ensureProjectAudioAssets,
  generateBgmWav,
  generateSfxWav,
  mixVideoAudio,
} from './audio-synth.js'
import {
  planVideoFromAssets,
  syncProjectCodeFromScript,
} from './ai-director.js'
import { buildRichHtmlVideo } from './html-generator.js'
import { syncRemotionPublicAssets, writeRemotionProjectFiles } from './remotion-generator.js'

export {
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
  planVideoFromAssets,
  syncProjectCodeFromScript,
  buildRichHtmlVideo,
  syncRemotionPublicAssets,
  writeRemotionProjectFiles,
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
    style = 'tech',
    engine = 'html',
    voiceId = 'auto',
    ttsEngine,
    allowPlaceholder = false,
    fps,
    renderWidth,
    renderHeight,
    onProgress,
  } = options

  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)

  onProgress?.('1/5 正在导入并分析素材...')
  const planned = await planVideoFromAssets({
    projectDir: absDir,
    sources,
    title,
    topic,
    style,
    engine,
    voiceId,
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
      engine: ttsEngine || process.env.DEFAULT_TTS_ENGINE || 'indextts2',
      fps: curScript.fps || 30,
      outputPath: join(absDir, 'audio', `${s.id}.wav`),
      scriptPath: absDir,
      sceneId: s.id,
      allowPlaceholder,
    })
  }

  curScript = readScriptJson(absDir).data
  onProgress?.('3/5 正在生成双引擎画面工程（动效/特效/字幕/素材运镜）...')
  syncProjectCodeFromScript(absDir, curScript)

  const { executeVideoLint, executeVideoRender } = await import('@dsh-video/tool-video-suite')
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
  ctx.tools.register({
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

  ctx.tools.register({
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

  ctx.tools.register({
    name: 'generate_sfx_bgm',
    description:
      'Generate studio-grade sound effects (whoosh, impact, pop, chime, riser) and mood-matched background music WAVs, and mix them with voice narration into master-audio.wav.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        mood: {
          type: 'string',
          enum: ['tech', 'cinematic', 'warm', 'energetic'],
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

  ctx.tools.register({
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
          enum: ['tech', 'cinematic', 'documentary', 'energetic', 'warm'],
          description: 'Visual and musical style.',
        },
        engine: { type: 'string', enum: ['html', 'remotion'], description: 'Target render engine.' },
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

  ctx.tools.register({
    name: 'produce_video',
    description:
      'End-to-end one-click production: import assets -> AI storyboard & copy -> real IndexTTS-2 narration -> HTML/Remotion code -> SFX/BGM ducked audio mix -> full-FPS H.264 MP4.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'Video project directory.' },
        sources: { type: 'array', items: { type: 'string' }, description: 'Optional local media folders or files to import.' },
        title: { type: 'string', description: 'Video title.' },
        topic: { type: 'string', description: 'Topic / prompt.' },
        style: { type: 'string', enum: ['tech', 'cinematic', 'documentary', 'energetic', 'warm'] },
        engine: { type: 'string', enum: ['html', 'remotion'] },
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
}

export default { name, inject, apply }
