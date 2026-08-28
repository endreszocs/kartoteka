'use server'

/**
 * Oblio ellenőrzés — server action-ök.
 *
 * A kliensnek alapvetően minden adat helyileg van (XML-ek a helyi mappában,
 * cache az IndexedDB-ben). A server csak:
 *   - a perzisztált match-eket kezeli (oblio_kiadas_match tábla)
 *   - a kiadás CUI-frissítést teszi lehetővé
 *   - az utolsó letöltési időpontot rögzíti (ANAF 60 napos figyelmeztetés)
 *   - a notifications-t triggereli a határidőhöz
 */

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { readYearFinalized } from '@kartoteka/core'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { logAuditEvent } from '@/lib/audit/log'

// ─────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────

export type OblioKiadasMatchRow = {
  id: string
  kiadas_id: number
  anaf_uuid: string
  supplier_cui: string | null
  supplier_name: string | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  local_file_relpath: string | null
  match_method: 'auto_cui' | 'auto_name_amount_date' | 'manual'
  match_confidence: 'high' | 'medium' | 'low'
  manual_note: string | null
  matched_at: string
}

export type OblioMinimalKiadas = {
  id: number
  datum: string
  osszeg: number
  /** A partner-név mezők egyike létezik a séma függvényében — `getExpensePartnerName` kezeli */
  kedvezmenyzett?: string | null
  atvevo?: string | null
  /** Az új mező a 2026-04-16 SQL migrációból. */
  kedvezmenyezett_cui?: string | null
  iratszam?: string | null
}

export type OblioDeadlineStatus = {
  status: 'no_user' | 'no_congregation' | 'never_downloaded' | 'ok' | 'notified' | 'already_notified'
  daysSince?: number
  daysRemaining?: number
  kind?: string
  severity?: 'info' | 'warning' | 'danger'
}

// ─────────────────────────────────────────────────────────────
// Listázás — match-ek + kiadások
// ─────────────────────────────────────────────────────────────

export async function listOblioMatchesAndKiadasok(year: number): Promise<{
  matches?: OblioKiadasMatchRow[]
  kiadasok?: OblioMinimalKiadas[]
  utolsoLetoltes?: string | null
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const yearStart = `${year}-01-01`
  // P0-2 (audit 2026-08-28): KIZÁRÓ felső határ — a kiadas.datum TIMESTAMP,
  // az inkluzív '12-31' ott éjfélt jelentene. DATE-oszlopon ekvivalens.
  const yearEnd = `${year + 1}-01-01`

  const [matchesRes, kiadasokRes, oblioRes] = await Promise.all([
    access.supabase
      .from('oblio_kiadas_match')
      .select(
        'id, kiadas_id, anaf_uuid, supplier_cui, supplier_name, invoice_number, invoice_date, invoice_amount, local_file_relpath, match_method, match_confidence, manual_note, matched_at',
      )
      .eq('congregation_id', access.effectiveCongregationId),
    // FONTOS: select('*') — a `kedvezmenyzett` oszlop nem garantáltan
    // létezik a felhasználó DB-jében (régi sémák `atvevo`-t használnak).
    // A `getExpensePartnerName()` kezeli mindkettőt.
    access.supabase
      .from('kiadas')
      .select('*')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('deleted', false)
      .gte('datum', yearStart)
      .lt('datum', yearEnd)
      .order('datum', { ascending: false }),
    access.supabase
      .from('oblio_fiokok')
      .select('utolso_xml_letoltes_at')
      .eq('congregation_id', access.effectiveCongregationId)
      .eq('aktiv', true)
      .maybeSingle(),
  ])

  if (matchesRes.error) return { error: `Match-ek lekérése: ${matchesRes.error.message}` }
  if (kiadasokRes.error) return { error: `Kiadások lekérése: ${kiadasokRes.error.message}` }

  return {
    matches: (matchesRes.data ?? []) as OblioKiadasMatchRow[],
    kiadasok: (kiadasokRes.data ?? []) as OblioMinimalKiadas[],
    utolsoLetoltes: oblioRes.data?.utolso_xml_letoltes_at ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// Match perzisztálás (kézi vagy automatikus)
// ─────────────────────────────────────────────────────────────

export type SaveMatchInput = {
  kiadasId: number
  anafUuid: string
  supplierCui?: string | null
  supplierName?: string | null
  invoiceNumber?: string | null
  invoiceDate?: string | null
  invoiceAmount?: number | null
  localFileRelpath?: string | null
  method: 'auto_cui' | 'auto_name_amount_date' | 'manual'
  confidence?: 'high' | 'medium' | 'low'
  manualNote?: string | null
  /** Ha true, a kiadás `kedvezmenyezett_cui`-ját is feltöltjük az XML CUI-ból. */
  syncCuiToKiadas?: boolean
}

export async function saveOblioMatch(input: SaveMatchInput): Promise<{
  success?: boolean
  matchId?: string
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  if (!input.kiadasId || !input.anafUuid) {
    return { error: 'A kiadás és az ANAF UUID kötelező.' }
  }

  // Ellenőrizzük, hogy a kiadás a felhasználó scope-jában van
  const { data: kiadas, error: kErr } = await access.supabase
    .from('kiadas')
    .select('id, congregation_id, kedvezmenyezett_cui')
    .eq('id', input.kiadasId)
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (kErr) return { error: kErr.message }
  if (!kiadas) return { error: 'A kiadás nem található vagy nincs jogosultság.' }

  const payload = {
    congregation_id: access.effectiveCongregationId,
    kiadas_id: input.kiadasId,
    anaf_uuid: input.anafUuid,
    supplier_cui: input.supplierCui ?? null,
    supplier_name: input.supplierName ?? null,
    invoice_number: input.invoiceNumber ?? null,
    invoice_date: input.invoiceDate ?? null,
    invoice_amount: input.invoiceAmount ?? null,
    local_file_relpath: input.localFileRelpath ?? null,
    match_method: input.method,
    match_confidence: input.confidence ?? 'medium',
    manual_note: input.manualNote ?? null,
    matched_by: access.user.id,
    matched_at: new Date().toISOString(),
  }

  // Upsert az anaf_uuid alapján
  const { data, error } = await access.supabase
    .from('oblio_kiadas_match')
    .upsert(payload, { onConflict: 'congregation_id,anaf_uuid' })
    .select('id')
    .maybeSingle()

  if (error) return { error: `Mentés hiba: ${error.message}` }

  // Opcionálisan a kiadás CUI-ját is feltöltjük
  if (input.syncCuiToKiadas && input.supplierCui && !kiadas.kedvezmenyezett_cui) {
    await access.supabase
      .from('kiadas')
      .update({ kedvezmenyezett_cui: input.supplierCui })
      .eq('id', input.kiadasId)
  }

  // P1-8: audit-napló — ki, melyik számlát, melyik kiadáshoz, milyen módszerrel.
  await logAuditEvent(
    {
      action: 'oblio_match_save',
      targetTable: 'oblio_kiadas_match',
      targetId: data?.id ?? null,
      metadata: {
        kiadasId: input.kiadasId,
        anafUuid: input.anafUuid,
        method: input.method,
        confidence: input.confidence ?? 'medium',
        congregationId: access.effectiveCongregationId,
      },
    },
    access.supabase,
  )

  revalidatePath('/penzugy')
  return { success: true, matchId: data?.id }
}

export async function removeOblioMatch(matchId: string): Promise<{
  success?: boolean
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // P3-4: a törölt sorokat is kérjük vissza, hogy nem-létező / más gyülekezethez
  // tartozó id-re NE adjunk hamis sikert.
  const { data: deleted, error } = await access.supabase
    .from('oblio_kiadas_match')
    .delete()
    .eq('id', matchId)
    .eq('congregation_id', access.effectiveCongregationId)
    .select('id, kiadas_id, anaf_uuid')

  if (error) return { error: error.message }
  if (!deleted || deleted.length === 0) {
    return { error: 'A párosítás nem található (lehet, hogy már törölve lett).' }
  }

  // P1-8: audit-napló a törlésről (a párosítás-eltávolítás visszakövethető legyen).
  await logAuditEvent(
    {
      action: 'oblio_match_remove',
      targetTable: 'oblio_kiadas_match',
      targetId: matchId,
      metadata: {
        kiadasId: deleted[0].kiadas_id,
        anafUuid: deleted[0].anaf_uuid,
        congregationId: access.effectiveCongregationId,
      },
    },
    access.supabase,
  )

  revalidatePath('/penzugy')
  return { success: true }
}

/**
 * Csoportos auto-match perzisztálás — a kliens-oldali matcher futtatása után
 * a magas-konfidens (high) match-eket beírjuk a DB-be.
 */
export async function bulkSaveOblioMatches(
  matches: SaveMatchInput[],
): Promise<{ success?: boolean; saved: number; errors: string[] }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { saved: 0, errors: ['Nincs bejelentkezve.'] }
  if (!access.effectiveCongregationId)
    return { saved: 0, errors: ['Nincs aktív gyülekezet.'] }

  if (matches.length === 0) return { success: true, saved: 0, errors: [] }

  // A narrowing nem öröklődik a .map() closure-be — kiemeljük lokálisba.
  const userId = access.user.id

  const errors: string[] = []

  // P1-5: a korábbi N+1 szekvenciális kör (elemenként SELECT + UPSERT +
  // revalidatePath) helyett EGY scope-ellenőrző SELECT + EGY batch UPSERT.
  // 1. Egy lekérdezéssel ellenőrizzük, mely kiadások tartoznak a gyülekezethez.
  const kiadasIds = [...new Set(matches.map((m) => m.kiadasId).filter(Boolean))]
  const { data: validKiadasok, error: kErr } = await access.supabase
    .from('kiadas')
    .select('id')
    .eq('congregation_id', access.effectiveCongregationId)
    .in('id', kiadasIds)
  if (kErr) return { saved: 0, errors: [`Kiadások ellenőrzése: ${kErr.message}`] }
  const validIds = new Set((validKiadasok ?? []).map((k) => k.id as number))

  // 2. Payload-ok összeállítása — csak a hatókörbe eső, érvényes kiadásokra.
  const nowIso = new Date().toISOString()
  const payloads = matches
    .filter((m) => {
      if (!m.kiadasId || !m.anafUuid) {
        errors.push(`UUID ${m.anafUuid}: hiányzó kiadás vagy ANAF UUID.`)
        return false
      }
      if (!validIds.has(m.kiadasId)) {
        errors.push(
          `UUID ${m.anafUuid}: a kiadás (#${m.kiadasId}) nem található vagy nincs jogosultság.`,
        )
        return false
      }
      return true
    })
    .map((m) => ({
      congregation_id: access.effectiveCongregationId,
      kiadas_id: m.kiadasId,
      anaf_uuid: m.anafUuid,
      supplier_cui: m.supplierCui ?? null,
      supplier_name: m.supplierName ?? null,
      invoice_number: m.invoiceNumber ?? null,
      invoice_date: m.invoiceDate ?? null,
      invoice_amount: m.invoiceAmount ?? null,
      local_file_relpath: m.localFileRelpath ?? null,
      match_method: m.method,
      match_confidence: m.confidence ?? 'high',
      manual_note: m.manualNote ?? null,
      matched_by: userId,
      matched_at: nowIso,
    }))

  if (payloads.length === 0) {
    return { success: errors.length === 0, saved: 0, errors }
  }

  // 3. EGYETLEN batch upsert.
  const { data: upserted, error: upErr } = await access.supabase
    .from('oblio_kiadas_match')
    .upsert(payloads, { onConflict: 'congregation_id,anaf_uuid' })
    .select('id')
  if (upErr) {
    return { saved: 0, errors: [...errors, `Mentés hiba: ${upErr.message}`] }
  }

  const saved = upserted?.length ?? payloads.length

  // 4. Egyetlen aggregált audit-bejegyzés (nem elemenként).
  await logAuditEvent(
    {
      action: 'oblio_match_bulk_save',
      targetTable: 'oblio_kiadas_match',
      metadata: {
        saved,
        congregationId: access.effectiveCongregationId,
        methods: [...new Set(payloads.map((p) => p.match_method))],
      },
    },
    access.supabase,
  )

  revalidatePath('/penzugy')
  return { success: errors.length === 0, saved, errors }
}

// ─────────────────────────────────────────────────────────────
// Kiadás CUI frissítés
// ─────────────────────────────────────────────────────────────

export async function updateKiadasCui(
  kiadasId: number,
  cui: string | null,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const cleaned = cui ? cui.trim() : null

  const { error } = await access.supabase
    .from('kiadas')
    .update({ kedvezmenyezett_cui: cleaned })
    .eq('id', kiadasId)
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: error.message }

  await logAuditEvent(
    {
      action: 'oblio_kiadas_cui_update',
      targetTable: 'kiadas',
      metadata: { kiadasId, cui: cleaned, congregationId: access.effectiveCongregationId },
    },
    access.supabase,
  )

  revalidatePath('/penzugy')
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Utolsó letöltés rögzítése
// ─────────────────────────────────────────────────────────────

export async function recordOblioDownloadNow(
  /** Ha megadod, a fájlok tényleges lastModified mtime-ja kerül be.
   *  Ha nincs, fallback-ként az aktuális szerveridő. */
  timestampIso?: string,
): Promise<{
  success?: boolean
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // A timestamp csak akkor írunk, ha nem RÉGEBBI a már tároltnál
  // (elkerüli a véletlen visszaírást régi fájlokra)
  const nowIso = timestampIso && !Number.isNaN(new Date(timestampIso).getTime())
    ? timestampIso
    : new Date().toISOString()

  // P3-4: aktiv=true szűrő — egységesen a listázó és a határidő-RPC logikájával
  // (soft-delete-elt config esetén ne keletkezzen inkonzisztencia).
  const { data: current } = await access.supabase
    .from('oblio_fiokok')
    .select('utolso_xml_letoltes_at')
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('aktiv', true)
    .maybeSingle()

  if (current?.utolso_xml_letoltes_at && new Date(current.utolso_xml_letoltes_at).getTime() > new Date(nowIso).getTime()) {
    // A jelenlegi érték frissebb — ne írjuk felül
    return { success: true }
  }

  // Csak akkor tudjuk frissíteni, ha van aktív oblio_fiokok rekord (= van Oblio config)
  const { error } = await access.supabase
    .from('oblio_fiokok')
    .update({ utolso_xml_letoltes_at: nowIso })
    .eq('congregation_id', access.effectiveCongregationId)
    .eq('aktiv', true)

  if (error) return { error: error.message }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// Kategória-lista (a wizard-hoz)
// ─────────────────────────────────────────────────────────────

export type ExpenseCategoryOption = {
  /** kiadascel.id — ez kerül a kiadas.id_kiadascel mezőbe */
  id: number
  /** A számadási cél kódja (pl. "201.01") */
  kod: string
  /** A számadási cél neve (pl. "Bérek és kifizetések") */
  nev: string
}

export async function getExpenseCategoriesForOblio(): Promise<{
  data?: ExpenseCategoryOption[]
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  // A `kiadascel` táblának nincs `congregation_id` — globálisan érvényes
  // kategória-listát használ a rendszer
  const [celsRes, codesRes] = await Promise.all([
    access.supabase.from('kiadascel').select('id, id_szamadasicel'),
    access.supabase.from('szamadasicel').select('id, nev'),
  ])

  if (celsRes.error) return { error: `Kategóriák: ${celsRes.error.message}` }
  if (codesRes.error) return { error: `Számadási célok: ${codesRes.error.message}` }

  const codeMap = new Map<string, string>()
  for (const c of codesRes.data || []) {
    codeMap.set(String(c.id), c.nev as string)
  }

  const out: ExpenseCategoryOption[] = (celsRes.data || []).map((row) => ({
    id: row.id as number,
    kod: String(row.id_szamadasicel || ''),
    nev: codeMap.get(String(row.id_szamadasicel)) || String(row.id_szamadasicel),
  }))

  // Hierarchikus sorrendben (200, 201, 201.01, ...)
  out.sort((a, b) => a.kod.localeCompare(b.kod, 'hu', { numeric: true }))
  return { data: out }
}

// ─────────────────────────────────────────────────────────────
// Kiadás létrehozása XML-ből + auto-match (a wizard végén)
// ─────────────────────────────────────────────────────────────

export type CreateKiadasFromXmlInput = {
  // XML-ből származó adatok
  anafUuid: string
  supplierName: string | null
  supplierCui: string | null
  invoiceNumber: string | null
  invoiceDate: string // YYYY-MM-DD
  invoiceAmount: number
  localFileRelpath: string | null
  // A felhasználó által választott
  idKiadascel: number
  megjegyzes?: string | null
  /** NULL = kassza, egyébként bankszámla ID */
  bankszamlaId?: number | null
}

export async function createKiadasFromXmlAndMatch(input: CreateKiadasFromXmlInput): Promise<{
  success?: boolean
  kiadasId?: number
  matchId?: string
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // 1. Validáció
  if (!input.anafUuid) return { error: 'ANAF UUID kötelező.' }
  if (!input.idKiadascel) return { error: 'Költségvetési kategória választás kötelező.' }
  if (!input.invoiceDate) return { error: 'A számla dátuma kötelező.' }
  if (!input.invoiceAmount || input.invoiceAmount <= 0)
    return { error: 'Az összeg pozitív szám legyen.' }

  // 1.b Év-zár kapu (P1-5, audit 2026-08-28): a varázsló eddig kapu NÉLKÜL
  // írt a kiadas táblába — a felületről egy már véglegesített (beküldött)
  // évbe is lehetett könyvelni, a beadott számadás és az adatbázis némán
  // széthúzott. Fail-closed: az ISMERETLEN zár-állapot is elutasítás.
  // (A financeWriteBlock itt szándékosan nincs: gyülekezeti hatókörben a
  // readOnly mindig false — a számvevő-írás kérdése a P1-2, külön kör.)
  const szamlaEv = new Date(input.invoiceDate).getFullYear()
  if (!Number.isFinite(szamlaEv)) return { error: 'Érvénytelen számla-dátum.' }
  const evZar = await readYearFinalized(
    access.supabase,
    access.effectiveCongregationId,
    szamlaEv,
  )
  if (evZar.unknown) {
    return {
      error:
        `A ${szamlaEv}. évi számadás zárás-állapotát most nem sikerült ellenőrizni ` +
        `(${evZar.errorMessage || 'ismeretlen hiba'}), ezért a rögzítést biztonságból ` +
        'megszakítottuk — egy már lezárt évbe nem könyvelhetünk véletlenül. Próbáld újra.',
    }
  }
  if (evZar.finalized) {
    return {
      error:
        `A ${szamlaEv}. évi számadás már véglegesítve (és beküldve) van, ezért ebbe az ` +
        'évbe nem rögzíthető új kiadás. Kérj feloldást (javítási engedélyt) az egyházmegyétől.',
    }
  }

  // 2. Új kiadás insert
  const partnerName = input.supplierName?.trim() || 'Ismeretlen beszállító'
  const docNumber = input.invoiceNumber?.trim() || `OBLIO-${input.anafUuid.slice(0, 10)}`

  const canonicalPayload: Record<string, unknown> = {
    osszeg: input.invoiceAmount,
    datum: input.invoiceDate,
    id_kiadascel: input.idKiadascel,
    kedvezmenyzett: partnerName,
    kedvezmenyezett_cui: input.supplierCui || null,
    iratszam: docNumber,
    irattipus: 'szamla',
    megjegyzes:
      input.megjegyzes ||
      `Oblio bevezetés — ANAF UUID: ${input.anafUuid}` +
        (input.invoiceNumber ? ` (${input.invoiceNumber})` : ''),
    deleted: false,
    congregation_id: access.effectiveCongregationId,
    bankszamla_id: input.bankszamlaId ?? null,
  }

  // 2.b A meglévő rendszer egy referencePayload-dal próbál először, ami extra
  // mezőket tartalmaz (xkey, atvevo, atvevoid, userid, nyugta). Ha a tábla
  // nem támogatja, fallback a canonicalra.
  const referencePayload: Record<string, unknown> = {
    ...canonicalPayload,
    nyugta: docNumber,
    xkey: randomUUID(),
    atvevo: partnerName,
    atvevoid: null,
    userid: access.user.id,
  }

  let insertResult = await access.supabase
    .from('kiadas')
    .insert([referencePayload])
    .select('id')
    .maybeSingle()

  if (insertResult.error) {
    // P1-9: a bővebb (referencePayload) insert elbukott — naplózzuk az okot,
    // mielőtt a szűkebb canonical payload-dal próbálnánk (régebbi sémák).
    console.warn(
      '[Oblio wizard] referencePayload insert hiba, canonical próba:',
      insertResult.error.message,
    )
    insertResult = await access.supabase
      .from('kiadas')
      .insert([canonicalPayload])
      .select('id')
      .maybeSingle()
  }

  if (insertResult.error || !insertResult.data) {
    return {
      error: `Kiadás létrehozása sikertelen: ${insertResult.error?.message || 'ismeretlen hiba'}`,
    }
  }

  const kiadasId = insertResult.data.id as number

  // 3. Match perzisztálás
  const matchRes = await saveOblioMatch({
    kiadasId,
    anafUuid: input.anafUuid,
    supplierCui: input.supplierCui,
    supplierName: input.supplierName,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    invoiceAmount: input.invoiceAmount,
    localFileRelpath: input.localFileRelpath,
    method: 'manual',
    confidence: 'high',
    manualNote: 'Wizard alapján bevezetve',
  })

  if (matchRes.error) {
    // P1-9: a kiadás már be van szúrva, de a párosítás elbukott. Kompenzáló
    // visszagörgetés — a frissen létrehozott kiadást kivezetjük (deleted=true),
    // hogy NE maradjon árva, párosítás nélküli (és újrapróbálkozáskor
    // duplikálható) tétel a könyvelésben.
    await access.supabase
      .from('kiadas')
      .update({ deleted: true })
      .eq('id', kiadasId)
      .eq('congregation_id', access.effectiveCongregationId)
    return {
      error: `A párosítás nem mentődött, ezért a kiadás bevezetését visszavontuk: ${matchRes.error}. Kérlek próbáld újra.`,
    }
  }

  // 4. Audit-napló — Oblio XML-ből bevezetett kiadás.
  await logAuditEvent(
    {
      action: 'oblio_kiadas_create_from_xml',
      targetTable: 'kiadas',
      metadata: {
        kiadasId,
        anafUuid: input.anafUuid,
        amount: input.invoiceAmount,
        idKiadascel: input.idKiadascel,
        congregationId: access.effectiveCongregationId,
      },
    },
    access.supabase,
  )

  revalidatePath('/penzugy')
  return { success: true, kiadasId, matchId: matchRes.matchId }
}

// ─────────────────────────────────────────────────────────────
// ANAF 60 napos határidő ellenőrzés (csengő-értesítés)
// ─────────────────────────────────────────────────────────────

export async function checkOblioDeadline(): Promise<OblioDeadlineStatus> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { status: 'no_user' }
  if (!access.effectiveCongregationId) return { status: 'no_congregation' }

  const { data, error } = await access.supabase.rpc('check_oblio_deadline_for_user')
  if (error) {
    return { status: 'no_congregation' }
  }

  // A RPC jsonb-t ad vissza
  const obj = data as { status: string; days_since?: number; days_remaining?: number; kind?: string; severity?: string }

  return {
    status: (obj.status as OblioDeadlineStatus['status']) || 'no_congregation',
    daysSince: obj.days_since,
    daysRemaining: obj.days_remaining,
    kind: obj.kind,
    severity: (obj.severity as OblioDeadlineStatus['severity']) || undefined,
  }
}
