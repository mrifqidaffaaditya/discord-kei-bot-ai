import { Client, Events, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ActivityType, AttachmentBuilder, PermissionFlagsBits } from 'discord.js'
import { CONFIG } from './config.js'
import { getServerMemory, upsertMemory } from './memory.js'
import { addHistory, getHistory } from './history.js'
import { generateReply, extractMemory, shouldExtractMemory } from './ai.js'
import { handleInteraction, handleLegacyCommand } from './commands.js'
import { initDb, isAllowedChannel, getPersonality, db } from './db.js'
import { initMcp } from './mcp/index.js'
import { startObserverCron } from './skills/observer.js'
import { createSkill } from './skills/index.js'
import { commands } from './register-commands.js'
import fs from 'fs'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember]
})

let debugMode = false
const MAX_MSG_LENGTH = 2000

function splitMessage(text, maxLength = MAX_MSG_LENGTH) {
  if (text.length <= maxLength) return [text]
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt <= 0) splitAt = maxLength
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt)
  }
  return chunks
}

// 🔄 Console spinner animation
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
function startSpinner(label) {
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[i % SPINNER_FRAMES.length]} ${label}`)
    i++
  }, 80)
  return {
    update(newLabel) { label = newLabel },
    stop(finalMsg) {
      clearInterval(id)
      process.stdout.write(`\r✅ ${finalMsg}\n`)
    },
    fail(errMsg) {
      clearInterval(id)
      process.stdout.write(`\r❌ ${errMsg}\n`)
    }
  }
}

// 🔤 Keep Discord typing indicator alive (expires every 10s)
function startTypingLoop(channel) {
  channel.sendTyping().catch(() => {})
  const id = setInterval(() => {
    channel.sendTyping().catch(() => {})
  }, 8000)
  return () => clearInterval(id)
}

client.once(Events.ClientReady, async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`)
  console.log(`[Bot] Serving ${client.guilds.cache.size} server(s)`)

  client.user.setActivity('!ai help', { type: ActivityType.Watching })

  try {
    await initDb()
    console.log('[DB] Database tables initialized.')
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error)
  }


  try {
    await initMcp()
    console.log('[MCP] Client engine initialized.')
  } catch (error) {
    console.error('[MCP] Failed to initialize MCP:', error)
  }


  try {
    startObserverCron(client)
    console.log('[Observer] Skill observation cron started.')
  } catch (error) {
    console.error('[Observer] Failed to start observer cron:', error)
  }

  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
    console.log('[Bot] Slash commands registered.')
  } catch (error) {
    console.error('[Bot] Failed to register slash commands:', error)
  }
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    const customId = interaction.customId
    if (customId.startsWith('skill_suggest_accept_') || customId.startsWith('skill_suggest_reject_')) {
      const isAccept = customId.startsWith('skill_suggest_accept_')
      const suggestionId = parseInt(customId.split('_').pop())
      
      const isUserAdmin = interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild)
      if (!isUserAdmin) {
        return interaction.reply({ content: '⛔ Hanya Admin Server yang dapat menerima atau menolak saran skill.', flags: MessageFlags.Ephemeral })
      }
      
      await interaction.deferUpdate()
      
      try {
        const [rows] = await db.query('SELECT * FROM skill_suggestions WHERE id = ?', [suggestionId])
        if (rows.length === 0) {
          return interaction.followUp({ content: '❌ Rekomendasi skill tidak ditemukan.', flags: MessageFlags.Ephemeral })
        }
        
        const suggestion = rows[0]
        if (suggestion.status !== 'pending') {
          return interaction.followUp({ content: `⚠️ Rekomendasi ini sudah diproses (${suggestion.status}).`, flags: MessageFlags.Ephemeral })
        }
        
        let skillData = suggestion.suggested_skill
        if (typeof skillData === 'string') {
          skillData = JSON.parse(skillData)
        }
        
        if (isAccept) {
          await createSkill(suggestion.guild_id, interaction.user.id, skillData)
          await db.query("UPDATE skill_suggestions SET status = 'accepted' WHERE id = ?", [suggestionId])
          await interaction.editReply({
            content: `✅ Skill \`${skillData.name}\` telah berhasil dibuat secara otomatis!`,
            embeds: [],
            components: []
          })
        } else {
          await db.query("UPDATE skill_suggestions SET status = 'rejected' WHERE id = ?", [suggestionId])
          await interaction.editReply({
            content: '❌ Rekomendasi skill diabaikan.',
            embeds: [],
            components: []
          })
        }
      } catch (err) {
        console.error('Error handling suggestion button:', err)
        await interaction.followUp({ content: `❌ Gagal memproses: ${err.message}`, flags: MessageFlags.Ephemeral })
      }
      return
    }
  }

  if (!interaction.isChatInputCommand()) return
  const isDM = !interaction.guildId
  const guildId = isDM ? `dm_${interaction.user.id}` : interaction.guildId
  const userId = interaction.user.id
  const isBotAdmin = CONFIG.adminIds.includes(userId)

  console.log(`[Interaction] /${interaction.commandName} by ${interaction.user.tag}`)
  const newDebugMode = await handleInteraction(interaction, { guildId, userId, isBotAdmin, debug: debugMode })
  if (newDebugMode !== undefined) debugMode = newDebugMode
})

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return

  const isDM = !msg.guild
  const guildId = isDM ? `dm_${msg.author.id}` : msg.guild.id
  const userId = msg.author.id
  const userTag = isDM ? msg.author.username : (msg.member?.displayName || msg.author.displayName || msg.author.username)
  const isBotAdmin = CONFIG.adminIds.includes(userId)

  if (msg.content.startsWith("!ai ")) {
    const args = msg.content.split(" ").slice(1)
    console.log(`[Command] !ai ${args[0]} by ${msg.author.tag}`)
    const newDebugMode = await handleLegacyCommand(msg, args, { guildId, userId, isBotAdmin, debug: debugMode })
    if (newDebugMode !== undefined) debugMode = newDebugMode
    return
  }

  let isSetupChannel = false
  const isMentioned = msg.mentions.users.has(client.user.id)

  if (!isDM) {
    isSetupChannel = await isAllowedChannel(guildId, msg.channel.id)
    if (!isSetupChannel && CONFIG.allowedChannels.includes(msg.channel.id)) isSetupChannel = true
  }

  if (!isDM && !isSetupChannel && !isMentioned) return

  try {
    let cleanInput = msg.content.replace(`<@${client.user.id}>`, "").trim()

    if (msg.reference) {
      try {
        const referencedMsg = await msg.channel.messages.fetch(msg.reference.messageId)
        if (referencedMsg) {
          const refAuthor = referencedMsg.author.bot ? "Bot" : (referencedMsg.member?.displayName || referencedMsg.author.username)
          cleanInput = `[Membalas pesan dari ${refAuthor}: "${referencedMsg.content}"]\n\n${cleanInput}`
        }
      } catch { /* ignore */ }
    }

    if (!cleanInput) return

    console.log(`[Message] Processing from ${msg.author.tag} (${userTag}) in ${guildId}`)
    const stopTyping = startTypingLoop(msg.channel)
    const spinner = startSpinner(`[${userTag}] Mengambil data...`)

    try {
      const serverMemory = await getServerMemory(guildId)
      const history = await getHistory(guildId)
      const taggedInput = `[${userTag}]: ${cleanInput}`

      await addHistory(guildId, "user", taggedInput, userTag)

      const start = Date.now()

      let serverPersonality = CONFIG.personality
      if (!isDM) {
        const customPersonality = await getPersonality(guildId)
        if (customPersonality) serverPersonality = customPersonality
      }

      // Build userTagMap from memory + current user
      const userTagMap = { [userId]: userTag }
      const uniqueUserIds = [...new Set(serverMemory.map(m => m.user_id))]
      if (!isDM && msg.guild) {
        for (const uid of uniqueUserIds) {
          if (!userTagMap[uid]) {
            try {
              const member = await msg.guild.members.fetch(uid).catch(() => null)
              if (member) userTagMap[uid] = member.displayName || member.user.username
            } catch { /* skip */ }
          }
        }
      }

      spinner.update(`[${userTag}] Generating AI reply...`)

      // Kirim pesan sementara "⏳ Sedang memproses..." ke Discord
      const progressMsg = await msg.reply("⏳ Sedang memproses...").catch(() => null)
      
      let currentStep = 1
      let lastEditTime = Date.now()
      const editThrottleMs = 5000

      const onIteration = async (step) => {
        currentStep = step
        // Hanya update jika jarak edit > 5 detik untuk menghindari rate limit Discord
        if (Date.now() - lastEditTime > editThrottleMs) {
          if (progressMsg) {
            await progressMsg.edit(`⏳ Masih berjalan... [langkah ${step}/${CONFIG.agent.maxIterations}]`).catch(() => {})
          }
          lastEditTime = Date.now()
        }
      }

      // Setup update status progress secara reguler per 30 detik
      const progressInterval = setInterval(async () => {
        if (progressMsg) {
          await progressMsg.edit(`⏳ Masih berjalan... [langkah ${currentStep}/${CONFIG.agent.maxIterations}]`).catch(() => {})
        }
      }, 30000)

      // Menjalankan loop agent dengan limitasi timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT_EXCEEDED')), CONFIG.agent.timeoutMs)
      })

      const agentPromise = generateReply({
        system: serverPersonality,
        history,
        memory: serverMemory,
        userInput: taggedInput,
        userTagMap,
        debug: debugMode,
        userId,
        guildId,
        onIteration
      })

      let ai
      try {
        ai = await Promise.race([agentPromise, timeoutPromise])
      } finally {
        clearInterval(progressInterval)
      }

      // Extract memory hanya jika pesan mengandung info yang layak disimpan
      let newMem = []
      if (shouldExtractMemory(cleanInput)) {
        spinner.update(`[${userTag}] Extracting memory...`)
        const userMemoryOnly = serverMemory.filter(m => m.user_id === userId)
        newMem = await extractMemory(cleanInput, ai.text, userMemoryOnly, userTag)
        if (newMem.length) {
          console.log(`\n[Memory] Extracted ${newMem.length} for ${userTag}:`, newMem.map(m => `${m.key}=${m.value}`).join(', '))
          await upsertMemory(guildId, userId, newMem)
        }
      }

      await addHistory(guildId, "assistant", ai.text, "Bot")

      let replyText = ai.text

      if (!replyText || !replyText.trim()) {
        replyText = "🤔 Hmm, aku nggak bisa merespon itu. Coba lagi ya!"
      }

      if (ai.toolSequence && ai.toolSequence.length > 0) {
        replyText += `\n\n⚙️ **Tools Used:** ${ai.toolSequence.map(t => `\`${t}\``).join(' ➔ ')}`
      }

      if (debugMode) {
        replyText += `\n\n\`\`\`\nDEBUG\ntokens: ${JSON.stringify(ai.usage)}\nlatency: ${Date.now() - start}ms\niterations: ${ai.iterations}\nmemory_count: ${serverMemory.length}\nmemory_added: ${JSON.stringify(newMem)}\n\`\`\``
      }

      stopTyping()
      spinner.stop(`[${userTag}] Replied (${Date.now() - start}ms)`)

      const files = []
      if (ai.attachments && ai.attachments.length > 0) {
        for (const att of ai.attachments) {
          if (fs.existsSync(att.filepath)) {
            files.push(new AttachmentBuilder(att.filepath, { name: att.filename }))
          }
        }
      }

      const chunks = splitMessage(replyText)
      
      // Update pesan sementara dengan hasil akhir
      if (progressMsg) {
        try {
          await progressMsg.edit({ content: chunks[0], files })
        } catch (editErr) {
          console.warn(`[Reply] Failed to edit progress message: ${editErr.message}`)
          await msg.reply({ content: chunks[0], files }).catch(() => {})
        }
      } else {
        await msg.reply({ content: chunks[0], files }).catch(() => {})
      }

      for (let i = 1; i < chunks.length; i++) {
        await msg.channel.send(chunks[i])
      }

      // Hapus file temp setelah dikirim
      if (ai.attachments && ai.attachments.length > 0) {
        for (const att of ai.attachments) {
          fs.unlink(att.filepath, (err) => {
            if (err) console.error(`[Cleanup] Gagal menghapus file temp ${att.filepath}:`, err.message)
          })
        }
      }

    } catch (innerErr) {
      stopTyping()
      spinner.fail(`[${userTag}] Error: ${innerErr.message}`)
      
      if (innerErr.message === 'TIMEOUT_EXCEEDED') {
        const timeoutText = `❌ Pemrosesan dihentikan karena melebihi batas waktu ${CONFIG.agent.timeoutMs / 1000} detik.`
        try {
          if (progressMsg) {
            await progressMsg.edit(timeoutText)
          } else {
            await msg.reply(timeoutText)
          }
        } catch {
          await msg.channel.send(timeoutText).catch(() => {})
        }
      } else {
        throw innerErr
      }
    }
  } catch (error) {
    console.error("[messageCreate] Error:", error)
    try {
      await msg.reply("❌ Terjadi kesalahan saat memproses pesan.")
    } catch {
      await msg.channel.send("❌ Terjadi kesalahan saat memproses pesan.").catch(console.error)
    }
  }
})

client.on(Events.Error, error => console.error('[Discord] Error:', error))
process.on('unhandledRejection', error => console.error('[Process] Unhandled rejection:', error))

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('[Login] Failed:', error)
})