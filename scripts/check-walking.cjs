const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('esbuild');
const mod = { exports: {} };
new Function('module', 'exports', transformSync(fs.readFileSync('src/main/petWalking.ts', 'utf8'), { loader:'ts', format:'cjs' }).code)(mod,mod.exports);
const { PetWalker } = mod.exports;
const area = { x:-1200, y:0, width:1200, height:900 };
const initial = { x:-700, y:500, width:170, height:204 };
function simulate(scale=1) {
  const walker=new PetWalker(); let bounds={...initial};
  walker.step({now:0,bounds,area,enabled:true,blocked:true,scale});
  for(let now=20;now<=6000;now+=20) bounds=walker.step({now,bounds,area,enabled:true,blocked:false,scale}).bounds;
  return {walker,bounds};
}
const normal=simulate(), large=simulate(2);
assert.equal(normal.walker.walking,true);
assert.ok(normal.bounds.x<initial.x);
assert.equal(normal.bounds.y,initial.y);
assert.ok(Math.abs((initial.x-large.bounds.x)-2*(initial.x-normal.bounds.x))<=1);
let {walker,bounds}=normal;
let state=walker.step({now:6020,bounds,area,enabled:true,blocked:true,scale:1});
assert.equal(state.walking,false);assert.deepEqual(state.bounds,bounds);
state=walker.step({now:6100,bounds,area,enabled:true,blocked:false,scale:1});
assert.equal(state.walking,false,'Interacting gives five seconds of rest');
state=walker.step({now:12000,bounds,area,enabled:false,blocked:false,scale:1});
assert.equal(state.walking,false);
const edgeWalker=new PetWalker();bounds={...initial,x:area.x};let directions=new Set();
for(let now=0;now<=120000;now+=20){
 state=edgeWalker.step({now,bounds,area:{...area,width:260},enabled:true,blocked:false,scale:1});bounds=state.bounds;
 if(state.walking)directions.add(state.direction);
 if (bounds.x===area.x) assert.equal(state.direction,'right','Left edge must turn right immediately');
 if (bounds.x===area.x+260-bounds.width) assert.equal(state.direction,'left','Right edge must turn left immediately');
 assert.ok(bounds.x>=area.x && bounds.x+bounds.width<=area.x+260);
 assert.equal(bounds.y,initial.y);
}
assert.deepEqual([...directions].sort(),['left','right']);
const sleeper=new PetWalker();state=sleeper.step({now:0,bounds:initial,area,enabled:true,blocked:false,scale:1});
state=sleeper.step({now:3600000,bounds:state.bounds,area,enabled:true,blocked:false,scale:1});
assert.ok(Math.abs(state.bounds.x-initial.x)<=4,'Wake from sleep must not jump');
const narrow=new PetWalker().step({now:0,bounds:initial,area:{...area,width:100},enabled:true,blocked:false,scale:1});
assert.equal(narrow.walking,false);
// 在大屏上超过原来的 12 秒周期，仍应向左，直到真的抵达左边缘。
const patrol=new PetWalker();
const wideArea={x:0,y:0,width:4000,height:1800};
bounds={x:2800,y:350,width:170,height:204};
let reachedLeft=false, sawRight=false;
for(let now=0;now<120000;now+=20){
 const previous=bounds;
 state=patrol.step({now,bounds,area:wideArea,enabled:true,blocked:false,scale:1});bounds=state.bounds;
 assert.equal(state.walking,true,'No timed stops on the way to an edge');
 assert.equal(bounds.y,350);
 if(bounds.x===0) reachedLeft=true;
 if(state.direction==='right') {assert.ok(reachedLeft,'Cannot reverse before reaching left edge');sawRight=true;break;}
 assert.ok(bounds.x<=previous.x);
}
assert.ok(sawRight);
patrol.restart();
state=patrol.step({now:130000,bounds:{...bounds,x:1500,y:240},area:wideArea,enabled:true,blocked:false,scale:1});
assert.equal(state.direction,'left','Re-enabling starts left even after previously heading right');
// 模拟 Windows 每次位置读取多出一个 y 像素和尺寸误差，绝不能逐帧累积。
for(const scale of [0.5,1,1.25,1.5,2]) for(const y of [20,240,500]) {
 const stable=new PetWalker();let current={x:2800,y,width:Math.round(170*scale),height:Math.round(204*scale)};
 for(let now=0;now<20000;now+=20){
  state=stable.step({now,bounds:current,area:wideArea,enabled:true,blocked:false,scale});
  assert.equal(state.bounds.y,y,'Keep the original walking altitude at scale '+scale);
  assert.equal(state.bounds.width,Math.round(170*scale));
  assert.equal(state.bounds.height,Math.round(204*scale));
  current={...state.bounds,y:state.bounds.y+1,width:state.bounds.width+1,height:state.bounds.height+1};
 }
}
const speedWalker=new PetWalker();bounds={...initial};
speedWalker.step({now:0,bounds,area,enabled:true,blocked:false,scale:1});
for(let now=20;now<=1000;now+=20)bounds=speedWalker.step({now,bounds,area,enabled:true,blocked:false,scale:1}).bounds;
assert.equal(initial.x-bounds.x,80,'Cover 80 DIP per second');
console.log('PASS: fixed altitude under repeated DPI drift; left-first edge-to-edge patrol and 80 DIP/s; left/right patrol, negative display coordinates, edge turns, scale-aware speed, pause/resume, disabled mode and sleep handling');
