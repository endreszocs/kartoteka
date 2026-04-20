/**
 * Dokumentum típusok és konstansok a workflow rendszerhez.
 * Külön fájlban, mert 'use server' fájlból nem exportálható const/type.
 */

export type DocumentType =
  | 'szamadas'
  | 'koltsegvetes'
  | 'koltsegvetes_modositas'
  | 'vagyonleltar'
  | 'valasztok_nevjegyzeke'

export type DocumentStatus = 'submitted' | 'received' | 'reviewed' | 'finalized'

export interface DocumentSubmission {
  id: string
  congregation_id: string
  congregation_name?: string
  diocese_id: string | null
  year: number
  document_type: DocumentType
  modification_number: number | null
  status: DocumentStatus
  submitted_at: string
  finalized_at: string | null
  forwarded_to_kerulet: boolean
  notes: string | null
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  szamadas: 'Számadás',
  koltsegvetes: 'Költségvetés',
  koltsegvetes_modositas: 'Költségvetés módosítás',
  vagyonleltar: 'Vagyonleltári jelentés',
  valasztok_nevjegyzeke: 'Választók névjegyzéke',
}

// Feloldási kérelem típus (az egyházmegyei actions.ts-ből kiemelve)
export interface UnlockRequest {
  congregationId: string
  congregationName: string
  year: string
  type: 'budget' | 'accounting' | 'inventory'
  reason: string | null
  requestedAt: string | null
}

export const DOCUMENT_DEADLINES: Record<DocumentType, string> = {
  szamadas: 'Január 31.',
  koltsegvetes: 'Január 31.',
  koltsegvetes_modositas: 'Év közben (opcionális)',
  vagyonleltar: 'Január 31.',
  valasztok_nevjegyzeke: 'Május 31.',
}
