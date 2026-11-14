import React from 'react';
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
