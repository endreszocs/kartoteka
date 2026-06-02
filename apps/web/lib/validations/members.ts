import { z } from 'zod'
import { ENTRY_REASONS, REMOVE_REASONS } from '@/lib/constants/members'

// ── Tag felvétel / szerkesztés ───────────────────────────────

export const memberSchema = z.object({
  id: z.number().optional(),
  csaladnev: z.string().min(1, 'A családnév kötelező'),
  k_nev: z.string().min(1, 'A keresztnév kötelező'),
  szcs_nev: z.string().optional().or(z.literal('')),
  ferfi: z.boolean({ message: 'A nem megadása kötelező' }),
  sz_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  sz_hely_text: z.string().optional().or(z.literal('')),
  foglalkozas: z.string().optional().or(z.literal('')),
  vallas: z.string().default('Református'),
  c_helyseg_text: z.string().min(1, 'A település kötelező'),
  c_utca_text: z.string().min(1, 'Az utca kötelező'),
  c_szam: z.string().default('1'),
  c_tombhaz: z.string().optional().or(z.literal('')),
  c_lepcsohaz: z.string().optional().or(z.literal('')),
  c_emelet: z.string().optional().or(z.literal('')),
  c_ajto: z.string().optional().or(z.literal('')),
  telefon: z.string().optional().or(z.literal('')),
  email: z.string().email('Érvénytelen e-mail cím').optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
  belepes_oka: z.enum(ENTRY_REASONS).default('alap'),
  // Beköltözött extra
  bek_datum: z.string().optional().or(z.literal('')),
  bek_honnan: z.string().optional().or(z.literal('')),
  bek_igazolas: z.string().optional().or(z.literal('')),
  // Áttért extra
  att_datum: z.string().optional().or(z.literal('')),
  att_felekezet: z.string().optional().or(z.literal('')),
  att_honnan: z.string().optional().or(z.literal('')),
  // Szülők
  apjaneve: z.string().optional().or(z.literal('')),
  anyjaneve: z.string().optional().or(z.literal('')),
  id_apja_cnp: z.string().optional().or(z.literal('')),
  id_anyja_cnp: z.string().optional().or(z.literal('')),
  // Anyakönyv
  kereszteles_datum: z.string().optional().or(z.literal('')),
  kereszteles_hely: z.string().optional().or(z.literal('')),
  kereszteles_lelkesz: z.string().optional().or(z.literal('')),
  konfirmacio_datum: z.string().optional().or(z.literal('')),
  konfirmacio_hely: z.string().optional().or(z.literal('')),
  konfirmacio_lelkesz: z.string().optional().or(z.literal('')),
  // 2026-06-02: Esketés (új tag wizard / szerkesztés)
  esketes_datum: z.string().optional().or(z.literal('')),
  esketes_hely: z.string().optional().or(z.literal('')),
  esketes_lelkesz: z.string().optional().or(z.literal('')),
  esketes_hazastars_nev: z.string().optional().or(z.literal('')),
  // Pénzügyi
  fizeto_status: z.enum(['fizet', 'felmentett', 'nem_fizet']).optional(),
})

export type MemberInput = z.infer<typeof memberSchema>

// ── Tag kivezetés ────────────────────────────────────────────

export const removeSchema = z.object({
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
  // Törlés: munkanapló törlés kérés
  delete_worklogs: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.reason === 'meghalt') return !!data.hdatum && !!data.tdatum
    return true
  },
  { message: 'Elhunyt esetén a halál és temetés dátuma kötelező', path: ['hdatum'] }
)

export type RemoveInput = z.infer<typeof removeSchema>

// ── Család ───────────────────────────────────────────────────

export const familySchema = z.object({
  id: z.number().optional(),
  id_ferfi: z.number().nullable(),
  id_no: z.number().nullable(),
  gyerekIds: z.array(z.number()).default([]),
  c_utcaid: z.number().optional(),
  c_szam: z.string().optional().or(z.literal('')),
  id_csoport: z.number().nullable().optional(),
}).refine(
  (data) => data.id_ferfi !== null || data.id_no !== null,
  { message: 'Legalább egy felet (férj vagy feleség) meg kell adni', path: ['id_ferfi'] }
)

export type FamilyInput = z.infer<typeof familySchema>

// ── Körzet ───────────────────────────────────────────────────

export const districtSchema = z.object({
  id: z.number().optional(),
  nev: z.string().min(1, 'A körzet neve kötelező'),
  isaktiv: z.boolean().default(true),
})

export type DistrictInput = z.infer<typeof districtSchema>

// ── Presbiter ────────────────────────────────────────────────

export const presbyterSchema = z.object({
  id_szemely: z.number({ message: 'Válasszon egyháztagot' }),
  tisztseg: z.string().default('Presbiter'),
  id_csoport: z.number().nullable().optional(),
})

export type PresbyterInput = z.infer<typeof presbyterSchema>
