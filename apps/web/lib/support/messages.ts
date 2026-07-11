import type { SupabaseClient } from '@supabase/supabase-js'

export interface SupportTicketView {
  id: string
  user_id: string | null
  subject: string
  content: string
  status: string
  type: 'request' | 'reply'
  created_at: string
  parent_id?: string | null
  profiles?: { full_name: string | null; email: string } | null
}

type SupportSchemaMode = 'legacy' | 'modern'

type LegacyRow = {
  id: string
  user_id: string | null
  subject: string
  content: string | null
  status: string
  type: 'request' | 'reply'
  created_at: string
  parent_id?: string | null
}

type ModernRow = {
  id: string
  congregation_id?: string | null
  user_id: string | null
  sender_name: string | null
  sender_email: string | null
  subject: string
  message: string | null
  category: string
  status: string
  admin_reply: string | null
  replied_at: string | null
  created_at: string
}

/**
 * 2026-07-11 fix: a korábbi felismerés a LEGACY oszlopokra (content/type/
 * parent_id) futtatott HEAD+count próbát, és a hibából következtetett modern
 * sémára. A HEAD-kérésen viszont a PostgREST nem mindig validálja az
 * oszlopokat → a próba „sikerült", a kód legacy-nak hitte a DB-t, majd az
 * éles (modern sémájú) táblán a legacy select elszállt:
 * „column support_messages.content does not exist".
 * Az új felismerés a MODERN oszlopot (message) kérdezi le VALÓDI GET-tel —
 * ha létezik, modern; ha hiányzik, legacy. A pozitív eredményt cache-eljük
 * (átmeneti hibát nem), így nincs plusz kör minden híváskor.
 */
let cachedSchemaMode: SupportSchemaMode | null = null

async function detectSchemaMode(supabase: SupabaseClient): Promise<SupportSchemaMode> {
  if (cachedSchemaMode === 'modern') return 'modern'
  const probe = await supabase.from('support_messages').select('message').limit(1)
  if (!probe.error) {
    cachedSchemaMode = 'modern'
    return 'modern'
  }
  return 'legacy'
}

async function getProfileMap(supabase: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { full_name: string | null; email: string }>()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const map = new Map<string, { full_name: string | null; email: string }>()
  ;((data as { id: string; full_name: string | null; email: string }[] | null) || []).forEach(profile => {
    map.set(profile.id, { full_name: profile.full_name, email: profile.email })
  })
  return map
}

function normalizeLegacyRows(
  rows: LegacyRow[],
  profileMap: Map<string, { full_name: string | null; email: string }>
): SupportTicketView[] {
  return rows.map(row => ({
    id: row.id,
    user_id: row.user_id,
    subject: row.subject,
    content: row.content || '',
    status: row.status,
    type: row.type,
    created_at: row.created_at,
    parent_id: row.parent_id || null,
    profiles: row.user_id ? profileMap.get(row.user_id) || null : null,
  }))
}

function normalizeModernRows(rows: ModernRow[]): SupportTicketView[] {
  const normalized: SupportTicketView[] = []

  rows.forEach(row => {
    normalized.push({
      id: row.id,
      user_id: row.user_id,
      subject: row.subject,
      content: row.message || '',
      status: row.status,
      type: 'request',
      created_at: row.created_at,
      parent_id: null,
      profiles: row.sender_email
        ? {
            full_name: row.sender_name,
            email: row.sender_email,
          }
        : null,
    })

    if (row.admin_reply) {
      normalized.push({
        id: `${row.id}-reply`,
        user_id: row.user_id,
        subject: `RE: ${row.subject}`,
        content: row.admin_reply,
        status: 'sent',
        type: 'reply',
        created_at: row.replied_at || row.created_at,
        parent_id: row.id,
        profiles: null,
      })
    }
  })

  return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export async function getOpenSupportTicketCount(supabase: SupabaseClient): Promise<number> {
  const schemaMode = await detectSchemaMode(supabase)

  if (schemaMode === 'legacy') {
    const { count } = await supabase
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'request')
      .neq('status', 'closed')

    return count || 0
  }

  const { count } = await supabase
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'closed')

  return count || 0
}

export async function getUserSupportTicketsCompat(
  supabase: SupabaseClient,
  userId: string
): Promise<{ data: SupportTicketView[]; mode: SupportSchemaMode }> {
  const schemaMode = await detectSchemaMode(supabase)

  if (schemaMode === 'legacy') {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id, user_id, subject, content, status, type, created_at, parent_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message || 'Support uzenetek lekerese sikertelen.')

    return {
      data: normalizeLegacyRows((data as LegacyRow[] | null) || [], new Map()),
      mode: schemaMode,
    }
  }

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, user_id, sender_name, sender_email, subject, message, category, status, admin_reply, replied_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Support uzenetek lekerese sikertelen.')

  return {
    data: normalizeModernRows((data as ModernRow[] | null) || []),
    mode: schemaMode,
  }
}

export async function getAdminSupportTicketsCompat(
  supabase: SupabaseClient
): Promise<{ data: SupportTicketView[]; mode: SupportSchemaMode }> {
  const schemaMode = await detectSchemaMode(supabase)

  if (schemaMode === 'legacy') {
    const { data, error } = await supabase
      .from('support_messages')
      .select('id, user_id, subject, content, status, type, created_at, parent_id')
      .eq('type', 'request')
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message || 'Support jegyek lekerese sikertelen.')

    const rows = (data as LegacyRow[] | null) || []
    const userIds = rows.map(row => row.user_id).filter((value): value is string => Boolean(value))
    const profileMap = await getProfileMap(supabase, userIds)

    return {
      data: normalizeLegacyRows(rows, profileMap),
      mode: schemaMode,
    }
  }

  const { data, error } = await supabase
    .from('support_messages')
    .select('id, user_id, sender_name, sender_email, subject, message, category, status, admin_reply, replied_at, created_at')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Support jegyek lekerese sikertelen.')

  return {
    data: normalizeModernRows((data as ModernRow[] | null) || []),
    mode: schemaMode,
  }
}

export async function sendSupportTicketCompat(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  subject: string,
  content: string,
  options?: {
    congregationId?: string | null
    senderName?: string | null
  }
) {
  const schemaMode = await detectSchemaMode(supabase)

  if (schemaMode === 'legacy') {
    const { error } = await supabase.from('support_messages').insert({
      user_id: user.id,
      subject,
      content,
      type: 'request',
      status: 'new',
    })

    if (error) throw new Error(error.message || 'Support jegy mentese sikertelen.')
    return
  }

  const congregationId = options?.congregationId
  const senderName = options?.senderName

  const { error } = await supabase.from('support_messages').insert({
    user_id: user.id,
    congregation_id: congregationId || null,
    sender_name: senderName || user.email || 'Ismeretlen felado',
    sender_email: user.email || '',
    category: 'kerdes',
    subject,
    message: content,
    status: 'new',
  })

  if (error) throw new Error(error.message || 'Support jegy mentese sikertelen.')
}

export async function replySupportTicketCompat(
  supabase: SupabaseClient,
  ticketId: string,
  replyContent: string
) {
  const schemaMode = await detectSchemaMode(supabase)

  if (schemaMode === 'legacy') {
    const { data: ticket, error: ticketError } = await supabase
      .from('support_messages')
      .select('id, user_id, subject, status')
      .eq('id', ticketId)
      .single()

    if (ticketError || !ticket) throw new Error(ticketError?.message || 'A jegy nem talalhato.')

    const legacyTicket = ticket as { id: string; user_id: string | null; subject: string; status: string }
    if (legacyTicket.status === 'closed') throw new Error('Lezart jegyre nem lehet valaszolni.')

    const { error: insertError } = await supabase.from('support_messages').insert({
      user_id: legacyTicket.user_id,
      subject: `RE: ${legacyTicket.subject}`,
      content: replyContent,
      type: 'reply',
      status: 'sent',
      parent_id: ticketId,
    })

    if (insertError) throw new Error(insertError.message || 'Support valasz mentese sikertelen.')

    const { error: updateError } = await supabase
      .from('support_messages')
      .update({ status: 'read' })
      .eq('id', ticketId)

    if (updateError) throw new Error(updateError.message || 'A jegy statusza nem frissitheto.')

    return {
      ticketUserId: legacyTicket.user_id,
      ticketSubject: legacyTicket.subject,
    }
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_messages')
    .select('id, user_id, subject, status')
    .eq('id', ticketId)
    .single()

  if (ticketError || !ticket) throw new Error(ticketError?.message || 'A jegy nem talalhato.')

  const modernTicket = ticket as { id: string; user_id: string | null; subject: string; status: string }
  if (modernTicket.status === 'closed') throw new Error('Lezart jegyre nem lehet valaszolni.')

  const { error: updateError } = await supabase
    .from('support_messages')
    .update({
      admin_reply: replyContent,
      replied_at: new Date().toISOString(),
      status: 'replied',
    })
    .eq('id', ticketId)

  if (updateError) throw new Error(updateError.message || 'A support valasz nem mentheto.')

  return {
    ticketUserId: modernTicket.user_id,
    ticketSubject: modernTicket.subject,
  }
}

export async function closeSupportTicketCompat(
  supabase: SupabaseClient,
  ticketId: string
) {
  const { error } = await supabase
    .from('support_messages')
    .update({ status: 'closed' })
    .eq('id', ticketId)

  if (error) throw new Error(error.message || 'A support jegy nem zarhato le.')
}
