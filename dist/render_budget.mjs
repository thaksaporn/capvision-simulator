// Rendering quality never changes the 10 ms PLC/board simulation tick.
// Auto mode starts sharp and only lowers resolution if frames actually run slow.
// On 1x displays the canvas is supersampled up to 1.5x (and 1.75x in "sharp") so edges stay crisp.
export class RenderBudget {
 constructor(dpr=1){this.dpr=Math.min(2,Math.max(.75,dpr));this.max=Math.min(2,Math.max(this.dpr,1.5));this.scale=Math.min(this.max,1.5);this.mode='auto';this.frames=0;this.total=0;this.cool=0;}
 setMode(mode){this.mode=mode;this.frames=0;this.total=0;this.cool=0;this.scale=mode==='smooth'?Math.min(this.dpr,1):mode==='sharp'?Math.min(2,Math.max(this.dpr,1.75)):Math.min(this.max,1.5);}
 observe(ms){if(this.mode!=='auto'||ms<=0||!Number.isFinite(ms))return;this.total+=Math.min(ms,100);this.frames++;if(this.frames<60)return;const avg=this.total/this.frames;this.frames=0;this.total=0;
  const r=v=>Math.round(v*100)/100;
  if(avg>25){this.scale=Math.max(.75,r(this.scale-.15));this.cool=0;}else if(avg<17.5&&this.scale<this.max){if(++this.cool>=3){this.scale=Math.min(this.max,r(this.scale+.1));this.cool=0;}}
 }
 ratio(interacting=false){return Math.min(this.scale,interacting&&this.mode!=='sharp'?Math.max(1,Math.min(this.scale,1.25)):2);}
}
