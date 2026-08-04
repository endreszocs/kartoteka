-- ============================================================================
-- PR-42 — elhunytak a háztartásban: ELLENŐRZÉS és (opcionális) JAVÍTÁS
-- 2026-08-04
--
-- HÁTTÉR
-- A temetés eddig lezárta az elhunyt háztartás-tagságát, de a családi karton
-- (csalad.id_ferfi / id_no) nem takarítódott — ezért a következő
-- háztartás-szinkron az elhunytat ÚJRA felvette élő tagként. Az alkalmazás
-- oldalán ez a PR-42-vel megszűnt (a szinkron kihagyja az elhunytakat).
--
-- AMI MÉG NYITOTT: az adatbázis-oldali `sync_households_from_csalad` eljárás —
-- amit CSAK a három import-útvonal hív — ugyanígy visszateheti az elhunytat.
-- Az eljárás teljes átírása külön kört érdemel; addig ez a fájl megmutatja,
-- érint-e ez bárkit ténylegesen, és fel is takarítja.
--
-- HASZNÁLAT
-- 1) Futtasd le az 1. részt (csak OLVAS). Ha 0 sort ad, nincs teendő.
-- 2) Ha ad sorokat, nézd át őket, és CSAK utána futtasd a 2. részt.
-- ============================================================================

-- ── 1. rész — ELLENŐRZÉS (csak olvas) ───────────────────────────────────────
-- Kiket tart a rendszer élő háztartás-tagként úgy, hogy elhunytként vannak
-- nyilvántartva?

SELECT
  sz.id                         AS szemely_id,
  sz.csaladnev || ' ' || sz.k_nev AS nev,
  sz.meghalt,
  sz.member_status,
  ht.id                         AS haztartas_tag_id,
  ht.szerep,
  ht.ervenyes_tol,
  h.legacy_csalad_id            AS csalad_id
FROM public.haztartas_tag ht
JOIN public.haztartas h ON h.id = ht.id_haztartas
JOIN public.szemely  sz ON sz.id = ht.id_szemely
WHERE ht.ervenyes_ig IS NULL                    -- élő tagságként szerepel
  AND (sz.meghalt = true OR sz.member_status = 'elhunyt')
ORDER BY sz.csaladnev, sz.k_nev;

-- ── 2. rész — JAVÍTÁS (ÍR! csak az 1. rész átnézése után futtasd) ───────────
-- A fenti tagságokat lezárja. A halálozás dátumát a temetési bejegyzésből
-- veszi; ha nincs ilyen, a mai napot használja.
-- FONTOS: a vér szerinti szülő-gyermek kapcsolatokhoz NEM nyúl — az elhunyt
-- szülőnek látszania KELL a családfán.
--
-- A futtatáshoz töröld a sor eleji /* és a végi */ jeleket.
/*
UPDATE public.haztartas_tag ht
SET ervenyes_ig = COALESCE(
      (SELECT MAX(t.hdatum) FROM public.temetes t WHERE t.id_szemely = ht.id_szemely),
      CURRENT_DATE)
FROM public.szemely sz
WHERE sz.id = ht.id_szemely
  AND ht.ervenyes_ig IS NULL
  AND (sz.meghalt = true OR sz.member_status = 'elhunyt');
*/
