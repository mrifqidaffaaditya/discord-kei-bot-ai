import axios from 'axios'
import { isSafeUrl } from './ssrf.js'

export const definition = {
  name: 'http_request',
  description: 'Melakukan HTTP request ke API eksternal.',
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        description: 'HTTP Method (GET, POST, PUT, DELETE, PATCH)',
        default: 'GET'
      },
      url: {
        type: 'string',
        description: 'Target URL'
      },
      headers: {
        type: 'object',
        description: 'JSON object berisi HTTP headers'
      },
      body: {
        type: 'string',
        description: 'Request body (berupa string, opsional)'
      }
    },
    required: ['url']
  }
}

export async function run(args) {
  const method = (args.method || 'GET').toUpperCase()
  const url = args.url
  const headers = args.headers || {}
  const body = args.body

  // Cek SSRF
  if (!(await isSafeUrl(url))) {
    throw new Error('Akses diblokir: URL merujuk ke private IP atau localhost.')
  }

  let requestData = body
  // Auto parse ke object jika header application/json
  const contentTypeKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-type')
  if (body && contentTypeKey && headers[contentTypeKey].toLowerCase().includes('application/json')) {
    try {
      requestData = JSON.parse(body)
    } catch {}
  }

  try {
    const response = await axios({
      method,
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        ...headers
      },
      data: requestData,
      timeout: 30000,
      validateStatus: () => true // Jangan throw error untuk status non-2xx
    })

    let responseData = response.data
    if (typeof responseData === 'object') {
      responseData = JSON.stringify(responseData)
    }

    if (typeof responseData === 'string' && responseData.length > 10000) {
      responseData = responseData.slice(0, 10000) + '... (konten dipotong)'
    }

    return {
      status: response.status,
      headers: response.headers,
      body: responseData
    }
  } catch (error) {
    console.error('[http_request] Error:', error.message)
    throw new Error(`HTTP Request gagal: ${error.message}`)
  }
}
