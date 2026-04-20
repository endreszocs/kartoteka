'use server'

import { createClient } from '@/lib/supabase/server'
import { isMasterAdmin } from '@/lib/auth/roles'
import { cookies } from 'next/headers'

const GOD_MODE_PIN = process.env.GOD_MODE_PIN || ''
const GOD_MODE_DURATION_MS = 2 * 60 * 60 * 1000 // 2 óra

export async function activateGodMode(pin: string) {
  // 1. Auth ellenőrzés — csak Master Admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isMasterAdmin(user.email)) {
    return { error: 'Nincs jogosultsága ehhez a művelethez.' }
  }

  // 2. PIN validáció (szerver-oldali, soha nem kerül a kliensre)
  if (!GOD_MODE_PIN || pin !== GOD_MODE_PIN) {
    return { error: 'Hibás PIN kód.' }
  }

  // 3. Cookie beállítás (httpOnly, secure)
  const expiresAt = Date.now() + GOD_MODE_DURATION_MS
  const cookieStore = await cookies()
  cookieStore.set('god_mode_until', String(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: GOD_MODE_DURATION_MS / 1000,
  })

  return { success: true, expiresAt }
}

export async function deactivateGodMode() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isMasterAdmin(user.email)) {
    return { error: 'Nincs jogosultsága ehhez a művelethez.' }
  }

  const cookieStore = await cookies()
  cookieStore.delete('god_mode_until')

  return { success: true }
}

export async function getGodModeStatus(): Promise<{ active: boolean; expiresAt: number | null }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get('god_mode_until')

  if (!cookie?.value) {
    return { active: false, expiresAt: null }
  }

  const expiresAt = Number(cookie.value)
  if (Date.now() >= expiresAt) {
    // Lejárt — cookie törlés
    cookieStore.delete('god_mode_until')
    return { active: false, expiresAt: null }
  }

  return { active: true, expiresAt }
}
