'use server'

/**
 * Broadcast üzenetek szerver akciói.
 *
 * Jogosultság: csak `admin` (rendszergazda/master) és `egyhazkeruleti_admin`
 * küldhet, és láthatja az archívumot.
 *
 * Munkafolyamat:
 *   1. sendBroadcast(input) — kézi üzenet küldése
 *   2. sendChangelogBroadcast(key, targetScope, sendEmail, extras) — CHANGELOG
 *      bejegyzés alapján küldés
 *   3. listBroadcasts() — archív
 *   4. listChangelogEntries() — a CHANGELOG.md + már elküldött flag
 *   5. listDiocesesForBroadcast() / listDistrictsForBroadcast() — célzási opciók
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveBroadcastRecipients } from '@/lib/broadcasts/recipients'
import { sendBroadcastEmail } from '@/lib/broadcasts/email'
import { parseChangelog } from '@/lib/broadcasts/changelog-parser'
import { NEWSLETTER_READ_CUTOFF } from '@/lib/broadcasts/types'
import type {
  BroadcastComposeInput,
  BroadcastRow,
  ChangelogEntry,
  BroadcastTargetScope,
  BroadcastTargetRole,
  ReleaseCategory,
} from '@/lib/broadcasts/types'

function canManage(access: Awaited<ReturnType<typeof getEffectiveAccessContext>>): boolean {
  return !!access.admin || !!access.master || !!access.egyhazkeruletiAdmin
}

// ---------------------------------------------------------------------------
// Új broadcast küldése (kézi)
// ---------------------------------------------------------------------------

export async function sendBroadcast(
  input: BroadcastComposeInput,
): Promise<{ success?: boolean; error?: string; id?: string; recipientCount?: number }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága broadcast üzenet küldésére.' }

  const cim = input.cim.trim()
  const uzenet = input.uzenet.trim()
  if (!cim) return { error: 'Adja meg az üzenet címét.' }
  if (!uzenet) return { error: 'Adja meg az üzenet szövegét.' }

  // 1. Címzettek feloldása
  const recipients = await resolveBroadcastRecipients(input)
  if (recipients.length === 0) {
    return { error: 'A célzás alapján nincs egy címzett sem. Ellenőrizze a kiválasztott gyülekezeteket / szerepet.' }
  }

  const { supabase } = access

  // 2. Broadcast rekord létrehozása
  const { data: inserted, error: insErr } = await supabase
    .from('system_broadcasts')
    .insert({
      sent_by: access.user.id,
      cim,
      uzenet,
      tipus: input.tipus,
      hivatkozas: input.hivatkozas || null,
      target_scope: input.targetScope,
      target_role: input.targetRole || null,
      target_congregation_ids: input.targetCongregationIds || null,
      target_diocese_ids: input.targetDioceseIds || null,
      target_district_ids: input.targetDistrictIds || null,
      send_email: input.sendEmail,
      recipient_count: recipients.length,
      release_version: input.releaseVersion || null,
      release_category: input.releaseCategory || null,
      release_changelog_key: input.releaseChangelogKey || null,
    })
    .select('id')
    .single()

  if (insErr || !inserted) {
    return { error: `Hiba a broadcast rögzítésekor: ${insErr?.message || 'ismeretlen'}` }
  }

  // 3. ertesitesek-be bulk insert — minden címzettnek
  const notifRows = recipients.map((r) => ({
    user_id: r.id,
    cim,
    uzenet,
    tipus: input.tipus === 'release' ? 'info' : input.tipus,
    hivatkozas: input.hivatkozas || null,
    olvasva: false,
  }))
  const { error: notifErr } = await supabase.from('ertesitesek').insert(notifRows)
  if (notifErr) {
    console.error('[sendBroadcast] ertesitesek insert hiba:', notifErr.message)
    // Nem return — a broadcast rekord már megvan, legalább láthatja az admin
  }

  // 4. Email küldés (ha kért) — hiba csendesen kezelve
  if (input.sendEmail) {
    const emails = recipients.map((r) => r.email).filter((e): e is string => !!e && e.includes('@'))
    const emailResult = await sendBroadcastEmail({
      to: emails,
      subject: cim,
      bodyText: uzenet,
      tipus: input.tipus,
      hivatkozas: input.hivatkozas,
    })
    if (emailResult.success) {
      await supabase
        .from('system_broadcasts')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', inserted.id)
    } else {
      await supabase
        .from('system_broadcasts')
        .update({ email_error: emailResult.error || 'ismeretlen' })
        .eq('id', inserted.id)
    }
  }

  revalidatePath('/admin')
  revalidatePath('/', 'layout')

  return { success: true, id: inserted.id, recipientCount: recipients.length }
}

// ---------------------------------------------------------------------------
// Changelog bejegyzés alapján küldés
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fejlesztési hírlevél — több CHANGELOG bejegyzés EGY email-ben
// ---------------------------------------------------------------------------

export interface NewsletterInput {
  /** A kiválasztott CHANGELOG kulcsok (az unsentEntries közül). */
  changelogKeys: string[]
  /** Hírlevél cím (alapértelmezett: "Kartotéka — Fejlesztési hírlevél") */
  headerTitle?: string
  /** Bevezető szöveg (opcionális) */
  introText?: string
  /** Célcsoport */
  targetScope: BroadcastTargetScope
  targetRole?: BroadcastTargetRole | null
  targetCongregationIds?: string[]
  targetDioceseIds?: string[]
  targetDistrictIds?: string[]
  /** Email küldése (Resend) */
  sendEmail: boolean
}

export async function sendNewsletter(args: NewsletterInput): Promise<{
  success?: boolean
  error?: string
  recipientCount?: number
  markedSent?: number
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  if (args.changelogKeys.length === 0) {
    return { error: 'Legalább egy frissítést válassz ki a hírlevélhez.' }
  }

  const allEntries = await parseChangelog()
  const selected = allEntries.filter((e) => args.changelogKeys.includes(e.key))
  if (selected.length === 0) {
    return { error: 'A kiválasztott kulcsokra nem találtunk CHANGELOG bejegyzést.' }
  }

  // Ellenőrizzük, melyik már van kiküldve
  const { data: already } = await access.supabase
    .from('system_broadcasts')
    .select('release_changelog_key')
    .in('release_changelog_key', args.changelogKeys)
  const alreadyKeys = new Set(
    ((already || []) as { release_changelog_key: string | null }[])
      .map((s) => s.release_changelog_key)
      .filter((k): k is string => !!k),
  )
  const toSend = selected.filter((e) => !alreadyKeys.has(e.key))
  if (toSend.length === 0) {
    return { error: 'Minden kiválasztott bejegyzés már ki lett küldve.' }
  }

  // A "reprezentatív" bejegyzés: a legfrissebb (ez kerül be az első
  // broadcast rekordba, a többit marker-rekordokként rögzítjük)
  const sorted = [...toSend].sort((a, b) => b.date.localeCompare(a.date))
  const primary = sorted[0]

  // 1) Fő broadcast (title = headerTitle, body = a HTML markdown változata)
  // A HTML-t külön küldjük az email templetben — ide csak a markdown összegzést tesszük
  const title = args.headerTitle?.trim() || 'Kartotéka — Fejlesztési hírlevél'
  const summaryMd = buildSummaryMarkdown(sorted, args.introText)

  const mainResult = await sendBroadcast({
    cim: title,
    uzenet: summaryMd,
    tipus: 'release',
    hivatkozas: null,
    targetScope: args.targetScope,
    targetRole: args.targetRole,
    targetCongregationIds: args.targetCongregationIds,
    targetDioceseIds: args.targetDioceseIds,
    targetDistrictIds: args.targetDistrictIds,
    sendEmail: false, // Az email-t külön küldjük (szép HTML template-tel)
    releaseVersion: primary.version,
    releaseCategory: primary.category,
    releaseChangelogKey: primary.key,
  })
  if ('error' in mainResult && mainResult.error) return { error: mainResult.error }

  // 2) A többi kulcsot marker-ként rögzítjük, hogy ne lehessen újraküldeni
  const userId = access.user.id
  const others = sorted.slice(1)
  for (const e of others) {
    await access.supabase.from('system_broadcasts').insert({
      cim: `(Hírlevél része) ${e.title}`,
      uzenet: e.bodyMarkdown.slice(0, 500),
      tipus: 'release',
      sent_by: userId,
      send_email: false,
      email_sent_at: null,
      target_scope: args.targetScope,
      target_role: args.targetRole || null,
      target_congregation_ids: args.targetCongregationIds || null,
      target_diocese_ids: args.targetDioceseIds || null,
      target_district_ids: args.targetDistrictIds || null,
      recipient_count: mainResult.recipientCount || 0,
      release_version: e.version,
      release_category: e.category,
      release_changelog_key: e.key,
    })
  }

  // 3) Email küldés (szép HTML template)
  if (args.sendEmail) {
    let emailSentAt: string | null = null
    let emailError: string | null = null

    try {
      const { buildNewsletterHtml, buildNewsletterPlainText } = await import('@/lib/broadcasts/newsletter-template')
      const html = buildNewsletterHtml({
        entries: sorted,
        introText: args.introText,
        headerTitle: title,
      })
      const text = buildNewsletterPlainText({
        entries: sorted,
        introText: args.introText,
      })
      // Címzettek lekérdezése a `BroadcastComposeInput` signature-rel
      const recipients = await resolveBroadcastRecipients({
        cim: title,
        uzenet: text,
        tipus: 'release',
        targetScope: args.targetScope,
        targetRole: args.targetRole || null,
        targetCongregationIds: args.targetCongregationIds,
        targetDioceseIds: args.targetDioceseIds,
        targetDistrictIds: args.targetDistrictIds,
        sendEmail: true,
      })
      const emails = recipients
        .map((r) => r.email)
        .filter((e): e is string => !!e)
      if (emails.length > 0) {
        const emailResult = await sendBroadcastEmail({
          to: emails,
          subject: title,
          bodyText: text,
          tipus: 'release',
          customHtml: html,
        })
        if (emailResult.success) {
          emailSentAt = new Date().toISOString()
        } else {
          emailError = emailResult.error || 'ismeretlen email hiba'
        }
      } else {
        emailError = 'A célcsoportban nincs email címmel rendelkező címzett.'
      }
    } catch (err) {
      console.error('[sendNewsletter] email küldés hiba:', err)
      emailError = err instanceof Error ? err.message : 'ismeretlen email hiba'
    }

    await access.supabase
      .from('system_broadcasts')
      .update({
        send_email: true,
        email_sent_at: emailSentAt,
        email_error: emailError,
      })
      .in('release_changelog_key', toSend.map((e) => e.key))
  }

  revalidatePath('/admin')
  return {
    success: true,
    recipientCount: mainResult.recipientCount || 0,
    markedSent: toSend.length,
  }
}

/**
 * 2026-06-05 — TESZT hírlevél: a kiválasztott bejegyzésekből generált hírlevelet
 * CSAK a bejelentkezett admin saját email-címére küldi. NEM ír DB-be, NEM jelöl
 * semmit elküldöttnek — tisztán előnézet/teszt a beérkező levélről.
 */
export async function sendNewsletterTest(args: {
  changelogKeys: string[]
  headerTitle?: string
  introText?: string
}): Promise<{ success?: boolean; error?: string; email?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }
  const myEmail = access.user.email
  if (!myEmail) return { error: 'A fiókodhoz nincs email-cím rendelve.' }
  if (args.changelogKeys.length === 0) return { error: 'Válassz ki legalább egy frissítést.' }

  const allEntries = await parseChangelog()
  const selected = allEntries.filter((e) => args.changelogKeys.includes(e.key))
  if (selected.length === 0) return { error: 'A kiválasztott kulcsokra nem találtunk bejegyzést.' }

  const sorted = [...selected].sort((a, b) => b.date.localeCompare(a.date))
  const title = args.headerTitle?.trim() || 'Kartotéka — Fejlesztési hírlevél'

  const { buildNewsletterHtml, buildNewsletterPlainText } = await import('@/lib/broadcasts/newsletter-template')
  const html = buildNewsletterHtml({ entries: sorted, introText: args.introText, headerTitle: title })
  const text = buildNewsletterPlainText({ entries: sorted, introText: args.introText })

  const emailResult = await sendBroadcastEmail({
    to: [myEmail],
    subject: `[TESZT] ${title}`,
    bodyText: text,
    tipus: 'release',
    customHtml: html,
  })
  if (!emailResult.success) {
    return { error: emailResult.error || 'A teszt-email küldése sikertelen.' }
  }
  return { success: true, email: myEmail }
}

function buildSummaryMarkdown(entries: ChangelogEntry[], introText?: string): string {
  const lines: string[] = []
  if (introText && introText.trim()) {
    lines.push(introText.trim(), '')
  }
  lines.push(`## A hírlevélben ${entries.length} frissítést küldünk ki:`, '')
  for (const e of entries) {
    const cat = e.category ? `(${e.category})` : ''
    lines.push(`- **${e.date}** — ${e.title} ${cat}`)
  }
  lines.push('', 'A részletes tartalmat a kiküldött email-ben olvashatja.')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CHANGELOG alapú broadcast (egy bejegyzés)
// ---------------------------------------------------------------------------

export async function sendChangelogBroadcast(args: {
  changelogKey: string
  targetScope: BroadcastTargetScope
  targetRole?: BroadcastTargetRole | null
  targetCongregationIds?: string[]
  targetDioceseIds?: string[]
  targetDistrictIds?: string[]
  sendEmail: boolean
  hivatkozas?: string | null
  /** Ha true, akkor újra elküldhető a már korábban broadcast-olt CHANGELOG bejegyzés.
   *  Új system_broadcasts row jön létre, és új ertesitesek-rekordok minden címzettnek. */
  force?: boolean
}): Promise<{ success?: boolean; error?: string; id?: string; recipientCount?: number; resent?: boolean }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const entries = await parseChangelog()
  const entry = entries.find((e) => e.key === args.changelogKey)
  if (!entry) return { error: 'A CHANGELOG bejegyzés nem található.' }

  // Már elküldve? Ha igen ÉS nincs force flag, akkor blokkolunk.
  // Force=true esetén egy új broadcast row jön létre — a régi marad archívumként.
  let isResend = false
  const { data: existing } = await access.supabase
    .from('system_broadcasts')
    .select('id')
    .eq('release_changelog_key', args.changelogKey)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing) {
    if (!args.force) {
      return { error: 'Ez a bejegyzés már ki lett broadcast-olva. Az "Újraküldés" gombbal újra kiküldhető.' }
    }
    isResend = true
  }

  const result = await sendBroadcast({
    cim: entry.title,
    uzenet: entry.bodyMarkdown,
    tipus: 'release',
    hivatkozas: args.hivatkozas || null,
    targetScope: args.targetScope,
    targetRole: args.targetRole,
    targetCongregationIds: args.targetCongregationIds,
    targetDioceseIds: args.targetDioceseIds,
    targetDistrictIds: args.targetDistrictIds,
    sendEmail: args.sendEmail,
    releaseVersion: entry.version,
    releaseCategory: entry.category as ReleaseCategory | null,
    releaseChangelogKey: entry.key,
  })

  return { ...result, resent: isResend }
}

// ---------------------------------------------------------------------------
// Listázók
// ---------------------------------------------------------------------------

export async function listBroadcasts(): Promise<{ data?: BroadcastRow[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { data, error } = await access.supabase
    .from('system_broadcasts')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(100)

  if (error) return { error: error.message }
  return { data: (data || []) as BroadcastRow[] }
}

export async function listChangelogEntries(): Promise<{ data?: ChangelogEntry[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const entries = await parseChangelog()
  if (entries.length === 0) return { data: [] }

  // Megnézzük, melyik kulcs van már broadcast-olva, és milyen csatornán ment ki.
  // FIX 2026-05-04: a UNIQUE constraint drop-olva — ugyanazon kulcsra most már
  // több row is lehet (re-send miatt). ORDER BY sent_at DESC + Map-set csak
  // az ELSŐ találatra → mindig a legfrissebb broadcast jelenik meg.
  const { data: sent } = await access.supabase
    .from('system_broadcasts')
    .select('release_changelog_key, sent_at, recipient_count, target_scope, target_role, send_email, email_sent_at, email_error')
    .in('release_changelog_key', entries.map((e) => e.key))
    .order('sent_at', { ascending: false })

  type ChangelogBroadcastRow = {
    release_changelog_key: string | null
    sent_at: string
    recipient_count: number
    target_scope: BroadcastTargetScope
    target_role: BroadcastTargetRole | null
    send_email: boolean
    email_sent_at: string | null
    email_error: string | null
  }

  const sentByKey = new Map<string, ChangelogBroadcastRow>()
  for (const row of (sent || []) as ChangelogBroadcastRow[]) {
    if (!row.release_changelog_key) continue
    if (!sentByKey.has(row.release_changelog_key)) {
      // Csak az első (legfrissebb sent_at szerint) maradjon — re-send esetén
      // ugyanazon kulcsra több row van.
      sentByKey.set(row.release_changelog_key, row)
    }
  }

  // Legfrissebb dátum felül — Endre visszajelzés 2026-04-18
  // (Az azonos dátumú bejegyzések közül az utoljára beszúrt kerül elsőre)
  const withSent = entries.map((e) => {
    const status = sentByKey.get(e.key)
    return {
      ...e,
      alreadySent: !!status,
      // A küszöb előtti, még ki nem küldött bejegyzések "olvasott/archivált"
      // állapotúak — nem kerülnek a hírlevélbe / "kiküldésre vár" listába.
      readMarked: !status && e.date < NEWSLETTER_READ_CUTOFF,
      broadcastStatus: status
        ? {
            sentAt: status.sent_at,
            recipientCount: status.recipient_count,
            targetScope: status.target_scope,
            targetRole: status.target_role,
            sendEmail: status.send_email,
            emailSentAt: status.email_sent_at,
            emailError: status.email_error,
          }
        : null,
    }
  })
  withSent.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    // Azonos dátumnál a CHANGELOG sorrendjét megtartjuk fordítva:
    // a legfelül írottak (amelyek valószínűleg frissebb részek) felülre
    return 0
  })

  return {
    data: withSent,
  }
}

export async function listCongregationsForBroadcast(): Promise<{
  data?: Array<{ id: string; name: string; diocese_id: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { data, error } = await access.supabase
    .from('congregations')
    .select('id, name, nev_hu, diocese_id')
    .order('nev_hu')

  if (error) return { error: error.message }
  return {
    data: (data || []).map((c) => ({
      id: c.id as string,
      name: (c.nev_hu as string | null) || (c.name as string | null) || 'Ismeretlen',
      diocese_id: (c.diocese_id as string | null) || null,
    })),
  }
}

export async function listDiocesesForBroadcast(): Promise<{
  data?: Array<{ id: string; name: string; district_id: string | null }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { data, error } = await access.supabase
    .from('dioceses')
    .select('id, name, district_id')
    .order('name')

  if (error) return { error: error.message }
  return { data: (data || []) as Array<{ id: string; name: string; district_id: string | null }> }
}

export async function listDistrictsForBroadcast(): Promise<{
  data?: Array<{ id: string; name: string }>
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága.' }

  const { data, error } = await access.supabase
    .from('districts')
    .select('id, name')
    .order('name')

  if (error) return { error: error.message }
  return { data: (data || []) as Array<{ id: string; name: string }> }
}
