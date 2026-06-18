import fs from 'fs'
import path from 'path'
import { CONFIG } from '../config.js'

export const definition = {
  name: 'file_operation',
  description: 'Melakukan operasi file (membaca, menulis, menghapus, melihat isi direktori) di dalam workspace.',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['read', 'write', 'delete', 'list'],
        description: 'Jenis operasi yang ingin dilakukan'
      },
      filePath: {
        type: 'string',
        description: 'Path relatif file/direktori terhadap root workspace'
      },
      content: {
        type: 'string',
        description: 'Isi file (hanya untuk operasi write)'
      }
    },
    required: ['operation', 'filePath']
  }
}

export async function run(args) {
  const op = args.operation
  const relPath = args.filePath
  const content = args.content

  const workspaceRoot = path.resolve(CONFIG.agent.workspaceDir)
  const targetPath = path.resolve(workspaceRoot, relPath)

  // Cegah directory traversal
  if (!targetPath.startsWith(workspaceRoot)) {
    throw new Error('Akses ditolak: Tidak boleh mengakses file di luar workspace.')
  }

  const maxBytes = 5 * 1024 * 1024 // 5MB

  try {
    if (op === 'read') {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`File tidak ditemukan: ${relPath}`)
      }
      const stats = fs.statSync(targetPath)
      if (stats.isDirectory()) {
        throw new Error(`Path ${relPath} adalah direktori. Gunakan list.`)
      }
      if (stats.size > maxBytes) {
        throw new Error('Ukuran file melebihi batas 5MB.')
      }

      const fileContent = fs.readFileSync(targetPath, 'utf-8')
      return {
        success: true,
        content: fileContent
      }
    } else if (op === 'write') {
      if (content === undefined) {
        throw new Error('Operasi write butuh parameter "content".')
      }
      if (Buffer.byteLength(content, 'utf-8') > maxBytes) {
        throw new Error('Ukuran konten melebihi batas 5MB.')
      }

      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(targetPath, content, 'utf-8')
      return {
        success: true,
        message: `Berhasil menulis file ke ${relPath}`
      }
    } else if (op === 'delete') {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`File/direktori tidak ditemukan: ${relPath}`)
      }
      const stats = fs.statSync(targetPath)
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(targetPath)
      }
      return {
        success: true,
        message: `Berhasil menghapus ${relPath}`
      }
    } else if (op === 'list') {
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Direktori tidak ditemukan: ${relPath}`)
      }
      const stats = fs.statSync(targetPath)
      if (!stats.isDirectory()) {
        throw new Error(`Path ${relPath} bukan direktori. Gunakan read.`)
      }

      const files = fs.readdirSync(targetPath)
      const details = files.map(file => {
        const itemPath = path.join(targetPath, file)
        const itemStats = fs.statSync(itemPath)
        return {
          name: file,
          isDirectory: itemStats.isDirectory(),
          size: itemStats.isDirectory() ? null : itemStats.size
        }
      })

      return {
        success: true,
        files: details
      }
    } else {
      throw new Error(`Operasi "${op}" tidak dikenal.`)
    }
  } catch (error) {
    console.error('[file_operation] Error:', error.message)
    throw new Error(`Gagal melakukan operasi file: ${error.message}`)
  }
}
