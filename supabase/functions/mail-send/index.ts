// ════════════════════════════════════════════════════════════════════════════
//  Supabase Edge Function: mail-send
//  M6.4a minta — Tauri migrációs roadmap secret-gateway első darabja
//  Dátum: 2026-04-22
//
//  CÉL:
//    Egységes email-küldési gateway web és desktop klienseknek. A Brevo / Resend
//    API kulcsok soha nem kerülnek kliens bundle-ba — itt a Supabase secrets
//    között élnek, a kliens csak authenticated user JWT-vel hív.
//
//  PROVIDER:
//    - brevo (default, EU GDPR, ingyenes 300/nap)
//    - resend (fallback, ha brevo fail)
//
//  AUTH:
//    Csak authenticated Supabase user (a req Authorization header kötelező).
//    RLS szintű jogosultság-ellenőrzés itt nem szükséges, mert ez egy
//    sheer-service (nem DB művelet). Ha specifikus scope-ok kellenének
//    (pl. broadcast csak admin-nak), a hívó kódban (app/core) kell check.
//
//  DEPLOY:
//    Lásd mail-send/README.md a deploy + secret setup részletekért.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'jsr:@supabase/supabase-js@2'

// CORS headers — web (Next.js) és desktop (Tauri webview) is hív
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailRecipient {
  email: string
  name?: string
}

interface MailSendArgs {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  text: string
  html: string
  from?: EmailRecipient
  replyTo?: EmailRecipient
  tags?: string[]
  /** Explicit provider override (diagnosztika / A-B teszt). Default env-ből. */
  provider?: 'brevo' | 'resend'
}

interface MailSendResult {
  success: boolean
  messageId?: string
  provider: 'brevo' | 'resend' | 'disabled'
  error?: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

// @ts-ignore — Deno globalThis runtime, a TS import nem látja a deklarációt
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  // ── Auth: Supabase user JWT ──
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  // @ts-ignore — Deno env
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // @ts-ignore
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnon) {
    return jsonResponse({ error: 'Edge fn mis-configured (SUPABASE_URL/ANON_KEY)' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // ── Body parse + validate ──
  let args: MailSendArgs
  try {
    args = await req.json() as MailSendArgs
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!args.to || !args.subject || typeof args.text !== 'string' || typeof args.html !== 'string') {
    return jsonResponse({
      error: 'Missing required fields: to, subject, text, html',
    }, 400)
  }

  // ── Provider választás ──
  // @ts-ignore — Deno env
  const envDefault = (Deno.env.get('EMAIL_PROVIDER') || 'brevo').toLowerCase()
  const chosen = (args.provider || envDefault).toLowerCase()

  let result: MailSendResult
  try {
    result = chosen === 'resend'
      ? await sendViaResend(args)
      : await sendViaBrevo(args)

    // Fallback — ha a brevo elsődleges fail, próbáljuk a resend-et (és fordítva)
    if (!result.success) {
      const fallback = chosen === 'resend'
        ? await sendViaBrevo(args)
        : await sendViaResend(args)
      if (fallback.success) {
        result = fallback
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ismeretlen hiba'
    result = { success: false, provider: 'disabled', error: msg }
  }

  return jsonResponse(result, 200)
})

// ════════════════════════════════════════════════════════════════════════════
//  PROVIDER 1 — Brevo (ex-SendinBlue), EU GDPR, 300/nap free tier
// ════════════════════════════════════════════════════════════════════════════

async function sendViaBrevo(args: MailSendArgs): Promise<MailSendResult> {
  // @ts-ignore — Deno env
  const apiKey = Deno.env.get('BREVO_API_KEY')
  if (!apiKey) {
    return { success: false, provider: 'brevo', error: 'BREVO_API_KEY missing' }
  }

  // @ts-ignore
  const fromEmail = args.from?.email || Deno.env.get('BREVO_FROM_EMAIL')
  // @ts-ignore
  const fromName = args.from?.name || Deno.env.get('BREVO_FROM_NAME') || 'Kartotéka'
  if (!fromEmail) {
    return { success: false, provider: 'brevo', error: 'BREVO_FROM_EMAIL missing' }
  }

  const toList = Array.isArray(args.to) ? args.to : [args.to]
  if (toList.length === 0) {
    return { success: true, provider: 'brevo' }
  }

  try {
    const body = {
      sender: { email: fromEmail, name: fromName },
      to: toList.map((r) => ({ email: r.email, name: r.name })),
      subject: args.subject,
      htmlContent: args.html,
      textContent: args.text,
      replyTo: args.replyTo
        ? { email: args.replyTo.email, name: args.replyTo.name }
        : undefined,
      tags: args.tags,
    }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.text()
      return {
        success: false,
        provider: 'brevo',
        error: `Brevo API ${res.status}: ${errBody.slice(0, 200)}`,
      }
    }
    const payload = (await res.json()) as { messageId?: string }
    return { success: true, provider: 'brevo', messageId: payload.messageId }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ismeretlen'
    return { success: false, provider: 'brevo', error: `Brevo hívási hiba: ${msg}` }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  PROVIDER 2 — Resend (fallback, tiszta REST API, nincs SDK-függőség)
// ════════════════════════════════════════════════════════════════════════════

async function sendViaResend(args: MailSendArgs): Promise<MailSendResult> {
  // @ts-ignore — Deno env
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    return { success: false, provider: 'resend', error: 'RESEND_API_KEY missing' }
  }

  let fromString: string | undefined
  if (args.from) {
    fromString = args.from.name
      ? `${args.from.name} <${args.from.email}>`
      : args.from.email
  } else {
    // @ts-ignore
    fromString = Deno.env.get('RESEND_FROM')
  }
  if (!fromString) {
    return { success: false, provider: 'resend', error: 'RESEND_FROM missing' }
  }

  const toList = Array.isArray(args.to) ? args.to : [args.to]
  if (toList.length === 0) {
    return { success: true, provider: 'resend' }
  }

  try {
    // Resend bulk limit: 50 címzett/request — chunkolás
    const toStrings = toList.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    const chunks: string[][] = []
    for (let i = 0; i < toStrings.length; i += 50) {
      chunks.push(toStrings.slice(i, i + 50))
    }

    let lastId: string | undefined
    for (const chunk of chunks) {
      const body = {
        from: fromString,
        to: chunk,
        subject: args.subject,
        text: args.text,
        html: args.html,
        reply_to: args.replyTo?.email,
        tags: args.tags?.map((t) => ({ name: t })),
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.text()
        return {
          success: false,
          provider: 'resend',
          error: `Resend API ${res.status}: ${errBody.slice(0, 200)}`,
        }
      }
      const payload = (await res.json()) as { id?: string }
      if (payload.id) lastId = payload.id
    }

    return { success: true, provider: 'resend', messageId: lastId }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ismeretlen'
    return { success: false, provider: 'resend', error: `Resend hívási hiba: ${msg}` }
  }
}
