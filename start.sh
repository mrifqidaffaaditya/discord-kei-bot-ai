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

# Daftar path kandidat Chromium/Chrome yang umum di berbagai sistem
CHROME_PATHS=(
    "/usr/bin/chromium"
    "/usr/bin/chromium-browser"
    "/usr/bin/google-chrome"
    "/usr/bin/google-chrome-stable"
    "/usr/local/bin/chromium"
    "/snap/bin/chromium"
    "/opt/google/chrome/chrome"
)

FOUND_CHROME=""
for CHROME_PATH in "${CHROME_PATHS[@]}"; do
    if [ -f "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
        FOUND_CHROME="$CHROME_PATH"
        break
    fi
done

if [ -n "$FOUND_CHROME" ]; then
    CHROME_VER=$("$FOUND_CHROME" --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}[Browser] Chromium ditemukan: ${FOUND_CHROME} (${CHROME_VER})${NC}"
    export CHROME_EXECUTABLE_PATH="$FOUND_CHROME"
else
    echo -e "${YELLOW}[Browser] Chromium tidak ditemukan. Mencoba instalasi otomatis...${NC}"

    # Coba 1: apt-get (Debian/Ubuntu — paling umum di Pterodactyl)
    if command -v apt-get &>/dev/null; then
        echo -e "${YELLOW}[Browser] Mencoba: apt-get install chromium / chromium-browser...${NC}"
        apt-get update -qq 2>/dev/null
        apt-get install -y -qq chromium chromium-browser 2>/dev/null
        # Cek ulang setelah install
        for CHROME_PATH in "${CHROME_PATHS[@]}"; do
            if [ -f "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then
                FOUND_CHROME="$CHROME_PATH"
                break
            fi
        done
    fi

    # Coba 2: apk (Alpine Linux)
    if [ -z "$FOUND_CHROME" ] && command -v apk &>/dev/null; then
        echo -e "${YELLOW}[Browser] Mencoba: apk add chromium...${NC}"
        apk add --no-cache chromium 2>/dev/null
        [ -f "/usr/bin/chromium-browser" ] && FOUND_CHROME="/usr/bin/chromium-browser"
        [ -f "/usr/bin/chromium" ]         && FOUND_CHROME="/usr/bin/chromium"
    fi

    # Coba 3: playwright install chromium (Node.js native)
    if [ -z "$FOUND_CHROME" ]; then
        echo -e "${YELLOW}[Browser] Mencoba: playwright install chromium (via Node.js)...${NC}"
        # Izinkan download playwright chromium sementara
        unset PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
        npx playwright install chromium --with-deps 2>/dev/null || \
        node -e "require('playwright-chromium').chromium.executablePath()" 2>/dev/null
        # Set ulang skip untuk npm install berikutnya
        export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
        # Cek path playwright cache
        PW_CACHE="${PLAYWRIGHT_BROWSERS_PATH:-/home/container/.cache/ms-playwright}"
        FOUND_CHROME=$(find "$PW_CACHE" -name "chrome" -o -name "chromium" 2>/dev/null | head -1)
        if [ -n "$FOUND_CHROME" ]; then
            echo -e "${GREEN}[Browser] Playwright Chromium ditemukan di: ${FOUND_CHROME}${NC}"
        fi
    fi

    # Hasil akhir
    if [ -n "$FOUND_CHROME" ]; then
        CHROME_VER=$("$FOUND_CHROME" --version 2>/dev/null || echo "unknown")
        echo -e "${GREEN}[Browser] Chromium berhasil dipasang: ${FOUND_CHROME} (${CHROME_VER})${NC}"
        export CHROME_EXECUTABLE_PATH="$FOUND_CHROME"
    else
        echo -e "${RED}[Browser] PERINGATAN: Chromium tidak berhasil dipasang secara otomatis.${NC}"
        echo -e "${RED}[Browser] Fitur navigate_web (browser operator) tidak akan tersedia.${NC}"
        echo -e "${YELLOW}[Browser] Manual: apt-get install chromium-browser ATAU set CHROME_EXECUTABLE_PATH di env panel.${NC}"
        # Tidak exit — bot tetap bisa berjalan tanpa browser
    fi
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
