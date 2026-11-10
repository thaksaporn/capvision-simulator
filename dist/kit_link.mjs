// Training-kit link (hybrid mode): keeps the web machine in step with the FX5U run latch M7235
// (X0 START / X1 STOP on the kit, lamps Y5 RUN / Y6 STOP). The PLC latch is the single source of truth.
//
// Called once per bridge poll with the latch and whether the web machine is running; returns what to do.
// Only *changes* trigger actions, so the two sides never ping-pong and a fault is never auto-restarted:
//   PLC latch rises  → start the web machine (if it cannot start within simStartMs → ask the PLC to stop)
//   PLC latch falls  → stop the web machine (and cancel a start still in progress)
//   web starts by itself (web START button, demo, presentation) while the PLC is stopped
//                    → ask the PLC to start; if the latch does not follow within plcMs → stop the web machine
//   web stops by itself (web STOP button, simulated fault, E-STOP) while the PLC runs → ask the PLC to stop
export class KitLink {
  constructor({simStartMs = 3500, plcMs = 1500} = {}) {
    this.simStartMs = simStartMs; this.plcMs = plcMs; this.reset();
  }
  reset() { this.prevLatch = null; this.prevRun = null; this.pending = null; }

  step(latch, run, now) {
    latch = !!latch; run = !!run;
    const out = [];
    if (this.prevLatch === null) {                       // first sample after connecting: adopt the PLC state
      if (latch && !run) this.#startSim(out, now, 'PLC กำลังเดินอยู่ (Y5) → เริ่มเครื่องในเว็บให้ตรงกัน');
      else if (!latch && run) out.push({act: 'stopSim', why: 'PLC หยุดอยู่ (Y6) → หยุดเครื่องในเว็บให้ตรงกัน'});
      this.prevLatch = latch; this.prevRun = run;
      return out;
    }
    const latchUp = latch && !this.prevLatch, latchDown = !latch && this.prevLatch;
    const runUp = run && !this.prevRun, runDown = !run && this.prevRun;
    const p = this.pending;

    if (latchDown) {
      if (p?.kind === 'plcStop') {                       // PLC followed our own stop request…
        this.pending = null;
        if (run) {                                       // …but the web was started again meanwhile (e.g. demo restart)
          out.push({act: 'requestStart', why: 'เครื่องในเว็บเริ่มใหม่ก่อน PLC ตอบ → แจ้ง PLC เดินตาม'});
          this.pending = {kind: 'plcStart', until: now + this.plcMs};
        }
      } else {
        if (p?.kind === 'simStart') out.push({act: 'cancelStart'});
        this.pending = null;
        if (run) out.push({act: 'stopSim', why: 'กด STOP ที่ PLC (X1) หรือลิงก์ขาด → หยุดเครื่องในเว็บ'});
      }
    } else if (latchUp) {
      if (p?.kind === 'plcStart') {                      // PLC followed our own start request…
        this.pending = null;
        if (!run) {                                      // …but the web was stopped again meanwhile: the latest wish wins
          out.push({act: 'requestStop', why: 'เครื่องในเว็บถูกหยุดก่อน PLC ตอบ → แจ้ง PLC หยุดตาม'});
          this.pending = {kind: 'plcStop', until: now + this.plcMs};
        }
      } else if (!run) this.#startSim(out, now, 'กด START ที่ PLC (X0) → เริ่มเครื่องในเว็บ');
    } else if (runUp && !latch && p?.kind !== 'simStart') {
      out.push({act: 'requestStart', why: 'เครื่องในเว็บเริ่มเดิน → แจ้ง PLC ให้ไฟ Y5 ติด'});
      this.pending = {kind: 'plcStart', until: now + this.plcMs};
    } else if (runDown && latch && p?.kind !== 'plcStop') {
      out.push({act: 'requestStop', why: 'เครื่องในเว็บหยุด → แจ้ง PLC ให้ไฟ Y6 ติด'});
      this.pending = {kind: 'plcStop', until: now + this.plcMs};
    }

    const q = this.pending;                              // settle or time out what we are waiting for
    if (q?.kind === 'simStart') {
      if (run) this.pending = null;
      else if (now > q.until) {
        out.push({act: 'cancelStart'}, {act: 'requestStop', why: 'เริ่มเครื่องในเว็บไม่สำเร็จ (ตรวจ E-STOP / fault / แท็บเว็บต้องเปิดอยู่) → สั่ง PLC หยุด'});
        this.pending = {kind: 'plcStop', until: now + this.plcMs};
      }
    } else if (q?.kind === 'plcStart') {
      if (latch) this.pending = null;
      else if (now > q.until) {
        out.push({act: 'stopSim', why: 'PLC ไม่รับ START (ตรวจ M7190 / Hardware arm / เปิดรับคำสั่ง) → หยุดเครื่องในเว็บ'});
        this.pending = null;
      }
    } else if (q?.kind === 'plcStop') {
      if (!latch || now > q.until) this.pending = null;  // a link loss stops the PLC latch anyway (ladder W3)
    }
    this.prevLatch = latch; this.prevRun = run;
    return out;
  }

  // The bridge refused a request (not armed, remote enable off, link down…).
  failed(kind, message) {
    if (this.pending?.kind === (kind === 'start' ? 'plcStart' : 'plcStop')) this.pending = null;
    return kind === 'start' ? [{act: 'stopSim', why: 'PLC ไม่รับ START: ' + message}] : [];
  }

  #startSim(out, now, why) {
    out.push({act: 'startSim', why});
    this.pending = {kind: 'simStart', until: now + this.simStartMs};
  }
}
