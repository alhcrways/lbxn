const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { chromium } = require('./browser-runtime.cjs');
const output = path.resolve('output/pet-hit-test');
fs.mkdirSync(output, { recursive: true });
buildSync({ stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import PetStage from './src/renderer/components/PetStage';
const canvas = document.createElement('canvas'); canvas.width=100; canvas.height=100;
const ctx=canvas.getContext('2d'); ctx.fillStyle='red'; ctx.fillRect(30,20,40,60);
const image=canvas.toDataURL();
window.calls=[]; window.ignoreChanges=[];
window.petAPI={setPetPointerHeld:()=>{},onCursorPosition:cb=>{window.cursorAt=cb;return ()=>{}},setTransparentPassthrough:flag=>window.ignoreChanges.push(flag),onFriendsUnread:()=>()=>{},friendsUnread:async()=>0,dragStart:async()=>{window.calls.push('start')},dragEnd:async()=>{window.calls.push('end')},openMenu:async()=>{}};
const root=createRoot(document.getElementById('root'));
window.renderPet=(asset)=>root.render(<PetStage pose="idle" bubble={null} emotion="happy" scene="none" costume="default" accessory="none" poseAsset={asset} onGesture={()=>{}} onDragPose={()=>{}} onNavigate={()=>{}} chatOpen={false} onChatOpenChange={()=>{}}/>);
window.renderPet({kind:'image',src:image});
`, loader:'tsx', resolveDir: process.cwd() }, bundle:true, outfile:path.join(output,'test.js'), jsx:'automatic' });
fs.writeFileSync(path.join(output,'index.html'), '<html><head><link rel="stylesheet" href="test.css"><style>html,body,#root{margin:0;width:300px;height:430px}</style></head><body><div id="root"></div><script src="test.js"></script></body></html>');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:600,height:900}});
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.join(output,'index.html')).href);
  await page.waitForFunction(()=>document.querySelector('img')?.complete);
  async function drag(x,y){await page.evaluate(()=>{window.calls=[]}); await page.mouse.move(x,y); await page.mouse.down(); await page.mouse.move(x+15,y+10,{steps:3}); await page.mouse.up(); return page.evaluate(()=>window.calls);}
  async function ignoredAt(x,y) {
    await page.evaluate(({x,y})=>window.cursorAt({x,y}), {x,y});
    return page.evaluate(()=>window.ignoreChanges.at(-1));
  }
  assert.equal(await ignoredAt(10,10),true, 'Blank must enable native passthrough');
  const chat=page.getByRole('button',{name:'和小新聊天',exact:true});
  assert.equal(await chat.isVisible(),false,'Chat icon must be hidden away from character');
  await page.mouse.move(10,10);
  assert.equal(await chat.isVisible(),false,'Hover over transparent stage must not reveal chat');
  assert.deepEqual(await drag(10,10),[], 'Window blank must not drag');
  let box=await page.locator('img').boundingBox();
  assert.equal(await ignoredAt(box.x+5,box.y+box.height/2),true);
  assert.equal(await ignoredAt(box.x+box.width/2,box.y+box.height/2),false, 'Character must recover interaction');
  assert.equal(await chat.isVisible(),true,'Character hover reveals chat');
  const chatBox=await chat.boundingBox();
  await ignoredAt(chatBox.x+chatBox.width/2,chatBox.y+chatBox.height/2);
  assert.equal(await chat.isVisible(),true,'Moving to chat button keeps it clickable');
  await chat.focus();
  await ignoredAt(10,10);
  assert.equal(await chat.isVisible(),false,'Stale keyboard/window focus must not keep chat showing');
  assert.deepEqual(await drag(box.x+5,box.y+box.height/2),[], 'Transparent pixels inside image must not drag');
  assert.deepEqual(await drag(box.x+box.width/2,box.y+box.height/2),['start','end'], 'Opaque character must drag');
  await page.evaluate(()=>{
    const button=document.createElement('button');button.id='test-control';button.style.cssText='position:fixed;left:0;top:0;width:30px;height:30px';document.body.append(button);
  });
  assert.equal(await ignoredAt(15,15),false, 'Functional buttons must stay interactive');
  await page.evaluate(()=>document.getElementById('test-control').remove());
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  assert.equal(await ignoredAt(10,10),false, 'Pointer capture must prevent passthrough mid-drag');
  await page.mouse.up();
  assert.equal(await ignoredAt(10,10),true);
  await page.evaluate(()=>{document.getElementById('root').style.zoom='1.5'});
  box=await page.locator('img').boundingBox();
  assert.deepEqual(await drag(box.x+5,box.y+box.height/2),[]);
  assert.deepEqual(await drag(box.x+box.width/2,box.y+box.height/2),['start','end']);
  await page.evaluate(()=>window.renderPet(undefined));
  await page.waitForSelector('svg[aria-label="小新（占位形象）"]');
  box=await page.locator('svg[aria-label="小新（占位形象）"]').boundingBox();
  assert.deepEqual(await drag(box.x+3,box.y+3),[], 'SVG blank must not drag');
  assert.deepEqual(await drag(box.x+box.width/2,box.y+box.height*0.4),['start','end'], 'SVG character must drag');
  for (const direction of ['left','right']) {
    const frames=Array.from({length:6},(_,i)=>require('node:url').pathToFileURL(path.resolve('src/renderer/public/character/default/walk-'+direction,String(i+1).padStart(2,'0')+'.png')).href);
    await page.evaluate(frames=>window.renderPet({kind:'anim',frames,frameMs:120}),frames);
    await page.waitForFunction(()=>document.querySelectorAll('img').length===6 && [...document.querySelectorAll('img')].every(image=>image.complete && image.naturalWidth===543));
    await ignoredAt(10,10);
    assert.equal(await chat.isVisible(),false,'Walking animation must not show chat when cursor is away');
    const sources=new Set();
    for(let i=0;i<9;i++) {
      sources.add(await page.locator('img').evaluateAll(images=>images.find(image=>getComputedStyle(image).opacity==='1').src));
      await page.waitForTimeout(90);
    }
    assert.equal(sources.size,6,'Walking must cycle through all six '+direction+' frames');
    await page.screenshot({path:path.join(output,'walking-'+direction+'.png'),omitBackground:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: automatic passthrough, recovery on character, buttons and drag capture; actual PetStage drag events; window blank, image alpha, character pixels, 150% zoom and SVG fallback');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
