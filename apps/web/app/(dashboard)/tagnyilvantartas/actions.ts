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

export async function getOrCreateLocality(name: string): Promise<number> {
  if (!name?.trim()) return 1
  const supabase = await createClient()
  const { data } = await supabase.from('adrlocality').select('id').ilike('name', name.trim()).limit(1).single()
  if (data) return data.id
  const { data: ins } = await supabase.from('adrlocality').insert([{ name: name.trim(), countyid: 1 }]).select('id').single()
  return ins?.id ?? 1
}

export async function getOrCreateStreet(name: string, localityId: number): Promise<number> {
  if (!name?.trim()) return 1
  const supabase = await createClient()
  const { data } = await supabase.from('adrstreet').select('id').ilike('name', name.trim()).eq('localityid', localityId).limit(1).single()
  if (data) return data.id
  const { data: ins } = await supabase.from('adrstreet').insert([{ name: name.trim(), localityid: localityId }]).select('id').single()
  return ins?.id ?? 1
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

  const [membersRes, paymentsRes, exemptionsRes, familiesRes, childrenRes, yearlySettingsRes, discountsRes, congregationRes, pendingTransfersRes] = await Promise.all([
    supabase.from('szemely').select('*, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)').eq('congregation_id', congregationId).eq('isvisible', true).order('id', { ascending: false }),
    supabase.from('befizetes').select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(szamadasicel(kod))').eq('congregation_id', congregationId).eq('fizetettev', currentYear).or('deleted.eq.false,deleted.is.null'),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege'),
    supabase.from('csalad').select('id, id_ferfi, id_no'),
    supabase.from('gyerek').select('id_szemely, id_csalad'),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(currentYear)),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('ev', currentYear).eq('aktiv', true),
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

  // Személy → család mapping
  const personToFamilyMap: Record<number, number> = {}
  if (familiesRes.data) familiesRes.data.forEach((f: { id: number; id_ferfi: number | null; id_no: number | null }) => {
    if (f.id_ferfi) personToFamilyMap[f.id_ferfi] = f.id
    if (f.id_no) personToFamilyMap[f.id_no] = f.id
  })
  if (childrenRes.data) childrenRes.data.forEach((c: { id_szemely: number; id_csalad: number }) => {
    if (c.id_szemely) personToFamilyMap[c.id_szemely] = c.id_csalad
  })

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

    return {
      ...m,
      paymentStatus,
      familyId,
      pendingTransfer: pendingTransferMap[m.id] || null,
    }
  })

  return { members, paidPersonIds, paidFamilyIds, exemptPersonIds, exemptFamilyIds, personToFamilyMap }
}

// ── Tag kartoték részletek ────────────────────────────────────

export async function getMemberDetails(id: number, familyId?: number | null) {
  const { supabase, congregationId } = await getProfileCongregation()
  const [memberRes, kereszt, konfirm, hazassagRes, temetesRes, bekolt, attert, payments, familyPayments, yearlySettingsRes, exemptionsRes, discountsRes, congregationRes] = await Promise.all([
    congregationId
      ? supabase.from('szemely').select('sz_datum').eq('id', id).eq('congregation_id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('keresztseg').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('konfirmalas').select('*, adrlocality!helyid(name)').eq('id_szemely', id).maybeSingle(),
    supabase.from('hazassag').select('datum, lelkeszneve, adrlocality!helyid(name), id_ferfi, id_no').or(`id_ferfi.eq.${id},id_no.eq.${id}`).maybeSingle(),
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
        ? supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').or(`id_szemely.eq.${id},id_csalad.eq.${familyId}`)
        : supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('id_szemely', id)
      : Promise.resolve({ data: [] }),
    congregationId
      ? supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true)
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
        member: { id, sz_datum: memberRes.data?.sz_datum || null, familyId: familyId || null },
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
  const utcaId = await getOrCreateStreet(d.c_utca_text, helysegId)
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
        id_szemely: savedId, felmento: 'Rendszer', datum: new Date().toISOString(),
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
    // Pénzügyi tranzakció ellenőrzés
    const { data: payments } = await supabase.from('befizetes').select('id').eq('id_szemely', id).eq('congregation_id', congregationId).neq('deleted', true).limit(1)
    if (payments?.length) {
      // Van tranzakció → elrejtés
      await supabase.from('szemely').update({ isvisible: false, member_status: 'törölt', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
      revalidatePath('/tagnyilvantartas')
      return { success: true, message: 'A tag elrejtve a névsorból (pénzügyi tranzakció miatt nem törölhető véglegesen).' }
    }

    // Munkanapló törlés (ha kérte)
    if (parsed.data.delete_worklogs) {
      const [kData, fData, tData] = await Promise.all([
        supabase.from('keresztseg').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null),
        supabase.from('konfirmalas').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null),
        supabase.from('temetes').select('munkanaplo_id').eq('id_szemely', id).not('munkanaplo_id', 'is', null),
      ])
      const munkanaploIds = [...(kData.data || []), ...(fData.data || []), ...(tData.data || [])]
        .map(x => (x as { munkanaplo_id: number }).munkanaplo_id).filter(Boolean)
      if (munkanaploIds.length > 0) {
        await supabase.from('munkanaplo').delete().in('id', munkanaploIds).eq('congregation_id', congregationId)
      }
    }

    // Csatolt adatok törlése
    await Promise.all([
      supabase.from('keresztseg').delete().eq('id_szemely', id),
      supabase.from('konfirmalas').delete().eq('id_szemely', id),
      supabase.from('bekoltozott').delete().eq('id_szemely', id),
      supabase.from('attert').delete().eq('id_szemely', id),
      supabase.from('felmentes').delete().eq('id_szemely', id),
      supabase.from('gyerek').delete().eq('id_szemely', id),
      supabase.from('presbiter').delete().eq('id_szemely', id),
    ])

    // Fizikai törlés (RLS fallback: elrejtés)
    const { data: delData, error: delErr } = await supabase.from('szemely').delete().eq('id', id).eq('congregation_id', congregationId).select('id')
    if (delErr || !delData?.length) {
      await supabase.from('szemely').update({ isvisible: false, member_status: 'törölt', congregation_id: congregationId }).eq('id', id).eq('congregation_id', congregationId)
      revalidatePath('/tagnyilvantartas')
      return { success: true, message: 'A tag elrejtve (az adatbázis biztonsági szabályai miatt fizikai törlés nem lehetséges).' }
    }

    revalidatePath('/tagnyilvantartas')
    return { success: true, message: 'A tag véglegesen törölve.' }
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
