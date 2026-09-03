'use client'

/**
 * Nyugtatömb rögzítő wizard (egy VAGY több tömb egyszerre).
 *
 * Tipikus használat: a lelkész elmegy a kerületbe, hoz 3-5 tömböt.
 * A wizard elfogadja az összeset egyszerre:
 *   - Közös adatok (seria, vásárlás dátuma, összesített ár)
 *   - Tömbök tartománya: +Új tömb gombbal kibővíthető lista
 *   - Automatikus tartomány-javaslat: a 2. tömb kezdete = 1. tömb vége + 1
 *   - A kezdőszám beírásakor a záró szám magától kitöltődik 50 lapra
 *     (Endre, 2026-09-02: „a nyugtatömbökben nem 100, hanem 50 lap van") —
 *     de felülírható, nem kényszer.
 *
 * Validáció:
 *   - Minden tömbben max. MAX_NYUGTA_TOMBBEN (50) nyugta
 *   - Batch-en belüli átfedés ellenőrzés
 *   - Meglévő tömbökkel is átfedés ellenőrzés
 */

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ModalField } from '@/components/ui/modal-field'
import { MAX_NYUGTA_TOMBBEN } from '@kartoteka/validations'
import { createChitantaTombokBatch } from '@/app/(dashboard)/penzugy/chitanta-tombok-actions'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Előtöltött Seria — ha van aktív konfig, azt javasoljuk. */
  defaultSeria?: string
  onCreated?: () => void | Promise<void>
}

// Egy tömb sorának belső állapota
interface TombRow {
  key: string
  blockNr: string
  szamKezdet: number | ''
  szamVeg: number | ''
}

function newTombRow(init?: Partial<TombRow>): TombRow {
  return {
    key: (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)),
    blockNr: '',
    szamKezdet: '',
    szamVeg: '',
    ...init,
  }
}

export function ChitantaTombWizardDialog({
  open,
  onOpenChange,
  defaultSeria,
  onCreated,
}: Props) {
  // Közös adatok
  const [seria, setSeria] = useState('')
  const [vasarlasDatuma, setVasarlasDatuma] = useState('')
  const [vasarlasAraOssz, setVasarlasAraOssz] = useState<number | ''>('')
  const [megjegyzes, setMegjegyzes] = useState('')

  // Tömb-sorok
  const [tombok, setTombok] = useState<TombRow[]>([newTombRow()])
  const [saving, setSaving] = useState(false)

  // Reset a megnyitáskor
  useEffect(() => {
    if (!open) return
    setSeria(defaultSeria || 'EREKC')
    setVasarlasDatuma(new Date().toISOString().slice(0, 10))
    setVasarlasAraOssz('')
    setMegjegyzes('')
    setTombok([newTombRow()])
    setSaving(false)
  }, [open, defaultSeria])

  // ── Helper függvények ──
  function updateTomb(key: string, patch: Partial<TombRow>) {
    setTombok((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)))
  }

  function addTomb() {
    setTombok((prev) => {
      const utolso = prev[prev.length - 1]
      // Intelligens default: a következő tömb kezdete = előző végpont + 1,
      // hossza azonos az előzővel (alapesetben MAX_NYUGTA_TOMBBEN = 50 lap)
      let nextKezdet: number | '' = ''
      let nextVeg: number | '' = ''
      if (typeof utolso?.szamVeg === 'number') {
        nextKezdet = utolso.szamVeg + 1
        const meret =
          typeof utolso.szamKezdet === 'number'
            ? utolso.szamVeg - utolso.szamKezdet
            : MAX_NYUGTA_TOMBBEN - 1
        nextVeg = nextKezdet + meret
      }
      return [
        ...prev,
        newTombRow({ szamKezdet: nextKezdet, szamVeg: nextVeg }),
      ]
    })
  }

  function removeTomb(key: string) {
    setTombok((prev) => (prev.length === 1 ? prev : prev.filter((t) => t.key !== key)))
  }

  // ── Validáció ──
  const darabszamok = useMemo(() => {
    return tombok.map((t) => {
      if (typeof t.szamKezdet !== 'number' || typeof t.szamVeg !== 'number') return null
      if (t.szamVeg < t.szamKezdet) return null
      return t.szamVeg - t.szamKezdet + 1
    })
  }, [tombok])

  // Batch-en belüli átfedés detektálás (csak UI jelzéshez)
  const overlapIndices = useMemo(() => {
    const overlapping = new Set<number>()
    for (let i = 0; i < tombok.length; i++) {
      for (let j = i + 1; j < tombok.length; j++) {
        const a = tombok[i]
        const b = tombok[j]
        if (
          typeof a.szamKezdet !== 'number' || typeof a.szamVeg !== 'number' ||
          typeof b.szamKezdet !== 'number' || typeof b.szamVeg !== 'number'
        ) continue
        if (a.szamKezdet <= b.szamVeg && a.szamVeg >= b.szamKezdet) {
          overlapping.add(i)
          overlapping.add(j)
        }
      }
    }
    return overlapping
  }, [tombok])

  const osszDarabszam = darabszamok.reduce<number>((s, d) => s + (d ?? 0), 0)

  const canSave =
    !!seria.trim() &&
    !!vasarlasDatuma &&
    tombok.length > 0 &&
    tombok.every((t, i) => {
      if (typeof t.szamKezdet !== 'number' || typeof t.szamVeg !== 'number') return false
      if (t.szamVeg < t.szamKezdet) return false
      const d = darabszamok[i]
      return d !== null && d > 0 && d <= MAX_NYUGTA_TOMBBEN
    }) &&
    overlapIndices.size === 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await createChitantaTombokBatch({
        seria: seria.trim(),
        vasarlas_datuma: vasarlasDatuma,
        vasarlas_ara_ossz: typeof vasarlasAraOssz === 'number' ? vasarlasAraOssz : null,
        megjegyzes: megjegyzes.trim() || null,
        tombok: tombok.map((t) => ({
          block_nr: t.blockNr.trim() || null,
          szam_kezdet: t.szamKezdet as number,
          szam_veg: t.szamVeg as number,
        })),
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(
        res.created === 1
          ? `Tömb rögzítve.`
          : `${res.created} tömb rögzítve (összesen ${osszDarabszam} nyugta).`,
      )
      onOpenChange(false)
      if (onCreated) await onCreated()
    } finally {
      setSaving(false)
    }
  }

  const isMulti = tombok.length > 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] overflow-y-auto p-0">
        <div className="border-b border-zinc-100 px-6 pt-6 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="icon-raised w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="font-heading text-lg">
                  {isMulti
                    ? `${tombok.length} nyugtatömb rögzítése egyszerre`
                    : 'Új nyugtatömb rögzítése'}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {isMulti
                    ? 'Közös vásárlási adatok, egymást követő tartományok.'
                    : 'Írd be az átvett tömb adatait, vagy adj hozzá többet egyszerre.'}
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 space-y-4">
          {/* Magyarázó box */}
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-800 leading-relaxed">
            A nyomdai kezdő és záró számot a tömb első és utolsó nyugtájáról
            olvasd le. Egyszerre több tömböt is rögzíthetsz (&bdquo;+ Újabb tömb&rdquo;
            gombbal) — a rendszer automatikusan felajánlja a folytatódó tartományt.
            Egy tömb <strong>{MAX_NYUGTA_TOMBBEN} lapos</strong>, ezért a kezdőszám beírásakor
            a záró szám magától kitöltődik — ha eltér, nyugodtan írd felül.
            A gyülekezeti saját szám minden év elején 1-től indul.
          </div>

          {/* Közös adatok */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ModalField
              label="Seria (minden tömbre közös)"
              required
              hint="Pl. „EREKC24” — a tömbön feltüntetett betűkód."
            >
              <Input
                value={seria}
                onChange={(e) => setSeria(e.target.value.toUpperCase())}
                placeholder="EREKC24"
                maxLength={20}
              />
            </ModalField>

            <ModalField label="Vásárlás dátuma" required>
              <Input
                type="date"
                value={vasarlasDatuma}
                onChange={(e) => setVasarlasDatuma(e.target.value)}
              />
            </ModalField>
          </div>

          <ModalField
            label="Vásárlás összesített ára (RON)"
            hint={isMulti
              ? `Az összes tömb együttes ára. A rendszer egyenlően elosztja (${tombok.length} tömbre).`
              : 'Ha rögzíted, a tömb rögzítéséhez kerül — később leltárnál is látod.'}
          >
            <Input
              type="number"
              step="0.01"
              value={vasarlasAraOssz}
              onChange={(e) =>
                setVasarlasAraOssz(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="0.00"
              min={0}
            />
          </ModalField>

          {/* Tömbök listája */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">
                Tömbök ({tombok.length})
              </h4>
              {isMulti && (
                <span className="text-xs text-slate-500">
                  Összesen: <strong>{osszDarabszam}</strong> nyugta
                </span>
              )}
            </div>

            {tombok.map((t, idx) => {
              const db = darabszamok[idx]
              const isOverlap = overlapIndices.has(idx)
              const err =
                db === null
                  ? null
                  : db > MAX_NYUGTA_TOMBBEN
                    ? `Egy nyugtatömb ${MAX_NYUGTA_TOMBBEN} lapos (most ${db})`
                    : isOverlap
                      ? 'Tartomány-átfedés más tömbbel!'
                      : null

              return (
                <div
                  key={t.key}
                  className={`rounded-xl border p-3 space-y-2 ${
                    err
                      ? 'border-red-300 bg-red-50/40'
                      : 'border-slate-200 bg-slate-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {idx + 1}. tömb
                    </span>
                    {tombok.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTomb(t.key)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="size-3" />
                        Törlés
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <ModalField label="Blokksz. (opcionális)" hint="Pl. 23">
                      <Input
                        value={t.blockNr}
                        onChange={(e) => updateTomb(t.key, { blockNr: e.target.value })}
                        placeholder="23"
                        maxLength={20}
                      />
                    </ModalField>
                    <ModalField label="Nyomdai kezdő" required>
                      <Input
                        type="number"
                        value={t.szamKezdet}
                        onChange={(e) => {
                          const ertek = e.target.value === '' ? '' : Number(e.target.value)
                          // 50 lapos tömb: a záró számot felajánljuk, de CSAK
                          // amíg a lelkész nem írt bele — a saját értékét soha
                          // nem írjuk felül.
                          const veg =
                            typeof ertek === 'number' && Number.isFinite(ertek) && t.szamVeg === ''
                              ? ertek + MAX_NYUGTA_TOMBBEN - 1
                              : t.szamVeg
                          updateTomb(t.key, { szamKezdet: ertek, szamVeg: veg })
                        }}
                        placeholder="115356"
                        min={0}
                      />
                    </ModalField>
                    <ModalField label="Nyomdai záró" required>
                      <Input
                        type="number"
                        value={t.szamVeg}
                        onChange={(e) =>
                          updateTomb(t.key, {
                            szamVeg: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        placeholder="115455"
                        min={0}
                      />
                    </ModalField>
                  </div>

                  {/* Visszajelző sáv */}
                  <div className="text-xs">
                    {err ? (
                      <span className="text-red-700 font-medium">{err}</span>
                    ) : db != null && db > 0 ? (
                      <span className="text-slate-700">
                        <strong>{db}</strong> nyugtát tartalmaz ·{' '}
                        {typeof vasarlasAraOssz === 'number' && vasarlasAraOssz > 0 && (
                          <span className="text-slate-500">
                            Ár tömbre: {(vasarlasAraOssz / tombok.length).toFixed(2)} RON
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">Tartomány még nincs megadva</span>
                    )}
                  </div>
                </div>
              )
            })}

            {/* + Újabb tömb gomb */}
            <button
              type="button"
              onClick={addTomb}
              className="w-full rounded-xl border border-dashed border-emerald-300 bg-white py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="size-4" />
              Újabb tömb hozzáadása
            </button>
          </div>

          {/* Megjegyzés (közös) */}
          <ModalField
            label="Megjegyzés (közös minden tömbre, opcionális)"
          >
            <Textarea
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.target.value)}
              placeholder="Pl. kerületi átvétel, 2024. január"
              rows={2}
            />
          </ModalField>
        </div>

        <div className="border-t border-zinc-100 bg-zinc-50/50 px-6 py-3 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-xl"
          >
            Mégse
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {tombok.length === 1
              ? 'Tömb rögzítése'
              : `${tombok.length} tömb rögzítése`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
