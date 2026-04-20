'use server'

/**
 * Oblio számla-lookup a tranzakciókhoz.
 *
 * Célja: egy befizetés (vagy kiadás) soron megmutatni, hogy van-e hozzá
 * kiállított Oblio számla, és milyen állapotban.
 *
 * Kétlépcsős keresés:
 *   1. LOKÁLIS DB: oblio_szamlak tábla — ha már korábban szinkronizáltuk
 *      vagy a KARTOTEKA állította ki, a match gyors.
 *   2. OBLIO API: ha DB-ben nincs, akkor az Oblio lista-végpont (`GET
 *      /api/docs/invoice`) dátum + partner + összeg szerint megkeresi.
 *      Ha ott találtunk, bemegy a DB-be (sync), és legközelebb már
 *      lokálisan megvan.
 *
 * A hívások rate-limit miatt 60 mp-ig cache-eltek (memóriában).
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { decryptSecret } from '@/lib/supabase/secret-vault'
import { listInvoices } from '@/lib/finance/oblio/oblio-client'
import { OblioError } from '@/lib/finance/oblio/oblio-errors'
import type { OblioInvoiceListItem, OblioEinvoiceStatus } from '@/lib/finance/oblio/oblio-types'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

export type OblioMatchSource = 'db' | 'oblio_api' | 'none'

export type OblioMatchResult = {
  source: OblioMatchSource
  found: boolean
  /**
   * e-Factura státusz ROMÁN értékekkel (lásd OblioEinvoiceStatus),
   * vagy 'not_applicable' ha chitanță, vagy undefined ha nincs match.
   */
  status?: OblioEinvoiceStatus | 'not_applicable' | string
  pdfUrl?: string
  oblioSzamlaId?: string
  oblioInvoiceSeries?: string
  oblioInvoiceNumber?: number
  clientName?: string
  invoiceDate?: string
  total?: number
  error?: string
}

export type FindOblioMatchParams = {
  /** A tranzakció típusa. */
  transactionType: 'befizetes' | 'kiadas'
  /** ID — optional, ha a DB-ben a befizetes_id már tárolt match-et akarunk lekérdezni. */
  transactionId?: number
  /** A tranzakció dátuma (YYYY-MM-DD). */
  date: string
  /** A partner/forrás/átvevő neve a tranzakcióból. */
  partnerName: string | null
  /** Opcionális összeg — pontosabb matchelést segíti. */
  amount?: number
  /** A bruttó összeg ± tolerancia (RON). 0.5 RON alapértelmezett. */
  amountTolerance?: number
  /** Dátum-tolerancia napokban. Alapértelmezetten 2. */
  dateToleranceDays?: number
}

// ─────────────────────────────────────────────────────────────
// Memóriacache (rate limit védelem)
// ─────────────────────────────────────────────────────────────

type CacheEntry = { value: OblioMatchResult; expiresAt: number }
const matchCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function cacheKey(congregationId: string, p: FindOblioMatchParams): string {
  return `${congregationId}|${p.date}|${(p.partnerName || '').toLowerCase().trim()}|${p.amount ?? ''}|${p.transactionType}`
}

function getCached(key: string): OblioMatchResult | null {
  const hit = matchCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    matchCache.delete(key)
    return null
  }
  return hit.value
}

function setCached(key: string, value: OblioMatchResult): void {
  matchCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

// ─────────────────────────────────────────────────────────────
// Segéd: dátumsáv
// ─────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─────────────────────────────────────────────────────────────
// A fő lookup action
// ─────────────────────────────────────────────────────────────

export async function findOblioMatchForTransaction(
  params: FindOblioMatchParams,
): Promise<OblioMatchResult> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { source: 'none', found: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) {
    return { source: 'none', found: false, error: 'Nincs aktív gyülekezet.' }
  }

  const congregationId = access.effectiveCongregationId
  const ck = cacheKey(congregationId, params)
  const cached = getCached(ck)
  if (cached) return cached

  const tolDays = params.dateToleranceDays ?? 2
  const tolAmount = params.amountTolerance ?? 0.5
  const partner = (params.partnerName || '').trim()

  // ─── 1. LOKÁLIS DB keresés ───
  // Ha kiadási sorról beszélünk, csak a befizetes_id alapján nem megy — most
  // a befizetésre fókuszálunk. Kiadás Oblio-számlázása nincs még (a lelkész
  // nem állít ki számlát kiadásra).
  if (params.transactionType === 'befizetes' && params.transactionId) {
    const { data: dbMatch } = await access.supabase
      .from('oblio_szamlak')
      .select('id, tipus, sorozat, szam, szamla_datum, klienesseg_nev, osszeg_brut, e_factura_status, pdf_url')
      .eq('congregation_id', congregationId)
      .eq('befizetes_id', params.transactionId)
      .eq('stornozott', false)
      .limit(1)
      .maybeSingle()

    if (dbMatch) {
      const out: OblioMatchResult = {
        source: 'db',
        found: true,
        status: dbMatch.tipus === 'chitanta_papir' ? 'not_applicable' : (dbMatch.e_factura_status || 'nepreluat'),
        pdfUrl: dbMatch.pdf_url ?? undefined,
        oblioSzamlaId: dbMatch.id,
        oblioInvoiceSeries: dbMatch.sorozat,
        oblioInvoiceNumber: dbMatch.szam,
        clientName: dbMatch.klienesseg_nev,
        invoiceDate: dbMatch.szamla_datum,
        total: dbMatch.osszeg_brut,
      }
      setCached(ck, out)
      return out
    }
  }

  // Másik DB-oldali heurisztika: partner + dátum + összeg
  if (partner) {
    const afterDate = addDays(params.date, -tolDays)
    const beforeDate = addDays(params.date, tolDays)

    const { data: heuristic } = await access.supabase
      .from('oblio_szamlak')
      .select('id, tipus, sorozat, szam, szamla_datum, klienesseg_nev, osszeg_brut, e_factura_status, pdf_url')
      .eq('congregation_id', congregationId)
      .eq('stornozott', false)
      .gte('szamla_datum', afterDate)
      .lte('szamla_datum', beforeDate)
      .ilike('klienesseg_nev', `%${partner}%`)
      .limit(5)

    if (heuristic && heuristic.length > 0) {
      // Ha van összeg, akkor annak a közelében lévőt választjuk
      let best = heuristic[0]
      if (params.amount !== undefined) {
        const target = params.amount
        const inRange = heuristic.filter((r) => Math.abs((r.osszeg_brut ?? 0) - target) <= tolAmount)
        if (inRange.length > 0) best = inRange[0]
      }

      const out: OblioMatchResult = {
        source: 'db',
        found: true,
        status: best.tipus === 'chitanta_papir' ? 'not_applicable' : (best.e_factura_status || 'nepreluat'),
        pdfUrl: best.pdf_url ?? undefined,
        oblioSzamlaId: best.id,
        oblioInvoiceSeries: best.sorozat,
        oblioInvoiceNumber: best.szam,
        clientName: best.klienesseg_nev,
        invoiceDate: best.szamla_datum,
        total: best.osszeg_brut,
      }
      setCached(ck, out)
      return out
    }
  }

  // ─── 2. OBLIO API keresés ───
  // Csak akkor menjünk oda, ha van Oblio config.
  const { data: cfg } = await access.supabase
    .from('oblio_fiokok')
    .select('id, email, api_secret_encrypted, cif, aktiv')
    .eq('congregation_id', congregationId)
    .eq('aktiv', true)
    .maybeSingle()

  if (!cfg) {
    const out: OblioMatchResult = { source: 'none', found: false }
    setCached(ck, out)
    return out
  }

  // Visszafejtés
  let apiSecret: string
  try {
    apiSecret = await decryptSecret(access.supabase, cfg.api_secret_encrypted)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { source: 'none', found: false, error: `Titkosítási hiba: ${msg}` }
  }

  // Oblio lista-lekérdezés
  let items: OblioInvoiceListItem[] = []
  try {
    const resp = await listInvoices(cfg.email, apiSecret, {
      cif: cfg.cif,
      issuedAfter: addDays(params.date, -tolDays),
      issuedBefore: addDays(params.date, tolDays),
      ...(partner ? { 'client[name]': partner } : {}),
      withEInvoiceStatus: 1,
      limitPerPage: 10,
    })
    items = resp.data ?? []
  } catch (err) {
    const msg = err instanceof OblioError ? err.message : err instanceof Error ? err.message : String(err)
    const out: OblioMatchResult = {
      source: 'none',
      found: false,
      error: `Oblio lekérdezés sikertelen: ${msg}`,
    }
    setCached(ck, out)
    return out
  }

  if (items.length === 0) {
    const out: OblioMatchResult = { source: 'none', found: false }
    setCached(ck, out)
    return out
  }

  // Összeg szerint szűrés, ha van
  let best = items[0]
  if (params.amount !== undefined) {
    const target = params.amount
    const inRange = items.filter((r) => Math.abs((r.total ?? 0) - target) <= tolAmount)
    if (inRange.length > 0) best = inRange[0]
  }

  // DB-be sync (upsert a (congregation_id, sorozat, szam) mentén)
  try {
    await access.supabase
      .from('oblio_szamlak')
      .upsert(
        {
          congregation_id: congregationId,
          oblio_fiok_id: cfg.id,
          tipus: 'e_factura',
          sorozat: best.seriesName,
          szam: Number(best.number),
          szamla_datum: best.issueDate,
          klienesseg_nev: best.client?.name || partner || 'Ismeretlen',
          klienesseg_cui: best.client?.cif ?? null,
          osszeg_brut: best.total ?? 0,
          pdf_url: best.link ?? null,
          e_factura_status: (best.einvoice?.status as string) || 'nepreluat',
          e_factura_uuid: best.einvoice?.uuid ?? null,
          befizetes_id: params.transactionId ?? null,
          utolso_szinkronizalas_at: new Date().toISOString(),
        },
        { onConflict: 'oblio_fiok_id,sorozat,szam' },
      )
  } catch {
    // nem kritikus, csak cache-ből megyünk vissza
  }

  const out: OblioMatchResult = {
    source: 'oblio_api',
    found: true,
    status: (best.einvoice?.status as string) || 'nepreluat',
    pdfUrl: best.link ?? undefined,
    oblioInvoiceSeries: best.seriesName,
    oblioInvoiceNumber: Number(best.number),
    clientName: best.client?.name || partner,
    invoiceDate: best.issueDate,
    total: best.total,
  }
  setCached(ck, out)
  return out
}
