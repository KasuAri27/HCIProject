import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

// Resolve the renderer shipped with this exact CLI version, avoiding an extra
// separately-versioned rendering dependency in the application project.
const require=createRequire(import.meta.url);
const cliRequire=createRequire(require.resolve('@remotion/cli'));
const {bundle}=cliRequire('@remotion/bundler');
const {openBrowser,selectComposition,renderStill,renderMedia}=cliRequire('@remotion/renderer');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const output=path.join(root,'output');
fs.mkdirSync(output,{recursive:true});
const browserExecutable=process.env.VIDEO_BROWSER || 'D:/Dev/tool/hci-ci/browsers/chromium-1248/chrome-win64/chrome.exe';
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.ts'),outDir:path.join(output,'render-bundle'),publicDir:path.join(root,'public'),onProgress:p=>{if(p===100)console.log('Bundle ready');}});
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
const common={serveUrl,puppeteerInstance:browser,chromiumOptions:{gl:'angle'},browserExecutable};
try{
  const composition=await selectComposition({...common,id:'StudyFilm'});
  if(process.argv[2]==='preview'){
    const frames=(process.argv.slice(3).length?process.argv.slice(3).map(Number):[90,255,375,495,615,735,870,1160,1510,1840,2220,2520,2720,3000,3180,3300,3400,3540]);
    for(const frame of frames){
      await renderStill({...common,composition,frame,imageFormat:'png',output:path.join(output,`frame-${String(frame).padStart(4,'0')}.png`)});
      console.log(`Preview ${frame} / ${(frame/30).toFixed(1)}s`);
    }
  }else{
    let last=-1;
    await renderMedia({...common,composition,codec:'h264',audioCodec:'aac',crf:18,pixelFormat:'yuv420p',concurrency:3,outputLocation:path.join(output,'study-film-2min.mp4'),onProgress:p=>{
      const step=Math.floor(p.progress*20);if(step!==last){last=step;console.log(`Rendering ${step*5}% (${p.renderedFrames}/3600 frames)`);}
    }});
    console.log('Completed output/study-film-2min.mp4');
  }
}finally{await browser.close({silent:true});}
