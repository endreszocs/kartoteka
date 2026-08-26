-- ============================================================================
-- TÁJÉKOZTATÓ LISTÁK a gyülekezeti weboldal köréhez (2026-08-27)
--
-- CSAK OLVAS. A migráció UTÁN futtatandó.
--
-- ⚠️ NE FUTTASD EGYBEN! A Supabase SQL editor egy szkriptből CSAK AZ UTOLSÓ
--    lekérdezés rácsát mutatja. Jelöld ki az „A." blokkot → Run → nézd meg,
--    aztán a „B."-t, végül a „C."-t. Mindhárom más oszlopalakú, ezért nem
--    vonhatók össze egyetlen lekérdezésbe.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- A. ⚠️ ADATVÉDELMI ÁTNÉZÉS — mely NYILVÁNOS program LEÍRÁSA megy ki?
--
--    Endre 2026-08-27-i kérésére a nyilvánosnak jelölt programok leírása
--    mostantól MEGJELENIK a weboldalon és a letölthető naptárfájlban.
--    (A belső `megjegyzes` továbbra sem hagyja el a rendszert.)
--    Ha valamelyik szöveg nem való a nyilvánosság elé: vagy a leírást írd át,
--    vagy vedd ki a programot a nyilvánosak közül (Határidőnapló → program →
--    „Megjelenhet a gyülekezet weboldalán").
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.nev_hu AS gyulekezet,
       gp.datum,
       gp.cim,
       left(gp.leiras, 160) AS leiras_eleje
FROM public.gyulekezeti_programok gp
JOIN public.congregations c ON c.id = gp.congregation_id
WHERE gp.publikus = true
  AND NULLIF(btrim(gp.leiras), '') IS NOT NULL
ORDER BY c.nev_hu, gp.datum;


-- ────────────────────────────────────────────────────────────────────────────
-- B. Miért üres a „Következő alkalom"? — a kapuk gyülekezetenként.
--
--    Ha a `nyilvanos_program` 0, a weboldal HELYESEN nem mutat semmit: a
--    határidőnaplóban kell bekapcsolni a programokon a „Megjelenhet a
--    gyülekezet weboldalán" kapcsolót.
--
--    ⚠️ A `gyulekezet_kapuja` oszlop KÜLÖN látszik. A ma élő, közvetlen
--    olvasási ág CSAK az `is_published`-öt nézi, a tartalék-RPC viszont a
--    gyülekezet aktív/engedélyezett állapotát is. Ha ez a kettő széthúz, az
--    oldal LÁTSZIK, de a címer/elérhetőség tartalék némán üres marad — ezért
--    mutatjuk meg, ahelyett hogy találgatni kelljen.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.nev_hu AS gyulekezet,
       ps.slug,
       ps.is_published AS oldal_kozzeteve,
       ps.show_events AS esemenyek_bekapcsolva,
       CASE WHEN c.status = 'active' AND c.public_site_enabled
            THEN '✅ nyitva'
            ELSE '⚠️ ZÁRVA — a tartalék-RPC nem ad adatot (status=' || c.status ||
                 ', public_site_enabled=' || c.public_site_enabled || ')' END AS gyulekezet_kapuja,
       count(gp.id) FILTER (WHERE gp.publikus) AS nyilvanos_program,
       count(gp.id) AS osszes_program
FROM public.public_sites ps
JOIN public.congregations c ON c.id = ps.congregation_id
LEFT JOIN public.gyulekezeti_programok gp ON gp.congregation_id = ps.congregation_id
WHERE ps.is_published = true
GROUP BY c.nev_hu, ps.slug, ps.is_published, ps.show_events, c.status, c.public_site_enabled
ORDER BY c.nev_hu;


-- ────────────────────────────────────────────────────────────────────────────
-- C. ⚠️ ADATVÉDELMI ÁTNÉZÉS — mit publikálna PONTOSAN a tartalék?
--
--    A weboldalon ÜRESEN hagyott mezők helyére ezek az értékek kerülnek a
--    gyülekezeti adatokból. Ha egy gyülekezet SZÁNDÉKOSAN hagyta üresen
--    valamelyiket, itt látszik, mi jelenne meg helyette — és a
--    Publikus oldal → Elérhetőség szerkesztőben felülírható.
--
--    ⚠️ LEFT JOIN LATERAL, nem CROSS JOIN: a CROSS JOIN pont azokat a sorokat
--    TÜNTETNÉ EL, ahol a tartalék semmit nem ad — vagyis a bukó eseteket.
-- ────────────────────────────────────────────────────────────────────────────
SELECT ps.slug,
       CASE WHEN f.crest_image_url IS NOT NULL THEN '✅ van' ELSE '— nincs' END AS cimer,
       f.contact_email,
       f.contact_phone,
       f.address,
       CASE WHEN f.slug_talalt IS NULL
            THEN '⚠️ A TARTALÉK 0 SORT AD erre az oldalra (lásd a B. lista kapuját)'
            ELSE '' END AS megjegyzes
FROM public.public_sites ps
LEFT JOIN LATERAL (
  SELECT x.*, true AS slug_talalt
  FROM public.public_site_congregation_fallback(ps.slug) x
) f ON true
WHERE ps.is_published = true
ORDER BY ps.slug;
