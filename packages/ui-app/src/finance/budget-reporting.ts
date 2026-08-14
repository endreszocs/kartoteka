/**
 * Költségvetés / Számadás hivatalos nyomtatványok.
 *
 * A hivatalos minta (költségvetés_Minta.pdf, v7.4a) elrendezését követi:
 *  - tiszta, monokróm A4 álló űrlap (festéktakarékos, nincs színes kitöltés)
 *  - kétnyelvű oszlopok: Denumire (román) | Megnevezés (magyar)
 *  - Nr. rând / Sorszám · Capitol/subcapitol / Fejezet · Prevederi / Költségvetés
 *  - félkövér csoport- és összegsorok, jobbra igazított összegek
 *  - hivatalos aláírási blokk (Lelkipásztor, Főgondnok, Számvevő)
 */

// 2026-06-11 (Endre #4): az `apps/web/lib/finance/budget-reporting.ts`-ből
// költözött ide változatlan builder-logikával (web: re-export shim).
import type { SzamadasiCel, BudgetCompatRow, BudgetPrintType } from './types'

// ---------------------------------------------------------------------------
// Típusok
// ---------------------------------------------------------------------------


export interface BudgetPrintResult {
  title: string
  filename: string
  orientation: 'portrait' | 'landscape'
  html: string
  /** 2026-08-11 (6. kör): true → a nyomtatvány NEM adható ki (hiányzó/érvénytelen
   *  bemenet). A dialógus ilyenkor letiltja a Nyomtatás / PDF gombot, és a
   *  hiba-előnézetet mutatja. Fail-closed: hangos hiba > néma nulla. */
  blocked?: boolean
}

export const BUDGET_PRINT_TYPES: Array<{
  id: BudgetPrintType
  title: string
  subtitle: string
  description: string
}> = [
  {
    id: 'koltsegvetes',
    title: 'Költségvetés',
    subtitle: 'Végleges költségvetési terv',
    description: 'Az éves költségvetés hivatalos nyomtatványa az egyházmegye számára.',
  },
  {
    id: 'koltsegvetes_modositas',
    title: 'Költségvetés módosítás',
    subtitle: 'Módosított költségvetés',
    description: 'A költségvetés módosítás előző és módosított értékek összehasonlításával.',
  },
  {
    id: 'szamadas',
    title: 'Számadás',
    subtitle: 'Éves zárszámadás',
    description: 'A költségvetés és tényleges végrehajtás összehasonlítása a hivatalos formátumban.',
  },
  {
    id: 'reszszamadas',
    title: 'Részszámadás',
    subtitle: 'Időszaki kimutatás',
    description:
      'Egy választott időszak (negyedév, félév, dátumtól dátumig) pénzügyi kimutatása — presbiteri ülésre, vizitációra, belső ellenőrzésre. NEM az éves zárszámadás, és nem küldhető be helyette.',
  },
]

// ---------------------------------------------------------------------------
// Segédfüggvények
// ---------------------------------------------------------------------------

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function fmtNum(n: number): string {
  if (!n && n !== 0) return ''
  const parts = Math.abs(n).toFixed(2).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return (n < 0 ? '-' : '') + parts[0] + ',' + parts[1]
}

/** Egy szamadasicel román megnevezése (a `nevro` runtime-mező), magyar fallback. */
function roName(c: SzamadasiCel): string {
  const ro = (c as { nevro?: string | null }).nevro
  return ro && ro.trim() ? ro : c.nev
}

// ---------------------------------------------------------------------------
// Stílusok — tiszta, monokróm A4 álló (a hivatalos minta szerint)
// ---------------------------------------------------------------------------

function budgetStyles() {
  return `
    /* Pixelpontos A4: margó a lapon belül (padding), a lap mérete fix.
       A 296mm (nem 297) elkerüli a böngészők „üres extra oldal" hibáját. */
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', Georgia, serif; color: #111; margin: 0; }
    @media screen { body { background: #eef1f5; padding: 14px 0; } .page { box-shadow: 0 8px 30px rgba(15,23,42,.10); margin: 0 auto 14px; } }
    .page { width: 210mm; height: 296mm; background: #fff; padding: 10mm 9mm; position: relative; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }

    /* Borító */
    .cv-entity { font-weight: bold; font-size: 15px; letter-spacing: .4px; }
    .cv-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; font-size: 12px; }
    .cv-line { display: inline-block; min-width: 150px; border-bottom: 1px solid #111; }
    .cv-title { text-align: center; font-size: 23px; font-weight: bold; }
    .cv-title-ro { text-align: center; font-size: 14px; font-weight: bold; }
    .cv-note { font-size: 11px; color: #444; }
    .cv-ver { text-align: right; font-size: 10px; color: #888; }

    /* Táblázat — fix sormagasság, hogy oldalanként pontosan ismert számú sor férjen el */
    table.bt { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .bt th, .bt td { border: 1px solid #555; padding: 0.5mm 1.4mm; font-size: 8px; line-height: 1.1; vertical-align: middle; word-wrap: break-word; overflow: hidden; }
    .bt tbody tr { height: 6.4mm; }
    .bt th { font-weight: bold; font-size: 7.5px; text-align: center; line-height: 1.1; }
    .bt thead { display: table-header-group; }
    .bt tr, .bt td, .bt th { page-break-inside: avoid; }
    .bt .r { text-align: right; }
    .bt .c { text-align: center; }
    .bt .ro { color: #333; }
    .bt .grp td { font-weight: bold; }
    .bt .grp .name { text-align: center; }
    .bt .sec td { font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; }
    .bt .tot td { font-weight: bold; border-top: 2px solid #111; }

    /* Aláírások */
    .decl { margin-top: 14px; font-size: 11px; font-style: italic; line-height: 1.6; }
    .sig { display: flex; justify-content: space-between; gap: 26px; margin-top: 44px; font-size: 11px; }
    .sig .col { flex: 1; text-align: center; }
    .sig .label { color: #333; }
    .sig .line { border-top: 1px solid #111; margin-top: 32px; padding-top: 4px; font-weight: 600; }
    /* 2026-08-15: a román megnevezés a magyar alatt, halványabban (kétnyelvű ív) */
    .sig .line .ro { font-weight: normal; font-style: italic; font-size: 10px; color: #444; }
    .decl .ro { display: block; margin-top: 4px; font-size: 10px; color: #333; }
    .page-footer { position: absolute; bottom: 8mm; left: 12mm; right: 12mm; display: flex; justify-content: space-between; font-size: 9px; color: #9aa3af; }

    /* Részszámadás — MINDEN oldal tetején (a borító leválhat, a 2+ oldal
       különben megkülönböztethetetlen az éves Számadástól). */
    .pband { border: 1px solid #111; padding: 1.2mm 2mm; margin-bottom: 2mm; font-size: 9px; font-weight: bold; text-align: center; letter-spacing: .2px; }
    /* Egyeztető vonalak (rovancs) + lábjegyzetek */
    .recon { margin-top: 8px; font-size: 10px; line-height: 1.9; }
    .recon .ln { display: inline-block; min-width: 42mm; border-bottom: 1px solid #111; }
    .fnote { margin-top: 6px; font-size: 9px; line-height: 1.5; color: #333; }
    .fnote.warn { font-weight: bold; color: #111; border: 1px solid #111; padding: 1.2mm 2mm; }

    /* 2026-08-11 (6. kör, P1 #5): a "padding: 0" KIVÉVE a nyomtatási ágból.
       @page{margin:0} mellett a lap padding-je ADJA a margót — nullázva a keret
       és a szélső oszlopok levágódtak a papírról. A reporting.ts szándékosan
       megtartja a paddinget; a két fájl eddig ellentmondott egymásnak. */
    @media print { body { background: #fff; padding: 0; } .page { width: auto; min-height: auto; margin: 0; box-shadow: none; } }
  `
}

function wrapBudget(title: string, content: string) {
  // 2026-08-15: a body a VÁRT lapszámot hordozza (`data-sheet-count`). A PDF-motor
  // (apps/web/lib/utils/print-engine-v2.ts) ebből tudja, hogy hiánytalanul
  // betöltött-e a dokumentum: ha a DOM-ban kevesebb lap van, INKÁBB hangos hiba,
  // mint csonka hivatalos irat. Eddig csak a `.sheet`-es nyomtatványok kaptak
  // ilyen jelzést, a pénzügyi ívek (.page) nem — így egy félbeszakadt betöltés
  // némán rövidebb PDF-et adott volna.
  const lapszam = (content.match(/<div class="page/g) || []).length
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${budgetStyles()}</style></head><body data-sheet-count="${lapszam}">${content}</body></html>`
}

// ---------------------------------------------------------------------------
// Adatok
// ---------------------------------------------------------------------------

/**
 * 2026-08-11 (6. kör): a `computePeriodBalances` (@kartoteka/core) eredményének
 * SZERKEZETI mása. SZÁNDÉKOSAN nem import: ez a fájl futásidejű import nélkül
 * transpile-olható kell maradjon (`scripts/selftest-reszszamadas.mjs` önállóan
 * fordítja, hogy az évazonosságot bizonyítsa).
 */
export interface BudgetPeriodAccount {
  opening: number
  net: number
  closing: number
}
export interface BudgetPeriodBalances {
  year: number
  periodFrom: string
  periodTo: string
  cash: BudgetPeriodAccount
  bankById: Record<number, BudgetPeriodAccount>
  bank: BudgetPeriodAccount
  total: BudgetPeriodAccount
  reconcileDelta: number
  movementCount: number
}

export interface BudgetPrintData {
  cellek: SzamadasiCel[]
  budgetRows: Record<string, BudgetCompatRow>
  actualIncome?: Record<string, number>
  actualExpense?: Record<string, number>
  congregationName: string
  /** 2026-08-15 (Endre): a gyülekezet hivatalos ROMÁN neve (nev_ro) — a
   *  nyomtatvány-fejlécek a beállításokban rögzített SAJÁT neveket írják ki,
   *  nem sablonszöveget. */
  congregationNameRo?: string | null
  year: number
  iktatoszam?: string
  hatarozatSzam?: string
  hatarozatDatum?: string
  modNumber?: number
  carryoverCash?: number
  carryoverBank?: number
  periodFrom?: string
  periodTo?: string

  // ── 2026-08-14 (K2): a hivatalos 113–134. záró blokk adatai ─────────────
  /** Év végi KÉSZPÉNZ egyenleg (114. sor). Ha nincs, a papíron „—" áll. */
  zaroCasa?: number
  /** Év végi BANKI egyenleg (115. sor). Ha nincs, a papíron „—" áll. */
  zaroBanca?: number
  /** Tartozások (Datorii) — hivatalos sorszám (117–127) → összeg. Hiányzó sor = 0. */
  tartozasok?: Record<number, number>
  /** Kintlévőségek (Creanțe) — hivatalos sorszám (129–133) → összeg. Hiányzó sor = 0. */
  kintlevosegek?: Record<number, number>
  /** Véglegesítve van-e (költségvetés/számadás). Csak ekkor jelenik meg a
   *  presbitériumi határozat + egyházközségi iktatószám a nyomtatványon. */
  finalized?: boolean

  // ── Részszámadás (2026-08-11, 6. kör) ──────────────────────────────────
  /** Az IDŐSZAKRA levezetett nyitó/záró egyenlegek. Részszámadáshoz KÖTELEZŐ —
   *  enélkül a nyomtatvány `blocked`. */
  periodBalances?: BudgetPeriodBalances
  /** true → részszámadás-alak (időszak-sáv, más fejléc, nincs Számvevő-oszlop). */
  partial?: boolean
  /** A nyitó egyenleg LEVEZETETT, rögzített bázis nélkül → lábjegyzet a papíron. */
  nyitoBizonytalan?: boolean
  /** Devizás számlák neve az időszakban → RON-ekvivalens lábjegyzet. */
  devizaSzamlak?: string[]
  /** „Készült" dátum a részszámadás borítóján (ISO vagy már formázott). */
  keszult?: string
}

// ---------------------------------------------------------------------------
// A HIVATALOS ÍV SORAI — EGYETLEN forrás a nyomtatványnak ÉS a képernyőnek
// ---------------------------------------------------------------------------
//
// 2026-08-11 (6. kör, TULAJDONOSI DÖNTÉS — Endre, lelkipásztor, aki maga adja
// be ezeket az íveket):
//
//   1) A hivatalos GYÜLEKEZETI Számadás- és Költségvetés-ív TARTALMAZZA az
//      egyházmegyei szintűnek jelölt kódokat is (201.15 Nettó fizetések,
//      201.17 CAS, 206.02 Biztosítások, 101.07, 105.03, 106.02–106.06 …).
//      Ezek SOROKKÉNT rajta vannak a papíron.
//   2) DE a gyülekezet ezekre nem könyvelhet és nem is módosíthatja őket —
//      azokat az egyházmegye tölti ki.
//
// MI VOLT A HIBA: a nyomtatvány (ez a fájl) sosem szűrt `szint` szerint, az
// `AccountingTab` és a `BudgetTab` viszont IGEN (`isGyulekezetSzint`). Ezért az
// ilyen kódra könyvelt pénz a KINYOMTATOTT végösszegben benne volt, a KÉPERNYŐN
// látható végösszegben nem — ugyanarra az évre két, egymásnak ellentmondó szám,
// és az egyik alá is van írva. A szűrő rossz felületen ült: a
// `penzugy/actions.ts` kommentárja szerint oda való, „ahol a lelkész ÚJ TÉTELT
// VÁLASZT (pl. budget-tab, accounting-tab)" — csakhogy az a két fül ŰRLAP-NÉZET,
// nem kategóriaválasztó. A valódi választók a befizetescel/kiadascel junction
// táblákon át mennek (`isGyulekezetiKonyvelhetoKod`, lásd `types.ts`), és azok
// TOVÁBBRA IS kizárják ezeket a kódokat — a 2) pont tehát sértetlen.
//
// Ezért a sor-tagság mostantól ITT, egy helyen dől el, és a képernyő ugyanezt
// a függvényt hívja. Ha valaki valaha visszatenné a szint-szűrést az egyik
// oldalra, a `scripts/selftest-reszszamadas.mjs` elbukik.

/** A `szamadasicel.szint` lehetséges értékei (a hiány = gyülekezeti, kompat.). */
export type SzamadasSzint = 'gyulekezet' | 'egyhazmegye' | 'kerulet' | null | undefined

/**
 * A hivatalos ív SORA-e ez a kód?
 *   - bevétel: 1xx, DE a teljes 100-as fejezet nélkül (100 / 100.01 / 100.02 /
 *     100.51 / 100.52 = nyitó pénztármaradvány és legacy belső mozgás — a nyitó
 *     a táblázat 1–3. sorában, külön blokként szerepel, a belső átvezetés pedig
 *     sosem számadási tétel),
 *   - kiadás: 2xx.
 * `szint` szerint SZÁNDÉKOSAN nem szűr — lásd a fenti tulajdonosi döntést.
 *
 * 2026-08-11 (6. kör): a bevételi ág korábban `c.id !== '100'`-at nézett, tehát
 * a 100.01/100.02 LEVÉL-sorok kikerültek a papírra — összeggel —, miközben a
 * végösszegbe nem számítottak bele (a `groupsOf` a '100' csoportot nem találta).
 * Vagyis a nyomtatványon állt egy sor, aminek a pénze sehol nem jött ki az
 * összesítésben. A képernyő már a szigorúbb (helyes) szabályt használta; most a
 * kettő egy és ugyanaz.
 */
export function isSzamadasIvKod(kod: string, type: 'B' | 'K'): boolean {
  if (!kod) return false
  if (kod === '100' || kod.startsWith('100.')) return false
  return type === 'B' ? kod.startsWith('1') : kod.startsWith('2')
}

/** A hivatalos ív cellái típusonként, a papír sorrendjében (csoport a levelei elé). */
export function szamadasIvCellak<T extends { id: string; type: 'B' | 'K' }>(
  cellek: T[],
  type: 'B' | 'K',
): T[] {
  return cellek
    .filter((c) => c.type === type && isSzamadasIvKod(c.id, type))
    .sort((a, b) => cmpId(a.id, b.id))
}

/**
 * A hivatalos ív VÉGPONT (levél) kódjai — ezekre lehet tényleges összeg.
 * A csoport-sorok (101, 206 …) számított összegek, rájuk nem könyvelünk.
 * Ez a készlet adja a Számadás tény-oszlopát ÉS a beküldött pillanatképet is.
 */
export function szamadasIvLevelKodok(
  cellek: Array<{ id: string; type: 'B' | 'K' }>,
  type: 'B' | 'K',
): string[] {
  return szamadasIvCellak(cellek, type)
    .filter((c) => c.id.includes('.'))
    .map((c) => c.id)
}

/** Kódonkénti tény-térkép összegzése a megadott levél-kódokra (hiányzó = 0). */
export function osszegezLevelek(
  leafKodok: string[],
  byCode: Record<string, number> | undefined,
): number {
  if (!byCode) return 0
  return leafKodok.reduce((sum, kod) => sum + (byCode[kod] || 0), 0)
}

/**
 * Szerkesztheti-e a GYÜLEKEZET ezt az ív-sort?
 *
 * A sor RAJTA van a gyülekezeti íven (ezért látszik), de az egyházmegyei/
 * kerületi szintűt az egyházmegye tölti ki: a gyülekezet nem írhat bele
 * költségvetési összeget, és tételt sem társíthat rá. A már tárolt értéket
 * viszont NEM dobjuk el — read-only módon megjelenítjük.
 */
export function gyulekezetSzerkesztheti(szint: SzamadasSzint): boolean {
  return !szint || szint === 'gyulekezet'
}

/** Kódok hierarchikus rendezése: 101 < 101.01 < 101.02 < 102 (csoport a része elé). */
function cmpId(a: string, b: string): number {
  const pa = a.split('.').map((x) => Number(x))
  const pb = b.split('.').map((x) => Number(x))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = i < pa.length ? pa[i] : -1
    const y = i < pb.length ? pb[i] : -1
    if (x !== y) return x - y
  }
  return 0
}

function getVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.tervezett || 0
}
function getModVal(data: BudgetPrintData, celId: string): number {
  return data.budgetRows[celId]?.modositott || 0
}
function getActual(data: BudgetPrintData, celId: string): number {
  const cel = data.cellek.find((c) => c.id === celId)
  if (!cel) return 0
  if (cel.type === 'B') return data.actualIncome?.[celId] || 0
  return data.actualExpense?.[celId] || 0
}
function sumGroup(data: BudgetPrintData, groupId: string, getter: (d: BudgetPrintData, id: string) => number): number {
  const prefix = groupId + '.'
  return data.cellek.filter((c) => c.id.startsWith(prefix)).reduce((sum, c) => sum + getter(data, c.id), 0)
}

type BudgetMode = 'single' | 'modification' | 'szamadas'
const valueColCount = (mode: BudgetMode) => (mode === 'modification' ? 3 : mode === 'szamadas' ? 2 : 1)
const totalCols = (mode: BudgetMode) => 4 + valueColCount(mode) // 2 név + sorszám + fejezet + értékek

// ---------------------------------------------------------------------------
// Belépési pontok
// ---------------------------------------------------------------------------

export function buildBudgetReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data
  // 2026-07-10 (#2): a hivatalos forma 1–3. sora a nyitó egyenleg.
  const rows = collectBudgetRows(data, 'single', { openingRows: true })
  const terv = tervezOldalak(rows.length, true, false)
  const total = 1 + terv.pages
  const coverPage = buildCoverPage(data, 'KÖLTSÉGVETÉS', 'BUGET DE VENITURI ȘI CHELTUIELI', null, total)
  const tablePages = renderTablePages(data, 'single', rows, { startPage: 2, total, terv, withSignatures: true })
  return {
    title: `Költségvetés ${year}`,
    filename: `Koltsegvetes_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Költségvetés ${year}`, coverPage + tablePages),
  }
}

export function buildBudgetModificationReport(data: BudgetPrintData): BudgetPrintResult {
  const { year, modNumber } = data
  const modLabel = modNumber || 1
  // 2026-08-14 (K2): a hivatalos ív szerint a MÓDOSÍTÁS is ugyanazt az 1–134
  // számozást viseli, az 1–3. nyitósorral EGYÜTT — korábban a nyitóblokk
  // kimaradt, és a számozás további 3-mal csúszott a Költségvetéshez képest.
  const rows = collectBudgetRows(data, 'modification', { openingRows: true })
  const terv = tervezOldalak(rows.length, true, false)
  const total = 1 + terv.pages
  const coverPage = buildCoverPage(data, `${modLabel}. KÖLTSÉGVETÉS-MÓDOSÍTÁS`, 'MODIFICARE BUGET DE VENITURI ȘI CHELTUIELI', modLabel, total)
  const tablePages = renderTablePages(data, 'modification', rows, { startPage: 2, total, terv, withSignatures: true })
  return {
    title: `${modLabel}. Költségvetés módosítás ${year}`,
    filename: `Koltsegvetes_modositas_${modLabel}_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`${modLabel}. Költségvetés módosítás ${year}`, coverPage + tablePages),
  }
}

export function buildSzamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year } = data
  // 2026-07-10 (#2): a hivatalos forma 1–3. sora a nyitó egyenleg.
  const rows = collectBudgetRows(data, 'szamadas', { openingRows: true })
  // ── 2026-08-15 (Endre kifejezett döntése): a 113–134. záró blokk LEKERÜLT ──
  // A hivatalos ív Tartozások/Kintlévőségek záró tábláját (113–134. sor) Endre
  // — a „visszaküldhető számadás" szakmai figyelmeztetés ismeretében — kivetette
  // a nyomtatványról: a gyakorlatban csupa nulla sort adott, és külön
  // táblázatnak látszott. Az ADAT-ÚT ép marad: a bealitas.szamadas_tartozasok a
  // lelkészi jelentés VII. fejezetét továbbra is táplálja, és a blokk a git-
  // történetből visszahozható, ha az esperesi hivatal mégis kérné.
  //
  // A tartalék így már csak a nyilatkozat (~5 sor-egyenérték) + aláírások:
  // a teljes Számadás célja Endre kérésére LEGFELJEBB 4 OLDAL (borítóval).
  const terv = tervezOldalak(rows.length, true, false, 5)
  const total = 1 + terv.pages
  const coverPage = buildCoverPage(data, 'SZÁMADÁS', 'EXECUȚIA BUGETARĂ', null, total)
  const declaration = `<div class="decl">Alulírott lelkipásztor és főgondnok felelősségünk tudatában nyilatkozzuk, hogy a számadás adatai valósak és az egyházi rendelkezések szerint készült el.<span class="ro">Subsemnații, preotul și curatorul principal, declarăm pe propria răspundere că datele prezentei execuții bugetare sunt reale și au fost întocmite conform reglementărilor bisericești.</span></div>`
  const lastExtraHtml = declaration
  const tablePages = renderTablePages(data, 'szamadas', rows, { startPage: 2, total, terv, withSignatures: true, lastExtraHtml })
  return {
    title: `Számadás ${year}`,
    filename: `Szamadas_${year}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Számadás ${year}`, coverPage + tablePages),
  }
}

function formatHuDate(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Hiba-„nyomtatvány": a Print/PDF gomb letiltásához (`blocked`). */
function blockedReport(title: string, message: string): BudgetPrintResult {
  return {
    title,
    filename: 'reszszamadas.pdf',
    orientation: 'portrait',
    blocked: true,
    html: `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:640px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}
      p{font-size:14px;line-height:1.65;margin:0 0 10px}
      .small{font-size:12px;color:#444}
    </style></head><body><div class="box">
      <h1>A részszámadás így nem nyomtatható ki</h1>
      <p>${esc(message)}</p>
      <p class="small">Ez a nyomtatvány szándékosan nem készül el hiányos vagy ellentmondó adatból: egy hamis
      záró egyenleg aláírt papíron rosszabb, mint a hiányzó nyomtatvány.</p>
    </div></body></html>`,
  }
}

/** Rövid, magyar időszak-címke a fejléc-oszlophoz: „01.01–06.30". */
function shortPeriodLabel(from: string, to: string): string {
  return `${from.slice(5).replace('-', '.')}–${to.slice(5).replace('-', '.')}`
}

export function buildReszszamadasReport(data: BudgetPrintData): BudgetPrintResult {
  const { year, periodFrom, periodTo } = data

  // ── Fail-closed kapu ─────────────────────────────────────────────────────
  // A részszámadás minden száma az IDŐSZAKI nyitóból vezetődik le. Ha az
  // időszak érvénytelen vagy a levezetés hiányzik, NEM nyomtatunk „valamit".
  if (!periodFrom || !periodTo || !ISO_DAY_RE.test(periodFrom) || !ISO_DAY_RE.test(periodTo)) {
    return blockedReport(
      'Részszámadás — hiányzó időszak',
      'Add meg az időszak kezdő és záró dátumát (ÉÉÉÉ-HH-NN alakban).',
    )
  }
  if (periodFrom.slice(0, 4) !== String(year) || periodTo.slice(0, 4) !== String(year)) {
    return blockedReport(
      'Részszámadás — érvénytelen időszak',
      `A részszámadás időszaka nem nyúlhat át az évhatáron. Ha az elszámolás átnyúlik, nyomtass két részszámadást: a második nyitója pontosan az első zárója lesz.`,
    )
  }
  if (periodFrom > periodTo) {
    return blockedReport(
      'Részszámadás — érvénytelen időszak',
      'A kezdő dátum későbbi, mint a záró dátum.',
    )
  }
  const pb = data.periodBalances
  if (!pb) {
    return blockedReport(
      'Részszámadás — hiányzó egyenleg-levezetés',
      'Az időszaki nyitó és záró egyenleg nem áll rendelkezésre (a nyitó egyenlegek feloldása nem sikerült). Nyisd meg a Pénzügy oldalt, ellenőrizd a nyitó egyenlegeket, majd próbáld újra.',
    )
  }

  const fromLabel = formatHuDate(periodFrom)
  const toLabel = formatHuDate(periodTo)
  const partial = { fromLabel, toLabel, periodLabel: shortPeriodLabel(periodFrom, periodTo) }
  // A `partial` jelzőt itt tesszük rá (nem a hívóra bízzuk): a lábléc és az
  // időszak-sáv ettől függ, és egy elfelejtett prop néma éves-alakot adna.
  data = { ...data, partial: true }

  const rows = collectBudgetRows(data, 'szamadas', {
    opening: {
      total: pb.total.opening,
      cash: pb.cash.opening,
      bank: pb.bank.opening,
      labelRo: 'Disponibil la începutul perioadei',
      labelHu: 'Nyitó pénzkészlet az időszak elején',
    },
  })
  // ── 2026-08-15 (Endre): a KÜLÖN BORÍTÓ-OLDAL MEGSZŰNT ─────────────────────
  // A részszámadás BELSŐ kimutatás — a korábbi, majdnem üres borító egy teljes
  // lapot foglalt, és a teljes irat így nem fért bele Endre 4 oldalas keretébe.
  // A borító tartalma (gyülekezet hivatalos nevei, cím, időszak, „Készült")
  // kompakt fejlécként az 1. lap tetejére került; a helyét a terv
  // `elsoFoglalt` sor-egyenértéke tartja fenn, így a tördelés nem csúszhat el.
  // Az egyházmegyei blokk és a presbitériumi határozat továbbra sincs rajta
  // (mindkettő arra hívna, hogy ezt a papírt iktassák/beküldjék).
  const KOMPAKT_FEJLEC_SOR = 8
  const kompaktFejlec = `<div style="margin-bottom:4mm;">
    <div class="cv-entity" style="text-align:center;">${hivatalosEntitasNev(data)}</div>
    <div style="text-align:center;font-size:16px;font-weight:bold;margin-top:3mm;">RÉSZSZÁMADÁS — időszaki kimutatás</div>
    <div style="text-align:center;font-size:11px;font-weight:bold;">SITUAȚIE FINANCIARĂ PARȚIALĂ</div>
    <div style="text-align:center;font-size:11px;margin-top:2mm;">a ${year}. év ${esc(fromLabel)} — ${esc(toLabel)} időszakára / pe perioada ${esc(fromLabel)} — ${esc(toLabel)} a anului ${year}</div>
    ${data.keszult ? `<div style="text-align:center;font-size:9px;color:#444;margin-top:1mm;">Készült / Întocmit: ${esc(data.keszult)} · a könyvelés aznapi állása szerint / conform situației contabile din ziua respectivă</div>` : ''}
  </div>`
  const terv = tervezOldalak(rows.length, true, true, 6, true, KOMPAKT_FEJLEC_SOR)
  const total = terv.pages
  const declaration = `<div class="decl">Alulírottak nyilatkozzuk, hogy a fenti időszak adatai a könyvelés mai állása szerint valósak. Ez a kimutatás <strong>NEM az éves zárszámadás</strong>, és az egyházmegyének nem küldhető be helyette.<span class="ro">Subsemnații declarăm că datele perioadei de mai sus sunt reale conform situației contabile de astăzi. Această situație <strong>NU este execuția bugetară anuală</strong> și nu poate fi înaintată protopopiatului în locul acesteia.</span></div>`
  const lastExtraHtml = buildReszszamadasExtraRows(data, partial) + declaration
  const tablePages = renderTablePages(data, 'szamadas', rows, {
    startPage: 1,
    total,
    terv,
    withSignatures: true,
    withAuditor: false, // az ellenőrző bizottság az ÉVES számadást hitelesíti
    lastExtraHtml,
    firstExtraHtml: kompaktFejlec,
    partial,
  })
  return {
    title: `Részszámadás ${year} (${fromLabel} – ${toLabel})`,
    filename: `Reszszamadas_${year}_${periodFrom}_${periodTo}.pdf`,
    orientation: 'portrait',
    html: wrapBudget(`Részszámadás ${year}`, tablePages),
  }
}

// ---------------------------------------------------------------------------
// Borító oldal — a minta szerinti tiszta elrendezés
// ---------------------------------------------------------------------------

function footer(data: BudgetPrintData, pageNo: number, total: number): string {
  // 2026-08-11 (6. kör): részszámadáson a lábléc is kimondja, mi ez a papír —
  // a borító leválhat, a táblázatoldalak különben megkülönböztethetetlenek.
  // 2026-08-15 (Endre): a lábléc is kétnyelvű — a lapszám és a részszámadás-jelzés is.
  const kind = data.partial
    ? ' · Részszámadás — nem hivatalos zárszámadás / Situație parțială — nu este execuție bugetară oficială'
    : ''
  return `<div class="page-footer"><span>${esc(data.congregationName)}${kind}</span><span>oldal / pagina ${pageNo} / ${total}</span></div>`
}

/**
 * 2026-08-15 (Endre): a nyomtatvány-fejléc a gyülekezet SAJÁT hivatalos neveit
 * írja ki NAGYBETŰVEL — „BARÁTOSI REFORMÁTUS EGYHÁZKÖZSÉG / PAROHIA REFORMATA
 * BRATES" —, nem a korábbi sablonszöveget („REFORMÁTUS EGYHÁZKÖZSÉG / PAROHIA
 * REFORMATĂ + név"). Mindkét név a Gyülekezet beállítása ablakból jön
 * (congregations.name + nev_ro); ha a román név nincs kitöltve, csak a magyar
 * jelenik meg — sablon-kiegészítés nélkül.
 */
function hivatalosEntitasNev(data: BudgetPrintData): string {
  const hu = (data.congregationName || '').toLocaleUpperCase('hu-HU')
  const ro = (data.congregationNameRo || '').trim().toLocaleUpperCase('ro-RO')
  return ro ? `${esc(hu)} / ${esc(ro)}` : esc(hu)
}

interface CoverOpts {
  /** Kihagyja az egyházmegyei iktató/esperes blokkot (belső kimutatásnál). */
  skipDiocese?: boolean
  /** Kihagyja a presbitériumi határozat sort + a „nincs véglegesítve" figyelmeztetést. */
  skipHatarozat?: boolean
  /** Semleges „Készült" sor a határozat helyett. */
  keszult?: string
  /** Teljesen lecseréli a két címsort (nem az „X A 2026. ÉVRE" mintát követi). */
  titleOverride?: { hu: string; ro: string }
  /** A cím alatti magyarázó sor (pl. az időszak). */
  subTitle?: string
}

function buildCoverPage(
  data: BudgetPrintData,
  titleHu: string,
  titleRo: string,
  modNumber: number | null,
  total: number,
  periodLine?: string,
  opts?: CoverOpts,
): string {
  const { year, iktatoszam, hatarozatSzam, hatarozatDatum } = data
  // A presbitériumi határozat + egyházközségi iktatószám CSAK véglegesítés után
  // jelenik meg (előtte üres vonal — a minta szerint kézzel/utólag töltik ki).
  const fin = data.finalized === true
  const iktato = fin ? esc(iktatoszam || '') : ''
  const hatDatum = fin ? esc(hatarozatDatum || '') : ''
  const hatSzam = fin ? esc(hatarozatSzam || '') : ''
  const dioceseBlock = opts?.skipDiocese
    ? ''
    : `<div style="margin-top:8mm;">
      <div class="cv-entity">REFORMÁTUS EGYHÁZMEGYE / PROTOPOPIATUL REFORMAT</div>
      <div class="cv-row">
        <div>Egyházmegyei iktatószám / Nr. înreg. protopopiat: <span class="cv-line">&nbsp;</span></div>
        <div>Esperes aláírása / Semnătura protopopului: <span class="cv-line">&nbsp;</span></div>
      </div>
    </div>`
  const titleBlock = opts?.titleOverride
    ? `<div class="cv-title">${esc(opts.titleOverride.hu)}</div>
      <div class="cv-title-ro">${esc(opts.titleOverride.ro)}</div>`
    : `<div class="cv-title">${esc(titleHu)} A ${year}. ÉVRE</div>
      <div class="cv-title-ro">${esc(titleRo)} PE ANUL ${year}</div>`
  const hatarozatBlock = opts?.skipHatarozat
    // 2026-08-14 (14. pont): a „Belső használatra — az egyházmegyének NEM
    // beküldendő." felirat a felhasználó kérésére eltávolítva a borítóról.
    // A részszámadás nem-hivatalos jellegét továbbra is jelzi a nyilatkozat
    // (:504), a lábléc („· Részszámadás — nem hivatalos zárszámadás") és a
    // képernyős figyelmeztetés a nyomtatási központban.
    ? `<div style="margin-top:40mm;text-align:center;font-size:11px;">
      Készült: ${esc(opts.keszult || '')} · a könyvelés aznapi állása szerint.
      <div style="font-size:10px;color:#333;margin-top:3px;">Întocmit: ${esc(opts.keszult || '')} · conform situației contabile din ziua respectivă.</div>
    </div>`
    : `<div style="margin-top:40mm;text-align:center;font-size:12px;">
      Tárgyalta és jóváhagyta a presbitérium a <span class="cv-line">&nbsp;${hatDatum}</span> tartott gyűlésén
      <span class="cv-line" style="min-width:90px;">&nbsp;${hatSzam}</span> szám alatt.
      <div style="font-size:10px;color:#333;margin-top:3px;">Dezbătut și aprobat de consiliul parohial în ședința din data de mai sus, sub numărul indicat.</div>
    </div>

    ${fin ? '' : `<div style="margin-top:8mm;text-align:center;font-size:10px;font-style:italic;color:#9a3412;">Nincs véglegesítve — a presbitériumi határozat és az egyházközségi iktatószám a véglegesítés után kerül a nyomtatványra.<br>Nefinalizat — hotărârea consiliului parohial și numărul de înregistrare apar pe formular după finalizare.</div>`}`
  return `<div class="page cover">
    ${dioceseBlock}

    <div style="margin-top:16mm;">
      <div class="cv-entity">${hivatalosEntitasNev(data)}</div>
      <div class="cv-row">
        <div>Egyházközségi iktatószám / Nr. înreg. parohie: <span class="cv-line">&nbsp;${iktato}</span></div>
      </div>
    </div>

    <div style="margin-top:46mm;">
      ${titleBlock}
    </div>

    ${opts?.subTitle ? `<div style="text-align:center;font-size:14px;font-weight:bold;margin-top:6mm;">${esc(opts.subTitle)}</div>` : ''}
    ${periodLine ? `<div style="text-align:center;font-size:12px;font-weight:bold;margin-top:18mm;">${esc(periodLine)}</div>` : ''}
    ${modNumber ? `<div style="text-align:center;font-size:11px;margin-top:8mm;">A korábbi költségvetést módosító ${modNumber}. számú módosítás.<div style="font-size:10px;color:#333;margin-top:3px;">Modificarea nr. ${modNumber} a bugetului aprobat anterior.</div></div>` : ''}

    ${hatarozatBlock}

    <div style="position:absolute;bottom:14mm;left:12mm;">
      <div class="cv-note">Kitöltendő lejben</div>
      <div class="cv-note">Se completează în lei</div>
    </div>
    <div style="position:absolute;bottom:14mm;right:12mm;" class="cv-ver">v 7.4a</div>
    ${footer(data, 1, total)}
  </div>`
}

// ---------------------------------------------------------------------------
// Fő adattábla
// ---------------------------------------------------------------------------

/** 2026-08-11 (6. kör): részszámadásnál a fejléc KIMONDJA, hogy a tény-oszlop
 *  csak az időszaké — az éves fejléccel bitre azonos oszlopcím volt az egyik
 *  oka, hogy a részszámadás megkülönböztethetetlen volt az éves zárszámadástól. */
function valueHeads(mode: BudgetMode, partial?: PartialInfo): string {
  if (mode === 'modification') {
    return `<th>Prevederi inițial<br>Előző</th><th>Modificare<br>Módosítás</th><th>Prevederi final<br>Végleges</th>`
  }
  if (mode === 'szamadas') {
    if (partial) {
      return `<th>Prevederi anuale<br>ÉVES költségvetés</th><th>Execuție parțială<br>Időszaki teljesítés<br>(${esc(partial.periodLabel)})</th>`
    }
    return `<th>Prevederi<br>Költségvetés</th><th>Execuție<br>Számadás</th>`
  }
  return `<th>Prevederi<br>Költségvetés</th>`
}

function valueCells(data: BudgetPrintData, c: SzamadasiCel, isGroup: boolean, mode: BudgetMode): string {
  const val = isGroup ? sumGroup(data, c.id, getVal) : getVal(data, c.id)
  if (mode === 'modification') {
    const modVal = isGroup ? sumGroup(data, c.id, getModVal) : getModVal(data, c.id)
    const finalVal = modVal || val
    return `<td class="r">${fmtNum(val)}</td><td class="r">${fmtNum(modVal - val)}</td><td class="r">${fmtNum(finalVal)}</td>`
  }
  if (mode === 'szamadas') {
    const actual = isGroup ? sumGroup(data, c.id, getActual) : getActual(data, c.id)
    return `<td class="r">${fmtNum(val)}</td><td class="r">${fmtNum(actual)}</td>`
  }
  return `<td class="r">${fmtNum(val)}</td>`
}

// ─── 2026-08-14 (K2, BLOKKOLÓ-javítás): a HIVATALOS, FIX Nr. rând katalógus ──
//
// A hivatalos Adatok_2026.xlsx `Szamadas` lapja FIX 1–134 sorszámot használ
// (D oszlop), amelyben az összesítő sorok (36, 41, 52, 95, 99–101, 112) is
// SAJÁT számot viselnek. A korábbi futó számláló (`n++`) emiatt a 105-ös
// csoporttól kezdve elcsúszott, és 101 számozott sorból 69 ROSSZ számot kapott —
// a lelkészi jelentés VIII. fejezetének mindhárom hivatkozott sora (66., 97.,
// 98.) is. A számozás mostantól ebből a fix katalógusból jön; ismeretlen kódra
// „—" kerül (nem tolja el a többit).
//
// A katalógus GÉPI kinyerés a hivatalos lap D+E oszlopából (2026-08-14) —
// kézzel NE szerkeszd, a hivatalos ív változásakor újra kinyerendő.
const HIVATALOS_NR_RAND: Record<string, number> = {
  '101': 4, '101.01': 5, '101.02': 6, '101.03': 7, '101.04': 8, '101.05': 9,
  '101.06': 10, '101.07': 11, '101.08': 12,
  '102': 13, '102.01': 14, '102.02': 15, '102.03': 16, '102.04': 17, '102.05': 18, '102.06': 19,
  '103': 20, '103.01': 21, '103.02': 22, '103.03': 23, '103.04': 24, '103.05': 25,
  '103.06': 26, '103.07': 27, '103.08': 28, '103.09': 29,
  '104': 30, '104.01': 31, '104.02': 32, '104.03': 33, '104.04': 34, '104.05': 35,
  '105': 37, '105.01': 38, '105.02': 39, '105.03': 40,
  '106': 42, '106.01': 43, '106.02': 44, '106.03': 45, '106.04': 46, '106.05': 47, '106.06': 48,
  '107': 49, '107.01': 50, '107.02': 51,
  '201': 53, '201.01': 54, '201.02': 55, '201.03': 56, '201.04': 57, '201.05': 58,
  '201.06': 59, '201.07': 60, '201.08': 61, '201.09': 62,
  // Az Excel a 201.10-et floatként „201.1"-ként tárolja — mindkét írásmód él.
  '201.1': 63, '201.10': 63,
  '201.11': 64, '201.12': 65, '201.13': 66, '201.14': 67, '201.15': 68,
  '201.16': 69, '201.17': 70, '201.18': 71, '201.19': 72,
  '202': 73, '202.01': 74, '202.02': 75, '202.03': 76, '202.04': 77, '202.05': 78,
  '202.06': 79, '202.07': 80, '202.08': 81,
  '203': 82, '203.01': 83, '203.02': 84, '203.03': 85, '203.04': 86, '203.05': 87,
  '203.06': 88, '203.07': 89,
  '204': 90, '204.01': 91, '204.02': 92, '204.03': 93, '204.04': 94,
  '205': 96, '205.01': 97, '205.02': 98,
  '206': 102, '206.01': 103, '206.02': 104, '206.03': 105, '206.04': 106,
  '206.05': 107, '206.06': 108,
  '207': 109, '207.01': 110, '207.02': 111,
}

/** A kód hivatalos Nr. rând-ja; ismeretlen kódra „—" (nem tolja el a többit). */
function hivatalosNrRand(kod: string): string {
  const n = HIVATALOS_NR_RAND[kod]
  return n === undefined ? '—' : String(n)
}

// ─── A hivatalos Tartozások/Kintlévőségek sor-katalógus (116–133) ──────────
// EXPORTÁLT: a nyomtatvány (buildSzamadasExtraRows) ÉS a rögzítő felület is
// ebből dolgozik — a feliratok nem tudnak széthúzni. Kulcs: a hivatalos
// Nr. rând. A * a bérszámfejtéses (egyházmegye-függő) sorokat jelöli, ahogy
// a hivatalos íven.
export const SZAMADAS_DATORII_SOROK: ReadonlyArray<[number, string, string]> = [
  [117, 'Contribuții pentru susținerea unității ierarhic superioare', 'Központi járulék'],
  [118, 'Contribuția centrală 10% din chirii', 'Bérjövedelmek 10%-a'],
  [119, 'Contribuții pentru prestări servicii efectuate către protopopiat', 'Egyházmegyei szolgáltatások díja'],
  [120, 'Întreținere (încălzire, iluminat, apă, etc.)', 'Közköltségek'],
  [121, 'Retribuții*', 'Javadalmak*'],
  [122, 'Impozit asupra drepturilor de retribuire*', 'Jövedelemadó*'],
  [123, 'Contribuții pentru asigurări sociale*', 'Társadalombiztosítás*'],
  [124, 'C.A.S.S.*', 'Egészségbiztosítás*'],
  [125, 'Contribuția asiguratorie pentru muncă - 2,25%*', 'Munkabiztosítási járulék*'],
  [126, 'Credite primite', 'Kapott hitelek'],
  [127, 'Alte datorii', 'Más tartozások'],
]
export const SZAMADAS_CREANTE_SOROK: ReadonlyArray<[number, string, string]> = [
  [129, 'Contribuții pentru susținerea unității ierarhic superioare*', 'Központi járulék*'],
  [130, 'Contribuții pentru prestări servicii la parohii*', 'Szolgáltatások díja*'],
  [131, 'Închirieri', 'Bérleti díjak'],
  [132, 'Acordări de credite', 'Kiadott hitelek'],
  [133, 'Alte creanțe', 'Más kintlévőségek'],
]

function buildSectionRows(data: BudgetPrintData, cells: SzamadasiCel[], mode: BudgetMode): string[] {
  const rows: string[] = []
  for (const c of cells) {
    const isGroup = !c.id.includes('.')
    // 2026-08-14 (K2): a sorszám a FIX hivatalos katalógusból — nem futó számláló.
    const n = hivatalosNrRand(c.id)
    if (isGroup) {
      rows.push(`<tr class="grp">
        <td class="name" colspan="2">${esc(roName(c))} / ${esc(c.nev)}</td>
        <td class="c">${n}</td><td class="c">${esc(c.id)}</td>${valueCells(data, c, true, mode)}
      </tr>`)
    } else {
      rows.push(`<tr>
        <td class="ro">${esc(roName(c))}</td><td>${esc(c.nev)}</td>
        <td class="c">${n}</td><td class="c">${esc(c.id)}</td>${valueCells(data, c, false, mode)}
      </tr>`)
    }
  }
  return rows
}

// Egy teljes táblázatoldalra férő sorok száma: 296mm lap − 20mm padding − ~5mm
// fejléc ≈ 271mm hasznos magasság; 6.4mm/sor → ~42 sor biztonsággal elfér.
const ROWS_PER_PAGE = 42

/**
 * 2026-08-11 (6. kör, reviewer-major): a RÉSZSZÁMADÁS oldal-büdzséje KISEBB.
 *
 * A `.pband` időszak-sáv MINDEN táblázatoldal tetejére kerül (1px keret +
 * 1.2mm padding + ~3.2mm szövegsor + 2mm margó ≈ 7.6–8.2mm), a sormagasság
 * viszont csak 6.4mm — a sáv tehát több mint EGY sort eszik meg. A régi kód a
 * `+6` tartalékot csak a `tablePageCount` OSZTÁSÁBA adta (ami az utolsó oldalt
 * védte), a köztes oldalakat viszont továbbra is a nyers 42-vel töltötte fel.
 * Böngészőben mérve: a részszámadás 2. oldalán a táblázat alja 294.4mm-nél volt
 * egy 296mm-es lapon, aminek a tartalom-doboza 286mm-nél véget ér; a
 * `.page-footer` (285.4–288mm) RÁNYOMTATOTT az utolsó ~1.5 sorra, és a `.page`
 * `overflow:hidden` miatt a túllógás nem gördült, hanem levágódott.
 *
 * Ezért a sáv 2 sor-egyenértéket kap, és ugyanez a szám megy a lapszámlálóba
 * IS — különben a kettő széthúzna, és a maradék az utolsó oldalra torlódna.
 */
const ROWS_PER_PAGE_PARTIAL = ROWS_PER_PAGE - 2

/** Lefoglalt sor-egyenérték az utolsó oldal záró elemeinek (aláírás, számadás-extra).
 *  2026-08-11 (6. kör): `extra` — a részszámadás záró blokkja MAGASABB (két
 *  egyeztető vonal + lábjegyzetek), és a `.page` overflow:hidden, tehát a
 *  túlcsordulás nem gördül, hanem LEVÁGÓDIK a papírról. Inkább új oldal. */
function reservedSlots(withSignatures: boolean, hasExtra: boolean, extra = 0): number {
  return (withSignatures ? 6 : 0) + (hasExtra ? 8 : 0) + extra
}

/**
 * Oldalterv: a lapszám ÉS a feltöltés EGYETLEN forrásból.
 *
 * 2026-08-11 (6. kör, reviewer-major): korábban két külön hely számolt — a
 * `tablePageCount` a tartalékkal, a `renderTablePages` a nyers `ROWS_PER_PAGE`
 * konstanssal. Ezért a részszámadás köztes oldalain a táblázat túlnyúlt a lapon
 * (a `.page-footer` ráíródott az utolsó sorokra, a `.page` overflow:hidden miatt
 * pedig LEVÁGÓDOTT). Egy aláírt pénzügyi kimutatáson ez nem esztétikai kérdés.
 * Mostantól ez a típus utazik együtt a sorokkal — nem tud széthúzni.
 */
interface OldalTerv {
  /** Táblázatoldalak száma (a borító nélkül). */
  pages: number
  /** Egy oldalra kiírható sorok száma. */
  perPage: number
  /** Az UTOLSÓ oldalon a záró blokkoknak fenntartott sor-egyenérték. */
  reserved: number
  /** 2026-08-15: az ELSŐ oldalon a kompakt fejlécnek fenntartott sor-egyenérték
   *  (a részszámadás borító-oldala megszűnt — a fejléce az 1. lapra került,
   *  hogy a teljes irat beleférjen Endre 4 oldalas keretébe). */
  elsoFoglalt: number
}

function tervezOldalak(
  rowCount: number,
  withSignatures: boolean,
  hasExtra: boolean,
  extra = 0,
  partial = false,
  elsoFoglalt = 0,
): OldalTerv {
  const perPage = partial ? ROWS_PER_PAGE_PARTIAL : ROWS_PER_PAGE
  const reserved = reservedSlots(withSignatures, hasExtra, extra)
  const pages = Math.max(1, Math.ceil((rowCount + reserved + elsoFoglalt) / perPage))
  return { pages, perPage, reserved, elsoFoglalt }
}

/**
 * A sorok elosztása oldalanként — HÁTULRÓL ELŐRE.
 *
 * Az utolsó oldal annyit kap, amennyi a záró blokk (aláírás, egyeztető vonalak,
 * lábjegyzetek) MELLETT még elfér; a maradék egyenletesen oszlik el az előtte
 * lévő oldalakon. A régi, elölről mohó feltöltés két hibát is termelt:
 *   · vagy TÚLTÖLTÖTTE a köztes oldalt (a mostani javítás előtti túlcsordulás),
 *   · vagy ÜRESRE hagyta az utolsót — fejléc-sor egy üres táblázattal, alatta
 *     az aláírásokkal. Egy hivatalos nyomtatványon mindkettő szemet szúr.
 * A `tervezOldalak` képlete garantálja, hogy minden sor elfér:
 *   pages * perPage − reserved ≥ rowCount.
 */
function oldalMeretek(rowCount: number, terv: OldalTerv): number[] {
  const { pages, perPage } = terv
  const sizes = new Array<number>(pages).fill(0)

  // ── 2026-08-15 (Endre) — ELÖLRŐL TELE, NEM SZÉTTERÍTVE ───────────────────
  // A korábbi KIEGYENLÍTŐ elosztás minden lapot egyformán hiányosan hagyott
  // (a részszámadás 4 lapján 32/32/33/20 sor, miközben egy lapra 40 fér), és a
  // táblázat alatt laponként ~50 mm fehér maradt. Az erre adott első javításom
  // — üres, vonalazott sorokkal feltölteni a lapot — ROSSZ volt: egy hivatalos
  // íven a lap alján álló üres rovatok KIHAGYOTT SOROKNAK látszanak, miközben a
  // sorszámozás a következő lapon zavartalanul folytatódik.
  //
  // A helyes megoldás: a lapokat ELÖLRŐL TÖLTJÜK TELE valódi sorokkal. Az
  // utolsó lap kapja a maradékot — ott a lap alját amúgy is a záró blokk, a
  // nyilatkozat és az aláírások foglalják el, tehát ott a szabad hely nem
  // látszik hiánynak. Ha a maradék nulla, az utolsó lapra egyáltalán nem kerül
  // táblázat (lásd renderTablePages): tiszta záró oldal lesz belőle.
  //
  // Biztonság: a `tervezOldalak` képlete garantálja, hogy az utolsó lapra jutó
  // maradék SOSEM haladja meg a `perPage - reserved` kapacitást —
  //   pages * perPage >= rowCount + reserved  ⟹  rowCount - (pages-1)*perPage <= perPage - reserved
  // tehát a záró blokk mindig elfér, és nem vágódik le a papírról.
  // Az 1. lap kapacitásából a kompakt fejléc (elsoFoglalt) levonódik — a
  // `tervezOldalak` képlete (pages*perPage ≥ rowCount+reserved+elsoFoglalt)
  // garantálja, hogy az utolsó lapra jutó maradék így sem lépi túl a
  // perPage − reserved kapacitást.
  let marad = rowCount
  for (let p = 0; p < pages - 1 && marad > 0; p++) {
    const kapacitas = perPage - (p === 0 ? terv.elsoFoglalt : 0)
    const take = Math.min(Math.max(0, kapacitas), marad)
    sizes[p] = take
    marad -= take
  }
  sizes[pages - 1] = Math.max(0, marad)
  return sizes
}

/** Összegyűjti a táblázat összes sorát (szekciók, csoport-/végpont-sorok, záró összegek).
 *  2026-07-10 (#2): `opts.openingRows` — a hivatalos EREK-minta szerint az űrlap
 *  1–3. sora a NYITÓ egyenleg (Disponibil din anul precedent / Casa / Banca);
 *  ilyenkor a tétel-sorszámozás 4-től indul, hogy a Nr. rând ne csússzon szét. */
interface OpeningBlock {
  total: number
  cash: number
  bank: number
  labelRo: string
  labelHu: string
}

function collectBudgetRows(
  data: BudgetPrintData,
  mode: BudgetMode,
  opts?: { openingRows?: boolean; opening?: OpeningBlock },
): string[] {
  const { cellek } = data
  // CSAK a hivatalos költségvetési kódok: bevétel 1xx (101–107), kiadás 2xx (201–207).
  // A belső mozgás (100.xx / 3xx / 4xx) NEM része a költségvetésnek. Hierarchikus
  // rendezés: a csoport (pl. 101) MINDIG a saját végpont-sorai (101.01…) ELÉ kerül.
  // 2026-08-11 (6. kör): a szabály a `szamadasIvCellak`-ba költözött, mert a
  // KÉPERNYŐ (AccountingTab/BudgetTab) is pontosan ezt kell használja — lásd az
  // ottani tulajdonosi döntést. `szint` szerint továbbra sem szűrünk.
  const incomeCells = szamadasIvCellak(cellek, 'B')
  const expenseCells = szamadasIvCellak(cellek, 'K')

  const cols = totalCols(mode)
  const all: string[] = []

  // 2026-07-10 (#2): 3 nyitósor a bevétel-szekció ELÉ (1–3. sorszám). Az utolsó
  // értékoszlopba kerül az összeg, az előtte lévő oszlop(ok) „x"-et kapnak
  // (számadásnál: Prevederi=x, Execuție=érték). Csak akkor, ha van carryover adat.
  // 2026-08-11 (6. kör): a nyitóblokk értékei/feliratai PARAMÉTERBŐL is jöhetnek
  // (`opts.opening`) — a részszámadás az IDŐSZAK ELEJÉRE levezetett nyitót írja
  // ide, nem a január 1-it. Az éves ág (`openingRows`) változatlan.
  const openingBlock: OpeningBlock | null = opts?.opening
    ? opts.opening
    : opts?.openingRows && (data.carryoverCash != null || data.carryoverBank != null)
      ? {
          total: (data.carryoverCash || 0) + (data.carryoverBank || 0),
          cash: data.carryoverCash || 0,
          bank: data.carryoverBank || 0,
          labelRo: 'Disponibil din anul precedent',
          labelHu: 'Múlt évi pénztármaradvány',
        }
      : null
  if (openingBlock) {
    const openingCells = (v: number) =>
      `${'<td class="r">x</td>'.repeat(valueColCount(mode) - 1)}<td class="r">${fmtNum(v)}</td>`
    all.push(`<tr class="grp">
      <td class="ro">${esc(openingBlock.labelRo)}</td><td>${esc(openingBlock.labelHu)}</td>
      <td class="c">1</td><td class="c"></td>${openingCells(openingBlock.total)}
    </tr>`)
    all.push(`<tr>
      <td class="ro">Casa</td><td>Készpénz</td>
      <td class="c">2</td><td class="c"></td>${openingCells(openingBlock.cash)}
    </tr>`)
    all.push(`<tr>
      <td class="ro">Banca</td><td>Banki egyenleg</td>
      <td class="c">3</td><td class="c"></td>${openingCells(openingBlock.bank)}
    </tr>`)
    // 2026-08-14 (K2): a folytatás sorszáma már NEM futó számláló — a fix
    // hivatalos Nr. rând katalógus veszi át (a 4. sor a 101-es csoport).
  }

  // ── 2026-08-14 (K2): a hivatalos ív KÖZBEÉKELT összesítő sorai ────────────
  // A hivatalos Szamadas lapon az összesítő sorok a szekciók KÖZBEN állnak,
  // saját Nr. rând-dal: 36 (Total venituri proprii, a 104-es csoport után),
  // 41 (Total, a 105 után), 52 (Total încasări), 95 (Total cheltuieli propriu-
  // zisă, a 204 után), 99 (Total), 100 (EXCEDENT), 101 (DEFICIT, a 205 után),
  // 112 (Plăți totale). Ezeket eddig egyáltalán nem nyomtattuk — a hivatalos
  // ívvel soronként összeolvasó számvevőnek hiányoztak.
  //
  // A meglévő HÁROM záró végösszeg-sor (Összbevétel/Összkiadás/Excedent —
  // `tr.tot`) VÁLTOZATLANUL megmarad: az önellenőrzés (Y3/Y6/Z2/ZM2) szerződése
  // és a képernyő⇄papír egyezés őre. A közbeékelt sorok KIEGÉSZÍTÉS.
  const sumGroups = (ids: string[], getter: (d: BudgetPrintData, celId: string) => number): number =>
    ids.reduce((s, gid) => s + sumGroup(data, gid, getter), 0)
  const getFinalValL = (d: BudgetPrintData, celId: string): number =>
    d.budgetRows[celId]?.modositott || d.budgetRows[celId]?.tervezett || 0

  /** Hivatalos összesítő sor a mód értékoszlop-konvenciójával. */
  const officialSummaryRow = (nr: number, labelRo: string, labelHu: string, plan: number, actual: number, final: number): string => {
    let vals = `<td class="r">${fmtNum(plan)}</td>`
    if (mode === 'szamadas') vals = `<td class="r">${fmtNum(plan)}</td><td class="r">${fmtNum(actual)}</td>`
    else if (mode === 'modification') vals = `<td class="r">${fmtNum(plan)}</td><td class="r">${fmtNum(final - plan)}</td><td class="r">${fmtNum(final)}</td>`
    return `<tr class="grp">
        <td class="name" colspan="2">${esc(labelRo)} / ${esc(labelHu)}</td>
        <td class="c">${nr}</td><td class="c"></td>${vals}
      </tr>`
  }

  // A hivatalos képletek csoport-összegei (terv / tény / végleges):
  const S = (ids: string[]) => ({
    plan: sumGroups(ids, getVal),
    actual: sumGroups(ids, getActual),
    final: sumGroups(ids, getFinalValL),
  })
  const s36 = S(['101', '102', '103', '104'])            // Total venituri proprii (4+13+20+30)
  const s105 = S(['105'])
  const s41 = { plan: s36.plan + s105.plan, actual: s36.actual + s105.actual, final: s36.final + s105.final } // Total (36+37)
  const s10607 = S(['106', '107'])
  const s52 = { plan: s41.plan + s10607.plan, actual: s41.actual + s10607.actual, final: s41.final + s10607.final } // Total încasări (41+42+49)
  const s95 = S(['201', '202', '203', '204'])            // Total cheltuieli propriu-zisă (53+73+82+90)
  const s205 = S(['205'])
  const s99 = { plan: s95.plan + s205.plan, actual: s95.actual + s205.actual, final: s95.final + s205.final } // Total (95+96)
  const s20607 = S(['206', '207'])
  const s112 = { plan: s99.plan + s20607.plan, actual: s99.actual + s20607.actual, final: s99.final + s20607.final } // Plăți totale (99+102+109)
  // EXCEDENT (41−99) / DEFICIT (99−41) — a hivatalos íven MINDKÉT sor létezik,
  // az egyik jellemzően 0.
  const exc = { plan: Math.max(0, s41.plan - s99.plan), actual: Math.max(0, s41.actual - s99.actual), final: Math.max(0, s41.final - s99.final) }
  const def = { plan: Math.max(0, s99.plan - s41.plan), actual: Math.max(0, s99.actual - s41.actual), final: Math.max(0, s99.final - s41.final) }

  /** A cellák csoport-blokkokra bontva (a csoport a saját levelei előtt áll). */
  const groupBlocks = (cells: SzamadasiCel[]): Array<{ gid: string; cells: SzamadasiCel[] }> => {
    const blocks: Array<{ gid: string; cells: SzamadasiCel[] }> = []
    for (const c of cells) {
      const gid = c.id.split('.')[0]
      const last = blocks[blocks.length - 1]
      if (last && last.gid === gid) last.cells.push(c)
      else blocks.push({ gid, cells: [c] })
    }
    return blocks
  }
  /** Az adott csoport UTÁN beékelendő hivatalos összesítő sorok. */
  const utana: Record<string, string[]> = {
    '104': [officialSummaryRow(36, 'Total venituri proprii', 'Saját bevételek összesen (4+13+20+30)', s36.plan, s36.actual, s36.final)],
    '105': [officialSummaryRow(41, 'Total', 'Összesen (36+37)', s41.plan, s41.actual, s41.final)],
    '107': [officialSummaryRow(52, 'Total încasări', 'Összbevétel (41+42+49)', s52.plan, s52.actual, s52.final)],
    '204': [officialSummaryRow(95, 'Total cheltuieli pentru activitate propriu zisă', 'Saját tevékenységek kiadásai (53+73+82+90)', s95.plan, s95.actual, s95.final)],
    '205': [
      officialSummaryRow(99, 'Total', 'Saját kiadások összesen (95+96)', s99.plan, s99.actual, s99.final),
      officialSummaryRow(100, 'EXCEDENT (41-99)', 'Bevételi többlet', exc.plan, exc.actual, exc.final),
      officialSummaryRow(101, 'DEFICIT (99-41)', 'Kiadási többlet', def.plan, def.actual, def.final),
    ],
    '207': [officialSummaryRow(112, 'Plăți totale', 'Kiadások összesen (99+102+109)', s112.plan, s112.actual, s112.final)],
  }

  // A horgony-csoport hiányában is ki KELL kerülnie az összesítő sornak
  // (pl. Total încasări / Plăți totale mindig része a hivatalos ívnek) —
  // ilyenkor a szekció megfelelő pontján, sorrendben pótoljuk.
  const emitSection = (secLabel: string, cells: SzamadasiCel[], horgonyok: string[]) => {
    all.push(`<tr class="sec"><td colspan="${cols}">${secLabel}</td></tr>`)
    const kiirt = new Set<string>()
    for (const b of groupBlocks(cells)) {
      all.push(...buildSectionRows(data, b.cells, mode))
      // Minden olyan horgony összesítője kimegy, amelynek a csoportja már
      // nem következhet (a mostani blokk gid-je elérte vagy meghaladta).
      for (const h of horgonyok) {
        if (kiirt.has(h)) continue
        if (b.gid >= h) {
          for (const row of utana[h] || []) all.push(row)
          kiirt.add(h)
        }
      }
    }
    for (const h of horgonyok) {
      if (kiirt.has(h)) continue
      for (const row of utana[h] || []) all.push(row)
      kiirt.add(h)
    }
  }
  emitSection('Bevételek / Venituri', incomeCells, ['104', '105', '107'])
  emitSection('Kiadások / Cheltuieli', expenseCells, ['204', '205', '207'])

  // ── 2026-08-15 (Endre: „a táblázat végén nem kell még egyszer összefoglalni") ──
  //
  // A táblázat végéről ELTÁVOLÍTVA a három korábbi végösszeg-sor (Összbevétel /
  // Összkiadás / Bevételi többlet). Ezek SZÁMSZERŰEN megismételték a hivatalos
  // ív saját összesítőit, amelyek a K2 kör (2026-08-14) óta a maguk hivatalos
  // sorszámával, a maguk hivatalos helyén ott állnak a táblázatban:
  //   · 52.  Total încasări  — az összbevétel (101+…+107), a 41+42+49 képlettel
  //   · 112. Plăți totale    — az összkiadás (201+…+207), a 99+102+109 képlettel
  //   · 100. EXCEDENT / 101. DEFICIT — a hivatalos 41−99, illetve 99−41 képlettel
  // A számvevő a hivatalos íven SORSZÁM szerint olvas; egy azonos összeget
  // sorszám nélkül, még egyszer kiírni csak zavart kelt, és két, egymástól
  // eltérően számolt „többlet" sort eredményezett (a régi tot-sor MINDENT
  // beleszámolt, a hivatalos 100/101 viszont a 106/107 és 206/207 fejezet
  // NÉLKÜL számol — épp ezért nem volt szabad kettőt kiírni belőle).
  //
  // A korábbi P0-javítások GARANCIÁJA nem vész el: a terv/tény, illetve az
  // előző/módosítás/végleges hasábok kitöltését a hivatalos összesítő sorok
  // (`officialSummaryRow`) viszik tovább, és az önellenőrzés (Y3/Y6/Z2/ZM2)
  // mostantól AZOKON méri ugyanezt.
  return all
}

/** Részszámadás-kontextus (időszak-feliratok). Jelenléte = részszámadás-alak. */
interface PartialInfo {
  fromLabel: string
  toLabel: string
  /** Rövid, oszlopfejlécbe való alak: „01.01–06.30". */
  periodLabel: string
}

interface TableOpts {
  startPage: number
  total: number
  /** A lapszámot ÉS a feltöltést is ez adja — egyetlen forrás. */
  terv: OldalTerv
  withSignatures: boolean
  /** false → nincs Számvevő-oszlop (az ellenőrző bizottság az ÉVEST hitelesíti). */
  withAuditor?: boolean
  lastExtraHtml?: string
  /** 2026-08-15: az ELSŐ lap tetejére kerülő kompakt fejléc (a részszámadás
   *  külön borító-oldala megszűnt — így fér bele a teljes irat 4 oldalba).
   *  A helyét a terv.elsoFoglalt tartja fenn. */
  firstExtraHtml?: string
  partial?: PartialInfo
}

/** A sorokat az `opts.terv` szerinti oldalakra osztja (lásd `oldalMeretek`):
 *  az utolsó oldal a záró elemek (számadás-extra, aláírás) mellé férő sorokat
 *  kapja, a maradék egyenletesen oszlik el az előtte lévő oldalakon. */
function colgroupFor(mode: BudgetMode): string {
  // Pontos oszlopszélességek (table-layout: fixed) — módonként eltér az értékoszlopok száma.
  let cols: number[]
  if (mode === 'modification') cols = [23, 25, 6, 10, 12, 12, 12]
  else if (mode === 'szamadas') cols = [26, 28, 7, 11, 14, 14]
  else cols = [30, 32, 8, 12, 18]
  return `<colgroup>${cols.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
}

function renderTablePages(data: BudgetPrintData, mode: BudgetMode, rows: string[], opts: TableOpts): string {
  const colgroup = colgroupFor(mode)
  const thead = `<tr>
    <th colspan="2">Denumire — Megnevezés</th>
    <th>Nr. rând<br>Sorszám</th>
    <th>Capitol/subcap.<br>Fejezet</th>
    ${valueHeads(mode, opts.partial)}
  </tr>`
  // Az időszak-sáv MINDEN oldal tetejére kell: a borító leválik/elveszik, és a
  // 2. oldaltól a részszámadás különben megkülönböztethetetlen az évestől.
  // 2026-08-14 (14. pont): a „Belső használatra…" toldalék eltávolítva a sávból.
  // A SÁV MAGA MARAD — az önellenőrzés (scripts/selftest-reszszamadas.mjs, Y1)
  // azt állítja, hogy a .pband MINDEN táblázatoldalon ott van, és a sáv szerepe
  // változatlan: a borító leválhat, és a 2. oldaltól a részszámadás különben
  // megkülönböztethetetlen lenne az évestől.
  const band = opts.partial
    ? `<div class="pband">RÉSZSZÁMADÁS / SITUAȚIE PARȚIALĂ · Időszak / Perioada: ${esc(opts.partial.fromLabel)} — ${esc(opts.partial.toLabel)}</div>`
    : ''

  // A feltöltés és a lapszám UGYANABBÓL a tervből jön (lásd `OldalTerv`).
  const meretek = oldalMeretek(rows.length, opts.terv)

  let html = ''
  let idx = 0
  for (let p = 0; p < opts.terv.pages; p++) {
    const isLast = p === opts.terv.pages - 1
    const chunk = rows.slice(idx, idx + Math.max(0, meretek[p]))
    idx += chunk.length
    const extras = isLast
      ? `${opts.lastExtraHtml || ''}${opts.withSignatures ? buildSignatureBlock(opts.withAuditor !== false) : ''}`
      : ''
    // 2026-08-15 (Endre): ha egy lapra NEM jut sor (az elölről-tele elosztás
    // után ez csak az utolsó, záró lap lehet), a táblázatot EGYÁLTALÁN nem
    // rajzoljuk ki — egy fejléc-sor üres törzzsel csak zavart keltene a
    // hivatalos íven. Ilyenkor a lap a záró blokké és az aláírásoké.
    const tabla =
      chunk.length > 0
        ? `<table class="bt">${colgroup}<thead>${thead}</thead><tbody>${chunk.join('')}</tbody></table>`
        : ''
    const fejlec = p === 0 ? opts.firstExtraHtml || '' : ''
    html += `<div class="page">
      ${fejlec}${band}${tabla}
      ${extras}
      ${footer(data, opts.startPage + p, opts.total)}
    </div>`
  }
  return html
}

// ---------------------------------------------------------------------------
// Számadás extra sorok (év végi egyenleg)
// ---------------------------------------------------------------------------

/**
 * 2026-08-11 (6. kör): RÉSZSZÁMADÁS záró blokk — az IDŐSZAK végi egyenleggel.
 *
 * A régi kód a JANUÁR 1-i nyitóból számolt zárót, és „az év végén" felirattal
 * írta ki: II. félévi papíron ez számtani képtelenség volt. Itt a nyitó és a
 * záró is az IDŐSZAKÉ, és a Casa/Banca sorokban VALÓS szám áll (a levezetés
 * számlánként megvan) — nem „—".
 *
 * A két egyeztető (rovancs) vonal az, ami ezt a papírt ellenőrizhetővé teszi:
 * a lelkész a fordulónapon megszámolja a kasszát, a bankkivonatról leírja a
 * záró egyenleget, és a kettő a nyomtatott számmal kell egyezzen.
 */
function buildReszszamadasExtraRows(data: BudgetPrintData, partial: PartialInfo): string {
  const pb = data.periodBalances
  if (!pb) return ''
  const notes: string[] = []
  if (pb.movementCount === 0) {
    notes.push(
      'Az időszakban NEM volt pénzmozgás — a záró egyenleg megegyezik a nyitóval.',
    )
  }
  if (data.nyitoBizonytalan) {
    notes.push(
      'A nyitó egyenleg LEVEZETETT érték: nincs rögzített nyitó-sor a bázisévre. Nyomtatás előtt vesd össze a kassza- és bankegyenleggel.',
    )
  }
  if (data.devizaSzamlak && data.devizaSzamlak.length > 0) {
    notes.push(
      `Devizás számla az időszakban: ${data.devizaSzamlak.join(', ')}. Minden összeg RON-ekvivalensben (a könyveléskori árfolyammal), ahogy a Registru és a Számadás is számol.`,
    )
  }
  const deltaNote =
    Math.abs(pb.reconcileDelta) >= 0.01
      ? `<div class="fnote warn">⚠ Egyeztetési eltérés: ${fmtNum(pb.reconcileDelta)} lej. A pénzmozgásból számolt záró egyenleg és a jogcímenkénti (1xx/2xx) teljesítés összege nem egyezik. Leggyakoribb oka: jogcím nélkül rögzített tétel, vagy páratlan belső átvezetés. Nyomtatás előtt nézd át az időszak tételeit.</div>`
      : ''
  const noteHtml = notes.length > 0 ? `<div class="fnote">${notes.map((n) => esc(n)).join('<br>')}</div>` : ''
  return `
    <table class="bt" style="margin-top:6px;">
      <thead><tr><th style="width:60%">Megnevezés / Denumire</th><th style="width:20%">ÉVES költségvetés</th><th style="width:20%">Időszak (${esc(partial.periodLabel)})</th></tr></thead>
      <tbody>
        <tr class="grp"><td>Pénzkészlet az időszak végén / Sold la sfârșitul perioadei</td><td class="r">x</td><td class="r">${fmtNum(pb.total.closing)}</td></tr>
        <tr><td>Készpénz egyenleg / Casa</td><td class="r">x</td><td class="r">${fmtNum(pb.cash.closing)}</td></tr>
        <tr><td>Banki egyenleg / Banca</td><td class="r">x</td><td class="r">${fmtNum(pb.bank.closing)}</td></tr>
      </tbody>
    </table>
    <div class="recon">
      A kasszában lévő tényleges készpénz / Numerarul efectiv din casă: <span class="ln">&nbsp;</span> lej<br>
      A bankkivonat záró egyenlege / Soldul final din extrasul de cont: <span class="ln">&nbsp;</span> lej
    </div>
    ${deltaNote}
    ${noteHtml}
  `
}

// ── 2026-08-15: a buildSzamadasExtraRows (hivatalos 113–134. záró blokk) ─────
// TÖRÖLVE Endre kifejezett, ismételt döntésére — a „visszaküldhető számadás"
// szakmai figyelmeztetés elhangzott és tudomásul lett véve. A blokk a
// gyakorlatban csupa nulla sort adott (a tartozás-rögzítő felület nem épült
// meg), és a 4 oldalas terjedelem-célt is lehetetlenné tette. Az adat-út ép:
// a SZAMADAS_DATORII_SOROK / SZAMADAS_CREANTE_SOROK katalógus és a
// bealitas.szamadas_tartozasok a lelkészi jelentés VII. fejezetét továbbra is
// táplálja. A blokk a git-történetből visszahozható, ha az esperesi hivatal
// mégis kérné (PR #163 előtti állapot).
// ---------------------------------------------------------------------------
// Aláírási blokk — a minta szerint
// ---------------------------------------------------------------------------

function buildSignatureBlock(withAuditor = true): string {
  // 2026-08-11 (6. kör): a részszámadáson NINCS Számvevő-oszlop — az ellenőrző
  // bizottság az ÉVES zárszámadást hitelesíti. Egy üresen maradó „Számvevő"
  // vonal azt a látszatot keltené, hogy ez a papír is hitelesítendő/beküldendő.
  // 2026-08-15 (Endre): az aláírás-feliratok KÉTNYELVŰEK. A címke-sorok eddig is
  // azok voltak, a vonal alatti megnevezések viszont csak magyarul álltak — egy
  // román ajkú ellenőr nem tudta, melyik vonalra ki ír alá. A román alak a
  // projekt bevett mintáját követi (vö. Ellenőr/Cenzor, Pénztáros/Casier).
  const auditor = withAuditor
    ? `
    <div class="col">
      <div class="label">Ellenőrizte / Verificat</div>
      <div class="line">Számvevő — aláírása<br><span class="ro">Cenzor — semnătura</span></div>
    </div>`
    : ''
  return `<div class="sig">
    <div class="col">
      <div class="label">Egyházközség képviselői / Conducătorii unității</div>
      <div class="line">Lelkipásztor — aláírása<br><span class="ro">Preot — semnătura</span></div>
    </div>
    <div class="col">
      <div class="label">P.H. / L.S.</div>
      <div class="line">Főgondnok — aláírása<br><span class="ro">Curator principal — semnătura</span></div>
    </div>${auditor}
  </div>`
}

// ---------------------------------------------------------------------------
// Fő belépési pont
// ---------------------------------------------------------------------------

export function buildBudgetPrintDocument(type: BudgetPrintType, data: BudgetPrintData): BudgetPrintResult {
  switch (type) {
    case 'koltsegvetes':
      return buildBudgetReport(data)
    case 'koltsegvetes_modositas':
      return buildBudgetModificationReport(data)
    case 'szamadas':
      return buildSzamadasReport(data)
    case 'reszszamadas':
      return buildReszszamadasReport(data)
  }
}
