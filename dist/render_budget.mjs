// Rendering quality never changes the 10 ms PLC/board simulation tick.
export class RenderBudget {
 constructor(dpr=1){this.dpr=Math.min(2,Math.max(.75,dpr));this.scale=Math.min(this.dpr,1.25);this.mode='auto';this.frames=0;this.total=0;this.cool=0;}
 setMode(mode){this.mode=mode;this.frames=0;this.total=0;this.cool=0;this.scale=Math.min(this.dpr,mode==='smooth'?1:mode==='sharp'?1.7:1.25);}
 observe(ms){if(this.mode!=='auto'||ms<=0||!Number.isFinite(ms))return;this.total+=Math.min(ms,100);this.frames++;if(this.frames<60)return;const avg=this.total/this.frames;this.frames=0;this.total=0;
  if(avg>25){this.scale=Math.max(.75,this.scale-.15);this.cool=0;}else if(avg<17.5&&this.scale<Math.min(this.dpr,1.25)){if(++this.cool>=4){this.scale=Math.min(this.dpr,1.25,this.scale+.1);this.cool=0;}}
 }
 ratio(interacting=false){return Math.min(this.scale,interacting&&this.mode!=='sharp'?1:2);}
}
