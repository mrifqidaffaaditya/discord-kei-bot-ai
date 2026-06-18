import * as webSearch from './webSearch.js'
import * as fetchUrl from './fetchUrl.js'
import * as navigateWeb from './navigateWeb.js'
import * as downloadFile from './downloadFile.js'
import * as runCode from './runCode.js'
import * as fileOperation from './fileOperation.js'
import * as httpRequest from './httpRequest.js'
import * as createCustomTool from './createCustomTool.js'
import { checkToolEnabled, checkRateLimit, recordToolUsage } from './rateLimit.js'

export const BUILTIN_TOOLS = {
  web_search: webSearch,
  fetch_url: fetchUrl,
  navigate_web: navigateWeb,
  download_file: downloadFile,
  run_code: runCode,
  file_operation: fileOperation,
  http_request: httpRequest,
  create_custom_tool: createCustomTool
}

/**
 * Mendapatkan semua skema definisi tool built-in untuk OpenAI tool-calling
 */
export async function getBuiltinToolDefinitions(guildId) {
  const list = []
  for (const [name, module] of Object.entries(BUILTIN_TOOLS)) {
    // Cek apakah di-enable untuk server ini
    const isEnabled = await checkToolEnabled(guildId, name)
    if (isEnabled) {
      list.push({
        type: 'function',
        function: module.definition
      })
    }
  }
  return list
}

/**
 * Eksekusi tool built-in berdasarkan nama
 */
export async function executeBuiltinTool(toolName, args, context) {
  const { userId, guildId } = context

  // Cek izin aktif
  const isEnabled = await checkToolEnabled(guildId, toolName)
  if (!isEnabled) {
    throw new Error(`Tool "${toolName}" dinonaktifkan di server ini.`)
  }

  // Cek rate limit
  const isAllowed = await checkRateLimit(userId, guildId, toolName)
  if (!isAllowed) {
    throw new Error(`Batas penggunaan (rate limit) untuk tool "${toolName}" telah habis.`)
  }

  // Catat penggunaan
  await recordToolUsage(userId, guildId, toolName)

  const toolModule = BUILTIN_TOOLS[toolName]
  if (!toolModule) {
    throw new Error(`Tool built-in "${toolName}" tidak ditemukan.`)
  }

  return await toolModule.run(args, context)
}
