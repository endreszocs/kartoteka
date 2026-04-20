import { z } from 'zod'

// Szín hex kód validáció (opcionális)
const hexColorOptional = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Érvénytelen szín kód (pl. #14514b)')
  .nullish()
  .or(z.literal(''))

// Publikus oldal beállítások
export const publicSiteSettingsSchema = z.object({
  slug: z
    .string()
    .min(3, 'A slug legalább 3 karakter hosszú legyen')
    .max(60, 'A slug legfeljebb 60 karakter hosszú lehet')
    .regex(
      /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/,
      'A slug csak kisbetűket, számokat és kötőjelet tartalmazhat',
    ),
  display_name: z.string().min(2, 'A név legalább 2 karakter hosszú legyen').max(100),
  tagline: z.string().max(200).nullish(),
  hero_image_url: z.string().url().nullish().or(z.literal('')),
  crest_image_url: z.string().url().nullish().or(z.literal('')),
  theme_id: z.string().uuid().nullish(),
  custom_primary_color: hexColorOptional,
  custom_accent_color: hexColorOptional,
  contact_email: z.string().email('Érvénytelen email cím').nullish().or(z.literal('')),
  contact_phone: z.string().max(30).nullish(),
  address: z.string().max(200).nullish(),
  about_html: z.string().max(10000).nullish(),
  is_published: z.boolean().default(false),
  robots_index: z.boolean().default(false),
  // Nyilvános statisztikák
  show_member_count: z.boolean().default(false),
  show_presbyter_count: z.boolean().default(false),
  show_family_count: z.boolean().default(false),
  show_age_distribution: z.boolean().default(false),
  override_member_count: z.number().nullish(),
  override_presbyter_count: z.number().nullish(),
  override_family_count: z.number().nullish(),
})

export type PublicSiteSettingsInput = z.infer<typeof publicSiteSettingsSchema>

// Poszt szerkesztő séma
export const publicPostSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(1, 'A slug kötelező')
    .max(128, 'A slug legfeljebb 128 karakter hosszú lehet')
    .regex(/^[a-z0-9][a-z0-9-]{0,127}$/, 'A slug csak kisbetűket, számokat és kötőjelet tartalmazhat'),
  title: z.string().min(3, 'A cím legalább 3 karakter hosszú legyen').max(200),
  excerpt: z.string().max(300).nullish(),
  cover_image_url: z.string().url().nullish().or(z.literal('')),
  body_markdown: z.string().min(1, 'A tartalom nem lehet üres').max(50000),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
})

export type PublicPostInput = z.infer<typeof publicPostSchema>

// Magazin séma
export const publicMagazineSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(100),
  description: z.string().max(500).nullish(),
  cover_image_url: z.string().url().nullish().or(z.literal('')),
})

export type PublicMagazineInput = z.infer<typeof publicMagazineSchema>

// Magazin lapszám séma
export const publicMagazineIssueSchema = z.object({
  id: z.string().uuid().optional(),
  magazine_id: z.string().uuid(),
  issue_number: z.string().min(1).max(30),
  title: z.string().max(200).nullish(),
  cover_image_url: z.string().url().nullish().or(z.literal('')),
  pdf_url: z.string().url('A PDF URL kötelező'),
  published_at: z.string().nullish().or(z.literal('')),
  notes: z.string().max(1000).nullish(),
  is_published: z.boolean().default(false),
})

export type PublicMagazineIssueInput = z.infer<typeof publicMagazineIssueSchema>
