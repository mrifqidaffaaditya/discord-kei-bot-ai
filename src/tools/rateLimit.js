import { db } from '../db.js'
import { CONFIG } from '../config.js'

/**
 * Cek apakah user terkena rate limit untuk tool tertentu
 * Rate limit didefinisikan per user per jam
 */
export async function checkRateLimit(userId, guildId, toolName) {
  // Bot Owner kebal terhadap rate limit
  if (CONFIG.adminIds.includes(userId)) {
    return true
  }

  const limit = CONFIG.tools.rateLimits[toolName]
  if (limit === undefined || limit === null) {
    return true // Tidak ada batasan
  }

  const [rows] = await db.query(
    `SELECT COUNT(*) as count FROM tool_usage 
     WHERE user_id = ? AND tool_name = ? AND used_at > NOW() - INTERVAL 1 HOUR`,
    [userId, toolName]
  )

  const count = rows[0]?.count || 0
  return count < limit
}

/**
 * Catat penggunaan tool oleh user
 */
export async function recordToolUsage(userId, guildId, toolName) {
  await db.query(
    `INSERT INTO tool_usage (user_id, guild_id, tool_name) VALUES (?, ?, ?)`,
    [userId, guildId, toolName]
  )
}

/**
 * Cek apakah tool diaktifkan di guild tersebut
 */
export async function checkToolEnabled(guildId, toolName) {
  // Cek global disabled tools dulu
  if (CONFIG.tools.disabledToolsGlobal.includes(toolName)) {
    return false
  }

  const [rows] = await db.query(
    `SELECT enabled FROM tool_permissions WHERE guild_id = ? AND tool_name = ?`,
    [guildId, toolName]
  )

  if (rows.length > 0) {
    return Boolean(rows[0].enabled)
  }

  return true // Default: aktif
}

/**
 * Aktifkan atau nonaktifkan tool untuk guild tertentu
 */
export async function setToolEnabled(guildId, toolName, enabled) {
  const val = enabled ? 1 : 0
  await db.query(
    `INSERT INTO tool_permissions (guild_id, tool_name, enabled) 
     VALUES (?, ?, ?) 
     ON DUPLICATE KEY UPDATE enabled = ?`,
    [guildId, toolName, val, val]
  )
}
