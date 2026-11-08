import React from 'react';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame} from 'remotion';
import {C, ease} from './motion';

export const DocumentCloud: React.FC<{centered?:boolean}> = ({centered=false}) => {
  const f=useCurrentFrame();
  return <ThreeCanvas width={1920} height={1080} camera={{position:[0,0,12],fov:35}} gl={{alpha:true,antialias:true}} style={{position:'absolute',inset:0}}>
    <ambientLight intensity={1.7}/><directionalLight position={[-5,7,10]} intensity={2.4}/><directionalLight position={[8,-3,6]} intensity={1} color={C.mint}/>
    <group position={[centered?0:3.5,0.1,0]} rotation={[-0.16,-0.35+Math.sin(f/160)*0.12,-0.08]} scale={centered?0.8:0.94}>
      {[0,1,2,3,4].map(i=>{
        const spread=centered?1-ease(f,0,105)*0.85:0.8+Math.sin(f/100)*0.08;
        return <group key={i} position={[(i-2)*0.7*spread,(i-2)*0.38*spread+Math.sin(f/50+i)*0.05,i*0.18]} rotation={[0,0,(i-2)*-0.065*spread]}>
          <mesh><boxGeometry args={[2.6,3.45,0.045]}/><meshStandardMaterial color={i===0?C.teal:i===4?'#CEE6DC':'#F5F7F4'} roughness={0.55}/></mesh>
          {[0,1,2,3,4,5,6,7].map(j=><mesh key={j} position={[-(j%3)*0.1,1.0-j*0.25,0.032]}><boxGeometry args={[1.95-(j%3)*0.2,j===0?0.10:0.03,0.008]}/><meshBasicMaterial color={j===0?C.teal:'#95B1A8'}/></mesh>)}
          <mesh position={[1.2,1.23-i*0.4,0.04]}><boxGeometry args={[0.38,0.24,0.015]}/><meshBasicMaterial color={[C.mint,C.gold,'#93BADD','#BED2A1',C.teal][i]}/></mesh>
        </group>;
      })}
    </group>
    <mesh position={[centered?0:3.5,-0.1,-1]} rotation={[0.7,-0.3,f*0.0015]}><torusGeometry args={[2.8,0.008,6,100]}/><meshBasicMaterial color={C.mint} transparent opacity={0.4}/></mesh>
  </ThreeCanvas>;
};
