import React from 'react';
import {Easing,interpolate,useCurrentFrame} from 'remotion';
import {Knowledge} from './Knowledge';
import {N,linear} from './motion';

// Closing five seconds (film frames 3450-3600). The knowledge sky returns fully
// lit behind the last line, then the picture fades to black with the music.
const LINE='把读过的，变成自己的。';

export const Finale:React.FC=()=>{
  const f=useCurrentFrame();
  const rule=interpolate(f,[40,96],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)});
  return <>
    <Knowledge finale/>
    {/* Keep the sky as atmosphere: darken the middle so the line stays readable. */}
    <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 50% 50%,${N.sky}C0 0%,${N.sky}80 38%,${N.sky}26 72%,${N.sky}90 100%)`}}/>
    <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',paddingBottom:40,color:'#F6EFE5'}}>
      <div style={{fontSize:23,letterSpacing:6,color:N.warm,opacity:linear(f,8,30)}}>课程学习　/　深入理解　/　系统复习</div>
      <div style={{fontSize:104,fontWeight:700,letterSpacing:4,marginTop:34,display:'flex',textShadow:`0 6px 40px ${N.sky}`}}>
        {[...LINE].map((ch,i)=>{
          // Characters rise one after another, timed to land with the spoken line.
          const t=interpolate(f,[14+i*3.2,34+i*3.2],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)});
          return <span key={i} style={{display:'inline-block',opacity:t,transform:`translateY(${(1-t)*38}px)`,filter:`blur(${(1-t)*8}px)`}}>{ch}</span>;
        })}
      </div>
      <div style={{width:rule*560,height:2,marginTop:44,background:`linear-gradient(to right,transparent,${N.gold},transparent)`}}/>
      <div style={{fontSize:25,letterSpacing:5,color:N.text,marginTop:34,opacity:linear(f,72,96)}}>阅读 · 提问 · 记录 · 连接 · 实践</div>
    </div>
    <div style={{position:'absolute',inset:0,background:'#000',opacity:linear(f,124,148)}}/>
  </>;
};
