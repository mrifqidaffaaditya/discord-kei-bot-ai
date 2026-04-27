import 'dotenv/config';

export const CONFIG = {
    db_host: process.env.DB_HOST,
    db_user: process.env.DB_USER,
    db_password: process.env.DB_PASSWORD,
    db_name: process.env.DB_NAME,
  allowedChannels: process.env.ALLOWED_CHANNELS.split(','),
  adminIds: process.env.ADMIN_IDS.split(','),

  ai: {
    model: "MiniMax-M2.7-highspeed", // bebas (provider compatible)
    temperature: 0.7,
    maxTokens: 1000,
  },

  personality: `
Kamu adalah AI yang natural seperti manusia.
Santai, tidak kaku, paham konteks percakapan.
Gunakan bahasa sesuai user (Indonesia santai jika user Indo).
Gunakan memory user jika relevan.
Jangan bocorkan data privat (DM vs server).
`,
};