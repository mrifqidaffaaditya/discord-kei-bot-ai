import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import path from 'path'

/**
 * Membuat dan menghubungkan client MCP baru
 */
export async function createMcpClient(serverConfig) {
  const client = new Client(
    {
      name: 'discord-kei-bot-client',
      version: '2.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  )

  let transport

  if (serverConfig.type === 'stdio') {
    // Resolve environment variable placeholder di argumen
    const resolvedArgs = (serverConfig.args || []).map(arg => {
      let resolved = arg.replace(/\${([^}]+)}/g, (match, varName) => process.env[varName] || '')
      if (resolved.startsWith('./') || resolved === '.' || resolved.startsWith('../')) {
        resolved = path.resolve(resolved)
      }
      return resolved
    })

    // Gabung environment variables
    const mcpEnv = { ...process.env }
    if (serverConfig.env) {
      for (const [key, val] of Object.entries(serverConfig.env)) {
        mcpEnv[key] = typeof val === 'string' ? val.replace(/\${([^}]+)}/g, (match, varName) => process.env[varName] || '') : String(val)
      }
    }

    let command = serverConfig.command
    if (command.startsWith('~/')) {
      const home = process.env.HOME || '/home/container'
      command = command.replace('~', home)
    }

    transport = new StdioClientTransport({
      command,
      args: resolvedArgs,
      env: mcpEnv
    })
  } else if (serverConfig.type === 'sse') {
    const headers = {}
    if (serverConfig.headers) {
      for (const [key, val] of Object.entries(serverConfig.headers)) {
        headers[key] = typeof val === 'string' ? val.replace(/\${([^}]+)}/g, (match, varName) => process.env[varName] || '') : String(val)
      }
    }

    transport = new SSEClientTransport(new URL(serverConfig.url), {
      eventSourceInitDict: {
        headers
      }
    })
  } else {
    throw new Error(`Tipe koneksi MCP "${serverConfig.type}" tidak didukung.`)
  }

  await client.connect(transport)
  return client
}
