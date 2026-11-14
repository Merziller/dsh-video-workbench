/**
 * AI Storyboard & Motion Choreography Director
 * Turns user topic + imported assets (`assets.json`) into a beat-locked, multi-scene `script.json`
 * featuring 6 .motion-grade layouts, choreographed transitions, layered Canvas VFX,
 * 6-8 stereo-panned SFX cues per scene, BPM-matched BGM, and real TTS voice matching.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readScriptJson, writeScriptJson } from '@dsh-video/shared'
import { matchAllScenesInScript } from '@dsh-video/tool-local-tts'
import { importAssets, readAssets } from './asset-manager.js'
import { buildRichHtmlVideo, resolvePalette } from './html-generator.js'
import { writeRemotionProjectFiles } from './remotion-generator.js'
import { buildBeatGrid, ensureProjectAudioAssets } from './audio-synth.js'

const TRANSITIONS = ['iris-circle', 'block-wipe', 'glitch-cut', 'zoom-punch', 'light-wipe']
const MOTIONS = ['zoom-in', 'pan-left', 'zoom-out', 'pan-right']
const VFX_MODES = ['3d-depth+sweep', 'sparks+shockwave', 'halftone+glitch', 'grid+scan', 'radial-speedlines']

const STYLE_CONFIG = {
  tech: { label: '科技前沿', emotion: '平静', mood: 'tech', bpm: 118, role: 'host' },
  cinematic: { label: '电影大片', emotion: '激昂', mood: 'cinematic', bpm: 104, role: 'storyteller' },
  documentary: { label: '纪实叙事', emotion: '深沉', mood: 'cinematic', bpm: 98, role: 'narrator' },
  energetic: { label: '高燃快剪', emotion: '高兴', mood: 'energetic', bpm: 124, role: 'host' },
  warm: { label: '温暖治愈', emotion: '温柔', mood: 'warm', bpm: 96, role: 'storyteller' },
}

function extractChapterTitle(narration, fallback) {
  const raw = String(narration || '').trim()
  if (!raw) return fallback
  const first = raw.split(/[，。！？；,!?;：:\n]/)[0].trim()
  if (!first) return fallback
  return first.length > 14 ? first.slice(0, 14) : first
}

function extractSemanticHighlights(text, fallbackTag, excludeTitle = '') {
  const cleanTitle = String(excludeTitle || '').trim()
  const clauses = String(text || '')
    .split(/[，。！？；、,!?;:\n]+/)
    .map((s) => s.trim().replace(/^[\d.\s、]+/, ''))
    .filter((s) => s.length >= 2 && s.length <= 14 && s !== cleanTitle)
  const uniq = []
  for (const c of clauses) {
    if (!uniq.includes(c)) uniq.push(c)
    if (uniq.length >= 3) break
  }
  const defaults = [fallbackTag, '声画同步', '节奏转场'].filter((x) => x && x !== cleanTitle)
  for (const d of defaults) {
    if (uniq.length >= 3) break
    if (!uniq.includes(d)) uniq.push(d)
  }
  return uniq
}

function ensureBeatGridOnScript(scriptData) {
  if (!scriptData || typeof scriptData !== 'object') return scriptData
  const mood = scriptData?.bgm?.mood || scriptData?.style || 'tech'
  const cfg = STYLE_CONFIG[scriptData?.style] || STYLE_CONFIG.tech
  const bpm = Number(scriptData?.bgm?.bpm) || cfg.bpm
  const totalSec = Math.max(
    4,
    Number(scriptData.totalDurationSec) ||
      (scriptData.scenes || []).reduce((acc, s) => acc + Number(s.durationSec || 4), 0),
  )
  const grid = buildBeatGrid(totalSec + 2, bpm)
  scriptData.bgm = {
    enabled: scriptData?.bgm?.enabled !== false,
    mood,
    volume: Number.isFinite(Number(scriptData?.bgm?.volume)) ? Number(scriptData.bgm.volume) : 0.28,
    path: scriptData?.bgm?.path || '',
    source: scriptData?.bgm?.source || 'generated',
    bpm: grid.bpm,
    beats: grid.beats,
  }
  return scriptData
}

export function syncProjectCodeFromScript(projectDir, scriptData) {
  const absDir = resolve(projectDir)
  const enriched = ensureBeatGridOnScript(scriptData)
  writeFileSync(join(absDir, 'index.html'), buildRichHtmlVideo(enriched), 'utf8')
  writeRemotionProjectFiles(absDir, enriched)
}

function buildSceneSfxCues({ idx, total, layout, dur, sfxPick }) {
  const cues = []
  if (idx === 0) {
    cues.push({ type: 'hit', path: sfxPick('hit'), offsetSec: 0, volume: 0.72, pan: 0 })
    cues.push({ type: 'crash_cym', path: sfxPick('crash_cym'), offsetSec: 0.02, volume: 0.42, pan: 0 })
  } else {
    cues.push({
      type: layout === 'mosaic-pulse-wall' || layout === 'radial-climax' ? 'sub_drop' : 'hit',
      path: sfxPick('hit'),
      offsetSec: 0,
      volume: 0.65,
      pan: 0,
    })
  }

  cues.push({ type: idx % 2 === 0 ? 'thud' : 'slash', path: sfxPick('thud'), offsetSec: 0.14, volume: 0.54, pan: -0.15 })

  if (layout === '3d-stage-opener' || layout === 'mosaic-pulse-wall') {
    cues.push({ type: 'whoosh', path: sfxPick('whoosh'), offsetSec: 0.32, volume: 0.52, pan: 0.2 })
    cues.push({ type: 'counter', path: sfxPick('counter'), offsetSec: 0.65, volume: 0.42, pan: 0, d: 0.75 })
    cues.push({ type: 'card', path: sfxPick('card'), offsetSec: 1.05, volume: 0.46, pan: -0.25 })
    cues.push({ type: 'card', path: sfxPick('card'), offsetSec: 1.32, volume: 0.46, pan: 0.25 })
  } else if (layout === 'media-split-motion' || layout === 'compare-dual') {
    cues.push({ type: 'card', path: sfxPick('card'), offsetSec: 0.42, volume: 0.5, pan: -0.28 })
    cues.push({ type: 'pop', path: sfxPick('pop'), offsetSec: 0.72, volume: 0.45, pan: 0.25 })
    cues.push({ type: 'pop', path: sfxPick('pop'), offsetSec: 0.96, volume: 0.45, pan: -0.2 })
    cues.push({ type: 'shine', path: sfxPick('shine'), offsetSec: Math.min(2.1, dur * 0.48), volume: 0.42, pan: 0.15 })
  } else if (layout === 'kinetic-impact') {
    cues.push({ type: 'glitch', path: sfxPick('glitch'), offsetSec: 0.28, volume: 0.5, pan: 0.1 })
    cues.push({ type: 'sparkle', path: sfxPick('sparkle'), offsetSec: 0.78, volume: 0.45, pan: -0.15 })
    cues.push({ type: 'typing', path: sfxPick('typing'), offsetSec: Math.min(1.6, dur * 0.4), volume: 0.36, pan: 0, d: 0.6 })
  } else {
    // radial-climax
    cues.push({ type: 'sparkle', path: sfxPick('sparkle'), offsetSec: 0.36, volume: 0.5, pan: 0 })
    cues.push({ type: 'stamp', path: sfxPick('stamp'), offsetSec: Math.min(1.4, dur * 0.36), volume: 0.55, pan: 0 })
    cues.push({ type: 'chime', path: sfxPick('chime'), offsetSec: Math.max(0.5, dur - 1.5), volume: 0.52, pan: 0.1 })
  }

  if (idx < total - 1) {
    const preTime = Math.max(0.6, Number((dur - 0.58).toFixed(2)))
    cues.push({ type: idx % 2 === 0 ? 'riser' : 'suck', path: sfxPick('riser'), offsetSec: preTime, volume: 0.48, pan: 0, d: 0.58 })
    cues.push({ type: 'swoosh', path: sfxPick('swoosh'), offsetSec: Math.max(0.4, Number((dur - 0.22).toFixed(2))), volume: 0.52, pan: 0 })
  }

  return cues
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
    fps: requestedFps,
    voiceId = 'auto',
    audience = '大众与创作者',
    goal = '呈现具备动态视觉排版、空间运镜、粒子光效、节拍音效、配乐与配音的完整成片',
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
  const projectTitle = title || existing.title || topic || 'AI 动效视听作品'
  const coreTopic = topic || projectTitle
  const fps = Number(requestedFps) || Number(existing.fps) || 30

  const noteChunks = notesText
    ? notesText
        .split(/[。\n！？!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 6)
    : []

  const sceneCount = visuals.length >= 5 ? Math.min(6, visuals.length) : Math.max(3, visuals.length || 4)

  const buckets = Array.from({ length: sceneCount }, () => [])
  visuals.forEach((v, i) => {
    buckets[i % sceneCount].push(v)
  })

  // Global media pool so mosaic-pulse-wall & 3d-stage-opener can orbit all uploaded media cleanly
  const globalMediaPool = visuals.map((m, mi) => ({
    assetId: m.id,
    path: m.path,
    webPath: m.webPath || '',
    type: m.type,
    motion: MOTIONS[mi % MOTIONS.length],
    trimStartSec: 0,
  }))

  const sfxPick = (kind) => importedSfx.find((x) => x.name.toLowerCase().includes(kind))?.path || `audio/sfx/${kind}.wav`

  const middleLayoutsWithMedia = ['media-split-motion', 'kinetic-impact', 'mosaic-pulse-wall', 'compare-dual']
  const middleLayoutsTextOnly = ['kinetic-impact', 'compare-dual', 'media-split-motion']

  const scenes = []
  let prevLayout = ''
  for (let i = 0; i < sceneCount; i++) {
    const isFirst = i === 0
    const isLast = i === sceneCount - 1
    const bucket = buckets[i]
    const primary = bucket[0]

    // Assign primary+secondary media from bucket, plus pool fallback for collage stages
    const mediaArr = bucket.slice(0, 4).map((m, mi) => ({
      assetId: m.id,
      path: m.path,
      webPath: m.webPath || '',
      type: m.type,
      motion: MOTIONS[(i + mi) % MOTIONS.length],
      trimStartSec: 0,
    }))

    let layout = 'kinetic-impact'
    if (isFirst) {
      layout = '3d-stage-opener'
    } else if (isLast) {
      layout = 'radial-climax'
    } else {
      const candidates = visuals.length > 0 ? middleLayoutsWithMedia : middleLayoutsTextOnly
      const pick = candidates[(i - 1) % candidates.length]
      layout = pick === prevLayout ? candidates[i % candidates.length] : pick
    }
    prevLayout = layout

    let sceneTitle = ''
    let narration = ''
    let tag = st.label
    let subtitleLine = ''

    if (isFirst) {
      sceneTitle = projectTitle
      narration =
        noteChunks[0] ||
        `${coreTopic}正式开启。随着光影、空间节奏与立体音效同步爆发，带你进入极具张力的视听体验。`
      tag = st.label
      subtitleLine = topic && topic.length <= 28 ? topic : ''
    } else if (isLast) {
      narration =
        noteChunks[i] ||
        `把每一份创意与画面瞬间定格成高品质成片，现在就开始属于你的节奏表达。`
      sceneTitle = extractChapterTitle(narration, projectTitle)
      tag = '高燃收尾'
    } else {
      narration =
        noteChunks[i] ||
        `透过动态镜头层次、弹性字效与细腻转场节拍，将画面质感与关键观点立体放大呈现。`
      sceneTitle = extractChapterTitle(narration, `高能篇章 ${String(i + 1).padStart(2, '0')}`)
      tag = `第 ${i + 1} 幕`
    }

    const highlights = extractSemanticHighlights(narration, tag, sceneTitle)
    const compareLeft = { label: '传统呈现', text: highlights[0] || '静态平铺画面' }
    const compareRight = { label: '动态重构', text: highlights[1] || '空间节拍联动' }

    const estDur = Math.max(4.2, Number((narration.length / 4.2 + 1.25).toFixed(2)))
    const sfxCues = buildSceneSfxCues({ idx: i, total: sceneCount, layout, dur: estDur, sfxPick })

    scenes.push({
      id: `scene-${String(i + 1).padStart(2, '0')}`,
      title: sceneTitle,
      narration,
      subtitleLine,
      emotion: isFirst || isLast ? '激昂' : st.emotion,
      role: st.role,
      voiceId: voiceId || 'auto',
      tag,
      layout,
      transition: TRANSITIONS[i % TRANSITIONS.length],
      kenBurns: MOTIONS[i % MOTIONS.length],
      vfx: VFX_MODES[i % VFX_MODES.length],
      highlights,
      compareLeft,
      compareRight,
      counterTarget: (i + 1) * 24,
      counterLabel: st.label,
      metrics: [],
      media: mediaArr,
      poolMedia: layout === '3d-stage-opener' || layout === 'mosaic-pulse-wall' ? globalMediaPool : undefined,
      sfxCues,
      visualPrompt: primary ? `${layout} 空间动态编排 · ${primary.path}` : `${layout} 动效排版与光影特效`,
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
      bpm: st.bpm,
      volume: 0.28,
      path: importedMusic[0]?.path || '',
      source: importedMusic.length > 0 ? 'user-imported' : 'generated',
    },
    scenes,
  }

  const saved = writeScriptJson(absDir, nextScript)
  ensureBeatGridOnScript(saved.data)
  writeScriptJson(absDir, saved.data)
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
