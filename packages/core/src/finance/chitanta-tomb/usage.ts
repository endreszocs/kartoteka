/**
 * Nyugtatömb VALÓS elhasználtság — származtatott (derived) számítás (G4, 2026-07-25).
 *
 * MIÉRT: a `chitanta_tombok.felhasznalt_darabszam`-ot kizárólag a hivatalos
 * auto-kiállítás RPC-je növeli (2026-08-28 / P0-12 óta `issue_chitanta_atomic`,
 * korábban `next_chitanta_full`) — a lelkészek
 * viszont a tétel-rögzítővel dolgoznak, ami a kerületi (nyomdai) számot a
 * `befizetes.iratszam` szöveg-mezőbe írja („Chitanță 0115032", több
 * befizetőnél „…/1", „…/2"). Emiatt a tömb-kártyák örökké 0 elhasználtat
 * mutattak. Ez a use-case a TÉNYLEGESEN berögzített nyugtaszámokból számol.
 *
 * SZABÁLYOK (user-döntések, 2026-07-25):
 *   - a vezető nullák nem számítanak: 0115032 == 115032 (numerikus összevetés);
 *   - a /N utótagos sorok (családi/több-befizetős nyugta) EGY fizikai lapot
 *     fogyasztanak (DISTINCT nyomdai szám);
 *   - a stornózott tétel is elhasznált papír (a rontott lap nem kerül vissza);
 *   - a 0 értékű nyugta = ANULÁLT (szintén elhasznált lap, külön számolva);
 *   - a hivatalos auto-kiállítás (oblio_szamlak.nyomdai_szam) UNIÓ-ban —
 *     egyik út se vesszen el;
 *   - a `felhasznalt_darabszam` DB-mezőt SOHA nem írjuk vissza (a CHECK és az
 *     issue_chitanta_atomic számozása sérülne) — a kijelzett érték:
 *     max(DB-mező, számított).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// Tiszta (pure) segédek — web + desktop + teszt közös
// ─────────────────────────────────────────────────────────────────────────

/**
 * Kerületi (nyomdai) sorszám kinyerése a befizetés iratszámából.
 *
 * Sorrend KÖTELEZŐ: (1) a /N utótag levágása (receiptBaseKey-vel azonos
 * szemantika — különben a „Chitanță 0115032/1" végéről az 1-et vennénk!),
 * (2) az UTOLSÓ számjegycsoport parseInt-je — a kanonikus „Chitanță <szám>"
 * formátumon és a kézzel gépelt „EREKC24 0115032" alakon is a nyomdai számot
 * adja (az ELSŐ csoport ott a seria 24-e lenne). A parseInt a vezető nullákat
 * automatikusan eldobja.
 */
export function extractNyomdaiSzamFromIratszam(iratszam: string | null): number | null {
  if (!iratszam) return null
  const base = iratszam.replace(/\/\d+\s*$/, '').trim()
  const groups = base.match(/\d+/g)
  if (!groups || groups.length === 0) return null
  const num = Number.parseInt(groups[groups.length - 1], 10)
  return Number.isFinite(num) ? num : null
}

export interface ChitantaTombRangeLike {
  id: string
  szam_kezdet: number
  szam_veg: number
}

export interface ChitantaTombUsage {
  /** Hány DISTINCT nyomdai szám esik a tömb tartományába (stornóval, anuláltakkal együtt). */
  szamitottFelhasznalt: number
  /** Ebből hány a 0 értékű (anulált) nyugta. */
  anulaltDarab: number
  /** A tartományba eső legkorábbi/legkésőbbi bizonylat-dátum (az éves kimutatáshoz). */
  elsoHasznalat: string | null
  utolsoHasznalat: string | null
}

export interface NyomdaiSzamAdat {
  /** A számhoz tartozó sorok összértéke (a /N al-sorok összege). 0 = anulált. */
  osszesen: number
  /** Hivatalos (oblio_szamlak) kiállításból is ismert-e — az anulált-jelzést felülírja. */
  hivatalos: boolean
  /** A szám legkorábbi/legkésőbbi bizonylat-dátuma (ISO, YYYY-MM-DD). */
  elsoDatum?: string | null
  utolsoDatum?: string | null
}

/**
 * Tömbönkénti használat a normalizált nyomdai számokból. Tartomány-átfedő
 * tömböknél (különböző seriák — a batch-create nem tiltja) a szám mindkét
 * tömbnél megjelenik; ez dokumentált korlát, a kerületi tartományok a
 * gyakorlatban diszjunktak.
 */
export function computeChitantaTombUsage(
  tombok: ChitantaTombRangeLike[],
  szamok: Map<number, NyomdaiSzamAdat>,
): Record<string, ChitantaTombUsage> {
  const result: Record<string, ChitantaTombUsage> = {}
  for (const tomb of tombok) {
    result[tomb.id] = {
      szamitottFelhasznalt: 0,
      anulaltDarab: 0,
      elsoHasznalat: null,
      utolsoHasznalat: null,
    }
  }
  for (const [szam, adat] of szamok) {
    for (const tomb of tombok) {
      if (szam >= tomb.szam_kezdet && szam <= tomb.szam_veg) {
        const u = result[tomb.id]
        u.szamitottFelhasznalt += 1
        if (!adat.hivatalos && adat.osszesen === 0) u.anulaltDarab += 1
        if (adat.elsoDatum && (!u.elsoHasznalat || adat.elsoDatum < u.elsoHasznalat)) {
          u.elsoHasznalat = adat.elsoDatum
        }
        if (adat.utolsoDatum && (!u.utolsoHasznalat || adat.utolsoDatum > u.utolsoHasznalat)) {
          u.utolsoHasznalat = adat.utolsoDatum
        }
      }
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────
// Use-case: adatgyűjtés + számítás
// ─────────────────────────────────────────────────────────────────────────

export interface GetChitantaTombUsageInput {
  congregationId: string
  /** A gyülekezet tömbjei (a hívó tipikusan már lekérte a listát). */
  tombok: ChitantaTombRangeLike[]
}

export interface GetChitantaTombUsageCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
}

export type GetChitantaTombUsageResult =
  | { success: true; usage: Record<string, ChitantaTombUsage> }
  | { success: false; error: string }

/** Lapméret — a Supabase/PostgREST implicit sor-plafonja alatt marad. */
const PAGE_SIZE = 1000

export async function getChitantaTombUsageUseCase(
  input: GetChitantaTombUsageInput,
  ctx: GetChitantaTombUsageCtx,
): Promise<GetChitantaTombUsageResult> {
  if (!input.congregationId) {
    return { success: false, error: 'Hiányzó congregation_id.' }
  }
  if (input.tombok.length === 0) {
    return { success: true, usage: {} }
  }

  try {
    const szamok = new Map<number, NyomdaiSzamAdat>()

    // 1) Kézzel rögzített kassza-tételek — a nyugtafigyelő kánonjával azonos
    //    szűrés, DE a stornót SZÁNDÉKOSAN NEM zárjuk ki (elhasznált papír).
    //    Lapozott lekérés: az éves 470+ tétel/gyülekezet növekedésével az
    //    implicit 1000-es plafon némán csonkolna.
    // Csak az ÜRES lap a biztos stop (ha a szerver Max Rows < PAGE_SIZE, a
    // rövid lap még NEM a vége) — a desktop selectAllPaged tanulsága.
    for (let offset = 0; ; ) {
      const { data, error } = await ctx.supabase
        .from('befizetes')
        .select('iratszam, osszeg, datum')
        .eq('congregation_id', input.congregationId)
        .or('deleted.eq.false,deleted.is.null')
        .is('bankszamla_id', null)
        .is('belso_mozgas_xkey', null)
        .not('iratszam', 'is', null)
        .not('iratszam', 'ilike', 'AUTO%')
        // Az árfolyam-átértékelési sor (ÁRF/<év>/<bankId>) nem készpénz-nyugta,
        // de bankszamla_id nélkül íródik → az évszámot hamis nyomdai számként
        // olvasnánk ki belőle.
        .not('iratszam', 'ilike', 'ÁRF/%')
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) return { success: false, error: error.message }
      const rows = data ?? []
      for (const row of rows) {
        const szam = extractNyomdaiSzamFromIratszam(row.iratszam as string | null)
        if (szam == null) continue
        const datum = typeof row.datum === 'string' ? row.datum.slice(0, 10) : null
        const eddig = szamok.get(szam) ?? { osszesen: 0, hivatalos: false }
        eddig.osszesen += Number(row.osszeg) || 0
        if (datum && (!eddig.elsoDatum || datum < eddig.elsoDatum)) eddig.elsoDatum = datum
        if (datum && (!eddig.utolsoDatum || datum > eddig.utolsoDatum)) eddig.utolsoDatum = datum
        szamok.set(szam, eddig)
      }
      if (rows.length === 0) break
      offset += rows.length
    }

    // 2) Hivatalos auto-kiállítások (oblio_szamlak) — UNIÓ. A stornózott is
    //    elhasznált lap, ezért nincs stornó-szűrés.
    for (let offset = 0; ; ) {
      const { data, error } = await ctx.supabase
        .from('oblio_szamlak')
        .select('nyomdai_szam, szamla_datum')
        .eq('congregation_id', input.congregationId)
        .eq('tipus', 'chitanta_papir')
        .not('nyomdai_szam', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)

      if (error) {
        // Az oblio-tábla hibája ne vigye el a kézi számokból már kész képet —
        // de logoljuk, mert az auto-kiállított lapok kimaradhatnak.
        console.error('[chitanta-tomb-usage] oblio_szamlak lekérdezés hiba:', error.message)
        break
      }
      const rows = data ?? []
      for (const row of rows) {
        const szam = Number(row.nyomdai_szam)
        if (!Number.isFinite(szam)) continue
        const datum = typeof row.szamla_datum === 'string' ? row.szamla_datum.slice(0, 10) : null
        const eddig = szamok.get(szam) ?? { osszesen: 0, hivatalos: false }
        eddig.hivatalos = true
        if (datum && (!eddig.elsoDatum || datum < eddig.elsoDatum)) eddig.elsoDatum = datum
        if (datum && (!eddig.utolsoDatum || datum > eddig.utolsoDatum)) eddig.utolsoDatum = datum
        szamok.set(szam, eddig)
      }
      if (rows.length === 0) break
      offset += rows.length
    }

    return { success: true, usage: computeChitantaTombUsage(input.tombok, szamok) }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ismeretlen hiba a tömb-használat számításakor.',
    }
  }
}
