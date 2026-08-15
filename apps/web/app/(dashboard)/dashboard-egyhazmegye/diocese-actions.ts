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
import { getEffectiveAccessContext, type EffectiveAccessContext } from '@/lib/auth/effective-access'
import { assertDioceseInScope } from '@/lib/auth/admin-scope'
import {
  describeDioceseWriteBlock,
  resolveDioceseReadScopeIds,
  resolveDioceseScopeIds,
  resolveDioceseWriteScopeIds,
} from '@/lib/auth/level-scope'

// ─────────────────────────────────────────────────────────────────────────
// Típusok
// ─────────────────────────────────────────────────────────────────────────

export interface DioceseRecord {
  id: string
  name: string
  /** 2026-08-15 (Endre): hivatalos ROMÁN név — a nyomtatvány-fejléc kétnyelvű
   *  alakjához KÖTELEZŐ (a congregations.nev_ro párja). */
  nev_ro: string | null
  /** Angol név — opcionális. */
  nev_en: string | null
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
  /** 2026-08-15 (Endre): az egyházmegyei SZÁMVEVŐ neve — a hivatalos irat
   *  aláírás-rovatához. NEM kötelező (nem minden megyének van kiosztva). */
  szamvevo_nev: string | null

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
  nev_ro: z.string().optional().or(z.literal('')),
  nev_en: z.string().optional().or(z.literal('')),
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
  szamvevo_nev: z.string().optional().or(z.literal('')),
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

  // Esperes / egyházmegyei admin: csak a SAJÁT (feloldott) egyházmegyéje.
  //
  // 2026-08-15 FIX (S1 biztonsági szelet, 0.3): korábban itt a szerep-SZŰRETLEN
  // `access.esperes && resolvedIds.includes(targetId)` feltétel állt. Mivel az
  // `access.esperes` (isEsperesRole) az `egyhazkeruleti_admin`-t IS lefedi, a
  // tág `resolvedIds` pedig a skalár `profiles.diocese_id`-t szerep nélkül is
  // beveszi, egy kerületi admin ELAVULT skalárral (akár MÁSIK kerület
  // megyéje!) ezen az ágon `canManage=true`-t kapott, és a district-ellenőrző
  // kerületi ágig (lentebb) el sem jutott — más megye törzsadatait (IBAN, CIF,
  // címer) szerkeszthette. A szerep-szűrt írási feloldó (esperes /
  // egyházmegyei admin, az SQL current_user_diocese_ids() tükre) ezt kizárja:
  // a kerületi admin KIZÁRÓLAG a lenti, assertDioceseInScope-os ágon mehet át.
  if (!canManage && resolveDioceseWriteScopeIds(access).includes(targetId)) {
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

/**
 * Az „Egyházmegyénk" fejléc-ablak adatcsomagja: a törzsadat + a kerület neve.
 *
 * MIÉRT KÜLÖN AKCIÓ (egyházmegyei terv, 4.1): a read-only ablaknak a kerület
 * NEVE is kell (a getDiocese csak a district_id-t adja) — a jogosultság-kaput
 * viszont NEM másoljuk le: a getDiocese-en át megy minden hívás, így a
 * tagsági ellenőrzés egyetlen helyen él.
 */
export async function getDioceseSummaryData(dioceseId?: string): Promise<{
  data?: DioceseRecord & { districtName: string | null }
  error?: string
}> {
  const res = await getDiocese(dioceseId)
  if (res.error || !res.data) return { error: res.error || 'Egyházmegye nem található.' }

  let districtName: string | null = null
  if (res.data.district_id) {
    const access = await getEffectiveAccessContext()
    const { data: dr } = await access.supabase
      .from('districts')
      .select('name')
      .eq('id', res.data.district_id)
      .maybeSingle()
    districtName = (dr as { name: string | null } | null)?.name ?? null
  }

  return { data: { ...res.data, districtName } }
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
    nev_ro: parsed.data.nev_ro || null,
    nev_en: parsed.data.nev_en || null,
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
    szamvevo_nev: parsed.data.szamvevo_nev || null,
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
// ⚠️ 2026-08-15 (Endre): a BANK és a SZÁMVEVŐ SZÁNDÉKOSAN NINCS benne.
//   · bank_nev / bank_fo_iban — „a banki kontók beállítása később";
//   · szamvevo_nev — nem minden egyházmegyének van kiosztott számvevője.
// Ha benne maradnának, a setup-banner ÖRÖKKÉ nyaggatna olyan adatért, amit a
// varázsló maga sem kér kötelezően — és a két réteg némán széthúzna.
const REQUIRED_SETUP_FIELDS = [
  'name', 'cif', 'cim_orszag', 'cim_megye', 'cim_telepules', 'cim_iranyitoszam',
  'cim_utca', 'email', 'telefon',
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
  // 2026-08-15 (S1 biztonsági szelet, 0.5): KAPU — korábban BÁRMELY
  // bejelentkezett felhasználó tetszőleges dioceseId-re lekérdezhette, mely
  // törzsadat-mezők hiányoznak egy idegen egyházmegyénél. Csak mezőnév-lista
  // szivárgott (érték nem), de kapu nélküli végpont volt. Olvasói hatókör
  // (esperes / megyei admin / számvevő / jogosult kerületi admin) elég;
  // jogosultság híján fail-closed „nincs teendő" választ adunk.
  const ctx = await requireDioceseAccess(dioceseId, 'read')
  if ('error' in ctx) return { needsSetup: false, missingFields: [], dioceseId: null }

  const targetId = ctx.dioceseId

  const { data } = await ctx.supabase
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
  // 2026-08-15 (Endre): Romániában a román alak a hivatalos — KÖTELEZŐ.
  nev_ro: z.string().min(2, 'A román név kötelező — ez kerül a hivatalos iratok fejlécére.'),
  nev_en: z.string().optional().or(z.literal('')),
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
  // 2026-08-15 (Endre): a BANKSZÁMLA már NEM kötelező — „a banki kontók
  // beállítása később". A kliens-oldali lépés-validáció is ezt tükrözi
  // (diocese-setup-wizard.tsx isStepValidOn). Ha a szerver továbbra is
  // követelné, a varázsló utolsó lépése némán elhasalna — pontosan az a
  // réteg-divergencia, amit a projekt már többször megszenvedett.
  bank_nev: z.string().optional().or(z.literal('')),
  bank_fo_iban: z.string().optional().or(z.literal('')),
  bank_fo_iban_valuta: z.string().default('RON'),
  esperes_nev: z.string().min(2, 'Az esperes neve kötelező.'),
  esperes_cim: z.string().min(2, 'Az esperes címe (tisztsége) kötelező.'),
  jegyzo_nev: z.string().min(2, 'A jegyző neve kötelező.'),
  szamvevo_nev: z.string().optional().or(z.literal('')),
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
    nev_ro: parsed.data.nev_ro,
    nev_en: parsed.data.nev_en || null,
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
    bank_nev: parsed.data.bank_nev || null,
    bank_fo_iban: parsed.data.bank_fo_iban || null,
    bank_fo_iban_valuta: parsed.data.bank_fo_iban_valuta || 'RON',
    esperes_nev: parsed.data.esperes_nev,
    esperes_cim: parsed.data.esperes_cim,
    jegyzo_nev: parsed.data.jegyzo_nev,
    szamvevo_nev: parsed.data.szamvevo_nev || null,
    cimer_url: parsed.data.cimer_url,
    // Új cím FK-k
    adrlocality_id: parsed.data.adrlocality_id ?? null,
    adrstreet_id: parsed.data.adrstreet_id ?? null,
    updated_by: ctx.userId,
  }

  // Fail-soft: ha a `szamvevo_nev` oszlop még nem létezik élesben, a mentés
  // NEM veszhet el miatta — lásd updateDioceseFailSoft docblockját.
  const dioRes = await updateDioceseFailSoft(ctx.supabase, parsed.data.id, payload)
  if (dioRes.error) return { error: dioRes.error }

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
  szamvevo_nev: z.string().optional(),
  cimer_url: z.string().optional(),
  // Új cím FK-k
  adrlocality_id: z.number().int().nullable().optional(),
  adrstreet_id: z.number().int().nullable().optional(),
})

export type DioceseSetupPartialInput = z.infer<typeof setupPartialSchema>

/**
 * FAIL-SOFT ÍRÁS a `dioceses` táblára, ha egy oszlop MÉG NEM LÉTEZIK élesben.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT (2026-08-15)
 * ════════════════════════════════════════════════════════════════════════════
 * A `szamvevo_nev` oszlopot a 2026-08-15-egyhazmegyei-szamvevo-nev.sql hozza
 * létre — de a projekt bizonyított hibaosztálya, hogy „a migration-fájl NEM
 * bizonyíték arra, hogy lefutott élesben". Ha a kód olyan oszlopra ír, ami még
 * nincs meg, a PostgREST PGRST204/42703-mal az EGÉSZ mentést eldobja — vagyis
 * a felhasználó a TÖBBI, tökéletesen érvényes mezőjét is elveszítené.
 *
 * Ez különösen rossz most, amikor épp az adatvesztést szüntettük meg a
 * varázslóban. Ezért: ha a hiba egy ISMERT, opcionális oszlopra mutat, kivesszük
 * a payloadból és ÚJRAPRÓBÁLJUK. A mentés így sikerül, csak az az egy mező nem
 * tárolódik — és `hianyzoOszlop`-ként vissza is jelezzük.
 */
const OPCIONALIS_UJ_OSZLOPOK = ['szamvevo_nev'] as const

function hianyzoOszlopHiba(uzenet: string | undefined, kod: string | undefined): string | null {
  if (kod !== 'PGRST204' && kod !== '42703') return null
  const m = (uzenet || '').toLowerCase()
  for (const o of OPCIONALIS_UJ_OSZLOPOK) {
    if (m.includes(o)) return o
  }
  return null
}

async function updateDioceseFailSoft(
  supabase: EffectiveAccessContext['supabase'],
  dioceseId: string,
  payload: Record<string, unknown>,
): Promise<{ error?: string; hianyzoOszlop?: string }> {
  const { error } = await supabase.from('dioceses').update(payload).eq('id', dioceseId)
  if (!error) return {}

  const hianyzo = hianyzoOszlopHiba(error.message, error.code)
  if (!hianyzo) return { error: error.message }

  // Az ismert, opcionális oszlop nélkül újra — hogy a többi mező elmenthető legyen.
  const szukitett = { ...payload }
  delete szukitett[hianyzo]
  const masodik = await supabase.from('dioceses').update(szukitett).eq('id', dioceseId)
  if (masodik.error) return { error: masodik.error.message }
  return { hianyzoOszlop: hianyzo }
}

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
  if (d.szamvevo_nev !== undefined) patch.szamvevo_nev = d.szamvevo_nev.trim() || null
  if (d.cimer_url !== undefined) patch.cimer_url = d.cimer_url.trim() || null
  if (d.adrlocality_id !== undefined) patch.adrlocality_id = d.adrlocality_id
  if (d.adrstreet_id !== undefined) patch.adrstreet_id = d.adrstreet_id

  // Csak ha van érdemi mező (az updated_by önmagában nem elég)
  const realFields = Object.keys(patch).filter((k) => k !== 'updated_by')
  if (realFields.length === 0) {
    return { ok: true }
  }

  const res = await updateDioceseFailSoft(ctx.supabase, d.id, patch)
  if (res.error) return { error: res.error }

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

// ─────────────────────────────────────────────────────────────────────────
// 2026-08-15 (egyházmegyei szint, S4): esperesi hivatali PECSÉT + ALÁÍRÁS kép
// — a gyülekezeti 24. pont (congregation/actions.ts uploadCongregationIratKep)
// megyei párja, a MEGYEI asszetekkel: tárolás a dioceses törzsadat mellé
// (dioceses.pecset_url / alairas_url oszlop), a kép a 'dioceses-logos' bucket
// {diocese_id}/… prefixe alá kerül (a címer bevált mintája). A nyomtatványok a
// getCongregationHeader diocese-ágán át kapják (iktato/szemely-actions.ts).
// Jogszabályi háttér: Legea 489/2006 Art. 15 — a pecséten a hivatalos
// elnevezés kötelező (a képet az esperesi hivatal a saját pecsétjéről tölti fel).
// ─────────────────────────────────────────────────────────────────────────

const DIO_IRAT_KEP_OSZLOP = {
  pecset: 'pecset_url',
  alairas: 'alairas_url',
} as const

type DioIratKepFajta = keyof typeof DIO_IRAT_KEP_OSZLOP

const DIO_IRAT_KEP_CIMKE: Record<DioIratKepFajta, string> = {
  pecset: 'pecsét',
  alairas: 'aláírás',
}

const DIO_IRAT_KEP_MIGRACIO_HIBA =
  'Az adatbázisból hiányzik a dioceses.pecset_url/alairas_url oszlop — futtasd le a ' +
  'migration-docs/sql/2026-08-15-egyhazmegyei-iktato-leltar-s4.sql migrációt, majd próbáld újra.'

/** Hiányzó-oszlop hiba felismerése (MEMORY: a migration-fájl NEM bizonyíték). */
function dioIratKepOszlopHianyzik(message: string): boolean {
  return /column|does not exist|schema cache|could not find/i.test(message)
}

/**
 * Az egyházmegye pecsét- és aláírás-képének betöltése a beállítás-felülethez.
 * Hiányzó oszlopnál HANGOS hiba (a felület a migrációra mutat) — a
 * nyomtatvány-oldali, némán degradáló betöltés külön úton megy
 * (iktato/szemely-actions.getCongregationHeader diocese-ága).
 */
export async function getDioceseIratKepek(dioceseId?: string): Promise<{
  pecsetUrl: string | null
  alairasUrl: string | null
  error: string | null
}> {
  const ctx = await requireDioceseAccess(dioceseId, 'read')
  if ('error' in ctx) {
    return { pecsetUrl: null, alairasUrl: null, error: ctx.error ?? 'Nincs jogosultság az egyházmegyéhez.' }
  }

  const { data, error } = await ctx.supabase
    .from('dioceses')
    .select('pecset_url, alairas_url')
    .eq('id', ctx.dioceseId)
    .maybeSingle()

  if (error) {
    return {
      pecsetUrl: null,
      alairasUrl: null,
      error: dioIratKepOszlopHianyzik(error.message) ? DIO_IRAT_KEP_MIGRACIO_HIBA : error.message,
    }
  }
  const row = (data || null) as { pecset_url: string | null; alairas_url: string | null } | null
  return {
    pecsetUrl: row?.pecset_url?.trim() || null,
    alairasUrl: row?.alairas_url?.trim() || null,
    error: null,
  }
}

/**
 * Pecsét- vagy aláírás-kép feltöltése + azonnali mentése a dioceses sorra.
 * A gyülekezeti párral azonos szabályok: CSAK PNG/WEBP (átlátszó háttér — a
 * kép a nyomtatvány szövegére kerül, a JPG fehér téglalapja eltakarná), plafon
 * 1 MB (a kép data: URI-ként ágyazódik minden nyomtatványba).
 */
export async function uploadDioceseIratKep(
  dioceseId: string,
  fajta: DioIratKepFajta,
  formData: FormData,
): Promise<{ url?: string; error?: string }> {
  const oszlop = DIO_IRAT_KEP_OSZLOP[fajta]
  if (!oszlop) return { error: 'Ismeretlen kép-fajta.' }

  // 'write' mód: a számvevő (ellenőr) beszédes magyar magyarázatot kap.
  const ctx = await requireDioceseAccess(dioceseId)
  if ('error' in ctx) return { error: ctx.error }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) return { error: 'Nincs fájl.' }
  if (file.size > 1_048_576) {
    return { error: `A ${DIO_IRAT_KEP_CIMKE[fajta]}-kép legfeljebb 1 MB lehet — kicsinyítsd le, és próbáld újra.` }
  }
  const allowedMime = ['image/png', 'image/webp']
  if (!allowedMime.includes(file.type)) {
    return {
      error:
        `A ${DIO_IRAT_KEP_CIMKE[fajta]}-képhez PNG vagy WEBP formátum kell (átlátszó háttérrel) — ` +
        'a JPG fehér téglalapja eltakarná a nyomtatvány szövegét.',
    }
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const path = `${ctx.dioceseId}/${fajta}-${Date.now()}-${safeName}`

  const { error: upErr } = await ctx.supabase.storage
    .from('dioceses-logos')
    .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type })
  if (upErr) return { error: `Feltöltés hiba: ${upErr.message}` }

  const { data: urlData } = ctx.supabase.storage.from('dioceses-logos').getPublicUrl(path)
  const url = urlData.publicUrl

  const { error: dbErr } = await ctx.supabase
    .from('dioceses')
    .update({ [oszlop]: url })
    .eq('id', ctx.dioceseId)
  if (dbErr) {
    return {
      error: dioIratKepOszlopHianyzik(dbErr.message)
        ? DIO_IRAT_KEP_MIGRACIO_HIBA
        : `A kép feltöltődött, de a mentése nem sikerült: ${dbErr.message}`,
    }
  }

  revalidatePath('/iktato')
  revalidatePath('/dashboard-egyhazmegye')
  return { url }
}

/** A pecsét- vagy aláírás-kép LEVÉTELE (az URL törlése a dioceses sorról). */
export async function clearDioceseIratKep(
  dioceseId: string,
  fajta: DioIratKepFajta,
): Promise<{ ok?: true; error?: string }> {
  const oszlop = DIO_IRAT_KEP_OSZLOP[fajta]
  if (!oszlop) return { error: 'Ismeretlen kép-fajta.' }
  const ctx = await requireDioceseAccess(dioceseId)
  if ('error' in ctx) return { error: ctx.error }

  const { error } = await ctx.supabase
    .from('dioceses')
    .update({ [oszlop]: null })
    .eq('id', ctx.dioceseId)
  if (error) {
    return {
      error: dioIratKepOszlopHianyzik(error.message) ? DIO_IRAT_KEP_MIGRACIO_HIBA : error.message,
    }
  }
  revalidatePath('/iktato')
  revalidatePath('/dashboard-egyhazmegye')
  return { ok: true }
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

// ─────────────────────────────────────────────────────────────────────────
// VEZETŐ-JELÖLTEK (2026-08-15, Endre kérése)
// ─────────────────────────────────────────────────────────────────────────
//
// MIÉRT: a beállítás-varázsló 4. lépésén az esperes, a jegyző és a számvevő
// nevét EDDIG KÉZZEL kellett begépelni. A kézzel írt név elszakad a rendszerben
// nyilvántartott személytől — ugyanaz a hibaosztály, mint a `congregations.district`
// szöveges oszlopé: két helyen él ugyanaz az adat, és némán széthúzhat
// (elgépelés, névváltozás, „dr." elé/mögé).
//
// Endre kérése szó szerint: „az esperes személyét lehessen kiválasztani a
// kézdi-orbai lelkészeinek a listájából ha benne van, az egyházmegyei
// főjegyzőt és számvevőt ha nincs hozzárendelve már az egyházmegyéhez a
// rendszergazdai adminisztrátori felületről."
//
// EZÉRT KÉT LISTÁT adunk vissza:
//   · `hozzarendelt` — akinek MÁR VAN megyei szerepkör-sora erre az
//     egyházmegyére (a rendszergazdai felületről kiosztva). Ezt a varázsló
//     ELŐRE felkínálja, és megmondja, honnan tudja.
//   · `jeloltek` — a megye gyülekezeteinek LELKÉSZEI (+ a fentiek), akik közül
//     az esperes választható, ha még nincs nevesített szerepkör-sora.
//
// FAIL-CLOSED: a lekérdezés a megyei OLVASÓ hatókörhöz kötött; hatókör nélkül
// üres listát ad, SOHA nem szűretlen felhasználó-listát.

export interface VezetoJelolt {
  profileId: string
  nev: string
  email: string | null
  /** Honnan ismerjük — a felületen ez a magyarázat jelenik meg a név mellett. */
  honnan: string
}

export interface VezetoJeloltek {
  /** A megye gyülekezeteinek lelkészei + a megyei szerepkör-sorral rendelkezők. */
  jeloltek: VezetoJelolt[]
  /** Akinek MÁR VAN nevesített megyei szerepköre (a rendszergazdai felületről). */
  hozzarendelt: {
    esperes: VezetoJelolt | null
    jegyzo: VezetoJelolt | null
    szamvevo: VezetoJelolt | null
  }
  /** Igaz, ha a hatókör feloldható volt (különben a felület magyarázatot ír ki). */
  feloldhato: boolean
}

const URES_JELOLTEK: VezetoJeloltek = {
  jeloltek: [],
  hozzarendelt: { esperes: null, jegyzo: null, szamvevo: null },
  feloldhato: false,
}

export async function getDioceseVezetoJeloltek(dioceseId?: string): Promise<VezetoJeloltek> {
  // OLVASÓ hatókör: a számvevő is megnézheti, ki a megye vezetése.
  const ctx = await requireDioceseAccess(dioceseId, 'read')
  if ('error' in ctx) return URES_JELOLTEK

  const { supabase } = ctx
  const megyeId = ctx.dioceseId

  // (1) A megye gyülekezetei — a lelkész-jelöltekhez.
  const { data: congs } = await supabase
    .from('congregations')
    .select('id, name')
    .eq('diocese_id', megyeId)
  const congIds = (congs ?? []).map((c) => String(c.id))
  const congNev = new Map((congs ?? []).map((c) => [String(c.id), String(c.name || '')]))

  // (2) MEGYEI szerepkör-sorok erre az egyházmegyére.
  const { data: megyeiSorok } = await supabase
    .from('profile_roles')
    .select('profile_id, role')
    .eq('scope', 'diocese')
    .eq('scope_id', megyeId)
    .eq('active', true)
    .eq('approval_status', 'approved')

  // (3) GYÜLEKEZETI lelkész-sorok a megye gyülekezeteiben.
  let lelkeszSorok: Array<{ profile_id: string; scope_id: string }> = []
  if (congIds.length > 0) {
    const { data } = await supabase
      .from('profile_roles')
      .select('profile_id, scope_id')
      .eq('scope', 'congregation')
      .eq('role', 'lelkesz')
      .eq('active', true)
      .eq('approval_status', 'approved')
      .in('scope_id', congIds)
    lelkeszSorok = (data ?? []) as Array<{ profile_id: string; scope_id: string }>
  }

  // (4) A nevek egyetlen lekérdezéssel.
  const profilIds = [
    ...new Set([
      ...(megyeiSorok ?? []).map((r) => String(r.profile_id)),
      ...lelkeszSorok.map((r) => String(r.profile_id)),
    ]),
  ]
  if (profilIds.length === 0) {
    return { ...URES_JELOLTEK, feloldhato: true }
  }

  const { data: profilok } = await supabase
    .from('profiles')
    .select('id, full_name, email, status')
    .in('id', profilIds)

  const profil = new Map(
    (profilok ?? [])
      // Csak AKTÍV fiókot kínálunk fel — egy függőben lévő regisztrálót nem
      // szabad hivatalos irat aláírójaként felajánlani.
      .filter((p) => (p as { status?: string }).status === 'active')
      .map((p) => [
        String((p as { id: string }).id),
        {
          nev: String((p as { full_name?: string | null }).full_name || '').trim(),
          email: ((p as { email?: string | null }).email || null) as string | null,
        },
      ]),
  )

  const MEGYEI_SZEREP_FELIRAT: Record<string, string> = {
    esperes: 'esperes (kiosztott szerepkör)',
    egyhazmegyei_admin: 'egyházmegyei adminisztrátor',
    egyhazmegyei_szamvevo: 'egyházmegyei számvevő (kiosztott szerepkör)',
  }

  const jeloltMap = new Map<string, VezetoJelolt>()
  const felvesz = (id: string, honnan: string) => {
    const p = profil.get(id)
    if (!p || p.nev.length === 0) return
    const meglevo = jeloltMap.get(id)
    if (meglevo) {
      // Ha valaki több jogcímen is jelölt, mindkettőt kiírjuk.
      if (!meglevo.honnan.includes(honnan)) meglevo.honnan += ` · ${honnan}`
      return
    }
    jeloltMap.set(id, { profileId: id, nev: p.nev, email: p.email, honnan })
  }

  for (const r of megyeiSorok ?? []) {
    const szerep = String(r.role)
    felvesz(String(r.profile_id), MEGYEI_SZEREP_FELIRAT[szerep] ?? `megyei szerepkör: ${szerep}`)
  }
  for (const r of lelkeszSorok) {
    const nev = congNev.get(String(r.scope_id)) || 'gyülekezet'
    felvesz(String(r.profile_id), `lelkipásztor — ${nev}`)
  }

  const elso = (szerep: string): VezetoJelolt | null => {
    const sor = (megyeiSorok ?? []).find((r) => String(r.role) === szerep)
    if (!sor) return null
    return jeloltMap.get(String(sor.profile_id)) ?? null
  }

  return {
    jeloltek: [...jeloltMap.values()].sort((a, b) => a.nev.localeCompare(b.nev, 'hu')),
    hozzarendelt: {
      esperes: elso('esperes'),
      jegyzo: elso('egyhazmegyei_admin'),
      szamvevo: elso('egyhazmegyei_szamvevo'),
    },
    feloldhato: true,
  }
}
