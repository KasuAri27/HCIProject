import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C,ease,linear,mono} from './motion';

// Concept demo of the three study tools (film frames 3120-3450). All three are
// on screen together and stay alive; the narration only moves the emphasis:
//   12-118  "函数、绘图与编程" - each panel is named in turn
//  137-205  "调一个参数，看曲线变化" - function panel, slider drives the curve
//  212-242  "画出结构" - geometry panel constructs the circumcircle
//  245-278  "运行代码" - code panel runs and prints the result
//  280-330  "让抽象知识变得具体" - all three together
const code=['def derivative(f, x, h=1e-5):','    return (f(x+h) - f(x-h)) / (2*h)','','f = lambda x: x**2','print(derivative(f, 2))'];
const PANELS=[
  {name:'函数工具',title:'观察函数的变化',hint:'改变参数，看见曲线怎样响应。'},
  {name:'绘图工具',title:'画出几何关系',hint:'从已知条件出发，作图、验证。'},
  {name:'编程工具',title:'让代码验证想法',hint:'输入一个例子，观察运行结果。'},
];
const span=(f:number,from:number,to:number,fade=9)=>linear(f,from,from+fade)*linear(f,to-fade,to,1,0);

export const Tools:React.FC=()=>{
  const f=useCurrentFrame();
  // How strongly each panel is singled out at this frame, 0..1.
  const focus=[
    Math.max(span(f,38,58),span(f,134,208)),
    Math.max(span(f,54,74),span(f,208,244)),
    Math.max(span(f,70,92),span(f,242,282)),
  ];
  const any=Math.max(...focus);
  const amplitude=0.6+ease(f,140,200)*1.2;
  const curve=Array.from({length:121},(_,i)=>{const x=-Math.PI*2+i/120*Math.PI*4;return `${i?'L':'M'}${20+i/120*460},${186-Math.sin(x)*amplitude*80}`;}).join(' ');
  const dotT=(f%150)/150,dotX=-Math.PI*2+dotT*Math.PI*4;
  // Circumcircle construction: perpendicular bisectors meet at O, then the circle is drawn.
  const O=[250,236],RADIUS=160,A=[250,76],B=[111.4,316],Cc=[388.6,316];
  const mids=[[A,B],[B,Cc],[Cc,A]].map(([p,q])=>[(p[0]+q[0])/2,(p[1]+q[1])/2]);
  const built=linear(f,212,236),ring=ease(f,226,258),ran=linear(f,254,264);

  return <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 30% 0%,#F7FAF8 0%,#EAF0EC 55%,#DFE8E3 100%)',color:C.ink}}>
    <div style={{position:'absolute',left:120,top:44,opacity:linear(f,6,26),transform:`translateY(${(1-linear(f,6,26))*14}px)`}}>
      <div style={{fontSize:46,fontWeight:700}}>把抽象知识，变成看得见的实践。</div>
      <div style={{fontSize:21,color:'#5E7A70',marginTop:12}}>函数、绘图与编程，在学习现场继续探索。</div>
    </div>
    <div style={{position:'absolute',right:120,top:66,color:'#6F8780',fontSize:18,border:'1px solid #8AA69A66',borderRadius:7,padding:'7px 14px',opacity:linear(f,10,30)}}>学习工具 · 概念演示</div>

    {PANELS.map((panel,i)=>{
      const on=focus[i],enter=ease(f,6+i*7,34+i*7);
      // Panels that are not being talked about step back slightly.
      const dim=any*(1-on);
      return <div key={panel.name} style={{position:'absolute',left:120+i*570,top:186,width:540,height:772,borderRadius:16,background:'#fff',overflow:'hidden',
        opacity:enter*(1-dim*.42),transform:`translateY(${(1-enter)*60-on*8}px) scale(${1+on*.028-dim*.012})`,
        boxShadow:`0 0 0 ${1+on*1.5}px ${on>.5?C.teal:'#CFDDD5'},0 ${26+on*22}px ${60+on*40}px -18px rgba(23,63,53,${.2+on*.16})`}}>
        <div style={{height:66,display:'flex',alignItems:'center',gap:12,padding:'0 26px',borderBottom:'1px solid #DCE6DF',background:'#F6F9F5'}}>
          <span style={{width:11,height:11,borderRadius:'50%',background:[C.teal,'#7A5BB5','#3D6FBF'][i]}}/>
          <span style={{fontSize:23,fontWeight:700}}>{panel.name}</span>
          <span style={{marginLeft:'auto',fontSize:15,color:'#8AA097'}}>概念演示</span>
        </div>
        <div style={{position:'absolute',left:20,top:86,width:500,height:476,borderRadius:10,overflow:'hidden',background:i===2?'#101C33':'#FBFCFB',border:i===2?'none':'1px solid #E3EBE6'}}>
          {i===0&&<svg width="500" height="476">
            <defs><pattern id="tool-grid" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M46 0H0V46" fill="none" stroke="#E7EEE9" strokeWidth="1"/></pattern></defs>
            <rect width="500" height="476" fill="url(#tool-grid)"/>
            <path d="M14 186H486M250 24V348" stroke="#A9BCB2" strokeWidth="1.5"/>
            <path d={curve} fill="none" stroke={C.teal} strokeWidth="4.5" strokeLinecap="round"/>
            <circle cx={20+dotT*460} cy={186-Math.sin(dotX)*amplitude*80} r="8" fill={C.gold} stroke={C.teal} strokeWidth="3"/>
            <text x="22" y="388" fill={C.teal} fontSize="25" fontFamily={mono}>y = {amplitude.toFixed(2)} · sin(x)</text>
            {/* parameter slider: the knob position is the same value that shapes the curve */}
            <text x="22" y="440" fill="#5E7A70" fontSize="20">a</text>
            <rect x="52" y="430" width="330" height="6" rx="3" fill="#D5E5DA"/>
            <rect x="52" y="430" width={(amplitude-.4)/1.6*330} height="6" rx="3" fill={C.teal}/>
            <circle cx={52+(amplitude-.4)/1.6*330} cy="433" r={11+focus[0]*3} fill={C.teal} stroke="#fff" strokeWidth="3.5"/>
            <text x="404" y="441" fill={C.ink} fontSize="22" fontFamily={mono}>{amplitude.toFixed(2)}</text>
          </svg>}
          {i===1&&<svg width="500" height="476">
            <defs><pattern id="tool-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.1" fill="#CFDDD3"/></pattern></defs>
            <rect width="500" height="476" fill="url(#tool-dots)"/>
            <circle cx={O[0]} cy={O[1]} r={RADIUS} fill={`rgba(15,110,124,${.06*ring})`} stroke="#7A5BB5" strokeWidth="2.5" pathLength={1} strokeDasharray="1" strokeDashoffset={1-ring} transform={`rotate(-90 ${O[0]} ${O[1]})`}/>
            {mids.map((m,n)=>{
              // Each bisector runs from outside the triangle, through the edge midpoint, to O.
              const dx=m[0]-O[0],dy=m[1]-O[1],len=Math.hypot(dx,dy),ox=m[0]+dx/len*46,oy=m[1]+dy/len*46,t=linear(f,212+n*5,232+n*5);
              return <line key={n} x1={ox} y1={oy} x2={ox+(O[0]-ox)*t} y2={oy+(O[1]-oy)*t} stroke="#A7BFB1" strokeWidth="2" strokeDasharray="6 7"/>;
            })}
            <path d={`M${A} L${B} L${Cc}Z`} fill="none" stroke={C.teal} strokeWidth="4.5" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1-ease(f,20,74)}/>
            {([[A,'A',14,-12],[B,'B',-34,14],[Cc,'C',16,14]] as const).map(([p,name,dx,dy])=><g key={name} opacity={linear(f,24,44)}><circle cx={p[0]} cy={p[1]} r="7.5" fill={C.teal}/><text x={p[0]+dx} y={p[1]+dy} fontSize="26" fill={C.ink}>{name}</text></g>)}
            <g opacity={built}><circle cx={O[0]} cy={O[1]} r={6+3*built} fill={C.gold} stroke="#B98A2E" strokeWidth="2"/><text x={O[0]+16} y={O[1]+30} fontSize="21" fill="#8A6A22">圆心</text></g>
            <text x="22" y="446" fontSize="20" fill="#5E7A70" opacity={ring}>三边中垂线交于一点，作出外接圆。</text>
          </svg>}
          {i===2&&<div style={{padding:'26px 28px',fontFamily:mono}}>
            <div style={{fontSize:16,color:'#8FA6D6',marginBottom:20}}>derivative.py</div>
            {code.map((line,n)=><div key={n} style={{fontSize:20.5,lineHeight:1.85,whiteSpace:'pre',color:n===0?'#B9C8FF':n===4?'#F2C48D':'#E2EAFB',opacity:linear(f,30+n*9,42+n*9)}}>
              <span style={{display:'inline-block',width:34,color:'#52658F',fontSize:17}}>{n+1}</span>{line}
            </div>)}
            <div style={{display:'inline-block',marginTop:26,background:ran>0&&ran<1?'#2C8C80':C.teal,color:'#fff',padding:'9px 22px',borderRadius:7,fontSize:19,fontFamily:'inherit',
              transform:`scale(${1-.06*span(f,248,258,4)})`,boxShadow:`0 0 0 ${focus[2]*4}px #0F6E7C55`}}>▷ 运行</div>
            <div style={{borderTop:'1px solid #33456F',marginTop:24,paddingTop:18,opacity:ran,transform:`translateY(${(1-ran)*10}px)`}}>
              <div style={{fontSize:15,color:'#8FA6D6',marginBottom:10}}>运行结果</div>
              <div style={{fontSize:25,color:'#9FF0D0'}}>4.000000000026205</div>
              <div style={{fontSize:17,color:'#7BC3A8',marginTop:12}}>✓ 运行完成 · 与 f′(2) = 4 一致</div>
            </div>
          </div>}
        </div>
        <div style={{position:'absolute',left:26,right:26,top:590}}>
          <div style={{fontSize:29,fontWeight:700}}>{panel.title}</div>
          <div style={{fontSize:20,lineHeight:1.7,color:'#5E7A70',marginTop:10}}>{panel.hint}</div>
          <div style={{marginTop:22,height:4,borderRadius:2,background:'#E1EAE5'}}><div style={{width:`${on*100}%`,height:4,borderRadius:2,background:C.teal}}/></div>
        </div>
      </div>;
    })}
  </div>;
};
