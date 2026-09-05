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
 * D5 (audit 2026-08-28): a `bank_bank` típus is kap könyvelési párt, ha a hívó
 * a `bankszamlaId` (forrás) MELLETT a `celBankszamlaId`-t is megadja és mindkét
 * számla RON — devizás párnál mester-only marad, `figyelmeztetes`-sel. A
 * `valutacsere` továbbra is csak a mestersort kapja (árfolyamos könyvelése
 * külön kört igényel) — ezt a hívó felületnek KI KELL MONDANIA, nem szabad úgy
 * tenni, mintha könyvelés történt volna.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  saveInternalTransferInputSchema,
  type SaveInternalTransferInput,
  type SaveInternalTransferResult,
} from '@kartoteka/validations'

import { assertYearsNotFinalizedForCreate } from '../year-lock'
import { belsoMozgasKodpar } from '../bank-import/belso-mozgas-kodok'
import { refreshNextYearCarryoverUseCase } from '../bank-import/nyito-egyenleg'

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
  | {
      success: true
      data: SaveInternalTransferResult
      /** D5 (2026-08-29): siker, de a könyvelési pár NEM készült el (pl.
       *  devizás bank→bank) — a felület mutassa meg a felhasználónak. */
      figyelmeztetes?: string
    }
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

  // ── ÖRÖKBEFOGADÁS ELŐELLENŐRZÉSE (2026-09-03, Endre 1. — P0) ──────────
  // A rögzítő „Párosítatlan tétel átvétele" választója egy MÁR LÉTEZŐ könyvelési
  // sort jelöl ki. Ilyenkor NEM szabad új párt gyártani (az duplikálna) — csak a
  // hiányzó lábat hozzuk létre, és a meglévő sort ugyanazzal a kulccsal jelöljük.
  //
  // FAIL-CLOSED, ÉS A MESTERSOR ELŐTT: ha a célsor időközben megváltozott, itt
  // állunk meg, amikor még SEMMI nem íródott. (Fordított sorrendben egy elbukott
  // ellenőrzés árva mestersort hagyna maga után.)
  let orokbe: {
    tabla: 'befizetes' | 'kiadas'
    id: number
    xkey: string
    /** Volt-e MÁR kulcsa — ha igen, azt vesszük át, és nem írunk rá újat. */
    kulcsotIrunk: boolean
  } | null = null
  if (clean.parositando) {
    const p = clean.parositando
    const tabla = p.oldal === 'income' ? 'befizetes' : 'kiadas'
    const { data: cel, error: celErr } = await ctx.supabase
      .from(tabla)
      .select('id, osszeg, osszeg_ron, datum, bankszamla_id, belso_mozgas_xkey, deleted, stornozott')
      .eq('id', p.id)
      .eq('congregation_id', clean.congregationId)
      .maybeSingle()
    if (celErr) {
      return {
        success: false,
        error:
          `A párosítandó tétel ellenőrzése nem sikerült (${celErr.message}) — ezért NEM mentettünk ` +
          'semmit. Próbáld újra; ha ismétlődik, rögzítsd a tételt párosítás nélkül.',
      }
    }
    if (!cel) {
      return {
        success: false,
        error:
          'A párosítandó tétel már nem található (időközben törölhették, vagy másik gyülekezeté). ' +
          'Frissítsd a Pénzügy oldalt, és válaszd ki újra.',
      }
    }
    const c = cel as {
      id: number
      osszeg: number | null
      osszeg_ron: number | null
      datum: string | null
      bankszamla_id: number | null
      belso_mozgas_xkey: string | null
      deleted: boolean | null
      stornozott: boolean | null
    }
    if (c.deleted || c.stornozott) {
      return {
        success: false,
        error:
          'A párosítandó tételt időközben törölték vagy sztornózták — NEM mentettünk semmit. ' +
          'Frissítsd a Pénzügy oldalt, és válaszd ki újra.',
      }
    }
    // Az összegnek CENTRE egyeznie kell — különben nem ugyanarról a pénzről van szó.
    const celCent = Math.round(Number(c.osszeg ?? 0) * 100)
    const ujCent = Math.round(clean.osszeg * 100)
    if (celCent !== ujCent) {
      return {
        success: false,
        error:
          `A párosítandó tétel összege ${(celCent / 100).toFixed(2)}, a rögzített soré ` +
          `${(ujCent / 100).toFixed(2)} — nem ugyanaz a pénz. Javítsd az összeget, vagy válassz másik tételt.`,
      }
    }
    // HELYSZÍN-ŐR: a meglévő sornak azon az oldalon kell állnia, ahová a TÍPUS teszi.
    // Letétnél (kassza→bank) a BEFIZETÉS a bankon, a KIADÁS a kasszában van; felvétnél fordítva.
    const letet = clean.tipus === 'kassza_bank'
    const varhatoBank =
      p.oldal === 'income' ? (letet ? clean.bankszamlaId ?? null : null) : letet ? null : clean.bankszamlaId ?? null
    if ((c.bankszamla_id ?? null) !== (varhatoBank ?? null)) {
      return {
        success: false,
        error:
          'A párosítandó tétel nem azon az oldalon áll, ahová ez az átvezetés tenné ' +
          `(${c.bankszamla_id == null ? 'kasszában' : 'bankszámlán'} van). Ellenőrizd az irányt és a bankszámlát, ` +
          'vagy válassz másik tételt.',
      }
    }
    orokbe = {
      tabla,
      id: c.id,
      xkey: c.belso_mozgas_xkey || ujBelsoMozgasXkey(),
      kulcsotIrunk: !c.belso_mozgas_xkey,
    }
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

      // 2026-09-03 (P0): örökbefogadásnál a MEGLÉVŐ sor kulcsát visszük tovább,
      // és azt a lábat NEM szúrjuk be újra — különben ugyanarra a pénzre két
      // könyvelési sor keletkezne (ez volt a duplikálás gyökere).
      const pairXkey = orokbe ? orokbe.xkey : ujBelsoMozgasXkey()
      const kellBef = !(orokbe && orokbe.tabla === 'befizetes')
      const kellKia = !(orokbe && orokbe.tabla === 'kiadas')
      const iratszam = `BM-${clean.datum.replace(/-/g, '')}-${String(data.id)}`
      const fizetettev = Number(clean.datum.slice(0, 4))
      // Letétnél a BANK kap és a KASSZA ad; felvételnél fordítva.
      const bevBankId = isDeposit ? clean.bankszamlaId : null
      const kiaBankId = isDeposit ? null : clean.bankszamlaId

      let befUjId: number | null = null
      if (kellBef) {
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
        }]).select('id')
        if (befIns.error) {
          // P0-7 (audit 2026-08-28): kompenzáció — ne maradjon árva mester-sor.
          // A visszavonás EREDMÉNYE ellenőrzött; kettős hibánál kimondjuk.
          const mesterVissza = await ctx.supabase
            .from('belsomozgas')
            .update({ deleted: true })
            .eq('id', data.id)
            .eq('congregation_id', clean.congregationId)
            .select('id')
          if (mesterVissza.error || !mesterVissza.data?.length) {
            return {
              success: false,
              error:
                `A könyvelési bevétel-sor nem jött létre (${befIns.error.message}), és a nyilvántartó ` +
                'sor visszavonása sem sikerült — a Belső mozgások listában maradt egy pár nélküli sor. ' +
                'Töröld kézzel, majd rögzítsd újra az átvezetést.',
            }
          }
          return {
            success: false,
            error:
              `A könyvelési bevétel-sor nem jött létre (${befIns.error.message}) — az átvezetés ` +
              'teljes egészében visszavonva, a könyvben semmi nem mozdult. Rögzítsd újra.',
          }
        }
        befUjId = Number((befIns.data as Array<{ id: number }> | null)?.[0]?.id) || null
      }
      if (kellKia) {
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
          // P0-7 (audit 2026-08-28): kompenzáció — a bevétel-láb ÉS a mester
          // visszavonása, ellenőrzött eredménnyel. Így nem marad féloldalas könyv.
          //
          // ⚠️ 2026-09-03: a visszavonás CSAK az ÁLTALUNK beszúrt sorra mehet.
          // Örökbefogadásnál a `pairXkey` a MEGLÉVŐ (idegen) soron is rajta van —
          // kulcs szerint törölni azt is elvinné, vagyis egy sikertelen mentés
          // kitörölné a lelkész korábbi, érvényes tételét.
          let rendben = true
          if (befUjId != null) {
            const befVissza = await ctx.supabase
              .from('befizetes')
              .update({ deleted: true })
              .eq('id', befUjId)
              .eq('congregation_id', clean.congregationId)
              .select('id')
            if (befVissza.error || !befVissza.data?.length) rendben = false
          }
          const mesterVissza = await ctx.supabase
            .from('belsomozgas')
            .update({ deleted: true })
            .eq('id', data.id)
            .eq('congregation_id', clean.congregationId)
            .select('id')
          if (mesterVissza.error || !mesterVissza.data?.length) rendben = false
          if (!rendben) {
            return {
              success: false,
              error:
                `A könyvelési kiadás-sor nem jött létre (${kiaIns.error.message}), és a visszavonás ` +
                'sem teljes — FÉLOLDALAS átvezetés maradhatott. Nézd meg a Pénzügy oldalt ' +
                '(párosítatlan-jelzés), és jelezd a rendszergazdának.',
            }
          }
          return {
            success: false,
            error:
              `A könyvelési kiadás-sor nem jött létre (${kiaIns.error.message}) — az átvezetés ` +
              'teljes egészében visszavonva, a könyvben semmi nem mozdult. Rögzítsd újra.',
          }
        }
      }

      // ── AZ ÖRÖKBEFOGADOTT SOR MEGJELÖLÉSE (2026-09-03, P0) ──────────────
      // A hiányzó láb megvan; most a MEGLÉVŐ sorra írjuk rá a közös kulcsot,
      // hogy a pár eredete visszakövethető legyen. FAIL-LOUD: ha nem sikerül,
      // a könyv attól még HELYES (a két láb összege/dátuma párosítja őket), de
      // a lelkésznek tudnia kell, hogy a jelölés elmaradt.
      if (orokbe && orokbe.kulcsotIrunk) {
        const jeloles = await ctx.supabase
          .from(orokbe.tabla)
          .update({ belso_mozgas_xkey: pairXkey })
          .eq('id', orokbe.id)
          .eq('congregation_id', clean.congregationId)
          .is('belso_mozgas_xkey', null)
          .select('id')
        if (jeloles.error || !jeloles.data?.length) {
          return {
            success: true,
            data: { id: Number(data.id) },
            figyelmeztetes:
              'Az átvezetés hiányzó oldala elkészült, és a pár összeáll — de a korábbi tételre ' +
              'a párosító jelölést nem sikerült ráírni' +
              (jeloles.error ? ` (${jeloles.error.message})` : ' (időközben megváltozott)') +
              '. A könyv helyes; ha a párosítatlan-jelzés mégis megmarad, frissítsd az oldalt.',
          }
        }
      }
    }

    // ── BANK → BANK KÖNYVELÉSI PÁR (D5, audit 2026-08-28) ────────────────
    // Eddig a bank→bank átvezetés CSAK a mester-táblába került — a
    // számlánkénti egyenleg, a Registru Banca és a carryover nem látta,
    // miközben az Excel-oldal (buildBankBankExcelRows) mindkét betű-lapra
    // könyvelt: a DB és a hivatalos főkönyv széthúzott.
    // PÉNZNEM-ŐR: automatikusan csak RON↔RON párt könyvelünk — devizás
    // számlánál a helyes RON-ekvivalenshez árfolyam kell, ott a mester-only
    // marad, HANGOS jelzéssel (mint a valutacsere).
    if (clean.tipus === 'bank_bank' && clean.bankszamlaId && clean.celBankszamlaId) {
      const { data: bankok, error: bankErr } = await ctx.supabase
        .from('bankszamlak')
        .select('id, valuta')
        .in('id', [clean.bankszamlaId, clean.celBankszamlaId])
        .eq('congregation_id', clean.congregationId)
      if (bankErr || (bankok || []).length < 2) {
        return {
          success: false,
          error:
            'A bank→bank átvezetés bekerült a nyilvántartásba, de a számlák ellenőrzése nem ' +
            `sikerült (${bankErr?.message || 'hiányzó számla'}) — a KÖNYVELÉSI pár nem jött létre. ` +
            'Töröld a tételt, és rögzítsd újra.',
        }
      }
      const nemRon = (bankok as Array<{ id: number; valuta?: string | null }>).some(
        (b) => ((b.valuta || 'RON') as string).toUpperCase() !== 'RON',
      )
      if (nemRon) {
        return {
          success: true,
          data: { id: Number(data.id) },
          figyelmeztetes:
            'Devizás számlát érintő bank→bank átvezetés: a nyilvántartásba bekerült, de a ' +
            'könyvelési pár NEM készült el automatikusan (árfolyam kellene hozzá) — a két ' +
            'számla tételeit kézzel rögzítsd, vagy használd a banki kivonat-importot.',
        }
      }

      const { bevKod, kiaKod } = belsoMozgasKodpar(false, false)
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
            `A bank→bank átvezetés a nyilvántartásba bekerült, de a KÖNYVELÉSI sorok nem: ` +
            `hiányzik a ${bevKod} könyvelési cél. Futtasd le a ` +
            '2026-06-10-belso-mozgas-kodok-INSTALL.sql-t, majd rögzítsd újra.',
        }
      }

      const pairXkey = ujBelsoMozgasXkey()
      const iratszam = `BM-${clean.datum.replace(/-/g, '')}-${String(data.id)}`
      const fizetettev = Number(clean.datum.slice(0, 4))

      const befIns = await ctx.supabase.from('befizetes').insert([{
        osszeg: clean.osszeg, osszeg_ron: clean.osszeg, arfolyam: 1,
        datum: clean.datum,
        id_befizetescel: bevCelId,
        id_szemely: null, id_csalad: null, csalad: false,
        forrasa: 'Belső mozgás — másik számláról',
        iratszam, nyugta: iratszam,
        irattipus: 'banki',
        bankszamla_id: clean.celBankszamlaId,
        belso_mozgas_xkey: pairXkey,
        megjegyzes: clean.megjegyzes || null,
        deleted: false, congregation_id: clean.congregationId,
        fizetettev, is_potlas: false,
        xkey: ujXkey20(), userid: ctx.userId,
      }])
      if (befIns.error) {
        const mesterVissza = await ctx.supabase
          .from('belsomozgas')
          .update({ deleted: true })
          .eq('id', data.id)
          .eq('congregation_id', clean.congregationId)
          .select('id')
        if (mesterVissza.error || !mesterVissza.data?.length) {
          return {
            success: false,
            error:
              `A cél-számla bevétel-sora nem jött létre (${befIns.error.message}), és a ` +
              'nyilvántartó sor visszavonása sem sikerült — töröld kézzel a Belső mozgások ' +
              'listából, majd rögzítsd újra.',
          }
        }
        return {
          success: false,
          error:
            `A cél-számla bevétel-sora nem jött létre (${befIns.error.message}) — az átvezetés ` +
            'teljes egészében visszavonva. Rögzítsd újra.',
        }
      }

      const kiaIns = await ctx.supabase.from('kiadas').insert([{
        osszeg: clean.osszeg, osszeg_ron: clean.osszeg, arfolyam: 1,
        datum: clean.datum,
        id_kiadascel: kiaCelId,
        atvevo: 'Belső mozgás — másik számlára',
        atvevoid: null,
        iratszam, nyugta: iratszam,
        irattipus: 'banki',
        bankszamla_id: clean.bankszamlaId,
        belso_mozgas_xkey: pairXkey,
        megjegyzes: clean.megjegyzes || null,
        deleted: false, congregation_id: clean.congregationId,
        xkey: ujXkey20(), userid: ctx.userId,
      }])
      if (kiaIns.error) {
        let rendben = true
        const befVissza = await ctx.supabase
          .from('befizetes')
          .update({ deleted: true })
          .eq('belso_mozgas_xkey', pairXkey)
          .eq('congregation_id', clean.congregationId)
          .select('id')
        if (befVissza.error || !befVissza.data?.length) rendben = false
        const mesterVissza = await ctx.supabase
          .from('belsomozgas')
          .update({ deleted: true })
          .eq('id', data.id)
          .eq('congregation_id', clean.congregationId)
          .select('id')
        if (mesterVissza.error || !mesterVissza.data?.length) rendben = false
        if (!rendben) {
          return {
            success: false,
            error:
              `A forrás-számla kiadás-sora nem jött létre (${kiaIns.error.message}), és a ` +
              'visszavonás sem teljes — FÉLOLDALAS átvezetés maradhatott. Nézd meg a Pénzügy ' +
              'oldalt (párosítatlan-jelzés), és jelezd a rendszergazdának.',
          }
        }
        return {
          success: false,
          error:
            `A forrás-számla kiadás-sora nem jött létre (${kiaIns.error.message}) — az átvezetés ` +
            'teljes egészében visszavonva, a könyvben semmi nem mozdult. Rögzítsd újra.',
        }
      }
    }

    // 2026-08-28 (Endre döntése: EGY nyitó-egyenleg forrás): ha VISSZAMENŐLEGESEN
    // rögzítünk átvezetést, a KÖVETKEZŐ évi automatikusan áthozott ('carryover')
    // banki nyitó elavul — újraszámoljuk. Kézzel rögzített ('manual') nyitót a
    // use-case definíció szerint nem bánt.
    //
    // MIÉRT ITT, A MAGBAN: eddig CSAK a webes `saveInternalTransfer` hívta meg
    // (apps/web/.../penzugy/actions.ts), a DESKTOP viszont ezt a közös use-case-t
    // használja — vagyis egy asztali programból rögzített visszamenőleges átvezetés
    // elavultan hagyta a következő év nyitóját, ugyanaz a művelet a weben pedig
    // frissítette. Kanonizálás közben épp a kanonikus tábla tartalma húzott szét.
    //
    // BEST-EFFORT: a hibája NEM buktatja a mentést (a pénz már könyvelve van), de
    // — a korábbi néma `catch {}`-tel ellentétben — naplózzuk.
    if (clean.bankszamlaId != null) {
      try {
        const changedYear = Number(String(clean.datum).slice(0, 4))
        if (Number.isFinite(changedYear) && changedYear >= 2000) {
          await refreshNextYearCarryoverUseCase(
            { congregationId: clean.congregationId, bankszamlaId: clean.bankszamlaId, changedYear },
            ctx as unknown as Parameters<typeof refreshNextYearCarryoverUseCase>[1],
          )
          // D5 (2026-08-29): bank→bank párnál a CÉL-számla nyitója is érintett.
          if (clean.celBankszamlaId != null) {
            await refreshNextYearCarryoverUseCase(
              {
                congregationId: clean.congregationId,
                bankszamlaId: clean.celBankszamlaId,
                changedYear,
              },
              ctx as unknown as Parameters<typeof refreshNextYearCarryoverUseCase>[1],
            )
          }
        }
      } catch (e) {
        console.error(
          '[belsomozgas] a következő évi carryover nyitó frissítése nem sikerült:',
          e instanceof Error ? e.message : e,
        )
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
