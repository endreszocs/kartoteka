'use client'

/**
 * MENTÉS-ELŐZMÉNY LISTA (2026-08-11).
 *
 * ⚠️ A ZÖLD PIPA A `drive_verified_at`-BŐL JÖN, NEM A `status`-BÓL.
 * Egy `status = 'ok'` sor, aminek nincs `drive_verified_at`-ja, itt
 * NARANCSSÁRGA („nem igazolt"), nem zöld. Ez a lista legfontosabb szabálya:
 * a felület nem mutathat sikert, amit nem tud bizonyítani.
 *
 * Mobilon kártya-nézet (44px érintőfelület), desktopon táblázat — az
 * `AdminTable` `renderMobileCard` mintája szerint.
 */

import { CalendarClock, ChevronRight, HardDriveDownload } from 'lucide-react'

import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable, type AdminTableColumn } from '@/components/admin/_shared/admin-table'
import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { formatBajt, type BackupLogRow } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

const COLUMNS: AdminTableColumn[] = [
  { key: 'nap', label: 'Nap' },
  { key: 'hatokor', label: 'Hatókör' },
  { key: 'allapot', label: 'Állapot' },
  { key: 'sorok', label: 'Sorok', align: 'right', className: 'tabular-nums', hideBelow: 'lg' },
  { key: 'meret', label: 'Méret', align: 'right', className: 'tabular-nums', hideBelow: 'lg' },
  { key: 'nyit', label: '', align: 'right', className: 'w-10' },
]

interface AllapotJelzes {
  intent: StatusIntent
  cimke: string
}

/** Az EGYETLEN hely, ahol az állapot vizuális jelentése eldől. */
export function allapotJelzes(sor: BackupLogRow): AllapotJelzes {
  if (sor.status === 'hiba') return { intent: 'danger', cimke: 'hiba' }
  if (sor.status === 'fut') return { intent: 'info', cimke: 'fut' }
  // status === 'ok' — de igazolás NÉLKÜL ez NEM siker.
  if (!sor.driveVerifiedAt) return { intent: 'warning', cimke: 'nem igazolt' }
  if (sor.prunedAt) return { intent: 'neutral', cimke: 'igazolt · nyesve' }
  return { intent: 'success', cimke: 'igazolt' }
}

function kindCimke(kind: BackupLogRow['kind']): string {
  return kind === 'napi' ? 'napi' : kind === 'kezi' ? 'kézi' : 'visszaállítás előtti'
}

function hatokorNev(sor: BackupLogRow): string {
  return sor.scope === 'globalis' ? 'Rendszerszintű (globális)' : (sor.congregationNev ?? 'Ismeretlen gyülekezet')
}

interface Props {
  rows: BackupLogRow[]
  loading: boolean
  onOpen: (sor: BackupLogRow) => void
}

export function BackupListTable({ rows, loading, onOpen }: Props) {
  return (
    <AdminTable<BackupLogRow>
      columns={COLUMNS}
      rows={rows}
      loading={loading}
      rowKey={(r) => String(r.id)}
      onRowClick={onOpen}
      minWidthClass="min-w-[640px]"
      empty={
        <AdminEmptyState
          icon={HardDriveDownload}
          title="Még nincs egyetlen mentési futás sem"
          hint="Ha a napi ütemezés be van állítva, holnap hajnalban itt kell megjelennie az első sornak. Ha most akarod kipróbálni, használd a „Mentés most” gombot."
        />
      }
      renderCell={(sor, key) => {
        const jelzes = allapotJelzes(sor)
        switch (key) {
          case 'nap':
            return (
              <div className="min-w-0">
                <p className="font-semibold tabular-nums text-foreground">{sor.runDate}</p>
                <p className="text-[11px] text-muted-foreground">{kindCimke(sor.kind)}</p>
              </div>
            )
          case 'hatokor':
            return <span className="block truncate text-foreground">{hatokorNev(sor)}</span>
          case 'allapot':
            return (
              <div className="flex flex-col items-start gap-1">
                <StatusBadge intent={jelzes.intent} dot>
                  {jelzes.cimke}
                </StatusBadge>
                {sor.status === 'hiba' && sor.failureStage ? (
                  <span className="text-[11px] text-destructive">{sor.failureStage}</span>
                ) : null}
              </div>
            )
          case 'sorok':
            return sor.totalRows.toLocaleString('hu-HU')
          case 'meret':
            return formatBajt(sor.ciphertextBytes)
          case 'nyit':
            return <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
          default:
            return null
        }
      }}
      renderMobileCard={(sor) => {
        const jelzes = allapotJelzes(sor)
        return (
          <button
            type="button"
            onClick={() => onOpen(sor)}
            aria-label={`${sor.runDate} — ${hatokorNev(sor)} mentésének részletei`}
            className="flex min-h-11 w-full items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition active:bg-muted/60"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <CalendarClock className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold tabular-nums text-foreground">{sor.runDate}</span>
                <StatusBadge intent={jelzes.intent} dot>
                  {jelzes.cimke}
                </StatusBadge>
              </div>
              <p className="mt-0.5 truncate text-sm text-foreground">{hatokorNev(sor)}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {kindCimke(sor.kind)} · {sor.totalRows.toLocaleString('hu-HU')} sor ·{' '}
                {formatBajt(sor.ciphertextBytes)}
              </p>
              {sor.status === 'hiba' && sor.failureMessage ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{sor.failureMessage}</p>
              ) : null}
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )
      }}
    />
  )
}
