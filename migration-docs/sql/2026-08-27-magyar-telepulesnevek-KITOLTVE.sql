-- ============================================================================
-- MAGYAR TELEPÜLÉSNEVEK — a három érintett település kitöltése (2026-08-27)
--
-- A `2026-08-27-magyar-telepulesnevek-potlasa.sql` 2. blokkja HÁROM települést
-- talált, ahol gyülekezet van, de az `adrlocality.name_hu` üres. Ez a fájl
-- ezt a hármat tölti ki.
--
-- ⚠️ MIÉRT ÍRHATOM BE MÉGIS, HA EGÉSZ NAP AZT MONDTAM, NEM TALÁLOK KI NEVET?
-- ─────────────────────────────────────────────────────────────────────────
-- Mert egyik sem találgatás: MINDHÁROM magyar településnév AZ ADATBÁZIS SAJÁT
-- ADATÁBÓL vezethető le — a gyülekezet hivatalos magyar nevéből, amit a
-- felhasználó maga vitt fel. Nem külső tudásra hivatkozom, hanem a rendszerben
-- MÁR MEGLÉVŐ, felhasználó által megadott névre:
--
--   adrlocality 16488  „Brateş"          → Barátos
--        forrás: congregations.nev_hu = „Barátosi Református Egyházközség"
--                (és a weboldal slugja: baratosi-reformatus-egyhazkozseg)
--
--   adrlocality 21417  „Sfântu Gheorghe" → Sepsiszentgyörgy
--        forrás: congregations.nev_hu =
--                „Sepsiszentgyörgy III. – Belvárosi Református Egyházközség"
--
--   adrlocality 16537  „Ozun"            → Uzon
--        forrás: congregations.nev_hu = „Uzoni Református Egyházközség"
--
-- ⚠️ ETTŐL FÜGGETLENÜL NÉZD ÁT, MIELŐTT FUTTATNÁD. Az `adrlocality` ORSZÁGOS
--    törzstábla: amit ide írunk, MINDEN gyülekezetre hat, amelyik ehhez a
--    településhez van kötve (a 16488-hoz jelenleg kettő: a Barátosi és a
--    „Teszt gyüli").
--
-- BIZTONSÁG: minden UPDATE-nek van `AND name_hu IS NULL` feltétele, tehát egy
-- MÁR kitöltött nevet ez a szkript nem írhat felül. Idempotens: másodszorra
-- 0 sort érint.
--
-- FUTTATÁS: Supabase SQL editor, EGYBEN. A végén egyetlen ellenőrző táblázat.
-- ============================================================================


-- ── 1. ELŐFELTÉTEL-ŐR ──────────────────────────────────────────────────────
--    Fail-closed: ha a három település nem az, amire számítunk (más azonosító,
--    más román név, vagy időközben már kitöltötték), MEGÁLLUNK. Egy országos
--    törzstáblába nem írunk vaktában.
DO $elofeltetel$
DECLARE
  v_id integer;
  v_ro text;
  v_vart text;
BEGIN
  FOREACH v_id IN ARRAY ARRAY[16488, 21417, 16537] LOOP
    v_vart := CASE v_id
                WHEN 16488 THEN 'Brateş'
                WHEN 21417 THEN 'Sfântu Gheorghe'
                WHEN 16537 THEN 'Ozun'
              END;

    SELECT l.name INTO v_ro FROM public.adrlocality l WHERE l.id = v_id;

    IF v_ro IS NULL THEN
      RAISE EXCEPTION 'ELŐFELTÉTEL: nincs % azonosítójú település a cím-törzsben.', v_id;
    END IF;

    IF v_ro IS DISTINCT FROM v_vart THEN
      -- ⚠️ A `%%` a PL/pgSQL RAISE-ben LITERÁLIS százalékjel, NEM helyőrző.
      --    Az első változatban `„%%"`-t írtam, így a formátumban egyetlen
      --    helyőrző maradt, miközben három argumentumot adtam át:
      --    „42601: too many parameters specified for RAISE".
      RAISE EXCEPTION
        'ELŐFELTÉTEL: a % azonosítójú település neve „%", nem „%" — az azonosítók elcsúsztak, NE írjunk bele.',
        v_id, v_ro, v_vart;
    END IF;
  END LOOP;
END
$elofeltetel$;


-- ── 2. A KITÖLTÉS ──────────────────────────────────────────────────────────
--    Egyetlen utasítás, hogy vagy mind a három megtörténjen, vagy egyik sem.
UPDATE public.adrlocality AS l
   SET name_hu = u.nev_hu,
       review_source = 'kartoteka-2026-08-27-gyulekezeti-nevbol'
  FROM (VALUES
    (16488, 'Barátos'),
    (21417, 'Sepsiszentgyörgy'),
    (16537, 'Uzon')
  ) AS u(id, nev_hu)
 WHERE l.id = u.id
   -- ⚠️ MÁR KITÖLTÖTT NEVET SOSEM ÍRUNK FELÜL.
   AND NULLIF(btrim(l.name_hu), '') IS NULL;


-- ============================================================================
-- ELLENŐRZÉS — egyetlen táblázat, ez a fájl utolsó utasítása.
-- (A Supabase editor egy szkriptből csak az utolsó rácsot mutatja.)
-- Mindhárom sor ✅ kell legyen, és a `cim_hu` már MAGYARUL hozza a települést.
-- ============================================================================
SELECT
  l.id AS adrlocality_id,
  l.name AS roman_nev,
  l.name_hu AS magyar_nev,
  CASE WHEN NULLIF(btrim(l.name_hu), '') IS NOT NULL THEN '✅ kitöltve' ELSE '❌ ÜRES' END AS allapot,
  c.nev_hu AS gyulekezet,
  i.cim_hu,
  i.cim_ro,
  CASE WHEN i.cim_hu IS DISTINCT FROM i.cim_ro
       THEN '✅ a két nyelv eltér'
       WHEN i.cim_hu IS NULL THEN '➖ nincs publikált oldal'
       ELSE '⚠️ még mindig azonos' END AS ketnyelvuseg
FROM public.adrlocality l
LEFT JOIN public.congregations c ON c.adrlocality_id = l.id AND c.status = 'active'
LEFT JOIN public.public_sites ps ON ps.congregation_id = c.id AND ps.is_published
LEFT JOIN LATERAL public.public_site_identitas(ps.slug) i ON true
WHERE l.id IN (16488, 21417, 16537)
ORDER BY l.id, c.nev_hu;
