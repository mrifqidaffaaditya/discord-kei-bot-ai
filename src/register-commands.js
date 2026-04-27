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
    .setDescription('Hapus riwayat obrolan kamu dengan bot'),
  new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Toggle debug mode (menampilkan latency dan token usage)'),
  new SlashCommandBuilder()
    .setName('set-personality')
    .setDescription('Ubah instruksi / sifat bot khusus untuk server ini (Khusus Admin)')
    .addStringOption(option => 
      option.setName('personality')
        .setDescription('Ketikkan instruksi baru (misal: "Kamu adalah asisten galak")')
        .setRequired(true)
    )
].map(command => command.toJSON())

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)

;(async () => {
  try {
    console.log('Started refreshing application (/) commands.')

    // Menggunakan ID dari token jika memungkinkan, tapi lebih baik kita ambil via API / pakai environment variable
    // Kita panggil API untuk mendapatkan client id
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
