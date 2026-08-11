-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — ZÁRÓ PILLANATKÉP EGYESÍTÉSE
-- „A véglegesítéskor két különböző pillanatkép készül, és nem egyeznek."
-- Dátum: 2026-08-11 (6. kör)   ·   Tulajdonosi döntés: „javítsd"
-- Futtatja: Endre (Supabase Studio → SQL Editor)
--
-- ─── MI VOLT A HIBA? ───────────────────────────────────────────────────────
--
-- A számadás véglegesítése (apps/web/app/(dashboard)/penzugy/actions.ts,
-- `finalizeAccounting`) KÉT, egymástól független záró-adatot gyártott ugyanarra
-- az évre:
--
--   (a) SZERVEROLDALI ÖSSZESÍTÉS — nyers junction-FK-id kulcsokkal
--       (`id_befizetescel` / `id_kiadascel` egész számok), és a hivatalos ív
--       végpont-kódjaira SEMMILYEN szűrés nélkül. Tehát beleszámolta a hivatalos
--       íven KÍVÜLRE könyvelt tételeket és a kategória nélküli sorokat is.
--       → ez ment a `bealitas.szamadas_zaro_adatok` mezőbe, `totalIncome` /
--         `totalExpense` néven; a kanonikus adatot egy `kanonikus` alobjektumba
--         tette MELLÉ.
--
--   (b) KANONIKUS PILLANATKÉP — a véglegesítő varázsló (AccountingTab) kód-
--       kulcsú, a hivatalos ív végpont-kódjaira szűrt, stornó és belső mozgás
--       nélküli összesítése.
--       → EZ ment be az egyházmegyének (`document_submissions.snapshot_data`),
--         és ez áll a gyülekezetnél ALÁÍRT, kinyomtatott Számadáson.
--
-- A kettő minden olyan gyülekezetnél SZÉTHÚZOTT, ahol volt a hivatalos íven
-- kívülre könyvelt tétel. És mivel a LELKÉSZI JELENTÉS VII.6 (összes bevétel) és
-- VII.7 (összes kiadás) rubrikája az (a) számot olvassa, a lelkész aláírt éves
-- jelentése MÁS végösszeget mutatott, mint az ugyanarra az évre beküldött
-- Számadás. Ez eltérés KÉT HIVATALOS NYOMTATVÁNY KÖZÖTT.
--
-- Súlyosbító körülmény: a kódban ott állt egy visszaesés a kanonikus értékre
-- (`kanonikus.totalIncome`), de az SZERKEZETILEG HALOTT volt — a tárolt
-- `kanonikus` alobjektum `totalActualIncome` / `totalActualExpense` néven
-- hordozza az összegeket, `totalIncome` kulcs SOSEM volt benne.
--
-- ─── MI A JAVÍTÁS? ─────────────────────────────────────────────────────────
--
-- KÓD (már megtörtént; ez az SQL csak a MÁR TÁROLT adatot rendezi):
--   · `finalizeAccounting` gyülekezeti ágon MOSTANTÓL a kanonikus pillanatképet
--     tárolja hivatalos záró-adatként, és VISSZAADJA a hívónak;
--   · `finalizeAndSubmitAccounting` PONTOSAN ezt az objektumot küldi be —
--     nincs második számítás, tehát nem is húzhat szét;
--   · a szerveroldali összesítés nem vész el: `szerverEllenorzes` néven
--     KERESZTELLENŐRZÉSKÉNT kerül a pillanatképbe (így utólag is látszik,
--     mennyi pénz esett a hivatalos íven kívülre a zárás pillanatában);
--   · a lelkészi jelentés VII.6/VII.7 olvasója MINDKÉT alakot ismeri, tehát
--     EZ AZ SQL NEM ELŐFELTÉTELE a javításnak — a felület e nélkül is helyes
--     számot mutat.
--
-- MIÉRT KELL AKKOR MÉGIS EZ AZ SQL?
--   1. A tárolt blob HIVATALOS IRAT. Amíg egy `totalIncome` nevű mező rossz
--      számot hordoz benne, a következő olvasó ugyanabba a csapdába lép —
--      pontosan ez szülte ezt a hibát.
--   2. A desktop offline másolat (`bealitas_local`) szó szerint átveszi a JSON-t
--      a szerverről: a szerver rendezésével a desktop is rendeződik a következő
--      szinkronnál.
--   3. A biztonsági mentés / visszaállítás is ezt a blobot viszi tovább.
--
-- ─── A FÁJL SZAKASZAI ──────────────────────────────────────────────────────
-- ⚠️ A Supabase SQL Editor CSAK AZ UTOLSÓ utasítás eredményét mutatja. Ezért
--    minden ellenőrzés EGYETLEN SELECT (UNION ALL-lal fűzve), és a szakaszokat
--    EGYESÉVEL jelöld ki és futtasd (Ctrl+Enter).
--
--   0. SZAKASZ — ÁLLAPOTFELMÉRÉS (CSAK OLVAS) — futtasd ELŐSZÖR
--   1. SZAKASZ — MENTÉS + MIGRÁCIÓ (egy BEGIN/COMMIT, idempotens)
--   2. SZAKASZ — UTÓELLENŐRZÉS (CSAK OLVAS)
--   3. SZAKASZ — ⛔ VISSZAÁLLÍTÁS — ÉLES SQL, tokenhez kötve
--
-- ELVEK: idempotens (újrafuttatható), egy tranzakció, a régi értéket külön
-- mentés-táblába tesszük, adatot NEM dobunk el. Minden JSON→szám átalakítás
-- `jsonb_typeof(...) = 'number'` kapun megy át, hogy egy elgépelt/szöveges mező
-- ne az EGÉSZ ellenőrzést vagy migrációt döntse el.
-- ════════════════════════════════════════════════════════════════════════════



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0. SZAKASZ — ÁLLAPOTFELMÉRÉS                                             ║
-- ║ CSAK OLVAS. EGYETLEN SELECT — az eredménye nem nyelhető el.              ║
-- ║ Ezt futtasd ELŐSZÖR, és az eredményt mentsd a _RUN_LOG.md-be.            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

with zaro as (
  select
    b.id,
    b.congregation_id,
    coalesce(b.accounting_finalized, false)                             as lezart,
    b.szamadas_zaro_adatok                                              as blob,
    b.szamadas_zaro_adatok -> 'kanonikus'                               as kan,
    -- Van-e `kanonikus` alobjektum? (= RÉGI, 1-es alak jele)
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object')    as regi_alak,
    -- Már migrált (2-es) alak?
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
       and (b.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2)     as uj_alak,
    -- A felső szintű (RÉGI alakban: NYERS) végösszegek
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'totalIncome') = 'number'
         then (b.szamadas_zaro_adatok ->> 'totalIncome')::numeric end   as felso_bev,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'totalExpense') = 'number'
         then (b.szamadas_zaro_adatok ->> 'totalExpense')::numeric end  as felso_kia,
    -- A kanonikus (HIVATALOS, beküldött) végösszegek
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus' -> 'totalActualIncome') = 'number'
         then (b.szamadas_zaro_adatok -> 'kanonikus' ->> 'totalActualIncome')::numeric end   as hiv_bev,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus' -> 'totalActualExpense') = 'number'
         then (b.szamadas_zaro_adatok -> 'kanonikus' ->> 'totalActualExpense')::numeric end  as hiv_kia
  from public.bealitas b
  where jsonb_typeof(b.szamadas_zaro_adatok) = 'object'
    and b.szamadas_zaro_adatok <> '{}'::jsonb
)
select *
from (

  -- 1) Van-e egyáltalán tárolt záró-adat? ------------------------------------
  select
    1 as sorszam,
    'Tárolt záró-adattal rendelkező gyülekezet-évek (összesen)' as ellenorzes,
    count(*)::text as ertek,
    'Ennyi évhez van egyáltalán pillanatkép. A többi sor ezen belül bont.' as mit_jelent
  from zaro

  union all

  -- 2) RÉGI (1-es) alakú sorok ------------------------------------------------
  select
    2,
    'RÉGI alak (van `kanonikus` alobjektum) — ezeket rendezi az 1. SZAKASZ',
    count(*)::text,
    'A felső szintű totalIncome/totalExpense itt a NYERS, ív-szűrés nélküli összeg. A hivatalos szám a `kanonikus` alobjektumban ül.'
  from zaro
  where regi_alak and not uj_alak

  union all

  -- 3) Ebből MENNYINÉL tér el ténylegesen a két szám? -------------------------
  -- EZ A LÉNYEG: ennyi lelkészi jelentés VII.6/VII.7 rubrikája mutatott ma más
  -- számot, mint az ugyanarra az évre beküldött Számadás.
  select
    3,
    '⚠️ ELTÉRŐ: a lelkészi jelentés VII.6/VII.7 mást mutat, mint a beküldött Számadás',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(distinct congregation_id::text || '/' || id, ', '),
      'Nincs ilyen — a két szám mindenhol egyezett.'
    )
  from zaro
  where regi_alak and not uj_alak
    and (
      coalesce(felso_bev, 0) is distinct from coalesce(hiv_bev, 0)
      or coalesce(felso_kia, 0) is distinct from coalesce(hiv_kia, 0)
    )

  union all

  -- 4) MEKKORA az eltérés lejben? --------------------------------------------
  select
    4,
    'Az eltérés nagysága gyülekezet-évenként (RON)',
    coalesce(
      string_agg(
        congregation_id::text || '/' || id ||
        ' — bevétel: nyers ' || to_char(coalesce(felso_bev, 0), 'FM999G999G999D00') ||
        ' vs hivatalos ' || to_char(coalesce(hiv_bev, 0), 'FM999G999G999D00') ||
        ' · kiadás: nyers ' || to_char(coalesce(felso_kia, 0), 'FM999G999G999D00') ||
        ' vs hivatalos ' || to_char(coalesce(hiv_kia, 0), 'FM999G999G999D00'),
        ' | ' order by congregation_id, id
      ),
      '—'
    ),
    'A „nyers" az, ami ma a lelkészi jelentésben áll; a „hivatalos" az, ami a beküldött és aláírt Számadáson. A migráció után mindenhol a HIVATALOS szám marad.'
  from zaro
  where regi_alak and not uj_alak
    and (
      coalesce(felso_bev, 0) is distinct from coalesce(hiv_bev, 0)
      or coalesce(felso_kia, 0) is distinct from coalesce(hiv_kia, 0)
    )

  union all

  -- 5) Már ÚJ (2-es) alakú sorok ----------------------------------------------
  select
    5,
    'ÚJ alak (alakVerzio = 2) — ezekhez a migráció nem nyúl',
    count(*)::text,
    'Ezeket már a javított kód írta (vagy egy korábbi futtatás rendezte). Idempotens: az újrafuttatás kihagyja őket.'
  from zaro
  where uj_alak

  union all

  -- 6) ŐS-alak: se `kanonikus`, se kanonikus kulcs ----------------------------
  select
    6,
    'ŐS-alak: kanonikus pillanatkép NÉLKÜL lezárt év — NEM javítható SQL-ből',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(distinct congregation_id::text || '/' || id, ', ') ||
      ' — ezeknél a hivatalos, ív-szűrt összeg SOSEM került eltárolásra (2026-07-10 előtt lezárt év, vagy desktopról indított zárás). A lelkészi jelentés a nyers összeget mutatja. Ha pontos szám kell, az évet fel kell oldatni és újra véglegesíteni.',
      'Nincs ilyen — rendben.'
    )
  from zaro
  where lezart
    and not regi_alak
    and not uj_alak
    and not (blob ? 'totalActualIncome')

  union all

  -- 7) Létezik-e már a mentés-tábla? ------------------------------------------
  select
    7,
    'Mentés-tábla (bealitas_zaro_adatok_mentes_20260811) létezik?',
    case when exists (
      select 1 from information_schema.tables
      where table_schema = 'public'
        and table_name = 'bealitas_zaro_adatok_mentes_20260811'
    ) then 'IGEN' else 'NEM' end,
    'NEM = még nem futott az 1. SZAKASZ. IGEN = már futott; a sorszámát a 2. SZAKASZ mutatja.'

) t
order by sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 1. SZAKASZ — MENTÉS + MIGRÁCIÓ                                           ║
-- ║ EGY BEGIN/COMMIT. Idempotens: a már 2-es alakú sorokat kihagyja, a       ║
-- ║ mentés-táblába pedig csak az ELSŐ (valódi eredeti) értéket teszi be.     ║
-- ║ Jelöld ki az EGÉSZ szakaszt (a BEGIN-től a COMMIT-ig) és futtasd egyben. ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5min';
-- Ha „canceling statement due to lock timeout" hibát kapsz: NEM TÖRTÉNT SEMMI
-- (tiszta rollback) — várj pár percet és futtasd újra, lehetőleg este 10 után,
-- amikor nincs desktop-szinkron.

-- ── 1/A · Mentés-tábla a visszaállításhoz ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bealitas_zaro_adatok_mentes_20260811 (
  id              character varying NOT NULL,
  congregation_id uuid              NOT NULL,
  regi_ertek      jsonb             NOT NULL,
  mentve_ekkor    timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT bealitas_zaro_adatok_mentes_20260811_pkey PRIMARY KEY (id, congregation_id)
);

COMMENT ON TABLE public.bealitas_zaro_adatok_mentes_20260811 IS
  'A bealitas.szamadas_zaro_adatok RÉGI (1-es alakú) értéke a 2026-08-11-i záró-pillanatkép-egyesítés ELŐTT. Kizárólag visszaállításra. A 3. SZAKASZ ebből állít vissza; utána törölhető.';

-- Ez pénzügyi pillanatképeket tartalmaz: a webes szerepek NE lássák.
-- RLS bekapcsolva, policy NÉLKÜL = csak a service_role / postgres fér hozzá.
ALTER TABLE public.bealitas_zaro_adatok_mentes_20260811 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bealitas_zaro_adatok_mentes_20260811 FROM anon, authenticated;

-- ── 1/B · A régi érték mentése (csak az elsőt tartjuk meg) ─────────────────
INSERT INTO public.bealitas_zaro_adatok_mentes_20260811 (id, congregation_id, regi_ertek)
SELECT b.id, b.congregation_id, b.szamadas_zaro_adatok
FROM public.bealitas b
WHERE jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object'
  AND NOT (
    jsonb_typeof(b.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
    AND (b.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2
  )
ON CONFLICT (id, congregation_id) DO NOTHING;

-- ── 1/C · A migráció ───────────────────────────────────────────────────────
--
-- Az ÚJ érték felépítése:
--   alap        = a `kanonikus` alobjektum (EZ a hivatalos, ív-szűrt irat —
--                 ugyanaz, ami az egyházmegyéhez beküldve is megjelent),
--   + tükör     = income / expense / totalIncome / totalExpense a kanonikus
--                 actual* mezőkből (ezt teszi a kód `withCanonicalAccountingKeys`
--                 néven; így a régi kulcsokat olvasó felületek is jó számot kapnak),
--   + generatedAt (a zárás időbélyege, a régi blobból),
--   + alakVerzio = 2 (erről ismeri fel az olvasó, hogy a felső szint a hivatalos),
--   + szerverEllenorzes = a régi NYERS összesítés végösszegei, egyértelműen
--                 megjelölve, hogy NEM hivatalos összeg. Ez az audit-nyom:
--                 megmutatja, mennyi pénz esett a hivatalos íven kívülre.
--
-- A `kanonikus` kulcs KIKERÜL a felső szintről — pontosan ettől ismeri fel az
-- olvasó, hogy ez már a 2-es alak. A teljes régi blob (a nyers kódonkénti
-- bontással együtt) a mentés-táblában marad meg.
UPDATE public.bealitas b
SET szamadas_zaro_adatok =
      (f.kan - 'kanonikus')
      || jsonb_strip_nulls(jsonb_build_object(
           'income',       coalesce(f.kan -> 'actualIncome',       f.kan -> 'income'),
           'expense',      coalesce(f.kan -> 'actualExpense',      f.kan -> 'expense'),
           'totalIncome',  coalesce(f.kan -> 'totalActualIncome',  f.kan -> 'totalIncome'),
           'totalExpense', coalesce(f.kan -> 'totalActualExpense', f.kan -> 'totalExpense'),
           'generatedAt',  f.regi -> 'generatedAt'
         ))
      || jsonb_build_object(
           'alakVerzio', 2,
           'szerverEllenorzes', jsonb_strip_nulls(jsonb_build_object(
             'nyersBevetel',      to_jsonb(f.nyers_bev),
             'nyersKiadas',       to_jsonb(f.nyers_kia),
             'ivenKivuliBevetel', to_jsonb(round(coalesce(f.nyers_bev, 0) - coalesce(f.hiv_bev, 0), 2)),
             'ivenKivuliKiadas',  to_jsonb(round(coalesce(f.nyers_kia, 0) - coalesce(f.hiv_kia, 0), 2)),
             'kulcs',  to_jsonb('nyers junction-FK-id, ív-szűrés nélkül — NEM hivatalos összeg'::text),
             'forras', to_jsonb('migracio-2026-08-11-zaro-pillanatkep-egyesites'::text)
           ))
         )
FROM (
  SELECT
    x.id,
    x.congregation_id,
    x.szamadas_zaro_adatok                 AS regi,
    x.szamadas_zaro_adatok -> 'kanonikus'  AS kan,
    CASE WHEN jsonb_typeof(x.szamadas_zaro_adatok -> 'totalIncome') = 'number'
         THEN (x.szamadas_zaro_adatok ->> 'totalIncome')::numeric END   AS nyers_bev,
    CASE WHEN jsonb_typeof(x.szamadas_zaro_adatok -> 'totalExpense') = 'number'
         THEN (x.szamadas_zaro_adatok ->> 'totalExpense')::numeric END  AS nyers_kia,
    CASE WHEN jsonb_typeof(x.szamadas_zaro_adatok -> 'kanonikus' -> 'totalActualIncome') = 'number'
         THEN (x.szamadas_zaro_adatok -> 'kanonikus' ->> 'totalActualIncome')::numeric END   AS hiv_bev,
    CASE WHEN jsonb_typeof(x.szamadas_zaro_adatok -> 'kanonikus' -> 'totalActualExpense') = 'number'
         THEN (x.szamadas_zaro_adatok -> 'kanonikus' ->> 'totalActualExpense')::numeric END  AS hiv_kia
  FROM public.bealitas x
  WHERE jsonb_typeof(x.szamadas_zaro_adatok -> 'kanonikus') = 'object'
    AND NOT (
      jsonb_typeof(x.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
      AND (x.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2
    )
) f
WHERE b.id = f.id
  AND b.congregation_id = f.congregation_id;

-- ── 1/D · Fail-closed őrszem ───────────────────────────────────────────────
-- Ha a migráció után maradt volna 1-es alakú sor, VISSZAGÖRGETÜNK. Pénzről van
-- szó: félig rendezett állapotban nem hagyjuk az adatbázist.
DO $$
DECLARE
  v_maradek int;
BEGIN
  SELECT count(*) INTO v_maradek
  FROM public.bealitas b
  WHERE jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object'
    AND NOT (
      jsonb_typeof(b.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
      AND (b.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2
    );

  IF v_maradek > 0 THEN
    RAISE EXCEPTION
      '⛔ A migráció után % sor maradt a RÉGI alakban — a tranzakciót visszagörgetjük, semmi nem változott. Jelezd a fejlesztőnek.',
      v_maradek;
  END IF;
END $$;

COMMIT;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 2. SZAKASZ — UTÓELLENŐRZÉS                                               ║
-- ║ CSAK OLVAS. EGYETLEN SELECT. Az 1. és a 4. sorban a 0 a jó eredmény.     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

with zaro as (
  select
    b.id,
    b.congregation_id,
    b.szamadas_zaro_adatok as blob,
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'kanonikus') = 'object')  as regi_alak,
    (jsonb_typeof(b.szamadas_zaro_adatok -> 'alakVerzio') = 'number'
       and (b.szamadas_zaro_adatok ->> 'alakVerzio')::numeric >= 2)   as uj_alak,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'totalIncome') = 'number'
         then (b.szamadas_zaro_adatok ->> 'totalIncome')::numeric end  as tarolt_bev,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'totalExpense') = 'number'
         then (b.szamadas_zaro_adatok ->> 'totalExpense')::numeric end as tarolt_kia,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'szerverEllenorzes' -> 'ivenKivuliBevetel') = 'number'
         then (b.szamadas_zaro_adatok -> 'szerverEllenorzes' ->> 'ivenKivuliBevetel')::numeric end as iven_kivul_bev,
    case when jsonb_typeof(b.szamadas_zaro_adatok -> 'szerverEllenorzes' -> 'ivenKivuliKiadas') = 'number'
         then (b.szamadas_zaro_adatok -> 'szerverEllenorzes' ->> 'ivenKivuliKiadas')::numeric end  as iven_kivul_kia
  from public.bealitas b
  where jsonb_typeof(b.szamadas_zaro_adatok) = 'object'
    and b.szamadas_zaro_adatok <> '{}'::jsonb
),
bekuldott as (
  select
    ds.congregation_id,
    ds.year,
    max(case when jsonb_typeof(ds.snapshot_data -> 'totalIncome') = 'number'
             then (ds.snapshot_data ->> 'totalIncome')::numeric
             when jsonb_typeof(ds.snapshot_data -> 'totalActualIncome') = 'number'
             then (ds.snapshot_data ->> 'totalActualIncome')::numeric end)  as bek_bev,
    max(case when jsonb_typeof(ds.snapshot_data -> 'totalExpense') = 'number'
             then (ds.snapshot_data ->> 'totalExpense')::numeric
             when jsonb_typeof(ds.snapshot_data -> 'totalActualExpense') = 'number'
             then (ds.snapshot_data ->> 'totalActualExpense')::numeric end) as bek_kia
  from public.document_submissions ds
  where ds.document_type = 'szamadas'
    and ds.status <> 'returned'
  group by ds.congregation_id, ds.year
)
select *
from (

  select
    1 as sorszam,
    'Maradt-e RÉGI alakú sor? (KELL: 0)' as ellenorzes,
    count(*)::text as ertek,
    'Ha nem 0, az 1. SZAKASZ nem futott le teljesen — futtasd újra.' as mit_jelent
  from zaro
  where regi_alak and not uj_alak

  union all

  select
    2,
    'ÚJ (2-es) alakú sorok',
    count(*)::text,
    'Ezekben a felső szintű totalIncome/totalExpense MÁR a hivatalos, ív-szűrt összeg.'
  from zaro
  where uj_alak

  union all

  select
    3,
    'Mentés-tábla sorai (visszaállításhoz)',
    count(*)::text,
    'Ennyi eredeti értéket őrzünk. A 3. SZAKASZ ebből állít vissza. NE dobd el, amíg legalább egy évet végig nem ellenőriztél a felületen.'
  from public.bealitas_zaro_adatok_mentes_20260811

  union all

  -- A LÉNYEGI PRÓBA: a tárolt záró-adat és a BEKÜLDÖTT irat végösszege egyezik-e.
  select
    4,
    '⚠️ Eltér-e a tárolt záró-adat a BEKÜLDÖTT Számadástól? (KELL: 0)',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(distinct z.congregation_id::text || '/' || z.id, ', ') ||
      ' — ezeknél a beküldött irat egy KORÁBBI zárásból való (feloldás után újra véglegesítettek, de nem küldték be újra). A lelkészi jelentés és a Pénzügy fül ettől függetlenül egyezik egymással.',
      'Nincs ilyen — a lelkészi jelentés VII.6/VII.7 és a beküldött Számadás UGYANAZT a számot mutatja.'
    )
  from zaro z
  join bekuldott k
    on k.congregation_id = z.congregation_id
   and z.id ~ '^[0-9]{4}$'
   and k.year = z.id::int
  where z.uj_alak
    and (
      coalesce(z.tarolt_bev, 0) is distinct from coalesce(k.bek_bev, 0)
      or coalesce(z.tarolt_kia, 0) is distinct from coalesce(k.bek_kia, 0)
    )

  union all

  select
    5,
    'Hivatalos íven KÍVÜLRE könyvelt pénz a lezárt éveknél (RON)',
    coalesce(
      string_agg(
        congregation_id::text || '/' || id ||
        ' — bevétel ' || to_char(coalesce(iven_kivul_bev, 0), 'FM999G999G999D00') ||
        ', kiadás ' || to_char(coalesce(iven_kivul_kia, 0), 'FM999G999G999D00'),
        ' | ' order by congregation_id, id
      ),
      '—'
    ),
    'NEM hiba, hanem átnézésre hívó jel: ennyi pénz ül olyan kódon, ami nincs rajta a hivatalos Számadás-íven. Ha nem „—", érdemes a gyülekezettel átnézni a besorolást.'
  from zaro
  where coalesce(iven_kivul_bev, 0) <> 0
     or coalesce(iven_kivul_kia, 0) <> 0

) t
order by sorszam;



-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 3. SZAKASZ — ⛔ VISSZAÁLLÍTÁS — CSAK BAJ ESETÉN                          ║
-- ║                                                                          ║
-- ║ HA a véglegesített évek záró-adata rosszul jelenik meg (Pénzügy fül vagy ║
-- ║ Lelkészi jelentés VII.6/VII.7): JELÖLD KI AZ EGÉSZ 3. SZAKASZT ÉS        ║
-- ║ FUTTASD LE EGYBEN.                                                       ║
-- ║                                                                          ║
-- ║ ⚠️ EZ ÉLES SQL — NINCS KIKOMMENTELVE. Ezért TOKENHEZ VAN KÖTVE: hangosan ║
-- ║    elszáll, ha nem adtad ki előbb UGYANABBAN a munkamenetben:            ║
-- ║        SET kartoteka.zaro_visszaallitas = 'IGEN';                        ║
-- ║    Így a fájl végigfuttatása NEM tudja visszacsinálni az 1. SZAKASZT.    ║
-- ║                                                                          ║
-- ║ ⚠️ ÁRA: a visszaállítás után a tárolt blob ismét a NYERS (ív-szűrés      ║
-- ║    nélküli) összeget hordozza a felső szinten. A FELÜLET ettől még jó    ║
-- ║    számot mutat: a javított olvasó a `kanonikus` alobjektumot részesíti  ║
-- ║    előnyben. A visszaállítás tehát biztonságos.                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF coalesce(current_setting('kartoteka.zaro_visszaallitas', true), '') <> 'IGEN' THEN
    RAISE EXCEPTION
      '⛔ VISSZAÁLLÍTÁS-KAPU: ez a szakasz visszacsinálja az 1. SZAKASZT. Ha tényleg ezt akarod, futtasd előbb UGYANEBBEN a munkamenetben: SET kartoteka.zaro_visszaallitas = ''IGEN'';';
  END IF;
END $$;

UPDATE public.bealitas b
SET szamadas_zaro_adatok = m.regi_ertek
FROM public.bealitas_zaro_adatok_mentes_20260811 m
WHERE b.id = m.id
  AND b.congregation_id = m.congregation_id;

COMMIT;

-- A mentés-tábla eldobása CSAK AKKOR, ha az 1. SZAKASZ eredményét véglegesnek
-- fogadtad el (legalább egy teljes lelkészi-jelentés + Számadás ellenőrzés után).
-- Addig HAGYD MEG — ez az egyetlen visszaút.
--
--   DROP TABLE IF EXISTS public.bealitas_zaro_adatok_mentes_20260811;
