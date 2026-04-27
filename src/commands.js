import { clearMemory } from './memory.js'
import { clearHistory } from './history.js'

export async function handleCommand(msg, args, ctx) {
  const { guildId, userId, isAdmin } = ctx

  if (args[0] === "clear-memory") {
    if (!isAdmin && msg.author.id !== userId) return msg.reply("No permission")
    await clearMemory(guildId, userId)
    return msg.reply("Memory cleared")
  }

  if (args[0] === "clear-history") {
    await clearHistory(guildId, userId)
    return msg.reply("History cleared")
  }

  if (args[0] === "debug") {
    ctx.debug = !ctx.debug
    return msg.reply(`Debug: ${ctx.debug}`)
  }
}