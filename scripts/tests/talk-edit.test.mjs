#!/usr/bin/env node
/**
 * 口播剪辑 (talking-head rough cut) + 本地语音识别 + 真实字幕 — backend tests (no network, no LLM):
 *   - speech engine: status / missing parts without an install, ASCII-only install folder, refusal before any download,
 *     transcription refused with code ASR_NOT_INSTALLED, the npm tarball unpacker never writes outside its folder and
 *     never creates links, integrity check
 *   - rough-cut planning on synthetic transcripts (tokens + energy envelope): long pauses shortened, head / tail trimmed,
 *     fillers (嗯 / um) cut but 好啊 / mid-sentence 那个 kept, stutters (我我我 / I I) cut but 对对对 / 好好学习 / that that
 *     kept, false starts and retakes keep the LAST take, parallel sentences (第一个… 第二个…) are never retakes, isolated
 *     mis-recognised syllables cut but 好 kept, user overrides (restore / cut words), frame grid, exact frame totals
 *   - captions: width limit per canvas, sentence breaks, clause commas shown as spaces, per-word timing in order,
 *     removed words never shown, SRT
 *   - talk-edit helpers: whole-millisecond scene grid, scenes cover every frame, sentence-boundary scene cuts, punch-in
 *     frames, canvas size, frame-exact cut filter (constant frame rate first, 48 kHz audio)
 *   - Remotion: the presenter layer and real captions in the composition, talk-kit.tsx strict typecheck; AI notice
 *   - optional (engine installed + Windows SAPI voice): a synthetic talking-head recording built into a project with
 *     frame-exact picture / sound and sample-exact sync
 *
 *   node scripts/tests/talk-edit.test.mjs
 *
 * Scratch data only (<repo>/.tmp/talk-edit-test/<stamp>); network is blocked; the real `.env` / DSH client are never read.
 * The optional integration part uses the engine at DSH_ASR_TEST_HOME (or the configured one) and skips when missing.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'talk-edit-test', new Date().toISOString().replace(/[:.]/g, '-'))
const dirs = { home: join(SCR, 'home'), ws: join(SCR, 'ws'), dshClient: join(SCR, 'no-dsh-client'), asrEmpty: join(SCR, 'asr-empty') }
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })
const emptyEnv = join(SCR, 'empty.env')
writeFileSync(emptyEnv, '# intentionally empty\n')
const testAsrHome = String(process.env.DSH_ASR_TEST_HOME || '').trim()
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'DSH_ASR_HOME']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: emptyEnv,
  DSH_VIDEO_HOME: dirs.home,
  DSH_VIDEO_WORKSPACE: dirs.ws,
  DSH_CLIENT_HOME: dirs.dshClient,
  DSH_HOME: dirs.dshClient,
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
// tests never download the local speech engine (transcription would otherwise wait for its automatic install)
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0'
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

/* ------------------------------------------------------------------------------------------- synthetic transcripts */
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/
const PUNCT = /[，。！？、,.!?]/
/**
 * items: { say, lang? } (one recogniser segment) | { pause: seconds }. CJK characters take `charSec`, Latin words
 * `wordSec`; every sounding token is loud for 90 % of its slot in a 10 ms energy envelope (-18 dB vs -80 dB silence).
 */
function synthTranscript(items, { charSec = 0.2, wordSec = 0.3 } = {}) {
  const segments = []
  const loud = []
  let t = 0
  for (const it of items) {
    if (it.pause) {
      t += it.pause
      continue
    }
    const lang = it.lang || (CJK.test(it.say) ? 'zh' : 'en')
    const tokens = []
    const start = t
    if (lang === 'en') {
      const parts = it.say.match(/[A-Za-z0-9']+|[.,!?]/g) || []
      parts.forEach((p, i) => {
        if (PUNCT.test(p)) {
          tokens.push({ t: p, s: Number(t.toFixed(3)) })
          return
        }
        tokens.push({ t: i === 0 ? p : ` ${p}`, s: Number(t.toFixed(3)) })
        loud.push([t, t + wordSec * 0.9])
        t += wordSec
      })
    } else {
      for (const ch of it.say) {
        if (PUNCT.test(ch)) {
          tokens.push({ t: ch, s: Number(t.toFixed(3)) })
          continue
        }
        tokens.push({ t: ch, s: Number(t.toFixed(3)) })
        loud.push([t, t + charSec * 0.9])
        t += charSec
      }
    }
    segments.push({ start: Number(start.toFixed(3)), end: Number(t.toFixed(3)), lang, emotion: 'NEUTRAL', event: 'Speech', text: it.say, tokens })
  }
  const total = t + 0.5
  const n = Math.ceil(total / 0.01)
  const buf = Buffer.alloc(n)
  for (let f = 0; f < n; f++) {
    const time = f * 0.01 + 0.005
    buf.writeInt8(loud.some(([a, b]) => time >= a && time < b) ? -18 : -80, f)
  }
  return { version: 2, durationSec: Number(total.toFixed(3)), language: 'zh', segments, energy: { hopSec: 0.01, db: buf.toString('base64') } }
}

/* ------------------------------------------------------------------------------------------- speech engine */
await section('speech engine (not installed)', async () => {
  const sr = await imp('packages/dsh-tool-media/speech-recognition.js')
  const st = await sr.getAsrStatus({ home: dirs.asrEmpty, force: true })
  check('status without an install: not ready, every missing part named', st.ready === false && st.missing.includes('识别引擎运行库') && st.missing.some((m) => m.includes('SenseVoice')) && st.missing.some((m) => m.includes('VAD')), JSON.stringify(st.missing))
  check('the attribution (FunASR model licence, sherpa-onnx, silero) is always reported', st.attribution.length === 3 && st.attribution[0].includes('FunASR') && st.attribution[0].includes('允许商用'))
  const cat = sr.getAsrInstallerCatalog()
  check('installer catalog: size, languages, recommended ASCII folder', /260 MB/.test(cat.package.diskRequired) && cat.package.languages.includes('粤语') && /^[\x20-\x7e]+$/.test(cat.recommendedHome))
  let err = null
  try {
    await sr.installAsrEngine({ installDir: join(SCR, '中文目录', 'asr'), writeEnv: false })
  } catch (e) {
    err = e
  }
  check('install refuses a folder with Chinese characters before any download', err && /中文/.test(err.message) && !existsSync(join(SCR, '中文目录')), err?.message)
  // a tiny WAV (no engine): transcription is refused with a clear code
  const wav = join(SCR, 'tone.wav')
  const sr16 = 16000
  const samples = 1600
  const b = Buffer.alloc(44 + samples * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr16, 24); b.writeUInt32LE(sr16 * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(samples * 2, 40)
  writeFileSync(wav, b)
  let terr = null
  try {
    await sr.transcribeMedia({ mediaPath: wav, home: dirs.asrEmpty })
  } catch (e) {
    terr = e
  }
  check('transcription without the engine: code ASR_NOT_INSTALLED and how to fix it', terr?.code === 'ASR_NOT_INSTALLED' && /一键安装/.test(terr.message), terr?.message)
  check('pinned downloads: every model file has a size + SHA-256, the runtime a sha512 per platform', sr.ASR_MODEL_FILES.every((f) => f.accept.length && f.accept.every((a) => a.size > 0 && /^[a-f0-9]{64}$/.test(a.sha256))) && Object.values(sr.ASR_PLATFORM_PACKAGES).every((p) => /^sha512-/.test(p.integrity)) && /^sha512-/.test(sr.ASR_RUNTIME.integrity))
})

await section('npm tarball unpacker', async () => {
  const sr = await imp('packages/dsh-tool-media/speech-recognition.js')
  const block = (name, { size = 0, type = '0', link = '' } = {}) => {
    const h = Buffer.alloc(512)
    h.write(name.slice(0, 100), 0, 'utf8')
    h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116)
    h.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
    h.write('00000000000\0', 136)
    h.write('        ', 148)
    h.write(type, 156)
    if (link) h.write(link, 157)
    h.write('ustar\0', 257); h.write('00', 263)
    let sum = 0
    for (const x of h) sum += x
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    return h
  }
  const file = (name, content, extra) => {
    const data = Buffer.from(content, 'utf8')
    const pad = Buffer.alloc((512 - (data.length % 512)) % 512)
    return [block(name, { size: data.length, ...(extra || {}) }), data, pad]
  }
  const pax = (path) => {
    const rec = ` path=${path}\n`
    let len = rec.length + 2
    len = String(len).length + rec.length
    const body = `${len}${rec}`
    return file('PaxHeader', body, { type: 'x' })
  }
  const parts = [
    ...file('package/package.json', '{"name":"x"}'),
    ...file('package/lib/a.js', 'ok'),
    ...file('package/../escape.txt', 'bad'),
    ...file('/abs.txt', 'bad'),
    ...file('package/C:/drive.txt', 'bad'),
    block('package/link', { type: '2', link: '/etc/passwd' }),
    ...pax('package/very/long/name.txt'),
    ...file('short', 'long-name'),
    Buffer.alloc(1024),
  ]
  const tgz = gzipSync(Buffer.concat(parts))
  const dest = join(SCR, 'tar-out', 'pkg')
  const { files } = sr.extractNpmTarball(tgz, dest)
  const listing = []
  const walk = (d, rel = '') => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(join(d, e.name), r)
      else listing.push(r)
    }
  }
  walk(join(SCR, 'tar-out'))
  check('unpacks package/* without the package/ folder, pax long names included', existsSync(join(dest, 'package.json')) && readFileSync(join(dest, 'lib', 'a.js'), 'utf8') === 'ok' && readFileSync(join(dest, 'very', 'long', 'name.txt'), 'utf8') === 'long-name' && files === 3, listing.join(','))
  check('never writes outside its folder, never absolute / drive paths, never links', listing.every((p) => p.startsWith('pkg/')) && !listing.some((p) => /escape|abs|drive|link/.test(p)), listing.join(','))
})

/* ------------------------------------------------------------------------------------------- rough-cut planning */
await section('rough-cut planning', async () => {
  const rc = await imp('packages/dsh-tool-media/rough-cut.js')
  const tA = synthTranscript([
    { pause: 1.0 },
    { say: '大家好，今天我们来聊一聊剪辑。' },
    { pause: 1.6 },
    { say: '很多人觉得剪辑很难。' },
    { pause: 0.3 },
    { say: '嗯' },
    { pause: 0.5 },
    { say: '第一步我们要' },
    { pause: 0.8 },
    { say: '第一步我们要先把素材整理好。' },
    { pause: 0.6 },
    { say: '我我我觉得这一步最重要。' },
    { pause: 0.4 },
    { say: '火' },
    { pause: 0.5 },
    { say: '好，' },
    { pause: 0.3 },
    { say: '谢谢大家。' },
    { pause: 2.0 },
  ])
  const pA = rc.planRoughCut(tA, { fps: 30 })
  const kept = rc.planTexts(pA).keptText
  check('kept text: filler, false start, stutter and the isolated mis-heard syllable are gone, everything said stays', kept === '大家好，今天我们来聊一聊剪辑。很多人觉得剪辑很难。第一步我们要先把素材整理好。我觉得这一步最重要。好，谢谢大家。', kept)
  const kinds = pA.removals.filter((r) => r.applied).map((r) => r.kind)
  check('every removal has a reason the user can read', ['head', 'filler', 'false-start', 'stutter', 'fragment', 'tail', 'pause'].every((k) => kinds.includes(k)) && pA.removals.every((r) => r.label && r.id), kinds.join(','))
  const fs = pA.removals.find((r) => r.kind === 'false-start')
  check('false start: the earlier half sentence goes, the full later take stays', fs?.text === '第一步我们要' && fs.keptText.startsWith('第一步我们要先把'), JSON.stringify(fs))
  check('keep ranges sit on the 30 fps frame grid; output frames = Σ ranges', pA.keep.every((r) => Math.abs(r.start * 30 - Math.round(r.start * 30)) < 0.05 && Math.abs(r.end * 30 - Math.round(r.end * 30)) < 0.05) && pA.outputFrames === rc.keepFrames(pA.keep, 30).reduce((a, r) => a + r.ef - r.sf, 0) && Math.abs(pA.outputDurationSec - pA.outputFrames / 30) < 0.001)
  const pause = pA.removals.find((r) => r.kind === 'pause' && r.start > 3.5 && r.start < 4.2)
  check('the 1.6 s pause is shortened (about 0.24 s of it stays)', pause && pause.end - pause.start > 1.1 && pause.end - pause.start < 1.5, JSON.stringify(pause))
  const wHao0 = [...pA.words].reverse().find((w) => w.text === '好' && !w.removed)
  const wXie = pA.words.find((w) => w.text === '谢谢')
  const sameRange = pA.keep.some((r) => r.start <= wHao0.onset && r.end >= wXie.end)
  check('short in-sentence pauses (0.3 s) are not cut', sameRange && !pA.removals.some((r) => r.applied && r.start >= wHao0.end - 0.01 && r.end <= wXie.onset + 0.01))
  check('head and tail silence trimmed to a short pad', pA.keep[0].start > 0.7 && pA.keep[0].start < 0.95 && pA.sourceDurationSec - pA.keep[pA.keep.length - 1].end > 1.5)

  const tB = synthTranscript([
    { say: '第一个原因是价格便宜。' }, { pause: 0.5 },
    { say: '第二个原因是质量很好。' }, { pause: 0.5 },
    { say: '对对对' }, { pause: 0.5 },
    { say: '好好学习天天向上。' }, { pause: 0.5 },
    { say: '我们那个产品很好。' }, { pause: 0.5 },
    { say: '好啊。' }, { pause: 0.5 },
    { say: '第一步打开软件。' }, { pause: 0.5 },
    { say: '第二步打开软件。' },
  ])
  const pB = rc.planRoughCut(tB, { fps: 30 })
  check('content is never cut: parallel sentences, 对对对, 好好学习, mid-sentence 那个, 好啊, 第一步 / 第二步', pB.removals.filter((r) => r.applied && !['head', 'tail', 'pause'].includes(r.kind)).length === 0, JSON.stringify(pB.removals.filter((r) => r.applied && !['head', 'tail', 'pause'].includes(r.kind))))

  const tC = synthTranscript([
    { say: '开放时间早上九点至下午五点。' }, { pause: 1.0 },
    { say: '开放时间早上九点至下午五点。' }, { pause: 0.5 },
    { say: 'Um', lang: 'en' }, { pause: 0.4 },
    { say: 'I I think that that is fine.', lang: 'en' },
  ])
  const pC = rc.planRoughCut(tC, { fps: 25 })
  const rt = pC.removals.find((r) => r.kind === 'retake')
  check('retake: the first of two same lines goes, the last one stays', rt && rt.start < 1 && rt.end < 3.2 && rc.planTexts(pC).keptText.startsWith('开放时间早上九点至下午五点。Um') === false && rc.planTexts(pC).keptText.includes('开放时间早上九点至下午五点'), JSON.stringify(rt))
  check('English: um and the stuttered I go, "that that" stays', rc.planTexts(pC).keptText.endsWith('I think that that is fine.'), rc.planTexts(pC).keptText)
  check('25 fps grid works too', pC.keep.every((r) => Math.abs(r.start * 25 - Math.round(r.start * 25)) < 0.05))

  // user overrides: restore one removal, cut extra words
  const fsId = pA.removals.find((r) => r.kind === 'false-start').id
  const pR = rc.planRoughCut(tA, { fps: 30 }, { restore: [fsId] })
  check('restoring a removal puts the words back (and reports it as not applied)', rc.planTexts(pR).keptText.includes('剪辑很难。第一步我们要第一步我们要先把') && pR.removals.find((r) => r.id === fsId)?.applied === false, rc.planTexts(pR).keptText)
  const wHao = pA.words.findIndex((w) => w.text === '谢谢')
  const pM = rc.planRoughCut(tA, { fps: 30 }, { cutWords: [[wHao, wHao + 1]] })
  check('cutting words by hand removes them as 手动删除', !rc.planTexts(pM).keptText.includes('谢谢大家') && pM.removals.some((r) => r.kind === 'manual' && r.applied))
  const pOff = rc.planRoughCut(tA, { fps: 30, cutFillers: false, cutStutters: false, cutRetakes: false })
  check('switches: with fillers / stutters / retakes off only pauses are cut', rc.planTexts(pOff).keptText.includes('嗯') && rc.planTexts(pOff).keptText.includes('我我我') && rc.planTexts(pOff).keptText.includes('第一步我们要第一步'))

  // 选段剪辑 (keepOnly): only the chosen passages stay; the rules still clean up inside them
  check('keepOnly normaliser: sorted, merged, clamped, invalid dropped', JSON.stringify(rc.normalizeKeepOnly([[9, 7], [2, 3], [4, 5], ['x', 1], [50, 99], { from: 0, to: 0 }], 20)) === '[[0,0],[2,5],[7,9],[19,19]]' && rc.normalizeKeepOnly(null, 5).length === 0 && rc.normalizeKeepOnly([[1, 2]], 0).length === 0)
  // word index range of one recogniser segment (by time, independent of how the words are segmented)
  const segWords = (text) => {
    const seg = tA.segments.find((s) => s.text === text)
    const idx = pA.words.filter((w) => !w.punct && w.onset >= seg.start - 0.05 && w.onset < seg.end - 0.01).map((w) => w.i)
    return [idx[0], idx[idx.length - 1]]
  }
  const [sA] = segWords('第一步我们要先把素材整理好。')
  const [, sB] = segWords('我我我觉得这一步最重要。')
  const pK = rc.planRoughCut(tA, { fps: 30 }, { keepOnly: [[sA, sB]] })
  const keptK = rc.planTexts(pK).keptText
  check('keepOnly: only the chosen passage stays, its false start / stutter are still removed', keptK === '第一步我们要先把素材整理好。我觉得这一步最重要。', keptK)
  const outside = pK.removals.filter((r) => r.kind === 'outside')
  check('keepOnly: everything else is reported as 选段以外 (one item per stretch, short preview text)', outside.length === 2 && outside.every((r) => r.applied && r.label === '选段以外' && Array.from(r.text).length <= 31) && pK.outputDurationSec < pA.outputDurationSec / 1.5, JSON.stringify(outside.map((r) => r.text)))
  const [sC, sC2] = segWords('谢谢大家。')
  const pK2 = rc.planRoughCut(tA, { fps: 30 }, { keepOnly: [[sA, sB], [sC, sC2]] })
  check('keepOnly: two passages are joined in source order with one cut between them', rc.planTexts(pK2).keptText === '第一步我们要先把素材整理好。我觉得这一步最重要。谢谢大家。' && pK2.keep.length >= 2, rc.planTexts(pK2).keptText)
  const outId = outside[0].id
  const pK3 = rc.planRoughCut(tA, { fps: 30 }, { keepOnly: [[sA, sB]], restore: [outId] })
  check('keepOnly: restoring a 选段以外 stretch brings it back', rc.planTexts(pK3).keptText.startsWith('大家好') && pK3.removals.find((r) => r.id === outId)?.applied === false, rc.planTexts(pK3).keptText)
  check('keepOnly: keep ranges still on the frame grid', pK2.keep.every((r) => Math.abs(r.start * 30 - Math.round(r.start * 30)) < 0.05 && Math.abs(r.end * 30 - Math.round(r.end * 30)) < 0.05))
  check('keepOnly: an empty selection means the whole recording', rc.planTexts(rc.planRoughCut(tA, { fps: 30 }, { keepOnly: [] })).keptText === kept)

  // time mapping + captions
  const m = rc.makeTimeMapper(pA.keep, 30)
  const r1 = pA.keep[1]
  check('time mapper: kept time maps onto the cut timeline, removed time maps to nothing', Math.abs(m.map(r1.start + 0.1) - (m.offsets[1] + 0.1)) < 0.002 && m.map((pA.keep[0].end + r1.start) / 2) === null && Math.abs(m.total - pA.outputFrames / 30) < 1e-6)
  const capsL = rc.buildCaptions(pA, { maxLineWidth: 16, fps: 30 })
  const capsP = rc.buildCaptions(pA, { maxLineWidth: 11, fps: 30 })
  const { displayWidth } = await imp('packages/shared/subtitle-engine.js')
  check('captions: never wider than the canvas allows (16 landscape / 11 portrait, +1 for a merged orphan), no 1–2 column stub', capsL.every((c) => displayWidth(c.text) <= 17) && capsP.every((c) => displayWidth(c.text) <= 12) && capsP.every((c) => displayWidth(c.text) > 2 || /^[好谢对]/.test(c.text)), capsP.map((c) => c.text).join(' | '))
  check('captions: removed words never shown, clause commas shown as spaces, no edge punctuation', capsL.every((c) => !/嗯|火|我我/.test(c.text) && !/[，。]/.test(c.text)) && capsL[0].text === '大家好 今天我们来聊一聊剪辑', capsL.map((c) => c.text).join(' | '))
  check('captions: in order, words timed inside their line and in order', capsL.every((c, i) => (i === 0 || c.startSec >= capsL[i - 1].startSec) && c.words.every((w, k) => w.startSec >= c.startSec - 0.06 && (k === 0 || w.startSec >= c.words[k - 1].startSec))))
  check('captions end at the next one at the latest (no overlap)', capsL.every((c, i) => i === capsL.length - 1 || c.endSec <= capsL[i + 1].startSec + 1e-6))
  const srt = rc.captionsToSrt(capsL)
  check('SRT export', /^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\n大家好 今天我们来聊一聊剪辑\n/.test(srt), srt.slice(0, 80))
  check('punctuation tidy: runs collapse to the strongest mark, never at the start', rc.tidyPunctuation('，。好，，啊。。') === '好，啊。' && rc.tidyPunctuation('好，。') === '好。')
})

/* ------------------------------------------------------------------------------------------- talk-edit helpers */
await section('talk-edit helpers', async () => {
  const te = await imp('packages/dsh-tool-media/talk-edit.js')
  const rc = await imp('packages/dsh-tool-media/rough-cut.js')
  check('whole-millisecond frame step: 24→3, 25→1, 30→3, 60→3', te.msGridStep(24) === 3 && te.msGridStep(25) === 1 && te.msGridStep(30) === 3 && te.msGridStep(60) === 3)
  check('canvas: phone portrait stays, 4K is scaled to 1080p, odd sizes become even', JSON.stringify(te.projectDims({ width: 1080, height: 1920 })) === '{"width":1080,"height":1920}' && JSON.stringify(te.projectDims({ width: 3840, height: 2160 })) === '{"width":1920,"height":1080}' && te.projectDims({ width: 1279, height: 721 }).width % 2 === 0)
  const items = []
  for (let k = 0; k < 9; k++) items.push({ say: `这是第${'一二三四五六七八九'[k]}句话我们要讲得清楚明白。` }, { pause: 0.5 })
  const t = synthTranscript(items)
  const plan = rc.planRoughCut(t, { fps: 30 })
  const caps = rc.buildCaptions(plan, { maxLineWidth: 16, fps: 30 })
  const total = plan.outputFrames
  const groups = te.groupCaptionsIntoScenes(caps, plan, { fps: 30, totalFrames: total, targetSec: 8 })
  check('scenes cover every frame exactly once', groups[0].startFrame === 0 && groups[groups.length - 1].endFrame === total && groups.every((g, i) => i === 0 || g.startFrame === groups[i - 1].endFrame), JSON.stringify(groups.map((g) => [g.startFrame, g.endFrame])))
  check('scene cuts land on whole milliseconds (sample-exact voice slices) and between sentences', groups.slice(1).every((g) => g.startFrame % 3 === 0) && groups.every((g) => g.captions.length > 0))
  const lens = groups.map((g) => (g.endFrame - g.startFrame) / 30)
  check('scene lengths near the target (3 … 16 s)', lens.every((l) => l >= 3 && l <= 16), lens.map((l) => l.toFixed(1)).join(','))
  const jc = te.jumpCutFrames([{ start: 0, end: 2 }, { start: 3, end: 3.5 }, { start: 4, end: 7 }, { start: 8, end: 9 }], 30)
  check('punch-in frames at the joins, at most one per second', JSON.stringify(jc) === '[60,165]', JSON.stringify(jc))
  const f = rc.buildCutFilter([{ start: 1.2, end: 5.167 }, { start: 8.9, end: 11.2 }], { fps: 30, hasVideo: true, enhance: true })
  check('cut filter: constant frame rate first, exact frame bounds, 48 kHz audio, two outputs', f.startsWith('[0:v]fps=30,split=2[vs0][vs1]') && f.includes('trim=start=1.200000:end=5.166667') && f.includes('atrim=start=8.900000:end=11.200000') && f.includes('[0:a]aresample=48000,asplit=2') && f.includes('asplit=2[ao][aw]') && !/NaN|undefined/.test(f), f.slice(0, 160))
  const fa = rc.buildCutFilter([{ start: 0, end: 1 }], { fps: 25, hasVideo: false, enhance: false })
  check('cut filter, audio only: one WAV output', !fa.includes('[0:v]') && fa.trim().endsWith('[aw]'), fa)
  const talkScript = { title: 't', productionType: 'talk-edit', subtitleStyle: 'talk', authoringMode: 'talk-kit', voiceSource: 'host', ambienceBed: false, aiBadgeEnabled: false, talkEdit: { autoBadgeOff: true }, style: 'warm', scenes: [{ id: 'talk-01' }] }
  const stripped = te.stripTalkEditFields(talkScript)
  check('switching back to an AI film drops only the 口播剪辑 settings (caption style, host voice, auto badge-off)', stripped.productionType === 'ai-film' && !('subtitleStyle' in stripped) && !('voiceSource' in stripped) && !('ambienceBed' in stripped) && !('aiBadgeEnabled' in stripped) && !('talkEdit' in stripped) && stripped.style === 'warm' && stripped.scenes.length === 1)
  const userOff = te.stripTalkEditFields({ ...talkScript, talkEdit: {} })
  const plain = { title: 'x', subtitleStyle: 'pill' }
  check('a badge the user switched off stays off; an AI film project is left untouched', userOff.aiBadgeEnabled === false && te.stripTalkEditFields(plain) === plain)
  const { buildComplianceNoticeText } = await imp('packages/shared/compliance.js')
  const n = buildComplianceNoticeText({ productionType: 'talk-edit', bgm: { enabled: true } })
  check('end notice of a talk edit: the person\'s own voice, local captions, automatic cut — no speech synthesis claimed', n.endNoticeBody.includes('真人出镜原声') && n.endNoticeBody.includes('自动粗剪') && !n.endNoticeBody.includes('语音合成') && n.badgeText === 'AI 辅助剪辑')
})

/* ------------------------------------------------------------------------------------------- remotion */
await section('remotion presenter + captions', async () => {
  const { writeRemotionProjectFiles } = await imp('packages/dsh-tool-media/remotion-generator.js')
  const proj = join(dirs.ws, 'talk-remotion')
  mkdirSync(proj, { recursive: true })
  const sc = {
    engine: 'remotion', productionType: 'talk-edit', subtitleStyle: 'talk', fps: 30, width: 1080, height: 1920, totalDurationInFrames: 120,
    scenes: [{ id: 'talk-01', startFrame: 0, durationInFrames: 120, durationSec: 4, layout: 'presenter', presenter: { path: 'assets/edited/x.roughcut.mp4', startFrame: 0, cuts: [45], cutParity: 0 }, subtitles: [{ text: '大家好 今天聊剪辑', startSec: 0, endSec: 2, words: [{ text: '大家好', at: 0, end: 0.6 }] }] }],
    subtitles: [{ text: '大家好 今天聊剪辑', startFrame: 0, endFrame: 60, globalStartFrame: 0, globalEndFrame: 60, words: [{ text: '大家好', at: 0, end: 0.6 }] }],
  }
  writeFileSync(join(proj, 'script.json'), JSON.stringify(sc, null, 2))
  writeRemotionProjectFiles(proj, sc, {})
  const vc = readFileSync(join(proj, 'src', 'VideoComposition.tsx'), 'utf8')
  check('composition: presenter scenes play the cut recording, talk captions use the real words', vc.includes("import { PresenterStage, TalkCaption, TalkPackLayer, talkCaptionReserve } from './lib/talk-kit';") && vc.includes('scene?.presenter?.path ? (') && vc.includes("sData.subtitleStyle === 'talk'") && existsSync(join(proj, 'src', 'lib', 'talk-kit.tsx')))
  check('composition: the 口播包装 layer sits above the scenes, below avatar / captions', vc.includes('{sData.talkPack ? <TalkPackLayer pack={sData.talkPack}') && vc.indexOf('<TalkPackLayer') < vc.indexOf('<AvatarOverlay') && vc.indexOf('<TalkPackLayer') < vc.indexOf('<TalkCaption'))
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const html = buildRichHtmlVideo(sc)
  check('studio live preview (HTML draft): presenter scenes show the cut recording from their start frame, steady camera, no HUD', html.includes('class="k-media-el k-presenter-video" src="assets/edited/x.roughcut.mp4" data-start-frame="0"') && html.includes("meta.layout === 'presenter' ? 0 :") && html.includes("if (meta.layout !== 'presenter') drawHudTelemetryOverlay"))
  const kit = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'remotion-lib', 'talk-kit.tsx'), 'utf8')
  check('talk-kit.tsx is frame-driven (no randomness, no CSS animation)', !/Math\.random\(|@keyframes|transition\s*:/.test(kit) && kit.includes('export const PresenterStage') && kit.includes('export const TalkCaption') && kit.includes('export function alignCaptionWords'))
  const shared = await imp('packages/shared/index.js')
  const suite = await imp('packages/dsh-tool-video-suite/index.js')
  const tproj = join(SCR, 'talk-tsc')
  mkdirSync(join(tproj, 'src', 'lib'), { recursive: true })
  const { writeTalkKitRemotionLib } = await imp('packages/dsh-tool-media/talk-kit.js')
  writeTalkKitRemotionLib(tproj)
  writeFileSync(join(tproj, 'src', 'Use.tsx'), [
    "import React from 'react'",
    "import { PresenterStage, TalkCaption, TalkPackLayer, alignCaptionWords } from './lib/talk-kit'",
    "const theme = { accent: '#FFD54A', accent2: '#2EE6A6', ink: '#111111', panel: 'rgba(12,14,20,0.82)', text: '#FFFFFF', keywordStyle: 'card' as const, radius: 14 }",
    "const pack = { theme, keywords: [{ text: '3个', startSec: 1, endSec: 2.5 }], chapters: [{ index: 1, title: '第一步', startSec: 0.5 }], broll: [{ startSec: 2, endSec: 4, path: 'b.mp4', type: 'video', inSec: 1.5 }], progressBar: true, lowerThird: { name: '王老师', title: '剪辑讲师' } }",
    "const pieces = alignCaptionWords('大家好 今天', [{ text: '大家好', at: 0, end: 0.5 }, { text: '今天', at: 0.6, end: 0.9 }])",
    'export const Use: React.FC = () => (',
    '  <>',
    "    <PresenterStage scene={{ presenter: { path: 'a.mp4', startFrame: 30, cuts: [10], cutParity: 1, fit: 'contain' } }} />",
    "    <TalkCaption sub={{ text: '大家好 今天', words: [{ text: '大家好', at: 0, end: 0.5 }], globalStartFrame: 0 }} bottom={200} />",
    '    <TalkPackLayer pack={pack} totalFrames={300} fontFamily="Noto Sans SC" />',
    '    {pieces ? pieces.length : 0}',
    '  </>',
    ')',
  ].join('\n'))
  writeFileSync(join(tproj, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true }, include: ['src/**/*'] }))
  shared.ensureRemotionJunction(tproj)
  const tc = await suite.runTypecheckOnProject(tproj)
  check('talk-kit.tsx + usage pass a strict typecheck', tc?.ok === true || (tc?.errors || []).length === 0, JSON.stringify((tc?.errors || []).slice(0, 3)))
})

/* ------------------------------------------------------------------------------------------- host voice protection */
await section('host voice is never dubbed over; subtitle fixes keep the speech timing', async () => {
  const proj = join(dirs.ws, 'talk-host-voice')
  mkdirSync(join(proj, 'audio'), { recursive: true })
  const cues = [
    { index: 1, text: '大家好 今天我们来聊一聊', startSec: 0.1, endSec: 1.6, startFrame: 3, endFrame: 48, words: [{ text: '大家好', at: 0, end: 0.5 }] },
    { index: 2, text: '视频减机', startSec: 1.9, endSec: 2.8, startFrame: 57, endFrame: 84, words: [{ text: '视频', at: 0, end: 0.4 }, { text: '减机', at: 0.4, end: 0.9 }] },
    { index: 3, text: '其实不难', startSec: 3.2, endSec: 4.0, startFrame: 96, endFrame: 120, words: [] },
  ]
  const hostScene = { id: 'talk-01', title: '大家好', narration: '大家好，今天我们来聊一聊视频减机，其实不难。', subtitleText: cues.map((c) => c.text).join('，'), subChunks: cues.map((c) => c.text), subtitles: cues, durationSec: 4.2, durationInFrames: 126, audioFile: 'audio/talk-01-host.wav', voiceSource: 'host', voiceLocked: true, voiceLeadSec: 0 }
  const script = { title: 't', productionType: 'talk-edit', fps: 30, width: 1280, height: 720, scenes: [hostScene] }
  writeFileSync(join(proj, 'script.json'), JSON.stringify(script, null, 2))
  writeFileSync(join(proj, 'audio', 'talk-01-host.wav'), Buffer.alloc(64))
  const tts = await imp('packages/dsh-tool-local-tts/index.js')
  let ttsErr = null
  try {
    await tts.executeGenerateSpeech({ text: '新的旁白', outputPath: join(proj, 'audio', 'talk-01.wav'), scriptPath: proj, sceneId: 'talk-01' })
  } catch (err) {
    ttsErr = err
  }
  check('AI re-dub of a host-voice scene is refused before any speech engine runs', ttsErr?.code === 'HOST_VOICE_LOCKED' && !existsSync(join(proj, 'audio', 'talk-01.wav')), ttsErr?.message || 'no error')
  const vm = await imp('packages/dsh-tool-media/voice-master.js')
  let vmErr = null
  try {
    await vm.masterVoiceTracks({ projectDir: proj, useLlm: false })
  } catch (err) {
    vmErr = err
  }
  check('AI voice mastering skips the host voice (already enhanced in the cut)', /本人的原声/.test(vmErr?.message || ''), vmErr?.message || 'no error')
  const locks = await imp('packages/dsh-tool-media/scene-locks.js')
  const typo = JSON.parse(JSON.stringify(script))
  locks.applyUserOverrides({ ...typo, userOverrides: { 'talk-01': { subtitleText: '大家好 今天我们来聊一聊，视频剪辑，其实不难' } } })
  const fixed = typo.scenes[0].subtitles
  check('fixing a misheard word keeps every line on its spoken time', fixed.length === 3 && fixed[1].text === '视频剪辑' && fixed[1].startSec === 1.9 && fixed[1].endSec === 2.8 && fixed[0].startSec === 0.1 && fixed[2].endSec === 4.0 && fixed[1].userEdited === true && !fixed[0].userEdited, JSON.stringify(fixed.map((c) => [c.text, c.startSec, c.endSec])))
  check('the untouched lines keep their per-word highlight timing', Array.isArray(fixed[0].words) && fixed[0].words.length === 1)
  const regroup = JSON.parse(JSON.stringify(script))
  locks.applyUserOverrides({ ...regroup, userOverrides: { 'talk-01': { subtitleText: '大家好，今天我们来聊一聊视频剪辑，其实，不难' } } })
  const rg = regroup.scenes[0].subtitles
  check('a different line count is spread over the original speech span (never stretched over the silent tail)', rg.length === 4 && rg[0].startSec === 0.1 && rg[3].endSec === 4.0 && rg.every((c, i) => i === 0 || c.startSec >= rg[i - 1].endSec - 0.001), JSON.stringify(rg.map((c) => [c.text, c.startSec, c.endSec])))
  locks.followNarrationSubtitles(regroup.scenes[0], regroup)
  const back = regroup.scenes[0].subtitles
  check('clearing the subtitle restores the recognised lines with their timing', back.length === 3 && back[1].text === '视频减机' && back[1].startSec === 1.9 && !regroup.scenes[0].hostSubtitlesOriginal)
  const untouched = JSON.parse(JSON.stringify(script))
  locks.followNarrationSubtitles(untouched.scenes[0], untouched)
  check('"follow the narration" never re-times a host-voice scene', JSON.stringify(untouched.scenes[0].subtitles) === JSON.stringify(cues))
})

/* ------------------------------------------------------------------------------------------- packaging rules */
await section('口播包装: keywords, chapters, B-roll by what is said', async () => {
  const tp = await imp('packages/dsh-tool-media/talk-pack.js')
  // captions with per-character timing on the cut timeline (one char = 0.2 s)
  const lines = ['大家好今天聊视频剪辑', '第一步先把素材整理好', '关键是剪掉停顿', '我用了3个技巧', '第二步给视频配上字幕', '剪辑其实不难', '最后记得导出高清视频']
  let t = 0
  const caps = lines.map((text, k) => {
    const ws = [...text].map((ch, j) => ({ text: ch, startSec: Number((t + j * 0.2).toFixed(3)), endSec: Number((t + j * 0.2 + 0.18).toFixed(3)) }))
    const cap = { index: k + 1, text, startSec: t, endSec: t + text.length * 0.2, words: ws }
    t += text.length * 0.2 + 3.2
    return cap
  })
  const total = t
  const kw = tp.extractKeywords(caps, { totalSec: total })
  const texts = kw.map((k) => k.text)
  check('numbers / ordinals / emphasised words become keyword pops', texts.includes('3个') && texts.includes('第一步') && kw.some((k) => k.kind === 'emphasis'), JSON.stringify(kw.map((k) => [k.text, k.kind, k.startSec])))
  const three = kw.find((k) => k.text === '3个')
  check('a pop appears when the word is said', three && Math.abs(three.startSec - (caps[3].words[3].startSec - 0.08)) < 0.01, JSON.stringify(three))
  check('pops never crowd: ≥ 3.5 s apart and within the budget', kw.every((k, i) => i === 0 || k.startSec - kw[i - 1].startSec >= 3.5 - 1e-6) && kw.length <= Math.floor(total / 5))
  const ch = tp.detectChapters(caps)
  check('chapters from 第一步 / 第二步 / 最后', ch.length === 3 && ch[0].title.startsWith('第一步') && ch[2].title.startsWith('最后'), JSON.stringify(ch))
  check('a talk without section markers gets no chapters', tp.detectChapters(caps.slice(0, 1)).length === 0)
  const lib = [
    { id: 'a1', type: 'video', originalName: '素材整理过程.mp4', path: 'assets/a1.mp4', footage: { shots: [{ i: 0, start: 0, end: 6, dur: 6, quality: 0.8 }] } },
    { id: 'a2', type: 'image', originalName: 'IMG_0001.jpg', path: 'assets/a2.jpg' },
    { id: 'a3', type: 'video', originalName: '字幕软件界面.mp4', path: 'assets/a3.mp4' },
  ]
  const br = tp.planBroll(caps, lib, { totalSec: total })
  check('B-roll cut in where the words match the clip (素材 → 素材整理过程, 字幕 → 字幕软件界面)', br.length === 2 && br[0].assetId === 'a1' && br[1].assetId === 'a3' && br[0].startSec === caps[1].startSec, JSON.stringify(br))
  check('a library video plays its best quiet window', br[0].inSec === 0.25 && br[0].outSec > br[0].inSec)
  check('an unnamed photo is never forced in', !br.some((b) => b.assetId === 'a2'))
  const pack = tp.resolveTalkPack({ preset: 'business', lowerThird: { name: '  王老师 ', title: '剪辑讲师' } })
  check('packaging presets resolve (theme + lower third)', pack.theme.accent === '#4F8BFF' && pack.lowerThird.name === '王老师' && tp.resolveTalkPack({ lowerThird: { name: '' } }).lowerThird === null)
})

/* ------------------------------------------------------------------------------------------- preview seeking */
await section('studio preview + frame capture: video seeking', async () => {
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const html = buildRichHtmlVideo({ fps: 30, width: 1280, height: 720, totalDurationInFrames: 60, productionType: 'talk-edit', subtitleStyle: 'talk', scenes: [{ id: 'talk-01', startFrame: 0, durationInFrames: 60, durationSec: 2, layout: 'presenter', presenter: { path: 'assets/edited/x.roughcut.mp4', startFrame: 0 } }] })
  check('frame capture waits for the seeked picture to be presented (media time checked), not a fixed 70 ms', html.includes('requestVideoFrameCallback(onFrame)') && html.includes("v.addEventListener('seeked', onSeeked)") && !html.includes('setTimeout(finish, 70)'))
  check('live preview plays clips natively and re-syncs only on drift, parking on the exact frame when ticks stop', html.includes('function syncLiveVideos') && html.includes('function parkLiveVideos') && html.includes('drift > 0.3'))
  check('scene is switched on before its clips seek (an undisplayed clip presents no frame)', html.includes('const activeIdx = activateSceneAt(f);'))
  const fr = await imp('packages/dsh-tool-video-suite/frame-renderer.js')
  check('HTML capture browser: bundled headless shell first, background throttling / extensions off', typeof fr.resolveHtmlCaptureBrowser === 'function' && fr.CAPTURE_BROWSER_FLAGS.includes('--disable-extensions') && fr.CAPTURE_BROWSER_FLAGS.includes('--disable-renderer-backgrounding') && fr.CAPTURE_BROWSER_FLAGS.includes('--disable-backgrounding-occluded-windows'))
  const rc = await imp('packages/dsh-tool-media/rough-cut.js')
  check('rough cut is encoded with a keyframe every second (fast seeking); encoder version is part of the render key', rc.ROUGH_CUT_ENCODE_VERSION >= 2 && String(rc.renderRoughCut).includes("'-g', String(Math.max(1, Math.round(fps)))"))
})

/* ------------------------------------------------------------------------------------------- 卡通讲解员 + 录屏讲解 */
await section('卡通讲解员 (cartoon presenter) + 录屏讲解 settings', async () => {
  const tm = await imp('packages/dsh-tool-media/talk-mascot.js')
  const tp = await imp('packages/dsh-tool-media/talk-pack.js')
  const te = await imp('packages/dsh-tool-media/talk-edit.js')
  // a 40×40 picture: white background, a dark ring around a white "eye" (must stay), a blue body below it
  const W = 40
  const H = 40
  const px = Buffer.alloc(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const d = Math.hypot(x - 20, y - 14)
      let c = [255, 255, 255]
      if (d <= 9 && d >= 6) c = [30, 30, 30]
      if (x >= 12 && x <= 28 && y >= 24 && y <= 38) c = [60, 120, 220]
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
  const plan = tm.chooseBackgroundKey(tm.cornerColors(px, W, H))
  check('a plain background is detected as the key colour', plan.mode === 'key' && plan.color.r === 255 && plan.color.g === 255)
  const cut = tm.cutOutBackground(px, W, H, plan.color)
  const alphaAt = (x, y) => px[(y * W + x) * 4 + 3]
  check('the background touching the edge is removed', alphaAt(0, 0) === 0 && alphaAt(39, 39) === 0 && cut.share > 0.4)
  check('a white area inside the character (an eye) is kept', alphaAt(20, 14) === 255)
  check('the character itself is kept', alphaAt(20, 30) === 255 && alphaAt(20, 8) === 255)
  const box = tm.opaqueBounds(px, W, H)
  check('the visible part is found for trimming the empty margin', box && box.x >= 10 && box.x <= 12 && box.y >= 4 && box.y <= 6 && box.w >= 16 && box.h >= 33, JSON.stringify(box))
  const busy = tm.chooseBackgroundKey([{ r: 255, g: 0, b: 0, a: 255 }, { r: 0, g: 255, b: 0, a: 255 }, { r: 0, g: 0, b: 255, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }])
  check('a busy background is not cut (shown as a card)', busy.mode === 'none' && tm.chooseBackgroundKey([{ a: 0 }, { a: 0 }, { a: 0 }, { a: 0 }]).mode === 'alpha')
  // voice envelope: 1 s silence, 1 s loud tone, 1 s quiet tone at 8 kHz
  const sr = 8000
  const pcm = Buffer.alloc(sr * 3 * 2)
  for (let s = 0; s < sr * 3; s++) {
    const amp = s < sr ? 0 : s < 2 * sr ? 0.5 : 0.05
    pcm.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * 220 * s) / sr)), s * 2)
  }
  const env = tm.voiceEnvelopeFromPcm(pcm, sr)
  const avg = (a, b) => env.slice(a, b).reduce((x, y) => x + y, 0) / (b - a)
  check('the voice envelope is 12.5 values per second, silence low and loud speech high', env.length === Math.ceil(3 * 12.5) && avg(2, 11) < 5 && avg(15, 24) > 85 && avg(30, 37) < avg(15, 24), `${avg(2, 11).toFixed(1)} / ${avg(15, 24).toFixed(1)} / ${avg(30, 37).toFixed(1)}`)
  const onsets = tm.wordOnsets([{ startSec: 0.5, words: [{ startSec: 0.5 }, { startSec: 0.55 }, { startSec: 0.9 }] }, { startSec: 2, words: [] }])
  check('word onsets come from the recognised words, at least 0.14 s apart', JSON.stringify(onsets) === JSON.stringify([0.5, 0.9, 2]))
  const m = { type: 'image', envHz: 12.5, env: [...Array(13).fill(0), ...Array(13).fill(90)], words: [1.2, 1.6] }
  const hop = tm.mascotPose(m, 1.26)
  const quiet = tm.mascotPose(m, 0.5)
  check('on a word the character hops and tilts; in a pause it only breathes', hop.ty < -0.02 && Math.abs(hop.rot) > 1 && Math.abs(quiet.ty) < 0.001 && Math.abs(quiet.sy - 1) < 0.02, `${JSON.stringify(hop)} / ${JSON.stringify(quiet)}`)
  const vid = tm.mascotPose({ ...m, type: 'video' }, 1.26)
  check('a video character (already moving) gets half the motion', Math.abs(vid.ty - hop.ty / 2) < 0.002)
  const bl = tm.mascotBox({ aspect: 0.5, keyed: true, corner: 'bl', size: 'm' }, 1280, 720)
  const br = tm.mascotBox({ aspect: 0.5, keyed: true, corner: 'br', size: 'm' }, 1280, 720)
  check('the character stands in the chosen corner, about a third of the height, on the bottom edge', bl.boxH === Math.round(720 * 0.34) && bl.left < 40 && br.left + br.boxW > 1240 && bl.bottom <= 3 && bl.reserveX > bl.boxW)
  check('the same pose and box formulas are in the Remotion talk kit and the HTML draft', (() => {
    const tsx = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'remotion-lib', 'talk-kit.tsx'), 'utf8')
    const html = readFileSync(join(ROOT, 'packages', 'dsh-tool-media', 'html-generator.js'), 'utf8')
    const keyLines = ['const pop = dt < 0.4 ? Math.exp(-dt * 8) * (1 - Math.exp(-dt * 55)) : 0', 'const ty = -gain * (0.016 * talk + 0.045 * pop)', 'const rot = gain * (0.9 * sway * (1 - talk) + dir * 2.6 * pop + 1.1 * talk * Math.sin(2 * Math.PI * t * 1.6))', 'const talk = Math.max(0, Math.min(1, (amp - 0.08) / 0.3))']
    return keyLines.every((l) => tsx.includes(l) && html.includes(l))
  })())
  // settings: cleaned, stored and resolved
  const clean = te.cleanTalkPackSettings({ captions: false, screen: true, mascot: { assetId: 'img-1', corner: 'zz', size: 'xl' }, junk: 1 })
  check('packaging settings accept captions on/off, 录屏讲解 and a valid 卡通讲解员', clean.captions === false && clean.screen === true && clean.mascot.assetId === 'img-1' && clean.mascot.corner === 'bl' && clean.mascot.size === 'm' && clean.junk === undefined)
  const rs = tp.resolveTalkPack({ mascot: { assetId: '' } })
  check('no character without an asset; captions stay on by default', rs.mascot === null && rs.captions === true && rs.screen === false)
  // a real still through FFmpeg: cut out, trimmed, cached
  const proj = join(SCR, 'mascot-proj')
  mkdirSync(join(proj, 'assets', 'images'), { recursive: true })
  const { resolveBinaries } = await imp('packages/shared/index.js')
  const { ffmpeg } = resolveBinaries()
  const src = join(proj, 'assets', 'images', 'kid.png')
  const mk = spawnSync(ffmpeg, ['-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-frames:v', '1', src], { input: (() => { const b = Buffer.alloc(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; const inBody = x >= 12 && x <= 28 && y >= 10 && y <= 38; b[i] = inBody ? 60 : 255; b[i + 1] = inBody ? 120 : 255; b[i + 2] = inBody ? 220 : 255; b[i + 3] = 255 } return b })(), windowsHide: true })
  check('test picture written', mk.status === 0 && existsSync(src))
  const prep = await tm.prepareMascotAsset({ projectDir: proj, asset: { id: 'kid', type: 'image', path: 'assets/images/kid.png' } })
  check('a still is cut out and trimmed into assets/.mascot', prep.keyed === true && prep.type === 'image' && prep.path.startsWith('assets/.mascot/') && existsSync(join(proj, prep.path)) && prep.width <= 20 && prep.height <= 31, JSON.stringify(prep))
  const again = await tm.prepareMascotAsset({ projectDir: proj, asset: { id: 'kid', type: 'image', path: 'assets/images/kid.png' } })
  check('the prepared character is re-used while the picture is unchanged', again.path === prep.path)
  // renderers
  const { buildRichHtmlVideo } = await imp('packages/dsh-tool-media/html-generator.js')
  const pack = { theme: tp.TALK_PACK_PRESETS.knowledge, keywords: [], chapters: [], broll: [], captions: false, mascot: { path: prep.path, type: 'image', keyed: true, aspect: prep.aspect, corner: 'br', size: 'm', envHz: 12.5, env: [0, 50, 90], words: [0.1] } }
  const html = buildRichHtmlVideo({ fps: 30, width: 1280, height: 720, totalDurationInFrames: 60, productionType: 'talk-edit', subtitleStyle: 'talk', talkPack: pack, scenes: [{ id: 'talk-01', startFrame: 0, durationInFrames: 60, durationSec: 2, layout: 'presenter', presenter: { path: 'assets/edited/x.roughcut.mp4', startFrame: 0 } }] })
  check('HTML draft: the character, its motion data, and captions hidden when switched off', html.includes('class="k-tp-mascot"') && html.includes('id="k-tp-mascot-data"') && html.includes('function updateMascot') && html.includes('#sub-wrap { display: none !important; }'))
  const rg = await imp('packages/dsh-tool-media/remotion-generator.js')
  const rproj = join(SCR, 'mascot-remotion')
  mkdirSync(rproj, { recursive: true })
  rg.writeRemotionProjectFiles(rproj, { fps: 30, width: 1280, height: 720, productionType: 'talk-edit', subtitleStyle: 'talk', talkPack: pack, scenes: [{ id: 'talk-01', startFrame: 0, durationInFrames: 60, durationSec: 2, layout: 'presenter', presenter: { path: 'assets/edited/x.roughcut.mp4', startFrame: 0 } }] }, { useCustomSceneRegistry: false })
  const comp = readdirSync(join(rproj, 'src')).filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(join(rproj, 'src', f), 'utf8')).join('\n')
  const kit = readFileSync(join(rproj, 'src', 'lib', 'talk-kit.tsx'), 'utf8')
  check('Remotion: captions can be switched off and keep clear of the character; the kit draws it', comp.includes('sData.talkPack.captions === false') && comp.includes('talkCaptionReserve(sData.talkPack, width, height)') && kit.includes('const MascotPresenter') && kit.includes('<MascotPresenter m={pack.mascot} />'))
})

/* ------------------------------------------------------------------------------------------- optional integration */
await section('integration (engine + Windows voice, optional)', async () => {
  const sr = await imp('packages/dsh-tool-media/speech-recognition.js')
  const home = testAsrHome || ''
  const st = home ? await sr.getAsrStatus({ home, force: true }) : { ready: false }
  if (!st.ready || process.platform !== 'win32') {
    console.log(`SKIP integration: ${!home ? 'set DSH_ASR_TEST_HOME to an installed engine folder to run it' : !st.ready ? `engine not ready (${st.reason})` : 'needs Windows (SAPI voice)'}`)
    return
  }
  process.env.DSH_ASR_HOME = home
  const { resolveBinaries } = await imp('packages/shared/index.js')
  const { ffmpeg, ffprobe } = resolveBinaries()
  const fx = join(SCR, 'fixture')
  mkdirSync(fx, { recursive: true })
  const pieces = [['大家好，今天我们来聊一聊剪辑。', 1.4], ['嗯', 0.5], ['第一步，我们要', 0.8], ['第一步，我们要先把素材整理好。', 0.6], ['谢谢大家。', 2.0]]
  const wavs = []
  for (const [i, [say]] of pieces.entries()) {
    const txt = join(fx, `p${i}.txt`)
    const wav = join(fx, `p${i}.wav`)
    writeFileSync(txt, say, 'utf8')
    const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $z=$s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh*' } | Select-Object -First 1; if ($z) { $s.SelectVoice($z.VoiceInfo.Name) }; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); $s.Speak([System.IO.File]::ReadAllText('${txt.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)); $s.Dispose()`
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true })
    if (r.status !== 0 || !existsSync(wav)) {
      console.log(`SKIP integration: Windows speech synthesis unavailable (${String(r.stderr || '').slice(0, 120)})`)
      return
    }
    wavs.push(wav)
  }
  const graph = [...wavs.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,apad=pad_len=${Math.round(pieces[i][1] * 48000)}[p${i}]`), 'anullsrc=r=48000:cl=mono,atrim=0:1.0[lead]', `[lead]${wavs.map((_, i) => `[p${i}]`).join('')}concat=n=${wavs.length + 1}:v=0:a=1[a]`]
  writeFileSync(join(fx, 'g.txt'), graph.join(';\n'))
  const speech = join(fx, 'speech.wav')
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...wavs.flatMap((w) => ['-i', w]), '-filter_complex_script', join(fx, 'g.txt'), '-map', '[a]', speech])
  const video = join(fx, 'talk.mp4')
  writeFileSync(join(fx, 'v.txt'), 'testsrc2=size=640x360:rate=30:duration=20[v]')
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-filter_complex_script', join(fx, 'v.txt'), '-i', speech, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
  const proj = join(dirs.ws, 'talk-int')
  mkdirSync(proj, { recursive: true })
  const am = await imp('packages/dsh-tool-media/asset-manager.js')
  await am.importAssets({ projectDir: proj, sources: [video] })
  const te = await imp('packages/dsh-tool-media/talk-edit.js')
  const res = await te.buildTalkEditProject({ projectDir: proj, writeRemotion: true })
  const kept = res.texts.keptText
  check('integration: real recognition + rough cut keep only the last take and drop the filler', kept.includes('素材整理好') && !kept.includes('我们要第一步') && (kept.match(/第一步/g) || []).length === 1, kept)
  const probe = (file, args) => spawnSync(ffprobe, ['-v', 'error', ...args, '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).stdout.trim()
  const frames = Number(probe(res.files.video, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames']))
  const samples = Number(probe(res.files.wav, ['-show_entries', 'stream=duration_ts']))
  check('integration: the cut video has exactly the planned frames, the WAV exactly 1600 samples per frame', frames === res.plan.outputFrames && samples === res.plan.outputFrames * 1600, `${frames} frames / ${samples} samples / plan ${res.plan.outputFrames}`)
  const sc = res.script
  const sliceSamples = sc.scenes.map((s) => Number(probe(join(proj, s.audioFile), ['-show_entries', 'stream=duration_ts'])))
  check('integration: per-scene voice slices add up to the whole cut, sample-exact', sliceSamples.reduce((a, b) => a + b, 0) === samples && sc.scenes.every((s) => s.voiceLeadSec === 0 && s.presenter?.path), JSON.stringify(sliceSamples))
  check('integration: project is a 口播剪辑 with real captions on the timeline', sc.productionType === 'talk-edit' && sc.subtitles.length >= 2 && sc.subtitles.every((s) => s.globalEndFrame <= sc.totalDurationInFrames))
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.name).join(' | ')}`)
  process.exit(1)
}
