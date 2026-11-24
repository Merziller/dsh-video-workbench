#!/usr/bin/env node
/**
 * Standalone tests: the local anime presenter (tier 2, ANIME-AVATAR.md) — the THA3 pose builder (vowels, blinks,
 * bounded smooth motion, determinism), the hardware gate / install plan / status of the optional installer, hash-pinned
 * downloads from a local HTTP server (a mirror with other bytes is refused, a .part resumes), the zip reader, the THA3
 * input framing, and the render pipeline with a fake Python renderer (real FFmpeg → real VP9 + alpha WebM of the
 * audio's length), its cache, abort, timeout and error codes.
 *
 *   node scripts/tests/anime-local.test.mjs
 *
 * Offline: no internet, no GPU, no Python. Uses the bundled FFmpeg. Env: DSH_ANIME_TEST_DIR (scratch root, kept),
 * DSH_ANIME_TEST_FILTER=<regex>.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const SCRATCH = resolve(process.env.DSH_ANIME_TEST_DIR || join(REPO, '.tmp', 'anime-local-test', `run-${process.pid}`))
mkdirSync(SCRATCH, { recursive: true })
const HOME = join(SCRATCH, 'home')
mkdirSync(HOME, { recursive: true })
// a private, empty .env and home: the user's own settings and installs never influence the results
const ENV_FILE = join(SCRATCH, 'test.env')
writeFileSync(ENV_FILE, '# anime-local test\n')
process.env.DSH_VIDEO_ENV_PATH = ENV_FILE
process.env.DSH_VIDEO_HOME = HOME
for (const k of ['ANIME_LOCAL_HOME', 'FAKE_THA_MODE', 'FAKE_STY_MODE']) delete process.env[k]

const imp = (rel) => import(pathToFileURL(join(REPO, rel)).href)
const inst = await imp('packages/dsh-tool-avatar/anime-installer.js')
const local = await imp('packages/dsh-tool-avatar/anime-local.js')
const vis = await imp('packages/dsh-tool-avatar/anime-visemes.js')
const shared = await imp('packages/shared/index.js')
const { buildThaPoses, THA3_POSE_NAMES, THA3_POSE_INDEX, THA_MOTION_LIMITS } = local

// ------------------------------------------------------------------------------------------
// Harness
// ------------------------------------------------------------------------------------------
const results = []
const FILTER = process.env.DSH_ANIME_TEST_FILTER ? new RegExp(process.env.DSH_ANIME_TEST_FILTER, 'i') : null
async function test(name, fn) {
  if (FILTER && !FILTER.test(name)) return
  const t0 = Date.now()
  try {
    await fn()
    results.push({ name, status: 'pass' })
    console.log(`✔ ${name} (${Date.now() - t0} ms)`)
  } catch (err) {
    results.push({ name, status: 'fail', err })
    console.log(`✘ ${name}\n    ${String(err?.stack || err).split('\n').slice(0, 8).join('\n    ')}`)
  }
}

const col = (poses, name) => poses.poses.map((p) => p[THA3_POSE_INDEX[name]])
const maxAbs = (arr) => arr.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const maxStep = (arr) => {
  let m = 0
  for (let i = 1; i < arr.length; i++) m = Math.max(m, Math.abs(arr[i] - arr[i - 1]))
  return m
}
const range = (arr) => Math.max(...arr) - Math.min(...arr)
const clamp1 = (v) => Math.max(-1, Math.min(1, v))

/** Speech-like test signal: words (0.35 s voiced, 0.15 s gap) in sentences of 5, 0.9 s pauses; vowels alternate dark / bright. */
function speechPcm(sec, sr = 16000) {
  const n = Math.round(sec * sr)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const inSentence = t % 3.4 // 5 words × 0.5 s + 0.9 s pause
    if (inSentence >= 2.5) continue
    const w = Math.floor(inSentence / 0.5)
    const tw = inSentence % 0.5
    if (tw >= 0.35) continue
    const env = Math.sin((Math.PI * tw) / 0.35) * (0.5 + 0.4 * ((w * 7 + Math.floor(t / 3.4)) % 3) / 2)
    const bright = (w + Math.floor(t / 3.4)) % 2 === 1
    const f0 = 170 + 30 * Math.sin(t * 3)
    let v = Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f0 * t)
    v += bright ? 0.9 * Math.sin(2 * Math.PI * 2600 * t) + 0.5 * Math.sin(2 * Math.PI * 3100 * t) : 0.9 * Math.sin(2 * Math.PI * 450 * t) + 0.6 * Math.sin(2 * Math.PI * 700 * t)
    out[i] = clamp1(env * v * 0.3)
  }
  return out
}

function writeWav(abs, pcm, sr = 16000) {
  const data = Buffer.alloc(pcm.length * 2)
  for (let i = 0; i < pcm.length; i++) data.writeInt16LE(Math.round(clamp1(pcm[i]) * 32767), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sr, 24)
  h.writeUInt32LE(sr * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, Buffer.concat([h, data]))
  return abs
}

/** A hand-made viseme track (30 fps): "a" at frames 10–20, "i" at 30–40, "o" at 50–60, blinks at 30–33 and 120–123. */
function handTrack(frames = 150) {
  const z = () => new Array(frames).fill(0)
  const t = { fps: 30, frames, durationSec: frames / 30, open: z(), shape: new Array(frames).fill('closed'), vowels: { a: z(), i: z(), u: z(), e: z(), o: z() }, blink: z(), talk: z(), words: [10 / 30, 30 / 30, 50 / 30] }
  const syl = (from, to, open, shape, weights) => {
    for (let f = from; f <= to; f++) {
      t.open[f] = open
      t.shape[f] = shape
      t.talk[f] = 0.8
      for (const [k, v] of Object.entries(weights)) t.vowels[k][f] = v
    }
  }
  syl(10, 20, 0.8, 'a', { a: 0.8 })
  syl(30, 40, 0.7, 'i', { i: 0.42, e: 0.28 })
  syl(50, 60, 0.75, 'o', { o: 0.45, u: 0.3 })
  for (const at of [30, 120]) [0.55, 1, 1, 0.5].forEach((v, k) => (t.blink[at + k] = v))
  return t
}

// ------------------------------------------------------------------------------------------
// Poses
// ------------------------------------------------------------------------------------------
await test('pose vector: the 45 official THA3 parameters in the official order', () => {
  assert.equal(THA3_POSE_NAMES.length, 45)
  const at = { eyebrow_troubled_left: 0, eyebrow_raised_left: 6, eye_wink_left: 12, eye_wink_right: 13, iris_small_left: 24, mouth_aaa: 26, mouth_iii: 27, mouth_uuu: 28, mouth_eee: 29, mouth_ooo: 30, mouth_delta: 31, mouth_raised_corner_left: 34, mouth_smirk: 36, iris_rotation_x: 37, iris_rotation_y: 38, head_x: 39, head_y: 40, neck_z: 41, body_y: 42, body_z: 43, breathing: 44 }
  for (const [name, idx] of Object.entries(at)) assert.equal(THA3_POSE_INDEX[name], idx, name)
  const p = buildThaPoses(handTrack(), { fps: 30 })
  assert.deepEqual(p.names, THA3_POSE_NAMES)
  assert.ok(p.poses.every((row) => row.length === 45 && row.every(Number.isFinite)))
})

await test('poses: the mouth vowels follow the track, the mouth is closed in silence', () => {
  const t = handTrack()
  const p = buildThaPoses(t, { fps: 30 })
  const a = col(p, 'mouth_aaa')
  const i = col(p, 'mouth_iii')
  const e = col(p, 'mouth_eee')
  const o = col(p, 'mouth_ooo')
  const u = col(p, 'mouth_uuu')
  assert.ok(Math.abs(a[15] - 0.8) < 0.02, `aaa ${a[15]}`)
  assert.ok(Math.abs(i[35] - 0.42) < 0.02 && Math.abs(e[35] - 0.28) < 0.02, `iii ${i[35]} eee ${e[35]}`)
  assert.ok(Math.abs(o[55] - 0.45) < 0.02 && Math.abs(u[55] - 0.3) < 0.02, `ooo ${o[55]} uuu ${u[55]}`)
  assert.ok(a[35] < 0.01 && i[15] < 0.01 && o[15] < 0.01, 'one vowel family per syllable')
  for (const f of [...Array(8).keys(), 24, 25, 26, 44, 45, 46, ...Array.from({ length: 80 }, (_, k) => 66 + k)]) {
    for (const name of ['mouth_aaa', 'mouth_iii', 'mouth_uuu', 'mouth_eee', 'mouth_ooo']) assert.equal(p.poses[f][THA3_POSE_INDEX[name]], 0, `${name} @${f}`)
  }
  // the rest smile disappears while the mouth is open
  const smile = col(p, 'mouth_raised_corner_left')
  assert.ok(smile[100] > 0.05 && smile[16] < smile[100], 'friendly smile only at rest')
})

await test('poses: blink frames close both eyes (also when rendering at 15 fps)', () => {
  const t = handTrack()
  const p = buildThaPoses(t, { fps: 30 })
  const l = col(p, 'eye_wink_left')
  const r = col(p, 'eye_wink_right')
  for (const f of [31, 32, 121, 122]) assert.ok(l[f] >= 0.99 && r[f] >= 0.99, `closed @${f}`)
  for (const f of [0, 10, 60, 90, 140]) assert.equal(l[f] + r[f], 0, `open @${f}`)
  const p15 = buildThaPoses(t, { fps: 15 })
  assert.equal(p15.frames, 75)
  const l15 = col(p15, 'eye_wink_left')
  assert.ok(Math.max(...l15.slice(14, 18)) >= 0.99 && Math.max(...l15.slice(59, 63)) >= 0.99, 'no blink lost at 15 fps')
})

const pcm = speechPcm(13.6)
const realTrack = vis.analyzeVisemesFromPcm(pcm, 16000, { fps: 30 })

await test('poses: head / body / eye motion stays small, smooth and alive on real speech', () => {
  const p = buildThaPoses(realTrack, { fps: 30 })
  assert.equal(p.frames, Math.ceil(realTrack.durationSec * 30 - 1e-6))
  const lim = THA_MOTION_LIMITS
  for (const name of ['head_x', 'head_y', 'neck_z', 'body_y', 'body_z', 'iris_rotation_x', 'iris_rotation_y']) assert.ok(maxAbs(col(p, name)) <= lim[name] + 1e-9, `${name} bounded`)
  assert.ok(Math.max(...col(p, 'eyebrow_raised_left')) <= lim.eyebrow_raised + 1e-9)
  const breath = col(p, 'breathing')
  assert.ok(Math.min(...breath) >= 0 && Math.max(...breath) <= 1)
  // smooth: no jumps between frames (30 fps)
  for (const name of ['head_x', 'head_y', 'neck_z', 'body_y', 'body_z', 'breathing']) assert.ok(maxStep(col(p, name)) < 0.03, `${name} step ${maxStep(col(p, name))}`)
  for (const name of ['eyebrow_raised_left', 'iris_rotation_x', 'iris_rotation_y']) assert.ok(maxStep(col(p, name)) <= 0.15, `${name} step ${maxStep(col(p, name))}`)
  // alive: it sways, nods (head down = negative head_x), lifts the eyebrows now and then, breathes, glances
  assert.ok(range(col(p, 'head_y')) > 0.05, 'sway')
  assert.ok(Math.min(...col(p, 'head_x')) < -0.03, 'nods')
  assert.ok(Math.max(...col(p, 'eyebrow_raised_left')) > 0.15, 'eyebrow lift on a stressed word')
  assert.ok(range(breath) > 0.5, 'breathing')
  assert.ok(range(col(p, 'iris_rotation_y')) > 0.05, 'glances')
  assert.ok(maxAbs(col(p, 'mouth_aaa')) > 0.3 && maxAbs(col(p, 'mouth_iii')) > 0.05 && maxAbs(col(p, 'mouth_ooo')) > 0.05, 'the voice opens the mouth in several shapes')
})

await test('poses: deterministic for the same input; another seed moves differently, the mouth stays the same', () => {
  const a = buildThaPoses(realTrack, { fps: 30 })
  const b = buildThaPoses(JSON.parse(JSON.stringify(realTrack)), { fps: 30 })
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  const c = buildThaPoses(realTrack, { fps: 30, seed: 12345 })
  assert.notEqual(JSON.stringify(col(a, 'head_y')), JSON.stringify(col(c, 'head_y')))
  assert.equal(JSON.stringify(col(a, 'mouth_aaa')), JSON.stringify(col(c, 'mouth_aaa')))
  assert.equal(JSON.stringify(col(a, 'eye_wink_left')), JSON.stringify(col(c, 'eye_wink_left')))
})

await test('poses: frame count = ceil(duration × fps); the clip may be longer than the track (silence after it)', () => {
  const p = buildThaPoses(handTrack(), { fps: 15, durationSec: 7.01 })
  assert.equal(p.frames, Math.ceil(7.01 * 15))
  const a = col(p, 'mouth_aaa')
  assert.equal(Math.max(...a.slice(80)), 0)
})

// ------------------------------------------------------------------------------------------
// Hardware gate / plan / sizes
// ------------------------------------------------------------------------------------------
const PROFILES = {
  rtx5070: { memory: { totalGB: 31 }, cpu: { threads: 32 }, gpu: { primaryName: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', vendor: 'nvidia', vramGB: 11.9, hasNvidiaCuda: true, all: [{ name: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', vendor: 'nvidia', vramGB: 11.9, freeVramGB: 10 }] } },
  gtx1060: { memory: { totalGB: 16 }, cpu: { threads: 8 }, gpu: { primaryName: 'NVIDIA GeForce GTX 1060', vendor: 'nvidia', vramGB: 6, hasNvidiaCuda: true, all: [{ name: 'NVIDIA GeForce GTX 1060', vendor: 'nvidia', vramGB: 6, freeVramGB: 5 }] } },
  intelArc: { memory: { totalGB: 32 }, cpu: { threads: 16 }, gpu: { primaryName: 'Intel(R) Arc(TM) 140T GPU', vendor: 'intel', vramGB: 2, hasNvidiaCuda: false, all: [{ name: 'Intel(R) Arc(TM) 140T GPU', vendor: 'intel', vramGB: 2 }] } },
  lowRam: { memory: { totalGB: 4 }, cpu: { threads: 4 }, gpu: { primaryName: 'Intel UHD', vendor: 'intel', vramGB: 1, hasNvidiaCuda: false, all: [] } },
  wmiNvidia: { memory: { totalGB: 16 }, cpu: { threads: 8 }, gpu: { primaryName: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', vramGB: 4, hasNvidiaCuda: false, all: [{ name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', vramGB: 4 }] } },
  slowCpu: { memory: { totalGB: 8 }, cpu: { threads: 2 }, gpu: { primaryName: '通用显卡 / 核显', vendor: 'integrated', vramGB: 0, hasNvidiaCuda: false, all: [] } },
}

await test('hardware gate: CUDA 12.8 on recent NVIDIA, CUDA 12.6 on Pascal, CPU elsewhere, refusals in plain words', () => {
  const g = (k, nvidia = null) => inst.assessAnimeLocalHardware(PROFILES[k], { nvidia })
  assert.deepEqual([g('rtx5070', { name: 'NVIDIA GeForce RTX 5070 Ti Laptop GPU', computeCap: 12, vramGB: 11.9 }).device, g('rtx5070', { name: 'x', computeCap: 12, vramGB: 11.9 }).torchIndex], ['cuda', 'cu128'])
  assert.equal(g('gtx1060', { name: 'NVIDIA GeForce GTX 1060', computeCap: 6.1, vramGB: 6 }).torchIndex, 'cu126')
  assert.equal(g('gtx1060').torchIndex, 'cu128', 'unknown compute capability → cu128')
  const arc = g('intelArc')
  assert.equal(arc.suitable, true)
  assert.equal(arc.device, 'cpu')
  assert.match(arc.message, /不是 NVIDIA 显卡.*CPU/)
  const low = g('lowRam')
  assert.equal(low.suitable, false)
  assert.equal(low.code, 'LOW_RAM')
  assert.match(low.message, /8 GB/)
  assert.equal(g('wmiNvidia').code, 'CUDA_UNVERIFIED')
  assert.equal(g('slowCpu').code, 'LOW_CPU')
  assert.equal(g('slowCpu').suitable, false)
})

await test('install plan: one index per package group, torch from the right index, files and mirror order', async () => {
  const cfg = inst.resolveAnimeLocalConfig({ home: join(SCRATCH, 'plan-home') })
  const cuda = inst.planAnimeLocalInstall({ cfg, hardware: { device: 'cuda', torchIndex: 'cu128' }, mirror: 'cn' })
  assert.equal(cuda.packages[0].group, 'torch')
  assert.equal(cuda.packages[0].indexUrl, 'https://download.pytorch.org/whl/cu128')
  assert.deepEqual(cuda.packages[0].packages, ['torch==2.8.0'])
  assert.equal(cuda.packages[1].indexUrl, 'https://pypi.tuna.tsinghua.edu.cn/simple')
  assert.ok(cuda.packages[1].packages.includes('tensorflow-cpu==2.20.0'))
  // exactly one index per call, as the MuseTalk installer builds them
  for (const p of cuda.packages) {
    const args = (await imp('packages/dsh-tool-avatar/lipsync-installer.js')).buildPipInstallArgs({ uv: true, python: 'E:/x/python.exe', packages: p.packages, indexUrl: p.indexUrl })
    assert.equal(args.filter((a) => a === '--index-url').length, 1)
  }
  const tha = cuda.files.filter((f) => f.component === 'tha3')
  assert.equal(tha.length, 10, 'standard_float + separable_float on CUDA')
  assert.deepEqual(tha[0].sources.map((s) => s.name), ['hf-mirror', 'huggingface', 'official-zip'])
  const sty = cuda.files.filter((f) => f.component === 'stylize')
  assert.equal(sty.length, 3 + 3 * 2 + 2, 'detector / keypoints / mask + 3 styles × 2 + 2 segmenters')
  assert.equal(sty.find((f) => f.id === 'u2net/human_seg').sources[0].name, 'hf-mirror')
  for (const f of cuda.files) assert.ok(/^[a-f0-9]{64}$/.test(f.sha256) && f.bytes > 0 && f.sources.length >= 1, f.id)
  const global = inst.planAnimeLocalInstall({ cfg, hardware: { device: 'cuda', torchIndex: 'cu126' }, mirror: 'global' })
  assert.equal(global.packages[0].indexUrl, 'https://download.pytorch.org/whl/cu126')
  assert.equal(global.packages[1].indexUrl, 'https://pypi.org/simple')
  assert.equal(global.files.find((f) => f.component === 'tha3').sources[0].name, 'official-zip', 'global: the author first')
  const cpu = inst.planAnimeLocalInstall({ cfg, components: ['tha3'], hardware: { device: 'cpu' }, mirror: 'cn' })
  assert.equal(cpu.packages[0].indexUrl, 'https://pypi.tuna.tsinghua.edu.cn/simple', 'CPU torch comes from PyPI (its Windows wheels are the CPU build)')
  assert.ok(cpu.files.every((f) => f.id.startsWith('tha3/separable_float/')))
  assert.equal(cpu.files.length, 5)
  assert.throws(() => inst.planAnimeLocalInstall({ cfg, components: ['nope'], hardware: { device: 'cpu' } }), /请选择/)
})

await test('size estimates: NVIDIA installs are bigger than CPU ones; labels in plain words', () => {
  const a = inst.estimateAnimeInstallSize({ device: 'cuda' })
  const b = inst.estimateAnimeInstallSize({ device: 'cpu' })
  assert.ok(a.downloadMb > b.downloadMb && a.diskMb > b.diskMb)
  assert.match(a.label, /下载约 .+GB，占用硬盘约 .+GB/)
  assert.ok(inst.estimateAnimeInstallSize({ components: ['stylize'], device: 'cuda' }).diskMb < 3000, 'stylize alone needs no torch')
})

// ------------------------------------------------------------------------------------------
// Status with fake installs (files created at their exact sizes without writing data)
// ------------------------------------------------------------------------------------------
const INSTALL = join(SCRATCH, 'ai-engines', 'anime-local')
function makeFile(abs, bytes) {
  mkdirSync(dirname(abs), { recursive: true })
  const fd = openSync(abs, 'w')
  try {
    ftruncateSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}
function fakeInstall({ device = 'cpu', variants = ['separable_float'], styles = null } = {}) {
  const cfg = inst.resolveAnimeLocalConfig({ home: INSTALL })
  const comps = styles ? ['tha3', 'stylize'] : ['tha3']
  for (const f of inst.animeModelFiles(cfg, { components: comps, device, variants, styles: styles || undefined })) makeFile(f.dest, f.bytes)
  makeFile(cfg.python, 16)
  const manifest = { schema: 1, engine: 'anime-local', version: 1, home: INSTALL, python: cfg.python, cacheDir: join(SCRATCH, 'ai-engines', '.cache'), device, gpu: device === 'cuda' ? 'Test GPU' : '', components: { tha3: { installed: true, variants }, stylize: styles ? { installed: true, styles } : { installed: false } }, speed: { tha3: { device, fps: device === 'cuda' ? 40 : 3 } }, installedAt: new Date().toISOString() }
  writeFileSync(inst.animeLocalManifestPath(), JSON.stringify(manifest, null, 2))
  return cfg
}

await test('status: nothing installed → not ready, a plain explanation', () => {
  const st = inst.getAnimeLocalStatus()
  assert.equal(st.ready, false)
  assert.equal(st.stylizeReady, false)
  assert.equal(st.device, '')
  assert.match(st.summary, /还没有安装/)
})

await test('status: every pinned file at its size → ready (CPU); a wrong size is reported missing', () => {
  const cfg = fakeInstall({ device: 'cpu', variants: ['separable_float'] })
  const st = inst.getAnimeLocalStatus()
  assert.equal(st.ready, true, JSON.stringify(st.tha3.missing))
  assert.equal(st.device, 'cpu')
  assert.equal(st.tha3.variant, 'separable_float')
  assert.match(st.summary, /CPU/)
  const victim = join(cfg.tha3Dir, 'separable_float', 'editor.pt')
  makeFile(victim, 1234)
  const st2 = inst.getAnimeLocalStatus()
  assert.equal(st2.ready, false)
  assert.ok(st2.tha3.missing.includes('tha3/separable_float/editor.pt'))
  makeFile(victim, inst.THA3_WEIGHTS.separable_float['editor.pt'][1])
  assert.equal(inst.getAnimeLocalStatus().ready, true)
})

await test('installer: an unsuitable computer is refused before anything is created', async () => {
  const dir = join(SCRATCH, 'refused', 'anime-local')
  const progress = []
  await assert.rejects(inst.installAnimeLocal({ installDir: dir, hardwareProfile: PROFILES.lowRam, onProgress: (p) => progress.push(p) }), (err) => {
    assert.equal(err.code, 'ANIME_LOCAL_UNSUITABLE')
    assert.equal(err.status, 409)
    assert.match(err.message, /内存不够/)
    return true
  })
  assert.equal(existsSync(dir), false)
  assert.equal(existsSync(join(SCRATCH, 'refused', '.cache')), false)
  assert.equal(progress.length, 0)
  await assert.rejects(inst.installAnimeLocal({ installDir: dir, components: [], hardwareProfile: PROFILES.rtx5070 }), (err) => err.code === 'BAD_REQUEST')
})

// ------------------------------------------------------------------------------------------
// Pinned downloads (local HTTP server) + zip reader
// ------------------------------------------------------------------------------------------
await test('pinned download: a source with other bytes is refused, the right one accepted, a .part resumes', async () => {
  const good = Buffer.alloc(300_000)
  for (let i = 0; i < good.length; i++) good[i] = (i * 31 + 7) & 255
  const bad = Buffer.from(good)
  bad[1000] ^= 0xff
  const sha = createHash('sha256').update(good).digest('hex')
  const seen = []
  const server = createServer((req, res) => {
    seen.push({ url: req.url, range: req.headers.range || '' })
    const body = req.url.startsWith('/bad') ? bad : good
    const m = /^bytes=(\d+)-$/.exec(req.headers.range || '')
    if (m) {
      const from = Number(m[1])
      res.writeHead(206, { 'Content-Length': body.length - from, 'Content-Range': `bytes ${from}-${body.length - 1}/${body.length}` })
      return res.end(body.subarray(from))
    }
    res.writeHead(200, { 'Content-Length': body.length })
    res.end(body)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const dest = join(SCRATCH, 'dl', 'model.bin')
    const notes = []
    const res = await inst.downloadPinnedFile({ sources: [{ name: 'bad-mirror', url: `${base}/bad` }, { name: 'official', url: `${base}/good` }], dest, sha256: sha, bytes: good.length, onNote: (n) => notes.push(n) })
    assert.equal(res.source, 'official')
    assert.ok(readFileSync(dest).equals(good))
    assert.ok(notes.some((n) => /不一致/.test(n)), 'the user is told the mirror file was refused')
    assert.equal(existsSync(`${dest}.part`), false)
    // resume: half of the file already there from the same source
    const dest2 = join(SCRATCH, 'dl', 'model2.bin')
    writeFileSync(`${dest2}.part`, good.subarray(0, 120_000))
    writeFileSync(`${dest2}.part.src`, `${base}/good`)
    seen.length = 0
    await inst.downloadPinnedFile({ sources: [{ name: 'official', url: `${base}/good` }], dest: dest2, sha256: sha, bytes: good.length })
    assert.ok(readFileSync(dest2).equals(good))
    assert.equal(seen[0].range, 'bytes=120000-')
    // every source wrong → a clear error
    await assert.rejects(inst.downloadPinnedFile({ sources: [{ name: 'bad', url: `${base}/bad` }], dest: join(SCRATCH, 'dl', 'x.bin'), sha256: sha, bytes: good.length }), (err) => err.code === 'DOWNLOAD_FAILED' && /指纹不符/.test(err.message))
  } finally {
    server.close()
  }
})

function makeZip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const { name, data, deflate } of entries) {
    const comp = deflate ? deflateRawSync(data) : data
    const nameBuf = Buffer.from(name)
    const crc = 0 // the reader does not check CRCs (every model file is checked by SHA-256 instead)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(deflate ? 8 : 0, 8)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4)
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(deflate ? 8 : 0, 10)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(comp.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nameBuf.length, 28)
    ch.writeUInt32LE(offset, 42)
    locals.push(lh, nameBuf, comp)
    centrals.push(ch, nameBuf)
    offset += 30 + nameBuf.length + comp.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}

await test('zip reader: lists and extracts stored and deflated entries (the official THA3 zip route)', async () => {
  const a = Buffer.from('stored entry '.repeat(100))
  const b = Buffer.alloc(200_000, 7)
  const zip = join(SCRATCH, 'zip', 'models.zip')
  mkdirSync(dirname(zip), { recursive: true })
  writeFileSync(zip, makeZip([{ name: 'LICENSE.txt', data: a }, { name: 'standard_float/editor.pt', data: b, deflate: true }]))
  const list = inst.readZipEntries(zip)
  assert.deepEqual(list.map((e) => [e.name, e.method, e.size]), [['LICENSE.txt', 0, a.length], ['standard_float/editor.pt', 8, b.length]])
  await inst.extractZipEntry(zip, list[1], join(SCRATCH, 'zip', 'out', 'editor.pt'))
  await inst.extractZipEntry(zip, list[0], join(SCRATCH, 'zip', 'out', 'LICENSE.txt'))
  assert.ok(readFileSync(join(SCRATCH, 'zip', 'out', 'editor.pt')).equals(b))
  assert.ok(readFileSync(join(SCRATCH, 'zip', 'out', 'LICENSE.txt')).equals(a))
  writeFileSync(join(SCRATCH, 'zip', 'broken.zip'), Buffer.from('not a zip'))
  assert.throws(() => inst.readZipEntries(join(SCRATCH, 'zip', 'broken.zip')), /zip/)
})

// ------------------------------------------------------------------------------------------
// THA3 input image
// ------------------------------------------------------------------------------------------
await test('framing: the eye midpoint lands on the model eye line, the face is sized by the eyes and the mouth', () => {
  const f = local.planThaFraming({ width: 400, height: 600, face: { eyes: [{ x: 0.6, y: 0.3 }, { x: 0.4, y: 0.3 }], mouth: { x: 0.5, y: 0.38 } } })
  const mid = [0.5 * 400, 0.3 * 600]
  assert.ok(Math.abs(f.scale * mid[0] + f.dx - 256) < 1e-9 && Math.abs(f.scale * mid[1] + f.dy - 147) < 1e-9)
  const sE = 43 / 80
  const sM = 27 / (0.08 * 600)
  assert.ok(Math.abs(f.scale - Math.exp(0.6 * Math.log(sE) + 0.4 * Math.log(sM))) < 1e-9)
  // a mouth mark far off is ignored (the eyes decide)
  const g = local.planThaFraming({ width: 400, height: 600, face: { eyes: [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }], mouth: { x: 0.5, y: 0.9 } } })
  assert.ok(Math.abs(g.scale - sE) < 1e-9)
  for (const face of [null, { eyes: [{ x: 0.5, y: 0.3 }] }, { eyes: [{ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }], mouth: { x: 0.5, y: 0.2 } }]) {
    assert.throws(() => local.planThaFraming({ width: 400, height: 600, face }), (err) => err.code === 'UNSUPPORTED_IMAGE')
  }
})

await test('crop plan: even sizes with a small margin inside the frame, capped by maxHeight', () => {
  assert.deepEqual(local.planClipCrop([176, 140, 336, 380]), { x: 174, y: 138, w: 164, h: 244, outW: 164, outH: 244 })
  const c = local.planClipCrop([0, 1, 511, 512], { maxHeight: 300 })
  assert.ok(c.w % 2 === 0 && c.h % 2 === 0 && c.x >= 0 && c.y >= 0 && c.x + c.w <= 512 && c.y + c.h <= 512)
  assert.equal(c.outH, 300)
  assert.equal(c.outW % 2, 0)
  assert.deepEqual(local.planClipCrop(null), { x: 0, y: 0, w: 512, h: 512, outW: 512, outH: 512 })
})

// a test character: transparent background, a head with two dark eyes and a mouth, a body
const CHAR_ID = 'c-test-0001'
const CHAR_DIR = join(HOME, 'anime-characters', CHAR_ID)
const EYES = [[150, 170], [214, 170]]
const MOUTH = [182, 215]
function makePortrait() {
  const W = 364
  const H = 600
  const rgba = Buffer.alloc(W * H * 4)
  const put = (x, y, r, g, b) => {
    const p = (y * W + x) * 4
    rgba[p] = r
    rgba[p + 1] = g
    rgba[p + 2] = b
    rgba[p + 3] = 255
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const head = ((x - 182) / 90) ** 2 + ((y - 180) / 110) ** 2 <= 1
      const body = y > 270 && Math.abs(x - 182) < 150 - Math.max(0, 300 - y) * 0.3
      if (head) put(x, y, 250, 215, 190)
      else if (body) put(x, y, 60, 80, 160)
    }
  }
  for (const [ex, ey] of EYES) for (let y = ey - 6; y <= ey + 6; y++) for (let x = ex - 6; x <= ex + 6; x++) if ((x - ex) ** 2 + (y - ey) ** 2 <= 36) put(x, y, 20, 20, 30)
  for (let x = MOUTH[0] - 12; x <= MOUTH[0] + 12; x++) put(x, MOUTH[1], 160, 60, 60)
  mkdirSync(CHAR_DIR, { recursive: true })
  writeFileSync(join(CHAR_DIR, 'portrait.png'), local.encodePngRgba(rgba, W, H))
  const rec = { schema: 1, id: CHAR_ID, name: '测试形象', version: 1, status: 'ready', error: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: { kind: 'cartoon', file: 'portrait.png' }, stylize: { method: 'none' }, portrait: 'portrait.png', width: W, height: H, aspect: W / H, face: { eyes: EYES.map(([x, y]) => ({ x: x / W, y: y / H, w: 0.05 })), mouth: { x: MOUTH[0] / W, y: MOUTH[1] / H, w: 0.07 }, mouthOriginal: 'closed', checked: true }, cloud: {} }
  writeFileSync(join(CHAR_DIR, 'character.json'), JSON.stringify(rec, null, 2))
}

await test('PNG: the pure-JS encoder round-trips through FFmpeg', async () => {
  const W = 37
  const H = 23
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 13) & 255
  const abs = join(SCRATCH, 'png', 'rt.png')
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, local.encodePngRgba(rgba, W, H))
  const back = await local.decodeImageRgba(abs)
  assert.equal(back.width, W)
  assert.equal(back.height, H)
  assert.ok(back.rgba.equals(rgba))
})

await test('prepareThaImage: a 512×512 RGBA input with the face in the head box, recorded on the character', async () => {
  makePortrait()
  const chars = await imp('packages/dsh-tool-avatar/anime-character.js')
  const ch = chars.getCharacter(CHAR_ID)
  assert.ok(ch, 'test character readable by the library')
  const res = await local.prepareThaImage(ch)
  assert.equal(res.cached, false)
  const img = await local.decodeImageRgba(res.path)
  assert.equal(img.width, 512)
  assert.equal(img.height, 512)
  const px = (x, y) => [...img.rgba.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4)]
  // the eyes (dark) land around (256 ± 21.5, 147)
  for (const ex of [234, 278]) {
    const [r, g, b, a] = px(ex, 147)
    assert.ok(a === 255 && r < 90 && g < 90 && b < 100, `eye at ${ex},147: ${[r, g, b, a]}`)
  }
  assert.deepEqual(px(5, 5), [0, 0, 0, 0], 'background is (0,0,0,0)')
  assert.ok(px(256, 120)[3] === 255, 'forehead inside the head box')
  const rec = chars.getCharacter(CHAR_ID)
  assert.equal(rec.tha.ok, true)
  assert.equal(rec.tha.image, 'tha-512.png')
  assert.equal(rec.tha.version, rec.version)
  assert.equal(rec.tha.framingVersion, local.THA_FRAMING_VERSION)
  assert.equal(chars.characterEngines(rec).tha3, true)
  const again = await local.prepareThaImage(rec)
  assert.equal(again.cached, true)
})

// ------------------------------------------------------------------------------------------
// Render pipeline with a fake renderer (real FFmpeg)
// ------------------------------------------------------------------------------------------
const FAKE_THA = join(SCRATCH, 'fake-tha3.mjs')
writeFileSync(
  FAKE_THA,
  `import { readFileSync, writeFileSync } from 'node:fs'
const args = process.argv.slice(2)
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : '' }
const mode = process.env.FAKE_THA_MODE || 'ok'
const device = arg('--device')
const ev = (o) => process.stderr.write(JSON.stringify(o) + '\\n')
const poses = JSON.parse(readFileSync(arg('--poses'), 'utf8'))
if (process.env.FAKE_THA_STATS) writeFileSync(process.env.FAKE_THA_STATS, JSON.stringify({ frames: poses.poses.length, names: poses.names.length, fps: poses.fps, device, variant: arg('--variant'), image: arg('--image') }))
if (mode === 'fail') { ev({ event: 'error', code: 'RENDER_FAILED', message: 'boom' }); process.exit(1) }
if (mode === 'oom-cuda' && device === 'cuda') { ev({ event: 'error', code: 'CUDA_OOM', message: 'not enough GPU memory' }); process.exit(3) }
ev({ event: 'loaded', device, frames: poses.poses.length })
if (mode === 'hang') {
  setTimeout(() => {}, 600000)
} else {
  const S = 512
  const frame = Buffer.alloc(S * S * 4)
  const [x0, y0, x1, y1] = [176, 140, 336, 380]
  const write = (buf) => new Promise((r) => (process.stdout.write(buf) ? r() : process.stdout.once('drain', r)))
  const N = poses.poses.length
  for (let f = 0; f < N; f++) {
    frame.fill(0)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = (y * S + x) * 4; frame[p] = 200; frame[p + 1] = (f * 7) % 256; frame[p + 2] = 120; frame[p + 3] = 255 }
    await write(frame)
    if (f % 5 === 4 || f === N - 1) ev({ event: 'progress', done: f + 1, total: N, fps: 30 })
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 150))
  }
  ev({ event: 'result', ok: true, frames: N, width: S, height: S, bbox: [x0, y0, x1, y1], secs: 0.5, fps: 60, device, variant: arg('--variant'), batch: 1, vramPeakMb: 0 })
}
`,
)
const RUNNER = { bin: process.execPath, args: [FAKE_THA] }
const AUDIO = writeWav(join(SCRATCH, 'audio', 'voice-2s.wav'), speechPcm(2.4))
mkdirSync(join(SCRATCH, 'project'), { recursive: true })
const { ffmpeg, ffprobe } = shared.resolveBinaries()
const probe = (abs) => JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:stream_tags=alpha_mode:format=duration', '-of', 'json', abs], { encoding: 'utf8', windowsHide: true }).stdout)
const alphaStats = (abs) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', abs, '-vframes', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 64 << 20, windowsHide: true })
  let zero = 0
  let full = 0
  for (let i = 3; i < r.stdout.length; i += 4) {
    if (r.stdout[i] === 0) zero++
    else if (r.stdout[i] >= 250) full++
  }
  return { zero, full, px: r.stdout.length / 4 }
}
const characterNow = async () => (await imp('packages/dsh-tool-avatar/anime-character.js')).getCharacter(CHAR_ID)

await test('render: fake renderer → real VP9 + alpha WebM, the audio length, cropped to the character; then a cache hit', async () => {
  fakeInstall({ device: 'cpu', variants: ['separable_float'] })
  const stats = join(SCRATCH, 'fake-stats.json')
  process.env.FAKE_THA_STATS = stats
  const out = join(SCRATCH, 'project', 'assets', 'presenter.webm')
  const progress = []
  const res = await local.renderPresenterClip({ character: await characterNow(), audioAbs: AUDIO, outAbs: out, fps: 30, _runner: RUNNER, onProgress: (p) => progress.push(p) })
  delete process.env.FAKE_THA_STATS
  assert.equal(res.ok, true)
  assert.equal(res.engine, 'tha3')
  assert.equal(res.cached, false)
  assert.equal(res.device, 'cpu')
  assert.equal(res.renderFps, 15, 'a CPU renders 15 frames per second of video')
  assert.equal(res.path, resolve(out))
  assert.deepEqual([res.width, res.height], [164, 244])
  const s = JSON.parse(readFileSync(stats, 'utf8'))
  assert.deepEqual([s.frames, s.names, s.fps, s.device, s.variant], [Math.ceil(2.4 * 15 - 1e-6), 45, 15, 'cpu', 'separable_float'])
  assert.match(s.image.replace(/\\/g, '/'), /c-test-0001\/tha-512\.png$/)
  const p = probe(out)
  assert.equal(p.streams[0].codec_name, 'vp9')
  assert.equal(String(p.streams[0].tags?.alpha_mode ?? p.streams[0].tags?.ALPHA_MODE), '1')
  assert.ok(Math.abs(Number(p.format.duration) - 2.4) <= 1 / 30 + 0.05, `duration ${p.format.duration}`)
  assert.ok(Math.abs(res.durationSec - 2.4) < 0.01)
  const a = alphaStats(out)
  assert.ok(a.zero > 0 && a.full > a.px * 0.8, `alpha ${JSON.stringify(a)}`)
  assert.ok(progress.some((x) => /帧/.test(x.message)) && progress.at(-1).pct === 100)
  assert.ok(progress.every((x) => typeof x.message === 'string' && /[\u4e00-\u9fa5]/.test(x.message)), 'plain Chinese progress')
  // the same voice + character + options again: no rendering
  const t0 = Date.now()
  const out2 = join(SCRATCH, 'project', 'assets', 'presenter-again.webm')
  const again = await local.renderPresenterClip({ character: await characterNow(), audioAbs: AUDIO, outAbs: out2, fps: 30, _runner: { bin: process.execPath, args: ['-e', 'process.exit(9)'] } })
  assert.equal(again.cached, true)
  assert.ok(Date.now() - t0 < 3000)
  assert.equal(statSync(out2).size, statSync(out).size)
  const cacheFiles = readdirSync(local.presenterCacheDir(out))
  assert.ok(cacheFiles.some((f) => /^tha3-[a-f0-9]{40}\.webm$/.test(f)) && cacheFiles.some((f) => /\.webm\.json$/.test(f)))
  assert.ok(!cacheFiles.some((f) => f.startsWith('tmp-')), 'temporary files removed')
})

await test('cache key: changes with the character version, the voice and the options', () => {
  const base = { characterId: CHAR_ID, characterVersion: 1, audioSha256: 'a'.repeat(64), options: { fps: 30, maxHeight: 720 } }
  const k = local.presenterCacheKey(base)
  assert.match(k, /^[a-f0-9]{40}$/)
  assert.notEqual(k, local.presenterCacheKey({ ...base, characterVersion: 2 }))
  assert.notEqual(k, local.presenterCacheKey({ ...base, audioSha256: 'b'.repeat(64) }))
  assert.notEqual(k, local.presenterCacheKey({ ...base, options: { fps: 25, maxHeight: 720 } }))
  assert.equal(k, local.presenterCacheKey({ ...base }))
})

await test('render: stopping kills the renderer and FFmpeg, and leaves no clip', async () => {
  fakeInstall({ device: 'cpu', variants: ['separable_float'] })
  const audio = writeWav(join(SCRATCH, 'audio', 'voice-abort.wav'), speechPcm(3.1))
  const out = join(SCRATCH, 'project', 'assets', 'aborted.webm')
  const ctrl = new AbortController()
  const children = []
  process.env.FAKE_THA_MODE = 'slow'
  try {
    await assert.rejects(
      local.renderPresenterClip({ character: await characterNow(), audioAbs: audio, outAbs: out, fps: 30, _runner: RUNNER, signal: ctrl.signal, onChild: (c) => children.push(c), onProgress: (p) => /帧/.test(p.message) && ctrl.abort() }),
      (err) => err.name === 'AbortError',
    )
  } finally {
    delete process.env.FAKE_THA_MODE
  }
  const t0 = Date.now()
  while (children.some((c) => c.exitCode === null && c.signalCode === null) && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 100))
  assert.ok(children.length >= 2, 'renderer + FFmpeg were started')
  assert.ok(children.every((c) => c.exitCode !== null || c.signalCode !== null), 'every child process ended')
  assert.equal(existsSync(out), false)
  const cache = readdirSync(local.presenterCacheDir(out))
  assert.ok(!cache.some((f) => f.startsWith('tmp-')), `no temporary folder left: ${cache.join(',')}`)
  assert.equal(cache.filter((f) => f.endsWith('.webm')).length, 1, 'only the clip of the first test is cached')
})

await test('render: a renderer that stops making progress is stopped (TIMEOUT)', async () => {
  const audio = writeWav(join(SCRATCH, 'audio', 'voice-hang.wav'), speechPcm(1.3))
  process.env.FAKE_THA_MODE = 'hang'
  const t0 = Date.now()
  try {
    await assert.rejects(local.renderPresenterClip({ character: await characterNow(), audioAbs: audio, outAbs: join(SCRATCH, 'project', 'assets', 'hang.webm'), _runner: RUNNER, stallMs: 1500, startupMs: 1500 }), (err) => err.code === 'TIMEOUT' && /已停止/.test(err.message))
  } finally {
    delete process.env.FAKE_THA_MODE
  }
  assert.ok(Date.now() - t0 < 15000)
})

await test('render: a renderer failure is PROVIDER_ERROR; GPU out of memory falls back to the CPU', async () => {
  const audio = writeWav(join(SCRATCH, 'audio', 'voice-fail.wav'), speechPcm(1.1))
  process.env.FAKE_THA_MODE = 'fail'
  try {
    await assert.rejects(local.renderPresenterClip({ character: await characterNow(), audioAbs: audio, outAbs: join(SCRATCH, 'project', 'assets', 'fail.webm'), _runner: RUNNER }), (err) => err.code === 'PROVIDER_ERROR' && /boom/.test(err.message))
    process.env.FAKE_THA_MODE = 'oom-cuda'
    const res = await local.renderPresenterClip({ character: await characterNow(), audioAbs: audio, outAbs: join(SCRATCH, 'project', 'assets', 'oom.webm'), device: 'cuda', _runner: RUNNER })
    assert.equal(res.device, 'cpu')
    assert.match(res.note, /显存不够.*CPU/)
  } finally {
    delete process.env.FAKE_THA_MODE
  }
})

await test('render: not installed → NOT_INSTALLED (plain message)', async () => {
  const keep = process.env.DSH_VIDEO_HOME
  process.env.DSH_VIDEO_HOME = join(SCRATCH, 'empty-home')
  try {
    await assert.rejects(local.renderPresenterClip({ character: { id: CHAR_ID, dir: CHAR_DIR, version: 1 }, audioAbs: AUDIO, outAbs: join(SCRATCH, 'x.webm') }), (err) => err.code === 'NOT_INSTALLED' && /还没有安装/.test(err.message))
    await assert.rejects(local.stylizePortraitLocal({ inAbs: AUDIO, outAbs: join(SCRATCH, 'x.png') }), (err) => err.code === 'NOT_INSTALLED')
  } finally {
    process.env.DSH_VIDEO_HOME = keep
  }
})

await test('stylize: the result and the plain error codes (fake stylizer)', async () => {
  fakeInstall({ device: 'cpu', variants: ['separable_float'], styles: ['anime'] })
  assert.equal(inst.getAnimeLocalStatus().stylizeReady, true)
  const fake = join(SCRATCH, 'fake-stylize.mjs')
  writeFileSync(
    fake,
    `import { copyFileSync } from 'node:fs'
const args = process.argv.slice(2)
const arg = (k) => args[args.indexOf(k) + 1]
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
out({ event: 'progress', pct: 5, message: 'loading' })
if (process.env.FAKE_STY_MODE === 'noface') { out({ event: 'error', code: 'NO_FACE', message: 'no clear face' }); process.exit(2) }
copyFileSync(arg('--input'), arg('--output'))
// like anime_stylize.py: a style that is not installed falls back to anime
const style = ['anime'].includes(arg('--style')) ? arg('--style') : 'anime'
out({ event: 'result', ok: true, path: arg('--output'), width: 10, height: 10, faces: 1, style, styles: ['anime'], secs: 0.1, note: '' })
`,
  )
  const photo = join(CHAR_DIR, 'portrait.png')
  const res = await local.stylizePortraitLocal({ inAbs: photo, outAbs: join(SCRATCH, 'sty', 'out.png'), style: 'chibi', _runner: { bin: process.execPath, args: [fake] } })
  assert.equal(res.engine, 'dct-net')
  assert.equal(res.style, 'anime', 'chibi asks for design; this install only has anime')
  assert.ok(existsSync(res.path))
  assert.match(res.note, /萌系插画/)
  assert.match(res.note, /日系动漫/)
  process.env.FAKE_STY_MODE = 'noface'
  try {
    await assert.rejects(local.stylizePortraitLocal({ inAbs: photo, outAbs: join(SCRATCH, 'sty', 'out2.png'), _runner: { bin: process.execPath, args: [fake] } }), (err) => err.code === 'UNSUPPORTED_IMAGE' && /正脸/.test(err.message))
  } finally {
    delete process.env.FAKE_STY_MODE
  }
})

// ------------------------------------------------------------------------------------------
// Summary + cleanup
// ------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.status === 'fail')
const passed = results.filter((r) => r.status === 'pass')
if (!process.env.DSH_ANIME_TEST_DIR) {
  try {
    rmSync(SCRATCH, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    if (!readdirSync(dirname(SCRATCH)).length) rmdirSync(dirname(SCRATCH))
  } catch {}
}
console.log(`\n${passed.length} passed${failed.length ? `, ${failed.length} failed` : ''}`)
process.exitCode = failed.length ? 1 : 0
