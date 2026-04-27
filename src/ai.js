import OpenAI from 'openai'
import { CONFIG } from './config.js'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

export async function generateReply({ system, history, memory, userInput, debug=false }) {

  const messages = [
    { role: "system", content: system },
    {
      role: "system",
      content: `Memory user:\n${JSON.stringify(memory)}`
    },
    ...history,
    { role: "user", content: userInput }
  ]

  const res = await client.chat.completions.create({
    model: CONFIG.ai.model,
    temperature: CONFIG.ai.temperature,
    max_tokens: CONFIG.ai.maxTokens,
    messages
  })

  return {
    text: res.choices[0].message.content,
    usage: res.usage
  }
}

// 🔍 memory extraction step
export async function extractMemory(text) {
  const res = await client.chat.completions.create({
    model: CONFIG.ai.model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `
Ekstrak memory penting dari chat.
Return JSON array:
[{ "key": "...", "value": "..."}]
Hanya jika penting (preferensi, fakta unik, dll).
`
      },
      { role: "user", content: text }
    ]
  })

  try {
    return JSON.parse(res.choices[0].message.content)
  } catch {
    return []
  }
}