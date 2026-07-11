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
import {
  getScopedActiveUserIds,
  getScopedDioceseIds,
  getAdminDistrictScope,
} from '@/lib/auth/admin-scope'
import { resolveBroadcastRecipients } from '@/lib/broadcasts/recipients'
import { sendBroadcastEmail } from '@/lib/broadcasts/email'
import { parseChangelog } from '@/lib/broadcasts/changelog-parser'
import { BROADCAST_TIPUS_LABELS, NEWSLETTER_READ_CUTOFF } from '@/lib/broadcasts/types'
import type {
  BroadcastComposeInput,
  BroadcastRow,
  ChangelogEntry,
  BroadcastTargetScope,
  BroadcastTargetRole,
  BroadcastTipus,
  ReleaseCategory,
} from '@/lib/broadcasts/types'
import { describeBroadcastRowScope } from '@/components/admin/broadcasts/format'
import type { BroadcastEmailPreview } from '@/components/admin/broadcasts/email-preview-types'

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
  let recipients = await resolveBroadcastRecipients(input)
  // #2: a kerületi admin bármilyen célzás mellett is CSAK a saját egyházkerülete
  // tagjait érheti el — a feloldott címzetteket a hatókörre metsszük.
  const allowedIds = await getScopedActiveUserIds(access)
  if (allowedIds) recipients = recipients.filter((r) => allowedIds.has(r.id))
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
  /** Újraküldés: ha true, a már korábban kiküldött bejegyzéseket is újraküldi. */
  force?: boolean
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
  // Újraküldés módban (force) a már kiküldötteket is elküldjük.
  const toSend = args.force ? selected : selected.filter((e) => !alreadyKeys.has(e.key))
  if (toSend.length === 0) {
    return { error: 'Minden kiválasztott bejegyzés már ki lett küldve. (Az „Újraküldés" kapcsolóval újra elküldhető.)' }
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
    // Újraküldésnél a már rögzített marker-eket nem duplikáljuk.
    if (args.force && alreadyKeys.has(e.key)) continue
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
      let recipients = await resolveBroadcastRecipients({
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
      // #2: a kerületi admin email-hírlevele is csak a saját kerületére megy.
      const allowedIds = await getScopedActiveUserIds(access)
      if (allowedIds) recipients = recipients.filter((r) => allowedIds.has(r.id))
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

  // #2: kerületi admin → csak a saját kerülete gyülekezetei a célzó legördülőben.
  const scopedDioceseIds = await getScopedDioceseIds(access)
  const congQ = access.supabase
    .from('congregations')
    .select('id, name, nev_hu, diocese_id')
    .order('nev_hu')
  if (scopedDioceseIds) congQ.in('diocese_id', scopedDioceseIds)
  const { data, error } = await congQ

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

  // #2: kerületi admin → csak a saját kerülete egyházmegyéi.
  const scopedDioceseIds = await getScopedDioceseIds(access)
  const dioQ = access.supabase
    .from('dioceses')
    .select('id, name, district_id')
    .order('name')
  if (scopedDioceseIds) dioQ.in('id', scopedDioceseIds)
  const { data, error } = await dioQ

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

  // #2: kerületi admin → csak a saját egyházkerülete(i).
  const adminScope = getAdminDistrictScope(access)
  const distQ = access.supabase.from('districts').select('id, name').order('name')
  if (!adminScope.unrestricted) {
    distQ.in('id', adminScope.districtIds.length ? adminScope.districtIds : ['00000000-0000-0000-0000-000000000000'])
  }
  const { data, error } = await distQ

  if (error) return { error: error.message }
  return { data: (data || []) as Array<{ id: string; name: string }> }
}

// ---------------------------------------------------------------------------
// E-mail előnézet (2026-07-11, admin-redesign 2. kör)
// ---------------------------------------------------------------------------

/**
 * Elküldött üzenet e-mail előnézete — a tárolt system_broadcasts sorból
 * UGYANAZZAL a sablonnal generálja a HTML-t, amivel a tényleges küldés ment.
 */
export async function getBroadcastEmailPreview(
  broadcastId: string,
): Promise<{ data?: BroadcastEmailPreview; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága az üzenetek megtekintésére.' }
  if (!broadcastId) return { error: 'Hiányzó üzenet-azonosító.' }

  const { data, error } = await access.supabase
    .from('system_broadcasts')
    .select('*')
    .eq('id', broadcastId)
    .maybeSingle()

  if (error) return { error: `Az üzenet betöltése nem sikerült: ${error.message}` }
  if (!data) return { error: 'Az üzenet nem található (lehet, hogy időközben törölték).' }

  const row = data as BroadcastRow
  const html = buildPreviewEmailHtml({
    subject: row.cim,
    bodyText: row.uzenet || '',
    tipus: row.tipus,
    hivatkozas: row.hivatkozas,
  })

  return {
    data: {
      subject: row.cim,
      html,
      draft: false,
      meta: {
        tipus: row.tipus,
        tipusLabel: BROADCAST_TIPUS_LABELS[row.tipus] ?? row.tipus,
        sentAt: row.sent_at,
        recipientCount: row.recipient_count,
        scopeLabel: describeBroadcastRowScope(row),
        emailRequested: row.send_email,
        emailSentAt: row.email_sent_at,
        emailError: row.email_error,
      },
    },
  }
}

/**
 * CHANGELOG-bejegyzés e-mail előnézete — vázlatnál („Így fog kinézni") és
 * már kiküldött bejegyzésnél is működik. A meta-adatokat (mikor, hány címzett)
 * a legutóbbi hozzá tartozó broadcast-sorból olvassa, ha van.
 */
export async function getChangelogEmailPreview(
  changelogKey: string,
): Promise<{ data?: BroadcastEmailPreview; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!canManage(access)) return { error: 'Nincs jogosultsága az üzenetek megtekintésére.' }
  if (!changelogKey) return { error: 'Hiányzó bejegyzés-azonosító.' }

  const entries = await parseChangelog()
  const entry = entries.find((e) => e.key === changelogKey)
  if (!entry) return { error: 'A CHANGELOG bejegyzés nem található.' }

  // Kiküldési státusz (ha már ment ki) — hiba esetén nem bukik el az előnézet,
  // csak vázlatként mutatjuk.
  const { data: sentRow } = await access.supabase
    .from('system_broadcasts')
    .select('*')
    .eq('release_changelog_key', changelogKey)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sent = (sentRow as BroadcastRow | null) || null
  const html = buildPreviewEmailHtml({
    subject: entry.title,
    bodyText: entry.bodyMarkdown || '',
    tipus: 'release',
    hivatkozas: null,
  })

  return {
    data: {
      subject: entry.title,
      html,
      draft: !sent,
      meta: {
        tipus: 'release',
        tipusLabel: BROADCAST_TIPUS_LABELS.release,
        sentAt: sent?.sent_at ?? null,
        recipientCount: sent?.recipient_count ?? null,
        scopeLabel: sent ? describeBroadcastRowScope(sent) : null,
        emailRequested: !!sent?.send_email,
        emailSentAt: sent?.email_sent_at ?? null,
        emailError: sent?.email_error ?? null,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// E-mail sablon — a kiküldéshez használt sablon TÜKRE (privát)
// ---------------------------------------------------------------------------
// FIGYELEM: az alábbi kód a lib/broadcasts/email.ts buildHtmlBody() +
// renderMarkdownEmail() másolata. Az email.ts ebben a körben nem módosítható
// (GDPR/backend-javítás külön körben megy — ADMIN-REDESIGN-DIRECTION §5),
// és a buildHtmlBody ott nem exportált. Amint az email.ts újra nyitható:
// exportáld onnan a buildHtmlBody-t, és ezt a másolatot TÖRÖLD (drift-veszély).

const PREVIEW_TIPUS_ACCENT: Record<
  BroadcastTipus,
  { bg: string; text: string; label: string; gradient: string }
> = {
  info: {
    bg: '#eff6ff',
    text: '#1e40af',
    label: 'Tájékoztatás',
    gradient: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
  },
  success: {
    bg: '#f0fdf4',
    text: '#166534',
    label: 'Sikeres művelet',
    gradient: 'linear-gradient(135deg, #166534 0%, #15803d 100%)',
  },
  warning: {
    bg: '#fefce8',
    text: '#854d0e',
    label: 'Figyelmeztetés',
    gradient: 'linear-gradient(135deg, #854d0e 0%, #b45309 100%)',
  },
  danger: {
    bg: '#fef2f2',
    text: '#991b1b',
    label: 'Fontos',
    gradient: 'linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)',
  },
  release: {
    bg: '#f5f3ff',
    text: '#5b21b6',
    label: 'Új verzió',
    gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
  },
}

const PREVIEW_APP_URL = 'https://kartoteka.app'
const PREVIEW_LOGO_URL = `${PREVIEW_APP_URL}/kartoteka-logo.png`
const PREVIEW_ICON_URL = `${PREVIEW_APP_URL}/EREK.png`

function previewEscapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function previewRenderInline(s: string): string {
  let r = previewEscapeHtml(s)
  r = r.replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a">$1</strong>')
  r = r.replace(
    /`([^`]+)`/g,
    '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-family:monospace;font-size:90%">$1</code>',
  )
  return r
}

function previewRenderMarkdownEmail(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (/^#{2,4}\s+/.test(line)) {
      closeList()
      const text = previewRenderInline(line.replace(/^#{2,4}\s+/, ''))
      out.push(
        `<h3 style="margin:20px 0 8px;color:#0f766e;font-size:15px;font-weight:700;border-top:1px solid #e2e8f0;padding-top:14px">${text}</h3>`,
      )
      continue
    }
    if (line.trim() === '') {
      closeList()
      continue
    }
    if (/^-{3,}$/.test(line.trim())) {
      closeList()
      continue
    }
    const li = line.match(/^[-*]\s+(.+)$/)
    if (li) {
      if (!inList) {
        out.push('<ul style="margin:8px 0 14px 0;padding-left:20px;color:#334155">')
        inList = true
      }
      out.push(`<li style="margin:6px 0;line-height:1.6">${previewRenderInline(li[1])}</li>`)
      continue
    }
    closeList()
    out.push(
      `<p style="margin:10px 0;color:#334155;line-height:1.65">${previewRenderInline(line)}</p>`,
    )
  }
  closeList()
  return out.join('\n')
}

function buildPreviewEmailHtml(args: {
  subject: string
  bodyText: string
  tipus: BroadcastTipus
  hivatkozas: string | null
}): string {
  // Ismeretlen (régi/sérült) tipus-értéknél nem crash-elünk — info accent.
  const accent = PREVIEW_TIPUS_ACCENT[args.tipus] ?? PREVIEW_TIPUS_ACCENT.info
  const linkButton = args.hivatkozas
    ? `
                <tr><td style="padding-top:24px" align="left">
                  <a href="${previewEscapeHtml(args.hivatkozas)}" style="display:inline-block;padding:14px 28px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:600;font-size:14px">Részletek megtekintése</a>
                </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${previewEscapeHtml(args.subject)}</title>
  <!--[if mso]>
  <style type="text/css">body,table,td,p,a,li,blockquote{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}</style>
  <![endif]-->
  <style type="text/css">
    /* Reszponzív szélesség — desktop inboxban szélesebb, mobile-on full-width */
    @media only screen and (max-width:600px) {
      .kt-container { width: 100% !important; max-width: 100% !important; }
      .kt-pad-x { padding-left: 12px !important; padding-right: 12px !important; }
      .kt-card-pad { padding: 22px 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1e293b;-webkit-font-smoothing:antialiased">
  <!-- Outer wrapper — full-width, gradient háttér -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:0;margin:0">
    <tr>
      <td align="center" style="padding:0;background:#f1f5f9">

        <!-- Inner container — max 920px, centered, mobile-on full-width -->
        <table role="presentation" class="kt-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:920px;width:100%">

          <!-- HEADER — Kartotéka brand sáv -->
          <tr>
            <td align="left" class="kt-pad-x" style="padding:32px 24px 0 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${accent.gradient};border-radius:20px 20px 0 0;padding:0">
                <tr>
                  <td class="kt-card-pad" style="padding:32px 36px 28px 36px" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:14px">
                          <img src="${PREVIEW_LOGO_URL}" alt="Kartotéka" width="56" height="56" style="display:block;border-radius:14px;background:rgba(255,255,255,0.18);padding:8px" />
                        </td>
                        <td valign="middle">
                          <p style="margin:0;color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;letter-spacing:0.22em;text-transform:uppercase">Kartotéka rendszer</p>
                          <h2 style="margin:4px 0 0 0;color:#ffffff;font-family:'Georgia',serif;font-size:22px;font-weight:600;letter-spacing:-0.01em">Egyházi nyilvántartó</h2>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CONTENT card -->
          <tr>
            <td align="left" class="kt-pad-x" style="padding:0 24px 0 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:0 0 20px 20px;box-shadow:0 8px 32px rgba(15,23,42,0.06)">
                <tr>
                  <td class="kt-card-pad" style="padding:32px 36px 32px 36px">
                    <!-- Accent badge -->
                    <p style="margin:0 0 12px 0;display:inline-block;padding:5px 14px;background:${accent.bg};color:${accent.text};border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${accent.label}</p>

                    <!-- Title -->
                    <h1 style="margin:8px 0 0 0;font-family:'Georgia',serif;font-size:26px;line-height:1.2;color:#0f172a;font-weight:600">${previewEscapeHtml(args.subject)}</h1>

                    <!-- Divider -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0">
                      <tr><td style="border-top:1px solid #e2e8f0;line-height:0;height:0">&nbsp;</td></tr>
                    </table>

                    <!-- Megszólítás -->
                    <p style="margin:0 0 14px 0;font-size:15px;color:#0f172a;font-weight:600">Kedves Felhasználók!</p>

                    <!-- Body (markdown → formázott HTML) -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:15px;color:#334155">${previewRenderMarkdownEmail(args.bodyText)}</td>
                      </tr>
                      ${linkButton}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" class="kt-pad-x" style="padding:24px 24px 32px 24px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td align="center" valign="middle" style="padding-bottom:10px">
                    <img src="${PREVIEW_ICON_URL}" alt="EREK" width="22" height="22" style="display:inline-block;vertical-align:middle;opacity:0.6" />
                    <span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:11px;color:#64748b;font-weight:700;letter-spacing:0.12em">ERDÉLYI REFORMÁTUS EGYHÁZKERÜLET</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;color:#94a3b8;line-height:1.6;padding-bottom:4px">
                    Az üzenetet a Kartotéka rendszergazdája küldte.
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size:12px;line-height:1.5">
                    <a href="${PREVIEW_APP_URL}" style="color:#475569;text-decoration:underline;font-weight:500">Kartotéka rendszer megnyitása →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}
