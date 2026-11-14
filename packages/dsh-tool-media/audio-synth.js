/**
 * Audio Synthesizer & Multi-Track Mixer
 * - Generates clean 48kHz stereo WAV sound effects (whoosh, impact, pop, chime, riser)
 * - Generates mood-matched background music when user didn't import a music track
 * - Mixes Voice Narration + SFX Cues + Sidechain-Ducked BGM via FFmpeg into `output/master-audio.wav`
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { probeAudioDuration, resolveBinaries, runCommandRedirected } from '@dsh-video/shared'

const SR = 48000

function encodeStereoWav(samplesL, samplesR, sampleRate = SR) {
  const n = Math.min(samplesL.length, samplesR.length)
  const dataBytes = n * 4
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0, 4, 'ascii')
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8, 4, 'ascii')
  buf.write('fmt ', 12, 4, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(2, 22) // stereo
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 4, 28)
  buf.writeUInt16LE(4, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 4, 'ascii')
  buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, samplesL[i]))
    const r = Math.max(-1, Math.min(1, samplesR[i]))
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4)
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4)
  }
  return buf
}

// Deterministic PRNG for clean noise shaping
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateSfxWav(type, outPath) {
  mkdirSync(dirname(outPath), { recursive: true })
  const rand = mulberry32(1337 + type.length * 97)
  let dur = 0.65
  if (type === 'impact') dur = 1.1
  else if (type === 'pop') dur = 0.18
  else if (type === 'chime') dur = 1.8
  else if (type === 'riser') dur = 1.5

  const n = Math.floor(dur * SR)
  const L = new Float32Array(n)
  const R = new Float32Array(n)

  if (type === 'whoosh') {
    // Swept resonant low-pass pink noise + soft sub air
    let lpL = 0
    let lpR = 0
    let prev = 0
    for (let i = 0; i < n; i++) {
      const u = i / n
      const env = Math.sin(Math.PI * Math.pow(u, 0.72)) * Math.exp(-u * 1.1)
      const white = rand() * 2 - 1
      prev = 0.92 * prev + 0.08 * white
      const cutoff = 0.03 + 0.32 * Math.sin(Math.PI * u)
      lpL += cutoff * (prev * 2.2 - lpL)
      lpR += cutoff * ((white * 0.25 + prev * 1.9) - lpR)
      const panL = Math.cos(u * Math.PI * 0.5)
      const panR = Math.sin(u * Math.PI * 0.5)
      L[i] = lpL * env * (0.45 + 0.55 * panL) * 0.65
      R[i] = lpR * env * (0.45 + 0.55 * panR) * 0.65
    }
  } else if (type === 'impact') {
    let phase = 0
    for (let i = 0; i < n; i++) {
      const t = i / SR
      const freq = 38 + 115 * Math.exp(-t * 16)
      phase += (2 * Math.PI * freq) / SR
      const sub = Math.sin(phase) * Math.exp(-t * 3.6)
      const click = (rand() * 2 - 1) * Math.exp(-t * 48) * 0.45
      const s = (sub * 0.8 + click) * 0.75
      L[i] = s
      R[i] = s * 0.98
    }
  } else if (type === 'pop') {
    let phase = 0
    for (let i = 0; i < n; i++) {
      const t = i / SR
      const freq = 360 + 620 * (1 - Math.exp(-t * 38))
      phase += (2 * Math.PI * freq) / SR
      const env = Math.min(1, t / 0.004) * Math.exp(-t * 28)
      const s = (Math.sin(phase) + 0.25 * Math.sin(2 * phase)) * env * 0.55
      L[i] = s
      R[i] = s
    }
  } else if (type === 'chime') {
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66] // Cmaj9
    for (let i = 0; i < n; i++) {
      const t = i / SR
      let sL = 0
      let sR = 0
      for (let k = 0; k < notes.length; k++) {
        const dt = t - k * 0.055
        if (dt < 0) continue
        const env = Math.min(1, dt / 0.008) * Math.exp(-dt * (2.2 + k * 0.25))
        const f = notes[k]
        sL += Math.sin(2 * Math.PI * f * dt) * env * 0.18
        sR += Math.sin(2 * Math.PI * (f * 1.0025) * dt) * env * 0.18
      }
      L[i] = sL
      R[i] = sR
    }
  } else {
    // riser
    let lp = 0
    let p = 0
    for (let i = 0; i < n; i++) {
      const u = i / n
      const env = Math.pow(u, 1.8) * (u > 0.94 ? (1 - u) / 0.06 : 1)
      const w = rand() * 2 - 1
      lp += (0.02 + u * 0.28) * (w - lp)
      p += (2 * Math.PI * (140 + 420 * u * u)) / SR
      const s = (lp * 0.5 + Math.sin(p) * 0.25) * env * 0.55
      L[i] = s
      R[i] = s
    }
  }

  writeFileSync(outPath, encodeStereoWav(L, R, SR))
  return outPath
}

const CHORDS = {
  tech: [
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [130.81, 196.0, 246.94, 329.63], // Cmaj7
    [196.0, 246.94, 293.66, 329.63], // G6
  ],
  cinematic: [
    [146.83, 220.0, 261.63, 349.23], // Dm7
    [116.54, 174.61, 220.0, 293.66], // Bbmaj7
    [130.81, 196.0, 261.63, 329.63], // C
    [110.0, 164.81, 220.0, 277.18], // A
  ],
  warm: [
    [174.61, 220.0, 261.63, 329.63], // Fmaj7
    [196.0, 246.94, 293.66, 329.63], // G6
    [164.81, 196.0, 246.94, 293.66], // Em7
    [220.0, 261.63, 329.63, 392.0], // Am7
  ],
  energetic: [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [220.0, 261.63, 329.63, 392.0], // Am7
    [174.61, 220.0, 261.63, 349.23], // Fmaj7
    [196.0, 246.94, 293.66, 392.0], // G
  ],
}

export function generateBgmWav({ durationSec = 20, mood = 'tech', outPath }) {
  mkdirSync(dirname(outPath), { recursive: true })
  const dur = Math.max(2, Number(durationSec) || 20)
  const n = Math.floor(dur * SR)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const prog = CHORDS[mood] || CHORDS.tech
  const barSec = mood === 'energetic' ? 2.0 : 3.2
  const bpm = mood === 'energetic' ? 120 : mood === 'tech' ? 105 : 88
  const beatSec = 60 / bpm
  const rand = mulberry32(4242)

  // Low-pass filter state for warm mix-friendly pad
  let lpL = 0
  let lpR = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const chordIdx = Math.floor(t / barSec) % prog.length
    const nextIdx = (chordIdx + 1) % prog.length
    const barPos = (t % barSec) / barSec
    const blend = barPos > 0.85 ? (barPos - 0.85) / 0.15 : 0
    const cur = prog[chordIdx]
    const nxt = prog[nextIdx]

    let padL = 0
    let padR = 0
    for (let k = 0; k < cur.length; k++) {
      const f = cur[k] * (1 - blend) + nxt[k] * blend
      const warm = Math.sin(2 * Math.PI * f * t) + 0.15 * Math.sin(4 * Math.PI * f * t)
      const detune = Math.sin(2 * Math.PI * (f * 1.003) * t) + 0.15 * Math.sin(4 * Math.PI * (f * 1.003) * t)
      padL += warm * 0.11
      padR += detune * 0.11
    }

    // Gentle root sub pulse
    const beatPos = (t % beatSec) / beatSec
    const pulseEnv = Math.exp(-beatPos * 3.5)
    const bassFreq = cur[0] * 0.5
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * (0.14 + 0.1 * pulseEnv)

    // Soft rhythmic pluck arp
    const step = Math.floor(t / (beatSec / 2)) % cur.length
    const stepPos = (t % (beatSec / 2)) / (beatSec / 2)
    const arpEnv = Math.exp(-stepPos * 7.0)
    const arpFreq = cur[step] * 2
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * arpEnv * (mood === 'energetic' ? 0.12 : 0.065)

    // Very soft brushed hi-hat pulse for tech/energetic
    const hatEnv = mood === 'tech' || mood === 'energetic' ? Math.exp(-stepPos * 38) * 0.025 : 0
    const hat = (rand() * 2 - 1) * hatEnv

    const rawL = padL + bass + arp * 0.85 + hat
    const rawR = padR + bass + arp * 1.15 - hat
    lpL += 0.16 * (rawL - lpL)
    lpR += 0.16 * (rawR - lpR)

    const fadeIn = Math.min(1, t / 0.8)
    const fadeOut = Math.min(1, Math.max(0, (dur - t) / 1.8))
    const masterEnv = fadeIn * fadeOut * 0.68
    L[i] = lpL * masterEnv
    R[i] = lpR * masterEnv
  }

  writeFileSync(outPath, encodeStereoWav(L, R, SR))
  return outPath
}

/**
 * Ensure SFX & BGM assets exist for a project (preferring user's imported files,
 * falling back to procedural 48kHz stereo WAV synthesis).
 */
export async function ensureProjectAudioAssets(projectDir, script, assetsManifest) {
  const absDir = resolve(projectDir)
  const sfxDir = join(absDir, 'audio', 'sfx')
  mkdirSync(sfxDir, { recursive: true })

  const builtinSfx = {}
  for (const kind of ['whoosh', 'impact', 'pop', 'chime', 'riser']) {
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
      const mood = script?.bgm?.mood || script?.style || 'tech'
      const genPath = join(absDir, 'audio', 'bgm-generated.wav')
      generateBgmWav({ durationSec: totalSec + 1.0, mood, outPath: genPath })
      bgmPath = 'audio/bgm-generated.wav'
      bgmSource = 'generated'
    }
  }

  return { builtinSfx, bgmPath, bgmSource }
}

/**
 * Mix Voice Narration + SFX Cues + Sidechain-Ducked BGM into `output/master-audio.wav`.
 */
export async function mixVideoAudio({ projectDir, script, assetsManifest, outputPath }) {
  const absDir = resolve(projectDir)
  const outWav = outputPath ? resolve(absDir, outputPath) : join(absDir, 'output', 'master-audio.wav')
  mkdirSync(dirname(outWav), { recursive: true })

  const totalSec = Math.max(1, Number(script.totalDurationSec) || 10)
  const { builtinSfx, bgmPath, bgmSource } = await ensureProjectAudioAssets(absDir, script, assetsManifest)
  const { ffmpeg } = resolveBinaries()

  const voiceEvents = []
  const sfxEvents = []
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
      const relSfx = cue.path || builtinSfx[cue.type || 'whoosh'] || builtinSfx.whoosh
      const absSfx = isAbsolute(relSfx) ? relSfx : resolve(absDir, relSfx)
      if (existsSync(absSfx)) {
        const atSec = startSec + Math.max(0, Number(cue.offsetSec || 0))
        if (atSec < totalSec) {
          sfxEvents.push({
            path: absSfx,
            delayMs: Math.round(atSec * 1000),
            volume: Number.isFinite(Number(cue.volume)) ? Number(cue.volume) : 0.42,
          })
        }
      }
    }
  }

  const absBgm = bgmPath ? (isAbsolute(bgmPath) ? bgmPath : resolve(absDir, bgmPath)) : ''
  const hasBgm = Boolean(absBgm && existsSync(absBgm)) && script?.bgm?.enabled !== false
  const bgmVol = Number.isFinite(Number(script?.bgm?.volume)) ? Number(script.bgm.volume) : 0.22

  // Build FFmpeg filter graph:
  // [voiceSum] -> split into [vMain] & [vSidechain]
  // [bgmLoop] + [vSidechain] -> sidechaincompress (music automatically ducks under narration!)
  // ([vMain] + [sfxSum] + [bgmDucked]) -> amix -> alimiter
  const args = ['-y']
  const filters = []
  let idx = 0

  // Base silent canvas so output is ALWAYS exact totalSec stereo 48kHz
  args.push('-f', 'lavfi', '-t', String(totalSec), '-i', `anullsrc=channel_layout=stereo:sample_rate=${SR}`)
  const baseIdx = idx++

  const voiceLabels = []
  for (const v of voiceEvents) {
    args.push('-i', v.path)
    const lbl = `v${idx}`
    filters.push(
      `[${idx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${v.delayMs}|${v.delayMs},volume=1.12[${lbl}]`,
    )
    voiceLabels.push(`[${lbl}]`)
    idx++
  }

  const sfxLabels = []
  for (const s of sfxEvents) {
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
    const fadeOutStart = Math.max(0, Number((totalSec - 1.6).toFixed(2)))
    filters.push(
      `[${bgmIdx}:a]aresample=${SR},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${bgmVol},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOutStart}:d=1.6[bgm_raw]`,
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
      filters.push('[bgm_raw][v_sc]sidechaincompress=threshold=0.025:ratio=5:attack=15:release=320[bgm_ducked]')
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

  filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0:duration=first,alimiter=limit=0.95[master]`)

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
    sfxCount: sfxEvents.length,
    bgmUsed: hasBgm ? bgmPath : '',
    bgmSource: hasBgm ? bgmSource : 'none',
  }
}
