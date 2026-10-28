// 从 ImageGen 的 3×2 精灵表提取帧；统一画布和脚底位置，左向帧为右向帧镜像。
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('./browser-runtime.cjs');
const sheet = path.resolve('assets/walking/walk-sheet-default-palette.png');
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(sheet).href);
    const frames = await page.evaluate(async () => {
      const image = document.querySelector('img'); await image.decode();
      const w=image.naturalWidth/3,h=image.naturalHeight/2;
      const frames=[];
      for(let i=0;i<6;i++) {
        const cell=document.createElement('canvas');cell.width=w;cell.height=h;
        const context=cell.getContext('2d');context.drawImage(image,-(i%3)*w,-Math.floor(i/3)*h);
        const data=context.getImageData(0,0,w,h).data;
        let left=w,top=h,right=-1,bottom=-1;
        for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(data[(y*w+x)*4+3]>16) {
          left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        }
        if(right<left)throw Error('Empty cell '+i);
        frames.push({cell,box:{left,top,width:right-left+1,height:bottom-top+1}});
      }
      // 一个固定比例贯穿六帧，避免逐帧缩放引起头部大小变化。
      const scale=Math.min(651/Math.max(...frames.map(f=>f.box.height)),515/Math.max(...frames.map(f=>f.box.width)));
      return frames.map(({cell,box})=>{
        const canvas=document.createElement('canvas');canvas.width=543;canvas.height=724;
        const ctx=canvas.getContext('2d');
        const width=box.width*scale,height=box.height*scale;
        ctx.drawImage(cell,box.left,box.top,box.width,box.height,(543-width)/2,690-height,width,height);
        const right=canvas.toDataURL('image/png');
        const mirror=document.createElement('canvas');mirror.width=543;mirror.height=724;
        const mirrored=mirror.getContext('2d');mirrored.translate(543,0);mirrored.scale(-1,1);mirrored.drawImage(canvas,0,0);
        return {right,left:mirror.toDataURL('image/png'),box};
      });
    });
    for(const direction of ['left','right']) {
      const folder=path.resolve('src/renderer/public/character/default/walk-'+direction);
      fs.mkdirSync(folder,{recursive:true});
      frames.forEach((frame,i)=>fs.writeFileSync(path.join(folder,String(i+1).padStart(2,'0')+'.png'),Buffer.from(frame[direction].split(',')[1],'base64')));
      fs.writeFileSync(path.join(folder,'frame.txt'),'120\n');
    }
    console.log(JSON.stringify(frames.map(frame=>frame.box)));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
