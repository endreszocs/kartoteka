/**
 * local-mirror-owner — a lokális SQLCipher-tükör tulajdonos-ellenőrzése
 * (P1-4 / B-blokk, pénzügyi audit 2026-08-28; 2026-09-05 függő-sor őr).
 *
 * MIÉRT: a lokális tükör kijelentkezés / felhasználó-váltás után a lemezen
 * maradt. Közös Windows-loginon: A user (X gyülekezet) kijelentkezik, B user
 * (Y gyülekezet) belép → X pénzügyi + tag-adatai a helyi DB-ben maradtak, és
 * B az alkalmazáson keresztül elérte őket.
 *
 * MEGOLDÁS: tulajdonos-jelölő a DB-ben (`local_meta`). Az auth-gate a belépő
 * beengedése ELŐTT hívja az `ensureLocalMirrorOwner`-t:
 *   - a jelölő UGYANEZ a user → nincs teendő (a saját függő offline adat
 *     újra-belépéskor megmarad — kijelentkezéskor SZÁNDÉKOSAN nem törlünk);
 *   - a jelölő MÁS user → MINDEN lokális tábla kiürül, új tulajdonos-jegyzés;
 *   - NINCS jelölő (a javítás utáni első belépés egy meglévő telepítésen) →
 *     ha a tárolt lastUser ugyanez a személy, örökbefogadás törlés NÉLKÜL
 *     (a függő offline adata nem veszhet el a frissítés miatt); minden más
 *     esetben fail-closed törlés.
 *
 * 2026-09-05 (desk-sync-10, D4): a törlés ELŐTT megszámoljuk az előző
 * tulajdonos SZINKRONIZÁLATLAN sorait (klasszikus + pénzügyi outbox,
 * tag/család/gyermek pending, Excel-várólista) és a szerveren LEFOGLALT, de
 * még fel nem használt sorszámokat (tárca-sorok `used=0`). Ha van ilyen, a
 * törlés CSAK explicit megerősítéssel fut (`{ megerositve: true }`) — a
 * hívó `megerositesKell` állapotot kap, és az auth-gate egy látható döntő-
 * lapot mutat. Különben az előző lelkész adata némán megsemmisülne, a
 * lefoglalt sorszámok pedig a szerveren hézagként maradnának (visszaadó RPC
 * nincs).
 *
 * A wipe a sqlite_master-ből enumerál (nem kézzel karbantartott táblalista):
 * egy KÉSŐBB hozzáadott tükör-tábla is automatikusan törlődik — a kézi lista
 * némán kihagyná.
 *
 * HIBA-VISELKEDÉS: ha a DB nem érhető el (böngésző dev-mód, IPC-hiba), a
 * hívó felé hibát adunk vissza, de ez nem adatszivárgás-kapu: ugyanaz a
 * megszakadt IPC a tükör OLVASÁSÁT is lehetetlenné teszi — ahol nincs
 * elérhető tükör, ott nincs mit védeni.
 */

import { clearPin, pinTulajdonosEllenorzes } from './auth-pin'
import { getLastUser } from './desktop-user'
import { dbExecute, dbSelect } from './local-db'

const META_TABLA = 'local_meta'
const TULAJDONOS_KULCS = 'mirror_owner_user_id'

/** Folyamat-szintű gyorsítótár — egy futáson belül user-enként egyszer fut. */
let ellenorzottUserId: string | null = null

/** A gépen maradt, még fel nem küldött írások — queue-nként. */
export interface FuggoSorok {
  /** Minden szinkronizálatlan írás + lefoglalt sorszám együtt. */
  osszes: number
  /** Csak az írások (sorszám nélkül) — a fejléc-jelvény ezt mutatja. */
  irasok: number
  /** Kézi döntést váró (hibás / ütközött) sorok — a jelvény piros része. */
  hibas: number
  /** Szerveren lefoglalt, fel nem használt sorszámok (tárca-sorok). */
  foglaltSorszamok: number
  reszletek: {
    outboxPending: number
    /** Végleg hibás klasszikus sorok (ütközés NÉLKÜL). */
    outboxFailed: number
    /** A klasszikus outbox revision-ütközésen elakadt sorai. */
    outboxConflict: number
    penzugyiPending: number
    penzugyiConflict: number
    szemelyPending: number
    szemelyConflict: number
    csaladPending: number
    csaladConflict: number
    gyerekPending: number
    gyerekConflict: number
    excelPending: number
    excelBlocked: number
  }
}

export interface MirrorOwnerResult {
  ok: boolean
  /** true, ha a tükör kiürült (tulajdonos-váltás történt). */
  wiped: boolean
  error?: string
  /**
   * 2026-09-05: a tulajdonos-váltás függő sorokat / lefoglalt sorszámokat
   * semmisítene meg — a hívónak explicit megerősítést kell kérnie
   * (`ensureLocalMirrorOwner(userId, { megerositve: true })`).
   */
  megerositesKell?: boolean
  fuggo?: FuggoSorok
  /** Az előző tulajdonos user-id-ja (a döntő-lap szövegéhez). */
  elozoTulajdonos?: string | null
  /** Az előző tulajdonos e-mailje, ha a gépen feloldható (lastUser / profil). */
  elozoTulajdonosEmail?: string | null
}

/**
 * Minden lokális tábla kiürítése a jelölő-tábla kivételével.
 * Visszaadja a kiürített táblák számát.
 */
export async function wipeLocalMirror(): Promise<number> {
  const tablak = await dbSelect<{ name: string }>(
    `SELECT name FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name <> ?`,
    [META_TABLA],
  )
  for (const t of tablak) {
    // A táblanév a saját DB-nk sqlite_master-éből jön; az idézőjel-duplázás a
    // szabályos SQLite-escape azonosítókra.
    await dbExecute(`DELETE FROM "${t.name.replace(/"/g, '""')}"`)
  }
  return tablak.length
}

/**
 * Egy számláló-lekérdezés, amely hiányzó táblánál (a migráció még nem
 * hozta létre) 0-t ad — de MINDEN MÁS hibát tovább dob (fail-closed: egy
 * IPC-hiba nem számíthat „nincs függő sor"-nak).
 */
async function szamol(sql: string, params: (string | number)[] = []): Promise<number> {
  try {
    const rows = await dbSelect<{ n: number }>(sql, params)
    return Number(rows[0]?.n ?? 0)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/no such table/i.test(msg)) return 0
    throw err
  }
}

/**
 * A gépen maradt, még fel nem küldött írások és lefoglalt sorszámok
 * megszámolása — MINDEN queue-ra (a fejléc-jelvény és a tulajdonos-váltás
 * közös forrása; egy igazságforrás, nem két külön számolás).
 */
export async function szamolFuggoSorokat(): Promise<FuggoSorok> {
  const outboxPending = await szamol(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending' AND mutation_id IS NULL`,
  )
  const outboxFailedMind = await szamol(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'failed' AND mutation_id IS NULL`,
  )
  const outboxConflict = await szamol(
    `SELECT COUNT(*) AS n FROM outbox
      WHERE status = 'failed' AND mutation_id IS NULL AND last_error LIKE 'conflict:%'`,
  )
  // A pénzügyi mutation-sorok az outboxban (nyugta/befizetés/kiadás insert)
  // + a pending-táblák conflict-jai (a mutation-sor ott már törölve).
  const penzugyiPending = await szamol(
    `SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending' AND mutation_id IS NOT NULL`,
  )
  const penzugyiConflict =
    (await szamol(`SELECT COUNT(*) AS n FROM chitantak_local WHERE sync_state = 'conflict'`)) +
    (await szamol(`SELECT COUNT(*) AS n FROM befizetes_pending_local WHERE sync_state = 'conflict'`)) +
    (await szamol(`SELECT COUNT(*) AS n FROM kiadas_pending_local WHERE sync_state = 'conflict'`))
  const szemelyPending = await szamol(
    `SELECT COUNT(*) AS n FROM szemely_pending_local WHERE sync_state = 'pending'`,
  )
  const szemelyConflict = await szamol(
    `SELECT COUNT(*) AS n FROM szemely_pending_local WHERE sync_state = 'conflict'`,
  )
  const csaladPending = await szamol(
    `SELECT COUNT(*) AS n FROM csalad_pending_local WHERE sync_state = 'pending'`,
  )
  const csaladConflict = await szamol(
    `SELECT COUNT(*) AS n FROM csalad_pending_local WHERE sync_state = 'conflict'`,
  )
  const gyerekPending = await szamol(
    `SELECT COUNT(*) AS n FROM gyerek_pending_local WHERE sync_state = 'pending'`,
  )
  const gyerekConflict = await szamol(
    `SELECT COUNT(*) AS n FROM gyerek_pending_local WHERE sync_state = 'conflict'`,
  )
  const excelPending = await szamol(`SELECT COUNT(*) AS n FROM excel_outbox WHERE status = 'pending'`)
  const excelBlocked = await szamol(`SELECT COUNT(*) AS n FROM excel_outbox WHERE status = 'blocked'`)
  const foglaltSorszamok =
    (await szamol(`SELECT COUNT(*) AS n FROM iratszam_wallet_local WHERE used = 0`)) +
    (await szamol(`SELECT COUNT(*) AS n FROM chitanta_wallet_local WHERE used = 0`))

  const outboxFailed = Math.max(0, outboxFailedMind - outboxConflict)
  const irasok =
    outboxPending +
    outboxFailedMind +
    penzugyiPending +
    penzugyiConflict +
    szemelyPending +
    szemelyConflict +
    csaladPending +
    csaladConflict +
    gyerekPending +
    gyerekConflict +
    excelPending +
    excelBlocked
  const hibas =
    outboxFailedMind + penzugyiConflict + szemelyConflict + csaladConflict + gyerekConflict + excelBlocked
  return {
    osszes: irasok + foglaltSorszamok,
    irasok,
    hibas,
    foglaltSorszamok,
    reszletek: {
      outboxPending,
      outboxFailed,
      outboxConflict,
      penzugyiPending,
      penzugyiConflict,
      szemelyPending,
      szemelyConflict,
      csaladPending,
      csaladConflict,
      gyerekPending,
      gyerekConflict,
      excelPending,
      excelBlocked,
    },
  }
}

/** Az előző tulajdonos e-mailje a gépen feloldható forrásokból (best-effort). */
async function elozoTulajdonosEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const utolso = getLastUser()
  if (utolso?.id === userId && utolso.email) return utolso.email
  try {
    const rows = await dbSelect<{ email: string | null }>(
      `SELECT email FROM profiles_local WHERE id = ?1`,
      [userId],
    )
    return rows[0]?.email ?? null
  } catch {
    return null
  }
}

/**
 * A belépő user és a tükör tulajdonosának egyeztetése — a részleteket lásd a
 * fájl fejlécében. Az auth-gate a sikeres visszatérésig NEM engedi be a usert.
 *
 * `opts.megerositve`: a hívó (a döntő-lap után) kifejezetten engedi az előző
 * tulajdonos függő sorainak megsemmisítését.
 */
export async function ensureLocalMirrorOwner(
  userId: string,
  opts: { megerositve?: boolean } = {},
): Promise<MirrorOwnerResult> {
  if (!userId) return { ok: false, wiped: false, error: 'Hiányzó user-azonosító.' }
  if (ellenorzottUserId === userId) return { ok: true, wiped: false }

  try {
    await dbExecute(
      `CREATE TABLE IF NOT EXISTS ${META_TABLA} (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
    )
    const sorok = await dbSelect<{ v: string }>(
      `SELECT v FROM ${META_TABLA} WHERE k = ?`,
      [TULAJDONOS_KULCS],
    )
    const tulajdonos = sorok[0]?.v ?? null

    let wiped = false
    if (tulajdonos !== userId) {
      let torolni = true
      if (tulajdonos === null) {
        // Örökbefogadási ág — csak a javítás utáni ELSŐ belépésen fordulhat
        // elő. A lastUser a legutóbb bejelentkezett user (desktop-user.ts).
        const utolso = getLastUser()
        if (utolso?.id === userId) torolni = false
      }
      if (torolni) {
        // desk-sync-10: a törlés ELŐTT a függő sorok és a lefoglalt sorszámok
        // számbavétele — ha van, csak explicit megerősítéssel törlünk.
        const fuggo = await szamolFuggoSorokat()
        if (fuggo.osszes > 0 && !opts.megerositve) {
          const email = await elozoTulajdonosEmail(tulajdonos)
          return {
            ok: false,
            wiped: false,
            megerositesKell: true,
            fuggo,
            elozoTulajdonos: tulajdonos,
            elozoTulajdonosEmail: email,
            error:
              `Ezen a gépen ${email ?? 'az előző felhasználó'} ${fuggo.irasok} még fel nem küldött ` +
              `tétele és ${fuggo.foglaltSorszamok} lefoglalt sorszáma van. Előbb ő lépjen be és ` +
              'szinkronizáljon, vagy erősítsd meg a törlést.',
          }
        }
        const db = await wipeLocalMirror()
        // 2026-09-05: tulajdonos-váltáskor az ELŐZŐ felhasználó PIN-je sem
        // maradhat a gépen (a PIN a tulajdonoshoz kötött; a clearPin a
        // tulajdonos-jelölőt és a remember-jelzőt is törli).
        //
        // ⚠️ CSAK az IDEGEN kód törlődik (bíráló P1): a jelszavas /login →
        // /pin-setup → / úton a BELÉPŐ a saját kódját már beállította, MIELŐTT
        // az AuthGate ide ér (a login-oldal nem futtat tulajdonos-ellenőrzést).
        // Egy feltétel nélküli clearPin a belépő friss kódját törölte volna
        // némán — a következő offline indítás a varázslóra futott, internet
        // nélkül nem volt belépés. 'sajat' → marad; 'nincs' → nincs mit törölni.
        try {
          if ((await pinTulajdonosEllenorzes(userId)) === 'idegen') await clearPin()
        } catch (err) {
          // A kulcstár nem válaszol: nem törlünk vakon (a belépő saját kódja
          // lehet); az idegen kódot a PIN-belépő tulajdonos-kapuja úgyis
          // fail-closed elutasítja, az AuthGate session-ága pedig törli.
          console.error('[tükör-tulajdonos] a régi PIN ellenőrzése/törlése nem sikerült:', err)
        }
        wiped = true
        console.warn(
          `[mirror-owner] tulajdonos-váltás: ${db} lokális tábla kiürítve ` +
            `(előző tulajdonos: ${tulajdonos ?? 'ismeretlen'}; ` +
            `megsemmisített függő sorok: ${fuggo.irasok}, sorszámok: ${fuggo.foglaltSorszamok}).`,
        )
      }
    }

    await dbExecute(
      `INSERT INTO ${META_TABLA} (k, v) VALUES (?, ?)
         ON CONFLICT(k) DO UPDATE SET v = excluded.v`,
      [TULAJDONOS_KULCS, userId],
    )
    ellenorzottUserId = userId
    return { ok: true, wiped }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ismeretlen'
    return { ok: false, wiped: false, error: msg }
  }
}
