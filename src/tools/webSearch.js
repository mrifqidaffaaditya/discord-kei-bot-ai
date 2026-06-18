import axios from 'axios'
import * as cheerio from 'cheerio'
import { CONFIG } from '../config.js'
import { isSafeUrl } from './ssrf.js'

export const definition = {
  name: 'web_search',
  description: 'Mencari informasi di internet dan secara otomatis membaca isi dari beberapa website teratas untuk hasil yang akurat dan detail.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Kata kunci pencarian'
      },
      num_results: {
        type: 'integer',
        description: 'Jumlah hasil pencarian yang diinginkan (default 5)',
        default: 5
      },
      search_type: {
        type: 'string',
        enum: ['web', 'news'],
        description: 'Kategori pencarian: web atau news (khusus provider aikei, default web)',
        default: 'web'
      },
      fetch_content: {
        type: 'boolean',
        description: 'Jika true, otomatis mengunjungi dan membaca konten dari URL teratas untuk informasi lebih lengkap dan akurat (default true)',
        default: true
      },
      max_fetch: {
        type: 'integer',
        description: 'Jumlah URL yang akan di-visit untuk membaca konten (default 3, max 5)',
        default: 3
      }
    },
    required: ['query']
  }
}

/**
 * Ambil konten dari satu URL, returns null jika gagal
 */
async function fetchPageContent(url, maxChars = 6000) {
  try {
    if (!(await isSafeUrl(url))) return null

    const response = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
      },
      maxContentLength: 500 * 1024, // 500KB raw, lalu dipangkas
      responseType: 'text'
    })

    const $ = cheerio.load(response.data)
    const title = $('title').text().trim()

    // Hapus elemen non-konten
    $('script, style, iframe, noscript, svg, header, footer, nav, aside, .ads, .advertisement, .sidebar, [aria-hidden="true"]').remove()

    // Coba ambil bagian konten utama dulu
    let contentText = ''
    const mainSelectors = ['article', 'main', '.content', '.post-content', '.entry-content', '#content', '.article-body', '.post-body']
    for (const sel of mainSelectors) {
      const t = $(sel).text().trim()
      if (t.length > 200) {
        contentText = t
        break
      }
    }

    // Fallback ke body
    if (!contentText) {
      contentText = $('body').text().trim()
    }

    // Bersihkan whitespace berlebih
    contentText = contentText
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, maxChars)

    if (contentText.length < 50) return null

    return { title, content: contentText, url }
  } catch {
    return null
  }
}

export async function run(args) {
  const query = args.query
  const num_results = args.num_results || 5
  const search_type = args.search_type || 'web'
  const fetch_content = args.fetch_content !== false // default true
  const max_fetch = Math.min(args.max_fetch || 3, 5)
  const provider = CONFIG.tools.searchProvider

  let searchResults
  if (provider === 'aikei' && CONFIG.tools.aikeiSearchApiKey) {
    searchResults = await searchAiKei(query, num_results, search_type)
  } else if (provider === 'brave' && CONFIG.tools.braveSearchApiKey) {
    searchResults = await searchBrave(query, num_results)
  } else if (provider === 'serpapi' && CONFIG.tools.serpapiKey) {
    searchResults = await searchSerpApi(query, num_results)
  } else {
    searchResults = await searchDDG(query, num_results)
  }

  // Jika bukan array atau kosong, return langsung
  if (!Array.isArray(searchResults) || searchResults.length === 0) {
    return searchResults
  }

  // Auto-fetch konten dari URL teratas
  if (fetch_content) {
    const urlsToFetch = searchResults.slice(0, max_fetch).map(r => r.url).filter(Boolean)
    
    const fetchPromises = urlsToFetch.map(url => fetchPageContent(url))
    const fetchedContents = await Promise.allSettled(fetchPromises)

    // Gabungkan hasil fetch ke dalam search results
    const enrichedResults = searchResults.map((result, idx) => {
      const fetched = idx < fetchedContents.length && fetchedContents[idx].status === 'fulfilled'
        ? fetchedContents[idx].value
        : null

      return {
        title: result.title,
        url: result.url,
        snippet: result.snippet || '',
        ...(fetched ? { full_content: fetched.content } : {})
      }
    })

    // Statistik fetch
    const successCount = fetchedContents.filter(r => r.status === 'fulfilled' && r.value !== null).length
    console.log(`[web_search] Fetched ${successCount}/${urlsToFetch.length} URLs for query: "${query}"`)

    return {
      query,
      total_results: enrichedResults.length,
      pages_visited: successCount,
      results: enrichedResults
    }
  }

  return {
    query,
    total_results: searchResults.length,
    results: searchResults
  }
}

async function searchDDG(query, numResults) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 10000
    })

    const $ = cheerio.load(response.data)
    const results = []

    $('.result').each((i, elem) => {
      if (results.length >= numResults) return false

      const titleElem = $(elem).find('.result__title')
      const snippetElem = $(elem).find('.result__snippet')
      const linkElem = titleElem.find('a.result__url')

      const title = titleElem.text().trim()
      const link = linkElem.attr('href')
      const snippet = snippetElem.text().trim()

      if (link) {
        let urlStr = link.startsWith('//') ? 'https:' + link : link
        try {
          if (urlStr.includes('duckduckgo.com/l/?uddg=')) {
            const urlObj = new URL(urlStr)
            const uddg = urlObj.searchParams.get('uddg')
            if (uddg) urlStr = uddg
          }
        } catch {}

        results.push({
          title: title || urlStr,
          url: urlStr,
          snippet: snippet || ''
        })
      }
    })

    if (results.length === 0) {
      return { message: 'Tidak ditemukan hasil pencarian untuk: ' + query }
    }

    return results
  } catch (error) {
    console.error('[web_search] DDG error:', error.message)
    throw new Error(`Web search failed: ${error.message}`)
  }
}

async function searchBrave(query, numResults) {
  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: numResults },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': CONFIG.tools.braveSearchApiKey
      },
      timeout: 10000
    })

    const results = response.data.web?.results || []
    return results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description
    }))
  } catch (error) {
    console.error('[web_search] Brave error:', error.message)
    throw new Error(`Brave Search failed: ${error.message}`)
  }
}

async function searchSerpApi(query, numResults) {
  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        q: query,
        engine: 'google',
        api_key: CONFIG.tools.serpapiKey,
        num: numResults
      },
      timeout: 10000
    })

    const results = response.data.organic_results || []
    return results.slice(0, numResults).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet
    }))
  } catch (error) {
    console.error('[web_search] SerpAPI error:', error.message)
    throw new Error(`SerpAPI Search failed: ${error.message}`)
  }
}

async function searchAiKei(query, numResults, searchType) {
  try {
    const response = await axios.post('https://9router.aikeigroup.net/v1/search', {
      model: 'exa',
      query: query,
      search_type: searchType,
      max_results: numResults
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.tools.aikeiSearchApiKey}`
      },
      timeout: 15000
    })

    const results = response.data.results || []
    return results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet || ''
    }))
  } catch (error) {
    console.error('[web_search] AiKei error:', error.response?.data || error.message)
    throw new Error(`AiKei Search failed: ${error.message}`)
  }
}
