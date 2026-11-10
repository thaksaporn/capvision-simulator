// KitLink (web ↔ PLC run latch) — every sequence must end with PLC and web agreeing, with no request ping-pong
// and no automatic restart after a fault. A tiny world: PLC answers requests after 150 ms, the web machine
// needs 300 ms to start, the bridge is polled every 100 ms.
import fs from 'node:fs';
import {KitLink} from './dist/kit_link.mjs';
const assert = (v, m) => { if (!v) throw Error(m); };
function world({latch = 0, run = 0, canStart = true, plcAccepts = true} = {}) {
  const w = {latch, run, canStart, plcAccepts, t: 0, starting: null, plc: null, link: new KitLink(), acts: [], req: []};
  w.apply = list => {
    for (const a of list) {
      w.acts.push(a.act);
      if (a.act === 'startSim') w.starting = w.t + 300;
      if (a.act === 'cancelStart') w.starting = null;
      if (a.act === 'stopSim') { w.run = 0; w.starting = null; }
      if (a.act === 'requestStart') { w.req.push('start'); if (w.plcAccepts) w.plc = {v: 1, at: w.t + 150}; else w.apply(w.link.failed('start', 'refused')); }
      if (a.act === 'requestStop') { w.req.push('stop'); w.plc = {v: 0, at: w.t + 150}; }
    }
  };
  w.tick = ms => {
    for (let i = 0; i < ms / 100; i++) {
      w.t += 100;
      if (w.starting !== null && w.t >= w.starting) { w.starting = null; if (w.canStart) w.run = 1; }
      if (w.plc && w.t >= w.plc.at) { w.latch = w.plc.v; w.plc = null; }
      w.apply(w.link.step(w.latch, w.run, w.t));
    }
  };
  w.agree = () => w.latch === w.run;
  return w;
}
const tests = [];
const test = (name, fn) => { fn(); tests.push({name, result: 'PASS'}); };

test('X0: PLC latch on → web machine starts, nothing is sent back to the PLC', () => {
  const w = world(); w.tick(500); w.latch = 1; w.tick(1500);
  assert(w.run === 1 && w.agree() && w.req.length === 0, 'run ' + w.run + ' req ' + w.req);
});
test('X1: PLC latch off → web machine stops, nothing is sent back', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); w.latch = 0; w.tick(1500);
  assert(w.run === 0 && w.agree() && w.req.length === 0, 'run ' + w.run + ' req ' + w.req);
});
test('X0 then X1 before the web finished starting → start cancelled, web stays stopped', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(100); w.latch = 0; w.tick(2000);
  assert(w.run === 0 && w.agree() && w.acts.includes('cancelStart') && w.req.length === 0, w.acts.join());
});
test('Web START button while PLC stopped → one START request, PLC follows (Y5)', () => {
  const w = world(); w.tick(200); w.run = 1; w.tick(2000);
  assert(w.latch === 1 && w.agree() && w.req.join() === 'start', 'req ' + w.req);
});
test('Web STOP button while running → one STOP request, PLC follows (Y6)', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); w.run = 0; w.tick(2000);
  assert(w.latch === 0 && w.agree() && w.req.join() === 'stop', 'req ' + w.req);
});
test('PLC refuses START (not armed) → web machine is stopped again, both stopped', () => {
  const w = world({plcAccepts: false}); w.tick(200); w.run = 1; w.tick(2000);
  assert(w.run === 0 && w.latch === 0 && w.req.join() === 'start', 'run ' + w.run + ' req ' + w.req);
});
test('Web cannot start (E-STOP / tab hidden) → PLC told to stop, no retry loop', () => {
  const w = world({canStart: false}); w.tick(200); w.latch = 1; w.tick(10000);
  assert(w.latch === 0 && w.agree() && w.req.join() === 'stop', 'latch ' + w.latch + ' req ' + w.req);
});
test('Fault stops the web while running → PLC stopped, never restarted automatically', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); w.run = 0; w.canStart = true; w.tick(10000);
  assert(w.latch === 0 && w.run === 0 && w.req.join() === 'stop' && w.acts.filter(a => a === 'startSim').length === 1, w.acts.join());
});
test('Connect while the PLC is already running → web starts to match', () => {
  const w = world({latch: 1}); w.tick(1500);
  assert(w.run === 1 && w.agree() && w.req.length === 0, 'run ' + w.run);
});
test('Connect while the web is running but PLC stopped → web stops to match', () => {
  const w = world({run: 1}); w.tick(1500);
  assert(w.run === 0 && w.agree() && w.req.length === 0, 'run ' + w.run + ' req ' + w.req);
});
test('Steady running for 60 s → no actions, no requests', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); const n = w.acts.length; w.tick(60000);
  assert(w.acts.length === n && w.req.length === 0 && w.agree(), 'extra actions ' + w.acts.slice(n));
});
test('Web START then web STOP before the PLC answered → both end stopped', () => {
  const w = world(); w.tick(200); w.run = 1; w.tick(100); w.run = 0; w.tick(2000);
  assert(w.latch === 0 && w.run === 0, 'latch ' + w.latch + ' run ' + w.run + ' req ' + w.req);
});
test('Web link lost (PLC drops latch by heartbeat) → web machine stops', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); w.latch = 0; w.tick(500);
  assert(w.run === 0 && w.agree(), 'run ' + w.run);
});
test('Many presses in a row (X0, X1, X0, X1, X0) → ends running, never a request', () => {
  const w = world(); w.tick(200);
  for (const v of [1, 0, 1, 0, 1]) { w.latch = v; w.tick(700); }
  w.tick(1500);
  assert(w.run === 1 && w.agree() && w.req.length === 0, 'run ' + w.run + ' req ' + w.req);
});
test('Demo restart while running (web stops then starts again at once) → ends running on both sides', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500);
  w.run = 0; w.tick(100); w.run = 1; w.tick(3000);
  assert(w.run === 1 && w.latch === 1, 'run ' + w.run + ' latch ' + w.latch + ' req ' + w.req);
});
test('Web STOP then web START again before the PLC answered → both end running', () => {
  const w = world(); w.tick(200); w.latch = 1; w.tick(1500); w.run = 0; w.tick(100); w.run = 1; w.tick(3000);
  assert(w.agree() && w.run === 1, 'latch ' + w.latch + ' run ' + w.run);
});
fs.writeFileSync(new URL('./PLC/Kit_Link_Test_Report.json', import.meta.url), JSON.stringify({method: 'KitLink against a simulated PLC latch (150 ms) and web machine (300 ms start), 100 ms polling', tests}, null, 2));
console.log(tests.map(t => t.result + '  ' + t.name).join('\n'));
