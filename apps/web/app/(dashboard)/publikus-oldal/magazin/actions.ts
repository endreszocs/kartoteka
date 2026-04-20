'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import {
  publicMagazineSchema,
  publicMagazineIssueSchema,
  type PublicMagazineInput,
  type PublicMagazineIssueInput,
} from '@/lib/validations/public-site'

interface ActionResult {
  success?: boolean
  error?: string
  id?: string
}

export async function saveMagazine(input: PublicMagazineInput): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
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
): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const parsed = publicMagazineIssueSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') }
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

  if (parsed.data.id) {
    const { error } = await access.supabase
      .from('public_magazine_issues')
      .update(payload)
      .eq('id', parsed.data.id)
      .eq('congregation_id', congregationId)
    if (error) return { error: error.message }
  } else {
    const { error } = await access.supabase
      .from('public_magazine_issues')
      .insert(payload)
    if (error) return { error: error.message }
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

  return { success: true }
}

export async function deleteMagazineIssue(id: string): Promise<ActionResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  const congregationId = access.effectiveCongregationId
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { error } = await access.supabase
    .from('public_magazine_issues')
    .delete()
    .eq('id', id)
    .eq('congregation_id', congregationId)
  if (error) return { error: error.message }

  revalidatePath('/publikus-oldal/magazin')
  return { success: true }
}
