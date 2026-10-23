import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RenderBudget} from './dist/render_budget.mjs';
import {Quaternion,Vector3} from './dist/vendor/build/three.module.js';
import {shaftQuaternion} from './dist/kinematics.mjs';
const b=new RenderBudget(2);for(let i=0;i<300;i++)b.observe(40);assert.equal(b.ratio(),.75);assert(b.ratio(true)<=1);
const low=b.ratio();for(let i=0;i<240;i++)b.observe(16);assert(b.ratio()>low);b.setMode('sharp');const sharp=b.ratio();for(let i=0;i<200;i++)b.observe(50);assert.equal(b.ratio(),sharp);b.setMode('smooth');assert(b.ratio()<=1);
const load=f=>{const x=fs.readFileSync(new URL('./dist/assets/'+f,import.meta.url));return {bytes:x.length,j:JSON.parse(x.subarray(20,20+x.readUInt32LE(12)))};};
const full=load('machine.glb'),light=load('machine_light.glb'),detail=load('cabinet_detail.glb');
const tris=o=>o.j.meshes.reduce((n,m)=>n+m.primitives.reduce((a,p)=>a+o.j.accessors[p.indices].count/3,0),0);
assert(tris(light)<tris(full)*.35);assert(light.bytes<full.bytes*.35);assert.equal(detail.j.nodes.filter(n=>n.mesh!==undefined).length,1);
for(const name of ['MainRoller','TailRoller']){const node=light.j.nodes.find(n=>n.name===name),mount=node.rotation,q0=new Quaternion().fromArray(mount),tip=new Vector3(0,.12,0),expected=tip.clone().applyQuaternion(q0);for(let n=0;n<=360;n++){const q=new Quaternion().fromArray(shaftQuaternion(mount,-n*Math.PI/180));assert(tip.clone().applyQuaternion(q).distanceTo(expected)<1e-6)}}
console.log('PASS adaptive quality, hysteresis, manual quality; LOD triangle/byte budgets; lazy cabinet asset; 722 shaft angles on lightweight model');
console.log(JSON.stringify({trianglesBefore:tris(full),trianglesAfter:tris(light),bytesBefore:full.bytes,bytesAfter:light.bytes}));
