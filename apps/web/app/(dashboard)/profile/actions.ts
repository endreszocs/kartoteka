'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

const profileSchema = z.object({
  fullName: z.string().min(2, 'A teljes név legalább 2 karakter legyen.'),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal('')),
  displayTitle: z.string().optional(),
  address: z.string().optional(),
  emergencyPhone: z.string().optional(),
  serviceStartedAt: z.string().optional(),
  previousServicePlaces: z.array(z.string()).optional(),
  previousRoles: z.array(z.string()).optional(),
  bio: z.string().optional(),
  ministryNotes: z.string().optional(),
})

type PastorProfileRow = {
  display_title?: string | null
  photo_url?: string | null
  address?: string | null
  emergency_phone?: string | null
  service_started_at?: string | null
  previous_service_places?: string[] | null
  previous_roles?: string[] | null
  bio?: string | null
  ministry_notes?: string | null
}

function isPermissionError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return error?.code === '42501' || message.includes('permission denied') || message.includes('not allowed')
}

function isMissingPastorProfileError(error: { message?: string; code?: string } | null) {
  const message = error?.message?.toLowerCase() || ''
  return (
    error?.code === '42P01' ||
    message.includes('pastor_profiles') && (
      message.includes('does not exist') ||
      message.includes('schema cache') ||
      message.includes('could not find')
    )
  )
}

async function getPastorProfileCompat(userId: string) {
  const supabase = await createClient()
  const result = await supabase
    .from('pastor_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (result.error) {
    if (isMissingPastorProfileError(result.error)) {
      return {
        row: null,
        extensionReady: false,
        extensionMessage:
          'A bővített lelkipásztori profil mezőihez még futtatni kell a mellékelt SQL-bővítést.',
      }
    }

    if (isPermissionError(result.error)) {
      return {
        row: null,
        extensionReady: false,
        extensionMessage:
          'A bővített lelkipásztori profil táblája már létezik, de az adatbázis-jogosultság még nem engedi az olvasását. Futtasd le a jogosultsági SQL-bővítést is.',
      }
    }

    throw new Error(result.error.message)
  }

  return { row: (result.data || null) as PastorProfileRow | null, extensionReady: true }
}

export async function getProfileDialogData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const [{ data: profile }, pastorProfileCompat] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    getPastorProfileCompat(user.id),
  ])

  const congregationId = profile?.congregation_id || null
  const dioceseId = profile?.diocese_id || null
  const districtId = profile?.district_id || null

  const [{ data: congregation }, { data: diocese }, { data: district }] = await Promise.all([
    congregationId
      ? supabase.from('congregations').select('nev_hu, name').eq('id', congregationId).maybeSingle()
      : Promise.resolve({ data: null }),
    dioceseId
      ? supabase.from('dioceses').select('name').eq('id', dioceseId).maybeSingle()
      : Promise.resolve({ data: null }),
    districtId
      ? supabase.from('districts').select('name').eq('id', districtId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const avatarUrl = pastorProfileCompat.row?.photo_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null

  // Multi-role: a user approved szerepköreinek listája + scope nevek (2026-04-18)
  const { data: rolesData } = await supabase
    .from('profile_roles')
    .select('id, scope, scope_id, role, custom_label, granted_at, approved_at')
    .eq('profile_id', user.id)
    .eq('approval_status', 'approved')
    .eq('active', true)

  const roleRows = (rolesData || []) as Array<{
    id: string
    scope: 'system' | 'district' | 'diocese' | 'congregation'
    scope_id: string | null
    role: string
    custom_label: string | null
    granted_at: string
    approved_at: string | null
  }>

  const congScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'congregation' && r.scope_id).map((r) => r.scope_id!)))
  const dioScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'diocese' && r.scope_id).map((r) => r.scope_id!)))
  const distScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'district' && r.scope_id).map((r) => r.scope_id!)))

  const scopeNameMap: Record<string, string> = {}
  if (congScopeIds.length > 0) {
    const { data } = await supabase.from('congregations').select('id, name, nev_hu').in('id', congScopeIds)
    for (const c of data || []) scopeNameMap[c.id as string] = (c.nev_hu as string | null) || (c.name as string | null) || '—'
  }
  if (dioScopeIds.length > 0) {
    const { data } = await supabase.from('dioceses').select('id, name').in('id', dioScopeIds)
    for (const d of data || []) scopeNameMap[d.id as string] = (d.name as string | null) || '—'
  }
  if (distScopeIds.length > 0) {
    const { data } = await supabase.from('districts').select('id, name').in('id', distScopeIds)
    for (const d of data || []) scopeNameMap[d.id as string] = (d.name as string | null) || '—'
  }

  const ROLE_ORDER: Record<string, number> = {
    admin: 1,
    egyhazkeruleti_admin: 2,
    egyhazmegyei_admin: 3,
    esperes: 4,
    egyhazmegyei_szamvevo: 5,
    lelkesz: 6,
    konyvelo: 7,
    custom: 8,
  }

  const profileRoles = roleRows
    .map((r) => ({
      id: r.id,
      scope: r.scope,
      scopeId: r.scope_id,
      scopeName: r.scope === 'system'
        ? 'Teljes rendszer'
        : r.scope_id
          ? scopeNameMap[r.scope_id] || '—'
          : '—',
      role: r.role,
      customLabel: r.custom_label,
      grantedAt: r.granted_at,
      approvedAt: r.approved_at,
    }))
    .sort((a, b) => (ROLE_ORDER[a.role] || 99) - (ROLE_ORDER[b.role] || 99))

  return {
    data: {
      id: user.id,
      email: profile?.email || user.email || null,
      fullName: profile?.full_name || user.user_metadata?.full_name || null,
      phone: profile?.phone || null,
      birthDate: profile?.birth_date || null,
      role: typeof profile?.role === 'string' ? profile.role : null,
      status: profile?.status || 'pending',
      createdAt: profile?.created_at || null,
      congregationName: congregation?.nev_hu || congregation?.name || null,
      dioceseName: diocese?.name || null,
      districtName: district?.name || null,
      avatarUrl,
      extensionReady: pastorProfileCompat.extensionReady,
      extensionMessage: pastorProfileCompat.extensionMessage || null,
      pastorProfile: {
        displayTitle: pastorProfileCompat.row?.display_title || '',
        address: pastorProfileCompat.row?.address || '',
        emergencyPhone: pastorProfileCompat.row?.emergency_phone || '',
        serviceStartedAt: pastorProfileCompat.row?.service_started_at || '',
        previousServicePlaces: pastorProfileCompat.row?.previous_service_places || [],
        previousRoles: pastorProfileCompat.row?.previous_roles || [],
        bio: pastorProfileCompat.row?.bio || '',
        ministryNotes: pastorProfileCompat.row?.ministry_notes || '',
      },
      profileRoles,
    },
  }
}

export async function saveProfileDetails(payload: z.infer<typeof profileSchema>) {
  const parsed = profileSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const data = parsed.data
  const cleanPhotoUrl = data.photoUrl || null

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email || null,
      full_name: data.fullName,
      phone: data.phone || null,
      birth_date: data.birthDate || null,
    })

  if (profileError) {
    return { error: `A profil mentése sikertelen: ${profileError.message}` }
  }

  const authData: Record<string, string> = {
    full_name: data.fullName,
  }

  if (cleanPhotoUrl) {
    authData.avatar_url = cleanPhotoUrl
  }

  const { error: authError } = await supabase.auth.updateUser({ data: authData })
  if (authError) {
    return { error: `A felhasználói metaadatok frissítése sikertelen: ${authError.message}` }
  }

  const pastorProfile = {
    user_id: user.id,
    display_title: data.displayTitle || null,
    photo_url: cleanPhotoUrl,
    address: data.address || null,
    emergency_phone: data.emergencyPhone || null,
    service_started_at: data.serviceStartedAt || null,
    previous_service_places: (data.previousServicePlaces || []).filter(Boolean),
    previous_roles: (data.previousRoles || []).filter(Boolean),
    bio: data.bio || null,
    ministry_notes: data.ministryNotes || null,
  }

  const pastorSave = await supabase.from('pastor_profiles').upsert(pastorProfile)
  const extensionReady = !pastorSave.error

  if (pastorSave.error && !isMissingPastorProfileError(pastorSave.error)) {
      return { error: `A bővített lelkipásztori profil mentése sikertelen: ${pastorSave.error.message}` }
  }

  revalidatePath('/', 'layout')
  const latest = await getProfileDialogData()
  const extensionMessage = pastorSave.error
    ? isMissingPastorProfileError(pastorSave.error)
      ? 'Az alap profil sikeresen frissült. A bővített lelkipásztori profilhoz még futtatni kell az SQL bővítést.'
      : 'Az alap profil sikeresen frissült, de a bővített lelkipásztori profil mezőihez még a jogosultsági SQL-bővítést is futtatni kell.'
    : null

  return {
    success: extensionReady
      ? 'A profil sikeresen frissült.'
      : extensionMessage || 'Az alap profil sikeresen frissült.',
    extensionReady,
    data: 'data' in latest ? latest.data : null,
  }
}

// ──────────────────────────────────────────────────────────────────────────
// JELSZÓ kezelés (v0.9.40, 2026-05-02)
// ──────────────────────────────────────────────────────────────────────────
//
// A felhasználó kérése: "Mi lesz azzal, aki úgy jelentkezett be hogy nem volt
// még jelszava (Google OAuth). Adjunk neki egy jelszót, és azt a beállításoknál
// megváltoztathatja!"
//
// Implementáció:
//   - `updatePassword(newPassword)` server action — bárki magának
//   - A Supabase `auth.updateUser({ password })` API-t hívja
//   - Az API mind a "jelszó beállítás" (Google-only user) mind a "jelszó
//     megváltoztatás" esetét egyformán kezeli — felülírja
//   - Validáció: 8-72 karakter (bcrypt limit)
//
// BIZTONSÁG: a hívó az aktuális session-jével hitelesít. Más user jelszavát
// MEM TUDJA módosítani — csak a sajátját.

export async function updatePassword(newPassword: string): Promise<{
  success?: boolean
  error?: string
}> {
  if (!newPassword || newPassword.length < 8) {
    return { error: 'A jelszó legalább 8 karakter hosszú legyen.' }
  }
  if (newPassword.length > 72) {
    return { error: 'A jelszó legfeljebb 72 karakter lehet (bcrypt limit).' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: `A jelszó frissítése nem sikerült: ${error.message}` }

  return { success: true }
}
