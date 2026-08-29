-- ════════════════════════════════════════════════════════════════════════════
-- MENTÉS-BESOROLÁS: A 2026-08-29-ÉN LÉTREHOZOTT KÉT ÚJ TÁBLA
-- Futtatja: Endre (Supabase SQL editor). EGYBEN futtatható, IDEMPOTENS.
--
-- MIÉRT: a mentés-rendszer FAIL-CLOSED — amíg akár EGY élő tábla
-- besorolatlan, a napi mentés EL SEM INDUL (ez ma pontosan így történt:
-- „Tábla-besorolás ellenőrzése — ITT HIBÁZOTT (2 tábla)"). A két
-- besorolatlan tábla a ma élesített `bevetel_partner` (befizető-memória)
-- és `penzugy_valtozas_naplo` (pénzügyi változásnapló).
--
-- ⚠️ TANULSÁG (jövőbeli SQL-ekhez): ÚJ TÁBLA = KÖTELEZŐ besorolás
-- ugyanabban a fájlban — különben a következő napi mentés megáll.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Előfeltétel-őr (fail-closed) ────────────────────────────────────────────
DO $guard$
BEGIN
  IF to_regclass('public.backup_table_policy') IS NULL THEN
    RAISE EXCEPTION 'A backup_table_policy tábla nem létezik — előbb a 2026-08-11-biztonsagi-mentes.sql fusson le.';
  END IF;
END
$guard$;

INSERT INTO public.backup_table_policy
  (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES

 ('bevetel_partner','gyulekezet',NULL,4,true,
  '2026-08-29 — Befizető-memória (banki bevételek befizető-választója + Adományozók fül). congregation_id NOT NULL (alap-szűrő); FK: szemely(id) → a szemely R3 után áll vissza, ezért R4. A gyülekezet saját partner-nyilvántartása → gyülekezeti mentésbe.'),

 ('penzugy_valtozas_naplo','gyulekezet',NULL,7,false,
  '2026-08-29 — Pénzügyi változásnapló (P4-26, Endre döntése): a befizetes/kiadas/belsomozgas minden módosítás/törlés előtti sora JSON-ban, a végrehajtóval; 5 éves megőrzés. NINCS FK-ja → R7. visszaallithato=FALSE: audit-napló — egy visszaállítás nem írhatja át a rendszer saját emlékezetét (a séma kifejezetten erre az esetre adja ezt a kapcsolót). Mentjük, hogy a bizonyíték-lánc a mentésben is meglegyen.')

ON CONFLICT (tabla) DO UPDATE SET
  hatokor = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes = EXCLUDED.megjegyzes;

COMMIT;

-- ── ÖNELLENŐRZÉS (egyetlen rács) ────────────────────────────────────────────
-- 1–2. sor: a két új besorolás; 3. sor: maradt-e MÉG besorolatlan élő tábla
-- (0 = a „Mentés most" újra el fog indulni).
SELECT * FROM (
  SELECT 1 AS sorrend, 'bevetel_partner besorolása' AS ellenorzes,
    COALESCE((SELECT hatokor || ' · R' || reteg || ' · visszaállítható: ' || visszaallithato
      FROM public.backup_table_policy WHERE tabla = 'bevetel_partner'), '❌ HIÁNYZIK') AS allapot
  UNION ALL
  SELECT 2, 'penzugy_valtozas_naplo besorolása',
    COALESCE((SELECT hatokor || ' · R' || reteg || ' · visszaállítható: ' || visszaallithato
      FROM public.backup_table_policy WHERE tabla = 'penzugy_valtozas_naplo'), '❌ HIÁNYZIK')
  UNION ALL
  SELECT 3, 'besorolatlan élő táblák',
    CASE WHEN cnt = 0 THEN '✅ nincs — a mentés újra indulhat'
         ELSE '❌ MÉG ' || cnt || ' db: ' || nevek END
  FROM (
    SELECT COUNT(*) AS cnt, COALESCE(string_agg(t.table_name, ', '), '') AS nevek
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND NOT EXISTS (SELECT 1 FROM public.backup_table_policy p WHERE p.tabla = t.table_name)
  ) x
) y ORDER BY sorrend;
