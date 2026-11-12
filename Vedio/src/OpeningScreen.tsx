import {useLayoutEffect,useMemo} from 'react';
import {CanvasTexture,SRGBColorSpace} from 'three';

const width=960,height=600;
const colors=['#17847c','#8154b6','#346cc0'];

function drawTools(ctx:CanvasRenderingContext2D, tab:number, frame:number){
  const names=['函数工具','绘图工具','编程工具'];
  const accent=colors[tab];
  ctx.fillStyle='#e9edf7';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#17213e';ctx.fillRect(0,0,width,112);
  ctx.font='bold 36px Microsoft YaHei';ctx.fillStyle='#f5f8ff';
  ctx.fillText(names[tab],36,53);
  ctx.font='22px Microsoft YaHei';ctx.fillStyle='#aabbd3';
  ctx.fillText('课程练习 / '+['函数关系','坐标与向量','数值计算'][tab],37,89);
  names.forEach((name,i)=>{
    ctx.fillStyle=i===tab?accent:'#d4dced';ctx.fillRect(36+i*196,132,178,47);
    ctx.fillStyle=i===tab?'#fff':'#26314e';ctx.fillText(name,56+i*196,164);
  });
  ctx.fillStyle=tab===2?'#1c2440':'#fbfcff';ctx.fillRect(36,202,888,357);
  if(tab===2){
    const rows=['def slope(f, x, h=0.001):','    return (f(x + h) - f(x)) / h','','for x in range(5):','    print(slope(lambda t: t*t, x))','','>>> 0.001   2.001   4.001   6.001'];
    ctx.font='27px Consolas';
    rows.forEach((line,i)=>{ctx.fillStyle=i===6?'#91e8c8':i===0?'#c5b3ff':'#e4edfa';ctx.fillText(line,68,246+i*44);});
    return;
  }
  ctx.strokeStyle='#dee4ef';ctx.lineWidth=2;
  for(let x=76;x<920;x+=44){ctx.beginPath();ctx.moveTo(x,220);ctx.lineTo(x,541);ctx.stroke();}
  for(let y=232;y<550;y+=38){ctx.beginPath();ctx.moveTo(53,y);ctx.lineTo(910,y);ctx.stroke();}
  ctx.strokeStyle='#8e9cba';
  ctx.beginPath();ctx.moveTo(54,407);ctx.lineTo(911,407);ctx.moveTo(458,220);ctx.lineTo(458,542);ctx.stroke();
  ctx.strokeStyle=accent;ctx.lineWidth=7;ctx.beginPath();
  if(tab===0){
    for(let x=68;x<900;x+=7){
      const y=407-106*Math.sin((x-459)/118+frame*.018);
      if(x===68)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
  }else{
    ctx.moveTo(252,489);ctx.lineTo(459,273);ctx.lineTo(697,490);ctx.closePath();
    ctx.fillStyle='#8154b62d';ctx.fill();
  }
  ctx.stroke();
}

function drawDocument(ctx:CanvasRenderingContext2D, seconds:number){
  ctx.fillStyle='#c8d1e2';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#202a44';ctx.fillRect(0,0,width,88);
  ctx.font='bold 29px Microsoft YaHei';ctx.fillStyle='#fff';
  ctx.fillText('高等数学 · 导数与变化率.pdf',36,55);
  // Integrate an increasing speed so page movement accelerates continuously.
  const scroll=seconds*36+seconds**3*45;
  const sheetHeight=540;
  const first=Math.floor(scroll/sheetHeight);
  ctx.save();ctx.beginPath();ctx.rect(0,88,width,512);ctx.clip();
  for(let page=first;page<=first+2;page++){
    const top=102+page*sheetHeight-scroll;
    ctx.fillStyle='#fdfdff';ctx.fillRect(91,top,778,516);
    ctx.fillStyle='#243558';ctx.font='bold 32px Microsoft YaHei';
    ctx.fillText(`第 ${page+1} 节　${['瞬时变化率','导数的定义','极限与连续性','隐函数求导'][page%4]}`,135,top+56);
    ctx.fillStyle='#546580';ctx.font='21px Microsoft YaHei';
    ctx.fillText('设函数在点 x 的某邻域内有定义，考察函数增量与自变量增量之比。',135,top+105);
    ctx.fillText('当增量趋近于零时，若极限存在，则该极限称为导数。',135,top+140);
    ctx.fillStyle='#e8eef9';ctx.fillRect(135,top+167,684,68);
    ctx.font='30px Cambria Math';ctx.fillStyle='#334c79';
    ctx.fillText("f′(x) = limₕ→₀ [ f(x + h) − f(x) ] / h",170,top+210);
    for(let line=0;line<7;line++){
      ctx.fillStyle=line===3?'#c7d5eb':'#dce3ef';
      ctx.fillRect(135,top+270+line*29,630-(line*53+page*17)%157,8);
    }
    ctx.font='18px Microsoft YaHei';ctx.fillStyle='#60708a';ctx.fillText(String(page+1),773,top+492);
  }
  ctx.restore();
  ctx.fillStyle='#a9b8cc';ctx.fillRect(931,96,8,485);
  ctx.fillStyle='#476b96';ctx.fillRect(931,102+Math.min(first,38)*10,8,48);
}

export function useMonitorTexture(frame:number){
  const {canvas,texture}=useMemo(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const texture=new CanvasTexture(canvas);
    texture.colorSpace=SRGBColorSpace;
    return {canvas,texture};
  },[]);
  useLayoutEffect(()=>{
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    if(frame>=454)drawDocument(ctx,Math.max(0,(frame-503)/30));
    else drawTools(ctx,frame<273?0:frame<337?1:2,frame);
    texture.needsUpdate=true;
  },[canvas,texture,frame]);
  return texture;
}
