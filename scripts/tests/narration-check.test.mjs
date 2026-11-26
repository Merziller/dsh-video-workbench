#!/usr/bin/env node
/**
 * 配音回听校验 (listen back to the AI narration) — tests (no network, no LLM, no paid TTS):
 *   - normalisation: Chinese numerals ↔ digits (万 / 亿, decimals, 百分之, digit-by-digit years, ranges, fractions,
 *     spoken short forms), punctuation / spaces, NFKC full-width, Latin case; idioms that only look like numbers
 *   - comparison: numbers both ways, punctuation, a skipped phrase, a repeated phrase, a wrong number, garbled audio,
 *     silence; near-miss names, dropped particles and English terms written differently must pass; display vs TTS text
 *   - the run (stub recogniser): one listening batch for all takes, a failing take re-dubbed once (the better take is
 *     kept, the first take and its script fields restored when the retake is worse), plain-Chinese warnings, report +
 *     content-hash cache (a re-run listens to nothing), skips (locked, own voice, placeholder, unsupported language,
 *     music-only, switched off, engine missing), stop button, billing failure on a re-dub, recogniser errors
 *   - QA: advisory row (never a failure), stale entries ignored, end to end through runPostRenderQa on a tiny MP4
 *   - optional (DSH_ASR_TEST_HOME = an installed engine + Windows SAPI voice): real recognition of correct and
 *     deliberately wrong takes (skipped clause, wrong number, repeated phrase, unrelated sentence), a full run with a
 *     re-dub, the cached re-run; reports seconds per scene
 *
 *   node scripts/tests/narration-check.test.mjs
 *
 * Scratch data only (<repo>/.tmp/narration-check-test/<stamp>); network is blocked; the real `.env` / DSH client are
 * never read.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'narration-check-test', new Date().toISOString().replace(/[:.]/g, '-'))
for (const d of ['home', 'ws', 'no-dsh-client', 'asr-empty']) mkdirSync(join(SCR, d), { recursive: true })
writeFileSync(join(SCR, 'empty.env'), '# intentionally empty\n')
const testAsrHome = String(process.env.DSH_ASR_TEST_HOME || '').trim()
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL', 'DSH_ASR_HOME', 'DSH_NARRATION_CHECK']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: join(SCR, 'empty.env'),
  DSH_VIDEO_HOME: join(SCR, 'home'),
  DSH_VIDEO_WORKSPACE: join(SCR, 'ws'),
  DSH_CLIENT_HOME: join(SCR, 'no-dsh-client'),
  DSH_HOME: join(SCR, 'no-dsh-client'),
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
// tests never download the local speech engine (a missing engine would otherwise start its automatic install)
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0'
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
const NC = await imp('packages/dsh-tool-media/narration-check.js')
const { readScriptJson, writeScriptJson, toTtsText, resolveBinaries } = await imp('packages/shared/index.js')
const norm = NC.normalizeForCompare

/* ------------------------------------------------------------------------------------------- normalisation */
await section('normalisation', async () => {
  check('years: 二零二六年 = 2026年', norm('二零二六年') === '2026年' && norm('2026年') === '2026年', norm('二零二六年'))
  check('一万九千 → 19000', norm('一万九千') === '19000')
  const big = ['一万九千亿元', '19000亿元', '1.9万亿元'].map(norm)
  check('一万九千亿元 = 19000亿元 = 1.9万亿元 (one spelling per value)', big.every((x) => x === '19000亿元'), big.join(' / '))
  check('三点五 → 3.5', norm('三点五倍') === '3.5倍' && norm('3.5倍') === '3.5倍')
  check('百分之三十 → 30% (also 30% and full-width ３０％)', norm('百分之三十') === '30%' && norm('30%') === '30%' && norm('３０％') === '30%')
  check('两 → 2', norm('两个人') === '2个人')
  check('positional numbers with 零: 两千零二十六 → 2026, 一百零五 → 105', norm('两千零二十六') === '2026' && norm('一百零五') === '105')
  check('spoken short forms: 三万五 → 35000, 一千五 → 1500', norm('三万五') === '35000' && norm('一千五') === '1500')
  check('3万 = 三万 = 30000', norm('3万人') === '30000人' && norm('三万人') === '30000人')
  check('punctuation and spaces dropped, Latin lower-cased', norm('你好，世界！ Hello, World.') === '你好世界helloworld', norm('你好，世界！ Hello, World.'))
  check('ranges: 3-5个 = 三到五个', norm('3-5个') === norm('三到五个') && norm('三到五个') === '3到5个')
  check('thousands separators: 1,000元 → 1000元', norm('1,000元') === '1000元')
  check('fractions: 三分之一 = 1/3', norm('三分之一') === norm('1/3'))
  check('decimals: 零点五 = 0.5', norm('零点五') === '0.5' && norm('0.5') === '0.5')
  check('公元前二二一年 = 公元前221年', norm('公元前二二一年') === norm('公元前221年'))
  check('idioms are not numbers: 万一 / 千万不要', !/^\d+$/.test(norm('万一')) && norm('千万不要').endsWith('不要'), `${norm('万一')} / ${norm('千万不要')}`)
  check('English with digits: GPT-4 和 AI · 4K', norm('GPT-4 和 AI') === 'gpt4和ai' && norm('4K 视频') === '4k视频')
  const syms = NC.tokenizeForCompare('达到了19000亿元')
  const n = syms.find((s) => s.kind === 'num')
  check('a number is one symbol that maps back to the original text', n && n.key === '19000亿' && '达到了19000亿元'.slice(n.from, n.to) === '19000亿', JSON.stringify(n))
})

/* ------------------------------------------------------------------------------------------- comparison */
await section('comparison', async () => {
  const A = '2026年，人工智能视频的市场规模达到了19000亿元，同比增长30%。'
  const same = NC.compareNarration([A, toTtsText(A)], '2026年人工智能视频的市场规模达到了19000亿元 同比增长30%')
  check('same words, different punctuation → pass, similarity 1', same.pass && same.similarity === 1 && same.problems.length === 0, JSON.stringify(same.problems))
  const ttsSide = NC.compareNarration(toTtsText(A), '2026年，人工智能视频的市场规模达到了19000亿元，同比增长30%。')
  check('numbers: spelled-out TTS text vs digits heard → pass', ttsSide.pass && ttsSide.numbers.mismatched.length === 0, `${toTtsText(A)} · ${JSON.stringify(ttsSide.numbers)}`)
  const noItn = NC.compareNarration(A, '二零二六年，人工智能视频的市场规模达到了一万九千亿元，同比增长百分之三十。')
  check('numbers: digits in the text vs Chinese numerals heard → pass', noItn.pass, JSON.stringify(noItn.problems))
  const wrong = NC.compareNarration(A, '2016年，人工智能视频的市场规模达到了19000亿元，同比增长30%。')
  const wrongMsg = NC.describeNarrationProblems(wrong.problems, 2)
  check('a wrong number fails', !wrong.pass && wrong.numbers.mismatched.length === 1 && wrong.numbers.mismatched[0].expected === '2026' && wrong.numbers.mismatched[0].heard === '2016')
  check('… and says so in plain Chinese', wrongMsg[0] === '第 2 幕数字读错：应为 2026，听到 2016', wrongMsg.join(' | '))
  const big = NC.compareNarration(A, '2026年，人工智能视频的市场规模达到了1900亿元，同比增长30%。')
  check('a magnitude slip (19000亿 → 1900亿) is a wrong number', !big.pass && big.problems[0]?.type === 'number' && big.problems[0].heard === '1900亿', JSON.stringify(big.problems))
  const skipped = NC.compareNarration([A, toTtsText(A)], '2026年，人工智能视频的市场规模达到了19000亿元。')
  const skipMsg = NC.describeNarrationProblems(skipped.problems, 4)
  check('a skipped phrase fails as 漏读 (the number inside is not reported twice)', !skipped.pass && skipped.problems.length === 1 && skipped.problems[0].type === 'missing', JSON.stringify(skipped.problems))
  check('… message quotes the skipped words', skipMsg[0] === '第 4 幕配音可能漏读：“同比增长30%”', skipMsg[0])
  const B = '今天我们一起学习剪辑，然后再一起学习调色。'
  const rep = NC.compareNarration(B, '今天我们一起学习剪辑，一起学习剪辑，然后再一起学习调色。')
  check('a repeated phrase fails as 重复', !rep.pass && rep.problems[0]?.type === 'repeat' && rep.extra[0]?.repeated, JSON.stringify(rep.problems))
  check('… message', NC.describeNarrationProblems(rep.problems, 3)[0] === '第 3 幕配音可能重复读了：“一起学习剪辑”', NC.describeNarrationProblems(rep.problems, 3)[0])
  const extra = NC.compareNarration('我们来看下一个例子。', '我们来看下一个非常有趣而且重要的例子。')
  check('inserted words fail as 多读', !extra.pass && extra.problems[0]?.type === 'extra', JSON.stringify(extra.problems))
  const names = NC.compareNarration('欧阳修在滁州写下了《醉翁亭记》，诸葛亮六出祁山。', '欧阳休在除州写下了醉翁亭记，诸葛亮六出祁山。')
  check('near-miss names (欧阳修 → 欧阳休, 滁州 → 除州) pass', names.pass, `${names.similarity} ${JSON.stringify(names.problems)}`)
  const short = NC.compareNarration('诸葛亮六出祁山。', '诸葛量六出祁山。')
  check('a one-character slip in a short sentence passes', short.pass, String(short.similarity))
  const particle = NC.compareNarration('我们来看一下这个问题吧。', '我们来看下这个问题。')
  check('dropped particles (一 / 吧) pass', particle.pass, `${particle.similarity} ${JSON.stringify(particle.problems)}`)
  const english = NC.compareNarration('我们用 Remotion 渲染视频。', '我们用瑞摩逊渲染视频。')
  check('an English term written as Chinese syllables passes', english.pass, String(english.similarity))
  const spaced = NC.compareNarration('用 ChatGPT 写脚本，再用 Three.js 做三维动画。', '用chat GPT写脚本，再用threejs做三维动画。')
  check('English terms with different spacing / case pass', spaced.pass && spaced.similarity === 1, String(spaced.similarity))
  const garbled = NC.compareNarration('这是一段完整的旁白，讲述了产品的核心功能和使用方法。', '这是一段完整的旁白，嗯啊哦呃嗯啊哦呃呃呃，使用方法。')
  check('a garbled stretch fails', !garbled.pass && garbled.problems.some((p) => p.type === 'garbled'), JSON.stringify(garbled.problems))
  const silent = NC.compareNarration('你好世界', '')
  check('nothing heard fails as silent', !silent.pass && silent.problems[0]?.type === 'silent' && NC.describeNarrationProblems(silent.problems, 1)[0] === '第 1 幕配音里没有听到说话')
  const unrelated = NC.compareNarration('春天来了，花园里开满了五颜六色的鲜花。', '明天的天气预报说，下午会有一场大雨。')
  check('a different sentence fails as 对不上', !unrelated.pass && unrelated.similarity < 0.6 && unrelated.problems.length === 1 && NC.describeNarrationProblems(unrelated.problems, 1)[0].startsWith('第 1 幕配音和文案对不上（只对上'), `${unrelated.similarity} ${NC.describeNarrationProblems(unrelated.problems, 1)}`)
  // the display text has a link the TTS text leaves out: the TTS rendering is the better match
  const url = '详情请看 https://example.com/docs 里的说明。'
  const viaTts = NC.compareNarration([url, toTtsText(url)], '详情请看里的说明。')
  check('the better of display text and TTS text counts', viaTts.pass && viaTts.comparedWith === 'ttsText', `${viaTts.comparedWith} ${JSON.stringify(viaTts.problems)}`)
  check('better-take ordering: pass > fewer problems > similarity', NC.isBetterNarrationResult(same, wrong) && !NC.isBetterNarrationResult(wrong, same) && NC.isBetterNarrationResult(wrong, skipped) === (wrong.similarity > skipped.similarity))
  check('similarity threshold: 0.9 for sentences, looser for very short ones', NC.similarityThreshold(30) === 0.9 && NC.similarityThreshold(10) === 0.85 && NC.similarityThreshold(2) === 0.6)
  check('English narration: a skipped phrase is caught, number words tolerated', !NC.compareNarration('Today we will learn how to edit a short video in ten minutes.', 'Today we will learn how to a short video.').pass && NC.compareNarration('Today we will learn how to edit a short video in ten minutes.', 'Today we will learn how to edit a short video in 10 minutes.').pass)
})

/* ------------------------------------------------------------------------------------------- switches */
await section('switches + languages', async () => {
  check('on by default', NC.isNarrationCheckEnabled({}) === true)
  check('off for a run: narrationCheck false', NC.isNarrationCheckEnabled({ narrationCheck: false }) === false)
  process.env.DSH_NARRATION_CHECK = '0'
  check('off globally: DSH_NARRATION_CHECK=0', NC.isNarrationCheckEnabled({}) === false)
  delete process.env.DSH_NARRATION_CHECK
  check('languages the local engine knows are listened to', ['今天天气很好。', 'Hello there, this is a test.', '今日はいい天気です。', '오늘 날씨가 좋네요.'].every(NC.isListenableText))
  check('other languages are not (Spanish, Russian, Arabic)', !NC.isListenableText('Hoy vamos a aprender cómo editar un vídeo pequeño.') && !NC.isListenableText('Сегодня хорошая погода.') && !NC.isListenableText('الطقس جميل اليوم'))
})

/* ------------------------------------------------------------------------------------------- the run (stub recogniser) */
function makeWav(path, seed, seconds = 0.2) {
  const n = Math.round(16000 * seconds)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(i * 0.03 * (1 + (seed % 7))) * 1200) + (seed % 97), i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(16000, 24)
  h.writeUInt32LE(32000, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(data.length, 40)
  writeFileSync(path, Buffer.concat([h, data]))
}
const sha1 = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')
const heardByHash = new Map()
const listenCalls = []
const stubListen = async ({ clips }) => {
  listenCalls.push(clips.map((c) => c.id))
  return { items: clips.map((c) => ({ id: c.id, ok: true, text: heardByHash.get(sha1(c.path)) ?? '', language: 'zh', durationSec: 1, decodeMs: 1 })), stats: { loadMs: 7, decodeMs: clips.length, items: clips.length } }
}
const ready = async () => ({ ready: true })

const PROJ = join(SCR, 'ws', 'nc-proj')
const SCENES = [
  { id: 'scene-01', title: '开场', narration: '2026年，人工智能视频的市场规模达到了19000亿元。', heard: '2026年，人工智能视频的市场规模达到了19000亿元。' },
  { id: 'scene-02', title: '用户', narration: '到2026年，全球将有超过三十亿人每天观看短视频。', heard: '到2016年，全球将有超过30亿人每天观看短视频。', retake: '到2026年，全球将有超过30亿人每天观看短视频。' },
  { id: 'scene-03', title: '步骤', narration: '第一步，我们把素材整理好；第二步，再统一调色。', heard: '第一步，我们把素材整理好。', retake: '' },
  { id: 'scene-04', title: '锁定', narration: '这一幕被锁定了，不需要回听。', heard: '完全不同', locked: true },
  { id: 'scene-05', title: '原声', narration: '这是我自己录的声音。', heard: '完全不同', voiceSource: 'host', audioFile: 'audio/scene-05-host.wav' },
  { id: 'scene-06', title: '占位', narration: '占位音频不需要回听。', heard: '完全不同', voicePlaceholder: true },
  { id: 'scene-07', title: '西语', narration: 'Hoy vamos a aprender cómo editar un vídeo pequeño.', heard: 'x' },
]
function setupProject() {
  mkdirSync(join(PROJ, 'audio'), { recursive: true })
  const scenes = SCENES.map((s, k) => {
    const audioFile = s.audioFile || `audio/${s.id}.wav`
    makeWav(join(PROJ, ...audioFile.split('/')), k + 1)
    heardByHash.set(sha1(join(PROJ, ...audioFile.split('/'))), s.heard)
    const sc = { id: s.id, index: k, title: s.title, narration: s.narration, audioFile, durationSec: 4 + k, durationInFrames: (4 + k) * 30, voiceDurationSec: 3 + k, subtitles: [{ text: s.narration, startSec: 0.35, endSec: 3 + k }] }
    for (const f of ['locked', 'voiceSource', 'voicePlaceholder']) if (s[f] !== undefined) sc[f] = s[f]
    return sc
  })
  writeScriptJson(PROJ, { title: '回听测试', fps: 30, width: 1280, height: 720, narrationMode: 'tts', scenes })
}
const resynthCalls = []
const resynth = async (take) => {
  resynthCalls.push(take.sceneId)
  const p = join(PROJ, 'audio', `${take.sceneId}.wav`)
  makeWav(p, 100 + resynthCalls.length, 0.25)
  heardByHash.set(sha1(p), SCENES.find((s) => s.id === take.sceneId).retake)
  // like executeGenerateSpeech: the new take's measured length lands in script.json
  const { data } = readScriptJson(PROJ)
  const sc = data.scenes.find((s) => s.id === take.sceneId)
  sc.durationSec = 9.9
  sc.voiceDurationSec = 9.2
  sc.subtitles = [{ text: 'retake', startSec: 0, endSec: 9 }]
  writeScriptJson(PROJ, data)
}

await section('run: listen, re-dub once, keep the better take, report', async () => {
  setupProject()
  const take1Of3 = sha1(join(PROJ, 'audio', 'scene-03.wav'))
  const s3Before = readScriptJson(PROJ).data.scenes.find((s) => s.id === 'scene-03')
  const logs = []
  const warns = []
  const progress = []
  const res = await NC.runNarrationCheck({
    projectDir: PROJ,
    takes: SCENES.map((s) => ({ sceneId: s.id, ttsArgs: { sceneId: s.id } })),
    resynthesize: resynth,
    listen: stubListen,
    asrStatus: ready,
    onLog: (m) => logs.push(m),
    onWarn: (m) => warns.push(m),
    onProgress: (m) => progress.push(m),
  })
  check('run: three takes listened to, locked / own voice / placeholder / other language skipped', res.ran && res.checked === 3 && res.skippedScenes.map((s) => `${s.sceneId}:${s.reason}`).join(',') === 'scene-04:locked,scene-05:own-voice,scene-06:placeholder,scene-07:language', JSON.stringify(res.skippedScenes))
  check('run: one listening batch for the first takes, one for the retakes', listenCalls.length === 2 && listenCalls[0].join() === 'scene-01,scene-02,scene-03' && listenCalls[1].join() === 'scene-02,scene-03', JSON.stringify(listenCalls))
  check('run: each failing take re-dubbed exactly once', resynthCalls.join() === 'scene-02,scene-03', resynthCalls.join())
  check('run: counts (2 good — 1 after a re-dub —, 1 flagged)', res.passed === 2 && res.flagged === 1 && res.fixed === 1 && res.retried === 2, JSON.stringify({ passed: res.passed, flagged: res.flagged, fixed: res.fixed, retried: res.retried }))
  const script = readScriptJson(PROJ).data
  const s2 = script.scenes.find((s) => s.id === 'scene-02')
  const s3 = script.scenes.find((s) => s.id === 'scene-03')
  check('run: the better retake is kept (WAV + measured length)', s2.durationSec === 9.9 && heardByHash.get(sha1(join(PROJ, 'audio', 'scene-02.wav'))) === SCENES[1].retake)
  check('run: a worse retake is undone — first WAV and its script fields back', sha1(join(PROJ, 'audio', 'scene-03.wav')) === take1Of3 && s3.durationSec === 6 && s3.voiceDurationSec === 5 && JSON.stringify(s3.subtitles) === JSON.stringify(s3Before.subtitles), JSON.stringify({ d: s3.durationSec, v: s3.voiceDurationSec, sub: s3.subtitles }))
  check('run: what still fails is a plain-Chinese warning', warns.length === 1 && warns[0].startsWith('⚠ 第 3 幕配音可能漏读：“第二步，再统一调色”') && warns[0].includes('已自动重新合成一次'), warns.join(' | '))
  check('run: a take fixed by the re-dub is logged', logs.some((l) => l === '🎧 第 2 幕第一次的配音回听没通过（数字读错：应为 2026，听到 2016），已自动重新合成，第二次读对了'), logs.join(' | '))
  check('run: summary line with the time it took', logs.some((l) => /^🎧 配音回听校验：3 幕已回听，1 幕可能有问题（1 幕重新合成后读对）（用时 \d+\.\d 秒/.test(l)), logs.join(' | '))
  check('run: progress shown while listening / re-dubbing', progress.some((p) => p.includes('正在回听检查 3 幕配音')) && progress.some((p) => p.includes('第 3 幕配音回听没通过，正在用同样的设置重新合成一次')))
  const rep = JSON.parse(readFileSync(join(PROJ, 'output', 'narration-check.json'), 'utf8'))
  const e2 = rep.scenes.find((s) => s.sceneId === 'scene-02')
  const e3 = rep.scenes.find((s) => s.sceneId === 'scene-03')
  check('report: output/narration-check.json with summary, timing and skipped scenes', rep.version === 1 && rep.summary.checked === 3 && rep.summary.flagged === 1 && rep.summary.fixedByRetry === 1 && rep.skipped.length === 4 && Number.isFinite(rep.timing.secondsPerScene) && rep.timing.listened === 5, JSON.stringify(rep.summary))
  check('report: per scene heard text, problems and the take kept', e2.pass && e2.retried && e2.keptTake === 2 && e2.firstTake.problems[0].type === 'number' && !e3.pass && e3.keptTake === 1 && e3.problems[0].type === 'missing' && e3.heard === SCENES[2].heard && e3.audioHash === take1Of3)
  check('cache: listening results stored by WAV content', existsSync(join(PROJ, 'audio', '.narration-check', 'listen-cache.json')))
  // a re-run on unchanged WAVs listens to nothing
  const before = listenCalls.length
  const t0 = Date.now()
  const again = await NC.runNarrationCheck({ projectDir: PROJ, takes: SCENES.map((s) => ({ sceneId: s.id })), listen: stubListen, asrStatus: ready, onLog: () => {}, onWarn: () => {} })
  check('cache: a re-run is answered from the cache (no recogniser call)', listenCalls.length === before && again.ran && again.checked === 3 && again.scenes.every((s) => s.cached) && again.flagged === 1, `${Date.now() - t0} ms`)
})

await section('QA: advisory row', async () => {
  const script = readScriptJson(PROJ).data
  const row = NC.buildNarrationQaCheck({ projectDir: PROJ, script })
  check('QA row: never a failure, a hint when a take may be wrong', row && row.passed === true && row.severity === 'warning' && row.value.startsWith('3 幕已回听，1 幕可能读错：第 3 幕配音可能漏读：“第二步，再统一调色”') && row.details.length === 1, JSON.stringify(row))
  // scene 3 re-dubbed outside the check (new WAV): its old entry no longer counts
  makeWav(join(PROJ, 'audio', 'scene-03.wav'), 999)
  const row2 = NC.buildNarrationQaCheck({ projectDir: PROJ, script })
  // (the cached re-run above wrote fresh entries for the current takes, so no re-dub is mentioned any more)
  check('QA row: an entry for a WAV that changed since is ignored', row2 && row2.passed === true && !row2.severity && row2.value === '2 幕已回听，全部读对' && row2.scenes === 2, JSON.stringify(row2))
  check('QA row: nothing listened to → no row', NC.buildNarrationQaCheck({ projectDir: join(SCR, 'ws', 'nothing-here'), script }) === null)
  // end to end: runPostRenderQa on a tiny MP4 carries the row and never fails because of it
  const { ffmpeg } = resolveBinaries()
  setupProject()
  await NC.runNarrationCheck({ projectDir: PROJ, takes: SCENES.map((s) => ({ sceneId: s.id })), listen: stubListen, asrStatus: ready })
  mkdirSync(join(PROJ, 'output'), { recursive: true })
  const mp4 = join(PROJ, 'output', 'final.mp4')
  const mk = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', mp4], { windowsHide: true })
  check('QA e2e: test MP4 written', mk.status === 0 && existsSync(mp4))
  const { runPostRenderQa } = await imp('packages/dsh-tool-video-suite/qa-checker.js')
  const qa = await runPostRenderQa({ projectDir: PROJ, mp4Path: mp4, script: { ...readScriptJson(PROJ).data, width: 320, height: 240, totalDurationSec: 2 }, temporal: false, heldPicture: false })
  const qaRow = (qa.checks || []).find((c) => c.name === '配音回听校验（AI 配音有没有读错）')
  check('QA e2e: qa_report.json has the advisory line, not counted as a failure', qaRow && qaRow.passed === true && qaRow.severity === 'warning' && !(qa.failures || []).some((f) => f.startsWith('配音回听校验')) && (qa.warnings || []).some((w) => w.startsWith('配音回听校验')), JSON.stringify(qaRow))
  const saved = JSON.parse(readFileSync(join(PROJ, 'output', 'qa_report.json'), 'utf8'))
  check('QA e2e: written to output/qa_report.json', (saved.checks || []).some((c) => c.name === qaRow?.name))
})

await section('skips, switches, stop button, failures', async () => {
  setupProject()
  const takes = SCENES.map((s) => ({ sceneId: s.id }))
  const n0 = listenCalls.length
  const quiet = []
  const mv = await NC.runNarrationCheck({ projectDir: PROJ, takes, narrationMode: 'subtitle-mv', listen: stubListen, asrStatus: ready, onLog: (m) => quiet.push(m), onWarn: (m) => quiet.push(m) })
  check('skip: music-only films (subtitle-mv)', !mv.ran && mv.skipped === 'music-only')
  const off = await NC.runNarrationCheck({ projectDir: PROJ, takes, enabled: false, listen: stubListen, asrStatus: ready })
  check('skip: switched off for the run', !off.ran && off.skipped === 'disabled')
  process.env.DSH_NARRATION_CHECK = '0'
  const envOff = await NC.runNarrationCheck({ projectDir: PROJ, takes, listen: stubListen, asrStatus: ready })
  delete process.env.DSH_NARRATION_CHECK
  check('skip: switched off by DSH_NARRATION_CHECK=0', !envOff.ran && envOff.skipped === 'disabled')
  const noEngine = await NC.runNarrationCheck({ projectDir: PROJ, takes, listen: stubListen, asrStatus: async () => ({ ready: false }), onLog: (m) => quiet.push(m), onWarn: (m) => quiet.push(m) })
  check('skip: speech engine not installed (quietly)', !noEngine.ran && noEngine.skipped === 'asr-not-installed')
  process.env.DSH_ASR_HOME = join(SCR, 'asr-empty')
  const realMissing = await NC.runNarrationCheck({ projectDir: PROJ, takes, onLog: (m) => quiet.push(m), onWarn: (m) => quiet.push(m) })
  delete process.env.DSH_ASR_HOME
  check('skip: the real engine check finds nothing installed (quietly)', !realMissing.ran && realMissing.skipped === 'asr-not-installed')
  check('skips: no recogniser call, nothing logged', listenCalls.length === n0 && quiet.length === 0, quiet.join(' | '))
  const none = await NC.runNarrationCheck({ projectDir: PROJ, takes: [], listen: stubListen, asrStatus: ready })
  check('nothing newly dubbed → nothing to do', !none.ran && none.skipped === 'nothing-new')
  const onlySkipped = await NC.runNarrationCheck({ projectDir: PROJ, takes: [{ sceneId: 'scene-04' }, { sceneId: 'scene-05' }], listen: stubListen, asrStatus: ready })
  check('only locked / own-voice takes → nothing to listen to', !onlySkipped.ran && onlySkipped.skipped === 'nothing-to-check')

  const ac = new AbortController()
  ac.abort()
  let name = ''
  try {
    await NC.runNarrationCheck({ projectDir: PROJ, takes, listen: stubListen, asrStatus: ready, signal: ac.signal })
  } catch (e) {
    name = e.name
  }
  check('stop button: before listening', name === 'AbortError')
  // the takes below were heard before: forget that, so the (stub) recogniser really runs
  const clearCache = () => rmSync(join(PROJ, 'audio', '.narration-check'), { recursive: true, force: true })
  clearCache()
  const ac2 = new AbortController()
  name = ''
  try {
    await NC.runNarrationCheck({
      projectDir: PROJ,
      takes,
      asrStatus: ready,
      signal: ac2.signal,
      listen: async () => {
        ac2.abort()
        throw Object.assign(new Error('stopped'), { name: 'AbortError' })
      },
    })
  } catch (e) {
    name = e.name
  }
  check('stop button: while listening', name === 'AbortError')
  setupProject()
  const take1 = sha1(join(PROJ, 'audio', 'scene-02.wav'))
  const ac3 = new AbortController()
  name = ''
  try {
    await NC.runNarrationCheck({
      projectDir: PROJ,
      takes,
      listen: stubListen,
      asrStatus: ready,
      signal: ac3.signal,
      resynthesize: async () => {
        makeWav(join(PROJ, 'audio', 'scene-02.wav'), 4242) // a half-written take
        ac3.abort()
        throw Object.assign(new Error('stopped'), { name: 'AbortError' })
      },
    })
  } catch (e) {
    name = e.name
  }
  check('stop button: during a re-dub — stops, the first take is put back', name === 'AbortError' && sha1(join(PROJ, 'audio', 'scene-02.wav')) === take1)

  const logs = []
  clearCache()
  const broken = await NC.runNarrationCheck({ projectDir: PROJ, takes, asrStatus: ready, listen: async () => { throw new Error('识别进程退出码 3') }, onLog: (m) => logs.push(m) })
  check('a recogniser failure never stops the production', !broken.ran && broken.skipped === 'error' && logs.some((l) => l.startsWith('ℹ 配音回听校验没有完成（不影响出片）')), logs.join(' | '))

  setupProject()
  const warns = []
  const billCalls = []
  const billing = await NC.runNarrationCheck({
    projectDir: PROJ,
    takes,
    listen: stubListen,
    asrStatus: ready,
    onWarn: (m) => warns.push(m),
    onLog: () => {},
    resynthesize: async (take) => {
      billCalls.push(take.sceneId)
      throw new Error('TTS synthesis failed: 余额不足，请充值')
    },
  })
  check('billing failure on a re-dub: no further paid re-dubs, first takes kept, the run goes on', billing.ran && billCalls.length === 1 && billing.flagged === 2 && warns.some((w) => w.includes('重新合成没成功：配音服务提示余额或额度不足')), `${billCalls.join()} | ${warns.join(' | ')}`)

  // a take the recogniser could not read
  setupProject()
  clearCache()
  const unreadable = await NC.runNarrationCheck({
    projectDir: PROJ,
    takes: [{ sceneId: 'scene-01' }],
    asrStatus: ready,
    listen: async ({ clips }) => ({ items: clips.map((c) => ({ id: c.id, ok: false, error: '读取音频失败' })), stats: { items: clips.length } }),
    onLog: () => {},
  })
  check('an unreadable take is reported, not flagged', unreadable.ran && unreadable.checked === 0 && unreadable.flagged === 0 && unreadable.scenes[0].problems[0].type === 'error')
})

/* ------------------------------------------------------------------------------------------- optional integration */
await section('integration: Windows voice → local recognition → check (optional)', async () => {
  const sr = await imp('packages/dsh-tool-media/speech-recognition.js')
  const st = testAsrHome ? await sr.getAsrStatus({ home: testAsrHome, force: true }) : { ready: false }
  if (!st.ready || process.platform !== 'win32') {
    console.log(`SKIP integration: ${!testAsrHome ? 'set DSH_ASR_TEST_HOME to an installed engine folder to run it' : !st.ready ? `engine not ready (${st.reason})` : 'needs Windows (SAPI voice)'}`)
    return
  }
  process.env.DSH_ASR_HOME = testAsrHome
  const fx = join(SCR, 'fixture')
  mkdirSync(fx, { recursive: true })
  // display text (what the scene should say) + what the voice actually says (as the TTS text, like the plugin's SAPI engine)
  const items = [
    { id: 'ok-1', text: '2026年，人工智能视频的市场规模达到了19000亿元，同比增长30%。' },
    { id: 'ok-2', text: '欧阳修在滁州写下了《醉翁亭记》，诸葛亮六出祁山。' },
    { id: 'ok-3', text: '这款模型的推理速度提升了3.5倍，只需要一块显卡就能运行。' },
    { id: 'ok-4', text: '用 AI 和 GPT 做一条 4K 的短视频，大约需要 10 分钟。' },
    { id: 'skip', text: '第一步，我们把素材整理好；第二步，再统一调色；第三步，导出成片发布。', say: '第一步，我们把素材整理好；第三步，导出成片发布。', want: 'missing' },
    { id: 'number', text: '到2026年，全球将有超过三十亿人每天观看短视频。', say: '到2016年，全球将有超过三十亿人每天观看短视频。', want: 'number' },
    { id: 'repeat', text: '今天我们来学习如何剪辑一条短视频。', say: '今天我们来学习如何剪辑，如何剪辑一条短视频。', want: 'repeat' },
    { id: 'other', text: '春天来了，花园里开满了五颜六色的鲜花。', say: '明天的天气预报说，下午会有一场大雨。', want: 'any' },
    { id: 'number-fixed', text: '到2026年，全球将有超过三十亿人每天观看短视频。' },
    { id: 'skip-again', text: '第一步，我们把素材整理好；第二步，再统一调色；第三步，导出成片发布。', say: '第一步，我们把素材整理好；第二步，再统一调色。' },
  ]
  const list = []
  for (const it of items) {
    const txt = join(fx, `${it.id}.txt`)
    it.wav = join(fx, `${it.id}.wav`)
    writeFileSync(txt, toTtsText(it.say || it.text), 'utf8')
    list.push(`${txt}|${it.wav}`)
  }
  writeFileSync(join(fx, 'list.txt'), list.join('\n'), 'utf8')
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $z=$s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh*' } | Select-Object -First 1; if ($z) { $s.SelectVoice($z.VoiceInfo.Name) }; foreach ($line in [System.IO.File]::ReadAllLines('${join(fx, 'list.txt').replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)) { $p = $line.Split('|'); $s.SetOutputToWaveFile($p[1]); $s.Speak([System.IO.File]::ReadAllText($p[0], [System.Text.Encoding]::UTF8)) }; $s.SetOutputToNull(); $s.Dispose()`
  const tSynth = Date.now()
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0 || !items.every((it) => existsSync(it.wav))) {
    console.log(`SKIP integration: Windows speech synthesis unavailable (${String(r.stderr || '').slice(0, 160)})`)
    return
  }
  console.log(`  (SAPI: ${items.length} takes in ${((Date.now() - tSynth) / 1000).toFixed(1)} s)`)

  // 1. one batch: every clip with one model load; a file that is not audio is reported, not fatal
  writeFileSync(join(fx, 'broken.wav'), 'not audio at all')
  const graded = items.slice(0, 8)
  const t0 = Date.now()
  const batch = await sr.transcribeClips({ clips: [...graded.map((it) => ({ id: it.id, path: it.wav })), { id: 'broken', path: join(fx, 'broken.wav') }] })
  const wall = (Date.now() - t0) / 1000
  const byId = new Map(batch.items.map((x) => [x.id, x]))
  check('batch: one model load for all clips', batch.stats.items === graded.length && Number.isFinite(batch.stats.loadMs) && graded.every((it) => byId.get(it.id)?.ok), JSON.stringify(batch.stats))
  check('batch: a broken file is reported, the others are still recognised', byId.get('broken')?.ok === false && /读取音频失败/.test(byId.get('broken').error))
  console.log(`  (batch: ${graded.length} clips in ${wall.toFixed(2)} s = ${(wall / graded.length).toFixed(2)} s per scene; model load ${batch.stats.loadMs} ms, decoding ${batch.stats.decodeMs} ms, FFmpeg ${batch.stats.convertMs} ms)`)
  for (const it of graded) {
    const heard = byId.get(it.id)?.text || ''
    const res = NC.compareNarration([it.text, toTtsText(it.text)], heard)
    const types = res.problems.map((p) => p.type)
    if (!it.want) check(`real: correct take passes (${it.id})`, res.pass, `heard “${heard}” · ${res.similarity}`)
    else check(`real: wrong take flagged (${it.id} → ${it.want})`, !res.pass && (it.want === 'any' || types.includes(it.want)), `heard “${heard}” · ${types.join(',')} · ${NC.describeNarrationProblems(res.problems, 1).join(' | ')}`)
  }

  // 2. a full run: a wrong number fixed by the re-dub, a skipped clause that stays wrong
  const proj = join(SCR, 'ws', 'nc-real')
  mkdirSync(join(proj, 'audio'), { recursive: true })
  const pick = (id) => items.find((it) => it.id === id)
  const sceneDefs = [
    { id: 'scene-01', item: pick('ok-1') },
    { id: 'scene-02', item: pick('number'), retake: pick('number-fixed') },
    { id: 'scene-03', item: pick('skip'), retake: pick('skip-again') },
  ]
  for (const s of sceneDefs) copyFileSync(s.item.wav, join(proj, 'audio', `${s.id}.wav`))
  writeScriptJson(proj, { title: '真实回听', fps: 30, width: 1280, height: 720, scenes: sceneDefs.map((s, k) => ({ id: s.id, index: k, title: s.id, narration: s.item.text, ttsText: toTtsText(s.item.text), audioFile: `audio/${s.id}.wav`, durationSec: 6, durationInFrames: 180 })) })
  const warns = []
  const logs = []
  const t1 = Date.now()
  const run = await NC.runNarrationCheck({
    projectDir: proj,
    takes: sceneDefs.map((s) => ({ sceneId: s.id })),
    resynthesize: async (take) => copyFileSync(sceneDefs.find((s) => s.id === take.sceneId).retake.wav, join(proj, 'audio', `${take.sceneId}.wav`)),
    onLog: (m) => logs.push(m),
    onWarn: (m) => warns.push(m),
  })
  const runSec = (Date.now() - t1) / 1000
  check('real run: the wrong number is fixed by the re-dub, the skipped clause is flagged', run.ran && run.checked === 3 && run.fixed === 1 && run.flagged === 1 && warns.length === 1 && warns[0].startsWith('⚠ 第 3 幕配音可能漏读'), `${warns.join(' | ')} / ${logs.join(' | ')}`)
  console.log(`  (full run: 3 scenes + 2 re-dubs in ${runSec.toFixed(2)} s = ${(runSec / 3).toFixed(2)} s per scene, two model loads)`)
  for (const l of [...logs, ...warns]) console.log(`    ${l}`)
  const t2 = Date.now()
  const again = await NC.runNarrationCheck({ projectDir: proj, takes: sceneDefs.map((s) => ({ sceneId: s.id })), onLog: () => {}, onWarn: () => {} })
  const againSec = (Date.now() - t2) / 1000
  check('real run: a re-run on unchanged WAVs comes from the cache', again.ran && again.scenes.every((s) => s.cached) && againSec < 1.5, `${againSec.toFixed(2)} s`)
  console.log(`  (re-run from the cache: ${againSec.toFixed(2)} s)`)
  delete process.env.DSH_ASR_HOME
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  - ${f.name}`).join('\n'))
  process.exit(1)
}
