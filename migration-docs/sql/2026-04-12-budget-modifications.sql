-- Költségvetés módosítás véglegesítési flagek
-- 3 módosítási kör támogatása évenként

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS budget_mod1_finalized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_mod2_finalized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_mod3_finalized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_mod1_date date,
  ADD COLUMN IF NOT EXISTS budget_mod2_date date,
  ADD COLUMN IF NOT EXISTS budget_mod3_date date,
  ADD COLUMN IF NOT EXISTS budget_mod1_hatarozat text,
  ADD COLUMN IF NOT EXISTS budget_mod2_hatarozat text,
  ADD COLUMN IF NOT EXISTS budget_mod3_hatarozat text;

-- A koltsegvetes tábla osszeg_mod_2, osszeg_mod_3 oszlopai már léteznek (numeric DEFAULT 0)
-- Nincs szükség további migrációra a koltsegvetes táblán
