/**
 * Rich HTML5 / CSS3 / Canvas2D Frame-Deterministic Video Generator
 * Produces clean cinema-grade visuals for user images, video clips, and kinetic typography:
 * - Zero debug counters / filenames stamped onto frames
 * - Light bottom-only cinema scrims so imported photography & B-roll stay vibrant
 * - Single-line timed cinema subtitles & deterministic Ken Burns + particle light-sweep VFX
 * - Avoids expensive CPU software blur filters so Chromium CDP renders smoothly
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const STYLE_PALETTES = {
  tech: {
    background: '#060B18',
    surface: '#0F172A',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    accent: '#38BDF8',
    accent2: '#818CF8',
  },
  cinematic: {
    background: '#09090B',
    surface: '#18181B',
    textPrimary: '#FAFAFA',
    textSecondary: '#E4E4E7',
    accent: '#F59E0B',
    accent2: '#FB7185',
  },
  documentary: {
    background: '#0C1210',
    surface: '#14201C',
    textPrimary: '#F4F7F5',
    textSecondary: '#CBD5D1',
    accent: '#2DD4BF',
    accent2: '#38BDF8',
  },
  energetic: {
    background: '#0D071A',
    surface: '#1A1033',
    textPrimary: '#FFFFFF',
    textSecondary: '#E2D9F3',
    accent: '#F43F5E',
    accent2: '#A855F7',
  },
  warm: {
    background: '#140F0D',
    surface: '#231A16',
    textPrimary: '#FDF8F6',
    textSecondary: '#E7D8D1',
    accent: '#FB923C',
    accent2: '#FBBF24',
  },
}

export function resolvePalette(script) {
  const base = STYLE_PALETTES[script?.style] || STYLE_PALETTES.tech
  return { ...base, ...(script?.theme || {}) }
}

export function buildRichHtmlVideo(script) {
  const theme = resolvePalette(script)
  const scenes = Array.isArray(script?.scenes) ? script.scenes : []

  const sceneTemplates = scenes
    .map((scene, idx) => {
      const mediaList = Array.isArray(scene.media)
        ? scene.media
        : scene.mediaPath
          ? [{ path: scene.mediaPath, type: scene.mediaType || 'image', motion: scene.kenBurns || 'zoom-in' }]
          : []
      const primary = mediaList[0] || null
      const secondary = mediaList[1] || null
      const hasMedia = Boolean(primary && primary.path)
      const layout = scene.layout || (hasMedia ? (secondary ? 'split-showcase' : 'hero-media') : 'kinetic-title')
      const tags = Array.isArray(scene.highlights) ? scene.highlights : []
      const metrics = Array.isArray(scene.metrics) ? scene.metrics : []
      const isOpening = idx === 0

      const renderMediaEl = (m, cls) => {
        if (!m || !m.path) return ''
        if (m.type === 'video') {
          const vSrc = m.webPath || m.path
          return `<video class="media-el ${cls}" data-media-src="${esc(vSrc)}" src="${esc(vSrc)}" muted playsinline preload="auto"></video>`
        }
        return `<img class="media-el ${cls}" src="${esc(m.path)}" alt="${esc(scene.title)}" />`
      }

      const chapterBadge = `${String(idx + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`

      return `
  <!-- 分镜 ${idx + 1}: ${esc(scene.title)} -->
  <template id="${esc(scene.id)}">
    <section class="scene-layer layout-${esc(layout)} ${isOpening ? 'is-opening' : 'is-chapter'}" data-scene-id="${esc(scene.id)}" data-scene-index="${idx}">
      ${
        hasMedia && layout === 'hero-media'
          ? `<div class="hero-media-wrap">${renderMediaEl(primary, 'hero-media-item')}<div class="hero-scrim ${isOpening ? 'opening-scrim' : 'cinema-scrim'}"></div></div>`
          : hasMedia
            ? `<div class="backdrop-media-wrap">${renderMediaEl(primary, 'backdrop-media-item')}<div class="hero-scrim strong-scrim"></div></div>`
            : `<div class="procedural-bg"><div class="procedural-grid"></div></div>`
      }
      ${
        hasMedia && layout === 'hero-media'
          ? `
      <div class="cinema-title-overlay ${isOpening ? 'hero-opening-overlay' : 'lower-third-overlay'}">
        <div class="chapter-eyebrow">
          <span class="chapter-bar"></span>
          <span>${esc(chapterBadge)}</span>
          ${scene.tag ? `<span class="chapter-sep">·</span><span>${esc(scene.tag)}</span>` : ''}
        </div>
        <h1 class="kinetic-title ${isOpening ? 'opening-title' : 'chapter-title'}">${esc(scene.title)}</h1>
        ${isOpening && scene.subtitleLine ? `<p class="scene-lead">${esc(scene.subtitleLine)}</p>` : ''}
      </div>`
          : `
      <div class="scene-content-grid">
        <div class="scene-copy-col">
          <div class="chapter-eyebrow">
            <span class="chapter-bar"></span>
            <span>${esc(chapterBadge)}</span>
            ${scene.tag ? `<span class="chapter-sep">·</span><span>${esc(scene.tag)}</span>` : ''}
          </div>
          <h1 class="kinetic-title">${esc(scene.title)}</h1>
          ${scene.subtitleLine ? `<p class="scene-lead">${esc(scene.subtitleLine)}</p>` : ''}
          ${
            tags.length > 0
              ? `<div class="highlight-chips">${tags
                  .slice(0, 4)
                  .map((t, ti) => `<span class="hl-chip" data-chip-idx="${ti}">${esc(t)}</span>`)
                  .join('')}</div>`
              : ''
          }
          ${
            metrics.length > 0
              ? `<div class="metric-row">${metrics
                  .slice(0, 3)
                  .map(
                    (mt, mi) =>
                      `<div class="stat-card" data-stat-idx="${mi}"><span class="stat-val" data-target="${esc(mt.value)}" data-suffix="${esc(mt.suffix || '')}">${esc(mt.value)}${esc(mt.suffix || '')}</span><span class="stat-label">${esc(mt.label)}</span></div>`,
                  )
                  .join('')}</div>`
              : ''
          }
        </div>
        ${
          hasMedia
            ? `<div class="scene-media-col">
                 <div class="media-card primary-card">${renderMediaEl(primary, 'card-media-item')}</div>
                 ${secondary ? `<div class="media-card secondary-card">${renderMediaEl(secondary, 'card-media-item')}</div>` : ''}
               </div>`
            : ''
        }
      </div>`
      }
    </section>
  </template>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(script?.title || 'DSH Video Project')}</title>
  <style>
    @font-face {
      font-family: 'DSH-YaHei';
      src: local('Microsoft YaHei UI'), local('Microsoft YaHei'), local('微软雅黑');
      font-weight: 400 800;
    }
    @font-face {
      font-family: 'DSH-Mono';
      src: local('Consolas'), local('Cascadia Mono');
      font-weight: 400 700;
    }
    :root {
      --bg: ${theme.background};
      --surface: ${theme.surface};
      --fg: ${theme.textPrimary};
      --fg-sub: ${theme.textSecondary};
      --accent: ${theme.accent};
      --accent2: ${theme.accent2 || theme.accent};
      --font-sans: 'DSH-YaHei', 'Microsoft YaHei', sans-serif;
      --font-mono: 'DSH-Mono', 'Consolas', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font-sans);
      user-select: none;
    }
    #stage-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
    }
    #stage-layers {
      position: absolute;
      inset: 0;
      z-index: 2;
    }
    #vfx-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 4;
    }
    #vignette-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(ellipse at center, transparent 62%, rgba(0,0,0,0.42) 100%);
      z-index: 5;
    }
    .scene-layer {
      position: absolute;
      inset: 0;
      display: none;
      overflow: hidden;
    }
    .scene-layer.active {
      display: block;
    }
    .hero-media-wrap, .backdrop-media-wrap, .procedural-bg {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 0;
    }
    .procedural-bg {
      background:
        radial-gradient(circle at 26% 28%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 54%),
        radial-gradient(circle at 76% 74%, color-mix(in srgb, var(--accent2) 20%, transparent), transparent 54%),
        var(--bg);
    }
    .procedural-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 72px 72px;
    }
    .media-el {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      will-change: transform;
    }
    .backdrop-media-item {
      opacity: 0.28;
      transform: scale(1.08);
    }
    .hero-scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .cinema-scrim {
      background: linear-gradient(
        180deg,
        rgba(0,0,0,0.12) 0%,
        rgba(0,0,0,0.02) 45%,
        rgba(0,0,0,0.48) 76%,
        rgba(0,0,0,0.78) 100%
      );
    }
    .opening-scrim {
      background:
        linear-gradient(90deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.28) 55%, rgba(0,0,0,0.12) 100%),
        linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 45%, rgba(0,0,0,0.78) 100%);
    }
    .strong-scrim {
      background: linear-gradient(135deg, rgba(6,10,18,0.84), rgba(6,10,18,0.62));
    }

    /* Full-bleed Cinema Overlays (Vibrant photos + minimal lower-third typography) */
    .cinema-title-overlay {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 6% 6.5% 118px;
      gap: 12px;
    }
    .hero-opening-overlay {
      max-width: 960px;
    }
    .lower-third-overlay {
      max-width: 780px;
    }
    .chapter-eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.82);
      text-shadow: 0 2px 8px rgba(0,0,0,0.85);
    }
    .chapter-bar {
      width: 24px;
      height: 3px;
      border-radius: 99px;
      background: var(--accent);
      display: inline-block;
    }
    .chapter-sep {
      opacity: 0.45;
    }
    .kinetic-title {
      font-weight: 800;
      line-height: 1.18;
      color: var(--fg);
      text-shadow: 0 4px 24px rgba(0,0,0,0.78);
      letter-spacing: -0.01em;
    }
    .opening-title {
      font-size: clamp(38px, 4.6vw, 70px);
    }
    .chapter-title {
      font-size: clamp(26px, 2.8vw, 44px);
      font-weight: 700;
    }
    .scene-lead {
      font-size: clamp(16px, 1.55vw, 22px);
      line-height: 1.55;
      color: rgba(255,255,255,0.88);
      max-width: 680px;
      text-shadow: 0 2px 12px rgba(0,0,0,0.85);
    }

    /* Kinetic / Multi-Card Split Layouts */
    .scene-content-grid {
      position: relative;
      z-index: 3;
      width: 100%;
      height: 100%;
      padding: 6% 6.5% 118px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4.5%;
    }
    .layout-kinetic-title .scene-content-grid {
      justify-content: center;
      text-align: center;
    }
    .layout-kinetic-title .scene-copy-col {
      align-items: center;
      max-width: 82%;
    }
    .scene-copy-col {
      flex: 1.05;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .highlight-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    .hl-chip {
      padding: 7px 15px;
      border-radius: 99px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.16);
      font-size: clamp(13px, 1.15vw, 16px);
      font-weight: 500;
      color: var(--fg);
    }
    .metric-row {
      display: flex;
      gap: 16px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .stat-card {
      min-width: 130px;
      padding: 12px 20px;
      border-radius: 12px;
      background: rgba(15, 20, 32, 0.85);
      border: 1px solid rgba(255,255,255,0.14);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-val {
      font-family: var(--font-mono);
      font-size: clamp(22px, 2.3vw, 34px);
      font-weight: 800;
      color: var(--accent);
    }
    .stat-label {
      font-size: 13px;
      color: var(--fg-sub);
    }
    .scene-media-col {
      flex: 1.15;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .media-card {
      width: 100%;
      max-height: 78%;
      aspect-ratio: 16 / 10;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.16);
      box-shadow: 0 24px 64px rgba(0,0,0,0.65);
      background: #080A10;
    }
    .secondary-card {
      position: absolute;
      width: 46%;
      right: -14px;
      bottom: 8%;
      box-shadow: 0 20px 48px rgba(0,0,0,0.8);
      border-color: rgba(255,255,255,0.22);
    }

    /* Clean Broadcast Cinema Subtitles */
    #subtitle-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 34px;
      display: flex;
      justify-content: center;
      padding: 0 7%;
      z-index: 7;
      pointer-events: none;
    }
    #subtitle-pill {
      padding: 8px 22px;
      border-radius: 8px;
      background: rgba(8, 10, 14, 0.58);
      font-size: clamp(20px, 2.05vw, 32px);
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: 0.02em;
      color: #FFFFFF;
      text-shadow: 0 2px 8px rgba(0,0,0,0.92);
      max-width: 1420px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="stage-root">
    <div id="stage-layers"></div>
    <canvas id="vfx-canvas"></canvas>
    <div id="vignette-layer"></div>
    <div id="subtitle-overlay">
      <div id="subtitle-pill"></div>
    </div>
  </div>

  ${sceneTemplates}

  <script id="dsh-script-data" type="application/json">
${JSON.stringify(script, null, 2)}
  </script>

  <script>
    (function() {
      const scriptData = JSON.parse(document.getElementById('dsh-script-data').textContent);
      const fps = Number(scriptData.fps) || 30;
      const scenes = Array.isArray(scriptData.scenes) ? scriptData.scenes : [];
      const totalFrames = Math.max(1, Number(scriptData.totalDurationInFrames) || 300);

      const layersRoot = document.getElementById('stage-layers');
      const vfxCanvas = document.getElementById('vfx-canvas');
      const vfxCtx = vfxCanvas.getContext('2d');
      const subPill = document.getElementById('subtitle-pill');

      const mountedScenes = scenes.map(function(s, idx) {
        const tpl = document.getElementById(s.id);
        let el = null;
        if (tpl) {
          const frag = tpl.content.cloneNode(true);
          el = frag.querySelector('.scene-layer');
          if (el) layersRoot.appendChild(el);
        }
        return { scene: s, idx: idx, el: el };
      });

      const particles = Array.from({ length: 34 }, function(_, i) {
        const seed = (i * 9301 + 49297) % 233280;
        return {
          x0: (seed % 1000) / 1000,
          y0: ((seed * 7) % 1000) / 1000,
          r: 1.2 + (i % 4) * 0.9,
          vx: ((i % 2 === 0 ? 1 : -1) * (0.00035 + (i % 5) * 0.0002)),
          vy: -(0.0004 + (i % 6) * 0.00025),
          alpha: 0.10 + (i % 5) * 0.055,
        };
      });

      function easeOutCubic(x) {
        const t = Math.max(0, Math.min(1, x));
        return 1 - Math.pow(1 - t, 3);
      }

      function drawParticlesAndLightLeak(frame) {
        const w = (vfxCanvas.width = window.innerWidth || 1280);
        const h = (vfxCanvas.height = window.innerHeight || 720);
        vfxCtx.clearRect(0, 0, w, h);

        const sweep = ((frame % 210) / 210) * 1.6 - 0.3;
        const gx = w * sweep;
        const grad = vfxCtx.createLinearGradient(gx - 220, 0, gx + 220, h);
        grad.addColorStop(0, 'rgba(255, 220, 170, 0)');
        grad.addColorStop(0.5, 'rgba(255, 220, 170, 0.035)');
        grad.addColorStop(1, 'rgba(255, 220, 170, 0)');
        vfxCtx.fillStyle = grad;
        vfxCtx.fillRect(0, 0, w, h);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const x = (((p.x0 + frame * p.vx) % 1) + 1) % 1 * w;
          const y = (((p.y0 + frame * p.vy) % 1) + 1) % 1 * h;
          const pulse = 0.65 + 0.35 * Math.sin(frame * 0.07 + i);
          vfxCtx.beginPath();
          vfxCtx.arc(x, y, p.r, 0, Math.PI * 2);
          vfxCtx.fillStyle = 'rgba(255, 244, 224, ' + (p.alpha * pulse).toFixed(3) + ')';
          vfxCtx.fill();
        }
      }

      function applyKenBurns(el, motion, progress) {
        if (!el) return;
        const p = Math.max(0, Math.min(1, progress));
        if (motion === 'zoom-out') {
          el.style.transform = 'scale(' + (1.13 - 0.13 * p).toFixed(4) + ')';
        } else if (motion === 'pan-left') {
          el.style.transform = 'scale(1.1) translateX(' + (3.2 - 6.4 * p).toFixed(2) + '%)';
        } else if (motion === 'pan-right') {
          el.style.transform = 'scale(1.1) translateX(' + (-3.2 + 6.4 * p).toFixed(2) + '%)';
        } else {
          el.style.transform = 'scale(' + (1.0 + 0.12 * p).toFixed(4) + ')';
        }
      }

      function applySceneState(entry, localFrame, isOutgoing, transProgress) {
        const s = entry.scene;
        const el = entry.el;
        if (!el) return;
        const dur = Math.max(1, Number(s.durationInFrames) || 90);
        const progress = Math.max(0, Math.min(1, localFrame / dur));
        const transType = s.transition || 'crossfade';

        el.classList.add('active');
        el.style.zIndex = isOutgoing ? '1' : '2';
        el.style.clipPath = 'none';
        el.style.opacity = '1';
        el.style.transform = 'none';

        if (!isOutgoing && transProgress < 1) {
          if (transType === 'wipe-left') {
            const pct = ((1 - easeOutCubic(transProgress)) * 100).toFixed(1);
            el.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
          } else if (transType === 'slide-up') {
            const ty = ((1 - easeOutCubic(transProgress)) * 10).toFixed(2);
            el.style.transform = 'translateY(' + ty + '%)';
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          } else if (transType === 'zoom-cut') {
            const sc = (1.06 - 0.06 * easeOutCubic(transProgress)).toFixed(4);
            el.style.transform = 'scale(' + sc + ')';
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          } else {
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          }
        } else if (isOutgoing) {
          el.style.opacity = String((1 - easeOutCubic(transProgress) * 0.7).toFixed(3));
        }

        const eyebrow = el.querySelector('.chapter-eyebrow');
        if (eyebrow) {
          const ep = easeOutCubic(localFrame / 14);
          eyebrow.style.opacity = String(ep.toFixed(3));
          eyebrow.style.transform = 'translateY(' + ((1 - ep) * 14).toFixed(1) + 'px)';
        }
        const titleEl = el.querySelector('.kinetic-title');
        if (titleEl) {
          const tp = easeOutCubic((localFrame - 2) / 16);
          titleEl.style.opacity = String(tp.toFixed(3));
          titleEl.style.transform = 'translateY(' + ((1 - tp) * 22).toFixed(1) + 'px)';
        }
        const leadEl = el.querySelector('.scene-lead');
        if (leadEl) {
          const lp = easeOutCubic((localFrame - 6) / 16);
          leadEl.style.opacity = String(lp.toFixed(3));
          leadEl.style.transform = 'translateY(' + ((1 - lp) * 16).toFixed(1) + 'px)';
        }
        el.querySelectorAll('.hl-chip').forEach(function(chip, ci) {
          const cp = easeOutCubic((localFrame - (9 + ci * 4)) / 14);
          chip.style.opacity = String(cp.toFixed(3));
          chip.style.transform = 'translateY(' + ((1 - cp) * 12).toFixed(1) + 'px)';
        });
        el.querySelectorAll('.stat-card').forEach(function(card, si) {
          const sp = easeOutCubic((localFrame - (10 + si * 5)) / 16);
          card.style.opacity = String(sp.toFixed(3));
          card.style.transform = 'translateY(' + ((1 - sp) * 14).toFixed(1) + 'px)';
          const valEl = card.querySelector('.stat-val');
          if (valEl) {
            const raw = Number(valEl.getAttribute('data-target'));
            const suffix = valEl.getAttribute('data-suffix') || '';
            if (Number.isFinite(raw)) {
              const countP = easeOutCubic((localFrame - (10 + si * 5)) / 28);
              const cur = raw >= 10 && Number.isInteger(raw) ? Math.round(raw * countP) : (raw * countP).toFixed(raw % 1 === 0 ? 0 : 1);
              valEl.textContent = String(cur) + suffix;
            }
          }
        });

        const mediaCard = el.querySelector('.primary-card');
        if (mediaCard) {
          const mp = easeOutCubic((localFrame - 3) / 16);
          mediaCard.style.opacity = String(mp.toFixed(3));
          mediaCard.style.transform = 'translateY(' + ((1 - mp) * 18).toFixed(1) + 'px) scale(' + (0.97 + 0.03 * mp).toFixed(3) + ')';
        }
        const mediaList = Array.isArray(s.media) ? s.media : [];
        const heroMedia = el.querySelector('.hero-media-item, .card-media-item');
        applyKenBurns(heroMedia, (mediaList[0] && mediaList[0].motion) || s.kenBurns || 'zoom-in', progress);
      }

      async function syncVideos(entry, localFrame) {
        const videos = entry.el ? Array.from(entry.el.querySelectorAll('video')) : [];
        if (videos.length === 0) return;
        const mediaList = Array.isArray(entry.scene.media) ? entry.scene.media : [];
        await Promise.all(videos.map(function(v, vi) {
          const meta = mediaList[vi] || {};
          const startOff = Number(meta.trimStartSec || 0);
          const ensureLoaded = v.readyState >= 2
            ? Promise.resolve()
            : new Promise(function(resLoad) {
                const t = setTimeout(resLoad, 1200);
                const ok = function() { clearTimeout(t); resLoad(); };
                v.addEventListener('loadeddata', ok, { once: true });
                v.addEventListener('error', ok, { once: true });
                try { if (v.readyState === 0) v.load(); } catch {}
              });
          return ensureLoaded.then(function() {
            const dur = Number(v.duration);
            let targetTime = startOff + localFrame / fps;
            if (Number.isFinite(dur) && dur > 0.2) targetTime = targetTime % dur;
            if (v.readyState >= 2 && Math.abs(v.currentTime - targetTime) < 0.015) return;
            return new Promise(function(resolveSeek) {
              let done = false;
              const finish = function() {
                if (done) return;
                done = true;
                v.removeEventListener('seeked', finish);
                resolveSeek();
              };
              const timer = setTimeout(finish, 140);
              v.addEventListener('seeked', function() {
                clearTimeout(timer);
                finish();
              }, { once: true });
              try {
                v.pause();
                v.currentTime = targetTime;
              } catch (e) {
                clearTimeout(timer);
                finish();
              }
            });
          });
        }));
      }

      function findHit(frame) {
        for (let i = 0; i < mountedScenes.length; i++) {
          const s = mountedScenes[i].scene;
          const start = Number(s.startFrame || 0);
          const dur = Number(s.durationInFrames || 90);
          if (frame >= start && frame < start + dur) {
            return { entry: mountedScenes[i], prev: i > 0 ? mountedScenes[i - 1] : null, localFrame: frame - start };
          }
        }
        const lastIdx = Math.max(0, mountedScenes.length - 1);
        const last = mountedScenes[lastIdx];
        return {
          entry: last,
          prev: lastIdx > 0 ? mountedScenes[lastIdx - 1] : null,
          localFrame: last ? Math.max(0, (last.scene.durationInFrames || 90) - 1) : 0,
        };
      }

      async function renderAtFrame(frame) {
        const f = Math.max(0, Math.min(totalFrames - 1, Math.floor(Number(frame) || 0)));
        const hit = findHit(f);
        if (!hit || !hit.entry) return f;

        mountedScenes.forEach(function(m) {
          if (m.el) m.el.classList.remove('active');
        });

        const transFrames = 14;
        const transP = hit.prev ? Math.min(1, hit.localFrame / transFrames) : 1;
        if (hit.prev && transP < 1) {
          const prevDur = Number(hit.prev.scene.durationInFrames || 90);
          applySceneState(hit.prev, Math.max(0, prevDur - 1), true, transP);
        }
        applySceneState(hit.entry, hit.localFrame, false, transP);
        await syncVideos(hit.entry, hit.localFrame);
        drawParticlesAndLightLeak(f);

        const secInScene = hit.localFrame / fps;
        const subs = hit.entry.scene.subtitles || [];
        const activeSub =
          subs.find(function(sub) { return secInScene >= sub.startSec && secInScene <= sub.endSec; }) ||
          subs[subs.length - 1];
        const text = (activeSub && activeSub.text) || hit.entry.scene.narration || '';
        if (subPill) {
          subPill.textContent = text;
          subPill.style.display = text ? 'block' : 'none';
        }
        return f;
      }

      window.__seekToFrame = renderAtFrame;
      window.__getScriptData = function() { return scriptData; };
      window.addEventListener('message', function(ev) {
        if (ev.data && ev.data.type === 'dsh-video:seek') renderAtFrame(ev.data.frame || 0);
      });

      const params = new URLSearchParams(window.location.search);
      const initF = params.has('frame')
        ? Number(params.get('frame'))
        : params.has('time')
          ? Math.floor(Number(params.get('time')) * fps)
          : 15;
      renderAtFrame(initF);
    })();
  </script>
</body>
</html>
`
}
