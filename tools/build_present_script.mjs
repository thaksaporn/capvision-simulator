// Writes the printable Thai speaker script from the same step data the presentation mode uses,
// so the spoken script and the on-screen tour can never drift apart.
// Usage: node tools/build_present_script.mjs
import fs from 'node:fs';
import {STEPS, CORE} from '../dist/present_steps.mjs';

const secs = ms => Math.round(ms / 1000);
const total = STEPS.reduce((a, s) => a + s.dur, 0);
const L = [];
L.push('# บทพูดนำเสนอ CapVision (โหมดนำเสนอ 3D)', '');
L.push(`> เปิดเว็บ → กดปุ่ม **▶ นำเสนอ** มุมขวาบน (หรือกด **P**) · ทั้งหมด ${STEPS.length} ขั้น · เล่นอัตโนมัติรวมประมาณ ${Math.round(total / 60000 * 10) / 10} นาที`);
L.push('> ลิงก์ตรง: `https://thaksaporn.github.io/capvision-simulator/?present`', '');
L.push('## ปุ่มลัดระหว่างนำเสนอ', '');
L.push('| ปุ่ม | ทำอะไร |', '|---|---|');
for (const [k, t] of [['→ / PageDown', 'ขั้นถัดไป (ใช้รีโมตพรีเซนต์ได้)'], ['← / PageUp', 'ย้อนกลับ'], ['1–9', 'กระโดดไปขั้นนั้น'],
  ['Space', 'เล่นอัตโนมัติ / หยุด'], ['N', 'เปิด/ปิดบทพูดบนจอ (สำหรับคนพูด)'], ['D', 'ซ่อน/แสดงไดอะแกรมด้านล่าง'], ['F', 'เต็มจอ'], ['Esc', 'ออกจากโหมดนำเสนอ']])
  L.push(`| \`${k}\` | ${t} |`);
L.push('', `**แก่นของระบบที่อยากให้ผู้ฟังจำ:** ${CORE.join(' → ')}`, '');
L.push('## ไดอะแกรมด้านล่างจออ่านอย่างไร', '');
L.push('- **แถวบน · สายพาน** = อุปกรณ์จริงที่ฝาวิ่งผ่าน: B1 → กล้อง → Reject A → Reject B → รางรับ');
L.push('- **แถวกลาง · สมอง** = บอร์ดติดตามฝา (Pico / C core) รับพัลส์ Encoder ให้เลข Cap ID และสั่งงานทุกจุด');
L.push('- **แถวล่าง · PLC** = FX5U คุมปุ่ม มอเตอร์ และความปลอดภัย');
L.push('- เส้นที่ **ไหลเป็นเส้นประสีเขียว** = เส้นทางสัญญาณของขั้นที่กำลังพูด · กล่องที่ **กะพริบ** = มีเหตุการณ์จริงเกิดขึ้นตอนนั้น · กล่อง **สีส้ม** = สัญญาณกำลัง ON', '');
L.push('---', '');
STEPS.forEach((s, i) => {
  L.push(`## ขั้นที่ ${i + 1} · ${s.short} (~${secs(s.dur)} วินาที)`, '');
  L.push(`**บนจอ:** ${s.title}`, '');
  L.push(`**🎤 พูดว่า:**`, '', `> ${s.script}`, '');
  L.push(`**${s.backTitle || 'หลังบ้านทำงานอย่างไร'}** (ถ้ามีคนถาม):`, '');
  for (const [sig, t] of s.back) L.push(`- \`${sig}\` — ${t}`);
  L.push('');
});
L.push('---', '', '## คำถามที่มักถูกถาม (เตรียมตอบ)', '');
for (const [q, a] of [
  ['ทำไมใช้ Encoder ไม่ใช้จับเวลา?', 'เพราะสายพานอาจช้า เร่ง หรือหยุดกลางทาง ถ้าจับเวลาจะคัดผิดใบ แต่ระยะจาก Encoder ถูกเสมอ'],
  ['ถ้ากล้องส่งผลมาช้าหรือผิดใบ?', 'ผลต้องมี Cap ID และ session ตรงกับฝาที่รออยู่ ถ้าไม่ตรงหรือไม่มา บอร์ดแจ้ง fault ไม่เดา'],
  ['รู้ได้ไงว่าเป่าออกจริง?', 'ต้องมีเซนเซอร์ยืนยัน (B2 สำหรับ A, B3 สำหรับ B) ตัวนับรีเจคขึ้นหลังยืนยันเท่านั้น'],
  ['ถ้า A และ B พลาดทั้งคู่?', 'เครื่องหยุดทันที (fail-safe) เพื่อไม่ให้ฝาเสียหลุดถึงลูกค้า'],
  ['เว็บนี้ต่อเครื่องจริงได้ไหม?', 'ได้ ผ่านโปรแกรม Bridge (SLMP) ไปยัง FX5U · โหมด hybrid ให้เว็บจำลองเครื่อง แต่ทุกครั้งที่รีเจคจะมีพัลส์ออกขาจริง Y1/Y2'],
  ['ผลตรวจในเว็บมาจากกล้องจริงไหม?', 'ไม่ ในโหมดเว็บเป็นผลจำลองตามรูปแบบที่เลือก เพื่อสาธิตลำดับการทำงานของระบบ'],
]) L.push(`- **${q}** — ${a}`);
L.push('');
const out = new URL('../Presentation_Script_TH.md', import.meta.url);
fs.writeFileSync(out, L.join('\n'), 'utf8');
console.log('wrote', out.pathname.split('/').pop(), '-', STEPS.length, 'steps,', Math.round(total / 1000), 's');
