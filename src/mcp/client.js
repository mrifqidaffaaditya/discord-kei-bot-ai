import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import path from 'path'
import fs from 'fs'

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

    // Pastikan HOME di-set untuk ekspansi path di Python
    if (!mcpEnv.HOME) {
      mcpEnv.HOME = process.env.HOME || '/home/container'
    }

    // Deteksi otomatis versi Python yang ada di sistem dan tambahkan ke PYTHONPATH
    const homeDir = mcpEnv.HOME
    const pythonPaths = []
    try {
      const libPath = path.join(homeDir, '.local/lib')
      if (fs.existsSync(libPath)) {
        const dirs = fs.readdirSync(libPath)
        for (const dir of dirs) {
          if (dir.startsWith('python')) {
            const sitePackages = path.join(libPath, dir, 'site-packages')
            if (fs.existsSync(sitePackages)) {
              pythonPaths.push(sitePackages)
            }
          }
        }
      }
    } catch (err) {
      // Abaikan jika direktori tidak terbaca
    }

    // Fallback path standard
    pythonPaths.push(path.join(homeDir, '.local/lib/python3.12/site-packages'))
    pythonPaths.push(path.join(homeDir, '.local/lib/python3.11/site-packages'))
    pythonPaths.push(path.join(homeDir, '.local/lib/python3.10/site-packages'))

    const newPythonPath = pythonPaths.join(':')
    if (mcpEnv.PYTHONPATH) {
      mcpEnv.PYTHONPATH = `${newPythonPath}:${mcpEnv.PYTHONPATH}`
    } else {
      mcpEnv.PYTHONPATH = newPythonPath
    }

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

    console.log(`[MCP][${serverConfig.name}] Spawning: "${command}" with args: ${JSON.stringify(resolvedArgs)}`)
    console.log(`[MCP][${serverConfig.name}] Environment - PYTHONPATH: "${mcpEnv.PYTHONPATH}"`)
    console.log(`[MCP][${serverConfig.name}] Environment - HOME: "${mcpEnv.HOME}"`)
    console.log(`[MCP][${serverConfig.name}] Environment - PATH: "${mcpEnv.PATH}"`)

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
