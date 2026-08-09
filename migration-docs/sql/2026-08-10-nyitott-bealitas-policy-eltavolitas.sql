-- KARTOTEKA — A nyitott „Teljes hozzaferes bealitas" policy eltávolítása (2026-08-10)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- MIÉRT: a `bealitas` táblán van egy `Teljes hozzaferes bealitas` nevű,
-- cmd=ALL policy, amely EGYETLEN migrációs fájlban sem szerepel — kézzel
-- készült a fejlesztés korai szakaszában. Amíg létezik, minden bejelentkezett
-- felhasználó hozzáférhet MINDEN gyülekezet beállításaihoz (éves járulék,
-- zárás- és feloldás-jelzők), és — mivel a PERMISSIVE policy-k VAGY-kapcsolatban
-- állnak — a 2026-08-09-ben létrehozott, gondosan szűkített megyei policy-k
-- (bealitas_select_diocese / bealitas_update_diocese) sem korlátoznak semmit.
--
-- MI MARAD UTÁNA (a hozzáférés NEM sérül):
--   • bealitas_access          — a SAJÁT gyülekezet teljes hozzáférése
--                                (congregation_id = current_user_congregation_id()
--                                 OR current_user_has_global_access())
--   • bealitas_select_diocese  — az egyházmegye OLVASHATJA a gyülekezetei sorait
--   • bealitas_update_diocese  — a megyei feloldás-jóváhagyás írhat
--
-- Idempotens (DROP ... IF EXISTS), és a törlés előtt kiírja, mit töröl.

-- ────────────────────────────────────────────────────────────────────────────
-- 1) MIT TÖRLÜNK? — a policy pontos definíciója (naplózásra érdemes)
-- ────────────────────────────────────────────────────────────────────────────
SELECT tablename,
       policyname,
       cmd,
       roles::text,
       COALESCE(qual, '(nincs USING — azaz KORLÁTLAN olvasás)')            AS using_feltetel,
       COALESCE(with_check, '(nincs WITH CHECK — azaz KORLÁTLAN írás)')    AS with_check_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'bealitas'
  AND policyname = 'Teljes hozzaferes bealitas';
-- ☝️ Mentsd el az eredményt (visszaállításhoz), majd futtasd a 2) szakaszt.

-- ────────────────────────────────────────────────────────────────────────────
-- 2) TÖRLÉS
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY IF EXISTS "Teljes hozzaferes bealitas" ON public.bealitas;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) ELLENŐRZÉS
-- ────────────────────────────────────────────────────────────────────────────

-- 3a. A bealitas policy-listája — a nyitott sor NEM lehet benne.
--     Várt: bealitas_access (ALL), bealitas_select_diocese (SELECT),
--           bealitas_update_diocese (UPDATE).
SELECT policyname, cmd, COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'bealitas'
ORDER BY policyname;

-- 3b. Van-e MÁS táblán is hasonlóan nyitott (USING true / USING nélküli)
--     policy? → érdemes átnézni; ha van találat, küldd vissza a listát.
SELECT tablename, policyname, cmd, roles::text,
       COALESCE(qual, '(nincs USING)') AS using_feltetel
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual IS NULL OR btrim(lower(qual)) IN ('true', '(true)'))
  -- A szándékosan nyilvános referencia-táblák kivételével:
  AND tablename NOT IN ('dioceses', 'districts', 'congregations', 'szamadasicel',
                        'kiadascel', 'befizetescel', 'localities', 'streets',
                        'helysegek', 'utcak')
ORDER BY tablename, policyname;

-- ☝️ A 3b. találatai NEM feltétlenül hibák (pl. publikus tartalom-táblák),
-- de mindegyiket érdemes megnézni: a bejelentkezett felhasználók számára
-- nyitott, gyülekezeti adatot tartalmazó tábla ugyanaz a hibaosztály.

-- ────────────────────────────────────────────────────────────────────────────
-- 4) ALKALMAZÁS-PRÓBA a törlés után (nem SQL — a felületen)
-- ────────────────────────────────────────────────────────────────────────────
-- • Pénzügy oldal betöltése a saját gyülekezettel  → az éves beállítások látszanak
-- • Egyházmegyei felület → Kérelmek fül             → a megye gyülekezeteinek kérelmei
-- • Feloldás jóváhagyása                            → sikeres (nem „0 sor" hiba)
