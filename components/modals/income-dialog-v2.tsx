'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  saveIncome,
  saveIncomeWithLinkedInventory,
  getNextReceiptNumber,
  getLastRecordedDate,
  searchMembersForFinance,
  getFamilyIdForPerson,
  checkReceiptDuplicate,
} from '@/app/(dashboard)/penzugy/actions'
import { RECEIPT_TYPES } from '@/lib/constants/finance'
import { INVENTORY_AMORTIZATION_CATALOG, getInventoryAmortizationCatalogEntry } from '@/lib/constants/inventory.next'
import { toast } from 'sonner'

interface Category {
  id: number
  kod: string
  nev: string
}

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
  sz_datum: string | null
  c_szam: string | null
  adrlocality: { name: string } | { name: string }[] | null
  adrstreet: { name: string } | { name: string }[] | null
}

interface IncomeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: Category[]
  currentYear: number
  yearlyFee: number
}

export function IncomeDialog({ open, onOpenChange, categories, currentYear, yearlyFee }: IncomeDialogProps) {
  const [loading, setLoading] = useState(false)
  const [osszeg, setOsszeg] = useState(yearlyFee || 0)
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [personId, setPersonId] = useState<number | null>(null)
  const [personName, setPersonName] = useState('')
  const [familyId, setFamilyId] = useState<number | null>(null)
  const [forrasa, setForrasa] = useState('')
  const [iratszam, setIratszam] = useState('')
  const [iratszamBadge, setIratszamBadge] = useState('')
  const [irattipus, setIrattipus] = useState<(typeof RECEIPT_TYPES)[number]>('Készpénz')
  const [fizetettev, setFizetettev] = useState(currentYear)
  const [megjegyzes, setMegjegyzes] = useState('')
  const [createInventoryAsset, setCreateInventoryAsset] = useState(false)
  const [inventoryName, setInventoryName] = useState('')
  const [inventoryLocation, setInventoryLocation] = useState('')
  const [inventoryResponsible, setInventoryResponsible] = useState('')
  const [inventoryCatalogCode, setInventoryCatalogCode] = useState('')
  const [inventoryUsefulLife, setInventoryUsefulLife] = useState<number | ''>('')
  const [inventoryNote, setInventoryNote] = useState('')

  const [dateBadge, setDateBadge] = useState('')
  const [lastRecordedDate, setLastRecordedDate] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  const selectedCatalogEntry = useMemo(
    () => getInventoryAmortizationCatalogEntry(inventoryCatalogCode || null),
    [inventoryCatalogCode],
  )

  function getRelationName(value: SearchResult['adrlocality']) {
    if (!value) return ''
    return Array.isArray(value) ? value[0]?.name || '' : value.name
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return

      setOsszeg(yearlyFee || 0)
      setDatum(new Date().toISOString().slice(0, 10))
      setCategoryId('')
      setPersonId(null)
      setPersonName('')
      setFamilyId(null)
      setForrasa('')
      setIratszam('')
      setIratszamBadge('')
      setIrattipus('Készpénz')
      setFizetettev(currentYear)
      setMegjegyzes('')
      setCreateInventoryAsset(false)
      setInventoryName('')
      setInventoryLocation('')
      setInventoryResponsible('')
      setInventoryCatalogCode('')
      setInventoryUsefulLife('')
      setInventoryNote('')
      setSearchQuery('')
      setDateBadge('')
      setShowResults(false)

      getNextReceiptNumber(currentYear).then(nextNumber => {
        if (!cancelled) setIratszam(String(nextNumber))
      })
      getLastRecordedDate().then(lastDate => {
        if (!cancelled) setLastRecordedDate(lastDate)
      })
    })

    return () => {
      cancelled = true
    }
  }, [open, currentYear, yearlyFee])

  function checkDate(value: string) {
    setDatum(value)
    const today = new Date().toISOString().slice(0, 10)
    if (value > today) {
      setDateBadge('Jövőbeli dátum nem engedélyezett.')
      return
    }
    if (lastRecordedDate && value < lastRecordedDate) {
      setDateBadge(`Figyelem: korábbi, mint ${lastRecordedDate}.`)
      return
    }
    setDateBadge('')
  }

  async function handleSearch(value: string) {
    setSearchQuery(value)
    setForrasa(value)
    if (value.length < 2) {
      setShowResults(false)
      return
    }

    const results = await searchMembersForFinance(value)
    setSearchResults(results as SearchResult[])
    setShowResults(true)
  }

  async function selectPerson(result: SearchResult) {
    const fullName = `${result.csaladnev} ${result.k_nev}`
    setPersonId(result.id)
    setPersonName(fullName)
    setForrasa(fullName)
    setSearchQuery(fullName)
    setShowResults(false)
    const resolvedFamilyId = await getFamilyIdForPerson(result.id)
    setFamilyId(resolvedFamilyId)
    if (createInventoryAsset && !inventoryResponsible) {
      setInventoryResponsible(fullName)
    }
  }

  async function checkIratszam(value: string) {
    setIratszam(value)
    if (!value.trim()) {
      setIratszamBadge('')
      return
    }
    const isDuplicate = await checkReceiptDuplicate(value)
    setIratszamBadge(isDuplicate ? 'Már létezik ilyen iratszám.' : '')
  }

  async function handleSubmit() {
    const today = new Date().toISOString().slice(0, 10)
    if (datum > today) {
      toast.error('Jövőbeli dátum nem engedélyezett.')
      return
    }
    if (!categoryId) {
      toast.error('Válasszon kategóriát.')
      return
    }
    if (osszeg <= 0) {
      toast.error('Az összeg pozitív szám kell legyen.')
      return
    }
    if (createInventoryAsset && !inventoryName.trim()) {
      toast.error('A kapcsolt leltári alapeszköz megnevezése kötelező.')
      return
    }

    setLoading(true)

    const incomePayload = {
      osszeg,
      datum,
      id_befizetescel: Number(categoryId),
      id_szemely: personId,
      id_csalad: familyId,
      forrasa: forrasa || null,
      iratszam: iratszam || null,
      irattipus,
      fizetettev: fizetettev || null,
      megjegyzes: megjegyzes || null,
    }

    const result = createInventoryAsset
      ? await saveIncomeWithLinkedInventory(incomePayload, {
          megnevezes: inventoryName.trim(),
          helyszin: inventoryLocation || null,
          felelos_nev: inventoryResponsible || null,
          katalogus_kod: inventoryCatalogCode || null,
          hasznalati_ido: inventoryUsefulLife === '' ? null : Number(inventoryUsefulLife),
          megjegyzes: inventoryNote || null,
        })
      : await saveIncome(incomePayload)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(createInventoryAsset ? 'Bevétel és kapcsolt alapeszköz sikeresen rögzítve.' : 'Bevétel sikeresen rögzítve.')
      onOpenChange(false)
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto p-0 sm:max-w-2xl">
        <div className="border-b border-zinc-100 px-6 pb-4 pt-6">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-md">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Bevétel rögzítése</DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-400">Új bevétel hozzáadása a pénztárkönyvhöz, opcionális kapcsolt alapeszközzel.</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 pb-6 pt-4">
          <div className="space-y-1.5 relative">
            <Label>Befizető (személy / cég)</Label>
            <Input value={searchQuery} onChange={e => void handleSearch(e.target.value)} placeholder="Keresés név alapján (2+ karakter)..." />
            {personId ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-xs text-green-700">
                  {personName}
                </Badge>
                {familyId ? (
                  <Badge variant="outline" className="text-[10px]">
                    Család: #{familyId}
                  </Badge>
                ) : null}
              </div>
            ) : null}
            {showResults && searchResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-40 overflow-y-auto rounded-lg border bg-white shadow-lg">
                {searchResults.map(result => (
                  <div
                    key={result.id}
                    className="cursor-pointer border-b p-2 text-sm last:border-0 hover:bg-slate-50"
                    onClick={() => void selectPerson(result)}
                  >
                    <div className="font-medium">{result.csaladnev} {result.k_nev}</div>
                    <div className="text-xs text-muted-foreground">
                      {getRelationName(result.adrlocality)} {getRelationName(result.adrstreet)} {result.c_szam || ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Kategória *</Label>
            <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value) || '')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Válasszon —</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.kod} — {category.nev}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Összeg (RON) *</Label>
              <Input type="number" min={0.01} step={0.01} value={osszeg || ''} onChange={e => setOsszeg(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input type="date" value={datum} onChange={e => checkDate(e.target.value)} />
              {dateBadge ? (
                <Badge variant="secondary" className={`text-[10px] ${datum > new Date().toISOString().slice(0, 10) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {dateBadge}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Iratszám</Label>
              <Input value={iratszam} onChange={e => setIratszam(e.target.value)} onBlur={e => void checkIratszam(e.target.value)} />
              {iratszamBadge ? (
                <Badge variant="secondary" className="bg-red-100 text-[10px] text-red-700">
                  {iratszamBadge}
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Típus *</Label>
              <select value={irattipus} onChange={e => setIrattipus(e.target.value as (typeof RECEIPT_TYPES)[number])} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {RECEIPT_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Fizetett év</Label>
              <Input type="number" value={fizetettev || ''} onChange={e => setFizetettev(Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Megjegyzés</Label>
            <Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} />
          </div>

          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Kapcsolt leltári alapeszköz</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Akkor hasznos, ha ez a bevétel ténylegesen egy beérkezett tárgyi adományhoz vagy rögtön leltárba veendő alapeszközhöz kapcsolódik.
                </p>
              </div>
              <Button
                type="button"
                variant={createInventoryAsset ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => {
                  const next = !createInventoryAsset
                  setCreateInventoryAsset(next)
                  if (next && !inventoryName.trim()) {
                    setInventoryName(forrasa || personName || 'Új alapeszköz')
                  }
                  if (!next) {
                    setInventoryCatalogCode('')
                    setInventoryUsefulLife('')
                    setInventoryNote('')
                  }
                }}
              >
                {createInventoryAsset ? 'Kapcsolás aktív' : 'Kapcsolás bekapcsolása'}
              </Button>
            </div>

            {createInventoryAsset ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Leltári megnevezés *</Label>
                  <Input value={inventoryName} onChange={e => setInventoryName(e.target.value)} placeholder="pl. Laptop, projektor, orgonaalkatrész..." />
                </div>

                <div className="space-y-1.5">
                  <Label>Helyszín</Label>
                  <Input value={inventoryLocation} onChange={e => setInventoryLocation(e.target.value)} placeholder="pl. Iroda, templom, parókia" />
                </div>

                <div className="space-y-1.5">
                  <Label>Felelős személy</Label>
                  <Input value={inventoryResponsible} onChange={e => setInventoryResponsible(e.target.value)} placeholder="pl. lelkipásztor vagy gondnok" />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Amortizációs katalóguskód</Label>
                  <select
                    value={inventoryCatalogCode}
                    onChange={e => {
                      const nextCode = e.target.value
                      setInventoryCatalogCode(nextCode)
                      const entry = getInventoryAmortizationCatalogEntry(nextCode)
                      if (entry) setInventoryUsefulLife(entry.defEv)
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
                </div>

                <div className="space-y-1.5">
                  <Label>Használati idő (év)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={inventoryUsefulLife}
                    onChange={e => setInventoryUsefulLife(e.target.value ? Number(e.target.value) : '')}
                    placeholder="pl. 5"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Katalógus súgó</Label>
                  <div className="rounded-2xl border border-teal-100 bg-white px-4 py-3 text-sm text-slate-700">
                    {selectedCatalogEntry ? (
                      <>
                        <div className="font-semibold text-slate-900">{selectedCatalogEntry.nev}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Javasolt tartomány: {selectedCatalogEntry.minEv}-{selectedCatalogEntry.maxEv} év · Alapértelmezett: {selectedCatalogEntry.defEv} év
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Ha nincs kód kiválasztva, a rendszer a kézzel megadott használati idővel fogja a leltári amortizációt számolni.
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Leltári megjegyzés</Label>
                  <Input
                    value={inventoryNote}
                    onChange={e => setInventoryNote(e.target.value)}
                    placeholder="pl. tárgyi adomány, felajánlás, pályázati beszerzéshez kapcsolódó megjegyzés"
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 border-t border-zinc-100 pt-4">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 text-zinc-600 hover:bg-zinc-100" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void handleSubmit()}
              disabled={loading || datum > new Date().toISOString().slice(0, 10)}
            >
              {loading ? 'Mentés...' : createInventoryAsset ? 'Bevétel + alapeszköz mentése' : 'Bevétel mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
