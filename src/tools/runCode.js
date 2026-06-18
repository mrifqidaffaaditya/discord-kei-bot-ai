import { spawn } from 'child_process'
import { CONFIG } from '../config.js'

export const definition = {
  name: 'run_code',
  description: 'Menjalankan kode pemrograman (JavaScript atau Python) secara terisolasi (Maks 10 detik).',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['javascript', 'js', 'python', 'py'],
        description: 'Bahasa pemrograman yang digunakan'
      },
      code: {
        type: 'string',
        description: 'Kode pemrograman yang akan dieksekusi'
      }
    },
    required: ['language', 'code']
  }
}

export async function run(args) {
  const lang = args.language.toLowerCase()
  const code = args.code

  if (lang === 'javascript' || lang === 'js') {
    return await runJS(code)
  } else if (lang === 'python' || lang === 'py') {
    return await runPython(code)
  } else {
    throw new Error(`Bahasa "${args.language}" tidak didukung. Gunakan js atau python.`)
  }
}

async function runJS(code) {
  let NodeVM
  try {
    const vm2 = await import('vm2')
    NodeVM = vm2.NodeVM
  } catch (err) {
    throw new Error('Modul vm2 tidak tersedia di bot.')
  }

  const logs = []
  const vm = new NodeVM({
    timeout: 10000,
    console: 'redirect',
    require: {
      builtin: [], // larang native module seperti fs, child_process, dll
      external: false
    },
    sandbox: {}
  })

  // Tangkap console output
  vm.on('console.log', (...args) => logs.push(args.join(' ')))
  vm.on('console.info', (...args) => logs.push(args.join(' ')))
  vm.on('console.warn', (...args) => logs.push(args.join(' ')))
  vm.on('console.error', (...args) => logs.push(args.join(' ')))

  try {
    const result = vm.run(code)
    let output = logs.join('\n')
    if (result !== undefined) {
      output += (output ? '\n' : '') + `Return value: ${typeof result === 'object' ? JSON.stringify(result) : result}`
    }
    return {
      stdout: output.slice(0, 5000),
      stderr: '',
      exitCode: 0
    }
  } catch (error) {
    return {
      stdout: logs.join('\n').slice(0, 2000),
      stderr: error.message,
      exitCode: 1
    }
  }
}

async function runPython(code) {
  return new Promise((resolve) => {
    // Spawn python3 dengan isolasi: -E (ignore env vars), -I (isolated mode)
    const proc = spawn('python3', ['-E', '-I', '-c', code], {
      env: {}, // Hilangkan environment variables
      timeout: 10000
    })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, 10000)

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        stdout: stdout.slice(0, 5000),
        stderr: stderr.slice(0, 5000),
        exitCode: code ?? -1
      })
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({
        stdout: '',
        stderr: `Process error: ${err.message}`,
        exitCode: -1
      })
    })
  })
}
