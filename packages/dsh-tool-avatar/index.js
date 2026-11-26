import {
  AVATAR_TEMPLATES,
  buildTimelineAlignedVoiceWav,
  executeGenerateAvatar,
  extractAudioRmsEnvelope,
  getAvatarProviderSummary,
  normalizeLipSyncMode,
  probeVideoStream,
  resolveSafeAvatarLayout,
  saveAvatarConfig,
} from './avatar-engine.js'
import {
  getLipsyncStatus,
  LIPSYNC_ENGINE_IDS,
  LipsyncUnavailableError,
  resolveLipsyncConfig,
  runLipsync,
} from './lipsync-engine.js'
import { getLipsyncHardwareGate, getLipsyncInstallerCatalog, installLipsyncEngine } from './lipsync-installer.js'
import { registerTool } from '../shared/index.js'

export {
  AVATAR_TEMPLATES,
  buildTimelineAlignedVoiceWav,
  executeGenerateAvatar,
  extractAudioRmsEnvelope,
  getAvatarProviderSummary,
  getLipsyncHardwareGate,
  getLipsyncInstallerCatalog,
  getLipsyncStatus,
  installLipsyncEngine,
  LIPSYNC_ENGINE_IDS,
  LipsyncUnavailableError,
  normalizeLipSyncMode,
  probeVideoStream,
  resolveLipsyncConfig,
  resolveSafeAvatarLayout,
  runLipsync,
  saveAvatarConfig,
}

export const name = 'dsh-tool-avatar'
export const inject = ['tools']

export function apply(ctx) {
  registerTool(ctx, {
    name: 'generate_avatar',
    description:
      'Generate a transparent alpha-channel (yuva420p .webm) AI digital human or cloned human spokesperson overlay video clip, and mount avatarClip + avatarLayout (fullscreen / pip-bl / pip-br) into script.json for transparent compositing in both Remotion and the HTML5 motion engine. In cloned-human mode the recorded person video (or portrait photo) is lip-synced to the (voice-cloned) narration by the configured engine (AVATAR_LIPSYNC_ENGINE: local MuseTalk 1.5, LatentSync/CLI or fal.ai), aligned to the project timeline, with automatic fallback to the non-lip-sync compositor when no engine is available.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Absolute or relative path to the video project directory.',
        },
        sceneId: {
          type: 'string',
          description: 'Optional scene ID to mount the avatar onto (omit to mount as a project-wide spokesperson overlay).',
        },
        avatarMode: {
          type: 'string',
          enum: ['ai-human', 'cloned-human'],
          description: 'Use "cloned-human" to drive uploaded/recorded human base video with IndexTTS-2.5 cloned voice, or "ai-human" for a built-in AI presenter.',
        },
        sourceVideoPath: {
          type: 'string',
          description: 'Uploaded or webcam-recorded human base video path (relative to projectDir or absolute) for cloned-human mode.',
        },
        sourceImagePath: {
          type: 'string',
          description: 'Portrait photo path for cloned-human talking head when no video clip is provided.',
        },
        voiceId: {
          type: 'string',
          description: 'Voice ID from IndexTTS-2.5 Voice Catalog, or "auto".',
        },
        voiceSamplePath: {
          type: 'string',
          description: 'Optional voice sample audio/video file path in Step 1 to clone before driving the avatar.',
        },
        narrationText: {
          type: 'string',
          description: 'Spoken script text to drive lip-sync speech when audioPath is not supplied.',
        },
        audioPath: {
          type: 'string',
          description: 'Optional pre-synthesized or mastered WAV audio path.',
        },
        avatarLayout: {
          type: 'string',
          enum: ['fullscreen', 'pip-bl', 'pip-br', 'off'],
          description: 'Compositing layout: fullscreen, pip-bl (bottom-left PiP), pip-br (bottom-right PiP), or off.',
        },
        presetId: {
          type: 'string',
          description: 'Built-in AI presenter template ID (cyber-anchor, editorial-mentor, studio-creator).',
        },
        chromaKeyColor: {
          type: 'string',
          description: 'Optional hex chroma-key background color (e.g. #00FF00) when matting green/blue screen human video.',
        },
        lipSync: {
          type: 'string',
          enum: ['auto', 'on', 'off'],
          description: 'Real mouth lip-sync for cloned-human mode: auto (default; use the configured engine, fall back to the non-lip-sync overlay if unavailable), on (fail instead of falling back), off.',
        },
        lipsyncEngine: {
          type: 'string',
          enum: ['auto', 'musetalk', 'latentsync', 'cli', 'cloud-fal', 'off'],
          description: 'Optional per-call override of AVATAR_LIPSYNC_ENGINE.',
        },
        alignToTimeline: {
          type: 'string',
          enum: ['auto', 'true', 'false'],
          description: 'Drive the mouth with the narration placed exactly where master-audio.wav places it (project-wide overlays). Default auto.',
        },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 1_800_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return executeGenerateAvatar(args)
    },
  })

  registerTool(ctx, {
    name: 'manage_anime_presenter',
    description:
      '「我的动漫形象」 — reusable anime presenter characters that talk with the user\'s own voice in 口播剪辑 / 录屏讲解 (use one via rough_cut_talking_head pack.mascot { characterId, engine }). Actions: list (library + which engines this computer can use), get (one character: face marks, sprites, provider avatars), create (from an image path: kind photo = the user\'s photo drawn as an anime likeness by their own cloud image service — stylize cloud, PAID per picture, pass confirmedCost true only after the user agreed to the shown estimate — or by the optional local model, stylize local; kind cartoon = a cartoon picture used as it is, plain or transparent background), update (name, face marks { mouth, eyes[2] } as 0..1 of the portrait, mouthOriginal open|closed), delete (to the library recycle folder), engines, estimate (cost of one presenter clip for engine + durationSec, optional mode and id; sprite / tha3 are free; vidu / volc / runway are billed per second by the user\'s own provider account — with id, a 火山引擎 形象 that already exists for the character is not counted again). Cloud keys (Vidu / 火山引擎 / Runway) are entered by the user in the studio panel 「云端动漫数字人 · 密钥」, never through this tool. No call spends money without an explicit confirmation flag.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete', 'engines', 'estimate'] },
        id: { type: 'string', description: 'Character id (c-…) for get / update / delete.' },
        imagePath: { type: 'string', description: 'create: absolute path of the photo / cartoon picture.' },
        kind: { type: 'string', enum: ['photo', 'cartoon'], description: 'create: a photo of a real person (needs stylize) or a cartoon picture.' },
        stylize: { type: 'string', enum: ['cloud', 'local', 'none'], description: 'create: how a photo becomes an anime likeness.' },
        style: { type: 'string', enum: ['anime', 'cartoon3d', 'chibi', 'flat'], description: 'create: drawing style (default anime).' },
        extraPrompt: { type: 'string', description: 'create (cloud): extra wishes, e.g. 穿蓝色西装、戴眼镜.' },
        confirmedCost: { type: 'boolean', description: 'create with stylize cloud: true only after the user agreed to pay for one picture.' },
        name: { type: 'string', description: 'create / update: display name (≤ 24 chars).' },
        face: { type: 'object', description: 'update: { mouth: {x,y,w}, eyes: [{x,y,w},{x,y,w}] } normalised to the portrait.', additionalProperties: true },
        mouthOriginal: { type: 'string', enum: ['open', 'closed'], description: 'update: whether the picture\'s own mouth is open (then a closed mouth is drawn too).' },
        engine: { type: 'string', enum: ['sprite', 'tha3', 'runway', 'volc', 'vidu'], description: 'estimate: presenter engine.' },
        durationSec: { type: 'number', description: 'estimate: length of the cut in seconds.' },
        mode: { type: 'string', description: 'estimate: optional cloud engine mode (volc: loopy | normal | loopyb; vidu: 540p | 720p; default = the saved one).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true } },
    timeoutMs: 900_000,
    isConcurrencySafe: () => false,
    async execute(args = {}) {
      const lib = await import('./anime-character.js')
      const eng = await import('./anime-engines.js')
      const pub = (c) => {
        if (!c) return null
        const { dir, ...rest } = c
        void dir
        return { ...rest, engines: lib.characterEngines(rest) }
      }
      const action = String(args.action || 'list')
      if (action === 'list') return { ok: true, characters: lib.listCharacters(), engines: await eng.getPresenterEngines() }
      if (action === 'engines') return { ok: true, engines: await eng.getPresenterEngines() }
      if (action === 'estimate') return { ok: true, estimate: await eng.estimatePresenterCost({ engine: args.engine || 'sprite', durationSec: Number(args.durationSec) || 0, mode: args.mode || '', character: args.id ? lib.getCharacter(String(args.id)) : null }) }
      if (action === 'get') {
        const c = lib.getCharacter(String(args.id || ''))
        if (!c) return { ok: false, error: '这个动漫形象不存在' }
        return { ok: true, character: pub(c) }
      }
      if (action === 'create') {
        const c = await lib.createCharacter({
          name: args.name || '',
          sourceAbs: String(args.imagePath || ''),
          kind: args.kind === 'cartoon' ? 'cartoon' : 'photo',
          stylize: args.stylize,
          style: args.style || 'anime',
          extraPrompt: args.extraPrompt || '',
          confirmedCost: args.confirmedCost === true,
        })
        return { ok: true, character: pub(c), next: '请让用户确认嘴巴和眼睛的位置（update face），或直接在口播包装里使用（pack.mascot.characterId）。' }
      }
      if (action === 'update') return { ok: true, character: pub(await lib.updateCharacter(String(args.id || ''), { name: args.name, face: args.face, mouthOriginal: args.mouthOriginal })) }
      if (action === 'delete') {
        const r = await lib.deleteCharacter(String(args.id || ''))
        return { ok: true, deleted: !r.missing, note: r.missing ? '这个形象本来就不在了' : '已移到形象库的回收文件夹（.trash）' }
      }
      return { ok: false, error: `不认识的操作：${action}` }
    },
  })
}

export default { name, inject, apply }
