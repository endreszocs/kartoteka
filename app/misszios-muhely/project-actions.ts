'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMissionLevel,
  MISSION_POINT_RULES,
  type MissionPointEvent,
  type MissionUserStats,
} from '@/lib/missions/gamification'
import {
  TASK_STATUS,
  type ProjectCollaborator,
  type ProjectData,
  type ProjectDocument,
  type ProjectMilestone,
  type ProjectTask,
  type TaskStatus,
} from '@/lib/missions/project'

/**
 * Missziós Műhely — "Közös Munka" projekt server actions.
 *
 * Egy ötlet `statusz = 'kozos_munka'` állapotban kap egy projekt-réteget:
 *  - feladatok (mm_feladatok)
 *  - mérföldkövek (mm_merfoldkovek)
 *  - dokumentumok (mm_dokumentumok)
 *  - csapattagok (mm_szavazatok type='csatlakozas' + profiles JOIN)
 *
 * Hozzáférés-kezelés:
 *  - Olvasás: bárki aki a `mm_otletek`-et olvashatja (RLS-szel)
 *  - Írás (feladat/mérföldkő/dokumentum): az ötletgazda + a csapat tagjai + admin
 *  - Feladat státusz módosítás: a felelős VAGY az ötletgazda VAGY admin
 */

// ─────────────────────────────────────────────────────────────────
// URL validátor (document upload biztonsági védelem)
// ─────────────────────────────────────────────────────────────────

function isSafeHttpUrl(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────────
// Gamifikáció — feladat teljesítéshez
// ─────────────────────────────────────────────────────────────────

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

async function awardProjectPoints(userId: string, event: MissionPointEvent) {
  const adminClient = createAdminClient()
  if (!adminClient) {
    console.warn('[awardProjectPoints] SUPABASE_SERVICE_ROLE_KEY hiányzik')
    return
  }

  const rules = MISSION_POINT_RULES[event]

  const { data: existing } = await adminClient
    .from('mm_felhasznalo_statisztika')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const current = (existing as MissionUserStats | null) || { ...DEFAULT_STATS, user_id: userId }

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

  await adminClient
    .from('mm_felhasznalo_statisztika')
    .upsert(updated, { onConflict: 'user_id' })
}

// ─────────────────────────────────────────────────────────────────
// Jogosultság ellenőrzés
// ─────────────────────────────────────────────────────────────────

interface ProjectAccess {
  isOwner: boolean
  isMember: boolean
  isAdmin: boolean
  canEdit: boolean // owner VAGY member VAGY admin
  userId: string
}

async function checkProjectAccess(ideaId: string): Promise<{ access?: ProjectAccess; error?: string }> {
  const { supabase, user, admin, master } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, otletgazda_id, statusz, aktiv')
    .eq('id', ideaId)
    .maybeSingle()

  if (!idea || !idea.aktiv) return { error: 'Az ötlet nem található.' }

  const isOwner = idea.otletgazda_id === user.id
  const isAdmin = admin || master

  // Csapattag ellenőrzés
  const { data: membership } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', ideaId)
    .eq('user_id', user.id)
    .eq('tipus', 'csatlakozas')
    .maybeSingle()

  const isMember = !!membership

  return {
    access: {
      isOwner,
      isMember,
      isAdmin,
      canEdit: isOwner || isMember || isAdmin,
      userId: user.id,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// AGGREGÁLT LEKÉRÉS (getProjectData)
// ─────────────────────────────────────────────────────────────────

/**
 * Egy ötlethez tartozó teljes projekt-adatok lekérése: feladatok,
 * mérföldkövek, dokumentumok, csapattagok. A csapattagoknak a
 * `profiles.full_name`-t és a `congregations.nev_hu/name`-t is behúzza.
 */
export async function getProjectData(
  ideaId: string,
): Promise<{ data?: ProjectData; error?: string }> {
  const { supabase } = await getEffectiveAccessContext()

  // Párhuzamosan
  const [tasksRes, milestonesRes, documentsRes, collaboratorsRes, ideaRes] = await Promise.all([
    supabase
      .from('mm_feladatok')
      .select('*')
      .eq('otlet_id', ideaId)
      .order('sorrend', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('mm_merfoldkovek')
      .select('*')
      .eq('otlet_id', ideaId)
      .order('sorrend', { ascending: true })
      .order('hatarido', { ascending: true, nullsFirst: false }),
    supabase
      .from('mm_dokumentumok')
      .select('*')
      .eq('otlet_id', ideaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mm_szavazatok')
      .select('user_id, created_at')
      .eq('otlet_id', ideaId)
      .eq('tipus', 'csatlakozas'),
    supabase
      .from('mm_otletek')
      .select('otletgazda_id, otletgazda_nev, otletgazda_gyulekezet')
      .eq('id', ideaId)
      .maybeSingle(),
  ])

  if (tasksRes.error) return { error: `Feladatok lekérése: ${tasksRes.error.message}` }
  if (milestonesRes.error) return { error: `Mérföldkövek lekérése: ${milestonesRes.error.message}` }
  if (documentsRes.error) return { error: `Dokumentumok lekérése: ${documentsRes.error.message}` }
  if (collaboratorsRes.error) return { error: `Csapat lekérése: ${collaboratorsRes.error.message}` }

  // Csapattagok kiegészítése profile adatokkal
  const collabUserIds = (collaboratorsRes.data || []).map(c => c.user_id)
  const ownerId = ideaRes.data?.otletgazda_id as string | undefined
  const allUserIds = Array.from(new Set([...collabUserIds, ownerId].filter(Boolean))) as string[]

  let profileMap: Record<string, { full_name: string | null; congregation_name: string | null }> = {}

  if (allUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, congregations(nev_hu, name)')
      .in('id', allUserIds)

    type ProfileRow = {
      id: string
      full_name: string | null
      congregations: { nev_hu: string | null; name: string | null } | { nev_hu: string | null; name: string | null }[] | null
    }

    profileMap = Object.fromEntries(
      ((profiles || []) as ProfileRow[]).map(p => {
        const cong = Array.isArray(p.congregations) ? p.congregations[0] : p.congregations
        return [p.id, { full_name: p.full_name, congregation_name: cong?.nev_hu || cong?.name || null }]
      }),
    )
  }

  const collaborators: ProjectCollaborator[] = []

  // Ötletgazda mindig elöl (nem szerepel az mm_szavazatok-ban csatlakozóként)
  if (ownerId) {
    const ownerProfile = profileMap[ownerId]
    collaborators.push({
      user_id: ownerId,
      full_name: ownerProfile?.full_name || ideaRes.data?.otletgazda_nev || null,
      congregation_name: ownerProfile?.congregation_name || ideaRes.data?.otletgazda_gyulekezet || null,
      joined_at: '', // nem csatlakozás dátum
      isOwner: true,
    })
  }

  for (const c of collaboratorsRes.data || []) {
    if (c.user_id === ownerId) continue // duplikáció elkerülése
    const p = profileMap[c.user_id]
    collaborators.push({
      user_id: c.user_id,
      full_name: p?.full_name || null,
      congregation_name: p?.congregation_name || null,
      joined_at: c.created_at,
      isOwner: false,
    })
  }

  return {
    data: {
      tasks: (tasksRes.data || []) as ProjectTask[],
      milestones: (milestonesRes.data || []) as ProjectMilestone[],
      documents: (documentsRes.data || []) as ProjectDocument[],
      collaborators,
    },
  }
}

// ─────────────────────────────────────────────────────────────────
// FELADATOK (mm_feladatok)
// ─────────────────────────────────────────────────────────────────

const taskSchema = z.object({
  id: z.string().uuid().optional(),
  otlet_id: z.string().uuid(),
  cim: z.string().trim().min(1, 'A feladat címe kötelező').max(200),
  leiras: z.string().trim().max(2000).nullable().optional(),
  felelos_id: z.string().uuid().nullable().optional(),
  felelos_nev: z.string().trim().max(200).nullable().optional(),
  hatarido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sorrend: z.number().int().nonnegative().optional(),
})

export async function saveTask(raw: unknown): Promise<{ success?: true; taskId?: string; error?: string }> {
  const parsed = taskSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  const { access, error: accessError } = await checkProjectAccess(input.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'Csak a csapattagok szerkeszthetik a feladatokat.' }

  const { supabase } = await getEffectiveAccessContext()

  const payload = {
    otlet_id: input.otlet_id,
    cim: input.cim.trim(),
    leiras: input.leiras?.trim() || null,
    felelos_id: input.felelos_id || null,
    felelos_nev: input.felelos_nev?.trim() || null,
    hatarido: input.hatarido || null,
    sorrend: input.sorrend ?? 0,
  }

  if (input.id) {
    const { error } = await supabase.from('mm_feladatok').update(payload).eq('id', input.id)
    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    revalidatePath(`/misszios-muhely/forum`)
    return { success: true, taskId: input.id }
  }

  const { data, error } = await supabase
    .from('mm_feladatok')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: `Létrehozás sikertelen: ${error.message}` }
  revalidatePath(`/misszios-muhely/forum`)
  return { success: true, taskId: data.id }
}

export async function updateTaskStatus(input: {
  taskId: string
  newStatus: TaskStatus
}): Promise<{ success?: true; error?: string }> {
  if (!TASK_STATUS.includes(input.newStatus)) {
    return { error: 'Érvénytelen státusz.' }
  }

  const { supabase } = await getEffectiveAccessContext()

  // Először lekérjük a feladatot — kell az otlet_id és a felelos_id is
  const { data: task } = await supabase
    .from('mm_feladatok')
    .select('id, otlet_id, felelos_id, statusz')
    .eq('id', input.taskId)
    .maybeSingle()

  if (!task) return { error: 'A feladat nem található.' }

  const { access, error: accessError } = await checkProjectAccess(task.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }

  // Státusz módosítás: a felelős VAGY az ötletgazda VAGY admin
  const canModify = access.isOwner || access.isAdmin || task.felelos_id === access.userId
  if (!canModify) {
    return { error: 'Csak a felelős, az ötletgazda vagy admin módosíthatja a státuszt.' }
  }

  const alreadyDone = task.statusz === 'kesz'
  const { error } = await supabase
    .from('mm_feladatok')
    .update({ statusz: input.newStatus })
    .eq('id', input.taskId)

  if (error) return { error: `Státusz módosítás sikertelen: ${error.message}` }

  // Gamifikáció: ha most lett 'kesz' (eddig nem volt), és van felelős,
  // a felelős kap +10 pontot
  if (input.newStatus === 'kesz' && !alreadyDone && task.felelos_id) {
    await awardProjectPoints(task.felelos_id, 'feladat_teljesitve')
  }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

export async function deleteTask(taskId: string): Promise<{ success?: true; error?: string }> {
  const { supabase } = await getEffectiveAccessContext()

  const { data: task } = await supabase
    .from('mm_feladatok')
    .select('id, otlet_id')
    .eq('id', taskId)
    .maybeSingle()

  if (!task) return { error: 'A feladat nem található.' }

  const { access, error: accessError } = await checkProjectAccess(task.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Csak az ötletgazda vagy admin törölheti a feladatokat.' }
  }

  const { error } = await supabase.from('mm_feladatok').delete().eq('id', taskId)
  if (error) return { error: `Törlés sikertelen: ${error.message}` }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// MÉRFÖLDKÖVEK (mm_merfoldkovek)
// ─────────────────────────────────────────────────────────────────

const milestoneSchema = z.object({
  id: z.string().uuid().optional(),
  otlet_id: z.string().uuid(),
  cim: z.string().trim().min(1, 'A mérföldkő címe kötelező').max(200),
  leiras: z.string().trim().max(2000).nullable().optional(),
  hatarido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sorrend: z.number().int().nonnegative().optional(),
})

export async function saveMilestone(raw: unknown): Promise<{ success?: true; milestoneId?: string; error?: string }> {
  const parsed = milestoneSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  const { access, error: accessError } = await checkProjectAccess(input.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'Csak a csapattagok szerkeszthetik a mérföldköveket.' }

  const { supabase } = await getEffectiveAccessContext()

  const payload = {
    otlet_id: input.otlet_id,
    cim: input.cim.trim(),
    leiras: input.leiras?.trim() || null,
    hatarido: input.hatarido || null,
    sorrend: input.sorrend ?? 0,
  }

  if (input.id) {
    const { error } = await supabase.from('mm_merfoldkovek').update(payload).eq('id', input.id)
    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    revalidatePath(`/misszios-muhely/forum`)
    return { success: true, milestoneId: input.id }
  }

  const { data, error } = await supabase
    .from('mm_merfoldkovek')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: `Létrehozás sikertelen: ${error.message}` }
  revalidatePath(`/misszios-muhely/forum`)
  return { success: true, milestoneId: data.id }
}

export async function toggleMilestoneCompleted(id: string): Promise<{ success?: true; error?: string }> {
  const { supabase } = await getEffectiveAccessContext()

  const { data: milestone } = await supabase
    .from('mm_merfoldkovek')
    .select('id, otlet_id, teljesitve')
    .eq('id', id)
    .maybeSingle()

  if (!milestone) return { error: 'A mérföldkő nem található.' }

  const { access, error: accessError } = await checkProjectAccess(milestone.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'Csak a csapattagok módosíthatják a mérföldköveket.' }

  const newTeljesitve = !milestone.teljesitve

  const { error } = await supabase
    .from('mm_merfoldkovek')
    .update({
      teljesitve: newTeljesitve,
      teljesitve_datum: newTeljesitve ? new Date().toISOString() : null,
    })
    .eq('id', id)

  if (error) return { error: `Mérföldkő módosítás sikertelen: ${error.message}` }
  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

export async function deleteMilestone(id: string): Promise<{ success?: true; error?: string }> {
  const { supabase } = await getEffectiveAccessContext()

  const { data: milestone } = await supabase
    .from('mm_merfoldkovek')
    .select('id, otlet_id')
    .eq('id', id)
    .maybeSingle()

  if (!milestone) return { error: 'A mérföldkő nem található.' }

  const { access, error: accessError } = await checkProjectAccess(milestone.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Csak az ötletgazda vagy admin törölhet mérföldkövet.' }
  }

  const { error } = await supabase.from('mm_merfoldkovek').delete().eq('id', id)
  if (error) return { error: `Törlés sikertelen: ${error.message}` }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// DOKUMENTUMOK (mm_dokumentumok) — MVP: URL alapú (pl. Google Drive, Dropbox)
// ─────────────────────────────────────────────────────────────────

const documentSchema = z.object({
  id: z.string().uuid().optional(),
  otlet_id: z.string().uuid(),
  nev: z.string().trim().min(1, 'A dokumentum neve kötelező').max(200),
  url: z.string().trim().url('Érvénytelen URL'),
  meret: z.number().int().nonnegative().optional(),
  tipus: z.string().trim().max(100).nullable().optional(),
})

export async function saveDocument(raw: unknown): Promise<{ success?: true; documentId?: string; error?: string }> {
  const parsed = documentSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  if (!isSafeHttpUrl(input.url)) {
    return { error: 'Csak https:// vagy http:// protokollú URL engedélyezett.' }
  }

  const { access, error: accessError } = await checkProjectAccess(input.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'Csak a csapattagok adhatnak hozzá dokumentumokat.' }

  const { supabase, fullName } = await getEffectiveAccessContext()

  const payload = {
    otlet_id: input.otlet_id,
    nev: input.nev.trim(),
    url: input.url.trim(),
    meret: input.meret || 0,
    tipus: input.tipus?.trim() || null,
    feltolto_id: access.userId,
    feltolto_nev: fullName || null,
  }

  if (input.id) {
    const { error } = await supabase.from('mm_dokumentumok').update(payload).eq('id', input.id)
    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    revalidatePath(`/misszios-muhely/forum`)
    return { success: true, documentId: input.id }
  }

  const { data, error } = await supabase
    .from('mm_dokumentumok')
    .insert(payload)
    .select('id')
    .single()

  if (error) return { error: `Létrehozás sikertelen: ${error.message}` }
  revalidatePath(`/misszios-muhely/forum`)
  return { success: true, documentId: data.id }
}

export async function deleteDocument(id: string): Promise<{ success?: true; error?: string }> {
  const { supabase } = await getEffectiveAccessContext()

  const { data: doc } = await supabase
    .from('mm_dokumentumok')
    .select('id, otlet_id, feltolto_id')
    .eq('id', id)
    .maybeSingle()

  if (!doc) return { error: 'A dokumentum nem található.' }

  const { access, error: accessError } = await checkProjectAccess(doc.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }

  // Feltöltő VAGY ötletgazda VAGY admin törölhet
  const canDelete = access.isOwner || access.isAdmin || doc.feltolto_id === access.userId
  if (!canDelete) {
    return { error: 'Csak a feltöltő, az ötletgazda vagy admin törölheti a dokumentumot.' }
  }

  const { error } = await supabase.from('mm_dokumentumok').delete().eq('id', id)
  if (error) return { error: `Törlés sikertelen: ${error.message}` }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}
