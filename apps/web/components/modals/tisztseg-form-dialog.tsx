'use client'

/**
 * Nem-presbiteri tisztség rögzítése / szerkesztése (2026-08-26, 5. kör):
 * kántor (hivatásos/önkéntes), diakónus, nőszövetségi/IKE-elnök, önkéntes,
 * bizottsági tag (gazdasági/leltározó/diakóniai), egyházmegyei küldött, egyéb.
 */

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveTisztseg, type TisztsegRow } from '@/app/(dashboard)/tagnyilvantartas/tisztseg-actions'
import { searchParent } from '@/app/(dashboard)/tagnyilvantartas/actions'
import {
  TISZTSEG_TIPUSOK,
  TISZTSEG_TIPUS_CIMKEK,
  BIZOTTSAGOK,
  BIZOTTSAG_CIMKEK,
  type TisztsegTipus,
  type BizottsagKod,
} from '@/lib/tisztsegek/shared'
import { ageFromDate } from '@/lib/utils/date'
import { toast } from 'sonner'

interface TisztsegFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editRow: TisztsegRow | null
  /** Előre kitöltött típus/bizottság (a bizottsági fülek „+ Tag" gombjaihoz). */
  defaultTipus?: TisztsegTipus
  defaultBizottsag?: BizottsagKod
}

export function TisztsegFormDialog({ open, onOpenChange, editRow, defaultTipus, defaultBizottsag }: TisztsegFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [szemelId, setSzemelId] = useState<number | null>(null)
  const [szemelName, setSzemelName] = useState('')
  const [tipus, setTipus] = useState<TisztsegTipus>('kantor')
  const [bizottsag, setBizottsag] = useState<string>('gazdasagi')
  const [bizottsagiSzerep, setBizottsagiSzerep] = useState<'elnok' | 'tag'>('tag')
  const [jelleg, setJelleg] = useState<'' | 'hivatasos' | 'onkentes'>('')
  const [egyebMegnevezes, setEgyebMegnevezes] = useState('')
  const [kezdete, setKezdete] = useState('')
  const [vege, setVege] = useState('')
  const [publikus, setPublikus] = useState(false)
  const [megjegyzes, setMegjegyzes] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: number; csaladnev: string; k_nev: string; sz_datum: string | null; adrlocality: { name: string } | null; adrstreet: { name: string } | null; c_szam: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (editRow?.szemely) {
        setSzemelId(editRow.szemely.id)
        setSzemelName(`${editRow.szemely.csaladnev} ${editRow.szemely.k_nev}`)
        setTipus(editRow.tipus as TisztsegTipus)
        setBizottsag(editRow.bizottsag || 'gazdasagi')
        setBizottsagiSzerep((editRow.bizottsagi_szerep as 'elnok' | 'tag') || 'tag')
        setJelleg((editRow.jelleg as 'hivatasos' | 'onkentes') || '')
        setEgyebMegnevezes(editRow.egyeb_megnevezes || '')
        setKezdete(editRow.kezdete || '')
        setVege(editRow.vege || '')
        setPublikus(editRow.publikus)
        setMegjegyzes(editRow.megjegyzes || '')
      } else {
        setSzemelId(null)
        setSzemelName('')
        setTipus(defaultTipus || 'kantor')
        setBizottsag(defaultBizottsag || 'gazdasagi')
        setBizottsagiSzerep('tag')
        setJelleg('')
        setEgyebMegnevezes('')
        setKezdete('')
        setVege('')
        setPublikus(false)
        setMegjegyzes('')
      }
      setSearchQuery('')
      setSearchResults([])
      setShowResults(false)
    })
    return () => { cancelled = true }
  }, [open, editRow, defaultTipus, defaultBizottsag])

  async function handleSearch(val: string) {
    setSearchQuery(val)
    if (val.length < 3) { setShowResults(false); return }
    const results = await searchParent(val, true)
    setSearchResults(results as unknown as typeof searchResults)
    setShowResults(true)
  }

  async function handleSubmit() {
    if (!szemelId) { toast.error('Kérem, válasszon egyháztagot!'); return }
    if (tipus === 'egyeb' && !egyebMegnevezes.trim()) {
      toast.error('Egyéb tisztségnél a megnevezés kötelező.')
      return
    }
    setLoading(true)
    const result = await saveTisztseg({
      id: editRow?.id,
      id_szemely: szemelId,
      tipus,
      bizottsag: tipus === 'bizottsagi_tag' ? bizottsag : null,
      bizottsagi_szerep: tipus === 'bizottsagi_tag' ? bizottsagiSzerep : null,
      jelleg: tipus === 'kantor' && jelleg ? jelleg : null,
      egyeb_megnevezes: tipus === 'egyeb' ? egyebMegnevezes : null,
      kezdete: kezdete || null,
      vege: vege || null,
      publikus,
      megjegyzes: megjegyzes || null,
    })
    if (result.error) toast.error(result.error)
    else {
      toast.success('Tisztség mentve!')
      if (result.warning) toast.warning(result.warning, { duration: 10000 })
      onOpenChange(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{editRow ? 'Tisztség szerkesztése' : 'Tisztség felvétele'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="relative space-y-1.5">
            <Label>Személy *</Label>
            {szemelId ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{szemelName}</span>
                {!editRow && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => { setSzemelId(null); setSzemelName('') }}>✕</Button>
                )}
              </div>
            ) : (
              <Input placeholder="Keresés név alapján (3+ karakter)..." value={searchQuery} onChange={e => handleSearch(e.target.value)} />
            )}
            {showResults && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border bg-white shadow-lg">
                {searchResults.map(r => {
                  const age = ageFromDate(r.sz_datum)
                  const lakhely = [r.adrlocality?.name, [r.adrstreet?.name, r.c_szam].filter(Boolean).join(' ')].filter(Boolean).join(', ')
                  return (
                    <div key={r.id} className="cursor-pointer border-b p-2.5 text-sm last:border-0 hover:bg-slate-50"
                      onClick={() => { setSzemelId(r.id); setSzemelName(`${r.csaladnev} ${r.k_nev}`); setShowResults(false); setSearchQuery('') }}>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{r.csaladnev} {r.k_nev}</span>
                        {age !== null && <span className="text-xs text-muted-foreground">• {age} éves</span>}
                      </div>
                      {lakhely && <div className="mt-0.5 truncate text-xs text-muted-foreground">{lakhely}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tisztség *</Label>
              <select
                value={tipus}
                onChange={e => setTipus(e.target.value as TisztsegTipus)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TISZTSEG_TIPUSOK.map(t => (
                  <option key={t} value={t}>{TISZTSEG_TIPUS_CIMKEK[t]}</option>
                ))}
              </select>
            </div>

            {tipus === 'kantor' && (
              <div className="space-y-1.5">
                <Label>Kántor jellege</Label>
                <select value={jelleg} onChange={e => setJelleg(e.target.value as '' | 'hivatasos' | 'onkentes')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">— nincs megadva —</option>
                  <option value="hivatasos">hivatásos</option>
                  <option value="onkentes">önkéntes</option>
                </select>
              </div>
            )}

            {tipus === 'bizottsagi_tag' && (
              <>
                <div className="space-y-1.5">
                  <Label>Bizottság *</Label>
                  <select value={bizottsag} onChange={e => setBizottsag(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {BIZOTTSAGOK.map(b => (
                      <option key={b} value={b}>{BIZOTTSAG_CIMKEK[b]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Szerep</Label>
                  <select value={bizottsagiSzerep} onChange={e => setBizottsagiSzerep(e.target.value as 'elnok' | 'tag')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="tag">tag</option>
                    <option value="elnok">elnök</option>
                  </select>
                </div>
              </>
            )}

            {tipus === 'egyeb' && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Megnevezés *</Label>
                <Input value={egyebMegnevezes} onChange={e => setEgyebMegnevezes(e.target.value)} placeholder="pl. harangozó, iratterjesztő" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Megbízatás kezdete</Label>
              <Input type="date" value={kezdete} onChange={e => setKezdete(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Megbízatás vége</Label>
              <Input type="date" value={vege} onChange={e => setVege(e.target.value)} />
              <p className="text-xs text-slate-400">Üresen hagyható (határozatlan idejű).</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Megjegyzés</Label>
              <Input value={megjegyzes} onChange={e => setMegjegyzes(e.target.value)} />
            </div>
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
            <input type="checkbox" checked={publikus} onChange={e => setPublikus(e.target.checked)} className="mt-0.5" />
            <span>
              <span className="font-medium">Megjelenhet a gyülekezet weboldalán</span>
              <span className="block text-xs text-slate-500">
                A név CSAK a személyi kartonon rögzített név-publikálási hozzájárulással
                együtt kerül ki (GDPR) — e nélkül a rendszer nem publikál.
              </span>
            </span>
          </label>

          <div className="flex gap-2 border-t border-zinc-100 pt-4">
            <Button variant="outline" className="flex-1 rounded-xl bg-zinc-50 text-zinc-600 hover:bg-zinc-100" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
