import fs from 'node:fs';import {PLC} from './dist/engine.mjs';
const code=JSON.parse(fs.readFileSync(new URL('./PLC/W1_instruction_code.json',import.meta.url)));const tests=[];
const assert=(v,m)=>{if(!v)throw Error(m)};
function setup(){let p=new PLC(code);p.scan();p.v.M7000=0;p.v.M7001=1;Object.assign(p.v,{X0:1,X1:1,X2:0,X10:1,X12:1,X13:1,X14:1,X16:1,X17:1});return p}
function run(p,ms,web=true){for(let i=0;i<ms/10;i++){if(i%10===0){p.v.X2=1-p.v.X2;if(web)p.v.D7200=(p.v.D7200||0)+1}p.scan()}}
function test(name,fn){fn();tests.push({name,result:'PASS'})}
test('Startup disables remote and clears stale requests',()=>{let p=new PLC(code);Object.assign(p.v,{M7190:1,M7200:1,M7223:1});p.scan();assert(!p.v.M7190&&!p.v.M1&&!p.v.M7223&&p.v.D7190===23107,'startup')});
test('Remote START rejected until physical remote enable and heartbeat',()=>{let p=setup();run(p,700);p.v.M7200=1;p.scan();assert(!p.v.M1,'unauthorized');p.v.M7190=1;run(p,200);p.v.M7200=1;p.scan();assert(p.v.M1&&p.v.M503&&p.v.M7223,'not started')});
test('Web heartbeat loss faults 108 and drops enable; reset never restarts',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.M7200=1;p.scan();assert(p.v.M1,'not started');run(p,700,false);assert(p.v.D30===108&&!p.v.M1&&!p.v.M505,'timeout');run(p,300);p.v.M7202=1;p.scan();run(p,300);assert(!p.v.M1&&p.v.D30===0,'reset restart')});
test('STOP physical input overrides remote START in same scan',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.X10=0;p.v.M7200=1;p.scan();assert(!p.v.M1,'stop lost')});
test('Withdrawing remote permission during remote run stops',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.M7200=1;p.scan();p.v.M7190=0;p.scan();assert(p.v.D30===108&&!p.v.M1,'permission')});
function onFor(p,dev,ms){let n=0;for(let i=0;i<ms/10;i++){if(i%10===0){p.v.X2=1-p.v.X2;p.v.D7200=(p.v.D7200||0)+1}p.scan();if(p.v[dev])n+=10}return n}
test('W2 reject A: one web request lights Y15 once for ~0.5 s, request auto-clears',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.M7230=1;let on=onFor(p,'Y15',1500);assert(on>=480&&on<=520,'Y15 on '+on+'ms');assert(!p.v.M7230&&!p.v.Y15&&!p.v.Y16,'not cleared');assert(!p.v.Y1&&!p.v.Y2,'valve outputs must stay off')});
test('W2 reject B lights Y16 only',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.M7231=1;let b=onFor(p,'Y16',1500);assert(b>=480&&b<=520&&!p.v.Y15,'Y16 on '+b)});
test('W2 two rejects in a row give two separate flashes',()=>{let p=setup();p.v.M7190=1;run(p,700);let edges=0,prev=0;for(let k=0;k<2;k++){p.v.M7230=1;for(let i=0;i<100;i++){if(i%10===0){p.v.X2=1-p.v.X2;p.v.D7200=(p.v.D7200||0)+1}p.scan();if(p.v.Y15&&!prev)edges++;prev=p.v.Y15}}assert(edges===2,'flashes '+edges)});
test('W2 lamp refused without remote enable, in SIM mode, or without hardware arm',()=>{
 let p=setup();run(p,700);p.v.M7230=1;assert(onFor(p,'Y15',800)===0,'no remote enable');
 p=setup();p.v.M7190=1;p.v.M7000=1;run(p,700);p.v.M7230=1;assert(onFor(p,'Y15',800)===0,'SIM mode');
 p=setup();p.v.M7190=1;p.v.M7001=0;run(p,700);p.v.M7230=1;assert(onFor(p,'Y15',800)===0,'not armed')});
test('W2 indicator lamps work on a training kit with safety inputs X16/X17 not wired',()=>{let p=setup();p.v.M7190=1;Object.assign(p.v,{X16:0,X17:0});run(p,700);p.v.M7231=1;assert(onFor(p,'Y16',1500)>=480,'Y16 needs no safety')});
test('W2 web heartbeat loss turns a lit reject lamp off immediately',()=>{let p=setup();p.v.M7190=1;run(p,700);p.v.M7230=1;onFor(p,'Y15',50);assert(p.v.Y15,'lamp not started');run(p,600,false);assert(!p.v.Y15&&!p.v.M7232,'lamp not cut')});
// ---- W3 training kit: X0 START / X1 STOP buttons, Y5 RUN lamp / Y6 STOP lamp, linked to the web ----
// Buttons are released (X0=X1=0); the web link is alive (remote enable + heartbeat) and hardware is armed.
function kit(){let p=setup();Object.assign(p.v,{X0:0,X1:0,M7190:1});run(p,700);return p}
function press(p,x,ms=100,web=true){p.v[x]=1;run(p,ms,web);p.v[x]=0;run(p,100,web)}
const lamps=p=>(p.v.Y5?'RUN':'')+(p.v.Y6?'STOP':'')||'OFF';
test('W3 power-up: stopped, Y6 on, Y5 off',()=>{let p=kit();assert(!p.v.M7235&&lamps(p)==='STOP','lamps '+lamps(p))});
test('W3 press X0: Y5 on and stays on after release (latched)',()=>{let p=kit();press(p,'X0');run(p,1000);assert(p.v.M7235&&lamps(p)==='RUN','lamps '+lamps(p))});
test('W3 press X1: Y6 on, Y5 off, stays stopped',()=>{let p=kit();press(p,'X0');press(p,'X1');run(p,1000);assert(!p.v.M7235&&lamps(p)==='STOP','lamps '+lamps(p))});
test('W3 a 1-scan (10 ms) tap on X0 still starts',()=>{let p=kit();p.v.X0=1;p.scan();p.v.X0=0;run(p,300);assert(lamps(p)==='RUN','short tap lost')});
test('W3 X0 and X1 pressed together: STOP wins',()=>{let p=kit();p.v.X0=1;p.v.X1=1;run(p,200);p.v.X0=0;p.v.X1=0;run(p,200);assert(lamps(p)==='STOP','start won')});
test('W3 holding X0 does not restart after X1 (edge-only start)',()=>{let p=kit();p.v.X0=1;run(p,200);assert(lamps(p)==='RUN','no start');press(p,'X1');run(p,500);assert(lamps(p)==='STOP','restarted while X0 held')});
test('W3 X0 ignored without the web link (no remote enable or no heartbeat)',()=>{let p=kit();p.v.M7190=0;run(p,100);press(p,'X0');assert(lamps(p)==='STOP','started without remote enable');p=kit();run(p,700,false);press(p,'X0',100,false);assert(!p.v.M7235,'started without web heartbeat')});
test('W3 web link lost while running → stops by itself within 0.6 s',()=>{let p=kit();press(p,'X0');assert(lamps(p)==='RUN','no start');run(p,600,false);assert(!p.v.M7235&&lamps(p)==='STOP','still RUN after link loss')});
test('W3 web START/STOP requests drive the same latch and auto-clear',()=>{let p=kit();p.v.M7236=1;run(p,100);assert(lamps(p)==='RUN'&&!p.v.M7236,'web start');p.v.M7237=1;run(p,100);assert(lamps(p)==='STOP'&&!p.v.M7237,'web stop')});
test('W3 SIM mode or not armed: both lamps off and X0 does nothing',()=>{let p=kit();p.v.M7000=1;run(p,100);press(p,'X0');assert(lamps(p)==='OFF'&&!p.v.M7235,'SIM mode '+lamps(p));p=kit();p.v.M7001=0;run(p,100);press(p,'X0');assert(lamps(p)==='OFF'&&!p.v.M7235,'not armed '+lamps(p))});
test('W3 reject lamps Y15/Y16 still work while the kit is running',()=>{let p=kit();press(p,'X0');p.v.M7230=1;assert(onFor(p,'Y15',1500)>=480&&lamps(p)==='RUN','Y15 during run')});
test('Program has exactly one OUT coil per Y output (no double coils)',()=>{const n={};for(const [op,a] of code)if(op==='OUT'&&/^Y/.test(a[0]))n[a[0]]=(n[a[0]]||0)+1;const dup=Object.entries(n).filter(([,c])=>c>1);assert(!dup.length,'double coil '+JSON.stringify(dup))});
fs.writeFileSync(new URL('./PLC/W1_Mailbox_Test_Report.json',import.meta.url),JSON.stringify({method:'Instruction-level independent interpreter; native GX compilation/hardware NOT verified',tests},null,2));console.log(tests);
