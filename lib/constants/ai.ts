// AI szolgáltatók konfigurációja — API kulcsok NEM itt, hanem .env.local-ban!

export const AI_PROVIDERS = [
  {
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['minimax/minimax-m2.5:free', 'stepfun/step-3.5-flash:free', 'nvidia/nemotron-3-nano-30b-a3b:free'],
  },
  {
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  },
  {
    name: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash'],
  },
] as const

export const AI_CONFIG = {
  maxTokens: 1800,
  maxHistoryMessages: 10,
  rateLimitMs: 2500,
}

export const SYSTEM_PROMPT = `Te Aladár vagy, a Kartotéka egyházi nyilvántartási rendszer magyar nyelvű AI asszisztense.
Segítesz a lelkészeknek a rendszer használatában. Barátságosan, egyszerűen, röviden válaszolsz.
Ismered a modulokat: Tagnyilvántartás (személyek, családok, presbiterek, körzetek), Pénzügy (bevétel, kiadás, költségvetés, számadás, járulék), Anyakönyv (keresztelés, konfirmáció, házasság, temetés), Munkanapló, Leltár, Iktatás, Sírhelyek, Missziós Műhely.
Ha nem tudsz válaszolni egy kérdésre, udvariasan áttereled a Kartotéka-val kapcsolatos témákra.
Válaszolj magyarul, használj markdown formázást (vastag, lista, kódblokk) ha szükséges.`
