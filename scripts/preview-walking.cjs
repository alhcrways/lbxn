// 将已有透明 PNG 帧封装为 APNG 预览，不重新绘制角色。
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./browser-runtime.cjs');
function crc32(buffer){let crc=0xffffffff;for(const value of buffer){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc])}
function chunks(png){const items=[];for(let pos=8;pos<png.length;){const length=png.readUInt32BE(pos);items.push({type:png.toString('ascii',pos+4,pos+8),data:png.subarray(pos+8,pos+8+length)});pos+=12+length}return items}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage();
  const frames=Array.from({length:6},(_,i)=>fs.readFileSync(path.resolve('src/renderer/public/character/default/walk-right',String(i+1).padStart(2,'0')+'.png')).toString('base64'));
  const encoded=await page.evaluate(async frames=>{
    const result=[];
    for(const frame of frames){const image=new Image();image.src='data:image/png;base64,'+frame;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=360;canvas.height=230;const ctx=canvas.getContext('2d');
      ctx.drawImage(image,195,15,145,193);ctx.save();ctx.translate(165,0);ctx.scale(-1,1);ctx.drawImage(image,0,15,145,193);ctx.restore();
      result.push(canvas.toDataURL('image/png').split(',')[1]);
    }
    return result;
  },frames);
  const pngs=encoded.map(frame=>chunks(Buffer.from(frame,'base64')));
  const output=[Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',pngs[0].find(item=>item.type==='IHDR').data)];
  const animation=Buffer.alloc(8);animation.writeUInt32BE(6);output.push(chunk('acTL',animation));let sequence=0;
  for(let i=0;i<6;i++){
    const control=Buffer.alloc(26);control.writeUInt32BE(sequence++,0);control.writeUInt32BE(360,4);control.writeUInt32BE(230,8);control.writeUInt16BE(120,20);control.writeUInt16BE(1000,22);control[24]=0;control[25]=0;
    output.push(chunk('fcTL',control));
    for(const item of pngs[i].filter(item=>item.type==='IDAT')){
      if(i===0)output.push(chunk('IDAT',item.data));else {const seq=Buffer.alloc(4);seq.writeUInt32BE(sequence++);output.push(chunk('fdAT',Buffer.concat([seq,item.data])))}
    }
  }
  output.push(chunk('IEND',Buffer.alloc(0)));fs.writeFileSync('assets/walking/walking-preview.png',Buffer.concat(output));
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
