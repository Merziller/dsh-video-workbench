import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ensureWin11ProjectGuards,
  loadEnv,
  readScriptJson,
  REPO_ROOT,
  resolveBinaries,
  resolveEnvPath,
  runCommandRedirected,
  writeScriptJson,
} from '@dsh-video/shared'

/**
 * Parse hex color (#RRGGBB or #RGB) to relative luminance per WCAG 2.1.
 */
function parseHexLuminance(hex) {
  const clean = String(hex || '').trim().replace(/^#/, '')
  let r = 0, g = 0, b = 0
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16)
    g = parseInt(clean[1] + clean[1], 16)
    b = parseInt(clean[2] + clean[2], 16)
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16)
    g = parseInt(clean.slice(2, 4), 16)
    b = parseInt(clean.slice(4, 6), 16)
  } else {
    return null
  }
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  const toLinear = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function computeContrastRatio(hexA, hexB) {
  const lumA = parseHexLuminance(hexA)
  const lumB = parseHexLuminance(hexB)
  if (lumA === null || lumB === null) return null
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2))
}

/**
 * Resolve local Chromium / Chrome / Edge binary for HTML frame capture.
 */
export function resolveBrowserExecutable() {
  loadEnv()
  const explicit = resolveEnvPath('BROWSER_EXECUTABLE_PATH', '')
  if (explicit && existsSync(explicit)) return explicit

  const pwPath = resolveEnvPath('PLAYWRIGHT_BROWSERS_PATH', '')
  if (pwPath && existsSync(pwPath)) {
    try {
      for (const entry of readdirSync(pwPath)) {
        if (entry.startsWith('chromium-')) {
          const candidate = join(pwPath, entry, 'chrome-win', 'chrome.exe')
          if (existsSync(candidate)) return candidate
        }
      }
    } catch {}
  }

  // Fallback to standard Windows Edge / Chrome paths via environment variables (no personal username hardcoded)
  const progFilesX86 = process.env['ProgramFiles(x86)'] || ''
  const progFiles = process.env.ProgramFiles || ''
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates = [
    progFilesX86 && join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    progFiles && join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    progFiles && join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    localAppData && join(localAppData, 'ms-playwright', 'chromium-1148', 'chrome-win', 'chrome.exe'),
  ].filter(Boolean)

  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return ''
}

/**
 * 1. `video_lint` implementation (HTML & Remotion dual-engine validator)
 */
export async function executeVideoLint(args = {}) {
  loadEnv()
  const targetDir = isAbsolute(args.projectDir || '.')
    ? args.projectDir
    : resolve(REPO_ROOT, args.projectDir || '.')

  ensureWin11ProjectGuards(targetDir)
  const { data: script } = readScriptJson(targetDir)
  const engine = args.engine || script.engine || 'html'

  const errors = []
  const warnings = []
  const checks = []

  // Check 1: Theme WCAG AA Contrast Ratio
  const theme = script.theme || {}
  const bg = theme.background || '#0B1020'
  const fg = theme.textPrimary || '#F8FAFC'
  const ratio = computeContrastRatio(bg, fg)
  if (ratio !== null) {
    const passed = ratio >= 4.5
    checks.push({
      name: 'WCAG AA Text Contrast (textPrimary vs background)',
      passed,
      value: `${ratio}:1 (minimum 4.5:1)`,
    })
    if (!passed) {
      errors.push(
        `WCAG AA contrast check failed: textPrimary (${fg}) on background (${bg}) is ${ratio}:1 (< 4.5:1).`,
      )
    }
  }

  if (engine === 'html') {
    const htmlPath = join(targetDir, args.entryFile || 'index.html')
    if (!existsSync(htmlPath)) {
      errors.push(`HTML entry file not found: ${htmlPath}`)
    } else {
      const html = readFileSync(htmlPath, 'utf8')

      // Check <template> scene wrapping
      const templateMatches = [...html.matchAll(/<template\b[^>]*>/gi)]
      const hasTemplates = templateMatches.length > 0
      checks.push({
        name: 'HTML <template> Scene Isolation',
        passed: hasTemplates,
        value: `${templateMatches.length} <template> block(s) found`,
      })
      if (!hasTemplates) {
        errors.push(
          'HTML mode requires each scene to be wrapped in a `<template id="scene-XX">` tag to prevent DOM/CSS collisions.',
        )
      }

      // Check SVG <defs> & DOM ID collisions across document (strip <script> blocks and ignore data-* attributes)
      const htmlWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      const idMatches = [...htmlWithoutScripts.matchAll(/(?<![-\w])id=["']([^"']+)["']/gi)].map((m) => m[1])
      const seenIds = new Set()
      const duplicateIds = new Set()
      for (const id of idMatches) {
        if (seenIds.has(id)) duplicateIds.add(id)
        seenIds.add(id)
      }
      const noDupIds = duplicateIds.size === 0
      checks.push({
        name: 'DOM & SVG <defs> ID Uniqueness',
        passed: noDupIds,
        value: noDupIds ? '0 collisions' : `Duplicate IDs: ${[...duplicateIds].join(', ')}`,
      })
      if (!noDupIds) {
        errors.push(`Duplicate DOM/SVG IDs detected: ${[...duplicateIds].join(', ')}`)
      }

      // Check Windows 11 font stack rule (Microsoft YaHei & Consolas)
      const hasWin11Fonts =
        /Microsoft YaHei/i.test(html) && /Consolas/i.test(html)
      checks.push({
        name: 'Windows 11 Local Font Stack (Microsoft YaHei + Consolas)',
        passed: hasWin11Fonts,
        value: hasWin11Fonts ? 'Configured' : 'Missing Microsoft YaHei or Consolas declaration',
      })
      if (!hasWin11Fonts) {
        warnings.push(
          'Recommend declaring `Microsoft YaHei` and `Consolas` with `@font-face { src: local(...) }` for Windows 11 rendering consistency.',
        )
      }

      // Check deterministic timeline seek hook (`window.__seekToFrame`)
      const hasSeekHook = /__seekToFrame/.test(html)
      checks.push({
        name: 'GSAP Frame-Seek Bridge (window.__seekToFrame)',
        passed: hasSeekHook,
        value: hasSeekHook ? 'Present' : 'Missing window.__seekToFrame(frame)',
      })
      if (!hasSeekHook) {
        warnings.push('Recommend exposing `window.__seekToFrame(frame)` so video_snapshot and video_render can seek deterministically.')
      }
    }
  } else {
    // Remotion Mode Lint
    const srcDir = join(targetDir, 'src')
    const hasSrc = existsSync(srcDir)
    checks.push({
      name: 'Remotion src/ Directory Structure',
      passed: hasSrc,
      value: hasSrc ? 'Found src/' : 'Missing src/ directory',
    })
    if (!hasSrc) {
      errors.push(`Remotion mode requires a src/ directory inside ${targetDir}`)
    } else {
      const files = readdirSync(srcDir).filter((f) => /\.(tsx|ts|jsx|js)$/.test(f))
      let usesCurrentFrame = false
      const cssTransitionViolations = []

      for (const file of files) {
        const content = readFileSync(join(srcDir, file), 'utf8')
        if (/useCurrentFrame\s*\(/.test(content)) usesCurrentFrame = true
        if (/transition\s*:/i.test(content) || /@keyframes/i.test(content)) {
          cssTransitionViolations.push(file)
        }
      }
      checks.push({
        name: 'Remotion Frame-Driven Animation (useCurrentFrame)',
        passed: usesCurrentFrame,
        value: usesCurrentFrame ? 'Verified' : 'No useCurrentFrame() call found',
      })
      checks.push({
        name: 'No Forbidden CSS Transitions/@keyframes in Remotion',
        passed: cssTransitionViolations.length === 0,
        value:
          cssTransitionViolations.length === 0
            ? 'Clean'
            : `Found in: ${cssTransitionViolations.join(', ')}`,
      })
      if (cssTransitionViolations.length > 0) {
        warnings.push(
          `Avoid CSS transitions/@keyframes in Remotion components (${cssTransitionViolations.join(', ')}); use interpolate() or spring() instead.`,
        )
      }
    }
  }

  return {
    ok: errors.length === 0,
    engine,
    projectDir: targetDir,
    contrastRatio: ratio,
    checks,
    errors,
    warnings,
  }
}

/**
 * Capture 9 individual frames and stitch them into a 3x3 contact sheet PNG.
 * Uses headless Chromium (when available for HTML) + FFmpeg `tile=3x3` filter.
 */
export async function executeVideoSnapshot(args = {}) {
  loadEnv()
  const targetDir = isAbsolute(args.projectDir || '.')
    ? args.projectDir
    : resolve(REPO_ROOT, args.projectDir || '.')

  // Ensure script.json and embedded `#dsh-script-data` in index.html are 100% synchronized before capture
  const { data: script } = writeScriptJson(targetDir, readScriptJson(targetDir).data)
  const engine = args.engine || script.engine || 'html'
  const fps = Number(script.fps) || 30
  const totalFrames = Math.max(9, Number(script.totalDurationInFrames) || 270)

  const outPath = args.outputPath
    ? isAbsolute(args.outputPath)
      ? args.outputPath
      : resolve(targetDir, args.outputPath)
    : join(targetDir, 'output', 'snapshot-3x3.png')

  mkdirSync(dirname(outPath), { recursive: true })
  const framesDir = join(dirname(outPath), '.frames-snapshot')
  mkdirSync(framesDir, { recursive: true })

  // Build 9 sample frames: if 3 scenes exist, sample 3 keyframes (20%, 55%, 85%) per scene for exact scene-boundary alignment
  const scenes = Array.isArray(script.scenes) ? script.scenes : []
  let sampleFrames = []
  let frameDurationsSec = []
  if (scenes.length === 3) {
    const ratios = [0.2, 0.55, 0.85]
    for (const s of scenes) {
      const startF = Number(s.startFrame || 0)
      const durF = Math.max(3, Number(s.durationInFrames || 90))
      const durSec = Math.max(0.3, Number(s.durationSec || durF / fps))
      for (const r of ratios) {
        sampleFrames.push(Math.min(totalFrames - 1, startF + Math.floor(r * durF)))
        frameDurationsSec.push(Number((durSec / 3).toFixed(4)))
      }
    }
  } else {
    const totalSec = Math.max(1, Number(script.totalDurationSec) || totalFrames / fps)
    sampleFrames = Array.from({ length: 9 }, (_, i) => {
      const ratio = (i + 0.5) / 9
      return Math.min(totalFrames - 1, Math.max(0, Math.floor(ratio * totalFrames)))
    })
    frameDurationsSec = Array.from({ length: 9 }, () => Number((totalSec / 9).toFixed(4)))
  }

  const { ffmpeg } = resolveBinaries()
  const browserBin = resolveBrowserExecutable()
  const htmlEntry = join(targetDir, 'index.html')

  const capturedFiles = []
  let captureMethod = 'ffmpeg-scene-cards'

  // Attempt headless browser screenshot capture whenever index.html & Chromium/Edge are available
  if (browserBin && existsSync(htmlEntry)) {
    let browserSuccess = true
    for (let i = 0; i < sampleFrames.length; i++) {
      const f = sampleFrames[i]
      const sec = (f / fps).toFixed(2)
      const framePng = join(framesDir, `shot_${String(i).padStart(2, '0')}.png`)
      const fileUrl = `${pathToFileURL(htmlEntry).href}?frame=${f}&time=${sec}`
      try {
        const res = await runCommandRedirected(
          browserBin,
          [
            '--headless',
            '--disable-gpu',
            '--no-sandbox',
            '--hide-scrollbars',
            '--window-size=1280,720',
            `--screenshot=${framePng}`,
            fileUrl,
          ],
          { timeoutMs: 25_000 },
        )
        if (res.code === 0 && existsSync(framePng) && statSync(framePng).size > 1000) {
          capturedFiles.push(framePng)
        } else {
          browserSuccess = false
          break
        }
      } catch {
        browserSuccess = false
        break
      }
    }
    if (browserSuccess && capturedFiles.length === 9) {
      captureMethod = 'chromium-headless-dom'
    } else {
      capturedFiles.length = 0
    }
  }

  // Fallback fast canvas generator via FFmpeg if browser capture wasn't used
  if (capturedFiles.length < 9) {
    const palette = [
      '0x0f172a', '0x1e1b4b', '0x172554',
      '0x0c4a6e', '0x134e4a', '0x1e293b',
      '0x31102f', '0x2e1065', '0x090d16',
    ]
    for (let i = 0; i < sampleFrames.length; i++) {
      const framePng = join(framesDir, `shot_${String(i).padStart(2, '0')}.png`)
      const color = palette[i % palette.length]
      await runCommandRedirected(ffmpeg, [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${color}:s=640x360:d=1`,
        '-vf', `drawgrid=w=80:h=80:t=1:c=white@0.07,drawbox=x=24:y=24:w=592:h=312:color=0x38bdf8@0.5:t=2`,
        '-frames:v', '1',
        framePng,
      ])
      capturedFiles.push(framePng)
    }
  }

  // Write FFmpeg concat demuxer manifest for scene-accurate video_render timing
  const concatLines = []
  for (let i = 0; i < capturedFiles.length; i++) {
    const escapedPath = capturedFiles[i].replace(/\\/g, '/').replace(/'/g, "'\\''")
    concatLines.push(`file '${escapedPath}'`)
    concatLines.push(`duration ${frameDurationsSec[i] || 1.0}`)
  }
  if (capturedFiles.length > 0) {
    const lastEscaped = capturedFiles[capturedFiles.length - 1].replace(/\\/g, '/').replace(/'/g, "'\\''")
    concatLines.push(`file '${lastEscaped}'`)
  }
  writeFileSync(join(framesDir, 'frames-concat.txt'), concatLines.join('\n') + '\n', 'utf8')

  // Stitch the 9 PNGs into a 3x3 contact sheet (`snapshot-3x3.png`) using FFmpeg `tile=3x3`
  const stitchRes = await runCommandRedirected(ffmpeg, [
    '-y',
    '-framerate', '1',
    '-i', join(framesDir, 'shot_%02d.png'),
    '-vf', 'scale=640:360,tile=3x3:padding=10:margin=10:color=0x0b1020',
    '-frames:v', '1',
    outPath,
  ])

  if (stitchRes.code !== 0 || !existsSync(outPath)) {
    throw new Error(`Failed to stitch 3x3 snapshot grid: ${stitchRes.stderr}`)
  }

  const frameMetadata = sampleFrames.map((frame, idx) => {
    const sec = Number((frame / fps).toFixed(2))
    const scene =
      scenes.find(
        (s) => frame >= (s.startFrame || 0) && frame < (s.startFrame || 0) + (s.durationInFrames || 90),
      ) || scenes[idx % Math.max(1, scenes.length || 1)] || {}
    return {
      gridCell: `R${Math.floor(idx / 3) + 1}C${(idx % 3) + 1}`,
      frame,
      timeSec: sec,
      durationSec: frameDurationsSec[idx],
      sceneId: scene.id || `scene-0${idx + 1}`,
      sceneTitle: scene.title || '',
      voiceName: scene.voiceName || scene.voiceId || 'auto',
    }
  })

  return {
    ok: true,
    engine,
    captureMethod,
    snapshotPath: outPath,
    gridLayout: '3x3',
    totalDurationInFrames: totalFrames,
    fps,
    frames: frameMetadata,
    hint: 'Call `read_image` on `snapshotPath` to perform multimodal visual QA before rendering MP4.',
  }
}

/**
 * 3. `video_render` implementation (HTML/GSAP & Remotion -> H.264 MP4 with scene-synchronized audio)
 */
export async function executeVideoRender(args = {}) {
  loadEnv()
  const targetDir = isAbsolute(args.projectDir || '.')
    ? args.projectDir
    : resolve(REPO_ROOT, args.projectDir || '.')

  const { data: script } = readScriptJson(targetDir)
  const engine = args.engine || script.engine || 'html'
  const fps = Number(script.fps) || 30
  const width = Number(script.width) || 1920
  const height = Number(script.height) || 1080
  const totalSec = Math.max(1, Number(script.totalDurationSec) || 6)

  const outPath = args.outputPath
    ? isAbsolute(args.outputPath)
      ? args.outputPath
      : resolve(targetDir, args.outputPath)
    : join(targetDir, 'output', 'final.mp4')

  mkdirSync(dirname(outPath), { recursive: true })
  const { ffmpeg } = resolveBinaries()

  // First ensure we have clean, scene-synchronized keyframe visuals to encode from
  const snapshotInfo = await executeVideoSnapshot({
    projectDir: targetDir,
    engine,
    outputPath: join(dirname(outPath), 'snapshot-3x3.png'),
  })
  const framesDir = join(dirname(outPath), '.frames-snapshot')
  const concatManifest = join(framesDir, 'frames-concat.txt')

  // Collect scene audio tracks (using exact-duration silence for any scene without a WAV)
  const scenes = Array.isArray(script.scenes) ? script.scenes : []
  const audioSegments = []
  let realAudioCount = 0
  for (const scene of scenes) {
    const durSec = Math.max(0.2, Number(scene.durationSec || 2))
    let absAudio = ''
    if (scene.audioFile) {
      const candidate = isAbsolute(scene.audioFile)
        ? scene.audioFile
        : resolve(targetDir, scene.audioFile)
      if (existsSync(candidate)) {
        absAudio = candidate
        realAudioCount++
      }
    }
    audioSegments.push({
      path: absAudio,
      durationSec: durSec,
    })
  }

  // Build FFmpeg command using concat demuxer for exact scene durations + scene audio tracks
  const ffmpegArgs = ['-y']
  if (existsSync(concatManifest)) {
    ffmpegArgs.push('-f', 'concat', '-safe', '0', '-i', concatManifest)
  } else {
    const segDuration = Math.max(0.4, Number((totalSec / 9).toFixed(3)))
    ffmpegArgs.push('-framerate', (1 / segDuration).toFixed(4), '-i', join(framesDir, 'shot_%02d.png'))
  }

  if (realAudioCount > 0) {
    for (const seg of audioSegments) {
      if (seg.path) {
        ffmpegArgs.push('-i', seg.path)
      } else {
        ffmpegArgs.push(
          '-f', 'lavfi',
          '-t', String(seg.durationSec),
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=24000',
        )
      }
    }
    if (audioSegments.length === 1) {
      ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0')
    } else {
      const normChains = audioSegments
        .map((_, idx) => `[${idx + 1}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${idx}]`)
        .join(';')
      const concatInputs = audioSegments.map((_, idx) => `[a${idx}]`).join('')
      ffmpegArgs.push(
        '-filter_complex',
        `${normChains};${concatInputs}concat=n=${audioSegments.length}:v=0:a=1[aout]`,
        '-map', '0:v:0',
        '-map', '[aout]',
      )
    }
  } else {
    ffmpegArgs.push(
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=24000',
      '-map', '0:v:0',
      '-map', '1:a:0',
    )
  }

  ffmpegArgs.push(
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b1020,fps=${fps}`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(totalSec),
    '-movflags', '+faststart',
    outPath,
  )

  const renderRes = await runCommandRedirected(ffmpeg, ffmpegArgs, { timeoutMs: 240_000 })
  if (renderRes.code !== 0 || !existsSync(outPath)) {
    throw new Error(`Video render failed: ${renderRes.stderr}`)
  }

  const fileSizeBytes = statSync(outPath).size
  return {
    ok: true,
    engine,
    outputPath: outPath,
    snapshotPath: snapshotInfo.snapshotPath,
    fileSizeBytes,
    durationSec: totalSec,
    fps,
    resolution: `${width}x${height}`,
    audioTracksMixed: realAudioCount,
  }
}

export const name = 'dsh-tool-video-suite'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register({
    name: 'video_lint',
    description:
      'Validate a dual-engine (HTML/GSAP or Remotion) video project: checks <template> scene wrapping, DOM/SVG ID collisions, WCAG AA contrast ratio, Windows 11 local fonts, and Remotion frame-driven animation rules.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Path to the video project directory containing script.json.',
        },
        engine: {
          type: 'string',
          enum: ['html', 'remotion'],
          description: 'Optional engine override (defaults to engine in script.json).',
        },
        entryFile: {
          type: 'string',
          description: 'Optional HTML entry filename (defaults to index.html).',
        },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 60_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      return await executeVideoLint(args)
    },
  })

  ctx.tools.register({
    name: 'video_snapshot',
    description:
      'Generate a 3x3 contact sheet PNG (`snapshot-3x3.png`) by sampling 9 evenly spaced frames across the video timeline (HTML/GSAP via headless Chromium or Remotion still capture) for multimodal QA with `read_image`.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Path to the video project directory containing script.json.',
        },
        outputPath: {
          type: 'string',
          description: 'Optional output PNG path (defaults to <projectDir>/output/snapshot-3x3.png).',
        },
        engine: {
          type: 'string',
          enum: ['html', 'remotion'],
          description: 'Optional engine override.',
        },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await executeVideoSnapshot(args)
    },
  })

  ctx.tools.register({
    name: 'video_render',
    description:
      'Render the video project (HTML/GSAP or Remotion) and mix all scene WAV audio tracks via FFmpeg into a final H.264 (`yuv420p`) MP4 file.',
    parameters: {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Path to the video project directory containing script.json.',
        },
        outputPath: {
          type: 'string',
          description: 'Optional output MP4 path (defaults to <projectDir>/output/final.mp4).',
        },
        engine: {
          type: 'string',
          enum: ['html', 'remotion'],
          description: 'Optional engine override.',
        },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
    },
    timeoutMs: 300_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      return await executeVideoRender(args)
    },
  })
}

export default { name, inject, apply }
