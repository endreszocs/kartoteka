-- ═══════════════════════════════════════════════════════════════════════════
-- ZÁRT ÉV — DB-SZINTŰ INSERT-KAPU (D9 + D10, pénzügyi audit 2026-08-28)
--
-- MIÉRT:
--   (D9) A véglegesített évbe ÚJ tétel INSERT-jét eddig SEMMILYEN DB-szintű
--   kapu nem tiltotta — a 2026-08-15-i RESTRICTIVE policy csak az
--   UPDATE…deleted=true-t fogta. A zár teljes egészében az app-rétegen állt:
--   egy régi desktop-kliens vagy egy nyers PostgREST-hívás a lelkész által
--   már beküldött évbe könyvelhetett, és a beadott számadás némán elavult.
--   (D10) Az app-oldali zárt-év ellenőrzés és az insert nem egy tranzakció
--   (TOCTOU): egy éppen futó véglegesítés közben rögzített tétel kicsúszhat
--   a pillanatképből. A BEFORE INSERT trigger mindkettőt zárja: az insert
--   PILLANATÁBAN, UGYANABBAN a tranzakcióban olvassa a zár-állapotot.
--
-- MIT CSINÁL:
--   Közös trigger-függvény + BEFORE INSERT trigger a befizetes ÉS a kiadas
--   táblán. Ha a tétel dátum-évének bealitas-sora accounting_finalized=true,
--   az INSERT hibával áll meg. SZÁNDÉKOSAN CSAK az accounting_finalized zár:
--   a költségvetés (budget_finalized) az év ELEJÉN véglegesül — arra zárni
--   az egész évi normál rögzítést fogná.
--
-- MIT NEM CSINÁL:
--   - Meglévő adatot NEM ír át; UPDATE-et/DELETE-et nem érint (arra a
--     2026-08-15-i RESTRICTIVE policy a kapu).
--   - A belsomozgas mester-táblát nem fogja (származtatott nyilvántartás —
--     az egyenleget a befizetes/kiadas pár hordozza, azt a trigger védi).
--   - A feloldás (accounting_finalized=false) után automatikusan enged —
--     élő állapotot olvas, nincs külön teendő.
--
-- MELLÉKHATÁS: az import_finance_batch RPC insertjei is e trigger alatt
--   futnak. Az RPC app-kapuja a zárt évet már előbb elutasítja; ha mégis
--   átcsúszna egy zárt-évi sor, a trigger a TELJES batch-et visszagörgeti —
--   hangos hiba, nem féloldalas import.
--
-- SORREND: bármikor futtatható (az app nem függ tőle — defense-in-depth).
-- FUTTATÁS: Supabase SQL editor, egyben. Újrafuttatható (DROP+CREATE páros).
-- Az ellenőrző rács a fájl VÉGÉN, EGY eredményrácsban (UNION ALL).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_zart_ev_insert_tiltas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $zart_ev$
DECLARE
  v_ev text;
  v_zart boolean;
BEGIN
  -- Az év a tétel dátumából (befizetes.datum DATE, kiadas.datum TIMESTAMP —
  -- a to_char mindkettőn az évet adja).
  IF NEW.datum IS NULL THEN
    RETURN NEW; -- dátum nélküli sort a NOT NULL / app-validálás fog el
  END IF;
  v_ev := to_char(NEW.datum, 'YYYY');

  SELECT (b.accounting_finalized IS TRUE)
    INTO v_zart
    FROM public.bealitas b
    WHERE b.congregation_id = NEW.congregation_id
      AND b.id = v_ev;

  -- Nincs bealitas-sor az évre → az év nincs konfigurálva, tehát
  -- véglegesítve sincs → engedjük.
  IF COALESCE(v_zart, false) THEN
    RAISE EXCEPTION 'zart_ev_insert: a % evi szamadas veglegesitve (es bekuldve) van — ebbe az evbe uj tetel nem rogzitheto. Kerj feloldast (javitasi engedelyt) az egyhazmegyetol.', v_ev;
  END IF;

  RETURN NEW;
END;
$zart_ev$;

COMMENT ON FUNCTION public.tg_zart_ev_insert_tiltas() IS
  'D9+D10 (2026-08-28): BEFORE INSERT kapu a befizetes/kiadas táblán — véglegesített (accounting_finalized) évbe DB-szinten sem szúrható új tétel. Az insert pillanatában, ugyanabban a tranzakcióban olvassa a zárat (TOCTOU-mentes). A budget_finalized-ra SZÁNDÉKOSAN nem zár (év eleji véglegesítés — az évközi rögzítést fogná).';

DROP TRIGGER IF EXISTS trg_zart_ev_insert_befizetes ON public.befizetes;
CREATE TRIGGER trg_zart_ev_insert_befizetes
  BEFORE INSERT ON public.befizetes
  FOR EACH ROW EXECUTE FUNCTION public.tg_zart_ev_insert_tiltas();

DROP TRIGGER IF EXISTS trg_zart_ev_insert_kiadas ON public.kiadas;
CREATE TRIGGER trg_zart_ev_insert_kiadas
  BEFORE INSERT ON public.kiadas
  FOR EACH ROW EXECUTE FUNCTION public.tg_zart_ev_insert_tiltas();

-- ═══════════════════════════════════════════════════════════════════════════
-- ELLENŐRZŐ RÁCS — EGY eredményrácsban (a Supabase editor csak az utolsót
-- mutatja). Minden sor „✅ …" vagy „⛔ …" kezdetű.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'tg_zart_ev_insert_tiltas'
      AND p.prosrc LIKE '%accounting_finalized%'
      AND p.prosrc NOT LIKE '%budget_finalized%'
  ) THEN '✅ 1. tg_zart_ev_insert_tiltas létezik, és CSAK az accounting-zárra figyel'
    ELSE '⛔ 1. a trigger-függvény hiányzik vagy rossz zárra figyel' END AS ellenorzes
UNION ALL
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'trg_zart_ev_insert_befizetes' AND c.relname = 'befizetes' AND NOT t.tgisinternal
  ) THEN '✅ 2. trigger a befizetes táblán'
    ELSE '⛔ 2. a befizetes-trigger HIÁNYZIK' END
UNION ALL
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname = 'trg_zart_ev_insert_kiadas' AND c.relname = 'kiadas' AND NOT t.tgisinternal
  ) THEN '✅ 3. trigger a kiadas táblán'
    ELSE '⛔ 3. a kiadas-trigger HIÁNYZIK' END
UNION ALL
SELECT
  CASE WHEN (
    SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE t.tgname IN ('trg_zart_ev_insert_befizetes', 'trg_zart_ev_insert_kiadas')
      AND t.tgenabled = 'O'
  ) = 2
  THEN '✅ 4. mindkét trigger engedélyezve (ORIGIN)'
  ELSE '⛔ 4. valamelyik trigger le van tiltva' END
ORDER BY 1;
