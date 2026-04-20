-- ═══════════════════════════════════════════════════════════════════════════
-- MISSZIÓS MŰHELY RLS BIZTONSÁGI JAVÍTÁS — PART 2
-- Dátum: 2026-04-15
-- Hivatkozott audit: docs/project-tracking/KARTOTEKA-rendszerdiagnosztika-2026-04-12.md (K1)
-- Projekt log: docs/project-tracking/KARTOTEKA-project-log.md (019. lépés)
--
-- PROBLÉMA (a Part 1 verifikációja után derült ki):
-- A pg_policies vizsgálatkor kiderült, hogy a 7 fő mm_* táblán PÁRHUZAMOS
-- policy-set létezik:
--   1) Új, szigorú, tisztán elnevezett policy-k (_read_all, _insert_own,
--      _update_own, _delete_own, _insert_self, _delete_self, _update_self)
--   2) Régi, rövid nevű policy-k (_select, _insert, _update, _delete) —
--      ezek nincsenek a verziókövetett SQL fájlokban, valaki kézzel hozta
--      létre őket a Supabase Studio-ban
--
-- KRITIKUS HIBA:
-- A régi policy-k OR-rel kombinálódnak az újakkal, és NÉHÁNY ESETBEN ENYHÍTIK
-- a szabályokat. A LEGSÚLYOSABB:
--
--   mm_stat_update USING:
--     ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())))
--
-- Az EXISTS rész minden authenticated user-re true! → BÁRKI módosíthatja
-- BÁRMELYIK user statisztikáját (osszpontszam, szint mezők).
--
-- További problémák:
--   - mm_*_select: USING (EXISTS profiles) → mindenki lát aktiv=false sorokat is
--   - mm_*_insert: nem ellenőrzi current_user_is_active_staff() → deaktivált
--     userek is írhatnak
--   - mm_otletek_update/_delete régi: szerepkör-alapú admin check (admin/superadmin)
--     duplikálja az új current_user_has_global_access() ellenőrzést
--
-- MEGOLDÁS:
-- Eltávolítjuk az ÖSSZES régi rövid nevű policy-t. Csak az új, tisztán
-- nevesített policy-k maradnak (_read_all, _insert_own, _update_own,
-- _delete_own, _insert_self, _delete_self, _update_self), amik a
-- 2026-04-12-missziós-muhely-rls.sql és 2026-04-15-mm-rls-fix.sql migrációk
-- termékei.
--
-- A mm_szavazatok_read_all USING (true) szándékosan megmarad — a szavazatok
-- nyilvánosak (közösségi tér, ki kit szavazott látható).
--
-- IDEMPOTENS: DROP POLICY IF EXISTS használata mindenhol.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. RÉSZ — mm_felhasznalo_statisztika KRITIKUS javítás
-- A mm_stat_insert és mm_stat_update policy-k LEHETŐVÉ TESZIK más usernek
-- a statisztika módosítását. Ezeket azonnal töröljük.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_stat_select ON public.mm_felhasznalo_statisztika;
DROP POLICY IF EXISTS mm_stat_insert ON public.mm_felhasznalo_statisztika;
DROP POLICY IF EXISTS mm_stat_update ON public.mm_felhasznalo_statisztika;

-- Ezek után csak ezek maradnak SELECT-re:
--   - mm_stats_read_self_or_admin (saját + global access)
--   - mm_stats_read_leaderboard (mindenki, ranglistához)
-- INSERT/UPDATE/DELETE: NINCS — csak service_role írhat (server actionökön
-- keresztül, amik a security definer pattern-t használják).

-- ─────────────────────────────────────────────────────────────────────────
-- 2. RÉSZ — mm_otletek régi policy-k törlése
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_otletek_select ON public.mm_otletek;
DROP POLICY IF EXISTS mm_otletek_insert ON public.mm_otletek;
DROP POLICY IF EXISTS mm_otletek_update ON public.mm_otletek;
DROP POLICY IF EXISTS mm_otletek_delete ON public.mm_otletek;

-- Maradnak (az új policy-k): mm_otletek_read_all, mm_otletek_insert_own,
-- mm_otletek_update_own, mm_otletek_delete_own.

-- ─────────────────────────────────────────────────────────────────────────
-- 3. RÉSZ — mm_segedanyagok régi policy-k törlése
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_segedanyagok_select ON public.mm_segedanyagok;
DROP POLICY IF EXISTS mm_segedanyagok_insert ON public.mm_segedanyagok;
DROP POLICY IF EXISTS mm_segedanyagok_update ON public.mm_segedanyagok;
DROP POLICY IF EXISTS mm_segedanyagok_delete ON public.mm_segedanyagok;

-- Maradnak: mm_segedanyagok_read_all, mm_segedanyagok_insert_own,
-- mm_segedanyagok_update_own, mm_segedanyagok_delete_own.

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RÉSZ — mm_hozzaszolasok régi policy-k törlése
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_hozzaszolasok_select ON public.mm_hozzaszolasok;
DROP POLICY IF EXISTS mm_hozzaszolasok_insert ON public.mm_hozzaszolasok;
DROP POLICY IF EXISTS mm_hozzaszolasok_delete ON public.mm_hozzaszolasok;

-- Maradnak: mm_hozzaszolasok_read_all, mm_hozzaszolasok_insert_self,
-- mm_hozzaszolasok_update_self, mm_hozzaszolasok_delete_self.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. RÉSZ — mm_szavazatok régi policy-k törlése
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mm_szavazatok_select ON public.mm_szavazatok;
DROP POLICY IF EXISTS mm_szavazatok_insert ON public.mm_szavazatok;
DROP POLICY IF EXISTS mm_szavazatok_delete ON public.mm_szavazatok;

-- Maradnak: mm_szavazatok_read_all, mm_szavazatok_insert_self,
-- mm_szavazatok_delete_self.

-- ─────────────────────────────────────────────────────────────────────────
-- 6. RÉSZ — Egyéb mm_* táblák régi policy-i (preventív takarítás)
-- Ha a többi táblán is hasonló párhuzamos set létezik, ezt is takarítjuk.
-- ─────────────────────────────────────────────────────────────────────────

-- mm_segedanyag_ertekelesek
DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_select ON public.mm_segedanyag_ertekelesek;
DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_insert ON public.mm_segedanyag_ertekelesek;
DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_update ON public.mm_segedanyag_ertekelesek;
DROP POLICY IF EXISTS mm_segedanyag_ertekelesek_delete ON public.mm_segedanyag_ertekelesek;

-- mm_segedanyag_kategoriak
DROP POLICY IF EXISTS mm_segedanyag_kategoriak_select ON public.mm_segedanyag_kategoriak;
DROP POLICY IF EXISTS mm_segedanyag_kategoriak_insert ON public.mm_segedanyag_kategoriak;
DROP POLICY IF EXISTS mm_segedanyag_kategoriak_update ON public.mm_segedanyag_kategoriak;
DROP POLICY IF EXISTS mm_segedanyag_kategoriak_delete ON public.mm_segedanyag_kategoriak;

-- mm_otlet_kategoriak
DROP POLICY IF EXISTS mm_otlet_kategoriak_select ON public.mm_otlet_kategoriak;
DROP POLICY IF EXISTS mm_otlet_kategoriak_insert ON public.mm_otlet_kategoriak;
DROP POLICY IF EXISTS mm_otlet_kategoriak_update ON public.mm_otlet_kategoriak;
DROP POLICY IF EXISTS mm_otlet_kategoriak_delete ON public.mm_otlet_kategoriak;

-- mm_kategoriak
DROP POLICY IF EXISTS mm_kategoriak_select ON public.mm_kategoriak;

-- mm_jelveny_tipusok
DROP POLICY IF EXISTS mm_jelveny_tipusok_select ON public.mm_jelveny_tipusok;

-- mm_felhasznalo_jelveny
DROP POLICY IF EXISTS mm_felhasznalo_jelveny_select ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_felhasznalo_jelveny_insert ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_felhasznalo_jelveny_update ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_felhasznalo_jelveny_delete ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_jelveny_select ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_jelveny_insert ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_jelveny_update ON public.mm_felhasznalo_jelveny;
DROP POLICY IF EXISTS mm_jelveny_delete ON public.mm_felhasznalo_jelveny;

-- mm_feladatok, mm_merfoldkovek, mm_dokumentumok, mm_otlet_cimkek (D1 előkészítés)
-- Ezek a Part 1-ben kaptak új policy-kat. Régi policy-k, ha véletlenül létrejöttek:
DROP POLICY IF EXISTS mm_feladatok_select ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_feladatok_insert ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_feladatok_update ON public.mm_feladatok;
DROP POLICY IF EXISTS mm_feladatok_delete ON public.mm_feladatok;

DROP POLICY IF EXISTS mm_merfoldkovek_select ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_merfoldkovek_insert ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_merfoldkovek_update ON public.mm_merfoldkovek;
DROP POLICY IF EXISTS mm_merfoldkovek_delete ON public.mm_merfoldkovek;

DROP POLICY IF EXISTS mm_dokumentumok_select ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_dokumentumok_insert ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_dokumentumok_update ON public.mm_dokumentumok;
DROP POLICY IF EXISTS mm_dokumentumok_delete ON public.mm_dokumentumok;

DROP POLICY IF EXISTS mm_otlet_cimkek_select ON public.mm_otlet_cimkek;
DROP POLICY IF EXISTS mm_otlet_cimkek_insert ON public.mm_otlet_cimkek;
DROP POLICY IF EXISTS mm_otlet_cimkek_update ON public.mm_otlet_cimkek;
DROP POLICY IF EXISTS mm_otlet_cimkek_delete ON public.mm_otlet_cimkek;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. RÉSZ — Verifikáció (futtasd kézzel a migráció után)
-- ─────────────────────────────────────────────────────────────────────────

-- 7a. Kritikus: mm_felhasznalo_statisztika-n nincs INSERT/UPDATE/DELETE policy?
-- Várt eredmény: csak SELECT cmd-jű policy-k jelennek meg
--
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'mm_felhasznalo_statisztika'
--   ORDER BY cmd, policyname;
--
-- ELVÁRT KIMENET (3 sor, mind SELECT):
--   mm_stats_read_leaderboard      | SELECT
--   mm_stats_read_self_or_admin    | SELECT
--   (esetleg mm_jelveny_read_all sem itt — az másik tábla)

-- 7b. mm_otletek-en csak az új 4 policy van?
-- Várt eredmény: 4 sor (read_all, insert_own, update_own, delete_own)
--
--   SELECT policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'mm_otletek'
--   ORDER BY cmd, policyname;

-- 7c. Általános: az ÖSSZES mm_* policy listája
-- Ezzel látható, mi maradt aktívban
--
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename LIKE 'mm_%'
--   ORDER BY tablename, cmd, policyname;

-- 7d. Funkcionális teszt — nem-master user-rel a kliens-oldalon
-- Az alábbinak HIBÁRA kell futnia:
--
--   UPDATE public.mm_felhasznalo_statisztika
--     SET osszpontszam = 999999, szint = 'Missziói bajnok'
--     WHERE user_id = auth.uid();
--   -- → ERROR: new row violates row-level security policy
--   --   (mert NINCS UPDATE policy ezen a táblán)
--
--   INSERT INTO public.mm_felhasznalo_statisztika (user_id, osszpontszam)
--     VALUES (auth.uid(), 999999);
--   -- → ERROR: new row violates row-level security policy
--
--   UPDATE public.mm_otletek
--     SET cim = 'eltérített'
--     WHERE otletgazda_id <> auth.uid();
--   -- → 0 rows affected (a USING szűrő miatt nem látszik)

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉGE — A K1 biztonsági rés ezzel zárva.
-- ═══════════════════════════════════════════════════════════════════════════
