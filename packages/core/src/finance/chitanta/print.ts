/**
 * getChitantaForPrintUseCase — A-M7.2f (2026-04-23).
 *
 * Egy adott chitanța nyomtatási adatcsomagjának összeállítása:
 *   1. chitanța fő sor lekérdezése (`oblio_szamlak` tipus='chitanta_papir')
 *   2. fallback-ek a régi nyugtákra:
 *      - `reprezentand_ro` pótlása a `befizetescel.nevro`-ból
 *      - `klienesseg_cim` pótlása a `szemely` vagy a `csalad` első tagjából
 *        (adrlocality + adrstreet + c_szam)
 *   3. gyülekezet-fejléc (`congregations`)
 *   4. egyházmegye + kerület (`dioceses` + `districts`)
 *
 * A use-case kliens-oldali — nem server-only secret. Az RLS biztosítja, hogy
 * a user csak a saját congregation-jéhez férhet (scope check ott van).
 *
 * **Online-only** most — az offline-chitanța nyomtatás külön fájlmentő logikát
 * igényelne; a jövőben a cache-elt chitanta-sor + gyülekezet-adat alapján
 * offline is megy. A-M7.2d keretében mérlegeljük.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChitantaPrintData } from '@kartoteka/validations'

export interface GetChitantaForPrintInput {
  congregationId: string
  chitantaId: string
}

export interface GetChitantaForPrintCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type GetChitantaForPrintResult =
  | { success: true; data: ChitantaPrintData }
  | { success: false; error: string }

const CHITANTA_COLS = `
  id, sorozat, szam, nyomdai_szam, gyulekezeti_szam, szamla_datum,
  klienesseg_nev, klienesseg_cui, klienesseg_cim, klienesseg_nr_orc_an,
  osszeg_brut, reprezentand, reprezentand_ro, megjegyzes, stornozott,
  stornozott_at, stornozott_indok, befizetes_id
`

export async function getChitantaForPrintUseCase(
  input: GetChitantaForPrintInput,
  ctx: GetChitantaForPrintCtx,
): Promise<GetChitantaForPrintResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }
  if (!input.chitantaId) {
    return { success: false, error: 'Hiányzó chitanța azonosító.' }
  }

  try {
    // 1) Chitanța fő sor
    const { data: row, error } = await ctx.supabase
      .from('oblio_szamlak')
      .select(CHITANTA_COLS)
      .eq('id', input.chitantaId)
      .eq('congregation_id', input.congregationId)
      .eq('tipus', 'chitanta_papir')
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!row) return { success: false, error: 'Nyugta nem található.' }

    const r = row as Record<string, unknown>

    // 2) Fallback-ek: reprezentand_ro és klienesseg_cim régi nyugtáknál
    let reprezentandRoResolved: string | null =
      (r.reprezentand_ro as string | null) ?? null
    let klienessegCimResolved: string | null =
      (r.klienesseg_cim as string | null) ?? null
    const befizetesId = r.befizetes_id as number | null

    if ((!reprezentandRoResolved || !klienessegCimResolved) && befizetesId) {
      const { data: bef } = await ctx.supabase
        .from('befizetes')
        .select('id_szemely, id_csalad, id_befizetescel')
        .eq('id', befizetesId)
        .maybeSingle()

      // Román reprezentand pótlása
      if (!reprezentandRoResolved && bef?.id_befizetescel) {
        const { data: bc } = await ctx.supabase
          .from('befizetescel')
          .select('nevro')
          .eq('id', bef.id_befizetescel)
          .maybeSingle()
        if (bc?.nevro) reprezentandRoResolved = String(bc.nevro)
      }

      // Lakhely pótlása
      if (!klienessegCimResolved) {
        if (bef?.id_szemely) {
          const { data: sz } = await ctx.supabase
            .from('szemely')
            .select('c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
            .eq('id', bef.id_szemely)
            .maybeSingle()
          if (sz) {
            const loc = sz.adrlocality as { name?: string | null } | null
            const str = sz.adrstreet as { name?: string | null } | null
            const cimParts = [loc?.name, str?.name, sz.c_szam].filter(Boolean)
            if (cimParts.length > 0) klienessegCimResolved = cimParts.join(', ')
          }
        } else if (bef?.id_csalad) {
          const { data: csalaTag } = await ctx.supabase
            .from('szemely')
            .select('c_szam, adrlocality:c_helysegid(name), adrstreet:c_utcaid(name)')
            .eq('id_csalad', bef.id_csalad)
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle()
          if (csalaTag) {
            const loc = csalaTag.adrlocality as { name?: string | null } | null
            const str = csalaTag.adrstreet as { name?: string | null } | null
            const cimParts = [loc?.name, str?.name, csalaTag.c_szam].filter(Boolean)
            if (cimParts.length > 0) klienessegCimResolved = cimParts.join(', ')
          }
        }
      }
    }

    // 3) Gyülekezet-fejléc
    const { data: cong } = await ctx.supabase
      .from('congregations')
      .select('name, nev_hu, nev_ro, adoszam, cim, varos, megye, telefon, diocese_id')
      .eq('id', input.congregationId)
      .maybeSingle()

    // 4) Egyházmegye + kerület
    let egyhazmegyeNev: string | null = null
    let egyhazmegyeNevRo: string | null = null
    let egyhazkeruletNev: string | null = null
    let egyhazkeruletNevRo: string | null = null
    // ⚠️ 2026-08-15 JAVÍTÁS — NEM LÉTEZŐ OSZLOPOKAT KÉRTÜNK.
    //
    // TÜNET VOLT: a nyugta kétnyelvű fejlécéből NÉMÁN kimaradt az egyházmegye
    // ÉS az egyházkerület neve is.
    //
    // OK: itt a `congregations` mintáját másoltuk (ott VAN `nev_hu`), de
    //   · a `dioceses` táblán NINCS `nev_hu` (csak `name`, és 2026-08-15 óta
    //     `nev_ro` + `nev_en` — lásd 2026-08-15-dioceses-nev-ro-en.sql),
    //   · a `districts` táblán NINCS sem `nev_hu`, sem `nev_ro` (a táblának
    //     mindössze három oszlopa van: id, name, created_at).
    // A PostgREST ilyenkor 42703-mal 400-at ad, a `data` null lesz — a hiba
    // pedig nem volt kezelve, ezért a `if (diocese)` ág SOHA nem futott le, és
    // vele együtt a beágyazott kerület-lekérdezés sem.
    //
    // HIBAOSZTÁLY: „rossz select → némán ÜRES eredmény". Csak a ténylegesen
    // létező oszlopokat kérjük.
    //
    // TODO (S2 + S6 szelet): amint a `districts` megkapja a hivatalos
    // identitását (`nev_ro`), a kerületi román nevet ITT kell bekötni —
    // ugyanígy, `dd.nev_ro`-ként.
    if (cong?.diocese_id) {
      const { data: diocese } = await ctx.supabase
        .from('dioceses')
        .select('name, nev_ro, district_id')
        .eq('id', cong.diocese_id)
        .maybeSingle()
      if (diocese) {
        const d = diocese as Record<string, string | null>
        egyhazmegyeNev = d.name ?? null
        egyhazmegyeNevRo = d.nev_ro ?? null
        const districtId = d.district_id
        if (districtId) {
          const { data: district } = await ctx.supabase
            .from('districts')
            .select('name')
            .eq('id', districtId)
            .maybeSingle()
          if (district) {
            const dd = district as Record<string, string | null>
            egyhazkeruletNev = dd.name ?? null
            // A kerületi ROMÁN nevet az S2 szelet hozza meg (districts.nev_ro).
            egyhazkeruletNevRo = null
          }
        }
      }
    }

    const data: ChitantaPrintData = {
      id: r.id as string,
      sorozat: r.sorozat as string,
      szam: r.szam as number,
      nyomdaiSzam: (r.nyomdai_szam as number | null) ?? (r.szam as number),
      gyulekezetiSzam: (r.gyulekezeti_szam as number | null) ?? null,
      szamlaDatum: r.szamla_datum as string,
      klienessegNev: r.klienesseg_nev as string,
      klienessegCui: (r.klienesseg_cui as string | null) ?? null,
      klienessegCim: klienessegCimResolved,
      klienessegNrOrcAn: (r.klienesseg_nr_orc_an as string | null) ?? null,
      osszegBrut: r.osszeg_brut as number,
      reprezentand: (r.reprezentand as string | null) ?? null,
      reprezentandRo: reprezentandRoResolved,
      megjegyzes: (r.megjegyzes as string | null) ?? null,
      stornozott: (r.stornozott as boolean | null) ?? false,
      stornozottAt: (r.stornozott_at as string | null) ?? null,
      stornozottIndok: (r.stornozott_indok as string | null) ?? null,
      gyulekezet: {
        nevHu: (cong?.nev_hu as string | null) ?? (cong?.name as string | null) ?? '',
        nevRo: (cong?.nev_ro as string | null) ?? null,
        cif: (cong?.adoszam as string | null) ?? null,
        cim: (cong?.cim as string | null) ?? null,
        varos: ((cong as Record<string, string | null> | null)?.varos) ?? null,
        megye: ((cong as Record<string, string | null> | null)?.megye) ?? null,
        telefon: (cong?.telefon as string | null) ?? null,
      },
      egyhazmegyeNevHu: egyhazmegyeNev,
      egyhazmegyeNevRo: egyhazmegyeNevRo,
      egyhazkeruletNevHu: egyhazkeruletNev,
      egyhazkeruletNevRo: egyhazkeruletNevRo,
    }

    return { success: true, data }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Nyomtatási adat hiba: ${msg}` }
  }
}
