import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  buildSentenceSubtitles,
  loadEnv,
  probeAudioDuration,
  readScriptJson,
  REPO_ROOT,
  resolveEnvPath,
  runCommandRedirected,
  writeScriptJson,
} from '@dsh-video/shared'
import {
  cloneRecordedVoice,
  getVoiceCatalog,
  importVoicePack,
  matchAllScenesInScript,
  matchVoiceForScene,
} from './voice-manager.js'
import { ensureTtsServer, getTtsServerHealth } from './tts-server-manager.js'

export {
  cloneRecordedVoice,
  getVoiceCatalog,
  importVoicePack,
  matchAllScenesInScript,
  matchVoiceForScene,
  ensureTtsServer,
  getTtsServerHealth,
}

/**
 * Core execution function for `generate_speech`.
 * Synthesizes WAV via IndexTTS-2.5 (or legacy IndexTTS-2 / GPTvoice-tts), measures exact duration via `ffprobe`,
 * computes `durationInFrames = Math.ceil(durationSec * fps)`, and updates `script.json`.
 */
export async function executeGenerateSpeech(args = {}) {
  loadEnv()
  const {
    text,
    emotion = '平静',
    lang = '',
    durationFactor = 1.0,
    outputPath,
    fps = 30,
    engine = process.env.DEFAULT_TTS_ENGINE || 'indextts25',
    voiceId = 'auto',
    scriptPath = '',
    sceneId = '',
    allowDirectPython = false,
  } = args

  if (!text || !String(text).trim()) {
    throw new Error('Parameter `text` is required for generate_speech.')
  }
  if (!outputPath || !String(outputPath).trim()) {
    throw new Error('Parameter `outputPath` is required for generate_speech.')
  }

  let projectMeta = {}
  let targetScene = { narration: text, emotion, voiceId }
  let resolvedScriptPath = ''

  if (scriptPath) {
    try {
      const loaded = readScriptJson(scriptPath)
      resolvedScriptPath = loaded.scriptPath
      projectMeta = loaded.data
      if (sceneId && Array.isArray(loaded.data.scenes)) {
        const found = loaded.data.scenes.find((s) => s.id === sceneId || String(s.index) === String(sceneId))
        if (found) targetScene = { ...found, narration: text, emotion: emotion || found.emotion }
      }
    } catch {}
  }

  // 1. Match or select voice from Voice Pack Catalog
  const { voices } = getVoiceCatalog()
  const matched = matchVoiceForScene(targetScene, projectMeta, voices, voiceId)
  const selectedVoice = matched.voice

  // 2. Resolve output WAV path
  const baseDir = resolvedScriptPath ? dirname(resolvedScriptPath) : REPO_ROOT
  const absOutputPath = isAbsolute(outputPath) ? outputPath : resolve(baseDir, outputPath)
  mkdirSync(dirname(absOutputPath), { recursive: true })

  // 3. Invoke Python TTS bridge (HTTP endpoint -> optional cy_app -> acoustic cadence fallback)
  const pythonBin =
    engine === 'gptvoice'
      ? resolveEnvPath('GPTVOICE_PYTHON', '') || resolveEnvPath('INDEXTTS_PYTHON', '') || 'python'
      : resolveEnvPath('INDEXTTS_PYTHON', '') || 'python'

  const endpoint =
    engine === 'gptvoice'
      ? process.env.GPTVOICE_ENDPOINT || 'http://127.0.0.1:9881'
      : process.env.INDEXTTS_ENDPOINT || 'http://127.0.0.1:9880'

  const engineRoot =
    engine === 'gptvoice'
      ? resolveEnvPath('GPTVOICE_ROOT', '')
      : resolveEnvPath('INDEXTTS_ROOT', '')

  const bridgeScript = join(REPO_ROOT, 'scripts', 'tts-bridge.py')
  const allowPlaceholder =
    Boolean(args.allowPlaceholder) || String(process.env.TTS_ALLOW_PLACEHOLDER || '') === '1'

  // Start / reuse the persistent IndexTTS-2 server so we get REAL speech (model loaded once)
  if (engine !== 'gptvoice' && !allowPlaceholder) {
    await ensureTtsServer()
  } else if (engine !== 'gptvoice') {
    try {
      const h = await getTtsServerHealth()
      if (!h.ready) await ensureTtsServer({ waitMs: 5_000 }).catch(() => {})
    } catch {}
  }

  // IndexTTS-2 zero-shot needs a WAV reference; `.pt` speaker tensors fall back to DEFAULT_REF_AUDIO
  let refAudio = selectedVoice.resolvedRefPath || ''
  const fallbackRef = resolveEnvPath('DEFAULT_REF_AUDIO', '')
  if (refAudio.toLowerCase().endsWith('.pt')) {
    const siblingWav = refAudio.replace(/\.pt$/i, '.wav')
    refAudio = existsSync(siblingWav) ? siblingWav : fallbackRef || refAudio
  }

  const bridgeArgs = [
    bridgeScript,
    '--engine', engine,
    '--text', String(text).trim(),
    '--output', absOutputPath,
    '--emotion', emotion,
    '--lang', String(lang || ''),
    '--duration-factor', String(durationFactor || 1.0),
    '--voice-id', selectedVoice.id,
    '--ref-audio', refAudio,
    '--emo-audio', matched.emotionAudio || '',
    '--prompt-text', selectedVoice.promptText || '',
    '--endpoint', endpoint,
    '--engine-root', engineRoot,
    '--fallback-ref', fallbackRef || '',
  ]
  if (allowDirectPython) {
    bridgeArgs.push('--allow-direct-python')
  }
  if (allowPlaceholder) {
    bridgeArgs.push('--allow-placeholder')
  }

  const synthResult = await runCommandRedirected(pythonBin, bridgeArgs, { timeoutMs: 420_000 })
  if (synthResult.code !== 0 || !existsSync(absOutputPath)) {
    let msg = synthResult.stderr || synthResult.stdout
    try {
      msg = JSON.parse(synthResult.stdout.trim().split(/\r?\n/).pop()).error || msg
    } catch {}
    throw new Error(`TTS synthesis failed: ${msg}`)
  }

  let providerInfo = {}
  try {
    const lastLine = synthResult.stdout.trim().split(/\r?\n/).pop()
    providerInfo = JSON.parse(lastLine)
  } catch {}

  // 4. Probe exact duration via `ffprobe` (strictly forbidden to guess duration)
  const safeFps = Number(fps) > 0 ? Number(fps) : Number(projectMeta.fps) || 30
  const probe = await probeAudioDuration(absOutputPath, safeFps)

  // 5. Write back exact durationSec, durationInFrames, voiceId, and subtitle timestamps into `script.json`
  let scriptUpdated = false
  if (resolvedScriptPath && existsSync(resolvedScriptPath)) {
    const { data, projectDir } = readScriptJson(resolvedScriptPath)
    const relAudio = relative(projectDir, absOutputPath).replace(/\\/g, '/')
    if (Array.isArray(data.scenes)) {
      let updatedAny = false
      data.scenes = data.scenes.map((scene) => {
        const isTarget =
          (sceneId && (scene.id === sceneId || String(scene.index) === String(sceneId))) ||
          (!sceneId && scene.audioFile && resolve(projectDir, scene.audioFile) === absOutputPath)
        if (!isTarget) return scene
        updatedAny = true
        // Scene length = lead-in + MEASURED voice duration + tail (never guessed)
        const leadSec = Number.isFinite(Number(scene.voiceLeadSec)) ? Number(scene.voiceLeadSec) : 0.35
        const tailSec = Number.isFinite(Number(scene.tailSec)) ? Number(scene.tailSec) : 0.65
        const sceneDurationSec = Number((leadSec + probe.durationSec + tailSec).toFixed(4))
        const subs = buildSentenceSubtitles(text, probe.durationSec, safeFps).map((s) => ({
          ...s,
          startSec: Number((s.startSec + leadSec).toFixed(3)),
          endSec: Number((s.endSec + leadSec).toFixed(3)),
          startFrame: Math.floor((s.startSec + leadSec) * safeFps),
          endFrame: Math.ceil((s.endSec + leadSec) * safeFps),
        }))
        return {
          ...scene,
          narration: String(text).trim(),
          emotion,
          voiceId: selectedVoice.id,
          voiceName: selectedVoice.name,
          voiceMatchReason: matched.reason,
          audioFile: relAudio,
          voiceLeadSec: leadSec,
          tailSec,
          voiceDurationSec: probe.durationSec,
          voiceProvider: providerInfo.provider || engine,
          voicePlaceholder: Boolean(providerInfo.placeholder),
          durationSec: sceneDurationSec,
          durationInFrames: Math.max(1, Math.ceil(sceneDurationSec * safeFps)),
          subtitles: subs,
        }
      })
      if (updatedAny) {
        writeScriptJson(resolvedScriptPath, data)
        scriptUpdated = true
      }
    }
  }

  return {
    ok: true,
    engine,
    provider: providerInfo.provider || engine,
    placeholder: Boolean(providerInfo.placeholder),
    outputPath: absOutputPath,
    durationSec: probe.durationSec,
    durationInFrames: probe.durationInFrames,
    fps: safeFps,
    voiceId: selectedVoice.id,
    voiceName: selectedVoice.name,
    voiceMatchMode: matched.mode,
    voiceMatchReason: matched.reason,
    scriptUpdated,
    scriptPath: resolvedScriptPath || null,
  }
}

export const name = 'dsh-tool-local-tts'
export const inject = ['tools']

export function apply(ctx) {
  // Tool 1: list_voices
  ctx.tools.register({
    name: 'list_voices',
    description:
      'List all available TTS voices and imported voice packs (IndexTTS-2.5 & GPTvoice-tts), including gender, style tags, supported emotions, and availability.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional filter by category folder (e.g. 热门音色, 中年-男声, 孩童, 老年, IndexTTS-2.5 内置)',
        },
        ageGroup: {
          type: 'string',
          description: 'Optional filter by age group: child | youth | adult | middle-aged | elderly',
        },
        gender: {
          type: 'string',
          description: 'Optional filter by gender: male | female | neutral',
        },
        tag: {
          type: 'string',
          description: 'Optional filter by style tag or keyword (e.g. 纪录片, 短视频, 温柔, 沧桑, 女主播, 评书)',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of voice items to return (defaults to 50).',
        },
      },
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 30_000,
    isConcurrencySafe: () => true,
    async execute(args = {}) {
      const { voices, categories, emotionReferences, catalogPath } = getVoiceCatalog()
      let filtered = voices
      if (args.category) {
        const catKw = String(args.category).toLowerCase()
        filtered = filtered.filter((v) => String(v.category || '').toLowerCase().includes(catKw))
      }
      if (args.ageGroup) {
        filtered = filtered.filter((v) => v.ageGroup === args.ageGroup)
      }
      if (args.gender) {
        filtered = filtered.filter((v) => v.gender === args.gender)
      }
      if (args.tag) {
        const kw = String(args.tag).toLowerCase()
        filtered = filtered.filter(
          (v) =>
            v.name.toLowerCase().includes(kw) ||
            String(v.category || '').toLowerCase().includes(kw) ||
            (v.tags || []).some((t) => String(t).toLowerCase().includes(kw)),
        )
      }
      const maxItems = Number(args.limit) > 0 ? Number(args.limit) : 50
      return {
        totalCatalogVoices: voices.length,
        matchedCount: filtered.length,
        categories,
        voices: filtered.slice(0, maxItems),
        availableEmotions: Object.keys(emotionReferences),
        catalogPath,
      }
    },
  })

  // Tool 2: import_voice_pack
  ctx.tools.register({
    name: 'import_voice_pack',
    description:
      'Import a custom voice pack (.wav, .mp3, .flac, .pt file, directory, or .zip archive with manifest.json/voices.json) into the local Voice Pack Catalog so AI can auto-match it or the user can select it.',
    parameters: {
      type: 'object',
      properties: {
        sourcePath: {
          type: 'string',
          description: 'Path to the .wav/.mp3/.pt audio file, voice pack directory, or .zip archive.',
        },
        id: {
          type: 'string',
          description: 'Optional unique voice ID (e.g. my-narrator-voice).',
        },
        name: {
          type: 'string',
          description: 'Display name of the voice or voice pack (e.g. 浑厚纪录片男声).',
        },
        gender: {
          type: 'string',
          enum: ['male', 'female', 'neutral'],
          description: 'Voice gender for AI role/character matching.',
        },
        engine: {
          type: 'string',
          enum: ['indextts25', 'indextts2', 'gptvoice'],
          description: 'Target local TTS engine for this voice (defaults to indextts25).',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Style & domain tags used by AI auto-matching (e.g. ["纪录片", "深沉", "历史"]).',
        },
        promptText: {
          type: 'string',
          description: 'Reference transcript corresponding to the reference audio clip.',
        },
      },
      required: ['sourcePath'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await importVoicePack(args)
    },
  })

  // Tool 3: match_scene_voices
  ctx.tools.register({
    name: 'match_scene_voices',
    description:
      'Automatically match suitable voices from the Voice Pack Catalog for all scenes in `script.json` based on scene emotion, role, narration, and audience/goal, or lock a user-specified voice ID.',
    parameters: {
      type: 'object',
      properties: {
        scriptPath: {
          type: 'string',
          description: 'Path to project directory or script.json.',
        },
        voiceId: {
          type: 'string',
          description: 'Pass "auto" for AI automatic voice matching, or a specific voiceId to lock that voice.',
        },
        forceAuto: {
          type: 'boolean',
          description: 'If true, re-run AI voice matching even on previously locked scenes.',
        },
      },
      required: ['scriptPath'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return matchAllScenesInScript(args.scriptPath, {
        voiceId: args.voiceId || 'auto',
        forceAuto: Boolean(args.forceAuto),
      })
    },
  })

  // Tool 4: generate_speech
  ctx.tools.register({
    name: 'generate_speech',
    description:
      'Synthesize speech audio (WAV) using local IndexTTS-2.5 or GPTvoice-tts (supporting AI auto-matched voice `voiceId: "auto"` or user-specified `voiceId`), measure exact duration via `ffprobe`, compute `durationInFrames = Math.ceil(durationSec * fps)`, and write back to `script.json`.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Narration text to synthesize into speech.',
        },
        emotion: {
          type: 'string',
          description: 'Emotion label or description (e.g. 平静, 高兴, 伤心, 生气, 害怕, 激昂).',
        },
        lang: {
          type: 'string',
          description: 'Optional language code for IndexTTS-2.5 (ZH, EN, JA, ES, AR; auto-detected when omitted).',
        },
        durationFactor: {
          type: 'number',
          description: 'Optional IndexTTS-2.5 speech duration scaling factor (0.5 to 2.0, default 1.0).',
        },
        outputPath: {
          type: 'string',
          description: 'Output WAV file path (e.g. ./audio/scene-01.wav).',
        },
        fps: {
          type: 'number',
          description: 'Video frame rate (e.g. 30 or 60) used to calculate durationInFrames.',
        },
        voiceId: {
          type: 'string',
          description: 'Voice ID from `list_voices`, or "auto" to let AI match the best voice for the scene.',
        },
        engine: {
          type: 'string',
          enum: ['indextts25', 'indextts2', 'gptvoice'],
          description: 'Local TTS engine to use (defaults to indextts25).',
        },
        scriptPath: {
          type: 'string',
          description: 'Optional path to `script.json` (or project root) to automatically backfill durationSec & durationInFrames.',
        },
        sceneId: {
          type: 'string',
          description: 'Optional scene ID in `script.json` (e.g. "scene-01") to backfill.',
        },
      },
      required: ['text', 'outputPath'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 180_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await executeGenerateSpeech(args)
    },
  })
}

export default { name, inject, apply }
