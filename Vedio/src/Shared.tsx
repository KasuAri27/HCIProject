import React from 'react';
import {useCurrentFrame} from 'remotion';
import cues from '../data/narration.json';
import {C, linear, font} from './motion';

export const Backdrop: React.FC<{light?: boolean}> = ({light=false}) => <div style={{position:'absolute',inset:0,background:light?'#EDF2EF':'radial-gradient(ellipse at 76% 43%, #23564F 0%, #123B3C 37%, #092B30 78%)'}} />;

export const Badge: React.FC<React.PropsWithChildren<{concept?: boolean}>> = ({children,concept}) => <div style={{position:'absolute',right:82,top:66,color:concept?'#D6BA82':'#6F8780',fontSize:20,border:`1px solid ${concept?'#D6BA8255':'#8AA69A55'}`,borderRadius:7,padding:'8px 14px'}}>{children}</div>;

export const Heading: React.FC<{title: string; detail?: string; light?: boolean}> = ({title,detail,light=false}) => <div style={{position:'absolute',left:82,top:46,color:light?C.ink:C.white}}><div style={{fontSize:51,fontWeight:700,letterSpacing:-1}}>{title}</div>{detail&&<div style={{fontSize:21,color:light?'#627E72':C.muted,marginTop:10}}>{detail}</div>}</div>;

export const Pointer: React.FC<{x:number;y:number;click?:number}> = ({x,y,click=0}) => <div style={{position:'absolute',left:x,top:y,pointerEvents:'none'}}><div style={{position:'absolute',left:-26,top:-26,width:52,height:52,border:'2px solid #23A18C',borderRadius:'50%',transform:`scale(${0.5+click*1.3})`,opacity:1-click}}/><svg width="32" height="39" viewBox="0 0 29 35" style={{filter:'drop-shadow(0 2px 4px #0005)'}}><path d="M2 2 3 28 10 21 17 32 23 28 16 18 26 16Z" fill="#102F34" stroke="white" strokeWidth="2" /></svg></div>;

// Subtitle clauses follow the narration cues and stay below the product viewport.
export const Subtitles: React.FC = () => {
  const seconds=useCurrentFrame()/30;
  const cue=cues.find(c=>seconds>=c.start&&seconds<c.end);
  if(!cue)return null;
  const clauses=cue.text.match(/[^。！？；]+[。！？；]?/g)||[cue.text];
  const total=clauses.reduce((n,c)=>n+c.length,0);
  const progress=(seconds-cue.start)/(cue.end-cue.start)*total;
  let passed=0;let selected=clauses[clauses.length-1];
  for(const clause of clauses){passed+=clause.length;if(progress<passed){selected=clause;break;}}
  return <div style={{position:'absolute',bottom:27,left:120,right:120,textAlign:'center',fontFamily:font,pointerEvents:'none'}}><span style={{display:'inline-block',fontSize:27,lineHeight:1.5,color:'#FFF',background:'#08282DEB',borderRadius:7,padding:'7px 23px',boxShadow:'0 2px 8px #0002'}}>{selected}</span></div>;
};

export const Cut: React.FC<React.PropsWithChildren<{duration:number}>> = ({children,duration}) => {
  const f=useCurrentFrame();
  const opacity=linear(f,0,8)*linear(f,duration-7,duration,1,0);
  return <div style={{position:'absolute',inset:0,opacity}}>{children}</div>;
};
