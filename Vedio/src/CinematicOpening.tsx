import React,{useLayoutEffect,useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {random,useCurrentFrame} from 'remotion';
import {AdditiveBlending,CanvasTexture,PerspectiveCamera,SRGBColorSpace} from 'three';
import {ease,linear} from './motion';
import {HEAD_SEATED,Student,smooth,type P} from './Student';
import {StudyRoom} from './StudyRoom';

// Opening 32 seconds: a student revising at night (frames 0-645), then the
// same student among scattered topic stars with a clock running fast (645-960).
// Character and room live in Student.tsx and StudyRoom.tsx; this file holds
// the camera, the star space and the overlays.

const Box:React.FC<{at:P;size:P;color:string;rotation?:P}>=({at,size,color,rotation})=>
  <mesh position={at} rotation={rotation}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.72}/></mesh>;

const Clock:React.FC<{frame:number}>=({frame})=>{
  const appear=ease(frame,824,856,.02,1);
  const t=Math.max(0,(frame-844)/30);
  const spin=.58*t+.43*t*t+.18*t*t*t;
  return <group position={[0,3.12,-3.8]} scale={appear}>
    <mesh><circleGeometry args={[1.92,72]}/><meshBasicMaterial color='#152241'/></mesh>
    <mesh position={[0,0,.03]}><torusGeometry args={[1.94,.035,10,96]}/><meshBasicMaterial color='#ffd494'/></mesh>
    <mesh position={[0,0,.01]}><torusGeometry args={[2.035,.012,6,96]}/><meshBasicMaterial color='#a97d59'/></mesh>
    {Array.from({length:60},(_,i)=>{
      const angle=i*Math.PI/30;
      const radius=i%5===0?1.72:1.79;
      return <Box key={i} at={[Math.sin(angle)*radius,Math.cos(angle)*radius,.058]}
        size={[i%5===0?.034:.012,i%5===0?.18:.065,.015]} rotation={[0,0,-angle]} color={i%5===0?'#ebc994':'#76869f'}/>;
    })}
    <group rotation={[0,0,-spin*.32]}><Box at={[0,.43,.09]} size={[.07,1.02,.028]} color='#e8d9bc'/></group>
    <group rotation={[0,0,-spin]}><Box at={[0,.68,.104]} size={[.035,1.53,.028]} color='#ffd491'/></group>
    <mesh position={[0,0,.125]}><sphereGeometry args={[.083,16,10]}/><meshBasicMaterial color='#ffe0ac'/></mesh>
  </group>;
};

const StarSpace:React.FC<{frame:number}>=({frame})=>{
  const dust=useMemo(()=>{
    const points=new Float32Array(2700);
    for(let i=0;i<points.length;i++)points[i]=(random(`opening-star-${i}`)-.5)*(i%3===1?12:25)+(i%3===1?3:0);
    return points;
  },[]);
  // Soft dot so the topic stars glow instead of sitting inside flat discs.
  const glow=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const ctx=canvas.getContext('2d')!,g=ctx.createRadialGradient(64,64,0,64,64,64);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
  },[]);
  const topics=['极限','向量','导数','定积分','概率','连续性','矩阵','线性变换','级数','梯度','数列','曲线'];
  return <>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust,3]}/></bufferGeometry><pointsMaterial color="#a0b8ff" size={.037} transparent opacity={.66}/></points>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.015,0]} receiveShadow><circleGeometry args={[1.31,60]}/><meshStandardMaterial color="#242f54" roughness={.85}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.008,0]}><ringGeometry args={[1.29,1.33,72]}/><meshBasicMaterial color="#8FA9E6" transparent opacity={.6} toneMapped={false}/></mesh>
    {topics.map((topic,i)=>{
      const a=i*2.39996;
      const distance=2.8+(i%4)*.62;
      const position:P=[Math.cos(a)*distance,.92+(i%5)*.85+Math.sin(frame*.026+i)*.09,Math.sin(a)*distance];
      return <group key={topic} position={position}>
        <mesh><sphereGeometry args={[.068+(i%3)*.029,16,12]}/><meshBasicMaterial color={i%4===0?'#ffd2a1':'#a6c7ff'} toneMapped={false}/></mesh>
        <sprite scale={.75+(i%3)*.16}><spriteMaterial map={glow} color={i%4===0?'#ffbd83':'#769efc'} transparent opacity={.6} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
        <TopicLabel title={topic} frame={frame}/>
      </group>;
    })}
    {frame>=824&&<Clock frame={frame}/>}
  </>;
};

const TopicLabel:React.FC<{title:string;frame:number}>=({title,frame})=>{
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=88;
    const ctx=canvas.getContext('2d')!;
    ctx.font='48px Microsoft YaHei';ctx.textAlign='center';ctx.fillStyle='#d7e6ff';
    ctx.fillText(title,160,63);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    return texture;
  },[title]);
  return <sprite position={[0,-.20,0]} scale={[.65,.179,1]}><spriteMaterial map={texture} transparent depthWrite={false} opacity={linear(frame,650,693,.2,.9)}/></sprite>;
};

// ---------------------------------------------------------------- camera
// The desk shots are one move on an orbit around the student's head.
//   0-225   wide, from behind, drifting slowly
// 225-315   glide in to an over-the-shoulder view on the right
// 315-405   hold there while the tools switch on the monitor
// 405-503   slide behind the head to the left shoulder at a constant
//           distance and height: no push-in, no pull-out. Straight behind
//           (frame 454) the head covers the whole monitor, and that is the
//           frame on which the monitor switches from the tools to the document
// 503-645   hold over the left shoulder while the document scrolls
const WIDE={angle:-.2,radius:3.75,height:2.15,fov:42,look:[0,1.3,-.75] as P};
// The near shots use a wider lens than the wide shot: the head has to stay at least as large as
// the monitor to be able to cover it, so a wide lens keeps both modest and shows more of the room.
const NEAR={angle:.8,radius:1.7,height:1.83,fov:45,look:[0,1.5,-1.1] as P};
/** 0..1 with a constant speed in the middle and soft ends (a quarter each). */
const steady=(t:number)=>{
  const x=Math.min(1,Math.max(0,t)),a=.25;
  return x<a?x*x/(2*a*(1-a)):x>1-a?1-(1-x)*(1-x)/(2*a*(1-a)):(x-a/2)/(1-a);
};
const deskCamera=(frame:number)=>{
  const glide=smooth((frame-225)/90);
  const lerp=(from:number,to:number)=>from+(to-from)*glide;
  // Before the glide the wide shot drifts right; afterwards the angle follows the pass.
  const wideAngle=WIDE.angle+linear(frame,0,225)*.16;
  const pass=steady((frame-405)/98);
  // The slow drifts before and after are equal, so the pass is centred: angle 0 falls on frame 454.
  const nearAngle=NEAR.angle-linear(frame,315,405)*.04-pass*(NEAR.angle*2-.08)-linear(frame,503,645)*.04;
  const angle=lerp(wideAngle,nearAngle),radius=lerp(WIDE.radius-linear(frame,0,225)*.3,NEAR.radius);
  return {
    position:[HEAD_SEATED[0]+Math.sin(angle)*radius,lerp(WIDE.height,NEAR.height),HEAD_SEATED[2]+Math.cos(angle)*radius] as P,
    look:[lerp(WIDE.look[0],NEAR.look[0]),lerp(WIDE.look[1],NEAR.look[1]),lerp(WIDE.look[2],NEAR.look[2])] as P,
    fov:lerp(WIDE.fov,NEAR.fov),
  };
};

const Camera:React.FC<{frame:number;star:boolean}>=({frame,star})=>{
  const camera=useThree(state=>state.camera) as PerspectiveCamera;
  useLayoutEffect(()=>{
    if(star){
      const angle=2*Math.PI*smooth((frame-693)/133);
      const radius=5.8+.4*smooth((frame-826)/35);
      camera.position.set(Math.sin(angle)*radius,2.31+Math.sin(angle)*.24,Math.cos(angle)*radius);
      camera.lookAt(0,1.82+.60*smooth((frame-825)/41),-.44*smooth((frame-825)/41));
      camera.fov=42;
    }else{
      const shot=deskCamera(frame);
      camera.position.set(...shot.position);camera.lookAt(...shot.look);camera.fov=shot.fov;
    }
    camera.updateProjectionMatrix();camera.updateMatrixWorld();
  },[camera,frame,star]);
  return null;
};

export const CinematicOpening:React.FC=()=>{
  const frame=useCurrentFrame();
  const star=frame>=645;
  const chapter=frame<225?'课件散在不同格式里':frame<405?'学习工具来回切换':frame<645?'长文翻不到重点':frame<830?'知识点散落各处':'复习时间越走越快';
  const transition=frame<645?linear(frame,626,645):linear(frame,645,661,1,0);
  const introduce=linear(frame,927,952);
  return <>
    <ThreeCanvas width={1920} height={1080} camera={{position:[0,2,4],fov:42}} shadows
      gl={{antialias:true}} style={{position:'absolute',inset:0}}>
      <color attach="background" args={[star?'#080e24':'#141C36']}/>
      <fog attach="fog" args={[star?'#080e24':'#141C36',star?10:8,star?26:20]}/>
      {/* the room brings its own motivated lights; the star space keeps a soft studio setup */}
      {star&&<>
        <ambientLight intensity={.95} color="#cad6ff"/>
        <directionalLight position={[-3,5,3]} intensity={1.9} color="#a8beff" castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024}/>
        <directionalLight position={[4,3,-3]} intensity={1.7} color="#e0b7ff"/>
      </>}
      <Camera frame={frame} star={star}/>
      {star?<StarSpace frame={frame}/>:<StudyRoom frame={frame}/>}
      <Student frame={frame} star={star}/>
    </ThreeCanvas>
    <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse at 50% 46%, transparent 48%, #080d246e 100%)'}}/>
    <div style={{position:'absolute',top:70,left:89,color:'#d7e5ff',fontSize:24,fontWeight:600,letterSpacing:2,opacity:(1-transition)*(1-introduce)}}>
      <span style={{display:'inline-block',height:2,width:42,background:'#e7b58a',verticalAlign:'middle',marginRight:18}}/>{chapter}
    </div>
    <div style={{position:'absolute',inset:0,background:'#0b1327',opacity:Math.max(transition,introduce*.72)}}/>
    <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',fontSize:65,fontWeight:700,color:'#f6efe5',opacity:introduce}}>
      把学习，带回同一张桌面。
    </div>
  </>;
};
