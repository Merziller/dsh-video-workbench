#!/usr/bin/env node
/**
 * Beat-locked sub-shots (`scene.cuts`) — the 「高燃卡点」 films that held one picture for 10+ seconds:
 *   - pure-music timing never stretches a sparse plan into long held pictures: long scenes get beat-aligned sub-shots
 *     no longer than the pacing cap, the film meets its target length to the frame (13 shots / 134 s at 90 BPM,
 *     2 shots / 90 s at 119 BPM, 36 shots / 90 s), TTS / narration-timed films keep their exact timing
 *   - subtitle chunks are cut only at spaces / punctuation and change on the cut frames
 *   - the renderers enforce the cuts: the Remotion composition re-frames every scene per sub-shot (and type-checks),
 *     the HTML draft carries the cut runtime, the coder prompt gets the sub-shot windows
 *   - scene-code checks: a scene id missing from a batch's export dictionary is reported, the motion-check metric
 *     flags a held picture; a sparse 「AI 编码出片」 plan gets a plain-Chinese notice
 *   - the built-in diorama only draws ancient warriors for history (毛选 / 抗战 / science topics get present-day people)
 *
 *   node scripts/tests/beat-cuts.test.mjs
 *
 * Offline: no model calls, no network, no rendering (the strict TypeScript check runs when a compiler is installed).
 * Scratch data only (<repo>/.tmp/beat-cuts/<stamp>); the real `.env` / DSH client are never read.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'beat-cuts', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
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
const imp = (rel) => import(pathToFileURL(join(ROOT, ...rel.split('/'))).href)
const section = async (name, fn) => {
  try {
    await fn()
  } catch (err) {
    check(`${name} (threw)`, false, String(err?.stack || err).slice(0, 600))
  }
}

const ba = await imp('packages/dsh-tool-media/beat-analyzer.js')
const FPS = 30
const grid = (bpm, durationSec, phaseSec = 0) => {
  const beatSec = 60 / bpm
  const beats = []
  for (let i = 0, t = phaseSec; t <= durationSec; i++, t += beatSec) beats.push({ time: Number(t.toFixed(4)), strong: i % 4 === 0, index: i, isDrop: false })
  return { analyzed: true, bpm, beatSec, phaseSec, barOffset: 0, durationSec, beats }
}
const LINE = '第一镜，霍去病率八百骑兵深入大漠，奔袭数百里直捣匈奴王庭。'
const plan = (counts) => counts.map((c, i) => ({ id: `scene-${String(i + 1).padStart(2, '0')}`, title: `t${i + 1}`, narration: LINE, beatCount: c, transition: i ? 'slash-wipe' : 'cut' }))
const MV = { mode: 'subtitle-mv', fps: FPS, genre: 'history-theater', narrationMode: 'subtitle-mv', pacingMode: 'dynamic' }
const totalSec = (scs) => {
  const l = scs[scs.length - 1]
  return (l.startFrame + l.durationInFrames) / FPS
}
/** every picture of the film: a sub-shot, or a whole scene without cuts */
const pictures = (scs) => scs.flatMap((s) => (Array.isArray(s.cuts) ? s.cuts.map((c) => (c.end - c.start) / FPS) : [s.durationInFrames / FPS]))
/** cut starts (absolute seconds) that are not within one frame of a (half-)beat of the grid */
const offGrid = (scs, g) =>
  scs.flatMap((s) => (s.cuts || []).slice(1).map((c) => (s.startFrame + c.start) / FPS)).filter((t) => {
    const k = (t - g.phaseSec) / g.beatSec
    return Math.abs(Math.round(k * 2) / 2 - k) * g.beatSec > 1.01 / FPS
  })
const contiguous = (s) => Array.isArray(s.cuts) && s.cuts[0].start === 0 && s.cuts[s.cuts.length - 1].end === s.durationInFrames && s.cuts.every((c, k) => c.end > c.start && (k === 0 || c.start === s.cuts[k - 1].end))

/* ------------------------------------------------------------------------------------------ pure-music timing */
await section('sparse plans get beat-aligned sub-shots', async () => {
  // 霍去病: 13 shots planned at 4 beats (two 1.5-beat flashes), 134 s target at 90 BPM — was ×3.9 → 10.7 s pictures
  const g90 = grid(90, 142.6)
  const hu = ba.quantizeScenesToBeatGrid(plan([6, 4, 4, 4, 4, 1.5, 4, 4, 4, 4, 4, 1.5, 5.5]), g90, { ...MV, targetDurationSec: 134 })
  const cap = ba.resolveSubShotPacing(MV, g90.beatSec)
  const longest = Math.max(...pictures(hu))
  check('霍去病 case: no picture longer than the dynamic cap (≤ 6 beats)', longest <= cap.capBeats * g90.beatSec + 1 / FPS && cap.capBeats <= 6, `longest ${longest.toFixed(2)} s, cap ${cap.capBeats} beats`)
  check('霍去病 case: the picture changes at least every 4 beats', longest <= 4 * g90.beatSec + 1 / FPS, longest.toFixed(2))
  check('霍去病 case: total = target within one frame', Math.abs(totalSec(hu) - 134) <= 1 / FPS, totalSec(hu).toFixed(3))
  check('霍去病 case: every sub-shot cut sits on the beat grid', offGrid(hu, g90).length === 0, `${offGrid(hu, g90).length} off-grid`)
  check('霍去病 case: cuts are contiguous and cover each scene', hu.filter((s) => s.cuts).every(contiguous) && hu.filter((s) => s.cuts).length >= 10)
  check('霍去病 case: the 1.5-beat flash shots stay short accents', hu[5].durationInFrames / FPS < 1.6 && !hu[5].cuts, (hu[5].durationInFrames / FPS).toFixed(2))
  check('cut framings come from the fixed vocabulary, neighbours differ', hu.every((s) => (s.cuts || []).every((c, k) => ba.CUT_FRAMINGS.includes(c.framing) && (k === 0 || c.framing !== s.cuts[k - 1].framing))))
  check('cut focus points are inside the frame', hu.every((s) => (s.cuts || []).every((c) => c.focus.x >= 0 && c.focus.x <= 1 && c.focus.y >= 0 && c.focus.y <= 1)))

  // 毛选: 2 shots, 90 s target at 119 BPM — was two 45 s pictures
  const g119 = grid(119, 141)
  const mao = ba.quantizeScenesToBeatGrid(plan([4, 4]), g119, { ...MV, targetDurationSec: 90 })
  const maoLongest = Math.max(...pictures(mao))
  check('毛选 case: a new picture every few beats (≤ 4.5 beats)', maoLongest <= 4.5 * g119.beatSec, `${maoLongest.toFixed(2)} s, ${pictures(mao).length} pictures`)
  check('毛选 case: total = target within one frame, cuts on the grid', Math.abs(totalSec(mao) - 90) <= 1 / FPS && offGrid(mao, g119).length === 0, totalSec(mao).toFixed(3))

  // a late first beat (0.4 s): the opening shot counts its cuts back from its last beat — still whole beats
  const gLate = grid(90, 150, 0.4)
  const late = ba.quantizeScenesToBeatGrid(plan([6, 4, 4, 1.5, 5.5]), gLate, { ...MV, targetDurationSec: 60 })
  const wholeOff = late.flatMap((s) => (s.cuts || []).slice(1).map((c) => (s.startFrame + c.start) / FPS)).filter((t) => {
    const k = (t - gLate.phaseSec) / gLate.beatSec
    return Math.abs(Math.round(k) - k) * gLate.beatSec > 1.01 / FPS
  })
  check('late first beat: sub-shot cuts stay on whole beats', wholeOff.length === 0 && late.some((s) => s.cuts), `${wholeOff.length} off`)

  // 36 shots, 90 s: the old timing drifted to 92.97 s
  const dense = ba.quantizeScenesToBeatGrid(plan(Array.from({ length: 36 }, (_, i) => (i % 7 === 3 ? 1 : i % 2 ? 2 : 4))), g119, { ...MV, targetDurationSec: 90 })
  check('36 shots / 90 s: exactly 90 s', Math.abs(totalSec(dense) - 90) <= 1 / FPS, totalSec(dense).toFixed(3))
  check('36 shots / 90 s: no picture beyond the cap', Math.max(...pictures(dense)) <= 6 * g119.beatSec + 1 / FPS)

  // a plan that already fits keeps its shots whole and its planned length
  const fit = ba.quantizeScenesToBeatGrid(plan([4, 2, 2, 4, 1, 3, 4]), grid(100, 40), MV)
  check('a plan that fits gets no sub-shots', fit.every((s) => !s.cuts), fit.map((s) => (s.cuts || []).length).join(','))
  check('stale cuts from an earlier timing are removed', !ba.quantizeScenesToBeatGrid(plan([4, 4]).map((s) => ({ ...s, cuts: [{ start: 0, end: 9 }, { start: 9, end: 99 }] })), grid(100, 40), MV).some((s) => s.cuts))

  // pacing caps: balanced holds longer than dynamic, calm longer still
  const pDyn = ba.resolveSubShotPacing({ pacingMode: 'dynamic' }, 0.6)
  const pBal = ba.resolveSubShotPacing({ pacingMode: 'balanced' }, 0.6)
  const pCalm = ba.resolveSubShotPacing({ pacingMode: 'calm' }, 0.6)
  check('pacing caps: dynamic 4–6 beats, balanced ≈ 8 beats / 5.5 s, calm longer', pDyn.capBeats >= 4 && pDyn.capBeats <= 6 && pBal.capBeats <= 8 && pBal.capSec <= 5.5 && pCalm.capSec > pBal.capSec, `${pDyn.capBeats}/${pBal.capBeats}/${pCalm.capBeats} beats`)
  check('auto pacing of a pure-music film is the fast profile', ba.resolveSubShotPacing({ pacingMode: 'auto', narrationMode: 'subtitle-mv' }, 0.6).id === 'dynamic')
})

/* ------------------------------------------------------------------------------------------ TTS timing */
await section('TTS films keep their voice timing', async () => {
  // frame layout of the previous release on the same input (golden values): the voice decides, nothing changes
  const g = { analyzed: true, bpm: 96, beatSec: 0.625, phaseSec: 0.05, durationSec: 80, beats: [] }
  for (let i = 0, t = 0.05; t <= 80; i++, t += 0.625) g.beats.push({ time: Number(t.toFixed(4)), strong: i % 4 === 0, index: i })
  const mk = () => [3.1, 5.4, 2.2, 7.9, 4.4].map((v, i) => ({
    id: `scene-0${i + 1}`,
    narration: '这是一段配音',
    durationSec: v + 0.6,
    voiceDurationSec: v,
    voiceLeadSec: 0.28,
    cuts: i === 1 ? [{ start: 0, end: 30 }, { start: 30, end: 90 }] : undefined,
    subtitles: [{ text: '这是一段配音', startSec: 0, endSec: v, localStartSec: 0, localEndSec: v }],
  }))
  const opts = { mode: 'tts-beat-sync', fps: FPS, genre: 'product-promo', narrationMode: 'tts-beat-sync' }
  const free = ba.quantizeScenesToBeatGrid(mk(), g, opts).map((s) => [s.startFrame, s.durationInFrames])
  const tgt = ba.quantizeScenesToBeatGrid(mk(), g, { ...opts, targetDurationSec: 40 }).map((s) => [s.startFrame, s.durationInFrames])
  check('TTS film without a target: unchanged frame layout', JSON.stringify(free) === JSON.stringify([[0, 114], [114, 188], [302, 93], [395, 263], [658, 150]]), JSON.stringify(free))
  check('TTS film with a target: unchanged frame layout', JSON.stringify(tgt) === JSON.stringify([[0, 208], [208, 281], [489, 188], [677, 356], [1033, 234]]), JSON.stringify(tgt))
  check('TTS films never get sub-shots', ba.quantizeScenesToBeatGrid(mk(), g, opts).every((s) => !s.cuts))
})

/* ------------------------------------------------------------------------------------------ subtitle chunks */
await section('subtitle chunks are well formed', async () => {
  const strip = (s) => s.replace(/[\s，、,；;：:。]/g, '')
  const zh = '项羽率八千江东子弟渡江而西，破釜沉舟，与秦军决战于巨鹿城下，九战九捷，威震诸侯！'
  const zc = ba.chunkSubtitleText(zh)
  check('Chinese: chunks rebuild the line in order', strip(zc.join('')) === strip(zh), zc.join(' | '))
  check('Chinese: readable chunks (≤ 16 characters unless one clause is longer)', zc.every((c) => c.length <= 16 || !/[，、,；;：:。！？]/.test(c.slice(0, -1))), zc.map((c) => c.length).join(','))
  check('Chinese: chunks end on clause boundaries, no trailing comma', zc.every((c) => !/[，、,；;：:。]$/.test(c)))
  const en = 'The empire rose from the steppe, and within a single generation its riders reached the gates of Europe.'
  const ec = ba.chunkSubtitleText(en, 16)
  const words = new Set(en.replace(/[,.]/g, '').split(/\s+/))
  check('English: never cuts inside a word', ec.length >= 2 && ec.every((c) => c.replace(/[,.]/g, '').split(/\s+/).every((w) => words.has(w))), ec.join(' | '))
  check('English: chunks rebuild the sentence', ec.join(' ').replace(/[,.]/g, '') === en.replace(/[,.]/g, ''))

  const g = grid(90, 60)
  const sc = ba.quantizeScenesToBeatGrid([{ id: 'scene-01', narration: zh, beatCount: 4 }, { id: 'scene-02', narration: '尾声', beatCount: 4 }], g, { ...MV, targetDurationSec: 30 })[0]
  const subs = sc.subtitles || []
  const cutStarts = new Set(sc.cuts.map((c) => c.start))
  check('cut texts follow the line in reading order', strip(subs.map((u) => u.text).join('')) === strip(zh), subs.map((u) => u.text).join(' | '))
  check('every subtitle starts and ends on a cut', subs.length >= 2 && subs.every((u) => cutStarts.has(u.startFrame) && (u.endFrame === sc.durationInFrames || cutStarts.has(u.endFrame))))
  check('subtitles are contiguous and cover the scene', subs[0].startFrame === 0 && subs[subs.length - 1].endFrame === sc.durationInFrames && subs.every((u, k) => k === 0 || u.startFrame === subs[k - 1].endFrame))
  check('every sub-shot carries its chunk', sc.cuts.every((c) => c.text && subs.some((u) => u.text === c.text && u.startFrame <= c.start && u.endFrame >= c.end)))
  const norm = ba.normalizeSceneCuts([{ start: 40, end: 90, framing: 'close' }, { start: 0, end: 40, framing: 'nope', focus: { x: 3, y: -1 } }], 120)
  check('normalizeSceneCuts repairs edited timing (sorted, contiguous, to the end, known framings, focus clamped)', norm.length === 2 && norm[0].framing === 'wide' && norm[1].end === 120 && norm[0].focus.x === 1 && norm[0].focus.y === 0, JSON.stringify(norm))
})

/* ------------------------------------------------------------------------------------------ renderers + prompt */
await section('the renderers enforce the cuts', async () => {
  const rg = await imp('packages/dsh-tool-media/remotion-generator.js')
  const hg = await imp('packages/dsh-tool-media/html-generator.js')
  const sl = await imp('packages/dsh-tool-media/shotcraft-lib.js')
  const g = grid(119, 60)
  const scenes = ba.quantizeScenesToBeatGrid(
    ['hero-numeral', 'hero-stand', 'bamboo-slips'].map((a, i) => ({ id: `scene-0${i + 1}`, title: `第${i + 1}镜`, narration: '矛盾论告诉我们，抓住主要矛盾，问题就迎刃而解。', beatCount: 4, layout: 'narrative-diorama', stageSpec: { mood: 'dawn-amber', archetype: a, heroNum: '1937' } })),
    g,
    { ...MV, targetDurationSec: 30 },
  )
  const last = scenes[scenes.length - 1]
  const script = {
    title: '毛选里的矛盾论', topic: '毛选里的矛盾论：打工人如何看清主要矛盾', engine: 'remotion', genre: 'history-theater', genreLabel: '理论学习', narrationMode: 'subtitle-mv', pacingMode: 'dynamic',
    fps: FPS, width: 1280, height: 720, bgm: g, scenes, subtitles: scenes.flatMap((s) => s.subtitles || []), totalDurationInFrames: last.startFrame + last.durationInFrames,
  }
  check('the test script has sub-shots', scenes.every((s) => Array.isArray(s.cuts) && s.cuts.length >= 2))
  const proj = join(dirs.ws, 'cuts-remotion')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'script.json'), JSON.stringify(script, null, 2))
  rg.writeRemotionProjectFiles(proj, script, {})
  const vc = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  check('Remotion: every scene is wrapped in the per-cut re-frame', /<CutReframe scene=\{scene\}>\s*<SceneStage/.test(vc) && vc.includes('function resolveSceneCut('))
  check('Remotion: AI-coded scenes receive the active sub-shot (scene.cut)', /cut: activeCut \?/.test(vc))
  check('Remotion: the camera travel restarts per sub-shot', vc.includes('rigCut.index * 3') && vc.includes('interpolate(segP'))
  check('Remotion: a cut is a re-frame, never a white flash', !/CutReframe[\s\S]{0,1600}backgroundColor:\s*'#FFFFFF'/.test(vc.slice(vc.indexOf('const CutReframe'), vc.indexOf('const CutReframe') + 1700)))
  check('Remotion: a modern topic gets the modern diorama', /const DIORAMA_THEME[^\n]*"era":"modern"/.test(vc))
  const dio = readFileSync(join(proj, 'src', 'lib', 'narrative-diorama.tsx'), 'utf8')
  check('Remotion: the diorama re-frames per cut and imports its people from the figure kit', dio.includes('dioramaCutAt(scene, localFrame)') && dio.includes("from './figure-kit'") && readFileSync(join(proj, 'src', 'lib', 'figure-kit.tsx'), 'utf8').length > 1000)

  // strict TypeScript check of the generated project (skipped when no compiler is installed)
  const shared = await imp('packages/shared/index.js')
  const suite = await imp('packages/dsh-tool-video-suite/qa-checker.js')
  shared.ensureRemotionJunction(proj)
  const tc = await suite.runTypecheckOnProject(proj)
  check(`Remotion: the project with sub-shots type-checks${tc?.skipped ? ' (skipped: no TypeScript)' : ''}`, tc?.ok === true, JSON.stringify((tc?.errors || []).slice(0, 3)).slice(0, 400))

  const html = String(hg.buildRichHtmlVideo(script) || '')
  check('HTML draft: carries the cut runtime (re-frame + per-cut camera)', html.includes('function cutAt(meta, lf)') && html.includes('CUT_SPEC') && html.includes("+ reframe;"))
  check('HTML draft: the timeline payload has the sub-shots', /"cuts":\[\{"start":0,"end":\d+,"framing":"(wide|medium)"/.test(html))

  const pr = sl.buildBatchedRemotionScenesPrompt({ batchIndex: 0, totalBatches: 1, batchScenes: scenes, totalScenes: scenes.length, width: 1280, height: 720, fps: FPS, topic: script.topic, genre: 'other', narrationMode: 'subtitle-mv', allScenes: scenes })
  const userJson = JSON.parse(pr.user)
  const w = userJson.scenes[0].subShots
  check('coder prompt: every scene comes with its sub-shot windows (frames, seconds, framing)', Array.isArray(w) && w.length === scenes[0].cuts.length && w.every((x) => Number.isInteger(x.startFrame) && x.toSec > x.fromSec && ba.CUT_FRAMINGS.includes(x.framing)))
  check('coder prompt: asks for a new composition per window, not one slow push', pr.system.includes('镜内硬切') && pr.system.includes('scene.cut.index') && pr.system.includes('每个窗口都是一个新画面'))
  check('coder prompt: the whole-shot motion rule is kept', pr.system.includes('任何一秒都要有看得见的变化') && pr.system.includes('有 `subShots` 的镜头按子镜头窗口计时'))
  const epic = sl.buildBatchedRemotionScenesPrompt({ batchIndex: 0, totalBatches: 1, batchScenes: scenes, totalScenes: scenes.length, width: 1280, height: 720, fps: FPS, topic: '项羽生平 巨鹿之战', genre: 'history-theater', narrationMode: 'subtitle-mv', allScenes: scenes })
  check('coder prompt: the epic quiet-shot rule is kept', epic.system.includes('全程有动势') && epic.system.includes('不得出现超过 0.5 秒的静止画面'))
})

/* ------------------------------------------------------------------------------------------ scene-code checks */
await section('scene-code checks', async () => {
  const coder = await imp('packages/dsh-tool-media/ai-coder.js')
  const good = "import React from 'react';\nimport { useCurrentFrame } from 'remotion';\nconst A = () => { useCurrentFrame(); return null; };\nexport const BATCH_01_SCENES: Record<string, React.FC<any>> = {\n  'scene-01': A,\n  \"scene-02\": A,\n};\n"
  check('registered scene ids pass', coder.findUnregisteredSceneIds(good, 'BATCH_01_SCENES', ['scene-01', 'scene-02']).length === 0)
  const missing = coder.findUnregisteredSceneIds(good, 'BATCH_01_SCENES', ['scene-01', 'scene-02', 'scene-03'])
  check('a scene id without a component is reported', missing.length === 1 && missing[0] === 'scene-03', JSON.stringify(missing))
  check('a file without the export dictionary reports every id', coder.findUnregisteredSceneIds("import { useCurrentFrame } from 'remotion';\nexport const OTHER = {};\n", 'BATCH_01_SCENES', ['scene-01']).length === 1)
  check('an isolated / empty batch is not judged here', coder.findUnregisteredSceneIds('export const BATCH_01_SCENES = {};', 'BATCH_01_SCENES', ['scene-01']).length === 0)
  const msg = coder.describeUnregisteredScenes('src/scenes/Batch01.tsx', 'BATCH_01_SCENES', ['scene-03'])
  check('the repair message names the file, the dictionary and the scene', msg.startsWith('src/scenes/Batch01.tsx') && msg.includes("'scene-03'") && msg.includes('BATCH_01_SCENES'), msg)

  const kf = await imp('packages/dsh-tool-video-suite/scene-keyframes.js')
  const frames = kf.planSceneMotionFrames([
    { id: 'a', startFrame: 0, durationInFrames: 240, cuts: [{ start: 0, end: 80 }, { start: 80, end: 160 }, { start: 160, end: 240 }] },
    { id: 'b', startFrame: 240, durationInFrames: 120 },
  ], FPS)
  const fa = frames.filter((f) => f.sceneId === 'a').map((f) => f.frame)
  const fb = frames.filter((f) => f.sceneId === 'b').map((f) => f.frame)
  check('motion frames: one per sub-shot midpoint, 4 evenly spaced without cuts', JSON.stringify(fa) === JSON.stringify([40, 120, 200]) && fb.length === 4 && fb.every((f) => f >= 240 && f < 360), `${fa} / ${fb}`)
  const flat = new Uint8Array(432).fill(90)
  const lively = (k) => Uint8Array.from({ length: 432 }, (_, i) => ((i * 37 + k * 101) % 200) + 20)
  const sum = kf.summarizeSceneMotion([
    { sceneId: 'held', grid: flat }, { sceneId: 'held', grid: flat.map((v, i) => v + (i % 3)) }, { sceneId: 'held', grid: flat },
    { sceneId: 'alive', grid: lively(0) }, { sceneId: 'alive', grid: lively(1) },
  ])
  check('motion metric: a held picture stays below the static threshold', sum.held.maxStep < kf.STATIC_SCENE_GRID_TOL, JSON.stringify(sum.held))
  check('motion metric: a new composition is well above it', sum.alive.maxStep > kf.STATIC_SCENE_GRID_TOL * 4, JSON.stringify(sum.alive))

  const policy = { targetShotsMin: 31, targetShotsMax: 44, targetSec: 90 }
  const sparse = coder.assessPlanDensity({ shots: 2, policy, narrationMode: 'subtitle-mv', pacingMode: 'dynamic', topic: '毛选' })
  check('a 2-shot plan for a 90 s 高燃 film is reported in plain Chinese', sparse.sparse && /分镜偏少/.test(sparse.message) && sparse.beatDriven && !/[a-z]{4,}/i.test(sparse.message), sparse.message)
  check('a dense plan gets no notice', !coder.assessPlanDensity({ shots: 40, policy, narrationMode: 'subtitle-mv', pacingMode: 'dynamic' }).sparse)
})

/* ------------------------------------------------------------------------------------------ diorama figures */
await section('built-in diorama era follows the content', async () => {
  const nd = await imp('packages/dsh-tool-media/narrative-diorama.js')
  const t = (o) => nd.resolveDioramaTheme(o)
  const mao = t({ title: '毛选里的矛盾论', topic: '毛泽东选集 矛盾论 实践论 打工人如何看清主要矛盾', genre: 'history-theater' })
  check('毛选 / theory: present-day people, not ancient warriors', mao.era === 'modern' && mao.family === 'theory', JSON.stringify(mao))
  check('项羽: the classic warrior diorama', t({ title: '项羽生平', topic: '破釜沉舟 巨鹿一战威震诸侯', genre: 'history-theater' }).era === 'ancient')
  check('霍去病: the classic warrior diorama', t({ title: '霍去病', topic: '封狼居胥 河西之战', genre: 'history-theater' }).era === 'ancient')
  check('抗战 history: no spears and plumes', t({ title: '抗战中的普通人', topic: '抗日战争 八路军', genre: 'history-theater' }).era === 'modern')
  check('science / product / lifestyle topics: modern', ['黑洞是怎么形成的 科普', '新款手机发布会 产品亮点', '周末咖啡馆探店 vlog'].every((x) => t({ title: x, topic: x }).era === 'modern'))
})

await section('picture-motion check (画面变化检查) measures what it should', async () => {
  const sk = await imp('packages/dsh-tool-video-suite/scene-keyframes.js')
  // a scene with three sub-shots is looked at in the middle of each sub-shot; one without cuts at evenly spaced frames
  const scenes = [
    { id: 'a', durationInFrames: 300, cuts: [{ start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 300 }] },
    { id: 'b', durationInFrames: 120 },
  ]
  const frames = sk.planSceneMotionFrames(scenes, FPS)
  const fa = frames.filter((f) => f.sceneId === 'a').map((f) => f.frame)
  const fb = frames.filter((f) => f.sceneId === 'b').map((f) => f.frame)
  check('sub-shot midpoints for a cut scene', JSON.stringify(fa) === JSON.stringify([50, 150, 250]), JSON.stringify(fa))
  check('evenly spaced frames after the entry for an uncut scene', fb.length === 4 && fb[0] >= 300 + 24 && fb.every((f, i) => i === 0 || f > fb[i - 1]) && fb[3] < 420, JSON.stringify(fb))
  // grids: a held picture (tiny noise), and a scene whose composition changes once
  const flat = (v) => Uint8Array.from({ length: 16 * 9 * 3 }, (_, k) => (v + (k % 3)) & 255)
  const m = sk.summarizeSceneMotion([
    { sceneId: 'held', grid: flat(40) },
    { sceneId: 'held', grid: flat(41) },
    { sceneId: 'held', grid: flat(42) },
    { sceneId: 'moves', grid: flat(40) },
    { sceneId: 'moves', grid: flat(120) },
  ])
  check('a held picture stays under the threshold, a new composition is far above it', m.held.stills === 3 && m.held.maxStep < sk.STATIC_SCENE_GRID_TOL && m.moves.maxStep > 10 * sk.STATIC_SCENE_GRID_TOL, JSON.stringify(m))
})

/* ------------------------------------------------------------------------------------------ summary */
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
for (const f of failed) console.log(`  FAIL ${f.name}`)
process.exit(failed.length ? 1 : 0)
