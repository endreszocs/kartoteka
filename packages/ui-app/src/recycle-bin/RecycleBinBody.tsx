'use client'

/**
 * RecycleBinBody — a Kuka KÖZÖS megjelenítő rétege + művelet-hook
 * (2026-08-15, desktop-paritás 3. szelet).
 *
 * A webes `apps/web/components/shared/recycle-bin-view.tsx` teljes markupja
 * ide került, hogy a desktop Kuka NE tükör-másolatként szülessen (a repó
 * ismert hibaosztálya: „a második felület a régi implementációt őrzi").
 * A platform-függő részek props-injektálással érkeznek (ui-app szabály:
 * semmilyen platform-API import):
 *
 *   - ADAT: a web Dexie-ből (useLiveQuery, optimista sor + mutation-queue),
 *     a desktop direkt Supabase-lekérdezésből tölti a sorokat — a body csak
 *     kész, megjelenítendő sorokat kap (`rows`).
 *   - MŰVELETEK: a `useRecycleBinHandlers` hook fogja össze a megerősítő
 *     kérdéseket és a toast-szövegeket (ezek is KÖZÖSEK), a tényleges
 *     visszaállítás/törlés/ürítés platform-műveletként érkezik. A hook a
 *     HÍVÓBAN fut (nem a body-ban), hogy az `isPending`-et a web a pontos
 *     törlés-dátum lekérésének kapuzására is használhassa.
 *
 * A 2026-08-11-es (P1 #26) tanulság változatlanul érvényes: amíg BÁRMELYIK
 * tábla olvashatatlan (`failedTables`), a lista hiányos — ürítés tilos, és
 * üres-állapotot sem ígérünk.
 */

import { useTransition, type ReactNode } from 'react'
import {
  AlertTriangle,
  Clock,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  TrashIcon,
} from 'lucide-react'

import { Button } from '@kartoteka/ui'

import {
  deletedDateSuffix,
  purgeCountdownLabel,
  RECYCLE_BIN_RETENTION_DAYS,
} from './countdown'

// ─────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────

/** Egy megjelenítendő Kuka-sor — a platform adat-rétege állítja elő. */
export interface RecycleBinDisplayRow {
  table: string
  id: string | number
  displayLabel: string
  deletedAt: string | null
  /** PONTOS (deleted_at) vagy FELSŐ becslés (updated_at) — a felirat ehhez igazodik. */
  deletedAtIsExact: boolean
  daysUntilPurge: number | null
}

/** Egy tábla-csoport (fejléc-cím) a listában. */
export interface RecycleBinGroupDef {
  table: string
  label: string
}

export type RecycleBinToastKind = 'success' | 'error'

// ─────────────────────────────────────────────────────────────────
// useRecycleBinHandlers — közös megerősítés + toast + pending
// ─────────────────────────────────────────────────────────────────

export interface RecycleBinOperations {
  /** Egy sor visszaállítása — hibánál dobjon magyar üzenetű Error-t. */
  restore: (table: string, id: string | number) => Promise<void>
  /** Egy sor VÉGLEGES törlése — hibánál dobjon magyar üzenetű Error-t. */
  hardDelete: (table: string, id: string | number) => Promise<void>
  /** Ürítés: 0 = mindent, egyébként a legalább ennyi napja töröltek. */
  emptyBin: (olderThanDays: number) => Promise<{ count: number }>
  /** Siker/hiba kijelzése a gazda-felület eszközével (web: sonner; desktop: oldal-banner). */
  onToast: (message: string, kind: RecycleBinToastKind) => void
  /**
   * Amíg bármelyik tábla olvashatatlan, az ürítés TILOS (P1 #26): hiányos
   * listából soha ne induljon végleges törlés.
   */
  hasReadError: boolean
  /**
   * Sikeres visszaállítás üzenete. Web: „Visszaállítva. A szinkronizáció
   * elindult." (a Dexie-sor optimista, a push a háttérben fut); desktop:
   * a szerver-visszaigazolás utáni saját szövegét adja át.
   */
  restoreSuccessMessage: string
  /**
   * Sikeres művelet után (desktop: lista-újratöltés a szerverről; a webnek
   * nem kell — a Dexie live query magától frissül).
   */
  onChanged?: () => void
}

export interface RecycleBinHandlers {
  isPending: boolean
  handleRestore: (table: string, id: string | number) => void
  handleHardDelete: (table: string, id: string | number, label: string) => void
  handleEmptyBin: (olderThanDays: number | null) => void
}

export function useRecycleBinHandlers(ops: RecycleBinOperations): RecycleBinHandlers {
  const [isPending, startTransition] = useTransition()

  function handleRestore(table: string, id: string | number) {
    startTransition(async () => {
      try {
        await ops.restore(table, id)
        ops.onToast(ops.restoreSuccessMessage, 'success')
        ops.onChanged?.()
      } catch (e) {
        ops.onToast(
          e instanceof Error ? e.message : 'Visszaállítás sikertelen.',
          'error',
        )
      }
    })
  }

  function handleHardDelete(table: string, id: string | number, label: string) {
    if (
      !confirm(
        `⚠️ VÉGLEGES TÖRLÉS\n\nBiztosan véglegesen törlöd a következőt?\n\n  ${label}\n\nEzt a műveletet NEM lehet visszacsinálni!`,
      )
    ) {
      return
    }
    startTransition(async () => {
      try {
        await ops.hardDelete(table, id)
        ops.onToast('Véglegesen törölve.', 'success')
        ops.onChanged?.()
      } catch (e) {
        ops.onToast(e instanceof Error ? e.message : 'Törlés sikertelen.', 'error')
      }
    })
  }

  function handleEmptyBin(olderThanDays: number | null) {
    // 2026-08-11 (P1 #26): a gomb ilyenkor le van tiltva, de a kattintás-út
    // védelme itt is kell — hiányos listából soha ne induljon végleges törlés.
    if (ops.hasReadError) {
      ops.onToast(
        'A kuka most nem üríthető: van olyan modul, amelynek a tartalma nem olvasható ki. Frissítsd az oldalt, és próbáld újra.',
        'error',
      )
      return
    }
    const modifier = olderThanDays === null ? 'MINDENT' : `a 30+ napos sorokat`
    if (
      !confirm(
        `⚠️ KUKA ÜRÍTÉS\n\nBiztosan VÉGLEGESEN törlöd ${modifier}?\n\nEzt a műveletet NEM lehet visszacsinálni!`,
      )
    ) {
      return
    }
    startTransition(async () => {
      try {
        const { count } = await ops.emptyBin(olderThanDays ?? 0)
        ops.onToast(`${count} rekord véglegesen törölve.`, 'success')
        ops.onChanged?.()
      } catch (e) {
        ops.onToast(e instanceof Error ? e.message : 'Ürítés sikertelen.', 'error')
      }
    })
  }

  return { isPending, handleRestore, handleHardDelete, handleEmptyBin }
}

// ─────────────────────────────────────────────────────────────────
// RecycleBinBody — a lista megjelenítése (web ⇄ desktop azonos markup)
// ─────────────────────────────────────────────────────────────────

export interface RecycleBinBodyProps {
  /** Fejléc-cím (pl. „Minden modul"). */
  moduleLabel: string
  /** Vissza-link/gomb — platformonként más (web: <a>, desktop: router-link). */
  backSlot?: ReactNode
  /** Tábla-csoportok a fejléc-címekkel (a sorrend a megjelenítési sorrend). */
  groups: RecycleBinGroupDef[]
  /** Megjelenítendő sorok; `undefined` = még tölt. */
  rows: RecycleBinDisplayRow[] | undefined
  /** Olvashatatlan táblák CÍMEI — figyelmeztető sáv + ürítés-tiltás (P1 #26). */
  failedTables: string[]
  /** A useRecycleBinHandlers hook kimenete. */
  handlers: RecycleBinHandlers
}

export function RecycleBinBody({
  moduleLabel,
  backSlot,
  groups,
  rows,
  failedTables,
  handlers,
}: RecycleBinBodyProps) {
  const { isPending, handleRestore, handleHardDelete, handleEmptyBin } = handlers
  const hasReadError = failedTables.length > 0

  const displayRows = rows ?? []
  const totalCount = displayRows.length
  const expiringCount = displayRows.filter(
    d => d.daysUntilPurge !== null && d.daysUntilPurge <= 3,
  ).length

  // Csoportosítás tábla szerint
  const groupedByTable = new Map<string, RecycleBinDisplayRow[]>()
  for (const r of displayRows) {
    const arr = groupedByTable.get(r.table)
    if (arr) arr.push(r)
    else groupedByTable.set(r.table, [r])
  }

  return (
    <div className="space-y-5">
      {/* Hero + vissza gomb */}
      <div className="card-raised overflow-hidden">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <TrashIcon className="h-5 w-5 text-red-600" />
            <h2 className="font-heading text-lg text-slate-800">
              {moduleLabel} · Kuka
            </h2>
          </div>
          {backSlot}
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm">
              <div className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                {totalCount} rekord a kukában
              </div>
              {expiringCount > 0 && (
                <div className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {expiringCount} hamar törlődik véglegesen
                </div>
              )}
            </div>
            {totalCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {/* 2026-08-11 (P1 #26): amíg egy modul tartalma nem olvasható,
                    az ürítés TILOS — a lista hiányos, az ürítés viszont végleges. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() =>
                    handleEmptyBin(RECYCLE_BIN_RETENTION_DAYS)
                  }
                  disabled={isPending || hasReadError}
                  title={hasReadError ? 'Amíg egy modul tartalma nem olvasható, az ürítés le van tiltva.' : undefined}
                >
                  <Clock className="mr-1 h-3.5 w-3.5" />
                  {RECYCLE_BIN_RETENTION_DAYS}+ napos sorok ürítése
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => handleEmptyBin(null)}
                  disabled={isPending || hasReadError}
                  title={hasReadError ? 'Amíg egy modul tartalma nem olvasható, az ürítés le van tiltva.' : undefined}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Teljes kuka ürítése
                </Button>
              </div>
            )}
          </div>

          {/* 2026-08-11 (P1 #26): figyelmeztető sáv az olvashatatlan modulokról.
              A lelkész sose gondolja azt, hogy a törölt adat elveszett, ha csak a
              helyi olvasás bukott el. */}
          {hasReadError && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-start sm:gap-3 sm:text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 sm:mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">
                  {failedTables.length} adatcsoport tartalma most nem olvasható ki:{' '}
                  {failedTables.join(', ')}
                </p>
                <p className="leading-relaxed">
                  A törölt rekordok <strong>NEM vesztek el</strong> — csak ez a lista
                  hiányos. Frissítsd az oldalt; ha újra ez jelenik meg, zárd be és nyisd
                  meg újra az alkalmazást, vagy jelezd a rendszergazdának. Amíg ez a
                  figyelmeztetés látszik, a kuka ürítése le van tiltva.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-700">
            <Info className="mr-1 inline h-3.5 w-3.5 text-slate-500" />
            A törölt rekordok <strong>{RECYCLE_BIN_RETENTION_DAYS} napig</strong>{' '}
            itt maradnak. Ez idő alatt visszaállíthatók. Utána a szerver
            automatikusan véglegesen törli őket.
          </div>

        </div>
      </div>

      {/* Üres állapot — csak akkor, ha MINDEN tábla olvasása sikerült
          (2026-08-11, P1 #26: enélkül az olvasási hiba „a kuka üres"-ként hazudott). */}
      {totalCount === 0 && rows !== undefined && !hasReadError && (
        <div className="card-raised p-10 text-center">
          <TrashIcon className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 font-heading text-lg text-slate-600">
            A kuka üres
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Nincs törölt rekord ebben a modulban.
          </p>
        </div>
      )}

      {/* Loading */}
      {rows === undefined && (
        <div className="card-raised p-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">Betöltés...</p>
        </div>
      )}

      {/* Csoportok táblánként */}
      {totalCount > 0 &&
        groups.map(tblConfig => {
          const groupRows = groupedByTable.get(tblConfig.table)
          if (!groupRows || groupRows.length === 0) return null

          return (
            <div
              key={tblConfig.table}
              className="card-raised overflow-hidden"
            >
              <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <h3 className="font-heading text-base text-slate-800">
                  {tblConfig.label}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    ({groupRows.length})
                  </span>
                </h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {groupRows.map(row => (
                  <RecycleBinRowItem
                    key={`${row.table}:${row.id}`}
                    row={row}
                    onRestore={() => handleRestore(row.table, row.id)}
                    onHardDelete={() =>
                      handleHardDelete(row.table, row.id, row.displayLabel)
                    }
                    disabled={isPending}
                  />
                ))}
              </ul>
            </div>
          )
        })}
    </div>
  )
}

function RecycleBinRowItem({
  row,
  onRestore,
  onHardDelete,
  disabled,
}: {
  row: RecycleBinDisplayRow
  onRestore: () => void
  onHardDelete: () => void
  disabled: boolean
}) {
  const deletedDate = row.deletedAt
    ? new Date(row.deletedAt).toLocaleDateString('hu-HU')
    : 'ismeretlen'
  const isExpiring =
    row.daysUntilPurge !== null && row.daysUntilPurge <= 3
  const countdown = purgeCountdownLabel(
    row.daysUntilPurge,
    row.deletedAtIsExact,
  )

  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {row.displayLabel}
        </p>
        {/* 2026-08-14 (2. ütem): ha a szerver megmondta a PONTOS deleted_at-ot
            (a kuka-deleted-at migráció triggere bélyegzi), azt írjuk; amíg a
            migráció nincs élesben, az updated_at-alapú FELSŐ becslés marad,
            „legfeljebb N nap"-pal — nem ígérünk pontosságot, amink nincs. */}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
          <span>
            <Clock className="mr-0.5 inline h-3 w-3" />
            Törölve: {deletedDate}
            {deletedDateSuffix(row.deletedAtIsExact)}
          </span>
          {countdown !== null && (
            <span
              className={
                isExpiring
                  ? 'font-semibold text-red-600'
                  : 'text-slate-500'
              }
            >
              {countdown}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          onClick={onRestore}
          disabled={disabled}
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Visszaállítás
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-lg border-red-300 text-red-700 hover:bg-red-50"
          onClick={onHardDelete}
          disabled={disabled}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Végleges
        </Button>
      </div>
    </li>
  )
}
