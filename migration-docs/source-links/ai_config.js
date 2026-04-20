// ============================================================================
// KARTOTÉKA AI SEGÍTŐ – KONFIGURÁCIÓ  (Multi-provider: OpenRouter → Groq → Gemini)
// ============================================================================
// Sorrend: ha az első szolgáltató összes modellje sikertelen / keret elfogy,
//          automatikusan a következő szolgáltatóra vált.
//
// OpenRouter kulcs formátuma : sk-or-v1-...   (ingyenes, kártya nélkül)
// Groq kulcs formátuma       : gsk_...        (ingyenes, kártya nélkül)
// Gemini kulcs formátuma     : AIzaSy...      (ingyenes, Google-fiókkal)
// ============================================================================

const AI_CONFIG = {
    providers: [
        {
            name:     'OpenRouter',
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            apiKey:   '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',
            models: [
                'minimax/minimax-m2.5:free',        // ajánlott 1. – erős, többnyelvű
                'stepfun/step-3.5-flash:free',      // ajánlott 2. – gyors, megbízható
                'nvidia/nemotron-3-nano-30b-a3b:free',
            ]
        },
        {
            name:     'Groq',
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
            apiKey:   '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',
            models: [
                'llama-3.3-70b-versatile',   // erős, gyors Groq-on
                'llama-3.1-8b-instant',      // ultragyors, kisebb modell
            ]
        },
        {
            name:     'Gemini',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            apiKey:   'AIzaSyBEyYHs0UsucCqYQEca5S1Mt2R6ELbolBQ',
            models: [
                'gemini-2.0-flash',   // leggyorsabb Gemini
                'gemini-1.5-flash',   // tartalék
            ]
        },
    ],
    maxTokens:         1800,   // Max válaszméret (~1200-1400 szó) – magyar ékezetes karakterek több tokent fogyasztanak
    maxHistoryMessages:  10,   // Hány korábbi üzenetet tartson emlékezetben
    rateLimit:         2500    // Minimum ms két kérdés között (DoS-védelem)
};
