// Metres, seconds; Y is vertical. Visual motion never commands PLC outputs.
export const CAP_RADIUS=.0315;
// The GLB carries a 90-degree mounting rotation. Spin about the installed
// shaft (world Z), preserving that mounting orientation rather than editing Euler Z.
export function shaftQuaternion(base,angle){
 const [x,y,z,w]=base,s=Math.sin(angle/2),c=Math.cos(angle/2);
 return [c*x-s*y,c*y+s*x,c*z+s*w,c*w-s*z];
}
const clamp=x=>Math.max(0,Math.min(1,x));
const easeOut=f=>1-(1-f)*(1-f);
const smooth=f=>f*f*(3-2*f);
// Reject fall: y(drop)=.741-.8*drop-4.905*drop^2 reaches the bin floor .128 at this drop time.
const LAND=(-.8+Math.sqrt(.64+4*4.905*(.741-.128)))/(2*4.905);
export function capPose(c,ms){
 if(c.state==='UNCERTAIN'&&c.frozenPose)return {...c.frozenPose};
 let x=c.x,y=.901,z=0,rz=0,rx=0,ry=0;
 // New caps drop the last few millimetres from the feeder onto the belt instead of appearing on it.
 if(c.state==='LINE'&&c.created!==undefined&&c.ejectAt===undefined){const f=clamp((ms-c.created)/140);y=.901+.035*(1-f)*(1-f);rx=.25*(1-f)*Math.sin(f*9);}
 if(c.state==='CHUTE'){
  const f=clamp((ms-c.exitAt)/1000);
  // Roll down the supported chute, then the narrow exit guide tips the cap upright.
  const angle=f<.12?.83*f/.12:f<.78?.83:.83+(Math.PI/2-.83)*(f-.78)/.22;
  x=1.18+.62*f;y=.901-.451*f+CAP_RADIUS*Math.sin(angle);rz=-angle;
 }
 if(c.state==='RECEIVE'){y=.45+CAP_RADIUS;rz=-Math.PI/2;}
 if(c.state==='REJECTED'||(c.state==='LINE'&&c.ejectAt!==undefined)){
  const t=Math.max(0,(ms-(c.ejectAt??c.rejectAt))/1000),f=easeOut(clamp(t/.2)),drop=Math.max(0,t-.2);
  const seed=(c.id*16807)%2147483647,spin=((seed%9)-4)*2.2;
  // Air blast accelerates the cap off the belt (ease-out), it slides down the inclined tray,
  // then falls clear of the lower lip with gravity, spinning a little like a real thin lid.
  x=c.rejectX;z=.38*f+.09*clamp(drop/.2);y=.901-.16*f-.8*drop-.5*9.81*drop*drop;rz=-Math.min(t*3,.8);rx=Math.min(drop*3,.6);ry=spin*t;
  if(drop>=LAND){
   // Landed: bounce with decaying height and ease onto its resting spot (no jump between poses).
   const tau=drop-LAND,settle=smooth(clamp(tau/.25)),rest={x:c.rejectX+(seed%7-3)*.006,z:.47+(seed%5-2)*.012,y:.128+(c.id%5)*.003};
   const fx=c.rejectX,fz=.38+.09*clamp(LAND/.2),frz=-.8,frx=Math.min(LAND*3,.6);
   x=fx+(rest.x-fx)*settle;z=fz+(rest.z-fz)*settle;
   y=rest.y+.022*Math.exp(-9*tau)*Math.abs(Math.sin(16*tau));
   rz=frz*(1-settle);rx=frx*(1-settle);ry=spin*(.2+LAND)+spin*.15*settle;
  }

 }
 return {x,y,z,rz,rx,ry};
}
