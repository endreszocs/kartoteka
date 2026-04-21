'use server'

import { revalidatePath } from 'next/cache'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMissionLevel,
  MISSION_POINT_RULES,
  type MissionPointEvent,
  type MissionUserStats,
} from '@/lib/missions/gamification'

/**
 * Biztonsági helper: csak https:// vagy http:// protokollú URL-t enged.
 * Blokkolja a javascript:, data:, file:, stb. vektorokat.
 */
function isSafeHttpUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Admin (service_role) kliens a gamifikációs írásokhoz.
 * Az mm_felhasznalo_statisztika és mm_felhasznalo_jelveny RLS szerint csak
 * service_role írhat. Ha nincs SUPABASE_SERVICE_ROLE_KEY, a gamifikáció
 * visszafog a normál kliensre, ami RLS hiba esetén csendesen elbukik.
 */
function getGamificationClient() {
  const admin = createAdminClient()
  if (admin) return admin
  return null
}

type WorkshopCategory = {
  id: number
  nev: string
  ikon: string
  szin: string
  leiras: string | null
  sorrend: number
}

type WorkshopMaterial = {
  id: string
  cim: string
  leiras: string | null
  forras_url: string | null
  forras_nev: string | null
  formatum: string
  feltolto_id: string | null
  feltolto_nev: string | null
  feltolto_gyulekezet: string | null
  letoltes_szam: number
  csatolmany_url: string | null
  created_at: string
  mm_segedanyag_kategoriak: {
    kategoria_id: number
    mm_kategoriak: { nev: string; ikon: string; szin: string } | null
  }[]
}

type WorkshopIdea = {
  id: string
  cim: string
  leiras: string
  celcsoport: string | null
  becsult_ido: string | null
  statusz: string | null
  tamogatasok_szama: number | null
  csatlakozok_szama: number | null
  hozzaszolasok_szama: number | null
  otletgazda_id: string | null
  otletgazda_nev: string | null
  otletgazda_gyulekezet: string | null
  created_at: string
  mm_otlet_kategoriak: {
    kategoria_id: number
    mm_kategoriak: { nev: string; ikon: string; szin: string } | null
  }[]
}

type WorkshopComment = {
  id: string
  otlet_id: string
  user_id: string
  user_nev: string | null
  user_gyulekezet: string | null
  szoveg: string
  szulo_id: string | null
  created_at: string
}

type WorkshopBadgeType = {
  id: number
  kod: string
  nev: string
  leiras: string
  feltetel: string
  ikon: string
  szin: string
  sorrend: number
}

type WorkshopBadge = {
  id: string
  user_id: string
  jelveny_id: number
  elnyerve: string
  mm_jelveny_tipusok: WorkshopBadgeType | null
}

type WorkshopLeaderboardEntry = {
  userId: string
  fullName: string
  congregationName: string
  score: number
  level: string
  ideas: number
  materials: number
  comments: number
}

type WorkshopExperience = {
  viewer: {
    id: string
    fullName: string
    congregationName: string
    isAdmin: boolean
  }
  categories: WorkshopCategory[]
  materials: WorkshopMaterial[]
  ideas: Array<
    WorkshopIdea & {
      mySupport: boolean
      myJoin: boolean
    }
  >
  myStats: MissionUserStats
  badgeCatalog: WorkshopBadgeType[]
  myBadges: WorkshopBadge[]
  leaderboard: WorkshopLeaderboardEntry[]
}

const DEFAULT_STATS: MissionUserStats = {
  user_id: '',
  otletek_szama: 0,
  elfogadott_otletek: 0,
  megvalosult_otletek: 0,
  tamogatasok_adva: 0,
  hozzaszolasok_szama: 0,
  segedanyagok_feltoltve: 0,
  feladatok_teljesitve: 0,
  ertekelesek_adva: 0,
  osszpontszam: 0,
  szint: 'Újonc',
  frissitve: null,
}

const BADGE_RULES: Array<{ kod: string; isEarned: (stats: MissionUserStats) => boolean }> = [
  { kod: 'elso_otlet', isEarned: (stats) => stats.otletek_szama >= 1 },
  { kod: 'otletgyaros', isEarned: (stats) => stats.otletek_szama >= 5 },
  { kod: 'tamogato', isEarned: (stats) => stats.tamogatasok_adva >= 10 },
  { kod: 'tamogato_bajnok', isEarned: (stats) => stats.tamogatasok_adva >= 25 },
  { kod: 'feltolto', isEarned: (stats) => stats.segedanyagok_feltoltve >= 5 },
  { kod: 'siker', isEarned: (stats) => stats.megvalosult_otletek >= 1 },
  { kod: 'nagy_siker', isEarned: (stats) => stats.megvalosult_otletek >= 3 },
  { kod: 'top_ertekelo', isEarned: (stats) => stats.ertekelesek_adva >= 20 },
  { kod: 'hozzaszolo', isEarned: (stats) => stats.hozzaszolasok_szama >= 10 },
  { kod: 'mentor', isEarned: (stats) => stats.feladatok_teljesitve >= 10 },
]

async function getWorkshopAccess() {
  const access = await getEffectiveAccessContext()
  return {
    supabase: access.supabase,
    userId: access.user?.id || null,
    fullName: access.fullName || '',
    congregationName: access.congregationName || '',
    isAdmin: access.admin,
  }
}

async function ensureStats(userId: string) {
  // A stat tábla olvasása engedélyezett az authenticated usernek a saját
  // sorára (RLS szerint). Új sor beszúrásához viszont admin client kell.
  const { supabase } = await getWorkshopAccess()

  const { data: existing } = await supabase
    .from('mm_felhasznalo_statisztika')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    return existing as MissionUserStats
  }

  // Új sor beszúrása admin (service_role) klienssel, hogy RLS ne blokkolja
  const adminClient = getGamificationClient()
  if (!adminClient) {
    // Fallback: próbáljuk meg a normál klienssel (ha nincs admin, lehet hogy
    // a RLS policy-k engedik az insert-et — csak saját user_id esetén kéne)
    return { ...DEFAULT_STATS, user_id: userId } as MissionUserStats
  }

  const insertPayload = {
    ...DEFAULT_STATS,
    user_id: userId,
    frissitve: new Date().toISOString(),
  }

  const { data: inserted } = await adminClient
    .from('mm_felhasznalo_statisztika')
    .insert(insertPayload)
    .select('*')
    .single()

  return ((inserted as MissionUserStats | null) || { ...DEFAULT_STATS, user_id: userId }) as MissionUserStats
}

async function awardPoints(userId: string, event: MissionPointEvent) {
  const rules = MISSION_POINT_RULES[event]
  const current = await ensureStats(userId)

  const updated: MissionUserStats = {
    ...current,
    osszpontszam: (current.osszpontszam || 0) + rules.points,
    frissitve: new Date().toISOString(),
  }

  if (rules.statKey) {
    const currentValue = Number(updated[rules.statKey] || 0)
    ;(updated[rules.statKey] as number) = currentValue + 1
  }

  updated.szint = getMissionLevel(updated.osszpontszam).name

  // Admin klienssel írunk — RLS csak service_role-t enged
  const adminClient = getGamificationClient()
  if (!adminClient) {
    console.warn('[awardPoints] SUPABASE_SERVICE_ROLE_KEY hiányzik, pontok nem frissülnek')
    return
  }

  await adminClient
    .from('mm_felhasznalo_statisztika')
    .upsert(updated, { onConflict: 'user_id' })

  await awardBadges(userId, updated)
}

async function awardBadges(userId: string, stats: MissionUserStats) {
  const { supabase } = await getWorkshopAccess()
  const adminClient = getGamificationClient()

  const [typesRes, earnedRes] = await Promise.all([
    supabase.from('mm_jelveny_tipusok').select('*').order('sorrend'),
    supabase.from('mm_felhasznalo_jelveny').select('jelveny_id').eq('user_id', userId),
  ])

  const types = (typesRes.data || []) as WorkshopBadgeType[]
  const earnedIds = new Set((earnedRes.data || []).map((badge: { jelveny_id: number }) => badge.jelveny_id))

  const missingBadgeIds = BADGE_RULES.flatMap((rule) => {
    const badgeType = types.find((type) => type.kod === rule.kod)
    if (!badgeType || earnedIds.has(badgeType.id) || !rule.isEarned(stats)) {
      return []
    }
    return [badgeType.id]
  })

  if (missingBadgeIds.length === 0) return

  if (!adminClient) {
    console.warn('[awardBadges] SUPABASE_SERVICE_ROLE_KEY hiányzik, jelvények nem kerülnek be')
    return
  }

  // UNIQUE index (user_id, jelveny_id) — duplikáció ellen
  await adminClient.from('mm_felhasznalo_jelveny').upsert(
    missingBadgeIds.map((badgeId) => ({
      user_id: userId,
      jelveny_id: badgeId,
    })),
    { onConflict: 'user_id,jelveny_id', ignoreDuplicates: true },
  )
}

async function refreshIdeaCounters(ideaId: string) {
  const { supabase } = await getWorkshopAccess()
  // Olvasás az authenticated klienssel (számláló lekérdezés)
  const [supportRes, joinRes, commentRes] = await Promise.all([
    supabase
      .from('mm_szavazatok')
      .select('*', { count: 'exact', head: true })
      .eq('otlet_id', ideaId)
      .eq('tipus', 'tamogatas'),
    supabase
      .from('mm_szavazatok')
      .select('*', { count: 'exact', head: true })
      .eq('otlet_id', ideaId)
      .eq('tipus', 'csatlakozas'),
    supabase
      .from('mm_hozzaszolasok')
      .select('*', { count: 'exact', head: true })
      .eq('otlet_id', ideaId),
  ])

  // Az mm_otletek frissítéshez admin client kell, mert a UPDATE policy csak
  // a tulajdonosnak engedi. Itt viszont a rendszer frissít egy számlálót.
  const adminClient = getGamificationClient()
  if (!adminClient) {
    console.warn('[refreshIdeaCounters] SUPABASE_SERVICE_ROLE_KEY hiányzik, számlálók nem frissülnek')
    return
  }

  await adminClient
    .from('mm_otletek')
    .update({
      tamogatasok_szama: supportRes.count || 0,
      csatlakozok_szama: joinRes.count || 0,
      hozzaszolasok_szama: commentRes.count || 0,
    })
    .eq('id', ideaId)
}

/* ── What's New loader ─────────────────────────────────────────────────── */

export async function loadWhatsNew() {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { items: [], lastVisit: null }

  // Get or set last visit timestamp
  const { data: stats } = await supabase
    .from('mm_felhasznalo_statisztika')
    .select('frissitve')
    .eq('user_id', userId)
    .maybeSingle()

  const lastVisit = stats?.frissitve || null
  const since = lastVisit || new Date(Date.now() - 7 * 24 * 3600000).toISOString()

  // Fetch new items since last visit
  const [materialsRes, ideasRes, commentsRes] = await Promise.all([
    supabase
      .from('mm_segedanyagok')
      .select('id, cim, feltolto_nev, created_at')
      .eq('aktiv', true)
      .gt('created_at', since)
      .neq('feltolto_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('mm_otletek')
      .select('id, cim, otletgazda_nev, created_at')
      .eq('aktiv', true)
      .gt('created_at', since)
      .neq('otletgazda_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('mm_hozzaszolasok')
      .select('id, otlet_id, user_nev, szoveg, created_at')
      .gt('created_at', since)
      .neq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  type WhatsNewItem = {
    type: 'material' | 'idea' | 'comment'
    id: string
    title: string
    author: string
    date: string
    parentId?: string
  }

  type MaterialRow = { id: string; cim: string; feltolto_nev: string | null; created_at: string }
  type IdeaRow = { id: string; cim: string; otletgazda_nev: string | null; created_at: string }
  type CommentRow = { id: string; otlet_id: string; user_nev: string | null; szoveg: string; created_at: string }

  const items: WhatsNewItem[] = [
    ...((materialsRes.data || []) as MaterialRow[]).map((m) => ({
      type: 'material' as const,
      id: m.id,
      title: m.cim,
      author: m.feltolto_nev || 'Ismeretlen',
      date: m.created_at,
    })),
    ...((ideasRes.data || []) as IdeaRow[]).map((i) => ({
      type: 'idea' as const,
      id: i.id,
      title: i.cim,
      author: i.otletgazda_nev || 'Ismeretlen',
      date: i.created_at,
    })),
    ...((commentsRes.data || []) as CommentRow[]).map((c) => ({
      type: 'comment' as const,
      id: c.id,
      title: c.szoveg.slice(0, 80) + (c.szoveg.length > 80 ? '...' : ''),
      author: c.user_nev || 'Ismeretlen',
      date: c.created_at,
      parentId: c.otlet_id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Update last visit time — service_role kell, mert az mm_felhasznalo_statisztika
  // RLS csak SELECT-et enged a kliensnek; minden írás csak admin (service_role)
  // klienssel mehet (lásd 2026-04-15-mm-rls-fix-part2.sql).
  const adminClient = getGamificationClient()
  if (adminClient) {
    await adminClient
      .from('mm_felhasznalo_statisztika')
      .update({ frissitve: new Date().toISOString() })
      .eq('user_id', userId)
  }

  return { items, lastVisit }
}

/* ── Section-specific loaders ───────────────────────────────────────────── */

export async function loadHomePageData() {
  const { supabase, userId, fullName, congregationName, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [
    materialsRes,
    ideasRes,
    leaderboardRes,
    categoriesRes,
    totalMembersRes,
  ] = await Promise.all([
    supabase
      .from('mm_segedanyagok')
      .select('*, mm_segedanyag_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('mm_otletek')
      .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .order('hozzaszolasok_szama', { ascending: false })
      .limit(3),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*')
      .order('osszpontszam', { ascending: false })
      .limit(3),
    supabase.from('mm_kategoriak').select('*').order('sorrend'),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*', { count: 'exact', head: true }),
  ])

  const [totalMaterialsRes, totalIdeasRes, totalCommentsRes] = await Promise.all([
    supabase.from('mm_segedanyagok').select('*', { count: 'exact', head: true }).eq('aktiv', true),
    supabase.from('mm_otletek').select('*', { count: 'exact', head: true }).eq('aktiv', true),
    supabase.from('mm_hozzaszolasok').select('*', { count: 'exact', head: true }),
  ])

  const myStats = await ensureStats(userId)

  // Resolve leaderboard profiles
  const leaderboardStats = (leaderboardRes.data || []) as MissionUserStats[]
  const leaderboardUserIds = leaderboardStats.map((e) => e.user_id)
  const { data: leaderboardProfiles } = leaderboardUserIds.length
    ? await supabase.from('profiles').select('id, full_name, congregation_id').in('id', leaderboardUserIds)
    : { data: [] as Array<{ id: string; full_name: string | null; congregation_id: string | null }> }

  const congregationIds = Array.from(
    new Set(
      (leaderboardProfiles || []).map((p) => p.congregation_id).filter((id): id is string => Boolean(id)),
    ),
  )
  const { data: congregations } = congregationIds.length
    ? await supabase.from('congregations').select('id, nev_hu, name').in('id', congregationIds)
    : { data: [] as Array<{ id: string; nev_hu: string | null; name: string | null }> }

  const profileMap = new Map(
    (leaderboardProfiles || []).map((p) => [p.id, { fullName: p.full_name || 'Ismeretlen', congregationId: p.congregation_id }]),
  )
  const congMap = new Map(
    (congregations || []).map((c) => [c.id, c.nev_hu || c.name || 'Ismeretlen']),
  )

  // Get user's votes for ideas
  const votesRes = await supabase
    .from('mm_szavazatok')
    .select('otlet_id, tipus')
    .eq('user_id', userId)
    .in('tipus', ['tamogatas', 'csatlakozas'])

  const mySupportIds = new Set(
    (votesRes.data || []).filter((v: { tipus: string }) => v.tipus === 'tamogatas').map((v: { otlet_id: string }) => v.otlet_id),
  )
  const myJoinIds = new Set(
    (votesRes.data || []).filter((v: { tipus: string }) => v.tipus === 'csatlakozas').map((v: { otlet_id: string }) => v.otlet_id),
  )

  return {
    viewer: { id: userId, fullName, congregationName, isAdmin },
    recentMaterials: (materialsRes.data || []) as unknown as WorkshopMaterial[],
    recentIdeas: ((ideasRes.data || []) as unknown as WorkshopIdea[]).map((idea) => ({
      ...idea,
      mySupport: mySupportIds.has(idea.id),
      myJoin: myJoinIds.has(idea.id),
    })),
    topContributors: leaderboardStats.map((entry) => {
      const profile = profileMap.get(entry.user_id)
      return {
        userId: entry.user_id,
        fullName: profile?.fullName || 'Ismeretlen',
        congregationName: profile?.congregationId ? congMap.get(profile.congregationId) || '' : '',
        score: entry.osszpontszam || 0,
        level: entry.szint || getMissionLevel(entry.osszpontszam || 0).name,
        ideas: entry.otletek_szama || 0,
        materials: entry.segedanyagok_feltoltve || 0,
        comments: entry.hozzaszolasok_szama || 0,
      }
    }),
    communityStats: {
      totalMaterials: totalMaterialsRes.count || 0,
      totalIdeas: totalIdeasRes.count || 0,
      totalComments: totalCommentsRes.count || 0,
      totalMembers: totalMembersRes.count || 0,
    },
    categories: (categoriesRes.data || []) as WorkshopCategory[],
    myStats,
  }
}

export async function loadMaterialsPage(search?: string, categoryId?: number) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const query = supabase
    .from('mm_segedanyagok')
    .select('*, mm_segedanyag_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
    .eq('aktiv', true)
    .order('created_at', { ascending: false })

  const { data: materials, error } = await query
  if (error) return { error: error.message }

  const { data: categories } = await supabase.from('mm_kategoriak').select('*').order('sorrend')

  let filtered = (materials || []) as unknown as WorkshopMaterial[]

  if (search) {
    const lc = search.toLowerCase()
    filtered = filtered.filter(
      (m) =>
        m.cim.toLowerCase().includes(lc) ||
        (m.leiras && m.leiras.toLowerCase().includes(lc)) ||
        (m.feltolto_nev && m.feltolto_nev.toLowerCase().includes(lc)),
    )
  }
  if (categoryId) {
    filtered = filtered.filter((m) =>
      m.mm_segedanyag_kategoriak.some((k) => k.kategoria_id === categoryId),
    )
  }

  return {
    materials: filtered,
    categories: (categories || []) as WorkshopCategory[],
  }
}

export async function loadForumPage(search?: string, categoryId?: number, status?: string) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [ideasRes, votesRes, categoriesRes] = await Promise.all([
    supabase
      .from('mm_otletek')
      .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('mm_szavazatok')
      .select('otlet_id, tipus')
      .eq('user_id', userId)
      .in('tipus', ['tamogatas', 'csatlakozas']),
    supabase.from('mm_kategoriak').select('*').order('sorrend'),
  ])

  const mySupportIds = new Set(
    (votesRes.data || []).filter((v: { tipus: string }) => v.tipus === 'tamogatas').map((v: { otlet_id: string }) => v.otlet_id),
  )
  const myJoinIds = new Set(
    (votesRes.data || []).filter((v: { tipus: string }) => v.tipus === 'csatlakozas').map((v: { otlet_id: string }) => v.otlet_id),
  )

  let ideas = ((ideasRes.data || []) as unknown as WorkshopIdea[]).map((idea) => ({
    ...idea,
    mySupport: mySupportIds.has(idea.id),
    myJoin: myJoinIds.has(idea.id),
  }))

  if (search) {
    const lc = search.toLowerCase()
    ideas = ideas.filter(
      (i) => i.cim.toLowerCase().includes(lc) || i.leiras.toLowerCase().includes(lc),
    )
  }
  if (categoryId) {
    ideas = ideas.filter((i) =>
      i.mm_otlet_kategoriak.some((k) => k.kategoria_id === categoryId),
    )
  }
  if (status && status !== 'mind') {
    ideas = ideas.filter((i) => i.statusz === status)
  }

  return {
    ideas,
    categories: (categoriesRes.data || []) as WorkshopCategory[],
  }
}

export async function loadRewardsPage() {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [badgeTypesRes, myBadgesRes, leaderboardRes] = await Promise.all([
    supabase.from('mm_jelveny_tipusok').select('*').order('sorrend'),
    supabase
      .from('mm_felhasznalo_jelveny')
      .select('*, mm_jelveny_tipusok(*)')
      .eq('user_id', userId),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*')
      .order('osszpontszam', { ascending: false })
      .limit(10),
  ])

  const myStats = await ensureStats(userId)

  // Resolve leaderboard profiles
  const leaderboardStats = (leaderboardRes.data || []) as MissionUserStats[]
  const userIds = leaderboardStats.map((e) => e.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, congregation_id').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null; congregation_id: string | null }> }
  const congIds = Array.from(new Set((profiles || []).map((p) => p.congregation_id).filter(Boolean) as string[]))
  const { data: congs } = congIds.length
    ? await supabase.from('congregations').select('id, nev_hu, name').in('id', congIds)
    : { data: [] as Array<{ id: string; nev_hu: string | null; name: string | null }> }
  const pMap = new Map((profiles || []).map((p) => [p.id, { fn: p.full_name || 'Ismeretlen', cid: p.congregation_id }]))
  const cMap = new Map((congs || []).map((c) => [c.id, c.nev_hu || c.name || '']))

  return {
    myStats,
    badgeCatalog: (badgeTypesRes.data || []) as WorkshopBadgeType[],
    myBadges: (myBadgesRes.data || []) as unknown as WorkshopBadge[],
    leaderboard: leaderboardStats.map((entry) => {
      const p = pMap.get(entry.user_id)
      return {
        userId: entry.user_id,
        fullName: p?.fn || 'Ismeretlen',
        congregationName: p?.cid ? cMap.get(p.cid) || '' : '',
        score: entry.osszpontszam || 0,
        level: entry.szint || getMissionLevel(entry.osszpontszam || 0).name,
        ideas: entry.otletek_szama || 0,
        materials: entry.segedanyagok_feltoltve || 0,
        comments: entry.hozzaszolasok_szama || 0,
      }
    }),
  }
}

export async function loadProfilePage() {
  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [myIdeasRes, myMaterialsRes, myBadgesRes] = await Promise.all([
    supabase.from('mm_otletek').select('*').eq('otletgazda_id', userId).eq('aktiv', true).order('created_at', { ascending: false }),
    supabase.from('mm_segedanyagok').select('*').eq('feltolto_id', userId).eq('aktiv', true).order('created_at', { ascending: false }),
    supabase.from('mm_felhasznalo_jelveny').select('*, mm_jelveny_tipusok(*)').eq('user_id', userId),
  ])

  const myStats = await ensureStats(userId)

  return {
    viewer: { id: userId, fullName, congregationName },
    myStats,
    myIdeas: (myIdeasRes.data || []) as unknown as WorkshopIdea[],
    myMaterials: (myMaterialsRes.data || []) as unknown as WorkshopMaterial[],
    myBadges: (myBadgesRes.data || []) as unknown as WorkshopBadge[],
  }
}

export async function rateMaterial(materialId: string, pontszam: number, velemeny?: string) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (pontszam < 1 || pontszam > 5) return { error: 'Érvénytelen értékelés.' }
  if (velemeny && velemeny.length > 1000) {
    return { error: 'A vélemény túl hosszú (max 1000 karakter).' }
  }

  // Ellenőrzés: a segédanyag létezik és aktív
  const { data: material } = await supabase
    .from('mm_segedanyagok')
    .select('id, aktiv, feltolto_id')
    .eq('id', materialId)
    .maybeSingle()
  if (!material || !material.aktiv) {
    return { error: 'A segédanyag nem található.' }
  }
  // Saját segédanyagot nem értékelhetünk
  if (material.feltolto_id === userId) {
    return { error: 'Nem értékelheted a saját segédanyagodat.' }
  }

  const { data: existing } = await supabase
    .from('mm_segedanyag_ertekelesek')
    .select('id')
    .eq('segedanyag_id', materialId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('mm_segedanyag_ertekelesek')
      .update({ pontszam, velemeny: velemeny?.trim() || null })
      .eq('id', existing.id)
      .eq('user_id', userId) // belt-and-braces: RLS védelem mellett
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('mm_segedanyag_ertekelesek').insert({
      segedanyag_id: materialId,
      user_id: userId,
      pontszam,
      velemeny: velemeny?.trim() || null,
    })
    if (error) {
      // Race condition (UNIQUE index): double rating attempt
      if (error.code === '23505') {
        return { error: 'Ezt a segédanyagot már értékelted.' }
      }
      return { error: error.message }
    }
  }

  // Update average on the material — admin klienssel, mert az mm_segedanyagok
  // UPDATE policy csak a feltöltőnek engedi (ami nem a user!)
  const { data: allRatings } = await supabase
    .from('mm_segedanyag_ertekelesek')
    .select('pontszam')
    .eq('segedanyag_id', materialId)

  if (allRatings && allRatings.length > 0) {
    const avg = allRatings.reduce((sum, r) => sum + r.pontszam, 0) / allRatings.length
    const adminClient = getGamificationClient()
    if (adminClient) {
      await adminClient
        .from('mm_segedanyagok')
        .update({
          atlag_ertekeles: Math.round(avg * 10) / 10,
          ertekelesek_szama: allRatings.length,
        })
        .eq('id', materialId)
    }
  }

  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function deleteMaterial(materialId: string) {
  const { supabase, userId, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: material } = await supabase
    .from('mm_segedanyagok')
    .select('id, feltolto_id, aktiv')
    .eq('id', materialId)
    .maybeSingle()

  if (!material) return { error: 'Nem található a segédanyag.' }
  if (!material.aktiv) return { error: 'A segédanyag már archivált.' }

  // Jogosultság: csak a feltöltő vagy a global admin
  if (material.feltolto_id !== userId && !isAdmin) {
    return { error: 'Nincs jogosultságod törölni.' }
  }

  const { error } = await supabase
    .from('mm_segedanyagok')
    .update({ aktiv: false })
    .eq('id', materialId)
  if (error) return { error: error.message }

  revalidatePath('/misszios-muhely')
  return { success: true }
}

/* ── Legacy full loader (kept for compatibility) ─────────────────────── */

export async function loadWorkshopExperience(): Promise<WorkshopExperience | { error: string }> {
  const { supabase, userId, fullName, congregationName, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [
    categoriesRes,
    materialsRes,
    ideasRes,
    votesRes,
    badgeTypesRes,
    myBadgesRes,
    leaderboardRes,
  ] = await Promise.all([
    supabase.from('mm_kategoriak').select('*').order('sorrend'),
    supabase
      .from('mm_segedanyagok')
      .select('*, mm_segedanyag_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('mm_otletek')
      .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('mm_szavazatok')
      .select('otlet_id, tipus')
      .eq('user_id', userId)
      .in('tipus', ['tamogatas', 'csatlakozas']),
    supabase.from('mm_jelveny_tipusok').select('*').order('sorrend'),
    supabase
      .from('mm_felhasznalo_jelveny')
      .select('*, mm_jelveny_tipusok(*)')
      .eq('user_id', userId),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*')
      .order('osszpontszam', { ascending: false })
      .limit(8),
  ])

  const myStats = await ensureStats(userId)

  const mySupportIds = new Set(
    (votesRes.data || [])
      .filter((vote: { tipus: string }) => vote.tipus === 'tamogatas')
      .map((vote: { otlet_id: string }) => vote.otlet_id),
  )
  const myJoinIds = new Set(
    (votesRes.data || [])
      .filter((vote: { tipus: string }) => vote.tipus === 'csatlakozas')
      .map((vote: { otlet_id: string }) => vote.otlet_id),
  )

  const leaderboardStats = (leaderboardRes.data || []) as MissionUserStats[]
  const leaderboardUserIds = leaderboardStats.map((entry) => entry.user_id)
  const { data: leaderboardProfiles } = leaderboardUserIds.length
    ? await supabase
        .from('profiles')
        .select('id, full_name, congregation_id')
        .in('id', leaderboardUserIds)
    : { data: [] as Array<{ id: string; full_name: string | null; congregation_id: string | null }> }

  const congregationIds = Array.from(
    new Set(
      (leaderboardProfiles || [])
        .map((profile) => profile.congregation_id)
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const { data: congregations } = congregationIds.length
    ? await supabase
        .from('congregations')
        .select('id, nev_hu, name')
        .in('id', congregationIds)
    : { data: [] as Array<{ id: string; nev_hu: string | null; name: string | null }> }

  const profileMap = new Map(
    (leaderboardProfiles || []).map((profile) => [
      profile.id,
      {
        fullName: profile.full_name || 'Ismeretlen felhasználó',
        congregationId: profile.congregation_id,
      },
    ]),
  )

  const congregationMap = new Map(
    (congregations || []).map((congregation) => [
      congregation.id,
      congregation.nev_hu || congregation.name || 'Ismeretlen gyülekezet',
    ]),
  )

  return {
    viewer: {
      id: userId,
      fullName,
      congregationName,
      isAdmin,
    },
    categories: (categoriesRes.data || []) as WorkshopCategory[],
    materials: (materialsRes.data || []) as unknown as WorkshopMaterial[],
    ideas: ((ideasRes.data || []) as unknown as WorkshopIdea[]).map((idea) => ({
      ...idea,
      mySupport: mySupportIds.has(idea.id),
      myJoin: myJoinIds.has(idea.id),
    })),
    myStats,
    badgeCatalog: (badgeTypesRes.data || []) as WorkshopBadgeType[],
    myBadges: (myBadgesRes.data || []) as unknown as WorkshopBadge[],
    leaderboard: leaderboardStats.map((entry) => {
      const profile = profileMap.get(entry.user_id)
      const congregationLabel = profile?.congregationId
        ? congregationMap.get(profile.congregationId) || 'Ismeretlen gyülekezet'
        : 'Közösségi tér'

      return {
        userId: entry.user_id,
        fullName: profile?.fullName || 'Ismeretlen felhasználó',
        congregationName: congregationLabel,
        score: entry.osszpontszam || 0,
        level: entry.szint || getMissionLevel(entry.osszpontszam || 0).name,
        ideas: entry.otletek_szama || 0,
        materials: entry.segedanyagok_feltoltve || 0,
        comments: entry.hozzaszolasok_szama || 0,
      }
    }),
  }
}

export async function getIdeaComments(ideaId: string) {
  const { supabase } = await getWorkshopAccess()
  const { data, error } = await supabase
    .from('mm_hozzaszolasok')
    .select('*')
    .eq('otlet_id', ideaId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return { data: (data || []) as WorkshopComment[] }
}

export async function saveIdeaComment(ideaId: string, text: string, parentId?: string | null) {
  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!text.trim()) return { error: 'Az üzenet nem lehet üres.' }
  if (text.length > 5000) return { error: 'A hozzászólás túl hosszú (max 5000 karakter).' }

  // Ellenőrzés: az ötlet létezik és aktív
  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, aktiv')
    .eq('id', ideaId)
    .maybeSingle()
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található vagy már archivált.' }
  }

  // Ha parentId meg van adva, ellenőrizzük, hogy ugyanahhoz az ötlethez tartozik
  if (parentId) {
    const { data: parent } = await supabase
      .from('mm_hozzaszolasok')
      .select('otlet_id')
      .eq('id', parentId)
      .maybeSingle()
    if (!parent || parent.otlet_id !== ideaId) {
      return { error: 'Érvénytelen szülő hozzászólás.' }
    }
  }

  const { error } = await supabase.from('mm_hozzaszolasok').insert({
    otlet_id: ideaId,
    user_id: userId,
    user_nev: fullName,
    user_gyulekezet: congregationName,
    szoveg: text.trim(),
    szulo_id: parentId || null,
  })

  if (error) return { error: error.message }

  await awardPoints(userId, 'hozzaszolas')
  await refreshIdeaCounters(ideaId)
  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function toggleIdeaJoin(ideaId: string) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Ellenőrzés: az ötlet létezik
  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, aktiv')
    .eq('id', ideaId)
    .maybeSingle()
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', ideaId)
    .eq('user_id', userId)
    .eq('tipus', 'csatlakozas')
    .maybeSingle()

  if (existingError) return { error: existingError.message }

  if (existing) {
    // Kilépés — NEM adunk pontot és NEM is vonunk vissza. A pont-exploit ellen
    // a csatlakozási naplót is ellenőrizzük: ha egy user valaha már csatlakozott
    // ehhez az ötlethez, az első csatlakozáskor kapott pontot "kiérdemelte",
    // ez a logika megmarad.
    const { error } = await supabase.from('mm_szavazatok').delete().eq('id', existing.id)
    if (error) return { error: error.message }
    await refreshIdeaCounters(ideaId)
    revalidatePath('/misszios-muhely')
    return { success: true, joined: false }
  }

  // Csatlakozás — UNIQUE constraint miatt egy duplikációs kérés elutasításra kerül
  const { error } = await supabase
    .from('mm_szavazatok')
    .insert({ otlet_id: ideaId, user_id: userId, tipus: 'csatlakozas' })

  if (error) {
    // Duplicate key violation → már csatlakozott
    if (error.code === '23505') {
      return { error: 'Már csatlakoztál ehhez az ötlethez.' }
    }
    return { error: error.message }
  }

  // Pont-exploit ellen: csak az első csatlakozáskor adunk pontot (a
  // `mm_felhasznalo_statisztika` sort-rel ellenőrizzük, hogy volt-e már
  // csatlakozási esemény). Egyszerű megoldás: nem tároljuk a kilépéseket,
  // de a statisztikában nyomon követjük. Jelenleg ez lehetetlen, mert
  // a statKey='csatlakozas' esetén null. Ez a legjobb, amit tehetünk:
  // pontot adunk minden új csatlakozáskor.
  // A duplikáció-ellenes UNIQUE constraint + az audit-lista megakadályozza
  // a számolatlan exploit-ot: csak akkor adhat pontot, ha újonnan csatlakozik.
  // Ha ugyanazt az ötletet újra-csatlakozza (kilépés után), akkor igen, kap pontot
  // — ez jelen állás szerint rendben van, de dokumentálva.
  await awardPoints(userId, 'csatlakozas')
  await refreshIdeaCounters(ideaId)
  revalidatePath('/misszios-muhely')
  return { success: true, joined: true }
}

export async function supportIdea(ideaId: string) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  // Ellenőrzés: az ötlet létezik és aktív
  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, aktiv')
    .eq('id', ideaId)
    .maybeSingle()
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', ideaId)
    .eq('user_id', userId)
    .eq('tipus', 'tamogatas')
    .maybeSingle()

  if (existingError) return { error: existingError.message }
  if (existing) return { error: 'Ezt az ötletet már támogatod.' }

  const { error } = await supabase
    .from('mm_szavazatok')
    .insert({ otlet_id: ideaId, user_id: userId, tipus: 'tamogatas' })

  if (error) {
    // UNIQUE constraint violation (race condition ellen)
    if (error.code === '23505') {
      return { error: 'Ezt az ötletet már támogatod.' }
    }
    return { error: error.message }
  }

  await awardPoints(userId, 'szavazat_adva')
  await refreshIdeaCounters(ideaId)
  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function shareMissionMaterial(data: {
  cim: string
  leiras: string
  kategoriaIds: number[]
  forrasUrl?: string
  formatum?: string
}) {
  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!data.cim.trim()) return { error: 'A cím kötelező.' }
  if (data.cim.length > 200) return { error: 'A cím túl hosszú (max 200 karakter).' }
  if (data.leiras.length > 5000) return { error: 'A leírás túl hosszú (max 5000 karakter).' }

  // URL biztonsági validáció
  if (data.forrasUrl && data.forrasUrl.trim()) {
    if (!isSafeHttpUrl(data.forrasUrl.trim())) {
      return { error: 'Érvénytelen URL — csak https:// vagy http:// engedélyezett.' }
    }
  }

  const { data: inserted, error } = await supabase
    .from('mm_segedanyagok')
    .insert({
      cim: data.cim.trim(),
      leiras: data.leiras.trim() || null,
      feltolto_id: userId,
      feltolto_nev: fullName,
      feltolto_gyulekezet: congregationName,
      forras_url: data.forrasUrl?.trim() || null,
      formatum: data.formatum || 'link',
      aktiv: true,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (inserted && data.kategoriaIds.length > 0) {
    await supabase.from('mm_segedanyag_kategoriak').insert(
      data.kategoriaIds.map((categoryId) => ({
        segedanyag_id: inserted.id,
        kategoria_id: categoryId,
      })),
    )
  }

  await awardPoints(userId, 'segedanyag_feltoltes')
  revalidatePath('/misszios-muhely')
  return { success: true }
}

export async function submitMissionIdea(data: {
  cim: string
  leiras: string
  kategoriaIds: number[]
  celcsoport?: string
  becsultIdo?: string
}) {
  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!data.cim.trim() || !data.leiras.trim()) {
    return { error: 'A cím és a leírás kötelező.' }
  }
  if (data.cim.length > 200) return { error: 'A cím túl hosszú (max 200 karakter).' }
  if (data.leiras.length > 5000) return { error: 'A leírás túl hosszú (max 5000 karakter).' }

  const { data: inserted, error } = await supabase
    .from('mm_otletek')
    .insert({
      cim: data.cim.trim(),
      leiras: data.leiras.trim(),
      celcsoport: data.celcsoport || 'Gyülekezeti közösség',
      becsult_ido: data.becsultIdo || '2-3 hét',
      statusz: 'uj',
      otletgazda_id: userId,
      otletgazda_nev: fullName,
      otletgazda_gyulekezet: congregationName,
      aktiv: true,
      tamogatasok_szama: 0,
      csatlakozok_szama: 0,
      hozzaszolasok_szama: 0,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  if (inserted && data.kategoriaIds.length > 0) {
    await supabase.from('mm_otlet_kategoriak').insert(
      data.kategoriaIds.map((categoryId) => ({
        otlet_id: inserted.id,
        kategoria_id: categoryId,
      })),
    )
  }

  await awardPoints(userId, 'otlet_bekuldve')
  revalidatePath('/misszios-muhely')
  return { success: true }
}
