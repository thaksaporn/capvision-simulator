// Presentation mode: a guided, step-by-step tour that drives the live 3D simulator (camera, machine,
// cap pattern) and explains what happens behind the scenes, with a live 3-layer flow diagram.
import {STEPS, CORE} from './present_steps.mjs';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
let api = null, ui = null, idx = 0, playing = false, elapsed = 0, lastTick = 0, loop = 0, live = 0, startTimer = 0, lastEv = null, saved = null;
const stats = {entered: 0, inspected: 0, capid: 0};
const STATE = {0: 'NOT READY', 10: 'READY', 20: 'RUNNING', 30: 'FAULT'};

// ---------- flow diagram: lane 1 = real devices on the belt, lane 2 = the tracking board, lane 3 = PLC ----------
const node = (id, x, y, w, h, title, vx, anchor = 'middle', ty) => `<g id="${id}" class="nd"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>` +
  (anchor === 'middle'
    ? `<text class="t" x="${x + w / 2}" y="${ty ?? y + 19}" text-anchor="middle">${title}</text><text class="v" id="v-${id.slice(2)}" x="${x + w / 2}" y="${(ty ?? y + 19) + 17}" text-anchor="middle">—</text>`
    : `<text class="t" x="${x + 16}" y="${y + h / 2 + 5}">${title}</text><text class="v" id="v-${id.slice(2)}" x="${vx}" y="${y + h / 2 + 5}" text-anchor="end">—</text>`) + '</g>';
const link = (id, d, labels = '') => `<g id="${id}" class="lk">${d.map(p => `<path d="${p}"/>`).join('')}${labels}</g>`;
const lab = (x, y, t, a = 'start') => `<text class="lb" x="${x}" y="${y}" text-anchor="${a}">${t}</text>`;
const DIAGRAM = `<svg class="pv-svg" viewBox="0 0 1200 206" role="img" aria-label="ไดอะแกรมการไหลของฝาและสัญญาณในระบบ">
<defs><marker id="pvA0" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#4a6276"/></marker>
<marker id="pvA1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2dd4a7"/></marker></defs>
<rect class="lane" x="128" y="6" width="1066" height="64" rx="12"/><rect class="lane" x="128" y="96" width="1066" height="52" rx="12"/><rect class="lane" x="128" y="158" width="1066" height="46" rx="12"/>
<text class="ln" x="6" y="33">สายพาน</text><text class="ls" x="6" y="49">อุปกรณ์จริง</text>
<text class="ln" x="6" y="119">สมอง</text><text class="ls" x="6" y="135">บอร์ดติดตามฝา</text>
<text class="ln" x="6" y="180">PLC</text><text class="ls" x="6" y="196">คุมเครื่อง</text>
${link('k-feed', ['M140 38 H256'], lab(198, 30, 'ฝาเข้า', 'middle'))}
${link('k-b1cam', ['M400 38 H446'])}${link('k-cama', ['M590 38 H626'])}
${link('k-ab', ['M770 38 H796'], lab(783, 30, 'FAIL', 'middle'))}
${link('k-btail', ['M940 38 H986'], lab(963, 30, 'PASS', 'middle'))}
${link('k-b1', ['M330 102 V64'], lab(338, 88, 'Cap ID'))}
${link('k-cam', ['M508 102 V64', 'M532 64 V102'], lab(484, 88, 'Trigger', 'end') + lab(556, 88, 'ผลตรวจ'))}
${link('k-a', ['M688 102 V64', 'M712 64 V102'], lab(680, 88, 'เป่า', 'end') + lab(720, 88, 'B2 ยืนยัน'))}
${link('k-b', ['M858 102 V64', 'M882 64 V102'], lab(850, 88, 'ดัน', 'end') + lab(890, 88, 'B3 ยืนยัน'))}
${link('k-tail', ['M1050 64 V164', 'M1070 164 V64'], lab(1042, 118, 'B4 → X6', 'end') + lab(1078, 118, 'Y4 → M2'))}
${link('k-enc', ['M250 122 H266'])}
${link('k-plc', ['M300 142 V164', 'M318 164 V142'], lab(328, 157, 'READY · Heartbeat ↓     RUN_ENABLE ↑'))}
${node('n-b1', 260, 14, 140, 48, 'B1 ทางเข้า')}${node('n-cam', 450, 14, 140, 48, 'กล้องตรวจ')}${node('n-a', 630, 14, 140, 48, 'Reject A · ลม')}
${node('n-b', 800, 14, 140, 48, 'Reject B · กระบอก')}${node('n-tail', 990, 14, 140, 48, 'รางรับ · M2')}
<g id="n-pc" class="nd chip"><rect x="489" y="73" width="62" height="20" rx="10"/><text class="t" x="520" y="87" text-anchor="middle">PC Vision</text></g>
${node('n-enc', 140, 104, 110, 36, 'Encoder', 0, 'middle', 117)}
${node('n-board', 270, 104, 680, 36, 'บอร์ดติดตามฝา · Pico (C core)', 936, 'left')}
${node('n-plc', 140, 166, 990, 32, 'PLC FX5U · START/STOP · มอเตอร์ · Safety', 1116, 'left')}
</svg>`;
const EVENT_PINGS = [
  [/B1 พบฝา/, ['n-b1', 'k-b1', 'k-feed']], [/Trigger/, ['n-cam', 'k-cam']], [/กล้องจำลอง/, ['n-pc', 'k-cam']],
  [/โซลินอยด์ A/, ['n-a', 'k-a']], [/B2 ยืนยัน/, ['n-a', 'k-a']], [/A ไม่ยืนยัน/, ['n-a', 'n-b', 'k-ab']],
  [/กระบอก B/, ['n-b', 'k-b']], [/B3 ยืนยัน/, ['n-b', 'k-b']], [/ฝาดีเข้ารางลาด/, ['n-tail', 'k-btail']],
];

function build() {
  const el = document.createElement('div');
  el.id = 'presenter'; el.hidden = true;
  el.innerHTML = `<div class="pv-top"><div class="pv-brand">CV<span>•</span><b>CapVision</b><em>โหมดนำเสนอ</em></div>
 <nav class="pv-dots">${STEPS.map((s, i) => `<button data-go="${i}" title="${esc(s.short)}">${i + 1}</button>`).join('')}</nav>
 <div class="pv-topbtns"><button id="pvNotes" title="บทพูด (N)">บทพูด</button><button id="pvDiag" class="on" title="แสดง/ซ่อนไดอะแกรม (D)">ไดอะแกรม</button><button id="pvFs" title="เต็มจอ (F)">⛶</button><button id="pvExit" title="ออก (Esc)">✕ ออก</button></div>
 <div class="pv-progress"><i id="pvBar"></i></div></div>
<article class="pv-card" id="pvCard"></article>
<aside class="pv-notes" id="pvNotesBox" hidden></aside>
<div class="pv-bottom"><div class="pv-bar"><div class="pv-ticker" id="pvTicker"></div>
 <div class="pv-ctrl"><button id="pvPrev" title="ก่อนหน้า (←)">◀</button><button id="pvPlay" class="pv-play" title="เล่นอัตโนมัติ (Space)">▶ เล่นอัตโนมัติ</button><button id="pvNext" title="ถัดไป (→)">▶</button></div></div>
 <div class="pv-diagram">${DIAGRAM}</div></div>`;
  document.body.append(el);
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
  $('pvPrev').onclick = () => go(idx - 1); $('pvNext').onclick = () => go(idx + 1);
  $('pvPlay').onclick = () => setPlaying(!playing);
  $('pvNotes').onclick = toggleNotes; $('pvDiag').onclick = toggleDiagram; $('pvExit').onclick = stop;
  addEventListener('resize', () => { if (!ui.hidden) { layout(); aim(STEPS[idx]); } });
  $('pvFs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  return el;
}

const P = () => api.plant();
const snap = () => P().snapshot();
const sim = () => !api.external();

function setPattern(p) { if (!sim()) return; P().pattern = p; $('pattern').value = p; }
function ensureRunning(slow) {
  if (!sim()) return;
  const p = P();
  api.unpause();
  p.auto = true; $('auto').checked = true; p.interval = 2000; $('interval').value = 2000; $('intervalText').textContent = '2.0 วินาที';
  const s = snap();
  if (s.run) return;
  if (p.dirty || s.state === 30 || s.boardFault) { p.resetAll(); p.auto = true; lastEv = null; Object.assign(stats, {entered: 0, inspected: 0, capid: 0}); }
  p.faultMode = 'none'; $('fault').value = 'none';
  if (p.estop) p.command('estop');
  clearTimeout(startTimer);
  const doStart = () => { const t0 = Date.now(); const poll = () => { if (P().plc.v.M0) P().command('start'); else if (Date.now() - t0 < 4000) startTimer = setTimeout(poll, 100); }; poll(); };
  setTimeout(() => { P().command('safety'); startTimer = setTimeout(doStart, slow ? 1400 : 150); }, slow ? 900 : 0);
}

function countValue(key, s) {
  switch (key) {
    case 'passed': return ['ฝาดี (PASS)', s.passed, 'ok'];
    case 'rejectA': return ['รีเจค A', s.rejectA, 'bad'];
    case 'rejectB': return ['รีเจค B', s.rejectB, 'warn'];
    case 'queue': return ['อยู่ในเครื่อง', s.queue, ''];
    case 'position': return ['ค่า Encoder', Math.round(s.position).toLocaleString(), ''];
    case 'capid': return ['Cap ID ล่าสุด', stats.capid ? '#' + stats.capid : '—', ''];
    case 'inspected': return ['ตรวจแล้ว', stats.inspected, ''];
    case 'state': return ['สถานะ PLC', STATE[s.state] || 'NOT READY', s.state === 20 ? 'ok' : s.state === 30 ? 'bad' : ''];
    case 'run': return ['มอเตอร์ / RUN_ENABLE', (s.run ? 'เดิน' : 'หยุด') + ' / ' + (s.enable ? 'ON' : 'OFF'), s.run ? 'ok' : ''];
  }
  return ['', '', ''];
}

function renderCard(step) {
  const backTitle = step.backTitle || 'หลังบ้านทำงานอย่างไร';
  const core = step.core ? `<div class="pv-core">${CORE.map((c, i) => `<span style="--d:${i * 90}ms">${c}</span>`).join('<i>→</i>')}</div>` : '';
  const counts = step.count[0] === 'balance'
    ? `<div class="pv-balance" id="pvBalance"></div>`
    : `<div class="pv-counts">${step.count.map(k => `<div class="pv-cnt" data-k="${k}"><small></small><b></b></div>`).join('')}</div>`;
  $('pvCard').innerHTML = `<div class="pv-step">ขั้นที่ ${idx + 1} / ${STEPS.length} · <span>${esc(step.short)}</span></div>
 <h2>${esc(step.title)}</h2><p class="pv-lead">${esc(step.lead)}</p>${core}
 ${step.count[0] === 'balance' ? `<h3>${esc(step.countTitle)}</h3>${counts}` : ''}
 <h3>${esc(backTitle)}</h3><ul class="pv-back">${step.back.map(([sig, t]) => `<li><code>${esc(sig)}</code><span>${esc(t)}</span></li>`).join('')}</ul>
 ${step.count[0] === 'balance' ? '' : `<h3>${esc(step.countTitle)}</h3>${counts}`}`;
  $('pvCard').classList.remove('enter'); void $('pvCard').offsetWidth; $('pvCard').classList.add('enter');
  const next = STEPS[idx + 1];
  $('pvNotesBox').innerHTML = `<h3>บทพูด · ขั้นที่ ${idx + 1}</h3><p>${esc(step.script)}</p>${next ? `<div class="pv-nextup">ถัดไป → ${esc(next.short)}</div>` : '<div class="pv-nextup">จบการนำเสนอ</div>'}`;
}

function highlight(step) {
  const svg = ui.querySelector('.pv-svg');
  const all = step.nodes === 'all';
  svg.classList.toggle('focus', !all);
  svg.querySelectorAll('.nd,.lk').forEach(e => e.classList.toggle('act', !all && [...step.nodes, ...(step.links || [])].includes(e.id)));
  document.querySelectorAll('#hotspots .hotspot').forEach(h => h.classList.remove('focus'));
  if (step.focus) { const h = api.hotspots().find(h => h.key === step.focus); if (h) h.button.classList.add('focus'); }
  // Narrow screens scroll the diagram sideways: bring the first highlighted node into view.
  const box = ui.querySelector('.pv-diagram'), first = svg.querySelector('.nd.act');
  if (box.scrollWidth > box.clientWidth + 4) {
    const b = first ? first.getBBox() : {x: 0, width: 0}, scale = svg.clientWidth / 1200;
    box.scrollTo({left: Math.max(0, (b.x + b.width / 2) * scale - box.clientWidth / 2), behavior: 'smooth'});
  }
}

function go(i) {
  if (i < 0 || i >= STEPS.length) { if (i >= STEPS.length) setPlaying(false); return; }
  idx = i; elapsed = 0;
  const step = STEPS[i];
  ui.querySelectorAll('[data-go]').forEach((b, n) => { b.classList.toggle('on', n === i); b.classList.toggle('done', n < i); });
  renderCard(step); highlight(step); layout(); aim(step);
  setPattern(step.pattern);
  if (step.run) ensureRunning(step.run === 'slow');
  updateLive();
}

function setPlaying(on) {
  playing = on; lastTick = performance.now();
  $('pvPlay').textContent = on ? '❚❚ หยุดเล่น' : '▶ เล่นอัตโนมัติ';
  $('pvPlay').classList.toggle('on', on);
  if (on && idx === STEPS.length - 1 && elapsed >= STEPS[idx].dur) go(0);
}

function tick(now) {
  if (!ui || ui.hidden) return;
  if (playing) {
    elapsed += now - lastTick;
    if (elapsed >= STEPS[idx].dur) { if (idx < STEPS.length - 1) go(idx + 1); else { elapsed = STEPS[idx].dur; setPlaying(false); } }
  }
  lastTick = now;
  $('pvBar').style.width = Math.min(100, ((idx + Math.min(1, elapsed / STEPS[idx].dur)) / STEPS.length) * 100) + '%';
  loop = requestAnimationFrame(tick);
}

function ping(ids) {
  for (const id of ids) {
    const e = document.getElementById(id); if (!e) continue;
    e.classList.remove('ping'); void e.getBBox?.(); e.classList.add('ping');
    clearTimeout(e._ping); e._ping = setTimeout(() => e.classList.remove('ping'), 750);
  }
}

function readEvents() {
  const ev = P().events;
  // Events are shifted out past 300 and replaced on reset; a missing marker just means "read them all".
  const i = lastEv ? ev.lastIndexOf(lastEv) + 1 : 0;
  const fresh = ev.slice(i);
  if (ev.length) lastEv = ev[ev.length - 1];
  for (const e of fresh) {
    if (/B1 พบฝา/.test(e.message)) { stats.entered++; stats.capid = e.id; }
    if (/กล้องจำลอง/.test(e.message)) stats.inspected++;
    for (const [re, ids] of EVENT_PINGS) if (re.test(e.message)) ping(ids);
    if (/FAULT/.test(e.message)) ping(['n-board']);
  }
  const recent = ev.slice(-3).reverse();
  $('pvTicker').innerHTML = recent.map((e, n) => `<div class="${n ? '' : 'new'}"><time>${(e.ms / 1000).toFixed(1)}s</time>${esc(e.message)}${e.id ? ` <em>#${e.id}</em>` : ''}</div>`).join('');
}

function updateLive() {
  if (!ui || ui.hidden || !api) return;
  const s = snap();
  readEvents();
  const v = (id, t) => { const e = $('v-' + id); if (e) e.textContent = t; };
  v('b1', stats.capid ? 'Cap #' + stats.capid : 'รอฝา'); v('cam', 'ตรวจแล้ว ' + stats.inspected);
  v('a', 'คัดออก ' + s.rejectA); v('b', 'คัดออก ' + s.rejectB); v('tail', 'ฝาดี ' + s.passed);
  v('enc', Math.round(s.position).toLocaleString()); v('board', 'คิวในเครื่อง ' + s.queue + ' ใบ'); v('plc', STATE[s.state] || 'NOT READY');
  const tog = (id, on) => document.getElementById(id)?.classList.toggle('sig', !!on);
  tog('n-cam', s.camera); tog('n-a', s.a); tog('n-b', s.b); tog('n-plc', s.run); tog('n-enc', s.run); tog('n-tail', s.tail);
  document.getElementById('n-board')?.classList.toggle('bad', !!s.boardFault || s.state === 30);
  $('pvCard').querySelectorAll('.pv-cnt').forEach(c => { const [l, val, cls] = countValue(c.dataset.k, s); c.querySelector('small').textContent = l; const b = c.querySelector('b'); if (b.textContent !== String(val)) { b.textContent = val; b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } c.className = 'pv-cnt ' + cls; });
  const bal = $('pvBalance');
  if (bal) {
    const sum = s.passed + s.rejectA + s.rejectB + s.queue, ok = sum === stats.entered;
    bal.innerHTML = `<div class="eq"><span><small>ฝาเข้า</small><b>${stats.entered}</b></span><i>=</i><span class="ok"><small>ฝาดี</small><b>${s.passed}</b></span><i>+</i><span class="bad"><small>รีเจค A</small><b>${s.rejectA}</b></span><i>+</i><span class="warn"><small>รีเจค B</small><b>${s.rejectB}</b></span><i>+</i><span><small>ในเครื่อง</small><b>${s.queue}</b></span></div><div class="chk ${ok ? 'ok' : ''}">${ok ? '✓ สมดุล — ไม่มีฝาหายระหว่างทาง' : 'กำลังยืนยันฝาที่อยู่ระหว่างคัด…'}</div>`;
  }
}

function toggleNotes() { const b = $('pvNotesBox'); b.hidden = !b.hidden; $('pvNotes').classList.toggle('on', !b.hidden); layout(); aim(STEPS[idx]); }
function toggleDiagram() { const d = ui.querySelector('.pv-diagram'); d.classList.toggle('off'); $('pvDiag').classList.toggle('on', !d.classList.contains('off')); layout(); aim(STEPS[idx]); }
// Close-up poses were authored for the full-size viewer; the panels leave a smaller window, so back the camera off
// along its own line of sight in proportion (≈1.15× on a 1080p screen, up to 1.9× on small ones). The overview
// is already fitted to the free window by app.mjs.
let lastFrame = null;
function aim(step) {
  if (!step.cam && step.view === 'overall') { api.view('overall'); return; }
  if (!step.cam) api.view(step.view);            // keeps view side effects: hood cut-away, cabinet detail
  const p = step.cam || api.pose(step.view), f = lastFrame;
  const k = f ? Math.min(1.9, Math.max(1, .8 * Math.sqrt((innerHeight / f.h) * (innerWidth / f.w)))) : 1;
  api.goTo(p.pos.map((v, i) => p.target[i] + (v - p.target[i]) * k), p.target);
}
// Measure what the panels leave uncovered and tell the 3D camera to centre (and size the overview) there.
function layout() {
  if (!ui || ui.hidden) return;
  const W = innerWidth, H = innerHeight, mob = W <= 860, card = $('pvCard'), notes = $('pvNotesBox');
  const top = ui.querySelector('.pv-top').getBoundingClientRect(), bottom = ui.querySelector('.pv-bottom').getBoundingClientRect();
  const room = Math.max(110, bottom.top - card.getBoundingClientRect().top - 12);
  card.style.maxHeight = notes.style.maxHeight = Math.min(room, mob ? H * .36 : room) + 'px';
  const c = card.getBoundingClientRect();
  let x0 = 0, x1 = W, y0 = top.bottom, y1 = bottom.top - 6;
  if (!mob) { x0 = c.right + 10; if (!notes.hidden) x1 = notes.getBoundingClientRect().left - 10; }
  else y0 = Math.max(y0, (notes.hidden ? c : notes.getBoundingClientRect()).bottom + 4);
  lastFrame = {x: x0, y: y0, w: Math.max(160, x1 - x0), h: Math.max(110, y1 - y0)};
  api.setFrame(lastFrame);
}

function start() {
  if (!api) return;
  ui ??= build();
  saved = {labels: $('labels').checked};
  document.body.classList.add('presenting');
  ui.hidden = false;
  $('labels').checked = true; $('hotspots').hidden = false;
  if (sim()) {
    const p = P(); p.resetAll(); api.resetInterface(); p.faultMode = 'none'; p.auto = false;
    lastEv = null; Object.assign(stats, {entered: 0, inspected: 0, capid: 0});
  }
  cancelAnimationFrame(loop); clearInterval(live);
  lastTick = performance.now(); loop = requestAnimationFrame(tick); live = setInterval(updateLive, 150);
  requestAnimationFrame(() => requestAnimationFrame(() => go(0)));
  setPlaying(false);
}

function stop() {
  if (!ui || ui.hidden) return;
  setPlaying(false); cancelAnimationFrame(loop); clearInterval(live); clearTimeout(startTimer);
  ui.hidden = true; document.body.classList.remove('presenting'); api.setFrame(null);
  document.querySelectorAll('#hotspots .hotspot').forEach(h => h.classList.remove('focus'));
  $('labels').checked = saved?.labels ?? false; $('hotspots').hidden = !$('labels').checked;
  if (document.fullscreenElement) document.exitFullscreen();
  requestAnimationFrame(() => api.view('overall'));
}

addEventListener('keydown', e => {
  if (e.target.closest?.('input,select,textarea')) return;
  if (!ui || ui.hidden) { if ((e.key === 'p' || e.key === 'P') && api && !e.ctrlKey && !e.metaKey) start(); return; }
  const k = e.key;
  if (k === 'ArrowRight' || k === 'PageDown') { go(idx + 1); e.preventDefault(); }
  else if (k === 'ArrowLeft' || k === 'PageUp') { go(idx - 1); e.preventDefault(); }
  else if (k === ' ') { setPlaying(!playing); e.preventDefault(); }
  else if (k === 'n' || k === 'N') toggleNotes();
  else if (k === 'd' || k === 'D') toggleDiagram();
  else if (k === 'f' || k === 'F') $('pvFs').click();
  else if (k === 'Escape' && !document.fullscreenElement) stop();
  else if (/^[1-9]$/.test(k)) go(+k - 1);
});

function ready() {
  api = window.capvision;
  const btn = $('presentBtn');
  if (btn) { btn.disabled = false; btn.onclick = start; }
  if (/[?&#]present\b/.test(location.search + location.hash)) start();
}
if (window.capvision) ready(); else addEventListener('capvision-ready', ready, {once: true});
