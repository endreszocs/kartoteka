import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Az e-mail cím megadása kötelező')
    .email('Érvénytelen e-mail cím formátum'),
  password: z
    .string()
    .min(1, 'A jelszó megadása kötelező'),
})

/**
 * Regisztrációs schema — kategorizált onboarding (3 szekció):
 *
 *  SZEKCIÓ 1 — Személyes adatok:
 *    fullName, phone, birthDate (opcionális)
 *
 *  SZEKCIÓ 2 — Szolgálat:
 *    congregation (szabad szöveg, admin rendeli hozzá),
 *    dioceseId (opcionális — a dioceses tábla seeded 15 egyházmegyéje közül),
 *    serviceStartedAt (opcionális)
 *
 *  SZEKCIÓ 3 — Fiók:
 *    email, password, termsAccepted
 */
export const registerSchema = z.object({
  // Szekció 1 — Személyes
  fullName: z
    .string()
    .min(2, 'A teljes név legalább 2 karakter legyen'),
  phone: z
    .string()
    .min(5, 'Érvénytelen telefonszám'),
  birthDate: z
    .string()
    .optional()
    .or(z.literal('')),

  // Szekció 2 — Szolgálat
  congregation: z
    .string()
    .min(2, 'Az egyházközség nevét adja meg'),
  dioceseId: z
    .string()
    .uuid({ message: 'Érvénytelen egyházmegye azonosító' })
    .optional()
    .or(z.literal('')),
  serviceStartedAt: z
    .string()
    .optional()
    .or(z.literal('')),

  // Szekció 3 — Fiók
  email: z
    .string()
    .min(1, 'Az e-mail cím megadása kötelező')
    .email('Érvénytelen e-mail cím formátum'),
  password: z
    .string()
    .min(6, 'A jelszónak legalább 6 karakter hosszúnak kell lennie'),
  termsAccepted: z
    .literal(true, { message: 'A Felhasználói Feltételek elfogadása kötelező' }),
})

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Az e-mail cím megadása kötelező')
    .email('Érvénytelen e-mail cím formátum'),
})

/**
 * OAuth-complete schema — a Google OAuth után kért kiegészítő adatok.
 * Ugyanazt a kategorizálást használja, mint a regisztráció, csak az email
 * és password nem kell (OAuth adja).
 */
export const oauthCompleteSchema = z.object({
  fullName: z
    .string()
    .min(2, 'A teljes név legalább 2 karakter legyen'),
  phone: z
    .string()
    .min(5, 'Érvénytelen telefonszám'),
  birthDate: z
    .string()
    .optional()
    .or(z.literal('')),
  congregation: z
    .string()
    .min(2, 'Az egyházközség nevét adja meg'),
  dioceseId: z
    .string()
    .uuid({ message: 'Érvénytelen egyházmegye azonosító' })
    .optional()
    .or(z.literal('')),
  serviceStartedAt: z
    .string()
    .optional()
    .or(z.literal('')),
  termsAccepted: z
    .literal(true, { message: 'A Felhasználói Feltételek elfogadása kötelező' }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type OAuthCompleteInput = z.infer<typeof oauthCompleteSchema>
