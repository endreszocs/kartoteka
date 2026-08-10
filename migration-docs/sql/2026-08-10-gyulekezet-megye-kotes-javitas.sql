-- KARTOTEKA — Gyülekezet ⇄ egyházmegye kötés: diagnózis + javítás (2026-08-10)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ════════════════════════════════════════════════════════════════════════════
-- MIÉRT
-- ════════════════════════════════════════════════════════════════════════════
-- A regisztráció SOHA nem hoz létre gyülekezetet: a /hozzaferes-kerese csak
-- KIVÁLASZT egy meglévőt, és a választott egyházmegye kizárólag a
-- `profiles.diocese_id`-be kerül (admin_activate_user). A `congregations.diocese_id`
-- oszlopot az egész alkalmazásban mindössze két hely írta — a Beállítások
-- (updateCongregation) és a Gyülekezet-beállító varázsló (saveCongregationSetup) —,
-- mindkettő `… || null` formában. A varázsló egyházmegye-választójában ráadásul
-- volt egy CSAPDA-opció, amelynek a CÍMKÉJE a jelenlegi egyházmegye neve volt
-- („… (jelenlegi)"), az ÉRTÉKE viszont üres string: aki rákattintott, hogy
-- „megerősítse" a jelenlegit, az valójában NULL-ra állította a kötést.
--
-- Következmények NULL `diocese_id` esetén (a 2026-08-09-es fail-closed hatókör óta):
--   • a gyülekezet EGYETLEN egyházmegyei/kerületi felületen sem jelenik meg,
--   • a beküldött iratai `diocese_id = NULL`-lal mennek, és NEM értesítenek
--     sem esperest, sem egyházmegyei admint (némán),
--   • a regisztrációs választó (congregations_for_registration) kiszűri
--     (`WHERE diocese_id IS NOT NULL`) → a saját lelkésze sem tudja kiválasztani,
--   • a lelkész `profiles.diocese_id` / `district_id` skalárja is NULL marad
--     (lib/users/activate-on-role-assign.ts a gyülekezetből olvassa),
-- azaz az állapot ÖNFENNTARTÓ és a felületről javíthatatlan volt.
--
-- KÓD-OLDALI JAVÍTÁS (már a branchben, ezzel az SQL-lel együtt élesíthető):
--   • a csapda-opció megszűnt (a helyőrző `disabled`, és csak akkor látszik,
--     ha nincs beállított egyházmegye),
--   • a szerver soha nem ír NULL-t: üres/hiányzó érték = „ne nyúlj hozzá",
--   • a setup-varázsló mentés-kapuja kötelezővé teszi az egyházmegyét,
--   • új admin-felület: /admin/gyulekezetek → „Egyházmegye hozzárendelése".
--
-- ════════════════════════════════════════════════════════════════════════════
-- HASZNÁLAT
-- ════════════════════════════════════════════════════════════════════════════
--   1. Futtasd le az „A) DIAGNÓZIS" szakaszt (CSAK OLVAS), és nézd meg az
--      eredményeket — különösen az A1 azon sorait, ahol `javasolt_diocese_id`
--      üres, és az A5 (kétértelmű nevek) listáját.
--   2. Ha az A5 üres és az A1-ben látott javaslatok helyesek, futtasd a
--      „B) JAVÍTÁS" szakaszt (BEGIN…COMMIT, idempotens).
--   3. Futtasd a „C) UTÓELLENŐRZÉS"-t. Ami ott még árván marad, azt KÉZZEL
--      kell eldönteni (A2/A3 fallback-források segítenek) — vagy egyszerűbben:
--      az admin felületen, a /admin/gyulekezetek „Egyházmegye hozzárendelése"
--      gombjával.
--   4. A „D) VÉDELEM" szakasz (trigger) OPCIONÁLIS, de erősen ajánlott: DB-
--      szinten tiltja, hogy egy meglévő kötés NULL-ra íródjon.
--
-- ⚠️ A javítás SOHA nem töröl és nem hoz létre gyülekezetet, és nem ír felül
--    MEGLÉVŐ (nem NULL) `diocese_id` értéket — kizárólag árva sorokat tölt ki.


-- ════════════════════════════════════════════════════════════════════════════
-- A) DIAGNÓZIS — csak olvas. Futtasd ELŐSZÖR!
-- ════════════════════════════════════════════════════════════════════════════

-- A0. Mennyi az árva gyülekezet egyáltalán?
SELECT count(*) FILTER (WHERE diocese_id IS NULL) AS arva_gyulekezet,
       count(*)                                   AS osszes_gyulekezet
FROM public.congregations;

-- A1. Az árva gyülekezetek + amit a legacy SZÖVEGES `egyhazmegye` oszlop javasol.
--     A `javasolt_diocese_id` NULL sorai KÉZI döntést igényelnek (nincs pontos
--     név-egyezés a dioceses táblában).
--     Az egyezés: kisbetűsített + trimmelt PONTOS név-egyezés (a szóköz/kis-nagy
--     betű eltérés nem indokolja a kézi döntést, de más már igen).
SELECT c.id,
       c.name,
       c.nev_hu,
       c.status,
       c.egyhazmegye                AS szoveges_megye,
       c.district                   AS szoveges_kerulet,
       d.id                         AS javasolt_diocese_id,
       d.name                       AS javasolt_megye_neve,
       di.name                      AS javasolt_kerulet_neve
FROM public.congregations c
LEFT JOIN public.dioceses  d  ON lower(btrim(d.name)) = lower(btrim(c.egyhazmegye))
LEFT JOIN public.districts di ON di.id = d.district_id
WHERE c.diocese_id IS NULL
ORDER BY (d.id IS NULL) DESC, c.name;   -- elöl a KÉZI döntést igénylők

-- A2. Fallback-forrás #1 — a gyülekezet saját felhasználó(i) profil-skalárja.
--     (Csak tájékoztató; a B) szakasz B2 lépése ezt automatikusan felhasználja,
--     de CSAK akkor, ha egyértelmű.)
SELECT c.id,
       c.name,
       count(DISTINCT p.diocese_id)                       AS kulonbozo_megyek,
       min(d.name)                                        AS megye_ha_egyertelmu,
       array_agg(DISTINCT p.email ORDER BY p.email)        AS felhasznalok
FROM public.congregations c
JOIN public.profiles  p ON p.congregation_id = c.id AND p.diocese_id IS NOT NULL
LEFT JOIN public.dioceses d ON d.id = p.diocese_id
WHERE c.diocese_id IS NULL
GROUP BY c.id, c.name
ORDER BY c.name;

-- A3. Fallback-forrás #2 — amit a REGISZTRÁCIÓKOR választottak.
--     (Nem automatizáljuk: a hozzáférés-kérelem elutasított is lehetett.)
SELECT c.id,
       c.name,
       ar.email,
       ar.status                    AS kerelem_statusz,
       ar.requested_diocese_id,
       d.name                       AS kert_megye
FROM public.congregations c
JOIN public.access_requests ar ON ar.requested_congregation_id = c.id
LEFT JOIN public.dioceses d ON d.id = ar.requested_diocese_id
WHERE c.diocese_id IS NULL
ORDER BY c.name, ar.created_at DESC;

-- A4. KÉTSÉGES DUPLIKÁTUMOK — ugyanaz a név két sorban (a 2026-06-04-es seed
--     őre `nev_hu = … AND diocese_id = d.id`, ami NULL diocese_id mellett SOHA
--     nem igaz → a seed újrafuttatása DUPLIKÁLT, nem javított).
--     ⚠️ Összevonás ELŐTT nézd meg, MELYIK id-n vannak a valódi szemely/befizetes sorok!
SELECT lower(btrim(COALESCE(NULLIF(btrim(nev_hu), ''), name))) AS nev,
       count(*)                                   AS db,
       array_agg(id ORDER BY created_at)          AS ids,
       array_agg(diocese_id ORDER BY created_at)  AS diocese_ids
FROM public.congregations
GROUP BY 1
HAVING count(*) > 1
ORDER BY 1;

-- A5. KÉTÉRTELMŰ szöveges nevek — ugyanaz a szöveg TÖBB egyházmegyére illik.
--     ⚠️ Ha ez a lista NEM üres, a B1 ezeket szándékosan kihagyja (kézi döntés).
SELECT lower(btrim(c.egyhazmegye)) AS szoveg,
       count(DISTINCT d.id)        AS talalatok,
       array_agg(DISTINCT d.name)  AS lehetseges_megyek
FROM public.congregations c
JOIN public.dioceses d ON lower(btrim(d.name)) = lower(btrim(c.egyhazmegye))
WHERE c.diocese_id IS NULL
GROUP BY 1
HAVING count(DISTINCT d.id) > 1;

-- A6. Széthúzás: NEM árva gyülekezetek, ahol a legacy SZÖVEG mást mond, mint a
--     valódi kötés. Az éves jelentés a SZÖVEGET részesíti előnyben
--     (lib/annual-report/generator.ts) → a hivatalos nyomtatványon rossz
--     egyházmegye szerepelhet. A B3 ezt szinkronizálja.
SELECT c.id, c.name, c.egyhazmegye AS szoveges, d.name AS valodi
FROM public.congregations c
JOIN public.dioceses d ON d.id = c.diocese_id
WHERE c.egyhazmegye IS DISTINCT FROM d.name
ORDER BY c.name;


-- ════════════════════════════════════════════════════════════════════════════
-- B) JAVÍTÁS — idempotens. Csak az A) átnézése UTÁN futtasd!
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- B1. SZÖVEG → uuid. CSAK ott, ahol a legacy `egyhazmegye` szöveg PONTOSAN
--     (kisbetűsítve + trimmelve) EGYETLEN egyházmegye nevére illik.
--     A kétértelmű (A5) és a nem illeszkedő sorok érintetlenül maradnak.
UPDATE public.congregations c
SET diocese_id = d.id
FROM public.dioceses d
WHERE c.diocese_id IS NULL
  AND c.egyhazmegye IS NOT NULL
  AND btrim(c.egyhazmegye) <> ''
  AND lower(btrim(d.name)) = lower(btrim(c.egyhazmegye))
  AND (
        SELECT count(*) FROM public.dioceses d2
        WHERE lower(btrim(d2.name)) = lower(btrim(c.egyhazmegye))
      ) = 1;

-- B2. A még mindig árva sorok: a gyülekezet FELHASZNÁLÓINAK profil-skalárja,
--     de CSAK ha egyértelmű (minden felhasználó ugyanazt az egyházmegyét viseli).
--     Ez az az adat, amit a lelkész a regisztrációkor ténylegesen kiválasztott.
UPDATE public.congregations c
SET diocese_id = sub.diocese_id
FROM (
  -- 2026-08-10 (hibajavítás): a PostgreSQL-ben NINCS min(uuid) — a HAVING
  -- amúgy is garantálja, hogy pontosan EGY érték van, ezért a szöveges
  -- aggregálás és visszaalakítás a legegyszerűbb, típushelyes megoldás.
  SELECT p.congregation_id, min(p.diocese_id::text)::uuid AS diocese_id
  FROM public.profiles p
  WHERE p.congregation_id IS NOT NULL
    AND p.diocese_id IS NOT NULL
  GROUP BY p.congregation_id
  HAVING count(DISTINCT p.diocese_id) = 1
) sub
WHERE c.id = sub.congregation_id
  AND c.diocese_id IS NULL;

-- B3. A legacy SZÖVEGES oszlopok szinkronja a valódi kötéshez (minden sorra,
--     nem csak a most javítottakra) — így az éves jelentés nyomtatványán sem
--     maradhat a régi, seed-elt egyházmegye-név.
UPDATE public.congregations c
SET egyhazmegye = d.name,
    district    = COALESCE(di.name, c.district)
FROM public.dioceses d
LEFT JOIN public.districts di ON di.id = d.district_id
WHERE c.diocese_id = d.id
  AND (
        c.egyhazmegye IS DISTINCT FROM d.name
     OR c.district    IS DISTINCT FROM COALESCE(di.name, c.district)
      );

-- B4. A MÁR BEKÜLDÖTT iratok egyházmegye-mezőjének utólagos kitöltése — enélkül
--     az esperesi felület továbbra sem látná őket.
UPDATE public.document_submissions ds
SET diocese_id = c.diocese_id
FROM public.congregations c
WHERE c.id = ds.congregation_id
  AND c.diocese_id IS NOT NULL
  AND ds.diocese_id IS DISTINCT FROM c.diocese_id;

-- B5. A gyülekezet felhasználóinak `profiles.diocese_id` / `district_id`
--     skalárja — a fail-closed hatókör (lib/auth/level-scope.ts) ebből dolgozik.
--     ⚠️ A `status` mezőhöz NEM nyúlunk: függőben lévő hozzáférést ez a
--     javítás SOHA nem hagy jóvá.
UPDATE public.profiles p
SET diocese_id  = d.id,
    district_id = COALESCE(d.district_id, p.district_id)
FROM public.congregations c
JOIN public.dioceses d ON d.id = c.diocese_id
WHERE p.congregation_id = c.id
  AND (
        p.diocese_id IS NULL
     OR p.diocese_id IS DISTINCT FROM d.id
     OR p.district_id IS DISTINCT FROM COALESCE(d.district_id, p.district_id)
      );

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- C) UTÓELLENŐRZÉS
-- ════════════════════════════════════════════════════════════════════════════

-- C1. Maradt-e árva? (0 a cél. Ami maradt, azt KÉZZEL kell eldönteni — legegyszerűbb
--     a /admin/gyulekezetek „Egyházmegye hozzárendelése" gombjával.)
SELECT count(*) AS meg_mindig_arva FROM public.congregations WHERE diocese_id IS NULL;

-- C2. A még árva sorok NÉVVEL (ezeket kell kézzel rendezni).
SELECT c.id, c.name, c.nev_hu, c.egyhazmegye AS szoveges_megye
FROM public.congregations c
WHERE c.diocese_id IS NULL
ORDER BY c.name;

-- C3. Lógó (nem létező egyházmegyére mutató) kötés — 0 a helyes.
SELECT count(*) AS logo_diocese_id
FROM public.congregations c
LEFT JOIN public.dioceses d ON d.id = c.diocese_id
WHERE c.diocese_id IS NOT NULL AND d.id IS NULL;

-- C4. Szöveg ⇄ valódi kötés széthúzás — 0 a helyes (a B3 után).
SELECT count(*) AS szoveg_es_kotes_elter
FROM public.congregations c
JOIN public.dioceses d ON d.id = c.diocese_id
WHERE c.egyhazmegye IS DISTINCT FROM d.name;

-- C5. Olyan felhasználó, akinek a gyülekezete kötött, de a saját skalárja eltér — 0 a helyes.
SELECT count(*) AS profil_skalar_elter
FROM public.profiles p
JOIN public.congregations c ON c.id = p.congregation_id
JOIN public.dioceses d ON d.id = c.diocese_id
WHERE p.diocese_id IS DISTINCT FROM d.id;

-- C6. Beküldött iratok egyházmegye nélkül, pedig a gyülekezet már kötött — 0 a helyes.
SELECT count(*) AS irat_megye_nelkul
FROM public.document_submissions ds
JOIN public.congregations c ON c.id = ds.congregation_id
WHERE c.diocese_id IS NOT NULL AND ds.diocese_id IS DISTINCT FROM c.diocese_id;


-- ════════════════════════════════════════════════════════════════════════════
-- D) VÉDELEM (OPCIONÁLIS, de ajánlott) — DB-szinten tiltja a kötés kinullázását
-- ════════════════════════════════════════════════════════════════════════════
-- A kód már nem ír NULL-t, de a `congregations_update` RLS-policy szerint a
-- lelkész a SAJÁT sorának MINDEN oszlopát írhatja — egy régi, gyorsítótárazott
-- kliens vagy egy kézi SQL még mindig kinullázhatná. Ez a trigger a maradék
-- rést zárja: meglévő kötést NEM lehet törölni, csak MÁSIKRA cserélni.
--
-- Futtasd CSAK akkor, ha a C1 már 0-t (vagy elfogadható maradékot) mutat.

BEGIN;

CREATE OR REPLACE FUNCTION public.congregations_protect_diocese()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.diocese_id IS NOT NULL AND NEW.diocese_id IS NULL THEN
    RAISE EXCEPTION 'A gyülekezet egyházmegyéje nem törölhető (congregations.diocese_id).'
      USING HINT = 'Törlés helyett válasszon másik egyházmegyét.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.congregations_protect_diocese() IS
  $$2026-08-10: megakadályozza, hogy egy meglévő congregations.diocese_id NULL-ra íródjon. Az árva gyülekezet minden egyházmegyei/kerületi felületről eltűnik, és a felületről javíthatatlan.$$;

DROP TRIGGER IF EXISTS congregations_protect_diocese ON public.congregations;
CREATE TRIGGER congregations_protect_diocese
  BEFORE UPDATE ON public.congregations
  FOR EACH ROW
  EXECUTE FUNCTION public.congregations_protect_diocese();

COMMIT;

-- D1. Ellenőrzés: létrejött-e a trigger?
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.congregations'::regclass
  AND NOT tgisinternal;
