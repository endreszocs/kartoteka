/**
 * szemely-remove — a tag-kivezetés (négyutas: elhunyt / elköltözött /
 * kitért / végleges törlés) KÖZÖS sémája és szótára.
 *
 * 2026-08-15 (desktop-paritás 2. szelet — „A törlés egy nyelvet beszéljen"):
 * ezek a definíciók eddig az apps/web/lib/constants/members.ts és
 * apps/web/lib/validations/members.ts fájlokban éltek. A kivezetés
 * desktop-portjával közös csomagba kerültek, hogy a két felület SOHA ne
 * húzhasson szét (a repó ismert hibaosztálya: „a második felület a régi
 * implementációt őrzi"). A web a régi útvonalakról re-exporttal éri el őket.
 */

import { z } from 'zod'

// ── Kivezetés oka ────────────────────────────────────────────

export const REMOVE_REASONS = ['meghalt', 'elkoltozott', 'kitert', 'torles'] as const
export type RemoveReason = (typeof REMOVE_REASONS)[number]

export const REMOVE_REASON_LABELS: Record<RemoveReason, string> = {
  meghalt: 'Elhunyt',
  elkoltozott: 'Elköltözött',
  kitert: 'Kitért / kilépett',
  torles: 'Végleges törlés',
}

// ── Input séma (a webes removeSchema változatlan tartalommal) ─

export const szemelyRemoveSchema = z.object({
  id: z.number({ message: 'A tag azonosítója kötelező' }),
  reason: z.enum(REMOVE_REASONS),
  // Elhunyt
  hdatum: z.string().optional().or(z.literal('')),
  tdatum: z.string().optional().or(z.literal('')),
  hhely: z.string().optional().or(z.literal('')),
  thely: z.string().optional().or(z.literal('')),
  hoka: z.string().optional().or(z.literal('')),
  lelkesz: z.string().optional().or(z.literal('')),
  munkanaplo: z.boolean().optional(),
  // Elköltözött
  kolt_datum: z.string().optional().or(z.literal('')),
  kolt_hova: z.string().optional().or(z.literal('')),
  kulfold: z.boolean().optional(),
  kolt_megj: z.string().optional().or(z.literal('')),
  // Kitért
  kitert_datum: z.string().optional().or(z.literal('')),
  kitert_vallas: z.string().optional().or(z.literal('')),
  kitert_hova: z.string().optional().or(z.literal('')),
  kitert_megj: z.string().optional().or(z.literal('')),
  // Törlés: munkanapló törlés kérés (okafogyott, de a régi hívók miatt marad)
  delete_worklogs: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.reason === 'meghalt') return !!data.hdatum && !!data.tdatum
    return true
  },
  { message: 'Elhunyt esetén a halál és temetés dátuma kötelező', path: ['hdatum'] }
)

export type SzemelyRemoveInput = z.infer<typeof szemelyRemoveSchema>

// ── Előzetes kapcsolat-ellenőrzés (szemely_kapcsolatok RPC) ──

/** Egy hivatkozás-kategória a szemely_kapcsolatok RPC katalógusából. */
export interface PersonReferenceItem {
  kulcs: string
  cimke: string
  darab: number
}

/**
 * Az előzetes kapcsolat-ellenőrzés eredménye.
 * `available: false` = az RPC (még) nem érhető el — a felület a régi,
 * általános figyelmeztetést mutatja (fail-soft, a migráció előtt is működik).
 */
export interface PersonReferencesResult {
  available: boolean
  /** Védett kapcsolatok — ha van ilyen, nincs fizikai törlés, csak elrejtés. */
  blokkolo: PersonReferenceItem[]
  /** A törléssel együtt eltűnő kapcsolt sorok (tájékoztató). */
  veleTorlodik: PersonReferenceItem[]
  error?: string
}

// ── A kivezetés-művelet egységes válasz-alakja ───────────────

/**
 * A webes `removeMember` Server Action és a desktop `removeMemberDesktop`
 * tükör közös visszatérési alakja — a közös dialógus (ui-app
 * MemberRemoveDialog) ezt fogyasztja.
 */
export interface SzemelyRemoveResult {
  success?: boolean
  message?: string
  /** Best-effort utómunkák (párkapcsolat-lezárás, választói újraszámítás) hibái. */
  warning?: string
  error?: string
}
