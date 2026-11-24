/**
 * Delivery / colour REST routes for the Web Studio (UI wiring comes later):
 *   POST /api/video-workbench/export     { projectDir, formats?, mp4Path?, stemsEnabled?, lut?, lutIntensity? }
 *   POST /api/video-workbench/scopes     { projectDir, timeSec?, mp4Path?, kinds? }
 *   GET  /api/video-workbench/color-lut  → built-in LUT list
 *   POST /api/video-workbench/color-lut  { projectDir, lut, intensity?, mp4Path?, outputPath?, overwrite? }
 *        (writes only inside <project>/output/: outputPath is relative to it, absolute / .. / UNC paths → 400; an existing
 *        file is never replaced unless overwrite: true → 409 OUTPUT_EXISTS; the default name gets -2, -3 … instead)
 *   POST /api/video-workbench/qa-deep    { projectDir, mp4Path?, freezeThresholdSec? } (QA incl. determinism check)
 *   POST /api/video-workbench/delivery/save-as { projectDir, rel, suggestedName?, what? }
 *        (「另存为」: shows this computer's own Save-As window and copies the project file `rel` to the place picked there;
 *        the destination never comes from the request — see save-dialog.js. Answers { ok, cancelled } or
 *        { ok, savedPath, fileName, bytes }; NATIVE_DIALOG_UNAVAILABLE (501) / NATIVE_DIALOG_REMOTE (403) /
 *        NATIVE_DIALOG_BUSY (409) tell the kit to fall back to a plain download)
 * Every generated file is also returned as an `/api/video-workbench/asset` URL when it lives inside the project.
 */
import { relative, resolve } from 'node:path'
import { readScriptJson } from '../../shared/index.js'
import { SaveAsError, saveDeliverableAs } from './save-dialog.js'
import {
  applyProjectColorLut,
  exportProjectPackage,
  listColorLuts,
  renderVideoScopes,
  runPostRenderQa,
} from '../../dsh-tool-video-suite/index.js'

export const DELIVERY_ROUTES = Object.freeze([
  { path: '/api/video-workbench/export', methods: ['POST'] },
  { path: '/api/video-workbench/scopes', methods: ['POST'] },
  { path: '/api/video-workbench/color-lut', methods: ['GET', 'POST'] },
  { path: '/api/video-workbench/qa-deep', methods: ['POST'] },
  { path: '/api/video-workbench/delivery/save-as', methods: ['POST'] },
])

const DELIVERY_PATHS = new Set(DELIVERY_ROUTES.map((r) => r.path))

export function isDeliveryRoute(pathname) {
  return DELIVERY_PATHS.has(pathname)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

async function readBody(req) {
  try {
    return await req.json()
  } catch {
    return {}
  }
}

/** Client-input errors thrown by the delivery modules (`expose` + a 4xx `status`) as a JSON response; null for anything else. */
function clientErrorResponse(err) {
  const status = Number(err?.status)
  if (err?.expose !== true || !Number.isInteger(status) || status < 400 || status >= 500) return null
  return json({ ok: false, error: err.message, ...(err.code ? { code: err.code } : {}) }, status)
}

function assetUrl(projectDir, absPath) {
  if (!projectDir || typeof absPath !== 'string' || !absPath) return ''
  const root = resolve(projectDir)
  const rel = relative(root, resolve(absPath)).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) return ''
  return `/api/video-workbench/asset?projectDir=${encodeURIComponent(root)}&rel=${encodeURIComponent(rel)}&t=${Date.now()}`
}

function mapUrls(projectDir, files) {
  const out = {}
  for (const [k, v] of Object.entries(files || {})) {
    if (typeof v === 'string') out[k] = assetUrl(projectDir, v)
    else if (v && typeof v === 'object') out[k] = mapUrls(projectDir, v)
  }
  return out
}

/**
 * Returns a Response for the delivery routes, or null when the path is not one of them.
 */
export async function handleDeliveryApiRequest(req, url = new URL(req.url, 'http://localhost')) {
  const pathname = url.pathname
  if (!isDeliveryRoute(pathname)) return null

  if (pathname === '/api/video-workbench/export') {
    if (req.method !== 'POST') return json({ ok: false, error: '仅支持 POST' }, 405)
    const body = await readBody(req)
    if (!body.projectDir) return json({ ok: false, error: 'projectDir is required' }, 400)
    const res = await exportProjectPackage({
      projectDir: body.projectDir,
      formats: Array.isArray(body.formats) || typeof body.formats === 'string' ? body.formats : undefined,
      mp4Path: body.mp4Path || undefined,
      stemsEnabled: Boolean(body.stemsEnabled),
      lut: body.lut || '',
      lutIntensity: body.lutIntensity ?? 1,
    })
    return json({ ...res, urls: mapUrls(res.projectDir, res.files) })
  }

  if (pathname === '/api/video-workbench/scopes') {
    if (req.method !== 'POST') return json({ ok: false, error: '仅支持 POST' }, 405)
    const body = await readBody(req)
    if (!body.projectDir) return json({ ok: false, error: 'projectDir is required' }, 400)
    const res = await renderVideoScopes({
      projectDir: body.projectDir,
      mp4Path: body.mp4Path || undefined,
      timeSec: Number(body.timeSec) || 0,
      kinds: Array.isArray(body.kinds) ? body.kinds : undefined,
    })
    return json({ ...res, urls: mapUrls(body.projectDir, res.files) })
  }

  if (pathname === '/api/video-workbench/color-lut') {
    if (req.method === 'GET') {
      return json({ ok: true, luts: listColorLuts().map(({ id, label, description }) => ({ id, label, description })) })
    }
    if (req.method !== 'POST') return json({ ok: false, error: '仅支持 GET / POST' }, 405)
    const body = await readBody(req)
    if (!body.projectDir || !body.lut) return json({ ok: false, error: 'projectDir 与 lut 均为必填' }, 400)
    let res
    try {
      res = await applyProjectColorLut({
        projectDir: body.projectDir,
        lut: body.lut,
        intensity: body.intensity ?? 1,
        mp4Path: body.mp4Path || undefined,
        outputPath: body.outputPath || undefined,
        overwrite: body.overwrite === true,
      })
    } catch (err) {
      const clientError = clientErrorResponse(err)
      if (clientError) return clientError
      throw err
    }
    return json({ ...res, url: assetUrl(res.projectDir, res.outputPath) })
  }

  if (pathname === '/api/video-workbench/qa-deep') {
    if (req.method !== 'POST') return json({ ok: false, error: '仅支持 POST' }, 405)
    const body = await readBody(req)
    if (!body.projectDir) return json({ ok: false, error: 'projectDir is required' }, 400)
    const { data } = readScriptJson(body.projectDir)
    const qa = await runPostRenderQa({
      projectDir: body.projectDir,
      mp4Path: body.mp4Path || undefined,
      script: data,
      deep: body.deep !== false,
      freezeThresholdSec: body.freezeThresholdSec,
    })
    return json({ ok: true, qa })
  }

  if (pathname === '/api/video-workbench/delivery/save-as') {
    if (req.method !== 'POST') return json({ ok: false, error: '仅支持 POST' }, 405)
    const raw = await readBody(req)
    const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    try {
      // only these fields are read: a destination path in the body would be ignored (it comes from the dialog)
      const res = await saveDeliverableAs({
        projectDir: body.projectDir,
        rel: body.rel,
        suggestedName: typeof body.suggestedName === 'string' ? body.suggestedName : '',
        what: typeof body.what === 'string' ? body.what : '',
        request: req,
      })
      return json({ ok: true, ...res })
    } catch (err) {
      if (err instanceof SaveAsError) return json({ ok: false, error: err.message, code: err.code }, err.status)
      throw err
    }
  }

  return null
}
