import { db } from '../db.js'
import { CONFIG } from '../config.js'
import crypto from 'crypto'
import { CronJob } from 'cron'
import { suggestSkill } from './suggester.js'

/**
 * Menghasilkan hash unik untuk sequence tool call
 */
export function getSequenceHash(sequence) {
  if (!sequence || sequence.length === 0) return ''
  // Urutkan atau hash langsung
  const sortedSeq = [...sequence].sort()
  return crypto.createHash('sha256').update(JSON.stringify(sortedSeq)).digest('hex')
}

/**
 * Mencatat observasi run tool sequence
 */
export async function recordObservation(guildId, userId, toolSequence) {
  if (!toolSequence || toolSequence.length <= 1) return // Hanya catat jika ada ≥ 2 tool calls dalam 1 percakapan

  const patternHash = getSequenceHash(toolSequence)
  const seqJson = JSON.stringify(toolSequence)

  await db.query(
    `INSERT INTO skill_observations (guild_id, user_id, tool_sequence, pattern_hash)
     VALUES (?, ?, ?, ?)`,
    [guildId, userId, seqJson, patternHash]
  )
}

/**
 * Menjalankan analisis berkala untuk mendeteksi kebiasaan server
 */
export async function runAnalysisJob(client) {
  console.log('[Observer] Memulai analisis tool sequence untuk rekomendasi skill...')
  try {
    const days = CONFIG.skills.suggestWindowDays
    const minOcc = CONFIG.skills.suggestMinOccurrences
    const minUsers = CONFIG.skills.suggestMinUsers

    const [rows] = await db.query(
      `SELECT guild_id, pattern_hash, tool_sequence,
              COUNT(*) as occurrences,
              COUNT(DISTINCT user_id) as unique_users
       FROM skill_observations
       WHERE observed_at > NOW() - INTERVAL ? DAY
       GROUP BY guild_id, pattern_hash, tool_sequence
       HAVING occurrences >= ? AND unique_users >= ?`,
      [days, minOcc, minUsers]
    )

    for (const row of rows) {
      const { guild_id, pattern_hash, occurrences } = row
      let toolSeq = row.tool_sequence
      if (typeof toolSeq === 'string') {
        try { toolSeq = JSON.parse(toolSeq); } catch { continue; }
      }

      // Cek apakah sudah pernah disarankan dan statusnya masih pending
      const [existing] = await db.query(
        `SELECT 1 FROM skill_suggestions 
         WHERE guild_id = ? AND status = 'pending' AND JSON_UNQUOTE(JSON_EXTRACT(suggested_skill, '$.pattern_hash')) = ?`,
        [guild_id, pattern_hash]
      )

      if (existing.length === 0) {
        await suggestSkill(client, guild_id, toolSeq, pattern_hash, occurrences)
      }
    }
  } catch (error) {
    console.error('[Observer] Gagal menjalankan analysis job:', error)
  }
}

/**
 * Memulai Cron Job untuk analysis
 */
export function startObserverCron(client) {
  if (!CONFIG.skills.autoSuggest) return null

  // Jalankan setiap tengah malam
  const job = new CronJob('0 0 * * *', async () => {
    await runAnalysisJob(client)
  })
  job.start()
  console.log('[Observer] Analisis harian skill ter-schedule (tengah malam).')
  return job
}
