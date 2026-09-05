'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { memberSchema, removeSchema, type MemberInput, type RemoveInput } from '@/lib/validations/members'
import { generateCnp, guessGender } from '@/lib/utils/member-helpers'
import { valodiCnpGyanus } from '@/lib/members/szemelyi-szam'
import { logAuditEvent } from '@/lib/audit/log'
import type { MemberRow, EnrichedMember } from '@/lib/constants/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPersonPaymentsCompat } from '@/lib/finance/payment-compat'
import { allocateFamilyPayments, computeBaseExpectedForMemberYear, computeJarulekForMemberYear, isJarulekExcludedMemberStatus, type JarulekDiscountRule, type JarulekExemption, type JarulekPaymentLike, type JarulekYearSetting } from '@/lib/finance/jarulek-calculation'
// 2026-08-11 (5. kör, P3 #4): a járulék-besoroló pár közös forrása (web ⇄ desktop).
import { getPaymentGoalCode, isChurchMaintenanceCode, type PaymentGoalCodeRef } from '@kartoteka/ui-app'
// 2026-08-11 (5. kör, P3 #15): a lapozott „hozd le a TELJES halmazt" helper közös forrása.
import { selectAllPaged } from '@kartoteka/supabase-client'
import { applyStreetLocalityFallback, firstRel } from '@/lib/members/street-locality-fallback'
// 2026-08-11: az „Útvonal" célpont-építőjének típusai (a hivatalos román cím).
import type { DirectionsCountry, DirectionsCounty, DirectionsLocality, DirectionsStreet, MemberDirectionsAddress, OrszagtorzsAllapot } from '@/lib/members/directions'
import { syncRegistryWorklogLink } from '@/lib/worklog/registry-sync'
import { describeMoves, ensureChildFamilyLink, type FamilyCompletionOffer } from '@/lib/family/auto-family'
import { getAllowedFamilyIds, loadFamilyDisplayNames, syncHouseholdFromCsalad } from '@/lib/family/family-membership'
import type { HiddenMemberItem, PersonReferenceItem, PersonReferencesResult } from '@/lib/members/removal-types'
// 2026-08-15 (átvilágítás 23.): a választói jogosultság újraszámításának KÖZÖS
// hívója — a kivezetés minden ága után lefut (lásd removeMember).
import { refreshVoterEligibility } from '@/lib/members/voter-eligibility'
// 2026-08-15 (desktop-paritás 2. szelet): a település-feloldás közös törzse —
// web és desktop ugyanazt hívja (lásd a lenti getOrCreateLocality wrappert).
import { getOrCreateLocality as coreGetOrCreateLocality } from '@kartoteka/core'

// ── Segéd: congregation_id a profilból ───────────────────────

async function getProfileCongregation() {
  const { supabase, user, congregationId, fullName } = await getEffectiveCongregationContext()
  return {
    supabase,
    user,
    congregationId,
    profileName: fullName,
  }
}

// 2026-08-11 (5. kör, P3 #4): a `PaymentGoalCodeRef` + `getPaymentGoalCode` +
// `isChurchMaintenanceCode` hármas itteni MÁSOLATA törölve — a közös forrás a
// `@kartoteka/ui-app` (packages/ui-app/src/finance/payment-goal-code.ts). Négy
// kézzel karbantartott példány volt belőle, egyikük eltérő (`??`) fallback-kel.

/**
 * 2026-08-11 (K5-#21): LAPOZÓ segéd. A PostgREST/Supabase alapértelmezett 1000
 * soros plafonja NÉMÁN levágja a nagy lekérdezéseket — ugyanaz a hibaosztály,
 * amit a `dashboard/page.tsx` (2026-08-01, PR-19) és a `penzugy/actions.ts`
 * `fetchAllPaged`-je (2026-07-25, F6.1) már javított. A hívónak KÖTELEZŐ
 * determinisztikus rendezést (`.order('id')`) adnia, különben a `.range()`
 * ablakok átfedhetnek vagy sorokat hagyhatnak ki.
 *
 * Csak az ÜRES lap a biztos stop: leszállított szerver-plafonnál a rövid lap még
 * nem feltétlenül a sorozat vége.
 *
 * 2026-08-11 (5. kör, P3 #15): a saját ciklus KIVEZETVE — a törzs mostantól a
 * KÖZÖS `selectAllPaged` (@kartoteka/supabase-client). A helper vékony
 * burkolóként marad, a szerződés (a hívó rendez) változatlan.
 */
async function fetchAllPagedRows<T>(
  // A lekérdezés sor-típusa a hívónál dől el; a builder típusa itt nem kifejezhető.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  pageSize = 1000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  return selectAllPaged<T>(query, { pageSize, orderColumn: null, dedupeBy: 'id' })
}

// ── Település / utca getOrCreate ─────────────────────────────
// 2026-06-10 (Fázis 1 biztonsági hotfix): korábban guard nélküli exportált
// server actionök voltak, és mivel az adrlocality/adrstreet táblára az
// authenticated szerepnek nincs INSERT-grantja, a létrehozás csendben
// elbukott és 1-es id-ra esett vissza (rossz településre kötött tagok).
// Mostantól belső helperek: a létrehozás guardolt SECURITY DEFINER RPC-n fut
// (2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql), hiba esetén null.

async function getOrCreateLocality(name: string): Promise<number | null> {
  // 2026-08-15 (desktop-paritás 2. szelet): a törzs a közös @kartoteka/core-ba
  // került (members/locality.ts) — a desktop kivezetés-tükre is UGYANAZT a
  // feloldást használja. Ez a wrapper csak a web-oldali kliens-példányosítást
  // teszi hozzá.
  const supabase = await createClient()
  return coreGetOrCreateLocality(supabase, name)
}

async function getOrCreateStreet(name: string, localityId: number): Promise<number | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const supabase = await createClient()
  const { data: existing } = await supabase.from('adrstreet').select('id').ilike('name', trimmed).eq('localityid', localityId).limit(1).maybeSingle()
  if (existing?.id) return existing.id
  const { data, error } = await supabase.rpc('app_get_or_create_street', { p_name: trimmed, p_locality_id: localityId })
  if (error || typeof data !== 'number') {
    console.error('[getOrCreateStreet] sikertelen:', error?.message)
    return null
  }
  return data
}

// ── Tag lista lekérdezés (enriched) ──────────────────────────

export async function getMembers(): Promise<{
  members: EnrichedMember[]
  paidPersonIds: number[]
  paidFamilyIds: number[]
  exemptPersonIds: number[]
  exemptFamilyIds: number[]
  personToFamilyMap: Record<number, number>
}> {
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return { members: [], paidPersonIds: [], paidFamilyIds: [], exemptPersonIds: [], exemptFamilyIds: [], personToFamilyMap: {} }

  const currentYear = new Date().getFullYear()

  const [membersRes, paymentsRes, everPaidRes, exemptionsRes, familiesRes, yearlySettingsRes, discountsRes, pendingTransfersRes] = await Promise.all([
    // 2026-06-30 (perf): a '*' helyett explicit oszloplista. A teljes szemely
    // tábla (~50 oszlop, köztük a potenciálisan NAGY base64 `kep`, photo_url,
    // social_profil_url, szig, taj, c_szcim, nemzetiseg stb.) helyett csak a
    // lista/áttekintés és a szerkesztő űrlap által ténylegesen használt mezők.
    // FONTOS: a c_tombhaz/c_lepcsohaz/c_emelet/c_ajto MARAD — a szerkesztő űrlap
    // (member-form-dialog) ezeket előtölti és mentéskor visszaírja, így kihagyásuk
    // néma adatvesztést okozna.
    // 2026-07-17 (PR-1): az adrstreet-embed a település-fallbackhoz az utca
    // adrlocality-ját is lehozza (ha a c_helysegid üres — import-hiba öröksége).
    // 2026-08-11 (K5-#21): LAPOZOTT — eddig a PostgREST 1000-es plafonja némán
    // levágta a listát: 1400 tagú gyülekezetnél az Áttekintés 1000 tagot jelentett,
    // és a kor-/nem-bontás egy ÖNKÉNYES 1000-es szeleten állt (id DESC → a 400
    // legrégebbi id esett ki). A rendezés SZÁNDÉKOSAN marad `id` DESC — a lapozás
    // így is determinisztikus, a lista sorrendje pedig változatlan.
    fetchAllPagedRows(supabase.from('szemely').select('id, cnp, csaladnev, k_nev, szcs_nev, namepattern, allapot, ferfi, sz_datum, foglalkozas, vallas, telefon, email, meghalt, member_status, gdpr_consent_at, photo_consent, mailing_consent, social_profil_url, apjaneve, anyjaneve, megjegyzes, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality!c_helysegid(name)').eq('congregation_id', congregationId).eq('isvisible', true).order('id', { ascending: false })),
    // 2026-07-17 (F1-4): a stornózott befizetés nem számít fizetettnek (bit-azonos a Tartozásokkal).
    // 2026-08-11 (K5-#21): LAPOZOTT — 1000+ befizetés-sornál a plafon feletti
    // tételek eltűntek, és a hozzájuk tartozó tagok fizetetlennek látszottak.
    fetchAllPagedRows(supabase.from('befizetes').select('id, id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(id_szamadasicel)').eq('congregation_id', congregationId).eq('fizetettev', currentYear).or('deleted.eq.false,deleted.is.null').or('stornozott.eq.false,stornozott.is.null').order('id', { ascending: true })),
    // 2026-04-30 (Endre kérése): "Aktív tag = református VAGY bármikor fizetett
    // egyházfenntartást." Ez a query MINDEN évre kéri a befizetéseket (csak az
    // egyházfenntartási kódra), hogy a "valaha fizetett" Set-et fel tudjuk építeni.
    // 2026-06-30 (perf): a 101.01* kód-szűrés a DB-be került (beágyazott inner-join),
    // korábban MINDEN befizetést lehúzott; a JS-szűrő alább forrás-igazságként marad,
    // és hiba esetén a szűretlen lekérdezésre esünk vissza.
    // 2026-08-11 (K5-#21): LAPOZOTT — ez a lekérdezés MINDEN évre kér, ezért ért
    // a plafonra a leghamarabb: a levágott sorok miatt régóta fizető tagok
    // „sosem fizetett"-ként jelentek meg, ami az „aktív tag" szabályt is rontotta.
    fetchAllPagedRows(supabase.from('befizetes').select('id, id_szemely, id_csalad, befizetescel!inner(id_szamadasicel)').eq('congregation_id', congregationId).like('befizetescel.id_szamadasicel', '101.01%').or('deleted.eq.false,deleted.is.null').order('id', { ascending: true })),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ haztartas_tag-ból
    // szedjük ki a személy → csalad mapping-et. A `haztartas.legacy_csalad_id`
    // visszafelé kompatibilis a régi `csalad.id`-vel.
    // 2026-08-11 (K5-#21): LAPOZOTT — a csonkolt család-mapping az
    // `allocateFamilyPayments` családi felosztását is elrontotta volna (a
    // mapping-ből kimaradt tagok nem kapnak részt a családi befizetésből).
    fetchAllPagedRows(
      supabase.from('haztartas_tag')
        .select('id, id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
        .eq('congregation_id', congregationId)
        .is('ervenyes_ig', null)
        .order('id', { ascending: true }),
    ),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(currentYear)),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('ev', currentYear).eq('aktiv', true).order('sorrend', { ascending: true }),
    // 2026-07-17 (F5, Q6): a congregations.tartozas_szamitas_mod lekérdezés törölve —
    // a mód kivezetve, senki nem olvasta.
    // 2026-04-30: pending átjelentkezési kérelmek (a saját gyülekezet a forrás)
    supabase
      .from('member_transfer_notifications')
      .select('id, szemely_id, created_at, target_congregation:congregations!target_congregation_id(name, nev_hu)')
      .eq('source_congregation_id', congregationId)
      .eq('status', 'pending'),
  ])

  // pending átjelentkezések map: szemely_id → { id, target_name, created_at }
  type PendingTransferRow = {
    id: string
    szemely_id: number
    created_at: string
    target_congregation: { name: string | null; nev_hu: string | null } | { name: string | null; nev_hu: string | null }[] | null
  }
  const pendingTransferMap: Record<number, EnrichedMember['pendingTransfer']> = {}
  ;((pendingTransfersRes.data || []) as PendingTransferRow[]).forEach((row) => {
    const tc = Array.isArray(row.target_congregation) ? row.target_congregation[0] : row.target_congregation
    pendingTransferMap[row.szemely_id] = {
      id: row.id,
      target_congregation_name: tc?.nev_hu || tc?.name || 'Ismeretlen célgyülekezet',
      created_at: row.created_at,
    }
  })

  // 2026-06-01 (hibrid család-modell Fázis 2): Személy → család (legacy id)
  // mapping az új haztartas_tag-ból. A légkonyabb úton: aktív tag + aktív
  // háztartás + van legacy_csalad_id.
  const personToFamilyMap: Record<number, number> = {}
  if (familiesRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (familiesRes.data as any[]).forEach((t) => {
      const haztartasRaw = t.haztartas
      const haztartas = Array.isArray(haztartasRaw) ? haztartasRaw[0] : haztartasRaw
      if (!haztartas) return
      if (haztartas.isaktiv !== true) return
      if (haztartas.ervenyes_ig != null) return
      const legacyId = haztartas.legacy_csalad_id as number | null
      if (legacyId && t.id_szemely) personToFamilyMap[t.id_szemely] = legacyId
    })
  }

  // 2026-08-11 (K5-#21): a tag-lekérdezés hibája NEM adhat rész-listát. Egy
  // csonka lista hihető, de HAMIS Áttekintés-KPI-t (tagszám, kor-/nem-bontás)
  // mutatna — inkább hangos hiba, ahogy a `dashboard/page.tsx` is teszi.
  if (membersRes.error) {
    console.error('[tagnyilvantartas/lista] A tagok lapozott lekérdezése HIBÁRA FUTOTT:', membersRes.error.message)
    throw new Error('A tagsági adatok betöltése nem sikerült — töltsd újra az oldalt.')
  }

  // Fizetők
  // 2026-07-17 (F1-1 hibaosztály): a fizetett-státusz lekérdezés hibája ne legyen
  // néma — különben minden tag fizetetlennek látszana a listán.
  // 2026-08-11 (K5-#21): a néma log helyett hangos hiba — a „mindenki hátralékos"
  // lista alapján a lelkész alaptalan fizetési felszólítást küldene.
  if (paymentsRes.error) {
    console.error(
      '[tagnyilvantartas/lista] A fizetett-státusz befizetés-lekérdezése HIBÁRA FUTOTT — minden tag fizetetlennek látszana!',
      paymentsRes.error,
    )
    throw new Error('A befizetési adatok betöltése nem sikerült — töltsd újra az oldalt.')
  }
  const paidPersonIds: number[] = []
  const paidFamilyIds: number[] = []
  const currentYearPayments = (paymentsRes.data || []) as Array<{
    id_szemely: number | null
    id_csalad: number | null
    datum: string | null
    fizetettev: number | null
    osszeg: number
    befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }>
  const maintenancePayments = currentYearPayments.filter((payment) =>
    isChurchMaintenanceCode(getPaymentGoalCode(payment.befizetescel)),
  )
  maintenancePayments.forEach((p) => {
    if (p.id_szemely) paidPersonIds.push(p.id_szemely)
    if (p.id_csalad) paidFamilyIds.push(p.id_csalad)
  })
  const paidPersonSet = new Set(paidPersonIds)
  const paidFamilySet = new Set(paidFamilyIds)

  // "Bármikor fizetett egyházfenntartást" — Set
  // Minden olyan szemely_id, akinek volt valaha egyházfenntartási befizetése,
  // bármelyik évre. Ezt használja az aktív-tag számítás (Endre szabálya:
  // református VAGY bármikor fizető).
  // 2026-06-30 (perf + ellenállóság): a fenti lekérdezés már a DB-ben szűr a
  // 101.01* kódra (beágyazott inner-join). Ha az a szűrő egy régebbi PostgREST-en
  // hibázna, visszaesünk a szűretlen lekérdezésre — a JS-szűrő (isChurchMaintenanceCode)
  // úgyis kiszűri a nem-egyházfenntartási sorokat, így a hasEverPaid bit-azonos marad.
  type EverPaidRow = {
    id_szemely: number | null
    id_csalad: number | null
    befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }
  let everPaidData = (everPaidRes.data || []) as EverPaidRow[]
  if (everPaidRes.error) {
    // 2026-08-11 (K5-#21): a fallback-lekérdezés is LAPOZOTT — enélkül a
    // visszaesési ág maga vágta volna le a sorokat 1000-nél.
    const retry = await fetchAllPagedRows<EverPaidRow>(
      supabase.from('befizetes')
        .select('id, id_szemely, id_csalad, befizetescel(id_szamadasicel)')
        .eq('congregation_id', congregationId)
        .or('deleted.eq.false,deleted.is.null')
        .order('id', { ascending: true }),
    )
    if (retry.error) console.warn('[tagnyilvantartas/lista] everPaid retry (szűretlen) is hibázott:', retry.error.message)
    everPaidData = (retry.data || []) as EverPaidRow[]
  }
  const everPaidPersonSet = new Set<number>()
  const everPaidFamilySet = new Set<number>()
  everPaidData.forEach((payment) => {
    if (!isChurchMaintenanceCode(getPaymentGoalCode(payment.befizetescel))) return
    if (payment.id_szemely) everPaidPersonSet.add(payment.id_szemely)
    if (payment.id_csalad) everPaidFamilySet.add(payment.id_csalad)
  })

  // Felmentettek
  const exemptPersonIds: number[] = []
  const exemptFamilyIds: number[] = []
  if (exemptionsRes.data) exemptionsRes.data.forEach((e: { id_szemely: number | null; id_csalad: number | null; kezdete: number | null; vege: number | null }) => {
    if (currentYear >= (e.kezdete || 0) && currentYear <= (e.vege || 2099)) {
      if (e.id_szemely) exemptPersonIds.push(e.id_szemely)
      if (e.id_csalad) exemptFamilyIds.push(e.id_csalad)
    }
  })
  const exemptPersonSet = new Set(exemptPersonIds)
  const exemptFamilySet = new Set(exemptFamilyIds)

  const yearSettings: Record<number, JarulekYearSetting> = {}
  ;((yearlySettingsRes.data || []) as Array<{ id: string | number; eves_jarulek: number | null; jarulek_kedvezmenyes: number | null; jarulek_hatarid: string | null }>).forEach((row) => {
    const year = Number(row.id)
    yearSettings[year] = {
      year,
      eves_jarulek: Number(row.eves_jarulek) || 0,
      jarulek_kedvezmenyes: row.jarulek_kedvezmenyes == null ? null : Number(row.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: row.jarulek_hatarid || null,
    }
  })

  // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés HIBÁZOTT, újra `kezdet` nélkül —
  // különben a SELECT némán [] -t adna, és az ÖSSZES mentett kedvezmény kiesne a tagnyilvántartásból.
  // Bit-azonos a getExpectedJarulek ellenállóságával (commit 535c33fc); a kezdet ekkor null (nyitott ablak).
  let discData: Array<Record<string, unknown>> | null = discountsRes.data as Array<Record<string, unknown>> | null
  if (discountsRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('ev', currentYear).eq('aktiv', true)
    if (retry.error) console.warn('[tagnyilvantartas/lista] jarulek_kedvezmeny retry (kezdet nélkül) is hibázott — a kedvezmények kimaradnak:', retry.error.message)
    discData = retry.data as Array<Record<string, unknown>> | null
  }
  const discounts = ((discData || []) as unknown as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))
  // 2026-07-17 (F5, Q6): a tartozas_szamitas_mod kivezetve — mindig 'akkori'.
  const debtCalcMode = 'akkori' as const

  const exemptions = (exemptionsRes.data || []) as JarulekExemption[]

  // 2026-07-17 (F5, Q7): a tisztán családi befizetések felosztása a tagok közt
  // (idősebb előbb, alap-elvárásig) — bit-azonos a Tartozás-listával.
  const memberRowsForList = (membersRes.data || []) as unknown as MemberRow[]
  // A roster a KANONIKUS kizárt-státusz predikátummal szűr (bit-azonos a Tartozás-
  // listával) — különben képernyőnként más felosztás jönne ki ugyanarra a tételre.
  const allocationMembers = memberRowsForList
    .filter((m) => !m.meghalt && !isJarulekExcludedMemberStatus(m.member_status))
    .map((m) => ({
      id: m.id,
      sz_datum: m.sz_datum,
      familyId: personToFamilyMap[m.id] ?? null,
      foglalkozas: m.foglalkozas,
    }))
  const allocatedPayments = allocateFamilyPayments(maintenancePayments, allocationMembers, (mem, y) =>
    computeBaseExpectedForMemberYear({
      member: mem,
      year: y,
      currentYear,
      debtCalcMode,
      yearSettings,
      discounts,
      exemptions,
    }),
  )

  // Enrichment
  // 2026-06-30: a select most explicit oszloplista (nem '*'), ezért a pontos
  // shape nem fed át a MemberRow-val — unknown-on át castolunk (a kihagyott
  // mezőket ez az út úgysem olvassa). A MemberRow típust SZÁNDÉKOSAN nem szűkítjük.
  // 2026-07-17 (PR-1): település-fallback az utca-láncból (c_helysegid-hiány pótlása).
  const members: EnrichedMember[] = memberRowsForList.map(raw => {
    const m: MemberRow = applyStreetLocalityFallback(raw)
    const familyId = personToFamilyMap[m.id] ?? null
    const jarulek = computeJarulekForMemberYear({
      member: {
        id: m.id,
        sz_datum: m.sz_datum,
        familyId,
        foglalkozas: m.foglalkozas,
      },
      year: currentYear,
      currentYear,
      debtCalcMode,
      yearSettings,
      discounts,
      exemptions,
      payments: allocatedPayments,
    })

    let paymentStatus: EnrichedMember['paymentStatus'] = 'hatralekos'
    if (m.meghalt) paymentStatus = 'elhunyt'
    else if (m.member_status === 'elkoltozott' || m.elkoltozott) paymentStatus = 'elkoltozott'
    else if (m.member_status === 'kitért') paymentStatus = 'kitert'
    else if (exemptPersonSet.has(m.id) || (familyId && exemptFamilySet.has(familyId))) paymentStatus = 'felmentett'
    // 2026-07-17 (F5, Q7): a paidPersonSet/paidFamilySet ÖSSZEG-VAK ágak törölve a
    // rendezve-döntésből — a családi tétel felosztása után épp ezek hozták volna
    // vissza a régi „egy családi befizetés mindenkit rendez" szemantikát (és egy
    // 50 lejes részfizetés is rendezettnek mutatta a tagot).
    else if (jarulek.expected === 0 || jarulek.paid >= jarulek.expected) paymentStatus = 'rendezve'

    const hasEverPaid = everPaidPersonSet.has(m.id) || (familyId != null && everPaidFamilySet.has(familyId))

    return {
      ...m,
      paymentStatus,
      familyId,
      pendingTransfer: pendingTransferMap[m.id] || null,
      hasEverPaid,
    }
  })

  return { members, paidPersonIds, paidFamilyIds, exemptPersonIds, exemptFamilyIds, personToFamilyMap }
}

// ── Tag lakcíme a TÉRKÉPHEZ (2026-08-11) ─────────────────────
// A karton „Útvonal" gombja eddig a MAGYAR település-/utcanévből épített
// Google Maps linket („Barátos, Főút, 144, România"), amit a térkép nem talál
// meg — hivatalosan Brateș / Strada Principală. A hivatalos alakhoz szükséges
// `_ro` oszlopok 2026-04-21 óta megvannak, csak SENKI nem kérte le őket.
//
// A lista-lekérdezés (`getMembers`) SZÁNDÉKOSAN nem bővül: ott 1400 soron
// futna a plusz join, és a listának elég a magyar név. A térkép-adat a karton
// megnyitásakor, EGY sorra jön le.
//
// ⚠️ A `geo_*` oszlopok a 2026-08-11-cim-geokodolas.sql-lel születnek. Amíg az
//    nem futott le, a bővített SELECT 42703-mal elhalna és a karton NÉMÁN cím
//    nélkül maradna — ezért hiba esetén megismételjük a lekérdezést a geo-
//    oszlopok NÉLKÜL (ugyanaz az ellenállósági minta, mint a
//    `jarulek_kedvezmeny.kezdet` oszlopnál).
// ⚠️ 2026-08-11 — A MEGYE-ÁG AZ ORSZÁGOT IS LEHOZZA. E nélkül a kartonon a
//    KÜLFÖLD-KAPU (`isProvablyRomanianLocality`) nem tud dönteni: Budapestnek,
//    Debrecennek, Gödöllőnek, Győrnek, Hollandiának per definitionem nincs
//    román neve, tehát a pirula GARANTÁLTAN a piros „A térkép nem találja"
//    állapotra esne, és a karton egy tökéletesen jó cím javítását kérné. A
//    mezőkészlet SZÁNDÉKOSAN azonos a Hibák fül `LOCALITY_MAP_SELECT`-jével
//    (`validation-actions.ts`) — a két felület csak akkor nem mondhat ellent
//    egymásnak, ha UGYANAZT az adatot kapja ugyanahhoz a döntéshez.
const CIM_COUNTY_FIELDS =
  'id, name, name_hu, name_ro, siruta_code, auto_code, adrcountry:countryid(id, name, sname, name_hu, name_ro)'
const CIM_LOCALITY_FIELDS = 'id, name, name_hu, name_ro, default_postalcode, siruta_code, needs_review'
const CIM_STREET_FIELDS = 'id, name, name_hu, name_ro, street_type_ro, street_type_hu, postalcode'
const CIM_GEO_FIELDS = ', geo_lat, geo_lng, geo_verified_at'

function buildCimSelect(withGeo: boolean): string {
  const loc = `${CIM_LOCALITY_FIELDS}${withGeo ? CIM_GEO_FIELDS : ''}, adrcounty:countyid(${CIM_COUNTY_FIELDS})`
  const street = `${CIM_STREET_FIELDS}${withGeo ? CIM_GEO_FIELDS : ''}`
  // Az utcán KERESZTÜL is lehozzuk a települést: sok import-örökség sorban a
  // `c_helysegid` NULL, miközben a `c_utcaid` pontosan tudja a települést
  // (lásd `lib/members/street-locality-fallback.ts`).
  return `c_szam, adrlocality!c_helysegid(${loc}), adrstreet!c_utcaid(${street}, adrlocality!localityid(${loc}))`
}

type CimCountyRow = Omit<DirectionsCounty, 'country'> & {
  adrcountry?: DirectionsCountry | DirectionsCountry[] | null
}
type CimLocalityRow = Omit<DirectionsLocality, 'county'> & {
  adrcounty?: CimCountyRow | CimCountyRow[] | null
}
type CimStreetRow = DirectionsStreet & {
  adrlocality?: CimLocalityRow | CimLocalityRow[] | null
}

/** A PostgREST-sorból a `directions.ts` által várt alak (megye + ORSZÁG). */
function toDirectionsLocality(row: CimLocalityRow | null): DirectionsLocality | null {
  if (!row) return null
  const county = firstRel(row.adrcounty)
  return {
    ...row,
    county: county ? { ...county, country: firstRel(county.adrcountry) } : null,
  }
}
type CimRow = {
  c_szam: string | null
  adrlocality: CimLocalityRow | CimLocalityRow[] | null
  adrstreet: CimStreetRow | CimStreetRow[] | null
}

async function fetchMemberMapAddress(
  // A Supabase kliens típusa itt nem kifejezhető a helper-szinten.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: number,
  congregationId: string,
): Promise<MemberDirectionsAddress | null> {
  const run = (withGeo: boolean) =>
    supabase.from('szemely').select(buildCimSelect(withGeo)).eq('id', id).eq('congregation_id', congregationId).maybeSingle()

  let res = await run(true)
  if (res.error) {
    console.warn(
      '[tagnyilvantartas/cim] a geo-oszlopos cím-lekérdezés hibázott — újra a geo-oszlopok nélkül (lefutott már a 2026-08-11-cim-geokodolas.sql?):',
      res.error.message,
    )
    res = await run(false)
  }
  if (res.error || !res.data) {
    if (res.error) console.error('[tagnyilvantartas/cim] a cím-lekérdezés nem sikerült:', res.error.message)
    return null
  }

  const row = res.data as CimRow
  const street = firstRel(row.adrstreet)
  const locality = firstRel(row.adrlocality) ?? (street ? firstRel(street.adrlocality) : null)
  if (!locality && !street) return null

  return {
    locality: toDirectionsLocality(locality),
    street: street ?? null,
    houseNumber: row.c_szam,
  }
}

// ── Tag kartoték részletek ────────────────────────────────────

export async function getMemberDetails(id: number, familyId?: number | null) {
  const { supabase, congregationId } = await getProfileCongregation()
  const [memberRes, kereszt, konfirm, hazassagRes, temetesRes, bekolt, attert, payments, familyPayments, yearlySettingsRes, exemptionsRes, discountsRes, arrearsPaymentsRes, cimRes, orszagokRes] = await Promise.all([
    congregationId
      ? supabase.from('szemely').select('sz_datum, foglalkozas').eq('id', id).eq('congregation_id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    // 2026-07-24 (PR-4 F5.3): .limit(1) + id-desc rendezés a maybeSingle ELÉ —
    // duplikált anyakönyvi rekordnál (pl. kétszer importált keresztelés,
    // újraházasodás) a maybeSingle eddig PGRST116-tal elhalt, és a karton némán
    // „Nincs rögzítve"-t mutatott LÉTEZŐ adatnál. Így a legutóbbi rekord jön.
    supabase.from('keresztseg').select('*, adrlocality!helyid(name)').eq('id_szemely', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('konfirmalas').select('*, adrlocality!helyid(name)').eq('id_szemely', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('hazassag').select('id, datum, lelkeszneve, megjegyzes, adrlocality!helyid(name), id_ferfi, id_no').or(`id_ferfi.eq.${id},id_no.eq.${id}`).order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('temetes').select('*, adrlocality!thelyid(name)').eq('id_szemely', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bekoltozott').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('attert').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).order('id', { ascending: false }).limit(1).maybeSingle(),
    fetchPersonPaymentsCompat(supabase, id),
    familyId ? fetchFamilyPaymentsCompat(supabase, familyId) : Promise.resolve([]),
    congregationId
      ? supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId)
      : Promise.resolve({ data: [] }),
    congregationId
      ? familyId
        ? supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId).or(`id_szemely.eq.${id},id_csalad.eq.${familyId}`)
        : supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId).eq('id_szemely', id)
      : Promise.resolve({ data: [] }),
    congregationId
      ? supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true).order('sorrend', { ascending: true })
      : Promise.resolve({ data: [] }),
    // 2026-07-17 (F5, Q6): a congregations.tartozas_szamitas_mod lekérdezés törölve —
    // a mód kivezetve, senki nem olvasta.
    // 2026-07-24 (PR-4 F5.4): LIMIT-MENTES járulék-lekérdezés a hátralék-bontáshoz —
    // a payment-compat megjelenítési listái limitáltak (30/60), 30-nál több
    // család-szintű befizetésnél a karton TÚLBECSÜLTE a tartozást.
    // (F5-merge: + id_szemely, id_csalad — a Q7 családi felosztásnak a tétel
    // valódi címzettje kell.)
    supabase.from('befizetes')
      .select('id, id_szemely, id_csalad, datum, fizetettev, osszeg, stornozott, befizetescel!id_befizetescel(id_szamadasicel)')
      .or(familyId ? `id_szemely.eq.${id},id_csalad.eq.${familyId}` : `id_szemely.eq.${id}`)
      .or('deleted.eq.false,deleted.is.null'),
    // 2026-08-11: a térkép-célponthoz szükséges cím (hivatalos román nevek,
    // megye, irányítószám, egyeztetett pont). A hibája NEM buktathatja el a
    // karton betöltését — ilyenkor `null`, és a karton a magyar névre esik vissza.
    congregationId
      ? fetchMemberMapAddress(supabase, id, congregationId).catch((err) => {
          console.error('[tagnyilvantartas/cim] váratlan hiba a cím lekérésekor:', err)
          return null
        })
      : Promise.resolve(null),
    // 2026-08-11 (ÁTMENETI): az országtörzs mérete. Amíg egyetlen ország van
    // (Románia), az ország-mező NEM bizonyít semmit — Budapest, Debrecen,
    // Gödöllő, Győr és „Hollandia" is „romániai" —, ezért a kartonon a
    // külföld-kapu SZÁNDÉKOSAN néma marad. Lásd `directions.ts` →
    // `isOrszagtorzsErtelmes`. A tábla parányi (ma 1, a
    // 2026-08-11-orszagok-es-kulfoldi-telepulesek.sql után 3 sor).
    // ⚠️ A Hibák fül UGYANEZT a számot kérdezi le
    //    (`validation-actions.buildMapValidationContext`) — a két felület csak
    //    akkor nem mondhat ellent egymásnak, ha ugyanabból dönt.
    supabase.from('adrcountry').select('id'),
  ])

  const currentYear = new Date().getFullYear()
  // 2026-07-24 (PR-4 F5.4): globális datum-desc rendezés az összefésülés UTÁN —
  // eddig a személyi + családi lista egymás után fűzve, rendezetlenül ment ki,
  // és a karton „Legutóbbi év" kártyája a [0] elemből rossz értéket vett.
  const allPayments = [...payments, ...familyPayments]
    .reduce<typeof payments>((acc, payment) => {
      if (!acc.some((item) => item.id === payment.id)) acc.push(payment)
      return acc
    }, [])
    .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')))
  // 2026-07-17 (F1-4): a stornózott befizetés a hátralék-bontásba nem számít bele —
  // bit-azonosan a Tartozások listával (a befizetés-TÖRTÉNET listája viszont
  // változatlanul minden sort mutat).
  // 2026-07-24 (PR-4 F5.4): elsődleges forrás a limit-mentes lekérdezés; hibájánál
  // HANGOS log + visszaesés a (limitált) megjelenítési listára.
  type ArrearsPaymentRow = {
    id: number
    id_szemely?: number | null
    id_csalad?: number | null
    datum: string | null
    fizetettev: number | null
    osszeg: number
    stornozott: boolean | null
    befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }
  let jarulekPayments: Array<{ id_szemely?: number | null; id_csalad?: number | null; datum: string | null; fizetettev: number | null; osszeg: number }>
  if (arrearsPaymentsRes.error || !arrearsPaymentsRes.data) {
    console.error(
      '[tagnyilvantartas/reszletek] A limit-mentes járulék-lekérdezés hibázott — a limitált listából számolunk (a hátralék túlbecsülhető):',
      arrearsPaymentsRes.error?.message,
    )
    jarulekPayments = allPayments.filter((payment) => !payment.stornozott && isChurchMaintenanceCode(payment.befizetescelkod))
  } else {
    jarulekPayments = ((arrearsPaymentsRes.data || []) as ArrearsPaymentRow[])
      .filter((payment) => !payment.stornozott && isChurchMaintenanceCode(getPaymentGoalCode(payment.befizetescel)))
  }

  const exemptions = (exemptionsRes.data || []) as Array<{
    id_szemely: number | null
    id_csalad: number | null
    kezdete: number | null
    vege: number | null
  }>

  const yearSettings: Record<number, JarulekYearSetting> = {}
  ;((yearlySettingsRes.data || []) as Array<{ id: string | number; eves_jarulek: number | null; jarulek_kedvezmenyes: number | null; jarulek_hatarid: string | null }>).forEach((setting) => {
    const year = Number(setting.id)
    yearSettings[year] = {
      year,
      eves_jarulek: Number(setting.eves_jarulek) || 0,
      jarulek_kedvezmenyes: setting.jarulek_kedvezmenyes == null ? null : Number(setting.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: setting.jarulek_hatarid || null,
    }
  })

  // Ellenálló a `kezdet` oszlop hiányára (régi séma): ha a lekérdezés HIBÁZOTT, újra `kezdet` nélkül —
  // különben a SELECT némán [] -t adna, és az ÖSSZES mentett kedvezmény kiesne. Bit-azonos a
  // getExpectedJarulek ellenállóságával (commit 535c33fc); a kezdet ekkor null (nyitott ablak).
  let discData: Array<Record<string, unknown>> | null = discountsRes.data as Array<Record<string, unknown>> | null
  if (congregationId && 'error' in discountsRes && discountsRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('aktiv', true)
    if (retry.error) console.warn('[tagnyilvantartas/reszletek] jarulek_kedvezmeny retry (kezdet nélkül) is hibázott — a kedvezmények kimaradnak:', retry.error.message)
    discData = retry.data as Array<Record<string, unknown>> | null
  }
  const discounts = ((discData || []) as unknown as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))

  // 2026-07-17 (F5, Q6): a tartozas_szamitas_mod kivezetve — mindig 'akkori'. Ezzel
  // megszűnt az 'aktualis' módú gyülekezet tag-kartoték ⇄ Tartozás-lista eltérése is.
  const debtCalcMode = 'akkori' as const

  // 2026-07-17 (F5, Q7): a befizetések VALÓDI címzettjükkel mennek a motorba (eddig
  // minden — családi és más családtagi — tétel erre a tagra volt kényszerítve, teljes
  // összeggel), a tisztán családi tételek pedig felosztódnak a család tagjai közt.
  const identityPayments = jarulekPayments.map((payment) => ({
    id_szemely: payment.id_szemely ?? null,
    id_csalad: payment.id_csalad ?? null,
    datum: payment.datum,
    fizetettev: payment.fizetettev,
    osszeg: payment.osszeg,
  }))
  let allocatedDetailPayments: JarulekPaymentLike[] = identityPayments
  if (
    congregationId &&
    familyId &&
    // (a vegyes — személy+család — tétel is felosztás-köteles)
    identityPayments.some((p) => p.id_csalad != null)
  ) {
    const { data: famTagData } = await supabase
      .from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
    const famMemberIds = new Set<number>([id])
    for (const row of (famTagData || []) as Array<{
      id_szemely: number
      haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null
    }>) {
      const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
      if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id === familyId && row.id_szemely) {
        famMemberIds.add(row.id_szemely)
      }
    }
    const { data: famSzemely } = await supabase
      .from('szemely')
      .select('id, sz_datum, foglalkozas, meghalt, member_status')
      .eq('congregation_id', congregationId)
      .in('id', [...famMemberIds])
    const roster = ((famSzemely || []) as Array<{
      id: number; sz_datum: string | null; foglalkozas: string | null; meghalt: boolean | null; member_status: string | null
    }>)
      .filter((m) => !m.meghalt && !isJarulekExcludedMemberStatus(m.member_status))
      .map((m) => ({ id: m.id, sz_datum: m.sz_datum, familyId, foglalkozas: m.foglalkozas }))
    allocatedDetailPayments = allocateFamilyPayments(identityPayments, roster, (mem, y) =>
      computeBaseExpectedForMemberYear({
        member: mem,
        year: y,
        currentYear,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
      }),
    )
  }

  const arrearsBreakdown = Object.values(yearSettings)
    .map((setting) => {
      const year = setting.year
      if (year > currentYear) return null

      const result = computeJarulekForMemberYear({
        member: { id, sz_datum: memberRes.data?.sz_datum || null, familyId: familyId || null, foglalkozas: memberRes.data?.foglalkozas || null },
        year,
        currentYear,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
        payments: allocatedDetailPayments,
      })

      if (result.debt <= 0) return null

      return {
        year,
        yearlyFee: result.expected,
        paid: result.paid,
        debt: result.debt,
      }
    })
    .filter((row): row is {
      year: number
      yearlyFee: number
      paid: number
      debt: number
    } => row !== null)
    .sort((a, b) => b.year - a.year) as Array<{
      year: number
      yearlyFee: number
      paid: number
      debt: number
    }>

  return {
    kereszteles: kereszt.data,
    konfirmacio: konfirm.data,
    hazassag: hazassagRes.data,
    temetes: temetesRes.data,
    bekoltozott: bekolt.data,
    attert: attert.data,
    befizetesek: allPayments,
    arrearsBreakdown,
    /** 2026-08-11: a térkép-célpont nyersanyaga (`lib/members/directions.ts`). */
    cim: cimRes,
    /**
     * 2026-08-11 (ÁTMENETI): az országtörzs állapota a külföld-kapuhoz.
     * Lekérdezési hibánál `0` — az `isOrszagtorzsErtelmes` fail-closed, tehát a
     * karton ilyenkor a mai, óvatos ágon marad (semleges pirula, nulla riasztás).
     */
    orszagtorzs: { ismertOrszagok: (orszagokRes?.data || []).length } satisfies OrszagtorzsAllapot,
  }
}

// ── Tag mentés (insert / update) ─────────────────────────────

// 2026-08-25 (gyülekezeti egységek): a szemely.egyseg_id oszlop a
// 2026-08-25-gyulekezeti-egysegek.sql migrációval jön. Amíg az élesben nem
// futott le, a tag-mentés NEM bukhat el miatta: oszlop-hibánál az egyseg_id
// nélkül próbáljuk újra, és (ha volt tényleges egység-választás) figyelmeztetést
// adunk vissza. A minta ugyanaz, mint a district-auto-actions szemely.id_csoport
// ellenálló olvasása.
const EGYSEG_OSZLOP_HIANY_MINTA = /column|does not exist|schema cache|could not find/i
const EGYSEG_OSZLOP_HIANY_UZENET =
  'A tag mentve, de a gyülekezeti egység-besorolás nem került mentésre — ' +
  'az adatbázis-migráció (2026-08-25-gyulekezeti-egysegek.sql) még nem futott le.'

// 2026-08-25 (CNP kézi bevitel): a kézzel megadott személyi szám két ismert
// adatbázis-hibája MAGYAR üzenettel jön vissza (a nyers Postgres-szöveg
// helyett) — minden más hiba a meglévő formátumban megy tovább, semmit nem
// nyelünk el.
const CNP_UNIQUE_UZENET = 'Ez a személyi szám már szerepel a nyilvántartásban.'
const CNP_FK_UZENET =
  'A személyi szám nem módosítható, mert családi kapcsolat (szülő-gyermek) hivatkozik rá. ' +
  'Előbb a kapcsolatot kell rendezni.'

/**
 * A szemely-mentés hibaüzenete. Csak akkor fordítunk CNP-specifikus üzenetre,
 * ha a mentés ténylegesen KÜLDÖTT kézi cnp-t (cnpKuldve):
 * - 23505 + „cnp" a szövegben → az uniq_szemely_cnp_congregation_visible index
 *   ütközése (ugyanaz a személyi szám már szerepel a gyülekezetben);
 * - 23503 + „update or delete" → a HIVATKOZOTT cnp átírása (id_apja/id_anyja
 *   FK-k mutatnak rá) — a referencing-oldali („insert or update") 23503, azaz
 *   a nem létező szülő-cnp NEM ez az eset, az a nyers üzenettel megy tovább.
 */
function szemelyMentesHibaUzenet(
  error: { code?: string; message: string },
  cnpKuldve: boolean,
): string {
  if (cnpKuldve && error.code === '23505' && /cnp/i.test(error.message)) return CNP_UNIQUE_UZENET
  if (cnpKuldve && error.code === '23503' && /update or delete/i.test(error.message)) return CNP_FK_UZENET
  return `Hiba: ${error.message}`
}

/**
 * 2026-09-05 — A VALÓDI SZEMÉLYI SZÁM NEM KERÜLHET AZ EGYHÁZI AZONOSÍTÓBA.
 *
 * A `szemely.cnp` a rendszer belső azonosítója, és három csatornán terjed:
 * a TELJES taglistával utazik (a lista-lekérdezés kiválasztja, sőt a
 * szabadszavas keresés is rá épül), a `szemely` audit-triggere a TELJES sort
 * másolja a rendszerszintű `audit_log`-ba minden módosításkor, a
 * kereszt-gyülekezeti policy pedig idegen gyülekezet lelkészének is kiadja a
 * sort. Állami azonosítónak ott nincs helye.
 *
 * Az élő mérés szerint MA egyetlen valódi CNP sincs a `cnp`-ben — ez a kapu
 * tartja is így. A hivatalos szám helye a `szemely_szemelyi_szam` tábla, amit
 * a személyi kartonon lehet kitölteni.
 */
const VALODI_CNP_UZENET =
  'Ez érvényes romániai személyi számnak (CNP) látszik, ezért NEM menthető az „Egyházi azonosító" mezőbe. ' +
  'Az egyházi azonosító a rendszer belső kódja — a taglistával együtt utazik, és a változás-naplóba is bekerül, ' +
  'ezért állami azonosító nem kerülhet bele. A hivatalos személyi számot a személyi kartonon, a „Személyi szám (CNP)" ' +
  'mezőben mentsd el: az csak a saját gyülekezetedben látszik, és minden megtekintése naplózódik.'

export async function saveMember(data: MemberInput) {
  const parsed = memberSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const helysegId = await getOrCreateLocality(d.c_helyseg_text)
  const utcaId = helysegId ? await getOrCreateStreet(d.c_utca_text, helysegId) : null
  if (!helysegId || !utcaId) {
    return { error: 'A település/utca rögzítése nem sikerült — próbáld újra. (Lefutott már a 2026-06-10-es adatbázis-migráció?)' }
  }
  const szHelyId = await getOrCreateLocality(d.sz_hely_text)
  if (!szHelyId) {
    return { error: 'A születési hely rögzítése nem sikerült — ellenőrizd a település nevét, majd próbáld újra.' }
  }

  const memberData: Record<string, unknown> = {
    csaladnev: d.csaladnev,
    k_nev: d.k_nev,
    szcs_nev: d.szcs_nev || null,
    // 2026-08-01 (PR-19): név-előtag (id./ifj./özv./Dr.) — az űrlapról
    // állítható. Csak ELŐTAG-SZERŰ érték tárolható (max 6 karakter, ponttal
    // végződik, nincs szóköz) — a legacy teljes-név maradványok itt tisztulnak.
    namepattern: (() => {
      const np = d.namepattern?.trim() || null
      return np && np.length <= 6 && np.endsWith('.') && !/\s/.test(np) ? np : null
    })(),
    ferfi: d.ferfi,
    sz_datum: d.sz_datum || null,
    sz_helyid: szHelyId,
    foglalkozas: d.foglalkozas || null,
    vallas: d.vallas,
    c_helysegid: helysegId,
    c_utcaid: utcaId,
    c_szam: d.c_szam || '1',
    c_tombhaz: d.c_tombhaz || null,
    c_lepcsohaz: d.c_lepcsohaz || null,
    c_emelet: d.c_emelet || null,
    c_ajto: d.c_ajto || null,
    telefon: d.telefon || null,
    email: d.email || null,
    apjaneve: d.apjaneve || null,
    anyjaneve: d.anyjaneve || null,
    id_apja: d.id_apja_cnp || null,
    id_anyja: d.id_anyja_cnp || null,
    megjegyzes: d.megjegyzes || null,
    // #1 (Endre): közösségi profil-link (a fénykép ebből tölthető)
    social_profil_url: d.social_profil_url || null,
    // 2026-08-25 (gyülekezeti egységek): egység-címke (null = anyaközpont).
    // Szerkesztésnél az űrlap előtölti a meglévő értéket, így a mentés nem
    // törli a korábbi besorolást akkor sem, ha a mező épp nem látszik.
    egyseg_id: d.egyseg_id ?? null,
  }

  /** Az egyseg_id nélküli tartalék-mentés figyelmeztetése (migráció előtt). */
  let egysegWarning: string | undefined

  /** Az egyseg_id mező kihagyása a retry-hoz (oszlop-drift-biztos út). */
  const memberDataEgysegNelkul = () => {
    const { egyseg_id: _egysegId, ...tobbi } = memberData
    return tobbi
  }

  // 2026-08-25 (gyülekezeti egységek): egység-tulajdon ellenőrzés a mentés
  // ELŐTT — idegen gyülekezet egység-azonosítóját nem fogadjuk el. Az `aktiv`
  // oszlopra szándékosan NEM szűrünk: szerkesztésnél egy időközben inaktivált
  // egység címkéje megőrizhető. Ha a tábla még nem létezik (a migráció nem
  // futott le), NEM blokkoljuk a mentést — a lenti strip-retry út kezeli.
  if (d.egyseg_id != null) {
    const egysegRes = await supabase
      .from('gyulekezeti_egysegek')
      .select('id')
      .eq('id', d.egyseg_id)
      .eq('congregation_id', congregationId)
      .limit(1)
    if (egysegRes.error) {
      if (!/does not exist|schema cache|could not find/i.test(egysegRes.error.message)) {
        // Fail-closed: ismeretlen hibánál nem engedjük át az ellenőrizetlen ID-t.
        return { error: `A gyülekezeti egység ellenőrzése nem sikerült: ${egysegRes.error.message}` }
      }
      // Hiányzó tábla (migráció előtt): a mentés mehet tovább.
    } else if ((egysegRes.data?.length ?? 0) === 0) {
      return { error: 'A megadott gyülekezeti egység nem ehhez a gyülekezethez tartozik.' }
    }
  }

  let savedId = d.id

  // 2026-08-02 (PR-20 review): a KORÁBBI szülő-nevek az update ELŐTT — a
  // név-alapú szülő-párosítás csak MEGVÁLTOZOTT névre fut (különben minden
  // mentésnél újra felugrana ugyanaz a választó).
  let prevApjaneve: string | null = null
  let prevAnyjaneve: string | null = null

  if (d.id) {
    // UPDATE
    const { data: prevNames } = await supabase
      .from('szemely')
      .select('apjaneve, anyjaneve, cnp')
      .eq('id', d.id)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    prevApjaneve = (prevNames as { apjaneve: string | null } | null)?.apjaneve ?? null
    prevAnyjaneve = (prevNames as { anyjaneve: string | null } | null)?.anyjaneve ?? null

    // 2026-08-25 (CNP kézi bevitel): a cnp CSAK akkor megy ki az UPDATE-tel,
    // ha a lelkész NEM üres, a tárolttól ELTÉRŐ értéket írt be. Üres mező =
    // „változatlan" (a mentés SOSEM nullázhatja a tárolt személyi számot), és
    // az azonos érték újraküldését is kihagyjuk — a cnp-re családi FK-k
    // (id_apja/id_anyja) mutathatnak, fölösleges kockázatot nem vállalunk.
    const prevCnp = (prevNames as { cnp: string | null } | null)?.cnp ?? null
    const ujCnp = d.cnp?.trim() || ''
    if (ujCnp && valodiCnpGyanus(ujCnp)) return { error: VALODI_CNP_UZENET }
    if (ujCnp && ujCnp !== prevCnp) memberData.cnp = ujCnp

    let updateError = (
      await supabase.from('szemely').update(memberData).eq('id', d.id).eq('congregation_id', congregationId)
    ).error
    if (updateError && EGYSEG_OSZLOP_HIANY_MINTA.test(updateError.message)) {
      // 2026-08-25: migráció előtti séma — egyseg_id nélkül újra.
      const retry = await supabase
        .from('szemely')
        .update(memberDataEgysegNelkul())
        .eq('id', d.id)
        .eq('congregation_id', congregationId)
      updateError = retry.error
      if (!retry.error && d.egyseg_id != null) egysegWarning = EGYSEG_OSZLOP_HIANY_UZENET
    }
    if (updateError) return { error: szemelyMentesHibaUzenet(updateError, 'cnp' in memberData) }

    // 2026-07-24 (PR-4 F5.10): a Fizetési státusz eddig UPDATE-nél teljesen
    // figyelmen kívül maradt (halott vezérlő volt). Mostantól: 'felmentett'-re
    // váltásnál felmentés-rekord nyílik (ha nincs aktív), 'fizet'-re váltásnál
    // az aktív felmentés lezárul (tavalyi évvel).
    if (d.fizeto_status === 'felmentett' || d.fizeto_status === 'fizet') {
      const nowYear = new Date().getFullYear()
      const { data: exemptions } = await supabase.from('felmentes')
        .select('id, kezdete, vege')
        .eq('id_szemely', d.id)
        .eq('congregation_id', congregationId)
      const active = ((exemptions || []) as Array<{ id: number; kezdete: number | null; vege: number | null }>)
        .filter((f) => nowYear >= (f.kezdete || 0) && nowYear <= (f.vege || 2099))
      if (d.fizeto_status === 'felmentett' && active.length === 0) {
        const { error: exemptError } = await supabase.from('felmentes').insert([{
          id_szemely: d.id, congregation_id: congregationId, felmento: 'Rendszer',
          datum: new Date().toISOString(), oka: 'Tag-szerkesztés: felmentett státusz',
          kezdete: nowYear, vege: 2099,
        }])
        if (exemptError) return { error: `A tag mentve, de a felmentés rögzítése nem sikerült: ${exemptError.message}` }
      } else if (d.fizeto_status === 'fizet' && active.length > 0) {
        for (const f of active) {
          const { error: closeError } = await supabase.from('felmentes')
            .update({ vege: nowYear - 1 }).eq('id', f.id).eq('congregation_id', congregationId)
          if (closeError) return { error: `A tag mentve, de a felmentés lezárása nem sikerült: ${closeError.message}` }
        }
      }
    }
  } else {
    // INSERT
    // 2026-08-25 (CNP kézi bevitel): ha a lelkész megadott személyi számot, az
    // kerül tárolásra; üresen hagyva marad a mai út — a rendszer generál
    // egyházi azonosítót.
    const ujCnpInsert = d.cnp?.trim() || ''
    if (ujCnpInsert && valodiCnpGyanus(ujCnpInsert)) return { error: VALODI_CNP_UZENET }
    memberData.cnp = ujCnpInsert || generateCnp()
    memberData.congregation_id = congregationId
    memberData.isvisible = true
    memberData.type = 'E'
    memberData.befizetoev = new Date().getFullYear()
    memberData.csaladfo = false
    memberData.meghalt = false

    let insertRes = await supabase.from('szemely').insert([memberData]).select('id')
    if (insertRes.error && EGYSEG_OSZLOP_HIANY_MINTA.test(insertRes.error.message)) {
      // 2026-08-25: migráció előtti séma — egyseg_id nélkül újra.
      insertRes = await supabase.from('szemely').insert([memberDataEgysegNelkul()]).select('id')
      if (!insertRes.error && d.egyseg_id != null) egysegWarning = EGYSEG_OSZLOP_HIANY_UZENET
    }
    // A CNP-specifikus fordítás CSAK kézzel megadott személyi számnál — a
    // generált azonosító (elméleti) ütközése a nyers üzenettel megy tovább.
    if (insertRes.error) return { error: szemelyMentesHibaUzenet(insertRes.error, !!d.cnp?.trim()) }
    const inserted = insertRes.data
    if (!inserted?.[0]) return { error: 'Nem kaptunk vissza azonosítót.' }
    savedId = inserted[0].id

    // Felmentés
    if (d.fizeto_status === 'felmentett' && savedId) {
      await supabase.from('felmentes').insert([{
        id_szemely: savedId, congregation_id: congregationId, felmento: 'Rendszer', datum: new Date().toISOString(),
        oka: 'Új tag felvétele', kezdete: new Date().getFullYear(), vege: 2099,
      }])
    }
  }

  // Automatikus család-bekötés — 2026-08-02 (PR-20): közös helperrel
  // (lib/family/auto-family.ts). Két út:
  //   a) CNP-vel összekötött szülő (legördülőből választva) → azonnali bekötés;
  //   b) CSAK NÉVVEL beírt szülő → név-egyezés keresés a gyülekezetben:
  //      egyértelmű találatnál automatikus bekötés, több találatnál a
  //      felület felugró ablakban választat (parentLink eredmény-mező).
  let autoFamilyWarning: string | undefined
  let autoFamilyMoves: string[] = []
  let autoFamilyNotes: string[] = []
  let autoFamilyClosed: string[] = []
  let autoFamilyInfos: string[] = []
  let autoFamilyMoveRows: { personId: number; fromFamilyId: number | null; toFamilyId: number; sibling: boolean }[] = []
  let autoFamilyLinked = false
  let autoParentLinked = false
  /** 2026-08-04 (PR-38): felajánlott (jóváhagyandó) karton-kiegészítések */
  let autoFamilyOffers: FamilyCompletionOffer[] = []
  let parentLink: SaveMemberParentLink | undefined
  if (savedId && (d.id_apja_cnp || d.id_anyja_cnp || d.apjaneve?.trim() || d.anyjaneve?.trim())) {
    let ferfiId: number | null = null
    let noId: number | null = null

    // 2026-08-01 (PR-18): a CNP-lookup a SAJÁT gyülekezetre szűr — enélkül
    // (azonos CNP-vel) más gyülekezet személye is bekerülhetett a családba.
    if (d.id_apja_cnp) {
      const { data: a } = await supabase.from('szemely').select('id').eq('cnp', d.id_apja_cnp).eq('congregation_id', congregationId).limit(1)
      if (a?.[0]) ferfiId = a[0].id
    }
    if (d.id_anyja_cnp) {
      const { data: m } = await supabase.from('szemely').select('id').eq('cnp', d.id_anyja_cnp).eq('congregation_id', congregationId).limit(1)
      if (m?.[0]) noId = m[0].id
    }

    // b) NÉV-alapú párosítás, ha nincs SEMMILYEN CNP-hivatkozás (2026-08-02,
    // PR-20): pontos (kis-nagybetű-független) családnév+keresztnév egyezés,
    // nem szerint szűrve, kor-ésszerűségi ellenőrzéssel. Egy megbízható
    // találat → automatikus; egyébként a felugró ablak választat/megerősíttet.
    // FONTOS (review): megadott, de fel nem oldható CNP-nél NEM találgatunk
    // név alapján (a tárolt CNP-t nem írjuk felül); változatlan névre nem
    // futunk újra (ne ugorjon fel minden mentésnél ugyanaz a választó).
    const sameName = (input: string | undefined, prev: string | null) =>
      (input?.trim() || '').toLowerCase() === (prev ?? '').trim().toLowerCase()
    const apa = (ferfiId || d.id_apja_cnp)
      ? { input: d.apjaneve?.trim() || '', status: 'cnp' as const }
      : (d.id && sameName(d.apjaneve, prevApjaneve))
        ? { input: '', status: 'none' as const }
        : await matchParentByName(supabase, congregationId, d.apjaneve, true, savedId, d.sz_datum || null)
    const anya = (noId || d.id_anyja_cnp)
      ? { input: d.anyjaneve?.trim() || '', status: 'cnp' as const }
      : (d.id && sameName(d.anyjaneve, prevAnyjaneve))
        ? { input: '', status: 'none' as const }
        : await matchParentByName(supabase, congregationId, d.anyjaneve, false, savedId, d.sz_datum || null)

    const cnpUpdates: Record<string, unknown> = {}
    if (apa.status === 'linked' && apa.matched) {
      ferfiId = apa.matched.id
      if (apa.matched.cnp) cnpUpdates.id_apja = apa.matched.cnp
    }
    if (anya.status === 'linked' && anya.matched) {
      noId = anya.matched.id
      if (anya.matched.cnp) cnpUpdates.id_anyja = anya.matched.cnp
    }
    if (Object.keys(cnpUpdates).length > 0) {
      await supabase.from('szemely').update(cnpUpdates).eq('id', savedId).eq('congregation_id', congregationId)
    }

    if (ferfiId || noId) {
      const linkRes = await ensureChildFamilyLink(supabase, congregationId, savedId, ferfiId, noId, {
        c_utcaid: utcaId, c_szam: d.c_szam || null,
      })
      autoFamilyWarning = linkRes.warning ?? undefined
      autoFamilyMoves = describeMoves(linkRes.moves)
      autoFamilyNotes = linkRes.notes
      autoFamilyInfos = linkRes.infos
      autoFamilyClosed = linkRes.closedFamilies
      autoFamilyMoveRows = linkRes.moves.map((m) => ({
        personId: m.personId, fromFamilyId: m.fromFamilyId, toFamilyId: m.toFamilyId, sibling: m.sibling,
      }))
      autoFamilyLinked = linkRes.linked
      autoParentLinked = linkRes.parentLinked
      autoFamilyOffers = linkRes.offers
    }

    // Csak azt mutatjuk, amiről van mondanivaló: az üres-bemenetű 'none' és a
    // CNP-s részek kimaradnak (különben „a beírt «» névhez nem találtunk" sor
    // jelenne meg a meg-nem-adott szülőre).
    const forUi = (p: SaveMemberParentPart): SaveMemberParentPart | undefined =>
      (p.status === 'cnp' || (p.status === 'none' && !p.input)) ? undefined : p
    const apaUi = forUi(apa)
    const anyaUi = forUi(anya)
    // 2026-08-04 (PR-38): az ajánlat ÖNMAGÁBAN is felugró ablakot érdemel —
    // a lelkész csak így tudja egy kattintással jóváhagyni a kiegészítést.
    if (apaUi || anyaUi || autoFamilyWarning || autoFamilyMoves.length > 0
      || autoFamilyInfos.length > 0 || autoFamilyOffers.length > 0) {
      parentLink = {
        apa: apaUi,
        anya: anyaUi,
        familyWarning: autoFamilyWarning ?? null,
        familyMoves: autoFamilyMoves,
        familyNotes: autoFamilyNotes,
        familyClosed: autoFamilyClosed,
        familyInfos: autoFamilyInfos,
        familyLinked: autoFamilyLinked,
        parentLinked: autoParentLinked,
        familyOffers: autoFamilyOffers,
      }
    }
  }

  // Keresztelés upsert
  if (d.kereszteles_datum && savedId) {
    const kHelyId = d.kereszteles_hely ? await getOrCreateLocality(d.kereszteles_hely) : null
    const kData = { id_szemely: savedId, datum: d.kereszteles_datum, helyid: kHelyId, lelkeszneve: d.kereszteles_lelkesz || null, congregation_id: congregationId }
    const { data: ext } = await supabase.from('keresztseg').select('id').eq('id_szemely', savedId).limit(1)
    if (ext?.length) await supabase.from('keresztseg').update(kData).eq('id', ext[0].id)
    else await supabase.from('keresztseg').insert([kData])
  }

  // Konfirmáció upsert
  if (d.konfirmacio_datum && savedId) {
    const fHelyId = d.konfirmacio_hely ? await getOrCreateLocality(d.konfirmacio_hely) : null
    const fData = { id_szemely: savedId, datum: d.konfirmacio_datum, helyid: fHelyId, lelkeszneve: d.konfirmacio_lelkesz || null, congregation_id: congregationId }
    const { data: ext } = await supabase.from('konfirmalas').select('id').eq('id_szemely', savedId).limit(1)
    if (ext?.length) await supabase.from('konfirmalas').update(fData).eq('id', ext[0].id)
    else await supabase.from('konfirmalas').insert([fData])
  }

  // Beköltözött / áttért rekordok
  if (!d.id && savedId) {
    if (d.belepes_oka === 'bekoltozott' && d.bek_datum) {
      const honnanId = d.bek_honnan ? await getOrCreateLocality(d.bek_honnan) : null
      await supabase.from('bekoltozott').insert([{
        id_szemely: savedId, congregation_id: congregationId, mikor: d.bek_datum,
        honnanid: honnanId, igazolas: d.bek_igazolas || null,
      }])
    }
    if (d.belepes_oka === 'attert' && d.att_datum) {
      const honnanId = d.att_honnan ? await getOrCreateLocality(d.att_honnan) : null
      await supabase.from('attert').insert([{
        id_szemely: savedId, congregation_id: congregationId, mikor: d.att_datum,
        felekezet: d.att_felekezet || null, honnanid: honnanId,
      }])
    }
  }

  // #1 (Endre): GDPR-hozzájárulások mentése az űrlapról — a meglévő updateMemberConsents
  // action-t hívjuk, hogy a gdpr_consent_at dátum-logika egy helyen maradjon. A getMembers
  // előtölti a form checkboxait, így a szerkesztés-mentés nem törli a korábbi hozzájárulást.
  if (savedId != null) {
    await updateMemberConsents(savedId, {
      gdpr_consent: !!d.gdpr_consent,
      photo_consent: !!d.photo_consent,
      mailing_consent: !!d.mailing_consent,
    })
  }

  // 2026-06-10 (Fázis 2, P1-1): minden tag-mutáció auditnaplóba — a vallási
  // hovatartozás GDPR Art. 9 szerinti különleges adat.
  await logAuditEvent({
    action: 'member.save',
    targetTable: 'szemely',
    targetId: savedId != null ? String(savedId) : null,
    metadata: {
      mode: d.id ? 'update' : 'create',
      // 2026-08-03 (PR-23): az automatikus családi áthelyezés/összevonás a
      // mentés útján is történhet — a naplóban is nyomon követhető legyen
      ...(autoFamilyMoveRows.length > 0 ? { familyMoves: autoFamilyMoveRows } : {}),
      ...(autoFamilyClosed.length > 0 ? { familyClosed: autoFamilyClosed } : {}),
      ...(autoFamilyNotes.length > 0 ? { familyNotes: autoFamilyNotes } : {}),
    },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  // 2026-08-25: az egység-migráció előtti tartalék-mentés figyelmeztetése a
  // meglévő warning-csatornán megy ki (a kliens toast.warning-gal mutatja).
  const osszevontWarning = [egysegWarning, autoFamilyWarning].filter(Boolean).join(' ') || undefined
  return { success: true, id: savedId, warning: osszevontWarning, parentLink }
}

// ── Szülő-név párosítás + utólagos összekötés (2026-08-02, PR-20) ───────────

export interface SaveMemberParentPart {
  /** A kartonra beírt név */
  input: string
  /** cnp = legördülőből összekötve (régi út); linked = név alapján egyértelmű;
   *  ambiguous = több találat VAGY megerősítendő találat (felugró ablak
   *  választat); none = nincs találat */
  status: 'linked' | 'ambiguous' | 'none' | 'cnp'
  matched?: { id: number; cnp: string | null; name: string; birthYear: string | null }
  candidates?: { id: number; name: string; birthYear: string | null }[]
  /** true = a keresés átmeneti hiba miatt nem futott le (≠ nincs találat) */
  lookupFailed?: boolean
}

export interface SaveMemberParentLink {
  apa?: SaveMemberParentPart
  anya?: SaveMemberParentPart
  familyWarning: string | null
  /** „Márk Ildikó: Kovács család → Márk család" — tételes áthelyezés-napló (PR-23) */
  familyMoves?: string[]
  /** Összeférhetetlenségi / tájékoztató észrevételek (PR-23) */
  familyNotes?: string[]
  /** Az összevonás során lezárt (kiürült) családi kartonok (PR-23) */
  familyClosed?: string[]
  /** „Ez így rendben van" — nincs teendő, csak tájékoztatás (PR-24) */
  familyInfos?: string[]
  /** 2026-08-04 (PR-30): a tag bekerült-e a családi kartonra */
  familyLinked?: boolean
  /** Rögzült-e legalább egy szülő-kapcsolat (a családfán látszik) */
  parentLinked?: boolean
  /** 2026-08-04 (PR-38): egy kattintással jóváhagyható karton-kiegészítések —
   *  amit a rendszer a mostohaszülő-hazárd miatt NEM végzett el automatikusan */
  familyOffers?: FamilyCompletionOffer[]
}

/**
 * Szabadon beírt szülő-név párosítása gyülekezeti taghoz: PONTOS (kis-nagybetű-
 * független) családnév+keresztnév egyezés, nem szerint szűrve. Az esetleges
 * név-előtagot (id./ifj./özv./Dr.) a beírt szöveg elejéről levágjuk. Elhunyt
 * szülő is párosítható — a családfához a kapcsolat akkor is érvényes.
 *
 * 2026-08-02 (review): egyetlen találat is csak akkor AUTOMATIKUS, ha
 *  - a jelöltnek van születési dátuma ÉS legalább 15 évvel idősebb a
 *    gyermeknél (nehogy az azonos nevű FIÚT kössük be apának), ÉS
 *  - a beírt névben NEM volt nemzedék-előtag (id./ifj. — az önmagában jelzi,
 *    hogy azonos nevű rokonok vannak).
 * Minden más eset megerősítendő ('ambiguous' — a felugró ablak választat).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function matchParentByName(supabase: any, congregationId: string, rawName: string | undefined, isFather: boolean, childId: number, childBirthDate: string | null): Promise<SaveMemberParentPart> {
  const input = rawName?.trim() || ''
  if (!input) return { input, status: 'none' }
  const hadGenerationalPrefix = /^((id|ifj|legid|legifj)\.?\s+)/i.test(input)
  const cleaned = input.replace(/^((id|ifj|legid|legifj|özv|ozv|dr)\.?\s+)+/i, '').trim()
  const parts = cleaned.split(/\s+/)
  if (parts.length < 2) return { input, status: 'none' }

  const { data, error } = await supabase
    .from('szemely')
    .select('id, cnp, csaladnev, k_nev, sz_datum')
    .eq('congregation_id', congregationId)
    .eq('ferfi', isFather)
    .ilike('csaladnev', parts[0])
    .ilike('k_nev', parts.slice(1).join(' '))
    .neq('id', childId)
    .limit(6)
  if (error) {
    console.warn('[matchParentByName] keresés sikertelen:', error.message)
    return { input, status: 'none', lookupFailed: true }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data || []) as any[]
  const toInfo = (r: { id: number; cnp: string | null; csaladnev: string | null; k_nev: string | null; sz_datum: string | null }) => ({
    id: r.id,
    cnp: r.cnp ?? null,
    name: `${r.csaladnev ?? ''} ${r.k_nev ?? ''}`.trim(),
    birthYear: r.sz_datum?.slice(0, 4) ?? null,
  })
  if (rows.length === 1) {
    const candidate = rows[0] as { sz_datum: string | null }
    const childYear = childBirthDate ? Number(childBirthDate.slice(0, 4)) : null
    const candYear = candidate.sz_datum ? Number(candidate.sz_datum.slice(0, 4)) : null
    const agePlausible = childYear != null && candYear != null && childYear - candYear >= 15
    if (agePlausible && !hadGenerationalPrefix) {
      return { input, status: 'linked', matched: toInfo(rows[0]) }
    }
    // Bizonytalan egyetlen találat → megerősítendő
    return { input, status: 'ambiguous', candidates: rows.map(toInfo) }
  }
  if (rows.length > 1) return { input, status: 'ambiguous', candidates: rows.map(toInfo) }
  return { input, status: 'none' }
}

/**
 * Utólagos szülő-összekötés a felugró választóból: beírja a szülő-CNP-ket a
 * tag kartonjára, és lefuttatja UGYANAZT az auto-család bekötést, mint a
 * mentés (család + gyerek-sor + rokonsági élek + háztartás-szinkron).
 */
export async function linkMemberParents(input: { memberId: number; apaId?: number | null; anyaId?: number | null }) {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { memberId } = input
  if (!Number.isInteger(memberId) || memberId <= 0) return { error: 'Érvénytelen tag-azonosító.' }
  if (!input.apaId && !input.anyaId) return { error: 'Nincs kiválasztott szülő.' }

  const { data: member } = await supabase
    .from('szemely')
    .select('id, c_utcaid, c_szam')
    .eq('id', memberId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!member) return { error: 'A tag nem található az aktív gyülekezetben.' }

  async function resolveParent(id: number | null | undefined, expectedFerfi: boolean) {
    if (!id) return null
    const { data: p } = await supabase
      .from('szemely')
      .select('id, cnp, ferfi')
      .eq('id', id)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    if (!p) return null
    if (p.ferfi !== expectedFerfi) return null
    if (p.id === memberId) return null
    return p as { id: number; cnp: string | null; ferfi: boolean }
  }
  const apa = await resolveParent(input.apaId, true)
  const anya = await resolveParent(input.anyaId, false)
  if (!apa && !anya) return { error: 'A kiválasztott szülő nem található a gyülekezetben.' }

  const cnpUpdates: Record<string, unknown> = {}
  if (apa?.cnp) cnpUpdates.id_apja = apa.cnp
  if (anya?.cnp) cnpUpdates.id_anyja = anya.cnp
  if (Object.keys(cnpUpdates).length > 0) {
    await supabase.from('szemely').update(cnpUpdates).eq('id', memberId).eq('congregation_id', congregationId)
  }

  // 2026-08-02 (review): ha a gyermek MÁR egy aktív család tagja (pl. az első
  // szülő automatikus bekötése után), a MOST kiválasztott szülőt UGYANABBA a
  // családba kötjük be (a hiányzó házastárs-helyre) — a korábbi út új (fél)
  // családot keresett/hozott volna létre, és a dupla-tagsági őr blokkolt volna.
  const [{ data: gyRows }, allowedFamilyIds] = await Promise.all([
    supabase
      .from('gyerek')
      .select('id_csalad, csalad:csalad!id_csalad(id, id_ferfi, id_no, isaktiv)')
      .eq('id_szemely', memberId),
    // 2026-08-02 (review D2): csak a SAJÁT gyülekezet családja jöhet szóba —
    // az átjelentkezés idegen-gyülekezeti maradványa se ne blokkoljon, se ne
    // MUTÁLÓDJON (a foreign-elv PR-18 óta érvényes minden úton).
    getAllowedFamilyIds(supabase, congregationId),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeFam = ((gyRows || []) as any[])
    .map((r) => (Array.isArray(r.csalad) ? r.csalad[0] : r.csalad))
    .find((c) => c?.isaktiv && allowedFamilyIds.has(c.id as number)) as { id: number; id_ferfi: number | null; id_no: number | null } | undefined

  let res: { linked: boolean; familyId: number | null; warning: string | null }
  let moveLines: string[] = []
  let noteLines: string[] = []
  let closedLines: string[] = []
  let infoLines: string[] = []
  /** 2026-08-04 (PR-38): jóváhagyandó karton-kiegészítés(ek) */
  let offerRows: FamilyCompletionOffer[] = []
  if (activeFam) {
    if (apa && activeFam.id_ferfi != null && activeFam.id_ferfi !== apa.id) {
      return { error: 'A tag családjában már egy MÁSIK édesapa szerepel — előbb a családi kartonon módosítsd a felnőtt tagokat.' }
    }
    if (anya && activeFam.id_no != null && activeFam.id_no !== anya.id) {
      return { error: 'A tag családjában már egy MÁSIK édesanya szerepel — előbb a családi kartonon módosítsd a felnőtt tagokat.' }
    }
    const updates: Record<string, unknown> = {}
    if (apa && activeFam.id_ferfi == null) updates.id_ferfi = apa.id
    if (anya && activeFam.id_no == null) updates.id_no = anya.id
    if (Object.keys(updates).length > 0) {
      const { error: famErr } = await supabase.from('csalad').update(updates).eq('id', activeFam.id)
      if (famErr) return { error: `A család frissítése nem sikerült: ${famErr.message}` }
    }
    let warning: string | null = null
    try {
      // a rokonsági éleket és a háztartást is a sync hozza rendbe
      await syncHouseholdFromCsalad(supabase, activeFam.id, congregationId)
    } catch (e) {
      console.warn('[linkMemberParents] háztartás-szinkron sikertelen:', e instanceof Error ? e.message : e)
      warning = 'A szülő összekötve, de a háztartás-nézet szinkronizálása nem sikerült — mentsd el újra a családot.'
      // 2026-08-03 (PR-23 review): a felugró ablak a `notes` tömböt jeleníti
      // meg — e nélkül a szinkron-hiba némán elveszne.
      noteLines.push(warning)
    }
    if (Object.keys(updates).length > 0) {
      const famNames = await loadFamilyDisplayNames(supabase, [activeFam.id])
      moveLines = [`A szülő a tag meglévő családi kartonjára került: ${famNames.get(activeFam.id) ?? `Család #${activeFam.id}`}`]
    }
    res = { linked: true, familyId: activeFam.id, warning }
  } else {
    const linkRes = await ensureChildFamilyLink(supabase, congregationId, memberId, apa?.id ?? null, anya?.id ?? null, {
      c_utcaid: member.c_utcaid ?? null,
      c_szam: member.c_szam ?? null,
    })
    res = linkRes
    moveLines = describeMoves(linkRes.moves)
    noteLines = linkRes.notes
    closedLines = linkRes.closedFamilies
    infoLines = linkRes.infos
    offerRows = linkRes.offers
  }

  await logAuditEvent({
    action: 'member.link_parents',
    targetTable: 'szemely',
    targetId: String(memberId),
    metadata: {
      apaId: apa?.id ?? null,
      anyaId: anya?.id ?? null,
      linked: res.linked,
      // 2026-08-03 (PR-23): a tagság-mozgatás naplóban is nyomon követhető
      moves: moveLines,
      notes: noteLines,
      closedFamilies: closedLines,
    },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return {
    success: true,
    linked: res.linked,
    warning: res.warning ?? undefined,
    moves: moveLines,
    notes: noteLines,
    closed: closedLines,
    infos: infoLines,
    offers: offerRows,
  }
}

// ── Tag kivezetés ────────────────────────────────────────────

export async function removeMember(data: RemoveInput) {
  const parsed = removeSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { id, reason } = parsed.data

  // 2026-06-10 (Fázis 1): tulajdonjog-ellenőrzés — a kivezetés CSAK az aktív
  // gyülekezet saját tagjára futhat (IDOR-védelem, P0-1/P0-2). Enélkül a
  // 'meghalt'/'elkoltozott'/'kitert' ágak más gyülekezet tagjára is szúrtak
  // be temetési/elköltözési rekordot.
  const { data: ownedPerson } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!ownedPerson) return { error: 'A megadott tag nem található az aktív gyülekezetben.' }

  if (reason === 'meghalt') {
    const hHelyId = parsed.data.hhely ? await getOrCreateLocality(parsed.data.hhely) : null
    const tHelyId = parsed.data.thely ? await getOrCreateLocality(parsed.data.thely) : null
    await supabase.from('temetes').insert([{
      id_szemely: id, congregation_id: congregationId, hdatum: parsed.data.hdatum,
      tdatum: parsed.data.tdatum, hoka: parsed.data.hoka || null,
      lelkeszneve: parsed.data.lelkesz || null, munkanaploba: parsed.data.munkanaplo || false,
      hhelyid: hHelyId, thelyid: tHelyId,
    }])
    const { error } = await supabase.from('szemely').update({ meghalt: true, member_status: 'elhunyt', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }

    // 2026-06-10 (Fázis 3, P1-7b): halál-utak egységesítése — az anyakönyvi
    // saveBurial-lal azonos módon az új modellben lezárjuk a háztartás-tagságot
    // és a párkapcsolatot (a vér szerinti kapcsolatok érintetlenek).
    //
    // 2026-08-04 (PR-42): az ÉLETTÁRSI kapcsolat is lezárul (a PR-27 óta létező
    // 'elettars' típus eddig kimaradt, ezért örökre aktív maradt — fantom pár a
    // családfán), és a lezárás hibája sem vész el némán.
    const figyelmeztetesek: string[] = []
    try {
      const { error: haztErr } = await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: parsed.data.hdatum })
        .eq('id_szemely', id)
        .is('ervenyes_ig', null)
        .eq('congregation_id', congregationId)
      if (haztErr) {
        console.error('[removeMember] háztartás-tagság lezárása sikertelen:', haztErr.message)
        figyelmeztetesek.push('Az elhunyt háztartási tagsága nem zárult le — nyisd meg a Családok fülön a kartont, és ellenőrizd.')
      }
      const { error: parErr } = await supabase
        .from('szemely_kapcsolat')
        .update({ ervenyes_ig: parsed.data.hdatum })
        .in('tipus', ['hazastars', 'elettars'])
        .or(`id_szemely_1.eq.${id},id_szemely_2.eq.${id}`)
        .is('ervenyes_ig', null)
        .eq('congregation_id', congregationId)
      if (parErr) {
        console.error('[removeMember] párkapcsolat lezárása sikertelen:', parErr.message)
        figyelmeztetesek.push('A házastársi/élettársi kapcsolat lezárása nem sikerült — a családfán a pár egyelőre együtt jelenik meg. Végezd el újra a kivezetést.')
      }
    } catch (e) {
      console.warn('[removeMember] hibrid-modell lezárás sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
      figyelmeztetesek.push('A háztartási tagság és a párkapcsolat lezárása nem sikerült — nyisd meg a Családok fülön a kartont, és ellenőrizd.')
    }

    // 2026-08-15 (átvilágítás 23.): a választói jogosultság újraszámítása. Eddig
    // ez SEMMILYEN kivezetés után nem futott (csak a Választók fül kézi gombja
    // hívta), ezért az elhunyt a következő kézi frissítésig rajta maradt a
    // hivatalos névjegyzéken. Best-effort: a haláleset már el van mentve, ezt
    // nem görgetjük vissza — de a hibát figyelmeztetésként megmutatjuk.
    const voterMeghalt = await refreshVoterEligibility(supabase, congregationId, 'removeMember/meghalt')
    if (voterMeghalt.warning) figyelmeztetesek.push(voterMeghalt.warning)

    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'meghalt' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return {
      success: true,
      message: 'A haláleset sikeresen adminisztrálva.',
      warning: figyelmeztetesek.length > 0 ? figyelmeztetesek.join(' ') : undefined,
    }
  }

  if (reason === 'elkoltozott') {
    const hovaId = parsed.data.kolt_hova ? await getOrCreateLocality(parsed.data.kolt_hova) : null
    await supabase.from('elkoltozott').insert([{
      id_szemely: id, congregation_id: congregationId,
      mikor: parsed.data.kolt_datum || new Date().toISOString(),
      kulfoldre: parsed.data.kulfold || false, megjegyzes: parsed.data.kolt_megj || null, hovaid: hovaId,
    }])
    // 2026-07-17 (PR-2 F1.2): a szemely táblának NINCS elkoltozott oszlopa (a
    // költözés külön tábla — fentebb már beszúrtuk) — a korábbi `elkoltozott: true`
    // mező miatt az EGÉSZ update elhasalt, így a member_status SEM állt át, az
    // elköltözött tag „aktív" maradt (névjegyzéken is).
    const { error } = await supabase.from('szemely').update({ member_status: 'elköltözött', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
    // 2026-08-15 (átvilágítás 23.): újraszámítás — enélkül az elköltözött a
    // választói névjegyzéken maradt a következő kézi gombnyomásig.
    const voterElkoltozott = await refreshVoterEligibility(supabase, congregationId, 'removeMember/elkoltozott')
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'elkoltozott' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'Az elköltözés sikeresen adminisztrálva.', warning: voterElkoltozott.warning }
  }

  if (reason === 'kitert') {
    const hovaId = parsed.data.kitert_hova ? await getOrCreateLocality(parsed.data.kitert_hova) : null
    await supabase.from('kitert').insert([{
      id_szemely: id, congregation_id: congregationId, felekezet: parsed.data.kitert_vallas || 'Ismeretlen',
      mikor: parsed.data.kitert_datum || new Date().toISOString(), megjegyzes: parsed.data.kitert_megj || null, hovaid: hovaId,
    }])
    const { error } = await supabase.from('szemely').update({ member_status: 'kitért', vallas: parsed.data.kitert_vallas || 'Ismeretlen', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
    // 2026-08-15 (átvilágítás 23.): újraszámítás — a kitért tag member_statusa
    // most már azonnal kiveszi a névjegyzékből, nem csak kézi frissítés után.
    const voterKitert = await refreshVoterEligibility(supabase, congregationId, 'removeMember/kitert')
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'kitert' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'A kitérés sikeresen adminisztrálva.', warning: voterKitert.warning }
  }

  if (reason === 'torles') {
    // 2026-06-10 (Fázis 1): a végleges törlés egyetlen atomikus, jogosultság-
    // ellenőrzött RPC-ben fut (tagnyilvantartas_tag_torles):
    //  • pénzügyi VAGY anyakönyvi rekorddal rendelkező tag nem törölhető
    //    fizikailag → elrejtés (P0-3 — anyakönyvi bejegyzés nem semmisül meg),
    //  • a kapcsolt mozgás-/tagsági rekordok egy tranzakcióban törlődnek (P0-1),
    //  • váratlan FK-ütközés (pl. családfő) → automatikus elrejtés-fallback.
    // A korábbi munkanapló-törlés opció okafogyott: csak anyakönyvi rekordhoz
    // tartozott munkanapló-link, az ilyen tag pedig már nem törölhető, csak
    // elrejthető.
    // 2026-08-14 (1. döntés, „naplózott törlés"): a törlés ELŐTT pillanatképet
    // veszünk a személyről és a vele törlődő kapcsolatairól. Ha az RPC tényleg
    // VÉGLEGESEN töröl, a pillanatkép az audit_log-ba kerül — visszakereshető,
    // ki kit törölt, mikor, és mi tűnt el vele. Az RPC-n BELÜLI (atomikus)
    // naplózás SZÁNDÉKOSAN nem itt készül: a tagi-portál kompat lánc a törlő
    // függvényt exact ujjlenyomattal védi, előtte nem cserélhető — az a
    // portál-rollout körrel jön. DB-szintű háló addig is van: az
    // audit.record_version sor-trigger a szemely DELETE-et old_record-dal
    // naplózza.
    const { data: pillanatSor } = await supabase
      .from('szemely')
      .select('*')
      .eq('id', id)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    const szemelyPillanat = pillanatSor
      ? ({ ...(pillanatSor as Record<string, unknown>) } as Record<string, unknown>)
      : null
    if (szemelyPillanat) delete szemelyPillanat.kep // a base64 fénykép nem naplóba való
    let veleTorlodik: unknown = null
    try {
      const { data: kapcs } = await supabase.rpc('szemely_kapcsolatok', { p_szemely_id: id })
      veleTorlodik = (kapcs as { vele_torlodik?: unknown } | null)?.vele_torlodik ?? null
    } catch {
      // fail-soft: a kapcsolat-lista nélkül is naplózunk
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_tag_torles', { p_szemely_id: id })
    if (rpcErr) {
      // 2026-08-14 bírálói javítás: a migrációs utótag CSAK hiányzó függvénynél
      // jogos — más hibánál (pl. a tagi-portál életciklus-őre utasítja el az
      // elrejtést) félrevezetett.
      const hianyzoFuggveny = rpcErr.code === '42883' || rpcErr.message.includes('tagnyilvantartas_tag_torles')
      return {
        error: `A törlés nem sikerült: ${rpcErr.message}${
          hianyzoFuggveny ? ' (Lefutott már a 2026-06-10-es adatbázis-migráció?)' : ''
        }`,
      }
    }

    const status = (rpcData as { status?: string } | null)?.status
    // 2026-08-15 (átvilágítás 23.): a törlés/elrejtés is választói jogosultságot
    // érint (az elrejtett tag `isvisible=false` → nem jogosult), ezért a
    // ténylegesen végrehajtott ágak után újraszámolunk. A 'forbidden'/'not_found'
    // esetben nem történt változás, ott felesleges. Best-effort.
    const torlesVegrehajtva =
      status === 'deleted' || (typeof status === 'string' && status.startsWith('hidden_'))
    const voterTorles = torlesVegrehajtva
      ? await refreshVoterEligibility(supabase, congregationId, 'removeMember/torles')
      : { ok: true as const, warning: undefined }
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'torles', eredmeny: status || 'ismeretlen' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    switch (status) {
      case 'deleted':
        // A VÉGLEGES törlés kiemelt naplója teljes sor-pillanatképpel (a
        // data_wipe_log tanulsága: denormalizálva, hogy a sor eltűnése után
        // is olvasható legyen, MI veszett el). A logAuditEvent fail-soft.
        await logAuditEvent(
          {
            action: 'member.delete.permanent',
            targetTable: 'szemely',
            targetId: String(id),
            metadata: { szemely: szemelyPillanat, vele_torolt: veleTorlodik },
          },
          supabase,
        )
        return { success: true, message: 'A tag véglegesen törölve. A törlésről napló készült.', warning: voterTorles.warning }
      case 'hidden_payments':
        return { success: true, message: 'A tag elrejtve a névsorból (pénzügyi tranzakció miatt nem törölhető véglegesen).', warning: voterTorles.warning }
      case 'hidden_registry':
        return { success: true, message: 'A tag elrejtve a névsorból (anyakönyvi bejegyzései miatt nem törölhető véglegesen).', warning: voterTorles.warning }
      case 'hidden_kapcsolat':
        // 2026-08-14 (1. döntés): a v2 RPC a teljes kapcsolat-katalógusból
        // dönt — sírhely, leltár-felelős, család, CNP-szülőlánc stb. is véd.
        return { success: true, message: 'A tag elrejtve a névsorból (védett kapcsolatai miatt nem törölhető véglegesen).', warning: voterTorles.warning }
      case 'hidden_fk':
        return { success: true, message: 'A tag elrejtve a névsorból (kapcsolódó rekordok miatt nem törölhető véglegesen).', warning: voterTorles.warning }
      case 'forbidden':
        return { error: 'Nincs jogosultság a tag törléséhez.' }
      case 'not_found':
        return { error: 'A megadott tag nem található.' }
      default:
        return { error: 'Ismeretlen válasz a törlési művelettől.' }
    }
  }

  return { error: 'Ismeretlen művelet.' }
}

// ── Személy-törlés két útja (2026-08-14, 1. döntés) ──────────

/**
 * ELŐZETES kapcsolat-ellenőrzés a törlés-dialógushoz: a lelkész a törlés
 * ELŐTT látja, mi hivatkozik a személyre, és hogy a művelet végleges törlés
 * vagy elrejtés lesz-e. Csak olvas (szemely_kapcsolatok RPC).
 * Fail-soft: ha az RPC még nincs élesben, `available: false` — a dialógus a
 * régi, általános figyelmeztetést mutatja.
 */
export async function checkPersonReferences(
  personId: number,
): Promise<PersonReferencesResult> {
  const ures: PersonReferencesResult = { available: false, blokkolo: [], veleTorlodik: [] }
  if (!Number.isInteger(personId)) return ures

  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return ures

  const { data, error } = await supabase.rpc('szemely_kapcsolatok', { p_szemely_id: personId })
  if (error) {
    // 42883 = a 2026-08-14-szemely-torles-ket-utja.sql még nem futott le.
    console.warn('[checkPersonReferences]', error.message)
    return ures
  }
  const res = data as {
    status?: string
    blokkolo?: PersonReferenceItem[]
    vele_torlodik?: PersonReferenceItem[]
  } | null
  if (!res || res.status !== 'ok') {
    return {
      ...ures,
      error: res?.status === 'forbidden' ? 'Nincs jogosultság az ellenőrzéshez.' : undefined,
    }
  }
  return {
    available: true,
    blokkolo: res.blokkolo ?? [],
    veleTorlodik: res.vele_torlodik ?? [],
  }
}

/**
 * A rejtett (isvisible=false) személyek listája az aktív gyülekezetben.
 * A láthatatlanná tétel eddig a weben fekete lyuk volt — csak a desktopon
 * volt visszahozó út. A lista ad rálátást és visszautat.
 */
export async function listHiddenMembers(): Promise<{
  members: HiddenMemberItem[]
  /** true = a lista az 500-as plafonba ütközött — van még rejtett személy. */
  truncated?: boolean
  error?: string
}> {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { members: [], error: 'Nincs bejelentkezett felhasználó.' }

  const LIMIT = 500
  const { data, error } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, member_status')
    .eq('congregation_id', congregationId)
    .eq('isvisible', false)
    .order('csaladnev')
    .limit(LIMIT)
  if (error) return { members: [], error: `A rejtett személyek listája nem tölthető be: ${error.message}` }

  return {
    members: (data ?? []).map(r => ({
      id: r.id as number,
      nev: [r.csaladnev, r.k_nev].filter(Boolean).join(' ') || `#${r.id}`,
      memberStatus: (r.member_status as string | null) ?? null,
    })),
    // Néma csonkolás TILOS (K5-#21 hibaosztály): ha pont a plafonig ért a
    // lista, azt KIMONDJUK — a dialógus jelzi, hogy nem látszik minden.
    truncated: (data ?? []).length === LIMIT,
  }
}

/**
 * Rejtett személy visszahozása: isvisible=true, és ha a státusza a törlési
 * elrejtésből jövő 'törölt', visszaáll 'aktív'-ra (más státuszt — elhunyt,
 * elköltözött — NEM írunk át, az a kivezetési előzmény igazsága).
 */
export async function restoreHiddenMember(personId: number): Promise<{
  success?: boolean
  error?: string
}> {
  if (!Number.isInteger(personId)) return { error: 'Érvénytelen azonosító.' }

  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: row } = await supabase
    .from('szemely')
    .select('id, member_status')
    .eq('id', personId)
    .eq('congregation_id', congregationId)
    .eq('isvisible', false)
    .maybeSingle()
  if (!row) return { error: 'A rejtett személy nem található az aktív gyülekezetben.' }

  const update: { isvisible: boolean; member_status?: string } =
    row.member_status === 'törölt'
      ? { isvisible: true, member_status: 'aktív' }
      : { isvisible: true }

  const { error } = await supabase
    .from('szemely')
    .update(update)
    .eq('id', personId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `A visszahozás nem sikerült: ${error.message}` }

  await logAuditEvent(
    {
      action: 'member.restore',
      targetTable: 'szemely',
      targetId: String(personId),
      metadata: { elozo_status: row.member_status },
    },
    supabase,
  )
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Szülő keresés ────────────────────────────────────────────

export async function searchParent(query: string, isMale: boolean | null = null) {
  if (query.trim().length < 3) return []
  const { supabase, congregationId } = await getProfileCongregation()
  if (!congregationId) return []
  const parts = query.trim().split(/\s+/)
  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, cnp, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name, adrlocality!localityid(name))')
    .eq('congregation_id', congregationId).eq('isvisible', true)
  // Nem szűrés: null = mindkét nem (gyerek kereséshez)
  if (isMale !== null) q = q.eq('ferfi', isMale)

  if (parts.length === 1) {
    q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  } else {
    q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)
  }

  const { data } = await q.limit(5)
  // 2026-07-17 (PR-1): település-fallback az utca-láncból a találat-listában is.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data || []) as any[]).map((row) => applyStreetLocalityFallback(row))
}

// ── Megjegyzés-mezők a személyi kartonon (2026-06-10) ────────

export async function updateMemberNote(szemelyId: number, note: string) {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase.from('szemely')
    .update({ megjegyzes: note.trim() || null })
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  await logAuditEvent({ action: 'member.note_update', targetTable: 'szemely', targetId: String(szemelyId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── GDPR-hozzájárulások frissítése (2026-06-10, Fázis 5 / P3-5) ─────
export async function updateMemberConsents(
  szemelyId: number,
  consents: {
    gdpr_consent: boolean
    photo_consent: boolean
    mailing_consent: boolean
    /** 2026-08-26 (5. kör): név-publikálás a gyülekezet weboldalán (GDPR 9. cikk).
     *  undefined = a hívó (régi felület) nem küldte → a meglévő érték marad. */
    nev_publikalas_consent?: boolean
  },
) {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // A GDPR-hozzájárulás dátuma: ha most adták meg és eddig nem volt → mai dátum;
  // ha visszavonták → null.
  const { data: existing } = await supabase
    .from('szemely')
    .select('gdpr_consent_at')
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  const hadConsent = !!(existing as { gdpr_consent_at: string | null } | null)?.gdpr_consent_at

  const gdpr_consent_at = consents.gdpr_consent
    ? (hadConsent ? undefined : new Date().toISOString())
    : null

  const payload: Record<string, unknown> = {
    photo_consent: consents.photo_consent,
    mailing_consent: consents.mailing_consent,
  }
  if (gdpr_consent_at !== undefined) payload.gdpr_consent_at = gdpr_consent_at
  // Név-publikálás: a mikor is rögzül (igazolhatóság); visszavonáskor a
  // hozzájárulás ÉS a dátuma is törlődik — a publikus RPC kapuja miatt a név
  // azonnal eltűnik a weboldalról.
  if (consents.nev_publikalas_consent !== undefined) {
    payload.nev_publikalas_consent = consents.nev_publikalas_consent
    payload.nev_publikalas_consent_at = consents.nev_publikalas_consent ? new Date().toISOString() : null
  }

  let { error } = await supabase
    .from('szemely')
    .update(payload)
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
  if (error && /nev_publikalas_consent/.test(error.message || '')) {
    // Migráció előtti kecses visszaesés — a többi hozzájárulás mentése nem
    // hiúsulhat meg az új oszlop hiányán.
    const { nev_publikalas_consent: _n, nev_publikalas_consent_at: _na, ...regi } = payload
    const retry = await supabase.from('szemely').update(regi).eq('id', szemelyId).eq('congregation_id', congregationId)
    error = retry.error
  }
  if (error) return { error: `Hiba: ${error.message}` }

  await logAuditEvent({ action: 'member.consent_update', targetTable: 'szemely', targetId: String(szemelyId), metadata: { ...consents } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

/**
 * 2026-08-26 (5. kör): a név-publikálási hozzájárulás KÜLÖN, friss
 * lekérdezéssel jön (nem a központi tag-listából) — így a migráció előtti DB-n
 * a tagnyilvántartás nem törik, a válasz pedig: true/false, vagy null, ha az
 * oszlop még nem létezik (a felület ilyenkor a migrációra mutat).
 */
export async function getMemberNevPublikalasConsent(szemelyId: number): Promise<boolean | null> {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return null
  const { data, error } = await supabase
    .from('szemely')
    .select('nev_publikalas_consent')
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (error) return null
  const v = (data as { nev_publikalas_consent?: boolean | null } | null)?.nev_publikalas_consent
  return v === true
}

const NOTE_EVENT_KINDS = ['keresztseg', 'konfirmalas', 'hazassag', 'temetes', 'bekoltozott', 'attert'] as const
export type NoteEventKind = (typeof NOTE_EVENT_KINDS)[number]

// 2026-07-24 (PR-11 review): az anyakönyvi megjegyzés a '|sablon:{json}'
// utótagban strukturált emléklap-/gyászjelentés-adatot hordozhat (az Anyakönyv
// modul mintája) — a személyi kartonról mentett jegyzet NEM írhatja felül.
function splitSablonSuffix(note: string | null | undefined): { visible: string; suffix: string } {
  if (!note) return { visible: '', suffix: '' }
  const idx = note.indexOf('|sablon:')
  if (idx < 0) return { visible: note, suffix: '' }
  return { visible: note.slice(0, idx), suffix: note.slice(idx) }
}

export async function updateRegistryEventNote(kind: NoteEventKind, recordId: number, note: string) {
  if (!NOTE_EVENT_KINDS.includes(kind)) return { error: 'Ismeretlen eseménytípus.' }
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }
  // 2026-07-24 (PR-11 review): a sablon-utótag megőrzése + 0 sorra hangos hiba.
  const { data: existingRow } = await supabase.from(kind)
    .select('megjegyzes')
    .eq('id', recordId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (!existingRow) return { error: 'A bejegyzés nem található — lehet, hogy törölve lett, vagy más gyülekezeté.' }
  const { suffix } = splitSablonSuffix((existingRow as { megjegyzes: string | null }).megjegyzes)
  const { error, count } = await supabase.from(kind)
    .update({ megjegyzes: `${note.trim()}${suffix}` || null }, { count: 'exact' })
    .eq('id', recordId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  if (!count) return { error: 'A bejegyzés nem található — lehet, hogy törölve lett, vagy más gyülekezeté.' }
  await logAuditEvent({ action: 'registry.note_update', targetTable: kind, targetId: String(recordId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// 2026-07-24 (PR-11, 7. észrevétel): anyakönyvi esemény TELJES szerkesztése a
// személyi kartonról — ugyanazokba a táblákba ír, amiket az Anyakönyv modul
// olvas, így a módosítás ott is azonnal megjelenik. A helyszín NÉVBŐL oldódik
// fel (getOrCreateLocality), táblánként a megfelelő oszlopokba.
export async function updateRegistryEventDetails(
  kind: NoteEventKind,
  recordId: number,
  payload: {
    datum: string | null
    /** undefined = a mező ÉRINTETLEN (nem írjuk); ''/null = a felhasználó törölte. */
    helyNev?: string | null
    lelkeszneve: string | null
    megjegyzes: string | null
    /** Csak temetésnél értelmezett; undefined = érintetlen. */
    hoka?: string | null
  },
) {
  if (!NOTE_EVENT_KINDS.includes(kind)) return { error: 'Ismeretlen eseménytípus.' }
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const dateColumn = kind === 'temetes' ? 'tdatum' : kind === 'bekoltozott' || kind === 'attert' ? 'mikor' : 'datum'
  const localityColumn = kind === 'temetes' ? 'thelyid' : kind === 'bekoltozott' || kind === 'attert' ? 'honnanid' : 'helyid'
  const hasPastor = kind !== 'bekoltozott' && kind !== 'attert'

  // Elő-olvasás: (a) létezés/gyülekezet-ellenőrzés, (b) a megjegyzés
  // '|sablon:' utótagjának megőrzése, (c) audit before-értékek,
  // (d) munkanapló-link a szinkronhoz.
  const { data: existingRow, error: readError } = await supabase.from(kind)
    .select('*')
    .eq('id', recordId)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (readError) return { error: `Hiba: ${readError.message}` }
  if (!existingRow) return { error: 'A bejegyzés nem található — lehet, hogy törölve lett, vagy más gyülekezeté.' }
  const before = existingRow as Record<string, unknown>

  const { suffix: sablonSuffix } = splitSablonSuffix(before.megjegyzes as string | null)
  const newNote = payload.megjegyzes?.trim() || ''

  const update: Record<string, unknown> = {
    [dateColumn]: payload.datum?.trim() || null,
    megjegyzes: `${newNote}${sablonSuffix}` || null,
  }
  if (hasPastor) update.lelkeszneve = payload.lelkeszneve?.trim() || null
  // hoka: csak ha a hívó ténylegesen küldte — az undefined NEM törli az oszlopot.
  if (kind === 'temetes' && payload.hoka !== undefined) update.hoka = payload.hoka?.trim() || null

  // Helyszín: undefined = érintetlen mező, az oszlophoz nem nyúlunk — így az
  // változatlan mentés nem tudja átirányítani/kiüríteni a helység-FK-t.
  if (payload.helyNev !== undefined) {
    const helyNev = payload.helyNev?.trim()
    if (helyNev) {
      const localityId = await getOrCreateLocality(helyNev)
      if (localityId == null) return { error: `A(z) „${helyNev}" helység nem hozható létre.` }
      update[localityColumn] = localityId
    } else {
      update[localityColumn] = null
    }
  }

  // 2026-07-24 (PR-11 review): count nélkül a 0 soros UPDATE (más gyülekezet
  // bejegyzése / RLS-tiltás) hamis sikert jelezne — a saveBaptism mintája.
  const { error, count } = await supabase.from(kind)
    .update(update, { count: 'exact' })
    .eq('id', recordId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  if (!count) return { error: 'A bejegyzés nem található — lehet, hogy törölve lett, vagy más gyülekezeté.' }

  // Munkanapló-szinkron (nem blokkoló): ha az eseményhez munkanapló-bejegyzés
  // kapcsolódik, a dátum/lelkész ott is frissül — különben szétcsúszna.
  const worklogId = (before.munkanaplo_id as number | null | undefined) ?? null
  const newDate = payload.datum?.trim() || null
  if (worklogId && newDate && (kind === 'keresztseg' || kind === 'konfirmalas' || kind === 'hazassag' || kind === 'temetes')) {
    try {
      let jellege = kind === 'keresztseg' ? 'Keresztelő' : kind === 'konfirmalas' ? 'Konfirmáció' : kind === 'hazassag' ? 'Esketés' : 'Temetés'
      const personIds = kind === 'hazassag'
        ? [before.id_ferfi, before.id_no].filter((v): v is number => typeof v === 'number')
        : typeof before.id_szemely === 'number' ? [before.id_szemely] : []
      let cim = jellege
      if (personIds.length > 0) {
        const { data: personRows } = await supabase.from('szemely').select('id, csaladnev, k_nev').in('id', personIds)
        // 2026-08-14 (18. pont): a hivatalos ív F./N. ill. Azonos/Vegyes
        // bontásban kéri — a nem a bevett név-heurisztikából (guessGender),
        // a vegyes a hazassag sorából; ha nem megállapítható, a legacy
        // típusnév marad (az ív-besorolás azt is ismeri).
        const elsoKNev = (personRows?.[0] as { k_nev?: string | null } | undefined)?.k_nev ?? null
        if ((kind === 'keresztseg' || kind === 'temetes') && elsoKNev) {
          const no = guessGender(elsoKNev) === 'no'
          jellege = kind === 'keresztseg' ? (no ? 'N. keresztelő' : 'F. keresztelő') : (no ? 'N. temetés' : 'F. temetés')
        }
        if (kind === 'hazassag') {
          const vegyes = (before as { vegyes?: boolean | null }).vegyes
          if (vegyes === true) jellege = 'Vegyes esketés'
          else if (vegyes === false) jellege = 'Azonos esketés'
        }
        const names = (personRows || []).map((p: { csaladnev: string | null; k_nev: string | null }) => `${p.csaladnev || ''} ${p.k_nev || ''}`.trim()).filter(Boolean)
        if (names.length > 0) cim = `${jellege}: ${names.join(' és ')}`
      }
      await syncRegistryWorklogLink(supabase, congregationId, {
        sourceTable: kind,
        sourceId: recordId,
        currentWorklogId: worklogId,
        munkanaploba: true,
        payload: {
          idopont: newDate,
          jellege,
          cim,
          szolgalt: hasPastor ? payload.lelkeszneve?.trim() || null : null,
        },
      })
    } catch (e) {
      console.warn('[updateRegistryEventDetails] munkanaplo-szinkron sikertelen:', e instanceof Error ? e.message : e)
    }
  }

  const beforeValues: Record<string, unknown> = {}
  for (const key of Object.keys(update)) beforeValues[key] = before[key]
  await logAuditEvent({
    action: 'registry.event_update',
    targetTable: kind,
    targetId: String(recordId),
    metadata: {
      before: beforeValues,
      after: update,
      persons: kind === 'hazassag' ? { id_ferfi: before.id_ferfi ?? null, id_no: before.id_no ?? null } : { id_szemely: before.id_szemely ?? null },
    },
  }, supabase)
  revalidatePath('/tagnyilvantartas')
  revalidatePath('/anyakonyv')
  revalidatePath('/munkanaplo')
  return { success: true }
}


// ── E heti névnapok (2026-06-10, Fázis 5 / P3-1b) ────────────
// A nevnap referencia-tábla (honap, nap, nev1..nev3) a következő 7 napra.

export async function getUpcomingNameDays() {
  const supabase = await createClient()
  const pairs = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return { honap: d.getMonth() + 1, nap: d.getDate() }
  })
  const months = [...new Set(pairs.map(p => p.honap))]
  const { data } = await supabase
    .from('nevnap')
    .select('honap, nap, nev1, nev2, nev3')
    .in('honap', months)

  type NevnapRow = { honap: number; nap: number; nev1: string | null; nev2: string | null; nev3: string | null }
  const rows = (data || []) as NevnapRow[]
  return pairs.map(p => {
    const row = rows.find(r => r.honap === p.honap && r.nap === p.nap)
    return {
      honap: p.honap,
      nap: p.nap,
      nevek: row ? [row.nev1, row.nev2, row.nev3].filter(Boolean) as string[] : [],
    }
  })
}
