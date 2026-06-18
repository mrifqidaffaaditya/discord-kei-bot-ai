#!/bin/bash

# --- Warna Log ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Memulai Inisialisasi Kei Agent Bot ===${NC}"

# Bypassing duplicate browser downloads during npm install to save disk quota
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# 1. Validasi & Instalasi Dependensi Node.js
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[Node.js] Folder node_modules tidak ditemukan. Memasang dependensi...${NC}"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}[Node.js] Gagal memasang dependensi Node.js. Silakan periksa koneksi internet atau versi npm Anda.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}[Node.js] Dependensi Node.js sudah lengkap.${NC}"
fi

# 2. Instalasi & Validasi Browser Chromium (untuk navigate_web / browser operator)
echo -e "${YELLOW}[Browser] Memeriksa ketersediaan Chromium...${NC}"

# Daftar path kandidat Chromium/Chrome di sistem
CHROME_PATHS=(
    "${CHROME_EXECUTABLE_PATH}"
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
    "/usr/local/bin/chromium"
    "/snap/bin/chromium"
    "/opt/google/chrome/chrome"
)

FOUND_CHROME=""

# Cek 1: path sistem
for CHROME_PATH in "${CHROME_PATHS[@]}"; do
    if [ -n "$CHROME_PATH" ] && [ -f "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
        FOUND_CHROME="$CHROME_PATH"
        break
    fi
done

# Cek 2: playwright cache yang sudah ada (dari install sebelumnya)
if [ -z "$FOUND_CHROME" ]; then
    PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-/home/container/.cache/ms-playwright}"
    # Cari binary chrome/chromium di cache (cek lebih spesifik dulu)
    for PW_BIN in \
        "$PW_CACHE"/chromium-*/chrome-linux/chrome \
        "$PW_CACHE"/chromium-*/chrome-linux64/chrome \
        "$PW_CACHE"/chromium*/chrome \
        "$PW_CACHE"/chrome*/chrome; do
        if [ -f "$PW_BIN" ] && [ -x "$PW_BIN" ]; then
            FOUND_CHROME="$PW_BIN"
            echo -e "${GREEN}[Browser] Playwright Chromium cache ditemukan: ${FOUND_CHROME}${NC}"
            break
        fi
    done
fi

# Cek 3: jika belum ada, coba install via playwright (tanpa perlu root)
if [ -z "$FOUND_CHROME" ]; then
    echo -e "${YELLOW}[Browser] Chromium belum ada. Mencoba instalasi via Playwright...${NC}"

    # Cek ruang disk yang tersedia (butuh ~300MB untuk Chromium)
    AVAIL_MB=$(df -m /home/container 2>/dev/null | awk 'NR==2{print $4}' || df -m . 2>/dev/null | awk 'NR==2{print $4}' || echo "0")
    echo -e "${YELLOW}[Browser] Ruang disk tersedia: ${AVAIL_MB} MB (minimal 350 MB diperlukan)${NC}"

    if [ "$AVAIL_MB" -ge 350 ] 2>/dev/null; then
        echo -e "${YELLOW}[Browser] Mengunduh Chromium via playwright (bisa memakan waktu 1-3 menit)...${NC}"

        # Izinkan download sementara (sudah di-skip di atas untuk npm install)
        PW_CACHE_DIR="${PLAYWRIGHT_BROWSERS_PATH:-/home/container/.cache/ms-playwright}"
        export PLAYWRIGHT_BROWSERS_PATH="$PW_CACHE_DIR"

        # Jalankan playwright install
        npx playwright install chromium 2>&1 | grep -E "(Downloading|✓|error|Error)" || true

        # Cari binary yang baru diinstall
        for PW_BIN in \
            "$PW_CACHE_DIR"/chromium-*/chrome-linux/chrome \
            "$PW_CACHE_DIR"/chromium-*/chrome-linux64/chrome \
            "$PW_CACHE_DIR"/chromium*/chrome \
            "$PW_CACHE_DIR"/chrome*/chrome; do
            if [ -f "$PW_BIN" ] && [ -x "$PW_BIN" ]; then
                FOUND_CHROME="$PW_BIN"
                break
            fi
        done

        if [ -n "$FOUND_CHROME" ]; then
            echo -e "${GREEN}[Browser] Playwright Chromium berhasil diinstall!${NC}"
        else
            echo -e "${RED}[Browser] Playwright Chromium gagal diinstall (cek disk atau network).${NC}"
        fi
    else
        echo -e "${RED}[Browser] Ruang disk tidak cukup (< 350 MB). Chromium tidak bisa diinstall.${NC}"
        echo -e "${YELLOW}[Browser] Bebaskan disk atau set CHROME_EXECUTABLE_PATH manual di env panel.${NC}"
    fi
fi

# Hasil akhir
if [ -n "$FOUND_CHROME" ]; then
    CHROME_VER=$("$FOUND_CHROME" --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}[Browser] ✅ Chromium siap: ${FOUND_CHROME}${NC}"
    echo -e "${GREEN}[Browser] Versi: ${CHROME_VER}${NC}"
    export CHROME_EXECUTABLE_PATH="$FOUND_CHROME"
else
    echo -e "${RED}[Browser] ⚠️  Chromium tidak tersedia — fitur navigate_web dinonaktifkan.${NC}"
    echo -e "${YELLOW}[Browser] Solusi: set CHROME_EXECUTABLE_PATH di environment panel Pterodactyl.${NC}"
fi

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[Config] Berkas .env tidak ditemukan. Menduplikasi template .env dari .env.example...${NC}"
    cp .env.example .env
fi

# Fungsi untuk sinkronisasi environment variables dari Pterodactyl panel ke berkas .env
sync_env_var() {
    local var_name=$1
    local var_value="${!var_name}"
    if [ -n "$var_value" ]; then
        echo -e "${GREEN}[Config] Sinkronisasi $var_name dari system environment...${NC}"
        # Gunakan separator "|" untuk sed agar aman jika nilai mengandung karakter khusus atau "/"
        if grep -q "^$var_name=" .env; then
            sed -i "s|^$var_name=.*|$var_name=$var_value|" .env
        else
            echo "$var_name=$var_value" >> .env
        fi
    fi
}

# Daftar environment variables yang disinkronkan dari panel Pterodactyl
VARS_TO_SYNC=(
    "DISCORD_TOKEN"
    "DB_HOST"
    "DB_USER"
    "DB_PASSWORD"
    "DB_NAME"
    "OPENAI_API_KEY"
    "OPENAI_BASE_URL"
    "OPENAI_MODEL"
    "OPENAI_TEMPERATURE"
    "OPENAI_MAX_TOKENS"
    "SEARCH_PROVIDER"
    "BRAVE_SEARCH_API_KEY"
    "SERPAPI_KEY"
    "AIKEI_SEARCH_API_KEY"
    "PLAYWRIGHT_ENABLED"
    "MCP_ENABLED"
    "CHROME_EXECUTABLE_PATH"
)

for var in "${VARS_TO_SYNC[@]}"; do
    sync_env_var "$var"
done

# Cek akhir validasi DISCORD_TOKEN
FINAL_TOKEN=$(grep -E "^DISCORD_TOKEN=" .env | cut -d'=' -f2- | tr -d '\r' | xargs)
if [ "$FINAL_TOKEN" = "your_discord_bot_token_here" ] || [ -z "$FINAL_TOKEN" ]; then
    echo -e "${RED}[Config] PENTING: DISCORD_TOKEN belum diatur!${NC}"
    echo -e "${RED}[Config] Harap masukkan DISCORD_TOKEN di environment panel Pterodactyl atau di berkas .env sebelum menjalankan bot.${NC}"
    exit 1
fi

# 4. Jalankan Bot
echo -e "${GREEN}[Bot] Menyalakan bot...${NC}"
node .
