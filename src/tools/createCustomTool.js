import { createSkill, getSkillByName } from '../skills/index.js'

export const definition = {
  name: 'create_custom_tool',
  description: 'Membuat atau mendefinisikan tool/skill kustom baru untuk server ini secara dinamis agar bisa digunakan di kemudian hari.',
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        pattern: '^[a-zA-Z0-9_-]+$',
        description: 'Nama unik tool kustom (snake_case, contoh: cek_harga_saham)'
      },
      description: {
        type: 'string',
        description: 'Deskripsi lengkap tentang kegunaan tool ini'
      },
      type: {
        type: 'string',
        enum: ['prompt', 'workflow', 'code', 'persona'],
        description: 'Tipe tool kustom (prompt, workflow, code, atau persona)'
      },
      content: {
        type: 'string',
        description: 'Definisi tool (Instruksi prompt untuk prompt/persona, kode Javascript untuk tipe code, atau JSON array steps untuk tipe workflow)'
      },
      trigger_patterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Pola kata kunci untuk memicu deteksi tool ini secara otomatis'
      }
    },
    required: ['name', 'description', 'type', 'content']
  }
}

export async function run(args, context) {
  const { name, description, type, content, trigger_patterns } = args
  const { guildId, userId } = context

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Format nama tool tidak valid. Harus snake_case dan hanya berisi karakter alphanumeric, underscore, atau hyphen.')
  }

  let definitionData = {}
  if (type === 'prompt') {
    definitionData = { prompt: content }
  } else if (type === 'persona') {
    definitionData = { persona: content }
  } else if (type === 'code') {
    definitionData = { code: content }
  } else if (type === 'workflow') {
    try {
      const steps = JSON.parse(content)
      if (!Array.isArray(steps)) {
        throw new Error('Konten untuk tipe workflow harus berupa JSON array berisi langkah-langkah.')
      }
      definitionData = { steps }
    } catch (error) {
      throw new Error(`Format workflow JSON steps tidak valid: ${error.message}`)
    }
  }

  // Cek apakah nama tool kustom sudah terdaftar
  const existing = await getSkillByName(guildId, name)
  if (existing) {
    throw new Error(`Tool kustom dengan nama "${name}" sudah pernah didefinisikan di server ini.`)
  }

  const skillData = {
    name,
    description,
    type,
    definition: definitionData,
    scope: 'guild',
    trigger_patterns: trigger_patterns || [name],
    version: '1.0',
    enabled: true
  }

  // Simpan ke database
  const skillId = await createSkill(guildId, userId || 'agent_bot', skillData)

  return {
    success: true,
    message: `Berhasil mendefinisikan tool kustom baru: "${name}" (${type}) dengan ID: ${skillId}. Tool ini sekarang aktif dan dapat digunakan di server ini.`
  }
}
