/**
 * excel-write-sync — E3 háttér-worker (2026-06-11).
 *
 * Az `excel_outbox` várólista EGYETLEN fogyasztója; az összes Excel-fájl-írás
 * kizárólagos tulajdonosa. A `befizetes-write-sync.ts` mintáját követi
 * (singleton inFlight guard, 30 mp poll, online/manual trigger), de a
 * feldolgozás SZIGORÚAN EGYESÉVEL megy (a Rust-oldali backup + teljes-fájl
 * újraírás + atomikus rename nem konkurencia-biztos), `created_at` sorrendben
 * (a belső-mozgás két oldala együtt érkezik).
 *
 * Idempotencia: a worker MINDEN Rust-hívás előtt `hasExcelRowMap`-et néz, és
 * sikeres append után AZONNAL `insertExcelRowMap`-et ír — crash után a retry
 * így sosem duplázhat sort a hivatalos könyvben.
 *
 * Hiba-osztályok:
 *   - VÁRAKOZÓ (sosem 'blocked', látható ok, magától feloldódik):
 *       · az Excel-fájl nyitva van (zárolt) → „zárd be, magától bekerül"
 *       · bank–betű párosítás nincs megerősítve
 *       · kategória-név még nem szinkronizálódott
 *   - EGYÉB: exp-backoff retry; MAX_RETRY után 'blocked' (kézi újrapróbálás a
 *     Beállítások → Könyvelés panelről).
 */

import { buildBankBankExcelRows, buildTransferExcelRows, type ExcelKasszaRow } from '@kartoteka/core'

import { excelAppendRows } from './excel'
import { excelKartotekaOsszevetes } from './excel-egyeztetes'
import {
  getConfirmedLetterForBankId,
  getConfirmedLetterForBankName,
  getExcelAdatokPath,
  isExcelSyncEnabled,
} from './excel-settings'
import { getTauriSqliteBackend } from './tauri-sqlite-backend'

const MAX_RETRY = 8

const BACKOFF_MS_BY_RETRY: Record<number, number> = {
  0: 0,
  1: 30_000,
  2: 60_000,
  3: 120_000,
  4: 300_000,
}
const BACKOFF_MAX_MS = 300_000

type WaitClass = 'locked' | 'mapping' | 'name'

function classifyError(message: string): WaitClass | 'other' {
  if (/os error 32|os error 5|denied|sharing|being used|megnyitva|hozzáférés/i.test(message)) {
    return 'locked'
  }
  return 'other'
}

function shouldSkipByBackoff(item: {
  retry_count: number
  last_attempt_at: string | null
  last_error: string | null
}): boolean {
  if (item.retry_count === 0 || !item.last_attempt_at) return false
  // Várakozó-osztályú hibáknál minden futáskor újrapróbálunk (olcsó művelet).
  if (item.last_error && /\[várakozik\]/.test(item.last_error)) return false
  const lastMs = Date.parse(item.last_attempt_at)
  if (!Number.isFinite(lastMs)) return false
  const backoff = BACKOFF_MS_BY_RETRY[item.retry_count] ?? BACKOFF_MAX_MS
  return Date.now() - lastMs < backoff
}

interface OutboxItem {
  id: number
  op: 'append' | 'reversal'
  identity_key: string
  side: string
  target_sheet: string
  payload_json: string
  congregation_id: string
  ev: number
  retry_count: number
  last_attempt_at: string | null
  last_error: string | null
}

interface ParsedPayload {
  row?: ExcelKasszaRow | null
  celResolve?: { kind: 'bev' | 'kiad'; celId: number }
  transfer?: {
    tipus: 'kassza_bank' | 'bank_kassza' | 'bank_bank'
    datum: string
    belsomozgasId: number
    osszeg: number
    megjegyzes: string | null
    /** bank_bank: a forrás- és cél-számla neve (a párosítás-feloldáshoz). */
    forrasBankName?: string
    celBankName?: string
  }
  transferSide?: 'kassza' | 'bank' | 'bank-forras' | 'bank-cel'
  bankName?: string
}

export interface ExcelWriteSyncResult {
  attempted: number
  written: number
  waiting: number
  blocked: number
  errors: string[]
}

let inFlight = false
let pusherInterval: ReturnType<typeof setInterval> | null = null
let onlineListenerAttached = false
let lastRunAt: string | null = null
let lastResult: ExcelWriteSyncResult | null = null
let lastNote: string | null = null

export interface ExcelWriteSyncStatus {
  running: boolean
  lastRunAt: string | null
  lastResult: ExcelWriteSyncResult | null
  /** Felhasználó-barát státusz-sor (pl. „Excel nyitva — 3 tétel várakozik"). */
  lastNote: string | null
}

export function getExcelWriteSyncStatus(): ExcelWriteSyncStatus {
  return { running: inFlight, lastRunAt, lastResult, lastNote }
}

/** Egy „várakozó" hibaüzenet — a backoff-kihagyás felismeri a tagjét. */
function waitMsg(kind: WaitClass, detail: string): string {
  return `[várakozik] ${detail}${kind === 'locked' ? '' : ''}`
}

/**
 * Egyszer lefut, a teljes pending sort feldolgozza (egyesével).
 * Nem dob — minden hiba a result-ba kerül.
 */
export async function pushPendingExcelRows(ignoreBackoff = false): Promise<ExcelWriteSyncResult> {
  const result: ExcelWriteSyncResult = {
    attempted: 0,
    written: 0,
    waiting: 0,
    blocked: 0,
    errors: [],
  }
  lastNote = null

  if (!isExcelSyncEnabled()) return result

  const backend = getTauriSqliteBackend()
  let items: OutboxItem[]
  try {
    items = (await backend.getPendingExcelRows(100)) as OutboxItem[]
  } catch (err) {
    result.errors.push(
      `Excel-outbox olvasási hiba: ${err instanceof Error ? err.message : 'ismeretlen'}`,
    )
    return result
  }
  if (items.length === 0) return result

  // Az Adatok_<év>.xlsx útvonala évenként eltérhet — évenként egyszer oldjuk fel.
  const adatokPathByYear = new Map<number, string | null>()
  async function adatokPathFor(ev: number): Promise<string | null> {
    if (!adatokPathByYear.has(ev)) {
      adatokPathByYear.set(ev, await getExcelAdatokPath(ev))
    }
    return adatokPathByYear.get(ev) ?? null
  }

  let lockedCount = 0

  for (const item of items) {
    if (!ignoreBackoff && shouldSkipByBackoff(item)) continue
    result.attempted += 1

    try {
      // 0) Crash-dedup: ha már bekerült, csak a könyvelést zárjuk le.
      if (await backend.hasExcelRowMap(item.identity_key, item.side)) {
        await backend.markExcelRowDone(item.id)
        continue
      }

      const filePath = await adatokPathFor(item.ev)
      if (!filePath) {
        await backend.updateExcelRowAttempt(
          item.id,
          waitMsg('mapping', `Nincs előkészített Könyvelés-mappa a(z) ${item.ev}. évre (Beállítások → Könyvelés).`),
        )
        result.waiting += 1
        lastNote = `Nincs előkészített Könyvelés-mappa (${item.ev}) — a tételek várakoznak.`
        continue
      }

      const payload = JSON.parse(item.payload_json) as ParsedPayload

      // 1) Cél-lap feloldása
      let sheet: string
      let row: ExcelKasszaRow | null = null

      if (payload.transfer && payload.transfer.tipus === 'bank_bank' && payload.transferSide) {
        // Bank → bank: MINDKÉT betűt fel kell oldani a megerősített párosításból.
        const forrasLetter = getConfirmedLetterForBankName(
          item.congregation_id,
          item.ev,
          payload.transfer.forrasBankName ?? '',
        )
        const celLetter = getConfirmedLetterForBankName(
          item.congregation_id,
          item.ev,
          payload.transfer.celBankName ?? '',
        )
        if (!forrasLetter || !celLetter) {
          await backend.updateExcelRowAttempt(
            item.id,
            waitMsg(
              'mapping',
              `A(z) „${payload.transfer.forrasBankName ?? '?'}" → „${payload.transfer.celBankName ?? '?'}" átvezetéshez mindkét bank betű-párosítása szükséges (Beállítások → Könyvelés).`,
            ),
          )
          result.waiting += 1
          lastNote = 'Bank–betű párosítás megerősítése szükséges — tételek várakoznak.'
          continue
        }
        const bbRows = buildBankBankExcelRows({
          datum: payload.transfer.datum,
          belsomozgasId: payload.transfer.belsomozgasId,
          osszeg: payload.transfer.osszeg,
          forrasLetter,
          celLetter,
          megjegyzes: payload.transfer.megjegyzes,
        })
        if (payload.transferSide === 'bank-forras') {
          sheet = bbRows.forrasSheet
          row = bbRows.forrasRow
        } else {
          sheet = bbRows.celSheet
          row = bbRows.celRow
        }
      } else if (payload.transfer && payload.transfer.tipus !== 'bank_bank' && payload.transferSide) {
        // Belső mozgás — a betű feloldása után a sor-párt ÚJRAÉPÍTJÜK a
        // hivatalos per-számla nevekkel (a payload a nyers adatokat őrzi).
        const letter = getConfirmedLetterForBankName(
          item.congregation_id,
          item.ev,
          payload.bankName ?? '',
        )
        if (!letter) {
          await backend.updateExcelRowAttempt(
            item.id,
            waitMsg(
              'mapping',
              `A(z) „${payload.bankName ?? '?'}" bank még nincs betű-laphoz párosítva/megerősítve (Beállítások → Könyvelés).`,
            ),
          )
          result.waiting += 1
          lastNote = 'Bank–betű párosítás megerősítése szükséges — tételek várakoznak.'
          continue
        }
        const rows = buildTransferExcelRows({
          tipus: payload.transfer.tipus,
          datum: payload.transfer.datum,
          belsomozgasId: payload.transfer.belsomozgasId,
          osszeg: payload.transfer.osszeg,
          bankLetter: letter,
          megjegyzes: payload.transfer.megjegyzes,
        })
        if (payload.transferSide === 'kassza') {
          sheet = 'Kassza'
          row = rows.kasszaRow
        } else {
          sheet = rows.bankSheet
          row = rows.bankRow
        }
      } else {
        if (!payload.row) {
          // Definíció szerint 'blocked'-ként jön be (bank_bank/valutacsere) —
          // ha mégis pending, zárjuk le érthető indokkal.
          await backend.markExcelRowBlocked(
            item.id,
            item.last_error ?? 'Ez a tétel-típus Excel-írásra még nem támogatott.',
          )
          result.blocked += 1
          continue
        }
        row = payload.row

        if (item.target_sheet === 'Kassza') {
          sheet = 'Kassza'
        } else if (item.target_sheet.startsWith('BANK:')) {
          const bankId = Number.parseInt(item.target_sheet.slice(5), 10)
          const letter = getConfirmedLetterForBankId(item.congregation_id, item.ev, bankId)
          if (!letter) {
            await backend.updateExcelRowAttempt(
              item.id,
              waitMsg(
                'mapping',
                'A bankszámla még nincs Excel betű-laphoz párosítva/megerősítve (Beállítások → Könyvelés).',
              ),
            )
            result.waiting += 1
            lastNote = 'Bank–betű párosítás megerősítése szükséges — tételek várakoznak.'
            continue
          }
          sheet = letter
        } else if (item.target_sheet.startsWith('BANKNAME:')) {
          const letter = getConfirmedLetterForBankName(
            item.congregation_id,
            item.ev,
            item.target_sheet.slice(9),
          )
          if (!letter) {
            await backend.updateExcelRowAttempt(
              item.id,
              waitMsg(
                'mapping',
                `A(z) „${item.target_sheet.slice(9)}" bank még nincs betű-laphoz párosítva/megerősítve (Beállítások → Könyvelés).`,
              ),
            )
            result.waiting += 1
            lastNote = 'Bank–betű párosítás megerősítése szükséges — tételek várakoznak.'
            continue
          }
          sheet = letter
        } else {
          sheet = item.target_sheet
        }

        // 2) Hiányzó kategória-név pótlása (offline-rögzítéskor még nem volt meg)
        if (payload.celResolve) {
          const needBev = payload.celResolve.kind === 'bev' && !row.bevKod
          const needKiad = payload.celResolve.kind === 'kiad' && !row.kiadKod
          if (needBev || needKiad) {
            const nev = await backend.resolveOfficialCategoryName(
              payload.celResolve.kind,
              payload.celResolve.celId,
            )
            if (!nev) {
              await backend.updateExcelRowAttempt(
                item.id,
                waitMsg(
                  'name',
                  'A kategória hivatalos neve még nem szinkronizálódott — csatlakozz egyszer a hálózatra.',
                ),
              )
              result.waiting += 1
              continue
            }
            if (needBev) row.bevKod = nev
            else row.kiadKod = nev
          }
        }
      }

      // 3) Tényleges írás — szigorúan EGY sor / hívás
      const report = await excelAppendRows(filePath, sheet, [row])

      // 4) Idempotencia-térkép AZONNAL, utána könyvelés-lezárás
      await backend.insertExcelRowMap({
        identityKey: item.identity_key,
        side: item.side,
        filePath,
        sheet,
        rowIndex: report.firstRow,
      })
      await backend.markExcelRowDone(item.id)
      result.written += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const cls = classifyError(message)
      try {
        if (cls === 'locked') {
          lockedCount += 1
          await backend.updateExcelRowAttempt(
            item.id,
            waitMsg('locked', 'Az Excel-fájl nyitva van — zárd be, és a tétel magától bekerül.'),
          )
          result.waiting += 1
        } else if (item.retry_count + 1 >= MAX_RETRY) {
          await backend.markExcelRowBlocked(
            item.id,
            `Többszöri próbálkozás után sem sikerült: ${message}`,
          )
          result.blocked += 1
        } else {
          await backend.updateExcelRowAttempt(item.id, message)
          result.errors.push(message)
        }
      } catch (innerErr) {
        result.errors.push(
          `Outbox-frissítés hiba: ${innerErr instanceof Error ? innerErr.message : 'ismeretlen'}`,
        )
      }
    }
  }

  if (lockedCount > 0) {
    lastNote = `Az Excel-fájl nyitva van — ${lockedCount} tétel várakozik. Zárd be a fájlt, és magától bekerülnek.`
  }

  // D12 (2026-08-28, Endre döntése): sikeres írás után — legfeljebb
  // félóránként — AUTOMATIKUS Excel ↔ Kartotéka összevetés. Ez az EGYETLEN
  // jelzés, ami a webes rögzítés Excel-kimaradását is megmutatja; eltérésnél
  // a shell figyelmeztető sávot kap. Best-effort: a hibája nem állítja meg
  // a syncet.
  if (result.written > 0 && items.length > 0) {
    void autoEgyeztetes(items[0].congregation_id, items[0].ev, adatokPathFor)
  }

  // P3-20 (audit 2026-08-28): a 'blocked' Excel-sorok PROAKTÍV jelzése — eddig
  // csak a Beállítások → Könyvelés panel mélyén látszottak, az enqueue-hiba
  // pedig csak console.error volt: egy beragadt hivatalos főkönyv-sor
  // észrevétlen maradt. A shell állandó (kézzel zárható) sávot mutat.
  try {
    const szamok = await backend.getExcelOutboxCounts()
    if (szamok.blocked > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kartoteka:excel-blocked', { detail: { darab: szamok.blocked } }),
      )
    }
  } catch {
    /* best-effort — a számláló hibája nem hibáztatja a syncet */
  }

  return result
}

let utolsoAutoEgyeztetes = 0
const AUTO_EGYEZTETES_KOZ_MS = 30 * 60 * 1000

async function autoEgyeztetes(
  congregationId: string,
  ev: number,
  adatokPathFor: (ev: number) => Promise<string | null>,
): Promise<void> {
  try {
    const most = Date.now()
    if (most - utolsoAutoEgyeztetes < AUTO_EGYEZTETES_KOZ_MS) return
    utolsoAutoEgyeztetes = most
    const adatokPath = await adatokPathFor(ev)
    if (!adatokPath) return
    const sorok = await excelKartotekaOsszevetes(adatokPath, congregationId, ev)
    const eltero = sorok.filter((s) => s.egyezik === false)
    if (eltero.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kartoteka:excel-elteres', {
          detail: { ev, lapok: eltero.map((s) => s.lap) },
        }),
      )
    }
  } catch {
    /* best-effort — az egyeztetés hibája nem hibáztatja a syncet */
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Auto-trigger háttér-worker (a befizetes-write-sync mintájára)
// ─────────────────────────────────────────────────────────────────────────

async function runOnceGuarded(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    lastResult = await pushPendingExcelRows()
    lastRunAt = new Date().toISOString()
  } finally {
    inFlight = false
  }
}

/**
 * Auto-triggerek: 30 mp-es poll + online-event. Idempotens. A worker maga
 * ellenőrzi az Excel-szinkron kapcsolót — kikapcsolt állapotban no-op.
 */
export function startExcelWriteAutoSync(): void {
  if (typeof window === 'undefined') return

  if (!onlineListenerAttached) {
    window.addEventListener('online', () => {
      void runOnceGuarded()
    })
    onlineListenerAttached = true
  }

  if (!pusherInterval) {
    pusherInterval = setInterval(() => {
      void runOnceGuarded()
    }, 30_000)
  }

  void runOnceGuarded()
}

/** Manuális futtatás („Szinkron most") — a backoff-ot ignorálja. */
export async function runExcelWriteSyncManually(): Promise<ExcelWriteSyncResult> {
  if (inFlight) {
    while (inFlight) {
      await new Promise((r) => setTimeout(r, 100))
    }
    return (
      lastResult ?? { attempted: 0, written: 0, waiting: 0, blocked: 0, errors: [] }
    )
  }
  inFlight = true
  try {
    lastResult = await pushPendingExcelRows(true)
    lastRunAt = new Date().toISOString()
    return lastResult
  } finally {
    inFlight = false
  }
}

/** Blokkolt tételek visszaengedése + azonnali újrapróbálás (panel-gomb). */
export async function retryBlockedExcelRows(): Promise<ExcelWriteSyncResult> {
  const backend = getTauriSqliteBackend()
  await backend.requeueBlockedExcelRows()
  return runExcelWriteSyncManually()
}
