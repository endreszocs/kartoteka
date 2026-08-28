/**
 * local-mirror-owner — a lokális SQLCipher-tükör tulajdonos-ellenőrzése
 * (P1-4 / B-blokk, pénzügyi audit 2026-08-28).
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
 * A wipe a sqlite_master-ből enumerál (nem kézzel karbantartott táblalista):
 * egy KÉSŐBB hozzáadott tükör-tábla is automatikusan törlődik — a kézi lista
 * némán kihagyná.
 *
 * HIBA-VISELKEDÉS: ha a DB nem érhető el (böngésző dev-mód, IPC-hiba), a
 * hívó felé hibát adunk vissza, de ez nem adatszivárgás-kapu: ugyanaz a
 * megszakadt IPC a tükör OLVASÁSÁT is lehetetlenné teszi — ahol nincs
 * elérhető tükör, ott nincs mit védeni.
 */

import { getLastUser } from './desktop-user'
import { dbExecute, dbSelect } from './local-db'

const META_TABLA = 'local_meta'
const TULAJDONOS_KULCS = 'mirror_owner_user_id'

/** Folyamat-szintű gyorsítótár — egy futáson belül user-enként egyszer fut. */
let ellenorzottUserId: string | null = null

export interface MirrorOwnerResult {
  ok: boolean
  /** true, ha a tükör kiürült (tulajdonos-váltás történt). */
  wiped: boolean
  error?: string
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
 * A belépő user és a tükör tulajdonosának egyeztetése — a részleteket lásd a
 * fájl fejlécében. Az auth-gate a sikeres visszatérésig NEM engedi be a usert.
 */
export async function ensureLocalMirrorOwner(userId: string): Promise<MirrorOwnerResult> {
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
        const db = await wipeLocalMirror()
        wiped = true
        console.warn(
          `[mirror-owner] tulajdonos-váltás: ${db} lokális tábla kiürítve ` +
            `(előző tulajdonos: ${tulajdonos ?? 'ismeretlen'}).`,
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
