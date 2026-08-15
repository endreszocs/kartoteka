/**
 * Választói jogosultság újraszámítása — KÖZÖS, „best-effort" hívó.
 *
 * 2026-08-15 (desktop-paritás 2. szelet): az implementáció a közös
 * @kartoteka/core csomagba került (members/voter-recompute.ts), mert a
 * desktop kivezetés-tükre is ugyanezt hívja — két másolat helyett egy közös
 * függvény. Innen re-export a meglévő webes importok kedvéért; a szerződés
 * (best-effort, de nem néma, fail-closed válasz-értelmezés) a core-fájl
 * fejlécében olvasható.
 */

export {
  VOTER_RECOMPUTE_WARNING,
  refreshVoterEligibility,
  type VoterRecomputeResult,
} from '@kartoteka/core'
