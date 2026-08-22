/**
 * A splash-színpad GEOMETRIÁJA — import-mentes mag.
 *
 * MIÉRT KÜLÖN FÁJL: a `components/ui/splash-screen.tsx` `'use client'` és React-et
 * importál, ezért önmagában nem tesztelhető. Ez a mag tiszta matematika, és a
 * `scripts/selftest-splash-stage.mjs` ezt fordítja/futtatja. Ugyanaz a minta, mint
 * a `finance-scope-core.ts` / `module-scope-core.ts` esetében.
 *
 * ⛔ MIÉRT VAN EGYÁLTALÁN ŐRSZEM EGY SPLASH-EN (2026-08-22, Endre bejelentése):
 * a fogadóképernyő laptopon elcsúszott — 1536×730-as nézetben a színpad 192
 * képponttal jobbra és 108-cal lefelé, bal oldalt és fölül fekete sávval. Két,
 * egymástól független oka volt:
 *
 *   (1) IGAZÍTÁS: a réteg `place-items: center`-rel igazított, a színpad
 *       LAYOUT-doboza viszont 1920×1080 marad (a kicsinyítést a `transform:
 *       scale()` végzi, ami a layout-méretet nem változtatja). Laptopon ez a
 *       doboz nagyobb a rétegnél, a középre igazítás negatív pozíciót adna, a
 *       böngésző pedig a túllógó rács-elemet a kezdőélre kapcsolja — így a doboz
 *       közepe elcsúszik a képernyő közepétől, és a `scale` már félre landol.
 *       → megoldás a komponensben: abszolút pozíció + `translate(-50%, -50%)`.
 *
 *   (2) VÁGÁS: a „kitölt és vág" (`Math.max`) mód a böngésző-viewportnál — ami
 *       laptopon szinte mindig szélesebb a 16:9-nél, mert a böngésző fejléce
 *       függőlegesen eszik — gyakorlatilag MINDIG függőlegesen vág, pont ott,
 *       ahol a főcím van. → ezt oldja meg a lenti `splashStageScale`.
 */

/** A tervezői színpad mérete. Minden pozíció ebben a koordinátarendszerben él. */
export const SZINPAD_SZELESSEG = 1920
export const SZINPAD_MAGASSAG = 1080

/**
 * A főcím („✦ Békesség Istentől!") a színpad 78. képpontján kezdődik, vagyis a
 * felső 7,2% a KRITIKUS SÁV. A „kitölt és vág" a felesleget fél-fél arányban
 * veszi le fentről és lentről, tehát a TELJES függőleges vágás legfeljebb ennek
 * a kétszerese lehet — 15% ráhagyással, hogy a betűk teteje se súrolja a szélt.
 */
export const FOCIM_TETEJE = 78
const KRITIKUS_FELSO_SAV = FOCIM_TETEJE / SZINPAD_MAGASSAG
export const MAX_VAGAS = KRITIKUS_FELSO_SAV * 2 * 0.85

export type SplashViewportMode = 'mobile' | 'tablet' | 'desktop'

export interface SplashStageScale {
  /** A színpadra alkalmazandó nagyítás. */
  skala: number
  /**
   * Melyik szabály döntött — a felületen nem látszik, az önellenőrzés viszont
   * ezt méri, és így a hibaüzenet is megmondja, MIÉRT lett ekkora.
   */
  mod: 'fill' | 'fit-tablet' | 'fit-vedelem'
}

/**
 * A színpad nagyítása egy adott viewportra.
 *
 * - tablet: mindig „minden látszik" (letterbox) — ez eddig is így volt;
 * - desktop: „kitölt és vág", DE csak amíg a vágás belefér a kritikus sávba;
 *   fölötte szintén letterbox, hogy a főcím teteje ne csússzon le a képernyőről.
 *
 * Egy valódi 16:9 kijelzőn (1920×1080, 1600×900) a vágás nulla vagy elenyésző,
 * ott tehát marad az eredeti, teljes képernyős élmény.
 */
export function splashStageScale(
  viewportSzelesseg: number,
  viewportMagassag: number,
  mode: SplashViewportMode,
): SplashStageScale {
  const sx = viewportSzelesseg / SZINPAD_SZELESSEG
  const sy = viewportMagassag / SZINPAD_MAGASSAG
  const fit = Math.min(sx, sy) // minden látszik, marad sáv
  const fill = Math.max(sx, sy) // kitölt, de vág

  if (mode === 'tablet') return { skala: fit, mod: 'fit-tablet' }

  // Mennyit venne le a fill az egyes tengelyeken, a LÁTVÁNY arányában?
  const fuggolegesVagas = (SZINPAD_MAGASSAG * fill - viewportMagassag) / (SZINPAD_MAGASSAG * fill)
  const vizszintesVagas = (SZINPAD_SZELESSEG * fill - viewportSzelesseg) / (SZINPAD_SZELESSEG * fill)

  if (fuggolegesVagas > MAX_VAGAS || vizszintesVagas > MAX_VAGAS) {
    return { skala: fit, mod: 'fit-vedelem' }
  }
  return { skala: fill, mod: 'fill' }
}

/**
 * A főcím tetejének képernyő-koordinátája, KÖZÉPRE igazított színpadot
 * feltételezve. Az önellenőrzés ezzel bizonyítja, hogy a főcím tényleg a
 * képernyőn van (`> 0`) — nem a szabályt ismétli meg, hanem a KÖVETKEZMÉNYÉT méri.
 */
export function focimKepernyoY(
  viewportMagassag: number,
  skala: number,
): number {
  const latvanyMagassag = SZINPAD_MAGASSAG * skala
  const szinpadTeteje = viewportMagassag / 2 - latvanyMagassag / 2
  return szinpadTeteje + FOCIM_TETEJE * skala
}
