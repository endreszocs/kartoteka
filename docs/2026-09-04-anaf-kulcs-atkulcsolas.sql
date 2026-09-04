-- ═══════════════════════════════════════════════════════════════════════════
--  SZÁLLÍTÓI SZÁMLÁK — ÁTKULCSOLÁS A RÉGI (ELSŐ-FUTAM) KULCSRÓL AZ ÚJRA (ÍR!)
--  2026-09-04 — Futtatja: Endre (Supabase Studio SQL Editor)
--
--  ELŐZMÉNY: a 2026-09-04-anaf-kulcs-valtas-diagnosztika.sql 2. blokkja
--  6 sort talált a régi (első számfutam) kulcson — 5 Electrica + 1 LIDL, mind
--  a Barátosi gyülekezetben — és MIND A HATNÁL `utkozik = false`. Vagyis az új
--  kulcs egyiknél sem foglalt: az átkulcsolás biztonságos.
--
--  MIÉRT OPCIONÁLIS: a kód kettős kulcsú duplikátum-ellenőrzést kapott, tehát
--  ezek a sorok átkulcsolás NÉLKÜL is védve vannak újraimport ellen. Az
--  átkulcsolás haszna: a tárolt `anaf_uuid` így az ANAF-index lesz — ugyanaz,
--  amit a PDF-párosító és a mostani kód használ, és ami a fájlnév végén áll.
--
--  MIT CSINÁL: KIZÁRÓLAG azokat a sorokat írja át, amelyek
--    (a) kapcsolt XML-fájllal állnak, (b) a fájlnévben 2+ számfutam van,
--    (c) a mai kulcs az ELSŐ futam, (d) az új kulcs NEM foglalt másik soron.
--  Az összeg, a dátum, a párosítás — SEMMI MÁS nem változik.
--
--  HOGYAN: egyben futtasd. A RETURNING kilistázza, mi változott — 6 sort várunk.
--  Ha 0 sor jön vissza, már megtörtént (idempotens: második futásra nem ír).
-- ═══════════════════════════════════════════════════════════════════════════

WITH sorok AS (
  SELECT sz.id, sz.congregation_id, sz.anaf_uuid, sz.szamla_szam, sz.szallito_nev, d.file_name,
         regexp_matches(regexp_replace(COALESCE(d.file_name, ''), '\.(zip|xml|pdf)+$', '', 'i'), '\d{8,}', 'g') AS futam
  FROM public.szallitoi_szamla sz
  JOIN public.gyulekezeti_dokumentum d ON d.id = sz.xml_dokumentum_id
),
futamok AS (
  SELECT id, congregation_id, anaf_uuid, szamla_szam, szallito_nev, file_name,
         array_agg(futam[1]) AS futamok
  FROM sorok GROUP BY 1,2,3,4,5,6
),
regi AS (
  SELECT *, futamok[array_length(futamok, 1)] AS uj_kulcs
  FROM futamok
  WHERE array_length(futamok, 1) >= 2
    AND anaf_uuid = futamok[1]
    AND futamok[1] <> futamok[array_length(futamok, 1)]
),
frissit AS (
  UPDATE public.szallitoi_szamla sz
  SET anaf_uuid = r.uj_kulcs
  FROM regi r
  WHERE sz.id = r.id
    -- ÜTKÖZÉS-ŐR: ha az új kulcs már egy MÁSIK soré, azt a sort NEM bántjuk.
    AND NOT EXISTS (
      SELECT 1 FROM public.szallitoi_szamla x
      WHERE x.congregation_id = sz.congregation_id AND x.anaf_uuid = r.uj_kulcs AND x.id <> sz.id
    )
  RETURNING sz.id, sz.szallito_nev, sz.szamla_szam, r.anaf_uuid AS regi_kulcs, sz.anaf_uuid AS uj_kulcs
)
SELECT
  (SELECT count(*) FROM frissit)::text || ' sor átkulcsolva' AS eredmeny,
  string_agg(szallito_nev || ' ' || szamla_szam || ': ' || regi_kulcs || ' → ' || uj_kulcs, E'\n' ORDER BY szamla_szam) AS reszletek
FROM frissit;
