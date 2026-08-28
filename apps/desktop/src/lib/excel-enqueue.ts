/**
 * Excel-enqueue réteg (E3, 2026-06-11) — a triggerek közös belépési pontja.
 *
 * MINDEN DB→Excel írási szándék itt kerül az `excel_outbox` várólistára; a
 * tényleges fájl-írást kizárólag az `excel-write-sync.ts` worker végzi.
 *
 * Tervezési szabályok (a kibővített E3-terv szerint):
 *   - identity_key = `befizetes:<szerver-id>` / `kiadas:<szerver-id>` /
 *     `belsomozgas:<id>` — stabil kulcs; online mentésnél azonnal megvan,
 *     offline tételnél a push-sync UTÁN enqueue-olunk (akkor már van id).
 *   - A kategória HIVATALOS nevét (szamadasicel.nev) enqueue-kor próbáljuk
 *     feloldani; ha még nem szinkronizálódott, a payload őrzi a cel-ID-t és a
 *     worker oldja fel (retry-barát).
 *   - Banki tétel bankszámla nélkül NEM kerülhet a Kassza-lapra → 'blocked'
 *     sor világos indokkal (sosem csendben, sosem tippelve).
 *   - Sztornó/szerkesztés tükör-sora CSAK akkor készül, ha az eredeti tétel
 *     egyáltalán az Excel-útvonalon volt (row_map vagy outbox-bejegyzés) —
 *     különben árva negatív sor kerülne a hivatalos könyvbe.
 *
 * Minden függvény NO-THROW: az Excel-sor elvesztése hibalogot érdemel, de a
 * pénzügyi mentés sikerét nem boríthatja.
 */

import {
  buildExpenseExcelRow,
  buildIncomeExcelRow,
  buildReversalRow,
  buildTransferExcelRows,
  type ExcelKasszaRow,
} from '@kartoteka/core'

import { getDesktopSupabase } from './supabase'
import { getTauriSqliteBackend } from './tauri-sqlite-backend'

export interface ExcelOutboxPayload {
  row: ExcelKasszaRow
  /** Ha a kategória-név enqueue-kor nem oldódott fel, a worker pótolja. */
  celResolve?: { kind: 'bev' | 'kiad'; celId: number }
}

const KASSZA_SHEET = 'Kassza'

function yearOf(datum: string): number {
  const y = Number.parseInt(datum.slice(0, 4), 10)
  return Number.isFinite(y) ? y : new Date().getFullYear()
}

function logEnqueueError(scope: string, err: unknown): void {
  console.error(
    `[excel-enqueue] ${scope} sikertelen:`,
    err instanceof Error ? err.message : err,
  )
  // P3-20 (audit 2026-08-28): az enqueue-hiba eddig CSAK console.error volt —
  // a tétel a Kartotékában megvolt, az Excelbe viszont sosem került be, és
  // senki nem tudott róla. A shell figyelmeztető sávja ugyanazt az eseményt
  // kapja, mint a beragadt várólista-sorok.
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kartoteka:excel-blocked', { detail: { darab: 1 } }),
      )
    }
  } catch {
    /* best-effort */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Bevétel / kiadás (online mentés + offline push-sync után)
// ─────────────────────────────────────────────────────────────────────────

export interface EnqueueEntryInput {
  type: 'befizetes' | 'kiadas'
  serverId: number
  congregationId: string
  datum: string
  iratszam: string
  irattipus: string
  /** G oszlop — befizetésnél a forrás/befizető, kiadásnál az átvevő. */
  nev: string
  osszeg: number
  /** id_befizetescel / id_kiadascel — a hivatalos név feloldásához. */
  celId: number
  megjegyzes?: string | null
  bankszamlaId?: number | null
  ev?: number | null
}

/**
 * Egy rögzített tétel Excel-sorának várólistára tétele.
 * INSERT OR IGNORE — ismételt hívás (retry) nem duplikál.
 */
export async function enqueueEntryExcelRow(input: EnqueueEntryInput): Promise<void> {
  try {
    const backend = getTauriSqliteBackend()
    const kind: 'bev' | 'kiad' = input.type === 'befizetes' ? 'bev' : 'kiad'

    // Hivatalos kategória-név — best-effort; a worker pótolja, ha most nincs.
    let kategoriaNev: string | null = null
    try {
      kategoriaNev = await backend.resolveOfficialCategoryName(kind, input.celId)
    } catch {
      kategoriaNev = null
    }

    const builderInput = {
      datum: input.datum,
      iratszam: input.iratszam,
      irattipus: input.irattipus,
      nev: input.nev,
      osszeg: input.osszeg,
      kategoriaNev: kategoriaNev ?? '',
      megjegyzes: input.megjegyzes ?? null,
      bankszamlaId: input.bankszamlaId ?? null,
    }
    const row =
      input.type === 'befizetes'
        ? buildIncomeExcelRow(builderInput)
        : buildExpenseExcelRow(builderInput)
    if (!kategoriaNev) {
      if (kind === 'bev') row.bevKod = null
      else row.kiadKod = null
    }

    const payload: ExcelOutboxPayload = {
      row,
      ...(kategoriaNev ? {} : { celResolve: { kind, celId: input.celId } }),
    }

    const isBanki = Boolean(input.bankszamlaId) || /bank/i.test(input.irattipus)
    const targetSheet = input.bankszamlaId
      ? `BANK:${input.bankszamlaId}`
      : KASSZA_SHEET

    // Banki tétel bankszámla-hivatkozás nélkül: nem találgatunk lapot.
    const blocked = isBanki && !input.bankszamlaId

    await backend.enqueueExcelRow({
      op: 'append',
      identityKey: `${input.type}:${input.serverId}`,
      side: 'main',
      targetSheet,
      payloadJson: JSON.stringify(payload),
      congregationId: input.congregationId,
      ev: input.ev ?? yearOf(input.datum),
      ...(blocked
        ? {
            status: 'blocked' as const,
            lastError:
              'Banki tétel bankszámla-hozzárendelés nélkül — az Excel betű-lap nem azonosítható. (A banki tételek a bankkivonat-importtal vagy bankszámlás rögzítéssel kerülnek az Excelbe.)',
          }
        : {}),
    })
  } catch (err) {
    logEnqueueError(`${input.type}:${input.serverId} enqueue`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Sztornó tükör-sor (a szerver-sorból visszaépítve)
// ─────────────────────────────────────────────────────────────────────────

export interface EnqueueStornoInput {
  type: 'befizetes' | 'kiadas'
  serverId: number
  congregationId: string
  indok?: string | null
}

/**
 * Sztornó után: ellenelőjeles tükör-sor enqueue (append-only — a SUMIF nettóz).
 * A tétel adatait a szerverről olvassuk vissza (a sztornó online művelet).
 */
export async function enqueueStornoReversal(input: EnqueueStornoInput): Promise<void> {
  try {
    const backend = getTauriSqliteBackend()
    const identityKey = `${input.type}:${input.serverId}`

    // Csak akkor reverzálunk, ha az eredeti tétel az Excel-útvonalon volt.
    const [hadMap, hadOutbox] = await Promise.all([
      backend.hasExcelRowMap(identityKey, 'main'),
      backend.hasExcelOutboxRow(identityKey, 'main'),
    ])
    if (!hadMap && !hadOutbox) {
      // D12 (2026-08-28): a belső-mozgás PÁR-LÁB sorai a `belsomozgas:<mesterId>`
      // kulcs alatt élnek — erre a fenti ellenőrzés vak volt, ezért a pár
      // sztornója SOSEM kapott ellensort. A `BM-<dátum>-<mesterId>` iratszám-
      // hídon a MESTER átvezetés-reverzáljára delegálunk (mindkét lapot fedi,
      // és a reverz-kulcs dedupja miatt a kaszkád két lába is csak EGY
      // ellensort eredményez).
      const { data: legRow } = await getDesktopSupabase()
        .from(input.type)
        .select('iratszam')
        .eq('id', input.serverId)
        .maybeSingle()
      const bmMeccs = /^BM-\d{8}-(\d+)$/.exec(
        String((legRow as { iratszam?: string | null } | null)?.iratszam ?? ''),
      )
      if (bmMeccs) {
        const mesterId = Number(bmMeccs[1])
        const { data: mester } = await getDesktopSupabase()
          .from('belsomozgas')
          .select('tipus, datum, osszeg, forras, cel, megjegyzes')
          .eq('id', mesterId)
          .eq('congregation_id', input.congregationId)
          .maybeSingle()
        if (mester) {
          const m = mester as {
            tipus: 'kassza_bank' | 'bank_kassza' | 'bank_bank' | 'valutacsere'
            datum: string
            osszeg: number
            forras: string
            cel: string
            megjegyzes: string | null
          }
          await enqueueTransferReversal({
            belsomozgasId: mesterId,
            congregationId: input.congregationId,
            tipus: m.tipus,
            datum: m.datum,
            osszeg: Number(m.osszeg),
            bankNeve: m.tipus === 'kassza_bank' ? m.cel : m.forras,
            celBankNeve: m.tipus === 'bank_bank' ? m.cel : undefined,
            megjegyzes: m.megjegyzes,
            reverzOk: 'storno',
          })
        }
      }
      return
    }

    const supabase = getDesktopSupabase()
    const celCol = input.type === 'befizetes' ? 'id_befizetescel' : 'id_kiadascel'
    const nevCol = input.type === 'befizetes' ? 'forrasa' : 'atvevo'
    const { data, error } = await supabase
      .from(input.type)
      .select(
        `osszeg, datum, iratszam, irattipus, megjegyzes, bankszamla_id, fizetettev, ${celCol}, ${nevCol}`,
      )
      .eq('id', input.serverId)
      .maybeSingle()
    if (error || !data) {
      logEnqueueError(`${identityKey} sztornó-sor visszaolvasás`, error ?? 'nincs sor')
      return
    }
    const rec = data as Record<string, unknown>

    const kind: 'bev' | 'kiad' = input.type === 'befizetes' ? 'bev' : 'kiad'
    const celId = Number(rec[celCol] ?? 0)
    let kategoriaNev: string | null = null
    try {
      kategoriaNev = celId
        ? await backend.resolveOfficialCategoryName(kind, celId)
        : null
    } catch {
      kategoriaNev = null
    }

    const builderInput = {
      datum: String(rec.datum ?? '').slice(0, 10),
      iratszam: String(rec.iratszam ?? ''),
      irattipus: String(rec.irattipus ?? ''),
      nev: String(rec[nevCol] ?? ''),
      osszeg: Number(rec.osszeg ?? 0),
      kategoriaNev: kategoriaNev ?? '',
      megjegyzes: (rec.megjegyzes as string | null) ?? null,
      bankszamlaId: (rec.bankszamla_id as number | null) ?? null,
    }
    const original =
      input.type === 'befizetes'
        ? buildIncomeExcelRow(builderInput)
        : buildExpenseExcelRow(builderInput)
    if (!kategoriaNev) {
      if (kind === 'bev') original.bevKod = null
      else original.kiadKod = null
    }
    const reversal = buildReversalRow(original, input.indok)

    const payload: ExcelOutboxPayload = {
      row: reversal,
      ...(kategoriaNev ? {} : { celResolve: { kind, celId } }),
    }

    const bankszamlaId = (rec.bankszamla_id as number | null) ?? null
    await backend.enqueueExcelRow({
      op: 'reversal',
      identityKey,
      side: 'storno',
      targetSheet: bankszamlaId ? `BANK:${bankszamlaId}` : KASSZA_SHEET,
      payloadJson: JSON.stringify(payload),
      congregationId: input.congregationId,
      ev:
        typeof rec.fizetettev === 'number'
          ? rec.fizetettev
          : yearOf(String(rec.datum ?? '')),
    })
  } catch (err) {
    logEnqueueError(`${input.type}:${input.serverId} sztornó-enqueue`, err)
  }
}

/**
 * Sztornó-VISSZAVONÁS után: az eredeti sor újra-append-je (a korábbi tükör-sort
 * kioltva). Csak akkor, ha a sztornó tükör-sor az Excel-útvonalon volt.
 */
export async function enqueueUndoStornoReappend(input: EnqueueStornoInput): Promise<void> {
  try {
    const backend = getTauriSqliteBackend()
    const identityKey = `${input.type}:${input.serverId}`
    const [hadStornoMap, hadStornoOutbox] = await Promise.all([
      backend.hasExcelRowMap(identityKey, 'storno'),
      backend.hasExcelOutboxRow(identityKey, 'storno'),
    ])
    if (!hadStornoMap && !hadStornoOutbox) return

    const supabase = getDesktopSupabase()
    const celCol = input.type === 'befizetes' ? 'id_befizetescel' : 'id_kiadascel'
    const nevCol = input.type === 'befizetes' ? 'forrasa' : 'atvevo'
    const { data, error } = await supabase
      .from(input.type)
      .select(
        `osszeg, datum, iratszam, irattipus, megjegyzes, bankszamla_id, fizetettev, ${celCol}, ${nevCol}`,
      )
      .eq('id', input.serverId)
      .maybeSingle()
    if (error || !data) {
      logEnqueueError(`${identityKey} visszavonás-sor visszaolvasás`, error ?? 'nincs sor')
      return
    }
    const rec = data as Record<string, unknown>

    const kind: 'bev' | 'kiad' = input.type === 'befizetes' ? 'bev' : 'kiad'
    const celId = Number(rec[celCol] ?? 0)
    let kategoriaNev: string | null = null
    try {
      kategoriaNev = celId
        ? await backend.resolveOfficialCategoryName(kind, celId)
        : null
    } catch {
      kategoriaNev = null
    }

    const builderInput = {
      datum: String(rec.datum ?? '').slice(0, 10),
      iratszam: String(rec.iratszam ?? ''),
      irattipus: String(rec.irattipus ?? ''),
      nev: String(rec[nevCol] ?? ''),
      osszeg: Number(rec.osszeg ?? 0),
      kategoriaNev: kategoriaNev ?? '',
      megjegyzes: `SZTORNÓ VISSZAVONVA — ${(rec.megjegyzes as string | null) ?? ''}`.trim(),
      bankszamlaId: (rec.bankszamla_id as number | null) ?? null,
    }
    const row =
      input.type === 'befizetes'
        ? buildIncomeExcelRow(builderInput)
        : buildExpenseExcelRow(builderInput)
    if (!kategoriaNev) {
      if (kind === 'bev') row.bevKod = null
      else row.kiadKod = null
    }

    const payload: ExcelOutboxPayload = {
      row,
      ...(kategoriaNev ? {} : { celResolve: { kind, celId } }),
    }
    const bankszamlaId = (rec.bankszamla_id as number | null) ?? null
    await backend.enqueueExcelRow({
      op: 'append',
      identityKey,
      side: 'storno-undo',
      targetSheet: bankszamlaId ? `BANK:${bankszamlaId}` : KASSZA_SHEET,
      payloadJson: JSON.stringify(payload),
      congregationId: input.congregationId,
      ev:
        typeof rec.fizetettev === 'number'
          ? rec.fizetettev
          : yearOf(String(rec.datum ?? '')),
    })
  } catch (err) {
    logEnqueueError(`${input.type}:${input.serverId} visszavonás-enqueue`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Szerkesztés: régi sor reverzál + új sor append (append-only elv)
// ─────────────────────────────────────────────────────────────────────────

export interface EditSnapshot {
  datum: string
  iratszam: string
  irattipus: string
  nev: string
  osszeg: number
  celId: number
  megjegyzes: string | null
  bankszamlaId: number | null
  fizetettev: number | null
}

/** A szerkesztés ELŐTTI állapot beolvasása a szerverről (a reverzál-sorhoz). */
export async function fetchEditSnapshot(
  type: 'befizetes' | 'kiadas',
  serverId: number,
): Promise<EditSnapshot | null> {
  try {
    const supabase = getDesktopSupabase()
    const celCol = type === 'befizetes' ? 'id_befizetescel' : 'id_kiadascel'
    const nevCol = type === 'befizetes' ? 'forrasa' : 'atvevo'
    const { data, error } = await supabase
      .from(type)
      .select(
        `osszeg, datum, iratszam, irattipus, megjegyzes, bankszamla_id, fizetettev, ${celCol}, ${nevCol}`,
      )
      .eq('id', serverId)
      .maybeSingle()
    if (error || !data) return null
    const rec = data as Record<string, unknown>
    return {
      datum: String(rec.datum ?? '').slice(0, 10),
      iratszam: String(rec.iratszam ?? ''),
      irattipus: String(rec.irattipus ?? ''),
      nev: String(rec[nevCol] ?? ''),
      osszeg: Number(rec.osszeg ?? 0),
      celId: Number(rec[celCol] ?? 0),
      megjegyzes: (rec.megjegyzes as string | null) ?? null,
      bankszamlaId: (rec.bankszamla_id as number | null) ?? null,
      fizetettev: (rec.fizetettev as number | null) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Sikeres szerkesztés után: a RÉGI sor ellenelőjeles tükör-sora + az ÚJ sor
 * append-je (két tétel, közös edit-nonce-szal idempotensen).
 */
export async function enqueueEditExcelRows(input: {
  type: 'befizetes' | 'kiadas'
  serverId: number
  congregationId: string
  before: EditSnapshot
}): Promise<void> {
  try {
    const backend = getTauriSqliteBackend()
    const identityKey = `${input.type}:${input.serverId}`
    const [hadMap, hadOutbox] = await Promise.all([
      backend.hasExcelRowMap(identityKey, 'main'),
      backend.hasExcelOutboxRow(identityKey, 'main'),
    ])
    if (!hadMap && !hadOutbox) return

    const after = await fetchEditSnapshot(input.type, input.serverId)
    if (!after) {
      logEnqueueError(`${identityKey} szerkesztés-utáni visszaolvasás`, 'nincs sor')
      return
    }

    const kind: 'bev' | 'kiad' = input.type === 'befizetes' ? 'bev' : 'kiad'
    const build = input.type === 'befizetes' ? buildIncomeExcelRow : buildExpenseExcelRow

    async function rowFor(snap: EditSnapshot): Promise<ExcelOutboxPayload> {
      let kategoriaNev: string | null = null
      try {
        kategoriaNev = snap.celId
          ? await backend.resolveOfficialCategoryName(kind, snap.celId)
          : null
      } catch {
        kategoriaNev = null
      }
      const row = build({
        datum: snap.datum,
        iratszam: snap.iratszam,
        irattipus: snap.irattipus,
        nev: snap.nev,
        osszeg: snap.osszeg,
        kategoriaNev: kategoriaNev ?? '',
        megjegyzes: snap.megjegyzes,
        bankszamlaId: snap.bankszamlaId,
      })
      if (!kategoriaNev) {
        if (kind === 'bev') row.bevKod = null
        else row.kiadKod = null
      }
      return {
        row,
        ...(kategoriaNev ? {} : { celResolve: { kind, celId: snap.celId } }),
      }
    }

    // Egy szerkesztés = egy nonce; az UNIQUE(identity_key, side) így edit-enként
    // pontosan egy reverzál+append párt enged.
    const nonce = Math.floor(Date.now() / 1000)

    const beforePayload = await rowFor(input.before)
    beforePayload.row = buildReversalRow(beforePayload.row, 'módosítás')
    await backend.enqueueExcelRow({
      op: 'reversal',
      identityKey,
      side: `edit-rev-${nonce}`,
      targetSheet: input.before.bankszamlaId
        ? `BANK:${input.before.bankszamlaId}`
        : KASSZA_SHEET,
      payloadJson: JSON.stringify(beforePayload),
      congregationId: input.congregationId,
      ev: input.before.fizetettev ?? yearOf(input.before.datum),
    })

    const afterPayload = await rowFor(after)
    afterPayload.row.megjegyzes = afterPayload.row.megjegyzes
      ? `MÓDOSÍTVA | ${afterPayload.row.megjegyzes}`
      : 'MÓDOSÍTVA'
    await backend.enqueueExcelRow({
      op: 'append',
      identityKey,
      side: `edit-new-${nonce}`,
      targetSheet: after.bankszamlaId ? `BANK:${after.bankszamlaId}` : KASSZA_SHEET,
      payloadJson: JSON.stringify(afterPayload),
      congregationId: input.congregationId,
      ev: after.fizetettev ?? yearOf(after.datum),
    })
  } catch (err) {
    logEnqueueError(`${input.type}:${input.serverId} szerkesztés-enqueue`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Belső mozgás — KÉT sor (Kassza-lap + betű-lap)
// ─────────────────────────────────────────────────────────────────────────

export interface EnqueueTransferInput {
  belsomozgasId: number
  congregationId: string
  tipus: 'kassza_bank' | 'bank_kassza' | 'bank_bank' | 'valutacsere'
  datum: string
  osszeg: number
  /** A bank neve (kassza_bank → cél; bank_kassza → forrás; bank_bank → FORRÁS). */
  bankNeve: string
  /** bank_bank esetén a CÉL-számla neve. */
  celBankNeve?: string
  megjegyzes?: string | null
}

/**
 * Belső mozgás Excel-sorai. kassza_bank / bank_kassza: két sor (Kassza + betű-lap),
 * a hivatalos per-számla nevekkel. bank_bank / valutacsere: látható 'blocked'
 * bejegyzés (Excel-írásuk későbbi frissítésben) — sosem csendben.
 *
 * A betű-lapot a worker oldja fel a MEGERŐSÍTETT bank-párosításból
 * (`BANKNAME:<név>` target) — így a párosítás utólagos megerősítése is
 * automatikusan feloldja a várakozó sorokat.
 */
export async function enqueueTransferExcelRows(input: EnqueueTransferInput): Promise<void> {
  await enqueueTransferRowsKulccsal(input, `belsomozgas:${input.belsomozgasId}`)
}

/**
 * A tényleges enqueue-törzs, paraméterezhető identity-kulccsal — az eredeti
 * rögzítés a `belsomozgas:<id>` kulcsot, a reverzál a `…:<ok>-reverz`
 * kulcsot használja (D12, 2026-08-28).
 */
async function enqueueTransferRowsKulccsal(
  input: EnqueueTransferInput,
  identityKey: string,
): Promise<void> {
  try {
    const backend = getTauriSqliteBackend()
    const ev = yearOf(input.datum)

    if (input.tipus === 'valutacsere') {
      await backend.enqueueExcelRow({
        op: 'append',
        identityKey,
        side: 'main',
        targetSheet: KASSZA_SHEET,
        payloadJson: JSON.stringify({ row: null, tipus: input.tipus }),
        congregationId: input.congregationId,
        ev,
        status: 'blocked',
        lastError:
          'Valutacsere Excel-írása egy későbbi frissítésben érkezik — ezt a tételt kézzel vezesd át.',
      })
      return
    }

    // bank → bank: KÉT betű-lapot érint (forrás kiadás + cél bevétel) — a
    // névminta Endre élő fájljából igazolva (2026-06-11). A betűket a worker
    // oldja fel a megerősített párosításból; a sorokat is ő építi.
    if (input.tipus === 'bank_bank') {
      const celNev = (input.celBankNeve ?? '').trim()
      if (!celNev) {
        await backend.enqueueExcelRow({
          op: 'append',
          identityKey,
          side: 'main',
          targetSheet: KASSZA_SHEET,
          payloadJson: JSON.stringify({ row: null, tipus: input.tipus }),
          congregationId: input.congregationId,
          ev,
          status: 'blocked',
          lastError: 'Bank → bank átvezetésnél hiányzik a cél-számla neve.',
        })
        return
      }
      const payloadBB = {
        transfer: {
          tipus: 'bank_bank' as const,
          datum: input.datum,
          belsomozgasId: input.belsomozgasId,
          osszeg: input.osszeg,
          megjegyzes: input.megjegyzes ?? null,
          forrasBankName: input.bankNeve.trim(),
          celBankName: celNev,
        },
      }
      await backend.enqueueExcelRow({
        op: 'append',
        identityKey,
        side: 'bank-forras',
        targetSheet: `BANKNAME:${input.bankNeve.trim()}`,
        payloadJson: JSON.stringify({ ...payloadBB, transferSide: 'bank-forras' }),
        congregationId: input.congregationId,
        ev,
      })
      await backend.enqueueExcelRow({
        op: 'append',
        identityKey,
        side: 'bank-cel',
        targetSheet: `BANKNAME:${celNev}`,
        payloadJson: JSON.stringify({ ...payloadBB, transferSide: 'bank-cel' }),
        congregationId: input.congregationId,
        ev,
      })
      return
    }

    // A sor-párt enqueue-kor építjük placeholder betűvel ('A'), a worker a
    // feloldott betű-lapra építi ÚJRA a neveket — így a payload mindig a
    // tényleges betűhöz tartozó hivatalos nevekkel íródik. A placeholder csak
    // a séma-validációt szolgálja; a worker a `transfer` mezőből dolgozik.
    const payloadBase = {
      transfer: {
        tipus: input.tipus,
        datum: input.datum,
        belsomozgasId: input.belsomozgasId,
        osszeg: input.osszeg,
        megjegyzes: input.megjegyzes ?? null,
      },
    }

    await backend.enqueueExcelRow({
      op: 'append',
      identityKey,
      side: 'kassza',
      targetSheet: KASSZA_SHEET,
      payloadJson: JSON.stringify({
        ...payloadBase,
        transferSide: 'kassza',
        bankName: input.bankNeve,
      }),
      congregationId: input.congregationId,
      ev,
    })
    await backend.enqueueExcelRow({
      op: 'append',
      identityKey,
      side: 'bank',
      targetSheet: `BANKNAME:${input.bankNeve.trim()}`,
      payloadJson: JSON.stringify({
        ...payloadBase,
        transferSide: 'bank',
        bankName: input.bankNeve,
      }),
      congregationId: input.congregationId,
      ev,
    })
  } catch (err) {
    logEnqueueError(`belsomozgas:${input.belsomozgasId} enqueue`, err)
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Átvezetés-reverzál (törlés / pár-sztornó) — D12, 2026-08-28
// ─────────────────────────────────────────────────────────────────────────

export interface EnqueueTransferReversalInput extends EnqueueTransferInput {
  /** Miért készül a reverzál — a dedup-kulcs és a megjegyzés-címke része. */
  reverzOk: 'torles' | 'storno'
}

/** Az átvezetés-sorok lehetséges oldalai (kassza_bank/bank_kassza/bank_bank). */
const TRANSFER_OLDALAK = ['kassza', 'bank', 'bank-forras', 'bank-cel', 'main'] as const

/**
 * Az átvezetés (belső mozgás) TÖRLÉSE/SZTORNÓJA utáni Excel-ellensor —
 * MINDKÉT érintett lapra, negált összeggel (a SUMIF nettóz).
 *
 * MIÉRT KELL: az átvezetés-sorok a `belsomozgas:<mesterId>` kulcs alatt
 * élnek, az egyedi tétel-reverzáló viszont `befizetes/kiadas:<id>` kulcsot
 * keres — ezért a törölt/sztornózott átvezetés eddig BENT MARADT az
 * Excel-összegekben, és a hivatalos főkönyv némán széthúzott a DB-től.
 *
 * Csak akkor reverzál, ha az eredeti átvezetés az Excel-úton volt; a
 * `:…-reverz` dedup-kulcs garantálja, hogy egy átvezetéshez okonként
 * legfeljebb EGY ellensor készül.
 */
export async function enqueueTransferReversal(
  input: EnqueueTransferReversalInput,
): Promise<void> {
  try {
    // A valutacsere eredetileg is 'blocked' kézi tétel volt — nincs mit
    // reverzálni (a kézi átvezetést kézzel kell visszavenni).
    if (input.tipus === 'valutacsere') return
    const backend = getTauriSqliteBackend()
    const eredetiKulcs = `belsomozgas:${input.belsomozgasId}`
    let voltExcel = false
    for (const oldal of TRANSFER_OLDALAK) {
      if (
        (await backend.hasExcelRowMap(eredetiKulcs, oldal)) ||
        (await backend.hasExcelOutboxRow(eredetiKulcs, oldal))
      ) {
        voltExcel = true
        break
      }
    }
    if (!voltExcel) return
    const reverzKulcs = `${eredetiKulcs}:${input.reverzOk}-reverz`
    for (const oldal of TRANSFER_OLDALAK) {
      if (
        (await backend.hasExcelRowMap(reverzKulcs, oldal)) ||
        (await backend.hasExcelOutboxRow(reverzKulcs, oldal))
      ) {
        return // már van ellensor — nem duplázunk
      }
    }
    const cimke = input.reverzOk === 'torles' ? 'TÖRÖLVE' : 'SZTORNÓ'
    await enqueueTransferRowsKulccsal(
      {
        ...input,
        osszeg: -Math.abs(input.osszeg),
        megjegyzes: `${cimke}${input.megjegyzes ? ` — ${input.megjegyzes}` : ''}`,
      },
      reverzKulcs,
    )
  } catch (err) {
    logEnqueueError(`belsomozgas:${input.belsomozgasId} reverz`, err)
  }
}

// Újra-exportáljuk a transzfer-sor építőt a worker számára
export { buildTransferExcelRows }
