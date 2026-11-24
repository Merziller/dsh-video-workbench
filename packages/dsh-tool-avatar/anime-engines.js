/**
 * 动漫形象数字人 · 三档调度 — the presenter engines behind one interface (contract: ANIME-AVATAR.md).
 *
 *   sprite (tier 1, default): no clip — the renderers draw portrait + mouth / blink pictures per frame from the voice
 *   tha3   (tier 2): local model (anime-local.js, optional install) → transparent WebM
 *   runway / volc / vidu (tier 3): the user's own cloud key (anime-cloud.js) → transparent WebM, never without the
 *          caller's explicit cost confirmation (`confirmedRmb` ≥ the estimate)
 *
 * planAnimePresenter() is what 口播剪辑 / 录屏讲解 call for one cut: it analyses the cut's voice, copies the
 * character's pictures into the project and, for tiers 2 / 3, renders (or re-uses) the clip. When a tier-2 / tier-3
 * engine cannot run (not installed, no key, cost not confirmed, provider error) the cut falls back to the free tier
 * with a plain-Chinese note instead of failing.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { characterFileAbs, getCharacter, saveCharacterCloudId } from './anime-character.js'
import { analyzeVisemesFromPcm, compactVisemeTrack, computeVisemeTrack, VISEME_VERSION } from './anime-visemes.js'

export const PRESENTER_ENGINES = [
  { id: 'sprite', tier: 1, label: '免费 · 会张嘴眨眼的立绘', short: '免费档', paid: false, local: true },
  { id: 'tha3', tier: 2, label: '显卡档 · 本地模型（脸和身体都会动）', short: '显卡档', paid: false, local: true },
  { id: 'vidu', tier: 3, label: '云端 · Vidu', short: 'Vidu', paid: true, local: false },
  { id: 'volc', tier: 3, label: '云端 · 火山引擎', short: '火山引擎', paid: true, local: false },
  { id: 'runway', tier: 3, label: '云端 · Runway', short: 'Runway', paid: true, local: false },
]
export const PRESENTER_ENGINE_IDS = PRESENTER_ENGINES.map((e) => e.id)
export const CLOUD_PRESENTER_ENGINES = new Set(['vidu', 'volc', 'runway'])
export const ANIME_PRESENTER_VERSION = 1
const ENV_HZ = 12.5 // same as talk-mascot.js MASCOT_ENV_HZ (the bob / sway formula reads this envelope)

const r3 = (v) => Number(Number(v || 0).toFixed(3))
const engineInfo = (id) => PRESENTER_ENGINES.find((e) => e.id === id) || PRESENTER_ENGINES[0]

function coded(message, code) {
  const err = new Error(message)
  err.code = code
  return err
}

/** Import an optional engine module (built separately); null when it is not there. */
async function loadOptional(spec) {
  try {
    return await import(spec)
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && String(err?.message || '').includes(spec.replace(/^\.\//, ''))) return null
    throw err
  }
}

/** Which presenter engines this computer / configuration can use right now (for the picker). */
export async function getPresenterEngines() {
  const out = []
  let local = null
  let localErr = ''
  try {
    const m = await loadOptional('./anime-installer.js')
    local = m?.getAnimeLocalStatus ? await m.getAnimeLocalStatus() : null
  } catch (err) {
    localErr = String(err?.message || err).slice(0, 160)
  }
  let cloud = null
  let cloudErr = ''
  try {
    const m = await loadOptional('./anime-cloud.js')
    cloud = m?.getAnimeCloudStatus ? await m.getAnimeCloudStatus() : m ? {} : null
  } catch (err) {
    cloudErr = String(err?.message || err).slice(0, 160)
  }
  for (const e of PRESENTER_ENGINES) {
    if (e.id === 'sprite') out.push({ ...e, available: true, reason: '所有电脑都能用，不花钱' })
    else if (e.id === 'tha3') {
      const ok = Boolean(local?.ready ?? local?.installed?.tha3 ?? local?.tha3?.installed)
      out.push({ ...e, available: ok, reason: ok ? String(local?.summary || local?.message || '已安装') : localErr || String(local?.summary || local?.message || '还没有安装本地模型（设置 → 动漫形象 → 安装）'), device: local?.device || '' })
    } else {
      const st = cloud?.engines?.[e.id] || cloud?.[e.id] || null
      const ok = Boolean(st?.configured ?? st?.ready)
      out.push({
        ...e,
        available: ok,
        reason: ok ? String(st?.summary || '已填写密钥') : cloudErr || String(st?.reason || st?.summary || (cloud ? '还没有填写这个服务的密钥' : '云端动漫数字人还没有安装')),
        modes: st?.modes || undefined,
        defaultMode: st?.defaultMode || undefined,
      })
    }
  }
  return out
}

/**
 * What one presenter clip of `durationSec` costs: local engines are free; cloud engines ask anime-cloud.js (with the
 * character, a 火山引擎 形象 that already exists for its picture is not counted again).
 */
export async function estimatePresenterCost({ engine = 'sprite', durationSec = 0, mode = '', character = null } = {}) {
  if (!CLOUD_PRESENTER_ENGINES.has(engine)) return { engine, rmb: 0, unit: '免费', basis: '在你的电脑上计算，不花钱', priceDate: '', sourceUrl: '' }
  const m = await loadOptional('./anime-cloud.js')
  if (!m?.estimatePresenterCost) throw coded('云端动漫数字人还没有安装', 'NOT_INSTALLED')
  return { engine, ...(await m.estimatePresenterCost({ engine, durationSec, mode, character })) }
}

/**
 * Render a tier-2 / tier-3 presenter clip (transparent WebM) for `character` speaking `audioAbs` — see the engine
 * interface in ANIME-AVATAR.md. Cloud engines need `confirmedRmb` ≥ the estimate; their provider-side avatar ids are
 * saved on the character (created once, reused for every video).
 */
export async function renderPresenterClip({ engine, character, confirmedRmb, mode = '', ...rest } = {}) {
  if (!character?.id || !character?.dir) throw coded('没有找到这个动漫形象', 'NOT_FOUND')
  if (engine === 'tha3') {
    const m = await loadOptional('./anime-local.js')
    if (!m?.renderPresenterClip) throw coded('本地动漫模型还没有安装（设置 → 动漫形象 → 安装本地模型）', 'NOT_INSTALLED')
    return m.renderPresenterClip({ character, ...rest })
  }
  if (CLOUD_PRESENTER_ENGINES.has(engine)) {
    const m = await loadOptional('./anime-cloud.js')
    if (!m?.renderPresenterClip) throw coded('云端动漫数字人还没有安装', 'NOT_INSTALLED')
    return m.renderPresenterClip({
      engine,
      character,
      mode,
      confirmedRmb,
      saveCloudId: (provider, data) => saveCharacterCloudId(character.id, provider || engine, data),
      ...rest,
    })
  }
  throw coded('免费档不需要生成视频', 'UNSUPPORTED')
}

/* ------------------------------------------------------------------------------------------------ one cut */

function sha256File(abs) {
  return new Promise((resolveP, rejectP) => {
    const h = createHash('sha256')
    createReadStream(abs)
      .on('data', (d) => h.update(d))
      .on('error', rejectP)
      .on('end', () => resolveP(h.digest('hex')))
  })
}

/** Loudness envelope for the bob / sway formula (talk-mascot.js mascotPose), 0..100 at 12.5 values per second. */
export function envelopeFromTrack(track, maxSec = 0) {
  const fps = Number(track?.fps) || 30
  const open = Array.isArray(track?.open) ? track.open : []
  const talk = Array.isArray(track?.talk) ? track.talk : []
  const n = Math.max(0, Math.ceil(((maxSec > 0 ? maxSec : open.length / fps) || 0) * ENV_HZ) + 1)
  const env = new Array(n)
  for (let k = 0; k < n; k++) {
    const f0 = Math.floor((k / ENV_HZ) * fps)
    const f1 = Math.max(f0 + 1, Math.floor(((k + 1) / ENV_HZ) * fps))
    let v = 0
    for (let f = f0; f < f1 && f < open.length; f++) v = Math.max(v, 0.75 * open[f] + 0.25 * (talk[f] || 0))
    env[k] = Math.round(Math.min(1, v) * 100)
  }
  return env
}

/** Copy the character's pictures for `engine` into the project (once per character version). → project-relative paths */
function copyCharacterFiles(absDir, character) {
  const folder = join(absDir, 'assets', '.mascot', `anime-${character.id}-v${character.version || 1}`)
  mkdirSync(folder, { recursive: true })
  const rel = (abs) => relative(absDir, abs).replace(/\\/g, '/')
  const put = (name) => {
    const src = characterFileAbs(character, name)
    if (!src || !existsSync(src)) return ''
    const dst = join(folder, name.replace(/[\\/]/g, '_'))
    const same = existsSync(dst) && statSync(dst).size === statSync(src).size
    if (!same) {
      const tmp = `${dst}.${process.pid}.tmp`
      copyFileSync(src, tmp)
      renameSync(tmp, dst)
    }
    return rel(dst)
  }
  const portrait = put(character.portrait)
  if (!portrait) throw coded('这个动漫形象的图片丢失了，请在形象库里重新生成', 'NO_SOURCE')
  const mouths = {}
  for (const [shape, file] of Object.entries(character.sprites?.mouths || {})) {
    const p = put(file)
    if (p) mouths[shape] = p
  }
  const blink = character.sprites?.blink ? put(character.sprites.blink) : ''
  return { portrait, mouths, blink }
}

/** The free-tier presenter of one cut (what the talk kit / HTML draft draw). */
function spritePresenter({ absDir, character, track, setting, totalSec, note = '' }) {
  const files = copyCharacterFiles(absDir, character)
  const boxes = character.sprites?.boxes || {}
  const vis = compactVisemeTrack(track)
  return {
    type: 'anime',
    engine: 'sprite',
    version: ANIME_PRESENTER_VERSION,
    characterId: character.id,
    characterVersion: character.version || 1,
    name: character.name || '我的动漫形象',
    path: files.portrait,
    keyed: true,
    aspect: r3(character.aspect || (character.width && character.height ? character.width / character.height : 0.75)),
    sprites: { mouths: files.mouths, blink: files.blink, boxes: { mouth: boxes.mouth || null, blink: boxes.blink || null } },
    visemes: vis,
    corner: setting.corner || 'bl',
    size: setting.size || 'm',
    envHz: ENV_HZ,
    env: envelopeFromTrack(track, totalSec),
    words: vis.words,
    note: note || '免费档：嘴型跟着每个字开合，会眨眼、点头和呼吸',
  }
}

/**
 * Everything the renderers need for the anime presenter of one cut. `setting` = { characterId, engine, mode, corner,
 * size, confirmedRmb } (talk-pack cleanMascotSetting). Never throws for a tier-2 / tier-3 problem: falls back to the
 * free tier with a note (`fallback: { engine, code, reason }`). Throws when the character itself is gone or on abort.
 */
export async function planAnimePresenter({ projectDir, setting = {}, captions = [], wavAbs = '', totalSec = 0, fps = 30, signal, onChild, onProgress } = {}) {
  const absDir = resolve(projectDir)
  const character = getCharacter(setting.characterId)
  if (!character) throw coded('选中的动漫形象已经不在形象库里了，请重新选择', 'NOT_FOUND')
  if (character.status !== 'ready' || !character.portrait) throw coded(`动漫形象「${character.name || ''}」还没有生成好${character.error ? `：${character.error}` : ''}`, 'NOT_READY')
  const engine = PRESENTER_ENGINE_IDS.includes(setting.engine) ? setting.engine : 'sprite'
  onProgress?.({ message: '正在分析声音，安排嘴型、眨眼和点头（本地，不花钱）…' })
  let track
  if (wavAbs && existsSync(wavAbs)) track = await computeVisemeTrack({ audioAbs: wavAbs, fps, captions, signal, onChild })
  else track = analyzeVisemesFromPcm(new Float32Array(Math.max(1, Math.ceil((Number(totalSec) || 1) * 16000))), 16000, { fps, captions })
  if (engine === 'sprite') return spritePresenter({ absDir, character, track, setting, totalSec })

  const info = engineInfo(engine)
  const fallback = (err) => {
    if (err?.name === 'AbortError' || signal?.aborted) throw err
    const reason = String(err?.message || err).slice(0, 200)
    const plan = spritePresenter({ absDir, character, track, setting, totalSec, note: `「${info.short}」这次没有用上：${reason}。先用免费档代替` })
    return { ...plan, fallback: { engine, code: err?.code || 'ERROR', reason } }
  }
  try {
    if (!wavAbs || !existsSync(wavAbs)) throw coded('这段视频没有声音，用不了会动的数字人', 'NO_AUDIO')
    const audioSha = await sha256File(wavAbs)
    // a cloud engine's mode (火山引擎 灵动 / 普通 …, Vidu 540p / 720p) falls back to the saved default: the clip's
    // cache key uses the mode that will actually be used
    const cloudEstimate = CLOUD_PRESENTER_ENGINES.has(engine) ? await estimatePresenterCost({ engine, durationSec: Number(totalSec) || track.durationSec, mode: setting.mode || '', character }) : null
    const opts = { fps, maxHeight: 720, mode: cloudEstimate?.mode ?? (setting.mode || '') }
    const key = createHash('sha1')
      .update(JSON.stringify([engine, character.id, character.version || 1, audioSha, opts, VISEME_VERSION, ANIME_PRESENTER_VERSION]))
      .digest('hex')
      .slice(0, 12)
    const outDir = join(absDir, 'assets', '.mascot')
    mkdirSync(outDir, { recursive: true })
    const outAbs = join(outDir, `anime-${character.id}-${engine}-${key}.webm`)
    const metaAbs = `${outAbs}.json`
    let clip = null
    if (existsSync(outAbs) && existsSync(metaAbs)) {
      try {
        clip = JSON.parse(readFileSync(metaAbs, 'utf8'))
      } catch {}
    }
    if (!clip) {
      const estimate = cloudEstimate
      if (estimate) {
        // the cloud module checks again against what is really still to pay (a stopped run's finished parts are free)
        const confirmed = Number(setting.confirmedRmb)
        if (!(Number.isFinite(confirmed) && confirmed >= Number(estimate.rmb || 0))) {
          throw coded(`云端数字人这段约 ${Number(estimate.rmb || 0).toFixed(2)} 元，需要先在面板上确认费用`, 'COST_NOT_CONFIRMED')
        }
      }
      onProgress?.({ message: `正在用「${info.short}」生成会说话的动漫形象…` })
      const res = await renderPresenterClip({
        engine,
        character,
        audioAbs: wavAbs,
        outAbs,
        track,
        confirmedRmb: setting.confirmedRmb,
        signal,
        onChild,
        onProgress,
        ...opts,
      })
      const path = res?.path && existsSync(res.path) ? res.path : outAbs
      if (!existsSync(path)) throw coded('没有生成出视频', 'PROVIDER_ERROR')
      clip = {
        file: relative(absDir, path).replace(/\\/g, '/'),
        width: Number(res?.width) || 0,
        height: Number(res?.height) || 0,
        durationSec: r3(res?.durationSec || track.durationSec),
        engine,
        note: String(res?.note || ''),
        cost: res?.cost ?? (estimate ? { rmb: estimate.rmb, unit: estimate.unit } : null),
        createdAt: new Date().toISOString(),
      }
      const tmp = `${metaAbs}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(clip))
      renameSync(tmp, metaAbs)
    }
    return {
      type: 'anime-clip',
      engine,
      version: ANIME_PRESENTER_VERSION,
      characterId: character.id,
      characterVersion: character.version || 1,
      name: character.name || '我的动漫形象',
      path: clip.file,
      keyed: true,
      aspect: r3(clip.width && clip.height ? clip.width / clip.height : character.aspect || 0.75),
      durationSec: clip.durationSec,
      corner: setting.corner || 'bl',
      size: setting.size || 'm',
      envHz: ENV_HZ,
      env: [],
      words: compactVisemeTrack(track).words,
      cost: clip.cost || null,
      note: clip.note || `${info.label}：整张脸跟着声音动`,
    }
  } catch (err) {
    return fallback(err)
  }
}
