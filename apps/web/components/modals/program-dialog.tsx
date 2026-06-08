'use client'

// ── Új / szerkesztő program ablak (Claude Design — 2026-06-08) ──
// Pixelhű a design-modálhoz: típus-választó ikonráccsal, szegmentált
// prioritás/ismétlődés, „többnapos"/„egész napos" kapcsolók. RHF + zod
// validáció, valós mentés (saveProgram).
import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarDays, X, MapPin, Clock, ChevronDown, Star, Flag, Repeat, Check,
} from 'lucide-react'
import { programSchema, type ProgramInput } from '@/lib/validations/dashboard'
import { saveProgram } from '@/app/(dashboard)/programs/actions'
import {
  PROGRAM_TYPES, PROG_TIPUS_LABELS, PROG_TIPUS_COLOR,
  PROGRAM_PRIORITIES, PROG_PRIORITAS_LABELS,
  ISMETLODES_TYPES, ISMETLODES_LABELS, EMOJI_LIST,
} from '@/lib/constants/dashboard'
import type { Program, ProgramTipus } from '@/lib/constants/dashboard'
import { PROG_TIPUS_ICON } from '@/components/dashboard/program-icons'
import { toast } from 'sonner'

interface ProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editProgram?: Program | null
  defaultDate?: string | null
}

const PRIO_ICON = { fontos: Flag, kiemelt: Star } as const

export function ProgramDialog({ open, onOpenChange, editProgram, defaultDate }: ProgramDialogProps) {
  const [loading, setLoading] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [multiDay, setMultiDay] = useState(false)
  const [allDay, setAllDay] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } =
    useForm<ProgramInput>({
      resolver: zodResolver(programSchema),
      defaultValues: { tipus: 'istentisztelet', prioritas: 'normal' },
    })

  const tipus = useWatch({ control, name: 'tipus' }) as ProgramTipus
  const prioritas = useWatch({ control, name: 'prioritas' })
  const ismetlodes = useWatch({ control, name: 'ismetlodes_tipus' })
  const egyediEmoji = useWatch({ control, name: 'egyedi_emoji' })
  const egyediNev = useWatch({ control, name: 'egyedi_tipus_nev' })

  // Előtöltés / alapértékek megnyitáskor
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
        setMultiDay(!!editProgram.datum_vege && editProgram.datum_vege !== editProgram.datum)
        setAllDay(!editProgram.ido_kezdes)
      } else {
        reset({
          cim: '', datum: defaultDate || '', datum_vege: '',
          ido_kezdes: '', ido_befejezes: '', helyszin: '',
          tipus: 'istentisztelet', prioritas: 'normal',
          ismetlodes_tipus: '', egyedi_tipus_nev: '', egyedi_emoji: '', megjegyzes: '',
        })
        setMultiDay(false)
        setAllDay(false)
      }
      setTypeOpen(false)
      setEmojiOpen(false)
    })
    return () => { cancelled = true }
  }, [open, editProgram, defaultDate, reset])

  // ESC + görgetés-zár + emoji kívülre kattintás
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onOpenChange(false) }
    function onClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onOpenChange])

  if (!open || typeof document === 'undefined') return null

  async function onSubmit(data: ProgramInput) {
    const payload: ProgramInput = {
      ...data,
      datum_vege: multiDay ? data.datum_vege : '',
      ido_kezdes: allDay ? '' : data.ido_kezdes,
      ido_befejezes: allDay ? '' : data.ido_befejezes,
    }
    setLoading(true)
    const result = await saveProgram(payload)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editProgram ? 'Program frissítve!' : 'Program létrehozva!')
      onOpenChange(false)
    }
  }

  const selectedLabel = tipus === 'egyeb' && egyediNev
    ? egyediNev
    : PROG_TIPUS_LABELS[tipus] || 'Egyéb'
  const SelectedIcon = PROG_TIPUS_ICON[tipus]
  const selectedColor = PROG_TIPUS_COLOR[tipus]

  return createPortal(
    <div
      className="kt-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false) }}
    >
      <div className="kt-modal" role="dialog" aria-modal="true" aria-label={editProgram ? 'Program szerkesztése' : 'Új program'}>
        <div className="kt-modal-head">
          <div className="kt-modal-title">
            <span className="kt-modal-ico"><CalendarDays size={18} /></span>
            <div>
              <h3>{editProgram ? 'Program szerkesztése' : 'Új program'}</h3>
              <div className="kt-modal-sub">Gyülekezeti alkalom rögzítése</div>
            </div>
          </div>
          <button type="button" className="kt-modal-close" onClick={() => onOpenChange(false)} aria-label="Bezárás">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="kt-modal-body">
          <input type="hidden" {...register('id')} />

          {/* Cím */}
          <div className="kt-field">
            <label className="kt-label">Program neve <span className="kt-req">*</span></label>
            <input className={`kt-input${errors.cim ? ' is-err' : ''}`} placeholder="Pl. Vasárnapi istentisztelet" autoFocus {...register('cim')} />
            {errors.cim && <p className="kt-err">{errors.cim.message}</p>}
          </div>

          {/* Típus-választó */}
          <div className="kt-field">
            <label className="kt-label">Típus <span className="kt-req">*</span></label>
            <button
              type="button"
              className="kt-typeselect"
              aria-expanded={typeOpen}
              style={{ ['--type-color' as string]: selectedColor }}
              onClick={() => setTypeOpen((v) => !v)}
            >
              <SelectedIcon size={20} style={{ color: selectedColor }} />
              <span className="kt-typeselect-label">{selectedLabel}</span>
              <ChevronDown size={16} className="kt-typeselect-caret" />
            </button>
            {typeOpen && (
              <div className="kt-typegrid">
                {PROGRAM_TYPES.map((t) => {
                  const TIcon = PROG_TIPUS_ICON[t]
                  const color = PROG_TIPUS_COLOR[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`kt-typecell${t === tipus ? ' is-active' : ''}`}
                      style={{ ['--type-color' as string]: color }}
                      onClick={() => { setValue('tipus', t); setTypeOpen(false) }}
                    >
                      <span className="kt-typecell-ico" style={{ color }}><TIcon size={17} /></span>
                      <span className="kt-typecell-label">{PROG_TIPUS_LABELS[t]}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Egyéb típus: egyedi név + emoji */}
          {tipus === 'egyeb' && (
            <div className="kt-egyeb">
              <div className="kt-field">
                <label className="kt-label">Egyedi típusnév</label>
                <input className="kt-input" placeholder="Pl. Családi nap" {...register('egyedi_tipus_nev')} />
              </div>
              <div className="kt-field" ref={emojiRef}>
                <label className="kt-label">Jelölő</label>
                <div className="kt-emoji-row">
                  <span className="kt-emoji-preview">{egyediEmoji || '📌'}</span>
                  <button type="button" className="kt-btn-sm" onClick={() => setEmojiOpen((v) => !v)}>
                    {emojiOpen ? 'Bezár' : 'Választ'}
                  </button>
                </div>
                {emojiOpen && (
                  <div className="kt-emoji-grid">
                    {EMOJI_LIST.map((em, i) => (
                      <button key={i} type="button" className="kt-emoji-cell" onClick={() => { setValue('egyedi_emoji', em); setEmojiOpen(false) }}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dátum + kapcsolók */}
          <div className="kt-field">
            <div className="kt-toggle-row">
              <label className="kt-switch">
                <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
                <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
                Többnapos
              </label>
              <label className="kt-switch">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
                Egész napos
              </label>
            </div>
          </div>

          <div className={multiDay ? 'kt-field-2' : 'kt-field'}>
            <div className="kt-field">
              <label className="kt-label">{multiDay ? 'Kezdő dátum' : 'Dátum'} <span className="kt-req">*</span></label>
              <input type="date" className={`kt-input${errors.datum ? ' is-err' : ''}`} {...register('datum')} />
              {errors.datum && <p className="kt-err">{errors.datum.message}</p>}
            </div>
            {multiDay && (
              <div className="kt-field">
                <label className="kt-label">Záró dátum</label>
                <input type="date" className={`kt-input${errors.datum_vege ? ' is-err' : ''}`} {...register('datum_vege')} />
                {errors.datum_vege && <p className="kt-err">{errors.datum_vege.message}</p>}
              </div>
            )}
          </div>

          {/* Idő (ha nem egész napos) */}
          {!allDay && (
            <div className="kt-field-2">
              <div className="kt-field">
                <label className="kt-label"><Clock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Kezdés</label>
                <input type="time" className="kt-input" {...register('ido_kezdes')} />
              </div>
              <div className="kt-field">
                <label className="kt-label">Befejezés</label>
                <input type="time" className="kt-input" {...register('ido_befejezes')} />
              </div>
            </div>
          )}

          {/* Helyszín */}
          <div className="kt-field">
            <label className="kt-label"><MapPin size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Helyszín</label>
            <input className="kt-input" placeholder="Pl. Templom" {...register('helyszin')} />
          </div>

          {/* Prioritás (szegmentált) */}
          <div className="kt-field">
            <label className="kt-label">Prioritás</label>
            <div className="kt-segmented">
              {PROGRAM_PRIORITIES.map((p) => {
                const PIcon = (PRIO_ICON as Record<string, typeof Star>)[p]
                return (
                  <button
                    key={p}
                    type="button"
                    className={`kt-seg kt-seg-${p}${prioritas === p ? ' is-active' : ''}`}
                    onClick={() => setValue('prioritas', p)}
                  >
                    {PIcon && <PIcon size={13} />}{PROG_PRIORITAS_LABELS[p]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Ismétlődés (szegmentált) */}
          <div className="kt-field">
            <label className="kt-label">Ismétlődés</label>
            <div className="kt-segmented">
              <button type="button" className={`kt-seg${!ismetlodes ? ' is-active' : ''}`} onClick={() => setValue('ismetlodes_tipus', '')}>
                Nem
              </button>
              {ISMETLODES_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`kt-seg${ismetlodes === t ? ' is-active' : ''}`}
                  onClick={() => setValue('ismetlodes_tipus', t)}
                >
                  <Repeat size={12} />{ISMETLODES_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Megjegyzés */}
          <div className="kt-field">
            <label className="kt-label">Megjegyzés</label>
            <textarea className="kt-input kt-textarea" placeholder="Opcionális megjegyzés…" {...register('megjegyzes')} />
          </div>

          <div className="kt-modal-foot">
            <button type="button" className="kt-btn kt-btn-ghost" onClick={() => onOpenChange(false)}>Mégse</button>
            <button type="submit" className="kt-btn kt-btn-primary" disabled={loading}>
              <Check size={16} /> {loading ? 'Mentés…' : 'Mentés'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
