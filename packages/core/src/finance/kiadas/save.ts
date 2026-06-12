/**
 * saveExpenseUseCase — A-M7.4b (2026-04-24), offline-ág A-M7.9b (2026-04-25).
 *
 * Új kiadás rögzítése a `kiadas` táblába. A `saveIncomeUseCase` tükörképe
 * a kiadás-specifikus mezőkkel (`atvevoid`, `atvevo`, `kedvezmenyezett_cui`,
 * `vonatkozo_idoszak`; nincs `csalad`, `fizetettev`, `id_befizetescel`).
 *
 * ──────────────────────────────────────────────────────────────────────
 *  ONLINE ÁG (A-M7.4b óta) — `ctx.isOnline !== false`
 * ──────────────────────────────────────────────────────────────────────
 *   1. Zod-validálás (jövőbeli dátum tiltva, atvevoid VAGY atvevo kötelező)
 *   2. Iratszám-eldöntés: input.iratszam || `getNextReceiptNumberForExpenseUseCase(year)`
 *   3. `checkExpenseReceiptDuplicateUseCase`
 *   4. Payload + INSERT
 *   5. 23505 → `duplicateReceipt: true` (a defensive UNIQUE INDEX-en)
 *
 * ──────────────────────────────────────────────────────────────────────
 *  OFFLINE ÁG (A-M7.9b, desktop-only) — `ctx.isOnline === false`
 * ──────────────────────────────────────────────────────────────────────
 * Csak Készpénz (`irattipus` ILIKE '%észpénz%'). Bank-átutalást nem rögzítünk
 * offline. Flow:
 *   1. Zod + Készpénz-check; ha nem Készpénz: `offlineNotSupported: true`
 *   2. `claimNextIratszamNumber('kiadas', ev, localId)` — atomic szám-kivétel
 *   3. `insertLocalKiadas()` — `kiadas_pending_local`, sync_state='pending'
 *   4. `enqueueMutation()` — outbox sor a `kiadas` táblába insert-hez
 *   5. Return `{ success: true, pending: true, data: { id: -1, iratszam } }`
 *
 * A `kiadas.datum` TIMESTAMP — a `YYYY-MM-DD` inputot `YYYY-MM-DDT00:00:00`
 * formára egészítjük ki (a Supabase kliens implicit fogadja).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveExpenseInputSchema,
  type SaveExpenseInput,
  type SaveExpenseResult,
} from '@kartoteka/validations'

import { getNextReceiptNumberForExpenseUseCase } from './next-receipt-number'
import { checkExpenseReceiptDuplicateUseCase } from './check-receipt-duplicate'

/**
 * Duck-type a `@kartoteka/offline-sync.Mutation`-nal — a core nem importál
 * a sync-csomagból (függőség-gráf egyszerűségéért).
 */
export interface OfflineExpenseMutation {
  id: string
  table: string
  pk: string
  kind: 'insert' | 'update' | 'delete'
  payload?: Record<string, unknown>
  expectedRevision?: number
  attempts: number
  createdAt: string
}

export interface LocalKiadasRow {
  id: string                       // 'local-<uuid>'
  congregation_id: string
  xkey: string
  osszeg: number
  datum: string                    // ISO 'YYYY-MM-DDTHH:MM:SS'
  ev: number                       // EXTRACT(YEAR FROM datum), kényelemből előre kiszámítva
  id_kiadascel: number
  atvevoid: number | null
  atvevo: string | null
  forrasa: string | null
  iratszam: string
  irattipus: string
  megjegyzes: string | null
  vonatkozo_idoszak: string | null
  kedvezmenyezett_cui: string | null
  is_potlas: boolean
  bankszamla_id: number | null
  wallet_id: number
  userid: string
}

export interface OfflineExpenseBackend {
  /** Atomikusan vesz egy szabad iratszámot a walletből + `used=1`. Null → üres. */
  claimNextIratszamNumber(
    congregationId: string,
    tipus: 'kiadas',
    ev: number,
    localId: string,
  ): Promise<{ id: number; szam: number } | null>
  /** Visszadobja a sorszámot a pool-ba — csak pre-outbox hibánál. */
  releaseIratszamNumber(walletId: number): Promise<void>
  /** A `kiadas_pending_local` táblába ír egy új sort. */
  insertLocalKiadas(row: LocalKiadasRow): Promise<void>
  /** Outbox: `insert kiadas` mutation a majdani push-hoz. */
  enqueueMutation(mutation: OfflineExpenseMutation): Promise<void>
}

export interface SaveExpenseCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A rögzítő user UUID-ja — `kiadas.userid` */
  userId: string
  /**
   * Hálózati állapot. Ha `false` és `offlineBackend` is jelen → offline-ág;
   * ha `false` de nincs `offlineBackend` → `offlineNotSupported` hiba.
   * Default: `true` (backward-kompat — A-M7.9b előtt mindenki online-módban hívta).
   */
  isOnline?: boolean
  /** Desktop offline-tárház (TauriSqliteBackend). Web-en undefined. */
  offlineBackend?: OfflineExpenseBackend
}

export type SaveExpenseResultOrError =
  | {
      success: true
      data: SaveExpenseResult
      /** Ha true, offline-ban mentve — az outbox várja a push-t. */
      pending?: boolean
    }
  | {
      success: false
      error: string
      duplicateReceipt?: boolean
      /** Ha true, offline-mód de nem támogatott (nincs backend, vagy nem Készpénz). */
      offlineNotSupported?: boolean
      /** Ha true, üres a wallet — a UI javasolja a feltöltést. */
      walletEmpty?: boolean
    }

function generateXkey(): string {
  // 2026-06-12 (Endre #3 + diagnoszt-SQL): az éles DB-n a befizetes.xkey és
  // kiadas.xkey VARCHAR(20) — a 36 karakteres UUID „value too long" hibával
  // buktatta a mentést. 20 hex karakter (16^20 tér) bőven egyedi az xkey célra.
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 20)
  const rand = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `${rand}-${Date.now().toString(16)}`
}

function buildDocumentNumber(rawValue: string | null | undefined, date: string): string {
  const trimmed = rawValue?.trim()
  if (trimmed) return trimmed
  const dateCompact = date.replace(/-/g, '')
  return `AUTO-${dateCompact}-${Date.now().toString().slice(-6)}`
}

function isMissingColumnError(message?: string): boolean {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}

export async function saveExpenseUseCase(
  input: SaveExpenseInput,
  ctx: SaveExpenseCtx,
): Promise<SaveExpenseResultOrError> {
  // 1) Zod
  const parsed = saveExpenseInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen kiadás-adat.',
    }
  }
  const clean = parsed.data

  const year = new Date(clean.datum).getFullYear()
  const isOnline = ctx.isOnline !== false

  // ──────────────────────────────────────────────────────────────────────
  //  OFFLINE ÁG (A-M7.9b, desktop-only)
  // ──────────────────────────────────────────────────────────────────────
  if (!isOnline) {
    if (!ctx.offlineBackend) {
      return {
        success: false,
        error:
          'A kiadás rögzítéséhez most internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
        offlineNotSupported: true,
      }
    }
    if (!/észpénz/i.test(clean.irattipus)) {
      return {
        success: false,
        error:
          'Offline módban csak Készpénzes kiadást rögzíthetsz — a banki átutalások a banki kivonatból jönnek be online-mód alatt.',
        offlineNotSupported: true,
      }
    }
    if (clean.iratszam?.trim()) {
      return {
        success: false,
        error:
          'Offline módban nem adhatsz meg kézzel iratszámot — a szám-tárcából kerül ki a következő szabad szám.',
      }
    }
    return saveExpenseOfflineBranch(clean, year, ctx, ctx.offlineBackend)
  }

  // 2) Iratszám-eldöntés (online)
  let finalIratszam = clean.iratszam?.trim()
  if (!finalIratszam) {
    const next = await getNextReceiptNumberForExpenseUseCase(
      { congregationId: clean.congregationId, year },
      ctx,
    )
    if (!next.success) {
      return { success: false, error: `Iratszám-generálás hiba: ${next.error}` }
    }
    finalIratszam = String(next.nextNumber)
  }
  const documentNumber = buildDocumentNumber(finalIratszam, clean.datum)

  // 3) Duplikátum-ellenőrzés
  const dup = await checkExpenseReceiptDuplicateUseCase(
    { congregationId: clean.congregationId, iratszam: documentNumber },
    ctx,
  )
  if (!dup.success) {
    return { success: false, error: `Duplikátum-ellenőrzés hiba: ${dup.error}` }
  }
  if (dup.isDuplicate) {
    return {
      success: false,
      error: `A "${documentNumber}" iratszám már létezik a kiadásoknál. Válassz másik számot.`,
      duplicateReceipt: true,
    }
  }

  // 4) Payload — modern + legacy kompat
  // A datum TIMESTAMP, a `YYYY-MM-DD`-hez csatolunk `T00:00:00`-t
  // (a Supabase kliens lefordítja a helyes formátumra)
  const datumTimestamp = `${clean.datum}T00:00:00`

  const modernPayload: Record<string, unknown> = {
    osszeg: clean.osszeg,
    datum: datumTimestamp,
    id_kiadascel: clean.id_kiadascel,
    iratszam: documentNumber,
    irattipus: clean.irattipus,
    megjegyzes: clean.megjegyzes || null,
    deleted: false,
    congregation_id: clean.congregationId,
    atvevoid: clean.atvevoid ?? null,
    atvevo: clean.atvevo || null,
    kedvezmenyezett_cui: clean.kedvezmenyezett_cui || null,
    vonatkozo_idoszak: clean.vonatkozo_idoszak || null,
    is_potlas: clean.is_potlas ?? false,
    bankszamla_id: clean.bankszamla_id ?? null,
  }

  const legacyCompatiblePayload: Record<string, unknown> = {
    ...modernPayload,
    xkey: generateXkey(),
    nyugta: documentNumber,
    // Ha nincs atvevo de van atvevoid, hagyjuk null-on; ha sem atvevo sem atvevoid,
    // a zod refine már elutasította.
    userid: ctx.userId,
  }

  // 5) Insert
  try {
    let { data, error } = await ctx.supabase
      .from('kiadas')
      .insert([legacyCompatiblePayload])
      .select('id')
      .single()

    if (error && isMissingColumnError(error.message)) {
      const retry = await ctx.supabase
        .from('kiadas')
        .insert([modernPayload])
        .select('id')
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      if (error.code === '23505') {
        return {
          success: false,
          error: `A "${documentNumber}" iratszám közben elkelt — próbáld újra.`,
          duplicateReceipt: true,
        }
      }
      return { success: false, error: `Mentés sikertelen: ${error.message}` }
    }

    if (!data?.id) {
      return { success: false, error: 'A kiadás mentése után nem kaptunk ID-t.' }
    }

    return {
      success: true,
      data: {
        id: Number(data.id),
        iratszam: documentNumber,
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Rögzítési hiba: ${msg}` }
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  OFFLINE ÁG helper — A-M7.9b
// ─────────────────────────────────────────────────────────────────────────

function generateLocalKiadasId(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) {
    return `local-${cryptoObj.randomUUID()}`
  }
  const rand = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `local-${rand}-${Date.now().toString(16)}`
}

async function saveExpenseOfflineBranch(
  clean: SaveExpenseInput,
  year: number,
  ctx: SaveExpenseCtx,
  backend: OfflineExpenseBackend,
): Promise<SaveExpenseResultOrError> {
  const localId = generateLocalKiadasId()

  // 1) Atomikus szám-kivétel a wallet-ből
  const claim = await backend.claimNextIratszamNumber(
    clean.congregationId,
    'kiadas',
    year,
    localId,
  )
  if (!claim) {
    return {
      success: false,
      error: `Üres az offline iratszám-tárca a(z) ${year}-as évre. Csatlakozz a hálózatra, és tölts fel legalább egy sorszámot (Iratszám-tárca panel → +10 szám).`,
      walletEmpty: true,
    }
  }

  const documentNumber = String(claim.szam)
  const xkey = generateXkey()
  const datumTimestamp = `${clean.datum}T00:00:00`
  const nowIso = new Date().toISOString()

  // 2) Lokális pending-sor beszúrása
  try {
    await backend.insertLocalKiadas({
      id: localId,
      congregation_id: clean.congregationId,
      xkey,
      osszeg: clean.osszeg,
      datum: datumTimestamp,
      ev: year,
      id_kiadascel: clean.id_kiadascel,
      atvevoid: clean.atvevoid ?? null,
      atvevo: clean.atvevo || null,
      forrasa: 'Desktop offline rögzítés',
      iratszam: documentNumber,
      irattipus: clean.irattipus,
      megjegyzes: clean.megjegyzes || null,
      vonatkozo_idoszak: clean.vonatkozo_idoszak || null,
      kedvezmenyezett_cui: clean.kedvezmenyezett_cui || null,
      is_potlas: clean.is_potlas ?? false,
      bankszamla_id: clean.bankszamla_id ?? null,
      wallet_id: claim.id,
      userid: ctx.userId,
    })
  } catch (err) {
    await backend.releaseIratszamNumber(claim.id).catch(() => {
      /* csendes — a release hiba másodlagos */
    })
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Lokális mentés hiba: ${msg}` }
  }

  // 3) Outbox mutation — push később a `kiadas` táblába
  try {
    await backend.enqueueMutation({
      id: localId,
      table: 'kiadas',
      pk: localId,
      kind: 'insert',
      payload: {
        xkey,
        osszeg: clean.osszeg,
        datum: datumTimestamp,
        id_kiadascel: clean.id_kiadascel,
        iratszam: documentNumber,
        nyugta: documentNumber,
        irattipus: clean.irattipus,
        megjegyzes: clean.megjegyzes || null,
        deleted: false,
        congregation_id: clean.congregationId,
        atvevoid: clean.atvevoid ?? null,
        atvevo: clean.atvevo || null,
        kedvezmenyezett_cui: clean.kedvezmenyezett_cui || null,
        vonatkozo_idoszak: clean.vonatkozo_idoszak || null,
        is_potlas: clean.is_potlas ?? false,
        bankszamla_id: clean.bankszamla_id ?? null,
        userid: ctx.userId,
      },
      attempts: 0,
      createdAt: nowIso,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return {
      success: false,
      error: `Offline outbox-mentés hiba: ${msg}. A kiadás lokálisan elmentve, de a szinkronizációs sor frissítése sikertelen.`,
    }
  }

  return {
    success: true,
    pending: true,
    data: {
      id: -1,
      iratszam: documentNumber,
    },
  }
}
