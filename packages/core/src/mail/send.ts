/**
 * sendMailUseCase — a mail-send Edge Function (M6.4a) kliens-oldali wrapper-je.
 *
 * Ez az ELSŐ valódi use-case a `@kartoteka/core`-ban. Minta a jövőbeli
 * M7+ modul-hullám use-case-einek:
 *
 *   1. INPUT interface (MailSendArgs) — zod-validálás opcionális, ha a payload
 *      komplex. Mail esetén a típusok elegendőek.
 *   2. CTX interface (MailSendCtx) — csak ami tényleg kell ehhez a use-case-hez.
 *      (A pénzügyi use-case-ek pl. majd `audit: AuditLogger`-t is tartalmaznak.)
 *   3. PURE async függvény, ami a Supabase kliens `functions.invoke`-ját hívja
 *      (secret-gateway pattern).
 *   4. RESULT típus — soha nem dob, mindig Result-object (egyértelmű, tesztelhető
 *      hibakezelés).
 *
 * A web (Server Action-ökben) és a desktop (kliens komponensekben) ugyanezt
 * hívja. A Supabase kulcs a kliens-bundle-ben OK, de a Brevo/Resend API kulcsok
 * SOHA NEM kerülnek kliens bundle-ba — azok csak a Supabase secrets között élnek,
 * a `mail-send` Edge Function szerver-oldalán.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Egy email címzett — email kötelező, name opcionális. */
export interface EmailRecipient {
  email: string
  name?: string
}

/** Az Edge Function input-payload-ja. */
export interface MailSendArgs {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  /** Plain text alternatíva — spam-filter-ek kedvéért is érdemes kitölteni. */
  text: string
  /** HTML tartalom. */
  html: string
  /** Ha nincs megadva, az env default FROM-ot használja a provider. */
  from?: EmailRecipient
  /** Opcionális Reply-To. */
  replyTo?: EmailRecipient
  /** Provider-specifikus analytics tag-ek. */
  tags?: string[]
  /** Provider explicit override (diagnosztika / A-B teszt). Default env-ből. */
  provider?: 'brevo' | 'resend'
}

/** Edge Function válasz. Sikertelen küldésnél `success: false` + `error`. */
export interface MailSendResult {
  success: boolean
  messageId?: string
  provider: 'brevo' | 'resend' | 'disabled'
  error?: string
}

/** Use-case context — csak a Supabase kliens kell. */
export interface MailSendCtx {
  supabase: SupabaseClient
}

/**
 * Egy email elküldése a `mail-send` Supabase Edge Function-ön keresztül.
 *
 * **Nem dob kivételt** — hibaesetén `{ success: false, error }` jön vissza.
 * A hívó kód felelőssége logolni / fallback-et csinálni.
 *
 * A függvény authenticated Supabase session-t feltételez (az `invoke()`
 * automatikusan adja az Authorization headert). Ha nincs session, a backend
 * 401-et ad, amit itt `success: false`-szá alakítunk.
 *
 * @example
 *   const result = await sendMailUseCase(
 *     {
 *       to: { email: 'lelkesz@example.ro', name: 'Kovács Pál' },
 *       subject: 'Hozzáférési kérelem jóváhagyva',
 *       text: 'Kedves Pál, ...',
 *       html: '<p>Kedves Pál, ...</p>',
 *       tags: ['access-request-approved'],
 *     },
 *     { supabase: getDesktopSupabase() },  // vagy createServerSupabaseClient() web-en
 *   )
 *   if (!result.success) {
 *     console.error('mail-send fail:', result.error)
 *   }
 */
export async function sendMailUseCase(
  args: MailSendArgs,
  ctx: MailSendCtx,
): Promise<MailSendResult> {
  try {
    const { data, error } = await ctx.supabase.functions.invoke<MailSendResult>(
      'mail-send',
      { body: args },
    )
    if (error) {
      return {
        success: false,
        provider: 'disabled',
        error: error.message || 'Edge Function invoke hiba',
      }
    }
    if (!data) {
      return {
        success: false,
        provider: 'disabled',
        error: 'Edge Function üres választ adott',
      }
    }
    return data
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'ismeretlen kivétel'
    return {
      success: false,
      provider: 'disabled',
      error: `mail-send hívási kivétel: ${msg}`,
    }
  }
}
