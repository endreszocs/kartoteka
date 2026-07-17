'use server'

/**
 * Évenkénti (visszamenőleges) egyházfenntartási díjak — CRUD.
 *
 * 2026-07-17 (F1-3 P0 — penzugy-finomhangolas-terv): a panel korábban KIZÁRÓLAG a
 * `congregation_annual_fees` táblába írt, amit a tartozás-számítás SOHA nem
 * olvasott (a motor a `bealitas` év-sorokból építi a díjakat) — a visszamenőleg
 * rögzített díjak így nulla hatással voltak a Tartozásokra. Mostantól a mentés
 * ELSŐDLEGESEN a `bealitas` sort írja (létrehozza, ha nincs), a
 * `congregation_annual_fees` pedig best-effort tükör marad (a dashboard-banner
 * és a régi megjelenítők miatt).
 *
 * A korábbi `calculateMemberDebt` + `checkDiscountQualifies` HALOTT KÓD volt
 * (sehonnan nem hívta semmi, és a kanonikus motortól — jarulek-calculation.ts —
 * eltérő eredményt adott volna): törölve. A kanonikus számítás egyetlen helye a
 * `computeJarulekForMemberYear` (packages/ui-app/src/finance/jarulek-calculation.ts).
 */

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'

import { createYearlySettings } from './actions'

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

  // Szerver-oldali validáció — a panel csak korábbi éveket enged, de a server
  // action publikus végpont: az aktuális/jövő év itt nem módosítható (arra a
  // Beállítások „Teljes éves díj" mezője való, kedvezmény-átvitellel).
  const currentYear = new Date().getFullYear()
  if (!Number.isInteger(year) || year < 1900 || year >= currentYear) {
    return { error: 'Itt csak korábbi év díja rögzíthető — az aktuális évi díjat a Beállítások „Teljes éves díj" mezőjében szerkeszd.' }
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: 'Érvénytelen összeg.' }
  }

  // 1) A MOTOR forrása: bealitas év-sor. Meglévő sornál célzott update
  //    (véglegesített évhez nem nyúlunk); hiányzó sornál teljes létrehozás a
  //    createYearlySettings útján (az kezeli a NOT NULL mezőket + legacy retry-t).
  //    Visszamenőleges évhez kedvezmény nem jár (a panel ígérete szerint) →
  //    jarulek_kedvezmenyes: 0.
  const yearId = String(year)
  const { data: existing, error: existingError } = await supabase
    .from('bealitas')
    .select('id, budget_finalized, accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', yearId)
    .maybeSingle()
  // A select-hiba NEM egyenlő a „nincs sor"-ral: elnyelve a lenti létrehozó ág egy
  // LÉTEZŐ (akár véglegesített) sort írhatna felül. Hibánál megszakítunk.
  if (existingError) {
    console.error('[saveAnnualFee] A bealitas év-sor ellenőrzése hibázott:', existingError)
    return { error: `A(z) ${year}. évi beállítás-sor ellenőrzése nem sikerült: ${existingError.message}` }
  }

  if (existing) {
    if (existing.budget_finalized || existing.accounting_finalized) {
      return { error: `A(z) ${year}. év véglegesítve van — a díj módosításához előbb kérj feloldást az évhez.` }
    }
    const { error: bealitasError } = await supabase
      .from('bealitas')
      .update({ eves_jarulek: amount })
      .eq('congregation_id', congregationId)
      .eq('id', yearId)
    if (bealitasError) return { error: `A(z) ${year}. évi díj mentése nem sikerült: ${bealitasError.message}` }
  } else {
    const created = await createYearlySettings(year, amount, '07-01', {
      revalidate: false,
      jarulekKedvezmenyes: 0,
    })
    if (created && 'error' in created && created.error) {
      return { error: `A(z) ${year}. évi beállítás-sor létrehozása nem sikerült: ${created.error}` }
    }
  }

  // 2) Legacy tükör (best-effort): a congregation_annual_fees-t a dashboard-banner
  //    és a régi megjelenítők még olvassák. Ha ez elbukik (pl. hiányzó UNIQUE
  //    constraint egy régi DB-n), a díj akkor is érvényes — a motor a bealitas-ból számol.
  const { error: legacyError } = await supabase.from('congregation_annual_fees').upsert(
    {
      congregation_id: congregationId,
      year,
      eves_jarulek: amount,
    },
    { onConflict: 'congregation_id,year' },
  )
  if (legacyError) {
    console.warn('[saveAnnualFee] A congregation_annual_fees tükör-írás nem sikerült (a díj a bealitas-ban érvényes):', legacyError.message)
  }

  revalidatePath('/penzugy')
  revalidatePath('/dashboard')
  return { success: `${year}. évi díj mentve.` }
}

export async function deleteAnnualFee(congregationId: string, year: number) {
  const permission = await requireActiveCongregation(congregationId)
  if ('error' in permission) return { error: permission.error }
  const { supabase } = permission.access

  const currentYear = new Date().getFullYear()
  if (!Number.isInteger(year) || year < 1900 || year >= currentYear) {
    return { error: 'Itt csak korábbi év díja törölhető.' }
  }

  // A bealitas év-sort nem törölhetjük (véglegesítés-zászlókat és egyéb
  // beállításokat hordoz) — a díj 0-ra állítása jelenti azt, hogy „nincs díj
  // erre az évre" (a Tartozás-lista 0 elvárást számol; a panel az ilyen sort
  // „nincs rögzítve"-ként mutatja).
  const yearId = String(year)
  const { data: existing, error: existingError } = await supabase
    .from('bealitas')
    .select('id, budget_finalized, accounting_finalized')
    .eq('congregation_id', congregationId)
    .eq('id', yearId)
    .maybeSingle()
  if (existingError) {
    console.error('[deleteAnnualFee] A bealitas év-sor ellenőrzése hibázott:', existingError)
    return { error: `A(z) ${year}. évi beállítás-sor ellenőrzése nem sikerült: ${existingError.message}` }
  }
  if (existing) {
    if (existing.budget_finalized || existing.accounting_finalized) {
      return { error: `A(z) ${year}. év véglegesítve van — a díj nem törölhető.` }
    }
    const { error: bealitasError } = await supabase
      .from('bealitas')
      .update({ eves_jarulek: 0 })
      .eq('congregation_id', congregationId)
      .eq('id', yearId)
    if (bealitasError) return { error: `A(z) ${year}. évi díj törlése nem sikerült: ${bealitasError.message}` }
  }

  const { error } = await supabase
    .from('congregation_annual_fees')
    .delete()
    .eq('congregation_id', congregationId)
    .eq('year', year)
  if (error) {
    console.warn('[deleteAnnualFee] A congregation_annual_fees tükör-törlés nem sikerült:', error.message)
  }

  revalidatePath('/penzugy')
  revalidatePath('/dashboard')
  return { success: `${year}. évi díj törölve.` }
}
