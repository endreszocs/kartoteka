'use client'

import { useMemo, useTransition } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeftCircle,
  Clock,
  Info,
  Loader2,
  RotateCcw,
  Trash2,
  TrashIcon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  emptyBin,
  hardDelete,
  listDeletedRecords,
  RECYCLE_BIN_RETENTION_DAYS,
  restoreRecord,
  type DeletedRecordSummary,
} from '@/lib/offline/recycle-bin-actions'
import { buildRecycleBinLabel } from '@/lib/offline/recycle-bin-labels'

/**
 * Recycle Bin View — reusable Kuka oldal minden modulhoz.
 *
 * A modul oldaláról navigálsz ide, pl. /szemelyek/kuka.
 *
 * A komponens:
 *  1. Listázza a soft-deleted rekordokat táblánként (accordion)
 *  2. Minden soron: "Visszaállít" + "Végleges törlés" gomb
 *  3. Globális "Kuka ürítése" (csak a 30+ napos sorokra) gomb
 *  4. Figyelmezteti a user-t a retention szabályra (30 nap)
 *
 * Props:
 *  - `module`: modul kulcs (pl. 'tagnyilvantartas')
 *  - `tables`: a modul táblái (registry-ből)
 *  - `labelBuilder`: opcionális ember-olvasható label generator táblánként
 *  - `congregationId`: scope
 *  - `backHref`: visszanavigáló link (pl. `/szemelyek`)
 *  - `accentColor`: header szín (Tailwind color név, pl. 'emerald' vagy 'teal')
 */

// 2026-08-14 (6. pont, BLOKKOLÓ-javítás): a config SZÁNDÉKOSAN csak sima
// adat (string mezők) — függvény NEM lehet benne. Korábban a Server Component
// oldal (`kuka/page.tsx`) egy labelBuilder FÜGGVÉNYT adott át propként, amit a
// Next.js nem tud szerializálni a Server→Client határon, ezért a Kuka oldal
// MINDEN betöltésnél kivétellel elszállt. A címkézőt mostantól ITT, a kliens
// oldalon állítjuk elő a tábla nevéből (buildRecycleBinLabel tiszta függvény).
export interface RecycleBinTableConfig {
  dexieTable: string
  label: string
}

export function RecycleBinView({
  tables,
  congregationId,
  backHref,
  backLabel,
  moduleLabel,
}: {
  tables: RecycleBinTableConfig[]
  congregationId: string | null
  backHref: string
  backLabel: string
  moduleLabel: string
}) {
  const [isPending, startTransition] = useTransition()

  // Minden tábla soft-deleted rekordjai, reaktívan a Dexie-ből.
  //
  // 2026-08-11 (P1 #26): a táblánkénti hibát korábban CSAK egy `console.error`
  // kapta el. Ha egy (vagy minden) tábla olvasása elbukott — Dexie séma-eltérés
  // verzióváltás után, blokkolt IndexedDB privát ablakban, korrupt store —, a
  // lista üresen jött vissza, és a komponens a megnyugtató „A kuka üres"
  // üres-állapotot rajzolta ki. A lelkész ebből azt olvasta ki, hogy a véletlenül
  // törölt adat VÉGLEG elveszett, pedig csak nem volt kiolvasható — miközben a
  // 30 napos megőrzés a háttérben lejárt. Ezért a hibás táblákat gyűjtjük, és a
  // hívó fél (lásd lentebb) figyelmeztető sávot mutat + letiltja az ürítést.
  const binState = useLiveQuery(async () => {
    const records: DeletedRecordSummary[] = []
    const failedTables: string[] = []
    if (!congregationId) return { records, failedTables }
    for (const t of tables) {
      try {
        const rows = await listDeletedRecords(t.dexieTable, congregationId, {
          // A címkéző a KLIENSEN épül a tábla nevéből — függvény nem jöhet
          // át a Server Component határon (lásd a RecycleBinTableConfig kommentjét).
          labelBuilder: buildRecycleBinLabel(t.dexieTable),
          limit: 500,
        })
        records.push(...rows)
      } catch (e) {
        console.error('[kuka listDeletedRecords]', t.dexieTable, e)
        failedTables.push(t.label)
      }
    }
    return { records, failedTables }
  }, [congregationId, tables])

  const allDeleted = binState?.records
  const failedTables = binState?.failedTables ?? []
  // Amíg BÁRMELYIK tábla olvashatatlan, a lista hiányos: ürítni tilos (az
  // ürítés végleges), és üres-állapotot sem szabad ígérni.
  const hasReadError = failedTables.length > 0

  // Csoportosítás tábla szerint
  const groupedByTable = useMemo(() => {
    const map = new Map<string, DeletedRecordSummary[]>()
    for (const r of allDeleted || []) {
      const arr = map.get(r.table)
      if (arr) arr.push(r)
      else map.set(r.table, [r])
    }
    return map
  }, [allDeleted])

  const totalCount = allDeleted?.length || 0
  const expiringCount =
    allDeleted?.filter(
      d => d.daysUntilPurge !== null && d.daysUntilPurge <= 3,
    ).length || 0

  function handleRestore(table: string, id: string | number) {
    startTransition(async () => {
      try {
        await restoreRecord(table, id)
        toast.success('Visszaállítva. A szinkronizáció elindult.')
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : 'Visszaállítás sikertelen.',
        )
      }
    })
  }

  function handleHardDelete(
    table: string,
    id: string | number,
    label: string,
  ) {
    if (
      !confirm(
        `⚠️ VÉGLEGES TÖRLÉS\n\nBiztosan véglegesen törlöd a következőt?\n\n  ${label}\n\nEzt a műveletet NEM lehet visszacsinálni!`,
      )
    ) {
      return
    }
    startTransition(async () => {
      try {
        await hardDelete(table, id)
        toast.success('Véglegesen törölve.')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Törlés sikertelen.')
      }
    })
  }

  function handleEmptyBin(olderThanDays: number | null) {
    // 2026-08-11 (P1 #26): a gomb ilyenkor le van tiltva, de a kattintás-út
    // védelme itt is kell — hiányos listából soha ne induljon végleges törlés.
    if (hasReadError) {
      toast.error(
        'A kuka most nem üríthető: van olyan modul, amelynek a tartalma nem olvasható ki. Frissítsd az oldalt, és próbáld újra.',
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
        let total = 0
        for (const t of tables) {
          const { count } = await emptyBin(t.dexieTable, congregationId, {
            olderThanDays: olderThanDays ?? 0,
          })
          total += count
        }
        toast.success(`${total} rekord véglegesen törölve.`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Ürítés sikertelen.')
      }
    })
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
          <a
            href={backHref}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeftCircle className="h-3.5 w-3.5" />
            {backLabel}
          </a>
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
      {totalCount === 0 && allDeleted !== undefined && !hasReadError && (
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
      {allDeleted === undefined && (
        <div className="card-raised p-10 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">Betöltés...</p>
        </div>
      )}

      {/* Csoportok táblánként */}
      {totalCount > 0 &&
        tables.map(tblConfig => {
          const rows = groupedByTable.get(tblConfig.dexieTable)
          if (!rows || rows.length === 0) return null

          return (
            <div
              key={tblConfig.dexieTable}
              className="card-raised overflow-hidden"
            >
              <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                <h3 className="font-heading text-base text-slate-800">
                  {tblConfig.label}{' '}
                  <span className="text-sm font-normal text-slate-500">
                    ({rows.length})
                  </span>
                </h3>
              </div>
              <ul className="divide-y divide-slate-100">
                {rows.map(row => (
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
  row: DeletedRecordSummary
  onRestore: () => void
  onHardDelete: () => void
  disabled: boolean
}) {
  const deletedDate = row.deletedAt
    ? new Date(row.deletedAt).toLocaleDateString('hu-HU')
    : 'ismeretlen'
  const isExpiring =
    row.daysUntilPurge !== null && row.daysUntilPurge <= 3

  return (
    <li className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {row.displayLabel}
        </p>
        {/* 2026-08-14: a dátum az updated_at — a tábláknak ma nincs deleted_at
            oszlopa, ezért a törlés PONTOS időpontját nem ismerjük, csak a
            legutolsó módosításét (ami legfeljebb a törlés napja). A felirat
            ezért „legfeljebb N nap"-ot mond — nem ígérünk pontosságot, amink
            nincs. */}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
          <span>
            <Clock className="mr-0.5 inline h-3 w-3" />
            Törölve: {deletedDate} (a legutóbbi módosítás napja)
          </span>
          {row.daysUntilPurge !== null && (
            <span
              className={
                isExpiring
                  ? 'font-semibold text-red-600'
                  : 'text-slate-500'
              }
            >
              {row.daysUntilPurge === 0
                ? 'Bármikor törlődhet véglegesen!'
                : `legfeljebb ${row.daysUntilPurge} nap múlva törlődik véglegesen`}
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
