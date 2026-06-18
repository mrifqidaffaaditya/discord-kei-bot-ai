import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config.js'
import { createMcpClient } from './client.js'
import { registerClient, unregisterClient, refreshToolsCache, getAllMcpTools, mcpClients } from './registry.js'

export { getAllMcpTools } from './registry.js'

/**
 * Inisialisasi koneksi ke semua MCP server yang aktif
 */
export async function initMcp() {
  if (!CONFIG.mcp.enabled) {
    console.log('[MCP] Integrasi MCP dinonaktifkan secara global.')
    return
  }

  const configPath = path.resolve('mcp_servers.json')
  if (!fs.existsSync(configPath)) {
    console.log('[MCP] File konfigurasi mcp_servers.json tidak ditemukan. Melewati.')
    return
  }

  // Pastikan folder workspace dan tmp dari CONFIG sudah terbuat
  const wsPath = path.resolve(CONFIG.agent.workspaceDir)
  if (!fs.existsSync(wsPath)) {
    fs.mkdirSync(wsPath, { recursive: true })
  }
  const tmpPath = path.resolve(CONFIG.agent.tmpDir)
  if (!fs.existsSync(tmpPath)) {
    fs.mkdirSync(tmpPath, { recursive: true })
  }

  let configData
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    configData = JSON.parse(content)
  } catch (error) {
    console.error('[MCP] Gagal membaca mcp_servers.json:', error.message)
    return
  }

  const servers = configData.servers || []
  for (const server of servers) {
    if (server.enabled) {
      await connectMcpServer(server)
    }
  }

  // Mulai monitor koneksi berkala
  startMcpReconnectMonitor()
}

/**
 * Menghubungkan client ke server MCP tunggal
 */
export async function connectMcpServer(server) {
  console.log(`[MCP] Menghubungkan ke server "${server.name}" (${server.type})...`)
  try {
    // Jika koneksi lama ada, tutup dulu
    if (mcpClients.has(server.name)) {
      await unregisterClient(server.name)
    }

    const client = await createMcpClient(server)
    registerClient(server.name, client)
    const tools = await refreshToolsCache(server.name)
    console.log(`[MCP] Berhasil terhubung ke "${server.name}". Menemukan ${tools.length} tool.`)
  } catch (error) {
    console.error(`[MCP][${server.name}][ERROR] Gagal menyambungkan: ${error.message}`)
  }
}

/**
 * Eksekusi tool dari server MCP eksternal
 */
export async function executeMcpTool(serverName, toolName, args) {
  const client = mcpClients.get(serverName)
  if (!client) {
    throw new Error(`Server MCP "${serverName}" tidak aktif atau tidak terhubung.`)
  }

  try {
    const response = await client.callTool(
      {
        name: toolName,
        arguments: args
      },
      undefined,
      { timeout: CONFIG.mcp.toolTimeoutMs }
    )
    return response
  } catch (error) {
    console.error(`[MCP][${serverName}][ERROR] Tool "${toolName}" gagal:`, error.message)
    throw new Error(`Gagal memanggil MCP tool "${toolName}": ${error.message}`)
  }
}

/**
 * Menjalankan background monitoring untuk menghubungkan kembali server MCP yang putus
 */
function startMcpReconnectMonitor() {
  setInterval(async () => {
    const configPath = path.resolve('mcp_servers.json')
    if (!fs.existsSync(configPath)) return

    try {
      const content = fs.readFileSync(configPath, 'utf-8')
      const configData = JSON.parse(content)
      const servers = configData.servers || []

      for (const server of servers) {
        // Hubungkan jika server di-enable tapi client belum terhubung/aktif
        if (server.enabled && !mcpClients.has(server.name)) {
          console.log(`[MCP Monitor] Mencoba menyambungkan kembali ke server "${server.name}"...`)
          await connectMcpServer(server)
        }
      }
    } catch (error) {
      // Diamkan error monitoring berkala
    }
  }, CONFIG.mcp.reconnectIntervalMs)
}
