import React from 'react';
import { Composition, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import scriptData from '../script.json';

export const VideoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame % 90, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      flex: 1,
      backgroundColor: scriptData.theme.background,
      color: scriptData.theme.textPrimary,
      fontFamily: 'Microsoft YaHei, Consolas, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}>
      <h1>{scriptData.title} (Frame {frame} @ {fps}fps)</h1>
    </div>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={scriptData.totalDurationInFrames || 420}
      fps={scriptData.fps || 30}
      width={scriptData.width || 1920}
      height={scriptData.height || 1080}
    />
  );
};
