FROM node:20-slim

# Install dependencies untuk browser/Puppeteer (whatsapp-web.js), curl, & unzip PocketBase
RUN apt-get update && apt-get install -y \
    ca-certificates \
    unzip \
    curl \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libgkb-2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Salin package.json dari folder backend_kedungrejeki
COPY backend_kedungrejeki/package*.json ./backend_kedungrejeki/

# Masuk ke folder backend_kedungrejeki untuk instalasi dependensi Node.js
WORKDIR /app/backend_kedungrejeki
RUN npm install --production

# Kembali ke root /app
WORKDIR /app

# Salin folder backend_kedungrejeki dan pb_public secara sejajar
COPY backend_kedungrejeki/ ./backend_kedungrejeki/
COPY pb_public/ ./pb_public/

# Buat folder penyimpanan data PocketBase dan sesi WhatsApp
RUN mkdir -p /app/pb_data /app/backend_kedungrejeki/.wwebjs_auth

# Download PocketBase versi Linux langsung ke dalam container saat build
RUN curl -L https://github.com/pocketbase/pocketbase/releases/download/v0.22.22/pocketbase_0.22.22_linux_amd64.zip -o pocketbase.zip \
    && unzip pocketbase.zip \
    && rm pocketbase.zip

EXPOSE 8080

# Jalankan PocketBase berdampingan dengan server.js Node.js
CMD ["sh", "-c", "./pocketbase serve --http=0.0.0.0:8090 --dir=/app/pb_data --publicDir=/app/pb_public & node backend_kedungrejeki/server.js"]