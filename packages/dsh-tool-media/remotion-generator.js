/**
 * Remotion 4.x TSX Video Project Generator
 * Strictly frame-driven (`useCurrentFrame`, `interpolate`, `spring`) with ZERO CSS transition/@keyframes.
 * Renders user-imported images (`<Img>`) & videos (`<OffthreadVideo>`), Ken Burns motion,
 * floating particles, kinetic typography, highlight metrics, and synced subtitles.
 */
import { copyFileSync, existsSync, linkSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { resolvePalette } from './html-generator.js'

function syncFileToPublic(absSrc, absDest) {
  if (!existsSync(absSrc)) return
  mkdirSync(dirname(absDest), { recursive: true })
  try {
    if (existsSync(absDest)) return
    linkSync(absSrc, absDest)
  } catch {
    copyFileSync(absSrc, absDest)
  }
}

export function syncRemotionPublicAssets(projectDir, script) {
  const absDir = resolve(projectDir)
  const pubDir = join(absDir, 'public')
  mkdirSync(pubDir, { recursive: true })

  for (const scene of script?.scenes || []) {
    const mediaList = Array.isArray(scene.media)
      ? scene.media
      : scene.mediaPath
        ? [{ path: scene.mediaPath }]
        : []
    for (const m of mediaList) {
      if (!m?.path) continue
      const src = isAbsolute(m.path) ? m.path : resolve(absDir, m.path)
      const rel = m.path.replace(/^\/+/, '').replace(/\\/g, '/')
      syncFileToPublic(src, join(pubDir, rel))
    }
  }
  const masterWav = join(absDir, 'output', 'master-audio.wav')
  if (existsSync(masterWav)) {
    const dest = join(pubDir, 'master-audio.wav')
    try {
      copyFileSync(masterWav, dest)
    } catch {}
  }
  return pubDir
}

export function writeRemotionProjectFiles(projectDir, script) {
  const absDir = resolve(projectDir)
  const srcDir = join(absDir, 'src')
  mkdirSync(srcDir, { recursive: true })
  syncRemotionPublicAssets(absDir, script)

  const theme = resolvePalette(script)
  const hasMasterAudio = existsSync(join(absDir, 'public', 'master-audio.wav'))

  writeFileSync(
    join(srcDir, 'index.ts'),
    `import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
`,
    'utf8',
  )

  writeFileSync(
    join(srcDir, 'Root.tsx'),
    `import React from 'react';
import { Composition } from 'remotion';
import scriptData from '../script.json';
import { VideoComposition } from './VideoComposition';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={Math.max(30, Number(scriptData.totalDurationInFrames) || 300)}
      fps={Number(scriptData.fps) || 30}
      width={Number(scriptData.width) || 1920}
      height={Number(scriptData.height) || 1080}
    />
  );
};
`,
    'utf8',
  )

  writeFileSync(
    join(srcDir, 'VideoComposition.tsx'),
    `import React from 'react';
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

const PALETTE = ${JSON.stringify(theme)};
const SANS = 'Microsoft YaHei, PingFang SC, sans-serif';
const MONO = 'Consolas, monospace';
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

const PARTICLES = Array.from({ length: 28 }, (_, i) => {
  const seed = (i * 9301 + 49297) % 233280;
  return {
    x0: (seed % 1000) / 1000,
    y0: ((seed * 7) % 1000) / 1000,
    size: 4 + (i % 4) * 3,
    vx: (i % 2 === 0 ? 1 : -1) * (0.0005 + (i % 4) * 0.0002),
    vy: -(0.0006 + (i % 5) * 0.00025),
    alpha: 0.16 + (i % 4) * 0.07,
  };
});

const MediaElement: React.FC<{
  media: any;
  progress: number;
  isBlur?: boolean;
}> = ({ media, progress, isBlur }) => {
  if (!media?.path) return null;
  const rel = String(media.path).replace(/^\\/+/, '').replace(/\\\\/g, '/');
  const motion = media.motion || 'zoom-in';
  let transform = 'scale(1)';
  if (!isBlur) {
    if (motion === 'zoom-out') {
      transform = \`scale(\${interpolate(progress, [0, 1], [1.14, 1.0])})\`;
    } else if (motion === 'pan-left') {
      transform = \`scale(1.1) translateX(\${interpolate(progress, [0, 1], [3.5, -3.5])}%)\`;
    } else if (motion === 'pan-right') {
      transform = \`scale(1.1) translateX(\${interpolate(progress, [0, 1], [-3.5, 3.5])}%)\`;
    } else {
      transform = \`scale(\${interpolate(progress, [0, 1], [1.0, 1.12])})\`;
    }
  } else {
    transform = 'scale(1.18)';
  }
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform,
    filter: isBlur ? 'blur(26px) brightness(0.45) saturate(1.2)' : undefined,
  };
  if (media.type === 'video') {
    return <OffthreadVideo src={staticFile(rel)} style={style} muted />;
  }
  return <Img src={staticFile(rel)} style={style} />;
};

const SceneStage: React.FC<{ scene: any; idx: number; total: number }> = ({ scene, idx, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = Math.max(30, Number(scene.durationInFrames) || 90);
  const progress = Math.min(1, Math.max(0, frame / dur));

  const enterOpacity = idx === 0 ? 1 : interpolate(frame, [0, 10], [0.35, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const exitOpacity = idx < total - 1 ? interpolate(frame, [dur - 8, dur], [1, 0.35], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const sceneOpacity = Math.min(enterOpacity, exitOpacity);

  const titlePop = spring({ frame, fps, config: { damping: 16, mass: 0.85, stiffness: 115 } });
  const leadOpacity = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const mediaList: any[] = Array.isArray(scene.media)
    ? scene.media
    : scene.mediaPath
      ? [{ path: scene.mediaPath, type: scene.mediaType || 'image', motion: scene.kenBurns || 'zoom-in' }]
      : [];
  const primary = mediaList[0] || null;
  const secondary = mediaList[1] || null;
  const layout = scene.layout || (primary ? (idx % 2 === 1 ? 'split-showcase' : 'hero-media') : 'kinetic-title');

  const sec = frame / fps;
  const subs: any[] = Array.isArray(scene.subtitles) ? scene.subtitles : [];
  const activeSub = subs.find((s) => sec >= s.startSec && sec <= s.endSec) || subs[subs.length - 1];
  const subText = activeSub?.text || scene.narration || '';

  return (
    <AbsoluteFill style={{ opacity: sceneOpacity, backgroundColor: PALETTE.background, overflow: 'hidden' }}>
      {primary && layout === 'hero-media' ? (
        <AbsoluteFill style={{ transform: 'scale(1.04)' }}>
          <MediaElement media={primary} progress={progress} />
          <AbsoluteFill
            style={{
              background:
                'linear-gradient(90deg, rgba(4,8,18,0.88) 0%, rgba(4,8,18,0.52) 55%, rgba(4,8,18,0.38) 100%), linear-gradient(180deg, rgba(4,8,18,0.35) 0%, transparent 30%, rgba(4,8,18,0.85) 100%)',
            }}
          />
        </AbsoluteFill>
      ) : primary ? (
        <AbsoluteFill>
          <MediaElement media={primary} progress={progress} isBlur />
          <AbsoluteFill style={{ background: 'linear-gradient(135deg, rgba(6,11,24,0.82), rgba(6,11,24,0.68))' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background: \`radial-gradient(circle at 28% 32%, \${PALETTE.accent}33, transparent 52%), radial-gradient(circle at 75% 70%, \${PALETTE.accent2}30, transparent 52%), \${PALETTE.background}\`,
          }}
        />
      )}

      {/* Content Grid */}
      <AbsoluteFill
        style={{
          padding: '6% 6.5% 12%',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: layout === 'kinetic-title' ? 'center' : 'space-between',
          gap: 48,
        }}
      >
        <div
          style={{
            flex: 1.1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: layout === 'kinetic-title' ? 'center' : 'flex-start',
            textAlign: layout === 'kinetic-title' ? 'center' : 'left',
            gap: 22,
          }}
        >
          <div style={{ display: 'flex', gap: 12, fontFamily: MONO }}>
            <span style={{ padding: '6px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.2)', color: PALETTE.textPrimary, fontSize: 16, fontWeight: 700 }}>
              {String(idx + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
            <span style={{ padding: '6px 16px', borderRadius: 999, background: \`\${PALETTE.accent}28\`, border: \`1px solid \${PALETTE.accent}\`, color: PALETTE.accent, fontSize: 16, fontWeight: 700 }}>
              {scene.tag || scene.emotion || '重点呈现'}
            </span>
          </div>

          <div
            style={{
              fontFamily: SANS,
              fontSize: 64,
              fontWeight: 800,
              lineHeight: 1.18,
              color: PALETTE.textPrimary,
              transform: \`translateY(\${(1 - titlePop) * 32}px)\`,
              opacity: titlePop,
              textShadow: '0 8px 28px rgba(0,0,0,0.65)',
            }}
          >
            {scene.title}
          </div>

          {scene.subtitleLine || scene.visualPrompt ? (
            <div style={{ fontFamily: SANS, fontSize: 26, lineHeight: 1.5, color: PALETTE.textSecondary, opacity: leadOpacity, maxWidth: 780 }}>
              {scene.subtitleLine || scene.visualPrompt}
            </div>
          ) : null}

          {Array.isArray(scene.highlights) && scene.highlights.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: layout === 'kinetic-title' ? 'center' : 'flex-start' }}>
              {scene.highlights.slice(0, 4).map((tag: string, ti: number) => {
                const chipPop = spring({ frame: frame - (8 + ti * 4), fps, config: { damping: 15, mass: 0.7 } });
                return (
                  <span
                    key={ti}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 12,
                      background: 'rgba(15,23,42,0.8)',
                      border: \`1px solid \${PALETTE.accent}66\`,
                      color: PALETTE.textPrimary,
                      fontFamily: SANS,
                      fontSize: 20,
                      fontWeight: 600,
                      opacity: chipPop,
                      transform: \`translateY(\${(1 - chipPop) * 16}px)\`,
                    }}
                  >
                    ✦ {tag}
                  </span>
                );
              })}
            </div>
          ) : null}

          {Array.isArray(scene.metrics) && scene.metrics.length > 0 ? (
            <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>
              {scene.metrics.slice(0, 3).map((mt: any, mi: number) => {
                const mp = interpolate(frame, [10 + mi * 4, 38 + mi * 4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
                const rawNum = Number(mt.value);
                const valTxt = Number.isFinite(rawNum) ? Math.round(rawNum * mp) : mt.value;
                return (
                  <div key={mi} style={{ padding: '14px 22px', borderRadius: 16, background: 'rgba(9,14,28,0.82)', border: \`1px solid \${PALETTE.accent}55\` }}>
                    <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, color: PALETTE.accent }}>
                      {valTxt}{mt.suffix || ''}
                    </div>
                    <div style={{ fontFamily: SANS, fontSize: 16, color: PALETTE.textSecondary }}>{mt.label}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {primary && layout !== 'hero-media' ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div
              style={{
                width: '100%',
                aspectRatio: '16 / 10',
                borderRadius: 20,
                overflow: 'hidden',
                border: \`1px solid \${PALETTE.accent}77\`,
                boxShadow: '0 28px 70px rgba(0,0,0,0.62)',
                transform: \`translateY(\${(1 - titlePop) * 24}px) scale(\${0.96 + 0.04 * titlePop})\`,
              }}
            >
              <MediaElement media={primary} progress={progress} />
            </div>
            {secondary ? (
              <div
                style={{
                  position: 'absolute',
                  right: -20,
                  bottom: -20,
                  width: '45%',
                  aspectRatio: '16 / 10',
                  borderRadius: 16,
                  overflow: 'hidden',
                  border: \`2px solid \${PALETTE.accent2}\`,
                  boxShadow: '0 20px 50px rgba(0,0,0,0.75)',
                }}
              >
                <MediaElement media={secondary} progress={progress} />
              </div>
            ) : null}
          </div>
        ) : null}
      </AbsoluteFill>

      {/* Bottom Synchronized Subtitle */}
      {subText ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 38, pointerEvents: 'none' }}>
          <div
            style={{
              padding: '12px 32px',
              borderRadius: 14,
              background: 'rgba(6,10,20,0.85)',
              border: \`1px solid \${PALETTE.accent}55\`,
              borderLeft: \`4px solid \${PALETTE.accent}\`,
              fontFamily: SANS,
              fontSize: 34,
              fontWeight: 600,
              color: '#FFFFFF',
              maxWidth: 1560,
              textAlign: 'center',
              textShadow: '0 2px 8px rgba(0,0,0,0.85)',
            }}
          >
            {subText}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const VideoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const scenes: any[] = Array.isArray(scriptData.scenes) ? scriptData.scenes : [];
  const pct = (frame / Math.max(1, durationInFrames - 1)) * 100;

  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.background }}>
      {scenes.map((scene, idx) => (
        <Sequence
          key={scene.id || idx}
          from={Number(scene.startFrame) || 0}
          durationInFrames={Math.max(30, Number(scene.durationInFrames) || 90)}
        >
          <SceneStage scene={scene} idx={idx} total={scenes.length} />
        </Sequence>
      ))}

      {/* Deterministic Ambient Bokeh Particles */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {PARTICLES.map((p, i) => {
          const x = ((((p.x0 + frame * p.vx) % 1) + 1) % 1) * width;
          const y = ((((p.y0 + frame * p.vy) % 1) + 1) % 1) * height;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: p.size,
                height: p.size,
                borderRadius: p.size,
                backgroundColor: PALETTE.accent,
                opacity: p.alpha,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Top Brand HUD & Bottom Progress Bar */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 38,
            padding: '7px 16px',
            borderRadius: 999,
            background: 'rgba(9,13,24,0.72)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: PALETTE.textPrimary,
            fontFamily: SANS,
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          ● {scriptData.title}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ width: \`\${pct}%\`, height: '100%', background: \`linear-gradient(90deg, \${PALETTE.accent}, \${PALETTE.accent2})\` }} />
        </div>
      </AbsoluteFill>

      ${hasMasterAudio ? `<Audio src={staticFile('master-audio.wav')} />` : ''}
    </AbsoluteFill>
  );
};
`,
    'utf8',
  )
}
