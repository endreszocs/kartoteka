'use client'

/**
 * Egyházmegyei nyugtatömb kezelő — a dashboard-egyhazmegye „Nyugtatömbök" fülében.
 *
 * A gyülekezeti nyugtatömb modul mintájára (ChitantaTombokSection), de az
 * `egyhazmegye` scope-on dolgozik. Funkciók:
 *   - Listázás + aktív tömb státusza (maradék darabszám)
 *   - Új tömb rögzítése
 *   - Tömb lezárása (kézi)
 *   - Tömb törlése (csak használatlan)
 *
 * A nyugták tényleges kiállítása (felhasznált darab növelés) a Fázis 8-ban
 * jön az egyházmegyei pénzügy modullal.
 */

import { useEffect, useState, useTransition } from 'react'
import {
  FileText, Plus, CheckCircle2, XCircle, Lock, Trash2, AlertCircle,
  Sparkles, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { MAX_NYUGTA_TOMBBEN } from '@kartoteka/validations'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModalField } from '@/components/ui/modal-field'
import {
  closeDioceseChitantaTomb, createDioceseChitantaTomb, deleteDioceseChitantaTomb,
  getActiveDioceseChitantaTombStatus, listDioceseChitantaTombok,
  type DioceseChitantaTomb,
} from '@/app/(dashboard)/dashboard-egyhazmegye/chitanta-tombok-actions'

export function DioceseChitantaTombokSection() {
  const [tombok, setTombok] = useState<DioceseChitantaTomb[]>([])
  const [active, setActive] = useState<Awaited<ReturnType<typeof getActiveDioceseChitantaTombStatus>>['active']>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    const [listRes, actRes] = await Promise.all([
      listDioceseChitantaTombok(),
      getActiveDioceseChitantaTombStatus(),
    ])
    if (listRes.error) toast.error(listRes.error)
    else if (listRes.data) setTombok(listRes.data)
    if (actRes.active !== undefined) setActive(actRes.active)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refresh()
    })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">Nyugtatömbök betöltése…</div>
  }

  return (
    <div className="space-y-5">
      {/* Hero + aktív tömb státusz */}
      <div className="card-raised p-5 bg-gradient-to-br from-amber-50/50 to-white border-amber-100">
        <div className="flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
            <FileText className="size-6" />
          </div>
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-700/70 font-semibold">Nyugtatömbök</p>
            <h2 className="font-heading text-2xl text-slate-800 leading-tight">Egyházmegyei nyugtatömbök</h2>
            <p className="text-sm text-slate-500 mt-1">
              Az egyházmegye saját nyugtatömbjei (készpénzes bevételekhez).
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="rounded-xl bg-amber-500 text-white hover:bg-amber-600 gap-1.5"
          >
            <Plus className="size-4" />
            Új tömb
          </Button>
        </div>

        {active && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Aktív tömb" value={`${active.seria} / ${active.szam_kezdet}–${active.szam_veg}`} />
            <Kpi label="Felhasznált" value={String(active.felhasznalt)} tone="rose" />
            <Kpi label="Maradék" value={String(active.maradek)} tone={active.maradek > 10 ? 'emerald' : 'amber'} />
            <Kpi label="Következő szám" value={active.kovetkezo_szam != null ? String(active.kovetkezo_szam) : '—'} tone="indigo" />
          </div>
        )}
        {!active && (
          <div className="mt-4 rounded-xl bg-amber-100/60 border border-amber-200 p-3 text-xs text-amber-900 flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            Nincs aktív nyugtatömb — kattints az &bdquo;Új tömb&rdquo; gombra.
          </div>
        )}
      </div>

      {/* Listázás */}
      <section className="card-raised p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-600" />
          <h3 className="font-heading text-base text-slate-800">Nyugtatömb lista</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-2 text-left font-medium text-slate-600">Széria</th>
                <th className="p-2 text-right font-medium text-slate-600">Számok</th>
                <th className="p-2 text-right font-medium text-slate-600">Db</th>
                <th className="p-2 text-right font-medium text-slate-600">Felhasznált</th>
                <th className="p-2 text-right font-medium text-slate-600">Maradék</th>
                <th className="p-2 text-left font-medium text-slate-600">Vásárlás</th>
                <th className="p-2 text-right font-medium text-slate-600">Ár</th>
                <th className="p-2 text-center font-medium text-slate-600">Aktív</th>
                <th className="p-2 text-right font-medium text-slate-600">Művelet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tombok.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-slate-400 italic">Még nincs nyugtatömb.</td></tr>
              )}
              {tombok.map((t) => {
                const maradek = (t.darabszam_ossz || 0) - (t.felhasznalt_darabszam || 0)
                return (
                  <tr key={t.id} className={t.aktiv ? 'hover:bg-amber-50/40' : 'opacity-60 hover:bg-slate-50/50'}>
                    <td className="p-2 font-semibold">{t.seria}</td>
                    <td className="p-2 text-right font-mono">{t.szam_kezdet}–{t.szam_veg}</td>
                    <td className="p-2 text-right">{t.darabszam_ossz}</td>
                    <td className="p-2 text-right text-rose-600">{t.felhasznalt_darabszam}</td>
                    <td className="p-2 text-right font-semibold text-emerald-700">{maradek}</td>
                    <td className="p-2 text-slate-500 text-[11px]">
                      <Calendar className="inline size-3 mr-1" />
                      {t.vasarlas_datuma}
                    </td>
                    <td className="p-2 text-right font-mono">{t.vasarlas_ara != null ? `${t.vasarlas_ara} RON` : '—'}</td>
                    <td className="p-2 text-center">
                      {t.aktiv
                        ? <CheckCircle2 className="size-4 text-emerald-600 mx-auto" />
                        : <XCircle className="size-4 text-slate-400 mx-auto" />}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {t.aktiv && (
                          <Button
                            size="sm" variant="ghost" className="size-7 p-0 text-amber-700" title="Lezárás"
                            onClick={async () => {
                              if (!confirm(`Biztosan lezárod a "${t.seria}" tömböt?`)) return
                              const res = await closeDioceseChitantaTomb(t.id)
                              if (res.error) toast.error(res.error)
                              else { toast.success('Lezárva.'); refresh() }
                            }}
                          >
                            <Lock className="size-3.5" />
                          </Button>
                        )}
                        {t.felhasznalt_darabszam === 0 && (
                          <Button
                            size="sm" variant="ghost" className="size-7 p-0 text-rose-600" title="Törlés"
                            onClick={async () => {
                              if (!confirm(`Biztosan törlöd a "${t.seria}" tömböt?`)) return
                              const res = await deleteDioceseChitantaTomb(t.id)
                              if (res.error) toast.error(res.error)
                              else { toast.success('Törölve.'); refresh() }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialogOpen && (
        <CreateTombDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onCreated={() => { setDialogOpen(false); refresh() }}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' | 'amber' | 'indigo' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  }[tone || 'amber']
  return (
    <div className={`rounded-xl border px-3 py-2 ${colors}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] opacity-75">{label}</p>
      <p className="text-base font-semibold font-mono truncate">{value}</p>
    </div>
  )
}

function CreateTombDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    block_nr: '',
    seria: 'EGY',
    szam_kezdet: 1,
    szam_veg: 50,
    darabszam_ossz: 50,
    vasarlas_datuma: new Date().toISOString().slice(0, 10),
    vasarlas_ara: '',
    megjegyzes: '',
  })
  const [isPending, startTransition] = useTransition()

  // Ha a kezdő/vég szám változik, darabszám automatikusan
  function syncDarabszam(kezdet: number, veg: number) {
    if (veg >= kezdet) {
      setForm((f) => ({ ...f, szam_kezdet: kezdet, szam_veg: veg, darabszam_ossz: veg - kezdet + 1 }))
    } else {
      setForm((f) => ({ ...f, szam_kezdet: kezdet, szam_veg: veg }))
    }
  }

  /**
   * A KEZDŐ szám elmozdításakor a tömb HOSSZA marad (alapesetben 50 lap) —
   * különben a lelkész átírja a kezdőszámot, és a darabszám némán elcsúszik.
   * Endre szabálya (2026-09-02): egy nyugtatömb 50 lapos.
   */
  function kezdetValtozik(kezdet: number) {
    if (!Number.isFinite(kezdet)) return
    const hossz =
      form.szam_veg >= form.szam_kezdet ? form.szam_veg - form.szam_kezdet + 1 : MAX_NYUGTA_TOMBBEN
    syncDarabszam(kezdet, kezdet + hossz - 1)
  }

  const tulHosszu = form.darabszam_ossz > MAX_NYUGTA_TOMBBEN

  function handleCreate() {
    startTransition(async () => {
      const res = await createDioceseChitantaTomb({
        block_nr: form.block_nr || '',
        seria: form.seria.trim(),
        szam_kezdet: Number(form.szam_kezdet),
        szam_veg: Number(form.szam_veg),
        darabszam_ossz: Number(form.darabszam_ossz),
        vasarlas_datuma: form.vasarlas_datuma,
        vasarlas_ara: form.vasarlas_ara ? Number(form.vasarlas_ara) : null,
        megjegyzes: form.megjegyzes || '',
      })
      if (res.error) toast.error(res.error)
      else { toast.success('Új nyugtatömb rögzítve.'); onCreated() }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(560px,96vw)] rounded-2xl border-amber-200">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl text-slate-800">
            Új egyházmegyei nyugtatömb
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Széria *">
              <Input value={form.seria} onChange={(e) => setForm({ ...form, seria: e.target.value })} placeholder="Pl. EGY, EMA" />
            </ModalField>
            <ModalField label="Tömb száma (opcionális)">
              <Input value={form.block_nr} onChange={(e) => setForm({ ...form, block_nr: e.target.value })} placeholder="Belső nyilvántartás" />
            </ModalField>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ModalField label="Kezdő szám *">
              <Input
                type="number"
                value={form.szam_kezdet}
                onChange={(e) => kezdetValtozik(Number(e.target.value))}
              />
            </ModalField>
            <ModalField label="Vég szám *">
              <Input
                type="number"
                value={form.szam_veg}
                onChange={(e) => syncDarabszam(form.szam_kezdet, Number(e.target.value))}
              />
            </ModalField>
            <ModalField label="Darabszám (auto)">
              <Input
                type="number"
                value={form.darabszam_ossz}
                readOnly
                className={tulHosszu ? 'bg-rose-50 text-rose-700' : 'bg-slate-50'}
              />
            </ModalField>
          </div>
          {tulHosszu && (
            <p className="text-xs text-rose-600">
              Egy nyugtatömb {MAX_NYUGTA_TOMBBEN} lapos, a megadott tartomány {form.darabszam_ossz} db.
              Ellenőrizd a kezdő- és a végszámot.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ModalField label="Vásárlás dátuma *">
              <Input type="date" value={form.vasarlas_datuma} onChange={(e) => setForm({ ...form, vasarlas_datuma: e.target.value })} />
            </ModalField>
            <ModalField label="Vásárlás ára (RON)">
              <Input
                type="number" step="0.01"
                value={form.vasarlas_ara}
                onChange={(e) => setForm({ ...form, vasarlas_ara: e.target.value })}
                placeholder="Pl. 35"
              />
            </ModalField>
          </div>
          <ModalField label="Megjegyzés">
            <Input value={form.megjegyzes} onChange={(e) => setForm({ ...form, megjegyzes: e.target.value })} />
          </ModalField>
        </div>
        <div className="flex gap-2 justify-end border-t border-slate-100 pt-3 -mx-6 px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Mégse</Button>
          <Button onClick={handleCreate} disabled={isPending || tulHosszu} className="rounded-xl bg-amber-500 text-white hover:bg-amber-600">
            {isPending ? 'Rögzítés…' : 'Rögzítés'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
