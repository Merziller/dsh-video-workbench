/**
 * 「我的动漫形象」 — the reusable anime character library (contract: ANIME-AVATAR.md).
 *
 * A character is made once — from the user's photo (turned into an anime likeness by the user's own cloud image
 * service, or locally by the optional local model), or from a cartoon picture the user already has — and then talks
 * in any number of videos with the user's own voice. Characters live outside projects:
 * `<DSH_VIDEO_HOME>/anime-characters/<id>/character.json` + the files it names (all in that folder).
 *
 * Paid steps are explicit: the cloud anime likeness needs `confirmedCost: true` (the UI shows the estimate first), and
 * the cloud ledger in the character folder makes a retry of the same picture free (never paid twice).
 */
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { createAbortError, resolveEnvPath } from '../shared/index.js'
import { chooseBackgroundKey, cornerColors, cutOutBackground, opaqueBounds } from '../dsh-tool-media/talk-mascot.js'
import { buildCharacterSprites, guessFaceMarks, readImageRgba, SPRITE_VERSION, writePngRgba } from './anime-sprite.js'

export const CHARACTER_SCHEMA = 1
export const PORTRAIT_MAX_SIDE = 1024
export const ANIME_STYLES = {
  anime: { label: '日系动漫', prompt: '日系二次元动漫风格（干净的线稿、赛璐璐上色、明亮的大眼睛）' },
  cartoon3d: { label: '3D 卡通', prompt: '3D 卡通动画电影风格（柔和的体积光、圆润的造型、细腻的材质）' },
  chibi: { label: 'Q 版', prompt: 'Q 版可爱风格（大头小身体、圆脸、线条简洁）' },
  flat: { label: '扁平插画', prompt: '扁平矢量插画风格（色块简洁、线条干净、少量阴影）' },
}
const IMAGE_EXT_RX = /\.(png|jpe?g|webp|bmp|gif|avif|tiff?)$/i
const ID_RX = /^c-[a-z0-9][a-z0-9-]{3,46}$/

const nowIso = () => new Date().toISOString()
const r3 = (v) => Number(Number(v || 0).toFixed(3))
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0))

function coded(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

/** Library folder: `<DSH_VIDEO_HOME>/anime-characters` (created on first use). */
export function animeCharactersRoot() {
  return join(resolveEnvPath('DSH_VIDEO_HOME', './.dsh-home'), 'anime-characters')
}

export const isCharacterId = (id) => typeof id === 'string' && ID_RX.test(id)

function newCharacterId() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `c-${ymd}-${randomBytes(3).toString('hex')}`
}

function characterDir(id) {
  if (!isCharacterId(id)) throw coded('动漫形象编号不正确', 'BAD_ID')
  return join(animeCharactersRoot(), id)
}

/** Absolute path of a file named by the record, refusing anything outside the character's folder. */
export function characterFileAbs(character, rel) {
  if (!character?.dir || !rel) return ''
  const abs = resolve(character.dir, String(rel))
  const base = resolve(character.dir)
  return abs === base || !abs.startsWith(base + sep) ? '' : abs
}

function readRecord(dir) {
  try {
    const rec = JSON.parse(readFileSync(join(dir, 'character.json'), 'utf8'))
    return rec && typeof rec === 'object' && isCharacterId(rec.id) ? rec : null
  } catch {
    return null
  }
}

function writeRecord(dir, rec) {
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `character.json.${process.pid}.${randomBytes(3).toString('hex')}.tmp`)
  writeFileSync(tmp, JSON.stringify(rec, null, 2))
  renameSync(tmp, join(dir, 'character.json'))
  return rec
}

// one change at a time per character (the studio can get two clicks / two runs at once). The stored tail never
// rejects (a failed change must not become an unhandled rejection, nor block the next change).
const locks = new Map()
function withCharacterLock(id, fn) {
  const prev = locks.get(id) || Promise.resolve()
  const next = prev.then(fn)
  const tail = next.then(
    () => {},
    () => {},
  )
  locks.set(id, tail)
  tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id)
  })
  return next
}

/** The record plus `dir` (absolute folder); null when the character does not exist. */
export function getCharacter(id) {
  if (!isCharacterId(id)) return null
  const dir = characterDir(id)
  const rec = readRecord(dir)
  return rec ? { ...rec, dir } : null
}

/** Engines a character is ready for (the UI shows these as badges). */
export function characterEngines(rec) {
  const cloud = rec?.cloud && typeof rec.cloud === 'object' ? rec.cloud : {}
  return {
    sprite: rec?.status === 'ready' && Boolean(rec?.portrait),
    tha3: Boolean(rec?.tha?.ok && Number(rec.tha.version) === Number(rec.version)),
    runway: Boolean(cloud.runway?.avatarId),
    volc: Boolean(cloud.volc?.avatarId),
    vidu: Boolean(cloud.vidu?.avatarId || cloud.vidu?.ready),
  }
}

/** Every character (newest first), as small summaries for the library list. */
export function listCharacters() {
  const root = animeCharactersRoot()
  if (!existsSync(root)) return []
  const out = []
  for (const name of readdirSync(root)) {
    if (!isCharacterId(name)) continue
    const rec = readRecord(join(root, name))
    if (!rec) continue
    out.push({
      id: rec.id,
      name: rec.name || '我的动漫形象',
      version: rec.version || 1,
      status: rec.status || 'ready',
      error: rec.error || '',
      createdAt: rec.createdAt || '',
      updatedAt: rec.updatedAt || rec.createdAt || '',
      source: rec.source?.kind || 'cartoon',
      stylize: rec.stylize?.method || 'none',
      style: rec.stylize?.style || '',
      aspect: rec.aspect || 0.75,
      width: rec.width || 0,
      height: rec.height || 0,
      hasPortrait: Boolean(rec.portrait && existsSync(join(root, name, rec.portrait))),
      faceChecked: Boolean(rec.face?.checked),
      engines: characterEngines(rec),
    })
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

/* ----------------------------------------------------------------------------------------- the anime likeness */

/** The prompt that turns the user's photo into the presenter picture (also used for a later 「重新生成」). */
export function buildStylizePrompt(style = 'anime', extra = '') {
  const s = ANIME_STYLES[style] || ANIME_STYLES.anime
  return [
    `把参考照片里的这个人画成${s.prompt}的半身像讲解员形象。`,
    '要像本人：保持脸型、五官比例、发型、发色、眼镜 / 胡子 / 痣等明显特征，以及衣服的款式和颜色。',
    '正面朝向镜头，头部端正不歪，表情自然亲切，嘴巴闭合，双眼睁开看着镜头。',
    '构图：从头顶到胸口的半身，人物居中，头顶上方留一点空白，双肩完整入画。',
    '背景必须是平整的纯绿色绿幕（#00FF00），不要阴影、不要渐变、不要文字、不要边框、不要其他人物或物品。',
    String(extra || '').trim().slice(0, 200),
  ]
    .filter(Boolean)
    .join('')
}

/**
 * What a cloud anime likeness costs with the user's configured image service, and whether that service can take a
 * photo at all (only services that accept reference images keep the likeness). Reference prices, RMB per picture.
 */
export async function estimateStylizeCost() {
  const { loadCloudMediaConfig, resolveReferenceImageCapability } = await import('../dsh-tool-media/cloud-media.js')
  let cfg = {}
  try {
    cfg = loadCloudMediaConfig()?.image || {}
  } catch {}
  const protocol = String(cfg.protocol || '')
  const model = String(cfg.model || '')
  const providerId = String(cfg.providerId || '')
  const configured = protocol === 'custom' ? Boolean(String(cfg.custom?.submitUrl || '').trim()) : Boolean(String(cfg.apiKey || '').trim())
  const cap = resolveReferenceImageCapability(cfg, protocol, 'image', model)
  const table = [
    { test: () => providerId === 'volcengine-seedream', low: 0.2, high: 0.3, label: '即梦 Seedream 4.0（参考价 0.2 元左右一张）' },
    { test: () => protocol === 'kling-image', low: 0.1, high: 0.3, label: '可灵生图（参考价几毛钱一张）' },
    { test: () => protocol === 'bfl-flux', low: 0.3, high: 0.6, label: 'Flux Kontext（参考价约 0.04–0.08 美元一张）' },
  ]
  const hit = table.find((t) => t.test())
  return {
    configured,
    supported: Boolean(configured && cap.supported),
    reason: !configured ? '还没有配置云端生图服务（☁️ 云端生图/视频/音乐 → 生图）' : cap.supported ? cap.reason : `${cap.reason}：这个服务收不到照片，画不像本人。请换成即梦 Seedream 4.0、可灵或 Flux Kontext`,
    provider: providerId || protocol || '',
    model,
    rmbLow: hit ? hit.low : 0.2,
    rmbHigh: hit ? hit.high : 1.2,
    note: hit ? hit.label : '按你配置的生图服务计费，一般每张几毛到一块钱，以服务商账单为准',
    pictures: 1,
  }
}

async function stylizeWithCloud({ dir, sourceAbs, style, extraPrompt, signal, onProgress }) {
  const est = await estimateStylizeCost()
  if (!est.configured) throw coded(est.reason, 'NO_KEY')
  if (!est.supported) throw coded(est.reason, 'UNSUPPORTED_PROVIDER')
  const { generateCloudMediaAsset } = await import('../dsh-tool-media/cloud-media.js')
  onProgress?.({ message: '正在用你的云端生图服务把照片画成动漫形象（只收一张图的钱）…', pct: 20 })
  // the character folder is the cloud "project": its ledger makes a retry of the same picture + prompt free
  const res = await generateCloudMediaAsset({
    projectDir: dir,
    category: 'image',
    prompt: buildStylizePrompt(style, extraPrompt),
    aspectRatio: '3:4',
    referenceImages: [sourceAbs],
    useCharacterRefs: false,
    autoBindToScript: false,
    fileOutput: { subdir: 'stylize', prefix: 'anime' },
    signal,
    onProgress: (p) => onProgress?.({ message: p?.message || '云端生成中…', pct: 20 + Math.round((Number(p?.progress) || 0) * 0.5) }),
  })
  if (!res?.absolutePath || !existsSync(res.absolutePath)) throw coded('云端没有返回图片', 'PROVIDER_ERROR')
  if (!res.referenceImages?.used) throw coded('这次生成没有用上你的照片（服务不支持参考图），画出来不会像本人，已停止', 'UNSUPPORTED_PROVIDER')
  return { abs: res.absolutePath, provider: res.providerId || est.provider, model: res.model || est.model }
}

async function stylizeLocally({ dir, sourceAbs, style, signal, onProgress, onChild }) {
  let mod = null
  try {
    mod = await import('./anime-local.js')
  } catch {
    mod = null
  }
  if (!mod?.stylizePortraitLocal) throw coded('本地动漫化模型还没有安装（设置 → 动漫形象 → 安装本地模型）', 'NOT_INSTALLED')
  const outAbs = join(dir, 'stylized.png')
  onProgress?.({ message: '正在用本地模型把照片画成动漫形象（不花钱）…', pct: 20 })
  const res = await mod.stylizePortraitLocal({ inAbs: sourceAbs, outAbs, style, signal, onChild, onProgress })
  const abs = res?.path || outAbs
  if (!existsSync(abs)) throw coded('本地模型没有生成图片', 'PROVIDER_ERROR')
  return { abs, provider: res?.engine || 'local', model: res?.model || '' }
}

/* -------------------------------------------------------------------------------------------- the portrait */

/**
 * How to remove the background of a half-length portrait. The shoulders often reach the bottom corners, so the plain
 * background colour is taken from the top corners when the four corners disagree; any transparent corner means the
 * picture already has a transparent background.
 */
export function portraitBackgroundPlan(rgba, w, h) {
  const corners = cornerColors(rgba, w, h)
  if (corners[0].a < 24 || corners[1].a < 24 || corners.filter((c) => c.a < 24).length >= 2) return { mode: 'alpha' }
  const all = chooseBackgroundKey(corners)
  if (all.mode === 'key') return all
  const top = chooseBackgroundKey([corners[0], corners[1], corners[0], corners[1]])
  return top.mode === 'key' ? top : { mode: 'none' }
}

/**
 * Cut the character out of its picture (transparent / plain-colour background → transparent PNG, cropped to the
 * character, at most 1024 px) and save it as `portrait.png`. A busy background cannot be cut out locally.
 */
async function writePortrait({ dir, pictureAbs, signal, onChild }) {
  const img = await readImageRgba(pictureAbs, { maxSide: PORTRAIT_MAX_SIDE, signal, onChild })
  const { width: w, height: h } = img
  const rgba = Buffer.from(img.rgba)
  const plan = portraitBackgroundPlan(rgba, w, h)
  let note = ''
  if (plan.mode === 'key') {
    const cut = cutOutBackground(rgba, w, h, plan.color)
    if (cut.share < 0.04) throw coded('这张图几乎没有背景可抠，请换一张人物周围留有纯色背景（或透明背景）的图', 'UNSUPPORTED_IMAGE')
    note = '已自动抠掉纯色背景'
  } else if (plan.mode === 'none') {
    throw coded('这张图的背景不是纯色，没法自动抠出人物。请用透明背景的 PNG，或纯色背景的图片', 'UNSUPPORTED_IMAGE')
  } else note = '透明背景'
  const b = opaqueBounds(rgba, w, h)
  if (!b || b.w < 32 || b.h < 48) throw coded('图里没有找到人物', 'UNSUPPORTED_IMAGE')
  // a small margin, even sizes (video encoders), inside the picture
  const mx = Math.round(b.w * 0.03)
  const my = Math.round(b.h * 0.02)
  const x = Math.max(0, b.x - mx)
  const y = Math.max(0, b.y - my)
  let cw = Math.min(w - x, b.w + 2 * mx)
  let ch = Math.min(h - y, b.h + my) // no margin below: the character stands on the bottom edge
  cw -= cw % 2
  ch -= ch % 2
  const out = Buffer.alloc(cw * ch * 4)
  for (let row = 0; row < ch; row++) rgba.copy(out, row * cw * 4, ((y + row) * w + x) * 4, ((y + row) * w + x + cw) * 4)
  await writePngRgba(join(dir, 'portrait.png'), out, cw, ch, { signal, onChild })
  return { width: cw, height: ch, note, rgba: out }
}

/* ------------------------------------------------------------------------------------------------ create / edit */

/**
 * Make a new character. `kind`: 'photo' (a photo of a real person: needs stylize 'cloud' or 'local') or 'cartoon' (a
 * cartoon picture used as it is). `stylize`: 'cloud' (the user's image service, paid: requires `confirmedCost`),
 * 'local' (optional local model) or 'none'. Returns the finished record; on a failure the record stays with status
 * 'failed' so 「重试」 (rebuildCharacter) re-uses everything already done (a finished cloud picture is not paid again).
 */
export async function createCharacter({ name = '', sourceAbs, kind = 'photo', stylize, style = 'anime', extraPrompt = '', confirmedCost = false, signal, onProgress, onChild } = {}) {
  const src = resolve(String(sourceAbs || ''))
  if (!sourceAbs || !existsSync(src) || !statSync(src).isFile()) throw coded('没有找到这张图片', 'NO_SOURCE')
  if (!IMAGE_EXT_RX.test(src)) throw coded('请选择图片文件（PNG / JPG / WebP）', 'UNSUPPORTED_IMAGE')
  if (statSync(src).size > 30 * 1024 * 1024) throw coded('图片太大了（超过 30 MB）', 'UNSUPPORTED_IMAGE')
  const method = ['cloud', 'local', 'none'].includes(stylize) ? stylize : kind === 'cartoon' ? 'none' : 'cloud'
  if (kind === 'photo' && method === 'none') throw coded('真人照片需要先画成动漫形象（云端或本地）', 'BAD_REQUEST')
  if (method === 'cloud' && !confirmedCost) throw coded('云端生成动漫形象要花一点钱，请先确认费用', 'COST_NOT_CONFIRMED')
  const id = newCharacterId()
  const dir = characterDir(id)
  mkdirSync(dir, { recursive: true })
  const ext = (extname(src).toLowerCase() || '.png').replace('.jpeg', '.jpg')
  copyFileSync(src, join(dir, `source${ext}`))
  const t = nowIso()
  writeRecord(dir, {
    schema: CHARACTER_SCHEMA,
    id,
    name: String(name || '').trim().slice(0, 24) || '我的动漫形象',
    version: 1,
    status: 'creating',
    error: '',
    createdAt: t,
    updatedAt: t,
    source: { kind: kind === 'cartoon' ? 'cartoon' : 'photo', file: `source${ext}` },
    stylize: { method, style: ANIME_STYLES[style] ? style : 'anime', extraPrompt: String(extraPrompt || '').slice(0, 200) },
    cloud: {},
  })
  return rebuildCharacter(id, { confirmedCost, signal, onProgress, onChild })
}

/**
 * (Re)build a character from its saved source: anime likeness → portrait → face marks (kept when the user already
 * checked them) → mouth / eye pictures. Paid cloud steps need `confirmedCost` unless their picture already exists.
 */
export function rebuildCharacter(id, { confirmedCost = false, restyle = false, signal, onProgress, onChild } = {}) {
  return withCharacterLock(id, async () => {
    const cur = getCharacter(id)
    if (!cur) throw coded('这个动漫形象不存在', 'NOT_FOUND')
    const { dir } = cur
    const fail = (err) => {
      const rec = readRecord(dir)
      if (rec) writeRecord(dir, { ...rec, status: rec.portrait && existsSync(join(dir, rec.portrait)) ? 'ready' : 'failed', error: String(err?.message || err).slice(0, 300), updatedAt: nowIso() })
      throw err
    }
    try {
      if (signal?.aborted) throw createAbortError()
      const sourceAbs = characterFileAbs(cur, cur.source?.file)
      if (!sourceAbs || !existsSync(sourceAbs)) throw coded('原图丢失了，请重新创建', 'NO_SOURCE')
      const method = cur.stylize?.method || 'none'
      const style = cur.stylize?.style || 'anime'
      let picture = { abs: sourceAbs, provider: '', model: '' }
      const already = cur.stylize?.file ? characterFileAbs(cur, cur.stylize.file) : ''
      if (method !== 'none' && already && existsSync(already) && !restyle) picture = { abs: already, provider: cur.stylize.provider || '', model: cur.stylize.model || '' }
      else if (method === 'cloud') {
        if (!confirmedCost) throw coded('云端生成动漫形象要花一点钱，请先确认费用', 'COST_NOT_CONFIRMED')
        picture = await stylizeWithCloud({ dir, sourceAbs, style, extraPrompt: cur.stylize?.extraPrompt, signal, onProgress })
      } else if (method === 'local') picture = await stylizeLocally({ dir, sourceAbs, style, signal, onProgress, onChild })
      // remember a new picture right away: a later failure (cut-out) must never make a retry pay for it again
      if (picture.abs !== sourceAbs && picture.abs !== already) {
        const rec0 = readRecord(dir) || cur
        writeRecord(dir, { ...rec0, stylize: { ...rec0.stylize, file: relative(dir, picture.abs).replace(/\\/g, '/'), provider: picture.provider, model: picture.model }, updatedAt: nowIso() })
      }
      onProgress?.({ message: '正在抠出人物…', pct: 75 })
      let portrait
      try {
        portrait = await writePortrait({ dir, pictureAbs: picture.abs, signal, onChild })
      } catch (err) {
        if (err?.code === 'UNSUPPORTED_IMAGE' && method !== 'none') err.message = `${err.message}。可以点「不满意，重新画一张」${method === 'cloud' ? '（会再收一张图的钱）' : ''}`
        throw err
      }
      const prevFace = cur.face?.checked && cur.width === portrait.width && cur.height === portrait.height && !restyle ? cur.face : null
      const face = prevFace || { ...guessFaceMarks(portrait.rgba, portrait.width, portrait.height), checked: false }
      onProgress?.({ message: '正在画嘴型和眨眼…', pct: 88 })
      const sprites = await buildCharacterSprites({ dir, rgba: portrait.rgba, width: portrait.width, height: portrait.height, face, signal, onChild })
      const rec = readRecord(dir) || cur
      const next = {
        ...rec,
        version: (Number(rec.version) || 0) + (rec.status === 'creating' ? 0 : 1),
        status: 'ready',
        error: '',
        updatedAt: nowIso(),
        stylize: { ...rec.stylize, file: picture.abs === sourceAbs ? '' : relative(dir, picture.abs).replace(/\\/g, '/'), provider: picture.provider, model: picture.model },
        portrait: 'portrait.png',
        portraitNote: portrait.note,
        width: portrait.width,
        height: portrait.height,
        aspect: r3(portrait.width / portrait.height),
        face,
        sprites,
      }
      // a new picture invalidates what was made from the old one (tier 2 input, provider avatars)
      if (next.version !== rec.version) {
        if (next.tha) next.tha = { ...next.tha, ok: false }
      }
      writeRecord(dir, next)
      onProgress?.({ message: '动漫形象已就绪', pct: 100 })
      return { ...next, dir }
    } catch (err) {
      return fail(err)
    }
  })
}

const cleanMark = (m, fallback) => {
  const x = clamp01(m?.x ?? fallback.x)
  const y = clamp01(m?.y ?? fallback.y)
  const w = Math.max(0.02, Math.min(0.4, Number(m?.w ?? fallback.w) || fallback.w))
  const out = { x: r3(x), y: r3(y), w: r3(w) }
  const h = Number(m?.h ?? fallback.h)
  if (h > 0) out.h = r3(Math.max(0.02, Math.min(0.4, h)))
  return out
}

/**
 * Change the name and / or the face marks (the user's clicks on mouth and eyes: 0..1 of the portrait). New marks
 * redraw the mouth and eye pictures and bump the version (videos re-render the presenter).
 */
export function updateCharacter(id, { name, face, mouthOriginal, signal, onChild } = {}) {
  return withCharacterLock(id, async () => {
    const cur = getCharacter(id)
    if (!cur) throw coded('这个动漫形象不存在', 'NOT_FOUND')
    const { dir } = cur
    const rec = readRecord(dir)
    const next = { ...rec, updatedAt: nowIso() }
    if (typeof name === 'string' && name.trim()) next.name = name.trim().slice(0, 24)
    let redraw = false
    if (face && typeof face === 'object') {
      const old = rec.face || guessFaceMarks(null, rec.width, rec.height)
      const eyes = Array.isArray(face.eyes) && face.eyes.length >= 2 ? face.eyes.slice(0, 2) : old.eyes
      next.face = {
        mouth: cleanMark(face.mouth, old.mouth),
        eyes: [cleanMark(eyes[0], old.eyes[0]), cleanMark(eyes[1], old.eyes[1])].sort((a, b) => a.x - b.x),
        mouthOriginal: face.mouthOriginal === 'open' || mouthOriginal === 'open' ? 'open' : 'closed',
        checked: true,
      }
      redraw = true
    } else if (mouthOriginal === 'open' || mouthOriginal === 'closed') {
      next.face = { ...(rec.face || {}), mouthOriginal }
      redraw = true
    }
    if (redraw && rec.portrait) {
      const img = await readImageRgba(join(dir, rec.portrait), { signal, onChild })
      next.sprites = await buildCharacterSprites({ dir, rgba: Buffer.from(img.rgba), width: img.width, height: img.height, face: next.face, signal, onChild })
      next.version = (Number(rec.version) || 1) + 1
      if (next.tha) next.tha = { ...next.tha, ok: false }
    }
    writeRecord(dir, next)
    return { ...next, dir }
  })
}

/** Move a character to the library's recycle folder (`.trash/`, recoverable by hand). */
export function deleteCharacter(id) {
  return withCharacterLock(id, async () => {
    const dir = characterDir(id)
    if (!existsSync(dir)) return { ok: true, missing: true }
    const trash = join(animeCharactersRoot(), '.trash')
    mkdirSync(trash, { recursive: true })
    const to = join(trash, `${id}-${Date.now()}`)
    renameSync(dir, to)
    return { ok: true, trashedTo: to }
  })
}

/** Tier 3: remember a provider-side avatar id (created once, reused for every video). No version bump. */
export function saveCharacterCloudId(id, provider, data = {}) {
  return withCharacterLock(id, async () => {
    const dir = characterDir(id)
    const rec = readRecord(dir)
    if (!rec) throw coded('这个动漫形象不存在', 'NOT_FOUND')
    const key = String(provider || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24)
    if (!key) throw coded('服务商名称不正确', 'BAD_REQUEST')
    const cloud = { ...(rec.cloud || {}) }
    if (data === null) delete cloud[key]
    else cloud[key] = { ...(data || {}), characterVersion: rec.version, savedAt: nowIso() }
    writeRecord(dir, { ...rec, cloud })
    return cloud[key] || null
  })
}

/** Tier 2: record the prepared input picture of the local model (`{ image, ok, … }`), for this character version. */
export function saveCharacterTha(id, data = {}) {
  return withCharacterLock(id, async () => {
    const dir = characterDir(id)
    const rec = readRecord(dir)
    if (!rec) throw coded('这个动漫形象不存在', 'NOT_FOUND')
    const tha = data === null ? undefined : { ...(data || {}), version: rec.version, savedAt: nowIso() }
    const next = { ...rec }
    if (tha) next.tha = tha
    else delete next.tha
    writeRecord(dir, next)
    return tha || null
  })
}

export { SPRITE_VERSION }
