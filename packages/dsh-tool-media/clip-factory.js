/**
 * @dsh-video/tool-media — 长视频拆条 (long recording → stand-alone short clips): planning.
 *
 * The design follows AutoClip's one-pass clip finder (https://github.com/zhouxiaoka/autoclip, MIT,
 * Copyright (c) 2024 AutoClip Team): numbered transcript rows go to the model in one call per window, the model
 * returns row ranges with a title, a reason and a score, and code checks everything it returns (ids inside the
 * window, plausible lengths, Chinese titles, one retry with the error), removes duplicates across windows, applies
 * length bounds and a selection floor. Written anew for this plugin's data: the rows are whole sentences built from
 * the word-timed local transcript, so a clip never starts or ends inside a sentence; the boundary rules (a trailing
 * question that opens the next topic, a dangling 所以 / 他 at the start) work on sentences; the prompt is our own.
 *
 * Pure functions (unit-tested) + `findClips` (model calls injected) + `planClipCut` (the cut of one clip with the
 * rough-cut rules: pauses, fillers, stutters and retakes inside the clip are removed too).
 */
import { callLlmChat, extractJsonFromLlmText } from './llm-client.js'
import { buildCaptions, planRoughCut, tidyPunctuation } from './rough-cut.js'

/** Publishing targets: canvas and clip lengths (seconds). Durations are guidance for the model and bounds for code. */
export const CLIP_PLATFORMS = Object.freeze({
  douyin: { id: 'douyin', label: '抖音', aspect: '9:16', minSec: 15, targetLo: 30, targetHi: 90, maxSec: 180 },
  shipinhao: { id: 'shipinhao', label: '视频号', aspect: '9:16', minSec: 15, targetLo: 30, targetHi: 90, maxSec: 180 },
  xiaohongshu: { id: 'xiaohongshu', label: '小红书', aspect: '3:4', minSec: 15, targetLo: 30, targetHi: 90, maxSec: 180 },
  kuaishou: { id: 'kuaishou', label: '快手', aspect: '9:16', minSec: 15, targetLo: 30, targetHi: 90, maxSec: 180 },
  bilibili: { id: 'bilibili', label: 'B站', aspect: '16:9', minSec: 30, targetLo: 60, targetHi: 180, maxSec: 300 },
  original: { id: 'original', label: '保持原画幅', aspect: 'source', minSec: 15, targetLo: 30, targetHi: 120, maxSec: 240 },
})

export const CLIP_DEFAULTS = Object.freeze({
  platform: 'douyin',
  count: 0, // 0 = automatic (by the recording's length)
  threshold: 0.7, // model score from which a clip counts as worth posting
  rowPauseSec: 1.0, // a silence this long ends a sentence even without punctuation
  rowMaxChars: 80, // longer sentences are split at a comma
  cloudWindow: { seconds: 60 * 60, overlap: 4 * 60, chars: 70000 },
  localWindow: { seconds: 20 * 60, overlap: 80, chars: 12000 },
  duplicateOverlap: 0.5,
  mergeGapSec: 5,
  questionLookbackSec: 20,
  answerStubSec: 12,
  leadMaxSec: 20,
})

const STRONG_END = /[。！？!?；;…]$/
const QUESTION_END = /(?:[？?]|(?:吗|呢|么)[。！？?!]?)$/
const DANGLING_START = /^(?:所以说?|然后|那么|那就|但是|可是|不过|而且|并且|因为|因此|于是|那个|这个|这些|那些|他们?|她们?|它们?|其实呢|就是说|也就是说|换句话说|对[，,。]|是的[，,。])/
const CJK_RE = /[㐀-鿿]/

const r3 = (x) => Math.round(Number(x) * 1000) / 1000
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Whole-sentence rows for the model from the rough-cut plan's words (removed fillers / false starts are left out of
 * the text but the rows keep their word indices). Row: { id, start, end, text, firstWord, lastWord, question, chars }.
 */
export function buildClipRows(words, { pauseSec = CLIP_DEFAULTS.rowPauseSec, maxChars = CLIP_DEFAULTS.rowMaxChars } = {}) {
  const rows = []
  let cur = null
  const flush = () => {
    if (cur && cur.n) {
      const text = tidyPunctuation(cur.text).trim()
      rows.push({ id: rows.length, start: r3(cur.start), end: r3(cur.end), text, firstWord: cur.firstWord, lastWord: cur.lastWord, question: QUESTION_END.test(text), chars: Array.from(text.replace(/\s+/g, '')).length })
    }
    cur = null
  }
  for (const w of Array.isArray(words) ? words : []) {
    if (w.punct) {
      if (!cur) continue
      cur.text += w.text
      if (w.strong) flush()
      else if (Array.from(cur.text).length >= maxChars) flush()
      continue
    }
    if (w.removed) continue
    if (cur && Number(w.onset) - cur.end >= pauseSec) flush()
    if (!cur) cur = { text: '', n: 0, start: Number(w.onset), end: Number(w.end), firstWord: w.i, lastWord: w.i }
    const sep = cur.n && w.space && /^[A-Za-z0-9]/.test(w.text) ? ' ' : ''
    cur.text += sep + w.text
    cur.n++
    cur.end = Math.max(cur.end, Number(w.end))
    cur.lastWord = w.i
    if (Array.from(cur.text).length >= maxChars * 2) flush()
  }
  flush()
  return rows
}

/** Clip lengths and counts for a recording of `totalSec` on `platform`; `count` > 0 asks for exactly that many. */
export function clipProfile({ totalSec = 0, platform = CLIP_DEFAULTS.platform, count = 0 } = {}) {
  const p = CLIP_PLATFORMS[platform] || CLIP_PLATFORMS[CLIP_DEFAULTS.platform]
  const total = Math.max(0, Number(totalSec) || 0)
  const minutes = total / 60
  let countLo
  let countHi
  if (minutes < 8) {
    countLo = 2
    countHi = 4
  } else if (minutes < 30) {
    countLo = 3
    countHi = 8
  } else {
    const hours = minutes / 60
    countLo = Math.max(5, Math.round(5 * hours))
    countHi = Math.max(10, Math.round(12 * hours))
  }
  const wanted = Math.max(0, Math.min(30, Math.round(Number(count) || 0)))
  if (wanted) {
    countLo = wanted
    countHi = wanted
  }
  // very short recordings: allow shorter clips so there is something to choose from
  const shortSource = total > 0 && total < p.targetLo * 3
  return {
    platform: p.id,
    platformLabel: p.label,
    aspect: p.aspect,
    minSec: shortSource ? Math.min(p.minSec, 10) : p.minSec,
    targetLo: p.targetLo,
    targetHi: p.targetHi,
    maxSec: p.maxSec,
    countLo: Math.min(countLo, 30),
    countHi: Math.min(countHi, 30),
    exactCount: wanted || 0,
    minKeep: wanted ? Math.min(wanted, 2) : Math.min(2, countLo),
    maxClips: wanted || Math.min(30, countHi),
    totalSec: r3(total),
  }
}

/** Is the configured model a local server (Ollama, LM Studio, a LAN address)? Local models get smaller windows. */
export function isLocalModelConfig(cfg = {}) {
  if (!cfg || cfg.mode === 'host-agent') return false
  if (cfg.provider === 'ollama') return true
  const u = String(cfg.baseUrl || '').toLowerCase()
  return /^https?:\/\/(?:localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(u)
}

/** [first, last] row index windows: ~`seconds` long, `overlap` shared, under `chars` characters. */
export function windowRows(rows, { seconds = 3600, overlap = 240, chars = 70000 } = {}) {
  if (!rows.length) return []
  const out = []
  let first = 0
  while (first < rows.length) {
    const start = rows[first].start
    let size = rows[first].text.length
    let last = first
    while (last + 1 < rows.length && rows[last + 1].end - start <= seconds && size + rows[last + 1].text.length <= chars) {
      last++
      size += rows[last].text.length
    }
    out.push([first, last])
    if (last + 1 >= rows.length) break
    let back = last
    while (back > first && rows[last].end - rows[back].start < overlap) back--
    // the next window shares ~overlap seconds; without room for that it simply continues after this one
    first = back > first ? back : last + 1
  }
  return out
}

const clock = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The model's instructions (our own wording). */
export function buildFinderSystemPrompt(profile, { countLo, countHi } = {}) {
  const lo = countLo ?? profile.countLo
  const hi = countHi ?? profile.countHi
  return [
    '你是短视频主编。下面是一段长视频（访谈、播客、直播、课程或演讲）的完整文字稿，请挑出可以单独发布的精彩片段。',
    'rows 每行是「行号|开始时间|一句话」，按时间排序；行号从小到大，一个片段是连续的若干行。',
    '挑选标准（按重要性）：',
    '1. 能独立成立：没看过前后文的观众也能看懂。开头不要是「所以」「然后」「他」「这个」这类接着前文的话——需要时把前面一两句一起选进来。',
    '2. 完整：从一个问题或观点的第一句开始，到这个回答或观点真正讲完为止；不要停在半截，不要以主持人抛出的下一个问题结尾，不要带上开场寒暄、过渡语、广告口播。',
    '3. 有看点：观点鲜明、信息量大、有实用干货、有金句、有冲突或反转、情绪有感染力；第一句最好能一下抓住人。',
    `时长：每个片段 ${profile.minSec}–${profile.maxSec} 秒，最好 ${profile.targetLo}–${profile.targetHi} 秒（按行首时间估算；结束时间约等于下一行的开始时间）。一个回答讲完就结束，不要为了凑时长带进下一段话题；太长就在自然的段落处拆成两个。`,
    `数量：这段文字稿里挑 ${lo === hi ? `${lo}` : `${lo}–${hi}`} 个，宁缺毋滥，片段之间不能重叠。`,
    '每个片段给出：',
    '- start / end：起止行号（包含 end 这一行）；',
    '- title：中文标题，不超过 20 个字，忠于原话，不夸张、不编造，不用感叹号堆砌（原文是外语也用中文写）；',
    '- reason：中文推荐理由，15–30 个字，说出最大的亮点；',
    '- score：0.0–1.0，单独发布的综合价值，0.7 以上表示值得发；',
    '- tags：2–4 个话题词，每个不超过 8 个字，必须是这段话里讲到的内容，不要带 #。',
    '只返回 JSON，不要任何其他文字：{"clips":[{"start":0,"end":0,"title":"","reason":"","score":0.0,"tags":[""]}]}',
  ].join('\n')
}

/** The user message for one window: optional focus + numbered rows. */
export function buildFinderUserMessage(rows, first, last, { focus = '', totalSec = 0, previousError = '' } = {}) {
  const lines = []
  for (let i = first; i <= last; i++) lines.push(`${rows[i].id}|${clock(rows[i].start)}|${rows[i].text}`)
  const head = []
  if (totalSec) head.push(`整段视频约 ${clock(totalSec)}；这一部分是第 ${clock(rows[first].start)} 到 ${clock(rows[last].end)}。`)
  const f = String(focus || '').trim()
  if (f) head.push(`用户的额外要求（优先满足，但不能违反上面的规则）：${f.slice(0, 300)}`)
  if (previousError) head.push(`上一次的回答不合格：${previousError}。请严格按格式、行号范围和中文标题的要求重新返回。`)
  head.push('rows:')
  return `${head.join('\n')}\n${lines.join('\n')}`
}

const toScore = (v) => {
  if (typeof v === 'boolean') return null
  const f = Number(v)
  if (!Number.isFinite(f) || f < 0 || f > 100) return null
  return f > 1 ? (f <= 10 ? f / 10 : f / 100) : f
}
const cleanTitle = (s) =>
  String(s ?? '')
    .replace(/[*_`#>]+/g, '')
    .replace(/^[\s"'“”「」『』]+|[\s"'“”「」『』]+$/g, '')
    .replace(/[!！]{2,}/g, '！')
    .trim()

/**
 * Validate one window's reply. Returns clips [{ startRow, endRow, title, reason, score, tags }]; throws an Error with a
 * plain-Chinese reason (fed back to the model on the retry) when the reply is unusable.
 */
export function parseFinderReply(raw, { first, last, rows, profile }) {
  let obj = raw
  if (typeof raw === 'string') {
    try {
      obj = extractJsonFromLlmText(raw)
    } catch {
      obj = null
    }
  }
  const items = Array.isArray(obj) ? obj : obj && typeof obj === 'object' ? obj.clips : null
  if (!Array.isArray(items)) throw new Error('回答里没有 clips 列表（需要 JSON：{"clips":[...]}）')
  const clips = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const s = Number(it.start)
    const e = Number(it.end)
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < first || e > last || s > e) continue
    const title = cleanTitle(it.title)
    if (!title) continue
    const span = rows[e].end - rows[s].start
    if (span < profile.minSec * 0.5 || span > profile.maxSec * 1.5) continue
    const score = toScore(it.score)
    const tags = (Array.isArray(it.tags) ? it.tags : typeof it.tags === 'string' ? it.tags.split(/[,，、\s]+/) : [])
      .map((t) => String(t ?? '').replace(/^#+/, '').trim())
      .filter((t) => t && Array.from(t).length <= 12)
      .slice(0, 5)
    clips.push({ startRow: s, endRow: e, title: Array.from(title).slice(0, 30).join(''), reason: String(it.reason ?? '').trim().slice(0, 80), score: score === null ? 0.5 : r3(score), tags })
  }
  if (items.length && !clips.length) throw new Error('没有一个片段合格（行号超出范围、起止颠倒、时长明显不对或缺标题）')
  if (clips.length && clips.filter((c) => CJK_RE.test(c.title)).length < clips.length / 2) throw new Error('标题必须用中文写')
  return clips
}

const spanOf = (c, rows) => rows[c.endRow].end - rows[c.startRow].start

/** Picks of overlapping windows describing the same moment (shared > half of the shorter): keep the better one. */
export function dedupeClips(clips, rows, { overlap = CLIP_DEFAULTS.duplicateOverlap } = {}) {
  const kept = []
  for (const c of [...clips].sort((a, b) => b.score - a.score)) {
    const s = rows[c.startRow].start
    const e = rows[c.endRow].end
    const dup = kept.some((o) => {
      const os = rows[o.startRow].start
      const oe = rows[o.endRow].end
      return Math.min(e, oe) - Math.max(s, os) > overlap * Math.min(e - s, oe - os)
    })
    if (!dup) kept.push(c)
  }
  return kept.sort((a, b) => a.startRow - b.startRow)
}

/**
 * Sentence-level boundary rules for one clip (returns a new clip; `log` collects what changed):
 *   - a question near the end followed by only a stub of its answer opens the next topic → end before it
 *   - a start that leans on what came before (所以 / 他 / 这个 …) takes in up to two earlier sentences
 */
export function polishClipBounds(clip, rows, profile, { prevEnd = -Infinity, log = [] } = {}) {
  const c = { ...clip }
  const span = () => rows[c.endRow].end - rows[c.startRow].start
  // trailing question
  for (let r = c.endRow; r > c.startRow; r--) {
    if (rows[r].start < rows[c.endRow].end - CLIP_DEFAULTS.questionLookbackSec) break
    if (!rows[r].question) continue
    const answer = rows[c.endRow].end - rows[r].end
    if (answer > CLIP_DEFAULTS.answerStubSec) break
    const newSpan = rows[r - 1].end - rows[c.startRow].start
    if (newSpan >= Math.max(profile.minSec, span() * 0.6)) {
      log.push({ op: 'drop-trailing-question', row: r })
      c.endRow = r - 1
    }
    break
  }
  // dangling start
  for (let k = 0; k < 2; k++) {
    const first = rows[c.startRow]
    if (!DANGLING_START.test(first.text) || c.startRow === 0) break
    const prev = rows[c.startRow - 1]
    if (prev.start <= prevEnd || first.start - prev.end > 3 || first.start - prev.start > CLIP_DEFAULTS.leadMaxSec) break
    if (rows[c.endRow].end - prev.start > profile.maxSec) break
    log.push({ op: 'lead-in', row: c.startRow - 1 })
    c.startRow--
  }
  return c
}

/**
 * Bring the picks into shape: boundary rules, overlaps (merge when they share more than half, otherwise the later one
 * starts after the earlier one), length bounds on sentence edges (extend along close sentences / merge with a close
 * neighbour / drop; trim long ones at a sentence end that is not a question). Returns { clips, report }.
 */
export function refineClips(clips, rows, profile) {
  const report = { input: clips.length, ops: [], dropped: [] }
  let list = clips.map((c) => {
    const log = []
    const out = polishClipBounds(c, rows, profile, { log })
    for (const l of log) report.ops.push({ title: c.title, ...l })
    return out
  })
  list.sort((a, b) => a.startRow - b.startRow || a.endRow - b.endRow)
  // overlaps
  const merged = []
  for (const c of list) {
    const prev = merged[merged.length - 1]
    if (prev && c.startRow <= prev.endRow) {
      const shared = rows[Math.min(prev.endRow, c.endRow)].end - rows[c.startRow].start
      const shorter = Math.min(spanOf(prev, rows), spanOf(c, rows))
      if (shared > CLIP_DEFAULTS.duplicateOverlap * shorter || c.endRow <= prev.endRow) {
        const keep = c.score > prev.score ? c : prev
        merged[merged.length - 1] = { ...keep, startRow: Math.min(prev.startRow, c.startRow), endRow: Math.max(prev.endRow, c.endRow), tags: [...new Set([...(keep.tags || []), ...((keep === c ? prev : c).tags || [])])].slice(0, 5) }
        report.ops.push({ title: keep.title, op: 'merge-overlap' })
        continue
      }
      c.startRow = prev.endRow + 1
      report.ops.push({ title: c.title, op: 'shift-start' })
    }
    merged.push(c)
  }
  list = merged
  // length bounds
  const out = []
  for (let k = 0; k < list.length; k++) {
    const c = { ...list[k] }
    const limitEnd = k + 1 < list.length ? list[k + 1].startRow - 1 : rows.length - 1
    const limitStart = out.length ? out[out.length - 1].endRow + 1 : 0
    while (spanOf(c, rows) < profile.minSec && c.endRow < limitEnd && rows[c.endRow + 1].start - rows[c.endRow].end <= CLIP_DEFAULTS.mergeGapSec && rows[c.endRow + 1].end - rows[c.startRow].start <= profile.maxSec) {
      c.endRow++
      report.ops.push({ title: c.title, op: 'extend' })
    }
    while (spanOf(c, rows) < profile.minSec && c.startRow > limitStart && rows[c.startRow].start - rows[c.startRow - 1].end <= CLIP_DEFAULTS.mergeGapSec && rows[c.endRow].end - rows[c.startRow - 1].start <= profile.maxSec) {
      c.startRow--
      report.ops.push({ title: c.title, op: 'extend-start' })
    }
    if (spanOf(c, rows) > profile.maxSec) {
      let e = c.endRow
      while (e > c.startRow && rows[e].end - rows[c.startRow].start > profile.maxSec) e--
      // prefer an end on a finished sentence that is not a question
      let best = e
      for (let r = e; r > c.startRow && rows[e].end - rows[r].end < 15; r--) {
        if (STRONG_END.test(rows[r].text) && !rows[r].question) {
          best = r
          break
        }
      }
      c.endRow = best
      report.ops.push({ title: c.title, op: 'trim' })
    }
    if (spanOf(c, rows) < profile.minSec) {
      const prev = out[out.length - 1]
      if (prev && rows[c.startRow].start - rows[prev.endRow].end <= CLIP_DEFAULTS.mergeGapSec && rows[c.endRow].end - rows[prev.startRow].start <= profile.maxSec) {
        prev.endRow = c.endRow
        prev.score = Math.max(prev.score, c.score)
        report.ops.push({ title: prev.title, op: 'absorb-short' })
        continue
      }
      report.dropped.push({ title: c.title, reason: `太短（${Math.round(spanOf(c, rows))} 秒，至少 ${profile.minSec} 秒）` })
      continue
    }
    out.push(c)
  }
  report.output = out.length
  return { clips: out, report }
}

/**
 * Choose the clips to offer: every clip at or above `threshold`, topped up to `minKeep` by score, at most `maxClips`;
 * an exact count takes the best `exactCount`. Returned in time order, each with `selectedBy`.
 */
export function selectClips(clips, profile, { threshold = CLIP_DEFAULTS.threshold } = {}) {
  const ranked = [...clips].sort((a, b) => b.score - a.score || a.startRow - b.startRow)
  let chosen
  if (profile.exactCount) chosen = ranked.slice(0, profile.exactCount).map((c) => ({ ...c, selectedBy: 'count' }))
  else {
    chosen = ranked.filter((c) => c.score >= threshold).map((c) => ({ ...c, selectedBy: 'score' }))
    for (const c of ranked) {
      if (chosen.length >= profile.minKeep) break
      if (!chosen.some((x) => x.startRow === c.startRow)) chosen.push({ ...c, selectedBy: 'top-up' })
    }
    chosen = chosen.sort((a, b) => b.score - a.score).slice(0, profile.maxClips)
  }
  return chosen.sort((a, b) => a.startRow - b.startRow)
}

/** Rough size of the model work for planning: calls and tokens (Chinese ~1 token per 1.3 characters). */
export function estimateFinderWork(rows, profile, { local = false } = {}) {
  const win = windowRows(rows, local ? CLIP_DEFAULTS.localWindow : CLIP_DEFAULTS.cloudWindow)
  const chars = win.reduce((n, [a, b]) => n + rows.slice(a, b + 1).reduce((m, r) => m + r.text.length + 10, 0), 0)
  const system = buildFinderSystemPrompt(profile).length
  return { calls: win.length, inputTokens: Math.round((chars + system * win.length) / 1.3), outputTokens: win.length * Math.min(4000, 120 + profile.countHi * 110) }
}

/**
 * Find the clips of a recording. `callModel({ system, user, purpose })` → reply text (default: the configured model /
 * the host agent through callLlmChat). Returns { clips, windows, report, failedWindows }.
 */
export async function findClips({ rows, profile, focus = '', local = false, callModel, signal, onProgress, onWait, threshold = CLIP_DEFAULTS.threshold } = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('没有识别到说话内容，无法拆条。')
  const total = Math.max(1, rows[rows.length - 1].end - rows[0].start)
  const spans = windowRows(rows, local ? CLIP_DEFAULTS.localWindow : CLIP_DEFAULTS.cloudWindow)
  const call =
    callModel ||
    (async ({ system, user, purpose }) => {
      const res = await callLlmChat({ system, messages: [{ role: 'user', content: user }], temperature: 0.3, maxTokens: Math.min(6000, 400 + profile.countHi * 160), responseFormat: 'json', purpose, signal, onWait })
      if (res?.truncated) return { truncated: true, text: res.text || '' }
      return res?.text || ''
    })
  const picked = []
  let failedWindows = 0
  for (let w = 0; w < spans.length; w++) {
    if (signal?.aborted) throw Object.assign(new Error('已停止'), { name: 'AbortError' })
    const [first, last] = spans[w]
    const share = Math.min(1, (rows[last].end - rows[first].start) / total)
    const countLo = profile.exactCount ? Math.max(1, Math.round(profile.exactCount * share)) : Math.max(1, Math.round(profile.countLo * share))
    const countHi = profile.exactCount ? Math.max(1, Math.round(profile.exactCount * share) + 1) : Math.max(2, Math.round(profile.countHi * share))
    const system = buildFinderSystemPrompt(profile, { countLo, countHi })
    let previousError = ''
    let got = null
    for (let attempt = 0; attempt < 2 && !got; attempt++) {
      onProgress?.({ window: w + 1, windows: spans.length, attempt: attempt + 1, message: spans.length > 1 ? `AI 正在看第 ${w + 1}/${spans.length} 段文字稿，挑精彩片段…` : 'AI 正在看文字稿，挑精彩片段…' })
      const reply = await call({ system, user: buildFinderUserMessage(rows, first, last, { focus, totalSec: total, previousError }), purpose: '长视频拆条：挑精彩片段' })
      try {
        if (reply && typeof reply === 'object' && reply.truncated) throw new Error('回答太长被截断了，请少写几个片段、理由写短一些')
        got = parseFinderReply(reply, { first, last, rows, profile })
      } catch (err) {
        previousError = err.message
      }
    }
    if (!got) {
      failedWindows++
      continue
    }
    picked.push(...got)
  }
  if (!picked.length) throw new Error(failedWindows ? 'AI 没有按要求返回片段，请再试一次（或换一个更强的模型）。' : 'AI 没有在这段视频里找到适合单独发布的片段。')
  const unique = dedupeClips(picked, rows)
  const { clips: refined, report } = refineClips(unique, rows, profile)
  const chosen = selectClips(refined, profile, { threshold })
  return {
    clips: chosen.map((c, k) => ({ ...c, index: k + 1, sourceStart: rows[c.startRow].start, sourceEnd: rows[c.endRow].end, spanSec: r3(spanOf(c, rows)), firstWord: rows[c.startRow].firstWord, lastWord: rows[c.endRow].lastWord, text: rows.slice(c.startRow, c.endRow + 1).map((r) => r.text).join('') })),
    candidates: refined.length,
    windows: spans.length,
    failedWindows,
    report,
  }
}

/**
 * The cut of one clip with the rough-cut rules (pauses / fillers / stutters / retakes inside the clip are removed).
 * Returns the plan (keep ranges on the source timeline, frame grid) and the clip's captions (cut timeline).
 */
export function planClipCut(transcript, clip, { options = {}, fps = 30, sourceDurationSec = 0, offsetSec = 0, maxLineWidth = 11, extraKeep = [] } = {}) {
  const keepOnly = [[clip.firstWord, clip.lastWord], ...extraKeep]
  const plan = planRoughCut(transcript, { ...options, fps, offsetSec, sourceDurationSec }, { keepOnly })
  const captions = buildCaptions(plan, { maxLineWidth, fps })
  return { plan, captions, durationSec: plan.outputDurationSec, keep: plan.keep }
}

/** Adjust a clip's sentence range by whole sentences (the panel's ± buttons), within the recording. */
export function nudgeClipRows(clip, rows, { startDelta = 0, endDelta = 0 } = {}) {
  const s = clamp(clip.startRow + Math.round(Number(startDelta) || 0), 0, rows.length - 1)
  const e = clamp(clip.endRow + Math.round(Number(endDelta) || 0), s, rows.length - 1)
  return { ...clip, startRow: s, endRow: e, sourceStart: rows[s].start, sourceEnd: rows[e].end, spanSec: r3(rows[e].end - rows[s].start), firstWord: rows[s].firstWord, lastWord: rows[e].lastWord, text: rows.slice(s, e + 1).map((r) => r.text).join('') }
}
