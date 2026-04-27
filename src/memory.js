import { db } from './db.js'

// Ambil SEMUA memory di server (semua user), untuk konteks shared
export async function getServerMemory(guildId) {
  const [rows] = await db.query(
    `SELECT user_id, \`key\`, value FROM memories WHERE guild_id=?`,
    [guildId]
  )
  return rows
}

// Simpan memory untuk user tertentu di server
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

// Hapus memory 1 user saja di server tertentu
export async function clearUserMemory(guildId, userId) {
  await db.query(
    `DELETE FROM memories WHERE guild_id=? AND user_id=?`,
    [guildId, userId]
  )
}

// Hapus semua memory di server
export async function clearServerMemory(guildId) {
  await db.query(
    `DELETE FROM memories WHERE guild_id=?`,
    [guildId]
  )
}