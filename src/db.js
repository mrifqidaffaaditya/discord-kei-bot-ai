import mysql from 'mysql2/promise'
import { CONFIG } from './config.js'

export const db = mysql.createPool({
  host: CONFIG.db_host,
  user: CONFIG.db_user,
  password: CONFIG.db_password,
  database: CONFIG.db_name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
})

export async function initDb() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS histories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_guild_user (guild_id, user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS memories (
      guild_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      \`key\` VARCHAR(100) NOT NULL,
      value VARCHAR(500) NOT NULL,
      PRIMARY KEY (guild_id, user_id, \`key\`)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS server_channels (
      guild_id VARCHAR(255),
      channel_id VARCHAR(255),
      PRIMARY KEY (guild_id, channel_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS server_configs (
      guild_id VARCHAR(255) PRIMARY KEY,
      personality TEXT,
      allow_clear BOOLEAN DEFAULT TRUE
    )
  `)

  // Tambahkan kolom allow_clear jika belum ada (untuk database lama)
  await db.query(`
    ALTER TABLE server_configs ADD COLUMN IF NOT EXISTS allow_clear BOOLEAN DEFAULT TRUE
  `).catch(() => {})
}

export async function isAllowedChannel(guildId, channelId) {
  const [rows] = await db.query(
    `SELECT 1 FROM server_channels WHERE guild_id = ? AND channel_id = ?`,
    [guildId, channelId]
  )
  return rows.length > 0
}

export async function addAllowedChannel(guildId, channelId) {
  await db.query(
    `INSERT IGNORE INTO server_channels (guild_id, channel_id) VALUES (?, ?)`,
    [guildId, channelId]
  )
}

export async function removeAllowedChannel(guildId, channelId) {
  await db.query(
    `DELETE FROM server_channels WHERE guild_id = ? AND channel_id = ?`,
    [guildId, channelId]
  )
}

export async function getPersonality(guildId) {
  const [rows] = await db.query(
    `SELECT personality FROM server_configs WHERE guild_id = ?`,
    [guildId]
  )
  return rows.length > 0 ? rows[0].personality : null
}

export async function setPersonality(guildId, personality) {
  await db.query(
    `INSERT INTO server_configs (guild_id, personality) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE personality = ?`,
    [guildId, personality, personality]
  )
}

export async function getAllowClear(guildId) {
  const [rows] = await db.query(
    `SELECT allow_clear FROM server_configs WHERE guild_id = ?`,
    [guildId]
  )
  // Default: true (user boleh hapus)
  return rows.length > 0 ? Boolean(rows[0].allow_clear) : true
}

export async function setAllowClear(guildId, allow) {
  await db.query(
    `INSERT INTO server_configs (guild_id, allow_clear) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE allow_clear = ?`,
    [guildId, allow, allow]
  )
}