/**
 * 可填空模板 (fill-in templates) — use a plaza template the way people use a video template app: keep its shots, timing,
 * layouts, transitions and sound design, and only swap in your own pictures / clips, words and music.
 *
 *   describeTemplateSlots(templateId)   every blank of a template, with the template's own text as the example:
 *                                       per shot its words (title, the spoken / subtitle line, key words, the big
 *                                       on-screen words of the history stage, a window title) and its picture places
 *                                       (the template's picture shots, plus an optional "use my picture here" on the
 *                                       animated shots); for the film: title, music, banner character
 *   templateFillLibrary(projectDir)     the project's pictures, clips and songs that can go into the blanks
 *   fillTemplateIntoProject(...)        a fresh storyboard in the project: the template's look (style + palette, genre,
 *                                       pacing, subtitle style, audio profile, MOTION.md) and shots with the user's
 *                                       fills. A shot whose words were replaced gets all of its on-screen words from
 *                                       them (key words, stage headline / plaques …), never a mix with the template's.
 *                                       Empty picture places of the template take unused library media (best window of
 *                                       a long clip); the shots are cut to the chosen music's beats (or to a generated
 *                                       track at the template's tempo). No model call.
 *   suggestTemplateTexts(...)           optional: the configured model writes every text blank for a new topic, shot
 *                                       for shot in the template's rhythm (the user reviews them before filling)
 *
 * AI-coded templates ship no scene code: their shots render with the built-in layout that fits (picture shots → a
 * media layout, history-stage shots → the built-in diorama, others → kinetic type), so a filled template always renders
 * without a model. Voice (TTS templates) comes from 一键配音 afterwards; a pure-music template is done after filling.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  cleanSubtitleChunk,
  createAbortError,
  deriveVerbalSubtitleParts,
  normalizeNumeralsForDisplay,
  readScriptJson,
  stripMetaInstructions,
  writeScriptJson,
} from '../shared/index.js'
import { readAssets } from './asset-manager.js'
import { buildBeatGrid } from './audio-dsp.js'
import { analyzeAudioBeatStructure, choreographBeatSfxCues, chunkSubtitleText, quantizeScenesToBeatGrid } from './beat-analyzer.js'
import { ensureFootageWindows } from './footage-index.js'
import { buildRichHtmlVideo } from './html-generator.js'
import { callLlmChat, extractJsonFromLlmText } from './llm-client.js'
import { safeProjectSnapshot } from './project-history.js'
import { writeRemotionProjectFiles } from './remotion-generator.js'
import { applyPlazaTemplateToProject, getPlazaTemplate } from './template-plaza.js'

/** Built-in layouts that show pictures, and how many they show. */
const MEDIA_LAYOUTS = {
  'media-split-motion': 1,
  'mosaic-pulse-wall': 4,
  'card-fan-opener': 3,
  'app-focus-shot': 1,
  'compare-dual': 2,
  'split-wipe-compare': 2,
  'multi-window-trio': 3,
}
/** Every layout the built-in renderers draw (anything else — `freeform-stage`, an AI scene — is mapped onto one). */
const BUILTIN_LAYOUTS = new Set([
  ...Object.keys(MEDIA_LAYOUTS),
  '3d-stage-opener',
  'kinetic-impact',
  'radial-climax',
  'workflow-steps',
  'metric-dashboard',
  'svg-architecture-flow',
  'hud-telemetry-dashboard',
  'vibecoding-spring-stage',
  'narrative-diorama',
])
/** On-screen words of the built-in history stage (stageSpec) that can be replaced. */
const STAGE_TEXT = [
  { key: 'headline', label: '画面大字', max: 12 },
  { key: 'subheadline', label: '画面小字', max: 16 },
  { key: 'plaques', label: '牌匾 / 竹简上的字（用、分隔）', max: 48, list: true },
  { key: 'heroNum', label: '画面大数字', max: 8 },
  { key: 'heroUnit', label: '大数字后面的字', max: 6 },
]
/** Scene fields that belong to the template's own voice / files and never to the filled film. */
const DROP_SCENE_KEYS = [
  'audioFile',
  'masteredAudioFile',
  'ttsText',
  'ttsNarrationRef',
  'voiceDurationSec',
  'voiceLeadSec',
  'voiceMatchReason',
  'voiceRefAudio',
  'voiceProvider',
  'voiceMastering',
  'voiceName',
  'voiceCategory',
  'voiceCastBy',
  'voiceSource',
  'presenter',
  'poolMedia',
  'mediaPath',
  'assetPaths',
  'publicAssetFiles',
  'useBuiltinLayout',
  'beatCutAligned',
  'voicePlaceholder',
  // the template's own picture files: the user's pictures go into `media` (the fan / pool layouts read it)
  'fanMedia',
]
/** Project settings that are the user's, not the template's. */
const KEEP_FROM_PROJECT = ['brandKit', 'brandMark', 'aiBadge', 'aiBadgeEnabled', 'aiBadgePosition', 'aiBadgeText', 'targetPlatform', 'lowSpecSafe', 'hardwarePolicy', 'voiceMode', 'defaultVoiceId', 'ttsEngine']
/** What applyPlazaTemplateToProject decided for the look. */
const KEEP_FROM_APPLY = ['genre', 'genreLabel', 'style', 'styleMode', 'styleProfile', 'styleAuto', 'theme', 'engine', 'narrationMode', 'pacingMode', 'subtitleStyle', 'referenceStyle', 'audioProfile', 'appliedPlazaTemplate']
/** The template's frame. */
const KEEP_FROM_TEMPLATE = ['width', 'height', 'fps', 'aspectRatio', 'quality', 'visual3dMode']

const VIDEO_RX = /\.(mp4|mov|m4v|webm|mkv|avi)$/i
const NOT_VISUAL_ROLES = new Set(['music', 'sfx', 'voice_clone', 'avatar_base', 'note'])
const NO_AUTO_ROLES = new Set(['host_video', 'avatar_base'])
const pad2 = (n) => String(n).padStart(2, '0')
const clip = (s, n) => String(s ?? '').trim().slice(0, n)
const r3 = (v) => Number(Number(v || 0).toFixed(3))
const SPLIT_LIST = /[、,，;；|｜\n]+/

function splitList(text, max = 6, len = 20) {
  const out = []
  for (const part of String(text || '').split(SPLIT_LIST)) {
    const t = clip(part, len)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

/** Clean display text of a line (same treatment the planner gives narration). */
function displayText(line) {
  return cleanSubtitleChunk(normalizeNumeralsForDisplay(stripMetaInstructions(line || ''))) || String(line || '').trim()
}

const CONNECTIVES = /[在和与及并而了着把被将向从对为是就都也又的之于以让给跟同到]/
/** A line without the spaces Chinese text gets around numbers and Latin words (「率 800 骑」 → 「率800骑」). */
const tight = (line) => String(line || '').replace(/(?<=[一-鿿\d])\s+(?=[一-鿿\d])/g, '').trim()

/**
 * Phrases of a line in reading order: its clauses (cut at punctuation), long clauses split at connective characters
 * (「少年岳飞在汤阴苦练枪法」 → 少年岳飞 / 汤阴苦练枪法). A piece longer than `maxLen` is left out — never cut mid-word.
 */
export function phrasesOf(line, maxLen = 8) {
  const out = []
  for (const clause of tight(line).split(/[，,。.!！?？;；:：、"“”'‘’（）()《》【】…—\n]+/)) {
    const c = clause.trim()
    if (c.length < 2) continue
    if (c.length <= maxLen) {
      out.push(c)
      continue
    }
    for (const piece of c.split(CONNECTIVES)) {
      const p = piece.trim()
      if (p.length >= 2 && p.length <= maxLen) out.push(p)
    }
  }
  return [...new Set(out)]
}

/**
 * Key words for a shot whose line was replaced: phrases of the new line (and its number, 「800骑」), as many and about
 * as long as the template's. Empty when the line has no short phrase — never a word cut in half.
 */
export function deriveHighlights(line, templateList = []) {
  const list = Array.isArray(templateList) ? templateList.filter(Boolean) : []
  const want = Math.max(1, Math.min(6, list.length || 2))
  const avg = list.length ? Math.round(list.reduce((a, h) => a + String(h).length, 0) / list.length) : 6
  const maxLen = Math.max(4, Math.min(10, avg + 3))
  const out = phrasesOf(line, maxLen)
  const num = numberFromLine(line)
  if (num?.unit && !out.some((p) => p.includes(num.num))) out.push(`${num.num}${num.unit}`)
  return out.slice(0, want)
}

/** A short on-screen title from a line: the whole line when it is short (two title lines), else its first phrase. */
export function titleFromLine(line, maxLen = 10) {
  const whole = tight(line).replace(/[，,。.!！?？;；:：、…—\s]+$/, '')
  if (whole && whole.replace(/\s+/g, '').length <= maxLen + 4 && !/[，,。!！?？;；]/.test(whole)) return whole
  return phrasesOf(line, maxLen)[0] || whole.slice(0, maxLen)
}

/** The banner character of a history film from its words (same table as the built-in diorama). */
export function inferBannerChar(text) {
  const hay = String(text || '')
  if (/霍去病|卫青|汉武|大汉|冠军侯|骠骑|河西|祁连|漠北|封狼居胥|长安|匈奴/.test(hay)) return '汉'
  if (/秦始皇|嬴政|大秦|咸阳|函谷|六国|长城|兵马俑|郡县|阿房/.test(hay)) return '秦'
  if (/项羽|霸王|江东|乌江|垓下|巨鹿|鸿门|楚军|西楚/.test(hay)) return '楚'
  if (/蜀汉|诸葛|刘备|关羽|张飞|赵云/.test(hay)) return '蜀'
  if (/曹操|曹魏|官渡|许昌/.test(hay)) return '魏'
  if (/孙权|东吴|赤壁/.test(hay)) return '吴'
  if (/李世民|大唐|盛唐|玄奘|安史/.test(hay)) return '唐'
  if (/岳飞|大宋|汴京|临安/.test(hay)) return '宋'
  if (/朱元璋|大明|锦衣卫|郑和/.test(hay)) return '明'
  return ''
}

/** A number and its unit from a line (「率 800 骑出击」 → 800 / 骑), for the big-number stage. */
const NUMBER_UNIT_RX = /(\d+(?:\.\d+)?)\s*(万|亿|千|百)?(年|岁|骑|人|天|次|个|里|米|公里|小时|分钟|秒|元|倍|%|％|座|城|场|战|名|位|代|项|条|家|部)?/
function numberFromLine(line) {
  const m = NUMBER_UNIT_RX.exec(String(line || ''))
  return m ? { num: `${m[1]}${m[2] || ''}`, unit: m[3] || '' } : null
}

/** Sub-shot texts follow the new line: its chunks spread over the sub-shots by time. */
function retextCuts(cuts, chunks, durFrames) {
  if (!Array.isArray(cuts) || !cuts.length) return cuts
  const total = Math.max(1, Number(durFrames) || 1)
  const parts = chunks.length ? chunks : ['']
  return cuts.map((c) => {
    if (!c || typeof c !== 'object' || c.text === undefined) return c
    const mid = (Number(c.start || 0) + Number(c.end || c.start || 0)) / 2
    const k = Math.min(parts.length - 1, Math.max(0, Math.floor((mid / total) * parts.length)))
    return { ...c, text: parts[k] }
  })
}

/** Layouts that draw their pictures as still images (a clip there cannot be decoded). */
const IMAGE_ONLY_LAYOUTS = new Set(['card-fan-opener', 'split-wipe-compare'])

/**
 * The picture places of a template shot: { kind: 'image' (the layout shows stills) | 'visual' (picture or clip),
 * prefer: what the template had there ('video' | 'image' | '') }. A card fan gets as many cards as the template's
 * fan (3–5).
 */
function sceneMediaPlaces(sc) {
  const imageOnly = IMAGE_ONLY_LAYOUTS.has(sc?.layout)
  const typeOf = (m) => (m?.type === 'video' || VIDEO_RX.test(String(m?.path || '')) ? 'video' : m?.type === 'image' || /\.(png|jpe?g|webp|gif|bmp)$/i.test(String(m?.path || '')) ? 'image' : '')
  const own = (Array.isArray(sc?.media) ? sc.media : []).map(typeOf)
  const fan = sc?.layout === 'card-fan-opener' ? (Array.isArray(sc.fanMedia) ? sc.fanMedia.map(typeOf) : []) : []
  const want = Math.max(MEDIA_LAYOUTS[sc?.layout] || 0, Math.min(5, fan.length))
  const prefs = own.length >= want ? own : [...own, ...fan.slice(0, want - own.length), ...Array.from({ length: Math.max(0, want - own.length - fan.length) }, () => '')]
  return prefs.map((prefer) => ({ kind: imageOnly ? 'image' : 'visual', prefer: imageOnly ? 'image' : prefer }))
}

function mostCommon(values) {
  const counts = new Map()
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1)
  let best = ''
  let n = 0
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c]
  return best
}

/** The blanks of a plaza template (see module comment). */
export function describeTemplateSlots(templateId) {
  const { template, script } = getPlazaTemplate(templateId)
  const scenesIn = Array.isArray(script?.scenes) ? script.scenes : []
  if (!scenesIn.length) throw new Error(`模板「${template.name}」没有附带分镜，不能填空套用；可以用「一键套用同款」只借用它的风格和节奏。`)
  const narrationMode = script.narrationMode || template.narrationMode || 'tts'
  const lineLabel = narrationMode === 'subtitle-mv' ? '字幕（画面上的文字）' : '旁白（配音念的话，也是字幕）'
  const scenes = scenesIn.map((sc, i) => {
    const n = i + 1
    const key = `s${pad2(n)}`
    const durationSec = r3(Number(sc.durationSec) || Number(sc.durationInFrames) / (Number(script.fps) || 30) || 0)
    const slots = []
    const text = (id, label, example, maxLength, extra = {}) => slots.push({ id: `${key}.${id}`, kind: 'text', label, example: clip(example, 200), maxLength, ...extra })
    const lineExample = sc.narration || sc.subtitleText || sc.subtitleLine || ''
    text('title', '标题', sc.title, 24)
    text('line', lineLabel, lineExample, Math.min(200, Math.max(40, Math.round(String(lineExample).length * 2.5))), { multiline: true, suggestChars: String(lineExample).length })
    if (Array.isArray(sc.highlights) && sc.highlights.length) text('highlights', '重点词（用、分隔）', sc.highlights.map((h) => clip(h, 20)).join('、'), 60, { list: true })
    const spec = sc.stageSpec && typeof sc.stageSpec === 'object' ? sc.stageSpec : null
    if (spec) {
      for (const f of STAGE_TEXT) {
        const v = spec[f.key]
        const has = f.list ? Array.isArray(v) && v.some(Boolean) : String(v ?? '').trim() !== ''
        if (has) text(`stage.${f.key}`, f.label, f.list ? v.map((x) => clip(x, 20)).join('、') : String(v), f.max, f.list ? { list: true } : {})
      }
    }
    if (String(sc.windowTitle || '').trim()) text('windowTitle', '窗口标题', sc.windowTitle, 40)
    const places = sceneMediaPlaces(sc)
    places.forEach((p, j) =>
      slots.push({
        id: `${key}.media.${j}`,
        kind: p.kind,
        prefer: p.prefer,
        required: true,
        label: `画面${places.length > 1 ? ` ${j + 1}` : ''}（${p.kind === 'image' ? '只能放图片' : p.prefer === 'video' ? '模板这里是视频，图片也可以' : '图片或视频'}）`,
        durationSec,
      }),
    )
    if (!places.length) slots.push({ id: `${key}.media.0`, kind: 'visual', prefer: '', required: false, label: '换成我的画面（可不填，不填就用模板动画）', durationSec })
    return { index: n, id: sc.id || key, title: clip(sc.title, 40), layout: sc.layout || '', stage: Boolean(spec), durationSec, slots }
  })
  const banner = mostCommon(scenesIn.map((sc) => String(sc?.stageSpec?.bannerChar || '').trim()))
  const filmSlots = [
    { id: 'film.title', kind: 'text', label: '片名', example: clip(script.displayTitle || script.title || template.name, 30), maxLength: 20 },
    { id: 'film.music', kind: 'music', label: '配乐' },
    ...(banner ? [{ id: 'film.bannerChar', kind: 'text', label: '旗帜上的字（一个字，如 汉、宋、唐）', example: banner, maxLength: 2 }] : []),
  ]
  const all = [...filmSlots, ...scenes.flatMap((s) => s.slots)]
  const tplTotal = Number(template.durationSec) || Number(script.totalDurationSec) || scenes.reduce((a, s) => a + s.durationSec, 0)
  return {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      description: template.description || '',
      engine: script.engine || template.engine || 'remotion',
      narrationMode,
      aspectRatio: script.aspectRatio || template.aspectRatio || '16:9',
      width: Number(script.width) || 0,
      height: Number(script.height) || 0,
      bpm: Number(script.bgm?.bpm) || Number(template.bpm) || 0,
      shotCount: scenes.length,
      durationSec: r3(tplTotal),
      aiCoded: script.authoringMode === 'ai-coded',
      stageShots: scenes.filter((s) => s.stage).length,
    },
    filmSlots,
    scenes,
    counts: {
      text: all.filter((s) => s.kind === 'text').length,
      media: all.filter((s) => s.kind !== 'text' && s.kind !== 'music' && s.required).length,
      optionalMedia: all.filter((s) => s.kind !== 'text' && s.kind !== 'music' && !s.required).length,
    },
  }
}

/** The project's media that can go into the blanks (pictures and clips, and songs for the music). */
export function templateFillLibrary(projectDir) {
  const manifest = readAssets(resolve(projectDir))
  const pick = (it) => ({
    id: it.id,
    name: it.originalName || it.name || it.id,
    type: it.type,
    role: it.role || '',
    path: it.editedPath || it.path,
    webPath: it.editedWebPath || it.webPath || '',
    thumb: it.thumb || '',
    durationSec: Number(it.durationSec) || 0,
    width: Number(it.editedWidth || it.width) || 0,
    height: Number(it.editedHeight || it.height) || 0,
  })
  const items = Array.isArray(manifest.items) ? manifest.items : []
  return {
    visuals: items.filter((it) => (it.type === 'image' || it.type === 'video') && !NOT_VISUAL_ROLES.has(it.role)).map(pick),
    music: items.filter((it) => it.role === 'music' || (it.type === 'audio' && it.role === 'bgm')).map(pick),
  }
}

function mediaEntry(asset, motion) {
  return {
    assetId: asset.id,
    path: asset.editedPath || asset.path,
    webPath: asset.editedWebPath || asset.webPath || '',
    type: asset.type,
    role: asset.role,
    width: Number(asset.editedWidth || asset.width || 0),
    height: Number(asset.editedHeight || asset.height || 0),
    motion,
  }
}

/** Known, cleaned fills: text clipped to the blank's length, picture / music blanks as asset ids. */
function cleanFills(fills, info) {
  const byId = new Map([...info.filmSlots, ...info.scenes.flatMap((s) => s.slots)].map((s) => [s.id, s]))
  const out = {}
  for (const [id, raw] of Object.entries(fills && typeof fills === 'object' ? fills : {})) {
    const slot = byId.get(id)
    if (!slot || typeof raw !== 'string') continue
    const v = raw.trim()
    if (!v) continue
    out[id] = slot.kind === 'text' ? v.slice(0, slot.maxLength || 200) : v
  }
  return out
}

/**
 * Put a template's storyboard into the project with the user's fills (see module comment). `fills` =
 * { 'film.title', 'film.music' (asset id | 'generate' | '' = first song of the library, else generated),
 * 'film.bannerChar', 'sNN.title', 'sNN.line', 'sNN.highlights', 'sNN.stage.headline' …, 'sNN.media.K' (asset id) }.
 * `autoFillMedia` (default true) gives the template's empty picture places unused library media of the right kind.
 */
export async function fillTemplateIntoProject({ projectDir, templateId, fills = {}, autoFillMedia = true, topic = '', signal, onProgress, onChild } = {}) {
  if (!projectDir) throw new Error('projectDir is required')
  const absDir = resolve(projectDir)
  if (!existsSync(join(absDir, 'script.json'))) throw new Error(`目标工程缺少 script.json: ${absDir}`)
  const checkAbort = () => {
    if (signal?.aborted) throw createAbortError()
  }
  const progress = (pct, message) => onProgress?.({ pct, message })
  const info = describeTemplateSlots(templateId)
  const f = cleanFills(fills, info)
  const filled = (id) => f[id] || ''
  const { template, script: tpl } = getPlazaTemplate(templateId)
  progress(5, `正在套用模板「${template.name}」…`)

  let prev = {}
  try {
    prev = readScriptJson(absDir).data || {}
  } catch {}
  safeProjectSnapshot(absDir, { label: 'template-fill:before', stage: 'template-fill', author: 'user', kind: 'checkpoint', note: `套用模板「${template.name}」前的工程` })
  // the template's look: style + palette, genre, pacing, subtitle style, audio profile, MOTION.md blueprint
  applyPlazaTemplateToProject({ projectDir: absDir, templateId, copyScenes: false })
  const applied = readScriptJson(absDir).data || {}
  checkAbort()

  const fps = Number(tpl.fps) > 0 ? Number(tpl.fps) : 30
  const portrait = Number(tpl.height) > Number(tpl.width)
  const genre = String(applied.genre || tpl.genre || '')
  const pictureLayout = /tutorial|saas|ui-/.test(genre) ? 'app-focus-shot' : 'media-split-motion'
  const lib = templateFillLibrary(absDir)
  const manifest = readAssets(absDir)
  const assetById = new Map((manifest.items || []).map((it) => [it.id, it]))
  const visualIds = new Set(lib.visuals.map((v) => v.id))
  // how often each library item is on screen (the user's own picks count too)
  const uses = new Map()
  for (const k of Object.keys(f)) if (/\.media\.\d+$/.test(k) && visualIds.has(f[k])) uses.set(f[k], (uses.get(f[k]) || 0) + 1)
  const autoPool = (manifest.items || []).filter((it) => visualIds.has(it.id) && !NO_AUTO_ROLES.has(it.role))
  // An empty picture place takes an unused item of the right kind (the film's orientation first). With fewer items
  // than places, items come back — least used first, never twice in one shot or in the shot before (a clip shows
  // another moment each time, see ensureFootageWindows; a picture moves differently).
  const autoPick = (slot, inShot, prevShot) => {
    const pool = autoPool.filter((it) => (slot.kind === 'visual' || it.type === slot.kind) && !inShot.has(it.id))
    if (!pool.length) return null
    const orient = (it) => (Number(it.height) > 0 && (Number(it.height) > Number(it.width)) === portrait ? 0 : 1)
    // unused first, not in the shot before, least used, what the template had there, the film's orientation
    const kindRank = (it) => (slot.prefer ? (it.type === slot.prefer ? 0 : 1) : it.type === 'video' ? 0 : 1)
    const rank = (it) => [(uses.get(it.id) || 0) > 0 ? 1 : 0, prevShot.has(it.id) ? 1 : 0, uses.get(it.id) || 0, kindRank(it), orient(it)]
    const best = pool
      .map((it, order) => ({ it, key: [...rank(it), order] }))
      .sort((a, b) => {
        for (let k = 0; k < a.key.length; k++) if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k]
        return 0
      })[0].it
    uses.set(best.id, (uses.get(best.id) || 0) + 1)
    return best
  }
  let prevShotIds = new Set()

  let filledText = 0
  let filledMedia = 0
  let autoFilledMedia = 0
  let emptyMedia = 0
  let changedShots = 0
  const overrides = {}
  const userWords = []
  const tplScenes = Array.isArray(tpl.scenes) ? tpl.scenes : []
  const lastIdx = tplScenes.length - 1
  const lineWidth = portrait ? 12 : 16
  const scenes = tplScenes.map((sc, i) => {
    const key = `s${pad2(i + 1)}`
    const slotInfo = info.scenes[i]
    const id = `tf-${pad2(i + 1)}`
    const next = { ...JSON.parse(JSON.stringify(sc)), id }
    for (const k of DROP_SCENE_KEYS) delete next[k]
    if (Array.isArray(next.subtitles)) next.subtitles = next.subtitles.map((u) => ({ ...u, sceneId: id }))
    // step pictures of the template that are not in this project; the template's file names in its prompt text
    const missing = (p) => !existsSync(isAbsolute(String(p)) ? String(p) : join(absDir, String(p)))
    if (Array.isArray(next.steps)) {
      next.steps = next.steps.map((st) => {
        if (!st || typeof st !== 'object' || !st.img || !missing(st.img)) return st
        const { img, ...rest } = st
        return rest
      })
    }
    if (typeof next.visualPrompt === 'string') next.visualPrompt = next.visualPrompt.replace(/\s*·?\s*(?:assets|public)\/[^\s,，;；]+/g, '').trim()
    next.voiceLocked = false
    const own = {}
    // ---- words
    const title = filled(`${key}.title`)
    const line = filled(`${key}.line`)
    const hl = filled(`${key}.highlights`)
    const stageFills = Object.fromEntries(STAGE_TEXT.map((s) => [s.key, filled(`${key}.stage.${s.key}`)]))
    const windowTitle = filled(`${key}.windowTitle`)
    const touched = Boolean(title || line || hl || windowTitle || Object.values(stageFills).some(Boolean))
    if (title) {
      next.title = title
      own.title = title
      filledText++
    } else if (line) {
      // a shot with new words shows no template title: a short one from its own line
      next.title = titleFromLine(line, 10)
    }
    if (line) {
      next.narration = line
      next.subtitleText = displayText(line)
      next.subChunks = deriveVerbalSubtitleParts(line, null, next.subtitleText, lineWidth)
      if (next.subtitleLine !== undefined) next.subtitleLine = next.subtitleText
      delete next.subtitles
      next.cuts = retextCuts(next.cuts, next.subChunks.flatMap((c) => chunkSubtitleText(String(c || ''))), Number(next.durationInFrames) || 0)
      own.narration = line
      filledText++
    }
    if (hl) {
      next.highlights = splitList(hl)
      own.highlights = next.highlights
      filledText++
    } else if (line && Array.isArray(sc.highlights) && sc.highlights.length) {
      next.highlights = deriveHighlights(line, sc.highlights)
    }
    if (line || hl) {
      const narr = String(next.narration || '')
      next.accentWords = (next.highlights || []).filter((w) => w && narr.includes(w)).slice(0, 4)
    }
    if (windowTitle) {
      next.windowTitle = windowTitle
      filledText++
    } else if (touched && String(sc.windowTitle || '').trim()) {
      next.windowTitle = clip(filled('film.title') || next.title, 40)
    }
    // the history stage's big words follow the shot's new words
    if (next.stageSpec && typeof next.stageSpec === 'object') {
      const spec = { ...next.stageSpec }
      for (const s of STAGE_TEXT) {
        const v = stageFills[s.key]
        if (!v) continue
        spec[s.key] = s.list ? splitList(v, 6, 12) : clip(v, s.max)
        filledText++
      }
      if (touched) {
        if (!stageFills.headline && String(spec.headline || '').trim()) spec.headline = clip(next.title, 12)
        if (!stageFills.subheadline && spec.subheadline !== undefined) delete spec.subheadline
        // plaques / bamboo slips: the shot's own words (an empty list would bring back the stage's stock words)
        const listStage = ['plaque-summary', 'bamboo-slips', 'scroll-calligraphy'].includes(String(spec.archetype || ''))
        if (!stageFills.plaques && ((Array.isArray(spec.plaques) && spec.plaques.length) || listStage)) {
          const words = (next.highlights || []).slice(0, 6)
          spec.plaques = words.length ? words : [clip(next.title, 8)].filter(Boolean)
          if (!spec.plaques.length) delete spec.plaques
        }
        if (Array.isArray(spec.slips) && spec.slips.length && !stageFills.plaques) delete spec.slips
        if (!stageFills.heroNum && (spec.heroNum !== undefined || spec.heroUnit !== undefined)) {
          const num = numberFromLine(line || title)
          if (num) {
            spec.heroNum = num.num
            spec.heroUnit = stageFills.heroUnit || num.unit
          } else {
            delete spec.heroNum
            if (!stageFills.heroUnit) delete spec.heroUnit
            if (spec.archetype === 'hero-numeral') spec.archetype = 'hero-stand'
          }
        }
      }
      next.stageSpec = spec
    }
    if (touched) {
      changedShots++
      userWords.push(next.title, next.narration, ...(next.highlights || []))
    }
    // ---- pictures
    const mediaSlots = (slotInfo?.slots || []).filter((s) => s.kind !== 'text')
    const media = []
    const inShot = new Set(mediaSlots.map((s) => filled(s.id)).filter((x) => visualIds.has(x)))
    mediaSlots.forEach((slot, j) => {
      const motion = Array.isArray(sc.media) && sc.media[j]?.motion ? sc.media[j].motion : ['zoom-in', 'pan-left', 'zoom-out', 'pan-right'][(i + j) % 4]
      const pick = visualIds.has(filled(slot.id)) ? assetById.get(filled(slot.id)) : null
      // a still-picture place (card fan, before / after wipe) cannot show a clip
      const chosen = pick && (slot.kind !== 'image' || pick.type === 'image') ? pick : null
      if (chosen) {
        media.push(mediaEntry(chosen, motion))
        filledMedia++
        return
      }
      if (!slot.required) return
      const auto = autoFillMedia ? autoPick(slot, inShot, prevShotIds) : null
      if (auto) {
        inShot.add(auto.id)
        media.push(mediaEntry(auto, motion))
        autoFilledMedia++
      } else emptyMedia++
    })
    prevShotIds = new Set(media.map((m) => m.assetId))
    // the template's own picture files are not in this project: only the user's media stay
    next.media = media.filter((m) => existsSync(isAbsolute(m.path) ? m.path : join(absDir, m.path)))
    if (!next.media.length) delete next.media
    const replacedAnimation = Boolean(next.media) && mediaSlots.length > 0 && !mediaSlots.some((s) => s.required)
    if (replacedAnimation) delete next.stageSpec
    // shots written as AI code in the template render with the built-in layout that fits
    if (replacedAnimation || !BUILTIN_LAYOUTS.has(next.layout)) {
      next.layout = next.media ? pictureLayout : next.stageSpec ? 'narrative-diorama' : i === 0 ? '3d-stage-opener' : i === lastIdx ? 'radial-climax' : 'kinetic-impact'
    } else if (MEDIA_LAYOUTS[next.layout] && !next.media) {
      next.layout = next.stageSpec ? 'narrative-diorama' : i === 0 ? '3d-stage-opener' : 'kinetic-impact'
    }
    if (Object.keys(own).length) overrides[id] = own
    return next
  })
  checkAbort()

  // ---- film-level words
  const filmTitle = filled('film.title')
  if (filmTitle) filledText++
  // the banner character: the user's, else read from the user's own words (「岳飞」 → 宋); a film whose every shot has
  // new words lets the stage read it shot by shot; otherwise the template's banner stays with its words
  const bannerFill = filled('film.bannerChar')
  const fromWords = inferBannerChar([filmTitle, topic, ...userWords].join(' '))
  const banner = bannerFill ? clip(bannerFill, 2) : fromWords || (changedShots > 0 && changedShots === scenes.length ? '' : null)
  if (banner !== null) {
    if (bannerFill) filledText++
    for (const sc of scenes) {
      if (!sc.stageSpec || sc.stageSpec.bannerChar === undefined) continue
      if (banner) sc.stageSpec.bannerChar = banner
      else delete sc.stageSpec.bannerChar
    }
  }

  // ---- music: the chosen song, else the library's first song, else a track generated at the template's tempo
  progress(25, '正在准备配乐和节拍…')
  const musicPick = filled('film.music')
  const musicItems = (manifest.items || []).filter((it) => lib.music.some((m) => m.id === it.id))
  const music = musicPick === 'generate' ? null : musicItems.find((it) => it.id === musicPick) || (musicPick ? null : musicItems[0] || null)
  const tplBpm = Number(tpl.bgm?.bpm) || Number(tpl.audioSpec?.bpm) || Number(template.bpm) || 110
  const tplTotal = Number(tpl.totalDurationSec) || scenes.reduce((a, s) => a + (Number(s.durationSec) || 0), 0)
  const musicAbs = music ? (isAbsolute(music.path) ? music.path : join(absDir, music.path)) : ''
  let grid = null
  if (music && existsSync(musicAbs)) {
    try {
      const a = await analyzeAudioBeatStructure(musicAbs, { signal })
      if (a?.analyzed && Array.isArray(a.beats) && a.beats.length >= 8) grid = a
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }
  if (!grid) grid = { ...buildBeatGrid(tplTotal + 4, Math.round(tplBpm)), beatSec: 60 / Math.round(tplBpm) }
  const songSec = Number(grid.durationSec) || 0
  // a song shorter than the template: the film follows the song (down to 60 % of the template), else it loops
  const targetSec = music && songSec > 0 && songSec < tplTotal && songSec >= tplTotal * 0.6 ? songSec : tplTotal
  const rel = (p) => (isAbsolute(p) ? relative(absDir, p).replace(/\\/g, '/') : String(p).replace(/\\/g, '/'))
  const bgm = {
    enabled: true,
    mood: tpl.bgm?.mood || applied.audioProfile?.mood || applied.style || 'cinematic',
    volume: Number(tpl.bgm?.volume) > 0 ? Number(tpl.bgm.volume) : 0.24,
    bpm: Math.round(Number(grid.bpm) || tplBpm),
    beats: grid.beats,
    ...(grid.analyzed ? { analyzed: true, beatSec: grid.beatSec, durationSec: grid.durationSec, phaseSec: grid.phaseSec, barOffset: grid.barOffset, downbeats: grid.downbeats, drops: grid.drops } : {}),
    ...(music
      ? { mode: 'uploaded', source: 'user-imported', path: rel(music.path), uploadedPath: rel(music.path) }
      : { mode: 'generated', source: 'generated', path: '' }),
  }

  const script = {
    ...Object.fromEntries(KEEP_FROM_PROJECT.filter((k) => prev[k] !== undefined).map((k) => [k, prev[k]])),
    ...Object.fromEntries(KEEP_FROM_APPLY.filter((k) => applied[k] !== undefined).map((k) => [k, applied[k]])),
    ...Object.fromEntries(KEEP_FROM_TEMPLATE.filter((k) => tpl[k] !== undefined).map((k) => [k, tpl[k]])),
    // the sample's own palette (an AI-designed theme of the template film) when it has one
    ...(tpl.theme && typeof tpl.theme === 'object' ? { theme: tpl.theme } : {}),
    title: filmTitle || clip(tpl.displayTitle || tpl.title || template.name, 64),
    ...(filmTitle ? { displayTitle: filmTitle } : tpl.displayTitle ? { displayTitle: tpl.displayTitle } : {}),
    ...(String(topic || '').trim() ? { topic: clip(topic, 200) } : filmTitle ? { topic: filmTitle } : {}),
    productionType: 'ai-film',
    authoringMode: 'template-fill',
    fps,
    bgmMode: music ? 'uploaded' : 'generated',
    bgm,
    scenes,
    templateFill: {
      templateId: template.id,
      templateName: template.name,
      filledText,
      filledMedia,
      autoFilledMedia,
      emptyMedia,
      changedShots,
      musicAssetId: music?.id || '',
      autoFillMedia: autoFillMedia !== false,
      // what the user filled in, so the panel can show it again for another round
      fills: f,
      ...(String(topic || '').trim() ? { topic: clip(topic, 200) } : {}),
      filledAt: new Date().toISOString(),
    },
    ...(Object.keys(overrides).length ? { userOverrides: overrides } : {}),
  }

  // ---- timing: a pure-music template is cut to the music's beats (sub-shots, subtitles and hits follow)
  const narrationMode = script.narrationMode || info.template.narrationMode
  const audioMeta = { genre: script.genre, genreLabel: script.genreLabel, title: script.title, style: script.style, narrationMode, pacingMode: script.pacingMode, audioProfile: script.audioProfile, referenceStyle: script.referenceStyle }
  if (narrationMode === 'subtitle-mv') {
    script.scenes = quantizeScenesToBeatGrid(script.scenes, grid, { ...audioMeta, mode: 'subtitle-mv', fps, targetDurationSec: targetSec, planBpm: tplBpm })
    script.scenes = choreographBeatSfxCues(script.scenes, grid, { ...audioMeta, fps })
  }
  const subs = script.scenes.flatMap((sc) => (Array.isArray(sc.subtitles) ? sc.subtitles : []))
  if (subs.length) script.subtitles = subs
  checkAbort()

  // ---- long clips: the best window of each one for its shot
  progress(45, '正在为视频素材挑选合适的片段…')
  try {
    const fw = await ensureFootageWindows({ projectDir: absDir, script, signal, onChild, onProgress: (p) => p?.message && progress(55, p.message) })
    if (fw?.script) script.scenes = fw.script.scenes
  } catch (err) {
    if (signal?.aborted) throw err
  }
  checkAbort()

  progress(80, '正在生成工程画面代码…')
  writeScriptJson(absDir, script)
  const saved = readScriptJson(absDir).data
  writeRemotionProjectFiles(absDir, saved, { useCustomSceneRegistry: false })
  try {
    writeFileSync(join(absDir, 'index.html'), buildRichHtmlVideo(saved), 'utf8')
  } catch {}
  progress(100, '模板填空完成')
  const needsVoice = narrationMode !== 'subtitle-mv'
  return {
    ok: true,
    templateId: template.id,
    templateName: template.name,
    narrationMode,
    needsVoice,
    scenes: saved.scenes.length,
    durationSec: r3(saved.totalDurationSec),
    filledText,
    filledMedia,
    autoFilledMedia,
    emptyMedia,
    changedShots,
    music: music ? { id: music.id, name: music.originalName || music.name || music.id, bpm: bgm.bpm } : { generated: true, bpm: bgm.bpm },
    aspectRatio: saved.aspectRatio,
  }
}

/**
 * Optional: the configured model writes every text blank of a template for a new topic, shot for shot in the
 * template's rhythm (each line about as long as the template's, so the timing still fits). Returns { fills } for the
 * user to review — nothing is written to the project. Large templates go in pages of shots.
 */
export async function suggestTemplateTexts({ templateId, topic, notes = '', signal, onWait, onProgress, pageSize = 16 } = {}) {
  const want = String(topic || '').trim()
  if (!want) throw new Error('请先写一句话说明这条视频讲什么，AI 才能按模板帮你写文字。')
  const info = describeTemplateSlots(templateId)
  const t = info.template
  const textSlots = (slots) => slots.filter((s) => s.kind === 'text')
  const system = [
    '你是短视频模板的文案编辑。用户套用了一个视频模板，模板的镜头、节奏、版式和音效都不变，只把文字换成用户的新主题。',
    '规则：',
    '1. 逐个空位改写：每个空位写一段新文字，保持模板这一格的作用（开场钩子、转折、高潮、结尾号召等）和语气，内容换成用户的主题。',
    '2. 长度跟模板原文差不多（±30%），字幕和旁白要能在原镜头时长内念完；标题、画面大字要短。',
    '3. 「重点词」「牌匾 / 竹简上的字」用中文顿号「、」分隔，每个词 2~6 个字，取自这一镜的新文字。',
    '4. 「画面大数字」只写数字（如 800、1949），「大数字后面的字」写 1~2 个字的单位；没有合适的数字就照常写一个与主题相关的数字。',
    '5. 「旗帜上的字」只写一个汉字（朝代、国号或主题的一个字）。',
    '6. 只写观众看到、听到的正文：不要写镜头指令、特效说明、括号注释、表情符号、网址、引号。事实要准确，不确定的不要编造具体数字和人名。',
    '7. 只输出一个 JSON 对象：键是空位编号（如 "s01.title"），值是新文字；不要输出别的内容。',
  ].join('\n')
  const header = `模板：「${t.name}」${t.description ? `（${clip(t.description, 80)}）` : ''}，${t.shotCount} 个镜头，约 ${Math.round(t.durationSec)} 秒，${t.narrationMode === 'subtitle-mv' ? '纯音乐卡点（没有配音，文字都显示在画面上）' : '有配音旁白'}。\n新主题：${clip(want, 300)}${String(notes || '').trim() ? `\n补充要求：${clip(notes, 400)}` : ''}`
  const describeSlot = (s) => `${s.id}｜${s.label}｜模板原文：${s.example || '（空）'}${s.suggestChars ? `｜约 ${s.suggestChars} 字` : ''}`
  const pages = []
  for (let i = 0; i < info.scenes.length; i += Math.max(4, pageSize)) pages.push(info.scenes.slice(i, i + Math.max(4, pageSize)))
  const fills = {}
  let model = ''
  for (let p = 0; p < pages.length; p++) {
    if (signal?.aborted) throw createAbortError()
    onProgress?.({ pct: Math.round((p / pages.length) * 100), message: `AI 正在写第 ${p + 1}/${pages.length} 部分的文字…` })
    const slots = [...(p === 0 ? textSlots(info.filmSlots) : []), ...pages[p].flatMap((sc) => textSlots(sc.slots))]
    const before = p > 0 ? `\n前面镜头已经写好的标题（保持连贯，不要重复）：${pages.slice(0, p).flat().map((sc) => fills[`s${pad2(sc.index)}.title`]).filter(Boolean).join(' / ')}` : ''
    const user = `${header}${before}\n\n请为下面 ${slots.length} 个空位写新文字（第 ${p + 1}/${pages.length} 部分）：\n${slots.map(describeSlot).join('\n')}`
    const res = await callLlmChat({
      system,
      messages: [{ role: 'user', content: user }],
      temperature: 0.7,
      maxTokens: Math.min(8000, 400 + slots.length * 90),
      responseFormat: 'json',
      purpose: '模板填空文案',
      signal,
      onWait,
    })
    model = res?.model || model
    let parsed = null
    try {
      parsed = extractJsonFromLlmText(res?.text || '')
    } catch {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`AI 没有按要求返回文字（第 ${p + 1}/${pages.length} 部分），请再试一次。`)
    const ids = new Set(slots.map((s) => s.id))
    const maxLen = new Map(slots.map((s) => [s.id, s.maxLength || 200]))
    for (const [k, v] of Object.entries(parsed)) {
      if (!ids.has(k)) continue
      const text = Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean).join('、') : String(v ?? '').trim()
      if (text) fills[k] = text.slice(0, maxLen.get(k))
    }
  }
  onProgress?.({ pct: 100, message: 'AI 已写好文字，请检查后再生成' })
  const total = textSlots([...info.filmSlots, ...info.scenes.flatMap((s) => s.slots)]).length
  return { ok: true, templateId: t.id, fills, filled: Object.keys(fills).length, total, model }
}
