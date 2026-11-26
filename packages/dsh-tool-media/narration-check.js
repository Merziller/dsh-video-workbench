/**
 * @dsh-video/tool-media — 配音回听校验 (listen back to the AI narration)
 *
 * TTS engines sometimes skip or repeat words, babble a passage or misread a number, and nothing caught that before the
 * user watched the finished film. After the TTS of a production every new take is played through the optional local
 * speech recognition (speech-recognition.js: SenseVoice, offline; ONE model load for all takes; results cached by the
 * WAV's content hash, so a re-run is instant) and compared with the text it should say:
 *   - normalizeForCompare(): NFKC, punctuation / spaces dropped, Latin lower-cased, Chinese numerals → numbers
 *     (一万九千 → 19000, 三点五 → 3.5, 百分之三十 → 30%, 两 → 2, 二零二六 → 2026, 3万 → 30000, 1.9万亿 · 19000亿 →
 *     19000亿). The recogniser writes numbers as digits while the TTS text spells them out.
 *   - compareNarration(): edit-distance alignment of symbols (a CJK character, a Latin word or a whole number is one
 *     symbol) against the display text AND the spoken TTS text; the better match counts. A take fails on a missing or
 *     extra span of ≥ 3 characters, a different number, a long garbled stretch or a low similarity; single-character
 *     recognition noise (names, particles, homophones) never fails a take.
 *   - runNarrationCheck(): a failing take is re-synthesised once with the same settings and listened to again; the
 *     better take is kept. What still fails becomes a plain-Chinese warning, `output/narration-check.json` and an
 *     advisory line in the QA report (buildNarrationQaCheck). Advisory only: it never blocks or fails a production.
 * Off with `spec.narrationCheck === false` or `DSH_NARRATION_CHECK=0`. Skipped for music-only films (subtitle-mv),
 * placeholder audio, locked scenes and the user's own recorded voice. When the speech engine is missing, its automatic
 * install is started in the background (never waited for: the production goes on) and the check is skipped with one
 * log line; quietly skipped when the automatic install is switched off (DSH_ASR_AUTO_INSTALL=0) or cannot run now.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { createAbortError, loadEnv, readScriptJson, REPO_ROOT, toTtsText, writeScriptJson } from '../shared/index.js'
import { isBillingError } from './cloud-ledger.js'
import { readJsonSafe, writeJsonAtomic } from './safe-json-store.js'

export const NARRATION_CHECK_VERSION = 1
export const NARRATION_REPORT_REL = 'output/narration-check.json'
const LISTEN_CACHE_REL = 'audio/.narration-check/listen-cache.json'
const LISTEN_CACHE_MAX = 500

/* ------------------------------------------------------------------------------------------------ normalisation */

const CN_DIGIT = new Map(Object.entries({ 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 }))
const CN_SMALL_UNIT = new Map(Object.entries({ 十: 1, 拾: 1, 百: 2, 佰: 2, 千: 3, 仟: 3 }))
const CN_BIG_UNIT = new Map(Object.entries({ 万: 4, 萬: 4, 亿: 8, 億: 8 }))
// magnitude written after a number (3万 · 1.9万亿 · 5千 · 一点九万亿)
const MAG_SUFFIX = new Map(Object.entries({ 百: 2, 千: 3, 万: 4, 萬: 4, 亿: 8, 億: 8 }))
// a number right before one of these counts something (三个 · 十年 · 两倍): worth checking even when written in Chinese
const COUNT_UNITS = ['分钟', '小时', '公里', '平方', '年', '月', '日', '号', '天', '周', '秒', '岁', '个', '人', '位', '名', '次', '倍', '元', '块', '角', '度', '米', '里', '克', '斤', '吨', '条', '场', '项', '步', '级', '代', '辆', '张', '份', '本', '篇', '部', '集', '期', '章', '节', '台', '件', '种', '类', '家', '座', '所', '层', '楼', '届', '户', '万', '亿', '成', '折', '%']
const DASHES = new Set(['-', '~', '–', '—', '−', '〜'])
// longest text compared symbol by symbol (a scene's narration is far shorter; keeps the alignment table small)
const MAX_SYMBOLS = 1500

const isAsciiDigit = (c) => c >= '0' && c <= '9' && c.length === 1
const isCnNumChar = (c) => CN_DIGIT.has(c) || CN_SMALL_UNIT.has(c) || CN_BIG_UNIT.has(c)
const isLatinLetter = (c) => /^\p{Script=Latin}$/u.test(c)
const isWordChar = (c) => /^[\p{L}\p{N}]$/u.test(c)
const isCjk = (c) => /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(c)

// exact decimals { m: BigInt mantissa, s: scale } = m × 10^-s (no float rounding for 1.9万亿 and the like)
const decOf = (intDigits, fracDigits = '') => ({ m: BigInt(`${intDigits || '0'}${fracDigits}`), s: fracDigits.length })
function decShift(d, k) {
  if (k <= 0) return d
  if (k <= d.s) return { m: d.m, s: d.s - k }
  return { m: d.m * 10n ** BigInt(k - d.s), s: 0 }
}
function decTrim(d) {
  let { m, s } = d
  while (s > 0 && m % 10n === 0n) {
    m /= 10n
    s--
  }
  return { m, s }
}
function decToString(d) {
  const { m, s } = decTrim(d)
  const digits = m.toString()
  if (s === 0) return digits
  const padded = digits.padStart(s + 1, '0')
  return `${padded.slice(0, -s)}.${padded.slice(-s)}`
}
/** One spelling per value: plain digits below 10^8, else in 亿 (19000亿 · 3.5亿). */
function canonicalNumber(d) {
  const t = decTrim(d)
  const whole = t.s === 0 ? t.m : t.m / 10n ** BigInt(t.s)
  return whole >= 100000000n ? `${decToString({ m: t.m, s: t.s + 8 })}亿` : decToString(t)
}

/**
 * Chinese positional numeral → BigInt: 二百零六 → 206 · 一万九千亿 → 1900000000000 · 三万五 → 35000 · 一千五 → 1500 ·
 * 十五 → 15 · 千万 → 10000000. null when malformed.
 */
function parseCnPositional(run) {
  let yi = 0n
  let wan = 0n
  let section = 0n
  let digit = null
  let lastExp = -1
  let prevUnit = false // the previous character was a unit
  let zeroSeen = false // a 零 since the last unit (一千零五 is 1005, not 1500)
  let digitAfterUnit = false
  for (const ch of run) {
    if (CN_DIGIT.has(ch)) {
      const d = CN_DIGIT.get(ch)
      if (d === 0) {
        // 零 only holds a place inside positional numbers (两千零二十六)
        zeroSeen = true
        prevUnit = false
        continue
      }
      if (digit !== null) return null // two digits without a unit between them (一二十)
      digit = BigInt(d)
      digitAfterUnit = prevUnit && !zeroSeen
      prevUnit = false
    } else if (CN_SMALL_UNIT.has(ch)) {
      const e = CN_SMALL_UNIT.get(ch)
      section += (digit ?? 1n) * 10n ** BigInt(e)
      digit = null
      lastExp = e
      prevUnit = true
      zeroSeen = false
    } else if (CN_BIG_UNIT.has(ch)) {
      const e = CN_BIG_UNIT.get(ch)
      if (digit !== null) section += digit
      digit = null
      if (e === 4) {
        if (section === 0n) return null
        wan += section * 10000n
      } else {
        const v = wan + section
        if (v === 0n) return null
        yi = (yi + v) * 100000000n
        wan = 0n
      }
      section = 0n
      lastExp = e
      prevUnit = true
      zeroSeen = false
    } else {
      return null
    }
  }
  if (digit !== null) {
    // spoken short form: 三万五 = 35000, 一千五 = 1500, 两百五 = 250 (a bare digit right after 百 / 千 / 万 / 亿)
    section += digitAfterUnit && lastExp >= 2 ? digit * 10n ** BigInt(lastExp - 1) : digit
  }
  return yi + wan + section
}

/** Per code point NFKC + lower case, keeping each output character's span in the original string. */
function prepChars(text) {
  const out = []
  let pos = 0
  for (const cp of String(text ?? '')) {
    const from = pos
    pos += cp.length
    for (const c of cp.normalize('NFKC').toLowerCase()) out.push({ c, from, to: pos })
  }
  return out
}

/** A number starting at chars[i] (digits or Chinese numerals, decimals, magnitude, %, fractions) or null. */
function readNumberAt(chars, i) {
  const at = (k) => (k < chars.length ? chars[k].c : '')
  let k = i
  let value
  let origin
  let salient = false
  let decimal = false
  if (isAsciiDigit(at(k))) {
    origin = 'ascii'
    salient = true
    let int = ''
    while (isAsciiDigit(at(k))) int += at(k++)
    // thousands separators: 1,000,000
    while (at(k) === ',' && isAsciiDigit(at(k + 1)) && isAsciiDigit(at(k + 2)) && isAsciiDigit(at(k + 3)) && !isAsciiDigit(at(k + 4))) {
      int += at(k + 1) + at(k + 2) + at(k + 3)
      k += 4
    }
    let frac = ''
    if (at(k) === '.' && isAsciiDigit(at(k + 1))) {
      k++
      while (isAsciiDigit(at(k))) frac += at(k++)
    }
    decimal = Boolean(frac)
    value = decOf(int, frac)
  } else {
    origin = 'cn'
    let run = ''
    while (isCnNumChar(at(k))) run += at(k++)
    // 万一 / 万物 / 亿万: words, not numbers
    if (!run || CN_BIG_UNIT.has(run[0])) return null
    const chars = [...run]
    const hasUnit = chars.some((c) => CN_SMALL_UNIT.has(c) || CN_BIG_UNIT.has(c))
    let whole
    if (hasUnit) {
      whole = parseCnPositional(run)
      if (whole === null) return null
    } else {
      // digit by digit (二零二六 → 2026) or a single digit
      whole = BigInt(chars.map((c) => CN_DIGIT.get(c)).join(''))
    }
    let frac = ''
    if (at(k) === '点' && CN_DIGIT.has(at(k + 1)) && !chars.some((c) => CN_BIG_UNIT.has(c))) {
      k++
      while (CN_DIGIT.has(at(k))) frac += String(CN_DIGIT.get(at(k++)))
    }
    decimal = Boolean(frac)
    value = decOf(whole.toString(), frac)
    const hasDigit = chars.some((c) => CN_DIGIT.has(c))
    salient = decimal || (hasUnit ? hasDigit : chars.length >= 3)
  }
  // magnitude after a written number or a decimal: 3万 · 1.9万亿 · 5千 · 一点九万亿
  if (origin === 'ascii' || decimal) {
    let exp = 0
    let n = 0
    while (n < 3 && MAG_SUFFIX.has(at(k))) {
      exp += MAG_SUFFIX.get(at(k))
      k++
      n++
    }
    if (exp) value = decShift(value, exp)
  }
  let key = canonicalNumber(value)
  if (at(k) === '%' || at(k) === '‰') {
    key += at(k)
    k++
    salient = true
  } else if (at(k) === '/' && isAsciiDigit(at(k + 1))) {
    const den = readNumberAt(chars, k + 1)
    if (den) {
      key = `${key}/${den.key}`
      k = den.end
      salient = true
    }
  } else if (at(k) === '分' && at(k + 1) === '之' && (isAsciiDigit(at(k + 2)) || CN_DIGIT.has(at(k + 2)))) {
    // 三分之一 → 1/3 (the recogniser may write either)
    const num = readNumberAt(chars, k + 2)
    if (num) {
      key = `${num.key}/${key}`
      k = num.end
      salient = true
    }
  }
  if (!salient && origin === 'cn') salient = COUNT_UNITS.some((u) => chars.slice(k, k + u.length).map((x) => x.c).join('') === u)
  return { key, from: chars[i].from, to: chars[k - 1].to, end: k, origin, salient }
}

/**
 * Comparison symbols of a text: `{ kind: 'char' | 'word' | 'num', key, from, to, w, salient? }` — `from` / `to` are
 * offsets in the original text, `w` an estimate of how many spoken syllables the symbol stands for.
 */
export function tokenizeForCompare(text) {
  const chars = prepChars(text)
  const syms = []
  const at = (k) => (k < chars.length ? chars[k].c : '')
  const numSym = (num) => ({ kind: 'num', key: num.key, from: num.from, to: num.to, w: Math.max(1, Math.min(6, num.to - num.from)), salient: num.salient, origin: num.origin })
  let i = 0
  while (i < chars.length) {
    const c = at(i)
    // 百分之三十 → 30% · 千分之五 → 5‰
    if ((c === '百' || c === '千') && at(i + 1) === '分' && at(i + 2) === '之') {
      const num = readNumberAt(chars, i + 3)
      if (num && /^[\d.亿]+$/.test(num.key)) {
        syms.push(numSym({ ...num, key: `${num.key}${c === '百' ? '%' : '‰'}`, from: chars[i].from, salient: true }))
        i = num.end
        continue
      }
    }
    if (isAsciiDigit(c) || isCnNumChar(c)) {
      const num = readNumberAt(chars, i)
      if (num) {
        syms.push(numSym(num))
        i = num.end
        continue
      }
    }
    // 3-5 / 3~5 between two numbers is read 三到五
    if (DASHES.has(c) && syms.length && syms[syms.length - 1].kind === 'num') {
      let j = i + 1
      while (at(j) === ' ') j++
      if (isAsciiDigit(at(j)) || CN_DIGIT.has(at(j))) {
        syms.push({ kind: 'char', key: '到', from: chars[i].from, to: chars[i].to, w: 1 })
        i++
        continue
      }
    }
    if (isLatinLetter(c)) {
      let j = i
      let word = ''
      while (j < chars.length && isLatinLetter(at(j))) word += at(j++)
      syms.push({ kind: 'word', key: word, from: chars[i].from, to: chars[j - 1].to, w: Math.max(1, Math.min(4, Math.ceil(word.length / 3))) })
      i = j
      continue
    }
    if (isWordChar(c)) syms.push({ kind: 'char', key: c, from: chars[i].from, to: chars[i].to, w: 1, cjk: isCjk(c) })
    i++
  }
  return syms
}

/**
 * Comparison form of a text: NFKC, no punctuation / spaces, lower-case Latin, every number in one canonical spelling
 * (Chinese numerals, digits, 万 / 亿 multipliers, decimals, 百分之 → %). 「二零二六年」 and 「2026年」 give the same string.
 */
export function normalizeForCompare(text) {
  return tokenizeForCompare(text)
    .map((s) => s.key)
    .join('')
}

/* ------------------------------------------------------------------------------------------------ comparison */

/**
 * Edit-distance alignment of two symbol lists: ops `{ op: 'eq' | 'sub' | 'del' | 'ins', i, j, ni?, nj? }` in order.
 * A Latin word may also stand for 2–4 CJK characters on the other side at the cost of one substitution (the
 * recogniser writes an English term it hears inside Chinese speech as Chinese syllables: Remotion → 瑞摩逊).
 */
function alignSymbols(a, b) {
  const n = a.length
  const m = b.length
  const W = m + 1
  const d = new Uint32Array((n + 1) * W)
  const how = new Uint8Array((n + 1) * W) // 0 diagonal · 1 del · 2 ins · 10+k word of a ↔ k chars of b · 20+k the reverse
  for (let i = 1; i <= n; i++) {
    d[i * W] = i
    how[i * W] = 1
  }
  for (let j = 1; j <= m; j++) {
    d[j] = j
    how[j] = 2
  }
  for (let i = 1; i <= n; i++) {
    const sa = a[i - 1]
    for (let j = 1; j <= m; j++) {
      const sb = b[j - 1]
      let best = d[(i - 1) * W + j - 1] + (sa.key === sb.key ? 0 : 1)
      let h = 0
      const del = d[(i - 1) * W + j] + 1
      if (del < best) {
        best = del
        h = 1
      }
      const ins = d[i * W + j - 1] + 1
      if (ins < best) {
        best = ins
        h = 2
      }
      if (sa.kind === 'word' && sb.cjk) {
        for (let k = 2; k <= 4 && k <= j && b[j - k].cjk; k++) {
          const c = d[(i - 1) * W + j - k] + 1
          if (c < best) {
            best = c
            h = 10 + k
          }
        }
      }
      if (sb.kind === 'word' && sa.cjk) {
        for (let k = 2; k <= 4 && k <= i && a[i - k].cjk; k++) {
          const c = d[(i - k) * W + j - 1] + 1
          if (c < best) {
            best = c
            h = 20 + k
          }
        }
      }
      if (sa.kind === 'word' && sb.kind === 'word' && sa.key !== sb.key) {
        // the same term written with or without spaces (ChatGPT ↔ chat GPT, Three.js ↔ threejs): a match
        let cat = sb.key
        for (let k = 2; k <= 3 && k <= j && b[j - k].kind === 'word' && cat.length < sa.key.length; k++) {
          cat = b[j - k].key + cat
          if (cat === sa.key && d[(i - 1) * W + j - k] < best) {
            best = d[(i - 1) * W + j - k]
            h = 30 + k
          }
        }
        cat = sa.key
        for (let k = 2; k <= 3 && k <= i && a[i - k].kind === 'word' && cat.length < sb.key.length; k++) {
          cat = a[i - k].key + cat
          if (cat === sb.key && d[(i - k) * W + j - 1] < best) {
            best = d[(i - k) * W + j - 1]
            h = 40 + k
          }
        }
      }
      d[i * W + j] = best
      how[i * W + j] = h
    }
  }
  const ops = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const h = how[i * W + j]
    if (h === 0) {
      ops.push({ op: a[i - 1].key === b[j - 1].key ? 'eq' : 'sub', i: i - 1, j: j - 1 })
      i--
      j--
    } else if (h === 1) {
      ops.push({ op: 'del', i: i - 1, j })
      i--
    } else if (h === 2) {
      ops.push({ op: 'ins', i, j: j - 1 })
      j--
    } else if (h > 40) {
      const k = h - 40
      ops.push({ op: 'eq', i: i - k, j: j - 1, ni: k, nj: 1 })
      i -= k
      j--
    } else if (h > 30) {
      const k = h - 30
      ops.push({ op: 'eq', i: i - 1, j: j - k, ni: 1, nj: k })
      i--
      j -= k
    } else if (h > 20) {
      const k = h - 20
      ops.push({ op: 'sub', i: i - k, j: j - 1, ni: k, nj: 1 })
      i -= k
      j--
    } else {
      const k = h - 10
      ops.push({ op: 'sub', i: i - 1, j: j - k, ni: 1, nj: k })
      i--
      j -= k
    }
  }
  return ops.reverse()
}

const rangeOf = (start, count = 1) => Array.from({ length: count }, (_, k) => start + k)

/** Runs of differences; runs separated by a single matching symbol are one region (a stray match must not split a
 *  skipped clause into short pieces). */
function diffRegions(ops) {
  const runs = []
  let cur = null
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].op === 'eq') {
      if (cur) {
        runs.push(cur)
        cur = null
      }
      continue
    }
    if (!cur) cur = { start: k, end: k }
    cur.end = k
  }
  if (cur) runs.push(cur)
  const merged = []
  for (const r of runs) {
    const prev = merged[merged.length - 1]
    if (prev && r.start - prev.end === 2) prev.end = r.end
    else merged.push({ ...r })
  }
  return merged
}

const clip = (s, n = 28) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return Array.from(t).length > n ? `${Array.from(t).slice(0, n).join('')}…` : t
}
const sliceOf = (text, syms) => (syms.length ? String(text).slice(syms[0].from, syms[syms.length - 1].to) : '')
const keysOf = (syms) => syms.map((s) => s.key).join('')

/** Minimum similarity: 0.9 for ordinary sentences, looser for very short ones (a 1–2 symbol slip is noise there). */
export function similarityThreshold(expectedWeight) {
  const n = Math.max(1, Number(expectedWeight) || 1)
  return n >= 15 ? 0.9 : Math.max(0.6, 1 - 1.5 / n)
}

function compareOne(expectedText, heardText) {
  const E = tokenizeForCompare(expectedText).slice(0, MAX_SYMBOLS)
  const H = tokenizeForCompare(heardText).slice(0, MAX_SYMBOLS)
  const expectedW = E.reduce((a, s) => a + s.w, 0)
  const salientE = E.filter((s) => s.kind === 'num' && s.salient)
  const res = {
    pass: true,
    similarity: 1,
    threshold: similarityThreshold(expectedW),
    missing: [],
    extra: [],
    garbled: [],
    numbers: { expected: salientE.map((s) => s.key), heard: H.filter((s) => s.kind === 'num').map((s) => s.key), mismatched: [] },
    problems: [],
    expectedNorm: keysOf(E),
    heardNorm: keysOf(H),
  }
  if (E.length === 0) return res
  if (H.length === 0) {
    res.pass = false
    res.similarity = 0
    res.problems.push({ type: 'silent' })
    return res
  }
  const ops = alignSymbols(E, H)
  const sumW = (syms) => syms.reduce((acc, s) => acc + s.w, 0)
  const regions = diffRegions(ops).map((r) => {
    const regionOps = ops.slice(r.start, r.end + 1)
    const delSyms = regionOps.filter((o) => o.op === 'del').map((o) => E[o.i])
    const insSyms = regionOps.filter((o) => o.op === 'ins').map((o) => H[o.j])
    const eIdx = regionOps.filter((o) => o.op !== 'ins').flatMap((o) => rangeOf(o.i, o.ni || 1))
    const hIdx = regionOps.filter((o) => o.op !== 'del').flatMap((o) => rangeOf(o.j, o.nj || 1))
    let subW = 0
    let subErr = 0
    let latin = false
    for (const o of regionOps) {
      if (o.op !== 'sub') continue
      const es = rangeOf(o.i, o.ni || 1).map((x) => E[x])
      const hs = rangeOf(o.j, o.nj || 1).map((x) => H[x])
      const w = Math.max(sumW(es), sumW(hs))
      // an English term spelt differently or written as Chinese syllables is very likely the right sound
      const isLatin = es.some((s) => s.kind === 'word') || hs.some((s) => s.kind === 'word')
      if (isLatin) latin = true
      subW += w
      subErr += w * (isLatin ? 0.25 : 0.5)
    }
    return {
      regionOps,
      insSyms,
      eIdx,
      eSyms: eIdx.map((x) => E[x]),
      hSyms: hIdx.map((x) => H[x]),
      missingW: sumW(delSyms),
      extraW: sumW(insSyms),
      subW,
      subErr,
      latin,
    }
  })
  let errors = 0
  const spanProblems = []
  const inMissing = new Set()
  for (const g of regions) {
    // a stretch of ≥ 3 characters weighs fully; shorter slips and substitutions (often recognition noise) count half
    errors += (g.missingW >= 3 ? g.missingW : g.missingW * 0.5) + (g.extraW >= 3 ? g.extraW : g.extraW * 0.5) + g.subErr
    if (g.missingW >= 3) {
      const item = { text: clip(sliceOf(expectedText, g.eSyms)), weight: g.missingW }
      res.missing.push(item)
      spanProblems.push({ type: 'missing', text: item.text })
      for (const i of g.eIdx) inMissing.add(i)
    }
    if (g.extraW >= 3) {
      // the same words again right before / after → a repeat
      const insKeys = keysOf(g.insSyms)
      const firstE = g.regionOps.find((o) => o.op !== 'ins')?.i ?? g.regionOps[0].i
      const after = keysOf(E.slice(firstE, firstE + g.insSyms.length))
      const before = keysOf(E.slice(Math.max(0, firstE - g.insSyms.length), firstE))
      const repeated = insKeys === after || insKeys === before
      const item = { text: clip(sliceOf(heardText, g.hSyms.length ? g.hSyms : g.insSyms)), weight: g.extraW, repeated }
      res.extra.push(item)
      spanProblems.push({ type: repeated ? 'repeat' : 'extra', text: item.text })
    }
  }
  // number check: every salient number of the text must be heard as the same number at the same place
  const opOfE = new Map()
  for (const o of ops) if (o.op !== 'ins') for (const x of rangeOf(o.i, o.ni || 1)) opOfE.set(x, o)
  const numberProblems = []
  const wrongNumberIdx = new Set()
  for (const [idx, s] of E.entries()) {
    if (s.kind !== 'num' || !s.salient) continue
    const o = opOfE.get(idx)
    if (!o || o.op === 'eq') continue
    const h = o.op === 'sub' ? H[o.j] : null
    const mm = {
      expected: s.origin === 'ascii' ? sliceOf(expectedText, [s]) : s.key,
      heard: h ? (h.kind === 'num' && h.origin !== 'ascii' ? h.key : sliceOf(heardText, [h])) : null,
      expectedKey: s.key,
      heardKey: h ? h.key : null,
    }
    res.numbers.mismatched.push(mm)
    wrongNumberIdx.add(idx)
    // a number inside a reported missing stretch is already named by it
    if (!(o.op === 'del' && inMissing.has(idx))) numberProblems.push({ type: 'number', expected: mm.expected, heard: mm.heard })
  }
  const garbledProblems = []
  let wholeTakeDiffers = false
  for (const g of regions) {
    if (g.latin || g.subW < 5 || g.missingW >= 3 || g.extraW >= 3 || g.eIdx.some((i) => wrongNumberIdx.has(i))) continue
    const item = { expected: clip(sliceOf(expectedText, g.eSyms), 24), heard: clip(sliceOf(heardText, g.hSyms), 24) }
    res.garbled.push(item)
    // most of the take is something else (another scene's audio, a wrong text): say the take does not match instead
    if (sumW(g.eSyms) >= 0.6 * expectedW) wholeTakeDiffers = true
    else garbledProblems.push({ type: 'garbled', ...item })
  }
  res.problems.push(...numberProblems, ...spanProblems, ...garbledProblems)
  res.similarity = Math.max(0, Math.min(1, Number((1 - errors / Math.max(1, expectedW)).toFixed(3))))
  if (wholeTakeDiffers && res.problems.length === 0) res.problems.push({ type: 'low-similarity', similarity: res.similarity, heard: clip(heardText, 30) })
  if (res.similarity < res.threshold && res.problems.length === 0) {
    res.problems.push({ type: 'low-similarity', similarity: res.similarity, heard: clip(heardText, 30) })
  }
  res.pass = res.problems.length === 0 && res.numbers.mismatched.length === 0 && res.similarity >= res.threshold
  return res
}

const SEVERE = new Set(['silent', 'number', 'missing', 'extra', 'repeat', 'garbled'])

/** a better than b: passing > fewer severe problems > higher similarity. */
export function isBetterNarrationResult(a, b) {
  if (!b) return Boolean(a)
  if (!a) return false
  if (a.pass !== b.pass) return a.pass
  const sa = (a.problems || []).filter((p) => SEVERE.has(p.type)).length
  const sb = (b.problems || []).filter((p) => SEVERE.has(p.type)).length
  if (sa !== sb) return sa < sb
  return (a.similarity || 0) > (b.similarity || 0)
}

/**
 * Compare what a take should say with what the recogniser heard.
 * `expected`: the text, or several renderings of it (`[display, ttsText]` or `[{ label, text }]`) — the best match
 * counts. Returns `{ pass, similarity, threshold, missing[], extra[], garbled[], numbers{ expected, heard, mismatched },
 * problems[], comparedWith, expectedNorm, heardNorm }`.
 */
export function compareNarration(expected, heard) {
  const list = (Array.isArray(expected) ? expected : [expected])
    .map((c, k) => (c && typeof c === 'object' ? { label: c.label || `#${k}`, text: String(c.text || '') } : { label: k === 0 ? 'narration' : k === 1 ? 'ttsText' : `#${k}`, text: String(c ?? '') }))
    .filter((c) => c.text.trim())
  if (list.length === 0) list.push({ label: 'narration', text: '' })
  const seen = new Set()
  let best = null
  for (const c of list) {
    const norm = normalizeForCompare(c.text)
    if (seen.has(norm)) continue
    seen.add(norm)
    const r = { ...compareOne(c.text, String(heard ?? '')), comparedWith: c.label }
    if (!best || isBetterNarrationResult(r, best)) best = r
  }
  return best
}

/** Plain-Chinese sentences for a take's problems (`sceneNumber` = 第 N 幕). */
export function describeNarrationProblems(problems, sceneNumber) {
  const tag = Number.isFinite(Number(sceneNumber)) && Number(sceneNumber) > 0 ? `第 ${Number(sceneNumber)} 幕` : '这一幕'
  const out = []
  for (const p of Array.isArray(problems) ? problems : []) {
    if (p.type === 'silent') out.push(`${tag}配音里没有听到说话`)
    else if (p.type === 'number') out.push(p.heard ? `${tag}数字读错：应为 ${p.expected}，听到 ${p.heard}` : `${tag}数字可能漏读：应为 ${p.expected}，没有听到`)
    else if (p.type === 'missing') out.push(`${tag}配音可能漏读：“${p.text}”`)
    else if (p.type === 'repeat') out.push(`${tag}配音可能重复读了：“${p.text}”`)
    else if (p.type === 'extra') out.push(`${tag}配音可能多读了：“${p.text}”`)
    else if (p.type === 'garbled') out.push(`${tag}配音有一段可能读错或含糊：“${p.expected}”听起来像“${p.heard}”`)
    else if (p.type === 'low-similarity') out.push(`${tag}配音和文案对不上（只对上 ${Math.round((Number(p.similarity) || 0) * 100)}%），听到的是：“${p.heard}”`)
    else if (p.type === 'error') out.push(`${tag}配音没能回听：${p.text || '原因未知'}`)
  }
  return out
}

/* ------------------------------------------------------------------------------------------------ helpers */

/** True unless switched off for this run (`narrationCheck: false`) or globally (`DSH_NARRATION_CHECK=0`). */
export function isNarrationCheckEnabled(options = {}) {
  loadEnv()
  if (options && options.narrationCheck === false) return false
  const env = String(process.env.DSH_NARRATION_CHECK ?? '').trim().toLowerCase()
  return !['0', 'false', 'off', 'no'].includes(env)
}

/** The local engine knows Mandarin, Cantonese, English, Japanese and Korean: other narration is not listened to. */
export function isListenableText(text) {
  let cjk = 0
  let latin = 0
  let accented = 0
  let other = 0
  for (const c of String(text || '')) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(c)) cjk++
    else if (/[A-Za-z]/.test(c)) latin++
    else if (/\p{Script=Latin}/u.test(c)) {
      latin++
      accented++
    } else if (/\p{L}/u.test(c)) other++
  }
  const letters = cjk + latin + other
  if (!letters) return false
  if (other / letters > 0.2) return false
  // Spanish / French / German … narration (accented Latin letters): the recogniser would only produce noise
  if (latin / letters > 0.5 && accented / latin > 0.02) return false
  return true
}

function hashFile(abs) {
  return createHash('sha1').update(readFileSync(abs)).digest('hex')
}

const isLocked = (sc) => Boolean(sc && (sc.locked === true || sc.locked === 'true' || sc.locked === 1))
const audioAbsOf = (absDir, sc) => (sc?.audioFile ? (isAbsolute(sc.audioFile) ? sc.audioFile : resolve(absDir, sc.audioFile)) : '')

/** Why a scene's take is not listened to ('' = it is). */
function skipReason(absDir, sc) {
  if (!sc) return 'not-found'
  if (isLocked(sc)) return 'locked'
  if (sc.voiceSource === 'host' || /-host\.wav$/i.test(String(sc.audioFile || ''))) return 'own-voice'
  if (sc.voicePlaceholder || sc.voiceProvider === 'acoustic-cadence-synth') return 'placeholder'
  const abs = audioAbsOf(absDir, sc)
  if (!abs || !existsSync(abs)) return 'no-audio'
  const text = String(sc.narration || '').trim() || String(sc.ttsText || '').trim()
  if (tokenizeForCompare(text).length < 2) return 'no-text'
  if (!isListenableText(text)) return 'language'
  return ''
}

function expectedOf(sc) {
  const display = String(sc.narration || '').trim()
  const tts = String(sc.ttsText || '').trim() || (display ? toTtsText(display) : '')
  return [
    { label: 'narration', text: display },
    { label: 'ttsText', text: tts },
  ].filter((c) => c.text)
}

export function readNarrationCheckReport(projectDir) {
  if (!projectDir) return null
  const rep = readJsonSafe(join(resolve(projectDir), ...NARRATION_REPORT_REL.split('/')), null)
  return rep && typeof rep === 'object' && Array.isArray(rep.scenes) ? rep : null
}

function readListenCache(absDir) {
  const c = readJsonSafe(join(absDir, ...LISTEN_CACHE_REL.split('/')), null)
  return c && typeof c === 'object' && c.entries && typeof c.entries === 'object' ? c : { version: NARRATION_CHECK_VERSION, entries: {} }
}

function writeListenCache(absDir, cache) {
  const entries = Object.entries(cache.entries || {})
    .sort((x, y) => String(y[1]?.at || '').localeCompare(String(x[1]?.at || '')))
    .slice(0, LISTEN_CACHE_MAX)
  writeJsonAtomic(join(absDir, ...LISTEN_CACHE_REL.split('/')), { version: NARRATION_CHECK_VERSION, entries: Object.fromEntries(entries) })
}

/**
 * Listen to takes (`[{ id, path }]`) with one model load; a WAV heard before (same content hash, engine and
 * language) is answered from the project's cache. Returns Map id → `{ ok, heard, language, durationSec, hash, cached,
 * error? }` plus `stats`.
 */
async function listenToTakes(absDir, takes, { listen, engineTag, language, signal, onChild, onProgress }) {
  const cache = readListenCache(absDir)
  const out = new Map()
  const misses = []
  for (const t of takes) {
    const hash = hashFile(t.path)
    const hit = cache.entries[hash]
    if (hit && hit.v === NARRATION_CHECK_VERSION && hit.engine === engineTag && hit.lang === language && typeof hit.heard === 'string') {
      out.set(t.id, { ok: true, heard: hit.heard, language: hit.language || '', durationSec: hit.durationSec || 0, hash, cached: true })
    } else {
      misses.push({ ...t, hash })
    }
  }
  let stats = { loadMs: 0, decodeMs: 0, items: 0, cached: takes.length - misses.length }
  if (misses.length) {
    const res = await listen({ clips: misses.map((m) => ({ id: m.id, path: m.path })), language, signal, onChild, onProgress })
    stats = { ...stats, ...(res?.stats || {}), cached: takes.length - misses.length }
    const byId = new Map((res?.items || []).map((it) => [it.id, it]))
    const now = new Date().toISOString()
    for (const m of misses) {
      const it = byId.get(m.id)
      if (it && it.ok) {
        const heard = String(it.text || '')
        out.set(m.id, { ok: true, heard, language: it.language || '', durationSec: Number(it.durationSec) || 0, hash: m.hash, cached: false })
        cache.entries[m.hash] = { v: NARRATION_CHECK_VERSION, engine: engineTag, lang: language, heard, language: it.language || '', durationSec: Number(it.durationSec) || 0, at: now }
      } else {
        out.set(m.id, { ok: false, error: String(it?.error || '没有识别结果'), hash: m.hash, cached: false })
      }
    }
    try {
      writeListenCache(absDir, cache)
    } catch {}
  }
  return { results: out, stats }
}

// fields executeGenerateSpeech writes into a scene: restored when the first take is kept after a retry
const TAKE_FIELDS = ['narration', 'ttsText', 'ttsNarrationRef', 'subtitleText', 'subChunks', 'emotion', 'speechRate', 'voiceId', 'voiceName', 'voiceRefAudio', 'voiceMatchReason', 'audioFile', 'voiceLeadSec', 'tailSec', 'voiceDurationSec', 'voiceProvider', 'voicePlaceholder', 'durationSec', 'durationInFrames', 'subtitles']

function pickTakeFields(sc) {
  const out = {}
  for (const f of TAKE_FIELDS) if (Object.prototype.hasOwnProperty.call(sc, f)) out[f] = JSON.parse(JSON.stringify(sc[f]))
  return out
}

function restoreTakeFields(absDir, sceneId, saved) {
  const { data } = readScriptJson(absDir)
  const sc = (data.scenes || []).find((s) => s.id === sceneId)
  if (!sc) return
  for (const f of TAKE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(saved, f)) sc[f] = saved[f]
    else delete sc[f]
  }
  writeScriptJson(absDir, data)
}

const isAbort = (err, signal) => err?.name === 'AbortError' || Boolean(signal?.aborted)

/** What the first take of a re-dubbed scene said (also when the re-dub call itself failed). */
function firstTakeOf(e) {
  const t = e.take1 || { heardRes: e.heardRes, result: e.result }
  return { heard: t.heardRes?.ok ? t.heardRes.heard : '', similarity: t.result?.similarity ?? null, problems: t.result?.problems || [] }
}

/* ------------------------------------------------------------------------------------------------ the check */

/**
 * Listen to the new takes of a production and re-dub a failing one once. Advisory: never throws except an AbortError.
 *
 * - `takes`: `[{ sceneId, ttsArgs? }]` — the scenes synthesised in this run (script.json is read for their text / WAV)
 * - `resynthesize(take)`: re-run the same TTS call (e.g. `executeGenerateSpeech(take.ttsArgs)`); omit to only listen
 * - `enabled` / `narrationMode`: a run switch (spec.narrationCheck) and the film's narration mode
 * - `onLog(msg)`, `onWarn(msg)`, `onProgress(msg)`: plain-Chinese lines for the run log / task status
 * - `listen` / `asrStatus`: injectable recogniser (tests); default the local engine (speech-recognition.js)
 *
 * Writes `output/narration-check.json` (merged with still-valid entries of earlier runs) and returns
 * `{ ran, skipped?, checked, passed, flagged, retried, fixed, elapsedMs, scenes[], warnings[] }`.
 */
export async function runNarrationCheck({
  projectDir,
  takes = [],
  resynthesize = null,
  enabled = true,
  narrationMode = '',
  language = 'auto',
  signal,
  onChild,
  onLog,
  onWarn,
  onProgress,
  listen = null,
  asrStatus = null,
} = {}) {
  const t0 = Date.now()
  const done = (extra) => ({ ran: false, checked: 0, passed: 0, flagged: 0, retried: 0, fixed: 0, elapsedMs: Date.now() - t0, scenes: [], warnings: [], ...extra })
  if (!projectDir || !Array.isArray(takes) || takes.length === 0) return done({ skipped: 'nothing-new' })
  if (enabled === false || !isNarrationCheckEnabled()) return done({ skipped: 'disabled' })
  if (String(narrationMode || '') === 'subtitle-mv') return done({ skipped: 'music-only' })
  if (signal?.aborted) throw createAbortError()
  const absDir = resolve(projectDir)
  const log = (m) => {
    try {
      onLog?.(m)
    } catch {}
  }
  const warn = (m) => {
    try {
      ;(onWarn || onLog)?.(m)
    } catch {}
  }
  const progress = (m) => {
    try {
      onProgress?.(m)
    } catch {}
  }
  const tmpDir = join(REPO_ROOT, '.tmp', 'narration-check', `${process.pid}-${Date.now()}`)
  try {
    // which takes to listen to
    let script = readScriptJson(absDir).data
    const sceneList = Array.isArray(script.scenes) ? script.scenes : []
    const numberOf = (id) => sceneList.findIndex((s) => s.id === id) + 1
    const takeById = new Map()
    for (const t of takes) if (t && t.sceneId && !takeById.has(t.sceneId)) takeById.set(t.sceneId, t)
    const skipped = []
    const todo = []
    for (const [id, take] of takeById) {
      const sc = sceneList.find((s) => s.id === id)
      const why = skipReason(absDir, sc)
      if (why) skipped.push({ sceneId: id, reason: why })
      else todo.push({ id, take, path: audioAbsOf(absDir, sc) })
    }
    if (todo.length === 0) return done({ skipped: 'nothing-to-check', skippedScenes: skipped })

    // the recogniser: when it is missing its automatic install starts in the background (not waited for) and this
    // film is not listened to — the next one is
    let engineTag = 'injected'
    if (!listen) {
      const sr = await import('./speech-recognition.js')
      const st = asrStatus ? await asrStatus() : await sr.getAsrStatus()
      if (!st?.ready) {
        const install = asrStatus ? null : await sr.maybeStartAsrAutoInstall()
        if (install?.state === 'running') {
          log('ℹ 本地语音识别正在自动准备，准备好后出片会自动回听配音（这次先不回听，不影响出片）')
          return done({ skipped: 'asr-installing' })
        }
        return done({ skipped: 'asr-not-installed' })
      }
      engineTag = `sensevoice-${sr.ASR_RUNTIME?.version || ''}`
      listen = (args) => sr.transcribeClips({ ...args, tmpDir: join(tmpDir, 'pcm') })
    } else if (asrStatus) {
      const st = await asrStatus()
      if (!st?.ready) return done({ skipped: 'asr-not-installed' })
    }
    progress(`正在回听检查 ${todo.length} 幕配音（本地语音识别）...`)
    const first = await listenToTakes(absDir, todo.map((t) => ({ id: t.id, path: t.path })), { listen, engineTag, language, signal, onChild })
    if (signal?.aborted) throw createAbortError()

    script = readScriptJson(absDir).data
    const sceneNow = (id) => (script.scenes || []).find((s) => s.id === id)
    const entries = new Map()
    for (const t of todo) {
      const sc = sceneNow(t.id)
      const heardRes = first.results.get(t.id)
      const result = heardRes?.ok ? compareNarration(expectedOf(sc), heardRes.heard) : null
      entries.set(t.id, { take: t.take, path: t.path, sc, heardRes, result, take1: null, retried: false, retryError: '' })
    }

    // one retry for each failing take (same TTS settings), then listen to all retakes with one model load
    const failing = [...entries.entries()].filter(([, e]) => e.result && !e.result.pass)
    let billingStopped = false
    const retaken = []
    if (failing.length && typeof resynthesize === 'function') {
      mkdirSync(tmpDir, { recursive: true })
      for (const [id, e] of failing) {
        if (signal?.aborted) throw createAbortError()
        if (billingStopped) break
        const n = numberOf(id)
        progress(`第 ${n} 幕配音回听没通过，正在用同样的设置重新合成一次...`)
        const backup = join(tmpDir, `${String(id).replace(/[^\w.-]+/g, '_')}.take1.wav`)
        copyFileSync(e.path, backup)
        const saved = pickTakeFields(sceneNow(id) || {})
        e.retried = true
        try {
          await resynthesize(e.take)
          if (!existsSync(e.path)) throw new Error('重新合成没有生成音频文件')
          e.take1 = { backup, saved, result: e.result, heardRes: e.heardRes }
          retaken.push(id)
        } catch (err) {
          // whatever the failed (or stopped) call left behind: the first take goes back in place
          try {
            copyFileSync(backup, e.path)
            restoreTakeFields(absDir, id, saved)
          } catch {}
          if (isAbort(err, signal)) throw createAbortError()
          if (isBillingError(err)) billingStopped = true
          e.retryError = billingStopped ? '配音服务提示余额或额度不足' : String(err?.message || err).slice(0, 160)
        }
      }
    }
    let second = { results: new Map(), stats: {} }
    if (retaken.length) {
      progress(`正在回听重新合成的 ${retaken.length} 幕配音...`)
      script = readScriptJson(absDir).data
      second = await listenToTakes(absDir, retaken.map((id) => ({ id, path: entries.get(id).path })), { listen, engineTag, language, signal, onChild })
      if (signal?.aborted) throw createAbortError()
      for (const id of retaken) {
        const e = entries.get(id)
        const heardRes = second.results.get(id)
        const r2 = heardRes?.ok ? compareNarration(expectedOf(sceneNow(id) || e.sc), heardRes.heard) : null
        if (r2 && isBetterNarrationResult(r2, e.take1.result)) {
          e.result = r2
          e.heardRes = heardRes
          e.keptTake = 2
        } else if (r2 && !isBetterNarrationResult(e.take1.result, r2)) {
          // as good as the first: keep the new one (already in place)
          e.result = r2
          e.heardRes = heardRes
          e.keptTake = 2
        } else {
          copyFileSync(e.take1.backup, e.path)
          restoreTakeFields(absDir, id, e.take1.saved)
          e.keptTake = 1
        }
        e.retakeResult = r2
      }
    }

    // report entries
    script = readScriptJson(absDir).data
    const nowIso = new Date().toISOString()
    const sceneEntries = []
    const warnings = []
    let passed = 0
    let flagged = 0
    let fixed = 0
    for (const [id, e] of entries) {
      const sc = sceneNow(id) || e.sc
      const n = numberOf(id)
      const r = e.result
      const audioHash = existsSync(e.path) ? hashFile(e.path) : ''
      const problems = r ? r.problems : [{ type: 'error', text: clip(e.heardRes?.error || '识别失败', 80) }]
      const messages = describeNarrationProblems(problems, n)
      const ok = Boolean(r && r.pass)
      if (ok) passed++
      else if (r) flagged++
      if (ok && e.retried && e.keptTake === 2) fixed++
      sceneEntries.push({
        sceneId: id,
        number: n,
        title: sc?.title || '',
        audioFile: sc?.audioFile || '',
        audioHash,
        expected: String(sc?.narration || ''),
        ttsText: String(sc?.ttsText || ''),
        heard: e.heardRes?.ok ? e.heardRes.heard : '',
        heardLanguage: e.heardRes?.language || '',
        comparedWith: r?.comparedWith || '',
        similarity: r ? r.similarity : null,
        threshold: r ? Number(r.threshold.toFixed(3)) : null,
        pass: ok,
        checked: Boolean(r),
        problems,
        messages,
        numbers: r ? r.numbers : null,
        cached: Boolean(e.heardRes?.cached),
        retried: e.retried,
        ...(e.retried ? { keptTake: e.keptTake || 1, firstTake: firstTakeOf(e) } : {}),
        ...(e.retryError ? { retryError: e.retryError } : {}),
        checkedAt: nowIso,
      })
      if (r && !ok) {
        const tail = e.retried ? (e.retryError ? `（重新合成没成功：${e.retryError}）` : '（已自动重新合成一次，仍没读对，建议试听这一幕）') : ''
        warnings.push(`⚠ ${messages[0] || `第 ${n} 幕配音可能有问题`}${messages.length > 1 ? `；另有 ${messages.length - 1} 处` : ''}${tail}`)
      } else if (ok && e.retried && e.keptTake === 2) {
        const why = describeNarrationProblems(e.take1?.result?.problems || [], 0)[0]?.replace(/^这一幕/, '') || ''
        log(`🎧 第 ${n} 幕第一次的配音回听没通过${why ? `（${why}）` : ''}，已自动重新合成，第二次读对了`)
      }
    }

    // merge with still-valid entries of earlier runs (same scene, unchanged WAV)
    const prev = readNarrationCheckReport(absDir)
    const kept = []
    for (const old of prev?.scenes || []) {
      if (!old || entries.has(old.sceneId)) continue
      const sc = (script.scenes || []).find((s) => s.id === old.sceneId)
      const abs = audioAbsOf(absDir, sc)
      if (!sc || !abs || !existsSync(abs) || hashFile(abs) !== old.audioHash) continue
      const number = numberOf(old.sceneId)
      kept.push({ ...old, number, messages: describeNarrationProblems(old.problems, number) })
    }
    const allScenes = [...kept, ...sceneEntries].sort((a, b) => (a.number || 0) - (b.number || 0))
    const elapsedMs = Date.now() - t0
    const listenedCount = (first.stats.items || 0) + (second.stats.items || 0)
    const report = {
      version: NARRATION_CHECK_VERSION,
      checkedAt: nowIso,
      engine: engineTag,
      language,
      elapsedMs,
      timing: {
        loadMs: (first.stats.loadMs || 0) + (second.stats.loadMs || 0),
        decodeMs: (first.stats.decodeMs || 0) + (second.stats.decodeMs || 0),
        listened: listenedCount,
        cached: (first.stats.cached || 0) + (second.stats.cached || 0),
        secondsPerScene: Number((elapsedMs / 1000 / Math.max(1, entries.size)).toFixed(2)),
      },
      summary: {
        checked: sceneEntries.filter((s) => s.checked).length,
        passed,
        flagged,
        retried: sceneEntries.filter((s) => s.retried).length,
        fixedByRetry: fixed,
        skipped: skipped.length,
      },
      scenes: allScenes,
      skipped,
      warnings,
    }
    try {
      writeJsonAtomic(join(absDir, ...NARRATION_REPORT_REL.split('/')), report)
    } catch {}

    const sec = (elapsedMs / 1000).toFixed(1)
    const unreadable = sceneEntries.filter((s) => !s.checked).length
    log(
      `🎧 配音回听校验：${report.summary.checked} 幕已回听，${flagged ? `${flagged} 幕可能有问题` : '全部读对'}${fixed ? `（${fixed} 幕重新合成后读对）` : ''}${unreadable ? `，${unreadable} 幕没能回听` : ''}（用时 ${sec} 秒${report.timing.cached ? `，${report.timing.cached} 段用了上次的回听结果` : ''}）`,
    )
    for (const w of warnings.slice(0, 6)) warn(w)
    if (warnings.length > 6) warn(`⚠ 另有 ${warnings.length - 6} 幕配音可能有问题，详见 output/narration-check.json`)
    return { ran: true, checked: report.summary.checked, passed, flagged, retried: report.summary.retried, fixed, elapsedMs, scenes: sceneEntries, warnings, skippedScenes: skipped, reportPath: join(absDir, ...NARRATION_REPORT_REL.split('/')) }
  } catch (err) {
    if (isAbort(err, signal)) throw createAbortError()
    log(`ℹ 配音回听校验没有完成（不影响出片）：${String(err?.message || err).slice(0, 160)}`)
    return done({ skipped: 'error', error: String(err?.message || err) })
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

/* ------------------------------------------------------------------------------------------------ QA report */

/**
 * Advisory QA row from `output/narration-check.json`: only entries whose scene still plays the WAV that was listened
 * to count. Never `passed: false` — a take that may be wrong is a hint (`severity: 'warning'`). null when nothing of
 * the current film was listened to.
 */
export function buildNarrationQaCheck({ projectDir, script } = {}) {
  try {
    const report = readNarrationCheckReport(projectDir)
    if (!report) return null
    const absDir = resolve(projectDir)
    const scenes = Array.isArray(script?.scenes) ? script.scenes : []
    const current = []
    for (const [k, sc] of scenes.entries()) {
      const entry = report.scenes.find((e) => e && e.sceneId === sc.id && e.checked !== false)
      if (!entry || !entry.audioHash) continue
      const abs = audioAbsOf(absDir, sc)
      if (!abs || !existsSync(abs) || hashFile(abs) !== entry.audioHash) continue
      current.push({ entry, number: k + 1 })
    }
    if (current.length === 0) return null
    const flagged = current.filter((c) => !c.entry.pass)
    const retried = current.filter((c) => c.entry.retried).length
    const messages = flagged.map((c) => describeNarrationProblems(c.entry.problems, c.number)[0]).filter(Boolean)
    const name = '配音回听校验（AI 配音有没有读错）'
    if (!flagged.length) {
      return { name, passed: true, value: `${current.length} 幕已回听，全部读对${retried ? `（${retried} 幕自动重新合成过）` : ''}`, scenes: current.length, flagged: 0 }
    }
    return {
      name,
      passed: true,
      severity: 'warning',
      value: `${current.length} 幕已回听，${flagged.length} 幕可能读错：${messages.slice(0, 2).join('；')}${messages.length > 2 ? `；另有 ${messages.length - 2} 幕` : ''}（建议试听这些幕）`,
      details: messages,
      scenes: current.length,
      flagged: flagged.length,
    }
  } catch {
    return null
  }
}
