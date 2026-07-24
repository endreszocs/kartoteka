import type { SupabaseClient } from '@supabase/supabase-js'

type NameRef = { csaladnev: string | null; k_nev: string | null } | null
type GoalCodeRef = { kod?: string | null; id?: string | null } | null
type PaymentGoalRef = {
  nev: string | null
  id_szamadasicel?: string | null
  szamadasicel?: GoalCodeRef | GoalCodeRef[]
} | null

export interface PaymentDetailsRow {
  id: number
  /** 2026-07-17 (F5, Q7): a befizetés valódi címzettje — a családi felosztáshoz kell. */
  id_szemely?: number | null
  id_csalad?: number | null
  datum: string
  osszeg: number
  fizetettev: number | null
  nyugta?: string | null
  iratszam?: string | null
  nyugtaszam?: string | null
  bizonylatszam?: string | null
  /** 2026-07-17 (F1-4): a hátralék-bontás kiszűri a stornót; a régi séma-fallback
   *  variánsok nem kérik le → undefined = nem stornózott. */
  stornozott?: boolean | null
  befizetescel?: PaymentGoalRef
  befizetescelkod?: string | null
}

export interface FamilyPaymentDetailsRow extends PaymentDetailsRow {
  forrasa?: string | null
  szemely?: NameRef
  befizetescel?: PaymentGoalRef
}

function isMissingColumnError(message?: string) {
  const lower = message?.toLowerCase() || ''
  return (
    lower.includes('column') ||
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist')
  )
}

function normalizePaymentRow<T extends PaymentDetailsRow>(row: T): T {
  const normalizedGoal = Array.isArray(row.befizetescel) ? row.befizetescel[0] || null : row.befizetescel || null
  const normalizedGoalCode = normalizedGoal?.szamadasicel
  const goalCodeRef = Array.isArray(normalizedGoalCode) ? normalizedGoalCode[0] || null : normalizedGoalCode || null

  return {
    ...row,
    befizetescel: normalizedGoal,
    befizetescelkod:
      row.befizetescelkod ||
      normalizedGoal?.id_szamadasicel ||
      goalCodeRef?.kod ||
      goalCodeRef?.id ||
      null,
    nyugtaszam: row.nyugtaszam || row.nyugta || row.iratszam || null,
    bizonylatszam: row.bizonylatszam || row.iratszam || row.nyugta || null,
  }
}

function normalizeFamilyPaymentRow(row: {
  id: number
  osszeg: number
  datum: string
  fizetettev: number | null
  nyugta?: string | null
  nyugtaszam?: string | null
  bizonylatszam?: string | null
  iratszam?: string | null
  forrasa?: string | null
  szemely?: NameRef | NameRef[]
  befizetescel?: PaymentGoalRef | PaymentGoalRef[]
}): FamilyPaymentDetailsRow {
  const normalizedPerson = Array.isArray(row.szemely) ? row.szemely[0] || null : row.szemely || null
  const normalizedGoal = Array.isArray(row.befizetescel) ? row.befizetescel[0] || null : row.befizetescel || null

  return normalizePaymentRow({
    ...row,
    szemely: normalizedPerson,
    befizetescel: normalizedGoal,
  })
}

async function fetchCompatRows<T>(
  queries: Array<() => PromiseLike<unknown>>,
): Promise<T[]> {
  let lastError: string | null = null

  for (const query of queries) {
    const result = (await query()) as { data: unknown[] | null; error: { message: string } | null }
    if (!result.error) {
      return ((result.data || []) as T[])
    }

    lastError = result.error.message
    if (!isMissingColumnError(result.error.message)) {
      throw new Error(result.error.message)
    }
  }

  throw new Error(lastError || 'Ismeretlen befizetési sémahiba történt.')
}

export async function fetchPersonPaymentsCompat(
  supabase: SupabaseClient,
  personId: number,
): Promise<PaymentDetailsRow[]> {
  // 2026-07-17 (F1-1): az `id_szamadasicel`-es variáns az ELSŐ — a szamadasicel-nek
  // nincs `kod` oszlopa az éles sémában, a kod-os variánsok csak történelmi
  // fallbackként maradnak (régi sémák), így nem égetünk el egy bukó kört minden híváskor.
  const rows = await fetchCompatRows<PaymentDetailsRow & { befizetescel?: PaymentGoalRef | PaymentGoalRef[] }>([
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, datum, osszeg, fizetettev, nyugta, iratszam, stornozott, befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .eq('id_szemely', personId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false }),
    () =>
      supabase
        .from('befizetes')
        .select('id, id_szemely, id_csalad, datum, osszeg, fizetettev, nyugta, iratszam, stornozott, befizetescel(nev, szamadasicel(kod))')
        .eq('id_szemely', personId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false }),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, datum, osszeg, fizetettev, nyugtaszam, bizonylatszam, iratszam, befizetescel(nev, szamadasicel(kod))',
        )
        .eq('id_szemely', personId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false }),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, datum, osszeg, fizetettev, nyugtaszam, bizonylatszam, iratszam, befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .eq('id_szemely', personId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false }),
  ])

  return rows.map((row) =>
    normalizePaymentRow({
      ...row,
      befizetescel: Array.isArray(row.befizetescel) ? row.befizetescel[0] || null : row.befizetescel || null,
    }),
  )
}

export async function fetchFamilyPaymentsCompat(
  supabase: SupabaseClient,
  familyId: number,
): Promise<FamilyPaymentDetailsRow[]> {
  const rows = await fetchCompatRows<{
    id: number
    osszeg: number
    datum: string
    fizetettev: number | null
    nyugta?: string | null
    nyugtaszam?: string | null
    bizonylatszam?: string | null
    iratszam?: string | null
    forrasa?: string | null
    szemely?: NameRef | NameRef[]
    befizetescel?: PaymentGoalRef | PaymentGoalRef[]
  }>([
    // 2026-07-17 (F1-1): id_szamadasicel-es variáns először (lásd fetchPersonPaymentsCompat).
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugta, iratszam, stornozott, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .eq('id_csalad', familyId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(30),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugta, iratszam, stornozott, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, szamadasicel(kod))',
        )
        .eq('id_csalad', familyId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(30),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugtaszam, bizonylatszam, iratszam, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, szamadasicel(kod))',
        )
        .eq('id_csalad', familyId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(30),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugtaszam, bizonylatszam, iratszam, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .eq('id_csalad', familyId)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(30),
  ])

  return rows.map(normalizeFamilyPaymentRow)
}

export async function fetchPaymentsByMemberIdsCompat(
  supabase: SupabaseClient,
  memberIds: number[],
): Promise<FamilyPaymentDetailsRow[]> {
  if (memberIds.length === 0) return []

  const rows = await fetchCompatRows<{
    id: number
    osszeg: number
    datum: string
    fizetettev: number | null
    nyugta?: string | null
    nyugtaszam?: string | null
    bizonylatszam?: string | null
    iratszam?: string | null
    forrasa?: string | null
    szemely?: NameRef | NameRef[]
    befizetescel?: PaymentGoalRef | PaymentGoalRef[]
  }>([
    // 2026-07-17 (F1-1): id_szamadasicel-es variáns először (lásd fetchPersonPaymentsCompat).
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugta, iratszam, stornozott, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .in('id_szemely', memberIds)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(60),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugta, iratszam, stornozott, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, szamadasicel(kod))',
        )
        .in('id_szemely', memberIds)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(60),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugtaszam, bizonylatszam, iratszam, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, szamadasicel(kod))',
        )
        .in('id_szemely', memberIds)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(60),
    () =>
      supabase
        .from('befizetes')
        .select(
          'id, id_szemely, id_csalad, osszeg, datum, fizetettev, nyugtaszam, bizonylatszam, iratszam, forrasa, szemely:szemely!id_szemely(csaladnev, k_nev), befizetescel(nev, id_szamadasicel, szamadasicel(id))',
        )
        .in('id_szemely', memberIds)
        .or('deleted.eq.false,deleted.is.null')
        .order('datum', { ascending: false })
        .limit(60),
  ])

  return rows.map(normalizeFamilyPaymentRow)
}
