import 'server-only'

/**
 * HIBAJELZÉS — MIND A HÁROM CSATORNA (2026-08-11).
 *
 *  1) E-MAIL (Brevo)   — azonnali, a tulajdonosnak.
 *  2) HARANG           — `ertesitesek` sor minden aktív master/admin profilnak
 *                        (gyülekezeti hibánál a gyülekezet lelkészének is).
 *  3) FIGYELMEZTETŐ SÁV — NEM innen jön: a `health.ts` a HIÁNYBÓL számolja
 *                        minden oldalbetöltésnél. Ez szándékos: a riasztás
 *                        nem lakhat abban, amit figyel.
 *
 * ─── AMI SOHA NEM KERÜL BELE ───────────────────────────────────────────────
 * Adat, mintarekord, CNP, név-lista a mentés TARTALMÁBÓL, letöltési link,
 * token, kulcs, jelszó — sem az értékük, sem a hosszuk. Ha a postafiók maga
 * válik mentési csatornává, az egész titkosítás értelmét veszti.
 * Egyetlen link megy: a mentés-felület címe.
 *
 * ⚠️ A `sendEmail` SOHA NEM DOB, csak `success: false`-t ad. A visszatérési
 * értékét ezért NAPLÓZZUK — különben a riasztás maga veszne el némán.
 */

import { getSupabaseAdminClient } from '@/lib/supabase/admin-client'
import { getCongregationOfficials } from '@/lib/profiles/officials'
import { sendEmail } from '@/lib/email/send'
import { bukarestiNapKulcs } from '@/lib/utils/idopont-bukarest'
import { isMissingTableError, loadAlertRecipient } from './settings'

const FELULET_UT = '/admin/biztonsagi-mentes'

function appUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://kartoteka.app').replace(/\/+$/, '')
  return `${base}${FELULET_UT}`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A `device-revoke.ts` layout-sablonja, destruktív akcentussal. */
function layout(cim: string, torzsHtml: string): string {
  return `<!DOCTYPE html>
<html lang="hu"><body style="margin:0;padding:0;background:#f8fafc;font-family:'DM Sans','Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:20px;padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.04);">
      <div style="display:inline-block;padding:4px 12px;background:#ffe4e6;color:#9f1239;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
        Biztonsági mentés
      </div>
      <h1 style="margin:16px 0 8px;font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-size:28px;color:#0f172a;line-height:1.3;">
        ${escHtml(cim)}
      </h1>
      <div style="margin-top:16px;font-size:15px;line-height:1.6;color:#334155;">
        ${torzsHtml}
      </div>
      <div style="margin-top:24px;">
        <a href="${appUrl()}" style="display:inline-block;padding:12px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-size:14px;font-weight:600;text-decoration:none;">
          Megnézem, mi a baj
        </a>
      </div>
      <p style="margin-top:20px;font-size:12px;color:#94a3b8;line-height:1.5;">
        Ez a levél SEMMILYEN mentett adatot nem tartalmaz, és nincs benne letöltési link.
        A mentések tartalma csak a rendszerbe belépve, a mentési jelszóval érhető el.
      </p>
    </div>
    <p style="margin-top:24px;text-align:center;font-size:12px;color:#94a3b8;">
      Kartotéka — Egyházi nyilvántartó rendszer<br/>Erdélyi Református Egyházkerület
    </p>
  </div>
</body></html>`
}

export type DriveAlertKind =
  | 'drive_kapcsolat' // a Google-kapcsolat megszakadt
  | 'egyeztetes' // a napló és a Drive tartalma eltér
  | 'elavult' // >48 óra óta nincs igazolt mentés
  | 'nyeses' // a nyesés hibára futott

export interface DriveAlertInput {
  kind: DriveAlertKind
  /** Egy mondat, ami MEGNEVEZI a bajt. Adatot NEM tartalmazhat. */
  reszlet: string
  /** Ha gyülekezethez köthető, a lelkész is kap harangot. */
  congregationId?: string | null
  congregationNev?: string | null
  /** Dedup-kulcs: naponta egy értesítés hatókörönként. */
  dedupKulcs?: string
}

const CIMEK: Record<DriveAlertKind, string> = {
  drive_kapcsolat: 'A Google Drive kapcsolat megszakadt',
  egyeztetes: 'A mentési napló és a Google Drive tartalma eltér',
  elavult: 'Régen készült ellenőrzött biztonsági mentés',
  nyeses: 'A régi mentések takarítása nem sikerült',
}

const TARGYAK: Record<DriveAlertKind, string> = {
  drive_kapcsolat: 'KARTOTÉKA — a Google Drive kapcsolat megszakadt',
  egyeztetes: 'KARTOTÉKA — hiányzó mentés-fájlok a Google Drive-on',
  elavult: 'KARTOTÉKA — régen készült ellenőrzött biztonsági mentés',
  nyeses: 'KARTOTÉKA — a mentés-takarítás nem sikerült',
}

export interface DriveAlertResult {
  emailKuldve: boolean
  emailHiba: string | null
  harangSorok: number
  harangHiba: string | null
  /** true = ma már ment ilyen értesítés, ezért kihagytuk. */
  kihagyva: boolean
}

/**
 * Elküldi a riasztást mindkét aktív csatornán. SOHA NEM DOB: egy elhasalt
 * riasztás nem boríthatja a hívó műveletet — de a kimenetelét visszaadja,
 * hogy a hívó NAPLÓZHASSA (`backup_log.figyelmeztetesek`).
 */
export async function sendDriveFailureAlert(input: DriveAlertInput): Promise<DriveAlertResult> {
  const result: DriveAlertResult = {
    emailKuldve: false,
    emailHiba: null,
    harangSorok: 0,
    harangHiba: null,
    kihagyva: false,
  }

  // ⚠️ 2026-08-11 JAVÍTÁS — AZ ŐRSZEM PONT AKKOR HALLGATOTT EL, AMIKOR BESZÉLNIE
  //    KELLETT VOLNA. Itt korábban `new Date().toISOString().slice(0, 10)` állt,
  //    vagyis UTC-nap. Ettől a „naponta egy értesítés" ablak határa 03:00
  //    bukaresti időkor volt (télen 02:00) — PONTOSAN az éjszakai mentési ablak
  //    közepén. Egy 02:30-kor kelt riasztás így ugyanahhoz a kulcshoz tartozott,
  //    mint az előző nap délutáni riasztása, és mivel a függvény „kihagyva"
  //    esetén a LEVÉLKÜLDÉS ELŐTT visszatér, a hajnali riasztás elnémulhatott.
  const napKulcs = bukarestiNapKulcs()
  const dedup = input.dedupKulcs ?? `${FELULET_UT}?riasztas=${input.kind}-${napKulcs}`
  const cim = CIMEK[input.kind]
  const uzenet =
    `${input.reszlet}\n\n` +
    (input.congregationNev ? `Érintett gyülekezet: ${input.congregationNev}\n\n` : '') +
    'Teendő: Admin → Biztonsági mentés. Ez az üzenet nem tartalmaz mentett adatot.'

  // ── 2) HARANG ────────────────────────────────────────────────────────────
  try {
    const supabase = getSupabaseAdminClient()

    const cimzettek = new Set<string>()
    const { data: adminok, error: adminHiba } = await supabase
      .from('profiles')
      .select('id')
      .eq('status', 'active')
      .in('role', ['admin', 'master'])
    if (adminHiba) {
      result.harangHiba = adminHiba.message
    } else {
      for (const p of adminok ?? []) cimzettek.add((p as { id: string }).id)
    }

    if (input.congregationId) {
      const lelkeszek = await getCongregationOfficials(supabase, input.congregationId, ['lelkesz'])
      for (const l of lelkeszek) cimzettek.add(l.userId)
    }

    if (cimzettek.size > 0) {
      // ⚠️ A `hivatkozas` EGYSZERRE dedup-kulcs ÉS érvényes útvonal: a harang
      // csak `/`-sel vagy `http`-vel kezdődő linket tesz kattinthatóvá
      // (notification-bell-refined.tsx). Ezért kezdődik `/admin/…`-nal.
      const { data: meglevo, error: dedupHiba } = await supabase
        .from('ertesitesek')
        .select('id')
        .eq('hivatkozas', dedup)
        .limit(1)
        .maybeSingle()

      if (dedupHiba && !isMissingTableError(dedupHiba)) {
        result.harangHiba = dedupHiba.message
      } else if (meglevo?.id) {
        result.kihagyva = true
      } else {
        const sorok = [...cimzettek].map((userId) => ({
          user_id: userId,
          congregation_id: input.congregationId ?? null,
          cim,
          uzenet,
          tipus: 'warning',
          hivatkozas: dedup,
        }))
        const { error: insertHiba } = await supabase.from('ertesitesek').insert(sorok)
        if (insertHiba) result.harangHiba = insertHiba.message
        else result.harangSorok = sorok.length
      }
    }
  } catch (e: unknown) {
    result.harangHiba = e instanceof Error ? e.message : 'ismeretlen hiba'
  }

  if (result.kihagyva) return result

  // ── 1) E-MAIL ────────────────────────────────────────────────────────────
  // ⚠️ ELŐSZÖR a felületen beállított cím (`backup_settings.alert_email`),
  //    és CSAK utána az env-változó. A felület azt ígéri a tulajdonosnak, hogy
  //    a levelek a beírt címre mennek — ennek igaznak kell lennie.
  const { cimzett } = await loadAlertRecipient()
  if (!cimzett) {
    result.emailHiba =
      'Nincs riasztási e-mail cím (sem a beállításokban, sem a BACKUP_ALERT_EMAIL / ' +
      'MASTER_ADMIN_EMAIL változóban) — a levél nem ment el.'
    return result
  }

  const torzs =
    `<p><strong>${escHtml(input.reszlet)}</strong></p>` +
    (input.congregationNev ? `<p>Érintett gyülekezet: <strong>${escHtml(input.congregationNev)}</strong></p>` : '') +
    '<p>A rendszer a hibát a felületen is jelzi. Amíg nincs friss, ellenőrzött mentés, a ' +
    'figyelmeztető sáv minden oldalon látszik — nem elrejthető.</p>'

  try {
    const küldés = await sendEmail({
      to: { email: cimzett },
      subject: TARGYAK[input.kind],
      text: `${cim}\n\n${uzenet}\n\n${appUrl()}`,
      html: layout(cim, torzs),
    })
    result.emailKuldve = küldés.success === true
    if (!küldés.success) {
      result.emailHiba = küldés.error ? String(küldés.error).slice(0, 200) : 'ismeretlen küldési hiba'
      // A riasztás elvesztése maga is riasztás — ezért NAPLÓZZUK.
      console.error('[backup-alert] a riasztó e-mail nem ment el:', result.emailHiba)
    }
  } catch (e: unknown) {
    result.emailHiba = e instanceof Error ? e.message : 'ismeretlen hiba'
    console.error('[backup-alert] a riasztó e-mail küldése kivételt dobott:', result.emailHiba)
  }

  return result
}
