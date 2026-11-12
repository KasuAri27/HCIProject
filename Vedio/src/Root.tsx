import React from 'react';
import {AbsoluteFill,Composition,Html5Audio,Sequence,staticFile} from 'remotion';
import {Closing} from './Story';
import {CinematicOpening} from './CinematicOpening';
import {Workspace} from './Workspace';
import {Knowledge} from './Knowledge';
import {Tools} from './Tools';
import {Cut,Subtitles} from './Shared';
import {font,C} from './motion';

const Film:React.FC=()=> <AbsoluteFill style={{fontFamily:font,background:C.deep,color:C.white,overflow:'hidden'}}>
  <Html5Audio src={staticFile('audio/soundtrack.wav')}/>
  <Sequence from={0} durationInFrames={960}><CinematicOpening/></Sequence>
  <Sequence from={960} durationInFrames={360}><Cut duration={360}><Workspace kind="overview"/></Cut></Sequence>
  <Sequence from={1320} durationInFrames={300}><Cut duration={300}><Workspace kind="reading"/></Cut></Sequence>
  <Sequence from={1620} durationInFrames={360}><Cut duration={360}><Workspace kind="explain"/></Cut></Sequence>
  <Sequence from={1980} durationInFrames={330}><Cut duration={330}><Workspace kind="selection"/></Cut></Sequence>
  <Sequence from={2310} durationInFrames={300}><Cut duration={300}><Workspace kind="notes"/></Cut></Sequence>
  <Sequence from={2610} durationInFrames={510}><Cut duration={510}><Knowledge/></Cut></Sequence>
  <Sequence from={3120} durationInFrames={330}><Cut duration={330}><Tools/></Cut></Sequence>
  <Sequence from={3450} durationInFrames={150}><Closing/></Sequence>
  <Subtitles/>
</AbsoluteFill>;

export const Root:React.FC=()=> <Composition id="StudyFilm" component={Film} width={1920} height={1080} fps={30} durationInFrames={3600}/>;
