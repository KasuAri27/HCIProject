import React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {Backdrop} from './Shared';
import {DocumentCloud} from './DocumentCloud';
import {C,ease,linear,mono} from './motion';

const windows=[['原文阅读',35,75],['AI 对话',370,220],['课程笔记',75,420],['函数绘图',435,470]] as const;

export const Opening:React.FC=()=>{
  const f=useCurrentFrame();
  return <><Backdrop/><DocumentCloud/>
    <div style={{position:'absolute',left:124,top:121,color:C.mint,fontSize:25}}>课程学习 / 课后自学 / 考前复习</div>
    <div style={{position:'absolute',left:119,top:310,fontSize:88,fontWeight:700,lineHeight:1.42,letterSpacing:-3}}>{['认真学习的人，','值得更顺畅的过程。'].map((s,i)=><div key={s} style={{overflow:'hidden'}}><div style={{transform:`translateY(${ease(f,i*9,28+i*9,120,0)}px)`}}>{s}</div></div>)}</div>
    <div style={{position:'absolute',left:126,top:666,fontSize:30,color:C.muted,opacity:linear(f,36,58)}}>写给每一位面对课件与复习的大学生。</div>
    <div style={{position:'absolute',left:128,bottom:168,width:ease(f,22,110,0,640),height:2,background:C.mint}}/>
  </>;
};

const painCopy=[
  ['课件格式太多。','打开，就要来回折腾。','PDF / PPTX / DOCX / Markdown'],
  ['学习工具太分散。','切换，让思路不断掉线。','阅读、提问、笔记与工具，各在一处。'],
  ['课件晦涩难懂。','概念，看了却没看懂。','一个公式，连着更多陌生的概念。'],
  ['文档太长。','读了很久，重点在哪？','翻过一页又一页，理解仍然没有落点。'],
  ['复习时间太紧。','还没系统梳理，就到眼前。','有限的时间，需要更清楚的学习方向。'],
];

export const Pain:React.FC<{kind:number}>=({kind})=>{
  const f=useCurrentFrame();const copy=painCopy[kind];
  return <><Backdrop/>{kind===0&&<DocumentCloud/>}
    <div style={{position:'absolute',left:126,top:117,fontSize:25,color:C.mint}}>你可能也遇到过 <span style={{marginLeft:30,opacity:0.55,fontSize:21}}>{kind+1} / 5</span></div>
    <div style={{position:'absolute',left:120,top:311,fontSize:73,lineHeight:1.5,fontWeight:700,letterSpacing:-2,opacity:linear(f,0,10),transform:`translateY(${ease(f,0,22,25,0)}px)`}}>{copy[0]}<br/>{copy[1]}</div>
    <div style={{position:'absolute',left:126,top:628,fontSize:25,color:C.muted}}>{copy[2]}</div>
    {kind===0&&<div style={{position:'absolute',left:1090,top:790,fontSize:23,color:C.mint,letterSpacing:5}}>PDF　PPTX　DOCX　MD</div>}
    {kind===1&&<div style={{position:'absolute',left:1020,top:110,width:780,height:760}}>
      <svg width="780" height="760" style={{position:'absolute'}}><path d="M150 170 560 310 180 520 600 580" stroke="#9BC6B1" fill="none" strokeWidth="2" strokeDasharray="8 9" strokeDashoffset={-f}/></svg>
      {windows.map(([title,x,y],i)=><div key={title} style={{position:'absolute',left:x+Math.sin(f/18+i)*9,top:y,width:305,height:205,background:i===Math.floor(f/23)%4?'#F5F7F4':'#C6D7CF',color:C.ink,borderRadius:10,boxShadow:'0 20px 70px #0004',transform:`rotate(${(i%2?1:-1)*5}deg)`,padding:24}}><div style={{fontSize:24,fontWeight:600,borderBottom:'1px solid #A0B8AC',paddingBottom:18}}>{title}</div>{[0,1,2].map(j=><div key={j} style={{height:7,width:180-j*25,background:'#A4BFB2',marginTop:19}}/>)}</div>)}
    </div>}
    {kind===2&&<div style={{position:'absolute',left:1050,top:230,width:700,height:630}}>
      <div style={{color:'#A8C5BE',fontSize:35,fontFamily:'Georgia,serif',transform:'rotate(-6deg)',marginBottom:66}}>f′(x) = lim [f(x+h)−f(x)] / h</div>
      {['极限','变化率','切线斜率'].map((s,i)=><div key={s} style={{position:'absolute',left:[40,310,160][i],top:[160,245,390][i],fontSize:45,color:i===Math.floor(f/30)%3?C.gold:C.white,transform:`translateY(${Math.sin(f/22+i)*7}px)`}}>{s}<span style={{color:C.gold,marginLeft:20}}>?</span></div>)}
      <svg width="670" height="500" style={{position:'absolute',top:80}}><path d="M160 145 370 230 260 380 160 145" fill="none" stroke="#A7E4D933" strokeWidth="2"/></svg>
    </div>}
    {kind===3&&<div style={{position:'absolute',left:1070,top:140,width:670,height:770,overflow:'hidden',borderRadius:10,boxShadow:'0 25px 65px #0004'}}><div style={{background:'#FAFCF8',color:C.ink,padding:'36px 45px',transform:`translateY(${-f*4}px)`}}>{Array.from({length:10},(_,i)=><div key={i} style={{marginBottom:45}}><div style={{fontSize:28,fontWeight:600,marginBottom:20}}>第 {i+1} 节　概念与推导</div>{[0,1,2,3].map(j=><div key={j} style={{height:8,width:`${100-j*8}%`,background:'#D5E0D8',marginTop:17}}/>)}</div>)}</div><div style={{position:'absolute',bottom:0,left:0,right:0,height:130,background:'linear-gradient(transparent,#092B30E8)'}}/></div>}
    {kind===4&&<div style={{position:'absolute',left:1050,top:180,width:700,height:650}}><svg width="370" height="370" viewBox="0 0 370 370" style={{position:'absolute',left:165,top:0}}><circle cx="185" cy="185" r="157" fill="none" stroke="#A7E4D943" strokeWidth="3"/>{Array.from({length:12},(_,i)=><line key={i} x1="185" y1="37" x2="185" y2="50" transform={`rotate(${i*30} 185 185)`} stroke={C.mint} strokeWidth="3"/>)}<line x1="185" y1="185" x2="185" y2="85" transform={`rotate(${f*4} 185 185)`} stroke={C.gold} strokeWidth="5" strokeLinecap="round"/><line x1="185" y1="185" x2="245" y2="185" transform={`rotate(${f*0.32} 185 185)`} stroke={C.white} strokeWidth="7" strokeLinecap="round"/><circle cx="185" cy="185" r="7" fill={C.white}/></svg><div style={{position:'absolute',top:425,left:20,right:20,display:'flex',flexWrap:'wrap',gap:18}}>{['课程作业','阅读课件','整理笔记','系统复习'].map((s,i)=><div key={s} style={{width:282,padding:'18px 20px',fontSize:24,border:'1px solid #AAC9B844',color:i===3?C.gold:C.muted,borderRadius:7}}><span style={{marginRight:17}}>□</span>{s}</div>)}</div></div>}
  </>;
};

export const Together:React.FC=()=>{
  const f=useCurrentFrame();
  return <><Backdrop/><div style={{opacity:linear(f,70,145,1,0)}}><DocumentCloud centered/></div>
    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',paddingBottom:60}}>
      <div style={{fontSize:76,fontWeight:700,lineHeight:1.55,textAlign:'center',textShadow:'0 5px 30px #092B30',opacity:linear(f,0,20)}}>资料、理解、工具。<br/>终于，在一起。</div>
      <div style={{fontSize:27,color:C.mint,marginTop:30,opacity:linear(f,60,85)}}>让学习，回到同一个空间。</div>
    </div>
    <div style={{position:'absolute',left:280,top:220,width:1360,opacity:linear(f,110,170),transform:`perspective(1800px) rotateX(${ease(f,110,180,18,0)}deg) scale(${ease(f,110,180,0.5,1)})`}}><Img src={staticFile('ui/overview.png')} style={{width:'100%',borderRadius:12,boxShadow:'0 40px 100px #0006'}}/></div>
  </>;
};

export const Closing:React.FC=()=>{
  const f=useCurrentFrame();
  return <><Backdrop/><DocumentCloud/>
    <div style={{position:'absolute',left:126,top:119,color:C.mint,fontSize:25}}>课程学习 / 深入理解 / 系统复习</div>
    <div style={{position:'absolute',left:117,top:337,fontSize:100,lineHeight:1.4,fontWeight:700,letterSpacing:-4}}>把读过的，<br/>变成自己的。</div>
    <div style={{position:'absolute',left:126,top:692,width:ease(f,0,80,0,680),height:3,background:C.mint}}/>
    <div style={{position:'absolute',left:126,top:752,fontSize:24,color:C.muted,opacity:linear(f,30,55)}}>阅读 · 提问 · 记录 · 连接 · 实践</div>
  </>;
};
