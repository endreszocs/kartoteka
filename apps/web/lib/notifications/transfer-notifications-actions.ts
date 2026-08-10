'use server'

/**
 * Átjelentkezési értesítések (member_transfer_notifications) server actions.
 *
 * 2026-04-30 — Endre kérése: ha kiköltözés-import történik, a célgyülekezet
 * lelkésze rendszerüzenetet kap, és el/elutasíthatja az átjelentkezési kérelmet.
 *
 * Workflow:
 *   1. A forrás-gyülekezet lelkésze importálja az elkoltozott rekordot
 *      `hova_congregation_id` mezővel
 *   2. AFTER INSERT trigger generál egy pending member_transfer_notification-t
 *   3. A célgyülekezet lelkésze az inboxában látja (listInbound)
 *   4. Eldönti: respondToTransferNotification('accepted'|'rejected')
 *      - accepted: a tag congregation_id-je az új gyülekezetre vált
 *      - rejected: a tag marad az eredeti gyülekezetnél
 *   5. Mindkét esetben a forrás-lelkész egy ertesitesek üzenetet kap
 *   6. F8c (2026-07-25) — ELFOGADÁSKOR best-effort formaságok: automatikus
 *      visszaigazoló válaszlevél a fogadó iktatójában KIMENŐ iratként
 *      (saveFilingEntry), a KÜLDŐ iktatójában BEJÖVŐ iratként
 *      (iktato_atadas_bejegyzes SECURITY DEFINER RPC — auth-horgonya az
 *      imént elbírált kérelem), és a levél szövege in-app üzenetként a
 *      küldő lelkészeinek. Ezek hibája warnings-ként megy vissza, a
 *      tag-átvétel (respond-RPC) sikerét NEM befolyásolja.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { saveFilingEntry } from '@/app/(dashboard)/iktato/actions'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { buildAtadasValaszlevelHtml } from '@/lib/iktato/atadas-valaszlevel'
import { getCongregationOfficials } from '@/lib/profiles/officials'
import { createClient } from '@/lib/supabase/server'

// ─── Típusok ─────────────────────────────────────────────────────────────

export interface MemberSnapshot {
  csaladnev: string | null
  k_nev: string | null
  szcs_nev: string | null
  sz_datum: string | null
  ferfi: boolean | null
  cnp: string | null
  cim: string | null
  megjegyzes: string | null
  mikor: string | null
}

export interface TransferNotification {
  id: string
  source_congregation_id: string
  target_congregation_id: string
  szemely_id: number
  elkoltozott_id: number
  member_snapshot: MemberSnapshot
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  read_at: string | null
  responded_at: string | null
  responded_by: string | null
  response_note: string | null
  source_congregation?: { name: string | null; nev_hu: string | null } | null
  target_congregation?: { name: string | null; nev_hu: string | null } | null
}

// ─── 1. listInbound — a célgyülekezet inboxa ─────────────────────────────

export async function listInboundTransferNotifications(options: {
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  limit?: number
} = {}): Promise<{ data?: TransferNotification[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    return { error: 'Az átjelentkezési értesítések csak gyülekezeti scope-ban érhetők el.' }
  }

  const supabase = await createClient()
  const status = options.status || 'pending'
  const limit = options.limit || 50

  let query = supabase
    .from('member_transfer_notifications')
    .select(`
      *,
      source_congregation:congregations!source_congregation_id(name, nev_hu),
      target_congregation:congregations!target_congregation_id(name, nev_hu)
    `)
    .eq('target_congregation_id', access.effectiveCongregationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return { error: `Lekérési hiba: ${error.message}` }
  return { data: (data as TransferNotification[]) || [] }
}

// ─── 2. listOutbound — a forrás-gyülekezet által küldött kérelmek ─────────

export async function listOutboundTransferNotifications(options: {
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  limit?: number
} = {}): Promise<{ data?: TransferNotification[]; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) {
    return { error: 'Az átjelentkezési értesítések csak gyülekezeti scope-ban érhetők el.' }
  }

  const supabase = await createClient()
  const status = options.status || 'all'
  const limit = options.limit || 50

  let query = supabase
    .from('member_transfer_notifications')
    .select(`
      *,
      source_congregation:congregations!source_congregation_id(name, nev_hu),
      target_congregation:congregations!target_congregation_id(name, nev_hu)
    `)
    .eq('source_congregation_id', access.effectiveCongregationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return { error: `Lekérési hiba: ${error.message}` }
  return { data: (data as TransferNotification[]) || [] }
}

// ─── 3. count — a header badge-hez ───────────────────────────────────────

export async function countPendingTransferNotifications(): Promise<{ count: number; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { count: 0, error: 'Nincs bejelentkezett felhasználó.' }
  if (!access.effectiveCongregationId) return { count: 0 }

  const supabase = await createClient()
  const { count, error } = await supabase
    .from('member_transfer_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('target_congregation_id', access.effectiveCongregationId)
    .eq('status', 'pending')

  if (error) return { count: 0, error: error.message }
  return { count: count || 0 }
}

// ─── 4. markRead — a célgyülekezet lelkésze megnyitotta ──────────────────

export async function markTransferNotificationRead(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('member_transfer_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null) // Csak első megnyitáskor

  if (error) return { error: `Frissítési hiba: ${error.message}` }
  return { success: true }
}

// ─── 5. respond — accepted / rejected ────────────────────────────────────

const respondSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  note: z.string().trim().max(500).optional(),
})

const respondResultSchema = z.object({
  notification_id: z.string().uuid(),
  source_congregation_id: z.string().uuid(),
  target_congregation_id: z.string().uuid(),
  status: z.enum(['accepted', 'rejected']),
  changed: z.boolean(),
  portal_link_revoked: z.boolean(),
})

export async function respondToTransferNotification(input: {
  id: string
  status: 'accepted' | 'rejected'
  note?: string
}): Promise<{
  success?: boolean
  error?: string
  /** F8c: a best-effort formaságok (iktatás/értesítés) nem-blokkoló hibái. */
  warnings?: string[]
  /** F8c: a visszaigazoló levél fogadó-oldali (kimenő) iktatószáma, ha sikerült. */
  valaszIratszam?: string | null
}> {
  const parsed = respondSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const access = await getEffectiveAccessContext()
  if (!access.user) return { error: 'Nincs bejelentkezett felhasználó.' }

  const supabase = await createClient()

  // Kizárólag a best-effort visszaigazolás megjelenítési adataihoz kell
  // (tag-név, gyülekezet-nevek, szemely_id az F8c kereszt-iktatáshoz).
  // Jogosultsági vagy állapotdöntés nem támaszkodhat erre a snapshotra: azt az RPC
  // DB-live adatokból, ugyanabban a tranzakcióban végzi el.
  type CongNameRel =
    | { name: string | null; nev_hu: string | null }
    | { name: string | null; nev_hu: string | null }[]
    | null
  type TransferSnapshotRow = {
    szemely_id: number | null
    member_snapshot: unknown
    source_congregation: CongNameRel
    target_congregation: CongNameRel
  }
  let notificationSnapshot: TransferSnapshotRow | null = null
  try {
    const { data } = await supabase
      .from('member_transfer_notifications')
      .select(`
        szemely_id,
        member_snapshot,
        source_congregation:congregations!source_congregation_id(name, nev_hu),
        target_congregation:congregations!target_congregation_id(name, nev_hu)
      `)
      .eq('id', parsed.data.id)
      .maybeSingle()
    notificationSnapshot = data as unknown as TransferSnapshotRow | null
  } catch {
    // A megjelenítési snapshot hiánya nem akadályozhatja az atomikus döntést.
  }

  // Az autorizáció, a pending/idempotens állapotkezelés, a személy áthelyezése és
  // az esetleges tagi portál-link visszavonása egyetlen DB-tranzakcióban történik.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'respond_to_member_transfer_notification',
    {
      p_notification_id: parsed.data.id,
      p_status: parsed.data.status,
      p_note: parsed.data.note || null,
    },
  )

  if (rpcError) {
    return { error: 'Az átjelentkezési kérelem feldolgozása nem sikerült.' }
  }

  const result = respondResultSchema.safeParse(rpcData)
  if (!result.success) {
    return { error: 'Az átjelentkezési kérelem feldolgozása nem sikerült.' }
  }

  // F8c: a formaságok nem-blokkoló hibái — a hívó UI toastként mutatja őket.
  const warnings: string[] = []
  let valaszIratszam: string | null = null

  // Idempotens ismétlésnél az RPC changed=false eredményt ad: ilyenkor nem
  // készítünk második visszaigazolást a forrásgyülekezetnek.
  if (result.data.changed) {
    const snapshot = notificationSnapshot?.member_snapshot as Partial<MemberSnapshot> | null | undefined
    const memberName = `${snapshot?.csaladnev || ''} ${snapshot?.k_nev || ''}`.trim() || 'tag'
    const statusText = result.data.status === 'accepted' ? 'elfogadta' : 'elutasította'

    // Best effort: az átjelentkezési döntés már sikeresen, atomikusan lezárult.
    // Egy értesítési hiba ezért nem fordíthatja vissza és nem jelezheti sikertelennek.
    try {
      await supabase.from('ertesitesek').insert([{
        congregation_id: result.data.source_congregation_id,
        cim: `Átjelentkezési kérelem ${statusText === 'elfogadta' ? 'elfogadva' : 'elutasítva'}: ${memberName}`,
        uzenet: `A célgyülekezet ${statusText} ${memberName} átjelentkezési kérelmét.${
          parsed.data.note ? ' Megjegyzés: ' + parsed.data.note : ''
        }`,
        tipus: result.data.status === 'accepted' ? 'info' : 'warning',
        user_id: null,
        hivatkozas: `/notifications/sent#${result.data.notification_id}`,
      }])
    } catch {
      // Best effort: az RPC sikerét egy másodlagos értesítési hiba nem írhatja felül.
    }

    // ── F8c: ELFOGADÁS utáni formaságok (best-effort — a döntés már él) ──
    // Sorrend a kontraktus szerint: előbb a respond-RPC (fent, atomikus),
    // utána a formaságok — ezek egyike sem fordíthatja vissza az átvételt.
    if (result.data.status === 'accepted') {
      const one = (rel: CongNameRel | undefined): string | null => {
        const row = Array.isArray(rel) ? rel[0] || null : rel || null
        return (row?.nev_hu || '').trim() || (row?.name || '').trim() || null
      }
      // A hívó a FOGADÓ gyülekezet tagja — a neve az effektív kontextusból is
      // feloldható, ha a join-os snapshot nem jött össze.
      const fogadoNev =
        one(notificationSnapshot?.target_congregation) || access.congregationName || 'gyülekezetünk'
      const kuldoNev = one(notificationSnapshot?.source_congregation) || 'a küldő egyházközség'
      // Az eredeti átadó iratszám a B3-as flow-ból: az elkoltozott.megjegyzes
      // („Egyháztag-átadási igazolás — iktatószám: ÉÉÉÉ/N") a trigger által a
      // member_snapshot.megjegyzes-be másolva. Import-úton érkezett kérelemnél
      // nincs ilyen — akkor hivatkozás nélkül megy a levél.
      const eredetiIratszam =
        (snapshot?.megjegyzes || '').match(/iktat[oó]sz[aá]m:\s*(\S+)/i)?.[1] || null
      const ma = new Date().toISOString().slice(0, 10)

      // (a) Visszaigazoló levél a SAJÁT (fogadó) iktatóba — KIMENŐ irat.
      try {
        const saveRes = await saveFilingEntry({
          direction: 'outgoing',
          kelt: ma,
          subject: `Átjelentkezés visszaigazolása — ${memberName}`,
          sender_or_recipient: kuldoNev,
          external_ref_szam: eredetiIratszam,
          targykivonat: `A(z) ${fogadoNev} egyházközség elfogadta ${memberName} átjelentkezési kérelmét — visszaigazoló levél a(z) ${kuldoNev} részére.`,
          has_duplicate: false,
        })
        if ('error' in saveRes && saveRes.error) {
          warnings.push(`A visszaigazoló levél saját (kimenő) iktatása nem sikerült: ${saveRes.error}`)
        } else if ('sequenceNumber' in saveRes && typeof saveRes.sequenceNumber === 'number') {
          valaszIratszam = `${saveRes.year}/${saveRes.sequenceNumber}`
        } else {
          warnings.push('A visszaigazoló levél kimenő iktatása megtörtént, de a kiosztott iktatószám nem olvasható ki a válaszból.')
        }
      } catch (e) {
        warnings.push(`A visszaigazoló levél kimenő iktatása nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}).`)
      }

      // (b) A visszaigazolás BEJÖVŐ iktatása a KÜLDŐ gyülekezetnél — a
      // SECURITY DEFINER iktato_atadas_bejegyzes RPC-vel (auth-horgonya az
      // imént elbírált kérelem: target=hívó, source=cél irányban).
      const szemelyId = notificationSnapshot?.szemely_id
      if (typeof szemelyId === 'number' && Number.isInteger(szemelyId) && szemelyId > 0) {
        try {
          const { error: crossErr } = await supabase.rpc('iktato_atadas_bejegyzes', {
            p_szemely_id: szemelyId,
            p_target_congregation_id: result.data.source_congregation_id,
            p_direction: 'incoming',
            p_subject: `Átjelentkezés visszaigazolása — ${memberName} (érkezett: ${fogadoNev})`,
            p_sender_or_recipient: fogadoNev,
            p_kelt: ma,
            p_external_ref_szam: valaszIratszam,
            p_targykivonat: `A(z) ${fogadoNev} egyházközség elfogadta ${memberName} átjelentkezési kérelmét${eredetiIratszam ? ` (eredeti irat: ${eredetiIratszam})` : ''}.`,
          })
          if (crossErr) {
            // PGRST202 / 42883 = az RPC még nincs telepítve az adatbázisban.
            const rpcMissing =
              crossErr.code === 'PGRST202' ||
              crossErr.code === '42883' ||
              /could not find the function/i.test(crossErr.message)
            warnings.push(
              rpcMissing
                ? 'A visszaigazolás a küldő gyülekezet iktatójába NEM került be: a kereszt-gyülekezeti iktató funkció (iktato_atadas_bejegyzes) még nincs telepítve az adatbázisban.'
                : `A visszaigazolás a küldő gyülekezet iktatójába nem került be (${crossErr.message}).`,
            )
          }
        } catch (e) {
          warnings.push(`A visszaigazolás küldő-oldali iktatása nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}).`)
        }
      } else {
        warnings.push('A visszaigazolás küldő-oldali iktatásához nem sikerült kiolvasni a személy-azonosítót — a küldő iktatójába nem került bejövő irat.')
      }

      // (c) Best-effort: a válaszlevél SZÖVEGE in-app üzenetként a küldő
      // gyülekezet lelkészeinek (címzett-kör az atadas-actions mintája
      // szerint; az INSERT sima lelkésznél az ertesitesek RLS-én elbukhat —
      // ilyenkor warning, a fenti általános visszaigazoló értesítés már él).
      // 2026-08-11: a KÜLDŐ (idegen) gyülekezet lelkészeinek feloldása átkerült
      // a `get_congregation_officials` SECURITY DEFINER RPC mögé
      // (lib/profiles/officials.ts). Korábban ez közvetlen, kereszt-gyülekezeti
      // `profiles`-olvasás volt, ami CSAK a nyitott olvasási policy miatt
      // működött. Az RPC nem ad vissza e-mailt, és amíg a
      // 2026-08-11-profiles-szukites-rpc.sql nem futott le, a helper
      // automatikusan visszaesik a korábbi közvetlen lekérdezésre.
      try {
        const officials = await getCongregationOfficials(
          supabase,
          result.data.source_congregation_id,
          ['lelkesz'],
        )
        const recipientIds = new Set<string>(officials.map((o) => o.userId))

        if (recipientIds.size === 0) {
          warnings.push('A küldő gyülekezethez nem található aktív lelkész-profil — a válaszlevél szövege in-app üzenetként nem ment ki (az általános visszaigazoló értesítés így is megjelenik).')
        } else {
          const letterHtml = buildAtadasValaszlevelHtml({
            fogadoGyulekezet: fogadoNev,
            kuldoGyulekezet: kuldoNev,
            szemelyNev: memberName,
            eredetiIratszam,
            valaszIratszam: valaszIratszam || '—',
            kelt: new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }),
            lelkipasztor: access.fullName || '',
          })
          const rows = Array.from(recipientIds).map((rid) => ({
            user_id: rid,
            congregation_id: result.data.source_congregation_id,
            cim: `Átjelentkezés visszaigazolása érkezett: ${memberName}`,
            uzenet: htmlToPlainText(letterHtml),
            tipus: 'info',
            hivatkozas: '/notifications',
          }))
          const { error: notifErr } = await supabase.from('ertesitesek').insert(rows)
          if (notifErr) {
            warnings.push(`A válaszlevél in-app kézbesítését az értesítés-tábla jogosultsági szabálya (RLS) elutasította (${notifErr.message}) — az általános visszaigazoló értesítés így is megjelenik a küldőnél.`)
          }
        }
      } catch (e) {
        warnings.push(`A válaszlevél in-app kézbesítése nem sikerült (${e instanceof Error ? e.message : 'ismeretlen hiba'}).`)
      }
    }
  }

  revalidatePath('/notifications')
  revalidatePath('/tagnyilvantartas')
  return { success: true, warnings, valaszIratszam }
}

// ─── Belső segéd (nem exportált — 'use server' modul csak async function-t
// exportálhat, lásd MEMORY: nextjs16_use_server_only_async) ────────────────

/**
 * A válaszlevél HTML-je → olvasható sima szöveg az ertesitesek.uzenet
 * törzsébe (a bell-dropdown sima szövegként jelenít meg). Az atadas-actions
 * azonos nevű segédjének mintája; a style/script blokkok kidobva.
 */
function htmlToPlainText(html: string): string {
  const MAX_LEN = 6000
  const text = String(html || '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  if (text.length <= MAX_LEN) return text
  return `${text.slice(0, MAX_LEN)}\n… (a szöveg levágva — a teljes levél a fogadó gyülekezet iktatójában, a fenti iktatószámon érhető el)`
}
