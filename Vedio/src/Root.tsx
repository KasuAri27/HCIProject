import React from 'react';
import {AbsoluteFill,Composition,Html5Audio,Sequence,staticFile} from 'remotion';
import {CinematicOpening} from './CinematicOpening';
import {Workspace} from './Workspace';
import {Knowledge} from './Knowledge';
import {Tools} from './Tools';
import {Finale} from './Finale';
import {FadeIn,Grain,Subtitles} from './Shared';
import {font,C} from './motion';

// Scenes overlap by OVERLAP frames: the next one fades in on top while the
// previous one keeps playing underneath. This gives a true cross-dissolve; the
// earlier fade-out/fade-in pairs dipped to a dark frame between light scenes.
const OVERLAP=20;
const Film:React.FC=()=> <AbsoluteFill style={{fontFamily:font,background:C.deep,color:C.white,overflow:'hidden'}}>
  <Html5Audio src={staticFile('audio/soundtrack.wav')}/>
  <Sequence from={0} durationInFrames={960+OVERLAP}><CinematicOpening/></Sequence>
  <Sequence from={960} durationInFrames={1650+OVERLAP}><FadeIn frames={14}><Workspace/></FadeIn></Sequence>
  <Sequence from={2610} durationInFrames={510+OVERLAP}><FadeIn frames={OVERLAP}><Knowledge/></FadeIn></Sequence>
  <Sequence from={3120} durationInFrames={330+OVERLAP}><FadeIn frames={OVERLAP}><Tools/></FadeIn></Sequence>
  <Sequence from={3450} durationInFrames={150}><FadeIn frames={OVERLAP}><Finale/></FadeIn></Sequence>
  <Subtitles/>
  <Grain/>
</AbsoluteFill>;

export const Root:React.FC=()=> <Composition id="StudyFilm" component={Film} width={1920} height={1080} fps={30} durationInFrames={3600}/>;
