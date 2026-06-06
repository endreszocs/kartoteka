'use server'

/**
 * Dispoziție de plată / încasare — server akciók.
 *
 *  - plata    (kifizetési rendelvény) → mentéskor automatikusan KIADÁST könyvel
 *  - incasare (bevételezési rendelvény) → mentéskor automatikusan BEVÉTELT könyvel
 *
 * Két mód:
 *  1. Önálló kitöltés → új készpénzes kassza-tételt is létrehoz.
 *  2. Meglévő készpénzes kassza-tételből generálás (fromKasszaId) → NEM könyvel
 *     újra, csak hozzárendeli a számozott bizonylatot.
 *
 * Sorszámozás: gyülekezetenként + évente, típusonként (dp_plata / dp_incasare).
 * Csak congregation scope.
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getFinanceScopeContext, isYearFinalized } from '@/lib/auth/finance-scope'

export type DispozitieTipus = 'plata' | 'incasare'

export interface SaveDispozitieInput {
  tipus: DispozitieTipus
  date: string // yyyy-mm-dd
  name: string
  tisztseg: string
  amount: number
  cel: string
  ciTipus?: string
  ciSerie?: string
  ciNr?: string
  /** plata → id_kiadascel, incasare → id_befizetescel */
  categoryId: number
  /** ha meglévő készpénzes kassza-tételből generáljuk: annak az id-je (nem könyvel újra) */
  fromKasszaId?: number | null
}

export interface DispozitieKasszaOption {
  id: number
  datum: string
  osszeg: number
  partner: string
  iratszam: string
}

const tipusToSeq = (t: DispozitieTipus) => (t === 'plata' ? 'dp_plata' : 'dp_incasare')

/** A következő sorszám MEGTEKINTÉSE (nem foglalja le). */
export async function getNextDispozitieNumber(tipus: DispozitieTipus, year: number): Promise<number> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return 1
  const { data } = await ctx.supabase
    .from('penzugyi_bizonylat_sorszam')
    .select('utolso_szam')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('tipus', tipusToSeq(tipus))
    .maybeSingle()
  const last = (data as { utolso_szam?: number } | null)?.utolso_szam ?? 0
  return last + 1
}

/** Készpénzes kassza-tételek, amelyekhez még NINCS dispozitie — generáláshoz. */
export async function listCashTransactionsForDispozitie(
  tipus: DispozitieTipus,
  year: number,
): Promise<DispozitieKasszaOption[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []

  const table = tipus === 'plata' ? 'kiadas' : 'befizetes'
  const partnerCol = tipus === 'plata' ? 'kedvezmenyzett' : 'forrasa'

  const { data } = await ctx.supabase
    .from(table)
    .select(`id, datum, osszeg, iratszam, ${partnerCol}`)
    .eq('congregation_id', ctx.scopeId)
    .eq('deleted', false)
    .is('dispozitie_id', null)
    .ilike('irattipus', '%észpénz%')
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
    .order('datum', { ascending: false })
    .limit(200)

  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    datum: String(r.datum).slice(0, 10),
    osszeg: Number(r.osszeg) || 0,
    partner: String(r[partnerCol] || ''),
    iratszam: String(r.iratszam || ''),
  }))
}

export interface DispozitieListItem {
  id: string
  tipus: DispozitieTipus
  sorszam: number
  datum: string
  nev: string
  osszeg: number
}

/** Mentett dispozitiók listája (újranyomtatáshoz). */
export async function listDispozitiok(year: number): Promise<DispozitieListItem[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('dispozitie')
    .select('id, tipus, sorszam, datum, nev, osszeg')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('datum', { ascending: true })
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    tipus: r.tipus as DispozitieTipus,
    sorszam: Number(r.sorszam),
    datum: String(r.datum).slice(0, 10),
    nev: String(r.nev || ''),
    osszeg: Number(r.osszeg) || 0,
  }))
}

export interface DispozitieReprintData {
  tipus: DispozitieTipus
  sorszam: number
  date: string
  name: string
  tisztseg: string
  amount: number
  cel: string
  ciTipus: string
  ciSerie: string
  ciNr: string
}

/** Egy mentett dispozitie adatai a hű újranyomtatáshoz. */
export async function getDispozitieForReprint(id: string): Promise<DispozitieReprintData | null> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return null
  const { data } = await ctx.supabase
    .from('dispozitie')
    .select('tipus, sorszam, datum, nev, tisztseg, osszeg, cel, ci_tipus, ci_serie, ci_nr')
    .eq('id', id)
    .eq('congregation_id', ctx.scopeId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    tipus: r.tipus as DispozitieTipus,
    sorszam: Number(r.sorszam),
    date: String(r.datum).slice(0, 10),
    name: String(r.nev || ''),
    tisztseg: String(r.tisztseg || ''),
    amount: Number(r.osszeg) || 0,
    cel: String(r.cel || ''),
    ciTipus: String(r.ci_tipus || ''),
    ciSerie: String(r.ci_serie || ''),
    ciNr: String(r.ci_nr || ''),
  }
}

export interface DispozitieReprintOption {
  id: string
  label: string
  data: DispozitieReprintData
}

/** Mentett dispozitiók teljes adata + címke a Nyomtatási központ újranyomtatásához. */
export async function listDispozitieReprint(year: number): Promise<DispozitieReprintOption[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('dispozitie')
    .select('id, tipus, sorszam, datum, nev, tisztseg, osszeg, cel, ci_tipus, ci_serie, ci_nr')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('datum', { ascending: true })
  return ((data || []) as Record<string, unknown>[]).map((r) => {
    const datum = String(r.datum).slice(0, 10)
    const tipus = r.tipus as DispozitieTipus
    return {
      id: String(r.id),
      label: `${tipus === 'plata' ? 'Plată' : 'Încasare'} #${r.sorszam} · ${datum} · ${String(r.nev || '—')}`,
      data: {
        tipus,
        sorszam: Number(r.sorszam),
        date: datum,
        name: String(r.nev || ''),
        tisztseg: String(r.tisztseg || ''),
        amount: Number(r.osszeg) || 0,
        cel: String(r.cel || ''),
        ciTipus: String(r.ci_tipus || ''),
        ciSerie: String(r.ci_serie || ''),
        ciNr: String(r.ci_nr || ''),
      },
    }
  })
}

export async function saveDispozitie(input: SaveDispozitieInput): Promise<
  { success: true; sorszam: number; dispozitieId: string } | { error: string }
> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation') {
    return { error: 'A dispoziție csak gyülekezeti módban érhető el.' }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Érvénytelen dátum.' }
  if (!input.name.trim()) return { error: 'A név kötelező.' }
  if (!(Number(input.amount) > 0)) return { error: 'Az összeg pozitív szám kell legyen.' }
  if (!input.fromKasszaId && !input.categoryId) {
    return { error: 'Válassz kategóriát (a könyveléshez).' }
  }

  const year = Number(input.date.slice(0, 4))
  if (await isYearFinalized(ctx, year)) {
    return { error: `A ${year}. év számadása már le van zárva — dispoziție nem rögzíthető.` }
  }

  // 1) Sorszám lefoglalása
  const { data: szamData, error: szamErr } = await ctx.supabase.rpc('next_bizonylat_szam', {
    p_congregation_id: ctx.scopeId,
    p_ev: year,
    p_tipus: tipusToSeq(input.tipus),
  })
  if (szamErr) return { error: `Sorszám hiba: ${szamErr.message}` }
  const sorszam = Number(szamData)

  // 2) Dispoziție fejléc beszúrása
  const { data: dispRow, error: dispErr } = await ctx.supabase
    .from('dispozitie')
    .insert([
      {
        congregation_id: ctx.scopeId,
        ev: year,
        tipus: input.tipus,
        sorszam,
        datum: input.date,
        nev: input.name.trim(),
        tisztseg: input.tisztseg?.trim() || null,
        osszeg: Number(input.amount),
        cel: input.cel?.trim() || null,
        ci_tipus: input.ciTipus?.trim() || null,
        ci_serie: input.ciSerie?.trim() || null,
        ci_nr: input.ciNr?.trim() || null,
        id_kiadascel: input.tipus === 'plata' ? input.categoryId : null,
        id_befizetescel: input.tipus === 'incasare' ? input.categoryId : null,
        created_by: ctx.userId,
      },
    ])
    .select('id')
    .single()
  if (dispErr) return { error: `Dispoziție mentés hiba: ${dispErr.message}` }
  const dispozitieId = (dispRow as { id: string }).id

  const docNum = `DP-${input.tipus === 'plata' ? 'P' : 'I'}${sorszam}/${year}`

  // 3a) Meglévő kassza-tételhez kötés — NEM könyvelünk újra
  if (input.fromKasszaId) {
    const table = input.tipus === 'plata' ? 'kiadas' : 'befizetes'
    const idCol = input.tipus === 'plata' ? 'kiadas_id' : 'befizetes_id'
    const { error: linkErr } = await ctx.supabase
      .from(table)
      .update({ dispozitie_id: dispozitieId })
      .eq('id', input.fromKasszaId)
      .eq('congregation_id', ctx.scopeId)
    if (linkErr) {
      await ctx.supabase.from('dispozitie').update({ deleted: true }).eq('id', dispozitieId)
      return { error: `Kassza-tétel összerendelés hiba: ${linkErr.message}` }
    }
    await ctx.supabase.from('dispozitie').update({ [idCol]: input.fromKasszaId }).eq('id', dispozitieId)
    revalidatePath('/penzugy')
    return { success: true, sorszam, dispozitieId }
  }

  // 3b) Önálló → új készpénzes kassza-tétel könyvelése
  if (input.tipus === 'plata') {
    const payload = {
      osszeg: Number(input.amount),
      datum: input.date,
      id_kiadascel: input.categoryId,
      kedvezmenyzett: input.name.trim(),
      iratszam: docNum,
      irattipus: 'Készpénz',
      megjegyzes: `Dispoziție de plată #${sorszam}/${year} — ${input.cel || ''}`.trim(),
      deleted: false,
      congregation_id: ctx.scopeId,
      nyugta: docNum,
      xkey: randomUUID(),
      atvevo: input.name.trim(),
      userid: ctx.userId,
      dispozitie_id: dispozitieId,
    }
    const { data: kRow, error: kErr } = await ctx.supabase.from('kiadas').insert([payload]).select('id').single()
    if (kErr) {
      await ctx.supabase.from('dispozitie').update({ deleted: true }).eq('id', dispozitieId)
      return { error: `Kiadás könyvelése sikertelen: ${kErr.message}` }
    }
    await ctx.supabase.from('dispozitie').update({ kiadas_id: Number((kRow as { id: number }).id) }).eq('id', dispozitieId)
  } else {
    const payload = {
      osszeg: Number(input.amount),
      datum: input.date,
      id_befizetescel: input.categoryId,
      forrasa: input.name.trim(),
      iratszam: docNum,
      irattipus: 'Készpénz',
      fizetettev: year,
      megjegyzes: `Dispoziție de încasare #${sorszam}/${year} — ${input.cel || ''}`.trim(),
      deleted: false,
      congregation_id: ctx.scopeId,
      nyugta: docNum,
      xkey: randomUUID(),
      csalad: false,
      userid: ctx.userId,
      dispozitie_id: dispozitieId,
    }
    const { data: bRow, error: bErr } = await ctx.supabase.from('befizetes').insert([payload]).select('id').single()
    if (bErr) {
      await ctx.supabase.from('dispozitie').update({ deleted: true }).eq('id', dispozitieId)
      return { error: `Bevétel könyvelése sikertelen: ${bErr.message}` }
    }
    await ctx.supabase.from('dispozitie').update({ befizetes_id: Number((bRow as { id: number }).id) }).eq('id', dispozitieId)
  }

  revalidatePath('/penzugy')
  return { success: true, sorszam, dispozitieId }
}
