/**
 * Iktató F8b (B2) — CIEC-mintájú, HÁROMNYELVŰ (hu/ro/en) életút-/családi
 * igazolás nyomtatvány-generátor.
 *
 * F8c (2026-07-25): nyelv-mód (nyelvMod: 'hu' | 'ro' | 'en' | 'harom',
 * default 'harom' — visszafelé kompatibilis). Egynyelvű módban a
 * mezőfeliratok/címek/záradékok/keret-címkék CSAK az adott nyelven jelennek
 * meg (a 3-nyelvű blokkok adott nyelvi sora), a levélfej is a mód nyelvét
 * követi; a nyelvi záradék csak 'harom' módban kerül a nyomtatványra.
 *
 * A szerkezet, a formulák és a kötelező/opcionális elemek forrása a kutatási
 * tervdoc: docs/project-tracking/KARTOTEKA-eletutigazolas-kutatas-2026-07-25.md
 *  - cím-blokk: IGAZOLÁS / ADEVERINȚĂ — extras din registrele parohiale… /
 *    CERTIFICATE — Extract from the Parish Registers…;
 *  - tanúsító nyitómondat mindhárom nyelven, a gyülekezet-név behelyettesítve;
 *  - CIEC 16. egyezmény szerinti SZÁMOZOTT MEZŐS táblázat — minden mezőfelirat
 *    3 nyelven egymás alatt (kisebb betűvel), az érték egyszer;
 *  - anyakönyvi hivatkozás minden eseménynél (egyhazi_szam → kötet/folyószám/év);
 *  - záradékok (forrás + cél + nyelvi) a tervdoc formuláival szó szerint;
 *  - 1895. október 1. előtti bejegyzésnél automatikus közokirati megjegyzés
 *    (a bejegyzés-dátumokból felismerve — 1894. évi XXXIII. tc.);
 *  - keltezés + KÉT aláírás (lelkipásztor + főgondnok), középen „P.H. / L.S.".
 *
 * Az adat a B1-kontraktusból jön (eletut-types.ts: EletutIgazolasData —
 * adat + hianyok + kerelmezo + cel); a hiányzó értékek rovata kitöltő-vonal.
 * A buildEletutTodoHtml a hiány-listát (EletutHiany[]) nyomtatható A4
 * ellenőrző-listává alakítja (mit kell megkeresni + hova kell bevezetni).
 *
 * WYSIWYG-elv: az előnézet, a PDF és a nyomtatás UGYANAZT a HTML-t kapja
 * (@page margin 0 + a lap-margót a .page padding adja). A body
 * `data-sheet-count` attribútuma a print-engine-v2 csonka-PDF-őréhez kell —
 * ezt a közös burok (dokumentum-stilus.ts) írja ki.
 * Tisztán pure modul (nincs DOM-hivatkozás) — a hívó iframe/srcdoc-ba tölti.
 *
 * F8e (2026-07-25) — user teszt-észrevételek nyomán:
 *  - A4-TIPOGRÁFIA: a lap a KÖZÖS kanonikus profilra állt át
 *    (lib/iktato/dokumentum-stilus.ts — dokumentumBurok/dokumentumStilus),
 *    amely a kutatási jelentés paramétereit követi
 *    (docs/project-tracking/KARTOTEKA-a4-tipografia-elonezet-kutatas-2026-07-25.md):
 *    25mm bal lefűző-margó / 20mm jobb / 20mm fent / 18mm lent, Times-lánc,
 *    1.45 sorköz, BALRA ZÁRT szöveg `hyphens: auto`-val (a sorkizárás
 *    elválasztás nélkül volt a csúnya tördelés gyökere — és a html2canvas
 *    justify-word-spacing hibáját is elkerüljük), flex-oszlop + `margin-top:
 *    auto` az aláírás-sávon (az aláírás a szövegtükör aljára ül).
 *    Az űrlap-specifikus stílus `extraCss`-ként megy (a sűrű CIEC-táblázat
 *    10.5pt-os alap-betűvel fér el jól).
 *  - KELTEZÉS-HELYSÉG: a keltezés a gyülekezet ANYAKÖNYVI helységnevét kapja a
 *    dokumentum nyelvén (header.helysegHu / helysegRo) — a hívó `helyseg`
 *    paramétere csak tartalék, mert az a szabad szöveges cím-mezőből is jöhet
 *    (élesben így jelent meg magyar nyomtatványon a román „Brateș").
 *  - A keltezés-sor a KÉT ALÁÍRÁSSAL EGY blokkban van (nem törik szét), így a
 *    település neve mindig ott áll az aláírások fölött.
 */

import type { CongregationHeaderData } from './certificate-types'
import { buildLetterheadHtml } from './letterheads'
import { keltezesSor } from './dokumentum-csaladok'
import { dokumentumBurok } from './dokumentum-stilus'
import type { EletutHazassag, EletutHiany, EletutIgazolasData } from './eletut-types'

// ─────────────────────────────────────────────────────────────────
// Publikus típus — a hívó (kiállító dialógus, B3) opciói
// ─────────────────────────────────────────────────────────────────

/**
 * A nyomtatvány nyelv-módja (F8c): 'harom' = a hagyományos háromnyelvű
 * (hu+ro+en) nyomtatvány; 'hu' / 'ro' / 'en' = egynyelvű változat, ahol a
 * mezőfeliratok, címek és záradékok CSAK az adott nyelven jelennek meg
 * (a meglévő 3-nyelvű blokkok adott nyelvi sora). A nyelvi záradék
 * („eltérés esetén a román szöveg irányadó") csak 'harom' módban értelmes.
 */
export type EletutNyelvMod = 'hu' | 'ro' | 'en' | 'harom'

export interface EletutIgazolasHtmlOptions {
  /** A B1 adatgyűjtő (eletut-actions) által összeállított igazolás-adatcsomag. */
  data: EletutIgazolasData
  /** A gyülekezet hivatalos fejléc-adatai (getCongregationHeader). */
  header: CongregationHeaderData
  /** A kiosztott iktatószám — null esetén kitöltő-vonal kerül a helyére. */
  iratszam: string | null
  /**
   * Keltezés helye — TARTALÉK érték. Elsődlegesen a `header.helysegHu` /
   * `header.helysegRo` (a gyülekezet anyakönyvi helysége a dokumentum nyelvén)
   * kerül a nyomtatványra; ez a mező csak akkor jut szerephez, ha a fejléc-
   * adatban nincs helység. (F8e: a hívó eddig a szabad szöveges cím-mezőt adta
   * át, ezért jelent meg magyar nyomtatványon a román helységnév.)
   */
  helyseg: string
  /**
   * Keltezés dátuma — ISO (YYYY-MM-DD) VAGY megjelenítésre kész magyar szöveg
   * („2026. július 25."). Mindkettőt felismerjük, és a nyelv-mód szerinti
   * formára hozzuk („la 25 iulie 2026" / „July 25, 2026"); ismeretlen formátum
   * változatlanul kerül a lapra.
   */
  datum: string
  /** A kiállító lelkipásztor neve (aláírás-blokk + nyitómondat). */
  lelkipasztor: string
  /** A főgondnok neve — üresen a vonal kézi aláírásra marad. */
  fogondnok?: string | null
  /** Nyelv-mód — alapértelmezés: 'harom' (visszafelé kompatibilis). */
  nyelvMod?: EletutNyelvMod
}

// ─────────────────────────────────────────────────────────────────
// Általános segédek
// ─────────────────────────────────────────────────────────────────

/** HTML-escape MINDEN dinamikus értékre (XSS + törött markup ellen). */
function esc(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Nullable szöveg trimmelve — null/undefined → ''. */
function txt(v: string | null | undefined): string {
  return (v || '').trim()
}

/** ISO dátum (YYYY-MM-DD…) → „YYYY. MM. DD." — más formátum változatlanul. */
function fmtDatum(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : v
}

/** fmtDatum nullable bemenetre — üres/null → ''. */
function fmtDatumHa(v: string | null | undefined): string {
  const t = txt(v)
  return t ? fmtDatum(t) : ''
}

/** Magyar hónapnevek — a „2026. július 25." alakú keltezés visszafejtéséhez. */
const HU_HONAPOK = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

/**
 * A keltezés dátumának ISO-alakja (YYYY-MM-DD), ha felismerhető.
 * Elfogadja az ISO formát ÉS a magyar hosszú alakot („2026. július 25."),
 * mert a hívó jelenleg megjelenítésre kész magyar szöveget ad át — enélkül a
 * román/angol nyomtatványra magyar hónapnév kerülne. Ismeretlen formátumnál
 * null (ilyenkor a nyers szöveg megy a lapra, változtatás nélkül).
 */
function isoDatum(v: string): string | null {
  const t = txt(v)
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const hu = t.match(/^(\d{4})\.\s*([^\s.]+)\.?\s*(\d{1,2})\.?$/)
  if (hu) {
    const honapIdx = HU_HONAPOK.indexOf(hu[2].toLowerCase())
    if (honapIdx >= 0) {
      const ho = String(honapIdx + 1).padStart(2, '0')
      const nap = String(Number(hu[3])).padStart(2, '0')
      return `${hu[1]}-${ho}-${nap}`
    }
  }
  return null
}

/** Kitöltő-vonal (üres rovathoz — kézzel pótolható a nyomtatványon). */
function kitolto(szelesMm = 45): string {
  return `<span class="kitolto" style="min-width:${szelesMm}mm"></span>`
}

/** Érték-HTML: escapelt szöveg, üresnél kitöltő-vonal. */
function ertekVagyVonal(v: string, vonalMm = 45): string {
  const t = (v || '').trim()
  return t ? esc(t) : kitolto(vonalMm)
}

/** „a" / „az" névelő kisbetűvel, mondat közben (magánhangzó → „az"). */
function nevelo(nev: string): string {
  const elso = (nev.trim().charAt(0) || '').toLowerCase()
  return 'aáeéiíoóöőuúüű'.includes(elso) ? 'az' : 'a'
}

// ─────────────────────────────────────────────────────────────────
// Nyelv-módos építőkövek ('harom' = mindhárom nyelv; különben egynyelvű)
// ─────────────────────────────────────────────────────────────────

/** Az adott nyelvű változat kiválasztása ('harom' módban a hívó nem ezt használja). */
function valaszt(mod: EletutNyelvMod, hu: string, ro: string, en: string): string {
  return mod === 'ro' ? ro : mod === 'en' ? en : hu
}

/** Mező-felirat blokk: 'harom' = 3 sor (HU vastag, RO/EN dőlt); egynyelvű = 1 vastag sor. */
function cimke(mod: EletutNyelvMod, hu: string, ro: string, en: string): string {
  if (mod === 'harom') {
    return `<div class="cimke"><span class="hu">${hu}</span><br /><span class="ro">${ro}</span><br /><span class="en">${en}</span></div>`
  }
  return `<div class="cimke"><span class="solo">${valaszt(mod, hu, ro, en)}</span></div>`
}

/** Egy számozott CIEC-mező sor: sorszám + felirat(ok) + érték. */
function mezoSor(mod: EletutNyelvMod, szam: number, hu: string, ro: string, en: string, ertekHtml: string): string {
  return `<tr class="mezo"><td class="szam">${szam}.</td><td>${cimke(mod, hu, ro, en)}<div class="mezo-ertek">${ertekHtml}</div></td></tr>`
}

/** Szakasz-fejléc sor (A/B/C/D) — kiemelt háttérrel; 'harom' módban 3 nyelv egy sorban. */
function szakaszSor(mod: EletutNyelvMod, hu: string, ro: string, en: string): string {
  const cim = mod === 'harom' ? [hu, ro, en].join(' &middot; ') : valaszt(mod, hu, ro, en)
  return `<tr class="szakasz"><td colspan="2">${cim}</td></tr>`
}

/** Záradék-blokk: 'harom' = 3 bekezdés (HU normál + RO/EN dőlt); egynyelvű = 1 normál. */
function zaradek(mod: EletutNyelvMod, hu: string, ro: string, en: string): string {
  if (mod === 'harom') {
    return `<div class="zaradek"><p class="hu">${hu}</p><p class="ro">${ro}</p><p class="en">${en}</p></div>`
  }
  return `<div class="zaradek"><p>${valaszt(mod, hu, ro, en)}</p></div>`
}

/**
 * A gyülekezet neve a nyitómondat adott nyelvű formulájába illesztve.
 * RO: ha a név „Parohia Reformată …" alakú, a tervdoc szerinti birtokos
 * szerkezet („al Parohiei Reformate …") épül; különben nyelvtanilag helyes
 * „la {név}" (alanyesettel). EN: „Minister of the Reformed Parish of …" ha a
 * név ilyen alakú, különben „Minister of {név}".
 */
function roParohia(nevRo: string): string {
  const m = nevRo.match(/^parohia\s+reformat[aă]\s+(.+)$/i)
  return m ? `al Parohiei Reformate <b>${esc(m[1])}</b>` : `la <b>${esc(nevRo)}</b>`
}

function enParish(nevEn: string): string {
  const m = nevEn.match(/^(?:the\s+)?reformed\s+parish\s+of\s+(.+)$/i)
  return m
    ? `Minister of the Reformed Parish of <b>${esc(m[1])}</b>`
    : `Minister of <b>${esc(nevEn)}</b>`
}

// ─────────────────────────────────────────────────────────────────
// Közös lap-stílus — az E1-kontraktus kanonikus A4-profilja
// ─────────────────────────────────────────────────────────────────
//
// A lap geometriája, tipográfiája és a flex-oszlopos (fej · törzs · aláírás)
// szerkezete a KÖZÖS modulból jön (lib/iktato/dokumentum-stilus.ts), amely a
// kutatási jelentés paramétereit önti kódba (25mm bal lefűző-margó / 20mm jobb
// / 20mm fent / 18mm lent, Times-lánc, 1.45 sorköz, BALRA ZÁRT + hyphens:auto
// + kötelező `lang`, `.page__sign { margin-top: auto }`). Így az életút-
// igazolás pixelre ugyanúgy néz ki, mint a többi hivatalos irat.
//
// Az alábbi kiegészítő CSS CSAK a CIEC-mezős űrlap sajátja (a burok az
// `extraCss`-t a stíluslap VÉGÉRE fűzi, így ezek felülírják az alapot):
// az űrlap sűrű táblázat, ezért 10.5pt alap betűméret a folyószöveg-iratok
// 12pt-ja helyett — a margók, a sorköz, az igazítás és az elválasztás
// változatlanul a kanonikus profilé.

// ─────────────────────────────────────────────────────────────────
// 1) Az igazolás-nyomtatvány
// ─────────────────────────────────────────────────────────────────

/** Csak a CIEC-űrlap saját stílusa — a kanonikus profil VÉGÉRE fűzve. */
const IGAZOLAS_EXTRA_CSS = `
    /* A sűrű, mezős űrlap kisebb alap-betűvel fér el jól az A4-tükörben. */
    .page { font-size: 10.5pt; color: #111827; }
    /* A Szám-sor közvetlenül a levélfej alatt, szűkebb térközzel. */
    .page__meta { margin: 4mm 0 3mm; }
    /* Az aláírás-blokk fölött a kanonikus 18mm-t a keltezés-sorral együtt adjuk ki. */
    .page__sign { padding-top: 8mm; }

    /* Kis 3-nyelvű egyház-lánc sor közvetlenül a levélfej alatt. A levélfej
       saját 24px alsó margóval jön (letterheads.ts), azt húzzuk vissza. */
    .egyhaz-lanc { text-align: center; font-size: 8.5pt; line-height: 1.3; letter-spacing: .02em; margin: -4mm 0 0; }

    .cim-blokk { text-align: center; margin: 0 0 4mm; page-break-after: avoid; break-after: avoid; }
    .cim-blokk .fo { font-size: 16pt; font-weight: bold; letter-spacing: .12em; line-height: 1.2; }
    .cim-blokk .masodik { font-size: 12pt; font-weight: bold; letter-spacing: .08em; line-height: 1.2; margin-top: 1.4mm; }
    .cim-blokk .alcim { font-size: 9.5pt; line-height: 1.3; margin-top: .6mm; }

    /* Balra zárt + elválasztás (a sorkizárás helyett) — lásd dokumentum-stilus. */
    .page .nyito p { margin: 0 0 2.2mm; }
    .nyito .ro, .nyito .en { font-size: 9.5pt; font-style: italic; color: #1f2937; }

    /* table-layout: fixed — a hosszú értékek nem tolják szét a tükröt. */
    table.mezok { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 3mm 0 4mm; }
    table.mezok td { border: 0.6pt solid #334155; padding: 1.4mm 2mm; vertical-align: top; }
    table.mezok tr { page-break-inside: avoid; break-inside: avoid; }
    table.mezok .oszlop-szam { width: 9mm; }
    td.szam { text-align: right; font-size: 9pt; color: #334155; }
    tr.szakasz td { background: #f1f5f9; font-weight: bold; font-size: 9.5pt; letter-spacing: .04em; padding: 1.8mm 2mm; }
    /* Szakasz-fejléc ne maradjon a lap alján, a sorai nélkül. */
    tr.szakasz { page-break-after: avoid; break-after: avoid; }
    /* A mező-feliratok 3 nyelven, 9pt-tal (HU vastag, RO/EN dőlt) — az érték egyszer. */
    .cimke { font-size: 9pt; line-height: 1.3; }
    .cimke .hu { font-weight: bold; }
    .cimke .ro, .cimke .en { font-style: italic; color: #374151; }
    /* Egynyelvű mód (F8c): az egyetlen felirat-sor vastag, nyelvtől függetlenül. */
    .cimke .solo { font-weight: bold; }
    .mezo-ertek { font-size: 10.5pt; font-weight: 600; line-height: 1.35; margin-top: 1mm; overflow-wrap: anywhere; }

    table.gyermekek { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 1.4mm; }
    table.gyermekek th, table.gyermekek td { border: 0.5pt solid #64748b; padding: 1mm 1.5mm; font-size: 9.5pt; line-height: 1.3; text-align: left; vertical-align: top; }
    table.gyermekek th { font-size: 8.5pt; background: #f8fafc; }
    table.gyermekek th .ro, table.gyermekek th .en { display: block; font-weight: normal; font-style: italic; font-size: 7.5pt; color: #374151; }
    table.gyermekek .oszlop-nev { width: 40%; }
    table.gyermekek .oszlop-datum { width: 20%; }

    .zaradekok { margin-top: 3mm; }
    .zaradek { margin: 0 0 2.4mm; page-break-inside: avoid; break-inside: avoid; }
    .page .zaradek p { margin: 0 0 .8mm; font-size: 9.5pt; line-height: 1.4; }
    .zaradek .ro, .zaradek .en { font-size: 8.8pt; font-style: italic; color: #1f2937; }

    /* Kitöltő-vonal az üres rovatokhoz (kézzel pótolható a nyomtatványon). */
    .kitolto { display: inline-block; max-width: 100%; border-bottom: 0.5pt dotted #111827; height: 3mm; vertical-align: baseline; }

    /* Keltezés: jobbra zárva, közvetlenül az aláírások fölött (egy blokkban) —
       a település neve így MINDIG ott áll az aláírás-blokkban. */
    .kelt { text-align: right; margin: 0 0 2mm; }
    .alairasok { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 12mm; page-break-inside: avoid; break-inside: avoid; }
    .alairas { width: 58mm; text-align: center; }
    .alairas .vonal { border-bottom: 0.6pt solid #111827; height: 9mm; margin-bottom: 1.5mm; }
    .alairas .nev { font-weight: bold; min-height: 4.5mm; line-height: 1.25; }
    .alairas .szerep { font-size: 8.5pt; line-height: 1.25; }
    .pecset { width: 26mm; height: 26mm; border: 0.6pt dashed #64748b; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8.5pt; color: #334155; flex: 0 0 auto; align-self: center; }`

/** 1895. október 1. — Erdélyben eddig a felekezeti anyakönyv volt a hivatalos. */
const ALLAMI_ANYAKONYV_KEZDETE = '1895-10-01'

/**
 * Van-e 1895. október 1. előtti (ISO-dátumú) bejegyzés az adatban?
 * A kutatási jelentés 5. pontja szerint ilyenkor külön közokirati megjegyzés
 * kerül a záradékok közé (1894. évi XXXIII. tc.). ISO-formátumú dátumokra a
 * szöveges összehasonlítás időrendi — nem ISO szöveg (pl. körülírás) kimarad.
 */
function van1895ElottiBejegyzes(data: EletutIgazolasData): boolean {
  const a = data.adat
  const datumok: Array<string | null> = [
    a.szemely.szuletesiDatum,
    a.kereszteles?.datum ?? null,
    a.konfirmacio?.datum ?? null,
    ...a.hazassagok.map((h) => h.datum),
    a.elhalalozas?.halalDatum ?? null,
    a.elhalalozas?.temetesDatum ?? null,
  ]
  return datumok.some((d) => {
    const t = txt(d)
    return /^\d{4}-\d{2}-\d{2}/.test(t) && t < ALLAMI_ANYAKONYV_KEZDETE
  })
}

/**
 * A teljes, A4 álló, háromnyelvű életút-igazolás HTML-dokumentuma.
 * Az előnézet, a PDF és a nyomtatás ugyanezt a stringet kapja (WYSIWYG).
 */
export function buildEletutIgazolasHtml(opts: EletutIgazolasHtmlOptions): string {
  const { data, header, iratszam, helyseg, datum, lelkipasztor } = opts
  // F8c: nyelv-mód — alapértelmezés 'harom' (visszafelé kompatibilis).
  const mod: EletutNyelvMod = opts.nyelvMod || 'harom'
  const fogondnok = txt(opts.fogondnok)
  const adat = data.adat
  const szemely = adat.szemely
  const kerelmezo = txt(data.kerelmezo)
  const cel = txt(data.cel)

  // A gyülekezet neve nyelvenként (hiányzó fordításnál a hivatalos név).
  const hivatalos = txt(header.hivatalosNev)
  const nevHu = txt(header.nevHu) || hivatalos
  const nevRo = txt(header.nevRo) || hivatalos
  const nevEn = txt(header.nevEn) || hivatalos

  // ── (1) Fejléc: levélfej a dokumentum nyelvén + egyház-lánc sor ──
  // 'harom' módban magyar levélfej (hagyomány); egynyelvűben a mód nyelve.
  const fejlec = buildLetterheadHtml(mod === 'harom' ? 'hu' : mod, header)
  const egyhazLancSzoveg =
    mod === 'harom'
      ? 'Romániai Református Egyház &middot; Biserica Reformată din România &middot; Reformed Church in Romania — cult recunoscut conform Legii nr. 489/2006'
      : valaszt(
          mod,
          'Romániai Református Egyház',
          'Biserica Reformată din România — cult recunoscut conform Legii nr. 489/2006',
          'Reformed Church in Romania',
        )
  const egyhazLanc = `<div class="egyhaz-lanc">${egyhazLancSzoveg}</div>`

  // ── (2) Iktatószám-sor + cím-blokk (tervdoc 2. pont) ──
  // A Szám-sor a burok fejléc-sávjába kerül (.page__meta > .doc-szam).
  const szamCimke = mod === 'harom' ? 'Szám / Nr. / No.' : valaszt(mod, 'Szám', 'Nr.', 'No.')
  const szamSor = `${szamCimke}: <b>${ertekVagyVonal(txt(iratszam), 30)}</b>`
  const cimHu = `<div class="fo">IGAZOLÁS</div>
    <div class="alcim">kivonat az egyházközségi anyakönyvekből</div>`
  const cimRo = (fo: boolean) => `<div class="${fo ? 'fo' : 'masodik'}">ADEVERINȚĂ</div>
    <div class="alcim">— extras din registrele parohiale (matricolele bisericești) —</div>`
  const cimEn = (fo: boolean) => `<div class="${fo ? 'fo' : 'masodik'}">CERTIFICATE</div>
    <div class="alcim">— Extract from the Parish Registers —</div>`
  const cimBlokk = `<div class="cim-blokk">
    ${
      mod === 'harom'
        ? `${cimHu}
    ${cimRo(false)}
    ${cimEn(false)}`
        : valaszt(mod, cimHu, cimRo(true), cimEn(true))
    }
  </div>`

  // ── (3) Tanúsító nyitómondat (tervdoc-formulák; egynyelvűben csak a mód nyelve) ──
  const lelkeszHtml = `<b>${esc(lelkipasztor)}</b>`
  const nyitoHu = `Alulírott ${lelkeszHtml}, ${nevelo(nevHu)} <b>${esc(nevHu)}</b> lelkipásztora, egyházközségünk hivatalos anyakönyveinek bejegyzései alapján igazolom, hogy az alábbi, számozott rovatokban foglalt adatok az anyakönyvi bejegyzésekkel mindenben megegyeznek:`
  const nyitoRo = `Subsemnatul ${lelkeszHtml}, preot paroh (pastor) ${roParohia(nevRo)}, adeveresc prin prezenta, în conformitate cu înregistrările din registrele parohiale (matricolele bisericești) păstrate la oficiul parohial, că datele înscrise în rubricile numerotate de mai jos corespund întocmai înregistrărilor:`
  const nyitoEn = `I, the undersigned ${lelkeszHtml}, ${enParish(nevEn)}, do hereby certify from the records (parish registers) of this parish that the particulars entered in the numbered fields below are in full conformity with the said records:`
  const nyito =
    mod === 'harom'
      ? `<div class="nyito">
    <p class="hu">${nyitoHu}</p>
    <p class="ro">${nyitoRo}</p>
    <p class="en">${nyitoEn}</p>
  </div>`
      : `<div class="nyito">
    <p>${valaszt(mod, nyitoHu, nyitoRo, nyitoEn)}</p>
  </div>`

  // ── (4) CIEC-stílusú számozott mezős táblázat ──
  let sorszam = 0
  const sorok: string[] = []
  const mezo = (hu: string, ro: string, en: string, ertekHtml: string) => {
    sorszam += 1
    sorok.push(mezoSor(mod, sorszam, hu, ro, en, ertekHtml))
  }

  // A) Személy
  sorok.push(szakaszSor(mod, 'A) A SZEMÉLY', 'A) PERSOANA', 'A) THE PERSON'))
  mezo(
    'Családi és utóneve',
    'Numele și prenumele',
    'Surname and given name(s)',
    ertekVagyVonal(txt(szemely.teljesNev), 60),
  )
  mezo(
    'Születési (leánykori) neve',
    'Numele purtat la naștere',
    'Name at birth',
    ertekVagyVonal(txt(szemely.szuletesiNev), 60),
  )
  mezo(
    'Születési helye és ideje',
    'Locul și data nașterii',
    'Place and date of birth',
    ertekVagyVonal(
      [txt(szemely.szuletesiHely), fmtDatumHa(szemely.szuletesiDatum)].filter(Boolean).join(', '),
      60,
    ),
  )
  mezo('Apja neve', 'Numele tatălui', "Father's name", ertekVagyVonal(txt(szemely.apjaNeve), 60))
  mezo(
    'Anyja születési neve',
    'Numele mamei (numele la naștere)',
    "Mother's maiden name",
    ertekVagyVonal(txt(szemely.anyjaNeve), 60),
  )
  // Vallás — csak kitöltött értékkel kap rovatot (a kötelező-listán kívüli elem).
  const vallas = txt(szemely.vallas)
  if (vallas) {
    mezo('Vallása', 'Religia', 'Religion', esc(vallas))
  }

  // B) Egyházi életút — anyakönyvi hivatkozásokkal (egyhazi_szam)
  sorok.push(
    szakaszSor(
      mod,
      'B) EGYHÁZI ÉLETÚT — AZ EGYHÁZKÖZSÉGI ANYAKÖNYVEK SZERINT',
      'B) PARCURSUL ÎN VIAȚA BISERICII — CONFORM REGISTRELOR PAROHIALE',
      'B) RECORD OF CHURCH LIFE — ACCORDING TO THE PARISH REGISTERS',
    ),
  )
  const kereszteles = adat.kereszteles
  mezo(
    'Keresztelése (dátum és hely)',
    'Botezul (data și locul)',
    'Baptism (date and place)',
    ertekVagyVonal(
      [fmtDatumHa(kereszteles?.datum), txt(kereszteles?.hely)].filter(Boolean).join(', '),
      60,
    ),
  )
  mezo(
    'Keresztelő lelkész',
    'Preotul care a oficiat botezul',
    'Minister who administered baptism',
    ertekVagyVonal(txt(kereszteles?.lelkesz), 60),
  )
  // Keresztszülők — a tervdoc szerint opcionális, „óvatosan" kiadható adat:
  // csak akkor kap rovatot, ha az anyakönyvben ténylegesen szerepel.
  const keresztszulok = txt(kereszteles?.keresztszulok)
  if (keresztszulok) {
    mezo('Keresztszülők', 'Nașii de botez', 'Godparents', esc(keresztszulok))
  }
  mezo(
    'Keresztelési bejegyzés (kötet / folyószám / év)',
    'Înregistrat în Registrul de botezați al parohiei (vol. / nr. / anul)',
    'As recorded in the Register of Baptisms (vol. / entry no. / year)',
    ertekVagyVonal(txt(kereszteles?.anyakonyviSzam), 45),
  )
  mezo(
    'Konfirmációja (dátum)',
    'Confirmarea (data)',
    'Confirmation (date)',
    ertekVagyVonal(fmtDatumHa(adat.konfirmacio?.datum), 45),
  )
  mezo(
    'Konfirmációi bejegyzés (kötet / folyószám / év)',
    'Înregistrat în Registrul de confirmați (vol. / nr. / anul)',
    'As recorded in the Register of Confirmations (vol. / entry no. / year)',
    ertekVagyVonal(txt(adat.konfirmacio?.anyakonyviSzam), 45),
  )
  // Egyházi házasságkötés(ek) — a kontraktus tömböt ad (dátum szerint növekvő);
  // üres tömbnél EGY kitöltő-vonalas blokk (kötelező elem a nyomtatványon).
  const hazassagok: Array<EletutHazassag | null> = adat.hazassagok.length > 0 ? adat.hazassagok : [null]
  const tobbHazassag = hazassagok.length > 1
  hazassagok.forEach((h, i) => {
    // Több házasságnál sorszámozott felirat-utótag: „ (1.)" / „ (2.)" …
    const utotag = tobbHazassag ? ` (${i + 1}.)` : ''
    const utotagRoEn = tobbHazassag ? ` (${i + 1})` : ''
    mezo(
      `Egyházi házasságkötése — házastársa neve${utotag}`,
      `Cununia religioasă — numele soțului/soției${utotagRoEn}`,
      `Church marriage — name of spouse${utotagRoEn}`,
      ertekVagyVonal(txt(h?.hazastarsNev), 60),
    )
    mezo(
      `Házasságkötés dátuma${utotag}`,
      `Data cununiei${utotagRoEn}`,
      `Date of marriage${utotagRoEn}`,
      ertekVagyVonal(fmtDatumHa(h?.datum), 45),
    )
    // Tanúk — mint a keresztszülők: opcionális, csak kitöltött értékkel.
    const tanuk = txt(h?.tanuk)
    if (tanuk) {
      mezo(`Tanúk${utotag}`, `Martorii${utotagRoEn}`, `Witnesses${utotagRoEn}`, esc(tanuk))
    }
    mezo(
      `Házassági bejegyzés (kötet / folyószám / év)${utotag}`,
      `Înregistrat în Registrul de cununați (vol. / nr. / anul)${utotagRoEn}`,
      `As recorded in the Register of Marriages (vol. / entry no. / year)${utotagRoEn}`,
      ertekVagyVonal(txt(h?.anyakonyviSzam), 45),
    )
  })

  // C) Gyermekek — táblázatos alblokk (üres listánál kitöltő-vonalas sor)
  sorok.push(szakaszSor(mod, 'C) GYERMEKEI', 'C) COPIII', 'C) CHILDREN'))
  // Oszlop-fejlécek: 'harom' módban 3-nyelvű blokk, egynyelvűben a mód nyelve.
  // Az oszlop-osztályok fix táblázat-elrendezéshez kellenek (table-layout:
  // fixed) — így a hosszú nevek nem tolják szét a szövegtükröt.
  const gyermekTh = (osztaly: string, hu: string, ro: string, en: string): string =>
    mod === 'harom'
      ? `<th class="${osztaly}">${hu}<span class="ro">${ro}</span><span class="en">${en}</span></th>`
      : `<th class="${osztaly}">${valaszt(mod, hu, ro, en)}</th>`
  const gyermekFejlec = `<tr>
    ${gyermekTh('oszlop-nev', 'Név', 'Numele', 'Name')}
    ${gyermekTh('oszlop-datum', 'Születési idő', 'Data nașterii', 'Date of birth')}
    ${gyermekTh('oszlop-datum', 'Keresztelés', 'Botezul (data)', 'Baptism (date)')}
    ${gyermekTh('', 'Anyakönyvi szám', 'Nr. înregistrării', 'Register entry no.')}
  </tr>`
  const gyermekSorok =
    adat.gyermekek.length > 0
      ? adat.gyermekek
          .map(
            (gy) => `<tr>
    <td>${ertekVagyVonal(txt(gy.nev), 30)}</td>
    <td>${ertekVagyVonal(fmtDatumHa(gy.szuletesiDatum), 22)}</td>
    <td>${ertekVagyVonal(fmtDatumHa(gy.keresztelesDatum), 22)}</td>
    <td>${ertekVagyVonal(txt(gy.anyakonyviSzam), 18)}</td>
  </tr>`,
          )
          .join('\n  ')
      : `<tr><td>${kitolto(30)}</td><td>${kitolto(22)}</td><td>${kitolto(22)}</td><td>${kitolto(18)}</td></tr>`
  sorszam += 1
  sorok.push(
    `<tr class="mezo"><td class="szam">${sorszam}.</td><td>${cimke(
      mod,
      'Az anyakönyvekben bejegyzett gyermekei',
      'Copiii înregistrați în registrele parohiale',
      'Children entered in the parish registers',
    )}<table class="gyermekek">${gyermekFejlec}
  ${gyermekSorok}
  </table></td></tr>`,
  )

  // D) Elhalálozás + nyughely — CSAK elhunyt személynél kerül a nyomtatványra.
  const elhalalozas = adat.elhalalozas
  const sirhely = txt(adat.sirhely)
  if (szemely.elhunyt || elhalalozas !== null || sirhely) {
    sorok.push(
      szakaszSor(mod, 'D) ELHALÁLOZÁSA ÉS NYUGHELYE', 'D) DECESUL ȘI LOCUL DE VECI', 'D) DEATH AND RESTING PLACE'),
    )
    mezo(
      'Elhalálozás dátuma',
      'Data decesului',
      'Date of death',
      ertekVagyVonal(fmtDatumHa(elhalalozas?.halalDatum), 45),
    )
    mezo(
      'Temetés dátuma és helye',
      'Data și locul înmormântării',
      'Date and place of burial',
      ertekVagyVonal(
        [fmtDatumHa(elhalalozas?.temetesDatum), txt(elhalalozas?.temetoHely)].filter(Boolean).join(', '),
        60,
      ),
    )
    mezo(
      'Szolgálatot végző lelkész',
      'Preotul care a oficiat înmormântarea',
      'Officiating minister',
      ertekVagyVonal(txt(elhalalozas?.lelkesz), 60),
    )
    mezo(
      'Temetési bejegyzés (kötet / folyószám / év)',
      'Înregistrat în Registrul de decedați (vol. / nr. / anul)',
      'As recorded in the Register of Burials (vol. / entry no. / year)',
      ertekVagyVonal(txt(elhalalozas?.anyakonyviSzam), 45),
    )
    // Nyughely — a RO felirat a tervdoc előírt formulájával; az érték a
    // Sírhelyek modul láncából előállt szöveg (temető, parcella, sor, sírhely).
    mezo(
      'Nyughelye (temető, parcella / sor / sírhelyszám)',
      'Este înmormântat(ă) în cimitirul …, parcela …, locul de veci nr. …',
      'Resting place (cemetery, plot / row / grave no.)',
      ertekVagyVonal(sirhely, 60),
    )
  }

  // A <colgroup> KELL: az első sor egy colspan=2-es szakasz-fejléc, abból a
  // table-layout: fixed nem tudná kiszámolni a sorszám-oszlop szélességét.
  const mezoTabla = `<table class="mezok">
  <colgroup><col class="oszlop-szam" /><col /></colgroup>
  ${sorok.join('\n  ')}
  </table>`

  // ── (5) Záradékok — a tervdoc formulái szó szerint ──
  const forrasZaradek = zaradek(
    mod,
    'Jelen igazolás a felsorolt adatokat az egyházközségi anyakönyvek bejegyzéseivel mindenben megegyezően, közhitelesen tanúsítja.',
    'Prezenta adeverință este întocmită conform registrelor parohiale, datele fiind conforme cu înregistrările originale. Certific exactitatea prezentului extras.',
    'I certify that the above is a true and correct extract from the parish registers kept at this parish office.',
  )
  // Cél-záradék: a kérelmező és a cél behelyettesítve — üresen a tervdoc
  // alap-formulája (bíróság és hatóságok előtti felhasználás).
  const kerelmezoHu = kerelmezo ? `<b>${esc(kerelmezo)}</b>` : 'nevezett / jogosult hozzátartozója'
  const kerelmezoRo = kerelmezo ? `<b>${esc(kerelmezo)}</b>` : 'celui în drept'
  const kerelmezoEn = kerelmezo ? `<b>${esc(kerelmezo)}</b>` : 'the person concerned / an entitled family member'
  const celZaradek = zaradek(
    mod,
    `Jelen igazolást ${kerelmezoHu} kérésére, ${cel ? esc(cel) : 'bíróság és hatóságok előtti felhasználás'} céljából adtam ki.`,
    `Prezenta adeverință s-a eliberat la cererea ${kerelmezoRo}, pentru a-i servi ${cel ? `la ${esc(cel)}` : 'în fața instanțelor judecătorești și a autorităților publice'}.`,
    `This certificate has been issued at the request of ${kerelmezoEn} for ${cel ? esc(cel) : 'submission to courts of law and public authorities'}.`,
  )
  // 1895. október 1. előtti bejegyzésnél közokirati megjegyzés (tervdoc 5. pont).
  const zaradek1895 = van1895ElottiBejegyzes(data)
    ? zaradek(
        mod,
        'Megjegyzés: az 1895. október 1. előtti bejegyzések a korabeli jog (1894. évi XXXIII. tc.) szerint hivatalos állami anyakönyvi bejegyzésnek minősültek, így az azokból kiadott kivonat közokirati jellegű.',
        'Mențiune: înregistrările anterioare datei de 1 octombrie 1895 au fost efectuate în registrele confesionale care, potrivit legii în vigoare la acea dată (Legea XXXIII din 1894), aveau caracter de registre oficiale de stare civilă; extrasul eliberat din acestea are, prin urmare, caracter de act oficial.',
        'Note: entries made before 1 October 1895 were kept in the parish registers which, under the law then in force (Act XXXIII of 1894), served as the official civil registers; extracts issued from them therefore have the character of official public records.',
      )
    : ''
  // A nyelvi záradék CSAK 'harom' módban értelmes (F8c) — egynyelvű
  // nyomtatványon nincs több nyelvi változat, amire hivatkozhatna.
  const nyelviZaradek =
    mod === 'harom'
      ? zaradek(
          mod,
          'Az igazolás magyar, román és angol nyelven készült; eltérés esetén a román szöveg irányadó.',
          'Prezenta a fost întocmită în limbile maghiară, română și engleză; în caz de divergențe, textul în limba română prevalează.',
          'Issued in Hungarian, Romanian and English; in case of discrepancy the Romanian text shall prevail.',
        )
      : ''
  const zaradekok = `<div class="zaradekok">${forrasZaradek}${celZaradek}${zaradek1895}${nyelviZaradek}</div>`

  // ── (6) Keltezés + két aláírás-blokk, középen P.H. / L.S. ──
  // F8e (user-észrevétel 3.): a keltezés-sorban a TELEPÜLÉS neve a gyülekezet
  // anyakönyvi helysége a dokumentum nyelvén (header.helysegHu/helysegRo) —
  // a hívó `helyseg` paramétere csak tartalék. Élesben a hívó a szabad szöveges
  // cím-mezőt adta át, ezért állt magyar nyomtatványon a román helységnév
  // (Brateș ↔ Barátos). Román/angol nyomtatványon a román alak az elsődleges
  // (hivatalos, hatóság előtt használt név), magyaron a magyar.
  const keltCimke = mod === 'harom' ? 'Kelt / Emisă la / Issued at' : valaszt(mod, 'Kelt', 'Emisă la', 'Issued at')
  const helysegHu = txt(header.helysegHu)
  const helysegRo = txt(header.helysegRo)
  const keltHelyseg =
    mod === 'ro' || mod === 'en'
      ? helysegRo || helysegHu || txt(helyseg)
      : helysegHu || txt(helyseg) || helysegRo
  // A dátum a nyelv-mód szerinti hosszú alakra hozva („2026. július 25." /
  // „la 25 iulie 2026" / „July 25, 2026"); a keltezesSor a G1-kontraktusból
  // jön, így a formátum a család-alapú iratokéval bit-azonos.
  const keltIso = isoDatum(datum)
  const keltNyelv = mod === 'ro' ? 'ro' : mod === 'en' ? 'en' : 'hu'
  const keltTartalom =
    keltHelyseg && keltIso
      ? `<b>${esc(keltezesSor(keltNyelv, keltHelyseg, keltIso))}</b>`
      : `<b>${ertekVagyVonal(keltHelyseg, 35)}</b>, <b>${ertekVagyVonal(txt(datum), 30)}</b>`
  const kelt = `<div class="kelt">${keltCimke}: ${keltTartalom}</div>`
  const lelkeszSzerep =
    mod === 'harom'
      ? 'Lelkipásztor / Preot paroh (Pastor) / Minister'
      : valaszt(mod, 'Lelkipásztor', 'Preot paroh (Pastor)', 'Minister')
  const fogondnokSzerep =
    mod === 'harom' ? 'Főgondnok / Prim-curator / Chief Elder' : valaszt(mod, 'Főgondnok', 'Prim-curator', 'Chief Elder')
  const pecsetFelirat = mod === 'harom' ? 'P.H. / L.S.' : valaszt(mod, 'P.H.', 'L.S.', 'L.S.')
  const alairasok = `<div class="alairasok">
    <div class="alairas"><div class="vonal"></div><div class="nev">${esc(lelkipasztor)}</div><div class="szerep">${lelkeszSzerep}</div></div>
    <div class="pecset">${pecsetFelirat}</div>
    <div class="alairas"><div class="vonal"></div><div class="nev">${fogondnok ? esc(fogondnok) : '&nbsp;'}</div><div class="szerep">${fogondnokSzerep}</div></div>
  </div>`

  const dokCim =
    mod === 'ro'
      ? `Adeverință — ${txt(szemely.teljesNev) || 'membru'}`
      : mod === 'en'
        ? `Certificate — ${txt(szemely.teljesNev) || 'parish member'}`
        : `Életút-igazolás — ${txt(szemely.teljesNev) || 'egyháztag'}`

  // A lap három rétege (kutatási jelentés 1. pont) a KÖZÖS burokból:
  // .page__header (levélfej + Szám) · .page__body (törzs) · .page__sign.
  // Az aláírás-sáv `margin-top: auto`-val a szövegtükör aljára ül, és EGYBEN
  // marad (break-inside: avoid) — így a keltezés (benne a település nevével)
  // sosem szakad el az aláírásoktól.
  return dokumentumBurok({
    lang: mod === 'harom' ? 'hu' : mod,
    cim: dokCim,
    fejlecHtml: `${fejlec}\n    ${egyhazLanc}`,
    szamSor,
    torzsHtml: `${cimBlokk}
    ${nyito}
    ${mezoTabla}
    ${zaradekok}`,
    alairasHtml: `${kelt}
    ${alairasok}`,
    extraCss: IGAZOLAS_EXTRA_CSS,
  })
}

// ─────────────────────────────────────────────────────────────────
// 2) Nyomtatható TODO-lista a hiányzó adatokról
// ─────────────────────────────────────────────────────────────────

const TODO_EXTRA_CSS = `
    .page { font-size: 10.5pt; color: #111827; }
    .page h1 { font-size: 15pt; letter-spacing: .04em; line-height: 1.25; margin: 0 0 3mm; }
    .bevezeto { text-align: center; font-size: 9.5pt; color: #334155; margin: 0 0 6mm; }
    table.hianyok { width: 100%; table-layout: fixed; border-collapse: collapse; }
    table.hianyok th, table.hianyok td { border: 0.6pt solid #334155; padding: 2mm 2.5mm; text-align: left; vertical-align: top; font-size: 10pt; line-height: 1.35; }
    table.hianyok th { background: #f1f5f9; font-size: 9.5pt; }
    table.hianyok tr { page-break-inside: avoid; break-inside: avoid; }
    /* A szélességek a th-kra IS kellenek: table-layout: fixed mellett az ELSŐ
       sor cellái határozzák meg az oszlop-szélességet. */
    .sorszam { width: 9mm; text-align: right; color: #334155; }
    .pipa { width: 12mm; text-align: center; }
    .pipa-doboz { display: inline-block; width: 4mm; height: 4mm; border: 0.6pt solid #334155; }
    .nincs-hiany { border: 0.6pt solid #334155; padding: 5mm; text-align: center; font-size: 10.5pt; }
    .labjegyzet { margin-top: 6mm; padding-top: 2.5mm; border-top: 0.5pt solid #94a3b8; font-size: 9pt; font-style: italic; color: #334155; }`

/**
 * Nyomtatható A4 TODO-lista az életút-igazolás hiányzó adatairól:
 * mit kell megkeresni (pl. régi anyakönyvben) + hova kell bevezetni a
 * rendszerben — a bevezetés után az igazolás automatikusan kitöltődik.
 */
export function buildEletutTodoHtml(hianyok: EletutHiany[], szemelyNev: string): string {
  const nev = txt(szemelyNev) || 'egyháztag'
  const lista = Array.isArray(hianyok) ? hianyok : []

  const sorok = lista
    .map(
      (h, i) => `<tr>
    <td class="sorszam">${i + 1}.</td>
    <td>${ertekVagyVonal(txt(h.cimke), 50)}</td>
    <td>${ertekVagyVonal(txt(h.hovaVezesse), 50)}</td>
    <td class="pipa"><span class="pipa-doboz"></span></td>
  </tr>`,
    )
    .join('\n  ')

  const torzs =
    lista.length > 0
      ? `<table class="hianyok">
  <tr><th class="sorszam"></th><th>Mit kell megkeresni?</th><th>Hova kell bevezetni a rendszerben?</th><th class="pipa">Kész</th></tr>
  ${sorok}
  </table>`
      : `<div class="nincs-hiany">Nincs hiányzó adat — az igazolás minden rovata az anyakönyvi nyilvántartásból kitölthető.</div>`

  const lap = `<h1>Hiányzó adatok — ${esc(nev)} életút-igazolásához</h1>
    <div class="bevezeto">Ellenőrző-lista a kiállítás előtt: az alábbi adatok az anyakönyvekből / irattárból pótlandók.</div>
    ${torzs}
    <div class="labjegyzet">A bevezetés után az igazolás automatikusan kitöltődik, és az adatbázis is gazdagodik.</div>`

  // Belső munkalap: nincs levélfej és aláírás — csak a törzs a közös A4-tükörben.
  return dokumentumBurok({
    lang: 'hu',
    cim: `Hiányzó adatok — ${nev}`,
    torzsHtml: lap,
    extraCss: TODO_EXTRA_CSS,
  })
}
