import { CONFIG } from '../config.js'
import { isSafeUrl } from './ssrf.js'
import fs from 'fs'
import path from 'path'

export const definition = {
  name: 'navigate_web',
  description: `Browser operator penuh — mengoperasikan browser seperti manusia: navigasi, klik tombol, isi form, scroll, screenshot, evaluasi JavaScript, ekstrak data dari SPA/website dinamis yang butuh JS rendering.

Gunakan tool ini untuk:
- Website yang butuh JavaScript (SPA, React, Vue, Next.js)
- Klik tombol/link, isi form, login, interaksi UI
- Ambil screenshot halaman untuk melihat tampilannya
- Eksekusi JavaScript di halaman
- Scraping data dari halaman yang render via JS

Untuk website statis/HTML biasa, gunakan fetch_url yang lebih cepat.`,

  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: 'Urutan aksi browser yang akan dieksekusi secara berurutan dalam satu sesi browser',
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'goto',         // Buka URL
                'click',        // Klik elemen (selector atau teks)
                'type',         // Ketik teks ke dalam input
                'clear',        // Hapus isi input
                'select',       // Pilih option di <select>
                'check',        // Check/uncheck checkbox
                'hover',        // Hover ke elemen
                'scroll',       // Scroll ke posisi/elemen
                'wait',         // Tunggu N milidetik
                'wait_for',     // Tunggu sampai elemen muncul
                'screenshot',   // Ambil screenshot (dikirim ke Discord)
                'extract',      // Ekstrak teks dari elemen
                'extract_links',// Ekstrak semua link & tombol di halaman
                'get_text',     // Ambil teks dari semua elemen yang cocok
                'get_attribute',// Ambil nilai atribut elemen
                'get_html',     // Ambil innerHTML elemen
                'evaluate',     // Jalankan JavaScript di halaman
                'back',         // Kembali ke halaman sebelumnya
                'forward',      // Maju ke halaman berikutnya
                'reload',       // Reload halaman
                'get_url',      // Ambil URL halaman saat ini
                'get_title',    // Ambil title halaman saat ini
              ],
              description: 'Aksi yang akan dilakukan'
            },
            url: {
              type: 'string',
              description: '[goto] URL tujuan (harus https:// atau http://)'
            },
            selector: {
              type: 'string',
              description: '[click/type/extract/hover/scroll/wait_for/get_*] CSS selector elemen target. Bisa juga teks: "text=Tombol Login"'
            },
            text: {
              type: 'string',
              description: '[type/select/check] Teks yang akan diketik, option yang dipilih, atau "true"/"false" untuk checkbox'
            },
            timeout: {
              type: 'integer',
              description: '[wait/wait_for] Durasi tunggu dalam milidetik (default 2000)',
              default: 2000
            },
            label: {
              type: 'string',
              description: '[extract/screenshot] Label/nama untuk hasil aksi ini agar mudah direferensikan'
            },
            script: {
              type: 'string',
              description: '[evaluate] Kode JavaScript yang akan dijalankan di konteks halaman. Bisa return nilai.'
            },
            wait_until: {
              type: 'string',
              enum: ['load', 'domcontentloaded', 'networkidle'],
              description: '[goto] Kondisi tunggu sebelum lanjut (default: domcontentloaded)',
              default: 'domcontentloaded'
            }
          },
          required: ['action']
        }
      },
      viewport: {
        type: 'object',
        description: 'Ukuran viewport browser (default 1280x720)',
        properties: {
          width: { type: 'integer', default: 1280 },
          height: { type: 'integer', default: 720 }
        }
      }
    },
    required: ['steps']
  }
}

// === DETEKSI PATH CHROME / CHROMIUM ===
const CHROME_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/local/bin/chromium',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

function findSystemChrome() {
  for (const p of CHROME_CANDIDATES) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return null
}

// === RESOLVE URL RELATIF ===
function resolveUrl(base, href) {
  if (!href) return null
  href = href.trim()
  if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null
  try { return new URL(href, base).href } catch { return null }
}

export async function run(args) {
  // Import playwright
  let playwright
  try {
    playwright = await import('playwright-chromium')
  } catch {
    // fallback: coba playwright biasa
    try {
      playwright = await import('playwright')
    } catch {
      return {
        success: false,
        error: 'Playwright tidak tersedia. Pastikan playwright-chromium sudah terinstall (npm install playwright-chromium).'
      }
    }
  }

  const steps = args.steps || []
  const viewportWidth  = args.viewport?.width  || 1280
  const viewportHeight = args.viewport?.height || 720
  const tmpDir = CONFIG.agent.tmpDir || '/tmp'

  // Cari executable Chrome
  const systemChrome = findSystemChrome()
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-zygote',
    ]
  }
  if (systemChrome) {
    launchOptions.executablePath = systemChrome
    console.log(`[navigate_web] Using system Chrome: ${systemChrome}`)
  } else {
    // Pakai playwright's own binary
    if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = CONFIG.tools.playwrightBrowsersPath
    }
    console.log(`[navigate_web] Using Playwright's bundled Chromium`)
  }

  let browser = null
  const results = []
  let currentUrl = ''
  const remoteUrl = process.env.PLAYWRIGHT_REMOTE_URL || CONFIG.tools?.playwrightRemoteUrl

  try {
    if (remoteUrl) {
      console.log(`[navigate_web] Connecting to remote browser (CDP): ${remoteUrl}`)
      browser = await playwright.chromium.connectOverCDP(remoteUrl)
    } else {
      browser = await playwright.chromium.launch(launchOptions)
    }
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: viewportWidth, height: viewportHeight },
      acceptDownloads: false,
      ignoreHTTPSErrors: true
    })
    const page = await context.newPage()

    // Blokir resource berat yang tidak perlu (hemat bandwidth & waktu)
    await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,eot,mp4,mp3,avi,webm}', r => r.abort())

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const label = step.label || `step_${i + 1}`
      const stepTimeout = step.timeout || 15000

      try {
        switch (step.action) {

          // ── GOTO ──
          case 'goto': {
            if (!step.url) throw new Error('"goto" butuh parameter "url"')
            if (!(await isSafeUrl(step.url))) throw new Error(`URL diblokir (SSRF): ${step.url}`)
            const waitUntil = step.wait_until || 'domcontentloaded'
            await page.goto(step.url, { waitUntil, timeout: stepTimeout })
            currentUrl = page.url()
            const pageTitle = await page.title()
            results.push({ action: 'goto', label, url: currentUrl, title: pageTitle, success: true })
            break
          }

          // ── CLICK ──
          case 'click': {
            if (!step.selector) throw new Error('"click" butuh parameter "selector"')
            // Support "text=..." untuk klik berdasarkan teks
            if (step.selector.startsWith('text=')) {
              const txt = step.selector.slice(5)
              await page.getByText(txt, { exact: false }).first().click({ timeout: stepTimeout })
            } else {
              await page.click(step.selector, { timeout: stepTimeout })
            }
            currentUrl = page.url()
            results.push({ action: 'click', label, selector: step.selector, new_url: currentUrl, success: true })
            break
          }

          // ── TYPE ──
          case 'type': {
            if (!step.selector) throw new Error('"type" butuh parameter "selector"')
            if (step.text === undefined) throw new Error('"type" butuh parameter "text"')
            await page.fill(step.selector, step.text, { timeout: stepTimeout })
            results.push({ action: 'type', label, selector: step.selector, value: step.text, success: true })
            break
          }

          // ── CLEAR ──
          case 'clear': {
            if (!step.selector) throw new Error('"clear" butuh parameter "selector"')
            await page.fill(step.selector, '', { timeout: stepTimeout })
            results.push({ action: 'clear', label, selector: step.selector, success: true })
            break
          }

          // ── SELECT ──
          case 'select': {
            if (!step.selector) throw new Error('"select" butuh "selector"')
            if (!step.text) throw new Error('"select" butuh "text" (nilai/label option)')
            await page.selectOption(step.selector, { label: step.text }, { timeout: stepTimeout })
              .catch(() => page.selectOption(step.selector, { value: step.text }, { timeout: stepTimeout }))
            results.push({ action: 'select', label, selector: step.selector, option: step.text, success: true })
            break
          }

          // ── CHECK (checkbox/radio) ──
          case 'check': {
            if (!step.selector) throw new Error('"check" butuh "selector"')
            const shouldCheck = step.text !== 'false'
            if (shouldCheck) {
              await page.check(step.selector, { timeout: stepTimeout })
            } else {
              await page.uncheck(step.selector, { timeout: stepTimeout })
            }
            results.push({ action: 'check', label, selector: step.selector, checked: shouldCheck, success: true })
            break
          }

          // ── HOVER ──
          case 'hover': {
            if (!step.selector) throw new Error('"hover" butuh "selector"')
            await page.hover(step.selector, { timeout: stepTimeout })
            results.push({ action: 'hover', label, selector: step.selector, success: true })
            break
          }

          // ── SCROLL ──
          case 'scroll': {
            if (step.selector) {
              await page.locator(step.selector).scrollIntoViewIfNeeded({ timeout: stepTimeout })
              results.push({ action: 'scroll', label, selector: step.selector, success: true })
            } else {
              const x = step.text ? parseInt(step.text.split(',')[0]) : 0
              const y = step.text ? parseInt(step.text.split(',')[1] || '500') : 500
              await page.evaluate(`window.scrollTo(${x}, ${y})`)
              results.push({ action: 'scroll', label, position: { x, y }, success: true })
            }
            break
          }

          // ── WAIT ──
          case 'wait': {
            const ms = step.timeout || 2000
            await page.waitForTimeout(ms)
            results.push({ action: 'wait', label, duration_ms: ms, success: true })
            break
          }

          // ── WAIT_FOR ──
          case 'wait_for': {
            if (!step.selector) throw new Error('"wait_for" butuh "selector"')
            await page.waitForSelector(step.selector, { timeout: stepTimeout })
            results.push({ action: 'wait_for', label, selector: step.selector, success: true })
            break
          }

          // ── SCREENSHOT ──
          case 'screenshot': {
            const filename = `screenshot_${Date.now()}.png`
            const filepath = path.join(tmpDir, filename)
            fs.mkdirSync(tmpDir, { recursive: true })
            await page.screenshot({
              path: filepath,
              fullPage: step.text === 'fullpage' || step.text === 'full',
              type: 'png'
            })
            const pageTitle = await page.title()
            results.push({
              action: 'screenshot',
              label,
              filepath,
              filename,
              title: pageTitle,
              url: page.url(),
              isAttachment: true,  // flag agar dikirim ke Discord
              success: true
            })
            break
          }

          // ── EXTRACT ──
          case 'extract': {
            if (!step.selector) throw new Error('"extract" butuh "selector"')
            const locator = page.locator(step.selector)
            const count = await locator.count()
            const texts = []
            for (let j = 0; j < Math.min(count, 50); j++) {
              const t = await locator.nth(j).innerText().catch(() => '')
              if (t.trim()) texts.push(t.trim())
            }
            results.push({ action: 'extract', label, selector: step.selector, count, texts, success: true })
            break
          }

          // ── EXTRACT_LINKS ──
          case 'extract_links': {
            const pageUrl = page.url()
            const linkData = await page.evaluate((baseUrl) => {
              const links = []
              const seen = new Set()
              document.querySelectorAll('a[href]').forEach(el => {
                const text = el.textContent?.trim().replace(/\s+/g, ' ') || ''
                const href = el.href || ''
                if (!href || seen.has(href) || !text || text.length > 100) return
                if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return
                seen.add(href)
                // Detect type
                let type = 'link'
                const inNav = !!el.closest('nav, [role="navigation"]')
                const inHeader = !!el.closest('header')
                const inFooter = !!el.closest('footer')
                const isBtn = el.getAttribute('role') === 'button' || el.className?.includes('btn')
                if (inNav) type = 'nav-link'
                else if (isBtn) type = 'button-link'
                else if (inFooter) type = 'footer-link'
                else if (inHeader) type = 'header-link'
                links.push({ type, text, href })
              })
              // Also get buttons
              document.querySelectorAll('button, [role="button"]').forEach(el => {
                const text = el.textContent?.trim().replace(/\s+/g, ' ') || ''
                if (!text || text.length > 100) return
                const dataHref = el.dataset?.href || el.dataset?.url || el.dataset?.link || ''
                links.push({ type: 'button', text, href: dataHref || null })
              })
              return links
            }, pageUrl)
            results.push({ action: 'extract_links', label, url: pageUrl, link_count: linkData.length, links: linkData.slice(0, 100), success: true })
            break
          }

          // ── GET_TEXT ──
          case 'get_text': {
            if (!step.selector) throw new Error('"get_text" butuh "selector"')
            const locator = page.locator(step.selector)
            const count = await locator.count()
            const texts = []
            for (let j = 0; j < Math.min(count, 30); j++) {
              const t = await locator.nth(j).innerText().catch(() => '')
              texts.push(t.trim())
            }
            results.push({ action: 'get_text', label, selector: step.selector, count, texts, success: true })
            break
          }

          // ── GET_ATTRIBUTE ──
          case 'get_attribute': {
            if (!step.selector) throw new Error('"get_attribute" butuh "selector"')
            if (!step.text) throw new Error('"get_attribute" butuh "text" (nama atribut, misal: "href", "src", "value")')
            const attrVal = await page.getAttribute(step.selector, step.text, { timeout: stepTimeout })
            results.push({ action: 'get_attribute', label, selector: step.selector, attribute: step.text, value: attrVal, success: true })
            break
          }

          // ── GET_HTML ──
          case 'get_html': {
            const sel = step.selector || 'body'
            const html = await page.$eval(sel, el => el.innerHTML).catch(() => '')
            // Bersihkan script/style tags dari HTML
            const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').trim().slice(0, 5000)
            results.push({ action: 'get_html', label, selector: sel, html: clean, success: true })
            break
          }

          // ── EVALUATE ──
          case 'evaluate': {
            if (!step.script) throw new Error('"evaluate" butuh "script" (kode JavaScript)')
            const evalResult = await page.evaluate(step.script)
            results.push({ action: 'evaluate', label, script: step.script, result: evalResult, success: true })
            break
          }

          // ── BACK ──
          case 'back': {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: stepTimeout })
            currentUrl = page.url()
            results.push({ action: 'back', label, url: currentUrl, success: true })
            break
          }

          // ── FORWARD ──
          case 'forward': {
            await page.goForward({ waitUntil: 'domcontentloaded', timeout: stepTimeout })
            currentUrl = page.url()
            results.push({ action: 'forward', label, url: currentUrl, success: true })
            break
          }

          // ── RELOAD ──
          case 'reload': {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: stepTimeout })
            results.push({ action: 'reload', label, url: page.url(), success: true })
            break
          }

          // ── GET_URL ──
          case 'get_url': {
            results.push({ action: 'get_url', label, url: page.url(), success: true })
            break
          }

          // ── GET_TITLE ──
          case 'get_title': {
            const title = await page.title()
            results.push({ action: 'get_title', label, title, success: true })
            break
          }

          default:
            results.push({ action: step.action, label, success: false, error: `Aksi "${step.action}" tidak dikenal.` })
        }

      } catch (stepErr) {
        results.push({ action: step.action, label, success: false, error: stepErr.message })
        // Jangan stop — lanjutkan step berikutnya meski ada error di satu step
      }
    }

    await browser.close()

    // Cari screenshot attachments untuk dikirim ke Discord
    const attachments = results
      .filter(r => r.action === 'screenshot' && r.success && r.filepath)
      .map(r => ({ filepath: r.filepath, filename: r.filename, isAttachment: true }))

    return {
      success: true,
      steps_executed: results.length,
      final_url: currentUrl,
      results,
      ...(attachments.length > 0 ? { attachments } : {})
    }

  } catch (error) {
    if (browser) { try { await browser.close() } catch {} }
    console.error('[navigate_web] Browser error:', error.message)
    return {
      success: false,
      error: error.message,
      hint: systemChrome
        ? `Chrome ditemukan di ${systemChrome} tapi gagal launch.`
        : 'Tidak ada Chrome/Chromium di sistem. Set env CHROME_EXECUTABLE_PATH atau install: apt-get install chromium-browser'
    }
  }
}
