import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const nullableText = z.string().nullable()
const nullableBoolean = z.boolean().nullable()
const moneyValue = z.union([z.number(), z.string()]).nullable()

const relationshipSchema = z.object({
  person_id: z.number().int(),
  display_name: z.string(),
  birth_year: z.number().int().nullable(),
  deceased: nullableBoolean,
  relationship: z.string(),
  blood_relative: z.boolean(),
  source: z.string(),
})

const householdMemberSchema = z.object({
  person_id: z.number().int(),
  display_name: z.string(),
  role: nullableText,
  primary: z.boolean(),
  self: z.boolean(),
})

const householdSchema = z.object({
  household_id: z.number().int(),
  name: nullableText,
  members: z.array(householdMemberSchema),
})

const paymentSchema = z.object({
  id: z.number().int(),
  date: nullableText,
  amount: moneyValue,
  amount_ron: moneyValue,
  payment_year: z.number().int().nullable(),
  receipt_number: nullableText,
  document_number: nullableText,
  purpose_id: z.number().int().nullable(),
  purpose: nullableText,
  voided: nullableBoolean,
})

export const memberOverviewSchema = z.object({
  account: z.object({
    member_account_id: z.string().uuid(),
    email: z.string().email(),
    display_name: z.string(),
    preferred_locale: z.string(),
    congregation_id: z.string().uuid(),
  }),
  person: z.object({
    person_id: z.number().int(),
    revision: z.number().int().nonnegative(),
    updated_at: nullableText,
    szcs_nev: nullableText,
    k_nev: nullableText,
    csaladnev: nullableText,
    ferjk_nev: nullableText,
    apjaneve: nullableText,
    anyjaneve: nullableText,
    sz_datum: nullableText,
    vallas: nullableText,
    foglalkozas: nullableText,
    nemzetiseg: nullableText,
    address: z.object({
      house_number: nullableText,
      building: nullableText,
      staircase: nullableText,
      floor: nullableText,
      door: nullableText,
      postal_code: nullableText,
    }),
    phone: nullableText,
    email: nullableText,
    photo_consent: nullableBoolean,
    mailing_consent: nullableBoolean,
    social_profile_url: nullableText,
  }),
  family_tree: z.object({
    relationships: z.array(relationshipSchema),
    households: z.array(householdSchema),
  }),
  payments: z.object({
    total_count: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    items: z.array(paymentSchema),
  }),
})

export type MemberOverview = z.infer<typeof memberOverviewSchema>
export type MemberPayment = z.infer<typeof paymentSchema>

const newsletterPreferencesSchema = z.object({
  member_account_id: z.string().uuid(),
  email_opt_in: z.boolean(),
  announcements_opt_in: z.boolean(),
  events_opt_in: z.boolean(),
  preferred_locale: z.enum(['hu', 'ro', 'en']),
  consented_at: nullableText,
  withdrawn_at: nullableText,
  revision: z.number().int().positive().nullable(),
})

export type MemberNewsletterPreferences = z.infer<
  typeof newsletterPreferencesSchema
>

const changeRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'withdrawn', 'approved', 'rejected', 'conflict']),
  submitted_at: z.string(),
  reviewed_at: nullableText,
  decision_message: nullableText,
  requested_patch: z.record(z.string(), z.unknown()),
  base_person_revision: z.number().int().nonnegative(),
  applied_person_revision: z.number().int().nonnegative().nullable(),
})

export type MemberChangeRequest = z.infer<typeof changeRequestSchema>

export async function loadMemberOverview(
  supabase: SupabaseClient,
): Promise<MemberOverview | null> {
  const { data, error } = await supabase.rpc('member_portal_my_overview', {
    p_payment_limit: 100,
    p_payment_offset: 0,
  })

  if (error) {
    console.error('[member-portal] Saját áttekintés RPC sikertelen:', error.code)
    return null
  }

  const parsed = memberOverviewSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[member-portal] A saját áttekintés RPC contractja eltért.')
    return null
  }
  return parsed.data
}

export async function loadMemberNewsletterPreferences(
  supabase: SupabaseClient,
): Promise<MemberNewsletterPreferences | null> {
  const { data, error } = await supabase.rpc(
    'member_portal_my_newsletter_preferences',
  )
  if (error) {
    console.error('[member-portal] Hírlevél-preferencia RPC sikertelen:', error.code)
    return null
  }

  const parsed = newsletterPreferencesSchema.safeParse(data)
  if (!parsed.success) {
    console.error('[member-portal] A hírlevél-preferencia contract eltért.')
    return null
  }
  return parsed.data
}

export async function loadMemberChangeRequests(
  supabase: SupabaseClient,
): Promise<MemberChangeRequest[]> {
  const { data, error } = await supabase
    .from('member_person_change_requests')
    .select(
      'id, status, submitted_at, reviewed_at, decision_message, requested_patch, base_person_revision, applied_person_revision',
    )
    .order('submitted_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('[member-portal] Saját módosítási kérelmek lekérése sikertelen:', error.code)
    return []
  }

  const parsed = z.array(changeRequestSchema).safeParse(data ?? [])
  if (!parsed.success) {
    console.error('[member-portal] A módosítási kérelem lista contractja eltért.')
    return []
  }
  return parsed.data
}
