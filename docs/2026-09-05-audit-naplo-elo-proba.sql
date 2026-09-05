-- ═══════════════════════════════════════════════════════════════════════════
--  ÍR-E MÁR A TAGNYILVÁNTARTÁSI AUDIT-NAPLÓ? — élő próba
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor)
--
--  ELŐZMÉNY: az előző mérés 8. rácsa 0 tagnyilvántartási audit-sort adott az
--  elmúlt 7 napra. Ez KÉTFÉLÉT jelenthet, és a kettő között MÉRNI kell:
--
--    (a) VÁRHATÓ: a javítás csak ma került élesbe, a megelőző 7 napban pedig
--        a RÉGI, hibás kód futott (az egész számos azonosítót UUID-oszlopba
--        próbálta írni → 22P02, elnyelve). Ha azóta nem történt tagművelet,
--        akkor nincs is mit naplózni.
--    (b) BAJ: a javítás nem működik.
--
--  ⚠️ EZ AZ SQL EGYEDÜL NEM DÖNTI EL. Előbb csinálj EGY tagműveletet — a
--     legegyszerűbb és teljesen ártalmatlan:
--
--         Tagnyilvántartás → nyiss meg egy tagot → a Megjegyzés mezőbe írj
--         valamit (akár egy pontot) → Mentés. Aztán vedd ki és mentsd újra.
--
--     Ez `member.note_update` eseményt ad. UTÁNA futtasd ezt az SQL-t.
--
--  ⚠️ AMIRE NE VÁRJ: a `member.cnp_megtekintve` esemény mostantól szinte soha
--     nem keletkezik — és ez HELYES. Az élő adatban mind a 661 azonosító
--     rendszer által generált, tehát a felület CSUPASZON mutatja őket (nincs
--     mit rejteni), így a szem-ikon meg sem jelenik. Naplózni a HIVATALOS
--     személyi szám felfedését kell — az `member.szemelyi_szam_megtekintve`.
--
--  ⚠️ CSAK OLVAS.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '1 · MŰKÖDIK-E EGYÁLTALÁN a naplózás (bármilyen esemény, 24 óra)' AS kulcs,
       count(*)::text AS ertek
FROM public.audit_log
WHERE created_at > now() - interval '24 hours'

UNION ALL
SELECT '2 · a LEGUTÓBBI naplósor időpontja',
       COALESCE((SELECT to_char(max(created_at), 'YYYY-MM-DD HH24:MI')
                 FROM public.audit_log), 'ÜRES a napló')

UNION ALL
-- EZ A DÖNTŐ RÁCS. A javítás az egész számos azonosítót a metaadatba teszi
-- `target_ref` néven (a `target_id` oszlop UUID, oda nem fér be). Ha itt
-- bármi > 0, a javítás BIZONYÍTOTTAN ír.
SELECT '3 · ⭐ a JAVÍTOTT úton írt sorok (metadata.target_ref van)',
       (SELECT count(*)::text FROM public.audit_log
        WHERE metadata ? 'target_ref')

UNION ALL
SELECT '4 · tagnyilvántartási események, 24 óra (esemény szerint)',
       COALESCE((SELECT string_agg(action || ': ' || db, ' | ' ORDER BY action)
                 FROM (SELECT action, count(*)::text AS db
                       FROM public.audit_log
                       WHERE target_table = 'szemely'
                         AND created_at > now() - interval '24 hours'
                       GROUP BY action) x), '— egy sem')

UNION ALL
SELECT '5 · a hivatalos személyi szám eseményei (bármikor)',
       COALESCE((SELECT string_agg(action || ': ' || db, ' | ' ORDER BY action)
                 FROM (SELECT action, count(*)::text AS db
                       FROM public.audit_log
                       WHERE action LIKE 'member.szemelyi_szam%'
                       GROUP BY action) x), '— egy sem (még nem használtad a mezőt)')

UNION ALL
-- Kontroll: a SOR-SZINTŰ audit (audit_trg) MÁS táblába ír, mint az
-- alkalmazás-szintű `audit_log`. Ez azt mutatja, az adatbázis-oldali
-- nyomvonal külön él és működik.
SELECT '6 · sor-szintű audit a szemely táblán (audit.record_version, 24 óra)',
       (SELECT count(*)::text FROM audit.record_version
        WHERE table_name = 'szemely'
          AND ts > now() - interval '24 hours')

ORDER BY 1;
