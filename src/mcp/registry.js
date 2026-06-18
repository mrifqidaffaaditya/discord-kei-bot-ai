export const mcpClients = new Map()
export const mcpToolsCache = new Map() // serverName -> Array of tools

/**
 * Registrasi client MCP aktif ke registry
 */
export function registerClient(name, client) {
  mcpClients.set(name, client)
}

/**
 * Hapus client MCP dari registry dan tutup koneksinya
 */
export async function unregisterClient(name) {
  const client = mcpClients.get(name)
  if (client) {
    try {
      await client.close()
    } catch {}
  }
  mcpClients.delete(name)
  mcpToolsCache.delete(name)
}

/**
 * Fetch dan perbarui cache tool untuk server tertentu
 */
export async function refreshToolsCache(name) {
  const client = mcpClients.get(name)
  if (!client) return []

  try {
    const response = await client.listTools()
    const tools = response.tools || []
    mcpToolsCache.set(name, tools)
    return tools
  } catch (error) {
    console.error(`[MCP Registry] Gagal mengambil tools untuk server "${name}":`, error.message)
    return []
  }
}

/**
 * Mendapatkan semua schema tool MCP terdaftar dalam format tool-calling OpenAI
 */
export function getAllMcpTools() {
  const list = []
  for (const [serverName, tools] of mcpToolsCache.entries()) {
    for (const tool of tools) {
      list.push({
        type: 'function',
        function: {
          name: `mcp__${serverName}__${tool.name}`,
          description: tool.description || `MCP Tool: ${tool.name} dari server ${serverName}`,
          parameters: tool.inputSchema || { type: 'object', properties: {} }
        }
      })
    }
  }
  return list
}
