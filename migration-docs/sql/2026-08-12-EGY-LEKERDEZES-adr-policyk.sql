-- ═══════════════════════════════════════════════════════════════════════════
--  MI AZ A KÉT NEM-SELECT SZABÁLY A CÍM-TÖRZSÖN? (2026-08-12)
--  ⚠️ CSAK OLVAS. Egyetlen SELECT. Semmit nem módosít.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIÉRT KELL EZ
--  A `2026-08-11-ellenorzes-javitasok.sql` 7. sora ❌-t adott: az `adrlocality` /
--  `adrstreet` táblán 2 db NEM-SELECT policy van, holott a repó szerint csak
--  olvasási szabályoknak kellene lenniük.
--
--  ⚠️ EZ EGY KORÁBBI ÁLLÍTÁSOMAT CÁFOLJA. Ma reggel azt mondtam, hogy a cím-törzs
--  tényleges kitettsége NULLA volt, mert „a második réteg (RLS) egyedül is tartott".
--  Azt a repó fájljaiból állítottam. Ha ez a két szabály `authenticated`-re szól ÉS
--  megengedő (PERMISSIVE), akkor ma reggelig — amíg az írási GRANT is nyitva volt —
--  MINDKÉT zár nyitva volt, és a kitettség NEM volt nulla.
--
--  MOST már biztosan zárt: az írási jogokat visszavontuk (1–4. sor mind ✅).
--  Ez a lekérdezés azt dönti el, hogy VISSZAMENŐLEG mi volt a helyzet, és hogy
--  kell-e még tennünk valamit.
--
--  HOGYAN OLVASD
--  A 10–19. sorok mutatják a szabályokat egyenként. Amit nézni kell:
--    · `szerepek`  — ha `{authenticated}` vagy `{public}` szerepel benne, az KOMOLY.
--                    Ha `{service_role}` vagy `{postgres}`, az ÁRTALMATLAN
--                    (azok a szerverünk saját, emelt jogú kapcsolatai).
--    · `parancs`   — ALL / INSERT / UPDATE / DELETE
--    · `tipus`     — PERMISSIVE (megengedő, OR-olódik) vagy RESTRICTIVE (szűkítő,
--                    AND-elődik). Egy RESTRICTIVE szabály NEM ad jogot, csak elvesz.
--    · `feltetel`  — ha `true`, a szabály MINDEN sorra érvényes.
--
--  A 99. sor mondja ki az ítéletet.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT sorrend, mit_mer, ertek, megjegyzes
FROM (

  -- ══ A KÉT SZABÁLY, EGYENKÉNT ═══════════════════════════════════════════
  SELECT 10 + row_number() OVER (ORDER BY p.tablename, p.policyname) AS sorrend,
         ('SZABÁLY: ' || p.tablename || ' → ' || p.policyname) AS mit_mer,
         ('parancs=' || p.cmd
           || ' | tipus=' || p.permissive
           || ' | szerepek=' || COALESCE(array_to_string(p.roles, ','), '—')
           || ' | feltetel=' || COALESCE(left(p.qual, 120), '—')
           || ' | uj_sor_feltetel=' || COALESCE(left(p.with_check, 120), '—')) AS ertek,
         CASE
           WHEN p.permissive = 'RESTRICTIVE'
             THEN '🟢 SZŰKÍTŐ szabály — nem AD jogot, csak elvesz. Ártalmatlan.'
           WHEN NOT (p.roles && ARRAY['authenticated','public','anon']::name[])
             THEN '🟢 Nem a bejelentkezett felhasználóra vonatkozik. Ártalmatlan.'
           ELSE '🔴 EZ AZ: megengedő szabály a bejelentkezett felhasználóra. Olvasd el a feltételt!'
         END AS megjegyzes
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename IN ('adrlocality','adrstreet')
     AND p.cmd <> 'SELECT'

  -- ══ AZ ÍTÉLET ═══════════════════════════════════════════════════════════
  UNION ALL
  SELECT 99,
         '>>> ITELET <<<',
         (SELECT count(*)::text FROM pg_policies p
           WHERE p.schemaname='public'
             AND p.tablename IN ('adrlocality','adrstreet')
             AND p.cmd <> 'SELECT'
             AND p.permissive = 'PERMISSIVE'
             AND p.roles && ARRAY['authenticated','public','anon']::name[]
         ) || ' db VESZELYES szabaly',
         CASE WHEN (SELECT count(*) FROM pg_policies p
                     WHERE p.schemaname='public'
                       AND p.tablename IN ('adrlocality','adrstreet')
                       AND p.cmd <> 'SELECT'
                       AND p.permissive = 'PERMISSIVE'
                       AND p.roles && ARRAY['authenticated','public','anon']::name[]) = 0
              THEN '🟢 MEGNYUGTATO: a ket szabaly egyike sem ad irasi jogot a bejelentkezett '
                || 'felhasznalonak. A mai reggeli allitasom (kitettseg = nulla) HELYES volt, '
                || 'csak a szamlalo volt tul tag. Nincs tovabbi teendo.'
              ELSE '🔴 FIGYELEM: legalabb egy megengedo irasi szabaly vonatkozik a bejelentkezett '
                || 'felhasznalora. Ma reggelig — amig az irasi GRANT is nyitva volt — a cim-torzs '
                || 'ATIRHATO volt. MOST mar zart (a GRANT visszavonva), de a szabalyt is meg kell '
                || 'nezni: kell-e egyaltalan? Kuldd el ezt az eredmenyt.'
         END

  -- ══ TÁJÉKOZTATÓ: az összes szabály, hogy legyen teljes kép ═════════════
  UNION ALL
  SELECT 100,
         'TAJEKOZTATO — OSSZES szabaly az adrlocality/adrstreet tablan',
         (SELECT COALESCE(string_agg(p.tablename || '.' || p.policyname || ' [' || p.cmd || ']',
                                     '  ·  ' ORDER BY p.tablename, p.policyname), '—')
            FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename IN ('adrlocality','adrstreet')),
         'A SELECT-esek a normalis mukodeshez kellenek (cim-legordulok).'

  -- ══ TÁJÉKOZTATÓ: írhat-e MA bárki? ═════════════════════════════════════
  UNION ALL
  SELECT 101,
         'TAJEKOZTATO — van-e MA irasi JOG (GRANT) barmelyik adr-tablan',
         (SELECT count(*)::text
            FROM (VALUES ('adrcountry'),('adrcounty'),('adrlocality'),
                         ('adrstreet'),('adrlocality_alias')) v(t)
           CROSS JOIN (VALUES ('anon'),('authenticated'),('public')) r(role)
           CROSS JOIN (VALUES ('INSERT'),('UPDATE'),('DELETE')) c(priv)
           WHERE has_table_privilege(r.role, 'public.' || v.t, c.priv)),
         'Ha 0: az elso zar biztosan fog, szabalytol fuggetlenul. Ez a mai javitas eredmenye.'

) AS x
ORDER BY sorrend;
