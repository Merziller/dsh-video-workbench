/**
 * Audio Synthesizer & Multi-Track Mixer
 * - Delegates 48kHz stereo synthesis & Schroeder stereo reverb to `./audio-dsp.js`
 * - Supports 24+ kinetic SFX types (`hit`, `whoosh`, `swoosh`, `glitch`, `pop`, `thud`, `card`, `sparkle`, `chime`, `riser`, `sub_drop`, `crash_cym`, `suck`, `counter`, `typing`, `stamp`, etc.)
 * - Generates beat-locked multi-instrument BGM (drums, analog bass, stereo pad, FM e-piano, arp pluck)
 * - Mixes Voice Narration + Procedural Reverb SFX Bus + User Custom SFX + Sidechain-Ducked BGM via FFmpeg into `output/master-audio.wav`
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { probeAudioDuration, resolveBinaries, runCommandRedirected } from '@dsh-video/shared'
import {
  buildBeatGrid,
  DSP_SR,
  encodeStereoWav,
  renderBgmWavBuffer,
  renderSfxMasterBuffer,
  synthSfxStereo,
} from './audio-dsp.js'

const SR = DSP_SR

export { buildBeatGrid }

export function generateSfxWav(type, outPath, opts = {}) {
  mkdirSync(dirname(outPath), { recursive: true })
  const { L, R } = synthSfxStereo(type, opts)
  writeFileSync(outPath, encodeStereoWav(L, R, SR))
  return outPath
}

export function generateBgmWav({ durationSec = 20, mood = 'tech', bpm, audioSpec = null, outPath }) {
  mkdirSync(dirname(outPath), { recursive: true })
  const buf = renderBgmWavBuffer({ durationSec, mood, bpm, audioSpec })
  writeFileSync(outPath, buf)
  return outPath
}

const CORE_SFX_KINDS = [
  'hit',
  'whoosh',
  'swoosh',
  'glitch',
  'pop',
  'thud',
  'card',
  'slash',
  'sparkle',
  'chime',
  'shine',
  'counter',
  'typing',
  'riser',
  'suck',
  'sub_drop',
  'crash_cym',
  'stamp',
  'tick',
]

/**
 * Ensure SFX & BGM assets exist for a project (preferring user's imported files,
 * falling back to beat-matched 48kHz stereo DSP synthesis).
 */
export async function ensureProjectAudioAssets(projectDir, script, assetsManifest) {
  const absDir = resolve(projectDir)
  const sfxDir = join(absDir, 'audio', 'sfx')
  mkdirSync(sfxDir, { recursive: true })

  const builtinSfx = {}
  for (const kind of CORE_SFX_KINDS) {
    const p = join(sfxDir, `${kind}.wav`)
    if (!existsSync(p)) generateSfxWav(kind, p)
    builtinSfx[kind] = `audio/sfx/${kind}.wav`
  }

  const importedMusic = (assetsManifest?.items || []).filter((it) => it.role === 'music')
  const totalSec = Math.max(2, Number(script?.totalDurationSec) || 12)
  let bgmPath = script?.bgm?.path || ''
  let bgmSource = script?.bgm?.source || 'generated'

  if (!bgmPath || !existsSync(isAbsolute(bgmPath) ? bgmPath : join(absDir, bgmPath))) {
    if (importedMusic.length > 0) {
      bgmPath = importedMusic[0].path
      bgmSource = 'user-imported'
    } else {
      const mood = script?.audioSpec?.mood || script?.bgm?.mood || script?.style || 'tech'
      const bpm = script?.audioSpec?.bpm || script?.bgm?.bpm
      const genPath = join(absDir, 'audio', 'bgm-generated.wav')
      generateBgmWav({ durationSec: totalSec + 1.2, mood, bpm, audioSpec: script?.audioSpec || null, outPath: genPath })
      bgmPath = 'audio/bgm-generated.wav'
      bgmSource = script?.audioSpec ? 'ai-audio-spec' : 'generated'
    }
  }

  return { builtinSfx, bgmPath, bgmSource }
}

/**
 * Mix Voice Narration + Procedural Reverb SFX Bus + User Custom SFX + Sidechain-Ducked BGM into `output/master-audio.wav`.
 */
export async function mixVideoAudio({ projectDir, script, assetsManifest, outputPath }) {
  const absDir = resolve(projectDir)
  const outWav = outputPath ? resolve(absDir, outputPath) : join(absDir, 'output', 'master-audio.wav')
  mkdirSync(dirname(outWav), { recursive: true })

  const totalSec = Math.max(1, Number(script.totalDurationSec) || 10)
  const { builtinSfx, bgmPath, bgmSource } = await ensureProjectAudioAssets(absDir, script, assetsManifest)
  const { ffmpeg } = resolveBinaries()

  const voiceEvents = []
  const proceduralCues = []
  const customSfxEvents = []

  for (const scene of script.scenes || []) {
    const startSec = Number(scene.startSec || 0)
    const leadSec = Number.isFinite(Number(scene.voiceLeadSec)) ? Number(scene.voiceLeadSec) : 0.3
    if (scene.audioFile) {
      const absAudio = isAbsolute(scene.audioFile) ? scene.audioFile : resolve(absDir, scene.audioFile)
      if (existsSync(absAudio)) {
        voiceEvents.push({ path: absAudio, delayMs: Math.max(0, Math.round((startSec + leadSec) * 1000)) })
      }
    }

    const cues = Array.isArray(scene.sfxCues) ? scene.sfxCues : []
    for (const cue of cues) {
      const atSec = startSec + Math.max(0, Number(cue.offsetSec || 0))
      if (atSec >= totalSec) continue
      const volume = Number.isFinite(Number(cue.volume)) ? Number(cue.volume) : 0.55
      const pan = Number.isFinite(Number(cue.pan)) ? Number(cue.pan) : 0
      const type = cue.type || 'whoosh'

      // If user supplied a custom non-builtin file path, schedule via FFmpeg; otherwise render through shared DSP stereo reverb bus
      const isCustomPath =
        cue.path &&
        !String(cue.path).replace(/\\/g, '/').startsWith('audio/sfx/')
      const absCustom = isCustomPath ? (isAbsolute(cue.path) ? cue.path : resolve(absDir, cue.path)) : ''

      if (absCustom && existsSync(absCustom)) {
        customSfxEvents.push({
          path: absCustom,
          delayMs: Math.round(atSec * 1000),
          volume,
        })
      } else {
        proceduralCues.push({
          type,
          atSec,
          volume,
          pan,
          d: cue.d,
          freqStart: cue.freqStart,
          freqEnd: cue.freqEnd,
          durationMs: cue.durationMs,
          q: cue.q,
          wave: cue.wave,
          noiseMix: cue.noiseMix,
        })
      }
    }
  }

  let procSfxWav = ''
  if (proceduralCues.length > 0) {
    procSfxWav = join(absDir, 'audio', 'sfx-master.wav')
    mkdirSync(dirname(procSfxWav), { recursive: true })
    writeFileSync(procSfxWav, renderSfxMasterBuffer({ durationSec: totalSec, cues: proceduralCues }))
  }

  const absBgm = bgmPath ? (isAbsolute(bgmPath) ? bgmPath : resolve(absDir, bgmPath)) : ''
  const hasBgm = Boolean(absBgm && existsSync(absBgm)) && script?.bgm?.enabled !== false
  const bgmVol = Number.isFinite(Number(script?.bgm?.volume)) ? Number(script.bgm.volume) : 0.28

  const args = ['-y']
  const filters = []
  let idx = 0

  args.push('-f', 'lavfi', '-t', String(totalSec), '-i', `anullsrc=channel_layout=stereo:sample_rate=${SR}`)
  const baseIdx = idx++

  const voiceLabels = []
  for (const v of voiceEvents) {
    args.push('-i', v.path)
    const lbl = `v${idx}`
    filters.push(
      `[${idx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${v.delayMs}|${v.delayMs},volume=1.18[${lbl}]`,
    )
    voiceLabels.push(`[${lbl}]`)
    idx++
  }

  const sfxLabels = []
  if (procSfxWav && existsSync(procSfxWav)) {
    args.push('-i', procSfxWav)
    const lbl = `sxproc`
    filters.push(`[${idx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.82[${lbl}]`)
    sfxLabels.push(`[${lbl}]`)
    idx++
  }
  for (const s of customSfxEvents) {
    args.push('-i', s.path)
    const lbl = `sx${idx}`
    filters.push(
      `[${idx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${s.delayMs}|${s.delayMs},volume=${s.volume}[${lbl}]`,
    )
    sfxLabels.push(`[${lbl}]`)
    idx++
  }

  let bgmIdx = -1
  if (hasBgm) {
    args.push('-stream_loop', '-1', '-t', String(totalSec), '-i', absBgm)
    bgmIdx = idx++
    const fadeOutStart = Math.max(0, Number((totalSec - 1.5).toFixed(2)))
    filters.push(
      `[${bgmIdx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${bgmVol},afade=t=in:st=0:d=0.45,afade=t=out:st=${fadeOutStart}:d=1.5[bgm_raw]`,
    )
  }

  const mixInputs = [`[${baseIdx}:a]`]

  if (voiceLabels.length > 0) {
    if (voiceLabels.length === 1) {
      filters.push(`${voiceLabels[0]}apad,atrim=0:${totalSec}[voices]`)
    } else {
      filters.push(`${voiceLabels.join('')}amix=inputs=${voiceLabels.length}:normalize=0:duration=longest,apad,atrim=0:${totalSec}[voices]`)
    }
    if (hasBgm) {
      filters.push('[voices]asplit=2[v_out][v_sc]')
      mixInputs.push('[v_out]')
      filters.push('[bgm_raw][v_sc]sidechaincompress=threshold=0.02:ratio=6:attack=12:release=280[bgm_ducked]')
      mixInputs.push('[bgm_ducked]')
    } else {
      mixInputs.push('[voices]')
    }
  } else if (hasBgm) {
    mixInputs.push('[bgm_raw]')
  }

  if (sfxLabels.length > 0) {
    if (sfxLabels.length === 1) {
      filters.push(`${sfxLabels[0]}apad,atrim=0:${totalSec}[sfx]`)
    } else {
      filters.push(`${sfxLabels.join('')}amix=inputs=${sfxLabels.length}:normalize=0:duration=longest,apad,atrim=0:${totalSec}[sfx]`)
    }
    mixInputs.push('[sfx]')
  }

  filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0:duration=first,alimiter=limit=0.92[master]`)
  args.push('-filter_complex', filters.join(';'), '-map', '[master]', '-c:a', 'pcm_s16le', '-ar', String(SR), '-t', String(totalSec), outWav)

  const res = await runCommandRedirected(ffmpeg, args, { timeoutMs: 120_000 })
  if (res.code !== 0 || !existsSync(outWav)) {
    throw new Error(`Multi-track audio mix failed: ${res.stderr}`)
  }

  const probe = await probeAudioDuration(outWav, Number(script.fps) || 30)
  return {
    ok: true,
    outputPath: outWav,
    durationSec: probe.durationSec,
    voiceCount: voiceEvents.length,
    sfxCount: proceduralCues.length + customSfxEvents.length,
    bgmUsed: hasBgm ? bgmPath : '',
    bgmSource: hasBgm ? bgmSource : 'none',
    builtinSfxCount: Object.keys(builtinSfx).length,
  }
}
