'use client'

import { useEffect, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import {
  saveRentalContract,
  searchMembersForFinance,
} from '@/app/(dashboard)/penzugy/actions'
import {
  RENTAL_TIPUS,
  RENTAL_TIPUS_LABELS,
  RENTAL_JOGI_TIPUS,
  RENTAL_JOGI_TIPUS_LABELS,
  RENTAL_JOGI_TIPUS_LEIRAS,
  RENTAL_FREQUENCIES,
  RENTAL_FREQ_LABELS,
  RENTAL_BERLO_TIPUS,
  RENTAL_BERLO_TIPUS_LABELS,
  type RentalContractRow,
  type RentalTipus,
  type RentalJogiTipus,
  type RentalFrequency,
  type RentalBerloTipus,
} from '@/lib/constants/finance'

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
  sz_datum: string | null
  c_szam: string | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
}

interface RentalContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingContract?: RentalContractRow | null
  onSaved?: () => void | Promise<void>
}

export function RentalContractDialog({
  open,
  onOpenChange,
  editingContract,
  onSaved,
}: RentalContractDialogProps) {
  const [loading, setLoading] = useState(false)

  // Bérlő típus
  const [berloTipus, setBerloTipus] = useState<RentalBerloTipus>('szemely')

  // Személy bérlő
  const [personId, setPersonId] = useState<number | null>(null)
  const [berloNev, setBerloNev] = useState('')

  // Cég bérlő
  const [cegNev, setCegNev] = useState('')
  const [cegAdoszam, setCegAdoszam] = useState('')

  // Szerződés adatok
  const [targy, setTargy] = useState('')
  const [leiras, setLeiras] = useState('')
  const [tipus, setTipus] = useState<RentalTipus>('terulet')
  const [jogiTipus, setJogiTipus] = useState<RentalJogiTipus>('locatiune')

  // Pénzügyi
  const [osszeg, setOsszeg] = useState<number | ''>('')
  const [fizetesiCiklus, setFizetesiCiklus] = useState<RentalFrequency>('eves')

  // Időtartam
  const [kezdet, setKezdet] = useState(new Date().toISOString().slice(0, 10))
  const [vege, setVege] = useState('')
  const [vegeBadge, setVegeBadge] = useState('')

  // Azonosítók
  const [leltariSzam, setLeltariSzam] = useState('')
  const [telekkonyviSzam, setTelekkonyviSzam] = useState('')

  // Megjegyzés
  const [megjegyzes, setMegjegyzes] = useState('')

  // Személykereső
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)

  const isEditing = !!editingContract?.id

  // Reset + editing pre-fill
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return

      if (editingContract) {
        // Szerkesztés: előtöltjük a meglévő értékeket
        const isCeg = !!editingContract.ceg_nev || !!editingContract.ceg_adoszam
        setBerloTipus(isCeg ? 'ceg' : 'szemely')
        setPersonId(editingContract.id_szemely)
        setBerloNev(editingContract.berlo_nev)
        setCegNev(editingContract.ceg_nev || '')
        setCegAdoszam(editingContract.ceg_adoszam || '')
        setTargy(editingContract.targy || '')
        setLeiras(editingContract.leiras)
        setTipus(editingContract.tipus)
        setJogiTipus(editingContract.jogi_tipus || 'locatiune')
        setOsszeg(editingContract.osszeg)
        setFizetesiCiklus(editingContract.fizetesi_ciklus)
        setKezdet(editingContract.kezdet.slice(0, 10))
        setVege(editingContract.vege ? editingContract.vege.slice(0, 10) : '')
        setLeltariSzam(editingContract.leltari_szam || '')
        setTelekkonyviSzam(editingContract.telekkonyvi_szam || '')
        setMegjegyzes(editingContract.megjegyzes || '')
        setSearchQuery(isCeg ? '' : editingContract.berlo_nev)
      } else {
        // Új: alapértelmezett állapot
        setBerloTipus('szemely')
        setPersonId(null)
        setBerloNev('')
        setCegNev('')
        setCegAdoszam('')
        setTargy('')
        setLeiras('')
        setTipus('terulet')
        setJogiTipus('locatiune')
        setOsszeg('')
        setFizetesiCiklus('eves')
        setKezdet(new Date().toISOString().slice(0, 10))
        setVege('')
        setLeltariSzam('')
        setTelekkonyviSzam('')
        setMegjegyzes('')
        setSearchQuery('')
      }
      setVegeBadge('')
      setSearchResults([])
      setShowResults(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, editingContract])

  // Vége dátum validáció — nem lehet kezdet előtti
  function checkVege(val: string) {
    setVege(val)
    if (!val) {
      setVegeBadge('')
      return
    }
    if (val < kezdet) {
      setVegeBadge('A záró dátum nem lehet korábbi a kezdő dátumnál.')
    } else {
      setVegeBadge('')
    }
  }

  // Személy keresés
  async function handleSearch(val: string) {
    setSearchQuery(val)
    setBerloNev(val)
    if (val.length < 2) {
      setShowResults(false)
      setSearchResults([])
      return
    }
    try {
      const results = await searchMembersForFinance(val)
      setSearchResults(results as unknown as SearchResult[])
      setShowResults(true)
    } catch {
      setShowResults(false)
    }
  }

  function selectPerson(person: SearchResult) {
    const fullName = `${person.csaladnev} ${person.k_nev}`.trim()
    setPersonId(person.id)
    setBerloNev(fullName)
    setSearchQuery(fullName)
    setShowResults(false)
  }

  function clearPerson() {
    setPersonId(null)
    setBerloNev('')
    setSearchQuery('')
  }

  async function handleSubmit() {
    // Kliens-oldali gyors validáció
    if (berloTipus === 'szemely' && !berloNev.trim()) {
      toast.error('A bérlő neve kötelező.')
      return
    }
    if (berloTipus === 'ceg' && !cegNev.trim()) {
      toast.error('A cég neve kötelező.')
      return
    }
    if (!leiras.trim()) {
      toast.error('A leírás kötelező.')
      return
    }
    if (osszeg === '' || Number(osszeg) <= 0) {
      toast.error('Az összegnek pozitív számnak kell lennie.')
      return
    }
    if (!kezdet) {
      toast.error('A kezdő dátum kötelező.')
      return
    }
    if (vege && vege < kezdet) {
      toast.error('A záró dátum nem lehet korábbi a kezdő dátumnál.')
      return
    }

    setLoading(true)
    const result = await saveRentalContract({
      id: editingContract?.id || undefined,
      berlo_tipus: berloTipus,
      berlo_nev: berloTipus === 'szemely' ? berloNev.trim() : cegNev.trim(),
      id_szemely: berloTipus === 'szemely' ? personId : null,
      ceg_nev: berloTipus === 'ceg' ? cegNev.trim() : null,
      ceg_adoszam: berloTipus === 'ceg' ? cegAdoszam.trim() || null : null,
      targy: targy.trim() || null,
      leiras: leiras.trim(),
      tipus,
      jogi_tipus: jogiTipus,
      osszeg: jogiTipus === 'comodat' ? 0 : Number(osszeg),
      fizetesi_ciklus: fizetesiCiklus,
      kezdet,
      vege: vege || null,
      leltari_szam: leltariSzam.trim() || null,
      telekkonyvi_szam: telekkonyviSzam.trim() || null,
      aktiv: true,
      megjegyzes: megjegyzes.trim() || null,
    })
    setLoading(false)

    if ('error' in result && result.error) {
      toast.error(result.error)
      return
    }

    toast.success(isEditing ? 'Bérleti szerződés frissítve.' : 'Bérleti szerződés mentve.')
    onOpenChange(false)
    if (onSaved) await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  {isEditing ? 'Bérleti szerződés szerkesztése' : 'Bérleti szerződés rögzítése'}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Terület vagy épület bérbeadása, havi vagy éves díjjal
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Bérlő típusa */}
          <ModalField label="Bérlő típusa" required>
            <div className="grid grid-cols-2 gap-2">
              {RENTAL_BERLO_TIPUS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBerloTipus(t)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    berloTipus === t
                      ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-amber-200 hover:text-amber-700'
                  }`}
                >
                  {RENTAL_BERLO_TIPUS_LABELS[t]}
                </button>
              ))}
            </div>
          </ModalField>

          {/* Személy bérlő */}
          {berloTipus === 'szemely' && (
            <ModalField label="Bérlő neve" required hint="Kezd gépelni (min. 2 karakter) — a lista a gyülekezet tagjai között keres">
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Bérlő név keresése..."
                  className="pl-9"
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              </div>
              {personId ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                    Gyülekezeti tag • ID {personId}
                  </Badge>
                  <button
                    type="button"
                    className="text-xs text-slate-500 underline hover:text-slate-700"
                    onClick={clearPerson}
                  >
                    Kapcsolat törlése
                  </button>
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-zinc-400">
                  Nem gyülekezeti tag esetén csak a nevet írd be.
                </p>
              )}

              {showResults && searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-[calc(100%-3rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl">
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-amber-50"
                      onClick={() => selectPerson(r)}
                    >
                      <span>{r.csaladnev} {r.k_nev}</span>
                      <span className="text-xs text-slate-400">
                        {r.sz_datum ? r.sz_datum.slice(0, 4) : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ModalField>
          )}

          {/* Cég bérlő */}
          {berloTipus === 'ceg' && (
            <>
              <ModalField label="Cég / Szervezet neve" required>
                <Input
                  value={cegNev}
                  onChange={e => setCegNev(e.target.value)}
                  placeholder="Pl. XY Kft."
                  maxLength={200}
                />
              </ModalField>
              <ModalField label="Adószám">
                <Input
                  value={cegAdoszam}
                  onChange={e => setCegAdoszam(e.target.value)}
                  placeholder="RO12345678"
                  maxLength={50}
                />
              </ModalField>
            </>
          )}

          {/* Tárgy (opcionális rövid) */}
          <ModalField
            label="Szerződés tárgya"
            hint={'Rövid cím — pl. „Templomkert bérlet", „Parókia emelet"'}
          >
            <Input
              value={targy}
              onChange={e => setTargy(e.target.value)}
              placeholder="Pl. Templomkert bérlet"
              maxLength={200}
            />
          </ModalField>

          {/* Leírás (kötelező) */}
          <ModalField label="Leírás" required hint="Részletes leírás: ingatlan adatai, helyrajzi szám, egyéb részletek">
            <Textarea
              value={leiras}
              onChange={e => setLeiras(e.target.value)}
              placeholder="Pl. 2500 m² gyümölcsöskert, helyrajzi szám: 1234/5..."
              maxLength={2000}
              rows={3}
            />
          </ModalField>

          {/* Típus: Terület / Épület */}
          <ModalField label="Típus" required hint={`Terület → 104.05, Épület → 104.04 számadási célkód`}>
            <div className="grid grid-cols-2 gap-2">
              {RENTAL_TIPUS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipus(t)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    tipus === t
                      ? 'border-amber-300 bg-amber-50 text-amber-800 shadow-sm'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-amber-200 hover:text-amber-700'
                  }`}
                >
                  {RENTAL_TIPUS_LABELS[t]}
                </button>
              ))}
            </div>
          </ModalField>

          {/* Jogi típus (locatiune / arendare / comodat / concesiune) */}
          <ModalField
            label="Jogi típus"
            required
            hint="Ez meghatározza, hogy a szerződés számít-e a TVA-plafonba (395 000 RON) és kell-e e-Facturát kiállítani."
          >
            <div className="grid grid-cols-2 gap-2">
              {RENTAL_JOGI_TIPUS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setJogiTipus(t)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                    jogiTipus === t
                      ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-sm'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-teal-200 hover:text-teal-700'
                  }`}
                >
                  {RENTAL_JOGI_TIPUS_LABELS[t]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {RENTAL_JOGI_TIPUS_LEIRAS[jogiTipus]}
            </p>
          </ModalField>

          {/* Pénzügyi adatok */}
          <div className="grid grid-cols-2 gap-4">
            <ModalField
              label={jogiTipus === 'comodat' ? 'Bérleti díj (automata 0)' : 'Bérleti díj (RON)'}
              required
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={jogiTipus === 'comodat' ? 0 : osszeg}
                onChange={e => setOsszeg(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={jogiTipus === 'comodat' ? '0 (haszonkölcsön)' : '0.00'}
                disabled={jogiTipus === 'comodat'}
                className={jogiTipus === 'comodat' ? 'bg-slate-100 text-slate-500' : undefined}
              />
            </ModalField>
            <ModalField label="Fizetési ciklus" required>
              <select
                value={fizetesiCiklus}
                onChange={e => setFizetesiCiklus(e.target.value as RentalFrequency)}
                className="modal-input"
              >
                {RENTAL_FREQUENCIES.map(f => (
                  <option key={f} value={f}>
                    {RENTAL_FREQ_LABELS[f]}
                  </option>
                ))}
              </select>
            </ModalField>
          </div>

          {/* Időtartam */}
          <div className="grid grid-cols-2 gap-4">
            <ModalField label="Kezdet" required>
              <Input type="date" value={kezdet} onChange={e => setKezdet(e.target.value)} />
            </ModalField>
            <ModalField label="Vége" hint="Üresen hagyhatod — nyitott végű szerződés">
              <Input type="date" value={vege} onChange={e => checkVege(e.target.value)} />
              {vegeBadge && (
                <Badge variant="secondary" className="mt-1 bg-rose-100 text-rose-700 text-[10px]">
                  {vegeBadge}
                </Badge>
              )}
            </ModalField>
          </div>

          {/* Azonosítók (opcionálisak) */}
          <div className="grid grid-cols-2 gap-4">
            <ModalField label="Leltári szám">
              <Input
                value={leltariSzam}
                onChange={e => setLeltariSzam(e.target.value)}
                placeholder="Ha a leltárban szerepel"
                maxLength={100}
              />
            </ModalField>
            <ModalField label="Telekkönyvi szám">
              <Input
                value={telekkonyviSzam}
                onChange={e => setTelekkonyviSzam(e.target.value)}
                placeholder="Pl. 1234"
                maxLength={100}
              />
            </ModalField>
          </div>

          {/* Megjegyzés */}
          <ModalField label="Megjegyzés">
            <Textarea
              value={megjegyzes}
              onChange={e => setMegjegyzes(e.target.value)}
              placeholder="Belső megjegyzés (opcionális)"
              maxLength={2000}
              rows={2}
            />
          </ModalField>

          {/* Mentés / Mégse */}
          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button
              variant="outline"
              className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Mégse
            </Button>
            <Button
              className="flex-[2] rounded-xl bg-amber-600 hover:bg-amber-700"
              onClick={handleSubmit}
              disabled={loading || !!vegeBadge}
            >
              {loading
                ? 'Mentés...'
                : isEditing
                ? 'Változások mentése'
                : 'Szerződés mentése'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
