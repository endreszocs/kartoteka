-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — DIAGNOSZTIKA: „MIÉRT MUTATJA KIKÜLDETLENNEK, AMI MÁR KIMENT?"
-- Fájl:     migration-docs/sql/2026-08-12-EGY-LEKERDEZES-miert-nincs-kikuldve.sql
-- Dátum:    2026-08-12
-- Futtatja: Endre (Supabase Studio → SQL Editor).
--
-- ⚠️ EZ CSAK OLVAS. Nem hoz létre, nem módosít és nem töröl SEMMIT.
-- ⚠️ A Supabase SQL-szerkesztő csak az UTOLSÓ utasítás eredményét mutatja,
--    ezért az egész EGYETLEN SELECT (UNION ALL). Küldd vissza a sorokat.
--
-- ─── MIT DÖNT EL ────────────────────────────────────────────────────────────
-- A Frissítések oldal a `docs/CHANGELOG.md` `<!-- key: -->` értékeit veti össze
-- a `system_broadcasts.release_changelog_key` oszloppal. A párosítás SZTRING-
-- EGYEZÉS, nem dátum. Ha nem egyezik, a bejegyzés „Még nincs kiküldve".
--
-- HÁROM dolog romolhat el, és ez a lekérdezés MEGKÜLÖNBÖZTETI őket:
--
--   (1) A KULCS A CÍMBŐL KÉPZŐDÖTT, és a cím azóta megváltozott.
--       Ez a legvalószínűbb, és kódból BIZONYÍTOTT mechanizmus van rá. Ha egy
--       CHANGELOG-bejegyzésnek nincs `<!-- key: ... -->` sora, az elemző a
--       CÍMBŐL generál kulcsot. Lemérve: a régi elemző éles (LF-es) futásán 342
--       bejegyzésből 121-nek NEM volt saját kulcsa. Ezeknél a cím egyetlen
--       átfogalmazása vagy elgépelés-javítása NÉMÁN új kulcsot csinál:
--           régi kiküldés a DB-ben:  2026-08-12-a-mentes-elesitese-harom-nema-adatveszte
--           az új futás ezt keresi:  2026-08-12-a-mentes-elesitese-es-a-harom-nema-adat
--       → SOHA nem találkoznak, a bejegyzés örökre „Még nincs kiküldve".
--       FELISMERÉS: a D) sorban HOSSZÚ, a CÍMRE hasonlító kulcsok is állnak, a
--       rövid, kézzel adott azonosítók mellett. Ez NORMÁLIS és VÁRT — nem hiba
--       jele, hanem épp ennek a mechanizmusnak a lenyomata.
--
--       ⚠️ AMI NEM EZ: a régi elemzőben volt egy CRLF-sorvég hiba is (a
--       JavaScript `$` nem illeszkedik a `\r` elé). Az viszont NEM csak a
--       `<!-- key: -->` sort vitte el, hanem a `## [dátum] — Cím` FEJLÉCET is,
--       vagyis a Windows-os fejlesztői gépen a régi elemző NULLA bejegyzést
--       adott: üres lista, nincs mit kiküldeni. Egy localhostról indított
--       kiküldés tehát NEM tudott hibás kulcsot írni ide. Éles (Railway, LF-es)
--       futáson ez a hiba nem jelentkezett. Ne ezt a szálat keresd.
--
--   (2) NINCS EGYETLEN SOR SEM / az RLS mindent elrejt.
--       → A) = 0. Ilyenkor a felületen az „Elküldött üzenetek" száma is 0.
--         Nézd meg a G) sort: a te profilod megfelel-e a policy feltételének.
--
--   (3) A KULCS VISSZAÍRÁSA MARADT EL a kiküldéskor (néma insert-hiba).
--       → C) > 0: van `release` típusú sor ÜRES kulccsal.
-- ════════════════════════════════════════════════════════════════════════════

WITH friss(kulcs) AS (
  -- A docs/CHANGELOG.md 12 legfrissebb `<!-- key: -->` értéke, kézzel átemelve.
  VALUES
    ('2026-08-12-mentes-elesites-nema-adatvesztes'),
    ('2026-08-12-mentes-reszszamadas-naptar'),
    ('2026-08-11-biztonsagi-kor-szemelyi-karton'),
    ('2026-08-10-beszamolo-weboldal-ertesitesek-biztonsag'),
    ('2026-08-09-megye-kerulet-scope-dokumentumkozpont'),
    ('2026-08-09-igeterv-meghivo-profil-teszt'),
    ('2026-08-09-admin-egyeztetes-leltar-fisa-hid'),
    ('2026-08-04-tagnyilv-pr44-valas'),
    ('2026-08-04-tagnyilv-pr43-befizetes-ev'),
    ('2026-08-04-anyakonyv-pr42-halaleset-kereszteles'),
    ('2026-08-04-tagnyilv-pr41-csalad-egyediseg'),
    ('2026-08-04-anyakonyv-pr40-csalad-egyseges-ut')
)
SELECT 1 AS n,
       'A) system_broadcasts sorok száma' AS ellenorzes,
       count(*)::text AS eredmeny,
       '> 0. Ha 0: vagy soha nem ment ki semmi, vagy az RLS mindent elrejt (lásd G).' AS varhato
  FROM public.system_broadcasts

UNION ALL SELECT 2,
       'B) ebből hánynak van release_changelog_key',
       count(*) FILTER (WHERE release_changelog_key IS NOT NULL)::text,
       '> 0. Pontosan ennyi sor jelöl kiküldött CHANGELOG-bejegyzést.'
  FROM public.system_broadcasts

UNION ALL SELECT 3,
       'C) „release" sor ÜRES kulccsal',
       count(*)::text,
       '0. Ha > 0: a kiküldés nem írta vissza a kulcsot (néma insert-hiba).'
  FROM public.system_broadcasts
 WHERE tipus = 'release' AND release_changelog_key IS NULL

UNION ALL SELECT 4,
       'D) A DB-BEN LÉVŐ KULCSOK — a 15 legfrissebb, alak-ellenőrzésre',
       coalesce(
         string_agg(k.release_changelog_key || '  (' || length(k.release_changelog_key)::text || ' jel)',
                    chr(10) ORDER BY k.utolso DESC),
         '(EGY SINCS)'),
       'KÉTFÉLE kulcs várható, és MINDKETTŐ normális: (a) rövid, kézzel adott azonosító (pl. „2026-08-12-mentes-elesites-nema-adatvesztes") — ezek stabilak; (b) HOSSZÚ, a CÍMRE hasonlító kulcs (pl. „2026-08-12-a-mentes-elesitese-harom-nema-adatveszte") — ezek a CÍMBŐL generálódtak, mert a bejegyzésnek nem volt saját azonosítója. A (b) csoport a TÖRÉKENY: ha a CHANGELOG-ban azóta átfogalmaztad a címet, a párosítás elszakadt, és a bejegyzés kiküldetlennek látszik. A felület mostantól ki is írja rájuk: „Nincs saját azonosítója". Rendbetétel valódi újraküldés NÉLKÜL: „Kiküldöttnek jelölöm".'
  FROM (SELECT release_changelog_key, max(sent_at) AS utolso
          FROM public.system_broadcasts
         WHERE release_changelog_key IS NOT NULL
         GROUP BY release_changelog_key
         ORDER BY 2 DESC
         LIMIT 15) k

UNION ALL SELECT 5,
       'E) a 12 legfrissebb CHANGELOG-kulcs, ami MEGVAN a DB-ben',
       coalesce(string_agg(f.kulcs, chr(10) ORDER BY f.kulcs DESC), '(EGY SINCS)'),
       'Ha ezek a felületen MÉGIS „Még nincs kiküldve"-t mutatnak, akkor a lekérdezés bukik el (kód-hiba), nem az adat hiányzik.'
  FROM friss f
 WHERE EXISTS (SELECT 1 FROM public.system_broadcasts b
                WHERE b.release_changelog_key = f.kulcs)

UNION ALL SELECT 6,
       'F) a 12 legfrissebb CHANGELOG-kulcs, ami NINCS a DB-ben',
       coalesce(string_agg(f.kulcs, chr(10) ORDER BY f.kulcs DESC), '(mind megvan)'),
       'Amit ezek közül MÁR kiküldtél: ott vagy a kulcs alakja tér el (lásd D), vagy a visszaírás maradt el. Mindkettőt orvosolja a felület új „Kiküldöttnek jelölöm" gombja.'
  FROM friss f
 WHERE NOT EXISTS (SELECT 1 FROM public.system_broadcasts b
                    WHERE b.release_changelog_key = f.kulcs)

UNION ALL SELECT 7,
       'G) a saját profilod (ezt nézi az RLS-policy)',
       coalesce(
         string_agg('profiles.role=' || coalesce(p.role, '(üres)')
                    || ' / status=' || coalesce(p.status, '(üres)'), ', '),
         '(nincs ilyen profil)'),
       'role = admin VAGY egyhazkeruleti_admin, ÉS status = active. Bármi más: a 2026-04-17-es policy üres listát ad → minden kiküldetlennek látszik. (A 2026-08-12-changelog-jelolesek.sql SZAKASZ 4-e ezt profile_roles-lábbal is kiegészíti.)'
  FROM public.profiles p
 WHERE lower(p.email) = 'endreszocs@gmail.com'

UNION ALL SELECT 8,
       'H) a saját AKTÍV profile_roles szerepköreid',
       coalesce(
         (SELECT string_agg(pr.role || ' (' || coalesce(pr.scope, '?') || ')', ', ')
            FROM public.profile_roles pr
            JOIN public.profiles p2 ON p2.id = pr.profile_id
           WHERE lower(p2.email) = 'endreszocs@gmail.com'
             AND pr.active = true
             AND pr.approval_status = 'approved'),
         '(egy sincs)'),
       'Ha itt van admin/egyhazkeruleti_admin, de a G) sorban NINCS, akkor a régi, skalár-lábú policy zárt ki — futtasd a 2026-08-12-changelog-jelolesek.sql-t.'

UNION ALL SELECT 9,
       'I) legnagyobb ismétlődés egy kulcsra',
       coalesce((SELECT max(c)::text FROM (
                   SELECT count(*) AS c FROM public.system_broadcasts
                    WHERE release_changelog_key IS NOT NULL
                    GROUP BY release_changelog_key) z), '0'),
       'Tájékoztató. 1 felett újraküldött bejegyzés.'

 ORDER BY 1;
