import axios from 'axios'
import * as cheerio from 'cheerio'
import { isSafeUrl } from './ssrf.js'

export const definition = {
  name: 'fetch_url',
  description: 'Mengambil konten teks dari sebuah halaman web.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL halaman web yang ingin diambil'
      },
      selector: {
        type: 'string',
        description: 'CSS Selector opsional untuk mengambil bagian tertentu (misal: "article", ".main-content")'
      }
    },
    required: ['url']
  }
}

export async function run(args) {
  const url = args.url
  const selector = args.selector

  // Proteksi SSRF
  if (!(await isSafeUrl(url))) {
    throw new Error('Akses diblokir: URL merujuk ke IP private, localhost, atau tidak aman.')
  }

  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      maxContentLength: 50 * 1024, // Batasi download max 50KB
      responseType: 'text'
    })

    const status = response.status
    const html = response.data

    if (html.length > 50 * 1024) {
      throw new Error('Konten halaman melebihi batas maksimal 50KB.')
    }

    const $ = cheerio.load(html)
    const title = $('title').text().trim()
    
    let contentText = ''
    if (selector) {
      contentText = $(selector).text().trim()
    } else {
      // Hapus elemen yang tidak perlu dibaca teksnya
      $('script, style, iframe, noscript, svg, header, footer, nav').remove()
      contentText = $('body').text().trim()
    }

    // Bersihkan spasi berlebih
    contentText = contentText.replace(/\s+/g, ' ').slice(0, 8000)

    return {
      status,
      title,
      content: contentText || 'Halaman kosong atau tidak ada teks yang dapat diekstrak.'
    }
  } catch (error) {
    if (error.message.includes('maxContentLength') || error.code === 'ECONNABORTED') {
      throw new Error('Request dibatalkan karena melebihi batas: Max 50KB / Timeout 15s.')
    }
    throw new Error(`Gagal mengambil data dari URL: ${error.message}`)
  }
}
