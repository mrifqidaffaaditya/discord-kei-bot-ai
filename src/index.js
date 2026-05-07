import { Client, Events, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ActivityType } from 'discord.js'
import { CONFIG } from './config.js'
import { getServerMemory, upsertMemory } from './memory.js'
import { addHistory, getHistory } from './history.js'
import { generateReply, extractMemory, shouldExtractMemory } from './ai.js'
import { handleInteraction, handleLegacyCommand } from './commands.js'
import { initDb, isAllowedChannel, getPersonality } from './db.js'

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
    const commands = [
      new SlashCommandBuilder().setName('help').setDescription('Tampilkan daftar perintah'),
      new SlashCommandBuilder().setName('setup').setDescription('Izinkan bot di channel ini (Admin)'),
      new SlashCommandBuilder().setName('remove-channel').setDescription('Hapus izin bot di channel ini (Admin)'),
      new SlashCommandBuilder().setName('set-personality').setDescription('Ubah sifat bot (Admin)')
        .addStringOption(opt => opt.setName('personality').setDescription('Instruksi baru').setRequired(true)),
      new SlashCommandBuilder().setName('toggle-clear').setDescription('Izinkan/larang user hapus data (Admin)'),
      new SlashCommandBuilder().setName('purge-server').setDescription('Hapus SEMUA data server (Admin)'),
      new SlashCommandBuilder().setName('clear-memory').setDescription('Hapus memory bot tentang kamu'),
      new SlashCommandBuilder().setName('clear-history').setDescription('Hapus riwayat obrolan server (Admin)'),
      new SlashCommandBuilder().setName('debug').setDescription('Toggle debug mode (Bot Owner)'),
    ].map(c => c.toJSON())

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands })
    console.log('[Bot] Slash commands registered.')
  } catch (error) {
    console.error('[Bot] Failed to register slash commands:', error)
  }
})

client.on(Events.InteractionCreate, async (interaction) => {
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
  const isMentioned = msg.mentions.has(client.user)

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
      const ai = await generateReply({
        system: serverPersonality,
        history,
        memory: serverMemory,
        userInput: taggedInput,
        userTagMap,
        debug: debugMode
      })

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
      if (debugMode) {
        replyText += `\n\n\`\`\`\nDEBUG\ntokens: ${JSON.stringify(ai.usage)}\nlatency: ${Date.now() - start}ms\nmemory_count: ${serverMemory.length}\nmemory_added: ${JSON.stringify(newMem)}\n\`\`\``
      }

      stopTyping()
      spinner.stop(`[${userTag}] Replied (${Date.now() - start}ms)`)

      const chunks = splitMessage(replyText)
      await msg.reply(chunks[0])
      for (let i = 1; i < chunks.length; i++) {
        await msg.channel.send(chunks[i])
      }
    } catch (innerErr) {
      stopTyping()
      spinner.fail(`[${userTag}] Error: ${innerErr.message}`)
      throw innerErr
    }
  } catch (error) {
    console.error("[messageCreate] Error:", error)
    await msg.reply("❌ Terjadi kesalahan saat memproses pesan.").catch(console.error)
  }
})

client.on(Events.Error, error => console.error('[Discord] Error:', error))
process.on('unhandledRejection', error => console.error('[Process] Unhandled rejection:', error))

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('[Login] Failed:', error)
})