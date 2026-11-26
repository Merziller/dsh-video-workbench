#!/usr/bin/env node
/**
 * 长视频拆条 (long recording → short clips) — planning tests (no network, no model; the model is a stub):
 *   - sentence rows from the word-timed transcript (punctuation, pauses, long-sentence split, fillers left out, questions)
 *   - profiles per platform / length / exact count; model windows (overlap, size limits, progress)
 *   - the model's reply checked like AutoClip does (ids in the window, plausible spans, Chinese titles, score scales),
 *     one retry with the error, duplicates across windows, boundary rules (trailing question, dangling start),
 *     overlaps / length bounds, selection (threshold, top-up, cap, exact count)
 *   - the cut of one clip: only the clip is kept, fillers inside it are cut, captions start at 0
 *
 *   node scripts/tests/clip-factory.test.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCR = join(ROOT, '.tmp', 'clip-factory-test', new Date().toISOString().replace(/[:.]/g, '-'))
for (const d of ['home', 'ws', 'no-dsh-client']) mkdirSync(join(SCR, d), { recursive: true })
writeFileSync(join(SCR, 'empty.env'), '# intentionally empty\n')
for (const v of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'LLM_API_KEY', 'LLM_MODE', 'LLM_BASE_URL', 'LLM_MODEL']) delete process.env[v]
Object.assign(process.env, {
  DSH_VIDEO_ENV_PATH: join(SCR, 'empty.env'),
  DSH_VIDEO_HOME: join(SCR, 'home'),
  DSH_VIDEO_WORKSPACE: join(SCR, 'ws'),
  DSH_CLIENT_HOME: join(SCR, 'no-dsh-client'),
  DSH_HOME: join(SCR, 'no-dsh-client'),
  DSH_VIDEO_SKIP_PROFILE_MOUNT: '1',
})
// tests never download the local speech engine (clips/state and 找精彩片段 would otherwise start its automatic install)
if (process.env.DSH_ASR_AUTO_INSTALL === undefined) process.env.DSH_ASR_AUTO_INSTALL = '0'
// only the offline mock model on 127.0.0.1 is reachable
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) throw new Error(`network blocked in tests: ${url}`)
  return realFetch(input, init)
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
const CF = await imp('packages/dsh-tool-media/clip-factory.js')
const RC = await imp('packages/dsh-tool-media/rough-cut.js')

/**
 * A recording from sentences: { say } (one recogniser segment, CJK at charSec per character) | { pause }. The energy
 * envelope marks every character loud for 90 % of its slot (fast: frames are written directly).
 */
function synth(items, { charSec = 0.2 } = {}) {
  const segments = []
  const marks = []
  let t = 0
  for (const it of items) {
    if (it.pause) {
      t += it.pause
      continue
    }
    const tokens = []
    const start = t
    for (const ch of it.say) {
      if (/[，。！？、,.!?]/.test(ch)) {
        tokens.push({ t: ch, s: +t.toFixed(3) })
        continue
      }
      tokens.push({ t: ch, s: +t.toFixed(3) })
      marks.push([t, t + charSec * 0.9])
      t += charSec
    }
    segments.push({ start: +start.toFixed(3), end: +t.toFixed(3), lang: 'zh', emotion: 'NEUTRAL', event: 'Speech', text: it.say, tokens })
  }
  const total = t + 0.5
  const n = Math.ceil(total / 0.01)
  const buf = Buffer.alloc(n, 0)
  for (let f = 0; f < n; f++) buf.writeInt8(-80, f)
  for (const [a, b] of marks) for (let f = Math.floor(a / 0.01); f < Math.min(n, Math.ceil(b / 0.01)); f++) buf.writeInt8(-18, f)
  return { version: 2, durationSec: +total.toFixed(3), language: 'zh', segments, energy: { hopSec: 0.01, db: buf.toString('base64') } }
}

const SENTS = [
  '今天我们聊一聊怎么把长视频剪成短视频。',
  '很多人录了一个小时的直播，最后一条都没发出去。',
  '问题出在哪里呢？',
  '其实是因为不知道从哪里开始剪。',
  '所以我总结了三个方法。',
  '第一个方法是先找观点最鲜明的那一段。',
  '第二个方法是看观众的弹幕和评论。',
  '第三个方法是把每段控制在一分钟以内。',
  '你们觉得哪个方法最有用？',
  '好，我们来看下一个问题。',
]

await section('rows', async () => {
  const tr = synth([{ say: '嗯，' + SENTS[0] }, { pause: 0.4 }, { say: SENTS[1] }, { pause: 1.5 }, { say: '这句没有标点但后面停了很久' }, { pause: 1.4 }, { say: SENTS[2] }, { pause: 0.3 }, { say: SENTS[3] }])
  const plan = RC.planRoughCut(tr, { fps: 30 })
  const rows = CF.buildClipRows(plan.words)
  check('rows: one per sentence (punctuation + long pause)', rows.length === 5, rows.map((r) => r.text).join(' | '))
  check('rows: filler 嗯 left out of the text', rows[0].text.startsWith('今天'), rows[0].text)
  check('rows: ids are sequential', rows.every((r, k) => r.id === k))
  check('rows: times increase and stay inside the recording', rows.every((r, k) => r.end > r.start && (k === 0 || r.start >= rows[k - 1].end - 1e-6) && r.end <= tr.durationSec))
  check('rows: question marked', rows[3].question === true && rows[0].question === false, rows[3].text)
  check('rows: unpunctuated sentence ends at the long pause', rows[2].text === '这句没有标点但后面停了很久', rows[2].text)
  const words = plan.words
  check('rows: word ranges point at the first / last spoken word', rows.every((r) => !words[r.firstWord].punct && !words[r.lastWord].punct && words[r.firstWord].onset <= r.start + 1e-6 && words[r.lastWord].end >= r.end - 1e-6))
  // long sentence: split at a comma once it is past maxChars
  const long = synth([{ say: '这是一个很长很长的句子，里面有很多很多的内容需要讲清楚，' + '我们一点一点地往下说，'.repeat(6) + '最后才结束。' }])
  const lr = CF.buildClipRows(RC.planRoughCut(long, { fps: 30 }).words, { maxChars: 30 })
  check('rows: a long sentence is split at commas', lr.length >= 3 && lr.every((r) => Array.from(r.text).length <= 45), lr.map((r) => Array.from(r.text).length).join(','))
})

await section('profiles + windows', async () => {
  const short = CF.clipProfile({ totalSec: 6 * 60 })
  check('profile: < 8 min → 2–4 clips, 15–180 s, target 30–90', short.countLo === 2 && short.countHi === 4 && short.minSec === 15 && short.maxSec === 180 && short.targetLo === 30 && short.targetHi === 90, JSON.stringify(short))
  const mid = CF.clipProfile({ totalSec: 20 * 60 })
  check('profile: 8–30 min → 3–8 clips', mid.countLo === 3 && mid.countHi === 8)
  const two = CF.clipProfile({ totalSec: 2 * 3600 })
  check('profile: 2 h → 10–24 clips, cap 24', two.countLo === 10 && two.countHi === 24 && two.maxClips === 24, JSON.stringify(two))
  const tiny = CF.clipProfile({ totalSec: 70 })
  check('profile: very short recording allows 10 s clips', tiny.minSec === 10)
  const exact = CF.clipProfile({ totalSec: 3600, count: 5 })
  check('profile: an exact count', exact.exactCount === 5 && exact.countLo === 5 && exact.countHi === 5 && exact.maxClips === 5)
  const bili = CF.clipProfile({ totalSec: 3600, platform: 'bilibili' })
  check('profile: B站 16:9, 30–300 s', bili.aspect === '16:9' && bili.minSec === 30 && bili.maxSec === 300)
  check('profile: 小红书 3:4', CF.clipProfile({ platform: 'xiaohongshu' }).aspect === '3:4')
  check('profile: unknown platform → 抖音', CF.clipProfile({ platform: 'nope' }).platform === 'douyin')

  const rows = Array.from({ length: 1080 }, (_, i) => ({ id: i, start: i * 10, end: i * 10 + 9, text: '一'.repeat(40) }))
  const win = CF.windowRows(rows, { seconds: 3600, overlap: 240, chars: 70000 })
  const covered = new Set()
  for (const [a, b] of win) for (let i = a; i <= b; i++) covered.add(i)
  check('windows: 3 h in ~60 min windows, every row covered', win.length >= 3 && win.length <= 4 && covered.size === rows.length, JSON.stringify(win))
  check('windows: each ≤ 60 min', win.every(([a, b]) => rows[b].end - rows[a].start <= 3600))
  check('windows: neighbours overlap ≥ 4 min', win.slice(1).every(([a], k) => rows[win[k][1]].end - rows[a].start >= 240))
  const small = CF.windowRows(rows, { seconds: 1200, overlap: 80, chars: 12000 })
  check('windows: character limit respected', small.every(([a, b]) => rows.slice(a, b + 1).reduce((n, r) => n + r.text.length, 0) <= 12000))
  const tight = CF.windowRows(rows.slice(0, 50), { seconds: 3600, overlap: 240, chars: 100 })
  check('windows: always progress (tiny limits)', tight.length >= 25 && tight.length <= 50 && tight[tight.length - 1][1] === 49)
  check('windows: empty input', CF.windowRows([], {}).length === 0)
  check('local model detection', CF.isLocalModelConfig({ provider: 'ollama' }) && CF.isLocalModelConfig({ baseUrl: 'http://127.0.0.1:1234/v1' }) && CF.isLocalModelConfig({ baseUrl: 'http://192.168.1.5:11434' }) && !CF.isLocalModelConfig({ baseUrl: 'https://api.deepseek.com' }) && !CF.isLocalModelConfig({ mode: 'host-agent' }))
})

// rows for the reply / refine tests: 120 sentences of 8 s each, 0.5 s apart
const ROWS = Array.from({ length: 120 }, (_, i) => ({
  id: i,
  start: i * 8.5,
  end: i * 8.5 + 8,
  text: i === 40 ? '那大家觉得这个怎么样呢？' : i === 60 ? '所以这就是我想说的。' : `第${i}句，讲一个具体的观点。`,
  firstWord: i * 10,
  lastWord: i * 10 + 8,
  question: i === 40,
}))
const PROFILE = CF.clipProfile({ totalSec: 1020 })

await section('reply checks', async () => {
  const ctx = { first: 0, last: 119, rows: ROWS, profile: PROFILE }
  const ok = CF.parseFinderReply('{"clips":[{"start":2,"end":8,"title":"长视频怎么剪","reason":"方法具体","score":0.82,"tags":["剪辑","短视频"]}]}', ctx)
  check('reply: valid JSON', ok.length === 1 && ok[0].startRow === 2 && ok[0].endRow === 8 && ok[0].score === 0.82 && ok[0].tags.length === 2)
  const fenced = CF.parseFinderReply('好的：\n```json\n{"clips":[{"start":10,"end":16,"title":"「标题」","score":85,"tags":"剪辑，干货、#方法"}]}\n```', ctx)
  check('reply: fenced JSON, percent score, tag string, quotes stripped', fenced.length === 1 && fenced[0].score === 0.85 && fenced[0].tags.join('/') === '剪辑/干货/方法' && fenced[0].title === '标题', JSON.stringify(fenced))
  const mixed = CF.parseFinderReply({ clips: [{ start: 5, end: 3, title: '倒了' }, { start: 118, end: 125, title: '越界' }, { start: 20, end: 20, title: '太短了' }, { start: 30, end: 36, title: '' }, { start: 50, end: 57, title: '合格的', score: 8 }, { start: 1.5, end: 9, title: '小数' }] }, { ...ctx, profile: CF.clipProfile({ totalSec: 1020, platform: 'bilibili' }) })
  check('reply: reversed / out-of-window / too short / untitled / fractional ids dropped', mixed.length === 1 && mixed[0].startRow === 50 && mixed[0].score === 0.8, JSON.stringify(mixed))
  let err = ''
  try {
    CF.parseFinderReply('{"clips":[{"start":2,"end":8,"title":"How to cut long videos"},{"start":20,"end":28,"title":"Second one"}]}', ctx)
  } catch (e) {
    err = e.message
  }
  check('reply: English titles rejected (retry)', /中文/.test(err), err)
  err = ''
  try {
    CF.parseFinderReply('我觉得第二段不错', ctx)
  } catch (e) {
    err = e.message
  }
  check('reply: no JSON rejected', /clips/.test(err), err)
  err = ''
  try {
    CF.parseFinderReply('{"clips":[{"start":500,"end":600,"title":"越界"}]}', ctx)
  } catch (e) {
    err = e.message
  }
  check('reply: nothing usable rejected', /没有一个片段合格/.test(err), err)
  check('reply: an empty list is a valid answer', CF.parseFinderReply('{"clips":[]}', ctx).length === 0)
  check('reply: a bare array is accepted', CF.parseFinderReply([{ start: 2, end: 8, title: '数组' }], ctx).length === 1)
})

await section('dedupe + boundaries + refine + select', async () => {
  const d = CF.dedupeClips(
    [
      { startRow: 10, endRow: 20, title: 'A', score: 0.7 },
      { startRow: 12, endRow: 21, title: 'B', score: 0.9 },
      { startRow: 30, endRow: 36, title: 'C', score: 0.6 },
    ],
    ROWS,
  )
  check('dedupe: same moment from two windows keeps the better pick', d.length === 2 && d[0].title === 'B' && d[1].title === 'C', d.map((c) => c.title).join(','))

  const log = []
  const q = CF.polishClipBounds({ startRow: 30, endRow: 40, title: 'Q', score: 0.8 }, ROWS, PROFILE, { log })
  check('boundary: a trailing question (next topic) is dropped', q.endRow === 39 && log.some((l) => l.op === 'drop-trailing-question'))
  const q2 = CF.polishClipBounds({ startRow: 30, endRow: 43, title: 'Q2', score: 0.8 }, ROWS, PROFILE)
  check('boundary: a question that was answered stays', q2.endRow === 43)
  const lead = CF.polishClipBounds({ startRow: 60, endRow: 66, title: 'L', score: 0.8 }, ROWS, PROFILE)
  check('boundary: a start on 所以 takes in the sentence before', lead.startRow === 59, String(lead.startRow))

  const { clips, report } = CF.refineClips(
    [
      { startRow: 0, endRow: 6, title: '重叠一', score: 0.6 },
      { startRow: 2, endRow: 8, title: '重叠二', score: 0.9 },
      { startRow: 20, endRow: 20, title: '太短要延长', score: 0.8 },
      { startRow: 70, endRow: 110, title: '太长要裁', score: 0.75 },
    ],
    ROWS,
    PROFILE,
  )
  const span = (c) => ROWS[c.endRow].end - ROWS[c.startRow].start
  check('refine: overlapping picks merged, best title kept', clips[0].title === '重叠二' && clips[0].startRow === 0 && clips[0].endRow === 8, JSON.stringify(clips[0]))
  check('refine: short clip extended along close sentences to the minimum', clips[1].title === '太短要延长' && span(clips[1]) >= PROFILE.minSec, String(span(clips[1])))
  check('refine: long clip trimmed to the maximum at a sentence end', clips[2].title === '太长要裁' && span(clips[2]) <= PROFILE.maxSec && /。$/.test(ROWS[clips[2].endRow].text))
  check('refine: report lists the operations', report.ops.some((o) => o.op === 'merge-overlap') && report.ops.some((o) => o.op === 'extend') && report.ops.some((o) => o.op === 'trim'))
  // a short clip with a big silence after it cannot grow → dropped with a reason
  const gappy = ROWS.map((r, i) => (i >= 89 ? { ...r, start: r.start + 30 * (i - 88), end: r.end + 30 * (i - 88) } : r))
  const g = CF.refineClips([{ startRow: 89, endRow: 89, title: '孤立', score: 0.9 }], gappy, PROFILE)
  check('refine: an isolated short clip is dropped', g.clips.length === 0 && g.report.dropped.length === 1 && /太短/.test(g.report.dropped[0].reason))

  const pool = [0.95, 0.9, 0.72, 0.6, 0.5, 0.4].map((s, k) => ({ startRow: k * 15, endRow: k * 15 + 5, title: `T${k}`, score: s }))
  const sel = CF.selectClips(pool, { ...PROFILE, minKeep: 2, maxClips: 10, exactCount: 0 })
  check('select: everything at or above 0.7', sel.length === 3 && sel.every((c) => c.score >= 0.7))
  const low = CF.selectClips(pool.map((c) => ({ ...c, score: c.score / 2 })), { ...PROFILE, minKeep: 2, maxClips: 10, exactCount: 0 })
  check('select: topped up to the minimum by score', low.length === 2 && low.every((c) => c.selectedBy === 'top-up') && low[0].title === 'T0')
  const cap = CF.selectClips(pool, { ...PROFILE, minKeep: 2, maxClips: 2, exactCount: 0 })
  check('select: capped, in time order', cap.length === 2 && cap[0].startRow < cap[1].startRow && cap.map((c) => c.title).join() === 'T0,T1')
  const ex = CF.selectClips(pool, { ...PROFILE, exactCount: 4 })
  check('select: exact count takes the best N', ex.length === 4 && ex.every((c) => c.selectedBy === 'count') && !ex.some((c) => c.title === 'T4'))
})

await section('findClips (stub model)', async () => {
  // a 50-minute talk; local windows (20 min / 80 s overlap) → 3 windows
  const rows = Array.from({ length: 300 }, (_, i) => ({ id: i, start: i * 10, end: i * 10 + 9.5, text: `第${i}句话，讲一个观点。`, firstWord: i * 9, lastWord: i * 9 + 7, question: false }))
  const profile = CF.clipProfile({ totalSec: 3000 })
  const calls = []
  const callModel = async ({ system, user, purpose }) => {
    calls.push({ system, user, purpose })
    const ids = [...user.matchAll(/^(\d+)\|/gm)].map((m) => Number(m[1]))
    const first = ids[0]
    // first window: an unusable answer first (English titles), then a good one
    if (calls.length === 1) return JSON.stringify({ clips: [{ start: first + 1, end: first + 6, title: 'English title' }, { start: first + 10, end: first + 16, title: 'Another' }] })
    return JSON.stringify({ clips: [{ start: first + 1, end: first + 6, title: `片段${first}`, reason: '观点鲜明', score: 0.8, tags: ['观点'] }, { start: ids[ids.length - 6], end: ids[ids.length - 1], title: `尾段${first}`, score: 0.75 }] })
  }
  const progress = []
  const res = await CF.findClips({ rows, profile, local: true, callModel, onProgress: (p) => progress.push(p) })
  check('find: one call per window plus one retry', res.windows === 3 && calls.length === 4, `windows ${res.windows}, calls ${calls.length}`)
  check('find: the retry carries the error back to the model', /上一次的回答不合格：标题必须用中文写/.test(calls[1].user))
  check('find: rows sent as id|m:ss|text', /^\d+\|\d+:\d\d\|第\d+句话/m.test(calls[0].user) && calls.every((c) => c.purpose === '长视频拆条：挑精彩片段'))
  check('find: system prompt states lengths, count and JSON shape', /15–180 秒/.test(calls[0].system) && /最好 30–90 秒/.test(calls[0].system) && /"clips"/.test(calls[0].system))
  check('find: clips in time order without overlap', res.clips.every((c, k) => k === 0 || c.sourceStart >= res.clips[k - 1].sourceEnd) && res.clips.length >= 3, res.clips.map((c) => `${c.title}@${c.sourceStart}-${c.sourceEnd}`).join(' '))
  check('find: duplicates from overlapping windows removed', new Set(res.clips.map((c) => c.startRow)).size === res.clips.length)
  check('find: clips carry word ranges and text for the cut', res.clips.every((c) => c.firstWord === rows[c.startRow].firstWord && c.lastWord === rows[c.endRow].lastWord && c.text.startsWith(rows[c.startRow].text)))
  check('find: progress reported per window', progress.some((p) => p.window === 3 && p.windows === 3))
  // a user focus reaches the model
  const seen = []
  await CF.findClips({ rows: rows.slice(0, 60), profile: CF.clipProfile({ totalSec: 600, count: 2 }), focus: '只要讲方法的部分', callModel: async ({ user }) => (seen.push(user), '{"clips":[{"start":3,"end":8,"title":"讲方法","score":0.9}]}') })
  check('find: the user focus and exact count reach the model', /用户的额外要求.*只要讲方法的部分/.test(seen[0]))
  // a model that never answers properly → a clear error
  let err = ''
  try {
    await CF.findClips({ rows: rows.slice(0, 60), profile: CF.clipProfile({ totalSec: 600 }), callModel: async () => '不好意思' })
  } catch (e) {
    err = e.message
  }
  check('find: no usable answer → plain-Chinese error', /没有按要求返回片段/.test(err), err)
  err = ''
  const ac = new AbortController()
  ac.abort()
  try {
    await CF.findClips({ rows, profile, signal: ac.signal, callModel: async () => '{"clips":[]}' })
  } catch (e) {
    err = e.name
  }
  check('find: stop button respected', err === 'AbortError')
  const est = CF.estimateFinderWork(rows, profile, { local: true })
  check('work estimate: calls = windows', est.calls === 3 && est.inputTokens > 1000)
})

await section('the cut of one clip', async () => {
  const items = []
  SENTS.forEach((s, k) => {
    items.push({ say: k === 6 ? `嗯，${s}` : s })
    items.push({ pause: k === 4 ? 2.5 : 0.5 })
  })
  const tr = synth(items)
  const base = RC.planRoughCut(tr, { fps: 30 })
  const rows = CF.buildClipRows(base.words)
  const clip = { startRow: 4, endRow: 7, firstWord: rows[4].firstWord, lastWord: rows[7].lastWord }
  const { plan, captions, durationSec } = CF.planClipCut(tr, clip, { fps: 30, sourceDurationSec: tr.durationSec, maxLineWidth: 11 })
  const first = plan.keep[0].start
  const last = plan.keep[plan.keep.length - 1].end
  check('clip cut: only the clip is kept (with a little room at the edges)', first >= rows[4].start - 0.6 && first <= rows[4].start && last >= rows[7].end && last <= rows[7].end + 1.0, `${first}–${last} vs ${rows[4].start}–${rows[7].end}`)
  check('clip cut: everything outside reported as 选段以外', plan.removals.some((r) => r.kind === 'outside' && r.applied))
  check('clip cut: the filler inside the clip is cut too', plan.removals.some((r) => r.kind === 'filler' && r.applied && r.start > rows[5].end), plan.removals.map((r) => r.kind).join(','))
  check('clip cut: the long pause inside is shortened', durationSec < rows[7].end - rows[4].start, `${durationSec} vs ${rows[7].end - rows[4].start}`)
  check('clip cut: captions start at 0 and stay inside the clip', captions.length >= 4 && captions[0].startSec < 0.6 && captions[captions.length - 1].endSec <= durationSec + 0.05, `${captions.length} lines, ${captions[0]?.startSec}…${captions[captions.length - 1]?.endSec} / ${durationSec}`)
  check('clip cut: captions are the clip text only', captions.map((c) => c.text).join('').startsWith('所以') && !captions.some((c) => /今天/.test(c.text)))
  const nudged = CF.nudgeClipRows({ ...clip, title: 'x' }, rows, { startDelta: -1, endDelta: 1 })
  check('nudge: one sentence earlier / later', nudged.startRow === 3 && nudged.endRow === 8 && nudged.firstWord === rows[3].firstWord && nudged.sourceEnd === rows[8].end)
  const clamped = CF.nudgeClipRows({ ...clip }, rows, { startDelta: -99, endDelta: 99 })
  check('nudge: stays inside the recording', clamped.startRow === 0 && clamped.endRow === rows.length - 1)
})

const CR = await imp('packages/dsh-tool-media/clip-render.js')
const SC = await imp('packages/dsh-tool-media/short-clips.js')

await section('render helpers', async () => {
  check('canvas: 9:16 / 3:4 / 16:9 presets', CR.canvasFor('9:16').W === 1080 && CR.canvasFor('9:16').H === 1920 && CR.canvasFor('3:4').H === 1440 && CR.canvasFor('16:9').W === 1920)
  const src = CR.canvasFor('source', { width: 3840, height: 2160 })
  check('canvas: source shape, long side ≤ 1920, even', src.W === 1920 && src.H === 1080)
  const odd = CR.canvasFor('source', { width: 1001, height: 601 })
  check('canvas: odd source sizes become even', odd.W % 2 === 0 && odd.H % 2 === 0)
  const portrait = CR.canvasFor('9:16')
  check('layout: same shape → fill', CR.chooseLayout('auto', { canvas: portrait, source: { w: 1080, h: 1920 } }) === 'fill')
  check('layout: landscape on portrait, auto → fit', CR.chooseLayout('auto', { canvas: portrait, source: { w: 1920, h: 1080 } }) === 'fit')
  check('layout: window only on a portrait canvas', CR.chooseLayout('window', { canvas: portrait, source: { w: 1920, h: 1080 } }) === 'window' && CR.chooseLayout('window', { canvas: CR.canvasFor('16:9'), source: { w: 1080, h: 1920 } }) === 'fit')
  check('layout: no picture → audio', CR.chooseLayout('auto', { canvas: portrait, source: { w: 0, h: 0 }, hasVideo: false }) === 'audio')
  const fit = CR.layoutGeometry('fit', portrait, { w: 1920, h: 1080 })
  check('geometry fit: picture full width, centred a little high, title band above, captions below', fit.fg.w === 1080 && fit.fg.h === 608 && fit.fg.y < (1920 - 608) / 2 && fit.title.band && fit.title.band[1] <= fit.fg.y && fit.caption.align === 8 && fit.caption.marginV > fit.fg.y + fit.fg.h && fit.bar.y === fit.fg.y + fit.fg.h, JSON.stringify(fit.fg))
  const win = CR.layoutGeometry('window', portrait, { w: 1920, h: 1080 })
  check('geometry window: 4:3 crop of the middle, 1080×810 window', win.crop.w === 1440 && win.crop.h === 1080 && win.crop.x === 240 && win.fg.h === 810 && win.titleSec === 0)
  const tall = CR.layoutGeometry('window', portrait, { w: 1080, h: 1920 })
  check('geometry window: a tall source is cut in its upper-middle part', tall.crop.w === 1080 && tall.crop.h === 810 && tall.crop.y > 0 && tall.crop.y < (1920 - 810) / 2)
  const land = CR.layoutGeometry('fit', CR.canvasFor('16:9'), { w: 1080, h: 1920 })
  check('geometry: landscape canvas → title over the picture for the first seconds only', land.titleSec === 5 && land.caption.align === 2)

  const fonts = { families: { sans: 'S', black: 'B', serif: 'T' } }
  const ass = CR.buildClipAss({ geom: fit, fonts, durationSec: 42.5, title: '长视频怎么剪成爆款短视频', captions: [{ text: '先找观点最鲜明的那一段', startSec: 0.1, endSec: 2.2 }, { text: '再看{弹幕}\\N和评论', startSec: 2.3, endSec: 4 }], keywords: [{ text: '观点最鲜明', line: 0 }] })
  check('ASS: canvas size and three styles', /PlayResX: 1080/.test(ass) && /PlayResY: 1920/.test(ass) && /Style: Title,T,/.test(ass) && /Style: Cap,S,/.test(ass) && /Style: Bar,S,/.test(ass))
  check('ASS: title in two lines, second in the accent colour', /Title,,0,0,0,,[^\n]*\\N\{\\c&H00D4FF&\}/.test(ass), ass.split('\n').find((l) => l.includes(',Title,')))
  check('ASS: keyword in the heavy weight + accent colour', ass.includes('先找{\\fnB\\c&H00D4FF&}观点最鲜明{\\r}的那一段'))
  check('ASS: braces / backslashes from speech cannot inject overrides', ass.includes('再看｛弹幕｝＼N和评论'))
  check('ASS: progress line grows over the whole clip', /\\t\(0,42500,\\clip\(0,\d+,1080,\d+\)\)/.test(ass))
  check('ASS: times in centiseconds', ass.includes('Dialogue: 1,0:00:00.10,0:00:02.20,Cap'))
  const noTitle = CR.buildClipAss({ geom: fit, fonts, durationSec: 10, title: 'x', captions: [], showTitle: false, showBar: false })
  check('ASS: title / bar can be switched off', !/,Title,,/.test(noTitle) && !/,Bar,,/.test(noTitle))
  const landAss = CR.buildClipAss({ geom: land, fonts, durationSec: 30, title: '横屏标题' })
  check('ASS: overlay title fades out after 5 s on a landscape canvas', /Dialogue: 2,0:00:00.00,0:00:05.00,Title,,0,0,0,,\{\\fad\(250,450\)\}/.test(landAss))
  check('ASS colour: #RRGGBB → &HAABBGGRR / inline &HBBGGRR&', CR.assInlineColor('#FF8800') === '&H0088FF&' && CR.assColor('#FF8800') === '&H000088FF' && CR.assColor('#112233', 128) === '&H80332211' && CR.assColor('nonsense') === '&H0000D4FF')
  check('filter path: drive colon and quotes escaped', CR.filterPath("E:\\a b\\it's.ass") === "'E\\:/a b/it\\'s.ass'")

  const sp = CR.seekPlan([{ start: 100, end: 110 }, { start: 112, end: 120.5 }], 30)
  check('seek plan: starts 1.5 s before, ranges relative, exact frame count', sp.seekSec === 98.5 && sp.frames[0].sf === 45 && sp.frames[1].ef === 660 && sp.frameCount === 555 && sp.durationSec === 18.5, JSON.stringify(sp))
  const sp0 = CR.seekPlan([{ start: 0.5, end: 3 }], 25)
  check('seek plan: never before 0', sp0.seekSec === 0 && sp0.frames[0].sf === 13)
  check('source time on the cut timeline', Math.abs(CR.sourceTimeAt([{ start: 100, end: 110 }, { start: 112, end: 120 }], 30, 12) - 114) < 1e-6)
  const graph = CR.buildClipFilter({ frames: sp.frames, fps: 30, geom: fit, assPath: 'E:/x/clip.ass', fontsDir: 'E:/x/fonts', gain: { pre: 3.1, post: 6.4 } })
  check('graph: frame-exact trims on a constant fps grid for picture and sound', graph.includes('[0:v]fps=30,split=2') && graph.includes('trim=start=1.500000:end=11.500000') && graph.includes('atrim=start=13.500000:end=22.000000'))
  check('graph: blurred backdrop + picture + captions + voice chain (level, compressor, measured gain, limiter without auto level)', graph.includes('gblur=sigma=5') && graph.includes('overlay=x=0:y=') && graph.includes("subtitles=filename='E\\:/x/clip.ass':fontsdir='E\\:/x/fonts'") && graph.includes('highpass=f=60,volume=3.1dB,acompressor=threshold=0.05:ratio=3') && graph.includes('volume=6.4dB,alimiter=limit=0.794') && graph.includes('level=0'))
  const g2 = CR.buildClipFilter({ frames: [{ sf: 0, ef: 90 }], fps: 30, geom: CR.layoutGeometry('audio', portrait), hasVideo: false })
  check('graph: audio-only source on a dark canvas', g2.includes('color=c=0x0D0F12:s=1080x1920') && !g2.includes('[0:v]') && g2.includes('loudnorm=I=-14:TP=-1:LRA=11,'))
  check('voice gains: to −20 before the compressor, to −14 after it, clamped, no boost of silence', CR.voicePreGain(-31.5) === 11.5 && CR.voicePreGain(-90) === 0 && CR.voicePreGain(-5) === -15 && CR.voicePreGain(-70) === 0 && CR.voicePostGain(-22.25) === 8.25 && CR.voicePostGain(-80) === 0 && CR.voicePostGain(-60.1) === 0 && CR.voicePreGain(-50) === 24)
  check('voice trim: to −14 from the whole chain, peaks kept ≤ −1.5 dBTP', CR.voiceTrimGain(-15.3, -4.6) === 1.3 && CR.voiceTrimGain(-15.3, -2.0) === 0.5 && CR.voiceTrimGain(-12.5, -1.2) === -1.5 && CR.voiceTrimGain(-99, -50) === 0 && CR.voiceTrimGain(-25, -20) === 6)
  check('voice chain: full measurement + trim in the render chain', CR.voiceChain({ pre: 1, post: 2 }, { measure: 'full' }).endsWith('level=0,loudnorm=I=-14:TP=-1:LRA=11:print_format=json') && CR.voiceChain({ pre: 1, post: 2, trim: 1.3 }).endsWith('level=0,volume=1.3dB') && CR.voiceChain({ pre: 1, post: 2, trim: 0 }).endsWith('level=0'))
  check('voice chain: measuring passes print, no measurement → dynamic loudnorm', CR.voiceChain(null, { measure: 'raw' }) === 'highpass=f=60,loudnorm=I=-14:TP=-1:LRA=11:print_format=json' && CR.voiceChain({ pre: 2 }, { measure: 'compressed' }).includes('volume=2dB,acompressor=') && CR.voiceChain({ pre: 2 }, { measure: 'compressed' }).endsWith('print_format=json') && CR.voiceChain(null) === 'highpass=f=60,loudnorm=I=-14:TP=-1:LRA=11')
  check('loudnorm JSON parsed from stderr', CR.parseLoudnormJson('blah\n[Parsed_loudnorm_0 @ 0x1] \n{\n "input_i" : "-21.75",\n "input_tp" : "-18.06",\n "target_offset" : "-0.05"\n}\n')?.input_i === '-21.75' && CR.parseLoudnormJson('no json') === null)

  // burned-in captions: synthetic samples (white text with dark edge that changes vs a static logo)
  const W = 960
  const H = 192
  const sample = (text, seed) => {
    const b = Buffer.alloc(W * H, 120)
    if (!text) return b
    for (let ch = 0; ch < 14; ch++) {
      const x0 = 200 + ch * 40 + ((seed * 7 + ch * 13) % 9)
      const shapeOn = (dx, dy) => {
        let x = (dx * 73856093) ^ (dy * 19349663) ^ ((seed + 1) * 83492791) ^ (ch * 2654435761)
        x = Math.imul(x ^ (x >>> 13), 1274126177)
        return ((x ^ (x >>> 16)) >>> 0) % 100 < 28
      }
      for (let dy = 0; dy < 30; dy++) {
        for (let dx = 0; dx < 28; dx++) {
          const x = x0 + dx
          const y = 120 + dy
          b[y * W + x] = shapeOn(dx, dy) ? 235 : 20
        }
      }
    }
    return b
  }
  const subs = CR.analyzeSubtitleSamples(Array.from({ length: 8 }, (_, k) => sample(true, k)))
  check('burned captions: changing text in the bottom band is detected', subs.burned && subs.textSamples === 8 && subs.band[0] > 0.65, JSON.stringify(subs))
  const logo = CR.analyzeSubtitleSamples(Array.from({ length: 8 }, () => sample(true, 3)))
  check('burned captions: a static logo is not captions', !logo.burned && logo.overlap > 0.9, JSON.stringify(logo))
  const none = CR.analyzeSubtitleSamples(Array.from({ length: 8 }, () => sample(false, 0)))
  check('burned captions: a plain picture has none', !none.burned && none.textSamples === 0)
  const few = CR.analyzeSubtitleSamples([sample(true, 1), sample(true, 2), sample(false, 0), sample(false, 0), sample(false, 0), sample(false, 0)])
  check('burned captions: text in only a few samples is not captions', !few.burned)
  const sharp = Buffer.alloc(32 * 32)
  for (let i = 0; i < sharp.length; i++) sharp[i] = (i + Math.floor(i / 32)) % 2 ? 255 : 0
  check('sharpness: a checkerboard is sharper than a flat frame', CR.frameSharpness(sharp, 32, 32) > 1000 && CR.frameSharpness(Buffer.alloc(32 * 32, 128), 32, 32) === 0)

  check('file names: Windows-safe, numbered, ≤ 28 chars', SC.safeClipFileName('标题:里有/非法*字符?', 3) === '03-标题 里有 非法 字符' && SC.safeClipFileName('', 12) === '12-片段' && Array.from(SC.safeClipFileName('一'.repeat(60), 1)).length === 31 && SC.safeClipFileName('...hidden', 1) === '01-hidden')
  check('settings: only known values pass', JSON.stringify(SC.cleanRenderSettings({ layout: 'window', captions: 'off', title: false, accent: '#abcdef', evil: 1, layoutX: 'x' })) === '{"layout":"window","captions":"off","title":false,"accent":"#ABCDEF"}' && JSON.stringify(SC.cleanRenderSettings({ layout: 'zoom', accent: 'red' })) === '{}')
  check('cut options clamp', JSON.stringify(SC.cleanCutOptions({ cutPauses: false, maxPauseSec: 99, keepPauseSec: -1, foo: true })) === '{"cutPauses":false,"maxPauseSec":3,"keepPauseSec":0.05}')
  const notes = SC.buildPublishNotes({ platform: 'xiaohongshu', source: { name: '访谈.mp4' } }, [{ index: 1, title: '标题一', reason: '理由', tags: ['话题', '干货'], durationSec: 65, file: '01-标题一.mp4', cover: '01-标题一.jpg', sourceStart: 125, sourceEnd: 190 }])
  check('publish notes: platform, file, original position, tags', notes.includes('平台：小红书（3:4）') && notes.includes('01-标题一.mp4（1 分 05 秒，封面 01-标题一.jpg）') && notes.includes('2:05 – 3:10') && notes.includes('#话题 #干货') && notes.includes('发布前请看一遍'))
})

/* ------------------------------------------------------------------------------------------- optional integration */
await section('integration: Windows voice → recognition → clips → MP4 (optional)', async () => {
  const sr = await imp('packages/dsh-tool-media/speech-recognition.js')
  const home = String(process.env.DSH_ASR_TEST_HOME || '').trim()
  const st = home ? await sr.getAsrStatus({ home, force: true }) : { ready: false }
  if (!st.ready || process.platform !== 'win32') {
    console.log(`SKIP integration: ${!home ? 'set DSH_ASR_TEST_HOME to an installed engine folder to run it' : !st.ready ? `engine not ready (${st.reason})` : 'needs Windows (SAPI voice)'}`)
    return
  }
  process.env.DSH_ASR_HOME = home
  const { spawnSync } = await import('node:child_process')
  const { existsSync, readdirSync, readFileSync, statSync } = await import('node:fs')
  const { resolveBinaries } = await imp('packages/shared/index.js')
  const { ffmpeg, ffprobe } = resolveBinaries()
  const fx = join(SCR, 'fixture')
  mkdirSync(fx, { recursive: true })
  // an "interview": three topics, a host question between them, fillers, ~2.5 minutes
  const script = [
    '大家好，欢迎收听今天的节目，我们今天请到了一位做短视频的朋友。',
    '先问第一个问题，长视频为什么一定要拆成短视频？',
    '嗯，其实原因很简单。现在大家刷手机的时间很碎，一个小时的直播，很少有人能从头看到尾。',
    '但是直播里总有那么几分钟特别精彩，观点鲜明，信息量也大。',
    '把这几分钟单独剪出来，发到抖音和视频号上，就能被更多的人看到。',
    '我自己的经验是，一场直播至少能拆出五到八条短视频，每条控制在一分钟左右。',
    '那第二个问题，怎么判断哪一段值得剪出来？',
    '第一，看这一段能不能独立成立，没看过前面的人也能听懂。',
    '第二，看开头的第一句话能不能抓住人，最好一上来就是结论或者一个问题。',
    '第三，看结尾是不是完整的，一个观点讲完了再结束，不要停在半句话上。',
    '这三条做到了，基本上就不会差。',
    '最后一个问题，新手最容易犯什么错？',
    '最常见的错误是舍不得删，什么都想留下，结果一条视频拖到三四分钟，没人看得完。',
    '还有就是字幕，一定要加字幕，很多人是静音刷视频的，没有字幕他根本不知道你在说什么。',
    '好的，非常感谢今天的分享，我们下期再见。',
  ]
  const wavs = []
  for (const [i, say] of script.entries()) {
    const txt = join(fx, `p${i}.txt`)
    const wav = join(fx, `p${i}.wav`)
    writeFileSync(txt, say, 'utf8')
    const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $z=$s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'zh*' } | Select-Object -First 1; if ($z) { $s.SelectVoice($z.VoiceInfo.Name) }; $s.Rate=1; $s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}'); $s.Speak([System.IO.File]::ReadAllText('${txt.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)); $s.Dispose()`
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true })
    if (r.status !== 0 || !existsSync(wav)) {
      console.log(`SKIP integration: Windows speech synthesis unavailable (${String(r.stderr || '').slice(0, 120)})`)
      return
    }
    wavs.push(wav)
  }
  const graph = [...wavs.map((_, i) => `[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,apad=pad_len=${Math.round((i % 3 === 1 ? 1.2 : 0.7) * 48000)}[p${i}]`), 'anullsrc=r=48000:cl=mono,atrim=0:1.0[lead]', `[lead]${wavs.map((_, i) => `[p${i}]`).join('')}concat=n=${wavs.length + 1}:v=0:a=1[a]`]
  writeFileSync(join(fx, 'g.txt'), graph.join(';\n'))
  const speech = join(fx, 'speech.wav')
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...wavs.flatMap((w) => ['-i', w]), '-filter_complex_script', join(fx, 'g.txt'), '-map', '[a]', speech])
  const dur = Number(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', speech], { encoding: 'utf8' }).stdout.trim())
  const video = join(fx, 'interview.mp4')
  writeFileSync(join(fx, 'v.txt'), `testsrc2=size=1280x720:rate=30:duration=${Math.ceil(dur) + 1}[v]`)
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-filter_complex_script', join(fx, 'v.txt'), '-i', speech, '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
  const proj = join(SCR, 'ws', 'clips-int')
  mkdirSync(proj, { recursive: true })
  writeFileSync(join(proj, 'script.json'), JSON.stringify({ title: '拆条测试', fps: 30, width: 1080, height: 1920, scenes: [] }))
  const am = await imp('packages/dsh-tool-media/asset-manager.js')
  await am.importAssets({ projectDir: proj, sources: [video] })
  // the "model": picks the second and third topic by looking for their first sentences in the rows
  const calls = []
  const callModel = async ({ system, user }) => {
    calls.push({ system, user })
    const rows = [...user.matchAll(/^(\d+)\|[\d:]+\|(.*)$/gm)].map((m) => ({ id: Number(m[1]), text: m[2] }))
    const find = (re) => rows.find((r) => re.test(r.text))?.id
    const a1 = find(/判断哪一段/) ?? find(/第一，看/)
    const a2 = find(/基本上就不会差/)
    const b1 = find(/新手最容易/) ?? find(/最常见的错误/)
    const b2 = find(/静音|字幕/)
    const clips = []
    if (a1 !== undefined && a2 !== undefined) clips.push({ start: a1, end: a2, title: '怎么判断哪一段值得剪', reason: '三条标准清楚实用', score: 0.88, tags: ['剪辑', '短视频'] })
    if (b1 !== undefined && b2 !== undefined) clips.push({ start: b1, end: Math.max(b1, b2), title: '新手剪辑最容易犯的错', reason: '直击痛点', score: 0.81, tags: ['新手', '字幕'] })
    return JSON.stringify({ clips })
  }
  const found = await SC.findShortClips({ projectDir: proj, platform: 'douyin', callModel })
  const plan = found.plan
  check('integration: recognition + sentence rows + the model call', calls.length === 1 && plan.found.rows >= 12 && /\d+\|\d+:\d\d\|/.test(calls[0].user), `${plan.found.rows} rows`)
  check('integration: two clips found, in order, with titles', plan.clips.length === 2 && plan.clips[0].title === '怎么判断哪一段值得剪' && plan.clips[0].sourceEnd <= plan.clips[1].sourceStart, plan.clips.map((c) => `${c.title} ${c.sourceStart}-${c.sourceEnd}`).join(' | '))
  check('integration: the second clip does not end on the host closing line', !/感谢|再见/.test(plan.clips[1].text), plan.clips[1].text.slice(-30))
  const edited = await SC.updateShortClips({ projectDir: proj, edits: [{ index: 2, title: '新手最常见的两个错误', startDelta: 0, endDelta: 0 }] })
  check('integration: title edit saved', edited.plan.clips[1].title === '新手最常见的两个错误' && edited.plan.clips[1].edited)
  const t0 = Date.now()
  const out = await SC.renderShortClips({ projectDir: proj })
  const took = (Date.now() - t0) / 1000
  check('integration: both clips rendered', out.clips.length === 2 && out.clips.every((c) => !c.error && existsSync(join(proj, c.video))), JSON.stringify(out.clips.map((c) => c.video || c.error)))
  const probeJson = (file) => JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate,sample_rate,channels:format=duration', '-of', 'json', file], { encoding: 'utf8' }).stdout || '{}')
  const p1 = probeJson(join(proj, out.clips[0].video))
  const v1 = (p1.streams || []).find((s) => s.codec_type === 'video')
  const a1 = (p1.streams || []).find((s) => s.codec_type === 'audio')
  check('integration: 1080×1920, 30 fps, 48 kHz stereo', v1?.width === 1080 && v1?.height === 1920 && v1?.avg_frame_rate === '30/1' && a1?.sample_rate === '48000' && a1?.channels === 2, JSON.stringify(p1.streams))
  check('integration: length matches the plan within a frame', Math.abs(Number(p1.format?.duration) - out.clips[0].durationSec) < 0.06, `${p1.format?.duration} vs ${out.clips[0].durationSec}`)
  check('integration: layout fit (landscape source on portrait), captions on', out.layout === 'fit' && out.captions === true && out.burned === false)
  // loudness of the result
  const ln = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', join(proj, out.clips[0].video), '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = CR.parseLoudnormJson(ln.stderr)
  check('integration: −14 LUFS ±1, true peak ≤ −1 dBTP (measured on the finished file)', m && Math.abs(Number(m.input_i) + 14) <= 1 && Number(m.input_tp) <= -1, m ? `${m.input_i} LUFS / ${m.input_tp} dBTP` : 'no measurement')
  const ld = out.clips[0].loudness || {}
  check('integration: the render reports what it measured', ld.mode === 'measured' && Math.abs(ld.outputI - Number(m?.input_i)) < 0.2 && Number.isFinite(ld.sourceI) && Number.isFinite(ld.preDb) && Number.isFinite(ld.postDb), JSON.stringify(ld))
  check('integration: cover, SRT, clips.json and 发布文案.md written', out.clips.every((c) => c.cover && existsSync(join(proj, c.cover)) && existsSync(join(proj, c.srt))) && existsSync(join(proj, out.folder, 'clips.json')) && readFileSync(join(proj, out.folder, '发布文案.md'), 'utf8').includes('新手最常见的两个错误'))
  check('integration: file named after the edited title', /02-新手最常见的两个错误\.mp4$/.test(out.clips[1].video))
  const srt = readFileSync(join(proj, out.clips[0].srt), 'utf8')
  check('integration: captions are the clip text, starting at 0', /^1\r?\n00:00:00,\d{3} -->/.test(srt) && /第一/.test(srt) && !/欢迎收听/.test(srt), srt.slice(0, 120))
  check('integration: no half-written files left in the clips folder', !readdirSync(join(proj, out.folder)).some((f) => /\.part\.|\.tmp$/.test(f)), readdirSync(join(proj, out.folder)).join(', '))
  // stopping a render part-way: the finished clip stays as it was, no half file appears
  const stopFile = join(proj, out.clips[0].video)
  const sizeBefore = statSync(stopFile).size
  const ac = new AbortController()
  const stopping = SC.renderShortClips({ projectDir: proj, indexes: [out.clips[0].index], force: true, signal: ac.signal, onProgress: (p) => { if (Number(p.progress) >= 20) ac.abort() } })
  let stoppedErr = null
  try {
    await stopping
  } catch (err) {
    stoppedErr = err
  }
  check('integration: a stopped render ends with an abort', stoppedErr && (stoppedErr.name === 'AbortError' || /abort|取消|停止/i.test(String(stoppedErr.message))), String(stoppedErr?.message || 'finished without stopping'))
  check('integration: after a stop the earlier clip is intact and no .part file remains', statSync(stopFile).size === sizeBefore && !readdirSync(join(proj, out.folder)).some((f) => /\.part\./.test(f)), readdirSync(join(proj, out.folder)).join(', '))
  const again = await SC.renderShortClips({ projectDir: proj })
  check('integration: unchanged clips are not rendered again', again.clips.every((c) => c.reused), JSON.stringify(again.clips.map((c) => c.reused)))
  const st1 = await SC.readShortClipsState(proj)
  check('integration: panel state lists the recording, plan and rendered clips', st1.sources.length === 1 && st1.plan?.clips?.length === 2 && st1.rendered.length === 2 && st1.estimate?.transcribed === true)
  console.log(`  (render time for ${out.clips.length} clips: ${took.toFixed(1)} s; source ${dur.toFixed(1)} s; frames: ${out.folder})`)
  // a frame of the first clip for a visual check
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '3', '-i', join(proj, out.clips[0].video), '-frames:v', '1', join(SCR, 'clip1-frame.png')])
  console.log(`  frame: ${join(SCR, 'clip1-frame.png')}`)
  void statSync

  // ---- the panel's routes end to end: the configured model is an offline mock server (no network, no cost)
  const { startMockLlm } = await import(pathToFileURL(join(ROOT, 'scripts', 'tests', 'mock-llm-server.mjs')).href)
  const llm = await imp('packages/dsh-tool-media/llm-client.js')
  const mock = await startMockLlm((rec) => ({ text: callModelSync(rec.text) }))
  // the same picks as above, answered by the mock from the rows in the request
  function callModelSync(text) {
    const rows = [...String(text).matchAll(/(\d+)\|[\d:]+\|([^\n\\"]*)/g)].map((mm) => ({ id: Number(mm[1]), text: mm[2] }))
    const find = (re) => rows.find((r) => re.test(r.text))?.id
    const s1 = find(/判断哪一段/) ?? find(/第一，看/)
    const e1 = find(/基本上就不会差/)
    return JSON.stringify({ clips: s1 !== undefined && e1 !== undefined ? [{ start: s1, end: e1, title: '三条标准判断精彩片段', reason: '方法清楚', score: 0.9, tags: ['剪辑'] }] : [] })
  }
  try {
    writeFileSync(llm.getLlmConfigPath(), JSON.stringify({ mode: 'custom', configVersion: 2, provider: 'custom', format: 'openai-completions', baseUrl: mock.url, apiKey: 'sk-test-clips-0001', model: 'mock-model' }))
    const routes = await imp('packages/dsh-web-video-workbench/lib/routes-talk.js')
    const jobs = new Map()
    const createBackgroundJob = (msg, runner) => {
      const job = { id: `job-${jobs.size + 1}`, status: 'running', message: msg }
      const done = runner(() => {}).then(
        (r) => Object.assign(job, { status: 'done', result: r }),
        (e) => Object.assign(job, { status: 'error', error: String(e?.message || e) }),
      )
      jobs.set(job.id, { job, done })
      return job
    }
    const call = async (method, path, body, query = '') => {
      const url = new URL(`http://localhost/api/video-workbench/${path}${query}`)
      const req = new Request(url, method === 'GET' ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
      const res = await routes.handleTalkApiRequest(req, url, { createBackgroundJob })
      return { status: res.status, body: await res.json() }
    }
    const waitJob = async (r) => {
      const j = jobs.get(r.body.jobId)
      await j.done
      return j.job
    }
    const q = `?projectDir=${encodeURIComponent(proj)}`
    const st = await call('GET', 'clips/state', null, q)
    check('route GET clips/state: recordings, plan, engine and model readiness', st.status === 200 && st.body.sources.length === 1 && st.body.plan?.clips?.length === 2 && st.body.engine?.ready === true && st.body.llm?.configured === true && st.body.platforms.length === 6, JSON.stringify({ s: st.status, llm: st.body.llm }))
    const outside = await call('POST', 'clips/find', { projectDir: proj, sourcePath: 'C:/Windows/win.ini' })
    check('route: a file outside the project is refused', outside.status === 400)
    const fj = await waitJob(await call('POST', 'clips/find', { projectDir: proj, platform: 'xiaohongshu', count: 1, focus: '讲方法的部分' }))
    const req0 = mock.requests[mock.requests.length - 1]
    check('route POST clips/find: one model request with rows, focus and the platform lengths, result saved', fj.status === 'done' && fj.result.clips === 1 && mock.requests.length === 1 && /用户的额外要求.*讲方法的部分/.test(req0.text) && /\d+\|\d+:\d\d\|/.test(req0.text), fj.error || `${mock.requests.length} requests`)
    const busy1 = await call('POST', 'clips/update', { projectDir: proj, edits: [{ index: 1, title: '改过的标题', startDelta: 99 }, { index: 'x' }] })
    check('route POST clips/update: title saved, delta clamped to ±5 sentences', busy1.status === 200 && busy1.body.plan.clips[0].title === '改过的标题' && busy1.body.plan.platform === 'xiaohongshu')
    const rj = await waitJob(await call('POST', 'clips/render', { projectDir: proj, settings: { layout: 'window', captions: 'off', accent: '#22CC88', evil: 1 } }))
    const rc = rj.result?.clips?.[0] || {}
    const rp = rc.video ? probeJson(join(proj, rc.video)) : {}
    const rv = (rp.streams || []).find((s) => s.codec_type === 'video')
    check('route POST clips/render: 小红书 3:4 canvas (1080×1440), the 访谈小窗 layout on a portrait canvas, captions off', rj.status === 'done' && rv?.width === 1080 && rv?.height === 1440 && rj.result.captions === false && rj.result.layout === 'window', JSON.stringify({ e: rj.error, layout: rj.result?.layout, w: rv?.width, h: rv?.height }))
    const saved = SC.readClipPlan(proj, join(proj, st.body.source.path))
    check('route: render settings saved for next time (unknown keys dropped)', saved.render.layout === 'window' && saved.render.captions === 'off' && saved.render.accent === '#22CC88' && !('evil' in saved.render))
    process.env.DSH_CLIPS_REVEAL = '0'
    const rv2 = await call('POST', 'clips/reveal', { projectDir: proj })
    check('route POST clips/reveal: returns the folder inside output/clips (no window opened in tests)', rv2.status === 200 && rv2.body.opened === false && /^output\/clips\//.test(rv2.body.folder))
    // two jobs on one project at a time are refused
    const a = await call('POST', 'clips/render', { projectDir: proj })
    const b = await call('POST', 'clips/find', { projectDir: proj })
    check('route: one job per project at a time', a.status === 200 && b.status === 409 && b.body.code === 'BUSY')
    await waitJob(a)
  } finally {
    await mock.close()
  }
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:\n' + failed.map((f) => `  - ${f.name}`).join('\n'))
  process.exit(1)
}
