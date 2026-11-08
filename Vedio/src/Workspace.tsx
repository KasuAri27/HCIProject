import React from 'react';
import {Img,staticFile,useCurrentFrame} from 'remotion';
import {Backdrop,Badge,Heading,Pointer} from './Shared';
import {C,ease,linear} from './motion';

const shots={
  overview:{title:'一张工作台，接住整个学习过程。',detail:'按课程找到资料，让原文、笔记与对话同时在场。',images:['overview','overview'],change:180,focus:[350,300],zoom:1.10},
  reading:{title:'长篇讲义，也能带着方向读。',detail:'先梳理重点，再回到原文，逐段理解。',images:['reading-scroll','outline-question','outline-answer'],change:85,focus:[1760,360],zoom:1.26},
  explain:{title:'难懂的概念，换一种方式讲。',detail:'直观例子 + 原文来源，逐步弄懂含义。',images:['explain-question','explain-answer'],change:72,focus:[1760,345],zoom:1.65},
  selection:{title:'疑问就在这一段？直接划选。',detail:'解释、举例、补前置，让问题带着上下文。',images:['selection','selection-question','selection-answer'],change:95,focus:[1760,310],zoom:1.46},
  notes:{title:'留下答案，也留下自己的理解。',detail:'手动记入笔记，补充思考，再保存。',images:['note-captured','note-personal'],change:110,focus:[1320,350],zoom:1.52},
} as const;

export const Workspace:React.FC<{kind:keyof typeof shots}>=({kind})=>{
  const f=useCurrentFrame();const shot=shots[kind];
  const index=Math.min(Math.floor(f/shot.change),shot.images.length-1);
  const zoom=ease(f,kind==='overview'?15:shot.change,shot.change+60,1,shot.zoom);
  const image=shot.images[index];
  const previous=shot.images[Math.max(0,index-1)];
  const dissolve=1-linear(f%shot.change,0,9);
  // Screenshots are actual original-page pixels; camera motion never rebuilds
  // their layout in React. All demonstration data is explicitly labelled.
  return <><Backdrop light/><Heading title={shot.title} detail={shot.detail} light/><Badge>原页面渲染 · 示例内容</Badge>
    <div style={{position:'absolute',left:80,top:158,width:1760,height:840,borderRadius:12,overflow:'hidden',border:'1px solid #CDDDD3',boxShadow:'0 20px 55px #173F3524',background:'white',transform:`perspective(2400px) rotateX(${ease(f,0,27,3.5,0)}deg)`}}>
      <div style={{position:'absolute',width:1760,height:840,transform:`scale(${zoom})`,transformOrigin:`${shot.focus[0]}px ${shot.focus[1]}px`}}>
        <Img src={staticFile(`ui/${image}.png`)} style={{position:'absolute',width:1760,height:840}}/>
        {index>0&&dissolve>0&&<Img src={staticFile(`ui/${previous}.png`)} style={{position:'absolute',width:1760,height:840,opacity:dissolve}}/>}
        {kind==='overview'&&<div style={{position:'absolute',left:10,top:250,width:265,height:270,border:'2px solid #0F6E7C',borderRadius:8,opacity:linear(f,70,95)*linear(f,230,260,1,0),boxShadow:'0 0 0 5000px #0C303410'}}/>}
        {kind==='explain'&&<div style={{position:'absolute',left:1468,top:100,width:279,height:470,border:'2px solid #0F6E7C',borderRadius:9,opacity:linear(f,115,135),pointerEvents:'none'}}/>}
        {kind==='notes'&&<div style={{position:'absolute',left:1170,top:158,width:282,height:490,border:'2px solid #0F6E7C',borderRadius:8,opacity:linear(f,145,165),pointerEvents:'none'}}/>}
        <Pointer x={kind==='overview'?ease(f,45,100,650,150):kind==='notes'?ease(f,0,120,1720,1320):kind==='selection'?ease(f,0,60,530,1115):ease(f,0,60,1200,1670)} y={kind==='overview'?ease(f,45,100,210,440):kind==='notes'?ease(f,0,120,495,285):kind==='selection'?560:620} click={linear(f,65,88)}/>
      </div>
    </div>
  </>;
};
