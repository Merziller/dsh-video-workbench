/**
 * 口播包装 (talking-head packaging) — the rules that decorate a 口播剪辑 without any model call:
 *   - keyword pops (关键词大字): numbers with units, ordinals (第一步), words after emphasis cues (关键是 / 记住),
 *     quoted terms and the topic words the speaker keeps repeating — placed on the exact time the word is said,
 *     never more often than one every few seconds
 *   - chapters (章节卡 + 进度条): lines that open with 第一 / 首先 / 接下来 / 最后 …
 *   - B-roll (按讲话内容插空镜): library clips whose name / description / recognised speech share words with what is
 *     being said; each gets its best quiet window from the footage index (no reuse until the library runs out)
 *   - packaging presets: colours / weights the Remotion talk kit renders with
 * All times are on the cut (output) timeline in seconds.
 */
import { pickSegment } from './footage-index.js'

export const TALK_PACK_PRESETS = Object.freeze({
  knowledge: { id: 'knowledge', label: '知识干货', accent: '#FFD54A', accent2: '#2EE6A6', ink: '#111111', panel: 'rgba(12,14,20,0.82)', text: '#FFFFFF', keywordStyle: 'card', radius: 14 },
  energetic: { id: 'energetic', label: '活力综艺', accent: '#FF4D6D', accent2: '#4DD0FF', ink: '#111111', panel: 'rgba(255,255,255,0.94)', text: '#111111', keywordStyle: 'sticker', radius: 18 },
  business: { id: 'business', label: '商务稳重', accent: '#4F8BFF', accent2: '#A7C4FF', ink: '#0B1220', panel: 'rgba(8,16,32,0.86)', text: '#FFFFFF', keywordStyle: 'bar', radius: 6 },
  warm: { id: 'warm', label: '温暖生活', accent: '#FF9F43', accent2: '#FFD8A8', ink: '#2B1A0E', panel: 'rgba(255,248,238,0.94)', text: '#2B1A0E', keywordStyle: 'card', radius: 22 },
  minimal: { id: 'minimal', label: '极简', accent: '#FFFFFF', accent2: '#BBBBBB', ink: '#000000', panel: 'rgba(0,0,0,0)', text: '#FFFFFF', keywordStyle: 'underline', radius: 0 },
})

export const TALK_PACK_DEFAULTS = Object.freeze({
  preset: 'knowledge',
  keywords: true,
  chapters: true,
  progressBar: true,
  broll: true,
  sfx: true,
  lowerThird: null, // { name, title }
  // the real captions under the speaker (off for a 大炮-style screen tutorial: voice + picture only)
  captions: true,
  // 卡通讲解员: a cartoon character from the library standing in a corner, moving with the voice
  // { assetId, corner: 'bl' | 'br', size: 's' | 'm' | 'l' } or null
  mascot: null,
  // 录屏讲解: the recording is a screen capture — no punch-in at the jump cuts (it would crop the interface)
  screen: false,
  keywordMinGapSec: 3.5,
  keywordEverySec: 5,
  brollMinGapSec: 6,
  brollEverySec: 10,
})

const r3 = (v) => Number(Number(v || 0).toFixed(3))
const CJK = /[㐀-鿿]/

const STOP = new Set(
  '我们 你们 他们 她们 它们 大家 自己 这个 那个 这些 那些 这样 那样 这种 那种 一个 一些 一下 一点 什么 怎么 为什么 因为 所以 但是 然后 如果 就是 还是 或者 而且 可以 可能 应该 需要 已经 现在 今天 时候 东西 问题 事情 方面 进行 我们的 你的 我的 他的 就会 没有 不是 还有 这里 那里 其实 非常 比较 特别 真的 一样 一直 一定 知道 觉得 感觉 看到 来说 的话 一起 这么 那么 怎样 the and for you that this with are was have what'.split(
    ' ',
  ),
)

let segmenter = null
function words(text) {
  try {
    segmenter = segmenter || new Intl.Segmenter('zh', { granularity: 'word' })
    return [...segmenter.segment(String(text || ''))].filter((s) => s.isWordLike).map((s) => s.segment)
  } catch {
    return String(text || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  }
}

const isContent = (w) => {
  const s = String(w || '').trim()
  if (!s || STOP.has(s.toLowerCase())) return false
  if (CJK.test(s)) return [...s].length >= 2
  return /[A-Za-z]/.test(s) && s.length >= 3
}

/** Where in a caption (by its timed words) a piece of text is said: start / end seconds, or null. */
export function locateInCaption(cap, text) {
  const ws = Array.isArray(cap?.words) ? cap.words : []
  const needle = String(text || '').replace(/\s+/g, '')
  if (!ws.length || !needle) return null
  let joined = ''
  const starts = []
  for (const w of ws) {
    starts.push(joined.length)
    joined += String(w.text || '').replace(/\s+/g, '')
  }
  const at = joined.indexOf(needle)
  if (at < 0) return null
  const end = at + needle.length
  let a = 0
  let b = ws.length - 1
  for (let k = 0; k < ws.length; k++) if (starts[k] <= at) a = k
  for (let k = ws.length - 1; k >= 0; k--) if (starts[k] < end) {
    b = k
    break
  }
  return { startSec: Number(ws[a].startSec), endSec: Number(ws[b].endSec) }
}

const NUM_RE = /(?:第[一二三四五六七八九十百千\d]+(?:步|点|个|条|章|节|种|招|名)|\d+(?:\.\d+)?\s*(?:%|％|倍|个|种|步|分钟|秒|小时|天|周|月|年|元|块|万|亿|岁|次|条|点|帧|张|K|k|G|MB|GB)|[一二三四五六七八九十两]+(?:倍|成|个步骤|种方法|个技巧|个方法|大原因))/g
const EMPH_RE = /(?:关键(?:是|在于)?|重点(?:是|在于)?|核心(?:是|在于)?|记住|一定要|千万(?:别|不要)?|最重要的(?:是)?|秘诀(?:是|就是)?|技巧(?:是|就是)?)/g
const QUOTE_RE = /[「“"『]([^」”"』]{2,12})[」”"』]/g

/**
 * Keyword pops on the cut timeline: [{ text, startSec, endSec, kind, line }]. Candidates are ranked
 * number > emphasis > quote > repeated topic word, then placed greedily with a minimum gap and an overall budget.
 */
export function extractKeywords(captions, { minGapSec = TALK_PACK_DEFAULTS.keywordMinGapSec, everySec = TALK_PACK_DEFAULTS.keywordEverySec, skipHeadSec = 1.0, totalSec = 0 } = {}) {
  const caps = (captions || []).filter((c) => c && String(c.text || '').trim())
  if (!caps.length) return []
  const total = Number(totalSec) || Number(caps[caps.length - 1].endSec) || 0
  const cands = []
  const push = (cap, text, kind, prio, line) => {
    const t = String(text || '').trim()
    if (!t || [...t].length > 12) return
    const loc = locateInCaption(cap, t)
    if (!loc) return
    cands.push({ text: t, kind, prio, startSec: loc.startSec, endSec: loc.endSec, line })
  }
  caps.forEach((cap, li) => {
    const txt = String(cap.text)
    for (const m of txt.matchAll(NUM_RE)) push(cap, m[0].replace(/\s+/g, ''), 'number', 4, li)
    for (const m of txt.matchAll(QUOTE_RE)) push(cap, m[1], 'quote', 2, li)
    for (const m of txt.matchAll(EMPH_RE)) {
      const after = txt.slice(m.index + m[0].length).replace(/^[\s，,：:是就]+/, '')
      const w = words(after).filter(isContent)
      if (w.length) push(cap, w.slice(0, CJK.test(w[0]) && [...w[0]].length <= 2 && w[1] ? 2 : 1).join(''), 'emphasis', 3, li)
    }
  })
  // topic words the speaker repeats (said in ≥ 2 lines, but not in most of them)
  const freq = new Map()
  caps.forEach((cap, li) => {
    for (const w of new Set(words(cap.text).filter(isContent))) {
      const e = freq.get(w) || { n: 0, first: li }
      e.n++
      freq.set(w, e)
    }
  })
  for (const [w, e] of freq) {
    if (e.n >= 2 && e.n <= Math.max(2, Math.ceil(caps.length * 0.4))) push(caps[e.first], w, 'repeat', 1 + Math.min(0.9, e.n / 10), e.first)
  }
  // rank, then place: no two pops closer than minGapSec, at most one per everySec overall
  const budget = Math.max(1, Math.floor(Math.max(total, 1) / Math.max(2, everySec)))
  const seen = new Set()
  const placed = []
  for (const c of cands.sort((a, b) => b.prio - a.prio || a.startSec - b.startSec)) {
    if (placed.length >= budget) break
    if (c.startSec < skipHeadSec || seen.has(c.text)) continue
    if (placed.some((p) => Math.abs(p.startSec - c.startSec) < minGapSec)) continue
    seen.add(c.text)
    placed.push(c)
  }
  return placed
    .sort((a, b) => a.startSec - b.startSec)
    .map((p, k, arr) => {
      const next = arr[k + 1]
      const end = Math.min(p.startSec + 2.4, next ? next.startSec - 0.15 : p.startSec + 2.4, total || Infinity)
      return { text: p.text, kind: p.kind, startSec: r3(Math.max(0, p.startSec - 0.08)), endSec: r3(Math.max(p.startSec + 1.2, end)), line: p.line }
    })
}

const CHAPTER_RE = /^(?:第[一二三四五六七八九十\d]+(?:步|点|个|部分|章|节|招)|首先|其次|再次|然后呢|接下来|下一步|最后|总结一下|总的来说|总结|最后一点)/

/** Chapters: [{ index, title, startSec }] — only when the talk really has ≥ 2 marked sections. */
export function detectChapters(captions, { minGapSec = 8 } = {}) {
  const caps = (captions || []).filter((c) => c && String(c.text || '').trim())
  const out = []
  for (const cap of caps) {
    const txt = String(cap.text).trim()
    if (!CHAPTER_RE.test(txt)) continue
    if (out.length && Number(cap.startSec) - out[out.length - 1].startSec < minGapSec) continue
    const title = txt.replace(/^[\s，,]+/, '').replace(/\s+/g, ' ')
    out.push({ index: out.length + 1, title: [...title].length > 14 ? `${[...title].slice(0, 14).join('')}…` : title, startSec: r3(Math.max(0, Number(cap.startSec) - 0.1)) })
  }
  return out.length >= 2 ? out : []
}

/** Words describing a library asset (file name, description, tags, recognised speech of its shots). */
export function assetVocabulary(item) {
  const name = String(item?.originalName || item?.name || '').replace(/\.[a-z0-9]+$/i, '')
  const bits = [name.replace(/[_\-.]+/g, ' '), item?.description || '', item?.visualSummary || '', ...(Array.isArray(item?.tags) ? item.tags : [])]
  const shots = Array.isArray(item?.footage?.shots) ? item.footage.shots : []
  for (const s of shots) if (s.speech) bits.push(s.speech)
  return new Set(words(bits.join(' ')).filter(isContent).map((w) => w.toLowerCase()))
}

/**
 * B-roll cutaways matched to what is said: [{ startSec, endSec, assetId, path, type, inSec?, outSec?, score, match }].
 * `library` = asset items (videos / images, the talk recording itself excluded by the caller).
 */
export function planBroll(captions, library, { minGapSec = TALK_PACK_DEFAULTS.brollMinGapSec, everySec = TALK_PACK_DEFAULTS.brollEverySec, totalSec = 0, skipHeadSec = 3, skipTailSec = 2, minScore = 1 } = {}) {
  const caps = (captions || []).filter((c) => c && String(c.text || '').trim())
  const lib = (library || []).filter((it) => it && (it.type === 'video' || it.type === 'image'))
  if (!caps.length || !lib.length) return []
  const total = Number(totalSec) || Number(caps[caps.length - 1].endSec) || 0
  const vocab = new Map(lib.map((it) => [it.id, assetVocabulary(it)]))
  const cands = []
  caps.forEach((cap, li) => {
    const said = new Set(words(cap.text).filter(isContent).map((w) => w.toLowerCase()))
    if (!said.size) return
    for (const it of lib) {
      const v = vocab.get(it.id)
      const hit = [...said].filter((w) => v.has(w))
      const score = hit.reduce((a, w) => a + ([...w].length >= 3 ? 1.3 : 1), 0)
      if (score >= minScore) cands.push({ li, cap, it, score, hit })
    }
  })
  const budget = Math.max(0, Math.floor(total / Math.max(4, everySec)))
  const used = new Set()
  const usedAssets = new Map()
  const placed = []
  for (const c of cands.sort((a, b) => b.score - a.score || a.cap.startSec - b.cap.startSec)) {
    if (placed.length >= budget) break
    const start = Number(c.cap.startSec)
    if (start < skipHeadSec || start > total - skipTailSec) continue
    if (placed.some((p) => Math.abs(p.startSec - start) < minGapSec)) continue
    const repeat = usedAssets.get(c.it.id) || 0
    if (repeat >= 2) continue
    const span = Math.max(1.8, Math.min(4, Number(c.cap.endSec) - start + 0.5))
    const end = Math.min(start + span, total - 0.3)
    if (end - start < 1.2) continue
    const entry = { startSec: r3(start), endSec: r3(end), assetId: c.it.id, path: c.it.editedPath || c.it.path, type: c.it.type, score: r3(c.score), match: c.hit.slice(0, 4), line: c.li }
    if (c.it.type === 'video') {
      const seg = pickSegment(c.it, end - start, { used, mode: 'quiet' })
      if (seg) Object.assign(entry, { inSec: seg.inSec, outSec: seg.outSec })
    }
    usedAssets.set(c.it.id, repeat + 1)
    placed.push(entry)
  }
  return placed.sort((a, b) => a.startSec - b.startSec)
}

/** Resolve packaging settings (defaults + user choices) into what the renderer needs. */
export const MASCOT_CORNERS = ['bl', 'br']
export const MASCOT_SIZES = { s: 0.26, m: 0.34, l: 0.44 } // character height as a share of the frame height

/** A valid 卡通讲解员 setting or null. */
// 「我的动漫形象」 presenter engines (dsh-tool-avatar/anime-engines.js PRESENTER_ENGINE_IDS)
export const MASCOT_ENGINES = ['sprite', 'tha3', 'runway', 'volc', 'vidu']

/**
 * The cartoon presenter setting: a library picture / loop (`assetId`) or a character from 「我的动漫形象」
 * (`characterId` + `engine` + optional cloud `mode`). `confirmedRmb` (cloud engines: the cost the user confirmed for
 * this run) passes through but is never stored with the project (storedMascotSetting).
 */
export function cleanMascotSetting(m) {
  if (!m || typeof m !== 'object') return null
  const corner = MASCOT_CORNERS.includes(m.corner) ? m.corner : 'bl'
  const size = Object.prototype.hasOwnProperty.call(MASCOT_SIZES, m.size) ? m.size : 'm'
  const characterId = String(m.characterId || '').trim()
  if (/^c-[a-z0-9][a-z0-9-]{3,46}$/.test(characterId)) {
    const out = { characterId, engine: MASCOT_ENGINES.includes(m.engine) ? m.engine : 'sprite', corner, size }
    const mode = String(m.mode || '').trim()
    if (/^[a-z0-9_-]{1,24}$/i.test(mode)) out.mode = mode
    const rmb = Number(m.confirmedRmb)
    if (Number.isFinite(rmb) && rmb >= 0 && rmb < 100000) out.confirmedRmb = Math.round(rmb * 100) / 100
    return out
  }
  if (!String(m.assetId || '').trim()) return null
  return { assetId: String(m.assetId).trim().slice(0, 80), corner, size }
}

/** The presenter setting as saved with the project: without the one-time cost confirmation. */
export function storedMascotSetting(m) {
  const c = cleanMascotSetting(m)
  if (!c) return null
  const { confirmedRmb, ...rest } = c
  void confirmedRmb
  return rest
}

export function resolveTalkPack(settings = {}) {
  const s = { ...TALK_PACK_DEFAULTS, ...(settings || {}) }
  const preset = TALK_PACK_PRESETS[s.preset] || TALK_PACK_PRESETS.knowledge
  const lt = s.lowerThird && typeof s.lowerThird === 'object' && String(s.lowerThird.name || '').trim() ? { name: String(s.lowerThird.name).trim().slice(0, 20), title: String(s.lowerThird.title || '').trim().slice(0, 30) } : null
  return { ...s, preset: preset.id, theme: preset, lowerThird: lt, captions: s.captions !== false, mascot: cleanMascotSetting(s.mascot), screen: Boolean(s.screen) }
}
