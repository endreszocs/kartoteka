'use server'

/**
 * Admin kereszt-gyülekezeti egyeztetés — server actions (2026-08-09).
 *
 * A MÁR BENT LÉVŐ adatok egyeztetése: a 2026-04-26-os cross-congregation
 * infrastruktúra csak új rögzítésnél jelez; ez a felület
 *   (1) listázza az összes nyitott/elrendezett egyezést (admin_list_* RPC),
 *   (2) admin-gombbal átvizsgálja a teljes állományt (admin_scan_* RPC),
 *   (3) értesíti mindkét érintett lelkészt (Brevo e-mail + ertesitesek sor),
 *   (4) admin-döntést rögzít (resolve_cross_congregation_match RPC).
 *
 * SQL-előfeltétel: migration-docs/sql/2026-08-09-admin-kereszt-egyeztetes.sql —
 * amíg nincs lefuttatva, az actions { needsSql: true }-val térnek vissza, és a
 * felület a teendőt mutatja (graceful degradation, bevett minta).
 */

import { revalidatePath } from 'next/cache'

import { requireAdminAccess } from '@/lib/auth/admin-access'
import { sendEmail } from '@/lib/email/send'
import type {
  CrossMatchAdminListResult,
  CrossMatchAdminResolution,
  CrossMatchAdminRow,
  CrossMatchNotifyResult,
  CrossMatchScanResult,
} from './egyeztetesek-shared'

/** A PostgREST „nincs ilyen függvény" hibája = az SQL még nincs lefuttatva. */
function isMissingFunctionError(message: string | undefined, fnName: string): boolean {
  const m = (message || '').toLowerCase()
  return m.includes(fnName.toLowerCase()) && (m.includes('could not find') || m.includes('does not exist') || m.includes('schema cache'))
}

interface RawAdminMatchRow {
  id: string
  notification_type: 'new_member' | 'update_match' | 'retroactive_scan'
  confidence: CrossMatchAdminRow['confidence']
  created_at: string
  resolution: CrossMatchAdminResolution | null
  resolved_at: string | null
  admin_notified_at: string | null
  triggering_szemely_id: number
  triggering_szemely_name: string | null
  triggering_sz_datum: string | null
  triggering_cnp: string | null
  triggering_congregation_id: string
  triggering_congregation_name: string | null
  triggering_pastor_user_id: string | null
  triggering_pastor_name: string | null
  triggering_pastor_email: string | null
  matched_szemely_id: number
  matched_szemely_name: string | null
  matched_sz_datum: string | null
  matched_cnp: string | null
  matched_congregation_id: string
  matched_congregation_name: string | null
  matched_pastor_user_id: string | null
  matched_pastor_name: string | null
  matched_pastor_email: string | null
}

function mapRow(r: RawAdminMatchRow): CrossMatchAdminRow {
  return {
    id: r.id,
    notificationType: r.notification_type,
    confidence: r.confidence,
    createdAt: r.created_at,
    resolution: r.resolution,
    resolvedAt: r.resolved_at,
    adminNotifiedAt: r.admin_notified_at,
    triggering: {
      szemelyId: r.triggering_szemely_id,
      szemelyName: r.triggering_szemely_name,
      szDatum: r.triggering_sz_datum,
      cnp: r.triggering_cnp,
      congregationId: r.triggering_congregation_id,
      congregationName: r.triggering_congregation_name,
      pastorUserId: r.triggering_pastor_user_id,
      pastorName: r.triggering_pastor_name,
      pastorEmail: r.triggering_pastor_email,
    },
    matched: {
      szemelyId: r.matched_szemely_id,
      szemelyName: r.matched_szemely_name,
      szDatum: r.matched_sz_datum,
      cnp: r.matched_cnp,
      congregationId: r.matched_congregation_id,
      congregationName: r.matched_congregation_name,
      pastorUserId: r.matched_pastor_user_id,
      pastorName: r.matched_pastor_name,
      pastorEmail: r.matched_pastor_email,
    },
  }
}

// ─── 1. Lista ────────────────────────────────────────────────────────────────

export async function listCrossMatchAdmin(
  includeResolved: boolean,
): Promise<CrossMatchAdminListResult> {
  try {
    const access = await requireAdminAccess()
    const { data, error } = await access.supabase.rpc('admin_list_cross_congregation_matches', {
      p_include_resolved: includeResolved,
      p_limit: 300,
    })

    if (error) {
      if (isMissingFunctionError(error.message, 'admin_list_cross_congregation_matches')) {
        return { needsSql: true, accessLevel: access.accessLevel }
      }
      return { error: `A lista lekérdezése sikertelen: ${error.message}` }
    }

    return {
      rows: ((data || []) as RawAdminMatchRow[]).map(mapRow),
      accessLevel: access.accessLevel,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ismeretlen hiba.' }
  }
}

// ─── 2. Teljes-állomány átvizsgálás ─────────────────────────────────────────

export async function runCrossMatchScan(): Promise<CrossMatchScanResult> {
  try {
    // A scan a TELJES állományt érinti — kerületi admin nem futtathatja
    // (az RPC is ellenőrzi, ez csak a barátságosabb hibaüzenet).
    const access = await requireAdminAccess({ allowDistrictAdmin: false })
    const { data, error } = await access.supabase.rpc('admin_scan_cross_congregation_duplicates')

    if (error) {
      if (isMissingFunctionError(error.message, 'admin_scan_cross_congregation_duplicates')) {
        return { needsSql: true }
      }
      return { error: `Az átvizsgálás sikertelen: ${error.message}` }
    }

    const result = (data || {}) as { new_matches?: number; total_open?: number }
    revalidatePath('/admin/egyeztetesek')
    return {
      success: true,
      newMatches: Number(result.new_matches ?? 0),
      totalOpen: Number(result.total_open ?? 0),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ismeretlen hiba.' }
  }
}

// ─── 3. Lelkészek értesítése (e-mail + app-értesítés) ───────────────────────

const CONFIDENCE_HU: Record<string, string> = {
  name_phone: 'név + telefon egyezés (nagyon erős)',
  name_birth: 'név + születési dátum egyezés (erős)',
  phone_only: 'telefon-egyezés',
  name_only: 'név-egyezés',
}

function esc(v: string) {
  return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function buildNotifyEmail(row: CrossMatchAdminRow, recipientSide: 'triggering' | 'matched') {
  const own = recipientSide === 'triggering' ? row.triggering : row.matched
  const other = recipientSide === 'triggering' ? row.matched : row.triggering
  const ownName = own.szemelyName || 'ismeretlen nevű tag'
  const otherName = other.szemelyName || 'ismeretlen nevű tag'
  const ownCong = own.congregationName || 'saját gyülekezet'
  const otherCong = other.congregationName || 'másik gyülekezet'
  const confidence = CONFIDENCE_HU[row.confidence] || row.confidence

  const subject = `Kartotéka — tag-egyeztetés szükséges: ${ownName}`
  const contactLine = other.pastorName || other.pastorEmail
    ? `A másik gyülekezet lelkésze: ${[other.pastorName, other.pastorEmail].filter(Boolean).join(' — ')}`
    : `A másik gyülekezetnek jelenleg nincs rögzített lelkésze a rendszerben.`

  const text = [
    `Kedves Lelkipásztor!`,
    ``,
    `A Kartotéka rendszergazdai egyeztetése azt találta, hogy a(z) ${ownCong} gyülekezet`,
    `tagja, ${ownName}, nagy valószínűséggel ugyanaz a személy, mint a(z) ${otherCong}`,
    `gyülekezetben nyilvántartott ${otherName}.`,
    ``,
    `Az egyezés alapja: ${confidence}.`,
    ``,
    `Kérjük, egyeztessenek egymással, hogy valóban ugyanarról a személyről van-e szó,`,
    `és a tagnyilvántartásban rögzítsék a döntést (a tag kartonján a sárga jelölésnél).`,
    contactLine,
    ``,
    `Belépés: https://kartoteka.app/tagnyilvantartas`,
    ``,
    `Ez az üzenet a Kartotéka admin egyeztetési felületéről érkezett.`,
  ].join('\n')

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;max-width:600px;">
  <p>Kedves Lelkipásztor!</p>
  <p>
    A Kartotéka rendszergazdai egyeztetése azt találta, hogy a(z) <strong>${esc(ownCong)}</strong> gyülekezet tagja,
    <strong>${esc(ownName)}</strong>, nagy valószínűséggel ugyanaz a személy, mint a(z)
    <strong>${esc(otherCong)}</strong> gyülekezetben nyilvántartott <strong>${esc(otherName)}</strong>.
  </p>
  <p style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">
    Az egyezés alapja: <strong>${esc(confidence)}</strong>
  </p>
  <p>
    Kérjük, egyeztessenek egymással, hogy valóban ugyanarról a személyről van-e szó, és a
    tagnyilvántartásban rögzítsék a döntést (a tag kartonján a sárga jelölésnél).<br/>
    ${esc(contactLine)}
  </p>
  <p>
    <a href="https://kartoteka.app/tagnyilvantartas" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">
      Tagnyilvántartás megnyitása
    </a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/>
  <p style="margin:0;font-size:12px;color:#94a3b8;font-style:italic;">
    Kartotéka — automatikus üzenet az admin egyeztetési felületről.
  </p>
</div>`

  return { subject, text, html }
}

export async function notifyPastorsForMatch(
  notificationId: string,
): Promise<CrossMatchNotifyResult> {
  try {
    const access = await requireAdminAccess()

    // A sort a jogosultság-szűrő RPC-n keresztül kérjük le (kerületi admin csak
    // a saját kerületét éri el) — resolved sorra is küldhető emlékeztető.
    const { data, error } = await access.supabase.rpc('admin_list_cross_congregation_matches', {
      p_include_resolved: true,
      p_limit: 1,
      p_notification_id: notificationId,
    })
    if (error) {
      if (isMissingFunctionError(error.message, 'admin_list_cross_congregation_matches')) {
        return { error: 'Előbb futtasd le a 2026-08-09-admin-kereszt-egyeztetes.sql migrációt.' }
      }
      return { error: `A tétel lekérdezése sikertelen: ${error.message}` }
    }
    const raw = ((data || []) as RawAdminMatchRow[])[0]
    if (!raw) return { error: 'Ismeretlen (vagy jogosultságon kívüli) egyeztetési tétel.' }
    const row = mapRow(raw)

    const warnings: string[] = []
    let emailed = 0
    let inApp = 0

    // 1. E-mail mindkét lelkésznek (best-effort; a hiba nem dönti be a műveletet)
    for (const side of ['triggering', 'matched'] as const) {
      const pastor = row[side]
      const congName = pastor.congregationName || 'gyülekezet'
      if (!pastor.pastorEmail || !pastor.pastorEmail.includes('@')) {
        warnings.push(`${congName}: nincs lelkészi e-mail cím — e-mail nem ment ki.`)
        continue
      }
      const mail = buildNotifyEmail(row, side)
      const res = await sendEmail({
        to: { email: pastor.pastorEmail, name: pastor.pastorName || undefined },
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        tags: ['cross-match-admin'],
      })
      if (res.success) emailed += 1
      else warnings.push(`${congName}: az e-mail küldése nem sikerült (${res.error || 'ismeretlen hiba'}).`)
    }

    // 2. App-on belüli értesítés (ertesitesek) mindkét lelkésznek + admin-pecsét —
    // SECURITY DEFINER RPC-vel, mert a kerületi admin saját kliense az
    // ertesitesek RLS-én elbukna (más user_id-ra nem szúrhat be sort).
    const uzenetFor = (side: 'triggering' | 'matched') => {
      const own = row[side]
      const other = side === 'triggering' ? row.matched : row.triggering
      return `${own.szemelyName || 'Egy tagotok'} (${own.congregationName || '?'}) nagy valószínűséggel azonos ${other.szemelyName || 'egy másik gyülekezeti taggal'} (${other.congregationName || '?'}) — kérjük, egyeztessetek. Alap: ${CONFIDENCE_HU[row.confidence] || row.confidence}.`
    }
    for (const side of ['triggering', 'matched'] as const) {
      if (!row[side].pastorUserId) {
        warnings.push(`${row[side].congregationName || 'gyülekezet'}: nincs rögzített lelkész — app-értesítés nem készült.`)
      }
    }

    const { data: notifyData, error: notifyErr } = await access.supabase.rpc('admin_notify_cross_match_pastors', {
      p_notification_id: notificationId,
      p_cim: 'Tag-egyeztetés szükséges',
      p_uzenet_triggering: uzenetFor('triggering'),
      p_uzenet_matched: uzenetFor('matched'),
    })
    if (notifyErr) {
      warnings.push(`Az app-értesítés rögzítése nem sikerült: ${notifyErr.message}`)
    } else {
      inApp = Number((notifyData as { inserted_count?: number } | null)?.inserted_count ?? 0)
    }

    if (emailed === 0 && inApp === 0) {
      return { error: `Nem sikerült egyetlen értesítést sem kiküldeni. ${warnings.join(' ')}` }
    }

    revalidatePath('/admin/egyeztetesek')
    return { success: true, emailed, inApp, warnings }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ismeretlen hiba.' }
  }
}

// ─── 4. Admin-döntés rögzítése ──────────────────────────────────────────────

export async function resolveCrossMatchAsAdmin(
  notificationId: string,
  resolution: CrossMatchAdminResolution,
): Promise<{ success?: boolean; error?: string }> {
  try {
    const access = await requireAdminAccess()
    // A pár MINDEN sorát (tükör-irányok, több confidence) lezáró admin-RPC —
    // a sima resolve_cross_congregation_match csak egy sort zárna, a tükör-sor
    // nyitva maradna, és a taglistás sárga jelölés sosem tűnne el.
    const { error } = await access.supabase.rpc('admin_resolve_cross_match_pair', {
      p_notification_id: notificationId,
      p_resolution: resolution,
    })
    if (error) {
      if (isMissingFunctionError(error.message, 'admin_resolve_cross_match_pair')) {
        return { error: 'Előbb futtasd le a 2026-08-09-admin-kereszt-egyeztetes.sql migrációt.' }
      }
      return { error: `A döntés rögzítése sikertelen: ${error.message}` }
    }

    revalidatePath('/admin/egyeztetesek')
    revalidatePath('/tagnyilvantartas')
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Ismeretlen hiba.' }
  }
}
