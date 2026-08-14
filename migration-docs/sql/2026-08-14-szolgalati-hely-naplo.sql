-- ═══════════════════════════════════════════════════════════════════════════
--  SZOLGÁLATI HELY NAPLÓ + ÉRTESÍTÉS ÁTHELYEZÉSKOR (2026-08-14, 1. pont)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ENDRE KÉRÉSE: „a szolgálati helyénél legyen összekapcsolva és automatikusan
--  naplózza, hogy hol van jelenleg és ha átkerül valahová akkor azonnal jelezze!"
--
--  A GYÖKÉROK (felmérés, 2026-08-14): a profiles.congregation_id-t az
--  admin_activate_user RPC (és a sync-legacy-role) HELYBEN írja felül —
--  nincs előzmény-sor, nincs audit, és a lelkész értesítést sem kap.
--
--  A MEGOLDÁS TRIGGER-ALAPÚ — szándékosan: így MINDEN írási út naplózódik
--  (a mai RPC, a szinkron, és bármely jövőbeli kód is), nem csak az, amelyikbe
--  emlékszünk kézzel naplózást tenni. Ez a projekt fail-closed filozófiája:
--  a naplózás nem múlhat a hívó fegyelmén.
--
--  MIT HOZ LÉTRE
--   1) public.szolgalati_hely_naplo — CSAK HOZZÁFŰZHETŐ napló (RLS-sel)
--   2) trigger a profiles.congregation_id változására:
--        · napló-sor (előző hely → új hely, denormalizált nevekkel)
--        · ertesitesek-sor az érintett felhasználónak („azonnal jelezze")
--   3) visszamenőleges nyitó sor: minden profilnak, amelynek MA van
--      gyülekezete, egy „jelenlegi hely" kezdő bejegyzés
--
--  ⚠️ EGY TRANZAKCIÓ — vagy minden lépés lefut, vagy semmi.
--  Újrafuttatható (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) A napló tábla ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.szolgalati_hely_naplo (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Denormalizált nevek: a gyülekezet átnevezése/törlése után is olvasható
  -- maradjon, MI történt (a data_wipe_log tanulsága).
  congregation_id          uuid REFERENCES public.congregations(id) ON DELETE SET NULL,
  congregation_nev         text,
  elozo_congregation_id    uuid,
  elozo_congregation_nev   text,
  -- 'kezdeti' = visszamenőleges nyitó sor · 'valtozas' = tényleges áthelyezés
  jelleg                   text NOT NULL DEFAULT 'valtozas'
                             CHECK (jelleg IN ('kezdeti', 'valtozas')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS szolgalati_hely_naplo_profile_idx
  ON public.szolgalati_hely_naplo (profile_id, created_at DESC);

COMMENT ON TABLE public.szolgalati_hely_naplo IS
  '2026-08-14 (1. pont): a profiles.congregation_id változásainak CSAK '
  'HOZZÁFŰZHETŐ naplója. A sorokat KIZÁRÓLAG a szolgalati_hely_valtozas_trigger '
  'írja — kézi INSERT/UPDATE/DELETE nincs (RLS nem ad rá jogot). A profil '
  '„Szolgálati háttér" füle olvassa.';

-- ─── 2) RLS — saját sor + admin-lábak (profile_roles-konvenció) ────────────
ALTER TABLE public.szolgalati_hely_naplo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS szolgalati_hely_naplo_select ON public.szolgalati_hely_naplo;
CREATE POLICY szolgalati_hely_naplo_select ON public.szolgalati_hely_naplo
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.role IN ('admin', 'egyhazkeruleti_admin')
         AND p.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
       WHERE pr.profile_id = auth.uid()
         AND pr.role IN ('admin', 'egyhazkeruleti_admin')
         AND pr.approval_status = 'approved'
         AND pr.active = true
    )
  );
-- INSERT/UPDATE/DELETE policy SZÁNDÉKOSAN NINCS: a naplót csak a SECURITY
-- DEFINER trigger-függvény írja; felhasználó nem módosíthatja az emlékezetet.

-- ─── 3) A trigger-függvény ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.szolgalati_hely_valtozas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uj_nev    text;
  v_regi_nev  text;
BEGIN
  -- Csak tényleges változásnál (a WHEN-feltétel is szűr — ez dupla védelem).
  IF NEW.congregation_id IS NOT DISTINCT FROM OLD.congregation_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.nev_hu, c.name) INTO v_uj_nev
    FROM public.congregations c WHERE c.id = NEW.congregation_id;
  SELECT COALESCE(c.nev_hu, c.name) INTO v_regi_nev
    FROM public.congregations c WHERE c.id = OLD.congregation_id;

  INSERT INTO public.szolgalati_hely_naplo
    (profile_id, congregation_id, congregation_nev,
     elozo_congregation_id, elozo_congregation_nev, jelleg)
  VALUES
    (NEW.id, NEW.congregation_id, v_uj_nev,
     OLD.congregation_id, v_regi_nev, 'valtozas');

  -- „azonnal jelezze": értesítés az ÉRINTETT felhasználónak. A szöveg mindhárom
  -- esetet kimondja (áthelyezés / első hozzárendelés / megszüntetés).
  INSERT INTO public.ertesitesek (user_id, congregation_id, cim, uzenet, tipus)
  VALUES (
    NEW.id,
    NEW.congregation_id,
    'Szolgálati helyed megváltozott',
    CASE
      WHEN OLD.congregation_id IS NULL THEN
        'Mostantól a(z) ' || COALESCE(v_uj_nev, 'ismeretlen gyülekezet') ||
        ' szolgálati helyedhez vagy rendelve a Kartotékában.'
      WHEN NEW.congregation_id IS NULL THEN
        'A(z) ' || COALESCE(v_regi_nev, 'korábbi gyülekezeted') ||
        ' szolgálati helyhez rendelésed megszűnt a Kartotékában.'
      ELSE
        'Áthelyezés: ' || COALESCE(v_regi_nev, '(ismeretlen)') || ' → ' ||
        COALESCE(v_uj_nev, '(ismeretlen)') ||
        '. A profilod Szolgálati háttér fülén látod az előzményeket. ' ||
        'Ha ez tévedés, jelezd a rendszergazdának.'
    END,
    'info'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS szolgalati_hely_valtozas_trigger ON public.profiles;
CREATE TRIGGER szolgalati_hely_valtozas_trigger
  AFTER UPDATE OF congregation_id ON public.profiles
  FOR EACH ROW
  WHEN (OLD.congregation_id IS DISTINCT FROM NEW.congregation_id)
  EXECUTE FUNCTION public.szolgalati_hely_valtozas();

-- ─── 4) Visszamenőleges nyitó sorok — a MAI állapot rögzítése ───────────────
-- Minden profilnak, amelynek van gyülekezete és MÉG NINCS napló-sora, egy
-- 'kezdeti' bejegyzés. Így a „hol van jelenleg" kérdésre az első pillanattól
-- van válasz — a jövőbeli változások pedig már a triggerből jönnek.
INSERT INTO public.szolgalati_hely_naplo
  (profile_id, congregation_id, congregation_nev, jelleg)
SELECT p.id, p.congregation_id, COALESCE(c.nev_hu, c.name), 'kezdeti'
  FROM public.profiles p
  JOIN public.congregations c ON c.id = p.congregation_id
 WHERE p.congregation_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.szolgalati_hely_naplo n WHERE n.profile_id = p.id
   );

-- ─── 5) Mentés-besorolás (fail-closed kapu!) — enélkül a napi mentés MEGÁLL ─
-- Réteg: a profiles (R2 körüli) UTÁN visszatölthető; globális hatókör
-- (a profil nem gyülekezet-szűrt entitás). Egy visszaállítás NEM írhatja
-- felül a naplót (append-only emlékezet).
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes)
VALUES ('szolgalati_hely_naplo', 'globalis', 3, false,
        '2026-08-14 (1. pont): a szolgálati hely változásainak append-only naplója. '
        'Visszaállítás nem írhatja felül — a rendszer emlékezete.')
ON CONFLICT (tabla) DO NOTHING;

COMMIT;

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
SELECT sorrend, mit_mer, ertek, vart,
       CASE WHEN rendben THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'A szolgalati_hely_naplo tábla létezik' AS mit_mer,
         (SELECT count(*)::text FROM information_schema.tables
           WHERE table_schema='public' AND table_name='szolgalati_hely_naplo') AS ertek,
         '1' AS vart,
         EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema='public' AND table_name='szolgalati_hely_naplo') AS rendben
  UNION ALL SELECT 2, 'A trigger él a profiles táblán',
         (SELECT count(*)::text FROM pg_trigger
           WHERE tgname = 'szolgalati_hely_valtozas_trigger'), '1',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'szolgalati_hely_valtozas_trigger')
  UNION ALL SELECT 3, 'Nyitó (kezdeti) sorok száma — kb. az aktív, gyülekezethez kötött profilok száma',
         (SELECT count(*)::text FROM public.szolgalati_hely_naplo WHERE jelleg = 'kezdeti'),
         '(tájékoztató)', true
  UNION ALL SELECT 4, 'A mentés-besorolás megvan (a napi mentés nem áll meg)',
         COALESCE((SELECT hatokor FROM public.backup_table_policy
                    WHERE tabla = 'szolgalati_hely_naplo'), '<nincs>'), 'globalis',
         (SELECT hatokor FROM public.backup_table_policy
           WHERE tabla = 'szolgalati_hely_naplo') = 'globalis'
) t ORDER BY sorrend;
