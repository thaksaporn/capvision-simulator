import assert from 'node:assert/strict';
import {capPose,CAP_RADIUS} from './dist/kinematics.mjs';
const chute={x:1.18,state:'CHUTE',exitAt:1000};
let previous=capPose(chute,1000);
for(let ms=1010;ms<=2000;ms+=10){const v=capPose(chute,ms);assert(v.x>=previous.x);assert(v.y>=.45+CAP_RADIUS-1e-6);assert(v.rz<=0&&v.rz>=-Math.PI/2);assert(Math.hypot(v.x-previous.x,v.y-previous.y)<.02);previous=v;}
const upright=capPose({x:1.8,state:'RECEIVE'},2000);assert(Math.abs(previous.y-upright.y)<1e-9);assert.equal(previous.rz,upright.rz);assert(Math.abs(previous.x-upright.x)<1e-9);
const a={id:2,state:'REJECTED',rejectAt:1050,ejectAt:1000,rejectX:.35};const start=capPose(a,1000),fall=capPose(a,1200),rest=capPose(a,1800);assert.equal(start.z,0);assert(fall.z>0&&fall.y<start.y);assert(rest.y>=.11&&rest.y<.15);assert(rest.z>.43&&rest.z<.51);
const frozen={state:'UNCERTAIN',frozenPose:upright};assert.deepEqual(capPose(frozen,9999),upright);
console.log('PASS: 100 chute samples, support height, rotation sign, continuous chute/receiving transition, reject fall and frozen pose');
