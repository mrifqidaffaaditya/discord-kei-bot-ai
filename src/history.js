import { db } from './db.js'
import { CONFIG } from './config.js'

const LIMIT = CONFIG.ai.historyLimit

// History sekarang per-server (shared timeline), bukan per-user.
// userTag digunakan untuk menandai siapa yang bicara di log.

export async function addHistory(guildId, role, content, userTag = null) {
  await db.query(
    `INSERT INTO histories (guild_id, role, content, user_tag)
     VALUES (?, ?, ?, ?)`,
    [guildId, role, content, userTag]
  )

  // Cleanup: keep only last N messages per server
  await db.query(
    `DELETE FROM histories
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM histories
         WHERE guild_id=?
         ORDER BY id DESC
         LIMIT ?
       ) as t
     )
     AND guild_id=?`,
    [guildId, LIMIT, guildId]
  )
}

export async function getHistory(guildId) {
  const [rows] = await db.query(
    `SELECT role, content FROM histories
     WHERE guild_id=?
     ORDER BY id ASC
     LIMIT ?`,
    [guildId, LIMIT]
  )

  return rows.map(r => ({
    role: r.role,
    content: r.content
  }))
}

export async function clearHistory(guildId) {
  await db.query(
    `DELETE FROM histories WHERE guild_id=?`,
    [guildId]
  )
}