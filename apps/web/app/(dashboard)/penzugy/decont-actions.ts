'use server'

/**
 * Decont (elszámolás) — server akciók.
 *
 * A decont az UTÓLAG előkerülő számlák hivatalos rögzítésére szolgál.
 * Mivel a könyvelés nem enged korábbi dátumra rögzíteni, a tételek az
 * AKTUÁLIS (decont) dátumra kerülnek könyvelésre `kiadas` rekordként —
 * a számla saját (régi) dátuma csak a nyomtatott dokumentumon jelenik meg.
 *
 * Sorszámozás: gyülekezetenként + évente 1-től (penzugyi_bizonylat_sorszam
 * tábla + next_bizonylat_szam RPC). Lásd:
 *   migration-docs/sql/2026-06-06-decont-dispozitie-sorszam.sql
 *
 * Csak congregation scope-on érhető el (a decont gyülekezeti bizonylat).
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getFinanceScopeContext, isYearFinalized } from '@/lib/auth/finance-scope'

export interface DecontItemInput {
  actNr: string
  actType: string
  actDate: string // a számla saját dátuma (csak dokumentum)
  issuer: string
  explanation: string
  amount: number
  id_kiadascel?: number | null
}

export interface SaveDecontInput {
  date: string // yyyy-mm-dd — könyvelési (decont) dátum
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  defaultCategoryId: number // alap kiadás-kategória (id_kiadascel)
  items: DecontItemInput[]
}

/** A következő decont-sorszám MEGTEKINTÉSE (nem foglalja le). */
export async function getNextDecontNumber(year: number): Promise<number> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return 1
  if (ctx.scope !== 'congregation') return 1
  const { data } = await ctx.supabase
    .from('penzugyi_bizonylat_sorszam')
    .select('utolso_szam')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('tipus', 'decont')
    .maybeSingle()
  const last = (data as { utolso_szam?: number } | null)?.utolso_szam ?? 0
  return last + 1
}

export interface DecontListItem {
  id: string
  sorszam: number
  datum: string
  elszamolo_nev: string
  osszkoltseg: number
}

/** Mentett decontok listája (újranyomtatáshoz). */
export async function listDeconts(year: number): Promise<DecontListItem[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('decont')
    .select('id, sorszam, datum, elszamolo_nev, osszkoltseg')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('sorszam', { ascending: true })
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    sorszam: Number(r.sorszam),
    datum: String(r.datum).slice(0, 10),
    elszamolo_nev: String(r.elszamolo_nev || ''),
    osszkoltseg: Number(r.osszkoltseg) || 0,
  }))
}

export interface DecontReprintData {
  sorszam: number
  date: string
  personName: string
  jelleg: string
  approvedBy: string
  advance: number
  items: Array<{ actNr: string; actType: string; actDate: string; issuer: string; explanation: string; amount: number }>
}

/** Egy mentett decont adatai a hű újranyomtatáshoz (a snapshot jsonb-ből). */
export async function getDecontForReprint(id: string): Promise<DecontReprintData | null> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return null
  const { data } = await ctx.supabase
    .from('decont')
    .select('sorszam, datum, elszamolo_nev, jovahagyta, jelleg, kapott_eloleg, tetelek')
    .eq('id', id)
    .eq('congregation_id', ctx.scopeId)
    .maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  const tetelek = Array.isArray(r.tetelek) ? (r.tetelek as Record<string, unknown>[]) : []
  return {
    sorszam: Number(r.sorszam),
    date: String(r.datum).slice(0, 10),
    personName: String(r.elszamolo_nev || ''),
    jelleg: String(r.jelleg || ''),
    approvedBy: String(r.jovahagyta || ''),
    advance: Number(r.kapott_eloleg) || 0,
    items: tetelek.map((t) => ({
      actNr: String(t.act_nr || ''),
      actType: String(t.act_type || ''),
      actDate: String(t.act_date || ''),
      issuer: String(t.issuer || ''),
      explanation: String(t.explanation || ''),
      amount: Number(t.amount) || 0,
    })),
  }
}

export interface DecontReprintOption {
  id: string
  label: string
  data: DecontReprintData
}

/** Mentett decontok teljes adata + címke a Nyomtatási központ újranyomtatásához. */
export async function listDecontReprint(year: number): Promise<DecontReprintOption[]> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx || ctx.scope !== 'congregation') return []
  const { data } = await ctx.supabase
    .from('decont')
    .select('id, sorszam, datum, elszamolo_nev, jovahagyta, jelleg, kapott_eloleg, osszkoltseg, tetelek')
    .eq('congregation_id', ctx.scopeId)
    .eq('ev', year)
    .eq('deleted', false)
    .order('sorszam', { ascending: true })
  const saved: DecontReprintOption[] = ((data || []) as Record<string, unknown>[]).map((r) => {
    const tetelek = Array.isArray(r.tetelek) ? (r.tetelek as Record<string, unknown>[]) : []
    const datum = String(r.datum).slice(0, 10)
    return {
      id: String(r.id),
      label: `#${r.sorszam} · ${datum} · ${String(r.elszamolo_nev || '—')}`,
      data: {
        sorszam: Number(r.sorszam),
        date: datum,
        personName: String(r.elszamolo_nev || ''),
        jelleg: String(r.jelleg || ''),
        approvedBy: String(r.jovahagyta || ''),
        advance: Number(r.kapott_eloleg) || 0,
        items: tetelek.map((t) => ({
          actNr: String(t.act_nr || ''),
          actType: String(t.act_type || ''),
          actDate: String(t.act_date || ''),
          issuer: String(t.issuer || ''),
          explanation: String(t.explanation || ''),
          amount: Number(t.amount) || 0,
        })),
      },
    }
  })

  // IMPORTÁLT decont-típusú tételek (irattípus „decont…") — külön decont rekord nélkül,
  // egy 1-soros elszámolásként megjelenítve/újranyomtatva.
  const { data: kiaDec } = await ctx.supabase
    .from('kiadas')
    .select('id, datum, osszeg, iratszam, kedvezmenyzett, atvevo, megjegyzes')
    .eq('congregation_id', ctx.scopeId)
    .eq('deleted', false)
    .ilike('irattipus', '%decont%')
    .gte('datum', `${year}-01-01`)
    .lte('datum', `${year}-12-31`)
    .order('datum', { ascending: true })
  const imported: DecontReprintOption[] = ((kiaDec || []) as Record<string, unknown>[]).map((r) => {
    const datum = String(r.datum).slice(0, 10)
    const name = String(r.kedvezmenyzett || r.atvevo || '—')
    const sorszam = Number(String(r.iratszam || '').replace(/\D/g, '')) || 0
    const explanation = String(r.megjegyzes || '')
    return {
      id: `imp-k-${r.id}`,
      label: `#${sorszam || '—'} · ${datum} · ${name} · importált`,
      data: {
        sorszam,
        date: datum,
        personName: name,
        jelleg: '',
        approvedBy: '',
        advance: 0,
        items: [
          {
            actNr: String(r.iratszam || ''),
            actType: 'Decont',
            actDate: datum,
            issuer: name,
            explanation,
            amount: Number(r.osszeg) || 0,
          },
        ],
      },
    }
  })

  return [...saved, ...imported]
}

export async function saveDecont(input: SaveDecontInput): Promise<
  { success: true; sorszam: number; decontId: string } | { error: string }
> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation') {
    return { error: 'A decont csak gyülekezeti módban érhető el.' }
  }

  // Alap-validáció
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Érvénytelen dátum.' }
  if (!input.personName.trim()) return { error: 'Az elszámoló neve kötelező.' }
  if (!input.defaultCategoryId) return { error: 'Válassz kiadás-kategóriát.' }

  const items = (input.items || []).filter(
    (r) => Number(r.amount) > 0 && (r.explanation.trim() || r.issuer.trim() || r.actNr.trim()),
  )
  if (items.length === 0) return { error: 'Legalább egy érvényes tétel szükséges.' }

  const year = Number(input.date.slice(0, 4))
  if (await isYearFinalized(ctx, year)) {
    return { error: `A ${year}. év számadása már le van zárva — decont nem rögzíthető.` }
  }

  const total = items.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const advance = Number(input.advance) || 0
  const kulonbozet = total - advance

  // 1) Sorszám lefoglalása (atomikus RPC)
  const { data: szamData, error: szamErr } = await ctx.supabase.rpc('next_bizonylat_szam', {
    p_congregation_id: ctx.scopeId,
    p_ev: year,
    p_tipus: 'decont',
  })
  if (szamErr) return { error: `Sorszám hiba: ${szamErr.message}` }
  const sorszam = Number(szamData)

  // 2) Decont fejléc beszúrása (megkapjuk az id-t a kiadás-linkhez)
  const tetelekSnapshot = items.map((r) => ({
    act_nr: r.actNr,
    act_type: r.actType,
    act_date: r.actDate,
    issuer: r.issuer,
    explanation: r.explanation,
    amount: Number(r.amount) || 0,
    id_kiadascel: r.id_kiadascel || input.defaultCategoryId,
  }))

  const { data: decontRow, error: decontErr } = await ctx.supabase
    .from('decont')
    .insert([
      {
        congregation_id: ctx.scopeId,
        ev: year,
        sorszam,
        datum: input.date,
        elszamolo_nev: input.personName.trim(),
        jovahagyta: input.approvedBy?.trim() || null,
        jelleg: input.jelleg?.trim() || null,
        kapott_eloleg: advance,
        osszkoltseg: total,
        kulonbozet,
        tetelek: tetelekSnapshot,
        created_by: ctx.userId,
      },
    ])
    .select('id')
    .single()

  if (decontErr) return { error: `Decont mentés hiba: ${decontErr.message}` }
  const decontId = (decontRow as { id: string }).id

  // 3) Tételek könyvelése kiadásként az AKTUÁLIS (decont) dátumra
  for (let i = 0; i < items.length; i += 1) {
    const r = items[i]
    const docNum = (r.actNr || `Decont ${sorszam}`).slice(0, 40)
    const payload = {
      osszeg: Number(r.amount) || 0,
      datum: input.date,
      id_kiadascel: r.id_kiadascel || input.defaultCategoryId,
      kedvezmenyzett: r.issuer || null,
      iratszam: docNum,
      irattipus: 'Készpénz',
      megjegyzes: `Decont #${sorszam}/${year} — ${r.explanation || ''}`.trim(),
      deleted: false,
      congregation_id: ctx.scopeId,
      nyugta: docNum,
      xkey: randomUUID(),
      atvevo: r.issuer || 'Decont',
      userid: ctx.userId,
      decont_id: decontId,
    }
    const { error: kErr } = await ctx.supabase.from('kiadas').insert([payload])
    if (kErr) {
      // Visszagörgetés: a már beszúrt kiadások + a decont törlése
      await ctx.supabase.from('kiadas').update({ deleted: true }).eq('decont_id', decontId)
      await ctx.supabase.from('decont').update({ deleted: true }).eq('id', decontId)
      return { error: `${i + 1}. tétel könyvelése sikertelen: ${kErr.message}` }
    }
  }

  revalidatePath('/penzugy')
  return { success: true, sorszam, decontId }
}
