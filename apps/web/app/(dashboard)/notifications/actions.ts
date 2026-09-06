'use server'

import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import { MEGOLDVA_CIM_ELOTAG } from '@/lib/notifications/uzenetek-shared'
import { revalidatePath } from 'next/cache'

async function getNotificationAccess() {
  const ctx = await getEffectiveAccessContext()
  return {
    supabase: ctx.supabase,
    userId: ctx.userId,
    congId: ctx.effectiveCongregationId,
    // 2026-09-05: a döntés FELADÓJA a jóváhagyó gyülekezet — a neve a sorba kerül.
    congNev: ctx.congregationName,
    role: ctx.role,
    esperes: ctx.esperes,
  }
}

/**
 * DIAGNOSTICS P1-6: szerepkör-check helper. Csak `lelkesz` (a gyülekezet
 * lelkésze) vagy felsőbb adminisztrátor (esperes flag, ami magában foglalja
 * az egyhazmegyei_admin / egyhazkeruleti_admin / admin / master szerepköröket
 * is) hagyhat jóvá / utasíthat el admin-access kérelmet. Egy bejelentkezett,
 * de nem-lelkész user (pl. konyvelo, szamvevo, custom) NEM kaphat hozzáférést.
 */
function canManageAdminAccessRequest(role: string | null | undefined, esperes: boolean): boolean {
  return role === 'lelkesz' || esperes
}

/**
 * 2026-09-05: a döntés után a LELKÉSZ SAJÁT kérelem-értesítése „megoldva"
 * állapotba kerül — eddig a „Válaszra vár" pilula és a Jóváhagyás/Elutasítás
 * gombpár addig maradt a buborékon, amíg a lelkész archiválta (a gombok
 * pedig már csak „A kérelem már elbírálásra került." hibát adtak).
 *
 * A KÉRELMEZŐ (rendszergazda) FRISS döntés-sora SZÁNDÉKOSAN nincs itt
 * (`user_id ≠ kérelmező`): azt az `insertErtesites` már BESZÚRÁSKOR
 * `megoldva: true`-val írja (2026-09-05, P3-utómunka, bírálói P2 — a sor MAGA a
 * döntés, nincs mire várni; egy szabály a visszatöltéssel). Ezért itt nem kell
 * és NEM SZABAD hozzányúlni: a cím-előtag tartalék-ága különben a kérelmező
 * „Hozzáférés elutasítva" címét is átírná („Megoldva — … (elutasítva)"), ha az
 * elbíráló globális jogú (az `ertesitesek` RLS-e a saját sor MELLETT a globális
 * hozzáférésűnek is enged), a sima lelkész pedig az RLS miatt nem is látja.
 *
 * Az `ertesitesek.megoldva` oszlop csak a 2026-08-11-ertesites-megoldva.sql
 * után létezik — hiányzó oszlopnál a felület által is értett cím-előtag a
 * tartalék (ugyanaz a minta, mint lib/google-drive/alerts.ts). Soha nem dob:
 * a hiba szövegként megy vissza, a hívó `warning`-ba fűzi.
 */
async function kerelemErtesitesMegoldva(
  supabase: Awaited<ReturnType<typeof getEffectiveAccessContext>>['supabase'],
  requestId: string,
  kerelmezoUserId: string,
  dontes: 'jóváhagyva' | 'elutasítva',
): Promise<string | null> {
  const { data, error } = await supabase
    .from('ertesitesek')
    .select('id, cim, megoldva')
    .eq('admin_request_id', requestId)
    .neq('user_id', kerelmezoUserId)
  if (error) {
    // Az oszlop hiánya (a 2026-09-05-ös SQL előtt) nem hiba a lelkésznek —
    // ilyenkor a kérelem-sor sem hordoz admin_request_id-t, nincs mit jelölni.
    if (/admin_request_id|megoldva/i.test(error.message)) return null
    return error.message
  }
  const sorok = (data ?? []) as Array<{ id: string; cim: string | null; megoldva?: boolean | null }>
  const nyitottak = sorok.filter((s) => s.megoldva !== true && !(s.cim ?? '').startsWith(MEGOLDVA_CIM_ELOTAG))
  if (nyitottak.length === 0) return null

  const most = new Date().toISOString()
  let utolsoHiba: string | null = null
  for (const sor of nyitottak) {
    const { error: ujHiba } = await supabase
      .from('ertesitesek')
      .update({ megoldva: true, megoldva_at: most })
      .eq('id', sor.id)
    if (!ujHiba) continue
    // Tartalék — a megoldva-oszlop még nincs meg: a cím-előtagot a felület érti.
    const ujCim = `${MEGOLDVA_CIM_ELOTAG}${(sor.cim ?? 'Hozzáférési kérelem').trim()} (${dontes})`
    const { error: regiHiba } = await supabase.from('ertesitesek').update({ cim: ujCim }).eq('id', sor.id)
    if (regiHiba) utolsoHiba = regiHiba.message
  }
  return utolsoHiba
}

export async function approveAdminAccess(requestId: string, hours: number = 24) {
  const { supabase, userId, congId, congNev, role, esperes } = await getNotificationAccess()
  if (!userId || !congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canManageAdminAccessRequest(role, esperes)) {
    return { error: 'Csak lelkész vagy felsőbb adminisztrátor hagyhat jóvá hozzáférési kérelmet.' }
  }

  // Kérelem lekérdezés
  const { data: request } = await supabase.from('admin_access_requests').select('id, admin_user_id, congregation_id, status').eq('id', requestId).single()
  if (!request) return { error: 'A kérelem nem található.' }
  if (request.status !== 'pending') return { error: 'A kérelem már elbírálásra került.' }
  if (request.congregation_id !== congId) return { error: 'Nincs jogosultsága ehhez a kérelemhez.' }

  // Jóváhagyás
  const dontesIdeje = new Date().toISOString()
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  const { error } = await supabase.from('admin_access_requests').update({
    status: 'approved', approved_at: dontesIdeje, expires_at: expiresAt,
  }).eq('id', requestId)
  if (error) return { error: `Hiba: ${error.message}` }

  // Értesítés a kérelmezőnek. 2026-09-05: `congregation_id` is megy — enélkül az
  // `ertesitesek_szint_insert` policy (congregation_id IS NOT NULL) sima
  // lelkésznél elutasította a beszúrást, és a rendszergazda SOHA nem kapta meg.
  // 2026-09-05 (P3-utómunka, bírálói P2): a sor MAGA A DÖNTÉS → már beszúráskor
  // `megoldva` (a tárolt jel EGY szabály szerint, mint az SQL-visszatöltés után);
  // a felület enélkül is tudja (success + kérelem-hivatkozás = döntés-sor).
  const ertesites = await insertErtesites(
    supabase,
    {
      user_id: request.admin_user_id,
      congregation_id: request.congregation_id,
      tipus: 'success',
      cim: 'Hozzáférés jóváhagyva',
      uzenet: `A hozzáférési kérelme jóváhagyásra került. ${hours} órán belül hozzáférhet a gyülekezet adataihoz.`,
      olvasva: false,
      admin_request_id: request.id,
      megoldva: true,
      megoldva_at: dontesIdeje,
      ...feladoMezok('gyulekezet', congNev, congId),
    },
    { forras: 'admin-access-jovahagyas' },
  )
  const megoldvaHiba = await kerelemErtesitesMegoldva(supabase, request.id, request.admin_user_id, 'jóváhagyva')

  revalidatePath('/', 'layout')
  const figyelmeztetesek: string[] = []
  if (ertesites.error) {
    figyelmeztetesek.push(`A jóváhagyás megtörtént, de a kérelmező értesítése nem ment ki: ${ertesites.error}`)
  }
  if (megoldvaHiba) {
    figyelmeztetesek.push(`A saját kérelem-értesítés „megoldva" jelölése nem sikerült: ${megoldvaHiba}`)
  }
  if (figyelmeztetesek.length > 0) return { success: true, warning: figyelmeztetesek.join(' ') }
  return { success: true }
}

export async function denyAdminAccess(requestId: string) {
  const { supabase, userId, congId, congNev, role, esperes } = await getNotificationAccess()
  if (!userId || !congId) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!canManageAdminAccessRequest(role, esperes)) {
    return { error: 'Csak lelkész vagy felsőbb adminisztrátor utasíthat el hozzáférési kérelmet.' }
  }

  const { data: request } = await supabase.from('admin_access_requests').select('id, admin_user_id, congregation_id, status').eq('id', requestId).single()
  if (!request) return { error: 'A kérelem nem található.' }
  if (request.status !== 'pending') return { error: 'A kérelem már elbírálásra került.' }
  if (request.congregation_id !== congId) return { error: 'Nincs jogosultsága ehhez a kérelemhez.' }

  const dontesIdeje = new Date().toISOString()
  const { error } = await supabase.from('admin_access_requests').update({
    status: 'denied', denied_at: dontesIdeje,
  }).eq('id', requestId)
  if (error) return { error: `Hiba: ${error.message}` }

  // A sor MAGA A DÖNTÉS → már beszúráskor `megoldva` (lásd a jóváhagyás ágát).
  const ertesites = await insertErtesites(
    supabase,
    {
      user_id: request.admin_user_id,
      congregation_id: request.congregation_id,
      tipus: 'danger',
      cim: 'Hozzáférés elutasítva',
      uzenet: 'A hozzáférési kérelme elutasításra került.',
      olvasva: false,
      admin_request_id: request.id,
      megoldva: true,
      megoldva_at: dontesIdeje,
      ...feladoMezok('gyulekezet', congNev, congId),
    },
    { forras: 'admin-access-elutasitas' },
  )
  const megoldvaHiba = await kerelemErtesitesMegoldva(supabase, request.id, request.admin_user_id, 'elutasítva')

  revalidatePath('/', 'layout')
  const figyelmeztetesek: string[] = []
  if (ertesites.error) {
    figyelmeztetesek.push(`Az elutasítás megtörtént, de a kérelmező értesítése nem ment ki: ${ertesites.error}`)
  }
  if (megoldvaHiba) {
    figyelmeztetesek.push(`A saját kérelem-értesítés „megoldva" jelölése nem sikerült: ${megoldvaHiba}`)
  }
  if (figyelmeztetesek.length > 0) return { success: true, warning: figyelmeztetesek.join(' ') }
  return { success: true }
}
