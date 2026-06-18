import { CONFIG } from '../config.js'

export const definition = {
  name: 'navigate_web',
  description: 'Navigasi web dinamis/headless untuk mengambil data SPA (Single Page Application) yang butuh interaksi user.',
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: 'Langkah-langkah aksi browser secara berurutan',
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['goto', 'click', 'fill', 'wait', 'extract'],
              description: 'Aksi: buka URL, klik, isi input, tunggu, atau ambil teks'
            },
            url: {
              type: 'string',
              description: 'Target URL (untuk goto)'
            },
            selector: {
              type: 'string',
              description: 'CSS Selector target (untuk click, fill, extract)'
            },
            text: {
              type: 'string',
              description: 'Teks yang akan diinput (untuk fill)'
            },
            timeout: {
              type: 'integer',
              description: 'Waktu tunggu dalam milidetik (untuk wait)'
            }
          },
          required: ['action']
        }
      }
    },
    required: ['steps']
  }
}

export async function run(args) {
  if (!CONFIG.tools.playwrightEnabled) {
    return {
      success: false,
      message: 'Browser headless (Playwright) dinonaktifkan di konfigurasi bot ini. Hubungi admin untuk mengaktifkan.'
    }
  }

  let playwright
  try {
    playwright = await import('playwright-chromium')
  } catch (err) {
    return {
      success: false,
      message: 'Library playwright-chromium tidak terinstall di environment ini.'
    }
  }

  const steps = args.steps || []
  let browser = null

  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = CONFIG.tools.playwrightBrowsersPath
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    })

    const page = await context.newPage()
    const extractedData = {}

    for (const step of steps) {
      if (step.action === 'goto') {
        if (!step.url) throw new Error('Aksi "goto" butuh parameter "url"')
        
        // Cek SSRF
        const { isSafeUrl } = await import('./ssrf.js')
        if (!(await isSafeUrl(step.url))) {
          throw new Error(`Akses diblokir: URL ${step.url} merujuk ke private IP / localhost.`)
        }

        await page.goto(step.url, { waitUntil: 'networkidle', timeout: 20000 })
      } else if (step.action === 'click') {
        if (!step.selector) throw new Error('Aksi "click" butuh parameter "selector"')
        await page.click(step.selector, { timeout: 10000 })
      } else if (step.action === 'fill') {
        if (!step.selector || step.text === undefined) throw new Error('Aksi "fill" butuh parameter "selector" dan "text"')
        await page.fill(step.selector, step.text, { timeout: 10000 })
      } else if (step.action === 'wait') {
        const time = step.timeout || 2000
        await page.waitForTimeout(time)
      } else if (step.action === 'extract') {
        if (!step.selector) throw new Error('Aksi "extract" butuh parameter "selector"')
        const elements = page.locator(step.selector)
        const count = await elements.count()
        const texts = []
        for (let i = 0; i < Math.min(count, 10); i++) {
          const t = await elements.nth(i).innerText()
          if (t.trim()) texts.push(t.trim())
        }
        extractedData[step.selector] = texts
      } else {
        throw new Error(`Aksi "${step.action}" tidak didukung.`)
      }
    }

    await browser.close()
    return {
      success: true,
      extracted: extractedData
    }
  } catch (error) {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
    console.error('[navigate_web] Playwright error:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}
