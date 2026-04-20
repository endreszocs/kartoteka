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

interface Category { id: number; kod: string; nev: string }
interface SearchResult { id: number; csaladnev: string; k_nev: string; sz_datum: string | null; c_szam: string | null; adrlocality: { name: string } | null; adrstreet: { name: string } | null }

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
  const [irattipus, setIrattipus] = useState<typeof RECEIPT_TYPES[number]>('Készpénz')
  const [fizetettev, setFizetettev] = useState(currentYear)
  const [megjegyzes, setMegjegyzes] = useState('')

  // Dátum validáció badge
  const [dateBadge, setDateBadge] = useState('')
  const [lastRecordedDate, setLastRecordedDate] = useState<string | null>(null)

  // Keresés
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      // Reset
      setOsszeg(yearlyFee || 0)
      setDatum(new Date().toISOString().slice(0, 10))
      setCategoryId('')
      setPersonId(null)
      setPersonName('')
      setForrasa('')
      setIratszam('')
      setIrattipus('Készpénz')
      setFizetettev(currentYear)
      setMegjegyzes('')
      setSearchQuery('')
      setDateBadge('')

      // Következő nyugtaszám + utolsó dátum
      getNextReceiptNumber(currentYear).then(n => {
        if (!cancelled) setIratszam(String(n))
      })
      getLastRecordedDate().then(d => {
        if (!cancelled) setLastRecordedDate(d)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, currentYear, yearlyFee])

  function checkDate(val: string) {
    setDatum(val)
    const today = new Date().toISOString().slice(0, 10)
    if (val > today) { setDateBadge('Jövőbeli dátum nem engedélyezett!'); return }
    if (lastRecordedDate && val < lastRecordedDate) { setDateBadge(`Figyelem: korábbi mint ${lastRecordedDate}`); return }
    setDateBadge('')
  }

  async function handleSearch(val: string) {
    setSearchQuery(val)
    setForrasa(val)
    if (val.length < 2) { setShowResults(false); return }
    const results = await searchMembersForFinance(val)
    setSearchResults(results as unknown as SearchResult[])
    setShowResults(true)
  }

  async function selectPerson(r: SearchResult) {
    setPersonId(r.id)
    setPersonName(`${r.csaladnev} ${r.k_nev}`)
    setForrasa(`${r.csaladnev} ${r.k_nev}`)
    setSearchQuery(`${r.csaladnev} ${r.k_nev}`)
    setShowResults(false)
    // B1: családi összekötés
    const fId = await getFamilyIdForPerson(r.id)
    setFamilyId(fId)
  }

  // H2: iratszám duplikáció ellenőrzés
  async function checkIratszam(val: string) {
    setIratszam(val)
    if (!val.trim()) { setIratszamBadge(''); return }
    const isDuplicate = await checkReceiptDuplicate(val)
    setIratszamBadge(isDuplicate ? 'Már létezik!' : '')
  }

  async function handleSubmit() {
    const today = new Date().toISOString().slice(0, 10)
    if (datum > today) { toast.error('Jövőbeli dátum nem engedélyezett!'); return }
    if (!categoryId) { toast.error('Válasszon kategóriát!'); return }
    if (osszeg <= 0) { toast.error('Az összeg pozitív szám kell legyen!'); return }

    setLoading(true)
    const result = await saveIncome({
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
    })

    if (result.error) toast.error(result.error)
    else { toast.success('Bevétel sikeresen rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">Bevétel rögzítése</DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">Új bevétel hozzáadása a pénztárkönyvhöz</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-3">
          {/* Személy keresés */}
          <div className="space-y-1.5 relative">
            <Label>Befizető (személy/cég)</Label>
            <Input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Keresés név alapján (2+ karakter)..." />
            {personId && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">{personName}</Badge>
                {familyId && <Badge variant="outline" className="text-[10px]">Család: #{familyId}</Badge>}
              </div>
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {searchResults.map(r => (
                  <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => selectPerson(r)}>
                    <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
                    <div className="text-xs text-muted-foreground">{r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Kategória */}
          <div className="space-y-1.5">
            <Label>Kategória *</Label>
            <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value) || '')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— Válasszon —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.kod} — {c.nev}</option>)}
            </select>
          </div>

          {/* Összeg + Dátum */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Összeg (RON) *</Label>
              <Input type="number" min={0.01} step={0.01} value={osszeg || ''} onChange={e => setOsszeg(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input type="date" value={datum} onChange={e => checkDate(e.target.value)} />
              {dateBadge && <Badge variant="secondary" className={`text-[10px] ${datum > new Date().toISOString().slice(0, 10) ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{dateBadge}</Badge>}
            </div>
          </div>

          {/* Iratszám + típus + fizetett év */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Iratszám</Label>
              <Input value={iratszam} onChange={e => setIratszam(e.target.value)} onBlur={e => checkIratszam(e.target.value)} />
              {iratszamBadge && <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-700">{iratszamBadge}</Badge>}
            </div>
            <div className="space-y-1.5">
              <Label>Típus *</Label>
              <select value={irattipus} onChange={e => setIrattipus(e.target.value as typeof irattipus)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {RECEIPT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
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

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={loading || datum > new Date().toISOString().slice(0, 10)}>
              {loading ? 'Mentés...' : 'Bevétel mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
