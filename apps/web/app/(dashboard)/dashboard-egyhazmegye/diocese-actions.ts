'use server'

/**
 * Egyházmegyei adatlap („Egyházmegyénk") szerver akciói.
 *
 * ALAPELV (Endre, 2026-04-18):
 *   Az egyházmegye egy önálló jogi és adminisztratív entitás: saját CIF,
 *   adószám, cím, bankszámla, nyugtatömbjei, stb. Csak az esperes vagy
 *   egyházmegyei admin szerkesztheti a saját egyházmegyéjét.
 *
 * Funkciók:
 *   1. getDiocese() — az aktuális (profil-scope) vagy adott egyházmegye adatai
 *   2. updateDiocese(input) — szerkesztés
 *   3. getDioceseBankAccounts(dioceseId) — saját bankszámlák
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { assertDioceseInScope } from '@/lib/auth/admin-scope'
import {
  describeDioceseWriteBlock,
  resolveDioceseReadScopeIds,
  resolveDioceseScopeIds,
} from '@/lib/auth/level-scope'

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export interface DioceseRecord {
  id: string
  name: string
  district_id: string | null

  // Jogi / pénzügyi azonosítók
  cif: string | null
  adoszam: string | null
  cnp_letter: string | null

  // Cím
  cim_orszag: string | null
  cim_megye: string | null
  cim_telepules: string | null
  cim_iranyitoszam: string | null
  cim_utca: string | null

  // Elérhetőségek
  email: string | null
  telefon: string | null
  weboldal: string | null

  // Bank
  bank_nev: string | null
  bank_fo_iban: string | null
  bank_fo_iban_valuta: string | null

  // Vezetés
  esperes_nev: string | null
  esperes_cim: string | null
  jegyzo_nev: string | null

  // Vizuális
  cimer_url: string | null

  megjegyzes: string | null
  updated_at: string
  updated_by: string | null

  // Új cím FK-k (2026-04-21)
  adrlocality_id: number | null
  adrstreet_id: number | null
}

const dioceseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'A név kötelező.'),
  cif: z.string().optional().or(z.literal('')),
  adoszam: z.string().optional().or(z.literal('')),
  cnp_letter: z.string().optional().or(z.literal('')),
  cim_orszag: z.string().optional().or(z.literal('')),
  cim_megye: z.string().optional().or(z.literal('')),
  cim_telepules: z.string().optional().or(z.literal('')),
  cim_iranyitoszam: z.string().optional().or(z.literal('')),
  cim_utca: z.string().optional().or(z.literal('')),
  email: z.string().email('Érvénytelen email.').optional().or(z.literal('')),
  telefon: z.string().optional().or(z.literal('')),
  weboldal: z.string().optional().or(z.literal('')),
  bank_nev: z.string().optional().or(z.literal('')),
  bank_fo_iban: z.string().optional().or(z.literal('')),
  bank_fo_iban_valuta: z.string().default('RON'),
  esperes_nev: z.string().optional().or(z.literal('')),
  esperes_cim: z.string().optional().or(z.literal('')),
  jegyzo_nev: z.string().optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
})

export type DioceseInput = z.infer<typeof dioceseSchema>

// ─────────────────────────────────────────────────────────────────────────
// Jogosultság
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param mode `'write'` (alapértelmezés, fail-closed) = módosító művelet;
 *   `'read'` = puszta lekérdezés. 2026-08-11 (számvevő-kör): az egyházmegyei
 *   SZÁMVEVŐ `'read'`-re átmegy, `'write'`-ra beszédes magyar magyarázatot kap
 *   (nem néma 0 soros mentést és nem nyers RLS-hibát).
 */
async function requireDioceseAccess(
  dioceseId?: string,
  mode: 'read' | 'write' = 'write',
) {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' as const }

  // 2026-08-09: a hatókör az aktív profile_role-ból oldódik fel (a skalár
  // profiles.diocese_id csak fallback) — lásd lib/auth/level-scope.ts.
  const resolvedIds = resolveDioceseScopeIds(access)

  // Ha nincs megadva dioceseId, a feloldott hatókör elsődleges egyházmegyéje
  const targetId = dioceseId || resolvedIds[0] || null
  if (!targetId) return { error: 'Nincs egyházmegye megadva.' as const }

  let canManage = !!access.admin || !!access.master

  // Esperes / egyházmegyei admin: csak a SAJÁT (feloldott) egyházmegyéje
  if (!canManage && !!access.esperes && resolvedIds.includes(targetId)) {
    canManage = true
  }

  // 2026-08-09 FIX: a kerületi admin ág korábban FELTÉTEL NÉLKÜL átengedett —
  // egy A kerületi admin B kerület egyházmegyéjének törzsadatait (IBAN, CIF,
  // címer, kapcsolat) is szerkeszthette. Mostantól a cél egyházmegye
  // district_id-jának a hívó kerület-hatókörébe kell esnie.
  if (!canManage && !!access.egyhazkeruletiAdmin) {
    try {
      await assertDioceseInScope(access, targetId)
      canManage = true
    } catch {
      canManage = false
    }
  }

  // 2026-08-11 (számvevő-kör): OLVASÁSHOZ az ellenőri hatókör is elég.
  // Az adatbázis ugyanezt engedi (current_user_diocese_olvaso_ids()).
  const readIds = resolveDioceseReadScopeIds(access)
  if (!canManage && mode === 'read' && readIds.includes(targetId)) {
    return { supabase: access.supabase, userId: access.user.id, dioceseId: targetId }
  }

  if (!canManage) {
    // Ha van OLVASÓ hatóköre, de írni akar: mondjuk meg, MIÉRT nem megy —
    // a felület ugyanezt a szöveget mutatja a letiltott gombnál.
    if (readIds.includes(targetId)) {
      const reason = describeDioceseWriteBlock(access)
      if (reason) return { error: reason as string }
    }
    return { error: 'Nincs jogosultság az egyházmegye szerkesztéséhez.' as const }
  }

  return { supabase: access.supabase, userId: access.user.id, dioceseId: targetId }
}

// ─────────────────────────────────────────────────────────────────────────
// 1) Olvasás
// ─────────────────────────────────────────────────────────────────────────

export async function getDiocese(dioceseId?: string): Promise<{
  data?: DioceseRecord
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }

  const resolvedIds = resolveDioceseScopeIds(access)
  const targetId = dioceseId || resolvedIds[0] || null
  if (!targetId) return { error: 'Nincs egyházmegye megadva.' }

  // 2026-08-09: tagsági ellenőrzés — korábban BÁRMELY bejelentkezett felhasználó
  // lekérhette BÁRMELY egyházmegye teljes rekordját (IBAN, CIF, esperes-cím),
  // mert a dioceses SELECT RLS USING(true), és itt nem volt app-oldali szűrés.
  // Jogosult:
  //   - master / rendszergazda,
  //   - akinek a feloldott diocese-hatókörében van (esperes / egyházmegyei
  //     admin / számvevő szerepkör az adott egyházmegyére),
  //   - kerületi admin, HA az egyházmegye a saját kerületébe tartozik,
  //   - akinek a (fő vagy hozzárendelt) gyülekezete ebbe az egyházmegyébe tartozik.
  let allowed = !!access.admin || !!access.master || resolvedIds.includes(targetId)

  if (!allowed && !!access.egyhazkeruletiAdmin) {
    try {
      await assertDioceseInScope(access, targetId)
      allowed = true
    } catch {
      // marad false — a gyülekezeti tagsági ág még ellenőrzésre kerül
    }
  }

  if (!allowed) {
    const congIds = [
      access.profileCongregationId,
      access.effectiveCongregationId,
      ...access.assignedCongregations.map((c) => c.id),
    ].filter((id): id is string => !!id)
    if (congIds.length > 0) {
      const { data: own } = await access.supabase
        .from('congregations')
        .select('id')
        .in('id', congIds)
        .eq('diocese_id', targetId)
        .limit(1)
      allowed = !!own && own.length > 0
    }
  }

  if (!allowed) {
    return { error: 'Nincs jogosultsága az egyházmegye adatainak megtekintéséhez.' }
  }

  const { data, error } = await access.supabase
    .from('dioceses')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Egyházmegye nem található.' }

  return { data: data as unknown as DioceseRecord }
}

// ─────────────────────────────────────────────────────────────────────────
// 2) Szerkesztés
// ─────────────────────────────────────────────────────────────────────────

export async function updateDiocese(input: DioceseInput): Promise<{
  ok?: true
  error?: string
  fieldErrors?: Record<string, string>
}> {
  // Zod validáció
  const parsed = dioceseSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.')] = issue.message
    }
    return { error: 'Érvénytelen adat.', fieldErrors }
  }

  const ctx = await requireDioceseAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  const payload = {
    name: parsed.data.name,
    cif: parsed.data.cif || null,
    adoszam: parsed.data.adoszam || null,
    cnp_letter: parsed.data.cnp_letter || null,
    cim_orszag: parsed.data.cim_orszag || null,
    cim_megye: parsed.data.cim_megye || null,
    cim_telepules: parsed.data.cim_telepules || null,
    cim_iranyitoszam: parsed.data.cim_iranyitoszam || null,
    cim_utca: parsed.data.cim_utca || null,
    email: parsed.data.email || null,
    telefon: parsed.data.telefon || null,
    weboldal: parsed.data.weboldal || null,
    bank_nev: parsed.data.bank_nev || null,
    bank_fo_iban: parsed.data.bank_fo_iban || null,
    bank_fo_iban_valuta: parsed.data.bank_fo_iban_valuta || 'RON',
    esperes_nev: parsed.data.esperes_nev || null,
    esperes_cim: parsed.data.esperes_cim || null,
    jegyzo_nev: parsed.data.jegyzo_nev || null,
    megjegyzes: parsed.data.megjegyzes || null,
    updated_by: ctx.userId,
  }

  const { error } = await ctx.supabase
    .from('dioceses')
    .update(payload)
    .eq('id', parsed.data.id)

  if (error) return { error: error.message }

  revalidatePath('/egyhazmegyenk')
  revalidatePath('/dashboard-egyhazmegye')
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────
// 3) Egyházmegye bankszámlái
// ─────────────────────────────────────────────────────────────────────────
// A `bankszamlak` tábla jelenleg `congregation_id`-re van hegesztve.
// Egy későbbi fázisban bővítünk scope-pal, addig csak lekérjük a
// dioceses.bank_fo_iban-t + egy üres listát visszaadunk.

export async function getDioceseBankSummary(dioceseId?: string): Promise<{
  data?: { bank_nev: string | null; bank_fo_iban: string | null; bank_fo_iban_valuta: string | null }
  error?: string
}> {
  // 2026-08-11 (számvevő-kör): puszta lekérdezés → az ellenőri hatókör is elég.
  const ctx = await requireDioceseAccess(dioceseId, 'read')
  if ('error' in ctx) return { error: ctx.error }

  const { data, error } = await ctx.supabase
    .from('dioceses')
    .select('bank_nev, bank_fo_iban, bank_fo_iban_valuta')
    .eq('id', ctx.dioceseId)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Egyházmegye nem található.' }

  return {
    data: {
      bank_nev: (data as { bank_nev: string | null }).bank_nev,
      bank_fo_iban: (data as { bank_fo_iban: string | null }).bank_fo_iban,
      bank_fo_iban_valuta: (data as { bank_fo_iban_valuta: string | null }).bank_fo_iban_valuta,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4) SETUP WIZARD (2026-04-18) — az egyházmegye alapadatai
// ─────────────────────────────────────────────────────────────────────────

/**
 * Kötelező mezők, amelyek hiánya triggeri a setup wizard-ot. Ha az
 * alábbiakból bármelyik üres → a wizard kötelezően megnyílik.
 */
const REQUIRED_SETUP_FIELDS = [
  'name', 'cif', 'cim_orszag', 'cim_megye', 'cim_telepules', 'cim_iranyitoszam',
  'cim_utca', 'email', 'telefon', 'bank_nev', 'bank_fo_iban',
  'esperes_nev', 'esperes_cim', 'jegyzo_nev', 'cimer_url',
] as const

export interface DioceseSetupStatus {
  needsSetup: boolean
  missingFields: string[]
  dioceseId: string | null
}

/**
 * Ellenőrzi, hogy az egyházmegye alapadatai teljesen ki vannak-e töltve.
 * Csak akkor hívd, ha a user aktív profile_role scope-ja 'diocese'
 * (vagy ha a rendszergazda bármely egyházmegyét ellenőrzi).
 */
export async function checkDioceseSetupStatus(dioceseId?: string): Promise<DioceseSetupStatus> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { needsSetup: false, missingFields: [], dioceseId: null }

  // 2026-08-09: a fallback is a feloldott hatókör (aktív szerep → profile_roles
  // → profiles.diocese_id), nem a nyers skalár.
  const targetId = dioceseId || resolveDioceseScopeIds(access)[0] || null
  if (!targetId) return { needsSetup: false, missingFields: [], dioceseId: null }

  const { data } = await access.supabase
    .from('dioceses')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (!data) return { needsSetup: true, missingFields: [...REQUIRED_SETUP_FIELDS], dioceseId: targetId }

  const row = data as Record<string, unknown>
  const missing: string[] = []
  for (const field of REQUIRED_SETUP_FIELDS) {
    const value = row[field]
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      missing.push(field)
    }
  }

  return {
    needsSetup: missing.length > 0,
    missingFields: missing,
    dioceseId: targetId,
  }
}

/**
 * A setup wizard teljes mentése. Validáció után frissíti a `dioceses` sort,
 * és létrehozza a `diocese_bealitas` sort az aktuális évre (üres flag-ekkel),
 * hogy a pénzügyi oldal azonnal működjön.
 */
const setupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'A név kötelező.'),
  cif: z.string().min(1, 'A CIF kötelező.'),
  adoszam: z.string().optional().or(z.literal('')),
  cim_orszag: z.string().min(1, 'Az ország kötelező.'),
  cim_megye: z.string().min(1, 'A megye kötelező.'),
  cim_telepules: z.string().min(1, 'A település kötelező.'),
  cim_iranyitoszam: z.string().min(1, 'Az irányítószám kötelező.'),
  cim_utca: z.string().min(1, 'Az utca kötelező.'),
  email: z.string().email('Érvénytelen email.'),
  telefon: z.string().min(1, 'A telefon kötelező.'),
  weboldal: z.string().optional().or(z.literal('')),
  bank_nev: z.string().min(1, 'A bank neve kötelező.'),
  bank_fo_iban: z.string().min(1, 'Az IBAN kötelező.'),
  bank_fo_iban_valuta: z.string().default('RON'),
  esperes_nev: z.string().min(2, 'Az esperes neve kötelező.'),
  esperes_cim: z.string().min(2, 'Az esperes címe kötelező.'),
  jegyzo_nev: z.string().min(2, 'A jegyző neve kötelező.'),
  cimer_url: z.string().url('Érvénytelen címer URL.'),
  // Új cím FK-k — opcionálisak
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type DioceseSetupInput = z.infer<typeof setupSchema>

export async function saveDioceseSetup(
  input: DioceseSetupInput,
): Promise<{ ok?: true; error?: string; fieldErrors?: Record<string, string> }> {
  const parsed = setupSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join('.')] = issue.message
    return { error: 'Hiányos vagy érvénytelen adat.', fieldErrors }
  }

  const ctx = await requireDioceseAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  // 1. dioceses UPDATE
  const payload = {
    name: parsed.data.name,
    cif: parsed.data.cif,
    adoszam: parsed.data.adoszam || null,
    cim_orszag: parsed.data.cim_orszag,
    cim_megye: parsed.data.cim_megye,
    cim_telepules: parsed.data.cim_telepules,
    cim_iranyitoszam: parsed.data.cim_iranyitoszam,
    cim_utca: parsed.data.cim_utca,
    email: parsed.data.email,
    telefon: parsed.data.telefon,
    weboldal: parsed.data.weboldal || null,
    bank_nev: parsed.data.bank_nev,
    bank_fo_iban: parsed.data.bank_fo_iban,
    bank_fo_iban_valuta: parsed.data.bank_fo_iban_valuta || 'RON',
    esperes_nev: parsed.data.esperes_nev,
    esperes_cim: parsed.data.esperes_cim,
    jegyzo_nev: parsed.data.jegyzo_nev,
    cimer_url: parsed.data.cimer_url,
    // Új cím FK-k
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    adrstreet_id: parsed.data.adrstreet_id ?? null,
    updated_by: ctx.userId,
  }

  const { error: dioErr } = await ctx.supabase
    .from('dioceses')
    .update(payload)
    .eq('id', parsed.data.id)

  if (dioErr) return { error: dioErr.message }

  // 2. diocese_bealitas auto-upsert az aktuális évre (ha még nincs)
  const currentYear = new Date().getFullYear()
  const { error: bealitasErr } = await ctx.supabase
    .from('diocese_bealitas')
    .upsert(
      {
        diocese_id: parsed.data.id,
        eve: currentYear,
        koltsegvetes_veglegesitve: false,
        szamadas_veglegesitve: false,
      },
      { onConflict: 'diocese_id,eve' },
    )

  if (bealitasErr) {
    // Nem kritikus — a setup sikeres, csak a bealitas sor hiányzik
    console.warn('[saveDioceseSetup] diocese_bealitas upsert warning:', bealitasErr.message)
  }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/penzugy')
  revalidatePath('/', 'layout')
  return { ok: true }
}

// ────────────────────────────────────────────────────────────────────
// Partial save — az egyházmegye wizard Tovább gombja minden step után
// ezt hívja. A lelkész kilépéskor NEM veszít adatot: ami ki van töltve,
// megmarad. A végső `saveDioceseSetup` továbbra is szigorúan validál.
// ────────────────────────────────────────────────────────────────────

const setupPartialSchema = z.object({
  id: z.string().uuid(),
  name: z.string().optional(),
  cif: z.string().optional(),
  adoszam: z.string().nullable().optional(),
  cim_orszag: z.string().optional(),
  cim_megye: z.string().optional(),
  cim_telepules: z.string().optional(),
  cim_iranyitoszam: z.string().optional(),
  cim_utca: z.string().optional(),
  email: z.string().optional(),
  telefon: z.string().optional(),
  weboldal: z.string().nullable().optional(),
  bank_nev: z.string().optional(),
  bank_fo_iban: z.string().optional(),
  bank_fo_iban_valuta: z.string().optional(),
  esperes_nev: z.string().optional(),
  esperes_cim: z.string().optional(),
  jegyzo_nev: z.string().optional(),
  cimer_url: z.string().optional(),
  // Új cím FK-k
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type DioceseSetupPartialInput = z.infer<typeof setupPartialSchema>

export async function saveDioceseSetupStep(
  input: DioceseSetupPartialInput,
): Promise<{ ok?: true; error?: string }> {
  const parsed = setupPartialSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Érvénytelen adat a lépéshez.' }
  }

  const ctx = await requireDioceseAccess(parsed.data.id)
  if ('error' in ctx) return { error: ctx.error }

  const d = parsed.data
  const patch: Record<string, unknown> = {
    updated_by: ctx.userId,
  }

  // A `name` NOT NULL, csak nem üres értékkel frissítjük
  if (d.name !== undefined) {
    const trimmed = d.name.trim()
    if (trimmed.length > 0) patch.name = trimmed
  }

  if (d.cif !== undefined) patch.cif = d.cif.trim() || null
  if (d.adoszam !== undefined) patch.adoszam = d.adoszam?.trim() || null
  if (d.cim_orszag !== undefined) patch.cim_orszag = d.cim_orszag.trim() || null
  if (d.cim_megye !== undefined) patch.cim_megye = d.cim_megye.trim() || null
  if (d.cim_telepules !== undefined) patch.cim_telepules = d.cim_telepules.trim() || null
  if (d.cim_iranyitoszam !== undefined) patch.cim_iranyitoszam = d.cim_iranyitoszam.trim() || null
  if (d.cim_utca !== undefined) patch.cim_utca = d.cim_utca.trim() || null
  if (d.email !== undefined) patch.email = d.email.trim() || null
  if (d.telefon !== undefined) patch.telefon = d.telefon.trim() || null
  if (d.weboldal !== undefined) patch.weboldal = d.weboldal?.trim() || null
  if (d.bank_nev !== undefined) patch.bank_nev = d.bank_nev.trim() || null
  if (d.bank_fo_iban !== undefined) patch.bank_fo_iban = d.bank_fo_iban.trim() || null
  if (d.bank_fo_iban_valuta !== undefined) {
    const v = d.bank_fo_iban_valuta.trim()
    if (v.length > 0) patch.bank_fo_iban_valuta = v
  }
  if (d.esperes_nev !== undefined) patch.esperes_nev = d.esperes_nev.trim() || null
  if (d.esperes_cim !== undefined) patch.esperes_cim = d.esperes_cim.trim() || null
  if (d.jegyzo_nev !== undefined) patch.jegyzo_nev = d.jegyzo_nev.trim() || null
  if (d.cimer_url !== undefined) patch.cimer_url = d.cimer_url.trim() || null
  if (d.adrlocality_id !== undefined) patch.adrlocality_id = d.adrlocality_id
  if (d.adrstreet_id !== undefined) patch.adrstreet_id = d.adrstreet_id

  // Csak ha van érdemi mező (az updated_by önmagában nem elég)
  const realFields = Object.keys(patch).filter((k) => k !== 'updated_by')
  if (realFields.length === 0) {
    return { ok: true }
  }

  const { error } = await ctx.supabase
    .from('dioceses')
    .update(patch)
    .eq('id', d.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard-egyhazmegye')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Címer feltöltés a dioceses-logos Storage bucket-be.
 *
 * A fájlnév séma: {diocese_id}/cimer-{timestamp}.{ext}
 * Visszaadja a publikus URL-t, amit a saveDioceseSetup payload-jába
 * kell berakni.
 */
export async function uploadDioceseCimer(
  dioceseId: string,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const ctx = await requireDioceseAccess(dioceseId)
  if ('error' in ctx) return { error: ctx.error }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return { error: 'Nincs fájl.' }
  }

  // Méret és MIME ellenőrzés
  if (file.size > 2_097_152) {
    return { error: 'A fájl mérete nem lehet több, mint 2 MB.' }
  }
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedMime.includes(file.type)) {
    return { error: 'Csak JPG, PNG vagy WEBP formátum engedélyezett.' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const filename = `${dioceseId}/cimer-${Date.now()}.${ext}`

  const { error: upErr } = await ctx.supabase.storage
    .from('dioceses-logos')
    .upload(filename, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    })

  if (upErr) return { error: `Feltöltés hiba: ${upErr.message}` }

  // Publikus URL
  const { data: urlData } = ctx.supabase.storage
    .from('dioceses-logos')
    .getPublicUrl(filename)

  return { url: urlData.publicUrl }
}

/**
 * Biztosítja, hogy létezik a `diocese_bealitas` sor az adott évre.
 * Az egyházmegyei pénzügyi oldalon első belépéskor hívódik — NINCS user-input
 * (nincs éves járulék beállítás az egyházmegyei szinten), csak egy üres flag-ekkel
 * rendelkező sort hoz létre, hogy az `initFinance` ne adjon vissza `settings: null`-t.
 */
export async function ensureDioceseBealitasForYear(
  dioceseId: string,
  year: number,
): Promise<{ ok?: true; error?: string }> {
  const ctx = await requireDioceseAccess(dioceseId)
  if ('error' in ctx) return { error: ctx.error }

  const { error } = await ctx.supabase
    .from('diocese_bealitas')
    .upsert(
      {
        diocese_id: ctx.dioceseId,
        eve: year,
        koltsegvetes_veglegesitve: false,
        szamadas_veglegesitve: false,
      },
      { onConflict: 'diocese_id,eve' },
    )

  if (error) return { error: error.message }
  return { ok: true }
}
