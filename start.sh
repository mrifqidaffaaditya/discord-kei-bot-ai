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

# 2. Validasi & Instalasi Dependensi Python (OpenBrowser & MCP SDK)
echo -e "${YELLOW}[Python] Memeriksa modul openbrowser dan mcp...${NC}"
python3 -c "import openbrowser; import mcp" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}[Python] Dependensi belum lengkap. Memasang openbrowser-ai & mcp via pip3...${NC}"
    python3 -m pip install openbrowser-ai mcp --break-system-packages
    if [ $? -ne 0 ]; then
        echo -e "${RED}[Python] Gagal memasang dependensi Python. Mohon pastikan Python3 dan pip terpasang di sistem Anda.${NC}"
        # Jangan exit 1 di sini agar bot tetap bisa berjalan jika MCP openbrowser di-disable
    else
        echo -e "${GREEN}[Python] Paket openbrowser-ai dan mcp berhasil dipasang.${NC}"
        echo -e "${YELLOW}[Python] Mengunduh dependensi browser Chromium untuk OpenBrowser...${NC}"
        python3 -m playwright install chromium
    fi
else
    echo -e "${GREEN}[Python] Paket openbrowser dan mcp sudah siap.${NC}"
    echo -e "${GREEN}[Python] Lokasi openbrowser: $(python3 -c "import openbrowser; print(openbrowser.__file__)" 2>/dev/null || echo "tidak ditemukan")${NC}"
    echo -e "${GREEN}[Python] sys.path: $(python3 -c "import sys; print(sys.path)" 2>/dev/null)${NC}"
    # Validasi/install browser jika belum lengkap
    echo -e "${YELLOW}[Python] Memvalidasi dependensi browser Chromium...${NC}"
    python3 -m playwright install chromium
fi

# 3. Validasi Berkas Konfigurasi (.env)
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
