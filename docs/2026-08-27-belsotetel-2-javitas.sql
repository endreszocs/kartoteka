-- ============================================================================
--  BELSŐ MOZGÁS JELÖLÉS (`szamadasicel.belsotetel`) — 2. LÉPÉS: JAVÍTÁS
--  2026-08-27 · Endre kérésére
--
--  ⛔ CSAK AKKOR FUTTASD, ha az 1. lépés (…-belsotetel-1-meres.sql) 1. szakasza
--     NULLA élő olvasót talált. Ha bármelyik nézet/függvény/trigger olvassa a
--     `belsotetel`-t, ez az UPDATE VISELKEDÉST VÁLTOZTATNA — akkor állj meg.
--
--  ── MI A HIBA, ÉS MIÉRT KELETKEZETT (mérve, nem tipp) ──────────────────────
--  A `2026-05-03-finance-belso-mozgas-INSTALL.sql` szamadasicel-INSERT
--  OSZLOPLISTÁJÁBÓL kimaradt a `belsotetel`. Ez a fájl hozta létre a
--  400.01 / 401.01 / 401.02 / 301.01 / 301.02 sorokat — mind NULL-lal.
--  A rá egy hónappal későbbi `2026-06-10-belso-mozgas-kodok-INSTALL.sql` már
--  beírta volna, DE a záró `ON CONFLICT (id) DO NOTHING` a MÁR LÉTEZŐ sorokat
--  érintetlenül hagyta. Ezért van kitöltve PONTOSAN az a kettő (300.01, 402.02),
--  amit a 06-10-i fájl maga hozott létre — és ezért NULL a másik három.
--
--  ── MIT JELENT AZ ÉRTÉK ───────────────────────────────────────────────────
--  ÖNMAGÁRA mutató JELÖLŐ, NEM a pár kódja. Öt független forrás igazolja:
--    · mind az 5 `befizetescel` sor a SAJÁT `id_szamadasicel`-jére mutat
--      (a 181-es a 301.01-re, pedig a párja a 400.01 volna);
--    · a sémában NINCS FK a `belsotetel`-en;
--    · a legacy költségvetés-nyomtatvány csak IGAZSÁGÉRTÉKET néz:
--      `if (c.belsotetel && String(c.belsotetel).trim() !== '') return true`
--      (migration-docs/source-links/penzugy_print_budget.js:65-70);
--    · a 2026-04-17-es seed generikusan másolja `s.belsotetel`-ként;
--    · nincs egyetlen `COMMENT ON COLUMN` sem, ami mást mondana.
--
--  ── ŐSZINTE ELVÁRÁS-KEZELÉS ───────────────────────────────────────────────
--  Ez a javítás EGYETLEN SZÁMOT SEM MOZGAT. A jelentések a belső mozgást
--  KÓD-ELŐTAG szerint zárják ki (`/^[34]/`, `100.xx`), nem e zászló alapján —
--  9 ilyen pont van 7 fájlban. A javítás értelme: (1) a katalógus konzisztens
--  és önmagát magyarázó lesz, (2) a legacy nyomtatvány-logika helyesen működne,
--  (3) aki később erre épít, nem kap félrevezető NULL-t.
--  ⚠️ NE keletkezzen az a látszat, hogy a zászló mostantól mérvadó — a kizárás
--     továbbra is a kód-előtag.
--
--  IDEMPOTENS: csak NULL-ról ír, meglévő értéket SOHA nem ír felül,
--  és kizárólag NEVESÍTETT kódokra (nincs LIKE — az más sort is eltalálhatna).
-- ============================================================================

BEGIN;

UPDATE public.szamadasicel
   SET belsotetel = id
 WHERE id IN ('300.01', '301.01', '301.02', '400.01', '401.01', '401.02', '402.02')
   AND belsotetel IS NULL;

-- Ellenőrzés MÉG A TRANZAKCIÓN BELÜL: ha bármelyik érintett sor NULL maradt,
-- vagy nem önmagára mutat, a tranzakció HIBÁVAL leáll és semmit nem ír.
DO $$
DECLARE
  hibas integer;
BEGIN
  SELECT count(*) INTO hibas
    FROM public.szamadasicel
   WHERE id IN ('300.01', '301.01', '301.02', '400.01', '401.01', '401.02', '402.02')
     AND (belsotetel IS NULL OR belsotetel <> id);
  IF hibas > 0 THEN
    RAISE EXCEPTION
      'A belsotetel-javitas nem teljes: % sor maradt NULL vagy nem onmagara mutat. Visszagorgetve.',
      hibas;
  END IF;
END $$;

COMMIT;

-- ── UTÓ-ELLENŐRZÉS (a COMMIT után, külön rács) ────────────────────────────
SELECT s.id                                   AS kod,
       s.type                                 AS tipus,
       COALESCE(s.belsotetel, '### NULL ###')  AS belsotetel,
       s.aktiv                                AS aktiv,
       (CASE WHEN s.belsotetel = s.id THEN 'OK — önmagára mutat'
             WHEN s.belsotetel IS NULL THEN '### MARADT NULL ###'
             ELSE '### ELTÉRŐ: ' || s.belsotetel || ' ###' END) AS ellenorzes,
       s.nev                                  AS nev
  FROM public.szamadasicel s
 WHERE s.id IN ('300.01', '301.01', '301.02', '400.01', '401.01', '402.02', '401.02')
 ORDER BY s.id;

-- ============================================================================
--  ⚠️ AMIT SZÁNDÉKOSAN NEM JAVÍTOK ITT — külön döntést igényel
--
--  A `401.01` sor `type = 'B'` (bevétel), miközben a neve szerint a pénz a
--  BANKBÓL távozik, és az app KIADÁS-célként használja. A hivatalos Excel
--  katalógusában is a KIADÁS-oldali (4xx) blokkban áll.
--  UGYANAZ A GYÖKÉROK: a 2026-06-10-i telepítő már `'K'`-t akart írni, de az
--  `ON CONFLICT (id) DO NOTHING` a teljes UPDATE-et elnyelte.
--
--  MIÉRT NEM ÍROM ÁT MOST: a `type` oszlopból seedelődnek a junction-táblák
--  (`befizetescel` / `kiadascel`), és a `type` több helyen vezérel logikát.
--  Ez tehát NEM kozmetika, hanem viselkedést érintő változtatás — külön
--  mérés és külön jóváhagyás kell hozzá.
--  Az élő adatban ma nem üt ki (a junction-sorok már léteznek), de egy FRISS
--  telepítésnél vagy DB-visszaállításnál elsülhet.
-- ============================================================================
