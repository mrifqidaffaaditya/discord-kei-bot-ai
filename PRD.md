# Product Requirements Document (PRD)
## Transformasi AiKei Bot → Full Autonomous Agent Discord Bot

**Proyek:** discord-kei-bot-ai → Kei Agent Bot
**Versi:** 2.0
**Tanggal:** 18 Juni 2026
**Penulis:** [Nama Kamu]
**Status:** Draft
**Changelog:** v2.0 — Tambah Skill System (auto-create, auto-detect, link install) + MCP Integration

---

## 1. Latar Belakang & Tujuan

### 1.1 Kondisi Saat Ini (Source Existing)

Bot saat ini (`discord-kei-bot-ai`) adalah chatbot AI Discord berbasis **Discord.js v14** dengan fitur:

- Chat dengan AI (OpenAI-compatible API)
- Memory jangka panjang per user per server (MySQL)
- History percakapan (50 pesan)
- Konfigurasi personality per-server
- Slash Commands & Text Commands (`/` dan `!ai`)
- Debug mode

**Keterbatasan:** Bot hanya mampu *berbicara* — tidak bisa mengambil tindakan nyata, tidak punya kemampuan yang bisa diperluas secara dinamis, dan tidak bisa terhubung ke layanan eksternal.

### 1.2 Tujuan Transformasi

Mengubah bot dari sebuah *chatbot pasif* menjadi **autonomous agent yang dapat diperluas sendiri**, dengan kemampuan:

1. Menjalankan tool/aksi nyata (search, browse, download, dll)
2. Membuat, menyimpan, dan menjalankan **skill** yang bisa dipelajari dari kebiasaan server
3. Memasang skill baru otomatis dari link eksternal
4. Terhubung ke layanan eksternal via **MCP (Model Context Protocol)**

Semua ini tetap berjalan di **Pterodactyl panel dengan egg Node.js General**.

---

## 2. Cakupan Pekerjaan (Scope)

### 2.1 Yang Dikerjakan (In Scope)

- Refaktor arsitektur bot agar mendukung **tool-calling / function-calling**
- Implementasi tool built-in: web search, fetch URL, navigasi web, download, run code, file ops, HTTP request
- **Skill System**: pembuatan, penyimpanan, eksekusi, dan manajemen skill per server
- **Auto Skill Creation**: bot belajar dari percakapan dan kebiasaan server, lalu menawarkan pembuatan skill baru
- **Skill Install via Link**: bot fetch dan pasang skill dari URL (GitHub raw, Gist, pastebin, dll)
- **Auto Skill Detection**: bot mengenali konteks percakapan dan memilih skill yang relevan secara otomatis
- **MCP Client Integration**: bot bisa connect ke MCP server eksternal dan menggunakan tool-nya
- Adaptasi untuk Pterodactyl Node.js egg (tanpa Docker custom, tanpa root)
- Migrasi/kompatibilitas database MySQL yang sudah ada

### 2.2 Yang Tidak Dikerjakan (Out of Scope)

- Perubahan ke bahasa pemrograman lain (tetap Node.js)
- Migrasi database ke engine lain (tetap MySQL)
- Pembuatan dashboard web admin
- Implementasi voice channel
- Menjadi MCP *server* (bot hanya sebagai MCP *client*)
- Skill marketplace/registry terpusat (disimpan per-bot secara lokal)

---

## 3. Kebutuhan Fungsional

---

### 3.1 Sistem Agent Core

**F-01 — Tool Calling Engine**

Bot mengintegrasikan mekanisme *tool calling* ke OpenAI-compatible API. Siklus per percakapan:

1. User kirim pesan → bot kirim ke AI beserta daftar tool yang tersedia (built-in + skill aktif + MCP tools)
2. AI putuskan apakah perlu panggil tool atau langsung jawab
3. Jika tool dipanggil: bot eksekusi tool, hasil dikembalikan ke AI
4. AI berikan respons final
5. Respons dikirim ke Discord, history & memory diupdate

**F-02 — Loop Agent**

Agent mendukung *multi-step reasoning* — AI bisa memanggil tool berantai hingga task selesai atau batas iterasi (default max 10 iterasi). Setiap iterasi di-log untuk debug.

**F-03 — Timeout & Progress Indicator**

- Pesan sementara "⏳ Sedang memproses..." dikirim, di-edit saat selesai
- Timeout paksa 3 menit dengan notifikasi ke user
- Jika task panjang, bot update progress setiap 30 detik ("⏳ Masih berjalan... [langkah 3/10]")

---

### 3.2 Tool Built-in

#### T-01: `web_search`
| | |
|---|---|
| Input | `query`, `num_results` (default 5) |
| Output | Array: judul, URL, snippet |
| Library | `axios` + DuckDuckGo / Brave Search API / SerpAPI |

#### T-02: `fetch_url`
| | |
|---|---|
| Input | `url`, `selector` (CSS selector, opsional) |
| Output | Teks halaman, judul, status HTTP |
| Library | `axios` + `cheerio` |
| Batas | Max 50KB, timeout 15 detik |

#### T-03: `navigate_web`
| | |
|---|---|
| Input | `steps` (array: goto, click, fill, extract, screenshot) |
| Output | Data yang diekstrak, screenshot opsional |
| Library | `playwright-chromium` |
| Catatan | `PLAYWRIGHT_BROWSERS_PATH=/home/container/.cache/ms-playwright` |

#### T-04: `download_file`
| | |
|---|---|
| Input | `url`, `filename` (opsional) |
| Output | Attachment Discord atau pesan link jika >25MB |
| Library | `axios` stream |
| Batas | Max 25MB, file temp di `/home/container/tmp/` lalu dihapus |

#### T-05: `run_code`
| | |
|---|---|
| Input | `language` (js/python), `code` |
| Output | stdout, stderr, exit code |
| Library | `vm2` (JS) atau `child_process` terisolasi (Python) |
| Keamanan | Tanpa network, tanpa `process.env`, tanpa `require` native, timeout 10 detik |

#### T-06: `file_operation`
| | |
|---|---|
| Input | `operation` (read/write/delete/list), `path`, `content` |
| Output | Konten file atau konfirmasi |
| Batas | Hanya di `/home/container/workspace/`, max 5MB |

#### T-07: `http_request`
| | |
|---|---|
| Input | `method`, `url`, `headers`, `body` |
| Output | Status, headers, body respons |
| Keamanan | Blokir IP private, localhost, metadata cloud, timeout 30 detik |

#### T-08: `generate_image` *(Phase 2)*
| | |
|---|---|
| Input | `prompt`, `size` |
| Output | File gambar sebagai attachment Discord |
| Library | OpenAI Images API atau compatible |

---

### 3.3 Skill System

Skill adalah **kemampuan yang bisa dibuat, disimpan, dipelajari, dan diinstal** — berbeda dari tool built-in yang statis. Skill bisa berupa:

- Sekumpulan instruksi/prompt yang memberi bot perilaku baru
- Wrapper atas tool built-in dengan parameter yang sudah dikonfigurasi
- Workflow multi-langkah yang bisa dipanggil dengan nama pendek
- Kode JavaScript kecil yang dieksekusi sebagai tool kustom

#### 3.3.1 Konsep Skill

Setiap skill disimpan sebagai objek JSON dengan struktur:

```json
{
  "id": "skill_abc123",
  "name": "cek_harga_tokopedia",
  "description": "Cek harga produk di Tokopedia dengan keyword tertentu",
  "version": "1.0",
  "author": "user#1234",
  "guild_id": "12345678",
  "scope": "guild",
  "type": "workflow",
  "trigger_patterns": ["cek harga", "berapa harga", "tokopedia"],
  "definition": {
    "steps": [
      { "tool": "web_search", "params": { "query": "{{input}} site:tokopedia.com" } },
      { "tool": "fetch_url", "params": { "url": "{{step1.results[0].url}}" } }
    ],
    "output_template": "Harga {{input}}: {{step2.content}}"
  },
  "enabled": true,
  "usage_count": 42,
  "created_at": "2026-06-18T00:00:00Z"
}
```

**Tipe Skill:**

| Tipe | Deskripsi | Contoh |
|---|---|---|
| `prompt` | Instruksi tambahan ke sistem prompt | "Selalu jawab dalam bahasa Jawa" |
| `workflow` | Serangkaian langkah tool yang sudah dikonfigurasi | "Cek harga di Tokopedia" |
| `code` | JavaScript kecil yang jalan sebagai tool | Konversi mata uang live |
| `persona` | Override personality bot di konteks tertentu | "Jadilah tutor matematika" |
| `mcp_wrapper` | Shortcut ke tool MCP tertentu dengan params preset | "Kirim ke Slack #general" |

#### 3.3.2 F-10 — Pembuatan Skill Manual

User atau admin bisa membuat skill baru via command:

| Command | Fungsi |
|---|---|
| `/skill-create` | Buka modal interaktif untuk isi nama, deskripsi, tipe, dan definisi skill |
| `/skill-edit <nama>` | Edit skill yang sudah ada |
| `/skill-delete <nama>` | Hapus skill |
| `/skill-list` | Lihat semua skill aktif di server |
| `/skill-info <nama>` | Detail lengkap sebuah skill |
| `/skill-enable <nama>` | Aktifkan skill |
| `/skill-disable <nama>` | Nonaktifkan skill sementara |
| `/skill-run <nama> [input]` | Jalankan skill secara eksplisit |
| `!ai skill create ...` | Versi text command dari `/skill-create` |

Untuk skill tipe `code`, konten JavaScript di-sandbox via `vm2` (sama seperti `run_code`).

Scope skill:
- `guild` — hanya tersedia di server tempat dibuat
- `global` — tersedia di semua server (hanya bot owner yang bisa set ini)

#### 3.3.3 F-11 — Auto Skill Creation (Belajar dari Kebiasaan)

Bot **menganalisis pola percakapan** di server secara pasif dan menawarkan pembuatan skill otomatis ketika mendeteksi kebiasaan berulang.

**Cara Kerja:**

1. Setiap percakapan yang melibatkan tool call dicatat ke tabel `skill_observations`
2. Background job berjalan setiap 24 jam (atau bisa di-trigger manual)
3. Job menganalisis observasi: jika pola yang sama muncul ≥5 kali dalam 7 hari dari ≥2 user berbeda → flag sebagai kandidat skill
4. Bot mengirim pesan ke channel admin (yang sudah di-setup) dengan saran skill:

```
💡 Saran Skill Baru untuk Server Ini

Saya perhatikan anggota server sering meminta hal serupa:
"cek harga [produk] di tokopedia" — 12 kali dalam 7 hari

Apakah kamu ingin saya buat skill otomatis untuk ini?
[✅ Ya, buat] [📝 Edit dulu] [❌ Abaikan]
```

5. Jika admin klik "Ya", skill dibuat otomatis dengan nama & definisi yang disarankan bot
6. Admin bisa edit sebelum disimpan

**Yang Dianalisis:**
- Urutan tool yang dipanggil dalam satu sesi
- Pola keyword dalam pesan user
- Frekuensi percakapan dengan topik yang sama
- Kombinasi input-output yang serupa

**F-11a — Observasi Pasif:** Bot tidak memproses konten pesan untuk analisis ini secara real-time. Hanya metadata tool call (nama tool, parameter, waktu) yang dicatat — bukan isi percakapan. Ini untuk menjaga privasi.

#### 3.3.4 F-12 — Install Skill via Link

User/admin bisa memasang skill dari URL eksternal dengan satu command:

```
/skill-install https://raw.githubusercontent.com/user/repo/main/skills/cek-cuaca.json
/skill-install https://gist.github.com/user/abc123
!ai skill install https://pastebin.com/raw/XYZ
```

**Alur Install:**

1. Bot fetch konten URL menggunakan `fetch_url` tool
2. Bot validasi format JSON apakah sesuai skema skill
3. Bot tampilkan preview skill ke admin:
   ```
   📦 Skill Ditemukan: cek_cuaca v1.2
   Deskripsi: Mengecek cuaca kota tertentu via wttr.in
   Tipe: workflow
   Author: someone
   Tools yang digunakan: fetch_url

   ⚠️ Pastikan kamu percaya sumber ini sebelum install.
   [✅ Install] [👀 Lihat kode] [❌ Batal]
   ```
4. Jika konfirmasi, skill disimpan ke database dengan `source_url` dicatat
5. Skill langsung aktif setelah install

**Validasi Keamanan saat Install:**
- Skill tipe `code` wajib review manual sebelum aktif (tidak langsung aktif otomatis)
- URL yang di-fetch divalidasi (tidak boleh IP private/internal)
- Konten maksimal 50KB
- Skill dari link tidak bisa set `scope: "global"` kecuali bot owner yang install

**Format yang Didukung:**
- JSON tunggal (satu skill)
- JSON array (bundle beberapa skill sekaligus)
- Format GitHub repo dengan `skills/` directory (auto-detect semua file `.json` di dalamnya)

#### 3.3.5 F-13 — Auto Skill Detection & Activation

Bot secara otomatis menentukan skill mana yang relevan untuk dipanggil berdasarkan konteks percakapan, tanpa user perlu menyebut nama skill secara eksplisit.

**Cara Kerja:**

1. Setiap pesan masuk, bot jalankan **skill matching** sebelum kirim ke AI:
   - Cocokkan teks pesan dengan `trigger_patterns` tiap skill (regex/keyword)
   - Hitung skor relevansi berdasarkan semantic similarity (embeddings ringan via API)
   - Jika skor ≥ threshold (default 0.75), skill di-inject ke context AI sebagai tool yang "disarankan"

2. AI tetap yang memutuskan apakah benar-benar memanggil skill atau tidak

3. Skill yang sering dipanggil otomatis (usage_count tinggi) diprioritaskan

4. Admin bisa set mode deteksi per server:
   - `auto` — deteksi & jalankan otomatis (default)
   - `suggest` — bot menyebut skill yang relevan, tapi user harus konfirmasi
   - `manual` — skill hanya jalan jika dipanggil eksplisit via `/skill-run`

**Contoh:**
```
User: "bro berapa harga RTX 4090 di tokopedia?"
Bot: [mendeteksi pola "berapa harga...tokopedia" → skill cek_harga_tokopedia cocok]
Bot: [memanggil skill → fetch hasil → menjawab dengan data aktual]
```

#### 3.3.6 Skema Database Skill

**Tabel: `skills`**
```sql
CREATE TABLE skills (
  id            VARCHAR(32) PRIMARY KEY,
  guild_id      VARCHAR(32),
  name          VARCHAR(128) NOT NULL,
  description   TEXT,
  version       VARCHAR(16) DEFAULT '1.0',
  author_id     VARCHAR(32),
  type          ENUM('prompt','workflow','code','persona','mcp_wrapper') NOT NULL,
  scope         ENUM('guild','global') DEFAULT 'guild',
  trigger_patterns JSON,
  definition    JSON NOT NULL,
  source_url    VARCHAR(512),
  enabled       TINYINT(1) DEFAULT 1,
  usage_count   INT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_guild (guild_id),
  INDEX idx_name (name)
);
```

**Tabel: `skill_observations`**
```sql
CREATE TABLE skill_observations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  guild_id    VARCHAR(32) NOT NULL,
  user_id     VARCHAR(32) NOT NULL,
  tool_sequence JSON,
  pattern_hash  VARCHAR(64),
  observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_pattern (guild_id, pattern_hash, observed_at)
);
```

**Tabel: `skill_suggestions`**
```sql
CREATE TABLE skill_suggestions (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  guild_id      VARCHAR(32) NOT NULL,
  suggested_skill JSON,
  status        ENUM('pending','accepted','rejected','ignored') DEFAULT 'pending',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 3.4 MCP (Model Context Protocol) Integration

Bot menjadi **MCP Client** — bisa connect ke MCP server mana pun dan menggunakan tool-nya seolah-olah tool built-in.

#### 3.4.1 F-20 — MCP Client Engine

Bot mengimplementasi MCP client menggunakan library `@modelcontextprotocol/sdk` (official SDK).

Alur kerja MCP:
1. Bot maintain daftar MCP server yang dikonfigurasi (per-bot, bukan per-server Discord)
2. Saat startup, bot connect ke semua MCP server yang enabled dan fetch daftar tools-nya
3. Tools dari MCP server dimasukkan ke pool tools yang tersedia untuk AI, dengan prefix namespace `mcp__<server_name>__<tool_name>`
4. Saat AI memanggil tool MCP, bot forward ke MCP server yang sesuai
5. Hasil dikembalikan ke AI

#### 3.4.2 F-21 — Konfigurasi MCP Server

MCP server dikonfigurasi di file `mcp_servers.json` di root project:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/container/workspace"],
      "enabled": true,
      "description": "Akses filesystem workspace"
    },
    {
      "name": "github",
      "type": "sse",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      },
      "enabled": false,
      "description": "GitHub integration"
    },
    {
      "name": "custom_api",
      "type": "sse",
      "url": "https://my-mcp-server.example.com/sse",
      "enabled": true,
      "description": "MCP server custom saya"
    }
  ]
}
```

Tipe koneksi yang didukung:
- `stdio` — spawn child process (untuk MCP server lokal, mis. official MCP servers)
- `sse` — Server-Sent Events via HTTP (untuk MCP server remote)

#### 3.4.3 F-22 — Command Manajemen MCP

| Command | Akses | Fungsi |
|---|---|---|
| `/mcp-list` | Bot Owner | Lihat semua MCP server yang dikonfigurasi & statusnya |
| `/mcp-tools <server_name>` | Bot Owner | Lihat semua tools dari satu MCP server |
| `/mcp-enable <server_name>` | Bot Owner | Aktifkan MCP server |
| `/mcp-disable <server_name>` | Bot Owner | Nonaktifkan MCP server |
| `/mcp-reconnect <server_name>` | Bot Owner | Reconnect ke MCP server (jika putus) |
| `/mcp-allow <server_name> <guild_id>` | Bot Owner | Izinkan guild tertentu akses tools dari MCP server ini |

**Access Control MCP per Guild:**
- Default: semua guild bisa akses semua MCP tools yang enabled
- Bot owner bisa restrict MCP server tertentu ke guild-guild tertentu saja
- Admin guild tidak bisa menambah MCP server (hanya bot owner)

#### 3.4.4 F-23 — Install MCP Server via Link

Bot owner bisa install MCP server baru langsung dari Discord:

```
!ai mcp-install https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search
!ai mcp-install npx @modelcontextprotocol/server-github
```

Alur:
1. Bot fetch README/package.json dari link untuk mendapatkan install command
2. Bot tampilkan preview: nama server, tools yang tersedia, command untuk run
3. Bot owner konfirmasi
4. Bot tambah entry ke `mcp_servers.json` dan restart koneksi MCP

#### 3.4.5 F-24 — MCP sebagai Sumber Skill

Skill tipe `mcp_wrapper` bisa dibuat sebagai shortcut ke tool MCP dengan parameter preset:

```json
{
  "type": "mcp_wrapper",
  "definition": {
    "mcp_server": "github",
    "mcp_tool": "create_issue",
    "preset_params": {
      "owner": "myorg",
      "repo": "myrepo"
    },
    "user_params": ["title", "body"]
  }
}
```

Ini memungkinkan admin guild membuat skill "buat issue GitHub di repo kami" tanpa user perlu tahu detail teknisnya.

---

### 3.5 Permission & Access Control

**F-30 — Hierarki Akses**

```
Bot Owner (ADMIN_IDS di .env)
  └── Konfigurasi global, MCP server, skill global, debug
      
Admin Server (Manage Server permission di Discord)
  └── Setup channel, personality, tool enable/disable, skill per-guild
      
User Biasa
  └── Chat, clear-memory, clear-history, skill-run (jika diizinkan)
```

**F-31 — Tool Permission Per Server**

| Command | Akses | Fungsi |
|---|---|---|
| `/tool-enable <nama>` | Admin Server | Aktifkan tool built-in di server |
| `/tool-disable <nama>` | Admin Server | Nonaktifkan tool built-in di server |
| `/tool-list` | Semua | Lihat tool aktif di server |

**F-32 — Rate Limiting Per Tool**

| Tool | Default per user/jam |
|---|---|
| `web_search` | 10x |
| `fetch_url` | 20x |
| `navigate_web` | 5x |
| `download_file` | 5x |
| `run_code` | 10x |
| `http_request` | 15x |
| Skill (per skill) | 20x |

Rate limit tersimpan di tabel `tool_usage` (MySQL), bisa di-override per server di `.env`.

---

### 3.6 Fitur Existing yang Dipertahankan

Semua fitur dari bot lama tetap berjalan tanpa perubahan:
- Memory system, History percakapan
- Konfigurasi per-server (personality, allowed channels)
- Slash Commands & Text Commands
- `/setup`, `/remove-channel`, `/set-personality`, `/toggle-clear`, `/purge-server`
- `/debug` mode, Typing indicator, Reply context

---

## 4. Kebutuhan Non-Fungsional

### 4.1 Kompatibilitas Pterodactyl

**NF-01** — Berjalan di Pterodactyl Node.js General egg, startup command `node .`

| Constraint | Solusi |
|---|---|
| Tanpa root/sudo | Semua install via `npm install` di `/home/container/` |
| Playwright Chromium | `PLAYWRIGHT_BROWSERS_PATH=/home/container/.cache/ms-playwright` |
| File temp | `/home/container/tmp/`, workspace `/home/container/workspace/` |
| MCP stdio servers | Spawn via `child_process` dengan path relatif ke `/home/container/` |
| Port satu | Bot tidak buka web server tambahan |
| Disk quota | Playwright ~300MB, tambah ruang untuk skill cache |

**NF-02** — Startup time < 30 detik (termasuk koneksi MCP server)

**NF-03** — Memory idle < 512MB RAM

### 4.2 Reliability

**NF-04** — Jika satu tool/skill/MCP gagal, agent tetap memberi respons fallback

**NF-05** — Semua error di-log: `[TOOL|SKILL|MCP][nama][ERROR] pesan`

**NF-06** — MCP server disconnect tidak crash bot — reconnect otomatis setiap 60 detik

### 4.3 Keamanan

**NF-07** — `run_code` dan skill tipe `code`: tanpa `process.env`, tanpa network, sandbox vm2

**NF-08** — `http_request` dan `fetch_url`: blokir IP private, localhost, metadata cloud

**NF-09** — Skill dari link: tipe `code` tidak aktif otomatis, wajib review admin

**NF-10** — MCP server: admin guild tidak bisa install MCP server baru

**NF-11** — Konten web di-sanitize sebelum dikirim ke Discord (max 2000 karakter)

---

## 5. Arsitektur Teknis

### 5.1 Struktur Direktori

```
discord-kei-bot-ai/
├── .env
├── .env.example
├── .gitignore
├── package.json
├── mcp_servers.json              # BARU: konfigurasi MCP servers
├── src/
│   ├── index.js                  # Entry point (minor update)
│   ├── ai.js                     # REFACTOR: tool-calling + skill loop
│   ├── commands.js               # UPDATE: tambah skill & mcp commands
│   ├── config.js                 # UPDATE: agent, skill, mcp config
│   ├── db.js                     # UPDATE: tabel baru
│   ├── history.js                # Tidak berubah
│   ├── memory.js                 # Tidak berubah
│   ├── register-commands.js      # UPDATE: commands baru
│   │
│   ├── tools/                    # BARU: tool built-in
│   │   ├── index.js              # Registrasi & dispatcher
│   │   ├── webSearch.js
│   │   ├── fetchUrl.js
│   │   ├── navigateWeb.js
│   │   ├── downloadFile.js
│   │   ├── runCode.js
│   │   ├── fileOperation.js
│   │   ├── httpRequest.js
│   │   └── rateLimit.js
│   │
│   ├── skills/                   # BARU: skill system
│   │   ├── index.js              # Registrasi, loader, dispatcher skill
│   │   ├── executor.js           # Eksekusi skill (workflow, code, prompt, dll)
│   │   ├── detector.js           # Auto-detect skill dari konteks
│   │   ├── installer.js          # Install skill dari URL
│   │   ├── observer.js           # Background job analisis kebiasaan
│   │   └── suggester.js          # Generate saran skill baru ke admin
│   │
│   └── mcp/                      # BARU: MCP client
│       ├── index.js              # MCP manager: connect, list, dispatch
│       ├── client.js             # MCP client wrapper (SDK)
│       ├── registry.js           # Registry tools dari semua MCP servers
│       └── installer.js          # Install MCP server baru via command
```

### 5.2 Alur Agent Loop Lengkap

```
User Message
    │
    ▼
[Skill Detector] ── scan trigger_patterns → tandai skill kandidat
    │
    ▼
Ambil: memory + history + skill aktif + MCP tools
    │
    ▼
Kirim ke AI API dengan:
  ├── system prompt (personality + memory + prompt-skills aktif)
  ├── messages history
  └── tools: [built-in tools] + [skill tools] + [mcp__*__* tools]
    │
    ▼
AI Response
    │
    ├── finish_reason: "stop" ──────────────────► Discord + update history/memory
    │
    └── finish_reason: "tool_calls"
              │
              ▼
         Untuk setiap tool_call:
           ├── Jika tool built-in → src/tools/
           ├── Jika skill → src/skills/executor.js
           └── Jika mcp__* → src/mcp/client.js → MCP server
              │
              ▼
         Validasi permission + rate limit
              │
              ▼
         Eksekusi → hasil → tambah ke messages
              │
              ▼
         [Skill Observer] catat tool sequence ke skill_observations
              │
              ▼
         Ulangi loop (max AGENT_MAX_ITERATIONS)
```

### 5.3 Skema Database Lengkap

**Tabel existing (tidak berubah):**
- `histories`, `memories`, `server_channels`, `server_configs`

**Tabel baru:**

```sql
-- Tool usage tracking & rate limiting
CREATE TABLE tool_usage (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(32) NOT NULL,
  guild_id    VARCHAR(32) NOT NULL,
  tool_name   VARCHAR(128) NOT NULL,
  used_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_tool (user_id, tool_name, used_at)
);

-- Tool permissions per server
CREATE TABLE tool_permissions (
  guild_id    VARCHAR(32) NOT NULL,
  tool_name   VARCHAR(128) NOT NULL,
  enabled     TINYINT(1) DEFAULT 1,
  PRIMARY KEY (guild_id, tool_name)
);

-- Skill definitions
CREATE TABLE skills (
  id              VARCHAR(32) PRIMARY KEY,
  guild_id        VARCHAR(32),
  name            VARCHAR(128) NOT NULL,
  description     TEXT,
  version         VARCHAR(16) DEFAULT '1.0',
  author_id       VARCHAR(32),
  type            ENUM('prompt','workflow','code','persona','mcp_wrapper') NOT NULL,
  scope           ENUM('guild','global') DEFAULT 'guild',
  trigger_patterns JSON,
  definition      JSON NOT NULL,
  source_url      VARCHAR(512),
  enabled         TINYINT(1) DEFAULT 1,
  usage_count     INT DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_guild (guild_id),
  INDEX idx_name_guild (name, guild_id)
);

-- Observasi pola tool untuk auto skill creation
CREATE TABLE skill_observations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  guild_id      VARCHAR(32) NOT NULL,
  user_id       VARCHAR(32) NOT NULL,
  tool_sequence JSON,
  pattern_hash  VARCHAR(64),
  observed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_pattern (guild_id, pattern_hash, observed_at)
);

-- Saran skill yang menunggu review admin
CREATE TABLE skill_suggestions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  guild_id        VARCHAR(32) NOT NULL,
  suggested_skill JSON NOT NULL,
  status          ENUM('pending','accepted','rejected','ignored') DEFAULT 'pending',
  notified        TINYINT(1) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Semua tabel dibuat **otomatis** saat bot pertama jalan.

### 5.4 Environment Variables

```env
# === EXISTING (tidak berubah) ===
DISCORD_TOKEN=
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
ALLOWED_CHANNELS=
ADMIN_IDS=
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=discord_bot_ai

# === TOOLS ===
SEARCH_PROVIDER=duckduckgo          # duckduckgo | brave | serpapi
BRAVE_SEARCH_API_KEY=
SERPAPI_KEY=

PLAYWRIGHT_BROWSERS_PATH=/home/container/.cache/ms-playwright
PLAYWRIGHT_ENABLED=true

RATE_LIMIT_WEB_SEARCH=10
RATE_LIMIT_FETCH_URL=20
RATE_LIMIT_NAVIGATE_WEB=5
RATE_LIMIT_DOWNLOAD_FILE=5
RATE_LIMIT_RUN_CODE=10
RATE_LIMIT_HTTP_REQUEST=15

DISABLED_TOOLS_GLOBAL=

# === AGENT ===
AGENT_MAX_ITERATIONS=10
AGENT_TIMEOUT_MS=180000

TMP_DIR=/home/container/tmp
WORKSPACE_DIR=/home/container/workspace
SANDBOX_DIR=/home/container/sandbox

# === SKILL SYSTEM ===
SKILL_AUTO_SUGGEST=true             # Aktifkan auto skill suggestion
SKILL_SUGGEST_MIN_OCCURRENCES=5     # Min berapa kali pola muncul sebelum disarankan
SKILL_SUGGEST_WINDOW_DAYS=7         # Jendela waktu analisis pola (hari)
SKILL_SUGGEST_MIN_USERS=2           # Min user berbeda yang harus ada dalam pola
SKILL_DETECT_THRESHOLD=0.75         # Skor minimum auto skill detection (0-1)
SKILL_DETECT_MODE=auto              # auto | suggest | manual

# === MCP ===
MCP_ENABLED=true
MCP_RECONNECT_INTERVAL_MS=60000     # Interval reconnect MCP server yang putus
MCP_TOOL_TIMEOUT_MS=30000           # Timeout tool call ke MCP server

# Token untuk MCP servers yang butuh auth (dicatat di mcp_servers.json via ${VAR})
GITHUB_TOKEN=
```

---

## 6. Dependencies

### 6.1 Dependencies Baru yang Ditambahkan ke `package.json`

| Package | Versi | Kegunaan |
|---|---|---|
| `axios` | `^1.7.x` | HTTP requests (tools) |
| `cheerio` | `^1.0.x` | HTML parsing (fetch_url) |
| `playwright-chromium` | `^1.44.x` | Headless browser (navigate_web) |
| `vm2` | `^3.9.x` | Sandbox JS (run_code, skill code) |
| `is-ip` | `^3.1.x` | Validasi IP (security) |
| `p-queue` | `^7.4.x` | Task queue (agent loop) |
| `mime-types` | `^2.1.x` | MIME detection (download) |
| `@modelcontextprotocol/sdk` | `^1.x.x` | MCP client SDK (official) |
| `cron` | `^3.x.x` | Background job (skill observer) |
| `ajv` | `^8.x.x` | JSON schema validation (skill install) |
| `fuse.js` | `^7.x.x` | Fuzzy matching (skill detection) |

> **Catatan Pterodactyl:** `playwright-chromium` download Chromium binary ~300MB ke `PLAYWRIGHT_BROWSERS_PATH`. Pastikan disk quota egg minimal 600MB free.

---

## 7. Rencana Implementasi (Phasing)

### Phase 1 — Core Agent Infrastructure (Minggu 1–2)
- [ ] Refaktor `ai.js`: tool-calling loop
- [ ] `src/tools/index.js`: dispatcher & registrasi
- [ ] Update `db.js`: tabel `tool_usage`, `tool_permissions`
- [ ] Update `config.js`: konfigurasi agent
- [ ] `rateLimit.js`
- [ ] Update `.env.example`

### Phase 2 — Tool Built-in (Minggu 2–3)
- [ ] `webSearch.js`, `fetchUrl.js`, `httpRequest.js`
- [ ] `downloadFile.js`, `fileOperation.js`
- [ ] `runCode.js` (vm2 sandbox)
- [ ] `navigateWeb.js` (Playwright) + test di Pterodactyl

### Phase 3 — Skill System Core (Minggu 3–4)
- [ ] Skema DB: tabel `skills`, `skill_observations`, `skill_suggestions`
- [ ] `skills/index.js`, `skills/executor.js`
- [ ] Commands: `/skill-create`, `/skill-list`, `/skill-run`, `/skill-delete`
- [ ] Skill tipe `prompt`, `workflow`, `persona`

### Phase 4 — Skill Advanced (Minggu 4–5)
- [ ] `skills/installer.js`: install dari URL
- [ ] `skills/detector.js`: auto-detect via trigger_patterns
- [ ] `skills/observer.js`: background job pola percakapan
- [ ] `skills/suggester.js`: kirim saran ke admin
- [ ] Skill tipe `code` (sandbox vm2)

### Phase 5 — MCP Integration (Minggu 5–6)
- [ ] `mcp_servers.json`: format konfigurasi
- [ ] `mcp/client.js`: MCP client (stdio + SSE)
- [ ] `mcp/registry.js`: fetch & cache daftar tools MCP
- [ ] Integrasi MCP tools ke agent loop
- [ ] Commands: `/mcp-list`, `/mcp-tools`, `/mcp-enable`, `/mcp-disable`
- [ ] `mcp/installer.js`: install MCP server via command
- [ ] Skill tipe `mcp_wrapper`

### Phase 6 — Polish & Testing (Minggu 6–7)
- [ ] End-to-end testing semua flow
- [ ] Error handling menyeluruh
- [ ] Sanitasi output
- [ ] Performance testing (memory, latency)
- [ ] Update README

---

## 8. Kriteria Selesai (Definition of Done)

1. ✅ Bot berjalan di Pterodactyl Node.js egg dengan `node .`
2. ✅ Semua fitur lama tetap berfungsi (chat, memory, history, commands)
3. ✅ Agent bisa web search, fetch URL, download file, run code, HTTP request
4. ✅ User bisa membuat skill baru via `/skill-create`
5. ✅ Skill bisa diinstall dari link URL dengan satu command
6. ✅ Bot mendeteksi skill yang relevan secara otomatis dari konteks percakapan
7. ✅ Bot menawarkan skill baru ke admin berdasarkan pola yang dideteksi (min 5 kali dalam 7 hari)
8. ✅ MCP server bisa dikonfigurasi dan tools-nya langsung tersedia ke AI
9. ✅ Bot owner bisa install MCP server baru via Discord command
10. ✅ Skill tipe `mcp_wrapper` berfungsi sebagai shortcut MCP tool
11. ✅ Rate limit berfungsi
12. ✅ Tidak crash jika tool/skill/MCP gagal
13. ✅ Skill tipe `code` dari link tidak aktif sebelum review admin
14. ✅ Timeout agent 3 menit dengan notifikasi ke user

---

## 9. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Playwright tidak bisa jalan di Pterodactyl node | navigate_web tidak berfungsi | `PLAYWRIGHT_ENABLED=false`, tool skip gracefully |
| Skill `code` yang berbahaya dari link | Keamanan server | Wajib review admin sebelum aktif, sandbox vm2 |
| MCP server remote down | Tools MCP tidak tersedia | Reconnect otomatis 60 detik, tools yang down di-skip gracefully dengan notifikasi |
| MCP SDK stdio spawn gagal di Pterodactyl | MCP stdio tidak bisa dipakai | Fallback ke SSE only, dokumentasikan batasan |
| Auto skill suggestion spam admin | Admin terganggu | Threshold minimal (5 kali, 2 user, 7 hari), maks 1 saran per topik per 7 hari |
| Skill detection false positive | AI memanggil skill yang salah | Threshold 0.75, mode `suggest` tersedia sebagai alternatif |
| Skill dari link mengandung data besar | Kenal bottleneck parsing | Batas 50KB konten skill |
| Agent loop infinite | Bot hang | Hard stop `AGENT_MAX_ITERATIONS=10` |
| MySQL slow untuk rate limit | Setiap request lambat | Indexing, bisa migrasi ke in-memory Map jika perlu |

---

## 10. Pertanyaan Terbuka (Open Questions)

1. **Search provider default?** DuckDuckGo (gratis, scraping) atau Brave Search API (berbayar, lebih stabil)? → Rekomendasikan: mulai DuckDuckGo, siapkan Brave sebagai opsi di `.env`

2. **Apakah Pterodactyl node support Chromium?** Playwright butuh `libglib2.0-0`, `libnss3`, dll. Perlu dicek apakah node egg sudah include dependencies ini.

3. **Disk quota egg berapa?** Playwright Chromium ~300MB, tambah workspace, tmp, skill cache.

4. **MCP server mana yang akan dipakai pertama?** Apakah ada MCP server spesifik yang sudah punya? Atau mulai dari official MCP servers (filesystem, fetch)?

5. **Embedding untuk skill detection?** Untuk semantic similarity di skill detection, apakah mau pakai embedding API (biaya token) atau hanya keyword/regex matching (gratis, akurasi lebih rendah)?

6. **Skill suggestion notification ke channel mana?** Channel yang sama dengan channel bot di-setup, atau perlu channel admin khusus?

---

*Dokumen ini adalah PRD v2.0 — mencakup scope lengkap termasuk Skill System dan MCP Integration. Detail implementasi teknis per modul dibuat dalam dokumen teknis terpisah saat coding dimulai.*
