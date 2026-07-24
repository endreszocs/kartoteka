'use server'

import { randomUUID } from 'node:crypto'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { loadMemberOverview } from '@/lib/member-portal/member-data'
import { createClient } from '@/lib/supabase/server'
import { isMemberPortalAuthEnabled } from '../tagi-portal/auth-enabled'
import {
  classifyMemberPortalAccess,
  readCurrentMemberRequestState,
} from '../tagi-portal/member-state'
import { loadMemberPortalPublicCongregation } from '../tagi-portal/public-congregation'

const slugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/)

const nullableText = (maximum: number) =>
  z.string().trim().max(maximum).transform((value) => value || null)

function isValidIsoDate(value: string): boolean {
  if (value === '') return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

const personFormSchema = z.object({
  slug: slugSchema,
  client_request_id: z.string().uuid(),
  base_person_revision: z.coerce.number().int().nonnegative(),
  szcs_nev: nullableText(200),
  csaladnev: nullableText(200),
  k_nev: nullableText(200),
  ferjk_nev: nullableText(200),
  apjaneve: nullableText(200),
  anyjaneve: nullableText(200),
  sz_datum: z
    .string()
    .trim()
    .refine(isValidIsoDate)
    .transform((value) => value || null),
  vallas: nullableText(200),
  foglalkozas: nullableText(200),
  nemzetiseg: nullableText(200),
  c_szam: nullableText(100),
  c_tombhaz: nullableText(100),
  c_lepcsohaz: nullableText(100),
  c_emelet: nullableText(100),
  c_ajto: nullableText(100),
  c_szcim: nullableText(100),
  telefon: nullableText(64),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .refine((value) => value === '' || z.email().safeParse(value).success)
    .transform((value) => value || null),
  social_profil_url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^https:\/\//i.test(value))
    .transform((value) => value || null),
  photo_consent: z.boolean(),
  mailing_consent: z.boolean(),
})

const preferencesFormSchema = z.object({
  slug: slugSchema,
  email_opt_in: z.boolean(),
  announcements_opt_in: z.boolean(),
  events_opt_in: z.boolean(),
  preferred_locale: z.enum(['hu', 'ro', 'en']),
})

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

function checkboxField(formData: FormData, key: string): boolean {
  return formData.getAll(key).some((value) => value === 'on' || value === '1')
}

function memberPath(slug: string, notice?: string, hash?: string): string {
  const query = notice ? `?notice=${encodeURIComponent(notice)}` : ''
  return `/gy/${slug}/tagi-fiok${query}${hash ? `#${hash}` : ''}`
}

async function requireActiveMember(slugInput: string) {
  const parsedSlug = slugSchema.safeParse(slugInput)
  if (!parsedSlug.success || !isMemberPortalAuthEnabled()) redirect('/')

  const site = await loadMemberPortalPublicCongregation(parsedSlug.data)
  if (!site) redirect('/')

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    redirect(`/gy/${site.slug}/tagi-portal`)
  }

  const requestState = await readCurrentMemberRequestState(supabase)
  if (
    !requestState.ok
    || classifyMemberPortalAccess(
      requestState.state,
      site.congregationId,
    ).kind !== 'active'
  ) {
    redirect(`/gy/${site.slug}/tagi-portal`)
  }

  return { site, supabase }
}

export async function submitMemberPersonChange(formData: FormData) {
  const parsed = personFormSchema.safeParse({
    slug: stringField(formData, 'slug'),
    client_request_id: stringField(formData, 'client_request_id') || randomUUID(),
    base_person_revision: stringField(formData, 'base_person_revision'),
    szcs_nev: stringField(formData, 'szcs_nev'),
    csaladnev: stringField(formData, 'csaladnev'),
    k_nev: stringField(formData, 'k_nev'),
    ferjk_nev: stringField(formData, 'ferjk_nev'),
    apjaneve: stringField(formData, 'apjaneve'),
    anyjaneve: stringField(formData, 'anyjaneve'),
    sz_datum: stringField(formData, 'sz_datum'),
    vallas: stringField(formData, 'vallas'),
    foglalkozas: stringField(formData, 'foglalkozas'),
    nemzetiseg: stringField(formData, 'nemzetiseg'),
    c_szam: stringField(formData, 'c_szam'),
    c_tombhaz: stringField(formData, 'c_tombhaz'),
    c_lepcsohaz: stringField(formData, 'c_lepcsohaz'),
    c_emelet: stringField(formData, 'c_emelet'),
    c_ajto: stringField(formData, 'c_ajto'),
    c_szcim: stringField(formData, 'c_szcim'),
    telefon: stringField(formData, 'telefon'),
    email: stringField(formData, 'email'),
    social_profil_url: stringField(formData, 'social_profil_url'),
    photo_consent: checkboxField(formData, 'photo_consent'),
    mailing_consent: checkboxField(formData, 'mailing_consent'),
  })

  const fallbackSlug = slugSchema.safeParse(stringField(formData, 'slug'))
  if (!parsed.success) {
    redirect(fallbackSlug.success
      ? memberPath(fallbackSlug.data, 'invalid-person-data', 'adataim')
      : '/')
  }

  const { site, supabase } = await requireActiveMember(parsed.data.slug)
  const overview = await loadMemberOverview(supabase)
  if (!overview || overview.account.congregation_id !== site.congregationId) {
    redirect(memberPath(site.slug, 'load-error', 'adataim'))
  }

  const current = overview.person
  const submitted = parsed.data
  const candidates: Record<string, unknown> = {
    szcs_nev: submitted.szcs_nev,
    csaladnev: submitted.csaladnev,
    k_nev: submitted.k_nev,
    ferjk_nev: submitted.ferjk_nev,
    apjaneve: submitted.apjaneve,
    anyjaneve: submitted.anyjaneve,
    sz_datum: submitted.sz_datum,
    vallas: submitted.vallas,
    foglalkozas: submitted.foglalkozas,
    nemzetiseg: submitted.nemzetiseg,
    c_szam: submitted.c_szam,
    c_tombhaz: submitted.c_tombhaz,
    c_lepcsohaz: submitted.c_lepcsohaz,
    c_emelet: submitted.c_emelet,
    c_ajto: submitted.c_ajto,
    c_szcim: submitted.c_szcim,
    telefon: submitted.telefon,
    email: submitted.email,
    social_profil_url: submitted.social_profil_url,
    photo_consent: submitted.photo_consent,
    mailing_consent: submitted.mailing_consent,
  }
  const currentValues: Record<string, unknown> = {
    szcs_nev: current.szcs_nev,
    csaladnev: current.csaladnev,
    k_nev: current.k_nev,
    ferjk_nev: current.ferjk_nev,
    apjaneve: current.apjaneve,
    anyjaneve: current.anyjaneve,
    sz_datum: current.sz_datum,
    vallas: current.vallas,
    foglalkozas: current.foglalkozas,
    nemzetiseg: current.nemzetiseg,
    c_szam: current.address.house_number,
    c_tombhaz: current.address.building,
    c_lepcsohaz: current.address.staircase,
    c_emelet: current.address.floor,
    c_ajto: current.address.door,
    c_szcim: current.address.postal_code,
    telefon: current.phone,
    email: current.email,
    social_profil_url: current.social_profile_url,
    photo_consent: current.photo_consent ?? false,
    mailing_consent: current.mailing_consent ?? false,
  }
  const requestedPatch = Object.fromEntries(
    Object.entries(candidates).filter(
      ([key, value]) => value !== currentValues[key],
    ),
  )

  if (Object.keys(requestedPatch).length === 0) {
    redirect(memberPath(site.slug, 'no-change', 'adataim'))
  }

  const { error } = await supabase.rpc('member_portal_submit_person_change', {
    p_requested_patch: requestedPatch,
    p_base_person_revision: parsed.data.base_person_revision,
    p_client_request_id: parsed.data.client_request_id,
  })
  if (error) {
    console.error('[member-portal] Módosítási kérelem sikertelen:', error.code)
    redirect(memberPath(site.slug, error.code === '23505' ? 'pending-exists' : 'save-error', 'adataim'))
  }

  revalidatePath(memberPath(site.slug))
  redirect(memberPath(site.slug, 'change-submitted', 'adataim'))
}

export async function withdrawMemberPersonChange(formData: FormData) {
  const slug = slugSchema.safeParse(stringField(formData, 'slug'))
  const requestId = z.string().uuid().safeParse(stringField(formData, 'request_id'))
  if (!slug.success || !requestId.success) redirect('/')

  const { site, supabase } = await requireActiveMember(slug.data)
  const { error } = await supabase.rpc('member_portal_withdraw_person_change', {
    p_request_id: requestId.data,
  })
  if (error) {
    console.error('[member-portal] Kérelem visszavonása sikertelen:', error.code)
    redirect(memberPath(site.slug, 'withdraw-error', 'adataim'))
  }

  revalidatePath(memberPath(site.slug))
  redirect(memberPath(site.slug, 'change-withdrawn', 'adataim'))
}

export async function saveMemberNewsletterPreferences(formData: FormData) {
  const parsed = preferencesFormSchema.safeParse({
    slug: stringField(formData, 'slug'),
    email_opt_in: checkboxField(formData, 'email_opt_in'),
    announcements_opt_in: checkboxField(formData, 'announcements_opt_in'),
    events_opt_in: checkboxField(formData, 'events_opt_in'),
    preferred_locale: stringField(formData, 'preferred_locale'),
  })
  if (!parsed.success) redirect('/')

  const { site, supabase } = await requireActiveMember(parsed.data.slug)
  const { error } = await supabase.rpc('member_portal_set_newsletter_preferences', {
    p_email_opt_in: parsed.data.email_opt_in,
    p_announcements_opt_in: parsed.data.announcements_opt_in,
    p_events_opt_in: parsed.data.events_opt_in,
    p_preferred_locale: parsed.data.preferred_locale,
  })
  if (error) {
    console.error('[member-portal] Hírlevél-beállítás sikertelen:', error.code)
    redirect(memberPath(site.slug, 'newsletter-error', 'beallitasok'))
  }

  revalidatePath(memberPath(site.slug))
  redirect(memberPath(site.slug, 'newsletter-saved', 'beallitasok'))
}

export async function signOutMemberPortal(formData: FormData) {
  const slug = slugSchema.safeParse(stringField(formData, 'slug'))
  if (!slug.success) redirect('/')
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect(`/gy/${slug.data}/tagi-portal`)
}
