import axios from 'axios'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import { CONFIG } from '../config.js'
import { isSafeUrl } from './ssrf.js'

export const definition = {
  name: 'download_file',
  description: 'Mengunduh file dari internet dan mengirimkannya ke Discord.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL file yang akan diunduh'
      },
      filename: {
        type: 'string',
        description: 'Nama file penyimpanan opsional'
      }
    },
    required: ['url']
  }
}

export async function run(args) {
  const url = args.url
  let customFilename = args.filename

  // Cek SSRF
  if (!(await isSafeUrl(url))) {
    throw new Error('Akses diblokir: URL merujuk ke private IP atau localhost.')
  }

  try {
    // Buat direktori temp jika belum ada
    if (!fs.existsSync(CONFIG.agent.tmpDir)) {
      fs.mkdirSync(CONFIG.agent.tmpDir, { recursive: true })
    }

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    })

    const contentLength = response.headers['content-length']
    const maxBytes = 25 * 1024 * 1024 // 25MB limit

    if (contentLength && parseInt(contentLength) > maxBytes) {
      throw new Error('Ukuran file melebihi batas 25MB.')
    }

    // Resolusi nama file
    let resolvedFilename = 'file_downloaded'
    const disposition = response.headers['content-disposition']
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/)
      if (match && match[1]) {
        resolvedFilename = match[1]
      }
    } else {
      const urlPath = new URL(url).pathname
      const baseName = path.basename(urlPath)
      if (baseName) {
        resolvedFilename = baseName
      }
    }

    if (customFilename) {
      resolvedFilename = path.basename(customFilename)
    }

    // Tambah ekstensi dari MIME jika belum ada
    if (!path.extname(resolvedFilename)) {
      const contentType = response.headers['content-type']
      const ext = mime.extension(contentType)
      if (ext) resolvedFilename += `.${ext}`
    }

    const filePath = path.join(CONFIG.agent.tmpDir, resolvedFilename)
    const writer = fs.createWriteStream(filePath)

    let size = 0
    let isExceeded = false

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          isExceeded = true
          response.data.destroy() // Stop download
        }
      })

      response.data.pipe(writer)

      writer.on('finish', () => {
        if (isExceeded) {
          fs.unlink(filePath, () => {})
          reject(new Error('File melebihi batas maksimal 25MB saat diunduh.'))
        } else {
          resolve({
            success: true,
            filepath: filePath,
            filename: resolvedFilename,
            size: size,
            isAttachment: true,
            message: `Berhasil mengunduh ${resolvedFilename} (${(size / 1024 / 1024).toFixed(2)} MB).`
          })
        }
      })

      writer.on('error', (err) => {
        fs.unlink(filePath, () => {})
        reject(err)
      })
    })

  } catch (error) {
    console.error('[download_file] Error:', error.message)
    throw new Error(`Gagal mengunduh file: ${error.message}`)
  }
}
