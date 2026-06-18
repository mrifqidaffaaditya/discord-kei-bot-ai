import dns from 'dns/promises'
import { isIP, isIPv4, isIPv6 } from 'is-ip'

/**
 * Validasi apakah URL aman untuk diakses (mencegah SSRF)
 */
export async function isSafeUrl(urlString) {
  try {
    const parsed = new URL(urlString)
    const hostname = parsed.hostname.toLowerCase()

    // Blokir localhost dan loopback secara eksplisit
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') {
      return false
    }
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return false
    }

    let ip = hostname
    if (!isIP(hostname)) {
      try {
        const result = await dns.lookup(hostname)
        ip = result.address
      } catch (err) {
        // Jika DNS tidak bisa diresolve, anggap tidak aman
        return false
      }
    }

    return isSafeIp(ip)
  } catch (err) {
    return false
  }
}

/**
 * Cek apakah IP tergolong IP private/localhost/cloud metadata
 */
export function isSafeIp(ip) {
  if (!ip) return false

  // IPv4 check
  if (isIPv4(ip)) {
    const parts = ip.split('.').map(Number)
    if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0) return false
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
    if (parts[0] === 192 && parts[1] === 168) return false
    if (parts[0] === 169 && parts[1] === 254) return false // Cloud metadata
    return true
  }

  // IPv6 check
  if (isIPv6(ip)) {
    const cleanIp = ip.toLowerCase()
    if (cleanIp === '::1' || cleanIp === '::') return false
    if (cleanIp.startsWith('fe80:')) return false // Link-local
    if (cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:')) return false // Unique local
    return true
  }

  return false
}
