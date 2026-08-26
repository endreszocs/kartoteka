'use client'

// ── Új / szerkesztő program ablak (Claude Design — 2026-06-08) ──
// Pixelhű a design-modálhoz: típus-választó ikonráccsal, szegmentált
// prioritás/ismétlődés, „többnapos"/„egész napos" kapcsolók. RHF + zod
// validáció, valós mentés (saveProgram).
import { useCallback, useEffect, useId, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useForm, useWatch, type FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CalendarDays, X, MapPin, Clock, ChevronDown, Star, Flag, Repeat, Check,
} from 'lucide-react'
import { programSchema, type ProgramInput } from '@/lib/validations/dashboard'
import { saveProgram, createImahetNaplosorok } from '@/app/(dashboard)/programs/actions'
import {
  PROGRAM_TYPES, PROG_TIPUS_LABELS, PROG_TIPUS_COLOR,
  PROGRAM_PRIORITIES, PROG_PRIORITAS_LABELS,
  ISMETLODES_TYPES, ISMETLODES_LABELS, EMOJI_LIST, HU_DAYS_SHORT,
} from '@/lib/constants/dashboard'
import {
  PROGRAM_SABLONOK, FIT7_SZINTEK, sablonFelismeres, sablonZaroDatum,
  napokListaja, fit7MegjegyzesFrissit, fit7SzervezesSor,
  type ProgramSablon, type SablonKulcs, type Fit7Szint,
} from '@/lib/constants/program-sablonok'
import type { Program, ProgramTipus } from '@/lib/constants/dashboard'
import { PROG_TIPUS_ICON } from '@/components/dashboard/program-icons'
import { useModalFocusTrap } from '@/components/modals/use-modal-focus-trap'
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
  // 2026-08-25 (sablonok): a legutóbb rákattintott sablon-chip kulcsa — amíg
  // aktív, a kezdő dátum megadásakor a záró dátum automatikusan számolódik.
  const [aktivSablon, setAktivSablon] = useState<SablonKulcs | null>(null)
  const [fit7Szint, setFit7Szint] = useState<Fit7Szint>('gyulekezeti')
  // Imahét napi beosztás: dátum → szolgáló lelkész neve (dátum-kulcsos, így a
  // kezdő dátum eltolása nem keveri össze a már beírt neveket).
  const [imahetSzolgalok, setImahetSzolgalok] = useState<Record<string, string>>({})
  const [naplosorokBe, setNaplosorokBe] = useState(true)
  const emojiRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const { register, handleSubmit, reset, control, setValue, getValues, formState: { errors } } =
    useForm<ProgramInput>({
      resolver: zodResolver(programSchema),
      defaultValues: { tipus: 'istentisztelet', prioritas: 'normal' },
    })

  const tipus = useWatch({ control, name: 'tipus' }) as ProgramTipus
  const prioritas = useWatch({ control, name: 'prioritas' })
  const ismetlodes = useWatch({ control, name: 'ismetlodes_tipus' })
  const egyediEmoji = useWatch({ control, name: 'egyedi_emoji' })
  const egyediNev = useWatch({ control, name: 'egyedi_tipus_nev' })
  const cim = useWatch({ control, name: 'cim' })
  const datum = useWatch({ control, name: 'datum' })
  const datumVege = useWatch({ control, name: 'datum_vege' })

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
          ismetlodes_vege: editProgram.ismetlodes_vege || '',
          publikus: editProgram.publikus === true,
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
          ismetlodes_tipus: '', ismetlodes_vege: '', publikus: false,
          egyedi_tipus_nev: '', egyedi_emoji: '', megjegyzes: '',
        })
        setMultiDay(false)
        setAllDay(false)
      }
      setTypeOpen(false)
      setEmojiOpen(false)
      // 2026-08-25 (sablonok): a sablon-állapot tiszta lappal indul.
      setAktivSablon(null)
      setFit7Szint('gyulekezeti')
      setImahetSzolgalok({})
      setNaplosorokBe(true)
    })
    return () => { cancelled = true }
  }, [open, editProgram, defaultDate, reset])

  // 2026-08-25 (sablonok): ha a chip-kattintáskor még nem volt kezdő dátum, a
  // záró dátum akkor számolódik ki, amikor a lelkész beírja a kezdőt. A záró
  // dátum kézi átírását nem bántjuk — csak a KEZDŐ dátum változása számol újra.
  useEffect(() => {
    if (!open || !aktivSablon || !datum) return
    // Ha a lelkész időközben átnevezte a programot (a cím már nem a sablonra
    // utal), az automatikus záró-dátum-számítás leáll — nem írunk felül semmit.
    if (sablonFelismeres(getValues('cim') || '') !== aktivSablon) return
    const sablon = PROGRAM_SABLONOK.find((s) => s.kulcs === aktivSablon)
    if (!sablon) return
    const zaro = sablonZaroDatum(datum, sablon.napok)
    if (zaro) setValue('datum_vege', zaro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aktivSablon, datum])

  // Emoji-választó kívülre kattintás
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 2026-08-11 (P2 #26): Esc + görgetés-zár + FÓKUSZCSAPDA + fókusz-visszaadás +
  // háttér-inert. Eddig csak Esc és görgetés-zár volt, miközben a modál
  // `aria-modal="true"`-t állított — a Tab azonnal kivándorolt a modál mögé.
  // Részletek: `use-modal-focus-trap.ts`.
  useModalFocusTrap(open, modalRef, close)

  if (!open || typeof document === 'undefined') return null

  // 2026-08-25 (sablonok): a chip kitölti a nevet/típust/megjegyzést, bekapcsolja
  // a többnapos kapcsolót, és ha van már kezdő dátum, a záró dátumot is számolja.
  function applySablon(sablon: ProgramSablon) {
    setAktivSablon(sablon.kulcs)
    setValue('cim', sablon.cim, { shouldValidate: true })
    setValue('tipus', sablon.tipus)
    if (sablon.prioritas) setValue('prioritas', sablon.prioritas)
    const megjegyzes = sablon.kulcs === 'fit7'
      ? `${sablon.megjegyzes}\n${fit7SzervezesSor(fit7Szint)}`
      : sablon.megjegyzes
    setValue('megjegyzes', megjegyzes)
    setMultiDay(true)
    const kezdo = getValues('datum')
    if (kezdo) {
      const zaro = sablonZaroDatum(kezdo, sablon.napok)
      if (zaro) setValue('datum_vege', zaro)
    }
    setTypeOpen(false)
  }

  async function onSubmit(data: ProgramInput) {
    const payload: ProgramInput = {
      ...data,
      datum_vege: multiDay ? data.datum_vege : '',
      ido_kezdes: allDay ? '' : data.ido_kezdes,
      ido_befejezes: allDay ? '' : data.ido_befejezes,
    }
    setLoading(true)
    const result = await saveProgram(payload)
    if (result.error) {
      setLoading(false)
      toast.error(result.error)
      return
    }

    // 2026-08-25 (Imahét): a napi vendéglelkész-beosztásból munkanapló-sorok —
    // CSAK a program sikeres mentése UTÁN, és csak kitöltött szolgálóval.
    let naploUzenet = ''
    if (
      naplosorokBe &&
      multiDay &&
      sablonFelismeres(payload.cim || '') === 'imahet'
    ) {
      const napok = napokListaja(payload.datum, payload.datum_vege || '', 9)
        .map((nap) => ({ datum: nap, szolgalo: (imahetSzolgalok[nap] || '').trim() }))
        .filter((nap) => nap.szolgalo.length > 0)
      if (napok.length > 0) {
        const naploRes = await createImahetNaplosorok({ napok })
        if ('error' in naploRes) {
          setLoading(false)
          toast.success(editProgram ? 'Program frissítve!' : 'Program létrehozva!')
          toast.error(naploRes.error)
          onOpenChange(false)
          return
        }
        naploUzenet = ` + ${naploRes.letrehozva} munkanapló-sor létrehozva`
        if (naploRes.kihagyva > 0) {
          naploUzenet += ` (${naploRes.kihagyva} nap kihagyva — már szerepelt a munkanaplóban)`
        }
      }
    }

    setLoading(false)
    toast.success(
      naploUzenet
        ? `Program mentve${naploUzenet}`
        : (editProgram ? 'Program frissítve!' : 'Program létrehozva!'),
    )
    onOpenChange(false)
  }

  // 2026-08-25: a néma validációs bukás hibaosztálya ellen — ha olyan mező
  // bukik, amelynek nincs kirajzolt hibaüzenete (így járt a rejtett `id`),
  // a felhasználó eddig SEMMIT nem látott a Mentés-kattintás után.
  function onInvalid(errs: FieldErrors<ProgramInput>) {
    const elso = Object.values(errs).find(
      (e): e is { message: string } => typeof (e as { message?: unknown })?.message === 'string',
    )?.message
    toast.error(elso || 'A program nem menthető — ellenőrizd a kitöltött mezőket.')
  }

  const selectedLabel = tipus === 'egyeb' && egyediNev
    ? egyediNev
    : PROG_TIPUS_LABELS[tipus] || 'Egyéb'
  const SelectedIcon = PROG_TIPUS_ICON[tipus]
  const selectedColor = PROG_TIPUS_COLOR[tipus]

  // 2026-08-25 (Imahét): a napi beosztás sorai — cím-felismerés alapján (kézzel
  // beírt „imahét" címre is megjelenik), többnapos programnál, legfeljebb 9 nap.
  const imahetNapok =
    sablonFelismeres(cim || '') === 'imahet' && multiDay
      ? napokListaja(datum || '', datumVege || '', 9)
      : []

  function napCimke(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    if (Number.isNaN(d.getTime())) return iso
    return `${iso.slice(5, 7)}.${iso.slice(8, 10)}. ${HU_DAYS_SHORT[d.getDay()]}`
  }

  return createPortal(
    /* 2026-08-11 (P2 #26): a háttérre kattintás TÖBBÉ NEM zár be. Eddig
       `onMouseDown`-ra azonnal bezárt, megerősítés nélkül — egy félrekoppintás
       elvitte a kitöltött program-űrlapot (cím, típus, dátum, ismétlődés,
       megjegyzés). Ugyanezt a döntést hozta meg ma a közös `Dialog` primitív is
       (`packages/ui/src/components/dialog.tsx`, `disablePointerDismissal`
       alapból `true`) — a két program-modál most már ugyanúgy viselkedik.
       Bezárni az X-szel, az Esc-cel és a Mégse gombbal lehet. */
    <div className="kt-modal-overlay">
      <div
        ref={modalRef}
        className="kt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="kt-modal-head">
          <div className="kt-modal-title">
            <span className="kt-modal-ico"><CalendarDays size={18} /></span>
            <div>
              <h3 id={titleId}>{editProgram ? 'Program szerkesztése' : 'Új program'}</h3>
              <div className="kt-modal-sub">Gyülekezeti alkalom rögzítése</div>
            </div>
          </div>
          <button type="button" className="kt-modal-close" onClick={() => onOpenChange(false)} aria-label="Bezárás">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="kt-modal-body">
          <input type="hidden" {...register('id')} />

          {/* Cím */}
          <div className="kt-field">
            <label className="kt-label">Program neve <span className="kt-req">*</span></label>
            <input className={`kt-input${errors.cim ? ' is-err' : ''}`} placeholder="Pl. Vasárnapi istentisztelet" autoFocus {...register('cim')} />
            {errors.cim && <p className="kt-err">{errors.cim.message}</p>}
          </div>

          {/* Sablonok — csak ÚJ programnál (2026-08-25) */}
          {!editProgram && (
            <div className="kt-field">
              <label className="kt-label">Sablonok</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PROGRAM_SABLONOK.map((s) => (
                  <button
                    key={s.kulcs}
                    type="button"
                    className="kt-btn-sm"
                    title={s.leiras}
                    aria-pressed={aktivSablon === s.kulcs}
                    style={aktivSablon === s.kulcs
                      ? { borderColor: 'var(--primary)', color: 'var(--primary)' }
                      : undefined}
                    onClick={() => applySablon(s)}
                  >
                    {s.emoji} {s.cim}
                  </button>
                ))}
              </div>
              {aktivSablon === 'fit7' && (
                <div className="kt-segmented" style={{ marginTop: 8 }}>
                  {FIT7_SZINTEK.map((sz) => (
                    <button
                      key={sz.value}
                      type="button"
                      className={`kt-seg${fit7Szint === sz.value ? ' is-active' : ''}`}
                      title={'A szervezés szintje — a megjegyzés „Szervezés: …" sorát frissíti.'}
                      onClick={() => {
                        setFit7Szint(sz.value)
                        setValue('megjegyzes', fit7MegjegyzesFrissit(getValues('megjegyzes') || '', sz.value))
                      }}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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

          {/* 2026-08-26 (5. kör): a sorozat záró napja — e nélkül a heti
              bibliaóra „örökre futott" a naptárban. */}
          {ismetlodes ? (
            <div className="kt-field">
              <label className="kt-label">Ismétlődés vége (utolsó alkalom napja)</label>
              <input type="date" className="kt-input" {...register('ismetlodes_vege')} />
              <p className="kt-modal-sub">Üresen hagyva a sorozat a megjelenített év végéig fut.</p>
            </div>
          ) : null}

          {/* 2026-08-26 (5. kör): weboldal-publikálás.
              2026-08-27 — Endre kifejezett kérésére a LEÍRÁS is kikerül a
              nyilvános naptárba („legyen egy naptár… leírással együtt").
              A belső MEGJEGYZÉS továbbra sem hagyja el a rendszert. Mivel ez
              tágítja azt, ami nyilvánossá válik, a kapcsoló alatt ki is írjuk
              — a felhasználó ne utólag, a weboldalon szembesüljön vele. */}
          <div className="kt-field">
            <label className="kt-switch" title="Bekapcsolva az esemény megjelenik a gyülekezet nyilvános weboldalán és letölthető naptárában.">
              <input type="checkbox" {...register('publikus')} />
              <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
              Megjelenhet a gyülekezet weboldalán
            </label>
            <p className="kt-modal-sub">
              Kikerül: a <strong>cím, időpont, helyszín</strong> és a <strong>leírás</strong> —
              a kezdőlap „Következő alkalom" kártyájára, az Alkalmaink oldal éves naptárába
              és a letölthető naptárfájlba. A <strong>megjegyzés</strong> soha nem kerül ki.
            </p>
          </div>

          {/* Imahét — napi vendéglelkész-beosztás (2026-08-25) */}
          {imahetNapok.length > 0 && (
            <div className="kt-field">
              <div className="kt-label-row">
                <label className="kt-label">Napi beosztás — vendéglelkészek</label>
                <label
                  className="kt-switch"
                  title="Bekapcsolva a mentés a kitöltött napokra munkanapló-sorokat is létrehoz (jellege: Imahét)."
                >
                  <input
                    type="checkbox"
                    checked={naplosorokBe}
                    onChange={(e) => setNaplosorokBe(e.target.checked)}
                  />
                  <span className="kt-switch-track"><span className="kt-switch-thumb" /></span>
                  Munkanapló-sorok létrehozása
                </label>
              </div>
              {imahetNapok.map((nap) => (
                <div key={nap} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span className="kt-label" style={{ width: 96, flexShrink: 0, fontWeight: 500 }}>
                    {napCimke(nap)}
                  </span>
                  <input
                    className="kt-input"
                    placeholder="Szolgáló lelkész"
                    maxLength={120}
                    value={imahetSzolgalok[nap] || ''}
                    onChange={(e) =>
                      setImahetSzolgalok((prev) => ({ ...prev, [nap]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <p className="kt-modal-sub" style={{ marginTop: 6 }}>
                Az üresen hagyott napokból nem készül munkanapló-sor. A jelenlétet és a
                perselyt a munkanaplóban lehet utólag kitölteni.
              </p>
            </div>
          )}

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
