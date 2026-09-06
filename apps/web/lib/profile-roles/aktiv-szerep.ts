/**
 * AZ AKTÍV SZEREP FELOLDÁSA — EGY forrás (2026-09-05, P3-utómunka, profil).
 *
 * MIÉRT SZÜLETETT: a „Kapcsolatok" felületet NÉGY hely döntötte el, három
 * különböző szabállyal:
 *   · a profil-dialógus linkje az AKTÍV profil-szerepből (`aktiv.role`),
 *   · a /profile oldal kártyája a legacy `profiles.role` skalárból,
 *   · a /profile/kapcsolatok oldal szintén a skalárból (`access.role`),
 *   · a kapcsolatok szerver-akciói az aktív szerepből, skalár-fallbackkel.
 * Egy két gyülekezetet szolgáló lelkész, aki épp könyvelői profiljára váltott,
 * a dialógusban NEM látta a linket, az oldal viszont beengedte, az akciók pedig
 * elutasították — három felület, három igazság. Mostantól MINDEN hely ezt a
 * feloldót hívja; a szabály (a `lib/auth/level-scope.ts` fejlécével egyezően):
 * AKTÍV profil-szerep → ha nincs, a legacy skalár (csak fallback).
 *
 * 2026-09-05 (bírálat, P2): a NÉGY hely BEMENETE is egy — mind a
 * `getEffectiveAccessContext()` kontextusát adja át (`lelkesziSzerepbenE(access)`),
 * nem a nyers `profiles.role`-t. Az `access.role` ISMERETLEN vagy hiányzó
 * skalárnál `'lelkesz'`-re esik vissza (effective-access.ts: a `/pending` oldal
 * ebből mutatja a KÉRT szerepet) — ez a feloldóban fail-open lenne, ezért a
 * kontextus `missingPrimaryRole` jelzésénél a válasz mindig „nem": ilyen
 * profilnak NINCS érvényes szerepe, a lelkészi felület és akciói zárva
 * maradnak (a dashboard-layout ugyanezt a profilt `/pending`-re irányítja, a
 * szerver-akció viszont önálló POST — ott csak ez a kapu véd).
 *
 * Direktíva-mentes modul (nincs `server-only` / `use client`): a szerver-oldal
 * és — a dialógus adatszerződésén át — a kliens ugyanezt a döntést kapja.
 */

export interface AktivSzerepKontextus {
  /** Az aktív `profile_roles` sor (a fejléc bal chipje) — `null`, ha nincs. */
  activeProfileRole: { role: string } | null | undefined
  /** A legacy `profiles.role` skalár — CSAK akkor számít, ha nincs aktív sor. */
  role: string | null | undefined
  /**
   * `true` = a profil `role` skalárja ISMERETLEN (effective-access
   * `missingPrimaryRole`): a `role` ilyenkor a `'lelkesz'` kijelző-visszaesés,
   * nem jogosultság → a feloldó fail-closed `null`/`false`-t ad.
   */
  missingPrimaryRole?: boolean
}

/** Az érvényes szerep kulcsa: az aktív sor szerepe, különben a skalár, különben `null`. */
export function aktivSzerepKulcs(ctx: AktivSzerepKontextus): string | null {
  // FAIL-CLOSED: ismeretlen elsődleges szerepnél a skalár nem igazság.
  if (ctx.missingPrimaryRole) return null
  const aktiv = ctx.activeProfileRole?.role
  if (aktiv) return aktiv
  return ctx.role || null
}

/**
 * Lelkészi szerepben jár-e el a felhasználó. A „Kapcsolatok" (gyülekezeti
 * hozzáférés-jóváhagyás) felületet és akcióit KIZÁRÓLAG ez dönti el.
 */
export function lelkesziSzerepbenE(ctx: AktivSzerepKontextus): boolean {
  return aktivSzerepKulcs(ctx) === 'lelkesz'
}
