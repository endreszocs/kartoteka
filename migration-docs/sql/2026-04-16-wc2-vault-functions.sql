-- ============================================================================
-- KARTOTEKA WC-2.2 — Vault encrypt/decrypt RPC függvények (pgcrypto)
-- ============================================================================
--
-- Dátum: 2026-04-16
-- Előfeltétel: pgcrypto extension engedélyezve (2026-04-16-wc2-oblio-integracio.sql)
--
-- Ezek a függvények a `lib/supabase/secret-vault.ts`-ből hívhatók
-- `supabase.rpc('vault_encrypt', { plaintext_input, key_input })` formában.
--
-- SECURITY: SECURITY DEFINER + strict search_path — a kulcs és a plaintext
-- NEM naplózódik (no-log paraméterek nem támogatottak PostgreSQL-ben, de a
-- Supabase audit log-ban ezek az rpc hívások nem jelennek meg).
--

BEGIN;


-- ============================================================================
-- vault_encrypt — szöveges adat titkosítása
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vault_encrypt(
  plaintext_input text,
  key_input text
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT extensions.pgp_sym_encrypt(plaintext_input, key_input)::text;
$function$;

COMMENT ON FUNCTION public.vault_encrypt(text, text) IS
  $$Titkosít egy szöveget pgcrypto pgp_sym_encrypt-el. A KARTOTEKA secret-vault.ts hívja. A pgcrypto a Supabase "extensions" sémában van, ezért explicit prefix szükséges.$$;


-- ============================================================================
-- vault_decrypt — titkosított adat visszafejtése
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vault_decrypt(
  encrypted_input text,
  key_input text
)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
  SELECT extensions.pgp_sym_decrypt(encrypted_input::bytea, key_input);
$function$;

COMMENT ON FUNCTION public.vault_decrypt(text, text) IS
  $$Visszafejt egy pgcrypto pgp_sym_encrypt-el titkosított szöveget. A KARTOTEKA secret-vault.ts hívja.$$;


COMMIT;


-- ============================================================================
-- ELLENŐRZŐK
-- ============================================================================

-- A) Függvények léteznek
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname IN ('vault_encrypt', 'vault_decrypt')
ORDER BY proname;

-- B) Teszt: titkosítás + visszafejtés
SELECT vault_decrypt(vault_encrypt('teszt-api-secret-12345', 'mykey'), 'mykey') AS decrypted;
-- VÁRT: 'teszt-api-secret-12345'
