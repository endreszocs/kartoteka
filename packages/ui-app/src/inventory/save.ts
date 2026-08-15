/**
 * Leltári tétel mentésének KÖZÖS szabály-rétege (2026-08-15, desktop-paritás
 * 4. szelet — „Leltár: rögzítés + fisa").
 *
 * MIÉRT: a webes mentés Server Actionben él (`apps/web/app/(dashboard)/leltar/
 * actions.ts`), a desktopé direkt Supabase-hívás — ha a payload-építés és a
 * leltári szám-szabály két külön másolatban élne, az pontosan a „második
 * felület a régi implementációt őrzi" hibaosztály lenne. Ezért itt a PURE
 * (IO-mentes) rész közös: a szám-generálás SZABÁLYA, a kanonikus + fallback
 * payload és a séma-fallback felismerése. Az IO (selectAllPaged, insert/update,
 * ütközés-újrapróbálás) platformonként marad, mert a kliens más:
 *   - web: Server Action + `getEffectiveCongregationContext`
 *   - desktop: `getVerifiedSession` őr + szerver-visszaigazolásos írás
 */

import type { InventoryCategory } from './constants'
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_PREFIXES, serializeInventoryCategory } from './constants'

/**
 * A következő leltári szám a MÁR KIADOTT számok teljes listájából.
 *
 * A hívó felelőssége, hogy a listát LAPOZVA és fail-closed módon kérdezze le
 * (a PostgREST 1000 soros néma plafonja ismert hibaosztály — hiányos listából
 * itt egy már használt szám ismétlődne). Szöveges szám miatt order+limit(1)
 * nem jó ('K-999' > 'K-1000' szövegként) — a numerikus suffix maximumát vesszük.
 */
export function nextLeltariSzam(
  existingSzamok: Array<string | null>,
  category: InventoryCategory,
): string {
  const prefix = INVENTORY_CATEGORY_PREFIXES[category]
  let max = 0
  for (const szam of existingSzamok) {
    const m = String(szam || '').match(/-(\d+)$/)
    if (m) {
      const n = parseInt(m[1])
      if (n > max) max = n
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

/** A webes zod-séma (lib/validations/inventory.ts) mezőkészletének tükre. */
export interface InventoryUpsertInput {
  id?: string
  megnevezes: string
  kategoria: InventoryCategory
  beszerzes_erteke: number
  beszerzes_datuma?: string | null
  beszerzes_bizonylat?: string | null
  katalogus_kod?: string | null
  hasznalati_ido?: number | null
  helyszin?: string | null
  felelos_nev?: string | null
  megjegyzes?: string | null
  mennyiseg?: number | null
  mertekegyseg?: string | null
  /** undefined = a hívó NEM küldte a mezőt → a meglévő kapcsolat marad. */
  penzugy_xkey?: string | null
}

/**
 * A webes zod-validáció üzeneteinek tükre desktopos (zod-mentes) híváshoz.
 * Hibánál a magyar üzenet jön vissza; null = érvényes bemenet.
 */
export function validateInventoryUpsertInput(input: InventoryUpsertInput): string | null {
  if (!input.megnevezes || !input.megnevezes.trim()) return 'A megnevezés kötelező'
  if (!INVENTORY_CATEGORIES.includes(input.kategoria)) return 'Válasszon kategóriát'
  if (!(Number(input.beszerzes_erteke) > 0)) return 'Az érték pozitív szám kell legyen'
  if (input.mennyiseg != null && !(Number(input.mennyiseg) > 0)) {
    return 'A mennyiség pozitív szám kell legyen'
  }
  return null
}

/**
 * Séma-fallback felismerés: ha a hibaüzenet a MODERN mezőnevekre panaszkodik,
 * a hívó a `modernFallback` payloaddal próbál újra (a webes actions.ts
 * `error?.message?.match(...)` mintája — egy forrásból).
 */
const INVENTORY_SCHEMA_FALLBACK_RE = /beszerzes_erteke|deleted|felelos_nev|hasznalati_ido/

export function isInventoryLegacySchemaError(message?: string | null): boolean {
  return Boolean(message && INVENTORY_SCHEMA_FALLBACK_RE.test(message))
}

export interface InventoryUpsertPayloads {
  /** Az új (kanonikus DB séma) szerinti mezőnevek. */
  record: Record<string, unknown>
  /** Backward-compat fallback (régi mezőnevek), ha az új séma még nincs migrálva. */
  modernFallback: Record<string, unknown>
}

/**
 * A mentés két payload-változata — a webes `saveInventoryItem` építésének
 * kiemelt, bit-azonos mása. A `vonalkod` mező NEM létezik a `leltar_tetelek`
 * táblában — ezért nem kerül a payload-ba. A `leltari_szam`-ot (új tételnél)
 * a hívó teszi rá MINDKÉT payloadra a generálás után.
 */
export function buildInventoryUpsertPayloads(
  d: InventoryUpsertInput,
  congregationId: string,
): InventoryUpsertPayloads {
  const serializedCategory = serializeInventoryCategory(d.kategoria)
  // 2026-08-09: kapcsolt kiadás (penzugy_xkey) — CSAK akkor nyúlunk hozzá, ha a
  // hívó ténylegesen küldte a mezőt (undefined = régi hívó → a meglévő link marad).
  const penzugyXkeyPatch =
    d.penzugy_xkey !== undefined ? { penzugy_xkey: d.penzugy_xkey || null } : {}

  const record: Record<string, unknown> = {
    megnevezes: d.megnevezes, kategoria: serializedCategory, beszerzesi_ertek: d.beszerzes_erteke,
    beszerzes_datuma: d.beszerzes_datuma || null, katalogus_kod: d.katalogus_kod || null,
    hasznalati_ido_ev: d.hasznalati_ido || null, helyszin: d.helyszin || null,
    felelos_neve: d.felelos_nev || null,
    megjegyzes: d.megjegyzes || null, is_deleted: false, congregation_id: congregationId,
    mennyiseg: d.mennyiseg ?? 1,
    mertekegyseg: d.mertekegyseg || 'db',
    beszerzes_bizonylat: d.beszerzes_bizonylat || null,
    ...penzugyXkeyPatch,
  }
  const modernFallback: Record<string, unknown> = {
    megnevezes: d.megnevezes, kategoria: serializedCategory, beszerzes_erteke: d.beszerzes_erteke,
    beszerzes_datuma: d.beszerzes_datuma || null, katalogus_kod: d.katalogus_kod || null,
    hasznalati_ido: d.hasznalati_ido || null, helyszin: d.helyszin || null,
    felelos_nev: d.felelos_nev || null,
    megjegyzes: d.megjegyzes || null, deleted: false, congregation_id: congregationId,
    mennyiseg: d.mennyiseg ?? 1,
    mertekegyseg: d.mertekegyseg || 'db',
    beszerzes_bizonylat: d.beszerzes_bizonylat || null,
    ...penzugyXkeyPatch,
  }

  return { record, modernFallback }
}

/**
 * A szám-lekérdezés hibájának egységes, cselekvésre váltható magyar üzenete
 * (a webes `generateNextLeltariSzam` fail-closed üzenetének közös forrása).
 */
export function leltariSzamQueryFailedMessage(detail: string): string {
  return (
    'Nem sikerült lekérdezni a már kiadott leltári számokat ' +
    `(${detail}), ezért új számot sem adhatunk ki — különben egy már ` +
    'használt leltári szám ismétlődne. Ellenőrizd az internetkapcsolatot, és ' +
    'próbáld újra; ha újra hibázik, jelezd a rendszergazdának.'
  )
}
