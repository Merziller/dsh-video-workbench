/**
 * Vlog 高光 (highlight reel) — turns a pile of the user's own clips into a short, music-cut film without any model call:
 *
 *   1. every library video is split into shots and measured (footage index: sharpness, exposure, steadiness, motion)
 *   2. the music (the user's uploaded track, else a generated one) is beat-tracked; the film is cut on the beats —
 *      longer shots where the music is calm, quicker cuts where it is loud and after a drop, never longer than ~4 s
 *   3. each cut gets the best unused shot that fits it: steady, sharp shots for calm passages, shots with movement for
 *      the loud ones; in story order (default) the film follows the recording order, so a trip still reads as a trip
 *   4. each clip window is played muted under the music with a slow zoom; an optional title opens the film
 *
 * The project is a talk-kit Remotion project (scene.presenter = the clip window) plus the HTML draft for the studio.
 * Everything runs locally (FFmpeg + the plugin's beat tracker): no model calls, no cost.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createAbortError, readScriptJson, writeScriptJson } from '../shared/index.js'
import { readAssets } from './asset-manager.js'
import { analyzeAudioBeatStructure, cutToMusicWindow, formatMusicClock } from './beat-analyzer.js'
import { indexFootage } from './footage-index.js'
import { safeProjectSnapshot } from './project-history.js'
import { writeTalkProjectCode } from './talk-edit.js'
import { TALK_PACK_PRESETS } from './talk-pack.js'

export const HIGHLIGHT_DEFAULTS = Object.freeze({
  order: 'story', // 'story' (recording order) | 'best' (best shots on the strongest music)
  minSec: 12,
  maxSec: 90,
  autoMaxSec: 60,
  minShotSec: 0.6,
  maxShotSec: 4.2,
  fps: 30,
})

const NOT_FOOTAGE_ROLES = new Set(['music', 'sfx', 'voice_clone', 'avatar_base'])
const r3 = (v) => Number(Number(v || 0).toFixed(3))
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))

/* ------------------------------------------------------------------------------------------------ pure planning */

/** A regular beat grid for films without a track to analyse (the generated music plays at this tempo). */
export function syntheticBeats(durationSec, bpm = 112) {
  const beatSec = 60 / bpm
  const beats = []
  for (let k = 0, t = 0; t < durationSec + beatSec; k++, t = k * beatSec) beats.push({ time: r3(t), strong: k % 4 === 0, isDrop: false, energy: k < 8 ? 0.45 : 0.7 })
  return { bpm, beatSec: r3(beatSec), beats, drops: [], durationSec }
}

/**
 * Cut points on the beats for a film of `targetSec`: `[{ startSec, endSec, energy, afterDrop }]`. Calm music gets
 * shots of 4 beats (8 at slow tempos), loud music and the bars after a drop 2 beats; every shot stays between
 * `minShotSec` and `maxShotSec`; the film opens on a slightly longer establishing shot.
 */
export function planHighlightCuts(beatMeta, targetSec, { minShotSec = HIGHLIGHT_DEFAULTS.minShotSec, maxShotSec = HIGHLIGHT_DEFAULTS.maxShotSec } = {}) {
  const beats = (Array.isArray(beatMeta?.beats) ? beatMeta.beats : []).map((b) => ({ time: Number(b.time), energy: Number.isFinite(Number(b.energy)) ? Number(b.energy) : 0.6, strong: Boolean(b.strong) })).filter((b) => Number.isFinite(b.time) && b.time >= 0)
  const bpm = Number(beatMeta?.bpm) || 112
  const beatSec = Number(beatMeta?.beatSec) || 60 / bpm
  const drops = (Array.isArray(beatMeta?.drops) ? beatMeta.drops : []).map((d) => Number(typeof d === 'object' ? d.time : d)).filter(Number.isFinite)
  const target = Math.max(1, Number(targetSec) || 0)
  if (beats.length < 2) {
    // no beat information at all: even 2.5 s shots
    const n = Math.max(1, Math.round(target / 2.5))
    return Array.from({ length: n }, (_, i) => ({ startSec: r3((i * target) / n), endSec: r3(((i + 1) * target) / n), energy: 0.6, afterDrop: false }))
  }
  // normalise the beat energies of this track to 0..1
  const es = beats.map((b) => b.energy)
  const lo = Math.min(...es)
  const hi = Math.max(...es)
  const energyAt = (t) => {
    let best = beats[0]
    for (const b of beats) {
      if (b.time > t) break
      best = b
    }
    return hi - lo > 1e-6 ? (best.energy - lo) / (hi - lo) : 0.6
  }
  const afterDrop = (t) => drops.some((d) => t >= d - 0.05 && t < d + beatSec * 16)
  const slow = bpm < 90
  const segs = []
  let i = 0
  while (i < beats.length && beats[i].time < target - minShotSec * 0.5) {
    const t0 = beats[i].time
    const e = energyAt(t0)
    const dropZone = afterDrop(t0)
    let n = segs.length === 0 ? (slow ? 4 : 8) : dropZone || e > 0.72 ? 2 : e < 0.35 ? (slow ? 4 : 8) : 4
    if (slow && n > 4) n = 4
    // keep the shot length inside the limits
    while (n > 1 && n * beatSec > maxShotSec) n = Math.max(1, Math.floor(n / 2))
    while (n * beatSec < minShotSec) n *= 2
    let j = Math.min(beats.length - 1, i + n)
    let t1 = beats[j].time
    if (j === i || t1 <= t0) break
    // the last shot ends exactly on the target
    if (target - t1 < minShotSec) t1 = target
    segs.push({ startSec: r3(t0), endSec: r3(Math.min(t1, target)), energy: r3(e), afterDrop: dropZone })
    if (t1 >= target) break
    i = j
  }
  if (segs.length && segs[segs.length - 1].endSec < target) segs[segs.length - 1].endSec = r3(target)
  if (segs.length && segs[0].startSec > 0) segs[0].startSec = 0
  return segs
}

/**
 * Choose a clip window for every cut. `clips` are indexed library videos (footage.shots). Story order walks the
 * recording order with a cursor (wrapping around when the film is longer than the footage); 'best' gives the strongest
 * music the best shots. A shot is used once until the library runs out; a window shorter than its cut runs on into the
 * same take where possible. Returns `[{ seg, clip, shot, inSec, outSec }]` (same order as `segs`).
 */
export function assignHighlightShots(segs, clips, { order = HIGHLIGHT_DEFAULTS.order } = {}) {
  const all = []
  clips.forEach((clip, ci) => {
    for (const s of clip.footage?.shots || []) {
      if ((Number(s.dur) || 0) < 0.45) continue
      all.push({ clip, ci, shot: s, key: `${clip.id}#${s.i}`, quality: Number(s.quality) || 0, motion: clamp01((Number(s.motion) || 0) / 0.45) })
    }
  })
  if (!all.length || !segs.length) return []
  // drop the poor shots unless the library is too small without them
  const good = all.filter((x) => x.quality >= 0.42)
  const pool = good.length >= Math.min(segs.length, 6) ? good : all.filter((x) => x.quality >= 0.25).length >= Math.min(segs.length, 3) ? all.filter((x) => x.quality >= 0.25) : all
  pool.sort((a, b) => a.ci - b.ci || a.shot.start - b.shot.start)
  const used = new Set()
  const uses = new Map() // times each shot was used (a re-used shot shows a different part of itself)
  const fitScore = (x, seg) => {
    const need = seg.endSec - seg.startSec
    const fits = x.shot.dur + 0.05 >= need ? 0.3 : -0.4 * (1 - x.shot.dur / need)
    const e = Number(seg.energy) || 0.5
    // a picture that never moves (a photo, a screen, a test card) is not "steady footage": no calm-music bonus, and it
    // only fits a short cut
    const isStill = x.shot.motion !== undefined && Number(x.shot.motion) < 0.03
    const still = isStill && need > 1.6 ? 0.35 : 0
    return x.quality + fits + 0.35 * (e * x.motion + (isStill ? 0 : (1 - e) * (1 - x.motion))) - still
  }
  // where a re-used shot starts: first use just after its cut, then spread over the shot (½, ¼, ¾, ⅛ … of the room)
  const vdc = (n) => {
    let v = 0
    let denom = 1
    while (n > 0) {
      denom *= 2
      v += (n % 2) / denom
      n = Math.floor(n / 2)
    }
    return v
  }
  const out = new Array(segs.length)
  const take = (x, seg, k) => {
    used.add(x.key)
    const n = uses.get(x.key) || 0
    uses.set(x.key, n + 1)
    const need = seg.endSec - seg.startSec
    const room = Math.max(0, x.shot.dur - need)
    // first use: just after the cut into the shot; later uses: another moment of it
    const inSec = r3(x.shot.start + (n === 0 ? Math.min(0.25, room / 2) : room * vdc(n)))
    let outSec = r3(Math.min(x.shot.end, inSec + need))
    // run on into the next piece of the same take when the shot is short
    if (outSec - inSec + 0.04 < need) {
      const shots = x.clip.footage.shots
      let idx = shots.indexOf(x.shot)
      while (outSec - inSec + 0.04 < need && idx + 1 < shots.length && shots[idx + 1].take === shots[idx].take && Math.abs(shots[idx + 1].start - shots[idx].end) < 0.12) {
        idx++
        used.add(`${x.clip.id}#${shots[idx].i}`)
        outSec = r3(Math.min(shots[idx].end, inSec + need))
      }
    }
    out[k] = { seg, clip: x.clip, shot: x.shot, inSec, outSec }
  }
  if (order === 'best') {
    const byEnergy = segs.map((seg, k) => ({ seg, k })).sort((a, b) => b.seg.energy - a.seg.energy || a.k - b.k)
    for (const { seg, k } of byEnergy) {
      let cands = pool.filter((x) => !used.has(x.key))
      if (!cands.length) {
        used.clear()
        cands = pool
      }
      const prevClip = k > 0 && out[k - 1] ? out[k - 1].clip.id : ''
      const best = cands.reduce((a, b) => (fitScore(b, seg) - (b.clip.id === prevClip ? 0.15 : 0) > fitScore(a, seg) - (a.clip.id === prevClip ? 0.15 : 0) ? b : a))
      take(best, seg, k)
    }
    return out
  }
  // story order: a cursor through the recording order; at each cut the best of the next few unused shots
  let cursor = 0
  const look = Math.max(3, Math.ceil(pool.length / Math.max(1, segs.length)) + 2)
  segs.forEach((seg, k) => {
    let window = []
    for (let step = 0; step < pool.length && window.length < look; step++) {
      const x = pool[(cursor + step) % pool.length]
      if (!used.has(x.key)) window.push({ x, pos: (cursor + step) % pool.length })
    }
    if (!window.length) {
      used.clear()
      window = pool.slice(0, look).map((x, pos) => ({ x, pos }))
    }
    const pick = window.reduce((a, b) => (fitScore(b.x, seg) > fitScore(a.x, seg) + 0.12 ? b : a))
    take(pick.x, seg, k)
    cursor = (pick.pos + 1) % pool.length
  })
  return out
}

/** Frame size: the orientation most of the clips have (or the one asked for). */
export function highlightDims(clips, aspect = 'auto') {
  if (aspect === '9:16') return { width: 1080, height: 1920 }
  if (aspect === '1:1') return { width: 1080, height: 1080 }
  if (aspect === '16:9') return { width: 1920, height: 1080 }
  let portrait = 0
  let landscape = 0
  for (const c of clips) {
    const w = Number(c.width) || 0
    const h = Number(c.height) || 0
    if (!w || !h) continue
    if (h > w) portrait += Number(c.durationSec) || 1
    else landscape += Number(c.durationSec) || 1
  }
  return portrait > landscape ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

/* ------------------------------------------------------------------------------------------------ project build */

const relOf = (absDir, p) => {
  const s = String(p || '').replace(/\\/g, '/')
  if (!isAbsolute(s)) return s.replace(/^\/+/, '')
  const base = absDir.replace(/\\/g, '/').replace(/\/+$/, '')
  return s.startsWith(base + '/') ? s.slice(base.length + 1) : s
}

/**
 * Build the Vlog 高光 project. Options: { musicAssetId (default: the first uploaded music), targetSec (0 = automatic,
 * up to 60 s or the music's length), order 'story' | 'best', aspect 'auto' | '16:9' | '9:16' | '1:1', title }.
 * Returns { ok, scenes, durationSec, bpm, clipsUsed, shotsUsed, music, script }.
 */
export async function buildHighlightProject({ projectDir, musicAssetId = '', targetSec = 0, order = HIGHLIGHT_DEFAULTS.order, aspect = 'auto', title = '', signal, onChild, onProgress } = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)
  const report = (progress, message) => onProgress?.({ progress, message })
  let manifest = readAssets(absDir)
  const isClip = (it) => it && it.type === 'video' && !NOT_FOOTAGE_ROLES.has(it.role) && (Number(it.durationSec) || 0) >= 1.2
  let clips = (manifest.items || []).filter(isClip)
  if (!clips.length) throw new Error('素材库里还没有视频片段：先在「素材」里上传几段 vlog 视频，再做高光剪辑。')
  const unindexed = clips.filter((it) => !(it.footage?.shots || []).length)
  if (unindexed.length) {
    report(8, `正在看懂 ${unindexed.length} 段视频：找出每个镜头，挑最清楚、最稳、最有动感的部分（本地，不花钱）...`)
    await indexFootage({ projectDir: absDir, assetIds: unindexed.map((it) => it.id), transcribe: 'off', signal, onChild, onProgress: (p) => report(10 + Math.round((Number(p.progress) || 0) * 0.5), p.message) })
    manifest = readAssets(absDir)
    clips = (manifest.items || []).filter(isClip).filter((it) => (it.footage?.shots || []).length)
  }
  if (signal?.aborted) throw createAbortError()
  if (!clips.length) throw new Error('视频片段都没能分析出可用的镜头（可能太短或已损坏）。')

  // the music: the chosen track, else the first uploaded one; without music the film gets generated music
  const musicItems = (manifest.items || []).filter((it) => it && (it.role === 'music' || it.type === 'audio') && it.role !== 'sfx' && it.role !== 'voice_clone')
  const music = (musicAssetId && musicItems.find((it) => it.id === musicAssetId)) || musicItems.find((it) => it.role === 'music') || null
  const musicAbs = music ? (isAbsolute(music.path) ? music.path : join(absDir, music.path)) : ''
  let beatMeta = null
  if (music && existsSync(musicAbs)) {
    report(62, `正在分析配乐「${music.name || '音乐'}」的节拍和高潮...`)
    try {
      beatMeta = await analyzeAudioBeatStructure(musicAbs, { signal })
    } catch (err) {
      if (signal?.aborted) throw err
      beatMeta = null
    }
  }
  const usable = clips.reduce((a, c) => a + (c.footage.shots || []).filter((s) => (Number(s.quality) || 0) >= 0.42).reduce((x, s) => x + Math.min(3, Number(s.dur) || 0), 0), 0)
  const musicSec = Number(beatMeta?.durationSec) || Number(music?.durationSec) || 0
  let target = Number(targetSec) > 0 ? Number(targetSec) : Math.min(HIGHLIGHT_DEFAULTS.autoMaxSec, Math.max(HIGHLIGHT_DEFAULTS.minSec, usable))
  target = Math.max(HIGHLIGHT_DEFAULTS.minSec * 0.5, Math.min(HIGHLIGHT_DEFAULTS.maxSec, target))
  if (musicSec > 0) target = Math.min(target, musicSec)
  let meta = beatMeta && Array.isArray(beatMeta.beats) && beatMeta.beats.length >= 4 ? beatMeta : syntheticBeats(target, 112)
  // 配乐从精彩处开始: a song clearly longer than the film starts at a well-chosen bar line (the user's 「从头开始」 pin on
  // this project is kept); the cuts are then planned on the beats in film time and the mixer starts the song there
  let musicWindow = null
  if (meta === beatMeta) {
    let startFrom = 'auto'
    try {
      if (existsSync(join(absDir, 'script.json'))) startFrom = readScriptJson(absDir).data?.bgm?.startFrom === 'head' ? 'head' : 'auto'
    } catch {}
    const musicCut = cutToMusicWindow(beatMeta, { filmSec: target, exactLength: true, musicOnly: true, startFrom, songPath: relOf(absDir, music.path) })
    meta = musicCut.meta
    musicWindow = { ...musicCut.window, startFrom }
    if (musicWindow.startSec > 0) report(66, musicWindow.note)
  }
  // end on a strong beat close to the target when there is one
  const strong = (meta.beats || []).filter((b) => b.strong && b.time >= target * 0.85 && b.time <= target + 0.01).map((b) => b.time)
  if (strong.length) target = strong[strong.length - 1]
  const segs = planHighlightCuts(meta, target)
  report(70, `按节拍切成 ${segs.length} 个镜头（${Math.round(meta.bpm || 112)} BPM），正在给每个镜头挑片段...`)
  const picks = assignHighlightShots(segs, clips, { order: order === 'best' ? 'best' : 'story' })
  if (!picks.length) throw new Error('没有挑出可用的片段。')

  const fps = HIGHLIGHT_DEFAULTS.fps
  const dims = highlightDims(clips, aspect)
  let frame = 0
  const scenes = picks.map((p, k) => {
    const startFrame = Math.round(p.seg.startSec * fps)
    const endFrame = k === picks.length - 1 ? Math.round(target * fps) : Math.round(p.seg.endSec * fps)
    const durationInFrames = Math.max(1, endFrame - startFrame)
    frame = endFrame
    const zoomIn = k % 2 === 0
    const sfxCues = p.seg.afterDrop && (k === 0 || !picks[k - 1].seg.afterDrop) ? [{ type: 'whoosh', volume: 0.32, leadSec: 0.12, offsetSec: 0, pan: 0, source: 'highlight' }] : []
    return {
      id: `hl-${String(k + 1).padStart(2, '0')}`,
      title: `${String(p.clip.name || p.clip.originalName || '片段').slice(0, 12)} · ${p.inSec.toFixed(1)}s`,
      narration: '',
      subtitleText: '',
      subtitles: [],
      startFrame,
      durationInFrames,
      durationSec: r3(durationInFrames / fps),
      voiceSource: 'none',
      voiceLocked: true,
      layout: 'presenter',
      presenter: {
        path: relOf(absDir, p.clip.editedPath || p.clip.path),
        startFrame: Math.round(p.inSec * fps),
        fit: 'cover',
        jumpZoom: false,
        kenBurns: zoomIn ? [1.0, 1.06] : [1.06, 1.0],
        durF: durationInFrames,
      },
      media: [{ assetId: p.clip.id, path: relOf(absDir, p.clip.editedPath || p.clip.path), type: 'video', trimStartSec: p.inSec, trimEndSec: p.outSec, trimAuto: true, footageShot: p.shot.i }],
      transition: 'cut',
      sfxCues,
      ambience: 'none',
      role: 'highlight',
      visualPrompt: '',
      energy: p.seg.energy,
    }
  })
  let prev = {}
  if (existsSync(join(absDir, 'script.json'))) {
    try {
      prev = readScriptJson(absDir).data || {}
    } catch {}
    safeProjectSnapshot(absDir, { label: 'highlight:before', stage: 'highlight', author: 'user', kind: 'checkpoint', note: '生成 Vlog 高光前的工程' })
  }
  const displayTitle = String(title || '').trim().slice(0, 20)
  const script = {
    ...Object.fromEntries(['brandKit', 'brandMark', 'aiBadgeEnabled', 'aiBadgePosition', 'aiBadgeText', 'endNotice', 'endNoticeCredit', 'targetPlatform'].filter((k) => prev[k] !== undefined).map((k) => [k, prev[k]])),
    title: displayTitle || prev.title || 'Vlog 高光',
    ...(displayTitle ? { displayTitle } : {}),
    productionType: 'highlight',
    engine: 'remotion',
    authoringMode: 'talk-kit',
    narrationMode: 'subtitle-mv',
    voiceSource: 'none',
    voiceMode: 'manual',
    fps,
    width: dims.width,
    height: dims.height,
    style: prev.style || 'energetic',
    subtitleStyle: 'talk',
    ambienceBed: false,
    bgmMode: music ? 'uploaded' : 'generated',
    bgm: music
      ? {
          enabled: true,
          path: relOf(absDir, music.path),
          uploadedPath: relOf(absDir, music.path),
          source: 'user-imported',
          volume: 1,
          bpm: Math.round(meta.bpm || 0),
          analyzed: Boolean(beatMeta),
          // where the song starts in the film (song seconds) — beatGrid below is already in film time
          ...(musicWindow ? { startSec: r3(musicWindow.startSec), startFor: relOf(absDir, music.path), songDurationSec: r3(musicSec), ...(musicWindow.startSec > 0 ? { startNote: musicWindow.note } : {}) } : {}),
          ...(musicWindow?.startFrom === 'head' ? { startFrom: 'head' } : {}),
        }
      : { enabled: true, mood: 'energetic', bpm: 112, volume: 0.95, source: 'generated' },
    beatGrid: { bpm: meta.bpm, beatSec: meta.beatSec, beats: (meta.beats || []).filter((b) => b.time <= target + 0.01).map((b) => r3(b.time)) },
    highlight: { order: order === 'best' ? 'best' : 'story', targetSec: r3(target), musicAssetId: music?.id || '', aspect, cuts: scenes.length, builtAt: new Date().toISOString() },
    // an opening title card (the talk kit's name strip), nothing else on top of the footage
    ...(displayTitle ? { talkPack: { preset: 'minimal', theme: TALK_PACK_PRESETS.minimal, keywords: [], chapters: [], broll: [], progressBar: false, lowerThird: { name: displayTitle }, captions: false, totalSec: r3(target) } } : {}),
    scenes,
  }
  // the user's own footage: the corner AI badge stays off unless switched on for this project
  if (script.aiBadgeEnabled === undefined) script.aiBadgeEnabled = false
  writeScriptJson(absDir, script)
  writeTalkProjectCode(absDir, readScriptJson(absDir).data)
  const clipsUsed = new Set(picks.map((p) => p.clip.id)).size
  const startLine = musicWindow?.startSec > 0 ? `（从 ${formatMusicClock(musicWindow.startSec)} 开始）` : ''
  report(100, `Vlog 高光工程已生成：${scenes.length} 个镜头 · ${Math.round(target)} 秒 · 用了 ${clipsUsed} 段素材${music ? ` · 配乐「${music.name || '音乐'}」${startLine}` : ' · 配乐自动生成'}`)
  return { ok: true, projectDir: absDir, scenes: scenes.length, durationSec: r3(target), bpm: Math.round(meta.bpm || 0), clipsUsed, shotsUsed: picks.length, music: music ? { id: music.id, name: music.name, startSec: r3(musicWindow?.startSec || 0) } : null, script: readScriptJson(absDir).data }
}
