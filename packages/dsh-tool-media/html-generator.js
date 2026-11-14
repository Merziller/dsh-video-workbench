/**
 * Rich HTML5 / CSS3 / Canvas2D / SVG Frame-Deterministic Video Generator
 * Supports user-imported images & videos, Ken Burns camera motion, scene transitions,
 * deterministic particle & light-leak VFX, kinetic typography, metric count-ups, and synced subtitles.
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
    textSecondary: '#D4D4D8',
    accent: '#F59E0B',
    accent2: '#EF4444',
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
      const layout = scene.layout || (primary ? (idx % 2 === 1 ? 'split-showcase' : 'hero-media') : 'kinetic-title')
      const tags = Array.isArray(scene.highlights) ? scene.highlights : []
      const metrics = Array.isArray(scene.metrics) ? scene.metrics : []

      const renderMediaEl = (m, cls) => {
        if (!m || !m.path) return ''
        if (m.type === 'video') {
          const vSrc = m.webPath || m.path
          return `<video class="media-el ${cls}" data-media-src="${esc(vSrc)}" src="${esc(vSrc)}" muted playsinline preload="auto"></video>`
        }
        return `<img class="media-el ${cls}" src="${esc(m.path)}" alt="${esc(scene.title)}" />`
      }

      return `
  <!-- 分镜 ${idx + 1}: ${esc(scene.title)} -->
  <template id="${esc(scene.id)}">
    <section class="scene-layer layout-${esc(layout)}" data-scene-id="${esc(scene.id)}" data-scene-index="${idx}">
      ${
        primary && layout === 'hero-media'
          ? `<div class="hero-media-wrap">${renderMediaEl(primary, 'hero-media-item')}<div class="hero-scrim"></div></div>`
          : primary
            ? `<div class="backdrop-blur-media">${renderMediaEl(primary, 'blur-bg-item')}<div class="hero-scrim strong"></div></div>`
            : `<div class="procedural-bg"></div>`
      }
      <div class="scene-content-grid">
        <div class="scene-copy-col">
          <div class="scene-top-pills">
            <span class="pill-index">${String(idx + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}</span>
            <span class="pill-badge">${esc(scene.tag || scene.emotion || '重点呈现')}</span>
          </div>
          <h1 class="kinetic-title">${esc(scene.title)}</h1>
          ${scene.subtitleLine || scene.visualPrompt ? `<p class="scene-lead">${esc(scene.subtitleLine || scene.visualPrompt)}</p>` : ''}
          ${
            tags.length > 0
              ? `<div class="highlight-chips">${tags
                  .slice(0, 4)
                  .map((t, ti) => `<span class="hl-chip" data-chip-idx="${ti}">✦ ${esc(t)}</span>`)
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
          primary && layout !== 'hero-media'
            ? `<div class="scene-media-col">
                 <div class="media-card primary-card">${renderMediaEl(primary, 'card-media-item')}</div>
                 ${secondary ? `<div class="media-card secondary-card">${renderMediaEl(secondary, 'card-media-item')}</div>` : ''}
               </div>`
            : secondary
              ? `<div class="scene-media-col">
                   <div class="media-card primary-card">${renderMediaEl(secondary, 'card-media-item')}</div>
                 </div>`
              : ''
        }
      </div>
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
      background: radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 55%),
                  radial-gradient(circle at 80% 78%, color-mix(in srgb, var(--accent2) 18%, transparent), transparent 55%),
                  var(--bg);
    }
    #hud-grid-bg {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 64px 64px;
      pointer-events: none;
      z-index: 1;
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
      background: radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.58) 100%);
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
    .hero-media-wrap, .backdrop-blur-media, .procedural-bg {
      position: absolute;
      inset: -4%;
      overflow: hidden;
      z-index: 0;
    }
    .procedural-bg {
      background: radial-gradient(circle at 32% 35%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 52%),
                  radial-gradient(circle at 72% 68%, color-mix(in srgb, var(--accent2) 22%, transparent), transparent 52%);
    }
    .media-el {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      will-change: transform;
    }
    .blur-bg-item {
      filter: blur(26px) saturate(1.25) brightness(0.45);
      transform: scale(1.16);
    }
    .hero-scrim {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(4,8,18,0.88) 0%, rgba(4,8,18,0.56) 55%, rgba(4,8,18,0.42) 100%),
                  linear-gradient(180deg, rgba(4,8,18,0.38) 0%, transparent 28%, rgba(4,8,18,0.82) 100%);
    }
    .hero-scrim.strong {
      background: linear-gradient(135deg, rgba(6,11,24,0.82), rgba(6,11,24,0.68));
    }
    .scene-content-grid {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      padding: 6% 6.5% 13%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4%;
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
      flex: 1.1;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
    }
    .scene-top-pills {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-mono);
    }
    .pill-index {
      font-size: 13px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.2);
      color: var(--fg);
    }
    .pill-badge {
      font-size: 13px;
      font-weight: 700;
      padding: 5px 14px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 22%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
      color: var(--accent);
    }
    .kinetic-title {
      font-size: clamp(34px, 4.3vw, 68px);
      font-weight: 800;
      line-height: 1.15;
      color: var(--fg);
      text-shadow: 0 8px 32px rgba(0,0,0,0.6);
      letter-spacing: -0.01em;
    }
    .scene-lead {
      font-size: clamp(16px, 1.75vw, 25px);
      line-height: 1.55;
      color: var(--fg-sub);
      max-width: 680px;
      text-shadow: 0 2px 12px rgba(0,0,0,0.55);
    }
    .highlight-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }
    .hl-chip {
      padding: 7px 15px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid color-mix(in srgb, var(--accent) 42%, transparent);
      font-size: clamp(13px, 1.25vw, 17px);
      font-weight: 600;
      color: var(--fg);
      backdrop-filter: blur(8px);
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
      border-radius: 14px;
      background: rgba(9, 14, 28, 0.82);
      border: 1px solid color-mix(in srgb, var(--accent) 38%, rgba(255,255,255,0.16));
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stat-val {
      font-family: var(--font-mono);
      font-size: clamp(22px, 2.4vw, 34px);
      font-weight: 800;
      color: var(--accent);
    }
    .stat-label {
      font-size: 13px;
      color: var(--fg-sub);
    }
    .scene-media-col {
      flex: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      gap: 16px;
    }
    .media-card {
      width: 100%;
      max-height: 76%;
      aspect-ratio: 16 / 10;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,0.22));
      box-shadow: 0 28px 70px rgba(0,0,0,0.62), 0 0 40px color-mix(in srgb, var(--accent) 22%, transparent);
      background: #050811;
    }
    .secondary-card {
      position: absolute;
      width: 46%;
      right: -18px;
      bottom: 6%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.75);
      border-color: var(--accent2);
    }
    #brand-hud {
      position: absolute;
      top: 22px;
      left: 36px;
      right: 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 6;
      pointer-events: none;
    }
    .hud-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(9, 13, 24, 0.72);
      border: 1px solid rgba(255,255,255,0.14);
      font-size: 13px;
      font-weight: 700;
      color: var(--fg);
      backdrop-filter: blur(8px);
    }
    .hud-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .hud-time {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--fg-sub);
      background: rgba(9, 13, 24, 0.72);
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
    }
    #subtitle-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 34px;
      display: flex;
      justify-content: center;
      padding: 0 6%;
      z-index: 7;
      pointer-events: none;
    }
    #subtitle-pill {
      padding: 10px 28px;
      border-radius: 14px;
      background: rgba(6, 10, 20, 0.84);
      border: 1px solid color-mix(in srgb, var(--accent) 36%, rgba(255,255,255,0.15));
      border-left: 4px solid var(--accent);
      font-size: clamp(18px, 2.2vw, 32px);
      font-weight: 600;
      line-height: 1.4;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0,0,0,0.85);
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      max-width: 1480px;
      text-align: center;
    }
    #global-progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 5px;
      background: rgba(255,255,255,0.08);
      z-index: 8;
    }
    #global-progress-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
    }
  </style>
</head>
<body>
  <div id="stage-root">
    <div id="hud-grid-bg"></div>
    <div id="stage-layers"></div>
    <canvas id="vfx-canvas"></canvas>
    <div id="vignette-layer"></div>
    <div id="brand-hud">
      <div class="hud-brand"><span class="hud-dot"></span><span id="hud-title">${esc(script?.title || 'DSH Video')}</span></div>
      <div class="hud-time" id="hud-counter">00:00.00</div>
    </div>
    <div id="subtitle-overlay">
      <div id="subtitle-pill"></div>
    </div>
    <div id="global-progress"><div id="global-progress-fill"></div></div>
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
      const hudCounter = document.getElementById('hud-counter');
      const subPill = document.getElementById('subtitle-pill');
      const progressFill = document.getElementById('global-progress-fill');

      // Mount every template once so <video> & <img> stay cached across frames
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

      const particles = Array.from({ length: 42 }, function(_, i) {
        const seed = (i * 9301 + 49297) % 233280;
        return {
          x0: (seed % 1000) / 1000,
          y0: ((seed * 7) % 1000) / 1000,
          r: 1.4 + (i % 4) * 1.1,
          vx: ((i % 2 === 0 ? 1 : -1) * (0.0004 + (i % 5) * 0.00025)),
          vy: -(0.0005 + (i % 6) * 0.0003),
          alpha: 0.14 + (i % 5) * 0.07,
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

        // Moving subtle diagonal light leak
        const sweep = ((frame % 180) / 180) * 1.6 - 0.3;
        const gx = w * sweep;
        const grad = vfxCtx.createLinearGradient(gx - 220, 0, gx + 220, h);
        grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
        grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.055)');
        grad.addColorStop(1, 'rgba(129, 140, 248, 0)');
        vfxCtx.fillStyle = grad;
        vfxCtx.fillRect(0, 0, w, h);

        // Deterministic floating bokeh particles
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const x = (((p.x0 + frame * p.vx) % 1) + 1) % 1 * w;
          const y = (((p.y0 + frame * p.vy) % 1) + 1) % 1 * h;
          const pulse = 0.65 + 0.35 * Math.sin(frame * 0.08 + i);
          vfxCtx.beginPath();
          vfxCtx.arc(x, y, p.r, 0, Math.PI * 2);
          vfxCtx.fillStyle = 'rgba(186, 230, 253, ' + (p.alpha * pulse).toFixed(3) + ')';
          vfxCtx.fill();
        }
      }

      function applyKenBurns(el, motion, progress) {
        if (!el) return;
        const p = Math.max(0, Math.min(1, progress));
        if (motion === 'zoom-out') {
          const sc = (1.14 - 0.14 * p).toFixed(4);
          el.style.transform = 'scale(' + sc + ')';
        } else if (motion === 'pan-left') {
          const tx = (3.5 - 7.0 * p).toFixed(2);
          el.style.transform = 'scale(1.1) translateX(' + tx + '%)';
        } else if (motion === 'pan-right') {
          const tx = (-3.5 + 7.0 * p).toFixed(2);
          el.style.transform = 'scale(1.1) translateX(' + tx + '%)';
        } else {
          const sc = (1.0 + 0.12 * p).toFixed(4);
          el.style.transform = 'scale(' + sc + ')';
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
            const ty = ((1 - easeOutCubic(transProgress)) * 14).toFixed(2);
            el.style.transform = 'translateY(' + ty + '%)';
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          } else if (transType === 'zoom-cut') {
            const sc = (1.08 - 0.08 * easeOutCubic(transProgress)).toFixed(4);
            el.style.transform = 'scale(' + sc + ')';
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          } else {
            el.style.opacity = String(easeOutCubic(transProgress).toFixed(3));
          }
        } else if (isOutgoing) {
          el.style.opacity = String((1 - easeOutCubic(transProgress) * 0.6).toFixed(3));
        }

        // Kinetic typography & staggered chips
        const titleEl = el.querySelector('.kinetic-title');
        if (titleEl) {
          const tp = easeOutCubic(localFrame / 18);
          titleEl.style.opacity = String(tp.toFixed(3));
          titleEl.style.transform = 'translateY(' + ((1 - tp) * 28).toFixed(1) + 'px)';
        }
        const leadEl = el.querySelector('.scene-lead');
        if (leadEl) {
          const lp = easeOutCubic((localFrame - 5) / 18);
          leadEl.style.opacity = String(lp.toFixed(3));
          leadEl.style.transform = 'translateY(' + ((1 - lp) * 20).toFixed(1) + 'px)';
        }
        el.querySelectorAll('.hl-chip').forEach(function(chip, ci) {
          const cp = easeOutCubic((localFrame - (9 + ci * 4)) / 14);
          chip.style.opacity = String(cp.toFixed(3));
          chip.style.transform = 'translateY(' + ((1 - cp) * 14).toFixed(1) + 'px) scale(' + (0.92 + 0.08 * cp).toFixed(3) + ')';
        });
        el.querySelectorAll('.stat-card').forEach(function(card, si) {
          const sp = easeOutCubic((localFrame - (10 + si * 5)) / 16);
          card.style.opacity = String(sp.toFixed(3));
          card.style.transform = 'translateY(' + ((1 - sp) * 16).toFixed(1) + 'px)';
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

        // Media card entrance & Ken Burns camera motion
        const mediaCard = el.querySelector('.primary-card');
        if (mediaCard) {
          const mp = easeOutCubic((localFrame - 4) / 18);
          mediaCard.style.opacity = String(mp.toFixed(3));
          mediaCard.style.transform = 'translateY(' + ((1 - mp) * 22).toFixed(1) + 'px) scale(' + (0.96 + 0.04 * mp).toFixed(3) + ')';
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
                const t = setTimeout(resLoad, 1800);
                const ok = function() { clearTimeout(t); resLoad(); };
                v.addEventListener('loadeddata', ok, { once: true });
                v.addEventListener('error', ok, { once: true });
                try { if (v.readyState === 0) v.load(); } catch {}
              });
          return ensureLoaded.then(function() {
            const dur = Number(v.duration);
            let targetTime = startOff + localFrame / fps;
            if (Number.isFinite(dur) && dur > 0.2) targetTime = targetTime % dur;
            if (v.readyState >= 2 && Math.abs(v.currentTime - targetTime) < 0.03) return;
            return new Promise(function(resolveSeek) {
              let done = false;
              const finish = function() {
                if (done) return;
                done = true;
                v.removeEventListener('seeked', finish);
                resolveSeek();
              };
              const timer = setTimeout(finish, 450);
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

        // Subtitle lookup
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
        if (hudCounter) {
          const sec = (f / fps).toFixed(2);
          hudCounter.textContent = 'SCENE ' + String(hit.entry.idx + 1).padStart(2, '0') + ' · ' + sec + 's · F' + f;
        }
        if (progressFill) {
          progressFill.style.width = ((f / Math.max(1, totalFrames - 1)) * 100).toFixed(2) + '%';
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
