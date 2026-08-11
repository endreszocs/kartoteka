'use server'

/**
 * CHANGELOG-jelölések — csillagozás és KÉZI „kiküldöttnek jelölés" (2026-08-12).
 *
 * Endre kérése: „kerlek lehessen CSILLAGOZNI a fontosabbakat vagy
 * KIKULDOTTNEK JELOLNI."
 *
 * ─── MIÉRT KÖZÖS (nem személyes) ────────────────────────────────────────────
 * A „kiküldöttnek jelölve" nem ízlés, hanem TÉNYÁLLÍTÁS a rendszer állapotáról.
 * Ha személyes lenne, két rendszergazda ellentmondó képet látna, és ugyanaz a
 * frissítés kétszer menne ki ~495 gyülekezetnek — visszafordíthatatlanul (egy
 * elküldött e-mailt nem lehet visszahívni). A valódi kiküldés (system_broadcasts)
 * ÚGYIS közös; egy személyes réteg mellé téve a felület két, egymásnak
 * ellentmondó logikát mutatna. A csillag ugyanígy: a hírlevél TARTALMÁT rendezi,
 * ez közös szerkesztői döntés, nem magánjegyzet.
 * KÖZÖS, DE ELSZÁMOLTATHATÓ: eltároljuk, KI és MIKOR jelölte, és a felület ezt
 * kiírja. Ha később kellene személyes csillag, egy (kulcs, user_id) kompozit
 * kulcsú MÁSODIK tábla hozzátehető anélkül, hogy ez változna.
 *
 * ─── AMIT SOSEM CSINÁL ──────────────────────────────────────────────────────
 * A kézi jelölés NEM küld ki semmit, és NEM tesz úgy, mintha kiküldött volna:
 * a felületen külön ikonnal és külön szöveggel jelenik meg („Kézzel
 * kiküldöttnek jelölve · Szőcs Endre, 2026-08-12"), sosem a valódi kiküldés
 * zöld pipájával. A jelölés VISSZAVONHATÓ.
 *
 * ⚠️ Next.js 16: `use server` fájl CSAK async függvényt exportálhat — a típusok
 *    a `changelog-jelolesek-shared.ts`-ben élnek.
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { hianyzoTablaHiba } from '@/lib/broadcasts/jelolesek'
import { parseChangelog } from '@/lib/broadcasts/changelog-parser'
import type { JelolesEredmeny } from './changelog-jelolesek-shared'

const HIANYZO_TABLA_UZENET =
  'A jelölések tárolója még nincs telepítve az adatbázisban. Futtasd le a migration-docs/sql/2026-08-12-changelog-jelolesek.sql fájlt, utána ez a gomb működni fog.'

async function guard() {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }
  if (!access.admin && !access.master && !access.egyhazkeruletiAdmin) {
    return { error: 'Nincs jogosultsága a frissítések jelöléséhez.' as const }
  }
  return { supabase: access.supabase, userId: access.user.id }
}

/**
 * A kulcs LÉTEZIK-e a fejlesztési naplóban.
 *
 * ⚠️ Fail-closed: kitalált kulcsra nem engedünk jelölést. Egy „árva" jelölés
 * soha nem tűnne fel a felületen (nincs mihez rendelni), de a számokat
 * elrontaná — pontosan az a fajta néma torzítás, amit most javítunk.
 */
async function ervenyesKulcs(kulcs: string): Promise<boolean> {
  if (!/^[a-z0-9-]+$/.test(kulcs)) return false
  const entries = await parseChangelog()
  return entries.some((e) => e.key === kulcs)
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Csillagozás be/ki
// ─────────────────────────────────────────────────────────────────────────

export async function setChangelogKiemelt(
  kulcs: string,
  kiemelt: boolean,
): Promise<JelolesEredmeny> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  if (!(await ervenyesKulcs(kulcs))) {
    return { error: 'Ismeretlen frissítés-azonosító — a fejlesztési naplóban nincs ilyen bejegyzés.' }
  }

  const most = new Date().toISOString()
  const { error } = await ctx.supabase.from('changelog_jelolesek').upsert(
    {
      release_changelog_key: kulcs,
      kiemelt,
      kiemelte: kiemelt ? ctx.userId : null,
      kiemelve_at: kiemelt ? most : null,
      updated_at: most,
    },
    { onConflict: 'release_changelog_key' },
  )

  if (error) {
    if (hianyzoTablaHiba(error.message)) return { needsSql: true, error: HIANYZO_TABLA_UZENET }
    return { error: `A kiemelés mentése nem sikerült: ${error.message}` }
  }

  revalidatePath('/admin/frissitesek')
  revalidatePath('/admin')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Kézi „kiküldöttnek jelölés" — és a visszavonása
// ─────────────────────────────────────────────────────────────────────────

export async function setChangelogKikuldottnekJelolve(args: {
  kulcs: string
  jelolve: boolean
  megjegyzes?: string | null
}): Promise<JelolesEredmeny> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  if (!(await ervenyesKulcs(args.kulcs))) {
    return { error: 'Ismeretlen frissítés-azonosító — a fejlesztési naplóban nincs ilyen bejegyzés.' }
  }

  const most = new Date().toISOString()
  const { error } = await ctx.supabase.from('changelog_jelolesek').upsert(
    {
      release_changelog_key: args.kulcs,
      kikuldottnek_jelolve_at: args.jelolve ? most : null,
      kikuldottnek_jelolte: args.jelolve ? ctx.userId : null,
      megjegyzes: args.jelolve ? (args.megjegyzes?.trim() || null) : null,
      updated_at: most,
    },
    { onConflict: 'release_changelog_key' },
  )

  if (error) {
    if (hianyzoTablaHiba(error.message)) return { needsSql: true, error: HIANYZO_TABLA_UZENET }
    return { error: `A jelölés mentése nem sikerült: ${error.message}` }
  }

  revalidatePath('/admin/frissitesek')
  revalidatePath('/admin')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Tömeges jelölés — a most felszínre került régi bejegyzésekhez
// ─────────────────────────────────────────────────────────────────────────

/**
 * Egyszerre több bejegyzés kiküldöttnek jelölése.
 *
 * MIÉRT KELL. A 2026-08-12-i elemző-javítás 112 olyan bejegyzést hozott be,
 * amit a régi kód NÉMÁN elnyelt (a betűvel toldott dátumúakat, pl.
 * `[2026-05-06c]`). Ezek jogosan „kiküldésre vár" állapotban jelennek meg —
 * de ha a tulajdonos tudja, hogy annak idején kimentek, egy kattintással
 * el tudja intézni mindet, ~495 gyülekezet zaklatása nélkül.
 */
export async function markChangelogEntriesSent(args: {
  kulcsok: string[]
  megjegyzes?: string | null
}): Promise<JelolesEredmeny & { jelolve?: number }> {
  const ctx = await guard()
  if ('error' in ctx) return { error: ctx.error }
  if (args.kulcsok.length === 0) return { error: 'Nincs kijelölt frissítés.' }

  const entries = await parseChangelog()
  const ismertKulcsok = new Set(entries.map((e) => e.key))
  const jok = [...new Set(args.kulcsok)].filter(
    (k) => /^[a-z0-9-]+$/.test(k) && ismertKulcsok.has(k),
  )
  if (jok.length === 0) {
    return { error: 'A kijelölt azonosítók közül egyik sem szerepel a fejlesztési naplóban.' }
  }

  const most = new Date().toISOString()
  const megjegyzes = args.megjegyzes?.trim() || null
  const { error } = await ctx.supabase.from('changelog_jelolesek').upsert(
    jok.map((kulcs) => ({
      release_changelog_key: kulcs,
      kikuldottnek_jelolve_at: most,
      kikuldottnek_jelolte: ctx.userId,
      megjegyzes,
      updated_at: most,
    })),
    { onConflict: 'release_changelog_key' },
  )

  if (error) {
    if (hianyzoTablaHiba(error.message)) return { needsSql: true, error: HIANYZO_TABLA_UZENET }
    return { error: `A jelölés mentése nem sikerült: ${error.message}` }
  }

  revalidatePath('/admin/frissitesek')
  revalidatePath('/admin')
  return { success: true, jelolve: jok.length }
}
