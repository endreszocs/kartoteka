'use client'

import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { saveFamily, searchFamilyMember } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import { getDistricts, type DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { toast } from 'sonner'
import { FamilyCardPreview, type FamilyCardData } from '@/components/modals/family-card-preview'

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
  cnp: string | null
  sz_datum: string | null
  c_szam: string | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
}

interface FamilyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editFamily: FamilyRow | null
}

type PersonRef = { id: number; name: string; age?: number | null }

export function FamilyFormDialog({ open, onOpenChange, editFamily }: FamilyFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [husband, setHusband] = useState<PersonRef | null>(null)
  const [wife, setWife] = useState<PersonRef | null>(null)
  const [children, setChildren] = useState<PersonRef[]>([])
  const [cSzam, setCSzam] = useState('')
  const [cUtcaid, setCUtcaid] = useState<number | undefined>(undefined)
  const [cUtcaName, setCUtcaName] = useState('')
  const [idCsoport, setIdCsoport] = useState<string>('')
  const [districts, setDistricts] = useState<DistrictRow[]>([])

  // Keresők
  const [husbandQuery, setHusbandQuery] = useState('')
  const [wifeQuery, setWifeQuery] = useState('')
  const [childQuery, setChildQuery] = useState('')
  const [husbandResults, setHusbandResults] = useState<SearchResult[]>([])
  const [wifeResults, setWifeResults] = useState<SearchResult[]>([])
  const [childResults, setChildResults] = useState<SearchResult[]>([])
  const [showHusband, setShowHusband] = useState(false)
  const [showWife, setShowWife] = useState(false)
  const [showChild, setShowChild] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      // Körzetek mindig betöltődnek (csak a saját gyülekezeté)
      getDistricts().then(data => {
        if (!cancelled) setDistricts(data)
      })
      if (editFamily) {
        const ageOf = (d: string | null | undefined) =>
          d ? new Date().getFullYear() - new Date(d).getFullYear() : null
        setHusband(editFamily.ferfi
          ? { id: editFamily.ferfi.id, name: `${editFamily.ferfi.csaladnev} ${editFamily.ferfi.k_nev}`, age: ageOf(editFamily.ferfi.sz_datum) }
          : null)
        setWife(editFamily.no
          ? { id: editFamily.no.id, name: `${editFamily.no.csaladnev} ${editFamily.no.k_nev}`, age: ageOf(editFamily.no.sz_datum) }
          : null)
        setCSzam(editFamily.c_szam || '')
        setCUtcaName(editFamily.utca?.name || '')
        setCUtcaid(undefined)
        setIdCsoport(editFamily.id_csoport ? String(editFamily.id_csoport) : '')
        setChildren([])
      } else {
        setHusband(null)
        setWife(null)
        setChildren([])
        setCSzam('')
        setCUtcaName('')
        setCUtcaid(undefined)
        setIdCsoport('')
      }
      setHusbandQuery('')
      setWifeQuery('')
      setChildQuery('')
      setHusbandResults([])
      setWifeResults([])
      setChildResults([])
    })
    return () => {
      cancelled = true
    }
  }, [open, editFamily])

  async function handleSearch(val: string, type: 'husband' | 'wife' | 'child') {
    if (val.length < 2) {
      if (type === 'husband') { setShowHusband(false) }
      else if (type === 'wife') { setShowWife(false) }
      else { setShowChild(false) }
      return
    }
    const role = type === 'husband' ? 'ferfi' as const : type === 'wife' ? 'no' as const : 'gyerek' as const
    const results = await searchFamilyMember(val, role, editFamily?.id)
    if (type === 'husband') { setHusbandResults(results as unknown as SearchResult[]); setShowHusband(true) }
    else if (type === 'wife') { setWifeResults(results as unknown as SearchResult[]); setShowWife(true) }
    else { setChildResults(results as unknown as SearchResult[]); setShowChild(true) }
  }

  function selectPerson(r: SearchResult, type: 'husband' | 'wife' | 'child') {
    const name = `${r.csaladnev} ${r.k_nev}`
    const age = r.sz_datum ? new Date().getFullYear() - new Date(r.sz_datum).getFullYear() : null
    if (type === 'husband') {
      setHusband({ id: r.id, name, age }); setHusbandQuery(''); setShowHusband(false)
      // Cím auto-töltés a férj lakcíméből
      if (r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(undefined) }
      if (r.c_szam) setCSzam(r.c_szam)
    } else if (type === 'wife') {
      setWife({ id: r.id, name, age }); setWifeQuery(''); setShowWife(false)
      // Ha nincs még cím → a feleség lakcíméből tölt
      if (!cUtcaName && r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(undefined) }
      if (!cSzam && r.c_szam) setCSzam(r.c_szam)
    } else {
      if (!children.find(c => c.id === r.id)) setChildren(prev => [...prev, { id: r.id, name, age }])
      setChildQuery('')
      setShowChild(false)
    }
  }

  function removeChild(id: number) {
    setChildren(prev => prev.filter(c => c.id !== id))
  }

  async function handleSubmit() {
    if (!husband && !wife) { toast.error('Legalább egy felet (férj vagy feleség) meg kell adni.'); return }
    setLoading(true)
    const result = await saveFamily({
      id: editFamily?.id,
      id_ferfi: husband?.id ?? null,
      id_no: wife?.id ?? null,
      gyerekIds: children.map(c => c.id),
      c_utcaid: cUtcaid,
      c_szam: cSzam || undefined,
      id_csoport: idCsoport ? parseInt(idCsoport) : null,
    })
    if (result.error) toast.error(result.error)
    else { toast.success(editFamily ? 'Család frissítve!' : 'Család létrehozva!'); onOpenChange(false) }
    setLoading(false)
  }

  function renderSearchDropdown(results: SearchResult[], visible: boolean, type: 'husband' | 'wife' | 'child') {
    if (!visible || results.length === 0) return null
    return (
      <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
        {results.map(r => (
          <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => selectPerson(r, type)}>
            <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
            <div className="text-xs text-muted-foreground">
              {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 2026-06-02: élő kártya-előnézet — minden state-frissítésre újraszámol.
  // A „familyName" a férj családnevéből vesszük (vagy a feleségéből, ha nincs férj).
  const previewData: FamilyCardData = useMemo(() => {
    const husbandLastName = husband?.name.split(' ')[0]
    const wifeLastName = wife?.name.split(' ')[0]
    const familyName = husbandLastName || wifeLastName || null
    const districtName = idCsoport
      ? districts.find((d) => String(d.id) === idCsoport)?.nev ?? null
      : null
    return {
      familyName,
      husband: husband ? { id: husband.id, name: husband.name, age: husband.age ?? null } : null,
      wife: wife ? { id: wife.id, name: wife.name, age: wife.age ?? null } : null,
      children: children.map((c) => ({ id: c.id, name: c.name, age: c.age ?? null })),
      street: cUtcaName || null,
      houseNumber: cSzam || null,
      districtName,
      isPreview: true,
      isActive: true,
    }
  }, [husband, wife, children, cUtcaName, cSzam, idCsoport, districts])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editFamily ? 'Család szerkesztése' : 'Új család létrehozása'}
            <span className="text-xs font-normal text-amber-600 inline-flex items-center gap-1">
              <Sparkles className="size-3.5" />
              élő karton-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="space-y-4 md:max-h-[78vh] md:overflow-y-auto md:pr-2">
          {/* Férj */}
          <div className="space-y-1.5 relative">
            <Label>Férj</Label>
            {husband ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700">♂ {husband.name}</Badge>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => setHusband(null)}>✕</Button>
              </div>
            ) : (
              <Input placeholder="Keresés név alapján (3+ karakter)..." value={husbandQuery}
                onChange={e => { setHusbandQuery(e.target.value); handleSearch(e.target.value, 'husband') }} />
            )}
            {renderSearchDropdown(husbandResults, showHusband, 'husband')}
          </div>

          {/* Feleség */}
          <div className="space-y-1.5 relative">
            <Label>Feleség</Label>
            {wife ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-pink-100 text-pink-700">♀ {wife.name}</Badge>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => setWife(null)}>✕</Button>
              </div>
            ) : (
              <Input placeholder="Keresés név alapján (3+ karakter)..." value={wifeQuery}
                onChange={e => { setWifeQuery(e.target.value); handleSearch(e.target.value, 'wife') }} />
            )}
            {renderSearchDropdown(wifeResults, showWife, 'wife')}
          </div>

          {/* Gyerekek */}
          <div className="space-y-1.5 relative">
            <Label>Gyerekek</Label>
            {children.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {children.map(c => (
                  <Badge key={c.id} variant="outline" className="text-xs">
                    {c.name}
                    <button className="ml-1 text-red-400 hover:text-red-600" onClick={() => removeChild(c.id)}>✕</button>
                  </Badge>
                ))}
              </div>
            )}
            <Input placeholder="Gyermek hozzáadása (keresés)..." value={childQuery}
              onChange={e => { setChildQuery(e.target.value); handleSearch(e.target.value, 'child') }} />
            {renderSearchDropdown(childResults, showChild, 'child')}
          </div>

          {/* Cím */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Utca</Label>
              <Input value={cUtcaName} onChange={e => setCUtcaName(e.target.value)} placeholder="Automatikusan töltődik" />
              <p className="text-xs text-muted-foreground">A kiválasztott fél lakcíméből töltődik</p>
            </div>
            <div className="space-y-1.5">
              <Label>Házszám</Label>
              <Input value={cSzam} onChange={e => setCSzam(e.target.value)} placeholder="Pl. 12/A" />
            </div>
          </div>

          {/* Körzet — opcionális */}
          <div className="space-y-1.5">
            <Label>Körzet</Label>
            <select
              value={idCsoport}
              onChange={e => setIdCsoport(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— Nincs körzet —</option>
              {districts.map(d => (
                <option key={d.id} value={d.id}>{d.nev}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              A család körzethez rendelése — a presbiteri látogatások és körzeti riportok ide csoportosítják.
            </p>
          </div>

          </div>

          {/* ─── JOBB OSZLOP: Élő karton-előnézet ─── */}
          <aside className="md:sticky md:top-0 md:self-start">
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 mb-2">
              <p className="text-[11px] text-amber-900 leading-relaxed">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Ahogy gépeled / választod az adatokat, a családi karton automatikusan
                kitöltődik. A sárga figyelmeztetésnél a kártya megmutatja, mi hiányzik még.
              </p>
            </div>
            <FamilyCardPreview data={previewData} />
          </aside>
        </div>

        {/* ─── Alsó akciósor ─── */}
        <div className="flex gap-2 pt-4 border-t border-zinc-100 mt-4">
          <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Mentés...' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
