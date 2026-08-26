import {
  type InventoryCategory,
  type InventoryItem,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ROMANIAN_LABELS,
} from '@/lib/constants/inventory.next'
// 2026-08-15 (desktop-paritás 4. szelet): az érték-számítás a KÖZÖS rétegből
// jön (packages/ui-app/src/inventory/value.ts) — az itteni másolatok törölve,
// hogy a webes nyomtatványok és a desktop fisa/lista EGY képlettel számoljon.
import {
  calculateInventoryCurrentValue,
  getInventoryBookValue as getBookValue,
  getInventoryDisplayName,
  getInventoryQuantity as getQuantity,
  hivatalosKetnyelvuNev,
  normalizeInventoryDate as normalizeDate,
} from '@kartoteka/ui-app'

// 2026-08-27: a lapokra bontás, az oldalszám és a kétnyelvűség a KÖZÖS
// print-layout rétegből jön — egyetlen igazságforrás a képernyőnek, a
// nyomtatásnak és a PDF-nek.
import {
  becsultSorMagassag,
  egyNyelvu,
  epitLapok,
  ketNyelvu,
  wrapPrintDocument,
  type PrintLang,
  type PrintSor,
} from './print-layout'

// A meglévő webes importok (inventory-main-v3, stb.) kompatibilitása.
export { calculateInventoryCurrentValue, getInventoryDisplayName }
export type { PrintLang } from './print-layout'
export { PRINT_LANG_LABEL } from './print-layout'

export type InventoryPrintType =
  | 'leltariv'
  | 'registru_inventar'
  | 'aktiv_passziv'
  | 'torolt_targyak'
  | 'vagyonleltari_jelentes'

export const INVENTORY_PRINT_TYPES: Array<{
  id: InventoryPrintType
  title: string
  subtitle: string
  description: string
}> = [
  {
    id: 'leltariv',
    title: 'Leltárív',
    subtitle: 'Részletes helyszíni lista',
    description: 'Helyszín és felelős szerinti részletes lista a felleltározáshoz, a könyvelési és leltári értékekkel.',
  },
  {
    id: 'registru_inventar',
    title: 'Registru inventar',
    subtitle: 'Román összesítő nyomtatvány',
    description: 'A hivatalos román nyilvántartási összesítő, kategóriánkénti könyv szerinti és leltári értékkel.',
  },
  {
    id: 'aktiv_passziv',
    title: 'Aktív és passzív elemek',
    subtitle: '21-es melléklet jellegű összesítő',
    description: 'A leltári vagyon főbb aktív elemeinek éves összesítése, a pénzügyi áttekintéshez igazítva.',
  },
  {
    id: 'torolt_targyak',
    title: 'Leltárból törölt tárgyak',
    subtitle: 'Kivezetési lista',
    description: 'Az adott időszakban törölt vagy kivezetett leltári tárgyak hivatalos listája.',
  },
  {
    id: 'vagyonleltari_jelentes',
    title: 'Vagyonleltári jelentés',
    subtitle: 'Végleges leadandó jelentés',
    description: 'A gyülekezeti vagyonleltár hivatalos éves jelentése, amelyet véglegesíteni és továbbítani kell.',
  },
]

// 2026-08-27: az `INVENTORY_GUIDE_SECTIONS` HALOTT KÓD volt — hét fejezetnyi
// súgó-tartalom, amit SOHA semmi nem renderelt (a Súgó fül a saját
// szekcióival dolgozik). Két, egymásról nem tudó súgó-forrás pontosan az a
// néma széthúzás, amit a repó máshol már megszenvedett: a törölt tartalom
// naprakész változata a Súgó fülben él (components/inventory/inventory-guide-tab.tsx).

type CategorySummary = {
  category: InventoryCategory
  openingCount: number
  incomingCount: number
  deletedCount: number
  closingCount: number
  openingValue: number
  incomingValue: number
  deletedValue: number
  closingValue: number
}

export interface InventoryReportFilters {
  categoryKey?: InventoryCategory | null
  categoryLabel?: string | null
  locationFilter?: string | null
  query?: string | null
  periodStart?: string | null
  periodEnd?: string | null
}

export interface InventoryPrintFinanceSummary {
  openingCash: number
  periodCashIncome: number
  periodCashExpense: number
  closingCash: number
  bankBalance: number
  periodIncome: number
  periodExpense: number
  openingReceivables: number
  closingReceivables: number
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function normalizeSearch(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString('hu-HU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('hu-HU')
}

function formatPeriodLabel(filters?: InventoryReportFilters) {
  if (!filters?.periodStart && !filters?.periodEnd) return 'Teljes időszak'
  const start = formatDate(filters?.periodStart || null)
  const end = formatDate(filters?.periodEnd || null)
  return `${start} - ${end}`
}

function isDateWithinPeriod(date: Date | null, filters?: InventoryReportFilters) {
  if (!filters?.periodStart && !filters?.periodEnd) return true
  if (!date) return false

  const start = normalizeDate(filters.periodStart || null)
  const end = normalizeDate(filters.periodEnd || null)
  if (start && date.getTime() < start.getTime()) return false
  if (end && date.getTime() > end.getTime()) return false
  return true
}

function applyInventoryFilters(
  items: InventoryItem[],
  filters?: InventoryReportFilters,
  dateMode: 'purchase' | 'deleted' = 'purchase',
) {
  const query = normalizeSearch(filters?.query)

  return items.filter((item) => {
    if (filters?.categoryKey && item.kategoria_key !== filters.categoryKey) return false
    if (filters?.locationFilter && (item.helyszin || '') !== filters.locationFilter) return false

    if (query) {
      const haystack = normalizeSearch(
        `${getInventoryDisplayName(item)} ${item.leltari_szam || ''} ${item.helyszin || ''} ${item.felelos_nev || ''} ${item.beszerzes_bizonylat || ''}`,
      )
      if (!haystack.includes(query)) return false
    }

    const comparableDate = dateMode === 'deleted' ? normalizeDate(item.torles_datuma) : normalizeDate(item.beszerzes_datuma)
    return isDateWithinPeriod(comparableDate, filters)
  })
}

function getDepreciationValue(item: InventoryItem, referenceDate = new Date()) {
  return Math.max(0, getBookValue(item) - calculateInventoryCurrentValue(item, referenceDate))
}

function isItemDeletedByDate(item: InventoryItem, referenceDate: Date) {
  const deletionDate = normalizeDate(item.torles_datuma)
  if (deletionDate) return deletionDate <= referenceDate
  return item.deleted
}

function isItemActiveOn(item: InventoryItem, referenceDate: Date) {
  const purchaseDate = normalizeDate(item.beszerzes_datuma)
  if (purchaseDate && purchaseDate > referenceDate) return false
  return !isItemDeletedByDate(item, referenceDate)
}

function getCategorySummary(items: InventoryItem[], year: number): CategorySummary[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)

  return INVENTORY_CATEGORIES.map(category => {
    const categoryItems = items.filter(item => item.kategoria_key === category)

    const opening = categoryItems.filter(item => {
      const purchaseDate = normalizeDate(item.beszerzes_datuma)
      // ⚠️ 2026-08-27 — A DÁTUM NÉLKÜLI TÉTEL EDDIG KIESETT A MOZGÁS-TÁBLÁBÓL.
      // Az import a hiányzó beszerzési évet SZÁNDÉKOSAN megengedi (hangos
      // figyelmeztetéssel: „a tétel dátum nélkül került be"), a régi feltétel
      // viszont `purchaseDate != null`-t követelt. Az ilyen tétel így SEM a
      // nyitóban, SEM a bejövetelben nem jelent meg — a ZÁRÓ egyenlegben
      // viszont ott volt (isItemActiveOn a hiányzó dátumot aktívnak veszi).
      // Ettől a Vagyonleltári jelentés négy oszlopa nem adta ki egymást.
      // A dátum nélküli tétel a NYITÓ állományba tartozik: nem tudjuk, mikor
      // került be, tehát nem az idei bejövetel.
      if (!purchaseDate) return isItemActiveOn(item, start)
      return purchaseDate < start && isItemActiveOn(item, start)
    })

    const incoming = categoryItems.filter(item => {
      const purchaseDate = normalizeDate(item.beszerzes_datuma)
      return purchaseDate != null && purchaseDate >= start && purchaseDate <= end
    })

    const deleted = categoryItems.filter(item => {
      const deletionDate = normalizeDate(item.torles_datuma)
      if (deletionDate) return deletionDate >= start && deletionDate <= end
      return item.deleted && !deletionDate && year === new Date().getFullYear()
    })

    const closing = categoryItems.filter(item => isItemActiveOn(item, end))

    return {
      category,
      openingCount: opening.length,
      incomingCount: incoming.length,
      deletedCount: deleted.length,
      closingCount: closing.length,
      // ⚠️ 2026-08-27 — MIND A NÉGY OSZLOP UGYANAZON AZ ÉRTÉK-ALAPON.
      //
      // A régi kód HÁROM különböző alapot kevert egyetlen mozgás-táblában:
      // a nyitót az év ELEJÉRE amortizált értéken, a bejövetelt KÖNYV SZERINTI
      // értéken, a törlést és a zárót az év VÉGÉRE amortizált értéken. Emiatt a
      // Vagyonleltári jelentés négy oszlopa (előző évi egyenleg + bejövetel −
      // törlés = év végi egyenleg) NEM adta ki egymást — egy aláírandó,
      // egyházmegyének beküldött íven. A hivatalos munkafüzet ugyanezt a
      // képletet írja elő (Vagyonleltari_jel!F26 = C26 + D26 − E26).
      //
      // A közös alap a KÖNYV SZERINTI érték: időfüggetlen, tehát az azonosság
      // pontosan teljesül, és a hivatalos regiszter is ezt várja
      // (Reg_Inv!E7 = D7). Az amortizált („leltári") értéknek a Leltáríven van
      // saját, külön oszlopa — ott marad, ahol a nyomtatvány kéri.
      openingValue: opening.reduce((sum, item) => sum + getBookValue(item), 0),
      incomingValue: incoming.reduce((sum, item) => sum + getBookValue(item), 0),
      deletedValue: deleted.reduce((sum, item) => sum + getBookValue(item), 0),
      closingValue: closing.reduce((sum, item) => sum + getBookValue(item), 0),
    }
  })
}

function buildLeltarivReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  /**
   * 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`). A
   * „Lista de inventariere" ROMÁN nyomtatvány — a kiállító neve mégis csak
   * magyarul állt rajta; román név-ág egyáltalán nem létezett. Ha nincs román
   * név, a magyar áll ott EGYEDÜL (sablon-kiegészítés nélkül).
   */
  congregationNameRo?: string,
  lang: PrintLang = 'hu',
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo, { elol: lang }))
  const referenceDate = new Date(year, 11, 31)
  const scopedItems = applyInventoryFilters(items, filters, 'purchase')
  const activeItems = scopedItems.filter(item => isItemActiveOn(item, referenceDate))
  const totalCurrentValue = activeItems.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, referenceDate), 0)

  const sorok: PrintSor[] = activeItems.map((item, index) => {
    const megjegyzes = item.torles_indoklasa || item.megjegyzes || ''
    return {
      // A megjegyzés-oszlop tördelődik — a lap-tördelő ezzel számol, hogy a
      // sor ne csorduljon túl a lap alján (a túlcsordulás LEVÁGÁS lenne).
      magassag: becsultSorMagassag(megjegyzes, 26),
      html: `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>${escapeHtml(getInventoryDisplayName(item))}</td>
          <td>${escapeHtml(item.leltari_szam || '—')}</td>
          <td class="text-center">${escapeHtml(item.mertekegyseg || 'db')}</td>
          <td class="text-center">${getQuantity(item)}</td>
          <td class="text-right">${formatNumber(Number(item.beszerzes_erteke || 0))}</td>
          <td class="text-right">${formatNumber(getBookValue(item))}</td>
          <td class="text-right">${formatNumber(calculateInventoryCurrentValue(item, referenceDate))}</td>
          <td class="text-right">${formatNumber(getDepreciationValue(item, referenceDate))}</td>
          <td>${escapeHtml(megjegyzes)}</td>
        </tr>`,
    }
  })

  const cim = egyNyelvu(lang, 'Leltárív', 'Lista de inventariere')
  const alcim = egyNyelvu(lang, 'Lista de inventariere', 'Leltárív')

  const fejlecElso = `
      <div class="title">${escapeHtml(cim)}</div>
      <div class="subtitle">${escapeHtml(alcim)} · ${entitasNev}</div>
      <div class="meta-grid">
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Dátum', 'Data'))}:</strong> 31.12.${year}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Helyszín / felelős', 'Locul / gestionar'))}:</strong> ${escapeHtml(filters?.locationFilter || egyNyelvu(lang, 'Minden helyszín', 'Toate locurile'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Kategória', 'Categoria'))}:</strong> ${escapeHtml(filters?.categoryLabel || egyNyelvu(lang, 'Minden tárgycsoport', 'Toate grupele'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Szűrt időszak', 'Perioada'))}:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Látható aktív tétel', 'Poziții active'))}:</strong> ${activeItems.length} ${egyNyelvu(lang, 'db', 'buc')}</div>
      </div>`

  const fejlecFolytatas = `<div class="continued">${escapeHtml(cim)} — ${escapeHtml(egyNyelvu(lang, 'folytatás', 'continuare'))}</div>`

  const tablaNyito = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(ketNyelvu(lang, 'S.sz.', 'Nr. crt.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Felleltározott tárgyak', 'Denumirea bunurilor inventariate'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Leltári sz.', 'Cod'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'M.E.', 'U.M.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Meny.', 'Cant.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Egységár', 'Preț unitar contabil'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Könyv szerinti érték', 'Valoare contabilă'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Leltári érték', 'Valoare de inventar'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Értékcsökkenés', 'Deprecierea'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Megjegyzés', 'Observații'))}</th>
          </tr>
        </thead>`

  const tfoot = `
        <tfoot>
          <tr class="totals">
            <td colspan="7" class="text-right">${escapeHtml(ketNyelvu(lang, 'Összes leltári érték', 'Total valoare de inventar'))}</td>
            <td class="text-right">${formatNumber(totalCurrentValue)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>`

  const { html: lapokHtml, lapszam } = epitLapok({
    orientation: 'landscape',
    fejlecElso,
    fejlecFolytatas,
    tablaNyito,
    tablaZaro: '</table>',
    sorok,
    tfoot,
    lablecCimke: `${entitasNev} · ${escapeHtml(cim)}`,
    uresUzenet: escapeHtml(egyNyelvu(lang, 'Nincs a szűrésnek megfelelő aktív leltári tétel.', 'Nu există poziții active conform filtrului.')),
  })

  return {
    title: cim,
    filename: `${lang === 'ro' ? 'Lista_de_inventariere' : 'Leltariv'}_${year}.pdf`,
    orientation: 'landscape' as const,
    lapszam,
    html: wrapPrintDocument({ title: cim, orientation: 'landscape', lang, lapokHtml, lapszam }),
  }
}

function buildRegistruReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  financeSummary?: InventoryPrintFinanceSummary | null,
  /**
   * 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`). A
   * „Registru inventar" ROMÁN nyomtatvány; a fejlécében eddig csak a magyar
   * név állt. Ha nincs román név, a magyar marad egyedül.
   */
  congregationNameRo?: string,
  lang: PrintLang = 'hu',
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo, { elol: lang }))
  const summary = getCategorySummary(applyInventoryFilters(items, filters, 'purchase'), year)
  const ertek = (category: InventoryCategory) =>
    summary.find(row => row.category === category)?.closingValue || 0

  // A sorok a hivatalos ROMÁN nyomtatvány tételei; a magyar megfelelő a lap
  // nyelve szerint elöl vagy hátul áll.
  const sorDefiniciok: Array<[string, string, string, number]> = [
    ['1', 'Mijloace fixe', 'Alapeszközök', ertek('alapeszkoz')],
    ['2', 'Terenuri și amplasamenturi', 'Telkek, földek, erdők', ertek('telek')],
    ['3', 'Investiții în curs', 'Folyamatban lévő beruházások', 0],
    ['4', 'Obiecte de inventar', 'Csekély értékű leltári tárgyak', ertek('csekely')],
    ['5', 'Cărți', 'Könyvek', ertek('konyv')],
    ['6', 'Obiecte de cult', 'Kegyszerek', ertek('kegyszer')],
    ['7', 'Acțiuni și titluri de proprietate', 'Kárpótlási jegyek, részvények', ertek('karpotlasi')],
    ['8', 'Custodie', 'Bizományi', ertek('bizomanyi')],
    ['9', 'Casa', 'Pénztár', financeSummary?.closingCash || 0],
    ['10', 'Creanțe', 'Követelések', financeSummary?.closingReceivables || 0],
  ]

  const sorok: PrintSor[] = sorDefiniciok.map(([nr, ro, hu, value]) => ({
    magassag: becsultSorMagassag(ketNyelvu(lang, hu, ro), 40),
    html: `
        <tr>
          <td class="text-center">${escapeHtml(nr)}</td>
          <td>${escapeHtml(ketNyelvu(lang, hu, ro))}</td>
          <td class="text-right">${formatNumber(value)}</td>
          <td class="text-right">${formatNumber(value)}</td>
        </tr>`,
  }))

  const cim = 'Registru inventar'
  const fejlecElso = `
      <div class="title">${escapeHtml(cim)}</div>
      <div class="subtitle">${entitasNev} · ${escapeHtml(egyNyelvu(lang, 'a következő időpontra', 'la data de'))} 31.12.${year}</div>
      <div class="meta-grid">
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Kategória', 'Categoria'))}:</strong> ${escapeHtml(filters?.categoryLabel || egyNyelvu(lang, 'Minden tárgycsoport', 'Toate grupele'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Helyszín', 'Locul'))}:</strong> ${escapeHtml(filters?.locationFilter || egyNyelvu(lang, 'Minden helyszín', 'Toate locurile'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Szűrt időszak', 'Perioada'))}:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Záró pénztár / követelés', 'Sold final casă / creanțe'))}:</strong> ${formatNumber(financeSummary?.closingCash || 0)} / ${formatNumber(financeSummary?.closingReceivables || 0)}</div>
      </div>`

  const tablaNyito = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(ketNyelvu(lang, 'Sz.', 'Nr.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'A leltározott elemek összesítése', 'Recapitulația elementelor inventariate'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Könyv szerinti érték', 'Valoare contabilă'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Leltári érték', 'Valoare de inventar'))}</th>
          </tr>
        </thead>`

  const zaroBlokkok = `
      <div class="note">
        ${escapeHtml(
          egyNyelvu(
            lang,
            'A pénztár és a követelések sorai a kiválasztott időszak pénzügyi adataiból töltődnek, a leltári tárgycsoportok pedig a nyilvántartott vagyonelemek alapján számolódnak.',
            'Rândurile casă și creanțe provin din datele financiare ale perioadei selectate, iar grupele de inventar se calculează din bunurile înregistrate.',
          ),
        )}
      </div>`

  const { html: lapokHtml, lapszam } = epitLapok({
    orientation: 'portrait',
    fejlecElso,
    fejlecFolytatas: `<div class="continued">${escapeHtml(cim)} — ${escapeHtml(egyNyelvu(lang, 'folytatás', 'continuare'))}</div>`,
    tablaNyito,
    tablaZaro: '</table>',
    sorok,
    zaroBlokkok,
    zaroBlokkokMagassag: 90,
    lablecCimke: `${entitasNev} · ${escapeHtml(cim)}`,
  })

  return {
    title: cim,
    filename: `Registru_inventar_${year}.pdf`,
    orientation: 'portrait' as const,
    lapszam,
    html: wrapPrintDocument({ title: cim, orientation: 'portrait', lang, lapokHtml, lapszam }),
  }
}

function buildAktivPasszivReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  financeSummary?: InventoryPrintFinanceSummary | null,
  congregationNameRo?: string,
  lang: PrintLang = 'hu',
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo, { elol: lang }))
  const summary = getCategorySummary(applyInventoryFilters(items, filters, 'purchase'), year)
  const ertek = (category: InventoryCategory) =>
    summary.find(row => row.category === category)?.closingValue || 0

  const sorDefiniciok: Array<[string, string, string, number]> = [
    ['1', 'Sold inițial casă', 'Nyitó pénztáregyenleg', financeSummary?.openingCash || 0],
    ['2', 'Încasări numerar', 'Időszaki készpénzbevétel', financeSummary?.periodCashIncome || 0],
    ['3', 'Plăți numerar', 'Időszaki készpénzkiadás', financeSummary?.periodCashExpense || 0],
    ['4', 'Sold final casă', 'Záró pénztáregyenleg', financeSummary?.closingCash || 0],
    ['5', 'Creanțe', 'Követelések', financeSummary?.closingReceivables || 0],
    ['6', 'Imobilizări', 'Alapeszközök, telkek, földek', ertek('alapeszkoz') + ertek('telek')],
    ['7', 'Obiecte de inventar', 'Csekély értékű tárgyak', ertek('csekely')],
    ['8', 'Cărți', 'Könyvek', ertek('konyv')],
    ['9', 'Obiecte de cult', 'Kegyszerek', ertek('kegyszer')],
    ['10', 'Acțiuni și titluri', 'Kárpótlási jegyek', ertek('karpotlasi')],
    ['11', 'Custodie', 'Bizományi', ertek('bizomanyi')],
  ]

  const sorok: PrintSor[] = sorDefiniciok.map(([nr, ro, hu, value]) => ({
    magassag: becsultSorMagassag(ketNyelvu(lang, hu, ro), 45),
    html: `
        <tr>
          <td class="text-center">${escapeHtml(nr)}</td>
          <td>${escapeHtml(ketNyelvu(lang, hu, ro))}</td>
          <td class="text-right">${formatNumber(value)}</td>
        </tr>`,
  }))

  const cim = egyNyelvu(lang, 'Aktív és passzív elemek', 'Situația elementelor de activ și pasiv')
  const alcim = egyNyelvu(lang, 'Situația elementelor de activ și pasiv', 'Az aktív és passzív elemek egyenlege')

  const fejlecElso = `
      <div class="title">${escapeHtml(cim)}</div>
      <div class="subtitle">${escapeHtml(alcim)} · ${entitasNev} · ${year}</div>
      <div class="meta-grid">
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Kategória', 'Categoria'))}:</strong> ${escapeHtml(filters?.categoryLabel || egyNyelvu(lang, 'Minden tárgycsoport', 'Toate grupele'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Helyszín', 'Locul'))}:</strong> ${escapeHtml(filters?.locationFilter || egyNyelvu(lang, 'Minden helyszín', 'Toate locurile'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Szűrt időszak', 'Perioada'))}:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Összes pénzügyi forgalom', 'Rulaj total'))}:</strong> ${formatNumber(financeSummary?.periodIncome || 0)} / ${formatNumber(financeSummary?.periodExpense || 0)}</div>
      </div>`

  const tablaNyito = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(ketNyelvu(lang, 'Sz.', 'Nr.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Tétel', 'Element'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Záró érték', 'Valoare finală'))}</th>
          </tr>
        </thead>`

  const zaroBlokkok = `
      <div class="note">
        ${escapeHtml(
          egyNyelvu(
            lang,
            'A pénztár és követelések sorai a kiválasztott periódus pénzügyi egyeztetéséből töltődnek, a többi sor a nyilvántartott vagyonelemek alapján számolódik.',
            'Rândurile casă și creanțe provin din reconcilierea financiară a perioadei, restul se calculează din bunurile înregistrate.',
          ),
        )}
      </div>`

  const { html: lapokHtml, lapszam } = epitLapok({
    orientation: 'portrait',
    fejlecElso,
    fejlecFolytatas: `<div class="continued">${escapeHtml(cim)} — ${escapeHtml(egyNyelvu(lang, 'folytatás', 'continuare'))}</div>`,
    tablaNyito,
    tablaZaro: '</table>',
    sorok,
    zaroBlokkok,
    zaroBlokkokMagassag: 90,
    lablecCimke: `${entitasNev} · ${escapeHtml(cim)}`,
  })

  return {
    title: cim,
    filename: `Aktiv_passziv_${year}.pdf`,
    orientation: 'portrait' as const,
    lapszam,
    html: wrapPrintDocument({ title: cim, orientation: 'portrait', lang, lapokHtml, lapszam }),
  }
}

function buildDeletedItemsReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  congregationNameRo?: string,
  lang: PrintLang = 'hu',
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo, { elol: lang }))
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  const deletedItems = applyInventoryFilters(items, filters, 'deleted').filter(item => {
    const deletionDate = normalizeDate(item.torles_datuma)
    if (deletionDate) return deletionDate >= start && deletionDate <= end
    return item.deleted && year === new Date().getFullYear()
  })

  const sorok: PrintSor[] = deletedItems.map((item, index) => {
    const indoklas = item.torles_indoklasa || item.torles_bizonylat || egyNyelvu(lang, 'Nincs részletezve', 'Nedetaliat')
    return {
      magassag: becsultSorMagassag(indoklas, 30),
      html: `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>${formatDate(item.torles_datuma)}</td>
          <td>${escapeHtml(getInventoryDisplayName(item))}</td>
          <td>${escapeHtml(item.leltari_szam || '—')}</td>
          <td>${escapeHtml(item.mertekegyseg || 'db')}</td>
          <td class="text-center">${getQuantity(item)}</td>
          <td class="text-right">${formatNumber(getBookValue(item))}</td>
          <td>${escapeHtml(indoklas)}</td>
        </tr>`,
    }
  })

  const cim = egyNyelvu(lang, 'Leltárból törölt tárgyak', 'Bunuri scoase din inventar')

  const fejlecElso = `
      <div class="title">${escapeHtml(cim)}</div>
      <div class="subtitle">${entitasNev} · ${year}.01.01 – ${year}.12.31.</div>
      <div class="meta-grid">
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Kategória', 'Categoria'))}:</strong> ${escapeHtml(filters?.categoryLabel || egyNyelvu(lang, 'Minden tárgycsoport', 'Toate grupele'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Helyszín', 'Locul'))}:</strong> ${escapeHtml(filters?.locationFilter || egyNyelvu(lang, 'Minden helyszín', 'Toate locurile'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Szűrt időszak', 'Perioada'))}:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Törölt tételek', 'Poziții scoase'))}:</strong> ${deletedItems.length} ${egyNyelvu(lang, 'db', 'buc')}</div>
      </div>`

  const tablaNyito = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(ketNyelvu(lang, 'S.sz.', 'Nr. crt.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Dátum', 'Data'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Felleltározott tárgyak elnevezése', 'Denumirea bunurilor'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Leltári sz.', 'Cod'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'M.E.', 'U.M.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Meny.', 'Cant.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Könyvelési érték', 'Valoare contabilă'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Indoklás / igazoló irat', 'Motivare / document'))}</th>
          </tr>
        </thead>`

  const { html: lapokHtml, lapszam } = epitLapok({
    orientation: 'landscape',
    fejlecElso,
    fejlecFolytatas: `<div class="continued">${escapeHtml(cim)} — ${escapeHtml(egyNyelvu(lang, 'folytatás', 'continuare'))}</div>`,
    tablaNyito,
    tablaZaro: '</table>',
    sorok,
    lablecCimke: `${entitasNev} · ${escapeHtml(cim)}`,
    uresUzenet: escapeHtml(
      egyNyelvu(
        lang,
        'A megadott időszakban nincs törölt leltári tétel.',
        'În perioada selectată nu există poziții scoase din inventar.',
      ),
    ),
  })

  return {
    title: cim,
    filename: `Leltarbol_torolt_targyak_${year}.pdf`,
    orientation: 'landscape' as const,
    lapszam,
    html: wrapPrintDocument({ title: cim, orientation: 'landscape', lang, lapokHtml, lapszam }),
  }
}

function buildVagyonReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  financeSummary?: InventoryPrintFinanceSummary | null,
  congregationNameRo?: string,
  lang: PrintLang = 'hu',
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo, { elol: lang }))
  const summary = getCategorySummary(applyInventoryFilters(items, filters, 'purchase'), year)
  const receivableIncoming = Math.max(0, (financeSummary?.closingReceivables || 0) - (financeSummary?.openingReceivables || 0))
  const receivableOutgoing = Math.max(0, (financeSummary?.openingReceivables || 0) - (financeSummary?.closingReceivables || 0))
  const extraRows = [
    {
      labelHu: 'Pénztár',
      labelRo: 'Casa',
      opening: financeSummary?.openingCash || 0,
      incoming: financeSummary?.periodCashIncome || 0,
      outgoing: financeSummary?.periodCashExpense || 0,
      closing: financeSummary?.closingCash || 0,
    },
    {
      labelHu: 'Követelések',
      labelRo: 'Creanțe',
      opening: financeSummary?.openingReceivables || 0,
      incoming: receivableIncoming,
      outgoing: receivableOutgoing,
      closing: financeSummary?.closingReceivables || 0,
    },
  ]

  const osszesSor = [
    ...summary.map((row) => ({
      labelHu: INVENTORY_CATEGORY_LABELS[row.category],
      labelRo: INVENTORY_CATEGORY_ROMANIAN_LABELS[row.category],
      opening: row.openingValue,
      incoming: row.incomingValue,
      outgoing: row.deletedValue,
      closing: row.closingValue,
    })),
    ...extraRows,
  ]

  const sorok: PrintSor[] = osszesSor.map((row, index) => {
    const elsodleges = lang === 'hu' ? row.labelHu : row.labelRo
    const masodlagos = lang === 'hu' ? row.labelRo : row.labelHu
    return {
      magassag: becsultSorMagassag(elsodleges, 26) + 12,
      html: `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>${escapeHtml(elsodleges)}<br><span style="font-size: 10px; color: #475569;">${escapeHtml(masodlagos)}</span></td>
          <td class="text-right">${formatNumber(row.opening)}</td>
          <td class="text-right">${formatNumber(row.incoming)}</td>
          <td class="text-right">${formatNumber(row.outgoing)}</td>
          <td class="text-right">${formatNumber(row.closing)}</td>
        </tr>`,
    }
  })

  const totalOpening = osszesSor.reduce((sum, row) => sum + row.opening, 0)
  const totalIncoming = osszesSor.reduce((sum, row) => sum + row.incoming, 0)
  const totalDeleted = osszesSor.reduce((sum, row) => sum + row.outgoing, 0)
  const totalClosing = osszesSor.reduce((sum, row) => sum + row.closing, 0)

  const cim = egyNyelvu(lang, 'Vagyonleltári jelentés', 'Raport de inventariere a patrimoniului')

  const fejlecElso = `
      <div class="title">${escapeHtml(cim)}</div>
      <div class="subtitle">${entitasNev} · ${year} · 31.12.${year}</div>
      <div class="meta-grid">
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Kategória', 'Categoria'))}:</strong> ${escapeHtml(filters?.categoryLabel || egyNyelvu(lang, 'Minden tárgycsoport', 'Toate grupele'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Helyszín', 'Locul'))}:</strong> ${escapeHtml(filters?.locationFilter || egyNyelvu(lang, 'Minden helyszín', 'Toate locurile'))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Szűrt időszak', 'Perioada'))}:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>${escapeHtml(ketNyelvu(lang, 'Pénztár / követelés záró érték', 'Sold final casă / creanțe'))}:</strong> ${formatNumber(financeSummary?.closingCash || 0)} / ${formatNumber(financeSummary?.closingReceivables || 0)}</div>
      </div>`

  const tablaNyito = `
      <table>
        <thead>
          <tr>
            <th>${escapeHtml(ketNyelvu(lang, 'Sz.', 'Nr.'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Tárgycsoport', 'Grupa de bunuri'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Előző évi egyenleg', 'Sold anul precedent'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Bejövetel / Bevétel', 'Intrări'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Törlés / Kiadás', 'Ieșiri'))}</th>
            <th>${escapeHtml(ketNyelvu(lang, 'Év végi egyenleg', 'Sold final'))}</th>
          </tr>
        </thead>`

  const tfoot = `
        <tfoot>
          <tr class="totals">
            <td colspan="2" class="text-right">${escapeHtml(ketNyelvu(lang, 'Összesen', 'Total'))}</td>
            <td class="text-right">${formatNumber(totalOpening)}</td>
            <td class="text-right">${formatNumber(totalIncoming)}</td>
            <td class="text-right">${formatNumber(totalDeleted)}</td>
            <td class="text-right">${formatNumber(totalClosing)}</td>
          </tr>
        </tfoot>`

  const zaroBlokkok = `
      <div class="signature-grid">
        <div class="signature-box">
          ${escapeHtml(ketNyelvu(lang, 'Lelkipásztor', 'Preot paroh'))}
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          ${escapeHtml(ketNyelvu(lang, 'Gondnok', 'Curator'))}
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          ${escapeHtml(ketNyelvu(lang, 'Ellenőr / számvevő', 'Cenzor'))}
          <div class="signature-line"></div>
        </div>
      </div>`

  const { html: lapokHtml, lapszam } = epitLapok({
    orientation: 'portrait',
    fejlecElso,
    fejlecFolytatas: `<div class="continued">${escapeHtml(cim)} — ${escapeHtml(egyNyelvu(lang, 'folytatás', 'continuare'))}</div>`,
    tablaNyito,
    tablaZaro: '</table>',
    sorok,
    tfoot,
    zaroBlokkok,
    zaroBlokkokMagassag: 130,
    lablecCimke: `${entitasNev} · ${escapeHtml(cim)}`,
  })

  return {
    title: cim,
    filename: `Vagyonleltari_jelentes_${year}.pdf`,
    orientation: 'portrait' as const,
    lapszam,
    html: wrapPrintDocument({ title: cim, orientation: 'portrait', lang, lapokHtml, lapszam }),
  }
}

export function buildInventoryPrintDocument({
  type,
  items,
  congregationName,
  congregationNameRo,
  year,
  filters,
  financeSummary,
  lang = 'hu',
}: {
  type: InventoryPrintType
  items: InventoryItem[]
  congregationName: string
  /**
   * A kiállító hivatalos ROMÁN neve (`nev_ro`).
   *
   * 2026-08-27: MOSTANTÓL MINDEN ívre továbbmegy — nem csak a két román
   * nyomtatványra. Ok: a nyomtatási központban a lelkész a lap NYELVÉT
   * választja, tehát bármelyik ív kérhető románul; ilyenkor a kiállító neve
   * sem maradhat magyarul. Ha nincs román név, a magyar áll ott EGYEDÜL
   * (kitalált nevet soha nem írunk a hivatalos ívre).
   */
  congregationNameRo?: string
  year: number
  filters?: InventoryReportFilters
  financeSummary?: InventoryPrintFinanceSummary | null
  /** A nyomtatvány nyelve — az ELSŐDLEGES nyelv; a másik felirat mellette marad. */
  lang?: PrintLang
}) {
  switch (type) {
    case 'leltariv':
      return buildLeltarivReport(items, congregationName, year, filters, congregationNameRo, lang)
    case 'registru_inventar':
      return buildRegistruReport(items, congregationName, year, filters, financeSummary, congregationNameRo, lang)
    case 'aktiv_passziv':
      return buildAktivPasszivReport(items, congregationName, year, filters, financeSummary, congregationNameRo, lang)
    case 'torolt_targyak':
      return buildDeletedItemsReport(items, congregationName, year, filters, congregationNameRo, lang)
    case 'vagyonleltari_jelentes':
      return buildVagyonReport(items, congregationName, year, filters, financeSummary, congregationNameRo, lang)
  }
}
