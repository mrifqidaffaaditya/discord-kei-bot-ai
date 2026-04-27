import { Client, GatewayIntentBits } from 'discord.js'
import { CONFIG } from './config.js'
import { getUserMemory, upsertMemory } from './memory.js'
import { addHistory, getHistory } from './history.js'
import { generateReply, extractMemory } from './ai.js'
import { handleCommand } from './commands.js'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages]
})

let debugMode = false

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return

  const isDM = msg.channel.isDMBased()
  const guildId = isDM ? "dm" : msg.guild.id
  const userId = msg.author.id

  const isAllowedChannel = CONFIG.allowedChannels.includes(msg.channel.id)
  const isMentioned = msg.mentions.has(client.user)

  // command
  if (msg.content.startsWith("!ai")) {
    const args = msg.content.split(" ").slice(1)
    return handleCommand(msg, args, {
      guildId,
      userId,
      isAdmin: CONFIG.adminIds.includes(userId),
      debug: debugMode
    })
  }

  if (!isDM && (!isAllowedChannel || !isMentioned)) return

  const cleanInput = msg.content.replace(`<@${client.user.id}>`, "").trim()

  const memory = await getUserMemory(guildId, userId)
  const history = await getHistory(guildId, userId)

  // add user message to history
  await addHistory(guildId, userId, { role: "user", content: cleanInput })

  const start = Date.now()

  const ai = await generateReply({
    system: CONFIG.personality,
    history,
    memory,
    userInput: cleanInput,
    debug: debugMode
  })

  // memory extraction
  const newMem = await extractMemory(cleanInput)
  if (newMem.length) {
    await upsertMemory(guildId, userId, newMem)
  }

  // save AI response
  await addHistory(guildId, userId, { role: "assistant", content: ai.text })

  let replyText = ai.text

  if (debugMode) {
    replyText += `

\`\`\`
DEBUG
tokens: ${JSON.stringify(ai.usage)}
latency: ${Date.now() - start}ms
memory_added: ${JSON.stringify(newMem)}
\`\`\``
  }

  msg.reply(replyText)
})

client.login(process.env.DISCORD_TOKEN)