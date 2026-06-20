import { z } from 'zod'
import {
  RECEIPT_TYPES,
  TRANSFER_TYPES,
  RENTAL_FREQUENCIES,
  RENTAL_TIPUS,
  RENTAL_JOGI_TIPUS,
  RENTAL_BERLO_TIPUS,
  FX_ARFOLYAM_FORRAS,
} from '@/lib/constants/finance'

const today = () => new Date().toISOString().slice(0, 10)

// ── Bevétel ──────────────────────────────────────────────────

export const incomeSchema = z.object({
  osszeg: z.number({ message: 'Az összeg kötelező' }).positive('Az összeg pozitív szám kell legyen'),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  id_befizetescel: z.number({ message: 'Válasszon kategóriát' }),
  id_szemely: z.number().nullable().optional(),
  id_csalad: z.number().nullable().optional(),
  forrasa: z.string().nullable().optional(),
  iratszam: z.string().nullable().optional(),
  irattipus: z.enum(RECEIPT_TYPES),
  fizetettev: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
}).refine(
  data => data.datum <= today(),
  { message: 'Jövőbeli dátum nem engedélyezett', path: ['datum'] }
)

export type IncomeInput = z.infer<typeof incomeSchema>

export const linkedInventoryFromIncomeSchema = z.object({
  megnevezes: z.string().min(1, 'A leltári megnevezés kötelező'),
  helyszin: z.string().nullable().optional(),
  felelos_nev: z.string().nullable().optional(),
  katalogus_kod: z.string().nullable().optional(),
  hasznalati_ido: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})

export type LinkedInventoryFromIncomeInput = z.infer<typeof linkedInventoryFromIncomeSchema>

/**
 * Kiadáshoz kapcsolt leltári tétel séma — ugyanaz a minta mint a bevételnél,
 * de a kiadás oldalon a "kategória" is kötelező (alapeszkoz / egyeb_ingatlan / stb.)
 */
export const linkedInventoryFromExpenseSchema = z.object({
  megnevezes: z.string().min(1, 'A leltári megnevezés kötelező'),
  kategoria: z.string().min(1, 'A leltári kategória kötelező'),
  helyszin: z.string().nullable().optional(),
  felelos_nev: z.string().nullable().optional(),
  katalogus_kod: z.string().nullable().optional(),
  hasznalati_ido: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
})

export type LinkedInventoryFromExpenseInput = z.infer<typeof linkedInventoryFromExpenseSchema>

export const incomeBatchRowSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  id_befizetescel: z.number({ message: 'Válasszon kategóriát' }),
  forrasa: z.string().nullable().optional(),
  osszeg: z.number({ message: 'Az összeg kötelező' }).positive('Az összeg pozitív szám kell legyen'),
  iratszam: z.string().nullable().optional(),
  irattipus: z.enum(RECEIPT_TYPES),
  fizetettev: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  // #4b / B1 (Endre): a befizetés személyhez vagy családhoz kapcsolása (kölcsönösen
  // kizáró). A Tétel rögzítője küldi (tag-kereső / Családi nyugta); a séma eddig
  // kistrippelte, ezért a kapcsolás nem mentődött — most átengedjük.
  id_szemely: z.number().int().positive().nullable().optional(),
  id_csalad: z.number().int().positive().nullable().optional(),
}).refine(
  data => data.datum <= today(),
  { message: 'Jövőbeli dátum nem engedélyezett', path: ['datum'] }
)

export const incomeBatchSchema = z.array(incomeBatchRowSchema).min(1, 'Legalább egy bevételi sor szükséges')

export type IncomeBatchRowInput = z.infer<typeof incomeBatchRowSchema>

// ── Kiadás ───────────────────────────────────────────────────

export const expenseSchema = z.object({
  osszeg: z.number({ message: 'Az összeg kötelező' }).positive('Az összeg pozitív szám kell legyen'),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  id_kiadascel: z.number({ message: 'Válasszon kategóriát' }),
  kedvezmenyzett: z.string().nullable().optional(),
  id_szemely: z.number().nullable().optional(),
  iratszam: z.string().nullable().optional(),
  bizonylatszam: z.string().nullable().optional(),
  irattipus: z.enum(RECEIPT_TYPES),
  megjegyzes: z.string().nullable().optional(),
  is_inventory: z.boolean().optional(),
}).refine(
  data => data.datum <= today(),
  { message: 'Jövőbeli dátum nem engedélyezett', path: ['datum'] }
)

export type ExpenseInput = z.infer<typeof expenseSchema>

export const expenseBatchRowSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  id_kiadascel: z.number({ message: 'Válasszon kategóriát' }),
  kedvezmenyzett: z.string().nullable().optional(),
  osszeg: z.number({ message: 'Az összeg kötelező' }).positive('Az összeg pozitív szám kell legyen'),
  iratszam: z.string().nullable().optional(),
  irattipus: z.enum(RECEIPT_TYPES),
  megjegyzes: z.string().nullable().optional(),
  is_inventory: z.boolean().optional(),
}).refine(
  data => data.datum <= today(),
  { message: 'Jövőbeli dátum nem engedélyezett', path: ['datum'] }
)

export const expenseBatchSchema = z.array(expenseBatchRowSchema).min(1, 'Legalább egy kiadási sor szükséges')

export type ExpenseBatchRowInput = z.infer<typeof expenseBatchRowSchema>

// ── Belső mozgás ─────────────────────────────────────────────

export const transferSchema = z.object({
  tipus: z.enum(TRANSFER_TYPES),
  osszeg: z.number().positive('Az összeg pozitív szám kell legyen'),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  forras: z.string().min(1, 'Válasszon forrást'),
  cel: z.string().min(1, 'Válasszon célt'),
  arfolyam: z.number().nullable().optional(),
  cel_osszeg: z.number().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
}).refine(
  data => data.forras !== data.cel,
  { message: 'A forrás és a cél nem lehet azonos', path: ['cel'] }
).refine(
  data => data.datum <= today(),
  { message: 'Jövőbeli dátum nem engedélyezett', path: ['datum'] }
).refine(
  data => data.tipus !== 'valutacsere' || (data.arfolyam !== null && data.arfolyam !== undefined && data.arfolyam > 0),
  { message: 'Valutacserénél az árfolyam kötelező', path: ['arfolyam'] }
)

export type TransferInput = z.infer<typeof transferSchema>

// ── Bankszámla ───────────────────────────────────────────────

export const bankAccountSchema = z.object({
  id: z.number().optional(),
  bank_neve: z.string().min(1, 'A bank neve kötelező'),
  iban: z.string().nullable().optional(),
  valuta: z.enum(['RON', 'EUR']),
  aktiv: z.boolean().default(true),
})

export type BankAccountInput = z.infer<typeof bankAccountSchema>

// ── Bérleti szerződés ────────────────────────────────────────
// A DB séma: public.berleti_szerzodes (migration-docs/Database_schema.sql:252)
// A mezőnevek és típusok a DB-hez igazodnak. A berlo_tipus csak UI discriminator,
// nem kerül be a DB-be (a berlo_nev vagy ceg_nev / ceg_adoszam alapján
// rekonstruálható).

export const rentalContractSchema = z.object({
  // DB id (UUID) — opcionális, update esetén kell
  id: z.string().uuid().nullable().optional(),

  // UI discriminator: magánszemély vagy cég
  berlo_tipus: z.enum(RENTAL_BERLO_TIPUS),

  // Bérlő adatok
  berlo_nev: z.string().min(1, 'A bérlő neve kötelező').max(200),
  id_szemely: z.number().int().positive().nullable().optional(),
  ceg_nev: z.string().max(200).nullable().optional(),
  ceg_adoszam: z.string().max(50).nullable().optional(),

  // Szerződés tárgya és leírása
  targy: z.string().max(200).nullable().optional(),
  leiras: z.string().min(1, 'A leírás kötelező').max(2000),
  tipus: z.enum(RENTAL_TIPUS),
  // Jogi típus (locatiune / arendare / comodat / concesiune)
  // Hatással van a TVA-plafon számításra és az e-Factura kiállításra
  jogi_tipus: z.enum(RENTAL_JOGI_TIPUS).default('locatiune'),

  // Pénzügyi adatok
  osszeg: z.number().nonnegative('Az összeg nem lehet negatív'),
  fizetesi_ciklus: z.enum(RENTAL_FREQUENCIES),
  id_szamadasicel: z.string().max(20).nullable().optional(), // szerver auto-tölti a tipus alapján

  // Időtartam — kezdet kötelező, vége opcionális (nyitott végű ha null)
  kezdet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen kezdő dátum'),
  vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen záró dátum').nullable().optional(),

  // Azonosítók (opcionálisak)
  leltari_szam: z.string().max(100).nullable().optional(),
  telekkonyvi_szam: z.string().max(100).nullable().optional(),

  // Státusz
  aktiv: z.boolean().default(true),

  // Megjegyzés
  megjegyzes: z.string().max(2000).nullable().optional(),
}).refine(
  data => !data.vege || data.vege >= data.kezdet,
  { message: 'A záró dátum nem lehet korábbi mint a kezdő dátum', path: ['vege'] },
).refine(
  data => data.berlo_tipus !== 'ceg' || (data.ceg_nev !== null && data.ceg_nev !== undefined && data.ceg_nev.trim().length > 0),
  { message: 'Cég bérlő esetén a cég neve kötelező', path: ['ceg_nev'] },
).refine(
  data => data.berlo_tipus !== 'szemely' || data.berlo_nev.trim().length > 0,
  { message: 'Magánszemély bérlő esetén a név kötelező', path: ['berlo_nev'] },
).refine(
  data => data.jogi_tipus !== 'comodat' || data.osszeg === 0,
  { message: 'Haszonkölcsön (comodat) esetén az összeg 0 kell legyen — ingyenes használat.', path: ['osszeg'] },
).refine(
  data => data.jogi_tipus === 'comodat' || data.osszeg > 0,
  { message: 'Fizetett szerződés esetén az összeg pozitív szám kell legyen.', path: ['osszeg'] },
)

export type RentalContractInput = z.infer<typeof rentalContractSchema>

// ── Devizás átértékelés (FX revaluation, B2 modul) ───────────

/**
 * FX átértékelés mentési séma.
 *
 * A user a UI-ban kitölti a devizaegyenleget (auto-kalkulált, override-olható),
 * az új árfolyamot (BNR fetch vagy manual), és a régi RON értéket. A különbözet
 * és típus ezekből kalkulálódik a `calculateFxRevaluation` lib-ben.
 *
 * A mentési action ezután:
 *  1) Megkeresi a 103.04 (nyereség) vagy 203.03 (veszteség) szamadasi cel ID-t
 *  2) Létrehoz egy befizetes (nyereség) vagy kiadas (veszteség) sort
 *  3) Audit trail: valuta_atert sor a befizetes_id / kiadas_id linkkel
 */
export const fxRevaluationSchema = z.object({
  bankszamla_id: z.number().int().positive('Hiányzik a bankszámla'),
  ev: z.number().int().min(2020).max(2050),
  valuta: z.string().min(2).max(3),
  deviza_egyenleg: z.number().positive('A devizaegyenleg pozitív szám kell legyen'),
  regi_ron_ertek: z.number().nonnegative('A régi RON érték nem lehet negatív'),
  uj_arfolyam: z.number().positive('Az árfolyam pozitív szám kell legyen'),
  arfolyam_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum'),
  arfolyam_forras: z.enum(FX_ARFOLYAM_FORRAS),
  megjegyzes: z.string().max(500).nullable().optional(),
})

export type FxRevaluationInput = z.infer<typeof fxRevaluationSchema>
