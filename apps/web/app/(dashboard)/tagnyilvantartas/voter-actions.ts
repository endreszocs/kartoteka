'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveCongregationContext } from '@/lib/auth/effective-access'
import { getVisibleDistrictName, getVisibleDistrictNameMap } from '@/lib/members/district-visibility'
import { logAuditEvent } from '@/lib/audit/log'

/**
 * Választó adatsor — névjegyzékhez és a nyomtatási központhoz.
 *
 * A `paidPrevYearSum`/`paidCurrentYearSum` a 101.01 kódú (egyházfenntartói járulék)
 * befizetések összesített értéke az adott évre. Az `expectedPrevYear`/`expectedCurrentYear`
 * a `bealitas.eves_jarulek` az adott évre — ez alapján dönti el a print dialog,
 * hogy „teljesen" vagy „részlegesen" fizetett-e az adott személy.
 */
export interface VoterRow {
  id: number
  nev: string
  csaladnev: string
  ferfi: boolean
  age: number
  foglalkozas: string
  lakcim: string
  lakhely: string
  konfirmalt: boolean
  jarulekFizeto: boolean
  jarulekMaxEv: number
  korzet_nev: string
  // 2026-04-19 — nyomtatási központ szűrőihez
  paidPrevYearSum: number
  paidCurrentYearSum: number
  expectedPrevYear: number
  expectedCurrentYear: number
  // 2026-06-10 (Fázis 5, P3-7): perzisztált választói jogosultság + felülbírálás
  eligible: boolean
  override: number | null
}

export async function getVoters(): Promise<VoterRow[]> {
  const { supabase, congregationId: congId } = await getEffectiveCongregationContext()
  if (!congId) return []
  const currentYear = new Date().getFullYear()
  const prevYear = currentYear - 1

  const [szemelyRes, konfirmRes, csaladRes, gyerekRes, jarulekRes, bealitasRes, districtState] = await Promise.all([
    supabase.from('szemely').select('id, csaladnev, k_nev, ferfi, sz_datum, foglalkozas, c_szam, voter_eligible, voter_manual_override, adrlocality!c_helysegid(name), adrstreet!c_utcaid(name)')
      .eq('congregation_id', congId).eq('isvisible', true).eq('meghalt', false).order('csaladnev'),
    supabase.from('konfirmalas').select('id_szemely').eq('congregation_id', congId),
    // 2026-06-01 (hibrid család-modell Fázis 2): új haztartas + haztartas_tag-ból
    supabase.from('haztartas')
      .select('legacy_csalad_id, id_csoport, tagok:haztartas_tag(id_szemely, szerep)')
      .eq('congregation_id', congId)
      .is('ervenyes_ig', null)
      .not('legacy_csalad_id', 'is', null),
    Promise.resolve({ data: [] }),
    supabase.from('befizetes').select('id_szemely, fizetettev, osszeg, befizetescel!id_befizetescel(id_szamadasicel)').eq('congregation_id', congId).or('deleted.eq.false,deleted.is.null'),
    supabase.from('bealitas').select('id, eves_jarulek').eq('congregation_id', congId).in('id', [String(prevYear), String(currentYear)]),
    getVisibleDistrictNameMap(supabase, congId),
  ])

  const szemelyek = (szemelyRes.data || []) as unknown as { id: number; csaladnev: string; k_nev: string; ferfi: boolean; sz_datum: string | null; foglalkozas: string | null; c_szam: string | null; voter_eligible: boolean | null; voter_manual_override: number | null; adrlocality: { name: string } | null; adrstreet: { name: string } | null }[]
  const konfirmaltIds = new Set((konfirmRes.data || []).map((k: { id_szemely: number }) => k.id_szemely))
  // 2026-06-01 (hibrid család-modell Fázis 2): a haztartas-ot átkonvertáljuk
  // a régi csalad-szerkezetbe (id, id_csoport, id_ferfi, id_no) — backward-kompat.
  const csaladok: { id: number; id_csoport: number | null; id_ferfi: number | null; id_no: number | null }[] = []
  const gyerekLinks: { id_szemely: number; id_csalad: number }[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const h of (csaladRes.data || []) as any[]) {
    const legacyId = h.legacy_csalad_id as number
    let id_ferfi: number | null = null
    let id_no: number | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of (h.tagok || []) as any[]) {
      const szId = t.id_szemely as number
      if (t.szerep === 'csaladfo' && !id_ferfi) id_ferfi = szId
      else if (t.szerep === 'hazastars' && !id_no) id_no = szId
      else if (t.szerep === 'gyermek') gyerekLinks.push({ id_szemely: szId, id_csalad: legacyId })
    }
    csaladok.push({ id: legacyId, id_csoport: h.id_csoport ?? null, id_ferfi, id_no })
  }
  const districtNameMap = districtState.districtNameMap

  // Éves beállítás → várható járulék évenként
  const expectedByYear: Record<number, number> = {}
  ;((bealitasRes.data as { id: string; eves_jarulek: number | null }[] | null) || []).forEach(b => {
    const y = Number(b.id)
    if (!Number.isNaN(y)) expectedByYear[y] = Number(b.eves_jarulek) || 0
  })
  const expectedPrevYear = expectedByYear[prevYear] || 0
  const expectedCurrentYear = expectedByYear[currentYear] || 0

  // Járulék — CSAK 101.01 kódú befizetések (egyházfenntartói járulék)
  // Külön-külön összegezve évekre (prev + current)
  const paidPrevByPerson: Record<number, number> = {}
  const paidCurrentByPerson: Record<number, number> = {}
  const jarulekBySzemely: Record<number, number> = {}
  const jarulekFizetoIds = new Set<number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(jarulekRes.data || []).forEach((b: any) => {
    const celKod: string = b.befizetescel?.id_szamadasicel || ''
    if (!celKod.startsWith('101.01')) return // Csak járulék befizetéseket nézzük
    const ev = b.fizetettev as number | null
    const id = b.id_szemely as number | null
    const amt = Number(b.osszeg) || 0
    if (!ev || !id) return
    if (ev === prevYear) paidPrevByPerson[id] = (paidPrevByPerson[id] || 0) + amt
    if (ev === currentYear) paidCurrentByPerson[id] = (paidCurrentByPerson[id] || 0) + amt
    if (!jarulekBySzemely[id] || ev > jarulekBySzemely[id]) jarulekBySzemely[id] = ev
    if (ev >= prevYear) jarulekFizetoIds.add(id)
  })

  // 2026-06-30 (perf): O(n²) → O(n+m). Korábban a getKorzet MINDEN 18+ személyre
  // Array.find-dal végigpásztázta a csaladok/gyerekLinks tömböt (sok ezer tag ×
  // sok ezer család = négyzetes). Egyszer felépítjük az indexeket, megőrizve a
  // felnőtt-precedenciát + first-wins szemantikát; a kimenet bit-azonos.
  const adultToCsoport = new Map<number, number | null>()
  const childPersonToCsalad = new Map<number, number>()
  const csaladById = new Map<number, number | null>()
  for (const c of csaladok) {
    if (!csaladById.has(c.id)) csaladById.set(c.id, c.id_csoport ?? null)
    if (c.id_ferfi != null && !adultToCsoport.has(c.id_ferfi)) adultToCsoport.set(c.id_ferfi, c.id_csoport ?? null)
    if (c.id_no != null && !adultToCsoport.has(c.id_no)) adultToCsoport.set(c.id_no, c.id_csoport ?? null)
  }
  for (const g of gyerekLinks) {
    if (!childPersonToCsalad.has(g.id_szemely)) childPersonToCsalad.set(g.id_szemely, g.id_csalad)
  }

  function getKorzet(szemelId: number): string {
    let csoport: number | null | undefined
    if (adultToCsoport.has(szemelId)) {
      csoport = adultToCsoport.get(szemelId) // felnőtt-precedencia, first-wins
    } else {
      const csaladId = childPersonToCsalad.get(szemelId)
      if (csaladId != null) csoport = csaladById.get(csaladId) ?? null
    }
    return getVisibleDistrictName(csoport ?? null, districtNameMap)
  }

  return szemelyek
    .filter(m => m.sz_datum && (currentYear - new Date(m.sz_datum).getFullYear()) >= 18)
    .map(m => ({
      id: m.id,
      nev: `${m.csaladnev || ''} ${m.k_nev || ''}`.trim(),
      csaladnev: m.csaladnev || '',
      ferfi: m.ferfi,
      age: currentYear - new Date(m.sz_datum!).getFullYear(),
      foglalkozas: m.foglalkozas || '',
      lakcim: [m.adrstreet?.name, m.c_szam].filter(Boolean).join(' ') || '—',
      lakhely: m.adrlocality?.name || '—',
      konfirmalt: konfirmaltIds.has(m.id),
      jarulekFizeto: jarulekFizetoIds.has(m.id),
      jarulekMaxEv: jarulekBySzemely[m.id] || 0,
      korzet_nev: getKorzet(m.id),
      paidPrevYearSum: paidPrevByPerson[m.id] || 0,
      paidCurrentYearSum: paidCurrentByPerson[m.id] || 0,
      expectedPrevYear,
      expectedCurrentYear,
      eligible: m.voter_eligible === true,
      override: m.voter_manual_override ?? null,
    }))
}

// ── Választói jogosultság automatika (2026-06-10, Fázis 5 / P3-7) ─────

/**
 * Újraszámítja a teljes gyülekezet választói névjegyzékét a szabály alapján
 * (18+, konfirmált, élő aktív tag), a kézi felülbírálást tiszteletben tartva,
 * és visszaadja az összesítőt: { eligible, total, added, removed }.
 */
export async function recomputeVoterEligibility(): Promise<{
  ok: boolean
  error?: string
  eligible?: number
  total?: number
  added?: number
  removed?: number
}> {
  const { supabase, congregationId: congId } = await getEffectiveCongregationContext()
  if (!congId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  const { data, error } = await supabase.rpc('recompute_voter_eligibility', { p_congregation_id: congId })
  if (error) return { ok: false, error: `${error.message} (Lefutott már a 2026-06-10-es Fázis 5 migráció?)` }

  const res = data as { status?: string; eligible?: number; total?: number; added?: number; removed?: number } | null
  if (res?.status === 'forbidden') return { ok: false, error: 'Nincs jogosultság.' }
  if (res?.status !== 'ok') return { ok: false, error: 'Ismeretlen válasz az újraszámítástól.' }

  await logAuditEvent({ action: 'voter.recompute', targetTable: 'szemely', metadata: { eligible: res.eligible, added: res.added, removed: res.removed } }, supabase)
  revalidatePath('/tagnyilvantartas')
  return { ok: true, eligible: res.eligible, total: res.total, added: res.added, removed: res.removed }
}

/**
 * Egy tag választói jogosultságának kézi felülbírálása.
 * override: 1 = mindig jogosult, 0 = mindig kizárt, null = automatikus (szabály dönt).
 * A beállítás után újraszámítja az érintett gyülekezetet.
 */
export async function setVoterOverride(szemelyId: number, override: 0 | 1 | null) {
  const { supabase, congregationId: congId } = await getEffectiveCongregationContext()
  if (!congId) return { ok: false, error: 'Nincs aktív gyülekezet.' }

  const { error } = await supabase
    .from('szemely')
    .update({ voter_manual_override: override })
    .eq('id', szemelyId)
    .eq('congregation_id', congId)
  if (error) return { ok: false, error: `Hiba: ${error.message}` }

  await logAuditEvent({ action: 'voter.override_set', targetTable: 'szemely', targetId: String(szemelyId), metadata: { override } }, supabase)
  // A flag tényleges értékét az újraszámítás állítja be a felülbírálás szerint
  await supabase.rpc('recompute_voter_eligibility', { p_congregation_id: congId })
  revalidatePath('/tagnyilvantartas')
  return { ok: true }
}

/**
 * Választók nyomtatási központ kontextusa — név, cím, telefon az előlaphoz.
 * A voters listát a `getVoters()` adja vissza, ez csak a fejléc-adatokat.
 */
export interface VoterPrintContext {
  congregationName: string
  address: string | null
  phone: string | null
}

export async function getVoterPrintContext(): Promise<VoterPrintContext> {
  const { supabase, congregationId: congId } = await getEffectiveCongregationContext()
  if (!congId) return { congregationName: 'Gyülekezet', address: null, phone: null }

  const { data } = await supabase
    .from('congregations')
    .select('name, nev_hu, adoszam, cim, varos, megye, telefon')
    .eq('id', congId)
    .maybeSingle()

  const congregationName = (data?.nev_hu as string | null) || (data?.name as string | null) || 'Gyülekezet'
  const addressParts = [data?.cim, data?.varos, data?.megye].filter(Boolean) as string[]
  const address = addressParts.length > 0 ? addressParts.join(', ') : null
  const phone = (data?.telefon as string | null) || null

  return { congregationName, address, phone }
}
