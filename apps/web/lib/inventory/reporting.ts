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

// A meglévő webes importok (inventory-main-v3, stb.) kompatibilitása.
export { calculateInventoryCurrentValue, getInventoryDisplayName }

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

export const INVENTORY_GUIDE_SECTIONS = [
  {
    id: 'alapok',
    title: 'Alapok és munkamenet',
    description:
      'A hivatalos munkafüzet logikája szerint először az intézmény és a helyszínek alapadatait kell rendbe tenni, utána a tárgyakat csoportonként felvenni, majd a hibajelzéseket lenullázni a végleges jelentés előtt.',
    bullets: [
      'Ne vágjon-másoljon táblázatrészeket, hanem a hibás adatot törölje és írja be újra.',
      'A helyszín és a felelős személy rögzítése a helyszíni leltárívek miatt kulcsfontosságú.',
      'A végleges vagyonleltári jelentés csak hibamentes állapotból adható le.',
    ],
  },
  {
    id: 'kategoriak',
    title: 'Tárgycsoportok',
    description:
      'A hivatalos leltárprogram hét fő tárgycsoporttal dolgozik, ezekhez külön nyomtatványok és összesítő sorok tartoznak.',
    bullets: INVENTORY_CATEGORIES.map(category => `${INVENTORY_CATEGORY_LABELS[category]} / ${INVENTORY_CATEGORY_ROMANIAN_LABELS[category]}`),
  },
  {
    id: 'amortizacio',
    title: 'Használati idők és amortizáció',
    description:
      'Az alapeszközöknél a 2139/2004 szerinti katalóguskód és használati idő alapján kell a maradványértéket számolni. A leltárív és a vagyonleltári jelentés is ebből dolgozik.',
    bullets: [
      'Épületek: jellemzően 40–60 év, alapértelmezésben 50 év.',
      'Kazánok, hőközpontok: jellemzően 8–12 év.',
      'Számítógépek és nyomtatók: jellemzően 2–4 év.',
      'Járművek: jellemzően 4–8 év.',
      'Bútorzat, irodai berendezések: jellemzően 3–15 év.',
    ],
  },
  {
    id: 'nyomtatvanyok',
    title: 'Hivatalos nyomtatványok',
    description:
      'A leltárprogram öt fontos kimenete a helyszíni ellenőrzéstől a végleges leadandó jelentésig különböző célokra szolgál.',
    bullets: INVENTORY_PRINT_TYPES.map(type => `${type.title}: ${type.subtitle}`),
  },
  {
    id: 'hibak',
    title: 'Gyakori hibák',
    description:
      'A hivatalos munkafüzet külön hibalapot tart fenn. A leggyakoribb hibák a hiányzó megnevezés, érték, darabszám, helyszín vagy felelős megadásából származnak.',
    bullets: [
      'Hiányzó tárgynév, érték vagy mennyiség.',
      'Hiányzó helyszín vagy felelős személy.',
      'Törölt tételnél hiányzó kivezetési dátum vagy iratszám.',
      'A végleges jelentés előtti hibajelzések figyelmen kívül hagyása.',
    ],
  },
  {
    id: 'leltar343',
    title: 'Leltar 3_43 munkafüzet — import és export',
    description:
      'A rendszer teljeskörűen ismeri a hivatalos egyházmegyei Leltar 3_43.xlsx munkafüzetet: a kitöltött fájl a Rendszergazdai importáló fülön tölthető be, a nyilvántartás pedig a „Export (Leltar 3_43)" gombbal kitöltött munkafüzetként tölthető le — az eredeti sablon képleteivel, legördülőivel és lapvédelmével.',
    bullets: [
      'Import: mind a 7 tárgycsoport-lapot és a Cimlap helyszín/felelős katalógusát felismerjük; a hiányzó hónap/nap január 1-re, a hiányzó mennyiség 1 darabra áll (a Súgó szabályai szerint).',
      'A negatív sorok részleges kivezetésként, alapeszköznél le-/felértékelésként kerülnek be; a már létező leltári számú tételeket nem írjuk felül.',
      'Export: a kivezetett tételek is a lapokon maradnak (törlés-dátummal és irattal) — a Kukába dobott, kivezetési adat nélküli tételek nem kerülnek bele.',
      'Az exportált fájl megnyitásakor engedélyezze az újraszámolást, ha az Excel rákérdez — a Hibak/Fisa/Leltáriv lapok abból frissülnek.',
    ],
  },
  {
    id: 'kivezetes',
    title: 'Kivezetés (törlés) szabályosan',
    description:
      'A leltárból való törlés a hivatalos rend szerint KIVEZETÉS: a tétel sora megmarad, és a törlés dátuma, iratszáma (pl. presbiteri határozat) és indoklása kerül rá. A Törlés gomb ezért ezeket kéri be.',
    bullets: [
      'A kivezetés dátuma kötelező; az iratszám és az indoklás erősen ajánlott.',
      'Részleges kivezetésnél (pl. 10 székből 3) a mennyiséget csökkentse, és a megjegyzésbe írja a részleteket.',
      'Az alapeszköz-értékhatár a beszerzés napján érvényes szabály szerint értendő: 2013. júliusáig 1800 lej, utána 2500 lej, 2026. február 25-től (OUG 8/2026) 5000 lej — a rendszer a rögzítésnél figyelmeztet, de nem tilt.',
    ],
  },
] as const

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
      return purchaseDate != null && purchaseDate < start && isItemActiveOn(item, start)
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
      openingValue: opening.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, start), 0),
      incomingValue: incoming.reduce((sum, item) => sum + getBookValue(item), 0),
      deletedValue: deleted.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, end), 0),
      closingValue: closing.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, end), 0),
    }
  })
}

function getPrintableStyles(orientation: 'portrait' | 'landscape') {
  const pageWidth = orientation === 'landscape' ? '297mm' : '210mm'
  const pageHeight = orientation === 'landscape' ? '210mm' : '297mm'

  return `
    @page { size: A4 ${orientation}; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; color: #111827; margin: 0; background: #e2e8f0; padding: 18px 0; counter-reset: page; }
    .page { width: ${pageWidth}; min-height: ${pageHeight}; margin: 0 auto 18px; background: #ffffff; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); padding: 12mm; break-after: page; position: relative; }
    .title { font-size: 20px; font-weight: bold; text-align: center; margin-bottom: 8px; text-transform: uppercase; }
    .subtitle { font-size: 12px; text-align: center; margin-bottom: 16px; color: #475569; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 24px; margin-bottom: 18px; font-size: 12px; }
    .meta-grid strong { color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #334155; padding: 6px 7px; vertical-align: top; font-size: 11px; }
    th { background: #e2e8f0; text-align: center; font-weight: bold; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr, td, th { page-break-inside: avoid; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section { margin-top: 16px; }
    .section-title { margin: 0 0 8px; font-size: 14px; font-weight: bold; text-transform: uppercase; }
    .note { margin-top: 12px; border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px; font-size: 11px; color: #475569; }
    .totals { font-weight: bold; background: #f8fafc; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 18px; margin-top: 32px; }
    .signature-box { text-align: center; font-size: 12px; }
    .signature-line { margin-top: 34px; border-top: 1px solid #0f172a; padding-top: 6px; }
    .page-footer { margin-top: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b; }
    .page-number::after { content: "1 / 1"; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .page { width: auto; min-height: auto; margin: 0; box-shadow: none; }
      .page-number::after { content: counter(page) " / " counter(pages); }
    }
  `
}

function wrapDocument(title: string, orientation: 'portrait' | 'landscape', content: string) {
  return `<!DOCTYPE html><html lang="hu"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>${getPrintableStyles(orientation)}</style></head><body>${content}</body></html>`
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
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo))
  const referenceDate = new Date(year, 11, 31)
  const scopedItems = applyInventoryFilters(items, filters, 'purchase')
  const activeItems = scopedItems.filter(item => isItemActiveOn(item, referenceDate))
  const totalCurrentValue = activeItems.reduce((sum, item) => sum + calculateInventoryCurrentValue(item, referenceDate), 0)
  const rows = activeItems
    .map(
      (item, index) => `
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
          <td>${escapeHtml(item.torles_indoklasa || item.megjegyzes || '')}</td>
        </tr>`,
    )
    .join('')

  const content = `
    <div class="page">
      <div class="title">Leltárív</div>
      <div class="subtitle">Lista de inventariere · ${entitasNev}</div>
      <div class="meta-grid">
        <div><strong>Dátum:</strong> 31.12.${year}</div>
        <div><strong>Helyszín / felelős:</strong> ${escapeHtml(filters?.locationFilter || 'Minden helyszín')}</div>
        <div><strong>Kategória:</strong> ${escapeHtml(filters?.categoryLabel || 'Minden tárgycsoport')}</div>
        <div><strong>Szűrt időszak:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>Látható aktív tétel:</strong> ${activeItems.length} db</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nr. crt. / S.sz.</th>
            <th>Denumirea bunurilor inventariate / Felleltározott tárgyak</th>
            <th>Cod / Leltári sz.</th>
            <th>U.M.</th>
            <th>Cant. / Meny.</th>
            <th>Pret u. contabil</th>
            <th>Val. contabilă</th>
            <th>Valoare de inventar</th>
            <th>Deprecierea</th>
            <th>Megjegyzés / Magyarázat</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="totals">
            <td colspan="7" class="text-right">Összes leltári érték</td>
            <td class="text-right">${formatNumber(totalCurrentValue)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
      <div class="page-footer">
        <span>${entitasNev} · Leltárív</span>
        <span>Oldal <span class="page-number"></span></span>
      </div>
    </div>
  `

  return {
    title: 'Leltárív',
    filename: `Leltariv_${year}.pdf`,
    orientation: 'landscape' as const,
    html: wrapDocument('Leltárív', 'landscape', content),
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
) {
  const entitasNev = escapeHtml(hivatalosKetnyelvuNev(congregationName, congregationNameRo))
  const summary = getCategorySummary(applyInventoryFilters(items, filters, 'purchase'), year)
  const rows = [
    ['1', 'Mijloace fixe', summary.find(row => row.category === 'alapeszkoz')?.closingValue || 0],
    ['2', 'Terenuri si amplasamenturi', summary.find(row => row.category === 'telek')?.closingValue || 0],
    ['3', 'Investiții în curs', 0],
    ['4', 'Obiecte de inventar', summary.find(row => row.category === 'csekely')?.closingValue || 0],
    ['5', 'Cărți', summary.find(row => row.category === 'konyv')?.closingValue || 0],
    ['6', 'Obiecte de cult', summary.find(row => row.category === 'kegyszer')?.closingValue || 0],
    ['7', 'Acțiuni și titluri de proprietate', summary.find(row => row.category === 'karpotlasi')?.closingValue || 0],
    ['8', 'Custodie', summary.find(row => row.category === 'bizomanyi')?.closingValue || 0],
    ['9', 'Casa', financeSummary?.closingCash || 0],
    ['10', 'Creanțe', financeSummary?.closingReceivables || 0],
  ]
    .map(
      ([index, label, value]) => `
        <tr>
          <td class="text-center">${index}</td>
          <td>${escapeHtml(String(label))}</td>
          <td class="text-right">${formatNumber(Number(value))}</td>
          <td class="text-right">${formatNumber(Number(value))}</td>
        </tr>`,
    )
    .join('')

  const content = `
    <div class="page">
      <div class="title">Registru inventar</div>
      <div class="subtitle">${entitasNev} · la data de 31.12.${year}</div>
      <div class="meta-grid">
        <div><strong>Kategória:</strong> ${escapeHtml(filters?.categoryLabel || 'Minden tárgycsoport')}</div>
        <div><strong>Helyszín:</strong> ${escapeHtml(filters?.locationFilter || 'Minden helyszín')}</div>
        <div><strong>Szűrt időszak:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>Záró pénztár / követelés:</strong> ${formatNumber(financeSummary?.closingCash || 0)} / ${formatNumber(financeSummary?.closingReceivables || 0)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nr</th>
            <th>Recapitulatia elementelor inventariate</th>
            <th>Valoare contabilă</th>
            <th>Valoare de inventar</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="note">
        A pénztár és a követelések sorai a kiválasztott időszak pénzügyi adataiból töltődnek, a leltári tárgycsoportok pedig a nyilvántartott vagyonelemek alapján számolódnak.
      </div>
      <div class="page-footer">
        <span>${entitasNev} · Registru inventar</span>
        <span>Oldal <span class="page-number"></span></span>
      </div>
    </div>
  `

  return {
    title: 'Registru inventar',
    filename: `Registru_inventar_${year}.pdf`,
    orientation: 'portrait' as const,
    html: wrapDocument('Registru inventar', 'portrait', content),
  }
}

function buildAktivPasszivReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  financeSummary?: InventoryPrintFinanceSummary | null,
) {
  const summary = getCategorySummary(applyInventoryFilters(items, filters, 'purchase'), year)
  const rows = [
    ['1', 'Sold inițial casă / Nyitó pénztáregyenleg', financeSummary?.openingCash || 0],
    ['2', 'Încasări numerar / Időszaki készpénzbevétel', financeSummary?.periodCashIncome || 0],
    ['3', 'Plăți numerar / Időszaki készpénzkiadás', financeSummary?.periodCashExpense || 0],
    ['4', 'Sold final casă / Záró pénztáregyenleg', financeSummary?.closingCash || 0],
    ['5', 'Creanțe / Követelések', financeSummary?.closingReceivables || 0],
    ['6', 'Imobilizări / Alapeszközök, telkek, földek', (summary.find(row => row.category === 'alapeszkoz')?.closingValue || 0) + (summary.find(row => row.category === 'telek')?.closingValue || 0)],
    ['7', 'Obiecte de inventar / Csekély értékű tárgyak', summary.find(row => row.category === 'csekely')?.closingValue || 0],
    ['8', 'Cărți / Könyvek', summary.find(row => row.category === 'konyv')?.closingValue || 0],
    ['9', 'Obiecte de cult / Kegyszerek', summary.find(row => row.category === 'kegyszer')?.closingValue || 0],
    ['10', 'Acțiuni și titluri / Kárpótlási jegyek', summary.find(row => row.category === 'karpotlasi')?.closingValue || 0],
    ['11', 'Custodie / Bizományi', summary.find(row => row.category === 'bizomanyi')?.closingValue || 0],
  ]
    .map(
      ([index, label, value]) => `
        <tr>
          <td class="text-center">${index}</td>
          <td>${escapeHtml(String(label))}</td>
          <td class="text-right">${formatNumber(Number(value))}</td>
        </tr>`,
    )
    .join('')

  const content = `
    <div class="page">
      <div class="title">Situația elementelor de activ și pasiv</div>
      <div class="subtitle">Az aktív és passzív elemek egyenlege · ${escapeHtml(congregationName)} · ${year}</div>
      <div class="meta-grid">
        <div><strong>Kategória:</strong> ${escapeHtml(filters?.categoryLabel || 'Minden tárgycsoport')}</div>
        <div><strong>Helyszín:</strong> ${escapeHtml(filters?.locationFilter || 'Minden helyszín')}</div>
        <div><strong>Szűrt időszak:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>Összes pénzügyi forgalom:</strong> ${formatNumber(financeSummary?.periodIncome || 0)} / ${formatNumber(financeSummary?.periodExpense || 0)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Nr.</th>
            <th>Tétel</th>
            <th>Záró érték</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="note">
        A pénztár és követelések sorai a kiválasztott periódus pénzügyi egyeztetéséből töltődnek, a többi sor a nyilvántartott vagyonelemek alapján számolódik.
      </div>
      <div class="page-footer">
        <span>${escapeHtml(congregationName)} · Aktív és passzív elemek</span>
        <span>Oldal <span class="page-number"></span></span>
      </div>
    </div>
  `

  return {
    title: 'Aktív és passzív elemek',
    filename: `Aktiv_passziv_${year}.pdf`,
    orientation: 'portrait' as const,
    html: wrapDocument('Aktív és passzív elemek', 'portrait', content),
  }
}

function buildDeletedItemsReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
) {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31)
  const deletedItems = applyInventoryFilters(items, filters, 'deleted').filter(item => {
    const deletionDate = normalizeDate(item.torles_datuma)
    if (deletionDate) return deletionDate >= start && deletionDate <= end
    return item.deleted && year === new Date().getFullYear()
  })

  const rows = deletedItems
    .map(
      (item, index) => `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>${formatDate(item.torles_datuma)}</td>
          <td>${escapeHtml(getInventoryDisplayName(item))}</td>
          <td>${escapeHtml(item.leltari_szam || '—')}</td>
          <td>${escapeHtml(item.mertekegyseg || 'db')}</td>
          <td class="text-center">${getQuantity(item)}</td>
          <td class="text-right">${formatNumber(getBookValue(item))}</td>
          <td>${escapeHtml(item.torles_indoklasa || item.torles_bizonylat || 'Nincs részletezve')}</td>
        </tr>`,
    )
    .join('')

  const content = `
    <div class="page">
      <div class="title">Leltárból törölt tárgyak</div>
      <div class="subtitle">${escapeHtml(congregationName)} · ${year}.01.01 – ${year}.12.31.</div>
      <div class="meta-grid">
        <div><strong>Kategória:</strong> ${escapeHtml(filters?.categoryLabel || 'Minden tárgycsoport')}</div>
        <div><strong>Helyszín:</strong> ${escapeHtml(filters?.locationFilter || 'Minden helyszín')}</div>
        <div><strong>Szűrt időszak:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>Törölt tételek:</strong> ${deletedItems.length} db</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>S.sz.</th>
            <th>Dátum</th>
            <th>Felleltározott tárgyak elnevezése</th>
            <th>Leltári sz.</th>
            <th>M.E.</th>
            <th>Meny.</th>
            <th>Könyvelési érték</th>
            <th>Indoklás / igazoló irat</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8" class="text-center">A megadott időszakban nincs törölt leltári tétel.</td></tr>'}</tbody>
      </table>
      <div class="page-footer">
        <span>${escapeHtml(congregationName)} · Törölt leltári tárgyak</span>
        <span>Oldal <span class="page-number"></span></span>
      </div>
    </div>
  `

  return {
    title: 'Leltárból törölt tárgyak',
    filename: `Leltarbol_torolt_targyak_${year}.pdf`,
    orientation: 'landscape' as const,
    html: wrapDocument('Leltárból törölt tárgyak', 'landscape', content),
  }
}

function buildVagyonReport(
  items: InventoryItem[],
  congregationName: string,
  year: number,
  filters?: InventoryReportFilters,
  financeSummary?: InventoryPrintFinanceSummary | null,
) {
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

  const rows = [...summary.map((row) => ({
      labelHu: INVENTORY_CATEGORY_LABELS[row.category],
      labelRo: INVENTORY_CATEGORY_ROMANIAN_LABELS[row.category],
      opening: row.openingValue,
      incoming: row.incomingValue,
      outgoing: row.deletedValue,
      closing: row.closingValue,
    })), ...extraRows]
    .map(
      (row, index) => `
        <tr>
          <td class="text-center">${index + 1}</td>
          <td>${escapeHtml(row.labelHu)}<br><span style="font-size: 10px; color: #475569;">${escapeHtml(row.labelRo)}</span></td>
          <td class="text-right">${formatNumber(row.opening)}</td>
          <td class="text-right">${formatNumber(row.incoming)}</td>
          <td class="text-right">${formatNumber(row.outgoing)}</td>
          <td class="text-right">${formatNumber(row.closing)}</td>
        </tr>`,
    )
    .join('')

  const totalOpening = [...summary.map((row) => row.openingValue), ...extraRows.map((row) => row.opening)].reduce((sum, value) => sum + value, 0)
  const totalIncoming = [...summary.map((row) => row.incomingValue), ...extraRows.map((row) => row.incoming)].reduce((sum, value) => sum + value, 0)
  const totalDeleted = [...summary.map((row) => row.deletedValue), ...extraRows.map((row) => row.outgoing)].reduce((sum, value) => sum + value, 0)
  const totalClosing = [...summary.map((row) => row.closingValue), ...extraRows.map((row) => row.closing)].reduce((sum, value) => sum + value, 0)

  const content = `
    <div class="page">
      <div class="title">Vagyonleltári jelentés</div>
      <div class="subtitle">${escapeHtml(congregationName)} · ${year}. évről · 31.12.${year} állapot szerint</div>
      <div class="meta-grid">
        <div><strong>Kategória:</strong> ${escapeHtml(filters?.categoryLabel || 'Minden tárgycsoport')}</div>
        <div><strong>Helyszín:</strong> ${escapeHtml(filters?.locationFilter || 'Minden helyszín')}</div>
        <div><strong>Szűrt időszak:</strong> ${escapeHtml(formatPeriodLabel(filters))}</div>
        <div><strong>Pénztár / követelés záró érték:</strong> ${formatNumber(financeSummary?.closingCash || 0)} / ${formatNumber(financeSummary?.closingReceivables || 0)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Sz.</th>
            <th>Tárgycsoport</th>
            <th>Előző évi egyenleg</th>
            <th>Bejövetel / Bevétel</th>
            <th>Törlés / Kiadás</th>
            <th>Év végi egyenleg</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="totals">
            <td colspan="2" class="text-right">Összesen</td>
            <td class="text-right">${formatNumber(totalOpening)}</td>
            <td class="text-right">${formatNumber(totalIncoming)}</td>
            <td class="text-right">${formatNumber(totalDeleted)}</td>
            <td class="text-right">${formatNumber(totalClosing)}</td>
          </tr>
        </tfoot>
      </table>
      <div class="signature-grid">
        <div class="signature-box">
          Lelkipásztor
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          Gondnok
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          Ellenőr / számvevő
          <div class="signature-line"></div>
        </div>
      </div>
      <div class="page-footer">
        <span>${escapeHtml(congregationName)} · Vagyonleltári jelentés</span>
        <span>Oldal <span class="page-number"></span></span>
      </div>
    </div>
  `

  return {
    title: 'Vagyonleltári jelentés',
    filename: `Vagyonleltari_jelentes_${year}.pdf`,
    orientation: 'portrait' as const,
    html: wrapDocument('Vagyonleltári jelentés', 'portrait', content),
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
}: {
  type: InventoryPrintType
  items: InventoryItem[]
  congregationName: string
  /**
   * 2026-08-22 (6. pont): a kiállító hivatalos ROMÁN neve (`nev_ro`).
   *
   * ⚠️ SZÁNDÉKOSAN CSAK A KÉT ROMÁN ÍVRE megy tovább („Lista de inventariere",
   * „Registru inventar"). A másik három nyomtatvány (Aktív–passzív, Törölt
   * tárgyak, Vagyonleltári jelentés) végig MAGYAR belső kimutatás — oda a
   * román név csak zajt vinne, nem hivatalos elvárást teljesítene.
   */
  congregationNameRo?: string
  year: number
  filters?: InventoryReportFilters
  financeSummary?: InventoryPrintFinanceSummary | null
}) {
  switch (type) {
    case 'leltariv':
      return buildLeltarivReport(items, congregationName, year, filters, congregationNameRo)
    case 'registru_inventar':
      return buildRegistruReport(items, congregationName, year, filters, financeSummary, congregationNameRo)
    case 'aktiv_passziv':
      return buildAktivPasszivReport(items, congregationName, year, filters, financeSummary)
    case 'torolt_targyak':
      return buildDeletedItemsReport(items, congregationName, year, filters)
    case 'vagyonleltari_jelentes':
      return buildVagyonReport(items, congregationName, year, filters, financeSummary)
  }
}
