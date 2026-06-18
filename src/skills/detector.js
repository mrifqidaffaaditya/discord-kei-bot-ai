import Fuse from 'fuse.js'
import { getActiveSkillsForGuild } from './index.js'
import { CONFIG } from '../config.js'

/**
 * Mencari skill yang relevan untuk dimasukkan ke konteks bot berdasarkan isi pesan
 */
export async function detectSkills(messageText, guildId) {
  const activeSkills = await getActiveSkillsForGuild(guildId)
  if (!activeSkills || activeSkills.length === 0) return []

  const matchedSkills = new Set()
  const cleanMessage = messageText.toLowerCase()

  // 1. Pencocokan Regex & Substring Eksplisit
  for (const skill of activeSkills) {
    const patterns = skill.trigger_patterns || []
    for (const pattern of patterns) {
      try {
        // Cek jika berbentuk regex
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
          const lastSlash = pattern.lastIndexOf('/')
          const regexBody = pattern.slice(1, lastSlash)
          const flags = pattern.slice(lastSlash + 1)
          const regex = new RegExp(regexBody, flags.includes('i') ? flags : flags + 'i')
          if (regex.test(messageText)) {
            matchedSkills.add(skill)
            break
          }
        } else {
          // Pencocokan substring biasa (case-insensitive)
          if (cleanMessage.includes(pattern.toLowerCase())) {
            matchedSkills.add(skill)
            break
          }
        }
      } catch (err) {
        if (cleanMessage.includes(pattern.toLowerCase())) {
          matchedSkills.add(skill)
          break
        }
      }
    }
  }

  // 2. Fuzzy Matching via Fuse.js untuk menangkap konteks semantik ringan
  const unmatchedSkills = activeSkills.filter(s => !matchedSkills.has(s))
  if (unmatchedSkills.length > 0) {
    const fuse = new Fuse(unmatchedSkills, {
      keys: ['name', 'description', 'trigger_patterns'],
      threshold: 1 - CONFIG.skills.detectThreshold, // Jika threshold 0.75, fuse threshold 0.25 (makin kecil makin ketat)
      includeScore: true
    })

    const results = fuse.search(messageText)
    for (const result of results) {
      const similarity = 1 - (result.score || 0)
      if (similarity >= CONFIG.skills.detectThreshold) {
        matchedSkills.add(result.item)
      }
    }
  }

  return Array.from(matchedSkills)
}
