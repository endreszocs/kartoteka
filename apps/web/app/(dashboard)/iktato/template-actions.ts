'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext, getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import {
  SEED_TEMPLATES,
  TEMPLATE_TYPES,
  type FilingTemplate,
  type TemplateType,
} from '@/lib/filing/templates'

/**
 * Iktató sablonok — CRUD server actions.
 *
 * A sablonok gyülekezeti szintűek (congregation_id), így minden
 * gyülekezet a sajátjain dolgozhat. A master admin globálisan kezelheti.
 *
 * Jogosultságok:
 *  - Olvasás: a gyülekezet minden user-e
 *  - Írás: a gyülekezet minden user-e (RLS szerint)
 *  - Törlés (soft): a gyülekezet minden user-e (deleted=true)
 *  - Hard delete: csak master admin
 */

// ─────────────────────────────────────────────────────────────────
// Validáció
// ─────────────────────────────────────────────────────────────────

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  nev: z.string().trim().min(1, 'A sablon neve kötelező').max(200),
  tipus: z.enum(TEMPLATE_TYPES),
  leiras: z.string().trim().max(500).nullable().optional(),
  tartalom: z.string().trim().min(1, 'A sablon tartalma kötelező'),
  aktiv: z.boolean().optional(),
  sorrend: z.number().int().nonnegative().optional(),
})

// ─────────────────────────────────────────────────────────────────
// Lekérdezések
// ─────────────────────────────────────────────────────────────────

export async function listFilingTemplates(
  opts?: { includeInactive?: boolean; tipus?: TemplateType },
): Promise<{ data?: FilingTemplate[]; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  let query = supabase
    .from('iktato_sablonok')
    .select('*')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .order('sorrend', { ascending: true })
    .order('nev', { ascending: true })

  if (!opts?.includeInactive) {
    query = query.eq('aktiv', true)
  }
  if (opts?.tipus) {
    query = query.eq('tipus', opts.tipus)
  }

  const { data, error } = await query
  if (error) return { error: `Lekérés sikertelen: ${error.message}` }
  return { data: (data || []) as FilingTemplate[] }
}

export async function getFilingTemplate(
  id: string,
): Promise<{ data?: FilingTemplate; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await supabase
    .from('iktato_sablonok')
    .select('*')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .eq('deleted', false)
    .maybeSingle()

  if (error) return { error: `Lekérés sikertelen: ${error.message}` }
  if (!data) return { error: 'A sablon nem található.' }
  return { data: data as FilingTemplate }
}

// ─────────────────────────────────────────────────────────────────
// CRUD — Mentés
// ─────────────────────────────────────────────────────────────────

export async function saveFilingTemplate(
  raw: unknown,
): Promise<{ success?: true; id?: string; error?: string }> {
  const parsed = templateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const payload = {
    congregation_id: congregationId,
    nev: input.nev.trim(),
    tipus: input.tipus,
    leiras: input.leiras?.trim() || null,
    tartalom: input.tartalom,
    aktiv: input.aktiv ?? true,
    sorrend: input.sorrend ?? 0,
  }

  if (input.id) {
    // UPDATE
    const { error } = await supabase
      .from('iktato_sablonok')
      .update(payload)
      .eq('id', input.id)
      .eq('congregation_id', congregationId)

    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    revalidatePath('/iktato')
    return { success: true, id: input.id }
  }

  // INSERT
  const { data, error } = await supabase
    .from('iktato_sablonok')
    .insert({ ...payload, created_by: user.id })
    .select('id')
    .single()

  if (error) return { error: `Létrehozás sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true, id: data.id }
}

// ─────────────────────────────────────────────────────────────────
// Soft delete — aktiv=false + deleted=true
// ─────────────────────────────────────────────────────────────────

export async function deleteFilingTemplate(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { error } = await supabase
    .from('iktato_sablonok')
    .update({ aktiv: false, deleted: true })
    .eq('id', id)
    .eq('congregation_id', congregationId)

  if (error) return { error: `Törlés sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Toggle aktív
// ─────────────────────────────────────────────────────────────────

export async function toggleFilingTemplateActive(
  id: string,
): Promise<{ success?: true; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: current } = await supabase
    .from('iktato_sablonok')
    .select('aktiv')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  if (!current) return { error: 'A sablon nem található.' }

  const { error } = await supabase
    .from('iktato_sablonok')
    .update({ aktiv: !current.aktiv })
    .eq('id', id)
    .eq('congregation_id', congregationId)

  if (error) return { error: `Frissítés sikertelen: ${error.message}` }
  revalidatePath('/iktato')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// Seed — alapértelmezett sablonok betöltése egy gyülekezethez
// ─────────────────────────────────────────────────────────────────

/**
 * Az alapértelmezett sablonokat (SEED_TEMPLATES) beszúrja az aktív
 * gyülekezet iktato_sablonok táblájába. Ha ugyanazon a néven már
 * létezik sablon, kihagyja (duplikációt elkerüli).
 *
 * Csak admin / master / vagy nem jelöltelen csatlakozású user hívhatja.
 */
export async function seedDefaultFilingTemplates(): Promise<{
  success?: true
  inserted?: number
  skipped?: number
  error?: string
}> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Lekérjük a meglévő neveket
  const { data: existing } = await supabase
    .from('iktato_sablonok')
    .select('nev')
    .eq('congregation_id', congregationId)
    .eq('deleted', false)

  const existingNames = new Set((existing || []).map(t => t.nev))

  const newOnes = SEED_TEMPLATES.filter(s => !existingNames.has(s.nev))
  if (newOnes.length === 0) {
    return { success: true, inserted: 0, skipped: SEED_TEMPLATES.length }
  }

  const rows = newOnes.map((s, idx) => ({
    congregation_id: congregationId,
    nev: s.nev,
    tipus: s.tipus,
    leiras: s.leiras,
    tartalom: s.tartalom,
    aktiv: true,
    sorrend: idx,
    created_by: user.id,
  }))

  const { error } = await supabase.from('iktato_sablonok').insert(rows)
  if (error) return { error: `Seed sikertelen: ${error.message}` }

  revalidatePath('/iktato')
  return {
    success: true,
    inserted: newOnes.length,
    skipped: SEED_TEMPLATES.length - newOnes.length,
  }
}

// ─────────────────────────────────────────────────────────────────
// Iratszám generálás — az `iktato` táblából lekéri a következő sorszámot
// ─────────────────────────────────────────────────────────────────

/**
 * Következő iratszám generálása pl. "2025/152" formában, az iktató
 * tábla jelenlegi max sequence_number + 1 alapján.
 */
export async function generateNextIratszam(
  year: number,
): Promise<{ iratszam?: string; error?: string }> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data } = await supabase
    .from('iktato')
    .select('sequence_number')
    .eq('congregation_id', congregationId)
    .eq('year', year)
    .order('sequence_number', { ascending: false })
    .limit(1)

  const next = (data?.[0]?.sequence_number || 0) + 1
  return { iratszam: `${year}/${next}` }
}

// ─────────────────────────────────────────────────────────────────
// Automatikus placeholder kontextus (gyülekezet, lelkipásztor, stb.)
// ─────────────────────────────────────────────────────────────────

export async function getAutoPlaceholderContext(): Promise<{
  data?: { gyulekezet: string; lelkipasztor: string; helyseg: string }
  error?: string
}> {
  const { supabase, user, congregationName, profile } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Lelkipásztor neve a `profile.full_name`-ből
  const lelkipasztor = profile?.full_name || ''

  // Helység a congregations táblából
  let helyseg = ''
  if (profile?.congregation_id) {
    const { data: cong } = await supabase
      .from('congregations')
      .select('cim')
      .eq('id', profile.congregation_id)
      .maybeSingle()
    helyseg = (cong?.cim as string) || ''
  }

  return {
    data: {
      gyulekezet: congregationName || '',
      lelkipasztor,
      helyseg,
    },
  }
}
