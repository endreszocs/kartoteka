import { z } from 'zod'

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Az e-mail cím megadása kötelező')
    .email('Érvénytelen e-mail cím formátum'),
  password: z
    .string()
    .min(1, 'A jelszó megadása kötelező'),
  /**
   * "Maradjak bejelentkezve" pipa.
   *  - true  → 1 éves persistent session cookie ("session-mode=persistent")
   *  - false / undefined → 24 órás session cookie ("session-mode=session")
   *  - alapértelmezetten kikapcsolt (1 nap után újra be kell jelentkezni)
   */
  rememberMe: z.boolean().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Az e-mail cím megadása kötelező')
    .email('Érvénytelen e-mail cím formátum'),
})

/**
 * OAuth-complete schema — a Google OAuth után kért kiegészítő adatok.
 *
 * 2026-07-11 (2. kör): PARITÁS a jelszavas úttal. A Google-regisztráló is
 * megadja a kért szerepkört, a kaszkád kerület→megye→GYÜLEKEZET (UUID-FK)
 * választást, az indoklást, a „honnan hallott rólunk" mezőt és opcionálisan
 * egy igazoló dokumentumot — így a completeOAuthProfile ugyanazt az
 * access_requests-sort tudja beszúrni, mint a jelszavas regisztráció.
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
  // 2026-07-11 — kért szerepkör (mint a jelszavas úton)
  requestedRole: z.enum(
    ['lelkesz', 'esperes', 'egyhazmegyei_admin', 'egyhazkeruleti_admin', 'konyvelo', 'egyhazmegyei_szamvevo'],
    { message: 'Válassza ki a szerepkört' },
  ),
  // A választott egyházközség NEVE (megjelenítéshez, backward-compat a
  // profiles.congregation TEXT mezőhöz) — a form a kiválasztott elemből tölti.
  congregation: z
    .string()
    .min(2, 'Válassza ki az egyházközséget'),
  // 2026-06-03 — egyházkerület + egyházmegye kötelező (DB FK, UUID)
  districtId: z
    .string()
    .uuid({ message: 'Válassza ki az egyházkerületet' }),
  dioceseId: z
    .string()
    .uuid({ message: 'Válassza ki az egyházmegyét' }),
  // 2026-07-11 — a választott egyházközség UUID-je (congregations FK), mint a
  // jelszavas úton a requested_congregation_id.
  requestedCongregationId: z
    .string()
    .uuid({ message: 'Válassza ki az egyházközséget' }),
  justification: z
    .string()
    .optional()
    .or(z.literal('')),
  referrer: z
    .string()
    .optional()
    .or(z.literal('')),
  // Opcionális feltöltött igazolás útvonala (access-request-docs bucket).
  documentPath: z
    .string()
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
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type OAuthCompleteInput = z.infer<typeof oauthCompleteSchema>
