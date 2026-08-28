/**
 * saveInternalTransferUseCase — A-M7.6a (2026-04-24).
 *
 * Új belső mozgás rögzítése a `belsomozgas` táblába. A meglévő web
 * `saveInternalTransfer` portja a core-ba, `effective-access` helyett
 * explicit congregation_id-val.
 *
 * 2026-08-27 — A KORÁBBI KORLÁT FELOLDVA. A fájl fejléce eddig ezt írta:
 * „A művelet csak a `belsomozgas` master-táblát érinti — a `befizetes` +
 *  `kiadas` tükör-sorok NEM jönnek létre automatikusan… későbbi refaktor tárgya."
 * Ennek élesben az volt a következménye, hogy a DESKTOPON rögzített kassza↔bank
 * átvezetés NEM MOZGATTA A PÉNZT A KÖNYVBEN: sem a kassza, sem a bank egyenlege
 * nem változott, és a tétel egyetlen jelentésben sem jelent meg. (Az Excelbe
 * viszont kiment — tehát a két nyilvántartás széthúzott.) A `belsomozgas` tábla
 * élesben 0 soros volt, így adatromlás nem történt.
 *
 * MOSTANTÓL: ha a hívó megadja a `bankszamlaId`-t, a use-case a mestersor MELLETT
 * létrehozza a kanonikus `befizetes` + `kiadas` PÁRT is, közös `belso_mozgas_xkey`-jel
 * és a kanonikus kódokkal — pontosan úgy, ahogy a webes `saveInternalTransfer`.
 * A `bank_bank` és a `valutacsere` típus EGYELŐRE csak a mestersort kapja (két
 * különböző számla/deviza párosítása külön kört igényel) — ezt a hívó felületnek
 * KI KELL MONDANIA, nem szabad úgy tenni, mintha könyvelés történt volna.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveInternalTransferInputSchema,
  type SaveInternalTransferInput,
  type SaveInternalTransferResult,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForCreate } from '../year-lock'
import { belsoMozgasKodpar } from '../bank-import/belso-mozgas-kodok'

/** 20 hex karakteres xkey (a befizetes/kiadas NOT NULL oszlopa). */
function ujXkey20(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '').slice(0, 20)
  return Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** Teljes UUID a `belso_mozgas_xkey`-hez (a pár két lábát linkeli). */
function ujBelsoMozgasXkey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

export interface SaveInternalTransferCtx {
  supabase: SupabaseClient
  runtime: 'web' | 'desktop'
  /** A rögzítő user UUID — `created_by`. */
  userId: string
}

export type SaveInternalTransferResultOrError =
  | { success: true; data: SaveInternalTransferResult }
  | {
      success: false
      error: string
      /** 2026-08-11 (5. kör, P1): a tétel éve véglegesítve — a rögzítés blokkolva. */
      yearFinalized?: boolean
    }

export async function saveInternalTransferUseCase(
  input: SaveInternalTransferInput,
  ctx: SaveInternalTransferCtx,
): Promise<SaveInternalTransferResultOrError> {
  const parsed = saveInternalTransferInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Érvénytelen belső mozgás-adat.',
    }
  }
  const clean = parsed.data

  // 2026-08-11 (5. kör, P1 adat-integritás): ÉV-ZÁR — a web ugyanezt a műveletet
  // `assertYearsNotFinalizedDirect`-tel védi (penzugy/actions.ts), a core-ba viszont
  // sosem került be, így a desktopról egy már véglegesített és beküldött évbe is
  // lehetett kassza↔bank átvezetést könyvelni.
  const createLock = await assertYearsNotFinalizedForCreate(
    ctx.supabase,
    clean.congregationId,
    [clean.datum],
  )
  if (createLock) {
    return { success: false, error: createLock, yearFinalized: true }
  }

  try {
    const { data, error } = await ctx.supabase
      .from('belsomozgas')
      .insert({
        congregation_id: clean.congregationId,
        datum: clean.datum,
        tipus: clean.tipus,
        forras: clean.forras,
        cel: clean.cel,
        osszeg: clean.osszeg,
        cel_osszeg: clean.cel_osszeg ?? null,
        arfolyam: clean.arfolyam ?? null,
        megjegyzes: clean.megjegyzes || null,
        created_by: ctx.userId,
        deleted: false,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: `Mentés sikertelen: ${error.message}` }
    }
    if (!data?.id) {
      return { success: false, error: 'A belső mozgás mentése után nem kaptunk ID-t.' }
    }

    // ── KÖNYVELÉSI PÁR (2026-08-27) ──────────────────────────────────────
    // Csak kassza↔bank irányban, és csak ha a hívó megadta a bankszámlát.
    // FAIL-SOFT: a mestersor MÁR bent van; ha a pár nem jön létre, azt
    // KIMONDJUK, nem nyeljük el — a felhasználónak tudnia kell, hogy a pénz
    // a könyvben nem mozdult.
    if (
      clean.bankszamlaId &&
      (clean.tipus === 'kassza_bank' || clean.tipus === 'bank_kassza')
    ) {
      const isDeposit = clean.tipus === 'kassza_bank'
      const { bevKod, kiaKod } = belsoMozgasKodpar(true, !isDeposit)
      const [bevCelRes, kiaCelRes] = await Promise.all([
        ctx.supabase.from('befizetescel').select('id').eq('id_szamadasicel', bevKod).maybeSingle(),
        ctx.supabase.from('kiadascel').select('id').eq('id_szamadasicel', kiaKod).maybeSingle(),
      ])
      const bevCelId = bevCelRes.data?.id ? Number(bevCelRes.data.id) : null
      const kiaCelId = kiaCelRes.data?.id ? Number(kiaCelRes.data.id) : null
      if (!bevCelId || !kiaCelId) {
        return {
          success: false,
          error:
            `A belső mozgás bekerült a nyilvántartásba, de a KÖNYVELÉSI sorok NEM jöttek létre: ` +
            `hiányzik a ${bevKod} / ${kiaKod} könyvelési cél. Futtasd le a ` +
            '2026-06-10-belso-mozgas-kodok-INSTALL.sql-t, majd rögzítsd újra a tételt.',
        }
      }

      const pairXkey = ujBelsoMozgasXkey()
      const iratszam = `BM-${clean.datum.replace(/-/g, '')}-${String(data.id)}`
      const fizetettev = Number(clean.datum.slice(0, 4))
      // Letétnél a BANK kap és a KASSZA ad; felvételnél fordítva.
      const bevBankId = isDeposit ? clean.bankszamlaId : null
      const kiaBankId = isDeposit ? null : clean.bankszamlaId

      const befIns = await ctx.supabase.from('befizetes').insert([{
        osszeg: clean.osszeg, osszeg_ron: clean.osszeg, arfolyam: 1,
        datum: clean.datum,
        id_befizetescel: bevCelId,
        id_szemely: null, id_csalad: null, csalad: false,
        forrasa: isDeposit ? 'Belső mozgás — kasszából' : 'Belső mozgás — bankból',
        iratszam, nyugta: iratszam,
        irattipus: bevBankId === null ? 'Készpénz' : 'banki',
        bankszamla_id: bevBankId,
        belso_mozgas_xkey: pairXkey,
        megjegyzes: clean.megjegyzes || null,
        deleted: false, congregation_id: clean.congregationId,
        fizetettev, is_potlas: false,
        xkey: ujXkey20(), userid: ctx.userId,
      }])
      if (befIns.error) {
        return {
          success: false,
          error:
            `A belső mozgás bekerült a nyilvántartásba, de a KÖNYVELÉSI bevétel-sor NEM ` +
            `(${befIns.error.message}). A pénz a könyvben még nem mozdult — jelezd a rendszergazdának.`,
        }
      }

      const kiaIns = await ctx.supabase.from('kiadas').insert([{
        osszeg: clean.osszeg, osszeg_ron: clean.osszeg, arfolyam: 1,
        datum: clean.datum,
        id_kiadascel: kiaCelId,
        atvevo: isDeposit ? 'Belső mozgás — bankba' : 'Belső mozgás — kasszába',
        atvevoid: null,
        iratszam, nyugta: iratszam,
        irattipus: kiaBankId === null ? 'Készpénz' : 'banki',
        bankszamla_id: kiaBankId,
        belso_mozgas_xkey: pairXkey,
        megjegyzes: clean.megjegyzes || null,
        deleted: false, congregation_id: clean.congregationId,
        xkey: ujXkey20(), userid: ctx.userId,
      }])
      if (kiaIns.error) {
        return {
          success: false,
          error:
            `A belső mozgás bevétel-oldala könyvelve, a KIADÁS-oldala viszont NEM ` +
            `(${kiaIns.error.message}). A két oldal így féloldalas — nézd meg a Pénzügy ` +
            'oldalon, és jelezd a rendszergazdának.',
        }
      }
    }

    return {
      success: true,
      data: { id: Number(data.id) },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { success: false, error: `Rögzítési hiba: ${msg}` }
  }
}
