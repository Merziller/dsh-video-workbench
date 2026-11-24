#!/usr/bin/env node
/**
 * 「我的动漫形象」 — the reusable anime presenter (free tier + library + engine dispatch + routes). No network, no paid
 * call, no GPU: FFmpeg only.
 *   - anime-visemes.js: silence, formant-synthesised 「a / i / u」 vowels → mouth shapes a / i / o, no one-frame flicker,
 *     deterministic blinks, caption word onsets, the compact form
 *   - anime-sprite.js: eyes / mouth found on a clean cartoon face, mouth / blink patches (size, transparency, colours)
 *   - anime-character.js: create (cartoon picture, plain background), face marks → redraw + version, cloud ids, list,
 *     delete to .trash, refusals (busy background, photo without stylising, cloud without cost confirmation, no key)
 *   - anime-engines.js: the free-tier plan of one cut (files copied into the project, viseme track, bob envelope),
 *     tier-2 / tier-3 problems fall back to the free tier with a note, cost estimates
 *   - talk-pack.js: the presenter setting (character + engine + mode; the cost confirmation never stored)
 *   - talk-edit.js planTalkPack with a character; routes-anime.js (list, record, picture, update, estimate, upload job,
 *     refusals)
 *
 *   node scripts/tests/anime-presenter.test.mjs
 *
 * Scratch data only (<repo>/.tmp/anime-presenter-test/<stamp>).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'anime-presenter-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client'), proj: join(SCR, 'ws', 'proj') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
  DSH_VIDEO_RUNNER_ISOLATED: '1',
  // scratch cloud configs (the worktree may hold saved ones from other tests)
  DSH_VIDEO_CLOUD_MEDIA_CONFIG: join(SCR, 'cloud-media.json'),
  DSH_VIDEO_ANIME_CLOUD_CONFIG: join(SCR, 'anime-cloud.json'),
})
globalThis.fetch = async () => {
  throw new Error('network disabled in this test')
}

let passed = 0
let failed = 0
const ok = (cond, label, extra) => {
  if (cond) passed++
  else {
    failed++
    console.log(`  ✗ ${label}${extra !== undefined ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`)
  }
}
const rejects = async (fn, code, label) => {
  try {
    await fn()
    ok(false, label, 'did not throw')
  } catch (err) {
    ok(!code || err?.code === code, label, `${err?.code}: ${err?.message}`)
  }
}
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href)

const V = await imp('packages/dsh-tool-avatar/anime-visemes.js')
const SP = await imp('packages/dsh-tool-avatar/anime-sprite.js')
const CH = await imp('packages/dsh-tool-avatar/anime-character.js')
const EN = await imp('packages/dsh-tool-avatar/anime-engines.js')
const TP = await imp('packages/dsh-tool-media/talk-pack.js')

/* ------------------------------------------------------------------------------------------------ helpers */

const SR = 16000
/** Formant-synthesised vowel: harmonics of f0 shaped by Lorentzian resonances (F, bandwidth) and a spectral tilt. */
function vowel(sec, formants, f0 = 140, amp = 0.3) {
  const n = Math.round(sec * SR)
  const out = new Float32Array(n)
  const harmonics = []
  for (let k = 1; k * f0 < 4800; k++) {
    const f = k * f0
    let a = 0
    for (const [F, B] of formants) a += 1 / (1 + ((f - F) / B) ** 2)
    harmonics.push([f, (a / Math.sqrt(k)) * 0.5])
  }
  const norm = harmonics.reduce((s, [, a]) => s + a, 0) || 1
  for (let i = 0; i < n; i++) {
    const t = i / SR
    let v = 0
    for (const [f, a] of harmonics) v += a * Math.sin(2 * Math.PI * f * t + f)
    // 25 ms fade in / out so syllables have edges
    const env = Math.min(1, i / (0.025 * SR), (n - i) / (0.025 * SR))
    out[i] = (amp * v * env) / norm
  }
  return out
}
const silence = (sec) => new Float32Array(Math.round(sec * SR))
const concat = (...parts) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
const A = [
  [800, 90],
  [1200, 110],
  [2500, 160],
]
const I = [
  [300, 60],
  [2300, 110],
  [3000, 160],
]
const U = [
  [320, 60],
  [800, 80],
  [2300, 200],
]
const majority = (shapes, f0, f1) => {
  const c = {}
  for (let f = f0; f < f1; f++) c[shapes[f]] = (c[shapes[f]] || 0) + 1
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]
}

/** A clean cartoon portrait on green: hair, face, eyes (white + iris + upper lash), a closed mouth line, shirt. */
function cartoonPortrait(W = 600, H = 800, { busy = false } = {}) {
  const px = Buffer.alloc(W * H * 4)
  const SKIN = [250, 224, 210]
  const HAIR = [74, 48, 42]
  const LINE = [58, 38, 38]
  const SHIRT = [70, 110, 190]
  const WHITE = [255, 255, 255]
  const IRIS = [60, 90, 160]
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c = busy ? [(x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256] : [0, 255, 0]
      const inE = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
      if (y > 560) {
        const half = 90 + (y - 560) * 0.9
        if (Math.abs(x - 300) < half) c = SHIRT
      }
      if (y >= 470 && y <= 580 && Math.abs(x - 300) < 32) c = SKIN
      if (inE(300, 330, 130, 160)) c = SKIN
      if (inE(300, 270, 150, 145) && y < 300) c = HAIR
      if ((inE(175, 380, 30, 120) || inE(425, 380, 30, 120)) && y > 250) c = HAIR
      for (const ex of [250, 350]) {
        if (inE(ex, 362, 26, 30)) c = WHITE
        if (inE(ex, 366, 16, 24)) c = IRIS
        if (inE(ex, 340, 30, 9) && y < 345) c = LINE
      }
      if (y >= 438 && y <= 442 && Math.abs(x - 300) < 16) c = LINE
      const i = (y * W + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  return px
}

/* ------------------------------------------------------------------------------------------------ visemes */
console.log('· anime-visemes')
{
  const quiet = V.analyzeVisemesFromPcm(silence(6), SR, { fps: 30 })
  ok(quiet.frames === 180 && quiet.open.every((v) => v === 0) && quiet.shape.every((s) => s === 'closed'), 'silence: mouth stays closed', { frames: quiet.frames })
  ok(quiet.talk.every((v) => v === 0), 'silence: no speaking activity')
  const blinkStarts = V.compactVisemeTrack(quiet).blinks
  ok(blinkStarts.length >= 1 && blinkStarts.length <= 4, 'silence: blinks every few seconds', blinkStarts)
  ok(JSON.stringify(V.analyzeVisemesFromPcm(silence(6), SR, { fps: 30 }).blink) === JSON.stringify(quiet.blink), 'blinks are deterministic')

  const pcm = concat(silence(0.5), vowel(0.7, A), silence(0.35), vowel(0.7, I), silence(0.35), vowel(0.7, U), silence(0.5))
  const tr = V.analyzeVisemesFromPcm(pcm, SR, { fps: 30 })
  const fr = (s) => Math.round(s * 30)
  const segA = [fr(0.5) + 4, fr(1.2) - 3]
  const segI = [fr(1.55) + 4, fr(2.25) - 3]
  const segU = [fr(2.6) + 4, fr(3.3) - 3]
  ok(majority(tr.shape, ...segA) === 'a', '「a」 opens the mouth wide (a)', tr.shape.slice(...segA).join(''))
  ok(majority(tr.shape, ...segI) === 'i', '「i」 spreads the lips (i)', tr.shape.slice(...segI).join(''))
  ok(majority(tr.shape, ...segU) === 'o', '「u」 rounds the lips (o)', tr.shape.slice(...segU).join(''))
  ok(tr.shape.slice(0, fr(0.45)).every((s) => s === 'closed') && tr.shape.slice(fr(1.3), fr(1.5)).every((s) => s === 'closed' || s === 'half'), 'pauses close the mouth', tr.shape.slice(fr(1.25), fr(1.55)).join(''))
  let flicker = 0
  for (let f = 1; f < tr.frames - 1; f++) if (tr.shape[f] !== tr.shape[f - 1] && tr.shape[f] !== tr.shape[f + 1]) flicker++
  ok(flicker === 0, 'no one-frame flicker', flicker)
  ok(tr.vowels.a.length === tr.frames && tr.vowels.i[segI[0] + 5] > tr.vowels.a[segI[0] + 5], 'vowel weights follow the vowel', { i: tr.vowels.i[segI[0] + 5], a: tr.vowels.a[segI[0] + 5] })
  ok(tr.talk[fr(0.9)] > 0.3 && tr.talk[fr(0.1)] === 0, 'speaking activity rises while talking', { talking: tr.talk[fr(0.9)], quiet: tr.talk[fr(0.1)] })
  ok(tr.words.length >= 3 && Math.abs(tr.words[0] - 0.5) < 0.12, 'word onsets without captions = voice starts after pauses', tr.words)
  const withCaps = V.analyzeVisemesFromPcm(pcm, SR, { fps: 30, captions: [{ startSec: 0.5, endSec: 1.2, words: [{ startSec: 0.52 }, { startSec: 0.8 }] }, { startSec: 1.55, endSec: 3.3 }] })
  ok(JSON.stringify(withCaps.words) === JSON.stringify([0.52, 0.8, 1.55]), 'caption word onsets are used when given', withCaps.words)
  const cv = V.compactVisemeTrack(tr)
  ok(cv.shapes.length === tr.frames && /^[chaoi]+$/.test(cv.shapes) && cv.fps === 30, 'compact form: one letter per frame', cv.shapes.slice(0, 40))
}

/* ------------------------------------------------------------------------------------------------ sprite drawing */
console.log('· anime-sprite')
{
  const W = 600
  const H = 800
  const px = cartoonPortrait(W, H)
  // the portrait as the library stores it: background removed, cropped (here: just mark green transparent)
  for (let i = 0; i < W * H; i++) if (px[i * 4] === 0 && px[i * 4 + 1] === 255 && px[i * 4 + 2] === 0) px[i * 4 + 3] = 0
  const face = SP.guessFaceMarks(px, W, H)
  const near = (m, x, y, tol) => Math.abs(m.x * W - x) <= tol && Math.abs(m.y * H - y) <= tol
  ok(face.detected === 'eyes+mouth', 'eyes and mouth found on a clean cartoon face', face.detected)
  ok(near(face.eyes[0], 250, 357, 14) && near(face.eyes[1], 350, 357, 14), 'eye marks on the eyes', face.eyes)
  ok(near(face.mouth, 300, 440, 10), 'mouth mark on the mouth', face.mouth)
  ok(face.eyes[0].w * W > 40 && face.eyes[0].w * W < 80, 'eye width ≈ the eye', face.eyes[0].w * W)
  const colors = SP.sampleFaceColors(px, W, H, face)
  ok(Math.abs(colors.skin.r - 250) < 6 && Math.abs(colors.skin.g - 224) < 6, 'skin colour sampled from the face', colors.skin)
  ok(colors.line.r < 90 && colors.line.g < 70, 'line colour = the dark strokes', colors.line)
  const mb = SP.mouthPatchBox(face, W, H)
  const patch = SP.drawMouthPatch('a', mb, colors)
  ok(patch.length === mb.w * mb.h * 4, 'mouth patch size = its box')
  let opaque = 0
  let clear = 0
  let inner = 0
  for (let i = 0; i < mb.w * mb.h; i++) {
    const a = patch[i * 4 + 3]
    if (a === 255) opaque++
    if (a === 0) clear++
    if (a === 255 && patch[i * 4] > patch[i * 4 + 1] + 40) inner++
  }
  ok(opaque > 0 && clear > 0, 'mouth patch: painted middle, transparent corners', { opaque, clear })
  ok(inner > 20, 'open 「a」 shows the inside of the mouth (red tones)', inner)
  const closedP = SP.drawMouthPatch('closed', mb, colors)
  let closedLine = 0
  for (let i = 0; i < mb.w * mb.h; i++) if (closedP[i * 4 + 3] === 255 && closedP[i * 4] < 120) closedLine++
  ok(closedLine > 5, 'closed mouth = a short line', closedLine)
  const bb = SP.blinkPatchBox(face, W, H)
  const blink = SP.drawBlinkPatch(bb, face, W, H, colors)
  ok(blink.length === bb.w * bb.h * 4 && bb.w > bb.h, 'blink patch covers both eyes', bb)
  const fallback = SP.guessFaceMarks(null, 0, 0)
  ok(fallback.mouth && fallback.eyes.length === 2, 'no picture: proportional guess')
}

/* ------------------------------------------------------------------------------------------------ character library */
console.log('· anime-character')
const srcDir = join(SCR, 'src')
mkdirSync(srcDir, { recursive: true })
const cartoonAbs = join(srcDir, 'cartoon.png')
await SP.writePngRgba(cartoonAbs, cartoonPortrait(), 600, 800)
const busyAbs = join(srcDir, 'busy.png')
await SP.writePngRgba(busyAbs, cartoonPortrait(600, 800, { busy: true }), 600, 800)
let charA = null
{
  const progress = []
  charA = await CH.createCharacter({ name: '小助手', sourceAbs: cartoonAbs, kind: 'cartoon', stylize: 'none', onProgress: (p) => progress.push(p.message) })
  ok(charA.status === 'ready' && charA.version === 1 && CH.isCharacterId(charA.id), 'cartoon picture → ready character', { status: charA.status, v: charA.version })
  ok(charA.width === 600 && charA.height < 800 && charA.height > 600, 'portrait cropped to the character (no margin below)', { w: charA.width, h: charA.height })
  ok(['half', 'a', 'o', 'i'].every((s) => existsSync(join(charA.dir, charA.sprites.mouths[s]))) && existsSync(join(charA.dir, charA.sprites.blink)), 'mouth and blink pictures saved')
  ok(charA.face.detected === 'eyes+mouth' && charA.face.checked === false, 'face marks found automatically (not yet confirmed)', charA.face)
  ok(progress.length >= 2, 'progress messages', progress)
  ok(CH.listCharacters().some((c) => c.id === charA.id && c.engines.sprite && !c.faceChecked), 'listed with the free tier ready')
  const before = readFileSync(join(charA.dir, 'm-a.png'))
  const moved = await CH.updateCharacter(charA.id, { face: { mouth: { x: 0.5, y: 0.6, w: 0.08 }, eyes: charA.face.eyes } })
  ok(moved.version === 2 && moved.face.checked && moved.face.mouth.y === 0.6, 'new face marks bump the version', { v: moved.version, face: moved.face })
  ok(!readFileSync(join(charA.dir, 'm-a.png')).equals(before) && moved.sprites.boxes.mouth.y > charA.sprites.boxes.mouth.y, 'mouth pictures redrawn at the new place')
  const renamed = await CH.updateCharacter(charA.id, { name: '  新名字  ' })
  ok(renamed.name === '新名字' && renamed.version === 2, 'renaming keeps the version')
  await CH.saveCharacterCloudId(charA.id, 'volc', { avatarId: 'av-123', imageSha: 'x' })
  const withCloud = CH.getCharacter(charA.id)
  ok(withCloud.cloud.volc.avatarId === 'av-123' && withCloud.cloud.volc.characterVersion === 2 && CH.characterEngines(withCloud).volc, 'provider avatar id remembered on the character')
  ok(CH.characterFileAbs(withCloud, '../../etc/passwd') === '' && CH.characterFileAbs(withCloud, 'portrait.png').endsWith('portrait.png'), 'file paths stay inside the character folder')
  await rejects(() => CH.createCharacter({ sourceAbs: busyAbs, kind: 'cartoon', stylize: 'none' }), 'UNSUPPORTED_IMAGE', 'busy background refused (cannot cut out)')
  await rejects(() => CH.createCharacter({ sourceAbs: cartoonAbs, kind: 'photo', stylize: 'none' }), 'BAD_REQUEST', 'a photo must be stylised')
  await rejects(() => CH.createCharacter({ sourceAbs: cartoonAbs, kind: 'photo', stylize: 'cloud' }), 'COST_NOT_CONFIRMED', 'cloud likeness needs the cost confirmation')
  await rejects(() => CH.createCharacter({ sourceAbs: cartoonAbs, kind: 'photo', stylize: 'cloud', confirmedCost: true }), 'NO_KEY', 'cloud likeness without a configured image service')
  const failedOne = CH.listCharacters().find((c) => c.status === 'failed')
  ok(failedOne && /云端生图/.test(failedOne.error), 'a failed creation stays in the library with its reason (retry later)', failedOne)
  const est = await CH.estimateStylizeCost()
  ok(est.configured === false && est.supported === false && /云端生图/.test(est.reason), 'stylise estimate without a service says how to set it up', est)
  await rejects(() => CH.createCharacter({ sourceAbs: join(srcDir, 'missing.png'), kind: 'cartoon' }), 'NO_SOURCE', 'missing picture refused')
  const prompt = CH.buildStylizePrompt('chibi', '戴眼镜')
  ok(/Q 版/.test(prompt) && /像本人/.test(prompt) && /#00FF00/.test(prompt) && /戴眼镜/.test(prompt), 'stylise prompt keeps the likeness and asks for a green screen')
  const del = await CH.deleteCharacter(failedOne.id)
  ok(del.ok && !existsSync(join(CH.animeCharactersRoot(), failedOne.id)) && readdirSync(join(CH.animeCharactersRoot(), '.trash')).some((n) => n.startsWith(failedOne.id)), 'delete moves the character to .trash')
}

/* ------------------------------------------------------------------------------------------------ engines */
console.log('· anime-engines')
writeFileSync(join(dirs.proj, 'script.json'), JSON.stringify({ title: 't', scenes: [] }))
const voiceWav = join(SCR, 'voice.wav')
{
  // a real WAV of the synthetic vowels (FFmpeg reads it back)
  const pcm = concat(silence(0.4), vowel(0.6, A), silence(0.25), vowel(0.6, I), silence(0.25), vowel(0.6, U), silence(0.4))
  const data = Buffer.alloc(pcm.length * 2)
  for (let i = 0; i < pcm.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), i * 2)
  const hdr = Buffer.alloc(44)
  hdr.write('RIFF', 0)
  hdr.writeUInt32LE(36 + data.length, 4)
  hdr.write('WAVEfmt ', 8)
  hdr.writeUInt32LE(16, 16)
  hdr.writeUInt16LE(1, 20)
  hdr.writeUInt16LE(1, 22)
  hdr.writeUInt32LE(SR, 24)
  hdr.writeUInt32LE(SR * 2, 28)
  hdr.writeUInt16LE(2, 32)
  hdr.writeUInt16LE(16, 34)
  hdr.write('data', 36)
  hdr.writeUInt32LE(data.length, 40)
  writeFileSync(voiceWav, Buffer.concat([hdr, data]))
}
{
  const plan = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: charA.id, engine: 'sprite', corner: 'br', size: 'l' }, wavAbs: voiceWav, totalSec: 3.1, fps: 30 })
  ok(plan.type === 'anime' && plan.engine === 'sprite' && plan.corner === 'br' && plan.size === 'l', 'free-tier plan of a cut', { type: plan.type, engine: plan.engine })
  ok(existsSync(join(dirs.proj, plan.path)) && Object.values(plan.sprites.mouths).every((p) => existsSync(join(dirs.proj, p))) && existsSync(join(dirs.proj, plan.sprites.blink)), 'portrait + mouth / blink pictures copied into the project')
  ok(plan.path.startsWith('assets/.mascot/anime-') && !/[A-Za-z]:/.test(JSON.stringify(plan)), 'project-relative paths only')
  ok(plan.visemes.shapes.length === Math.ceil(3.1 * 30) && /a/.test(plan.visemes.shapes) && /i/.test(plan.visemes.shapes) && /o/.test(plan.visemes.shapes), 'viseme track of the cut', plan.visemes.shapes)
  ok(plan.env.length >= Math.ceil(3.1 * 12.5) && Math.max(...plan.env) > 50 && plan.env[0] === 0, 'bob / sway envelope from the voice', plan.env.slice(0, 20))
  ok(plan.characterVersion === 2 && plan.sprites.boxes.mouth && plan.sprites.boxes.blink, 'character version + patch boxes in the plan')
  const tha = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: charA.id, engine: 'tha3' }, wavAbs: voiceWav, totalSec: 3.1 })
  ok(tha.type === 'anime' && tha.fallback?.engine === 'tha3' && /免费档/.test(tha.note), 'local model missing → free tier with a note', { note: tha.note, fb: tha.fallback })
  const cloud = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: charA.id, engine: 'volc' }, wavAbs: voiceWav, totalSec: 3.1 })
  ok(cloud.type === 'anime' && cloud.fallback?.engine === 'volc' && ['NOT_INSTALLED', 'NO_KEY', 'COST_NOT_CONFIRMED'].includes(cloud.fallback.code), 'cloud without key / confirmation → free tier, nothing paid', cloud.fallback)
  const noVoice = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: charA.id, engine: 'sprite' }, wavAbs: '', totalSec: 4 })
  ok(noVoice.visemes.shapes.length === 120 && /^c+$/.test(noVoice.visemes.shapes), 'no voice: the presenter only breathes and blinks')
  await rejects(() => EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: 'c-20990101-000000', engine: 'sprite' }, wavAbs: voiceWav, totalSec: 3 }), 'NOT_FOUND', 'deleted character refused')
  const free = await EN.estimatePresenterCost({ engine: 'tha3', durationSec: 60 })
  ok(free.rmb === 0, 'local engines are free')
  const engines = await EN.getPresenterEngines()
  ok(engines.length === 5 && engines[0].id === 'sprite' && engines[0].available, 'engine list: the free tier is always available', engines.map((e) => [e.id, e.available]))
  const env = EN.envelopeFromTrack({ fps: 30, open: Array(30).fill(1), talk: Array(30).fill(1) }, 1)
  ok(env.length === 14 && env[0] === 100, 'envelope at 12.5 values per second', env)
}

/* ------------------------------------------------------------------------------------------------ renderers */
console.log('· renderers (Remotion talk kit + HTML draft)')
{
  const plan = await EN.planAnimePresenter({ projectDir: dirs.proj, setting: { characterId: charA.id, engine: 'sprite', corner: 'bl', size: 'm' }, wavAbs: voiceWav, totalSec: 3.1, fps: 30 })
  const script = {
    fps: 30,
    width: 1280,
    height: 720,
    totalDurationInFrames: 93,
    productionType: 'talk-edit',
    subtitleStyle: 'talk',
    talkPack: { ...TP.resolveTalkPack({ keywords: false, chapters: false, progressBar: false, broll: false }), keywords: [], chapters: [], broll: [], mascot: plan },
    scenes: [{ id: 'talk-01', startFrame: 0, durationInFrames: 93, durationSec: 3.1, layout: 'presenter', presenter: { path: 'assets/talk.mp4', startFrame: 0 } }],
  }
  const { syncRemotionPublicAssets } = await imp('packages/dsh-tool-media/remotion-generator.js')
  syncRemotionPublicAssets(dirs.proj, script)
  const inPublic = (p) => existsSync(join(dirs.proj, 'public', p))
  ok(inPublic(plan.path) && Object.values(plan.sprites.mouths).every(inPublic) && inPublic(plan.sprites.blink), 'portrait + mouth / blink pictures reach Remotion\'s public folder')
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const html = buildRichHtmlVideo(script)
  const patches = (html.match(/class="k-tp-patch"/g) || []).length
  ok(patches === Object.keys(plan.sprites.mouths).length + 1, 'HTML draft: one picture per mouth shape + the blink', patches)
  ok(html.includes('"visemes":{"fps":30,"shapes":"') && html.includes('function animeFace(m, t)'), 'HTML draft: viseme track + runtime')
  const kit = readFileSync(join(ROOT, 'packages/dsh-tool-media/remotion-lib/talk-kit.tsx'), 'utf8')
  const body = (src, start) => {
    const i = src.indexOf(start)
    return i < 0 ? '' : src.slice(i, src.indexOf('return { mouth, blink }', i))
  }
  const norm = (s) =>
    s
      .replace(/\/\/[^\n]*/g, '')
      .replace(/: [A-Za-z<>[\]{}|' ]+(?=[,)=])/g, '')
      .replace(/[;\s]/g, '')
      .replace(/\(m:TalkMascot,t:number\)/, '(m,t)')
  const kitFace = norm(body(kit, 'export function animeFace(').replace(/^export function animeFace\(m: TalkMascot, t: number\): \{ mouth: string; blink: boolean \}/, 'function animeFace(m, t)'))
  const htmlFace = norm(body(html, 'function animeFace(m, t)'))
  ok(kitFace.length > 100 && kitFace === htmlFace, 'Remotion and HTML compute the same mouth / blink', { kitFace: kitFace.slice(0, 160), htmlFace: htmlFace.slice(0, 160) })
  ok(kit.includes("m.type === 'anime-clip' ? 0 : m.type === 'video' ? 0.5 : 1") && html.includes("m.type === 'anime-clip' ? 0 : m.type === 'video' ? 0.5 : 1"), 'a talking clip gets no extra hops (all renderers)')
  const clipHtml = buildRichHtmlVideo({ ...script, talkPack: { ...script.talkPack, mascot: { ...plan, type: 'anime-clip', path: 'assets/.mascot/x.webm', durationSec: 3.1, sprites: undefined, visemes: undefined } } })
  ok(/<video src="[^"]*x\.webm" muted playsinline preload="auto" data-clip="1"><\/video>/.test(clipHtml) && !/data-clip="1"[^>]*loop/.test(clipHtml), 'HTML draft: a talking clip plays once (no loop)')
}

/* ------------------------------------------------------------------------------------------------ presenter setting */
console.log('· talk-pack presenter setting')
{
  const s = TP.cleanMascotSetting({ characterId: charA.id, engine: 'volc', mode: 'lively', corner: 'br', size: 'x', confirmedRmb: '3.456' })
  ok(s.characterId === charA.id && s.engine === 'volc' && s.mode === 'lively' && s.corner === 'br' && s.size === 'm' && s.confirmedRmb === 3.46, 'character setting cleaned', s)
  ok(!('confirmedRmb' in TP.storedMascotSetting(s)), 'the cost confirmation is never stored')
  ok(TP.cleanMascotSetting({ characterId: '../x', assetId: 'a1' }).assetId === 'a1', 'a bad character id falls back to the picture setting')
  ok(TP.cleanMascotSetting({ characterId: charA.id, engine: 'nope' }).engine === 'sprite', 'unknown engine → free tier')
  ok(TP.cleanMascotSetting({}) === null && TP.cleanMascotSetting({ assetId: 'a' }).corner === 'bl', 'old picture setting still works')
}

/* ------------------------------------------------------------------------------------------------ talk pack + routes */
console.log('· planTalkPack + routes-anime')
{
  const { planTalkPack } = await imp('packages/dsh-tool-media/talk-edit.js')
  const captions = [{ index: 1, startSec: 0.4, endSec: 2.9, text: '你好，今天讲三件事', words: [{ startSec: 0.42 }, { startSec: 1.25 }, { startSec: 2.1 }] }]
  const res = await planTalkPack({ absDir: dirs.proj, captions, totalSec: 3.1, settings: { keywords: false, chapters: false, progressBar: false, broll: false, mascot: { characterId: charA.id, engine: 'sprite' } }, wavAbs: voiceWav, fps: 30 })
  ok(res.pack?.mascot?.type === 'anime' && JSON.stringify(res.pack.mascot.words) === JSON.stringify([0.42, 1.25, 2.1]), 'planTalkPack: anime presenter with caption word onsets', res.pack?.mascot?.words)

  const { handleAnimeApiRequest, isAnimeRoute } = await imp('packages/dsh-web-video-workbench/lib/routes-anime.js')
  const jobs = []
  const createBackgroundJob = (message, runner) => {
    const job = { id: `job-${jobs.length + 1}`, message, status: 'running', promise: null }
    job.promise = Promise.resolve()
      .then(() => runner(() => {}))
      .then(
        (r) => ((job.status = 'done'), (job.result = r)),
        (e) => ((job.status = 'error'), (job.error = e.message)),
      )
    jobs.push(job)
    return job
  }
  const call = async (method, path, { query = {}, body, raw } = {}) => {
    const u = new URL(`http://x/api/video-workbench/${path}`)
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v))
    const init = { method }
    if (raw) init.body = raw
    else if (body) {
      init.body = JSON.stringify(body)
      init.headers = { 'content-type': 'application/json' }
    }
    const res = await handleAnimeApiRequest(new Request(u, init), u, { createBackgroundJob })
    const ct = res.headers.get('content-type') || ''
    return { status: res.status, ct, body: ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) }
  }
  ok(isAnimeRoute('/api/video-workbench/anime/characters') && !isAnimeRoute('/api/video-workbench/talk/state'), 'route table')
  const list = await call('GET', 'anime/characters')
  ok(list.status === 200 && list.body.characters.some((c) => c.id === charA.id) && list.body.engines.length === 5 && list.body.styles.length >= 4, 'GET anime/characters', list.body.characters?.length)
  ok(!JSON.stringify(list.body).includes(SCR.replace(/\\/g, '\\\\')), 'no local folders in the list')
  const rec = await call('GET', 'anime/character', { query: { id: charA.id } })
  ok(rec.status === 200 && rec.body.character.face && !('dir' in rec.body.character), 'GET anime/character (no absolute folder)')
  const pic = await call('GET', 'anime/file', { query: { id: charA.id, name: 'portrait.png' } })
  ok(pic.status === 200 && pic.ct === 'image/png' && pic.body.subarray(1, 4).toString() === 'PNG', 'GET anime/file serves the portrait')
  const bad = await call('GET', 'anime/file', { query: { id: charA.id, name: '../character.json' } })
  ok(bad.status === 400 || bad.status === 404, 'GET anime/file refuses other files', bad.status)
  const badId = await call('GET', 'anime/character', { query: { id: '..\\x' } })
  ok(badId.status === 400, 'bad id refused', badId.status)
  const upd = await call('POST', 'anime/update', { body: { id: charA.id, name: '路由改名' } })
  ok(upd.status === 200 && upd.body.character.name === '路由改名', 'POST anime/update')
  const est = await call('GET', 'anime/estimate', { query: { engine: 'sprite', durationSec: 30 } })
  ok(est.status === 200 && est.body.estimate.rmb === 0, 'GET anime/estimate (free tier)')
  const noCost = await call('POST', 'anime/upload', { query: { fileName: 'me.png', kind: 'photo', stylize: 'cloud' }, raw: readFileSync(cartoonAbs) })
  ok(noCost.status === 400 && noCost.body.code === 'COST_NOT_CONFIRMED', 'upload with cloud stylising needs the confirmation', noCost.body)
  const up = await call('POST', 'anime/upload', { query: { fileName: 'toon.png', kind: 'cartoon', stylize: 'none', name: '上传的' }, raw: readFileSync(cartoonAbs) })
  ok(up.status === 200 && up.body.jobId, 'POST anime/upload starts a job', up.body)
  await jobs.at(-1).promise
  ok(jobs.at(-1).status === 'done' && jobs.at(-1).result.character.name === '上传的' && jobs.at(-1).result.character.status === 'ready', 'upload job → new character', jobs.at(-1).error || jobs.at(-1).result?.character?.status)
  ok(!existsSync(join(CH.animeCharactersRoot(), '.uploads')) || readdirSync(join(CH.animeCharactersRoot(), '.uploads')).length === 0, 'uploaded file cleaned up')
  const notImg = await call('POST', 'anime/upload', { query: { fileName: 'x.exe', kind: 'cartoon' }, raw: Buffer.from('MZ') })
  ok(notImg.status === 400, 'non-image upload refused')
  const delr = await call('POST', 'anime/delete', { body: { id: jobs.at(-1).result.character.id } })
  ok(delr.status === 200 && delr.body.deleted, 'POST anime/delete')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
