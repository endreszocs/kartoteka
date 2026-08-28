/**
 * autoIssueChitantaForBefizetesUseCase + getChitantakForBefizetesekUseCase — C1c (2026-06-10).
 *
 * A web `autoIssueChitantaForBefizetes` / `getChitantakForBefizetesek`
 * (apps/web/app/(dashboard)/penzugy/chitanta-actions.ts) PONTOS tükre — hogy az
 * asztali Kassza-fül nyugta-kiállítása azonos hivatalos rekordot adjon, mint a web.
 *
 * Auto-issue lépések (a webbel egyezően):
 *   1. Befizetés lekérdezése (datum, osszeg, forrasa, id_szemely/csalad/befizetescel)
 *   2. Befizető név + cím feloldás: szemely (FK adrlocality/adrstreet) → haztartas
 *      (legacy_csalad_id, FK cím) → forrasa szöveg → „Gyülekezeti tag" fallback
 *   3. Reprezentand (jogcím neve hu+ro) a befizetescel-ből
 *   4+5. ATOMIKUS `issue_chitanta_atomic(...)` RPC (P0-12, 2026-08-28) —
 *      foglalás + oblio_szamlak INSERT EGY szerver-oldali tranzakcióban
 *      (FOR UPDATE a tömb-soron + idempotencia-kapu a befizetes_id-n);
 *      ha nincs aktív tömb → 'no_active_block' → errorCode 'NO_ACTIVE_BLOCK'
 *
 * ONLINE művelet — az atomikus RPC szerver-oldali; offline nem rögzítünk nyugtát
 * a Kassza-fülről (a Nyugta oldalon van offline-tárcás kiállítás).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AutoIssueChitantaForBefizetesInput {
  congregationId: string
  befizetesId: number
}

export interface AutoIssueChitantaCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A kiállító user UUID — az `issued_by` oszlopba megy. */
  userId: string
}

/** A web flat válasz-alakjával egyező (a hívó könnyen leképezi). */
export interface AutoIssueChitantaForBefizetesResult {
  chitantaId?: string
  sorozat?: string
  nyomdaiSzam?: number
  gyulekezetiSzam?: number
  maradek?: number
  error?: string
  errorCode?: 'NO_ACTIVE_BLOCK' | string
}

export async function autoIssueChitantaForBefizetesUseCase(
  input: AutoIssueChitantaForBefizetesInput,
  ctx: AutoIssueChitantaCtx,
): Promise<AutoIssueChitantaForBefizetesResult> {
  if (!input.congregationId || typeof input.congregationId !== 'string') {
    return { error: 'Hiányzó gyülekezet-azonosító.' }
  }
  if (!Number.isInteger(input.befizetesId) || input.befizetesId <= 0) {
    return { error: 'Érvénytelen befizetés-azonosító.' }
  }

  // 1. Befizetés adatai
  const { data: befizetes, error: bErr } = await ctx.supabase
    .from('befizetes')
    .select('id, datum, osszeg, forrasa, fizetettev, id_szemely, id_csalad, id_befizetescel')
    .eq('id', input.befizetesId)
    .eq('congregation_id', input.congregationId)
    .maybeSingle()

  if (bErr || !befizetes) return { error: 'A befizetés nem található.' }

  // 2. Befizető név + cím feloldás (szemely → haztartas → forrasa → fallback)
  let befizetoNev: string | null = null
  let befizetoCim: string | null = null

  if (befizetes.id_szemely) {
    const { data: sz } = await ctx.supabase
      .from('szemely')
      .select('csaladnev, k_nev, c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
      .eq('id', befizetes.id_szemely)
      .maybeSingle()
    if (sz) {
      befizetoNev = `${sz.csaladnev || ''} ${sz.k_nev || ''}`.trim()
      const loc = sz.adrlocality as { name?: string | null } | null
      const str = sz.adrstreet as { name?: string | null } | null
      const cimParts = [loc?.name ?? null, str?.name ?? null, sz.c_szam ?? null].filter(Boolean)
      if (cimParts.length > 0) befizetoCim = cimParts.join(', ')
    }
  }
  if (!befizetoNev && befizetes.id_csalad) {
    const { data: haztartas } = await ctx.supabase
      .from('haztartas')
      .select(
        `megnevezes, cim:cim!id_cim(szam, tombhaz, lepcsohaz, emelet, ajto, utca:adrstreet!id_utca(name))`,
      )
      .eq('legacy_csalad_id', befizetes.id_csalad)
      .is('ervenyes_ig', null)
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = haztartas as any
    if (h?.megnevezes) befizetoNev = String(h.megnevezes)
    if (h?.cim) {
      const cim = Array.isArray(h.cim) ? h.cim[0] : h.cim
      const utcaRaw = cim?.utca
      const utca = Array.isArray(utcaRaw) ? utcaRaw[0] : utcaRaw
      const cimParts = [utca?.name, cim?.szam].filter(Boolean)
      if (cimParts.length > 0) befizetoCim = cimParts.join(' ')
    }
  }
  if (!befizetoNev && typeof befizetes.forrasa === 'string') {
    befizetoNev = befizetes.forrasa.trim()
  }
  if (!befizetoNev) befizetoNev = 'Gyülekezeti tag'

  // 3. Reprezentand (jogcím neve hu + ro)
  let reprezentand: string | undefined
  let reprezentandRo: string | undefined
  if (befizetes.id_befizetescel) {
    const { data: bc } = await ctx.supabase
      .from('befizetescel')
      .select('nev, nevro')
      .eq('id', befizetes.id_befizetescel)
      .maybeSingle()
    if (bc?.nev) reprezentand = String(bc.nev)
    if (bc?.nevro) reprezentandRo = String(bc.nevro)
  }
  // 2026-07-17 (F2-3, Q4 döntés): a fizetett év MINDIG a reprezentand része —
  // bit-azonos a web actionnel (apps/web chitanta-actions.ts).
  const fizetettEv = Number(befizetes.fizetettev) || null
  if (fizetettEv) {
    if (reprezentand && !reprezentand.includes(String(fizetettEv))) reprezentand = `${reprezentand} ${fizetettEv}`
    if (reprezentandRo && !reprezentandRo.includes(String(fizetettEv))) reprezentandRo = `${reprezentandRo} ${fizetettEv}`
  }

  // 4+5. Foglalás + INSERT EGY szerver-oldali tranzakcióban (P0-12, audit
  // 2026-08-28): a korábbi kétlépcsős út (next_chitanta_full + külön insert)
  // hibánál ELÉGETTE a nyomdai számot, és FOR UPDATE híján párhuzamosan
  // dupla számot adhatott. Az RPC idempotens: dupla-kattintásnál a MÁR
  // MEGLÉVŐ nyugtát adja vissza új szám nélkül. Bit-azonos a web actionnel.
  const szamlaDatum =
    (befizetes.datum as string)?.split('T')[0] || new Date().toISOString().slice(0, 10)

  const osszeg = Number(befizetes.osszeg) || 0
  const { data: kiallitasRaw, error: rpcErr } = await ctx.supabase.rpc('issue_chitanta_atomic', {
    p_congregation_id: input.congregationId,
    p_befizetes_id: input.befizetesId,
    p_szamla_datum: szamlaDatum,
    p_klienesseg_nev: befizetoNev,
    p_klienesseg_cim: befizetoCim,
    // A desktop Kassza-fülön nincs cégnyilvántartás-feloldás (a webes 5b
    // jogi-személy ág web-only) — a CUI itt mindig null.
    p_klienesseg_cui: null,
    p_osszeg: osszeg,
    p_reprezentand: reprezentand || null,
    p_reprezentand_ro: reprezentandRo || null,
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('no_active_block')) {
      return {
        error: 'Még nincs aktív nyugtatömb. Kérlek rögzíts egy új tömböt a Nyugtatömbök panelen.',
        errorCode: 'NO_ACTIVE_BLOCK',
      }
    }
    return { error: `Nyugta-kiállítási hiba: ${rpcErr.message}` }
  }

  const kiallitas = Array.isArray(kiallitasRaw) ? kiallitasRaw[0] : kiallitasRaw
  if (!kiallitas) {
    return { error: 'Nem sikerült kiállítani a nyugtát.' }
  }

  return {
    chitantaId: kiallitas.chitanta_id as string,
    sorozat: kiallitas.sorozat as string,
    nyomdaiSzam: Number(kiallitas.nyomdai_szam),
    gyulekezetiSzam:
      kiallitas.gyulekezeti_szam == null ? undefined : Number(kiallitas.gyulekezeti_szam),
    maradek: kiallitas.maradek == null ? undefined : Number(kiallitas.maradek),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// getChitantakForBefizetesekUseCase — batch lookup (mely befizetéshez van nyugta)
// ─────────────────────────────────────────────────────────────────────────

export interface GetChitantakForBefizetesekInput {
  congregationId: string
  befizetesIds: number[]
}

export interface GetChitantakForBefizetesekCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type GetChitantakForBefizetesekResult = {
  data?: Record<number, { id: string; sorozat: string; szam: number }>
  error?: string
}

export async function getChitantakForBefizetesekUseCase(
  input: GetChitantakForBefizetesekInput,
  ctx: GetChitantakForBefizetesekCtx,
): Promise<GetChitantakForBefizetesekResult> {
  if (!input.congregationId) return { error: 'Hiányzó gyülekezet-azonosító.' }
  if (!input.befizetesIds || input.befizetesIds.length === 0) return { data: {} }

  const { data, error } = await ctx.supabase
    .from('oblio_szamlak')
    .select('id, sorozat, szam, befizetes_id')
    .eq('congregation_id', input.congregationId)
    .eq('tipus', 'chitanta_papir')
    .eq('stornozott', false)
    .in('befizetes_id', input.befizetesIds)

  if (error) return { error: error.message }

  const map: Record<number, { id: string; sorozat: string; szam: number }> = {}
  for (const row of data || []) {
    if (row.befizetes_id !== null && row.befizetes_id !== undefined) {
      map[row.befizetes_id as number] = {
        id: row.id as string,
        sorozat: row.sorozat as string,
        szam: row.szam as number,
      }
    }
  }
  return { data: map }
}
