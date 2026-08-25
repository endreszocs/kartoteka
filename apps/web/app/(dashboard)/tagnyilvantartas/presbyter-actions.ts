'use server'

import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { districtSchema, presbyterSchema, type DistrictInput, type PresbyterInput } from '@/lib/validations/members'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { getVisibleDistrictState, type DistrictRow } from '@/lib/members/district-visibility'

export type { DistrictRow } from '@/lib/members/district-visibility'

// ── Körzetek ─────────────────────────────────────────────────

export interface PresbiterRow {
  id: number
  tisztseg: string | null
  // 2026-08-26 (5. kör): kódolt fokozat/funkció + mandátum + publikálás.
  fokozat: string | null
  funkcio: string | null
  kezdete: string | null
  vege: string | null
  publikus: boolean | null
  megjegyzes: string | null
  egyseg_id: string | null
  id_csoport: number | null
  szemely: {
    id: number; csaladnev: string; k_nev: string; ferfi: boolean
    sz_datum: string | null; telefon: string | null
    nev_publikalas_consent: boolean | null
  } | null
  csoport: { id: number; nev: string } | null
}

async function getScopedContext() {
  const { supabase, congregationId } = await getEffectiveCongregationContext()
  return { supabase, congregationId }
}

async function memberBelongsToCongregation(
  szemelyId: number,
  congregationId: string | null,
) {
  if (!congregationId) return false

  const supabase = await createClient()
  const { data } = await supabase
    .from('szemely')
    .select('id')
    .eq('id', szemelyId)
    .eq('congregation_id', congregationId)
    .maybeSingle()

  return !!data
}

export async function getDistricts(): Promise<DistrictRow[]> {
  const { supabase, congregationId } = await getScopedContext()
  const { districts } = await getVisibleDistrictState(supabase, congregationId)
  return districts
}

export async function getDistrictsWithCounts() {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return []
  const { districts } = await getVisibleDistrictState(supabase, congregationId)
  // 2026-06-01 (hibrid család-modell Fázis 2): az új haztartas-ot olvassuk —
  // a congregation_id direkt szűrhető, és a legacy_csalad_id visszafelé
  // kompat a régi csalad.id-vel.
  const { data: csaladData } = await supabase
    .from('haztartas')
    .select('legacy_csalad_id, id_csoport')
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)
    .not('id_csoport', 'is', null)
  const korzetek = districts
  const csaladok = ((csaladData || []) as Array<{ legacy_csalad_id: number; id_csoport: number }>)
    .map((r) => ({ id: r.legacy_csalad_id, id_csoport: r.id_csoport }))

  // 2026-07-24 (PR-10): a körzethez KÖZVETLENÜL rendelt (család nélküli)
  // személyek száma — ellenálló az oszlop hiányára (PR-10 migráció előtt).
  const singleCountByCsoport = new Map<number, number>()
  {
    const { data: soloData, error: soloError } = await supabase
      .from('szemely')
      .select('id_csoport')
      .eq('congregation_id', congregationId)
      .eq('isvisible', true)
      .eq('meghalt', false)
      .not('id_csoport', 'is', null)
    if (soloError) {
      console.warn('[districts] szemely.id_csoport nem olvasható (PR-10 migráció?):', soloError.message)
    } else {
      for (const r of (soloData || []) as Array<{ id_csoport: number }>) {
        singleCountByCsoport.set(r.id_csoport, (singleCountByCsoport.get(r.id_csoport) || 0) + 1)
      }
    }
  }

  return korzetek.map(k => ({
    ...k,
    familyCount: csaladok.filter(c => c.id_csoport === k.id).length,
    singleCount: singleCountByCsoport.get(k.id) || 0,
  }))
}

export async function saveDistrict(data: DistrictInput) {
  const parsed = districtSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  // 2026-06-10 (Fázis 1): a csoport mostantól congregation_id-scoped — insertnél
  // kötelező, update-nél a legacy NULL-os sorokat fokozatosan begyógyítja.
  const payload = { nev: parsed.data.nev, isaktiv: parsed.data.isaktiv, iskorzet: true, congregation_id: congregationId }

  if (parsed.data.id) {
    const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
    if (!visibleIds.has(parsed.data.id)) {
      return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
    }
    if (usage.foreignIds.has(parsed.data.id)) {
      return { error: 'Ez a korzet mas gyulekezet adataihoz is kapcsolodik, ezert itt nem szerkesztheto biztonsagosan.' }
    }

    const { error } = await supabase.from('csoport').update(payload).eq('id', parsed.data.id)
    if (error) return { error: `Hiba: ${error.message}` }
  } else {
    const { error } = await supabase.from('csoport').insert(payload)
    if (error) return { error: `Hiba: ${error.message}` }
  }
  await logAuditEvent({
    action: 'district.save',
    targetTable: 'csoport',
    targetId: parsed.data.id ? String(parsed.data.id) : null,
    metadata: { mode: parsed.data.id ? 'update' : 'create' },
  }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

export async function deleteDistrict(id: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(id)) {
    return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
  }
  if (usage.foreignIds.has(id)) {
    return { error: 'Ez a korzet mas gyulekezet adataihoz is kapcsolodik, ezert nem torolheto biztonsagosan.' }
  }

  const { data: presbyterRows } = await supabase
    .from('presbiter')
    .select('id, szemely:szemely!inner(congregation_id)')
    .eq('id_csoport', id)
    .eq('szemely.congregation_id', congregationId)

  const presbyterIds = ((presbyterRows || []) as { id: number }[]).map(row => row.id)
  if (presbyterIds.length > 0) {
    await supabase.from('presbiter').delete().in('id', presbyterIds)
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): dual-write — a régi csalad és
  // az új haztartas táblákon is nullázzuk az id_csoport mezőt.
  await supabase.from('csalad').update({ id_csoport: null }).eq('id_csoport', id)
  await supabase.from('haztartas').update({ id_csoport: null }).eq('id_csoport', id).eq('congregation_id', congregationId)

  const [remainingFamilies, remainingPresbyters] = await Promise.all([
    supabase.from('haztartas').select('id', { count: 'exact', head: true })
      .eq('id_csoport', id).eq('congregation_id', congregationId).is('ervenyes_ig', null),
    supabase.from('presbiter').select('id', { count: 'exact', head: true }).eq('id_csoport', id),
  ])

  if ((remainingFamilies.count || 0) > 0 || (remainingPresbyters.count || 0) > 0) {
    return { error: 'A korzethez meg mas adatok kapcsolodnak, ezert a globalis rekord nem torolheto biztonsagosan.' }
  }

  const { error } = await supabase.from('csoport').delete().eq('id', id)
  if (error) return { error: `Hiba: ${error.message}` }
  await logAuditEvent({ action: 'district.delete', targetTable: 'csoport', targetId: String(id) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

// ── Család–körzet hozzárendelés ──────────────────────────────

export async function assignFamilyToDistrict(familyId: number, districtId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const { visibleIds, usage } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(districtId)) {
    return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
  }
  if (usage.foreignIds.has(districtId)) {
    return { error: 'Ez a korzet mas gyulekezethez kapcsolodik, ezert ide nem rendelheto csalad.' }
  }

  // 2026-06-01 (hibrid család-modell Fázis 2): dual-write — régi csalad +
  // új haztartas (legacy_csalad_id alapján).
  const { error } = await supabase.from('csalad').update({ id_csoport: districtId }).eq('id', familyId)
  if (error) return { error: `Hiba: ${error.message}` }
  await supabase.from('haztartas').update({ id_csoport: districtId })
    .eq('legacy_csalad_id', familyId).eq('congregation_id', congregationId).is('ervenyes_ig', null)
  await logAuditEvent({ action: 'district.assign_family', targetTable: 'csalad', targetId: String(familyId), metadata: { districtId } }, supabase)
  return { success: true }
}

export async function removeFamilyFromDistrict(familyId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  const { error } = await supabase.from('csalad').update({ id_csoport: null }).eq('id', familyId)
  if (error) return { error: `Hiba: ${error.message}` }
  await supabase.from('haztartas').update({ id_csoport: null })
    .eq('legacy_csalad_id', familyId).eq('congregation_id', congregationId).is('ervenyes_ig', null)
  await logAuditEvent({ action: 'district.remove_family', targetTable: 'csalad', targetId: String(familyId) }, supabase)
  return { success: true }
}

export async function getDistrictFamilies(districtId: number) {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return { families: [], assignedIds: [] }

  const { visibleIds } = await getVisibleDistrictState(supabase, congregationId)
  if (!visibleIds.has(districtId)) return { families: [], assignedIds: [] }

  // 2026-06-01 (hibrid család-modell Fázis 2): az új haztartas + haztartas_tag
  // szerinti aktív családok. Backward-kompat: a `families[*].id` továbbra is
  // a régi `csalad.id` (legacy_csalad_id), hogy a UI változatlanul működjön.
  const { data: haztartasok } = await supabase
    .from('haztartas')
    .select(`
      legacy_csalad_id, id_csoport,
      cim:cim!id_cim(szam, utca:adrstreet!id_utca(name)),
      tagok:haztartas_tag(szerep, szemely:szemely!id_szemely(csaladnev, k_nev, ferfi))
    `)
    .eq('congregation_id', congregationId)
    .is('ervenyes_ig', null)
    .not('legacy_csalad_id', 'is', null)

  type FamilyOut = {
    id: number
    c_szam: string | null
    id_csoport: number | null
    ferfi: { csaladnev: string; k_nev: string } | null
    no: { csaladnev: string; k_nev: string } | null
    utca: { name: string } | null
  }
  const families: FamilyOut[] = []
  const assignedIds: number[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (haztartasok || []) as any[]) {
    const legacyId = h.legacy_csalad_id as number
    let ferfi: FamilyOut['ferfi'] = null
    let no: FamilyOut['no'] = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (h.tagok || []) as any[]) {
      if (t.szerep !== 'csaladfo' && t.szerep !== 'hazastars') continue
      const szRaw = t.szemely
      const sz = Array.isArray(szRaw) ? szRaw[0] : szRaw
      if (!sz) continue
      if (sz.ferfi === true && !ferfi) ferfi = { csaladnev: sz.csaladnev, k_nev: sz.k_nev }
      else if (sz.ferfi === false && !no) no = { csaladnev: sz.csaladnev, k_nev: sz.k_nev }
    }
    const cimRaw = h.cim
    const cim = Array.isArray(cimRaw) ? cimRaw[0] : cimRaw
    const utcaRaw = cim?.utca
    const utca = Array.isArray(utcaRaw) ? utcaRaw[0] : utcaRaw
    families.push({
      id: legacyId,
      c_szam: cim?.szam ?? null,
      id_csoport: h.id_csoport ?? null,
      ferfi,
      no,
      utca: utca ?? null,
    })
    if (h.id_csoport === districtId) assignedIds.push(legacyId)
  }
  return { families, assignedIds }
}

// ── Presbiterek ──────────────────────────────────────────────
//
// 2026-08-26 (5. kör): a régi DELETE+INSERT minta MEGSZŰNT — az minden
// történet-bővítést blokkolt (egy személy nem lehetett „2020–2023 pót,
// 2023-tól teljes"). A mentés id-alapú; a mandátum lezárása a `vege`
// kitöltése (a sor megmarad); a hard delete csak a téves rögzítésé.

/** A presbiteri fokozat/funkció kijelzési címkéje (a tisztseg mezőbe is ez kerül). */
function presbiterCimke(fokozat: string, funkcio?: string | null): string {
  if (funkcio === 'fogondnok') return 'Főgondnok'
  if (funkcio === 'gondnok') return 'Gondnok'
  if (fokozat === 'pot') return 'Pótpresbiter'
  if (fokozat === 'tiszteletbeli') return 'Tiszteletbeli presbiter'
  return 'Presbiter'
}

/** A gyülekezet presbiteri ciklusa (év) — a vége-javaslathoz és a varázslóhoz. */
export async function getPresbiteriCiklusEv(): Promise<number> {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return 3
  const { data } = await supabase
    .from('congregations')
    .select('presbiteri_ciklus_ev')
    .eq('id', congregationId)
    .maybeSingle()
  const ev = Number((data as { presbiteri_ciklus_ev?: number } | null)?.presbiteri_ciklus_ev)
  return Number.isFinite(ev) && ev >= 1 && ev <= 12 ? ev : 3
}

export async function getPresbyters(): Promise<PresbiterRow[]> {
  const { supabase, congregationId } = await getScopedContext()
  if (!congregationId) return []
  // !inner: a más gyülekezetű személyhez tartozó sor NE „Ismeretlen" néven
  // duzzassza a listát (és a kvórumot) — fail-closed beágyazott szűrés.
  const { data, error } = await supabase.from('presbiter')
    .select('id, tisztseg, fokozat, funkcio, kezdete, vege, publikus, megjegyzes, egyseg_id, id_csoport, szemely:szemely!id_szemely!inner(id, csaladnev, k_nev, ferfi, sz_datum, telefon, nev_publikalas_consent), csoport:csoport!id_csoport(id, nev)')
    .eq('szemely.congregation_id', congregationId)
  if (error && /fokozat|funkcio|publikus|nev_publikalas_consent|egyseg_id/.test(error.message || '')) {
    // Migráció előtti kecses visszaesés: a régi oszlopkészlettel olvasunk,
    // az új mezők nullal töltődnek (a felület „nincs megadva" állapotot mutat).
    const { data: regi } = await supabase.from('presbiter')
      .select('id, tisztseg, id_csoport, szemely:szemely!id_szemely!inner(id, csaladnev, k_nev, ferfi, sz_datum, telefon), csoport:csoport!id_csoport(id, nev)')
      .eq('szemely.congregation_id', congregationId)
    return ((regi || []) as unknown as Array<Omit<PresbiterRow, 'fokozat' | 'funkcio' | 'kezdete' | 'vege' | 'publikus' | 'megjegyzes' | 'egyseg_id' | 'szemely'> & { szemely: Omit<NonNullable<PresbiterRow['szemely']>, 'nev_publikalas_consent'> | null }>).map(r => ({
      ...r,
      fokozat: null, funkcio: null, kezdete: null, vege: null,
      publikus: null, megjegyzes: null, egyseg_id: null,
      szemely: r.szemely ? { ...r.szemely, nev_publikalas_consent: null } : null,
    }))
  }
  return (data || []) as unknown as PresbiterRow[]
}

export async function savePresbyter(data: PresbyterInput) {
  const parsed = presbyterSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { supabase: scopedSupabase, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const d = parsed.data
  const memberExists = await memberBelongsToCongregation(d.id_szemely, congregationId)
  if (!memberExists) return { error: 'A kivalasztott szemely nem az aktiv gyulekezethez tartozik.' }

  if (d.kezdete && d.vege && d.vege < d.kezdete) {
    return { error: 'A mandátum vége nem előzheti meg a kezdetét.' }
  }
  // Egyházjogi őr (a DB-CHECK párja, beszédes üzenettel): gondnok/főgondnok
  // csak teljes értékű presbiter lehet.
  if (d.funkcio && d.fokozat !== 'teljes') {
    return { error: 'Gondnok vagy főgondnok csak TELJES értékű presbiter lehet (a pótpresbiter nem választható e tisztségekre).' }
  }

  if (d.id_csoport) {
    const { data: sajatSorok } = await scopedSupabase
      .from('presbiter')
      .select('id_csoport')
      .eq('id_szemely', d.id_szemely)
    const sajatKorzetek = new Set(
      ((sajatSorok || []) as { id_csoport: number | null }[])
        .map(row => row.id_csoport)
        .filter((value): value is number => value !== null),
    )
    const { visibleIds, usage } = await getVisibleDistrictState(scopedSupabase, congregationId)
    if (!visibleIds.has(d.id_csoport)) {
      return { error: 'A kivalasztott korzet nem erheto el az aktiv gyulekezetben.' }
    }
    if (usage.foreignIds.has(d.id_csoport) && !sajatKorzetek.has(d.id_csoport)) {
      return { error: 'Ez a korzet mas gyulekezethez kapcsolodik, ezert nem rendelheto presbiterhez.' }
    }
  }

  const supabase = await createClient()

  // Két aktív főgondnok nem lehet — mentés-őr névvel (a DB-ben az „aktív"
  // számított állapotra nem tehető egyediségi index).
  if (d.funkcio === 'fogondnok') {
    const ma = new Date().toISOString().slice(0, 10)
    const { data: masikFogondnok } = await supabase
      .from('presbiter')
      .select('id, kezdete, vege, szemely:szemely!id_szemely!inner(csaladnev, k_nev, congregation_id)')
      .eq('funkcio', 'fogondnok')
      .eq('szemely.congregation_id', congregationId)
    const utkozo = ((masikFogondnok || []) as unknown as Array<{
      id: number; kezdete: string | null; vege: string | null
      szemely: { csaladnev: string; k_nev: string } | null
    }>).find(r =>
      r.id !== (d.id || -1) &&
      (!r.kezdete || r.kezdete <= ma) &&
      (!r.vege || r.vege >= ma),
    )
    if (utkozo) {
      const nev = `${utkozo.szemely?.csaladnev || ''} ${utkozo.szemely?.k_nev || ''}`.trim()
      return { error: `Már van aktív főgondnok: ${nev || 'ismeretlen'} — előbb zárd le az ő mandátumát (vagy módosítsd gondnokra).` }
    }
  }

  const record = {
    id_szemely: d.id_szemely,
    congregation_id: congregationId,
    tisztseg: presbiterCimke(d.fokozat, d.funkcio),
    fokozat: d.fokozat,
    funkcio: d.funkcio || null,
    kezdete: d.kezdete || null,
    vege: d.vege || null,
    id_csoport: d.id_csoport || null,
    egyseg_id: d.egyseg_id || null,
    publikus: d.publikus,
    megjegyzes: d.megjegyzes?.trim() || null,
  }

  let error: { message: string } | null = null
  if (d.id) {
    const res = await supabase.from('presbiter').update(record)
      .eq('id', d.id).eq('congregation_id', congregationId)
    error = res.error
  } else {
    const res = await supabase.from('presbiter').insert(record)
    error = res.error
  }
  if (error) {
    if (/fokozat|funkcio|publikus|kezdete|vege|egyseg_id/.test(error.message || '')) {
      return { error: 'A mentés nem sikerült — az adatbázisból még hiányoznak az új presbiteri mezők. Futtasd le a 2026-08-26-presbiterium-tisztsegek.sql migrációt, majd próbáld újra.' }
    }
    return { error: `Hiba: ${error.message}` }
  }

  // Figyelmeztetés (nem blokkoló): publikus jelölés név-publikálási
  // hozzájárulás nélkül — a weboldal-RPC kapuja miatt a név NEM jelenik meg,
  // amíg a hozzájárulás nincs rögzítve a személyi kartonon.
  let warning: string | undefined
  if (d.publikus) {
    const { data: szemely } = await supabase
      .from('szemely')
      .select('nev_publikalas_consent')
      .eq('id', d.id_szemely)
      .maybeSingle()
    if ((szemely as { nev_publikalas_consent?: boolean | null } | null)?.nev_publikalas_consent !== true) {
      warning = 'A tisztség publikusra jelölve, de a személynek NINCS rögzített név-publikálási hozzájárulása — a weboldalon addig nem jelenik meg, amíg a személyi kartonon be nem pipálod a hozzájárulást.'
    }
  }

  await logAuditEvent({ action: 'presbyter.save', targetTable: 'presbiter', targetId: String(d.id_szemely) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true, warning }
}

/** Mandátum lezárása — a sor MEGMARAD (történet), csak a vége töltődik ki. */
export async function lezarPresbiterMandatum(rowId: number, vege: string) {
  const { congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vege)) return { error: 'Érvénytelen dátum.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('presbiter')
    .update({ vege })
    .eq('id', rowId)
    .eq('congregation_id', congregationId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: 'A presbiteri sor nem található az aktív gyülekezetben.' }
  await logAuditEvent({ action: 'presbyter.mandatum_lezaras', targetTable: 'presbiter', targetId: String(rowId), metadata: { vege } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

/** Téves rögzítés törlése — EGY sor (nem a személy összes bejegyzése). */
export async function deletePresbyterRow(rowId: number) {
  const { congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }

  const supabase = await createClient()
  const { data, error } = await supabase.from('presbiter')
    .delete()
    .eq('id', rowId)
    .eq('congregation_id', congregationId)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  if (!data || data.length === 0) return { error: 'A presbiteri sor nem található az aktív gyülekezetben.' }
  await logAuditEvent({ action: 'presbyter.delete', targetTable: 'presbiter', targetId: String(rowId) }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true }
}

/**
 * Egyszeri mandátum-feltöltés: az utolsó presbiterválasztás dátumával minden
 * olyan sor kap kezdete+vége értéket, amelyiknek még nincs — enélkül a
 * lejárat-kijelzés (a kör fő célja) üresen indulna. Soronként utólag
 * felülírható.
 */
export async function backfillPresbiterMandatumok(valasztasDatum: string) {
  const { supabase: scoped, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valasztasDatum)) return { error: 'Érvénytelen dátum.' }

  const { data: cong } = await scoped
    .from('congregations')
    .select('presbiteri_ciklus_ev')
    .eq('id', congregationId)
    .maybeSingle()
  const ciklus = Number((cong as { presbiteri_ciklus_ev?: number } | null)?.presbiteri_ciklus_ev || 3)
  const [y, m, dd] = valasztasDatum.split('-').map(Number)
  const vege = new Date(Date.UTC(y + ciklus, m - 1, dd - 1)).toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase.from('presbiter')
    .update({ kezdete: valasztasDatum, vege })
    .eq('congregation_id', congregationId)
    .is('kezdete', null)
    .is('vege', null)
    .select('id')
  if (error) return { error: `Hiba: ${error.message}` }
  await logAuditEvent({
    action: 'presbyter.mandatum_backfill',
    targetTable: 'presbiter',
    metadata: { valasztasDatum, vege, erintett: data?.length ?? 0 },
  }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true, erintett: data?.length ?? 0, vege }
}

/**
 * „Új presbiteri ciklus" varázsló: a választás napjával minden aktív sor
 * lezárul (vege = választás előtti nap), és az új névsor új sorokként jön
 * létre (kezdete = választás napja, vége = +ciklus). 25 fős presbitériumnál
 * e nélkül ~50 kézi művelet lenne 3 évente.
 */
export async function ujPresbiteriCiklus(input: {
  valasztasDatum: string
  tagok: Array<{
    id_szemely: number
    fokozat: 'teljes' | 'pot' | 'tiszteletbeli'
    funkcio?: 'fogondnok' | 'gondnok' | null
    id_csoport?: number | null
  }>
}) {
  const { supabase: scoped, congregationId } = await getScopedContext()
  if (!congregationId) return { error: 'Nincs aktiv gyulekezet kivalasztva.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.valasztasDatum)) return { error: 'Érvénytelen választás-dátum.' }
  if (!input.tagok || input.tagok.length === 0) return { error: 'Legalább egy presbitert ki kell jelölni az új ciklusra.' }

  const fogondnokok = input.tagok.filter(t => t.funkcio === 'fogondnok')
  if (fogondnokok.length > 1) return { error: 'Egyszerre csak egy főgondnok jelölhető.' }
  const rosszFunkcio = input.tagok.find(t => t.funkcio && t.fokozat !== 'teljes')
  if (rosszFunkcio) return { error: 'Gondnok/főgondnok csak teljes értékű presbiter lehet.' }

  const { data: cong } = await scoped
    .from('congregations')
    .select('presbiteri_ciklus_ev')
    .eq('id', congregationId)
    .maybeSingle()
  const ciklus = Number((cong as { presbiteri_ciklus_ev?: number } | null)?.presbiteri_ciklus_ev || 3)
  const [y, m, dd] = input.valasztasDatum.split('-').map(Number)
  const ujVege = new Date(Date.UTC(y + ciklus, m - 1, dd - 1)).toISOString().slice(0, 10)
  const elozoNap = new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10)

  const supabase = await createClient()

  // 1) Minden még nyitott/aktív sor lezárása a választás előtti nappal.
  const { error: lezarasHiba } = await supabase.from('presbiter')
    .update({ vege: elozoNap })
    .eq('congregation_id', congregationId)
    .or(`vege.is.null,vege.gte.${input.valasztasDatum}`)
  if (lezarasHiba) return { error: `A régi ciklus lezárása nem sikerült: ${lezarasHiba.message}` }

  // 2) Az új névsor beszúrása.
  const records = input.tagok.map(t => ({
    id_szemely: t.id_szemely,
    congregation_id: congregationId,
    tisztseg: presbiterCimke(t.fokozat, t.funkcio),
    fokozat: t.fokozat,
    funkcio: t.funkcio || null,
    kezdete: input.valasztasDatum,
    vege: ujVege,
    id_csoport: t.id_csoport || null,
    publikus: false,
  }))
  const { data: beszurt, error: beszurasHiba } = await supabase
    .from('presbiter').insert(records).select('id')
  if (beszurasHiba) return { error: `Az új ciklus beszúrása nem sikerült: ${beszurasHiba.message}` }

  await logAuditEvent({
    action: 'presbyter.uj_ciklus',
    targetTable: 'presbiter',
    metadata: { valasztasDatum: input.valasztasDatum, ujVege, tagok: input.tagok.length },
  }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { success: true, letrehozva: beszurt?.length ?? 0, vege: ujVege }
}
