/**
 * Tétel-rögzítő ONLINE lekérdezések a desktopon (Endre, 2026-06-21).
 *
 * A web `apps/web/app/(dashboard)/penzugy/actions.ts` megfelelő serveraction-jeit
 * replikálja a desktop Supabase-kliensével (`getDesktopSupabase`) + a `congregationId`-vel,
 * hogy a Tétel rögzítő desktopon is tudja: Chitanță auto-számozás, család-keresés/-csatolás,
 * és egyházfenntartói járulék auto-összeg.
 *
 * FONTOS — SZINKRON A WEBBEL: a JÁRULÉK-SZÁMÍTÁS magja (`computeJarulekForMemberYear`) KÖZÖS
 * (@kartoteka/ui-app) → a kiszámolt összeg SOSEM tér el a webtől / a Tartozások-listától. Az itteni
 * lekérdezés-logika a web actionök MÁSOLATA — ha a webes változik, ITT IS frissíteni KELL
 * (különösen a járulék adat-gyűjtés + az AUTO-/tükrözés-szűrés a számozásnál).
 *
 * ONLINE-only: a desktop offline helyi DB-jén ezek az adatok nem érhetők el ugyanúgy, ezért offline
 * üres/null a válasz (a CombinedEntryBody guardjai ezt kezelik: nincs auto-kitöltés, a felhasználó
 * kézzel ír). Banki/offline rögzítés ettől függetlenül működik.
 */

import {
  computeJarulekForMemberYear,
  type DebtCalcMode,
  type JarulekDiscountRule,
  type JarulekExemption,
  type JarulekYearSetting,
} from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { isOnlineWithSession } from './use-session-online'

// ── Web-azonos helperek (a befizetés-cél kódjának kibontása + egyházfenntartás-szűrő) ──
type PaymentGoalCodeRef = { szamadasicel?: { kod: string | null } | { kod: string | null }[] | null } | null
function getPaymentGoalCode(goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[]): string | null {
  const g = Array.isArray(goal) ? goal[0] || null : goal || null
  const ref = g?.szamadasicel
  const c = Array.isArray(ref) ? ref[0] || null : ref || null
  return c?.kod || null
}
function isChurchMaintenanceCode(code?: string | null): boolean {
  return typeof code === 'string' && code.startsWith('101.01')
}

function maxNumOf(values: Array<string | null>): { num: number; width: number } {
  let num = 0
  let width = 0
  for (const v of values) {
    const m = String(v || '').match(/(\d+)/)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n > num) { num = n; width = m[1].length }
  }
  return { num, width }
}
const pad = (n: number, width: number) => (width > 0 ? String(n).padStart(width, '0') : String(n))

// ── Chitanță következő nyugtaszámok (web getNextReceiptNumbers MÁSOLATA, congregation-scope) ──
export async function nextReceiptNumbersOnline(
  congregationId: string,
  year: number,
): Promise<{ keruleti: string; gyulekezeti: string; ujEv?: boolean; tavalyiUtolso?: string; tavalyiEv?: number }> {
  if (!(await isOnlineWithSession())) return { keruleti: '', gyulekezeti: '' }
  const supabase = getDesktopSupabase()

  // KERÜLETI: az összes valódi készpénz-iratszám max+1 (AUTO- és tükrözött kizárva).
  const { data: allData } = await supabase.from('befizetes')
    .select('iratszam, nyugta')
    .eq('congregation_id', congregationId).eq('deleted', false)
    .ilike('irattipus', '%észpénz%').is('belso_mozgas_xkey', null)
  const keruletiVals = ((allData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
    .filter((r) => r.iratszam && !/^AUTO/i.test(r.iratszam) && r.nyugta !== r.iratszam)
    .map((r) => r.iratszam)
  const befMax = maxNumOf(keruletiVals)
  const keruleti = befMax.num > 0 ? pad(befMax.num + 1, befMax.width) : ''

  // GYÜLEKEZETI: ezévi valódi nyugta (nyugta != iratszam) max+1.
  const { data: yearData } = await supabase.from('befizetes')
    .select('iratszam, nyugta')
    .eq('congregation_id', congregationId).eq('deleted', false)
    .ilike('irattipus', '%észpénz%').is('belso_mozgas_xkey', null)
    .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`)
  const thisYear = maxNumOf(
    ((yearData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
      .filter((r) => r.nyugta && r.nyugta !== r.iratszam).map((r) => r.nyugta),
  )
  if (thisYear.num > 0) return { keruleti, gyulekezeti: pad(thisYear.num + 1, thisYear.width) }

  // Új év: van-e korábbi évi? (a hívó kérdez rá)
  const { data: prevData } = await supabase.from('befizetes')
    .select('iratszam, nyugta, datum')
    .eq('congregation_id', congregationId).eq('deleted', false)
    .ilike('irattipus', '%észpénz%').is('belso_mozgas_xkey', null)
    .lt('datum', `${year}-01-01`).order('datum', { ascending: false }).limit(500)
  const prevRows = ((prevData || []) as Array<{ iratszam: string | null; nyugta: string | null; datum: string }>)
    .filter((r) => r.nyugta && r.nyugta !== r.iratszam)
  if (prevRows.length === 0) return { keruleti, gyulekezeti: '1' }
  let maxYear = 0
  for (const r of prevRows) { const y = parseInt(r.datum.slice(0, 4), 10); if (y > maxYear) maxYear = y }
  const prevMax = maxNumOf(prevRows.filter((r) => parseInt(r.datum.slice(0, 4), 10) === maxYear).map((r) => r.nyugta))
  return {
    keruleti,
    gyulekezeti: prevMax.num > 0 ? pad(prevMax.num + 1, prevMax.width) : '1',
    ujEv: true,
    tavalyiUtolso: prevMax.num > 0 ? pad(prevMax.num, prevMax.width) : '0',
    tavalyiEv: maxYear,
  }
}

// ── Személy → család id (web getFamilyIdForPerson MÁSOLATA) ──
async function familyIdForPerson(personId: number): Promise<number | null> {
  const supabase = getDesktopSupabase()
  const { data } = await supabase.from('haztartas_tag')
    .select('haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
    .eq('id_szemely', personId).is('ervenyes_ig', null).limit(5)
  for (const row of (data || []) as Array<{ haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null }>) {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) return h.legacy_csalad_id
  }
  const { data: asParent } = await supabase.from('csalad').select('id').or(`id_ferfi.eq.${personId},id_no.eq.${personId}`).limit(1)
  if (asParent?.[0]) return (asParent[0] as { id: number }).id
  const { data: asChild } = await supabase.from('gyerek').select('id_csalad').eq('id_szemely', personId).limit(1)
  if (asChild?.[0]) return (asChild[0] as { id_csalad: number }).id_csalad
  return null
}

// ── Család keresése (web searchFamilies MÁSOLATA) ──
export async function searchFamiliesOnline(
  congregationId: string,
  query: string,
): Promise<Array<{ id: number; name: string; detail?: string }>> {
  const term = query.trim()
  if (term.length < 2) return []
  if (!(await isOnlineWithSession())) return []
  const supabase = getDesktopSupabase()
  const parts = term.split(/\s+/).filter(Boolean)

  let pq = supabase.from('szemely').select('id').eq('congregation_id', congregationId).eq('isvisible', true)
  if (parts.length === 1) pq = pq.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else pq = pq.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)
  const { data: persons } = await pq.limit(40)
  const personIds = (persons || []).map((p) => (p as { id: number }).id)
  if (!personIds.length) return []
  const idList = personIds.join(',')

  const familyIds = new Set<number>()
  const { data: asHead } = await supabase.from('csalad').select('id').or(`id_ferfi.in.(${idList}),id_no.in.(${idList})`).limit(40)
  for (const r of (asHead || []) as Array<{ id: number }>) familyIds.add(r.id)
  const { data: asChild } = await supabase.from('gyerek').select('id_csalad').in('id_szemely', personIds).limit(80)
  for (const r of (asChild || []) as Array<{ id_csalad: number | null }>) if (r.id_csalad) familyIds.add(r.id_csalad)
  const { data: asTag } = await supabase.from('haztartas_tag').select('haztartas:haztartas!id_haztartas(legacy_csalad_id)').in('id_szemely', personIds).is('ervenyes_ig', null).limit(80)
  for (const r of (asTag || []) as Array<{ haztartas: { legacy_csalad_id: number | null } | { legacy_csalad_id: number | null }[] | null }>) {
    const h = Array.isArray(r.haztartas) ? r.haztartas[0] : r.haztartas
    if (h?.legacy_csalad_id) familyIds.add(h.legacy_csalad_id)
  }
  if (!familyIds.size) return []

  const ids = [...familyIds].slice(0, 12)
  const { data: fams } = await supabase.from('csalad')
    .select('id, c_szam, ferfi:szemely!csalad_id_ferfi_fk(csaladnev, k_nev), no:szemely!csalad_id_no_fk(csaladnev, k_nev), utca:adrstreet!csalad_c_utcaid_fk(name)')
    .in('id', ids)
  const nameOf = (p: { csaladnev?: string | null; k_nev?: string | null } | null | undefined) => (p ? `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() : '')
  return ((fams || []) as Array<Record<string, unknown>>).map((f) => {
    const ferfi = Array.isArray(f.ferfi) ? f.ferfi[0] : f.ferfi
    const no = Array.isArray(f.no) ? f.no[0] : f.no
    const utca = Array.isArray(f.utca) ? f.utca[0] : f.utca
    const heads = [nameOf(ferfi as { csaladnev?: string | null; k_nev?: string | null }), nameOf(no as { csaladnev?: string | null; k_nev?: string | null })].filter(Boolean).join(' & ') || `Család #${f.id}`
    const addr = [(utca as { name?: string } | null)?.name, f.c_szam].filter(Boolean).join(' ')
    return { id: f.id as number, name: heads, detail: addr || undefined }
  })
}

// ── Család tagjai (web getFamilyMembers MÁSOLATA) ──
export async function familyMembersOnline(
  congregationId: string,
  familyId: number,
): Promise<Array<{ id: number; name: string; role?: string }>> {
  if (!(await isOnlineWithSession())) return []
  const supabase = getDesktopSupabase()
  const members = new Map<number, { id: number; name: string; role?: string }>()
  const nameOf = (p: { id: number; csaladnev?: string | null; k_nev?: string | null }) => `${p.csaladnev ?? ''} ${p.k_nev ?? ''}`.trim() || `#${p.id}`

  const { data: fam } = await supabase.from('csalad')
    .select('ferfi:szemely!csalad_id_ferfi_fk(id, csaladnev, k_nev), no:szemely!csalad_id_no_fk(id, csaladnev, k_nev)')
    .eq('id', familyId).maybeSingle()
  const famAny = fam as Record<string, unknown> | null
  if (famAny) {
    const ferfi = Array.isArray(famAny.ferfi) ? famAny.ferfi[0] : famAny.ferfi
    const no = Array.isArray(famAny.no) ? famAny.no[0] : famAny.no
    if ((ferfi as { id?: number })?.id) { const f = ferfi as { id: number; csaladnev?: string | null; k_nev?: string | null }; members.set(f.id, { id: f.id, name: nameOf(f), role: 'családfő' }) }
    if ((no as { id?: number })?.id) { const n = no as { id: number; csaladnev?: string | null; k_nev?: string | null }; members.set(n.id, { id: n.id, name: nameOf(n), role: 'házastárs' }) }
  }

  const { data: kids } = await supabase.from('gyerek').select('szemely:szemely!gyerek_id_szemely_fk(id, csaladnev, k_nev)').eq('id_csalad', familyId)
  for (const k of (kids || []) as Array<Record<string, unknown>>) {
    const s = (Array.isArray(k.szemely) ? k.szemely[0] : k.szemely) as { id?: number; csaladnev?: string | null; k_nev?: string | null }
    if (s?.id && !members.has(s.id)) members.set(s.id, { id: s.id, name: nameOf({ id: s.id, csaladnev: s.csaladnev, k_nev: s.k_nev }), role: 'gyermek' })
  }

  const { data: hh } = await supabase.from('haztartas').select('id').eq('congregation_id', congregationId).eq('legacy_csalad_id', familyId).limit(1)
  const haztartasId = (hh?.[0] as { id: string } | undefined)?.id
  if (haztartasId) {
    const { data: tags } = await supabase.from('haztartas_tag').select('szerep, szemely:szemely!id_szemely(id, csaladnev, k_nev)').eq('id_haztartas', haztartasId).is('ervenyes_ig', null)
    for (const t of (tags || []) as Array<Record<string, unknown>>) {
      const s = (Array.isArray(t.szemely) ? t.szemely[0] : t.szemely) as { id?: number; csaladnev?: string | null; k_nev?: string | null }
      if (s?.id && !members.has(s.id)) members.set(s.id, { id: s.id, name: nameOf({ id: s.id, csaladnev: s.csaladnev, k_nev: s.k_nev }), role: (t.szerep as string) || 'tag' })
    }
  }
  return [...members.values()]
}

// ── Okos „Család csatolása": egy kiválasztott személy családtagjai ──
export async function familyMembersForPersonOnline(
  congregationId: string,
  personId: number,
): Promise<Array<{ id: number; name: string; role?: string }>> {
  if (!(await isOnlineWithSession())) return []
  const familyId = await familyIdForPerson(personId)
  if (familyId == null) return []
  return familyMembersOnline(congregationId, familyId)
}

// ── Egyházfenntartói járulék auto-összeg (web getExpectedJarulek MÁSOLATA, közös motorral) ──
// debtCalcMode 'akkori': currentYear===year mellett a mód irreleváns (a web is currentYear:year-t ad).
export async function expectedJarulekOnline(
  congregationId: string,
  personId: number,
  year: number,
  prospectiveDateIso?: string, // (B/J6) a befizetés dátuma a korai-fizetés kedvezmény prospektív alkalmazásához
): Promise<{ expected: number; paid: number; debt: number } | null> {
  if (!(await isOnlineWithSession())) return null
  const supabase = getDesktopSupabase()

  const [memberRes, bealitasRes, discRes, exRes, famRes] = await Promise.all([
    supabase.from('szemely').select('id, sz_datum, foglalkozas').eq('id', personId).eq('congregation_id', congregationId).maybeSingle(),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(year)).maybeSingle(),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    supabase.from('haztartas_tag').select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)').eq('congregation_id', congregationId).eq('id_szemely', personId).is('ervenyes_ig', null),
  ])

  const member = memberRes.data as { id: number; sz_datum: string | null; foglalkozas: string | null } | null
  if (!member) return null

  let familyId: number | null = null
  for (const row of (famRes.data || []) as Array<{ haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null }>) {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) { familyId = h.legacy_csalad_id; break }
  }

  let payQ = supabase.from('befizetes')
    .select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(szamadasicel(kod))')
    .eq('congregation_id', congregationId).eq('fizetettev', year).or('deleted.eq.false,deleted.is.null')
  payQ = familyId != null ? payQ.or(`id_szemely.eq.${personId},id_csalad.eq.${familyId}`) : payQ.eq('id_szemely', personId)
  const { data: payData } = await payQ
  const maintenancePayments = ((payData || []) as Array<{ id_szemely: number | null; id_csalad: number | null; datum: string | null; fizetettev: number | null; osszeg: number; befizetescel?: PaymentGoalCodeRef | PaymentGoalCodeRef[] }>)
    .filter((p) => isChurchMaintenanceCode(getPaymentGoalCode(p.befizetescel)))

  const yearSettings: Record<number, JarulekYearSetting> = {}
  const b = bealitasRes.data as { id: string; eves_jarulek: number | null; jarulek_kedvezmenyes?: number | null; jarulek_hatarid?: string | null } | null
  if (b) {
    yearSettings[Number(b.id)] = {
      year: Number(b.id),
      eves_jarulek: Number(b.eves_jarulek) || 0,
      jarulek_kedvezmenyes: b.jarulek_kedvezmenyes == null ? null : Number(b.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: b.jarulek_hatarid || null,
    }
  }
  const discounts = ((discRes.data || []) as JarulekDiscountRule[]).map((row) => ({
    ...row,
    ev: Number(row.ev),
    aktiv: row.aktiv !== false,
    kedv_osszeg: row.kedv_osszeg == null ? null : Number(row.kedv_osszeg) || 0,
    kor_tol: row.kor_tol == null ? null : Number(row.kor_tol) || 0,
    szazalek: row.szazalek == null ? null : Number(row.szazalek) || 0,
    fix_osszeg: row.fix_osszeg == null ? null : Number(row.fix_osszeg) || 0,
  }))
  const exemptions = (exRes.data || []) as JarulekExemption[]
  const debtCalcMode: DebtCalcMode = 'akkori' // currentYear:year mellett irreleváns (web-azonos)
  const prospectiveDate = prospectiveDateIso ? new Date(prospectiveDateIso) : null

  const result = computeJarulekForMemberYear({
    member: { id: member.id, sz_datum: member.sz_datum, familyId, foglalkozas: member.foglalkozas },
    year,
    currentYear: year,
    debtCalcMode,
    yearSettings,
    discounts,
    exemptions,
    payments: maintenancePayments,
    prospectiveDate: prospectiveDate && !Number.isNaN(prospectiveDate.getTime()) ? prospectiveDate : null,
  })
  return { expected: result.expected, paid: result.paid, debt: result.debt }
}
