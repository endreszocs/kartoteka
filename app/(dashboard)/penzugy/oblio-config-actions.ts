'use server'

import { revalidatePath } from 'next/cache'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { encryptSecret, decryptSecret } from '@/lib/supabase/secret-vault'
import { testConnection } from '@/lib/finance/oblio/oblio-client'
import { clearTokenCache } from '@/lib/finance/oblio/oblio-auth'

/**
 * Oblio fiók konfigurációt kezelő server actions.
 *
 * Jogosultság: csak a saját gyülekezeted konfigurációját kezelheted.
 * A RLS helper (`current_user_can_access_congregation`) szűr.
 *
 * Biztonság:
 * - Az api_secret **soha nem kerül kliens oldalra**
 * - A titkosítás + visszafejtés csak server actionben történik
 * - A `getOblioConfig` sosem adja vissza a secret-et — csak az email-t, CIF-et stb.
 */

export type OblioConfigStatus = {
  hasConfig: boolean
  config?: {
    id: string
    email: string
    cif: string
    sorozat_default: string | null
    nev_default_service: string | null
    aktiv: boolean
    utolso_teszt_at: string | null
    utolso_teszt_ok: boolean | null
    utolso_teszt_hiba: string | null
  }
  error?: string
}

/**
 * Beolvassa a gyülekezet Oblio konfigurációját. Az api_secret NEM kerül vissza.
 */
export async function getOblioConfig(): Promise<OblioConfigStatus> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { hasConfig: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) {
    return { hasConfig: false, error: 'Nincs aktív gyülekezet.' }
  }

  const { data, error } = await access.supabase
    .from('oblio_fiokok')
    .select('id, email, cif, sorozat_default, nev_default_service, aktiv, utolso_teszt_at, utolso_teszt_ok, utolso_teszt_hiba')
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (error) return { hasConfig: false, error: error.message }
  if (!data) return { hasConfig: false }

  return { hasConfig: true, config: data }
}

export type SaveOblioConfigInput = {
  email: string
  apiSecret: string // plain text — itt titkosítjuk
  cif: string
  sorozat_default?: string
  nev_default_service?: string
}

/**
 * Oblio fiók mentése (insert vagy update). Az api_secret-et titkosítjuk.
 * Csak lelkesz, admin, egyházkerületi admin hajthatja végre.
 */
export async function saveOblioConfig(input: SaveOblioConfigInput): Promise<{
  success?: boolean
  error?: string
  configId?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  // Jogosultság: lelkesz (saját) VAGY admin/kerületi admin
  const canEdit =
    access.role === 'lelkesz' ||
    access.admin ||
    access.egyhazkeruletiAdmin
  if (!canEdit) {
    return { error: 'Nincs jogod az Oblio konfiguráció szerkesztésére.' }
  }

  // Input validáció
  const email = (input.email || '').trim()
  const apiSecret = (input.apiSecret || '').trim()
  const cif = (input.cif || '').trim()

  if (!email || !email.includes('@')) {
    return { error: 'Érvényes email cím kötelező.' }
  }
  if (apiSecret.length < 20) {
    return { error: 'Az API secret túl rövid (legalább 20 karakter).' }
  }
  if (!cif || cif.length < 4) {
    return { error: 'Érvényes CIF/CUI kötelező (pl. 12345678 vagy RO12345678).' }
  }

  // Titkosítás
  let apiSecretEncrypted: string
  try {
    apiSecretEncrypted = await encryptSecret(access.supabase, apiSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `Titkosítási hiba: ${msg}` }
  }

  // Upsert (egy gyülekezetnek egy konfig — unique constraint)
  const payload = {
    congregation_id: access.effectiveCongregationId,
    email,
    api_secret_encrypted: apiSecretEncrypted,
    cif,
    sorozat_default: input.sorozat_default?.trim() || null,
    nev_default_service: input.nev_default_service?.trim() || 'Chirie spațiu',
    aktiv: true,
    updated_at: new Date().toISOString(),
  }

  // Törölje a cache-ben lévő tokent (új secret = új token)
  clearTokenCache(email)

  const { data, error } = await access.supabase
    .from('oblio_fiokok')
    .upsert(payload, { onConflict: 'congregation_id' })
    .select('id')
    .maybeSingle()

  if (error) return { error: `Mentés sikertelen: ${error.message}` }
  if (!data) return { error: 'Mentés nem jött létre (ismeretlen hiba).' }

  revalidatePath('/penzugy')
  return { success: true, configId: data.id }
}

/**
 * Kapcsolat teszt — lekéri az Oblio-ból a companies listát és megnézi,
 * hogy a megadott CIF szerepel-e. Rögzíti az eredményt is a DB-ben.
 */
export async function testOblioConnection(): Promise<{
  success: boolean
  companyName?: string
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { success: false, error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { success: false, error: 'Nincs aktív gyülekezet.' }

  // Beolvassuk a config-ot
  const { data: cfg, error: cfgErr } = await access.supabase
    .from('oblio_fiokok')
    .select('id, email, api_secret_encrypted, cif')
    .eq('congregation_id', access.effectiveCongregationId)
    .maybeSingle()

  if (cfgErr) return { success: false, error: cfgErr.message }
  if (!cfg) return { success: false, error: 'Nincs Oblio konfig. Előbb mentsd el.' }

  // Visszafejtés
  let apiSecret: string
  try {
    apiSecret = await decryptSecret(access.supabase, cfg.api_secret_encrypted)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await access.supabase
      .from('oblio_fiokok')
      .update({
        utolso_teszt_at: new Date().toISOString(),
        utolso_teszt_ok: false,
        utolso_teszt_hiba: `Titkosítási hiba: ${msg}`,
      })
      .eq('id', cfg.id)
    return { success: false, error: `Titkosítási hiba: ${msg}` }
  }

  // Teszt
  const result = await testConnection(cfg.email, apiSecret, cfg.cif)

  // Eredmény rögzítése
  await access.supabase
    .from('oblio_fiokok')
    .update({
      utolso_teszt_at: new Date().toISOString(),
      utolso_teszt_ok: result.success,
      utolso_teszt_hiba: result.success ? null : result.error || null,
    })
    .eq('id', cfg.id)

  return result
}

/**
 * Oblio konfig törlése (soft delete — aktiv = false).
 */
export async function deleteOblioConfig(): Promise<{
  success?: boolean
  error?: string
}> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezve.' }
  if (!access.effectiveCongregationId) return { error: 'Nincs aktív gyülekezet.' }

  const canEdit =
    access.role === 'lelkesz' ||
    access.admin ||
    access.egyhazkeruletiAdmin
  if (!canEdit) {
    return { error: 'Nincs jogod az Oblio konfiguráció törlésére.' }
  }

  const { error } = await access.supabase
    .from('oblio_fiokok')
    .update({ aktiv: false, updated_at: new Date().toISOString() })
    .eq('congregation_id', access.effectiveCongregationId)

  if (error) return { error: `Törlés sikertelen: ${error.message}` }

  revalidatePath('/penzugy')
  return { success: true }
}
