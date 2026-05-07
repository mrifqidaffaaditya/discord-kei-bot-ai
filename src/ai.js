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

/**
 * Compress history: pesan lama di-truncate untuk hemat token.
 * - 5 pesan terakhir tetap utuh (konteks terkini penting)
 * - Pesan lebih lama di-truncate ke max 200 karakter
 */
function compressHistory(history) {
  if (history.length <= 6) return history

  const recentCount = 5
  const older = history.slice(0, -recentCount)
  const recent = history.slice(-recentCount)

  const compressed = older.map(msg => ({
    role: msg.role,
    content: msg.content.length > 200
      ? msg.content.slice(0, 200) + '...'
      : msg.content
  }))

  return [...compressed, ...recent]
}

/**
 * Compress memory: batasi jumlah entry & truncate value panjang.
 * - Max 30 entries total
 * - Value di-truncate ke 150 karakter
 */
function compressMemory(memoryRows) {
  if (!memoryRows || memoryRows.length === 0) return memoryRows
  const limited = memoryRows.slice(0, 30)
  return limited.map(row => ({
    ...row,
    value: row.value.length > 150 ? row.value.slice(0, 150) + '...' : row.value
  }))
}

/**
 * Cek apakah pesan layak untuk di-extract memory-nya.
 * Agresif: hanya skip pesan yang BENAR-BENAR tidak bermakna.
 */
export function shouldExtractMemory(text) {
  const clean = text.replace(/[^\w\s]/g, '').trim()
  // Hanya skip jika terlalu pendek (< 4 karakter bersih)
  if (clean.length < 4) return false
  // Hanya skip reaksi murni 1 kata tanpa info
  const trivial = /^(h(a|e|i)+|ok|wk+|lol|hmm+|gg|bruh|wow|heh+|oh|ah|eh|uh|ya|nah)$/i
  if (trivial.test(clean)) return false
  return true
}

export async function generateReply({ system, history, memory, userInput, userTagMap = {}, debug = false }) {
  try {
    const compressedMemory = compressMemory(memory)
    const memoryText = formatServerMemory(compressedMemory, userTagMap)
    const memorySection = memoryText
      ? `\n\nMemory server (info user di server ini):\n${memoryText}`
      : ''

    const compressedHistory = compressHistory(history)

    const messages = [
      {
        role: "system",
        content: `${system}${memorySection}`
      },
      ...compressedHistory,
      { role: "user", content: userInput }
    ]

    const res = await client.chat.completions.create({
      model: CONFIG.ai.model,
      temperature: CONFIG.ai.temperature,
      max_tokens: CONFIG.ai.maxTokens,
      max_completion_tokens: CONFIG.ai.maxTokens,
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
    // Truncate existing memory text untuk hemat token
    const existingMemoryText = existingMemory.length > 0
      ? `\nMemory ${userTag}: ${existingMemory.slice(0, 15).map(m => `${m.key}:${m.value.slice(0, 80)}`).join('|')}`
      : ''

    const res = await client.chat.completions.create({
      model: CONFIG.ai.model,
      temperature: 0,
      max_tokens: 300,
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content: `Ekstrak memory AGRESIF dari percakapan untuk user "${userTag}".${existingMemoryText}

Aturan: Return info BARU/BERUBAH saja. Jangan ulangi yang sudah ada.
Bersikap AGRESIF — tangkap semua info termasuk yang IMPLISIT:
- Info eksplisit: nama, umur, lokasi, pekerjaan, hobi, skill, preferensi, relasi
- Info implisit: mood/perasaan dari nada bicara, opini dari komentar singkat, kebiasaan dari konteks, minat dari topik yang dibahas
- Konteks: apa yang sedang dilakukan, game yang dimainkan, masalah yang dihadapi, teknologi yang dipakai
- Bahkan dari kalimat pendek seperti "lagi ngoding" → simpan {aktivitas: "sedang ngoding"}
Lebih baik simpan TERLALU BANYAK daripada melewatkan.
Return JSON array: [{"key":"snake_case","value":"detail"}]
Tidak ada info? Return: []`
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