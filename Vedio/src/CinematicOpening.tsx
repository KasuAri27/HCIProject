import React,{useLayoutEffect,useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import {random,useCurrentFrame} from 'remotion';
import {CanvasTexture,Quaternion,SRGBColorSpace,Vector3} from 'three';
import {ease,linear} from './motion';
import {useMonitorTexture} from './OpeningScreen';

type Point=[number,number,number];
const knit='#37466f',shadowKnit='#263354',skin='#ca977f',hair='#151b2a';
const blend=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};

const Box:React.FC<{at:Point;size:Point;color:string;rotation?:Point}>=({at,size,color,rotation})=>
  <mesh position={at} rotation={rotation}><boxGeometry args={size}/><meshStandardMaterial color={color} roughness={.72}/></mesh>;
const Oval:React.FC<{at:Point;size:Point;color:string;rotation?:Point}>=({at,size,color,rotation})=>
  <mesh position={at} scale={size} rotation={rotation}><sphereGeometry args={[1,24,16]}/><meshStandardMaterial color={color} roughness={.78}/></mesh>;
const Limb:React.FC<{a:Point;b:Point;radius:number;color:string}>=({a,b,radius,color})=>{
  const direction=new Vector3(...b).sub(new Vector3(...a));
  const length=direction.length();
  const quaternion=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize());
  return <mesh position={blend(a,b,.5)} quaternion={quaternion}>
    <capsuleGeometry args={[radius,Math.max(.001,length-1.15*radius),5,12]}/>
    <meshStandardMaterial color={color} roughness={.8}/>
  </mesh>;
};

const Student:React.FC<{frame:number;star:boolean}>=({frame,star})=>{
  const standing=star?smooth((frame-651)/57):0;
  const holding=frame<225?1-smooth((frame-187)/36):0;
  const hip:Point=[0,.55+.49*standing,.37];
  const shoulder:Point=[0,1.31+.5*standing,.25];
  const head:Point=[Math.sin(frame*.028)*.035*standing,1.70+.51*standing-.07*holding,.20-.075*holding];
  const motion=star?0:Math.sin(frame*.16)*.017;
  return <group>
    <Oval at={hip} size={[.29,.19,.23]} color='#202a41'/>
    <Oval at={[0,shoulder[1]-.28,.29]} size={[.365,.46,.223]} color={knit}/>
    <Oval at={[0,shoulder[1]-.02,.385]} size={[.26,.18,.16]} color={shadowKnit}/>
    <Limb a={[0,shoulder[1]+.01,.24]} b={[head[0],head[1]-.15,head[2]]} radius={.10} color={skin}/>
    <group position={head} rotation={[holding*.19,Math.sin(frame*.024)*.24*standing,holding*-.06]}>
      <Oval at={[0,0,0]} size={[.229,.275,.226]} color={skin}/>
      <Oval at={[0,.105,.047]} size={[.245,.223,.232]} color={hair}/>
      <Oval at={[0,-.035,.138]} size={[.223,.229,.139]} color={hair}/>
      <Oval at={[-.07,.216,.03]} size={[.183,.113,.184]} rotation={[.1,.2,-.23]} color='#1b2233'/>
      <Oval at={[-.222,-.037,-.006]} size={[.042,.075,.043]} color={skin}/>
      <Oval at={[.222,-.037,-.006]} size={[.042,.075,.043]} color={skin}/>
      <Oval at={[0,-.05,-.224]} size={[.046,.062,.041]} color={skin}/>
    </group>
    {[-1,1].map(side=>{
      const upper:Point=[side*.30,shoulder[1]-.055,.25];
      const deskElbow:Point=[side*.48,1.05,.01];
      const deskHand:Point=[side*(side===1?.55:.23),.99+motion,-.49+motion];
      const elbow=star?blend(deskElbow,[side*.42,1.38,.29],standing):blend(deskElbow,[side*.52,1.14,-.08],holding);
      const hand=star?blend(deskHand,[side*.44,1.08,.25],standing):blend(deskHand,[side*.19,head[1]+.10,head[2]-.015],holding);
      const cuff=blend(elbow,hand,.86);
      const knee=blend([side*.20,.48,-.27],[side*.18,.59,.31],standing);
      const ankle=blend([side*.20,.11,-.11],[side*.18,.11,.34],standing);
      return <group key={side}>
        <Limb a={upper} b={elbow} radius={.122} color={knit}/>
        <Limb a={elbow} b={cuff} radius={.104} color={knit}/>
        <Oval at={elbow} size={[.111,.113,.11]} color={knit}/>
        <Oval at={hand} size={[.083,.104,.061]} rotation={[holding*.18,0,side*holding*.48]} color={skin}/>
        {holding>.75&&[0,1,2,3].map(finger=><Limb key={finger}
          a={[hand[0]+side*.016,hand[1]+.025,hand[2]+(finger-1.5)*.032]}
          b={[hand[0]-side*.038,hand[1]+.113-finger*.008,hand[2]+(finger-1.5)*.034]}
          radius={.016} color={skin}/>)}
        <Limb a={[side*.15,hip[1],hip[2]]} b={knee} radius={.139} color='#232d45'/>
        <Limb a={knee} b={ankle} radius={.111} color='#232d45'/>
        <Oval at={[ankle[0],.076,ankle[2]-.10]} size={[.134,.075,.233]} color='#141d2d'/>
      </group>;
    })}
  </group>;
};

const FileCard:React.FC<{at:Point;rotation:Point;label:string;name:string;color:string}>=({at,rotation,label,name,color})=>{
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=400;canvas.height=480;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#e9edf6';ctx.fillRect(0,0,400,480);
    ctx.fillStyle=color;ctx.fillRect(0,0,400,155);
    ctx.fillStyle='white';ctx.font='bold 72px Segoe UI';ctx.fillText(label,32,110);
    ctx.fillStyle='#27354f';ctx.font='bold 42px Microsoft YaHei';ctx.fillText(name,32,229);
    ctx.fillStyle='#a4b1c8';
    for(let row=0;row<5;row++)ctx.fillRect(32,274+row*33,300-row*19,9);
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
    return texture;
  },[label,name,color]);
  return <group position={at} rotation={rotation}>
    <Box at={[0,0,0]} size={[.46,.55,.024]} color='#b8c6e0'/>
    <mesh position={[0,0,.014]}><planeGeometry args={[.449,.539]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>
  </group>;
};

const Desk:React.FC<{frame:number}>=({frame})=>{
  const screen=useMonitorTexture(frame);
  const float=Math.sin(frame*.035)*.04;
  return <>
    <Box at={[0,.884,-.99]} size={[2.74,.088,1.34]} color='#77564a'/>
    <Box at={[0,.851,-.315]} size={[2.74,.035,.018]} color='#b98965'/>
    {[-1.22,1.22].map(x=><Box key={x} at={[x,.44,-.98]} size={[.11,.88,1.11]} color='#293147'/>)}
    <Box at={[0,1.006,-1.35]} size={[.5,.04,.27]} color='#151c2b'/>
    <Box at={[0,1.15,-1.40]} size={[.103,.30,.1]} color='#151c2b'/>
    <Box at={[0,1.67,-1.39]} size={[1.55,.99,.071]} color='#171d2e'/>
    <mesh position={[0,1.67,-1.351]}><planeGeometry args={[1.464,.915]}/><meshBasicMaterial map={screen} toneMapped={false}/></mesh>
    <Box at={[0,.944,-.67]} size={[.74,.031,.245]} color='#212b42'/>
    {Array.from({length:36},(_,i)=><Box key={i} at={[(i%12-5.5)*.057,.965,-.74+Math.floor(i/12)*.061]} size={[.045,.014,.046]} color='#52617b'/>)}
    <Oval at={[.57,.967,-.56]} size={[.082,.042,.123]} color='#25334b'/>
    <Box at={[-.97,.938,-.68]} size={[.43,.04,.32]} rotation={[0,.22,0]} color='#9a9ebe'/>
    <Box at={[-.95,.971,-.68]} size={[.41,.032,.31]} rotation={[0,.32,0]} color='#d7c6af'/>
    <Box at={[1.14,.944,-1.45]} size={[.31,.033,.29]} color='#272e44'/>
    <Limb a={[1.14,.96,-1.45]} b={[1.14,1.70,-1.45]} radius={.027} color='#333b56'/>
    <Limb a={[1.14,1.70,-1.45]} b={[1.03,1.97,-1.33]} radius={.027} color='#333b56'/>
    <mesh position={[1.03,1.94,-1.33]} rotation={[.15,0,-.18]}><coneGeometry args={[.17,.20,24]}/><meshStandardMaterial color='#a06b4a'/></mesh>
    <mesh position={[1.03,1.84,-1.33]} rotation={[Math.PI/2,0,0]}><circleGeometry args={[.139,28]}/><meshBasicMaterial color='#ffe1a0' side={2}/></mesh>
    <pointLight position={[.88,1.79,-1.12]} color='#ffc58c' intensity={3.5} distance={3.2}/>
    <pointLight position={[0,1.65,-.99]} color='#8cb8ff' intensity={1.5} distance={2.9}/>
    <Box at={[0,.49,.57]} size={[.69,.095,.63]} color='#1b263c'/>
    <Box at={[0,.80,.83]} size={[.70,.59,.11]} rotation={[-.13,0,0]} color='#202e46'/>
    {[-.24,.24].map(x=><Limb key={x} a={[x,.50,.64]} b={[x,.06,.72]} radius={.031} color='#19243a'/>)}
    {frame<225&&<group scale={linear(frame,199,224,1,.01)}>
      <FileCard at={[-1.63,1.35+float,-.73]} rotation={[.10,.25,-.18]} label="PDF" name="课程讲义" color="#b55060"/>
      <FileCard at={[-1.14,1.92-float,-.86]} rotation={[.04,.21,.09]} label="PPTX" name="课堂课件" color="#b37145"/>
      <FileCard at={[1.28,1.64+float,-.61]} rotation={[.14,-.20,-.13]} label="DOCX" name="复习提纲" color="#4875b4"/>
      <FileCard at={[1.71,1.15-float,-.51]} rotation={[-.04,-.18,.18]} label="MD" name="课后笔记" color="#468c88"/>
    </group>}
  </>;
};

const Room:React.FC=()=> <>
  <Box at={[0,-.08,-.65]} size={[13,.15,13]} color='#242e44'/>
  <Box at={[0,2.55,-3.55]} size={[11,5.3,.10]} color='#202b45'/>
  <Box at={[-2.12,2.60,-3.47]} size={[2.39,2.31,.06]} color='#293e68'/>
  <Box at={[-2.12,2.61,-3.42]} size={[2.23,2.15,.02]} color='#344c7b'/>
  <Box at={[-2.12,2.60,-3.39]} size={[.067,2.23,.05]} color='#202c47'/>
  <Box at={[-2.12,2.57,-3.39]} size={[2.31,.071,.05]} color='#202c47'/>
  <Box at={[-2.12,1.42,-3.36]} size={[2.49,.08,.30]} color='#535776'/>
  {Array.from({length:12},(_,i)=><Box key={i} at={[-3.16+i*.184,1.71+(i%3)*.11,-3.401]}
    size={[.12,.32+(i%5)*.105,.025]} color={i%2?'#2b426a':'#263b60'}/>)}
  <Box at={[2.12,2.79,-3.46]} size={[1.44,.92,.034]} color='#35435e'/>
  <Box at={[2.12,2.79,-3.431]} size={[1.33,.81,.012]} color='#b3b7bc'/>
  {Array.from({length:5},(_,i)=><Box key={i} at={[2.03,3.01-i*.11,-3.418]} size={[1.04-i*.12,.019,.008]} color='#6e7890'/>)}
</>;

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
  const topics=['极限','向量','导数','定积分','概率','连续性','矩阵','线性变换','级数','梯度','数列','曲线'];
  return <>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust,3]}/></bufferGeometry><pointsMaterial color="#a0b8ff" size={.037} transparent opacity={.66}/></points>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.015,0]}><circleGeometry args={[1.31,60]}/><meshStandardMaterial color="#242f54" roughness={.85}/></mesh>
    {topics.map((topic,i)=>{
      const a=i*2.39996;
      const distance=2.8+(i%4)*.62;
      const position:Point=[Math.cos(a)*distance,.92+(i%5)*.85+Math.sin(frame*.026+i)*.09,Math.sin(a)*distance];
      return <group key={topic} position={position}>
        <mesh><sphereGeometry args={[.068+(i%3)*.029,16,12]}/><meshBasicMaterial color={i%4===0?'#ffd2a1':'#a6c7ff'}/></mesh>
        <mesh><sphereGeometry args={[.16+(i%3)*.027,16,12]}/><meshBasicMaterial color={i%4===0?'#ffbd83':'#769efc'} transparent opacity={.14} depthWrite={false}/></mesh>
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

const Camera:React.FC<{frame:number;star:boolean}>=({frame,star})=>{
  const camera=useThree(state=>state.camera);
  useLayoutEffect(()=>{
    if(star){
      const angle=2*Math.PI*smooth((frame-693)/133);
      const radius=5.8+.4*smooth((frame-826)/35);
      camera.position.set(Math.sin(angle)*radius,2.31+Math.sin(angle)*.24,Math.cos(angle)*radius);
      camera.lookAt(0,1.82+.60*smooth((frame-825)/41),-.44*smooth((frame-825)/41));
    }else if(frame<225){
      camera.position.set(.04,2.19,3.72-ease(frame,0,223,0,.48));
      camera.lookAt(0,1.25,-.51);
    }else{
      // Pass close behind the student at frame 454, when their head and
      // shoulders occlude the screen's change from tools to the document.
      const crossing=smooth((frame-405)/98);
      const angle=1.19-2.29*crossing;
      const close=Math.sin(Math.PI*crossing)**3;
      const radius=3.21-2.80*close-.41*smooth((frame-514)/125);
      camera.position.set(Math.sin(angle)*radius,1.89-.21*close,Math.cos(angle)*radius+.21);
      camera.lookAt(0,1.33+.31*close+.10*smooth((frame-514)/125),-.73+.83*close);
    }
    camera.updateMatrixWorld();
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
    <ThreeCanvas width={1920} height={1080} camera={{position:[0,2,4],fov:42}}
      gl={{antialias:true}} style={{position:'absolute',inset:0}}>
      <color attach="background" args={[star?'#080e24':'#182238']}/>
      <fog attach="fog" args={[star?'#080e24':'#182238',star?10:7,star?26:17]}/>
      <ambientLight intensity={star?1.15:1.28} color="#cad6ff"/>
      <directionalLight position={[-3,5,3]} intensity={1.8} color={star?'#a8beff':'#b4c4ff'}/>
      <directionalLight position={[4,3,-3]} intensity={1.65} color={star?'#e0b7ff':'#ffd0a1'}/>
      <Camera frame={frame} star={star}/>
      {star?<StarSpace frame={frame}/>:<><Room/><Desk frame={frame}/></>}
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
