// Metres, seconds; Y is vertical. Visual motion never commands PLC outputs.
export const CAP_RADIUS=.0315;
// The GLB carries a 90-degree mounting rotation. Spin about the installed
// shaft (world Z), preserving that mounting orientation rather than editing Euler Z.
export function shaftQuaternion(base,angle){
 const [x,y,z,w]=base,s=Math.sin(angle/2),c=Math.cos(angle/2);
 return [c*x-s*y,c*y+s*x,c*z+s*w,c*w-s*z];
}
const clamp=x=>Math.max(0,Math.min(1,x));
export function capPose(c,ms){
 if(c.state==='UNCERTAIN'&&c.frozenPose)return {...c.frozenPose};
 let x=c.x,y=.901,z=0,rz=0,rx=0;
 if(c.state==='CHUTE'){
  const f=clamp((ms-c.exitAt)/1000);
  // Roll down the supported chute, then the narrow exit guide tips the cap upright.
  const angle=f<.12?.83*f/.12:f<.78?.83:.83+(Math.PI/2-.83)*(f-.78)/.22;
  x=1.18+.62*f;y=.901-.451*f+CAP_RADIUS*Math.sin(angle);rz=-angle;
 }
 if(c.state==='RECEIVE'){y=.45+CAP_RADIUS;rz=-Math.PI/2;}
 if(c.state==='REJECTED'||(c.state==='LINE'&&c.ejectAt!==undefined)){
  const t=Math.max(0,(ms-(c.ejectAt??c.rejectAt))/1000),f=clamp(t/.2),drop=Math.max(0,t-.2);
  // Stay on the inclined reject tray before falling clear of its lower lip.
  x=c.rejectX;z=.38*f+.09*clamp(drop/.2);y=Math.max(.128,.901-.16*f-.8*drop-.5*9.81*drop*drop);rz=-Math.min(t*3,.8);rx=Math.min(drop*3,.6);
  if(y<=.128){const seed=(c.id*16807)%2147483647;x+=(seed%7-3)*.006;z=.47+(seed%5-2)*.012;y=.128+(c.id%5)*.003;rz=0;rx=0;}

 }
 return {x,y,z,rz,rx};
}
