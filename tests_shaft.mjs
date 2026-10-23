import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from './dist/vendor/build/three.module.js';
import {shaftQuaternion} from './dist/kinematics.mjs';
const bytes=fs.readFileSync(new URL('./dist/assets/machine.glb',import.meta.url));
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
for(const name of ['MainRoller','TailRoller']){
 const node=gltf.nodes.find(n=>n.name===name);assert(node);
 const base=node.rotation||[0,0,0,1],q0=new Quaternion().fromArray(base);
 // Shaft endpoints must stay fixed in their bearings for every angle.
 const tips=[new Vector3(0,-.12,0),new Vector3(0,.12,0)];
 const expected=tips.map(v=>v.clone().applyQuaternion(q0));
 for(let i=0;i<=360;i++){
  const q=new Quaternion().fromArray(shaftQuaternion(base,-i*Math.PI/180));
  tips.forEach((v,k)=>assert(v.clone().applyQuaternion(q).distanceTo(expected[k])<1e-6,name+' shaft axis moved at '+i));
  const rim=new Vector3(.028,0,0).applyQuaternion(q);
  assert(Math.abs(Math.hypot(rim.x,rim.y)-.028)<1e-7,name+' radius changed');
 }
 // A negative world-Z rotation sends the top of the roller toward belt travel +X.
 const topLocal=new Vector3(0,.028,0).applyQuaternion(q0.clone().invert());
 const next=topLocal.applyQuaternion(new Quaternion().fromArray(shaftQuaternion(base,-.01)));
 assert(next.x>0,name+' wrong direction');
 console.log('PASS',name,'361 angles: shaft endpoints fixed, radius fixed, belt direction +X');
}
