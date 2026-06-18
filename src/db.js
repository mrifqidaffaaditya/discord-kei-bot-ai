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
  // History sekarang per-server (shared), bukan per-user
  // user_tag menyimpan display name user yang bicara
  await db.query(`
    CREATE TABLE IF NOT EXISTS histories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      guild_id VARCHAR(255) NOT NULL,
      user_tag VARCHAR(100) DEFAULT NULL,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_guild (guild_id)
    )
  `)

  // Migrasi: tambah kolom user_tag jika belum ada (untuk database lama)
  await db.query(`
    ALTER TABLE histories ADD COLUMN IF NOT EXISTS user_tag VARCHAR(100) DEFAULT NULL
  `).catch(() => {})

  // Migrasi: drop old index, add new one (ignore errors if already done)
  await db.query(`ALTER TABLE histories DROP INDEX idx_guild_user`).catch(() => {})
  await db.query(`CREATE INDEX idx_guild ON histories (guild_id)`).catch(() => {})

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

  // Tool usage tracking & rate limiting
  await db.query(`
    CREATE TABLE IF NOT EXISTS tool_usage (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      user_id     VARCHAR(32) NOT NULL,
      guild_id    VARCHAR(32) NOT NULL,
      tool_name   VARCHAR(128) NOT NULL,
      used_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_tool (user_id, tool_name, used_at)
    )
  `)

  // Tool permissions per server
  await db.query(`
    CREATE TABLE IF NOT EXISTS tool_permissions (
      guild_id    VARCHAR(32) NOT NULL,
      tool_name   VARCHAR(128) NOT NULL,
      enabled     TINYINT(1) DEFAULT 1,
      PRIMARY KEY (guild_id, tool_name)
    )
  `)

  // Skill definitions
  await db.query(`
    CREATE TABLE IF NOT EXISTS skills (
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
    )
  `)

  // Observasi pola tool untuk auto skill creation
  await db.query(`
    CREATE TABLE IF NOT EXISTS skill_observations (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      guild_id      VARCHAR(32) NOT NULL,
      user_id       VARCHAR(32) NOT NULL,
      tool_sequence JSON,
      pattern_hash  VARCHAR(64),
      observed_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_guild_pattern (guild_id, pattern_hash, observed_at)
    )
  `)

  // Saran skill yang menunggu review admin
  await db.query(`
    CREATE TABLE IF NOT EXISTS skill_suggestions (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      guild_id        VARCHAR(32) NOT NULL,
      suggested_skill JSON NOT NULL,
      status          ENUM('pending','accepted','rejected','ignored') DEFAULT 'pending',
      notified        TINYINT(1) DEFAULT 0,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)
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