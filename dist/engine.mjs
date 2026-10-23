import {capPose} from './kinematics.mjs';
// Executes the existing B2 instruction stream; real Y remains locked in SIM.
export class PLC {
 constructor(code){this.code=code;this.v={};this.t={};this.prev={};this.first=true;}
 read(a){return a.startsWith('K')?Number(a.slice(1)):(this.v[a]||0)}
 scan(dt=.01){Object.assign(this.v,{SM400:1,SM401:0,SM402:+this.first});let r=false,stack=[],logic=false;
  for(let pc=0;pc<this.code.length;pc++){const [op,a]=this.code[pc];if(op==='END')break;
   if(['LD','LDI','LDP','LD<>'].includes(op)){if(logic)stack.push(r);let val=op==='LD<>'?this.read(a[0])!==this.read(a[1]):!!this.read(a[0]);if(op==='LDI')val=!val;if(op==='LDP'){let old=this.prev[pc]||false;this.prev[pc]=val;val=val&&!old}r=val;logic=true;}
   else if(['AND','ANI','OR','ORI'].includes(op)){let val=!!this.read(a[0]);if(op==='ANI'||op==='ORI')val=!val;r=op==='AND'||op==='ANI'?r&&val:r||val}
   else if(op==='ORB')r=stack.pop()||r;
   else {logic=false;const d=a[0];switch(op){
    case 'OUT':if(d.startsWith('T')){this.t[d]=r?(this.t[d]||0)+dt:0;this.v[d]=+(r&&this.t[d]+1e-9>=this.read(a[1])*.1)}else this.v[d]=+r;break;
    case 'SET':if(r)this.v[d]=1;break;case 'RST':if(r)this.v[d]=0;break;
    case 'MOV':if(r)this.v[a[1]]=this.read(d);break;
    case 'ZRST':if(r)for(let n=+d.slice(1);n<=+a[1].slice(1);n++)this.v[d[0]+n]=0;break;
    case 'FMOV':if(r)for(let n=0;n<this.read(a[2]);n++)this.v[a[1][0]+(+a[1].slice(1)+n)]=this.read(d);break;
    default:throw Error('Unsupported PLC instruction '+op);
   }}
  }if(stack.length)throw Error('PLC stack');this.first=false;
 }
}
export const boardFaults=['','PC ไม่ส่ง Heartbeat','Encoder ไม่เคลื่อน','Encoder กลับทิศ','ฝาชิดเกินไป','คิวเต็ม','ตำแหน่งเกินช่วง','กล้องไม่ส่งผล','ผลตรวจผิด ID','ผลซ้ำขัดกัน','วาล์วทำงานซ้อน','ยืนยันรีเจคผิดช่วง','กระบอก B ไม่พร้อม/Home','B ไม่ยืนยันรีเจค','Watchdog','รอบควบคุมช้าเกิน','โปรโตคอลผิด'];
export class Plant {
 constructor(wasm,code){this.b=wasm;this.code=code;this.external=null;this.resetAll();}
 resetAll(){this.b.web_init();this.plc=new PLC(this.code);this.plc.scan();this.plc.v.M7050=1;this.ms=0;this.position=0;this.session=1;this.seq=1;this.b.web_hello(this.session,0);this.caps=[];this.events=[];this.trace=[];this.faultMode='none';this.auto=false;this.pattern='mixed';this.interval=1800;this.speed=1;this.lastFeed=-1e9;this.pendingFeed=false;this.estop=false;this.paused=false;this.dirty=false;this.previousRun=false;this.oldReset=0;this.log('พร้อมจำลอง · กด Safety reset แล้ว START');}
 g(i){return this.b.web_get(i)}
 log(message,id=0){this.events.push({ms:this.ms,message,id});if(this.events.length>300)this.events.shift();}
 pulse(d){this.plc.v[d]=1}
 command(action){if(this.external)return false;
  switch(action){case 'safety':if(this.estop)return false;this.pulse('M7013');break;
   case 'start':if(this.dirty){this.log('มีฝาค้างที่ไม่ทราบสถานะ กรุณารีเซทก่อน');return false}if(!this.plc.v.M0){this.log('ยังไม่พร้อม: ตรวจ Safety / fault / บอร์ด');return false}this.pulse('M7010');break;
   case 'stop':this.pulse('M7011');break;
   case 'reset':if(this.plc.v.M1)return false;this.pulse('M7012');this.caps=[];this.dirty=false;break;
   case 'estop':this.estop=!this.estop;this.plc.v.M7015=+this.estop;this.log(this.estop?'จำลอง E-STOP: ตัด Safety feedback':'ปลด E-STOP: ต้อง Safety reset ใหม่');break;
   case 'feed':if(!this.plc.v.M1||this.ms-this.lastFeed<500)return false;this.pendingFeed=true;break;
  }return true;
 }
 tick(){if(this.paused)return;this.ms+=10;const p=this.plc.v,b=this.b;
  if(this.external){if(this.external.stale)return;Object.assign(p,this.external.values);}
  if(this.faultMode!=='pc_lost')b.web_heartbeat(this.session,this.ms);
  let tail=this.faultMode==='tail_jam';for(const c of this.caps)if(c.state==='RECEIVE'&&c.x<1.90)tail=true;
  p.M7100=this.g(2);p.M7101=this.g(3);p.M7102=this.g(4);p.M7106=+tail;p.M7050=1;p.M7052=+(this.faultMode==='air_lost');
  if(!this.external)this.plc.scan();
  const run=!!p.M503,enable=!!p.M505;
  if(this.previousRun&&!run){this.log('หยุดมอเตอร์ · ถอน RUN_ENABLE');for(const c of this.caps)if(['LINE','UNCERTAIN'].includes(c.state)){c.frozenPose=capPose(c,this.ms);c.state='UNCERTAIN';this.dirty=true}}
  this.previousRun=run;
  if(p.M506&&!this.oldReset){b.web_reset(enable);if(!enable){this.session++;b.web_hello(this.session,this.ms);this.log('รีเซทบอร์ด / session ใหม่ · ไม่เริ่มเครื่องเอง')}}this.oldReset=p.M506;
  if(!enable&&!this.g(0)&&!this.g(2)&&!this.g(1)&&this.faultMode!=='pc_lost'){if(b.web_hello(this.session+1,this.ms))this.session++;}
  if(run&&this.faultMode!=='encoder_stall')this.position+=100*this.speed;
  let entry=false;if(run&&(this.pendingFeed||(this.auto&&this.ms-this.lastFeed>=this.interval))){entry=true;this.pendingFeed=false;this.lastFeed=this.ms;
   const id=this.g(14),outcome=this.pattern==='mixed'?['PASS','A','B'][(id-1)%3]:this.pattern;
   this.caps.push({id,origin:this.position,x:-.98,state:'LINE',outcome,created:this.ms});this.log('B1 พบฝา → เริ่มติดตาม',id);}
  let ca=false,cb=false,home=true;
  for(const c of this.caps){
   if(c.bAt&&this.ms-c.bAt>=50&&this.ms-c.bAt<500)home=false;
   if(c.resultAt&&this.ms>=c.resultAt&&!c.resultSent&&this.faultMode!=='vision_timeout'){c.resultSent=true;b.web_result(this.session,c.id,c.outcome==='PASS'?1:0,this.seq++);this.log('กล้องจำลอง: '+(c.outcome==='PASS'?'PASS':'FAIL'),c.id)}
   if(c.aAt&&!c.aConfirmed&&c.outcome==='A'&&!['a_miss','b_miss'].includes(this.faultMode)&&this.ms-c.aAt>=50){ca=true;c.aConfirmed=true;}
   if(c.bAt&&!c.bConfirmed&&this.faultMode!=='b_miss'&&this.ms-c.bAt>=50){cb=true;c.bConfirmed=true;}
  }
  b.web_tick(this.ms,this.position,+enable,+home,+entry,+ca,+cb,1);
  while(b.web_event()){
   const k=b.web_event_get(0),id=b.web_event_get(1),c=this.caps.find(c=>c.id===id);
   if(k===1&&c){c.resultAt=this.ms+80;this.log('Encoder ถึงกล้อง → Trigger / Cap ID '+id,id)}
   if(k===2&&c){c.state='CHUTE';c.exitAt=this.ms;this.log('ฝาดีเข้ารางลาด',id)}
   if(k===3&&c){c.aAt=this.ms;if(c.outcome==='A'&&!['a_miss','b_miss'].includes(this.faultMode)){c.ejectAt=this.ms;c.rejectX=.35;}this.log('สั่งโซลินอยด์ A',id)}
   if(k===4&&c){c.state='REJECTED';c.rejectAt=this.ms;c.ejectAt=c.bAt||c.aAt||this.ms;c.rejectX=c.bAt ? .86 : .35;this.log('B2 ยืนยันรีเจค A',id)}
   if(k===5)this.log('A ไม่ยืนยัน → รอรีเจคสำรอง B',id);
   if(k===6&&c){c.bAt=this.ms;if(this.faultMode!=='b_miss'){c.ejectAt=this.ms;c.rejectX=.86;}this.log('สั่งกระบอก B',id)}
   if(k===7&&c){c.state='REJECTED';c.rejectAt=this.ms;c.ejectAt=c.bAt||c.aAt||this.ms;c.rejectX=c.bAt ? .86 : .35;this.log('B3 ยืนยันรีเจค B',id)}
   if(k===8)this.log('FAULT: '+(boardFaults[id]||id));
  }
  for(const c of this.caps){
   if(c.state==='LINE')c.x=-.98+(this.position-c.origin)/20000;
   if(c.state==='CHUTE'){let f=Math.min(1,(this.ms-c.exitAt)/1000);c.x=1.18+.62*f;if(f===1){c.state='RECEIVE';c.x=1.80;}}
   if(c.state==='RECEIVE'&&p.M504)c.x+=.0025;if(c.state==='RECEIVE'&&c.x>2.68)c.state='DONE';
  }
  if(this.caps.length>80)this.caps=this.caps.filter(c=>!['DONE','REJECTED'].includes(c.state)||this.ms-(c.rejectAt||0)<1500);
  this.trace.push(this.snapshot());if(this.trace.length>6000)this.trace.shift();
 }
 snapshot(){const p=this.plc.v;return {ms:this.ms,mode:this.external?'PLC':'SIM',state:p.D20||0,plcFault:p.D30||0,boardFault:this.g(1),run:p.M503||0,tail:p.M504||0,enable:p.M505||0,ready:this.g(2),healthy:this.g(3),heartbeat:this.g(4),camera:this.g(5),a:this.g(6),b:this.g(7),queue:this.g(8),passed:this.g(9),rejectA:this.g(10),rejectB:this.g(11),position:this.position,estop:+this.estop};}
}
