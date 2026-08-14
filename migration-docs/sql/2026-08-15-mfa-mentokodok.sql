-- ═══════════════════════════════════════════════════════════════════════════
--  KÉTLÉPCSŐS BELÉPÉS (2FA) — MENTŐKÓDOK (2026-08-15, 8. pont A szelet)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ENDRE DÖNTÉSE (4. döntés): a 2FA OPT-IN — aki bekapcsolja, annak onnantól
--  kötelező; aki nem, annak semmi nem változik.
--
--  MIÉRT KELL SAJÁT TÁBLA: a Supabase natív TOTP-je NEM ad mentőkódot. A
--  kizárás (elveszett/új telefon) a legvalószínűbb üzemzavar egy önkéntes-
--  alapú rendszerben — ezért bekapcsoláskor 8 egyszer használható mentőkód
--  készül. A kód CSAK HASH-ELVE tárolódik (scrypt, a web-oldal állítja elő);
--  a nyers kód egyetlen egyszer jelenik meg a képernyőn, kinyomtatható.
--  Mentőkódos belépéskor a szerver a kódot elhasználja, a TOTP-faktort
--  LEVESZI a fiókról (admin API), és naplóz — a lelkész bejut, a 2FA-t újra
--  be kell kapcsolnia (ez a natív recovery-kód nélküli bevett minta).
--
--  ⚠️ EGY TRANZAKCIÓ — újrafuttatható.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.mfa_mentokodok (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- scrypt-hash, formátum: 'scrypt$<salt_hex>$<hash_hex>' — nyers kód SOHA.
  kod_hash    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- NULL = még felhasználható; kitöltve = elhasznált (mikor).
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS mfa_mentokodok_user_idx
  ON public.mfa_mentokodok (user_id) WHERE used_at IS NULL;

COMMENT ON TABLE public.mfa_mentokodok IS
  '2026-08-15 (8. pont): a kétlépcsős belépés egyszer használható mentőkódjai '
  '(scrypt-hash). A sorokat a szerver-akciók kezelik (service-role); a '
  'felhasználó közvetlenül csak a SAJÁT sorai állapotát (db, elhasznált) látja.';

-- ─── RLS: a felhasználó CSAK a saját kódjai állapotát láthatja ─────────────
-- Írás (INSERT/UPDATE/DELETE) policy SZÁNDÉKOSAN NINCS: a kódokat kizárólag
-- a szerver-oldali akciók kezelik service-role klienssel (az RLS-t megkerüli)
-- — a kliens sosem írhat, és a hash-t sem olvashatja (oszlop-szűkítés a
-- lekérdezésben; a select-policy sor-szintű, a hash-oszlopot az akció nem
-- adja ki).
ALTER TABLE public.mfa_mentokodok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_mentokodok_select ON public.mfa_mentokodok;
CREATE POLICY mfa_mentokodok_select ON public.mfa_mentokodok
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─── Mentés-besorolás (fail-closed kapu — enélkül a napi mentés megáll) ────
-- Globális (nem gyülekezet-szűrt), 3. réteg; visszaállítás NEM írhatja felül
-- (biztonsági anyag: egy visszaállított régi kód-készlet már elhasznált
-- kódokat élesztene fel).
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES ('mfa_mentokodok', 'globalis', 3, false,
        '2026-08-15 (8. pont): 2FA-mentőkódok (hash). Visszaállítás nem írhatja felül.')
ON CONFLICT (tabla) DO NOTHING;

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
SELECT sorrend, mit_mer,
       CASE WHEN rendben THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'A mfa_mentokodok tábla létezik' AS mit_mer,
         to_regclass('public.mfa_mentokodok') IS NOT NULL AS rendben
  UNION ALL SELECT 2, 'RLS bekapcsolva',
         (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.mfa_mentokodok'))
  UNION ALL SELECT 3, 'Csak SELECT-policy él (írás a szerver-akcióké)',
         (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='mfa_mentokodok') = 1
  UNION ALL SELECT 4, 'Mentés-besorolás megvan (a napi mentés nem áll meg)',
         EXISTS (SELECT 1 FROM public.backup_table_policy WHERE tabla = 'mfa_mentokodok')
) t ORDER BY sorrend;
