import 'server-only'

/**
 * LEJÁRAT-RADAR — 2026-08-11.
 *
 * MIÉRT LÉTEZIK
 * ─────────────
 * Két lejárati dátum ÉVEK ÓTA tárolva és szerkeszthető a rendszerben, de SOHA
 * senki nem számolt vele:
 *   · `sirhelyberles.lejarata` — sírhely-bérlet lejárata
 *   · `berleti_szerzodes.vege` — bérleti szerződés vége
 * A repóban egyetlen „hamarosan lejár" logika sem volt rájuk; a lelkész
 * papírról vagy fejből tartotta számon. Egy lejáró sírhely-bérlet egyszerre
 * BEVÉTEL (megújítás) és PASZTORÁLIS alkalom (a családot újra meg lehet
 * szólítani); egy lejáró bérleti szerződés jogi kockázat és elmaradt bevétel.
 *
 * FAIL LOUD
 * ─────────
 * A gyűjtő HIBÁT DOB, ha bármelyik forrás lekérdezése elhasal. Egy némán üres
 * radar rosszabb, mint a semmi: azt üzeni, hogy „nincs lejáró tétel", és a
 * lelkész megnyugszik. A felület a dobott hibát LÁTHATÓ hibaállapotként mutatja
 * (nem „nincs teendő" üzenetként) — lásd components/dashboard/expiry-radar-card.tsx.
 *
 * LAPOZÁS
 * ───────
 * Minden lista-lekérés a kanonikus `selectAllPaged`-en megy: a PostgREST 1000
 * soros plafonja némán csonkolna, és pont a legrégebbi (leghamarabb lejáró)
 * tételek maradnának ki.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectAllPaged } from '@kartoteka/supabase-client'

import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'

// ─────────────────────────────────────────────────────────────────────────
// Típusok és állandók
// ─────────────────────────────────────────────────────────────────────────

export type ExpiryKind = 'sirhely' | 'berlet'
/** `lejart` = már lejárt (max 1 éve) · `d90` = 90 napon belül · `d180` = 91–180 nap */
export type ExpiryBucket = 'lejart' | 'd90' | 'd180'

export interface ExpiryItem {
  /** Forrás + azonosító (stabil kulcs a React-listához és az értesítés-dedup-hoz). */
  key: string
  kind: ExpiryKind
  bucket: ExpiryBucket
  /** A lejárat napja, 'YYYY-MM-DD'. */
  lejarat: string
  /** Hátralévő napok — NEGATÍV, ha már lejárt. */
  napok: number
  /** Fősor (pl. „Régi temető · B parcella / 3. sor / 12."). */
  cim: string
  /** Másodsor (bérlő neve, szerződés tárgya) — lehet null. */
  reszlet: string | null
  /** Összeg RON-ban, ha ismert. */
  osszeg: number | null
  /** Hova vigyen a kattintás. */
  href: string
}

export interface ExpiryRadar {
  /** A számítás napja, 'YYYY-MM-DD' (a hívó adhat fix napot teszthez). */
  today: string
  /** Minden találat lejárat szerint növekvő sorrendben (a legsürgősebb elöl). */
  items: ExpiryItem[]
  counts: {
    lejart: number
    d90: number
    d180: number
    sirhely: number
    berlet: number
  }
}

/** Ennyi napra visszamenőleg mutatjuk a MÁR LEJÁRT tételeket is. */
export const EXPIRY_LOOKBACK_DAYS = 365
/** „Sürgős" küszöb. */
export const EXPIRY_SOON_DAYS = 90
/** A radar teljes előretekintése. */
export const EXPIRY_HORIZON_DAYS = 180

/**
 * A `.in(...)` szűrő GET-lekérdezés URL-jébe kerül. Több ezer sírhely-azonosító
 * 414-es (URI Too Long) hibát adna, ezért darabokban kérdezünk.
 */
const IN_CHUNK = 150

// ─────────────────────────────────────────────────────────────────────────
// Dátum-segédek (időzóna-független, naptári napokkal)
// ─────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' vagy ISO timestamp → csak a nap. `null`, ha értelmezhetetlen. */
function toIsoDay(value: string | null | undefined): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function dayToUtcMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function addDays(iso: string, days: number): string {
  return new Date(dayToUtcMs(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

function diffDays(fromIso: string, toIsoValue: string): number {
  return Math.round((dayToUtcMs(toIsoValue) - dayToUtcMs(fromIso)) / 86_400_000)
}

function bucketOf(napok: number): ExpiryBucket | null {
  if (napok < 0) return napok >= -EXPIRY_LOOKBACK_DAYS ? 'lejart' : null
  if (napok <= EXPIRY_SOON_DAYS) return 'd90'
  if (napok <= EXPIRY_HORIZON_DAYS) return 'd180'
  return null
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function fail(source: string, message: string): never {
  throw new Error(
    `A lejárat-figyelő nem tudta betölteni a(z) ${source} adatokat: ${message}. ` +
      'Frissítsd az oldalt — ha újra elmarad, jelezd a rendszergazdának.',
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A gyűjtő
// ─────────────────────────────────────────────────────────────────────────

interface CemeteryRow {
  id: number
  nev: string | null
}
interface PlotRow {
  id: number
  parcella: string | null
  sor: number | null
  szam: string | null
  temetoid: number | null
}
interface LeaseRow {
  id: number
  sirhelyid: number | null
  lejarata: string | null
  berlo: string | null
  tipus: string | null
  osszeg: number | null
}
interface RentalRow {
  id: string
  berlo_nev: string | null
  targy: string | null
  tipus: string | null
  jogi_tipus: string | null
  osszeg: number | null
  fizetesi_ciklus: string | null
  vege: string | null
}

/**
 * A gyülekezet lejáró tételei. HIBÁT DOB, ha bármelyik forrás elhasal.
 *
 * @param supabase  RLS-es (felhasználói) VAGY service_role kliens — a hatókört
 *                  ez a függvény MAGA is végigviszi (temető → sírhely → bérlet,
 *                  illetve `congregation_id`), tehát nem az RLS-re támaszkodik.
 */
export async function collectExpiryRadar(
  supabase: SupabaseClient,
  congregationId: string,
  todayIso?: string,
): Promise<ExpiryRadar> {
  if (!congregationId) {
    // Fail-closed: hatókör nélkül NEM adunk vissza „üres, tehát rendben" radart.
    throw new Error('A lejárat-figyelő nem futtatható aktív gyülekezet nélkül.')
  }

  const today = todayIso || new Date().toISOString().slice(0, 10)
  const windowStart = addDays(today, -EXPIRY_LOOKBACK_DAYS)
  // A felső határ EXKLUZÍV következő nap: a `lejarata` timestamp, így a
  // `<= horizont` a horizont napján 00:00 utáni időpontokat kihagyná.
  const windowEndExclusive = addDays(today, EXPIRY_HORIZON_DAYS + 1)

  const items: ExpiryItem[] = []

  // ── 1) Sírhely-bérletek ────────────────────────────────────────────────
  // A `sirhely` / `sirhelyberles` táblákban NINCS congregation_id — a hatókör a
  // temető-FK-n át vezet (ugyanaz a lánc, mint a sirhelyek/actions.ts-ben).
  const cemeteries = await selectAllPaged<CemeteryRow>(
    supabase
      .from('sirhelytemeto')
      .select('id, nev')
      .eq('congregation_id', congregationId)
      .eq('deleted', false),
  )
  if (cemeteries.error) fail('temető', cemeteries.error.message)

  const cemeteryNames = new Map<number, string>()
  for (const c of cemeteries.data) cemeteryNames.set(c.id, (c.nev || '').trim() || 'Temető')
  const cemeteryIds = [...cemeteryNames.keys()]

  if (cemeteryIds.length > 0) {
    const plots = await selectAllPaged<PlotRow>(
      supabase
        .from('sirhely')
        .select('id, parcella, sor, szam, temetoid')
        .in('temetoid', cemeteryIds)
        .eq('deleted', false),
    )
    if (plots.error) fail('sírhely', plots.error.message)

    const plotById = new Map<number, PlotRow>()
    for (const p of plots.data) plotById.set(p.id, p)
    const plotIds = [...plotById.keys()]

    for (const ids of chunk(plotIds, IN_CHUNK)) {
      const leases = await selectAllPaged<LeaseRow>(
        supabase
          .from('sirhelyberles')
          .select('id, sirhelyid, lejarata, berlo, tipus, osszeg')
          .in('sirhelyid', ids)
          .eq('deleted', false)
          .gte('lejarata', windowStart)
          .lt('lejarata', windowEndExclusive),
      )
      if (leases.error) fail('sírhely-bérlet', leases.error.message)

      for (const l of leases.data) {
        // A megváltott (örökös) sírhelynek nincs értelmes lejárata — ha mégis
        // van dátum a soron, az legacy adat; nem riogatunk vele.
        if ((l.tipus || 'berles') === 'megvaltas') continue
        const lejarat = toIsoDay(l.lejarata)
        if (!lejarat) continue
        const napok = diffDays(today, lejarat)
        const bucket = bucketOf(napok)
        if (!bucket) continue

        const plot = l.sirhelyid != null ? plotById.get(l.sirhelyid) : undefined
        if (!plot) continue // más gyülekezet sírhelye — nem a miénk
        const temetoNev = plot.temetoid != null ? cemeteryNames.get(plot.temetoid) : undefined
        const hely = [
          plot.parcella ? `${plot.parcella} parcella` : null,
          plot.sor != null ? `${plot.sor}. sor` : null,
          plot.szam ? `${plot.szam}. sír` : null,
        ]
          .filter(Boolean)
          .join(' / ')

        items.push({
          key: `sirhely-${l.id}`,
          kind: 'sirhely',
          bucket,
          lejarat,
          napok,
          cim: [temetoNev, hely].filter(Boolean).join(' · ') || 'Sírhely-bérlet',
          reszlet: (l.berlo || '').trim() || null,
          osszeg: l.osszeg != null ? Number(l.osszeg) : null,
          href: '/sirhelyek',
        })
      }
    }
  }

  // ── 2) Bérleti szerződések ─────────────────────────────────────────────
  const rentals = await selectAllPaged<RentalRow>(
    supabase
      .from('berleti_szerzodes')
      .select('id, berlo_nev, targy, tipus, jogi_tipus, osszeg, fizetesi_ciklus, vege')
      .eq('congregation_id', congregationId)
      .eq('deleted', false)
      .eq('aktiv', true)
      .gte('vege', windowStart)
      .lt('vege', windowEndExclusive),
  )
  if (rentals.error) fail('bérleti szerződés', rentals.error.message)

  for (const r of rentals.data) {
    const lejarat = toIsoDay(r.vege)
    if (!lejarat) continue
    const napok = diffDays(today, lejarat)
    const bucket = bucketOf(napok)
    if (!bucket) continue

    const targy = (r.targy || '').trim()
    const tipusLabel = r.tipus === 'epulet' ? 'Épület' : 'Terület'
    items.push({
      key: `berlet-${r.id}`,
      kind: 'berlet',
      bucket,
      lejarat,
      napok,
      cim: targy || `${tipusLabel} bérbeadás`,
      reszlet: (r.berlo_nev || '').trim() || null,
      osszeg: r.osszeg != null ? Number(r.osszeg) : null,
      href: '/penzugy#rental',
    })
  }

  items.sort((a, b) => (a.lejarat === b.lejarat ? a.key.localeCompare(b.key) : a.lejarat.localeCompare(b.lejarat)))

  return {
    today,
    items,
    counts: {
      lejart: items.filter((i) => i.bucket === 'lejart').length,
      d90: items.filter((i) => i.bucket === 'd90').length,
      d180: items.filter((i) => i.bucket === 'd180').length,
      sirhely: items.filter((i) => i.kind === 'sirhely').length,
      berlet: items.filter((i) => i.kind === 'berlet').length,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Az irányítópult belépési pontja
// ─────────────────────────────────────────────────────────────────────────

export interface ExpiryRadarResult {
  radar?: ExpiryRadar
  /** Magyar, cselekvésre mutató hibaüzenet — a kártya EZT mutatja meg. */
  error?: string
}

/**
 * Az aktív gyülekezet radarja az irányítópultnak.
 *
 * A hibát ITT fogjuk el, de NEM nyeljük le: a kártya látható, piros
 * hibaállapotot mutat belőle. Ha hagynánk kibukni, a `Promise.all`-ban az
 * EGÉSZ irányítópult összeomlana egy másodlagos doboz miatt — a hangos jelzés
 * és a használható oldal így egyszerre teljesül.
 */
export async function getExpiryRadar(): Promise<ExpiryRadarResult> {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet — a lejárat-figyelő nem futtatható.' }

  try {
    return { radar: await collectExpiryRadar(supabase, congregationId) }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'ismeretlen hiba'
    console.error('[dashboard/expiry-radar]', message)
    return { error: message }
  }
}
