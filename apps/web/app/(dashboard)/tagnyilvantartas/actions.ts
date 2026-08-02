'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { memberSchema, removeSchema, type MemberInput, type RemoveInput } from '@/lib/validations/members'
import { generateCnp } from '@/lib/utils/member-helpers'
import { logAuditEvent } from '@/lib/audit/log'
import type { MemberRow, EnrichedMember } from '@/lib/constants/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPersonPaymentsCompat } from '@/lib/finance/payment-compat'
import { allocateFamilyPayments, computeBaseExpectedForMemberYear, computeJarulekForMemberYear, isJarulekExcludedMemberStatus, type JarulekDiscountRule, type JarulekExemption, type JarulekPaymentLike, type JarulekYearSetting } from '@/lib/finance/jarulek-calculation'
import { applyStreetLocalityFallback } from '@/lib/members/street-locality-fallback'
import { syncRegistryWorklogLink } from '@/lib/worklog/registry-sync'
import { ensureChildFamilyLink } from '@/lib/family/auto-family'
import { syncHouseholdFromCsalad } from '@/lib/family/family-membership'

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

type PaymentGoalCodeRef = {
  id_szamadasicel?: string | null
  szamadasicel?:
    | { id?: string | null; kod?: string | null }
    | { id?: string | null; kod?: string | null }[]
    | null
} | null

function getPaymentGoalCode(goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[]) {
  const normalizedGoal = Array.isArray(goal) ? goal[0] || null : goal || null
  const goalCodeRef = normalizedGoal?.szamadasicel
  const normalizedCodeRef = Array.isArray(goalCodeRef) ? goalCodeRef[0] || null : goalCodeRef || null
  return normalizedGoal?.id_szamadasicel || normalizedCodeRef?.id || normalizedCodeRef?.kod || null
}

function isChurchMaintenanceCode(code?: string | null) {
  return typeof code === 'string' && code.startsWith('101.01')
}

// ── Település / utca getOrCreate ─────────────────────────────
// 2026-06-10 (Fázis 1 biztonsági hotfix): korábban guard nélküli exportált
// server actionök voltak, és mivel az adrlocality/adrstreet táblára az
// authenticated szerepnek nincs INSERT-grantja, a létrehozás csendben
// elbukott és 1-es id-ra esett vissza (rossz településre kötött tagok).
// Mostantól belső helperek: a létrehozás guardolt SECURITY DEFINER RPC-n fut
// (2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql), hiba esetén null.

async function getOrCreateLocality(name: string): Promise<number | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const supabase = await createClient()
  // 1) Meglévő település keresése — SELECT-grant mindig van, így ez a
  //    leggyakoribb eset a migráció lefutása előtt is működik.
  // 2026-07-24 (PR-11 review): a % és _ ILIKE-metakarakterek escape-elve
  // (különben pl. "Sepsi_szentgyörgy" mintaként viselkedne), és determinisztikus
  // sorrend duplikált nevű települések esetére.
  const escaped = trimmed.replace(/([\\%_])/g, '\\$1')
  const { data: existing } = await supabase.from('adrlocality').select('id').ilike('name', escaped).order('id', { ascending: true }).limit(1).maybeSingle()
  if (existing?.id) return existing.id
  // 2) Létrehozás guardolt RPC-n
  const { data, error } = await supabase.rpc('app_get_or_create_locality', { p_name: trimmed })
  if (error || typeof data !== 'number') {
    console.error('[getOrCreateLocality] sikertelen:', error?.message)
    return null
  }
  return data
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
    supabase.from('szemely').select('id, cnp, csaladnev, k_nev, szcs_nev, namepattern, allapot, ferfi, sz_datum, foglalkozas, vallas, telefon, email, meghalt, member_status, gdpr_consent_at, photo_consent, mailing_consent, social_profil_url, apjaneve, anyjaneve, megjegyzes, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, adrstreet!c_utcaid(name, adrlocality!localityid(name)), adrlocality!c_helysegid(name)').eq('congregation_id', congregationId).eq('isvisible', true).order('id', { ascending: false }),
    // 2026-07-17 (F1-4): a stornózott befizetés nem számít fizetettnek (bit-azonos a Tartozásokkal).
    supabase.from('befizetes').select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(id_szamadasicel)').eq('congregation_id', congregationId).eq('fizetettev', currentYear).or('deleted.eq.false,deleted.is.null').or('stornozott.eq.false,stornozott.is.null'),
    // 2026-04-30 (Endre kérése): "Aktív tag = református VAGY bármikor fizetett
    // egyházfenntartást." Ez a query MINDEN évre kéri a befizetéseket (csak az
    // egyházfenntartási kódra), hogy a "valaha fizetett" Set-et fel tudjuk építeni.
    // 2026-06-30 (perf): a 101.01* kód-szűrés a DB-be került (beágyazott inner-join),
    // korábban MINDEN befizetést lehúzott; a JS-szűrő alább forrás-igazságként marad,
    // és hiba esetén a szűretlen lekérdezésre esünk vissza.
    supabase.from('befizetes').select('id_szemely, id_csalad, befizetescel!inner(id_szamadasicel)').eq('congregation_id', congregationId).like('befizetescel.id_szamadasicel', '101.01%').or('deleted.eq.false,deleted.is.null'),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ haztartas_tag-ból
    // szedjük ki a személy → csalad mapping-et. A `haztartas.legacy_csalad_id`
    // visszafelé kompatibilis a régi `csalad.id`-vel.
    supabase.from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null),
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

  // Fizetők
  // 2026-07-17 (F1-1 hibaosztály): a fizetett-státusz lekérdezés hibája ne legyen
  // néma — különben minden tag fizetetlennek látszana a listán.
  if (paymentsRes.error) {
    console.error(
      '[tagnyilvantartas/lista] A fizetett-státusz befizetés-lekérdezése HIBÁRA FUTOTT — minden tag fizetetlennek látszana!',
      paymentsRes.error,
    )
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
    const retry = await supabase.from('befizetes')
      .select('id_szemely, id_csalad, befizetescel(id_szamadasicel)')
      .eq('congregation_id', congregationId).or('deleted.eq.false,deleted.is.null')
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

// ── Tag kartoték részletek ────────────────────────────────────

export async function getMemberDetails(id: number, familyId?: number | null) {
  const { supabase, congregationId } = await getProfileCongregation()
  const [memberRes, kereszt, konfirm, hazassagRes, temetesRes, bekolt, attert, payments, familyPayments, yearlySettingsRes, exemptionsRes, discountsRes, arrearsPaymentsRes] = await Promise.all([
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
  }
}

// ── Tag mentés (insert / update) ─────────────────────────────

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
      .select('apjaneve, anyjaneve')
      .eq('id', d.id)
      .eq('congregation_id', congregationId)
      .maybeSingle()
    prevApjaneve = (prevNames as { apjaneve: string | null } | null)?.apjaneve ?? null
    prevAnyjaneve = (prevNames as { anyjaneve: string | null } | null)?.anyjaneve ?? null

    const { error } = await supabase.from('szemely').update(memberData).eq('id', d.id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }

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
    memberData.cnp = generateCnp()
    memberData.congregation_id = congregationId
    memberData.isvisible = true
    memberData.type = 'E'
    memberData.befizetoev = new Date().getFullYear()
    memberData.csaladfo = false
    memberData.meghalt = false

    const { data: inserted, error } = await supabase.from('szemely').insert([memberData]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
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
    }

    // Csak azt mutatjuk, amiről van mondanivaló: az üres-bemenetű 'none' és a
    // CNP-s részek kimaradnak (különben „a beírt «» névhez nem találtunk" sor
    // jelenne meg a meg-nem-adott szülőre).
    const forUi = (p: SaveMemberParentPart): SaveMemberParentPart | undefined =>
      (p.status === 'cnp' || (p.status === 'none' && !p.input)) ? undefined : p
    const apaUi = forUi(apa)
    const anyaUi = forUi(anya)
    if (apaUi || anyaUi || autoFamilyWarning) {
      parentLink = { apa: apaUi, anya: anyaUi, familyWarning: autoFamilyWarning ?? null }
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
    metadata: { mode: d.id ? 'update' : 'create' },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return { success: true, id: savedId, warning: autoFamilyWarning, parentLink }
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
  const { data: gyRows } = await supabase
    .from('gyerek')
    .select('id_csalad, csalad:csalad!id_csalad(id, id_ferfi, id_no, isaktiv)')
    .eq('id_szemely', memberId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeFam = ((gyRows || []) as any[])
    .map((r) => (Array.isArray(r.csalad) ? r.csalad[0] : r.csalad))
    .find((c) => c?.isaktiv) as { id: number; id_ferfi: number | null; id_no: number | null } | undefined

  let res: { linked: boolean; familyId: number | null; warning: string | null }
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
    }
    res = { linked: true, familyId: activeFam.id, warning }
  } else {
    res = await ensureChildFamilyLink(supabase, congregationId, memberId, apa?.id ?? null, anya?.id ?? null, {
      c_utcaid: member.c_utcaid ?? null,
      c_szam: member.c_szam ?? null,
    })
  }

  await logAuditEvent({
    action: 'member.link_parents',
    targetTable: 'szemely',
    targetId: String(memberId),
    metadata: { apaId: apa?.id ?? null, anyaId: anya?.id ?? null, linked: res.linked },
  }, supabase)

  revalidatePath('/tagnyilvantartas')
  return { success: true, linked: res.linked, warning: res.warning ?? undefined }
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
    // és a házastársi kapcsolatot (a vér szerinti kapcsolatok érintetlenek).
    try {
      await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: parsed.data.hdatum })
        .eq('id_szemely', id)
        .is('ervenyes_ig', null)
        .eq('congregation_id', congregationId)
      await supabase
        .from('szemely_kapcsolat')
        .update({ ervenyes_ig: parsed.data.hdatum })
        .eq('tipus', 'hazastars')
        .or(`id_szemely_1.eq.${id},id_szemely_2.eq.${id}`)
        .is('ervenyes_ig', null)
        .eq('congregation_id', congregationId)
    } catch (e) {
      console.warn('[removeMember] hibrid-modell lezárás sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
    }

    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'meghalt' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'A haláleset sikeresen adminisztrálva.' }
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
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'elkoltozott' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'Az elköltözés sikeresen adminisztrálva.' }
  }

  if (reason === 'kitert') {
    const hovaId = parsed.data.kitert_hova ? await getOrCreateLocality(parsed.data.kitert_hova) : null
    await supabase.from('kitert').insert([{
      id_szemely: id, congregation_id: congregationId, felekezet: parsed.data.kitert_vallas || 'Ismeretlen',
      mikor: parsed.data.kitert_datum || new Date().toISOString(), megjegyzes: parsed.data.kitert_megj || null, hovaid: hovaId,
    }])
    const { error } = await supabase.from('szemely').update({ member_status: 'kitért', vallas: parsed.data.kitert_vallas || 'Ismeretlen', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'kitert' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'A kitérés sikeresen adminisztrálva.' }
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
    const { data: rpcData, error: rpcErr } = await supabase.rpc('tagnyilvantartas_tag_torles', { p_szemely_id: id })
    if (rpcErr) {
      return { error: `A törlés nem sikerült: ${rpcErr.message} (Lefutott már a 2026-06-10-es adatbázis-migráció?)` }
    }

    const status = (rpcData as { status?: string } | null)?.status
    await logAuditEvent({ action: 'member.remove', targetTable: 'szemely', targetId: String(id), metadata: { reason: 'torles', eredmeny: status || 'ismeretlen' } }, supabase)
    revalidatePath('/tagnyilvantartas')
    switch (status) {
      case 'deleted':
        return { success: true, message: 'A tag véglegesen törölve.' }
      case 'hidden_payments':
        return { success: true, message: 'A tag elrejtve a névsorból (pénzügyi tranzakció miatt nem törölhető véglegesen).' }
      case 'hidden_registry':
        return { success: true, message: 'A tag elrejtve a névsorból (anyakönyvi bejegyzései miatt nem törölhető véglegesen).' }
      case 'hidden_fk':
        return { success: true, message: 'A tag elrejtve a névsorból (kapcsolódó rekordok miatt nem törölhető véglegesen).' }
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
  consents: { gdpr_consent: boolean; photo_consent: boolean; mailing_consent: boolean },
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

  const { error } = await supabase
    .from('szemely')
    .update(payload)
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }

  await logAuditEvent({ action: 'member.consent_update', targetTable: 'szemely', targetId: String(szemelyId), metadata: { ...consents } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
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
      const jellege = kind === 'keresztseg' ? 'Keresztelő' : kind === 'konfirmalas' ? 'Konfirmáció' : kind === 'hazassag' ? 'Esketés' : 'Temetés'
      const personIds = kind === 'hazassag'
        ? [before.id_ferfi, before.id_no].filter((v): v is number => typeof v === 'number')
        : typeof before.id_szemely === 'number' ? [before.id_szemely] : []
      let cim = jellege
      if (personIds.length > 0) {
        const { data: personRows } = await supabase.from('szemely').select('id, csaladnev, k_nev').in('id', personIds)
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
