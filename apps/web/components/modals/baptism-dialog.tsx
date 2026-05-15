'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { saveBaptism, getNextEgyhaziSzam, getParentsForChild } from '@/app/(dashboard)/anyakonyv/actions'
import { MemberSearchSelect, type MemberSearchResult } from '@/components/registry/member-search-select'
import { MemberFormDialog } from '@/components/modals/member-form-dialog'
import { toast } from 'sonner'

interface BaptismDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationName: string
  editEntry?: {
    id: number
    datum?: string
    okirat?: string
    egyhazi_szam?: string
    lelkeszneve?: string
    keresztszulok?: string
    alapige?: string
    megjegyzes?: string
    szemely?: { id: number; csaladnev: string; k_nev: string; ferfi: boolean | null; sz_datum: string | null } | null
    [key: string]: unknown
  } | null
}

export function BaptismDialog({ open, onOpenChange, editEntry }: BaptismDialogProps) {
  const [loading, setLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<MemberSearchResult | null>(null)
  const [familyAutoLoaded, setFamilyAutoLoaded] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // Szülők — a CNP a kiválasztott személyből származik (derived state)
  const [father, setFather] = useState<MemberSearchResult | null>(null)
  const [mother, setMother] = useState<MemberSearchResult | null>(null)
  // TEXT-csak szülő-nevek a szemely.apjaneve / anyjaneve-ből (régebbi
  // adat — nincs feloldható ID). Banner-ben jelezzük a felhasználónak.
  const [apjaneveText, setApjaneveText] = useState<string | null>(null)
  const [anyjaneveText, setAnyjaneveText] = useState<string | null>(null)
  // Diagnosztika debug-paneles megjelenítéshez (Endre kérése: 2026-04-30k —
  // "diagnosztika" — a baptism-dialog felső szelvényében mutatjuk mi történt)
  const [parentDiag, setParentDiag] = useState<string | null>(null)

  // Mezők
  const [datum, setDatum] = useState('')
  const [egyhaziSzam, setEgyhaziSzam] = useState('')
  const [okirat, setOkirat] = useState('')
  const [lelkesz, setLelkesz] = useState('')
  const [keresztszulok, setKeresztszulok] = useState('')
  const [alapige, setAlapige] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')
  const [munkanaploba, setMunkanaploba] = useState(false)
  const [apavallas, setApavallas] = useState('')
  const [anyavallas, setAnyavallas] = useState('')
  const [anyaLeanykori, setAnyaLeanykori] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        // Szerkesztés: előtöltés
        setSelectedPerson(editEntry.szemely
          ? { ...editEntry.szemely, cnp: null, c_szam: null }
          : null)
        setDatum((editEntry.datum as string)?.split('T')[0] || '')
        setEgyhaziSzam((editEntry.egyhazi_szam as string) || '')
        setOkirat((editEntry.okirat as string) || '')
        setLelkesz((editEntry.lelkeszneve as string) || '')
        setKeresztszulok((editEntry.keresztszulok as string) || '')
        setAlapige((editEntry.alapige as string) || '')
        const megj = (editEntry.megjegyzes as string) || ''
        const sablonIdx = megj.indexOf('|sablon:')
        if (sablonIdx > -1) {
          setMegjegyzes(megj.slice(0, sablonIdx))
          try {
            const s = JSON.parse(megj.slice(sablonIdx + 8))
            setApavallas(s.apa_vallas || '')
            setAnyavallas(s.anya_vallas || '')
            setAnyaLeanykori(s.anya_leanyneve || '')
          } catch {
            setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
          }
        } else {
          setMegjegyzes(megj); setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
        }
        setFather(null); setMother(null); setFamilyAutoLoaded(false)
        setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
        setMunkanaploba(false)
        return
      }
      // Új rögzítés
      setSelectedPerson(null)
      setFather(null); setMother(null); setFamilyAutoLoaded(false)
      setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
      const today = new Date().toISOString().slice(0, 10)
      setDatum(today); setOkirat(''); setLelkesz(''); setKeresztszulok('')
      setAlapige(''); setMegjegyzes(''); setMunkanaploba(false)
      setApavallas(''); setAnyavallas(''); setAnyaLeanykori('')
      // Auto-fill egyházi anyakönyvi szám (Endre kérése: 2026-04-30)
      getNextEgyhaziSzam('baptism', new Date().getFullYear()).then(value => {
        if (!cancelled) setEgyhaziSzam(value)
      })
    })
    return () => { cancelled = true }
  }, [open, editEntry])

  // Endre kérése (2026-04-30): ha a kiválasztott keresztelendő már családhoz
  // van rendelve (gyerek táblában), akkor a szülők neveit automatikusan
  // betöltjük. Csak új-rögzítésnél, és csak ha a szülők még nincsenek
  // beállítva manuálisan. A reset (selectedPerson=null) az onChange-ben
  // történik, NEM itt — a useEffect csak az async family-load-ot kezeli.
  useEffect(() => {
    if (!open || editEntry) return
    if (!selectedPerson) return
    if (familyAutoLoaded) return
    if (father || mother) return  // ne írjuk felül a manuális választást

    let cancelled = false
    if (process.env.NODE_ENV === 'development') {
      console.log(`[baptism-dialog] szülő-load indul, person.id=${selectedPerson.id}`)
    }
    getParentsForChild(selectedPerson.id).then(info => {
      if (cancelled) return
      if (process.env.NODE_ENV === 'development') {
        console.log(`[baptism-dialog] getParentsForChild válasz:`, info)
      }

      if (info.apa) {
        setFather({
          id: info.apa.id!,
          csaladnev: info.apa.csaladnev,
          k_nev: info.apa.k_nev,
          ferfi: true,
          sz_datum: info.apa.sz_datum,
          cnp: info.apa.cnp,
          c_szam: info.apa.c_szam,
          adrlocality: info.apa.adrlocality,
          adrstreet: info.apa.adrstreet,
        })
      }
      if (info.anya) {
        setMother({
          id: info.anya.id!,
          csaladnev: info.anya.csaladnev,
          k_nev: info.anya.k_nev,
          ferfi: false,
          sz_datum: info.anya.sz_datum,
          cnp: info.anya.cnp,
          c_szam: info.anya.c_szam,
          adrlocality: info.anya.adrlocality,
          adrstreet: info.anya.adrstreet,
        })
      }
      if (info.anyaLeanyneve && !anyaLeanykori) setAnyaLeanykori(info.anyaLeanyneve)

      // TEXT-fallback: ha nincs feloldható apa/anya ID, de a szemely
      // táblában szöveges szülő-név van, akkor azt megjelenítjük
      // (banner) hogy a felhasználó kézzel rákereshessen.
      setApjaneveText(info.apa ? null : info.apjaneveText)
      setAnyjaneveText(info.anya ? null : info.anyjaneveText)

      // Diagnosztikai szöveg — Endre számára, hogy lássa MIÉRT nem jelennek meg
      const d = info.diagnostic
      const lines: string[] = []
      if (!d.hasGyerekRow) lines.push('A tag NINCS családhoz rendelve (gyerek tábla üres).')
      else if (!d.csaladId) lines.push('Van gyerek-rekord, de nincs hozzá csalad-rekord.')
      else lines.push(`Család #${d.csaladId} — apa szemely.id=${d.csaladFerfiId ?? '—'}, anya szemely.id=${d.csaladNoId ?? '—'}.`)
      if (d.szemelyApjaCnp) lines.push(`szemely.id_apja CNP: ${d.szemelyApjaCnp} → ${d.szemelyApjaCnpResolved ? 'sikerült feloldani' : '⚠️ NEM sikerült feloldani'}.`)
      if (d.szemelyAnyjaCnp) lines.push(`szemely.id_anyja CNP: ${d.szemelyAnyjaCnp} → ${d.szemelyAnyjaCnpResolved ? 'sikerült feloldani' : '⚠️ NEM sikerült feloldani'}.`)
      if (info.apjaneveText && !info.apa) lines.push(`Csak szöveg-apa: "${info.apjaneveText}" — kézzel keress rá.`)
      if (info.anyjaneveText && !info.anya) lines.push(`Csak szöveg-anya: "${info.anyjaneveText}" — kézzel keress rá.`)
      setParentDiag(lines.length > 0 ? lines.join(' ') : null)

      if (info.fromCsalad && (info.apa || info.anya)) {
        toast.success('Szülők automatikusan kitöltve a családi adatokból.', { duration: 3500 })
      }
      setFamilyAutoLoaded(true)
    }).catch(err => {
      if (cancelled) return
      console.error('[baptism-dialog] getParentsForChild HIBA:', err)
      setParentDiag(`Hiba a szülők lekérdezésénél: ${err.message || String(err)}`)
      setFamilyAutoLoaded(true)
    })
    return () => { cancelled = true }
  }, [selectedPerson, open, editEntry, familyAutoLoaded, father, mother, anyaLeanykori])

  // A személy kiürítése / új személy választása reseteli a "családi adat
  // betöltve" flag-et és a szülő-mezőket, hogy következő választáskor
  // újra próbálhassa az auto-load-ot.
  function handlePersonChange(p: MemberSearchResult | null) {
    setSelectedPerson(p)
    setFamilyAutoLoaded(false)
    setFather(null); setMother(null)
    setApjaneveText(null); setAnyjaneveText(null); setParentDiag(null)
  }

  function handleQuickAddOpenChange(open: boolean) {
    setQuickAddOpen(open)
    if (!open) {
      // A MemberFormDialog bezárult — vagy mentés után, vagy megse-vel.
      // Endre kérése: az új tag a kereső találatai közt megjelenjen.
      // Mivel a MemberFormDialog nem ad vissza ID-t, csak emlékeztetjük
      // a felhasználót, hogy keressen rá. (Toast csak akkor mutatkozik
      // ha a dialog ténylegesen nyitva volt — mentés vagy lemondás után.)
      toast.info('Ha új személyt adtál hozzá, most kereshető a fenti mezőben.', { duration: 3500 })
    }
  }

  async function handleSubmit() {
    if (!selectedPerson) { toast.error('Válasszon személyt!'); return }
    if (!datum) { toast.error('A dátum kötelező!'); return }
    setLoading(true)
    const fatherName = father ? `${father.csaladnev || ''} ${father.k_nev || ''}`.trim() : ''
    const motherName = mother ? `${mother.csaladnev || ''} ${mother.k_nev || ''}`.trim() : ''
    const fatherCnp = father?.cnp || ''
    const motherCnp = mother?.cnp || ''
    const result = await saveBaptism({
      id: editEntry?.id,
      id_szemely: selectedPerson.id,
      datum,
      okirat: okirat || null,
      egyhazi_szam: egyhaziSzam || null,
      lelkeszneve: lelkesz || null,
      keresztszulok: keresztszulok || null,
      alapige: alapige || null,
      apjaneve: fatherName || null,
      anyjaneve: motherName || null,
      id_apja_cnp: fatherCnp || null,
      id_anyja_cnp: motherCnp || null,
      apa_vallas: apavallas || null,
      anya_vallas: anyavallas || null,
      anya_leanyneve: anyaLeanykori || null,
      munkanaploba,
      megjegyzes: megjegyzes || null,
    })
    if (result.error) toast.error(result.error)
    else { toast.success('Keresztelés rögzítve!'); onOpenChange(false) }
    setLoading(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editEntry ? 'Keresztelés szerkesztése' : 'Keresztelés rögzítése'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Személy + új-személy gomb */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Megkeresztelt személy *</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                  onClick={() => setQuickAddOpen(true)}
                >
                  <UserPlus className="size-3.5" />
                  Új személy a tagnyilvántartáshoz
                </Button>
              </div>
              <MemberSearchSelect
                value={selectedPerson}
                onChange={handlePersonChange}
                placeholder="Keresés (családnév, keresztnév)…"
              />
              <p className="text-[11px] text-slate-500">
                Ha a keresztelendő még nincs a tagnyilvántartásban, az &quot;Új személy&quot; gombbal hozzáadhatod, majd visszatérve kiválaszthatod itt.
              </p>
            </div>

            <Separator />
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Users className="size-4 text-slate-500" />
                Szülők
              </h4>
              {familyAutoLoaded && (father || mother) && (
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Családi adatokból kitöltve
                </span>
              )}
            </div>

            {/* TEXT-fallback: ha a régi szöveges szülő-név szerepel a tagnál,
                de nem találtunk hozzá ID-t, mutatjuk hogy a felhasználó
                tudja kézzel hozzárendelni. */}
            {(apjaneveText || anyjaneveText) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800">
                <p className="font-medium mb-1">A korábbi adatok szerint a szülők neve:</p>
                {apjaneveText && <div>• Édesapa: <span className="font-semibold">{apjaneveText}</span></div>}
                {anyjaneveText && <div>• Édesanya: <span className="font-semibold">{anyjaneveText}</span></div>}
                <p className="mt-1.5 text-[11px] text-amber-700/80">
                  Ezeket a neveket csak szövegként rögzítették — kérlek keresd ki őket az alábbi mezőben, hogy az ID-k is összekapcsolódjanak.
                </p>
              </div>
            )}

            {/* Diagnosztika: csak akkor mutatkozik ha kiválasztott tag van
                ÉS nem sikerült szülőt találni (sem ID, sem text). Endre
                tudja megnézni hogy MIÉRT nem jelennek meg. */}
            {parentDiag && familyAutoLoaded && !father && !mother && !apjaneveText && !anyjaneveText && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-600">
                <p className="font-medium mb-1">Miért nincs szülő-adat?</p>
                <p className="text-slate-500">{parentDiag}</p>
                <p className="mt-1 text-slate-500">
                  Az alábbi mezőkben kézzel rákereshetsz a szülőkre.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Édesapa</Label>
                <MemberSearchSelect
                  value={father}
                  onChange={setFather}
                  genderFilter={true}
                  placeholder="Apa keresése (férfi)…"
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Apa vallása</Label>
                  <Input value={apavallas} onChange={e => setApavallas(e.target.value)} className="h-8 text-xs" placeholder="Református" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Édesanya</Label>
                <MemberSearchSelect
                  value={mother}
                  onChange={setMother}
                  genderFilter={false}
                  placeholder="Anya keresése (nő)…"
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Anya vallása</Label>
                  <Input value={anyavallas} onChange={e => setAnyavallas(e.target.value)} className="h-8 text-xs" placeholder="Református" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Leánykori név</Label>
                  <Input value={anyaLeanykori} onChange={e => setAnyaLeanykori(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </div>

            <Separator />
            <h4 className="text-sm font-semibold text-slate-700">Részletek</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Egyházi anyakönyvi szám
                  <span className="ml-1 text-[10px] font-normal text-violet-600">(automatikus)</span>
                </Label>
                <Input value={egyhaziSzam} onChange={e => setEgyhaziSzam(e.target.value)} className="font-mono text-violet-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Állami anyakönyvi szám</Label>
                <Input value={okirat} onChange={e => setOkirat(e.target.value)} placeholder="opcionális" />
              </div>
              <div className="space-y-1.5">
                <Label>Dátum *</Label>
                <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Lelkész</Label><Input value={lelkesz} onChange={e => setLelkesz(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Keresztszülők</Label><Input value={keresztszulok} onChange={e => setKeresztszulok(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Alapige</Label><Input value={alapige} onChange={e => setAlapige(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Megjegyzés</Label><Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={munkanaploba} onChange={e => setMunkanaploba(e.target.checked)} /> Rögzítés a munkanaplóba</label>

            <div className="flex gap-2 pt-4 border-t border-zinc-100">
              <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Új tag hozzáadás — beágyazott MemberFormDialog (a tagnyilvántartásból) */}
      <MemberFormDialog open={quickAddOpen} onOpenChange={handleQuickAddOpenChange} editMember={null} />
    </>
  )
}
