'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMissionLevel,
  type MissionUserStats,
} from '@/lib/missions/gamification'
import { awardMissionEvent } from '@/lib/missions/reward-server'

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
 * Admin (service_role) kliens a hiányzó statisztikasor inicializálásához.
 * A pontozást nem ez végzi: azt kizárólag az atomikus DB-trigger írhatja.
 */
function getGamificationClient() {
  const admin = createAdminClient()
  if (admin) return admin
  return null
}

export type WorkshopCategory = {
  id: number
  nev: string
  ikon: string
  szin: string
  leiras: string | null
  sorrend: number
}

export type WorkshopMaterial = {
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
  atlag_ertekeles: number | null
  ertekelesek_szama: number | null
  csatolmany_url: string | null
  aktiv: boolean | null
  created_at: string
  updated_at: string | null
  sajat_ertekeles: number | null
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
  szavazas_kezdete: string | null
  szavazas_vege: string | null
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

async function getWorkshopAccess() {
  const access = await getEffectiveAccessContext()
  const role = access.profile?.role
  return {
    supabase: access.supabase,
    userId: access.user?.id || null,
    fullName: access.fullName || '',
    congregationName: access.congregationName || '',
    // Pontosan ugyanaz a szerepkörhalmaz, mint a DB
    // current_user_has_global_access() predikátumában.
    isAdmin:
      access.profile?.status === 'active' &&
      Boolean(role && ['admin', 'esperes', 'egyhazmegyei_admin'].includes(role)),
  }
}

const workshopUuidSchema = z.string().uuid('Érvénytelen műhelyazonosító.')

const materialFormatSchema = z.enum(['PDF', 'DOCX', 'PPTX', 'video', 'link', 'csomag'])

const materialSaveSchema = z.object({
  materialId: z.string().uuid('Érvénytelen segédanyag-azonosító.').nullable().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable().optional(),
  cim: z.string().trim().min(1, 'A cím kötelező.').max(200, 'A cím legfeljebb 200 karakter lehet.'),
  leiras: z.string().max(50000, 'A tartalom legfeljebb 50 000 karakter lehet.'),
  kategoriaIds: z.array(z.number().int().positive()).max(50),
  forrasUrl: z
    .string()
    .trim()
    .max(2048, 'A forráshivatkozás túl hosszú.')
    .refine(
      (value) => !value || isSafeHttpUrl(value),
      'Csak biztonságos http:// vagy https:// URL adható meg.',
    )
    .optional(),
  forrasNev: z.string().trim().max(200, 'A forrás neve legfeljebb 200 karakter lehet.').optional(),
  formatum: materialFormatSchema.default('link'),
})

function parseWorkshopUuid(value: unknown) {
  const parsed = workshopUuidSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function revalidateWorkshopIdea(ideaId: string) {
  revalidatePath('/misszios-muhely')
  revalidatePath('/misszios-muhely/forum')
  revalidatePath(`/misszios-muhely/forum/${ideaId}`)
  revalidatePath('/misszios-muhely/jutalmak')
}

function revalidateWorkshopMaterials() {
  revalidatePath('/misszios-muhely')
  revalidatePath('/misszios-muhely/segedanyagok')
  revalidatePath('/misszios-muhely/profil')
  revalidatePath('/misszios-muhely/jutalmak')
}

function workflowErrorMessage(error: { code?: string; message: string }) {
  if (error.code === '42501') {
    return 'Ehhez a művelethez nincs jogosultságod.'
  }
  if (error.code === '23514' || error.code === '23505') {
    return error.message
  }
  return `A művelet nem sikerült: ${error.message}`
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
    activeProjectsRes,
    leaderboardRes,
    categoriesRes,
    totalMembersRes,
    badgeTypesRes,
    myBadgesRes,
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
      .from('mm_otletek')
      .select('*, mm_otlet_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
      .eq('aktiv', true)
      .in('statusz', ['kozos_munka', 'megvalosult'])
      .order('updated_at', { ascending: false })
      .limit(12),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*')
      .order('osszpontszam', { ascending: false })
      .limit(3),
    supabase.from('mm_kategoriak').select('*').order('sorrend'),
    supabase
      .from('mm_felhasznalo_statisztika')
      .select('*', { count: 'exact', head: true }),
    supabase.from('mm_jelveny_tipusok').select('*').order('sorrend'),
    supabase
      .from('mm_felhasznalo_jelveny')
      .select('*, mm_jelveny_tipusok(*)')
      .eq('user_id', userId),
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

  const myProjects = ((activeProjectsRes.data || []) as unknown as WorkshopIdea[])
    .filter((idea) => idea.otletgazda_id === userId || myJoinIds.has(idea.id))
    .slice(0, 3)

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
    myProjects,
    badgeCatalog: (badgeTypesRes.data || []) as WorkshopBadgeType[],
    myBadges: (myBadgesRes.data || []) as unknown as WorkshopBadge[],
  }
}

export async function loadMaterialsPage(search?: string, categoryId?: number) {
  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const normalizedSearch = search?.trim() || null
  if (normalizedSearch && normalizedSearch.length > 100) {
    return { error: 'A keresés legfeljebb 100 karakter lehet.' }
  }
  if (categoryId !== undefined && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    return { error: 'Érvénytelen témakör.' }
  }

  const [materialsResult, categoriesResult, ownRatingsResult] = await Promise.all([
    supabase.rpc('mm_list_segedanyagok', {
      p_search: normalizedSearch,
      p_category_id: categoryId || null,
    }),
    supabase.from('mm_kategoriak').select('*').order('sorrend'),
    supabase
      .from('mm_segedanyag_ertekelesek')
      .select('segedanyag_id, pontszam')
      .eq('user_id', userId),
  ])

  if (materialsResult.error) {
    if (materialsResult.error.code === '42883' || materialsResult.error.code === 'PGRST202') {
      return { error: 'A segédanyaglista adatbázis-migrációja még nem futott le.' }
    }
    return { error: materialsResult.error.message }
  }
  if (categoriesResult.error) return { error: categoriesResult.error.message }
  if (ownRatingsResult.error) return { error: ownRatingsResult.error.message }

  const materialRows = (materialsResult.data || []) as unknown as Omit<WorkshopMaterial, 'sajat_ertekeles'>[]
  const categories = categoriesResult.data
  const ownRatings = ownRatingsResult.data

  const ownRatingMap = new Map(
    (ownRatings || []).map((rating) => [rating.segedanyag_id, rating.pontszam]),
  )

  const listedMaterials: WorkshopMaterial[] = materialRows.map((material) => ({
    ...material,
    sajat_ertekeles: ownRatingMap.get(material.id) ?? null,
  }))

  return {
    // Az RPC már az adatbázisban 420 karakterre rövidíti a kivonatot, de a
    // keresést a teljes törzsön végzi. A teljes anyag csak kinyitáskor érkezik.
    materials: listedMaterials,
    categories: (categories || []) as WorkshopCategory[],
  }
}

export async function loadMaterialDetail(materialId: string) {
  const safeMaterialId = parseWorkshopUuid(materialId)
  if (!safeMaterialId) return { error: 'Érvénytelen segédanyag-azonosító.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: material, error } = await supabase
    .from('mm_segedanyagok')
    .select('*, mm_segedanyag_kategoriak(kategoria_id, mm_kategoriak(nev, ikon, szin))')
    .eq('id', safeMaterialId)
    .eq('aktiv', true)
    .maybeSingle()

  if (error) return { error: error.message }
  if (!material) return { error: 'A segédanyag nem található vagy már archivált.' }

  const { data: ownRating, error: ownRatingError } = await supabase
    .from('mm_segedanyag_ertekelesek')
    .select('pontszam')
    .eq('segedanyag_id', safeMaterialId)
    .eq('user_id', userId)
    .maybeSingle()

  if (ownRatingError) return { error: ownRatingError.message }

  return {
    material: {
      ...(material as unknown as Omit<WorkshopMaterial, 'sajat_ertekeles'>),
      sajat_ertekeles: ownRating?.pontszam ?? null,
    } satisfies WorkshopMaterial,
  }
}

export async function recordMaterialDownload(materialId: string) {
  const safeMaterialId = parseWorkshopUuid(materialId)
  if (!safeMaterialId) return { error: 'Érvénytelen segédanyag-azonosító.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data, error } = await supabase.rpc('mm_record_material_download', {
    p_material_id: safeMaterialId,
  })

  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') {
      return { error: 'A letöltésszámláló adatbázis-migrációja még nem futott le.' }
    }
    return { error: workflowErrorMessage(error) }
  }

  return { success: true, downloadCount: Number(data || 0) }
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
  const safeMaterialId = parseWorkshopUuid(materialId)
  const safeRating = z.number().int().min(1).max(5).safeParse(pontszam)
  if (!safeMaterialId || !safeRating.success) return { error: 'Érvénytelen értékelés.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (velemeny && velemeny.length > 1000) {
    return { error: 'A vélemény túl hosszú (max 1000 karakter).' }
  }

  // Ellenőrzés: a segédanyag létezik és aktív
  const { data: material, error: materialError } = await supabase
    .from('mm_segedanyagok')
    .select('id, aktiv, feltolto_id')
    .eq('id', safeMaterialId)
    .maybeSingle()
  if (materialError) return { error: materialError.message }
  if (!material || !material.aktiv) {
    return { error: 'A segédanyag nem található.' }
  }
  const isOwnMaterial = material.feltolto_id === userId

  const { data: existing, error: existingError } = await supabase
    .from('mm_segedanyag_ertekelesek')
    .select('id')
    .eq('segedanyag_id', safeMaterialId)
    .eq('user_id', userId)
    .maybeSingle()
  if (existingError) return { error: existingError.message }

  let isNewRating = false

  if (existing) {
    const { error } = await supabase
      .from('mm_segedanyag_ertekelesek')
      .update({ pontszam: safeRating.data, velemeny: velemeny?.trim() || null })
      .eq('id', existing.id)
      .eq('user_id', userId) // belt-and-braces: RLS védelem mellett
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('mm_segedanyag_ertekelesek').insert({
      segedanyag_id: safeMaterialId,
      user_id: userId,
      pontszam: safeRating.data,
      velemeny: velemeny?.trim() || null,
    })
    if (error) {
      // Race condition (UNIQUE index): double rating attempt
      if (error.code === '23505') {
        return { error: 'Ezt a segédanyagot már értékelted.' }
      }
      return { error: error.message }
    }
    isNewRating = true
  }

  // Az átlagot és a darabszámot az értékelés INSERT/UPDATE tranzakciójában
  // futó DB-trigger frissíti. Itt már csak az autoritatív eredményt olvassuk.
  const { data: aggregate, error: aggregateError } = await supabase
    .from('mm_segedanyagok')
    .select('atlag_ertekeles, ertekelesek_szama')
    .eq('id', safeMaterialId)
    .single()
  if (aggregateError) return { error: aggregateError.message }

  const averageRating = aggregate.atlag_ertekeles === null
    ? null
    : Number(aggregate.atlag_ertekeles)
  const ratingCount = Number(aggregate.ertekelesek_szama || 0)

  const reward = isNewRating && !isOwnMaterial
    ? await awardMissionEvent(userId, 'ertekeles_adva', safeMaterialId)
    : null

  revalidateWorkshopMaterials()
  return {
    success: true,
    reward,
    ownTestRating: isOwnMaterial,
    averageRating,
    ratingCount,
  }
}

export async function deleteMaterial(materialId: string) {
  const safeMaterialId = parseWorkshopUuid(materialId)
  if (!safeMaterialId) return { error: 'Érvénytelen segédanyag-azonosító.' }

  const { supabase, userId, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: material } = await supabase
    .from('mm_segedanyagok')
    .select('id, feltolto_id, aktiv')
    .eq('id', safeMaterialId)
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
    .eq('id', safeMaterialId)
  if (error) return { error: error.message }

  revalidateWorkshopMaterials()
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
  const safeIdeaId = parseWorkshopUuid(ideaId)
  if (!safeIdeaId) return { error: 'Érvénytelen ötletazonosító.' }

  const { supabase } = await getWorkshopAccess()
  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, aktiv')
    .eq('id', safeIdeaId)
    .maybeSingle()
  if (!idea?.aktiv) return { error: 'Az ötlet nem található vagy inaktív.' }

  const { data, error } = await supabase
    .from('mm_hozzaszolasok')
    .select('*')
    .eq('otlet_id', safeIdeaId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return { data: (data || []) as WorkshopComment[] }
}

/** Az ötletgazda egyszer elindítja a pontosan 14 napos támogatási időszakot.
 * A dátumokat kizárólag a DB-trigger írja. */
export async function startIdeaVoting(ideaId: string) {
  const safeIdeaId = parseWorkshopUuid(ideaId)
  if (!safeIdeaId) return { error: 'Érvénytelen ötletazonosító.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea, error: ideaError } = await supabase
    .from('mm_otletek')
    .select(
      'id, aktiv, otletgazda_id, statusz, szavazas_kezdete, szavazas_vege, revision',
    )
    .eq('id', safeIdeaId)
    .maybeSingle()

  if (ideaError) return { error: workflowErrorMessage(ideaError) }
  if (!idea || !idea.aktiv) return { error: 'Az ötlet nem található vagy inaktív.' }
  if (idea.otletgazda_id !== userId) {
    return { error: 'Csak az ötletgazda indíthat szavazást.' }
  }

  if (idea.statusz !== 'uj') {
    return { error: 'Ehhez az ötlethez a 14 napos szavazást már elindították.' }
  }

  const { data: updated, error } = await supabase
    .from('mm_otletek')
    .update({ statusz: 'szavazas' })
    .eq('id', safeIdeaId)
    .eq('statusz', idea.statusz)
    .eq('revision', idea.revision)
    .select('statusz, szavazas_kezdete, szavazas_vege')
    .maybeSingle()

  if (error) return { error: workflowErrorMessage(error) }
  if (!updated) {
    return {
      error: 'Az ötlet közben megváltozott. Frissítsd az oldalt, majd próbáld újra.',
    }
  }

  revalidateWorkshopIdea(safeIdeaId)
  return {
    success: true,
    voteStart: updated.szavazas_kezdete,
    voteEnd: updated.szavazas_vege,
  }
}

/** A közös projekt csak legalább egy, maradéktalanul kész feladattal zárható.
 * A szerveres előellenőrzés barátságos hibát ad; a DB-trigger a végső kapu. */
export async function markIdeaRealized(ideaId: string) {
  const safeIdeaId = parseWorkshopUuid(ideaId)
  if (!safeIdeaId) return { error: 'Érvénytelen projektazonosító.' }

  const { supabase, userId, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea, error: ideaError } = await supabase
    .from('mm_otletek')
    .select('id, aktiv, otletgazda_id, statusz, revision')
    .eq('id', safeIdeaId)
    .maybeSingle()

  if (ideaError) return { error: workflowErrorMessage(ideaError) }
  if (!idea || !idea.aktiv) return { error: 'A projekt nem található vagy inaktív.' }
  if (idea.otletgazda_id !== userId && !isAdmin) {
    return { error: 'Csak az ötletgazda vagy rendszergazda zárhatja le a projektet.' }
  }
  if (idea.statusz !== 'kozos_munka') {
    return { error: 'Csak közös munka állapotú projekt jelölhető megvalósultnak.' }
  }

  const { data: tasks, error: taskError } = await supabase
    .from('mm_feladatok')
    .select('id, statusz')
    .eq('otlet_id', safeIdeaId)

  if (taskError) return { error: `A feladatok ellenőrzése sikertelen: ${taskError.message}` }
  if (!tasks?.length) {
    return { error: 'A lezáráshoz előbb hozzatok létre legalább egy feladatot.' }
  }

  const unfinishedCount = tasks.filter((task) => task.statusz !== 'kesz').length
  if (unfinishedCount > 0) {
    return {
      error: `Még ${unfinishedCount} feladat nincs kész. A projekt ezek lezárása után valósítható meg.`,
    }
  }

  const { data: updated, error } = await supabase
    .from('mm_otletek')
    .update({ statusz: 'megvalosult' })
    .eq('id', safeIdeaId)
    .eq('statusz', 'kozos_munka')
    .eq('revision', idea.revision)
    .select('id, statusz')
    .maybeSingle()

  if (error) return { error: workflowErrorMessage(error) }
  if (!updated) {
    return {
      error: 'A projekt vagy valamelyik feladat közben megváltozott. Frissítsd az oldalt.',
    }
  }

  const reward = await awardMissionEvent(
    idea.otletgazda_id,
    'otlet_megvalosult',
    safeIdeaId,
  )
  revalidateWorkshopIdea(safeIdeaId)
  return { success: true, reward, taskCount: tasks.length }
}

export async function saveIdeaComment(ideaId: string, text: string, parentId?: string | null) {
  const safeIdeaId = parseWorkshopUuid(ideaId)
  const safeParentId = parentId ? parseWorkshopUuid(parentId) : null
  if (typeof text !== 'string') return { error: 'Érvénytelen hozzászólás.' }
  if (!safeIdeaId || (parentId && !safeParentId)) {
    return { error: 'Érvénytelen hozzászólás-azonosító.' }
  }

  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!text.trim()) return { error: 'Az üzenet nem lehet üres.' }
  if (text.length > 5000) return { error: 'A hozzászólás túl hosszú (max 5000 karakter).' }

  // Ellenőrzés: az ötlet létezik és aktív
  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, aktiv')
    .eq('id', safeIdeaId)
    .maybeSingle()
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található vagy már archivált.' }
  }

  // Ha parentId meg van adva, ellenőrizzük, hogy ugyanahhoz az ötlethez tartozik
  if (safeParentId) {
    const { data: parent } = await supabase
      .from('mm_hozzaszolasok')
      .select('otlet_id')
      .eq('id', safeParentId)
      .maybeSingle()
    if (!parent || parent.otlet_id !== safeIdeaId) {
      return { error: 'Érvénytelen szülő hozzászólás.' }
    }
  }

  const { data: insertedComment, error } = await supabase
    .from('mm_hozzaszolasok')
    .insert({
      otlet_id: safeIdeaId,
      user_id: userId,
      user_nev: fullName,
      user_gyulekezet: congregationName,
      szoveg: text.trim(),
      szulo_id: safeParentId,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const reward = await awardMissionEvent(userId, 'hozzaszolas', insertedComment.id)
  revalidateWorkshopIdea(safeIdeaId)
  return { success: true, reward }
}

export async function toggleIdeaJoin(ideaId: string) {
  const safeIdeaId = parseWorkshopUuid(ideaId)
  if (!safeIdeaId) return { error: 'Érvénytelen ötletazonosító.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea, error: ideaError } = await supabase
    .from('mm_otletek')
    .select('id, aktiv, otletgazda_id, statusz')
    .eq('id', safeIdeaId)
    .maybeSingle()
  if (ideaError) return { error: workflowErrorMessage(ideaError) }
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található.' }
  }
  if (idea.otletgazda_id === userId) {
    return { error: 'Az ötletgazda automatikusan a projektcsapat tagja.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', safeIdeaId)
    .eq('user_id', userId)
    .eq('tipus', 'csatlakozas')
    .maybeSingle()

  if (existingError) return { error: existingError.message }

  if (existing) {
    if (idea.statusz !== 'kozos_munka') {
      return { error: 'Lezárt projekt csapattagsága már nem módosítható.' }
    }

    const { error } = await supabase.from('mm_szavazatok').delete().eq('id', existing.id)
    if (error) return { error: workflowErrorMessage(error) }
    revalidateWorkshopIdea(safeIdeaId)
    return { success: true, joined: false }
  }

  if (idea.statusz !== 'kozos_munka') {
    return { error: 'Csatlakozni akkor lehet, amikor az ötlet közös munkává érett.' }
  }

  const { error } = await supabase
    .from('mm_szavazatok')
    .insert({ otlet_id: safeIdeaId, user_id: userId, tipus: 'csatlakozas' })

  if (error) {
    // Duplicate key violation → már csatlakozott
    if (error.code === '23505') {
      return { error: 'Már csatlakoztál ehhez az ötlethez.' }
    }
    return { error: workflowErrorMessage(error) }
  }

  const reward = await awardMissionEvent(userId, 'csatlakozas', safeIdeaId)
  revalidateWorkshopIdea(safeIdeaId)
  return { success: true, joined: true, reward }
}

export async function supportIdea(ideaId: string) {
  const safeIdeaId = parseWorkshopUuid(ideaId)
  if (!safeIdeaId) return { error: 'Érvénytelen ötletazonosító.' }

  const { supabase, userId } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea, error: ideaError } = await supabase
    .from('mm_otletek')
    .select('id, aktiv, otletgazda_id, statusz, szavazas_kezdete, szavazas_vege')
    .eq('id', safeIdeaId)
    .maybeSingle()
  if (ideaError) return { error: workflowErrorMessage(ideaError) }
  if (!idea || !idea.aktiv) {
    return { error: 'Az ötlet nem található.' }
  }
  if (idea.otletgazda_id === userId) {
    return { error: 'A saját ötletedet nem támogathatod.' }
  }

  const now = Date.now()
  const voteStart = idea.szavazas_kezdete
    ? new Date(idea.szavazas_kezdete).getTime()
    : Number.NaN
  const voteEnd = idea.szavazas_vege
    ? new Date(idea.szavazas_vege).getTime()
    : Number.NaN
  if (
    idea.statusz !== 'szavazas' ||
    !Number.isFinite(voteStart) ||
    !Number.isFinite(voteEnd) ||
    now < voteStart ||
    now >= voteEnd
  ) {
    return { error: 'Támogatni csak az aktív, 14 napos szavazás alatt lehet.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', safeIdeaId)
    .eq('user_id', userId)
    .eq('tipus', 'tamogatas')
    .maybeSingle()

  if (existingError) return { error: existingError.message }
  if (existing) return { error: 'Ezt az ötletet már támogatod.' }

  const { error } = await supabase
    .from('mm_szavazatok')
    .insert({ otlet_id: safeIdeaId, user_id: userId, tipus: 'tamogatas' })

  if (error) {
    // UNIQUE constraint violation (race condition ellen)
    if (error.code === '23505') {
      return { error: 'Ezt az ötletet már támogatod.' }
    }
    return { error: workflowErrorMessage(error) }
  }

  const reward = await awardMissionEvent(userId, 'szavazat_adva', safeIdeaId)
  const { data: updatedIdea } = await supabase
    .from('mm_otletek')
    .select('statusz, tamogatasok_szama')
    .eq('id', safeIdeaId)
    .maybeSingle()

  revalidateWorkshopIdea(safeIdeaId)
  return {
    success: true,
    reward,
    promoted: updatedIdea?.statusz === 'kozos_munka',
    supportCount: updatedIdea?.tamogatasok_szama || 0,
  }
}

export type MaterialSaveInput = z.input<typeof materialSaveSchema>

export async function saveMissionMaterial(data: MaterialSaveInput) {
  const parsed = materialSaveSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen segédanyag-adatok.' }
  }

  const input = parsed.data
  const safeMaterialId = input.materialId || null
  const categoryIds = Array.from(new Set(input.kategoriaIds))
  const { supabase, userId, isAdmin } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }

  if (safeMaterialId) {
    const { data: existing, error: existingError } = await supabase
      .from('mm_segedanyagok')
      .select('id, feltolto_id, updated_at')
      .eq('id', safeMaterialId)
      .maybeSingle()

    if (existingError) return { error: existingError.message }
    if (!existing) return { error: 'A segédanyag nem található.' }
    if (existing.feltolto_id !== userId && !isAdmin) {
      return { error: 'Csak a feltöltő vagy rendszergazda szerkesztheti ezt a segédanyagot.' }
    }
  }

  const { data: saved, error } = await supabase
    .rpc('mm_save_segedanyag_atomic', {
      p_material_id: safeMaterialId,
      p_expected_updated_at: input.expectedUpdatedAt || null,
      p_cim: input.cim,
      p_leiras: input.leiras,
      p_forras_url: input.forrasUrl || null,
      p_forras_nev: input.forrasNev || null,
      p_formatum: input.formatum,
      p_kategoria_ids: categoryIds,
    })
    .single()

  if (error) {
    if (error.code === '40001') {
      return { error: 'A segédanyagot közben valaki módosította. Frissítsd az oldalt, majd próbáld újra.' }
    }
    if (error.code === '42883' || error.code === 'PGRST202') {
      return { error: 'A segédanyag-szerkesztő adatbázis-migrációja még nem futott le.' }
    }
    return { error: workflowErrorMessage(error) }
  }

  const savedMaterial = saved as {
    material_id: string
    material_updated_at: string
    was_created: boolean
  }
  const reward = savedMaterial.was_created
    ? await awardMissionEvent(userId, 'segedanyag_feltoltes', savedMaterial.material_id)
    : null

  revalidateWorkshopMaterials()
  return {
    success: true,
    materialId: savedMaterial.material_id,
    updatedAt: savedMaterial.material_updated_at,
    created: savedMaterial.was_created,
    reward,
  }
}

/** Kompatibilitási belépési pont a korábbi feltöltő komponenseknek. */
export async function shareMissionMaterial(data: {
  cim: string
  leiras: string
  kategoriaIds: number[]
  forrasUrl?: string
  forrasNev?: string
  formatum?: string
}) {
  return saveMissionMaterial({
    ...data,
    materialId: null,
    expectedUpdatedAt: null,
    formatum: materialFormatSchema.safeParse(data.formatum).success
      ? (data.formatum as z.infer<typeof materialFormatSchema>)
      : 'link',
  })
}

export async function submitMissionIdea(data: {
  cim: string
  leiras: string
  kategoriaIds: number[]
  celcsoport?: string
  becsultIdo?: string
}) {
  const allowedTargetGroups = ['Fiatalok', 'Felnőttek', 'Idősek', 'Családok', 'Gyerekek', 'Mindenki']
  const allowedDurations = ['1 hónap', '2-3 hónap', 'Fél év', 'Folyamatos']
  const { supabase, userId, fullName, congregationName } = await getWorkshopAccess()
  if (!userId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!data.cim.trim() || !data.leiras.trim()) {
    return { error: 'A cím és a leírás kötelező.' }
  }
  if (data.cim.length > 200) return { error: 'A cím túl hosszú (max 200 karakter).' }
  if (data.leiras.length > 5000) return { error: 'A leírás túl hosszú (max 5000 karakter).' }
  if (!data.celcsoport || !allowedTargetGroups.includes(data.celcsoport)) {
    return { error: 'Válassz érvényes célcsoportot.' }
  }
  if (!data.becsultIdo || !allowedDurations.includes(data.becsultIdo)) {
    return { error: 'Válassz érvényes becsült időt.' }
  }

  const { data: inserted, error } = await supabase
    .from('mm_otletek')
    .insert({
      cim: data.cim.trim(),
      leiras: data.leiras.trim(),
      celcsoport: data.celcsoport,
      becsult_ido: data.becsultIdo,
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

  const reward = await awardMissionEvent(userId, 'otlet_bekuldve', inserted.id)
  revalidatePath('/misszios-muhely')
  return { success: true, ideaId: inserted.id, reward }
}
