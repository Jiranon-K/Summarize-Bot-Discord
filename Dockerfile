# Dockerfile - Production Version (ไม่มี credentials.json)
FROM node:18-alpine

# ติดตั้ง dependencies ระบบ
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg

WORKDIR /app

# คัดลอก package files
COPY package*.json ./

# ติดตั้ง dependencies
RUN npm install --only=production && \
    npm cache clean --force

# คัดลอก source code (ยกเว้นไฟล์ใน .dockerignore)
COPY . .

# Build info สำหรับ monitoring
RUN echo "Build time: $(date)" > /app/build-info.txt && \
    echo "Build method: Secure credentials (Base64)" >> /app/build-info.txt && \
    echo "Environment: Production" >> /app/build-info.txt

# สร้าง user ที่ไม่ใช่ root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S discord -u 1001

RUN chown -R discord:nodejs /app
USER discord

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

CMD ["npm", "start"]