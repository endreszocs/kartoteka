/**
 * ÉRTESÍTÉSEK (harang-üzenetek) — MEGOSZTOTT TÍPUSOK ÉS TISZTA FÜGGVÉNYEK
 * (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KÜLÖN FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * A Next.js 16 szabálya szerint egy `'use server'` modul KIZÁRÓLAG async
 * függvényt exportálhat — típust és konstanst nem. A szerver-akciók az
 * `uzenetek-actions.ts`-ben laknak, minden más itt.
 *
 * ⚠️ EZ A FÁJL SZÁNDÉKOSAN DIREKTÍVA-MENTES: se `server-only`, se `use client`.
 *    A szerver-oldali oldal ÉS a kliens-oldali lista is ugyanezt a
 *    csoportosítást használja — két másolat előbb-utóbb széthúzna.
 */

/** Egy harang-üzenet a felületnek. Titkot, mentett adatot SOHA nem hordoz. */
export interface UzenetSor {
  id: string
  /** `ertesitesek.tipus`: info | success | warning | danger | support_reply | registration */
  tipus: string
  cim: string
  uzenet: string
  olvasva: boolean
  archived: boolean
  /** ISO. A felület Europe/Bucharest szerint írja ki. */
  createdAt: string
  readAt: string | null
  hivatkozas: string | null
  /** Hozzáférés-kérelem azonosítója (a jóváhagyó gombokhoz). */
  adminRequestId: string | null
  /** Az érintett gyülekezet NEVE, ha kideríthető. */
  congregationNev: string | null
  /**
   * A JELZETT BAJ AZÓTA ELMÚLT.
   *
   * ⚠️ KÉT FORRÁSBÓL JÖHET, és ez szándékos: az `ertesitesek.megoldva` oszlop
   * csak akkor létezik, ha a tulajdonos lefuttatta a
   * `2026-08-11-ertesites-megoldva.sql`-t. Amíg nem, a feloldás a címbe írja be
   * („Megoldva — …"), és a felület onnan ismeri fel. Egyik úton sem hazudunk.
   */
  megoldva: boolean
  megoldvaAt: string | null
  /** EGY mondat arról, MIÉRT nincs már baj. */
  megoldasUzenet: string | null
}

export interface UzenetLista {
  rows?: UzenetSor[]
  error?: string
  /** Több sor van, mint amennyit lekértünk (a felület kiírja). */
  tobbVan?: boolean
}

export interface UzenetMuveletEredmeny {
  success: boolean
  error?: string
}

/** A megoldott üzenetek cím-előtagja. Lásd `lib/google-drive/alerts.ts`. */
export const MEGOLDVA_CIM_ELOTAG = 'Megoldva — '

// ─────────────────────────────────────────────────────────────────────────────
// CSOPORTOSÍTÁS — TÍPUS SZERINT
// ─────────────────────────────────────────────────────────────────────────────

export type UzenetCsoport = 'baj' | 'kerelem' | 'elintezve' | 'hir'

export interface CsoportLeiras {
  id: UzenetCsoport
  cimke: string
  /** Egy mondat arról, MI kerül ebbe a csoportba. */
  leiras: string
  /** ColorTabs színkulcs. */
  szin: string
}

/**
 * ⚠️ NEM A `tipus` MEZŐ SORRENDJE, HANEM A LELKÉSZ KÉRDÉSE SZERINT.
 * A lelkész nem azt kérdezi, hogy „mi a `warning` típusú üzenetem", hanem hogy
 * „mivel van baj", „mit kell elintéznem", „mi ment el mellettem".
 */
export const CSOPORTOK: CsoportLeiras[] = [
  {
    id: 'baj',
    cimke: 'Baj van',
    leiras: 'Amivel tenni kell valamit: hiba, figyelmeztetés, elmaradt mentés.',
    szin: 'red',
  },
  {
    id: 'kerelem',
    cimke: 'Kérelem, döntés',
    leiras: 'Hozzáférés-kérés, regisztráció, átjelentkezés — rád vár a válasz.',
    szin: 'violet',
  },
  {
    id: 'elintezve',
    cimke: 'Elintézve',
    leiras: 'Ami sikerült, vagy aminek a baja azóta elmúlt.',
    szin: 'emerald',
  },
  { id: 'hir', cimke: 'Tájékoztatás', leiras: 'Hírlevél, újdonság, egyéb üzenet.', szin: 'blue' },
]

export function uzenetCsoportja(sor: Pick<UzenetSor, 'tipus' | 'megoldva' | 'adminRequestId'>): UzenetCsoport {
  // A MEGOLDOTT baj már nem baj — a lelkésznek nem kell rá visszatérnie.
  if (sor.megoldva) return 'elintezve'
  if (sor.adminRequestId) return 'kerelem'
  switch (sor.tipus) {
    case 'danger':
    case 'warning':
      return 'baj'
    case 'registration':
    case 'support_reply':
      return 'kerelem'
    case 'success':
      return 'elintezve'
    default:
      return 'hir'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDŐ-CSOPORTOSÍTÁS — Europe/Bucharest naptár szerint
// ─────────────────────────────────────────────────────────────────────────────

export type IdoCsoport = 'ma' | 'tegnap' | 'het' | 'korabban'

export const IDO_CIMKEK: Record<IdoCsoport, string> = {
  ma: 'Ma',
  tegnap: 'Tegnap',
  het: 'Az elmúlt héten',
  korabban: 'Korábban',
}

/**
 * ⚠️ NAPKULCS-ALAPÚ, NEM ÓRA-ALAPÚ. Egy 23:50-kor érkezett üzenet reggel 7-kor
 * „tegnapi", nem „7 órája" — a lelkész naptárban gondolkodik, nem órákban.
 * A napkulcsot a hívó adja (Europe/Bucharest), hogy ez a függvény tiszta maradjon.
 */
export function idoCsoportja(napKulcs: string, maKulcs: string, tegnapKulcs: string): IdoCsoport {
  if (napKulcs === maKulcs) return 'ma'
  if (napKulcs === tegnapKulcs) return 'tegnap'
  // 7 naptári nap: a `maKulcs`-tól visszafelé. String-összehasonlítás elég,
  // mert a `YYYY-MM-DD` alak lexikografikusan is rendezett.
  const het = napEltolKulcs(maKulcs, -7)
  return napKulcs >= het ? 'het' : 'korabban'
}

/** Naptári eltolás `YYYY-MM-DD` alakon (DST-független). */
export function napEltolKulcs(nap: string, napokkal: number): string {
  const [y, m, d] = nap.split('-').map((s) => Number(s))
  const t = Date.UTC(y, (m ?? 1) - 1, d ?? 1) + napokkal * 86_400_000
  const dt = new Date(t)
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${mm}-${dd}`
}

/**
 * A „Teendő:" sor kiemelése az üzenet törzséből.
 *
 * A mentés-riasztó (és több más küldő) egy `Teendő: …` sorral zárja az üzenetet.
 * A részletes nézet EZT teszi külön dobozba — a lelkész első kérdése ugyanis
 * nem az, hogy mi történt, hanem hogy MIT TEGYEK.
 */
export function bontUzenet(uzenet: string): { torzs: string; teendo: string | null } {
  const sorok = (uzenet ?? '').split('\n')
  const i = sorok.findIndex((s) => s.trimStart().startsWith('Teendő:'))
  if (i < 0) return { torzs: uzenet ?? '', teendo: null }
  const teendo = sorok
    .slice(i)
    .join(' ')
    .replace(/^\s*Teendő:\s*/, '')
    .trim()
  return { torzs: sorok.slice(0, i).join('\n').trim(), teendo: teendo || null }
}
