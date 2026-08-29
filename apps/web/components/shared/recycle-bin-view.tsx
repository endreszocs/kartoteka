'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftCircle } from 'lucide-react'
import { toast } from 'sonner'

import {
  RecycleBinBody,
  useRecycleBinHandlers,
  type RecycleBinToastKind,
} from '@kartoteka/ui-app'

import { fetchExactDeletedAt } from '@/app/(dashboard)/kuka/actions'
import {
  emptyBin,
  hardDelete,
  listDeletedRecords,
  restoreRecord,
  type DeletedRecordSummary,
} from '@/lib/offline/recycle-bin-actions'
import { exactKey, purgeCountdownDays, retentionDaysFor } from '@/lib/offline/recycle-bin-countdown'
import { buildRecycleBinLabel } from '@/lib/offline/recycle-bin-labels'

/**
 * Recycle Bin View — reusable Kuka oldal minden modulhoz (WEB adat-réteg).
 *
 * 2026-08-15 (desktop-paritás 3. szelet): a teljes megjelenítés + a
 * megerősítő/toast-logika a KÖZÖS `RecycleBinBody` + `useRecycleBinHandlers`
 * rétegbe került (`packages/ui-app/src/recycle-bin/`) — a desktop Kuka
 * ugyanazt a felületet kapja. Ebben a fájlban CSAK a webes adat-réteg maradt:
 *
 *  1. Dexie live query (a sync-orchestrator soft-delete-jei azonnal látszanak)
 *  2. A PONTOS törlés-dátumok fail-soft szerver-lekérése (fetchExactDeletedAt)
 *  3. A Dexie + mutation-queue alapú műveletek (restore/hardDelete/emptyBin)
 *
 * A modul oldaláról navigálsz ide, pl. /kuka.
 */

// 2026-08-14 (6. pont, BLOKKOLÓ-javítás): a config SZÁNDÉKOSAN csak sima
// adat (string mezők) — függvény NEM lehet benne. Korábban a Server Component
// oldal (`kuka/page.tsx`) egy labelBuilder FÜGGVÉNYT adott át propként, amit a
// Next.js nem tud szerializálni a Server→Client határon, ezért a Kuka oldal
// MINDEN betöltésnél kivétellel elszállt. A címkézőt mostantól a kliens
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
  // Minden tábla soft-deleted rekordjai, reaktívan a Dexie-ből.
  //
  // 2026-08-11 (P1 #26): a táblánkénti hibát korábban CSAK egy `console.error`
  // kapta el. Ha egy (vagy minden) tábla olvasása elbukott — Dexie séma-eltérés
  // verzióváltás után, blokkolt IndexedDB privát ablakban, korrupt store —, a
  // lista üresen jött vissza, és a komponens a megnyugtató „A kuka üres"
  // üres-állapotot rajzolta ki. A lelkész ebből azt olvasta ki, hogy a véletlenül
  // törölt adat VÉGLEG elveszett, pedig csak nem volt kiolvasható — miközben a
  // 30 napos megőrzés a háttérben lejárt. Ezért a hibás táblákat gyűjtjük, és a
  // közös body figyelmeztető sávot mutat + letiltja az ürítést.
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

  // 2026-08-14 (6. pont 2. ütem): a PONTOS törlés-dátumok a szerverről.
  // A helyi (Dexie) másolat nem hordozza a deleted_at-ot — a sync explicit
  // select-listáiba a migráció élesítése előtt nem tehető be —, ezért egy
  // fail-soft akcióval kérdezzük le. Ha az oszlop még nincs élesben, üres
  // térkép jön vissza, és marad a „legfeljebb N nap" becslés.
  const [exactMap, setExactMap] = useState<Record<string, string>>({})

  // A közös művelet-hook: megerősítő kérdések + toast-szövegek EGY helyen
  // (web ⇄ desktop azonos). A tényleges műveletek itt a Dexie + mutation-queue
  // útján futnak; az `onChanged` szándékosan üres — a live query magától frissül.
  const handlers = useRecycleBinHandlers({
    restore: (table, id) => restoreRecord(table, id),
    hardDelete: (table, id) => hardDelete(table, id),
    emptyBin: async olderThanDays => {
      let total = 0
      for (const t of tables) {
        const { count } = await emptyBin(t.dexieTable, congregationId, {
          olderThanDays,
          // A küszöb a PONTOS szerver-dátumból dőljön el, ahol ismert —
          // különben a gomb kevesebbet törölne, mint amit a sorokon
          // mutatott pontos visszaszámláló ígér.
          exactDeletedAt: exactMap,
        })
        total += count
      }
      return { count: total }
    },
    onToast: (message: string, kind: RecycleBinToastKind) => {
      if (kind === 'success') toast.success(message)
      else toast.error(message)
    },
    hasReadError,
    restoreSuccessMessage: 'Visszaállítva. A szinkronizáció elindult.',
  })
  const { isPending } = handlers

  const idsSignature = useMemo(
    () =>
      (allDeleted ?? [])
        .map(r => exactKey(r.table, r.id))
        .sort()
        .join(','),
    [allDeleted],
  )
  useEffect(() => {
    if (!idsSignature) {
      setExactMap({})
      return
    }
    // Ürítés/visszaállítás közben a Dexie live query kötegenként újraszámol,
    // és a signature sokszor változna — művelet alatt nem indítunk kérést,
    // a befejezés után (isPending → false) egyszer frissítünk.
    if (isPending) return
    let cancelled = false
    const byTable = new Map<string, Array<string | number>>()
    for (const r of allDeleted ?? []) {
      const arr = byTable.get(r.table)
      if (arr) arr.push(r.id)
      else byTable.set(r.table, [r.id])
    }
    fetchExactDeletedAt(
      [...byTable.entries()].map(([table, ids]) => ({ table, ids })),
    )
      .then(map => {
        if (!cancelled) setExactMap(map)
      })
      .catch(e => console.warn('[kuka exact deleted_at]', e))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsSignature, isPending])

  // A megjelenített sorok: ahol van pontos szerver-dátum, az felülírja a
  // helyi becslést (dátum + visszaszámláló + „pontos" jelleg).
  const displayRows = useMemo(() => {
    const now = Date.now()
    return (allDeleted ?? []).map(r => {
      const exact = exactMap[exactKey(r.table, r.id)]
      if (!exact || r.deletedAtIsExact) return r
      return {
        ...r,
        deletedAt: exact,
        deletedAtIsExact: true,
        daysUntilPurge: purgeCountdownDays(exact, now, retentionDaysFor(r.table)),
      }
    })
  }, [allDeleted, exactMap])

  return (
    <RecycleBinBody
      moduleLabel={moduleLabel}
      backSlot={
        <a
          href={backHref}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeftCircle className="h-3.5 w-3.5" />
          {backLabel}
        </a>
      }
      groups={tables.map(t => ({ table: t.dexieTable, label: t.label }))}
      rows={allDeleted === undefined ? undefined : displayRows}
      failedTables={failedTables}
      handlers={handlers}
    />
  )
}
