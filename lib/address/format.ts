/**
 * Romániai cím-formátum helper-ek.
 *
 * A hivatalos román cím-formátum:
 *   Strada / Bulevardul / Aleea / ... <NÉV>, nr. <SZÁM>, bl. <BLOKK>, sc. <LÉPCSŐHÁZ>, ap. <LAKÁS>
 *
 * A wizard-ben a lelkész:
 *   - Az utca név autocomplete-ből jön (a `StreetRow` tartalmazza a `street_type_ro`-t:
 *     „Strada", „Bulevardul", „Aleea", stb.). Az utca-név pedig a típus NÉLKÜL van
 *     tárolva. Így a mentéskor kombinálnunk kell.
 *   - A házszámnál csak a számot írja (pl. „12" vagy „bl.4 ap.2"). A hivatalos iratra
 *     a „nr." prefix kerül elé.
 *
 * Ezek a helper-ek **idempotensek**: ha a bemenet már tartalmazza a prefix-et, nem
 * duplázzák.
 */

/**
 * Az ismert román utca-típus prefixek. Lista bővíthető.
 * A „Drumul" és „Șoseaua" ritkább, de előfordul.
 */
const STREET_TYPE_REGEX =
  /^(Str\.?|Strada|Bd\.?|Bulevardul|Aleea|Ale\.?|Piața|Piata|Pța\.?|Pta\.?|Intrarea|Intr\.?|Șoseaua|Soseaua|Șos\.?|Sos\.?|Calea|Drumul|Drm\.?|Splaiul|Spl\.?|Fundătura|Fundatura|Fnd\.?|Cartierul|Cart\.?)(\s|\.)/i

/**
 * Visszaadja az utca nevét a típus-prefixszel együtt.
 * - Ha a név már tartalmazza (pl. a user már leírta „Strada Mihai Eminescu"-t), érintetlen.
 * - Ha van `streetType` (az adrstreet-ből), azt használja — különben a „Strada" a default.
 */
export function formatStreetWithType(
  street: string,
  streetType?: string | null
): string {
  const s = street.trim()
  if (!s) return ''
  if (STREET_TYPE_REGEX.test(s)) return s
  const type = streetType?.trim() || 'Strada'
  return `${type} ${s}`
}

/**
 * Visszaadja a házszámot a „nr." prefixszel.
 * - Ha már tartalmazza (pl. „nr. 12" vagy „numărul 12"), érintetlen.
 * - Ha csak a szám van (pl. „12"), elé teszi.
 * - Üres stringre üres stringet ad.
 */
export function formatHouseNumber(n: string): string {
  const s = n.trim()
  if (!s) return ''
  if (/^(nr\.?|numărul|numarul|num\.?)\s/i.test(s)) return s
  return `nr. ${s}`
}

/**
 * Fordított: kivonja a „nr." prefixet — a szerkeszthető Input-mezőbe.
 * Ha a user-t szerkesztésbe engedjük, a „nr." ne zavarjon. Az onBlur-kor
 * újra alkalmazzuk.
 */
export function stripHouseNumberPrefix(n: string): string {
  const s = n.trim()
  return s.replace(/^(nr\.?|numărul|numarul|num\.?)\s+/i, '').trim()
}
