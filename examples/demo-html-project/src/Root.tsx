import React from 'react';
import { Composition } from 'remotion';
import scriptData from '../script.json';
import { VideoComposition } from './VideoComposition';

export const RemotionRoot: React.FC = () => {
  const sData: any = scriptData;
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition}
      durationInFrames={Math.max(30, Number(sData.totalDurationInFrames) || 300)}
      fps={Number(sData.fps) || 30}
      width={Number(sData.width) || 1920}
      height={Number(sData.height) || 1080}
    />
  );
};
