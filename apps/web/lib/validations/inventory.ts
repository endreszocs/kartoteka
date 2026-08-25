import { z } from 'zod'
import { INVENTORY_CATEGORIES } from '@/lib/constants/inventory.next'

export const inventoryItemSchema = z.object({
  id: z.string().optional(),
  megnevezes: z.string().min(1, 'A megnevezés kötelező'),
  kategoria: z.enum(INVENTORY_CATEGORIES, { message: 'Válasszon kategóriát' }),
  beszerzes_erteke: z.number().positive('Az érték pozitív szám kell legyen'),
  beszerzes_datuma: z.string().nullable().optional(),
  beszerzes_bizonylat: z.string().nullable().optional(),
  katalogus_kod: z.string().nullable().optional(),
  hasznalati_ido: z.number().nullable().optional(),
  helyszin: z.string().nullable().optional(),
  felelos_nev: z.string().nullable().optional(),
  vonalkod: z.string().nullable().optional(),
  megjegyzes: z.string().nullable().optional(),
  // 2026-08-09: a kapcsolt kiadás xkey-e (leltar_tetelek.penzugy_xkey) — a
  // „Kikeresés a könyvelésből" tölti; üres string = kapcsolat bontása.
  penzugy_xkey: z.string().nullable().optional(),
  mennyiseg: z.number().positive().default(1).optional(),
  mertekegyseg: z.string().nullable().optional(),
  // 2026-08-26 (Leltar 3_43 kör): könyveknél a szerző; alapeszköznél a
  // halmozott le-/felértékelés (±RON, lehet negatív) + indoklása. Az undefined
  // (nem küldött mező) a régi hívók viselkedését bitre őrzi.
  szerzo: z.string().nullable().optional(),
  ertek_modositas: z.number().nullable().optional(),
  ertek_modositas_megjegyzes: z.string().nullable().optional(),
})
export type InventoryItemInput = z.infer<typeof inventoryItemSchema>
