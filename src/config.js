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
    model: "MiniMax-M2.7-highspeed", // bebas (provider compatible)
    temperature: 0.7,
    maxTokens: 1000,
    historyLimit: 30, // Jumlah history chat per server (shared timeline)
  },

  // (Default/Fallback) Personality bisa diubah per server via /set-personality.
  // Jika server belum mengatur personality custom, ini yang dipakai.
  personality: `Kamu adalah AI yang natural seperti manusia. Santai, tidak kaku, paham konteks percakapan.
Gunakan bahasa sesuai user (Indonesia santai jika user Indo).

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