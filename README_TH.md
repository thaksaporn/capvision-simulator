# CapVision Machine Lab W1

ดับเบิลคลิก `เปิด_CapVision_Simulator.cmd` เพื่อเปิดเว็บและ Bridge ในเครื่อง จากนั้นกด “เริ่มสาธิตครบวงจร” ใช้ Python 3 ที่มีอยู่แล้ว ไม่ต้องลงชุดเว็บเพิ่มเติม ทุกโมเดลและไลบรารีอยู่ในโฟลเดอร์ ใช้โหมดเว็บได้โดยไม่ต้องใช้อินเทอร์เน็ต

อ่านคู่มือเต็มใน `dist/manual.html` หรือกดวิธีใช้งานจากหน้าเว็บ

## ไฟล์สำคัญ

- `dist/index.html`, `app.mjs`, `style.css`: หน้าควบคุมและ 3D
- `dist/engine.mjs`: ตัวแปลคำสั่ง Ladder B2 และโรงงานจำลองแบบตอบสนองสด
- `dist/assets/machine.glb`: geometry จาก `CapVision_Realistic_C3_Editable_Parts.blend`
- `dist/assets/cap.glb`: geometry ฝาจาก `CapVision_Realistic_C3_Animated.blend`
- `dist/assets/engine.wasm`: แกน C จาก F1 พร้อมค่าระยะสำหรับโมเดลเว็บ
- `bridge/`: Local HTTP bridge + SLMP 3E TCP + MX Component COM adapter
- `PLC/CapVision_B2_GX_Simulator.gx3`: B2 native เดิม 122 แถว สำหรับเปิด GX Simulator3
- `PLC/CapVision_W1_Ladder_IMPORT.csv`: Ladder เต็มที่เพิ่ม Remote mailbox/Heartbeat ต้อง import และ Rebuild ใน GX ก่อนใช้งานจริง
- `tests_engine.mjs`, `tests_bridge.py`, `tests_mailbox.mjs`: การทดสอบที่รันซ้ำได้ พร้อมรายงาน JSON

## สถานะการเชื่อมต่อจริง

เครื่องนี้ยังไม่พบ MX Component COM ที่ใช้เชื่อม GX Simulator3 และผู้ใช้ยังไม่ได้ตั้ง IP/SLMP ของ FX5U จึง **ยังไม่ยืนยันว่าทั้งสองปลายทางเชื่อมต่อได้จริง** Bridge ทดสอบกับ SLMP mock แล้ว เริ่มจากอ่านอย่างเดียว เปิดให้ส่งคำสั่งเมื่อผู้ใช้เปิดรับคำสั่งและผ่านเงื่อนไขที่ PLC กำหนด

ไม่มีการดาวน์โหลด PLC ไม่มีการเปลี่ยน IP และไม่มีการสั่งอุปกรณ์จริงระหว่างพัฒนา W1 mailbox ทดสอบคำสั่งผ่านตัวแปลอิสระ ยังไม่ได้คอมไพล์ด้วย GX โปรเจกต์ .gx3 ที่แนบยังเป็น B2 เดิม

โหมด PLC จริงแสดงข้อมูลที่อ่านได้ ไม่จำลองตำแหน่งฝาจริงหรือยอดผลิตขึ้นเอง เพราะต้องเพิ่มข้อมูลจากบอร์ดและกล้องจริง ส่วนโหมดเว็บ/GX ใช้ผลกล้องจำลองที่ระบุบนจอ

## รันทดสอบ

```text
node tests_engine.mjs
python tests_bridge.py
node tests_mailbox.mjs
```

## License / แหล่งอ้างอิง

Three.js r180 (MIT) แนบใบอนุญาตใน `dist/vendor/LICENSE` แกนควบคุมและโมเดลเป็นงาน CapVision ที่สร้างในโครงการนี้ การสื่อสาร SLMP/MX อ้างอิงคู่มือทางการที่ลิงก์ใน `dist/manual.html` ไม่ได้รวมซอฟต์แวร์ MX Component หรือสิทธิ์ใช้งานของ Mitsubishi
