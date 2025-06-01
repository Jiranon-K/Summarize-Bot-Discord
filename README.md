# 🎯 Meeting Summary Bot - คู่มือการใช้งานฉบับสมบูรณ์

Discord Bot สำหรับสรุปการประชุมจากไฟล์เสียงหรือวิดีโอใน Google Drive โดยใช้ AI ประมวลผลผ่าน N8N workflow

## 📋 ภาพรวมระบบ

**ขั้นตอนการทำงาน:**
1. ผู้ใช้พิมพ์ `/สรุปการประชุม` ใน Discord
2. Bot แสดงรายการไฟล์จาก Google Drive
3. ผู้ใช้เลือกไฟล์ที่ต้องการสรุป
4. Bot ส่งข้อมูลไปยัง N8N webhook
5. N8N ดาวน์โหลดไฟล์และใช้ Whisper API แปลงเสียงเป็นข้อความ
6. GPT-4 วิเคราะห์และสรุปการประชุม
7. Bot ส่งผลสรุปกลับไปยัง Discord

**เทคโนโลยีที่ใช้:**
- **Discord.js v14** - Discord Bot Framework
- **Google Drive API** - เข้าถึงไฟล์ในขับ
- **N8N** - Workflow Automation
- **OpenAI Whisper** - Speech-to-Text
- **GPT-4** - AI Summarization
- **Docker** - Containerization

---

## 🚀 ขั้นตอนการติดตั้งแบบละเอียด

### 1️⃣ การสร้าง Discord Bot

#### 1.1 สร้าง Discord Application
1. เข้าไปที่ [Discord Developer Portal](https://discord.com/developers/applications)
2. คลิก **"New Application"**
3. ตั้งชื่อ Bot เช่น **"Meeting Summary Bot"**
4. คลิก **"Create"**

#### 1.2 สร้าง Bot User
1. ไปที่แท็บ **"Bot"** ในเมนูซ้าย
2. คลิก **"Add Bot"** และยืนยันด้วย **"Yes, do it!"**
3. กำหนดการตั้งค่า Bot:
   - **Username**: `MeetingSummaryBot`
   - **Public Bot**: ✅ เปิด (ถ้าต้องการให้คนอื่นเชิญ Bot ได้)
   - **Require OAuth2 Code Grant**: ❌ ปิด
   - **Privileged Gateway Intents**:
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**

#### 1.3 คัดลอก Token
1. ในหน้า **"Bot"** คลิก **"Reset Token"**
2. คัดลอก **Bot Token** เก็บไว้ใช้ในขั้นตอนถัดไป
   ```
   MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

#### 1.4 เชิญ Bot เข้า Discord Server
1. ไปที่แท็บ **"OAuth2"** > **"URL Generator"**
2. เลือก **Scopes**:
   - ✅ `bot`
   - ✅ `applications.commands`
3. เลือก **Bot Permissions**:
   - ✅ `Send Messages`
   - ✅ `Use Slash Commands`
   - ✅ `Embed Links`
   - ✅ `Read Message History`
4. คัดลอก **Generated URL** แล้วเปิดในบราวเซอร์
5. เลือก Server ที่ต้องการเชิญ Bot และคลิก **"Continue"**

#### 1.5 หาค่า IDs สำคัญ
```javascript
// เปิด Developer Mode ใน Discord (User Settings > Advanced > Developer Mode)

// คลิกขวาที่ Bot แล้วเลือก "Copy User ID"
CLIENT_ID=123456789012345678

// คลิกขวาที่ Server แล้วเลือก "Copy Server ID"  
GUILD_ID=987654321098765432
```

---

### 2️⃣ การสร้าง Google Drive API

#### 2.1 สร้าง Google Cloud Project
1. เข้าไปที่ [Google Cloud Console](https://console.cloud.google.com/)
2. คลิก **"Select a project"** > **"New Project"**
3. ตั้งชื่อโปรเจ็ค: `meeting-summary-bot`
4. คลิก **"Create"**

#### 2.2 เปิดใช้งาน Google Drive API
1. ไปที่ **"APIs & Services"** > **"Library"**
2. ค้นหา **"Google Drive API"**
3. คลิก **"Google Drive API"** แล้วคลิก **"Enable"**

#### 2.3 สร้าง Service Account
1. ไปที่ **"APIs & Services"** > **"Credentials"**
2. คลิก **"Create Credentials"** > **"Service Account"**
3. กรอกข้อมูล:
   - **Service Account Name**: `meeting-bot-drive`
   - **Service Account ID**: `meeting-bot-drive`
   - **Description**: `Service account for meeting summary bot`
4. คลิก **"Create and Continue"**
5. เลือก **Role**: `Viewer` (หรือ `Editor` ถ้าต้องการสิทธิ์เพิ่ม)
6. คลิก **"Continue"** > **"Done"**

#### 2.4 สร้าง Service Account Key
1. ในหน้า **"Credentials"** คลิกที่ Service Account ที่สร้าง
2. ไปที่แท็บ **"Keys"**
3. คลิก **"Add Key"** > **"Create New Key"**
4. เลือก **"JSON"** แล้วคลิก **"Create"**
5. ไฟล์ JSON จะถูกดาวน์โหลด **เก็บไฟล์นี้ไว้อย่างปลอดภัย**

#### 2.5 แชร์โฟลเดอร์ Google Drive
1. สร้างโฟลเดอร์ใน Google Drive สำหรับเก็บไฟล์การประชุม
2. คลิกขวาที่โฟลเดอร์ > **"Share"**
3. เพิ่ม email ของ Service Account (จากไฟล์ JSON: `client_email`)
   ```
   meeting-bot-drive@meeting-summary-bot.iam.gserviceaccount.com
   ```
4. ตั้งสิทธิ์เป็น **"Viewer"**
5. คัดลอก **Folder ID** จาก URL:
   ```
   https://drive.google.com/drive/folders/1ABCDEFGHijklmnop
                                        ↑
                                   Folder ID
   ```

---

### 3️⃣ การสร้าง OpenAI API Key

#### 3.1 สร้าง API Key
1. เข้าไปที่ [OpenAI Platform](https://platform.openai.com/)
2. ไปที่ **"API Keys"** > **"Create new secret key"**
3. ตั้งชื่อ: `meeting-summary-bot`
4. คัดลอก API Key เก็บไว้

#### 3.2 ตั้งค่า Billing (จำเป็น)
1. ไปที่ **"Billing"** และเพิ่มข้อมูลการชำระเงิน
2. ตั้งค่า **Usage Limits** เพื่อป้องกันค่าใช้จ่ายเกิน

---

### 4️⃣ การติดตั้งและกำหนดค่า

#### 4.1 Clone Repository
```bash
git clone https://github.com/Jiranon-K/bot-discord-summarize.git
cd bot-discord-summarize
```

#### 4.2 ติดตั้ง Dependencies
```bash
npm install
```

#### 4.3 กำหนดค่า Environment Variables
```bash
cp .env.example .env
```

แก้ไขไฟล์ `.env`:
```env
# ===== Discord Bot Configuration =====
BOT_TOKEN=MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLIENT_ID=123456789012345678
GUILD_ID=987654321098765432

# ===== Google Drive Configuration =====
GOOGLE_DRIVE_FOLDER_ID=1ABCDEFGHijklmnop

# 🔐 Google Credentials (Base64 encoded - SECURE METHOD)
GOOGLE_CREDENTIALS_BASE64="eyJ0eXBlIjoic2VydmljZV9hY2NvdW50LCJwcm9qZWN0X2lkIjoi..."

# ===== N8N Webhook Configuration =====
N8N_WEBHOOK_URL=https://hoshizora.online/webhook/meeting-summary
N8N_EXTERNAL_URL=https://hoshizora.online/webhook/meeting-summary

# ===== Permission Configuration =====
ALLOWED_ROLES=role_id1,role_id2
```

#### 4.4 แปลง Google Credentials เป็น Base64
```bash
# วิธีที่ 1: ใช้ command line
base64 -i credentials.json

# วิธีที่ 2: ใช้ online tool
# https://www.base64encode.org/
```

#### 4.5 Deploy Commands
```bash
npm run deploy
```

#### 4.6 ทดสอบ Bot
```bash
npm start
```

---

### 5️⃣ การตั้งค่า N8N Workflow

#### 5.1 Import Workflow
1. เข้าไปที่ N8N instance: `https://yourdomain.com`
2. คลิก **"Import workflow"**
3. Upload ไฟล์ `___Meeting_Summary_Bot.json`

#### 5.2 กำหนดค่า Credentials
**Google Drive OAuth2:**
1. ไปที่ **"Credentials"** > **"Add credential"** > **"Google Drive OAuth2"**
2. กรอกข้อมูลจาก Google Cloud Console:
   - **Client ID**
   - **Client Secret**
3. Authenticate ด้วย Google Account

**OpenAI API:**
1. ไปที่ **"Credentials"** > **"Add credential"** > **"OpenAI API"**
2. กรอก **API Key** ที่ได้จาก OpenAI

**HTTP Header Auth (สำหรับ Whisper):**
1. สร้าง credential ใหม่ชื่อ **"Header Auth account"**
2. กำหนดค่า:
   - **Name**: `Authorization`
   - **Value**: `Bearer YOUR_OPENAI_API_KEY`

#### 5.3 เปิดใช้งาน Workflow
1. คลิกที่ workflow ที่ import
2. คลิก **"Active"** เพื่อเปิดใช้งาน


---

## 🎯 การใช้งาน

### การใช้งานพื้นฐาน
1. ใน Discord ให้พิมพ์ `/สรุปการประชุม`
2. เลือกไฟล์จากรายการที่แสดง
3. รอผลการประมวลผล (3-10 นาที ขึ้นอยู่กับขนาดไฟล์)
4. Bot จะส่งสรุปการประชุมในรูปแบบที่จัดเรียงแล้ว

### รูปแบบไฟล์ที่รองรับ
- **Audio**: MP3, M4A, MP4 Audio
- **Video**: MP4
- **ขนาดไฟล์**: ไม่เกิน 125MB

### การจัดการสิทธิ์
```env
# เฉพาะ Role ที่กำหนด
ALLOWED_ROLES=123456789,987654321

# หรือให้ทุกคนใช้ได้ (ลบหรือเว้นว่าง)
ALLOWED_ROLES=
```

---

## 🔧 การแก้ไขปัญหาที่พบบ่อย

### ❌ Bot ไม่ตอบสนอง
```bash
# ตรวจสอบ Bot Token
curl -H "Authorization: Bot YOUR_BOT_TOKEN" \
     https://discord.com/api/v10/applications/@me

# ตรวจสอบ Log
docker logs meeting-bot-prod
```

### ❌ ไม่สามารถเข้าถึง Google Drive
```bash
# ตรวจสอบ Service Account
# - ตรวจสอบว่าแชร์โฟลเดอร์ให้ Service Account แล้ว
# - ตรวจสอบว่า Folder ID ถูกต้อง
# - ตรวจสอบว่า Google Drive API เปิดใช้งานแล้ว
```

### ❌ N8N Webhook ไม่ทำงาน
```bash
# ทดสอบ Webhook URL
curl -X POST https://yourdomain.com/webhook/meeting-summary \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'

# ตรวจสอบ N8N Workflow
# - ตรวจสอบว่า Workflow เปิดใช้งานแล้ว
# - ตรวจสอบ Credentials ทั้งหมด
```

### ❌ OpenAI API Error
```bash
# ตรวจสอบ API Key
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.openai.com/v1/models

# ตรวจสอบ Quota และ Billing
```

---

## 📊 การ Monitor และ Maintenance

### Log Files
```bash
# Discord Bot Logs
docker logs meeting-bot-prod -f

# N8N Logs  
docker logs n8n_container -f

# Nginx Logs
tail -f /var/log/nginx/access.log
```

### การอัพเดท
```bash
# อัพเดท Bot
git pull origin main
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# อัพเดท N8N Workflow
# Import ไฟล์ใหม่และเปลี่ยน credential ตามต้อง
```

### Backup
```bash
# Backup Environment Files
cp .env .env.backup.$(date +%Y%m%d)

# Backup N8N Workflows
# Export workflows จาก N8N interface
```

---

## 🛡️ ความปลอดภัย

### การป้องกันข้อมูล
- ✅ ไม่ commit ไฟล์ `.env` หรือ `credentials.json`
- ✅ ใช้ Base64 encoding สำหรับ Google Credentials
- ✅ ตั้งค่า Role-based permissions
- ✅ ใช้ HTTPS สำหรับ webhook endpoints


**Common Issues:**
- Discord Bot permissions
- Google Drive API quotas  
- OpenAI API rate limits
- Network connectivity

