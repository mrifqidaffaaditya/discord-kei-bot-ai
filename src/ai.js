import OpenAI from 'openai'
import { CONFIG } from './config.js'
import { getBuiltinToolDefinitions, executeBuiltinTool, BUILTIN_TOOLS } from './tools/index.js'
import { detectSkills } from './skills/detector.js'
import { getSkillToolDefinition, incrementSkillUsage } from './skills/index.js'
import { executeSkill } from './skills/executor.js'
import { executeMcpTool, getAllMcpTools } from './mcp/index.js'
import { recordObservation } from './skills/observer.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

/**
 * Format server memory menjadi teks compact tapi tidak ambigu.
 */
function formatServerMemory(memoryRows, userTagMap = {}) {
  if (!memoryRows || memoryRows.length === 0) return ''

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
 */
export function shouldExtractMemory(text) {
  const clean = text.replace(/[^\w\s]/g, '').trim()
  if (clean.length < 4) return false
  const trivial = /^(h(a|e|i)+|ok|wk+|lol|hmm+|gg|bruh|wow|heh+|oh|ah|eh|uh|ya|nah)$/i
  if (trivial.test(clean)) return false
  return true
}

/**
 * Agent Reasoning Loop: Menghasilkan balasan bot dengan kemampuan tool calling multi-langkah
 */
export async function generateReply({ 
  system, 
  history, 
  memory, 
  userInput, 
  userTagMap = {}, 
  debug = false,
  userId,
  guildId,
  onIteration
}) {
  try {
    // 1. Deteksi skill yang relevan secara otomatis berdasarkan kata kunci/fuzzy match
    const matchedSkills = await detectSkills(userInput, guildId)

    // 2. Modifikasi system prompt berdasarkan skill bertipe 'prompt' atau 'persona'
    let dynamicSystemPrompt = system
    for (const skill of matchedSkills) {
      if (skill.type === 'prompt' && skill.definition.prompt) {
        dynamicSystemPrompt += `\n\n[Skill Prompt: ${skill.name}]\n${skill.definition.prompt}`
      } else if (skill.type === 'persona' && skill.definition.persona) {
        dynamicSystemPrompt = `${skill.definition.persona}\n\n${dynamicSystemPrompt}`
      }
    }

    const compressedMemory = compressMemory(memory)
    const memoryText = formatServerMemory(compressedMemory, userTagMap)
    const memorySection = memoryText
      ? `\n\nMemory server (info user di server ini):\n${memoryText}`
      : ''

    dynamicSystemPrompt += memorySection

    // Tambahkan instruksi operasional untuk pencarian web & kunjungan website otomatis
    const agentOperationalInstructions = `

=== PETUNJUK OPERASIONAL ALUR KERJA PENCARIAN (PENTING) ===
Tool 'web_search' sudah OTOMATIS mengunjungi dan membaca konten penuh dari 3 URL teratas di setiap pencarian (field 'full_content' dalam hasil).

Panduan penggunaan:
1. MANFAATKAN 'full_content' — baca konten lengkap dari setiap hasil yang sudah di-fetch, bukan hanya 'snippet'.
2. CROSS-CHECK — bandingkan informasi dari beberapa sumber yang sudah di-fetch untuk memastikan akurasi dan objektivitas.
3. FETCH TAMBAHAN — jika ada URL relevan lain yang belum diambil (belum ada full_content-nya), gunakan tool 'fetch_url' secara eksplisit untuk membacanya.
4. JANGAN BERHENTI di satu sumber — selalu verifikasi dari minimal 2-3 website berbeda.
5. JAWABAN AKHIR — tuliskan secara terstruktur, detail, akurat, dan sertakan link referensi dari sumber yang sudah dikunjungi agar pengguna bisa memverifikasi sendiri.`

    dynamicSystemPrompt += agentOperationalInstructions

    const compressedHistory = compressHistory(history)

    const messages = [
      { role: 'system', content: dynamicSystemPrompt },
      ...compressedHistory,
      { role: 'user', content: userInput }
    ]

    // 3. Bangun daftar tool terintegrasi (Built-in + Custom Skills + MCP Tools)
    const builtinDefs = await getBuiltinToolDefinitions(guildId)
    const mcpDefs = CONFIG.mcp.enabled ? getAllMcpTools() : []
    const skillDefs = matchedSkills
      .filter(s => ['workflow', 'code', 'mcp_wrapper'].includes(s.type))
      .map(s => getSkillToolDefinition(s))

    const availableTools = [...builtinDefs, ...skillDefs, ...mcpDefs]

    const toolSequence = []
    const attachments = []
    let iterations = 0
    const maxIterations = CONFIG.agent.maxIterations
    let totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    while (iterations < maxIterations) {
      const completionOptions = {
        model: CONFIG.ai.model,
        temperature: CONFIG.ai.temperature,
        max_tokens: CONFIG.ai.maxTokens,
        max_completion_tokens: CONFIG.ai.maxTokens,
        messages
      }

      if (availableTools.length > 0) {
        completionOptions.tools = availableTools
      }

      const res = await client.chat.completions.create(completionOptions)
      const choice = res.choices[0]
      const message = choice.message
      messages.push(message)

      if (res.usage) {
        totalUsage.prompt_tokens += res.usage.prompt_tokens || 0
        totalUsage.completion_tokens += res.usage.completion_tokens || 0
        totalUsage.total_tokens += res.usage.total_tokens || 0
      }

      // Selesai jika model memberikan jawaban final
      if (choice.finish_reason === 'stop' || !message.tool_calls) {
        // Catat sequence tool call ke observer untuk dianalisis auto-suggest skill
        if (toolSequence.length > 0) {
          await recordObservation(guildId, userId, toolSequence)
        }

        return {
          text: message.content || 'Selesai tanpa tanggapan teks.',
          usage: totalUsage,
          iterations,
          attachments,
          toolSequence
        }
      }

      // Eksekusi tool calls secara berurutan
      iterations++
      if (onIteration) {
        await onIteration(iterations)
      }

      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function.name
        let args = {}
        try {
          args = JSON.parse(toolCall.function.arguments)
        } catch {}

        // Log panggilan tool mulai
        console.log(`[TOOL_CALL][START] User: ${userId} | Guild: ${guildId} | Tool: ${toolName} | Args: ${JSON.stringify(args)}`)

        let toolResult
        try {
          if (toolName.startsWith('mcp__')) {
            // Eksekusi tool MCP
            const parts = toolName.split('__')
            const serverName = parts[1]
            const mcpToolName = parts[2]
            toolResult = await executeMcpTool(serverName, mcpToolName, args)
          } else if (BUILTIN_TOOLS[toolName]) {
            // Eksekusi tool built-in
            toolResult = await executeBuiltinTool(toolName, args, { userId, guildId })
          } else {
            // Eksekusi custom skill tool
            const skill = matchedSkills.find(s => s.name === toolName)
            if (!skill) {
              throw new Error(`Tool/Skill "${toolName}" tidak ditemukan.`)
            }
            toolResult = await executeSkill(skill, args, { userId, guildId })
            await incrementSkillUsage(skill.id)
          }

          // Log panggilan tool berhasil
          const resStr = typeof toolResult === 'object' ? JSON.stringify(toolResult) : String(toolResult)
          console.log(`[TOOL_CALL][SUCCESS] Tool: ${toolName} | Output size: ${resStr.length} chars`)

          if (toolResult && toolResult.isAttachment && toolResult.filepath) {
            attachments.push(toolResult)
          }

          toolSequence.push(toolName)
        } catch (error) {
          // Log panggilan tool gagal
          console.error(`[TOOL_CALL][ERROR] Tool: ${toolName} | Error: ${error.message}`)
          toolResult = { error: error.message }
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: typeof toolResult === 'object' ? JSON.stringify(toolResult) : String(toolResult)
        })
      }
    }

    throw new Error(`Agent loop terhenti karena melebihi batas ${maxIterations} iterasi.`)

  } catch (error) {
    console.error('[generateReply] Error:', error.message || error)
    throw error
  }
}

/**
 * Menganalisis percakapan untuk mengambil fakta tentang user.
 */
export async function extractMemory(userInput, aiReply = '', existingMemory = [], userTag = 'User') {
  if (!userInput || userInput.trim().length < 3) return []

  try {
    const conversationContext = aiReply
      ? `${userTag}: ${userInput}\nAI: ${aiReply}`
      : `${userTag}: ${userInput}`

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
      if (content.startsWith('```json')) content = content.slice(7)
      if (content.startsWith('```')) content = content.slice(3)
      if (content.endsWith('```')) content = content.slice(0, -3)

      const parsed = JSON.parse(content.trim())
      if (!Array.isArray(parsed)) return []

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