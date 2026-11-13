import React from 'react';
import {Easing,Img,interpolate,staticFile,useCurrentFrame} from 'remotion';
import {C,linear} from './motion';

// One continuous 55-second shot of the real page (film frames 960-2610).
// The page stays on screen the whole time; the pane being narrated is lifted
// out as an enlarged card. Every pixel of UI still comes from the captured
// screenshots: the film only crops, scales and reveals them, it never rebuilds
// the layout. All coordinates below are in page pixels (1760x840 capture).

const PW=1760,PH=840;
type Rect={x:number;y:number;w:number;h:number};
const R=(x:number,y:number,w:number,h:number):Rect=>({x,y,w,h});
const inOut=Easing.inOut(Easing.cubic);
/** Piecewise keyframes with ease-in-out between neighbours and holds outside. */
const kf=(f:number,frames:number[],values:number[])=>interpolate(f,frames,values,{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:inOut});
const pulse=(f:number,from:number,to:number,fadeIn=8,fadeOut=10)=>linear(f,from,from+fadeIn)*linear(f,to-fadeOut,to,1,0);

// ---------------------------------------------------------------- page strips
// The four panes change independently, so each one keeps its own screenshot
// timeline. `kind` says how the next capture replaces the previous one.
type Change={at:number;img:string;dur?:number;kind?:'fade'|'right'|'down'|'rows'|'scroll';region?:Rect;rows?:Rect[];distance?:number};
const STRIPS:{clip:Rect;changes:Change[]}[]=[
  {clip:R(0,0,283,PH),changes:[{at:0,img:'overview'}]},
  {clip:R(283,0,881,PH),changes:[
    {at:0,img:'overview'},
    // Real scroll: both captures show the same document 509px apart.
    {at:548,img:'reading-scroll',dur:62,kind:'scroll',distance:509},
    {at:646,img:'overview',dur:40,kind:'scroll',distance:-509},
    // Drag-select: first line sweeps, then the short second line.
    {at:1098,img:'selection',dur:30,kind:'rows',rows:[R(340,540,758,31),R(340,571,146,31)]},
    {at:1328,img:'note-captured',dur:10,kind:'fade'},
  ]},
  {clip:R(1164,0,297,PH),changes:[
    {at:0,img:'overview'},
    {at:1406,img:'note-captured',dur:30,kind:'down',region:R(1164,104,297,596)},
    {at:1442,img:'note-personal',dur:58,kind:'down',region:R(1164,170,297,530)},
  ]},
  {clip:R(1461,0,299,PH),changes:[
    {at:0,img:'overview'},
    {at:428,img:'outline-question',dur:22,kind:'right',region:R(1474,764,204,36)},
    {at:470,img:'outline-answer',dur:56,kind:'down',region:R(1461,96,299,480)},
    {at:740,img:'explain-question',dur:22,kind:'right',region:R(1474,764,204,36)},
    {at:782,img:'explain-answer',dur:70,kind:'down',region:R(1461,96,299,480)},
    {at:1128,img:'selection',dur:12,kind:'fade'},
    {at:1232,img:'selection-question',dur:26,kind:'right',region:R(1480,300,262,40)},
    {at:1272,img:'selection-answer',dur:50,kind:'down',region:R(1461,408,299,432)},
    {at:1328,img:'note-captured',dur:8,kind:'fade'},
  ]},
];
const SCROLL_VIEW=R(283,200,881,640); // document area under the reader header

/** A rectangular piece of one capture, optionally shifted vertically inside its clip. */
const Piece:React.FC<{img:string;clip:Rect;dy?:number;opacity?:number;feather?:'bottom'|'right'}>=({img,clip,dy=0,opacity=1,feather})=>{
  if(clip.w<=0||clip.h<=0||opacity<=0)return null;
  // A soft leading edge makes a reveal read as text arriving, not a hard mask.
  const mask=feather==='bottom'?`linear-gradient(to bottom,#000 ${Math.max(0,clip.h-26)}px,transparent)`:feather==='right'?`linear-gradient(to right,#000 ${Math.max(0,clip.w-14)}px,transparent)`:undefined;
  return <div style={{position:'absolute',left:clip.x,top:clip.y,width:clip.w,height:clip.h,overflow:'hidden',opacity,WebkitMaskImage:mask,maskImage:mask}}>
    <Img src={staticFile(`ui/${img}.png`)} style={{position:'absolute',left:-clip.x,top:-clip.y+dy,width:PW,height:PH}}/>
  </div>;
};

const Strip:React.FC<{clip:Rect;changes:Change[];f:number}>=({clip,changes,f})=>{
  let index=0;
  for(let i=0;i<changes.length;i++)if(f>=changes[i].at)index=i;
  const now=changes[index],before=changes[Math.max(0,index-1)];
  const t=now.dur?Math.min(1,(f-now.at)/now.dur):1;
  if(index===0||t>=1)return <Piece img={now.img} clip={clip}/>;
  if(now.kind==='scroll'){
    const D=now.distance!,e=inOut(t),v=SCROLL_VIEW,offset=D*(1-e);
    // The new capture is only valid where it has real document rows; the old
    // one fills the rest. Their overlap shows identical content, so it is seamless.
    const valid=D>0?R(v.x,v.y+offset,v.w,v.h-offset):R(v.x,v.y,v.w,v.h+offset);
    return <><Piece img={before.img} clip={R(clip.x,0,clip.w,v.y)}/>
      <Piece img={before.img} clip={v} dy={-D*e}/>
      <Piece img={now.img} clip={valid} dy={offset}/></>;
  }
  const base=<Piece img={before.img} clip={clip}/>;
  if(now.kind==='fade')return <>{base}<Piece img={now.img} clip={clip} opacity={t}/></>;
  if(now.kind==='right'){
    // Typing: clear the field first so the old placeholder never shows beside the new text.
    const r=now.region!;
    return <>{base}<div style={{position:'absolute',left:r.x,top:r.y,width:r.w,height:r.h,background:'#fff'}}/><Piece img={now.img} clip={R(r.x,r.y,r.w*t,r.h)} feather="right"/></>;
  }
  if(now.kind==='rows'){
    // Share the duration between rows in proportion to their width.
    const total=now.rows!.reduce((n,r)=>n+r.w,0);let passed=0;
    return <>{base}{now.rows!.map((r,i)=>{const part=Math.min(1,Math.max(0,(t*total-passed)/r.w));passed+=r.w;return <Piece key={i} img={now.img} clip={R(r.x,r.y,r.w*part,r.h)}/>;})}</>;
  }
  // 'down': everything outside the region switches at once (e.g. the input
  // clears), the region itself is revealed from the top like a streamed answer.
  const r=now.region!;
  return <>{base}
    <Piece img={now.img} clip={R(clip.x,0,clip.w,r.y)}/>
    <Piece img={now.img} clip={R(clip.x,r.y+r.h,clip.w,PH-r.y-r.h)}/>
    <Piece img={now.img} clip={R(r.x,r.y,r.w,r.h*t)} feather="bottom"/>
  </>;
};
const Page:React.FC<{f:number}>=({f})=> <div style={{position:'absolute',left:0,top:0,width:PW,height:PH,background:'#fff'}}>
  {STRIPS.map((s,i)=><Strip key={i} clip={s.clip} changes={s.changes} f={f}/>)}
</div>;

// ------------------------------------------------------------------ camera
// A view is the window rectangle on screen plus a zoom and the page point at
// the window centre.
type View={win:Rect;z:number;cx:number;cy:number};
const FULL=R(120,176,1680,802),SIDE=R(60,262,1262,602.3),NOTE=R(60,318,952,454.4);
const VIEWS:Record<string,View>={
  full:{win:FULL,z:1,cx:880,cy:420},
  rail:{win:FULL,z:1.55,cx:560,cy:395},
  docZoom:{win:FULL,z:1.18,cx:770,cy:450},
  side:{win:SIDE,z:1,cx:880,cy:420},
  sideDoc:{win:SIDE,z:1.5,cx:730,cy:500},
  formula:{win:FULL,z:1.6,cx:722,cy:590},
  para:{win:FULL,z:1.5,cx:722,cy:560},
  noteSide:{win:NOTE,z:1,cx:880,cy:420},
};
const VIEW_KEYS:[number,string][]=[[0,'full'],[52,'full'],[88,'rail'],[140,'rail'],[178,'full'],[365,'full'],[405,'docZoom'],[418,'docZoom'],[450,'side'],
  [525,'side'],[555,'sideDoc'],[632,'sideDoc'],[668,'full'],[690,'full'],[722,'formula'],[735,'formula'],[768,'side'],
  [990,'side'],[1028,'para'],[1128,'para'],[1160,'side'],[1325,'side'],[1352,'noteSide'],[1560,'noteSide'],[1596,'full']];
const viewAt=(f:number):View=>{
  const frames=VIEW_KEYS.map(k=>k[0]);
  const pick=(get:(v:View)=>number)=>kf(f,frames,VIEW_KEYS.map(k=>get(VIEWS[k[1]])));
  const z=pick(v=>v.z);
  // Keep the page covering the window: the centre cannot leave this range.
  const clamp=(value:number,half:number,size:number)=>Math.min(size-half/z,Math.max(half/z,value));
  return {win:R(pick(v=>v.win.x),pick(v=>v.win.y),pick(v=>v.win.w),pick(v=>v.win.h)),z,
    cx:clamp(pick(v=>v.cx),PW/2,PW),cy:clamp(pick(v=>v.cy),PH/2,PH)};
};

// The enlarged card: a crop of the page that grows out of its place in the
// window (lift 0) to its own spot on the right (lift 1).
const AI_DEST=R(1352,176,500,802),NOTES_DEST=R(1028,176,824,802);
const cardAt=(f:number,view:View)=>{
  const notes=f>=1336;
  const lift=notes?kf(f,[1338,1366,1562,1590],[0,1,1,0]):kf(f,[418,448,636,664,735,765,990,1018,1135,1162,1308,1334],[0,1,1,0,0,1,1,0,0,1,1,0]);
  // The chat card starts on the input box, then pans up to follow the answer.
  const crop=notes?R(1164,96,596,580):R(1461,kf(f,[462,484,700,701,778,798,1100,1101],[360,56,56,360,360,56,56,56]),299,480);
  const dest=notes?NOTES_DEST:AI_DEST;
  const k=view.win.w/PW*view.z;
  const home=R(view.win.x+view.win.w/2+(crop.x-view.cx)*k,view.win.y+view.win.h/2+(crop.y-view.cy)*k,crop.w*k,crop.h*k);
  const mix=(a:number,b:number)=>a+(b-a)*lift;
  return {lift,crop,rect:R(mix(home.x,dest.x),mix(home.y,dest.y),mix(home.w,dest.w),mix(home.h,dest.h))};
};

// ---------------------------------------------------------------- annotations
type Space='p'|'k'; // page window or lifted card
type Mark={from:number;to:number;space:Space;rect:Rect;label?:string;tone?:'teal'|'gold'};
const MARKS:Mark[]=[
  {from:78,to:150,space:'p',rect:R(8,262,268,270)},
  {from:160,to:316,space:'p',rect:R(287,60,872,776),label:'原文'},
  {from:182,to:316,space:'p',rect:R(1168,60,289,776),label:'笔记'},
  {from:204,to:316,space:'p',rect:R(1465,60,291,776),label:'对话'},
  {from:598,to:646,space:'p',rect:R(336,336,330,36)},
  {from:608,to:646,space:'p',rect:R(336,487,360,36)},
  {from:618,to:646,space:'p',rect:R(336,638,360,36)},
  {from:700,to:752,space:'p',rect:R(586,608,274,68),tone:'gold'},
  {from:842,to:878,space:'k',rect:R(1470,495,160,24)},
  {from:846,to:880,space:'p',rect:R(334,402,776,112)},
  {from:878,to:985,space:'k',rect:R(1470,438,284,48)},
  {from:880,to:985,space:'p',rect:R(586,608,274,68),tone:'gold'},
  {from:1150,to:1308,space:'k',rect:R(1466,146,288,100)},
  {from:1178,to:1232,space:'k',rect:R(1476,258,46,29),tone:'gold'},
  {from:1196,to:1232,space:'k',rect:R(1528,258,46,29),tone:'gold'},
  {from:1213,to:1232,space:'k',rect:R(1581,258,60,29),tone:'gold'},
  {from:1500,to:1562,space:'k',rect:R(1170,115,72,24),tone:'gold'},
];
// Lines that tie the card back to the place in the document it talks about.
const LINKS:{from:number;to:number;a:[number,number];b:[number,number]}[]=[
  {from:846,to:880,a:[1470,507],b:[1110,458]},
  {from:880,to:985,a:[1470,462],b:[860,642]},
  {from:1150,to:1308,a:[1466,196],b:[1098,556]},
];
const POINTER:[number,Space,number,number][]=[[40,'p',720,330],[62,'p',720,330],[100,'p',150,316],[150,'p',150,316],[200,'p',900,520],[400,'p',900,520],
  [452,'k',1709,800],[500,'k',1709,800],[540,'k',1600,420],[700,'p',760,690],[732,'p',760,690],[770,'k',1709,800],[800,'k',1709,800],[836,'k',1640,330],
  [1000,'k',1640,330],[1040,'p',560,640],[1076,'p',342,558],[1098,'p',342,558],[1120,'p',1096,558],[1121,'p',342,588],[1128,'p',484,588],
  [1140,'p',484,588],[1170,'k',1700,330],[1226,'k',1700,330],[1262,'k',1505,386],[1290,'k',1505,386],[1306,'k',1690,470],
  [1366,'k',1640,300],[1392,'k',1496,539],[1420,'k',1496,539],[1470,'k',1330,420],[1650,'k',1330,420]];
const CLICKS=[108,456,774,1266,1396];

const CHAPTERS=[
  {from:0,title:'一张工作台，接住整个学习过程。',detail:'按课程找到资料，让原文、笔记与对话同时在场。'},
  {from:360,title:'长篇讲义，也能带着方向读。',detail:'先梳理重点，再回到原文，逐段理解。'},
  {from:660,title:'难懂的概念，换一种方式讲。',detail:'直观例子 + 原文来源，逐步弄懂含义。'},
  {from:1020,title:'疑问就在这一段？直接划选。',detail:'解释、举例、补前置，让问题带着上下文。'},
  {from:1350,title:'留下答案，也留下自己的理解。',detail:'手动记入笔记，补充思考，再保存。'},
];

export const Workspace:React.FC=()=>{
  const f=useCurrentFrame();
  const view=viewAt(f),card=cardAt(f,view);
  const k=view.win.w/PW*view.z;
  const toPage=(x:number,y:number):[number,number]=>[view.win.x+view.win.w/2+(x-view.cx)*k,view.win.y+view.win.h/2+(y-view.cy)*k];
  const cardScale=card.rect.w/card.crop.w;
  const toCard=(x:number,y:number):[number,number]=>[card.rect.x+(x-card.crop.x)*cardScale,card.rect.y+(y-card.crop.y)*cardScale];
  const at=(space:Space,x:number,y:number)=>space==='p'?toPage(x,y):toCard(x,y);
  const scaleOf=(space:Space)=>space==='p'?k:cardScale;

  // The pointer rides on whichever surface it targets, so it stays attached
  // while the window or the card is still moving.
  const frames=POINTER.map(p=>p[0]);
  const px=kf(f,frames,POINTER.map(p=>at(p[1],p[2],p[3])[0])),py=kf(f,frames,POINTER.map(p=>at(p[1],p[2],p[3])[1]));
  const chapter=CHAPTERS.reduce((n,c,i)=>f>=c.from?i:n,0);
  const enter=kf(f,[0,34],[0,1]);
  // The answer block that visibly travels from the chat into the notes.
  const ghost=kf(f,[1398,1424],[0,1]);

  return <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 30% 0%,#F7FAF8 0%,#EAF0EC 55%,#DFE8E3 100%)',color:C.ink}}>
    {CHAPTERS.map((c,i)=>{
      const next=CHAPTERS[i+1]?.from??9999;
      const show=linear(f,c.from+(i?8:4),c.from+(i?26:22))*linear(f,next-6,next+6,1,0);
      if(show<=0)return null;
      return <div key={i} style={{position:'absolute',left:120,top:44,opacity:show,transform:`translateY(${(1-linear(f,c.from+(i?8:4),c.from+(i?26:22)))*14}px)`}}>
        <div style={{display:'flex',alignItems:'baseline',gap:22}}>
          <span style={{fontSize:20,fontWeight:700,color:C.teal,letterSpacing:2}}>0{i+1}<span style={{color:'#9DB4AB',fontWeight:400}}> / 05</span></span>
          <span style={{fontSize:46,fontWeight:700}}>{c.title}</span>
        </div>
        <div style={{fontSize:21,color:'#5E7A70',marginTop:12,marginLeft:86}}>{c.detail}</div>
      </div>;
    })}
    <div style={{position:'absolute',right:120,top:66,color:'#6F8780',fontSize:18,border:'1px solid #8AA69A66',borderRadius:7,padding:'7px 14px',opacity:linear(f,10,30)}}>原页面渲染 · 示例内容</div>
    {/* progress ticks: which of the five steps is on screen */}
    <div style={{position:'absolute',right:120,top:126,display:'flex',gap:8}}>{CHAPTERS.map((c,i)=><div key={i} style={{width:i===chapter?44:18,height:4,borderRadius:2,background:i===chapter?C.teal:'#BCCEC6'}}/>)}</div>

    <div style={{position:'absolute',left:view.win.x,top:view.win.y+(1-enter)*46,width:view.win.w,height:view.win.h,borderRadius:14,overflow:'hidden',background:'#fff',
      boxShadow:'0 1px 0 #CADAD1,0 0 0 1px #CFDDD5,0 34px 80px -18px #173F3540,0 10px 24px -8px #173F3524',transform:`scale(${0.965+0.035*enter})`}}>
      <div style={{position:'absolute',left:0,top:0,width:PW,height:PH,transformOrigin:'0 0',transform:`translate(${view.win.w/2-view.cx*k}px,${view.win.h/2-view.cy*k}px) scale(${k})`}}><Page f={f}/></div>
      {/* While a card is lifted the page steps back so the card reads as the subject. */}
      <div style={{position:'absolute',inset:0,background:'#E9F0EC',opacity:card.lift*0.26}}/>
    </div>

    {card.lift>0.01&&<div style={{position:'absolute',left:card.rect.x,top:card.rect.y,width:card.rect.w,height:card.rect.h,borderRadius:6+10*card.lift,overflow:'hidden',background:'#fff',
      opacity:linear(card.lift,0.01,0.16),boxShadow:`0 0 0 ${1+card.lift}px ${C.teal}${card.lift>0.5?'':'99'},0 ${44*card.lift}px ${110*card.lift}px -20px #0F3A3A66,0 ${12*card.lift}px ${30*card.lift}px -10px #0F3A3A40`}}>
      <div style={{position:'absolute',left:0,top:0,width:PW,height:PH,transformOrigin:'0 0',transform:`translate(${-card.crop.x*cardScale}px,${-card.crop.y*cardScale}px) scale(${cardScale})`}}><Page f={f}/></div>
      {ghost>0&&ghost<1&&(()=>{
        // Copy of the answer (page rect) sliding from the chat column to the notes column.
        const src=R(1470,214,286,272),dx=-(297)*ghost,dy=130*ghost;
        return <div style={{position:'absolute',left:(src.x-card.crop.x+dx)*cardScale,top:(src.y-card.crop.y+dy)*cardScale,width:src.w*cardScale,height:src.h*cardScale,overflow:'hidden',borderRadius:8,
          opacity:Math.sin(ghost*Math.PI)*0.85,boxShadow:`0 0 0 2px ${C.teal},0 18px 40px #0F3A3A40`}}>
          <Img src={staticFile('ui/note-captured.png')} style={{position:'absolute',left:-src.x*cardScale,top:-src.y*cardScale,width:PW*cardScale,height:PH*cardScale}}/>
        </div>;
      })()}
    </div>}

    <svg width={1920} height={1080} style={{position:'absolute',inset:0,pointerEvents:'none'}}>
      {LINKS.map((l,i)=>{
        const show=pulse(f,l.from,l.to,6,12);if(show<=0||card.lift<0.9)return null;
        const [ax,ay]=toCard(...l.a),[bx,by]=toPage(...l.b),draw=kf(f,[l.from,l.from+22],[0,1]);
        const mid=(ax+bx)/2;
        return <g key={i} opacity={show}>
          <path d={`M${ax} ${ay} C${mid} ${ay} ${mid} ${by} ${bx} ${by}`} fill="none" stroke={C.teal} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1-draw}/>
          <circle cx={ax} cy={ay} r={5} fill={C.teal}/><circle cx={bx} cy={by} r={5*draw} fill={C.teal}/>
        </g>;
      })}
    </svg>

    {MARKS.map((m,i)=>{
      const show=pulse(f,m.from,m.to);if(show<=0)return null;
      if(m.space==='k'&&card.lift<0.5)return null;
      const [x,y]=at(m.space,m.rect.x,m.rect.y),s=scaleOf(m.space),grow=1+0.05*(1-linear(f,m.from,m.from+10));
      const color=m.tone==='gold'?'#D99A2B':C.teal;
      return <div key={i} style={{position:'absolute',left:x-4,top:y-4,width:m.rect.w*s+8,height:m.rect.h*s+8,opacity:show,transform:`scale(${grow})`,borderRadius:9,
        border:`2.5px solid ${color}`,boxShadow:`0 0 0 5px ${color}22`,background:m.label?`${C.teal}0A`:'transparent'}}>
        {m.label&&<div style={{position:'absolute',left:'50%',top:18,transform:'translateX(-50%)',background:C.teal,color:'#fff',fontSize:22,fontWeight:600,padding:'6px 20px',borderRadius:20,boxShadow:'0 6px 16px #0F6E7C55',whiteSpace:'nowrap'}}>{m.label}</div>}
      </div>;
    })}

    <div style={{position:'absolute',left:px,top:py,pointerEvents:'none',opacity:linear(f,40,52)*linear(f,1600,1630,1,0)}}>
      {CLICKS.map(c=>{const t=linear(f,c,c+16);return t>0&&t<1?<div key={c} style={{position:'absolute',left:-30,top:-30,width:60,height:60,border:`3px solid ${C.teal}`,borderRadius:'50%',transform:`scale(${0.35+t*1.1})`,opacity:1-t}}/>:null;})}
      <svg width="30" height="36" viewBox="0 0 29 35" style={{filter:'drop-shadow(0 3px 5px #0006)',transform:`scale(${1-0.14*CLICKS.reduce((n,c)=>Math.max(n,pulse(f,c-3,c+9,3,6)),0)})`,transformOrigin:'2px 2px'}}><path d="M2 2 3 28 10 21 17 32 23 28 16 18 26 16Z" fill="#102F34" stroke="white" strokeWidth="2"/></svg>
    </div>
  </div>;
};
