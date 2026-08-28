/**
 * saveIncomeUseCase — A-M7.3b (2026-04-24), offline-ág A-M7.9a (2026-04-25).
 *
 * Új befizetés rögzítése a `befizetes` táblába.
 *
 * ──────────────────────────────────────────────────────────────────────
 *  ONLINE ÁG (A-M7.3b óta) — `ctx.isOnline !== false`
 * ──────────────────────────────────────────────────────────────────────
 *   1. Zod-validálás (tag/család kölcsönös kizárólagosság + jövőbeli dátum)
 *   2. Iratszám-eldöntés: input.iratszam || `getNextReceiptNumberUseCase(year)`
 *   3. `checkReceiptDuplicateUseCase` az iratszámra — ha ütközik: `duplicateReceipt: true`
 *   4. Payload modern + legacy kompat (xkey, nyugta=iratszam, csalad bool, userid)
 *   5. Insert; 23505 → `duplicateReceipt: true` (a defensive UNIQUE INDEX-en, lásd
 *      `2026-04-25-a-m7-9a-iratszam-pointers.sql`)
 *
 * ──────────────────────────────────────────────────────────────────────
 *  OFFLINE ÁG (A-M7.9a, desktop-only) — `ctx.isOnline === false`
 * ──────────────────────────────────────────────────────────────────────
 * Csak Készpénz (`irattipus` ILIKE '%észpénz%'). Bank-átutalást nem rögzítünk
 * offline (azok a banki rendszerből jönnek később). Flow:
 *   1. Zod + Készpénz-check; ha nem Készpénz: `offlineNotSupported: true`
 *   2. `claimNextIratszamNumber()` — atomikus szám-kivétel a wallet-ből
 *   3. `insertLocalBefizetes()` — `befizetes_pending_local`, sync_state='pending'
 *   4. `enqueueMutation()` — outbox sor a `befizetes` táblába insert-hez
 *   5. Return `{ success: true, pending: true, data: { id: -1, iratszam } }`
 *      (a `id: -1` jelzi: még nincs szerver-ID; a UI a pending-listából tudja)
 *
 * Hibák az offline-ágban:
 *   - Nincs `offlineBackend` → `offlineNotSupported: true`
 *   - Nem Készpénz → `offlineNotSupported: true` + magyarázat
 *   - Üres wallet → `walletEmpty: true`
 *   - Lokális insert / outbox-enqueue hiba → wallet-szám release + error
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveIncomeInputSchema,
  type SaveIncomeInput,
  type SaveIncomeResult,
} from '@kartoteka/validations'

import { getNextReceiptNumberUseCase } from './next-receipt-number'
import { checkReceiptDuplicateUseCase } from './check-receipt-duplicate'
import {
  assertYearNotFinalizedOffline,
  assertYearsNotFinalizedForCreate,
} from '../year-lock'

/**
 * A core SZÁNDÉKOSAN nem importál az `@kartoteka/offline-sync`-ből — minimal
 * duck-type interface. A desktop oldali `TauriSqliteBackend` ezt implementálja.
 */
export interface OfflineIncomeMutation {
  id: string
  table: string
  pk: string
  kind: 'insert' | 'update' | 'delete'
  payload?: Record<string, unknown>
  expectedRevision?: number
  attempts: number
  createdAt: string
}

export interface LocalBefizetesRow {
  id: string                       // 'local-<uuid>'
  congregation_id: string
  xkey: string                     // ugyanaz mint a payload-ban — szerver oldal megkapja
  osszeg: number
  datum: string                    // ISO 'YYYY-MM-DD'
  id_befizetescel: number
  id_szemely: number | null
  id_csalad: number | null
  forrasa: string | null
  iratszam: string
  irattipus: string
  fizetettev: number
  megjegyzes: string | null
  csalad: boolean
  is_potlas: boolean
  bankszamla_id: number | null
  wallet_id: number                // iratszam_wallet_local.id (audit-trail)
  userid: string
}

export interface OfflineIncomeBackend {
  /**
   * 2026-08-11 (5. kör, P1): OPCIONÁLIS év-zár olvasás a lokális tükörből
   * (`bealitas_local.accounting_finalized`). Ha implementálva van és true-t ad,
   * offline sem engedünk új tételt a lezárt évbe. Ha nincs implementálva, a
   * mentés átmegy (lásd `finance/year-lock.ts` fail-open indoklása).
   */
  isYearFinalizedLocal?(congregationId: string, year: number): Promise<boolean>
  /** Atomikusan vesz egy szabad iratszámot a walletből + `used=1`. Null → üres. */
  claimNextIratszamNumber(
    congregationId: string,
    tipus: 'befizetes',
    ev: number,
    localId: string,
  ): Promise<{ id: number; szam: number } | null>
  /** Visszadobja a sorszámot a pool-ba — csak pre-outbox hibánál. */
  releaseIratszamNumber(walletId: number): Promise<void>
  /** A `befizetes_pending_local` táblába ír egy új sort. */
  insertLocalBefizetes(row: LocalBefizetesRow): Promise<void>
  /** Outbox: `insert befizetes` mutation a majdani push-hoz. */
  enqueueMutation(mutation: OfflineIncomeMutation): Promise<void>
}

export interface SaveIncomeCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A kiállító user UUID-ja — a `befizetes.userid` oszlopba megy. */
  userId: string
  /**
   * Hálózati állapot a hívás idején. Ha `false` és `offlineBackend` is
   * jelen → offline-ág; ha `false` de nincs `offlineBackend` →
   * `offlineNotSupported` hiba.
   *
   * Ha nincs megadva, `true`-nak veszi (backward-kompat — A-M7.9a előtt
   * mindenki online-módban hívta).
   */
  isOnline?: boolean
  /** Desktop-oldali offline-tárház (TauriSqliteBackend). Web-en undefined. */
  offlineBackend?: OfflineIncomeBackend
}

export type SaveIncomeResultOrError =
  | {
      success: true
      data: SaveIncomeResult
      /** Ha true, offline-ban mentve — az outbox várja a push-t. */
      pending?: boolean
    }
  | {
      success: false
      error: string
      /** Ha true, az iratszám már létezik a gyülekezetben. */
      duplicateReceipt?: boolean
      /** Ha true, offline-mód de nem támogatott (nincs backend, vagy nem Készpénz). */
      offlineNotSupported?: boolean
      /** Ha true, üres a wallet — a UI javasolja a feltöltést. */
      walletEmpty?: boolean
      /** 2026-08-11 (5. kör, P1): a tétel éve véglegesítve — a rögzítés blokkolva. */
      yearFinalized?: boolean
    }

/** UUID generáló — `globalThis.crypto` mindkét platformon elérhető. */
function generateXkey(): string {
  // 2026-06-12 (Endre #3 + diagnoszt-SQL): az éles DB-n a befizetes.xkey és
  // kiadas.xkey VARCHAR(20) — a 36 karakteres UUID „value too long" hibával
  // buktatta a mentést. 20 hex karakter (16^20 tér) bőven egyedi az xkey célra.
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID().replace(/-/g, '').slice(0, 20)
  // Fallback — nem kriptográfiai, csak egyediségért
  const rand = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `${rand}-${Date.now().toString(16)}`
}

/** Dokumentum-szám összerakás — a web-oldali `buildDocumentNumber` portja. */
function buildDocumentNumber(rawValue: string | null | undefined, date: string): string {
  const trimmed = rawValue?.trim()
  if (trimmed) return trimmed
  // A `replaceAll` ES2021+ — a core tsconfig konzervatív, használunk `.replace(/-/g)`-t
  const dateCompact = date.replace(/-/g, '')
  return `AUTO-${dateCompact}-${Date.now().toString().slice(-6)}`
}

/** Legacy-schema detektálás — ha a modern oszlopok hiányoznak. */
function isMissingColumnError(message?: string): boolean {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}

export async function saveIncomeUseCase(
  input: SaveIncomeInput,
  ctx: SaveIncomeCtx,
): Promise<SaveIncomeResultOrError> {
  // 1) Zod-validálás
  const parsed = saveIncomeInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen befizetés-adat.',
    }
  }
  const clean = parsed.data

  const year =
    clean.fizetettev !== null && clean.fizetettev !== undefined
      ? clean.fizetettev
      : new Date(clean.datum).getFullYear()

  const isOnline = ctx.isOnline !== false

  // ──────────────────────────────────────────────────────────────────────
  //  OFFLINE ÁG (A-M7.9a, desktop-only)
  // ──────────────────────────────────────────────────────────────────────
  if (!isOnline) {
    if (!ctx.offlineBackend) {
      return {
        success: false,
        error:
          'A befizetés rögzítéséhez most internetes kapcsolat szükséges. Csatlakozz a hálózatra, és próbáld újra.',
        offlineNotSupported: true,
      }
    }
    // Offline csak készpénz (kassza = nincs bankszámla) — bank-átutalások a banki rendszerből
    // jönnek. #5-fix: a készpénz-azonosítás a bankszamla_id IS NULL alapján megy, NEM az irattipus
    // szövegén (különben egy „Chitanță" típusú készpénzes tétel tévesen elutasításra kerülne).
    if (clean.bankszamla_id != null && !/észpénz/i.test(clean.irattipus)) {
      return {
        success: false,
        error:
          'Offline módban csak Készpénzes befizetést rögzíthetsz — a banki átutalások a banki kivonatból jönnek be online-mód alatt.',
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
    // 2026-08-11 (5. kör, P1): offline év-zár a lokális `bealitas_local` tükörből.
    // Ha a backend nem implementálja a hookot, átengedjük (lásd year-lock.ts).
    const offlineLock = await assertYearNotFinalizedOffline(
      ctx.offlineBackend.isYearFinalizedLocal?.bind(ctx.offlineBackend),
      clean.congregationId,
      new Date(clean.datum).getFullYear(),
    )
    if (offlineLock) {
      return { success: false, error: offlineLock, yearFinalized: true }
    }
    return saveIncomeOfflineBranch(clean, year, ctx, ctx.offlineBackend)
  }

  // 2026-08-11 (5. kör, P1 adat-integritás): ÉV-ZÁR — a webnek 2026-07-10 óta van
  // `assertYearsNotFinalizedForCreate`-je minden befizetés-insert előtt, a core
  // use-case-nek (= a desktop útvonalnak) SOHA nem lett bekötve. Így egy már
  // véglegesített és beküldött évbe a desktopról továbbra is lehetett új nyugtát
  // rögzíteni, és az egyházmegyének elküldött snapshot némán elavult.
  // A számítás ALAP a `datum` éve (nem a `fizetettev`) — a könyvelési év dönt.
  // Az ellenőrzés a nyugtaszám-generálás ELŐTT fut, hogy zárt évben ne égjen el
  // egy sorszám a hivatalos, hézagmentes sorozatból.
  const createLock = await assertYearsNotFinalizedForCreate(
    ctx.supabase,
    clean.congregationId,
    [clean.datum],
  )
  if (createLock) {
    return { success: false, error: createLock, yearFinalized: true }
  }

  // 2) Iratszám-eldöntés (online)
  let finalIratszam = clean.iratszam?.trim()
  if (!finalIratszam) {
    const next = await getNextReceiptNumberUseCase(
      { congregationId: clean.congregationId, year: new Date(clean.datum).getFullYear() },
      ctx,
    )
    if (!next.success) {
      return { success: false, error: `Iratszám-generálás hiba: ${next.error}` }
    }
    finalIratszam = String(next.nextNumber)
  }

  // A buildDocumentNumber épp az input.iratszam alapján készít, de mi már
  // döntöttünk a finalIratszam-ról — ez csak az ideiglenes AUTO-<dátum>
  // formátumra eshet vissza, ha valami drasztikusan üres lenne (sehol itt).
  const documentNumber = buildDocumentNumber(finalIratszam, clean.datum)

  // 3) Duplikátum-ellenőrzés
  const dup = await checkReceiptDuplicateUseCase(
    { congregationId: clean.congregationId, iratszam: documentNumber },
    ctx,
  )
  if (!dup.success) {
    return { success: false, error: `Duplikátum-ellenőrzés hiba: ${dup.error}` }
  }
  if (dup.isDuplicate) {
    return {
      success: false,
      error: `A "${documentNumber}" iratszám már létezik. Válassz másik számot.`,
      duplicateReceipt: true,
    }
  }

  // 4) Payload — a web-oldali minta szerint modern + legacy-kompat
  const modernPayload: Record<string, unknown> = {
    osszeg: clean.osszeg,
    datum: clean.datum,
    id_befizetescel: clean.id_befizetescel,
    id_szemely: clean.id_szemely ?? null,
    id_csalad: clean.id_csalad ?? null,
    forrasa: clean.forrasa || null,
    iratszam: documentNumber,
    irattipus: clean.irattipus,
    fizetettev: year,
    megjegyzes: clean.megjegyzes || null,
    deleted: false,
    congregation_id: clean.congregationId,
    is_potlas: clean.is_potlas ?? false,
    bankszamla_id: clean.bankszamla_id ?? null,
  }

  const legacyCompatiblePayload: Record<string, unknown> = {
    ...modernPayload,
    xkey: generateXkey(),
    nyugta: clean.nyugta?.trim() || documentNumber,
    csalad: Boolean(clean.id_csalad),
    forrasa: clean.forrasa || 'Kézi rögzítés',
    userid: ctx.userId,
  }

  // 5) Insert — legacy payload először (a valódi séma ezt várja), fallback modern-re
  try {
    let { data, error } = await ctx.supabase
      .from('befizetes')
      .insert([legacyCompatiblePayload])
      .select('id')
      .single()

    if (error && isMissingColumnError(error.message)) {
      // A séma modernizálódott — próbáljuk a kisebb payload-ot
      const retry = await ctx.supabase
        .from('befizetes')
        .insert([modernPayload])
        .select('id')
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      // Unique-ütközés — az iratszám már foglalt (ritka, de lehetséges race a duplicate-check óta)
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
      return { success: false, error: 'A befizetés mentése után nem kaptunk ID-t.' }
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
//  OFFLINE ÁG helper — A-M7.9a
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generál egy kliens-oldali ID-t a lokális befizetésnek. `local-` prefix
 * jelzi hogy nem szerver-id; a `crypto.randomUUID` adja a köv. 32 hex-karaktert.
 */
function generateLocalBefizetesId(): string {
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

async function saveIncomeOfflineBranch(
  clean: SaveIncomeInput,
  year: number,
  ctx: SaveIncomeCtx,
  backend: OfflineIncomeBackend,
): Promise<SaveIncomeResultOrError> {
  const localId = generateLocalBefizetesId()

  // 1) Atomikus szám-kivétel a wallet-ből.
  // D15 (audit 2026-08-28): az iratszám ÉVE a könyvelési (datum-) év — az
  // online generátor is abból számol. A `year` a fizetettev (pótlásnál pl.
  // 2024), és a foglalás eddig ABBÓL a pool-ból vett: a rossz év hivatalos,
  // hézagmentes sorozatából égett el szám. A fizetettev mező lentebb
  // változatlanul a jogcím-évet tárolja.
  const iratszamEv = new Date(clean.datum).getFullYear()
  const claim = await backend.claimNextIratszamNumber(
    clean.congregationId,
    'befizetes',
    iratszamEv,
    localId,
  )
  if (!claim) {
    return {
      success: false,
      error: `Üres az offline iratszám-tárca a(z) ${iratszamEv}-es évre. Csatlakozz a hálózatra, és tölts fel legalább egy sorszámot (Iratszám-tárca panel → +10 szám).`,
      walletEmpty: true,
    }
  }

  const documentNumber = String(claim.szam)
  const xkey = generateXkey()
  const nowIso = new Date().toISOString()

  // 2) Lokális pending-sor beszúrása
  try {
    await backend.insertLocalBefizetes({
      id: localId,
      congregation_id: clean.congregationId,
      xkey,
      osszeg: clean.osszeg,
      datum: clean.datum,
      id_befizetescel: clean.id_befizetescel,
      id_szemely: clean.id_szemely ?? null,
      id_csalad: clean.id_csalad ?? null,
      forrasa: clean.forrasa || 'Desktop offline rögzítés',
      iratszam: documentNumber,
      irattipus: clean.irattipus,
      fizetettev: year,
      megjegyzes: clean.megjegyzes || null,
      csalad: Boolean(clean.id_csalad),
      is_potlas: clean.is_potlas ?? false,
      bankszamla_id: clean.bankszamla_id ?? null,
      wallet_id: claim.id,
      userid: ctx.userId,
    })
  } catch (err) {
    // A wallet-szám release-re küldjük vissza, hogy ne vesszen el
    await backend.releaseIratszamNumber(claim.id).catch(() => {
      /* csendes — a release hiba másodlagos */
    })
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Lokális mentés hiba: ${msg}` }
  }

  // 3) Outbox mutation — push később a `befizetes` táblába
  try {
    await backend.enqueueMutation({
      id: localId,
      table: 'befizetes',
      pk: localId,
      kind: 'insert',
      payload: {
        // A pusher ezt az object-et küldi a `supabase.from('befizetes').insert(...)`-be.
        // Mind a modern, mind a legacy mezők bent vannak — a szerver oldal a séma
        // szerint elfogadja vagy ignorálja a felesleges oszlopokat.
        xkey,
        osszeg: clean.osszeg,
        datum: clean.datum,
        id_befizetescel: clean.id_befizetescel,
        id_szemely: clean.id_szemely ?? null,
        id_csalad: clean.id_csalad ?? null,
        forrasa: clean.forrasa || 'Desktop offline rögzítés',
        iratszam: documentNumber,
        nyugta: clean.nyugta?.trim() || documentNumber,
        irattipus: clean.irattipus,
        fizetettev: year,
        megjegyzes: clean.megjegyzes || null,
        csalad: Boolean(clean.id_csalad),
        deleted: false,
        congregation_id: clean.congregationId,
        is_potlas: clean.is_potlas ?? false,
        bankszamla_id: clean.bankszamla_id ?? null,
        userid: ctx.userId,
      },
      attempts: 0,
      createdAt: nowIso,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    // A lokális sor megmarad, a wallet-szám foglalt. P0-20 (2026-08-28) óta a
    // pusher árva-söprője (befizetes-write-sync sweepOrphanBefizetesPending)
    // a következő futáskor — online-esemény / 30 mp poll / „Sync most" —
    // automatikusan újra-enqueue-olja. A `walletEmpty`-t nem hozzuk vissza,
    // mert nem a wallet a hibás.
    return {
      success: false,
      error: `Offline outbox-mentés hiba: ${msg}. A befizetés lokálisan elmentve, de a szinkronizációs sor frissítése sikertelen.`,
    }
  }

  return {
    success: true,
    pending: true,
    data: {
      // A szerver-ID még nincs — `-1` jelzés a UI-nak, hogy ez egy pending sor.
      // A pending-listából `local-<uuid>` PK-val érhető el.
      id: -1,
      iratszam: documentNumber,
    },
  }
}
