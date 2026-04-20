'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { memberSchema, type MemberInput } from '@/lib/validations/members'
import { saveMember, searchParent } from '@/app/(dashboard)/tagnyilvantartas/actions'
import { ENTRY_REASONS, ENTRY_REASON_LABELS } from '@/lib/constants/members'
import type { EnrichedMember } from '@/lib/constants/members'
import { toast } from 'sonner'

interface MemberFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editMember: EnrichedMember | null
}

export function MemberFormDialog({ open, onOpenChange, editMember }: MemberFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'choose' | 'form'>('choose')
  const [formTab, setFormTab] = useState('personal')

  // Szülő keresés
  const [parentResults, setParentResults] = useState<{ apa: ParentResult[]; anya: ParentResult[] }>({ apa: [], anya: [] })
  const [parentSearchVisible, setParentSearchVisible] = useState<{ apa: boolean; anya: boolean }>({ apa: false, anya: false })

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm({
    resolver: zodResolver(memberSchema),
    defaultValues: { belepes_oka: 'alap' as const, vallas: 'Református', ferfi: true, c_szam: '1', csaladnev: '', k_nev: '', c_helyseg_text: '', c_utca_text: '' },
  })

  const belepesOka = useWatch({ control, name: 'belepes_oka' })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
    if (editMember) {
      setStep('form')
      reset({
        id: editMember.id,
        csaladnev: editMember.csaladnev || '',
        k_nev: editMember.k_nev || '',
        szcs_nev: editMember.szcs_nev || '',
        ferfi: editMember.ferfi ?? true,
        sz_datum: editMember.sz_datum || '',
        foglalkozas: editMember.foglalkozas || '',
        vallas: editMember.vallas || 'Református',
        c_helyseg_text: editMember.adrlocality?.name || '',
        c_utca_text: editMember.adrstreet?.name || '',
        c_szam: editMember.c_szam || '1',
        c_tombhaz: editMember.c_tombhaz || '',
        c_lepcsohaz: editMember.c_lepcsohaz || '',
        c_emelet: editMember.c_emelet || '',
        c_ajto: editMember.c_ajto || '',
        telefon: editMember.telefon || '',
        email: editMember.email || '',
        apjaneve: editMember.apjaneve || '',
        anyjaneve: editMember.anyjaneve || '',
        megjegyzes: editMember.megjegyzes || '',
        belepes_oka: 'alap',
      })
    } else {
      setStep('choose')
      setFormTab('personal')
      reset({ belepes_oka: 'alap', vallas: 'Református', ferfi: true, c_szam: '1' })
    }
    setParentResults({ apa: [], anya: [] })
    setParentSearchVisible({ apa: false, anya: false })
    })
    return () => {
      cancelled = true
    }
  }, [open, editMember, reset])

  function selectEntryReason(reason: typeof ENTRY_REASONS[number]) {
    setValue('belepes_oka', reason)
    setStep('form')
  }

  async function onSubmit(data: MemberInput) {
    setLoading(true)
    const result = await saveMember(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editMember ? 'Tag adatai frissítve!' : 'Új tag sikeresen rögzítve!')
      onOpenChange(false)
    }
    setLoading(false)
  }

  async function handleParentSearch(val: string, type: 'apa' | 'anya') {
    if (val.length < 3) {
      setParentSearchVisible(p => ({ ...p, [type]: false }))
      return
    }
    const results = await searchParent(val, type === 'apa')
    setParentResults(p => ({ ...p, [type]: results }))
    setParentSearchVisible(p => ({ ...p, [type]: results.length > 0 }))
  }

  function selectParent(result: ParentResult, type: 'apa' | 'anya') {
    const name = `${result.csaladnev} ${result.k_nev}`
    if (type === 'apa') {
      setValue('apjaneve', name)
      setValue('id_apja_cnp', result.cnp || '')
    } else {
      setValue('anyjaneve', name)
      setValue('id_anyja_cnp', result.cnp || '')
    }
    setParentSearchVisible(p => ({ ...p, [type]: false }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">{editMember ? 'Tag adatainak módosítása' : 'Új gyülekezeti tag felvétele'}</DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">{editMember ? 'Szerkessze a meglévő tag adatait' : 'Adja meg az új tag személyes adatait'}</p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">

        {/* Pre-screen: belépés oka */}
        {step === 'choose' && !editMember && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">Válassza ki a belépés okát:</p>
            {ENTRY_REASONS.map(r => (
              <Button key={r} variant="outline" className="w-full justify-start text-left h-auto py-3" onClick={() => selectEntryReason(r)}>
                <div>
                  <p className="font-semibold">{ENTRY_REASON_LABELS[r]}</p>
                  <p className="text-xs text-muted-foreground">
                    {r === 'alap' && 'Helyi, a gyülekezetben született vagy ide tartozó tag'}
                    {r === 'bekoltozott' && 'Más gyülekezetből érkezett — átjelentkezéssel'}
                    {r === 'attert' && 'Más felekezetből tért át a református egyházba'}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        )}

        {/* Form */}
        {step === 'form' && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <input type="hidden" {...register('id')} />

            <Tabs value={formTab} onValueChange={setFormTab}>
              <TabsList className="grid w-full grid-cols-1 sm:grid-cols-3 bg-zinc-100 rounded-xl p-1">
                <TabsTrigger value="personal">Személyes</TabsTrigger>
                <TabsTrigger value="registry">Anyakönyvi</TabsTrigger>
                <TabsTrigger value="financial">Pénzügyi</TabsTrigger>
              </TabsList>

              {/* ── SZEMÉLYES ── */}
              <TabsContent value="personal" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Családnév *</Label>
                    <Input {...register('csaladnev')} placeholder="Kovács" />
                    {errors.csaladnev && <p className="text-red-500 text-xs">{errors.csaladnev.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Keresztnév *</Label>
                    <Input {...register('k_nev')} placeholder="János" />
                    {errors.k_nev && <p className="text-red-500 text-xs">{errors.k_nev.message}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nem *</Label>
                    <select {...register('ferfi', { setValueAs: v => v === 'true' || v === true })} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="true">Férfi</option>
                      <option value="false">Nő</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Születési dátum</Label>
                    <Input type="date" {...register('sz_datum')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vallás</Label>
                    <Input {...register('vallas')} placeholder="Református" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Település *</Label>
                    <Input {...register('c_helyseg_text')} placeholder="Kovászna" />
                    {errors.c_helyseg_text && <p className="text-red-500 text-xs">{errors.c_helyseg_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Utca *</Label>
                    <Input {...register('c_utca_text')} placeholder="Fő utca" />
                    {errors.c_utca_text && <p className="text-red-500 text-xs">{errors.c_utca_text.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Házszám</Label>
                    <Input {...register('c_szam')} placeholder="1" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Foglalkozás</Label>
                    <Input {...register('foglalkozas')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Telefon</Label>
                    <Input {...register('telefon')} type="tel" />
                  </div>
                </div>

                {/* Szülő keresés */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['apa', 'anya'] as const).map(type => (
                    <div key={type} className="space-y-1.5 relative">
                      <Label>Édes{type === 'apa' ? 'apa' : 'anya'} neve</Label>
                      <Input
                        {...register(type === 'apa' ? 'apjaneve' : 'anyjaneve')}
                        placeholder={`Keresés... (3+ karakter)`}
                        onChange={e => {
                          register(type === 'apa' ? 'apjaneve' : 'anyjaneve').onChange(e)
                          handleParentSearch(e.target.value, type)
                        }}
                      />
                      <input type="hidden" {...register(type === 'apa' ? 'id_apja_cnp' : 'id_anyja_cnp')} />
                      {parentSearchVisible[type] && parentResults[type].length > 0 && (
                        <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {parentResults[type].map(r => (
                            <div key={r.id} className="p-2 hover:bg-slate-50 cursor-pointer text-sm border-b last:border-0" onClick={() => selectParent(r, type)}>
                              <div className="font-medium">{r.csaladnev} {r.k_nev}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.sz_datum ? `${new Date().getFullYear() - new Date(r.sz_datum).getFullYear()} éves` : '?'} · {r.adrlocality?.name || ''} {r.adrstreet?.name || ''} {r.c_szam || ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Beköltözött / Áttért extra */}
                {belepesOka === 'bekoltozott' && (
                  <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                    <h4 className="text-sm font-semibold">Beköltözés részletei</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('bek_datum')} className="h-8" /></div>
                      <div><Label className="text-xs">Honnan</Label><Input {...register('bek_honnan')} className="h-8" placeholder="Település" /></div>
                    </div>
                    <div><Label className="text-xs">Igazolás</Label><Input {...register('bek_igazolas')} className="h-8" /></div>
                  </div>
                )}
                {belepesOka === 'attert' && (
                  <div className="p-3 bg-orange-50 rounded-lg space-y-2">
                    <h4 className="text-sm font-semibold">Áttérés részletei</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('att_datum')} className="h-8" /></div>
                      <div><Label className="text-xs">Korábbi felekezet</Label><Input {...register('att_felekezet')} className="h-8" /></div>
                      <div><Label className="text-xs">Honnan</Label><Input {...register('att_honnan')} className="h-8" /></div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Megjegyzés</Label>
                  <textarea {...register('megjegyzes')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[50px] resize-y" />
                </div>
              </TabsContent>

              {/* ── ANYAKÖNYVI ── */}
              <TabsContent value="registry" className="space-y-3 pt-3">
                <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <h4 className="text-sm font-semibold">Keresztelés</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('kereszteles_datum')} className="h-8" /></div>
                    <div><Label className="text-xs">Hely</Label><Input {...register('kereszteles_hely')} className="h-8" /></div>
                    <div><Label className="text-xs">Lelkész</Label><Input {...register('kereszteles_lelkesz')} className="h-8" /></div>
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg space-y-2">
                  <h4 className="text-sm font-semibold">Konfirmáció</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div><Label className="text-xs">Dátum</Label><Input type="date" {...register('konfirmacio_datum')} className="h-8" /></div>
                    <div><Label className="text-xs">Hely</Label><Input {...register('konfirmacio_hely')} className="h-8" /></div>
                    <div><Label className="text-xs">Lelkész</Label><Input {...register('konfirmacio_lelkesz')} className="h-8" /></div>
                  </div>
                </div>
              </TabsContent>

              {/* ── PÉNZÜGYI ── */}
              <TabsContent value="financial" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label>Fizetési státusz</Label>
                  <select {...register('fizeto_status')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="fizet">Fizető</option>
                    <option value="felmentett">Felmentett</option>
                    <option value="nem_fizet">Nem fizet (18 év alatti)</option>
                  </select>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 pt-4 border-t border-zinc-100">
              {!editMember && step === 'form' && (
                <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setStep('choose')}>Vissza</Button>
              )}
              <Button type="button" variant="outline" className="flex-1 rounded-xl bg-zinc-50 hover:bg-zinc-100 text-zinc-600" onClick={() => onOpenChange(false)}>Mégse</Button>
              <Button type="submit" disabled={loading} className="flex-[2] rounded-xl bg-emerald-600 hover:bg-emerald-700">
                {loading ? 'Mentés...' : editMember ? 'Módosítások mentése' : 'Tag mentése'}
              </Button>
            </div>
          </form>
        )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Szülő keresés eredmény típus
interface ParentResult {
  id: number
  csaladnev: string
  k_nev: string
  cnp: string | null
  sz_datum: string | null
  c_szam: string | null
  adrlocality: { name: string } | null
  adrstreet: { name: string } | null
}
