'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { saveBatchPrograms } from '@/app/(dashboard)/programs/actions'
import {
  PROGRAM_TYPES, PROG_TIPUS_EMOJI, PROG_TIPUS_LABELS,
  PROGRAM_PRIORITIES, PROG_PRIORITAS_LABELS,
  ISMETLODES_TYPES, ISMETLODES_LABELS,
} from '@/lib/constants/dashboard'
import type { ProgramInput } from '@/lib/validations/dashboard'
import { toast } from 'sonner'

interface BatchRow {
  key: number
  cim: string
  datum: string
  datum_vege: string
  ido_kezdes: string
  ido_befejezes: string
  tipus: string
  helyszin: string
  prioritas: string
  ismetlodes: string
}

function emptyRow(key: number): BatchRow {
  return { key, cim: '', datum: '', datum_vege: '', ido_kezdes: '', ido_befejezes: '', tipus: 'istentisztelet', helyszin: '', prioritas: 'normal', ismetlodes: '' }
}

interface BatchProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
}

export function BatchProgramDialog({ open, onOpenChange }: BatchProgramDialogProps) {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [, setNextKey] = useState(0)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let focusTimer: ReturnType<typeof setTimeout> | null = null

    queueMicrotask(() => {
      if (cancelled) return
      const initial = Array.from({ length: 10 }, (_, i) => emptyRow(i))
      setRows(initial)
      setNextKey(10)
      // H6: Auto fókusz az első sor cím mezőjére
      focusTimer = setTimeout(() => firstInputRef.current?.focus(), 300)
    })

    return () => {
      cancelled = true
      if (focusTimer) clearTimeout(focusTimer)
    }
  }, [open])

  function updateRow(key: number, field: keyof BatchRow, value: string) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  const addRows = useCallback((count: number) => {
    setNextKey(prev => {
      const newRows = Array.from({ length: count }, (_, i) => emptyRow(prev + i))
      setRows(prevRows => [...prevRows, ...newRows])
      return prev + count
    })
  }, [])

  function removeRow(key: number) {
    setRows(prev => prev.filter(r => r.key !== key))
  }

  const filledCount = rows.filter(r => r.cim.trim()).length

  async function handleSubmit() {
    setLoading(true)

    const records: ProgramInput[] = rows
      .filter(r => r.cim.trim() || r.datum)
      .map(r => ({
        cim: r.cim.trim(),
        datum: r.datum,
        datum_vege: r.datum_vege || undefined,
        ido_kezdes: r.ido_kezdes || undefined,
        ido_befejezes: r.ido_befejezes || undefined,
        helyszin: r.helyszin || undefined,
        tipus: r.tipus as ProgramInput['tipus'],
        prioritas: r.prioritas as ProgramInput['prioritas'],
        ismetlodes_tipus: (r.ismetlodes as ProgramInput['ismetlodes_tipus']) || undefined,
        egyedi_tipus_nev: undefined,
        egyedi_emoji: undefined,
        megjegyzes: undefined,
      }))

    const result = await saveBatchPrograms(records)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.count} program sikeresen mentve!`)
      onOpenChange(false)
    }

    setLoading(false)
  }

  // B5: key-alapú navigáció (nem index-alapú) — sor törlés után is helyes
  function handleKeyDown(e: React.KeyboardEvent, currentKey: number) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const currentIndex = rows.findIndex(r => r.key === currentKey)
      if (currentIndex < rows.length - 1) {
        // Következő sor cím mezőjére ugrás
        const nextKey = rows[currentIndex + 1].key
        const nextInput = document.querySelector(`[data-batch-key="${nextKey}"]`) as HTMLInputElement
        nextInput?.focus()
      } else {
        // Utolsó sor → új sor hozzáadás + fókusz
        addRows(1)
        setTimeout(() => {
          const allInputs = document.querySelectorAll('[data-batch-key]')
          const last = allInputs[allInputs.length - 1] as HTMLInputElement
          last?.focus()
        }, 50)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Gyors bevitel</DialogTitle>
            {filledCount > 0 && (
              <span className="text-sm text-muted-foreground">{filledCount} kitöltött program</span>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className="rounded-[1rem] border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300"
            >
              {/* 1. sor: cím mezőt DOMINÁNSAN, szám-jelölővel + törlés gombbal */}
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {i + 1}
                </span>
                <Input
                  ref={i === 0 ? firstInputRef : undefined}
                  value={row.cim}
                  onChange={(e) => updateRow(row.key, 'cim', e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, row.key)}
                  data-batch-key={row.key}
                  placeholder="Program címe…"
                  className="h-10 flex-1 text-base font-medium"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-9 shrink-0 p-0 text-red-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeRow(row.key)}
                  aria-label="Sor törlése"
                >
                  ✕
                </Button>
              </div>

              {/* 2. sor: többi mező grid-ben */}
              <div className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_90px_90px] lg:grid-cols-[1fr_1fr_100px_100px_140px_1fr_110px_110px]">
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Dátum *
                  </label>
                  <Input
                    type="date"
                    value={row.datum}
                    onChange={(e) => updateRow(row.key, 'datum', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Záró dátum
                  </label>
                  <Input
                    type="date"
                    value={row.datum_vege}
                    onChange={(e) => updateRow(row.key, 'datum_vege', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Kezdés
                  </label>
                  <Input
                    type="time"
                    value={row.ido_kezdes}
                    onChange={(e) => updateRow(row.key, 'ido_kezdes', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Befejezés
                  </label>
                  <Input
                    type="time"
                    value={row.ido_befejezes}
                    onChange={(e) => updateRow(row.key, 'ido_befejezes', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Típus
                  </label>
                  <select
                    value={row.tipus}
                    onChange={(e) => updateRow(row.key, 'tipus', e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {PROGRAM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {PROG_TIPUS_EMOJI[t]} {PROG_TIPUS_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Helyszín
                  </label>
                  <Input
                    value={row.helyszin}
                    onChange={(e) => updateRow(row.key, 'helyszin', e.target.value)}
                    placeholder="pl. templom"
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Prioritás
                  </label>
                  <select
                    value={row.prioritas}
                    onChange={(e) => updateRow(row.key, 'prioritas', e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {PROGRAM_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PROG_PRIORITAS_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    Ismétlődés
                  </label>
                  <select
                    value={row.ismetlodes}
                    onChange={(e) => updateRow(row.key, 'ismetlodes', e.target.value)}
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="">Nem</option>
                    {ISMETLODES_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ISMETLODES_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addRows(5)}>
              + 5 program
            </Button>
            <Button variant="outline" size="sm" onClick={() => addRows(10)}>
              + 10 program
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Mégse
            </Button>
            <Button onClick={handleSubmit} disabled={loading || filledCount === 0}>
              {loading ? `Mentés (${filledCount})...` : `Összes mentése (${filledCount})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
