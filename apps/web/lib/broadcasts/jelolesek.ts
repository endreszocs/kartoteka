import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangelogJeloles } from './types'

/**
 * A `changelog_jelolesek` tábla beolvasása — 2026-08-12.
 *
 * FAIL-SOFT, DE NEM NÉMA. Három, egymástól MEGKÜLÖNBÖZTETETT kimenet:
 *   · rendben        → `map` kitöltve
 *   · `needsSql`     → a 2026-08-12-changelog-jelolesek.sql még nem futott le
 *                      éles adatbázisban. Ez NEM hiba: a Frissítések oldal
 *                      ugyanúgy működik, csak a csillag és a kézi jelölés nem
 *                      érhető el. A felület ezt KIÍRJA, a fájlnévvel együtt.
 *   · `error`        → bármi más. A felület LÁTHATÓAN jelzi.
 *
 * ⚠️ Miért nem elég a `catch {}`: a projekt rögzített hibaosztálya, hogy egy
 * elnyelt hiba üres adatnak látszik, az üres adat pedig „minden rendben"-nek.
 * Pontosan ez történt a kiküldési státusszal, amit most javítunk.
 */

export interface JelolesekEredmeny {
  jelolesek: Map<string, ChangelogJeloles>
  needsSql: boolean
  error: string | null
}

interface NyersJeloles {
  release_changelog_key: string
  kiemelt: boolean | null
  kiemelte: string | null
  kiemelve_at: string | null
  kikuldottnek_jelolve_at: string | null
  kikuldottnek_jelolte: string | null
  megjegyzes: string | null
}

/** PostgREST „nincs ilyen tábla" jelzései (relation missing + séma-gyorsítótár). */
export function hianyzoTablaHiba(message: string | undefined | null): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('changelog_jelolesek') &&
    (m.includes('does not exist') ||
      m.includes('could not find the table') ||
      m.includes('schema cache'))
  )
}

export async function loadChangelogJelolesek(
  supabase: SupabaseClient,
): Promise<JelolesekEredmeny> {
  const ures: JelolesekEredmeny = {
    jelolesek: new Map(),
    needsSql: false,
    error: null,
  }

  const { data, error } = await supabase
    .from('changelog_jelolesek')
    .select(
      'release_changelog_key, kiemelt, kiemelte, kiemelve_at, kikuldottnek_jelolve_at, kikuldottnek_jelolte, megjegyzes',
    )
    // ⚠️ A `.limit(2000)` itt CSAK azért elég, mert a tábla elsődleges kulcsa a
    // CHANGELOG-kulcs: több sora nem lehet, mint ahány bejegyzés a fájlban van
    // (ma 453). Ha ez valaha 1000 fölé nő, ez a lekérdezés NÉMÁN csonkolna — a
    // PostgREST `max-rows` plafonja (1000) erősebb a `.limit()`-nél. Akkor ezt
    // is át kell tenni a kanonikus `selectAllPaged`-re, ahogy a kiküldési
    // státusz beolvasása 2026-08-12-én megtörtént.
    .limit(2000)

  if (error) {
    if (hianyzoTablaHiba(error.message)) return { ...ures, needsSql: true }
    return {
      ...ures,
      error: `A kézi jelölések betöltése nem sikerült: ${error.message}`,
    }
  }

  const rows = (data || []) as NyersJeloles[]
  if (rows.length === 0) return ures

  // Nevek feloldása — FAIL-SOFT: ha nem megy, a jelölés attól még látszik,
  // csak a név marad üres. Egy hiányzó név nem érhet annyit, hogy elvegye
  // a teljes jelölés-listát.
  const idk = [
    ...new Set(
      rows
        .flatMap((r) => [r.kiemelte, r.kikuldottnek_jelolte])
        .filter((v): v is string => !!v),
    ),
  ]
  const nevek = new Map<string, string>()
  if (idk.length > 0) {
    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', idk)
      for (const p of (profs || []) as Array<{ id: string; full_name: string | null }>) {
        if (p.full_name) nevek.set(p.id, p.full_name)
      }
    } catch {
      // marad üres — lásd fent
    }
  }

  const jelolesek = new Map<string, ChangelogJeloles>()
  for (const r of rows) {
    jelolesek.set(r.release_changelog_key, {
      kiemelt: r.kiemelt === true,
      kiemelteNev: r.kiemelte ? (nevek.get(r.kiemelte) ?? null) : null,
      kiemelveAt: r.kiemelve_at,
      kikuldottnekJelolveAt: r.kikuldottnek_jelolve_at,
      kikuldottnekJelolteNev: r.kikuldottnek_jelolte
        ? (nevek.get(r.kikuldottnek_jelolte) ?? null)
        : null,
      megjegyzes: r.megjegyzes,
    })
  }

  return { jelolesek, needsSql: false, error: null }
}
