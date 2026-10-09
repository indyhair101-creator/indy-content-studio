# เชื่อม ChatGPT กับตารางใน Indy Content Studio

ติดตั้ง MCP บนแดชบอร์ดจริงแล้วเมื่อ 5 ตุลาคม 2026 โดยใช้ฐานข้อมูล Neon เดียวกับหน้าเว็บ ตั้งค่า OAuth, secret และ migration บน Vercel แล้ว ใช้ endpoint `https://indy-content-studio.vercel.app/mcp` ได้ทันที และข้ามไปหัวข้อ 4 เพื่อเชื่อมปลั๊กอินด้วยบัญชีของคุณ ขั้นตอน 1–3 เก็บไว้สำหรับติดตั้งใหม่หรือย้าย hosting

ทดสอบอัตโนมัติผ่าน 440 รายการ (1 integration test ข้ามตามการตั้งค่าเดิม), TypeScript และ production build ผ่าน ตรวจบนเว็บจริงแล้วว่า discovery, OAuth registration, การตรวจ grant ในฐานข้อมูล, MCP tools/list และเครื่องมืออ่านข้อมูล/ปฏิทินทำงาน สิทธิ์อ่านไม่สามารถแก้ข้อมูลได้ ยังไม่ได้ทดสอบผ่านบัญชี ChatGPT ของคุณหรือแก้คอนเทนต์จริงเพื่อทดสอบหลัง deploy

## โปรเจกต์ที่ต้องใช้

ใช้แอปใน `สร้างระบบกับน้องฟิว/.worktrees/line-oa-production/apps/indy-content-studio` ซึ่งรวม MCP กับเวอร์ชัน production ล่าสุดที่มีคิว LINE/Make แล้ว โฟลเดอร์สำเนารุ่นเก่าที่ใช้ IndexedDB ไม่สามารถรับรายการจาก ChatGPT ในเครื่องอื่นได้

ถ้าใช้ ZIP ที่ส่งมอบ ให้แตกไฟล์แล้วใช้โฟลเดอร์ `indy-dashboard-mcp/apps/indy-content-studio` แทน คำสั่งทั้งหมดในคู่มือต้องรันจากโฟลเดอร์แอปนี้

MCP endpoint ที่เปิดใช้งานแล้วคือ `https://indy-content-studio.vercel.app/mcp` การเปิด URL นี้โดยตรงใน browser ได้ HTTP 401 เป็นพฤติกรรมปกติ เพราะต้องเชื่อม OAuth ก่อน

## 1. ตั้งค่าเซิร์ฟเวอร์

ติดตั้งด้วย Node.js 22 ขึ้นไปและ pnpm โดยรันจากโฟลเดอร์แอป:

```powershell
pnpm install --frozen-lockfile
```

คง `DATABASE_URL`, `AUTH_SECRET` และ `INDY_ADMIN_PASSWORD_HASH` ของแดชบอร์ดเดิม เพิ่มค่าจาก `.env.mcp.example` ลงใน environment ของ hosting หรือ `.env.local` สำหรับพัฒนา:

| ค่า | ตั้งอย่างไร |
| --- | --- |
| `MCP_PUBLIC_URL` | HTTPS origin ของแดชบอร์ด เช่น `https://indy-content-studio.vercel.app` ไม่ต่อท้าย `/mcp` |
| `MCP_OAUTH_SECRET` | secret ใหม่ของ MCP อย่างน้อย 32 bytes แยกจาก secret ล็อกอินเดิม |
| `DASHBOARD_TIMEZONE` | Production ตั้ง `Asia/Bangkok` (UTC+7) ให้ตรงกับปฏิทินและคิวโพสต์เดิม |
| `INDY_APPLY_MCP_MIGRATIONS` | Production ตั้ง `1` เพื่อสร้างตาราง OAuth ระหว่าง build โดยใช้ DATABASE_URL ที่เก็บแบบ sensitive |
| `MCP_ALLOWED_REDIRECT_URIS` | เว้นว่างได้เมื่อใช้ callback มาตรฐาน ChatGPT; ถ้าหน้าจัดการปลั๊กอินแสดง URI อื่น ให้คัดลอก URI นั้นมาตรงตัว |

สร้าง secret แล้วนำผลลัพธ์ไปตั้งค่าเฉพาะฝั่งเซิร์ฟเวอร์:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

อย่าใส่ secret ในแชตหรือโค้ด client และอย่าใช้ชื่อขึ้นต้น `NEXT_PUBLIC_` เมื่อเปลี่ยน `MCP_OAUTH_SECRET` การเชื่อม MCP เดิมจะต้องอนุญาตใหม่

## 2. เพิ่มตาราง OAuth ใน Neon

รันกับฐานข้อมูลเดียวกับแดชบอร์ด:

```powershell
pnpm mcp:migrate
```

คำสั่งอ่าน `.env.local` ถ้ามี และใช้ `DATABASE_URL` จาก environment เช่นกัน สร้างเฉพาะตาราง `mcp_oauth_grants` และ index; ไม่แก้ข้อมูลคอนเทนต์ หรือใช้ SQL ใน `migrations/20261005_mcp_oauth.sql` ผ่าน Neon SQL Editor ก็ได้ บน Vercel ตั้ง `INDY_APPLY_MCP_MIGRATIONS=1` แล้ว build จะเรียก migration ให้อัตโนมัติ รันซ้ำได้ หาก migration ล้มเหลว build จะหยุดก่อนเผยแพร่

## 3. ทดสอบและ deploy

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Vercel โปรเจกต์เดิมชื่อ `indy-content-studio` ตั้ง Root Directory เป็น `apps/indy-content-studio` เมื่อต้อง deploy ใหม่ ให้รัน Vercel CLI จากราก checkout `line-oa-production` ที่มี `.vercel/project.json` ไม่ใช่จากโฟลเดอร์แอปซ้ำอีกชั้น และตั้ง environment ใหม่บน hosting ด้วย การตั้งค่าในเครื่องอย่างเดียวไม่ส่งไปยัง Vercel อัตโนมัติ

เมื่อ deploy แล้ว endpoint discovery ทั้งสองต้องคืน HTTP 200:

- `https://<โดเมน>/.well-known/oauth-protected-resource`
- `https://<โดเมน>/.well-known/oauth-authorization-server`

การเรียก `/mcp` โดยไม่มี bearer token ต้องได้ HTTP 401 และ header `WWW-Authenticate` ที่ชี้ไป discovery ไม่ควรได้หน้า login HTML, redirect ไป login หรือ HTTP 404

## 4. เชื่อมปลั๊กอินใน ChatGPT

ตาม [คู่มือ OpenAI เรื่องเชื่อมและทดสอบปลั๊กอิน](https://developers.openai.com/plugins/deploy/connect-chatgpt):

1. เปิด Developer mode ใน Settings → Security and login หากบัญชีหรือ workspace เปิดให้ใช้งาน
2. ไปที่ Plugins กดปุ่มเพิ่ม ตั้งชื่อ `Indy Dashboard Calendar`
3. ใส่ MCP Server URL เป็น `https://<โดเมน>/mcp`
4. เลือก OAuth และ Dynamic Client Registration หากมีตัวเลือก ไม่ต้องกรอก client secret: ระบบใช้ public client กับ PKCE
5. ระบบจะพาไปหน้าแดชบอร์ด ให้ล็อกอินด้วยรหัสผู้ดูแลเดิม แล้วกด **อนุญาตการเชื่อมต่อ**
6. เลือกปลั๊กอินในแชตใหม่ แล้วลองสั่งดูปฏิทินก่อน

ระบบรองรับ callback มาตรฐาน `https://chatgpt.com/connector_platform_oauth_redirect` พร้อมตรวจ issuer `iss` ถ้าหน้าจัดการปลั๊กอินแสดง callback อื่น ให้นำ URI นั้นใส่ `MCP_ALLOWED_REDIRECT_URIS` แล้ว deploy environment ใหม่

MCP ทำงานผ่าน host ที่รองรับ tools; ระบบไม่ได้ผูกกับโมเดล GPT-4 โดยตรง ความพร้อมของ Developer mode และการเลือกโมเดลขึ้นกับบัญชีและ workspace ตาม [เอกสาร OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt)

## เครื่องมือที่ให้ ChatGPT เรียก

| Tool | ทำอะไร |
| --- | --- |
| `get_dashboard_config` | ดู timezone, หมวดหมู่ และรูปแบบที่ใช้ได้ |
| `list_content` | ค้นหาคอนเทนต์และแบ่งหน้า |
| `get_content` | ดูรายละเอียดจาก ID |
| `get_calendar` | ดูตารางประจำเดือน |
| `create_content` | สร้างคอนเทนต์ร่าง โดยใช้ UUID เดิมเมื่อส่งคำขอซ้ำ |
| `update_content` | แก้ชื่อ ผู้รับผิดชอบ แคปชัน หมายเหตุ และเวลาทำงาน |
| `schedule_content` | กำหนดหรือเลื่อนวันเวลาของแต่ละแพลตฟอร์ม |
| `unschedule_content` | ยกเลิกตารางของแพลตฟอร์มหนึ่ง |
| `delete_content` | ย้ายคอนเทนต์ไปถังขยะ กู้คืนในแดชบอร์ดได้ |

สิทธิ์ `dashboard:read` ให้ดูข้อมูล ส่วน `dashboard:write` ให้แก้ไขได้ การแก้แคปชันจะรีเซ็ตการอนุมัติตามขั้นตอนเดิม ระบบไม่แก้รายการที่มีแผนหรือประวัติส่งไป Make รวมถึงแผนที่ยังไม่ส่งหรือเคยส่งผิดพลาด ให้จัดการรายการเหล่านี้จากแดชบอร์ด เพื่อป้องกันการเปลี่ยนรายการระหว่างส่ง

วันเวลาที่ส่งเข้า tool เป็น `YYYY-MM-DDTHH:mm` ตาม timezone ของแดชบอร์ด เช่น `2026-10-08T09:30` ไม่ต้องเติม `Z` หรือ offset ตารางที่กำหนดเป็นแผนในปฏิทิน การอนุมัติและส่งโพสต์จริงใช้ขั้นตอนเดิมของแดชบอร์ด

ตัวอย่างข้อความ:

- “ดูปฏิทินคอนเทนต์เดือนตุลาคม 2026”
- “สร้างคอนเทนต์รีวิววิดีโอ แล้วกำหนดลง Facebook วันที่ 8 ตุลาคม 2026 เวลา 09:30 ตาม timezone ของแดชบอร์ด”
- “ค้นหาคอนเทนต์ชื่อรีวิว แล้วเลื่อนตาราง Instagram ไปวันที่ 10 ตุลาคม เวลา 18:00”
- “ยกเลิกตาราง Facebook ของรายการนี้”

เปิดแดชบอร์ดเดิมแล้วรอไม่เกิน 15 วินาที หรือกลับมาโฟกัสหน้าต่าง เพื่อดูข้อมูลล่าสุด หากมีการแก้พร้อมกัน ระบบจะไม่เขียนทับ snapshot ที่เก่า; หน้าเว็บอาจแจ้งให้โหลดใหม่เมื่อบันทึกชนกัน ฟอร์มที่เปิดค้างไว้จะรวมเฉพาะช่องที่คุณแก้กับข้อมูลใหม่จาก MCP ถ้าทั้งสองฝั่งแก้ช่องเดียวกัน จะแจ้งให้ปิดแล้วเปิดฟอร์มใหม่โดยเก็บร่างที่พิมพ์ไว้จนกว่าคุณปิดเอง

## พัฒนาในเครื่องและแก้ปัญหา

ใช้ `pnpm dev` แล้วทดสอบด้วย MCP Inspector:

```powershell
npx @modelcontextprotocol/inspector
```

เลือก Streamable HTTP และ endpoint `http://localhost:3000/mcp` กำหนด `MCP_PUBLIC_URL=http://localhost:3000` สำหรับ local dev และเพิ่ม callback ที่ Inspector แสดงใน `MCP_ALLOWED_REDIRECT_URIS` อย่าใช้ HTTP localhost เป็น URL สำหรับเชื่อมจาก ChatGPT บนเว็บ ต้องมี HTTPS hosting หรือ development tunnel ที่เข้าถึงได้ ตาม [คู่มือ MCP ของ OpenAI](https://developers.openai.com/plugins/build/app-quickstart)

การล็อกอินเดิมใช้ Secure cookie จึงควรทดสอบ OAuth ผ่าน HTTPS tunnel และตั้ง `MCP_PUBLIC_URL` เป็น origin ของ tunnel เมื่อ browser ไม่ส่ง Secure cookie บน HTTP ในเครื่อง

| อาการ | ตรวจตรงไหน |
| --- | --- |
| `mcp_not_configured` หรือ `mcp_unavailable` | ตั้ง `MCP_PUBLIC_URL`, `MCP_OAUTH_SECRET`, `DATABASE_URL` และ deploy ใหม่ |
| `invalid_redirect_uri` | คัดลอก callback URI จากหน้าจัดการปลั๊กอินลง allowlist ให้ตรงทุกตัว |
| `invalid_target` | ค่า resource ต้องเป็น origin ที่ตั้งไว้ ตามด้วย `/mcp` |
| `Invalid consent origin` หลังคลิกอนุญาต | อัปเดตแพตช์ 5 ตุลาคม 2026 ที่แก้ Referrer-Policy และ CSP แล้วปิดแท็บเก่า เริ่มเชื่อมใหม่จาก ChatGPT เพื่อโหลดฟอร์มรุ่นใหม่ |
| OAuth ขึ้น `server_error` | ตรวจว่า migration ถูกสร้างในฐานข้อมูลเดียวกับแดชบอร์ด |
| ใช้ได้แต่ดู แก้ไขไม่ได้ | อนุญาต `dashboard:write` ใหม่ |
| เห็นข้อมูลคนละชุด | ใช้แอปเวอร์ชันฐานข้อมูลร่วมและ `DATABASE_URL` เดียวกัน |

Access token มีอายุ 1 ชั่วโมง; refresh token หมุนใหม่ทุกครั้งและหมดอายุเมื่อไม่ใช้ 30 วัน การ revoke refresh token หยุดการต่ออายุ ส่วน access token ที่ออกแล้วหมดอายุภายใน 1 ชั่วโมง การเปลี่ยน signing secret ตัดการใช้งานทุก token ทันที ผู้ดูแลสามารถล้างแถวหมดอายุเป็นครั้งคราวด้วย `DELETE FROM mcp_oauth_grants WHERE expires_at <= now();`
