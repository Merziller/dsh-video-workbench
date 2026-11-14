/**
 * AI Storyboard & Production Director
 * Turns user topic + imported assets (`assets.json`) into a complete multi-scene `script.json`
 * with narration copy, Ken Burns camera motion, transitions, VFX, SFX cues, BGM, and voice matching,
 * then generates both HTML5 & Remotion source code.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readScriptJson, writeScriptJson } from '@dsh-video/shared'
import { matchAllScenesInScript } from '@dsh-video/tool-local-tts'
import { importAssets, readAssets } from './asset-manager.js'
import { buildRichHtmlVideo, resolvePalette } from './html-generator.js'
import { writeRemotionProjectFiles } from './remotion-generator.js'
import { ensureProjectAudioAssets } from './audio-synth.js'

const TRANSITIONS = ['crossfade', 'wipe-left', 'slide-up', 'zoom-cut']
const MOTIONS = ['zoom-in', 'pan-left', 'zoom-out', 'pan-right']

const STYLE_CONFIG = {
  tech: { label: '科技产品', emotion: '平静', mood: 'tech', role: 'host' },
  cinematic: { label: '电影感宣传片', emotion: '激昂', mood: 'cinematic', role: 'storyteller' },
  documentary: { label: '人文纪录片', emotion: '深沉', mood: 'cinematic', role: 'narrator' },
  energetic: { label: '潮流短视频', emotion: '高兴', mood: 'energetic', role: 'host' },
  warm: { label: '温暖叙事', emotion: '温柔', mood: 'warm', role: 'storyteller' },
}

function cleanAssetTitle(name) {
  return String(name || '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\d+[\s._-]*/, '')
    .trim()
}

export function syncProjectCodeFromScript(projectDir, scriptData) {
  const absDir = resolve(projectDir)
  writeFileSync(join(absDir, 'index.html'), buildRichHtmlVideo(scriptData), 'utf8')
  writeRemotionProjectFiles(absDir, scriptData)
}

/**
 * Plan a complete video storyboard from imported assets + prompt/topic.
 */
export async function planVideoFromAssets(options = {}) {
  const {
    projectDir,
    sources,
    title,
    topic = '',
    style = 'tech',
    engine = 'html',
    voiceId = 'auto',
    audience = '大众与创作者',
    goal = '呈现有文案、画面、动效、音效、配乐、配音与字幕的完整成片',
  } = options

  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)

  if (sources && (Array.isArray(sources) ? sources.length > 0 : true)) {
    await importAssets({ projectDir: absDir, sources })
  }

  let existing = {}
  if (existsSync(join(absDir, 'script.json'))) {
    try {
      existing = readScriptJson(absDir).data
    } catch {}
  }

  const assets = readAssets(absDir)
  const visuals = (assets.items || []).filter((it) => it.type === 'image' || it.type === 'video')
  const importedMusic = (assets.items || []).filter((it) => it.role === 'music')
  const importedSfx = (assets.items || []).filter((it) => it.role === 'sfx')
  const notesText = (assets.notes || []).map((n) => n.text).join('\n').trim()

  const st = STYLE_CONFIG[style] || STYLE_CONFIG.tech
  const projectTitle = title || existing.title || topic || 'AI 视听作品演示'
  const coreTopic = topic || projectTitle
  const fps = Number(existing.fps) || 30

  // Split imported notes into sentence chunks if user provided a script/note file
  const noteChunks = notesText
    ? notesText
        .split(/[。\n！？!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 6)
    : []

  // Determine scene count (3..6) based on imported visuals
  const sceneCount = visuals.length >= 5 ? Math.min(6, visuals.length) : Math.max(3, visuals.length || 3)

  // Distribute visuals across scenes so every imported visual gets showcased
  const buckets = Array.from({ length: sceneCount }, () => [])
  visuals.forEach((v, i) => {
    buckets[i % sceneCount].push(v)
  })

  const scenes = []
  for (let i = 0; i < sceneCount; i++) {
    const isFirst = i === 0
    const isLast = i === sceneCount - 1
    const bucket = buckets[i]
    const primary = bucket[0]
    const secondary = bucket[1]
    const mediaArr = bucket.slice(0, 2).map((m, mi) => ({
      assetId: m.id,
      path: m.path,
      webPath: m.webPath || '',
      type: m.type,
      motion: MOTIONS[(i + mi) % MOTIONS.length],
      trimStartSec: 0,
    }))

    const assetLabel = primary ? cleanAssetTitle(primary.name) : ''
    let sceneTitle = ''
    let narration = ''
    let layout = primary ? (i % 2 === 1 ? 'split-showcase' : 'hero-media') : 'kinetic-title'
    let tag = st.label
    let highlights = []
    let metrics = []

    if (isFirst) {
      sceneTitle = assetLabel ? `${projectTitle} · ${assetLabel}` : projectTitle
      narration =
        noteChunks[0] ||
        `欢迎来到${coreTopic}。今天我们通过精心编排的画面、动态视觉特效与真实配音，带你开启一段沉浸式的视听之旅。`
      tag = '震撼开场'
      highlights = [st.label, '音画同步', '全自动制作']
      if (visuals.length > 0) metrics = [{ value: visuals.length, suffix: ' 组', label: '实景与视觉素材' }]
    } else if (isLast) {
      sceneTitle = assetLabel ? `圆满呈现 · ${assetLabel}` : `即刻开启 · ${coreTopic}`
      narration =
        noteChunks[i] ||
        `从素材精选到多轨配乐混音，每一帧都精准打磨。感谢观看${coreTopic}，期待与你一起创造更多精彩作品。`
      tag = '压轴收尾'
      highlights = ['H.264 高清成片', '多轨混音', '帧级对齐']
      metrics = [{ value: 100, suffix: '%', label: '声画同步率' }]
    } else {
      sceneTitle = assetLabel || `${coreTopic} · 核心亮点 ${i}`
      narration =
        noteChunks[i] ||
        (assetLabel
          ? `在${assetLabel}这一幕中，细腻的运镜配合动态光影与背景配乐，将核心细节与氛围感立体呈现出来。`
          : `通过多层次排版、动态指标卡与转场音效的紧密配合，让关键信息在几秒内清晰直达观众视野。`)
      tag = primary?.type === 'video' ? '实拍视频' : primary ? '精选画面' : `篇章 0${i + 1}`
      highlights = [
        primary?.type === 'video' ? '视频片段运镜' : primary ? 'Ken Burns 动效' : '动态排版',
        '粒子光效',
        '同步字幕',
      ]
    }

    const sfxPick = (kind) => importedSfx.find((x) => x.name.toLowerCase().includes(kind))?.path || `audio/sfx/${kind}.wav`
    const sfxCues = []
    if (i > 0) sfxCues.push({ type: 'whoosh', path: sfxPick('whoosh'), offsetSec: 0, volume: 0.48 })
    if (isFirst || isLast) {
      sfxCues.push({ type: isLast ? 'chime' : 'impact', path: sfxPick(isLast ? 'chime' : 'impact'), offsetSec: 0.15, volume: 0.45 })
    } else {
      sfxCues.push({ type: 'pop', path: sfxPick('pop'), offsetSec: 0.35, volume: 0.35 })
    }

    const estDur = Math.max(4.0, Number((narration.length / 4.2 + 1.1).toFixed(2)))
    scenes.push({
      id: `scene-${String(i + 1).padStart(2, '0')}`,
      title: sceneTitle,
      narration,
      subtitleLine: primary ? `${primary.originalName} · ${primary.orientation || '高清'}素材` : `${st.label}视觉编排`,
      emotion: isFirst || isLast ? '高兴' : st.emotion,
      role: st.role,
      voiceId: voiceId || 'auto',
      tag,
      layout,
      transition: TRANSITIONS[i % TRANSITIONS.length],
      kenBurns: MOTIONS[i % MOTIONS.length],
      highlights,
      metrics,
      media: mediaArr,
      sfxCues,
      visualPrompt: primary ? `展示用户素材 ${primary.path}，配合 ${MOTIONS[i % MOTIONS.length]} 运镜与光效。` : `动态视觉排版与粒子背景`,
      durationSec: estDur,
    })
  }

  const nextScript = {
    ...existing,
    title: projectTitle,
    topic: coreTopic,
    style,
    engine: engine === 'remotion' ? 'remotion' : 'html',
    fps,
    width: Number(existing.width) || 1920,
    height: Number(existing.height) || 1080,
    audience,
    goal,
    voiceMode: voiceId && voiceId !== 'auto' ? 'manual' : 'auto',
    defaultVoiceId: voiceId || 'auto',
    theme: resolvePalette({ style }),
    bgm: {
      enabled: true,
      mood: st.mood,
      volume: 0.22,
      path: importedMusic[0]?.path || '',
      source: importedMusic.length > 0 ? 'user-imported' : 'generated',
    },
    scenes,
  }

  const saved = writeScriptJson(absDir, nextScript)
  await ensureProjectAudioAssets(absDir, saved.data, assets)
  matchAllScenesInScript(absDir, { voiceId: voiceId || 'auto', forceAuto: voiceId === 'auto' })
  const reloaded = readScriptJson(absDir).data
  syncProjectCodeFromScript(absDir, reloaded)

  return {
    ok: true,
    projectDir: absDir,
    engine: reloaded.engine,
    sceneCount: reloaded.scenes?.length || 0,
    assetsUsed: visuals.length,
    visualsUsed: visuals.length,
    importedMusic: importedMusic.length,
    importedSfx: importedSfx.length,
    sfxCount: (reloaded.scenes || []).reduce((n, s) => n + (Array.isArray(s.sfxCues) ? s.sfxCues.length : 0), 0),
    script: reloaded,
  }
}
