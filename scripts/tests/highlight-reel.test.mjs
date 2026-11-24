#!/usr/bin/env node
/**
 * Vlog 高光 (highlight reel) — tests (local, no model calls):
 *   - cuts land on the beats: longer shots on calm music, quick cuts after a drop, every shot 0.6–4.2 s, ends on target
 *   - shot choice: no dark / poor shots while good ones are left, story order follows the recording, the strongest
 *     music gets the moving shots in 'best' order, a re-used shot shows a different moment, stills avoid long cuts
 *   - frame size follows the clips' orientation
 *   - a project built from real FFmpeg test clips + a beat track: talk-kit presenter scenes on the beats, the music as
 *     the only sound, an opening title, Remotion + HTML draft written
 *
 *   node scripts/tests/highlight-reel.test.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'highlight-test', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(SCR, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
Object.assign(process.env, { DSH_VIDEO_ENV_PATH: emptyEnv, DSH_VIDEO_SKIP_PROFILE_MOUNT: '1', DSH_VIDEO_RUNNER_ISOLATED: '1' })

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
const hr = await imp('packages/dsh-tool-media/highlight-reel.js')

await section('cuts on the beats', async () => {
  // 120 BPM, quiet for 8 s, loud after a drop at 8 s
  const beats = []
  for (let k = 0; k < 60; k++) beats.push({ time: k * 0.5, strong: k % 4 === 0, energy: k < 16 ? 0.2 : 0.9 })
  const segs = hr.planHighlightCuts({ bpm: 120, beatSec: 0.5, beats, drops: [8] }, 20)
  const lens = segs.map((s) => s.endSec - s.startSec)
  check('the film starts at 0 and ends exactly on the target', segs[0].startSec === 0 && Math.abs(segs[segs.length - 1].endSec - 20) < 1e-6)
  check('every cut is on a beat and the cuts are contiguous', segs.every((s, i) => (i === 0 || Math.abs(s.startSec - segs[i - 1].endSec) < 1e-6) && Math.abs(s.startSec / 0.5 - Math.round(s.startSec / 0.5)) < 1e-6))
  check('every shot stays between 0.6 and 4.2 s', lens.every((l) => l >= 0.59 && l <= 4.21), lens.map((l) => l.toFixed(1)).join(','))
  const before = lens.filter((_, i) => segs[i].startSec < 8)
  const after = lens.filter((_, i) => segs[i].startSec >= 8)
  check('calm music gets longer shots, the bars after the drop quick cuts', Math.min(...before) >= 2 && Math.max(...after.slice(0, 8)) <= 1.01, `${before.join(',')} | ${after.slice(0, 8).join(',')}`)
  const syn = hr.syntheticBeats(10, 112)
  check('films without music get a regular 112 BPM grid', syn.bpm === 112 && syn.beats.length > 18 && syn.beats[1].time > 0.53 && syn.beats[1].time < 0.54)
  const fallback = hr.planHighlightCuts({ beats: [] }, 10)
  check('no beat information: even cuts', fallback.length === 4 && fallback[3].endSec === 10)
})

await section('choosing the shots', async () => {
  const shot = (i, start, end, quality, motion, take = i) => ({ i, take, start, end, dur: end - start, quality, motion })
  const clipA = { id: 'a', name: 'A', footage: { shots: [shot(0, 0, 4, 0.8, 0.05), shot(1, 4, 6, 0.1, 0.0), shot(2, 6, 10, 0.75, 0.3)] } }
  const clipB = { id: 'b', name: 'B', footage: { shots: [shot(0, 0, 5, 0.7, 0.6), shot(1, 5, 9, 0.72, 0.5)] } }
  const segs = [
    { startSec: 0, endSec: 2, energy: 0.2 },
    { startSec: 2, endSec: 4, energy: 0.2 },
    { startSec: 4, endSec: 5, energy: 0.9 },
    { startSec: 5, endSec: 6, energy: 0.9 },
  ]
  const story = hr.assignHighlightShots(segs, [clipA, clipB], { order: 'story' })
  check('every cut gets a window of its exact length', story.length === 4 && story.every((p) => Math.abs(p.outSec - p.inSec - (p.seg.endSec - p.seg.startSec)) < 0.01))
  check('the dark / poor shot is never used while good ones are left', story.every((p) => !(p.clip.id === 'a' && p.shot.i === 1)))
  const order = story.map((p) => `${p.clip.id}${p.shot.i}`)
  check('story order follows the recording order', JSON.stringify(order) === JSON.stringify(['a0', 'a2', 'b0', 'b1']), order.join(','))
  const best = hr.assignHighlightShots(segs, [clipA, clipB], { order: 'best' })
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  const loud = best.filter((p) => p.seg.energy > 0.5).map((p) => p.shot.motion)
  const calm = best.filter((p) => p.seg.energy <= 0.5).map((p) => p.shot.motion)
  check("'best' order puts the moving shots on the loud music", mean(loud) > mean(calm) && loud.every((m) => m >= 0.3), `${loud.join(',')} | ${calm.join(',')}`)
  // more cuts than shots: re-used shots show another moment
  const many = Array.from({ length: 8 }, (_, k) => ({ startSec: k, endSec: k + 1, energy: 0.6 }))
  const re = hr.assignHighlightShots(many, [clipB], { order: 'story' })
  const ins = re.filter((p) => p.shot.i === 0).map((p) => p.inSec)
  check('a re-used shot shows a different moment', new Set(ins).size === ins.length && ins.length >= 2, ins.join(','))
  const still = { id: 's', name: 'S', footage: { shots: [shot(0, 0, 8, 0.95, 0.0)] } }
  const moving = { id: 'm', name: 'M', footage: { shots: [shot(0, 0, 8, 0.7, 0.4)] } }
  const pick = hr.assignHighlightShots([{ startSec: 0, endSec: 3, energy: 0.2 }], [still, moving], { order: 'best' })
  check('a picture that never moves is not used for a long cut when footage that moves is there', pick[0].clip.id === 'm')
  check('frame size follows the clips (portrait clips → 9:16)', hr.highlightDims([{ width: 1080, height: 1920, durationSec: 20 }, { width: 1920, height: 1080, durationSec: 5 }]).height === 1920 && hr.highlightDims([], '1:1').width === 1080)
})

await section('a project from real clips and a beat track', async () => {
  const { resolveBinaries, readScriptJson } = await imp('packages/shared/index.js')
  const { ffmpeg } = resolveBinaries()
  const src = join(SCR, 'src')
  mkdirSync(src, { recursive: true })
  const run = (args) => spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', ...args], { windowsHide: true })
  const a = join(src, 'trip-a.mp4')
  const b = join(src, 'trip-b.mp4')
  const mus = join(src, 'beat.wav')
  run(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', a])
  run(['-f', 'lavfi', '-i', 'mandelbrot=s=640x360:r=30,trim=duration=6,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', b])
  run(['-f', 'lavfi', '-i', "aevalsrc='(if(gte(t,6),0.9,0.35)*sin(2*PI*55*t)*exp(-30*mod(t,0.5)))':s=22050:d=16", mus])
  check('test clips and music written', existsSync(a) && existsSync(b) && existsSync(mus))
  const proj = join(SCR, 'proj')
  const am = await imp('packages/dsh-tool-media/asset-manager.js')
  await am.importAssets({ projectDir: proj, sources: [a, b, mus] })
  const progress = []
  const res = await hr.buildHighlightProject({ projectDir: proj, title: '周末出游', onProgress: (p) => progress.push(p.message) })
  const sc = readScriptJson(proj).data
  check('the project is a highlight film on the talk kit', sc.productionType === 'highlight' && sc.authoringMode === 'talk-kit' && sc.engine === 'remotion' && sc.scenes.every((s) => s.layout === 'presenter' && s.presenter.jumpZoom === false && Array.isArray(s.presenter.kenBurns)))
  const fps = sc.fps
  const ends = sc.scenes.map((s) => (s.startFrame + s.durationInFrames) / fps)
  check('scenes are contiguous and cut on the beats of the track', sc.scenes.every((s, i) => i === 0 || s.startFrame === sc.scenes[i - 1].startFrame + sc.scenes[i - 1].durationInFrames) && ends.slice(0, -1).every((t) => Math.abs(t / 0.5 - Math.round(t / 0.5)) < 0.08), ends.map((t) => t.toFixed(2)).join(','))
  check('the uploaded music is the only sound (no voice)', sc.bgmMode === 'uploaded' && sc.bgm.uploadedPath && sc.bgm.volume === 1 && sc.scenes.every((s) => s.voiceSource === 'none' && !s.audioFile))
  check('an opening title, no captions', sc.talkPack?.lowerThird?.name === '周末出游' && sc.talkPack.captions === false)
  check('the clip windows are recorded on the scene media (re-usable, replaceable)', sc.scenes.every((s) => s.media?.[0]?.trimAuto && s.media[0].trimEndSec > s.media[0].trimStartSec))
  check('Remotion project and HTML draft written', existsSync(join(proj, 'src', 'VideoComposition.tsx')) && existsSync(join(proj, 'index.html')) && readFileSync(join(proj, 'index.html'), 'utf8').includes('k-presenter-video'))
  check('progress in plain Chinese', progress.some((m) => /节拍/.test(m)) && progress.some((m) => /高光工程已生成/.test(m)) && res.clipsUsed === 2)
  let empty = null
  try {
    const p2 = join(SCR, 'empty')
    mkdirSync(p2, { recursive: true })
    await hr.buildHighlightProject({ projectDir: p2 })
  } catch (e) {
    empty = e
  }
  check('an empty library gets a plain explanation', /素材库里还没有视频/.test(empty?.message || ''))
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
