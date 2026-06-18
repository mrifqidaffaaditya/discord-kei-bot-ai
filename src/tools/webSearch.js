import axios from 'axios'
import * as cheerio from 'cheerio'
import { CONFIG } from '../config.js'

export const definition = {
  name: 'web_search',
  description: 'Mencari informasi di internet dengan kata kunci tertentu.',
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
      }
    },
    required: ['query']
  }
}

export async function run(args) {
  const query = args.query
  const num_results = args.num_results || 5
  const search_type = args.search_type || 'web'
  const provider = CONFIG.tools.searchProvider

  if (provider === 'aikei' && CONFIG.tools.aikeiSearchApiKey) {
    return await searchAiKei(query, num_results, search_type)
  } else if (provider === 'brave' && CONFIG.tools.braveSearchApiKey) {
    return await searchBrave(query, num_results)
  } else if (provider === 'serpapi' && CONFIG.tools.serpapiKey) {
    return await searchSerpApi(query, num_results)
  } else {
    return await searchDDG(query, num_results)
  }
}

async function searchDDG(query, numResults) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
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

    // If scraping fails to find results, return simple message
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
