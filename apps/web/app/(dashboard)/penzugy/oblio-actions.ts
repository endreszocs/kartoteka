'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { decryptSecret } from '@/lib/supabase/secret-vault'
import {
  createInvoice,
  getInvoice,
  collectInvoice,
  deleteInvoice,
} from '@/lib/finance/oblio/oblio-client'
import { buildOblioInvoiceRequest } from '@/lib/finance/oblio/oblio-invoice-builder'
import { OblioError } from '@/lib/finance/oblio/oblio-errors'
import { TVA_NORMAL_SZAZALEK_ALAP, ervenyesTvaKulcs } from '@/lib/finance/tva-plafon-constants'
import { isMissingColumnError } from '@/lib/utils/schema-errors'

/**
 * Oblio számla lifecycle server actions.
 *
 * Műveletek:
 *  - issueInvoice: új számla (e-Factura vagy chitanță)
 *  - listRentalInvoices: szerződéshez tartozó számlák
 *  - syncInvoiceStatus: Oblio-ból friss státusz lekérés
 *  - markInvoicePaid: kifizetés rögzítése (collect)
 *  - stornoInvoice: sztornó
 */

// ─────────────────────────────────────────────────────────────
// Segéd: Oblio konfig + visszafejtett secret
// ─────────────────────────────────────────────────────────────

type OblioCredentials = {
  oblioFiokId: string
  email: string
  apiSecret: string // visszafejtett plain text — csak server-oldal!
  cif: string
  sorozat: string
  serviceName: string
}

async function loadOblioCredentials(
  supabase: Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase'],
  congregationId: string,
): Promise<OblioCredentials | { error: string }> {
  const { data: cfg, error } = await supabase
    .from('oblio_fiokok')
    .select('id, email, api_secret_encrypted, cif, sorozat_default, nev_default_service, aktiv')
    .eq('congregation_id', congregationId)
    .eq('aktiv', true)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!cfg) return { error: 'Nincs aktív Oblio konfiguráció ehhez a gyülekezethez.' }

  let apiSecret: string
  try {
    apiSecret = await decryptSecret(supabase, cfg.api_secret_encrypted)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `Titkosítási hiba: ${msg}` }
  }

  return {
    oblioFiokId: cfg.id,
    email: cfg.email,
    apiSecret,
    cif: cfg.cif,
    sorozat: cfg.sorozat_default || 'KA',
    serviceName: cfg.nev_default_service || 'Chirie spațiu',
  }
}

// ─────────────────────────────────────────────────────────────
// Listázás
// ─────────────────────────────────────────────────────────────

export type OblioInvoiceRow = {
  id: string
  tipus: 'e_factura' | 'chitanta_papir'
  sorozat: string
  szam: number
  szamla_datum: string
  klienesseg_nev: string
  osszeg_brut: number
  e_factura_status: string | null
  stornozott: boolean
  collected_at: string | null
  pdf_url: string | null
  berleti_szerzodes_id: string | null
}

export async function listRentalInvoices(berletiSzerzodesId: string): Promise<{
  data?: OblioInvoiceRow[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await access.supabase
    .from('oblio_szamlak')
    .select('id, tipus, sorozat, szam, szamla_datum, klienesseg_nev, osszeg_brut, e_factura_status, stornozott, collected_at, pdf_url, berleti_szerzodes_id')
    .eq('berleti_szerzodes_id', berletiSzerzodesId)
    .eq('congregation_id', access.effectiveCongregationId)
    .order('szamla_datum', { ascending: false })

  if (error) return { error: error.message }
  return { data: (data ?? []) as OblioInvoiceRow[] }
}

// ─────────────────────────────────────────────────────────────
// Számla kiállítás (e-Factura)
// ─────────────────────────────────────────────────────────────

export type IssueInvoiceInput = {
  berletiSzerzodesId: string
  szamlaDatum: string // YYYY-MM-DD
  esedekesseg: string // YYYY-MM-DD
  idoszak: string // pl. "martie 2026"
  osszeg: number
  megjegyzes?: string
  /**
   * 2026-09-03 (átvilágítás P0): a felhasználó TUDATOSAN vállalja, hogy már van
   * ilyen számla, és mégis újat állít ki. Enélkül a duplikátum-kapu megállítja.
   * A felület CSAK akkor kínálja fel, ha a szerver már jelezte az ütközést.
   */
  megerositettDuplikatum?: boolean
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<{
  success?: boolean
  oblioSzamlaId?: string
  error?: string
  /** 2026-09-03: a hiba oka duplikátum-gyanú — a felület felajánlhatja a tudatos felülbírálást. */
  duplikatumGyanu?: boolean
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // 1. Bérleti szerződés + comodat ellenőrzés
  const { data: contract, error: contractErr } = await access.supabase
    .from('berleti_szerzodes')
    .select('id, berlo_nev, ceg_nev, ceg_adoszam, targy, leiras, tipus, jogi_tipus, osszeg, fizetesi_ciklus')
    .eq('id', input.berletiSzerzodesId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (contractErr) return { error: contractErr.message }
  if (!contract) return { error: 'Szerződés nem található.' }

  if (contract.jogi_tipus === 'comodat') {
    return { error: 'Haszonkölcsön (comodat) esetén nem állítható ki számla — ingyenes használat.' }
  }

  // 2. Oblio konfig + CIF
  const credsOrError = await loadOblioCredentials(access.supabase, access.effectiveCongregationId)
  if ('error' in credsOrError) return credsOrError
  const creds = credsOrError

  // 3. Gyülekezet TVA-alanyiság ÉS a BEÁLLÍTOTT TVA-kulcs.
  //
  // ⚠️ A kulcs nem lehet beégetve (Endre, 2026-09-03) — a román normál kulcs
  // 2025-08-01-én 19%-ról 21%-ra emelkedett, és a rendszer addig fixen 19%-kal
  // számolt. SÉMA-DRIFT-TŰRŐ olvasás: ha a `tva_kulcs_szazalek` oszlop a
  // produkción még nincs meg (a repóban lévő migráció nem bizonyíték), a
  // lekérdezés nem bukhat el — visszaesünk a dokumentált tartalék-értékre.
  let tvaAlany = false
  let tvaKulcsSzazalek: number = TVA_NORMAL_SZAZALEK_ALAP
  {
    const teljes = await access.supabase
      .from('congregations')
      .select('tva_alany, tva_kulcs_szazalek')
      .eq('id', access.effectiveCongregationId)
      .maybeSingle()
    if (teljes.error && isMissingColumnError(teljes.error.message)) {
      const szuk = await access.supabase
        .from('congregations')
        .select('tva_alany')
        .eq('id', access.effectiveCongregationId)
        .maybeSingle()
      tvaAlany = Boolean(szuk.data?.tva_alany)
      console.warn(
        '[issueInvoice] A congregations.tva_kulcs_szazalek oszlop hiányzik — a számla a tartalék ' +
          `${TVA_NORMAL_SZAZALEK_ALAP}%-os kulccsal készül. Futtatandó: migration-docs/sql/2026-09-03-tva-kulcs-beallithato.sql`,
      )
    } else if (teljes.error) {
      return { error: `A gyülekezet ÁFA-beállítása nem olvasható: ${teljes.error.message}` }
    } else {
      tvaAlany = Boolean(teljes.data?.tva_alany)
      const beallitott = teljes.data?.tva_kulcs_szazalek
      if (beallitott != null && ervenyesTvaKulcs(beallitott)) tvaKulcsSzazalek = Number(beallitott)
    }
  }

  // FAIL-LOUD: ÁFA-alanyként 0%-os kulccsal NEM állítunk ki hivatalos számlát —
  // az néma adóhiányt jelentene egy ANAF SPV-re felmenő bizonylaton.
  if (tvaAlany && !(tvaKulcsSzazalek > 0)) {
    return {
      error:
        'A gyülekezet ÁFA-alany, de a TVA-kulcs 0% vagy nincs beállítva. ' +
        'Állítsd be a Gyülekezetünk adatai → ÁFA-alanyiság panelen, mielőtt számlát állítasz ki.',
    }
  }

  // 4. Oblio DTO
  const oblioRequest = buildOblioInvoiceRequest({
    contract: {
      berlo_nev: contract.berlo_nev,
      ceg_nev: contract.ceg_nev,
      ceg_adoszam: contract.ceg_adoszam,
      targy: contract.targy,
      leiras: contract.leiras,
      tipus: contract.tipus,
      osszeg: contract.osszeg,
      fizetesi_ciklus: contract.fizetesi_ciklus,
    },
    oblioConfig: {
      cif: creds.cif,
      sorozat_default: creds.sorozat,
      nev_default_service: creds.serviceName,
    },
    invoice: {
      szamlaDatum: input.szamlaDatum,
      esedekesseg: input.esedekesseg,
      idoszak: input.idoszak,
      osszeg: input.osszeg,
      megjegyzes: input.megjegyzes,
    },
    tvaAlany,
    tvaKulcsSzazalek,
  })

  // ── 4b. DUPLIKÁTUM-KAPU (2026-09-03, átvilágítás P0) ───────────────────
  //
  // ⛔ A HIBA: az `issueInvoice` nem volt idempotens. Az Oblio-hívásnak 20 mp
  // timeoutja van (`oblio-client.ts`), és a megszakítás után a POST már REG az
  // Oblio-nál lehet — a lelkész viszont csak annyit lát, hogy „Kapcsolódási
  // hiba", a gomb újra aktív, a dialógus nyitva marad. Egy kattintás, és
  // MÁSODIK, jogilag érvényes, ANAF SPV-re felmenő e-Factura keletkezik. A
  // KARTOTEKÁBAN az elsőről semmi nyom, mert a DB-írás elmaradt.
  //
  // Ugyanez áll elő, ha az Oblio-hívás sikerül, de az INSERT bukik el (a
  // `e_factura_status` nyersen megy egy CHECK-be, a `szam` pedig NaN lehet).
  //
  // A KAPU: természetes kulcs séma-változtatás NÉLKÜL — ugyanahhoz a
  // szerződéshez, ugyanazzal a számla-dátummal és nettó összeggel már van-e
  // élő (nem sztornózott) számla. FAIL-CLOSED: ha az ellenőrzés nem
  // futtatható, NEM állítunk ki számlát. Egy fölösleges e-Factura az ANAF-nál
  // sokkal drágább, mint egy elhalasztott kiállítás.
  //
  // ⚠️ Ez a kapu a SORRENDI (retry) duplikátumot fogja meg. A dupla kattintást
  // a dialógus `loading` állapota gátolja — a kettő együtt kell.
  if (!input.megerositettDuplikatum) {
    const { data: mar, error: dupErr } = await access.supabase
      .from('oblio_szamlak')
      .select('id, sorozat, szam, szamla_datum')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('berleti_szerzodes_id', input.berletiSzerzodesId)
      .eq('tipus', 'e_factura')
      .eq('stornozott', false)
      .eq('szamla_datum', input.szamlaDatum)
      .eq('osszeg_net', input.osszeg)
      .limit(1)

    if (dupErr) {
      return {
        error:
          'Nem sikerült ellenőrizni, készült-e már számla erre a tételre — ezért biztonsági okból ' +
          `NEM állítottunk ki újat. (${dupErr.message}) Próbáld újra pár perc múlva.`,
      }
    }
    if (mar && mar.length > 0) {
      const s = mar[0] as { sorozat: string | null; szam: number | null }
      return {
        duplikatumGyanu: true,
        error:
          `Ehhez a szerződéshez ${input.szamlaDatum} dátummal, ${input.osszeg} RON nettó összeggel ` +
          `MÁR van kiállított számla (${s.sorozat ?? '?'}-${s.szam ?? '?'}). ` +
          'Ha az előző kísérlet hibaüzenettel állt le, valószínűleg AKKOR is elkészült a számla az Oblio-ban. ' +
          'Csak akkor állíts ki újat, ha tudatosan másodikat akarsz.',
      }
    }
  }

  // 5. Oblio API hívás
  let oblioResp
  try {
    oblioResp = await createInvoice(creds.email, creds.apiSecret, oblioRequest)
  } catch (err) {
    if (err instanceof OblioError) return { error: err.message }
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `Oblio hiba: ${msg}` }
  }

  if (oblioResp.status !== 200 || !oblioResp.data) {
    return { error: `Oblio visszautasította: ${oblioResp.statusMessage}` }
  }

  const invoiceData = oblioResp.data

  // 6. Mentés a DB-be
  const osszegNet = input.osszeg
  // UGYANAZ a kulcs, mint amit a számlára írtunk — külön szám itt azt jelentené,
  // hogy a KARTOTEKA mást tart nyilván, mint ami az ANAF-hoz felment.
  const osszegTva = tvaAlany ? Math.round(osszegNet * (tvaKulcsSzazalek / 100) * 100) / 100 : 0
  const osszegBrut = osszegNet + osszegTva

  const { data: inserted, error: insErr } = await access.supabase
    .from('oblio_szamlak')
    .insert({
      congregation_id: access.effectiveCongregationId,
      oblio_fiok_id: creds.oblioFiokId,
      berleti_szerzodes_id: input.berletiSzerzodesId,
      tipus: 'e_factura',
      sorozat: invoiceData.seriesName,
      szam: Number(invoiceData.number),
      szamla_datum: invoiceData.issueDate,
      esedekesseg: invoiceData.dueDate || input.esedekesseg,
      klienesseg_nev: contract.ceg_nev || contract.berlo_nev,
      klienesseg_cui: contract.ceg_adoszam,
      osszeg_net: osszegNet,
      osszeg_tva: osszegTva,
      osszeg_brut: osszegBrut,
      pdf_url: invoiceData.link,
      e_factura_uuid: invoiceData.einvoice?.uuid || null,
      // ROMÁN státuszok az Oblio API hivatalos doksija szerint (lásd oblio-types.ts):
      //   nepreluat → még nem küldve az SPV-re
      //   in_prelucrare → feldolgozás alatt
      //   ok / nok → elfogadva / elutasítva
      e_factura_status: (invoiceData.einvoice?.status as string | undefined) || 'nepreluat',
      issued_by: access.user.id,
      megjegyzes: input.megjegyzes || null,
    })
    .select('id')
    .maybeSingle()

  if (insErr) {
    // ⛔ A LEGVESZÉLYESEBB ÁLLAPOT (2026-09-03): a számla az Oblio-ban MÁR
    // ELKÉSZÜLT, csak a mi nyilvántartásunkba nem került be. A régi üzenet
    // („DB hiba: …") azt sugallta, hogy semmi nem történt — a lelkész pedig
    // újra megnyomta a gombot, és MÁSODIK adóügyi számla keletkezett.
    // Most KIMONDJUK a számla azonosítóját, és megtiltjuk az újrapróbálkozást.
    console.error('[issueInvoice] Az Oblio-számla elkészült, de a DB-írás elbukott:', {
      sorozat: invoiceData.seriesName,
      szam: invoiceData.number,
      hiba: insErr.message,
    })
    return {
      error:
        `⚠️ A számla az Oblio-ban ELKÉSZÜLT (${invoiceData.seriesName}-${invoiceData.number}), ` +
        'de a Kartotékába nem sikerült bejegyezni. ' +
        'NE állíts ki újat — az kétszeres, hatóságnak felmenő számlát jelentene. ' +
        `Jegyezd fel a számla számát, és jelezd a fejlesztőnek. (Technikai ok: ${insErr.message})`,
    }
  }

  revalidatePath('/penzugy')
  return { success: true, oblioSzamlaId: inserted?.id }
}

// ─────────────────────────────────────────────────────────────
// Státusz szinkronizálás
// ─────────────────────────────────────────────────────────────

export async function syncInvoiceStatus(oblioSzamlaId: string): Promise<{
  success?: boolean
  status?: string
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: row, error } = await access.supabase
    .from('oblio_szamlak')
    .select('id, sorozat, szam, tipus, oblio_fiok_id')
    .eq('id', oblioSzamlaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!row) return { error: 'Számla nem található.' }
  if (row.tipus !== 'e_factura') return { error: 'Csak e-Factura számlát lehet szinkronizálni.' }

  const credsOrError = await loadOblioCredentials(access.supabase, access.effectiveCongregationId)
  if ('error' in credsOrError) return credsOrError
  const creds = credsOrError

  let oblioResp
  try {
    oblioResp = await getInvoice(creds.email, creds.apiSecret, creds.cif, row.sorozat, row.szam)
  } catch (err) {
    if (err instanceof OblioError) return { error: err.message }
    return { error: String(err) }
  }

  if (oblioResp.status !== 200 || !oblioResp.data) {
    return { error: oblioResp.statusMessage || 'Oblio ismeretlen hiba.' }
  }

  // Az Oblio ROMÁN kulcsokat ad vissza: nepreluat / in_prelucrare / ok / nok
  const newStatus = String(oblioResp.data.einvoice?.status ?? 'nepreluat')

  const { error: updErr } = await access.supabase
    .from('oblio_szamlak')
    .update({
      e_factura_status: newStatus,
      pdf_url: oblioResp.data.link,
      utolso_szinkronizalas_at: new Date().toISOString(),
    })
    .eq('id', oblioSzamlaId)

  if (updErr) return { error: updErr.message }

  revalidatePath('/penzugy')
  return { success: true, status: newStatus }
}

// ─────────────────────────────────────────────────────────────
// Kifizetés rögzítése (collect)
// ─────────────────────────────────────────────────────────────

export async function markInvoicePaid(args: {
  oblioSzamlaId: string
  befizetesId?: number
  collectValue?: number
  collectDate?: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const { data: row } = await access.supabase
    .from('oblio_szamlak')
    .select('id, sorozat, szam, tipus, osszeg_brut')
    .eq('id', args.oblioSzamlaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (!row) return { error: 'Számla nem található.' }

  if (row.tipus === 'e_factura') {
    // Oblio collect hívás
    const credsOrError = await loadOblioCredentials(access.supabase, access.effectiveCongregationId)
    if ('error' in credsOrError) return credsOrError
    const creds = credsOrError

    try {
      await collectInvoice(creds.email, creds.apiSecret, {
        cif: creds.cif,
        seriesName: row.sorozat,
        number: row.szam,
        collect: {
          type: 'Ordin de plata',
          value: args.collectValue ?? row.osszeg_brut,
          issueDate: args.collectDate ?? new Date().toISOString().slice(0, 10),
        },
      })
    } catch (err) {
      if (err instanceof OblioError) return { error: err.message }
      return { error: String(err) }
    }
  }
  // chitanta_papir esetén csak lokális frissítés

  const { error } = await access.supabase
    .from('oblio_szamlak')
    .update({
      collected_at: args.collectDate
        ? new Date(args.collectDate).toISOString()
        : new Date().toISOString(),
      befizetes_id: args.befizetesId ?? null,
    })
    .eq('id', args.oblioSzamlaId)

  if (error) return { error: error.message }

  revalidatePath('/penzugy')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Sztornó
// ─────────────────────────────────────────────────────────────

export async function stornoInvoice(args: {
  oblioSzamlaId: string
  indok: string
}): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const indok = (args.indok || '').trim()
  if (indok.length < 5) {
    return { error: 'A sztornó indoklás legalább 5 karakter legyen.' }
  }

  const { data: row } = await access.supabase
    .from('oblio_szamlak')
    .select('id, sorozat, szam, tipus, stornozott, collected_at')
    .eq('id', args.oblioSzamlaId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (!row) return { error: 'Számla nem található.' }
  if (row.stornozott) return { error: 'Ez a számla már sztornózva van.' }

  if (row.tipus === 'e_factura') {
    const credsOrError = await loadOblioCredentials(access.supabase, access.effectiveCongregationId)
    if ('error' in credsOrError) return credsOrError
    const creds = credsOrError

    try {
      await deleteInvoice(creds.email, creds.apiSecret, {
        cif: creds.cif,
        seriesName: row.sorozat,
        number: row.szam,
      })
    } catch (err) {
      if (err instanceof OblioError) {
        // ⛔ 2026-09-03 (átvilágítás): FAIL-CLOSED. A DELETE az Oblio-ban csak
        // TERVEZET számlára működik. Ha a számla már felment az ANAF SPV-re, az
        // Oblio hibát ad — a régi kód ilyenkor MÉGIS sztornózottnak jelölte
        // lokálisan. Ettől a KARTOTEKA azt állította, hogy a számla sztornózva
        // van, miközben a hatóságnál ÉLŐ, érvényes bizonylat maradt. Ez a
        // legrosszabb fajta hazugság: csendes és hivatalos.
        //
        // Mostantól nem írunk semmit — hangosan megmondjuk, mi a teendő.
        return {
          error:
            'Az Oblio nem tudta sztornózni a számlát — valószínűleg már felment az ANAF SPV-re, ' +
            'és onnan nem visszavonható. Ilyenkor SZTORNÓ-SZÁMLÁT kell kiállítani (a könyvelővel egyeztetve); ' +
            'a Kartotékában szándékosan NEM jelöljük sztornózottnak, hogy a nyilvántartás ne mondjon mást, ' +
            `mint a hatóság. (Oblio üzenete: ${err.message})`,
        }
      } else {
        return { error: String(err) }
      }
    }
  }

  const { error } = await access.supabase
    .from('oblio_szamlak')
    .update({
      stornozott: true,
      stornozott_at: new Date().toISOString(),
      stornozott_indok: indok,
    })
    .eq('id', args.oblioSzamlaId)

  if (error) return { error: error.message }

  revalidatePath('/penzugy')
  return { success: true }
}
