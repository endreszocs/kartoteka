'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { supportIdea } from '@/app/misszios-muhely/community-actions'

async function getProfile() {
  const access = await getEffectiveAccessContext()
  const { supabase, user, fullName, congregationName, admin } = access
  return {
    supabase,
    userId: user?.id || null,
    fullName,
    congregationName: congregationName || '',
    admin,
  }
}

// ── Kategóriák ──

export async function getCategories() {
  const { supabase } = await getProfile()
  const { data } = await supabase.from('mm_kategoriak').select('*').order('sorrend')
  return (data || []) as { id: number; nev: string; ikon: string; szin: string; leiras: string | null; sorrend: number }[]
}

// ── Segédanyagok ──

export async function getMaterials() {
  const { supabase } = await getProfile()
  const { data } = await supabase.from('mm_segedanyagok')
    .select('*, mm_segedanyag_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
    .eq('aktiv', true)
    .order('created_at', { ascending: false })

  return (data || []) as unknown as {
    id: string; cim: string; leiras: string | null; forras_url: string | null; forras_nev: string | null
    formatum: string; feltolto_nev: string | null; feltolto_gyulekezet: string | null
    letoltes_szam: number; csatolmany_url: string | null; created_at: string
    mm_segedanyag_kategoriak: { kategoria_id: number; mm_kategoriak: { nev: string; ikon: string; szin: string } | null }[]
  }[]
}

export async function saveMaterial(data: { cim: string; leiras: string; kategoriaIds: number[]; forrasUrl?: string; formatum?: string }) {
  const { supabase, userId, fullName, congregationName } = await getProfile()
  if (!userId) return { error: 'Nincs bejelentkezve.' }
  if (!data.cim.trim()) return { error: 'A cím kötelező.' }

  const { data: inserted, error } = await supabase.from('mm_segedanyagok').insert({
    cim: data.cim.trim(), leiras: data.leiras.trim() || null,
    feltolto_id: userId, feltolto_nev: fullName, feltolto_gyulekezet: congregationName,
    forras_url: data.forrasUrl || null, formatum: data.formatum || 'link', aktiv: true,
  }).select('id').single()

  if (error) return { error: error.message }
  if (inserted && data.kategoriaIds.length > 0) {
    await supabase.from('mm_segedanyag_kategoriak').insert(data.kategoriaIds.map(k => ({ segedanyag_id: inserted.id, kategoria_id: k })))
  }

  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function deleteMaterial(id: string) {
  const { supabase, userId, admin } = await getProfile()
  if (!userId) return { error: 'Nincs bejelentkezve.' }

  const { data: material, error: materialError } = await supabase
    .from('mm_segedanyagok')
    .select('id, feltolto_id')
    .eq('id', id)
    .maybeSingle()

  if (materialError) return { error: materialError.message }
  if (!material) return { error: 'A segédanyag nem található.' }
  if (!admin && material.feltolto_id !== userId) {
    return { error: 'Nincs jogosultsága a segédanyag törléséhez.' }
  }

  const { error } = await supabase
    .from('mm_segedanyagok')
    .update({ aktiv: false })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/misszios-muhely')
  return { success: true }
}

// ── Ötletek ──

export async function getIdeas() {
  const { supabase } = await getProfile()
  const { data } = await supabase.from('mm_otletek')
    .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
    .eq('aktiv', true)
    .order('tamogatasok_szama', { ascending: false })

  return (data || []) as unknown as {
    id: string; cim: string; leiras: string; celcsoport: string; becsult_ido: string
    statusz: string; tamogatasok_szama: number; hozzaszolasok_szama: number
    otletgazda_nev: string | null; otletgazda_gyulekezet: string | null; created_at: string
    mm_otlet_kategoriak: { kategoria_id: number; mm_kategoriak: { nev: string; ikon: string; szin: string } | null }[]
  }[]
}

export async function saveIdea(data: { cim: string; leiras: string; kategoriaIds: number[]; celcsoport?: string; becsultIdo?: string }) {
  const { supabase, userId, fullName, congregationName } = await getProfile()
  if (!userId) return { error: 'Nincs bejelentkezve.' }
  if (!data.cim.trim() || !data.leiras.trim()) return { error: 'A cím és a leírás kötelező.' }

  const { data: inserted, error } = await supabase.from('mm_otletek').insert({
    cim: data.cim.trim(), leiras: data.leiras.trim(),
    celcsoport: data.celcsoport || 'Mindenki', becsult_ido: data.becsultIdo || '2-3 hónap',
    statusz: 'uj', otletgazda_id: userId, otletgazda_nev: fullName, otletgazda_gyulekezet: congregationName,
    aktiv: true, tamogatasok_szama: 0, csatlakozok_szama: 0, hozzaszolasok_szama: 0,
  }).select('id').single()

  if (error) return { error: error.message }
  if (inserted && data.kategoriaIds.length > 0) {
    await supabase.from('mm_otlet_kategoriak').insert(data.kategoriaIds.map(k => ({ otlet_id: inserted.id, kategoria_id: k })))
  }

  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function voteIdea(ideaId: string) {
  // Régi komponensek kompatibilitási útvonala: ugyanazt a versenybiztos,
  // DB-triggerrel őrzött akciót használja, mint az új Ötletasztal.
  return supportIdea(ideaId)
}
