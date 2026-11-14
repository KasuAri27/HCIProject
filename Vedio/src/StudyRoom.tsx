import React,{useMemo} from 'react';
import {random} from 'remotion';
import {AdditiveBlending,CanvasTexture,DoubleSide,Object3D,RepeatWrapping,SRGBColorSpace,Texture} from 'three';
import {Ball,Tube,type P} from './Student';
import {useMonitorTexture} from './OpeningScreen';
import {linear} from './motion';

// The dorm room of the opening. Everything is primitives plus a few drawn
// canvas textures. Light comes from three motivated sources: the warm desk
// lamp (key, casts shadows), cool moonlight through the window (back light)
// and the monitor (cool fill on whatever faces it).

// Set to true only to test the camera pass: the screen turns pure magenta so a
// render can prove that not one screen pixel is visible at the content swap.
const SCREEN_TEST=false;

type Look={color:string;rough?:number;emissive?:string;glow?:number;metal?:number};
const Box:React.FC<Look&{at:P;size:P;rot?:P;cast?:boolean}>=({at,size,rot,color,rough=.8,emissive,glow=0,metal=0,cast=true})=>
  <mesh position={at} rotation={rot} castShadow={cast} receiveShadow><boxGeometry args={size}/>
    <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={emissive??'#000'} emissiveIntensity={glow}/></mesh>;
const Can:React.FC<Look&{at:P;r:number;h:number;rt?:number;rot?:P;open?:boolean}>=({at,r,h,rt=r,rot,open,color,rough=.8,emissive,glow=0})=>
  <mesh position={at} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[rt,r,h,28,1,open]}/>
    <meshStandardMaterial color={color} roughness={rough} emissive={emissive??'#000'} emissiveIntensity={glow} side={open?DoubleSide:undefined}/></mesh>;
/** Flat textured picture: lit by the scene unless `lit` is false (then it glows on its own). */
const Picture:React.FC<{at:P;size:[number,number];map:Texture;rot?:P;lit?:boolean}>=({at,size,map,rot,lit=true})=>
  <mesh position={at} rotation={rot} receiveShadow={lit}><planeGeometry args={size}/>
    {lit?<meshStandardMaterial map={map} roughness={.9}/>:<meshBasicMaterial map={map} toneMapped={false}/>}</mesh>;

const paint=(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>{
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  draw(canvas.getContext('2d')!);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
};

const useTextures=()=>useMemo(()=>({
  // Night outside: sky gradient, moon, stars and a skyline with a few lit windows.
  night:paint(512,512,ctx=>{
    const sky=ctx.createLinearGradient(0,0,0,512);sky.addColorStop(0,'#0B1440');sky.addColorStop(.7,'#274488');sky.addColorStop(1,'#4A63A8');
    ctx.fillStyle=sky;ctx.fillRect(0,0,512,512);
    for(let i=0;i<90;i++){ctx.fillStyle=`rgba(230,238,255,${.3+random(`ws${i}`)*.7})`;ctx.fillRect(random(`wx${i}`)*512,random(`wy${i}`)*300,1.6,1.6);}
    const glow=ctx.createRadialGradient(385,105,0,385,105,120);glow.addColorStop(0,'rgba(255,244,214,.75)');glow.addColorStop(1,'rgba(255,244,214,0)');
    ctx.fillStyle=glow;ctx.fillRect(250,0,262,240);
    ctx.fillStyle='#FFF4D8';ctx.beginPath();ctx.arc(385,105,34,0,Math.PI*2);ctx.fill();
    for(let i=0;i<13;i++){
      const x=i*42-10,w=34+random(`bw${i}`)*20,h=90+random(`bh${i}`)*190;
      ctx.fillStyle=i%2?'#101A3E':'#0C1433';ctx.fillRect(x,512-h,w,h);
      for(let row=0;row<h/22-1;row++)for(let col=0;col<3;col++)if(random(`bl${i}-${row}-${col}`)>.72){ctx.fillStyle=random(`bc${i}${row}${col}`)>.4?'#FFD79A':'#A9D3FF';ctx.fillRect(x+5+col*10,512-h+10+row*22,5,8);}
    }
  }),
  // Cork board: pinned notes, a calendar with the exam circled, a formula sheet.
  cork:paint(600,400,ctx=>{
    ctx.fillStyle='#A9794F';ctx.fillRect(0,0,600,400);
    for(let i=0;i<900;i++){ctx.fillStyle=`rgba(${random(`ck${i}`)>.5?'70,44,24':'214,170,120'},.22)`;ctx.fillRect(random(`cx${i}`)*600,random(`cy${i}`)*400,3,3);}
    ctx.strokeStyle='#5B3B24';ctx.lineWidth=16;ctx.strokeRect(8,8,584,384);
    const note=(x:number,y:number,w:number,h:number,color:string,tilt:number)=>{
      ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate(tilt);ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(-w/2+4,-h/2+5,w,h);ctx.fillStyle=color;ctx.fillRect(-w/2,-h/2,w,h);
      ctx.fillStyle='rgba(40,50,80,.5)';for(let line=0;line<Math.floor(h/18)-1;line++)ctx.fillRect(-w/2+10,-h/2+14+line*18,(w-20)*(.55+random(`nl${x}${line}`)*.45),4);
      ctx.fillStyle='#D8504A';ctx.beginPath();ctx.arc(0,-h/2+8,6,0,Math.PI*2);ctx.fill();ctx.restore();
    };
    note(38,40,120,110,'#FBE9A0',-.08);note(175,34,105,90,'#F7C5CF',.06);note(48,180,150,170,'#F4F6FB',.03);note(440,230,120,130,'#BFE3D9',-.05);
    ctx.fillStyle='#F8F8FA';ctx.fillRect(300,40,250,170);ctx.fillStyle='#C8473F';ctx.fillRect(300,40,250,34);
    ctx.fillStyle='#fff';ctx.font='bold 22px Microsoft YaHei';ctx.fillText('考试周',316,65);
    ctx.fillStyle='#4A5670';ctx.font='15px Segoe UI';
    for(let d=0;d<28;d++)ctx.fillText(String(d+1),312+d%7*34,100+Math.floor(d/7)*27);
    ctx.strokeStyle='#D8362F';ctx.lineWidth=3.5;ctx.beginPath();ctx.arc(424,149,15,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#D8504A';ctx.beginPath();ctx.arc(425,36,6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#F4F6FB';ctx.fillRect(230,240,180,120);ctx.fillStyle='#34456E';ctx.font='italic 26px Cambria Math';ctx.fillText("f′(x)=lim Δy/Δx",242,292);ctx.font='italic 22px Cambria Math';ctx.fillText('∫ f(x) dx',262,332);
  }),
  rug:paint(512,512,ctx=>{
    ctx.clearRect(0,0,512,512);
    [[250,'#27345C'],[232,'#D9A441'],[222,'#31436F'],[150,'#3A4F82'],[142,'#D9A441'],[134,'#2B3964'],[60,'#3A4F82']].forEach(([r,c])=>{ctx.fillStyle=c as string;ctx.beginPath();ctx.arc(256,256,r as number,0,Math.PI*2);ctx.fill();});
  }),
  // Bedside-style clock: the late hour sets up the "time is running out" beat.
  clock:paint(256,104,ctx=>{
    ctx.fillStyle='#070B18';ctx.fillRect(0,0,256,104);ctx.fillStyle='#8FE8FF';ctx.font='bold 74px Consolas';ctx.textAlign='center';ctx.fillText('23:47',128,79);
  }),
  page:paint(256,340,ctx=>{
    ctx.fillStyle='#F6F1E4';ctx.fillRect(0,0,256,340);ctx.fillStyle='#8FA3C8';
    for(let i=0;i<14;i++)ctx.fillRect(22,30+i*21,(212)*(.5+random(`pg${i}`)*.5),4);
    ctx.strokeStyle='#D8504A';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(120,160,70,16,-.1,0,Math.PI*2);ctx.stroke();
  }),
  // A star-map poster: a quiet hint of the knowledge sky to come.
  poster:paint(300,420,ctx=>{
    ctx.fillStyle='#101B45';ctx.fillRect(0,0,300,420);
    const stars=Array.from({length:9},(_,i)=>[40+random(`px${i}`)*220,50+random(`py${i}`)*280] as const);
    ctx.strokeStyle='rgba(180,200,255,.55)';ctx.lineWidth=1.5;ctx.beginPath();stars.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    stars.forEach(([x,y],i)=>{ctx.fillStyle=i%3?'#DCE6FF':'#FFD79A';ctx.beginPath();ctx.arc(x,y,3+i%3,0,Math.PI*2);ctx.fill();});
    ctx.fillStyle='#C9D6FF';ctx.font='bold 26px Microsoft YaHei';ctx.fillText('星图',24,392);
  }),
  planks:(()=>{const t=paint(512,512,ctx=>{
    ctx.fillStyle='#39405C';ctx.fillRect(0,0,512,512);
    for(let row=0;row<8;row++){ctx.fillStyle=`rgba(${row%2?'255,255,255':'0,0,0'},${.03+random(`fl${row}`)*.05})`;ctx.fillRect(0,row*64,512,64);ctx.fillStyle='rgba(8,10,24,.5)';ctx.fillRect(0,row*64,512,2);ctx.fillRect((row*173)%512,row*64,2,64);}
  });t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(5,5);return t;})(),
  // Soft dot used for lamp dust, the lamp glare and the fairy lights.
  glow:(()=>{const t=paint(128,128,ctx=>{const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);});t.colorSpace=SRGBColorSpace;return t;})(),
}),[]);

const BOOK_COLORS=['#C4574E','#D9A441','#3F7A8C','#6A5AA8','#E6DCC6','#3D6B58','#B8683C','#465A99'];
/** A row of books of varying height and thickness, starting at x and filling `width`. */
const Books:React.FC<{at:P;width:number;seed:string;depth?:number}>=({at,width,seed,depth=.2})=>{
  const books:React.ReactNode[]=[];let x=0,i=0;
  while(x<width-.03){
    const w=.035+random(`${seed}w${i}`)*.045,h=.2+random(`${seed}h${i}`)*.13,lean=random(`${seed}l${i}`)>.86?.22:0;
    books.push(<Box key={i} at={[at[0]+x+w/2+(lean?h*.1:0),at[1]+h/2,at[2]]} size={[w,h,depth-random(`${seed}d${i}`)*.04]} rot={[0,0,-lean]} color={BOOK_COLORS[Math.floor(random(`${seed}c${i}`)*BOOK_COLORS.length)]} rough={.7}/>);
    x+=w+.004+(lean?h*.2:0);i++;
  }
  return <>{books}</>;
};

const FileCard:React.FC<{at:P;rotation:P;label:string;name:string;color:string}>=({at,rotation,label,name,color})=>{
  const texture=useMemo(()=>paint(400,480,ctx=>{
    ctx.fillStyle='#e9edf6';ctx.fillRect(0,0,400,480);
    ctx.fillStyle=color;ctx.fillRect(0,0,400,155);
    ctx.fillStyle='white';ctx.font='bold 72px Segoe UI';ctx.fillText(label,32,110);
    ctx.fillStyle='#27354f';ctx.font='bold 42px Microsoft YaHei';ctx.fillText(name,32,229);
    ctx.fillStyle='#a4b1c8';
    for(let row=0;row<5;row++)ctx.fillRect(32,274+row*33,300-row*19,9);
  }),[label,name,color]);
  return <group position={at} rotation={rotation}>
    <Box at={[0,0,0]} size={[.46,.55,.024]} color="#b8c6e0"/>
    <mesh position={[0,0,.014]}><planeGeometry args={[.449,.539]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh>
  </group>;
};

export const StudyRoom:React.FC<{frame:number}>=({frame})=>{
  const tex=useTextures(),screen=useMonitorTexture(frame);
  const float=Math.sin(frame*.035)*.04;
  const dust=useMemo(()=>Array.from({length:46},(_,i)=>[random(`dx${i}`),random(`dy${i}`),random(`dz${i}`),random(`dp${i}`)] as const),[]);
  const lamp:P=[.82,1.83,-1.2]; // bulb position: light, cone and glare all start here
  // A spot light aims at an object; this one is never added to the scene, so its matrix is set by hand once.
  const aim=useMemo(()=>{const o=new Object3D();o.position.set(.2,.9,-.6);o.updateMatrixWorld();return o;},[]);

  return <>
    {/* ---------------- light ---------------- */}
    <ambientLight intensity={.5} color="#8EA2FF"/>
    <hemisphereLight args={['#6076C4','#2A2233',.55]}/>
    {/* moon through the window: from behind the scene toward the camera, so it rims hair and shoulders */}
    <directionalLight position={[-3.2,4.6,-5.5]} intensity={2.4} color="#8FA8FF"/>
    {/* soft fill from the camera side so backs of things keep their form */}
    <directionalLight position={[1.5,3.2,5]} intensity={1.15} color="#8896DC"/>
    <spotLight position={lamp} angle={.95} penumbra={.75} intensity={34} distance={7} decay={1.8} color="#FFB877" castShadow
      shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-.0006} shadow-normalBias={.02} target={aim}/>
    <pointLight position={[0,1.55,-1.05]} color="#9CC3FF" intensity={3.2} distance={3.6} decay={1.6}/>

    {/* ---------------- shell ---------------- */}
    <mesh position={[0,-.005,-.65]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[13,13]}/><meshStandardMaterial map={tex.planks} roughness={.82}/></mesh>
    <Box at={[0,2.65,-3.6]} size={[11,5.5,.1]} color="#26335A" cast={false}/>
    <Box at={[0,.07,-3.53]} size={[11,.14,.05]} color="#1B2442" cast={false}/>
    {[-1,1].map(side=><Box key={side} at={[side*4.75,2.65,-.9]} size={[.1,5.5,5.6]} color="#232F54" cast={false}/>)}

    {/* window with the night outside, sill, plant and curtains */}
    <Picture at={[-2.12,2.6,-3.52]} size={[2.3,2.2]} map={tex.night} lit={false}/>
    {[[-2.12,3.73,2.5,.09],[-2.12,1.47,2.5,.09],[-3.34,2.6,.09,2.35],[-.9,2.6,.09,2.35],[-2.12,2.6,.06,2.26],[-2.12,2.6,2.4,.06]].map(([x,y,w,h],i)=><Box key={i} at={[x,y,-3.47]} size={[w,h,.09]} color="#1E294B"/>)}
    <Box at={[-2.12,1.4,-3.34]} size={[2.66,.07,.34]} color="#5A5F82"/>
    <Can at={[-1.35,1.52,-3.32]} r={.085} rt={.11} h={.17} color="#C9764A"/>
    {[0,1,2,3,4,5].map(i=><Ball key={i} at={[-1.35+Math.cos(i*1.05)*.07,1.72+i%2*.05,-3.32+Math.sin(i*1.05)*.07]} size={[.03,.13,.05]} rot={[Math.sin(i*1.05)*.5,0,-Math.cos(i*1.05)*.5]} color={i%2?'#4F9A72':'#3B7A5A'} rough={.7}/>)}
    <Can at={[-2.12,3.95,-3.36]} r={.022} h={3.3} rot={[0,0,Math.PI/2]} color="#C9B18A" rough={.5}/>
    {[-3.5,-.74].map((x,k)=><group key={k}>{[0,1,2,3,4].map(i=><Can key={i} at={[x+(i-2)*.085,2.62,-3.36+(i%2)*.03]} r={.055} h={2.62} color={i%2?'#3E4E7C':'#35446F'} rough={.95}/>)}</group>)}

    {/* string lights along the wall */}
    {Array.from({length:21},(_,i)=>{
      // a shallow sag between three hooks, like a real garland
      const u=i/20,x=-4.3+u*8.6,y=4.08-Math.abs(Math.sin(u*Math.PI*3))*.2;
      return <group key={i} position={[x,y,-3.5]}>
        <mesh><sphereGeometry args={[.028,10,8]}/><meshBasicMaterial color={i%3?'#FFD79A':'#FFB6A0'} toneMapped={false}/></mesh>
        <sprite scale={.34}><spriteMaterial map={tex.glow} color={i%3?'#FFC979':'#FF9E86'} transparent opacity={.55} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
      </group>;
    })}

    {/* bookshelf in the left corner */}
    <group position={[-4.05,0,-3.28]}>
      <Box at={[0,1.5,0]} size={[1.1,3.0,.42]} color="#3A3552"/>
      <Box at={[0,1.5,.03]} size={[1.0,2.9,.4]} color="#262238"/>
      {[.06,.66,1.26,1.86,2.46].map((y,i)=><group key={i}>
        <Box at={[0,y,.05]} size={[1.0,.045,.4]} color="#4A4466"/>
        <Books at={[-.47,y+.022,.1]} width={i===2?.55:.92} seed={`shelf${i}`} depth={.24}/>
      </group>)}
      <Ball at={[.3,1.42,.12]} size={.12} color="#D9C7A6" rough={.5}/>
      <Can at={[.3,1.31,.12]} r={.07} h={.05} color="#6A5AA8"/>
    </group>

    {/* shelf, poster and cork board above the desk */}
    <Box at={[.2,2.62,-3.38]} size={[1.9,.05,.3]} color="#6B5A4E"/>
    <Books at={[-.7,2.645,-3.38]} width={1.05} seed="wall" depth={.2}/>
    <Can at={[.75,2.73,-3.38]} r={.07} rt={.09} h={.16} color="#E9DFCB"/>
    {[0,1,2,3,4].map(i=><Ball key={i} at={[.75+Math.cos(i*1.26)*.06,2.92+i%2*.04,-3.38+Math.sin(i*1.26)*.06]} size={[.028,.12,.045]} rot={[Math.sin(i*1.26)*.55,0,-Math.cos(i*1.26)*.55]} color={i%2?'#58A47A':'#3F7F5E'} rough={.7}/>)}
    <Picture at={[-.25,3.5,-3.53]} size={[.62,.87]} map={tex.poster}/>
    <Box at={[2.45,2.62,-3.53]} size={[1.62,1.1,.04]} color="#5B3B24"/>
    <Picture at={[2.45,2.62,-3.505]} size={[1.54,1.03]} map={tex.cork}/>

    {/* bed along the right wall */}
    <Box at={[3.72,.2,-2.3]} size={[1.9,.4,2.45]} color="#2B2742"/>
    <Box at={[3.72,.5,-2.3]} size={[1.84,.24,2.4]} color="#DCD6E6" rough={.95}/>
    <Box at={[3.72,.66,-1.85]} size={[1.9,.1,1.5]} color="#3D6E78" rough={.95}/>
    <Box at={[3.72,.72,-2.62]} size={[1.9,.06,.2]} color="#4E8A93" rough={.95}/>
    <Ball at={[3.72,.72,-3.22]} size={[.6,.13,.26]} color="#F1ECF5" rough={.95}/>
    <Box at={[3.72,1.0,-3.5]} size={[1.9,1.2,.1]} color="#3A3552"/>

    {/* rug, backpack, bin and the paper that missed it */}
    <mesh position={[0,.004,.3]} rotation={[-Math.PI/2,0,0]} receiveShadow><circleGeometry args={[1.75,64]}/><meshStandardMaterial map={tex.rug} roughness={.95} transparent/></mesh>
    <group position={[1.78,0,-.5]} rotation={[0,-.4,.06]}>
      <Ball at={[0,.33,0]} size={[.25,.33,.16]} color="#8E4A45" rough={.85}/>
      <Ball at={[0,.22,.13]} size={[.18,.15,.07]} color="#7A3D3A" rough={.85}/>
      <Tube a={[-.1,.62,0]} b={[.1,.62,0]} ra={.02} color="#2A2233"/>
      {[-1,1].map(side=><Tube key={side} a={[side*.13,.56,-.12]} b={[side*.15,.12,-.14]} ra={.022} color="#5E302E"/>)}
    </group>
    <Can at={[-1.95,.2,-.6]} r={.15} rt={.19} h={.4} open color="#46527E"/>
    {[[-1.62,-.25,.3],[-2.25,-.3,1.1],[-1.5,-.72,2.2],[-2.3,-.95,.7],[-1.92,-.6,1.7]].map(([x,z,r],i)=>
      <mesh key={i} position={[x,i===4?.38:.06,z]} rotation={[r,r*2,r*.5]} castShadow receiveShadow><icosahedronGeometry args={[.065,0]}/><meshStandardMaterial color="#EEF0F6" roughness={.9} flatShading/></mesh>)}

    {/* ---------------- desk ---------------- */}
    <Box at={[0,.884,-1.11]} size={[2.74,.088,1.58]} color="#8A6352" rough={.6}/>
    <Box at={[0,.851,-.315]} size={[2.74,.035,.018]} color="#C29472"/>
    <Box at={[-1.22,.42,-1.1]} size={[.1,.84,1.4]} color="#2F3856"/>
    <Box at={[.92,.44,-1.12]} size={[.7,.8,1.44]} color="#2F3856"/>
    {[.68,.42,.16].map(y=><group key={y}><Box at={[.92,y,-.395]} size={[.62,.22,.02]} color="#3B4670"/><Box at={[.92,y,-.38]} size={[.18,.025,.02]} color="#C9B18A" rough={.4}/></group>)}
    <Box at={[0,.5,-1.86]} size={[2.5,.6,.04]} color="#283150"/>

    {/* monitor: sized so that the student's head can cover it completely from behind */}
    <Box at={[0,.936,-1.64]} size={[.36,.022,.24]} color="#141B2D" rough={.4}/>
    <Box at={[0,1.12,-1.7]} size={[.07,.36,.05]} color="#141B2D" rough={.4}/>
    <Box at={[0,1.555,-1.65]} size={[.91,.6,.05]} color="#161D30" rough={.4}/>
    <mesh position={[0,1.555,-1.622]}><planeGeometry args={[.84,.525]}/>{SCREEN_TEST?<meshBasicMaterial color="#ff00ff" toneMapped={false}/>:<meshBasicMaterial map={screen} toneMapped={false}/>}</mesh>
    <mesh position={[.41,1.272,-1.622]}><circleGeometry args={[.006,10]}/><meshBasicMaterial color="#7CF0B4" toneMapped={false}/></mesh>
    <Box at={[.37,1.88,-1.62]} size={[.1,.09,.004]} rot={[0,0,.08]} color="#FBE38A" cast={false}/>
    <Box at={[-.37,1.88,-1.62]} size={[.09,.09,.004]} rot={[0,0,-.1]} color="#F4B4C4" cast={false}/>

    {/* keyboard, mouse and pad */}
    <Box at={[.5,.931,-.5]} size={[.34,.006,.28]} color="#252D47" rough={.95}/>
    <Box at={[-.1,.944,-.53]} size={[.66,.026,.22]} color="#232B44" rough={.5}/>
    {Array.from({length:52},(_,i)=><Box key={i} at={[-.1+(i%13-6)*.047,.962,-.6+Math.floor(i/13)*.048]} size={[.039,.012,.039]} color={i%13===12?'#E88F52':'#5A6A8A'} rough={.5} cast={false}/>)}
    <Ball at={[.5,.957,-.5]} size={[.04,.027,.064]} color="#E9DFCB" rough={.4}/>

    {/* lamp: base, two-part arm, shade, bulb, visible cone of light */}
    <Can at={[1.08,.94,-1.5]} r={.13} h={.03} color="#2A3350" rough={.4}/>
    <Tube a={[1.08,.95,-1.5]} b={[1.16,1.5,-1.5]} ra={.02} color="#3A4468" rough={.4}/>
    <Tube a={[1.16,1.5,-1.5]} b={[.9,1.9,-1.25]} ra={.02} color="#3A4468" rough={.4}/>
    <Ball at={[1.16,1.5,-1.5]} size={.035} color="#C9B18A" rough={.4}/>
    <group position={[.86,1.9,-1.22]} rotation={[.35,0,.5]}>
      <Can at={[0,-.02,0]} r={.17} rt={.05} h={.2} open color="#D9824C" rough={.5} emissive="#FF9A4A" glow={.25}/>
      <mesh position={[0,-.1,0]}><sphereGeometry args={[.05,14,10]}/><meshBasicMaterial color="#FFF1D0" toneMapped={false}/></mesh>
      {/* faint cone so the light reads in the air; additive and never writes depth */}
      <mesh position={[0,-.62,0]}><cylinderGeometry args={[.1,.62,1.1,32,1,true]}/><meshBasicMaterial color="#FFB877" transparent opacity={.05} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false}/></mesh>
    </group>
    <sprite position={lamp} scale={.75}><spriteMaterial map={tex.glow} color="#FFC98F" transparent opacity={.55} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>
    {dust.map(([x,y,z,phase],i)=>{
      // motes drift slowly inside the lamp cone
      const t=frame*.0035+phase;
      return <sprite key={i} position={[.45+x*.8+Math.sin(t*6+i)*.05,.98+((y+t)%1)*.8,-1.2+z*.8+Math.cos(t*5+i)*.05]} scale={.009+phase*.009}>
        <spriteMaterial map={tex.glow} color="#FFD9A8" transparent opacity={.38} blending={AdditiveBlending} depthWrite={false} toneMapped={false}/></sprite>;
    })}

    {/* small things that make it a lived-in desk */}
    <Can at={[-.78,.99,-.72]} r={.058} h={.12} color="#E9DFCB" rough={.4}/>
    <mesh position={[-.845,.99,-.72]} rotation={[Math.PI/2,0,0]} castShadow><torusGeometry args={[.036,.011,8,18]}/><meshStandardMaterial color="#E9DFCB" roughness={.4}/></mesh>
    <Can at={[-.78,1.045,-.72]} r={.05} h={.004} color="#5A3A2A"/>
    {[0,1,2].map(i=>{const t=((frame*.012+i*.33)%1);return <sprite key={i} position={[-.78+Math.sin(t*5+i)*.03,1.07+t*.26,-.72]} scale={.07+t*.1}><spriteMaterial map={tex.glow} color="#DDE6FF" transparent opacity={.16*(1-t)} depthWrite={false} toneMapped={false}/></sprite>;})}
    <Box at={[-1.02,.945,-1.02]} size={[.44,.035,.32]} rot={[0,.18,0]} color="#465A99" rough={.7}/>
    <Box at={[-1.0,.98,-1.02]} size={[.42,.035,.3]} rot={[0,.3,0]} color="#C4574E" rough={.7}/>
    <Box at={[-1.03,1.013,-1.02]} size={[.38,.03,.28]} rot={[0,.1,0]} color="#E6DCC6" rough={.7}/>
    <Picture at={[-.62,.931,-.5]} size={[.3,.4]} map={tex.page} rot={[-Math.PI/2,0,.22]}/>
    <Tube a={[-.5,.94,-.38]} b={[-.38,.94,-.52]} ra={.008} color="#D8504A" rough={.4}/>
    <Can at={[-1.1,.99,-1.55]} r={.06} h={.12} color="#3F7A8C" rough={.5}/>
    {[['#D9A441',-.03,.1],['#C4574E',.03,-.12],['#E6DCC6',0,.2],['#465A99',-.02,-.2]].map(([c,x,tilt],i)=><Tube key={i} a={[-1.1+(x as number),1.0,-1.55]} b={[-1.1+(x as number)+(tilt as number)*.3,1.2,-1.55+(i-1.5)*.02]} ra={.008} color={c as string} rough={.4}/>)}
    <Box at={[-.68,.975,-1.62]} size={[.26,.1,.08]} color="#11172A" rough={.4}/>
    <Picture at={[-.68,.975,-1.578]} size={[.23,.085]} map={tex.clock} lit={false}/>
    <Box at={[.86,.936,-.62]} size={[.085,.01,.17]} rot={[0,-.3,0]} color="#0E1322" rough={.3}/>

    {/* ---------------- chair ---------------- */}
    <Box at={[0,.41,.12]} size={[.62,.1,.58]} color="#2C3A5E" rough={.9}/>
    <Ball at={[0,.86,.44]} size={[.27,.23,.055]} color="#3A4A78" rough={.9}/>
    <Tube a={[0,.44,.4]} b={[0,.72,.47]} ra={.03} color="#1A2238" rough={.4}/>
    <Can at={[0,.23,.12]} r={.035} h={.3} color="#8A93AE" rough={.3}/>
    {[0,1,2,3,4].map(i=>{const a=i*Math.PI*2/5+.3,end:P=[Math.cos(a)*.34,.05,.12+Math.sin(a)*.34];return <group key={i}><Tube a={[0,.09,.12]} b={end} ra={.022} color="#1A2238" rough={.4}/><Ball at={[end[0],.035,end[2]]} size={.035} color="#0E1322" rough={.4}/></group>;})}

    {/* course files float around the student in the first shot, then shrink away */}
    {frame<225&&<group scale={linear(frame,199,224,1,.01)}>
      <FileCard at={[-1.63,1.35+float,-.73]} rotation={[.10,.25,-.18]} label="PDF" name="课程讲义" color="#b55060"/>
      <FileCard at={[-1.14,1.92-float,-.86]} rotation={[.04,.21,.09]} label="PPTX" name="课堂课件" color="#b37145"/>
      <FileCard at={[1.28,1.64+float,-.61]} rotation={[.14,-.20,-.13]} label="DOCX" name="复习提纲" color="#4875b4"/>
      <FileCard at={[1.71,1.15-float,-.51]} rotation={[-.04,-.18,.18]} label="MD" name="课后笔记" color="#468c88"/>
    </group>}
  </>;
};
