-- ==========================================================================
-- 2026-08-15 — EGYSÉGES VÉGLEGESÍTÉS-GOMB: bealitas-bővítés (Endre 4. szakasz)
-- ==========================================================================
-- KONTEXTUS (docs/EGYHAZMEGYEI-SZINT-DONTESEK-2026-08-15.md, 4. szakasz):
--   a véglegesítés-gomb MINDEN jelentésnél egyforma és ugyanott van, mind a
--   hat irat-típusnál: számadás, költségvetés, költségvetés-módosítás,
--   vagyonleltári jelentés, választók névjegyzéke, lelkészi jelentés. Ez az
--   egyházmegyei archívum ELŐFELTÉTELE.
--
-- MIT AD EZ A FÁJL (minden oszlop a public.bealitas év-sorára kerül):
--   1. VÁLASZTÓK NÉVJEGYZÉKE — eddig SEMMILYEN véglegesítése nem volt:
--        valasztok_finalized + valasztok_unlock_requested (+ indoklás)
--        + valasztok_finalized_at/_by pecsét-mezők.
--      A véglegesített év ZÁR is: az app a jogosultság-újraszámítást és a
--      kézi módosítást erre az évre hangos magyar üzenettel tiltja.
--   2. PECSÉT-MEZŐK a már létező zászlók mellé (a zöld „Véglegesítve" jelvény
--      dátumához/szerzőjéhez): budget/accounting/leltar _finalized_at/_by.
--      (A budget_modN köröknek már van budget_modN_date oszlopa — azokhoz
--      nem kell új mező.)
--   A lelkészi jelentésnek SAJÁT táblája van (lelkeszi_jelentes: statusz +
--   veglegesitve_at + veglegesito_profile_id + unlock_requested) — oda
--   szándékosan NEM kerül második zászló a bealitas-ra (a „két forrás
--   széthúz" hibaosztály megelőzése).
--
-- MIKOR KELL FUTTATNI: az egységes véglegesítés PR merge ELŐTT, a Supabase
--   SQL Editorban. Amíg nem fut le:
--     * a választók névjegyzékének véglegesítése HANGOS magyar hibával erre a
--       fájlra mutat (fail-closed — néma siker nincs);
--     * a számadás/költségvetés/leltár véglegesítése változatlanul működik,
--       csak a pecsét-dátum marad üresen (az írás séma-fallbackkel a
--       pecsét-mezők nélkül fut újra).
--
-- ADATMIGRÁCIÓ: NINCS — új oszlopok DEFAULT false / NULL értékkel; a már
--   véglegesített évek pecsét-dátuma visszamenőleg nem állapítható meg
--   (üresen marad, a jelvény dátum nélkül jelenik meg).
--
-- MENTÉS-BESOROLÁS (backup_table_policy): ÚJ TÁBLA NINCS → új policy-sor sem
--   kell; a bealitas tábla már besorolt (a verifikáció ellenőrzi).
--
-- RLS: a bealitas meglévő policy-i oszloptól függetlenek (sor-szintűek) —
--   az új oszlopokra automatikusan érvényesek, új policy nem kell.
--
-- IDEMPOTENS: kizárólag ADD COLUMN IF NOT EXISTS — biztonságos ismételt futtatás.
-- ==========================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Választók névjegyzéke — véglegesítés-zászlók (ÚJ irat-típus a záron)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS valasztok_finalized boolean NOT NULL DEFAULT false;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS valasztok_finalized_at timestamptz;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS valasztok_finalized_by uuid;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS valasztok_unlock_requested boolean NOT NULL DEFAULT false;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS valasztok_unlock_reason text;

COMMENT ON COLUMN public.bealitas.valasztok_finalized IS
  '2026-08-15 (Endre 4. szakasz): a(z) adott évi választók névjegyzéke véglegesítve — a jogosultság-újraszámítás és a kézi módosítás az évre zárolva. Feloldás: valasztok_unlock_requested → egyházmegyei jóváhagyás.';
COMMENT ON COLUMN public.bealitas.valasztok_unlock_reason IS
  '2026-08-15: a névjegyzék-feloldási kérelem kötelező indoklása (≥10 karakter, az app kényszeríti) — az esperes ebből bírálja el.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Pecsét-mezők a meglévő zászlók mellé (zöld jelvény: dátum + szerző)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS budget_finalized_at timestamptz;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS budget_finalized_by uuid;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS accounting_finalized_at timestamptz;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS accounting_finalized_by uuid;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS leltar_finalized_at timestamptz;

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS leltar_finalized_by uuid;

COMMENT ON COLUMN public.bealitas.accounting_finalized_at IS
  '2026-08-15: a számadás véglegesítésének időbélyege — a zöld „Véglegesítve" pecsét-jelvény dátuma. A korábbi (a migráció előtti) véglegesítéseknél NULL.';

COMMIT;

-- PostgREST séma-cache frissítés (Supabase-en az event trigger is megteszi,
-- de az azonnali érvényesüléshez nem árt kimondani):
NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- ELLENŐRZÉS (futtasd le a COMMIT után — mindkettőnek ✅-t kell adnia)
-- ==========================================================================

-- 1) Mind a 11 új oszlop létezik-e:
SELECT
  CASE WHEN count(*) = 11
    THEN '✅ mind a 11 új bealitas-oszlop létezik'
    ELSE '❌ HIÁNYZIK oszlop! (' || count(*) || '/11) — futtasd újra a fájlt'
  END AS oszlopok
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bealitas'
  AND column_name IN (
    'valasztok_finalized', 'valasztok_finalized_at', 'valasztok_finalized_by',
    'valasztok_unlock_requested', 'valasztok_unlock_reason',
    'budget_finalized_at', 'budget_finalized_by',
    'accounting_finalized_at', 'accounting_finalized_by',
    'leltar_finalized_at', 'leltar_finalized_by'
  );

-- 2) A bealitas mentés-besorolása él-e (új tábla nincs, de a napi mentésnek
--    ismernie kell a táblát — ha ❌, a mentés amúgy is hangosan áll):
SELECT
  CASE WHEN EXISTS (
    SELECT 1 FROM public.backup_table_policy WHERE table_name = 'bealitas'
  )
    THEN '✅ a bealitas mentés-besorolása rendben'
    ELSE '❌ a bealitas NINCS besorolva a backup_table_policy-ban!'
  END AS mentes_besorolas;
