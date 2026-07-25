/**
 * Iktató F8c/F8e — NYELVFÜGGETLEN DOKUMENTUM-CSALÁDOK (G1/E1-kontraktus).
 *
 * A user éles teszt-észrevétele (2026-07-25) nyomán a NYELV a DOKUMENTUM
 * tulajdonsága lett: EGY „Dokumentum nyelve" (hu/ro/en/DE) választó vezérli a
 * fejlécet, a Szám/Tárgy címkéket, a keltezés helység-nevét ÉS a törzs-szöveget.
 * Ehhez a sablonok nyelvfüggetlen CSALÁDOKKÁ álltak össze: nincs külön „román
 * sablon" — egy család (pl. keresztelési igazolás) mind a négy nyelven
 * ugyanabból az adat-készletből épül, és TÖBB személyre is működik (nem fix 2).
 *
 * F8e (2026-07-25) két új követelmény a user tesztjéből:
 *  1. NÉMET nyelv (`de`) — hivatalos német egyházi hangnemmel
 *     („Das Pfarramt der Reformierten Kirchengemeinde … bescheinigt hiermit,
 *     dass …"). A német alárendelt mondat miatt a több személyes családoknál a
 *     2. személytől „Ferner wird bescheinigt, dass …" nyitány áll (tovabbiIntro).
 *  2. A dokumentum TÁRGYA is a dokumentum nyelvén — ehhez minden család
 *     `nevNyelv` mezőt kapott (a `nev` továbbra is a magyar UI-választó címkéje).
 *
 * F8f (2026-07-25) a user élesből érkezett két észrevétele:
 *  1. „Keresztelés esetén a keresztszülőség egyértelmű — az legyen kitöltve!"
 *     → a keresztelési igazolás `cel` kézi mezője `alapertek: 'keresztszülőség'`.
 *  2. „Kimaradt a konfirmálás. De ezek legyenek kipipálható konfirmációk, hogy
 *     ezek közül melyik kerüljön bele a szövegbe!" → a családok `esemenyOpciok`
 *     listát adnak (keresztelés / konfirmáció / házasságkötés) alapértékkel, a
 *     buildBody pedig `esemenyek`-kel kapja, mi került pipára. A személy-
 *     bekezdés így alap-állítás + a BEPIPÁLT események klauzuláiból épül, mind a
 *     négy nyelven nyelvhelyesen (0 eseménynél sincs csonka mondat, 1-nél nincs
 *     felsorolás-maradvány) — lásd a szemelyMondat()/felsorol() blokkot.
 *
 * TIPOGRÁFIA (F8e): a törzs már NEM inline-stílusos, sorkizárt, behúzott
 * bekezdéseket ad, hanem TISZTA `<p>` elemeket a közös A4-stíluslap osztályaival
 * (lib/iktato/dokumentum-stilus.ts). A kutatási tervdoc
 * (KARTOTEKA-a4-tipografia-elonezet-kutatas-2026-07-25.md) szerint a csúnya
 * tördelés gyökere a sorkizárás volt elválasztás nélkül → balra zárt szöveg,
 * `hyphens: auto`, bekezdés-térköz behúzás helyett. A neveket és a kulcs-
 * dátumokat `<b>` emeli ki, hogy a hivatalos irat gyorsan olvasható legyen.
 *
 * A szövegek FORRÁSA a 11 seed-sablon (lib/filing/templates.ts): a magyar
 * törzsek a meglévő magyar seedekből, a román változatok az Adeverință-seedek
 * formuláiból (Oficiul Parohial…, „prezenta adeverință se eliberează…"),
 * az angol a kutatási tervdoc (KARTOTEKA-eletutigazolas-kutatas-2026-07-25.md)
 * hiteles-fordítás stílusú formulái szerint készült; a német a hazai és
 * németországi református/evangélikus lelkészi hivatalok bevett formuláit
 * követi (Taufbescheinigung, Konfirmationsbescheinigung stb.).
 *
 * A buildBody KÉSZ (kitöltött) HTML-törzset ad vissza — nem placeholderes
 * sablont: a személy-adatok (PersonCertData) és a kézi mezők értékei már be
 * vannak helyettesítve, minden dinamikus érték HTML-escape-elve. A hiányzó
 * értékek helyén kitöltő-vonal („__________") marad, ahogy a renderTemplate
 * konvenciója is teszi — a nyomtatott lapon kézzel pótolható.
 *
 * A törzs NEM tartalmaz Szám-sort, keltezést és aláírás-blokkot — ezeket a
 * kiállító kerete adja hozzá (NYELV_CIMKEK + keltezesSor + aláírás-blokk),
 * így a keret is a dokumentum nyelvét követi.
 *
 * A régi 11 seed-sablon és a PLACEHOLDER_DOCS NEM változott — a Sablonok fül
 * és a saját (DB-beli) sablonok kompatibilitása megmarad; a családok a
 * kiállító ÚJ elsődleges útja.
 */

import { escapeHtml } from '@/lib/filing/templates'
import type { PersonCertData } from './certificate-types'
import { gyulekezetNevMag } from './letterheads'

// ─────────────────────────────────────────────────────────────────
// Kontraktus-típusok
// ─────────────────────────────────────────────────────────────────

/** A dokumentum nyelve — a fejléc, a keret-címkék és a törzs is ezt követi. */
export type DokumentumNyelv = 'hu' | 'ro' | 'en' | 'de'

/**
 * F8f (2026-07-25, user-teszt): a törzsbe kerülő ANYAKÖNYVI ESEMÉNYEK kulcsai.
 * A kiállító ezekből ad KIPIPÁLHATÓ listát („ezek közül melyik kerüljön bele a
 * szövegbe"), a család pedig megmondja, mely eseményeket kínálja és melyik
 * legyen alapból bepipálva.
 */
export type EsemenyKulcs = 'kereszteles' | 'konfirmacio' | 'hazassag'

/** Egy kipipálható esemény a kiállító-űrlapon. */
export interface EsemenyOpcio {
  key: EsemenyKulcs
  /** Magyar UI-címke (a kiállító felülete magyar, mint a `nev` mező). */
  label: string
  /** Alapból bepipálva? (a kiállító ezzel inicializálja az űrlapot) */
  alap: boolean
}

/** Az események kronológiai (megjelenítési) sorrendje a törzs-mondatokban. */
export const ESEMENY_SORREND: EsemenyKulcs[] = ['kereszteles', 'konfirmacio', 'hazassag']

export interface DokumentumCsalad {
  /** Stabil azonosító, pl. 'keresztelesi_igazolas'. */
  id: string
  /** Magyar megjelenítési név a választóban (UI-címke). */
  nev: string
  /**
   * A dokumentum neve NYELVENKÉNT — a dokumentum Tárgy-sora ezt használja
   * (user-észrevétel: román/angol/német iraton a Tárgy is azon a nyelven).
   * A `nevNyelv.hu` szándékosan lehet rövidebb/hivatalosabb, mint a `nev`.
   */
  nevNyelv: Record<DokumentumNyelv, string>
  /** Csoportosításhoz (a meglévő TemplateType részhalmaza). */
  tipus: 'igazolas' | 'level'
  /** EREK 2024-es ügykör-kód (irattári besorolás), pl. '2.'. */
  ugykorKod: string
  /** Az ügykör hivatalos neve (filing-ugykorjegyzek). */
  ugykorNev: string
  /** Hány személyre szólhat: 1..4; 0 = nem személyhez kötött (szabad levél). */
  maxSzemely: number
  /** A családhoz tartozó kézi (felhasználó által töltendő) mezők. */
  keziMezok: Array<{ key: string; label: string; alapertek?: string }>
  /**
   * Mely anyakönyvi események kapcsolhatók BE/KI a törzs-szövegben (F8f).
   * Hiányzik → a család szövege nem esemény-vezérelt (marad változatlan).
   * A sorrend a kiállító-űrlapon megjelenő sorrend; a MONDATBAN mindig a
   * kronológiai ESEMENY_SORREND érvényesül.
   */
  esemenyOpciok?: EsemenyOpcio[]
  /**
   * A KÉSZ HTML-törzs előállítása — personönkénti bekezdésekkel, a kért
   * nyelven. A gyulekezetNev a hívó által már a dokumentum NYELVÉN kiválasztott
   * gyülekezetnév (nev_hu/nev_ro/nev_en, fallback: hivatalos név).
   *
   * Az `esemenyek` a kipipált események állapota; a HIÁNYZÓ kulcs a család
   * `esemenyOpciok`-beli `alap` értékét jelenti (így a régi, esemény-opció
   * nélküli hívások változatlanul az alapértelmezett szöveget adják).
   */
  buildBody(opts: {
    persons: PersonCertData[]
    nyelv: DokumentumNyelv
    kezi: Record<string, string>
    gyulekezetNev: string
    esemenyek?: Partial<Record<EsemenyKulcs, boolean>>
  }): string
}

/**
 * A ténylegesen szövegbe kerülő események — kronológiai sorrendben.
 * Csak a család által KÍNÁLT kulcsok jöhetnek szóba; a hiányzó választás a
 * család `alap` értékére esik vissza.
 */
export function aktivEsemenyek(
  opciok: EsemenyOpcio[] | undefined,
  valasztas: Partial<Record<EsemenyKulcs, boolean>> | undefined,
): EsemenyKulcs[] {
  if (!opciok || opciok.length === 0) return []
  return ESEMENY_SORREND.filter((key) => {
    const opcio = opciok.find((o) => o.key === key)
    if (!opcio) return false
    const valasztott = valasztas?.[key]
    return valasztott === undefined ? opcio.alap : valasztott === true
  })
}

/**
 * Van-e a kiválasztott személyek BÁRMELYIKÉNÉL adat az adott eseményre?
 *
 * A törzs-építő szándékosan NEM rejti el a bepipált, de adat nélküli eseményt
 * (kitöltő-vonal marad a helyén, ami a nyomtatott lapon kézzel pótolható) —
 * ezzel a segéddel viszont a kiállító-űrlap ELŐRE ki tudja venni a pipát az
 * olyan eseményekből, amelyekre egyetlen kiválasztott személynél sincs adat.
 */
export function vanEsemenyAdat(persons: PersonCertData[], key: EsemenyKulcs): boolean {
  const mezo = (p: PersonCertData): string | null =>
    key === 'kereszteles'
      ? p.keresztelesDatum
      : key === 'konfirmacio'
        ? p.konfirmalasDatum
        : p.hazassagDatum
  return (persons || []).some((p) => !!(mezo(p) || '').trim())
}

/**
 * A kiállító-keret nyelvfüggő címkéi: „Szám:" / „Nr.:" / „No.:" / „Nr.:" és
 * „Tárgy:" / „Obiect:" / „Subject:" / „Betreff:". A keltElotag opcionális — a
 * keltezesSor teljes (előtag nélküli) keltezés-sort ad, ezért itt nem töltjük.
 */
export const NYELV_CIMKEK: Record<
  DokumentumNyelv,
  { szam: string; targy: string; keltElotag?: string }
> = {
  hu: { szam: 'Szám', targy: 'Tárgy' },
  ro: { szam: 'Nr.', targy: 'Obiect' },
  en: { szam: 'No.', targy: 'Subject' },
  de: { szam: 'Nr.', targy: 'Betreff' },
}

// ─────────────────────────────────────────────────────────────────
// Dátum + keltezés
// ─────────────────────────────────────────────────────────────────

const HONAPOK: Record<DokumentumNyelv, string[]> = {
  hu: [
    'január', 'február', 'március', 'április', 'május', 'június',
    'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
  ],
  ro: [
    'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
    'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  de: [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ],
}

/**
 * Nyelvhelyes keltezés-sor a keltezés helyével és az ISO dátummal:
 *  - hu: „Barátos, 2026. július 25."
 *  - ro: „Barătoș, la 25 iulie 2026"
 *  - en: „Barătoș, July 25, 2026"
 *  - de: „Barátos, den 25. Juli 2026"
 * A helység a NYELVNEK megfelelő nevet kapja — azt a hívó adja (helysegHu /
 * helysegRo a CongregationHeaderData-ból). Nem-ISO dátumnál a nyers szöveg
 * kerül a helység után. PLAIN szöveget ad vissza — HTML-be ágyazáskor a hívó
 * escape-eli (pl. renderTemplate / escapeHtml).
 */
export function keltezesSor(nyelv: DokumentumNyelv, helyseg: string, datumIso: string): string {
  const hely = (helyseg || '').trim()
  const nyers = (datumIso || '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(nyers)
  const honap = m ? HONAPOK[nyelv][Number(m[2]) - 1] : undefined
  if (!m || !honap) return [hely, nyers].filter(Boolean).join(', ')
  const ev = m[1]
  const nap = String(Number(m[3]))
  if (nyelv === 'ro') return `${hely}, la ${nap} ${honap} ${ev}`
  if (nyelv === 'en') return `${hely}, ${honap} ${nap}, ${ev}`
  if (nyelv === 'de') return `${hely}, den ${nap}. ${honap} ${ev}`
  return `${hely}, ${ev}. ${honap} ${nap}.`
}

/** ISO dátum → a nyelv szerinti hosszú forma; nem-ISO szöveg változatlanul. */
function datumSzoveg(nyelv: DokumentumNyelv, iso: string | null | undefined): string | null {
  const t = (iso || '').trim()
  if (!t) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (!m) return t
  const honap = HONAPOK[nyelv][Number(m[2]) - 1]
  if (!honap) return t
  const nap = String(Number(m[3]))
  if (nyelv === 'ro') return `${nap} ${honap} ${m[1]}`
  if (nyelv === 'en') return `${honap} ${nap}, ${m[1]}`
  if (nyelv === 'de') return `${nap}. ${honap} ${m[1]}`
  return `${m[1]}. ${honap} ${nap}.`
}

// ─────────────────────────────────────────────────────────────────
// Érték-segédek (escape + kitöltő-vonal a renderTemplate konvenciója szerint)
// ─────────────────────────────────────────────────────────────────

/** Kitöltő-vonal hiányzó értékhez — a nyomtatott lapon kézzel pótolható. */
const KITOLTO = '__________'
/** Hosszú kitöltő-vonal (szabad szöveg-mezők, pl. levél-törzs helyén). */
const KITOLTO_HOSSZU = '________________________________________'

/** Escape-elt érték; üresnél kitöltő-vonal. */
function ertek(v: string | null | undefined): string {
  const t = (v || '').trim()
  return t ? escapeHtml(t) : KITOLTO
}

/** Dátum-érték a nyelv formátumában; üresnél kitöltő-vonal. */
function datumErtek(nyelv: DokumentumNyelv, v: string | null | undefined): string {
  const d = datumSzoveg(nyelv, v)
  return d ? escapeHtml(d) : KITOLTO
}

/** Kézi mező értéke — ISO dátumnak kinéző szövegnél nyelvhelyes formázással. */
function keziDatumErtek(nyelv: DokumentumNyelv, kezi: Record<string, string>, key: string): string {
  return datumErtek(nyelv, kezi[key])
}

// ─────────────────────────────────────────────────────────────────
// Bekezdés- és törzs-építők
//   (a sanitizeFilingHtml whitelistjén belül: p/div/b + class engedélyezett)
//   A tipográfiát a KÖZÖS stíluslap adja — lásd lib/iktato/dokumentum-stilus.ts
// ─────────────────────────────────────────────────────────────────

/**
 * Normál törzs-bekezdés. F8e: NINCS `text-indent` és NINCS `text-align:justify`
 * — a kutatási tervdoc szerint a sorkizárás elválasztás nélkül adta a csúnya,
 * „lyukas" sorokat; helyette balra zárt szöveg + bekezdés-térköz (a stíluslap
 * `.doc-torzs p { margin: 0 0 3.5mm }` szabálya).
 */
function bek(html: string): string {
  return `<p>${html}</p>`
}

/**
 * Tömör sor (címzett-sor, megszólítás, elköszönés) — a stíluslap adja a
 * szűkebb térközt. A `klassz` a `.doc-sor` / `.doc-megszolitas` /
 * `.doc-udvarlas` osztályok egyike.
 */
function sorBek(html: string, klassz: 'doc-sor' | 'doc-megszolitas' | 'doc-udvarlas' = 'doc-sor'): string {
  return `<p class="${klassz}">${html}</p>`
}

/**
 * A törzs-wrapper. Vízszintes paddingot NEM ad — a lap-tükröt (25mm bal / 20mm
 * jobb margó) a közös stíluslap `.page` paddingja adja, így a fejléc, a törzs
 * és az aláírás-blokk PONTOSAN egy vonalban áll.
 *
 * Igazolás-típusú családoknál `cim`-mel középre zárt dokumentum-cím is kerül a
 * törzs élére (a hivatalos irat szokásos elrendezése; a lap így nem néz üresen).
 */
function torzs(bekezdesek: string[], cim?: string): string {
  const cimSor = cim ? `<h1 class="doc-cim">${escapeHtml(cim)}</h1>\n  ` : ''
  return `<div class="doc-torzs">
  ${cimSor}${bekezdesek.join('\n  ')}
</div>`
}

// ─────────────────────────────────────────────────────────────────
// Nyelvhelyes gyülekezetnév-formulák
// ─────────────────────────────────────────────────────────────────

/** „A" / „Az" névelő a gyülekezetnév első betűje szerint. */
function huNevelo(nev: string): string {
  const first = (nev.trim().charAt(0) || '').toLowerCase()
  return 'aáeéiíoóöőuúüű'.includes(first) ? 'Az' : 'A'
}

/** Magyar hivatal-formula: „A(z) <b>{név}</b> Lelkipásztori Hivatala". */
function huHivatal(nev: string): string {
  const t = nev.trim()
  return `${huNevelo(t)} <b>${escapeHtml(t)}</b> Lelkipásztori Hivatala`
}

/**
 * Román hivatal-formula: „Parohia Reformată {X}" alakú névnél a birtokos
 * szerkezet („Oficiul Parohial al Parohiei Reformate {X}"), különben
 * nyelvtanilag semleges „Oficiul Parohial al parohiei <b>{név}</b>".
 */
function roOficiu(nev: string): string {
  const m = nev.trim().match(/^parohia\s+reformat[aă]\s+(.+)$/i)
  return m
    ? `Oficiul Parohial al Parohiei Reformate <b>${escapeHtml(m[1])}</b>`
    : `Oficiul Parohial al parohiei <b>${escapeHtml(nev.trim())}</b>`
}

/** Román birtokos a lelkész-formulához: „preot paroh al Parohiei Reformate {X}". */
function roParohiaGen(nev: string): string {
  const m = nev.trim().match(/^parohia\s+reformat[aă]\s+(.+)$/i)
  return m
    ? `al Parohiei Reformate <b>${escapeHtml(m[1])}</b>`
    : `al parohiei <b>${escapeHtml(nev.trim())}</b>`
}

/** Angol hivatal-formula: „The Parish Office of the Reformed Parish of {X}". */
function enOffice(nev: string): string {
  const m = nev.trim().match(/^(?:the\s+)?reformed\s+parish\s+of\s+(.+)$/i)
  return m
    ? `The Parish Office of the Reformed Parish of <b>${escapeHtml(m[1])}</b>`
    : `The Parish Office of <b>${escapeHtml(nev.trim())}</b>`
}

/** Angol lelkész-formula: „Minister of the Reformed Parish of {X}". */
function enMinisterOf(nev: string): string {
  const m = nev.trim().match(/^(?:the\s+)?reformed\s+parish\s+of\s+(.+)$/i)
  return m
    ? `Minister of the Reformed Parish of <b>${escapeHtml(m[1])}</b>`
    : `Minister of <b>${escapeHtml(nev.trim())}</b>`
}

/**
 * Német hivatal-formula: „Das Pfarramt der Reformierten Kirchengemeinde {X}".
 * A helységnév-magot a letterheads.gyulekezetNevMag bontja ki a magyar/román/
 * angol név-alakokból (a gyülekezetnek nincs német nevet tároló oszlopa);
 * ismeretlen alaknál a teljes nevet használjuk névelő nélkül, hogy ne
 * keletkezzen hibásan ragozott német szerkezet.
 */
function deAmt(nev: string): string {
  const mag = gyulekezetNevMag(nev)
  return mag
    ? `Das Pfarramt der Reformierten Kirchengemeinde <b>${escapeHtml(mag)}</b>`
    : `Das Pfarramt <b>${escapeHtml(nev.trim())}</b>`
}

/** Német lelkész-formula: „Pfarrer der Reformierten Kirchengemeinde {X}". */
function dePfarrerVon(nev: string): string {
  const mag = gyulekezetNevMag(nev)
  return mag
    ? `Pfarrer der Reformierten Kirchengemeinde <b>${escapeHtml(mag)}</b>`
    : `Pfarrer der Kirchengemeinde <b>${escapeHtml(nev.trim())}</b>`
}

/**
 * A tanúsító nyitó-formula: „… igazolja, hogy" / „… adeverește …" /
 * „… certifies that" / „… bescheinigt hiermit, dass".
 */
function tanusitoIntro(nyelv: DokumentumNyelv, gyulekezetNev: string): string {
  if (nyelv === 'ro') return `${roOficiu(gyulekezetNev)} adeverește prin prezenta că`
  if (nyelv === 'en') return `${enOffice(gyulekezetNev)} hereby certifies that`
  if (nyelv === 'de') return `${deAmt(gyulekezetNev)} bescheinigt hiermit, dass`
  return `${huHivatal(gyulekezetNev)} igazolja, hogy`
}

/**
 * A 2. és további személy bekezdésének nyitánya. Magyarul/románul/angolul a
 * személy-mondat önmagában is teljes mondat, NÉMETÜL viszont a `dass`-os
 * alárendelt szerkezet miatt kell egy új főmondat — különben mondat-töredék
 * kerülne a hivatalos iratra.
 */
function tovabbiIntro(nyelv: DokumentumNyelv): string {
  return nyelv === 'de' ? 'Ferner wird bescheinigt, dass ' : ''
}

// ─────────────────────────────────────────────────────────────────
// Nyelvtani (nem-függő) segédek — PersonCertData.nem alapján
// ─────────────────────────────────────────────────────────────────

type Nem = PersonCertData['nem']

function roFiu(nem: Nem): string {
  return nem === 'ferfi' ? 'fiul' : nem === 'no' ? 'fiica' : 'fiul/fiica'
}
function roAlA(nem: Nem): string {
  return nem === 'ferfi' ? 'al' : nem === 'no' ? 'a' : 'al/a'
}
function roNascut(nem: Nem): string {
  return nem === 'ferfi' ? 'născut' : nem === 'no' ? 'născută' : 'născut(ă)'
}
function roConfirmat(nem: Nem): string {
  return nem === 'ferfi' ? 'confirmat' : nem === 'no' ? 'confirmată' : 'confirmat(ă)'
}
function roInmormantat(nem: Nem): string {
  return nem === 'ferfi' ? 'înmormântat' : nem === 'no' ? 'înmormântată' : 'înmormântat(ă)'
}
function roDefunct(nem: Nem): string {
  return nem === 'ferfi' ? 'defunctul' : nem === 'no' ? 'defuncta' : 'defunctul/defuncta'
}
function roIlO(nem: Nem): string {
  return nem === 'ferfi' ? 'Îl' : nem === 'no' ? 'O' : 'Îl/O'
}

/** Német: „der verstorbene" / „die verstorbene" (a név elé, kisbetűvel). */
function deVerstorbene(nem: Nem): string {
  return nem === 'ferfi'
    ? 'der verstorbene'
    : nem === 'no'
      ? 'die verstorbene'
      : 'der/die verstorbene'
}

/** A házastárs megnevezése a NÉZŐPONTBAN álló személy neme szerint. */
function hazastarsCimke(nyelv: DokumentumNyelv, nem: Nem): string {
  if (nyelv === 'ro') return nem === 'ferfi' ? 'soția' : nem === 'no' ? 'soțul' : 'soț/soție'
  if (nyelv === 'en') return 'spouse'
  if (nyelv === 'de') return nem === 'ferfi' ? 'Ehefrau' : nem === 'no' ? 'Ehemann' : 'Ehepartner'
  return 'házastársa'
}

// ─────────────────────────────────────────────────────────────────
// F8f — KIPIPÁLHATÓ ESEMÉNYEK a személy-mondatban
//
// A user éles észrevétele (2026-07-25): „ezek legyenek kipipálható
// konfirmációk, hogy ezek közül melyik kerüljön bele a szövegbe". Ezért a
// személy-bekezdés nem fix mondat többé, hanem EGY alap-állítás (név + szülők
// + születés) + a BEPIPÁLT események klauzulái, nyelvhelyesen összefűzve.
//
// Nyelvtani szabályok, amiket a felsorol()/szemelyMondat() együtt garantál:
//  - 0 esemény  → a mondat az alap-állításnál ér véget (nincs csonka vessző,
//                 és NEM kerül a végére a „egyházközségünkben" helyhatározó);
//  - 1 esemény  → „alap ÉS esemény" (nincs felsorolás-maradvány);
//  - 2+ esemény → „alap, e1 ÉS e2" (magyarul/románul/németül sincs vessző a
//                 kötőszó előtt, angolul sincs Oxford-vessző).
//  - NÉMET: az alárendelt (dass-) mondat igevégű, ezért a helyhatározó nem a
//    mondat végére kerül, hanem az ELSŐ esemény-klauzulába.
//
// FONTOS (user-döntés): a bepipált, de ADAT NÉLKÜLI esemény NEM tűnik el —
// kitöltő-vonal („__________") marad a dátum helyén, ahogy a papír-alapú
// gyakorlat kívánja (kézzel pótolható). A pipa kivétele az egyetlen mód az
// esemény elhagyására; ehhez ad a vanEsemenyAdat() előzetes segítséget.
// ─────────────────────────────────────────────────────────────────

/** Nyelvhelyes felsorolás: „a" · „a és b" · „a, b és c" (kötőszó előtt nincs vessző). */
function felsorol(nyelv: DokumentumNyelv, tagok: string[]): string {
  const t = tagok.filter((x) => (x || '').trim().length > 0)
  if (t.length === 0) return ''
  if (t.length === 1) return t[0]
  const kotoszo =
    nyelv === 'ro' ? ' și ' : nyelv === 'en' ? ' and ' : nyelv === 'de' ? ' und ' : ' és '
  return `${t.slice(0, -1).join(', ')}${kotoszo}${t[t.length - 1]}`
}

/** „…egyházközségünkben" helyhatározó a mondat végén (németnél lásd DE_HELY). */
const HELY_SUFFIX: Record<DokumentumNyelv, string> = {
  hu: ' egyházközségünkben',
  ro: ' în parohia noastră',
  en: ' in our parish',
  de: '',
}

/** Németül a helyhatározó az ELSŐ esemény-klauzulába kerül (igevégű mondat). */
const DE_HELY = ' in unserer Kirchengemeinde'

/**
 * Egy esemény alárendelt klauzulája — a mondat alanya (a személy) NEM ismétlődik.
 * A `loc` a német helyhatározó (csak az első klauzulán, különben üres),
 * a `konfHitvallas` a konfirmációi igazolás bővebb megfogalmazását kéri.
 */
function esemenyKlauzula(
  key: EsemenyKulcs,
  nyelv: DokumentumNyelv,
  p: PersonCertData,
  opts: { loc: string; konfHitvallas?: boolean },
): string {
  const loc = opts.loc

  if (key === 'kereszteles') {
    const d = datumErtek(nyelv, p.keresztelesDatum)
    if (nyelv === 'ro') return `a primit sacramentul botezului la data de <b>${d}</b>`
    if (nyelv === 'en') return `received the sacrament of holy baptism on <b>${d}</b>`
    if (nyelv === 'de') return `am <b>${d}</b>${loc} das Sakrament der heiligen Taufe empfing`
    return `a keresztség sákramentumában részesült <b>${d}</b> napján`
  }

  if (key === 'konfirmacio') {
    const d = datumErtek(nyelv, p.konfirmalasDatum)
    const bo = opts.konfHitvallas === true
    // A bővebb („hitvallásos") változat SZÁNDÉKOSAN nem tartalmaz belső
    // kötőszót: a klauzula elé a felsorolás már tehet egy „és"-t, és a kettő
    // egymás mellett („… napján ÉS a hitvallást ÉS a tanítást ismerve …")
    // gyengén olvasható hivatalos iraton.
    if (nyelv === 'ro') {
      return bo
        ? `a fost ${roConfirmat(p.nem)} în credința reformată la data de <b>${d}</b>`
        : `a fost ${roConfirmat(p.nem)} la data de <b>${d}</b>`
    }
    if (nyelv === 'en') {
      return bo
        ? `was confirmed in the Reformed faith on <b>${d}</b>`
        : `was confirmed on <b>${d}</b>`
    }
    if (nyelv === 'de') {
      return bo
        ? `im reformierten Glauben am <b>${d}</b>${loc} konfirmiert wurde`
        : `am <b>${d}</b>${loc} konfirmiert wurde`
    }
    return bo
      ? `a református hitvallás ismeretében konfirmált <b>${d}</b> napján`
      : `konfirmált <b>${d}</b> napján`
  }

  // hazassag
  const d = datumErtek(nyelv, p.hazassagDatum)
  const tars = (p.hazastarsNev || '').trim()
  const paren = tars ? ` (${hazastarsCimke(nyelv, p.nem)}: <b>${escapeHtml(tars)}</b>)` : ''
  if (nyelv === 'ro') return `s-a cununat religios la data de <b>${d}</b>${paren}`
  if (nyelv === 'en') return `was joined in marriage on <b>${d}</b>${paren}`
  if (nyelv === 'de') return `am <b>${d}</b>${loc} kirchlich getraut wurde${paren}`
  return `házasságot kötött <b>${d}</b> napján${paren}`
}

/**
 * Egy személy KÉSZ mondata: alap-állítás + a bepipált események klauzulái,
 * nyelvhelyesen összefűzve, ponttal lezárva.
 *
 * - `alap`: teljes értékű állítás önmagában is (pl. „X, A és B gyermeke,
 *   D napján született") — így 0 esemény esetén sem lesz csonka a mondat;
 * - `helyhatarozo`: false, ha az alap-állítás már tartalmazza a gyülekezetet
 *   (pl. „egyházközségünk nyilvántartott tagja") — ilyenkor nem ismételjük.
 */
function szemelyMondat(opts: {
  nyelv: DokumentumNyelv
  p: PersonCertData
  alap: string
  esemenyek: EsemenyKulcs[]
  konfHitvallas?: boolean
  helyhatarozo?: boolean
}): string {
  const { nyelv, p, alap, esemenyek } = opts
  const hely = opts.helyhatarozo !== false
  const klauzulak = esemenyek.map((key, i) =>
    esemenyKlauzula(key, nyelv, p, {
      loc: hely && nyelv === 'de' && i === 0 ? DE_HELY : '',
      konfHitvallas: opts.konfHitvallas,
    }),
  )
  const suffix = klauzulak.length > 0 && hely ? HELY_SUFFIX[nyelv] : ''
  return `${felsorol(nyelv, [alap, ...klauzulak])}${suffix}.`
}

// ─────────────────────────────────────────────────────────────────
// Közös záró-bekezdések (egyes/többes számban, mind a négy nyelven)
// ─────────────────────────────────────────────────────────────────

/**
 * Tagsági+cél záró bekezdés — a user-minta szerint: „Nevezettek
 * egyházközségünk nyilvántartott tagjai… {{cel}} céljából" (1 személynél
 * egyes számban). A dokumentumSzoHu a magyar mondat tárgya
 * („bizonyítványt" / „igazolást").
 */
function tagsagiZaro(
  nyelv: DokumentumNyelv,
  tobb: boolean,
  cel: string,
  dokumentumSzoHu: 'bizonyítványt' | 'igazolást' = 'igazolást',
): string {
  if (nyelv === 'ro') {
    return tobb
      ? `Persoanele menționate figurează în evidențele parohiei noastre ca membri înregistrați; prezenta adeverință se eliberează la cererea lor personală, pentru a le servi la ${cel}.`
      : `Persoana menționată figurează în evidențele parohiei noastre ca membru înregistrat; prezenta adeverință se eliberează la cererea sa personală, pentru a-i servi la ${cel}.`
  }
  if (nyelv === 'en') {
    return tobb
      ? `The persons named above are registered members of our parish; this certificate has been issued at their personal request for the purpose of ${cel}.`
      : `The person named above is a registered member of our parish; this certificate has been issued at their personal request for the purpose of ${cel}.`
  }
  if (nyelv === 'de') {
    // A cél szabad szöveg → kettőspont utáni felsorolás (így tetszőleges
    // megfogalmazás mellett is nyelvtanilag helyes marad a mondat).
    return tobb
      ? `Die oben genannten Personen sind eingetragene Mitglieder unserer Kirchengemeinde. Diese Bescheinigung wurde auf ihren persönlichen Wunsch zu folgendem Zweck ausgestellt: ${cel}.`
      : `Die oben genannte Person ist eingetragenes Mitglied unserer Kirchengemeinde. Diese Bescheinigung wurde auf ihren persönlichen Wunsch zu folgendem Zweck ausgestellt: ${cel}.`
  }
  return tobb
    ? `Nevezettek egyházközségünk nyilvántartott tagjai; jelen ${dokumentumSzoHu} személyes kérésükre állítottuk ki ${cel} céljából.`
    : `Nevezett egyházközségünk nyilvántartott tagja; jelen ${dokumentumSzoHu} személyes kérésére állítottuk ki ${cel} céljából.`
}

/** Csak-cél záró bekezdés (amikor a tagság maga a törzs állítása). */
function celZaro(nyelv: DokumentumNyelv, tobb: boolean, cel: string): string {
  if (nyelv === 'ro') {
    return tobb
      ? `Prezenta adeverință se eliberează la cererea celor menționați, pentru a le servi la ${cel}.`
      : `Prezenta adeverință se eliberează la cererea persoanei interesate, pentru a-i servi la ${cel}.`
  }
  if (nyelv === 'en') {
    return tobb
      ? `This certificate has been issued at the personal request of the persons named above, for the purpose of ${cel}.`
      : `This certificate has been issued at the personal request of the person named above, for the purpose of ${cel}.`
  }
  if (nyelv === 'de') {
    return tobb
      ? `Diese Bescheinigung wurde auf persönlichen Wunsch der oben genannten Personen zu folgendem Zweck ausgestellt: ${cel}.`
      : `Diese Bescheinigung wurde auf persönlichen Wunsch der oben genannten Person zu folgendem Zweck ausgestellt: ${cel}.`
  }
  return tobb
    ? `Jelen igazolást személyes kérésükre állítottuk ki ${cel} céljából.`
    : `Jelen igazolást személyes kérésére állítottuk ki ${cel} céljából.`
}

// ─────────────────────────────────────────────────────────────────
// Személy-lista védelme: üres kiválasztásnál egy kitöltő-vonalas személy
// ─────────────────────────────────────────────────────────────────

const URES_SZEMELY: PersonCertData = {
  id: 0,
  teljesNev: '',
  szuletesiDatum: null,
  apjaNeve: null,
  anyjaNeve: null,
  vallas: null,
  keresztelesDatum: null,
  keresztszulok: null,
  keresztelesHelye: null,
  konfirmalasDatum: null,
  hazassagDatum: null,
  hazastarsNev: null,
  nem: null,
}

/** Legalább 1 (kitöltő-vonalas) személy, a maxSzemely-re vágva. */
function szemelyLista(persons: PersonCertData[], max: number): PersonCertData[] {
  const lista = (persons || []).slice(0, Math.max(1, max))
  return lista.length > 0 ? lista : [URES_SZEMELY]
}

// ─────────────────────────────────────────────────────────────────
// A CSALÁD-KATALÓGUS
// ─────────────────────────────────────────────────────────────────

const UGYKOR_IGAZOLAS = {
  ugykorKod: '2.',
  ugykorNev: 'Anya- és családkönyvi levelezés és adatvédelmi nyilatkozatok',
} as const

const UGYKOR_LEVEL = {
  ugykorKod: '1.',
  ugykorNev: 'Levelezés',
} as const

/** Az esemény-pipák magyar UI-címkéi (egy forrásból minden családhoz). */
const ESEMENY_CIMKE: Record<EsemenyKulcs, string> = {
  kereszteles: 'Keresztelés',
  konfirmacio: 'Konfirmáció',
  hazassag: 'Házasságkötés',
}

/** Esemény-opció rövidítő: `esem('kereszteles', true)`. */
function esem(key: EsemenyKulcs, alap: boolean): EsemenyOpcio {
  return { key, label: ESEMENY_CIMKE[key], alap }
}

// Melyik család mit kínál — a kiállító ezekből rajzolja a pipa-listát.
// (A modul-szintű konstansok azért kellenek, mert a buildBody-nak is látnia
//  kell őket a `this` használata nélkül — a hívó destrukturálhatja a családot.)
const OPCIOK_KERESZTELES: EsemenyOpcio[] = [
  esem('kereszteles', true),
  esem('konfirmacio', true),
  esem('hazassag', false),
]
const OPCIOK_KONFIRMACIO: EsemenyOpcio[] = [
  esem('kereszteles', true),
  esem('konfirmacio', true),
  esem('hazassag', false),
]
const OPCIOK_TAGSAG: EsemenyOpcio[] = [
  esem('kereszteles', true),
  esem('konfirmacio', true),
  esem('hazassag', true),
]
const OPCIOK_ESKETES: EsemenyOpcio[] = [
  esem('kereszteles', false),
  esem('konfirmacio', false),
  esem('hazassag', true),
]

/** A katalógus stabil család-azonosítói (a név-tábla kulcsai). */
type CsaladId =
  | 'keresztelesi_igazolas'
  | 'konfirmacioi_igazolas'
  | 'esketesi_igazolas'
  | 'tagsagi_igazolas'
  | 'temetesi_igazolas'
  | 'lelkeszi_ajanlas'
  | 'egyhaztag_atadas'
  | 'hivatalos_level'

/**
 * A dokumentumok NEVE nyelvenként — EGY forrásból két helyre:
 *  (a) a család `nevNyelv` mezőjébe → innen veszi a kiállító a TÁRGY-sort
 *      (user-észrevétel: román/angol/német iraton a Tárgy is azon a nyelven);
 *  (b) az igazolás-típusú családok törzsének középre zárt cím-sorába.
 */
const CSALAD_NEVEK: Record<CsaladId, Record<DokumentumNyelv, string>> = {
  keresztelesi_igazolas: {
    hu: 'Keresztelési igazolás',
    ro: 'Adeverință de botez',
    en: 'Certificate of Baptism',
    de: 'Taufbescheinigung',
  },
  konfirmacioi_igazolas: {
    hu: 'Konfirmációi igazolás',
    ro: 'Adeverință de confirmare',
    en: 'Certificate of Confirmation',
    de: 'Konfirmationsbescheinigung',
  },
  esketesi_igazolas: {
    hu: 'Esketési igazolás',
    ro: 'Adeverință de cununie religioasă',
    en: 'Certificate of Marriage',
    de: 'Trauungsbescheinigung',
  },
  tagsagi_igazolas: {
    hu: 'Tagsági igazolás',
    ro: 'Adeverință de membru',
    en: 'Certificate of Church Membership',
    de: 'Bescheinigung über die Gemeindezugehörigkeit',
  },
  temetesi_igazolas: {
    hu: 'Temetési igazolás',
    ro: 'Adeverință de înmormântare',
    en: 'Certificate of Burial',
    de: 'Bestattungsbescheinigung',
  },
  lelkeszi_ajanlas: {
    hu: 'Lelkészi ajánlás',
    ro: 'Recomandare pastorală',
    en: 'Pastoral Letter of Recommendation',
    de: 'Pfarramtliche Empfehlung',
  },
  egyhaztag_atadas: {
    hu: 'Egyháztag átadása',
    ro: 'Transferul unui membru către altă parohie',
    en: 'Transfer of a Church Member to Another Parish',
    de: 'Überweisung eines Gemeindegliedes an eine andere Kirchengemeinde',
  },
  hivatalos_level: {
    hu: 'Hivatalos levél',
    ro: 'Adresă oficială',
    en: 'Official Letter',
    de: 'Amtliches Schreiben',
  },
}

export const DOKUMENTUM_CSALADOK: DokumentumCsalad[] = [
  // ── 1) Keresztelési igazolás (1–4 személy, pl. testvérek) ──────────
  {
    id: 'keresztelesi_igazolas',
    nev: 'Keresztelési igazolás',
    nevNyelv: CSALAD_NEVEK.keresztelesi_igazolas,
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [
      {
        key: 'cel',
        label: 'Kiállítás célja (pl. keresztszülőség, iskolai beiratkozás)',
        // User-észrevétel (2026-07-25): „Keresztelés esetén a keresztszülőség
        // egyértelmű — az legyen kitöltve!"
        alapertek: 'keresztszülőség',
      },
    ],
    esemenyOpciok: OPCIOK_KERESZTELES,
    buildBody({ persons, nyelv, kezi, gyulekezetNev, esemenyek }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)
      const aktiv = aktivEsemenyek(OPCIOK_KERESZTELES, esemenyek)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const apa = ertek(p.apjaNeve)
        const anya = ertek(p.anyjaNeve)
        const alap =
          nyelv === 'ro'
            ? `<b>${nev}</b>, ${roFiu(p.nem)} lui ${apa} și ${roAlA(p.nem)} ${anya}, părinți reformați, s-a născut la data de <b>${szul}</b>`
            : nyelv === 'en'
              ? `<b>${nev}</b>, child of ${apa} and ${anya}, members of the Reformed Church, was born on <b>${szul}</b>`
              : nyelv === 'de'
                ? `<b>${nev}</b>, Kind der reformierten Eltern ${apa} und ${anya}, am <b>${szul}</b> geboren wurde`
                : `<b>${nev}</b>, ${apa} és ${anya} református szülők gyermeke, <b>${szul}</b> napján született`
        return szemelyMondat({ nyelv, p, alap, esemenyek: aktiv })
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(`${tovabbiIntro(nyelv)}${mondat(p)}`)),
        bek(tagsagiZaro(nyelv, tobb, cel, 'bizonyítványt')),
      ]
      return torzs(bekezdesek, CSALAD_NEVEK.keresztelesi_igazolas[nyelv])
    },
  },

  // ── 2) Konfirmációi igazolás (1–4 személy) ─────────────────────────
  {
    id: 'konfirmacioi_igazolas',
    nev: 'Konfirmációi igazolás',
    nevNyelv: CSALAD_NEVEK.konfirmacioi_igazolas,
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    esemenyOpciok: OPCIOK_KONFIRMACIO,
    buildBody({ persons, nyelv, kezi, gyulekezetNev, esemenyek }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)
      const aktiv = aktivEsemenyek(OPCIOK_KONFIRMACIO, esemenyek)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const alap =
          nyelv === 'ro'
            ? `<b>${nev}</b> s-a născut la data de <b>${szul}</b>`
            : nyelv === 'en'
              ? `<b>${nev}</b> was born on <b>${szul}</b>`
              : nyelv === 'de'
                ? `<b>${nev}</b> am <b>${szul}</b> geboren wurde`
                : `<b>${nev}</b> <b>${szul}</b> napján született`
        // A konfirmáció ebben a családban a BŐVEBB, hitvallásos formulát kapja.
        return szemelyMondat({ nyelv, p, alap, esemenyek: aktiv, konfHitvallas: true })
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(`${tovabbiIntro(nyelv)}${mondat(p)}`)),
        bek(tagsagiZaro(nyelv, tobb, cel)),
      ]
      return torzs(bekezdesek, CSALAD_NEVEK.konfirmacioi_igazolas[nyelv])
    },
  },

  // ── 3) Esketési igazolás (2 személy — a pár) ───────────────────────
  {
    id: 'esketesi_igazolas',
    nev: 'Esketési igazolás',
    nevNyelv: CSALAD_NEVEK.esketesi_igazolas,
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 2,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    esemenyOpciok: OPCIOK_ESKETES,
    buildBody({ persons, nyelv, kezi, gyulekezetNev, esemenyek }) {
      const emberek = szemelyLista(persons, 2)
      const cel = ertek(kezi.cel)
      const aktiv = aktivEsemenyek(OPCIOK_ESKETES, esemenyek)
      const hazassagKell = aktiv.includes('hazassag')
      // A pár KÖZÖS mondata a házasságkötésé; a keresztelés/konfirmáció viszont
      // személyenként eltér → külön bekezdésekbe kerül.
      const egyeni = aktiv.filter((k) => k !== 'hazassag')

      // Férj/feleség a nem-mező szerint; hiányában a kiválasztás sorrendje.
      const ferj = emberek.find((p) => p.nem === 'ferfi') || emberek[0] || URES_SZEMELY
      const feleseg =
        emberek.find((p) => p.nem === 'no') || emberek.find((p) => p !== ferj) || URES_SZEMELY
      const datum = datumErtek(
        nyelv,
        [ferj.hazassagDatum, feleseg.hazassagDatum].find(Boolean) || null,
      )
      const ferjNev = ertek(ferj.teljesNev)
      const felesegNev = ertek(feleseg.teljesNev)

      /** A pár közös esketési mondata (ha a Házasságkötés be van pipálva). */
      const eskuvoMondat =
        nyelv === 'ro'
          ? `<b>${ferjNev}</b> și <b>${felesegNev}</b> s-au cununat religios, după ritualul Bisericii Reformate, în parohia noastră, la data de <b>${datum}</b>.`
          : nyelv === 'en'
            ? `<b>${ferjNev}</b> and <b>${felesegNev}</b> were joined in marriage according to the rites of the Reformed Church in our parish on <b>${datum}</b>.`
            : nyelv === 'de'
              ? `<b>${ferjNev}</b> und <b>${felesegNev}</b> am <b>${datum}</b> in unserer Kirchengemeinde nach der Ordnung der Reformierten Kirche kirchlich getraut wurden.`
              : `<b>${ferjNev}</b> és <b>${felesegNev}</b> <b>${datum}</b> napján református szertartás szerint házasságot kötöttek egyházközségünkben.`

      /** Tartalék mondat, ha EGYETLEN esemény sincs bepipálva (nincs csonka lap). */
      const azonositoMondat = (): string => {
        const f1 = datumErtek(nyelv, ferj.szuletesiDatum)
        const f2 = datumErtek(nyelv, feleseg.szuletesiDatum)
        if (nyelv === 'ro') {
          return `<b>${ferjNev}</b> (${roNascut(ferj.nem)} la data de <b>${f1}</b>) și <b>${felesegNev}</b> (${roNascut(feleseg.nem)} la data de <b>${f2}</b>) figurează în evidențele noastre ca membri înregistrați ai parohiei.`
        }
        if (nyelv === 'en') {
          return `<b>${ferjNev}</b> (born on <b>${f1}</b>) and <b>${felesegNev}</b> (born on <b>${f2}</b>) are, according to our records, registered members of our parish.`
        }
        if (nyelv === 'de') {
          return `<b>${ferjNev}</b> (geboren am <b>${f1}</b>) und <b>${felesegNev}</b> (geboren am <b>${f2}</b>) nach unseren Unterlagen eingetragene Mitglieder unserer Kirchengemeinde sind.`
        }
        return `<b>${ferjNev}</b> (szül.: <b>${f1}</b>) és <b>${felesegNev}</b> (szül.: <b>${f2}</b>) egyházközségünk nyilvántartott tagjai.`
      }

      /** Egy fél saját (keresztelés/konfirmáció) mondata. */
      const egyeniMondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const alap =
          nyelv === 'ro'
            ? `<b>${nev}</b> s-a născut la data de <b>${szul}</b>`
            : nyelv === 'en'
              ? `<b>${nev}</b> was born on <b>${szul}</b>`
              : nyelv === 'de'
                ? `<b>${nev}</b> am <b>${szul}</b> geboren wurde`
                : `<b>${nev}</b> <b>${szul}</b> napján született`
        return szemelyMondat({ nyelv, p, alap, esemenyek: egyeni })
      }

      const bekezdesek: string[] = []
      if (hazassagKell) {
        bekezdesek.push(bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${eskuvoMondat}`))
      }
      if (egyeni.length > 0) {
        for (const p of emberek) {
          const mondat = egyeniMondat(p)
          bekezdesek.push(
            bek(
              bekezdesek.length === 0
                ? `${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat}`
                : `${tovabbiIntro(nyelv)}${mondat}`,
            ),
          )
        }
      }
      const nincsEsemeny = bekezdesek.length === 0
      if (nincsEsemeny) {
        bekezdesek.push(bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${azonositoMondat()}`))
      }
      // Ha a tartalék (tagsági) mondat került a törzsbe, a záró bekezdés NE
      // ismételje meg a tagságot — ilyenkor a csak-célt kimondó formula áll.
      bekezdesek.push(
        bek(nincsEsemeny ? celZaro(nyelv, true, cel) : tagsagiZaro(nyelv, true, cel)),
      )

      return torzs(bekezdesek, CSALAD_NEVEK.esketesi_igazolas[nyelv])
    },
  },

  // ── 4) Tagsági igazolás (1–4 személy, pl. család) ──────────────────
  {
    id: 'tagsagi_igazolas',
    nev: 'Tagsági igazolás',
    nevNyelv: CSALAD_NEVEK.tagsagi_igazolas,
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    esemenyOpciok: OPCIOK_TAGSAG,
    buildBody({ persons, nyelv, kezi, gyulekezetNev, esemenyek }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)
      const aktiv = aktivEsemenyek(OPCIOK_TAGSAG, esemenyek)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const anyja = ertek(p.anyjaNeve)
        const alap =
          nyelv === 'ro'
            ? `<b>${nev}</b> (${roNascut(p.nem)} la data de <b>${szul}</b>, numele mamei: ${anyja}) figurează în evidențele noastre ca membru înregistrat al parohiei`
            : nyelv === 'en'
              ? `<b>${nev}</b> (born on <b>${szul}</b>, mother's name: ${anyja}) is, according to our records, a registered member of our parish`
              : nyelv === 'de'
                ? `<b>${nev}</b> (geboren am <b>${szul}</b>, Name der Mutter: ${anyja}) nach unseren Unterlagen eingetragenes Mitglied unserer Kirchengemeinde ist`
                : `<b>${nev}</b> (szül.: <b>${szul}</b>, anyja neve: ${anyja}) egyházközségünk nyilvántartott tagja`
        // Az alap-állítás MÁR megnevezi a gyülekezetet → nincs záró helyhatározó.
        return szemelyMondat({ nyelv, p, alap, esemenyek: aktiv, helyhatarozo: false })
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(`${tovabbiIntro(nyelv)}${mondat(p)}`)),
        bek(celZaro(nyelv, tobb, cel)),
      ]
      return torzs(bekezdesek, CSALAD_NEVEK.tagsagi_igazolas[nyelv])
    },
  },

  // ── 5) Temetési igazolás (1 személy) ───────────────────────────────
  {
    id: 'temetesi_igazolas',
    nev: 'Temetési igazolás',
    nevNyelv: CSALAD_NEVEK.temetesi_igazolas,
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 1,
    keziMezok: [
      { key: 'elhalalozas_datuma', label: 'Elhalálozás dátuma' },
      { key: 'temetes_datuma', label: 'Temetés dátuma' },
    ],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const p = szemelyLista(persons, 1)[0]
      const nev = ertek(p.teljesNev)
      const szul = datumErtek(nyelv, p.szuletesiDatum)
      const elh = keziDatumErtek(nyelv, kezi, 'elhalalozas_datuma')
      const tem = keziDatumErtek(nyelv, kezi, 'temetes_datuma')

      let fo: string
      let zaro: string
      if (nyelv === 'ro') {
        fo = `${roDefunct(p.nem)} <b>${nev}</b> (${roNascut(p.nem)} la data de <b>${szul}</b>, ${roFiu(p.nem)} lui ${ertek(p.apjaNeve)} și ${roAlA(p.nem)} ${ertek(p.anyjaNeve)}) a decedat la data de <b>${elh}</b> și a fost ${roInmormantat(p.nem)} la data de <b>${tem}</b>, după ritualul Bisericii Reformate.`
        zaro = 'Prezenta adeverință se eliberează la cererea familiei, pentru a-i servi la cele legale.'
      } else if (nyelv === 'en') {
        fo = `the late <b>${nev}</b> (born on <b>${szul}</b>, child of ${ertek(p.apjaNeve)} and ${ertek(p.anyjaNeve)}) died on <b>${elh}</b> and was buried according to the rites of the Reformed Church on <b>${tem}</b>.`
        zaro = 'This certificate has been issued at the request of the family, for official use.'
      } else if (nyelv === 'de') {
        fo = `${deVerstorbene(p.nem)} <b>${nev}</b> (geboren am <b>${szul}</b>, Kind von ${ertek(p.apjaNeve)} und ${ertek(p.anyjaNeve)}) am <b>${elh}</b> verstorben ist und am <b>${tem}</b> nach der Ordnung der Reformierten Kirche kirchlich bestattet wurde.`
        zaro = 'Diese Bescheinigung wurde auf Wunsch der Angehörigen zum amtlichen Gebrauch ausgestellt.'
      } else {
        fo = `néhai <b>${nev}</b> (szül.: <b>${szul}</b>, ${ertek(p.apjaNeve)} és ${ertek(p.anyjaNeve)} gyermeke) <b>${elh}</b> napján elhunyt, és <b>${tem}</b> napján a református egyház szertartása szerint eltemettük.`
        zaro = 'Jelen igazolást a hozzátartozók kérésére, hivatalos felhasználásra állítottuk ki.'
      }

      return torzs(
        [bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${fo}`), bek(zaro)],
        CSALAD_NEVEK.temetesi_igazolas[nyelv],
      )
    },
  },

  // ── 6) Lelkészi ajánlás (1 személy) ────────────────────────────────
  {
    id: 'lelkeszi_ajanlas',
    nev: 'Lelkészi ajánlás',
    nevNyelv: CSALAD_NEVEK.lelkeszi_ajanlas,
    tipus: 'level',
    ...UGYKOR_LEVEL,
    maxSzemely: 1,
    keziMezok: [{ key: 'indoklas', label: 'Indoklás (az ajánlás konkrét tartalma)' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const p = szemelyLista(persons, 1)[0]
      const nev = ertek(p.teljesNev)
      const szul = datumErtek(nyelv, p.szuletesiDatum)
      const indoklas = (kezi.indoklas || '').trim()
      // Szabad szöveg → bekezdésekre bontva (üres sor = bekezdés-határ), hogy a
      // hosszabb indoklás is olvashatóan tagolódjon az A4-en.
      const indoklasBekezdesek = indoklas
        ? indoklas
            .split(/\n{2,}/)
            .map((blokk) => bek(escapeHtml(blokk).replaceAll('\n', '<br />')))
        : [bek(KITOLTO_HOSSZU)]

      if (nyelv === 'ro') {
        return torzs([
          bek(
            `Subsemnatul, preot paroh ${roParohiaGen(gyulekezetNev)}, recomand prin prezenta pe <b>${nev}</b> (${roNascut(p.nem)} la data de <b>${szul}</b>), membru înregistrat al parohiei noastre, care ia parte activă la viața comunității noastre.`,
          ),
          ...indoklasBekezdesek,
          bek(
            `${roIlO(p.nem)} recomand cu toată încrederea și vă rog respectuos să îi acordați sprijinul dumneavoastră.`,
          ),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          bek(
            `I, the undersigned, ${enMinisterOf(gyulekezetNev)}, hereby recommend <b>${nev}</b> (born on <b>${szul}</b>), a registered member of our parish who takes an active part in the life of our congregation.`,
          ),
          ...indoklasBekezdesek,
          bek('I recommend them warmly and kindly ask for your support.'),
        ])
      }
      if (nyelv === 'de') {
        return torzs([
          bek(
            `Ich, der Unterzeichnete, ${dePfarrerVon(gyulekezetNev)}, empfehle hiermit <b>${nev}</b> (geboren am <b>${szul}</b>), ein eingetragenes Mitglied unserer Kirchengemeinde, das am Leben unserer Gemeinde regen Anteil nimmt.`,
          ),
          ...indoklasBekezdesek,
          bek(
            'Ich empfehle die genannte Person mit voller Überzeugung und bitte Sie höflich um Ihre wohlwollende Unterstützung.',
          ),
        ])
      }
      const nevelo = huNevelo(gyulekezetNev) === 'Az' ? 'az' : 'a'
      return torzs([
        bek(
          `Alulírott, ${nevelo} <b>${escapeHtml(gyulekezetNev.trim())}</b> lelkipásztora, ezúton ajánlom <b>${nev}</b> (szül.: <b>${szul}</b>) egyháztagunkat, aki egyházközségünk nyilvántartott, gyülekezeti életünkben részt vevő tagja.`,
        ),
        ...indoklasBekezdesek,
        bek('Nevezettet jó szívvel ajánlom, kérem szíves támogatásukat.'),
      ])
    },
  },

  // ── 7) Egyháztag átadása másik egyházközségnek (1 személy) ─────────
  {
    id: 'egyhaztag_atadas',
    nev: 'Egyháztag átadása másik egyházközségnek',
    nevNyelv: CSALAD_NEVEK.egyhaztag_atadas,
    tipus: 'level',
    ...UGYKOR_LEVEL,
    maxSzemely: 1,
    keziMezok: [{ key: 'cel_gyulekezet', label: 'Cél-egyházközség hivatalos neve' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const p = szemelyLista(persons, 1)[0]
      const nev = ertek(p.teljesNev)
      const szul = datumErtek(nyelv, p.szuletesiDatum)
      const anyja = ertek(p.anyjaNeve)
      const ker = datumErtek(nyelv, p.keresztelesDatum)
      const konf = datumErtek(nyelv, p.konfirmalasDatum)
      const celGyul = ertek(kezi.cel_gyulekezet)

      if (nyelv === 'ro') {
        return torzs([
          bek(
            `${roOficiu(gyulekezetNev)} adeverește, pe baza înregistrărilor din registrele parohiale, că <b>${nev}</b> (${roNascut(p.nem)} la data de <b>${szul}</b>, numele mamei: ${anyja}) a figurat în evidențele parohiei noastre ca membru înregistrat.`,
          ),
          bek(
            `La cererea sa, respectiv ca urmare a schimbării domiciliului, ${p.nem === 'no' ? 'o' : p.nem === 'ferfi' ? 'îl' : 'îl/o'} predăm prin prezenta parohiei <b>${celGyul}</b>, cu rugămintea respectuoasă de a fi ${p.nem === 'no' ? 'luată' : p.nem === 'ferfi' ? 'luat' : 'luat(ă)'} în evidență.`,
          ),
          bek(
            `Conform registrelor noastre parohiale, a primit sacramentul botezului la data de <b>${ker}</b> și a depus mărturia de confirmare la data de <b>${konf}</b>.`,
          ),
          bek(
            'Prezenta adeverință se eliberează la solicitarea parohiei de destinație, pentru uz oficial; datele menționate corespund întocmai înregistrărilor din registrele noastre.',
          ),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          bek(
            `${enOffice(gyulekezetNev)} certifies, on the basis of the entries in its parish registers, that <b>${nev}</b> (born on <b>${szul}</b>, mother's name: ${anyja}) was a registered member of our parish.`,
          ),
          bek(
            `At their request, and on account of their change of residence, we hereby transfer the above-named person to <b>${celGyul}</b>, respectfully asking that they be entered in its records.`,
          ),
          bek(
            `According to our registers, they received the sacrament of baptism on <b>${ker}</b> and made their confirmation vow on <b>${konf}</b>.`,
          ),
          bek(
            'This certificate has been issued at the request of the receiving parish for official use; the above particulars are in full conformity with the entries in our registers.',
          ),
        ])
      }
      if (nyelv === 'de') {
        return torzs([
          bek(
            `${deAmt(gyulekezetNev)} bescheinigt auf Grund der Eintragungen in den Kirchenbüchern, dass <b>${nev}</b> (geboren am <b>${szul}</b>, Name der Mutter: ${anyja}) eingetragenes Mitglied unserer Kirchengemeinde war.`,
          ),
          bek(
            `Auf eigenen Wunsch bzw. wegen Wohnsitzwechsels überweisen wir die genannte Person hiermit an die Kirchengemeinde <b>${celGyul}</b> mit der höflichen Bitte um Aufnahme in deren Gemeindeverzeichnis.`,
          ),
          bek(
            `Nach unseren Kirchenbüchern empfing sie am <b>${ker}</b> das Sakrament der heiligen Taufe und legte am <b>${konf}</b> das Konfirmationsgelübde ab.`,
          ),
          bek(
            'Diese Bescheinigung wurde auf Ersuchen der aufnehmenden Kirchengemeinde zum amtlichen Gebrauch ausgestellt; die angeführten Angaben stimmen mit den Eintragungen unserer Kirchenbücher vollständig überein.',
          ),
        ])
      }
      return torzs([
        bek(
          `${huHivatal(gyulekezetNev)} egyházközségünk hivatalos anyakönyveinek bejegyzései alapján igazolja, hogy <b>${nev}</b> (született: <b>${szul}</b>, anyja neve: ${anyja}) egyházközségünk nyilvántartott tagja volt.`,
        ),
        bek(
          `Nevezettet — kérésére, illetve elköltözése okán — ezennel átadjuk a(z) <b>${celGyul}</b> részére, és tisztelettel kérjük szíves nyilvántartásba vételét.`,
        ),
        bek(
          `Anyakönyveink szerint a keresztség sákramentumában <b>${ker}</b> napján részesült, konfirmációi fogadalmat <b>${konf}</b> napján tett.`,
        ),
        bek(
          'Jelen igazolást a cél-egyházközség megkeresésére, hivatalos felhasználás céljából állítottuk ki; a felsorolt adatok anyakönyveink bejegyzéseivel mindenben megegyeznek.',
        ),
      ])
    },
  },

  // ── 8) Hivatalos levél (nem személyhez kötött — szabad törzs) ──────
  {
    id: 'hivatalos_level',
    nev: 'Hivatalos levél',
    nevNyelv: CSALAD_NEVEK.hivatalos_level,
    tipus: 'level',
    ...UGYKOR_LEVEL,
    maxSzemely: 0,
    keziMezok: [
      { key: 'cimzett', label: 'Címzett (intézmény vagy személy, címmel)' },
      { key: 'torzs', label: 'A levél szövege' },
    ],
    buildBody({ nyelv, kezi }) {
      const cimzett = ertek(kezi.cimzett)
      const szoveg = (kezi.torzs || '').trim()
      // Szabad szöveg → bekezdések: üres sor bekezdés-határ, sima sortörés <br />.
      const szovegBekezdesek = szoveg
        ? szoveg
            .split(/\n{2,}/)
            .map((blokk) => bek(escapeHtml(blokk).replaceAll('\n', '<br />')))
        : [bek(KITOLTO_HOSSZU)]

      if (nyelv === 'ro') {
        return torzs([
          sorBek(`Către: ${cimzett}`),
          sorBek('Stimate Doamne / Stimați Domni,', 'doc-megszolitas'),
          ...szovegBekezdesek,
          sorBek('Cu deosebită considerație,', 'doc-udvarlas'),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          sorBek(`To: ${cimzett}`),
          sorBek('Dear Sir or Madam,', 'doc-megszolitas'),
          ...szovegBekezdesek,
          sorBek('Yours faithfully,', 'doc-udvarlas'),
        ])
      }
      if (nyelv === 'de') {
        return torzs([
          sorBek(`An: ${cimzett}`),
          sorBek('Sehr geehrte Damen und Herren,', 'doc-megszolitas'),
          ...szovegBekezdesek,
          sorBek('Mit freundlichen Grüßen', 'doc-udvarlas'),
        ])
      }
      return torzs([
        sorBek(`Címzett: ${cimzett}`),
        sorBek('Tisztelt Cím!', 'doc-megszolitas'),
        ...szovegBekezdesek,
        sorBek('Tisztelettel:', 'doc-udvarlas'),
      ])
    },
  },
]

/** Család keresése id szerint (a kiállító választójához). */
export function getDokumentumCsalad(id: string): DokumentumCsalad | null {
  return DOKUMENTUM_CSALADOK.find((cs) => cs.id === id) || null
}
