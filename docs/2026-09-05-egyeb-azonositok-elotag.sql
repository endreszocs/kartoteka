-- ═══════════════════════════════════════════════════════════════════════════
--  A 48 „EGYÉB" AZONOSÍTÓ ELŐTAGJA — az utolsó hiányzó adat
--  2026-09-05 — Futtatja: Endre (Supabase SQL editor)
--
--  MIÉRT: az alak `AA-AAAA-99A` és `AA-AAAA-99A9` — vagyis KÉT BETŰ, kötőjel,
--  NÉGY BETŰ, kötőjel, majd számok/betűk. Ez pontosan az `EC-ÉÉÉÉ-…` szerkezete,
--  csak a középső szegmensben BETŰ áll évszám helyett. Feltehetően egy KORÁBBI
--  generátor-változat, ami a gyülekezet rövidítését tette oda az év helyett.
--
--  Ha ez igaz, akkor ez a 48 ember is RENDSZER ÁLTAL GENERÁLT kódot visel —
--  és a felületnek nem szabad rájuk „személyes adatnak tűnő érték" megjegyzést
--  írnia. Egyetlen minta-bővítés orvosolja, de látnom kell a szerkezetet.
--
--  ⚠️ SZEMÉLYES ADATOT NEM AD KI: csak az előtagot és a középső SZEGMENST
--     mutatja (ezek gyülekezet-/rendszer-kódok), az egyedi végződést nem.
--     A mérés már bizonyította, hogy ezek között NINCS 13 jegyű valódi CNP,
--     nincs szóköz és nincs ékezet.
--
--  ⚠️ CSAK OLVAS.
-- ═══════════════════════════════════════════════════════════════════════════

WITH egyeb AS (
  SELECT s.cnp
  FROM public.szemely s
  WHERE s.cnp IS NOT NULL
    AND btrim(s.cnp) <> ''
    AND s.cnp !~ '^EC-[0-9]{4}-'
    AND s.cnp !~ '^999[0-9]{7}$'
    AND s.cnp !~ '^[0-9]{13}$'
)

SELECT '1 · előtag (első 2 karakter): ' || left(cnp, 2) AS kulcs,
       count(*)::text || ' db' AS ertek
FROM egyeb GROUP BY left(cnp, 2)

UNION ALL
SELECT '2 · középső szegmens: ' || split_part(cnp, '-', 2),
       count(*)::text || ' db'
FROM egyeb GROUP BY split_part(cnp, '-', 2)

UNION ALL
SELECT '3 · hány szegmensre bomlik kötőjelnél',
       (SELECT string_agg(DISTINCT (array_length(string_to_array(cnp, '-'), 1))::text, ', ') FROM egyeb)

UNION ALL
-- Kontroll: az EC-ÉÉÉÉ- alakúak középső szegmense (ezekkel vetjük össze).
SELECT '4 · kontroll — az EC-ÉÉÉÉ- alakúak évszámai',
       COALESCE((SELECT string_agg(ev || ' (' || db || ')', ', ' ORDER BY ev)
                 FROM (SELECT split_part(cnp, '-', 2) AS ev, count(*)::text AS db
                       FROM public.szemely
                       WHERE cnp ~ '^EC-[0-9]{4}-'
                       GROUP BY 1) k), '—')

ORDER BY 1;
