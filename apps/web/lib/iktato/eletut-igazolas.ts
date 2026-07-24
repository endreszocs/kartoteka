/**
 * Iktató F8b (B2) — CIEC-mintájú, HÁROMNYELVŰ (hu/ro/en) életút-/családi
 * igazolás nyomtatvány-generátor.
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
 * WYSIWYG-elv (minta: lelkeszi-jelentes/print.ts + worklog/official-journal.ts):
 * @page A4 portrait margin 0, a lap-margót a .sheet paddingja adja (18mm bal
 * lefűző-margóval) — az előnézet, a PDF és a nyomtatás UGYANAZT a HTML-t kapja.
 * A body `data-sheet-count` attribútuma a print-engine-v2 csonka-PDF-őréhez kell.
 * Tisztán pure modul (nincs DOM-hivatkozás) — a hívó iframe/srcdoc-ba tölti.
 */

import type { CongregationHeaderData } from './certificate-types'
import { buildLetterheadHtml } from './letterheads'
import type { EletutHazassag, EletutHiany, EletutIgazolasData } from './eletut-types'

// ─────────────────────────────────────────────────────────────────
// Publikus típus — a hívó (kiállító dialógus, B3) opciói
// ─────────────────────────────────────────────────────────────────

export interface EletutIgazolasHtmlOptions {
  /** A B1 adatgyűjtő (eletut-actions) által összeállított igazolás-adatcsomag. */
  data: EletutIgazolasData
  /** A gyülekezet hivatalos fejléc-adatai (getCongregationHeader). */
  header: CongregationHeaderData
  /** A kiosztott iktatószám — null esetén kitöltő-vonal kerül a helyére. */
  iratszam: string | null
  /** Keltezés helye (jellemzően a gyülekezet helysége). */
  helyseg: string
  /** Keltezés dátuma, megjelenítésre kész szövegként (pl. „2026. július 25."). */
  datum: string
  /** A kiállító lelkipásztor neve (aláírás-blokk + nyitómondat). */
  lelkipasztor: string
  /** A főgondnok neve — üresen a vonal kézi aláírásra marad. */
  fogondnok?: string | null
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
// Háromnyelvű építőkövek
// ─────────────────────────────────────────────────────────────────

/** Háromnyelvű mező-felirat blokk (HU vastag, RO/EN dőlt, kisebb betű). */
function cimke(hu: string, ro: string, en: string): string {
  return `<div class="cimke"><span class="hu">${hu}</span><br /><span class="ro">${ro}</span><br /><span class="en">${en}</span></div>`
}

/** Egy számozott CIEC-mező sor: sorszám + 3 nyelvű felirat + érték. */
function mezoSor(szam: number, hu: string, ro: string, en: string, ertekHtml: string): string {
  return `<tr class="mezo"><td class="szam">${szam}.</td><td>${cimke(hu, ro, en)}<div class="mezo-ertek">${ertekHtml}</div></td></tr>`
}

/** Szakasz-fejléc sor (A/B/C/D) — háromnyelvű, kiemelt háttérrel. */
function szakaszSor(cim: string): string {
  return `<tr class="szakasz"><td colspan="2">${cim}</td></tr>`
}

/** Háromnyelvű záradék-blokk (HU normál + RO/EN dőlt, kisebb betű). */
function zaradek(hu: string, ro: string, en: string): string {
  return `<div class="zaradek"><p class="hu">${hu}</p><p class="ro">${ro}</p><p class="en">${en}</p></div>`
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
// Közös lap-stílus — WYSIWYG (@page margin 0 + .sheet padding, 18mm bal)
// ─────────────────────────────────────────────────────────────────

const STILUS_ALAP = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111827; margin: 0; background: #e2e8f0; padding: 12px 0; font-size: 10.5pt; line-height: 1.4; }
    /* Nagyobb bal padding (18mm): lefűzhetőség — lyukasztás-margó. */
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.14); padding: 12mm 14mm 14mm 18mm; page-break-after: always; position: relative; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .kitolto { display: inline-block; border-bottom: 0.5pt dotted #111827; height: 3mm; vertical-align: baseline; }
    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0 auto; box-shadow: none; } }`

/** Teljes HTML-dokumentum burkoló (iframe/srcdoc + print-engine-v2 kompatibilis). */
function dokumentum(cim: string, stilus: string, lapTartalom: string): string {
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<title>${esc(cim)}</title>
<style>${stilus}
</style>
</head>
<body data-sheet-count="1">
<div class="sheet">
${lapTartalom}
</div>
</body>
</html>`
}

// ─────────────────────────────────────────────────────────────────
// 1) Az igazolás-nyomtatvány
// ─────────────────────────────────────────────────────────────────

const IGAZOLAS_STILUS = `${STILUS_ALAP}

    /* Kis 3-nyelvű egyház-lánc sor közvetlenül a levélfej alatt. */
    .egyhaz-lanc { text-align: center; font-size: 8.5pt; letter-spacing: .02em; margin: -4mm 0 4mm; }

    .szam-sor { margin: 0 0 4mm; }
    .cim-blokk { text-align: center; margin: 0 0 4mm; }
    .cim-blokk .fo { font-size: 15pt; font-weight: bold; letter-spacing: .18em; }
    .cim-blokk .masodik { font-size: 11.5pt; font-weight: bold; letter-spacing: .1em; margin-top: 1.2mm; }
    .cim-blokk .alcim { font-size: 9.5pt; margin-top: .4mm; }

    .nyito p { margin: 0 0 1.8mm; text-align: justify; }
    .nyito .ro, .nyito .en { font-size: 9.5pt; font-style: italic; color: #1f2937; }

    table.mezok { width: 100%; border-collapse: collapse; margin: 2.5mm 0 4mm; }
    table.mezok td { border: 0.6pt solid #334155; padding: 1.2mm 2mm; vertical-align: top; }
    table.mezok tr { page-break-inside: avoid; break-inside: avoid; }
    td.szam { width: 8mm; text-align: right; font-size: 9pt; color: #334155; }
    tr.szakasz td { background: #f1f5f9; font-weight: bold; font-size: 9.5pt; letter-spacing: .04em; padding: 1.6mm 2mm; }
    /* A mező-feliratok 3 nyelven, 9pt-tal (HU vastag, RO/EN dőlt) — az érték egyszer. */
    .cimke { font-size: 9pt; line-height: 1.28; }
    .cimke .hu { font-weight: bold; }
    .cimke .ro, .cimke .en { font-style: italic; color: #374151; }
    .mezo-ertek { font-size: 10.5pt; font-weight: 600; margin-top: .8mm; }

    table.gyermekek { width: 100%; border-collapse: collapse; margin-top: 1mm; }
    table.gyermekek th, table.gyermekek td { border: 0.5pt solid #64748b; padding: 1mm 1.5mm; font-size: 9.5pt; text-align: left; vertical-align: top; }
    table.gyermekek th { font-size: 8.5pt; background: #f8fafc; }
    table.gyermekek th .ro, table.gyermekek th .en { display: block; font-weight: normal; font-style: italic; font-size: 7.5pt; color: #374151; }

    .zaradekok { margin-top: 3mm; }
    .zaradek { margin: 0 0 2.2mm; page-break-inside: avoid; break-inside: avoid; }
    .zaradek p { margin: 0 0 .6mm; font-size: 9.5pt; text-align: justify; }
    .zaradek .ro, .zaradek .en { font-size: 8.8pt; font-style: italic; color: #1f2937; }

    .kelt { margin-top: 5mm; }
    .alairasok { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 11mm; page-break-inside: avoid; break-inside: avoid; }
    .alairas { width: 60mm; text-align: center; }
    .alairas .vonal { border-bottom: 0.6pt solid #111827; height: 9mm; margin-bottom: 1.5mm; }
    .alairas .nev { font-weight: bold; min-height: 4.5mm; }
    .alairas .szerep { font-size: 8.5pt; }
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

  // ── (1) Fejléc: magyar levélfej + kis 3-nyelvű egyház-lánc sor ──
  const fejlec = buildLetterheadHtml('hu', header)
  const egyhazLanc = `<div class="egyhaz-lanc">Romániai Református Egyház &middot; Biserica Reformată din România &middot; Reformed Church in Romania — cult recunoscut conform Legii nr. 489/2006</div>`

  // ── (2) Iktatószám-sor + 3 nyelvű cím-blokk (tervdoc 2. pont) ──
  const szamSor = `<div class="szam-sor">Szám / Nr. / No.: <b>${ertekVagyVonal(txt(iratszam), 30)}</b></div>`
  const cimBlokk = `<div class="cim-blokk">
    <div class="fo">IGAZOLÁS</div>
    <div class="alcim">kivonat az egyházközségi anyakönyvekből</div>
    <div class="masodik">ADEVERINȚĂ</div>
    <div class="alcim">— extras din registrele parohiale (matricolele bisericești) —</div>
    <div class="masodik">CERTIFICATE</div>
    <div class="alcim">— Extract from the Parish Registers —</div>
  </div>`

  // ── (3) Tanúsító nyitómondat mindhárom nyelven (tervdoc-formulák) ──
  const lelkeszHtml = `<b>${esc(lelkipasztor)}</b>`
  const nyito = `<div class="nyito">
    <p class="hu">Alulírott ${lelkeszHtml}, ${nevelo(nevHu)} <b>${esc(nevHu)}</b> lelkipásztora, egyházközségünk hivatalos anyakönyveinek bejegyzései alapján igazolom, hogy az alábbi, számozott rovatokban foglalt adatok az anyakönyvi bejegyzésekkel mindenben megegyeznek:</p>
    <p class="ro">Subsemnatul ${lelkeszHtml}, preot paroh (pastor) ${roParohia(nevRo)}, adeveresc prin prezenta, în conformitate cu înregistrările din registrele parohiale (matricolele bisericești) păstrate la oficiul parohial, că datele înscrise în rubricile numerotate de mai jos corespund întocmai înregistrărilor:</p>
    <p class="en">I, the undersigned ${lelkeszHtml}, ${enParish(nevEn)}, do hereby certify from the records (parish registers) of this parish that the particulars entered in the numbered fields below are in full conformity with the said records:</p>
  </div>`

  // ── (4) CIEC-stílusú számozott mezős táblázat ──
  let sorszam = 0
  const sorok: string[] = []
  const mezo = (hu: string, ro: string, en: string, ertekHtml: string) => {
    sorszam += 1
    sorok.push(mezoSor(sorszam, hu, ro, en, ertekHtml))
  }

  // A) Személy
  sorok.push(szakaszSor('A) A SZEMÉLY &middot; PERSOANA &middot; THE PERSON'))
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
      'B) EGYHÁZI ÉLETÚT — AZ EGYHÁZKÖZSÉGI ANYAKÖNYVEK SZERINT &middot; PARCURSUL ÎN VIAȚA BISERICII — CONFORM REGISTRELOR PAROHIALE &middot; RECORD OF CHURCH LIFE — ACCORDING TO THE PARISH REGISTERS',
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
  sorok.push(szakaszSor('C) GYERMEKEI &middot; COPIII &middot; CHILDREN'))
  const gyermekFejlec = `<tr>
    <th>Név<span class="ro">Numele</span><span class="en">Name</span></th>
    <th>Születési idő<span class="ro">Data nașterii</span><span class="en">Date of birth</span></th>
    <th>Keresztelés<span class="ro">Botezul (data)</span><span class="en">Baptism (date)</span></th>
    <th>Anyakönyvi szám<span class="ro">Nr. înregistrării</span><span class="en">Register entry no.</span></th>
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
      szakaszSor('D) ELHALÁLOZÁSA ÉS NYUGHELYE &middot; DECESUL ȘI LOCUL DE VECI &middot; DEATH AND RESTING PLACE'),
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

  const mezoTabla = `<table class="mezok">
  ${sorok.join('\n  ')}
  </table>`

  // ── (5) Záradékok — a tervdoc formulái szó szerint ──
  const forrasZaradek = zaradek(
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
    `Jelen igazolást ${kerelmezoHu} kérésére, ${cel ? esc(cel) : 'bíróság és hatóságok előtti felhasználás'} céljából adtam ki.`,
    `Prezenta adeverință s-a eliberat la cererea ${kerelmezoRo}, pentru a-i servi ${cel ? `la ${esc(cel)}` : 'în fața instanțelor judecătorești și a autorităților publice'}.`,
    `This certificate has been issued at the request of ${kerelmezoEn} for ${cel ? esc(cel) : 'submission to courts of law and public authorities'}.`,
  )
  // 1895. október 1. előtti bejegyzésnél közokirati megjegyzés (tervdoc 5. pont).
  const zaradek1895 = van1895ElottiBejegyzes(data)
    ? zaradek(
        'Megjegyzés: az 1895. október 1. előtti bejegyzések a korabeli jog (1894. évi XXXIII. tc.) szerint hivatalos állami anyakönyvi bejegyzésnek minősültek, így az azokból kiadott kivonat közokirati jellegű.',
        'Mențiune: înregistrările anterioare datei de 1 octombrie 1895 au fost efectuate în registrele confesionale care, potrivit legii în vigoare la acea dată (Legea XXXIII din 1894), aveau caracter de registre oficiale de stare civilă; extrasul eliberat din acestea are, prin urmare, caracter de act oficial.',
        'Note: entries made before 1 October 1895 were kept in the parish registers which, under the law then in force (Act XXXIII of 1894), served as the official civil registers; extracts issued from them therefore have the character of official public records.',
      )
    : ''
  const nyelviZaradek = zaradek(
    'Az igazolás magyar, román és angol nyelven készült; eltérés esetén a román szöveg irányadó.',
    'Prezenta a fost întocmită în limbile maghiară, română și engleză; în caz de divergențe, textul în limba română prevalează.',
    'Issued in Hungarian, Romanian and English; in case of discrepancy the Romanian text shall prevail.',
  )
  const zaradekok = `<div class="zaradekok">${forrasZaradek}${celZaradek}${zaradek1895}${nyelviZaradek}</div>`

  // ── (6) Keltezés + két aláírás-blokk, középen P.H. / L.S. ──
  const kelt = `<div class="kelt">Kelt / Emisă la / Issued at: <b>${ertekVagyVonal(helyseg, 35)}</b>, <b>${ertekVagyVonal(datum, 30)}</b></div>`
  const alairasok = `<div class="alairasok">
    <div class="alairas"><div class="vonal"></div><div class="nev">${esc(lelkipasztor)}</div><div class="szerep">Lelkipásztor / Preot paroh (Pastor) / Minister</div></div>
    <div class="pecset">P.H. / L.S.</div>
    <div class="alairas"><div class="vonal"></div><div class="nev">${fogondnok ? esc(fogondnok) : '&nbsp;'}</div><div class="szerep">Főgondnok / Prim-curator / Chief Elder</div></div>
  </div>`

  const lap = [fejlec, egyhazLanc, szamSor, cimBlokk, nyito, mezoTabla, zaradekok, kelt, alairasok].join('\n')
  return dokumentum(`Életút-igazolás — ${txt(szemely.teljesNev) || 'egyháztag'}`, IGAZOLAS_STILUS, lap)
}

// ─────────────────────────────────────────────────────────────────
// 2) Nyomtatható TODO-lista a hiányzó adatokról
// ─────────────────────────────────────────────────────────────────

const TODO_STILUS = `${STILUS_ALAP}

    h1 { font-size: 14pt; text-align: center; letter-spacing: .04em; margin: 2mm 0 2mm; }
    .bevezeto { text-align: center; font-size: 9.5pt; color: #334155; margin: 0 0 6mm; }
    table.hianyok { width: 100%; border-collapse: collapse; }
    table.hianyok th, table.hianyok td { border: 0.6pt solid #334155; padding: 2mm 2.5mm; text-align: left; vertical-align: top; font-size: 10pt; }
    table.hianyok th { background: #f1f5f9; font-size: 9.5pt; }
    table.hianyok tr { page-break-inside: avoid; break-inside: avoid; }
    td.sorszam { width: 8mm; text-align: right; color: #334155; }
    td.pipa { width: 10mm; text-align: center; }
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
  <tr><th></th><th>Mit kell megkeresni?</th><th>Hova kell bevezetni a rendszerben?</th><th>Kész</th></tr>
  ${sorok}
  </table>`
      : `<div class="nincs-hiany">Nincs hiányzó adat — az igazolás minden rovata az anyakönyvi nyilvántartásból kitölthető.</div>`

  const lap = `<h1>Hiányzó adatok — ${esc(nev)} életút-igazolásához</h1>
<div class="bevezeto">Ellenőrző-lista a kiállítás előtt: az alábbi adatok az anyakönyvekből / irattárból pótlandók.</div>
${torzs}
<div class="labjegyzet">A bevezetés után az igazolás automatikusan kitöltődik, és az adatbázis is gazdagodik.</div>`

  return dokumentum(`Hiányzó adatok — ${nev}`, TODO_STILUS, lap)
}
