'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  publicMagazineSchema,
  publicMagazineIssueSchema,
  type PublicMagazineInput,
  type PublicMagazineIssueInput,
} from '@/lib/validations/public-site'
import { canAccessPublicSiteAdmin } from '@/lib/public-site/admin-access'
import { cleanupMagazineIssueUploads } from '@/app/(dashboard)/publikus-oldal/upload-actions'

interface ActionResult {
  success?: boolean
  error?: string
  warning?: string
  id?: string
}

type MagazineIssueOperation = 'create' | 'update'

export async function saveMagazine(input: PublicMagazineInput): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod a magazin szerkesztéséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const parsed = publicMagazineSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const payload = {
    congregation_id: congregationId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    cover_image_url: parsed.data.cover_image_url || null,
  }

  if (parsed.data.id) {
    const { error } = await access.supabase
      .from('public_magazines')
      .update(payload)
      .eq('id', parsed.data.id)
      .eq('congregation_id', congregationId)
    if (error) return { error: error.message }
    revalidatePath('/publikus-oldal/magazin')
    return { success: true, id: parsed.data.id }
  }

  const { data, error } = await access.supabase
    .from('public_magazines')
    .insert(payload)
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/publikus-oldal/magazin')
  return { success: true, id: data.id }
}

export async function saveMagazineIssue(
  input: PublicMagazineIssueInput,
  operation: MagazineIssueOperation,
): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod a lapszám szerkesztéséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const parsed = publicMagazineIssueSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const { data: ownedMagazine, error: magazineError } = await access.supabase
    .from('public_magazines')
    .select('id')
    .eq('id', parsed.data.magazine_id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (magazineError || !ownedMagazine) {
    return { error: 'A kiválasztott magazin nem ehhez a gyülekezethez tartozik.' }
  }

  const payload = {
    magazine_id: parsed.data.magazine_id,
    congregation_id: congregationId,
    issue_number: parsed.data.issue_number,
    title: parsed.data.title || null,
    cover_image_url: parsed.data.cover_image_url || null,
    pdf_url: parsed.data.pdf_url,
    published_at: parsed.data.published_at || null,
    notes: parsed.data.notes || null,
    is_published: parsed.data.is_published,
  }

  const issueId = parsed.data.id
  if (!issueId) return { error: 'A lapszám azonosítója kötelező.' }

  if (operation === 'create') {
    // Az új űrlap előre létrehozott UUID-je köti össze a rekordot a már
    // feltöltött, gyülekezet/lapszám prefixbe helyezett fájlokkal.
    const { error } = await access.supabase
      .from('public_magazine_issues')
      .insert({ id: issueId, ...payload })
    if (error) return { error: error.message }
  } else if (operation === 'update') {
    // Frissítés soha nem válhat implicit INSERT-té: egy törölt vagy közben
    // eltűnt rekordot stale kliensállapot nem hozhat vissza.
    const { data: updatedIssue, error } = await access.supabase
      .from('public_magazine_issues')
      .update(payload)
      .eq('id', issueId)
      .eq('congregation_id', congregationId)
      .select('id')
      .maybeSingle()
    if (error) return { error: error.message }
    if (!updatedIssue) {
      return { error: 'A frissítendő lapszám már nem található.' }
    }
  } else {
    return { error: 'Érvénytelen lapszámművelet.' }
  }

  revalidatePath('/publikus-oldal/magazin')

  // Publikus oldal frissítése
  const { data: site } = await access.supabase
    .from('public_sites')
    .select('slug')
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (site) {
    revalidatePath(`/gy/${site.slug}/magazin`)
  }

  return { success: true, id: issueId }
}

export async function deleteMagazineIssue(id: string): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canAccessPublicSiteAdmin(access, 'write')) {
    return { error: 'Nincs jogosultságod a lapszám törléséhez.' }
  }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: site } = await access.supabase
    .from('public_sites')
    .select('slug')
    .eq('congregation_id', congregationId)
    .maybeSingle()

  // Először a tenant-szűkített adatbázisrekord tűnik el. Így sem egy
  // részleges Storage-takarítás, sem egy stale kliens nem hagyhat a publikus
  // magazinban törött PDF- vagy borítóhivatkozást. A save update-ága nem végez
  // implicit INSERT-et, ezért a törölt rekord nem támasztható fel.
  const { data: deletedIssue, error } = await access.supabase
    .from('public_magazine_issues')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!deletedIssue) {
    return { error: 'A törlendő lapszám nem található ebben a gyülekezetben.' }
  }

  revalidatePath('/publikus-oldal/magazin')
  if (site?.slug) revalidatePath(`/gy/${site.slug}/magazin`)

  // A rekord törlése után best-effort takarítunk. Ha a Storage átmenetileg
  // hibázik, a lapszám akkor sem marad publikusan listázva; az admin figyelmeztetést
  // kap, a gyülekezeti adatok integritása pedig változatlanul megmarad.
  try {
    const cleanupResult = await cleanupMagazineIssueUploads(id)
    if (cleanupResult.error) {
      return {
        success: true,
        warning: `${cleanupResult.error} A lapszám a nyilvános oldalról már eltűnt.`,
      }
    }
  } catch {
    return {
      success: true,
      warning:
        'A lapszám a nyilvános oldalról eltűnt, de a hozzá tartozó fájlok takarítása nem fejeződött be.',
    }
  }

  return { success: true }
}
