import { db } from '../db.js'
import OpenAI from 'openai'
import { CONFIG } from '../config.js'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js'

const clientAi = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

/**
 * Menganalisis sequence tool call dan menyarankan skill baru ke admin server
 */
export async function suggestSkill(client, guildId, toolSequence, patternHash, occurrences) {
  try {
    const prompt = `Desain sebuah skill Discord bot bertipe "workflow" berdasarkan urutan pemanggilan tool built-in berikut:
Tool Sequence: ${JSON.stringify(toolSequence)}
Jumlah Pemanggilan: ${occurrences} kali

Berikan output JSON bersih (tanpa markdown, tanpa \`\`\`json) dengan struktur sebagai berikut:
{
  "name": "nama_skill_snake_case",
  "description": "Deskripsi kegunaan skill ini dalam bahasa Indonesia",
  "trigger_patterns": ["kata kunci 1", "kata kunci 2"],
  "definition": {
    "steps": [
      { "tool": "nama_tool", "params": { "param_key": "param_value_with_template" } }
    ],
    "output_template": "Template output respon bot, contoh: 'Hasil pencarian: {{step1.content}}'"
  }
}

Aturan parameter:
- Gunakan {{input}} di parameter langkah pertama untuk mengambil argumen pengguna.
- Untuk langkah selanjutnya, jika butuh data dari langkah sebelumnya, gunakan template seperti {{step1.content}} atau {{step1.extracted.selector[0]}}.`

    const res = await clientAi.chat.completions.create({
      model: CONFIG.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })

    let jsonStr = res.choices[0].message.content.trim()
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7)
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3)
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3)

    const suggested = JSON.parse(jsonStr.trim())
    suggested.pattern_hash = patternHash
    suggested.type = 'workflow'

    // Simpan ke DB
    const [result] = await db.query(
      `INSERT INTO skill_suggestions (guild_id, suggested_skill, status) VALUES (?, ?, 'pending')`,
      [guildId, JSON.stringify(suggested)]
    )
    const suggestionId = result.insertId

    // Dapatkan channel terdaftar untuk guild ini
    const [channels] = await db.query(
      `SELECT channel_id FROM server_channels WHERE guild_id = ? LIMIT 1`,
      [guildId]
    )

    if (channels.length === 0) return

    const channelId = channels[0].channel_id
    const channel = await client.channels.fetch(channelId).catch(() => null)
    if (!channel) return

    // Bangun Discord Embed dan Button
    const embed = new EmbedBuilder()
      .setTitle('💡 Saran Skill Baru untuk Server Ini')
      .setDescription(`Saya mendeteksi pola pemanggilan tool yang sering digunakan (${occurrences} kali dalam 7 hari):\n\`${toolSequence.join(' ➔ ')}\`\n\nApakah Anda ingin menyimpan skill ini agar bisa dipanggil lebih cepat?`)
      .addFields(
        { name: 'Nama Skill', value: `\`${suggested.name}\``, inline: true },
        { name: 'Deskripsi', value: suggested.description || '-', inline: false },
        { name: 'Trigger Patterns', value: (suggested.trigger_patterns || []).map(p => `\`${p}\``).join(', ') || '-', inline: false }
      )
      .setColor('#5865F2')
      .setTimestamp()

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`skill_suggest_accept_${suggestionId}`)
        .setLabel('✅ Ya, buat')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`skill_suggest_reject_${suggestionId}`)
        .setLabel('❌ Abaikan')
        .setStyle(ButtonStyle.Danger)
    )

    await channel.send({ embeds: [embed], components: [row] })

    // Tandai bahwa notifikasi telah dikirim
    await db.query(
      `UPDATE skill_suggestions SET notified = 1 WHERE id = ?`,
      [suggestionId]
    )

    console.log(`[Suggester] Saran skill #${suggestionId} (${suggested.name}) dikirim ke channel ${channelId}`)
  } catch (error) {
    console.error('[Suggester] Gagal menyarankan skill:', error)
  }
}
