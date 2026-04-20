-- ─────────────────────────────────────────────────────────────────
-- Missziós Műhely — Bookmark (Offline mentés) rendszer
-- ─────────────────────────────────────────────────────────────────
--
-- A felhasználói döntés alapján (lásd PWA offline-first tervezet):
-- A MM fórum alapvetően ONLINE, de a lelkész jelölheti, mely ötleteket
-- vagy segédanyagokat szeretné OFFLINE is elérhetővé tenni. Ezek bekerülnek
-- a lokális Dexie-be és a saját `misszios-muhely.xlsx` biztonsági mentésbe.
--
-- ARCHITEKTÚRA:
-- A MM modulban nincs külön `mm_projektek` tábla — egy „projekt" valójában
-- egy mm_otletek rekord, amihez mm_feladatok és mm_merfoldkovek tartoznak.
-- Ezért a bookmark csak KÉT célpont-típust ismer:
--   1. `otlet_id` → mm_otletek (magában foglalja a hozzátartozó projekt részeit is)
--   2. `segedanyag_id` → mm_segedanyagok
--
-- Auto-bookmark (UI-oldali logika, ebben a táblában NEM tárolt):
--   - Saját `otletgazda_id = user.id` ötletek
--   - Saját feltöltött segédanyagok
-- Ezek mindig elérhetők, a user nem kell explicit bookmark-olja őket.
--
-- Manual bookmark (ez a tábla):
--   - A user explicit jelöli a „Mentés offline-ra" gombbal
--
-- DEFENSZÍV MIGRÁCIÓ:
-- A migráció ellenőrzi, hogy az `mm_otletek` és `mm_segedanyagok` táblák
-- léteznek-e. Ha nem, a migráció csendben átugrik (pl. az MM modul még
-- nincs migrálva a Supabase-be) — a Fázis 5c csak azután használható,
-- hogy az MM Supabase-migráció lefutott.
--
-- ROLLBACK:
--  DROP TABLE IF EXISTS public.mm_bookmarks CASCADE;
--  DROP FUNCTION IF EXISTS public.mm_bookmarks_revision_bump();
--  DROP FUNCTION IF EXISTS public.mm_get_user_bookmarks(uuid);
-- ─────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  otletek_exists boolean;
  segedanyagok_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mm_otletek'
  ) INTO otletek_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'mm_segedanyagok'
  ) INTO segedanyagok_exists;

  IF NOT (otletek_exists OR segedanyagok_exists) THEN
    RAISE NOTICE 'mm_bookmarks migráció KIHAGYVA: sem mm_otletek, sem mm_segedanyagok nem létezik.';
    RAISE NOTICE 'Először migráld az MM modult a Supabase-be, majd futtasd újra ezt a migrációt.';
    RETURN;
  END IF;

  -- ─────────────────────────────────────────────────────────────
  -- Bookmarks tábla — csak ha legalább 1 cél tábla létezik
  -- ─────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public.mm_bookmarks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Polymorphic FK: pontosan EGY mező lehet nem-null.
    -- A FK-kat dinamikusan fűzzük hozzá, csak ha a cél tábla létezik.
    otlet_id uuid,
    segedanyag_id uuid,

    -- Kötelező check: pontosan 1 target
    CONSTRAINT mm_bookmarks_exactly_one_target CHECK (
      (otlet_id IS NOT NULL)::int +
      (segedanyag_id IS NOT NULL)::int = 1
    ),

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    revision bigint NOT NULL DEFAULT 0,

    -- Unique: egy user egy adott entitásra egyszer bookmark-olhat
    CONSTRAINT mm_bookmarks_unique_per_target UNIQUE (
      user_id, otlet_id, segedanyag_id
    )
  );

  COMMENT ON TABLE public.mm_bookmarks IS
    'Missziós Műhely — felhasználó által offline-ra mentett tartalmak. '
    'A lelkész manuálisan bookmark-olja, a lokális Dexie + Excel biztonsági '
    'mentésbe automatikusan bekerülnek.';

  -- ─────────────────────────────────────────────────────────────
  -- FK-k feltételes hozzáadása (csak ha a cél tábla létezik)
  -- ─────────────────────────────────────────────────────────────
  IF otletek_exists AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mm_bookmarks_otlet_id_fkey'
  ) THEN
    ALTER TABLE public.mm_bookmarks
      ADD CONSTRAINT mm_bookmarks_otlet_id_fkey
      FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id) ON DELETE CASCADE;
  END IF;

  IF segedanyagok_exists AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mm_bookmarks_segedanyag_id_fkey'
  ) THEN
    ALTER TABLE public.mm_bookmarks
      ADD CONSTRAINT mm_bookmarks_segedanyag_id_fkey
      FOREIGN KEY (segedanyag_id) REFERENCES public.mm_segedanyagok(id) ON DELETE CASCADE;
  END IF;

  RAISE NOTICE 'mm_bookmarks tábla létrehozva (otletek_exists=%, segedanyagok_exists=%).',
    otletek_exists, segedanyagok_exists;
END;
$mig$;

-- ─────────────────────────────────────────────────────────────────
-- Indexek — a bookmarkok gyors lekérdezéséhez (csak ha a tábla létezik)
-- ─────────────────────────────────────────────────────────────────

DO $idx$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks') THEN
    CREATE INDEX IF NOT EXISTS mm_bookmarks_user_idx ON public.mm_bookmarks (user_id);
    CREATE INDEX IF NOT EXISTS mm_bookmarks_otlet_idx ON public.mm_bookmarks (otlet_id) WHERE otlet_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS mm_bookmarks_segedanyag_idx ON public.mm_bookmarks (segedanyag_id) WHERE segedanyag_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS mm_bookmarks_updated_at_idx ON public.mm_bookmarks (updated_at);
  END IF;
END;
$idx$;

-- ─────────────────────────────────────────────────────────────────
-- BEFORE UPDATE trigger — revision + updated_at automatikus
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mm_bookmarks_revision_bump()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.revision := COALESCE(OLD.revision, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $trg$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks') THEN
    DROP TRIGGER IF EXISTS mm_bookmarks_revision_bump_trg ON public.mm_bookmarks;
    CREATE TRIGGER mm_bookmarks_revision_bump_trg
      BEFORE UPDATE ON public.mm_bookmarks
      FOR EACH ROW
      EXECUTE FUNCTION public.mm_bookmarks_revision_bump();
  END IF;
END;
$trg$;

-- ─────────────────────────────────────────────────────────────────
-- Row Level Security — user csak SAJÁT bookmarkjait láthatja/kezelheti
-- ─────────────────────────────────────────────────────────────────

DO $rls$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks') THEN
    ALTER TABLE public.mm_bookmarks ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS mm_bookmarks_select_own ON public.mm_bookmarks;
    CREATE POLICY mm_bookmarks_select_own ON public.mm_bookmarks
      FOR SELECT
      USING (user_id = auth.uid());

    DROP POLICY IF EXISTS mm_bookmarks_insert_own ON public.mm_bookmarks;
    CREATE POLICY mm_bookmarks_insert_own ON public.mm_bookmarks
      FOR INSERT
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS mm_bookmarks_update_own ON public.mm_bookmarks;
    CREATE POLICY mm_bookmarks_update_own ON public.mm_bookmarks
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    DROP POLICY IF EXISTS mm_bookmarks_delete_own ON public.mm_bookmarks;
    CREATE POLICY mm_bookmarks_delete_own ON public.mm_bookmarks
      FOR DELETE
      USING (user_id = auth.uid());
  END IF;
END;
$rls$;

-- ─────────────────────────────────────────────────────────────────
-- Segédfüggvény — user bookmark-jainak egységes lekérdezése
-- Csak akkor jön létre, ha a mm_bookmarks + a cél táblák léteznek
-- ─────────────────────────────────────────────────────────────────

DO $fn$
DECLARE
  otletek_exists boolean;
  segedanyagok_exists boolean;
  bookmarks_exists boolean;
  sql_body text := '';
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_otletek') INTO otletek_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_segedanyagok') INTO segedanyagok_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks') INTO bookmarks_exists;

  IF NOT bookmarks_exists THEN
    RETURN;
  END IF;

  IF otletek_exists THEN
    sql_body := sql_body ||
      'SELECT ''otlet''::text as kind, b.otlet_id as entity_id, o.cim as title, b.created_at as bookmarked_at ' ||
      'FROM public.mm_bookmarks b JOIN public.mm_otletek o ON o.id = b.otlet_id ' ||
      'WHERE b.user_id = p_user_id AND b.otlet_id IS NOT NULL';
  END IF;

  IF otletek_exists AND segedanyagok_exists THEN
    sql_body := sql_body || ' UNION ALL ';
  END IF;

  IF segedanyagok_exists THEN
    sql_body := sql_body ||
      'SELECT ''segedanyag''::text, b.segedanyag_id, s.cim, b.created_at ' ||
      'FROM public.mm_bookmarks b JOIN public.mm_segedanyagok s ON s.id = b.segedanyag_id ' ||
      'WHERE b.user_id = p_user_id AND b.segedanyag_id IS NOT NULL';
  END IF;

  IF sql_body = '' THEN
    -- Egyik cél tábla sem létezik — üres függvény, hogy a kliens ne dőljön el
    sql_body := 'SELECT NULL::text as kind, NULL::uuid as entity_id, NULL::text as title, NULL::timestamptz as bookmarked_at WHERE false';
  ELSE
    sql_body := sql_body || ' ORDER BY bookmarked_at DESC';
  END IF;

  EXECUTE format($create$
    CREATE OR REPLACE FUNCTION public.mm_get_user_bookmarks(p_user_id uuid)
    RETURNS TABLE (kind text, entity_id uuid, title text, bookmarked_at timestamptz)
    LANGUAGE sql
    SECURITY INVOKER
    STABLE
    AS $body$ %s $body$;
  $create$, sql_body);

  COMMENT ON FUNCTION public.mm_get_user_bookmarks(uuid) IS
    'Egy user minden MM bookmark-ja egységes formátumban (kind, entity_id, title, bookmarked_at).';

  GRANT EXECUTE ON FUNCTION public.mm_get_user_bookmarks(uuid) TO authenticated;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────
-- Grant-ek
-- ─────────────────────────────────────────────────────────────────

DO $grant$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.mm_bookmarks TO authenticated;
  END IF;
END;
$grant$;

-- ─────────────────────────────────────────────────────────────────
-- Manuális ellenőrzés
-- ─────────────────────────────────────────────────────────────────
-- -- A tábla létezik-e?
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mm_bookmarks';
--
-- -- Egy user bookmark-jainak lekérdezése (csak ha az MM modul migrálva van)
-- SELECT * FROM public.mm_get_user_bookmarks(auth.uid());
--
-- -- Új bookmark beszúrása kliens-oldalról:
-- -- supabase.from('mm_bookmarks').insert({ user_id: '…', otlet_id: '…' })
