-- KARTOTEKA — Leltári szám egyediségi index (2026-08-09)
-- Futtatja: Endre (Supabase Studio SQL Editor)
--
-- Háttér: a leltári szám-generátor (web: leltar/actions.ts és penzugy/actions.ts)
-- „utolsó + 1" logikával működik, DB-szintű védelem nélkül — két párhuzamos
-- mentés ugyanazt a számot kaphatta, és a PostgREST 1000 soros plafonja miatt
-- 1000+ tételnél (pl. könyvtár, 'K-%') már kiadott szám is ismétlődhetett.
-- A kód-oldali javítás (lapozott olvasás + ütközésnél új számmal újrapróbálkozás)
-- a v0.9.156-ban él; EZ az index adja a DB-szintű garanciát (a 23505-ös
-- ütközésre épül az újrapróbálkozás).
--
-- ⚠️ SORREND:
--   1. ELŐSZÖR futtasd az 1. (ellenőrző) lekérdezést.
--   2. Ha az üres → futtasd a 2. lépést (index létrehozása).
--   3. Ha NEM üres → a 1/b sablonnal számozd át a duplikátumokat, majd 2. lépés.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vannak-e MÁR MOST duplikált leltári számok? (aktív, nem törölt tételek)
-- ────────────────────────────────────────────────────────────────────────────

SELECT
    lt.congregation_id,
    COALESCE(c.nev_hu, c.name) AS gyulekezet,
    lt.leltari_szam,
    COUNT(*) AS db,
    array_agg(lt.id ORDER BY lt.created_at) AS tetel_id_k,
    array_agg(lt.megnevezes ORDER BY lt.created_at) AS megnevezesek
FROM public.leltar_tetelek lt
LEFT JOIN public.congregations c ON c.id = lt.congregation_id
WHERE lt.leltari_szam IS NOT NULL
  AND COALESCE(lt.is_deleted, false) = false
GROUP BY lt.congregation_id, c.nev_hu, c.name, lt.leltari_szam
HAVING COUNT(*) > 1
ORDER BY gyulekezet, lt.leltari_szam;

-- 1/b. HA az 1. lekérdezés talált duplikátumot: az ÚJABB tétel átszámozása.
-- A <TETEL_ID> és <UJ_SZAM> értékét az 1. eredményéből töltsd ki (az újabb
-- tétel kapjon új számot; az új szám = az adott prefix legnagyobb száma + 1).
--
-- UPDATE public.leltar_tetelek
-- SET leltari_szam = '<UJ_SZAM>'          -- pl. 'K-1042'
-- WHERE id = '<TETEL_ID>';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Egyediségi index (részleges: csak aktív, számmal rendelkező tételekre)
-- ────────────────────────────────────────────────────────────────────────────
--
-- Részleges index: a törölt tételek száma újra kiadható marad (a törlés soft
-- delete), és a NULL számú (régi, még számozatlan) sorok sem ütköznek.

CREATE UNIQUE INDEX IF NOT EXISTS leltar_tetelek_cong_leltari_szam_key
    ON public.leltar_tetelek (congregation_id, leltari_szam)
    WHERE leltari_szam IS NOT NULL
      AND COALESCE(is_deleted, false) = false;

-- ────────────────────────────────────────────────────────────────────────────
-- === ELLENŐRZÉS ===
-- ────────────────────────────────────────────────────────────────────────────

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leltar_tetelek'
  AND indexname = 'leltar_tetelek_cong_leltari_szam_key';
-- Várt: 1 sor, a fenti partial unique index definíciójával.
