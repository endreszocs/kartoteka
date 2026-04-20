'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, Church, Landmark, Upload } from 'lucide-react'

import {
  getCongregation,
  getCongregationAnnualFees,
  getDioceses,
  saveCongregationAnnualFee,
  updateCongregation,
} from '@/app/(dashboard)/congregation/actions'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { normalizeDebtCalcMode } from '@/lib/constants/finance'
import { toast } from 'sonner'

interface SimpleDiocese {
  id: string
  name: string
}

interface AnnualFeeRow {
  year: number
  eves_jarulek: number
  jarulek_kedvezmenyes: number | null
  jarulek_hatarid: string | null
  note: string | null
}

interface CongregationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  congregationId: string | null
}

export function CongregationDialog({ open, onOpenChange, congregationId }: CongregationDialogProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [annualRows, setAnnualRows] = useState<AnnualFeeRow[]>([])
  const [annualSchemaReady, setAnnualSchemaReady] = useState(true)
  const [dioceses, setDioceses] = useState<SimpleDiocese[]>([])
  const [historyForm, setHistoryForm] = useState({
    year: new Date().getFullYear() - 1,
    evesJarulek: 0,
    jarulekKedvezmenyes: 0,
    jarulekHatarid: '07-01',
    note: '',
  })
  const [form, setForm] = useState({
    id: '',
    nevHu: '',
    nevRo: '',
    nevEn: '',
    adoszam: '',
    cim: '',
    email: '',
    telefon: '',
    web: '',
    evesJarulek: 100,
    jarulekKedvezmenyes: 0,
    jarulekHatarid: '07-01',
    iban: '',
    bank: '',
    dioceseId: '',
    tartozasSzamitasMod: 'akkori' as 'akkori' | 'aktualis',
    cimerUrl: '',
  })

  const previewUrl = useMemo(() => form.cimerUrl || '/EREK.png', [form.cimerUrl])

  const loadData = useCallback(async () => {
    if (!congregationId) return

    const [congregation, dioceseList, annualFeeResult] = await Promise.all([
      getCongregation(congregationId),
      getDioceses(),
      getCongregationAnnualFees(congregationId),
    ])

    setDioceses(dioceseList)
    setAnnualRows((annualFeeResult.rows || []) as AnnualFeeRow[])
    setAnnualSchemaReady(annualFeeResult.schemaReady !== false)

    if (congregation) {
      setForm({
        id: congregation.id,
        nevHu: congregation.nev_hu || congregation.name || '',
        nevRo: congregation.nev_ro || '',
        nevEn: congregation.nev_en || '',
        adoszam: congregation.adoszam || '',
        cim: congregation.cim || '',
        email: congregation.email || '',
        telefon: congregation.telefon || '',
        web: congregation.web || '',
        evesJarulek: congregation.eves_jarulek ?? 100,
        jarulekKedvezmenyes: congregation.jarulek_kedvezmenyes ?? 0,
        jarulekHatarid: congregation.jarulek_hatarid || '07-01',
        iban: congregation.iban || '',
        bank: congregation.bank || '',
        dioceseId: congregation.diocese_id || '',
        tartozasSzamitasMod: normalizeDebtCalcMode(congregation.tartozas_szamitas_mod),
        cimerUrl: congregation.cimer_url || '',
      })
    }
  }, [congregationId])

  useEffect(() => {
    if (!open || !congregationId) return

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void loadData()
    })

    return () => {
      cancelled = true
    }
  }, [open, congregationId, loadData])

  if (!congregationId) return null

  function update(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleCrestUpload(file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `congregations/${congregationId}/${Date.now()}-${safeName}`
      const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
      if (error) throw error

      const { data } = supabase.storage.from('logos').getPublicUrl(path)
      if (!data?.publicUrl) throw new Error('A címer nyilvános URL-je nem hozható létre.')

      setForm(prev => ({ ...prev, cimerUrl: data.publicUrl }))
      toast.success('A címer feltöltése sikerült.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'A címer feltöltése sikertelen.')
    }
    setUploading(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    const result = await updateCongregation(form)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(result.success)
      onOpenChange(false)
    }

    setLoading(false)
  }

  async function handleSaveHistory() {
    if (!congregationId) return

    const result = await saveCongregationAnnualFee(congregationId, historyForm)
    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success(result.success)
    const refreshed = await getCongregationAnnualFees(congregationId)
    setAnnualRows((refreshed.rows || []) as AnnualFeeRow[])
    setAnnualSchemaReady(refreshed.schemaReady !== false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Gyülekezetünk adatai</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="card-raised relative overflow-hidden p-5 sm:p-6">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-amber-200/35 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-24 w-24 rounded-full bg-teal-200/25 blur-3xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[1.7rem] border-4 border-white/75 bg-white shadow-[0_22px_44px_-28px_rgba(15,23,42,0.35)]">
                  {/* Remote public URLs miatt itt tudatosan natív img elemet használunk. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="Gyülekezeti címer" className="h-full w-full object-contain p-3" />
                  <label className="absolute bottom-2 right-2 flex cursor-pointer items-center gap-1 rounded-full border border-white/80 bg-white/94 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-white">
                    <Upload className="size-3.5" />
                    {uploading ? 'Feltöltés...' : 'Címer'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={event => {
                        const file = event.target.files?.[0]
                        if (file) void handleCrestUpload(file)
                      }}
                    />
                  </label>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700/70">Gyülekezeti központ</p>
                  <h2 className="font-heading text-3xl text-slate-800">{form.nevHu || 'Gyülekezet'}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Itt tarthatók kézben a gyülekezet főadatai, pénzügyi alapszámai, címerképe és a korábbi évek egyházfenntartási előzményei.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{form.email || 'Nincs e-mail'}</span>
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{form.telefon || 'Nincs telefonszám'}</span>
                    <span className="rounded-full bg-white/84 px-3 py-1 font-medium text-slate-600 shadow-sm">{dioceses.find(item => item.id === form.dioceseId)?.name || 'Nincs egyházmegye'}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[24rem]">
                <MetricCard label="Éves egyházfenntartás" value={`${form.evesJarulek.toLocaleString('hu-HU')} RON`} icon={<Landmark className="size-4" />} />
                <MetricCard label="Kedvezményes összeg" value={`${form.jarulekKedvezmenyes.toLocaleString('hu-HU')} RON`} icon={<CalendarRange className="size-4" />} />
                <MetricCard label="Határidő" value={form.jarulekHatarid} icon={<CalendarRange className="size-4" />} />
                <MetricCard label="Bank" value={form.bank || 'Nincs megadva'} icon={<Church className="size-4" />} />
              </div>
            </div>
          </div>

          <Tabs defaultValue="alap" className="w-full">
            <TabsList className="grid w-full grid-cols-1 gap-2 rounded-[1.4rem] bg-slate-50 p-2 sm:grid-cols-4">
              <TabsTrigger value="alap">Alapadatok</TabsTrigger>
              <TabsTrigger value="penzugy">Pénzügy</TabsTrigger>
              <TabsTrigger value="szervezet">Szervezet</TabsTrigger>
              <TabsTrigger value="elozmenyek">Éves előzmények</TabsTrigger>
            </TabsList>

            <TabsContent value="alap" className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Megnevezések">
                    <Field label="Magyar név"><Input value={form.nevHu} onChange={event => update('nevHu', event.target.value)} required /></Field>
                    <Field label="Román név"><Input value={form.nevRo} onChange={event => update('nevRo', event.target.value)} /></Field>
                    <Field label="Angol név"><Input value={form.nevEn} onChange={event => update('nevEn', event.target.value)} /></Field>
                    <Field label="Adószám"><Input value={form.adoszam} onChange={event => update('adoszam', event.target.value)} /></Field>
                  </Panel>

                  <Panel title="Kapcsolati adatok">
                    <Field label="Cím"><Input value={form.cim} onChange={event => update('cim', event.target.value)} /></Field>
                    <Field label="E-mail"><Input value={form.email} onChange={event => update('email', event.target.value)} type="email" /></Field>
                    <Field label="Telefon"><Input value={form.telefon} onChange={event => update('telefon', event.target.value)} /></Field>
                    <Field label="Weboldal"><Input value={form.web} onChange={event => update('web', event.target.value)} /></Field>
                  </Panel>
                </div>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                  <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="penzugy" className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Pénzügyi alapadatok">
                    <Field label="Éves egyházfenntartás (RON)"><Input type="number" min={0} value={form.evesJarulek} onChange={event => update('evesJarulek', Number(event.target.value))} /></Field>
                    <Field label="Kedvezményes összeg"><Input type="number" min={0} value={form.jarulekKedvezmenyes} onChange={event => update('jarulekKedvezmenyes', Number(event.target.value))} /></Field>
                    <Field label="Határidő (HH-NN)"><Input value={form.jarulekHatarid} onChange={event => update('jarulekHatarid', event.target.value)} /></Field>
                    <Field label="Tartozás számítási mód">
                      <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-600">
                        <label className="flex items-center gap-2">
                          <input type="radio" checked={form.tartozasSzamitasMod === 'akkori'} onChange={() => update('tartozasSzamitasMod', 'akkori')} />
                          Akkori összeg
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="radio" checked={form.tartozasSzamitasMod === 'aktualis'} onChange={() => update('tartozasSzamitasMod', 'aktualis')} />
                          Aktuális összeg
                        </label>
                      </div>
                    </Field>
                  </Panel>

                  <Panel title="Bankszámla és azonosítók">
                    <Field label="IBAN"><Input value={form.iban} onChange={event => update('iban', event.target.value)} /></Field>
                    <Field label="Bank"><Input value={form.bank} onChange={event => update('bank', event.target.value)} /></Field>
                    <Field label="Címer URL"><Input value={form.cimerUrl} onChange={event => update('cimerUrl', event.target.value)} /></Field>
                  </Panel>
                </div>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                  <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="szervezet" className="pt-4">
              <form onSubmit={handleSubmit} className="space-y-4">
                <Panel title="Szervezeti beállítások">
                  <Field label="Egyházmegye">
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.dioceseId}
                      onChange={event => update('dioceseId', event.target.value)}
                    >
                      <option value="">-- Válasszon egyházmegyét --</option>
                      {dioceses.map(diocese => (
                        <option key={diocese.id} value={diocese.id}>{diocese.name}</option>
                      ))}
                    </select>
                  </Field>
                </Panel>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Bezárás</Button>
                  <Button type="submit" disabled={loading || uploading}>{loading ? 'Mentés...' : 'Mentés'}</Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="elozmenyek" className="space-y-4 pt-4">
              {!annualSchemaReady && (
                <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Az éves egyházfenntartási előzményekhez még futtatni kell a mellékelt SQL-bővítést. Utána évekre bontva is rögzíthetők lesznek a korábbi összegek.
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[0.94fr_1.06fr]">
                <Panel title="Új éves adat rögzítése">
                  <Field label="Év"><Input type="number" value={historyForm.year} onChange={event => setHistoryForm(prev => ({ ...prev, year: Number(event.target.value) }))} /></Field>
                  <Field label="Éves egyházfenntartás"><Input type="number" value={historyForm.evesJarulek} onChange={event => setHistoryForm(prev => ({ ...prev, evesJarulek: Number(event.target.value) }))} /></Field>
                  <Field label="Kedvezményes összeg"><Input type="number" value={historyForm.jarulekKedvezmenyes} onChange={event => setHistoryForm(prev => ({ ...prev, jarulekKedvezmenyes: Number(event.target.value) }))} /></Field>
                  <Field label="Határidő (HH-NN)"><Input value={historyForm.jarulekHatarid} onChange={event => setHistoryForm(prev => ({ ...prev, jarulekHatarid: event.target.value }))} /></Field>
                  <Field label="Megjegyzés"><Input value={historyForm.note} onChange={event => setHistoryForm(prev => ({ ...prev, note: event.target.value }))} /></Field>
                  <Button type="button" className="w-full" onClick={handleSaveHistory}>Éves adat mentése</Button>
                </Panel>

                <Panel title="Korábbi évek áttekintése">
                  {annualRows.length === 0 ? (
                    <div className="rounded-[1rem] bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      Még nincs rögzített történeti pénzügyi adat ehhez a gyülekezethez.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-[1rem] border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left">
                          <tr>
                            <th className="px-4 py-3 font-semibold text-slate-500">Év</th>
                            <th className="px-4 py-3 font-semibold text-slate-500">Éves összeg</th>
                            <th className="px-4 py-3 font-semibold text-slate-500">Kedvezményes</th>
                            <th className="px-4 py-3 font-semibold text-slate-500">Határidő</th>
                          </tr>
                        </thead>
                        <tbody>
                          {annualRows.map(row => (
                            <tr key={row.year} className="border-t border-slate-100 bg-white">
                              <td className="px-4 py-3 font-semibold text-slate-700">{row.year}</td>
                              <td className="px-4 py-3 text-slate-600">{Number(row.eves_jarulek || 0).toLocaleString('hu-HU')} RON</td>
                              <td className="px-4 py-3 text-slate-600">{Number(row.jarulek_kedvezmenyes || 0).toLocaleString('hu-HU')} RON</td>
                              <td className="px-4 py-3 text-slate-600">{row.jarulek_hatarid || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-raised p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-white/80 bg-white/88 p-4 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.22)]">
      <div className="flex items-center gap-2 text-teal-600">{icon}<span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span></div>
      <p className="mt-2 text-sm font-semibold text-slate-700">{value}</p>
    </div>
  )
}
