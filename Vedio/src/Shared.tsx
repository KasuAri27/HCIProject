import React from 'react';
import {staticFile,useCurrentFrame} from 'remotion';
import timing from '../data/subtitle-timing.json';
import {C, linear, font} from './motion';

export const Backdrop: React.FC<{light?: boolean}> = ({light=false}) => <div style={{position:'absolute',inset:0,background:light?'#EDF2EF':'radial-gradient(ellipse at 76% 43%, #23564F 0%, #123B3C 37%, #092B30 78%)'}} />;

export const Badge: React.FC<React.PropsWithChildren<{concept?: boolean}>> = ({children,concept}) => <div style={{position:'absolute',right:82,top:66,color:concept?'#D6BA82':'#6F8780',fontSize:20,border:`1px solid ${concept?'#D6BA8255':'#8AA69A55'}`,borderRadius:7,padding:'8px 14px'}}>{children}</div>;

export const Heading: React.FC<{title: string; detail?: string; light?: boolean}> = ({title,detail,light=false}) => <div style={{position:'absolute',left:82,top:46,color:light?C.ink:C.white}}><div style={{fontSize:51,fontWeight:700,letterSpacing:-1}}>{title}</div>{detail&&<div style={{fontSize:21,color:light?'#627E72':C.muted,marginTop:10}}>{detail}</div>}</div>;

export const Pointer: React.FC<{x:number;y:number;click?:number}> = ({x,y,click=0}) => <div style={{position:'absolute',left:x,top:y,pointerEvents:'none'}}><div style={{position:'absolute',left:-26,top:-26,width:52,height:52,border:'2px solid #23A18C',borderRadius:'50%',transform:`scale(${0.5+click*1.3})`,opacity:1-click}}/><svg width="32" height="39" viewBox="0 0 29 35" style={{filter:'drop-shadow(0 2px 4px #0005)'}}><path d="M2 2 3 28 10 21 17 32 23 28 16 18 26 16Z" fill="#102F34" stroke="white" strokeWidth="2" /></svg></div>;

// One clause at a time, shown exactly while it is spoken. The times come from
// scripts/align_subtitles.py, which measures the pauses in the voice files.
export const Subtitles: React.FC = () => {
  const seconds=useCurrentFrame()/30;
  // Hold each clause a little past its last syllable so it never flickers off mid-sentence.
  // The closing line (cue 15) is already the title on screen, so it gets no subtitle.
  const clause=timing.find(c=>c.cue!==15&&seconds>=c.start-0.12&&seconds<c.end+0.32);
  if(!clause)return null;
  const opacity=linear(seconds,clause.start-0.12,clause.start+0.05)*linear(seconds,clause.end+0.14,clause.end+0.32,1,0);
  return <div style={{position:'absolute',bottom:30,left:120,right:120,textAlign:'center',fontFamily:font,pointerEvents:'none',opacity}}><span style={{display:'inline-block',fontSize:28,lineHeight:1.5,color:'#FFF',background:'#081226E0',borderRadius:8,padding:'7px 26px',boxShadow:'0 4px 18px #0003'}}>{clause.text}</span></div>;
};

// Fixed fine grain over the whole frame. It dithers the dark gradients so they
// do not band after encoding. It deliberately does not move: grain that jumps
// every frame made the H.264 file ten times larger for no visible gain.
export const Grain: React.FC = () => <div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:`url(${staticFile('grain.png')})`}}/>;

// Incoming scene fades in over the outgoing one, which keeps playing underneath.
// Unlike a fade through the background colour, this never dips to dark.
export const FadeIn: React.FC<React.PropsWithChildren<{frames?:number}>> = ({children,frames=18}) => {
  const f=useCurrentFrame();
  return <div style={{position:'absolute',inset:0,opacity:linear(f,0,frames)}}>{children}</div>;
};

export const Cut: React.FC<React.PropsWithChildren<{duration:number}>> = ({children,duration}) => {
  const f=useCurrentFrame();
  const opacity=linear(f,0,8)*linear(f,duration-7,duration,1,0);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};
