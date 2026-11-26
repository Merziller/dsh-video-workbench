#!/usr/bin/env node
/**
 * 看懂素材库 (footage index) — tests (no network, no model calls):
 *   - shot building: cuts closer than the minimum are dropped, long takes are split into usable windows
 *   - picture statistics: exposure, sharpness (Laplacian variance), motion between frames; quality score
 *   - segment picking: long enough + best looking first, no reuse until the library runs out, speech / quiet /
 *     action preferences, a short lead-in after a cut
 *   - a real synthetic recording (FFmpeg test patterns: pattern → black → fractal) is imported and indexed: the cuts
 *     are found, the black shot scores low, thumbnails are written, the index is re-used while the file is unchanged
 *
 *   node scripts/tests/footage-index.test.mjs
 *
 * Scratch data only (<repo>/.tmp/footage-index-test/<stamp>); the real `.env` is never read.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0' // never download the speech engine in tests

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'footage-index-test', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(SCR, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
Object.assign(process.env, { DSH_VIDEO_ENV_PATH: emptyEnv, DSH_VIDEO_SKIP_PROFILE_MOUNT: '1', DSH_ASR_HOME: join(SCR, 'no-asr') })
globalThis.fetch = async (input) => {
  throw new Error(`network blocked in tests: ${typeof input === 'string' ? input : input?.url || input}`)
}

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`)
}
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}

const fi = await imp('packages/dsh-tool-media/footage-index.js')

await section('shots', async () => {
  check('scene times parsed from showinfo, sorted, de-duplicated', JSON.stringify(fi.parseSceneTimes('n:0 pts:1 pts_time:3.0333 x\n n:1 pts_time:1.5 \n pts_time:3.0333')) === '[1.5,3.033]')
  const s = fi.buildShots([0.3, 4, 4.5, 9.9], 10, { minShotSec: 0.8, maxShotSec: 8 })
  check('cuts too close to the previous one or to the end are dropped', JSON.stringify(s.map((x) => [x.start, x.end])) === '[[0,4],[4,10]]', JSON.stringify(s.map((x) => [x.start, x.end])))
  const long = fi.buildShots([], 30, { minShotSec: 0.8, maxShotSec: 8 })
  check('a 30 s single take offers 4 windows of 7.5 s (same take)', long.length === 4 && long.every((x) => Math.abs(x.dur - 7.5) < 0.01 && x.take === 0) && long[3].end === 30)
  check('no duration → no shots', fi.buildShots([1, 2], 0).length === 0)
})

await section('picture statistics + quality', async () => {
  const W = 32
  const H = 18
  const flat = Buffer.alloc(W * H, 128)
  const dark = Buffer.alloc(W * H, 6)
  const checker = Buffer.alloc(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) checker[y * W + x] = (x + y) % 2 ? 230 : 25
  const shifted = Buffer.alloc(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) shifted[y * W + x] = (x + y + 1) % 2 ? 230 : 25
  const f = fi.frameStats([flat, flat, flat], W, H)
  const c = fi.frameStats([checker, checker, checker], W, H)
  const m = fi.frameStats([checker, shifted, checker], W, H)
  check('flat grey: no sharpness, no motion, mid exposure', f.sharpness === 0 && f.motion === 0 && Math.abs(f.brightness - 0.502) < 0.01, JSON.stringify(f))
  check('fine detail: high sharpness and contrast', c.sharpness > 0.8 && c.contrast > 0.7, JSON.stringify(c))
  check('changing frames: motion measured', m.motion > 0.5 && c.motion === 0, JSON.stringify(m))
  const good = fi.scoreShot({ brightness: 0.5, contrast: 0.5, sharpness: 0.8, motion: 0.1 })
  const black = fi.scoreShot(fi.frameStats([dark, dark, dark], W, H))
  const shaky = fi.scoreShot({ brightness: 0.5, contrast: 0.5, sharpness: 0.3, motion: 0.9 })
  check('quality: sharp + well exposed + steady beats black and shaky', good > 0.8 && black < 0.25 && shaky < good - 0.3, `${good} / ${black} / ${shaky}`)
  const pcm = Buffer.alloc(8000 * 2 * 2)
  for (let i = 8000; i < 16000; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 3) * 16000), i * 2)
  check('loudness per span: silence floor vs tone', fi.spanLoudness(pcm, 8000, 0, 1) === -90 && fi.spanLoudness(pcm, 8000, 1, 2) > -10)
  const shots = [{ start: 0, end: 4, dur: 4 }, { start: 4, end: 8, dur: 4 }]
  fi.attachSpeech(shots, [{ start: 0.5, end: 3, text: '大家好' }, { start: 3.6, end: 6, text: '今天说剪辑' }])
  check('speech attached where it is said', shots[0].speech === '大家好' && shots[1].speech === '今天说剪辑' && shots[0].speechSec === 2.9 && shots[1].speechSec === 2, JSON.stringify(shots))
})

await section('segment picking', async () => {
  const item = {
    id: 'v1',
    originalName: 'vlog.mp4',
    durationSec: 30,
    footage: {
      shots: [
        { i: 0, start: 0, end: 2, dur: 2, quality: 0.95, motion: 0.05 },
        { i: 1, start: 2, end: 9, dur: 7, quality: 0.7, motion: 0.1, speechSec: 6, speech: '今天去爬山' },
        { i: 2, start: 9, end: 15, dur: 6, quality: 0.9, motion: 0.5 },
        { i: 3, start: 15, end: 30, dur: 15, quality: 0.2, motion: 0.05 },
      ],
    },
  }
  const used = new Set()
  const a = fi.pickSegment(item, 5, { used })
  check('long enough + best looking wins over a short perfect one', a.shotIndex === 2 && a.fits && a.inSec === 9.25 && a.outSec === 14.25, JSON.stringify(a))
  const b = fi.pickSegment(item, 5, { used })
  check('a used shot is not picked again while others remain', b.shotIndex === 1, JSON.stringify(b))
  const s = fi.pickSegment(item, 5, { used: new Set(), mode: 'speech' })
  check('speech mode prefers the talking shot', s.shotIndex === 1)
  const q = fi.pickSegment(item, 5, { used: new Set(), mode: 'quiet' })
  check('quiet mode avoids the talking shot (B-roll under a voice-over)', q.shotIndex !== 1)
  const allUsed = new Set(['v1#0', 'v1#1', 'v1#2', 'v1#3'])
  check('reuse only once the library is exhausted', fi.pickSegment(item, 5, { used: allUsed }) !== null)
  check('no index → null', fi.pickSegment({ id: 'x' }, 3) === null)
  const plan = fi.planFootage({ items: [item, { id: 'v2', type: 'video', path: 'assets/v2.mp4', footage: { shots: [{ i: 0, start: 0, end: 6, dur: 6, quality: 0.85 }] } }].map((x) => ({ type: 'video', path: `assets/${x.id}.mp4`, ...x })) }, [{ key: 's1', needSec: 5 }, { key: 's2', needSec: 5 }, { key: 's3', needSec: 5 }])
  const picks = Object.values(plan).map((p) => `${p.assetId}#${p.shotIndex}`)
  check('planning across the library: three scenes get three different shots', picks.length === 3 && new Set(picks).size === 3, picks.join(','))
  const txt = fi.describeFootageForPrompt(item)
  check('prompt description lists shots with time, quality and what is said', txt.includes('vlog.mp4（30 秒，4 个镜头）') && txt.includes('#1 2.0-9.0s') && txt.includes('说：「今天去爬山」'), txt.split('\n')[0])
})

await section('real recording (FFmpeg test patterns)', async () => {
  const { resolveBinaries, runCommandRedirected } = await imp('packages/shared/index.js')
  const { importAssets, readAssets } = await imp('packages/dsh-tool-media/asset-manager.js')
  const { ffmpeg } = resolveBinaries()
  const src = join(SCR, 'patterns.mp4')
  const graph = [
    'testsrc=d=3:s=320x180:r=30[a]',
    'color=c=black:d=2:s=320x180:r=30[b]',
    'mandelbrot=s=320x180:r=30,trim=duration=3,setpts=PTS-STARTPTS,format=yuv420p[c]',
    '[a]format=yuv420p[a2]',
    '[b]format=yuv420p[b2]',
    '[a2][b2][c]concat=n=3:v=1:a=0[v]',
    'sine=f=440:d=8[s]',
  ].join(';')
  const mk = await runCommandRedirected(ffmpeg, ['-hide_banner', '-nostats', '-y', '-filter_complex', graph, '-map', '[v]', '-map', '[s]', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', src], { timeoutMs: 120_000 })
  check('synthetic recording made', mk.code === 0 && existsSync(src), String(mk.stderr || '').slice(-300))
  const proj = join(SCR, 'proj')
  mkdirSync(proj, { recursive: true })
  await importAssets({ projectDir: proj, sources: [src] })
  const progress = []
  const r = await fi.indexFootage({ projectDir: proj, transcribe: 'off', onProgress: (p) => progress.push(p.message) })
  const item = readAssets(proj).items.find((x) => x.type === 'video')
  const shots = item?.footage?.shots || []
  check('the two cuts are found (3 takes)', item?.footage?.takes === 3 && shots.length === 3, JSON.stringify(shots.map((s) => [s.start, s.end])))
  check('cut times near 3 s and 5 s', shots.length === 3 && Math.abs(shots[1].start - 3) < 0.1 && Math.abs(shots[2].start - 5) < 0.1)
  check('the black shot scores lowest, the patterns score well', shots.length === 3 && shots[1].quality < 0.3 && shots[0].quality > 0.55 && shots[2].quality > 0.55, shots.map((s) => s.quality).join(' / '))
  check('every shot has a thumbnail and a loudness', shots.every((s) => s.thumb && existsSync(join(proj, s.thumb)) && s.loudness > -30))
  check('progress is reported in plain Chinese', progress.some((m) => /镜头/.test(m)) && r.indexed.length === 1)
  const again = await fi.indexFootage({ projectDir: proj, transcribe: 'off' })
  check('the index is re-used while the file is unchanged', again.indexed.length === 0 && again.skipped[0]?.reason === '已分析（文件未变）')
  const pick = fi.pickSegment(item, 2)
  check('a 2 s scene gets a window from a good shot, never the black one', pick && pick.shotIndex !== 1 && pick.outSec - pick.inSec === 2, JSON.stringify(pick))
})

await section('scene media windows (长视频只用需要的那段)', async () => {
  const shot = (i, take, start, end, quality, speech = '') => ({ i, take, start, end, dur: Number((end - start).toFixed(3)), quality, speechSec: speech ? end - start : 0, speech, motion: 0.1 })
  const longClip = {
    id: 'v1',
    type: 'video',
    path: 'assets/video/long.mp4',
    durationSec: 60,
    footage: {
      durationSec: 60,
      shots: [
        shot(0, 0, 0, 8, 0.2), // dark opening
        shot(1, 0, 8, 16, 0.8),
        shot(2, 0, 16, 24, 0.82, '我们先打开设置页面然后选择导出格式'),
        shot(3, 1, 24, 30, 0.75),
        shot(4, 1, 30, 38, 0.7),
        shot(5, 2, 38, 46, 0.78),
      ],
    },
  }
  const shortClip = { id: 'v2', type: 'video', path: 'assets/video/short.mp4', durationSec: 3, footage: { durationSec: 3, shots: [shot(0, 0, 0, 3, 0.9)] } }
  const manifest = { items: [longClip, shortClip] }
  const script = {
    fps: 30,
    scenes: [
      { id: 's1', durationSec: 4, narration: '片头', media: [{ assetId: 'v1', path: 'assets/video/long.mp4', type: 'video', trimStartSec: 0 }] },
      { id: 's2', durationSec: 5, narration: '打开设置页面，选择导出格式', media: [{ assetId: 'v1', path: 'assets/video/long.mp4', type: 'video' }] },
      { id: 's3', durationSec: 12, narration: '第三段', media: [{ path: 'assets/video/long.mp4', type: 'video' }] },
      { id: 's4', durationSec: 4, media: [{ assetId: 'v1', type: 'video', trimStartSec: 40, trimEndSec: 44 }] },
      { id: 's5', durationSec: 2, media: [{ assetId: 'v2', type: 'video' }] },
    ],
  }
  const r = fi.assignFootageWindows(script, manifest)
  const [m1, m2, m3, m4, m5] = script.scenes.map((s) => s.media[0])
  check('long clips get a window instead of always starting at 0 s', r.assigned === 3 && m1.trimAuto && m1.trimEndSec - m1.trimStartSec === 4, JSON.stringify(m1))
  check('the dark opening shot is never chosen', [m1, m2, m3].every((m) => m.footageShot !== 0))
  check('a scene about what is said in a shot gets that shot', m2.footageShot === 2, JSON.stringify(m2))
  check('no shot is used twice while others are left', new Set([m1.footageShot, m2.footageShot, m3.footageShot, 5]).size === 4, [m1.footageShot, m2.footageShot, m3.footageShot].join(','))
  check('a scene longer than one shot runs on into the same take', m3.trimEndSec - m3.trimStartSec >= 11.9 || m3.trimEndSec - m3.trimStartSec >= 7.9, `${m3.trimStartSec}–${m3.trimEndSec}`)
  check('a window the user set is kept (and avoided by the others)', m4.trimStartSec === 40 && m4.trimEndSec === 44 && !m4.trimAuto && m1.footageShot !== 5 && m2.footageShot !== 5)
  check('a clip about as long as its scene plays whole', m5.trimEndSec === undefined && !m5.trimAuto)
  script.scenes[0].durationSec = 6
  const again = fi.assignFootageWindows(script, manifest)
  check('windows the plugin chose are re-chosen when the scene length changes', again.assigned === 3 && Math.abs(script.scenes[0].media[0].trimEndSec - script.scenes[0].media[0].trimStartSec - 6) < 0.01)
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
