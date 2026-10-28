const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {buildSync}=require('esbuild');
const {chromium}=require('./browser-runtime.cjs');
const output=path.resolve('output/walking-app');fs.mkdirSync(output,{recursive:true});
const images=direction=>Array.from({length:6},(_,i)=>pathToFileURL(path.resolve('src/renderer/public/character/default/walk-'+direction,String(i+1).padStart(2,'0')+'.png')).href);
const poses={idle:{kind:'image',src:pathToFileURL(path.resolve('src/renderer/public/character/default/blink.webp')).href},'walk-left':{kind:'anim',frames:images('left'),frameMs:120},'walk-right':{kind:'anim',frames:images('right'),frameMs:120}};
buildSync({stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import App from './src/renderer/App';
window.callbacks={};window.readyStates=[];
const stores={growth:{xp:0,level:1,snacks:{chocobi:0,chips:0,pudding:0},unlocked:[],interactionCount:0},outfit:{costume:'default',accessory:'none',scene:'none'},state:{firstLaunchAt:Date.now(),lastInteractionAt:Date.now(),emotion:'curious',totalInteractions:0},log:[]};
window.petAPI=new Proxy({getData:async key=>stores[key],setData:async()=>({ok:true}),listCostumeAssets:async()=>({poses:${JSON.stringify(poses)},random:[],timed:[]}),getWalkingState:async()=>({enabled:true,walking:false,direction:'left',reminderActive:false,intervalMinutes:60,nextReminderAt:3600000}),dismissWalkingReminder:async()=>{window.dismissed=true;return {enabled:true,walking:false,direction:'left',reminderActive:false,intervalMinutes:60,nextReminderAt:Date.now()+3600000}},setWalkingReady:ready=>window.readyStates.push(ready),friendsUnread:async()=>0,setWindowSize:async()=>null,setTransparentPassthrough:()=>{}},{get:(target,key)=>target[key]??(String(key).startsWith('on')?(cb=>{window.callbacks[key]=cb;return ()=>{}}):async()=>({ok:true}))});
createRoot(document.getElementById('root')).render(<App/>);
`,loader:'tsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',outfile:path.join(output,'app.js')});
fs.writeFileSync(path.join(output,'index.html'),'<html><head><link rel="stylesheet" href="app.css"><style>html,body,#root{width:300px;height:430px;margin:0}</style></head><body><div id="root"></div><script src="app.js"></script></body></html>');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,args:['--allow-file-access-from-files']});try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(path.join(output,'index.html')).href);
 await page.waitForFunction(()=>window.readyStates.includes(true),{},{timeout:10000});
 assert.equal(await page.locator('[data-pet-stage]').count(),1);
 for(const direction of ['left','right']){
  await page.evaluate(direction=>window.callbacks.onWalkingState({enabled:true,walking:true,direction,reminderActive:true,intervalMinutes:60,nextReminderAt:null}),direction);
  await page.waitForFunction(direction=>document.querySelectorAll('img').length===6 && [...document.querySelectorAll('img')].every(image=>image.src.includes('walk-'+direction)&&image.complete),direction);
 }
 assert.equal(await page.locator('[data-break-reminder]').count(),1);
 assert.ok((await page.locator('[data-break-reminder]').innerText()).includes('放松一下眼睛'));
 const strip=await page.locator('[data-break-reminder]').boundingBox();
 assert.ok(strip.height<=30 && strip.width>strip.height*5,'Reminder must be a compact single-line strip');
 await page.evaluate(()=>window.callbacks.onWalkingState({enabled:true,walking:false,direction:'right',reminderActive:true,intervalMinutes:60,nextReminderAt:null}));
 assert.equal(await page.locator('img').count(),6,'Pausing movement must retain walking appearance');
 assert.equal(await page.locator('[data-break-reminder]').count(),1);
 await page.screenshot({path:path.join(output,'reminder-strip.png'),omitBackground:true});
 const point=await page.locator('img').evaluateAll(images=>{
  const image=images.find(image=>getComputedStyle(image).opacity==='1');const rect=image.getBoundingClientRect();
  const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
  return {x:rect.x+(rect.width-image.naturalWidth*scale)/2+image.naturalWidth*scale/2,y:rect.y+(rect.height-image.naturalHeight*scale)/2+image.naturalHeight*scale/2};
 });
 await page.mouse.dblclick(point.x,point.y,{delay:80});
 await page.waitForFunction(()=>window.dismissed===true);
 assert.equal(await page.locator('[data-break-reminder]').count(),0);
 await page.waitForFunction(()=>document.querySelectorAll('img').length===1 && document.querySelector('img').src.endsWith('blink.webp'));
 assert.deepEqual(errors,[]);console.log('PASS: actual App first-launch greeting expires, walking readiness, left/right animation selection, reminder text, real double-click dismissal and idle restoration');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
