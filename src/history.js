import { db } from './db.js'

const LIMIT = 30

export async function addHistory(guildId, userId, message) {
  await db.query(
    `INSERT INTO histories (guild_id, user_id, role, content)
     VALUES (?, ?, ?, ?)`,
    [guildId, userId, message.role, message.content]
  )

  // cleanup old history (keep last 30)
  await db.query(
    `DELETE FROM histories
     WHERE id NOT IN (
       SELECT id FROM (
         SELECT id FROM histories
         WHERE guild_id=? AND user_id=?
         ORDER BY id DESC
         LIMIT ?
       ) as t
     )
     AND guild_id=? AND user_id=?`,
    [guildId, userId, LIMIT, guildId, userId]
  )
}

export async function getHistory(guildId, userId) {
  const [rows] = await db.query(
    `SELECT role, content
     FROM histories
     WHERE guild_id=? AND user_id=?
     ORDER BY id ASC
     LIMIT ?`,
    [guildId, userId, LIMIT]
  )

  return rows.map(r => ({
    role: r.role,
    content: r.content
  }))
}

export async function clearHistory(guildId, userId) {
  await db.query(
    `DELETE FROM histories WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  )
}