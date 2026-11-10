// Training kit ladder (PLC/TrainingKit) - instruction-level interpreter test.
// Native GX Works3 compilation and the real FX5U high-speed counter are NOT verified here.
import fs from 'node:fs';
const code=JSON.parse(fs.readFileSync(new URL('./PLC/TrainingKit/TK_instruction_code.json',import.meta.url)));
const assert=(v,m)=>{if(!v)throw Error(m)};
const trunc=x=>x<0?Math.ceil(x):Math.floor(x);
class Kit{
 constructor(){this.v={};this.t={};this.prev={};this.first=true;this.hsc=0;this.hscOn=false;}
 read(a){return a.startsWith('K')?Number(a.slice(1)):(this.v[a]||0)}
 at(d,n){return d.replace(/\d+$/,m=>String(+m+n))}
 scan(dt=.01){Object.assign(this.v,{SM400:1,SM402:+this.first,SM412:+(Math.floor(this.ms/500)%2===0)});
  let r=false,stack=[],logic=false;const cmp={'>':(a,b)=>a>b,'>=':(a,b)=>a>=b,'<':(a,b)=>a<b};
  for(let pc=0;pc<code.length;pc++){const [op,a]=code[pc];if(op==='END')break;
   let m=op.match(/^(LD|AND|OR)D(>=|>|<)$/);
   if(m){const val=cmp[m[2]](this.read(a[0]),this.read(a[1]));if(m[1]==='LD'){if(logic)stack.push(r);r=val;logic=true}else r=m[1]==='AND'?r&&val:r||val;continue}
   if(['LD','LDI','LDP'].includes(op)){if(logic)stack.push(r);let val=!!this.read(a[0]);if(op==='LDI')val=!val;if(op==='LDP'){const old=this.prev[pc]||false;this.prev[pc]=val;val=val&&!old}r=val;logic=true;}
   else if(['AND','ANI','OR','ORI'].includes(op)){let val=!!this.read(a[0]);if(op==='ANI'||op==='ORI')val=!val;r=op==='AND'||op==='ANI'?r&&val:r||val}
   else if(op==='ORB')r=stack.pop()||r;
   else{logic=false;const d=a[0];switch(op){
    case 'OUT':if(d.startsWith('T')){this.t[d]=r?(this.t[d]||0)+dt:0;this.v[d]=+(r&&this.t[d]+1e-9>=this.read(a[1])*.1)}else this.v[d]=+r;break;
    case 'SET':if(r)this.v[d]=1;break;case 'RST':if(r)this.v[d]=0;break;
    case 'ZRST':if(r)for(let n=+d.slice(1);n<=+a[1].slice(1);n++)this.v[d[0]+n]=0;break;
    case 'DMOV':if(r)this.v[a[1]]=this.read(d);break;
    case 'DSUB':if(r)this.v[a[2]]=this.read(d)-this.read(a[1]);break;
    case 'DMUL':if(r)this.v[a[2]]=this.read(d)*this.read(a[1]);break;
    case 'DDIV':if(r){const b=this.read(a[1]);if(b===0)throw Error('DDIV by zero (operation error)');const x=this.read(d);this.v[a[2]]=trunc(x/b);this.v[this.at(a[2],2)]=x-trunc(x/b)*b}break;
    case 'HIOEN':if(r&&d==='K0'&&this.read(a[1])&4)this.hscOn=true;break;          // bit2 = HSC CH3
    case 'DHCMOV':if(r){if(d==='SD4560')this.v[a[1]]=this.hsc;else if(a[1]==='SD4560')this.hsc=this.read(d);else throw Error('DHCMOV '+a)}break;
    default:throw Error('Unsupported instruction '+op);
   }}
  }if(stack.length)throw Error('stack');this.first=false;this.ms+=dt*1000;
 }
}
// Healthy kit: STOP (NC) and overload (NC) closed, nothing pressed.
function kit(){const p=new Kit();p.ms=0;Object.assign(p.v,{X7:0,X10:1,X11:0,X15:1});p.scan();return p}
function run(p,ms,turn=0){for(let i=0;i<ms/10;i++){if(p.hscOn)p.hsc+=turn;p.scan()}}   // turn = counts per 10 ms scan
function press(p,x,ms=100){p.v[x]=x==='X10'||x==='X15'?0:1;run(p,ms);p.v[x]=x==='X10'||x==='X15'?1:0;run(p,50)}
const tests=[];function test(name,fn){fn();tests.push({name,result:'PASS'})}

test('Power up: motor OFF, READY lamp on, HSC CH3 started, PPR=600',()=>{const p=kit();assert(!p.v.Y3&&!p.v.Y10&&p.v.Y11&&!p.v.Y12,'lamps');assert(p.hscOn&&p.v.D130===600,'hsc/ppr')});
test('START held while powering up does not run the motor',()=>{const p=new Kit();p.ms=0;Object.assign(p.v,{X7:1,X10:1,X15:1});run(p,300);assert(!p.v.Y3,'ran on power-up')});
test('Press START: motor runs and stays on after release (seal-in), RUN lamp',()=>{const p=kit();press(p,'X7');run(p,1000);assert(p.v.Y3&&p.v.Y10&&!p.v.Y11,'not sealed')});
test('Press STOP: motor stops and stays stopped',()=>{const p=kit();press(p,'X7');press(p,'X10');run(p,500);assert(!p.v.Y3&&!p.v.M10&&p.v.Y11,'not stopped')});
test('STOP and START pressed together: STOP wins',()=>{const p=kit();p.v.X10=0;p.v.X7=1;run(p,200);assert(!p.v.Y3,'start won')});
test('Holding START does not restart after STOP (edge only)',()=>{const p=kit();p.v.X7=1;run(p,100);assert(p.v.Y3,'no start');press(p,'X10');run(p,300);assert(!p.v.Y3,'restarted while START held')});
test('Broken STOP wire (NC open) stops motor and blocks START',()=>{const p=kit();press(p,'X7');p.v.X10=0;run(p,50);assert(!p.v.Y3,'still running');p.v.X7=1;run(p,100);assert(!p.v.Y3,'started with STOP open')});
test('Overload trips: motor stops, FAULT flashes, no restart until reset',()=>{const p=kit();press(p,'X7');press(p,'X15');assert(!p.v.Y3&&p.v.M12,'no fault');let on=0,off=0;for(let i=0;i<200;i++){p.scan();p.v.Y12?on++:off++}assert(on>50&&off>50,'not flashing');press(p,'X7');assert(!p.v.Y3,'restarted during fault');press(p,'X11');assert(!p.v.M12&&!p.v.Y3,'reset must not start');press(p,'X7');assert(p.v.Y3,'no restart after reset')});
test('RESET with overload still open keeps the fault',()=>{const p=kit();press(p,'X15');p.v.X15=0;press(p,'X11');p.v.X15=0;run(p,50);assert(p.v.M12,'cleared while open')});
test('Encoder: count follows HSC, 1 rev = 600 counts, Y13 half-on/half-off',()=>{const p=kit();run(p,1000,6);assert(p.v.D100===600&&p.v.D140===1&&p.v.D142===0,'count '+p.v.D100);let lit=0;for(let i=0;i<100;i++){p.hsc+=6;p.scan();if(p.v.Y13)lit++}assert(lit>=48&&lit<=52,'Y13 '+lit)});
test('Encoder speed: 600 counts/s = 60 rpm forward, reverse gives negative rpm',()=>{const p=kit();run(p,2100,6);assert(p.v.D170===60&&p.v.M20,'fwd '+p.v.D170);run(p,2100,-3);assert(p.v.D170===-30&&!p.v.M20,'rev '+p.v.D170)});
test('Encoder reverse below zero: revs/remainder and Y13 stay consistent',()=>{const p=kit();p.hsc=-150;p.scan();assert(p.v.D140===0&&p.v.D142===-150&&p.v.Y13===0,'-150');p.hsc=-450;p.scan();assert(p.v.Y13===1,'-450')});
test('RESET clears the encoder count to 0',()=>{const p=kit();run(p,500,6);press(p,'X11');assert(p.hsc===0&&p.v.D100===0,'not cleared')});
test('Encoder works whether the motor is running or not (independent study encoder)',()=>{const p=kit();run(p,500,6);assert(p.v.D100===300&&!p.v.Y3,'idle count');press(p,'X7');run(p,500,6);assert(p.v.Y3&&p.v.D100===600,'running count')});
test('PPR = 0 entered by mistake: no divide-by-zero, Y13 off',()=>{const p=kit();p.v.D130=0;run(p,1200,6);assert(!p.v.Y13,'Y13')});
fs.writeFileSync(new URL('./PLC/TrainingKit/TK_Test_Report.json',import.meta.url),JSON.stringify({method:'Instruction-level interpreter with simulated HSC CH3; GX Works3 compile and real FX5U NOT verified',tests},null,2));
console.log(tests.map(t=>t.result+'  '+t.name).join('\n'));
