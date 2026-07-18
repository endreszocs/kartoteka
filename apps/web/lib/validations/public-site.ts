import { z } from 'zod'
import { isSafePublicHttpsUrl } from '@/lib/public-site/safe-url'
import { hasMinimumHexContrast } from '@/lib/public-site/theme-presets'

const publicHttpsUrl = z
  .string()
  .trim()
  .max(2048, 'A hivatkozas legfeljebb 2048 karakter lehet')
  .refine(
    isSafePublicHttpsUrl,
    'Csak biztonsagos https:// hivatkozas adhato meg',
  )

const publicHttpsUrlOptional = publicHttpsUrl.nullish().or(z.literal(''))

// Szín hex kód validáció (opcionális)
const hexColorOptional = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Érvénytelen szín kód (pl. #14514b)')
  .nullish()
  .or(z.literal(''))

const customPrimaryColorOptional = hexColorOptional.refine(
  (value) => !value || hasMinimumHexContrast(value, '#ffffff'),
  'Az elsődleges szín legyen elég sötét a fehér feliratokhoz (legalább 4.5:1 kontraszt)',
)

export const publicServiceTimeSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .uuid('Az alkalom azonosítója érvénytelen'),
  day: z
    .string()
    .trim()
    .min(2, 'Add meg az alkalom napját')
    .max(80, 'A nap vagy ismétlődés leírása legfeljebb 80 karakter lehet'),
  time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Az időpont ÓÓ:PP formátumú legyen'),
  title: z
    .string()
    .trim()
    .min(2, 'Add meg az alkalom nevét')
    .max(80, 'Az alkalom neve legfeljebb 80 karakter lehet'),
  location: z
    .string()
    .trim()
    .max(120, 'A helyszín legfeljebb 120 karakter lehet')
    .nullish()
    .or(z.literal('')),
  note: z
    .string()
    .trim()
    .max(160, 'A megjegyzés legfeljebb 160 karakter lehet')
    .nullish()
    .or(z.literal('')),
})

export const publicServiceTimesSchema = z
  .array(publicServiceTimeSchema)
  .max(12, 'Legfeljebb 12 rendszeres alkalom adható meg')
  .superRefine((items, context) => {
    const seenIds = new Set<string>()

    items.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Minden alkalomnak egyedi azonosítóval kell rendelkeznie',
          path: [index, 'id'],
        })
      }
      seenIds.add(item.id)
    })
  })

export type PublicServiceTime = z.infer<typeof publicServiceTimeSchema>

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
  hero_image_url: publicHttpsUrlOptional,
  crest_image_url: publicHttpsUrlOptional,
  theme_id: z.string().uuid().nullish().or(z.literal('')),
  custom_primary_color: customPrimaryColorOptional,
  custom_accent_color: hexColorOptional,
  contact_email: z.string().email('Érvénytelen email cím').nullish().or(z.literal('')),
  contact_phone: z.string().max(30).nullish(),
  address: z.string().max(200).nullish(),
  about_html: z.string().max(10000).nullish(),
  // Opcionális az expand/contract rollout miatt. Ha a mező hiányzik, a régi
  // adatbázison a többi beállítás továbbra is biztonságosan menthető.
  service_times: publicServiceTimesSchema.optional(),
  is_published: z.boolean().default(false),
  robots_index: z.boolean().default(false),
  // Nyilvános statisztikák
  show_member_count: z.boolean().default(false),
  show_presbyter_count: z.boolean().default(false),
  show_family_count: z.boolean().default(false),
  show_age_distribution: z.boolean().default(false),
  override_member_count: z.number().int().min(0).max(1_000_000).nullish(),
  override_presbyter_count: z.number().int().min(0).max(1_000_000).nullish(),
  override_family_count: z.number().int().min(0).max(1_000_000).nullish(),
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
  cover_image_url: publicHttpsUrlOptional,
  body_markdown: z.string().min(1, 'A tartalom nem lehet üres').max(50000),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
})

export type PublicPostInput = z.infer<typeof publicPostSchema>

// Magazin séma
export const publicMagazineSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2).max(100),
  description: z.string().max(500).nullish(),
  cover_image_url: publicHttpsUrlOptional,
})

export type PublicMagazineInput = z.infer<typeof publicMagazineSchema>

// Magazin lapszám séma
export const publicMagazineIssueSchema = z.object({
  id: z.string().uuid().optional(),
  magazine_id: z.string().uuid(),
  issue_number: z.string().min(1).max(30),
  title: z.string().max(200).nullish(),
  cover_image_url: publicHttpsUrlOptional,
  pdf_url: publicHttpsUrl,
  published_at: z.string().nullish().or(z.literal('')),
  notes: z.string().max(1000).nullish(),
  is_published: z.boolean().default(false),
})

export type PublicMagazineIssueInput = z.infer<typeof publicMagazineIssueSchema>
