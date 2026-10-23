import fs from 'node:fs';import {Plant} from './dist/engine.mjs';
const code=JSON.parse(fs.readFileSync(new URL('./dist/assets/ladder.json',import.meta.url)));const bytes=fs.readFileSync(new URL('./dist/assets/engine.wasm',import.meta.url));
const tests=[];
async function fresh(){let {instance}=await WebAssembly.instantiate(bytes,{});instance.exports._initialize?.();return new Plant(instance.exports,code)}
function run(p,n){for(let i=0;i<n/10;i++)p.tick()}
async function running(){let p=await fresh();p.command('safety');run(p,700);if(!p.command('start'))throw Error('not ready');run(p,100);return p}
function assert(v,msg){if(!v)throw Error(msg)}
async function test(name,fn){await fn();tests.push({name,result:'PASS'})}
await test('No automatic startup and all real Y locked',async()=>{let p=await fresh();run(p,1000);assert(!p.snapshot().run,'auto start');assert(Object.entries(p.plc.v).filter(([k])=>k.startsWith('Y')).every(([,v])=>!v),'real output')});
await test('Mixed caps: PASS, A, A missed/B; tail motor and Home cycle',async()=>{let p=await running();p.auto=true;run(p,11000);p.auto=false;run(p,6500);let s=p.snapshot();assert(s.passed>=2&&s.rejectA>=2&&s.rejectB>=1,JSON.stringify(s));assert(!s.boardFault&&!s.plcFault,'unexpected fault');assert(p.trace.some(s=>s.tail),'tail never ran')});
for(const [mode,code] of [['pc_lost',1],['vision_timeout',7],['encoder_stall',2],['b_miss',13]])await test(mode+' faults and drops motor',async()=>{let p=await running();p.pattern='B';p.command('feed');p.faultMode=mode;run(p,6500);let s=p.snapshot();assert(s.boardFault===code&&s.run===0&&s.enable===0,JSON.stringify(s))});
await test('Air loss and receiving sensor jam stop via Ladder',async()=>{for(const mode of ['air_lost','tail_jam']){let p=await running();p.faultMode=mode;run(p,5500);assert(!p.snapshot().run&&p.snapshot().plcFault===(mode==='air_lost'?105:106),mode)}});
await test('E-stop feedback, release, safety reset, fault reset: no auto restart',async()=>{let p=await running();p.command('estop');run(p,50);assert(!p.snapshot().run,'estop');p.command('estop');p.command('safety');p.command('reset');run(p,700);assert(!p.snapshot().run&&p.plc.v.M0,'reset recovery')});
await test('STOP invalidates in-flight cap; restart requires queue clear',async()=>{let p=await running();p.command('feed');run(p,100);p.command('stop');run(p,100);assert(p.dirty&&!p.command('start'),'dirty restart');p.command('reset');run(p,700);assert(!p.dirty&&!p.snapshot().run,'reset failed')});
await test('Returned external PLC data gates motion; stale bridge cannot run',async()=>{let p=await fresh();p.external={values:{M503:1,M505:1},stale:true};run(p,100);assert(!p.g(0),'stale enabled')});
fs.writeFileSync(new URL('./Web_Engine_Test_Report.json',import.meta.url),JSON.stringify({method:'Actual WebAssembly C core and browser Ladder interpreter in Node, no hardware/GX connection',tests},null,2));console.log(JSON.stringify(tests,null,2));
