import { clearUserMemory, clearServerMemory } from './memory.js'
import { clearHistory } from './history.js'
import { addAllowedChannel, removeAllowedChannel, setPersonality, getAllowClear, setAllowClear } from './db.js'
import { MessageFlags, PermissionFlagsBits, EmbedBuilder } from 'discord.js'
import { checkToolEnabled, setToolEnabled } from './tools/rateLimit.js'
import { BUILTIN_TOOLS } from './tools/index.js'
import { 
  createSkill, getSkillByName, getActiveSkillsForGuild, 
  deleteSkill, toggleSkill, updateSkill, incrementSkillUsage 
} from './skills/index.js'
import { executeSkill } from './skills/executor.js'
import { fetchSkillFromUrl, installSkill } from './skills/installer.js'
import { mcpClients, mcpToolsCache, unregisterClient } from './mcp/registry.js'
import { connectMcpServer, executeMcpTool } from './mcp/index.js'
import { parseMcpInstallation, addMcpServerConfig } from './mcp/installer.js'
import fs from 'fs'
import path from 'path'
import { CONFIG } from './config.js'

const HELP_TEXT = `**🤖 Kei Agent Bot — Daftar Perintah**

💬 **Chat dengan Bot**
> Mention bot atau chat langsung di channel yang sudah di-setup
> Bot ini adalah *Autonomous Agent* yang dibekali built-in tools, skill, dan MCP.

🛡️ **Perintah Admin Server** *(perlu izin Manage Server)*
> \`/setup\` · \`!ai setup\` — Izinkan bot di channel ini
> \`/remove-channel\` · \`!ai remove-channel\` — Hapus izin bot
> \`/set-personality\` · \`!ai set-personality <teks>\` — Ubah sifat bot
> \`/toggle-clear\` · \`!ai toggle-clear\` — Izinkan/larang user hapus data
> \`/purge-server\` · \`!ai purge-server\` — Hapus SEMUA data server
> \`/clear-history\` · \`!ai clear-history\` — Hapus riwayat obrolan server

⚙️ **Manajemen Tools (Admin)**
> \`/tool-list\` · \`!ai tool-list\` — Lihat list tool built-in
> \`/tool-enable <nama>\` · \`!ai tool-enable <nama>\` — Aktifkan tool di server
> \`/tool-disable <nama>\` · \`!ai tool-disable <nama>\` — Nonaktifkan tool

📦 **Manajemen Skill (Admin / User)**
> \`/skill-list\` · \`!ai skill-list\` — Lihat skill aktif
> \`/skill-info <nama>\` · \`!ai skill-info <nama>\` — Detail skill
> \`/skill-run <nama> [input]\` · \`!ai skill-run <nama> [input]\` — Jalankan skill secara manual
> \`/skill-create\` (Slash only) — Buat skill baru (Admin)
> \`/skill-delete <nama>\` · \`!ai skill-delete <nama>\` — Hapus skill (Admin)
> \`/skill-enable <nama>\` · \`!ai skill-enable <nama>\` — Aktifkan skill (Admin)
> \`/skill-disable <nama>\` · \`!ai skill-disable <nama>\` — Nonaktifkan skill (Admin)
> \`/skill-install <url>\` · \`!ai skill-install <url>\` — Pasang skill dari link JSON (Admin)

🔑 **Perintah Bot Owner (MCP)**
> \`/debug\` · \`!ai debug\` — Toggle mode debug
> \`/mcp-list\` · \`!ai mcp-list\` — List server MCP
> \`/mcp-tools <server>\` · \`!ai mcp-tools <server>\` — List tool milik server MCP
> \`/mcp-enable <server>\` · \`!ai mcp-enable <server>\` — Aktifkan server MCP
> \`/mcp-disable <server>\` · \`!ai mcp-disable <server>\` — Nonaktifkan server MCP
> \`/mcp-reconnect <server>\` · \`!ai mcp-reconnect <server>\` — Reconnect server MCP
> \`!ai mcp-install <url|npx>\` (Text only) — Pasang server MCP baru

👤 **Perintah User**
> \`/clear-memory\` · \`!ai clear-memory\` — Hapus memory bot tentang kamu
> \`/help\` · \`!ai help\` — Tampilkan pesan ini
`

function isServerAdmin(msg) {
  if (!msg.guild) return false
  return msg.member?.permissions.has(PermissionFlagsBits.ManageGuild) || false
}

function isServerAdminInteraction(interaction) {
  if (!interaction.guildId) return false
  return interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild) || false
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
      if (!newPersonality) return msg.reply("⚠️ Harap masukkan instruksi personality baru.")
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
      return msg.reply(`🔧 User ${newValue ? "**diizinkan**" : "**dilarang**"} menghapus data di server ini.`)
    }

    if (commandName === "purge-server") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server (Manage Server) yang dapat menjalankan perintah ini.")
      await clearServerMemory(guildId)
      await clearHistory(guildId)
      console.log(`[Command] !ai purge-server — all data purged by ${msg.author.tag}`)
      return msg.reply("🗑️ Semua data memory & history di server ini telah dihapus.")
    }

    if (commandName === "clear-memory") {
      const isDM = !msg.guild
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return msg.reply("⛔ Admin server melarang user menghapus memory di server ini.")
      }
      await clearUserMemory(guildId, userId)
      console.log(`[Command] !ai clear-memory — by ${msg.author.tag}`)
      return msg.reply("✅ Memory tentang kamu telah dihapus.")
    }

    if (commandName === "clear-history") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat menghapus riwayat server.")
      await clearHistory(guildId)
      console.log(`[Command] !ai clear-history — server history cleared by ${msg.author.tag}`)
      return msg.reply("🗑️ Riwayat obrolan server telah dihapus.")
    }

    if (commandName === "debug") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat menjalankan perintah ini.")
      ctx.debug = !ctx.debug
      console.log(`[Command] !ai debug — ${ctx.debug ? "ON" : "OFF"} by ${msg.author.tag}`)
      await msg.reply(`🔧 Debug mode: **${ctx.debug ? "ON" : "OFF"}**`)
      return ctx.debug
    }

    // --- MANAJEMEN TOOLS ---
    if (commandName === "tool-list") {
      const list = []
      for (const name of Object.keys(BUILTIN_TOOLS)) {
        const enabled = await checkToolEnabled(guildId, name)
        list.push(`${enabled ? '🟢' : '🔴'} \`${name}\``)
      }
      return msg.reply(`**🛠️ Daftar Built-in Tools:**\n${list.join('\n')}`)
    }

    if (commandName === "tool-enable") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat mengaktifkan tool.")
      const name = args[1]
      if (!BUILTIN_TOOLS[name]) return msg.reply(`⚠️ Tool "${name}" tidak dikenal.`)
      await setToolEnabled(guildId, name, true)
      return msg.reply(`🟢 Tool \`${name}\` telah diaktifkan di server ini.`)
    }

    if (commandName === "tool-disable") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat menonaktifkan tool.")
      const name = args[1]
      if (!BUILTIN_TOOLS[name]) return msg.reply(`⚠️ Tool "${name}" tidak dikenal.`)
      await setToolEnabled(guildId, name, false)
      return msg.reply(`🔴 Tool \`${name}\` telah dinonaktifkan di server ini.`)
    }

    // --- MANAJEMEN SKILLS ---
    if (commandName === "skill-list") {
      const activeSkills = await getActiveSkillsForGuild(guildId)
      if (activeSkills.length === 0) return msg.reply("⚠️ Tidak ada skill aktif di server ini.")
      const str = activeSkills.map(s => `• \`${s.name}\` (${s.type}) - ${s.description || 'Tidak ada deskripsi'}`).join('\n')
      return msg.reply(`**📦 Daftar Skill Aktif:**\n${str}`)
    }

    if (commandName === "skill-info") {
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama skill.")
      const skill = await getSkillByName(guildId, name)
      if (!skill) return msg.reply(`❌ Skill \`${name}\` tidak ditemukan.`)
      
      const embed = new EmbedBuilder()
        .setTitle(`📦 Skill: ${skill.name}`)
        .setDescription(skill.description || 'Tidak ada deskripsi.')
        .addFields(
          { name: 'Tipe', value: skill.type, inline: true },
          { name: 'Scope', value: skill.scope, inline: true },
          { name: 'Dibuat Oleh', value: `<@${skill.author_id}>`, inline: true },
          { name: 'Di-call', value: `${skill.usage_count} kali`, inline: true },
          { name: 'Trigger Kata Kunci', value: (skill.trigger_patterns || []).map(p => `\`${p}\``).join(', ') || 'Tidak ada', inline: false }
        )
        .setColor('#5865F2')
      return msg.reply({ embeds: [embed] })
    }

    if (commandName === "skill-enable") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat mengaktifkan skill.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama skill.")
      const success = await toggleSkill(guildId, name, true)
      return msg.reply(success ? `🟢 Skill \`${name}\` berhasil diaktifkan.` : `❌ Gagal mengaktifkan skill \`${name}\`.`)
    }

    if (commandName === "skill-disable") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat menonaktifkan skill.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama skill.")
      const success = await toggleSkill(guildId, name, false)
      return msg.reply(success ? `🔴 Skill \`${name}\` dinonaktifkan sementara.` : `❌ Gagal menonaktifkan skill \`${name}\`.`)
    }

    if (commandName === "skill-delete") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat menghapus skill.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama skill.")
      const success = await deleteSkill(guildId, name)
      return msg.reply(success ? `🗑️ Skill \`${name}\` telah dihapus.` : `❌ Gagal menghapus skill \`${name}\`.`)
    }

    if (commandName === "skill-install") {
      if (!serverAdmin) return msg.reply("⛔ Hanya Admin Server yang dapat menginstal skill.")
      const url = args[1]
      if (!url) return msg.reply("⚠️ Harap masukkan URL JSON skill.")

      const replyPending = await msg.reply("⏳ Mengambil dan memvalidasi skill...")
      try {
        const skillsFetched = await fetchSkillFromUrl(url)
        const installed = []
        for (const data of skillsFetched) {
          const res = await installSkill(guildId, userId, data, isBotAdmin)
          installed.push(res)
        }
        const text = installed.map(s => `• \`${s.name}\` (${s.type})${s.enabled ? '' : ' ⚠️ (Nonaktif, perlu enable manual)'}`).join('\n')
        return replyPending.edit(`📦 **Berhasil menginstal skill:**\n${text}`)
      } catch (err) {
        return replyPending.edit(`❌ Gagal menginstal skill: ${err.message}`)
      }
    }

    if (commandName === "skill-run") {
      const name = args[1]
      const inputVal = args.slice(2).join(' ')
      if (!name) return msg.reply("⚠️ Masukkan nama skill.")
      
      const skill = await getSkillByName(guildId, name)
      if (!skill) return msg.reply(`❌ Skill \`${name}\` tidak ditemukan atau nonaktif.`)
      if (!skill.enabled) return msg.reply(`❌ Skill \`${name}\` sedang dinonaktifkan.`)

      const progress = await msg.reply(`⏳ Menjalankan skill \`${name}\`...`)
      try {
        const result = await executeSkill(skill, { input: inputVal }, { userId, guildId })
        await incrementSkillUsage(skill.id)
        return progress.edit(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
      } catch (err) {
        return progress.edit(`❌ Error saat menjalankan skill: ${err.message}`)
      }
    }

    // --- MANAJEMEN MCP (Bot Owner) ---
    if (commandName === "mcp-list") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat melihat daftar MCP.")
      const configPath = path.resolve('mcp_servers.json')
      if (!fs.existsSync(configPath)) return msg.reply("⚠️ File mcp_servers.json tidak ditemukan.")
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const servers = config.servers || []
      const list = servers.map(s => {
        const active = mcpClients.has(s.name)
        return `• **${s.name}** [${s.type}] - ${s.enabled ? '🟢 Enabled' : '🔴 Disabled'} | ${active ? '⚡ Connected' : '💤 Disconnected'}`
      }).join('\n')

      return msg.reply(`**🔌 Daftar Server MCP:**\n${list || 'Tidak ada server terdaftar.'}`)
    }

    if (commandName === "mcp-enable") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat mengaktifkan MCP.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama server MCP.")

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return msg.reply(`❌ Server MCP "${name}" tidak ditemukan.`)

      server.enabled = true
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      await connectMcpServer(server)
      return msg.reply(`🟢 Server MCP \`${name}\` diaktifkan dan menghubungkan...`)
    }

    if (commandName === "mcp-disable") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat menonaktifkan MCP.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama server MCP.")

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return msg.reply(`❌ Server MCP "${name}" tidak ditemukan.`)

      server.enabled = false
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      await unregisterClient(name)
      return msg.reply(`🔴 Server MCP \`${name}\` dinonaktifkan dan koneksi ditutup.`)
    }

    if (commandName === "mcp-reconnect") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat me-reconnect MCP.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama server MCP.")

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return msg.reply(`❌ Server MCP "${name}" tidak ditemukan.`)

      await connectMcpServer(server)
      return msg.reply(`🔄 Sedang merefresh koneksi ke server MCP \`${name}\`...`)
    }

    if (commandName === "mcp-tools") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat mengakses tools MCP.")
      const name = args[1]
      if (!name) return msg.reply("⚠️ Masukkan nama server MCP.")
      
      const tools = mcpToolsCache.get(name) || []
      if (tools.length === 0) return msg.reply(`⚠️ Tidak ada tools terdaftar/aktif di server MCP \`${name}\`.`)
      
      const list = tools.map(t => `• \`mcp__${name}__${t.name}\` - ${t.description || 'Tidak ada deskripsi'}`).join('\n')
      return msg.reply(`**🛠️ Tools pada server MCP \`${name}\`:**\n${list}`)
    }

    if (commandName === "mcp-install") {
      if (!isBotAdmin) return msg.reply("⛔ Hanya Bot Owner yang dapat menginstal server MCP.")
      const inputString = args.slice(1).join(' ')
      if (!inputString) return msg.reply("⚠️ Harap masukkan URL repo GitHub atau perintah npx server MCP.")

      const replyPending = await msg.reply("⏳ Memparsing instalasi MCP...")
      try {
        const serverConfig = await parseMcpInstallation(inputString)
        await addMcpServerConfig(serverConfig)
        
        const embed = new EmbedBuilder()
          .setTitle('📦 Konfigurasi MCP Berhasil Disimpan')
          .setDescription(`Server \`${serverConfig.name}\` telah ditambahkan ke konfigurasi.`)
          .addFields(
            { name: 'Tipe', value: serverConfig.type, inline: true },
            { name: 'Perintah', value: `\`${serverConfig.command} ${serverConfig.args.join(' ')}\``, inline: false },
            { name: 'Deskripsi', value: serverConfig.description || '-', inline: false }
          )
          .setColor('#5865F2')

        await replyPending.edit({ content: '✅ MCP terinstal!', embeds: [embed] })
        
        // Coba hubungkan secara otomatis jika di-enable
        if (serverConfig.enabled) {
          await connectMcpServer(serverConfig)
        }
      } catch (err) {
        return replyPending.edit(`❌ Gagal menginstal MCP server: ${err.message}`)
      }
      return
    }

    return msg.reply(`⚠️ Perintah \`${commandName}\` tidak dikenal.`)
  } catch (error) {
    console.error(`[handleLegacyCommand] Error:`, error)
    await msg.reply("❌ Terjadi kesalahan saat menjalankan perintah.").catch(console.error)
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
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await addAllowedChannel(guildId, interaction.channelId)
      return interaction.reply({ content: "✅ Channel ini sekarang diizinkan untuk Bot AI.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "remove-channel") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await removeAllowedChannel(guildId, interaction.channelId)
      return interaction.reply({ content: "✅ Channel ini telah dihapus dari izin Bot AI.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "set-personality") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      const newPersonality = interaction.options.getString('personality')
      await setPersonality(guildId, newPersonality)
      return interaction.reply({ content: `✅ Personality diubah:\n> ${newPersonality}`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "toggle-clear") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      const current = await getAllowClear(guildId)
      const newValue = !current
      await setAllowClear(guildId, newValue)
      return interaction.reply({ content: `🔧 User ${newValue ? "**diizinkan**" : "**dilarang**"} menghapus data di server ini.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "purge-server") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      await clearServerMemory(guildId)
      await clearHistory(guildId)
      return interaction.reply({ content: "🗑️ Semua data memory & history server telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "clear-memory") {
      const isDM = !interaction.guildId
      if (!isDM) {
        const canClear = await getAllowClear(guildId)
        if (!canClear) return interaction.reply({ content: "⛔ Admin server melarang user menghapus memory.", flags: MessageFlags.Ephemeral })
      }
      await clearUserMemory(guildId, userId)
      return interaction.reply({ content: "✅ Memory tentang kamu telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "clear-history") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menghapus riwayat server.", flags: MessageFlags.Ephemeral })
      await clearHistory(guildId)
      return interaction.reply({ content: "🗑️ Riwayat obrolan server telah dihapus.", flags: MessageFlags.Ephemeral })
    }

    if (commandName === "debug") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat menjalankan perintah ini.", flags: MessageFlags.Ephemeral })
      ctx.debug = !ctx.debug
      await interaction.reply({ content: `🔧 Debug mode: **${ctx.debug ? "ON" : "OFF"}**`, flags: MessageFlags.Ephemeral })
      return ctx.debug
    }

    // --- SLASHTOOL HANDLERS ---
    if (commandName === "tool-list") {
      const list = []
      for (const name of Object.keys(BUILTIN_TOOLS)) {
        const enabled = await checkToolEnabled(guildId, name)
        list.push(`${enabled ? '🟢' : '🔴'} \`${name}\``)
      }
      return interaction.reply({ content: `**🛠️ Daftar Built-in Tools:**\n${list.join('\n')}`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "tool-enable") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat mengaktifkan tool.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('tool')
      if (!BUILTIN_TOOLS[name]) return interaction.reply({ content: `⚠️ Tool "${name}" tidak dikenal.`, flags: MessageFlags.Ephemeral })
      await setToolEnabled(guildId, name, true)
      return interaction.reply({ content: `🟢 Tool \`${name}\` telah diaktifkan di server ini.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "tool-disable") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menonaktifkan tool.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('tool')
      if (!BUILTIN_TOOLS[name]) return interaction.reply({ content: `⚠️ Tool "${name}" tidak dikenal.`, flags: MessageFlags.Ephemeral })
      await setToolEnabled(guildId, name, false)
      return interaction.reply({ content: `🔴 Tool \`${name}\` telah dinonaktifkan di server ini.`, flags: MessageFlags.Ephemeral })
    }

    // --- SLASHSKILL HANDLERS ---
    if (commandName === "skill-list") {
      const activeSkills = await getActiveSkillsForGuild(guildId)
      if (activeSkills.length === 0) return interaction.reply({ content: "⚠️ Tidak ada skill aktif di server ini.", flags: MessageFlags.Ephemeral })
      const str = activeSkills.map(s => `• \`${s.name}\` (${s.type}) - ${s.description || 'Tidak ada deskripsi'}`).join('\n')
      return interaction.reply({ content: `**📦 Daftar Skill Aktif:**\n${str}`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "skill-info") {
      const name = interaction.options.getString('name')
      const skill = await getSkillByName(guildId, name)
      if (!skill) return interaction.reply({ content: `❌ Skill \`${name}\` tidak ditemukan.`, flags: MessageFlags.Ephemeral })
      
      const embed = new EmbedBuilder()
        .setTitle(`📦 Skill: ${skill.name}`)
        .setDescription(skill.description || 'Tidak ada deskripsi.')
        .addFields(
          { name: 'Tipe', value: skill.type, inline: true },
          { name: 'Scope', value: skill.scope, inline: true },
          { name: 'Dibuat Oleh', value: `<@${skill.author_id}>`, inline: true },
          { name: 'Di-call', value: `${skill.usage_count} kali`, inline: true },
          { name: 'Trigger Kata Kunci', value: (skill.trigger_patterns || []).map(p => `\`${p}\``).join(', ') || 'Tidak ada', inline: false }
        )
        .setColor('#5865F2')
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral })
    }

    if (commandName === "skill-enable") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat mengaktifkan skill.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('name')
      const success = await toggleSkill(guildId, name, true)
      return interaction.reply({ content: success ? `🟢 Skill \`${name}\` berhasil diaktifkan.` : `❌ Gagal mengaktifkan skill \`${name}\`.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "skill-disable") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menonaktifkan skill.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('name')
      const success = await toggleSkill(guildId, name, false)
      return interaction.reply({ content: success ? `🔴 Skill \`${name}\` dinonaktifkan sementara.` : `❌ Gagal menonaktifkan skill \`${name}\`.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "skill-delete") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menghapus skill.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('name')
      const success = await deleteSkill(guildId, name)
      return interaction.reply({ content: success ? `🗑️ Skill \`${name}\` telah dihapus.` : `❌ Gagal menghapus skill \`${name}\`.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "skill-create") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat membuat skill.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('name')
      const description = interaction.options.getString('description')
      const type = interaction.options.getString('type')
      const content = interaction.options.getString('content')

      let definition = {}
      if (type === 'prompt') {
        definition = { prompt: content }
      } else if (type === 'persona') {
        definition = { persona: content }
      } else if (type === 'code') {
        definition = { code: content }
      } else if (type === 'workflow') {
        try {
          // Content is expected to be a JSON array of steps
          const steps = JSON.parse(content)
          if (!Array.isArray(steps)) throw new Error('Format workflow content harus berupa array []')
          definition = { steps }
        } catch (e) {
          return interaction.reply({ content: `❌ Format konten workflow tidak valid: ${e.message}\nContoh: \`[{"tool":"web_search","params":{"query":"{{input}}"}}]\``, flags: MessageFlags.Ephemeral })
        }
      }

      try {
        const id = await createSkill(guildId, userId, {
          name,
          description,
          type,
          definition,
          scope: 'guild',
          trigger_patterns: [name] // default trigger is the name of the skill
        })
        return interaction.reply({ content: `✅ Skill \`${name}\` (${type}) berhasil dibuat dengan ID: \`${id}\`.`, flags: MessageFlags.Ephemeral })
      } catch (err) {
        return interaction.reply({ content: `❌ Gagal membuat skill: ${err.message}`, flags: MessageFlags.Ephemeral })
      }
    }

    if (commandName === "skill-install") {
      if (!serverAdmin) return interaction.reply({ content: "⛔ Hanya Admin Server yang dapat menginstal skill.", flags: MessageFlags.Ephemeral })
      const url = interaction.options.getString('url')
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      try {
        const skillsFetched = await fetchSkillFromUrl(url)
        const installed = []
        for (const data of skillsFetched) {
          const res = await installSkill(guildId, userId, data, isBotAdmin)
          installed.push(res)
        }
        const text = installed.map(s => `• \`${s.name}\` (${s.type})${s.enabled ? '' : ' ⚠️ (Nonaktif, perlu enable manual)'}`).join('\n')
        return interaction.editReply({ content: `📦 **Berhasil menginstal skill:**\n${text}` })
      } catch (err) {
        return interaction.editReply({ content: `❌ Gagal menginstal skill: ${err.message}` })
      }
    }

    if (commandName === "skill-run") {
      const name = interaction.options.getString('name')
      const inputVal = interaction.options.getString('input') || ''
      await interaction.deferReply()

      const skill = await getSkillByName(guildId, name)
      if (!skill) return interaction.editReply({ content: `❌ Skill \`${name}\` tidak ditemukan.` })
      if (!skill.enabled) return interaction.editReply({ content: `❌ Skill \`${name}\` sedang dinonaktifkan.` })

      try {
        const result = await executeSkill(skill, { input: inputVal }, { userId, guildId })
        await incrementSkillUsage(skill.id)
        
        let replyText = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
        if (replyText.length > 2000) {
          replyText = replyText.slice(0, 1990) + '...'
        }
        return interaction.editReply({ content: replyText })
      } catch (err) {
        return interaction.editReply({ content: `❌ Error saat menjalankan skill: ${err.message}` })
      }
    }

    // --- SLASHMCP HANDLERS (Bot Owner) ---
    if (commandName === "mcp-list") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat melihat daftar MCP.", flags: MessageFlags.Ephemeral })
      const configPath = path.resolve('mcp_servers.json')
      if (!fs.existsSync(configPath)) return interaction.reply({ content: "⚠️ File mcp_servers.json tidak ditemukan.", flags: MessageFlags.Ephemeral })
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const servers = config.servers || []
      const list = servers.map(s => {
        const active = mcpClients.has(s.name)
        return `• **${s.name}** [${s.type}] - ${s.enabled ? '🟢 Enabled' : '🔴 Disabled'} | ${active ? '⚡ Connected' : '💤 Disconnected'}`
      }).join('\n')

      return interaction.reply({ content: `**🔌 Daftar Server MCP:**\n${list || 'Tidak ada server terdaftar.'}`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "mcp-enable") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat mengaktifkan MCP.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('server')

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return interaction.reply({ content: `❌ Server MCP "${name}" tidak ditemukan.`, flags: MessageFlags.Ephemeral })

      server.enabled = true
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      await connectMcpServer(server)
      return interaction.reply({ content: `🟢 Server MCP \`${name}\` diaktifkan dan menghubungkan...`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "mcp-disable") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat menonaktifkan MCP.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('server')

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return interaction.reply({ content: `❌ Server MCP "${name}" tidak ditemukan.`, flags: MessageFlags.Ephemeral })

      server.enabled = false
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
      await unregisterClient(name)
      return interaction.reply({ content: `🔴 Server MCP \`${name}\` dinonaktifkan dan koneksi ditutup.`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "mcp-reconnect") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat me-reconnect MCP.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('server')

      const configPath = path.resolve('mcp_servers.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const server = config.servers.find(s => s.name === name)
      if (!server) return interaction.reply({ content: `❌ Server MCP "${name}" tidak ditemukan.`, flags: MessageFlags.Ephemeral })

      await connectMcpServer(server)
      return interaction.reply({ content: `🔄 Sedang merefresh koneksi ke server MCP \`${name}\`...`, flags: MessageFlags.Ephemeral })
    }

    if (commandName === "mcp-tools") {
      if (!isBotAdmin) return interaction.reply({ content: "⛔ Hanya Bot Owner yang dapat mengakses tools MCP.", flags: MessageFlags.Ephemeral })
      const name = interaction.options.getString('server')
      
      const tools = mcpToolsCache.get(name) || []
      if (tools.length === 0) return interaction.reply({ content: `⚠️ Tidak ada tools terdaftar/aktif di server MCP \`${name}\`.`, flags: MessageFlags.Ephemeral })
      
      const list = tools.map(t => `• \`mcp__${name}__${t.name}\` - ${t.description || 'Tidak ada deskripsi'}`).join('\n')
      return interaction.reply({ content: `**🛠️ Tools pada server MCP \`${name}\`:**\n${list}`, flags: MessageFlags.Ephemeral })
    }

  } catch (error) {
    console.error(`[handleInteraction] Error /${commandName}:`, error)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Terjadi kesalahan saat memproses perintah.", flags: MessageFlags.Ephemeral }).catch(console.error)
    } else {
      await interaction.editReply({ content: "❌ Terjadi kesalahan saat memproses perintah." }).catch(console.error)
    }
  }
}