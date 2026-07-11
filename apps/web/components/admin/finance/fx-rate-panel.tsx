'use client'

/**
 * Admin → Rendszer pénzügyei: ÁRFOLYAM-panel.
 *
 * A valós USD/EUR/HUF → RON árfolyamokat mutatja (BNR/Frankfurter cache vagy
 * kézi felülírás), és lehetővé teszi soronkénti kézi felülírásukat. A bevétel-
 * könyvelés RON-konverziója és a KPI-k usdRonRate-je is ezekből számol.
 *
 * A szerver-oldali `getFxRates` cache-first, napi frissítéssel dolgozik; a
 * „Frissítés" gomb újraolvassa a hatályos árfolyamot. A kézi felülírás
 * (`setFxRateOverride`) a napi automatikus frissítést kikapcsolja az adott párra.
 */

import { useEffect, useState, useTransition } from 'react'
import { RefreshCw, Check, X, Pencil, TriangleAlert, Coins } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '../_shared/status-badge'
import { AdminSkeleton } from '../_shared/admin-skeleton'
import { formatDateHu } from './finance-shared'
import {
  getFxRates,
  setFxRateOverride,
  type FxPair,
  type FxRates,
} from '@/app/(dashboard)/admin/system-finance-actions'

const FX_SOURCE_LABELS: Record<FxRates['source'], string> = {
  bnr: 'BNR (Román Nemzeti Bank)',
  frankfurter: 'Frankfurter (ECB)',
  manual: 'Kézi felülírás',
  fallback: 'Tartalék érték',
}

interface FxRow {
  pair: FxPair
  label: string
  hint: string
}

const FX_ROWS: FxRow[] = [
  { pair: 'eur_ron', label: '1 EUR', hint: 'euró → lej' },
  { pair: 'usd_ron', label: '1 USD', hint: 'dollár → lej' },
  { pair: 'huf_ron', label: '100 HUF', hint: 'forint → lej' },
]

/** A HUF árfolyamot 100 forintra vetítve mutatjuk (a lej/forint arány apró). */
function displayRate(pair: FxPair, rates: FxRates): number {
  const raw = rates[pair]
  return pair === 'huf_ron' ? raw * 100 : raw
}

export function FxRatePanel({
  rates: initialRates,
  onChanged,
}: {
  /** Kezdő árfolyamok a szülőtől (ha már betöltötte); enélkül maga kéri le. */
  rates?: FxRates | null
  /** A szülő KPI-jait is frissíti, ha az árfolyam változott. */
  onChanged?: () => void
}) {
  const [rates, setRates] = useState<FxRates | null>(initialRates ?? null)
  const [loading, setLoading] = useState(!initialRates)
  const [refreshing, startRefresh] = useTransition()
  const [editing, setEditing] = useState<FxPair | null>(null)

  useEffect(() => {
    // Ha a szülő már átadta a rátákat, a kezdőérték a useState-ből jön —
    // nincs szükség szinkron prop-sync-re (a panel önálló, Frissítéssel újratölt).
    if (initialRates) return
    void getFxRates().then((r) => {
      if (r.data) setRates(r.data)
      else if (r.error) toast.error(`Árfolyam: ${r.error}`)
      setLoading(false)
    })
  }, [initialRates])

  function handleRefresh() {
    startRefresh(async () => {
      const r = await getFxRates()
      if (r.error) toast.error(r.error)
      else if (r.data) {
        setRates(r.data)
        toast.success('Árfolyam frissítve.')
      }
    })
  }

  if (loading) {
    return (
      <section className="card-raised space-y-3 p-4 sm:p-5">
        <AdminSkeleton rows={3} />
      </section>
    )
  }

  if (!rates) {
    return (
      <section className="card-raised p-4 text-sm text-muted-foreground sm:p-5">
        Az árfolyam jelenleg nem elérhető.
      </section>
    )
  }

  return (
    <section className="card-raised space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Coins className="size-4" />
          </span>
          <h3 className="font-heading text-lg text-foreground">Árfolyamok (→ RON)</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="min-h-9 gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Frissítés
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusBadge intent={rates.source === 'manual' ? 'warning' : 'info'}>
          {FX_SOURCE_LABELS[rates.source]}
        </StatusBadge>
        {rates.date && <span>Publikálva: {formatDateHu(rates.date)}</span>}
        {rates.updated_at && <span>· Frissítve: {formatDateHu(rates.updated_at)}</span>}
        {rates.stale && (
          <StatusBadge intent="warning" icon={TriangleAlert}>
            Elavult (az élő lekérés nem sikerült)
          </StatusBadge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {FX_ROWS.map((row) => (
          <FxRateCard
            key={row.pair}
            row={row}
            value={displayRate(row.pair, rates)}
            rawValue={rates[row.pair]}
            editing={editing === row.pair}
            onEdit={() => setEditing(row.pair)}
            onCancel={() => setEditing(null)}
            onSaved={(next) => {
              setRates(next)
              setEditing(null)
              onChanged?.()
            }}
          />
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        A kézi felülírás kikapcsolja a napi automatikus frissítést az adott árfolyamra, amíg új
        értéket nem adsz meg. A rendszer minden bevételt ezekkel az árfolyamokkal számol át lejre.
      </p>
    </section>
  )
}

function FxRateCard({
  row,
  value,
  rawValue,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  row: FxRow
  value: number
  rawValue: number
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaved: (next: FxRates) => void
}) {
  const [draft, setDraft] = useState(String(rawValue))
  const [isPending, startTransition] = useTransition()

  // A szerkesztésbe lépéskor a draft a friss rawValue-ra áll — render közbeni
  // korrekció (React ajánlott minta a prop-változásra) az effekt-alapú
  // szinkron setState helyett, ami cascading rendert okozna.
  const [wasEditing, setWasEditing] = useState(editing)
  if (editing !== wasEditing) {
    setWasEditing(editing)
    if (editing) setDraft(String(rawValue))
  }

  function handleSave() {
    const num = Number(draft)
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Az árfolyam pozitív szám kell legyen.')
      return
    }
    startTransition(async () => {
      const res = await setFxRateOverride(row.pair, num)
      if (res.error) toast.error(res.error)
      else if (res.data) {
        toast.success('Árfolyam felülírva.')
        onSaved(res.data)
      }
    })
  }

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.label}</p>
          <p className="text-[11px] text-muted-foreground">{row.hint}</p>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onEdit}
            className="size-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
            aria-label={`${row.label} árfolyam felülírása`}
            title="Kézi felülírás"
          >
            <Pencil className="size-4" />
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Input
            type="number"
            step="0.0001"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isPending}
            autoFocus
            aria-label={`${row.label} új árfolyam`}
            className="h-10"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isPending}
              className="min-h-9 flex-1 gap-1.5"
            >
              <Check className="size-3.5" />
              Mentés
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isPending}
              className="min-h-9 flex-1 gap-1.5"
            >
              <X className="size-3.5" />
              Mégse
            </Button>
          </div>
          {row.pair === 'huf_ron' && (
            <p className="text-[11px] text-muted-foreground">
              Az 1 forintra eső lej-értéket add meg (pl. 0.0129).
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-foreground">
          {value.toLocaleString('hu-HU', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          <span className="ml-1 text-sm font-normal text-muted-foreground">RON</span>
        </p>
      )}
    </div>
  )
}
