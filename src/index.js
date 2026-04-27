import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { CONFIG } from './config.js'
import { getUserMemory, upsertMemory } from './memory.js'
import { addHistory, getHistory } from './history.js'
import { generateReply, extractMemory } from './ai.js'
import { handleInteraction, handleLegacyCommand } from './commands.js'
import { initDb, isAllowedChannel, getPersonality } from './db.js'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Required for DM support
})

let debugMode = false

// Discord message character limit
const MAX_MSG_LENGTH = 2000

// Split long messages into chunks that fit Discord's limit
function splitMessage(text, maxLength = MAX_MSG_LENGTH) {
  if (text.length <= maxLength) return [text]
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    // Try to split at newline
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt <= 0) splitAt = maxLength
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt)
  }
  return chunks
}

client.once(Events.ClientReady, async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`)
  console.log(`[Bot] Serving ${client.guilds.cache.size} server(s)`)
  try {
    await initDb()
    console.log('[DB] Database tables initialized.')
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error)
  }
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return

  const isDM = !interaction.guildId
  const guildId = isDM ? "dm" : interaction.guildId
  const userId = interaction.user.id
  const isAdmin = CONFIG.adminIds.includes(userId)

  console.log(`[Interaction] /${interaction.commandName} by ${interaction.user.tag}`)

  const newDebugMode = await handleInteraction(interaction, {
    guildId,
    userId,
    isAdmin,
    debug: debugMode
  })
  if (newDebugMode !== undefined) {
    debugMode = newDebugMode
  }
})

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return

  const isDM = msg.channel.isDMBased()
  const guildId = isDM ? "dm" : msg.guild.id
  const userId = msg.author.id
  const isAdmin = CONFIG.adminIds.includes(userId)

  // legacy text command (works anywhere, no channel restriction)
  if (msg.content.startsWith("!ai ")) {
    const args = msg.content.split(" ").slice(1)
    console.log(`[Command] !ai ${args[0]} by ${msg.author.tag}`)
    const newDebugMode = await handleLegacyCommand(msg, args, {
      guildId,
      userId,
      isAdmin,
      debug: debugMode
    })
    if (newDebugMode !== undefined) {
      debugMode = newDebugMode
    }
    return
  }

  let isSetupChannel = false
  const isMentioned = msg.mentions.has(client.user)

  if (!isDM) {
    isSetupChannel = await isAllowedChannel(guildId, msg.channel.id)
    // Fallback ke file .env
    if (!isSetupChannel && CONFIG.allowedChannels.includes(msg.channel.id)) {
      isSetupChannel = true
    }
  }

  // Di channel yang sudah di-setup: tidak perlu mention
  // Di channel yang belum di-setup: harus mention bot
  // DM: selalu boleh
  if (!isDM && !isSetupChannel && !isMentioned) return

  try {
    let cleanInput = msg.content.replace(`<@${client.user.id}>`, "").trim()

    // Jika user me-reply pesan lain, sertakan konteks pesan yang di-reply
    if (msg.reference) {
      try {
        const referencedMsg = await msg.channel.messages.fetch(msg.reference.messageId)
        if (referencedMsg) {
          const refAuthor = referencedMsg.author.bot ? "Bot" : referencedMsg.author.displayName
          cleanInput = `[Membalas pesan dari ${refAuthor}: "${referencedMsg.content}"]\n\n${cleanInput}`
        }
      } catch {
        // Abaikan jika gagal mengambil pesan yang di-reply
      }
    }

    // Abaikan jika input kosong
    if (!cleanInput) {
      return
    }

    console.log(`[Message] Processing message from ${msg.author.tag} in ${guildId}`)
    await msg.channel.sendTyping()

    const memory = await getUserMemory(guildId, userId)
    const history = await getHistory(guildId, userId)

    // add user message to history
    await addHistory(guildId, userId, { role: "user", content: cleanInput })

    const start = Date.now()

    let serverPersonality = CONFIG.personality
    if (!isDM) {
      const customPersonality = await getPersonality(guildId)
      if (customPersonality) {
        serverPersonality = customPersonality
      }
    }

    const ai = await generateReply({
      system: serverPersonality,
      history,
      memory,
      userInput: cleanInput,
      debug: debugMode
    })

    // memory extraction — analisis user input + AI reply + memory lama
    const newMem = await extractMemory(cleanInput, ai.text, memory)
    if (newMem.length) {
      console.log(`[Memory] Extracted ${newMem.length} memory for ${userId}:`, newMem.map(m => `${m.key}=${m.value}`).join(', '))
      await upsertMemory(guildId, userId, newMem)
    }

    // save AI response
    await addHistory(guildId, userId, { role: "assistant", content: ai.text })

    let replyText = ai.text

    if (debugMode) {
      replyText += `\n\n\`\`\`\nDEBUG\ntokens: ${JSON.stringify(ai.usage)}\nlatency: ${Date.now() - start}ms\nmemory_added: ${JSON.stringify(newMem)}\n\`\`\``
    }

    // Split message if it exceeds Discord's 2000 char limit
    const chunks = splitMessage(replyText)
    await msg.reply(chunks[0])
    for (let i = 1; i < chunks.length; i++) {
      await msg.channel.send(chunks[i])
    }

    console.log(`[Message] Replied to ${msg.author.tag} (Latency: ${Date.now() - start}ms)`)
  } catch (error) {
    console.error("[messageCreate] Error processing message:", error)
    await msg.reply("❌ Terjadi kesalahan saat memproses pesan.").catch(console.error)
  }
})

client.on(Events.Error, error => {
  console.error('[Discord Client] Error:', error)
})

process.on('unhandledRejection', error => {
  console.error('[Process] Unhandled promise rejection:', error)
})

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('[Login] Failed to login:', error)
})