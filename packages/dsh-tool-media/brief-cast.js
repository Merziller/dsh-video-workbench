/**
 * Cast bible (人物设定) and storyboard segments (分镜段落) of an AI-polished brief.
 *
 * 「AI 润色」 (web workbench lib/polish-brief.js) writes these sections into the AI-only director notes:
 *
 *   ▍人物画风：扁平插画（全片统一）
 *   ▍人物设定（每个人物全片外观一致；分镜里写到的人物必须清楚地出现在画面上）：
 *   · 外卖骑手阿强｜城市打工人：30岁男性，偏瘦，短发；服装：黄色雨衣（#F2B705），头盔；招牌动作：看手机催单、冒雨骑行
 *   ▍分镜段落（共 8 段，约 34 镜，时间码按成片计）：
 *   第2段 0:08–0:20｜暴雨催单｜4 镜｜对应要点 2｜出镜：外卖骑手阿强
 *     画面：…
 *     动作：…｜镜头：…｜转场：…
 *     字幕：「…」 「…」｜音效：…
 *
 * Users may edit the text before 出片 (half-width separators, other bullets, shortened fields, deleted lines) and older
 * briefs have none of these sections, so the parser is tolerant: every field is optional and nothing throws.
 * Pure text in → plain data out (no file, network or model access).
 */

const SEP_RX = /[｜|]/
const COLON_RX = /[：:]/
const BULLET_RX = /^\s*(?:[·•・●○◦▪▫■□◆◇\-*+]|\d{1,2}[.、)）])\s*/
// a section header: "▍名称（说明）：…" (any 1–12 character name), or one of the sections this parser reads written
// without the ▍ marker at the start of a line (users edit the brief)
const MARKED_SECTION_RX = /^\s*[▍▌■◆●#*]+\s*([^：:（(\s]{1,12})\s*(?:[（(][^）)]*[）)])?\s*[：:]/
const PLAIN_SECTION_RX = /^(人物画风|人物设定|人物表|角色设定|角色表|演员表|出场人物|分镜段落)\s*(?:[（(][^）)]*[）)])?\s*[：:]/
const CAST_SECTION_RX = /^(人物设定|人物表|角色设定|角色表|演员表|出场人物)$/
const SEGMENT_SECTION_RX = /^(分镜段落|分镜|段落)$/
const SEGMENT_HEAD_RX = /^\s*(?:[▍■◆#*·•\-]\s*)?第\s*(\d{1,3})\s*段\s*(.*)$/
const NO_PEOPLE_NAME_RX = /^(?:无|无人物|无人|空镜|没有人物|无人出镜|none|null|n\/a|—|-)$/i
// generic words that must never become a short alias of a character ("城市打工人" ≠ every 工人)
const GENERIC_ALIAS = new Set(['工人', '人员', '大军', '士兵', '群众', '老板', '小哥', '大哥', '大姐', '同学', '老师', '先生', '女士', '主角', '角色', '人物', '路人', '大家', '我们', '他们', '朋友', '孩子', '男人', '女人', '少年', '少女', '老人', '青年', '骑手', '女工', '男工', '员工', '店员', '顾客', '用户', '观众', '演员', '英雄', '将军', '皇帝', '霸王'])

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const stripTail = (s) => clean(s).replace(/^[；;，,。\s]+|[；;，,。\s]+$/g, '')

/** m:ss / h:mm:ss / "8秒" / "8s" → seconds (NaN when unreadable). */
function clockSec(raw = '') {
  const s = clean(raw)
  const hms = s.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const ms = s.match(/^(\d{1,3}):(\d{1,2}(?:\.\d+)?)$/)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  const sec = s.match(/^(\d{1,4}(?:\.\d+)?)\s*(?:s|秒|sec)?$/i)
  return sec ? Number(sec[1]) : NaN
}

/** "0:00–0:08" / "0:08-0:20" / "8秒~20秒" anywhere in the text → { startSec, endSec } or null. */
function parseTimeRange(text = '') {
  const m = String(text).match(/(\d{1,2}:\d{1,2}(?::\d{1,2})?|\d{1,4}(?:\.\d+)?\s*(?:s|秒)?)\s*[–—\-~～至到]+\s*(\d{1,2}:\d{1,2}(?::\d{1,2})?|\d{1,4}(?:\.\d+)?\s*(?:s|秒)?)/i)
  if (!m) return null
  const a = clockSec(m[1])
  const b = clockSec(m[2])
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? { startSec: a, endSec: b, raw: m[0] } : null
}

/** Short aliases a brief name is called by in shot text: "外卖骑手阿强" → ["阿强"]. */
export function deriveCastAliases(name = '') {
  const n = clean(name).replace(/[「」『』《》"“”]/g, '')
  const out = []
  // "阿强（外卖骑手）" style: the part before the bracket is the name itself
  const bracket = n.match(/^([^（(]{1,12})[（(]/)
  if (bracket && bracket[1] !== n) out.push(clean(bracket[1]))
  const bare = n.replace(/[（(][^）)]*[）)]/g, '')
  if (bare.length >= 4 && /^[一-鿿]+$/.test(bare)) {
    const tail = bare.slice(-2)
    if (!GENERIC_ALIAS.has(tail)) out.push(tail)
  }
  return [...new Set(out.filter((a) => a && a !== n && a.length >= 2))]
}

/** One 人物设定 line → { name, role, appearance, costume, actions, aliases } (null when there is no name). */
function parseCastLine(line = '') {
  const body0 = String(line).replace(BULLET_RX, '').trim()
  if (!body0) return null
  const colonAt = body0.search(COLON_RX)
  const head = colonAt >= 0 ? body0.slice(0, colonAt) : body0
  const body = colonAt >= 0 ? body0.slice(colonAt + 1) : ''
  const headParts = head.split(SEP_RX).map(clean).filter(Boolean)
  let name = headParts[0] || ''
  let role = headParts.slice(1).join('｜')
  // "阿强（外卖骑手）" without a role column: the bracket is the role
  const br = name.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/)
  if (br && !role) {
    name = clean(br[1])
    role = clean(br[2])
  }
  name = name.replace(/[「」『』"“”]/g, '').slice(0, 24)
  if (!name || name.length > 24 || NO_PEOPLE_NAME_RX.test(name)) return null
  // labelled parts of the description: 服装 / 招牌动作 (shortened or renamed labels are accepted)
  const COSTUME_RX = /(?:^|[；;，,。\s])(?:服装|服饰|穿着|衣着|着装|装束)\s*[：:]/
  const ACTION_RX = /(?:^|[；;，,。\s])(?:招牌动作|标志动作|常见动作|动作)\s*[：:]/
  const cIdx = body.search(COSTUME_RX)
  const aIdx = body.search(ACTION_RX)
  const cut = (from, to) => body.slice(from, to < 0 ? undefined : to)
  const firstLabel = [cIdx, aIdx].filter((i) => i >= 0).sort((x, y) => x - y)[0]
  const appearance = stripTail(firstLabel === undefined ? body : body.slice(0, firstLabel))
  const afterLabel = (idx) => {
    const seg = body.slice(idx)
    const c = seg.search(COLON_RX)
    return c >= 0 ? idx + c + 1 : idx
  }
  let costume = ''
  let actionsText = ''
  if (cIdx >= 0) costume = stripTail(cut(afterLabel(cIdx), aIdx > cIdx ? aIdx : -1))
  if (aIdx >= 0) actionsText = stripTail(cut(afterLabel(aIdx), cIdx > aIdx ? cIdx : -1))
  const actions = actionsText
    .split(/[、，,；;/]+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, 6)
  return { name, role: clean(role).slice(0, 24), appearance: appearance.slice(0, 160), costume: costume.slice(0, 120), actions, aliases: deriveCastAliases(name) }
}

/** Map a name written in a segment's 出镜 list onto the cast bible (exact, alias, contained, shortened). */
export function matchBriefCastName(entry = '', cast = []) {
  const e = clean(entry).replace(/[「」『』"“”]/g, '')
  if (!e || NO_PEOPLE_NAME_RX.test(e)) return ''
  const exact = cast.find((c) => c.name === e || (c.aliases || []).includes(e))
  if (exact) return exact.name
  const named = cast.find((c) => (c.name.length >= 2 && e.includes(c.name)) || (c.aliases || []).some((a) => a.length >= 2 && e.includes(a)))
  if (named) return named.name
  const short = e.length >= 2 ? cast.find((c) => c.name.includes(e)) : null
  return short ? short.name : e.slice(0, 24)
}

/** Text items between 「」 (or the plain list when the user dropped the brackets). */
function quotedItems(text = '') {
  const q = [...String(text).matchAll(/[「『"“]([^」』"”]{1,40})[」』"”]/g)].map((m) => clean(m[1])).filter(Boolean)
  if (q.length) return q
  return String(text)
    .split(/[、，,；;\s]+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, 6)
}

/** Fields of one segment detail line ("画面：…" / "动作：…｜镜头：…｜转场：…" / "字幕：「…」｜音效：…"). */
function applySegmentDetail(seg, line = '') {
  for (const part of String(line).trim().split(SEP_RX)) {
    const m = part.match(/^\s*(画面|动作|镜头|转场|字幕|音效|文字)\s*[：:]\s*(.*)$/)
    if (!m) continue
    const v = clean(m[2])
    if (m[1] === '画面') seg.picture = v
    else if (m[1] === '动作') seg.action = v
    else if (m[1] === '镜头') seg.camera = v
    else if (m[1] === '转场') seg.transition = v
    else if (m[1] === '音效') seg.sound = v
    else seg.text = quotedItems(v)
  }
}

/** One 第N段 head line → segment (time range, title, shots, beats, 出镜 names). */
function parseSegmentHead(index, rest = '') {
  const seg = { index, startSec: NaN, endSec: NaN, title: '', shots: 0, beats: 0, cast: [], hasCastField: false, picture: '', action: '', camera: '', transition: '', text: [], sound: '' }
  const range = parseTimeRange(rest)
  if (range) {
    seg.startSec = range.startSec
    seg.endSec = range.endSec
  }
  for (const raw of String(rest).split(SEP_RX)) {
    let part = clean(raw)
    if (!part) continue
    if (range && part.includes(range.raw)) part = clean(part.replace(range.raw, ''))
    if (!part) continue
    const castM = part.match(/^(?:出镜|出场|人物|登场)\s*[：:]\s*(.*)$/)
    if (castM) {
      seg.hasCastField = true
      seg.cast = castM[1]
        .split(/[、，,；;/\s]+/)
        .map(clean)
        .filter((n) => n && !NO_PEOPLE_NAME_RX.test(n))
      continue
    }
    const shotsM = part.match(/(\d{1,3})\s*镜/)
    const beatsM = part.match(/每镜\s*(\d+(?:\.\d+)?)\s*拍/)
    if (shotsM || beatsM) {
      if (shotsM) seg.shots = Number(shotsM[1])
      if (beatsM) seg.beats = Number(beatsM[1])
      continue
    }
    if (/^对应要点/.test(part)) continue
    if (!seg.title) seg.title = part.slice(0, 30)
  }
  return seg
}

/**
 * Parse the 人物画风 / 人物设定 / 分镜段落 sections of a brief (or of any notes text). Missing sections give empty lists.
 * → { figureStyle, cast: [{ name, role, appearance, costume, actions, aliases }],
 *     segments: [{ startSec, endSec, title, shots, beats, cast: [names], picture, action, camera, transition, text, sound }] }
 */
export function parseBriefCast(text = '') {
  const out = { figureStyle: '', cast: [], segments: [] }
  const src = String(text || '')
  if (!src.trim()) return out
  let section = ''
  let seg = null
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.replace(/　/g, ' ')
    if (!line.trim()) continue
    const segHead = line.match(SEGMENT_HEAD_RX)
    if (segHead) {
      seg = parseSegmentHead(Number(segHead[1]), segHead[2])
      out.segments.push(seg)
      section = 'segments'
      continue
    }
    const head = line.match(MARKED_SECTION_RX) || line.match(PLAIN_SECTION_RX)
    if (head) {
      const key = head[1]
      seg = null
      const value = clean(line.slice(line.indexOf(head[0]) + head[0].length))
      if (key === '人物画风' || key === '画风') {
        out.figureStyle = value.replace(/[（(]\s*全片统一\s*[）)]\s*$/, '').replace(/[；;。]+$/, '').trim()
        section = ''
      } else if (CAST_SECTION_RX.test(key)) {
        section = 'cast'
        // "▍人物设定：阿强｜…" written on the header line itself
        if (value && !/^[（(]/.test(value)) {
          const c = parseCastLine(value)
          if (c && !out.cast.some((x) => x.name === c.name)) out.cast.push(c)
        }
      } else if (SEGMENT_SECTION_RX.test(key)) {
        section = 'segments'
      } else {
        section = ''
      }
      continue
    }
    if (section === 'cast') {
      if (!BULLET_RX.test(line) && !SEP_RX.test(line) && !COLON_RX.test(line)) continue
      const c = parseCastLine(line)
      if (c && !out.cast.some((x) => x.name === c.name)) out.cast.push(c)
      continue
    }
    if (section === 'segments' && seg) applySegmentDetail(seg, line)
  }
  out.cast = out.cast.slice(0, 8)
  // segment names → bible names; segments in story order with sane, increasing times
  for (const g of out.segments) {
    g.cast = [...new Set(g.cast.map((n) => matchBriefCastName(n, out.cast)).filter(Boolean))]
    // every bible member a segment's picture / action / subtitles names is on screen in it too
    const named = `${g.picture} ${g.action} ${g.text.join(' ')}`
    for (const c of out.cast) {
      if (g.cast.includes(c.name)) continue
      if ((c.name.length >= 2 && named.includes(c.name)) || c.aliases.some((a) => a.length >= 2 && named.includes(a))) g.cast.push(c.name)
    }
  }
  out.segments = out.segments.filter((g) => g.title || g.cast.length || Number.isFinite(g.startSec))
  let t = 0
  for (const g of out.segments) {
    if (!Number.isFinite(g.startSec) || g.startSec < t) g.startSec = t
    if (!Number.isFinite(g.endSec) || g.endSec <= g.startSec) g.endSec = g.startSec + Math.max(1, g.shots || 1) * 3
    t = g.endSec
    delete g.hasCastField
  }
  return out
}

/** "外貌；服装：…" look line of a bible entry (the coder and the image prompts read it). */
export function briefCastLook(entry = {}) {
  return [entry.appearance, entry.costume && `服装：${entry.costume}`, entry.actions?.length && `招牌动作：${entry.actions.join('、')}`].filter(Boolean).join('；').slice(0, 120)
}
