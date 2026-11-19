# RoV Broadcast Overlay — กีฬาสี

Overlay ถ่ายทอดสด RoV (1920×1080, พื้นโปร่งใส) + หน้าควบคุมบนมือถือแบบเรียลไทม์

## รันบน Windows
1. ติดตั้ง [Node.js](https://nodejs.org) (LTS)
2. ดับเบิลคลิก `start.bat` (ครั้งแรกจะติดตั้งแพ็กเกจให้เอง)
   หรือเปิด Command Prompt ในโฟลเดอร์นี้แล้วพิมพ์ `npm install` ตามด้วย `npm start`
3. หน้าต่างจะแสดง URL:
   - **Overlay**: `http://localhost:3000/overlay.html`
   - **Control บนมือถือ**: `http://<IP เครื่อง>:3000/control.html` (มือถือต้องต่อ Wi-Fi วงเดียวกัน)
4. ถ้ามือถือเปิดไม่ได้ ให้กด **Allow access** ตอน Windows Firewall ถาม (เลือก Private network)

ต้องการเปลี่ยนพอร์ต: `set PORT=3001 && npm start`

## ใส่ใน OBS
1. Sources → **+** → **Browser**
2. URL: `http://localhost:3000/overlay.html` · Width `1920` · Height `1080`
3. วาง Browser Source ไว้ **บนสุด** เหนือภาพเกม (Game/Window/Video Capture)
4. ขึ้นโปรเจคเตอร์: คลิกขวาที่ Preview → **Fullscreen Projector** → เลือกจอโปรเจคเตอร์

> ทดสอบในเบราว์เซอร์ธรรมดา: `overlay.html?preview=1` (มีพื้นหลังจำลองเกม)

## หน้าควบคุม
- **ฉาก**: Scoreboard / Starting / Matchup / Break / Winner (เลือกทีมชนะ) — เล่น stinger ให้อัตโนมัติ
- **คะแนนซีรีส์** +/−, BO1/BO3/BO5, รีเซ็ต
- **รอบ / GAME / ชื่องาน**
- **นับถอยหลัง**: ตั้งเวลา เริ่ม หยุด รีเซ็ต
- **ทีม**: เลือกซ้าย/ขวา, สลับฝั่ง
- **ช่องว่างกลางจอ**: ปรับไม่ให้ scoreboard บัง HUD ของเกม

ทุกอย่างบันทึกที่ `data/state.json` ปิดเปิด server แล้วค่าไม่หาย

## เพิ่มทีม (`teams.json`)
```json
{
  "teams": [
    { "name": "Sukhothai",   "tag": "SKT", "color": "#FF3D8B", "logo": "" },
    { "name": "Chiang Saen", "tag": "CSN", "color": "#FFD21A", "logo": "" },
    { "name": "Ayutthaya",   "tag": "AYT", "color": "#3DA5FF", "logo": "logos/ayt.png" }
  ]
}
```
- `tag` ตัวย่อ 3 ตัว (ห้ามซ้ำ) · `color` รูปแบบ `#RRGGBB`
- `logo` เว้นว่างไว้ = ใช้ monogram จาก tag · ถ้ามีโลโก้ ให้วางไฟล์ PNG (พื้นโปร่งใส) ใน `public/logos/`
- บันทึกไฟล์แล้ว server จะโหลดใหม่เอง ไม่ต้องรีสตาร์ท

## ปรับดีไซน์
สี/ขนาด/ความเร็วแอนิเมชันอยู่ใน `public/css/tokens.css` (CSS variables)
