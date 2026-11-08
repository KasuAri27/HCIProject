import React,{useMemo} from 'react';
import {ThreeCanvas} from '@remotion/three';
import {random,useCurrentFrame} from 'remotion';
import {AdditiveBlending,Color,Euler,PerspectiveCamera,Vector3} from 'three';
import {Backdrop,Badge,Heading} from './Shared';
import {C,ease,linear} from './motion';
import {getDisclosure,getLitNodes,knowledgeEdges,knowledgeNodes,learningProgress} from './knowledgeModel';

const vertex=`varying vec3 p; varying vec3 n; void main(){p=position; n=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fluid=`
  varying vec3 p; varying vec3 n;
  uniform float time; uniform float level; uniform float lit;
  void main(){
    float wave=sin(p.x*8.+time*2.)*.045+sin(p.x*15.-time*1.6)*.02;
    float line=-1.04+level*2.13+wave;
    float water=1.-smoothstep(line-.025,line+.025,p.y);
    vec3 normal=normalize(n);
    float rim=pow(1.-abs(normal.z),2.2);
    float key=max(0.,dot(normal,normalize(vec3(-.6,.85,1.))));
    vec3 grey=vec3(.29,.33,.35)*(.48+key*.7);
    vec3 liquid=mix(vec3(.045,.33,.34),vec3(.43,.86,.73),(p.y+1.)*.5);
    liquid+=.035*sin(p.x*13.+p.y*6.-time*2.);
    vec3 color=mix(grey,liquid,water);
    color+=vec3(.2,.29,.3)*rim*.55;
    color+=pow(key,34.)*.48;
    color+=lit*vec3(.035,.04,.0);
    gl_FragColor=vec4(color,1.);
  }`;
const haloVertex=`varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const haloFragment=`varying vec2 uv0;uniform float strength;void main(){float r=length(uv0-.5);float a=exp(-pow((r-.335)*23.,2.))*.30*strength;gl_FragColor=vec4(1.,.74,.29,a);}`;

const StarField:React.FC=()=>{
  const f=useCurrentFrame();
  const points=useMemo(()=>{const a=new Float32Array(1050);for(let i=0;i<350;i++){a[i*3]=(random(`kx${i}`)-.5)*31;a[i*3+1]=(random(`ky${i}`)-.5)*17;a[i*3+2]=-5-random(`kz${i}`)*7;}return a;},[]);
  return <points rotation={[0,f*.0001,f*.00004]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[points,3]}/></bufferGeometry><pointsMaterial size={0.022} color="#B5D7D0" transparent opacity={0.5}/></points>;
};

export const Knowledge:React.FC=()=>{
  const f=useCurrentFrame();
  const states=getDisclosure(f),lit=getLitNodes(f);
  // Real nodes and 3D edges share their world coordinates with projected labels.
  // The camera stays fixed while the entire shell turns in perspective.
  const rotation=new Euler(-0.10,-0.35+f*.00135,-0.025);
  const positions=knowledgeNodes.map(node=>new Vector3(...node.position).applyEuler(rotation).add(new Vector3(0,-0.88,0)));
  const camera=useMemo(()=>{
    const c=new PerspectiveCamera(38,1920/1080,.1,100);
    c.position.set(0,0,16);c.lookAt(0,0,0);c.updateMatrixWorld();return c;
  },[]);
  const projected=positions.map((position,i)=>{
    const p=position.clone().project(camera);
    return {x:(p.x+1)*960,y:(1-p.y)*540,z:position.z,
      r:knowledgeNodes[i].radius*1080/(2*Math.tan(19*Math.PI/180)*(16-position.z))};
  });
  const edgePoints:number[]=[],edgeColors:number[]=[];
  const flows:Vector3[]=[];
  knowledgeEdges.forEach(([a,b],i)=>{
    const pa=positions[a],pb=positions[b],direction=pb.clone().sub(pa).normalize();
    const start=pa.clone().addScaledVector(direction,knowledgeNodes[a].radius+.035);
    const end=pb.clone().addScaledVector(direction,-knowledgeNodes[b].radius-.035);
    edgePoints.push(...start.toArray(),...end.toArray());
    const bothLit=lit.has(a)&&lit.has(b),exposed=states[a].state!=='locked'||states[b].state!=='locked';
    const color=new Color(bothLit?'#C2B77B':exposed?'#71898B':'#405C62');
    color.multiplyScalar((pa.z+pb.z)/2<0?.5:.85);edgeColors.push(...color.toArray(),...color.toArray());
    if(bothLit){const t=((f/115+i*.127)%1+1)%1;flows.push(start.clone().lerp(end,t));}
  });

  // Prioritise front-facing names when depth layers overlap. Unknown labels
  // obtain their text exclusively from the disclosure rule, never from name.
  const labels=new Set<number>();const occupied:{x:number;y:number;w:number;h:number}[]=[];
  [...knowledgeNodes].sort((a,b)=>{
    const priority=(id:number)=>states[id].state==='lit'?0:learningProgress(knowledgeNodes[id],f)>0?1:states[id].state==='frontier'?2:3;
    return priority(a.id)-priority(b.id)||projected[b.id].z-projected[a.id].z;
  }).forEach(node=>{
    const p=projected[node.id],title=states[node.id].title;
    const size=p.z<-.5?15:18,w=Math.max(44,title.length*size+12);
    const progress=learningProgress(node,f);
    const box={x:p.x-w/2,y:p.y+p.r+8,w,h:node.learnFrom!==undefined&&progress>0&&progress<1?44:22};
    const covered=projected.some((q,j)=>j!==node.id&&q.z>p.z+.6&&Math.hypot(q.x-p.x,q.y-p.y)<q.r+6);
    const overlaps=occupied.some(b=>box.x<b.x+b.w+5&&box.x+box.w+5>b.x&&box.y<b.y+b.h+4&&box.y+box.h+4>b.y);
    if(!covered&&!overlaps&&box.y>285&&box.y<930){labels.add(node.id);occupied.push(box);}
  });

  return <><Backdrop/><Heading title="让知识，连成一片星空。" detail="点亮一个知识，就看见下一步；更远的未知，等待逐层探索。"/><Badge concept>知识星空图 · 概念演示</Badge>
    <ThreeCanvas width={1920} height={1080} camera={{position:[0,0,16],fov:38}} gl={{alpha:true,antialias:true}} style={{position:'absolute',inset:0}}>
      <ambientLight intensity={.85}/><directionalLight position={[-6,8,10]} intensity={2.0} color="#EAF6F2"/><pointLight position={[6,-2,8]} intensity={65} color="#98C0CF"/>
      <StarField/>
      <lineSegments><bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(edgePoints),3]}/><bufferAttribute attach="attributes-color" args={[new Float32Array(edgeColors),3]}/></bufferGeometry><lineBasicMaterial vertexColors transparent opacity={linear(f,8,40)*.60}/></lineSegments>
      {flows.map((position,i)=><mesh key={i} position={position}><sphereGeometry args={[.022,6,6]}/><meshBasicMaterial color={C.gold}/></mesh>)}
      {knowledgeNodes.map(node=>{
        const state=states[node.id].state,progress=learningProgress(node,f);
        const gold=Number.isFinite(node.masteredAt)?linear(f,node.masteredAt,node.masteredAt+22):0,visible=state!=='locked';
        return <group key={node.id} position={positions[node.id]} scale={ease(f,node.id%7*2,34+node.id%7*2,.03,1)}>
          <mesh scale={node.radius}>
            <sphereGeometry args={[1,32,24]}/>
            {(state==='lit'||progress>0)&&visible ? <shaderMaterial vertexShader={vertex} fragmentShader={fluid} uniforms={{time:{value:f/30+node.id*.3},level:{value:progress},lit:{value:state==='lit'?1:0}}}/> : <meshPhysicalMaterial color={visible?'#77848A':'#283C44'} metalness={visible ? 0.42 : 0.18} roughness={visible ? 0.3 : 0.52} clearcoat={visible ? 0.8 : 0.25} clearcoatRoughness={.18}/>}
          </mesh>
          {state==='lit'&&<>
            <mesh position={[0,0,.025]} scale={node.radius*3.5}><planeGeometry args={[1,1]}/><shaderMaterial vertexShader={haloVertex} fragmentShader={haloFragment} uniforms={{strength:{value:gold}}} transparent blending={AdditiveBlending} depthWrite={false}/></mesh>
            <mesh position={[0,0,.02]}><torusGeometry args={[node.radius*1.21,.009,6,64]}/><meshBasicMaterial color={C.gold} transparent opacity={gold*.95}/></mesh>
            <mesh position={[0,0,-.04]} rotation={[.3,.45,f*.004+node.id]}><torusGeometry args={[node.radius*1.4,.004,4,64]}/><meshBasicMaterial color={C.gold} transparent opacity={gold*.4}/></mesh>
          </>}
        </group>;
      })}
    </ThreeCanvas>
    {knowledgeNodes.filter(node=>labels.has(node.id)).map(node=>{
      const state=states[node.id],p=projected[node.id],progress=learningProgress(node,f);
      const opacity=linear(f,20,48)*linear(p.z,-3.7,2.8,.37,1);
      return <div key={node.id} style={{position:'absolute',left:p.x-100,top:p.y+p.r+8,width:200,textAlign:'center',pointerEvents:'none',opacity}}>
        <div style={{fontSize:p.z<-.5?15:18,fontWeight:state.state==='lit'?600:400,color:state.state==='lit'?C.gold:state.state==='frontier'?'#C3CCD0':'#71878F',textShadow:'0 2px 5px #092B30'}}>{state.title}</div>
        {node.learnFrom!==undefined&&progress>0&&progress<1&&state.state==='frontier'&&<div style={{fontSize:13,color:'#A8B8BC',marginTop:3}}>学习中 {Math.round(progress*100)}%</div>}
      </div>;
    })}
    <div style={{position:'absolute',left:90,top:208,display:'flex',gap:37,fontSize:19,color:'#B5C6C5'}}>
      <span style={{color:C.gold}}>● 已点亮：显示知识内容</span><span style={{color:'#C3CCD0'}}>● 灰色：直连已点亮节点，可探索</span><span style={{color:'#81989F'}}>● ???：仅连接未点亮节点，待解锁</span>
    </div>
    <div style={{position:'absolute',left:94,bottom:136,fontSize:17,color:'#8AA8A8'}}>52 个知识球体 · 真实三维连接 · 液体满格后点亮</div>
    <div style={{position:'absolute',right:90,bottom:128,color:'#8AA6A3',fontSize:16}}>进度与掌握状态为动画示意</div>
  </>;
};
