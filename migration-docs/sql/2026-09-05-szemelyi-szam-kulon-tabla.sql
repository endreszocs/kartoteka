-- ═══════════════════════════════════════════════════════════════════════════
--  A HIVATALOS SZEMÉLYI SZÁM (CNP) KÜLÖN, VÉDETT HELYRE KERÜL
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  ELŐZMÉNY — Endre észrevétele:
--      „Személyi szám (CNP) az nem az ami a kartotékon szerepel. Az a rendszer
--       által adott azonosító kód. A hivatalos CNP-t külön lehet menteni!"
--
--  Igaza van. A `szemely.cnp` mező MA HÁROMFÉLE dolgot tárol egyszerre:
--    · `EC-2026-XXXXXXXXXX`  — a `generate_egyhazi_cnp()` adja (import-út),
--    · `999` + 7 számjegy    — a webes `generateCnp()` adja (kézi felvitel),
--    · valódi 13 jegyű CNP   — a DESKTOP új-tag űrlapja EZT KÖVETELI MEG.
--  A felület viszont mind a hármat „Személyi szám (CNP)" címkével mutatja.
--
--  ⛔ MIÉRT KÜLÖN TÁBLA, ÉS NEM ÚJ OSZLOP A `szemely`-EN?
--
--     ⚠️ HELYESBÍTÉS (2026-09-05, adversariális felülvizsgálat): a fájl első
--     változata három indokot sorolt, és az ELSŐ KETTŐ pontatlan volt.
--     Alább a MÉRT, helytálló indoklás.
--
--     1. A `szemely`-en ÜL AZ `audit_trg`, és az `audit.log_change()` a
--        `to_jsonb(NEW)`-t írja — vagyis a TELJES SORT. Minden egyes
--        tag-módosításnál bemásolódna az állami azonosító az `audit_log`-ba,
--        ami RENDSZERSZINTŰ tábla: nincs `congregation_id`-ja, a globális
--        (rendszergazdai) mentésbe kerül, és a gyülekezeti hatókör nem védi.
--        Egy külön tábla nem esik bele ebbe.
--
--     2. A `szemely`-en van egy szűk kivétel-policy (`szemely_cross_match_
--        select`), ami a kereszt-gyülekezeti egyeztetéshez a MÁSIK gyülekezet
--        lelkészének is kiadja az érintett SOR EGÉSZÉT. Egy oszlop ezen
--        keresztül automatikusan átszivárogna; egy külön tábla nem.
--
--     3. A `szemely` oszlopait FÉL TUCAT felület olvassa saját, kézzel írt
--        oszlop-listával (taglista, offline Dexie-tükör, Excel-séma, desktop
--        szinkron, nyomtatott karton, adatexport). Egy új oszlopot MINDEGYIKBŐL
--        külön ki kellene hagyni, és egyetlen kifelejtés némán kiszivárogtatná.
--        Egy külön tábla FORDÍTVA működik: alapból kimarad, és ott kell
--        felvenni, ahol tényleg kell (az adatexportban fel is vettük).
--
--     ⛔ AMI NEM INDOK — és amit az első változat tévesen állított:
--        · „a `cnp` KULCS, NO ACTION-nel, ezért nem költöztethető" — a
--          szülő-FK valójában ON UPDATE CASCADE (mérve), és ez az érv amúgy is
--          csak a MEGLÉVŐ `cnp` ÚJRAHASZNOSÍTÁSA ellen szólt, egy ÚJ oszlop
--          ellen nem. (Az FK-tényt lásd lent.)
--        · „a taglista `select('*')`-gal viszi a `cnp`-t" — a taglista EXPLICIT
--          oszlop-listát kér, tehát egy ÚJ oszlop nem utazna vele magától. Ami
--          IGAZ: maga a `cnp` BENNE VAN abban a listában (és a szabadszavas
--          keresés haystackjében is), tehát a `cnp` mai maszkolása látszat —
--          de ez a `cnp`-ről szól, nem egy új oszlopról.
--
--  ── A SZÜLŐ-IDEGENKULCSOK MÉRT VISELKEDÉSE ────────────────────────────────
--     szemely_id_apja_fk  · UPDATE: CASCADE · DELETE: NO ACTION
--     szemely_id_anyja_fk · UPDATE: CASCADE · DELETE: NO ACTION
--     A `szemely.cnp`-n van GLOBÁLIS, feltétel nélküli egyediségi index
--     (`szemely_cnp_idx`) — enélkül a két idegen kulcs nem is létezhetne.
--     A `cnp` oszlop típusa: `character varying(20)`.
--
--     ⚠️ A SÉMA-DUMP MINDHÁRMAT ELHALLGATJA. A `Database_schema.sql:617-618`
--     (és a `source-links/` másolata) ZÁRADÉK NÉLKÜL írja le az idegen
--     kulcsokat, amiből NO ACTION következne — pontosan ezt a téves
--     következtetést vontuk le belőle. Rögzített hibaosztály: „a
--     migration-fájl NEM bizonyíték". FK-t, indexet, típust MÉRNI kell.
--
--     KÖVETKEZMÉNY, amivel számolni kell: a `cnp` átírása NEM hangos hibával
--     áll meg, hanem NÉMÁN átkulcsolja a gyermekek `id_apja`/`id_anyja`
--     hivatkozását — és a kaszkád az FK-n keresztül fut, tehát az RLS és a
--     gyülekezeti szűrő NEM vonatkozik rá. Ezért ugyanebben a körben lezártuk
--     az Excel-visszaírás útját (a `cnp` csak olvasható oszlop lett), és a
--     webes mentés sem enged valódi CNP-t a mezőbe.
--
--  ⛔ AMIT SZÁNDÉKOSAN NEM TESZÜNK EBBEN A KÖRBEN:
--     · Nem vezetünk át adatot — és a MÉRÉS SZERINT NEM IS KELL, DE CSAK A
--       `szemely.cnp` OSZLOPRA. Az élő adatban NULLA 13 jegyű (valódi CNP
--       alakú) érték van ott, sem a látható, sem a rejtett sorokon; a 18
--       szülőként hivatkozott érték közül is 0. A 661 sor megoszlása:
--       613 `EC-2026-…` + 48 `EC-TSZT-…` (a teszt-gyülekezet seedje,
--       `2026-08-09-teszt-gyulekezet-seed.sql`) = 661, tehát minden érték
--       RENDSZER ÁLTAL GENERÁLT.
--
--       ⚠️ AMI NINCS MEGMÉRVE (a megállapításnak lejárati ideje van):
--         · a `szig`, `taj` és `megjegyzes` oszlopok — a legacy tömeges import
--           épp ezeket kínálta, és ma egyetlen felület sem olvassa őket;
--         · a desktop gépeken ÜLŐ, még fel nem szinkronizált sorok: az új-tag
--           űrlap VALÓDI 13 jegyű CNP-t követel meg, és a következő sikeres
--           szinkron beírná a `cnp`-be. Amíg ez az út nyitva van, a nulla
--           eredmény bármikor megszűnhet.
--       Mérő SQL-ek:
--       docs/2026-09-05-szemelyi-szam-allapotfelmeres.sql
--       docs/2026-09-05-egyeb-azonositok-alakja.sql
--       docs/2026-09-05-egyeb-azonositok-elotag.sql
--     · Nem tesszük rá az `audit_trg`-t. Az `audit.log_change()` a TELJES sort
--       beírja az `audit_log`-ba — vagyis magát az állami azonosítót másolná
--       egy rendszerszintű (gyülekezet-független) táblába. A ki-mit-nézett és
--       ki-mit-írt eseményt ehelyett az ALKALMAZÁS naplózza, ÉRTÉK NÉLKÜL.
--     · Nem bővítjük a visszaállítási előnézet szűrőjét: a
--       `backup_restore_row_label` FEHÉRLISTÁS (2026-08-11-visszaallitas.sql:
--       178-183) — ami nincs a listán, az nem is jöhet ki. A `szemelyi_szam`
--       nincs rajta, tehát alapból kimarad. ELLENŐRIZVE, nem feltételezve.
--     · Nem módosítjuk az adatvédelmi nyilatkozatot: az azt mondja, a CNP-t a
--       rendszer „nem kéri kötelező mezőként" — ez az új, OPCIONÁLIS mezővel
--       továbbra is igaz marad.
--
--  FUTTATÁS: egyben, jelölés nélkül. Újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. A TÁBLA ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.szemely_szemelyi_szam (
  id_szemely      integer PRIMARY KEY
                    REFERENCES public.szemely(id) ON DELETE CASCADE,
  congregation_id uuid NOT NULL
                    REFERENCES public.congregations(id) ON DELETE RESTRICT,
  -- A szám maga. Üres sztring SOHA nem lehet: a törlés a SOR törlése.
  szemelyi_szam   text NOT NULL,
  -- Országkód — a rendszer nem csak romániai tagokat tart nyilván.
  orszag          text NOT NULL DEFAULT 'RO',
  rogzitette      uuid,
  rogzitve        timestamptz NOT NULL DEFAULT now(),
  modositotta     uuid,
  modositva       timestamptz NOT NULL DEFAULT now()
);

-- Idempotens CHECK-ek (pg_constraint-alapon, hogy újrafuttatható legyen).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'szemely_szemelyi_szam_nem_ures') THEN
    ALTER TABLE public.szemely_szemelyi_szam
      ADD CONSTRAINT szemely_szemelyi_szam_nem_ures
      CHECK (btrim(szemelyi_szam) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'szemely_szemelyi_szam_orszag_alak') THEN
    ALTER TABLE public.szemely_szemelyi_szam
      ADD CONSTRAINT szemely_szemelyi_szam_orszag_alak
      CHECK (orszag ~ '^[A-Z]{2}$');
  END IF;
END $$;

-- Egy gyülekezeten belül ugyanaz a szám nem tartozhat két emberhez. Ez az
-- egyetlen duplikátum-védelem, ami a valódi azonosítón dolgozik.
CREATE UNIQUE INDEX IF NOT EXISTS uq_szemelyi_szam_gyulekezet
  ON public.szemely_szemelyi_szam (congregation_id, szemelyi_szam);

CREATE INDEX IF NOT EXISTS idx_szemelyi_szam_congregation
  ON public.szemely_szemelyi_szam (congregation_id);

COMMENT ON TABLE public.szemely_szemelyi_szam IS
  '2026-09-05: a HIVATALOS állami személyi szám (romániai CNP vagy más '
  'országfüggő azonosító). SZÁNDÉKOSAN külön táblában, nem a szemely oszlopaként: '
  'a szemely sorait a taglista tömegesen olvassa, a szemely_cross_match_select '
  'policy pedig idegen gyülekezetnek is kiadja a teljes sort. A szemely.cnp ezzel '
  'szemben EGYHÁZI BELSŐ azonosító marad (és az id_apja/id_anyja idegen kulcs '
  'célpontja) — a kettő nem cserélhető fel.';

COMMENT ON COLUMN public.szemely_szemelyi_szam.szemelyi_szam IS
  'A hivatalos azonosító nyers értéke. A romániai CNP formátumát (13 jegy + '
  'ellenőrző összeg) az alkalmazás validálja; más ország azonosítóját nem.';

-- ── 2. RLS — SZŰKEBB, MINT A TÖBBI TÁBLÁÉ ──────────────────────────────────
--  ⚠️ TUDATOS ELTÉRÉS a repó szokásos `current_user_can_access_congregation()`
--     mintájától: az BEENGEDI a felettes szinteket (esperes, megyei/kerületi
--     admin) is. Egy ÁLLAMI azonosítónál ez túl tág — azt CSAK a tag SAJÁT
--     gyülekezetének aktív munkatársa láthatja. Ha Endre később mégis
--     szélesíteni akarja, az EGY policy cseréje.
ALTER TABLE public.szemely_szemelyi_szam ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS szemelyi_szam_sajat_gyulekezet ON public.szemely_szemelyi_szam;
CREATE POLICY szemelyi_szam_sajat_gyulekezet
  ON public.szemely_szemelyi_szam
  FOR ALL TO authenticated
  USING (
    congregation_id = public.current_user_congregation_id()
    AND public.current_user_is_active_staff()
  )
  WITH CHECK (
    congregation_id = public.current_user_congregation_id()
    AND public.current_user_is_active_staff()
  );

-- A tábla-szintű jog a `szemely` mintáját követi (oszlop-lista NÉLKÜL — a repó
-- dokumentált oka: egy kifelejtett oszlop néma elakadást okozna).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.szemely_szemelyi_szam TO authenticated;
REVOKE ALL ON public.szemely_szemelyi_szam FROM anon;

-- ── 3. MENTÉS-BESOROLÁS — KÖTELEZŐ ─────────────────────────────────────────
--  A repó szabálya: besorolatlan ÉLŐ tábla → a napi mentés FAIL-CLOSED megáll.
--  Réteg 4 (személy-függő), mert a `szemely` a 3. rétegben töltődik.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES (
  'szemely_szemelyi_szam', 'gyulekezet', 4, true,
  'A hivatalos állami személyi szám (CNP). Saját congregation_id-ja van. '
  'R4: a szemely (R3) UTÁN tölthető, mert idegen kulccsal mutat rá.'
)
ON CONFLICT (tabla) DO NOTHING;

COMMIT;

-- ── ELLENŐRZÉS — EGY RÁCS ──────────────────────────────────────────────────
-- (A Supabase SQL editor CSAK az UTOLSÓ rácsot mutatja, ezért UNION ALL.)
SELECT '1 · a tábla létrejött' AS kulcs,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema='public' AND table_name='szemely_szemelyi_szam')
            THEN '✅ igen' ELSE '⛔ NEM' END AS ertek
UNION ALL
SELECT '2 · RLS bekapcsolva',
       COALESCE((SELECT CASE WHEN c.relrowsecurity THEN '✅ igen' ELSE '⛔ NEM' END
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                 WHERE n.nspname='public' AND c.relname='szemely_szemelyi_szam'), '⛔ nincs tábla')
UNION ALL
SELECT '3 · a policy neve és típusa',
       COALESCE((SELECT string_agg(policyname || ' (' || CASE WHEN permissive='PERMISSIVE'
                                                             THEN 'permissive' ELSE 'restrictive' END || ')', ', ')
                 FROM pg_policies
                 WHERE schemaname='public' AND tablename='szemely_szemelyi_szam'), '⛔ NINCS policy')
UNION ALL
SELECT '4 · egyediségi index',
       COALESCE((SELECT string_agg(indexname, ', ')
                 FROM pg_indexes
                 WHERE schemaname='public' AND tablename='szemely_szemelyi_szam'), '⛔ nincs')
UNION ALL
SELECT '5 · mentés-besorolás',
       COALESCE((SELECT hatokor || ' / réteg ' || COALESCE(reteg::text,'NULL')
                 FROM public.backup_table_policy WHERE tabla='szemely_szemelyi_szam'),
                '⛔ BESOROLATLAN — a napi mentés meg fog állni!')
UNION ALL
SELECT '6 · a szemely.cnp ÉRINTETLEN maradt (sorok száma)',
       (SELECT count(*)::text FROM public.szemely)
UNION ALL
SELECT '7 · anon jogosultság (üresnek kell lennie)',
       COALESCE((SELECT string_agg(privilege_type, ', ')
                 FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name='szemely_szemelyi_szam'
                   AND grantee='anon'), '✅ nincs')
ORDER BY 1;
