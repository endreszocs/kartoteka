'use client'

// 2026-07-25 (F8d/S3): kompakt gyorsrögzítő sor az iktatott iratok listája
// fölé — a munkanapló táblázatos rögzítőjének (worklog-table-editor)
// cella-stílusában. Célja a SOROZAT-rögzítés: irány + kelt + tárgy +
// feladó/címzett + ügykör → Enter (vagy az „Iktat" gomb) = azonnali iktatás
// automatikus sorszámmal (saveFilingEntry, next_iktato_sequence RPC); siker
// után a sor ürül, és a fókusz visszaáll a tárgy-mezőre. Az irány, a kelt és
// az ügykör szándékosan MEGMARAD — a tipikus munkafolyamat egy köteg azonos
// napi posta végigiktatása. md alatt rejtett: telefonon a lépéses varázsló
// a kényelmes út.

import { useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Loader2, Stamp } from 'lucide-react'
import { toast } from 'sonner'

import { saveFilingEntry } from '@/app/(dashboard)/iktato/actions'
import { FILING_DIRECTIONS, FILING_DIRECTION_LABELS } from '@/lib/constants/filing'
import type { FilingDirection } from '@/lib/constants/filing'
import { FILING_UGYKOROK, getRetentionForUgykor } from '@/lib/constants/filing-ugykorjegyzek'
import { cn } from '@/lib/utils'

// A munkanapló-táblázat cella-stílusa (worklog-table-editor kontraktus):
// keret nélküli, kompakt input, fókusznál háttér + ring — token-alapú.
const CELL_INPUT =
  'h-8 w-full min-w-0 rounded-md border-0 bg-transparent px-2 text-sm text-foreground outline-none ' +
  'placeholder:text-muted-foreground/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring'

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-border bg-muted px-2 py-2 text-left',
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface FilingQuickRowProps {
  /** Sikeres iktatás után hívódik — a szülő újratölti a listát. */
  onSaved: () => void
}

export function FilingQuickRow({ onSaved }: FilingQuickRowProps) {
  const [direction, setDirection] = useState<FilingDirection>('incoming')
  const [kelt, setKelt] = useState<string>(() => localToday())
  const [subject, setSubject] = useState('')
  const [sender, setSender] = useState('')
  const [ugykorKod, setUgykorKod] = useState('')
  const [saving, setSaving] = useState(false)
  const subjectRef = useRef<HTMLInputElement | null>(null)

  async function handleSave() {
    if (saving) return
    if (!kelt) {
      toast.error('A kelt dátum kötelező!')
      return
    }
    if (!subject.trim()) {
      toast.error('A tárgy kitöltése kötelező az iktatáshoz.')
      subjectRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const result = await saveFilingEntry({
        direction,
        kelt,
        subject: subject.trim(),
        sender_or_recipient: sender.trim() || null,
        // A dialógusos új-irat default (legacy mező, a felületen nem szerkeszthető).
        file_folder: 'F.Á.',
        targykivonat: null,
        elintezes_ideje: null,
        elintezes_modja: null,
        irattarijel: null,
        megjegyzes: null,
        external_ref_szam: null,
        external_ref_kelt: null,
        // Beérkezés csak érkező iratnál értelmezett — a gyorsrögzítés tipikusan
        // a „ma érkezett posta" munkafolyamata, ezért a mai nap megy.
        beerkezes_ideje: direction === 'incoming' ? localToday() : null,
        mellekletek_szama: null,
        valasz_iktatoszam: null,
        ugykor_kod: ugykorKod || null,
        retention_type: ugykorKod ? getRetentionForUgykor(ugykorKod) : null,
        has_duplicate: false,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      // Az insert-ág visszaadja a ténylegesen kiosztott sorszámot — ezt
      // mutatjuk a visszajelzésben (certificate-issue-dialog minta).
      const iratszam =
        'sequenceNumber' in result && typeof result.sequenceNumber === 'number'
          ? `${result.year}/${result.sequenceNumber}`
          : null
      toast.success(iratszam ? `Iktatva: ${iratszam} — ${subject.trim()}` : 'Irat iktatva!')
      // Sorozat-rögzítés: irány/kelt/ügykör marad, tárgy + partner ürül,
      // a fókusz visszaáll a tárgyra.
      setSubject('')
      setSender('')
      onSaved()
      requestAnimationFrame(() => subjectRef.current?.focus())
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    // Gombon az Enter a gombot aktiválja, nem a sort menti (worklog-minta).
    if ((e.target as HTMLElement).tagName === 'BUTTON') return
    e.preventDefault()
    void handleSave()
  }

  return (
    <div className="hidden md:block">
      <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th className="min-w-[7rem]">Irány</Th>
              <Th className="min-w-[8.75rem]">Kelt</Th>
              <Th className="min-w-[14rem]">Tárgy *</Th>
              <Th className="min-w-[10rem]">Feladó / címzett</Th>
              <Th className="min-w-[12rem]">Ügykör</Th>
              <Th className="w-24 text-right">
                <span className="sr-only">Iktatás</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            <tr onKeyDown={handleKeyDown} className="bg-muted/30">
              <td className="px-1 py-1 align-middle">
                <select
                  value={direction}
                  aria-label="Irány"
                  onChange={(e) => setDirection(e.target.value as FilingDirection)}
                  className={cn(CELL_INPUT, 'px-1')}
                >
                  {FILING_DIRECTIONS.map((item) => (
                    <option key={item} value={item}>{FILING_DIRECTION_LABELS[item]}</option>
                  ))}
                </select>
              </td>
              <td className="px-1 py-1 align-middle">
                <input
                  type="date"
                  value={kelt}
                  aria-label="Kelt (irat keltezése)"
                  onChange={(e) => setKelt(e.target.value)}
                  className={cn(CELL_INPUT, 'w-[8.25rem]')}
                />
              </td>
              <td className="px-1 py-1 align-middle">
                <input
                  ref={subjectRef}
                  type="text"
                  value={subject}
                  aria-label="Tárgy"
                  placeholder="Irat rövid tárgya"
                  onChange={(e) => setSubject(e.target.value)}
                  className={CELL_INPUT}
                />
              </td>
              <td className="px-1 py-1 align-middle">
                <input
                  type="text"
                  value={sender}
                  aria-label="Feladó vagy címzett"
                  placeholder={direction === 'incoming' ? 'Feladó' : 'Címzett'}
                  onChange={(e) => setSender(e.target.value)}
                  className={CELL_INPUT}
                />
              </td>
              <td className="px-1 py-1 align-middle">
                <select
                  value={ugykorKod}
                  aria-label="Ügykör (EREK 2024)"
                  onChange={(e) => setUgykorKod(e.target.value)}
                  className={cn(CELL_INPUT, 'px-1', !ugykorKod && 'text-muted-foreground/60')}
                >
                  <option value="">— ügykör —</option>
                  {FILING_UGYKOROK.map((entry) => (
                    <option key={entry.kod} value={entry.kod}>
                      {entry.parentKod ? '  ' : ''}{entry.kod} {entry.nev}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-2 py-1 text-right align-middle">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground',
                    'transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Stamp className="size-3.5" aria-hidden />
                  )}
                  Iktat
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        Gyorsrögzítés: Enter vagy az „Iktat&rdquo; gomb azonnal iktat automatikus sorszámmal — siker
        után a sor ürül, és jöhet a következő irat. A további mezők (tárgykivonat, hivatkozások,
        mellékletek…) utólag a „Szerk.&rdquo; gombbal tölthetők ki.
      </p>
    </div>
  )
}
