/**
 * Missziós Műhely — "Közös Munka" projekt típusok és konstansok.
 *
 * Egy ötlet, amely elérte a "kozos_munka" státuszt, kap egy
 * projekt-rétget: feladatlista, mérföldkövek, dokumentumok,
 * csapattagok.
 *
 * Táblák (migration-docs/Database_schema.sql):
 *  - mm_feladatok — feladatok
 *  - mm_merfoldkovek — mérföldkövek
 *  - mm_dokumentumok — dokumentumok
 *  - mm_szavazatok (type='csatlakozas') — csapattagok
 */

// ─────────────────────────────────────────────────────────────────
// Feladat (mm_feladatok)
// ─────────────────────────────────────────────────────────────────

export const TASK_STATUS = ['fuggeben', 'folyamatban', 'kesz'] as const
export type TaskStatus = (typeof TASK_STATUS)[number]

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  fuggeben: 'Függőben',
  folyamatban: 'Folyamatban',
  kesz: 'Kész',
}

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  fuggeben: 'bg-slate-100 text-slate-700',
  folyamatban: 'bg-amber-50 text-amber-700',
  kesz: 'bg-emerald-50 text-emerald-700',
}

export const TASK_STATUS_BORDER: Record<TaskStatus, string> = {
  fuggeben: 'border-slate-200',
  folyamatban: 'border-amber-200',
  kesz: 'border-emerald-200',
}

export interface ProjectTask {
  id: string
  otlet_id: string
  cim: string
  leiras: string | null
  felelos_id: string | null
  felelos_nev: string | null
  hatarido: string | null
  statusz: TaskStatus
  teljesitve_at?: string | null
  teljesites_felelos_id?: string | null
  teljesites_hatarido?: string | null
  sorrend: number
  created_at: string
  revision: number
}

// ─────────────────────────────────────────────────────────────────
// Mérföldkő (mm_merfoldkovek)
// ─────────────────────────────────────────────────────────────────

export interface ProjectMilestone {
  id: string
  otlet_id: string
  cim: string
  leiras: string | null
  hatarido: string | null
  teljesitve: boolean
  teljesitve_datum: string | null
  sorrend: number
  created_at: string
  revision: number
}

// ─────────────────────────────────────────────────────────────────
// Dokumentum (mm_dokumentumok)
// ─────────────────────────────────────────────────────────────────

export interface ProjectDocument {
  id: string
  otlet_id: string
  nev: string
  url: string
  meret: number
  tipus: string | null
  feltolto_id: string
  feltolto_nev: string | null
  created_at: string
  revision: number
}

// ─────────────────────────────────────────────────────────────────
// Csapattag (mm_szavazatok JOIN profiles, type='csatlakozas')
// ─────────────────────────────────────────────────────────────────

export interface ProjectCollaborator {
  user_id: string
  full_name: string | null
  congregation_name: string | null
  joined_at: string
  isOwner: boolean // az ötletgazda is benne van, jelöljük
}

// ─────────────────────────────────────────────────────────────────
// Teljes projekt adatok (aggregált)
// ─────────────────────────────────────────────────────────────────

export interface ProjectData {
  tasks: ProjectTask[]
  milestones: ProjectMilestone[]
  documents: ProjectDocument[]
  collaborators: ProjectCollaborator[]
}

// ─────────────────────────────────────────────────────────────────
// Segédfüggvények
// ─────────────────────────────────────────────────────────────────

/**
 * Egy projekt előrehaladása (kidolgozottság %) a feladatok alapján.
 * Ha nincs feladat, visszaad 0-t.
 */
export function calculateProjectProgress(tasks: ProjectTask[]): number {
  if (!tasks.length) return 0
  const done = tasks.filter(t => t.statusz === 'kesz').length
  return Math.round((done / tasks.length) * 100)
}

/**
 * Egy mérföldkő "állapota" a határidő alapján:
 *  - 'teljesitve' — már kész
 *  - 'lejart' — határidő elmúlt és nincs kész
 *  - 'kozelgo' — 7 napon belüli
 *  - 'nyitott' — egyéb
 */
export type MilestoneState = 'teljesitve' | 'lejart' | 'kozelgo' | 'nyitott'

export function getMilestoneState(m: ProjectMilestone): MilestoneState {
  if (m.teljesitve) return 'teljesitve'
  if (!m.hatarido) return 'nyitott'
  const now = new Date()
  const deadline = new Date(m.hatarido)
  const diffDays = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'lejart'
  if (diffDays <= 7) return 'kozelgo'
  return 'nyitott'
}

export const MILESTONE_STATE_LABELS: Record<MilestoneState, string> = {
  teljesitve: 'Teljesítve',
  lejart: 'Lejárt',
  kozelgo: 'Közelgő',
  nyitott: 'Nyitott',
}

export const MILESTONE_STATE_COLORS: Record<MilestoneState, string> = {
  teljesitve: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  lejart: 'bg-red-50 text-red-700 ring-red-200',
  kozelgo: 'bg-amber-50 text-amber-700 ring-amber-200',
  nyitott: 'bg-slate-50 text-slate-600 ring-slate-200',
}

/**
 * Formattáz egy fájlméretet ember-olvashatóan (KB, MB).
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Fájl MIME-típus kategorizálása (ikon választáshoz).
 */
export type DocumentCategory = 'pdf' | 'kep' | 'doc' | 'tabla' | 'egyeb'

export function categorizeDocumentType(tipus: string | null): DocumentCategory {
  if (!tipus) return 'egyeb'
  const t = tipus.toLowerCase()
  if (t.includes('pdf')) return 'pdf'
  if (t.includes('image') || t.includes('kep')) return 'kep'
  if (t.includes('word') || t.includes('doc')) return 'doc'
  if (t.includes('excel') || t.includes('sheet') || t.includes('xls')) return 'tabla'
  return 'egyeb'
}
