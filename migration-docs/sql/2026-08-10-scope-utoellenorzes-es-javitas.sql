-- KARTOTEKA — Scope utóellenőrzés + két javítás (2026-08-10)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- ELŐZMÉNY: a 2026-08-09-es scope-diagnosztika és RLS-javítás lefutott
-- (mind a 15 új policy a helyén). A visszaküldött eredményekben KÉT dolog
-- tűnt fel, ez a fájl ezeket ellenőrzi és javítja:
--
--   A) A `bealitas` táblán ott van egy „Teljes hozzaferes bealitas" nevű,
--      cmd=ALL policy, amely EGYETLEN migrációs fájlban sem szerepel — tehát
--      kézzel, a fejlesztés korai szakaszában készült. Ha a feltétele
--      `true` (nyitott), akkor BÁRMELY bejelentkezett felhasználó olvashatja
--      és ÍRHATJA az ÖSSZES gyülekezet beállításait (éves járulék, zárás- és
--      feloldás-jelzők) — és ilyenkor a tegnapi, gondosan szűkített
--      bealitas_select_diocese / _update_diocese policy-knak sincs értelmük
--      (a PERMISSIVE policy-k VAGY-kapcsolatban állnak!).
--
--   B) A hierarchia-összesítő szerint a „Teszt Egyházmegye"-hez 0 gyülekezet
--      tartozik — pedig a Teszt gyülekezetbe tegnap 48 fiktív tagot töltöttünk.
--      Ez azt jelenti, hogy a Teszt gyülekezet `diocese_id`-ja NEM a Teszt
--      Egyházmegyére mutat (a 2026-07-01-es seed `ON CONFLICT DO NOTHING`-gal
--      készült, így egy korábban létrehozott sort NEM írt felül). Következmény
--      az új, fail-closed hatókör-logikával: a Teszt gyülekezet EGYETLEN
--      egyházmegyei/kerületi felületen sem jelenik meg, és a beküldött
--      dokumentumai sem — a lelkészi tesztelés így féloldalas lenne.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. SZAKASZ — ELLENŐRZÉS (csak olvas). Futtasd ELŐSZÖR, és nézd meg!
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. A gyanús legacy policy-k TELJES definíciója (nem csak a bealitas —
--     minden „Teljes hozzaferes"/„Enable"/„Allow" nevű, gyanúsan nyitott sor).
--     ⚠️ Amelyik sornál a qual = 'true' (vagy üres) ÉS a roles között ott az
--     `authenticated`: az NYITOTT — minden bejelentkezett user hozzáfér.
SELECT tablename,
       policyname,
       cmd,
       roles::text,
       COALESCE(qual, '(nincs USING)')        AS using_feltetel,
       COALESCE(with_check, '(nincs CHECK)')  AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND (
        qual IS NULL
        OR btrim(lower(qual)) IN ('true', '(true)')
        OR policyname ILIKE 'Teljes hozzaf%'
        OR policyname ILIKE 'Enable %'
        OR policyname ILIKE 'Allow %'
      )
ORDER BY tablename, policyname;

-- 1b. A Teszt gyülekezet valódi hierarchia-kötése.
--     Várt HELYES állapot: diocese_id = 7e570000-0000-4000-8000-000000000002
--     és a megye kerülete = Teszt Egyházkerület.
SELECT c.id,
       c.name,
       c.diocese_id,
       d.name  AS megye_neve,
       di.name AS kerulet_neve,
       c.egyhazmegye AS szoveges_megye_mezo,
       c.district    AS szoveges_kerulet_mezo
FROM public.congregations c
LEFT JOIN public.dioceses  d  ON d.id = c.diocese_id
LEFT JOIN public.districts di ON di.id = d.district_id
WHERE c.id = '7e570000-0000-4000-8000-000000000003';

-- 1c. MINDEN gyülekezet, amelynek nincs megyéje (ezek az új, fail-closed
--     logikával SEHOL nem jelennek meg egyházmegyei/kerületi szinten).
SELECT id, name, nev_hu, egyhazmegye AS szoveges_megye, status
FROM public.congregations
WHERE diocese_id IS NULL
ORDER BY name;

-- 1d. Minden egyházmegye, amelynek nincs kerülete (a kerületi felületen
--     ezek gyülekezetei hiányoznának).
SELECT id, name, district_id
FROM public.dioceses
WHERE district_id IS NULL
ORDER BY name;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. SZAKASZ — JAVÍTÁS „A": a nyitott legacy bealitas-policy eltávolítása
-- ════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ CSAK AKKOR futtasd, ha az 1a. eredményében a „Teljes hozzaferes bealitas"
-- sor `using_feltetel` oszlopa `true` (vagy üres)! Ha valódi, szűkített
-- feltétel van benne, HAGYD BÉKÉN, és küldd vissza a sort — átnézzük.
--
-- Miért biztonságos a törlés: a bealitas hozzáférést a saját gyülekezethez a
-- `bealitas_access` policy adja (congregation_id = current_user_congregation_id()
-- OR global access), a megyei olvasást/feloldást pedig a tegnap létrehozott
-- bealitas_select_diocese / bealitas_update_diocese — a nyitott policy csak
-- egy korai fejlesztési maradvány.

-- DROP POLICY IF EXISTS "Teljes hozzaferes bealitas" ON public.bealitas;

-- Ellenőrzés a törlés után (a saját gyülekezeted beállításai továbbra is
-- látszaniuk kell az appban — a Pénzügy oldal betöltése a próba):
-- SELECT policyname, cmd, qual FROM pg_policies
-- WHERE schemaname='public' AND tablename='bealitas' ORDER BY policyname;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. SZAKASZ — JAVÍTÁS „B": a Teszt gyülekezet visszakötése a Teszt Egyházmegyéhez
-- ════════════════════════════════════════════════════════════════════════════
--
-- Csak akkor fut le érdemben, ha az 1b. tényleg eltérést mutatott.
-- (Idempotens: ha már jó, 0 sort módosít.)

BEGIN;

-- A megye és a kerület megléte biztosítva (a 2026-07-01-es seedből valók)
INSERT INTO public.districts (id, name)
VALUES ('7e570000-0000-4000-8000-000000000001', 'Teszt Egyházkerület')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.dioceses (id, district_id, name)
VALUES ('7e570000-0000-4000-8000-000000000002',
        '7e570000-0000-4000-8000-000000000001',
        'Teszt Egyházmegye')
ON CONFLICT (id) DO NOTHING;

-- A megye kerület-kötése is rendben legyen
UPDATE public.dioceses
SET district_id = '7e570000-0000-4000-8000-000000000001'
WHERE id = '7e570000-0000-4000-8000-000000000002'
  AND district_id IS DISTINCT FROM '7e570000-0000-4000-8000-000000000001';

-- A Teszt gyülekezet visszakötése (a szöveges mezőket is szinkronban tartjuk)
UPDATE public.congregations
SET diocese_id  = '7e570000-0000-4000-8000-000000000002',
    egyhazmegye = 'Teszt Egyházmegye',
    district    = 'Teszt Egyházkerület'
WHERE id = '7e570000-0000-4000-8000-000000000003'
  AND diocese_id IS DISTINCT FROM '7e570000-0000-4000-8000-000000000002';

-- A már beküldött teszt-dokumentumok megye-mezője is kövesse a gyülekezetet
UPDATE public.document_submissions ds
SET diocese_id = c.diocese_id
FROM public.congregations c
WHERE c.id = ds.congregation_id
  AND c.id = '7e570000-0000-4000-8000-000000000003'
  AND ds.diocese_id IS DISTINCT FROM c.diocese_id;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS a 3. szakasz után ===
-- ════════════════════════════════════════════════════════════════════════════

-- Várt: 1 sor, „Teszt Egyházmegye" / „Teszt Egyházkerület" nevekkel.
SELECT c.name AS gyulekezet, d.name AS megye, di.name AS kerulet
FROM public.congregations c
JOIN public.dioceses  d  ON d.id = c.diocese_id
JOIN public.districts di ON di.id = d.district_id
WHERE c.id = '7e570000-0000-4000-8000-000000000003';

-- Várt: „Teszt Egyházmegye" sorában már 1 gyülekezet.
SELECT COALESCE(di.name, '(kerulet nelkul)') AS kerulet,
       COALESCE(d.name,  '(megye nelkul)')   AS megye,
       COUNT(c.id) AS gyulekezet_db
FROM public.dioceses d
LEFT JOIN public.districts di ON di.id = d.district_id
LEFT JOIN public.congregations c ON c.diocese_id = d.id
WHERE d.id = '7e570000-0000-4000-8000-000000000002'
GROUP BY 1, 2;
