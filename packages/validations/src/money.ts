/**
 * money — cent- (bani-) pontosság közös helperei (D2, pénzügyi audit 2026-08-28).
 *
 * MIÉRT: a mentési utak sub-centes (2-nél több tizedesű) összeget is
 * átengedtek — sub-centes tárolt összegnél a képernyő (toFixed), a DB és a
 * desktop-Excel (roundCent) széthúz, és a hivatalos ív oszlopösszege banira
 * elcsúszhat. A sémák a `isCentPontos` refine-nal HANGOSAN utasítják el a
 * sub-centet; a `roundCent` a számított értékek (pl. deviza-átváltás)
 * normalizálására való a mentési út végén.
 *
 * FP-megjegyzés: a lebegőpontos zaj (0.1+0.2 = 0.30000000000000004) NEM
 * sub-cent — az összehasonlítás 1e-6 tűréssel fut, a kerekítés pedig
 * Number.EPSILON-nal tolja el a bináris ábrázolás alá csúszó feleket.
 */

/** Kerekítés 2 tizedesre (bani) — a desktop-Excel roundCent-jével egyező szemantika. */
export function roundCent(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Igaz, ha az érték bani-pontos (legfeljebb 2 tizedes, FP-zajt tűrve). */
export function isCentPontos(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6
}

/** Egységes hibaüzenet a sémák cent-refine-jához. */
export const CENT_UZENET =
  'Az összeg legfeljebb két tizedesjegyet (banit) tartalmazhat.'
