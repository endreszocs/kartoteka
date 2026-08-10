'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import type { MissionRewardOutcome } from '@/lib/missions/gamification'
import { awardMissionEvent } from '@/lib/missions/reward-server'
import {
  TASK_STATUS,
  type ProjectCollaborator,
  type ProjectData,
  type ProjectDocument,
  type ProjectMilestone,
  type ProjectTask,
} from '@/lib/missions/project'
import { getProfileDisplayNames } from '@/lib/profiles/officials'

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

const projectUuidSchema = z.string().uuid('Érvénytelen projektazonosító.')

// ─────────────────────────────────────────────────────────────────
// Gamifikáció — feladat teljesítéshez
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Jogosultság ellenőrzés
// ─────────────────────────────────────────────────────────────────

interface ProjectAccess {
  isOwner: boolean
  isMember: boolean
  isAdmin: boolean
  canEdit: boolean // owner VAGY member VAGY admin
  ideaStatus: string | null
  ideaOwnerId: string
  userId: string
}

async function checkProjectAccess(ideaId: string): Promise<{ access?: ProjectAccess; error?: string }> {
  const parsedIdeaId = projectUuidSchema.safeParse(ideaId)
  if (!parsedIdeaId.success) return { error: parsedIdeaId.error.issues[0]?.message }

  const { supabase, user, profile } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { data: idea } = await supabase
    .from('mm_otletek')
    .select('id, otletgazda_id, statusz, aktiv')
    .eq('id', parsedIdeaId.data)
    .maybeSingle()

  if (!idea || !idea.aktiv) return { error: 'Az ötlet nem található.' }

  const isOwner = idea.otletgazda_id === user.id
  const isAdmin = profile?.status === 'active' && profile.role === 'admin'

  // Csapattag ellenőrzés
  const { data: membership } = await supabase
    .from('mm_szavazatok')
    .select('id')
    .eq('otlet_id', parsedIdeaId.data)
    .eq('user_id', user.id)
    .eq('tipus', 'csatlakozas')
    .maybeSingle()

  const isMember = !!membership

  return {
    access: {
      isOwner,
      isMember,
      isAdmin,
      canEdit:
        idea.statusz === 'kozos_munka' && (isOwner || isMember || isAdmin),
      ideaStatus: idea.statusz,
      ideaOwnerId: idea.otletgazda_id,
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
  const parsedIdeaId = projectUuidSchema.safeParse(ideaId)
  if (!parsedIdeaId.success) return { error: parsedIdeaId.error.issues[0]?.message }
  const safeIdeaId = parsedIdeaId.data

  const { supabase } = await getEffectiveAccessContext()

  // A szülőt előbb, az mm_otletek saját RLS-én keresztül ellenőrizzük.
  // Így közvetlen Server Action hívással sem olvashatók ki rejtett gyermekadatok.
  const { data: idea, error: ideaError } = await supabase
    .from('mm_otletek')
    .select('id, aktiv, otletgazda_id, otletgazda_nev, otletgazda_gyulekezet')
    .eq('id', safeIdeaId)
    .maybeSingle()

  if (ideaError) return { error: `Projekt lekérése: ${ideaError.message}` }
  if (!idea?.aktiv) return { error: 'A projekt nem található vagy inaktív.' }

  const [tasksRes, milestonesRes, documentsRes, collaboratorsRes] = await Promise.all([
    supabase
      .from('mm_feladatok')
      .select('*')
      .eq('otlet_id', safeIdeaId)
      .order('sorrend', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('mm_merfoldkovek')
      .select('*')
      .eq('otlet_id', safeIdeaId)
      .order('sorrend', { ascending: true })
      .order('hatarido', { ascending: true, nullsFirst: false }),
    supabase
      .from('mm_dokumentumok')
      .select('*')
      .eq('otlet_id', safeIdeaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('mm_szavazatok')
      .select('user_id, created_at')
      .eq('otlet_id', safeIdeaId)
      .eq('tipus', 'csatlakozas'),
  ])

  if (tasksRes.error) return { error: `Feladatok lekérése: ${tasksRes.error.message}` }
  if (milestonesRes.error) return { error: `Mérföldkövek lekérése: ${milestonesRes.error.message}` }
  if (documentsRes.error) return { error: `Dokumentumok lekérése: ${documentsRes.error.message}` }
  if (collaboratorsRes.error) return { error: `Csapat lekérése: ${collaboratorsRes.error.message}` }

  // Csapattagok kiegészítése profile adatokkal
  const collabUserIds = (collaboratorsRes.data || []).map(c => c.user_id)
  const ownerId = idea.otletgazda_id as string
  const allUserIds = Array.from(new Set([...collabUserIds, ownerId].filter(Boolean))) as string[]

  let profileMap: Record<string, { full_name: string | null; congregation_name: string | null }> = {}

  if (allUserIds.length > 0) {
    // 2026-08-11: a csapattagok nevének feloldása a `get_profile_display_names`
    // SECURITY DEFINER RPC-n megy (lib/profiles/officials.ts). Korábban ez
    // közvetlen, ORSZÁGOS `profiles`-olvasás volt (congregations-embeddel) —
    // emiatt nem lehetett a `profiles_read` policy-t szűkíteni. Az RPC csak
    // nevet + gyülekezet-nevet ad vissza, e-mailt nem.
    const nevek = await getProfileDisplayNames(supabase, allUserIds)
    profileMap = Object.fromEntries(
      Array.from(nevek.values()).map(n => [
        n.userId,
        { full_name: n.fullName, congregation_name: n.congregationName },
      ]),
    )
  }

  const collaborators: ProjectCollaborator[] = []

  // Ötletgazda mindig elöl (nem szerepel az mm_szavazatok-ban csatlakozóként)
  if (ownerId) {
    const ownerProfile = profileMap[ownerId]
    collaborators.push({
      user_id: ownerId,
      full_name: ownerProfile?.full_name || idea.otletgazda_nev || null,
      congregation_name: ownerProfile?.congregation_name || idea.otletgazda_gyulekezet || null,
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
  expected_revision: z.number().int().nonnegative().optional(),
  otlet_id: z.string().uuid(),
  cim: z.string().trim().min(1, 'A feladat címe kötelező').max(200),
  leiras: z.string().trim().max(2000).nullable().optional(),
  felelos_id: z.string().uuid().nullable().optional(),
  hatarido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sorrend: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (value.id && value.expected_revision === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['expected_revision'],
      message: 'A szerkesztési verzió hiányzik. Frissítsd a projektet.',
    })
  }
})

export async function saveTask(raw: unknown): Promise<{ success?: true; taskId?: string; error?: string }> {
  const parsed = taskSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  const { supabase } = await getEffectiveAccessContext()
  let targetIdeaId = input.otlet_id

  if (input.id) {
    const { data: existingTask, error: existingError } = await supabase
      .from('mm_feladatok')
      .select('id, otlet_id, revision')
      .eq('id', input.id)
      .maybeSingle()

    if (existingError) return { error: `Feladat ellenőrzése sikertelen: ${existingError.message}` }
    if (!existingTask) return { error: 'A feladat nem található.' }
    if (existingTask.otlet_id !== input.otlet_id) {
      return { error: 'Feladat nem helyezhető át másik projektbe.' }
    }
    if (Number(existingTask.revision) !== input.expected_revision) {
      return { error: 'A feladat közben megváltozott. Frissítsd a projektet.' }
    }
    targetIdeaId = existingTask.otlet_id
  }

  const { access, error: accessError } = await checkProjectAccess(targetIdeaId)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'Lezárt vagy még el nem indult projekt feladatai nem szerkeszthetők.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Feladatot az ötletgazda vagy rendszergazda szerkeszthet.' }
  }

  let assigneeName: string | null = null
  if (input.felelos_id) {
    if (input.felelos_id !== access.ideaOwnerId) {
      const { data: membership, error: membershipError } = await supabase
        .from('mm_szavazatok')
        .select('id')
        .eq('otlet_id', targetIdeaId)
        .eq('user_id', input.felelos_id)
        .eq('tipus', 'csatlakozas')
        .maybeSingle()

      if (membershipError) return { error: `Csapattagság ellenőrzése sikertelen: ${membershipError.message}` }
      if (!membership) {
        return { error: 'Feladatfelelős csak az ötletgazda vagy csatlakozott csapattag lehet.' }
      }
    }

    // 2026-08-11: a felelős neve is a `get_profile_display_names` RPC-ből jön —
    // a felelős egy MÁSIK gyülekezetbeli csapattag is lehet, amit korábban
    // csak a nyitott `profiles_read` policy engedett.
    const nevek = await getProfileDisplayNames(supabase, [input.felelos_id])
    assigneeName = nevek.get(input.felelos_id)?.fullName || null
  }

  const payload = {
    otlet_id: targetIdeaId,
    cim: input.cim.trim(),
    leiras: input.leiras?.trim() || null,
    felelos_id: input.felelos_id || null,
    felelos_nev: assigneeName,
    hatarido: input.hatarido || null,
    sorrend: input.sorrend ?? 0,
  }

  if (input.id) {
    const { data: updatedTask, error } = await supabase
      .from('mm_feladatok')
      .update(payload)
      .eq('id', input.id)
      .eq('otlet_id', targetIdeaId)
      .eq('revision', input.expected_revision as number)
      .select('id')
      .maybeSingle()
    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    if (!updatedTask) return { error: 'A feladat közben megváltozott. Frissítsd a projektet.' }
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

const taskStatusUpdateSchema = z.object({
  taskId: z.string().uuid('Érvénytelen feladatazonosító.'),
  newStatus: z.enum(TASK_STATUS),
  expectedStatus: z.enum(TASK_STATUS),
  expectedRevision: z.number().int().nonnegative(),
})

export async function updateTaskStatus(
  raw: unknown,
): Promise<{ success?: true; reward?: MissionRewardOutcome | null; error?: string }> {
  const parsed = taskStatusUpdateSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen státuszmódosítás.' }
  }
  const input = parsed.data

  const { supabase } = await getEffectiveAccessContext()

  // Először lekérjük a feladatot — kell az otlet_id és a felelos_id is
  const { data: task } = await supabase
    .from('mm_feladatok')
    .select('id, otlet_id, felelos_id, statusz, revision')
    .eq('id', input.taskId)
    .maybeSingle()

  if (!task) return { error: 'A feladat nem található.' }
  if (
    task.statusz !== input.expectedStatus ||
    Number(task.revision) !== input.expectedRevision
  ) {
    return { error: 'A feladat állapota közben megváltozott. Frissítsd a projektet.' }
  }

  const { access, error: accessError } = await checkProjectAccess(task.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt feladatai már nem módosíthatók.' }

  // Státusz módosítás: a felelős VAGY az ötletgazda VAGY admin
  const canModify = access.isOwner || access.isAdmin || task.felelos_id === access.userId
  if (!canModify) {
    return { error: 'Csak a felelős, az ötletgazda vagy admin módosíthatja a státuszt.' }
  }

  const { data: updatedTask, error } = await supabase
    .from('mm_feladatok')
    .update({ statusz: input.newStatus })
    .eq('id', input.taskId)
    .eq('statusz', input.expectedStatus)
    .eq('revision', input.expectedRevision)
    .select('id, teljesites_felelos_id')
    .maybeSingle()

  if (error) return { error: `Státusz módosítás sikertelen: ${error.message}` }
  if (!updatedTask) {
    return { error: 'A feladat állapota közben megváltozott. Frissítsd a projektet, és próbáld újra.' }
  }

  // Gamifikáció: ha most lett 'kesz' (eddig nem volt), és van felelős,
  // a felelős kap +10 pontot
  const reward =
    input.newStatus === 'kesz' &&
    input.expectedStatus !== 'kesz' &&
    updatedTask.teljesites_felelos_id
      ? await awardMissionEvent(
          updatedTask.teljesites_felelos_id,
          'feladat_teljesitve',
          task.id,
        )
      : null

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true, reward }
}

export async function deleteTask(taskId: string): Promise<{ success?: true; error?: string }> {
  const parsedTaskId = projectUuidSchema.safeParse(taskId)
  if (!parsedTaskId.success) return { error: 'Érvénytelen feladatazonosító.' }

  const { supabase } = await getEffectiveAccessContext()

  const { data: task } = await supabase
    .from('mm_feladatok')
    .select('id, otlet_id')
    .eq('id', parsedTaskId.data)
    .maybeSingle()

  if (!task) return { error: 'A feladat nem található.' }

  const { access, error: accessError } = await checkProjectAccess(task.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt feladatai már nem törölhetők.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Csak az ötletgazda vagy admin törölheti a feladatokat.' }
  }

  const { data: deletedTask, error } = await supabase
    .from('mm_feladatok')
    .delete()
    .eq('id', parsedTaskId.data)
    .select('id')
    .maybeSingle()
  if (error) return { error: `Törlés sikertelen: ${error.message}` }
  if (!deletedTask) return { error: 'A feladat közben megváltozott vagy már törölték.' }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// MÉRFÖLDKÖVEK (mm_merfoldkovek)
// ─────────────────────────────────────────────────────────────────

const milestoneSchema = z.object({
  id: z.string().uuid().optional(),
  expected_revision: z.number().int().nonnegative().optional(),
  otlet_id: z.string().uuid(),
  cim: z.string().trim().min(1, 'A mérföldkő címe kötelező').max(200),
  leiras: z.string().trim().max(2000).nullable().optional(),
  hatarido: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sorrend: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (value.id && value.expected_revision === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['expected_revision'],
      message: 'A szerkesztési verzió hiányzik. Frissítsd a projektet.',
    })
  }
})

export async function saveMilestone(raw: unknown): Promise<{ success?: true; milestoneId?: string; error?: string }> {
  const parsed = milestoneSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen adat.' }
  }
  const input = parsed.data

  const { supabase } = await getEffectiveAccessContext()
  let targetIdeaId = input.otlet_id

  if (input.id) {
    const { data: existingMilestone, error: existingError } = await supabase
      .from('mm_merfoldkovek')
      .select('id, otlet_id, revision')
      .eq('id', input.id)
      .maybeSingle()

    if (existingError) return { error: `Mérföldkő ellenőrzése sikertelen: ${existingError.message}` }
    if (!existingMilestone) return { error: 'A mérföldkő nem található.' }
    if (existingMilestone.otlet_id !== input.otlet_id) {
      return { error: 'Mérföldkő nem helyezhető át másik projektbe.' }
    }
    if (Number(existingMilestone.revision) !== input.expected_revision) {
      return { error: 'A mérföldkő közben megváltozott. Frissítsd a projektet.' }
    }
    targetIdeaId = existingMilestone.otlet_id
  }

  const { access, error: accessError } = await checkProjectAccess(targetIdeaId)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt mérföldkövei már nem szerkeszthetők.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Mérföldkövet az ötletgazda vagy rendszergazda szerkeszthet.' }
  }

  const payload = {
    otlet_id: targetIdeaId,
    cim: input.cim.trim(),
    leiras: input.leiras?.trim() || null,
    hatarido: input.hatarido || null,
    sorrend: input.sorrend ?? 0,
  }

  if (input.id) {
    const { data: updatedMilestone, error } = await supabase
      .from('mm_merfoldkovek')
      .update(payload)
      .eq('id', input.id)
      .eq('otlet_id', targetIdeaId)
      .eq('revision', input.expected_revision as number)
      .select('id')
      .maybeSingle()
    if (error) return { error: `Frissítés sikertelen: ${error.message}` }
    if (!updatedMilestone) return { error: 'A mérföldkő közben megváltozott. Frissítsd a projektet.' }
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

const milestoneToggleSchema = z.object({
  id: z.string().uuid('Érvénytelen mérföldkő-azonosító.'),
  expectedCompleted: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
})

export async function toggleMilestoneCompleted(raw: unknown): Promise<{ success?: true; error?: string }> {
  const parsed = milestoneToggleSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Érvénytelen mérföldkő-módosítás.' }
  }
  const input = parsed.data
  const { supabase } = await getEffectiveAccessContext()

  const { data: milestone } = await supabase
    .from('mm_merfoldkovek')
    .select('id, otlet_id, teljesitve, revision')
    .eq('id', input.id)
    .maybeSingle()

  if (!milestone) return { error: 'A mérföldkő nem található.' }
  if (
    milestone.teljesitve !== input.expectedCompleted ||
    Number(milestone.revision) !== input.expectedRevision
  ) {
    return { error: 'A mérföldkő közben megváltozott. Frissítsd a projektet.' }
  }

  const { access, error: accessError } = await checkProjectAccess(milestone.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt mérföldkövei már nem módosíthatók.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Mérföldkövet az ötletgazda vagy rendszergazda módosíthat.' }
  }

  const newTeljesitve = !input.expectedCompleted

  const { data: updatedMilestone, error } = await supabase
    .from('mm_merfoldkovek')
    .update({
      teljesitve: newTeljesitve,
      teljesitve_datum: newTeljesitve ? new Date().toISOString() : null,
    })
    .eq('id', input.id)
    .eq('teljesitve', input.expectedCompleted)
    .eq('revision', input.expectedRevision)
    .select('id')
    .maybeSingle()

  if (error) return { error: `Mérföldkő módosítás sikertelen: ${error.message}` }
  if (!updatedMilestone) return { error: 'A mérföldkő közben megváltozott. Frissítsd a projektet.' }
  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

export async function deleteMilestone(id: string): Promise<{ success?: true; error?: string }> {
  const parsedId = projectUuidSchema.safeParse(id)
  if (!parsedId.success) return { error: 'Érvénytelen mérföldkő-azonosító.' }

  const { supabase } = await getEffectiveAccessContext()

  const { data: milestone } = await supabase
    .from('mm_merfoldkovek')
    .select('id, otlet_id')
    .eq('id', parsedId.data)
    .maybeSingle()

  if (!milestone) return { error: 'A mérföldkő nem található.' }

  const { access, error: accessError } = await checkProjectAccess(milestone.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt mérföldkövei már nem törölhetők.' }
  if (!access.isOwner && !access.isAdmin) {
    return { error: 'Csak az ötletgazda vagy admin törölhet mérföldkövet.' }
  }

  const { data: deletedMilestone, error } = await supabase
    .from('mm_merfoldkovek')
    .delete()
    .eq('id', parsedId.data)
    .select('id')
    .maybeSingle()
  if (error) return { error: `Törlés sikertelen: ${error.message}` }
  if (!deletedMilestone) return { error: 'A mérföldkövet közben már törölték.' }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// DOKUMENTUMOK (mm_dokumentumok) — MVP: URL alapú (pl. Google Drive, Dropbox)
// ─────────────────────────────────────────────────────────────────

const documentSchema = z.object({
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
  const parsedId = projectUuidSchema.safeParse(id)
  if (!parsedId.success) return { error: 'Érvénytelen dokumentumazonosító.' }

  const { supabase } = await getEffectiveAccessContext()

  const { data: doc } = await supabase
    .from('mm_dokumentumok')
    .select('id, otlet_id, feltolto_id')
    .eq('id', parsedId.data)
    .maybeSingle()

  if (!doc) return { error: 'A dokumentum nem található.' }

  const { access, error: accessError } = await checkProjectAccess(doc.otlet_id)
  if (accessError || !access) return { error: accessError || 'Hozzáférés megtagadva.' }
  if (!access.canEdit) return { error: 'A lezárt projekt dokumentumai már nem törölhetők.' }

  // Feltöltő VAGY ötletgazda VAGY admin törölhet
  const canDelete = access.isOwner || access.isAdmin || doc.feltolto_id === access.userId
  if (!canDelete) {
    return { error: 'Csak a feltöltő, az ötletgazda vagy admin törölheti a dokumentumot.' }
  }

  const { data: deletedDocument, error } = await supabase
    .from('mm_dokumentumok')
    .delete()
    .eq('id', parsedId.data)
    .select('id')
    .maybeSingle()
  if (error) return { error: `Törlés sikertelen: ${error.message}` }
  if (!deletedDocument) return { error: 'A dokumentumot közben már törölték.' }

  revalidatePath(`/misszios-muhely/forum`)
  return { success: true }
}
