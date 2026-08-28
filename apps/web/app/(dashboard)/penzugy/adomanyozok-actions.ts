'use server'

/**
 * ADOMÁNYOZÓK ÉS SZPONZOROK — adatréteg (Endre 5. kérése, 2026-08-27).
 *
 * „Legyen egy új fül: Adományozók és szponzorok. Listázza ki, hogy ki adományozott
 *  az adott évben (és visszamenőleg is), mely személyek, mely cégek adtak
 *  szponzorpénzt, adományt, ki mennyit és mikor." — bankit ÉS készpénzeset egyaránt.
 *
 * ── EZ A FÁJL CSAK AZ ADATOT HOZZA ────────────────────────────────────────
 * Az ÖSSZEVONÁS és a BESOROLÁS a `@kartoteka/core` `osszesitAdomanyozok`-ban van,
 * hogy a későbbi desktop-fül ugyanazt a végösszeget adja.
 *
 * ── DÖNTÉSEK, MÉRÉS ALAPJÁN ───────────────────────────────────────────────
 * · CSAK GYÜLEKEZETI HATÓKÖR. A megyei/kerületi táblák kategória-oszlopa
 *   `id_szamadasicel` (maga a kód), a gyülekezetié `id_befizetescel` (junction),
 *   és felsőbb szinten nincs tagnyilvántartás sem. Egy „scope-független"
 *   lekérdezés itt némán rossz számot adna — ezért a fül a Tartozásokhoz
 *   hasonlóan gyülekezet-specifikus.
 * · A KATEGÓRIÁT a `befizetescel.id_szamadasicel` adja. A `szamadasicel`-nek
 *   NINCS `kod` oszlopa — az `id` maga a kód.
 * · Az ÉV a `datum`-ból jön, NEM a `fizetettev`-ből. A `fizetettev` azt mondja
 *   meg, MELYIK ÉVRE szól egy járulék (hátralék-kezelés); egy adomány esetén a
 *   kérdés az, MIKOR érkezett a pénz.
 * · Az összeg `osszeg_ron ?? osszeg` — devizás számlánál az `osszeg` a
 *   DEVIZA-összeg, a lejt az `osszeg_ron` tartja.
 * · `bankszamla_id IS NOT NULL` = banki, egyébként készpénz (kassza). SOHA nem
 *   az `irattipus` szövege: az élő adatban banki/Extr/OP/Chit./Készpénz és üres
 *   értékek keverednek.
 * · Törölt és sztornózott sor nem számít. `belso_mozgas_xkey IS NULL`: egy
 *   átvezetés nem adomány (ma nem is kaphat adomány-kódot, de a szűrő olcsó).
 * · LAPOZUNK (`selectAllPaged`). Több év adományát kérjük le — az 1000 soros
 *   PostgREST-plafon némán csonkítana, és a fül KEVESEBB adományozót mutatna,
 *   mint a valóság.
 */

import { osszesitAdomanyozok, ADOMANY_KODOK, type AdomanyTetel } from '@kartoteka/core'
import { selectAllPaged } from '@kartoteka/supabase-client'
import { getFinanceScopeContext, tablesFor } from '@/lib/auth/finance-scope'
import type { AdomanyozokValasz } from './adomanyozok-types'

const KODOK = ADOMANY_KODOK.map((k) => k.kod)
/** Egy `.in()` szűrő az URL-be kerül; ~100 azonosító fölött a proxy 414-et ad. */
const IN_DARAB = 80

export async function getAdomanyozok(input: {
  evTol: number
  evIg: number
}): Promise<AdomanyozokValasz> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation') {
    return { error: 'Az Adományozók fül a gyülekezeti könyveléshez készült.' }
  }
  const T = tablesFor(ctx.scope)

  const evTol = Math.min(input.evTol, input.evIg)
  const evIg = Math.max(input.evTol, input.evIg)

  // ── 1) A 10 adomány-kód junction-azonosítói ─────────────────────────────
  // Nem `!inner` embed: az embed a NULL kategóriájú sorokat NÉMÁN eldobná.
  const celRes = await ctx.supabase
    .from('befizetescel')
    .select('id, id_szamadasicel')
    .in('id_szamadasicel', KODOK)
  if (celRes.error) {
    return { error: `A befizetési célok nem olvashatók: ${celRes.error.message}` }
  }
  type CelSor = { id: number; id_szamadasicel: string | null }
  const celSorok = (celRes.data || []) as CelSor[]
  const kodById = new Map<number, string>()
  for (const c of celSorok) kodById.set(Number(c.id), String(c.id_szamadasicel ?? ''))
  const celIds = [...kodById.keys()]
  if (!celIds.length) {
    // FAIL-LOUD: üres lista esetén NEM adunk vissza „0 adomány"-t. Ha a
    // katalógus hiányzik, azt tudni kell — nem az a hír, hogy senki nem adott.
    return { error: 'A 10 adomány-kategória egyike sincs feloldva a befizetescel táblában. Ellenőrizni kell a kategória-katalógust.' }
  }

  // ── 2) A tételek (lapozva, több éven át) ────────────────────────────────
  type Sor = {
    id: number
    datum: string
    osszeg: number | null
    osszeg_ron: number | null
    forrasa: string | null
    id_szemely: number | null
    id_befizetescel: number
    bankszamla_id: number | null
    iratszam: string | null
    megjegyzes: string | null
  }
  const sorok: Sor[] = []
  for (let i = 0; i < celIds.length; i += IN_DARAB) {
    const darab = celIds.slice(i, i + IN_DARAB)
    const { data, error } = await selectAllPaged<Sor>(
      ctx.supabase
        .from(T.befizetes)
        .select('id, datum, osszeg, osszeg_ron, forrasa, id_szemely, id_befizetescel, bankszamla_id, iratszam, megjegyzes')
        .eq('congregation_id', ctx.scopeId)
        .in('id_befizetescel', darab)
        .is('belso_mozgas_xkey', null)
        .eq('deleted', false)
        .eq('stornozott', false)
        .gte('datum', `${evTol}-01-01`)
        // Kizáró felső határ: a `befizetes.datum` ugyan `date`, de így az alak
        // egyezik a rendszer többi dátum-ablakával, és típusváltásnál sem törik.
        .lt('datum', `${evIg + 1}-01-01`),
    )
    if (error) return { error: `A befizetések nem olvashatók: ${error.message}` }
    sorok.push(...data)
  }

  // ── 3) A tagnyilvántartási nevek (ahol van kapcsolat) ───────────────────
  // A `forrasa` szabad szöveg; ha a tétel személyhez van kötve, a REGISZTER
  // neve a hitelesebb — és így ugyanaz a tag nem esik szét két csoportra
  // csak azért, mert egyszer másképp gépelték be.
  const szemelyIds = [...new Set(sorok.map((s) => s.id_szemely).filter((x): x is number => x != null))]
  const nevById = new Map<number, string>()
  for (let i = 0; i < szemelyIds.length; i += IN_DARAB) {
    const darab = szemelyIds.slice(i, i + IN_DARAB)
    const { data, error } = await ctx.supabase
      .from('szemely')
      .select('id, csaladnev, k_nev')
      .in('id', darab)
    if (error) {
      // Nem állítjuk meg a fület egy név-feloldás miatt: a `forrasa` marad.
      break
    }
    for (const r of (data || []) as Array<{ id: number; csaladnev: string | null; k_nev: string | null }>) {
      const nev = `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim()
      if (nev) nevById.set(Number(r.id), nev)
    }
  }

  // ── 4) Átalakítás a közös mag bemenetére ───────────────────────────────
  const tetelek: AdomanyTetel[] = sorok.map((s) => ({
    id: Number(s.id),
    datum: String(s.datum ?? '').slice(0, 10),
    osszeg: Number(s.osszeg_ron ?? s.osszeg) || 0,
    nev: (s.id_szemely != null ? nevById.get(s.id_szemely) : null) || String(s.forrasa ?? '').trim(),
    szemelyId: s.id_szemely ?? null,
    kod: kodById.get(Number(s.id_befizetescel)) ?? '',
    banki: s.bankszamla_id != null,
    iratszam: s.iratszam ?? null,
    megjegyzes: s.megjegyzes ?? null,
  }))

  return { osszesito: osszesitAdomanyozok(tetelek) }
}

/**
 * Mely évekre VAN egyáltalán adomány-adat.
 *
 * A fül ebből tölti az évválasztót, hogy a „visszamenőleg is" kérés ne egy
 * kitalált év-listán fusson. Külön, olcsó lekérdezés: csak a dátumokat kéri.
 */
export async function getAdomanyEvek(): Promise<{ evek: number[] } | { error: string }> {
  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { error: ctx.error }
  if (ctx.scope !== 'congregation') return { evek: [] }
  const T = tablesFor(ctx.scope)

  const celRes = await ctx.supabase
    .from('befizetescel')
    .select('id')
    .in('id_szamadasicel', KODOK)
  if (celRes.error) return { error: celRes.error.message }
  const celIds = ((celRes.data || []) as Array<{ id: number }>).map((r) => Number(r.id))
  if (!celIds.length) return { evek: [] }

  const evek = new Set<number>()
  for (let i = 0; i < celIds.length; i += IN_DARAB) {
    const { data, error } = await selectAllPaged<{ id: number; datum: string }>(
      ctx.supabase
        .from(T.befizetes)
        .select('id, datum')
        .eq('congregation_id', ctx.scopeId)
        .in('id_befizetescel', celIds.slice(i, i + IN_DARAB))
        .eq('deleted', false)
        .eq('stornozott', false),
    )
    if (error) return { error: error.message }
    for (const r of data) {
      const ev = Number(String(r.datum ?? '').slice(0, 4))
      if (ev) evek.add(ev)
    }
  }
  return { evek: [...evek].sort((a, b) => b - a) }
}
