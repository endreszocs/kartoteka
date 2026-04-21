'use client'

import { useEffect, useState, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { programSchema, type ProgramInput } from '@/lib/validations/dashboard'
import { saveProgram } from '@/app/(dashboard)/programs/actions'
import {
  PROGRAM_TYPES, PROG_TIPUS_EMOJI, PROG_TIPUS_LABELS,
  PROGRAM_PRIORITIES, PROG_PRIORITAS_LABELS,
  ISMETLODES_TYPES, ISMETLODES_LABELS,
  EMOJI_LIST,
} from '@/lib/constants/dashboard'
import type { Program } from '@/lib/constants/dashboard'
import { toast } from 'sonner'

interface ProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editProgram?: Program | null
  defaultDate?: string | null
}

export function ProgramDialog({ open, onOpenChange, editProgram, defaultDate }: ProgramDialogProps) {
  const [loading, setLoading] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // H7: Kívülre kattintás bezárja az emoji pickert
  useEffect(() => {
    if (!emojiPickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [emojiPickerOpen])

  const {
    register, handleSubmit, reset, control, setValue,
    formState: { errors },
  } = useForm<ProgramInput>({
    resolver: zodResolver(programSchema),
    defaultValues: {
      tipus: 'istentisztelet',
      prioritas: 'normal',
    },
  })

  const tipus = useWatch({ control, name: 'tipus' })

  // Előtöltés szerkesztésnél / alapértelmezések
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
    if (editProgram) {
      reset({
        id: editProgram.id,
        cim: editProgram.cim,
        datum: editProgram.datum,
        datum_vege: editProgram.datum_vege || '',
        ido_kezdes: editProgram.ido_kezdes?.slice(0, 5) || '',
        ido_befejezes: editProgram.ido_befejezes?.slice(0, 5) || '',
        helyszin: editProgram.helyszin || '',
        tipus: editProgram.tipus,
        prioritas: editProgram.prioritas,
        ismetlodes_tipus: (editProgram.ismetlodes_tipus as ProgramInput['ismetlodes_tipus']) || '',
        egyedi_tipus_nev: editProgram.egyedi_tipus_nev || '',
        egyedi_emoji: editProgram.egyedi_emoji || '',
        megjegyzes: editProgram.megjegyzes || '',
      })
    } else {
      reset({
        cim: '', datum: defaultDate || '', datum_vege: '',
        ido_kezdes: '', ido_befejezes: '', helyszin: '',
        tipus: 'istentisztelet', prioritas: 'normal',
        ismetlodes_tipus: '', egyedi_tipus_nev: '', egyedi_emoji: '', megjegyzes: '',
      })
    }
    setEmojiPickerOpen(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, editProgram, defaultDate, reset])

  async function onSubmit(data: ProgramInput) {
    setLoading(true)
    const result = await saveProgram(data)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editProgram ? 'Program frissítve!' : 'Program létrehozva!')
      onOpenChange(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editProgram ? 'Program szerkesztése' : 'Új program'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <input type="hidden" {...register('id')} />

          <div className="space-y-1.5">
            <Label>Cím *</Label>
            <Input {...register('cim')} placeholder="Program neve" autoFocus />
            {errors.cim && <p className="text-red-500 text-xs">{errors.cim.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dátum *</Label>
              <Input type="date" {...register('datum')} />
              {errors.datum && <p className="text-red-500 text-xs">{errors.datum.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Záró dátum</Label>
              <Input type="date" {...register('datum_vege')} />
              {errors.datum_vege && <p className="text-red-500 text-xs">{errors.datum_vege.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kezdés</Label>
              <Input type="time" {...register('ido_kezdes')} />
            </div>
            <div className="space-y-1.5">
              <Label>Befejezés</Label>
              <Input type="time" {...register('ido_befejezes')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Helyszín</Label>
            <Input {...register('helyszin')} placeholder="Helyszín" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Típus *</Label>
              <select {...register('tipus')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PROGRAM_TYPES.map(t => (
                  <option key={t} value={t}>{PROG_TIPUS_EMOJI[t]} {PROG_TIPUS_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritás *</Label>
              <select {...register('prioritas')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {PROGRAM_PRIORITIES.map(p => (
                  <option key={p} value={p}>{PROG_PRIORITAS_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Egyéb típus mezők */}
          {tipus === 'egyeb' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg">
              <div className="space-y-1.5">
                <Label>Egyedi típusnév</Label>
                <Input {...register('egyedi_tipus_nev')} placeholder="Pl. Családi nap" />
              </div>
              <div className="space-y-1.5" ref={emojiPickerRef}>
                <Label>Egyedi emoji</Label>
                <div className="flex gap-2">
                  <Input {...register('egyedi_emoji')} placeholder="📌" className="w-16" readOnly />
                  <Button type="button" variant="outline" size="sm" onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}>
                    {emojiPickerOpen ? 'Bezár' : 'Válassz'}
                  </Button>
                </div>
                {emojiPickerOpen && (
                  <div className="grid grid-cols-8 gap-1 p-2 bg-white border rounded-lg mt-1 max-h-40 overflow-y-auto">
                    {EMOJI_LIST.map((em, i) => (
                      <button
                        key={i}
                        type="button"
                        className="text-lg hover:bg-slate-100 rounded p-1"
                        onClick={() => { setValue('egyedi_emoji', em); setEmojiPickerOpen(false) }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Ismétlődés</Label>
            <select {...register('ismetlodes_tipus')} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Nem ismétlődik</option>
              {ISMETLODES_TYPES.map(t => (
                <option key={t} value={t}>{ISMETLODES_LABELS[t]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Megjegyzés</Label>
            <textarea
              {...register('megjegyzes')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
              placeholder="Opcionális megjegyzés..."
            />
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-100">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Mégse</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Mentés...' : 'Mentés'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
