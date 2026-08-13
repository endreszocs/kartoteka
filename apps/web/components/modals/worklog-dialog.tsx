'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveWorklog } from '@/app/(dashboard)/munkanaplo/actions'
import { WORKLOG_TYPES, NAPSZAK_OPTIONS, categorizeWorklogEntry } from '@/lib/constants/worklog'
import type { WorklogCategory, WorklogEntry } from '@/lib/constants/worklog'
import { toast } from 'sonner'

interface WorklogDialogProps { open: boolean; onOpenChange: (open: boolean) => void; editEntry: WorklogEntry | null; defaultCategory: WorklogCategory }

export function WorklogDialog({ open, onOpenChange, editEntry, defaultCategory }: WorklogDialogProps) {
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<WorklogCategory>(defaultCategory)
  const [idopont, setIdopont] = useState('')
  const [jellege, setJellege] = useState('')
  const [cim, setCim] = useState('')
  // A `bibliaolvasas`/`alapige`/`enekek` mezőkbe kerül a szolgálati részlet,
  // a `megjegyzes` az általános leíráshoz. (A korábbi `leiras`/`igehely`/
  // `szolgalatvezeto` mezők NEM léteznek a DB-ben — átképezve.)
  const [bibliaolvasas, setBibliaolvasas] = useState('')
  const [alapige, setAlapige] = useState('')
  const [enekek, setEnekek] = useState('')
  const [szolgalt, setSzolgalt] = useState('')
  const [ferfi, setFerfi] = useState<number>(0)
  const [no, setNo] = useState<number>(0)
  const [gyermek, setGyermek] = useState<number>(0)
  const [persely, setPersely] = useState<number>(0)
  // 2026-07-11 (F2): a korábbi "Délutáni alkalom" checkbox (legacy `du`)
  // helyett napszak-választó (de/du/este) — a mentés a `du`-t szinkronban
  // tartja (du = napszak === 'du').
  const [napszak, setNapszak] = useState<'de' | 'du' | 'este'>('de')
  // Úrvacsorázók — templomban / betegnél. String state: '' = nincs adat
  // (null-t tárolunk), a beírt 0 viszont értelmes érték marad.
  const [uvTemplomban, setUvTemplomban] = useState('')
  const [uvBetegnel, setUvBetegnel] = useState('')
  const [megj, setMegj] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editEntry) {
        setIdopont((editEntry.idopont || '').split('T')[0] || '')
        setJellege(editEntry.jellege || '')
        setCim(editEntry.cim || '')
        setBibliaolvasas(editEntry.bibliaolvasas || '')
        setAlapige(editEntry.alapige || '')
        setEnekek(editEntry.enekek || '')
        setSzolgalt(editEntry.szolgalt || '')
        setFerfi(editEntry.jelenlet_ferfi || 0)
        setNo(editEntry.jelenlet_no || 0)
        setGyermek(editEntry.jelenlet_gyermek || 0)
        setPersely(editEntry.persely || 0)
        // Napszak: az új oszlop az elsődleges, a legacy `du` a fallback.
        setNapszak(editEntry.napszak ?? (editEntry.du ? 'du' : 'de'))
        setUvTemplomban(editEntry.uv_templomban != null ? String(editEntry.uv_templomban) : '')
        setUvBetegnel(editEntry.uv_betegnel != null ? String(editEntry.uv_betegnel) : '')
        setMegj(editEntry.megjegyzes || '')
        // Kategória meghatározás — a közös helperrel (kategoria mező +
        // jellege fallback; 2026-06-12, Endre #3 munkanapló)
        setCategory(categorizeWorklogEntry(editEntry))
      } else {
        setCategory(defaultCategory)
        setIdopont(new Date().toISOString().slice(0, 10))
        setJellege('')
        setCim('')
        setBibliaolvasas('')
        setAlapige('')
        setEnekek('')
        setSzolgalt('')
        setFerfi(0)
        setNo(0)
        setGyermek(0)
        setPersely(0)
        setNapszak('de')
        setUvTemplomban('')
        setUvBetegnel('')
        setMegj('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, editEntry, defaultCategory])

  async function handleSubmit() {
    if (!idopont || !jellege) {
      toast.error('A dátum és típus kötelező!')
      return
    }
    setLoading(true)
    // 2026-07-11: a state megy ki változtatás nélkül — szerkesztésnél a
    // betöltött (akár nem renderelt) mezők így megmaradnak; a kategóriaváltási
    // átszivárgást a váltás-kori mező-ürítés zárja ki, nem a mentéskori nullázás
    // (az utóbbi a rejtett meglévő értékeket is törölte volna).
    const result = await saveWorklog({
      id: editEntry?.id,
      // Optimista zárolás: a betöltött revision megy vissza — ha közben más
      // (pl. a desktop) módosított, a mentés hibával jelez.
      revision: editEntry?.revision ?? undefined,
      idopont,
      jellege,
      kategoria: category,
      cim: cim || null,
      bibliaolvasas: bibliaolvasas || null,
      alapige: alapige || null,
      enekek: enekek || null,
      szolgalt: szolgalt || null,
      jelenlet_ferfi: ferfi || null,
      jelenlet_no: no || null,
      jelenlet_gyermek: gyermek || null,
      persely: persely || null,
      // Napszak + legacy `du` szinkronban (adat-kontraktus: du = napszak==='du')
      napszak,
      du: napszak === 'du',
      // Úrvacsorázók: üres mező → null (a beírt 0 értelmes adat, azt tároljuk)
      uv_templomban: uvTemplomban === '' ? null : Number(uvTemplomban),
      uv_betegnel: uvBetegnel === '' ? null : Number(uvBetegnel),
      megjegyzes: megj || null,
    })
    if (result.error) toast.error(result.error)
    else {
      toast.success(editEntry ? 'Frissítve!' : 'Rögzítve!')
      onOpenChange(false)
    }
    setLoading(false)
  }

  const types = WORKLOG_TYPES[category] || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editEntry ? 'Bejegyzés szerkesztése' : 'Új bejegyzés'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* Kategória + típus */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategória</Label>
              <select
                value={category}
                onChange={e => {
                  const next = e.target.value as WorklogCategory
                  setCategory(next)
                  setJellege('')
                  // 2026-07-11: váltáskor az ÚJ kategóriában nem látható mezők
                  // ürülnek — különben a rejtett értékek átszivárognának a
                  // mentésbe. A szolgalt mindhárom űrlapon látható, ezért marad.
                  if (next !== 'szolgalat') {
                    setAlapige('')
                    setBibliaolvasas('')
                    setEnekek('')
                    setNapszak('de')
                    setUvTemplomban('')
                    setUvBetegnel('')
                  }
                  if (next === 'latogatas') setPersely(0)
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="szolgalat">Szolgálat</option>
                <option value="katekezis">Katekézis</option>
                <option value="latogatas">Látogatás</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Típus *</Label>
              <select value={jellege} onChange={e => setJellege(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">— Válasszon —</option>
                {/* Legacy/egyedi típus megőrzése szerkesztéskor (pl. régi elgépelt
                    érték) — különben a select üresre ugrana. 2026-06-12. */}
                {jellege && !types.includes(jellege) && <option value={jellege}>{jellege}</option>}
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Dátum *</Label><Input type="date" value={idopont} onChange={e => setIdopont(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cím</Label><Input value={cim} onChange={e => setCim(e.target.value)} /></div>
          </div>

          {/* Jelenlét — mindhárom kategóriánál (a hivatalos Excel naplók
              mindegyike tartalmaz létszámot: Férfi/Nő, Résztvett, Jelen volt).
              2026-06-12 (Endre #3 munkanapló). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Férfi</Label><Input type="number" min={0} value={ferfi} onChange={e => setFerfi(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Nő</Label><Input type="number" min={0} value={no} onChange={e => setNo(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Gyermek</Label><Input type="number" min={0} value={gyermek} onChange={e => setGyermek(Number(e.target.value))} /></div>
          </div>

          {/* Szolgálat extra mezők */}
          {category === 'szolgalat' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Perselypénz (RON)</Label><Input type="number" min={0} step={0.01} value={persely} onChange={e => setPersely(Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Alapige</Label><Input value={alapige} onChange={e => setAlapige(e.target.value)} placeholder="Pl. Jn 3,16" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Bibliaolvasás</Label><Input value={bibliaolvasas} onChange={e => setBibliaolvasas(e.target.value)} placeholder="Pl. Mt 5" /></div>
                <div className="space-y-1.5"><Label>Énekek</Label><Input value={enekek} onChange={e => setEnekek(e.target.value)} placeholder="Pl. 458, 372" /></div>
              </div>
              <div className="space-y-1.5"><Label>Szolgálatot vezette</Label><Input value={szolgalt} onChange={e => setSzolgalt(e.target.value)} /></div>
              {/* 2026-07-11 (F2): a hivatalos Excel "Du." oszlopának finomítása —
                  napszak (de/du/este) + úrvacsorázók (templomban/betegnél) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Napszak</Label>
                  <select
                    value={napszak}
                    onChange={e => setNapszak(e.target.value as 'de' | 'du' | 'este')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {NAPSZAK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Úrvacsorázók — templomban / betegnél</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" min={0} inputMode="numeric" placeholder="Templomban" value={uvTemplomban} onChange={e => setUvTemplomban(e.target.value)} />
                    <Input type="number" min={0} inputMode="numeric" placeholder="Betegnél" value={uvBetegnel} onChange={e => setUvBetegnel(e.target.value)} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Katekézis: persely + aki tartotta (a hivatalos Excel Katekézis
              naplójában: Perselypénz, Tartotta oszlopok) */}
          {category === 'katekezis' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Perselypénz (RON)</Label><Input type="number" min={0} step={0.01} value={persely} onChange={e => setPersely(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Tartotta</Label><Input value={szolgalt} onChange={e => setSzolgalt(e.target.value)} placeholder="Pl. a lelkész neve" /></div>
            </div>
          )}

          {/* Látogatás: a látogató lelkész (a hivatalos Excel Családlátogatás
              naplójában: lelkész + jelen volt) */}
          {category === 'latogatas' && (
            <div className="space-y-1.5"><Label>Lelkész / látogató</Label><Input value={szolgalt} onChange={e => setSzolgalt(e.target.value)} placeholder="Pl. a lelkész neve" /></div>
          )}

          <div className="space-y-1.5"><Label>Megjegyzés</Label><textarea value={megj} onChange={e => setMegj(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[50px] resize-y" /></div>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
