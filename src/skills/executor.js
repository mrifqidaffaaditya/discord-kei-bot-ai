import { executeBuiltinTool } from '../tools/index.js'
import { executeMcpTool } from '../mcp/index.js'

/**
 * Resolves template strings like "{{input}}" or "{{step1.content}}" based on context
 */
export function resolveTemplate(template, context) {
  if (typeof template !== 'string') return template

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const parts = path.trim().split('.')
    let current = context

    for (const part of parts) {
      // Menangani akses array seperti results[0]
      if (part.includes('[')) {
        const arrayName = part.split('[')[0]
        const bracketMatch = part.match(/\[(\d+)\]/)
        if (bracketMatch) {
          const index = parseInt(bracketMatch[1])
          current = current[arrayName]
          if (current) current = current[index]
        }
      } else {
        current = current[part]
      }

      if (current === undefined || current === null) return ''
    }

    return typeof current === 'object' ? JSON.stringify(current) : String(current)
  })
}

/**
 * Merekursi objek/array dan meresolve template string di dalamnya
 */
function resolveParamsRecursive(params, context) {
  if (typeof params === 'string') {
    return resolveTemplate(params, context)
  }
  if (Array.isArray(params)) {
    return params.map(item => resolveParamsRecursive(item, context))
  }
  if (params !== null && typeof params === 'object') {
    const resolved = {}
    for (const [key, value] of Object.entries(params)) {
      resolved[key] = resolveParamsRecursive(value, context)
    }
    return resolved
  }
  return params
}

/**
 * Eksekusi skill berdasarkan tipe dan definisi
 */
export async function executeSkill(skill, args, discordContext) {
  const { userId, guildId } = discordContext

  if (skill.type === 'workflow') {
    return await executeWorkflowSkill(skill, args, discordContext)
  } else if (skill.type === 'code') {
    return await executeCodeSkill(skill, args, discordContext)
  } else if (skill.type === 'mcp_wrapper') {
    return await executeMcpWrapperSkill(skill, args, discordContext)
  } else {
    throw new Error(`Tipe skill "${skill.type}" tidak didukung oleh executor.`)
  }
}

async function executeWorkflowSkill(skill, args, discordContext) {
  const steps = skill.definition.steps || []
  const context = { input: args.input || '', ...args }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const stepName = `step${i + 1}`

    // Resolve parameter step menggunakan konteks saat ini
    const resolvedParams = resolveParamsRecursive(step.params, context)

    let result
    if (step.tool.startsWith('mcp__')) {
      // Panggilan MCP tool dalam workflow
      const parts = step.tool.split('__')
      const mcpServer = parts[1]
      const mcpTool = parts[2]
      result = await executeMcpTool(mcpServer, mcpTool, resolvedParams)
    } else {
      // Panggilan Built-in tool
      result = await executeBuiltinTool(step.tool, resolvedParams, discordContext)
    }

    // Masukkan hasil langkah ke konteks untuk langkah berikutnya
    context[stepName] = result
  }

  // Generate output berdasarkan template jika ada
  if (skill.definition.output_template) {
    return resolveTemplate(skill.definition.output_template, context)
  }

  // Jika tidak ada output_template, kembalikan hasil dari langkah terakhir
  const lastStepName = `step${steps.length}`
  return context[lastStepName] || 'Workflow selesai tanpa output.'
}

async function executeCodeSkill(skill, args, discordContext) {
  let NodeVM
  try {
    const vm2 = await import('vm2')
    NodeVM = vm2.NodeVM
  } catch (err) {
    throw new Error('Modul vm2 tidak tersedia untuk menjalankan skill tipe code.')
  }

  const logs = []
  const vm = new NodeVM({
    timeout: 10000,
    console: 'redirect',
    require: {
      builtin: [],
      external: false
    },
    sandbox: {
      input: args.input || '',
      args: args
    }
  })

  vm.on('console.log', (...msg) => logs.push(msg.join(' ')))
  vm.on('console.error', (...msg) => logs.push(msg.join(' ')))

  try {
    const script = skill.definition.code
    const result = vm.run(script)
    let output = logs.join('\n')
    if (result !== undefined) {
      output += (output ? '\n' : '') + `Return: ${typeof result === 'object' ? JSON.stringify(result) : result}`
    }
    return output || 'Skill code dijalankan tanpa output console.'
  } catch (error) {
    throw new Error(`Gagal mengeksekusi skill code: ${error.message}`)
  }
}

async function executeMcpWrapperSkill(skill, args, discordContext) {
  const mcpServer = skill.definition.mcp_server
  const mcpTool = skill.definition.mcp_tool
  const presetParams = skill.definition.preset_params || {}

  // Gabungkan parameter preset dengan parameter input dari user
  const mergedParams = { ...presetParams, ...args }

  return await executeMcpTool(mcpServer, mcpTool, mergedParams)
}
