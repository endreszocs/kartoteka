/**
 * Különleges gyülekezeti alkalmak — MEGOSZTOTT típusok, konstansok, tiszta
 * függvények (2026-08-11, 6. kör).
 *
 * MIÉRT KÜLÖN FÁJL
 *   Next.js 16: a `'use server'` fájl KIZÁRÓLAG async függvényt exportálhat,
 *   ezért minden típus és konstans ide kerül (a `igeterv-types.ts` mintája).
 *   Ráadásul így a szerver-action ÉS a kliens-komponens UGYANAZT az összesítő
 *   logikát futtatja — a listán látott „5 megtartott" és a jelentés melletti
 *   javaslat SOHA nem tud széthúzni.
 *
 * MI A FUNKCIÓ (a tulajdonos 2026-08-11-i szűkítése)
 *   A RUTIN alkalmakat (istentisztelet, bibliaóra, kateketikai óra) a lelkész
 *   a munkanaplóba írja — azokra SOHA nem kérdezünk rá, és a jelentés II./III./V.
 *   rubrikái onnan számolódnak. A hiány a KÜLÖNLEGES, egyszeri alkalmaknál van
 *   (szeretetvendégség, zenekari fellépés, kirándulás, tábor, gyülekezeti nap):
 *   ezek ma sehol nem kerülnek rögzítésre. A lelkész előre betervezi őket a
 *   határidőnaplóba, és a jelentés összeállításakor CSAK ezekre kérdezünk rá:
 *   megvolt-e, és hányan voltak ott.
 *
 * MIT NEM CSINÁL — TUDATOSAN
 *   A III.4 (Szeretetvendégségek száma) és a II.10 (Más alkalmak) rubrika KÉZI
 *   MARAD. A nyilvántartás csak JAVASLATOT ad a mező mellé egy „Beírom" gombbal.
 *   Ok: a bevezetés évében a lelkész jellemzően a 7 alkalomból 2-t visz fel; egy
 *   automatikus rubrika ilyenkor 2-t nyomtatna a 7 helyett — ALÁÍRT, BEKÜLDÖTT
 *   nyomtatványon, némán, lefelé hamisítva. Két koppintás évente olcsóbb ennél.
 */

/** A megerősítés három állapota. */
export type KulonlegesAllapot = 'megtartva' | 'elmaradt' | 'nem_kulonleges'

/**
 * Ezekre a naptár-típusokra kérdezünk rá AUTOMATIKUSAN. Szándékosan szűk lista —
 * a `gyulekezeti_programok.tipus` katalógusából (lib/constants/dashboard.ts).
 */
export const KULONLEGES_TIPUSOK: readonly string[] = [
  'hangverseny',
  'tabor',
  'evangelizacio',
  'konferencia',
  'diakoniai',
  'kozossegi',
]

/** Ezekre CSAK az összecsukott „ezekre is rákérdezzek?" blokkban kérdezünk. */
export const KETERTELMU_TIPUSOK: readonly string[] = ['unnep', 'noszovetseg', 'egyeb']

/**
 * 2026-08-11 (6. kör, reviewer-major) — NEM ISTENTISZTELETI JELLEGŰ típusok.
 *
 * A II. fejezet címe „Istentisztelet", a II.10 „Más alkalmak" ennek a rovata.
 * Egy nyári TÁBOR, egy KIRÁNDULÁS vagy egy diakóniai alkalom nem istentiszteleti
 * alkalom — ha a lelkész ezeket is beleírja a II.10-be, egy aláírt, az
 * egyházmegyének BEKÜLDÖTT nyomtatványon torzul FELFELÉ az istentiszteleti
 * alkalmak száma.
 *
 * A rendszer NEM dönt helyette (a besorolás egyházi kérdés, nem programozási):
 * a javaslat-sor tételesen felsorolja, MI számít bele, és külön kiírja, ha
 * ilyen tétel is van köztük — a [Beírom] így TUDATOS döntés marad.
 */
export const NEM_ISTENTISZTELETI_TIPUSOK: readonly string[] = ['tabor', 'kozossegi', 'diakoniai']

/** Nem istentiszteleti jellegű alkalom-e (ismeretlen típusnál: nem tudjuk → false). */
export function nemIstentiszteletiJellegu(t: KulonlegesTetel): boolean {
  return !!t.tipus && NEM_ISTENTISZTELETI_TIPUSOK.includes(t.tipus)
}

// SOHA nem kérdezünk: istentisztelet, bibliaora, imaora, ifjusagi,
// gyerekprogram, presbiteri, latogatas — ezek a RUTIN alkalmak, amelyeket a
// lelkész a munkanaplóba ír, és a II./III./V. rubrikák onnan számolódnak.
// Ez a tulajdonos kifejezett szűkítése (2026-08-11), nem optimalizáció.

/**
 * A jelentés-mezők, amelyek MELLÉ javaslatot kínálunk. ALLOW-LISTA: a
 * munkanapló-tulajdonú rubrikákhoz (III.3 / II.9 / III.1 / III.2 / V.3) a
 * nyilvántartás hozzá sem szólhat — ott kettős számolás lenne belőle.
 */
export const JAVASLAT_MEZOK: ReadonlySet<string> = new Set(['III.4', 'II.10'])

/** Egy sor a megerősítő listán (naptár-tétel + a hozzá tartozó válasz). */
export interface KulonlegesTetel {
  /** A nyilvántartás sora, ha már van válasz; null = még nincs válasz. */
  id: string | null
  programId: string | null
  /** 'YYYY-MM-DD' — a tervezett nap (elmaradtnál: „mikor lett volna"). */
  tervezettDatum: string
  tenylegesDatum: string | null
  cim: string
  /** Csak megjelenítéshez (emoji/címke); a válasz-sor nem tárolja. */
  tipus: string | null
  helyszin: string | null
  szeretetvendegseg: boolean
  /** null = még nincs válasz erre a tervre. */
  allapot: KulonlegesAllapot | null
  resztvevok: number | null
  megjegyzes: string | null
  /** A generált `ev` oszlop értéke (tényleges, különben tervezett dátum éve). */
  ev: number | null
  /** A hozzá tartozó naptár-tétel már nincs meg ebben az évben (törölték/áthelyezték). */
  naptarbolTorolve: boolean
  /**
   * 2026-08-11 (6. kör): a naptárban ÁTHELYEZTÉK a tételt, miután a lelkész már
   * válaszolt rá — ez a válasz EREDETI tervezett napja ('YYYY-MM-DD'), null ha
   * nem mozdult. A párosítás a naptár-sorra (program_id) megy, tehát ilyenkor
   * sem lesz belőle két sor; a jelzés csak azért kell, hogy a lelkész lássa,
   * miért más a dátum, mint amire emlékszik.
   */
  athelyezveRolo: string | null
  /**
   * 2026-08-11 (6. kör): ugyanarra a naptár-sorra TÖBB élő válasz találtatott
   * (a régi, dátumos egyedi index hagyatéka). A lista egyesíti őket, de ez a
   * jelző HANGOSAN kiírja — a néma kettős számolás aláírt nyomtatványra menne.
   */
  duplikaltValasz: boolean
  /** A válasz éve eltér a jelentés évétől (átcsúszott alkalom). */
  masEvbe: boolean
  /** A kétértelmű típusú, opt-in blokkba tartozó tétel. */
  ketertelmu: boolean
}

/** A lista összesítése — ebből lesz a javaslat a III.4 / II.10 mező mellett. */
export interface KulonlegesOsszesites {
  /** Megtartott szeretetvendégségek ebben az évben → javaslat a III.4-hez. */
  szeretetvendegseg: number
  /** Minden más megtartott különleges alkalom → javaslat a II.10-hez. */
  egyeb: number
  /** Esedékes (tervezett napja elmúlt), de még megválaszolatlan tétel. */
  fuggoben: number
  elmaradt: number
  /** Megtartott, de MÁSIK év jelentésébe eső alkalom (évhatáron átcsúszott). */
  masEvbe: number
}

export const URES_OSSZESITES: KulonlegesOsszesites = {
  szeretetvendegseg: 0,
  egyeb: 0,
  fuggoben: 0,
  elmaradt: 0,
  masEvbe: 0,
}

/** A `listKulonlegesAlkalmak` visszatérési alakja. */
export interface KulonlegesListaResult {
  tetelek: KulonlegesTetel[]
  osszesites: KulonlegesOsszesites
  /** true = a 2026-08-11-es migráció még nem futott le (a felület degradál). */
  needsSql?: boolean
  error?: string
}

/** Egy válasz mentésének bemenete. */
export interface KulonlegesValaszInput {
  id?: string
  programId?: string | null
  /** 'YYYY-MM-DD' */
  tervezettDatum: string
  /** 'YYYY-MM-DD' — megtartott alkalomnál alapértelmezés a tervezett nap. */
  tenylegesDatum?: string | null
  cim: string
  allapot: KulonlegesAllapot
  szeretetvendegseg?: boolean
  resztvevok?: number | null
  megjegyzes?: string | null
}

// ─────────────────────────────────────────────────────────────────────────
// Tiszta segédfüggvények (szerver + kliens EGYARÁNT ezeket használja)
// ─────────────────────────────────────────────────────────────────────────

/** Rákérdezünk-e erre a naptár-típusra egyáltalán? */
export function kerdezendoTipus(tipus: string | null | undefined): boolean {
  if (!tipus) return false
  return KULONLEGES_TIPUSOK.includes(tipus) || KETERTELMU_TIPUSOK.includes(tipus)
}

/** Kétértelmű (opt-in blokkba tartozó) típus-e? */
export function ketertelmuTipus(tipus: string | null | undefined): boolean {
  return !!tipus && KETERTELMU_TIPUSOK.includes(tipus)
}

/** Helyi (NEM UTC) mai dátum 'YYYY-MM-DD' alakban — az esedékesség alapja. */
export function maiDatum(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const n = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${n}`
}

const HO_ROVID = [
  'jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.',
  'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.',
]

/** '2026-12-14' → '2026. dec. 14.' — hibás bemenetre a nyers stringet adja. */
export function huDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return String(iso)
  const ho = HO_ROVID[Number(m[2]) - 1] || `${m[2]}.`
  return `${m[1]}. ${ho} ${Number(m[3])}.`
}

/** '2026-12-14' → 'dec. 14.' (év nélkül, listasorhoz). */
export function huRovidDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return String(iso)
  const ho = HO_ROVID[Number(m[2]) - 1] || `${m[2]}.`
  return `${ho} ${Number(m[3])}.`
}

const NAP_NEVEK = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat']

/** '2026-12-14' → 'vasárnap'; érvénytelen dátumra üres string. */
export function huNapNev(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''
  // T12:00:00Z horgony: a napnév így időzónától függetlenül stabil.
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? '' : NAP_NEVEK[d.getUTCDay()]
}

/**
 * A jelentés IX.1 („A gyülekezet életének fontosabb eseményei") mezőjébe
 * beilleszthető MONDAT egy megerősített alkalomból.
 * Példa: `2026. dec. 14. — Adventi hangverseny, 85 fő. A helyi fúvószenekar szolgált.`
 */
export function mondatAlkalomhoz(t: KulonlegesTetel): string {
  const datum = huDatum(t.tenylegesDatum || t.tervezettDatum)
  const letszam = t.resztvevok != null ? `, ${t.resztvevok} fő` : ''
  const megj = (t.megjegyzes || '').trim()
  const zaro = megj ? ` ${megj.endsWith('.') ? megj : `${megj}.`}` : ''
  return `${datum} — ${t.cim}${letszam}.${zaro}`
}

/**
 * A lista összesítése. `ma`: 'YYYY-MM-DD' (az esedékesség küszöbe), `ev`: a
 * jelentés éve.
 *
 * SZABÁLYOK — kimondva, mert ezekből lesz a javaslat-szám:
 *  · csak a `megtartva` sor számít bele a két rubrika-javaslatba;
 *  · a MÁSIK évbe csúszott (ev ≠ jelentés éve) alkalom NEM számít bele — az a
 *    következő év jelentésének a tétele (külön számláló mutatja);
 *  · függőben = esedékes (tervezett napja ≤ ma), még válasz nélküli tétel, a
 *    kétértelmű típusú (opt-in) tételek KIVÉTELÉVEL — azok nem sürgetnek.
 */
export function szamolOsszesites(
  tetelek: KulonlegesTetel[],
  ev: number,
  ma: string,
): KulonlegesOsszesites {
  const o: KulonlegesOsszesites = { ...URES_OSSZESITES }
  for (const t of tetelek) {
    if (t.allapot === 'megtartva') {
      if (t.masEvbe) o.masEvbe += 1
      else if (t.szeretetvendegseg) o.szeretetvendegseg += 1
      else o.egyeb += 1
    } else if (t.allapot === 'elmaradt') {
      o.elmaradt += 1
    } else if (t.allapot === null && !t.ketertelmu && t.tervezettDatum <= ma) {
      o.fuggoben += 1
    }
  }
  // Az `ev` paramétert a hívó oldali szűrés már érvényesítette (a lista eleve
  // az adott év tételeit tartalmazza) — itt csak a szignatúra dokumentálja,
  // hogy az összesítés MINDIG egy konkrét jelentés-évhez tartozik.
  void ev
  return o
}

/** A javasolt érték egy jelentés-mezőhöz; null = ehhez a mezőhöz nincs javaslat. */
export function javaslatMezohoz(
  o: KulonlegesOsszesites,
  mezoId: string,
): number | null {
  if (!JAVASLAT_MEZOK.has(mezoId)) return null
  if (mezoId === 'III.4') return o.szeretetvendegseg
  if (mezoId === 'II.10') return o.egyeb
  return null
}

/**
 * 2026-08-11 (6. kör, reviewer-major) — MELYIK alkalmakból jön a javaslat.
 *
 * A javaslat-sor eddig csak annyit mondott: „a nyilvántartás szerint N megtartott
 * alkalom". A lelkész nem tudta ellenőrizni, MI az az N, mielőtt a [Beírom]
 * gombbal egy aláírandó, beküldendő nyomtatványba írja. Ez a függvény adja a
 * TÉTELES listát — ugyanazzal a szűrővel, amivel a `szamolOsszesites` számol,
 * ezért a hossza MINDIG megegyezik a `javaslatMezohoz` értékével.
 */
export function javaslatTetelekMezohoz(
  tetelek: KulonlegesTetel[],
  mezoId: string,
): KulonlegesTetel[] {
  if (!JAVASLAT_MEZOK.has(mezoId)) return []
  const szv = mezoId === 'III.4'
  return tetelek.filter(
    (t) => t.allapot === 'megtartva' && !t.masEvbe && t.szeretetvendegseg === szv,
  )
}
