'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
// 2026-08-15 (egyházmegyei szint, S4): a hatókör a KÖZÖS module-scope helperből
// jön — a sablonok scope-oszloposak (iktato_sablonok.congregation_id VAGY
// diocese_id VAGY — 2026-08-17, kerületi S5 — district_id), minden lekérdezés
// `.eq(ctx.scopeCol, ctx.scopeId)`-vel szűr.
import {
  getModuleScopeContext,
  moduleWriteBlock,
  type ModuleScope,
  type ModuleScopeContext,
} from '@/lib/auth/module-scope'
// 2026-08-10: közös, pointer-tudatos iktatószám-előnézet (lásd a modul doksiját).
import { computeSequencePreview } from '@/lib/filing/sequence-preview'
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

/** A régi gyülekezet-feloldó scope-tudatos utódja — ctx === null: nincs hatókör. */
async function getScopeCtx(): Promise<{ ctx: ModuleScopeContext | null }> {
  const res = await getModuleScopeContext()
  if ('error' in res) return { ctx: null }
  return { ctx: res }
}

/**
 * A FELSŐ SZINTŰ hatókör törzsadat-táblája (a hivatal székhelyéhez).
 *
 * 'congregation' esetén dob: a gyülekezeti ág NEM ide tartozik (ott az
 * adrlocality-alapú, nyelvhelyes helység-feloldás fut) — ha valaki egyszer
 * mégis idehívja, HANGOS hibát kapjon, ne a `congregations` táblát „találjuk el"
 * véletlenül. A `default: never` ág pedig egy jövőbeli negyedik szintnél ad
 * fordítási hibát, néma rossz-tábla-olvasás helyett.
 */
function felsoSzintTorzsTabla(scope: ModuleScope): 'dioceses' | 'districts' {
  switch (scope) {
    case 'diocese':
      return 'dioceses'
    case 'district':
      return 'districts'
    case 'congregation':
      throw new Error('A gyülekezeti hatókörnek nincs felső szintű törzsadat-táblája.')
    default: {
      const _nemKezelt: never = scope
      throw new Error(`Ismeretlen modul-hatókör: ${String(_nemKezelt)}`)
    }
  }
}

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
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }

  let query = ctx.supabase
    .from('iktato_sablonok')
    .select('*')
    .eq(ctx.scopeCol, ctx.scopeId)
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
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }

  const { data, error } = await ctx.supabase
    .from('iktato_sablonok')
    .select('*')
    .eq('id', id)
    .eq(ctx.scopeCol, ctx.scopeId)
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

  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return blocked
  const { supabase } = ctx

  const payload = {
    // 2026-08-15 (S4): scope-oszlop dinamikusan — a CHECK
    // (iktato_sablonok_pontosan_egy_scope) őrzi az integritást.
    [ctx.scopeCol]: ctx.scopeId,
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
      .eq(ctx.scopeCol, ctx.scopeId)

    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    revalidatePath('/iktato')
    return { success: true, id: input.id }
  }

  // INSERT
  const { data, error } = await supabase
    .from('iktato_sablonok')
    .insert({ ...payload, created_by: ctx.userId })
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
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return blocked

  const { error } = await ctx.supabase
    .from('iktato_sablonok')
    .update({ aktiv: false, deleted: true })
    .eq('id', id)
    .eq(ctx.scopeCol, ctx.scopeId)

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
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return blocked
  const { supabase } = ctx

  const { data: current } = await supabase
    .from('iktato_sablonok')
    .select('aktiv')
    .eq('id', id)
    .eq(ctx.scopeCol, ctx.scopeId)
    .maybeSingle()

  if (!current) return { error: 'A sablon nem található.' }

  const { error } = await supabase
    .from('iktato_sablonok')
    .update({ aktiv: !current.aktiv })
    .eq('id', id)
    .eq(ctx.scopeCol, ctx.scopeId)

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
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }
  const blocked = moduleWriteBlock(ctx)
  if (blocked) return blocked
  const { supabase } = ctx

  // Lekérjük a meglévő neveket
  const { data: existing } = await supabase
    .from('iktato_sablonok')
    .select('nev')
    .eq(ctx.scopeCol, ctx.scopeId)
    .eq('deleted', false)

  const existingNames = new Set((existing || []).map(t => t.nev))

  const newOnes = SEED_TEMPLATES.filter(s => !existingNames.has(s.nev))
  if (newOnes.length === 0) {
    return { success: true, inserted: 0, skipped: SEED_TEMPLATES.length }
  }

  const rows = newOnes.map((s, idx) => ({
    [ctx.scopeCol]: ctx.scopeId,
    nev: s.nev,
    tipus: s.tipus,
    leiras: s.leiras,
    tartalom: s.tartalom,
    aktiv: true,
    sorrend: idx,
    created_by: ctx.userId,
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
 * A következő iratszám ELŐNÉZETE, pl. "2026/152".
 *
 * 2026-08-10 (K4 iktatószám-diagnosztika #5): eddig ez volt a MÁSODIK, önálló
 * `MAX(sequence_number) + 1` implementáció (a másik az iktato/actions.ts-ben),
 * és mindkettő a SOROKAT olvasta, miközben a tényleges kiosztás a
 * `iktato_sequence_pointers` POINTER-ből dolgozik — egy sikertelen INSERT után
 * az előnézet tartósan alábecsülte a számot. Mostantól mindkettő ugyanazt a
 * pointer-tudatos, megosztott implementációt hívja
 * (lib/filing/sequence-preview → `GREATEST(pointer, MAX) + 1`).
 *
 * ⚠️ ELŐNÉZET, nem foglalás: a végleges számot mindig a `saveFilingEntry`
 * adja vissza (`sequenceNumber`), és eltérés esetén AZ a mérvadó.
 */
export async function generateNextIratszam(
  year: number,
): Promise<{ iratszam?: string; sequenceNumber?: number; error?: string }> {
  const { ctx } = await getScopeCtx()
  if (!ctx) return { error: 'Nincs aktív gyülekezet, egyházmegye vagy egyházkerület.' }

  const preview = await computeSequencePreview(ctx.supabase, { col: ctx.scopeCol, id: ctx.scopeId }, year)
  return { iratszam: preview.iratszam, sequenceNumber: preview.sequenceNumber }
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

  // 2026-08-15 (S4): MEGYEI módban a {{gyulekezet}} placeholder az egyházmegye
  // hivatalos neve, a {{helyseg}} az esperesi hivatal települése (dioceses
  // törzsadat) — a sablon-szöveg így megyei iratokon is helyesen töltődik.
  //
  // 2026-08-17 (kerületi S5): a KERÜLET ugyanezt kapja a `districts` törzsadatból
  // (a püspöki hivatal települése). A kapu `!== 'congregation'`, mert amit ez az
  // ág megkerül — a congregations-join, az adrlocality-alapú helység-feloldás —
  // a GYÜLEKEZETI szint sajátossága. A régi `=== 'diocese'` alakkal a kerületi
  // felhasználó némán a gyülekezeti ágra esett volna: ott a
  // `profile.congregation_id` üres, tehát a {{gyulekezet}} és a {{helyseg}}
  // ÜRESEN maradt volna egy kiállított hivatalos levélen.
  const { ctx } = await getScopeCtx()
  if (ctx && ctx.scope !== 'congregation') {
    // A tábla-választás exhaustive (`default: never`): a két törzsadat-tábla
    // oszlopneve azonos (`cim_telepules`), a NEVÜK viszont nem — egy néma rossz
    // tábla itt IDEGEN SZINT települését írná a keltezés-sorba.
    const torzsTabla = felsoSzintTorzsTabla(ctx.scope)
    let helysegFelso = ''
    const { data: sor } = await supabase
      .from(torzsTabla)
      .select('cim_telepules')
      .eq('id', ctx.scopeId)
      .maybeSingle()
    helysegFelso = ((sor as { cim_telepules: string | null } | null)?.cim_telepules || '').trim()
    return {
      data: {
        gyulekezet: ctx.scopeName || '',
        lelkipasztor,
        helyseg: helysegFelso,
      },
    }
  }

  // Keltezés helysége (TELEPÜLÉS). 2026-07-25 (F8e): korábban a `cim` mezőt
  // olvastuk, ami az UTCÁT tárolja — így minden régi sablon {{helyseg}}
  // placeholdere utcanevet kapott. A helyes forrás a strukturált
  // adrlocality.name_hu (a getCongregationHeader mintája), tartalék a
  // szabad szöveges `varos`.
  let helyseg = ''
  if (profile?.congregation_id) {
    const { data: cong } = await supabase
      .from('congregations')
      .select('varos, helyseg:adrlocality!adrlocality_id(name_hu, name_ro)')
      .eq('id', profile.congregation_id)
      .maybeSingle()
    type NevPar = { name_hu: string | null; name_ro: string | null } | null
    const row = cong as { varos: string | null; helyseg: NevPar | NevPar[] } | null
    const hely = Array.isArray(row?.helyseg) ? row?.helyseg[0] ?? null : row?.helyseg ?? null
    helyseg = (hely?.name_hu || row?.varos || '').trim()
  }

  return {
    data: {
      gyulekezet: congregationName || '',
      lelkipasztor,
      helyseg,
    },
  }
}
