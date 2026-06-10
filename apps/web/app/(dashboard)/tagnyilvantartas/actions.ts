'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { memberSchema, removeSchema, type MemberInput, type RemoveInput } from '@/lib/validations/members'
import { generateCnp } from '@/lib/utils/member-helpers'
import type { MemberRow, EnrichedMember } from '@/lib/constants/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPersonPaymentsCompat } from '@/lib/finance/payment-compat'
import { computeJarulekForMemberYear, type JarulekDiscountRule, type JarulekExemption, type JarulekYearSetting } from '@/lib/finance/jarulek-calculation'
import { normalizeDebtCalcMode } from '@/lib/constants/finance'

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
  szamadasicel?: { kod: string | null } | { kod: string | null }[] | null
} | null

function getPaymentGoalCode(goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[]) {
  const normalizedGoal = Array.isArray(goal) ? goal[0] || null : goal || null
  const goalCodeRef = normalizedGoal?.szamadasicel
  const normalizedCodeRef = Array.isArray(goalCodeRef) ? goalCodeRef[0] || null : goalCodeRef || null
  return normalizedCodeRef?.kod || null
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
  const { data: existing } = await supabase.from('adrlocality').select('id').ilike('name', trimmed).limit(1).maybeSingle()
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

  const [membersRes, paymentsRes, everPaidRes, exemptionsRes, familiesRes, childrenRes, yearlySettingsRes, discountsRes, congregationRes, pendingTransfersRes] = await Promise.all([
    supabase.from('szemely').select('*, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)').eq('congregation_id', congregationId).eq('isvisible', true).order('id', { ascending: false }),
    supabase.from('befizetes').select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(szamadasicel(kod))').eq('congregation_id', congregationId).eq('fizetettev', currentYear).or('deleted.eq.false,deleted.is.null'),
    // 2026-04-30 (Endre kérése): "Aktív tag = református VAGY bármikor fizetett
    // egyházfenntartást." Ez a query MINDEN évre kéri a befizetéseket (csak az
    // egyházfenntartási kódra), hogy a "valaha fizetett" Set-et fel tudjuk építeni.
    supabase.from('befizetes').select('id_szemely, id_csalad, befizetescel(szamadasicel(kod))').eq('congregation_id', congregationId).or('deleted.eq.false,deleted.is.null'),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    // 2026-06-01 (hibrid család-modell Fázis 2): az ÚJ haztartas_tag-ból
    // szedjük ki a személy → csalad mapping-et. A `haztartas.legacy_csalad_id`
    // visszafelé kompatibilis a régi `csalad.id`-vel.
    supabase.from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null),
    // 2026-06-01: a `childrenRes` üresen marad (a fenti egy lekérdezés átveszi)
    Promise.resolve({ data: [] }),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(currentYear)),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('ev', currentYear).eq('aktiv', true),
    supabase.from('congregations').select('tartozas_szamitas_mod').eq('id', congregationId).maybeSingle(),
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
  const everPaidPersonSet = new Set<number>()
  const everPaidFamilySet = new Set<number>()
  ;((everPaidRes.data || []) as Array<{
    id_szemely: number | null
    id_csalad: number | null
    befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[]
  }>).forEach((payment) => {
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

  const discounts = ((discountsRes.data || []) as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))
  const debtCalcMode = normalizeDebtCalcMode(congregationRes.data?.tartozas_szamitas_mod)

  const exemptions = (exemptionsRes.data || []) as JarulekExemption[]

  // Enrichment
  const members: EnrichedMember[] = ((membersRes.data || []) as MemberRow[]).map(m => {
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
      payments: maintenancePayments,
    })

    let paymentStatus: EnrichedMember['paymentStatus'] = 'hatralekos'
    if (m.meghalt) paymentStatus = 'elhunyt'
    else if (m.member_status === 'elkoltozott' || m.elkoltozott) paymentStatus = 'elkoltozott'
    else if (m.member_status === 'kitért') paymentStatus = 'kitert'
    else if (exemptPersonSet.has(m.id) || (familyId && exemptFamilySet.has(familyId))) paymentStatus = 'felmentett'
    else if (jarulek.expected === 0 || jarulek.paid >= jarulek.expected || paidPersonSet.has(m.id) || (familyId && paidFamilySet.has(familyId))) paymentStatus = 'rendezve'

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
  const [memberRes, kereszt, konfirm, hazassagRes, temetesRes, bekolt, attert, payments, familyPayments, yearlySettingsRes, exemptionsRes, discountsRes, congregationRes] = await Promise.all([
    congregationId
      ? supabase.from('szemely').select('sz_datum, foglalkozas').eq('id', id).eq('congregation_id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('keresztseg').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('konfirmalas').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('hazassag').select('id, datum, lelkeszneve, megjegyzes, adrlocality!helyid(name), id_ferfi, id_no').or(`id_ferfi.eq.${id},id_no.eq.${id}`).maybeSingle(),
    supabase.from('temetes').select('*, adrlocality!thelyid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('bekoltozott').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('attert').select('*, adrlocality!honnanid(name)').eq('id_szemely', id).maybeSingle(),
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
      ? supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true)
      : Promise.resolve({ data: [] }),
    congregationId
      ? supabase.from('congregations').select('tartozas_szamitas_mod').eq('id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const currentYear = new Date().getFullYear()
  const allPayments = [...payments, ...familyPayments].reduce<typeof payments>((acc, payment) => {
    if (!acc.some((item) => item.id === payment.id)) acc.push(payment)
    return acc
  }, [])
  const jarulekPayments = allPayments.filter((payment) => isChurchMaintenanceCode(payment.befizetescelkod))

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

  const discounts = ((discountsRes.data || []) as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))

  const debtCalcMode = congregationRes.data?.tartozas_szamitas_mod === 'aktualis' ? 'aktualis' : 'akkori'

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
        payments: jarulekPayments.map((payment) => ({
          id_szemely: id,
          id_csalad: familyId || null,
          datum: payment.datum,
          fizetettev: payment.fizetettev,
          osszeg: payment.osszeg,
        })),
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
  const szHelyId = d.sz_hely_text ? await getOrCreateLocality(d.sz_hely_text) : null

  const memberData: Record<string, unknown> = {
    csaladnev: d.csaladnev,
    k_nev: d.k_nev,
    szcs_nev: d.szcs_nev || null,
    ferfi: d.ferfi,
    sz_datum: d.sz_datum || null,
    sz_helyid: szHelyId,
    foglalkozas: d.foglalkozas || null,
    vallas: d.vallas || 'Református',
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
  }

  let savedId = d.id

  if (d.id) {
    // UPDATE
    const { error } = await supabase.from('szemely').update(memberData).eq('id', d.id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
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

  // Automatikus család létrehozás (ha szülő CNP van)
  if (savedId && (d.id_apja_cnp || d.id_anyja_cnp)) {
    let ferfiId: number | null = null
    let noId: number | null = null

    if (d.id_apja_cnp) {
      const { data: a } = await supabase.from('szemely').select('id').eq('cnp', d.id_apja_cnp).limit(1)
      if (a?.[0]) ferfiId = a[0].id
    }
    if (d.id_anyja_cnp) {
      const { data: m } = await supabase.from('szemely').select('id').eq('cnp', d.id_anyja_cnp).limit(1)
      if (m?.[0]) noId = m[0].id
    }

    if (ferfiId || noId) {
      let query = supabase.from('csalad').select('id').eq('isaktiv', true)
      if (ferfiId) query = query.eq('id_ferfi', ferfiId)
      if (noId) query = query.eq('id_no', noId)
      const { data: existingFam } = await query.limit(1)

      let famId: number | null = null
      if (existingFam?.[0]) {
        famId = existingFam[0].id
      } else {
        const { data: newFam } = await supabase.from('csalad').insert([{
          id_ferfi: ferfiId, id_no: noId, c_utcaid: utcaId, c_szam: d.c_szam || '1', isaktiv: true,
        }]).select('id')
        if (newFam?.[0]) famId = newFam[0].id
      }

      if (famId) {
        const { data: check } = await supabase.from('gyerek').select('id').eq('id_szemely', savedId).eq('id_csalad', famId).limit(1)
        if (!check?.length) {
          await supabase.from('gyerek').insert([{ id_csalad: famId, id_szemely: savedId }])
        }

        // 2026-06-01 (hibrid család-modell Fázis 2): dual-write az új modellbe
        // — vér szerinti szülő-gyerek kapcsolatok + háztartás-tagság (mint a
        // baptism-action checkAndCreateFamily helper-je).
        try {
          // szülő-gyerek kapcsolatok (idempotens — partial unique index)
          if (ferfiId) {
            const { data: existingApa } = await supabase
              .from('szemely_kapcsolat')
              .select('id')
              .eq('id_szemely_1', ferfiId)
              .eq('id_szemely_2', savedId)
              .eq('tipus', 'szulo_gyermek')
              .is('ervenyes_ig', null)
              .limit(1)
            if (!existingApa?.length) {
              await supabase.from('szemely_kapcsolat').insert([{
                id_szemely_1: ferfiId, id_szemely_2: savedId,
                tipus: 'szulo_gyermek', ver_szerinti: true,
                congregation_id: congregationId,
              }])
            }
          }
          if (noId) {
            const { data: existingAnya } = await supabase
              .from('szemely_kapcsolat')
              .select('id')
              .eq('id_szemely_1', noId)
              .eq('id_szemely_2', savedId)
              .eq('tipus', 'szulo_gyermek')
              .is('ervenyes_ig', null)
              .limit(1)
            if (!existingAnya?.length) {
              await supabase.from('szemely_kapcsolat').insert([{
                id_szemely_1: noId, id_szemely_2: savedId,
                tipus: 'szulo_gyermek', ver_szerinti: true,
                congregation_id: congregationId,
              }])
            }
          }
          // háztartás-tagság (haztartas legacy_csalad_id = famId alapján)
          const { data: haztartas } = await supabase
            .from('haztartas')
            .select('id')
            .eq('legacy_csalad_id', famId)
            .is('ervenyes_ig', null)
            .limit(1)
            .maybeSingle()
          const haztartasId = (haztartas as { id: string } | null)?.id
          if (haztartasId) {
            const { data: existingTag } = await supabase
              .from('haztartas_tag')
              .select('id')
              .eq('id_haztartas', haztartasId)
              .eq('id_szemely', savedId)
              .is('ervenyes_ig', null)
              .limit(1)
            if (!existingTag?.length) {
              await supabase.from('haztartas_tag').insert([{
                id_haztartas: haztartasId, id_szemely: savedId,
                szerep: 'gyermek', is_primary: false,
                ervenyes_tol: new Date().toISOString().slice(0, 10),
                congregation_id: congregationId,
              }])
            }
          }
        } catch (e) {
          console.warn('[saveMember] hibrid-modell dual-write sikertelen (nem blokkoló):',
            e instanceof Error ? e.message : e)
        }
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

  revalidatePath('/tagnyilvantartas')
  return { success: true, id: savedId }
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
    const { error } = await supabase.from('szemely').update({ meghalt: true, congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
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
    const { error } = await supabase.from('szemely').update({ elkoltozott: true, member_status: 'elköltözött', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
    if (error) return { error: `Hiba: ${error.message}` }
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

    revalidatePath('/tagnyilvantartas')
    const status = (rpcData as { status?: string } | null)?.status
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
    .select('id, csaladnev, k_nev, cnp, sz_datum, c_szam, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congregationId).eq('isvisible', true)
  // Nem szűrés: null = mindkét nem (gyerek kereséshez)
  if (isMale !== null) q = q.eq('ferfi', isMale)

  if (parts.length === 1) {
    q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  } else {
    q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)
  }

  const { data } = await q.limit(5)
  return data || []
}

// ── Szülő gyors-rögzítés tagként (2026-06-10) ────────────────
// A tag-űrlapon a szülő szabad szövegként is megadható, de a családfához
// érdemes tagrekordként is léteznie. Ez az akció a beírt névből minimális
// szemely-rekordot készít (a gyermek címét örökli), és visszaadja a CNP-t,
// amivel az űrlap beállítja az id_apja/id_anyja linket.
export async function quickCreateParentMember(input: {
  name: string
  isMale: boolean
  c_helyseg_text?: string
  c_utca_text?: string
  c_szam?: string
}): Promise<{ id?: number; cnp?: string; error?: string }> {
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const parts = (input.name || '').trim().split(/\s+/)
  if (parts.length < 2) return { error: 'A szülő teljes nevét add meg (családnév és keresztnév).' }
  const csaladnev = parts[0]
  const kNev = parts.slice(1).join(' ')

  const helysegId = input.c_helyseg_text ? await getOrCreateLocality(input.c_helyseg_text) : null
  const utcaId = helysegId && input.c_utca_text ? await getOrCreateStreet(input.c_utca_text, helysegId) : null
  if (!helysegId || !utcaId) {
    return { error: 'A szülő rögzítéséhez előbb töltsd ki a tag címét (település + utca) — a szülő ezt örökli.' }
  }

  const cnp = generateCnp()
  const { data: ins, error } = await supabase.from('szemely').insert([{
    csaladnev, k_nev: kNev, ferfi: input.isMale, vallas: 'Református',
    c_helysegid: helysegId, c_utcaid: utcaId, c_szam: input.c_szam || '1',
    cnp, congregation_id: congregationId, isvisible: true, type: 'E',
    befizetoev: new Date().getFullYear(), csaladfo: false, meghalt: false,
  }]).select('id').single()
  if (error || !ins) return { error: `Hiba: ${error?.message || 'a szülő rögzítése nem sikerült'}` }

  revalidatePath('/tagnyilvantartas')
  return { id: ins.id, cnp }
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
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

const NOTE_EVENT_KINDS = ['keresztseg', 'konfirmalas', 'hazassag', 'temetes', 'bekoltozott', 'attert'] as const
export type NoteEventKind = (typeof NOTE_EVENT_KINDS)[number]

export async function updateRegistryEventNote(kind: NoteEventKind, recordId: number, note: string) {
  if (!NOTE_EVENT_KINDS.includes(kind)) return { error: 'Ismeretlen eseménytípus.' }
  const { supabase, user, congregationId } = await getProfileCongregation()
  if (!user || !congregationId) return { error: 'Nincs bejelentkezett felhasználó.' }
  const { error } = await supabase.from(kind)
    .update({ megjegyzes: note.trim() || null })
    .eq('id', recordId)
    .eq('congregation_id', congregationId)
  if (error) return { error: `Hiba: ${error.message}` }
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}
