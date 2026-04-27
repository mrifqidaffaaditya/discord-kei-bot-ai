import OpenAI from 'openai'
import { CONFIG } from './config.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

/**
 * Format server memory menjadi teks compact tapi unambiguous.
 * Input:  [{user_id, key, value}, ...]
 * Output: "@UserTag — key: value | key: value\n@UserTag2 — key: value"
 * 
 * Delimiter " — " memisahkan user dari data.
 * Delimiter " | " memisahkan antar fakta.
 * Delimiter ": " memisahkan key dari value.
 * 
 * userTagMap = { userId: displayName }
 */
function formatServerMemory(memoryRows, userTagMap = {}) {
  if (!memoryRows || memoryRows.length === 0) return ''

  // Group by user_id
  const grouped = {}
  for (const row of memoryRows) {
    if (!grouped[row.user_id]) grouped[row.user_id] = []
    grouped[row.user_id].push(`${row.key}: ${row.value}`)
  }

  const lines = []
  for (const [uid, entries] of Object.entries(grouped)) {
    const tag = userTagMap[uid] || `User(${uid.slice(-4)})`
    lines.push(`@${tag} — ${entries.join(' | ')}`)
  }

  return lines.join('\n')
}

export async function generateReply({ system, history, memory, userInput, userTagMap = {}, debug = false }) {
  try {
    const memoryText = formatServerMemory(memory, userTagMap)
    const memorySection = memoryText
      ? `\n\nMemory server (info tentang user-user di server ini):\n${memoryText}`
      : ''

    const messages = [
      {
        role: "system",
        content: `${system}${memorySection}`
      },
      ...history,
      { role: "user", content: userInput }
    ]

    const res = await client.chat.completions.create({
      model: CONFIG.ai.model,
      temperature: CONFIG.ai.temperature,
      max_tokens: CONFIG.ai.maxTokens,
      messages
    })

    return {
      text: res.choices[0].message.content,
      usage: res.usage
    }
  } catch (error) {
    console.error("[generateReply] Error:", error.message || error)
    throw error
  }
}

// 🔍 memory extraction — menganalisis percakapan dan extract info tentang user tertentu
export async function extractMemory(userInput, aiReply = '', existingMemory = [], userTag = 'User') {
  if (!userInput || userInput.trim().length < 3) return []

  try {
    const conversationContext = aiReply
      ? `${userTag}: ${userInput}\nAI: ${aiReply}`
      : `${userTag}: ${userInput}`

    // Filter existing memory hanya untuk user ini (hemat token)
    const existingMemoryText = existingMemory.length > 0
      ? `\n\nMemory yang SUDAH tersimpan untuk ${userTag}:\n${existingMemory.map(m => `${m.key}: ${m.value}`).join(' | ')}`
      : `\n\nBelum ada memory tersimpan untuk ${userTag}.`

    const res = await client.chat.completions.create({
      model: CONFIG.ai.model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Kamu adalah sistem ekstraksi memory. Analisis percakapan berikut dan tentukan memory apa yang perlu DITAMBAHKAN atau DIUPDATE untuk user "${userTag}".
${existingMemoryText}

ATURAN:
1. Jika ada info BARU yang belum ada di memory → TAMBAHKAN
2. Jika ada info yang BERUBAH dari memory lama → UPDATE (gunakan key yang sama)
3. Jangan ulangi memory lama yang tidak berubah
4. Hanya return entry yang BARU atau BERUBAH
5. Semua memory ini tentang user "${userTag}" — fokus pada info tentang mereka

WAJIB simpan jika ada:
- Nama, panggilan, nickname, umur, gender
- Lokasi, kota, negara, timezone
- Pekerjaan, sekolah, jurusan, hobi, skill
- Preferensi (makanan, musik, warna, game, bahasa, dll)
- Fakta personal (punya hewan, kendaraan, rumah, dll)
- Perasaan, mood, kondisi saat ini
- Rencana, tujuan, mimpi, target
- Orang-orang penting (pacar, teman, keluarga)
- Opini kuat tentang sesuatu
- Pengalaman unik atau cerita personal
- Kebiasaan atau rutinitas
- Masalah atau keluhan yang sedang dihadapi
- Teknologi, tools, bahasa programming yang dipakai
- Apapun yang membuat user ini unik dan personal

Return HANYA JSON array (tanpa markdown, tanpa backtick, tanpa teks lain):
[{"key": "kategori_singkat", "value": "detail informasi"}]

Gunakan key yang deskriptif dan konsisten (snake_case).
Contoh key: nama, umur, kota, hobi, makanan_favorit, pekerjaan, bahasa_program

Jika BENAR-BENAR tidak ada info baru atau berubah, return: []
Lebih baik menyimpan terlalu banyak daripada melewatkan sesuatu yang penting.`
        },
        { role: "user", content: conversationContext }
      ]
    })

    try {
      let content = res.choices[0].message.content.trim()
      // Strip markdown code blocks
      if (content.startsWith('```json')) content = content.slice(7)
      if (content.startsWith('```')) content = content.slice(3)
      if (content.endsWith('```')) content = content.slice(0, -3)

      const parsed = JSON.parse(content.trim())
      if (!Array.isArray(parsed)) return []

      // Validate & sanitize each entry
      return parsed.filter(entry =>
        entry &&
        typeof entry.key === 'string' &&
        typeof entry.value === 'string' &&
        entry.key.trim().length > 0 &&
        entry.key.length <= 100 &&
        entry.value.length <= 500
      ).map(entry => ({
        key: entry.key.trim().slice(0, 100),
        value: entry.value.trim().slice(0, 500)
      }))
    } catch {
      return []
    }
  } catch (apiError) {
    console.error("[extractMemory] API Error:", apiError.message || apiError)
    return []
  }
}