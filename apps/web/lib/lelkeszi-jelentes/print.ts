// 2026-07-16 (F5/J3) → 2026-08-25 (jelentés-UX kör): Éves hivatalos lelkészi
// jelentés — A4 ÁLLÓ nyomtatvány-generátor, ÚJ, TÖMÖRÍTETT lapkiosztással.
//
// A korábbi 8 lapos (címlap + 6 fejezetlap + Adatlap) nyomtatvány 6 lapra
// tömörült, kategorizált, táblázatos elrendezéssel:
//   1. lap — címlap (iktatószámok, tárgyalások, aláírások — változatlan tartalom);
//   2. lap — I. Lélekszám: „Gyülekezetünk képe" összefoglaló kártya (I.10, I.1,
//            I.8, I.9, I.11 + az ÚJ I.24 átlagéletkor / I.25 vallásórás korú /
//            I.26 IKE-korosztály), anyakönyvi mozgások HÁROMOSZLOPOS
//            (férfi–nő–együtt) táblában, esketés + családok + tagsági adatok,
//            és — HA VAN korábbi véglegesített év — az „Öt év tükrében"
//            összevető tábla két mini-oszlopdiagrammal (nincs adat → a blokk
//            teljesen elmarad, nem üres keret);
//   3. lap — II. Istentisztelet: alkalmak/átlagjelenlét/% tábla, sátoros
//            ünnepi 3×3 jelenlét-rács, egyéb alkalmak, úrvacsora-blokk;
//   4. lap — III. Gyülekezetgondozás (kétoszlopos táblák) + IV. Belmisszió
//            (kétoszlopos szövegblokkok — a IV.5/IV.6 határidőnaplós mezőkkel);
//   5. lap — V. Vallásoktatás (tábla + konfirmandus fiú–lány–együtt tábla) +
//            VI. Szeretetszolgálat + VII. Anyagi helyzet (számadás-tábla);
//   6. lap — VIII. Ingatlanok + IX. Események + X. Missziói terv.
//
// MEGKÖTÉSEK (minta: official-journal.ts / official-documents.ts):
//  - WYSIWYG-elv: @page margin 0, a lap-margót a .sheet paddingje adja —
//    előnézet és nyomtatás azonos tördelésű; ÁLLÓ A4 (210×297mm);
//  - a bal padding nagyobb (18mm) a lefűzhetőség (lyukasztás-margó) miatt;
//  - minden érték a mezoErtek prioritással (felülírás > auto > kézi),
//    üres érték: '—' (a nyomtatvány kitöltetlen rovata) — a RÉGI véglegesített
//    snapshotok (amelyekben az új mezők még nincsenek) így is helyesek;
//  - LEFEDETTSÉG-ŐR: a katalógus MINDEN mezője pontosan egy helyre van
//    beosztva; ami (jövőbeli append-only bővítésnél) kimaradna, az a záró lap
//    „Kiegészítő tételek" táblájába kerül — mező NÉMÁN nem tűnhet el;
//  - LAPSZÁM-ŐR (2026-08-25, élesben elsült hibaosztály): a body
//    data-sheet-count attribútuma a TÉNYLEGES lapszám — a print-engine-v2
//    laponkénti (GPU-plafon-biztos) PDF-útja és csonka-PDF-őre erre kapcsol;
//    enélkül a render-hiba NÉMÁN a teljes-dokumentumos útra esne, ami a
//    GPU textúra-plafon (~16 384 px) fölött fehér lapokból álló PDF-et ad;
//  - tisztán pure függvény (nincs DOM-hivatkozás) — a hívó iframe/srcDoc-ba tölti;
//  - HTML-escape MINDEN szabad szövegen (kézi mezők, hatarozat, gyülekezetnév).

import {
  ADATLAP_MEZO_IDS,
  FEJEZET_CIMEK,
  JELENTES_MEZOK,
  mezoErtek,
  parseHuSzam,
  type JelentesFejezet,
  type JelentesMezo,
  type LelkesziJelentesData,
} from './types'
import { epitOszlopdiagram, type AdatlapPont } from './adatlap-svg'
import { formatEgyhazmegyeNev } from '@/lib/format/egyhazmegye-nev'

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Escape + sortörések megtartása rövid szöveg-mezőkben (CRLF-normalizálással). */
function escMultiline(value: string): string {
  return esc(value)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '<br />')
}

const HONAP_NEV = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
]

/**
 * Magyar számformátum a nyomtatványra: ezres tagolás nem törő szóközzel,
 * tizedesvessző, legfeljebb 2 tizedes (a záró nullák elhagyásával).
 */
function fmtSzam(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const kerekitett = Math.round(v * 100) / 100
  const negativ = kerekitett < 0
  const [egesz, tizedes] = Math.abs(kerekitett).toFixed(2).split('.')
  const tagolt = egesz.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const tiz = (tizedes || '').replace(/0+$/, '')
  return `${negativ ? '-' : ''}${tagolt}${tiz ? `,${tiz}` : ''}`
}

/**
 * Tárgyalási dátum a címlap mondatába: ISO (YYYY-MM-DD) → „2026. március 5.
 * napján"; minden más beírt szöveg változatlanul (a lelkész szabadon fogalmazhat).
 * Üres érték: kitöltő-vonal (mint az üres nyomtatványon).
 */
function fmtTargyalasiDatum(value: string | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '<span class="kitolto"></span>'
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return esc(raw)
  const ho = HONAP_NEV[parseInt(m[2], 10) - 1]
  const nap = parseInt(m[3], 10)
  if (!ho || !nap) return esc(raw)
  return `${m[1]}. ${ho} ${nap}. napján`
}

/** Üres érték → kitöltő-vonal, kitöltött → escape-elt szöveg. */
function vagyKitolto(value: string | undefined): string {
  const raw = (value || '').trim()
  return raw ? esc(raw) : '<span class="kitolto"></span>'
}

/**
 * Tárgyalási szám a címlap mondatába: a minta szerint „gyűlésén 12. szám
 * alatt" — a szám záró pontot kap (duplázás nélkül, ha a lelkész már ponttal
 * írta be); üresen kitöltő-vonal + pont.
 */
function fmtTargyalasiSzam(value: string | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return '<span class="kitolto"></span>.'
  return `${esc(raw.replace(/\.+$/, ''))}.`
}

/** Magyar névelő nagybetűs cím elé: magánhangzóval kezdődő névnél „AZ". */
function nevelo(nev: string): string {
  return /^[aáeéiíoóöőuúüű]/i.test(nev.trim()) ? 'AZ' : 'A'
}

/**
 * Az egyházmegye-vonal a címlap fejlécébe: ha ismert az egyházmegye neve,
 * escape-elve jelenik meg — a „Református Egyházmegye" toldat duplázás-
 * védelme a KÖZÖS helperben él (lib/format/egyhazmegye-nev.ts — ugyanezt
 * hívja a megyei dashboard hero-címe is, hogy a két hely ne húzhasson szét);
 * üres névnél a kitöltő-vonal marad (mint az üres nyomtatványon).
 */
function egyhazmegyeSor(egyhazmegyeNev: string | null): string {
  const teljes = formatEgyhazmegyeNev(egyhazmegyeNev)
  if (!teljes) return '<span class="kitolto"></span> Református Egyházmegye'
  return esc(teljes)
}

/**
 * Egy mező megjelenítendő értéke a nyomtatványon: felülírás > auto > kézi
 * (mezoErtek), szám magyar formátumban, üres rovat '—'.
 */
function mezoMegjelenites(data: LelkesziJelentesData, mezo: JelentesMezo): string {
  const ertek = mezoErtek(data, mezo.id)
  if (ertek === null || ertek === undefined || ertek === '') return '—'
  if (typeof ertek === 'number') return fmtSzam(ertek)
  return escMultiline(String(ertek))
}

/** A tétel sorszáma a fejezeten belül: 'I.2a' → '2a.' */
function tetelSorszam(mezo: JelentesMezo): string {
  return `${mezo.id.slice(mezo.fejezet.length + 1)}.`
}

const MEZO_BY_ID = new Map<string, JelentesMezo>(JELENTES_MEZOK.map((m) => [m.id, m]))

/**
 * Render-kontextus: az adat + a LEFEDETTSÉG-ŐR halmaza. Minden renderelt mező
 * bejelentkezik a lefedett halmazba; ami a végén kimarad, az a záró lap
 * „Kiegészítő tételek" táblájába kerül (append-only jövőbiztosítás — a
 * katalógus új mezője SOHA nem tűnhet el némán a hivatalos nyomtatványról).
 */
interface RenderCtx {
  data: LelkesziJelentesData
  lefedett: Set<string>
}

function jelol(ctx: RenderCtx, ...ids: string[]): void {
  for (const id of ids) ctx.lefedett.add(id)
}

/** Egy mező feloldott, formázott értéke + lefedettség-jelölés. */
function ertekHtml(ctx: RenderCtx, id: string): string {
  const mezo = MEZO_BY_ID.get(id)
  if (!mezo) return '—'
  jelol(ctx, id)
  return mezoMegjelenites(ctx.data, mezo)
}

/** Egy mező feloldott értéke SZÁMKÉNT (magyar alak is), különben null. */
function szamErtek(data: LelkesziJelentesData, id: string): number | null {
  return parseHuSzam(mezoErtek(data, id))
}

/** A mező egysége a nyomtatványra (a pénz hivatalos neve: „lej"). */
function egysegFelirat(mezo: JelentesMezo): string {
  return mezo.egyseg === 'RON' ? 'lej' : (mezo.egyseg || '')
}

// ---------------------------------------------------------------------------
// Stílusok — WYSIWYG: @page margin 0, a lap-margót a .sheet paddingje adja
// ---------------------------------------------------------------------------

const STYLES = `
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111827; margin: 0; background: #e2e8f0; padding: 12px 0; font-size: 9.5pt; line-height: 1.3; }
    /* Nagyobb bal padding (18mm): lefűzhetőség — lyukasztás-margó. */
    .sheet { width: 210mm; min-height: 297mm; margin: 0 auto 12px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.14); padding: 11mm 12mm 14mm 18mm; page-break-after: always; position: relative; }
    .sheet:last-child { page-break-after: auto; margin-bottom: 0; }
    .oldalszam { position: absolute; bottom: 6mm; right: 11mm; font-size: 8.5pt; color: #475569; }

    /* ── Címlap ─────────────────────────────────────────────────────────── */
    .cimlap-fej { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; font-size: 10pt; }
    .cimlap-fej .iktatoszamok div { margin-bottom: 2mm; }
    .cimlap-fej .kerulet { text-align: center; }
    .cimlap-fej .kerulet .egyhazmegye { margin-top: 1mm; }
    .esperes-blokk { margin-top: 10mm; text-align: center; }
    .cim { text-align: center; margin-top: 42mm; }
    .cim h1 { font-size: 17pt; font-weight: bold; letter-spacing: .12em; text-transform: uppercase; margin: 0 0 8mm; }
    .cim .gyulekezet { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 4mm; }
    .cim .evrol { font-size: 12pt; font-weight: bold; letter-spacing: .08em; }
    .targyalas { margin-top: 34mm; font-size: 10.5pt; }
    .targyalas p { margin: 0 0 4mm; }
    .alairasok { display: flex; justify-content: space-between; margin-top: 34mm; gap: 10mm; }
    .alairas { width: 58mm; text-align: center; }
    .alairas .vonal { border-bottom: 0.6pt solid #111827; height: 10mm; margin-bottom: 1.5mm; }
    .alairas .nev { min-height: 4.5mm; font-weight: bold; }
    .alairas .szerep { font-size: 9.5pt; }
    .kitolto { display: inline-block; min-width: 28mm; border-bottom: 0.5pt dotted #111827; }

    /* ── Fejezetcímek, alcímek — elegáns serif, finom vonalak ───────────── */
    .fejezet-cim { font-size: 12pt; font-weight: bold; letter-spacing: .06em; text-transform: uppercase; margin: 0 0 2.5mm; padding-bottom: 1.2mm; border-bottom: 0.8pt solid #111827; page-break-after: avoid; break-after: avoid; }
    .fejezet-cim .szam { display: inline-block; min-width: 9mm; color: #334155; }
    .fejezet + .fejezet { margin-top: 5mm; }
    .alcim { font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: .14em; color: #475569; margin: 2.5mm 0 1.2mm; page-break-after: avoid; break-after: avoid; }

    /* ── „Gyülekezetünk képe" összefoglaló kártya ───────────────────────── */
    .kartya { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.6mm; margin: 1.5mm 0 3mm; }
    .kartya .cella { border: 0.4pt solid #cbd5e1; background: #f8fafc; padding: 1.3mm 1.2mm; text-align: center; }
    .kartya .ertek { font-size: 11.5pt; font-weight: bold; font-variant-numeric: tabular-nums; line-height: 1.15; }
    .kartya .ertek .egyseg { font-size: 7.5pt; font-weight: normal; color: #475569; }
    .kartya .felirat { font-size: 6.4pt; text-transform: uppercase; letter-spacing: .08em; color: #475569; margin-top: 0.8mm; line-height: 1.3; }

    /* ── Táblázatok ─────────────────────────────────────────────────────── */
    table.t { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 0 0 2.2mm; }
    table.t th { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .08em; color: #475569; font-weight: bold; border-bottom: 0.6pt solid #334155; padding: 0.7mm 1mm; text-align: left; }
    table.t th.szam { text-align: right; }
    table.t td { padding: 0.7mm 1mm; border-bottom: 0.3pt solid #e2e8f0; vertical-align: top; }
    table.t tr:last-child td { border-bottom: 0.4pt solid #94a3b8; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    td.sorszam { width: 8mm; text-align: right; white-space: nowrap; color: #64748b; }
    td.megnevezes { overflow-wrap: anywhere; }
    td.megnevezes.behuzott { padding-left: 4mm; }
    td.szam { text-align: right; font-weight: bold; font-variant-numeric: tabular-nums; white-space: nowrap; }
    td.szam.halvany { color: #94a3b8; font-weight: normal; }
    td.ertek { width: 22mm; text-align: right; font-weight: bold; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    td.ertek.szoveges { text-align: left; font-weight: normal; width: auto; }
    td.egyseg { width: 12mm; text-align: left; color: #64748b; font-size: 8pt; }

    /* ── Kétoszlopos elrendezések ───────────────────────────────────────── */
    .ket-oszlop { display: grid; grid-template-columns: 1fr 1fr; gap: 0 6mm; align-items: start; }

    /* ── Szövegblokkok ──────────────────────────────────────────────────── */
    .szoveg-blokk { margin: 0 0 2.5mm; }
    .szoveg-blokk .blokk-cim { font-weight: bold; font-size: 9pt; margin: 0 0 0.8mm; page-break-after: avoid; break-after: avoid; }
    .szoveg-blokk p { margin: 0 0 1mm; font-size: 9pt; text-align: justify; overflow-wrap: anywhere; }
    .szoveg-blokk p.ures { color: #64748b; text-align: left; }

    /* ── „Öt év tükrében" — többéves összevetés ─────────────────────────── */
    .otev { margin-top: 2mm; page-break-inside: avoid; break-inside: avoid; }
    table.otev-tabla { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin: 0 0 1.5mm; }
    table.otev-tabla th, table.otev-tabla td { border: 0.3pt solid #94a3b8; padding: 0.5mm 1.2mm; text-align: left; }
    table.otev-tabla th.szam, table.otev-tabla td.szam { text-align: right; font-variant-numeric: tabular-nums; }
    table.otev-tabla th.targyev, table.otev-tabla td.targyev { background: #f1f5f9; font-weight: bold; }
    table.otev-tabla .ures { color: #94a3b8; }
    .otev-grafikonok { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 1mm; }
    /* A mini-diagram magassága rögzített (az SVG arányt tartva, keretbe zárva
       skálázódik) — a 2. lap magassága nem függhet a diagram szélességétől. */
    .otev-grafikonok svg { width: 100%; height: 22mm; display: block; }
    .megjegyzes { font-size: 7.5pt; color: #64748b; margin: 0.8mm 0 0; }

    @media print { body { background: #fff; padding: 0; } .sheet { margin: 0 auto; box-shadow: none; } }
`

// ---------------------------------------------------------------------------
// Címlap — a minta-PDF 1. oldalának hű mása
// ---------------------------------------------------------------------------

function cimlapHtml(data: LelkesziJelentesData): string {
  const h = data.hatarozat
  // A minta címsora mindig „… REFORMÁTUS EGYHÁZKÖZSÉG" — ha a gyülekezet neve
  // (nev_hu lehet rövid alak, pl. „Barátos") nem tartalmazza, a toldatot
  // hozzáfűzzük; ha már benne van, nem duplázzuk.
  const nyersNev = (data.congregationName || '').trim()
  const nagyNev = nyersNev.toUpperCase()
  const nev = !nyersNev
    ? 'REFORMÁTUS EGYHÁZKÖZSÉG'
    : nagyNev.includes('EGYHÁZKÖZSÉG')
      ? nagyNev
      : `${nagyNev} REFORMÁTUS EGYHÁZKÖZSÉG`
  return `<section class="sheet cimlap">
      <div class="cimlap-fej">
        <div class="iktatoszamok">
          <div>Egyházközségi iktatószám: ${vagyKitolto(h.egyhazkozsegiIktatoszam)}</div>
          <div>Egyházmegyei iktatószám: ${vagyKitolto(h.egyhazmegyeiIktatoszam)}</div>
        </div>
        <div class="kerulet">
          <div>Erdélyi Református Egyházkerület</div>
          <div class="egyhazmegye">${egyhazmegyeSor(data.egyhazmegyeNev)}</div>
          <div class="esperes-blokk">
            <div class="alairas" style="margin: 0 auto;">
              <div class="vonal"></div>
              <div class="szerep">Esperes</div>
            </div>
          </div>
        </div>
      </div>
      <div class="cim">
        <h1>Lelkészi jelentés</h1>
        <div class="gyulekezet">${nevelo(nev)} ${esc(nev)}</div>
        <div class="evrol">${data.ev}. évi életéről</div>
      </div>
      <div class="targyalas">
        <p>Tárgyalta a presbitérium a ${fmtTargyalasiDatum(h.presbiteriDatum)} tartott gyűlésén ${fmtTargyalasiSzam(h.presbiteriSzam)} szám alatt.</p>
        <p>Tárgyalta az egyházközségi közgyűlés a ${fmtTargyalasiDatum(h.kozgyulesiDatum)} tartott gyűlésén ${fmtTargyalasiSzam(h.kozgyulesiSzam)} szám alatt.</p>
      </div>
      <div class="alairasok">
        <div class="alairas">
          <div class="vonal"></div>
          <div class="nev">${esc(h.lelkipasztor || '')}</div>
          <div class="szerep">Lelkipásztor</div>
        </div>
        <div class="alairas">
          <div class="vonal"></div>
          <div class="nev">${esc(h.fogondnok || '')}</div>
          <div class="szerep">Főgondnok / Gondnok</div>
        </div>
      </div>
    </section>`
}

// ---------------------------------------------------------------------------
// Közös építőelemek (fejezetcím, tétel-tábla, háromoszlopos tábla, szövegblokk)
// ---------------------------------------------------------------------------

function fejezetCim(f: JelentesFejezet): string {
  return `<h2 class="fejezet-cim"><span class="szam">${f}.</span> ${esc(FEJEZET_CIMEK[f])}</h2>`
}

interface TetelSor {
  id: string
  /** Rövidített nyomtatvány-felirat (a katalógus-címke helyett); a mezoId változatlan. */
  label?: string
  /** Behúzott al-tétel (pl. „— ebből férfi"). */
  behuzas?: boolean
}

/**
 * Általános tétel-táblázat: sorszám | megnevezés | érték | egység. A szöveg
 * típusú mező érték-cellája balra zárt és szélesebb (colspan).
 */
function tetelTabla(ctx: RenderCtx, cim: string | null, sorok: TetelSor[]): string {
  const sorHtml = sorok
    .map((s) => {
      const mezo = MEZO_BY_ID.get(s.id)
      if (!mezo) return ''
      jelol(ctx, s.id)
      const label = s.label ?? mezo.label
      if (mezo.tipus !== 'szam') {
        return `<tr>
        <td class="sorszam">${esc(tetelSorszam(mezo))}</td>
        <td class="megnevezes${s.behuzas ? ' behuzott' : ''}">${esc(label)}</td>
        <td class="ertek szoveges" colspan="2">${mezoMegjelenites(ctx.data, mezo)}</td>
      </tr>`
      }
      return `<tr>
      <td class="sorszam">${esc(tetelSorszam(mezo))}</td>
      <td class="megnevezes${s.behuzas ? ' behuzott' : ''}">${esc(label)}</td>
      <td class="ertek">${mezoMegjelenites(ctx.data, mezo)}</td>
      <td class="egyseg">${esc(egysegFelirat(mezo))}</td>
    </tr>`
    })
    .join('')
  return `${cim ? `<div class="alcim">${esc(cim)}</div>` : ''}<table class="t"><tbody>${sorHtml}</tbody></table>`
}

interface HarmasSor {
  sorszam: string
  label: string
  a: string
  b: string
  /** Az „együtt" mező id-je; hiányában a + b MEGJELENÍTÉSI összege kerül a cellába. */
  c?: string
}

/**
 * Háromoszlopos tábla (pl. férfi | nő | együtt vagy fiú | lány | együtt).
 * A c nélküli sor „együtt" cellája csak MEGJELENÍTÉSI összeg (a + b, ha
 * legalább az egyik szám) — tárolt mezőt nem talál ki.
 */
function harmasTabla(
  ctx: RenderCtx,
  cim: string | null,
  fejlec: [string, string, string],
  sorok: HarmasSor[],
): string {
  const cellak = (s: HarmasSor): string => {
    const aHtml = ertekHtml(ctx, s.a)
    const bHtml = ertekHtml(ctx, s.b)
    const megjelenitesiOsszeg = (): string => {
      const a = szamErtek(ctx.data, s.a)
      const b = szamErtek(ctx.data, s.b)
      return a === null && b === null ? '—' : fmtSzam((a ?? 0) + (b ?? 0))
    }
    let cHtml: string
    if (s.c) {
      cHtml = ertekHtml(ctx, s.c)
      // Üres „együtt" rovat kitöltött komponensek mellett (pl. régi snapshot,
      // vagy derive nélkül átadott adat): a MEGJELENÍTÉSI összeg (a + b) áll be
      // — ugyanaz a szabály, mint a tárolt c nélküli soroknál. Tárolt értéket
      // nem talál ki, csak aritmetikát mutat.
      if (cHtml === '—') cHtml = megjelenitesiOsszeg()
    } else {
      cHtml = megjelenitesiOsszeg()
    }
    return `<td class="szam">${aHtml}</td><td class="szam">${bHtml}</td><td class="szam">${cHtml}</td>`
  }
  const sorHtml = sorok
    .map(
      (s) => `<tr>
      <td class="sorszam">${esc(s.sorszam)}</td>
      <td class="megnevezes">${esc(s.label)}</td>
      ${cellak(s)}
    </tr>`,
    )
    .join('')
  return `${cim ? `<div class="alcim">${esc(cim)}</div>` : ''}<table class="t">
    <thead><tr><th></th><th></th><th class="szam">${esc(fejlec[0])}</th><th class="szam">${esc(fejlec[1])}</th><th class="szam">${esc(fejlec[2])}</th></tr></thead>
    <tbody>${sorHtml}</tbody>
  </table>`
}

/** Szövegblokk (rövid és hosszú szövegmezők) — üres mezőnél '—'. */
function szovegBlokk(ctx: RenderCtx, id: string): string {
  const mezo = MEZO_BY_ID.get(id)
  if (!mezo) return ''
  jelol(ctx, id)
  const ertek = mezoErtek(ctx.data, id)
  const szoveg = ertek === null || ertek === undefined ? '' : String(ertek).trim()
  const bekezdesek = szoveg
    ? szoveg
        .split('\n')
        .map((sor) => sor.trim())
        .filter((sor) => sor.length > 0)
        .map((sor) => `<p>${esc(sor)}</p>`)
        .join('')
    : '<p class="ures">—</p>'
  return `<div class="szoveg-blokk">
      <div class="blokk-cim">${esc(tetelSorszam(mezo))} ${esc(mezo.label)}</div>
      ${bekezdesek}
    </div>`
}

/** Az összefoglaló kártya egy cellája. */
function kartyaCella(ctx: RenderCtx, id: string, felirat: string, opts?: { elojel?: boolean }): string {
  const mezo = MEZO_BY_ID.get(id)
  if (!mezo) return ''
  jelol(ctx, id)
  const v = mezoErtek(ctx.data, id)
  let szoveg: string
  if (v === null || v === undefined || v === '') szoveg = '—'
  else if (typeof v === 'number') szoveg = `${opts?.elojel && v > 0 ? '+' : ''}${fmtSzam(v)}`
  else szoveg = esc(String(v))
  const egyseg = egysegFelirat(mezo)
  return `<div class="cella">
      <div class="ertek">${szoveg}${szoveg !== '—' && egyseg ? ` <span class="egyseg">${esc(egyseg)}</span>` : ''}</div>
      <div class="felirat">${esc(felirat)}</div>
    </div>`
}

// ---------------------------------------------------------------------------
// „Öt év tükrében" — többéves összevetés (a 2. lap alján, csak ha van adat)
// ---------------------------------------------------------------------------

/** Rövid nyomtatvány-feliratok a többéves táblához (csak megjelenítés). */
const OTEV_CIMKEK: Record<string, string> = {
  'I.10': 'Lélekszám (dec. 31.)',
  'I.2c': 'Keresztelt',
  'I.3c': 'Temetett',
  'II.1a': 'Vasárnap de. — alkalmak',
  'II.1b': 'Vasárnap de. — átlagjelenlét',
  'II.1c': 'Jelenlét a lélekszám %-ában',
  'II.12': 'Úrvacsoraosztások',
  'V.3': 'Katekézis-alkalmak',
  'III.7': 'Családlátogatások',
  'VII.1': 'Egyházfenntartói járulék (lej)',
  'VII.3': 'Perselypénz (lej)',
  'VII.8': 'Zárszámadási egyenleg (lej)',
}

/**
 * Az „Öt év tükrében" blokk: a LEGFELJEBB 5 korábbi VÉGLEGESÍTETT év + a
 * tárgyév összevető táblája és két mini-oszlopdiagram. Korábbi év adata
 * nélkül a blokk TELJESEN elmarad (nincs üres keret).
 */
function otEvTukreben(ctx: RenderCtx): string {
  const koradatok = (ctx.data.tobbEvesAdatok ?? []).slice(-5)
  if (koradatok.length === 0) return ''
  const evek = [...koradatok.map((k) => k.ev), ctx.data.ev]

  const sorErtek = (mezoId: string, ev: number): number | null => {
    if (ev === ctx.data.ev) return szamErtek(ctx.data, mezoId)
    return koradatok.find((k) => k.ev === ev)?.mezok[mezoId] ?? null
  }
  const fmtCell = (n: number | null): string =>
    n === null
      ? '<span class="ures">–</span>'
      : fmtSzam(Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10)

  const sorok = ADATLAP_MEZO_IDS.map((mezoId) => {
    const mezo = MEZO_BY_ID.get(mezoId)
    if (!mezo) return ''
    const cimke = OTEV_CIMKEK[mezoId] ?? `${mezo.label}${mezo.egyseg ? ` (${egysegFelirat(mezo)})` : ''}`
    const cellak = evek
      .map(
        (ev) =>
          `<td class="szam${ev === ctx.data.ev ? ' targyev' : ''}">${fmtCell(sorErtek(mezoId, ev))}</td>`,
      )
      .join('')
    return `<tr><td>${esc(cimke)}</td>${cellak}</tr>`
  }).join('')

  const pontok = (mezoId: string): AdatlapPont[] => evek.map((ev) => ({ ev, ertek: sorErtek(mezoId, ev) }))
  const grafikonok = [
    epitOszlopdiagram('Lélekszám alakulása', pontok('I.10'), 'fő'),
    epitOszlopdiagram('Vasárnap délelőtti átlagjelenlét', pontok('II.1b'), 'fő'),
  ].filter(Boolean)

  return `<div class="otev">
    <div class="alcim">Öt év tükrében — a korábbi véglegesített jelentések összevetése</div>
    <table class="otev-tabla">
      <thead><tr><th>Mutató</th>${evek
        .map((ev) => `<th class="szam${ev === ctx.data.ev ? ' targyev' : ''}">${ev}</th>`)
        .join('')}</tr></thead>
      <tbody>${sorok}</tbody>
    </table>
    ${grafikonok.length > 0 ? `<div class="otev-grafikonok">${grafikonok.map((g) => `<div>${g}</div>`).join('')}</div>` : ''}
    <p class="megjegyzes">A korábbi évek adatai a véglegesített jelentések befagyasztott értékei; a hiányzó rovat jele: –.</p>
  </div>`
}

// ---------------------------------------------------------------------------
// Lapok (2–6)
// ---------------------------------------------------------------------------

/** 2. lap — I. Lélekszám: kártya + háromoszlopos anyakönyvi tábla + öt év. */
function lapI(ctx: RenderCtx, oldalszam: number): string {
  const kartya = `<div class="alcim">Gyülekezetünk képe</div>
    <div class="kartya">
      ${kartyaCella(ctx, 'I.10', 'Lélekszám dec. 31-én')}
      ${kartyaCella(ctx, 'I.1', 'Lélekszám az előző év végén')}
      ${kartyaCella(ctx, 'I.8', 'Természetes szaporulat / apadás', { elojel: true })}
      ${kartyaCella(ctx, 'I.9', 'Általános szaporulat / apadás', { elojel: true })}
      ${kartyaCella(ctx, 'I.24', 'Átlagéletkor')}
      ${kartyaCella(ctx, 'I.25', 'Vallásórás korú (6–14 év)')}
      ${kartyaCella(ctx, 'I.26', 'IKE-korosztály (15–25 év)')}
      ${kartyaCella(ctx, 'I.11', 'Választói névjegyzékben')}
    </div>`

  const anyakonyv = harmasTabla(ctx, 'Anyakönyvi mozgások az évben', ['Férfi', 'Nő', 'Együtt'], [
    { sorszam: '2.', label: 'Keresztelésben részesült', a: 'I.2a', b: 'I.2b', c: 'I.2c' },
    { sorszam: '3.', label: 'Eltemettetett', a: 'I.3a', b: 'I.3b', c: 'I.3c' },
    { sorszam: '4.', label: 'Egyházunkba betért', a: 'I.4a', b: 'I.4b', c: 'I.4c' },
    { sorszam: '5.', label: 'Egyházunkból kitért', a: 'I.5a', b: 'I.5b', c: 'I.5c' },
    { sorszam: '6.', label: 'Beköltözött', a: 'I.6a', b: 'I.6b', c: 'I.6c' },
    { sorszam: '7.', label: 'Kiköltözött', a: 'I.7a', b: 'I.7b', c: 'I.7c' },
  ])

  const parok = `<div class="ket-oszlop">
    <div>${tetelTabla(ctx, 'Házasságkötés', [
      { id: 'I.16' },
      { id: 'I.17' },
    ])}</div>
    <div>${tetelTabla(ctx, 'Családok', [
      { id: 'I.12', label: 'Egyező vallású családok' },
      { id: 'I.13', label: 'Vegyes vallású családok' },
      { id: 'I.14', label: 'Özvegyek' },
      { id: 'I.15', label: 'Egyedülállók' },
    ])}</div>
  </div>`

  const tagsag = `<div class="ket-oszlop">
    <div>${tetelTabla(ctx, 'A gyülekezet tagsága', [
      { id: 'I.18' },
      { id: 'I.19' },
      { id: 'I.22' },
    ])}</div>
    <div>${tetelTabla(ctx, 'Egyházfenntartás, kettős tagság', [
      { id: 'I.23' },
      { id: 'I.20', label: '5+ éve egyházfenntartói járulékot nem fizetők' },
      { id: 'I.21', label: 'Az egyházfenntartás személyenkénti éves összege' },
    ])}</div>
  </div>`

  return `<section class="sheet">
      <div class="fejezet">${fejezetCim('I')}${kartya}${anyakonyv}${parok}${tagsag}${otEvTukreben(ctx)}</div>
      <div class="oldalszam">${oldalszam}</div>
    </section>`
}

/** 3. lap — II. Istentisztelet. */
function lapII(ctx: RenderCtx, oldalszam: number): string {
  interface ItSor {
    sorszam: string
    label: string
    a: string
    b: string
    c?: string
  }
  const itSorok: ItSor[] = [
    { sorszam: '1.', label: 'Közönséges vasárnap délelőtti istentisztelet', a: 'II.1a', b: 'II.1b', c: 'II.1c' },
    { sorszam: '2.', label: 'Közönséges vasárnap délutáni istentisztelet', a: 'II.2a', b: 'II.2b', c: 'II.2c' },
    { sorszam: '3.', label: 'Ünnepnapi istentisztelet', a: 'II.3a', b: 'II.3b', c: 'II.3c' },
    { sorszam: '4.', label: 'Sátoros ünnepi istentisztelet', a: 'II.4a', b: 'II.4b', c: 'II.4c' },
    { sorszam: '6.', label: 'Hétköznapi istentisztelet (rendszeres)', a: 'II.6a', b: 'II.6b' },
    { sorszam: '7.', label: 'Bűnbánati istentisztelet', a: 'II.7a', b: 'II.7b' },
    { sorszam: '8.', label: 'Bibliaóra (felnőtt + ifjúsági)', a: 'II.8a', b: 'II.8b' },
  ]
  const itTabla = `<div class="alcim">Istentiszteletek és bibliaórák</div>
    <table class="t">
      <thead><tr><th></th><th></th><th class="szam">Alkalmak</th><th class="szam">Átlagjelenlét</th><th class="szam">A lélekszám %-ában</th></tr></thead>
      <tbody>${itSorok
        .map(
          (s) => `<tr>
        <td class="sorszam">${esc(s.sorszam)}</td>
        <td class="megnevezes">${esc(s.label)}</td>
        <td class="szam">${ertekHtml(ctx, s.a)}</td>
        <td class="szam">${ertekHtml(ctx, s.b)}</td>
        <td class="szam${s.c ? '' : ' halvany'}">${s.c ? ertekHtml(ctx, s.c) : '·'}</td>
      </tr>`,
        )
        .join('')}</tbody>
    </table>`

  const satorosSor = (nev: string, i: string, ii: string, iii: string) =>
    `<tr><td class="sorszam"></td><td class="megnevezes">${esc(nev)}</td><td class="szam">${ertekHtml(ctx, i)}</td><td class="szam">${ertekHtml(ctx, ii)}</td><td class="szam">${ertekHtml(ctx, iii)}</td></tr>`
  const satoros = `<div class="alcim">Sátoros ünnepek — jelenlét naponként (fő)</div>
    <table class="t">
      <thead><tr><th></th><th></th><th class="szam">I. napja</th><th class="szam">II. napja</th><th class="szam">III. napja</th></tr></thead>
      <tbody>
        ${satorosSor('Karácsony', 'II.5a', 'II.5b', 'II.5g')}
        ${satorosSor('Húsvét', 'II.5c', 'II.5d', 'II.5h')}
        ${satorosSor('Pünkösd', 'II.5e', 'II.5f', 'II.5i')}
      </tbody>
    </table>`

  const egyeb = tetelTabla(ctx, 'További alkalmak', [
    { id: 'II.9' },
    { id: 'II.10' },
    { id: 'II.11' },
  ])

  const urvacsora = tetelTabla(ctx, 'Úrvacsora', [
    { id: 'II.12' },
    { id: 'II.13', label: 'Átlag úrvacsorázó alkalmanként — együtt' },
    { id: 'II.13a', label: 'ebből férfi', behuzas: true },
    { id: 'II.13b', label: 'ebből nő', behuzas: true },
    { id: 'II.14' },
  ])

  return `<section class="sheet">
      <div class="fejezet">${fejezetCim('II')}${itTabla}${satoros}<div class="ket-oszlop"><div>${egyeb}</div><div>${urvacsora}</div></div></div>
      <div class="oldalszam">${oldalszam}</div>
    </section>`
}

/** 4. lap — III. Gyülekezetgondozás + IV. Belmisszió. */
function lapIIIIV(ctx: RenderCtx, oldalszam: number): string {
  const bibliaorak = tetelTabla(ctx, 'Bibliaórák és rétegalkalmak', [
    { id: 'III.1' },
    { id: 'III.2' },
    { id: 'III.2b' },
    { id: 'III.2c' },
    { id: 'III.2d' },
    { id: 'III.2e', label: 'Más bibliaóra 1 — alkalmak' },
    { id: 'III.2f', label: 'Más bibliaóra 2 — alkalmak' },
    { id: 'III.16' },
    { id: 'III.17' },
    { id: 'III.18' },
  ])
  const alkalmak = tetelTabla(ctx, 'Gyülekezeti alkalmak, látogatások', [
    { id: 'III.3' },
    { id: 'III.4' },
    { id: 'III.5' },
    { id: 'III.6' },
    { id: 'III.7' },
    { id: 'III.8' },
  ])
  const presbiterium = tetelTabla(ctx, 'Presbitérium, közösség', [
    { id: 'III.9' },
    { id: 'III.10' },
    { id: 'III.11' },
    { id: 'III.12' },
  ])
  const szovegesek = tetelTabla(ctx, 'Vizitáció, kapcsolatok, fegyelem', [
    { id: 'III.13' },
    { id: 'III.14' },
    { id: 'III.15' },
  ])

  const iii = `${fejezetCim('III')}
    <div class="ket-oszlop">
      <div>${bibliaorak}</div>
      <div>${alkalmak}${presbiterium}</div>
    </div>
    ${szovegesek}`

  // IV. Belmisszió — kétoszlopos szövegrács; a IV.5/IV.6 (VBH / FIT7 — a
  // határidőnapló-javaslatok célmezői) az új elrendezésben is szerepel.
  const iv = `<div class="fejezet">${fejezetCim('IV')}
    <div class="ket-oszlop">
      <div>${szovegBlokk(ctx, 'IV.1')}${szovegBlokk(ctx, 'IV.3')}${szovegBlokk(ctx, 'IV.5')}</div>
      <div>${szovegBlokk(ctx, 'IV.2')}${szovegBlokk(ctx, 'IV.4')}${szovegBlokk(ctx, 'IV.6')}</div>
    </div>
  </div>`

  return `<section class="sheet">
      <div class="fejezet">${iii}</div>
      ${iv}
      <div class="oldalszam">${oldalszam}</div>
    </section>`
}

/** 5. lap — V. Vallásoktatás + VI. Szeretetszolgálat + VII. Anyagi helyzet. */
function lapVVIVII(ctx: RenderCtx, oldalszam: number): string {
  const vallasoktatas = tetelTabla(ctx, 'Vallásóra, katekézis', [
    { id: 'V.1' },
    { id: 'V.2' },
    { id: 'V.3' },
    { id: 'V.3b' },
    { id: 'V.9' },
    { id: 'V.10' },
  ])
  const konfirmacio = harmasTabla(ctx, 'Konfirmáció', ['Fiú', 'Lány', 'Együtt'], [
    { sorszam: '5.', label: 'Konfirmandusok I. év', a: 'V.5a', b: 'V.5b' },
    { sorszam: '6.', label: 'Konfirmandusok II. év', a: 'V.6a', b: 'V.6b' },
    { sorszam: '7.', label: 'Konfirmált az évben', a: 'V.7a', b: 'V.7b', c: 'V.7c' },
  ])
  const konfirmacioEgyeb = tetelTabla(ctx, null, [
    { id: 'V.4' },
    { id: 'V.8' },
  ])

  const v = `${fejezetCim('V')}
    <div class="ket-oszlop">
      <div>${vallasoktatas}</div>
      <div>${konfirmacio}${konfirmacioEgyeb}</div>
    </div>`

  const vi = `<div class="fejezet">${fejezetCim('VI')}
    ${szovegBlokk(ctx, 'VI.1')}
    ${tetelTabla(ctx, null, [{ id: 'VI.2' }])}
  </div>`

  const vii = `<div class="fejezet">${fejezetCim('VII')}
    <p class="megjegyzes">A fejezet számai a véglegesített Számadásból származnak, és azzal kötelezően egyeznek.</p>
    ${tetelTabla(ctx, null, [
      { id: 'VII.1' },
      { id: 'VII.2' },
      { id: 'VII.3' },
      { id: 'VII.4' },
      { id: 'VII.5' },
      { id: 'VII.6' },
      { id: 'VII.7' },
      { id: 'VII.8' },
      { id: 'VII.9', label: 'Kintlévőség (az egyházfenntartói járulék-hátralék nélkül)' },
      { id: 'VII.10' },
    ])}
  </div>`

  return `<section class="sheet">
      <div class="fejezet">${v}</div>
      ${vi}
      ${vii}
      <div class="oldalszam">${oldalszam}</div>
    </section>`
}

/** 6. lap — VIII. Ingatlanok + IX. Események + X. Missziói terv. */
function lapVIIIIXX(ctx: RenderCtx, oldalszam: number): string {
  return `<section class="sheet">
      <div class="fejezet">${fejezetCim('VIII')}${szovegBlokk(ctx, 'VIII.1')}${szovegBlokk(ctx, 'VIII.2')}</div>
      <div class="fejezet">${fejezetCim('IX')}${szovegBlokk(ctx, 'IX.1')}</div>
      <div class="fejezet">${fejezetCim('X')}${szovegBlokk(ctx, 'X.1')}</div>
      <!--KIEGESZITO-->
      <div class="oldalszam">${oldalszam}</div>
    </section>`
}

/**
 * A lefedettség-őr tartalék-táblája: a katalógus egyetlen, a fenti lapokra be
 * nem osztott mezője sem tűnhet el némán — ami kimaradt (jövőbeli append-only
 * bővítés), az itt, a záró lapon jelenik meg, teljes címkével.
 */
function kiegeszitoTetelek(ctx: RenderCtx, hianyzok: JelentesMezo[]): string {
  if (hianyzok.length === 0) return ''
  return tetelTabla(
    ctx,
    'Kiegészítő tételek',
    hianyzok.map((m) => ({ id: m.id, label: `${m.fejezet}. fejezet — ${m.label}` })),
  )
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

/**
 * A teljes hivatalos lelkészi jelentés önálló HTML-dokumentuma (címlap + 5
 * tartalmi lap, összesen 6 lap). Pure függvény — a hívó iframe srcDoc-ba
 * tölti és nyomtatja.
 */
export function buildLelkesziJelentesHtml(data: LelkesziJelentesData): string {
  const ctx: RenderCtx = { data, lefedett: new Set<string>() }

  const lapok = [
    cimlapHtml(data),
    lapI(ctx, 2),
    lapII(ctx, 3),
    lapIIIIV(ctx, 4),
    lapVVIVII(ctx, 5),
    lapVIIIIXX(ctx, 6),
  ]

  // LEFEDETTSÉG-ŐR: a be nem osztott katalógus-mezők a záró lap „Kiegészítő
  // tételek" táblájába kerülnek (a csere-string függvény, hogy a felhasználói
  // szövegben előforduló '$' minták ne értelmeződjenek csere-mintaként).
  const hianyzok = JELENTES_MEZOK.filter((m) => !ctx.lefedett.has(m.id))
  const kieg = kiegeszitoTetelek(ctx, hianyzok)
  lapok[lapok.length - 1] = lapok[lapok.length - 1].replace('<!--KIEGESZITO-->', () => kieg)

  // 2026-08-25 — LAPSZÁM-ŐR (élesben elsült hibaosztály: „a lelkészi jelentés
  // PDF mentése ÜRES dokumentumot hozott"). A print-engine-v2 laponkénti
  // (GPU-plafon-biztos) PDF-útja és a csonka-PDF-őre CSAK a body
  // `data-sheet-count` attribútumára kapcsol be — enélkül bármely laponkénti
  // render-hiba NÉMÁN a teljes-dokumentumos (egy-canvasos) tartalék útra esne,
  // ahol egy többlapos dokumentum canvasa a GPU textúra-plafon (~16 384 px)
  // fölé nőhet, és az eredmény hibaüzenet nélküli, fehér lapokból álló PDF.
  const lapszam = lapok.length

  const title = `Lelkészi jelentés ${data.ev} — ${data.congregationName}`
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${esc(title)}</title><style>${STYLES}</style></head><body data-sheet-count="${lapszam}">${lapok.join('')}</body></html>`
}
