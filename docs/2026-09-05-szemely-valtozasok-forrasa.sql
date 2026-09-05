-- ═══════════════════════════════════════════════════════════════════════════
--  HONNAN JÖTT AZ 54 SZEMELY-SORVÁLTOZÁS, HA TAGESEMÉNY EGY SEM NAPLÓZÓDOTT?
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor) — CSAK OLVAS
--
--  ELŐZMÉNY (audit-naplo-elo-proba eredménye):
--    · audit_log: 3 esemény 24 órában, de tagnyilvántartási (target_table=szemely)
--      EGY SEM, és a javított úton írt (metadata.target_ref) sor is 0.
--    · audit.record_version: 54 szemely-sorváltozás ugyanebben a 24 órában.
--
--  KÉT MAGYARÁZAT LEHETSÉGES, és ez a lekérdezés választ közöttük:
--    (a) A 54 változás NEM tagűrlapból jött, hanem tömeges háttér-írásból
--        (választói újraszámítás: csak voter_eligible/updated_at/revision
--        változik; desktop-szinkron; kereszt-egyeztető trigger) — ilyenkor az
--        alkalmazás-szintű napló joggal üres, és a javítás még TESZTELETLEN.
--    (b) Tagűrlapos mentés/megjegyzés-módosítás történt (csaladnev, megjegyzes,
--        telefon… változott), és mégsem keletkezett member.* sor — akkor a
--        2026-09-05-i javítás NEM MŰKÖDIK élesben (vagy nem az a kód fut).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '1 · a 3 audit_log esemény (24 óra): action / target_table' AS kulcs,
       COALESCE((SELECT string_agg(action || ' / ' || COALESCE(target_table, '-') || ': ' || db, ' | ' ORDER BY action)
                 FROM (SELECT action, target_table, count(*)::text AS db
                       FROM public.audit_log
                       WHERE created_at > now() - interval '24 hours'
                       GROUP BY action, target_table) x), '—') AS ertek

UNION ALL
SELECT '2 · szemely-sorváltozások művelet szerint (24 óra)',
       COALESCE((SELECT string_agg(op || ': ' || db, ' | ')
                 FROM (SELECT op, count(*)::text AS db
                       FROM audit.record_version
                       WHERE table_name = 'szemely' AND ts > now() - interval '24 hours'
                       GROUP BY op) x), '—')

UNION ALL
-- EZ A DÖNTŐ RÁCS: mely oszlopok változtak ténylegesen az UPDATE-ekben.
-- Ha csak voter_eligible / updated_at / revision → (a) háttér-újraszámítás.
-- Ha megjegyzes / csaladnev / telefon / c_szam stb. → (b) tagűrlap, napló nélkül.
SELECT '3 · ⭐ MELY OSZLOPOK változtak az UPDATE-ekben (oszlop: db)',
       COALESCE((SELECT string_agg(k || ': ' || n, ' | ' ORDER BY n DESC, k)
                 FROM (SELECT d.key AS k, count(*) AS n
                       FROM audit.record_version r
                       CROSS JOIN LATERAL jsonb_each(COALESCE(r.new_record, '{}'::jsonb)) d
                       WHERE r.table_name = 'szemely'
                         AND r.ts > now() - interval '24 hours'
                         AND r.op = 'UPDATE'
                         AND (r.old_record -> d.key) IS DISTINCT FROM d.value
                       GROUP BY d.key) s), '—')

UNION ALL
SELECT '4 · ki írta (actor → e-mail, db)',
       COALESCE((SELECT string_agg(COALESCE(p.email, r.actor_id::text, 'ismeretlen (trigger/RPC)') || ': ' || r.n, ' | ' ORDER BY r.n DESC)
                 FROM (SELECT actor_id, count(*) AS n
                       FROM audit.record_version
                       WHERE table_name = 'szemely' AND ts > now() - interval '24 hours'
                       GROUP BY actor_id) r
                 LEFT JOIN public.profiles p ON p.id = r.actor_id), '—')

UNION ALL
SELECT '5 · időbeli eloszlás (óra: db) — egy csomóban vagy szétszórva?',
       COALESCE((SELECT string_agg(h || ':00 → ' || n, ' | ' ORDER BY h)
                 FROM (SELECT to_char(ts, 'MM-DD HH24') AS h, count(*) AS n
                       FROM audit.record_version
                       WHERE table_name = 'szemely' AND ts > now() - interval '24 hours'
                       GROUP BY 1) x), '—')

UNION ALL
SELECT '6 · hány KÜLÖNBÖZŐ személyt érintett',
       (SELECT count(DISTINCT record_id)::text
        FROM audit.record_version
        WHERE table_name = 'szemely' AND ts > now() - interval '24 hours')

ORDER BY 1;
