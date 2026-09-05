import 'server-only'

/**
 * ÉRTESÍTÉS BESZÚRÁSA — AZ EGYETLEN ÚT AZ `ertesitesek` TÁBLÁBA (2026-09-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * A 2026-09-05-i felmérés ~30 beszúró helyet talált az `apps/web` alatt, és
 * MINDEGYIK máshogy írta a sort: volt, amelyik a hibát eldobta (`await
 * supabase.from('ertesitesek').insert(...)` eredmény nélkül), volt, amelyik
 * `try {} catch {}`-ben nyelte el, és EGYIK sem tudta megmondani, KITŐL jön
 * az üzenet. A feladó-oszlopok (felado_tipus / felado_nev / felado_id) a
 * `2026-09-05-ertesitesek-felado.sql`-lel jönnek — de a kód a migráció ELŐTT
 * és UTÁN is ugyanúgy kell, hogy működjön.
 *
 * EZ A SEGÉD HÁROM DOLGOT GARANTÁL:
 *  1. MINDEN sornak van feladója. A hívó adja (`...feladoMezok(...)`, lásd
 *     lib/notifications/felado.ts); ha nem adja, a `feladoBontas()` óvatos
 *     levezetése tölti ki, és a sor `felado_levezetett = true` jelet kap — a
 *     felület így őszintén „valószínű feladó"-t mondhat, sosem talál ki
 *     személyt.
 *  2. MIGRÁCIÓ ELŐTTI KECSES VISSZAESÉS. Ha az adatbázisban még nincsenek
 *     meg az új oszlopok, a PostgREST „Could not find the 'felado_tipus'
 *     column" (PGRST204) vagy a Postgres 42703 hibáját adja. Ilyenkor a
 *     hiányzó oszlop NÉLKÜL ismételjük a beszúrást — az üzenet kézbesül, a
 *     feladó a migráció utáni visszatöltésből kerül rá. A visszaesés NEM
 *     néma: egyszer (oszloponként) a szerver-napló megmondja, melyik SQL
 *     hiányzik, és az eredmény `visszaeses: true`-t hordoz.
 *  3. NÉMA HIBA TILOS. Minden hiba `console.warn`-nal a naplóba kerül ÉS
 *     magyar üzenetként visszamegy a hívónak — a hívó dönti el, hogy
 *     figyelmeztetésként mutatja-e (a fő művelet többnyire már megtörtént).
 *
 * ⚠️ A `scripts/selftest-ertesites-felado.mjs` forrás-őre BUKIK, ha az
 *    `apps/web` alatt bárhol közvetlen `from('ertesitesek').insert(` marad
 *    ezen a fájlon kívül. Az asztali alkalmazás (apps/desktop) nem importálhat
 *    innen — az egyetlen ottani beszúró a három feladó-mezőt szó szerint kapja.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { feladoBontas, type FeladoMezok } from './felado'

export type UzenetFormat = 'text' | 'markdown'

/**
 * Egy beszúrandó értesítés. A feladó-mezők a `feladoMezok()` szétterítésével
 * jönnek (`...feladoMezok('gyulekezet', nev, id)`); ha hiányoznak, levezetjük.
 */
export interface ErtesitesBemenet extends Partial<FeladoMezok> {
  /** A CÍMZETT profil-azonosítója. Kötelező — címzett nélküli sort senki nem lát. */
  user_id: string
  cim: string
  uzenet: string
  /** info | success | warning | danger | support_reply | registration | release */
  tipus?: string
  congregation_id?: string | null
  hivatkozas?: string | null
  olvasva?: boolean
  /** Hozzáférés-kérelem azonosítója — CSAK létező admin_access_requests sorra. */
  admin_request_id?: string | null
  /** Gépi JSON-szöveg (dedup-kulcs, riasztás-fajta). Oszlop: 2026-09-03 ANAF SQL. */
  megjegyzes?: string | null
  /** A hírlevél-sor visszamutat a körlevélre (system_broadcasts.id). */
  broadcast_id?: string | null
  /** Alap 'text'. CSAK a rendszergazdai hírlevél 'markdown' — felhasználói szöveg SOHA. */
  uzenet_format?: UzenetFormat
}

export interface ErtesitesBeszurasEredmeny {
  /** Magyar hibaüzenet, vagy null, ha minden sor bekerült. */
  error: string | null
  /** Ennyi sort próbáltunk beszúrni (0 = üres bemenet — az nem hiba). */
  darab: number
  /** true = a migráció előtti sémára estünk vissza (egy vagy több új oszlop nélkül ment). */
  visszaeses: boolean
  /** Melyik oszlopok maradtak ki a visszaesésben (üres, ha nem volt visszaesés). */
  kihagyottOszlopok: string[]
}

export interface ErtesitesBeszurasOpciok {
  /** Rövid címke a naplóhoz (pl. 'broadcast', 'transfer-dontes') — a hibakeresést segíti. */
  forras?: string
}

/**
 * Azok az oszlopok, amelyek KÉSŐBBI migrációval jöttek, ezért egy még nem
 * frissített adatbázisban hiányozhatnak. CSAK ezeket hagyjuk el visszaesésnél —
 * egy elgépelt alap-oszlop (pl. `cim`) hibája hangosan visszamegy.
 *
 *  · felado_* / uzenet_format / broadcast_id — 2026-09-05-ertesitesek-felado.sql
 *  · megjegyzes                              — 2026-09-03-anaf-60-napos-csengo.sql
 *  · admin_request_id                        — 2026-04-09 (régi, de a hivatkozás
 *                                              előtagja nélküle is hordozza az id-t)
 */
const ELHAGYHATO_OSZLOPOK: ReadonlySet<string> = new Set([
  'felado_tipus',
  'felado_nev',
  'felado_id',
  'felado_levezetett',
  'uzenet_format',
  'broadcast_id',
  'megjegyzes',
  'admin_request_id',
])

/** Oszloponként EGYSZER figyelmeztetünk folyamatonként — ne árassza el a naplót. */
const marFigyelmeztetett = new Set<string>()

/**
 * Ha a hiba egy HIÁNYZÓ OSZLOPRÓL szól, visszaadja a nevét — különben null.
 *
 * Két alak létezik:
 *  · PostgREST (PGRST204): `Could not find the 'felado_tipus' column of 'ertesitesek' in the schema cache`
 *  · Postgres (42703):     `column "felado_tipus" of relation "ertesitesek" does not exist`
 *                          `column ertesitesek.megjegyzes does not exist` (szűrőben)
 *
 * Exportált, mert a TVA-figyelő dedup-lekérdezése is erre a felismerésre épül.
 */
export function hianyzoOszlopNeve(
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
): string | null {
  if (!error) return null
  const szoveg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  const postgrest = szoveg.match(/Could not find the ['"]([A-Za-z0-9_]+)['"] column/i)
  if (postgrest) return postgrest[1]
  const pg = szoveg.match(/column\s+"([A-Za-z0-9_]+)"/i) ?? szoveg.match(/column\s+[a-z0-9_]+\.([A-Za-z0-9_]+)\s+does not exist/i)
  if (pg && (error.code === '42703' || /does not exist/i.test(szoveg))) return pg[1]
  return null
}

/**
 * A feladó-levezetés egy sorra (amikor a hívó nem adott feladót).
 * Külön függvény, hogy a selftest a helper viselkedését is mérhesse.
 */
function feladoKitoltes(sor: ErtesitesBemenet): Record<string, unknown> {
  if (sor.felado_tipus) {
    return {
      felado_tipus: sor.felado_tipus,
      felado_nev: (sor.felado_nev ?? '').trim() || null,
      felado_id: sor.felado_id ?? null,
      felado_levezetett: false,
    }
  }
  const levezetett = feladoBontas({ tipus: sor.tipus, hivatkozas: sor.hivatkozas, cim: sor.cim, uzenet: sor.uzenet, congregationId: sor.congregation_id })
  return {
    felado_tipus: levezetett.tipus,
    felado_nev: levezetett.nev,
    felado_id: levezetett.id,
    felado_levezetett: true,
  }
}

/** A DB-sor összeállítása — csak a MEGADOTT opcionális oszlopok kerülnek bele. */
function dbSor(sor: ErtesitesBemenet): Record<string, unknown> {
  const rekord: Record<string, unknown> = {
    user_id: sor.user_id,
    cim: sor.cim,
    uzenet: sor.uzenet,
    tipus: sor.tipus ?? 'info',
    olvasva: sor.olvasva ?? false,
    congregation_id: sor.congregation_id ?? null,
    hivatkozas: sor.hivatkozas ?? null,
    uzenet_format: sor.uzenet_format ?? 'text',
    ...feladoKitoltes(sor),
  }
  if (sor.admin_request_id) rekord.admin_request_id = sor.admin_request_id
  if (sor.megjegyzes != null) rekord.megjegyzes = sor.megjegyzes
  if (sor.broadcast_id) rekord.broadcast_id = sor.broadcast_id
  return rekord
}

/**
 * Értesítés(ek) beszúrása feladóval, formátummal, visszaeséssel.
 *
 * SOHA NEM DOB: minden hiba `{ error }`-ként jön vissza (és a naplóba is
 * kerül). A hívó a fő műveletet már elvégezte — az ő dolga eldönteni, hogy a
 * hibát figyelmeztetésként mutatja-e.
 */
export async function insertErtesites(
  supabase: SupabaseClient,
  sorok: ErtesitesBemenet | ErtesitesBemenet[],
  opciok: ErtesitesBeszurasOpciok = {},
): Promise<ErtesitesBeszurasEredmeny> {
  const lista = Array.isArray(sorok) ? sorok : [sorok]
  const cimke = opciok.forras ? ` (${opciok.forras})` : ''
  const eredmeny: ErtesitesBeszurasEredmeny = {
    error: null,
    darab: lista.length,
    visszaeses: false,
    kihagyottOszlopok: [],
  }
  if (lista.length === 0) return eredmeny

  // ── Bemenet-őr: címzett és cím nélkül nincs mit beszúrni ─────────────────
  const hibasSor = lista.find((s) => !s.user_id || !(s.cim ?? '').trim())
  if (hibasSor) {
    eredmeny.error = !hibasSor.user_id
      ? 'Az értesítésnek nincs címzettje (user_id) — címzett nélküli sort senki nem látna.'
      : 'Az értesítésnek nincs címe.'
    console.warn(`[ertesitesek] beszúrás elmaradt${cimke}: ${eredmeny.error}`)
    return eredmeny
  }

  let rekordok = lista.map(dbSor)

  // ── Beszúrás, hiányzó-oszlop visszaeséssel (oszloponként legfeljebb egyszer) ─
  for (let kor = 0; kor <= ELHAGYHATO_OSZLOPOK.size; kor += 1) {
    let hiba: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null = null
    try {
      const { error } = await supabase.from('ertesitesek').insert(rekordok)
      hiba = error
    } catch (e) {
      hiba = { message: e instanceof Error ? e.message : String(e) }
    }
    if (!hiba) return eredmeny

    const oszlop = hianyzoOszlopNeve(hiba)
    if (oszlop && ELHAGYHATO_OSZLOPOK.has(oszlop) && !eredmeny.kihagyottOszlopok.includes(oszlop)) {
      eredmeny.visszaeses = true
      eredmeny.kihagyottOszlopok.push(oszlop)
      if (!marFigyelmeztetett.has(oszlop)) {
        marFigyelmeztetett.add(oszlop)
        console.warn(
          `[ertesitesek] a(z) "${oszlop}" oszlop még nincs az adatbázisban — az értesítés nélküle ment be. ` +
            'Futtasd a migration-docs/sql/2026-09-05-ertesitesek-felado.sql fájlt (a megjegyzes oszlophoz a 2026-09-03-anaf-60-napos-csengo.sql-t).',
        )
      }
      rekordok = rekordok.map((r) => {
        const masolat = { ...r }
        delete masolat[oszlop]
        return masolat
      })
      continue
    }

    eredmeny.error = `Az értesítés beszúrása nem sikerült: ${hiba.message ?? 'ismeretlen hiba'}`
    console.warn(`[ertesitesek] beszúrás sikertelen${cimke}: ${hiba.message ?? 'ismeretlen hiba'}`)
    return eredmeny
  }

  eredmeny.error = 'Az értesítés beszúrása nem sikerült: túl sok hiányzó oszlop az adatbázisban.'
  console.warn(`[ertesitesek] beszúrás sikertelen${cimke}: ${eredmeny.error}`)
  return eredmeny
}
