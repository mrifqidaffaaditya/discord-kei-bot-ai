import OpenAI from 'openai'
import { CONFIG } from '../config.js'
import fs from 'fs'
import path from 'path'

const clientAi = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

/**
 * Menganalisis string input instalasi MCP dan menyusun konfigurasi JSON
 */
export async function parseMcpInstallation(inputString) {
  try {
    const prompt = `Analisis input berikut untuk membuat konfigurasi model context protocol (MCP) server stdio/sse.
Input: "${inputString}"

Berikan output JSON murni (tanpa format markdown atau \`\`\`json) dengan format:
{
  "name": "nama_server_unik_pendek_huruf_kecil",
  "type": "stdio", 
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-name", "argumen_tambahan_jika_ada"],
  "enabled": true,
  "description": "Deskripsi kegunaan MCP server ini dalam Bahasa Indonesia"
}

Jika input adalah URL github modelcontextprotocol/servers, tebak package name npm-nya (biasanya @modelcontextprotocol/server-[nama-direktori]).
Jika berupa sse, ubah type ke "sse" dan sesuaikan struktur url.`

    const res = await clientAi.chat.completions.create({
      model: CONFIG.ai.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2
    })

    let jsonStr = res.choices[0].message.content.trim()
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7)
    if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3)
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3)

    return JSON.parse(jsonStr.trim())
  } catch (error) {
    console.error('[mcp-installer] Gagal menganalisis input:', error.message)
    throw new Error(`Gagal memparsing input instalasi MCP: ${error.message}`)
  }
}

/**
 * Menyimpan konfigurasi server baru ke mcp_servers.json
 */
export async function addMcpServerConfig(serverConfig) {
  const filePath = path.resolve('mcp_servers.json')
  let data = { servers: [] }

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      data = JSON.parse(content)
    } catch (e) {
      console.warn('[mcp-installer] Gagal membaca mcp_servers.json, membuat ulang...', e.message)
    }
  }

  if (!data.servers) data.servers = []

  // Ganti jika sudah ada server dengan nama yang sama
  data.servers = data.servers.filter(s => s.name !== serverConfig.name)
  data.servers.push(serverConfig)

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return true
}
