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

function extractChapterTitle(narration, fallback) {
  const raw = String(narration || '').trim()
  if (!raw) return fallback
  const first = raw.split(/[，。！？；,!?;：:\n]/)[0].trim()
  if (!first) return fallback
  return first.length > 16 ? first.slice(0, 16) : first
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

    let sceneTitle = ''
    let narration = ''
    let layout = primary ? (bucket.length >= 2 ? 'split-showcase' : 'hero-media') : 'kinetic-title'
    let tag = st.label
    let highlights = []
    let metrics = []
    let subtitleLine = ''

    if (isFirst) {
      sceneTitle = projectTitle
      narration =
        noteChunks[0] ||
        `欢迎来到${coreTopic}。今天我们通过精心编排的画面、细腻节奏与真挚旁白，带你开启一段沉浸式的视听之旅。`
      tag = st.label
      subtitleLine = topic && topic.length <= 36 ? topic : ''
      if (!primary) {
        highlights = [st.label, '沉浸叙事']
      }
    } else if (isLast) {
      narration =
        noteChunks[i] ||
        `感谢观看${coreTopic}，期待与你一起定格更多值得铭记的精彩瞬间。`
      sceneTitle = primary ? extractChapterTitle(narration, projectTitle) : projectTitle
      tag = '尾声'
      subtitleLine = ''
      if (!primary) {
        highlights = [coreTopic]
      }
    } else {
      narration =
        noteChunks[i] ||
        `随着镜头缓缓推进，光影与声音交织展开，将这一刻的细节与氛围真实地呈现在眼前。`
      sceneTitle = primary ? extractChapterTitle(narration, `篇章 ${String(i + 1).padStart(2, '0')}`) : `${coreTopic} · 亮点 ${i}`
      tag = `第 ${i + 1} 幕`
      subtitleLine = ''
      if (!primary) {
        highlights = [st.label, '核心看点']
      }
    }

    const sfxPick = (kind) => importedSfx.find((x) => x.name.toLowerCase().includes(kind))?.path || `audio/sfx/${kind}.wav`
    const sfxCues = []
    if (i > 0) sfxCues.push({ type: 'whoosh', path: sfxPick('whoosh'), offsetSec: 0, volume: 0.45 })
    if (isFirst || isLast) {
      sfxCues.push({ type: isLast ? 'chime' : 'impact', path: sfxPick(isLast ? 'chime' : 'impact'), offsetSec: 0.15, volume: 0.42 })
    } else {
      sfxCues.push({ type: 'pop', path: sfxPick('pop'), offsetSec: 0.35, volume: 0.32 })
    }

    const estDur = Math.max(4.0, Number((narration.length / 4.2 + 1.1).toFixed(2)))
    scenes.push({
      id: `scene-${String(i + 1).padStart(2, '0')}`,
      title: sceneTitle,
      narration,
      subtitleLine,
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
      visualPrompt: primary ? `展示画面 ${primary.path}，配合 ${MOTIONS[i % MOTIONS.length]} 运镜与转场。` : `动态视觉排版与光影背景`,
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
