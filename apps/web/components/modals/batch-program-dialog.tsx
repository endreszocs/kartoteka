'use client'

// ── Tömeges program-bevitel (Claude Design — 2026-06-08) ──
// Több program egyszerre, kártyás sorokban. 5 sorral indul, bővíthető.
import { useState, useEffect, useId, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Rows3, X, Plus, Trash2, Check } from 'lucide-react'
import { saveBatchPrograms } from '@/app/(dashboard)/programs/actions'
import { useModalFocusTrap } from '@/components/modals/use-modal-focus-trap'
import {
  PROGRAM_TYPES, PROG_TIPUS_LABELS,
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

const INITIAL_ROWS = 5

function emptyRow(key: number): BatchRow {
  return { key, cim: '', datum: '', datum_vege: '', ido_kezdes: '', ido_befejezes: '', tipus: 'istentisztelet', helyszin: '', prioritas: 'normal', ismetlodes: '' }
}

interface BatchProgramDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
}

export function BatchProgramDialog({ open, onOpenChange, year }: BatchProgramDialogProps) {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [, setNextKey] = useState(0)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let focusTimer: ReturnType<typeof setTimeout> | null = null
    queueMicrotask(() => {
      if (cancelled) return
      setRows(Array.from({ length: INITIAL_ROWS }, (_, i) => emptyRow(i)))
      setNextKey(INITIAL_ROWS)
      focusTimer = setTimeout(() => firstInputRef.current?.focus(), 120)
    })
    return () => { cancelled = true; if (focusTimer) clearTimeout(focusTimer) }
  }, [open])

  // 2026-08-11 (P2 #26): Esc + görgetés-zár + FÓKUSZCSAPDA + fókusz-visszaadás +
  // háttér-inert. Eddig csak Esc és görgetés-zár volt, miközben a modál
  // `aria-modal="true"`-t állított — a Tab azonnal kivándorolt a modál mögé,
  // pont ebben az ablakban, ahol 5–15 sornyi mező van egymás alatt.
  // Részletek: `use-modal-focus-trap.ts`.
  useModalFocusTrap(open, modalRef, close)

  function updateRow(key: number, field: keyof BatchRow, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }
  const addRows = useCallback((count: number) => {
    setNextKey((prev) => {
      const next = Array.from({ length: count }, (_, i) => emptyRow(prev + i))
      setRows((prevRows) => [...prevRows, ...next])
      return prev + count
    })
  }, [])
  function removeRow(key: number) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  const filledCount = rows.filter((r) => r.cim.trim()).length

  // ── 2026-08-26 (5. kör): ünnepnapi alkalmak előtöltése ──────────────────
  // Az év kanonikus ünneplistájából istentisztelet-javaslatok kerülnek a
  // rácsba (a nem kellő sorokat egy kattintással törölni lehet). Az ünnepek
  // maguk NEM válnak program-sorrá — a naptár-rács jelzésként mutatja őket.
  async function handleUnnepElotoltes() {
    const { getUnnepnapokForYear } = await import('@/lib/utils/reformed-holidays')
    const unnepek = getUnnepnapokForYear(year)
    setNextKey((prevKey) => {
      let k = prevKey
      const ujak: BatchRow[] = unnepek.map((u) => ({
        ...emptyRow(k++),
        cim: `Ünnepi istentisztelet — ${u.name}`,
        datum: u.date,
        tipus: 'istentisztelet',
        prioritas: 'fontos',
      }))
      setRows((prev) => {
        // A meglévő ÜRES sorok helyére töltünk, a többi a végére kerül.
        const kitoltottek = prev.filter((r) => r.cim.trim() || r.datum)
        return [...kitoltottek, ...ujak]
      })
      return k
    })
    toast.success(`${unnepek.length} ünnepnapi alkalom előtöltve — a fölöslegeseket töröld, a többit mentsd.`)
  }

  // ── 2026-08-26 (5. kör): naptár-feltöltés fájlból (Excel/CSV) ───────────
  // A fájl KLIENS-oldalon dolgozódik fel a rácsba — a mentés ugyanazon az
  // ellenőrzött úton megy, mint a kézi kitöltés. Elvárt oszlopok: Cím, Dátum
  // (ÉÉÉÉ-HH-NN); opcionális: Záró dátum, Kezdés, Befejezés, Típus, Helyszín.
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFajlFeltoltes(file: File) {
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { toast.error('A fájlban nincs munkalap.'); return }
      const sorok = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' })
      if (sorok.length === 0) { toast.error('A munkalap üres.'); return }

      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const mezo = (sor: Record<string, unknown>, nevek: string[]) => {
        for (const kulcs of Object.keys(sor)) {
          if (nevek.includes(norm(kulcs))) return String(sor[kulcs] ?? '').trim()
        }
        return ''
      }
      const datumra = (v: string) => {
        const m = v.match(/^(\d{4})[.\-/ ]+(\d{1,2})[.\-/ ]+(\d{1,2})/)
        if (!m) return ''
        return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
      }
      const tipusra = (v: string) => {
        const t = norm(v)
        const talalat = PROGRAM_TYPES.find((pt) => norm(PROG_TIPUS_LABELS[pt] || pt) === t || pt === t)
        return talalat || 'egyeb'
      }

      let kihagyott = 0
      const ujSorok: Array<Omit<BatchRow, 'key'>> = []
      for (const sor of sorok) {
        const cim = mezo(sor, ['cim', 'megnevezes', 'program', 'esemeny', 'nev'])
        const datum = datumra(mezo(sor, ['datum', 'kezdodatum', 'nap', 'date']))
        if (!cim || !datum) { kihagyott += 1; continue }
        ujSorok.push({
          cim,
          datum,
          datum_vege: datumra(mezo(sor, ['zarodatum', 'datumvege', 'vege'])),
          ido_kezdes: mezo(sor, ['kezdes', 'idokezdes', 'ido', 'ora']).slice(0, 5),
          ido_befejezes: mezo(sor, ['befejezes', 'idobefejezes', 'zaras']).slice(0, 5),
          tipus: tipusra(mezo(sor, ['tipus', 'kategoria'])) as string,
          helyszin: mezo(sor, ['helyszin', 'hely']),
          prioritas: 'normal',
          ismetlodes: '',
        })
      }
      if (ujSorok.length === 0) {
        toast.error('Egyetlen sor sem volt beolvasható — a Cím és a Dátum (ÉÉÉÉ-HH-NN) oszlop kötelező.')
        return
      }
      setNextKey((prevKey) => {
        let k = prevKey
        const kesz: BatchRow[] = ujSorok.map((s) => ({ key: k++, ...s }))
        setRows((prev) => [...prev.filter((r) => r.cim.trim() || r.datum), ...kesz])
        return k
      })
      toast.success(
        `${ujSorok.length} sor beolvasva a fájlból${kihagyott > 0 ? ` (${kihagyott} hiányos sor kimaradt)` : ''} — ellenőrzés után mentsd.`,
      )
    } catch (e) {
      toast.error(`A fájl beolvasása nem sikerült: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, currentKey: number) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const idx = rows.findIndex((r) => r.key === currentKey)
    if (idx < rows.length - 1) {
      const nextKey = rows[idx + 1].key
      const el = document.querySelector<HTMLInputElement>(`[data-batch-key="${nextKey}"]`)
      el?.focus()
    } else {
      addRows(1)
      setTimeout(() => {
        const all = document.querySelectorAll<HTMLInputElement>('[data-batch-key]')
        all[all.length - 1]?.focus()
      }, 40)
    }
  }

  async function handleSubmit() {
    setLoading(true)
    const records: ProgramInput[] = rows
      .filter((r) => r.cim.trim() || r.datum)
      .map((r) => ({
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
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.count} program sikeresen mentve!`)
      onOpenChange(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    /* 2026-08-11 (P2 #26): a háttérre kattintás TÖBBÉ NEM zár be. Eddig
       `onMouseDown`-ra azonnal bezárt, megerősítés nélkül — és itt egyszerre
       AKÁR 15 kitöltött programsor veszett el egy félrekoppintástól. Ugyanezt a
       döntést hozta meg ma a közös `Dialog` primitív is
       (`packages/ui/src/components/dialog.tsx`, `disablePointerDismissal`).
       Bezárni az X-szel, az Esc-cel és a Mégse gombbal lehet. */
    <div className="kt-modal-overlay">
      <div
        ref={modalRef}
        className="kt-modal kt-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="kt-modal-head">
          <div className="kt-modal-title">
            <span className="kt-modal-ico"><Rows3 size={18} /></span>
            <div>
              <h3 id={titleId}>Tömeges bevitel</h3>
              <div className="kt-modal-sub">{year}. évi programok rögzítése — több egyszerre</div>
            </div>
          </div>
          <button type="button" className="kt-modal-close" onClick={() => onOpenChange(false)} aria-label="Bezárás">
            <X size={18} />
          </button>
        </div>

        <div className="kt-modal-body">
          <div className="kt-batch-toolbar">
            <span className="kt-batch-count">
              {filledCount > 0 ? <><strong>{filledCount}</strong> kitöltött program</> : 'Töltsd ki a sorokat — a cím a kötelező mező.'}
            </span>
            {/* 2026-08-26 (5. kör): naptár-feltöltés — ünnepnapi javaslatok +
                Excel/CSV beolvasás a rácsba (a mentés a megszokott úton megy). */}
            <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="kt-btn kt-btn-ghost" onClick={() => void handleUnnepElotoltes()}
                title="Az év református ünnepeihez istentisztelet-javaslatok kerülnek a sorokba">
                ✝ Ünnepnapi alkalmak előtöltése
              </button>
              <button type="button" className="kt-btn kt-btn-ghost" onClick={() => fileInputRef.current?.click()}
                title="Excel/CSV beolvasása a rácsba — elvárt oszlopok: Cím, Dátum (ÉÉÉÉ-HH-NN); opcionális: Záró dátum, Kezdés, Befejezés, Típus, Helyszín">
                📄 Feltöltés fájlból
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFajlFeltoltes(f)
                  e.target.value = ''
                }}
              />
            </span>
          </div>

          <div className="kt-batch-list">
            {rows.map((row, i) => (
              <div key={row.key} className="kt-batch-row">
                <div className="kt-batch-row-top">
                  <span className="kt-batch-num">{i + 1}</span>
                  <input
                    ref={i === 0 ? firstInputRef : undefined}
                    className="kt-input"
                    value={row.cim}
                    onChange={(e) => updateRow(row.key, 'cim', e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, row.key)}
                    data-batch-key={row.key}
                    placeholder="Program címe…"
                  />
                  <button type="button" className="kt-batch-rm" onClick={() => removeRow(row.key)} aria-label="Sor törlése">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="kt-batch-grid">
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Dátum</span>
                    <input type="date" className="kt-input" value={row.datum} onChange={(e) => updateRow(row.key, 'datum', e.target.value)} />
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Záró dátum</span>
                    <input type="date" className="kt-input" value={row.datum_vege} onChange={(e) => updateRow(row.key, 'datum_vege', e.target.value)} />
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Kezdés</span>
                    <input type="time" className="kt-input" value={row.ido_kezdes} onChange={(e) => updateRow(row.key, 'ido_kezdes', e.target.value)} />
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Befejezés</span>
                    <input type="time" className="kt-input" value={row.ido_befejezes} onChange={(e) => updateRow(row.key, 'ido_befejezes', e.target.value)} />
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Típus</span>
                    <select className="kt-input" value={row.tipus} onChange={(e) => updateRow(row.key, 'tipus', e.target.value)}>
                      {PROGRAM_TYPES.map((t) => <option key={t} value={t}>{PROG_TIPUS_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Helyszín</span>
                    <input className="kt-input" value={row.helyszin} placeholder="pl. Templom" onChange={(e) => updateRow(row.key, 'helyszin', e.target.value)} />
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Prioritás</span>
                    <select className="kt-input" value={row.prioritas} onChange={(e) => updateRow(row.key, 'prioritas', e.target.value)}>
                      {PROGRAM_PRIORITIES.map((p) => <option key={p} value={p}>{PROG_PRIORITAS_LABELS[p]}</option>)}
                    </select>
                  </div>
                  <div className="kt-batch-field">
                    <span className="kt-batch-cap">Ismétlődés</span>
                    <select className="kt-input" value={row.ismetlodes} onChange={(e) => updateRow(row.key, 'ismetlodes', e.target.value)}>
                      <option value="">Nem</option>
                      {ISMETLODES_TYPES.map((t) => <option key={t} value={t}>{ISMETLODES_LABELS[t]}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="kt-batch-add">
            <button type="button" className="kt-btn-sm" onClick={() => addRows(5)}><Plus size={14} /> 5 sor</button>
            <button type="button" className="kt-btn-sm" onClick={() => addRows(10)}><Plus size={14} /> 10 sor</button>
          </div>

          <div className="kt-modal-foot">
            <button type="button" className="kt-btn kt-btn-ghost" onClick={() => onOpenChange(false)}>Mégse</button>
            <button type="button" className="kt-btn kt-btn-primary" onClick={handleSubmit} disabled={loading || filledCount === 0}>
              <Check size={16} /> {loading ? `Mentés (${filledCount})…` : `Összes mentése (${filledCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
