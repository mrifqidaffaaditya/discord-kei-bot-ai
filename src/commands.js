import { clearMemory, clearServerMemory } from './memory.js'
import { clearHistory, clearServerHistory } from './history.js'
import { addAllowedChannel, removeAllowedChannel, setPersonality, getAllowClear, setAllowClear } from './db.js'
import { MessageFlags, PermissionFlagsBits } from 'discord.js'

const HELP_TEXT = `**🤖 Kei Bot AI — Daftar Perintah**

💬 **Chat dengan Bot**
> Mention bot atau chat langsung di channel yang sudah di-setup

🛡️ **Perintah Admin Server** *(perlu izin Manage Server)*
> \`/setup\` · \`!ai setup\` — Izinkan bot di channel ini
> \`/remove-channel\` · \`!ai remove-channel\` — Hapus izin bot
> \`/set-personality\` · \`!ai set-personality <teks>\` — Ubah sifat bot
> \`/toggle-clear\` · \`!ai toggle-clear\` — Izinkan/larang user hapus data
> \`/purge-server\` · \`!ai purge-server\` — Hapus SEMUA data user di server ini

🔑 **Perintah Bot Owner**
> \`/debug\` · \`!ai debug\` — Toggle mode debug

👤 **Perintah User**
> \`/clear-memory\` · \`!ai clear-memory\` — Hapus memory bot tentang kamu
> \`/clear-history\` · \`!ai clear-history\` — Hapus riwayat obrolan
> \`/help\` · \`!ai help\` — Tampilkan pesan ini
`

// Cek apakah user adalah admin server (punya permission Manage Guild)
function isServerAdmin(msg) {
  if (!msg.guild) return false
  const member = msg.member
  if (!member) return false
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
}

function isServerAdminInteraction(interaction) {
  if (!interaction.guildId) return false
  const member = interaction.member
  if (!member) return false
  return member.permissions.has(PermissionFlagsBits.ManageGuild)
}

export async function handleLegacyCommand(msg, args, ctx) {
  const { guildId, userId, isBotAdmin } = ctx
  const commandName = args[0]
  const serverAdmin = isServerAdmin(msg)

  try {
    if (commandName === "help") {
      return msg.reply(HELP_TEXT)
    }

    if (commandName === "setup") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      await addAllowedChannel(guildId, msg.channel.id)
      console.log(`[Command] !ai setup — channel ${msg.channel.id} added by ${msg.author.tag}`)
      return msg.reply("✅ Channel ini sekarang diizinkan untuk digunakan oleh Bot AI.")
    }

    if (commandName === "remove-channel") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      await removeAllowedChannel(guildId, msg.channel.id)
      console.log(`[Command] !ai remove-channel — channel ${msg.channel.id} removed by ${msg.author.tag}`)
      return msg.reply("✅ Channel ini telah dihapus dari daftar izin Bot AI.")
    }

    if (commandName === "set-personality") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      const newPersonality = args.slice(1).join(" ")
      if (!newPersonality) return msg.reply("⚠️ Harap masukkan instruksi personality baru.\nContoh: `!ai set-personality Kamu asisten gaul.`")
      await setPersonality(guildId, newPersonality)
      console.log(`[Command] !ai set-personality — updated by ${msg.author.tag}`)
      return msg.reply(`✅ Personality berhasil diubah menjadi:\n> ${newPersonality}`)
    }

    if (commandName === "toggle-clear") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      const current = await getAllowClear(guildId)
      const newValue = !current
      await setAllowClear(guildId, newValue)
      console.log(`[Command] !ai toggle-clear — ${newValue ? "ON" : "OFF"} by ${msg.author.tag}`)
      return msg.reply(`🔧 User ${newValue ? "**diizinkan**" : "**dilarang**"} menghapus history & memory di server ini.`)
    }

    if (commandName === "purge-server") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      await clearServerMemory(guildId)
      await clearServerHistory(guildId)
      console.log(`[Command] !ai purge-server — all data purged by ${msg.author.tag}`)
      return msg.reply("🗑️ Semua data memory & history user di server ini telah dihapus.")
    }

    if (commandName === "clear-memory") {
      const isDM = !msg.guild
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return msg.reply("⛔ Admin server melarang user menghapus memory di server ini.")
      }
      await clearMemory(guildId, userId)
      console.log(`[Command] !ai clear-memory — by ${msg.author.tag}`)
      return msg.reply("✅ Memory percakapan telah dihapus.")
    }

    if (commandName === "clear-history") {
      const isDM = !msg.guild
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return msg.reply("⛔ Admin server melarang user menghapus history di server ini.")
      }
      await clearHistory(guildId, userId)
      console.log(`[Command] !ai clear-history — by ${msg.author.tag}`)
      return msg.reply("✅ History percakapan telah dihapus.")
    }

    if (commandName === "debug") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat menjalankan perintah ini.")
      ctx.debug = !ctx.debug
      console.log(`[Command] !ai debug — ${ctx.debug ? "ON" : "OFF"} by ${msg.author.tag}`)
      await msg.reply(`🔧 Debug mode: **${ctx.debug ? "ON" : "OFF"}**`)
      return ctx.debug
    }

    // Unknown command
    return msg.reply(`⚠️ Command \`${commandName}\` tidak dikenal. Ketik \`!ai help\` untuk daftar perintah.`)
  } catch (error) {
    console.error(`[handleLegacyCommand] Error saat menjalankan !ai ${commandName}:`, error)
    await msg.reply("❌ Terjadi kesalahan saat menjalankan command.").catch(console.error)
  }
}

export async function handleInteraction(interaction, ctx) {
  const { guildId, userId, isBotAdmin } = ctx
  const commandName = interaction.commandName
  const serverAdmin = isServerAdminInteraction(interaction)

  try {
    if (commandName === "help") {
      return interaction.reply({ content: HELP_TEXT, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "setup") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await addAllowedChannel(guildId, interaction.channelId)
      console.log(`[Interaction] /setup — channel ${interaction.channelId} added by ${interaction.user.tag}`)
      return interaction.reply({ content: "✅ Channel ini sekarang diizinkan untuk digunakan oleh Bot AI.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "remove-channel") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await removeAllowedChannel(guildId, interaction.channelId)
      console.log(`[Interaction] /remove-channel — channel ${interaction.channelId} removed by ${interaction.user.tag}`)
      return interaction.reply({ content: "✅ Channel ini telah dihapus dari daftar izin Bot AI.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "set-personality") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      const newPersonality = interaction.options.getString('personality')
      await setPersonality(guildId, newPersonality)
      console.log(`[Interaction] /set-personality — updated by ${interaction.user.tag}`)
      return interaction.reply({ content: `✅ Personality berhasil diubah menjadi:\n> ${newPersonality}`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "toggle-clear") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      const current = await getAllowClear(guildId)
      const newValue = !current
      await setAllowClear(guildId, newValue)
      console.log(`[Interaction] /toggle-clear — ${newValue ? "ON" : "OFF"} by ${interaction.user.tag}`)
      return interaction.reply({ content: `🔧 User ${newValue ? "**diizinkan**" : "**dilarang**"} menghapus history & memory di server ini.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "purge-server") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await clearServerMemory(guildId)
      await clearServerHistory(guildId)
      console.log(`[Interaction] /purge-server — all data purged by ${interaction.user.tag}`)
      return interaction.reply({ content: "🗑️ Semua data memory & history user di server ini telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "clear-memory") {
      const isDM = !interaction.guildId
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return interaction.reply({ content: "⛔ Admin server melarang user menghapus memory di server ini.", flags: MessageFlags.Ephemeral })
      }
      await clearMemory(guildId, userId)
      console.log(`[Interaction] /clear-memory — by ${interaction.user.tag}`)
      return interaction.reply({ content: "✅ Memory percakapan telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "clear-history") {
      const isDM = !interaction.guildId
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return interaction.reply({ content: "⛔ Admin server melarang user menghapus history di server ini.", flags: MessageFlags.Ephemeral })
      }
      await clearHistory(guildId, userId)
      console.log(`[Interaction] /clear-history — by ${interaction.user.tag}`)
      return interaction.reply({ content: "✅ History percakapan telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "debug") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      ctx.debug = !ctx.debug
      console.log(`[Interaction] /debug — ${ctx.debug ? "ON" : "OFF"} by ${interaction.user.tag}`)
      await interaction.reply({ content: `🔧 Debug mode: **${ctx.debug ? "ON" : "OFF"}**`, flags: MessageFlags.Ephemeral })
      return ctx.debug
    }
  } catch (error) {
    console.error(`[handleInteraction] Error saat menjalankan /${commandName}:`, error)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Terjadi kesalahan saat menjalankan command.", flags: MessageFlags.Ephemeral }).catch(console.error)
    }
  }
}