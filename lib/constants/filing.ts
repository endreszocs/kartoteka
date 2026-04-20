export const FILING_DIRECTIONS = ['incoming', 'outgoing'] as const
export type FilingDirection = typeof FILING_DIRECTIONS[number]

export const FILING_DIRECTION_LABELS: Record<FilingDirection, string> = { incoming: 'Érkező', outgoing: 'Kimenő' }

export const FILING_FOLDERS = ['F.Á.', 'É.Á.', 'A.K.'] as const
export type FilingFolder = typeof FILING_FOLDERS[number]

export const FILING_FOLDER_LABELS: Record<FilingFolder, string> = { 'F.Á.': 'Egyéb iratok', 'É.Á.': 'Éves adminisztráció', 'A.K.': 'Anyakönyvi' }

export interface FilingEntry {
  id: string // uuid PK!
  year: number
  sequence_number: number
  direction: string
  kelt: string
  subject: string
  sender_or_recipient: string | null
  file_folder: string
  targykivonat: string | null
  elintezes_ideje: string | null
  elintezes_modja: string | null
  irattarijel: string | null
  megjegyzes: string | null
  deleted: boolean
}
