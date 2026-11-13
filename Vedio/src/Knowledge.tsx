import React,{useLayoutEffect,useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {Easing,interpolate,random,useCurrentFrame} from 'remotion';
import {AdditiveBlending,CanvasTexture,Color,Euler,PerspectiveCamera,Quaternion,Vector3} from 'three';
import {N,linear} from './motion';
import {getDisclosure,getLitNodes,knowledgeEdges,knowledgeNodes,learningProgress} from './knowledgeModel';

// The knowledge sky answers the opening, where topics drifted apart in the same
// night-blue space: here they are joined into one constellation. Known topics
// glow in the middle, named-but-unlearned ones are slate glass around them and
// the unknown rim stays dark. `finale` reuses the sky, fully lit, behind the
// closing line.

const vertex=`varying vec3 p; varying vec3 n; void main(){p=position; n=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// One shader for every state so a node can move smoothly from locked glass to
// revealed glass to a filling and finally lit liquid orb.
const orb=`
  varying vec3 p; varying vec3 n;
  uniform float time; uniform float level; uniform float lit; uniform float reveal; uniform float fog; uniform float boost;
  uniform vec3 fogColor;
  void main(){
    vec3 nn=normalize(n);
    float rim=pow(1.-clamp(nn.z,0.,1.),2.4);            // bright edge of a glass ball
    float key=max(0.,dot(nn,normalize(vec3(-.5,.75,.6))));
    float spec=pow(key,40.);
    vec3 locked=vec3(.06,.085,.19)*(.7+.6*key)+vec3(.26,.40,.86)*rim;
    locked+=boost*(vec3(.06,.09,.20)+vec3(.30,.44,.95)*rim); // unknown nodes light up while they are being talked about
    vec3 open=vec3(.20,.26,.42)*(.5+.75*key)+vec3(.55,.68,1.)*rim*.75;
    vec3 glass=mix(locked,open,reveal)+spec*(.25+.45*reveal);
    // Liquid surface height follows the learning progress; waves calm down once full.
    float wave=sin(p.x*7.+time*2.2)*.05+sin(p.x*13.-time*1.7)*.022;
    float line=-1.06+level*2.16+wave*(1.-lit);
    float water=1.-smoothstep(line-.02,line+.02,p.y);
    vec3 liquid=mix(vec3(.02,.36,.40),vec3(.42,.92,.80),clamp((p.y+1.)*.5,0.,1.));
    liquid+=.05*sin(p.x*11.+p.y*6.-time*2.);
    liquid=liquid*(.75+.5*key)+vec3(.6,.95,.9)*rim*.5+spec*.6;
    float meniscus=smoothstep(.07,0.,abs(p.y-line))*step(.001,level)*(1.-lit);
    vec3 color=mix(glass,liquid,water)+meniscus*vec3(.5,.9,.85)*.5;
    color+=lit*(vec3(1.,.78,.42)*rim*.55+vec3(.05,.08,.06));
    gl_FragColor=vec4(mix(color,fogColor,fog),1.);
  }`;

const kf=(f:number,frames:number[],values:number[])=>interpolate(f,frames,values,{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.inOut(Easing.cubic)});
const FOV=38,SKY=new Color(N.sky);

/** Soft sprites stand in for bloom: a radial glow, a mastery ring and a thin shockwave. */
const useSprites=()=>useMemo(()=>{
  const make=(draw:(ctx:CanvasRenderingContext2D)=>void)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    draw(canvas.getContext('2d')!);return new CanvasTexture(canvas);
  };
  const ring=(width:number,blur:number)=>(ctx:CanvasRenderingContext2D)=>{
    ctx.strokeStyle='#fff';ctx.lineWidth=width;ctx.shadowColor='#fff';ctx.shadowBlur=blur;
    ctx.beginPath();ctx.arc(128,128,96,0,Math.PI*2);ctx.stroke();ctx.stroke();
  };
  return {
    glow:make(ctx=>{
      const g=ctx.createRadialGradient(128,128,0,128,128,128);
      g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.22,'rgba(255,255,255,.42)');g.addColorStop(.55,'rgba(255,255,255,.1)');g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
    }),
    ring:make(ring(5,16)),
    wave:make(ring(2.5,10)),
  };
},[]);

const Rig:React.FC<{position:Vector3;target:Vector3}>=({position,target})=>{
  const camera=useThree(state=>state.camera);
  useLayoutEffect(()=>{camera.position.copy(position);camera.lookAt(target);camera.updateMatrixWorld();},[camera,position,target]);
  return null;
};

const Stars:React.FC<{f:number}>=({f})=>{
  const layers=useMemo(()=>[0,1].map(layer=>{
    const count=layer?260:620,a=new Float32Array(count*3);
    for(let i=0;i<count;i++){a[i*3]=(random(`sx${layer}${i}`)-.5)*64;a[i*3+1]=(random(`sy${layer}${i}`)-.5)*36;a[i*3+2]=-9-random(`sz${layer}${i}`)*16;}
    return a;
  }),[]);
  return <group rotation={[0,f*.00018,f*.00005]}>{layers.map((points,layer)=><points key={layer}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry>
    <pointsMaterial size={layer?.075:.04} color={layer?'#DCE8FF':'#9FB6EE'} transparent opacity={layer?.8:.6} toneMapped={false}/>
  </points>)}</group>;
};

// First frame at which each node stops being "???": drives the reveal animation.
const REVEAL_AT=knowledgeNodes.map(node=>[0,230,378].find(frame=>getDisclosure(frame)[node.id].state!=='locked')??Infinity);
const UP=new Vector3(0,1,0);

export const Knowledge:React.FC<{finale?:boolean}>=({finale=false})=>{
  const f=useCurrentFrame();
  const sprites=useSprites();
  const states=getDisclosure(finale?999:f),lit=getLitNodes(finale?999:f);
  // The finale shows the whole sky learned; the story follows the model frame by frame.
  const litAmount=(id:number)=>{const m=knowledgeNodes[id].masteredAt;return finale?1:!Number.isFinite(m)?0:m===0?1:linear(f,m,m+24);};
  const revealAmount=(id:number)=>{const at=REVEAL_AT[id];return finale||at===0?1:!Number.isFinite(at)?0:linear(f,at+6+id%5*3,at+30+id%5*3);};
  const level=(id:number)=>finale?1:learningProgress(knowledgeNodes[id],f);
  const enter=(order:number)=>finale?1:interpolate(f,[4+order*.9,24+order*.9],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.back(1.6))});

  // The camera does the storytelling; the sky itself only turns slowly for parallax.
  const turn=new Euler(-0.06,-0.2+(finale?560+f:f)*.0009,0);
  const centre=new Vector3(0,finale?0:-0.3,0);
  const unknownBoost=finale?0:pulseOn(f,268,342);
  const positions=knowledgeNodes.map(node=>new Vector3(...node.position).applyEuler(turn).add(centre));
  // Push in on the two topics learned on screen (9 then 10), glance at the
  // unknown rim in between, and pull back wide whenever a new layer is revealed.
  const w9=finale?0:kf(f,[135,185,236,272],[0,1,1,0]),w10=finale?0:kf(f,[335,372,432,472],[0,1,1,0]),wRim=finale?0:kf(f,[266,296,335,372],[0,1,1,0]); // hands over to w10 on the same frames, so the camera never swings back through the centre
  const distance=finale?kf(f,[0,150],[20,17]):kf(f,[0,80,135,185,236,272,296,335,372,432,472,510],[23,16,14.5,9.6,9.6,14.5,12.5,12.5,9.2,9.2,15,16]);
  const focus=centre.clone().multiplyScalar(1-w9-w10-wRim).addScaledVector(positions[9].clone().lerp(centre,.22),w9).addScaledVector(positions[10].clone().lerp(centre,.22),w10).addScaledVector(new Vector3(3.4,-2.3,-.8),wRim);
  const eye=new Vector3(focus.x*.92,focus.y*.92+.2,focus.z+distance);
  const camera=useMemo(()=>new PerspectiveCamera(FOV,1920/1080,.1,100),[]);
  camera.position.copy(eye);camera.lookAt(focus);camera.updateMatrixWorld();
  const forward=focus.clone().sub(eye).normalize();
  const depthOf=(v:Vector3)=>v.clone().sub(eye).dot(forward);
  const fogOf=(v:Vector3)=>Math.min(.78,Math.max(0,(depthOf(v)-(distance-1.5))/10));
  const projected=positions.map((position,i)=>{
    const p=position.clone().project(camera),depth=depthOf(position);
    return {x:(p.x+1)*960,y:(1-p.y)*540,depth,r:knowledgeNodes[i].radius*540/(Math.tan(FOV/2*Math.PI/180)*depth)};
  });

  const linePoints:number[]=[],lineColors:number[]=[];
  const golden:{start:Vector3;end:Vector3;amount:number;i:number}[]=[];
  knowledgeEdges.forEach(([a,b],i)=>{
    const pa=positions[a],pb=positions[b],direction=pb.clone().sub(pa).normalize();
    const start=pa.clone().addScaledVector(direction,knowledgeNodes[a].radius+.04);
    const full=pb.clone().addScaledVector(direction,-knowledgeNodes[b].radius-.04);
    // Edges grow outward from the centre as the sky assembles.
    const outer=Math.max(knowledgeNodes[a].order,knowledgeNodes[b].order);
    const grown=finale?1:linear(f,14+outer*.9,32+outer*.9);
    if(grown<=0)return;
    const end=start.clone().lerp(full,grown);
    const gold=Math.min(litAmount(a),litAmount(b)),exposed=Math.max(revealAmount(a),revealAmount(b));
    const color=new Color('#2A3A66').lerp(new Color('#7088C4'),exposed).lerp(new Color('#C9A56A'),gold).lerp(SKY,(fogOf(pa)+fogOf(pb))/2);
    linePoints.push(...start.toArray(),...end.toArray());lineColors.push(...color.toArray(),...color.toArray());
    if(gold>0)golden.push({start,end,amount:gold*grown,i});
  });

  // Names: lit first, then the one being learned, then revealed, then "???".
  // A label is dropped when a nearer orb covers it or an earlier label owns the spot.
  const labels=new Set<number>();const taken:{x:number;y:number;w:number;h:number}[]=[];
  if(!finale)[...knowledgeNodes].sort((a,b)=>{
    const rank=(id:number)=>states[id].state==='lit'?0:level(id)>0?1:states[id].state==='frontier'?2:3;
    return rank(a.id)-rank(b.id)||projected[a.id].depth-projected[b.id].depth;
  }).forEach(node=>{
    const p=projected[node.id],title=states[node.id].title,locked=states[node.id].state==='locked';
    if(locked&&fogOf(positions[node.id])>.42)return; // far unknowns stay anonymous dots
    const size=labelSize(p.r,locked),w=Math.max(44,title.length*size+14),learning=level(node.id)>.02&&level(node.id)<1;
    const box={x:p.x-w/2,y:p.y+p.r+8,w,h:size+6+(learning?24:0)};
    const covered=projected.some((q,j)=>j!==node.id&&q.depth<p.depth-.5&&Math.abs(q.x-p.x)<q.r+w/2&&box.y<q.y+q.r&&box.y+box.h>q.y-q.r);
    const clash=taken.some(t=>box.x<t.x+t.w+8&&box.x+box.w+8>t.x&&box.y<t.y+t.h+8&&box.y+box.h+8>t.y);
    if(!covered&&!clash&&box.y>170&&box.y+box.h<905&&p.x>60&&p.x<1860){labels.add(node.id);taken.push(box);}
  });

  const legend=[
    {text:'已点亮：显示知识内容',color:N.gold,on:pulseOn(f,90,138)},
    {text:'灰色：直连已点亮节点，可探索',color:'#C9D6F2',on:pulseOn(f,140,226)},
    {text:'???：更远的未知，待解锁',color:'#7F92BD',on:pulseOn(f,268,342)},
  ];

  return <>
    <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 50% 46%,${N.haze} 0%,${N.deep} 46%,${N.sky} 100%)`}}/>
    <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 22% 70%,#1B5E6A2E 0%,transparent 46%),radial-gradient(ellipse at 82% 24%,#5B3F8E26 0%,transparent 44%)'}}/>
    <ThreeCanvas width={1920} height={1080} camera={{position:[0,0,18],fov:FOV}} gl={{alpha:true,antialias:true}} style={{position:'absolute',inset:0}}>
      <Rig position={eye} target={focus}/>
      <Stars f={f}/>
      <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(linePoints),3]}/><bufferAttribute attach="attributes-color" args={[new Float32Array(lineColors),3]}/></bufferGeometry><lineBasicMaterial vertexColors transparent opacity={.85} toneMapped={false}/></lineSegments>
      {golden.map(({start,end,amount,i})=>{
        // Lit links get real thickness and a light travelling along them.
        const span=end.clone().sub(start),length=span.length(),travel=((f/95+i*.127)%1+1)%1;
        return <group key={i}>
          <mesh position={start.clone().lerp(end,.5)} quaternion={new Quaternion().setFromUnitVectors(UP,span.clone().normalize())}>
            <cylinderGeometry args={[.013,.013,length,6,1,true]}/><meshBasicMaterial color="#FFD08A" transparent opacity={amount*.75} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/>
          </mesh>
          <sprite position={start.clone().lerp(end,travel)} scale={.26}><spriteMaterial map={sprites.glow} color="#FFE6B8" transparent opacity={amount*.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
        </group>;
      })}
      {knowledgeNodes.map(node=>{
        const id=node.id,gold=litAmount(id),reveal=revealAmount(id),progress=level(id),fog=fogOf(positions[id]),clear=1-fog;
        const m=node.masteredAt,burst=!finale&&Number.isFinite(m)&&m>0?linear(f,m,m+46):0,flash=burst>0&&burst<1?Math.sin(Math.min(1,burst*1.5)*Math.PI):0;
        return <group key={id} position={positions[id]} scale={enter(node.order)}>
          <mesh scale={node.radius}><sphereGeometry args={[1,40,28]}/>
            <shaderMaterial vertexShader={vertex} fragmentShader={orb} uniforms={{time:{value:f/30+id*.3},level:{value:progress},lit:{value:gold},reveal:{value:reveal},fog:{value:fog},fogColor:{value:SKY},boost:{value:unknownBoost}}}/>
          </mesh>
          {/* cool glow marks a topic whose name is known; it turns mint while filling */}
          {reveal>0&&gold<1&&<sprite scale={node.radius*(4.4+progress*1.2)}><spriteMaterial map={sprites.glow} color={progress>0?'#7FE6D2':'#9DB6F5'} transparent opacity={(.2+.3*progress)*reveal*(1-gold)*clear} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>}
          {gold>0&&<>
            <sprite scale={node.radius*(6.4+flash*5)}><spriteMaterial map={sprites.glow} color="#7FE6D2" transparent opacity={(.5+flash*.4)*gold*clear} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
            <sprite scale={node.radius*(4.2+flash*3)}><spriteMaterial map={sprites.glow} color="#FFC56E" transparent opacity={(.34+flash*.5)*gold*clear} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
            <sprite scale={node.radius*3.1}><spriteMaterial map={sprites.ring} color={N.gold} transparent opacity={gold*clear} depthWrite={false} toneMapped={false}/></sprite>
            <mesh rotation={[1.1,.5,f*.006+id]}><torusGeometry args={[node.radius*1.55,.005,4,72]}/><meshBasicMaterial color={N.gold} transparent opacity={gold*.45*clear} toneMapped={false}/></mesh>
          </>}
          {burst>0&&burst<1&&<sprite scale={node.radius*(2.6+burst*15)}><spriteMaterial map={sprites.wave} color="#FFE2A8" transparent opacity={Math.pow(1-burst,1.6)} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>}
        </group>;
      })}
    </ThreeCanvas>
    {finale?null:<>
      <div style={{position:'absolute',inset:0,pointerEvents:'none',background:`radial-gradient(ellipse at 50% 50%,transparent 52%,${N.sky}B0 100%)`}}/>
      {knowledgeNodes.filter(node=>labels.has(node.id)).map(node=>{
        const state=states[node.id],p=projected[node.id],progress=level(node.id),locked=state.state==='locked';
        const reveal=revealAmount(node.id),fresh=Number.isFinite(REVEAL_AT[node.id])&&REVEAL_AT[node.id]>0?reveal:1;
        const opacity=enter(node.order)*(1-fogOf(positions[node.id])*.9)*(locked?.7+.3*unknownBoost:fresh);
        const size=labelSize(p.r,locked);
        return <div key={node.id} style={{position:'absolute',left:p.x-130,top:p.y+p.r+8,width:260,textAlign:'center',pointerEvents:'none',opacity,transform:`translateY(${(1-fresh)*8}px)`}}>
          <div style={{fontSize:size,fontWeight:state.state==='lit'?700:400,letterSpacing:locked?2:.5,color:state.state==='lit'?N.gold:locked?(unknownBoost>.5?'#A9BCEB':'#6C80B4'):'#CFDBF6',textShadow:`0 2px 8px ${N.sky},0 0 2px ${N.sky}`}}>{state.title}</div>
          {progress>.02&&progress<1&&<div style={{display:'inline-block',fontSize:15,color:'#0B1327',background:'#8DEBD8',borderRadius:11,padding:'1px 10px',marginTop:4,fontWeight:600}}>学习中 {Math.round(progress*100)}%</div>}
        </div>;
      })}
      <div style={{position:'absolute',left:120,top:52,color:N.text,opacity:linear(f,6,28)*linear(f,128,156,1,0),transform:`translateY(${(1-linear(f,6,28))*14}px)`}}>
        <div style={{fontSize:46,fontWeight:700,textShadow:`0 3px 18px ${N.sky}`}}>让知识，连成一片星空。</div>
        <div style={{fontSize:21,color:N.dim,marginTop:12}}>点亮一个知识，就看见下一步；更远的未知，等待逐层探索。</div>
      </div>
      <div style={{position:'absolute',right:120,top:66,color:'#D6BA82',fontSize:18,border:'1px solid #D6BA8255',borderRadius:7,padding:'7px 14px',opacity:linear(f,10,30)}}>知识星空图 · 概念演示</div>
      <div style={{position:'absolute',left:120,bottom:112,display:'flex',gap:14,opacity:linear(f,60,84)}}>
        {legend.map(item=><div key={item.text} style={{display:'flex',alignItems:'center',gap:10,fontSize:19,color:item.color,padding:'7px 16px',borderRadius:20,
          border:`1px solid ${item.color}${item.on>.5?'AA':'30'}`,background:`rgba(11,19,39,${.45+.35*item.on})`,opacity:.8+.2*item.on,transform:`scale(${1+.04*item.on})`}}>
          <span style={{width:10,height:10,borderRadius:'50%',background:item.color,boxShadow:`0 0 ${10*item.on}px ${item.color}`}}/>{item.text}
        </div>)}
      </div>
      <div style={{position:'absolute',right:120,bottom:120,color:'#7F92BD',fontSize:16,opacity:linear(f,60,84)}}>进度与掌握状态为动画示意</div>
    </>}
  </>;
};

// Nearer orbs get larger names; "???" stays small so it never competes with real titles.
function labelSize(radius:number,locked:boolean){return locked?Math.min(17,Math.max(13,radius*.6)):Math.min(30,Math.max(16,radius*.62));}
function pulseOn(f:number,from:number,to:number){return linear(f,from,from+10)*linear(f,to,to+14,1,0);}
