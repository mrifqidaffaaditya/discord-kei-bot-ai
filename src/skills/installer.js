import Ajv from 'ajv'
import axios from 'axios'
import { getSkillByName, createSkill } from './index.js'
import { isSafeUrl } from '../tools/ssrf.js'

const ajv = new Ajv()

const skillSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
    description: { type: 'string' },
    version: { type: 'string' },
    type: { type: 'string', enum: ['prompt', 'workflow', 'code', 'persona', 'mcp_wrapper'] },
    scope: { type: 'string', enum: ['guild', 'global'] },
    trigger_patterns: {
      type: 'array',
      items: { type: 'string' }
    },
    definition: { type: 'object' }
  },
  required: ['name', 'type', 'definition'],
  additionalProperties: true
}

const validateSkill = ajv.compile(skillSchema)

/**
 * Mengambil skill JSON dari URL dan memvalidasinya
 */
export async function fetchSkillFromUrl(url) {
  if (!(await isSafeUrl(url))) {
    throw new Error('Akses diblokir: URL merujuk ke IP private atau localhost.')
  }

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      maxContentLength: 50 * 1024, // Maks 50KB
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0'
      }
    })

    let data = response.data
    // Jika masih berupa string, parse ke JSON
    if (typeof data === 'string') {
      data = JSON.parse(data)
    }

    const skills = Array.isArray(data) ? data : [data]

    for (const skill of skills) {
      const valid = validateSkill(skill)
      if (!valid) {
        throw new Error(`Skema skill tidak valid: ${ajv.errorsText(validateSkill.errors)}`)
      }
    }

    return skills
  } catch (error) {
    console.error('[installer] Fetch error:', error.message)
    throw new Error(`Gagal mengunduh/memvalidasi file skill: ${error.message}`)
  }
}

/**
 * Memasang skill ke database
 */
export async function installSkill(guildId, authorId, skillData, isBotOwner) {
  // Validasi scope: Hanya bot owner yang boleh buat global skill
  if (skillData.scope === 'global' && !isBotOwner) {
    skillData.scope = 'guild'
  }

  // Cek apakah nama skill sudah terdaftar
  const existing = await getSkillByName(guildId, skillData.name)
  if (existing) {
    throw new Error(`Nama skill "${skillData.name}" sudah digunakan di server ini.`)
  }

  // Keamanan: Skill bertipe 'code' di-disable default sampai diaktifkan admin
  const enabledVal = skillData.type === 'code' ? 0 : 1

  const id = await createSkill(guildId, authorId, {
    ...skillData,
    enabled: enabledVal
  })

  return {
    id,
    name: skillData.name,
    type: skillData.type,
    enabled: enabledVal === 1
  }
}
