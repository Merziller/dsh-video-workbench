/**
 * 「我的动漫形象」 REST routes (the reusable anime presenter library, see dsh-tool-avatar/ANIME-AVATAR.md):
 *   GET  /api/video-workbench/anime/characters   → the library, the presenter engines this computer can use, the anime
 *                                                  styles, what a cloud likeness costs, the local model status
 *   GET  /api/video-workbench/anime/character    ?id= → one character's full record (face marks, sprite boxes …)
 *   GET  /api/video-workbench/anime/file         ?id=&name= → one picture of a character (portrait, mouth / eye patches)
 *   POST /api/video-workbench/anime/upload       raw image body ?fileName=&name=&kind=photo|cartoon&stylize=cloud|local|none
 *                                                  &style=&confirmedCost=1 → { jobId } (new character from the picture)
 *   POST /api/video-workbench/anime/create       { projectDir, assetPath, name, kind, stylize, style, extraPrompt,
 *                                                  confirmedCost } → { jobId } (new character from a library picture)
 *   POST /api/video-workbench/anime/update       { id, name?, face?, mouthOriginal? } → { character } (face marks redraw
 *                                                  the mouth / eye pictures, a few hundred ms)
 *   POST /api/video-workbench/anime/rebuild      { id, restyle?, confirmedCost? } → { jobId }
 *   POST /api/video-workbench/anime/delete       { id } → moved to the library's recycle folder
 *   GET  /api/video-workbench/anime/estimate     ?engine=&durationSec=&mode=&characterId= → the cost of one presenter
 *                                                  clip (with the character: an existing 火山引擎 形象 is not counted)
 *   GET  /api/video-workbench/anime/local        → local model (tier 2) install status + catalog
 *   POST /api/video-workbench/anime/local/install { installDir?, mirror?, components?, force? } → { jobId }
 *   GET|POST /api/video-workbench/anime/cloud    → cloud presenter keys (tier 3; masked on GET; POST { config })
 *   POST /api/video-workbench/anime/cloud/test   { engine } → checks the saved key without generating anything (free)
 * Paid steps (the cloud likeness, tier-3 clips) only run with the caller's explicit confirmation.
 */
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  ANIME_STYLES,
  animeCharactersRoot,
  characterEngines,
  characterFileAbs,
  createCharacter,
  deleteCharacter,
  estimateStylizeCost,
  getCharacter,
  isCharacterId,
  listCharacters,
  rebuildCharacter,
  updateCharacter,
} from '../../dsh-tool-avatar/anime-character.js'
import { estimatePresenterCost, getPresenterEngines, PRESENTER_ENGINE_IDS } from '../../dsh-tool-avatar/anime-engines.js'

export const ANIME_ROUTES = Object.freeze([
  { path: '/api/video-workbench/anime/characters', methods: ['GET'] },
  { path: '/api/video-workbench/anime/character', methods: ['GET'] },
  { path: '/api/video-workbench/anime/file', methods: ['GET'] },
  { path: '/api/video-workbench/anime/upload', methods: ['POST'] },
  { path: '/api/video-workbench/anime/create', methods: ['POST'] },
  { path: '/api/video-workbench/anime/update', methods: ['POST'] },
  { path: '/api/video-workbench/anime/rebuild', methods: ['POST'] },
  { path: '/api/video-workbench/anime/delete', methods: ['POST'] },
  { path: '/api/video-workbench/anime/estimate', methods: ['GET'] },
  { path: '/api/video-workbench/anime/local', methods: ['GET'] },
  { path: '/api/video-workbench/anime/local/install', methods: ['POST'] },
  { path: '/api/video-workbench/anime/cloud', methods: ['GET', 'POST'] },
  { path: '/api/video-workbench/anime/cloud/test', methods: ['POST'] },
])
const ANIME_PATHS = new Set(ANIME_ROUTES.map((r) => r.path))
export const isAnimeRoute = (pathname) => ANIME_PATHS.has(pathname)

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif', '.tif', '.tiff'])
const SERVE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif' }
const MAX_PARALLEL_CREATES = 2

class AnimeRouteError extends Error {
  constructor(message, status = 400, code = '') {
    super(message)
    this.status = status
    this.expose = true
    if (code) this.code = code
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })

async function readBody(req) {
  try {
    const b = await req.json()
    return b && typeof b === 'object' && !Array.isArray(b) ? b : {}
  } catch {
    return {}
  }
}

const bool = (v) => v === true || v === 'true' || v === 1 || v === '1'

function idOf(raw) {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!isCharacterId(id)) throw new AnimeRouteError('动漫形象编号不正确')
  return id
}

/** The record as the panel sees it: no absolute folder, plus which engines it is ready for. */
function publicCharacter(c) {
  if (!c) return null
  const { dir, ...rest } = c
  void dir
  const cloud = {}
  for (const [k, v] of Object.entries(rest.cloud || {})) cloud[k] = { ready: Boolean(v?.avatarId || v?.ready), createdAt: v?.createdAt || v?.savedAt || '' }
  return { ...rest, cloud, engines: characterEngines(rest) }
}

function creationOptions(src) {
  const kind = src.kind === 'cartoon' ? 'cartoon' : 'photo'
  const stylize = ['cloud', 'local', 'none'].includes(src.stylize) ? src.stylize : kind === 'cartoon' ? 'none' : 'cloud'
  return {
    name: typeof src.name === 'string' ? src.name.slice(0, 24) : '',
    kind,
    stylize,
    style: ANIME_STYLES[src.style] ? src.style : 'anime',
    extraPrompt: typeof src.extraPrompt === 'string' ? src.extraPrompt.slice(0, 200) : '',
    confirmedCost: bool(src.confirmedCost),
  }
}

/** The local model status as the panel needs it (no folders / interpreter paths). */
function publicLocalStatus(st) {
  if (!st || typeof st !== 'object') return null
  const pick = (o, keys) => (o && typeof o === 'object' ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : undefined)
  return {
    ready: Boolean(st.ready),
    stylizeReady: Boolean(st.stylizeReady),
    installed: pick(st.installed, ['tha3', 'stylize']) || {},
    tha3: pick(st.tha3, ['installed', 'variant', 'variants']),
    stylize: pick(st.stylize, ['installed', 'styles']),
    device: st.device || '',
    gpu: st.gpu || '',
    speed: st.speed ?? null,
    version: st.version || 0,
    installedAt: st.installedAt || '',
    summary: st.summary || st.message || '',
    notice: st.notice || '',
  }
}

const progressOf = (onProgress) => (p) => onProgress?.({ progress: Number.isFinite(Number(p?.pct)) ? Math.max(5, Math.min(99, Number(p.pct))) : undefined, message: p?.message || '' })

let creating = 0
let installJob = null

function startCreateJob(createBackgroundJob, message, runner) {
  if (creating >= MAX_PARALLEL_CREATES) throw new AnimeRouteError('已经有两个动漫形象在生成了，请等它们完成', 409, 'BUSY')
  creating++
  return createBackgroundJob(message, async (onProgress) => {
    try {
      return await runner(onProgress)
    } finally {
      creating--
    }
  })
}

async function cloudModule() {
  try {
    return await import('../../dsh-tool-avatar/anime-cloud.js')
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
}

async function localInstaller() {
  try {
    return await import('../../dsh-tool-avatar/anime-installer.js')
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND') return null
    throw err
  }
}

/** Returns a Response for the anime routes, or null when the path is not one of them. */
export async function handleAnimeApiRequest(req, url = new URL(req.url, 'http://localhost'), opts = {}) {
  const { pathname } = url
  if (!isAnimeRoute(pathname)) return null
  const createBackgroundJob = opts.createBackgroundJob
  try {
    if (pathname === '/api/video-workbench/anime/characters') {
      const [engines, stylize] = await Promise.all([getPresenterEngines().catch(() => []), estimateStylizeCost().catch((err) => ({ configured: false, supported: false, reason: String(err?.message || err) }))])
      let local = null
      try {
        const m = await localInstaller()
        local = m?.getAnimeLocalStatus ? await m.getAnimeLocalStatus() : null
      } catch {}
      return json({
        ok: true,
        characters: listCharacters(),
        engines,
        styles: Object.entries(ANIME_STYLES).map(([value, s]) => ({ value, label: s.label })),
        stylize,
        local: publicLocalStatus(local),
        creating,
      })
    }

    if (pathname === '/api/video-workbench/anime/character') {
      const c = getCharacter(idOf(url.searchParams.get('id')))
      if (!c) throw new AnimeRouteError('这个动漫形象不存在', 404)
      return json({ ok: true, character: publicCharacter(c) })
    }

    if (pathname === '/api/video-workbench/anime/file') {
      const id = idOf(url.searchParams.get('id'))
      const name = basename(String(url.searchParams.get('name') || ''))
      const ext = extname(name).toLowerCase()
      if (!name || !SERVE_TYPES[ext]) throw new AnimeRouteError('只能读取形象图片')
      const c = getCharacter(id)
      if (!c) throw new AnimeRouteError('这个动漫形象不存在', 404)
      const abs = characterFileAbs(c, name)
      if (!abs || !existsSync(abs)) throw new AnimeRouteError('图片不存在', 404)
      return new Response(readFileSync(abs), { status: 200, headers: { 'Content-Type': SERVE_TYPES[ext], 'Cache-Control': 'no-cache' } })
    }

    if (pathname === '/api/video-workbench/anime/upload') {
      const fileName = basename(String(url.searchParams.get('fileName') || 'photo.png'))
      const ext = extname(fileName).toLowerCase()
      if (!IMAGE_EXT.has(ext)) throw new AnimeRouteError('请选择图片文件（PNG / JPG / WebP）')
      const buf = Buffer.from(await req.arrayBuffer())
      if (!buf.length) throw new AnimeRouteError('没有收到图片')
      if (buf.length > MAX_UPLOAD_BYTES) throw new AnimeRouteError('图片太大了（超过 30 MB）', 413)
      const o = creationOptions(Object.fromEntries(url.searchParams.entries()))
      if (o.stylize === 'cloud' && !o.confirmedCost) throw new AnimeRouteError('云端生成动漫形象要花一点钱，请先确认费用', 400, 'COST_NOT_CONFIRMED')
      const upDir = join(animeCharactersRoot(), '.uploads')
      mkdirSync(upDir, { recursive: true })
      const tmp = join(upDir, `${Date.now()}-${randomBytes(3).toString('hex')}${ext === '.jpeg' ? '.jpg' : ext}`)
      writeFileSync(tmp, buf)
      const job = startCreateJob(createBackgroundJob, o.stylize === 'cloud' ? '正在用云端生图把照片画成动漫形象…' : o.stylize === 'local' ? '正在用本地模型把照片画成动漫形象…' : '正在抠出形象、画嘴型和眨眼…', async (onProgress) => {
        try {
          const c = await createCharacter({ ...o, sourceAbs: tmp, onProgress: progressOf(onProgress) })
          return { ok: true, character: publicCharacter(c) }
        } finally {
          try {
            unlinkSync(tmp)
          } catch {}
        }
      })
      return json({ ok: true, async: true, jobId: job.id, job })
    }

    if (pathname === '/api/video-workbench/anime/create') {
      const body = await readBody(req)
      const projectDir = typeof body.projectDir === 'string' && isAbsolute(body.projectDir) ? resolve(body.projectDir) : ''
      if (!projectDir || !existsSync(join(projectDir, 'script.json'))) throw new AnimeRouteError('缺少视频工程目录')
      const raw = String(body.assetPath || '').trim()
      const abs = raw ? (isAbsolute(raw) ? resolve(raw) : resolve(projectDir, raw)) : ''
      const rel = abs ? relative(projectDir, abs) : ''
      if (!abs || !rel || rel.startsWith('..') || isAbsolute(rel)) throw new AnimeRouteError('只能用工程素材库里的图片')
      if (!existsSync(abs) || !statSync(abs).isFile()) throw new AnimeRouteError('找不到这张图片', 404)
      const o = creationOptions(body)
      if (o.stylize === 'cloud' && !o.confirmedCost) throw new AnimeRouteError('云端生成动漫形象要花一点钱，请先确认费用', 400, 'COST_NOT_CONFIRMED')
      const job = startCreateJob(createBackgroundJob, '正在生成动漫形象…', async (onProgress) => ({ ok: true, character: publicCharacter(await createCharacter({ ...o, sourceAbs: abs, onProgress: progressOf(onProgress) })) }))
      return json({ ok: true, async: true, jobId: job.id, job })
    }

    if (pathname === '/api/video-workbench/anime/update') {
      const body = await readBody(req)
      const id = idOf(body.id)
      const face = body.face && typeof body.face === 'object' ? body.face : undefined
      const c = await updateCharacter(id, { name: typeof body.name === 'string' ? body.name : undefined, face, mouthOriginal: body.mouthOriginal })
      return json({ ok: true, character: publicCharacter(c) })
    }

    if (pathname === '/api/video-workbench/anime/rebuild') {
      const body = await readBody(req)
      const id = idOf(body.id)
      if (!getCharacter(id)) throw new AnimeRouteError('这个动漫形象不存在', 404)
      const job = startCreateJob(createBackgroundJob, '正在重新生成动漫形象…', async (onProgress) => ({
        ok: true,
        character: publicCharacter(await rebuildCharacter(id, { restyle: bool(body.restyle), confirmedCost: bool(body.confirmedCost), onProgress: progressOf(onProgress) })),
      }))
      return json({ ok: true, async: true, jobId: job.id, job })
    }

    if (pathname === '/api/video-workbench/anime/delete') {
      const body = await readBody(req)
      const res = await deleteCharacter(idOf(body.id))
      return json({ ok: true, deleted: !res.missing })
    }

    if (pathname === '/api/video-workbench/anime/estimate') {
      const engine = String(url.searchParams.get('engine') || 'sprite')
      if (!PRESENTER_ENGINE_IDS.includes(engine)) throw new AnimeRouteError('不认识的数字人方式')
      const durationSec = Math.max(0, Math.min(4 * 3600, Number(url.searchParams.get('durationSec')) || 0))
      const cid = String(url.searchParams.get('characterId') || '').trim()
      const character = cid && isCharacterId(cid) ? getCharacter(cid) : null
      const estimate = await estimatePresenterCost({ engine, durationSec, mode: String(url.searchParams.get('mode') || '').slice(0, 24), character })
      return json({ ok: true, estimate })
    }

    if (pathname === '/api/video-workbench/anime/local') {
      const m = await localInstaller()
      if (!m) return json({ ok: true, available: false, reason: '本地动漫模型的安装程序还没有就绪' })
      const status = m.getAnimeLocalStatus ? await m.getAnimeLocalStatus() : null
      const catalog = m.getAnimeLocalCatalog ? await m.getAnimeLocalCatalog() : null
      return json({ ok: true, available: true, status: publicLocalStatus(status), catalog, installing: installJob ? { jobId: installJob.id } : null })
    }

    if (pathname === '/api/video-workbench/anime/local/install') {
      const m = await localInstaller()
      if (!m?.installAnimeLocal) throw new AnimeRouteError('本地动漫模型的安装程序还没有就绪', 503)
      if (installJob) throw new AnimeRouteError('本地动漫模型正在安装，请等它完成', 409, 'BUSY')
      const body = await readBody(req)
      const installDir = typeof body.installDir === 'string' ? body.installDir.trim().slice(0, 400) : ''
      if (installDir && !isAbsolute(installDir)) throw new AnimeRouteError('安装目录要写完整路径，例如 D:/dsh-ai/anime')
      const components = Array.isArray(body.components) ? body.components.filter((x) => x === 'tha3' || x === 'stylize') : undefined
      const job = createBackgroundJob('📦 正在安装本地动漫模型…', async (onProgress) => {
        try {
          return await m.installAnimeLocal({ installDir, mirror: body.mirror === 'global' ? 'global' : 'cn', components, force: bool(body.force), onProgress })
        } finally {
          installJob = null
        }
      })
      installJob = job
      return json({ ok: true, async: true, jobId: job.id, job })
    }

    if (pathname === '/api/video-workbench/anime/cloud') {
      const m = await cloudModule()
      if (!m) return json({ ok: true, available: false, reason: '云端动漫数字人还没有就绪' })
      if (req.method === 'GET') {
        const summary = m.getAnimeCloudConfigSummary ? await m.getAnimeCloudConfigSummary() : m.getAnimeCloudStatus ? await m.getAnimeCloudStatus() : {}
        return json({ ok: true, available: true, config: summary })
      }
      if (!m.saveAnimeCloudConfig) throw new AnimeRouteError('云端动漫数字人的设置还不能保存', 503)
      const body = await readBody(req)
      const saved = await m.saveAnimeCloudConfig(body.config && typeof body.config === 'object' ? body.config : body)
      const summary = m.getAnimeCloudConfigSummary ? await m.getAnimeCloudConfigSummary() : saved
      return json({ ok: true, available: true, config: summary })
    }

    if (pathname === '/api/video-workbench/anime/cloud/test') {
      const m = await cloudModule()
      if (!m?.testAnimeCloudConnection) throw new AnimeRouteError('云端动漫数字人还没有就绪', 503)
      const body = await readBody(req)
      const engine = String(body.engine || '')
      if (!['vidu', 'volc', 'runway'].includes(engine)) throw new AnimeRouteError('不认识的云端数字人服务')
      return json({ ok: true, result: await m.testAnimeCloudConnection({ engine }) })
    }
    return null
  } catch (err) {
    const status = Number(err?.status)
    const code = err?.code ? String(err.code) : ''
    return json({ ok: false, error: String(err?.message || err), ...(code ? { code } : {}) }, err?.expose === true && status >= 400 && status < 600 ? status : code ? 400 : 500)
  }
}
