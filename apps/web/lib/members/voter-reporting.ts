/**
 * Választók névjegyzéke hivatalos nyomtatvány — KÖZÖS építő.
 *
 * 2026-07-24 (PR-8, F9): az implementáció a packages/ui-app/src/members/
 * voter-reporting.ts-be költözött, hogy a desktop Választók-oldala is
 * ugyanazt a lapozott (WYSIWYG .sheet) A4-nyomtatványt állítsa elő.
 * Ez a fájl útvonal-stabil re-export a webes importálóknak.
 */

export {
  buildVoterListReport,
  type VoterPrintRow as VoterRow,
  type VoterPrintResult,
} from '@kartoteka/ui-app'
