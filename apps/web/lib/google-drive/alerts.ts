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
import { escHtml } from '@/lib/email/escape'
import { sendEmail } from '@/lib/email/send'
import { bukarestiNapKulcs } from '@/lib/utils/idopont-bukarest'
import { isMissingTableError, loadAlertRecipient } from './settings'

const FELULET_UT = '/admin/biztonsagi-mentes'

function appUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://kartoteka.app').replace(/\/+$/, '')
  return `${base}${FELULET_UT}`
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

/**
 * ⚠️ 2026-08-11 — MIÉRT KAPOTT KÉT ÚJ ÉRTÉKET EZ A TÍPUS.
 *
 * A tulajdonos harangjában ez állt:
 *   CÍM:   „Régen készült ellenőrzött biztonsági mentés"
 *   TÖRZS: „A(z) 2026-08-11 napi futásban a(z) »Biharvajda…« mentése SIKERTELEN."
 *
 * A kettő KÉT KÜLÖNBÖZŐ ESEMÉNYRŐL szólt. Nem sablonkeveredés volt: nem LÉTEZETT
 * olyan riasztás-fajta, hogy „egy hatókör mai futása elbukott", ezért a motor
 * riasztója kénytelen volt az `elavult` kulcsot választani — és a cím ehhez a
 * kulcshoz fixen kötött. Ugyanezért érkezett a PRÓBA-értesítés is „Régen
 * készült…" címmel.
 *
 * Mostantól mindkettőnek SAJÁT kulcsa és saját címe van, és a `cim` mezővel a
 * hívó pontosíthat (pl. a gyülekezet nevével). ⛔ A cím SOHA nem mondhat mást,
 * mint a törzs.
 */
export type DriveAlertKind =
  | 'drive_kapcsolat' // a Google-kapcsolat megszakadt
  | 'egyeztetes' // a napló és a Drive tartalma eltér
  | 'elavult' // >48 óra óta nincs igazolt mentés
  | 'nyeses' // a nyesés hibára futott
  | 'futas_bukas' // EGY hatókör MAI futása elbukott (nem „régen készült")
  | 'proba' // a tulajdonos saját kérésére küldött próba

export interface DriveAlertInput {
  kind: DriveAlertKind
  /**
   * A CÍM felülírása. Ha megadod, a törzzsel EGY eseményről kell szólnia.
   * Enélkül a `CIMEK` térkép alap-címe megy ki.
   */
  cim?: string
  /** Egy mondat, ami MEGNEVEZI a bajt. Adatot NEM tartalmazhat. */
  reszlet: string
  /** Ha gyülekezethez köthető, a lelkész is kap harangot. */
  congregationId?: string | null
  congregationNev?: string | null
  /** Dedup-kulcs: naponta egy értesítés hatókörönként. */
  dedupKulcs?: string
  /**
   * A „Teendő" sor. Alapértelmezés: „Admin → Biztonsági mentés".
   * ⚠️ Csak OLYAN helyre mutasson, ahol a címzett tényleg tehet valamit.
   */
  teendo?: string
  /** A harang-sor típusa. Alap: `warning`. A próbáé `info`. */
  tipus?: 'info' | 'success' | 'warning' | 'danger'
}

const CIMEK: Record<DriveAlertKind, string> = {
  drive_kapcsolat: 'A Google Drive kapcsolat megszakadt',
  egyeztetes: 'A mentési napló és a Google Drive tartalma eltér',
  elavult: 'Régen készült ellenőrzött biztonsági mentés',
  nyeses: 'A régi mentések takarítása nem sikerült',
  futas_bukas: 'Nem sikerült a mai biztonsági mentés',
  proba: 'Próba-értesítés — a riasztás működik',
}

const TARGYAK: Record<DriveAlertKind, string> = {
  drive_kapcsolat: 'KARTOTÉKA — a Google Drive kapcsolat megszakadt',
  egyeztetes: 'KARTOTÉKA — hiányzó mentés-fájlok a Google Drive-on',
  elavult: 'KARTOTÉKA — régen készült ellenőrzött biztonsági mentés',
  nyeses: 'KARTOTÉKA — a mentés-takarítás nem sikerült',
  futas_bukas: 'KARTOTÉKA — nem sikerült a mai biztonsági mentés',
  proba: 'KARTOTÉKA — próba-értesítés (nem hiba)',
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
  // ⚠️ A CÍM ÉS A TÖRZS UGYANARRÓL SZÓL. Ha a hívó pontosabbat tud (pl. a
  //    gyülekezet nevét), az övé az elsőbbség.
  const cim = (input.cim ?? '').trim() || CIMEK[input.kind]
  const uzenet =
    `${input.reszlet}\n\n` +
    (input.congregationNev ? `Érintett gyülekezet: ${input.congregationNev}\n\n` : '') +
    `Teendő: ${input.teendo ?? 'Admin → Biztonsági mentés'}. ` +
    'Ez az üzenet nem tartalmaz mentett adatot.'

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
      // ⚠️ `select('*')`, NEM oszlop-lista (2026-08-11). A dedup-vizsgálatnak
      //    tudnia kell, hogy a meglévő sort azóta MEGOLDOTTNAK jelöltük-e —
      //    de a `megoldva` oszlop csak akkor létezik, ha a tulajdonos lefuttatta
      //    a migrációt. Egy `select('id, megoldva')` addig 42703-mal elhasalna,
      //    és a riasztás NÉMÁN kimaradna. A csillag mindkét világban működik.
      const { data: meglevo, error: dedupHiba } = await supabase
        .from('ertesitesek')
        .select('*')
        .eq('hivatkozas', dedup)
        .limit(1)
        .maybeSingle()

      const meglevoSor = meglevo as {
        id?: string
        megoldva?: boolean | null
        cim?: string | null
      } | null
      // MEGOLDOTT sor NEM némít: ha a baj visszatér ugyanazon a napon, arról
      // szólni kell. (A dedup célja a 60 levél elkerülése, nem a hallgatás.)
      //
      // ⚠️ 2026-08-11 JAVÍTÁS — A MIGRÁCIÓ ELŐTT EZ A GARANCIA AZ ELLENKEZŐJÉRE
      //    FORDULT. Itt korábban CSAK `meglevoSor.megoldva !== true` állt. Amíg a
      //    `2026-08-11-ertesites-megoldva.sql` nem futott le, a `select('*')`
      //    sorában NINCS `megoldva` kulcs → `undefined !== true` → IGAZ →
      //    `kihagyva = true` → és mivel a függvény a `kihagyva` ágon a
      //    LEVÉLKÜLDÉS ELŐTT visszatér, sem harang, sem e-mail nem ment ki.
      //    Vagyis pont az a helyzet némult el, amit ez a szabály kizárni ígér.
      //    Elérhető sorrend: (1) a napi futás bukik X-re → riasztás; (2) X-re
      //    később készül igazolt mentés → a feloldó a migráció hiányában CSAK a
      //    CÍMBE írja a „Megoldva — " előtagot; (3) X ÚJRA bukik ugyanazon a
      //    napon → a dedup-sor létezik, `megoldva` undefined → NÉMA.
      //    MOSTANTÓL ugyanaz a KÉT FORRÁSÚ szabály dönt, amit a feloldó
      //    (`feloldErtesitesek`) és a felület (`uzenetek-actions.ts → alakit()`)
      //    is használ: oszlop VAGY cím-előtag.
      const megoldott =
        meglevoSor?.megoldva === true || (meglevoSor?.cim ?? '').startsWith(MEGOLDVA_ELOTAG)
      const elonemitoSor = Boolean(meglevoSor?.id) && !megoldott

      if (dedupHiba && !isMissingTableError(dedupHiba)) {
        result.harangHiba = dedupHiba.message
      } else if (elonemitoSor) {
        result.kihagyva = true
      } else {
        const sorok = [...cimzettek].map((userId) => ({
          user_id: userId,
          congregation_id: input.congregationId ?? null,
          cim,
          uzenet,
          tipus: input.tipus ?? 'warning',
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

// ─────────────────────────────────────────────────────────────────────────────
// ELAVULÁS — „A BAJ ELMÚLT" (2026-08-11)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A megoldott üzenetek cím-előtagja.
 *
 * ⚠️ NEM DÍSZ: ez az a jel, amiből a felület a MIGRÁCIÓ LEFUTÁSA ELŐTT is
 * felismeri a megoldott sort (akkor ugyanis nincs `megoldva` oszlop). Ezért
 * ellenőrizzük vele a kétszeres feloldást is.
 */
export const MEGOLDVA_ELOTAG = 'Megoldva — '

/**
 * MEGOLDOTTNAK JELÖLI a megadott hivatkozású harang-üzeneteket.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT LÉTEZIK
 * ════════════════════════════════════════════════════════════════════════════
 * A tulajdonos 21:09-kor kapott egy harangot arról, hogy egy gyülekezet mentése
 * elbukott. 22:16-kor mind a 784 elkészült — az üzenet mégis változatlanul ott
 * állt. Az `ertesitesek` táblán az egész kódbázisban KÉT mutató művelet volt:
 * `olvasva: true` és `archived: true`, mindkettőt KÉZZEL indítja a felhasználó.
 * A rendszer tehát tudott panaszkodni, de azt nem tudta mondani, hogy „azóta
 * rendben" — és egy ilyen rendszer előbb-utóbb a panaszait is elveszti.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ FAIL-CLOSED: MŰKÖDIK A MIGRÁCIÓ LEFUTÁSA ELŐTT IS
 * ════════════════════════════════════════════════════════════════════════════
 * A `megoldva` / `megoldva_at` / `megoldas_uzenet` oszlopokat a
 * `migration-docs/sql/2026-08-11-ertesites-megoldva.sql` hozza létre, és azt a
 * tulajdonos futtatja. Amíg nem futott le:
 *   · az oszlopos írás 42703/PGRST204-gyel elhasal,
 *   · ezért AZONNAL újrapróbáljuk oszlopok NÉLKÜL: a `tipus` `success`-re vált,
 *     a cím „Megoldva —" előtagot kap, az üzenet pedig egy záró mondatot.
 * Mindkét úton LÁTHATÓ a felületen, hogy a baj elmúlt. A migráció csak
 * szűrhetővé és visszakereshetővé teszi.
 *
 * SOHA NEM DOB.
 */
export async function feloldErtesitesek(input: {
  /** A pontos `hivatkozas` értékek (dedup-kulcsok). Üres tömb → nem csinál semmit. */
  hivatkozasok: string[]
  /** Egy mondat arról, MIÉRT nincs már baj. Adatot NEM tartalmazhat. */
  megoldasUzenet: string
}): Promise<{ feloldva: number; hiba: string | null }> {
  const kulcsok = input.hivatkozasok.filter((k) => typeof k === 'string' && k.length > 0)
  if (kulcsok.length === 0) return { feloldva: 0, hiba: null }

  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('ertesitesek')
      .select('*')
      .in('hivatkozas', kulcsok)
      .limit(500)

    if (error) return { feloldva: 0, hiba: isMissingTableError(error) ? null : error.message }

    const sorok = (data ?? []) as Array<{
      id: string
      cim: string | null
      uzenet: string | null
      megoldva?: boolean | null
    }>
    const nyitottak = sorok.filter((s) => s.megoldva !== true && !(s.cim ?? '').startsWith(MEGOLDVA_ELOTAG))
    if (nyitottak.length === 0) return { feloldva: 0, hiba: null }

    const most = new Date().toISOString()
    let feloldva = 0
    let utolsoHiba: string | null = null

    for (const sor of nyitottak) {
      const ujCim = `${MEGOLDVA_ELOTAG}${(sor.cim ?? 'Biztonsági mentés').trim()}`
      const ujUzenet = `${(sor.uzenet ?? '').trim()}\n\n✅ ${input.megoldasUzenet}`

      // 1) ELSŐ PRÓBA — az életciklus-oszlopokkal.
      const { error: ujHiba } = await supabase
        .from('ertesitesek')
        .update({
          megoldva: true,
          megoldva_at: most,
          megoldas_uzenet: input.megoldasUzenet,
          tipus: 'success',
          cim: ujCim,
          uzenet: ujUzenet,
        })
        .eq('id', sor.id)

      if (!ujHiba) {
        feloldva += 1
        continue
      }

      // 2) TARTALÉK — a migráció még nem futott le. A felületen ATTÓL MÉG
      //    látszani fog, hogy a baj elmúlt.
      const { error: regiHiba } = await supabase
        .from('ertesitesek')
        .update({ tipus: 'success', cim: ujCim, uzenet: ujUzenet })
        .eq('id', sor.id)
      if (regiHiba) utolsoHiba = regiHiba.message
      else feloldva += 1
    }

    return { feloldva, hiba: utolsoHiba }
  } catch (e: unknown) {
    return { feloldva: 0, hiba: e instanceof Error ? e.message : 'ismeretlen hiba' }
  }
}
