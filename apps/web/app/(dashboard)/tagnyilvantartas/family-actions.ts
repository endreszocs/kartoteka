'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { familySchema, type FamilyInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { fetchFamilyPaymentsCompat, fetchPaymentsByMemberIdsCompat } from '@/lib/finance/payment-compat'
import { getVisibleDistrictState, sanitizeDistrictReference } from '@/lib/members/district-visibility'

export interface FamilyRow {
  id: number
  c_szam: string | null
  isaktiv: boolean
  id_csoport: number | null
  ferfi: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null } | null
  no: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; allapot: string | null; meghalt: boolean; namepattern: string | null; vallas: string | null } | null
  utca: { name: string } | null
}

async function getFamilyAccessContext() {
  const { supabase, congregationId, userId } = await getEffectiveCongregationContext()
  return { supabase, congregationId, userId }
}

/**
 * 2026-06-01 (hibrid család-modell Fázis 2): a régi `csalad` rekord aktuális
 * állapotát szinkronizálja az új `haztartas` + `cim` + `haztartas_tag`
 * táblákba. A `saveFamily` és a `checkAndCreateFamily` (anyakönyvi) is hívja,
 * hogy az új modell mindig naprakész legyen.
 *
 * Logika:
 *   1. csalad + gyerek olvasása
 *   2. haztartas keresése (legacy_csalad_id alapján); ha nincs → új cim + haztartas
 *      ha van → update isaktiv + id_csoport
 *   3. haztartas_tag-ok diff: a csalad/gyerek célállapotához igazítjuk —
 *      lezárjuk a már nem szereplő tagokat (ervenyes_ig = today), beszúrjuk az újakat
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncHouseholdFromCsalad(supabase: any, csaladId: number, congregationId: string) {
  // 1. Olvas: csalad + gyerek
  const { data: csaladRow } = await supabase
    .from('csalad')
    .select('id_ferfi, id_no, c_utcaid, c_szam, c_tombhaz, c_lepcsohaz, c_emelet, c_ajto, id_csoport, isaktiv')
    .eq('id', csaladId)
    .single()
  if (!csaladRow) return

  const { data: gyerekRows } = await supabase
    .from('gyerek')
    .select('id_szemely')
    .eq('id_csalad', csaladId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gyerekIds = ((gyerekRows || []) as any[]).map((g) => g.id_szemely as number)

  // 2. Olvas vagy hoz létre: haztartas
  const { data: existingHaztartas } = await supabase
    .from('haztartas')
    .select('id, id_cim')
    .eq('legacy_csalad_id', csaladId)
    .is('ervenyes_ig', null)
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let haztartasId: string | null = (existingHaztartas as any)?.id ?? null

  if (!haztartasId) {
    // Új cim
    const { data: cimRow } = await supabase
      .from('cim')
      .insert([{
        congregation_id: congregationId,
        id_utca: csaladRow.c_utcaid,
        szam: csaladRow.c_szam,
        tombhaz: csaladRow.c_tombhaz,
        lepcsohaz: csaladRow.c_lepcsohaz,
        emelet: csaladRow.c_emelet,
        ajto: csaladRow.c_ajto,
        tipus: 'otthon',
        megjegyzes: 'saveFamily-sync',
      }])
      .select('id')
      .single()

    // Új haztartas (legacy_csalad_id-vel)
    const { data: haztartasRow } = await supabase
      .from('haztartas')
      .insert([{
        congregation_id: congregationId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id_cim: (cimRow as any)?.id ?? null,
        id_csoport: csaladRow.id_csoport,
        isaktiv: csaladRow.isaktiv,
        legacy_csalad_id: csaladId,
        ervenyes_tol: new Date().toISOString().slice(0, 10),
      }])
      .select('id')
      .single()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    haztartasId = (haztartasRow as any)?.id ?? null
  } else {
    await supabase
      .from('haztartas')
      .update({ isaktiv: csaladRow.isaktiv, id_csoport: csaladRow.id_csoport })
      .eq('id', haztartasId)
  }

  if (!haztartasId) return

  // 3. Tagok szinkronizálása (diff a célállapottal)
  const { data: existingTags } = await supabase
    .from('haztartas_tag')
    .select('id, id_szemely, szerep')
    .eq('id_haztartas', haztartasId)
    .is('ervenyes_ig', null)
    .in('szerep', ['csaladfo', 'hazastars', 'gyermek'])

  // Célállapot: 1 csaladfo (id_ferfi), 1 hazastars (id_no), n gyermek
  const desiredTags = new Map<number, string>()
  if (csaladRow.id_ferfi) desiredTags.set(csaladRow.id_ferfi as number, 'csaladfo')
  if (csaladRow.id_no) desiredTags.set(csaladRow.id_no as number, 'hazastars')
  for (const gyerekId of gyerekIds) desiredTags.set(gyerekId, 'gyermek')

  const today = new Date().toISOString().slice(0, 10)

  // 3a. Lezárjuk a már nem szereplő tagokat
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tag of (existingTags || []) as any[]) {
    const desiredSzerep = desiredTags.get(tag.id_szemely as number)
    if (!desiredSzerep) {
      await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: today })
        .eq('id', tag.id)
    } else {
      // Már aktív tag a megfelelő szerepben → kihúzzuk a desired-ből
      // (Ha más szerep van, NEM frissítjük: a backfill 'csaladfo'-t adott meg
      // alapból, így a UI tartja a régi mintát.)
      desiredTags.delete(tag.id_szemely as number)
    }
  }

  // 3b. Új tagokat beszúrjuk
  const newTags = Array.from(desiredTags.entries()).map(([id_szemely, szerep]) => ({
    id_haztartas: haztartasId,
    id_szemely,
    szerep,
    is_primary: szerep === 'csaladfo' || (szerep === 'hazastars' && !csaladRow.id_ferfi),
    ervenyes_tol: today,
    congregation_id: congregationId,
  }))
  if (newTags.length > 0) {
    await supabase.from('haztartas_tag').insert(newTags)
  }
}

/**
 * 2026-06-01 (hibrid család-modell Fázis 2): a `csalad.id`-k halmaza, amelyhez
 * a felhasználónak hozzáférése van. Az új modellből számoljuk: a `haztartas`
 * tábla congregation_id-vel szűrve azonosítja a saját gyülekezetes
 * háztartásokat, a `legacy_csalad_id` a régi `csalad.id`-re mutat vissza.
 *
 * Ez egyszerűbb és gyorsabb, mint a régi 2x JOIN szemely-csalad-gyerek logika.
 */
async function getAllowedFamilyIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  congregationId: string,
): Promise<Set<number>> {
  const { data } = await supabase
    .from('haztartas')
    .select('legacy_csalad_id')
    .eq('congregation_id', congregationId)
    .not('legacy_csalad_id', 'is', null)

  return new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((data || []) as any[])
      .map((row) => row.legacy_csalad_id as number)
      .filter((id): id is number => id != null),
  )
}

export async function getFamilies(): Promise<FamilyRow[]> {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []

  // 2026-06-01 (hibrid család-modell Fázis 2): a Családok lista most az ÚJ
  // modellből (haztartas + haztartas_tag + cim) olvas. A `FamilyRow.id` mező
  // továbbra is a `legacy_csalad_id` (int) marad — így a többi action
  // (saveFamily, getFamilyDetails, deleteFamily) érintetlenül futnak a régi
  // `csalad.id`-vel, amíg a Fázis 2 fokozatosan átáll.
  //
  // 2026-06-02: Diagnózis után kiderült, hogy az új `haztartas → cim` lánc
  // valahol szakad (vagy a backfill subquery nem találta a megfelelő cim-rekordot,
  // vagy a cim-rekordok üres `id_utca`/`szam` mezőkkel jöttek létre).
  // Megoldás: az új haztartas-ból olvassuk a struktúrát (legacy_csalad_id alapján),
  // DE a CÍMET a régi `csalad.c_utcaid + c_szam` mezőkből szedjük FALLBACK-kel.
  // Az új `cim` táblát PRIORITÁSSAL próbáljuk; ha üres, visszanyúlunk a régire.
  const { data: haztartasok } = await supabase
    .from('haztartas')
    .select('id, isaktiv, id_csoport, legacy_csalad_id, id_cim')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)

  if (!haztartasok?.length) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasIds = haztartasok.map((h: any) => h.id as string)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cimIds = haztartasok.map((h: any) => h.id_cim as string | null).filter((v): v is string => !!v)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyCsaladIds = haztartasok.map((h: any) => h.legacy_csalad_id as number | null).filter((v): v is number => v != null)

  // ─── ÚJ MODELL: cim + adrstreet az haztartas.id_cim-en keresztül ────────
  const { data: cimekRaw } = cimIds.length > 0
    ? await supabase
        .from('cim')
        .select('id, szam, id_utca')
        .in('id', cimIds)
    : { data: [] }

  // ─── RÉGI MODELL FALLBACK: csalad.c_utcaid + c_szam ─────────────────────
  const { data: csaladokRaw } = legacyCsaladIds.length > 0
    ? await supabase
        .from('csalad')
        .select('id, c_utcaid, c_szam')
        .in('id', legacyCsaladIds)
    : { data: [] }

  // Mindkét forrás utca-ID-it egyesítjük az adrstreet lekérdezéshez
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaIdsUj = ((cimekRaw || []) as any[]).map((c) => c.id_utca as number | null).filter((v): v is number => v != null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaIdsRegi = ((csaladokRaw || []) as any[]).map((c) => c.c_utcaid as number | null).filter((v): v is number => v != null)
  const utcaIdsUnique = Array.from(new Set([...utcaIdsUj, ...utcaIdsRegi]))

  const { data: utcakRaw } = utcaIdsUnique.length > 0
    ? await supabase
        .from('adrstreet')
        .select('id, name')
        .in('id', utcaIdsUnique)
    : { data: [] }

  // Mappingok
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utcaNameById = new Map<number, string>(((utcakRaw || []) as any[]).map((u) => [u.id, u.name]))

  // cim_id (uuid) → { szam, utca_name } — új modell
  const cimById = new Map<string, { szam: string | null; utca_name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (cimekRaw || []) as any[]) {
    cimById.set(c.id, {
      szam: c.szam ?? null,
      utca_name: c.id_utca != null ? utcaNameById.get(c.id_utca) ?? null : null,
    })
  }

  // csalad_id (int) → { szam, utca_name } — régi modell (FALLBACK forrás)
  const csaladCimById = new Map<number, { szam: string | null; utca_name: string | null }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (csaladokRaw || []) as any[]) {
    csaladCimById.set(c.id, {
      szam: c.c_szam ?? null,
      utca_name: c.c_utcaid != null ? utcaNameById.get(c.c_utcaid) ?? null : null,
    })
  }

  // Aktív családfők + házastársak ezekhez a háztartásokhoz
  const { data: tagok } = await supabase
    .from('haztartas_tag')
    .select(`
      id_haztartas, szerep, is_primary,
      szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, allapot, meghalt, namepattern, vallas)
    `)
    .in('id_haztartas', haztartasIds)
    .is('ervenyes_ig', null)
    .in('szerep', ['csaladfo', 'hazastars'])

  // Map: haztartas_id → { ferfi, no }
  type SzemelyRef = FamilyRow['ferfi']
  const tagokByHaztartas = new Map<string, { ferfi: SzemelyRef; no: SzemelyRef }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const tag of (tagok || []) as any[]) {
    const szuloRaw = tag.szemely
    const szulo = (Array.isArray(szuloRaw) ? szuloRaw[0] : szuloRaw) as SzemelyRef
    if (!szulo) continue
    const entry = tagokByHaztartas.get(tag.id_haztartas) ?? { ferfi: null, no: null }
    if (szulo.ferfi === true && !entry.ferfi) entry.ferfi = szulo
    else if (szulo.ferfi === false && !entry.no) entry.no = szulo
    tagokByHaztartas.set(tag.id_haztartas, entry)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return haztartasok.map((h: any) => {
    const ujCim = h.id_cim ? cimById.get(h.id_cim) ?? null : null
    const regiCim = h.legacy_csalad_id != null ? csaladCimById.get(h.legacy_csalad_id) ?? null : null

    // PRIORITÁS: új cim, ha van utca-név. Ha NEM, fallback a régi csalad-ra.
    // (Külön ellenőrzés a szam-ra és az utca-névre, mert előfordulhat hogy
    // az új cim-en csak az egyik mező van kitöltve.)
    const utca_name = ujCim?.utca_name ?? regiCim?.utca_name ?? null
    const szam = ujCim?.szam ?? regiCim?.szam ?? null

    const entry = tagokByHaztartas.get(h.id as string) ?? { ferfi: null, no: null }
    return {
      id: h.legacy_csalad_id as number,
      c_szam: szam,
      isaktiv: h.isaktiv as boolean,
      id_csoport: h.id_csoport as number | null,
      ferfi: entry.ferfi,
      no: entry.no,
      utca: utca_name ? { name: utca_name } : null,
    } satisfies FamilyRow
  })
}

export async function getFamilyDetails(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return null

  // 2026-06-01 (hibrid család-modell Fázis 2): a `family` alapadat továbbra
  // is a régi `csalad`-ról jön (visszafelé kompatibilitás — a UI a family.id_ferfi
  // / family.id_no / family.c_utcaid mezőket használja a saveFamily-hez és
  // hasonlókhoz). A gyerekeket viszont az ÚJ modellből (haztartas_tag) szedjük,
  // mert a `haztartas_tag.ervenyes_ig` szűréssel automatikusan kihagyjuk a
  // költözött / elhalálozott / lezárt tagokat.
  const [familyRes, haztartasRes, districtState] = await Promise.all([
    supabase.from('csalad').select('*, ferfi:szemely!id_ferfi(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot), no:szemely!id_no(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, telefon, foglalkozas, vallas, namepattern, allapot), utca:adrstreet!c_utcaid(name), csoport:csoport!id_csoport(nev)').eq('id', id).single(),
    // A `legacy_csalad_id = id` alapján megtaláljuk az új háztartást.
    supabase.from('haztartas').select('id').eq('legacy_csalad_id', id).is('ervenyes_ig', null).limit(1).maybeSingle(),
    getVisibleDistrictState(supabase, congregationId),
  ])

  const family = familyRes.data
    ? sanitizeDistrictReference(
        familyRes.data as typeof familyRes.data & { id_csoport: number | null; csoport?: { nev: string } | null },
        districtState.visibleIds,
      )
    : null

  // A háztartás-tagok közül a gyerekeket szedjük ki — aktív (ervenyes_ig IS NULL)
  // + szerep IN ('gyermek', 'unoka'). Ez automatikusan kihagyja a már nem-tagokat.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const haztartasId = (haztartasRes.data as any)?.id as string | undefined
  let children: { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; meghalt: boolean; vallas: string | null; foglalkozas?: string | null; namepattern?: string | null; allapot?: string | null }[] = []
  if (haztartasId) {
    const { data: tagok } = await supabase
      .from('haztartas_tag')
      .select('szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, vallas, foglalkozas, namepattern, allapot)')
      .eq('id_haztartas', haztartasId)
      .is('ervenyes_ig', null)
      .in('szerep', ['gyermek', 'unoka'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children = (tagok || []).map((t: any) => Array.isArray(t.szemely) ? t.szemely[0] : t.szemely).filter(Boolean)
  } else {
    // Fallback: ha a háztartás nincs az új modellben (még nem backfill-elt vagy
    // valami baj van), a régi `gyerek` táblát olvassuk.
    const { data: gyerekek } = await supabase
      .from('gyerek')
      .select('id_szemely, szemely:szemely!id_szemely(id, csaladnev, k_nev, ferfi, sz_datum, meghalt, vallas, foglalkozas, namepattern, allapot)')
      .eq('id_csalad', id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    children = (gyerekek || []).map((c: any) => c.szemely).filter(Boolean)
  }

  // 2. Tagok ID-k összegyűjtése az anyakönyvi lekérdezésekhez
  const memberIds = [family?.id_ferfi, family?.id_no, ...children.map(c => c.id)].filter(Boolean) as number[]

  // 3. Anyakönyvi adatok + családlátogatások
  const [directFamilyPayments, memberLinkedPayments, keresztRes, konfirmRes, hazassagRes, temetesRes] = await Promise.all([
    fetchFamilyPaymentsCompat(supabase, id),
    fetchPaymentsByMemberIdsCompat(supabase, memberIds),
    memberIds.length > 0 ? supabase.from('keresztseg').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    memberIds.length > 0 ? supabase.from('konfirmalas').select('id_szemely, datum, adrlocality!helyid(name), lelkeszneve').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
    family?.id_ferfi && family?.id_no
      ? supabase.from('hazassag').select('datum, adrlocality!helyid(name), lelkeszneve').eq('id_ferfi', family.id_ferfi).eq('id_no', family.id_no).maybeSingle()
      : Promise.resolve({ data: null }),
    memberIds.length > 0 ? supabase.from('temetes').select('id_szemely, hdatum').in('id_szemely', memberIds) : Promise.resolve({ data: [] }),
  ])

  const paymentsById = new Map<number, (typeof directFamilyPayments)[number]>()
  ;[...directFamilyPayments, ...memberLinkedPayments].forEach((payment) => {
    if (!paymentsById.has(payment.id)) {
      paymentsById.set(payment.id, payment)
    }
  })
  const payments = [...paymentsById.values()].sort((left, right) =>
    String(right.datum || '').localeCompare(String(left.datum || '')),
  )

  return {
    family,
    children,
    payments: payments,
    keresztelesek: (keresztRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    konfirmaciok: (konfirmRes.data || []) as unknown as { id_szemely: number; datum: string; adrlocality?: { name: string } | null; lelkeszneve?: string }[],
    hazassag: hazassagRes.data as unknown as { datum?: string; adrlocality?: { name: string } | null; lelkeszneve?: string } | null,
    temetesek: (temetesRes.data || []) as unknown as { id_szemely: number; hdatum: string }[],
  }
}

export async function saveFamily(data: FamilyInput) {
  const parsed = familySchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const d = parsed.data
  const selectedMemberIds = [d.id_ferfi, d.id_no, ...d.gyerekIds].filter(Boolean) as number[]
  if (selectedMemberIds.length > 0) {
    const { data: scopedMembers } = await supabase
      .from('szemely')
      .select('id')
      .eq('congregation_id', congregationId)
      .in('id', selectedMemberIds)

    if ((scopedMembers || []).length !== selectedMemberIds.length) {
      return { error: 'A család csak az aktuális gyülekezet tagjaiból állhat.' }
    }
  }

  const familyData: Record<string, unknown> = {
    id_ferfi: d.id_ferfi,
    id_no: d.id_no,
    c_utcaid: d.c_utcaid || null,
    c_szam: d.c_szam || null,
    id_csoport: d.id_csoport || null,
    isaktiv: true,
  }

  let familyId = d.id

  if (d.id) {
    const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
    if (!allowedFamilyIds.has(d.id)) {
      return { error: 'Nincs jogosultsága ennek a családnak a szerkesztéséhez.' }
    }
    const { error } = await supabase.from('csalad').update(familyData).eq('id', d.id)
    if (error) return { error: `Hiba: ${error.message}` }
    // Gyerekek frissítés: régi törlés + új insert
    await supabase.from('gyerek').delete().eq('id_csalad', d.id)
  } else {
    const { data: ins, error } = await supabase.from('csalad').insert([familyData]).select('id')
    if (error) return { error: `Hiba: ${error.message}` }
    if (!ins?.[0]) return { error: 'Nem kaptunk vissza azonosítót.' }
    familyId = ins[0].id
  }

  // Gyerekek hozzárendelés
  if (familyId && d.gyerekIds.length > 0) {
    const gyerekRows = d.gyerekIds.map(szemId => ({ id_csalad: familyId!, id_szemely: szemId }))
    await supabase.from('gyerek').insert(gyerekRows)
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): az új modellt is naprakésszé
  // tesszük (haztartas + cim + haztartas_tag). Ha a saveFamily új csalad-ot
  // hozott létre vagy a meglévőt változtatta, a háztartás-szinkron lefut.
  if (familyId) {
    try {
      await syncHouseholdFromCsalad(supabase, familyId, congregationId)
    } catch (e) {
      console.warn('[saveFamily] syncHouseholdFromCsalad sikertelen (nem blokkoló):',
        e instanceof Error ? e.message : e)
    }
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Szabad személy keresés (házasok kiszűrve) ────────────────

export async function searchFamilyMember(query: string, role: 'ferfi' | 'no' | 'gyerek', editFamilyId?: number) {
  if (query.trim().length < 2) return []
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const parts = query.trim().split(/\s+/)

  let q = supabase.from('szemely')
    .select('id, csaladnev, k_nev, ferfi, sz_datum, c_szam, c_utcaid, c_helysegid, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
    .eq('congregation_id', congregationId).eq('isvisible', true).eq('meghalt', false)

  if (role === 'ferfi') q = q.eq('ferfi', true)
  else if (role === 'no') q = q.eq('ferfi', false)

  if (parts.length === 1) q = q.or(`csaladnev.ilike.%${parts[0]}%,k_nev.ilike.%${parts[0]}%`)
  else q = q.ilike('csaladnev', `%${parts[0]}%`).ilike('k_nev', `%${parts.slice(1).join(' ')}%`)

  const { data: members } = await q.limit(10)
  if (!members?.length) return []

  // Házasok kiszűrése
  const { data: allFamilies } = await supabase.from('csalad').select('id_ferfi, id_no')
  const marriedIds = new Set<number>()
  ;(allFamilies || []).forEach((f: { id_ferfi: number | null; id_no: number | null }) => {
    // Szerkesztéskor a jelenlegi család tagjait ne szűrjük ki
    if (role === 'ferfi' && f.id_ferfi) marriedIds.add(f.id_ferfi)
    if (role === 'no' && f.id_no) marriedIds.add(f.id_no)
  })

  return members.filter(m => !marriedIds.has(m.id) || (editFamilyId !== undefined))
}

/**
 * 2026-06-02: Veszélyes művelet — a teljes családi struktúrát törli a
 * gyülekezetben, hogy a rendszergazda újra importálhassa Excel-ből (vagy
 * újra-építhesse a felületen) az új modell szerint.
 *
 * MIT törölünk:
 *   - haztartas_tag (M:N kapcsolótábla)
 *   - szemely_kapcsolat (rokoni viszonyok)
 *   - haztartas (háztartások)
 *   - cim (címek)
 *   - csalad + gyerek (régi modell)
 *
 * MIT NEM törölünk:
 *   - szemely (személyek — az anyakönyvek + befizetések rájuk hivatkoznak!)
 *   - keresztseg, hazassag, temetes (anyakönyvi rekordok érintetlen)
 *   - befizetes, csaladlatogatas (érintetlenek)
 *
 * Védelmek:
 *   - csak admin / egyházkerületi admin használhatja
 *   - megerősítés-szöveg kötelező ('TÖRLÉS')
 *   - csak a saját gyülekezet adatai
 */
export async function wipeFamilyStructure(confirmation: string) {
  if (confirmation !== 'TÖRLÉS') {
    return { error: 'Hibás megerősítés. A „TÖRLÉS" szót kell pontosan beírni.' }
  }
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet.' }
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Csak admin / egyházkerületi admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (profile as any)?.role
  if (role !== 'admin' && role !== 'egyhazkeruleti_admin') {
    return { error: 'Csak rendszergazda használhatja ezt a funkciót.' }
  }

  // 1. Saját gyülekezet szemely-id-i (a régi csalad+gyerek szűréshez)
  const { data: szemely } = await supabase
    .from('szemely').select('id')
    .eq('congregation_id', congregationId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const szemIds = ((szemely || []) as any[]).map((s) => s.id as number)

  // 2. Új modell törlés (congregation_id-vel direkt)
  let stats = { haztartas_tag: 0, szemely_kapcsolat: 0, haztartas: 0, cim: 0, csalad: 0, gyerek: 0 }

  const t1 = await supabase.from('haztartas_tag').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.haztartas_tag = t1.count ?? 0
  const t2 = await supabase.from('szemely_kapcsolat').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.szemely_kapcsolat = t2.count ?? 0

  // cim: csak a saját gyülekezet háztartásaihoz tartozó címeket töröljük
  const { data: hRows } = await supabase
    .from('haztartas').select('id_cim').eq('congregation_id', congregationId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cimIds = ((hRows || []) as any[]).map((h) => h.id_cim).filter((v): v is string => !!v)

  const t3 = await supabase.from('haztartas').delete({ count: 'exact' }).eq('congregation_id', congregationId)
  stats.haztartas = t3.count ?? 0

  if (cimIds.length > 0) {
    const t4 = await supabase.from('cim').delete({ count: 'exact' }).in('id', cimIds)
    stats.cim = t4.count ?? 0
  }

  // 3. Régi csalad + gyerek (a csalad táblán nincs congregation_id, a szemely-en keresztül szűrünk)
  if (szemIds.length > 0) {
    const t5 = await supabase.from('gyerek').delete({ count: 'exact' }).in('id_szemely', szemIds)
    stats.gyerek = t5.count ?? 0
    const t6 = await supabase.from('csalad').delete({ count: 'exact' })
      .or(`id_ferfi.in.(${szemIds.join(',')}),id_no.in.(${szemIds.join(',')})`)
    stats.csalad = t6.count ?? 0
  }

  revalidatePath('/tagnyilvantartas')
  return {
    success: true,
    message: 'Családi struktúra törölve. A személyek, anyakönyvek, befizetések érintetlenek maradtak.',
    stats,
  }
}

export async function deleteFamily(id: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return { error: 'Nincs aktív gyülekezet kiválasztva.' }
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(id)) return { error: 'Nincs jogosultsága ennek a családnak a törléséhez.' }
  await supabase.from('gyerek').delete().eq('id_csalad', id)
  const { error } = await supabase.from('csalad').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }

  // 2026-06-01 (hibrid család-modell Fázis 2): a hozzátartozó haztartas-t
  // NEM töröljük (mert anyakönyvi rekordok, családlátogatási naplók
  // hivatkozhatnak rá), hanem ARCHIVÁLJUK — isaktiv=false, ervenyes_ig=today,
  // és minden aktív tagság is lezárul.
  try {
    const today = new Date().toISOString().slice(0, 10)
    const { data: haztartas } = await supabase
      .from('haztartas')
      .select('id')
      .eq('legacy_csalad_id', id)
      .is('ervenyes_ig', null)
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const haztartasId = (haztartas as any)?.id as string | undefined
    if (haztartasId) {
      await supabase
        .from('haztartas')
        .update({ isaktiv: false, ervenyes_ig: today })
        .eq('id', haztartasId)
      await supabase
        .from('haztartas_tag')
        .update({ ervenyes_ig: today })
        .eq('id_haztartas', haztartasId)
        .is('ervenyes_ig', null)
    }
  } catch (e) {
    console.warn('[deleteFamily] haztartas archiválás sikertelen (nem blokkoló):',
      e instanceof Error ? e.message : e)
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Családlátogatás ─────────────────────────────────────────

export async function getFamilyVisits(familyId: number) {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return []
  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(familyId)) return []
  const { data } = await supabase.from('csaladlatogatas')
    .select('*')
    .eq('id_csalad', familyId)
    .eq('congregation_id', congregationId)
    .order('datum', { ascending: false })
  return (data || []) as { id: string; datum: string; lelkesz: string; alapige: string | null; megjegyzes: string | null }[]
}

export async function saveFamilyVisit(data: { familyId: number; datum: string; lelkesz: string; alapige?: string; megjegyzes?: string; toMunkanaplo?: boolean }) {
  const { supabase, congregationId, userId } = await getFamilyAccessContext()
  const user = userId ? { id: userId } : null
  if (!user || !congregationId) return { error: 'Nincs bejelentkezve.' }
  if (!data.datum || !data.lelkesz) return { error: 'A dátum és a lelkész neve kötelező.' }

  const allowedFamilyIds = await getAllowedFamilyIds(supabase, congregationId)
  if (!allowedFamilyIds.has(data.familyId)) return { error: 'Nincs jogosultsága ehhez a családhoz.' }

  // Családlátogatás mentés
  const { error } = await supabase.from('csaladlatogatas').insert({
    id_csalad: data.familyId,
    datum: data.datum,
    lelkesz: data.lelkesz,
    alapige: data.alapige || null,
    megjegyzes: data.megjegyzes || null,
    congregation_id: congregationId,
  })
  if (error) return { error: error.message }

  // Munkanapló szinkron
  if (data.toMunkanaplo) {
    try {
      await supabase.from('munkanaplo').insert({
        idopont: data.datum,
        jellege: 'Családlátogatás',
        alapige: data.alapige || null,
        szolgalt: data.lelkesz,
        megjegyzes: data.megjegyzes || null,
        kategoria: 'latogatas',
        congregation_id: congregationId,
      })
    } catch { /* munkanapló hiba nem blokkolja a mentést */ }
  }

  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Egyetlen tag minimális EnrichedMember-ként ───────────────────────────
// 2026-06-02: A családi kartonon a felhasználó a személyekre kattintva
// nyithatja meg a `MemberDetailsDialogV2`-t. Ez az action visszaadja az
// alapadatokat — a payment-status és átjelentkezés-info nem fontos itt,
// mert a dialog belül `getMemberDetails(id)`-vel úgyis lekéri a részletes
// adatokat (anyakönyv, befizetések, hátralék).
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getEnrichedMemberById(id: number, familyId: number | null): Promise<any> {
  const { supabase, congregationId } = await getFamilyAccessContext()
  if (!congregationId) return null
  const { data, error } = await supabase
    .from('szemely')
    .select('*, adrstreet!c_utcaid(name), adrlocality!c_helysegid(name)')
    .eq('id', id)
    .eq('congregation_id', congregationId)
    .maybeSingle()
  if (error || !data) return null

  return {
    ...data,
    paymentStatus: 'rendezve',
    familyId,
    pendingTransfer: null,
    hasEverPaid: false,
  }
}
