-- 2026-04-23 — M0.6: documents + document_keys + privát Storage bucket
--
-- ══════════════════════════════════════════════════════════════════════════
--  FUTTATÁS: Endre → Supabase SQL Editor
--
--  CÉL: E2E titkosított dokumentumtár **séma** előkészítése. A tényleges
--  titkosítás + DEK-wrap logika a Tauri-kliensben (M4 fázis) lesz.
--
--  Amit most létrehozunk:
--   1. documents tábla — metaadat (id, owner, congregation, storage_path, mime, size, deleted_at)
--   2. document_keys tábla — DEK wrap-olt értékek device-enként
--   3. RLS: tulajdonos + congregation-member + admin lát
--   4. privát Storage bucket: documents-encrypted
--
--  FIGYELEM: a tényleges Storage bucket létrehozása UI-ban történik
--  (Supabase Dashboard → Storage → New bucket). SQL-ből is lehet, de
--  itt csak a POLICY-kat adjuk hozzá. A bucket létrehozási lépéseket
--  a fájl végén leírjuk.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. documents tábla — metaadat
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.congregations(id),

  -- Storage-ban a fájl elérési útja (pl. 'docs/abc-123.enc')
  storage_path TEXT NOT NULL UNIQUE,

  -- A fájlnév TITKOSÍTOTT, mert maga is tartalmazhat érzékeny info-t
  filename_encrypted BYTEA NOT NULL,

  -- MIME típus, nem titkos — pl. 'application/pdf'
  mime_type TEXT,

  -- Fájl mérete (bájt) — nem titkos
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),

  -- Soft-delete: a törölt fájlok 30 napig megmaradnak (kuka), utána cron törli
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES auth.users(id),

  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision BIGINT NOT NULL DEFAULT 0   -- sync konfliktushoz
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_congregation ON public.documents(congregation_id) WHERE congregation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_active ON public.documents(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON public.documents(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE public.documents IS
  'E2E titkosított dokumentumtár metaadata. A tényleges ciphertext a Supabase Storage documents-encrypted bucket-ben, a DEK wrap a document_keys táblában.';

COMMENT ON COLUMN public.documents.filename_encrypted IS
  'A fájlnév az owner/device key-vel titkosítva — a Storage path-ban csak UUID látszik.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  NEW.updated_at = now();
  NEW.revision = COALESCE(OLD.revision, 0) + 1;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documents_updated_at();

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT: tulajdonos, congregation-member, admin
CREATE POLICY "doc_owner_or_congregation_read"
  ON public.documents FOR SELECT
  USING (
    owner_id = auth.uid()
    OR (congregation_id IS NOT NULL AND public.same_congregation(congregation_id))
    OR public.is_admin()
  );

-- INSERT: authenticated user saját doc-ot hozhat létre
CREATE POLICY "doc_owner_insert"
  ON public.documents FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- UPDATE: csak a tulajdonos vagy admin
CREATE POLICY "doc_owner_update"
  ON public.documents FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

-- DELETE: nincs engedélyezve (soft-delete a deleted_at mezővel)

-- ─────────────────────────────────────────────────────────────────────
-- 2. document_keys — DEK wrap-olt értékek device-enként
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.user_devices(id) ON DELETE CASCADE,

  -- A DEK titkosítva a device public_key-ével (X25519-Chacha20-Poly1305)
  wrapped_dek BYTEA NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Egy doc-hoz egy device-ra csak egy wrap (frissítéskor UPDATE)
  UNIQUE(document_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_document_keys_document ON public.document_keys(document_id);
CREATE INDEX IF NOT EXISTS idx_document_keys_device ON public.document_keys(device_id);

COMMENT ON TABLE public.document_keys IS
  'DEK (document encryption key) wrap-olt értékek. Minden doc-hoz minden jogosult device-ra egy sor. A Tauri-kliens a saját X25519 private key-jével unwrap-olja.';

-- RLS
ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;

-- SELECT: a kulcs-tulajdonos device user-e, vagy admin (ha kell)
CREATE POLICY "dek_device_owner_read"
  ON public.document_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_devices ud
      WHERE ud.id = document_keys.device_id
        AND ud.user_id = auth.uid()
        AND ud.revoked = false
    )
    OR public.is_admin()
  );

-- INSERT: a doc tulajdonosa adhat új device-ra DEK-wrap-ot
CREATE POLICY "dek_owner_insert"
  ON public.document_keys FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_keys.document_id
        AND (d.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- UPDATE: ugyanaz
CREATE POLICY "dek_owner_update"
  ON public.document_keys FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_keys.document_id
        AND (d.owner_id = auth.uid() OR public.is_admin())
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. Soft-delete helper függvény (30 napos kuka)
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.soft_delete_document(p_document_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.documents
     SET deleted_at = now(),
         deleted_by = auth.uid()
   WHERE id = p_document_id
     AND (owner_id = auth.uid() OR public.is_admin())
     AND deleted_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$func$;

COMMENT ON FUNCTION public.soft_delete_document IS
  'A dokumentumot a kukába teszi (deleted_at=now()). 30 nap múlva cron takarítja.';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Ellenőrzés
-- ─────────────────────────────────────────────────────────────────────

SELECT
  'documents' AS tabla,
  COUNT(*) AS sorok,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'documents') AS policy_count
FROM public.documents
UNION ALL
SELECT 'document_keys', COUNT(*), (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'document_keys')
FROM public.document_keys;

SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
WHERE c.relname IN ('documents', 'document_keys')
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

COMMIT;

-- ═════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET LÉPÉSEK (Endre Dashboard-ban)
-- ═════════════════════════════════════════════════════════════════════
--
-- 1. Supabase Dashboard → Storage → New bucket
-- 2. Name: documents-encrypted
-- 3. Public: NO (private)
-- 4. File size limit: 25 MB (vagy amennyi kell)
-- 5. Allowed MIME types: hagyd üresen (bármi), a kliens titkosítja
-- 6. Create
--
-- Utána a Policies tab-on:
--
-- INSERT policy (csak authenticated + owner_id match):
--   name: 'owner_can_upload'
--   allowed operation: INSERT
--   target roles: authenticated
--   policy: (storage.foldername(name))[1] = auth.uid()::text
--           -- a bucket-ben az első mappa-szint a user-ID legyen
--
-- SELECT (download) policy:
--   name: 'owner_or_congregation_can_download'
--   allowed operation: SELECT
--   target roles: authenticated
--   policy: EXISTS (
--     SELECT 1 FROM public.documents d
--     WHERE d.storage_path = storage.objects.name
--       AND (d.owner_id = auth.uid()
--            OR (d.congregation_id IS NOT NULL AND public.same_congregation(d.congregation_id))
--            OR public.is_admin())
--   )
--
-- DELETE policy:
--   name: 'admin_or_owner_can_delete'
--   allowed operation: DELETE
--   target roles: authenticated
--   policy: EXISTS (
--     SELECT 1 FROM public.documents d
--     WHERE d.storage_path = storage.objects.name
--       AND (d.owner_id = auth.uid() OR public.is_admin())
--   )
--
-- A signed-URL kibocsátáshoz a kliens a `createSignedUrl()` API-t hívja,
-- amit a szerver-action proxy-zik (15 perces TTL).

-- ─────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.soft_delete_document(UUID);
-- DROP TABLE IF EXISTS public.document_keys;
-- DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
-- DROP FUNCTION IF EXISTS public.tg_documents_updated_at();
-- DROP TABLE IF EXISTS public.documents;
-- COMMIT;
-- + Dashboard-ban töröld a `documents-encrypted` bucket-et
