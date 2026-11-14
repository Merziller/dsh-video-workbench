/**
 * Dual-Engine HTML5 + Canvas2D Kinetic Motion Video Renderer
 * Self-contained single-file 1920x1080 broadcast motion-graphics generator.
 * Features:
 * - Strict `<template class="scene-template">` DOM isolation + unique IDs (`video_lint` compliant)
 * - Global #world camera rig: beat-locked zoomPulse, impact screen shake, perspective 3D tilts
 * - Layered Canvas2D VFX (#fxb backdrop grid/stars/halftone, #fxt sparks/shockRings/radialLines/scanSweep)
 * - Procedural Transitions Canvas (#trc iris-circle double ring, 48px block-wipe, light-wipe, RGB glitch-cut)
 * - 6 Distinct .motion Layouts: 3d-stage-opener, kinetic-impact, media-split-motion, mosaic-pulse-wall, compare-dual, radial-climax
 * - Deterministic `window.__seekToFrame(frame)` for full-FPS CDP capture + smooth live `requestAnimationFrame` preview
 */
import {
  buildBundledFontFaceCss,
  buildComplianceNoticeText,
  PRIMARY_MONO_STACK,
  PRIMARY_SANS_STACK,
  resolveSafeZoneSpec,
} from '@dsh-video/shared'

const PALETTES = {
  tech: {
    background: '#050608',
    surface: '#10141E',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    accent: '#2F7BFF',
    accent2: '#7DB2FF',
    gold: '#F5B92E',
    rgbAccent: '125,178,255',
    rgbGold: '245,185,46',
    titleGrad: 'linear-gradient(180deg,#FFFFFF 0%,#E2E8F0 52%,#94A3B8 100%)',
    accentGrad: 'linear-gradient(180deg,#CFE1FF 0%,#4F95FF 55%,#1F5FE0 100%)',
  },
  cinematic: {
    background: '#07080B',
    surface: '#14161D',
    textPrimary: '#FAFAFA',
    textSecondary: '#D4D4D8',
    accent: '#F59E0B',
    accent2: '#FB7185',
    gold: '#FBBF24',
    rgbAccent: '245,158,11',
    rgbGold: '251,191,36',
    titleGrad: 'linear-gradient(180deg,#FFFFFF 0%,#F3F4F6 50%,#B8BEC9 100%)',
    accentGrad: 'linear-gradient(180deg,#FFE58A 0%,#F59E0B 55%,#B45309 100%)',
  },
  documentary: {
    background: '#090B0E',
    surface: '#161A22',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    accent: '#38BDF8',
    accent2: '#34D399',
    gold: '#FBBF24',
    rgbAccent: '56,189,248',
    rgbGold: '52,211,153',
    titleGrad: 'linear-gradient(180deg,#FFFFFF 0%,#E2E8F0 55%,#A3B3C6 100%)',
    accentGrad: 'linear-gradient(180deg,#BAE6FD 0%,#38BDF8 55%,#0284C7 100%)',
  },
  energetic: {
    background: '#070612',
    surface: '#141129',
    textPrimary: '#FFFFFF',
    textSecondary: '#E2E8F0',
    accent: '#00E5FF',
    accent2: '#FF3B7F',
    gold: '#FFD84D',
    rgbAccent: '0,229,255',
    rgbGold: '255,59,127',
    titleGrad: 'linear-gradient(180deg,#FFFFFF 0%,#E0F2FE 55%,#93C5FD 100%)',
    accentGrad: 'linear-gradient(180deg,#FFE875 0%,#FF3B7F 55%,#DB2777 100%)',
  },
  warm: {
    background: '#0D0908',
    surface: '#1C1412',
    textPrimary: '#FFF7ED',
    textSecondary: '#FED7AA',
    accent: '#FB923C',
    accent2: '#F472B6',
    gold: '#FBBF24',
    rgbAccent: '251,146,60',
    rgbGold: '251,191,36',
    titleGrad: 'linear-gradient(180deg,#FFFBF5 0%,#FFEDD5 55%,#FDBA74 100%)',
    accentGrad: 'linear-gradient(180deg,#FEF08A 0%,#FB923C 55%,#EA580C 100%)',
  },
}

export function resolvePalette(script) {
  const style = String(script?.style || 'tech').toLowerCase()
  const base = PALETTES[style] || PALETTES.tech
  return {
    ...base,
    ...(script?.theme || {}),
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Balance long titles into evenly-proportioned lines so we NEVER wrap 1-char orphans!
 */
function formatBalancedTitle(rawTitle, maxLineChars = 11) {
  const txt = String(rawTitle || '').trim()
  if (!txt) return ['']
  if (txt.includes('\n')) return txt.split('\n').map((s) => s.trim()).filter(Boolean)
  if (txt.length <= maxLineChars) return [txt]
  const colonIdx = txt.search(/[：:]/)
  if (colonIdx > 2 && colonIdx < txt.length - 3) {
    return [txt.slice(0, colonIdx + 1).trim(), txt.slice(colonIdx + 1).trim()]
  }
  const mid = Math.ceil(txt.length / 2)
  return [txt.slice(0, mid).trim(), txt.slice(mid).trim()]
}

function buildCharSpansHtml(lines, cls = 'k-ch') {
  return lines
    .map(
      (line) =>
        `<div class="k-line-row">${[...line]
          .map((ch) => `<span class="${cls}">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`)
          .join('')}</div>`,
    )
    .join('')
}

function resolveMediaList(scene) {
  if (Array.isArray(scene.media) && scene.media.length > 0) return scene.media
  if (scene.mediaPath) {
    return [{ path: scene.mediaPath, type: scene.mediaType || 'image', motion: scene.kenBurns || 'zoom-in' }]
  }
  return []
}

function buildMediaTag(m, idx, isPrimary = true) {
  if (!m?.path) return ''
  const rawPath = String(m.path).replace(/\\/g, '/')
  const src = rawPath.startsWith('http') || rawPath.startsWith('/') ? rawPath : rawPath
  const isVid = m.type === 'video' || /\.(mp4|mov|webm|mkv)$/i.test(rawPath)
  const cls = isPrimary ? 'k-media-el k-primary-media' : `k-media-el k-extra-media k-extra-${idx}`
  if (isVid) {
    return `<video class="${cls}" src="${escapeHtml(src)}" muted playsinline preload="auto" data-motion="${escapeHtml(m.motion || 'zoom-in')}"></video>`
  }
  return `<img class="${cls}" src="${escapeHtml(src)}" alt="" data-motion="${escapeHtml(m.motion || 'zoom-in')}">`
}

function renderSceneTemplateHtml(scene, idx, total, theme) {
  const layout = scene.layout || (resolveMediaList(scene).length > 0 ? 'media-split-motion' : 'kinetic-impact')
  const mediaList = resolveMediaList(scene)
  const poolList = Array.isArray(scene.poolMedia) && scene.poolMedia.length > 0 ? scene.poolMedia : mediaList
  const primary = mediaList[0] || null
  const secondary = mediaList[1] || null
  const safeTitleLines = formatBalancedTitle(scene.title || `第 ${idx + 1} 幕`, layout === 'media-split-motion' ? 9 : 11)
  const highlights = Array.isArray(scene.highlights) ? scene.highlights.filter(Boolean).slice(0, 3) : []
  const tagText = escapeHtml(scene.tag || `0${idx + 1}`)
  const stepCode = `${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
  const subTitleTxt = scene.subtitleLine ? escapeHtml(scene.subtitleLine) : ''

  // Build Floating 3D Perspective Wall Cards for `3d-stage-opener`
  let depthStageHtml = ''
  if (layout === '3d-stage-opener') {
    const cardItems = []
    const count = 16
    for (let k = 0; k < count; k++) {
      const m = poolList.length > 0 ? poolList[k % poolList.length] : null
      const kw = highlights[k % Math.max(1, highlights.length)] || tagText
      if (m) {
        const src = String(m.path).replace(/\\/g, '/')
        const isVid = m.type === 'video' || /\.(mp4|mov|webm)$/i.test(src)
        cardItems.push(
          `<div class="k-3d-card" data-cidx="${k}">${
            isVid
              ? `<video class="k-3d-media" src="${escapeHtml(src)}" muted playsinline preload="auto"></video>`
              : `<img class="k-3d-media" src="${escapeHtml(src)}" alt="">`
          }<div class="k-3d-chrome"><i></i><i></i><i></i></div></div>`,
        )
      } else {
        cardItems.push(
          `<div class="k-3d-card k-3d-badge" data-cidx="${k}"><span class="k-3d-dot"></span><span>${escapeHtml(kw)}</span></div>`,
        )
      }
    }
    depthStageHtml = `<div class="k-3d-space"><div class="k-3d-world">${cardItems.join('')}</div></div>`
  }

  // Build Mosaic Grid for `mosaic-pulse-wall`
  let mosaicHtml = ''
  if (layout === 'mosaic-pulse-wall') {
    const cells = []
    const cellCount = 6
    for (let k = 0; k < cellCount; k++) {
      const m = poolList.length > 0 ? poolList[k % poolList.length] : null
      const kw = highlights[k % Math.max(1, highlights.length)] || `${stepCode}`
      cells.push(
        `<div class="k-mosaic-cell" data-midx="${k}">${
          m ? buildMediaTag(m, k, false) : `<div class="k-mosaic-typo">${escapeHtml(kw)}</div>`
        }<div class="k-mosaic-badge">${String(k + 1).padStart(2, '0')}</div></div>`,
      )
    }
    mosaicHtml = `<div class="k-mosaic-wrap"><div class="k-mosaic-grid">${cells.join('')}</div></div>`
  }

  // Primary Media Backdrop (for hero/climax/impact) or 3D Card Showcase (for split/opener)
  const backdropMediaHtml = primary
    ? `<div class="k-bg-media">${buildMediaTag(primary, 0, true)}<div class="k-bg-grade"></div></div>`
    : `<div class="k-bg-procedural"></div>`

  const showcaseCardHtml = primary
    ? `<div class="k-card-stage">
        <div class="k-mac-frame">
          <div class="k-mac-bar"><i></i><i></i><i></i><span>${tagText}</span></div>
          <div class="k-mac-viewport">${buildMediaTag(primary, 0, true)}</div>
          <div class="k-spec-glint"></div>
        </div>
        ${
          secondary
            ? `<div class="k-pip-frame">${buildMediaTag(secondary, 1, false)}</div>`
            : ''
        }
      </div>`
    : `<div class="k-card-stage">
        <div class="k-terminal-card">
          <div class="k-mac-bar"><i></i><i></i><i></i><span>${tagText}</span></div>
          <div class="k-term-body">
            ${highlights.map((h, hi) => `<div class="k-term-row"><span>0${hi + 1}</span><b>${escapeHtml(h)}</b></div>`).join('')}
          </div>
        </div>
      </div>`

  // Main layout inner composition
  let contentHtml = ''
  if (layout === '3d-stage-opener') {
    contentHtml = `
      ${backdropMediaHtml}
      ${depthStageHtml}
      <div class="k-hero-scrim"></div>
      <div class="k-split-grid">
        <div class="k-left-col">
          <div class="k-eyebrow"><span class="k-dot"></span><span>${stepCode} · ${tagText}</span></div>
          <div class="k-headline k-glitch-target">${buildCharSpansHtml(safeTitleLines)}</div>
          ${subTitleTxt ? `<div class="k-subline">${subTitleTxt}</div>` : ''}
          <div class="k-pills-row">${highlights.map((h) => `<div class="k-pill"><span>▸</span>${escapeHtml(h)}</div>`).join('')}</div>
        </div>
        ${primary ? `<div class="k-right-col">${showcaseCardHtml}</div>` : ''}
      </div>`
  } else if (layout === 'media-split-motion') {
    const flip = idx % 2 === 1
    contentHtml = `
      ${backdropMediaHtml}
      <div class="k-dark-veil"></div>
      <div class="k-split-grid ${flip ? 'k-reverse' : ''}">
        <div class="k-left-col">
          <div class="k-eyebrow"><span class="k-dot"></span><span>${stepCode} · ${tagText}</span></div>
          <div class="k-headline">${buildCharSpansHtml(safeTitleLines)}</div>
          <div class="k-accent-rule"></div>
          <div class="k-callouts">${highlights
            .map(
              (h, hi) =>
                `<div class="k-callout" style="--accent-bar:${hi % 2 ? theme.gold : theme.accent2}"><span class="k-cnum">${String(hi + 1).padStart(2, '0')}</span><span class="k-ctxt">${escapeHtml(h)}</span></div>`,
            )
            .join('')}</div>
        </div>
        <div class="k-right-col">${showcaseCardHtml}</div>
      </div>`
  } else if (layout === 'mosaic-pulse-wall') {
    contentHtml = `
      <div class="k-bg-procedural"></div>
      ${mosaicHtml}
      <div class="k-bottom-fade"></div>
      <div class="k-mosaic-overlay">
        <div class="k-counter-badge"><span class="k-cnt-num" data-target="${Number(scene.counterTarget) || 96}">00</span><span class="k-cnt-unit">${tagText}</span></div>
        <div class="k-headline k-headline-sm">${buildCharSpansHtml(safeTitleLines)}</div>
      </div>`
  } else if (layout === 'compare-dual') {
    const left = scene.compareLeft || { label: '传统呈现', text: highlights[0] || '静态平铺画面' }
    const right = scene.compareRight || { label: '动态重构', text: highlights[1] || '空间节拍联动' }
    contentHtml = `
      ${backdropMediaHtml}
      <div class="k-dark-veil"></div>
      <div class="k-center-stage">
        <div class="k-eyebrow"><span class="k-dot"></span><span>${stepCode} · ${tagText}</span></div>
        <div class="k-headline k-headline-md">${buildCharSpansHtml(safeTitleLines)}</div>
        <div class="k-compare-row">
          <div class="k-cmp-card k-cmp-a">
            <div class="k-cmp-tag">A · ${escapeHtml(left.label)}</div>
            <div class="k-cmp-val">${escapeHtml(left.text)}</div>
          </div>
          <div class="k-cmp-bridge"><i></i></div>
          <div class="k-cmp-card k-cmp-b">
            <div class="k-cmp-tag k-cmp-gold">B · ${escapeHtml(right.label)}</div>
            <div class="k-cmp-val">${escapeHtml(right.text)}</div>
          </div>
        </div>
      </div>`
  } else if (layout === 'radial-climax') {
    contentHtml = `
      ${backdropMediaHtml}
      <div class="k-dark-veil-soft"></div>
      <div class="k-center-stage k-climax-stage">
        <div class="k-eyebrow"><span class="k-dot"></span><span>${tagText}</span></div>
        <div class="k-headline k-headline-lg">${buildCharSpansHtml(safeTitleLines)}</div>
        <div class="k-glow-bar"></div>
        <div class="k-stamp-seal">${escapeHtml(highlights[0] || theme.label || 'PRESENTED')}</div>
      </div>`
  } else {
    // kinetic-impact
    contentHtml = `
      ${backdropMediaHtml}
      <div class="k-dark-veil-soft"></div>
      <div class="k-center-stage">
        <div class="k-eyebrow"><span class="k-dot"></span><span>${stepCode} · ${tagText}</span></div>
        <div class="k-headline k-headline-lg k-glitch-target">${buildCharSpansHtml(safeTitleLines)}</div>
        <div class="k-pills-row">${highlights.map((h) => `<div class="k-pill"><span>◆</span>${escapeHtml(h)}</div>`).join('')}</div>
      </div>`
  }

  return `<template class="scene-template" data-scene-id="${escapeHtml(scene.id)}" data-layout="${escapeHtml(layout)}"><div class="k-scene" data-scene-idx="${idx}">${contentHtml}</div></template>`
}

export function buildRichHtmlVideo(script) {
  const theme = resolvePalette(script)
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []
  const fps = Number(script?.fps) || 30
  const width = Number(script?.width) || 1920
  const height = Number(script?.height) || 1080
  const beats = Array.isArray(script?.bgm?.beats) ? script.bgm.beats : []
  const safeZone = resolveSafeZoneSpec(width, height, script?.targetPlatform || 'universal')
  const complianceNotice = buildComplianceNoticeText(script)
  const bundledFontFaceCss = buildBundledFontFaceCss('fonts')

  let cursorFrame = 0
  const timeline = scenes.map((s, idx) => {
    const durFrames = Math.max(30, Number(s.durationInFrames) || Math.ceil(Number(s.durationSec || 4.5) * fps))
    const startFrame = Number.isFinite(Number(s.startFrame)) ? Number(s.startFrame) : cursorFrame
    const endFrame = startFrame + durFrames
    cursorFrame = endFrame
    return {
      id: s.id || `scene-${String(idx + 1).padStart(2, '0')}`,
      idx,
      layout: s.layout || 'kinetic-impact',
      transition: s.transition || 'iris-circle',
      kenBurns: s.kenBurns || 'zoom-in',
      vfx: s.vfx || 'sparks+shockwave',
      startFrame,
      endFrame,
      startSec: startFrame / fps,
      endSec: endFrame / fps,
      durFrames,
      durSec: durFrames / fps,
      narration: s.narration || '',
      subtitles: Array.isArray(s.subtitles) ? s.subtitles : [],
      counterTarget: Number(s.counterTarget) || 96,
    }
  })

  const totalFrames = Math.max(30, Number(script?.totalDurationInFrames) || cursorFrame || 300)
  const templatesHtml = scenes.map((s, idx) => renderSceneTemplateHtml(s, idx, scenes.length, theme)).join('\n  ')

  const payloadJson = JSON.stringify({
    fps,
    width,
    height,
    totalFrames,
    totalSec: totalFrames / fps,
    rgbAccent: theme.rgbAccent || '125,178,255',
    rgbGold: theme.rgbGold || '245,185,46',
    accent: theme.accent,
    accent2: theme.accent2,
    gold: theme.gold,
    beats,
    timeline,
  })

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, initial-scale=1.0" />
  <title>${escapeHtml(script?.title || 'DSH Motion Video')}</title>
  <style>
    ${bundledFontFaceCss}

    :root {
      --bg: ${theme.background};
      --surface: ${theme.surface};
      --text: ${theme.textPrimary};
      --sub: ${theme.textSecondary};
      --accent: ${theme.accent};
      --accent2: ${theme.accent2};
      --gold: ${theme.gold};
      --font-sans: ${PRIMARY_SANS_STACK};
      --font-mono: ${PRIMARY_MONO_STACK};
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: #030406;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-sans); color: var(--text);
      -webkit-font-smoothing: antialiased;
    }
    #stage {
      position: relative; width: ${width}px; height: ${height}px;
      flex: 0 0 auto; min-width: ${width}px; min-height: ${height}px;
      overflow: hidden; background: var(--bg);
      transform-origin: center center;
    }
    #world {
      position: absolute; inset: 0;
      transform-origin: 50% 50%;
    }
    .layer { position: absolute; inset: 0; pointer-events: none; }
    canvas.layer { width: 100%; height: 100%; }

    #scene-slots { position: absolute; inset: 0; overflow: hidden; }
    .k-scene { position: absolute; inset: 0; overflow: hidden; display: none; }
    .k-scene.active { display: block; }

    /* Media & Procedural Backgrounds */
    .k-bg-procedural {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 75% 65% at 28% 35%, color-mix(in srgb, var(--accent) 26%, transparent), transparent 64%),
        radial-gradient(ellipse 65% 65% at 78% 70%, color-mix(in srgb, var(--accent2) 22%, transparent), transparent 62%),
        linear-gradient(160deg, var(--bg) 0%, var(--surface) 100%);
    }
    .k-bg-media { position: absolute; inset: 0; overflow: hidden; }
    .k-bg-media .k-media-el {
      width: 100%; height: 100%; object-fit: cover; display: block;
      transform-origin: 50% 50%;
    }
    .k-bg-grade {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(5,6,8,0.22) 0%, rgba(5,6,8,0.1) 35%, rgba(5,6,8,0.68) 100%);
    }
    .k-hero-scrim {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(90deg, rgba(5,6,8,0.88) 0%, rgba(5,6,8,0.62) 48%, rgba(5,6,8,0.25) 100%);
    }
    .k-dark-veil {
      position: absolute; inset: 0; pointer-events: none;
      background: rgba(5,6,8,0.72);
    }
    .k-dark-veil-soft {
      position: absolute; inset: 0; pointer-events: none;
      background: radial-gradient(ellipse 72% 64% at 50% 48%, rgba(5,6,8,0.36) 0%, rgba(5,6,8,0.68) 100%);
    }

    /* 3D Perspective Card Swarm */
    .k-3d-space {
      position: absolute; inset: 0; perspective: 1150px; perspective-origin: 50% 48%; pointer-events: none;
    }
    .k-3d-world {
      position: absolute; left: 50%; top: 50%; transform-style: preserve-3d;
    }
    .k-3d-card {
      position: absolute; left: 0; top: 0; width: 320px; border-radius: 10px; overflow: hidden;
      background: rgba(14,18,28,0.92); border: 1px solid rgba(255,255,255,0.2);
      box-shadow: 0 22px 60px rgba(0,0,0,0.65); transform-style: preserve-3d;
    }
    .k-3d-media { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .k-3d-chrome {
      position: absolute; top: 8px; left: 10px; display: flex; gap: 5px;
    }
    .k-3d-chrome i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.65); }
    .k-3d-badge {
      width: auto; min-width: 190px; padding: 12px 22px;
      display: inline-flex; align-items: center; gap: 10px;
      font: 700 22px var(--font-mono); color: #E2E8F0; white-space: nowrap;
      border-color: color-mix(in srgb, var(--accent2) 55%, transparent);
    }
    .k-3d-dot { width: 10px; height: 10px; border-radius: 3px; background: var(--gold); }

    /* Split Stage & Showcase Frames */
    .k-split-grid {
      position: relative; z-index: 4; width: 100%; height: 100%;
      padding: 88px 110px 135px; display: flex; align-items: center; justify-content: space-between; gap: 56px;
    }
    .k-split-grid.k-reverse { flex-direction: row-reverse; }
    .k-left-col {
      flex: 1.05; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 24px;
    }
    .k-right-col {
      flex: 1; display: flex; align-items: center; justify-content: center; perspective: 1200px;
    }

    .k-center-stage {
      position: relative; z-index: 4; width: 100%; height: 100%;
      padding: 90px 120px 140px; display: flex; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; gap: 28px;
    }

    /* Typography */
    .k-eyebrow {
      display: inline-flex; align-items: center; gap: 10px;
      font: 700 18px var(--font-mono); letter-spacing: 3px; color: var(--accent2);
      text-transform: uppercase;
    }
    .k-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 12px var(--gold); }
    .k-headline {
      font-family: var(--font-sans); font-size: 92px; font-weight: 900; line-height: 1.14;
      letter-spacing: -1px; max-width: 100%;
    }
    .k-headline-lg { font-size: 108px; }
    .k-headline-md { font-size: 76px; }
    .k-headline-sm { font-size: 62px; }
    .k-line-row { display: block; }
    .k-ch {
      display: inline-block;
      background: ${theme.titleGrad}; -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent;
      filter: drop-shadow(0 6px 0 rgba(0,0,0,0.48)) drop-shadow(0 16px 26px rgba(0,0,0,0.55));
    }
    .k-subline {
      font-size: 28px; line-height: 1.48; font-weight: 600; color: var(--sub); max-width: 780px;
      text-shadow: 0 2px 12px rgba(0,0,0,0.7);
    }

    /* Pills & Callouts */
    .k-pills-row { display: flex; flex-wrap: wrap; gap: 14px; }
    .k-pill {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 22px; border-radius: 40px;
      background: rgba(15,23,42,0.72); border: 1.5px solid color-mix(in srgb, var(--accent2) 55%, transparent);
      font: 700 22px var(--font-sans); color: #F8FAFC;
      box-shadow: 0 10px 28px rgba(0,0,0,0.35);
    }
    .k-pill span { color: var(--gold); }

    .k-accent-rule {
      width: 240px; height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, var(--gold), var(--accent2));
      transform-origin: left center;
    }
    .k-callouts { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 760px; }
    .k-callout {
      display: flex; align-items: center; gap: 20px; padding: 16px 24px; border-radius: 12px;
      background: linear-gradient(180deg, rgba(24,28,36,0.92), rgba(12,14,19,0.94));
      border: 1px solid rgba(255,255,255,0.12);
      border-left: 4px solid var(--accent-bar, var(--accent2));
      box-shadow: 0 18px 42px rgba(0,0,0,0.45);
    }
    .k-cnum { font: 800 24px var(--font-mono); color: var(--accent-bar, var(--gold)); }
    .k-ctxt { font: 700 28px var(--font-sans); color: #F8FAFC; }

    /* Showcase Media Window + PiP */
    .k-card-stage { position: relative; width: 100%; max-width: 820px; transform-style: preserve-3d; }
    .k-mac-frame {
      position: relative; width: 100%; border-radius: 16px; overflow: hidden;
      background: #0E1118; border: 1.5px solid rgba(255,255,255,0.22);
      box-shadow: 0 36px 90px rgba(0,0,0,0.72), 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
    }
    .k-mac-bar {
      height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 16px;
      background: rgba(20,24,34,0.95); border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .k-mac-bar i { width: 10px; height: 10px; border-radius: 50%; }
    .k-mac-bar i:nth-child(1) { background: #FF5F57; }
    .k-mac-bar i:nth-child(2) { background: #FEBC2E; }
    .k-mac-bar i:nth-child(3) { background: #28C840; }
    .k-mac-bar span { margin-left: 10px; font: 600 13px var(--font-mono); color: var(--sub); letter-spacing: 1.5px; }
    .k-mac-viewport { position: relative; width: 100%; aspect-ratio: 16/10; overflow: hidden; background: #050608; }
    .k-mac-viewport .k-media-el { width: 100%; height: 100%; object-fit: cover; display: block; }
    .k-spec-glint {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.16) 49%, transparent 62%);
    }
    .k-pip-frame {
      position: absolute; right: -28px; bottom: -28px; width: 42%; aspect-ratio: 16/10;
      border-radius: 14px; overflow: hidden; border: 2px solid var(--gold);
      box-shadow: 0 22px 55px rgba(0,0,0,0.78); background: #0B0D12;
    }
    .k-pip-frame .k-media-el { width: 100%; height: 100%; object-fit: cover; display: block; }

    .k-terminal-card {
      width: 100%; border-radius: 16px; overflow: hidden;
      background: linear-gradient(180deg, rgba(20,24,32,0.94), rgba(10,12,17,0.96));
      border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 30px 80px rgba(0,0,0,0.65);
    }
    .k-term-body { padding: 34px; display: flex; flex-direction: column; gap: 22px; }
    .k-term-row { display: flex; align-items: center; gap: 18px; font-size: 28px; }
    .k-term-row span { font: 700 20px var(--font-mono); color: var(--gold); padding: 4px 12px; border-radius: 6px; background: rgba(245,185,46,0.14); }
    .k-term-row b { color: #F8FAFC; font-weight: 700; }

    /* Mosaic Pulse Wall */
    .k-mosaic-wrap {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      perspective: 1400px;
    }
    .k-mosaic-grid {
      width: 1700px; height: 860px; display: grid;
      grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(2, 1fr);
      gap: 20px; transform-style: preserve-3d;
    }
    .k-mosaic-cell {
      position: relative; border-radius: 14px; overflow: hidden;
      background: #10141D; border: 1.5px solid rgba(255,255,255,0.16);
      box-shadow: 0 24px 60px rgba(0,0,0,0.6); transform-style: preserve-3d;
    }
    .k-mosaic-cell .k-media-el { width: 100%; height: 100%; object-fit: cover; display: block; }
    .k-mosaic-typo {
      width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
      font: 900 42px var(--font-sans); color: var(--text);
      background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 28%, transparent), #0B0D14);
    }
    .k-mosaic-badge {
      position: absolute; left: 12px; top: 12px; padding: 4px 10px; border-radius: 6px;
      background: rgba(5,6,8,0.78); font: 700 14px var(--font-mono); color: var(--accent2);
    }
    .k-bottom-fade {
      position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(180deg, rgba(5,6,8,0.08) 0%, rgba(5,6,8,0.22) 50%, rgba(5,6,8,0.92) 100%);
    }
    .k-mosaic-overlay {
      position: absolute; left: 96px; right: 96px; bottom: 112px; z-index: 6;
      display: flex; align-items: flex-end; gap: 36px;
    }
    .k-counter-badge {
      display: flex; flex-direction: column; padding: 14px 26px; border-radius: 12px;
      background: rgba(8,10,16,0.88); border-left: 5px solid var(--gold);
    }
    .k-cnt-num {
      font: 900 72px/1 var(--font-mono);
      background: ${theme.accentGrad}; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .k-cnt-unit { font: 700 16px var(--font-mono); color: var(--sub); letter-spacing: 3px; margin-top: 4px; }

    /* Compare Dual */
    .k-compare-row {
      display: flex; align-items: center; justify-content: center; gap: 38px; width: 100%; max-width: 1440px; margin-top: 10px;
    }
    .k-cmp-card {
      flex: 1; max-width: 580px; padding: 44px 38px; border-radius: 20px; text-align: left;
      background: linear-gradient(180deg, rgba(24,28,36,0.94), rgba(11,13,18,0.94));
      border: 1px solid rgba(255,255,255,0.14); border-top: 4px solid var(--accent2);
      box-shadow: 0 30px 75px rgba(0,0,0,0.62);
    }
    .k-cmp-card.k-cmp-b { border-top-color: var(--gold); }
    .k-cmp-tag { font: 700 18px var(--font-mono); color: var(--accent2); letter-spacing: 2px; }
    .k-cmp-gold { color: var(--gold); }
    .k-cmp-val { font: 900 48px/1.2 var(--font-sans); color: #FFFFFF; margin-top: 20px; }
    .k-cmp-bridge { width: 96px; height: 3px; position: relative; overflow: hidden; }
    .k-cmp-bridge i { display: block; width: 100%; height: 100%; border-top: 3px dashed rgba(255,255,255,0.45); }

    /* Climax Glow Bar & Seal */
    .k-glow-bar {
      width: 680px; height: 4px; border-radius: 2px;
      background: linear-gradient(90deg, var(--gold), var(--accent), var(--accent2));
      box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 65%, transparent);
    }
    .k-stamp-seal {
      padding: 12px 32px; border: 4px solid var(--gold); border-radius: 8px;
      font: 900 32px var(--font-mono); letter-spacing: 5px; color: var(--gold);
      box-shadow: 0 0 36px rgba(245,185,46,0.22);
    }

    /* Post Filters, Vignette, Grain, Flash, Chrome, Subtitles */
    #vig {
      background: radial-gradient(ellipse 78% 72% at 50% 48%, transparent 56%, rgba(0,0,0,0.58) 100%);
    }
    #grain-layer { opacity: 0.055; mix-blend-mode: screen; }
    #glc {
      opacity: 0;
      background: repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 7px);
      mix-blend-mode: screen;
    }
    #flash { background: #FFFFFF; opacity: 0; }
    #chrome-hud .k-corner {
      position: absolute; width: 22px; height: 22px; opacity: 0.48;
      border-color: rgba(255,255,255,0.65); border-style: solid; border-width: 0;
    }
    #c-tl { left: 32px; top: 32px; border-left-width: 2px; border-top-width: 2px; }
    #c-tr { right: 32px; top: 32px; border-right-width: 2px; border-top-width: 2px; }
    #c-bl { left: 32px; bottom: 32px; border-left-width: 2px; border-bottom-width: 2px; }
    #c-br { right: 32px; bottom: 32px; border-right-width: 2px; border-bottom-width: 2px; }

    #sub-wrap {
      position: absolute; left: ${safeZone.safePaddingPx.left}px; right: ${safeZone.safePaddingPx.right}px; bottom: ${Number(script?.subtitleBottomPx) || safeZone.subtitleBottomPx}px;
      display: flex; justify-content: center; pointer-events: none; z-index: 25;
    }
    #sub-pill {
      padding: 8px 26px; border-radius: 10px;
      background: rgba(5,7,11,0.78);
      border: 1px solid rgba(255,255,255,0.14);
      font-family: var(--font-sans); font-size: ${width < height ? 28 : 32}px; font-weight: 700; line-height: 1.35;
      color: #FFFFFF; max-width: ${Math.round(width * 0.84)}px; text-align: center; white-space: ${width < height ? 'normal' : 'nowrap'};
      text-shadow: 0 2px 8px rgba(0,0,0,0.92);
    }
    #progress-line {
      position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
      background: rgba(255,255,255,0.08); z-index: 30;
    }
    #progress-fill {
      width: 0%; height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--gold));
    }
    #ai-badge {
      position: absolute; top: ${Math.max(24, safeZone.safePaddingPx.top)}px; left: ${Math.max(28, safeZone.safePaddingPx.left)}px; z-index: 28;
      padding: 6px 14px; border-radius: 999px;
      background: rgba(8,12,20,0.76); border: 1px solid rgba(255,255,255,0.18);
      font: 600 15px var(--font-sans); color: #E2E8F0; letter-spacing: 0.03em;
    }
    #end-notice-wrap {
      position: absolute; left: ${safeZone.safePaddingPx.left}px; right: ${safeZone.safePaddingPx.right}px; bottom: ${Math.round((Number(script?.subtitleBottomPx) || safeZone.subtitleBottomPx) + (width < height ? 88 : 72))}px;
      display: flex; justify-content: center; pointer-events: none; z-index: 29; opacity: 0;
    }
    #end-notice {
      padding: 7px 18px; border-radius: 999px;
      background: rgba(6,10,18,0.86); border: 1px solid color-mix(in srgb, var(--accent2) 38%, transparent);
      font: 600 15px var(--font-sans); color: #CBD5E1; letter-spacing: 0.02em; text-align: center;
    }
    ${width < height ? `
    /* Portrait Responsive Adaptation (${width}x${height}) */
    .k-split-grid, .k-split-grid.k-reverse {
      flex-direction: column; justify-content: center; gap: 28px;
      padding: ${Math.max(84, safeZone.safePaddingPx.top)}px ${Math.max(44, safeZone.safePaddingPx.right)}px ${Math.max(190, safeZone.subtitleBottomPx + 80)}px ${Math.max(44, safeZone.safePaddingPx.left)}px;
    }
    .k-left-col { width: 100%; align-items: center; text-align: center; }
    .k-right-col { width: 100%; }
    .k-center-stage { padding: ${Math.max(84, safeZone.safePaddingPx.top)}px ${Math.max(44, safeZone.safePaddingPx.right)}px ${Math.max(190, safeZone.subtitleBottomPx + 80)}px ${Math.max(44, safeZone.safePaddingPx.left)}px; gap: 22px; }
    .k-headline { font-size: 58px; }
    .k-headline-lg { font-size: 66px; }
    .k-headline-md { font-size: 50px; }
    .k-headline-sm { font-size: 42px; }
    .k-subline { font-size: 24px; max-width: 100%; }
    .k-card-stage { max-width: 100%; }
    .k-pip-frame { right: 8px; bottom: -18px; width: 38%; }
    .k-mosaic-grid {
      width: ${Math.round(width * 0.88)}px; height: ${Math.round(height * 0.52)}px;
      grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(3, 1fr); gap: 14px;
    }
    .k-mosaic-overlay { left: 40px; right: 40px; bottom: ${Math.max(180, safeZone.subtitleBottomPx + 70)}px; flex-direction: column; align-items: flex-start; gap: 14px; }
    .k-cnt-num { font-size: 52px; }
    .k-compare-row { flex-direction: column; gap: 20px; }
    .k-cmp-card { max-width: 100%; width: 100%; padding: 28px 24px; }
    .k-cmp-val { font-size: 36px; }
    .k-cmp-bridge { width: 3px; height: 34px; }
    .k-cmp-bridge i { border-top: none; border-left: 3px dashed rgba(255,255,255,0.45); }
    .k-glow-bar { width: ${Math.round(width * 0.65)}px; }
    #sub-wrap { bottom: ${Number(script?.subtitleBottomPx) || safeZone.subtitleBottomPx}px; }
    #sub-pill { max-width: ${Math.round(width * 0.84)}px; font-size: 28px; white-space: normal; }
    ` : width === height ? `
    /* Square 1:1 Adaptation */
    .k-split-grid, .k-split-grid.k-reverse {
      flex-direction: column; justify-content: center; gap: 26px;
      padding: 68px 56px 135px;
    }
    .k-center-stage { padding: 68px 64px 135px; }
    .k-headline { font-size: 62px; }
    .k-headline-lg { font-size: 72px; }
    .k-mosaic-grid { width: ${Math.round(width * 0.88)}px; height: ${Math.round(height * 0.62)}px; }
    #sub-pill { max-width: ${Math.round(width * 0.9)}px; font-size: 27px; }
    ` : ''}
  </style>
</head>
<body>
  <div id="stage">
    <div id="world">
      <canvas id="fxb" class="layer" width="${width}" height="${height}"></canvas>
      <div id="scene-slots"></div>
      <canvas id="fxt" class="layer" width="${width}" height="${height}"></canvas>
    </div>
    <div id="vig" class="layer"></div>
    <canvas id="grain-layer" class="layer" width="${width}" height="${height}"></canvas>
    <div id="glc" class="layer"></div>
    <canvas id="trc" class="layer" width="${width}" height="${height}"></canvas>
    <div id="flash" class="layer"></div>
    <div id="chrome-hud" class="layer">
      <div id="c-tl" class="k-corner"></div>
      <div id="c-tr" class="k-corner"></div>
      <div id="c-bl" class="k-corner"></div>
      <div id="c-br" class="k-corner"></div>
    </div>
    <div id="ai-badge">${escapeHtml(typeof script?.aiBadge === 'string' && script.aiBadge.trim() ? script.aiBadge : complianceNotice.badgeText)}</div>
    <div id="end-notice-wrap"><div id="end-notice">${escapeHtml(complianceNotice.endNoticeBody)}</div></div>
    <div id="sub-wrap"><div id="sub-pill"></div></div>
    <div id="progress-line"><div id="progress-fill"></div></div>
  </div>

  ${templatesHtml}

  <script>
  (() => {
    const CFG = ${payloadJson};
    const stageEl = document.getElementById('stage');
    const worldEl = document.getElementById('world');
    const slotsEl = document.getElementById('scene-slots');
    const fxb = document.getElementById('fxb').getContext('2d');
    const fxt = document.getElementById('fxt').getContext('2d');
    const trc = document.getElementById('trc').getContext('2d');
    const grainCanvas = document.getElementById('grain-layer');
    const grainCtx = grainCanvas.getContext('2d');
    const glcEl = document.getElementById('glc');
    const flashEl = document.getElementById('flash');
    const subPill = document.getElementById('sub-pill');
    const progFill = document.getElementById('progress-fill');
    const endNoticeWrap = document.getElementById('end-notice-wrap');

    function fitStage() {
      const s = Math.min(window.innerWidth / CFG.width, window.innerHeight / CFG.height) || 1;
      stageEl.style.transform = 'scale(' + s + ')';
    }
    window.addEventListener('resize', fitStage);
    fitStage();

    // Deterministic Math & Easing Library
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const lerp = (a, b, x) => a + (b - a) * x;
    const pr = (t, a, b) => clamp((t - a) / Math.max(1e-5, b - a));
    const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const noise = (t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; };
    const EZ = {
      out: (x) => 1 - Math.pow(1 - x, 3),
      out5: (x) => 1 - Math.pow(1 - x, 5),
      expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
      inout: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
      in: (x) => x * x * x,
      spring: (x) => (x >= 1 ? 1 : 1 - Math.exp(-7 * x) * Math.cos(8.5 * x) * (1 - x * 0.2)),
    };

    function beatPulse(t, onlyStrong = false) {
      let v = 0;
      const beats = CFG.beats || [];
      for (let i = beats.length - 1; i >= 0; i--) {
        const b = beats[i];
        if (b.time > t) continue;
        const dt = t - b.time;
        if (dt > 0.5) break;
        if (onlyStrong && !b.strong) continue;
        v = Math.max(v, Math.exp(-dt * 11) * (b.strong ? 1 : 0.45));
      }
      return v;
    }

    function shakeAt(t, t0, dur = 0.35, amp = 14) {
      const x = pr(t, t0, t0 + dur);
      if (x <= 0 || x >= 1) return [0, 0];
      const k = (1 - x) * amp;
      return [k * noise(t * 48), k * noise(t * 48 + 11)];
    }

    // Offscreen 256x256 procedural noise pattern for subtle cinema grain
    const gTile = document.createElement('canvas');
    gTile.width = 256; gTile.height = 256;
    {
      const gx = gTile.getContext('2d');
      const id = gx.createImageData(256, 256);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = Math.floor(hash(i * 0.25) * 255);
        id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 28;
      }
      gx.putImageData(id, 0, 0);
    }
    const gPat = grainCtx.createPattern(gTile, 'repeat');

    // Canvas2D Particle & Light FX Primitives
    function drawStars(ctx, t, n, alpha, col) {
      for (let i = 0; i < n; i++) {
        const x = ((hash(i * 1.31 + 3) + t * (0.008 + hash(i * 2.1) * 0.015)) % 1) * CFG.width;
        const y = hash(i * 2.77 + 5) * CFG.height;
        const tw = 0.4 + 0.6 * Math.sin(t * (1.8 + hash(i) * 3) + i);
        const r = 1.2 + hash(i * 5.3) * 2.4;
        ctx.fillStyle = 'rgba(' + col + ',' + (alpha * tw).toFixed(3) + ')';
        ctx.fillRect(x, y, r, r);
      }
    }

    function drawGlow(ctx, x, y, r, col, a) {
      if (a <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (a * 0.7).toFixed(3) + ')');
      g.addColorStop(0.25, 'rgba(' + col + ',' + (a * 0.6).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    function drawSparks(ctx, t, t0, x, y, col, count = 48, seed = 7) {
      const life = 0.85;
      for (let i = 0; i < count; i++) {
        const age = t - t0 - hash(i * 7.1 + seed) * 0.08;
        const L = life * (0.5 + hash(i * 3.3 + seed) * 0.65);
        if (age <= 0 || age > L) continue;
        const ang = (hash(i * 1.7 + seed) - 0.5) * 6.28;
        const sp = 360 + hash(i * 9.1 + seed) * 880;
        const g = 520;
        const px = x + Math.cos(ang) * sp * age;
        const py = y + Math.sin(ang) * sp * age + 0.5 * g * age * age;
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp + g * age;
        const tail = Math.hypot(vx, vy) * 0.018;
        const k = 1 - age / L;
        ctx.strokeStyle = 'rgba(' + col + ',' + (k * 0.92).toFixed(3) + ')';
        ctx.lineWidth = 1.4 + k * 1.8;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - (vx / Math.hypot(vx, vy)) * tail, py - (vy / Math.hypot(vx, vy)) * tail);
        ctx.stroke();
      }
    }

    function drawShockRing(ctx, t, t0, cx, cy, maxR, dur, col) {
      const p = pr(t, t0, t0 + dur);
      if (p <= 0 || p >= 1) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(' + col + ',' + (1 - p).toFixed(3) + ')';
      ctx.lineWidth = 3 * (1 + (1 - p) * 2.5);
      ctx.beginPath(); ctx.arc(cx, cy, EZ.out(p) * maxR, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }

    function drawScanSweep(ctx, t, t0, dur, col) {
      const p = pr(t, t0, t0 + dur);
      if (p <= 0 || p >= 1) return;
      const x = lerp(-120, CFG.width + 120, EZ.inout(p));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x - 240, 0, x, 0);
      g.addColorStop(0, 'rgba(' + col + ',0)');
      g.addColorStop(1, 'rgba(' + col + ',0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 240, 0, 240, CFG.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(x, 0, 2, CFG.height);
      ctx.restore();
    }

    function drawRadialLines(ctx, t, cx, cy, intensity, col) {
      if (intensity <= 0.01) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 110; i++) {
        const a = hash(i * 1.3 + 5) * 6.2832;
        const sp = 0.6 + hash(i * 2.9 + 5) * 1.4;
        const ph = (t * sp * 1.5 + hash(i * 7.7)) % 1;
        const r0 = lerp(120, 1280, ph);
        const L = 45 + hash(i * 5.1) * 180;
        ctx.strokeStyle = 'rgba(' + col + ',' + (intensity * (0.16 + 0.45 * hash(i * 3.3)) * Math.sin(Math.PI * ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.2 + hash(i) * 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * Math.max(0, r0 - L), cy + Math.sin(a) * Math.max(0, r0 - L));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Clone template.scene-template scenes into stage ONCE
    const sceneEls = [];
    document.querySelectorAll('template.scene-template').forEach((tpl, idx) => {
      const frag = tpl.content.cloneNode(true);
      const scEl = frag.querySelector('.k-scene');
      slotsEl.appendChild(frag);
      const meta = CFG.timeline[idx] || {};
      const chEls = [...scEl.querySelectorAll('.k-ch')];
      const bgMedia = scEl.querySelector('.k-bg-media .k-media-el');
      const cardStage = scEl.querySelector('.k-card-stage');
      const macGlint = scEl.querySelector('.k-spec-glint');
      const eyebrow = scEl.querySelector('.k-eyebrow');
      const subline = scEl.querySelector('.k-subline');
      const ruleEl = scEl.querySelector('.k-accent-rule');
      const glowBar = scEl.querySelector('.k-glow-bar');
      const sealEl = scEl.querySelector('.k-stamp-seal');
      const pills = [...scEl.querySelectorAll('.k-pill')];
      const callouts = [...scEl.querySelectorAll('.k-callout')];
      const cards3d = [...scEl.querySelectorAll('.k-3d-card')].map((el, ci) => {
        const ang = hash(ci * 1.37 + 9) * 6.2832;
        const rad = 420 + hash(ci * 5.9 + 9) * 680;
        return {
          el,
          x: Math.cos(ang) * rad * 1.15,
          y: Math.sin(ang) * rad * 0.56,
          z: -1800 + (ci / 16) * 2000,
          rx: (hash(ci * 3.1) - 0.5) * 32,
          ry: (hash(ci * 6.2) - 0.5) * 44,
          rz: (hash(ci * 9.4) - 0.5) * 18,
          sp: 0.7 + hash(ci * 2.9) * 0.55,
        };
      });
      const mosaicCells = [...scEl.querySelectorAll('.k-mosaic-cell')];
      const cntNum = scEl.querySelector('.k-cnt-num');
      const cmpA = scEl.querySelector('.k-cmp-a');
      const cmpB = scEl.querySelector('.k-cmp-b');
      const cmpBridge = scEl.querySelector('.k-cmp-bridge');
      const videos = [...scEl.querySelectorAll('video')];

      sceneEls.push({
        scEl, meta, chEls, bgMedia, cardStage, macGlint, eyebrow, subline, ruleEl, glowBar, sealEl,
        pills, callouts, cards3d, mosaicCells, cntNum, cmpA, cmpB, cmpBridge, videos,
      });
    });

    function animateHeadline(chEls, localT, outT) {
      chEls.forEach((ch, i) => {
        const t0 = 0.08 + i * 0.032;
        const x = pr(localT, t0, t0 + 0.24);
        const exitX = outT != null ? pr(localT, outT + i * 0.01, outT + i * 0.01 + 0.2) : 0;
        const op = clamp(x * 4) * (1 - exitX);
        const s = 1 + (1 - EZ.out5(x)) * 1.35;
        const dy = -EZ.in(exitX) * 40;
        ch.style.opacity = op.toFixed(3);
        ch.style.transform = 'translateY(' + dy.toFixed(1) + 'px) scale(' + s.toFixed(3) + ')';
      });
    }

    function applyKenBurns(el, motion, p) {
      if (!el) return;
      if (motion === 'zoom-out') el.style.transform = 'scale(' + lerp(1.14, 1.0, p).toFixed(4) + ')';
      else if (motion === 'pan-left') el.style.transform = 'scale(1.1) translateX(' + lerp(3.2, -3.2, p).toFixed(2) + '%)';
      else if (motion === 'pan-right') el.style.transform = 'scale(1.1) translateX(' + lerp(-3.2, 3.2, p).toFixed(2) + '%)';
      else el.style.transform = 'scale(' + lerp(1.0, 1.12, p).toFixed(4) + ')';
    }

    function renderTransitions(t) {
      trc.clearRect(0, 0, CFG.width, CFG.height);
      let flashVal = 0;
      let glitchVal = 0;

      for (let i = 1; i < CFG.timeline.length; i++) {
        const sc = CFG.timeline[i];
        const cut = sc.startSec;
        const kind = sc.transition || 'iris-circle';

        if (kind === 'iris-circle') {
          const pre = 0.26, post = 0.36;
          if (t >= cut - pre && t <= cut + post) {
            const R1 = t < cut ? EZ.in(pr(t, cut - pre, cut)) * 1260 : 1320;
            const R2 = t < cut ? 0 : EZ.out(pr(t, cut, cut + post)) * 1340;
            trc.beginPath();
            trc.arc(CFG.width / 2, CFG.height / 2, R1, 0, 6.2832);
            if (R2 > 0) trc.arc(CFG.width / 2, CFG.height / 2, R2, 0, 6.2832, true);
            trc.fillStyle = CFG.accent;
            trc.fill('evenodd');
            if (R1 > 4) {
              trc.lineWidth = 22; trc.strokeStyle = CFG.accent2;
              trc.beginPath(); trc.arc(CFG.width / 2, CFG.height / 2, Math.max(0, R1 - 11), 0, 6.2832); trc.stroke();
            }
          }
        } else if (kind === 'block-wipe') {
          const d = 0.44;
          const x = (t - (cut - d / 2)) / d;
          if (x > 0 && x < 1) {
            const G = 64;
            for (let gy = 0; gy < CFG.height / G + 1; gy++) {
              for (let gx = 0; gx < CFG.width / G + 1; gx++) {
                const cx = gx * G + G / 2, cy = gy * G + G / 2;
                const h = hash(gx * 31 + gy * 17);
                const ramp = (cx / CFG.width) * 0.7 + h * 0.3;
                const s = x < 0.5 ? clamp((x / 0.5) * 1.75 - ramp * 0.75) : 1 - clamp(((x - 0.5) / 0.5) * 1.75 - (1 - ramp) * 0.75);
                if (s < 0.03) continue;
                const q = G * s;
                const colPick = hash(gx * 73 + gy * 41);
                trc.fillStyle = colPick < 0.07 ? CFG.gold : colPick < 0.28 ? CFG.accent : '#080C18';
                trc.fillRect(cx - q / 2, cy - q / 2, q, q);
              }
            }
          }
        } else if (kind === 'light-wipe') {
          const d = 0.36;
          const p = pr(t, cut - d / 2, cut + d / 2);
          if (p > 0 && p < 1) {
            drawScanSweep(trc, t, cut - d / 2, d, CFG.rgbGold);
            flashVal = Math.max(flashVal, Math.sin(p * Math.PI) * 0.45);
          }
        } else if (kind === 'glitch-cut') {
          const d = 0.28;
          const x = pr(t, cut - d / 2, cut + d / 2);
          if (x > 0 && x < 1) {
            glitchVal = Math.max(glitchVal, Math.sin(x * Math.PI));
            flashVal = Math.max(flashVal, Math.exp(-Math.abs(t - cut) * 18) * 0.45);
          }
        } else {
          // zoom-punch flash
          const dt = t - cut;
          if (dt >= -0.02 && dt <= 0.22) {
            flashVal = Math.max(flashVal, Math.exp(-Math.max(0, dt) * 16) * 0.55);
          }
        }
      }

      flashEl.style.opacity = flashVal.toFixed(3);
      if (glitchVal > 0.03) {
        const j = Math.floor(t * 48);
        const dx = glitchVal * 12 * (hash(j) - 0.5);
        worldEl.style.filter = 'drop-shadow(' + dx.toFixed(1) + 'px 0 0 rgba(255,40,70,0.7)) drop-shadow(' + (-dx).toFixed(1) + 'px 0 0 rgba(40,220,255,0.7))';
        glcEl.style.opacity = (glitchVal * 0.85).toFixed(2);
      } else {
        if (worldEl.style.filter) worldEl.style.filter = '';
        glcEl.style.opacity = '0';
      }
    }

    function renderFrameSync(frameNum) {
      const f = Math.max(0, Math.min(CFG.totalFrames - 1, Math.round(frameNum)));
      const t = f / CFG.fps;
      const pct = (f / Math.max(1, CFG.totalFrames - 1)) * 100;
      progFill.style.width = pct.toFixed(2) + '%';

      let activeIdx = 0;
      for (let i = 0; i < CFG.timeline.length; i++) {
        if (f >= CFG.timeline[i].startFrame) activeIdx = i;
      }
      const cur = sceneEls[activeIdx];
      const meta = cur ? cur.meta : CFG.timeline[0];
      const localT = t - meta.startSec;
      const durT = Math.max(1, meta.durSec);
      const p = clamp(localT / durT);

      // Update active DOM classes
      sceneEls.forEach((s, idx) => {
        const isActive = idx === activeIdx;
        if (s.scEl.classList.contains('active') !== isActive) {
          s.scEl.classList.toggle('active', isActive);
        }
      });

      // Global #world camera rig: beat pulse + entrance zoom punch + shake
      const [shX, shY] = shakeAt(t, meta.startSec, 0.34, 15);
      const punch = pr(localT, 0, 0.32) < 1 ? (1 - EZ.out(pr(localT, 0, 0.32))) * 0.045 : 0;
      const camZoom = 1 + beatPulse(t, true) * 0.011 + punch;
      worldEl.style.transform = 'translate(' + shX.toFixed(1) + 'px,' + shY.toFixed(1) + 'px) scale(' + camZoom.toFixed(4) + ')';

      // Render Background Canvas (#fxb)
      fxb.clearRect(0, 0, CFG.width, CFG.height);
      drawStars(fxb, t, 85, 0.42, CFG.rgbAccent);

      // Render Scene Animations
      if (cur) {
        applyKenBurns(cur.bgMedia, meta.kenBurns, p);
        const outT = activeIdx < sceneEls.length - 1 ? durT - 0.35 : null;
        animateHeadline(cur.chEls, localT, outT);

        if (cur.eyebrow) {
          const eIn = EZ.expo(pr(localT, 0.02, 0.32));
          cur.eyebrow.style.opacity = eIn.toFixed(3);
          cur.eyebrow.style.transform = 'translateY(' + ((1 - eIn) * 20).toFixed(1) + 'px)';
        }
        if (cur.subline) {
          const sIn = EZ.expo(pr(localT, 0.35, 0.72));
          cur.subline.style.opacity = sIn.toFixed(3);
          cur.subline.style.transform = 'translateY(' + ((1 - sIn) * 22).toFixed(1) + 'px)';
        }
        if (cur.ruleEl) {
          const rIn = EZ.expo(pr(localT, 0.32, 0.75));
          cur.ruleEl.style.transform = 'scaleX(' + rIn.toFixed(3) + ')';
        }
        if (cur.glowBar) {
          const gIn = EZ.expo(pr(localT, 0.35, 0.85));
          cur.glowBar.style.transform = 'scaleX(' + gIn.toFixed(3) + ')';
        }
        if (cur.sealEl) {
          const sl = pr(localT, 0.65, 0.88);
          cur.sealEl.style.opacity = clamp(sl * 4).toFixed(3);
          cur.sealEl.style.transform = 'scale(' + (1 + (1 - EZ.out5(sl)) * 1.4).toFixed(3) + ') rotate(-5deg)';
        }
        cur.pills.forEach((pill, pi) => {
          const t0 = 0.45 + pi * 0.14;
          const x = pr(localT, t0, t0 + 0.38);
          pill.style.opacity = clamp(x * 4).toFixed(3);
          pill.style.transform = 'scale(' + (0.65 + 0.35 * EZ.spring(x)).toFixed(3) + ')';
        });
        cur.callouts.forEach((c, ci) => {
          const t0 = 0.42 + ci * 0.16;
          const x = EZ.expo(pr(localT, t0, t0 + 0.45));
          c.style.opacity = x.toFixed(3);
          c.style.transform = 'translateX(' + ((1 - x) * 90).toFixed(1) + 'px)';
        });
        if (cur.cardStage) {
          const x = EZ.expo(pr(localT, 0.12, 0.62));
          const rotY = (activeIdx % 2 ? 7 : -7) + Math.sin(localT * 1.1) * 1.8;
          const rotX = 2 + Math.cos(localT * 0.9) * 1.2;
          cur.cardStage.style.opacity = x.toFixed(3);
          cur.cardStage.style.transform =
            'translateY(' + ((1 - x) * 44).toFixed(1) + 'px) rotateY(' + rotY.toFixed(2) + 'deg) rotateX(' + rotX.toFixed(2) + 'deg) scale(' + (0.92 + 0.08 * x).toFixed(4) + ')';
        }
        if (cur.macGlint) {
          const gx = lerp(-120, 120, pr(localT, 0.55, 1.35));
          cur.macGlint.style.transform = 'translateX(' + gx.toFixed(1) + '%)';
          cur.macGlint.style.opacity = pr(localT, 0.55, 0.7) * (1 - pr(localT, 1.2, 1.35));
        }

        // 3D Stage Opener Card Swarm
        cur.cards3d.forEach((c) => {
          let zz = c.z + localT * 520 * c.sp;
          zz = ((zz % 2400) + 2400) % 2400 - 1900;
          const fadeIn = pr(localT, 0, 0.45);
          const near = zz > 260 ? clamp((zz - 260) / 300) : 0;
          const op = clamp((zz + 1900) / 500) * (1 - near) * fadeIn * 0.78;
          c.el.style.opacity = op.toFixed(3);
          c.el.style.transform =
            'translate3d(' + c.x.toFixed(1) + 'px,' + (c.y + Math.sin(localT + c.sp) * 14).toFixed(1) + 'px,' + zz.toFixed(1) + 'px) rotateX(' + c.rx + 'deg) rotateY(' + c.ry + 'deg) translate(-50%,-50%)';
        });

        // Mosaic Pulse Wall
        if (cur.mosaicCells.length > 0) {
          const pulse = beatPulse(t, false);
          const activeBeatGroup = Math.floor(localT * 2.2) % cur.mosaicCells.length;
          cur.mosaicCells.forEach((cell, mi) => {
            const cIn = EZ.spring(pr(localT, 0.06 + mi * 0.07, 0.46 + mi * 0.07));
            const isBeatPop = mi === activeBeatGroup || (mi + 3) % cur.mosaicCells.length === activeBeatGroup;
            const popZ = isBeatPop ? 48 * pulse : 0;
            cell.style.opacity = clamp(cIn * 1.4).toFixed(3);
            cell.style.borderColor = isBeatPop && pulse > 0.2 ? CFG.gold : 'rgba(255,255,255,0.16)';
            cell.style.transform = 'translateZ(' + popZ.toFixed(1) + 'px) scale(' + (0.85 + 0.15 * cIn + (isBeatPop ? pulse * 0.04 : 0)).toFixed(4) + ')';
          });
          if (cur.cntNum) {
            const nVal = Math.round(EZ.out(pr(localT, 0.25, 1.45)) * meta.counterTarget);
            cur.cntNum.textContent = String(nVal).padStart(2, '0') + '+';
          }
        }

        // Compare Dual
        if (cur.cmpA && cur.cmpB) {
          const ax = EZ.expo(pr(localT, 0.22, 0.65));
          const bx = EZ.expo(pr(localT, 0.34, 0.77));
          cur.cmpA.style.opacity = ax.toFixed(3);
          cur.cmpA.style.transform = 'translateX(' + ((1 - ax) * -140).toFixed(1) + 'px)';
          cur.cmpB.style.opacity = bx.toFixed(3);
          cur.cmpB.style.transform = 'translateX(' + ((1 - bx) * 140).toFixed(1) + 'px)';
          if (cur.cmpBridge) cur.cmpBridge.style.transform = 'scaleX(' + EZ.expo(pr(localT, 0.55, 0.9)).toFixed(3) + ')';
        }
      }

      // Render Foreground VFX Canvas (#fxt)
      fxt.clearRect(0, 0, CFG.width, CFG.height);
      if (meta.layout === 'radial-climax') {
        drawRadialLines(fxt, t, CFG.width / 2, CFG.height / 2, 0.65, CFG.rgbAccent);
        drawGlow(fxt, CFG.width / 2, CFG.height / 2, 420, CFG.rgbGold, 0.16 + beatPulse(t, true) * 0.1);
      }
      if (localT < 1.2) {
        drawShockRing(fxt, localT, 0.04, CFG.width * 0.5, CFG.height * 0.45, Math.min(CFG.width, CFG.height) * 0.78, 0.65, CFG.rgbAccent);
        drawSparks(fxt, localT, 0.1, CFG.width * 0.5, CFG.height * 0.45, CFG.rgbGold, 44, activeIdx + 5);
        drawScanSweep(fxt, localT, 0.35, 0.55, CFG.rgbAccent);
      }

      // Transitions + 24fps Shifted Grain
      renderTransitions(t);
      grainCtx.clearRect(0, 0, CFG.width, CFG.height);
      grainCtx.save();
      const ox = Math.floor(hash(Math.floor(t * 24)) * 256);
      const oy = Math.floor(hash(Math.floor(t * 24) + 7) * 256);
      grainCtx.translate(-ox, -oy);
      grainCtx.fillStyle = gPat;
      grainCtx.fillRect(ox, oy, CFG.width, CFG.height);
      grainCtx.restore();

      // Synchronized Bottom Single-Line Subtitle
      const subs = meta.subtitles || [];
      let activeSub = null;
      for (const sb of subs) {
        if (localT >= Number(sb.startSec || 0) && localT <= Number(sb.endSec || 999)) {
          activeSub = sb;
          break;
        }
      }
      if (!activeSub && subs.length > 0 && localT >= Number(subs[subs.length - 1].startSec || 0)) {
        activeSub = subs[subs.length - 1];
      }
      let txt = '';
      if (activeSub) {
        txt = activeSub.text;
      } else if (subs.length > 0) {
        txt = localT < Number(subs[0].startSec || 0) ? subs[0].text : subs[subs.length - 1].text;
      } else {
        txt = String(meta.narration || '').slice(0, 22);
      }
      if (txt) {
        subPill.style.display = 'block';
        if (subPill.textContent !== txt) subPill.textContent = txt;
      } else {
        subPill.style.display = 'none';
      }
      if (endNoticeWrap) {
        const noticeStartSec = Math.max(0, CFG.totalSec - Math.min(2.2, Math.max(1.0, CFG.totalSec * 0.2)));
        const nAlpha = t >= noticeStartSec ? clamp((t - noticeStartSec) / 0.35) : 0;
        endNoticeWrap.style.opacity = nAlpha.toFixed(3);
      }
    }

    async function seekVideosForActiveScene(frameNum) {
      const f = Math.max(0, Math.min(CFG.totalFrames - 1, Math.round(frameNum)));
      const t = f / CFG.fps;
      let activeIdx = 0;
      for (let i = 0; i < CFG.timeline.length; i++) {
        if (f >= CFG.timeline[i].startFrame) activeIdx = i;
      }
      const cur = sceneEls[activeIdx];
      if (!cur || !cur.videos.length) return;
      const localT = Math.max(0, t - cur.meta.startSec);
      const tasks = cur.videos.map((v) => {
        if (!v || v.readyState < 1) return Promise.resolve();
        const vidDur = Number.isFinite(v.duration) && v.duration > 0.1 ? v.duration : 10;
        const target = localT % vidDur;
        if (Math.abs(v.currentTime - target) < 0.022) return Promise.resolve();
        return new Promise((res) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            v.removeEventListener('seeked', finish);
            res();
          };
          v.addEventListener('seeked', finish);
          try { v.currentTime = target; } catch { finish(); }
          setTimeout(finish, 70);
        });
      });
      await Promise.all(tasks);
    }

    window.__seekToFrame = async (frame) => {
      await seekVideosForActiveScene(frame);
      renderFrameSync(frame);
      return frame;
    };

    function fitStageToViewport() {
      const vw = window.innerWidth || CFG.width;
      const vh = window.innerHeight || CFG.height;
      const scale = Math.min(vw / CFG.width, vh / CFG.height);
      stageEl.style.transform = Math.abs(scale - 1) < 0.002 ? '' : 'scale(' + scale.toFixed(4) + ')';
    }
    window.addEventListener('resize', fitStageToViewport);
    fitStageToViewport();

    // Smooth Live Preview Mode (runs when not ?render=1)
    const isRenderMode = new URLSearchParams(location.search).get('render') === '1';
    if (!isRenderMode) {
      let playing = false;
      let curFrame = 0;
      let lastTs = 0;
      const tick = (ts) => {
        if (playing) {
          if (!lastTs) lastTs = ts;
          const dt = (ts - lastTs) / 1000;
          lastTs = ts;
          curFrame += dt * CFG.fps;
          if (curFrame >= CFG.totalFrames) curFrame = 0;
          renderFrameSync(curFrame);
          try { window.parent.postMessage({ type: 'dsh-video-frame', frame: Math.floor(curFrame) }, '*'); } catch {}
        }
        requestAnimationFrame(tick);
      };
      window.addEventListener('message', async (ev) => {
        const d = ev?.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'dsh-play') { playing = true; lastTs = 0; }
        else if (d.type === 'dsh-pause') { playing = false; }
        else if (d.type === 'dsh-seek') {
          playing = false;
          curFrame = Number(d.frame) || 0;
          await window.__seekToFrame(curFrame);
        }
      });
      renderFrameSync(0);
      requestAnimationFrame(tick);
    } else {
      renderFrameSync(0);
    }
  })();
  </script>
</body>
</html>`
}
