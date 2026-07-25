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
  allocateFamilyPayments,
  computeBaseExpectedForMemberYear,
  computeJarulekForMemberYear,
  isJarulekExcludedMemberStatus,
  type DebtCalcMode,
  type JarulekDiscountRule,
  type JarulekExemption,
  type JarulekPaymentLike,
  type JarulekYearSetting,
} from '@kartoteka/ui-app'

import { getDesktopSupabase } from './supabase'
import { isOnlineWithSession } from './use-session-online'
import { selectAllPaged } from './sync'

// ── Web-azonos helperek (a befizetés-cél kódjának kibontása + egyházfenntartás-szűrő) ──
// 2026-07-17 (F1-1 P0, web-azonos): a szamadasicel-nek NINCS `kod` oszlopa (az `id`
// maga a kód) — a befizetescel.id_szamadasicel-t olvassuk közvetlenül.
type PaymentGoalCodeRef = {
  id_szamadasicel?: string | null
  szamadasicel?: { id?: string | null; kod?: string | null } | { id?: string | null; kod?: string | null }[] | null
} | null
function getPaymentGoalCode(goal?: PaymentGoalCodeRef | PaymentGoalCodeRef[]): string | null {
  const g = Array.isArray(goal) ? goal[0] || null : goal || null
  const ref = g?.szamadasicel
  const c = Array.isArray(ref) ? ref[0] || null : ref || null
  return g?.id_szamadasicel || c?.id || c?.kod || null
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
  // 2026-06-30 FIX: készpénz = `bankszamla_id IS NULL` (kassza), NEM irattipus — így az
  // importált nyugták (irattipus 'chitanta' stb.) is beleszámítanak. Web-azonos (getNextReceiptNumbers).
  // 2026-07-25 (F6.1): LAPOZOTT — a PostgREST sor-plafonja (1000) némán levágta
  // volna a MAX-számítás bemenetét → ÚJRA KIADOTT nyugtaszám. Web-azonos fix.
  const { data: allData, error: allErr } = await selectAllPaged<{ iratszam: string | null; nyugta: string | null }>(
    supabase.from('befizetes')
      .select('id, iratszam, nyugta')
      .eq('congregation_id', congregationId).eq('deleted', false)
      .is('bankszamla_id', null).is('belso_mozgas_xkey', null),
  )
  // 2026-07-25 (F6.1 review, P1): a lapozó HIBÁJÁT TILOS elnyelni — hibánál a
  // régi kód üres/„1" javaslatot adott, ami DUPLIKÁLT nyugtaszámot okozott volna.
  if (allErr) {
    console.error('[nextReceiptNumbersOnline] kerületi szám lekérdezés hiba:', allErr.message)
    return { keruleti: '', gyulekezeti: '' }
  }
  // A tükrözés-kizárást (nyugta === iratszam) NEM alkalmazzuk a kerületire (kiejtette a régi/import
  // előzményt); csak az AUTO- auto-iratszámot zárjuk ki. (Web-azonos, lásd getNextReceiptNumbers.)
  const keruletiVals = ((allData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
    .filter((r) => r.iratszam && !/^AUTO/i.test(r.iratszam))
    .map((r) => r.iratszam)
  const befMax = maxNumOf(keruletiVals)
  const keruleti = befMax.num > 0 ? pad(befMax.num + 1, befMax.width) : ''

  // GYÜLEKEZETI: ezévi valódi nyugta (nyugta != iratszam) max+1.
  const { data: yearData, error: yearErr } = await selectAllPaged<{ iratszam: string | null; nyugta: string | null }>(
    supabase.from('befizetes')
      .select('id, iratszam, nyugta')
      .eq('congregation_id', congregationId).eq('deleted', false)
      .is('bankszamla_id', null).is('belso_mozgas_xkey', null)
      .gte('datum', `${year}-01-01`).lte('datum', `${year}-12-31`),
  )
  if (yearErr) {
    console.error('[nextReceiptNumbersOnline] ezévi szám lekérdezés hiba:', yearErr.message)
    return { keruleti: '', gyulekezeti: '' }
  }
  const thisYear = maxNumOf(
    ((yearData || []) as Array<{ iratszam: string | null; nyugta: string | null }>)
      .filter((r) => r.nyugta && r.nyugta !== r.iratszam).map((r) => r.nyugta),
  )
  if (thisYear.num > 0) return { keruleti, gyulekezeti: pad(thisYear.num + 1, thisYear.width) }

  // Új év: van-e korábbi évi? (a hívó kérdez rá)
  // 2026-07-25 (F6.1): a .limit(500) KIVEZETVE — évi ~470 tételnél egyetlen
  // korábbi év sem fért bele, így a „tavalyi utolsó" gyülekezeti szám hibás lehetett.
  const { data: prevData, error: prevErr } = await selectAllPaged<{ iratszam: string | null; nyugta: string | null; datum: string }>(
    supabase.from('befizetes')
      .select('id, iratszam, nyugta, datum')
      .eq('congregation_id', congregationId).eq('deleted', false)
      .is('bankszamla_id', null).is('belso_mozgas_xkey', null)
      .lt('datum', `${year}-01-01`),
  )
  if (prevErr) {
    console.error('[nextReceiptNumbersOnline] korábbi évi szám lekérdezés hiba:', prevErr.message)
    return { keruleti, gyulekezeti: '' }
  }
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
): Promise<{ expected: number; paid: number; debt: number; hasBase: boolean } | null> {
  if (!(await isOnlineWithSession())) return null
  const supabase = getDesktopSupabase()

  const [memberRes, bealitasRes, discRes, exRes, famRes, congRes] = await Promise.all([
    supabase.from('szemely').select('id, sz_datum, foglalkozas').eq('id', personId).eq('congregation_id', congregationId).maybeSingle(),
    supabase.from('bealitas').select('id, eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('congregation_id', congregationId).eq('id', String(year)).maybeSingle(),
    supabase.from('jarulek_kedvezmeny').select('id, ev, tipus, aktiv, kezdet, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras').eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year).order('sorrend', { ascending: true }),
    supabase.from('felmentes').select('id_szemely, id_csalad, kezdete, vege').eq('congregation_id', congregationId),
    supabase.from('haztartas_tag').select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)').eq('congregation_id', congregationId).eq('id_szemely', personId).is('ervenyes_ig', null),
    supabase.from('congregations').select('eves_jarulek, jarulek_kedvezmenyes, jarulek_hatarid').eq('id', congregationId).maybeSingle(),
  ])

  const member = memberRes.data as { id: number; sz_datum: string | null; foglalkozas: string | null } | null
  if (!member) return null

  let familyId: number | null = null
  for (const row of (famRes.data || []) as Array<{ haztartas: { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null } | { legacy_csalad_id: number | null; isaktiv: boolean | null; ervenyes_ig: string | null }[] | null }>) {
    const h = Array.isArray(row.haztartas) ? row.haztartas[0] : row.haztartas
    if (h && h.isaktiv === true && h.ervenyes_ig == null && h.legacy_csalad_id) { familyId = h.legacy_csalad_id; break }
  }

  // 2026-07-17 (F1-1 + F1-4, web-azonos): id_szamadasicel a nem létező
  // szamadasicel(kod) helyett + a stornózott befizetés nem számít fizetettnek.
  let payQ = supabase.from('befizetes')
    .select('id_szemely, id_csalad, datum, fizetettev, osszeg, befizetescel(id_szamadasicel)')
    .eq('congregation_id', congregationId).eq('fizetettev', year)
    .or('deleted.eq.false,deleted.is.null')
    .or('stornozott.eq.false,stornozott.is.null')
  payQ = familyId != null ? payQ.or(`id_szemely.eq.${personId},id_csalad.eq.${familyId}`) : payQ.eq('id_szemely', personId)
  const { data: payData, error: payError } = await payQ
  if (payError) {
    console.error('[expectedJarulekOnline] A befizetés-lekérdezés HIBÁRA FUTOTT — az auto-összeg a teljes díjat ajánlaná:', payError)
  }
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
  // Ellenálló a `kezdet` oszlop hiányára (web-azonos): ha a lekérdezés hibázott, újra `kezdet` nélkül.
  let discData: Array<Record<string, unknown>> | null = discRes.data as Array<Record<string, unknown>> | null
  if (discRes.error) {
    const retry = await supabase.from('jarulek_kedvezmeny')
      .select('id, ev, tipus, aktiv, hatarid, kedv_osszeg, kor_tol, szazalek, fix_osszeg, jov_leiras')
      .eq('congregation_id', congregationId).eq('aktiv', true).eq('ev', year)
    if (retry.error) console.warn('[expectedJarulekOnline] jarulek_kedvezmeny retry (kezdet nélkül) is hibázott — a kedvezmények kimaradnak:', retry.error.message)
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
  // #Endre 2026-07-01 (web-azonos): ha az adott ÉVRE nincs bealitas alap, a congregations (welcome) éves járuléka a fallback.
  const cong = congRes.error ? null : (congRes.data as { eves_jarulek?: number | null; jarulek_kedvezmenyes?: number | null; jarulek_hatarid?: string | null } | null)
  if ((yearSettings[year]?.eves_jarulek || 0) <= 0 && (Number(cong?.eves_jarulek) || 0) > 0) {
    yearSettings[year] = {
      year,
      eves_jarulek: Number(cong?.eves_jarulek) || 0,
      jarulek_kedvezmenyes: cong?.jarulek_kedvezmenyes == null ? null : Number(cong?.jarulek_kedvezmenyes) || 0,
      jarulek_hatarid: cong?.jarulek_hatarid || null,
    }
  }
  const hasBase = (yearSettings[year]?.eves_jarulek || 0) > 0
  const exemptions = (exRes.data || []) as JarulekExemption[]
  const debtCalcMode: DebtCalcMode = 'akkori' // currentYear:year mellett irreleváns (web-azonos)
  const prospectiveDate = prospectiveDateIso ? new Date(prospectiveDateIso) : null

  // 2026-07-17 (F5, Q7 — a web getExpectedJarulek tükre): a családhoz kötött
  // befizetések felosztása a család tagjai közt. A roster csak akkor kell, ha van
  // családhoz kötött tétel.
  let paymentsForCalc: JarulekPaymentLike[] = maintenancePayments
  if (familyId != null && maintenancePayments.some((p) => p.id_csalad != null)) {
    const { data: famTagData } = await supabase
      .from('haztartas_tag')
      .select('id_szemely, haztartas:haztartas!id_haztartas(legacy_csalad_id, isaktiv, ervenyes_ig)')
      .eq('congregation_id', congregationId)
      .is('ervenyes_ig', null)
    const famMemberIds = new Set<number>([personId])
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
    paymentsForCalc = allocateFamilyPayments(maintenancePayments, roster, (mem, y) =>
      computeBaseExpectedForMemberYear({
        member: mem,
        year: y,
        currentYear: year,
        debtCalcMode,
        yearSettings,
        discounts,
        exemptions,
      }),
    )
  }

  const result = computeJarulekForMemberYear({
    member: { id: member.id, sz_datum: member.sz_datum, familyId, foglalkozas: member.foglalkozas },
    year,
    currentYear: year,
    debtCalcMode,
    yearSettings,
    discounts,
    exemptions,
    payments: paymentsForCalc,
    prospectiveDate: prospectiveDate && !Number.isNaN(prospectiveDate.getTime()) ? prospectiveDate : null,
  })
  return { expected: result.expected, paid: result.paid, debt: result.debt, hasBase }
}
