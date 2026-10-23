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
fs.writeFileSync(new URL('./PLC/W1_Mailbox_Test_Report.json',import.meta.url),JSON.stringify({method:'Instruction-level independent interpreter; native GX compilation/hardware NOT verified',tests},null,2));console.log(tests);
