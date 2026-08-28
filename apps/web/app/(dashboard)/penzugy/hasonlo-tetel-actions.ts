'use server'

/**
 * HASONLÓ (esetleg duplikált) TÉTEL FIGYELMEZTETÉS — Endre 8. kérése (2026-08-27).
 *
 * A kérés szó szerint: „A banki import után ha valaki pont abban az összegben,
 * pont azon a cégnévvel (itt a kb. egyezés is elég) és kb. ugyanazon a napon
 * (±3 nap) akarja bevezetni, akkor jelezze a rendszer, hogy egy hasonló tételt
 * már rögzítettünk a banki résznél — mindenképpen folytatni akarja?"
 *
 * Vagyis: NEM blokkolás, hanem megerősítést kérő figyelmeztetés mentés előtt.
 *
 * ── EZ A FÁJL CSAK AZ ADATOT HOZZA ────────────────────────────────────────
 * A DÖNTÉS (küszöbök, párosítás) a `@kartoteka/core` `hasonloTetelekKeresese`-ben
 * van, mert a desktop is ugyanazt használja. Ha itt is döntenénk, a két felület
 * előbb-utóbb mást tekintene „kb. ugyanaz"-nak.
 *
 * ── A KULCSOK, MÉRÉS ALAPJÁN (nem feltételezésből) ────────────────────────
 * · „banki eredetű" = `bankszamla_id IS NOT NULL`. SOHA nem az `irattipus`
 *   szövege: az élő adatban `banki`, `Extr`, `OP`, `Chit.`, `Készpénz` és 5 db
 *   ÜRES érték keveredik — épp az irattipus-feltételezés tette inertté az
 *   egyediségi indexet is.
 * · összeg: `COALESCE(osszeg_ron, osszeg)` — a banki import devizás számlánál
 *   az `osszeg`-be a DEVIZA-összeget írja, a RON-t az `osszeg_ron`-ba.
 * · ⛔ `belso_mozgas_xkey IS NULL` KÖTELEZŐ. A kassza↔bank átvezetés két lába
 *   DEFINÍCIÓ SZERINT azonos dátumú és összegű — enélkül MINDEN készpénzletétel
 *   álriasztást adna a saját, kötelező párjára. Ez a legnagyobb álriasztás-forrás.
 * · törölt és sztornózott sor nem számít.
 *
 * ── ÁLRIASZTÁS-PRÓBA (élő adaton, 2026-08-27) ─────────────────────────────
 * A fenti szűrőkkel 548 kassza-bevételre 0 találat. Vagyis a figyelmeztetés
 * nem fog zajt csinálni.
 */

import {
  hasonloDatumAblak,
  hasonloTetelekKeresese,
  type HasonloTetelKerdes,
  type HasonloTetelMeglevo,
  type HasonloTetelTalalat,
} from '@kartoteka/core'
import { getFinanceScopeContext, tablesFor } from '@/lib/auth/finance-scope'

export async function checkSimilarBankEntries(
  sorok: HasonloTetelKerdes[],
): Promise<{ talalatok: HasonloTetelTalalat[]; error?: string }> {
  if (!sorok.length) return { talalatok: [] }

  const ctx = await getFinanceScopeContext()
  if ('error' in ctx) return { talalatok: [], error: ctx.error }
  // A `belso_mozgas_xkey` oszlop KIZÁRÓLAG a gyülekezeti táblákon létezik —
  // felső szinten a figyelmeztetésnek nincs is értelme (nincs banki import).
  if (ctx.scope !== 'congregation') return { talalatok: [] }
  const T = tablesFor(ctx.scope)

  const ablak = hasonloDatumAblak(sorok)
  if (!ablak) return { talalatok: [] }

  const kellBev = sorok.some((s) => s.type === 'income')
  const kellKia = sorok.some((s) => s.type === 'expense')

  const [bevRes, kiaRes] = await Promise.all([
    kellBev
      ? ctx.supabase
          .from(T.befizetes)
          .select('id, datum, osszeg, osszeg_ron, forrasa, iratszam')
          .eq('congregation_id', ctx.scopeId)
          .not('bankszamla_id', 'is', null)
          .is('belso_mozgas_xkey', null)
          .eq('deleted', false)
          .eq('stornozott', false)
          .gte('datum', ablak.tol)
          .lt('datum', ablak.igExkl)
      : Promise.resolve({ data: [], error: null }),
    kellKia
      ? ctx.supabase
          .from(T.kiadas)
          .select('id, datum, osszeg, osszeg_ron, atvevo, iratszam')
          .eq('congregation_id', ctx.scopeId)
          .not('bankszamla_id', 'is', null)
          .is('belso_mozgas_xkey', null)
          .eq('deleted', false)
          .eq('stornozott', false)
          .gte('datum', ablak.tol)
          .lt('datum', ablak.igExkl)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (bevRes.error || kiaRes.error) {
    // FAIL-OPEN, SZÁNDÉKOSAN: ez FIGYELMEZTETÉS, nem védelem. Ha nem tudjuk
    // ellenőrizni, NEM akadályozzuk meg a rögzítést — a lelkész munkája
    // fontosabb, mint egy tájékoztató jelzés. A hívó a hibát megjelenítheti.
    const msg = bevRes.error?.message || kiaRes.error?.message || 'ismeretlen'
    return { talalatok: [], error: msg }
  }

  const mapSor = (r: Record<string, unknown>, nevOszlop: string): HasonloTetelMeglevo => ({
    datum: String(r.datum ?? '').slice(0, 10),
    osszeg: Number((r.osszeg_ron ?? r.osszeg) as number) || 0,
    nev: String(r[nevOszlop] ?? ''),
    iratszam: (r.iratszam as string | null) ?? null,
  })

  const talalatok = hasonloTetelekKeresese(
    sorok,
    ((bevRes.data || []) as Array<Record<string, unknown>>).map((r) => mapSor(r, 'forrasa')),
    ((kiaRes.data || []) as Array<Record<string, unknown>>).map((r) => mapSor(r, 'atvevo')),
  )

  return { talalatok }
}
