-- ═══════════════════════════════════════════════════════════════════════════
--  A 15 RÉTEG NÉLKÜLI TÁBLA FELTÉRKÉPEZÉSE (2026-08-14)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ELŐZMÉNY: a 2026-08-14-mentes-mukodes-ellenorzes.sql 2. sora ❌-et adott:
--  15 tábla `reteg IS NULL`-lal áll a backup_table_policy-ban. Ez azt jelenti:
--  a MENTÉSÜK RENDBEN VAN (az adat megvan!), de a VISSZAÁLLÍTÁS megtagadná a
--  futást, amíg be nem soroljuk őket egy visszatöltési rétegbe (R0..R7).
--
--  A réteg a visszatöltés SORRENDJE: előbb a szülők (pl. congregations),
--  aztán a rájuk hivatkozó gyerekek — különben az FK-k miatt elhasalna.
--
--  ⚠️ EZ A FÁJL CSAK OLVAS. A besorolást (UPDATE) egy KÖVETKEZŐ, külön fájl
--  végzi majd, MIUTÁN ennek az eredményét visszaküldted — a projekt szabálya
--  szerint nem tippelünk: előbb megnézzük, mi a 15 tábla, és milyen táblákra
--  hivatkoznak (FK), csak utána javaslunk réteget.
--
--  FUTTASD LE, és küldd vissza az eredményt.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.tabla,
  p.hatokor,
  p.visszaallithato,
  p.megjegyzes,
  -- Milyen táblákra hivatkozik FK-val? (ez dönti el, hányadik rétegbe való:
  -- minden hivatkozott táblánál KÉSŐBBI rétegbe kell kerülnie)
  COALESCE((
    SELECT string_agg(DISTINCT ccu.table_name, ', ' ORDER BY ccu.table_name)
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = p.tabla
       AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_name <> p.tabla
  ), '—') AS fk_hivatkozasok,
  -- Hivatkozik-e RÁ valaki? (ha igen, ő maga korai rétegbe való)
  COALESCE((
    SELECT string_agg(DISTINCT tc.table_name, ', ' ORDER BY tc.table_name)
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public'
       AND ccu.table_name = p.tabla
       AND tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_name <> p.tabla
  ), '—') AS ra_hivatkozok,
  -- Hozzávetőleges sorszám (mekkora táblát érint a döntés)
  (SELECT reltuples::bigint FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = p.tabla) AS becsult_sorszam
FROM public.backup_table_policy p
WHERE p.reteg IS NULL
  AND p.hatokor IS DISTINCT FROM 'kizart'
ORDER BY p.tabla;
