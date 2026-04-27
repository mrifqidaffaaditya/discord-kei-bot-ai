import { db } from './db.js'

export async function getUserMemory(guildId, userId) {
  const [rows] = await db.query(
    `SELECT \`key\`, value FROM memories WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  )
  return rows
}

export async function upsertMemory(guildId, userId, entries) {
  for (const e of entries) {
    await db.query(
      `INSERT INTO memories (guild_id, user_id, \`key\`, value)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value=?`,
      [guildId, userId, e.key, e.value, e.value]
    )
  }
}

export async function clearMemory(guildId, userId) {
  await db.query(
    `DELETE FROM memories WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  )
}