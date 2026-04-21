/**
 * Oblio REST API típusok.
 *
 * Referencia: https://www.oblio.eu/api
 *
 * Minden API hívás Bearer tokennel authentikál. A token a
 * `/api/authorize/token` endpointról igényelhető email + api_secret párossal.
 *
 * Az Oblio automatikusan push-olja a kiállított számlákat az ANAF e-Factura
 * SPV-re (periódikus cron-szerű sync az Oblio oldalán). A státuszt a GET
 * invoice válaszban látjuk.
 */

// ─────────────────────────────────────────────────────────────
// Authentikáció
// ─────────────────────────────────────────────────────────────

export interface OblioTokenRequest {
  client_id: string // az Oblio email
  client_secret: string // az API secret
  grant_type: 'client_credentials'
}

export interface OblioTokenResponse {
  access_token: string
  expires_in: number // seconds
  token_type: string // "Bearer"
  request_time: number
  scope: string | null
}

// ─────────────────────────────────────────────────────────────
// Nomenclature (cégek, partnerek, sorozatok)
// ─────────────────────────────────────────────────────────────

export interface OblioCompany {
  cif: string
  company: string
  userType?: string
  vatPayer?: boolean
  vatOnPayment?: boolean
}

export interface OblioCompaniesResponse {
  status: number // 200 ha ok
  statusMessage: string
  data: OblioCompany[]
}

export interface OblioClient {
  cif?: string // CUI, ha cég; NULL ha magánszemély (akkor a name kötelező)
  name: string
  rc?: string // cégbejegyzési szám
  code?: string // belső azonosító
  address?: string
  state?: string
  city?: string
  country?: string // ISO kód, pl. "RO"
  iban?: string
  bank?: string
  email?: string
  phone?: string
  contact?: string
  /** TRUE, ha a bérlő ÁFA-alany (Oblio doksi: vatPayer). Hivatalos mező, korábban hiányzott. */
  vatPayer?: boolean
}

export interface OblioClientsResponse {
  status: number
  statusMessage: string
  data: OblioClient[]
}

// ─────────────────────────────────────────────────────────────
// Termékek / szolgáltatások
// ─────────────────────────────────────────────────────────────

export type OblioProductType =
  | 'Serviciu'
  | 'Marfa'
  | 'Produs finit'
  | 'Semifabricate'
  | 'Materii prime'
  | 'Materiale consumabile'
  | 'Materiale de natura obiectelor de inventar'
  | 'Ambalaje'

export interface OblioProduct {
  name: string
  measuringUnit: string // 'buc', 'ore', 'luni' stb.
  currency: string // 'RON'
  quantity: number
  price: number // egységár
  vatName?: string // 'Normala' | 'Redusa' | 'Scutit fără drept de deducere' stb.
  vatPercentage: number // 0, 5, 9, 19
  vatIncluded?: boolean // TRUE = price tartalmazza a TVA-t
  productType: OblioProductType
  code?: string
  description?: string
  discount?: number // százalék
  discountType?: 'procentual' | 'valoric'
}

// ─────────────────────────────────────────────────────────────
// Számla (invoice)
// ─────────────────────────────────────────────────────────────

export interface OblioInvoiceCreateRequest {
  cif: string // a kibocsátó cég CUI-ja (congregation.cif)
  client: OblioClient
  issueDate: string // YYYY-MM-DD
  dueDate?: string // YYYY-MM-DD
  seriesName: string // 'KA', 'FAC' stb.
  number?: number // Ha nem adjuk meg, az Oblio automatikusan adja
  language?: 'RO' | 'EN'
  precision?: number // tizedes pontosság (0-4)
  currency?: string // 'RON' alapértelmezett
  useStock?: 0 | 1 // 1 = csökkenti a raktári készletet
  products: OblioProduct[]
  issuerName?: string // kibocsátó neve
  issuerId?: string // kibocsátó CNP/CUI
  noticeNumber?: string
  internalNote?: string // belső megjegyzés (nem jelenik meg a számlán)
  mentions?: string // megjelenik a számlán ("Menţiuni" szakasz)
  workStation?: string
  deliveryDate?: string
  collect?: {
    type: string // 'Ordin de plata' | 'Chitanta' | 'Card' | 'Bon fiscal' stb.
    documentNumber?: string
    value?: number
    issueDate?: string
  }
}

/**
 * Oblio e-Factura státusz — ROMÁN értékek a hivatalos Oblio API szerint
 * (NEM az angol pending/sent/accepted/rejected, mint egy korábbi kutatás feltételezte).
 */
export type OblioEinvoiceStatus =
  | 'nepreluat' // még nem küldve az SPV-re
  | 'in_prelucrare' // ANAF-nál feldolgozás alatt
  | 'ok' // sikeres, elfogadva
  | 'nok' // elutasítva

export interface OblioEinvoiceInfo {
  uuid?: string // ANAF upload index
  status?: OblioEinvoiceStatus | string
  error?: string
  errors?: string[] | Record<string, unknown>
  message?: string
  [key: string]: unknown
}

export interface OblioInvoiceData {
  seriesName: string
  number: string // szám mint string
  issueDate: string
  dueDate?: string
  link: string // PDF URL
  einvoice?: OblioEinvoiceInfo
  total?: number
  currency?: string
  [key: string]: unknown
}

export interface OblioInvoiceResponse {
  status: number // 200 ha ok
  statusMessage: string
  data?: OblioInvoiceData
}

// ─────────────────────────────────────────────────────────────
// Collect (kifizetés rögzítése)
// ─────────────────────────────────────────────────────────────

export interface OblioCollectRequest {
  cif: string
  seriesName: string
  number: number
  collect: {
    type: string
    documentNumber?: string
    value?: number
    issueDate?: string
  }
}

export interface OblioCollectResponse {
  status: number
  statusMessage: string
  data?: {
    seriesName: string
    number: string
  }
}

// ─────────────────────────────────────────────────────────────
// Delete (sztornó)
// ─────────────────────────────────────────────────────────────

export interface OblioInvoiceDeleteRequest {
  cif: string
  seriesName: string
  number: number
}

export interface OblioInvoiceDeleteResponse {
  status: number
  statusMessage: string
}

// ─────────────────────────────────────────────────────────────
// Lista-lekérdezés (search) — GET /api/docs/invoice query paramterrel
// ─────────────────────────────────────────────────────────────

/**
 * Számla-lista lekérdezés paraméterei. A hivatalos Oblio API engedi
 * a dátum- és partner-szerinti szűrést.
 *
 * Példa: egy tranzakcióhoz tartozik-e számla? Kérdezzük:
 * { cif, issuedAfter: transactionDate, issuedBefore: transactionDate,
 *   'client[name]': partnerName, withEInvoiceStatus: 1 }
 */
export interface OblioInvoiceListParams {
  /** Kötelező: a kibocsátó cég CIF-je. */
  cif: string
  /** Számlasorozat szűrő (opcionális). */
  seriesName?: string
  /** Csak piszkozatok? (opcionális) */
  draft?: boolean
  /** Partner CIF-je (cég bérlő). */
  'client[cif]'?: string
  /** Partner emailje. */
  'client[email]'?: string
  /** Partner neve (részleges is). */
  'client[name]'?: string
  /** Sztornózott számlák is? */
  canceled?: boolean
  /** Dátum tól (YYYY-MM-DD). */
  issuedAfter?: string
  /** Dátum ig (YYYY-MM-DD). */
  issuedBefore?: string
  /** A termékek is jöjjenek vissza? */
  withProducts?: boolean | 0 | 1
  /** Az e-Factura státusz is jöjjön vissza? */
  withEInvoiceStatus?: boolean | 0 | 1
  /** Rendezés. */
  orderBy?: string
  orderDir?: 'asc' | 'desc'
  limitPerPage?: number
  offset?: number
}

/**
 * Egy számla a lista-lekérdezés válaszában.
 */
export interface OblioInvoiceListItem {
  seriesName: string
  number: string
  issueDate: string
  dueDate?: string
  total?: number
  currency?: string
  link?: string
  canceled?: boolean
  einvoice?: OblioEinvoiceInfo
  client?: {
    cif?: string
    name?: string
  }
  [key: string]: unknown
}

export interface OblioInvoiceListResponse {
  status: number
  statusMessage: string
  data?: OblioInvoiceListItem[]
}
