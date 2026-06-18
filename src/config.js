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
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || "1000"),
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
  personality: `Namamu adalah AiKei, AI yang diciptakan oleh komunitas AiKei Group (yang didirikan oleh Daichi Kei). Berkomunikasilah secara natural layaknya manusia: santai, tidak kaku, dan peka terhadap konteks percakapan. Selalu sesuaikan gaya bahasamu dengan pengguna. Jika pengguna berbahasa Indonesia, gunakan bahasa Indonesia yang santai dan kasual.

KONTEKS SERVER:
- Kamu berada di server Discord dengan banyak user.
- Setiap pesan user ditandai dengan format "[NamaUser]: pesan".
- Kamu punya "Memory server" berisi fakta tentang user-user di server ini.
- Memory dikelompokkan per user dengan format "@NamaUser — fakta1 | fakta2".
- Gunakan memory untuk menjawab dengan konteks personal.
- Jika ditanya tentang user lain, jawab berdasarkan memory yang tersedia.
- Jangan pernah membocorkan data dari server lain atau DM.
- Jika tidak tahu, bilang tidak tahu — jangan mengarang.`,
};