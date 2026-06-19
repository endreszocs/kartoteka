/**
 * Per-számadásicél személy-párosítási hatókör (person scope).
 *
 * 2026-06-19 — az Adatok_2025.xlsx teljes per-kategória elemzéséből (lásd
 * docs/project-tracking/KARTOTEKA-import-parositas-audit-2026-06-19.md, 13. szakasz).
 *
 * A pénzügyi importáló CSAK azoknál a számadási céloknál próbálja a befizetőt/
 * partnert a tagnyilvántartáshoz (szemely) párosítani, ahol ez ÉRTELMES — vagyis
 * ahol a forrás egy MAGÁNSZEMÉLY („Név - Cím" formátum). A kollektív (perselypénz),
 * intézményi/céges (pályázat, szponzor) és a belső-mozgás soroknál NEM párosítunk →
 * megszűnik a fölösleges „nem található" zaj és a téves párosítás kockázata.
 *
 * Scope:
 *   - 'required' : tag-bevétel, a tartozás-nyilvántartás szempontjából kritikus
 *                  (egyházfenntartás) — törekszünk a párosításra, a nem-találtat a
 *                  review kiemeli, de NEM blokkol (importálható id_szemely=null-lal is).
 *   - 'optional' : magánszemély is lehet (adományok, bérlet, sírhely, legátum,
 *                  iratterjesztés, visszatérítés; kiadás-oldalon a segély átvevője) —
 *                  párosítunk, ha megy; ha nem (cég/anonim), id_szemely=null, kézi opció.
 *   - 'none'     : SOHA nem párosítunk (perselypénz, pályázat, szponzor, belső mozgás,
 *                  általános kiadás-partnerek = cégek/intézmények).
 *
 * MVP: kód-konstans (gyors, nincs Kartotéka-MCP, nem hárít SQL-t a userre). Később
 * migrálható DB-oszlopba (`szamadasicel.person_scope`), ha a karbantartás teher.
 */

export type PersonScope = 'required' | 'optional' | 'none'

/** Kód (pont-formátum, pl. "101.01") → person scope. A felsoroltakon kívül minden 'none'. */
const PERSON_SCOPE: Record<string, PersonScope> = {
  // ── Tag-bevételek ────────────────────────────────────────────────────────
  '101.01': 'required', // Egyházfenntartói járulék (tartozás-kritikus)
  '101.04': 'optional', // Adományok hívektől (≈66% magánszemély, többi cég/anonim)
  '104.05': 'optional', // Területek bérjövedelme (bérlő/szerződő fél)
  '101.06': 'optional', // Sírhelyek eladása/bérlete/gondozása
  '102.06': 'optional', // Legátumok – adományok teológiai hallgatóknak
  '103.06': 'optional', // Iratterjesztés – bevétel
  '103.08': 'optional', // Számlavisszatérítések
  // ── Kiadás-oldal (opcionális átvevő-link) ────────────────────────────────
  '202.08': 'optional', // Egyháztagok segélyezése (a segélyezett magánszemély)
}

/** Bemenet normalizálása a konfig-kulcs formátumára: vessző→pont, trim. */
function normalizeKod(kod: string | null | undefined): string {
  return (kod ?? '').toString().trim().replace(',', '.')
}

/** Egy kód person-scope-ja (alapértelmezés: 'none'). */
export function personScope(kod: string | null | undefined): PersonScope {
  return PERSON_SCOPE[normalizeKod(kod)] ?? 'none'
}

/** Igaz, ha ennél a kódnál egyáltalán meg kell kísérelni a személy-párosítást. */
export function shouldResolvePerson(kod: string | null | undefined): boolean {
  return personScope(kod) !== 'none'
}
