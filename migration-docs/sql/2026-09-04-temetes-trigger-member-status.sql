-- ═══════════════════════════════════════════════════════════════════════════
--  A TEMETÉSI TRIGGER MOSTANTÓL A member_status-t IS ÁTVEZETI
--  2026-09-04 — Futtatja: Endre (Supabase SQL editor), EGYBEN
--
--  ELŐZMÉNY: az előző kör „C" szakasza átvezette az 54 eltemetettet
--  (`elhunyt: 1` → `elhunyt: 55`, a maradék eltérés 0). A TRIGGER viszont
--  változatlan maradt, tehát a KÖVETKEZŐ temetésnél újra elcsúszna.
--
--  A MOSTANI TÖRZS (a 2026-09-04-i felmérés írta ki, szó szerint):
--      BEGIN
--          UPDATE public.szemely
--          SET meghalt = true
--          WHERE id = NEW.id_szemely
--            AND meghalt = false;   -- „csak akkor írunk, ha még nem volt true"
--          RETURN NEW;
--      END;
--
--  KÉT BAJ VAN VELE:
--   1. A `member_status`-t NEM állítja. Az oszlop később került be
--      (`DEFAULT 'aktív'`), és a trigger sosem tanulta meg. Emiatt 55 temetési
--      sor mellett EGYETLEN ember volt 'elhunyt' — a többi 'aktív' maradt, és
--      torzította a létszámot, a VÁLASZTÓI NÉVJEGYZÉKET és a JÁRULÉK-ELVÁRÁST
--      (a rendszer halott tagtól is várt volna befizetést).
--   2. `AND meghalt = false` — ha a `meghalt` értéke NULL, ez a feltétel NEM
--      igaz (NULL = false → NULL), tehát a sor kimarad. Egy NULL-os régi sor
--      így SOHA nem kapta volna meg a jelölést.
--
--  ⛔ AMIT SZÁNDÉKOSAN NEM TESZÜNK: a temetési sor TÖRLÉSEKOR nem vonjuk vissza
--     az „elhunyt" állapotot. Egy téves törlés így nem támaszt fel senkit némán;
--     ha valóban tévedés volt, a lelkész kézzel állítja vissza a státuszt.
--     (Ez tudatos döntés, nem kifelejtés.)
--
--  A FÜGGVÉNYT cseréljük, a TRIGGERT nem: így a meglévő kötés (`trg_temetes_
--  set_meghalt`, a rá beállított eseményekkel együtt) érintetlen marad.
--  A biztonsági modell is változatlan: NEM SECURITY DEFINER, ahogy eddig sem.
--
--  FUTTATÁS: egyben, jelölés nélkül. Újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_szemely_meghalt_on_temetes()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
    -- Temetési sor személy nélkül is létezhet (pl. még nincs kiválasztva) —
    -- ilyenkor nincs kit megjelölni.
    IF NEW.id_szemely IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.szemely
    SET meghalt = true,
        member_status = 'elhunyt'
    WHERE id = NEW.id_szemely
      -- Csak akkor írunk, ha tényleg VÁLTOZIK valami (a régi optimalizáció
      -- szándéka), de NULL-tűrően: a `meghalt = false` alak a NULL-os sort
      -- kihagyta volna.
      AND (COALESCE(meghalt, false) = false
           OR COALESCE(member_status, '') <> 'elhunyt');

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.set_szemely_meghalt_on_temetes() IS
  'Temetési sor rögzítésekor a személyt elhunytnak jelöli: meghalt = true ÉS '
  'member_status = ''elhunyt''. 2026-09-04: a member_status átvezetése és a '
  'NULL-tűrő feltétel bekerült (előtte 55 temetés mellett 1 ember volt elhunyt).';

-- ── ELLENŐRZÉS — EGY RÁCS ─────────────────────────────────────────────────
SELECT '1 · a függvény átvezeti a member_status-t' AS kulcs,
       CASE WHEN p.prosrc ILIKE '%member_status%' THEN '✅ igen' ELSE '⛔ NEM' END AS ertek
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_szemely_meghalt_on_temetes'
UNION ALL
SELECT '2 · NULL-tűrő feltétel',
       CASE WHEN p.prosrc ILIKE '%COALESCE(meghalt%' THEN '✅ igen' ELSE '⛔ NEM' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_szemely_meghalt_on_temetes'
UNION ALL
SELECT '3 · a trigger kötése megmaradt',
       COALESCE((SELECT string_agg(tg.tgname, ', ')
                 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
                 JOIN pg_namespace n2 ON n2.oid = c.relnamespace
                 WHERE n2.nspname = 'public' AND c.relname = 'temetes'
                   AND NOT tg.tgisinternal), '⛔ NINCS trigger a temetes táblán')
UNION ALL
SELECT '4 · member_status értékkészlet (ellenőrzés)',
       COALESCE((SELECT string_agg(COALESCE(member_status,'NULL') || ': ' || n, ' | ' ORDER BY n DESC)
                 FROM (SELECT member_status, count(*) n FROM public.szemely GROUP BY 1) s), '—')
ORDER BY 1;
