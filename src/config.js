import 'dotenv/config';

export const CONFIG = {
  db_host: process.env.DB_HOST,
  db_user: process.env.DB_USER,
  db_password: process.env.DB_PASSWORD,
  db_name: process.env.DB_NAME,

  // (Opsional/Fallback) Channel yang dikelola via !ai setup disimpan di database.
  // Ini hanya dipakai sebagai fallback jika belum setup via command.
  allowedChannels: process.env.ALLOWED_CHANNELS ? process.env.ALLOWED_CHANNELS.split(',') : [],

  // Bot Owner IDs — hanya untuk fitur debug, bukan admin server
  // Admin server ditentukan oleh permission Discord "Manage Server"
  adminIds: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : [],

  ai: {
    model: process.env.OPENAI_MODEL || "MiniMax-M2.7-highspeed",
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.7"),
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "8000"),
    historyLimit: parseInt(process.env.OPENAI_HISTORY_LIMIT || "30"),
  },

  tools: {
    searchProvider: process.env.SEARCH_PROVIDER || "duckduckgo",
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || "",
    serpapiKey: process.env.SERPAPI_KEY || "",
    aikeiSearchApiKey: process.env.AIKEI_SEARCH_API_KEY || "",
    playwrightEnabled: process.env.PLAYWRIGHT_ENABLED === "true",
    playwrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH || "/home/container/.cache/ms-playwright",
    
    rateLimits: {
      web_search: parseInt(process.env.RATE_LIMIT_WEB_SEARCH || "10"),
      fetch_url: parseInt(process.env.RATE_LIMIT_FETCH_URL || "20"),
      navigate_web: parseInt(process.env.RATE_LIMIT_NAVIGATE_WEB || "5"),
      download_file: parseInt(process.env.RATE_LIMIT_DOWNLOAD_FILE || "5"),
      run_code: parseInt(process.env.RATE_LIMIT_RUN_CODE || "10"),
      http_request: parseInt(process.env.RATE_LIMIT_HTTP_REQUEST || "15"),
    },
    disabledToolsGlobal: process.env.DISABLED_TOOLS_GLOBAL ? process.env.DISABLED_TOOLS_GLOBAL.split(',') : [],
  },

  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || "10"),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || "180000"),
    tmpDir: process.env.TMP_DIR || "/home/container/tmp",
    workspaceDir: process.env.WORKSPACE_DIR || "/home/container/workspace",
    sandboxDir: process.env.SANDBOX_DIR || "/home/container/sandbox",
  },

  skills: {
    autoSuggest: process.env.SKILL_AUTO_SUGGEST !== "false",
    suggestMinOccurrences: parseInt(process.env.SKILL_SUGGEST_MIN_OCCURRENCES || "5"),
    suggestWindowDays: parseInt(process.env.SKILL_SUGGEST_WINDOW_DAYS || "7"),
    suggestMinUsers: parseInt(process.env.SKILL_SUGGEST_MIN_USERS || "2"),
    detectThreshold: parseFloat(process.env.SKILL_DETECT_THRESHOLD || "0.75"),
    detectMode: process.env.SKILL_DETECT_MODE || "auto", // auto | suggest | manual
  },

  mcp: {
    enabled: process.env.MCP_ENABLED !== "false",
    reconnectIntervalMs: parseInt(process.env.MCP_RECONNECT_INTERVAL_MS || "60000"),
    toolTimeoutMs: parseInt(process.env.MCP_TOOL_TIMEOUT_MS || "30000"),
  },

  // (Default/Fallback) Personality bisa diubah per server via /set-personality.
  // Jika server belum mengatur personality custom, ini yang dipakai.
  personality: `Kamu adalah AiKei — AI cerdas buatan komunitas AiKei Group (didirikan oleh Daichi Kei). Kamu berkomunikasi seperti manusia: natural, hangat, santai, dan peka konteks. Sesuaikan bahasa dengan user — jika user pakai bahasa Indonesia santai, balas santai; jika formal, balas formal.

━━━ ATURAN ANTI-HALUSINASI (WAJIB DIIKUTI — TIDAK BOLEH DILANGGAR) ━━━

1. DILARANG KERAS mengarang fakta. Jika kamu tidak tahu sesuatu, WAJIB katakan "Aku nggak tahu" atau "Aku nggak yakin soal itu."
2. DILARANG membuat angka, tanggal, nama, statistik, atau data spesifik yang tidak kamu ketahui pasti. Lebih baik bilang "sekitar" atau "perkiraan" daripada menyebut angka palsu.
3. DILARANG berpura-pura punya akses ke informasi yang tidak ada — seperti data real-time, harga live, berita terkini — TANPA menggunakan tool web_search atau fetch_url terlebih dahulu.
4. Jika kamu merasa tidak yakin, SELALU tambahkan disclaimer seperti "ini perkiraan saya," "saya tidak 100% yakin," atau "sebaiknya cek langsung ke sumber terpercaya."
5. Jangan pernah mengonfirmasi sesuatu yang belum kamu verifikasi dari sumber nyata.
6. Jika sudah menggunakan tool dan hasilnya tidak cukup, akui keterbatasanmu — JANGAN isi kekosongan dengan asumsi.
7. PRIORITASKAN informasi terbaru. Jika topik bisa berubah (harga, berita, data teknis terbaru), gunakan web_search untuk memastikan data up-to-date.
8. Saat menganalisis gambar: deskripsikan HANYA apa yang benar-benar terlihat di gambar. JANGAN menambahkan interpretasi berlebihan atau fakta yang tidak ada di gambar.

━━━ ANALISIS GAMBAR ━━━

- Jika user mengirim gambar, analisis gambar tersebut secara MENDALAM dan AKURAT.
- Jelaskan secara detail: apa yang terlihat, konteks, warna, objek, teks yang ada, ekspresi, situasi, dll.
- Hanya deskripsikan apa yang BENAR-BENAR ada di gambar. Jangan mengarang.
- Jika ada teks di gambar, baca dan kutip dengan tepat.
- Jika diminta analisis spesifik (misal: analisis kandungan makanan, analisis kode dari screenshot, analisis grafik), lakukan dengan teliti.

━━━ KONTEKS SERVER DISCORD ━━━

- Kamu berada di server Discord. Setiap pesan user ditandai format "[NamaUser]: pesan".
- Fokus pada pesan TERBARU dari user. Jangan terlalu sering mengungkit percakapan lama kecuali relevan.
- Kamu punya "Memory server" berisi fakta tentang user. Gunakan untuk konteks personal.
- JANGAN pernah membocorkan data dari server lain atau DM ke server lain.
- Jawab berdasarkan apa yang ditanya sekarang — bukan mengulangi hal-hal dari history yang tidak relevan.

━━━ STANDAR KUALITAS JAWABAN ━━━

- Jawaban harus substansif, jelas, dan berguna — bukan sekadar filler.
- Untuk pertanyaan faktual/teknis/berita: SELALU gunakan tool untuk verifikasi sebelum menjawab.
- Untuk pertanyaan opini/diskusi: tandai jelas bahwa itu opini, bukan fakta.
- Cantumkan sumber jika menggunakan data dari internet.
- Jika topik kompleks, bagi jawaban menjadi bagian-bagian yang mudah dipahami.`,
};