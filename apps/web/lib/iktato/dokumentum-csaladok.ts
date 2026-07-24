/**
 * Iktató F8c — NYELVFÜGGETLEN DOKUMENTUM-CSALÁDOK (G1-kontraktus).
 *
 * A user éles teszt-észrevétele (2026-07-25) nyomán a NYELV a DOKUMENTUM
 * tulajdonsága lett: EGY „Dokumentum nyelve" (hu/ro/en) választó vezérli a
 * fejlécet, a Szám/Tárgy címkéket, a keltezés helység-nevét ÉS a törzs-szöveget.
 * Ehhez a sablonok nyelvfüggetlen CSALÁDOKKÁ álltak össze: nincs külön „román
 * sablon" — egy család (pl. keresztelési igazolás) mindhárom nyelven ugyanabból
 * az adat-készletből épül, és TÖBB személyre is működik (nem fix 2).
 *
 * A szövegek FORRÁSA a 11 seed-sablon (lib/filing/templates.ts): a magyar
 * törzsek a meglévő magyar seedekből, a román változatok az Adeverință-seedek
 * formuláiból (Oficiul Parohial…, „prezenta adeverință se eliberează…"),
 * az angol a kutatási tervdoc (KARTOTEKA-eletutigazolas-kutatas-2026-07-25.md)
 * hiteles-fordítás stílusú formulái szerint készült.
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

// ─────────────────────────────────────────────────────────────────
// Kontraktus-típusok
// ─────────────────────────────────────────────────────────────────

/** A dokumentum nyelve — a fejléc, a keret-címkék és a törzs is ezt követi. */
export type DokumentumNyelv = 'hu' | 'ro' | 'en'

export interface DokumentumCsalad {
  /** Stabil azonosító, pl. 'keresztelesi_igazolas'. */
  id: string
  /** Magyar megjelenítési név a választóban. */
  nev: string
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
   * A KÉSZ HTML-törzs előállítása — personönkénti bekezdésekkel, a kért
   * nyelven. A gyulekezetNev a hívó által már a dokumentum NYELVÉN kiválasztott
   * gyülekezetnév (nev_hu/nev_ro/nev_en, fallback: hivatalos név).
   */
  buildBody(opts: {
    persons: PersonCertData[]
    nyelv: DokumentumNyelv
    kezi: Record<string, string>
    gyulekezetNev: string
  }): string
}

/**
 * A kiállító-keret nyelvfüggő címkéi: „Szám:" / „Nr.:" / „No.:" és
 * „Tárgy:" / „Obiect:" / „Subject:". A keltElotag opcionális — a keltezesSor
 * teljes (előtag nélküli) keltezés-sort ad, ezért itt nem töltjük.
 */
export const NYELV_CIMKEK: Record<
  DokumentumNyelv,
  { szam: string; targy: string; keltElotag?: string }
> = {
  hu: { szam: 'Szám', targy: 'Tárgy' },
  ro: { szam: 'Nr.', targy: 'Obiect' },
  en: { szam: 'No.', targy: 'Subject' },
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
}

/**
 * Nyelvhelyes keltezés-sor a keltezés helyével és az ISO dátummal:
 *  - hu: „Barátos, 2026. július 25."
 *  - ro: „Barătoș, la 25 iulie 2026"
 *  - en: „Barătoș, July 25, 2026"
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
// Bekezdés- és törzs-építők (a sanitizeFilingHtml whitelistjén belül)
// ─────────────────────────────────────────────────────────────────

/** Behúzott, sorkizárt törzs-bekezdés (a seed-sablonok text-indent stílusa). */
function bek(html: string): string {
  return `<p style="text-indent:50px;margin:0 0 12px;text-align:justify;">${html}</p>`
}

/** Behúzás nélküli bekezdés (megszólítás, elköszönés, címzett-sor). */
function sorBek(html: string): string {
  return `<p style="margin:0 0 12px;">${html}</p>`
}

/**
 * A törzs-wrapper: vízszintesen a keret „Szám:"-sorával azonos (50px) padding,
 * Times-betű — a kiállító kerete elé/után illesztve egységes tükröt ad.
 */
function torzs(bekezdesek: string[]): string {
  return `<div style="padding:16px 50px 0;font-family:'Times New Roman',serif;line-height:1.6;font-size:14px;">
  ${bekezdesek.join('\n  ')}
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

/** A tanúsító nyitó-formula: „… igazolja, hogy" / „… adeverește …" / „… certifies that". */
function tanusitoIntro(nyelv: DokumentumNyelv, gyulekezetNev: string): string {
  if (nyelv === 'ro') return `${roOficiu(gyulekezetNev)} adeverește prin prezenta că`
  if (nyelv === 'en') return `${enOffice(gyulekezetNev)} hereby certifies that`
  return `${huHivatal(gyulekezetNev)} igazolja, hogy`
}

// ─────────────────────────────────────────────────────────────────
// Román nyelvtani (nem-függő) segédek — PersonCertData.nem alapján
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

// ─────────────────────────────────────────────────────────────────
// Közös záró-bekezdések (egyes/többes számban, mindhárom nyelven)
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

export const DOKUMENTUM_CSALADOK: DokumentumCsalad[] = [
  // ── 1) Keresztelési igazolás (1–4 személy, pl. testvérek) ──────────
  {
    id: 'keresztelesi_igazolas',
    nev: 'Keresztelési igazolás',
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja (pl. keresztszülőség, iskolai beiratkozás)' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const ker = datumErtek(nyelv, p.keresztelesDatum)
        const konf = datumSzoveg(nyelv, p.konfirmalasDatum)
        if (nyelv === 'ro') {
          return (
            `<b>${nev}</b>, ${roFiu(p.nem)} lui ${ertek(p.apjaNeve)} și ${roAlA(p.nem)} ${ertek(p.anyjaNeve)}, părinți reformați, s-a născut la data de ${szul}, a primit sacramentul botezului la data de ${ker}` +
            (konf ? `, a fost ${roConfirmat(p.nem)} la data de ${escapeHtml(konf)}` : '') +
            ' în parohia noastră.'
          )
        }
        if (nyelv === 'en') {
          return (
            `<b>${nev}</b>, child of ${ertek(p.apjaNeve)} and ${ertek(p.anyjaNeve)}, members of the Reformed Church, was born on ${szul} and received the sacrament of holy baptism on ${ker}` +
            (konf ? `, and was confirmed on ${escapeHtml(konf)}` : '') +
            ' in our parish.'
          )
        }
        return (
          `<b>${nev}</b>, ${ertek(p.apjaNeve)} és ${ertek(p.anyjaNeve)} református szülők gyermeke ${szul} napján született, a keresztség sákramentumában részesült ${ker} napján` +
          (konf ? `, konfirmált ${escapeHtml(konf)} napján` : '') +
          ' egyházközségünkben.'
        )
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(mondat(p))),
        bek(tagsagiZaro(nyelv, tobb, cel, 'bizonyítványt')),
      ]
      return torzs(bekezdesek)
    },
  },

  // ── 2) Konfirmációi igazolás (1–4 személy) ─────────────────────────
  {
    id: 'konfirmacioi_igazolas',
    nev: 'Konfirmációi igazolás',
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const konf = datumErtek(nyelv, p.konfirmalasDatum)
        if (nyelv === 'ro') {
          return `<b>${nev}</b> (${roNascut(p.nem)} la data de ${szul}) a depus mărturia de credință reformată și a fost ${roConfirmat(p.nem)} în parohia noastră la data de ${konf}.`
        }
        if (nyelv === 'en') {
          return `<b>${nev}</b> (born on ${szul}) made profession of the Reformed faith and was confirmed in our parish on ${konf}.`
        }
        return `<b>${nev}</b> (szül.: ${szul}) a református hitvallást és anyaszentegyházunk tanítását ismerve ${konf} napján konfirmált egyházközségünkben.`
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(mondat(p))),
        bek(tagsagiZaro(nyelv, tobb, cel)),
      ]
      return torzs(bekezdesek)
    },
  },

  // ── 3) Esketési igazolás (2 személy — a pár) ───────────────────────
  {
    id: 'esketesi_igazolas',
    nev: 'Esketési igazolás',
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 2,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const emberek = szemelyLista(persons, 2)
      const cel = ertek(kezi.cel)
      // Férj/feleség a nem-mező szerint; hiányában a kiválasztás sorrendje.
      const ferj = emberek.find((p) => p.nem === 'ferfi') || emberek[0] || URES_SZEMELY
      const feleseg =
        emberek.find((p) => p.nem === 'no') || emberek.find((p) => p !== ferj) || URES_SZEMELY
      const datum = datumErtek(
        nyelv,
        [ferj.hazassagDatum, feleseg.hazassagDatum].find(Boolean) || null,
      )

      const fo =
        nyelv === 'ro'
          ? `<b>${ertek(ferj.teljesNev)}</b> și <b>${ertek(feleseg.teljesNev)}</b> s-au cununat religios, după ritualul Bisericii Reformate, în parohia noastră, la data de ${datum}.`
          : nyelv === 'en'
            ? `<b>${ertek(ferj.teljesNev)}</b> and <b>${ertek(feleseg.teljesNev)}</b> were joined in marriage according to the rites of the Reformed Church in our parish on ${datum}.`
            : `<b>${ertek(ferj.teljesNev)}</b> és <b>${ertek(feleseg.teljesNev)}</b> ${datum} napján református szertartás szerint házasságot kötöttek egyházközségünkben.`

      return torzs([
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${fo}`),
        bek(tagsagiZaro(nyelv, true, cel)),
      ])
    },
  },

  // ── 4) Tagsági igazolás (1–4 személy, pl. család) ──────────────────
  {
    id: 'tagsagi_igazolas',
    nev: 'Tagsági igazolás',
    tipus: 'igazolas',
    ...UGYKOR_IGAZOLAS,
    maxSzemely: 4,
    keziMezok: [{ key: 'cel', label: 'Kiállítás célja' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const emberek = szemelyLista(persons, 4)
      const tobb = emberek.length > 1
      const cel = ertek(kezi.cel)

      const mondat = (p: PersonCertData): string => {
        const nev = ertek(p.teljesNev)
        const szul = datumErtek(nyelv, p.szuletesiDatum)
        const anyja = ertek(p.anyjaNeve)
        if (nyelv === 'ro') {
          return `<b>${nev}</b> (${roNascut(p.nem)} la data de ${szul}, numele mamei: ${anyja}) figurează în evidențele noastre ca membru înregistrat al parohiei.`
        }
        if (nyelv === 'en') {
          return `<b>${nev}</b> (born on ${szul}, mother's name: ${anyja}) is, according to our records, a registered member of our parish.`
        }
        return `<b>${nev}</b> (szül.: ${szul}, anyja neve: ${anyja}) egyházközségünk nyilvántartott tagja.`
      }

      const bekezdesek = [
        bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${mondat(emberek[0])}`),
        ...emberek.slice(1).map((p) => bek(mondat(p))),
        bek(celZaro(nyelv, tobb, cel)),
      ]
      return torzs(bekezdesek)
    },
  },

  // ── 5) Temetési igazolás (1 személy) ───────────────────────────────
  {
    id: 'temetesi_igazolas',
    nev: 'Temetési igazolás',
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
        fo = `${roDefunct(p.nem)} <b>${nev}</b> (${roNascut(p.nem)} la data de ${szul}, ${roFiu(p.nem)} lui ${ertek(p.apjaNeve)} și ${roAlA(p.nem)} ${ertek(p.anyjaNeve)}) a decedat la data de ${elh} și a fost ${roInmormantat(p.nem)} la data de ${tem}, după ritualul Bisericii Reformate.`
        zaro = 'Prezenta adeverință se eliberează la cererea familiei, pentru a-i servi la cele legale.'
      } else if (nyelv === 'en') {
        fo = `the late <b>${nev}</b> (born on ${szul}, child of ${ertek(p.apjaNeve)} and ${ertek(p.anyjaNeve)}) died on ${elh} and was buried according to the rites of the Reformed Church on ${tem}.`
        zaro = 'This certificate has been issued at the request of the family, for official use.'
      } else {
        fo = `néhai <b>${nev}</b> (szül.: ${szul}, ${ertek(p.apjaNeve)} és ${ertek(p.anyjaNeve)} gyermeke) ${elh} napján elhunyt, és ${tem} napján a református egyház szertartása szerint eltemettük.`
        zaro = 'Jelen igazolást a hozzátartozók kérésére, hivatalos felhasználásra állítottuk ki.'
      }

      return torzs([bek(`${tanusitoIntro(nyelv, gyulekezetNev)} ${fo}`), bek(zaro)])
    },
  },

  // ── 6) Lelkészi ajánlás (1 személy) ────────────────────────────────
  {
    id: 'lelkeszi_ajanlas',
    nev: 'Lelkészi ajánlás',
    tipus: 'level',
    ...UGYKOR_LEVEL,
    maxSzemely: 1,
    keziMezok: [{ key: 'indoklas', label: 'Indoklás (az ajánlás konkrét tartalma)' }],
    buildBody({ persons, nyelv, kezi, gyulekezetNev }) {
      const p = szemelyLista(persons, 1)[0]
      const nev = ertek(p.teljesNev)
      const szul = datumErtek(nyelv, p.szuletesiDatum)
      const indoklas = (kezi.indoklas || '').trim()
      const indoklasHtml = indoklas ? escapeHtml(indoklas) : KITOLTO_HOSSZU

      if (nyelv === 'ro') {
        return torzs([
          bek(
            `Subsemnatul, preot paroh ${roParohiaGen(gyulekezetNev)}, recomand prin prezenta pe <b>${nev}</b> (${roNascut(p.nem)} la data de ${szul}), membru înregistrat al parohiei noastre, care ia parte activă la viața comunității noastre.`,
          ),
          bek(indoklasHtml),
          bek(
            `${roIlO(p.nem)} recomand cu toată încrederea și vă rog respectuos să îi acordați sprijinul dumneavoastră.`,
          ),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          bek(
            `I, the undersigned, ${enMinisterOf(gyulekezetNev)}, hereby recommend <b>${nev}</b> (born on ${szul}), a registered member of our parish who takes an active part in the life of our congregation.`,
          ),
          bek(indoklasHtml),
          bek('I recommend them warmly and kindly ask for your support.'),
        ])
      }
      const nevelo = huNevelo(gyulekezetNev) === 'Az' ? 'az' : 'a'
      return torzs([
        bek(
          `Alulírott, ${nevelo} <b>${escapeHtml(gyulekezetNev.trim())}</b> lelkipásztora, ezúton ajánlom <b>${nev}</b> (szül.: ${szul}) egyháztagunkat, aki egyházközségünk nyilvántartott, gyülekezeti életünkben részt vevő tagja.`,
        ),
        bek(indoklasHtml),
        bek('Nevezettet jó szívvel ajánlom, kérem szíves támogatásukat.'),
      ])
    },
  },

  // ── 7) Egyháztag átadása másik egyházközségnek (1 személy) ─────────
  {
    id: 'egyhaztag_atadas',
    nev: 'Egyháztag átadása másik egyházközségnek',
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
            `${roOficiu(gyulekezetNev)} adeverește, pe baza înregistrărilor din registrele parohiale, că <b>${nev}</b> (${roNascut(p.nem)} la data de ${szul}, numele mamei: ${anyja}) a figurat în evidențele parohiei noastre ca membru înregistrat.`,
          ),
          bek(
            `La cererea sa, respectiv ca urmare a schimbării domiciliului, ${p.nem === 'no' ? 'o' : p.nem === 'ferfi' ? 'îl' : 'îl/o'} predăm prin prezenta parohiei <b>${celGyul}</b>, cu rugămintea respectuoasă de a fi ${p.nem === 'no' ? 'luată' : p.nem === 'ferfi' ? 'luat' : 'luat(ă)'} în evidență.`,
          ),
          bek(
            `Conform registrelor noastre parohiale, a primit sacramentul botezului la data de ${ker} și a depus mărturia de confirmare la data de ${konf}.`,
          ),
          bek(
            'Prezenta adeverință se eliberează la solicitarea parohiei de destinație, pentru uz oficial; datele menționate corespund întocmai înregistrărilor din registrele noastre.',
          ),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          bek(
            `${enOffice(gyulekezetNev)} certifies, on the basis of the entries in its parish registers, that <b>${nev}</b> (born on ${szul}, mother's name: ${anyja}) was a registered member of our parish.`,
          ),
          bek(
            `At their request, and on account of their change of residence, we hereby transfer the above-named person to <b>${celGyul}</b>, respectfully asking that they be entered in its records.`,
          ),
          bek(
            `According to our registers, they received the sacrament of baptism on ${ker} and made their confirmation vow on ${konf}.`,
          ),
          bek(
            'This certificate has been issued at the request of the receiving parish for official use; the above particulars are in full conformity with the entries in our registers.',
          ),
        ])
      }
      return torzs([
        bek(
          `${huHivatal(gyulekezetNev)} egyházközségünk hivatalos anyakönyveinek bejegyzései alapján igazolja, hogy <b>${nev}</b> (született: ${szul}, anyja neve: ${anyja}) egyházközségünk nyilvántartott tagja volt.`,
        ),
        bek(
          `Nevezettet — kérésére, illetve elköltözése okán — ezennel átadjuk a(z) <b>${celGyul}</b> részére, és tisztelettel kérjük szíves nyilvántartásba vételét.`,
        ),
        bek(
          `Anyakönyveink szerint a keresztség sákramentumában ${ker} napján részesült, konfirmációi fogadalmat ${konf} napján tett.`,
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
          sorBek('Stimate Doamne / Stimați Domni,'),
          ...szovegBekezdesek,
          sorBek('Cu deosebită considerație,'),
        ])
      }
      if (nyelv === 'en') {
        return torzs([
          sorBek(`To: ${cimzett}`),
          sorBek('Dear Sir or Madam,'),
          ...szovegBekezdesek,
          sorBek('Yours faithfully,'),
        ])
      }
      return torzs([
        sorBek(`Címzett: ${cimzett}`),
        sorBek('Tisztelt Cím!'),
        ...szovegBekezdesek,
        sorBek('Tisztelettel:'),
      ])
    },
  },
]

/** Család keresése id szerint (a kiállító választójához). */
export function getDokumentumCsalad(id: string): DokumentumCsalad | null {
  return DOKUMENTUM_CSALADOK.find((cs) => cs.id === id) || null
}
