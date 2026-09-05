'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit/log'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { resolveAvatarUrl } from '@/lib/auth/profile-avatar-shared'
import { ugyanazABukarestiNap } from '@/lib/utils/date'
import {
  jovobeliDatumHibak,
  maiNapKulcs,
  profileSaveSchema,
  shValtozottE,
  zodHibakMezonkent,
  PROFILE_PHOTO_MAX_BYTES,
  PROFILE_PHOTO_MIME,
  type ProfileDialogData,
  type ProfileDialogRoleRow,
  type ProfilePhotoResult,
  type ProfileSaveInput,
  type ProfileSaveResult,
  type ProfileScope,
} from './profile-dialog-shared'

/**
 * 2026-06-05 — SAJÁT fiók végleges törlése (self-service, GDPR-anonimizálás).
 * A header → Beállítások → Adat & biztonság résznél hívható. Csak a személyes
 * adat + email tűnik el; a gyülekezet adatai megmaradnak, de a gyülekezet
 * MEGÜRÜL (felelős lelkész nélkül marad) — erről a rendszergazda értesül.
 */
export async function eraseMyAccount(
  reason?: string,
): Promise<{ success?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  // 1) DB-oldali anonimizálás + a gyülekezet ürítése
  const { data: rpcRes, error: rpcErr } = await supabase.rpc('erase_my_account', {
    p_reason: reason?.trim() || null,
  })
  if (rpcErr) {
    const missing = /function .* does not exist|schema cache/i.test(rpcErr.message)
    return {
      error: missing
        ? 'A törlés-funkció adatbázis-része még nincs telepítve (2026-06-05h SQL).'
        : rpcErr.message,
    }
  }
  const info = (rpcRes || {}) as { congregation_id?: string | null }

  // 2) Audit (a session még él — auth.uid() érvényes)
  await logAuditEvent(
    { action: 'user.self_erase', targetTable: 'profiles', targetId: user.id, metadata: { self: true } },
    supabase,
  )

  // 3) Rendszergazda értesítése (a gyülekezet megürült) + auth soft-delete
  try {
    const { getSupabaseAdminClient } = await import('@/lib/supabase/admin-client')
    const admin = getSupabaseAdminClient()

    if (info.congregation_id) {
      const { data: congRow } = await admin
        .from('congregations')
        .select('nev_hu, name')
        .eq('id', info.congregation_id)
        .maybeSingle()
      const congName =
        ((congRow as { nev_hu?: string | null; name?: string | null } | null)?.nev_hu) ||
        ((congRow as { name?: string | null } | null)?.name) ||
        'egy gyülekezet'

      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('status', 'active')
      // 2026-09-05: közös beszúró segéd (feladó = rendszer: a törlő lelkész fiókja
      // épp megszűnik, személyt nem nevezünk). Dinamikus import, mint fentebb az
      // admin-kliensé — a fájl többi részéhez nem nyúlunk.
      const { insertErtesites } = await import('@/lib/notifications/ertesites-insert')
      const { feladoMezok } = await import('@/lib/notifications/felado')
      const cimzettek = ((admins || []) as Array<{ id: string }>).map((a) => a.id)
      if (cimzettek.length > 0) {
        await insertErtesites(
          admin,
          cimzettek.map((uid) => ({
            congregation_id: info.congregation_id,
            user_id: uid,
            cim: `Gyülekezet megürült: ${congName}`,
            uzenet: `Egy lelkész törölte a fiókját — a(z) ${congName} gyülekezet felelős lelkész nélkül maradt. Kérjük, rendelj hozzá új lelkészt.`,
            tipus: 'warning',
            // 2026-08-11 (#3): a `/admin?tab=users` mélylink halott — az admin panel
            // 13-fülű oldala önálló `/admin/<slug>` route-okra bomlott, a `?tab=`
            // paramétert senki nem olvassa, így az értesítés az admin nyitóoldalára
            // vitt, felhasználó-lista nélkül.
            hivatkozas: '/admin/felhasznalok',
            ...feladoMezok('rendszer'),
          })),
          { forras: 'fiok-torles' },
        )
      }
    }

    // Auth soft-delete: a belépés megszűnik, az auth-email törlődik (a profil-sor megmarad).
    await admin.auth.admin.deleteUser(user.id, true)
  } catch (err) {
    console.error('[eraseMyAccount] értesítés/soft-delete hiba:', err instanceof Error ? err.message : err)
  }

  await supabase.auth.signOut()
  return { success: true }
}

// ══════════════════════════════════════════════════════════════════════════
// PROFIL-DIALÓGUS — adatlekérés, mentés, profilkép (2026-09-05, profil-kör)
// ══════════════════════════════════════════════════════════════════════════
//
// MIÉRT ÍRÓDOTT ÚJRA (a felmérés P1-ei):
//  · A dialógus HÁROM forrásból mutatott más-más igazságot: a fejléc a legacy
//    `profiles.role` skalárt („Rendszergazda"), a hero a szabadszöveges
//    `display_title`-t („lelkipásztor"), az egyházmegyét a `profiles.diocese_id`
//    skalárból — az AKTÍV kontextus (a bal chip igazsága) sehol. Mostantól a
//    `getEffectiveAccessContext()`-ből indulunk (cache-elt: nincs plusz kör).
//  · Az egyházmegye/kerület a GYÜLEKEZET LÁNCÁBÓL jön (congregations.diocese_id
//    → dioceses → districts) — a skalár csak fallback, eltérésnél ⚠️.
//  · A Szerkesztés fül a legacy `previous_service_places` tömböt írta, miközben
//    a Szolgálat fül a strukturált `pastor_service_history`-t mutatta → a mentés
//    „hatástalan" volt. Kanonikus: a strukturált tábla; a legacy csak olvasható.
//  · Profilkép: a Google `picture` megelőzte a saját feltöltést, és nem volt
//    „Kép eltávolítása". Az elsőbbség EGY helyen (`resolveAvatarUrl`), a döntés
//    a `pastor_profiles.avatar_source` oszlopban.
//  · Mentés: revision-kapu (néma last-writer-wins tilos), mezőnkénti hibák,
//    audit-esemény a VÁLTOZOTT MEZŐK NEVEIVEL (értékek nélkül).

type PastorProfileRow = {
  display_title?: string | null
  photo_url?: string | null
  avatar_source?: string | null
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

/**
 * Hiányzó OSZLOP (a 2026-09-05-ös SQL még nem futott le élesben): a PostgREST
 * PGRST204-et („Could not find the 'avatar_source' column…") vagy 42703-at ad.
 * MEMORY: a migration-fájl NEM bizonyíték — a repó és a produkció némán széthúz.
 */
function isMissingColumnError(error: { message?: string; code?: string } | null, oszlop: string) {
  const message = error?.message?.toLowerCase() || ''
  return (
    (error?.code === 'PGRST204' || error?.code === '42703' || message.includes('could not find')) &&
    message.includes(oszlop)
  )
}

const AVATAR_SOURCE_SQL_HINT =
  'A profilkép-döntés oszlopa (avatar_source) még hiányzik az adatbázisból — futtasd a migration-docs/sql/2026-09-05-profil-pontossag.sql fájlt.'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type PastorProfileCompat = {
  row: PastorProfileRow | null
  extensionReady: boolean
  extensionMessage?: string
  /**
   * ISMERETLEN olvasási hiba (hálózat, átmeneti DB-hiba). NEM dobjuk tovább:
   * egy `'use server'` akcióból kidobott hiba élesben MASZKOLT üzenetként ér a
   * kliensre („An error occurred in the Server Components render…"), az emberi
   * magyar szöveg sosem jutna a felületre. A hívók fail-closed kezelik: a
   * dialógus hibát mutat (nem üres mezőket), a mentés el sem indul.
   */
  readError?: string
}

async function getPastorProfileCompat(supabase: SupabaseServerClient, userId: string): Promise<PastorProfileCompat> {
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

    console.warn('[profile] pastor_profiles olvasása sikertelen:', result.error.message)
    return {
      row: null,
      extensionReady: false,
      extensionMessage: `A bővített profil most nem olvasható: ${result.error.message}`,
      readError: result.error.message,
    }
  }

  return { row: (result.data || null) as PastorProfileRow | null, extensionReady: true }
}

/**
 * A szolgálati előzmények EGYETLEN, determinisztikus rendje: sorrend → kezdő év
 * → id. A betöltés ÉS a mentés „változott-e" összevetése UGYANEZT hívja.
 * MIÉRT: ha a két lekérés más rendben adná a sorokat (a betöltés kezdő év
 * szerint csökkenőre rendezett, a mentés-előtti olvasás rendezetlen volt), az
 * összevetés azonos tartalomra is „változott"-at mondott → minden mentés
 * törölt+újraírt, és hamis `service_history` audit-bejegyzés született
 * (2026-09-05 bíráló, P2). A sorrend a szerkeszthető állapot része (a szerkesztő
 * „1. / 2. szolgálati hely"-ként mutatja, a mentés `sorrend = index`-et ír),
 * ezért a felület is EBBEN a rendben kapja — nincs külön „megjelenítési" rend.
 */
function serviceHistoryLekeres(supabase: SupabaseServerClient, userId: string) {
  return supabase
    .from('pastor_service_history')
    .select('id, hely, szerep, ev_tol, ev_ig, megjegyzes, sorrend')
    .eq('user_id', userId)
    .order('sorrend', { ascending: true })
    .order('ev_tol', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
}

// A Supabase relációs select néha tömböt ad vissza egy-egy kapcsolatra.
function egy<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type NevesSor = { id?: string | null; name?: string | null }
type LancMegye = NevesSor & { district_id?: string | null; districts?: NevesSor | NevesSor[] | null }
type LancGyulekezet = {
  id: string
  nev_hu: string | null
  name: string | null
  diocese_id: string | null
  dioceses?: LancMegye | LancMegye[] | null
}

type GyulekezetLanc = {
  id: string
  nevHu: string | null
  name: string | null
  dioceseId: string | null
  dioceseName: string | null
  districtName: string | null
}
type EgyhazmegyeLanc = { id: string; name: string | null; districtName: string | null }

/**
 * A lánc-lekérések EREDMÉNYE: a lánc VAGY a hiba szövege — sosem néma null.
 * MIÉRT: korábban `if (error || !data) return null` volt, így egy átmeneti/RLS-
 * hiba a felületen „Gyülekezet nincs hozzárendelve"-ként jelent meg (HAMIS tény),
 * és az egyházmegye-eltérés ellenőrzése is némán kimaradt (2026-09-05 bíráló, P2).
 * A `hiba` a válaszba kerül (`lancHiba`), a dialógus figyelmeztetést ír.
 */
type LancEredmeny<T> = { lanc: T | null; hiba: string | null }

/**
 * A GYÜLEKEZET LÁNCA egy lekéréssel: gyülekezet → egyházmegye → egyházkerület.
 * A minta MÁR ÉL az admin felhasználó-listában (admin/actions.ts, 3-szintes join).
 */
async function loadGyulekezetLanc(supabase: SupabaseServerClient, congregationId: string | null): Promise<LancEredmeny<GyulekezetLanc>> {
  if (!congregationId) return { lanc: null, hiba: null }
  const { data, error } = await supabase
    .from('congregations')
    .select('id, nev_hu, name, diocese_id, dioceses:diocese_id(id, name, district_id, districts:district_id(id, name))')
    .eq('id', congregationId)
    .maybeSingle()
  if (error) {
    console.warn('[profile] gyülekezet-lánc olvasása sikertelen:', congregationId, error.message)
    return { lanc: null, hiba: `a gyülekezet lánca nem olvasható (${error.message})` }
  }
  if (!data) {
    // Nincs hiba, de nincs sor sem: a hivatkozott gyülekezet nem létezik, vagy
    // az RLS elrejti — mindkettő anomália, nem „nincs hozzárendelve".
    console.warn('[profile] a hivatkozott gyülekezet nem található/nem látható:', congregationId)
    return { lanc: null, hiba: 'a hivatkozott gyülekezet sora nem található vagy nem látható' }
  }
  const row = data as unknown as LancGyulekezet
  const dio = egy<LancMegye>(row.dioceses)
  const dist = dio ? egy<NevesSor>(dio.districts) : null
  return {
    lanc: {
      id: row.id,
      nevHu: row.nev_hu ?? null,
      name: row.name ?? null,
      dioceseId: dio?.id ?? row.diocese_id ?? null,
      dioceseName: dio?.name ?? null,
      districtName: dist?.name ?? null,
    },
    hiba: null,
  }
}

async function loadEgyhazmegyeLanc(supabase: SupabaseServerClient, dioceseId: string | null): Promise<LancEredmeny<EgyhazmegyeLanc>> {
  if (!dioceseId) return { lanc: null, hiba: null }
  const { data, error } = await supabase
    .from('dioceses')
    .select('id, name, district_id, districts:district_id(id, name)')
    .eq('id', dioceseId)
    .maybeSingle()
  if (error) {
    console.warn('[profile] egyházmegye-lánc olvasása sikertelen:', dioceseId, error.message)
    return { lanc: null, hiba: `az egyházmegye lánca nem olvasható (${error.message})` }
  }
  if (!data) {
    console.warn('[profile] a hivatkozott egyházmegye nem található/nem látható:', dioceseId)
    return { lanc: null, hiba: 'a hivatkozott egyházmegye sora nem található vagy nem látható' }
  }
  const d = data as unknown as { id: string; name: string | null; districts?: NevesSor | NevesSor[] | null }
  const dist = egy<NevesSor>(d.districts)
  return { lanc: { id: d.id, name: d.name ?? null, districtName: dist?.name ?? null }, hiba: null }
}

const ROLE_ORDER: Record<string, number> = {
  admin: 1,
  egyhazkeruleti_admin: 2,
  // 2026-08-15: a kerületi ellenőr közvetlenül a kerületi admin után.
  egyhazkeruleti_szamvevo: 3,
  egyhazmegyei_admin: 4,
  esperes: 5,
  egyhazmegyei_szamvevo: 6,
  lelkesz: 7,
  konyvelo: 8,
  custom: 9,
}

export async function getProfileDialogData(): Promise<{ error: string } | { data: ProfileDialogData }> {
  // D1: a felület igazsága az AKTÍV kontextus — a react-cache-elt kontextusból
  // indulunk, ugyanabból, amiből a fejléc bal chipje él.
  const access = await getEffectiveAccessContext()
  const { user, profile, supabase } = access
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const aktivRole = access.activeProfileRole
  const profileCongregationId = (profile?.congregation_id as string | null | undefined) || null
  const profileDioceseId = (profile?.diocese_id as string | null | undefined) || null

  // Az aktív hatókör gyülekezete (gyülekezeti scope-ban a kontextusé; nem
  // gyülekezeti scope-nál nincs), plusz a NYILVÁNTARTOTT gyülekezet (skalár),
  // ha az más — a ⚠️ sorhoz.
  const aktivCongregationId =
    aktivRole == null || aktivRole.scope === 'congregation' ? access.effectiveCongregationId : null

  const uresLanc = { lanc: null, hiba: null }
  const [pastorProfileCompat, aktivLancRes, nyilvantartottLancRes, aktivMegyeLancRes, shRes, hnRes] = await Promise.all([
    getPastorProfileCompat(supabase, user.id),
    loadGyulekezetLanc(supabase, aktivCongregationId),
    profileCongregationId && profileCongregationId !== aktivCongregationId
      ? loadGyulekezetLanc(supabase, profileCongregationId)
      : Promise.resolve<LancEredmeny<GyulekezetLanc>>(uresLanc),
    aktivRole?.scope === 'diocese'
      ? loadEgyhazmegyeLanc(supabase, aktivRole.scopeId)
      : Promise.resolve<LancEredmeny<EgyhazmegyeLanc>>(uresLanc),
    serviceHistoryLekeres(supabase, user.id),
    supabase
      .from('szolgalati_hely_naplo')
      .select('id, congregation_nev, elozo_congregation_nev, jelleg, created_at')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // FAIL-CLOSED: ismeretlen olvasási hibánál NEM mutatunk üres mezőket (a
  // felhasználó „üresnek" hinné, és egy mentéssel felülírná a valódi adatot).
  if (pastorProfileCompat.readError) {
    return {
      error: `A bővített profil most nem olvasható: ${pastorProfileCompat.readError} — próbáld újra; ha marad, jelezd a rendszergazdának.`,
    }
  }

  const aktivLanc = aktivLancRes.lanc
  const nyilvantartottLanc = nyilvantartottLancRes.lanc
  const aktivMegyeLanc = aktivMegyeLancRes.lanc
  // A lánc-hibák EGY szövegben a felületre (néma hiba tilos) — a felület ilyenkor
  // a fejléc gyorstárának nevére esik vissza, és kimondja, hogy az eltérés-
  // ellenőrzés nem futott le.
  const lancHibak: string[] = [aktivLancRes.hiba, nyilvantartottLancRes.hiba, aktivMegyeLancRes.hiba].filter(
    (h): h is string => Boolean(h),
  )

  // ── Hatókör-nevek a szerepkör-sorokhoz (a meglévő 3 lekérés) ──────────────
  const roleRows = access.profileRoles
  const congScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'congregation' && r.scope_id).map((r) => r.scope_id!)))
  const dioScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'diocese' && r.scope_id).map((r) => r.scope_id!)))
  const distScopeIds = Array.from(new Set(roleRows.filter((r) => r.scope === 'district' && r.scope_id).map((r) => r.scope_id!)))

  const scopeNameMap: Record<string, string> = {}
  const [congNames, dioNames, distNames] = await Promise.all([
    congScopeIds.length > 0 ? supabase.from('congregations').select('id, name, nev_hu').in('id', congScopeIds) : Promise.resolve({ data: [] }),
    dioScopeIds.length > 0 ? supabase.from('dioceses').select('id, name').in('id', dioScopeIds) : Promise.resolve({ data: [] }),
    distScopeIds.length > 0 ? supabase.from('districts').select('id, name').in('id', distScopeIds) : Promise.resolve({ data: [] }),
  ])
  for (const c of (congNames.data || []) as Array<{ id: string; name: string | null; nev_hu: string | null }>) {
    scopeNameMap[c.id] = c.nev_hu || c.name || '—'
  }
  for (const d of (dioNames.data || []) as Array<{ id: string; name: string | null }>) scopeNameMap[d.id] = d.name || '—'
  for (const d of (distNames.data || []) as Array<{ id: string; name: string | null }>) scopeNameMap[d.id] = d.name || '—'

  const scopeNev = (scope: ProfileScope, scopeId: string | null) =>
    scope === 'system' ? 'Teljes rendszer' : scopeId ? scopeNameMap[scopeId] || '—' : '—'

  // ── Strukturált előzmények (fail-soft: hiányzó tábla / RLS → üres) ────────
  let serviceHistory: ProfileDialogData['serviceHistory'] = []
  if (shRes.error) {
    console.warn('[profile] pastor_service_history olvasása sikertelen (fail-soft):', shRes.error.message)
  } else {
    // A KANONIKUS rendben (serviceHistoryLekeres) — itt NEM rendezünk át: a
    // szerkesztő ezt a rendet mutatja és menti, az összevetés erre épül.
    serviceHistory = ((shRes.data || []) as Array<{
      id: string; hely: string; szerep: string | null
      ev_tol: number | null; ev_ig: number | null; megjegyzes: string | null; sorrend: number | null
    }>).map((r) => ({ id: r.id, hely: r.hely, szerep: r.szerep, evTol: r.ev_tol, evIg: r.ev_ig, megjegyzes: r.megjegyzes }))
  }

  // ── Automatikus hely-napló (fail-soft, amíg a 2026-08-14-es SQL nincs élesben) ──
  let helyNaplo: ProfileDialogData['helyNaplo'] = []
  if (hnRes.error) {
    console.warn('[profile] szolgalati_hely_naplo olvasása sikertelen (fail-soft):', hnRes.error.message)
  } else {
    helyNaplo = ((hnRes.data || []) as Array<{
      id: string; congregation_nev: string | null; elozo_congregation_nev: string | null
      jelleg: string; created_at: string
    }>).map((r) => ({
      id: r.id,
      congregationNev: r.congregation_nev,
      elozoCongregationNev: r.elozo_congregation_nev,
      jelleg: r.jelleg === 'kezdeti' ? 'kezdeti' : 'valtozas',
      createdAt: r.created_at,
    }))
  }

  const createdAt = (profile?.created_at as string | null | undefined) || null
  // 2026-09-05: a `Profile` típus (lib/types/auth.ts) már ismeri a `revision`
  // oszlopot — nem kell cast; a sor `select('*')`-gal jön (2026-04-23 SQL).
  const profileRevision = profile?.revision ?? null

  const profileRoles: ProfileDialogRoleRow[] = roleRows
    .map((r) => ({
      id: r.id,
      scope: r.scope,
      scopeId: r.scope_id,
      scopeName: scopeNev(r.scope, r.scope_id),
      role: r.role,
      customLabel: r.custom_label,
      grantedAt: r.granted_at,
      approvedAt: r.approved_at,
      approvedBy: r.approved_by,
      // A Fázis-1 backfill: approved_by NULL + approved_at = a fiók created_at-ja.
      orokolt: r.approved_by == null && ugyanazABukarestiNap(r.approved_at, createdAt),
      aktiv: aktivRole?.id === r.id,
    }))
    .sort((a, b) => (ROLE_ORDER[a.role] || 99) - (ROLE_ORDER[b.role] || 99))

  // ── Egyházmegye / kerület: a lánc az igazság, a skalár csak fallback ──────
  let dioceseName: string | null = null
  let districtName: string | null = null
  if (aktivRole?.scope === 'diocese') {
    dioceseName = aktivMegyeLanc?.name || scopeNev('diocese', aktivRole.scopeId)
    districtName = aktivMegyeLanc?.districtName || null
  } else if (aktivRole?.scope === 'district') {
    districtName = scopeNev('district', aktivRole.scopeId)
  } else if (aktivLanc) {
    dioceseName = aktivLanc.dioceseName
    districtName = aktivLanc.districtName
  } else if (aktivLancRes.hiba) {
    // A lánc NEM olvasható → a fejléc gyorstárának neve (ugyanaz a feloldó, a
    // kontextusban már betöltve), hogy a felület ne „Nincs hozzárendelve"-t mondjon.
    dioceseName = access.congregationDioceseName
  }

  // Skalár-eltérés: CSAK gyülekezeti hatókörben értelmezhető (ott van lánc), és
  // csak akkor jelezzük, ha MINDKÉT oldal ismert — a NULL skalár nem „eltérés",
  // hanem kitöltetlen adat. Lánc-hibánál az ellenőrzés NEM futott le — ezt a
  // `lancHiba` szövege mondja ki, nem néma `false`.
  let dioceseElteres = false
  let dioceseNyilvantartott: string | null = null
  if (aktivLanc && profileDioceseId && aktivLanc.dioceseId && profileDioceseId !== aktivLanc.dioceseId) {
    dioceseElteres = true
    const { data: skalar, error: skalarErr } = await supabase.from('dioceses').select('name').eq('id', profileDioceseId).maybeSingle()
    if (skalarErr) lancHibak.push(`a nyilvántartott egyházmegye neve nem olvasható (${skalarErr.message})`)
    dioceseNyilvantartott = ((skalar as { name?: string | null } | null)?.name) || null
  }
  // Skalár-fallback: ha nincs lánc (nincs gyülekezet), de a skalár ad nevet.
  if (!dioceseName && !aktivRole && profileDioceseId) {
    const megye = await loadEgyhazmegyeLanc(supabase, profileDioceseId)
    if (megye.hiba) lancHibak.push(megye.hiba)
    dioceseName = megye.lanc?.name || null
    districtName = districtName || megye.lanc?.districtName || null
  }
  const lancHiba = lancHibak.length > 0 ? lancHibak.join('; ') : null

  // ── E-mail: az AUTH a kanonikus (ezzel lép be); a profiles.email csak jelzés ──
  const emailAuth = user.email || null
  const emailNyilvantartott = (profile?.email as string | null | undefined) || null
  const emailElteres = Boolean(
    emailAuth && emailNyilvantartott && emailAuth.trim().toLowerCase() !== emailNyilvantartott.trim().toLowerCase(),
  )

  // ── Profilkép: EGY feloldó (D5) ─────────────────────────────────────────────
  const picture = (user.user_metadata?.picture as string | undefined) || null
  const avatarSource = pastorProfileCompat.row?.avatar_source ?? null
  const avatarUrl = resolveAvatarUrl({
    source: avatarSource,
    photoUrl: pastorProfileCompat.row?.photo_url ?? null,
    metadataAvatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
    picture,
  })

  const aktivScopeName = aktivRole
    ? aktivRole.scope === 'congregation'
      ? aktivLanc?.nevHu || aktivLanc?.name || scopeNev('congregation', aktivRole.scopeId)
      : scopeNev(aktivRole.scope, aktivRole.scopeId)
    : ''
  // Az aktív gyülekezet neve: a láncból; lánc-hibánál a kontextus gyorstárából
  // (a fejléc-pill ugyanezt mutatja — így a két hely nem mond mást).
  const congregationName = aktivLanc
    ? aktivLanc.nevHu || aktivLanc.name
    : aktivLancRes.hiba
      ? access.congregationName
      : null

  return {
    data: {
      id: user.id,
      email: emailAuth,
      emailNyilvantartott,
      emailElteres,
      fullName: (profile?.full_name as string | null | undefined) || (user.user_metadata?.full_name as string | undefined) || null,
      phone: (profile?.phone as string | null | undefined) || null,
      birthDate: (profile?.birth_date as string | null | undefined) || null,
      role: typeof profile?.role === 'string' ? profile.role : null,
      status: (profile?.status as string | undefined) || 'pending',
      createdAt,
      revision: typeof profileRevision === 'number' ? profileRevision : null,
      aktiv: aktivRole
        ? { id: aktivRole.id, role: aktivRole.role, customLabel: aktivRole.customLabel, scope: aktivRole.scope, scopeName: aktivScopeName }
        : null,
      profileRolesFeloldhato: access.profileRolesFeloldhato,
      congregationName,
      congregationOfficialName: aktivLanc && aktivLanc.nevHu && aktivLanc.name && aktivLanc.name !== aktivLanc.nevHu ? aktivLanc.name : null,
      dioceseName,
      districtName,
      dioceseElteres,
      dioceseNyilvantartott,
      lancHiba,
      nyilvantartottCongregationName: nyilvantartottLanc ? nyilvantartottLanc.nevHu || nyilvantartottLanc.name : null,
      avatarUrl,
      avatarSource,
      googlePictureElerheto: Boolean(picture),
      extensionReady: pastorProfileCompat.extensionReady,
      extensionMessage: pastorProfileCompat.extensionMessage || null,
      pastorProfile: {
        displayTitle: pastorProfileCompat.row?.display_title || '',
        address: pastorProfileCompat.row?.address || '',
        emergencyPhone: pastorProfileCompat.row?.emergency_phone || '',
        serviceStartedAt: pastorProfileCompat.row?.service_started_at || '',
        previousServicePlaces: (pastorProfileCompat.row?.previous_service_places || []).filter(Boolean),
        previousRoles: (pastorProfileCompat.row?.previous_roles || []).filter(Boolean),
        bio: pastorProfileCompat.row?.bio || '',
        ministryNotes: pastorProfileCompat.row?.ministry_notes || '',
      },
      serviceHistory,
      helyNaplo,
      profileRoles,
    },
  }
}

// ── Mentés ───────────────────────────────────────────────────────────────────

type AlapMezok = { fullName: string | null; phone: string | null; birthDate: string | null }

const alapEgyezik = (a: AlapMezok, b: AlapMezok) =>
  (a.fullName || '') === (b.fullName || '') && (a.phone || '') === (b.phone || '') && (a.birthDate || '') === (b.birthDate || '')

export async function saveProfileDetails(payload: ProfileSaveInput): Promise<ProfileSaveResult> {
  const parsed = profileSaveSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors, elso } = zodHibakMezonkent(parsed.error)
    return { error: elso, fieldErrors }
  }
  const data = parsed.data

  // Jövőbeli dátum-kapu — a „ma" a szerveren Bukarest szerint.
  const jovoHibak = jovobeliDatumHibak(data, maiNapKulcs('Europe/Bucharest'))
  if (Object.keys(jovoHibak).length > 0) {
    return { error: Object.values(jovoHibak)[0], fieldErrors: jovoHibak }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Nincs bejelentkezett felhasználó.' }

  // A mentés ELŐTTI állapot — az audit a változott mezők NEVEIT rögzíti.
  const [{ data: elozoProfil }, elozoPastor] = await Promise.all([
    supabase.from('profiles').select('id, full_name, phone, birth_date, revision').eq('id', user.id).maybeSingle(),
    getPastorProfileCompat(supabase, user.id),
  ])
  if (!elozoProfil) {
    return { error: 'A profil nem található. A biztonságos profilfrissítés nem hoz létre új jogosultsági rekordot.' }
  }
  // FAIL-CLOSED, MINDEN ÍRÁS ELŐTT: ha a mentés előtti bővített profil ismeretlen
  // hibával nem olvasható, nem írunk — különben az upsert egy ismeretlen
  // állapotot írna felül, és az audit minden mezőt hamisan „változott"-nak látna.
  if (elozoPastor.readError) {
    return {
      error: `A mentés előtti profiladatok nem olvashatók (${elozoPastor.readError}) — a mentés nem indult el, hogy ne írjunk felül ismeretlen állapotot. Próbáld újra.`,
    }
  }
  const elozo = elozoProfil as { full_name: string | null; phone: string | null; birth_date: string | null; revision: number | null }

  const ujAlap = {
    full_name: data.fullName,
    phone: data.phone || null,
    birth_date: data.birthDate || null,
  }

  // ── 1) profiles — REVISION-KAPU ────────────────────────────────────────────
  // `.eq('revision', expected)`: ha közben más írta a sort, 0 sor jön vissza.
  // De a revision-t az óránkénti last_seen_at-heartbeat is bumpolja, ezért egy
  // eltérés csak akkor ütközés, ha a SZERKESZTHETŐ mezők is elmozdultak a
  // betöltés óta — különben a friss revision-nel egyszer újrapróbáljuk.
  async function profilUpdate(revision: number | null) {
    let q = supabase.from('profiles').update(ujAlap).eq('id', user!.id)
    if (revision != null) q = q.eq('revision', revision)
    return q.select('id').maybeSingle()
  }

  let expected = data.expectedRevision
  let { data: updatedProfile, error: profileError } = await profilUpdate(expected)
  if (!profileError && !updatedProfile && expected != null) {
    const eloAlap: AlapMezok = { fullName: elozo.full_name, phone: elozo.phone, birthDate: elozo.birth_date }
    if (data.betoltottAlap && alapEgyezik(eloAlap, data.betoltottAlap) && elozo.revision != null) {
      expected = elozo.revision
      ;({ data: updatedProfile, error: profileError } = await profilUpdate(expected))
    }
  }
  if (profileError) {
    return { error: `A profil mentése sikertelen: ${profileError.message}` }
  }
  if (!updatedProfile) {
    return {
      error:
        'A profilod közben módosult (másik eszközön vagy a varázslóban) — töltsd újra az ablakot, és mentsd újra a változtatásokat.',
    }
  }

  // ── 2) auth metaadat: a név szinkronja (a fotót KÜLÖN akció kezeli) ───────
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name: data.fullName } })
  if (authError) {
    return { error: `A felhasználói metaadatok frissítése sikertelen: ${authError.message}` }
  }

  // ── 3) pastor_profiles — a legacy previous_service_places-t NEM írjuk ─────
  const pastorProfile = {
    user_id: user.id,
    display_title: data.displayTitle || null,
    address: data.address || null,
    emergency_phone: data.emergencyPhone || null,
    service_started_at: data.serviceStartedAt || null,
    previous_roles: data.previousRoles.map((r) => r.trim()).filter(Boolean),
    bio: data.bio.trim() || null,
    ministry_notes: data.ministryNotes.trim() || null,
  }
  const pastorSave = await supabase.from('pastor_profiles').upsert(pastorProfile, { onConflict: 'user_id' })
  const extensionReady = !pastorSave.error
  if (pastorSave.error && !isMissingPastorProfileError(pastorSave.error)) {
    return { error: `A bővített lelkipásztori profil mentése sikertelen: ${pastorSave.error.message}` }
  }

  // ── 4) pastor_service_history — KANONIKUS, insert új → delete régi ────────
  let warning: string | undefined
  let shValtozott = false
  if (extensionReady) {
    // UGYANAZ a kanonikus rend, mint a betöltésnél — az összevetés csak így igaz.
    const { data: regiSorok, error: regiErr } = await serviceHistoryLekeres(supabase, user.id)
    if (regiErr) {
      warning = `A szolgálati előzmények nem menthetők (a többi adat mentve): ${regiErr.message}`
    } else {
      const regi = (regiSorok || []) as Array<{ id: string; hely: string; szerep: string | null; ev_tol: number | null; ev_ig: number | null; megjegyzes: string | null }>
      shValtozott = shValtozottE(
        regi.map((r) => ({ hely: r.hely, szerep: r.szerep, evTol: r.ev_tol, evIg: r.ev_ig, megjegyzes: r.megjegyzes })),
        data.serviceHistory,
      )

      if (shValtozott) {
        // Sorrend: ELŐBB az új sorok, és csak sikeres beszúrás után a régiek
        // törlése — hiba esetén így SOSEM vész el adat (legfeljebb duplikátum
        // marad, amit a figyelmeztetés kimond).
        if (data.serviceHistory.length > 0) {
          const rows = data.serviceHistory.map((s, idx) => ({
            user_id: user.id,
            hely: s.hely.trim(),
            szerep: s.szerep.trim() || null,
            ev_tol: s.evTol,
            ev_ig: s.evIg,
            megjegyzes: s.megjegyzes.trim() || null,
            sorrend: idx,
          }))
          const { error: insErr } = await supabase.from('pastor_service_history').insert(rows)
          if (insErr) {
            return { error: `A szolgálati előzmények mentése sikertelen (a többi adat mentve): ${insErr.message}` }
          }
        }
        if (regi.length > 0) {
          // MEMORY: sok azonosítós `.in()` → 414; 80-asával darabolva.
          const ids = regi.map((r) => r.id)
          for (let i = 0; i < ids.length; i += 80) {
            const { error: delErr } = await supabase
              .from('pastor_service_history')
              .delete()
              .eq('user_id', user.id)
              .in('id', ids.slice(i, i + 80))
            if (delErr) {
              warning = `Az új szolgálati előzmények mentve, de a régi sorok törlése nem sikerült — duplikátumok maradhattak. Töltsd újra és ellenőrizd. (${delErr.message})`
              break
            }
          }
        }
      }
    }
  }

  // ── 5) audit — a VÁLTOZOTT MEZŐK NEVEI (értékek nélkül) ─────────────────
  const changed: string[] = []
  if ((elozo.full_name || '') !== ujAlap.full_name) changed.push('full_name')
  if ((elozo.phone || '') !== (ujAlap.phone || '')) changed.push('phone')
  if ((elozo.birth_date || '') !== (ujAlap.birth_date || '')) changed.push('birth_date')
  const ep = elozoPastor.row
  if (extensionReady) {
    if ((ep?.display_title || '') !== (pastorProfile.display_title || '')) changed.push('display_title')
    if ((ep?.address || '') !== (pastorProfile.address || '')) changed.push('address')
    if ((ep?.emergency_phone || '') !== (pastorProfile.emergency_phone || '')) changed.push('emergency_phone')
    if ((ep?.service_started_at || '') !== (pastorProfile.service_started_at || '')) changed.push('service_started_at')
    if (JSON.stringify(ep?.previous_roles || []) !== JSON.stringify(pastorProfile.previous_roles)) changed.push('previous_roles')
    if ((ep?.bio || '') !== (pastorProfile.bio || '')) changed.push('bio')
    if ((ep?.ministry_notes || '') !== (pastorProfile.ministry_notes || '')) changed.push('ministry_notes')
    if (shValtozott) changed.push('service_history')
  }
  if (changed.length > 0) {
    await logAuditEvent(
      { action: 'profile.update', targetTable: 'profiles', targetId: user.id, metadata: { changed } },
      supabase,
    )
  }

  revalidatePath('/', 'layout')
  const latest = await getProfileDialogData()
  const extensionMessage = pastorSave.error
    ? 'Az alap profil sikeresen frissült. A bővített lelkipásztori profilhoz még futtatni kell az SQL bővítést.'
    : null

  return {
    success: extensionReady ? 'A profil sikeresen frissült.' : extensionMessage || 'Az alap profil sikeresen frissült.',
    warning,
    extensionReady,
    data: 'data' in latest ? latest.data : null,
  }
}

// ── Profilkép ────────────────────────────────────────────────────────────────
//
// D6: szerver-akció, a felhasználó SAJÁT szerver-kliensével (a `logos` vödör
// B6-policyjának `profiles/{auth.uid()}` ága), FIX objektumnévvel
// (`profiles/{uid}/avatar.{ext}`) — így az upsert valóban felülír, nem gyűlnek
// a timestamp-nevű árvák. A régi variánsok (más kiterjesztés, régi
// `{timestamp}-{név}` fájlok) törlése FAIL-SOFT: a döntés (`avatar_source`) az
// adatbázisban él, a tárhely-higiénia nem blokkolhat — de a hívó a
// figyelmeztetést megkapja (néma hiba tilos).
//
// ⚠️ A vödör PUBLIKUS (a címer a /gy/[slug] oldalon kell). A profilkép privát
//    vödörbe költöztetése (aláírt URL) KÜLÖN döntés — lásd a brief 8. pontját.

const PROFILKEP_MAPPA = (uid: string) => `profiles/${uid}`

async function torolRegiProfilkepeket(supabase: SupabaseServerClient, uid: string, kivetel?: string): Promise<string | undefined> {
  const mappa = PROFILKEP_MAPPA(uid)
  const { data: lista, error: listErr } = await supabase.storage.from('logos').list(mappa, { limit: 100 })
  if (listErr) return `A korábbi képfájlok listázása nem sikerült (a kép beállítása ettől független): ${listErr.message}`
  const utak = (lista || [])
    .map((o) => `${mappa}/${o.name}`)
    .filter((p) => p !== kivetel)
  if (utak.length === 0) return undefined
  const { error: rmErr } = await supabase.storage.from('logos').remove(utak)
  if (rmErr) {
    return `A korábbi képfájl(ok) törlése nem sikerült — a tárhelyen maradtak, a profilról eltűntek: ${rmErr.message}`
  }
  return undefined
}

/** `avatar_source` + `photo_url` írása; ha az oszlop még hiányzik, csak a photo_url-t írjuk és figyelmeztetünk. */
async function irAvatarDontes(
  supabase: SupabaseServerClient,
  uid: string,
  source: 'upload' | 'google' | 'none',
  photoUrl: string | null,
): Promise<{ error?: string; warning?: string; sourceMentve: boolean }> {
  const teljes = await supabase
    .from('pastor_profiles')
    .upsert({ user_id: uid, photo_url: photoUrl, avatar_source: source }, { onConflict: 'user_id' })
  if (!teljes.error) return { sourceMentve: true }
  if (isMissingColumnError(teljes.error, 'avatar_source')) {
    const csakUrl = await supabase
      .from('pastor_profiles')
      .upsert({ user_id: uid, photo_url: photoUrl }, { onConflict: 'user_id' })
    if (csakUrl.error) return { error: `A profilkép mentése sikertelen: ${csakUrl.error.message}`, sourceMentve: false }
    return { warning: AVATAR_SOURCE_SQL_HINT, sourceMentve: false }
  }
  if (isMissingPastorProfileError(teljes.error)) {
    return { error: 'A bővített profil táblája még hiányzik — a profilképhez előbb futtasd a profil SQL-bővítést.', sourceMentve: false }
  }
  return { error: `A profilkép mentése sikertelen: ${teljes.error.message}`, sourceMentve: false }
}

export async function uploadProfilePhoto(formData: FormData): Promise<ProfilePhotoResult> {
  const access = await getEffectiveAccessContext()
  const { user, supabase } = access
  if (!user) return { error: 'Nincs bejelentkezve.' }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) return { error: 'Nincs kiválasztott fájl.' }
  if (file.size === 0) return { error: 'A kiválasztott fájl üres.' }
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return { error: 'A kép mérete nem lehet több, mint 2 MB.' }
  const ext = PROFILE_PHOTO_MIME[file.type]
  if (!ext) return { error: 'Csak JPG, PNG vagy WEBP formátum engedélyezett (a HEIC/HEIF nem).' }

  const path = `${PROFILKEP_MAPPA(user.id)}/avatar.${ext}`
  const { error: upErr } = await supabase.storage.from('logos').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type,
  })
  if (upErr) {
    const rls = /row-level security|violates|not authorized|permission/i.test(upErr.message)
    return {
      error: rls
        ? 'A tárhely nem engedi a profilkép feltöltését — a `logos` vödör saját-mappa (profiles/…) jogosultsága hiányzik. Futtasd a 2026-09-05-profil-pontossag.sql fájlt, majd próbáld újra.'
        : `A feltöltés nem sikerült: ${upErr.message}`,
    }
  }

  const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path)
  if (!urlData?.publicUrl) return { error: 'A feltöltött kép nyilvános hivatkozása nem hozható létre.' }
  // Fix objektumnév → a böngésző/CDN a RÉGI képet mutatná; a verzió-paraméter
  // minden feltöltésnél új URL-t ad (a tárhelyen egy fájl marad).
  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`

  const dontes = await irAvatarDontes(supabase, user.id, 'upload', publicUrl)
  if (dontes.error) return { error: dontes.error }

  // A fejléc gyors forrása (SSR) — a metaadat is a feltöltött képre áll.
  const { error: authErr } = await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
  const warnings = [dontes.warning, authErr ? `A metaadat frissítése nem sikerült: ${authErr.message}` : undefined]
  warnings.push(await torolRegiProfilkepeket(supabase, user.id, path))

  await logAuditEvent({ action: 'profile.update', targetTable: 'pastor_profiles', targetId: user.id, metadata: { changed: ['photo_url', 'avatar_source'] } }, supabase)
  revalidatePath('/', 'layout')
  return {
    ok: true,
    avatarUrl: publicUrl,
    avatarSource: dontes.sourceMentve ? 'upload' : null,
    warning: warnings.filter(Boolean).join(' ') || undefined,
  }
}

export async function removeProfilePhoto(): Promise<ProfilePhotoResult> {
  const { user, supabase } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezve.' }

  const dontes = await irAvatarDontes(supabase, user.id, 'none', null)
  if (dontes.error) return { error: dontes.error }
  // A régi döntés ('avatar_url' a metaadatban) sem maradhat aktív.
  const { error: authErr } = await supabase.auth.updateUser({ data: { avatar_url: null } })
  const warnings = [dontes.warning, authErr ? `A metaadat frissítése nem sikerült: ${authErr.message}` : undefined]
  warnings.push(await torolRegiProfilkepeket(supabase, user.id))

  await logAuditEvent({ action: 'profile.update', targetTable: 'pastor_profiles', targetId: user.id, metadata: { changed: ['photo_url', 'avatar_source'] } }, supabase)
  revalidatePath('/', 'layout')
  // Ha az avatar_source oszlop még hiányzik, a Google-kép az örökölt szabállyal
  // VISSZAJÖNNE — ezt a hívó a figyelmeztetésből tudja meg, nem néma meglepetésből.
  const picture = (user.user_metadata?.picture as string | undefined) || null
  const visszaesik = !dontes.sourceMentve && picture
  return {
    ok: true,
    avatarUrl: visszaesik ? picture : null,
    avatarSource: dontes.sourceMentve ? 'none' : null,
    warning: warnings.filter(Boolean).join(' ') || undefined,
  }
}

export async function applyGooglePhoto(): Promise<ProfilePhotoResult> {
  const { user, supabase } = await getEffectiveAccessContext()
  if (!user) return { error: 'Nincs bejelentkezve.' }
  const picture = (user.user_metadata?.picture as string | undefined) || null
  if (!picture) return { error: 'Ehhez a fiókhoz nem tartozik Google-fiók-kép.' }

  // A Google-URL-t NEM írjuk a photo_url-ba (mulandó lh3-hivatkozás): a döntés
  // az avatar_source, a kép forrása mindig a friss metaadat `picture`.
  const dontes = await irAvatarDontes(supabase, user.id, 'google', null)
  if (dontes.error) return { error: dontes.error }
  if (!dontes.sourceMentve) {
    return { error: AVATAR_SOURCE_SQL_HINT }
  }
  const { error: authErr } = await supabase.auth.updateUser({ data: { avatar_url: picture } })
  const warnings = [authErr ? `A metaadat frissítése nem sikerült: ${authErr.message}` : undefined]
  warnings.push(await torolRegiProfilkepeket(supabase, user.id))

  await logAuditEvent({ action: 'profile.update', targetTable: 'pastor_profiles', targetId: user.id, metadata: { changed: ['avatar_source'] } }, supabase)
  revalidatePath('/', 'layout')
  return { ok: true, avatarUrl: picture, avatarSource: 'google', warning: warnings.filter(Boolean).join(' ') || undefined }
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
