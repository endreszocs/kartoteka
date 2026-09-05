import 'server-only'

/**
 * ÉRTESÍTÉS A VISSZAÁLLÍTÁSRÓL. 2026-08-11.
 *
 * Két csatorna, MINDIG mind a kettő:
 *   1) e-mail a fő rendszergazdának (Brevo),
 *   2) harang-értesítés (`ertesitesek`) minden aktív admin/master profilnak
 *      + az érintett gyülekezet lelkészének.
 *
 * ⚠️ AKKOR IS ELMEGY, HA A CSELEKVŐ MAGA A CÍMZETT.
 *    Ez nem redundancia: az önértesítés az, ami egy ELLOPOTT MUNKAMENETET
 *    láthatóvá tesz. „Én ezt nem csináltam" — ez a mondat csak akkor tud
 *    elhangzani, ha megérkezik az értesítés.
 *
 * ⛔ AMI SOHA NEM KERÜL BELE: adat, mintarekord, név a visszaállított sorokból,
 *    letöltési link, jelszó, kulcs, token. A levél a TÉNYT közli, nem a
 *    tartalmat — különben a postafiók maga válna adatszivárgási csatornává.
 *
 * ⚠️ A `sendEmail` SOHA NEM DOB, csak `success:false`-t ad. A visszatérési
 *    értékét ezért NAPLÓZZUK a hívónál (`figyelmeztetesek`) — különben maga a
 *    riasztás veszne el némán.
 */

import { escHtml } from '@/lib/email/escape'
import { sendEmail } from '@/lib/email/send'
import { loadAlertRecipient } from '@/lib/google-drive/settings'
import { feladoMezok } from '@/lib/notifications/felado'
import { insertErtesites } from '@/lib/notifications/ertesites-insert'
import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'

export type RestoreAlertKind = 'sikeres' | 'sikertelen' | 'letoltes'

export interface RestoreAlertArgs {
  kind: RestoreAlertKind
  congregationId: string | null
  congregationNev: string
  /** A mentés napja (`2026-08-08`) — a levélben ez azonosítja a pillanatot. */
  backupRunDate: string | null
  actorEmail: string | null
  restoreLogId: number | null
  /** CSAK SZÁMOK. */
  osszesen?: { beszuras: number; modositas: number; torles: number }
  /** Rövid, biztonságos hibaüzenet (error.message) — soha nem sorérték. */
  hibaUzenet?: string | null
}

function layout(opts: {
  accentColor: string
  accentBg: string
  accentLabel: string
  title: string
  bodyHtml: string
}): string {
  return `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
      <div style="display:inline-block;padding:4px 12px;background:${opts.accentBg};color:${opts.accentColor};border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
        ${escHtml(opts.accentLabel)}
      </div>
      <h1 style="margin:16px 0 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;color:#0f172a;line-height:1.3;">
        ${escHtml(opts.title)}
      </h1>
      <div style="margin-top:16px;font-size:15px;line-height:1.6;color:#334155;">
        ${opts.bodyHtml}
      </div>
    </div>
    <p style="margin-top:24px;text-align:center;font-size:12px;color:#94a3b8;">
      Kartotéka — Egyházi nyilvántartó rendszer<br/>Erdélyi Református Egyházkerület
    </p>
  </div>
</body></html>`
}

function alapUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://kartoteka.app'
  return raw.replace(/\/+$/, '')
}

function szoveg(args: RestoreAlertArgs): { subject: string; cim: string; sorok: string[] } {
  const mikor = args.backupRunDate ? `${args.backupRunDate}-i` : 'kiválasztott'
  if (args.kind === 'sikeres') {
    return {
      subject: 'KARTOTÉKA — adat-visszaállítás történt',
      cim: 'Adat-visszaállítás történt',
      sorok: [
        `Gyülekezet: ${args.congregationNev}`,
        `A visszaállított mentés: a ${mikor} mentés.`,
        args.osszesen
          ? `Változás: ${args.osszesen.beszuras} sor visszakerült, ${args.osszesen.modositas} sor felülíródott, ${args.osszesen.torles} sor eltűnt.`
          : '',
        args.actorEmail ? `Indította: ${args.actorEmail}` : '',
        'A visszaállítás ELŐTTI állapotról mentés készült — abból vissza lehet térni.',
        'Ha nem te indítottad, azonnal változtass jelszót, és nézd meg a visszaállítás-naplót.',
      ].filter(Boolean),
    }
  }
  if (args.kind === 'letoltes') {
    return {
      subject: 'KARTOTÉKA — biztonsági mentés letöltése',
      cim: 'Valaki letöltött egy biztonsági mentést',
      sorok: [
        `Gyülekezet: ${args.congregationNev}`,
        `A letöltött mentés: a ${mikor} mentés.`,
        args.actorEmail ? `Letöltötte: ${args.actorEmail}` : '',
        'Ha nem te voltál, azonnal változtass jelszót és mentési jelszót.',
      ].filter(Boolean),
    }
  }
  return {
    subject: 'KARTOTÉKA — az adat-visszaállítás nem sikerült',
    cim: 'Az adat-visszaállítás nem sikerült',
    sorok: [
      `Gyülekezet: ${args.congregationNev}`,
      `A választott mentés: a ${mikor} mentés.`,
      args.actorEmail ? `Indította: ${args.actorEmail}` : '',
      args.hibaUzenet ? `A leállás oka: ${args.hibaUzenet}` : '',
      'Az adatokhoz NEM nyúlt hozzá a rendszer — a művelet a védőkapuk valamelyikén állt meg.',
    ].filter(Boolean),
  }
}

/**
 * Elküldi az értesítést mind a két csatornán.
 *
 * Visszaadja a FIGYELMEZTETÉSEKET: ha az e-mail nem ment el, vagy a harang-sor
 * nem jött létre, azt a hívó beírja a `backup_restore_log.figyelmeztetesek`-be.
 * A néma riasztás-vesztés a legrosszabb kimenet.
 */
export async function sendRestoreAlert(args: RestoreAlertArgs): Promise<string[]> {
  const figyelmeztetesek: string[] = []
  const { subject, cim, sorok } = szoveg(args)
  const destruktiv = args.kind !== 'sikeres'
  const link = `${alapUrl()}/admin/veszelyes-zona`

  // ─── 1) E-MAIL ────────────────────────────────────────────────────────────
  // ⚠️ A FELÜLETEN beállított cím nyer (`backup_settings.alert_email`); az
  //    env-változó csak tartalék. Lásd a `loadAlertRecipient` magyarázatát:
  //    korábban a beállított címre SOHA nem ment semmi, pedig a felület azt
  //    ígérte, hogy oda megy.
  const { cimzett } = await loadAlertRecipient()

  if (!cimzett) {
    figyelmeztetesek.push(
      'Nincs értesítési e-mail cím (sem a beállításokban, sem a BACKUP_ALERT_EMAIL / ' +
        'MASTER_ADMIN_EMAIL változóban) — az értesítő levél nem ment el.',
    )
  } else {
    try {
      const html = layout({
        accentColor: destruktiv ? '#b91c1c' : '#166534',
        accentBg: destruktiv ? '#fee2e2' : '#dcfce7',
        accentLabel: 'Biztonsági mentés',
        title: cim,
        bodyHtml: `
          <ul style="margin:0 0 16px;padding-left:18px;">
            ${sorok.map((s) => `<li style="margin-bottom:6px;">${escHtml(s)}</li>`).join('')}
          </ul>
          <p style="margin:16px 0 0;">
            <a href="${escHtml(link)}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;border-radius:12px;text-decoration:none;font-size:14px;">
              Megnézem a visszaállítás-naplót
            </a>
          </p>`,
      })
      const res = await sendEmail({
        to: { email: cimzett },
        subject,
        text: `${cim}\n\n${sorok.join('\n')}\n\n${link}`,
        html,
        tags: ['backup-restore'],
      })
      if (!res.success) {
        figyelmeztetesek.push(
          `Az értesítő levél nem ment el (${res.provider}): ${res.error || 'ismeretlen hiba'}.`,
        )
      }
    } catch (error: unknown) {
      figyelmeztetesek.push(
        `Az értesítő levél küldése kivétellel állt le: ${
          error instanceof Error ? error.message : 'ismeretlen hiba'
        }.`,
      )
    }
  }

  // ─── 2) HARANG ────────────────────────────────────────────────────────────
  try {
    const supabase = getSupabaseAdminClient()

    const { data: adminok, error: adminHiba } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'master'])
      .eq('status', 'active')

    if (adminHiba) throw new Error(adminHiba.message)

    const cimzettek = new Set<string>((adminok ?? []).map((p) => String((p as { id: string }).id)))

    // Az érintett gyülekezet lelkésze is értesül — az ő adatairól van szó.
    if (args.congregationId) {
      const { data: lelkeszek } = await supabase
        .from('profiles')
        .select('id')
        .eq('congregation_id', args.congregationId)
        .eq('status', 'active')
        .eq('role', 'lelkesz')
      for (const p of lelkeszek ?? []) cimzettek.add(String((p as { id: string }).id))
    }

    if (cimzettek.size === 0) {
      figyelmeztetesek.push('Nincs aktív admin/master profil — harang-értesítés nem készült.')
    } else {
      // A `hivatkozas` EGYSZERRE dedup-kulcs ÉS érvényes útvonal — a harang
      // csak `/`-sel vagy `http`-vel kezdődő linket tesz kattinthatóvá.
      const hivatkozas = args.restoreLogId
        ? `/admin/veszelyes-zona?visszaallitas=${args.restoreLogId}`
        : '/admin/veszelyes-zona'

      const rows = Array.from(cimzettek).map((userId) => ({
        user_id: userId,
        congregation_id: args.congregationId,
        cim,
        uzenet: sorok.join('\n'),
        tipus: destruktiv ? 'warning' : 'info',
        hivatkozas,
        // Gépi értesítés (service_role) — a feladó a rendszer; a cselekvő neve a törzsben.
        ...feladoMezok('rendszer'),
      }))

      const beszuras = await insertErtesites(supabase, rows, { forras: 'visszaallitas-ertesites' })
      if (beszuras.error) throw new Error(beszuras.error)
    }
  } catch (error: unknown) {
    figyelmeztetesek.push(
      `A harang-értesítés nem jött létre: ${
        error instanceof Error ? error.message : 'ismeretlen hiba'
      }.`,
    )
  }

  return figyelmeztetesek
}
