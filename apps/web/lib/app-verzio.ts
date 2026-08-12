/**
 * A FUTÓ KIADÁS VERZIÓSZÁMA — EGYETLEN hiteles forrásból (2026-08-12).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT EZ A FÁJL
 * ════════════════════════════════════════════════════════════════════════════
 * Az admin ÁTTEKINTÉS „Futó kiadás" csempéje a `docs/CHANGELOG.md` legfrissebb,
 * verzióval bíró bejegyzéséből vette a számot. Csakhogy a changelog azt mondja
 * meg, mit ÍRTUNK LE utoljára — nem azt, hogy MI FUT. 2026-08-12-én a changelog
 * legfrissebb verziós bejegyzése `web v0.9.162` volt, miközben élesben a
 * 0.9.164 futott: a csempe KÉT KIADÁSSAL régebbi számot állított a rendszerről,
 * a saját címkéje szerint pedig „a futó kiadás"-t mutatta.
 *
 * Az egyetlen hiteles forrás az `apps/web/package.json` `version` mezője: azt
 * a build viszi magával, tehát pontosan az a kód fut, amihez tartozik.
 *
 * ⚠️ MIÉRT STATIKUS IMPORT, ÉS NEM `fs.readFile` FUTÁSIDŐBEN. A build
 *    `output: 'standalone'`, ahol a fájlrendszer más alakú, mint a repóban, és
 *    a tracer csak az explicit felsorolt fájlokat viszi magával
 *    (`next.config.ts` → `outputFileTracingIncludes`). A statikus import
 *    BUILD-IDŐBEN beépül a kötegbe, tehát futásidőben nincs mit elrontani.
 *
 * ⚠️ Ez a modul SZÁNDÉKOSAN direktíva-mentes (nincs rajta `use server` és
 *    `use client` sem): szerver-akció és szerver-komponens is hívhatja.
 */

import pkg from '../package.json'

/**
 * A futó webalkalmazás verziója NYERSEN, ahogy a `package.json`-ban áll
 * („0.9.164"). Kiírás előtt a `verzioFelirat()` formázza („v0.9.164").
 *
 * Üres szöveg, ha a mező hiányzik — a hívónak ilyenkor KI KELL MONDANIA, hogy
 * nem tudja. Néma nullát/kitalált verziót nem írunk ki.
 */
export const FUTO_WEB_VERZIO: string =
  typeof pkg.version === 'string' ? pkg.version.trim() : ''
