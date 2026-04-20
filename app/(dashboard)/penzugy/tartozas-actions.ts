'use server'

/**
 * Tartozás-horizont logika — egy tag tartozásának kiszámítása
 *
 * A logika részletesen a `docs/project-tracking/KARTOTEKA-eves-egyhazfenntartas-tabla-terv.md`
 * 9. szakaszában (user jóváhagyva 2026-04-21).
 *
 * ALAPELVEK:
 *   1. **18 éves kortól** számol a rendszer. Fiatalabbra nincs tartozás.
 *   2. **Utolsó fizetés + 1**-től indul a horizont. Ha sosem fizetett, a 18.
 *      születésnapjától (az első kötelező év).
 *   3. **Kedvezmény-ellenőrzés**: aki időszaki kedvezmény határidejéig a
 *      kedvezményes összeget befizette, VAGY a kor-alapú kedvezmény kor-
 *      küszöbét elérte + a kedvezményes díjat kifizette → teljesen kifizetett.
 *   4. **Gyülekezet-specifikus díjak** (congregation_custom_fees) hozzáadódnak
 *      az adott év díjához, a tag életkora szerinti szűréssel.
 *   5. **Nincs év-limit** — bármennyi évet visszamenőleg számolhat.
 */

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

/** Belső helper — ellenőrzi az aktív gyülekezetet (duplikátum a congregation/actions-ből) */
async function requireActiveCongregation(id: string) {
  const access = await getEffectiveAccessContext()
  if (!access.user || !access.profile) return { error: 'Nincs bejelentkezett felhasználó.' as const }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' as const }
  if (access.effectiveCongregationId !== id) {
    return { error: 'A megadott gyülekezet nem érhető el az aktuális munkamenetből.' as const }
  }
  return { access }
}

export interface DebtYear {
  year: number
  baseAmount: number          // egyházfenntartási díj erre az évre
  customFeesSum: number       // gyülekezet-specifikus díjak összege
  paidAmount: number          // eddigi befizetés erre az évre
  ageInThatYear: number       // tag életkora az adott évben
  discountApplied: boolean    // a kedvezmény feltétele alapján kifizetettnek számít
  owedAmount: number          // még fizetendő
}

export interface MemberDebt {
  memberId: number
  memberName: string
  birthYear: number | null
  ageNow: number | null
  horizonStart: number | null
  horizonReason: 'last-payment' | 'eighteenth-birthday' | 'under-18' | 'no-birth-date'
  years: DebtYear[]
  totalOwed: number
}

/**
 * Egy tag tartozásának részletes számítása.
 */
export async function calculateMemberDebt(
  congregationId: string,
  memberId: number,
): Promise<{ data: MemberDebt | null; error?: string }> {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { data: null, error: permission.error }

  const { supabase } = permission.access

  // ─── Tag adatai ───
  const { data: member, error: mErr } = await supabase
    .from('szemely')
    .select('id, csaladnev, k_nev, namepattern, sz_datum, ferfi, meghalt')
    .eq('id', memberId)
    .maybeSingle()
  if (mErr || !member) return { data: null, error: 'Tag nem található.' }
  if (member.meghalt) return { data: null, error: 'A tag elhunyt.' }

  const memberName =
    member.namepattern || `${member.csaladnev || ''} ${member.k_nev || ''}`.trim() || '(névtelen)'
  const birthDate = member.sz_datum ? new Date(member.sz_datum) : null
  const birthYear = birthDate && !isNaN(birthDate.getTime()) ? birthDate.getFullYear() : null

  const currentYear = new Date().getFullYear()
  const ageNow = birthYear ? currentYear - birthYear : null

  // ─── Korai kilépési pontok ───
  if (birthYear === null) {
    return {
      data: {
        memberId,
        memberName,
        birthYear: null,
        ageNow: null,
        horizonStart: null,
        horizonReason: 'no-birth-date',
        years: [],
        totalOwed: 0,
      },
    }
  }

  if (ageNow! < 18) {
    return {
      data: {
        memberId,
        memberName,
        birthYear,
        ageNow,
        horizonStart: null,
        horizonReason: 'under-18',
        years: [],
        totalOwed: 0,
      },
    }
  }

  // ─── Párhuzamos lekérdezések ───
  const [paymentsResult, annualFeesResult, customFeesResult, discountsResult] = await Promise.all([
    supabase
      .from('befizetes')
      .select('fizetettev, osszeg, datum')
      .eq('congregation_id', congregationId)
      .eq('id_szemely', memberId)
      .eq('deleted', false)
      .eq('stornozott', false),
    supabase
      .from('congregation_annual_fees')
      .select('year, eves_jarulek')
      .eq('congregation_id', congregationId),
    supabase
      .from('congregation_custom_fees')
      .select('amount, year_from, year_to, kor_tol, kor_ig, aktiv')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true),
    supabase
      .from('jarulek_kedvezmeny')
      .select('ev, tipus, sorrend, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, aktiv')
      .eq('congregation_id', congregationId)
      .eq('aktiv', true),
  ])

  const payments = (paymentsResult.data || []) as Array<{
    fizetettev: number
    osszeg: number
    datum: string
  }>
  const annualFees = (annualFeesResult.data || []) as Array<{
    year: number
    eves_jarulek: number
  }>
  const customFees = (customFeesResult.data || []) as Array<{
    amount: number
    year_from: number
    year_to: number | null
    kor_tol: number | null
    kor_ig: number | null
    aktiv: boolean
  }>
  const discounts = (discountsResult.data || []) as Array<{
    ev: number
    tipus: 'idoszak' | 'kor' | 'jovedelem'
    sorrend: number
    hatarid: string | null
    kedv_osszeg: number | null
    kor_tol: number | null
    szazalek: number | null
    fix_osszeg: number | null
    aktiv: boolean
  }>

  // ─── Horizont-kezdet meghatározása ───
  let horizonStart: number
  let horizonReason: MemberDebt['horizonReason']
  if (payments.length > 0) {
    horizonStart = Math.max(...payments.map((p) => p.fizetettev)) + 1
    horizonReason = 'last-payment'
  } else {
    horizonStart = birthYear + 18
    horizonReason = 'eighteenth-birthday'
  }

  // ─── Évek végigjárása ───
  const years: DebtYear[] = []
  for (let y = horizonStart; y <= currentYear; y++) {
    const fee = annualFees.find((f) => f.year === y)
    if (!fee) continue // nincs díj erre az évre → nincs tartozás

    const ageInThatYear = y - birthYear

    // Gyülekezet-specifikus díjak erre az évre + életkorra
    const customFeesSum = customFees
      .filter((cf) => cf.year_from <= y && (cf.year_to === null || cf.year_to >= y))
      .filter((cf) => cf.kor_tol === null || ageInThatYear >= cf.kor_tol)
      .filter((cf) => cf.kor_ig === null || ageInThatYear <= cf.kor_ig)
      .reduce((s, cf) => s + Number(cf.amount), 0)

    // Adott évi befizetések összege
    const paidAmount = payments
      .filter((p) => p.fizetettev === y)
      .reduce((s, p) => s + Number(p.osszeg), 0)

    // Kedvezmény-ellenőrzés
    const discountApplied = checkDiscountQualifies({
      year: y,
      ageInThatYear,
      paidAmount,
      paymentsForYear: payments.filter((p) => p.fizetettev === y),
      discounts: discounts.filter((d) => d.ev === y),
      baseAmount: Number(fee.eves_jarulek),
    })

    if (discountApplied) {
      // A kedvezmény teljesítve → egyházfenntartás kifizetettnek számít
      // De a custom_fees még lehet, hogy tartozik
      const customOwed = Math.max(0, customFeesSum - Math.max(0, paidAmount - Number(fee.eves_jarulek)))
      if (customOwed > 0) {
        years.push({
          year: y,
          baseAmount: Number(fee.eves_jarulek),
          customFeesSum,
          paidAmount,
          ageInThatYear,
          discountApplied: true,
          owedAmount: customOwed,
        })
      }
      continue
    }

    const totalDue = Number(fee.eves_jarulek) + customFeesSum
    const owed = Math.max(0, totalDue - paidAmount)
    if (owed > 0) {
      years.push({
        year: y,
        baseAmount: Number(fee.eves_jarulek),
        customFeesSum,
        paidAmount,
        ageInThatYear,
        discountApplied: false,
        owedAmount: owed,
      })
    }
  }

  return {
    data: {
      memberId,
      memberName,
      birthYear,
      ageNow,
      horizonStart,
      horizonReason,
      years,
      totalOwed: years.reduce((s, y) => s + y.owedAmount, 0),
    },
  }
}

// ──────────────────────────────────────────────────────────────
// Kedvezmény-ellenőrzés (belső helper)
// ──────────────────────────────────────────────────────────────

interface DiscountCheckContext {
  year: number
  ageInThatYear: number
  paidAmount: number
  paymentsForYear: Array<{ fizetettev: number; osszeg: number; datum: string }>
  discounts: Array<{
    ev: number
    tipus: 'idoszak' | 'kor' | 'jovedelem'
    sorrend: number
    hatarid: string | null
    kedv_osszeg: number | null
    kor_tol: number | null
    szazalek: number | null
    fix_osszeg: number | null
    aktiv: boolean
  }>
  baseAmount: number
}

function checkDiscountQualifies(ctx: DiscountCheckContext): boolean {
  // ─── Időszaki kedvezmény ───
  // Ha a határidőig elért kifizetés >= kedvezményes összeg → megfelelt
  const timeDiscounts = ctx.discounts
    .filter((d) => d.tipus === 'idoszak')
    .sort((a, b) => a.sorrend - b.sorrend)
  for (const d of timeDiscounts) {
    if (!d.hatarid || d.kedv_osszeg === null) continue
    const deadline = new Date(`${ctx.year}-${d.hatarid}`)
    if (isNaN(deadline.getTime())) continue
    const paidByDeadline = ctx.paymentsForYear
      .filter((p) => new Date(p.datum) <= deadline)
      .reduce((s, p) => s + Number(p.osszeg), 0)
    if (paidByDeadline >= Number(d.kedv_osszeg)) return true
  }

  // ─── Kor-alapú kedvezmény ───
  const ageDiscounts = ctx.discounts.filter((d) => d.tipus === 'kor')
  for (const d of ageDiscounts) {
    if (d.kor_tol === null || d.szazalek === null) continue
    if (ctx.ageInThatYear >= d.kor_tol) {
      const discountedFee = ctx.baseAmount * (1 - Number(d.szazalek) / 100)
      if (ctx.paidAmount >= discountedFee) return true
    }
  }

  // Szociális kedvezmény: csak manuálisan rögzíthető, nem automatikus
  return false
}

// ──────────────────────────────────────────────────────────────
// Éves díj CRUD (egyszerűsített — csak year + amount)
// ──────────────────────────────────────────────────────────────

export async function saveAnnualFee(
  congregationId: string,
  year: number,
  amount: number,
) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }
  const { supabase } = permission.access

  // Upsert — ha van sor az évre, frissíti; különben beszúrja
  const { error } = await supabase.from('congregation_annual_fees').upsert(
    {
      congregation_id: congregationId,
      year,
      eves_jarulek: amount,
    },
    { onConflict: 'congregation_id,year' },
  )

  if (error) return { error: error.message }
  return { success: `${year}. évi díj mentve.` }
}

export async function deleteAnnualFee(congregationId: string, year: number) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }
  const { supabase } = permission.access

  // Figyelmeztetés: ha van rá befizetés, akkor is töröljük, de a user tudja.
  const { error } = await supabase
    .from('congregation_annual_fees')
    .delete()
    .eq('congregation_id', congregationId)
    .eq('year', year)

  if (error) return { error: error.message }
  return { success: `${year}. évi díj törölve.` }
}
