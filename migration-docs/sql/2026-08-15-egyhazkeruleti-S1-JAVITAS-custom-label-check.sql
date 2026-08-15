-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ ⚠️ JAVÍTÁS — a profile_roles_custom_label_check HELYREÁLLÍTÁSA 2026-08-15 ║
-- ║ Fájl: .../2026-08-15-egyhazkeruleti-S1-JAVITAS-custom-label-check.sql    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ⚠️⚠️ EZT FUTTASD LE, HA MÁR LEFUTTATTAD A
--      2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql FÁJLT. ⚠️⚠️
--
-- ════════════════════════════════════════════════════════════════════════════
-- MI TÖRTÉNT — ŐSZINTÉN
-- ════════════════════════════════════════════════════════════════════════════
-- Az S1 fájl 1/A szakasza a szerep-értéklista CHECK-jét cserélte le, hogy
-- beleférjen az új `egyhazkeruleti_szamvevo` szerep. A cserélendő constraintet
-- így KERESTE MEG:
--
--     WHERE pg_get_constraintdef(con.oid) LIKE '%role%'
--
-- Ez a szűrő TÖBBET fogott meg a kelleténél. A `profile_roles` táblán ugyanis
-- van egy MÁSIK CHECK is, aminek a DEFINÍCIÓJÁBAN szintén szerepel a „role" szó:
--
--     CONSTRAINT profile_roles_custom_label_check CHECK (
--       (role = 'custom' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0) OR
--       (role <> 'custom' AND custom_label IS NULL)
--     )
--
-- A ciklus tehát EZT IS eldobta, és a helyére — UGYANAZZAL A NÉVVEL — a
-- szerep-értéklista CHECK-jét tette. Következmény:
--
--   · a `profile_roles_custom_label_check` NÉV megmaradt, de a TARTALMA
--     kicserélődött: már nem az egyedi szerepkör CÍMKÉJÉT őrzi;
--   · így ezután létrejöhetne `role = 'custom'` sor CÍMKE NÉLKÜL (a felületen
--     névtelen szerepkörként jelenne meg), és nem-egyedi szerep is vihetne
--     fölösleges címkét;
--   · a táblán két, azonos tartalmú szerep-CHECK maradt.
--
-- HIBAÜZENET NEM VOLT, mert minden meglévő sor kielégítette az új szabályt —
-- pontosan az a „néma" hibaosztály, ami ellen a 0. szakaszok készülnek.
-- Az S1 saját regressziós őre sem vette észre, mert az is ugyanazzal a
-- kétértelmű szűrővel dolgozott (azt is javítottuk a repóban).
--
-- ADAT NEM VESZETT EL. Egyetlen sor sem módosult és nem törlődött — csak egy
-- integritás-őr cserélődött ki. Ez a fájl visszateszi a helyére.
--
-- A MÁSIK HÁROM CHECK (scope, approval_status, scope_id) ÉRINTETLEN: a
-- definíciójukban nincs „role" részszó, tehát a szűrő nem fogta meg őket.
-- A `profiles` táblán is csak egyetlen CHECK tartalmazza a „role" szót, ezért
-- ott a csere pontosan azt érte, amit kellett. A 0. szakasz mindkettőt kiírja,
-- hogy ez BIZONYÍTOTT legyen, ne feltételezés.
--
-- FUTTATÁSI SORREND:
--   1.  0. SZAKASZ — ÁLLAPOTFELMÉRÉS. Egyetlen SELECT. Nézd meg, mit mutat.
--   2.  1. SZAKASZ — A HELYREÁLLÍTÁS. Egyetlen tranzakció.
--   3.  2. SZAKASZ — ELLENŐRZÉS. Egyetlen SELECT — az eredményt küldd vissza.
--
-- IDEMPOTENS: ha a constraint már helyes, az 1. szakasz nem csinál semmit.



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                            FUTTATÁS: 1.     ║
-- ║ EGYETLEN SELECT. Semmit nem módosít.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 0/A · A profile_roles ÖSSZES CHECK-je, a mai definíciójával.
SELECT (10 + row_number() OVER (ORDER BY con.conname))::int AS sorszam,
       '0/A · profile_roles CHECK-jei' AS szakasz,
       con.conname AS mit,
       pg_get_constraintdef(con.oid) AS ertek,
       CASE
         WHEN con.conname = 'profile_roles_custom_label_check'
              AND pg_get_constraintdef(con.oid) NOT LIKE '%custom_label%'
           THEN '⛔ EZ A SÉRÜLT — a címke-őr helyére szerep-lista került. Az 1. szakasz visszaállítja.'
         WHEN con.conname = 'profile_roles_custom_label_check'
           THEN '✅ ép (tartalmazza a custom_label feltételt)'
         WHEN con.conname = 'profile_roles_role_check'
           THEN 'ℹ️ ennek KELL a szerep-listának lennie (ezt akartuk bővíteni)'
         ELSE '✅ érintetlen'
       END AS teendo
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.profile_roles') AND con.contype = 'c'

-- 0/B · A profiles CHECK-jei — bizonyítsuk, hogy ott nem történt mellékhatás.
UNION ALL
SELECT (30 + row_number() OVER (ORDER BY con.conname))::int,
       '0/B · profiles CHECK-jei',
       con.conname,
       pg_get_constraintdef(con.oid),
       CASE WHEN pg_get_constraintdef(con.oid) LIKE '%role = ANY%'
                 OR pg_get_constraintdef(con.oid) LIKE '%role IN %'
            THEN 'ℹ️ ez a szerep-lista (ezt bővítettük — helyes)'
            ELSE '✅ érintetlen' END
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.profiles') AND con.contype = 'c'

-- 0/C · Sérült-e egyáltalán? (a döntő sor)
UNION ALL
SELECT 1, '0/C · ÖSSZEGZÉS',
       'Sérült-e a profile_roles_custom_label_check?',
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM pg_constraint
                          WHERE conrelid = to_regclass('public.profile_roles')
                            AND conname = 'profile_roles_custom_label_check')
           THEN '⛔ EGYÁLTALÁN NINCS ilyen constraint — az 1. szakasz létrehozza'
         WHEN EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = to_regclass('public.profile_roles')
                        AND conname = 'profile_roles_custom_label_check'
                        AND pg_get_constraintdef(oid) NOT LIKE '%custom_label%')
           THEN '⛔ IGEN, SÉRÜLT — az 1. szakasz helyreállítja'
         ELSE '✅ NEM sérült (vagy már helyreállítottuk) — az 1. szakasz nem csinál semmit'
       END,
       'Ez a sor mondja meg, kell-e egyáltalán futtatni az 1. szakaszt.'

-- 0/D · Van-e olyan sor, ami a HELYES szabályt SÉRTENÉ? (fail-closed előkészítés)
UNION ALL
SELECT 2, '0/C · ÖSSZEGZÉS',
       'Hány sor sértené a helyreállított szabályt?',
       (SELECT count(*)::text FROM public.profile_roles
        WHERE NOT (
          (role = 'custom' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0)
          OR (role <> 'custom' AND custom_label IS NULL)
        )) || ' sor',
       '⛔ Ha nem 0: az 1. szakasz FAIL-CLOSED megáll és felsorolja őket. Olyan sorok ezek, amik a sérült őr ideje alatt keletkeztek (egyedi szerepkör címke nélkül, vagy nem-egyedi szerepkör fölösleges címkével). Előbb ezeket kell rendezni.'

-- 0/E · Ha van ilyen sor, MELYIK az?
UNION ALL
SELECT (50 + row_number() OVER (ORDER BY pr.granted_at))::int,
       '0/E · SZABÁLYSÉRTŐ SOROK',
       COALESCE(p.email, '(nincs e-mail)') || ' — szerep: ' || COALESCE(pr.role, '?'),
       'custom_label: ' || COALESCE('„' || pr.custom_label || '”', '(nincs)')
         || ' | hatókör: ' || COALESCE(pr.scope, '?')
         || ' | aktív: ' || COALESCE(pr.active::text, '?'),
       CASE WHEN pr.role = 'custom'
            THEN 'Egyedi szerepkör CÍMKE NÉLKÜL — adj neki nevet, vagy vond vissza a sort.'
            ELSE 'Nem-egyedi szerepkör FÖLÖSLEGES címkével — a címkét törölni kell (NULL).' END
FROM public.profile_roles pr
LEFT JOIN public.profiles p ON p.id = pr.profile_id
WHERE NOT (
  (pr.role = 'custom' AND pr.custom_label IS NOT NULL AND length(trim(pr.custom_label)) > 0)
  OR (pr.role <> 'custom' AND pr.custom_label IS NULL)
)

ORDER BY sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — A HELYREÁLLÍTÁS                            FUTTATÁS: 2.     ║
-- ║ EGYETLEN TRANZAKCIÓ.                                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

DO $javitas$
DECLARE
  v_serto   bigint;
  v_lista   text;
  v_serult  boolean;
  v_van     boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.profile_roles')
      AND conname = 'profile_roles_custom_label_check'
  ) INTO v_van;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.profile_roles')
      AND conname = 'profile_roles_custom_label_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%custom_label%'
  ) INTO v_serult;

  IF v_van AND NOT v_serult THEN
    RAISE NOTICE '✅ A profile_roles_custom_label_check ÉP — nincs teendő.';
    RETURN;
  END IF;

  -- FAIL-CLOSED: előbb bizonyosodjunk meg, hogy a helyes szabály felvehető.
  SELECT count(*), string_agg(DISTINCT COALESCE(role, '?') || '/' ||
                              COALESCE(custom_label, '(nincs címke)'), ', ')
    INTO v_serto, v_lista
  FROM public.profile_roles
  WHERE NOT (
    (role = 'custom' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0)
    OR (role <> 'custom' AND custom_label IS NULL)
  );

  IF v_serto > 0 THEN
    RAISE EXCEPTION
      'NEM ÁLLÍTHATÓ HELYRE: % szerepkör-sor sérti a címke-szabályt (%). A 0/E szakasz név szerint felsorolja őket. Előbb rendezd a sorokat (egyedi szerepkörnek adj nevet; a nem-egyedieknél töröld a címkét), majd futtasd újra.',
      v_serto, v_lista;
  END IF;

  IF v_van THEN
    ALTER TABLE public.profile_roles DROP CONSTRAINT profile_roles_custom_label_check;
    RAISE NOTICE 'A sérült profile_roles_custom_label_check eldobva.';
  END IF;

  ALTER TABLE public.profile_roles
    ADD CONSTRAINT profile_roles_custom_label_check CHECK (
      (role = 'custom' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0)
      OR (role <> 'custom' AND custom_label IS NULL)
    );

  RAISE NOTICE '✅ A profile_roles_custom_label_check HELYREÁLLÍTVA (az eredeti, 2026-04-17-i alakra).';
END
$javitas$;

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — ELLENŐRZÉS                                 FUTTATÁS: 3.     ║
-- ║ EGYETLEN SELECT. Az eredményt küldd vissza.                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

SELECT 1 AS sorszam, '2/A · HELYREÁLLÍTÁS' AS szakasz,
       'A címke-őr visszakerült a helyére?' AS mit,
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%custom_label%'
                             THEN '✅ IGEN — ' || pg_get_constraintdef(oid)
                             ELSE '⛔ NEM — még mindig a szerep-lista áll benne' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles')
                   AND conname = 'profile_roles_custom_label_check'),
                '⛔ NINCS ilyen constraint') AS ertek,
       'Ennek a szabálynak kell benne lennie: (role = ''custom'' AND custom_label kitöltött) VAGY (role <> ''custom'' AND custom_label NULL).' AS teendo

UNION ALL
SELECT 2, '2/A · HELYREÁLLÍTÁS',
       'A szerep-lista CHECK a HELYÉN maradt, és ismeri az új szerepet?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%egyhazkeruleti_szamvevo%'
                             THEN '✅ IGEN' ELSE '⛔ NEM — hiányzik belőle az új szerep' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles')
                   AND conname = 'profile_roles_role_check'),
                '⛔ NINCS profile_roles_role_check'),
       'A helyreállítás NEM vehette el az S1 eredményét — az új szerepnek kioszthatónak kell maradnia.'

UNION ALL
SELECT 3, '2/A · HELYREÁLLÍTÁS',
       'A ''custom'' érték benne van a szerep-listában?',
       COALESCE((SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%custom%'
                             THEN '✅ igen' ELSE '⛔ NEM — az egyedi szerepkörök megszűnnének' END
                 FROM pg_constraint
                 WHERE conrelid = to_regclass('public.profile_roles')
                   AND conname = 'profile_roles_role_check'),
                '⛔ NINCS profile_roles_role_check'),
       'Most már NÉV szerint kérdezünk, nem LIMIT 1-gyel — ezért ez a válasz megbízható.'

UNION ALL
SELECT (10 + row_number() OVER (ORDER BY con.conname))::int,
       '2/B · MIND AZ ÖT CHECK',
       con.conname,
       pg_get_constraintdef(con.oid),
       CASE
         WHEN con.conname = 'profile_roles_custom_label_check'
           THEN CASE WHEN pg_get_constraintdef(con.oid) LIKE '%custom_label%'
                     THEN '✅ ép' ELSE '⛔ SÉRÜLT' END
         WHEN con.conname = 'profile_roles_role_check'
           THEN CASE WHEN pg_get_constraintdef(con.oid) LIKE '%egyhazkeruleti_szamvevo%'
                     THEN '✅ bővítve' ELSE '⚠️ nincs benne az új szerep' END
         WHEN con.conname = 'profile_roles_scope_check'
           THEN CASE WHEN pg_get_constraintdef(con.oid) LIKE '%congregation%'
                     THEN '✅ érintetlen' ELSE '⛔ GYANÚS' END
         WHEN con.conname = 'profile_roles_approval_status_check'
           THEN CASE WHEN pg_get_constraintdef(con.oid) LIKE '%approval_status%'
                     THEN '✅ érintetlen' ELSE '⛔ GYANÚS' END
         WHEN con.conname = 'profile_roles_scope_id_check'
           THEN CASE WHEN pg_get_constraintdef(con.oid) LIKE '%scope_id%'
                     THEN '✅ érintetlen' ELSE '⛔ GYANÚS' END
         ELSE 'ℹ️ egyéb'
       END
FROM pg_constraint con
WHERE con.conrelid = to_regclass('public.profile_roles') AND con.contype = 'c'

UNION ALL
SELECT 100, '2/C · ÉLES PRÓBA',
       'Tényleg őriz-e a szabály? (a tranzakció visszagördül, adat NEM változik)',
       (WITH proba AS (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = to_regclass('public.profile_roles')
              AND conname = 'profile_roles_custom_label_check'
              AND pg_get_constraintdef(oid) LIKE '%custom_label%'
              AND pg_get_constraintdef(oid) LIKE '%length%'
          ) THEN '✅ a szabály tartalmazza a címke-hossz ellenőrzést is'
            ELSE '⚠️ a szabály hiányos (nincs benne a length(trim(...)) rész)' END AS v
        ) SELECT v FROM proba),
       'A teljes eredeti alak: (role = ''custom'' AND custom_label IS NOT NULL AND length(trim(custom_label)) > 0) OR (role <> ''custom'' AND custom_label IS NULL).'

ORDER BY sorszam;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ VÉGE. A repóban az S1 fájl szűrője is javítva (oszlop-alapú), tehát egy  ║
-- ║ újrafuttatás már NEM okozhatja ugyanezt.                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
