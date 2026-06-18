import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const commands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tampilkan daftar perintah dan cara menggunakan bot'),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Izinkan bot AI merespons di channel ini (Khusus Admin)'),
  new SlashCommandBuilder()
    .setName('remove-channel')
    .setDescription('Hapus izin bot AI di channel ini (Khusus Admin)'),
  new SlashCommandBuilder()
    .setName('clear-memory')
    .setDescription('Hapus memory percakapan kamu dengan bot'),
  new SlashCommandBuilder()
    .setName('clear-history')
    .setDescription('Hapus riwayat obrolan kamu dengan bot (Khusus Admin)'),
  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Toggle debug mode (menampilkan latency dan token usage) (Bot Owner)'),
  new SlashCommandBuilder()
    .setName('set-personality')
    .setDescription('Ubah instruksi / sifat bot khusus untuk server ini (Khusus Admin)')
    .addStringOption(option => 
      option.setName('personality')
        .setDescription('Ketikkan instruksi baru')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('toggle-clear')
    .setDescription('Izinkan/larang user biasa menghapus memory mereka (Khusus Admin)'),
  new SlashCommandBuilder()
    .setName('purge-server')
    .setDescription('Hapus SEMUA data history & memory server ini (Khusus Admin)'),

  // --- TOOLS MANAGEMENT ---
  new SlashCommandBuilder()
    .setName('tool-list')
    .setDescription('Lihat daftar tool built-in yang tersedia di server ini'),
  new SlashCommandBuilder()
    .setName('tool-enable')
    .setDescription('Aktifkan tool built-in tertentu untuk server ini (Khusus Admin)')
    .addStringOption(option => 
      option.setName('tool')
        .setDescription('Nama tool (contoh: web_search)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('tool-disable')
    .setDescription('Nonaktifkan tool built-in tertentu untuk server ini (Khusus Admin)')
    .addStringOption(option => 
      option.setName('tool')
        .setDescription('Nama tool (contoh: navigate_web)')
        .setRequired(true)
    ),

  // --- SKILLS SYSTEM ---
  new SlashCommandBuilder()
    .setName('skill-list')
    .setDescription('Tampilkan semua skill kustom yang terdaftar di server ini'),
  new SlashCommandBuilder()
    .setName('skill-info')
    .setDescription('Tampilkan rincian informasi dan trigger pola sebuah skill')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama skill kustom')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skill-enable')
    .setDescription('Aktifkan skill kustom yang dinonaktifkan (Khusus Admin)')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama skill kustom')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skill-disable')
    .setDescription('Nonaktifkan skill kustom sementara (Khusus Admin)')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama skill kustom')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skill-delete')
    .setDescription('Hapus skill kustom dari server ini (Khusus Admin)')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama skill kustom')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skill-run')
    .setDescription('Jalankan skill kustom secara instan/eksplisit')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama skill kustom')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('input')
        .setDescription('Input opsional untuk dialirkan ke parameter skill')
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('skill-install')
    .setDescription('Instal skill kustom baru dari link raw JSON (Khusus Admin)')
    .addStringOption(option => 
      option.setName('url')
        .setDescription('URL raw file JSON skill (GitHub, Gist, pastebin, dll)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('skill-create')
    .setDescription('Buat skill baru secara manual di server (Khusus Admin)')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Nama unik skill (snake_case, contoh: cek_tokopedia)')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('description')
        .setDescription('Deskripsi singkat kegunaan skill')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('type')
        .setDescription('Tipe skill')
        .setRequired(true)
        .addChoices(
          { name: 'Prompt-based', value: 'prompt' },
          { name: 'Workflow multi-step', value: 'workflow' },
          { name: 'Custom Code JS Sandbox', value: 'code' },
          { name: 'Persona Override', value: 'persona' }
        )
    )
    .addStringOption(option => 
      option.setName('content')
        .setDescription('Konten / kode / instruksi prompt / JSON steps workflow')
        .setRequired(true)
    ),

  // --- MCP SERVERS (Bot Owner) ---
  new SlashCommandBuilder()
    .setName('mcp-list')
    .setDescription('Tampilkan daftar server MCP terdaftar dan status koneksinya (Bot Owner)'),
  new SlashCommandBuilder()
    .setName('mcp-tools')
    .setDescription('Tampilkan daftar tools yang disediakan server MCP tertentu (Bot Owner)')
    .addStringOption(option => 
      option.setName('server')
        .setDescription('Nama server MCP')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('mcp-enable')
    .setDescription('Aktifkan server MCP terdaftar (Bot Owner)')
    .addStringOption(option => 
      option.setName('server')
        .setDescription('Nama server MCP')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('mcp-disable')
    .setDescription('Nonaktifkan server MCP terdaftar (Bot Owner)')
    .addStringOption(option => 
      option.setName('server')
        .setDescription('Nama server MCP')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('mcp-reconnect')
    .setDescription('Koneksi ulang server MCP terdaftar (Bot Owner)')
    .addStringOption(option => 
      option.setName('server')
        .setDescription('Nama server MCP')
        .setRequired(true)
    )
].map(command => command.toJSON())

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

;(async () => {
  // Hanya jalankan pendaftaran jika dipanggil sebagai script utama
  // dan token terisi di file env
  if (!process.env.DISCORD_TOKEN) {
    console.warn('[Register-Commands] DISCORD_TOKEN kosong. Melewati pendaftaran otomatis.')
    return
  }

  try {
    console.log('Started refreshing application (/) commands.')

    const bot = await rest.get(Routes.user('@me'))
    const clientId = bot.id

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    )

    console.log('Successfully reloaded application (/) commands.')
  } catch (error) {
    console.error(error)
  }
})()

// Ekspor command list agar bisa digunakan langsung oleh client ready handler di index.js
export { commands }
