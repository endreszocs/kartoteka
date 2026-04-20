'use server'

/**
 * Egyházmegyei dokumentum workflow szerver akciók.
 * A típusok és konstansok a lib/constants/documents.ts-ben vannak
 * ('use server' fájlból nem exportálható const/type).
 */

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { DocumentType, DocumentStatus, DocumentSubmission } from '@/lib/constants/documents'
import { DOCUMENT_TYPE_LABELS } from '@/lib/constants/documents'

// ---------------------------------------------------------------------------
// Gyülekezeti szintű: dokumentum beküldése
// ---------------------------------------------------------------------------

export async function submitDocument(
  documentType: DocumentType,
  year: number,
  snapshotData: Record<string, unknown>,
  modificationNumber?: number | null,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { supabase, profile } = access
  const congregationId = access.effectiveCongregationId
  const dioceseId = profile?.diocese_id || null

  const { error } = await supabase.from('document_submissions').upsert({
    congregation_id: congregationId,
    diocese_id: dioceseId,
    year,
    document_type: documentType,
    modification_number: modificationNumber || null,
    status: 'submitted' as DocumentStatus,
    submitted_at: new Date().toISOString(),
    snapshot_data: snapshotData,
  }, {
    onConflict: 'congregation_id,year,document_type,modification_number',
  })

  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés az egyházmegyei címzetteknek (esperes, egyházmegyei admin).
  // Hiba esetén csendes — a beküldés már sikeres, ne blokkoljuk a flow-t.
  try {
    const { data: cong } = await supabase
      .from('congregations')
      .select('name')
      .eq('id', congregationId)
      .maybeSingle()
    const congName = cong?.name || 'Ismeretlen gyülekezet'

    let recipientsQuery = supabase
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .in('role', ['esperes', 'egyhazmegyei_admin'])
    if (dioceseId) {
      recipientsQuery = recipientsQuery.eq('diocese_id', dioceseId)
    }
    const { data: recipients } = await recipientsQuery

    if (recipients && recipients.length > 0) {
      const docLabel = DOCUMENT_TYPE_LABELS[documentType]
      const modSuffix = modificationNumber ? ` (${modificationNumber}. módosítás)` : ''
      const cim = `Új beküldés: ${docLabel}${modSuffix} — ${congName}`
      const uzenet =
        `${congName} beküldte a(z) ${year}. évi ${docLabel.toLowerCase()}${modSuffix} ` +
        `dokumentumot az egyházmegyének. Részletek: Egyházmegyei áttekintő.`

      const rows = recipients.map((r) => ({
        user_id: r.id,
        congregation_id: congregationId,
        cim,
        uzenet,
        tipus: 'info',
        hivatkozas: '/dashboard-egyhazmegye',
      }))

      await supabase.from('ertesitesek').insert(rows)
    }
  } catch {
    // Nem kritikus — a beküldés megtörtént.
  }

  revalidatePath('/penzugy')
  revalidatePath('/dashboard-egyhazmegye')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: dokumentumok lekérdezése
// ---------------------------------------------------------------------------

export async function getDioceseSubmissions(
  year: number,
): Promise<DocumentSubmission[]> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return []
  if (!access.esperes && !access.admin && !access.master) return []

  const { supabase, profile } = access

  let query = supabase
    .from('document_submissions')
    .select('*, congregations(name)')
    .eq('year', year)
    .order('submitted_at', { ascending: false })

  if (profile?.diocese_id && !access.master) {
    query = query.eq('diocese_id', profile.diocese_id)
  }

  const { data } = await query

  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    congregation_name: (row.congregations as { name: string } | null)?.name || 'Ismeretlen',
  })) as DocumentSubmission[]
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: státusz frissítés
// ---------------------------------------------------------------------------

export async function updateSubmissionStatus(
  submissionId: string,
  newStatus: DocumentStatus,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.esperes && !access.admin && !access.master) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { supabase } = access
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'received') {
    updates.received_at = now
    updates.received_by = access.user.id
  } else if (newStatus === 'reviewed') {
    updates.reviewed_at = now
    updates.reviewed_by = access.user.id
  } else if (newStatus === 'finalized') {
    updates.finalized_at = now
    updates.finalized_by = access.user.id
  }

  const { error } = await supabase
    .from('document_submissions')
    .update(updates)
    .eq('id', submissionId)

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/dashboard-kerulet')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Egyházmegyei szintű: továbbítás kerületnek
// ---------------------------------------------------------------------------

export async function forwardToKerulet(
  submissionId: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.esperes && !access.admin && !access.master) {
    return { error: 'Nincs jogosultsága.' }
  }

  const { supabase } = access

  const { error } = await supabase
    .from('document_submissions')
    .update({
      forwarded_to_kerulet: true,
      forwarded_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('status', 'finalized')

  if (error) return { error: `Hiba: ${error.message}` }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/dashboard-kerulet')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Kerületi szintű: csak véglegesített + továbbított dokumentumok
// ---------------------------------------------------------------------------

export async function getKeruletSubmissions(year: number): Promise<DocumentSubmission[]> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return []

  const { supabase } = access

  const { data } = await supabase
    .from('document_submissions')
    .select('*, congregations(name)')
    .eq('year', year)
    .eq('forwarded_to_kerulet', true)
    .eq('status', 'finalized')
    .order('congregation_id')

  return (data || []).map((row: Record<string, unknown>) => ({
    ...row,
    congregation_name: (row.congregations as { name: string } | null)?.name || 'Ismeretlen',
  })) as DocumentSubmission[]
}
