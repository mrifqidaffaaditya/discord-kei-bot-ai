import { db } from '../db.js'
import { CONFIG } from '../config.js'
import { executeSkill } from './executor.js'
import { nanoid } from 'nanoid'

export { executeSkill } from './executor.js'

/**
 * Memformat skill sebagai tool call definition OpenAI
 */
export function getSkillToolDefinition(skill) {
  const properties = {}
  const required = []

  if (skill.type === 'mcp_wrapper' && skill.definition.user_params) {
    for (const param of skill.definition.user_params) {
      properties[param] = {
        type: 'string',
        description: `Parameter "${param}" untuk skill MCP`
      }
      required.push(param)
    }
  } else {
    // Default: satu parameter input utama untuk tipe prompt, workflow, atau code
    properties.input = {
      type: 'string',
      description: 'Input utama untuk skill kustom'
    }
    required.push('input')
  }

  return {
    type: 'function',
    function: {
      name: skill.name,
      description: skill.description || `Skill kustom: ${skill.name}`,
      parameters: {
        type: 'object',
        properties,
        required
      }
    }
  }
}

/**
 * Mengambil semua skill aktif di guild (termasuk global)
 */
export async function getActiveSkillsForGuild(guildId) {
  const [rows] = await db.query(
    `SELECT * FROM skills WHERE (guild_id = ? OR scope = 'global') AND enabled = 1`,
    [guildId]
  )

  return rows.map(r => {
    try {
      if (typeof r.trigger_patterns === 'string') r.trigger_patterns = JSON.parse(r.trigger_patterns)
    } catch { r.trigger_patterns = [] }
    try {
      if (typeof r.definition === 'string') r.definition = JSON.parse(r.definition)
    } catch { r.definition = {} }
    return r
  })
}

/**
 * Mengambil detail skill berdasarkan nama
 */
export async function getSkillByName(guildId, name) {
  const [rows] = await db.query(
    `SELECT * FROM skills WHERE (guild_id = ? OR scope = 'global') AND name = ?`,
    [guildId, name]
  )

  if (rows.length === 0) return null

  const r = rows[0]
  try {
    if (typeof r.trigger_patterns === 'string') r.trigger_patterns = JSON.parse(r.trigger_patterns)
  } catch { r.trigger_patterns = [] }
  try {
    if (typeof r.definition === 'string') r.definition = JSON.parse(r.definition)
  } catch { r.definition = {} }

  return r
}

/**
 * Membuat skill baru
 */
export async function createSkill(guildId, authorId, skillData) {
  const id = 'sk_' + nanoid(16)
  const { name, description, version, type, scope, trigger_patterns, definition, source_url } = skillData

  const dbScope = scope || 'guild'
  const tpJson = JSON.stringify(trigger_patterns || [])
  const defJson = JSON.stringify(definition || {})

  await db.query(
    `INSERT INTO skills (id, guild_id, name, description, version, author_id, type, scope, trigger_patterns, definition, source_url, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, guildId, name, description, version || '1.0', authorId, type, dbScope, tpJson, defJson, source_url || null]
  )

  return id
}

/**
 * Mengedit skill
 */
export async function updateSkill(guildId, name, skillData) {
  const { description, version, type, scope, trigger_patterns, definition, enabled } = skillData
  
  const tpJson = trigger_patterns ? JSON.stringify(trigger_patterns) : null
  const defJson = definition ? JSON.stringify(definition) : null

  let query = 'UPDATE skills SET updated_at = CURRENT_TIMESTAMP'
  const params = []

  if (description !== undefined) { query += ', description = ?'; params.push(description) }
  if (version !== undefined) { query += ', version = ?'; params.push(version) }
  if (type !== undefined) { query += ', type = ?'; params.push(type) }
  if (scope !== undefined) { query += ', scope = ?'; params.push(scope) }
  if (tpJson !== null) { query += ', trigger_patterns = ?'; params.push(tpJson) }
  if (defJson !== null) { query += ', definition = ?'; params.push(defJson) }
  if (enabled !== undefined) { query += ', enabled = ?'; params.push(enabled ? 1 : 0) }

  query += ' WHERE guild_id = ? AND name = ?'
  params.push(guildId, name)

  const [result] = await db.query(query, params)
  return result.affectedRows > 0
}

/**
 * Menghapus skill
 */
export async function deleteSkill(guildId, name) {
  const [result] = await db.query(
    `DELETE FROM skills WHERE guild_id = ? AND name = ?`,
    [guildId, name]
  )
  return result.affectedRows > 0
}

/**
 * Mengaktifkan atau menonaktifkan skill
 */
export async function toggleSkill(guildId, name, enabled) {
  const [result] = await db.query(
    `UPDATE skills SET enabled = ? WHERE guild_id = ? AND name = ?`,
    [enabled ? 1 : 0, guildId, name]
  )
  return result.affectedRows > 0
}

/**
 * Menambah hitungan penggunaan skill
 */
export async function incrementSkillUsage(id) {
  await db.query(
    `UPDATE skills SET usage_count = usage_count + 1 WHERE id = ?`,
    [id]
  )
}
