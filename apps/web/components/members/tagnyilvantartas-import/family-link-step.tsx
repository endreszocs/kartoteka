'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Heart,
  Home,
  Loader2,
  Network,
  ShieldAlert,
  Sparkles,
  Undo2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  applyFamilyLinks,
  previewFamilyLinks,
  revertFamilyLinkBatch,
  type FamilyLinkMode,
  type FamilyLinkResponse,
} from '@/lib/import/family-link-inference-actions'

interface FamilyLinkStepProps {
  /** A cél gyülekezet ID-ja (a wizard-tól érkezik) */
  congregationId: string
  congregationName: string
  /** Vissza az eredmény-step-re (ha a felhasználó mégse akarja az auto-link-et) */
  onBack: () => void
}

type Stage = 'idle' | 'previewing' | 'review' | 'applying' | 'done' | 'error'

export function FamilyLinkStep({ congregationId, congregationName, onBack }: FamilyLinkStepProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [mode, setMode] = useState<FamilyLinkMode>('conservative')
  const [preview, setPreview] = useState<FamilyLinkResponse | null>(null)
  const [appliedBatchId, setAppliedBatchId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ─── Indító elemzés (preview) — automatikusan fut belépéskor ────────
  const runPreview = useCallback(
    (selectedMode: FamilyLinkMode) => {
      setStage('previewing')
      startTransition(async () => {
        const result = await previewFamilyLinks(congregationId, selectedMode)
        if (result.error || !result.data) {
          // NE ragadjon be: a hiba-stage érthető üzenetet + újrapróbálás/kihagyás gombot ad.
          setErrorMsg(result.error || 'Sikertelen elemzés.')
          setStage('error')
          return
        }
        setErrorMsg(null)
        setPreview(result.data)
        setStage('review')
      })
    },
    [congregationId],
  )

  useEffect(() => {
    runPreview(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleModeChange = useCallback(
    (newMode: FamilyLinkMode) => {
      setMode(newMode)
      runPreview(newMode)
    },
    [runPreview],
  )

  // ─── Apply (commit) ────────────────────────────────────────────────
  const handleApply = useCallback(() => {
    setStage('applying')
    startTransition(async () => {
      const result = await applyFamilyLinks(congregationId, mode)
      if (result.error || !result.data) {
        toast.error(result.error || 'Sikertelen összeállítás.')
        setStage('review')
        return
      }
      setAppliedBatchId(result.data.batch_id)
      setStage('done')
      const s = result.data.summary
      const total = s.spouse_confirmed + s.child_confirmed
      toast.success(
        total > 0
          ? `Összeállítva: ${s.spouse_confirmed} házastárs + ${s.child_confirmed} gyerek hozzárendelve.`
          : 'A találatok már korábban be voltak vezetve.',
      )
    })
  }, [congregationId, mode])

  // ─── Revert ────────────────────────────────────────────────────────
  const handleRevert = useCallback(() => {
    if (!appliedBatchId) return
    if (!confirm('Biztos visszavonod a most végrehajtott összeállítást? A házastárs- és gyerek-rekordok törlődnek.')) {
      return
    }
    startTransition(async () => {
      const result = await revertFamilyLinkBatch(appliedBatchId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.revertedCount ?? 0} hozzárendelés visszavonva.`)
      setAppliedBatchId(null)
      setStage('idle')
      runPreview(mode)
    })
  }, [appliedBatchId, mode, runPreview])

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-6 ring-1 ring-emerald-200">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
            <Network className="size-7" />
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-slate-800 sm:text-2xl">
              Családszerkezet összeállítása
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              A rendszer megpróbálja automatikusan összekapcsolni a házastársakat és gyerekeket a
              <strong> {congregationName}</strong> gyülekezetben — cím-egyezés és
              szülő-név alapján.
            </p>
          </div>
        </div>
      </div>

      {/* Mode-választó */}
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-emerald-100 shadow-[0_18px_40px_-30px_rgba(15,118,110,0.25)]">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">
          Biztonságos összekapcsolás
        </p>
        <p className="mt-1 text-sm text-slate-500">
          A rendszer csak a biztos egyezéseket kapcsolja össze (cím + szülő-név direkt találat),
          így sosem ront el adatot. A bizonytalan eseteket kézzel, utólag rendezheted a
          tagnyilvántartáson.
        </p>
        <div className="mt-3">
          <ModeOption
            mode="conservative"
            active={mode === 'conservative'}
            onSelect={handleModeChange}
            title="Konzervatív egyeztetés"
            desc="Csak biztos egyezések — cím + szülő-név direkt találat. Sose ront el adatot."
          />
        </div>
      </div>

      {/* Loading */}
      {(stage === 'previewing' || isPending) && stage !== 'review' && stage !== 'done' && (
        <div className="rounded-2xl bg-white/85 p-8 text-center ring-1 ring-slate-100">
          <Loader2 className="mx-auto size-8 animate-spin text-emerald-600" />
          <p className="mt-2 text-sm text-slate-600">
            {stage === 'previewing' ? 'Elemzés folyamatban…' : 'Folyamat alatt…'}
          </p>
        </div>
      )}

      {/* Hiba — SOSE ragad be: érthető üzenet + újrapróbálás / kihagyás */}
      {stage === 'error' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-amber-500" />
          <p className="mt-2 font-semibold text-slate-800">A családszerkezet-elemzés nem sikerült</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-slate-600">
            {errorMsg || 'Ismeretlen hiba.'} Nagy gyülekezetnél ez időtúllépés is lehet — próbáld
            újra, vagy hagyd ki ezt a lépést. A <strong>személyek és családfők ettől függetlenül
            beimportálódtak</strong>, a családszerkezetet később kézzel is összeállíthatod.
          </p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={() => runPreview(mode)}
              disabled={isPending}
              className="min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700"
            >
              {isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Újrapróbálom
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isPending}
              className="min-h-11 rounded-xl"
            >
              Kihagyom ezt a lépést
            </Button>
          </div>
        </div>
      )}

      {/* Review (preview eredmény) */}
      {stage === 'review' && preview && (
        <PreviewReview
          preview={preview}
          onApply={handleApply}
          onBack={onBack}
          isPending={isPending}
        />
      )}

      {/* Done */}
      {stage === 'done' && preview && (
        <DoneSummary
          preview={preview}
          batchId={appliedBatchId}
          onRevert={handleRevert}
          onClose={onBack}
          isPending={isPending}
        />
      )}
    </div>
  )
}

// ─── Sub-komponensek ──────────────────────────────────────────────────

function ModeOption({
  mode,
  active,
  onSelect,
  title,
  desc,
  disabled = false,
}: {
  mode: FamilyLinkMode
  active: boolean
  onSelect: (mode: FamilyLinkMode) => void
  title: string
  desc: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect(mode)}
      disabled={disabled}
      className={`rounded-2xl border p-3 text-left transition ${
        active
          ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_20px_-14px_rgba(5,150,105,0.5)]'
          : disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-50/50 opacity-60'
            : 'border-slate-200 bg-white/85 hover:border-emerald-200 hover:bg-emerald-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-sm font-semibold ${active ? 'text-emerald-700' : 'text-slate-800'}`}>
          {title}
        </p>
        {active && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
    </button>
  )
}

function PreviewReview({
  preview,
  onApply,
  onBack,
  isPending,
}: {
  preview: FamilyLinkResponse
  onApply: () => void
  onBack: () => void
  isPending: boolean
}) {
  const s = preview.summary
  const totalConfirmed = s.spouse_confirmed + s.child_confirmed
  const hasUncertain = s.spouse_uncertain + s.child_uncertain > 0
  const hasFloating = s.floating > 0

  return (
    <>
      {/* Stat-kártyák */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Biztos házastárs"
          value={s.spouse_confirmed}
          tone="emerald"
          icon={<Heart className="size-4" />}
        />
        <SummaryCard
          label="Biztos gyerek"
          value={s.child_confirmed}
          tone="emerald"
          icon={<Users className="size-4" />}
        />
        <SummaryCard
          label="Bizonytalan"
          value={s.spouse_uncertain + s.child_uncertain}
          tone={hasUncertain ? 'amber' : 'slate'}
          icon={<ShieldAlert className="size-4" />}
        />
        <SummaryCard
          label="Lebegő (család nélküli)"
          value={s.floating}
          tone={hasFloating ? 'sky' : 'slate'}
          icon={<Home className="size-4" />}
        />
      </div>

      {/* Részletes lista — collapsibles */}
      {preview.details.spouse_confirmed.length > 0 && (
        <DetailSection
          title={`Biztos házastárs-jelölések (${preview.details.spouse_confirmed.length})`}
          tone="emerald"
          icon={<Heart className="size-4 text-emerald-600" />}
        >
          {preview.details.spouse_confirmed.slice(0, 30).map((d) => (
            <div key={`${d.csalad_id}-${d.spouse_szemely_id}`} className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{d.head_name}</span>
              {' ↔ '}
              <span className="font-semibold text-emerald-700">{d.spouse_name}</span>
            </div>
          ))}
          {preview.details.spouse_confirmed.length > 30 && (
            <p className="mt-2 text-xs italic text-slate-400">
              … és további {preview.details.spouse_confirmed.length - 30} eset.
            </p>
          )}
        </DetailSection>
      )}

      {preview.details.child_confirmed.length > 0 && (
        <DetailSection
          title={`Biztos gyerek-jelölések (${preview.details.child_confirmed.length})`}
          tone="emerald"
          icon={<Users className="size-4 text-emerald-600" />}
        >
          {preview.details.child_confirmed.slice(0, 30).map((d) => (
            <div key={d.gyerek_szemely_id} className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">{d.name}</span>
              {' — '}
              {d.parent_role === 'apja' ? 'apja' : 'anyja'}:{' '}
              <span className="font-semibold text-emerald-700">{d.parent_name}</span>
            </div>
          ))}
          {preview.details.child_confirmed.length > 30 && (
            <p className="mt-2 text-xs italic text-slate-400">
              … és további {preview.details.child_confirmed.length - 30} eset.
            </p>
          )}
        </DetailSection>
      )}

      {preview.details.spouse_uncertain.length > 0 && (
        <DetailSection
          title={`Bizonytalan házastársak (${preview.details.spouse_uncertain.length})`}
          tone="amber"
          icon={<ShieldAlert className="size-4 text-amber-600" />}
          defaultOpen={false}
        >
          {preview.details.spouse_uncertain.map((d, i) => (
            <div key={i} className="text-xs text-amber-800">
              <span className="font-semibold">{d.head_name}</span> — {d.candidate_count} lehetséges
              jelölt: {d.reason}
            </div>
          ))}
        </DetailSection>
      )}

      {preview.details.child_uncertain.length > 0 && (
        <DetailSection
          title={`Bizonytalan gyerekek (${preview.details.child_uncertain.length})`}
          tone="amber"
          icon={<ShieldAlert className="size-4 text-amber-600" />}
          defaultOpen={false}
        >
          {preview.details.child_uncertain.slice(0, 30).map((d) => (
            <div key={d.szemely_id} className="text-xs text-amber-800">
              <span className="font-semibold">{d.name}</span>
              {d.apjaneve && <> — apja: {d.apjaneve}</>}
              {d.anyjaneve && <> — anyja: {d.anyjaneve}</>}
            </div>
          ))}
          {preview.details.child_uncertain.length > 30 && (
            <p className="mt-2 text-xs italic text-slate-400">
              … és további {preview.details.child_uncertain.length - 30} eset.
            </p>
          )}
        </DetailSection>
      )}

      {preview.details.floating.length > 0 && (
        <DetailSection
          title={`Család nélküli tagok — első ${preview.details.floating.length} (${s.floating} összesen)`}
          tone="sky"
          icon={<Home className="size-4 text-sky-600" />}
          defaultOpen={false}
        >
          {preview.details.floating.map((d) => (
            <div key={d.szemely_id} className="text-xs text-slate-600">
              <span className="font-semibold text-slate-800">
                {d.csaladnev} {d.k_nev}
              </span>
              {d.sz_datum && <span className="text-slate-400"> ({d.sz_datum})</span>}
              {d.c_szcim && <span className="text-slate-500"> — {d.c_szcim}</span>}
            </div>
          ))}
          <p className="mt-2 text-xs italic text-slate-500">
            A teljes lista a tagnyilvántartáson {'"'}Csak család nélküli tagok{'"'} szűrővel érhető el.
          </p>
        </DetailSection>
      )}

      {/* CTA */}
      <div className="rounded-[1.5rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-5 text-center ring-1 ring-emerald-100">
        <Sparkles className="mx-auto size-8 text-emerald-500" />
        <p className="mt-2 text-base font-semibold text-slate-800">
          {totalConfirmed > 0
            ? `Készen áll: ${totalConfirmed} biztos hozzárendelést alkalmazunk`
            : 'Nincs biztos hozzárendelés — nincs mit alkalmazni'}
        </p>
        {hasUncertain && (
          <p className="mt-1 text-sm text-amber-700">
            A bizonytalan eseteket NEM érintjük — a tagnyilvántartáson kézzel rendezheted őket.
          </p>
        )}
        <div className="mt-4 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-center">
          <Button type="button" variant="outline" onClick={onBack} className="rounded-full">
            Most nem
          </Button>
          <Button
            type="button"
            onClick={onApply}
            disabled={totalConfirmed === 0 || isPending}
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-base hover:bg-emerald-700"
            size="lg"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Összeállítás…
              </>
            ) : (
              <>
                <Network className="mr-2 size-5" />
                Biztos egyezések alkalmazása
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}

function DoneSummary({
  preview,
  batchId,
  onRevert,
  onClose,
  isPending,
}: {
  preview: FamilyLinkResponse
  batchId: string | null
  onRevert: () => void
  onClose: () => void
  isPending: boolean
}) {
  const s = preview.summary
  const total = s.spouse_confirmed + s.child_confirmed

  return (
    <div className="space-y-4">
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-50 to-teal-50 p-6 ring-1 ring-emerald-200">
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_18px_36px_-22px_rgba(5,150,105,0.55)]">
            <CheckCircle2 className="size-7" />
          </div>
          <div className="flex-1">
            <p className="font-serif text-xl text-slate-800 sm:text-2xl">Kész!</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {total} hozzárendelés sikeresen alkalmazva. {s.floating} tag továbbra is {'"'}lebegő{'"'}
              — ezeket a tagnyilvántartáson kézzel rendezheted.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Új házastárs" value={s.spouse_confirmed} tone="emerald" icon={<Heart className="size-4" />} />
        <SummaryCard label="Új gyerek-kapcsolat" value={s.child_confirmed} tone="emerald" icon={<Users className="size-4" />} />
        <SummaryCard label="Lebegő (kézi rendezés)" value={s.floating} tone="sky" icon={<Home className="size-4" />} />
      </div>

      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
        {batchId && (
          <Button
            type="button"
            variant="outline"
            onClick={onRevert}
            disabled={isPending}
            className="rounded-full text-rose-700 hover:bg-rose-50"
          >
            {isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Undo2 className="mr-1.5 size-4" />
            )}
            Visszavonás
          </Button>
        )}
        <Button
          type="button"
          onClick={onClose}
          className="rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          Kész
        </Button>
      </div>
    </div>
  )
}

function DetailSection({
  title,
  tone,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string
  tone: 'emerald' | 'amber' | 'sky'
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const toneClasses = {
    emerald: { ring: 'ring-emerald-100', bg: 'bg-emerald-50/30', title: 'text-emerald-700' },
    amber: { ring: 'ring-amber-100', bg: 'bg-amber-50/30', title: 'text-amber-800' },
    sky: { ring: 'ring-sky-100', bg: 'bg-sky-50/30', title: 'text-sky-700' },
  } as const
  const cls = toneClasses[tone]

  return (
    <div className={`overflow-hidden rounded-[1.5rem] bg-white/85 ring-1 ${cls.ring}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-slate-50/60"
      >
        <div className="flex items-center gap-2">
          {icon}
          <p className={`text-sm font-semibold ${cls.title}`}>{title}</p>
        </div>
        {expanded ? (
          <ChevronDown className="size-4 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className={`max-h-80 overflow-y-auto border-t ${cls.ring} ${cls.bg} px-4 py-3 space-y-1`}>
          {children}
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'sky'
  icon?: React.ReactNode
}) {
  const toneClasses = {
    emerald: 'bg-emerald-50/80 ring-emerald-100 text-emerald-700',
    amber: 'bg-amber-50/80 ring-amber-100 text-amber-700',
    slate: 'bg-slate-50/80 ring-slate-100 text-slate-700',
    sky: 'bg-sky-50/80 ring-sky-100 text-sky-700',
  } as const
  return (
    <div className={`rounded-2xl px-4 py-3 ring-1 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}

// AlertTriangle import marad, mert máshol is hivatkozik a komponens
export { AlertTriangle as _AlertTriangle }
