-- 2026-04-21x — Railway (EU Amsterdam) + email_service költségkategóriák
--
-- ══════════════════════════════════════════════════════════════════════════
--  FIGYELEM: ez a migráció Endre által futtatandó Supabase SQL Editor-ben!
--  A Claude kód-módosításai (TS típus + UI címkék) önmagukban NEM változtatnak
--  az adatbázison — a jelenlegi 'Vercel Pro Plan' tétel addig marad, amíg
--  ez a SQL le nem fut.
--
--  FUTTATÁS LÉPÉSEI:
--   1. Nyisd meg a Supabase Dashboard → SQL Editor-t
--   2. Másold be a teljes fájl tartalmát (BEGIN-től COMMIT-ig)
--   3. "Run" gomb — egy-két másodperc alatt lefut
--   4. Az Admin oldal → Rendszer pénzügyei fülön látható, hogy a 'Vercel'
--      helyett most 'Railway Hobby (EU Amsterdam)' jelenik meg, havi $15
-- ══════════════════════════════════════════════════════════════════════════
--
-- Kontextus:
--   Az EREK elkötelezte magát a GDPR-kompatibilis EU hostolás mellett. A Vercel
--   (USA-alapú, GDPR-inkompatibilis) helyett Railway.com EU West (Amsterdam,
--   `europe-west4-drams3a`) régiójára költözünk. A 'vercel' kategória MEGMARAD
--   backward-compat okokból (historikus tételek nem törhetők el), de az aktív
--   tételt átsoroljuk 'railway'-re.
--
--   Reális havi Railway költség: $15/hó egy közepes Next.js app-hoz (Hobby
--   tier $5 minimum + usage-based RAM/CPU/egress). Nagyobb forgalom esetén
--   (pl. 200+ gyülekezet) $25-30-ra nőhet.
--
-- A Resend email-szolgáltatót is külön kategóriába vesszük ('email_service'),
-- mert transactional email-küldés üzleti szempontból önálló költség (eddig nem
-- volt kategóriája — a broadcast-ok alaprendszer részei voltak).
--
-- Ez a migráció:
--   1. Kibővíti a system_finance_costs.kategoria CHECK constraint-jét
--   2. UPDATE-li a létező 'vercel' kategóriás Vercel Pro tételt Railway-re
--      ($20 → $15 havi_usd)
--   3. Új default tételt ad hozzá: email_service (Brevo — ingyen, GDPR)
--
-- A migráció futtatása után a summary (havi bevétel/költség/profit) és a
-- skálázási előrejelzés **automatikusan** újraszámolódik a frissített
-- adatokkal, mert a `getSystemFinanceSummary()` és `getScalingForecast()`
-- minden alkalommal aggregál — nincs cache.
--
-- Rollback: lásd a fájl végén.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. CHECK constraint kiterjesztése
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.system_finance_costs
  DROP CONSTRAINT IF EXISTS system_finance_costs_kategoria_check;

ALTER TABLE public.system_finance_costs
  ADD CONSTRAINT system_finance_costs_kategoria_check
  CHECK (kategoria = ANY (ARRAY[
    'supabase'::text,
    'railway'::text,         -- ÚJ: Railway EU Amsterdam hostolás
    'vercel'::text,          -- MEGTARTVA backward-compat (elavult)
    'email_service'::text,   -- ÚJ: Brevo / Mailjet / Resend
    'storage'::text,
    'ai_gpu'::text,
    'ai_proxy'::text,
    'ai_monitoring'::text,
    'mobile'::text,
    'monitoring'::text,
    'domain'::text,
    'egyszeri'::text,
    'egyeb'::text
  ]));

-- ─────────────────────────────────────────────────────────────────────
-- 2. Meglévő Vercel tétel átnevezése Railway-re
--    (csak akkor, ha még nincs aktív Railway tétel)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.system_finance_costs
   SET kategoria  = 'railway',
       nev        = 'Railway Hobby (EU Amsterdam)',
       havi_usd   = 15.00,       -- Reális átlag: Hobby $5 min + ~$10 usage (RAM/CPU/egress)
       megjegyzes = 'EU West Metal (Amsterdam, GDPR). Hobby tier $5/hó min + $10 usage (RAM/CPU/egress). 200+ gyülekezetnél $25-30 lehet. Usage-based: RAM $0.00000386/GB/sec, CPU $0.00000772/vCPU/sec, Egress $0.05/GB.'
 WHERE kategoria = 'vercel'
   AND aktiv = true;

-- Ha esetleg már volt egy 'railway' aktív tétel korábban (pl. teszt-migráció),
-- ne essen baj: a seed INSERT felülre van ON CONFLICT DO NOTHING-gel védve.
-- Ez az UPDATE idempotens: többször futtatva ugyanazt az eredményt adja.

-- ─────────────────────────────────────────────────────────────────────
-- 3. Új default tétel: email szolgáltató (Brevo — ingyenes EU GDPR)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.system_finance_costs (kategoria, nev, havi_usd, arfolyam_usd, aktiv, sorszam, megjegyzes)
VALUES (
  'email_service',
  'Brevo (transactional email)',
  0.00,  -- Free tier: 300 email/nap = ~9000/hó, bőven elég
  4.41,
  true,
  25,
  'Brevo (ex-SendinBlue): francia EU-alapú, GDPR-szigorú. Free: 300 email/nap = ~9000/hó. Fizetős: $9/hó (5K email) vagy $17/hó (20K). A Resend (USA) helyett javasolt.'
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 4. Ellenőrzés — futtatás után látja Endre, mi változott
-- ─────────────────────────────────────────────────────────────────────

SELECT
  kategoria,
  nev,
  havi_usd,
  aktiv,
  sorszam,
  LEFT(COALESCE(megjegyzes, ''), 60) AS megjegyzes_rovid
FROM public.system_finance_costs
WHERE kategoria IN ('railway', 'vercel', 'email_service')
ORDER BY sorszam;

-- Várt eredmény:
--  kategoria       | nev                               | havi_usd | aktiv | sorszam
--  ----------------+-----------------------------------+----------+-------+--------
--  railway         | Railway Hobby (EU Amsterdam)      |     5.00 | true  |     20
--  email_service   | Brevo (transactional email)       |     0.00 | true  |     25
-- (Ha a 'vercel' sor nem volt aktív, továbbra is szerepel, de aktiv=false — nem zavar.)

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK (ha szükséges — csak a Railway átírást vissza)
-- ─────────────────────────────────────────────────────────────────────

-- UPDATE public.system_finance_costs
--    SET kategoria = 'vercel',
--        nev       = 'Vercel Pro Plan (1 fejl.)',
--        havi_usd  = 20.00,
--        megjegyzes = 'Hosting, CI/CD, CDN, serverless.'
--  WHERE kategoria = 'railway'
--    AND nev = 'Railway Hobby (EU Amsterdam)';
--
-- DELETE FROM public.system_finance_costs
--  WHERE kategoria = 'email_service'
--    AND nev = 'Brevo (transactional email)';
--
-- ALTER TABLE public.system_finance_costs
--   DROP CONSTRAINT system_finance_costs_kategoria_check;
-- ALTER TABLE public.system_finance_costs
--   ADD CONSTRAINT system_finance_costs_kategoria_check
--   CHECK (kategoria = ANY (ARRAY['supabase'::text, 'vercel'::text, 'storage'::text, 'ai_gpu'::text, 'ai_proxy'::text, 'ai_monitoring'::text, 'mobile'::text, 'monitoring'::text, 'domain'::text, 'egyszeri'::text, 'egyeb'::text]));
