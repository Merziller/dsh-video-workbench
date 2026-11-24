#!/usr/bin/env node
/**
 * Standalone tests: post-render QA that works with any FFmpeg build (filter detection + equivalent measurements when
 * `scdet` / `freezedetect` / `signalstats` are missing), the held-picture check ("same picture for N seconds", a
 * failure for beat films), the shot-rhythm check and how both are reported.
 *
 *   node scripts/tests/qa-holds.test.mjs [--maoxuan=<mp4>] [--huoqubing=<mp4>] [--tutorial=<mp4>] [--dense=<mp4>]
 *
 * Synthetic clips are generated with the plugin's own FFmpeg into <repo>/.tmp/qa-holds/<run> (removed at the end).
 * Optional real films (calibration set; skipped when absent), also via env:
 *   DSH_QA_HOLDS_MAOXUAN    beat film, one composition with rotating rays            → share ≈ 96 %, must fail
 *   DSH_QA_HOLDS_HUOQUBING  beat film, 13 slow reveals of ≈ 10.7 s                   → share ≈ 90 %, must fail
 *   DSH_QA_HOLDS_TUTORIAL   narrated screen-recording tutorial                       → share ≈ 48 %, must not fail
 *   DSH_QA_HOLDS_DENSE      dense beat film (new picture every 1–2 s)                → share ≈ 3 %, must pass
 * The real `.env` is never loaded (an empty env file is used); no network access.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const SCRATCH = join(REPO, '.tmp', 'qa-holds', `run-${process.pid}`)
mkdirSync(SCRATCH, { recursive: true })
const emptyEnv = join(SCRATCH, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
process.env.DSH_VIDEO_ENV_PATH = emptyEnv
process.env.DSH_VIDEO_SKIP_PROFILE_MOUNT = '1'
process.env.DSH_VIDEO_RUNNER_ISOLATED = '1'
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const imp = (rel) => import(pathToFileURL(join(REPO, rel)).href)
const shared = await imp('packages/shared/index.js')
const det = await imp('packages/dsh-tool-video-suite/qa-detectors.js')
const qa = await imp('packages/dsh-tool-video-suite/qa-checker.js')
const { ffmpeg, ffprobe } = shared.resolveBinaries()

const args = Object.fromEntries(process.argv.slice(2).map((a) => /^--([^=]+)=(.*)$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2]]))
const REAL = [
  { key: 'maoxuan', env: 'DSH_QA_HOLDS_MAOXUAN', rhythm: 'beat', share: 0.96, expect: 'fail' },
  { key: 'huoqubing', env: 'DSH_QA_HOLDS_HUOQUBING', rhythm: 'beat', share: 0.9, expect: 'fail' },
  { key: 'tutorial', env: 'DSH_QA_HOLDS_TUTORIAL', rhythm: 'narration', share: 0.48, expect: 'not-fail' },
  { key: 'dense', env: 'DSH_QA_HOLDS_DENSE', rhythm: 'beat', share: 0.03, expect: 'pass' },
].map((r) => ({ ...r, path: args[r.key] || process.env[r.env] || '' }))
// share of the film in holds ≥ 4 s must stay within this many points of the calibration value
const SHARE_TOLERANCE = 0.06

// ------------------------------------------------------------------------------------------
// Harness
// ------------------------------------------------------------------------------------------
const results = []
async function test(name, fn, { skip = false } = {}) {
  if (skip) {
    results.push({ name, status: 'skip' })
    console.log(`- SKIP ${name}`)
    return
  }
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass' })
    console.log(`✔ ${name} (${Date.now() - t0} ms)`)
  } catch (err) {
    results.push({ name, status: 'fail', err })
    console.log(`✘ ${name} (${Date.now() - t0} ms)\n    ${String(err?.stack || err).split('\n').slice(0, 6).join('\n    ')}`)
  }
}
function safeRemove(target) {
  const abs = resolve(target)
  if (!abs.startsWith(join(REPO, '.tmp'))) return
  if (!existsSync(abs)) return
  const st = lstatSync(abs)
  if (st.isSymbolicLink() || !st.isDirectory()) return unlinkSync(abs)
  for (const e of readdirSync(abs)) safeRemove(join(abs, e))
  rmdirSync(abs)
}
const probe = (file) => {
  const r = spawnSync(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' })
  const j = JSON.parse(r.stdout || '{}')
  const v = (j.streams || []).find((s) => s.codec_type === 'video') || {}
  return { width: Number(v.width) || 0, height: Number(v.height) || 0, durationSec: Number(j.format?.duration) || 0 }
}
async function heldOf(file, rhythm, { script = null } = {}) {
  const p = probe(file)
  const t0 = Date.now()
  const decoded = await det.collectHoldFrames({ ffmpeg, mp4Path: file, width: p.width, height: p.height, durationSec: p.durationSec })
  const { segments } = det.segmentHeldPictures(decoded)
  const timeline = script ? det.buildSceneTimeline(script, script.fps || 30) : []
  const held = det.analyzeHeldPictures({ segments, totalSec: p.durationSec, timeline, rhythm: det.classifyFilmRhythm(script, rhythm) })
  return { held, ms: Date.now() - t0, durationSec: p.durationSec }
}
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} not within ±${tol} of ${b}`)

// ------------------------------------------------------------------------------------------
// Synthetic clips (640×360, 30 fps): a different full-frame picture every second for cut runs, fixed pictures for holds
// ------------------------------------------------------------------------------------------
const S = '640x360'
const pat = (k) => `128+105*sin(2*PI*(X*cos(1.3*(${k}))+Y*sin(1.3*(${k})))/(170+60*mod(${k},4))+2.1*(${k}))`
const fixed = (a, p, ph) => `128+70*sin(2*PI*(X*cos(${a})+Y*sin(${a}))/${p}+${ph})+40*cos(2*PI*Y/150)`
// computed at 1 fps (cheap), repeated to 30 fps, trimmed to exactly d seconds
const src = (d, lum) => `color=c=black:s=${S}:r=1:d=${d + 1},format=gray,geq=lum='${lum}',fps=30,trim=duration=${d},setpts=PTS-STARTPTS,format=yuv420p`
const cuts = (d, seed = 0) => src(d, pat(`floor(T)+${seed}`))
const still = (d, a = 0.4, p = 260, ph = 0.7) => src(d, fixed(a, p, ph))
const CLIPS = {
  // static picture, a rotating cross (sun rays) and a flickering light, 10 s between 4 s of 1-s cuts → one 10-s hold
  rotating: [
    `${cuts(4, 0)}[a]`,
    `${still(10)}[bg]`,
    'color=c=white:s=240x18:r=30:d=10,format=rgba[bar1]',
    'color=c=white:s=18x240:r=30:d=10,format=rgba[bar2]',
    '[bar1][bar2]overlay=x=111:y=-111:format=auto[cross]',
    '[cross]rotate=a=2*PI*t/4:ow=260:oh=260:c=black@0[rot]',
    "[bg][rot]overlay=x=330:y=40:format=auto,drawbox=x=40:y=230:w=150:h=90:c=white@0.9:t=fill:enable='lt(mod(t\\,0.34)\\,0.17)',format=yuv420p[b]",
    `${cuts(4, 7)}[c]`,
    '[a][b][c]concat=n=3:v=1:a=0[v]',
  ].join(';'),
  // slow zoom 1.0 → 1.15 over 10 s on one picture (Ken Burns), between 4 s of 1-s cuts → one 10-s hold
  slowzoom: [
    `${cuts(4, 3)}[a]`,
    `color=c=black:s=1280x720:r=1:d=1,format=gray,geq=lum='${fixed(0.9, 420, 1.9)}',zoompan=z='1+0.15*on/300':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=300:s=${S}:fps=30,trim=duration=10,setpts=PTS-STARTPTS,format=yuv420p[b]`,
    `${cuts(4, 11)}[c]`,
    '[a][b][c]concat=n=3:v=1:a=0[v]',
  ].join(';'),
  // the same artwork hard re-framed every 1.5 s between wide (1.0) and medium (1.18) — the renderer's closest pair of
  // scene.cuts framings, within the slow-zoom allowance — between 4 s of cuts → no hold: a hard re-frame is a new picture
  reframe: [
    `${cuts(4, 13)}[a]`,
    `color=c=black:s=1280x720:r=1:d=1,format=gray,geq=lum='${fixed(0.7, 380, 0.4)}',zoompan=z='1+0.18*mod(floor(on/45),2)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=300:s=${S}:fps=30,trim=duration=10,setpts=PTS-STARTPTS,format=yuv420p[b]`,
    `${cuts(4, 17)}[c]`,
    '[a][b][c]concat=n=3:v=1:a=0[v]',
  ].join(';'),
  // 16 s of 1-s cuts → no hold
  rapid: `${cuts(16, 2)}[v]`,
  // 5-s title card (picture + bright title bar), then 13 s of 1-s cuts → the title card is not judged
  title: [`${still(5, 1.2, 300, 0.2)},drawbox=x=120:y=140:w=400:h=80:c=white@0.95:t=fill[a]`, `${cuts(13, 5)}[b]`, '[a][b]concat=n=2:v=1:a=0[v]'].join(';'),
}
const clipPath = (name) => join(SCRATCH, `${name}.mp4`)

await test('fixture: synthetic clips are generated with the plugin FFmpeg', async () => {
  for (const [name, graph] of Object.entries(CLIPS)) {
    const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-filter_complex', graph, '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', clipPath(name)], { encoding: 'utf8' })
    assert.equal(r.status, 0, `${name}: ${String(r.stderr).slice(0, 300)}`)
    assert.ok(existsSync(clipPath(name)), name)
  }
})

// ------------------------------------------------------------------------------------------
// FFmpeg capability probe and graph degradation
// ------------------------------------------------------------------------------------------
await test('filter list parsing and the cached probe of the plugin FFmpeg', async () => {
  const sample = ['Filters:', '  T.. = Timeline support', ' ... abench            A->A       Benchmark part of a filtergraph.', ' TSC scale             V->V       Scale the input video size.', ' ... scdet             V->V       Detect video scene change', ' ... nullsink          V->|       Do absolutely nothing.', ' ... concat            N->N       Concatenate'].join('\n')
  const set = det.parseFfmpegFilterList(sample)
  assert.deepEqual([...set].sort(), ['abench', 'concat', 'nullsink', 'scale', 'scdet'])
  const real = await det.probeFfmpegFilters(ffmpeg)
  assert.ok(real.size > 100, `expected a full filter list, got ${real.size}`)
  for (const f of ['scale', 'select', 'signalstats', 'metadata']) assert.ok(real.has(f), f)
  assert.equal(await det.probeFfmpegFilters(ffmpeg), real, 'second call is served from the cache')
  console.log(`    plugin FFmpeg: ${real.size} filters · scdet ${real.has('scdet') ? 'yes' : 'no'} · freezedetect ${real.has('freezedetect') ? 'yes' : 'no'}`)
})

await test('temporal graph uses only available filters (scdet → select → grid; freezedetect → frame diff)', async () => {
  const full = det.buildTemporalFilterGraph({ filters: new Set(['scdet', 'freezedetect', 'signalstats', 'metadata', 'select']) })
  assert.equal(full.cuts, 'scdet')
  assert.ok(full.freeze && full.stats && /scdet=threshold=/.test(full.graph) && /freezedetect=/.test(full.graph))
  const old = det.buildTemporalFilterGraph({ filters: new Set(['freezedetect', 'signalstats', 'metadata', 'select']) })
  assert.equal(old.cuts, 'select')
  assert.ok(!/scdet/.test(old.graph) && /select=gte\(scene\\,0\)/.test(old.graph))
  const bare = det.buildTemporalFilterGraph({ filters: new Set(['signalstats', 'metadata']) })
  assert.equal(bare.cuts, 'grid')
  assert.equal(bare.freeze, false)
  assert.ok(!/freezedetect|scdet|select/.test(bare.graph) && /split=2\[qg\]\[qy\]/.test(bare.graph))
  const unknown = det.buildTemporalFilterGraph({ filters: new Set() })
  assert.equal(unknown.cuts, 'select', 'unknown build: long-standing filters only')
  assert.equal(unknown.freeze, false)
})

await test('grid cut detector and frame-difference freezes (pure)', async () => {
  const cells = 4
  const frames = 60
  const grid = new Uint8Array(frames * cells)
  for (let f = 0; f < frames; f++) for (let c = 0; c < cells; c++) grid[f * cells + c] = f < 30 ? 40 : 200
  const cutsFound = det.detectGridCuts({ grid, gridCells: cells, frameCount: frames, threshold: 10, timeOf: (f) => f / 30 })
  assert.equal(cutsFound.length, 1)
  near(cutsFound[0].timeSec, 1, 0.001, 'cut time')
  const ydif = new Float64Array(frames).fill(0.05)
  for (let f = 28; f < 32; f++) ydif[f] = 30
  const fz = det.deriveFreezesFromFrames({ ydif, grid, gridCells: cells, frameCount: frames, minSec: 0.5, timeOf: (f) => f / 30, durationSec: 2 })
  assert.equal(fz.length, 2, JSON.stringify(fz))
  assert.ok(fz.every((f) => f.durationSec >= 0.5 && f.source === 'frame-diff'))
})

await test('temporal pass runs on the plugin FFmpeg (no scdet needed) and with a forced minimal filter set', async () => {
  const p = probe(clipPath('rapid'))
  const sig = await det.collectTemporalSignals({ ffmpeg, mp4Path: clipPath('rapid'), durationSec: p.durationSec })
  assert.ok(sig.frameCount >= 470, `frames ${sig.frameCount}`)
  // a hard cut every second
  assert.ok(sig.cuts.length >= 13 && sig.cuts.length <= 16, `cuts ${sig.cuts.length}`)
  assert.ok(sig.cuts.every((c) => Math.abs(c.timeSec - Math.round(c.timeSec)) < 0.05), JSON.stringify(sig.cuts.slice(0, 4)))
  const forced = await det.collectTemporalSignals({ ffmpeg, mp4Path: clipPath('rapid'), durationSec: p.durationSec, filters: ['signalstats', 'metadata', 'scale', 'format', 'split', 'nullsink'] })
  assert.equal(forced.capabilities.cuts, 'grid')
  assert.equal(forced.capabilities.freeze, 'frame-diff')
  assert.ok(forced.degraded.length >= 2)
  assert.ok(forced.cuts.length >= 13 && forced.cuts.length <= 16, `grid cuts ${forced.cuts.length}`)
  assert.equal(forced.freezes.length, 0, 'no freeze in a film that cuts every second')
})

// ------------------------------------------------------------------------------------------
// Held pictures: classification, verdicts and texts (pure)
// ------------------------------------------------------------------------------------------
await test('film rhythm classification (beat vs narration)', async () => {
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'subtitle-mv' }).kind, 'beat')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'tts-beat-sync' }).kind, 'beat')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'tts', pacingMode: 'dynamic' }).kind, 'beat')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'tts', topic: '霍去病 高燃卡点混剪' }).kind, 'beat')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'tts', beatSync: true }).kind, 'beat')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'tts', pacingMode: 'balanced', topic: '软件教程' }).kind, 'narration')
  assert.equal(det.classifyFilmRhythm(null).kind, 'narration')
  assert.equal(det.classifyFilmRhythm({ narrationMode: 'subtitle-mv' }, 'narration').kind, 'narration', 'override wins')
  assert.equal(det.classifyFilmRhythm({ qa: { filmRhythm: 'beat' } }).kind, 'beat')
})

await test('title / end card flags', async () => {
  assert.ok(det.isTitleOrEndScene({ titleCard: true }))
  assert.ok(det.isTitleOrEndScene({ kind: 'end-card' }))
  assert.ok(det.isTitleOrEndScene({ sceneType: '片头' }))
  assert.ok(det.isTitleOrEndScene({ qa: { allowHold: true } }))
  assert.ok(!det.isTitleOrEndScene({ layout: 'hero-title' }), 'generic layout names are not title cards')
  assert.ok(!det.isTitleOrEndScene({ role: 'storyteller', title: '片头' }))
})

const seg = (a, b) => ({ startSec: a, endSec: b, durationSec: b - a })
const cutsEvery = (a, b, step = 1) => Array.from({ length: Math.round((b - a) / step) }, (_, i) => seg(a + i * step, a + (i + 1) * step))
const TL = (n, len) => Array.from({ length: n }, (_, i) => ({ index: i, id: `scene-${String(i + 1).padStart(2, '0')}`, startSec: i * len, endSec: (i + 1) * len, startFrame: i * len * 30, endFrame: (i + 1) * len * 30, scene: {} }))

await test('beat film verdicts: share > 30 % or one hold > 6 s fails; edges and flagged cards are not judged', async () => {
  const beat = { kind: 'beat' }
  // 40 s film: 3 s cuts, one 8-s hold at 10–18 → single hold over 6 s
  const one = det.analyzeHeldPictures({ segments: [...cutsEvery(0, 10), seg(10, 18), ...cutsEvery(18, 40)], totalSec: 40, timeline: TL(10, 4), rhythm: beat })
  assert.equal(one.severity, 'fail')
  assert.equal(one.longestSec, 8)
  assert.deepEqual(one.holds[0].sceneIds, ['scene-03', 'scene-04', 'scene-05'])
  // 5-s holds only, but 3 of them in 30 s of judged time → share 50 %
  const share = det.analyzeHeldPictures({ segments: [...cutsEvery(0, 3), seg(3, 8), seg(8, 13), seg(13, 18), ...cutsEvery(18, 36)], totalSec: 36, rhythm: beat })
  assert.equal(share.severity, 'fail')
  assert.ok(share.longestSec <= 6 && share.judgedShare > 0.3)
  // dense film with a 5-s hold: passes
  const ok = det.analyzeHeldPictures({ segments: [...cutsEvery(0, 20), seg(20, 25), ...cutsEvery(25, 60)], totalSec: 60, rhythm: beat })
  assert.equal(ok.severity, 'pass')
  // 8-s title card at the start: only 5 s are judged → no single hold over 6 s, short share
  const title = det.analyzeHeldPictures({ segments: [seg(0, 8), ...cutsEvery(8, 60)], totalSec: 60, rhythm: beat })
  assert.equal(title.severity, 'pass')
  assert.equal(title.longestSec, 5)
  // a 10-s end card flagged in the plan is not judged at all
  const tl = [...TL(5, 10), { index: 5, id: 'scene-06', startSec: 50, endSec: 60, scene: { endCard: true } }]
  const end = det.analyzeHeldPictures({ segments: [...cutsEvery(0, 50), seg(50, 60)], totalSec: 60, timeline: tl, rhythm: beat })
  assert.equal(end.severity, 'pass')
  assert.ok(end.holds[0].titleOrEnd)
})

await test('narrated films: long holds are normal, only extreme ones are a warning (never a failure)', async () => {
  const narr = { kind: 'narration' }
  const tutorial = det.analyzeHeldPictures({ segments: [seg(0, 20), ...cutsEvery(20, 40), seg(40, 61), ...cutsEvery(61, 130)], totalSec: 130, rhythm: narr })
  assert.equal(tutorial.severity, 'pass')
  const onePicture = det.analyzeHeldPictures({ segments: [seg(0, 40), seg(40, 90)], totalSec: 90, rhythm: narr })
  assert.equal(onePicture.severity, 'warning')
  const row = det.buildHeldPictureCheck(onePicture)
  assert.equal(row.passed, true)
})

await test('held-picture check row: plain Chinese, time ranges and scene ids first, details per hold', async () => {
  const held = det.analyzeHeldPictures({ segments: [...cutsEvery(0, 4), seg(4, 16), ...cutsEvery(16, 30)], totalSec: 30, timeline: TL(6, 5), rhythm: { kind: 'beat' } })
  const row = det.buildHeldPictureCheck(held)
  assert.equal(row.passed, false)
  assert.equal(row.severity, 'fail')
  assert.match(row.value, /^✕ 画面停留过久/)
  assert.match(row.value.slice(0, 180), /0:04–0:16 同一画面 12 秒（scene-01、scene-02、scene-03 等 4 个分镜）/)
  assert.match(row.value, /建议/)
  assert.deepEqual(row.details, ['0:04–0:16 同一画面 12 秒 · scene-01、scene-02、scene-03、scene-04'])
  const rhythm = det.analyzeShotRhythm({ timeline: TL(6, 5), held, totalSec: 30 })
  assert.equal(rhythm.severity, 'warning')
  assert.equal(rhythm.crossSceneHolds.length, 1)
  const rrow = det.buildShotRhythmCheck(rhythm, { beat: true })
  assert.match(rrow.value, /切镜后画面几乎没变/)
  // planned shots longer than the beat limit are named
  const dense = det.analyzeHeldPictures({ segments: cutsEvery(0, 27), totalSec: 27, rhythm: { kind: 'beat' } })
  const longPlan = det.analyzeShotRhythm({ timeline: TL(3, 9), held: dense, totalSec: 27 })
  assert.equal(longPlan.longPlannedScenes.length, 3)
  assert.match(det.buildShotRhythmCheck(longPlan, { beat: true }).value, /3 个镜头规划时长超过 6 秒/)
  // a long scene split into beat-aligned sub-shots (scene.cuts, scene-local frames) is judged per sub-shot
  const subShots = TL(3, 9).map((r) => ({ ...r, scene: { cuts: [{ start: 0, end: 90 }, { start: 90, end: 180 }, { start: 180, end: 270 }] } }))
  const split = det.analyzeShotRhythm({ timeline: subShots, held: dense, totalSec: 27 })
  assert.equal(split.plannedCount, 9)
  assert.equal(split.longPlannedScenes.length, 0)
  assert.equal(split.severity, 'pass')
  assert.equal(split.plannedLongest.id, 'scene-01 第1镜')
})

// ------------------------------------------------------------------------------------------
// Held pictures on rendered clips
// ------------------------------------------------------------------------------------------
await test('synthetic: static picture with rotating rays and a flickering light = one 10-s hold (beat film fails)', async () => {
  const { held } = await heldOf(clipPath('rotating'), 'beat')
  const holds = held.holds.filter((h) => !h.titleOrEnd)
  assert.equal(holds.length, 1, JSON.stringify(held.holds))
  near(holds[0].startSec, 4, 0.5, 'hold start')
  near(holds[0].endSec, 14, 0.5, 'hold end')
  assert.equal(held.severity, 'fail')
})

await test('synthetic: slow zoom over 10 s = one 10-s hold (Ken Burns does not hide a held picture)', async () => {
  const { held } = await heldOf(clipPath('slowzoom'), 'beat')
  const holds = held.holds.filter((h) => !h.titleOrEnd)
  assert.equal(holds.length, 1, JSON.stringify(held.holds))
  near(holds[0].startSec, 4, 0.5, 'hold start')
  near(holds[0].endSec, 14, 0.5, 'hold end')
  assert.equal(held.severity, 'fail')
})

await test('synthetic: hard re-frames of one artwork every 1.5 s = new pictures, no hold (slow zoom of the same size is one hold)', async () => {
  const { held } = await heldOf(clipPath('reframe'), 'beat')
  assert.equal(held.holds.length, 0, JSON.stringify(held.holds))
  assert.ok(held.pictureCount >= 14, `pictures ${held.pictureCount}`)
  assert.equal(held.severity, 'pass')
})

await test('synthetic: rapid 1-s cuts = no hold (beat film passes)', async () => {
  const { held } = await heldOf(clipPath('rapid'), 'beat')
  assert.equal(held.holds.length, 0, JSON.stringify(held.holds))
  assert.ok(held.pictureCount >= 15, `pictures ${held.pictureCount}`)
  assert.equal(held.severity, 'pass')
})

await test('synthetic: a 5-s title card at the start is not judged (beat film passes)', async () => {
  const { held } = await heldOf(clipPath('title'), 'beat')
  assert.equal(held.holds.length, 1)
  near(held.holds[0].startSec, 0, 0.3, 'title start')
  near(held.holds[0].endSec, 5, 0.5, 'title end')
  assert.ok(held.holds[0].titleOrEnd)
  assert.equal(held.judgedShare, 0)
  assert.equal(held.severity, 'pass')
  assert.equal(det.buildHeldPictureCheck(held).passed, true)
})

await test('full post-render QA: held picture fails a beat film with time range + scene ids; temporal checks run', async () => {
  const proj = join(SCRATCH, 'proj')
  mkdirSync(join(proj, 'output'), { recursive: true })
  const scenes = [
    [0, 4],
    [4, 9],
    [9, 14],
    [14, 18],
  ].map(([a, b], i) => ({ id: `scene-0${i + 1}`, startFrame: a * 30, durationInFrames: (b - a) * 30, durationSec: b - a }))
  const script = { narrationMode: 'subtitle-mv', pacingMode: 'dynamic', fps: 30, width: 640, height: 360, totalDurationSec: 18, scenes }
  const t0 = Date.now()
  const rep = await qa.runPostRenderQa({ projectDir: proj, mp4Path: clipPath('rotating'), script })
  const ms = Date.now() - t0
  assert.equal(rep.passed, false)
  const row = rep.checks.find((c) => /^画面停留检测/.test(c.name))
  assert.ok(row && row.passed === false, JSON.stringify(row))
  assert.match(row.value, /0:04–0:14 同一画面 10 秒（scene-02、scene-03）/)
  assert.ok(rep.heldPictures && rep.heldPictures.severity === 'fail' && rep.heldPictures.rhythm.kind === 'beat')
  assert.ok(rep.shotRhythm && rep.shotRhythm.crossSceneHolds.length === 1)
  assert.match(rep.headline, /^成片质检未通过：.*画面停留检测/)
  assert.ok(rep.failures.some((f) => /画面停留过久/.test(f)))
  // the temporal pass is no longer skipped on an FFmpeg without scdet
  assert.ok(!rep.checks.some((c) => c.severity === 'skipped'), JSON.stringify(rep.checks.filter((c) => c.severity === 'skipped')))
  assert.ok(rep.checks.some((c) => /^跳帧\/渲染故障检测/.test(c.name)) && rep.checks.some((c) => /^冻结帧检测/.test(c.name)))
  assert.ok(rep.qaCapabilities && rep.qaCapabilities.filters.cuts)
  const saved = JSON.parse(readFileSync(join(proj, 'output', 'qa_report.json'), 'utf8'))
  assert.equal(saved.heldPictures.holds.length, rep.heldPictures.holds.length)
  // the same clip judged as a narrated film: no failure from held pictures
  const narr = await qa.runPostRenderQa({ projectDir: proj, mp4Path: clipPath('rotating'), script: { ...script, narrationMode: 'tts', pacingMode: 'balanced' }, temporal: false })
  assert.equal(narr.checks.find((c) => /^画面停留检测/.test(c.name)).passed, true)
  console.log(`    full QA on an 18-s clip: ${ms} ms (held pictures ${rep.heldPictures.analysisMs} ms)`)
})

// ------------------------------------------------------------------------------------------
// Real films (calibration set) — paths from env / args, skipped when absent
// ------------------------------------------------------------------------------------------
for (const film of REAL) {
  const present = Boolean(film.path) && existsSync(film.path)
  await test(
    `real film "${film.key}" (${film.rhythm}): share ≈ ${Math.round(film.share * 100)} % and ${film.expect}`,
    async () => {
      const { held, ms, durationSec } = await heldOf(film.path, film.rhythm)
      console.log(`    ${film.key}: ${durationSec.toFixed(1)} s film · held share ${(held.shareOfFilm * 100).toFixed(1)} % (judged ${(held.judgedShare * 100).toFixed(1)} %) · longest ${held.longestSec} s · ${held.pictureCount} pictures · ${held.severity} · ${ms} ms`)
      near(held.shareOfFilm, film.share, SHARE_TOLERANCE, 'share of film in holds ≥ 4 s')
      if (film.expect === 'fail') assert.equal(held.severity, 'fail')
      if (film.expect === 'pass') assert.equal(held.severity, 'pass')
      if (film.expect === 'not-fail') assert.notEqual(held.severity, 'fail')
      // a 2–3 minute film is checked in a few seconds
      assert.ok(ms < 15_000, `held-picture analysis took ${ms} ms`)
    },
    { skip: !present },
  )
}

// ------------------------------------------------------------------------------------------
// Summary + cleanup
// ------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.status === 'fail')
const passed = results.filter((r) => r.status === 'pass')
const skipped = results.filter((r) => r.status === 'skip')
try {
  safeRemove(SCRATCH)
  const parent = dirname(SCRATCH)
  if (existsSync(parent) && readdirSync(parent).length === 0) rmdirSync(parent)
} catch (err) {
  console.log(`cleanup warning: ${err.message}`)
}
console.log(`\n${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped · scratch ${existsSync(SCRATCH) ? 'NOT removed' : 'removed'}`)
process.exitCode = failed.length ? 1 : 0
