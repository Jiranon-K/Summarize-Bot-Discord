# Meeting Summary Bot

Discord bot สำหรับสรุปการประชุมจากไฟล์เสียงหรือวิดีโอใน Google Drive

## คุณสมบัติ

- 🎵 รองรับไฟล์เสียง (MP3, M4A, MP4 Audio)
- 🎥 รองรับไฟล์วิดีโอ (MP4)
- 📁 เชื่อมต่อกับ Google Drive
- 🤖 ประมวลผลผ่าน n8n workflow
- 🔐 ระบบจัดการสิทธิ์

## การติดตั้ง

1. Clone repository
```bash
git clone https://github.com/Jiranon-K/bot-discord-summarize.git
cd bot-discord-summarize
```

2. ติดตั้ง dependencies
```bash
npm install
```

3. ตั้งค่า environment variables
```bash
cp .env.example .env
```

4. ใส่ข้อมูลใน `.env`
```
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_guild_id
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
N8N_WEBHOOK_URL=your_n8n_webhook_url
ALLOWED_ROLES=role_id1,role_id2
```

5. วาง `credentials.json` (Google Service Account) ในโฟลเดอร์รูท

6. Deploy commands
```bash
npm run deploy
```

7. เริ่มต้น bot
```bash
npm start
```

## การใช้งาน

ใช้คำสั่ง `/สรุปการประชุม` ใน Discord เพื่อเลือกไฟล์และสรุปการประชุม

## โครงสร้างโปรเจค

```
src/
├── commands/           # Discord slash commands
├── services/          # Google Drive & n8n services
├── utils/            # Utilities (permissions)
└── index.js          # Main bot file
```

## License

MIT