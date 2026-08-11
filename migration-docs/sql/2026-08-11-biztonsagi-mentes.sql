-- ════════════════════════════════════════════════════════════════════════════
-- KARTOTÉKA — NAPI TITKOSÍTOTT BIZTONSÁGI MENTÉS + GYÜLEKEZETI VISSZAÁLLÍTÁS
-- Fájl:     migration-docs/sql/2026-08-11-biztonsagi-mentes.sql
-- Dátum:    2026-08-11
-- Futtatja: Endre (Supabase Studio → SQL Editor). EGYBEN futtatható, IDEMPOTENS.
--
-- ─── MIT CSINÁL ─────────────────────────────────────────────────────────────
--  1) Létrehoz 5 táblát a mentés-rendszerhez (mind RLS-sel):
--       backup_table_policy    — MELYIK táblát hogyan mentjük (az igazság-forrás)
--       backup_settings        — EGYETLEN sor: Drive-kapcsolat, mentési jelszó
--       backup_log             — futásonként egy sor (ez hajtja a felületet)
--       backup_restore_log     — CSAK hozzáfűzhető napló a veszélyes műveletekről
--       backup_restore_staging — a visszaállítandó adat átmeneti tárolója
--  2) Hozzáad egy oszlopot: congregations.restore_epoch
--  3) Létrehozza a mentés/visszaállítás RPC-it (mind SECURITY DEFINER,
--     rögzített search_path-szal, KIZÁRÓLAG service_role hívhatja)
--  4) Feltölti a backup_table_policy-t: minden `congregation_id` oszlopos élő
--     tábla automatikusan bekerül; a join-on szűrendő és a KIZÁRT táblák
--     explicit sorokat kapnak.
--
-- ─── A KÉT ALAPELV, AMIT A FÁJL BETARTAT ────────────────────────────────────
--  A) A MENTÉS soha ne hagyjon ki adatot NÉMÁN.
--     → besorolatlan (policy-sor nélküli) élő tábla = a futás HANGOS HIBÁVAL
--       elhasal, a tábla nevével. Nem „hoppá, kimaradt".
--  B) A VISSZAÁLLÍTÁS soha ne rontson el adatot NÉMÁN.
--     → `reteg IS NULL` (nem tudjuk, milyen sorrendben kell visszatölteni)
--       = a tábla MENTÉSRE kerül (az adat megvan!), de a VISSZAÁLLÍTÁS
--       megtagadja a futást, amíg valaki be nem sorolja.
--     Ez a kettő szándékosan NEM ugyanaz a kapu.
--
-- ─── ELŐFELTÉTEL ────────────────────────────────────────────────────────────
--  ELŐBB futtasd le: migration-docs/sql/2026-08-11-mentes-leltar-ellenorzes.sql
--  (csak olvas). Az a lekérdezés mondja meg, milyen táblák vannak ÉLESBEN —
--  a repó és a produkció bizonyítottan széthúz, és a migration-fájl NEM
--  bizonyíték arra, hogy valami lefutott.
--
--  A fájl VÉGÉN lévő EGYETLEN ellenőrző SELECT kilistázza a besorolatlan
--  táblákat. Amíg az a lista nem üres, A MENTÉS NEM FOG ELINDULNI — és ez
--  szándékos. A pótló INSERT sablonja is ott van.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 0 — ÁLLAPOTFELMÉRÉS (fail-closed: hiányzó előfeltételnél MEGÁLL)
-- ════════════════════════════════════════════════════════════════════════════
DO $szakasz0$
DECLARE
  v_hiany text[] := '{}';
  v_t     text;
BEGIN
  FOREACH v_t IN ARRAY ARRAY[
    'public.congregations', 'public.profiles', 'public.profile_roles',
    'public.profile_congregations', 'public.dioceses', 'public.ertesitesek',
    'public.szemely'
  ] LOOP
    IF to_regclass(v_t) IS NULL THEN
      v_hiany := v_hiany || v_t;
    END IF;
  END LOOP;

  IF array_length(v_hiany, 1) > 0 THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: hiányzó előfeltétel-tábla(k): %. Ez nem a Kartotéka éles adatbázisa, vagy egy korábbi migráció nem futott le.',
      array_to_string(v_hiany, ', ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid') THEN
    RAISE EXCEPTION
      'MEGÁLLTAM: nincs gen_random_uuid(). Futtasd: CREATE EXTENSION IF NOT EXISTS pgcrypto;';
  END IF;

  RAISE NOTICE 'SZAKASZ 0 rendben — az előfeltételek megvannak.';
END
$szakasz0$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 1 — TÁBLÁK
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1/a) backup_table_policy — MI KERÜL A MENTÉSBE ─────────────────────────
-- Ez a rendszer igazság-forrása. Az `information_schema` mondja meg, MI VAN;
-- ez a tábla mondja meg, MIT KEZDÜNK VELE. A kettő eltérése = hangos hiba.
CREATE TABLE IF NOT EXISTS public.backup_table_policy (
  tabla             text PRIMARY KEY,
  hatokor           text NOT NULL
                      CHECK (hatokor IN ('gyulekezet','globalis','kizart_titok','kizart_egyeb')),
  -- A gyülekezet-szűrő SQL-töredéke. NULL = `t.congregation_id = $1`.
  -- A töredékben a tábla aliasa `t`, a gyülekezet-azonosító `$1`.
  join_predikatum   text,
  -- Visszatöltési réteg (R0..R7). NULL = MENTJÜK, de VISSZAÁLLÍTANI NEM TUDJUK,
  -- amíg valaki be nem sorolja. A visszaállítás ilyenkor MEGTAGADJA a futást.
  reteg             smallint CHECK (reteg BETWEEN 0 AND 7),
  -- false = mentjük, de a visszaállítás SOHA nem írja felül (pl. audit-naplók:
  -- egy visszaállítás nem írhatja át a rendszer saját emlékezetét).
  visszaallithato   boolean NOT NULL DEFAULT true,
  megjegyzes        text,
  felvette          uuid,
  felvette_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.backup_table_policy IS
  '2026-08-11: a biztonsági mentés tábla-besorolása. Az information_schema mondja meg MI VAN, ez a tábla MIT KEZDÜNK VELE. Besorolatlan élő tábla → a mentés hangos hibával elhasal (soha nem marad ki adat némán). reteg IS NULL → mentjük, de a visszaállítás megtagadja (soha nem romlik el adat némán).';

-- ─── 1/b) backup_settings — PONTOSAN EGY SOR ────────────────────────────────
-- Miért egy sor: a Drive-fiók és a mentési jelszó a tulajdonosé, rendszer-
-- szintű. Gyülekezetenkénti Drive-fiók nincs, és nem is lesz — az öt külön
-- OAuth-kapcsolat karbantartása egy embernek nem tartható.
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id                       smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled                  boolean NOT NULL DEFAULT true,

  -- MENTÉSI JELSZÓ — csak ELLENŐRZŐ HASH. A nyers jelszót a rendszer SOHA nem
  -- tárolja és nem tudja megmondani. A verifier SZERVER-KULCSOS
  -- (HMAC a BACKUP_ENCRYPTION_KEY-jel), ezért egy adatbázis-szivárgás
  -- önmagában NEM teszi offline törhetővé.
  passphrase_verifier      bytea,
  verifier_salt            bytea,
  passphrase_set_at        timestamptz,
  passphrase_set_by        uuid,

  -- GOOGLE DRIVE. A refresh token TITKOSÍTVA (AES-256-GCM, a kulcs a
  -- BACKUP_ENCRYPTION_KEY-ből HKDF-fel származtatva). Erre a táblára
  -- SZÁNDÉKOSAN NINCS EGYETLEN RLS-POLICY SEM: még hitelesített admin sem
  -- SELECT-elheti, csak a service_role / SECURITY DEFINER út.
  drive_folder_id          text,
  drive_account_email      text,
  drive_connected_at       timestamptz,
  drive_refresh_token_enc  bytea,
  drive_token_status       text NOT NULL DEFAULT 'nincs'
                             CHECK (drive_token_status IN ('nincs','ok','hiba')),
  drive_token_hiba         text,

  retention                jsonb NOT NULL DEFAULT '{"napi":14,"heti":8,"havi":6}'::jsonb,
  max_file_mb              int NOT NULL DEFAULT 50,
  alert_email              text,
  last_ok_at               timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- ⚠️ HELYREÁLLÍTÓ KULCSPÁR (KULCS-LETÉT) — 2026-08-11.
--
-- A PROBLÉMA: a felügyelet nélküli napi futás nem ismeri a mentési jelszót,
-- ezért az adatkulcsot CSAK a szerver BACKUP_ENCRYPTION_KEY-ével tudta
-- beburkolni. Ha az a kulcs elveszik vagy lecserélődik, a felhőben lévő ÖSSZES
-- napi mentés VÉGLEG olvashatatlan — és erről a tulajdonos csak egy
-- visszaállítási kísérletnél értesülne, vagyis a legrosszabb pillanatban.
--
-- A MEGOLDÁS: a mentési jelszó beállításakor születik egy X25519 kulcspár.
--   · a NYILVÁNOS fele itt, nyíltan  → ehhez a cron titok nélkül pecsételhet,
--   · a TITKOS fele a JELSZÓVAL burkolva → a szerver soha nem nyitja ki, csak
--     MÁSOLJA minden mentés fejlécébe.
-- Így minden fájl önmagában, pusztán a mentési jelszóval megnyitható —
-- szerver, adatbázis és Kartotéka nélkül.
--
-- ⚠️ ADD COLUMN IF NOT EXISTS: a fájl újrafuttatható egy MÁR TELEPÍTETT
--    rendszeren is. A migration-fájl megléte nem bizonyíték a lefutásra.
ALTER TABLE public.backup_settings
  ADD COLUMN IF NOT EXISTS recovery_public_key      bytea,
  ADD COLUMN IF NOT EXISTS recovery_private_wrapped jsonb,
  ADD COLUMN IF NOT EXISTS recovery_set_at          timestamptz;

COMMENT ON COLUMN public.backup_settings.recovery_private_wrapped IS
  '2026-08-11: a helyreállító X25519 TITKOS kulcs, a MENTÉSI JELSZÓVAL burkolva (scrypt + AES-256-GCM). A szerver soha nem nyitja ki — csak bemásolja minden mentés fejlécébe. Ettől nyitható a napi mentés a jelszóval, szerver-kulcs nélkül.';

INSERT INTO public.backup_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.backup_settings IS
  '2026-08-11: a mentés-rendszer EGYETLEN beállítás-sora. Titkokat tartalmaz (jelszó-verifier, Drive refresh token) — ezért SZÁNDÉKOSAN nincs rajta RLS-policy: csak service_role éri el. A felület egy szerver-action-ön keresztül kap belőle biztonságos mezőket.';

-- ─── 1/c) backup_log — FUTÁSONKÉNT EGY SOR ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_log (
  id                     bigserial PRIMARY KEY,
  scope                  text NOT NULL CHECK (scope IN ('gyulekezet','globalis')),
  congregation_id        uuid REFERENCES public.congregations(id) ON DELETE SET NULL,
  -- Denormalizált név: a data_wipe_log tanulsága — a gyülekezet törlése után
  -- is olvashatónak kell maradnia, mi történt.
  congregation_nev       text,
  kind                   text NOT NULL DEFAULT 'napi'
                           CHECK (kind IN ('napi','kezi','pre_restore')),
  run_date               date NOT NULL,       -- Europe/Bucharest HELYI dátum
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  status                 text NOT NULL DEFAULT 'fut'
                           CHECK (status IN ('fut','ok','hiba')),
  failure_stage          text CHECK (failure_stage IN
                           ('leltar','szamlalas','dump','titkositas','feltoltes','igazolas','nyeses')),
  -- CSAK biztonságos szöveg: error.message + hibakód. SOHA nem sorérték,
  -- SOHA nem a nyers Supabase hibaobjektum (az a lekérdezést is kiírná).
  failure_message        text,

  -- TITKOSÍTATLAN, mert CSAK SZÁMOK — se név, se CNP. Cserébe a lista, a napi
  -- darabszámok és a kárjelző JELSZÓ NÉLKÜL, VISSZAFEJTÉS NÉLKÜL működik:
  -- a mentés-előzmény böngészése nem jár semmilyen adatfeltárással.
  row_counts             jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_counts_delta       jsonb,
  total_rows             bigint NOT NULL DEFAULT 0,
  schema_fingerprint     text,

  ciphertext_bytes       bigint,
  sha256                 text,
  key_id                 text,
  env                    text NOT NULL DEFAULT 'prod' CHECK (env IN ('prod','test')),

  drive_file_id          text,
  drive_file_name        text,
  drive_verified_at      timestamptz,     -- CSAK EZ jelenti, hogy a mentés IGAZOLT
  -- A fényképek külön fájlban. Ha a tartalom nem változott, ez az ELŐZŐ napi
  -- fájlra mutat — enélkül egy 1200 fős, fényképes gyülekezet 60-180 MB-tal
  -- hízna NAPONTA, és hetek alatt megtelne a Drive ingyenes 15 GB-ja.
  media_drive_file_id    text,
  media_sha256           text,
  media_bytes            bigint,

  alert_sent_at          timestamptz,
  figyelmeztetesek       jsonb NOT NULL DEFAULT '[]'::jsonb,
  pruned_at              timestamptz
);

-- ⚠️ MELYIK TÁROLÓBA KERÜLT A FÁJL — 2026-08-11.
-- A `drive_file_id` jelentése TÁROLÓFÜGGŐ: a Google Drive-nál `files.id`, a
-- Supabase Storage-nál teljes objektum-útvonal. E nélkül az oszlop nélkül egy
-- későbbi tároló-váltás az ÖSSZES korábbi sort elárvítaná: a felületen zöld
-- maradna, a fájl viszont megnyithatatlan ÉS letörölhetetlen lenne — a nyesés
-- pedig „sikeresen" nyesettnek jelölné őket, miközben a fájlok örökre ott
-- maradnak. Az olvasás (letöltés, visszaállítás, nyesés) MOSTANTÓL ezt az
-- oszlopot használja.
ALTER TABLE public.backup_log
  ADD COLUMN IF NOT EXISTS storage_nev text;

COMMENT ON COLUMN public.backup_log.storage_nev IS
  '2026-08-11: melyik tárolóba került a fájl (google-drive / supabase-storage). A drive_file_id jelentése tárolónként más — enélkül az olvasó oldal rossz helyen keresné.';

-- IDEMPOTENCIA: napi futásból hatókörönként EGY lehet. A kézi és az elő-mentés
-- szándékosan kimarad (azokból naponta több is indítható).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_backup_log_napi
  ON public.backup_log (
    scope,
    COALESCE(congregation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    run_date
  )
  WHERE kind = 'napi';

CREATE INDEX IF NOT EXISTS idx_backup_log_cong_date
  ON public.backup_log (congregation_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_backup_log_status
  ON public.backup_log (status, finished_at DESC);

COMMENT ON TABLE public.backup_log IS
  '2026-08-11: mentési futások naplója. A felület ZÖLD PIPÁJA a drive_verified_at + sha256 hármasából jön, NEM a status mezőből — egy „ok" sor, aminek nincs drive_verified_at-ja, PIROS.';

-- ─── 1/d) backup_restore_log — CSAK HOZZÁFŰZHETŐ ────────────────────────────
CREATE TABLE IF NOT EXISTS public.backup_restore_log (
  id                     bigserial PRIMARY KEY,
  tipus                  text NOT NULL CHECK (tipus IN
                           ('preview','restore','download','passphrase_fail','prune')),
  actor_profile_id       uuid,
  actor_email            text,
  actor_ip_hash          text,             -- lib/utils/ip-hash.ts — NYERS IP SOHA
  congregation_id        uuid,
  congregation_nev       text,
  backup_log_id          bigint REFERENCES public.backup_log(id) ON DELETE SET NULL,
  backup_run_date        date,
  backup_sha256          text,
  pre_restore_backup_id  bigint,
  plan_token_hash        text,             -- egyszer használható terv-token
  -- ⚠️ Az indoklás ITT TÉNYLEG A NAPLÓBA MEGY. A wipe-congregation-panel.tsx:79-80
  -- bevallja, hogy ott ma csak a UI-ban él. Ezt a hibát nem ismételjük.
  indoklas               text,
  rows_before            jsonb,
  rows_after             jsonb,
  tables_touched         jsonb,
  outcome                text NOT NULL DEFAULT 'indult'
                           CHECK (outcome IN ('indult','ok','failed','rolled_back')),
  started_at             timestamptz NOT NULL DEFAULT now(),
  finished_at            timestamptz,
  error_message          text
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_log_ido
  ON public.backup_restore_log (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_restore_log_fek
  ON public.backup_restore_log (tipus, actor_profile_id, started_at DESC);

COMMENT ON TABLE public.backup_restore_log IS
  '2026-08-11: CSAK HOZZÁFŰZHETŐ napló a letöltésekről és visszaállításokról. SEMMILYEN UPDATE és SEMMILYEN DELETE policy — a cselekvő ne tudja eltüntetni a nyomát. A „started" sor a művelet ELŐTT íródik: ha a folyamat közben meghal, a lezáratlan sor MAGA a riasztás.';

-- ─── 1/e) backup_restore_staging — a visszaállítandó adat ───────────────────
-- Miért kell: egy közepes gyülekezet ~10-15 MB JSON. Egyetlen RPC-hívás
-- törzseként ez törékeny; 500 soros darabokban stabil. Az ALKALMAZÁS
-- (a felülírás) így is EGY tranzakcióban fut, a staging tartalmából.
CREATE TABLE IF NOT EXISTS public.backup_restore_staging (
  session_id   uuid NOT NULL,
  tabla        text NOT NULL,
  sorszam      int  NOT NULL,
  sorok        jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, tabla, sorszam)
);

CREATE INDEX IF NOT EXISTS idx_backup_restore_staging_kor
  ON public.backup_restore_staging (created_at);

COMMENT ON TABLE public.backup_restore_staging IS
  '2026-08-11: a visszaállítandó sorok átmeneti tárolója. Személyes adatot tartalmaz → RLS bekapcsolva, EGYETLEN POLICY SEM. A visszaállítás végén ürül; a 24 óránál régebbi sorokat a napi worker takarítja.';

-- ─── 1/f) congregations.restore_epoch ───────────────────────────────────────
-- A visszaállított sorok RÉGI updated_at-tal jönnek vissza, ezért az offline
-- kliens delta-pullja (lib/offline/pull.ts: `updated_at > lastPullAt`) SOHA
-- nem venné észre őket, a törölt sorok pedig soha nem tűnnének el a Dexie-ből.
-- Enélkül a lelkész laptopja a következő szinkronnál NÉMÁN VISSZACSINÁLNÁ a
-- visszaállítást. Az epoch változása = teljes kliens-újratöltés + a helyi
-- mutációs sor KARANTÉNBA (nem eldobás).
ALTER TABLE public.congregations
  ADD COLUMN IF NOT EXISTS restore_epoch integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.congregations.restore_epoch IS
  '2026-08-11: a visszaállítás lépteti. Az offline kliens minden szinkron elején összeveti a sajátjával; eltérésnél teljes újratöltés + a helyi mutációs sor karanténba.';


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 2 — RLS MINDEN ÚJ TÁBLÁN
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.backup_table_policy     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_restore_staging  ENABLE ROW LEVEL SECURITY;

-- backup_table_policy / backup_settings / backup_restore_staging:
-- RLS BE, POLICY SEMMI → csak a service_role és a SECURITY DEFINER függvények
-- érik el. A felület szerver-action-ön keresztül kap belőlük biztonságos mezőket.
-- (Ez SZÁNDÉKOS, nem hiányzó munka.)

-- ─── backup_log olvasás ─────────────────────────────────────────────────────
-- ⚠️ NEM a data_wipe_log 2026-04-24-es policy-jét másoljuk (az sem `status`-t,
-- sem kerületet nem nézett). A minta a 2026-08-11-adattorlesi-naplo-policy.sql.
DROP POLICY IF EXISTS backup_log_read ON public.backup_log;
CREATE POLICY backup_log_read ON public.backup_log
  FOR SELECT
  USING (
    -- 1) Rendszergazda / master: korlátlan, de KIZÁRÓLAG AKTÍV profillal
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role IN ('admin','master')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid() AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )
    -- 2) Egyházkerületi admin: CSAK a saját kerülete gyülekezetei.
    --    A lánc a VALÓDI kapcsolaton: congregations.diocese_id → dioceses.district_id.
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = backup_log.congregation_id
      JOIN public.dioceses      d ON d.id = c.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active' AND d.district_id IS NOT NULL
        AND (
          (p.role = 'egyhazkeruleti_admin' AND d.district_id = p.district_id)
          OR EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = p.id AND pr.scope = 'district'
              AND pr.scope_id = d.district_id
              AND pr.active = true AND pr.approval_status = 'approved'
          )
        )
    )
    -- 3) Lelkész: KIZÁRÓLAG a SAJÁT gyülekezete mentés-állapota (a tulajdonos
    --    1. döntése: „gyülekezeti mentés a lelkésznek a SAJÁT gyülekezetéről").
    OR (
      backup_log.congregation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.status = 'active'
          AND (
            p.congregation_id = backup_log.congregation_id
            OR EXISTS (
              SELECT 1 FROM public.profile_congregations pc
              WHERE pc.profile_id = p.id
                AND pc.congregation_id = backup_log.congregation_id
                AND pc.active = true AND pc.approval_status = 'approved'
            )
          )
      )
    )
  );

COMMENT ON POLICY backup_log_read ON public.backup_log IS
  '2026-08-11: mentési napló olvasása. Master/admin korlátlanul (CSAK aktív profillal), kerületi admin a saját kerületére, lelkész KIZÁRÓLAG a saját gyülekezetére. INSERT/UPDATE/DELETE policy SZÁNDÉKOSAN nincs — csak a service_role ír.';

-- ─── backup_restore_log olvasás (lelkész NEM) ───────────────────────────────
DROP POLICY IF EXISTS backup_restore_log_read ON public.backup_restore_log;
CREATE POLICY backup_restore_log_read ON public.backup_restore_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role IN ('admin','master')
    )
    OR EXISTS (
      SELECT 1 FROM public.profile_roles pr
      WHERE pr.profile_id = auth.uid() AND pr.scope = 'system' AND pr.role = 'admin'
        AND pr.active = true AND pr.approval_status = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.congregations c ON c.id = backup_restore_log.congregation_id
      JOIN public.dioceses      d ON d.id = c.diocese_id
      WHERE p.id = auth.uid() AND p.status = 'active' AND d.district_id IS NOT NULL
        AND (
          (p.role = 'egyhazkeruleti_admin' AND d.district_id = p.district_id)
          OR EXISTS (
            SELECT 1 FROM public.profile_roles pr
            WHERE pr.profile_id = p.id AND pr.scope = 'district'
              AND pr.scope_id = d.district_id
              AND pr.active = true AND pr.approval_status = 'approved'
          )
        )
    )
  );

-- Táblaszintű jogok: az anon SEMMIT, az authenticated CSAK olvashat (a policy szűr).
REVOKE ALL ON public.backup_table_policy, public.backup_settings,
              public.backup_log, public.backup_restore_log,
              public.backup_restore_staging
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.backup_log, public.backup_restore_log TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 3 — A BESOROLÁS FELTÖLTÉSE
-- ════════════════════════════════════════════════════════════════════════════
-- Sorrend SZÁMÍT: előbb a KÉZI (explicit) sorok, utána az automatikus feltöltés
-- ON CONFLICT DO NOTHING-gal — így a kézi besorolás mindig nyer.

-- ─── 3/a) KIZÁRT — TITOK. Ezek SOHA nem kerülhetnek mentésbe. ───────────────
-- Engedélyezőlistás megközelítés: ami nincs itt és nincs máshol besorolva, az
-- HANGOS HIBA. Tiltólistával egy jövőbeli titok-tábla NÉMÁN bekerülne.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes) VALUES
 ('backup_settings',      'kizart_titok', NULL, false, 'A mentési jelszó ellenőrző hash-e és a Drive refresh token.'),
 ('backup_restore_staging','kizart_titok',NULL, false, 'Átmeneti visszaállítási adat — nincs értelme menteni.'),
 ('system_settings',      'kizart_titok', NULL, false, 'god_mode_pin és egyéb rendszer-titkok.'),
 ('document_keys',        'kizart_titok', NULL, false, 'Dokumentum-kulcsok.'),
 ('lelkeszi_naptar_token','kizart_titok', NULL, false, 'BEMUTATÓRA JOGOSÍTÓ token: egy kiszivárgott mentés MŰKÖDŐ naptár-URL-eket osztana ki.'),
 ('upload_sessions',      'kizart_titok', NULL, false, 'Rövid életű QR/feltöltési tokenek — bemutatóra jogosító képességek.'),
 ('oblio_fiokok',         'kizart_titok', NULL, false, 'Oblio API-hitelesítők. Visszaállítás után KÉZZEL kell újra megadni — ezt a felület kiírja.')
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/b) KIZÁRT — EGYÉB (megnevezett, dokumentált kihagyás) ────────────────
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes) VALUES
 ('monetar',            'kizart_egyeb', NULL, false, 'Készpénz-címletjegyzék: NINCS congregation_id és NINCS FK a gyülekezethez, csak szabad szöveges source/sourceid. Gyülekezethez megbízhatóan NEM rendelhető. EXPLICIT, dokumentált kihagyás — NEM néma.'),
 ('backup_log',         'kizart_egyeb', NULL, false, 'Nincs rekurzió.'),
 ('backup_restore_log', 'kizart_egyeb', NULL, false, 'Nincs rekurzió; a napló nem írható felül.'),
 ('backup_table_policy','kizart_egyeb', NULL, false, 'Nincs rekurzió.'),
 ('data_wipe_log',      'kizart_egyeb', NULL, false, 'Üzemeltetési napló — egy visszaállítás nem írhatja át a rendszer emlékezetét.')
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/c) AUDIT-NAPLÓK: mentjük, de SOHA nem állítjuk vissza ────────────────
-- ⚠️ Az `audit_log` NEM gyülekezeti: nincs benne `congregation_id` (csak
--    `user_id` + `target_table`/`target_id`). Lásd a 3/i szakasz javítását.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes) VALUES
 ('audit_log',                    'globalis',   1, false, 'RENDSZERSZINTŰ napló: NINCS congregation_id oszlopa. A globális (rendszergazdai) mentésbe kerül.'),
 ('member_portal_audit_log',      'gyulekezet', 7, false, 'Van congregation_id (nullázható).'),
 ('member_portal_data_audit_log', 'gyulekezet', 7, false, 'ua.'),
 ('family_link_audit',            'gyulekezet', 7, false, 'ua.')
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/d) JOIN-ON SZŰRENDŐ gyülekezeti táblák ───────────────────────────────
-- Ezekben NINCS (megbízható) congregation_id. Az oszlopneveket a
-- migration-docs/Database_schema.sql-ből ELLENŐRIZTEM.
-- ⚠️ A `gyerek`-et MINDKÉT úton szűrni kell (szemely ÉS csalad) — ez a
--    2026-08-09-es wipe tanulsága.
INSERT INTO public.backup_table_policy (tabla, hatokor, join_predikatum, reteg, megjegyzes) VALUES
 ('csalad', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.szemely s WHERE s.congregation_id = $1 AND (s.id = t.id_ferfi OR s.id = t.id_no))',
  4, 'csalad.id_ferfi / id_no → szemely(id). Nincs congregation_id.'),

 ('gyerek', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.szemely s WHERE s.congregation_id = $1 AND s.id = t.id_szemely) OR EXISTS (SELECT 1 FROM public.csalad c JOIN public.szemely s2 ON (s2.id = c.id_ferfi OR s2.id = c.id_no) WHERE s2.congregation_id = $1 AND c.id = t.id_csalad)',
  4, 'MINDKÉT úton szűrni kell — a féloldalas szűrés némán hagy ki gyerekeket.'),

 ('presbiter', 'gyulekezet',
  't.congregation_id = $1 OR EXISTS (SELECT 1 FROM public.szemely s WHERE s.congregation_id = $1 AND s.id = t.id_szemely)',
  4, 'congregation_id NULLÁZHATÓ — a szemely-úton is szűrünk.'),

 ('felmentes', 'gyulekezet',
  't.congregation_id = $1 OR EXISTS (SELECT 1 FROM public.szemely s WHERE s.congregation_id = $1 AND s.id = t.id_szemely)',
  4, 'congregation_id NULLÁZHATÓ.'),

 ('kiadasikiseroiv', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.kiadas k WHERE k.congregation_id = $1 AND k.id = t.id_kiadas)',
  5, 'kiadasikiseroiv.id_kiadas → kiadas(id).'),

 ('sirhely', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.sirhelytemeto st WHERE st.congregation_id = $1 AND st.id = t.temetoid)',
  6, 'VALÓDI FK-KÖR: sirhely.aktivberlesid ⇄ sirhelyberles.sirhelyid. A visszaállítás aktivberlesid=NULL-lal szúr be, majd UPDATE-tel pótol.'),

 ('sirhelyberles', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.sirhely sh JOIN public.sirhelytemeto st ON st.id = sh.temetoid WHERE st.congregation_id = $1 AND sh.id = t.sirhelyid)',
  6, 'sirhelyberles.befizetesid → befizetes(id): a TEMETŐ a PÉNZÜGY UTÁN jön (R6 > R5).'),

 ('sirhelyelhunyt', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.sirhely sh JOIN public.sirhelytemeto st ON st.id = sh.temetoid WHERE st.congregation_id = $1 AND sh.id = t.sirhelyid)',
  6, NULL),

 ('jegyzokonyv_resztvevok', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j WHERE j.congregation_id = $1 AND j.id = t.jegyzokonyv_id)',
  7, NULL),

 ('jegyzokonyv_napirendi_pontok', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j WHERE j.congregation_id = $1 AND j.id = t.jegyzokonyv_id)',
  7, NULL),

 ('jegyzokonyv_hatarozatok', 'gyulekezet',
  'EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j WHERE j.congregation_id = $1 AND j.id = t.jegyzokonyv_id)',
  7, 'A napirendi pontra IS mutat → utána jön.')
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/e) GLOBÁLIS / REFERENCIA (a rendszer-mentésbe, gyülekezetibe NEM) ────
-- FONTOS: ezek az R0/R1 rétegek. A GOMBBAL indított gyülekezeti visszaállítás
-- SOHA nem nyúl hozzájuk (visszaallithato = false) — a bérlő-váz és a
-- referencia-adat helyreállítása RUNBOOK, nem kattintás.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, visszaallithato, megjegyzes) VALUES
 ('member_accounts','globalis',1,false,'TENANT-SEMLEGES tagi fiók: NINCS congregation_id oszlopa (a gyülekezethez kötés a member_person_links-ben van). Egy fiók TÖBB gyülekezethez is tartozhat — gyülekezeti mentésbe véve a visszaállítás MÁS gyülekezet fiókját is törölné.'),
 ('member_newsletter_preferences','globalis',1,false,'A member_accounts-hoz tartozik (PK = member_account_id), NINCS congregation_id.'),
 ('adrcountry','globalis',0,false,NULL), ('adrcounty','globalis',0,false,NULL),
 ('adrlocality','globalis',0,false,'~13 832 sor'), ('adrstreet','globalis',0,false,'~40 300 sor'),
 ('adrlocality_alias','globalis',0,false,NULL), ('nevnap','globalis',0,false,NULL),
 ('nom_cimlet','globalis',0,false,NULL), ('szamadasicel','globalis',0,false,NULL),
 ('befizetescel','globalis',0,false,'ÖN-HIVATKOZÓ (fa-struktúra).'),
 ('kiadascel','globalis',0,false,'ÖN-HIVATKOZÓ (fa-struktúra).'),
 ('public_site_themes','globalis',0,false,NULL),
 ('system_pricing_tiers','globalis',0,false,NULL),
 ('system_finance_costs','globalis',0,false,NULL),
 ('system_finance_income','globalis',0,false,NULL),
 ('system_broadcasts','globalis',0,false,NULL),
 ('mm_kategoriak','globalis',0,false,NULL), ('mm_jelveny_tipusok','globalis',0,false,NULL),
 ('mm_segedanyagok','globalis',0,false,NULL),
 ('districts','globalis',1,false,'Bérlő-váz.'), ('dioceses','globalis',1,false,'Bérlő-váz.'),
 ('congregations','globalis',1,false,'Bérlő-váz. A gyülekezeti visszaállítás NEM írja felül.'),
 ('profiles','globalis',1,false,'auth.users-re mutat — a jelszó-hash a Data API-n NEM menthető.'),
 ('profile_roles','globalis',1,false,NULL), ('profile_congregations','globalis',1,false,NULL),
 ('profile_preferences','globalis',1,false,NULL), ('pastor_profiles','globalis',1,false,NULL),
 ('pastor_service_history','globalis',1,false,NULL), ('licenses','globalis',1,false,NULL),
 ('standalone_licenses','globalis',1,false,NULL), ('user_devices','globalis',1,false,NULL),
 ('wizard_progress','globalis',1,false,NULL), ('access_requests','globalis',1,false,NULL),
 ('admin_access_requests','globalis',1,false,NULL), ('erasure_requests','globalis',1,false,NULL),
 ('support_tickets','globalis',1,false,NULL),
 ('diocese_bealitas','globalis',2,false,'Egyházmegyei szint — külön hatókör.'),
 ('diocese_befizetes','globalis',2,false,NULL), ('diocese_kiadas','globalis',2,false,NULL),
 ('diocese_koltsegvetes','globalis',2,false,'Kompozit PK: (diocese_id, eve, szamadasicelid).'),
 ('diocese_annual_reports','globalis',2,false,NULL)
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/f) A KÉTOLDALÚ HATÓKÖRŰ táblák — EXPLICIT szabály ────────────────────
-- Egy sor KÉT gyülekezethez tartozik. Ha mindkettő mentésébe bekerül, a
-- visszatöltés kulcsütközésen bukik; ha egyikbe sem, az adat elvész.
-- SZABÁLY: a KEZDEMÉNYEZŐ oldal menti. A visszatöltés ON CONFLICT DO NOTHING.
INSERT INTO public.backup_table_policy (tabla, hatokor, join_predikatum, reteg, megjegyzes) VALUES
 ('cross_congregation_match_notifications','gyulekezet',
  't.triggering_congregation_id = $1', 7,
  'KÉTOLDALÚ: a kezdeményező (triggering) oldal menti, a matched oldal NEM.'),
 ('member_transfer_notifications','gyulekezet',
  't.source_congregation_id = $1', 7,
  'KÉTOLDALÚ: a FORRÁS oldal menti.'),
 ('congregation_transfers','gyulekezet',
  't.source_congregation_id = $1', 7,
  'KÉTOLDALÚ: a FORRÁS oldal menti.')
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/g) A KULCS-RÉTEGEK explicit besorolása (R2..R7) ──────────────────────
-- Ezek MIND rendelkeznek congregation_id-vel, tehát az automatikus feltöltés is
-- megtalálná őket — de a RÉTEG (a visszatöltés sorrendje) csak innen tudható.
--
-- ⚠️ 2026-08-11 — A TERVEZETBEN itt állt egy rövid, „csak illusztráció" INSERT
--    ('bealitas',2,NULL), ('csoport',2,NULL) értékekkel, NÉGY deklarált oszlop
--    mellett HÁROM értékkel. Az `ON CONFLICT DO NOTHING` ezt NEM nyeli le: a
--    `INSERT has more target columns than expressions` SZINTAKTIKAI hiba, ami az
--    EGÉSZ tranzakciót visszagörgetné — a migráció el sem indulna. Kihagytuk;
--    mindkét tábla (`bealitas`, `csoport`) az alábbi teljes listában szerepel.
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, megjegyzes) VALUES
 ('bealitas','gyulekezet',2,'KOMPOZIT PK: (id, congregation_id), ahol az id egy varchar ÉV. ÉVZÁRÁS-státuszok!'),
 ('congregation_annual_fees','gyulekezet',2,NULL),
 ('congregation_custom_fees','gyulekezet',2,NULL),
 ('congregation_subscriptions','gyulekezet',2,NULL),
 ('congregation_pastor_history','gyulekezet',2,NULL),
 ('congregation_remarks','gyulekezet',2,NULL),
 ('csoport','gyulekezet',2,NULL),
 ('bankszamlak','gyulekezet',2,'GENERATED ALWAYS AS IDENTITY.'),
 ('koltsegvetes','gyulekezet',2,'KOMPOZIT PK: (bealitasid, szamadasicelid, congregation_id).'),
 ('keszpenz_nyito_egyenleg','gyulekezet',2,NULL),
 ('bankszamla_nyito_egyenleg','gyulekezet',2,NULL),
 ('jarulek_kedvezmeny','gyulekezet',2,NULL),
 ('chitanta_tombok','gyulekezet',2,NULL),
 ('iktato_sequence_pointers','gyulekezet',2,'KOMPOZIT PK: (congregation_id, year).'),
 ('iratszam_pointers','gyulekezet',2,NULL),
 ('penzugyi_bizonylat_sorszam','gyulekezet',2,'KOMPOZIT PK: (congregation_id, ev, tipus).'),
 ('public_sites','gyulekezet',2,NULL),
 ('sirhelytemeto','gyulekezet',2,NULL),
 ('iratcsomo','gyulekezet',2,NULL),
 ('iktato_sablonok','gyulekezet',2,NULL),
 ('gyulekezeti_programok','gyulekezet',2,NULL),
 -- R3 — a forgópont
 ('cim','gyulekezet',3,NULL),
 ('szemely','gyulekezet',3,'ÖN-FK TERMÉSZETES KULCSRA: id_apja/id_anyja → szemely(cnp). Táblánként EGYETLEN INSERT utasítás → az FK-triggerek az utasítás VÉGÉN futnak, tehát a szülő-gyermek megoldódik. A `kep` (base64 fénykép) KÜLÖN média-fájlba megy.'),
 -- R4 — személy-függő
 ('haztartas','gyulekezet',4,NULL), ('haztartas_tag','gyulekezet',4,NULL),
 ('szemely_kapcsolat','gyulekezet',4,NULL), ('csaladlatogatas','gyulekezet',4,'GENERATED ALWAYS AS IDENTITY.'),
 ('member_validation_errors','gyulekezet',4,NULL), ('member_person_links','gyulekezet',4,'⚠️ KÉT GENERATED ALWAYS oszlopa van (live_person_id, live_congregation_id) — a visszaállítás EXPLICIT oszloplistával szúr be, azok nélkül.'),
 ('member_person_change_requests','gyulekezet',4,NULL),
 ('member_congregation_applications','gyulekezet',4,NULL),
 ('attert','gyulekezet',4,NULL), ('bekoltozott','gyulekezet',4,NULL),
 ('elkoltozott','gyulekezet',4,NULL), ('kitert','gyulekezet',4,NULL),
 ('keresztseg','gyulekezet',4,NULL), ('konfirmalas','gyulekezet',4,NULL),
 ('hazassag','gyulekezet',4,NULL), ('temetes','gyulekezet',4,NULL),
 ('leltar_tetelek','gyulekezet',4,NULL), ('berleti_szerzodes','gyulekezet',4,NULL),
 ('materials','gyulekezet',4,NULL),
 -- R5 — pénzügy
 ('befizetes','gyulekezet',5,'⚠️ nyugta-számláló: a visszaállítás GREATEST-tel emeli, SOHA nem tekeri vissza.'),
 ('kiadas','gyulekezet',5,NULL), ('belsomozgas','gyulekezet',5,NULL),
 ('valuta_atert','gyulekezet',5,NULL), ('material_movements','gyulekezet',5,NULL),
 ('decont','gyulekezet',5,NULL), ('dispozitie','gyulekezet',5,NULL),
 ('transactions','gyulekezet',5,NULL),
 ('oblio_szamlak','gyulekezet',5,'befizetes / berleti_szerzodes / chitanta_tombok UTÁN.'),
 ('oblio_kiadas_match','gyulekezet',5,NULL),
 -- R7 — naplók, dokumentumok
 ('munkanaplo','gyulekezet',7,'⚠️ A megjegyzés-mező LÁTOGATÁSI, lelkigondozói feljegyzés.'),
 ('igehirdetesi_terv','gyulekezet',7,NULL), ('kulonleges_alkalom','gyulekezet',7,NULL),
 ('iktato','gyulekezet',7,'⚠️ sequence_number: GREATEST, soha vissza.'),
 ('iktato_csatolmany','gyulekezet',7,'⚠️ storage_path a Supabase Storage-ra mutat — a FÁJL nincs a mentésben (v1).'),
 ('iktato_yearly_closures','gyulekezet',7,'KOMPOZIT PK: (congregation_id, year).'),
 ('presbiteri_jegyzokonyvek','gyulekezet',7,NULL),
 ('annual_reports','gyulekezet',7,NULL), ('lelkeszi_jelentes','gyulekezet',7,NULL),
 ('gyulekezeti_celok','gyulekezet',7,NULL), ('document_submissions','gyulekezet',7,NULL),
 ('import_logs','gyulekezet',7,NULL), ('support_messages','gyulekezet',7,NULL),
 ('ertesitesek','gyulekezet',7,NULL),
 ('public_posts','gyulekezet',7,NULL), ('public_magazines','gyulekezet',7,NULL),
 ('public_magazine_issues','gyulekezet',7,NULL),
 ('member_newsletter_campaigns','gyulekezet',7,NULL),
 ('member_newsletter_deliveries','gyulekezet',7,NULL)
ON CONFLICT (tabla) DO NOTHING;

-- ─── 3/h) AUTOMATIKUS FELTÖLTÉS ─────────────────────────────────────────────
-- Minden ÉLŐ public tábla, aminek van congregation_id oszlopa és még nincs
-- sora: bekerül `gyulekezet` hatókörrel, DE `reteg = NULL`-lal.
--   → A MENTÉS így SOHA nem hagy ki adatot (A alapelv).
--   → A VISSZAÁLLÍTÁS megtagadja, amíg a réteg nincs kitöltve (B alapelv).
INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, megjegyzes)
SELECT t.table_name, 'gyulekezet', NULL,
       'AUTOMATIKUS besorolás (van congregation_id oszlopa). A RÉTEG hiányzik: mentjük, de visszaállítani csak besorolás után lehet.'
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = t.table_name
      AND c.column_name = 'congregation_id'
  )
ON CONFLICT (tabla) DO NOTHING;


-- ─── 3/i) JAVÍTÓ FELÜLÍRÁS — 2026-08-11 ─────────────────────────────────────
-- ⚠️ EZ NEM `DO NOTHING`, HANEM `DO UPDATE`. Szándékosan.
--
-- A fenti INSERT-ek mind `ON CONFLICT DO NOTHING`-gal futnak, tehát egy MÁR
-- TELEPÍTETT adatbázisban a hibás besorolást NEM javítanák ki. Márpedig három
-- tábla hibásan `gyulekezet` hatókörrel, `join_predikatum = NULL`-lal került
-- be, holott NINCS bennük `congregation_id` oszlop:
--
--     member_accounts                 (tenant-semleges tagi fiók)
--     member_newsletter_preferences   (a fiókhoz tartozik, nem gyülekezethez)
--     audit_log                       (rendszerszintű napló, user_id-vel)
--
-- Következmény: a `backup_scope_where()` az alapértelmezett
-- `t.congregation_id = $1` szűrőt adta vissza, a `backup_count_table` pedig
-- 42703 (undefined_column) hibára futott — VAGYIS EGYETLEN GYÜLEKEZETI MENTÉS
-- SEM KÉSZÜLT VOLNA EL, MINDEGYIK A SZÁMLÁLÁSNÁL ELHASALT VOLNA.
--
-- A `member_accounts` esetében a `join_predikatum` sem lett volna elég: egy
-- tagi fiók TÖBB gyülekezethez is kapcsolódhat, és a gyülekezeti visszaállítás
-- (törlés + újraírás) a MÁSIK gyülekezet fiókját is elvinné. Ezért mindkettő a
-- GLOBÁLIS (rendszergazdai) mentésbe kerül, `visszaallithato = false`-szal.
INSERT INTO public.backup_table_policy (tabla, hatokor, join_predikatum, reteg, visszaallithato, megjegyzes) VALUES
 ('member_accounts','globalis',NULL,1,false,
  'JAVÍTVA 2026-08-11: nincs congregation_id oszlopa; több gyülekezethez is tartozhat. Globális hatókör.'),
 ('member_newsletter_preferences','globalis',NULL,1,false,
  'JAVÍTVA 2026-08-11: nincs congregation_id oszlopa (PK = member_account_id). Globális hatókör.'),
 ('audit_log','globalis',NULL,1,false,
  'JAVÍTVA 2026-08-11: rendszerszintű napló, nincs congregation_id oszlopa. Globális hatókör.')
ON CONFLICT (tabla) DO UPDATE SET
  hatokor         = EXCLUDED.hatokor,
  join_predikatum = EXCLUDED.join_predikatum,
  reteg           = EXCLUDED.reteg,
  visszaallithato = EXCLUDED.visszaallithato,
  megjegyzes      = EXCLUDED.megjegyzes;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 4 — RPC-K
-- Mind SECURITY DEFINER, RÖGZÍTETT search_path-szal
-- (a 2026-08-11-security-definer-hardening.sql mintája), és KIZÁRÓLAG a
-- service_role hívhatja őket. Ez a valódi kapu: az alkalmazás-réteg
-- (requireAdminAccess) az ELSŐ védvonal, ez a MÁSODIK.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 4/a) LELTÁR: mi van élesben és be van-e sorolva ────────────────────────
CREATE OR REPLACE FUNCTION public.backup_live_tables()
RETURNS TABLE (
  tabla               text,
  van_congregation_id boolean,
  hatokor             text,
  reteg               smallint,
  visszaallithato     boolean,
  join_predikatum     text,
  identity_always     text[],
  pk_oszlopok         text[],
  oszlopok            text[]
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    t.table_name::text,
    EXISTS (SELECT 1 FROM information_schema.columns c
            WHERE c.table_schema = 'public' AND c.table_name = t.table_name
              AND c.column_name = 'congregation_id'),
    p.hatokor,
    p.reteg,
    COALESCE(p.visszaallithato, false),
    p.join_predikatum,
    COALESCE((SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
              FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.table_name
                AND c.is_identity = 'YES' AND c.identity_generation = 'ALWAYS'), '{}'::text[]),
    COALESCE((SELECT array_agg(a.attname::text ORDER BY k.ord)
              FROM pg_constraint con
              JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord) ON true
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
              WHERE con.conrelid = ('public.' || quote_ident(t.table_name))::regclass
                AND con.contype = 'p'), '{}'::text[]),
    COALESCE((SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
              FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = t.table_name), '{}'::text[])
  FROM information_schema.tables t
  LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.backup_live_tables() IS
  '2026-08-11: az ÉLŐ tábla-lista a besorolással összefésülve. Ha bármely sorban hatokor IS NULL, a mentés HANGOS HIBÁVAL elhasal — a néma kihagyás a legrosszabb kimenet.';

-- ─── 4/b) A GYÜLEKEZET-SZŰRŐ egyetlen igazság-forrása ──────────────────────
CREATE OR REPLACE FUNCTION public.backup_scope_where(p_tabla text, p_globalis boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE v_p public.backup_table_policy;
BEGIN
  SELECT * INTO v_p FROM public.backup_table_policy WHERE tabla = p_tabla;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BESOROLATLAN TÁBLA: %. Vedd fel a backup_table_policy-be, mielőtt a mentés futna.', p_tabla;
  END IF;
  IF p_globalis THEN
    IF v_p.hatokor <> 'globalis' THEN
      RAISE EXCEPTION 'A(z) % tábla NEM globális hatókörű (%).', p_tabla, v_p.hatokor;
    END IF;
    -- ⚠️ NEM egyszerűen `true`: a hívók MINDIG `USING p_congregation_id`-vel
    --    futtatják az EXECUTE-ot, és a PL/pgSQL HIBÁT dob („too many parameters
    --    specified for EXECUTE"), ha a lekérdezés nem hivatkozik a $1-re.
    --    Globális hatókörben a p_congregation_id definíció szerint NULL, tehát
    --    ez a feltétel MINDIG igaz — és közben elhasználja a paramétert.
    RETURN '($1 IS NULL)';
  END IF;
  IF v_p.hatokor <> 'gyulekezet' THEN
    RAISE EXCEPTION 'A(z) % tábla NEM gyülekezeti hatókörű (%).', p_tabla, v_p.hatokor;
  END IF;
  RETURN COALESCE(v_p.join_predikatum, 't.congregation_id = $1');
END;
$$;

COMMENT ON FUNCTION public.backup_scope_where(text, boolean) IS
  '2026-08-11: a mentés/visszaállítás EGYETLEN hatókör-szűrője. Besorolatlan táblára HIBÁT dob. Globális hatókörben `($1 IS NULL)`-t ad vissza — nem `true`-t —, hogy az EXECUTE ... USING paraméter-száma egyezzen.';

-- ─── 4/c) VÁRHATÓ SORSZÁM (ez a „varhato" a hármas egyeztetésben) ──────────
CREATE OR REPLACE FUNCTION public.backup_count_table(
  p_congregation_id uuid,
  p_tabla           text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE v_where text; v_n bigint;
BEGIN
  v_where := public.backup_scope_where(p_tabla, p_congregation_id IS NULL);
  EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s', p_tabla, v_where)
    INTO v_n USING p_congregation_id;
  RETURN v_n;
END;
$$;

-- ─── 4/d) DUMP — KULCS-ALAPÚ (keyset) lapozás ──────────────────────────────
-- `to_jsonb(t)` = TELJES sor. A table-registry.ts `select` listái NEM
-- használhatók: azok szándékosan kivágják a `kep`, `szig`, `taj`, a szülő-FK-k
-- és MINDEN GDPR-consent mezőt. Mentéshez ez kevés lenne.
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ 2026-08-11 JAVÍTÁS: `OFFSET` → KULCS-ALAPÚ LAPOZÁS
-- ════════════════════════════════════════════════════════════════════════════
-- Minden lap külön RPC-hívás, tehát KÜLÖN PILLANATKÉP. `OFFSET`-tel elég, ha
-- két lap között törlődik egy sor, ami az aktuális eltolás ELŐTT rendeződik:
-- onnantól minden későbbi sor eggyel „lecsúszik", és PONTOSAN EGY SOR SOHA nem
-- kerül a mentésbe. A hármas egyeztetés (várható = kiírt = visszaolvasott) ezt
-- NEM fogja meg, ha ugyanabban az ablakban egy beszúrás is történik — egy
-- duplikált személy javítása (egy törlés + egy felvitel) pontosan ilyen.
--
-- A kulcs-alapú lapozás POZÍCIÓ helyett az UTOLSÓ LÁTOTT KULCSRA hivatkozik
-- (`WHERE (pk…) > (utolsó…)`), tehát a sorok elcsúszása nem érinti.
--
-- A visszaadott sor alakja: `{ "kulcs": <pk-tömb vagy ctid-szöveg>, "sor": {…} }`
-- — a hívónak a folytatási pontot is ismernie kell.
--
-- ⚠️ PK NÉLKÜLI TÁBLA: `ctid`-vel lapozunk. A `ctid` egy HOT-update-nél
--    elmozdulhat, ezért ez ott csak a kevésbé rossz megoldás; a hármas
--    egyeztetés az utolsó védvonal. PK nélküli MENTENDŐ tábla ma nincs — ha
--    lesz, a fájl végi ellenőrző SELECT megnevezi.
DROP FUNCTION IF EXISTS public.backup_dump_table(uuid, text, bigint, int);

CREATE OR REPLACE FUNCTION public.backup_dump_table(
  p_congregation_id uuid,
  p_tabla           text,
  p_limit           int   DEFAULT 500,
  p_after           jsonb DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_where    text;
  v_pk       text[];
  v_order    text;
  v_kulcs    text;
  v_keyset   text := '';
  v_ertekek  text;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Érvénytelen lapméret: %', p_limit;
  END IF;
  v_where := public.backup_scope_where(p_tabla, p_congregation_id IS NULL);

  SELECT COALESCE(array_agg(a.attname::text ORDER BY k.ord), '{}'::text[]) INTO v_pk
  FROM pg_constraint con
  JOIN LATERAL unnest(con.conkey) WITH ORDINALITY k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
  WHERE con.conrelid = ('public.' || quote_ident(p_tabla))::regclass
    AND con.contype = 'p';

  IF array_length(v_pk, 1) IS NULL THEN
    -- Nincs PK: a ctid a folytatási kulcs. Szövegként utazik, `tid`-re castolva
    -- hasonlítjuk — így a sorrend és a szűrés ugyanaz a rendezés szerint.
    v_order := 't.ctid';
    v_kulcs := 'to_jsonb(t.ctid::text)';
    IF p_after IS NOT NULL THEN
      v_keyset := format(' AND t.ctid > %L::tid', p_after #>> '{}');
    END IF;
  ELSE
    SELECT string_agg(format('t.%I', c), ', ' ORDER BY o)
      INTO v_order FROM unnest(v_pk) WITH ORDINALITY AS u(c, o);
    SELECT string_agg(format('to_jsonb(t.%I)', c), ', ' ORDER BY o)
      INTO v_kulcs FROM unnest(v_pk) WITH ORDINALITY AS u(c, o);
    v_kulcs := format('jsonb_build_array(%s)', v_kulcs);
    IF p_after IS NOT NULL THEN
      -- Sor-összehasonlítás: `(pk1, pk2, …) > (a1, a2, …)`. A jobb oldal a
      -- jsonb-tömbből jön, minden elem a SAJÁT oszlop típusára castolva —
      -- különben a szöveges összehasonlítás („10" < „9") csendben rossz
      -- sorrendet adna, és sorok maradnának ki.
      SELECT string_agg(
               format('(%L::jsonb #>> ''{%s}'')::%s',
                      p_after, o - 1,
                      format_type(a.atttypid, a.atttypmod)),
               ', ' ORDER BY o)
        INTO v_ertekek
      FROM unnest(v_pk) WITH ORDINALITY AS u(c, o)
      JOIN pg_attribute a
        ON a.attrelid = ('public.' || quote_ident(p_tabla))::regclass
       AND a.attname = u.c;

      v_keyset := format(' AND (%s) > (%s)', v_order, v_ertekek);
    END IF;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT jsonb_build_object(''kulcs'', %s, ''sor'', to_jsonb(t)) '
    'FROM public.%I t WHERE (%s)%s ORDER BY %s LIMIT %s',
    v_kulcs, p_tabla, v_where, v_keyset, v_order, p_limit
  ) USING p_congregation_id;
END;
$$;

COMMENT ON FUNCTION public.backup_dump_table(uuid, text, int, jsonb) IS
  '2026-08-11: KULCS-ALAPÚ (keyset) lapozás. Az OFFSET-es változat két lap között törölt sornál PONTOSAN EGY sort némán kihagyott volna, és a darabszám-egyeztetés ezt egy egyidejű beszúrás mellett nem vette volna észre.';

-- ─── 4/e) VISSZAÁLLÍTÁS: staging ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.backup_restore_stage(
  p_session uuid,
  p_tabla   text,
  p_sorszam int,
  p_sorok   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF jsonb_typeof(p_sorok) <> 'array' THEN
    RAISE EXCEPTION 'A p_sorok paraméternek JSON-tömbnek kell lennie.';
  END IF;
  INSERT INTO public.backup_restore_staging (session_id, tabla, sorszam, sorok)
  VALUES (p_session, p_tabla, p_sorszam, p_sorok)
  ON CONFLICT (session_id, tabla, sorszam) DO UPDATE SET sorok = EXCLUDED.sorok;
END;
$$;

CREATE OR REPLACE FUNCTION public.backup_restore_cleanup(p_session uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  DELETE FROM public.backup_restore_staging
   WHERE session_id = p_session
      OR created_at < now() - interval '24 hours';
$$;

-- ─── 4/f) VISSZATÖLTÉSI SORREND — FK-FÜGGŐSÉGBŐL, FUTÁSIDŐBEN ──────────────
--
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ 2026-08-11 — EZ EGY BLOKKOLÓ HIBA JAVÍTÁSA. OLVASD EL, MIELŐTT MÓDOSÍTOD.
-- ════════════════════════════════════════════════════════════════════════════
-- A visszaállítás korábban a TÁBLA NEVÉT használta rétegen belüli sorrendnek:
--     törlés:   ORDER BY p.reteg DESC, s.tabla        (ábécé NÖVEKVŐ!)
--     beszúrás: ORDER BY p.reteg ASC,  s.tabla        (ábécé NÖVEKVŐ)
-- A réteg meg volt fordítva, az ábécé NEM. Az ábécé viszont semmit nem tud az
-- idegen kulcsokról, ezért a törlés SZÜLŐT TÖRÖLT GYEREK ELŐTT:
--     R4: csalad   →  gyerek / felmentes / csaladlatogatas
--     R5: kiadas   →  kiadasikiseroiv / oblio_kiadas_match / valuta_atert
--         befizetes→  material_movements / oblio_szamlak / valuta_atert
--     R6: sirhely  →  sirhelyberles / sirhelyelhunyt
-- …a beszúrás pedig GYEREKET SZÚRT SZÜLŐ ELŐTT:
--     R7: jegyzokonyv_hatarozatok → presbiteri_jegyzokonyvek (ábécében ELŐBB!)
--     R7: public_magazine_issues  → public_magazines
-- Vagyis a visszaállítás GYAKORLATILAG MINDEN VALÓS GYÜLEKEZETNÉL elhasalt
-- volna — miközben a mentés zöld és bájtra igazolt. A száraz futás ezt nem
-- mutatta meg, mert az csak SORT SZÁMOL, törölni sosem próbál.
--
-- Egy egyszerű `s.tabla DESC` NEM megoldás: az R4/R6 esetet megjavítaná, de az
-- R7-et elrontaná. A sorrendnek a VALÓDI FK-GRÁFBÓL kell jönnie.
--
-- EZ A FÜGGVÉNY a `pg_constraint`-ből olvassa ki a függőségeket, és
-- topologikusan rendezi a táblákat: SZÜLŐ ELŐBB, GYEREK UTÁNA. A beszúrás
-- növekvő `sorrend`-ben megy, a törlés PONTOSAN FORDÍTVA. Egy jövőbeni tábla
-- így automatikusan a helyére kerül — nem lehet elfelejteni besorolni.
--
-- A `reteg` MEGMARAD elsődleges preferenciának (az emberi tudást hordozza, pl.
-- „a temető a pénzügy után"), de CSAK ott dönt, ahol az FK-gráf nem köti meg a
-- sorrendet. Ha egy alacsonyabb rétegű táblának magasabb rétegben van szülője,
-- a FÜGGŐSÉG NYER — a réteg-elírás így nem tud kárt okozni.
--
-- KÖR (pl. sirhely.aktivberlesid ⇄ sirhelyberles.sirhelyid): determinisztikus
-- töréssel oldjuk (ábécé szerint első a maradékból), a konkrét kört pedig a
-- `backup_restore_apply` külön kezeli (aktivberlesid = NULL, majd UPDATE).
CREATE OR REPLACE FUNCTION public.backup_restore_order(p_tablak text[])
RETURNS TABLE (tabla text, reteg smallint, sorrend int)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_maradek    text[];
  v_valasztott text;
  v_t          text;
  v_van_szulo  boolean;
  v_sorrend    int := 0;
BEGIN
  IF p_tablak IS NULL OR array_length(p_tablak, 1) IS NULL THEN
    RETURN;
  END IF;

  -- A maradék listát a PREFERENCIA szerint rendezzük: előbb a kisebb réteg,
  -- azon belül ábécé. Így a „kész" jelöltek közül mindig ugyanaz nyer.
  SELECT COALESCE(array_agg(x.tabla ORDER BY x.reteg NULLS LAST, x.tabla), '{}'::text[])
    INTO v_maradek
  FROM (
    SELECT p.tabla, p.reteg
    FROM public.backup_table_policy p
    WHERE p.tabla = ANY (p_tablak)
  ) x;

  WHILE array_length(v_maradek, 1) IS NOT NULL LOOP
    v_valasztott := NULL;

    FOREACH v_t IN ARRAY v_maradek LOOP
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class      ch  ON ch.oid  = c.conrelid
        JOIN pg_namespace  nch ON nch.oid = ch.relnamespace
        JOIN pg_class      pa  ON pa.oid  = c.confrelid
        JOIN pg_namespace  npa ON npa.oid = pa.relnamespace
        WHERE c.contype = 'f'
          AND nch.nspname = 'public' AND ch.relname = v_t
          AND npa.nspname = 'public'
          -- ÖN-FK (pl. szemely.id_apja → szemely) NEM akadály: táblánként
          -- EGYETLEN INSERT utasítás megy, az FK-triggerek annak a VÉGÉN futnak.
          AND pa.relname <> v_t
          -- Csak a MÉG EL NEM HELYEZETT szülő számít.
          AND pa.relname = ANY (v_maradek)
      ) INTO v_van_szulo;

      IF NOT v_van_szulo THEN
        v_valasztott := v_t;
        EXIT;
      END IF;
    END LOOP;

    IF v_valasztott IS NULL THEN
      -- KÖR. Determinisztikus törés: a preferencia-sorrend szerinti első.
      v_valasztott := v_maradek[1];
    END IF;

    v_sorrend := v_sorrend + 1;
    tabla   := v_valasztott;
    sorrend := v_sorrend;
    SELECT p.reteg INTO reteg FROM public.backup_table_policy p WHERE p.tabla = v_valasztott;
    RETURN NEXT;

    SELECT COALESCE(array_agg(y ORDER BY ord), '{}'::text[]) INTO v_maradek
    FROM unnest(v_maradek) WITH ORDINALITY AS u(y, ord)
    WHERE y <> v_valasztott;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.backup_restore_order(text[]) IS
  '2026-08-11: a visszatöltés SORRENDJE a pg_constraint FK-gráfjából, topologikusan (szülő előbb). A beszúrás növekvő, a törlés CSÖKKENŐ sorrendben megy. A korábbi ábécé-sorrend szülőt törölt gyerek előtt (csalad→gyerek, kiadas→kiadasikiseroiv, sirhely→sirhelyberles) és gyereket szúrt szülő elé (jegyzokonyv_hatarozatok→presbiteri_jegyzokonyvek).';


-- ─── 4/g) A VISSZAÁLLÍTÁS MAGA — NEM ITT, HANEM A PÁR-FÁJLBAN ──────────────
--
-- ⚠️ SZÁNDÉKOSAN NINCS ITT `backup_restore_apply`.
--
-- Korábban ez a fájl IS definiálta, és a `2026-08-11-visszaallitas.sql` is —
-- két, egymásról nem tudó, KÖZEL AZONOS implementáció. Ugyanaz a sorrend-hiba
-- MINDKETTŐBEN benne volt, és a javítást is kétszer kellett volna elvégezni.
-- Ha egy hibát kétszer lehet elrontani, egyszer biztosan elrontják.
--
-- A visszaállítás EGYETLEN igazság-forrása mostantól:
--     migration-docs/sql/2026-08-11-visszaallitas.sql
--
-- Az alábbi DROP-ok a RÉGI túlterheléseket takarítják ki. Ez nem kozmetika:
-- két egyidejű `backup_restore_apply` esetén a hívás attól függne, hány
-- paramétert küld a kliens — vagyis a naplózó és a NEM naplózó változat közül
-- a véletlen döntene.
DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint);
DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint, bigint);

DO $apply_hiany$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'backup_restore_apply'
  ) THEN
    RAISE NOTICE 'A visszaállító függvény MÉG NINCS telepítve. Futtasd le a migration-docs/sql/2026-08-11-visszaallitas.sql fájlt is — mentés e nélkül is készül, visszaállítás nem.';
  END IF;
END
$apply_hiany$;


-- ════════════════════════════════════════════════════════════════════════════
-- SZAKASZ 5 — JOGOK: a mentés-RPC-ket KIZÁRÓLAG a service_role hívhatja
-- ════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.backup_live_tables()                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_scope_where(text, boolean)             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_count_table(uuid, text)                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_dump_table(uuid, text, int, jsonb)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_order(text[])                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_stage(uuid, text, int, jsonb)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.backup_restore_cleanup(uuid)                  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.backup_live_tables()                          TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_scope_where(text, boolean)             TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_count_table(uuid, text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_dump_table(uuid, text, int, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_order(text[])                  TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_stage(uuid, text, int, jsonb)  TO service_role;
GRANT EXECUTE ON FUNCTION public.backup_restore_cleanup(uuid)                  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === VISSZAVONÁS (ROLLBACK) — CSAK HA VISSZA KELL CSINÁLNI ===
-- Ne futtasd, ha a mentés már működik: a backup_log a mentések KATALÓGUSA.
-- A Drive-on lévő fájlok ettől NEM tűnnek el, de a rendszer elfelejti, mik azok.
-- ════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.backup_restore_apply(uuid, uuid, text, bigint, bigint, text[]);
--   DROP FUNCTION IF EXISTS public.backup_restore_order(text[]);
--   DROP FUNCTION IF EXISTS public.backup_restore_cleanup(uuid);
--   DROP FUNCTION IF EXISTS public.backup_restore_stage(uuid, text, int, jsonb);
--   DROP FUNCTION IF EXISTS public.backup_dump_table(uuid, text, int, jsonb);
--   DROP FUNCTION IF EXISTS public.backup_count_table(uuid, text);
--   DROP FUNCTION IF EXISTS public.backup_scope_where(text, boolean);
--   DROP FUNCTION IF EXISTS public.backup_live_tables();
--   DROP TABLE IF EXISTS public.backup_restore_staging;
--   DROP TABLE IF EXISTS public.backup_restore_log;
--   DROP TABLE IF EXISTS public.backup_log;
--   DROP TABLE IF EXISTS public.backup_settings;
--   DROP TABLE IF EXISTS public.backup_table_policy;
--   ALTER TABLE public.congregations DROP COLUMN IF EXISTS restore_epoch;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════════
-- === ELLENŐRZÉS — EGYETLEN SELECT ===
-- A Supabase SQL Editor CSAK AZ UTOLSÓ eredményt mutatja. Ez a projektnek
-- eddig HÁROM elveszett választásába került, ezért minden ellenőrzés EGYBEN van.
--
-- ⚠️ AMIT ELŐSZÖR NÉZZ MEG: a 90-es sorrendű sorok. Amíg van ott akár EGY sor,
--    A MENTÉS NEM FOG ELINDULNI — és ez szándékos. A pótló INSERT sablonja:
--
--    INSERT INTO public.backup_table_policy (tabla, hatokor, reteg, megjegyzes)
--    VALUES ('<tabla_neve>', 'gyulekezet', 5, 'kézi besorolás 2026-08-11')
--    ON CONFLICT (tabla) DO UPDATE SET hatokor = EXCLUDED.hatokor, reteg = EXCLUDED.reteg;
-- ════════════════════════════════════════════════════════════════════════════

SELECT x.sorrend, x.mit_mer, x.ertek, x.vart,
       CASE WHEN x.ertek = x.vart THEN '✅' ELSE '❌' END AS rendben
FROM (
  SELECT 1 AS sorrend, 'backup_table_policy tabla letezik'::text AS mit_mer,
         (to_regclass('public.backup_table_policy') IS NOT NULL)::text AS ertek,
         'true'::text AS vart
  UNION ALL SELECT 2, 'backup_settings tabla letezik',
         (to_regclass('public.backup_settings') IS NOT NULL)::text, 'true'
  UNION ALL SELECT 3, 'backup_log tabla letezik',
         (to_regclass('public.backup_log') IS NOT NULL)::text, 'true'
  UNION ALL SELECT 4, 'backup_restore_log tabla letezik',
         (to_regclass('public.backup_restore_log') IS NOT NULL)::text, 'true'
  UNION ALL SELECT 5, 'backup_restore_staging tabla letezik',
         (to_regclass('public.backup_restore_staging') IS NOT NULL)::text, 'true'
  UNION ALL SELECT 6, 'congregations.restore_epoch oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='congregations'
                   AND column_name='restore_epoch')::text, 'true'

  UNION ALL SELECT 10, 'RLS BE van kapcsolva MIND az 5 uj tablan',
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relrowsecurity
             AND c.relname IN ('backup_table_policy','backup_settings','backup_log',
                               'backup_restore_log','backup_restore_staging'))::text, '5'
  UNION ALL SELECT 11, 'backup_settings-en NINCS policy (szandekos: csak service_role)',
         (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='backup_settings')::text, '0'
  UNION ALL SELECT 12, 'backup_restore_staging-en NINCS policy (szandekos)',
         (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='backup_restore_staging')::text, '0'
  UNION ALL SELECT 13, 'backup_log olvasasi policy letezik',
         EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                   AND tablename='backup_log' AND policyname='backup_log_read')::text, 'true'
  UNION ALL SELECT 14, 'A backup_log policy tartalmazza a status-feltetelt',
         COALESCE((SELECT (qual LIKE '%status%')::text FROM pg_policies
                   WHERE schemaname='public' AND tablename='backup_log'
                     AND policyname='backup_log_read'), 'nincs policy'), 'true'
  UNION ALL SELECT 15, 'A backup_log policy tartalmazza a kerulet-feltetelt',
         COALESCE((SELECT (qual LIKE '%district_id%')::text FROM pg_policies
                   WHERE schemaname='public' AND tablename='backup_log'
                     AND policyname='backup_log_read'), 'nincs policy'), 'true'
  UNION ALL SELECT 16, 'backup_log-on NINCS UPDATE/DELETE policy',
         (SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND tablename IN ('backup_log','backup_restore_log')
            AND cmd IN ('UPDATE','DELETE'))::text, '0'

  UNION ALL SELECT 7, 'backup_log.storage_nev oszlop letezik (melyik tarolo)',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_log'
                   AND column_name='storage_nev')::text, 'true'
  UNION ALL SELECT 8, 'backup_settings.recovery_public_key oszlop letezik (kulcs-letet)',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_settings'
                   AND column_name='recovery_public_key')::text, 'true'
  UNION ALL SELECT 9, 'backup_settings.recovery_private_wrapped oszlop letezik',
         EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='backup_settings'
                   AND column_name='recovery_private_wrapped')::text, 'true'

  UNION ALL SELECT 20, 'Mind a 7 mentes-RPC letezik',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname IN
             ('backup_live_tables','backup_scope_where','backup_count_table',
              'backup_dump_table','backup_restore_stage','backup_restore_cleanup',
              'backup_restore_order'))::text, '7'
  UNION ALL SELECT 21, 'Mind a 7 mentes-RPC SECURITY DEFINER',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef AND p.proname IN
             ('backup_live_tables','backup_scope_where','backup_count_table',
              'backup_dump_table','backup_restore_stage','backup_restore_cleanup',
              'backup_restore_order'))::text, '7'
  UNION ALL SELECT 22, 'Mind a 7 mentes-RPC-n ROGZITETT search_path',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proconfig IS NOT NULL AND p.proname IN
             ('backup_live_tables','backup_scope_where','backup_count_table',
              'backup_dump_table','backup_restore_stage','backup_restore_cleanup',
              'backup_restore_order'))::text, '7'
  UNION ALL SELECT 24, 'backup_dump_table KULCS-ALAPU lapozassal (p_after parameter)',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='backup_dump_table'
             AND pg_get_function_arguments(p.oid) LIKE '%p_after%')::text, '1'
  UNION ALL SELECT 25, 'REGI, OFFSET-es backup_dump_table tultereheles (0 kell)',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='backup_dump_table'
             AND pg_get_function_arguments(p.oid) LIKE '%p_offset%')::text, '0'
  UNION ALL SELECT 23, 'EGYETLEN RPC-t sem hivhat az authenticated',
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname LIKE 'backup\_%'
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))::text, '0'

  UNION ALL SELECT 30, 'backup_settings sorok szama (pontosan 1)',
         (SELECT count(*) FROM public.backup_settings)::text, '1'
  UNION ALL SELECT 31, 'Besorolt tablak szama (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy)::text,
         (SELECT count(*) FROM public.backup_table_policy)::text
  UNION ALL SELECT 32, 'Elo public tablak szama (tajekoztato)',
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE')::text,
         (SELECT count(*) FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE')::text
  UNION ALL SELECT 33, 'MENTHETO gyulekezeti tablak szama (tajekoztato)',
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='gyulekezet')::text,
         (SELECT count(*) FROM public.backup_table_policy WHERE hatokor='gyulekezet')::text

  UNION ALL SELECT 40, 'BESOROLATLAN ELO TABLAK SZAMA (0 kell a mentes inditasahoz)',
         (SELECT count(*) FROM information_schema.tables t
           LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
           WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
             AND p.tabla IS NULL)::text, '0'
  UNION ALL SELECT 41, 'RETEG NELKULI gyulekezeti tablak (0 kell a VISSZAALLITASHOZ)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor='gyulekezet' AND p.reteg IS NULL)::text, '0'

  -- ⚠️ 42 — EZ A HIBAOSZTALY EGYETLEN GYULEKEZETI MENTEST SEM ENGEDETT VOLNA
  -- ELKESZULNI. Gyulekezeti hatokor + NULL join_predikatum = az alapertelmezett
  -- `t.congregation_id = $1` szuro. Ha a tablanak NINCS ilyen oszlopa, a
  -- backup_count_table 42703-mal elhasal, es MINDEN gyulekezet mentese elbukik
  -- a szamlalasnal. (2026-08-11-en harom tabla volt ilyen: member_accounts,
  -- member_newsletter_preferences, audit_log.)
  UNION ALL SELECT 42, 'GYULEKEZETI tabla NULL szuro + NINCS congregation_id (0 kell!)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor='gyulekezet' AND p.join_predikatum IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM information_schema.columns c
               WHERE c.table_schema='public' AND c.table_name=p.tabla
                 AND c.column_name='congregation_id'))::text, '0'

  -- ⚠️ 43 — GENERATED ALWAYS oszlopok visszaallithato tablakban. A
  -- `to_jsonb(t)` beleteszi oket a mentesbe, es egy oszloplista NELKULI
  -- `INSERT ... SELECT *` „cannot insert a non-DEFAULT value into column"
  -- hibaval visszagorgetne az EGESZ visszaallitast — a kotelezo elo-mentes
  -- UTAN. Az `OVERRIDING SYSTEM VALUE` erre NEM segit (az identity, nem
  -- generated). A backup_restore_apply ezert EXPLICIT oszloplistaval szur be;
  -- ez a sor csak tajekoztat, melyik tablak erintettek.
  UNION ALL SELECT 43, 'VISSZAALLITHATO tablak GENERATED ALWAYS oszloppal (tajekoztato)',
         (SELECT count(DISTINCT p.tabla) FROM public.backup_table_policy p
           JOIN information_schema.columns c
             ON c.table_schema='public' AND c.table_name=p.tabla
            AND c.is_generated='ALWAYS'
           WHERE p.hatokor='gyulekezet' AND p.visszaallithato)::text,
         (SELECT count(DISTINCT p.tabla) FROM public.backup_table_policy p
           JOIN information_schema.columns c
             ON c.table_schema='public' AND c.table_name=p.tabla
            AND c.is_generated='ALWAYS'
           WHERE p.hatokor='gyulekezet' AND p.visszaallithato)::text

  -- ⚠️ 44 — ELSODLEGES KULCS NELKULI mentendo tabla. A kulcs-alapu lapozas
  -- ilyenkor `ctid`-re esik vissza, ami egy HOT-update-nel elmozdulhat.
  UNION ALL SELECT 44, 'PK NELKULI mentendo tablak szama (0 a jo)',
         (SELECT count(*) FROM public.backup_table_policy p
           JOIN information_schema.tables t
             ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
           WHERE p.hatokor IN ('gyulekezet','globalis')
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint con
               WHERE con.conrelid = ('public.' || quote_ident(p.tabla))::regclass
                 AND con.contype='p'))::text, '0'

  -- ⚠️ EZEKET KELL PÓTOLNI — amíg van sor, a MENTÉS nem indul el:
  UNION ALL
  SELECT 90, 'BESOROLATLAN TABLA — vedd fel a backup_table_policy-be!',
         t.table_name::text, '<nincs policy-sor>'
  FROM information_schema.tables t
  LEFT JOIN public.backup_table_policy p ON p.tabla = t.table_name
  WHERE t.table_schema='public' AND t.table_type='BASE TABLE' AND p.tabla IS NULL

  -- ⚠️ 92 — GYULEKEZETI TABLA, AMINEK NINCS congregation_id OSZLOPA ES NINCS
  --    SAJAT SZUROJE. Amig van ilyen sor, EGYETLEN gyulekezeti mentes sem
  --    keszul el (42703 a szamlalasnal). Javitas: adj neki join_predikatum-ot,
  --    VAGY told at globalis hatokorbe (mint a member_accounts eseteben).
  UNION ALL
  SELECT 92, 'NINCS congregation_id ES NINCS join_predikatum — a MENTES ELHASAL',
         p.tabla, '<gyulekezeti szuro nelkul>'
  FROM public.backup_table_policy p
  JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
  WHERE p.hatokor='gyulekezet' AND p.join_predikatum IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=p.tabla
        AND c.column_name='congregation_id')

  -- ⚠️ 93 — RETEG-INVERZIO: a GYEREK tabla ALACSONYABB retegben van, mint a
  --    SZULOJE. A `backup_restore_order()` a futasidejű FK-grafbol dolgozik, es
  --    ezt automatikusan helyre teszi (a fuggoseg nyer a reteg felett), tehat ez
  --    NEM blokkolo — de a reteg-besorolas ilyenkor felrevezeto, es erdemes
  --    javitani, mert az emberi olvasat (a `reteg` oszlop) mast mond, mint a
  --    tenyleges sorrend.
  UNION ALL
  SELECT 93, 'RETEG-INVERZIO: gyerek alacsonyabb retegben, mint a szuloje',
         ch.relname::text || ' (R' || COALESCE(pc.reteg::text,'?') || ') -> ' ||
         pa.relname::text || ' (R' || COALESCE(pp.reteg::text,'?') || ')',
         '<a szulonek elobb kell jonnie>'
  FROM pg_constraint c
  JOIN pg_class ch      ON ch.oid = c.conrelid
  JOIN pg_namespace nch ON nch.oid = ch.relnamespace
  JOIN pg_class pa      ON pa.oid = c.confrelid
  JOIN pg_namespace npa ON npa.oid = pa.relnamespace
  JOIN public.backup_table_policy pc ON pc.tabla = ch.relname
  JOIN public.backup_table_policy pp ON pp.tabla = pa.relname
  WHERE c.contype='f' AND nch.nspname='public' AND npa.nspname='public'
    AND ch.relname <> pa.relname
    AND pc.hatokor='gyulekezet' AND pp.hatokor='gyulekezet'
    AND pc.reteg IS NOT NULL AND pp.reteg IS NOT NULL
    AND pc.reteg < pp.reteg

  -- ⚠️ EZEKNÉL a mentés MŰKÖDIK, de a VISSZAÁLLÍTÁS megtagadja:
  UNION ALL
  SELECT 91, 'NINCS RETEGE — mentjuk, de visszaallitani nem tudjuk',
         p.tabla, '<reteg = NULL>'
  FROM public.backup_table_policy p
  JOIN information_schema.tables t
    ON t.table_schema='public' AND t.table_name=p.tabla AND t.table_type='BASE TABLE'
  WHERE p.hatokor='gyulekezet' AND p.reteg IS NULL
) x
ORDER BY x.sorrend, x.ertek;
