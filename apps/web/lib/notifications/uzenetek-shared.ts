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
   * ⚠️ HÁROM FORRÁSBÓL JÖHET, és ez szándékos — de a FELÜLET CSAK EZT AZ EGY
   * MEZŐT NÉZI (a `valaszraVarE`, a Megoldva-pill és a zöld sáv mind innen):
   *   1. az `ertesitesek.megoldva` oszlop (csak a `2026-08-11-ertesites-megoldva.sql`
   *      után létezik);
   *   2. a cím-előtag („Megoldva — …"): a feloldás ezt írja, ha az oszlop nincs meg;
   *   3. 2026-09-05 (P3): hozzáférés-kérelemnél a KÉRELEM TÉNYLEGES ÁLLAPOTA
   *      (`admin_access_requests.status` ∈ approved/denied/expired — fehérlista,
   *      `KERELEM_ELDOLT_ALLAPOTOK`) — a 2026-09-05 előtti döntések a sort nem
   *      jelölték meg, így a „Válaszra vár" pill és a gombpár sosem oldódott fel;
   *   4. 2026-09-05 (P3-utómunka, bírálói P2): a sor MAGA A DÖNTÉS — a
   *      kérelmező „Hozzáférés jóváhagyva/elutasítva" (`success`/`danger`)
   *      értesítése kérelem-hivatkozással (`kerelemDontesSorE`). Nincs mire
   *      várni, ezért a tartalék-ágon (a kérelem-lekérés hibája → üres térkép)
   *      sem kaphat „Válaszra vár" pillt és Jóváhagyás/Elutasítás gombot a
   *      KÉRELMEZŐ a saját döntés-értesítésén.
   *   A négy szabály EGY helyen él: `megoldasLevezetes()`. Egyik úton sem hazudunk.
   */
  megoldva: boolean
  megoldvaAt: string | null
  /** EGY mondat arról, MIÉRT nincs már baj. */
  megoldasUzenet: string | null
  /**
   * 2026-09-05 (P3-utómunka): a sor MAGA A DÖNTÉS (a kérelmező értesítése a
   * jóváhagyásról/elutasításról). A `megoldva` ilyenkor mindig true, de a
   * buborék NEM rajzol „Ez a baj azóta elmúlt" sávot — egy elutasításon az a
   * mondat önellentmondó volna (bírálói P3). A `megoldasLevezetes()` tölti,
   * ugyanabból az egy szabályból, mint a `megoldva`-t.
   */
  dontesSor?: boolean
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
  /**
   * 2026-09-05 (P3-utómunka): NEM VÉGZETES — a sorok és a számlálók megvannak,
   * de a hozzáférés-kérelmek állapotának mellék-lekérése nem sikerült (vagy egy
   * függőnek látszó sor kérelme nem látható), ezért a „Válaszra vár" az érintett
   * soroknál a sor saját jelöléséből jön. A csengő KIÍRJA (borostyán, mint a
   * lista) — a `error`-tól függetlenül, hogy egy számláló-hiba se nyelje el.
   */
  warning?: string
}

export interface UzenetLista {
  rows?: UzenetSor[]
  error?: string
  /** Több sor van, mint amennyit lekértünk (a felület kiírja). */
  tobbVan?: boolean
  /**
   * 2026-09-05 (P3): NEM VÉGZETES hiba — a lista megvan, de egy mellék-lekérés
   * (a hozzáférés-kérelmek tényleges állapota) nem sikerült, ezért a
   * „Válaszra vár" jelölés az érintett soroknál csak a sor saját jelöléséből
   * jön. A felület KIÍRJA — néma függő nincs.
   */
  warning?: string
}

export interface UzenetMuveletEredmeny {
  success: boolean
  error?: string
}

/** A megoldott üzenetek cím-előtagja. Lásd `lib/google-drive/alerts.ts`. */
export const MEGOLDVA_CIM_ELOTAG = 'Megoldva — '

// ─────────────────────────────────────────────────────────────────────────────
// HOZZÁFÉRÉS-KÉRELEM — a „megoldva" levezetése a kérelem TÉNYLEGES állapotából
// (2026-09-05, P3-utómunka)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A hivatkozott `admin_access_requests` sor OLVASÁSKOR lekért állapota.
 * `status`: pending | approved | denied | expired (CHECK-kel őrzött oszlop).
 */
export interface KerelemAllapot {
  status: string
  approvedAt: string | null
  deniedAt: string | null
  expiresAt: string | null
}

/** Egy `admin_access_requests` sor a PostgREST-ből (a `kerelemAllapotok` select-je). */
export interface NyersKerelemSor {
  id: string
  status: string | null
  approved_at: string | null
  denied_at: string | null
  expires_at: string | null
}

/**
 * Nyers kérelem-sorok → állapot-térkép. A kulcs a kérelem azonosítója
 * KISBETŰSEN — ugyanaz az alak, mint a `kerelemAzonosito` kimenete, hogy a
 * keresés mindig találjon. TISZTA függvény: a `kerelemAllapotok`
 * (uzenetek-actions.ts) ezt hívja, és a selftest-ertesites-nezet.mjs ezt
 * futtatja — az őr így a BEKÖTÉST is látja, nem csak a szabályt (bírálói P3:
 * a `kerelem: undefined` mutáns az integrációs ponton addig zölden átment).
 */
export function kerelemAllapotTerkep(
  sorok: ReadonlyArray<NyersKerelemSor>,
  terkep: Map<string, KerelemAllapot> = new Map(),
): Map<string, KerelemAllapot> {
  for (const k of sorok) {
    terkep.set(String(k.id ?? '').toLowerCase(), {
      status: k.status ?? '',
      approvedAt: k.approved_at ?? null,
      deniedAt: k.denied_at ?? null,
      expiresAt: k.expires_at ?? null,
    })
  }
  return terkep
}

/** A hozzáférés-kérelem hivatkozásának előtagja a régi (2026-04-09 előtti) sorokon. */
export const KERELEM_HIVATKOZAS_ELOTAG = 'admin_access:'

/**
 * Szabályos UUID-alak (8-4-4-4-12, hexa) — EGY forrás a TS és az SQL számára:
 * a 2026-09-05-ertesitesek-p3.sql pontosan ezt az alakot castolja a régi
 * `admin_access:<uuid>` hivatkozásból (a selftest-ertesites-p3-sql.mjs innen
 * méri, hogy a két szabály nem húzott szét).
 *
 * MIÉRT (bírálói P3): a `kerelemAllapotok` egy uuid oszlopra küldi az
 * azonosítókat (`.in('id', …)`) — EGYETLEN rossz alakú érték 22P02-vel az
 * EGÉSZ darabot elbuktatná → üres térkép → MINDEN kérelem-sor a saját
 * jelölésére esne vissza, állandó borostyán figyelmeztetéssel. A rossz alak
 * ezért már itt, a forrásnál null (fail-closed: az ilyen sor nem kérelem-sor).
 */
export const UUID_MINTA_SZOVEG = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
export const UUID_MINTA = new RegExp(`^${UUID_MINTA_SZOVEG}$`)

/** Szabályos UUID → kisbetűsen (a PostgREST is így adja vissza); más → null. */
function szabalyosUuid(ertek: string | null | undefined): string | null {
  const s = String(ertek ?? '').trim()
  return UUID_MINTA.test(s) ? s.toLowerCase() : null
}

/**
 * A sor által hivatkozott kérelem azonosítója — EGY szabály az azonosítók
 * összegyűjtéséhez és az `alakit()`-hoz: az `admin_request_id` oszlop, vagy a
 * régi sorokon a `hivatkozas` `admin_access:<uuid>` alakja. CSAK szabályos
 * UUID (`UUID_MINTA`, kisbetűsítve — a térkép kulcsa így mindig egyezik);
 * más alak → null.
 */
export function kerelemAzonosito(
  adminRequestId: string | null | undefined,
  hivatkozas: string | null | undefined,
): string | null {
  const oszlop = szabalyosUuid(adminRequestId)
  if (oszlop) return oszlop
  if (typeof hivatkozas === 'string' && hivatkozas.startsWith(KERELEM_HIVATKOZAS_ELOTAG)) {
    return szabalyosUuid(hivatkozas.slice(KERELEM_HIVATKOZAS_ELOTAG.length))
  }
  return null
}

/**
 * A kérelem ELDŐLT állapotai — FEHÉRLISTA, EGY forrás. Az élő CHECK
 * (`admin_access_requests.status` ∈ pending/approved/denied/expired) a
 * `pending` mellett ezt a hármat engedi; az SQL visszatöltés WHERE-je
 * (2026-09-05-ertesitesek-p3.sql) ugyanezt a listát írja (`r.status IN (…)`),
 * a selftest-ertesites-p3-sql.mjs innen méri.
 */
export const KERELEM_ELDOLT_ALLAPOTOK: ReadonlyArray<string> = ['approved', 'denied', 'expired']

/**
 * ELDŐLT-E a kérelem? FAIL-CLOSED: CSAK egy ISMERT döntés-állapot
 * (`KERELEM_ELDOLT_ALLAPOTOK`) számít döntésnek — NEM „bármi, ami nem pending"
 * (bírálói P3: a feketelista egy ismeretlen állapotot is döntésnek vett volna).
 * Ismeretlen kérelem (nincs a térképben: RLS elrejtette vagy törölték), üres
 * vagy ismeretlen állapot → NEM eldőlt — egy valóban függő kérelmet sosem
 * rejtünk el a lelkész elől.
 */
export function kerelemEldoltE(k: KerelemAllapot | null | undefined): boolean {
  if (!k) return false
  const s = String(k.status ?? '').trim().toLowerCase()
  return KERELEM_ELDOLT_ALLAPOTOK.includes(s)
}

/** EGY mondat a buborék zöld sávjába — a döntés fajtája szerint. */
export function kerelemMegoldasMondat(status: string): string {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'approved':
      return 'A hozzáférési kérelem időközben jóváhagyásra került.'
    case 'denied':
      return 'A hozzáférési kérelem időközben elutasításra került.'
    case 'expired':
      return 'A hozzáférési kérelem időközben lejárt vagy visszavonták.'
    default:
      return `A hozzáférési kérelem már eldőlt (${String(status ?? '').trim() || 'ismeretlen állapot'}).`
  }
}

/** A döntés IDŐPONTJA a kérelem sorából (a „mikor múlt el a baj" felirathoz). */
export function kerelemDontesIdeje(k: KerelemAllapot): string | null {
  switch (String(k.status ?? '').trim().toLowerCase()) {
    case 'approved':
      return k.approvedAt ?? null
    case 'denied':
      return k.deniedAt ?? null
    case 'expired':
      return k.expiresAt ?? k.approvedAt ?? k.deniedAt ?? null
    default:
      return k.approvedAt ?? k.deniedAt ?? k.expiresAt ?? null
  }
}

/**
 * A KÉRELMEZŐ döntés-értesítésének típusai (notifications/actions.ts:
 * „Hozzáférés jóváhagyva" = `success`, „Hozzáférés elutasítva" = `danger`).
 * A lelkész KÉRELEM-sora mindig `warning` (admin/actions.ts, 2026-04-21 óta) —
 * a típus tehát biztonságosan különbözteti meg a két sort.
 */
export const KERELEM_DONTES_TIPUSOK: ReadonlyArray<string> = ['success', 'danger']

/**
 * A SOR MAGA A DÖNTÉS-E? Kérelem-hivatkozás + döntés-típus = a kérelmező
 * értesítése a jóváhagyásról/elutasításról. Nincs mire várni: a „Válaszra vár"
 * pill és a Jóváhagyás/Elutasítás gombpár ezen a soron SOHA nem jogos — a
 * kérelem tényleges állapotától és a kérelem-lekérés sikerétől FÜGGETLENÜL
 * (bírálói P2: a tartalék-ágon a kérelmező a saját elutasításán kapott gombot).
 */
export function kerelemDontesSorE(tipus: string | null | undefined, adminRequestId: string | null | undefined): boolean {
  return !!adminRequestId && KERELEM_DONTES_TIPUSOK.includes(String(tipus ?? '').trim().toLowerCase())
}

export interface Megoldas {
  megoldva: boolean
  /** A sor maga a döntés (`kerelemDontesSorE`) — a buborék nem rajzol „elmúlt baj" sávot. */
  dontesSor: boolean
  /** A kérelem döntésének ideje, ha a „megoldva" a kérelemből jön; különben null. */
  megoldvaAt: string | null
  /** A kérelemből levezetett mondat, ha a „megoldva" a kérelemből jön; különben null. */
  megoldasUzenet: string | null
}

/**
 * A „MEGOLDVA" EGYETLEN SZABÁLYA (a felület minden helye ebből az egy mezőből
 * dönt — lásd `UzenetSor.megoldva`):
 *   oszlop === true  VAGY  cím-előtag  VAGY  a sor maga a döntés  VAGY
 *   a hivatkozott kérelem eldőlt.
 *
 * A visszaadott `megoldvaAt` / `megoldasUzenet` CSAK a kérelem-ágból jön, és
 * CSAK a KÉRELEM-sorra (a lelkész `warning` értesítésére). A döntés-soron
 * (bírálói P3) az „…időközben elutasításra került" mondat önellentmondó volna
 * → ott null, és a `dontesSor` jel mondja meg a buboréknak, hogy sáv sincs.
 * A hívó a sor saját oszlopait (`megoldva_at`, `megoldas_uzenet`) elé teszi.
 */
export function megoldasLevezetes(input: {
  megoldvaOszlop: boolean | null | undefined
  cim: string
  /** `ertesitesek.tipus` — a döntés-sor felismeréséhez (`kerelemDontesSorE`). */
  tipus?: string | null
  /** A sor által hivatkozott kérelem azonosítója (`kerelemAzonosito`); null = nem kérelem-sor. */
  adminRequestId?: string | null
  kerelem: KerelemAllapot | null | undefined
}): Megoldas {
  const dontesSor = kerelemDontesSorE(input.tipus, input.adminRequestId)
  const eldolt = kerelemEldoltE(input.kerelem)
  const megoldva = input.megoldvaOszlop === true || String(input.cim ?? '').startsWith(MEGOLDVA_CIM_ELOTAG) || dontesSor || eldolt
  // A kérelem-ág narratívája (mikor, miért) CSAK a kérelem-sorra — a döntés-sor maga a válasz.
  const kerelem = eldolt && !dontesSor ? (input.kerelem ?? null) : null
  return {
    megoldva,
    dontesSor,
    megoldvaAt: kerelem ? kerelemDontesIdeje(kerelem) : null,
    megoldasUzenet: kerelem ? kerelemMegoldasMondat(kerelem.status) : null,
  }
}

/**
 * A NEM VÉGZETES figyelmeztetés szövege a kérelem-állapotok lekérése után.
 *  · a lekérés HIBÁJA → hangos (a „Válaszra vár" ezeknél a sor saját jelöléséből jön);
 *  · hiba nélkül is: ha egy sor olyan kérelemre hivatkozik, amelyet az olvasó nem
 *    lát (RLS elrejtette vagy törölték) ÉS a sor a felületen függőként állna
 *    (nincs saját megoldva-jel, nem archivált) → kiírjuk, hány ilyen van.
 *    (Ez a „NULL nem hiba → a fail-safe vak rá" osztály: a hiányt is nevén nevezzük.)
 * null = nincs mit mondani.
 */
export function kerelemFigyelmeztetes(input: {
  hiba: string | null
  /** A lista sorai: a hivatkozott kérelem azonosítója + a sor saját jelölése. */
  sorok: ReadonlyArray<{ kerelemId: string | null; sajatMegoldva: boolean; archived: boolean }>
  allapotok: ReadonlyMap<string, KerelemAllapot>
}): string | null {
  const erintett = input.sorok.filter((s) => !!s.kerelemId && !s.sajatMegoldva && !s.archived)
  if (input.hiba) {
    if (erintett.length === 0) return null
    return (
      `A hozzáférés-kérelmek tényleges állapota nem olvasható (${input.hiba}). ` +
      `${erintett.length} üzenetnél a „Válaszra vár" jelölés csak az üzenet saját jelöléséből jön — lehet, hogy a kérelem már eldőlt.`
    )
  }
  const rejtett = erintett.filter((s) => !input.allapotok.has(s.kerelemId as string)).length
  if (rejtett === 0) return null
  return (
    `${rejtett} üzenet olyan hozzáférés-kérelemre hivatkozik, amelyet nem látsz (nincs hozzá jogod, vagy törölték). ` +
    'Ezeknél a „Válaszra vár" jelölés csak az üzenet saját jelöléséből jön, a Jóváhagyás/Elutasítás gomb pedig nem fog működni.'
  )
}

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
