'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, TriangleAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { getFamilyPartnership, saveFamily, searchFamilyMember } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { AssignConflict } from '@/lib/family/family-membership'
import { getDistricts, type DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'
import { toast } from 'sonner'
import { FamilyCardModern, type FamilyCardModernData } from '@kartoteka/ui-app'

interface SearchResult {
  id: number
  csaladnev: string
  k_nev: string
  cnp: string | null
  sz_datum: string | null
  c_szam: string | null
  c_utcaid: number | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
  /** 2026-08-01 (PR-18): a találat már EGY MÁSIK család tagja — figyelmeztető jelvény */
  masikCsalad?: { id: number; name: string; role: 'felnott' | 'gyermek' } | null
}

type EditableFamilyRow = FamilyRow & { c_utcaid?: number | null }

interface FamilyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editFamily: EditableFamilyRow | null
}

// 2026-06-02: jól látható input-stílus — a default bg-card/78 (78% áttetszős)
// egybeolvad a dialog-háttérrel. Ez a stílus tisztán fehér háttérrel + finom
// shadow-val tér el — mint a baptism-dialog mintában.
const FIELD_INPUT_CLASS = 'h-11 rounded-xl border-input bg-card shadow-sm focus-visible:ring-ring'

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
  // 2026-08-01 (PR-18): a szerver dupla-tagsági figyelmeztetése — explicit
  // áthelyezési megerősítést kér a mentés előtt.
  const [pendingConflicts, setPendingConflicts] = useState<{ conflicts: AssignConflict[]; warning: string } | null>(null)
  const conflictRef = useRef<HTMLDivElement>(null)
  // 2026-08-04 (PR-27): a felnőtt pár kapcsolatának jellege és kezdete
  const [parkapcsolat, setParkapcsolat] = useState<'hazastars' | 'elettars' | null>(null)
  const [parDatum, setParDatum] = useState('')

  // A figyelmeztető panel az űrlap alján van — hosszú űrlapon / mobilon a
  // viewport alá esne, és a mentés „nem csinál semmit" érzést keltene.
  useEffect(() => {
    if (pendingConflicts) conflictRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [pendingConflicts])

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
        setCUtcaid(editFamily.c_utcaid ?? undefined)
        setIdCsoport(editFamily.id_csoport ? String(editFamily.id_csoport) : '')
        setChildren((editFamily.gyerekek ?? []).map((child) => ({
          id: child.id,
          name: `${child.csaladnev ?? ''} ${child.k_nev ?? ''}`.trim() || 'Névtelen gyermek',
          age: ageOf(child.sz_datum),
        })))
        // A meglévő párkapcsolat-jelölés betöltése (PR-27) — enélkül a mentés
        // felülírná a már rögzített (pl. anyakönyvi) adatot
        if (editFamily.ferfi?.id && editFamily.no?.id) {
          getFamilyPartnership({ ferfiId: editFamily.ferfi.id, noId: editFamily.no.id })
            .then((p) => {
              if (cancelled) return
              setParkapcsolat(p.tipus)
              setParDatum(p.datum ?? '')
            })
            .catch(() => { /* nem blokkoló */ })
        } else {
          setParkapcsolat(null)
          setParDatum('')
        }
      } else {
        setHusband(null)
        setWife(null)
        setChildren([])
        setCSzam('')
        setCUtcaName('')
        setCUtcaid(undefined)
        setIdCsoport('')
        setParkapcsolat(null)
        setParDatum('')
      }
      setHusbandQuery('')
      setWifeQuery('')
      setChildQuery('')
      setHusbandResults([])
      setWifeResults([])
      setChildResults([])
      setPendingConflicts(null)
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
    // 2026-08-01 (PR-18): azonnali figyelmeztetés dupla tagságnál — a mentéskor
    // a szerver úgyis megerősítést kér, de a felhasználó már itt lássa.
    if (r.masikCsalad) {
      toast.warning(
        `${name} már a(z) ${r.masikCsalad.name} tagja (${r.masikCsalad.role === 'felnott' ? 'családfő/házastárs' : 'gyermek'}). Mentéskor a rendszer rákérdez az áthelyezésre.`,
        { duration: 6000 },
      )
    }
    if (type === 'husband') {
      setHusband({ id: r.id, name, age }); setHusbandQuery(''); setShowHusband(false)
      // Cím auto-töltés a férj lakcíméből
      if (r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(r.c_utcaid ?? undefined) }
      if (r.c_szam) setCSzam(r.c_szam)
    } else if (type === 'wife') {
      setWife({ id: r.id, name, age }); setWifeQuery(''); setShowWife(false)
      // Ha nincs még cím → a feleség lakcíméből tölt
      if (!cUtcaName && r.adrstreet?.name) { setCUtcaName(r.adrstreet.name); setCUtcaid(r.c_utcaid ?? undefined) }
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

  async function handleSubmit(allowMoves = false) {
    if (!husband && !wife) { toast.error('Legalább egy felet (férj vagy feleség) meg kell adni.'); return }
    setLoading(true)
    try {
      const result = await saveFamily({
        id: editFamily?.id,
        id_ferfi: husband?.id ?? null,
        id_no: wife?.id ?? null,
        gyerekIds: children.map(c => c.id),
        c_utcaid: cUtcaid,
        c_szam: cSzam || undefined,
        id_csoport: idCsoport ? parseInt(idCsoport) : null,
        allowMoves,
        // Csak akkor küldjük, ha van pár ÉS a felhasználó jelölt is valamit —
        // különben nem nyúlunk a meglévő (pl. anyakönyvi) kapcsolathoz
        parkapcsolat: husband && wife ? parkapcsolat : null,
        parkapcsolat_datum: husband && wife && parkapcsolat ? (parDatum || null) : null,
      })
      if (result.error) {
        toast.error(result.error)
        setPendingConflicts(null)
      } else if (result.conflicts && result.conflicts.length > 0) {
        // 2026-08-01 (PR-18): dupla tagság — a mentés csak explicit
        // áthelyezéssel mehet tovább. Toast is szól, hogy a görgetés előtt is
        // legyen látható visszajelzés.
        setPendingConflicts({
          conflicts: result.conflicts,
          warning: result.warning ?? 'Egy kiválasztott személy már másik család tagja.',
        })
        toast.warning(result.warning ?? 'Egy kiválasztott személy már másik család tagja — erősítsd meg az áthelyezést a lap alján.', { duration: 8000 })
      } else {
        toast.success(editFamily ? 'Család frissítve!' : 'Család létrehozva!')
        // 2026-06-10 (Fázis 2): a háztartás-sync hibája nem néma többé
        if (result.warning) toast.warning(result.warning, { duration: 8000 })
        setPendingConflicts(null)
        onOpenChange(false)
      }
    } catch (error) {
      console.error('[FamilyFormDialog] A család mentése sikertelen:', error)
      toast.error('A család mentése nem sikerült. Próbáld újra.')
    } finally {
      setLoading(false)
    }
  }

  function renderSearchDropdown(results: SearchResult[], visible: boolean, type: 'husband' | 'wife' | 'child') {
    if (!visible || results.length === 0) return null
    return (
      <div
        id={`family-${type}-results`}
        role="listbox"
        aria-label={`${type === 'husband' ? 'Férj' : type === 'wife' ? 'Feleség' : 'Gyermek'} keresési találatok`}
        className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 shadow-xl"
      >
        {results.map(r => (
          <button
            key={r.id}
            type="button"
            role="option"
            aria-selected="false"
            className="block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            onClick={() => selectPerson(r, type)}
          >
            <span className="block font-semibold text-foreground">{r.csaladnev} {r.k_nev}</span>
            <span className="block text-xs text-muted-foreground">
              {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
            </span>
            {r.masikCsalad && (
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <TriangleAlert className="size-3" />
                már a(z) {r.masikCsalad.name} tagja
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  // 2026-06-02: élő kártya-előnézet — minden state-frissítésre újraszámol.
  // A „familyName" a férj családnevéből vesszük (vagy a feleségéből, ha nincs férj).
  const previewData: FamilyCardModernData = useMemo(() => {
    const husbandLastName = husband?.name.split(' ')[0]
    const wifeLastName = wife?.name.split(' ')[0]
    const familyName = husbandLastName || wifeLastName || null
    const districtName = idCsoport
      ? districts.find((d) => String(d.id) === idCsoport)?.nev ?? null
      : null
    return {
      familyId: editFamily?.id ?? 0,
      familyName,
      members: [
        ...(husband ? [{ id: husband.id, name: husband.name, age: husband.age ?? null, role: 'csaladfo' as const }] : []),
        ...(wife ? [{ id: wife.id, name: wife.name, age: wife.age ?? null, role: 'hazastars' as const }] : []),
        ...children.map((child) => ({ id: child.id, name: child.name, age: child.age ?? null, role: 'gyerek' as const })),
      ],
      street: cUtcaName || null,
      houseNumber: cSzam || null,
      districtName,
      isActive: true,
      paymentStatus: 'unknown',
    }
  }, [husband, wife, children, cUtcaName, cSzam, idCsoport, districts, editFamily?.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] border-border bg-card p-0 sm:w-[calc(100vw-2rem)] sm:max-w-3xl md:max-w-5xl lg:max-w-6xl [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-11">
        <DialogHeader className="sticky top-0 z-20 border-b border-border/70 bg-gradient-to-br from-primary/10 via-card to-amber-50/45 px-5 py-5 pr-14 backdrop-blur dark:to-card sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-xl text-foreground sm:text-2xl">
            {editFamily ? 'Család szerkesztése' : 'Új család létrehozása'}
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
              <Sparkles className="size-3.5" />
              élő karton-előnézet
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-5 px-4 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
          <div className="space-y-4">
          {/* Férj */}
          <div className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4">
            <Label htmlFor={husband ? undefined : 'family-husband-search'} className="font-semibold text-foreground">Férj</Label>
            {husband ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 bg-primary/5 p-2">
                <Badge className="min-h-8 bg-primary/10 text-primary hover:bg-primary/10">♂ {husband.name}</Badge>
                <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl text-destructive" onClick={() => setHusband(null)} aria-label="Férj eltávolítása">✕</Button>
              </div>
            ) : (
              <Input id="family-husband-search" role="combobox" aria-autocomplete="list" aria-expanded={showHusband && husbandResults.length > 0} aria-controls="family-husband-results" placeholder="Keresés név alapján (2+ karakter)…" value={husbandQuery}
                onChange={e => { setHusbandQuery(e.target.value); handleSearch(e.target.value, 'husband') }}
                className={FIELD_INPUT_CLASS} />
            )}
            {renderSearchDropdown(husbandResults, showHusband, 'husband')}
          </div>

          {/* Feleség */}
          <div className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4">
            <Label htmlFor={wife ? undefined : 'family-wife-search'} className="font-semibold text-foreground">Feleség</Label>
            {wife ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 bg-primary/5 p-2">
                <Badge className="min-h-8 bg-primary/10 text-primary hover:bg-primary/10">♀ {wife.name}</Badge>
                <Button variant="ghost" size="icon" className="size-11 shrink-0 rounded-xl text-destructive" onClick={() => setWife(null)} aria-label="Feleség eltávolítása">✕</Button>
              </div>
            ) : (
              <Input id="family-wife-search" role="combobox" aria-autocomplete="list" aria-expanded={showWife && wifeResults.length > 0} aria-controls="family-wife-results" placeholder="Keresés név alapján (2+ karakter)…" value={wifeQuery}
                onChange={e => { setWifeQuery(e.target.value); handleSearch(e.target.value, 'wife') }}
                className={FIELD_INPUT_CLASS} />
            )}
            {renderSearchDropdown(wifeResults, showWife, 'wife')}
          </div>

          {/* Párkapcsolat (2026-08-04, PR-27) — csak ha mindkét fél megvan */}
          {husband && wife && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-background/50 p-4">
              <Label className="font-semibold text-foreground">A pár kapcsolata</Label>
              <div className="flex flex-col gap-2 min-[420px]:flex-row">
                {([
                  { value: 'hazastars' as const, label: 'Házasság', hint: 'anyakönyvezett' },
                  { value: 'elettars' as const, label: 'Élettársi kapcsolat', hint: 'nem anyakönyvezett' },
                ]).map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors ${
                      parkapcsolat === opt.value
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background/70'
                    }`}
                  >
                    <input
                      type="radio"
                      name="family-parkapcsolat"
                      className="size-4"
                      checked={parkapcsolat === opt.value}
                      onChange={() => setParkapcsolat(opt.value)}
                    />
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">({opt.hint})</span>
                  </label>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="family-par-datum" className="text-xs font-medium text-muted-foreground">
                  {parkapcsolat === 'elettars' ? 'Az együttélés kezdete (ha ismert)' : 'Házasságkötés dátuma (ha ismert)'}
                </Label>
                <Input
                  id="family-par-datum"
                  type="date"
                  value={parDatum}
                  disabled={!parkapcsolat}
                  onChange={(e) => setParDatum(e.target.value)}
                  className={FIELD_INPUT_CLASS}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  A jelölés a családfán is megjelenik. Ha a házasság szerepel az anyakönyvben, a dátum onnan is
                  automatikusan rögzül — itt csak akkor írd felül, ha pontosabbat tudsz.
                </p>
              </div>
            </div>
          )}

          {/* Gyerekek */}
          <div className="relative space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4">
            <Label htmlFor="family-child-search" className="font-semibold text-foreground">Gyermekek</Label>
            {children.length > 0 && (
              <div className="mb-1 flex flex-wrap gap-2">
                {children.map(c => (
                  <Badge key={c.id} variant="outline" className="min-h-11 gap-1 rounded-full border-primary/15 bg-primary/5 pl-3 pr-0.5 text-xs text-primary">
                    {c.name}
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => removeChild(c.id)}
                      aria-label={`${c.name} eltávolítása`}
                    >
                      ✕
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input id="family-child-search" role="combobox" aria-autocomplete="list" aria-expanded={showChild && childResults.length > 0} aria-controls="family-child-results" placeholder="Gyermek hozzáadása (keresés)..." value={childQuery}
              onChange={e => { setChildQuery(e.target.value); handleSearch(e.target.value, 'child') }}
              className={FIELD_INPUT_CLASS} />
            {renderSearchDropdown(childResults, showChild, 'child')}
          </div>

          {/* Cím */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-background/50 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="family-street" className="font-semibold text-foreground">Utca</Label>
              <Input
                id="family-street"
                value={cUtcaName}
                readOnly
                placeholder="A kiválasztott tag címéből"
                className={`${FIELD_INPUT_CLASS} bg-muted/45 text-muted-foreground`}
              />
              <p className="text-xs text-muted-foreground">A kiválasztott fél lakcíméből töltődik</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="family-house-number" className="font-semibold text-foreground">Házszám</Label>
              <Input id="family-house-number" value={cSzam} onChange={e => setCSzam(e.target.value)}
                placeholder="Pl. 12/A" className={FIELD_INPUT_CLASS} />
            </div>
          </div>

          {/* Körzet — opcionális */}
          <div className="space-y-2 rounded-2xl border border-border/60 bg-background/50 p-4">
            <Label htmlFor="family-district" className="font-semibold text-foreground">Körzet</Label>
            <select
              id="family-district"
              value={idCsoport}
              onChange={e => setIdCsoport(e.target.value)}
              className={'w-full px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20 ' + FIELD_INPUT_CLASS}
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
          <aside className="md:sticky md:top-[5.75rem] md:self-start">
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                Ahogy gépeled / választod az adatokat, a családi karton automatikusan
                kitöltődik. A sárga figyelmeztetésnél a kártya megmutatja, mi hiányzik még.
              </p>
            </div>
            <FamilyCardModern data={previewData} />
          </aside>
        </div>

        {/* ─── Dupla-tagsági figyelmeztetés (PR-18) ─── */}
        {pendingConflicts && (
          <div ref={conflictRef} className="mx-4 mb-2 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50 sm:mx-6">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm leading-6 text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Figyelem: dupla családtagság!</p>
                <p className="mt-1 text-xs leading-5">{pendingConflicts.warning}</p>
                <ul className="mt-1.5 space-y-0.5 text-xs">
                  {pendingConflicts.conflicts.map((c) => (
                    <li key={`${c.personId}-${c.familyId}`}>
                      <strong>{c.personName}</strong> — jelenleg: {c.familyName}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-[420px]:flex-row">
              <Button
                className="min-h-11 flex-1 rounded-xl bg-amber-600 text-white hover:bg-amber-700"
                disabled={loading}
                onClick={() => void handleSubmit(true)}
              >
                {loading ? 'Mentés…' : 'Áthelyezés és mentés'}
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl" disabled={loading} onClick={() => setPendingConflicts(null)}>
                Mégse
              </Button>
            </div>
          </div>
        )}

        {/* ─── Alsó akciósor ─── */}
        <div className="sticky bottom-0 z-20 mt-1 flex gap-2 border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-14px_30px_-26px_rgba(15,67,61,0.7)] backdrop-blur sm:justify-end sm:px-6">
          <Button variant="outline" className="h-11 flex-1 rounded-xl sm:flex-none sm:px-6" onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button className="h-11 flex-1 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none sm:px-8" onClick={() => void handleSubmit(false)} disabled={loading}>
            {loading ? 'Mentés...' : 'Mentés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
