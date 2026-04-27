import OpenAI from 'openai'
import { CONFIG } from './config.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

export async function generateReply({ system, history, memory, userInput, debug = false }) {
  try {
    const memoryText = memory.length > 0
      ? `\n\nMemory user:\n${JSON.stringify(memory)}`
      : ''

    const messages = [
      {
        role: "system",
        content: `${system}${memoryText}`
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

// 🔍 memory extraction step — menganalisis percakapan user + AI reply + memory lama
export async function extractMemory(userInput, aiReply = '', existingMemory = []) {
  if (!userInput || userInput.trim().length < 3) return []

  try {
    const conversationContext = aiReply
      ? `User: ${userInput}\nAI: ${aiReply}`
      : `User: ${userInput}`

    const existingMemoryText = existingMemory.length > 0
      ? `\n\nMemory yang SUDAH tersimpan:\n${JSON.stringify(existingMemory)}`
      : '\n\nBelum ada memory yang tersimpan.'

    const res = await client.chat.completions.create({
      model: CONFIG.ai.model,
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Kamu adalah sistem ekstraksi memory. Analisis percakapan berikut dan tentukan memory apa yang perlu DITAMBAHKAN atau DIUPDATE.
${existingMemoryText}

ATURAN:
1. Jika ada info BARU yang belum ada di memory → TAMBAHKAN
2. Jika ada info yang BERUBAH dari memory lama → UPDATE (gunakan key yang sama)
3. Jangan ulangi memory lama yang tidak berubah
4. Hanya return entry yang BARU atau BERUBAH

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