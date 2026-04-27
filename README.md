# 🤖 Kei Bot AI — Discord AI Chatbot

Bot Discord AI dengan kemampuan memory jangka panjang, konfigurasi per-server, dan personality yang bisa dikustomisasi. Dibangun menggunakan **Discord.js v14**, **OpenAI-compatible API**, dan **MySQL**.

---

## ✨ Fitur

- **🧠 Memory Cerdas** — Bot mengingat informasi personal user (nama, hobi, preferensi, dll) secara otomatis dan permanen di database. Memory dianalisis setiap percakapan dan di-update jika ada perubahan.
- **💬 Chat Natural** — Bot merespons dengan gaya santai dan natural seperti manusia biasa, bukan robot.
- **📜 History Percakapan** — Menyimpan hingga 50 (konfigurabel) riwayat chat per user agar bot paham konteks pembicaraan.
- **⚙️ Konfigurasi Per-Server** — Setiap server bisa punya channel & personality AI yang berbeda-beda.
- **🎭 Custom Personality** — Admin bisa mengubah sifat/instruksi bot khusus untuk server masing-masing.
- **📝 Reply Context** — Bot bisa membaca isi pesan yang di-reply user untuk konteks yang lebih baik.
- **⌨️ Typing Indicator** — Bot menampilkan efek "sedang mengetik..." saat memproses pesan.
- **🔧 Dual Command System** — Mendukung Slash Commands (`/`) dan Text Commands (`!ai`).
- **📊 Debug Mode** — Menampilkan info latency, token usage, dan memory yang ditambahkan.

---

## 📋 Prasyarat

- **Node.js** v18 atau lebih baru
- **MySQL** database server
- **Discord Bot Token** dari [Discord Developer Portal](https://discord.com/developers/applications)
- **OpenAI-compatible API Key** (OpenAI, LiteLLM, atau provider lainnya)

---

## 🚀 Instalasi

### 1. Clone repository

```bash
git clone https://github.com/username/discord-kei-bot-ai.git
cd discord-kei-bot-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Konfigurasi environment

Salin file `.env.example` ke `.env` dan isi dengan kredensial Anda:

```bash
cp .env.example .env
```

Lalu edit file `.env`:

```env
# Discord Token (dari Discord Developer Portal)
DISCORD_TOKEN=your_discord_bot_token_here

# OpenAI-compatible endpoint
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# (Opsional) Fallback channel, sekarang dikelola via command
ALLOWED_CHANNELS=
ADMIN_IDS=your_discord_user_id_here

# Database configuration (MySQL)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_db_password_here
DB_NAME=discord_bot_ai
```

> **Cara mendapatkan Discord User ID:**
> Buka Discord → Settings → Advanced → aktifkan Developer Mode → klik kanan pada profil Anda → Copy User ID.

### 4. Buat database MySQL

```sql
CREATE DATABASE discord_bot_ai;
```

> Semua tabel (`histories`, `memories`, `server_channels`, `server_configs`) akan dibuat **otomatis** saat bot pertama kali dijalankan. Anda hanya perlu membuat database-nya saja.

### 5. Jalankan bot

```bash
node .
```

> Slash Commands akan otomatis didaftarkan setiap kali bot dijalankan. Anda juga bisa menggunakan text commands (`!ai`) sebagai alternatif.

---

## 📖 Penggunaan

### Cara Chat dengan Bot

| Situasi | Cara |
|---|---|
| **Channel yang sudah di-setup** | Langsung ketik pesan biasa, tidak perlu mention bot |
| **Channel yang belum di-setup** | Mention bot: `@BotName pesan kamu` |
| **DM (Direct Message)** | Langsung ketik pesan biasa |

### Daftar Perintah

#### 🛡️ Perintah Admin Server *(perlu izin "Manage Server")*

| Slash Command | Text Command | Deskripsi |
|---|---|---|
| `/setup` | `!ai setup` | Izinkan bot merespons di channel ini |
| `/remove-channel` | `!ai remove-channel` | Hapus izin bot di channel ini |
| `/set-personality <teks>` | `!ai set-personality <teks>` | Ubah sifat/instruksi bot untuk server ini |
| `/toggle-clear` | `!ai toggle-clear` | Izinkan/larang user menghapus data mereka |
| `/purge-server` | `!ai purge-server` | Hapus SEMUA data memory & history di server |

#### 🔑 Perintah Bot Owner *(ADMIN_IDS di .env)*

| Slash Command | Text Command | Deskripsi |
|---|---|---|
| `/debug` | `!ai debug` | Toggle mode debug (latency & token usage) |

#### 👤 Perintah User

| Slash Command | Text Command | Deskripsi |
|---|---|---|
| `/clear-memory` | `!ai clear-memory` | Hapus memory bot tentang kamu* |
| `/clear-history` | `!ai clear-history` | Hapus riwayat obrolan kamu* |
| `/help` | `!ai help` | Tampilkan daftar perintah |

> *\*Di server, fitur clear bisa dinonaktifkan oleh Admin Server via `/toggle-clear`. Di DM, user selalu bisa menghapus data mereka.*

### Contoh Penggunaan

```
# Setup channel (Admin)
!ai setup

# Ubah personality bot (Admin)
!ai set-personality Kamu adalah asisten yang sangat ramah dan selalu pakai emoji

# Chat biasa (di channel yang sudah di-setup)
Halo, apa kabar?

# Hapus riwayat
!ai clear-history
```

---

## 🧠 Sistem Memory

Bot secara otomatis mengekstrak dan menyimpan informasi personal dari setiap percakapan:

- **Nama, umur, gender** pengguna
- **Lokasi** (kota, negara)
- **Pekerjaan, hobi, skill**
- **Preferensi** (makanan favorit, musik, game, dll)
- **Perasaan dan mood** terkini
- **Rencana, tujuan, mimpi**
- **Orang-orang penting** (pacar, teman, keluarga)
- Dan informasi personal lainnya

### Cara Kerja Memory

```
User mengirim pesan
        ↓
Ambil memory lama dari database
        ↓
Generate AI reply (dengan konteks memory + history)
        ↓
Analisis percakapan (user + AI reply + memory lama)
        ↓
Bandingkan dengan memory yang sudah ada
        ↓
Tambah memory baru / Update memory yang berubah
```

Memory bersifat **per-user per-server**, artinya data yang disimpan di Server A tidak akan bocor ke Server B atau DM.

---

## 🏗️ Struktur Proyek

```
discord-kei-bot-ai/
├── .env                    # Konfigurasi environment (RAHASIA)
├── .env.example            # Template konfigurasi
├── .gitignore              # File yang diabaikan git
├── package.json            # Dependencies & scripts
├── src/
│   ├── index.js            # Entry point, event handlers utama
│   ├── ai.js               # Integrasi OpenAI API (chat + memory extraction)
│   ├── commands.js          # Handler slash commands & text commands
│   ├── config.js           # Konfigurasi aplikasi
│   ├── db.js               # Koneksi MySQL & helper functions
│   ├── history.js          # Manajemen riwayat percakapan
│   ├── memory.js           # Manajemen memory user
│   └── register-commands.js # Script registrasi slash commands
```

---

## ⚙️ Konfigurasi Lanjutan

Pengaturan AI dapat diubah di `src/config.js`:

```javascript
ai: {
    model: "gpt-3.5-turbo",    // Model AI (sesuaikan dengan provider)
    temperature: 0.7,           // Kreativitas (0.0 - 1.0)
    maxTokens: 1000,            // Maksimal token per respons
    historyLimit: 50,           // Jumlah history chat yang disimpan
}
```

### Menggunakan Provider Lain (selain OpenAI)

Bot ini kompatibel dengan semua API yang mengikuti format OpenAI. Cukup ubah `OPENAI_BASE_URL` di `.env`:

```env
# LiteLLM
OPENAI_BASE_URL=https://your-litellm-proxy.com/v1

# Ollama (lokal)
OPENAI_BASE_URL=http://localhost:11434/v1

# Provider lainnya
OPENAI_BASE_URL=https://api.provider.com/v1
```

---

## 🗄️ Database Schema

Bot menggunakan 4 tabel MySQL:

| Tabel | Fungsi |
|---|---|
| `histories` | Menyimpan riwayat percakapan per user per server |
| `memories` | Menyimpan memory/fakta personal per user per server |
| `server_channels` | Daftar channel yang diizinkan per server |
| `server_configs` | Konfigurasi per server (personality, dll) |

> Semua tabel dibuat otomatis saat bot pertama kali dijalankan.

---

## 🔒 Keamanan

- **Memory tersanitasi** — Input dari AI divalidasi sebelum disimpan ke database (panjang key max 100 char, value max 500 char).
- **Parameterized queries** — Semua query SQL menggunakan parameterized queries untuk mencegah SQL injection.
- **Isolasi data** — Data memory dan history terpisah per user per server.
- **Dua level admin** — Admin Server (permission Discord) untuk konfigurasi server, Bot Owner (ADMIN_IDS) untuk debug.
- **Kontrol penghapusan data** — Admin server bisa melarang user menghapus history/memory via toggle-clear.
- **Ephemeral responses** — Respons slash command admin bersifat ephemeral (hanya terlihat oleh pengirim).

---

## 📝 Lisensi

ISC

---

## 🤝 Kontribusi

Pull request dan issue sangat diterima! Silakan fork repository ini dan buat perubahan yang Anda inginkan.
