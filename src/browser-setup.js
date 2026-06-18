/**
 * browser-setup.js
 * Deteksi & setup Chromium otomatis saat bot start.
 * Berjalan di dalam Node.js — tidak bergantung pada start.sh.
 */

import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const GREEN  = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED    = '\x1b[31m'
const NC     = '\x1b[0m'

const log  = (msg) => console.log(`${GREEN}[Browser]${NC} ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[Browser]${NC} ${msg}`)
const err  = (msg) => console.log(`${RED}[Browser]${NC} ${msg}`)

// Path kandidat Chrome/Chromium di sistem
const SYSTEM_CHROME_PATHS = [
  process.env.CHROME_EXECUTABLE_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/local/bin/chromium',
  '/snap/bin/chromium',
  '/opt/google/chrome/chrome',
].filter(Boolean)

// Pattern path Playwright cache
const PW_CACHE_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH
  || path.join(os.homedir(), '.cache', 'ms-playwright')

const PW_CHROME_GLOBS = [
  'chromium-*/chrome-linux/chrome',
  'chromium-*/chrome-linux64/chrome',
  'chromium*/chrome-linux/chrome',
]

/**
 * Cari file chrome di Playwright cache dengan pattern glob sederhana
 */
function findInPwCache() {
  if (!fs.existsSync(PW_CACHE_DIR)) return null
  try {
    const dirs = fs.readdirSync(PW_CACHE_DIR)
    for (const dir of dirs) {
      for (const pattern of PW_CHROME_GLOBS) {
        const parts = pattern.split('/')
        // Cocokkan dir pertama (chromium-*)
        if (!dir.startsWith('chromium')) continue
        const chromePath = path.join(PW_CACHE_DIR, dir, ...parts.slice(1))
        if (fs.existsSync(chromePath) && isExecutable(chromePath)) {
          return chromePath
        }
      }
    }
  } catch { /* ignore */ }
  return null
}

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch { return false }
}

function getDiskFreeMB(dir) {
  try {
    // df -m <dir> | awk 'NR==2{print $4}'
    const result = spawnSync('df', ['-m', dir], { encoding: 'utf8', timeout: 5000 })
    if (result.status === 0) {
      const lines = result.stdout.trim().split('\n')
      if (lines[1]) {
        const parts = lines[1].trim().split(/\s+/)
        return parseInt(parts[3]) || 0
      }
    }
  } catch {}
  return 9999 // unknown, assume enough
}

function getChromeVersion(chromePath) {
  try {
    const result = spawnSync(chromePath, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, DISPLAY: '' }
    })
    return result.stdout?.trim() || result.stderr?.trim() || 'unknown'
  } catch { return 'unknown' }
}

/**
 * Jalankan `npx playwright install chromium` secara synchronous
 * dengan output progress live ke console.
 */
function installPlaywrightChromium() {
  warn('Mengunduh Chromium via Playwright (bisa 1-3 menit, ~190MB)...')
  try {
    const result = spawnSync(
      'npx', ['playwright', 'install', 'chromium'],
      {
        encoding: 'utf8',
        timeout: 300_000, // 5 menit
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: PW_CACHE_DIR,
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '', // reset skip
        },
        stdio: 'pipe',
      }
    )
    // Tampilkan baris yang relevan dari output
    const output = (result.stdout || '') + (result.stderr || '')
    const lines = output.split('\n').filter(l =>
      /downloading|✓|error|failed|done|chromium/i.test(l)
    )
    for (const line of lines) {
      warn(line.trim())
    }
    return result.status === 0
  } catch (e) {
    err(`Install gagal: ${e.message}`)
    return false
  }
}

/**
 * Main: setup Chromium
 * Dipanggil saat bot start. Set process.env.CHROME_EXECUTABLE_PATH jika berhasil.
 */
export async function setupBrowser() {
  warn('Memeriksa ketersediaan Chromium untuk browser operator...')

  // ── Cek 1: path sistem ──────────────────────────────────────────
  for (const p of SYSTEM_CHROME_PATHS) {
    if (p && fs.existsSync(p) && isExecutable(p)) {
      const ver = getChromeVersion(p)
      log(`✅ Chromium ditemukan di sistem: ${p}`)
      log(`   Versi: ${ver}`)
      process.env.CHROME_EXECUTABLE_PATH = p
      return true
    }
  }

  // ── Cek 2: Playwright cache ─────────────────────────────────────
  const cached = findInPwCache()
  if (cached) {
    const ver = getChromeVersion(cached)
    log(`✅ Playwright Chromium cache ditemukan: ${cached}`)
    log(`   Versi: ${ver}`)
    process.env.CHROME_EXECUTABLE_PATH = cached
    return true
  }

  // ── Cek 3: Install via Playwright ───────────────────────────────
  warn('Chromium belum ada. Mencoba instalasi via Playwright...')

  const checkDir = fs.existsSync('/home/container') ? '/home/container' : os.homedir()
  const freeMB = getDiskFreeMB(checkDir)
  warn(`Ruang disk tersedia: ${freeMB} MB (minimal 350 MB diperlukan)`)

  if (freeMB < 350) {
    err(`Ruang disk tidak cukup (${freeMB} MB < 350 MB). Chromium tidak diinstall.`)
    err('Solusi: bebaskan disk atau set CHROME_EXECUTABLE_PATH di env panel Pterodactyl.')
    return false
  }

  const ok = installPlaywrightChromium()
  if (ok) {
    const installed = findInPwCache()
    if (installed) {
      const ver = getChromeVersion(installed)
      log(`✅ Chromium berhasil diinstall: ${installed}`)
      log(`   Versi: ${ver}`)
      process.env.CHROME_EXECUTABLE_PATH = installed
      return true
    }
  }

  err('⚠️  Chromium tidak bisa diinstall otomatis.')
  err('   Fitur navigate_web (browser operator) dinonaktifkan.')
  warn('   Solusi manual: set CHROME_EXECUTABLE_PATH di env panel Pterodactyl.')
  return false
}
