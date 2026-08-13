'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, CircleHelp, FileSearch, FileText, Link2, Printer, Scale, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { EmptyFirstRecord } from '@/components/ui/empty-first-record'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModuleHero } from '@/components/shared/module-hero'
import { ColorTabs } from '@/components/ui/color-tabs'
// 2026-08-11 (K5-#12): a feloldási kérelem indoklása eddig `window.prompt`-tal
// kérdezett. Ez a már meglévő, indok-mezős megerősítő dialógus váltja ki
// (ugyanaz, amit az admin-felületek és a programtervező is használ).
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import { InventoryAmortizationDialog } from '@/components/inventory/inventory-amortization-dialog'
import { InventoryGuideTab } from '@/components/inventory/inventory-guide-tab'
import { MaterialWarehouseTab } from '@/components/inventory/material-warehouse-tab'
import {
  getAnyagraktarStats,
  type AnyagraktarStats,
} from '@/app/(dashboard)/leltar/anyagraktar-actions'
import { InventoryPrintDialog } from '@/components/inventory/inventory-print-dialog-v2'
import {
  deleteInventoryItem,
  finalizeLeltar,
  getInventoryItems,
  getLeltarFinalizationStatus,
  getLeltarReportYear,
  listExpensesForInventoryPicker,
  requestLeltarUnlock,
  saveInventoryItem,
} from '@/app/(dashboard)/leltar/actions'
import type { ExpensePickerRow } from '@/lib/inventory/expense-picker-types'
import { submitDocument } from '@/app/(dashboard)/dashboard-egyhazmegye/document-actions'
import {
  INVENTORY_AMORTIZATION_CATALOG,
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ROMANIAN_LABELS,
  getInventoryAmortizationCatalogEntry,
  getInventoryCategoryLabel,
  type InventoryCategory,
  type InventoryItem,
} from '@/lib/constants/inventory.next'
import { calculateInventoryCurrentValue } from '@/lib/inventory/reporting'
import { buildInventoryItemCardHtml, type InventoryItemCardData } from '@/lib/inventory/item-card-print'
import { printToBrowser } from '@/lib/utils/print-engine-v2'
import { formatCurrency } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface InventoryMainProps {
  congregationName?: string
  /** 2026-05-25: ha true, "Rendszergazdai importáló" tab a sor végén (red-prominent). */
  showAdminImport?: boolean
  /** A Rendszergazdai importáló tab tartalma. */
  adminImportContent?: React.ReactNode
}

type LeltarTab = 'nyilvantartas' | 'anyagraktar' | 'sugo'
type ActiveView = 'tab' | 'admin-import'

export function InventoryMain({ congregationName, showAdminImport = false, adminImportContent }: InventoryMainProps) {
  const [activeTab, setActiveTab] = useState<LeltarTab>('nyilvantartas')
  const [activeView, setActiveView] = useState<ActiveView>('tab')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [amortizationDialogOpen, setAmortizationDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)
  const [amortizationItem, setAmortizationItem] = useState<InventoryItem | null>(null)
  const [isFinalized, setIsFinalized] = useState(false)
  const [unlockRequested, setUnlockRequested] = useState(false)
  // 2026-08-11 (K5-#12): a feloldási kérelem indoklásának állapota (a
  // `window.prompt` helyett rendes dialógus, kötelező indoklással).
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [unlockSending, setUnlockSending] = useState(false)
  // 2026-08-11 (P1 #24): melyik ÉV vagyonleltári jelentéséről van szó. A szerver
  // adja (documentSeasonYear) — ugyanaz a kulcs, mint a véglegesítésé és a
  // beküldésé, így a lelkész is látja, mit zár le éppen.
  const [reportYear, setReportYear] = useState<number | null>(null)
  const [anyagraktarStats, setAnyagraktarStats] = useState<AnyagraktarStats | null>(null)

  const [fMegnevezes, setFMegnevezes] = useState('')
  const [fKategoria, setFKategoria] = useState<InventoryCategory>('alapeszkoz')
  const [fErtek, setFErtek] = useState<number>(0)
  const [fDatum, setFDatum] = useState('')
  const [fHelyszin, setFHelyszin] = useState('')
  const [fFelelos, setFFelelos] = useState('')
  const [fMegj, setFMegj] = useState('')
  const [fMennyiseg, setFMennyiseg] = useState<number>(1)
  const [fMertekegyseg, setFMertekegyseg] = useState('db')
  const [fBizonylat, setFBizonylat] = useState('')
  const [fKatalogusKod, setFKatalogusKod] = useState('')
  const [fHasznalatiIdo, setFHasznalatiIdo] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  // 2026-08-09: élő fişă-előnézet a tétel-űrlaphoz (xl+ oldalsó oszlop /
  // kisebb kijelzőn gombbal nyíló réteg) — a person-card-print (PR-17) mintája.
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewOverlayOpen, setPreviewOverlayOpen] = useState(false)
  // 2026-08-09: „Kikeresés a könyvelésből" — kapcsolt kiadás (penzugy_xkey) +
  // a kiadás-választó állapota.
  const [fPenzugyXkey, setFPenzugyXkey] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerRows, setPickerRows] = useState<ExpensePickerRow[]>([])
  const [pickerYears, setPickerYears] = useState<number[]>([])
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear())
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerShowLinked, setPickerShowLinked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, status, araktar, year] = await Promise.all([
      getInventoryItems(),
      getLeltarFinalizationStatus(),
      getAnyagraktarStats(),
      // 2026-08-11 (P1 #24): a jelentés év-kulcsa a szerverről jön, hogy a
      // képernyőn megjelenő év, a véglegesítés és a beküldés ne csúszhasson szét.
      getLeltarReportYear(),
    ])
    setItems(data)
    setIsFinalized(status.finalized)
    setUnlockRequested(status.unlockRequested)
    setReportYear(year)
    if (araktar.data) setAnyagraktarStats(araktar.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [load])

  const activeItems = useMemo(() => items.filter(item => !item.deleted), [items])

  const locationOptions = useMemo(
    () => [...new Set(activeItems.map(item => item.helyszin).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'hu')),
    [activeItems],
  )

  const filtered = useMemo(() => {
    const normalizedQuery = searchQuery
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

    const startDate = periodStart ? new Date(`${periodStart}T00:00:00`) : null
    const endDate = periodEnd ? new Date(`${periodEnd}T23:59:59`) : null

    return activeItems.filter(item => {
      const categoryMatches = !categoryFilter || item.kategoria_key === categoryFilter
      const locationMatches = !locationFilter || (item.helyszin || '') === locationFilter
      const itemDate = item.beszerzes_datuma
        ? new Date(item.beszerzes_datuma.includes('T') ? item.beszerzes_datuma : `${item.beszerzes_datuma}T00:00:00`)
        : null
      const periodMatches =
        (!startDate || (itemDate && itemDate.getTime() >= startDate.getTime())) &&
        (!endDate || (itemDate && itemDate.getTime() <= endDate.getTime()))
      const queryMatches =
        !normalizedQuery ||
        `${item.megnevezes} ${item.leltari_szam || ''} ${item.helyszin || ''} ${item.felelos_nev || ''} ${item.beszerzes_bizonylat || ''}`
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .includes(normalizedQuery)

      return categoryMatches && locationMatches && periodMatches && queryMatches
    })
  }, [activeItems, categoryFilter, locationFilter, periodEnd, periodStart, searchQuery])

  const totalBookValue = useMemo(
    () => filtered.reduce((sum, item) => sum + (Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1), 0),
    [filtered],
  )

  const totalCurrentValue = useMemo(
    () => filtered.reduce((sum, item) => sum + calculateInventoryCurrentValue(item), 0),
    [filtered],
  )

  const deletedCount = useMemo(() => items.filter(item => item.deleted).length, [items])

  // ── 2026-08-11 (K5-#30): az egyházmegyének beküldött KANONIKUS vagyonleltár ──
  // A beküldés eddig `items.length`-et küldött, vagyis a TÖRÖLT tételeket is
  // beleszámolta: a lelkész 40 tételből 8-at kidobott, a képernyőn 32-t látott,
  // az esperes viszont 40-et kapott a hivatalos beküldésben. A képernyő másik
  // száma (`filtered`) sem jó forrás, mert azt a kereső/kategória/időszak szűrő
  // is befolyásolja. A választók névjegyzéke ezt tudatosan jól oldja meg
  // (members/voters-tab.tsx:171-174): a KANONIKUS definíciót küldi, nem a
  // képernyő pillanatnyi szűrőit. A leltár kanonikus definíciója: minden NEM
  // TÖRÖLT tétel — ugyanaz az `activeItems`, amiből a lista is épül.
  const canonItemCount = activeItems.length
  // A vagyonleltár lényege az ÉRTÉK, nem a darabszám — a beszerzési és az
  // amortizált (aktuális) értéket is beletesszük a snapshotba, hogy az esperes
  // utólag is vissza tudja keresni, mit fogadott be.
  const canonTotalBookValue = useMemo(
    () => activeItems.reduce((sum, item) => sum + (Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1), 0),
    [activeItems],
  )
  const canonTotalCurrentValue = useMemo(
    () => activeItems.reduce((sum, item) => sum + calculateInventoryCurrentValue(item), 0),
    [activeItems],
  )
  const selectedCatalogEntry = useMemo(
    () => getInventoryAmortizationCatalogEntry(fKatalogusKod || null),
    [fKatalogusKod],
  )

  // ── 2026-08-09: élő fişă-előnézet — az űrlap pillanatnyi értékeiből ──────
  const formCardData = useCallback((): InventoryItemCardData => {
    const catalogEntry = getInventoryAmortizationCatalogEntry(fKatalogusKod || null)
    // Szintetikus tétel az amortizáció-számításhoz (csak a használt mezőkkel).
    const syntheticItem = {
      kategoria_key: fKategoria,
      beszerzes_erteke: fErtek || 0,
      mennyiseg: fMennyiseg || 1,
      hasznalati_ido: fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
      beszerzes_datuma: fDatum || null,
    } as InventoryItem
    return {
      congregationName: congregationName || 'Gyülekezet',
      leltariSzam: editItem?.leltari_szam ?? null,
      regiLeltariSzam: editItem?.regi_leltari_szam ?? null,
      megnevezes: fMegnevezes,
      kategoriaLabel: INVENTORY_CATEGORY_LABELS[fKategoria],
      kategoriaLabelRo: INVENTORY_CATEGORY_ROMANIAN_LABELS[fKategoria],
      isAlapeszkoz: fKategoria === 'alapeszkoz',
      mennyiseg: fMennyiseg || 1,
      mertekegyseg: fMertekegyseg || 'db',
      beszerzesDatuma: fDatum || null,
      beszerzesBizonylat: fBizonylat || null,
      beszerzesErteke: fErtek > 0 ? fErtek : null,
      katalogusKod: fKategoria === 'alapeszkoz' ? fKatalogusKod || null : null,
      katalogusNev: fKategoria === 'alapeszkoz' ? catalogEntry?.nev ?? null : null,
      hasznalatiIdoEv: fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
      aktualisErtek: fErtek > 0 ? calculateInventoryCurrentValue(syntheticItem) : null,
      helyszin: fHelyszin || null,
      felelosNev: fFelelos || null,
      megjegyzes: fMegj || null,
      szerzo: editItem?.szerzo ?? null,
      konyvIsbn: editItem?.konyv_isbn ?? null,
    }
  }, [congregationName, editItem, fBizonylat, fDatum, fErtek, fFelelos, fHasznalatiIdo, fHelyszin, fKategoria, fKatalogusKod, fMegj, fMegnevezes, fMennyiseg, fMertekegyseg])

  // 2026-08-11: a bezáráskori ürítés ÁTKERÜLT eseménykezelőbe
  // (`handleDialogOpenChange`) — az effect törzsében hívott setState
  // kaszkádoló újrarendert okozott (react-hooks/set-state-in-effect).
  // A `setTimeout`-os ág marad, az nem szinkron setState.
  function handleDialogOpenChange(next: boolean) {
    if (!next) {
      setPreviewOverlayOpen(false)
      // Ürítjük az előnézetet, hogy újranyitáskor ne az előző tétel fişája villanjon fel.
      setPreviewHtml('')
    }
    setDialogOpen(next)
  }

  // Gépelés közben (300 ms késleltetéssel) frissül a fişă-előnézet.
  useEffect(() => {
    if (!dialogOpen) return
    const t = window.setTimeout(() => {
      setPreviewHtml(buildInventoryItemCardHtml(formCardData()).html)
    }, 300)
    return () => window.clearTimeout(t)
  }, [dialogOpen, formCardData])

  function handlePreviewPrint() {
    void printToBrowser(buildInventoryItemCardHtml(formCardData()).html)
  }

  const itemToCardData = useCallback((item: InventoryItem): InventoryItemCardData => {
    const entry = getInventoryAmortizationCatalogEntry(item.katalogus_kod)
    return {
      congregationName: congregationName || 'Gyülekezet',
      leltariSzam: item.leltari_szam,
      regiLeltariSzam: item.regi_leltari_szam,
      megnevezes: item.megnevezes,
      kategoriaLabel: getInventoryCategoryLabel(item.kategoria),
      kategoriaLabelRo: item.kategoria_key ? INVENTORY_CATEGORY_ROMANIAN_LABELS[item.kategoria_key] : null,
      isAlapeszkoz: item.kategoria_key === 'alapeszkoz',
      mennyiseg: item.mennyiseg,
      mertekegyseg: item.mertekegyseg,
      beszerzesDatuma: item.beszerzes_datuma,
      beszerzesBizonylat: item.beszerzes_bizonylat,
      beszerzesErteke: item.beszerzes_erteke || null,
      katalogusKod: item.katalogus_kod,
      katalogusNev: entry?.nev ?? null,
      hasznalatiIdoEv: item.hasznalati_ido,
      aktualisErtek: calculateInventoryCurrentValue(item),
      helyszin: item.helyszin,
      felelosNev: item.felelos_nev,
      megjegyzes: item.megjegyzes,
      szerzo: item.szerzo,
      konyvIsbn: item.konyv_isbn,
    }
  }, [congregationName])

  function handleRowFisaPrint(item: InventoryItem) {
    void printToBrowser(buildInventoryItemCardHtml(itemToCardData(item)).html)
  }

  async function handleFinalize() {
    // 2026-08-11 (P1 #24): a megerősítő szöveg is megnevezi az évet — így derül
    // ki azonnal, ha a lelkész nem arra az évre gondolt.
    const yearLabel = reportYear ? `A(z) ${reportYear}. évi vagyonleltári jelentés` : 'A vagyonleltári jelentés'
    if (!window.confirm(`${yearLabel} véglegesítése után új jelentést nem lehet lezárni, amíg az egyházmegye feloldást nem ad. A leltári tételek ettől még tovább szerkeszthetők. Folytatja?`)) {
      return
    }

    const result = await finalizeLeltar()
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(
      reportYear
        ? `A(z) ${reportYear}. évi vagyonleltári jelentés véglegesítve lett.`
        : 'A vagyonleltári jelentés véglegesítve lett.',
    )
    await load()
  }

  // ── 2026-08-11 (K5-#12): feloldási kérelem indoklással ────────────────────
  // MI VOLT A HIBA: az indoklást `window.prompt` kérdezte, és a kód csak a
  // `null`-t (Mégse) szűrte — az ÜRES sztring átment, a szerver `|| null`-ként
  // mentette, így az esperes indoklás NÉLKÜLI feloldási kérelmet kapott, amit
  // nem tudott elbírálni, a lelkész viszont „elküldve" visszajelzést látott.
  // Ráadásul a `window.prompt` telefonon egysoros és nem méretezhető, Firefox
  // pedig ismételt használat után letiltatja a további dialógusokat — ekkor a
  // funkció NÉMÁN elérhetetlenné vált.
  async function submitUnlockRequest(reason?: string) {
    const trimmed = (reason || '').trim()
    if (!trimmed) {
      toast.error('Kérjük, írja le, miért kéri a jelentés feloldását — enélkül az esperes nem tudja elbírálni a kérelmet.')
      return
    }

    setUnlockSending(true)
    const result = await requestLeltarUnlock(trimmed)
    setUnlockSending(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    setUnlockDialogOpen(false)
    toast.success('Feloldási kérelem elküldve az egyházmegyének.')
    await load()
  }

  function openDialog(item?: InventoryItem) {
    if (item) {
      setEditItem(item)
      setFMegnevezes(item.megnevezes)
      setFKategoria(item.kategoria_key || 'alapeszkoz')
      setFErtek(item.beszerzes_erteke)
      setFDatum(item.beszerzes_datuma?.split('T')[0] || '')
      setFHelyszin(item.helyszin || '')
      setFFelelos(item.felelos_nev || '')
      setFMegj(item.megjegyzes || '')
      setFMennyiseg(item.mennyiseg || 1)
      setFMertekegyseg(item.mertekegyseg || 'db')
      setFBizonylat(item.beszerzes_bizonylat || '')
      setFKatalogusKod(item.katalogus_kod || '')
      setFHasznalatiIdo(item.hasznalati_ido || '')
      setFPenzugyXkey(item.penzugy_xkey || '')
    } else {
      setEditItem(null)
      setFMegnevezes('')
      setFKategoria('alapeszkoz')
      setFErtek(0)
      setFDatum('')
      setFHelyszin('')
      setFFelelos('')
      setFMegj('')
      setFMennyiseg(1)
      setFMertekegyseg('db')
      setFBizonylat('')
      setFKatalogusKod('')
      setFHasznalatiIdo('')
      setFPenzugyXkey('')
    }

    setDialogOpen(true)
  }

  // ── 2026-08-09: „Kikeresés a könyvelésből" ────────────────────────────────
  async function loadPickerRows(year: number) {
    setPickerLoading(true)
    const res = await listExpensesForInventoryPicker(year)
    if (res.error) {
      toast.error(res.error)
    } else {
      setPickerRows(res.rows || [])
      if (res.years?.length) setPickerYears(res.years)
    }
    setPickerLoading(false)
  }

  function openExpensePicker() {
    setPickerQuery('')
    setPickerOpen(true)
    void loadPickerRows(pickerYear)
  }

  function applyPickedExpense(row: ExpensePickerRow) {
    setFErtek(row.osszeg)
    if (row.datum) setFDatum(row.datum)
    setFBizonylat(row.iratszam || row.nyugta || '')
    setFPenzugyXkey(row.xkey)
    // Kategória-javaslat csak akkor, ha a jogcím leltár-köteles.
    if (row.invKategoria) {
      setFKategoria(row.invKategoria)
      if (row.invKategoria !== 'alapeszkoz') {
        setFKatalogusKod('')
        setFHasznalatiIdo('')
      }
    }
    if (!fMegnevezes.trim() && row.megjegyzes?.trim()) setFMegnevezes(row.megjegyzes.trim())
    if (!fMegj.trim() && row.atvevo?.trim()) setFMegj(`Szállító: ${row.atvevo.trim()}`)
    setPickerOpen(false)
    toast.success('A kiadás adatai betöltve — a mentés össze is kapcsolja a két tételt.')
  }

  const filteredPickerRows = useMemo(() => {
    const q = pickerQuery
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
    return pickerRows.filter(row => {
      if (!pickerShowLinked && row.linked) return false
      if (!q) return true
      return `${row.atvevo || ''} ${row.iratszam || ''} ${row.nyugta || ''} ${row.megjegyzes || ''} ${row.kodNev || ''} ${row.kod || ''} ${row.osszeg}`
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .includes(q)
    })
  }, [pickerRows, pickerQuery, pickerShowLinked])

  function openAmortizationDialog(item: InventoryItem) {
    setAmortizationItem(item)
    setAmortizationDialogOpen(true)
  }

  async function handleSave() {
    if (!fMegnevezes.trim()) {
      toast.error('A megnevezés kötelező.')
      return
    }

    if (fErtek <= 0) {
      toast.error('Az érték pozitív szám kell legyen.')
      return
    }

    setSaving(true)
    const result = await saveInventoryItem({
      id: editItem?.id,
      megnevezes: fMegnevezes.trim(),
      kategoria: fKategoria,
      beszerzes_erteke: fErtek,
      beszerzes_datuma: fDatum || null,
      helyszin: fHelyszin || null,
      felelos_nev: fFelelos || null,
      megjegyzes: fMegj || null,
      mennyiseg: fMennyiseg,
      mertekegyseg: fMertekegyseg || 'db',
      beszerzes_bizonylat: fBizonylat || null,
      katalogus_kod: fKategoria === 'alapeszkoz' ? fKatalogusKod || null : null,
      hasznalati_ido: fKategoria === 'alapeszkoz' && fHasznalatiIdo !== '' ? Number(fHasznalatiIdo) : null,
      penzugy_xkey: fPenzugyXkey || null,
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editItem ? 'A leltári tétel frissült.' : 'A leltári tétel rögzítve lett.')
      handleDialogOpenChange(false)
      await load()
    }

    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Biztosan törli ezt a leltári tételt?')) return

    const result = await deleteInventoryItem(id)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('A leltári tétel törölve lett.')
    await load()
  }

  return (
    <>
      <ModuleHero
        eyebrow="Leltár"
        title="Gyülekezeti vagyonleltár"
        description="A hivatalos leltárprogram logikájához igazított, kereshető, helyszín és időszak szerint szűrhető, többféle hivatalos nyomtatványt kezelő felület."
        pills={[
          congregationName ? { label: congregationName, tone: 'neutral' } : undefined,
          { label: `${filtered.length} aktív tétel`, tone: 'emerald' },
          { label: `${deletedCount} törölt tétel`, tone: 'amber' },
          { label: isFinalized ? 'Vagyonleltári jelentés véglegesítve' : 'Jelentés szerkeszthető', tone: isFinalized ? 'amber' : 'teal' },
        ].filter(Boolean) as { label: string; tone?: 'neutral' | 'emerald' | 'amber' | 'teal' }[]}
      />

      <ColorTabs
        tabs={[
          { value: 'nyilvantartas', label: 'Leltári nyilvántartás', color: 'teal', count: filtered.length },
          { value: 'anyagraktar', label: 'Anyagraktár', color: 'emerald' },
          { value: 'sugo', label: 'Súgó', color: 'teal' },
          // 2026-05-25: Rendszergazdai importáló a sor végén, red-prominent háttérrel
          ...(showAdminImport ? [
            { value: 'admin-import', label: 'Rendszergazdai importáló', color: 'red-prominent' },
          ] : []),
        ]}
        active={activeView === 'admin-import' ? 'admin-import' : activeTab}
        onChange={value => {
          if (value === 'admin-import') {
            setActiveView('admin-import')
          } else {
            setActiveView('tab')
            setActiveTab(value as LeltarTab)
          }
        }}
      />

      {activeView === 'admin-import' && showAdminImport ? (
        adminImportContent
      ) : activeTab === 'sugo' ? (
        <InventoryGuideTab />
      ) : activeTab === 'anyagraktar' ? (
        <MaterialWarehouseTab congregationName={congregationName || ''} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Látható tételek" value={`${filtered.length} db`} />
            <StatCard label="Könyv szerinti érték" value={`${formatCurrency(totalBookValue)} RON`} accent="text-slate-800" />
            <StatCard label="Leltári érték" value={`${formatCurrency(totalCurrentValue)} RON`} accent="text-emerald-600" />
            <StatCard label="Helyszínek" value={`${locationOptions.length} db`} />
          </div>

          {/* Vagyonleltári jelentés összesítő — tartalmazza az Anyagraktárt is */}
          {anyagraktarStats && (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/50 to-yellow-50/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
                    <Scale className="size-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Vagyonleltári jelentés összesítő
                    </p>
                    <p className="text-sm text-slate-700">
                      Leltári tárgyak: <strong>{formatCurrency(totalCurrentValue)} RON</strong>
                      {' · '}
                      Anyagraktár: <strong>{formatCurrency(anyagraktarStats.osszes_keszlet_ertek)} RON</strong>
                      {' · '}
                      <span className="text-amber-900 font-bold">
                        Mindösszesen: {formatCurrency(totalCurrentValue + anyagraktarStats.osszes_keszlet_ertek)} RON
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('anyagraktar')}
                  className="text-xs font-medium text-amber-700 underline hover:text-amber-900"
                >
                  Anyagraktár megnyitása →
                </button>
              </div>
            </div>
          )}

          <div className="card-raised flex flex-col gap-3 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[210px_210px_180px_180px_minmax(240px,1fr)]">
                <label className="text-sm font-medium text-slate-700">
                  Kategória
                  <select
                    value={categoryFilter}
                    onChange={event => setCategoryFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Minden kategória</option>
                    {INVENTORY_CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {INVENTORY_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Helyszín / felelős
                  <select
                    value={locationFilter}
                    onChange={event => setLocationFilter(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Minden helyszín</option>
                    {locationOptions.map(location => (
                      <option key={location} value={location || ''}>
                        {location}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Időszak kezdete
                  <Input type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} className="mt-1" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Időszak vége
                  <Input type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} className="mt-1" />
                </label>

                <label className="text-sm font-medium text-slate-700">
                  Keresés
                  <Input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Megnevezés, leltári szám, helyszín, bizonylat..."
                    className="mt-1"
                  />
                </label>
              </div>

              {/* 2026-08-11 (K5-#13/#14): a modul fő műveletei `size="sm"` (28px)
                  magasak voltak — a 44px-es koppintási minimum alatt. A `min-h-11`
                  telefonon is biztonságosan eltalálható gombot ad. */}
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => setPrintDialogOpen(true)}>
                  Nyomtatási központ
                </Button>
                <Button size="sm" variant="outline" className="min-h-11 rounded-xl" onClick={() => openDialog()}>
                  Új tétel
                </Button>
                {!isFinalized ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 rounded-xl border-green-300 text-green-700"
                    onClick={() => void handleFinalize()}
                  >
                    {reportYear ? `${reportYear}. évi jelentés véglegesítése` : 'Jelentés véglegesítése'}
                  </Button>
                ) : unlockRequested ? (
                  <Button size="sm" variant="outline" disabled className="min-h-11 rounded-xl">
                    Jelentés-feloldási kérelem elbírálás alatt
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 rounded-xl border-amber-300 text-amber-700"
                    onClick={() => setUnlockDialogOpen(true)}
                  >
                    Jelentés feloldásának kérése
                  </Button>
                )}
                {isFinalized && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={async () => {
                      // 2026-08-11 (P1 #24): itt korábban `new Date().getFullYear() - 1`
                      // állt, miközben a véglegesítés (finalizeLeltar) és az
                      // egyházmegyei teljességi mátrix más évvel dolgozott — a lelkész
                      // az egyik évet zárta le és egy MÁSIKAT küldött be. Emiatt az
                      // esperes „Hiányzik"-ot látott, vagy a felülírás-védelem az előző
                      // évi, már véglegesített sorra hivatkozva utasította el a
                      // beküldést. Mostantól a szerver adja a kanonikus év-kulcsot
                      // (documentSeasonYear), ugyanazt, amivel a véglegesítés is dolgozik.
                      const year = await getLeltarReportYear()
                      // 2026-08-11 (K5-#30): a beküldött darabszám a KANONIKUS
                      // definíció (minden nem törölt tétel), NEM a nyers lista és
                      // nem is a képernyő szűrői — a `rule` kulcs magát a definíciót
                      // is elmenti a snapshotba (a voters-tab mintája). A lelkész
                      // már a megerősítő kérdésben látja a beküldendő számot.
                      if (!confirm(`Beküldöd a(z) ${year}. évi vagyonleltári jelentést az egyházmegyének? (${canonItemCount} tétel)`)) return
                      const snapshot = {
                        itemCount: canonItemCount,
                        totalBookValue: canonTotalBookValue,
                        totalCurrentValue: canonTotalCurrentValue,
                        year,
                        rule: 'not_deleted',
                      }
                      const result = await submitDocument('vagyonleltar', year, snapshot)
                      if ('error' in result && result.error) toast.error(result.error)
                      else toast.success(`A(z) ${year}. évi vagyonleltári jelentés beküldve az egyházmegyének (${canonItemCount} tétel)!`)
                    }}
                  >
                    {reportYear ? `${reportYear}. évi beküldés egyházmegyének` : 'Beküldés egyházmegyének'}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="secondary">{filtered.length} aktív tétel</Badge>
              <Badge variant="secondary">Hivatalos nyomtatványok: 5 db</Badge>
              <Badge variant="secondary">Szűrés: kategória + helyszín + időszak + keresés</Badge>
              {periodStart || periodEnd ? <Badge variant="secondary">Időszak: {periodStart || '...'} - {periodEnd || '...'}</Badge> : null}
            </div>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                A leltári tételek betöltése folyamatban...
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            activeItems.length === 0 ? (
              <EmptyFirstRecord
                accent="amber"
                icon={Boxes}
                title="Még nincs leltári tétel"
                description="Kezdd el a gyülekezeti leltárt — rögzítsd az első tárgyat (ingóság, eszköz, érték) néhány alapadattal."
                ctaLabel="Rögzítsd az első leltári tételt"
                onCta={() => openDialog()}
              />
            ) : (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  A megadott szűrés mellett nincs megjeleníthető leltári tétel.
                </CardContent>
              </Card>
            )
          ) : (
            // 2026-08-11 (K5-#14): MI VOLT A HIBA — a leltári lista telefonon is
            // egyetlen, vízszintesen görgethető táblázat volt. 375px-es kijelzőn a
            // művelet-oszlop (Fişă / Szerk. / Törlés) a látható területen KÍVÜLRE
            // került, tehát a lelkész csak akkor talált rá a Szerkesztés gombra, ha
            // rájött, hogy a táblázatot oldalra kell húzni. A tagnyilvántartás ezt
            // már megoldotta (members/persons-tab.tsx): `md:hidden` kártya-sáv +
            // `hidden md:block` táblázat — ugyanazt az elrendezést követjük itt is.
            <div className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
              <div className="space-y-2 rounded-[28px] bg-muted/20 p-2 md:hidden">
                {filtered.map(item => (
                  <MobileInventoryCard
                    key={item.id}
                    item={item}
                    onFisa={() => handleRowFisaPrint(item)}
                    onEdit={() => openDialog(item)}
                    onDelete={() => void handleDelete(item.id)}
                    onAmortization={() => openAmortizationDialog(item)}
                  />
                ))}
              </div>

              {/* A kerekítést a görgető-doboz viszi, hogy a fejléc-háttér ne
                  lógjon ki a 28px-es sarkokon. */}
              <div className="hidden overflow-x-auto rounded-[28px] md:block">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/90">
                  <tr>
                    <th className="p-3 text-left">Leltári sz.</th>
                    <th className="p-3 text-left">Megnevezés</th>
                    <th className="hidden p-3 text-left lg:table-cell">Kategória</th>
                    <th className="hidden p-3 text-left xl:table-cell">Helyszín / felelős</th>
                    <th className="p-3 text-right">Könyv szerinti érték</th>
                    <th className="p-3 text-right">Leltári érték</th>
                    {/* 2026-08-11 (K5-#13): a művelet-oszlopnak eddig NEM volt neve —
                        a képernyőolvasó néma cellát olvasott a gombok fölött. */}
                    <th className="w-40 p-3"><span className="sr-only">Műveletek</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-slate-100 transition hover:bg-slate-50">
                      <td className="p-3 align-top font-mono text-xs text-slate-500">
                        <div>{item.leltari_szam || '—'}</div>
                        {item.regi_leltari_szam ? <div className="mt-1 text-[11px] text-slate-400">Régi: {item.regi_leltari_szam}</div> : null}
                      </td>
                      <td className="p-3 align-top">
                        <div className="font-semibold text-slate-800">{item.megnevezes}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.mennyiseg} {item.mertekegyseg || 'db'}
                          {item.beszerzes_datuma ? ` · ${item.beszerzes_datuma}` : ''}
                        </div>
                      </td>
                      <td className="hidden p-3 align-top lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
                            {getInventoryCategoryLabel(item.kategoria)}
                          </Badge>
                          {item.kategoria_key === 'alapeszkoz' ? (
                            <button
                              type="button"
                              onClick={() => openAmortizationDialog(item)}
                              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 transition hover:bg-teal-100"
                              title="Amortizációs információk"
                              aria-label={`${item.megnevezes} amortizációs információi`}
                            >
                              <CircleHelp className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden p-3 align-top xl:table-cell">
                        <div className="text-sm text-slate-700">{item.helyszin || '—'}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.felelos_nev || 'Nincs megadva'}</div>
                      </td>
                      <td className="p-3 align-top text-right font-semibold text-slate-700">
                        {formatCurrency((Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1))} RON
                      </td>
                      <td className="p-3 align-top text-right font-semibold text-emerald-700">
                        {formatCurrency(calculateInventoryCurrentValue(item))} RON
                      </td>
                      <td className="p-3 align-top">
                        {/* 2026-08-11 (K5-#13/#14): a sor-gombok 32px magasak voltak
                            (a 44px-es koppintási minimum alatt), és a szövegük
                            önmagában nem mondta meg, MELYIK tételre vonatkozik —
                            a képernyőolvasó csak annyit olvasott: „Törlés". */}
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 rounded-lg px-2 text-xs text-teal-700"
                            onClick={() => handleRowFisaPrint(item)}
                            title="A tétel fişájának nyomtatása"
                            aria-label={`${item.megnevezes} fişájának nyomtatása`}
                          >
                            <FileText className="mr-1 size-3.5" /> Fişă
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 rounded-lg px-2 text-xs text-blue-600"
                            onClick={() => openDialog(item)}
                            title="Tétel szerkesztése"
                            aria-label={`${item.megnevezes} szerkesztése`}
                          >
                            Szerk.
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-11 rounded-lg px-2 text-xs text-red-500"
                            onClick={() => void handleDelete(item.id)}
                            title="Tétel törlése"
                            aria-label={`${item.megnevezes} törlése`}
                          >
                            Törlés
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      <InventoryPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        items={items}
        congregationName={congregationName}
        visibleItemCount={filtered.length}
        filters={{
          categoryKey: categoryFilter ? (categoryFilter as InventoryCategory) : null,
          categoryLabel: categoryFilter ? INVENTORY_CATEGORY_LABELS[categoryFilter as InventoryCategory] : 'Minden kategória',
          locationFilter: locationFilter || null,
          query: searchQuery || null,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
        }}
      />

      <InventoryAmortizationDialog
        item={amortizationItem}
        open={amortizationDialogOpen}
        onOpenChange={setAmortizationDialogOpen}
      />

      {/* 2026-08-11 (K5-#12): a `window.prompt` helyett rendes dialógus —
          kötelező, legalább 10 karakteres indoklással. Enélkül a kérelem
          el sem küldhető, tehát az esperes mindig kap mire alapozni. */}
      <AdminConfirmDialog
        open={unlockDialogOpen}
        onOpenChange={open => {
          if (!unlockSending) setUnlockDialogOpen(open)
        }}
        title={reportYear ? `A(z) ${reportYear}. évi vagyonleltári jelentés feloldása` : 'A vagyonleltári jelentés feloldása'}
        description="A kérelmet az egyházmegye bírálja el. Írja le röviden, mit kell javítania a már véglegesített jelentésen — ebből tudja az esperes eldönteni, hogy feloldja-e."
        confirmLabel="Kérelem elküldése"
        cancelLabel="Mégse"
        loading={unlockSending}
        reasonLabel="A feloldás indoklása"
        reasonPlaceholder="Pl. Kimaradt a februárban vásárolt hangosítás, pótolni szeretném."
        reasonRequired
        reasonMinLength={10}
        onConfirm={reason => void submitUnlockRequest(reason)}
      />

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        {/* 2026-08-09: xl+ szélességen a fişă élő előnézete külön oszlopban
            (a member-form-dialog PR-17-es mintája); kisebb kijelzőn gombbal
            nyíló előnézet-réteg. */}
        <DialogContent className="grid h-[min(90vh,56rem)] max-h-[90dvh] grid-rows-[minmax(0,1fr)] overflow-hidden p-0 sm:max-w-2xl xl:max-w-6xl [&_[data-slot=dialog-close]]:z-30">
          {/* Fix keretmagasság + oszlopon belüli görgetés — így a mobil előnézet-réteg
              a LÁTHATÓ keretre feszül (nem a görgethető tartalom teljes magasságára). */}
          <div className="relative grid min-h-0 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Leltári tétel szerkesztése' : 'Új leltári tétel'}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Megnevezés *</Label>
                <Input value={fMegnevezes} onChange={event => setFMegnevezes(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Kategória *</Label>
                <select
                  value={fKategoria}
                  onChange={event => {
                    const nextCategory = event.target.value as InventoryCategory
                    setFKategoria(nextCategory)
                    if (nextCategory !== 'alapeszkoz') {
                      setFKatalogusKod('')
                      setFHasznalatiIdo('')
                    }
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {INVENTORY_CATEGORIES.map(category => (
                    <option key={category} value={category}>
                      {INVENTORY_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési érték (RON) *</Label>
                <Input type="number" min={0.01} step={0.01} value={fErtek || ''} onChange={event => setFErtek(Number(event.target.value))} />
              </div>

              <div className="space-y-1.5">
                <Label>Mennyiség</Label>
                <Input type="number" min={1} step={1} value={fMennyiseg || 1} onChange={event => setFMennyiseg(Number(event.target.value) || 1)} />
              </div>

              <div className="space-y-1.5">
                <Label>Mértékegység</Label>
                <Input value={fMertekegyseg} onChange={event => setFMertekegyseg(event.target.value)} placeholder="db" />
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési dátum</Label>
                <Input type="date" value={fDatum} onChange={event => setFDatum(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Beszerzési irat száma</Label>
                <Input value={fBizonylat} onChange={event => setFBizonylat(event.target.value)} placeholder="Számla / jegyzőkönyv / határozat" />
                {/* 2026-08-09: kikeresés a könyvelésből — a kiadás adatai előtöltődnek,
                    mentéskor a két tétel össze is kapcsolódik (penzugy_xkey). */}
                {fPenzugyXkey ? (
                  <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1 text-xs text-amber-800">
                    <Link2 className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">Könyvelési tételhez kapcsolva</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-amber-600 hover:bg-amber-100"
                      onClick={() => setFPenzugyXkey('')}
                      title="Kapcsolat bontása (a mezők értékei megmaradnak)"
                      aria-label="Kapcsolat bontása"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-lg text-xs"
                    onClick={openExpensePicker}
                  >
                    <FileSearch className="mr-1.5 size-3.5" /> Kikeresés a könyvelésből
                  </Button>
                )}
              </div>

              {fKategoria === 'alapeszkoz' ? (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Amortizációs katalóguskód</Label>
                    <select
                      value={fKatalogusKod}
                      onChange={event => {
                        const nextCode = event.target.value
                        setFKatalogusKod(nextCode)
                        const entry = getInventoryAmortizationCatalogEntry(nextCode)
                        if (entry) setFHasznalatiIdo(entry.defEv)
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Kézi beállítás / nincs kiválasztva</option>
                      {INVENTORY_AMORTIZATION_CATALOG.map(entry => (
                        <option key={entry.kod} value={entry.kod}>
                          {entry.kod} - {entry.nev} ({entry.minEv}-{entry.maxEv} év)
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      Az alapeszközöknél a rendszer a hivatalos katalóguskód és a használati idő alapján számolja az amortizációt.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Használati idő (év)</Label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={fHasznalatiIdo}
                      onChange={event => setFHasznalatiIdo(event.target.value ? Number(event.target.value) : '')}
                      placeholder="pl. 5"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Amortizációs összefoglaló</Label>
                    <div className="rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-slate-700">
                      {selectedCatalogEntry ? (
                        <>
                          <div className="font-semibold text-slate-900">{selectedCatalogEntry.nev}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            Javasolt tartomány: {selectedCatalogEntry.minEv}-{selectedCatalogEntry.maxEv} év · Alapértelmezett: {selectedCatalogEntry.defEv} év
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">
                          Ha nincs katalóguskód kiválasztva, a rendszer a kézzel megadott használati idővel számol.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="space-y-1.5">
                <Label>Helyszín</Label>
                <Input value={fHelyszin} onChange={event => setFHelyszin(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Felelős személy</Label>
                <Input value={fFelelos} onChange={event => setFFelelos(event.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Megjegyzés</Label>
                <Input value={fMegj} onChange={event => setFMegj(event.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                className="mr-auto rounded-xl xl:hidden"
                onClick={() => setPreviewOverlayOpen(true)}
              >
                <FileText className="mr-1.5 size-4" /> Fişă előnézet
              </Button>
              <Button variant="ghost" onClick={() => handleDialogOpenChange(false)}>
                Mégse
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Mentés...' : 'Mentés'}
              </Button>
            </div>
          </div>
          </div>

          {/* xl+: állandó élő fişă-előnézet oszlop (saját görgetéssel) */}
          <aside className="hidden min-h-0 border-l border-border bg-muted/40 xl:block xl:overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-muted/70 py-2.5 pl-4 pr-12 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Fişă — élő előnézet
              </p>
              <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={handlePreviewPrint}>
                <Printer className="mr-1.5 size-3.5" /> Nyomtatás
              </Button>
            </div>
            <div className="p-3">
              <ItemCardPreviewFrame html={previewHtml} scale={0.42} />
              <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
                A fişă gépelés közben töltődik ki. Nyomtatásnál a Cél listából a
                &bdquo;Mentés PDF-ként&rdquo; is választható.
              </p>
            </div>
          </aside>

          {/* Kisebb kijelzőn: előnézet-réteg */}
          {previewOverlayOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-background xl:hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Fişă — élő előnézet
                </p>
                <div className="flex items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="min-h-9 rounded-lg" onClick={handlePreviewPrint}>
                    <Printer className="mr-1.5 size-3.5" /> Nyomtatás
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-9 rounded-lg p-0"
                    onClick={() => setPreviewOverlayOpen(false)}
                    aria-label="Előnézet bezárása"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <ItemCardPreviewFrame html={previewHtml} scale={0.42} />
              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 2026-08-09: „Kikeresés a könyvelésből" — kiadás-választó (testvér-dialógus,
          hogy a transformált DialogContent ne vágja le). A leltár-köteles jogcímek
          (205.01 / 201.12) a lista elején, borostyán jelöléssel. */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Kikeresés a könyvelésből</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto]">
            <select
              value={pickerYear}
              onChange={event => {
                const year = Number(event.target.value)
                setPickerYear(year)
                void loadPickerRows(year)
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-label="Év"
            >
              {(pickerYears.length ? pickerYears : [pickerYear]).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <Input
              value={pickerQuery}
              onChange={event => setPickerQuery(event.target.value)}
              placeholder="Keresés: szállító, iratszám, megjegyzés, jogcím…"
            />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={pickerShowLinked}
                onChange={event => setPickerShowLinked(event.target.checked)}
              />
              Már leltárba vettek is
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200">
            {pickerLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">A kiadások betöltése…</p>
            ) : filteredPickerRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nincs megjeleníthető kiadás ebben az évben.
                {!pickerShowLinked ? ' (A már leltárba vett tételeket a jelölővel tudod megmutatni.)' : ''}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filteredPickerRows.map(row => (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={row.linked}
                      onClick={() => applyPickedExpense(row)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm transition hover:bg-amber-50/60 disabled:cursor-not-allowed disabled:opacity-50"
                      title={row.linked ? 'Ehhez a kiadáshoz már tartozik leltári tétel' : 'Adatok betöltése és összekapcsolás'}
                    >
                      <span className="w-[92px] shrink-0 font-mono text-xs text-slate-500">{row.datum}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">
                          {row.megjegyzes || row.atvevo || 'Kiadás'}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {[row.atvevo, row.iratszam ? `Irat: ${row.iratszam}` : null, row.kodNev ? `${row.kod} ${row.kodNev}` : row.kod]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {row.invKategoria ? (
                        <Badge variant="outline" className="shrink-0 rounded-full border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                          leltár-köteles
                        </Badge>
                      ) : null}
                      {row.linked ? (
                        <Badge variant="outline" className="shrink-0 rounded-full px-2 py-0.5 text-[11px] text-slate-500">
                          már leltárban
                        </Badge>
                      ) : null}
                      <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                        {formatCurrency(row.osszeg)} RON
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            A kiválasztott kiadás összege, dátuma és iratszáma előtöltődik, és a mentés a
            kiadást a leltári tétellel össze is kapcsolja — a leltár-köteles jogcíműek
            (205.01 Új beruházások, 201.12 Kis értékű leltári tárgyak) a lista elején.
          </p>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── 2026-08-11 (K5-#14): mobil leltári kártya ──────────────────────────────
// A táblázat 375px-en használhatatlan volt: a művelet-gombok a látható területen
// kívülre kerültek. Ez a kártya minden fontos adatot egymás alá tesz (megnevezés,
// leltári szám, mennyiség, kategória, helyszín/felelős, könyv szerinti + leltári
// érték), a három műveletet pedig 44px magas, saját aria-label-lel ellátott
// gombsorba. A members/persons-tab.tsx MobilePersonCard mintája.
function MobileInventoryCard({
  item,
  onFisa,
  onEdit,
  onDelete,
  onAmortization,
}: {
  item: InventoryItem
  onFisa: () => void
  onEdit: () => void
  onDelete: () => void
  onAmortization: () => void
}) {
  const bookValue = (Number(item.beszerzes_erteke || 0) || 0) * (Number(item.mennyiseg || 1) || 1)

  return (
    <article className="rounded-2xl border border-border/60 bg-card px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base font-semibold text-foreground">{item.megnevezes}</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {item.leltari_szam || 'Nincs leltári szám'}
            {item.regi_leltari_szam ? ` · régi: ${item.regi_leltari_szam}` : ''}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.mennyiseg} {item.mertekegyseg || 'db'}
            {item.beszerzes_datuma ? ` · ${item.beszerzes_datuma}` : ''}
          </p>
        </div>
        {item.kategoria_key === 'alapeszkoz' ? (
          <button
            type="button"
            onClick={onAmortization}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-teal-700 transition hover:bg-teal-100"
            aria-label={`${item.megnevezes} amortizációs információi`}
          >
            <CircleHelp className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px]">
          {getInventoryCategoryLabel(item.kategoria)}
        </Badge>
        {item.helyszin ? (
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px] text-muted-foreground">
            {item.helyszin}
          </Badge>
        ) : null}
        {item.felelos_nev ? (
          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[11px] text-muted-foreground">
            Felelős: {item.felelos_nev}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Könyv szerinti érték</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatCurrency(bookValue)} RON</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Leltári érték</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatCurrency(calculateInventoryCurrentValue(item))} RON
          </dd>
        </div>
      </dl>

      <div className="mt-2.5 flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 rounded-xl text-xs text-teal-700"
          onClick={onFisa}
          aria-label={`${item.megnevezes} fişájának nyomtatása`}
        >
          <FileText className="mr-1 size-3.5" /> Fişă
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 rounded-xl text-xs text-blue-600"
          onClick={onEdit}
          aria-label={`${item.megnevezes} szerkesztése`}
        >
          Szerkesztés
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 flex-1 rounded-xl text-xs text-red-600"
          onClick={onDelete}
          aria-label={`${item.megnevezes} törlése`}
        >
          Törlés
        </Button>
      </div>
    </article>
  )
}

// 2026-08-09: skálázott A4-előnézet keret — az iframe valós lapméretben
// renderel, a keret kicsinyíti (nem interaktív, csak nézet). A member-form
// CardPreviewFrame (PR-17) mintája.
function ItemCardPreviewFrame({ html, scale }: { html: string; scale: number }) {
  const W = 830
  const H = 1180
  return (
    <div
      className="mx-auto overflow-hidden rounded-xl border border-border bg-white shadow-sm"
      style={{ width: W * scale, height: H * scale }}
    >
      <iframe
        title="Leltári fişă előnézet"
        srcDoc={html}
        style={{
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          border: 0,
          pointerEvents: 'none',
          background: 'white',
        }}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  accent = 'text-slate-800',
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="card-raised p-4 text-center">
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  )
}
