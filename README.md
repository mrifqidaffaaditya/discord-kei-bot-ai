# 🤖 AiKei Bot — Discord AI Agent (v2.0)

Bot Discord AI dengan kemampuan **Autonomous Agentic Workflow** (perencanaan & eksekusi multi-step), memory jangka panjang cerdas, sistem auto-skill dinamis, koordinator client Model Context Protocol (MCP), dan panel administrasi komprehensif. Dibangun menggunakan **Discord.js v14**, **OpenAI-compatible API**, dan **MySQL**.

---

## ✨ Fitur Utama

- **🧠 Memory Cerdas Jangka Panjang** — Bot secara otomatis mengekstrak informasi personal user (nama, hobi, preferensi, dll) secara permanen di database. Memory diisolasi per-user per-server.
- **⚡ Autonomous Agent Loop** — Bot dapat merencanakan (planning), mengevaluasi, dan mengeksekusi tugas-tugas kompleks secara mandiri menggunakan sekuensial tool-calling (hingga maksimal 10 iterasi dengan timeout 3 menit).
- **🛠️ Registry Built-in Tools** — Dilengkapi berbagai tool bawaan yang dilindungi rate-limit dan enkripsi:
  - `web_search` — Pencarian web via DuckDuckGo, Brave, SerpAPI, atau custom API.
  - `fetch_url` — Membaca konten teks/markdown dari sebuah URL.
  - `navigate_web` — Navigasi dan screenshot halaman web menggunakan Playwright (headless).
  - `download_file` — Mengunduh file dengan verifikasi batas ukuran berkas yang aman.
  - `run_code` — Eksekusi kode JS/Python dalam sandbox terisolasi.
  - `http_request` — Mengirim custom request HTTP yang dilindungi dari SSRF (private IP blocklist).
  - `create_custom_tool` — Membuat tool kustom baru berbasis kode atau prompt secara dinamis.
- **📦 Dynamic Auto-Skill System** — Bot menganalisis pola pemanggilan tool berulang dan menyarankan pembuatan "skill" baru ke admin melalui Discord Embed dengan tombol Accept/Reject. Mendukung tipe skill: `prompt`, `workflow`, `code`, dan `persona`.
- **🔌 Client Model Context Protocol (MCP)** — Terhubung secara langsung dengan server MCP stdio seperti server `filesystem` dan `openbrowser` (otomatisasi browser berbasis AI-native).
- **🚀 Pterodactyl Auto-Startup** — Script [start.sh](file:///home/aditya/project/discord-kei-bot-ai/start.sh) yang dirancang khusus untuk deployment di panel Pterodactyl secara non-interaktif:
  - Otomatis menginstal paket npm & python (`openbrowser-ai`, `mcp`).
  - Mengunduh browser Chromium tanpa prompt sudo/root.
  - Men-sinkronisasikan parameter dari Environment Variables panel langsung ke berkas `.env`.

---

## 📋 Prasyarat

- **Node.js** v18 atau lebih baru.
- **Python** v3.10 atau lebih baru (dengan pip3).
- **MySQL** database server.
- **Discord Bot Token** dari [Discord Developer Portal](https://discord.com/developers/applications).
- **OpenAI-compatible API Key** (OpenAI, LiteLLM, AIKei Hermes, dll).

---

## 🚀 Instalasi & Menjalankan Bot

### 1. Clone repository
```bash
git clone https://github.com/username/discord-kei-bot-ai.git
cd discord-kei-bot-ai
```

### 2. Konfigurasi Environment & Startup Otomatis (Non-Interaktif)

Untuk mempermudah hosting (terutama pada panel Pterodactyl), bot ini menggunakan script [start.sh](file:///home/aditya/project/discord-kei-bot-ai/start.sh) yang akan menyiapkan seluruh dependensi secara otomatis:

1. Atur Environment Variables di panel hosting Anda atau buat berkas `.env` manual:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_BASE_URL=https://api.openai.com/v1
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_db_password_here
   DB_NAME=discord_bot_ai
   ```
2. Jalankan bot via script startup:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
   *Skrip ini otomatis menginstal dependensi node, python library, browser Chromium, memetakan env var panel ke `.env`, lalu menyalakan bot.*

---

## 📖 Panduan Penggunaan & Perintah

### Cara Berinteraksi dengan Bot

| Situasi | Cara Chat |
|---|---|
| **Channel terdaftar (Setup)** | Cukup ketik pesan biasa, bot akan memproses dan menggunakan tool jika diperlukan |
| **Channel belum terdaftar** | Mention bot di awal pesan: `@AiKei cari resep nasi goreng` |
| **DM (Direct Message)** | Langsung kirim pesan pribadi ke bot |

### Daftar Perintah

#### 🛡️ Perintah Admin Server *(perlu permission "Manage Server")*

| Perintah Slash | Perintah Teks | Deskripsi |
|---|---|---|
| `/setup` | `!ai setup` | Daftarkan channel ini agar bot merespons otomatis |
| `/remove-channel` | `!ai remove-channel` | Hapus izin bot merespons di channel ini |
| `/set-personality <teks>` | `!ai set-personality <teks>` | Kustomisasi instruksi dasar/sifat bot di server ini |
| `/toggle-clear` | `!ai toggle-clear` | Izinkan/larang user biasa menghapus data mereka |
| `/purge-server` | `!ai purge-server` | Hapus semua data memory & history server ini |
| `/clear-history` | `!ai clear-history` | Hapus riwayat obrolan di server ini |

#### 🛠️ Manajemen Tools *(Admin)*

| Perintah Slash | Perintah Teks | Deskripsi |
|---|---|---|
| `/tool-list` | `!ai tool-list` | Tampilkan status aktif/nonaktif built-in tools |
| `/tool-enable <nama>` | `!ai tool-enable <nama>` | Aktifkan tool tertentu untuk digunakan bot di server |
| `/tool-disable <nama>` | `!ai tool-disable <nama>` | Nonaktifkan tool tertentu |

#### 📦 Manajemen Skill *(Admin / User)*

| Perintah Slash | Perintah Teks | Deskripsi |
|---|---|---|
| `/skill-list` | `!ai skill-list` | Lihat daftar skill aktif di server ini |
| `/skill-info <nama>` | `!ai skill-info <nama>` | Lihat detail, tipe, author, dan trigger pattern skill |
| `/skill-run <nama> [input]` | `!ai skill-run <nama> [input]` | Jalankan skill secara manual dengan parameter input |
| `/skill-create` | *Hanya Slash* | Buat skill baru (`prompt`, `workflow`, `code`, `persona`) |
| `/skill-delete <nama>` | `!ai skill-delete <nama>` | Hapus skill dari database server |
| `/skill-enable <nama>` | `!ai skill-enable <nama>` | Aktifkan skill tertentu |
| `/skill-disable <nama>` | `!ai skill-disable <nama>` | Nonaktifkan skill tertentu |
| `/skill-install <url>` | `!ai skill-install <url>` | Instal kumpulan skill terverifikasi dari URL JSON |

#### 🔌 Manajemen Model Context Protocol (MCP) *(hanya Bot Owner)*

| Perintah Slash | Perintah Teks | Deskripsi |
|---|---|---|
| `/mcp-list` | `!ai mcp-list` | Tampilkan server MCP yang terdaftar di konfigurasi |
| `/mcp-tools <server>` | `!ai mcp-tools <server>` | Tampilkan daftar tools yang disediakan server MCP |
| `/mcp-enable <server>` | `!ai mcp-enable <server>` | Aktifkan server MCP tertentu |
| `/mcp-disable <server>` | `!ai mcp-disable <server>` | Nonaktifkan server MCP tertentu |
| `/mcp-reconnect <server>` | `!ai mcp-reconnect <server>` | Muat ulang koneksi stdio/sse ke server MCP |
| *Tidak Ada* | `!ai mcp-install <npx/git>` | Daftarkan dan pasang server MCP baru secara dinamis |

---

## 🧠 Desain Sistem Agentic & Memory

Ketika user mengirim pesan di channel yang aktif, Kei Agent menjalankan alur kerja berikut:
```
              Pesan Masuk (User)
                     ↓
       Ambil Memory Lama dari Database
                     ↓
        Inisialisasi Agent Loop & Tools
                     ↓
       AI Membuat Rencana (Planning Step)
                     ↓
       Panggil Tools (Web Search, MCP, dll.)
                     ↓
    Apakah Butuh Langkah Tambahan? (Maks 10x)
         ├── Ya  ──→ Eksekusi Tool & loop kembali
         └── Tidak ──→ Selesai
                     ↓
      Kirim Balasan ke Discord Chat
                     ↓
    Analisis Percakapan untuk Memory Baru
                     ↓
   Simpan / Perbarui Memory di Database MySQL
```

---

## 🗄️ Skema Database MySQL

Semua tabel database akan **dibuat secara otomatis** saat pertama kali bot dinyalakan:
1. `histories` — Menyimpan riwayat percakapan per server (shared context).
2. `memories` — Menyimpan fakta/informasi personal per-user per-server (isolated).
3. `server_channels` — Daftar ID channel yang diizinkan merespons otomatis.
4. `server_configs` — Konfigurasi personality server dan izin pembersihan data.
5. `tool_usage` — Pencatatan riwayat pemanggilan tool untuk statistik & rate-limiting.
6. `tool_permissions` — Pengaturan izin tool yang diaktifkan/dinonaktifkan per server.
7. `skills` — Definisi skill kustom (prompt, workflow, code, dll).
8. `skill_observations` — Log pemanggilan tool berurutan untuk analisis pola otomatis.
9. `skill_suggestions` — Daftar usulan skill baru menunggu persetujuan admin.

---

## 🏗️ Struktur Proyek

```
discord-kei-bot-ai/
├── package.json            # Scripts & dependensi Node.js
├── mcp_servers.json        # Konfigurasi server MCP (filesystem & openbrowser)
├── start.sh                # Skrip startup otonom non-interaktif
├── src/
│   ├── index.js            # Entry point bot & event Discord
│   ├── ai.js               # Core Agent Loop, Planning, & Memory Extraction
│   ├── commands.js         # Handler perintah teks & slash commands
│   ├── db.js               # Inisialisasi & Query database MySQL
│   ├── config.js           # Pengaturan parameter global & default
│   ├── history.js          # Pengelola riwayat percakapan
│   ├── memory.js           # Pengelola data memory user
│   ├── tools/              # Registry & implementasi built-in tools
│   ├── skills/             # Engine pendeteksi & pengeksekusi skill kustom
│   └── mcp/                # Client coordinator & parser instalasi MCP
```

---

## 🔒 Keamanan (Security)

- **SSRF protection** — `http_request` divalidasi menggunakan module `ssrf.js` untuk memblokir akses ke alamat IP privat/metadata cloud.
- **Sandbox execution** — Eksekusi kode dinamis terisolasi mencegah modifikasi pada system host utama.
- **Token Encrypted** — Semua kredensial diletakkan di berkas `.env` dan diabaikan dari git via `.gitignore`.

---

## 🤝 Kontribusi & Lisensi

Dibuat di bawah lisensi **ISC**. Pull Request & Issue sangat diterima untuk pengembangan fitur bot yang lebih pintar!
