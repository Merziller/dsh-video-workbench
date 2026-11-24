/**
 * @dsh-video/tool-media — 口播粗剪 (talking-head rough cut) + 真实字幕 (captions from what was really said)
 *
 * Input: a local transcript (speech-recognition.js: segments with per-token start times + a 10 ms energy envelope).
 * Planning is pure (unit-tested): tokens → words (with acoustic onset / end from the energy envelope) → removals
 * (long pauses, fillers 嗯/呃/um/uh, stutters 我我我, retakes & false starts — the LAST take is kept) → keep ranges
 * snapped to the video frame grid, every cut placed in the quietest 10 ms around it → output-time captions with
 * per-word timing. The user can restore any removal or cut extra words (`overrides`).
 * Rendering: one FFmpeg pass (trim / atrim + 8 ms fades at every cut + concat, constant frame rate) → roughcut.mp4 and a
 * 48 kHz WAV of the same audio for the project mix.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cleanSubtitleChunk, displayWidth, REPO_ROOT, resolveBinaries, runCommandRedirected, segmentWords, toSubtitleText } from '../shared/index.js'
import { decodeEnergyEnvelope } from './speech-recognition.js'

export const ROUGH_CUT_DEFAULTS = Object.freeze({
  cutPauses: true,
  maxPauseSec: 0.5, // pauses longer than this are shortened…
  keepPauseSec: 0.24, // …to about this long
  cutFillers: true,
  cutStutters: true,
  cutRetakes: true,
  cutNoise: true, // sound without any recognised words (cough, bump, laughter) between sentences
  headPadSec: 0.15,
  tailPadSec: 0.35,
  fadeMs: 8,
})

export const REMOVAL_KINDS = {
  pause: '长停顿',
  filler: '口头禅',
  stutter: '结巴重复',
  retake: '重录（保留最后一遍）',
  'false-start': '说了半句重来',
  noise: '杂音（没有说话内容）',
  head: '开头空白',
  tail: '结尾空白',
  fragment: '疑似口误（孤立的单个字）',
  manual: '手动删除',
}

const STRONG_PUNCT = new Set(['。', '！', '？', '；', '…', '.', '!', '?', ';'])
const WEAK_PUNCT = new Set(['，', '、', '：', ',', ':', '—', '-'])
const isPunctText = (t) => /^[\s\p{P}\p{S}]+$/u.test(t) && !/[0-9A-Za-z\u4e00-\u9fff]/.test(t)
// kana, CJK ideographs, hangul, CJK compatibility ideographs
const CJK_CLASS = '\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af\\uf900-\\ufaff'
const CJK_RE = new RegExp(`[${CJK_CLASS}]`)
const CJK_ONLY_RE = new RegExp(`^[${CJK_CLASS}]+$`)
const coreOf = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// fillers by language: strong = removed wherever they stand alone; weak = only between pauses / punctuation
const FILLERS = {
  zh: { strong: ['嗯', '呃', '唔', '嗯嗯', '呃呃', '额', '嗯哼', '呃嗯'], weak: ['啊', '哦', '哎', '诶', '欸', '呀', '嘛', '那个', '就是'] },
  yue: { strong: ['嗯', '呃', '唔', '嗯嗯'], weak: ['啊', '哦', '哎', '诶', '欸', '咁'] },
  en: { strong: ['um', 'uh', 'uhm', 'umm', 'erm', 'hmm', 'hm', 'mm', 'mhm'], weak: ['ah', 'er', 'eh', 'oh'] },
  ja: { strong: ['えーと', 'えっと', 'ええと', 'えー', 'あのー', 'うーん', 'んー'], weak: ['あの', 'まあ', 'その'] },
  ko: { strong: ['음', '어', '으음'], weak: ['아', '저기'] },
}
// weak multi-char fillers (那个 / 就是) are only removed when a pause sits on BOTH sides of them
const WEAK_NEEDS_BOTH_PAUSES = new Set(['那个', '就是', 'あの', 'まあ', 'その', '저기'])
// single function words whose quick repetition is a stutter (我我 / 这这个); never interjections like 好好好 / 哈哈
const ZH_STUTTER_WORDS = new Set(['我', '你', '他', '她', '它', '这', '那', '就', '是', '在', '有', '要', '会', '能', '把', '被', '的', '了', '也', '都', '还', '我们', '你们', '他们', '这个', '那个', '就是', '然后', '因为', '所以', '但是', '如果', '其实', '我觉得', '我们要', '这是'])
const ZH_NEVER_STUTTER = new Set(['好', '哈', '呵', '嘿', '啦', '来', '走', '快', '谢', '对对', '是是', '行', '嗯', '啊'])
const EN_LEGIT_DOUBLES = new Set(['that', 'had', 'is', 'do', 'very', 'so', 'bye', 'no', 'yes', 'really'])

/* -------------------------------------------------------------------------------------------- energy helpers */

function percentile(sorted, p) {
  if (!sorted.length) return -100
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * p)))]
}

/** Adaptive speech / silence threshold (dBFS) from the envelope: just above the noise floor, well below speech. */
export function energyThreshold(db) {
  const sorted = [...db].sort((a, b) => a - b)
  const floor = percentile(sorted, 0.1)
  const speech = percentile(sorted, 0.95)
  return Math.max(-70, Math.min(-22, Math.max(floor + 9, speech - 32)))
}

/** Energy envelope helper on the SOURCE timeline (`offsetSec` = where the transcript's audio starts in the file). */
function makeEnergy(transcript, offsetSec = 0) {
  const { hopSec, db } = decodeEnergyEnvelope(transcript)
  const thr = db.length ? energyThreshold(db) : -45
  const frameAt = (t) => Math.max(0, Math.min(db.length - 1, Math.floor((t - offsetSec) / hopSec)))
  const loud = (f) => (db.length ? db[f] >= thr : true)
  return {
    hopSec,
    db,
    thr,
    has: db.length > 0,
    frameAt,
    loud,
    timeOf: (f) => f * hopSec + offsetSec,
    /** Quietest 10 ms within [lo, hi] (ties → closest to `t`); returns the frame's start time. */
    quietest(t, lo, hi) {
      if (!db.length || hi <= lo) return Math.max(lo, Math.min(hi, t))
      const a = frameAt(lo)
      const b = frameAt(hi)
      let best = frameAt(t)
      let bestDb = Infinity
      let bestDist = Infinity
      for (let f = a; f <= b; f++) {
        const d = Math.abs(f * hopSec + offsetSec - t)
        if (db[f] < bestDb - 0.5 || (Math.abs(db[f] - bestDb) <= 0.5 && d < bestDist)) {
          bestDb = db[f]
          best = f
          bestDist = d
        }
      }
      return Math.max(lo, Math.min(hi, best * hopSec + offsetSec + hopSec / 2))
    },
  }
}

/* -------------------------------------------------------------------------------------------- tokens → words */

const langFamily = (lang) => {
  const l = String(lang || '').toLowerCase()
  if (l === 'yue') return 'yue'
  if (l === 'en') return 'en'
  if (l === 'ja') return 'ja'
  if (l === 'ko') return 'ko'
  return 'zh'
}

/**
 * Flatten the transcript into tokens with an estimated acoustic onset and end (seconds, source timeline).
 * Token start times from the model mark where it heard the token (±60 ms); the energy envelope finds where the
 * sound really starts (onset) and where a following silence begins (end).
 */
export function buildTimedTokens(transcript, { offsetSec = 0 } = {}) {
  const off = Number(offsetSec) || 0
  const en = makeEnergy(transcript, off)
  const out = []
  const segs = Array.isArray(transcript?.segments) ? transcript.segments : []
  segs.forEach((seg, si) => {
    const toks = Array.isArray(seg.tokens) ? seg.tokens : []
    const lang = langFamily(seg.lang || transcript.language)
    const segEnd = (Number(seg.end) || 0) + off
    for (let k = 0; k < toks.length; k++) {
      const raw = String(toks[k].t ?? '')
      if (raw === '') continue
      const text = raw.replace(/^\s+/, '')
      const s = (Number(toks[k].s) || 0) + off
      if (!text) {
        // a bare space token (SenseVoice emits " " before digits): it only marks a word boundary
        out.push({ seg: si, raw, text: '', space: true, s, onset: s, end: s, punct: false, sep: true, lang })
        continue
      }
      const punct = isPunctText(text)
      let nextStart = segEnd + 0.12
      for (let j = k + 1; j < toks.length; j++) {
        const tj = String(toks[j].t ?? '').trim()
        if (tj && !isPunctText(tj)) {
          nextStart = Number(toks[j].s) + off || nextStart
          break
        }
      }
      if (punct) {
        out.push({ seg: si, raw, text, space: /^\s/.test(raw), s, onset: s, end: s, punct: true, strong: STRONG_PUNCT.has(text[0]), lang })
        continue
      }
      const cap = CJK_RE.test(text) ? 0.5 : /^\d+$/.test(text) ? 0.6 : 0.75
      const hardEnd = Math.max(s + 0.06, Math.min(nextStart, s + cap))
      let end = hardEnd
      if (en.has) {
        const minQuiet = 8 // 80 ms of silence = the token is over
        let run = 0
        for (let f = en.frameAt(s + 0.06); f <= en.frameAt(hardEnd); f++) {
          if (!en.loud(f)) {
            run++
            if (run >= minQuiet) {
              end = Math.max(s + 0.06, en.timeOf(f - minQuiet + 1))
              break
            }
          } else run = 0
        }
      }
      // onset: walk back through continuous sound (≤ 250 ms), never before the previous token's end
      const prevEnd = out.length && out[out.length - 1].seg === si ? out[out.length - 1].end : Math.max(0, Number(seg.start) + off - 0.3)
      let onset = s
      if (en.has) {
        let f = en.frameAt(s)
        const limit = Math.max(en.frameAt(Math.max(prevEnd, s - 0.25)), 0)
        while (f > limit && en.loud(f - 1)) f--
        onset = Math.min(s, Math.max(prevEnd, en.timeOf(f)))
      }
      out.push({ seg: si, raw, text, space: /^\s/.test(raw), s, onset, end: Math.max(end, onset + 0.05), punct: false, lang })
    }
  })
  return { tokens: out, energy: en }
}

const wordSegmenters = new Map()
/** Word pieces of a CJK run with the language's own segmenter (zh / ja / ko); per character when unavailable. */
function cjkWords(text, lang = 'zh') {
  const loc = lang === 'ja' ? 'ja' : lang === 'ko' ? 'ko' : 'zh'
  if (!wordSegmenters.has(loc)) {
    try {
      wordSegmenters.set(loc, new Intl.Segmenter(loc, { granularity: 'word' }))
    } catch {
      wordSegmenters.set(loc, null)
    }
  }
  const seg = wordSegmenters.get(loc)
  if (!seg) return [...text]
  return Array.from(seg.segment(text), (x) => x.segment)
}

/**
 * Group tokens into words: CJK runs by the browser/Node word segmenter (Intl.Segmenter), Latin by the model's
 * word-start markers, punctuation separately. Each word: `{ i, from, to, text, norm, onset, end, punct, strong, lang, seg }`.
 */
export function groupWords(tokens) {
  const words = []
  let i = 0
  const push = (from, to, extra = {}) => {
    const toks = tokens.slice(from, to + 1).filter((t) => !t.sep)
    if (!toks.length) return
    const text = toks.map((t, k) => (k > 0 && t.space ? ' ' : '') + t.text).join('')
    words.push({
      i: words.length,
      from,
      to,
      text,
      norm: coreOf(text),
      onset: Math.min(...toks.map((t) => t.onset)),
      end: Math.max(...toks.map((t) => t.end)),
      punct: false,
      strong: false,
      lang: toks[0].lang,
      seg: toks[0].seg,
      space: toks[0].space,
      ...extra,
    })
  }
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.sep) {
      i++
      continue
    }
    if (t.punct) {
      push(i, i, { punct: true, strong: Boolean(t.strong), onset: t.onset, end: t.end })
      i++
      continue
    }
    if (CJK_RE.test(t.text) && !/[A-Za-z0-9]/.test(t.text)) {
      // a run of CJK tokens inside one segment → segment into words
      let j = i
      while (j + 1 < tokens.length && tokens[j + 1].seg === t.seg && !tokens[j + 1].punct && !tokens[j + 1].sep && CJK_RE.test(tokens[j + 1].text) && !/[A-Za-z0-9]/.test(tokens[j + 1].text)) j++
      const run = tokens.slice(i, j + 1)
      const runText = run.map((x) => x.text).join('')
      // char offset → token index
      const tokAt = []
      run.forEach((x, k) => {
        for (let c = 0; c < [...x.text].length; c++) tokAt.push(i + k)
      })
      let c = 0
      for (const piece of cjkWords(runText, t.lang)) {
        const len = [...piece].length
        if (!len) continue
        const from = tokAt[c]
        const to = tokAt[Math.min(tokAt.length - 1, c + len - 1)]
        if (/\S/.test(piece)) {
          if (words.length && words[words.length - 1].to >= from && !words[words.length - 1].punct) {
            // a token split across two segmenter words: keep the token whole in the earlier word
            words[words.length - 1].to = Math.max(words[words.length - 1].to, to)
          } else push(from, to)
        }
        c += len
      }
      i = j + 1
      continue
    }
    // Latin / digits: a word continues while the next token has no leading space and is not punctuation
    let j = i
    while (j + 1 < tokens.length && tokens[j + 1].seg === t.seg && !tokens[j + 1].punct && !tokens[j + 1].sep && !tokens[j + 1].space && !CJK_RE.test(tokens[j + 1].text)) j++
    // digits split as " " "5" "0" → the separator token starts the number word
    push(i, j, { space: t.space || (i > 0 && tokens[i - 1].sep) })
    i = j + 1
  }
  return words
}

/* -------------------------------------------------------------------------------------------- detection */

/** What sits right before word k: the start, punctuation, or a silence of `gap` seconds before the previous word. */
function gapBefore(words, k) {
  if (k <= 0) return { gap: Infinity, start: true }
  const prev = words[k - 1]
  if (prev.punct) return { gap: Infinity, punct: true, strong: prev.strong }
  return { gap: words[k].onset - prev.end }
}

function gapAfter(words, k) {
  if (k >= words.length - 1) return { gap: Infinity, end: true }
  const next = words[k + 1]
  if (next.punct) return { gap: Infinity, punct: true, strong: next.strong }
  return { gap: next.onset - words[k].end }
}

const pausedAt = (g, minGap) => Boolean(g.start || g.end || g.punct || g.gap >= minGap)

export function detectFillers(words) {
  const out = []
  words.forEach((w, k) => {
    if (w.punct) return
    const set = FILLERS[w.lang] || FILLERS.zh
    const strong = set.strong.includes(w.norm)
    const weak = !strong && set.weak.includes(w.norm)
    if (!strong && !weak) return
    if (weak) {
      // 啊 / 哦 / ah / oh only between pauses (好啊 / 是哦 stay); 那个 / 就是 only with a clear pause on both sides
      const need = WEAK_NEEDS_BOTH_PAUSES.has(w.norm) ? 0.25 : 0.16
      if (!(pausedAt(gapBefore(words, k), need) && pausedAt(gapAfter(words, k), need))) return
    }
    out.push({ kind: 'filler', words: [k], text: w.text })
  })
  return out
}

export function detectStutters(words) {
  const out = []
  const content = words.map((w, k) => ({ w, k })).filter((x) => !x.w.punct)
  let p = 0
  while (p < content.length) {
    let found = null
    // phrase length 1..3 words repeated back to back (我我我 / 这个这个 / I I / I mean I mean)
    for (const n of [3, 2, 1]) {
      if (p + 2 * n > content.length) continue
      const A = content.slice(p, p + n)
      const B = content.slice(p + n, p + 2 * n)
      if (!A.every((x, q) => x.w.norm && x.w.norm === B[q].w.norm)) continue
      const gap = B[0].w.onset - A[n - 1].w.end
      if (gap > 1.0) continue
      // never across a sentence end (……我们的。我们的产品……)
      if (words.slice(A[n - 1].k + 1, B[0].k).some((x) => x.punct && x.strong)) continue
      const phrase = A.map((x) => x.w.norm).join('')
      const zh = A[0].w.lang === 'zh' || A[0].w.lang === 'yue'
      // count the whole run of repetitions
      let reps = 2
      while (p + (reps + 1) * n <= content.length && content.slice(p + reps * n, p + (reps + 1) * n).every((x, q) => x.w.norm === A[q].w.norm)) reps++
      // a repetition that is the whole utterance is meant (对对对 / 好好好 / no no no)
      const runFirst = A[0].k
      const runLast = content[p + reps * n - 1].k
      if (pausedAt(gapBefore(words, runFirst), 0.2) && pausedAt(gapAfter(words, runLast), 0.2)) {
        found = { n, reps, keep: true }
        break
      }
      let ok = false
      if (zh) {
        if (ZH_NEVER_STUTTER.has(phrase)) ok = false
        else if (n === 1) ok = [...phrase].length <= 3 && (ZH_STUTTER_WORDS.has(phrase) || reps >= 3 || gap >= 0.12)
        else ok = [...phrase].length <= 6 && (gap >= 0.12 || reps >= 3 || ZH_STUTTER_WORDS.has(phrase))
      } else {
        if (n === 1 && EN_LEGIT_DOUBLES.has(phrase) && gap < 0.15 && reps < 3) ok = false
        else ok = phrase.length <= 24
      }
      if (ok) {
        found = { n, reps }
        break
      }
    }
    if (found) {
      if (!found.keep) {
        const removeIdx = content.slice(p, p + (found.reps - 1) * found.n).map((x) => x.k)
        out.push({ kind: 'stutter', words: removeIdx, text: removeIdx.map((k) => words[k].text).join('') })
      }
      p += found.reps * found.n
    } else p++
  }
  return out
}

const unitsOf = (ws) => {
  const u = []
  for (const w of ws) {
    if (w.punct || !w.norm) continue
    if (CJK_ONLY_RE.test(w.norm)) u.push(...w.norm)
    else u.push(w.norm)
  }
  return u
}

function lcsLen(a, b) {
  if (!a.length || !b.length) return 0
  let prev = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    prev = cur
  }
  return prev[b.length]
}

/** Is utterance A (earlier) an abandoned take of utterance B (later)? → 'false-start' | 'retake' | '' */
// a difference in these makes two similar sentences different content (第一个 / 第二个, 喜欢 / 不喜欢, 上 / 下),
// never a retake of the same line
const ZH_CONTRAST_RE = /[0-9零〇一二两三四五六七八九十百千万第首次上下前后左右大小多少高低长短新旧男女不没无非未别对错是否加减开关进出买卖东西南北早晚今明昨]/
const EN_CONTRAST_RE = /^(?:\d.*|first|second|third|fourth|fifth|last|next|one|two|three|four|five|six|seven|eight|nine|ten|not|no|never|don't|doesn't|isn't|can't|won't|up|down|left|right|before|after|more|less|new|old)$/

function multisetDiff(a, b) {
  const counts = new Map()
  for (const x of b) counts.set(x, (counts.get(x) || 0) + 1)
  const onlyA = []
  for (const x of a) {
    const c = counts.get(x) || 0
    if (c > 0) counts.set(x, c - 1)
    else onlyA.push(x)
  }
  const onlyB = []
  for (const [x, c] of counts) for (let k = 0; k < c; k++) onlyB.push(x)
  return [...onlyA, ...onlyB]
}

/**
 * Is utterance A (earlier) an abandoned take of utterance B (later)? → 'false-start' | 'retake' | ''.
 * false start: A (shorter) opens exactly like B (说了半句重来), said within 6 s;
 * retake: A is a near-copy of B (≥ 75 % in order, same opening, B not much shorter) said within 4 s, and what differs is
 * not a number / ordinal / negation / opposite (parallel sentences like 第一个…第二个 are content, not retakes).
 */
export function retakeKind(ua, ub, { gapSec = 0 } = {}) {
  if (ua.length < 2 || ub.length < 2) return ''
  let prefix = 0
  while (prefix < ua.length && prefix < ub.length && ua[prefix] === ub[prefix]) prefix++
  if (ua.length < ub.length && prefix >= Math.max(2, Math.ceil(ua.length * 0.75))) return gapSec <= 6 ? 'false-start' : ''
  if (gapSec > 4) return ''
  if (ub.length < ua.length * 0.8) return ''
  const sim = lcsLen(ua, ub) / Math.max(ua.length, ub.length)
  if (sim < 0.75) return ''
  // the two takes must open alike — fuzzily, since one recognised word may differ (开饭时间 / 开放时间)
  const head = Math.min(6, ua.length, ub.length)
  if (!(prefix >= 2 || lcsLen(ua.slice(0, head), ub.slice(0, head)) / head >= 0.6)) return ''
  if (ua.length >= 30 && sim < 0.85) return ''
  if (multisetDiff(ua, ub).some((u) => (u.length === 1 ? ZH_CONTRAST_RE.test(u) : EN_CONTRAST_RE.test(u)))) return ''
  return 'retake'
}

/** Utterances: split at strong punctuation and at silences ≥ `gapSec`; clauses additionally at weak punctuation. */
export function splitUtterances(words, { gapSec = 0.55, clauses = false } = {}) {
  const out = []
  let cur = []
  let last = null
  for (const w of words) {
    if (w.removed) continue
    if (w.punct) {
      if (w.strong || (clauses && WEAK_PUNCT.has(w.text[0]))) {
        if (cur.length) out.push(cur)
        cur = []
      }
      continue
    }
    if (last && w.onset - last.end >= gapSec && cur.length) {
      out.push(cur)
      cur = []
    }
    cur.push(w)
    last = w
  }
  if (cur.length) out.push(cur)
  return out
}

const isFillerWord = (w) => {
  const set = FILLERS[w.lang] || FILLERS.zh
  return set.strong.includes(w.norm) || set.weak.includes(w.norm)
}

const textOfWords = (ws) => ws.map((w) => (w.space && /^[A-Za-z0-9]/.test(w.text) ? ' ' : '') + w.text).join('').trim()

/**
 * Retakes and false starts between utterances. The later take is kept; earlier takes are removed when they are a
 * prefix of it (说了半句重来) or a near-copy said shortly before it (重录). Utterances that are only a filler or a
 * single syllable do not break a chain of takes; a take may span two utterances (the recogniser split it at a pause).
 */
export function detectRetakes(words) {
  const out = []
  const marked = new Set()
  const isStrongFiller = (w) => (FILLERS[w.lang] || FILLERS.zh).strong.includes(w.norm)
  const scan = (utts, clauseMode) => {
    // 嗯 / um are not content: they never make two takes look different (they are cut on their own as fillers)
    const subs = utts
      .map((u0) => u0.filter((w) => !isStrongFiller(w)))
      .filter((u) => u.length)
      .map((u) => ({ u, units: unitsOf(u), start: u[0].onset, end: u[u.length - 1].end }))
      .filter((x) => x.units.length >= 2 && !x.u.every((w) => w.punct || isFillerWord(w)))
    for (let j = 1; j < subs.length; j++) {
      if (subs[j].u.some((w) => marked.has(w.i))) continue
      for (const lenB of clauseMode ? [1] : [1, 2]) {
        if (j + lenB > subs.length) break
        const Bw = subs.slice(j, j + lenB)
        const ub = Bw.flatMap((x) => x.units)
        let i = j
        let matched = false
        while (i > 0) {
          let found = null
          for (const lenA of clauseMode ? [1] : [1, 2]) {
            if (i - lenA < 0) break
            const Aw = subs.slice(i - lenA, i)
            if (Aw.some((x) => x.u.some((w) => marked.has(w.i)))) break
            const kind = retakeKind(Aw.flatMap((x) => x.units), ub, { gapSec: Bw[0].start - Aw[Aw.length - 1].end })
            if (kind && (!clauseMode || kind === 'false-start')) {
              found = { Aw, kind, lenA }
              break
            }
          }
          if (!found) break
          const ws = found.Aw.flatMap((x) => x.u)
          for (const w of ws) marked.add(w.i)
          out.push({ kind: found.kind, words: ws.map((w) => w.i), text: textOfWords(ws), keptText: textOfWords(Bw.flatMap((x) => x.u)) })
          matched = true
          i -= found.lenA
        }
        if (matched) break
      }
    }
  }
  scan(splitUtterances(words), false)
  const live = words.map((w) => (marked.has(w.i) ? { ...w, removed: true } : w))
  scan(splitUtterances(live, { clauses: true }), true)
  return out
}

// a lone syllable between pauses that is not a word people say on its own is a slip the recogniser spelled as a
// random character (呃 heard as 文 / 火 …); these one-character words stay
const ZH_STANDALONE_OK = new Set([...'好对是行啊哦喂嗨哈来走停等看听说不没错吧呢吗呀唉哎欸诶嗯呃一二三四五六七八九十零两谢请快慢有无可'])

export function detectFragments(words) {
  const out = []
  words.forEach((w, k) => {
    if (w.punct || w.removed) return
    if (!(w.lang === 'zh' || w.lang === 'yue') || [...w.norm].length !== 1 || !CJK_ONLY_RE.test(w.norm)) return
    if (ZH_STANDALONE_OK.has(w.norm)) return
    let prev = null
    for (let j = k - 1; j >= 0; j--) if (!words[j].punct) { prev = words[j]; break }
    let next = null
    for (let j = k + 1; j < words.length; j++) if (!words[j].punct) { next = words[j]; break }
    const before = prev ? w.onset - prev.end : Infinity
    const after = next ? next.onset - w.end : Infinity
    if (before >= 0.3 && after >= 0.3 && w.end - w.onset <= 0.6) out.push({ kind: 'fragment', words: [k], text: w.text })
  })
  return out
}

/* -------------------------------------------------------------------------------------------- planning */

const r3 = (x) => Math.round(x * 1000) / 1000
const itemId = (kind, start) => `${kind}@${Math.round(start * 100)}`

function snapFrame(t, fps) {
  return fps > 0 ? Math.round(t * fps) / fps : t
}

/**
 * Plan the rough cut. Returns `{ keep:[{start,end}], removals:[{id,kind,label,start,end,text,applied}], words,
 * sourceDurationSec, outputDurationSec, stats, options }` (seconds on the source timeline; keep ranges on the frame grid).
 *
 * overrides: `{ restore: [removalId…], cutWords: [[fromWordIdx, toWordIdx]…] }`
 */
export function planRoughCut(transcript, options = {}, overrides = {}) {
  const o = { ...ROUGH_CUT_DEFAULTS, ...Object.fromEntries(Object.entries(options || {}).filter(([, v]) => v !== undefined && v !== null)) }
  const fps = Number(o.fps) > 0 ? Number(o.fps) : 0
  // source length: the probed file length when known (the transcript only covers the audio track)
  const duration = Math.max(0, Number(o.sourceDurationSec) || (Number(transcript?.durationSec) || 0) + (Number(o.offsetSec) || 0))
  const { tokens, energy } = buildTimedTokens(transcript, { offsetSec: Number(o.offsetSec) || 0 })
  const words = groupWords(tokens)
  const restore = new Set(Array.isArray(overrides?.restore) ? overrides.restore.map(String) : [])
  const removals = []

  // 1. word-level removals
  const candidates = []
  if (o.cutRetakes) candidates.push(...detectRetakes(words))
  if (o.cutStutters) candidates.push(...detectStutters(words))
  if (o.cutFillers) candidates.push(...detectFillers(words), ...detectFragments(words))
  for (const range of Array.isArray(overrides?.cutWords) ? overrides.cutWords : []) {
    const a = Math.max(0, Math.min(words.length - 1, Number(range?.[0])))
    const b = Math.max(a, Math.min(words.length - 1, Number(range?.[1] ?? range?.[0])))
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const idx = []
    for (let k = a; k <= b; k++) if (!words[k].punct) idx.push(k)
    if (idx.length) candidates.push({ kind: 'manual', words: idx, text: idx.map((k) => words[k].text).join('') })
  }
  const removedBy = new Map()
  for (const c of candidates) {
    const ws = c.words.filter((k) => !removedBy.has(k))
    if (!ws.length) continue
    const start = words[ws[0]].onset
    const end = words[ws[ws.length - 1]].end
    const id = itemId(c.kind, start)
    const applied = !restore.has(id)
    removals.push({ id, kind: c.kind, label: REMOVAL_KINDS[c.kind] || c.kind, start: r3(start), end: r3(end), text: c.text, keptText: c.keptText || '', words: [ws[0], ws[ws.length - 1]], applied })
    if (applied) for (const k of ws) removedBy.set(k, id)
  }
  for (const w of words) w.removed = removedBy.has(w.i)

  // 2. speech islands from the kept words; a removed word between two kept words always forces a cut
  const kept = words.filter((w) => !w.punct && !w.removed)
  const islands = []
  for (const w of kept) {
    const last = islands[islands.length - 1]
    if (last) {
      const between = words.slice(last.lastWord + 1, w.i).some((x) => !x.punct && x.removed)
      const gap = w.onset - last.b
      if (!between && (gap <= o.maxPauseSec || !o.cutPauses)) {
        last.b = Math.max(last.b, w.end)
        last.lastWord = w.i
        continue
      }
    }
    islands.push({ a: w.onset, b: w.end, firstWord: w.i, lastWord: w.i })
  }

  const keep = []
  if (islands.length) {
    const headStart = Math.max(0, islands[0].a - o.headPadSec)
    const headId = itemId('head', 0)
    const firstStart = headStart > 0.3 && !restore.has(headId) ? headStart : 0
    // the reported 开头空白 ends where the first (even removed) word starts — a removed first take is its own item
    const firstAny = words.find((w) => !w.punct)
    const headEnd = Math.min(headStart, firstAny ? Math.max(0, firstAny.onset - 0.05) : headStart)
    if (headStart > 0.3 && headEnd > 0.05) removals.push({ id: headId, kind: 'head', label: REMOVAL_KINDS.head, start: 0, end: r3(headEnd), text: '', applied: firstStart > 0 })
    let curA = firstStart
    for (let k = 0; k < islands.length; k++) {
      const I = islands[k]
      const J = islands[k + 1]
      if (!J) {
        const tailEnd = Math.min(duration || I.b + o.tailPadSec, I.b + o.tailPadSec)
        const tailId = itemId('tail', tailEnd)
        const cutTail = duration > 0 && duration - tailEnd > 0.3
        const endAt = cutTail && !restore.has(tailId) ? tailEnd : duration || tailEnd
        if (cutTail) removals.push({ id: tailId, kind: 'tail', label: REMOVAL_KINDS.tail, start: r3(tailEnd), end: r3(duration), text: '', applied: !restore.has(tailId) })
        keep.push({ start: curA, end: endAt })
        break
      }
      const gap = J.a - I.b
      const removedBetween = words.slice(I.lastWord + 1, J.firstWord).filter((x) => !x.punct && x.removed)
      const removedSpeech = removedBetween.reduce((acc, x) => acc + Math.max(0, x.end - x.onset), 0)
      const kind = removedBetween.length ? 'joined' : 'pause'
      // pause kept at the join: the speaker's own silence around a removed word (capped), or keepPauseSec
      const P = kind === 'joined' ? Math.min(o.keepPauseSec, Math.max(0.1, Math.min(0.5, gap - removedSpeech))) : o.keepPauseSec
      let cutA = I.b + Math.min(Math.max(0.06, P * 0.55), gap / 2)
      let cutB = J.a - Math.min(Math.max(0.05, P * 0.45), gap / 2)
      const pauseId = itemId('pause', I.b)
      // a long "silence" that is really sound without words (cough / bump / laughter) is reported (and kept) as noise
      let noisy = false
      if (kind === 'pause' && energy.has) {
        let loudFrames = 0
        let frames = 0
        for (let f = energy.frameAt(cutA); f <= energy.frameAt(cutB); f++) {
          frames++
          if (energy.loud(f)) loudFrames++
        }
        noisy = frames > 0 && loudFrames / frames > 0.35 && loudFrames * energy.hopSec >= 0.25
      }
      const gapKind = noisy ? 'noise' : 'pause'
      if (kind === 'pause' && (restore.has(pauseId) || (noisy && !o.cutNoise))) {
        removals.push({ id: pauseId, kind: gapKind, label: REMOVAL_KINDS[gapKind], start: r3(cutA), end: r3(cutB), text: '', applied: false })
        continue // keep the whole gap
      }
      if (cutB - cutA < 0.04) continue // nothing worth cutting
      // place both cut points in the quietest 10 ms nearby (never into the kept speech)
      cutA = energy.quietest(cutA, I.b + 0.03, Math.min(cutA + 0.04, cutB - 0.02))
      cutB = energy.quietest(cutB, Math.max(cutB - 0.04, cutA + 0.02), J.a - 0.02)
      keep.push({ start: curA, end: cutA })
      curA = cutB
      if (kind === 'pause') removals.push({ id: pauseId, kind: gapKind, label: REMOVAL_KINDS[gapKind], start: r3(cutA), end: r3(cutB), text: '', applied: true })
    }
  }

  // 3. frame grid + merge
  const grid = []
  for (const r of keep) {
    let a = snapFrame(r.start, fps)
    let b = snapFrame(r.end, fps)
    if (duration > 0) b = Math.min(b, fps > 0 ? Math.floor(duration * fps) / fps : duration)
    if (b - a < (fps > 0 ? 1 / fps : 0.02) - 1e-9) continue
    const last = grid[grid.length - 1]
    if (last && a <= last.end + 1e-6) last.end = Math.max(last.end, b)
    else grid.push({ start: a, end: b })
  }
  const keepOut = grid.map((r) => ({ start: r3(r.start), end: r3(r.end) }))
  // whole frames on the grid (the rendered file has exactly this many); seconds otherwise
  const outputFrames = fps > 0 ? keepFrames(keepOut, fps).reduce((acc, r) => acc + (r.ef - r.sf), 0) : 0
  const outputDurationSec = fps > 0 ? r3(outputFrames / fps) : r3(keepOut.reduce((acc, r) => acc + (r.end - r.start), 0))

  // 4. stats per kind (removed time attributed to the reason that caused each gap)
  const stats = { sourceDurationSec: r3(duration), outputDurationSec, savedSec: r3(Math.max(0, duration - outputDurationSec)), cuts: Math.max(0, keepOut.length - 1), byKind: {} }
  for (const r of removals) {
    if (!r.applied) continue
    const s = (stats.byKind[r.kind] = stats.byKind[r.kind] || { count: 0, sec: 0 })
    s.count++
    s.sec = r3(s.sec + Math.max(0, r.end - r.start))
  }
  removals.sort((a, b) => a.start - b.start)
  return {
    version: 1,
    options: { ...o, fps },
    energyThresholdDb: energy.thr,
    keep: keepOut,
    removals,
    words: words.map((w) => ({ i: w.i, text: w.text, onset: r3(w.onset), end: r3(w.end), punct: w.punct || undefined, strong: w.strong || undefined, space: w.space || undefined, removed: w.removed || undefined, removedBy: removedBy.get(w.i), lang: w.lang })),
    sourceDurationSec: r3(duration),
    outputDurationSec,
    outputFrames,
    stats,
  }
}

/* -------------------------------------------------------------------------------------------- time mapping */

/** Map a source-time position to the cut timeline (null when it falls inside a removed part). */
export function makeTimeMapper(keep, fps = 0) {
  // on a frame grid the ranges are exact frame times (the stored ranges are rounded to milliseconds)
  const ranges =
    Number(fps) > 0
      ? keepFrames(keep, fps).map((r) => ({ start: r.sf / fps, end: r.ef / fps }))
      : (Array.isArray(keep) ? keep : []).map((r) => ({ start: Number(r.start), end: Number(r.end) }))
  const offsets = []
  let acc = 0
  for (const r of ranges) {
    offsets.push(acc)
    acc += r.end - r.start
  }
  const total = acc
  const map = (t, { clamp = false } = {}) => {
    for (let k = 0; k < ranges.length; k++) {
      const r = ranges[k]
      if (t >= r.start - 1e-6 && t <= r.end + 1e-6) return offsets[k] + Math.max(0, Math.min(r.end, t) - r.start)
      if (clamp && t < r.start) return offsets[k]
    }
    return clamp ? total : null
  }
  return { map, total, ranges, offsets }
}

/* -------------------------------------------------------------------------------------------- captions */

const PUNCT_RUN_RE = /[，。！？；：、,.!?;:…—]{2,}/g
const STRONG_RANK = (c) => ('。！？.!?…'.includes(c) ? 2 : '；;'.includes(c) ? 1 : 0)

/**
 * Tidy the punctuation left around removed words: a run of marks becomes its strongest one (。。 / ，。 → 。), and no
 * mark starts the text.
 */
export function tidyPunctuation(text) {
  return String(text || '')
    .replace(PUNCT_RUN_RE, (run) => [...run].reduce((best, c) => (STRONG_RANK(c) > STRONG_RANK(best) ? c : best), run[0]))
    .replace(/^[\s，。！？；：、,.!?;:…—]+/, '')
}

const joinWordTexts = (ws) =>
  tidyPunctuation(
    ws
      .map((w, k) => {
        if (k === 0) return w.text
        if (w.punct) return w.text
        const prev = ws[k - 1]
        const latinJoin = /[A-Za-z0-9]$/.test(prev.text) || (prev.punct && /[,.!?;:]$/.test(prev.text))
        return (w.space || (latinJoin && /^[A-Za-z0-9]/.test(w.text)) ? ' ' : '') + w.text
      })
      .join(''),
  )

/**
 * The text of a caption line as shown: Chinese caption convention (the plugin's other subtitles too) — a clause break
 * inside a line is a space, no punctuation at the edges, no quotes.
 */
export function captionDisplayText(lineWords) {
  return cleanSubtitleChunk(toSubtitleText(joinWordTexts(lineWords)).replace(/\s*[，、；：]\s*/g, ' ')).replace(/\s{2,}/g, ' ')
}

/**
 * Captions on the cut timeline from the kept words: lines never exceed `maxLineWidth` display columns (11 portrait /
 * 13 square / 16 landscape), break at sentence ends, at pauses ≥ gapBreakSec and preferably at commas; every line
 * carries per-word timing (`words[{ text, startSec, endSec }]`) for word-by-word highlighting.
 */
export function buildCaptions(plan, { maxLineWidth = 16, gapBreakSec = 0.5, minLineSec = 0.7, fps = 30 } = {}) {
  const mapper = makeTimeMapper(plan?.keep, Number(plan?.options?.fps) || 0)
  const maxW = Math.max(6, Math.min(30, Number(maxLineWidth) || 16))
  const f = Number(fps) > 0 ? Number(fps) : 30
  // kept words in output time (a word whose middle falls into a cut is dropped)
  const ws = []
  for (const w of plan?.words || []) {
    if (w.removed) continue
    if (w.punct) {
      if (ws.length) ws.push({ ...w })
      continue
    }
    const mid = (w.onset + w.end) / 2
    if (mapper.map(mid) === null) continue
    const a = mapper.map(w.onset, { clamp: true })
    const b = mapper.map(w.end, { clamp: true })
    ws.push({ ...w, a, b: Math.max(b, a + 0.04) })
  }
  const lines = []
  let cur = []
  let lastBreakable = -1 // index in cur of the last comma
  // width of the line as it will be SHOWN (clause commas as spaces, no edge punctuation)
  const widthOf = (arr) => displayWidth(captionDisplayText(arr))
  const contentOf = (arr) => arr.filter((x) => !x.punct)
  const flush = () => {
    if (contentOf(cur).length) lines.push(cur)
    cur = []
    lastBreakable = -1
  }
  for (const w of ws) {
    if (w.punct) {
      cur.push(w)
      if (w.strong) flush()
      else if (WEAK_PUNCT.has(w.text[0])) lastBreakable = cur.length - 1
      continue
    }
    const content = contentOf(cur)
    if (content.length) {
      const prev = content[content.length - 1]
      if (w.a - prev.b >= gapBreakSec) flush()
      else if (widthOf([...cur, w]) > maxW) {
        // too wide: break at the last comma when its first part is a phrase and the rest still fits; else before w
        const head = lastBreakable >= 0 ? cur.slice(0, lastBreakable + 1) : []
        const rest = lastBreakable >= 0 ? cur.slice(lastBreakable + 1) : []
        if (head.length && widthOf(head) >= 2 && widthOf([...rest, w]) <= maxW) {
          cur = head
          flush()
          cur = rest
        } else flush()
      }
    }
    cur.push(w)
  }
  flush()
  // orphan guard: a 1–2 column last line of a sentence is glued to the line before when that still fits (+1 column),
  // else the line before hands over its last words so neither line is a stub
  for (let k = lines.length - 1; k > 0; k--) {
    const tail = contentOf(lines[k])
    const prev = lines[k - 1]
    const prevContent = contentOf(prev)
    const sameSentence = !prev.some((x) => x.punct && x.strong) && tail[0].a - prevContent[prevContent.length - 1].b < gapBreakSec
    if (!sameSentence || widthOf(tail) > 2) continue
    if (widthOf([...prev, ...lines[k]]) <= maxW + 1) {
      lines[k - 1] = [...prev, ...lines[k]]
      lines.splice(k, 1)
      continue
    }
    let moved = lines[k]
    let left = prev
    while (contentOf(left).length > 1 && widthOf(moved) < Math.min(4, maxW * 0.35)) {
      let cut = left.length - 1
      while (cut > 0 && left[cut].punct) cut--
      const next = [...left.slice(cut), ...moved]
      if (widthOf(next) > maxW) break
      moved = next
      left = left.slice(0, cut)
    }
    lines[k - 1] = left
    lines[k] = moved
  }
  const out = []
  lines.forEach((ln) => {
    const content = contentOf(ln)
    const text = captionDisplayText(ln)
    if (!text || !content.length) return
    out.push({
      text,
      startSec: Math.max(0, content[0].a - 0.05),
      endSec: content[content.length - 1].b + 0.2,
      words: content.map((w) => ({ text: w.text, startSec: r3(w.a), endSec: r3(w.b) })),
      wordRange: [content[0].i, content[content.length - 1].i],
    })
  })
  for (let k = 0; k < out.length; k++) {
    const next = out[k + 1]
    if (next) {
      if (next.startSec - out[k].endSec < 0.35) out[k].endSec = next.startSec
      out[k].endSec = Math.min(out[k].endSec, next.startSec)
      if (out[k].endSec - out[k].startSec < minLineSec) out[k].endSec = Math.min(next.startSec, out[k].startSec + minLineSec)
    } else {
      out[k].endSec = Math.min(mapper.total || out[k].endSec, Math.max(out[k].endSec, out[k].startSec + minLineSec))
    }
  }
  return out.map((c, k) => ({
    index: k + 1,
    text: c.text,
    startSec: r3(c.startSec),
    endSec: r3(Math.max(c.endSec, c.startSec + 0.1)),
    startFrame: Math.floor(c.startSec * f),
    endFrame: Math.max(Math.floor(c.startSec * f) + 1, Math.ceil(c.endSec * f)),
    words: c.words,
    wordRange: c.wordRange,
  }))
}

const srtTime = (sec) => {
  const ms = Math.max(0, Math.round(sec * 1000))
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
}

export function captionsToSrt(captions) {
  return (captions || []).map((c, k) => `${k + 1}\n${srtTime(c.startSec)} --> ${srtTime(c.endSec)}\n${c.text}\n`).join('\n')
}

/** Text of the cut (kept words) and of the source (all words), for the review panel / AI packaging prompts. */
export function planTexts(plan) {
  const all = (plan?.words || []).filter((w) => w)
  return {
    keptText: joinWordTexts(all.filter((w) => !w.removed)),
    sourceText: joinWordTexts(all),
  }
}

export function hashTranscript(transcript) {
  const h = createHash('sha1')
  h.update(String(transcript?.durationSec || 0))
  for (const s of transcript?.segments || []) h.update(`${s.start}|${s.end}|${s.text}`)
  return h.digest('hex').slice(0, 16)
}

/* -------------------------------------------------------------------------------------------- probing + render */

/**
 * Video / audio facts needed for cutting: frame rate, display size (rotation applied), audio start offset relative to
 * the file timeline (the ASR WAV starts at the first audio sample; trims use the file timeline).
 */
export async function probeCutSource(mediaPath) {
  const { ffprobe } = resolveBinaries()
  const res = await runCommandRedirected(
    ffprobe,
    ['-v', 'error', '-show_entries', 'format=duration,start_time:stream=index,codec_type,width,height,r_frame_rate,avg_frame_rate,start_time,sample_rate,channels:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', mediaPath],
    { timeoutMs: 30_000 },
  )
  let j = {}
  try {
    j = JSON.parse(res.stdout || '{}')
  } catch {}
  const streams = Array.isArray(j.streams) ? j.streams : []
  const v = streams.find((s) => s.codec_type === 'video' && Number(s.width) > 0)
  const a = streams.find((s) => s.codec_type === 'audio')
  const rate = (s) => {
    const m = /^(\d+)\/(\d+)$/.exec(String(s || ''))
    return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0
  }
  const fps = v ? rate(v.avg_frame_rate) || rate(v.r_frame_rate) : 0
  let rotation = 0
  if (v) {
    const sd = (Array.isArray(v.side_data_list) ? v.side_data_list : []).find((x) => x.rotation !== undefined)
    rotation = Number(sd?.rotation ?? v.tags?.rotate ?? 0) || 0
  }
  const turned = Math.abs(rotation) % 180 === 90
  const fileStart = Number(j.format?.start_time) || 0
  return {
    durationSec: Number(j.format?.duration) || 0,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    width: v ? Number(turned ? v.height : v.width) : 0,
    height: v ? Number(turned ? v.width : v.height) : 0,
    fps: fps > 0 && fps < 241 ? fps : 0,
    rotation,
    audioOffsetSec: a ? Math.max(0, (Number(a.start_time) || 0) - fileStart) : 0,
    audioSampleRate: a ? Number(a.sample_rate) || 0 : 0,
  }
}

/** Project frame rate for a source: keep 24 / 25 / 30, halve 48 / 50 / 60, else 30. */
export function chooseProjectFps(srcFps) {
  const f = Number(srcFps) || 0
  const near = (x) => Math.abs(f - x) < 0.6
  if (near(24) || near(23.976)) return 24
  if (near(25)) return 25
  if (near(30) || near(29.97)) return 30
  if (near(48)) return 24
  if (near(50)) return 25
  if (near(60) || near(59.94)) return 30
  return 30
}

/** Keep ranges as whole frame numbers `[{ sf, ef }]` (ef exclusive) on the `fps` grid. */
export function keepFrames(keep, fps) {
  const f = Number(fps) > 0 ? Number(fps) : 30
  return (Array.isArray(keep) ? keep : [])
    .map((r) => {
      const sf = Math.max(0, Math.round(Number(r.start) * f))
      return { sf, ef: Math.max(sf, Math.round(Number(r.end) * f)) }
    })
    .filter((r) => r.ef > r.sf)
}

/**
 * The cut as one filter graph. Frame-exact on every source: the video is first put on a constant `fps` grid (phones
 * record variable frame rate; the grid's time base is exactly 1/fps, so the frame-boundary times sf/fps and ef/fps
 * map to whole frame numbers with no rounding ambiguity) and each range keeps exactly frames sf … ef−1; the audio —
 * resampled to 48 kHz first — keeps exactly the matching samples (48000 / fps per frame), so every segment's picture
 * and sound have the same length and concat never pads.
 */
export function buildCutFilter(keep, { fadeSec = 0.008, fps = 30, hasVideo = true, enhance = true, width = 0, height = 0 } = {}) {
  const frames = keepFrames(keep, fps)
  const n = frames.length
  const parts = []
  const labels = []
  const t6 = (x) => Math.max(0, x).toFixed(6)
  if (hasVideo) parts.push(`[0:v]fps=${fps}${n > 1 ? `,split=${n}${frames.map((_, k) => `[vs${k}]`).join('')}` : '[vs0]'}`)
  parts.push(`[0:a]aresample=48000${n > 1 ? `,asplit=${n}${frames.map((_, k) => `[as${k}]`).join('')}` : '[as0]'}`)
  frames.forEach(({ sf, ef }, k) => {
    const d = (ef - sf) / fps
    const fd = Math.min(fadeSec, d / 4)
    if (hasVideo) {
      parts.push(`[vs${k}]trim=start=${t6(sf / fps)}:end=${t6(ef / fps)},setpts=PTS-STARTPTS[v${k}]`)
      labels.push(`[v${k}]`)
    }
    parts.push(`[as${k}]atrim=start=${t6(sf / fps)}:end=${t6(ef / fps)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${fd.toFixed(4)},afade=t=out:st=${Math.max(0, d - fd).toFixed(4)}:d=${fd.toFixed(4)}[a${k}]`)
    labels.push(`[a${k}]`)
  })
  if (hasVideo) {
    parts.push(`${labels.join('')}concat=n=${n}:v=1:a=1[vc][ac]`)
    const scale = width > 0 && height > 0 ? `,scale=${width}:${height}:flags=lanczos` : ''
    parts.push(`[vc]format=yuv420p${scale}[vo]`)
  } else {
    parts.push(`${labels.join('')}concat=n=${n}:v=0:a=1[ac]`)
  }
  // loudnorm works at 192 kHz internally: resample back to 48 kHz after it
  const voice = enhance ? 'highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11,' : ''
  parts.push(`[ac]${voice}aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo${hasVideo ? ',asplit=2[ao][aw]' : '[aw]'}`)
  return parts.join(';\n')
}

/** Bumped when the encoder settings change, so cached cuts are re-rendered once (2: one keyframe per second). */
export const ROUGH_CUT_ENCODE_VERSION = 2

/**
 * Render the cut: `outVideo` (H.264 CRF 18 + AAC 192k, constant `fps`, a keyframe every second so the studio preview
 * and the renderers can jump anywhere without decoding seconds of video) when the source has video, and always
 * `outWav` (48 kHz stereo PCM, same audio). Keep ranges must be on the `fps` grid (planRoughCut does that).
 */
export async function renderRoughCut({ sourcePath, keep, fps = 30, outVideo = '', outWav, fadeMs = 8, enhanceVoice = true, hasVideo = true, width = 0, height = 0, signal, onChild, onProgress }) {
  if (!Array.isArray(keep) || keep.length === 0) throw new Error('粗剪结果为空：没有可保留的片段')
  const { ffmpeg } = resolveBinaries()
  const work = join(REPO_ROOT, '.tmp', 'roughcut')
  mkdirSync(work, { recursive: true })
  const id = `${process.pid}-${Date.now()}`
  const scriptPath = join(work, `filter-${id}.txt`)
  const progressPath = join(work, `progress-${id}.txt`)
  const total = keepFrames(keep, fps).reduce((acc, r) => acc + (r.ef - r.sf), 0) / fps
  writeFileSync(scriptPath, buildCutFilter(keep, { fadeSec: Math.max(0.002, fadeMs / 1000), fps, hasVideo: hasVideo && Boolean(outVideo), enhance: enhanceVoice, width, height }), 'utf8')
  const args = ['-hide_banner', '-nostats', '-y', '-progress', progressPath, '-i', sourcePath, '-filter_complex_script', scriptPath]
  if (hasVideo && outVideo) {
    mkdirSync(dirname(outVideo), { recursive: true })
    args.push('-map', '[vo]', '-map', '[ao]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', String(Math.max(1, Math.round(fps))), '-r', String(fps), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', outVideo)
  }
  mkdirSync(dirname(outWav), { recursive: true })
  args.push('-map', '[aw]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', outWav)
  let timer = null
  if (onProgress) {
    timer = setInterval(() => {
      try {
        const txt = readFileSync(progressPath, 'utf8')
        const m = [...txt.matchAll(/out_time_ms=(\d+)/g)].pop()
        if (m && total > 0) onProgress({ progress: Math.min(99, Math.round((Number(m[1]) / 1e6 / total) * 100)), message: `正在剪辑 ${Math.round((Number(m[1]) / 1e6 / total) * 100)}%` })
      } catch {}
    }, 800)
  }
  try {
    const res = await runCommandRedirected(ffmpeg, args, { timeoutMs: Math.max(600_000, total * 4000), signal, onChild })
    if (res.code !== 0 || !existsSync(outWav) || (hasVideo && outVideo && !existsSync(outVideo))) {
      const tail = String(res.stderr || '').trim().split(/\r?\n/).slice(-4).join(' | ')
      throw new Error(`粗剪渲染失败：${tail || `FFmpeg 退出码 ${res.code}`}`)
    }
    return { video: hasVideo && outVideo ? outVideo : '', wav: outWav, durationSec: r3(total), segments: keep.length, bytes: hasVideo && outVideo ? statSync(outVideo).size : 0 }
  } finally {
    if (timer) clearInterval(timer)
    for (const p of [scriptPath, progressPath]) {
      try {
        rmSync(p, { force: true })
      } catch {}
    }
  }
}

export { joinWordTexts, coreOf }
