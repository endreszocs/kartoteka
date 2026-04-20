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
}

export async function issueInvoice(input: IssueInvoiceInput): Promise<{
  success?: boolean
  oblioSzamlaId?: string
  error?: string
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

  // 3. Gyülekezet TVA-alany státusz (a TVA% döntéshez)
  const { data: cong } = await access.supabase
    .from('congregations')
    .select('tva_alany')
    .eq('id', access.effectiveCongregationId)
    .maybeSingle()
  const tvaAlany = Boolean(cong?.tva_alany)

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
  })

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
  const osszegTva = tvaAlany ? Math.round(osszegNet * 0.19 * 100) / 100 : 0
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

  if (insErr) return { error: `DB hiba: ${insErr.message}` }

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
        // A DELETE az Oblio-ban csak tervezetre működik. Ha már SPV-n van,
        // itt hibát kap — akkor a lokális DB-ben jelöljük sztornózottnak,
        // és az alkalmazás szintjén a könyvelőnek kell külön sztornó-számlát
        // kiállítania. Ez külön fejlesztés (WC-2 Phase B).
        // Most: jelöljük sztornózottnak, és logoljuk az Oblio hibát.
        console.warn('[oblio] Sztornó az Oblio-ban sikertelen, lokálisan jelöljük:', err.message)
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
