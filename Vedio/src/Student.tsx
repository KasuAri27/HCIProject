import React,{useMemo} from 'react';
import {CatmullRomCurve3,DoubleSide,LatheGeometry,Quaternion,TubeGeometry,Vector2,Vector3} from 'three';

// The student of the opening, modelled from primitives only (no imported
// assets): face with glasses, layered hair, headphones, a hoodie with hood,
// hem and cuffs, jointed arms with fingered hands, trousers and sneakers.
// Limbs are posed by placing shoulder, elbow and wrist (hip, knee, ankle)
// explicitly, so each pose keeps believable bone lengths.

export type P=[number,number,number];
const UP=new Vector3(0,1,0);
export const smooth=(t:number)=>{const x=Math.min(1,Math.max(0,t));return x*x*(3-2*x);};
const mix=(a:P,b:P,t:number):P=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const add=(a:P,b:P):P=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];

const COLOR={hoodie:'#D19A3E',hoodieDark:'#A9772B',skin:'#E2AC8F',skinShade:'#C98F76',hair:'#40343C',hairLight:'#5C4A52',
  pants:'#262E49',shoe:'#EFE9DD',sole:'#F8F5EE',accent:'#E88F52',phones:'#E9DFCB',band:'#2B3350',frame:'#20263A'};

type Look={color:string;rough?:number;emissive?:string;glow?:number};
const Mat:React.FC<Look&{double?:boolean}>=({color,rough=.78,emissive,glow=0,double})=>
  <meshStandardMaterial color={color} roughness={rough} emissive={emissive??'#000'} emissiveIntensity={glow} side={double?DoubleSide:undefined}/>;

/** Ellipsoid. `size` is the half-extent on each axis. */
export const Ball:React.FC<Look&{at:P;size:P|number;rot?:P}>=({at,size,rot,...look})=>
  <mesh position={at} scale={size} rotation={rot} castShadow receiveShadow><sphereGeometry args={[1,28,20]}/><Mat {...look}/></mesh>;

/** Tapered limb from a to b with rounded ends; ra is the radius at a, rb at b. */
export const Tube:React.FC<Look&{a:P;b:P;ra:number;rb?:number}>=({a,b,ra,rb=ra,...look})=>{
  const span=new Vector3(...b).sub(new Vector3(...a)),length=Math.max(.0001,span.length());
  return <group>
    <mesh position={mix(a,b,.5)} quaternion={new Quaternion().setFromUnitVectors(UP,span.normalize())} castShadow receiveShadow>
      <cylinderGeometry args={[rb,ra,length,18,1,true]}/><Mat {...look}/>
    </mesh>
    <Ball at={a} size={ra} {...look}/><Ball at={b} size={rb} {...look}/>
  </group>;
};

/** Palm, four two-segment fingers and a thumb. `dir` is where the fingers point, `up` the back of the hand. */
const Hand:React.FC<{at:P;dir:P;up:P;side:number;curl:number}>=({at,dir,up,side,curl})=>{
  const d=new Vector3(...dir).normalize(),u=new Vector3(...up).normalize(),s=new Vector3().crossVectors(d,u).normalize();
  const point=(forward:number,lift:number,across:number):P=>[at[0]+d.x*forward+u.x*lift+s.x*across,at[1]+d.y*forward+u.y*lift+s.y*across,at[2]+d.z*forward+u.z*lift+s.z*across];
  return <group>
    <Tube a={point(-.012,0,-.022)} b={point(.046,0,-.022)} ra={.026} color={COLOR.skin} rough={.6}/>
    <Tube a={point(-.012,0,.022)} b={point(.046,0,.022)} ra={.026} color={COLOR.skin} rough={.6}/>
    {[0,1,2,3].map(i=>{
      const across=(i-1.5)*.021,reach=i===0||i===3?.036:.043;
      const knuckle=point(.056,0,across),middle=point(.056+reach,-curl*.022,across),tip=point(.056+reach+.03*(1-curl*.7),-curl*.052,across);
      return <group key={i}><Tube a={knuckle} b={middle} ra={.0125} color={COLOR.skin} rough={.6}/><Tube a={middle} b={tip} ra={.0115} rb={.0105} color={COLOR.skin} rough={.6}/></group>;
    })}
    {/* the thumb sits on the inner edge, which is opposite for the two hands */}
    <Tube a={point(.006,-.006,-side*.034)} b={point(.046,-.02-curl*.012,-side*.056)} ra={.015} rb={.012} color={COLOR.skin} rough={.6}/>
  </group>;
};

const useGeometry=()=>useMemo(()=>{
  // Hoodie body: radius against height above the hips, later flattened front to back.
  const torso=new LatheGeometry([[0,-.11],[.2,-.11],[.272,-.05],[.292,.05],[.286,.25],[.292,.45],[.312,.58],[.302,.66],[.24,.725],[.135,.775],[.092,.8]].map(([r,y])=>new Vector2(r,y)),40);
  torso.computeVertexNormals();
  // One stray lock of hair standing up from the crown.
  const strand=new TubeGeometry(new CatmullRomCurve3([new Vector3(0,0,0),new Vector3(.012,.06,.012),new Vector3(.05,.1,.03),new Vector3(.085,.095,.04)]),14,.011,8);
  return {torso,strand};
},[]);

// Pivot of the upper body: the hips. Everything above is authored upright
// relative to this point and then leaned forward as one piece.
const HIP:P=[0,.6,.36];
/** Where an upper-body point ends up after leaning by `lean` and rising by `rise`. */
const leaned=(p:P,lean:number,rise:number):P=>{
  const y=p[1]-HIP[1],z=p[2]-HIP[2],c=Math.cos(lean),s=Math.sin(lean);
  return [p[0],HIP[1]+rise+y*c+z*s,HIP[2]+z*c-y*s];
};
// The whole figure is slid toward the desk so the hands reach the keyboard.
export const STUDENT_Z=-.25;
/** Seated head centre in world space; the camera of the opening orbits this point. */
export const HEAD_SEATED:P=add(leaned([0,1.7,.2],.1,0),[0,0,STUDENT_Z]);

export const Student:React.FC<{frame:number;star:boolean}>=({frame,star})=>{
  const {torso,strand}=useGeometry();
  const standing=star?smooth((frame-651)/57):0;      // gets up among the stars
  const holding=frame<225?1-smooth((frame-187)/36):0; // head in hands at the start
  const seated=1-standing;
  const lean=(.1+.17*holding)*seated,rise=.49*standing;
  const breath=Math.sin(frame*.07)*.004;
  const W=(p:P)=>leaned(p,lean,rise);
  const typing=seated*(1-holding);

  const head=W([0,1.7+breath,.2]);
  const nod=holding*.2+typing*Math.sin(frame*.031)*.03,turn=Math.sin(frame*.024)*.24*standing+typing*Math.sin(frame*.017)*.05;
  const hip=(side:number):P=>[side*.14,.58+rise,.31+.02*standing];

  return <group position={[0,0,STUDENT_Z]}>
    {/* ---- legs: hip, knee and ankle placed for sitting, blended to standing ---- */}
    {[-1,1].map(side=>{
      const knee=mix([side*.19,.6,-.12],[side*.145,.6,.33],standing),ankle=mix([side*.19,.16,-.07],[side*.145,.15,.35],standing);
      const toe:P=[ankle[0]+side*.012,.06,ankle[2]-.15];
      return <group key={side}>
        <Tube a={hip(side)} b={knee} ra={.128} rb={.108} color={COLOR.pants}/>
        <Tube a={knee} b={ankle} ra={.102} rb={.078} color={COLOR.pants}/>
        <Tube a={add(ankle,[0,.02,0])} b={add(ankle,[0,-.03,0])} ra={.07} color="#F3EFE6" rough={.9}/>
        <Ball at={[ankle[0],.085,ankle[2]-.055]} size={[.074,.066,.15]} color={COLOR.shoe} rough={.7}/>
        <Ball at={toe} size={[.07,.05,.07]} color={COLOR.shoe} rough={.7}/>
        <mesh position={[ankle[0],.028,ankle[2]-.06]} castShadow receiveShadow><boxGeometry args={[.142,.05,.31]}/><Mat color={COLOR.sole} rough={.85}/></mesh>
        <Ball at={[ankle[0]+side*.066,.09,ankle[2]-.05]} size={[.012,.03,.07]} color={COLOR.accent} rough={.6}/>
      </group>;
    })}
    <Ball at={[0,.6+rise,.335]} size={[.275,.165,.205]} color={COLOR.pants}/>

    {/* ---- upper body, authored upright and leaned from the hips ---- */}
    <group position={[0,HIP[1]+rise,HIP[2]]} rotation={[-lean,0,0]}>
      <mesh geometry={torso} position={[0,0,-.07]} scale={[1,1+breath*2,.7]} castShadow receiveShadow><Mat color={COLOR.hoodie} rough={.86} double/></mesh>
      <mesh position={[0,-.075,-.07]} rotation={[Math.PI/2,0,0]} scale={[1,.7,1]} castShadow><torusGeometry args={[.268,.036,12,40]}/><Mat color={COLOR.hoodieDark} rough={.9}/></mesh>
      {[-1,1].map(side=><Ball key={side} at={[side*.292,.655,-.11]} size={[.135,.125,.13]} color={COLOR.hoodie} rough={.86}/>)}
      {/* front pocket and drawstrings */}
      <Ball at={[0,.13,-.265]} size={[.17,.085,.03]} color={COLOR.hoodieDark} rough={.9}/>
      {[-1,1].map(side=><Tube key={side} a={[side*.05,.72,-.25]} b={[side*.06,.52,-.275]} ra={.007} color="#F2E6CF" rough={.9}/>)}
      {/* hood: rolled collar round the neck plus the pouch hanging behind */}
      <mesh position={[0,.795,-.105]} rotation={[Math.PI/2-.18,0,0]} scale={[1.08,1,1]} castShadow receiveShadow><torusGeometry args={[.158,.074,14,36]}/><Mat color={COLOR.hoodie} rough={.88}/></mesh>
      <Ball at={[0,.77,.08]} size={[.25,.115,.115]} rot={[.35,0,0]} color={COLOR.hoodie} rough={.88}/>
      <Ball at={[0,.68,.115]} size={[.2,.12,.07]} rot={[.2,0,0]} color={COLOR.hoodieDark} rough={.9}/>
      <Tube a={[0,.76,-.12]} b={[0,.93,-.15]} ra={.088} rb={.08} color={COLOR.skin} rough={.6}/>

      <group position={[0,1.1+breath,-.16]} rotation={[nod,turn,holding*-.05]}>
        <Ball at={[0,0,0]} size={[.226,.252,.236]} color={COLOR.skin} rough={.58}/>
        <Ball at={[0,-.135,-.045]} size={[.158,.115,.16]} color={COLOR.skin} rough={.58}/>
        {/* face looks toward -z */}
        {[-1,1].map(side=><group key={side}>
          <Ball at={[side*.088,.006,-.218]} size={[.03,.04,.014]} color="#1A1F33" rough={.25}/>
          <Ball at={[side*.079,.02,-.231]} size={.008} color="#FFFFFF" rough={.2} emissive="#FFFFFF" glow={.6}/>
          <Tube a={[side*.047,.076,-.224]} b={[side*.128,.082,-.2]} ra={.0085} color={COLOR.hair}/>
          <Ball at={[side*.128,-.066,-.186]} size={[.036,.022,.012]} color="#E9A493" rough={.7}/>
          <Ball at={[side*.228,-.006,.006]} size={[.034,.06,.044]} color={COLOR.skinShade} rough={.6}/>
          {/* round glasses: rim and temple */}
          <mesh position={[side*.088,.006,-.236]} rotation={[0,side*.2,0]}><torusGeometry args={[.052,.0065,8,28]}/><Mat color={COLOR.frame} rough={.35}/></mesh>
          <Tube a={[side*.138,.012,-.222]} b={[side*.226,.018,-.02]} ra={.0055} color={COLOR.frame} rough={.35}/>
        </group>)}
        <Tube a={[-.036,.01,-.247]} b={[.036,.01,-.247]} ra={.0055} color={COLOR.frame} rough={.35}/>
        <Ball at={[0,-.046,-.244]} size={[.022,.027,.026]} color={COLOR.skinShade} rough={.6}/>
        <Tube a={[-.03,-.118,-.213]} b={[.03,-.118,-.213]} ra={.0075} color="#A85C57" rough={.6}/>

        {/* hair: a cap tilted back over the skull, bulk at the nape, a fringe and loose locks */}
        <mesh position={[0,.03,.012]} rotation={[.62,0,0]} scale={[.285,.288,.288]} castShadow><sphereGeometry args={[1,36,24,0,Math.PI*2,0,Math.PI*.6]}/><Mat color={COLOR.hair} rough={.5} double/></mesh>
        <Ball at={[0,-.06,.14]} size={[.268,.215,.15]} color={COLOR.hair} rough={.5}/>
        <Ball at={[0,-.2,.12]} size={[.2,.1,.1]} color={COLOR.hair} rough={.5}/>
        {[-.17,-.09,0,.085,.165].map((x,i)=><Ball key={i} at={[x,.15-Math.abs(x)*.28,-.212+Math.abs(x)*.42]} size={[.074,.086-i%2*.012,.056]} rot={[.5,0,x*-1.6]} color={i%2?COLOR.hairLight:COLOR.hair} rough={.5}/>)}
        {/* locks down the back of the head: they catch the rim light, so the back view reads as hair, not a ball */}
        {[-1.4,-1.12,-.84,-.56,-.28,0,.28,.56,.84,1.12,1.4].map((a,i)=><Ball key={`lock${i}`} at={[Math.sin(a)*.258,-.01-Math.abs(a)*.02+(i%2)*.02,.028+Math.cos(a)*.246]} size={[.062,.2-(i%3)*.02,.03]} rot={[.12,a,0]} color={i%2?COLOR.hair:COLOR.hairLight} rough={.42}/>)}
        {[-.7,-.23,.23,.7].map((a,i)=><Ball key={`nape${i}`} at={[Math.sin(a)*.22,-.2,.05+Math.cos(a)*.2]} size={[.065,.1,.045]} rot={[.3,a,0]} color={i%2?COLOR.hairLight:COLOR.hair} rough={.42}/>)}
        {[-1,1].map(side=><Ball key={side} at={[side*.236,.02,-.09]} size={[.05,.14,.085]} rot={[.2,0,side*.1]} color={COLOR.hair} rough={.5}/>)}
        {[[-.09,.292,.05,.4],[.06,.302,.02,-.3],[.0,.298,.11,.1]].map(([x,y,z,r],i)=><Ball key={i} at={[x,y,z]} size={[.075,.035,.085]} rot={[0,0,r]} color={COLOR.hairLight} rough={.5}/>)}
        <mesh geometry={strand} position={[-.02,.295,.03]} castShadow><Mat color={COLOR.hair} rough={.5}/></mesh>

        {/* headphones: band over the crown, padded cups over the ears */}
        <mesh position={[0,.012,.008]} castShadow><torusGeometry args={[.305,.021,10,40,Math.PI]}/><Mat color={COLOR.band} rough={.45}/></mesh>
        <mesh position={[0,.012,.008]}><torusGeometry args={[.291,.012,8,40,Math.PI]}/><Mat color="#4A5478" rough={.8}/></mesh>
        {[-1,1].map(side=><group key={side} position={[side*.292,-.01,.008]} rotation={[0,0,Math.PI/2]}>
          <mesh castShadow><cylinderGeometry args={[.09,.09,.062,28]}/><Mat color={COLOR.phones} rough={.5}/></mesh>
          {/* the group is turned so its +y points to -x: the cushion goes on the head side, the cap outside */}
          <mesh position={[0,side*.036,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.07,.026,10,28]}/><Mat color={COLOR.band} rough={.9}/></mesh>
          <mesh position={[0,-side*.033,0]}><cylinderGeometry args={[.05,.05,.008,24]}/><Mat color={COLOR.accent} rough={.5}/></mesh>
        </group>)}
      </group>
    </group>

    {/* ---- arms: shoulder fixed to the leaned body, elbow and wrist blended between poses ---- */}
    {[-1,1].map(side=>{
      const shoulder=W([side*.31,1.25,.25]);
      // Left hand rests on the keyboard, right hand on the mouse; fingers tap while typing.
      const tap=Math.sin(frame*.9+side)*.004*typing;
      const deskElbow:P=[side*(side>0?.5:.42),1.0,.06],deskWrist:P=[side>0?.47:-.2,.992+tap,-.24];
      const headElbow:P=[side*.52,head[1]-.2,head[2]+.04],headWrist:P=[side*.238,head[1]+.02,head[2]-.02];
      const sideElbow:P=[side*.375,1.46,.3],sideWrist:P=[side*.365,1.19,.24];
      const elbow=mix(mix(deskElbow,headElbow,holding),sideElbow,standing),wrist=mix(mix(deskWrist,headWrist,holding),sideWrist,standing);
      const cuff=mix(elbow,wrist,.8);
      // Fingers point forward over the desk, up along the head, or down when standing.
      const dir=mix(mix([side*-.15,-.12,-1],[side*-.5,.85,-.1],holding),[0,-1,-.12],standing);
      const up=mix(mix([0,1,-.1],[side*-.9,-.2,.3],holding),[side,0,0],standing);
      return <group key={side}>
        <Tube a={shoulder} b={elbow} ra={.118} rb={.102} color={COLOR.hoodie} rough={.86}/>
        <Tube a={elbow} b={cuff} ra={.1} rb={.084} color={COLOR.hoodie} rough={.86}/>
        <Tube a={cuff} b={mix(elbow,wrist,.93)} ra={.074} rb={.068} color={COLOR.hoodieDark} rough={.9}/>
        <Hand at={wrist} dir={dir} up={up} side={side} curl={mix([.55,0,0],[.35,0,0],holding)[0]*(1-standing)+.45*standing}/>
      </group>;
    })}
  </group>;
};

