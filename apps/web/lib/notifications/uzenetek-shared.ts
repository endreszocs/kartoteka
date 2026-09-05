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

import type { Felado } from './felado'

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
  /**
   * 2026-09-05: KITŐL jön az üzenet — az új felado_* oszlopokból, vagy régi
   * sornál a `feladoBontas()` levezetéséből (lib/notifications/felado.ts).
   * A beszélgetés-nézet ezek szerint csoportosít.
   */
  felado?: Felado
  /**
   * 2026-09-05: a törzs SZERVEREN renderelt, megtisztított HTML-je (marked +
   * sanitize-html) — a hírlevél markdownja eddig nyers szövegként jelent meg.
   * null = sima szöveg (a felület sortörésekkel mutatja).
   */
  uzenetHtml?: string | null
  /**
   * 2026-09-05: EGYSOROS kivonat a listákhoz (csengő-panel, beszélgetés-lista).
   * Markdown-sornál a jelek lecsupaszítva (`markdownSzoveg`), szöveg-sornál az
   * első tartalmas sor — a `##` és `**` így a kivonatban sem látszik.
   */
  kivonat?: string
  /** 2026-09-05: `ertesitesek.uzenet_format` — 'text' (alap) vagy 'markdown' (csak hírlevél). */
  uzenetFormat?: 'text' | 'markdown'
  /** 2026-09-05: a körlevél azonosítója (system_broadcasts.id), ha a sor hírlevél. */
  broadcastId?: string | null
}

/**
 * A CSENGŐ-PANEL adata (2026-09-05, D3): a legfrissebb néhány sor (olvasatlanok
 * elöl), a VALÓDI olvasatlan-szám (count, nem a lista hossza — a régi panel
 * 30-nál nem tudott többet mondani), és a függő átjelentkezési kérelmek száma.
 */
export interface FrissErtesitesek {
  sorok: UzenetSor[]
  olvasatlan: number
  fuggoKerelmek: number
  /** Magyar hibaüzenet — a felület KIÍRJA, nem 0-t mutat helyette. */
  error?: string
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

// ─────────────────────────────────────────────────────────────────────────────
// KIVONAT — egy sor a listákhoz (2026-09-05)
// ─────────────────────────────────────────────────────────────────────────────

/** Legfeljebb ennyi karakter egy lista-kivonatban. */
export const KIVONAT_HOSSZ = 160

/**
 * Markdown → egysoros, JELEK NÉLKÜLI szöveg (a csengő-panel és a beszélgetés-
 * lista kivonatához). NEM renderelő — csak a `##`, `**`, `-`, `[…](…)` jeleket
 * csupaszítja le, hogy a hírlevél első sora ne `## A hírlevélben…` legyen.
 *
 * Direktíva-mentes és függőség nélküli: a szerver-akció és a kliens-lista is
 * ugyanezt használja. A HTML-renderelés (marked + sanitize-html) a szerver-
 * oldali `ertesites-render.ts`-ben él, amely ezt innen re-exportálja.
 */
export function markdownSzoveg(md: string, max = KIVONAT_HOSSZ): string {
  let s = String(md ?? '')
  s = s.replace(/```[\s\S]*?```/g, ' ') // kódblokk
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // kép → alt-szöveg
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // link → a link szövege
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '') // címsor-jel
  s = s.replace(/^\s{0,3}>\s?/gm, '') // idézet-jel
  s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '') // lista-jel
  s = s.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ') // vízszintes vonal
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2') // félkövér
  s = s.replace(/\*([^*\n]+)\*/g, '$1') // dőlt (csak csillaggal — az aláhúzás szavakban is előfordul)
  s = s.replace(/`([^`]*)`/g, '$1') // kód
  s = s.replace(/<[^>]+>/g, ' ') // nyers HTML-címke
  return rovidit(s, max)
}

/**
 * Sima szöveg → egysoros kivonat: a törzs a `Teendő:` sor nélkül (az a
 * részletes nézet külön doboza), összevont szóközökkel, hossz-plafonnal.
 */
export function szovegKivonat(uzenet: string, max = KIVONAT_HOSSZ): string {
  const { torzs } = bontUzenet(String(uzenet ?? ''))
  return rovidit(torzs, max)
}

function rovidit(s: string, max: number): string {
  const egySor = s.replace(/\s+/g, ' ').trim()
  if (egySor.length <= max) return egySor
  return `${egySor.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}
