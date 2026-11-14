import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import scriptData from '../script.json';

const PALETTE: any = {"background":"#070B16","surface":"#111A30","textPrimary":"#F8FAFC","textSecondary":"#CBD5E1","accent":"#38BDF8","accent2":"#7DB2FF","gold":"#F5B92E","rgbAccent":"125,178,255","rgbGold":"245,185,46","titleGrad":"linear-gradient(180deg,#FFFFFF 0%,#E2E8F0 52%,#94A3B8 100%)","accentGrad":"linear-gradient(180deg,#CFE1FF 0%,#4F95FF 55%,#1F5FE0 100%)"};
const SANS = 'Microsoft YaHei, PingFang SC, sans-serif';
const MONO = 'Consolas, monospace';
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

const PARTICLES = Array.from({ length: 34 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  return {
    x0: (seed % 1000) / 1000,
    y0: ((seed * 7) % 1000) / 1000,
    size: 2.5 + (i % 4) * 2.2,
    vx: (i % 2 === 0 ? 1 : -1) * (0.0004 + (i % 5) * 0.00018),
    vy: -(0.0005 + (i % 4) * 0.00022),
    alpha: 0.14 + (i % 5) * 0.06,
  };
});

const OPENER_SLOTS = [
  { x: -720, y: -340, z: -260, rx: 14, ry: 22, rz: -8, scale: 0.85 },
  { x: 690, y: -330, z: -240, rx: 14, ry: -20, rz: 7, scale: 0.85 },
  { x: -760, y: 240, z: -220, rx: -12, ry: 18, rz: 5, scale: 0.88 },
  { x: 740, y: 250, z: -210, rx: -12, ry: -18, rz: -6, scale: 0.88 },
  { x: -450, y: -360, z: -420, rx: 10, ry: 12, rz: -4, scale: 0.76 },
  { x: 460, y: -350, z: -410, rx: 10, ry: -12, rz: 4, scale: 0.76 },
  { x: -490, y: 310, z: -380, rx: -10, ry: 14, rz: 3, scale: 0.78 },
  { x: 480, y: 310, z: -370, rx: -10, ry: -14, rz: -3, scale: 0.78 },
  { x: -830, y: -30, z: -150, rx: 4, ry: 26, rz: -5, scale: 0.92 },
  { x: 830, y: -20, z: -150, rx: 4, ry: -26, rz: 5, scale: 0.92 },
  { x: -210, y: -380, z: -560, rx: 16, ry: 6, rz: -2, scale: 0.68 },
  { x: 220, y: -380, z: -560, rx: 16, ry: -6, rz: 2, scale: 0.68 },
];

const BLOCK_WIPE_CELLS = Array.from({ length: 24 }, (_, i) => ({
  row: Math.floor(i / 6),
  col: i % 6,
  delay: ((i * 5) % 9) * 0.8,
}));

const RADIAL_RAYS = Array.from({ length: 28 }, (_, i) => ({
  angle: (i / 28) * Math.PI * 2,
  len: 440 + (i % 3) * 190,
  width: i % 2 === 0 ? 3.5 : 1.8,
}));

function hashNum(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function formatBalancedTitle(rawTitle: string, maxChars = 11): string[] {
  const txt = String(rawTitle || '').trim();
  if (!txt) return [''];
  if (txt.includes('\n')) return txt.split('\n').map((s) => s.trim()).filter(Boolean);
  if (txt.length <= maxChars) return [txt];
  const colonIdx = txt.search(/[：:]/);
  if (colonIdx > 2 && colonIdx < txt.length - 3) {
    return [txt.slice(0, colonIdx + 1).trim(), txt.slice(colonIdx + 1).trim()];
  }
  const mid = Math.ceil(txt.length / 2);
  return [txt.slice(0, mid).trim(), txt.slice(mid).trim()];
}

function getBeatPulse(tSec: number, beats: number[]): number {
  if (!Array.isArray(beats) || beats.length === 0) return 0;
  let best = 0;
  for (let i = 0; i < beats.length; i++) {
    const dt = tSec - beats[i];
    if (dt >= 0 && dt < 0.32) {
      const p = Math.exp(-dt * 11);
      if (p > best) best = p;
    }
  }
  return best;
}

const MediaTile: React.FC<{
  media: any;
  progress: number;
  isBlur?: boolean;
  scaleBoost?: number;
}> = ({ media, progress, isBlur, scaleBoost = 1 }) => {
  if (!media?.path) return null;
  const rel = String(media.path).replace(/^\/+/, '').replace(/\\/g, '/');
  const motion = media.motion || 'zoom-in';
  let transform = `scale(${scaleBoost})`;
  if (!isBlur) {
    if (motion === 'zoom-out') {
      transform = `scale(${interpolate(progress, [0, 1], [1.14, 1.0]) * scaleBoost})`;
    } else if (motion === 'pan-left') {
      transform = `scale(${1.1 * scaleBoost}) translateX(${interpolate(progress, [0, 1], [3.5, -3.5])}%)`;
    } else if (motion === 'pan-right') {
      transform = `scale(${1.1 * scaleBoost}) translateX(${interpolate(progress, [0, 1], [-3.5, 3.5])}%)`;
    } else {
      transform = `scale(${interpolate(progress, [0, 1], [1.0, 1.12]) * scaleBoost})`;
    }
  } else {
    transform = 'scale(1.18)';
  }
  const isVid = media.type === 'video' || /\.(mp4|mov|webm|mkv)$/i.test(rel);
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform,
    filter: isBlur ? 'blur(26px) brightness(0.32) saturate(1.25)' : undefined,
  };
  if (isVid) {
    return <OffthreadVideo src={staticFile(rel)} style={style} muted />;
  }
  return <Img src={staticFile(rel)} style={style} />;
};

const KineticHeadline: React.FC<{
  lines: string[];
  localFrame: number;
  fps: number;
  fontSize: number;
  align?: 'center' | 'left';
  rgbSplit?: number;
}> = ({ lines, localFrame, fps, fontSize, align = 'center', rgbSplit = 0 }) => {
  let charGlobalIdx = 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'left' ? 'flex-start' : 'center', gap: 6 }}>
      {lines.map((line, li) => {
        const chars = [...line];
        return (
          <div
            key={li}
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              justifyContent: align === 'left' ? 'flex-start' : 'center',
              position: 'relative',
            }}
          >
            {chars.map((ch, ci) => {
              const idx = charGlobalIdx++;
              const sp = spring({
                frame: Math.max(0, localFrame - 2 - idx * 1.1),
                fps,
                config: { damping: 14, stiffness: 210, mass: 0.72 },
              });
              const y = interpolate(sp, [0, 1], [42, 0]);
              const sc = interpolate(sp, [0, 1], [1.22, 1]);
              const op = interpolate(sp, [0, 0.35, 1], [0, 1, 1], { extrapolateRight: 'clamp' });
              const shadowSplit =
                rgbSplit > 0.2
                  ? `${rgbSplit}px 0 rgba(255,40,90,0.68), -${rgbSplit}px 0 rgba(0,225,255,0.68), 0 12px 34px rgba(0,0,0,0.72)`
                  : '0 12px 34px rgba(0,0,0,0.68)';
              return (
                <span
                  key={ci}
                  style={{
                    display: 'inline-block',
                    fontFamily: SANS,
                    fontSize,
                    fontWeight: 900,
                    lineHeight: 1.16,
                    color: PALETTE.textPrimary,
                    opacity: op,
                    transform: `translateY(${y}px) scale(${sc})`,
                    textShadow: shadowSplit,
                    letterSpacing: -0.5,
                  }}
                >
                  {ch === ' ' ? '\u00A0' : ch}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

const HighlightsRow: React.FC<{
  highlights: string[];
  localFrame: number;
  fps: number;
  align?: 'center' | 'left';
}> = ({ highlights, localFrame, fps, align = 'center' }) => {
  if (!highlights.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        gap: 12,
        marginTop: 22,
      }}
    >
      {highlights.map((kw, ki) => {
        const sp = spring({
          frame: Math.max(0, localFrame - 12 - ki * 3.5),
          fps,
          config: { damping: 15, stiffness: 185 },
        });
        return (
          <div
            key={ki}
            style={{
              padding: '9px 20px',
              borderRadius: 999,
              background: 'rgba(15, 23, 42, 0.84)',
              border: `1.5px solid ${PALETTE.accent}99`,
              boxShadow: `0 8px 26px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.16)`,
              color: '#F8FAFC',
              fontFamily: SANS,
              fontSize: 20,
              fontWeight: 700,
              opacity: interpolate(sp, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(sp, [0, 1], [18, 0])}px) scale(${interpolate(sp, [0, 1], [0.9, 1])})`,
            }}
          >
            ◆ {kw}
          </div>
        );
      })}
    </div>
  );
};

const SceneTransitionOverlay: React.FC<{
  txKind: string;
  localFrame: number;
  dur: number;
}> = ({ txKind, localFrame, dur }) => {
  if (localFrame > 18 && localFrame < dur - 8) return null;

  const enterT = interpolate(localFrame, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const exitFlash = localFrame >= dur - 6 ? interpolate(localFrame, [dur - 6, dur], [0, 0.45]) : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 25 }}>
      {txKind === 'iris-circle' && localFrame < 16 ? (
        <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
          <circle
            cx="960"
            cy="540"
            r={interpolate(enterT, [0, 1], [60, 1360])}
            fill="none"
            stroke={PALETTE.accent}
            strokeWidth={interpolate(enterT, [0, 1], [28, 2])}
            opacity={interpolate(enterT, [0, 0.7, 1], [0.92, 0.65, 0])}
          />
          <circle
            cx="960"
            cy="540"
            r={interpolate(enterT, [0, 1], [10, 1180])}
            fill="none"
            stroke={PALETTE.gold || PALETTE.accent2}
            strokeWidth={interpolate(enterT, [0, 1], [14, 1])}
            opacity={interpolate(enterT, [0, 0.6, 1], [0.85, 0.45, 0])}
          />
        </svg>
      ) : null}

      {txKind === 'block-wipe' && localFrame < 14 ? (
        <AbsoluteFill>
          {BLOCK_WIPE_CELLS.map((cell, bi) => {
            const p = interpolate(localFrame - cell.delay, [0, 9], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            if (p <= 0.01) return null;
            return (
              <div
                key={bi}
                style={{
                  position: 'absolute',
                  left: cell.col * 320,
                  top: cell.row * 270,
                  width: 322,
                  height: 272,
                  background: bi % 3 === 0 ? PALETTE.accent : PALETTE.background,
                  opacity: p * 0.85,
                  transform: `scale(${p})`,
                }}
              />
            );
          })}
        </AbsoluteFill>
      ) : null}

      {txKind === 'glitch-cut' && localFrame < 10 ? (
        <AbsoluteFill style={{ opacity: interpolate(localFrame, [0, 10], [0.85, 0]) }}>
          <div style={{ position: 'absolute', top: '26%', left: 0, right: 0, height: 42, background: `linear-gradient(90deg, rgba(255,40,90,0.45), transparent, rgba(0,235,255,0.45))` }} />
          <div style={{ position: 'absolute', top: '64%', left: 0, right: 0, height: 24, background: `rgba(${PALETTE.rgbAccent || '80,180,255'},0.45)` }} />
        </AbsoluteFill>
      ) : null}

      {txKind === 'light-wipe' && localFrame < 16 ? (
        <div
          style={{
            position: 'absolute',
            top: -120,
            bottom: -120,
            width: 340,
            left: interpolate(enterT, [0, 1], [-420, 2120]),
            transform: 'skewX(-18deg)',
            background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.28), ${PALETTE.accent}66, transparent)`,
          }}
        />
      ) : null}

      {exitFlash > 0 ? (
        <AbsoluteFill style={{ background: `rgba(${PALETTE.rgbAccent || '120,180,255'}, ${exitFlash})` }} />
      ) : null}
    </AbsoluteFill>
  );
};

const SceneStage: React.FC<{
  scene: any;
  idx: number;
  total: number;
  beats: number[];
}> = ({ scene, idx, total, beats }) => {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(30, Number(scene.durationInFrames) || 90);
  const progress = Math.min(1, localFrame / Math.max(1, dur - 1));
  const absFrame = (Number(scene.startFrame) || 0) + localFrame;
  const absTimeSec = absFrame / Math.max(1, fps);
  const bp = getBeatPulse(absTimeSec, beats);

  const txKind = scene.transition || 'iris-circle';
  const layout = scene.layout || (idx === 0 ? '3d-stage-opener' : idx === total - 1 ? 'radial-climax' : 'media-split-motion');

  const mediaList: any[] = Array.isArray(scene.media)
    ? scene.media
    : scene.mediaPath
      ? [{ path: scene.mediaPath, type: scene.mediaType || 'image', motion: scene.kenBurns || 'zoom-in' }]
      : [];
  const poolList: any[] = Array.isArray(scene.poolMedia) && scene.poolMedia.length > 0 ? scene.poolMedia : mediaList;
  const primary = mediaList[0] || poolList[0] || null;
  const secondary = mediaList[1] || poolList[1] || null;

  const titleLines = formatBalancedTitle(scene.title || `第 ${idx + 1} 幕`, layout === 'media-split-motion' ? 9 : 11);
  const highlights: string[] = Array.isArray(scene.highlights) ? scene.highlights.filter(Boolean).slice(0, 3) : [];
  const sceneTag = String(scene.tag || `0${idx + 1}`);

  // Impact shake & punch camera
  const impactDecay = localFrame < 14 ? Math.exp(-localFrame * 0.28) : 0;
  const shakeX = (hashNum(absFrame * 1.3 + 7) - 0.5) * 18 * impactDecay;
  const shakeY = (hashNum(absFrame * 2.1 + 19) - 0.5) * 12 * impactDecay;
  const punchZoom = txKind === 'zoom-punch' && localFrame < 12 ? interpolate(localFrame, [0, 12], [1.14, 1], { easing: easeOut }) : 1;
  const beatZoom = 1 + bp * 0.015;
  const rgbSplit = (txKind === 'glitch-cut' && localFrame < 14 ? 7 * (1 - localFrame / 14) : 0) + impactDecay * 3.5;

  const enterFade = interpolate(localFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  const exitFade = interpolate(localFrame, [Math.max(0, dur - 8), dur], [1, 0], { extrapolateLeft: 'clamp' });
  const masterOpacity = Math.min(enterFade, exitFade);

  // Specular sweep position across stage
  const sweepX = interpolate(localFrame % Math.max(60, Math.floor(dur * 0.65)), [0, 55], [-400, 2200], {
    extrapolateRight: 'clamp',
  });

  // Counter ticker value for mosaic-pulse-wall
  const targetNum = Math.max(10, Number(scene.counterTarget) || 100);
  const counterProgress = interpolate(localFrame, [10, Math.min(dur - 12, 65)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const counterDisplay = Math.round(targetNum * counterProgress);

  return (
    <AbsoluteFill style={{ opacity: masterOpacity, overflow: 'hidden', backgroundColor: PALETTE.background }}>
      {/* World Camera Container */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) scale(${(punchZoom * beatZoom).toFixed(4)})`,
        }}
      >
        {/* Atmospheric Backdrop Media (Blur / Motion) */}
        {primary ? (
          <AbsoluteFill style={{ opacity: layout === '3d-stage-opener' || layout === 'mosaic-pulse-wall' ? 0.24 : 0.36 }}>
            <MediaTile media={primary} progress={progress} isBlur={layout !== 'kinetic-impact'} />
          </AbsoluteFill>
        ) : null}

        {/* Radial Color Wash */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 42%, rgba(${PALETTE.rgbAccent || '60,140,255'}, ${0.16 + bp * 0.08}), transparent 58%), radial-gradient(circle at 15% 82%, rgba(${PALETTE.rgbGold || '245,185,46'}, 0.1), transparent 46%)`,
          }}
        />

        {/* Ambient Floating Particles & Dot Grid */}
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: 0.22 }}>
            <defs>
              <pattern id={`grid-${idx}`} width="64" height="64" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.4" fill={PALETTE.accent2 || PALETTE.accent} />
              </pattern>
            </defs>
            <rect width="1920" height="1080" fill={`url(#grid-${idx})`} />
          </svg>
          {PARTICLES.map((p, pi) => {
            const px = ((((p.x0 + absFrame * p.vx) % 1) + 1) % 1) * 1920;
            const py = ((((p.y0 + absFrame * p.vy) % 1) + 1) % 1) * 1080;
            return (
              <div
                key={pi}
                style={{
                  position: 'absolute',
                  left: px,
                  top: py,
                  width: p.size,
                  height: p.size,
                  borderRadius: p.size,
                  background: pi % 4 === 0 ? PALETTE.gold || PALETTE.accent2 : PALETTE.accent,
                  opacity: p.alpha + bp * 0.12,
                }}
              />
            );
          })}
        </AbsoluteFill>

        {/* Entrance Shockwave Ring */}
        {localFrame < 26 ? (
          <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            <circle
              cx="960"
              cy="520"
              r={interpolate(localFrame, [0, 26], [30, 820], { easing: easeOut })}
              fill="none"
              stroke={PALETTE.accent}
              strokeWidth={interpolate(localFrame, [0, 26], [10, 1])}
              opacity={interpolate(localFrame, [0, 26], [0.75, 0])}
            />
          </svg>
        ) : null}

        {/* LAYOUT 1: 3d-stage-opener */}
        {layout === '3d-stage-opener' ? (
          <AbsoluteFill style={{ perspective: 1300 }}>
            {OPENER_SLOTS.map((slot, si) => {
              const cardSp = spring({
                frame: Math.max(0, localFrame - (si % 6) * 1.8),
                fps,
                config: { damping: 16, stiffness: 120 },
              });
              const m = poolList.length > 0 ? poolList[si % poolList.length] : null;
              const driftX = Math.sin(absFrame * 0.025 + si) * 18;
              const driftY = Math.cos(absFrame * 0.02 + si * 1.7) * 14;
              const pullT = interpolate(localFrame, [0, 22], [1.45, 1.0], { extrapolateRight: 'clamp', easing: easeOut });
              const x = 960 + slot.x * pullT + driftX - 135;
              const y = 540 + slot.y * pullT + driftY - 85;
              return (
                <div
                  key={si}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: 270,
                    height: 170,
                    borderRadius: 14,
                    overflow: 'hidden',
                    background: 'rgba(15, 22, 38, 0.88)',
                    border: `1.5px solid rgba(${PALETTE.rgbAccent || '125,178,255'}, 0.42)`,
                    boxShadow: '0 22px 48px rgba(0,0,0,0.6)',
                    opacity: interpolate(cardSp, [0, 1], [0, 0.78]),
                    transform: `translateZ(${slot.z + bp * 40}px) rotateX(${slot.rx}deg) rotateY(${slot.ry}deg) rotateZ(${slot.rz}deg) scale(${slot.scale * interpolate(cardSp, [0, 1], [0.65, 1])})`,
                  }}
                >
                  {m ? (
                    <MediaTile media={m} progress={progress} />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: SANS,
                        fontSize: 22,
                        fontWeight: 800,
                        color: PALETTE.accent2 || PALETTE.accent,
                      }}
                    >
                      {highlights[si % Math.max(1, highlights.length)] || sceneTag}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Opener Center Hero Title */}
            <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 140px 56px' }}>
              <div
                style={{
                  padding: '8px 22px',
                  borderRadius: 999,
                  background: `rgba(${PALETTE.rgbAccent || '60,140,255'}, 0.16)`,
                  border: `1px solid ${PALETTE.accent}`,
                  color: PALETTE.accent2 || PALETTE.accent,
                  fontFamily: SANS,
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: 3,
                  marginBottom: 20,
                }}
              >
                {sceneTag} · {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </div>
              <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={84} align="center" rgbSplit={rgbSplit} />
              <div
                style={{
                  width: interpolate(localFrame, [6, 22], [0, 460], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut }),
                  height: 5,
                  borderRadius: 99,
                  marginTop: 22,
                  background: `linear-gradient(90deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2})`,
                  boxShadow: `0 0 24px ${PALETTE.accent}`,
                }}
              />
              <HighlightsRow highlights={highlights} localFrame={localFrame} fps={fps} align="center" />
            </AbsoluteFill>
          </AbsoluteFill>
        ) : null}

        {/* LAYOUT 2: media-split-motion */}
        {layout === 'media-split-motion' ? (
          <AbsoluteFill
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '70px 104px 120px',
              gap: 64,
            }}
          >
            <div style={{ flex: '1 1 46%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div
                style={{
                  padding: '7px 18px',
                  borderRadius: 999,
                  background: `rgba(${PALETTE.rgbAccent || '60,140,255'}, 0.16)`,
                  border: `1px solid ${PALETTE.accent}`,
                  color: PALETTE.accent2 || PALETTE.accent,
                  fontFamily: MONO,
                  fontSize: 17,
                  fontWeight: 700,
                  marginBottom: 20,
                }}
              >
                {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {sceneTag}
              </div>
              <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={66} align="left" rgbSplit={rgbSplit} />
              <div
                style={{
                  width: interpolate(localFrame, [6, 22], [0, 260], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut }),
                  height: 5,
                  borderRadius: 99,
                  marginTop: 18,
                  background: `linear-gradient(90deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2})`,
                }}
              />
              <HighlightsRow highlights={highlights} localFrame={localFrame} fps={fps} align="left" />
            </div>

            <div style={{ flex: '1 1 54%', height: 690, position: 'relative', perspective: 1200 }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 24,
                  overflow: 'hidden',
                  border: `2px solid rgba(${PALETTE.rgbAccent || '125,178,255'}, 0.45)`,
                  boxShadow: `0 36px 90px rgba(0,0,0,0.72), 0 0 42px rgba(${PALETTE.rgbAccent || '60,140,255'}, 0.18)`,
                  transform: `rotateY(${interpolate(progress, [0, 1], [-8, -2])}deg) rotateX(${interpolate(progress, [0, 1], [3, -1])}deg) scale(${1 + bp * 0.012})`,
                  position: 'relative',
                  background: PALETTE.surface,
                }}
              >
                {primary ? (
                  <MediaTile media={primary} progress={progress} />
                ) : (
                  <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: SANS, fontSize: 40, fontWeight: 800, color: PALETTE.accent2 }}>
                    {sceneTag}
                  </AbsoluteFill>
                )}
                {/* Specular Sweep Light */}
                <div
                  style={{
                    position: 'absolute',
                    top: -60,
                    bottom: -60,
                    width: 220,
                    left: sweepX,
                    transform: 'skewX(-22deg)',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)',
                    pointerEvents: 'none',
                  }}
                />
              </div>

              {secondary ? (
                <div
                  style={{
                    position: 'absolute',
                    right: -28,
                    bottom: -24,
                    width: 290,
                    height: 175,
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: `2px solid ${PALETTE.gold || PALETTE.accent}`,
                    boxShadow: '0 20px 44px rgba(0,0,0,0.75)',
                    transform: `translateY(${interpolate(localFrame, [0, 18], [40, 0], { extrapolateRight: 'clamp', easing: easeOut })}px)`,
                  }}
                >
                  <MediaTile media={secondary} progress={progress} />
                </div>
              ) : null}
            </div>
          </AbsoluteFill>
        ) : null}

        {/* LAYOUT 3: kinetic-impact */}
        {layout === 'kinetic-impact' ? (
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 130px 60px' }}>
            {/* Framing Light Rails */}
            <div
              style={{
                position: 'absolute',
                top: 90,
                left: 110,
                right: 110,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${PALETTE.accent}, transparent)`,
                opacity: 0.55,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 155,
                left: 110,
                right: 110,
                height: 2,
                background: `linear-gradient(90deg, transparent, ${PALETTE.accent2 || PALETTE.accent}, transparent)`,
                opacity: 0.45,
              }}
            />
            <div
              style={{
                padding: '7px 20px',
                borderRadius: 999,
                background: `rgba(${PALETTE.rgbGold || '245,185,46'}, 0.16)`,
                border: `1px solid ${PALETTE.gold || PALETTE.accent2}`,
                color: PALETTE.gold || PALETTE.accent2,
                fontFamily: MONO,
                fontSize: 18,
                fontWeight: 700,
                marginBottom: 24,
              }}
            >
              CHAPTER {String(idx + 1).padStart(2, '0')} · {sceneTag}
            </div>
            <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={88} align="center" rgbSplit={rgbSplit} />
            <HighlightsRow highlights={highlights} localFrame={localFrame} fps={fps} align="center" />
          </AbsoluteFill>
        ) : null}

        {/* LAYOUT 4: mosaic-pulse-wall */}
        {layout === 'mosaic-pulse-wall' ? (
          <AbsoluteFill style={{ padding: '74px 96px 124px', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 36 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    color: PALETTE.accent2 || PALETTE.accent,
                    fontFamily: MONO,
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')} · {sceneTag}
                </div>
                <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={58} align="left" rgbSplit={rgbSplit} />
              </div>
              <div
                style={{
                  padding: '14px 28px',
                  borderRadius: 18,
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: `1.5px solid ${PALETTE.gold || PALETTE.accent}`,
                  boxShadow: `0 16px 40px rgba(0,0,0,0.5)`,
                  textAlign: 'right',
                }}
              >
                <div style={{ fontFamily: SANS, fontSize: 16, color: PALETTE.textSecondary, fontWeight: 700 }}>
                  {highlights[0] || sceneTag}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 54, fontWeight: 900, color: PALETTE.gold || PALETTE.accent, lineHeight: 1.1 }}>
                  {counterDisplay}%
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(2, 1fr)',
                gap: 20,
                height: 550,
                perspective: 1100,
              }}
            >
              {Array.from({ length: 6 }, (_, mi) => {
                const tileSp = spring({
                  frame: Math.max(0, localFrame - 3 - mi * 3),
                  fps,
                  config: { damping: 15, stiffness: 170 },
                });
                const m = poolList.length > 0 ? poolList[mi % poolList.length] : null;
                const activeBeatScale = mi % 2 === Math.floor(absTimeSec * 2) % 2 ? bp * 0.03 : 0;
                return (
                  <div
                    key={mi}
                    style={{
                      borderRadius: 18,
                      overflow: 'hidden',
                      position: 'relative',
                      background: PALETTE.surface,
                      border: `1.5px solid rgba(${PALETTE.rgbAccent || '125,178,255'}, ${0.35 + bp * 0.3})`,
                      boxShadow: '0 20px 44px rgba(0,0,0,0.58)',
                      opacity: interpolate(tileSp, [0, 1], [0, 1]),
                      transform: `scale(${interpolate(tileSp, [0, 1], [0.82, 1]) + activeBeatScale}) translateY(${interpolate(tileSp, [0, 1], [28, 0])}px)`,
                    }}
                  >
                    {m ? (
                      <MediaTile media={m} progress={progress} />
                    ) : (
                      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', fontFamily: SANS, fontSize: 28, fontWeight: 800, color: PALETTE.textPrimary }}>
                        {highlights[mi % Math.max(1, highlights.length)] || sceneTag}
                      </AbsoluteFill>
                    )}
                    <div
                      style={{
                        position: 'absolute',
                        left: 14,
                        bottom: 12,
                        padding: '4px 12px',
                        borderRadius: 999,
                        background: 'rgba(6,10,20,0.78)',
                        color: '#F8FAFC',
                        fontFamily: MONO,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      0{mi + 1} · {highlights[mi % Math.max(1, highlights.length)] || sceneTag}
                    </div>
                  </div>
                );
              })}
            </div>
          </AbsoluteFill>
        ) : null}

        {/* LAYOUT 5: compare-dual */}
        {layout === 'compare-dual' ? (
          <AbsoluteFill style={{ padding: '86px 104px 132px', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center' }}>
              <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={58} align="center" rgbSplit={rgbSplit} />
            </div>

            <div style={{ display: 'flex', alignItems: 'stretch', gap: 40, height: 530, position: 'relative' }}>
              {[
                { data: scene.compareLeft, fallbackLabel: highlights[0] || '智能策划', media: primary, side: -1 },
                { data: scene.compareRight, fallbackLabel: highlights[1] || '成片输出', media: secondary || primary, side: 1 },
              ].map((panel, pi) => {
                const sp = spring({
                  frame: Math.max(0, localFrame - 4 - pi * 4),
                  fps,
                  config: { damping: 16, stiffness: 155 },
                });
                const label = panel.data?.label || panel.fallbackLabel;
                const value = panel.data?.value || highlights[pi] || sceneTag;
                return (
                  <div
                    key={pi}
                    style={{
                      flex: 1,
                      borderRadius: 24,
                      overflow: 'hidden',
                      position: 'relative',
                      background: PALETTE.surface,
                      border: `2px solid ${pi === 1 ? PALETTE.accent : 'rgba(255,255,255,0.2)'}`,
                      boxShadow: '0 28px 64px rgba(0,0,0,0.65)',
                      opacity: interpolate(sp, [0, 1], [0, 1]),
                      transform: `translateX(${interpolate(sp, [0, 1], [panel.side * 90, 0])}px)`,
                    }}
                  >
                    {panel.media ? (
                      <AbsoluteFill style={{ opacity: 0.45 }}>
                        <MediaTile media={panel.media} progress={progress} />
                      </AbsoluteFill>
                    ) : null}
                    <AbsoluteFill
                      style={{
                        background: 'linear-gradient(180deg, rgba(8,12,24,0.35), rgba(8,12,24,0.9))',
                        padding: 42,
                        justifyContent: 'flex-end',
                      }}
                    >
                      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: pi === 1 ? PALETTE.gold || PALETTE.accent2 : PALETTE.accent, marginBottom: 10 }}>
                        {pi === 0 ? 'TRACK A' : 'TRACK B'} · {label}
                      </div>
                      <div style={{ fontFamily: SANS, fontSize: 40, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.25 }}>
                        {value}
                      </div>
                    </AbsoluteFill>
                  </div>
                );
              })}

              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) scale(${1 + bp * 0.08})`,
                  width: 78,
                  height: 78,
                  borderRadius: 999,
                  background: `linear-gradient(135deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: MONO,
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#060A14',
                  boxShadow: `0 0 34px ${PALETTE.accent}`,
                }}
              >
                VS
              </div>
            </div>
          </AbsoluteFill>
        ) : null}

        {/* LAYOUT 6: radial-climax */}
        {layout === 'radial-climax' ? (
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 130px 64px' }}>
            <svg
              width="1920"
              height="1080"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                opacity: 0.42 + bp * 0.25,
                transform: `rotate(${absFrame * 0.28}deg)`,
              }}
            >
              {RADIAL_RAYS.map((ray, ri) => {
                const rInner = 180 + bp * 30;
                const rOuter = rInner + ray.len;
                const x1 = 960 + Math.cos(ray.angle) * rInner;
                const y1 = 520 + Math.sin(ray.angle) * rInner;
                const x2 = 960 + Math.cos(ray.angle) * rOuter;
                const y2 = 520 + Math.sin(ray.angle) * rOuter;
                return (
                  <line
                    key={ri}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={ri % 3 === 0 ? PALETTE.gold || PALETTE.accent2 : PALETTE.accent}
                    strokeWidth={ray.width}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>

            <div
              style={{
                padding: '9px 24px',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2})`,
                color: '#050814',
                fontFamily: MONO,
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: 3,
                marginBottom: 24,
                transform: `scale(${interpolate(spring({ frame: Math.max(0, localFrame - 2), fps, config: { damping: 11, stiffness: 220 } }), [0, 1], [1.7, 1])})`,
              }}
            >
              FINALE · {sceneTag}
            </div>

            <KineticHeadline lines={titleLines} localFrame={localFrame} fps={fps} fontSize={86} align="center" rgbSplit={rgbSplit} />

            <div
              style={{
                width: interpolate(localFrame, [8, 26], [0, 560], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut }),
                height: 6,
                borderRadius: 99,
                marginTop: 26,
                background: `linear-gradient(90deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2}, ${PALETTE.accent})`,
                boxShadow: `0 0 30px ${PALETTE.accent}`,
              }}
            />

            <HighlightsRow highlights={highlights} localFrame={localFrame} fps={fps} align="center" />
          </AbsoluteFill>
        ) : null}

        {/* Minimal Broadcast Corner L-Brackets */}
        <AbsoluteFill style={{ pointerEvents: 'none', opacity: 0.42 }}>
          <div style={{ position: 'absolute', top: 34, left: 40, width: 22, height: 22, borderTop: `2px solid ${PALETTE.accent2 || PALETTE.accent}`, borderLeft: `2px solid ${PALETTE.accent2 || PALETTE.accent}` }} />
          <div style={{ position: 'absolute', top: 34, right: 40, width: 22, height: 22, borderTop: `2px solid ${PALETTE.accent2 || PALETTE.accent}`, borderRight: `2px solid ${PALETTE.accent2 || PALETTE.accent}` }} />
          <div style={{ position: 'absolute', bottom: 34, left: 40, width: 22, height: 22, borderBottom: `2px solid ${PALETTE.accent2 || PALETTE.accent}`, borderLeft: `2px solid ${PALETTE.accent2 || PALETTE.accent}` }} />
          <div style={{ position: 'absolute', bottom: 34, right: 40, width: 22, height: 22, borderBottom: `2px solid ${PALETTE.accent2 || PALETTE.accent}`, borderRight: `2px solid ${PALETTE.accent2 || PALETTE.accent}` }} />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Scene Cut Transition Layer */}
      <SceneTransitionOverlay txKind={txKind} localFrame={localFrame} dur={dur} />
    </AbsoluteFill>
  );
};

export const VideoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sData: any = scriptData;
  const scenes: any[] = Array.isArray(sData.scenes) ? sData.scenes : [];
  const subtitles: any[] = Array.isArray(sData.subtitles) ? sData.subtitles : [];
  const beats: number[] = Array.isArray(sData.bgm?.beats) ? sData.bgm.beats : [];
  const pct = (frame / Math.max(1, durationInFrames - 1)) * 100;

  const activeSub = subtitles.find((sub) => {
    const sf = Number(sub.startFrame ?? Math.round((sub.startSec || 0) * fps));
    const ef = Number(sub.endFrame ?? Math.round((sub.endSec || 0) * fps));
    return frame >= sf && frame <= ef;
  });

  const activeScene = scenes.find((sc) => {
    const sf = Number(sc.startFrame || 0);
    const ef = sf + Math.max(30, Number(sc.durationInFrames) || 90);
    return frame >= sf && frame < ef;
  });
  const subText = activeSub?.text || activeScene?.subtitleLine || '';

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.background }}>
      {scenes.map((scene, idx) => (
        <Sequence
          key={scene.id || idx}
          from={Number(scene.startFrame) || 0}
          durationInFrames={Math.max(30, Number(scene.durationInFrames) || 90)}
        >
          <SceneStage scene={scene} idx={idx} total={scenes.length} beats={beats} />
        </Sequence>
      ))}

      {/* Clean Single-Line Broadcast Subtitles */}
      {subText ? (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            paddingBottom: 46,
            pointerEvents: 'none',
            zIndex: 40,
          }}
        >
          <div
            style={{
              padding: '10px 30px',
              borderRadius: 12,
              background: 'rgba(5, 8, 18, 0.84)',
              border: `1px solid rgba(${PALETTE.rgbAccent || '125,178,255'}, 0.36)`,
              borderLeft: `4px solid ${PALETTE.accent}`,
              fontFamily: SANS,
              fontSize: 32,
              fontWeight: 700,
              color: '#FFFFFF',
              maxWidth: 1620,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textShadow: '0 2px 10px rgba(0,0,0,0.9)',
            }}
          >
            {subText}
          </div>
        </AbsoluteFill>
      ) : null}

      {/* Minimal Bottom Hairline Progress */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 4,
          background: 'rgba(255,255,255,0.06)',
          pointerEvents: 'none',
          zIndex: 50,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${PALETTE.accent}, ${PALETTE.gold || PALETTE.accent2})`,
          }}
        />
      </div>

      
    </AbsoluteFill>
  );
};
