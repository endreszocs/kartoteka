/**
 * BESZÉLGETÉSEK — TISZTA FÜGGVÉNYEK A CHAT-NÉZETHEZ (2026-09-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos kérése: az értesítések felülete legyen olyan, mint egy
 * üzenetküldő — bal oldalt a FELADÓK (kitől), jobb oldalt a szál (mikor, mit).
 * Ehhez a lapos `UzenetSor[]` listát feladó szerint SZÁLAKBA kell rendezni,
 * a szálakat a legutóbbi üzenet szerint sorba tenni, és szálanként tudni az
 * olvasatlanok számát. Ezt a három műveletet EGY helyen tartjuk, hogy a
 * csengő-panel, a beszélgetés-lista és a szál sose húzzon szét: ugyanaz a
 * feladó ugyanabba a szálba kerül mindenhol.
 *
 * ⚠️ DIREKTÍVA-MENTES, hook-mentes: a `scripts/selftest-ertesites-nezet.mjs`
 *    ezt a fájlt transzpilálja és futtatja (pozitív + mutáns-asszert), ezért
 *    csak adat és tiszta függvény lakhat benne.
 *
 * ⚠️ A FELADÓ FORRÁSA: `sor.felado` (a szerver-akció `alakit()`-ja tölti).
 *    Ha egy hívó régi alakú sort ad (nincs `felado`), a `feladoBontas()`
 *    levezetése a tartalék — de MINDIG ugyanazon a `beszelgetesKulcs()`-on
 *    keresztül, tehát a szál-kulcs egyetlen képletből jön.
 */

import { bukarestiNapKulcs, huDatumBukarest } from '@/lib/utils/idopont-bukarest'

import { beszelgetesKulcs, feladoBontas, type Felado, type FeladoTipus } from './felado'
import { bontUzenet, markdownSzoveg, szovegKivonat, type UzenetSor } from './uzenetek-shared'

// ─────────────────────────────────────────────────────────────────────────────
// SZŰRŐ
// ─────────────────────────────────────────────────────────────────────────────

/** A régi lista három kapcsolója egy helyen: mind / csak olvasatlan / archívum. */
export type SzalSzuro = 'mind' | 'olvasatlan' | 'archivalt'

export const SZAL_SZUROK: Array<{ id: SzalSzuro; cimke: string; leiras: string }> = [
  { id: 'mind', cimke: 'Mind', leiras: 'Minden nem archivált üzenet.' },
  { id: 'olvasatlan', cimke: 'Olvasatlan', leiras: 'Csak az olvasatlan üzenetek.' },
  { id: 'archivalt', cimke: 'Archívum', leiras: 'Az archivált üzenetek — bármikor visszahozhatók.' },
]

export function ervenyesSzuro(ertek: string | null | undefined): SzalSzuro {
  return ertek === 'olvasatlan' || ertek === 'archivalt' ? ertek : 'mind'
}

/**
 * A szűrő alkalmazása.
 *
 * ⚠️ `megtartott` — AZ ÜZENET NEM TŰNHET EL A LELKÉSZ KEZE ALÓL. Az „Olvasatlan"
 *    szűrőben a láthatóságra alapuló olvasottá jelölés (IntersectionObserver)
 *    azonnal kidobná a sort, amit a lelkész ÉPP OLVAS — pontosan a 2026-08-11-i
 *    panasz („rákattintok, és eltűnik"). Amit ebben a munkamenetben jelöltünk
 *    olvasottnak, az a szűrőváltásig bent marad.
 */
export function szurSorok(
  sorok: readonly UzenetSor[],
  szuro: SzalSzuro,
  megtartott?: ReadonlySet<string>,
): UzenetSor[] {
  return sorok.filter((s) => {
    if (szuro === 'archivalt') return s.archived
    if (s.archived) return false
    if (szuro === 'olvasatlan') return !s.olvasva || (megtartott?.has(s.id) ?? false)
    return true
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FELADÓ ÉS KIVONAT — a sorból, tartalékkal
// ─────────────────────────────────────────────────────────────────────────────

/** A sor feladója: az `alakit()` által töltött mező, vagy régi sornál levezetés. */
export function sorFeladoja(sor: UzenetSor): Felado {
  return sor.felado ?? feladoBontas({ tipus: sor.tipus, hivatkozas: sor.hivatkozas, cim: sor.cim, uzenet: sor.uzenet, congregationNev: sor.congregationNev })
}

/** Markdown-sor-e (a szerver renderelte HTML-lé, vagy annak jelölte). */
export function sorMarkdownE(sor: Pick<UzenetSor, 'uzenetHtml' | 'uzenetFormat'>): boolean {
  return sor.uzenetFormat === 'markdown' || (typeof sor.uzenetHtml === 'string' && sor.uzenetHtml.length > 0)
}

/**
 * EGYSOROS kivonat a listákhoz. A szerver `kivonat`-ja az első; ha egy hívó
 * régi alakú sort ad, a markdown-jelek itt is lecsupaszodnak — a csengőben
 * és a beszélgetés-listában SOHA nem látszik `##` vagy `**`.
 */
export function sorKivonata(sor: UzenetSor, max?: number): string {
  if (typeof sor.kivonat === 'string' && max === undefined) return sor.kivonat
  return sorMarkdownE(sor) ? markdownSzoveg(sor.uzenet, max) : szovegKivonat(sor.uzenet, max)
}

/**
 * „Válaszra vár": hozzáférés-kérelem, amiről még nem született döntés.
 *
 * ⚠️ EGYETLEN MEZŐBŐL DÖNT: `sor.megoldva` — amely az `alakit()`-ban EGY
 *    szabályból jön (oszlop VAGY cím-előtag VAGY a kérelem tényleges állapota;
 *    uzenetek-shared → `megoldasLevezetes`). A buborék pillje és gombpárja, a
 *    lista számlálója és a csengő pillje MIND ezen a függvényen át dönt — itt
 *    nincs második szabály (2026-09-05, P3: a régi kérelem-sorok pillje
 *    sosem oldódott fel, mert a nézet csak a sor saját jelölését nézte).
 */
export function valaszraVarE(sor: Pick<UzenetSor, 'adminRequestId' | 'megoldva' | 'archived'>): boolean {
  return !!sor.adminRequestId && !sor.megoldva && !sor.archived
}

// ─────────────────────────────────────────────────────────────────────────────
// CSOPORTOSÍTÁS SZÁLAKBA
// ─────────────────────────────────────────────────────────────────────────────

export interface Beszelgetes {
  /** `beszelgetesKulcs(felado)` — DB-eredetű, stabil; URL-ben és React-kulcsként is ez megy. */
  kulcs: string
  felado: Felado
  /** Időrend NÖVEKVŐ: a legrégebbi elöl, a legfrissebb a szál alján. */
  sorok: UzenetSor[]
  /** A legfrissebb üzenet (a lista-sor kivonata és ideje ebből jön). */
  utolso: UzenetSor
  olvasatlan: number
  valaszraVar: number
}

/**
 * A szálak sorrendjének MÁSODLAGOS kulcsa (azonos időbélyegnél): a Kartotéka
 * felől érkező üzenetek előrébb, a gépi riasztások hátrébb. Az ELSŐDLEGES
 * rendezés a legutóbbi üzenet ideje — a lelkész azt keresi, ami most történt.
 */
export const SZAL_SORREND: Record<FeladoTipus, number> = {
  rendszergazda: 0,
  egyhazkerulet: 1,
  egyhazmegye: 2,
  gyulekezet: 3,
  felhasznalo: 4,
  rendszer: 5,
}

function idoErtek(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

/** Két sor időrendje (növekvő). Azonos időnél az azonosító dönt — determinisztikus. */
export function sorIdorend(a: UzenetSor, b: UzenetSor): number {
  const d = idoErtek(a.createdAt) - idoErtek(b.createdAt)
  return d !== 0 ? d : a.id.localeCompare(b.id)
}

/** Két szál sorrendje: a legutóbbi üzenet szerint CSÖKKENŐ, döntetlennél SZAL_SORREND. */
export function beszelgetesSorrend(a: Beszelgetes, b: Beszelgetes): number {
  const d = idoErtek(b.utolso.createdAt) - idoErtek(a.utolso.createdAt)
  if (d !== 0) return d
  const s = SZAL_SORREND[a.felado.tipus] - SZAL_SORREND[b.felado.tipus]
  return s !== 0 ? s : a.kulcs.localeCompare(b.kulcs)
}

/**
 * Lapos sorok → szálak feladó szerint. A bemenet sorrendje KÖZÖMBÖS: a
 * szálon belül időrendbe rakjuk, a szálakat a legutóbbi üzenet szerint.
 * Üres szál nem keletkezik (csak létező sorból épül).
 */
export function csoportositBeszelgetesek(sorok: readonly UzenetSor[]): Beszelgetes[] {
  const map = new Map<string, { felado: Felado; sorok: UzenetSor[] }>()
  for (const sor of sorok) {
    const felado = sorFeladoja(sor)
    const kulcs = beszelgetesKulcs(felado)
    const meglevo = map.get(kulcs)
    if (meglevo) {
      meglevo.sorok.push(sor)
      // A szál neve a NEM levezetett feladóé, ha van ilyen sor (az adatbázisé nyer).
      if (meglevo.felado.levezetett && !felado.levezetett) meglevo.felado = felado
    } else {
      map.set(kulcs, { felado, sorok: [sor] })
    }
  }

  const lista: Beszelgetes[] = []
  for (const [kulcs, { felado, sorok: szalSorok }] of map) {
    const rendezett = [...szalSorok].sort(sorIdorend)
    lista.push({
      kulcs,
      felado,
      sorok: rendezett,
      utolso: rendezett[rendezett.length - 1],
      olvasatlan: rendezett.filter((s) => !s.olvasva && !s.archived).length,
      valaszraVar: rendezett.filter(valaszraVarE).length,
    })
  }
  return lista.sort(beszelgetesSorrend)
}

/** Az összes szál olvasatlanjainak száma (a lista fejlécéhez). */
export function osszesOlvasatlan(beszelgetesek: readonly Beszelgetes[]): number {
  return beszelgetesek.reduce((n, b) => n + b.olvasatlan, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// KERESÉS
// ─────────────────────────────────────────────────────────────────────────────

/** Ékezet- és kisbetű-független alak (a „Kézdi" a „kezdi"-re is találjon). */
export function keresoAlak(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // kombináló ékezet-jelek (U+0300–U+036F)
    .toLowerCase()
    .trim()
}

/** Szálak szűrése keresőszóra: feladó neve, bármely üzenet címe vagy kivonata. */
export function keresBeszelgetesek(beszelgetesek: readonly Beszelgetes[], q: string): Beszelgetes[] {
  const kulcs = keresoAlak(q)
  if (!kulcs) return [...beszelgetesek]
  return beszelgetesek.filter(
    (b) =>
      keresoAlak(b.felado.nev).includes(kulcs) ||
      b.sorok.some((s) => keresoAlak(s.cim).includes(kulcs) || keresoAlak(sorKivonata(s)).includes(kulcs)),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NAPI BLOKKOK — dátum-elválasztók a szálban (Europe/Bucharest)
// ─────────────────────────────────────────────────────────────────────────────

export interface NapiBlokk {
  /** `YYYY-MM-DD` bukaresti napkulcs. */
  napKulcs: string
  sorok: UzenetSor[]
}

/** Időrendben rendezett sorok → napi blokkok (a bemenet sorrendjét tartja). */
export function napiBlokkok(sorok: readonly UzenetSor[]): NapiBlokk[] {
  const blokkok: NapiBlokk[] = []
  for (const s of sorok) {
    const napKulcs = bukarestiNapKulcs(new Date(s.createdAt))
    const utolso = blokkok[blokkok.length - 1]
    if (utolso && utolso.napKulcs === napKulcs) utolso.sorok.push(s)
    else blokkok.push({ napKulcs, sorok: [s] })
  }
  return blokkok
}

/**
 * A dátum-elválasztó felirata: „Ma" / „Tegnap" / „2026. szeptember 3."
 * A napkulcs bukaresti nap; a formázáshoz a nap DELÉT vesszük UTC-ben, ami
 * Bukarestben ugyanarra a napra esik (14:00/15:00) — így a `huDatumBukarest`
 * sosem csúszik át a szomszéd napra.
 */
/**
 * Az ELŐZŐ naptári nap kulcsa („YYYY-MM-DD" → egy nappal korábbi), tisztán a
 * kulcsból számolva (UTC-délből lépünk, így nyári időszámítás-váltás sem
 * csúsztat). MIÉRT: a szál-nézet a „Tegnap" elválasztóhoz így nem hív órát
 * renderelés közben (react-hooks/purity) — elég a „ma" kulcsa és egy tiszta
 * lépés. Hibás kulcsra önmagát adja vissza (nem dob, nem lesz „Tegnap").
 */
export function elozoNapKulcs(napKulcs: string): string {
  const d = new Date(`${napKulcs}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(napKulcs) || Number.isNaN(d.getTime())) return napKulcs
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function datumElvalaszto(napKulcs: string, maKulcs: string, tegnapKulcs: string): string {
  if (napKulcs === maKulcs) return 'Ma'
  if (napKulcs === tegnapKulcs) return 'Tegnap'
  return huDatumBukarest(new Date(`${napKulcs}T12:00:00Z`), 'long')
}

// ─────────────────────────────────────────────────────────────────────────────
// SZÖVEG-SEGÉDEK A TÖRZSHÖZ
// ─────────────────────────────────────────────────────────────────────────────

/** Ennél hosszabb (vagy több soros) törzsnél jelenik meg a „Tovább" kinyitó. */
export const HOSSZU_UZENET_KARAKTER = 360
export const HOSSZU_UZENET_SOR = 6

export function hosszuUzenetE(uzenet: string): boolean {
  const s = String(uzenet ?? '')
  if (s.length > HOSSZU_UZENET_KARAKTER) return true
  return s.split('\n').length > HOSSZU_UZENET_SOR
}

export interface SzovegToken {
  tipus: 'szoveg' | 'link'
  ertek: string
}

const URL_MINTA = /https?:\/\/[^\s<>"'`]+/g

/**
 * http(s)-autolink tokenizáló — a sima szöveges törzs URL-jei kattinthatók
 * lesznek anélkül, hogy HTML-t építenénk (`dangerouslySetInnerHTML` NÉLKÜL,
 * React-csomópontokkal). A mondatvégi írásjel (`.`, `,`, `)`) nem része a
 * linknek — a „Képernyőkép: https://…/kep.png." sor helyesen zár.
 */
export function autolinkTokenek(szoveg: string): SzovegToken[] {
  const s = String(szoveg ?? '')
  const tokenek: SzovegToken[] = []
  let utolso = 0
  for (const talalat of s.matchAll(URL_MINTA)) {
    const kezdet = talalat.index ?? 0
    let url = talalat[0]
    // Záró írásjelek leválasztása; a `)` csak akkor marad, ha van párja az URL-ben.
    while (url.length > 0) {
      const v = url[url.length - 1]
      if ('.,;:!?'.includes(v) || (v === ')' && !url.includes('(')) || v === ']' || v === '}') url = url.slice(0, -1)
      else break
    }
    if (!url) continue
    if (kezdet > utolso) tokenek.push({ tipus: 'szoveg', ertek: s.slice(utolso, kezdet) })
    tokenek.push({ tipus: 'link', ertek: url })
    utolso = kezdet + url.length
  }
  if (utolso < s.length) tokenek.push({ tipus: 'szoveg', ertek: s.slice(utolso) })
  return tokenek
}

/** A sima szöveges törzs bontása: törzs + „Teendő" (a részletes nézet külön doboza). */
export function torzsEsTeendo(uzenet: string): { torzs: string; teendo: string | null } {
  return bontUzenet(uzenet)
}

// ─────────────────────────────────────────────────────────────────────────────
// URL-ÁLLAPOT — EGY képlet a csengőnek és a nézetnek
// ─────────────────────────────────────────────────────────────────────────────

export interface ErtesitesUrlAllapot {
  felado?: string | null
  uzenet?: string | null
  archivum?: boolean
  szuro?: SzalSzuro
  ful?: 'uzenetek' | 'kerelmek'
  kerelem?: string | null
}

/**
 * `/notifications?felado=<kulcs>&uzenet=<id>&archivum=1&ful=kerelmek&kerelem=<id>`
 * A `szuro=archivalt` az `archivum=1` alakban megy (a megbeszélt URL-szerződés);
 * az `olvasatlan` szűrő `szuro=olvasatlan`. Üres/alap érték nem kerül az URL-be.
 */
export function ertesitesUrl(allapot: ErtesitesUrlAllapot, alap = '/notifications'): string {
  const p = new URLSearchParams()
  if (allapot.ful === 'kerelmek') p.set('ful', 'kerelmek')
  if (allapot.kerelem) p.set('kerelem', allapot.kerelem)
  if (allapot.felado) p.set('felado', allapot.felado)
  if (allapot.uzenet) p.set('uzenet', allapot.uzenet)
  if (allapot.archivum || allapot.szuro === 'archivalt') p.set('archivum', '1')
  else if (allapot.szuro === 'olvasatlan') p.set('szuro', 'olvasatlan')
  const q = p.toString()
  return q ? `${alap}?${q}` : alap
}

/** URL-paraméterek → állapot (a `useSearchParams` kimenetéből). */
export function urlAllapot(get: (kulcs: string) => string | null): Required<ErtesitesUrlAllapot> {
  const archivum = get('archivum') === '1'
  return {
    felado: get('felado') || null,
    uzenet: get('uzenet') || null,
    archivum,
    szuro: archivum ? 'archivalt' : ervenyesSzuro(get('szuro')),
    ful: get('ful') === 'kerelmek' ? 'kerelmek' : 'uzenetek',
    kerelem: get('kerelem') || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SZÁL-VÁLASZTÁS AZ URL-BŐL — csak LÉTEZŐ szálra
// ─────────────────────────────────────────────────────────────────────────────

export interface SzalValasztas {
  /** A megnyitott szál (asztali nézetben választás híján az első látható). */
  aktiv: Beszelgetes | null
  /** true = az URL (`felado` / `uzenet`) EGY LÉTEZŐ szálra mutat — mobilon ekkor nyílik a szál. */
  valasztott: boolean
}

/**
 * Melyik szál nyíljon. Sorrend: a `?felado=` kulcs, ha VAN ilyen szál; különben
 * a `?uzenet=` sor feladójának szála, ha van; különben nincs választás —
 * asztali nézetben az első látható szál nyílik (az URL nem változik), mobilon
 * a lista marad.
 *
 * MIÉRT nem hisszük el vakon az URL-t (2026-09-05, bírálói P2): egy nem illő
 * kulcs (elgépelt vagy régi mélylink; a szál utolsó sorának archiválása után
 * az URL-ben maradt kulcs; egy szűrő, amelyben a szál üres) korábban
 * `aktiv = null`-t adott, mobilon viszont a listát IS elrejtette — a lelkész
 * egy üres „Tiszta a postaláda" szálat látott Vissza-gombbal, miközben voltak
 * üzenetei. Nem illő kulcsnál mostantól „nincs választás".
 *
 * ⚠️ `sorok` a SZŰRETLEN lista: a `?uzenet=` mélylink archivált sort is
 *    azonosít — de a szála csak akkor nyílik, ha az aktuális szűrőben létezik.
 */
export function valasztSzal(
  osszes: readonly Beszelgetes[],
  lathato: readonly Beszelgetes[],
  sorok: readonly UzenetSor[],
  allapot: Pick<ErtesitesUrlAllapot, 'felado' | 'uzenet'>,
): SzalValasztas {
  const uzenetSor = allapot.uzenet ? sorok.find((s) => s.id === allapot.uzenet) : undefined
  const jeloltek = [allapot.felado ?? null, uzenetSor ? beszelgetesKulcs(sorFeladoja(uzenetSor)) : null]
  for (const kulcs of jeloltek) {
    if (!kulcs) continue
    const talalat = osszes.find((b) => b.kulcs === kulcs)
    if (talalat) return { aktiv: talalat, valasztott: true }
  }
  return { aktiv: lathato[0] ?? null, valasztott: false }
}
