import { createClient } from '@/lib/supabase/server'
import { AI_PROVIDERS, AI_CONFIG, SYSTEM_PROMPT } from '@/lib/constants/ai'
import { NextResponse } from 'next/server'

const GREETING_PATTERNS = [
  'szia', 'szervusz', 'halló', 'helló', 'hello', 'hi', 'hey',
  'jó napot', 'jó reggelt', 'jó estét', 'jó éjszakát',
  'üdvözlöm', 'üdv', 'csókolom',
]

function isGreeting(text: string): boolean {
  const msg = text.toLowerCase().trim()
  return GREETING_PATTERNS.some(g => msg === g || msg.startsWith(g + '!') || msg.startsWith(g + ',') || msg.startsWith(g + '.') || msg === g + '!')
}

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nincs bejelentkezett felhasználó.' }, { status: 401 })

  const { message, history } = await request.json()
  if (!message?.trim()) return NextResponse.json({ error: 'Üres üzenet.' }, { status: 400 })

  // Üdvözlés → helyi válasz, nincs API hívás
  if (isGreeting(message.trim())) {
    return NextResponse.json({
      reply: 'Üdvözlöm! Aladár vagyok, a Kartotéka asszisztense. Miben segíthetek?',
      provider: 'local',
      model: 'greeting',
    })
  }

  // Lelkész neve
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  const firstName = profile?.full_name?.split(' ').slice(-1)[0] || ''
  const systemPrompt = firstName ? `${SYSTEM_PROMPT}\nA felhasználó neve: ${firstName}.` : SYSTEM_PROMPT

  // Kontextus összeállítás
  const messages = [
    { role: 'system', content: systemPrompt },
    ...((history || []) as { role: string; content: string }[]).slice(-AI_CONFIG.maxHistoryMessages),
    { role: 'user', content: message },
  ]

  // Multi-provider fallback
  for (const provider of AI_PROVIDERS) {
    const apiKey = process.env[provider.envKey]
    if (!apiKey) continue

    for (const model of provider.models) {
      try {
        const response = await fetch(provider.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: AI_CONFIG.maxTokens,
            temperature: 0.7,
          }),
        })

        if (!response.ok) continue

        const data = await response.json()
        const reply = data.choices?.[0]?.message?.content
        if (reply) return NextResponse.json({ reply, provider: provider.name, model })
      } catch {
        continue // Következő modell/szolgáltató
      }
    }
  }

  return NextResponse.json({ error: 'Jelenleg nem tudok válaszolni. Kérem, próbálja néhány perc múlva.' }, { status: 503 })
}
