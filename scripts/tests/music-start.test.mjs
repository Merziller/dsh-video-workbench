#!/usr/bin/env node
/**
 * 配乐从精彩处开始 (an uploaded song clearly longer than the film starts at a well-chosen bar line):
 *   - window choice on synthetic analyses: a long song with a quiet intro starts after it on a bar line, the drop lands
 *     about 2/3 into a long film and within the first quarter of a short one, a song barely longer than the film / a song
 *     without usable analysis / the 「从头开始」 pin start at 0, a flat song keeps its start, phrase starts are preferred
 *   - shiftBeatMeta: every list in film time, beat numbering / bar positions consistent, cumulative shifts, the shifted
 *     grid cuts a film to its exact length on the beats; cutToMusicWindow falls back when the cut film outgrows the song
 *   - a fresh analysis carries startSec 0 + songDurationSec, so binding a song again resets the start (the BGM upload
 *     route) while the user's pin survives; the studio switch is saved as script.bgm.startFrom (update-format)
 *   - the mixer: the looped input is read longer and `atrim` cuts the start (verified with a two-tone song on the bundled
 *     FFmpeg, looping back to the song start), a start only applies to the song it was chosen for, a film grown past the
 *     song moves the start back by whole bars; a real mix of a song with a quiet 20 s intro is loud from the first second
 *
 *   node scripts/tests/music-start.test.mjs
 *
 * Offline: no model calls, no network. Scratch data only (<repo>/.tmp/music-start/<stamp>); the real `.env` / DSH client
 * are never read. Test songs are made with the bundled FFmpeg.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'music-start', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client'), media: join(SCR, 'media') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
writeFileSync(join(SCR, 'empty.env'), '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: join(SCR, 'empty.env'),
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
})
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const ba = await imp('packages/dsh-tool-media/beat-analyzer.js')
const synth = await imp('packages/dsh-tool-media/audio-synth.js')
const shared = await imp('packages/shared/index.js')
const { ffmpeg } = shared.resolveBinaries()

/** A synthetic beat analysis: steady tempo, level(t) as the loudness curve, drops (song seconds). */
function songMeta({ bpm = 120, songSec = 240, level = () => 0.3, drops = [], barOffset = 0 } = {}) {
  const beatSec = 60 / bpm
  const beats = []
  for (let i = 0, t = 0; t < songSec; i++, t = i * beatSec) {
    const beatInBar = (i - barOffset + 4000) % 4
    const isDrop = drops.some((d) => Math.abs(d - t) < beatSec / 2)
    beats.push({ time: +t.toFixed(4), strong: beatInBar === 0 || isDrop, isDrop, index: i, barIndex: Math.max(0, Math.floor((i - barOffset + 4) / 4)), beatInBar, energy: +(level(t) / 0.3).toFixed(3), accent: 1 })
  }
  const energyCurve = []
  for (let s = 0; s + 1 < songSec; s += 2) energyCurve.push({ sec: s, rms: +level(s + 1).toFixed(4) })
  return {
    analyzed: true,
    bpm,
    beatSec,
    phaseSec: 0,
    barOffset,
    durationSec: songSec,
    songDurationSec: songSec,
    startSec: 0,
    beats,
    downbeats: beats.filter((b) => b.strong).map((b) => b.time),
    drops,
    energyCurve,
    onsets: beats.map((b) => ({ time: b.time, strength: 0.5 })),
  }
}
const barLines = (m) => new Set(m.beats.filter((b) => b.beatInBar === 0).map((b) => b.time))
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol

// a 4-minute song: 20 s quiet intro, verse, a quieter build-up before the second climax at 92 s
const LONG = songMeta({ level: (t) => (t < 20 ? 0.04 : t >= 80 && t < 92 ? 0.2 : 0.32), drops: [20, 92] })

await section('window choice on a synthetic analysis', async () => {
  const w = ba.chooseMusicWindow(LONG, 60, { musicOnly: true })
  check('long song, quiet intro: the start moves past the intro', w.reason === 'moved' && w.startSec >= 20, JSON.stringify(w))
  check('the start is a bar line and the whole film fits inside the song (no loop)', barLines(LONG).has(w.startSec) && w.startSec + 60 <= 240)
  check('a long film gets the climax about 2/3 in', w.dropAtSec !== null && Math.abs(w.dropAtSec / 60 - 2 / 3) <= 0.12, `drop at ${w.dropAtSec} s of 60`)
  check('the plain-Chinese reason', /^配乐从 \d+:\d\d 开始（避开前奏，高潮落在全片约 2\/3 处）$/.test(w.note), w.note)
  const narrated = ba.chooseMusicWindow(LONG, 60)
  check('a narrated film also skips the intro', narrated.reason === 'moved' && narrated.startSec >= 20 && barLines(LONG).has(narrated.startSec), JSON.stringify(narrated))
  const short = ba.chooseMusicWindow(LONG, 15, { musicOnly: true })
  check('a short film (≤ 20 s) gets the hook within its first quarter', short.reason === 'moved' && short.dropAtSec !== null && short.dropAtSec <= 0.25 * 15 && /开头几秒就进入高潮/.test(short.note), JSON.stringify(short))

  const tight = songMeta({ songSec: 64, level: (t) => (t < 20 ? 0.04 : 0.3), drops: [20] })
  const t1 = ba.chooseMusicWindow(tight, 60, { musicOnly: true })
  check('a song barely longer than the film (64 s for 60 s) starts at 0', t1.startSec === 0 && t1.reason === 'song-short', JSON.stringify(t1))
  check('the 1.1 × rule: a 65 s song for a 60 s film starts at 0', ba.chooseMusicWindow(songMeta({ songSec: 65, level: (t) => (t < 20 ? 0.04 : 0.3) }), 60, { musicOnly: true }).startSec === 0)
  const roomy = ba.chooseMusicWindow(songMeta({ songSec: 70, level: (t) => (t < 8 ? 0.04 : 0.3), drops: [8] }), 60, { musicOnly: true })
  check('a 70 s song for a 60 s film skips an 8 s intro and still fits', roomy.startSec === 8 && roomy.startSec + 60 <= 70, JSON.stringify(roomy))

  const noDrops = ba.chooseMusicWindow(songMeta({ level: (t) => (t < 40 ? 0.03 : 0.3), drops: [] }), 60, { musicOnly: true })
  check('no drops: the start still skips a long quiet intro', noDrops.startSec >= 40 && /避开前奏/.test(noDrops.note) && !/高潮/.test(noDrops.note), JSON.stringify(noDrops))
  const flat = ba.chooseMusicWindow(songMeta({ level: () => 0.3, drops: [] }), 60, { musicOnly: true })
  check('a song that is full from its first bar keeps its start', flat.startSec === 0 && flat.reason === 'start-fits', JSON.stringify(flat))
  const phrase = ba.chooseMusicWindow(songMeta({ level: (t) => (t < 42 ? 0.03 : 0.3), drops: [] }), 60, { musicOnly: true })
  check('equally full bars: a phrase start (every 4th bar) wins', phrase.phraseStart === true && phrase.startSec === 48, JSON.stringify(phrase))

  check('no analysis → 0', ba.chooseMusicWindow(null, 60).startSec === 0 && ba.chooseMusicWindow(null, 60).reason === 'no-analysis')
  const failed = { analyzed: true, durationSec: 200, songDurationSec: 200, startSec: 0, beats: [{ time: 0, strong: true, index: 0 }], downbeats: [0], drops: [], energyCurve: [] }
  check('an analysis that found no beats → 0', ba.chooseMusicWindow(failed, 60).startSec === 0)
  const head = ba.cutToMusicWindow(LONG, { filmSec: 60, musicOnly: true, startFrom: 'head' })
  check("「从头开始」 ('head') keeps the song start and its grid", head.window.startSec === 0 && head.window.reason === 'head' && head.meta.startSec === 0 && head.meta.beats.length === LONG.beats.length && /从歌曲开头播放/.test(head.window.note))
})

await section('shift into film time', async () => {
  const sh = ba.shiftBeatMeta(LONG, 52)
  check('start, song length and what is left', sh.startSec === 52 && sh.songDurationSec === 240 && sh.durationSec === 188)
  const kept = LONG.beats.filter((b) => b.time >= 52)
  check('beats: shifted by −start, from 0, numbered again', sh.beats.length === kept.length && sh.beats[0].time === 0 && sh.beats.every((b, j) => b.index === j && near(b.time, kept[j].time - 52)))
  check('every beat keeps its place in the bar', sh.beats.every((b, j) => b.beatInBar === kept[j].beatInBar && b.beatInBar === (b.index - sh.barOffset + 4000) % 4 && b.strong === kept[j].strong))
  check('downbeats / drops / onsets / energy curve in film time, nothing before 0', near(sh.downbeats[0], 0) && sh.downbeats.length === LONG.downbeats.filter((t) => t >= 52).length && JSON.stringify(sh.drops) === '[40]' && sh.onsets.every((o) => o.time >= 0) && sh.energyCurve.every((e) => e.sec >= 0) && sh.energyCurve[0].sec === 0)
  const offBar = ba.shiftBeatMeta(LONG, LONG.beats[13].time)
  check('a start between bar lines: barOffset follows, bar positions unchanged', offBar.barOffset === 3 && offBar.beats.every((b, j) => b.beatInBar === LONG.beats[13 + j].beatInBar), `barOffset ${offBar.barOffset}`)
  const twice = ba.shiftBeatMeta(ba.shiftBeatMeta(LONG, 20), 32)
  check('two shifts add up to one', twice.startSec === 52 && twice.durationSec === 188 && JSON.stringify(twice.beats) === JSON.stringify(sh.beats) && JSON.stringify(twice.drops) === JSON.stringify(sh.drops))
  const zero = ba.shiftBeatMeta(LONG, 0)
  check('a zero shift only adds the song fields', zero.startSec === 0 && zero.songDurationSec === 240 && zero.beats === LONG.beats)
  check('the musical grid starts on the first film beat', ba.createMusicalGrid(sh).firstBeat === 0)
  const plan = Array.from({ length: 12 }, (_, i) => ({ id: `scene-${String(i + 1).padStart(2, '0')}`, title: `t${i + 1}`, narration: '第一镜，大军出征。', beatCount: 8, transition: 'cut' }))
  const cut = ba.quantizeScenesToBeatGrid(plan, sh, { mode: 'subtitle-mv', fps: 30, targetDurationSec: 60, narrationMode: 'subtitle-mv', genre: 'mv-lyric' })
  const last = cut[cut.length - 1]
  const ends = cut.slice(0, -1).map((s) => (s.startFrame + s.durationInFrames) / 30)
  check('the shifted grid cuts a 60 s film to the frame, cuts on its beats', (last.startFrame + last.durationInFrames) / 30 === 60 && ends.every((t) => Math.abs(t / 0.5 - Math.round(t / 0.5)) * 0.5 <= 1.01 / 30), ends.map((t) => t.toFixed(2)).join(','))
})

await section('cutToMusicWindow around a cut', async () => {
  const song = songMeta({ songSec: 80, level: (t) => (t < 20 ? 0.03 : 0.3), drops: [20] })
  const fixedLen = (sec) => () => [{ id: 's1', startFrame: 0, durationInFrames: Math.round(sec * 30) }]
  const ok = ba.cutToMusicWindow(song, { filmSec: 50, exactLength: true, musicOnly: true, cut: fixedLen(50), songPath: 'assets/music/song.mp3' })
  check('a cut that fits keeps the chosen start', ok.window.startSec >= 20 && ok.meta.startSec === ok.window.startSec && ok.meta.durationSec >= 50 && ok.meta.startNote === ok.window.note, JSON.stringify(ok.window))
  check('the song the start was chosen for is recorded (startFor)', ok.meta.startFor === 'assets/music/song.mp3')
  const grown = ba.cutToMusicWindow(song, { filmSec: 50, exactLength: true, musicOnly: true, cut: fixedLen(70) })
  check('a cut longer than the rest of the song: chosen again for its real length', grown.window.startSec + 70 <= 80 && grown.meta.durationSec >= 70, JSON.stringify(grown.window))
  const never = ba.cutToMusicWindow(song, { filmSec: 50, exactLength: true, musicOnly: true, cut: fixedLen(85) })
  check('a cut longer than the whole song: the song starts at 0 (as before)', never.window.startSec === 0 && never.window.reason === 'song-short' && never.meta.startSec === 0 && never.meta.durationSec === 80, JSON.stringify(never.window))
  // a cut that always outgrows what is left of the song after any start
  const longer = ba.cutToMusicWindow(LONG, { filmSec: 50, exactLength: true, musicOnly: true, cut: (m) => fixedLen(m.durationSec + 5)() })
  check('a cut that keeps outgrowing the chosen part: the song starts at 0 (no loop in the middle of the film)', longer.window.startSec === 0 && longer.window.reason === 'film-longer' && longer.meta.startSec === 0 && /从头播放/.test(longer.window.note), JSON.stringify(longer.window))
  // only the timing goes into script.bgm: what the caller just set (path, mode, the pin) is never overwritten
  const bgmNow = { path: 'assets/new.wav', uploadedPath: 'assets/new.wav', mode: 'uploaded', startFrom: 'auto', volume: 0.9 }
  const merged = { ...bgmNow, ...ba.musicTimingFields({ ...ok.meta, path: 'assets/old.wav', mode: 'llm-coded', startFrom: 'head', volume: 0.2 }) }
  check('merging a cut into script.bgm takes only the timing fields', merged.path === 'assets/new.wav' && merged.mode === 'uploaded' && merged.startFrom === 'auto' && merged.volume === 0.9 && merged.startSec === ok.meta.startSec && merged.beats === ok.meta.beats && merged.startFor === 'assets/music/song.mp3')
  const sh = ba.shiftBeatMeta(song, 20)
  const again = ba.cutToMusicWindow(sh, { filmSec: 30, musicOnly: true })
  check('an analysis already in film time is never shifted twice', again.meta === sh && again.window.reason === 'already-shifted')
})

/* ------------------------------------------------------------------------------------------------ real audio */
const ff = (args) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr || '').slice(0, 300)}`)
}
/** mean level (dB) of [ss, ss + t] of a file, optionally of one narrow band only (bandHz) */
const meanDb = (file, ss, t, bandHz = 0) => {
  const af = `${bandHz ? `bandpass=f=${bandHz}:width_type=h:width=24,bandpass=f=${bandHz}:width_type=h:width=24,` : ''}volumedetect`
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-ss', String(ss), '-t', String(t), '-i', file, '-af', af, '-f', 'null', '-'], { windowsHide: true, encoding: 'utf8' })
  const m = String(r.stderr || '').match(/mean_volume:\s*(-?[\d.]+) dB/)
  return m ? Number(m[1]) : NaN
}
const freqAt = (file, t) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-ss', String(t), '-t', '0.25', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { windowsHide: true, maxBuffer: 1 << 22 })
  const b = r.stdout
  let zc = 0
  for (let i = 2; i < b.length; i += 2) if ((b.readInt16LE(i - 2) < 0) !== (b.readInt16LE(i) < 0)) zc++
  return Math.round(zc / 2 / 0.25)
}
// 60 s at 120 BPM: a quiet 20 s intro (soft 220 Hz pulses), then a loud part (accented 55 Hz kick on every bar + a held
// 330 Hz tone). The bands tell the parts apart even where a dynamic normaliser evens out their levels.
const INTRO = '0.03*sin(2*PI*220*t)*exp(-14*mod(t,0.5))'
const LOUD = 'if(lt(mod(t,2),0.25),0.85,0.5)*sin(2*PI*55*t)*exp(-28*mod(t,0.5))+0.16*sin(2*PI*330*t)*(0.6+0.4*exp(-6*mod(t,0.5)))'
const songWav = join(dirs.media, 'intro-song.wav')
const SONG_MS = { meta: null, window: null }

await section('mixer: the start input and when a start applies', async () => {
  const bed = synth.musicBedInput({ absBgm: 'x.wav', totalSec: 30, startSec: 72.5 })
  check('a start: the looped input is read longer, never seeked', JSON.stringify(bed.args) === JSON.stringify(['-stream_loop', '-1', '-t', '103.5', '-i', 'x.wav']))
  check('a start: atrim + asetpts head the music chain', bed.head === 'atrim=start=72.5,asetpts=PTS-STARTPTS,')
  const none = synth.musicBedInput({ absBgm: 'x.wav', totalSec: 30, startSec: 0 })
  check('no start: the input is exactly as before', JSON.stringify(none.args) === JSON.stringify(['-stream_loop', '-1', '-t', '30', '-i', 'x.wav']) && none.head === '')
  const src = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'audio-synth.js'), 'utf8')
  check('all three music chains of the mixer start with that head (music-only ×2, narrated)', (src.match(/\[\$\{bgmIdx\}:a:0\]\$\{bed\.head\}aresample=/g) || []).length === 3)

  // two-tone song: 0–8 s 300 Hz, 8–16 s 1200 Hz; start 12 s, film 14 s → 1200 Hz, then the loop restarts at the song start
  const tone = join(dirs.media, 'two-tone.wav')
  ff(['-f', 'lavfi', '-i', 'sine=f=300:d=8:sample_rate=48000', '-f', 'lavfi', '-i', 'sine=f=1200:d=8:sample_rate=48000', '-filter_complex', '[0][1]concat=n=2:v=0:a=1', tone])
  const tb = synth.musicBedInput({ absBgm: tone, totalSec: 14, startSec: 12 })
  const toneOut = join(dirs.media, 'two-tone-bed.wav')
  ff([...tb.args, '-filter_complex', `[0:a:0]${tb.head}aresample=48000[o]`, '-map', '[o]', '-t', '14', toneOut])
  const f = [1, 3.5, 6, 11, 13].map((t) => freqAt(toneOut, t))
  check('bundled FFmpeg: the bed starts at 12 s and a loop restarts at the song start', near(f[0], 1200, 40) && near(f[1], 1200, 40) && near(f[2], 300, 40) && near(f[3], 300, 40) && near(f[4], 1200, 40), f.join(' / ') + ' Hz')

  ff(['-f', 'lavfi', '-i', `aevalsrc='if(lt(t,20),${INTRO},${LOUD})':s=44100:d=60`, '-c:a', 'pcm_s16le', songWav])
  const proj = join(dirs.ws, 'rules')
  mkdirSync(join(proj, 'assets'), { recursive: true })
  copyFileSync(songWav, join(proj, 'assets', 'song.wav'))
  const abs = join(proj, 'assets', 'song.wav')
  const base = { bgm: { startSec: 24, songDurationSec: 60, beatSec: 0.5, bpm: 120, uploadedPath: 'assets/song.wav', path: 'assets/song.wav' } }
  const at = (over = {}, opts = {}) => synth.resolveMusicStartSec({ script: { bgm: { ...base.bgm, ...over } }, absDir: proj, absBgm: abs, bgmPath: 'assets/song.wav', bgmSource: 'user-imported', totalSec: 30, ...opts })
  check('the chosen song plays from its start', (await at()) === 24)
  check('a generated / AI track never gets a start', (await at({}, { bgmSource: 'generated' })) === 0)
  check('another file never gets the start of this one', (await at({}, { bgmPath: 'assets/other.wav' })) === 0)
  check('the start belongs to the song it was chosen for (startFor), even when bgm.path now points elsewhere', (await at({ startFor: 'assets/song.wav', uploadedPath: 'assets/x.wav', path: 'assets/x.wav' })) === 24 && (await at({ startFor: 'assets/older-song.wav' })) === 0)
  check('a recording of another length (replaced, not analysed) starts at 0', (await at({ songDurationSec: 95 })) === 0)
  check('a film grown past the song: the start moves back by whole bars', (await at({ startSec: 36 })) === 30 && (await at({ startSec: 36 }, { totalSec: 70 })) === 0)
})

await section('real FFmpeg: a song with a quiet 20 s intro → the music bed is loud from the start', async () => {
  const meta = await ba.analyzeAudioBeatStructure(songWav)
  check('a fresh analysis is in song time: startSec 0 + the song length', meta.startSec === 0 && meta.songDurationSec === meta.durationSec && near(meta.durationSec, 60, 0.1), `${meta.bpm} BPM · ${meta.durationSec} s · drops ${JSON.stringify(meta.drops)}`)
  const cut = ba.cutToMusicWindow(meta, { filmSec: 24, exactLength: true, musicOnly: true, songPath: 'assets/song.wav' })
  const w = cut.window
  SONG_MS.meta = meta
  SONG_MS.window = w
  check('a 24 s music film starts after the intro, on a bar line, and fits', w.startSec >= 19.5 && w.startSec + 24 <= 60 && meta.beats.some((b) => b.beatInBar === 0 && near(b.time, w.startSec)), JSON.stringify(w))

  const proj = join(dirs.ws, 'mix')
  mkdirSync(join(proj, 'assets'), { recursive: true })
  copyFileSync(songWav, join(proj, 'assets', 'song.wav'))
  const scenes = [0, 1, 2].map((i) => ({ id: `scene-0${i + 1}`, title: `镜头 ${i + 1}`, startSec: i * 8, durationSec: 8, startFrame: i * 240, durationInFrames: 240, ambience: 'none' }))
  const script = {
    title: '配乐起点测试',
    fps: 30,
    totalDurationSec: 24,
    narrationMode: 'subtitle-mv',
    bgmMode: 'uploaded',
    audioSpec: { bgmMode: 'uploaded' },
    ambienceBed: false,
    scenes,
    bgm: { ...cut.meta, enabled: true, mode: 'uploaded', source: 'user-imported', path: 'assets/song.wav', uploadedPath: 'assets/song.wav', volume: 1 },
  }
  const assetsManifest = { items: [{ id: 'm1', role: 'music', type: 'audio', path: 'assets/song.wav' }] }
  const srcIntro = meanDb(songWav, 0.2, 2.8)
  const srcLoud = meanDb(songWav, 24.2, 2.8)
  check('the test song: its intro is far quieter than its loud part', srcIntro <= srcLoud - 15, `song 0–3 s ${srcIntro} dB · 24–27 s ${srcLoud} dB`)
  const res = await synth.mixVideoAudio({ projectDir: proj, script, assetsManifest, outputPath: 'output/master-start.wav' })
  const outStart = join(proj, 'output', 'master-start.wav')
  check('the mix reports the start it used', near(res.bgmStartSec, w.startSec, 0.001) && res.bgmSource === 'user-imported', JSON.stringify({ bgmStartSec: res.bgmStartSec, masterLufs: res.masterLufs }))
  const head = meanDb(outStart, 0.2, 2.8)
  const body = meanDb(outStart, 8, 10)
  check('music film: the first 3 s are as loud as the body of the film (within 4 dB)', Number.isFinite(head) && head >= body - 4, `first 3 s ${head} dB · 8–18 s ${body} dB`)
  const loudBand = meanDb(outStart, 0.2, 2.8, 330)
  const introBand = meanDb(outStart, 0.2, 2.8, 220)
  check('music film: its first 3 s are the loud part of the song (330 Hz band ≥ 15 dB over the intro band)', loudBand >= introBand + 15, `330 Hz ${loudBand} dB · 220 Hz ${introBand} dB`)
  const ctrl = await synth.mixVideoAudio({ projectDir: proj, script: { ...script, bgm: { ...script.bgm, startSec: 0 } }, assetsManifest, outputPath: 'output/master-head.wav' })
  const outHead = join(proj, 'output', 'master-head.wav')
  const cLoudBand = meanDb(outHead, 0.2, 2.8, 330)
  const cIntroBand = meanDb(outHead, 0.2, 2.8, 220)
  check('control (from 0:00): the same film opens on the intro', !ctrl.bgmStartSec && cIntroBand >= cLoudBand + 15, `330 Hz ${cLoudBand} dB · 220 Hz ${cIntroBand} dB`)
  // with a linear music gain (an FFmpeg that measures loudness) the intro also stays quiet in the mix
  if (Number.isFinite(ctrl.masterLufs)) check('control: the intro opens ≥ 12 dB under the loud part', meanDb(outHead, 0.2, 2.8) <= meanDb(outHead, 20.3, 1.7) - 12)

  // narrated chain: one short line at 8.3 s; the music-bed stem (pre-limiter bus tap) is full from the first second
  const voice = join(proj, 'audio', 'scene-02.wav')
  mkdirSync(dirname(voice), { recursive: true })
  ff(['-f', 'lavfi', '-i', 'sine=f=300:d=1:sample_rate=48000', '-af', 'volume=0.5', voice])
  const narrated = { ...script, narrationMode: 'tts', scenes: scenes.map((s, i) => (i === 1 ? { ...s, audioFile: 'audio/scene-02.wav', voiceLeadSec: 0.3 } : s)) }
  const nres = await synth.mixVideoAudio({ projectDir: proj, script: narrated, assetsManifest, outputPath: 'output/master-narrated.wav', writeStems: true, stemsDir: 'output/stems-narrated' })
  const stem = join(proj, 'output', 'stems-narrated', 'bgm.wav')
  const sHead = meanDb(stem, 0.7, 2.3)
  const sBody = meanDb(stem, 12, 8)
  const sLoud = meanDb(stem, 0.7, 2.3, 330)
  const sIntro = meanDb(stem, 0.7, 2.3, 220)
  check('narrated film: the music bed starts at the same bar and is full from the first seconds', near(nres.bgmStartSec, w.startSec, 0.001) && existsSync(stem) && sHead >= sBody - 6 && sLoud >= sIntro + 15, `first 3 s ${sHead} dB · 12–20 s ${sBody} dB · 330 Hz ${sLoud} dB vs 220 Hz ${sIntro} dB`)
})

await section('a fresh analysis resets the start; the pin and the studio switch', async () => {
  const shifted = { ...ba.shiftBeatMeta(LONG, 52), startFrom: 'head', startNote: '配乐从 0:52 开始（避开前奏）', enabled: true, uploadedPath: 'assets/old.wav' }
  const fresh = { ...LONG, startSec: 0, songDurationSec: 240 }
  const merged = { ...shifted, ...fresh }
  check('spreading a fresh analysis over a shifted one: song time again, the pin kept', merged.startSec === 0 && merged.songDurationSec === 240 && JSON.stringify(merged.drops) === '[20,92]' && merged.startFrom === 'head')

  const { handleWorkbenchApiRequest } = await imp('packages/dsh-web-video-workbench/lib/index.js')
  const api = async (method, path, body) => {
    const r = await handleWorkbenchApiRequest(new Request(`http://127.0.0.1/api/video-workbench/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }))
    let json = {}
    try {
      json = JSON.parse(await r.text())
    } catch {}
    return { status: r.status, json }
  }
  const proj = join(dirs.ws, 'rebind')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: '换歌', fps: 30, width: 1280, height: 720, totalDurationSec: 24, bgmMode: 'uploaded', scenes: [{ id: 'scene-01', title: '开场', narration: '开场', durationSec: 24 }], bgm: { ...shifted, analyzed: true, mode: 'uploaded', source: 'user-imported', path: 'assets/old.wav' } }, null, 2))
  const song2 = join(dirs.media, 'song2.wav')
  ff(['-f', 'lavfi', '-i', `aevalsrc='${LOUD}':s=44100:d=30`, '-c:a', 'pcm_s16le', song2])
  const up = await api('POST', 'bgm/upload', { projectDir: proj, fileName: 'song2.wav', dataBase64: readFileSync(song2).toString('base64') })
  const s1 = shared.readScriptJson(proj).data
  check('binding a new song (BGM upload) resets the start to 0 with the new song length', up.status === 200 && s1.bgm.startSec === 0 && near(s1.bgm.songDurationSec, 30, 0.2) && s1.bgm.uploadedPath !== 'assets/old.wav', JSON.stringify({ status: up.status, startSec: s1.bgm.startSec, song: s1.bgm.songDurationSec, path: s1.bgm.uploadedPath }))
  check("the user's 「从头开始」 pin survives the new analysis", s1.bgm.startFrom === 'head')
  await api('POST', 'action', { projectDir: proj, action: 'update-format', bgmStartFrom: 'auto' })
  const s2 = shared.readScriptJson(proj).data
  check('the studio switch is saved as script.bgm.startFrom (the rest of bgm kept)', s2.bgm.startFrom === 'auto' && s2.bgm.uploadedPath === s1.bgm.uploadedPath && s2.bgm.bpm === s1.bgm.bpm)
  await api('POST', 'action', { projectDir: proj, action: 'update-format', bgmStartFrom: 'sometimes' })
  check('an unknown value changes nothing', shared.readScriptJson(proj).data.bgm.startFrom === 'auto')
  const kit = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'warroom', 'kit.js'), 'utf8')
  check('the studio music section has the switch and shows where the song starts (built kit)', kit.includes('配乐从精彩处开始') && kit.includes("'bgmStartFrom'") && kit.includes('本片配乐从'))
  const client = readFileSync(join(ROOT, 'packages', 'dsh-web-video-workbench', 'lib', 'client.js'), 'utf8')
  check('the host accepts the switch and shows it in the director state', /k === 'bgmStartFrom'/.test(client) && /bgmStartFrom: directorForm\.bgmStartFrom === 'head'/.test(client))
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
