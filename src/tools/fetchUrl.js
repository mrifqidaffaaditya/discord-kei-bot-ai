import axios from 'axios'
import * as cheerio from 'cheerio'
import { isSafeUrl } from './ssrf.js'

export const definition = {
  name: 'fetch_url',
  description: 'Membuka dan membaca konten halaman web secara langsung, termasuk mengekstrak semua link navigasi, tombol, dan href. GUNAKAN TOOL INI jika user memberikan URL eksplisit (https://, http://, atau domain). JANGAN gunakan web_search untuk URL yang sudah diketahui.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL halaman web yang ingin diambil (harus lengkap: https://...)'
      },
      selector: {
        type: 'string',
        description: 'CSS Selector opsional untuk mengambil bagian tertentu (misal: "article", ".main-content")'
      },
      extract_links: {
        type: 'boolean',
        description: 'Jika true (default), ekstrak semua link navigasi, button, dan href dari halaman beserta tujuannya.',
        default: true
      }
    },
    required: ['url']
  }
}

/**
 * Resolve URL relatif menjadi URL absolut
 */
function resolveUrl(base, href) {
  if (!href) return null
  href = href.trim()
  if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null
  }
  try {
    return new URL(href, base).href
  } catch {
    return null
  }
}

export async function run(args) {
  const url = args.url
  const selector = args.selector
  const extractLinks = args.extract_links !== false // default true

  // Proteksi SSRF
  if (!(await isSafeUrl(url))) {
    throw new Error('Akses diblokir: URL merujuk ke IP private, localhost, atau tidak aman.')
  }

  try {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
      },
      maxContentLength: 500 * 1024, // 500KB raw
      responseType: 'text'
    })

    const status = response.status
    const html = typeof response.data === 'string' ? response.data : String(response.data)
    const $ = cheerio.load(html)
    const title = $('title').text().trim()

    // === EKSTRAK LINKS & NAVIGASI ===
    const links = []
    const seenHrefs = new Set()

    if (extractLinks) {
      // 1. Link di elemen navigasi (<nav>, header, menu)
      $('nav a, header a, [role="navigation"] a, .nav a, .navbar a, .menu a, .sidebar a').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ')
        const href = resolveUrl(url, $(el).attr('href'))
        if (href && !seenHrefs.has(href) && text) {
          seenHrefs.add(href)
          links.push({ type: 'nav-link', text, href })
        }
      })

      // 2. Tombol dengan href / tombol yang punya link
      $('a[role="button"], button, [class*="btn"], [class*="button"]').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ')
        const tag = el.name
        // Tombol <a> (link button)
        if (tag === 'a') {
          const href = resolveUrl(url, $(el).attr('href'))
          if (href && !seenHrefs.has(href) && text) {
            seenHrefs.add(href)
            links.push({ type: 'button-link', text, href })
          }
        } else {
          // Tombol biasa: cek data-href, data-url, onclick
          const dataHref = $(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-link')
          const resolved = resolveUrl(url, dataHref)
          if (resolved && !seenHrefs.has(resolved) && text) {
            seenHrefs.add(resolved)
            links.push({ type: 'button', text, href: resolved })
          } else if (text) {
            links.push({ type: 'button', text, href: null })
          }
        }
      })

      // 3. Semua link <a> lainnya (body content, footer, dll)
      $('a[href]').each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ')
        const href = resolveUrl(url, $(el).attr('href'))
        if (href && !seenHrefs.has(href) && text && text.length < 100) {
          seenHrefs.add(href)
          // Tentukan type berdasarkan posisi
          let type = 'link'
          const parents = $(el).parents()
          let inFooter = false, inHeader = false
          parents.each((_, p) => {
            const tag = p.name
            if (tag === 'footer' || $(p).hasClass('footer')) inFooter = true
            if (tag === 'header' || $(p).hasClass('header')) inHeader = true
          })
          if (inFooter) type = 'footer-link'
          else if (inHeader) type = 'header-link'
          links.push({ type, text, href })
        }
      })
    }

    // === EKSTRAK KONTEN TEKS ===
    let contentText = ''
    // Clone $ untuk ekstraksi teks (tidak hapus nav dulu agar link sudah terkumpul)
    const $text = cheerio.load(html)
    if (selector) {
      contentText = $text(selector).text().trim()
    } else {
      $text('script, style, iframe, noscript, svg').remove()
      // Coba ambil bagian utama dulu
      const mainSelectors = ['main', 'article', '.content', '.main-content', '.post-content', '#content']
      for (const sel of mainSelectors) {
        const t = $text(sel).text().trim()
        if (t.length > 200) {
          contentText = t
          break
        }
      }
      if (!contentText) {
        $text('header, footer, nav').remove()
        contentText = $text('body').text().trim()
      }
    }

    contentText = contentText
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 10000)

    const result = {
      status,
      url,
      title,
      content: contentText || 'Halaman kosong atau tidak ada teks yang dapat diekstrak.'
    }

    if (extractLinks && links.length > 0) {
      // Deduplication final & limit
      result.links = links.slice(0, 100)
      result.links_summary = `Ditemukan ${links.length} link/tombol. Nav: ${links.filter(l => l.type === 'nav-link').length}, Button: ${links.filter(l => l.type.includes('button')).length}, Footer: ${links.filter(l => l.type === 'footer-link').length}, Lainnya: ${links.filter(l => l.type === 'link' || l.type === 'header-link').length}`
    }

    return result
  } catch (error) {
    if (error.message.includes('maxContentLength') || error.code === 'ECONNABORTED') {
      throw new Error('Request dibatalkan karena melebihi batas: Max 500KB / Timeout 20s.')
    }
    throw new Error(`Gagal mengambil data dari URL: ${error.message}`)
  }
}
