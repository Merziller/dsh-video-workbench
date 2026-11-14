import { existsSync, mkdirSync } from 'node:fs'
import { basename, extname, isAbsolute, join, resolve } from 'node:path'
import {
  createAbortError,
  readScriptJson,
  resolveBinaries,
  resolveVideoDimensions,
  runCommandRedirected,
  writeScriptJson,
} from '@dsh-video/shared'
import { readAssets, writeAssets } from './asset-manager.js'

const STYLE_COLOR_GRADE = {
  tech: 'eq=contrast=1.06:saturation=1.12:brightness=0.01',
  'minimal-editorial': 'eq=contrast=1.03:saturation=0.92:brightness=0.02',
  'vibrant-brand': 'eq=contrast=1.08:saturation=1.22:brightness=0.02',
  cinema: 'eq=contrast=1.10:saturation=1.05:brightness=-0.01',
}

/**
 * Curate, smart-crop, color-grade, speed-scale, and optionally chroma-key visual assets
 * via FFmpeg into `assets/edited/` while keeping originals untouched.
 */
export async function executeCurateAndEditAssets(options = {}) {
  const {
    projectDir,
    aspectRatio = 'auto',
    quality = '1080p',
    width,
    height,
    style = 'tech',
    trimSeconds = 0,
    clipSpeed = 1.0,
    chromaKeyColor = '',
    enhanceColor = true,
    includeAvatarBase = false,
    signal,
    onChild,
    onProgress,
  } = options

  if (!projectDir) throw new Error('projectDir is required for curate_and_edit_assets')
  if (signal?.aborted) throw createAbortError()

  const absDir = resolve(projectDir)
  const { ffmpeg } = resolveBinaries()
  const manifest = readAssets(absDir)
  const scriptObj = existsSync(join(absDir, 'script.json')) ? readScriptJson(absDir).data : null

  const dims = resolveVideoDimensions({
    aspectRatio: aspectRatio || scriptObj?.aspectRatio || '16:9',
    quality: quality || scriptObj?.quality || '1080p',
    width: width || scriptObj?.width,
    height: height || scriptObj?.height,
    topic: scriptObj?.topic || scriptObj?.title || '',
    assets: (manifest.items || []).filter((i) => i.type === 'image' || i.type === 'video'),
  })

  const targetW = dims.width
  const targetH = dims.height
  const safeSpeed = Math.max(0.5, Math.min(2.5, Number(clipSpeed) || 1.0))
  const safeTrim = Math.max(0, Number(trimSeconds) || 0)
  const gradeFilter = enhanceColor ? (STYLE_COLOR_GRADE[style || scriptObj?.style] || STYLE_COLOR_GRADE.tech) : ''

  const visuals = (manifest.items || []).filter((it) => {
    if (it.type !== 'image' && it.type !== 'video') return false
    if (!includeAvatarBase && it.role === 'avatar_base') return false
    return true
  })

  if (visuals.length === 0) {
    return {
      ok: true,
      editedCount: 0,
      targetWidth: targetW,
      targetHeight: targetH,
      items: [],
      message: '暂无可剪辑的视觉图片或视频素材，已跳过剪辑精修步骤。',
    }
  }

  const outDir = join(absDir, 'assets', 'edited')
  mkdirSync(outDir, { recursive: true })

  const editedItems = []
  for (let i = 0; i < visuals.length; i++) {
    if (signal?.aborted) throw createAbortError()
    const item = visuals[i]
    const srcAbs = isAbsolute(item.path) ? item.path : resolve(absDir, item.path)
    if (!existsSync(srcAbs)) continue

    onProgress?.({
      progress: Math.round(((i + 0.5) / visuals.length) * 100),
      message: `正在智能剪辑精修 (${i + 1}/${visuals.length}): ${item.originalName || item.name || item.id}`,
    })

    const baseName = `${item.id || `clip-${i + 1}`}`
    const wantsChroma = Boolean(chromaKeyColor && /^#[0-9a-f]{6}$/i.test(String(chromaKeyColor).trim()))

    const vfChain = [
      `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase`,
      `crop=${targetW}:${targetH}`,
      'setsar=1',
    ]
    if (gradeFilter) vfChain.push(gradeFilter)

    if (item.type === 'image') {
      const outRel = `assets/edited/${baseName}-edited.png`
      const outAbs = join(absDir, outRel)
      if (wantsChroma) {
        const hex = String(chromaKeyColor).trim().replace(/^#/, '0x')
        vfChain.push(`colorkey=${hex}:0.14:0.08`, 'format=rgba')
      } else {
        vfChain.push('format=rgba')
      }
      const res = await runCommandRedirected(
        ffmpeg,
        ['-y', '-i', srcAbs, '-vf', vfChain.join(','), '-frames:v', '1', outAbs],
        { timeoutMs: 45_000, signal, onChild },
      )
      if (res.code === 0 && existsSync(outAbs)) {
        item.editedPath = outRel
        item.editedWebPath = `./${outRel}`
        item.editedSpec = { width: targetW, height: targetH, style: style || 'tech', chromaKeyColor: wantsChroma ? chromaKeyColor : '' }
        editedItems.push({ id: item.id, type: item.type, editedPath: outRel })
      }
    } else {
      const extOut = wantsChroma ? 'webm' : 'mp4'
      const outRel = `assets/edited/${baseName}-edited.${extOut}`
      const outAbs = join(absDir, outRel)
      if (Math.abs(safeSpeed - 1.0) > 0.02) {
        vfChain.push(`setpts=PTS/${safeSpeed.toFixed(3)}`)
      }
      if (wantsChroma) {
        const hex = String(chromaKeyColor).trim().replace(/^#/, '0x')
        vfChain.push(`colorkey=${hex}:0.14:0.08`, 'format=yuva420p')
      } else {
        vfChain.push('format=yuv420p')
      }

      const ffArgs = ['-y', '-i', srcAbs]
      if (safeTrim > 0) {
        ffArgs.push('-t', String(safeTrim))
      }
      ffArgs.push('-vf', vfChain.join(','))
      if (wantsChroma) {
        ffArgs.push('-c:v', 'libvpx', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '2200k', '-an')
      } else {
        ffArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart')
      }
      ffArgs.push(outAbs)

      const res = await runCommandRedirected(ffmpeg, ffArgs, { timeoutMs: 120_000, signal, onChild })
      if (res.code === 0 && existsSync(outAbs)) {
        item.editedPath = outRel
        item.editedWebPath = `./${outRel}`
        item.editedSpec = {
          width: targetW,
          height: targetH,
          style: style || 'tech',
          clipSpeed: safeSpeed,
          trimSeconds: safeTrim,
          chromaKeyColor: wantsChroma ? chromaKeyColor : '',
        }
        editedItems.push({ id: item.id, type: item.type, editedPath: outRel })
      }
    }
  }

  writeAssets(absDir, manifest)

  // Map edited paths onto script.json media entries if scenes exist
  if (scriptObj && Array.isArray(scriptObj.scenes)) {
    const editedByPath = new Map()
    const editedById = new Map()
    for (const it of manifest.items || []) {
      if (it.editedPath) {
        editedByPath.set(it.path, it.editedPath)
        editedById.set(it.id, it.editedPath)
      }
    }
    let updatedScenes = false
    for (const sc of scriptObj.scenes) {
      if (Array.isArray(sc.media)) {
        for (const m of sc.media) {
          const matched = (m.assetId && editedById.get(m.assetId)) || editedByPath.get(m.originalPath || m.path)
          if (matched) {
            if (!m.originalPath) m.originalPath = m.path
            m.path = matched
            updatedScenes = true
          }
        }
      }
    }
    if (updatedScenes) {
      writeScriptJson(absDir, scriptObj)
    }
  }

  onProgress?.({
    progress: 100,
    message: `素材智能剪辑完成：共处理 ${editedItems.length} 个视觉素材 (${targetW}x${targetH})`,
  })

  return {
    ok: true,
    editedCount: editedItems.length,
    targetWidth: targetW,
    targetHeight: targetH,
    style: style || scriptObj?.style || 'tech',
    items: editedItems,
  }
}
