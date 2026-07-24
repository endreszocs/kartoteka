# Tagi portál és megújult nyilvános oldal — élesítési jegyzőkönyv

Dátum: 2026-07-17
Állapot: a forráskód elkészült; a tagi portál alapértelmezetten kikapcsolt,
amíg az alábbi adatbázis- és Auth-ellenőrzések hiánytalanul le nem futnak.

## Biztonsági alapelv

- A Supabase Auth közös, de a lelkészi/staff és a tagi adatmodell, szerepkörök,
  RPC-k és RLS-szabályok elkülönülnek.
- A tag kizárólag a saját, aktív fiókjához és a jóváhagyott személykapcsolatához
  kötött személyes adatot, családi kapcsolatot és befizetést olvashat.
- A kliens által küldött szerepkör vagy személyazonosító nem jogosultsági forrás.
- A tag módosítási javaslata csak lelkészi elfogadás után kerül a `szemely`
  rekordba, verzióütközés-védelemmel.
- A `MEMBER_PORTAL_AUTH_ENABLED` és `MEMBER_PORTAL_SCHEMA_READY` kettős kapu
  fail-closed: migráció előtt a tagi menüpont és az Auth-oldal nem jelenik meg,
  tagi RPC nem fut. Mindkettőnek pontosan `true` értékűnek kell lennie.

## Kötelező futtatási sorrend a Supabase SQL Editorban

Minden lépés után ellenőrizni kell, hogy a tranzakció sikeresen lezárult. Hiba
esetén a következő fájl nem futtatható.

1. `2026-07-17-member-portal-profile-status-readiness.sql`
   - csak olvas;
   - a váratlan `profiles.status` rekordokat a migráció előtt rendezni kell.
2. `2026-07-17-member-portal-role-foundation.sql`
3. `2026-07-17-member-portal-core.sql`
4. `2026-07-17-member-portal-legacy-workflow-compat.sql`
5. `2026-07-17-member-portal-p0-auth-isolation.sql`
6. `2026-07-17-member-portal-token-hook.sql`
7. `2026-07-17-member-portal-workflows.sql`
   - a tagi Auth-dispatcher ekkor kerül a helyére, de a webes funkció még
     kikapcsolt flaggel maintenance állapotban marad.
8. Supabase Dashboard → Authentication → Hooks:
   az új Custom Access Token hook bekapcsolása.
9. Kijelentkezés és újbóli belépés, majd háromszereplős próba:
   aktív staff, függő felhasználó, jóváhagyott tag.
10. `2026-07-17-member-portal-data-and-newsletters.sql`
11. `2026-07-17-public-site-v2-themes.sql`
12. `2026-07-17-public-site-read-security.sql`
13. `2026-07-17-member-portal-newsletter-worker.sql`

Az SQL-fájlok helye: `migration-docs/sql/`.

## Auth- és Storage-beállítások

- A Supabase Auth redirect allowlist vegye fel a production és szükség esetén a
  staging címet ezzel a mintával: `/gy/*/tagi-portal/confirm`.
- Az `access-request-docs` bucket marad privát, 10 MB-os PDF/JPEG/PNG korláttal.
- Az `avatars`, `public-magazines` és `public-site-media` meglévő bucketek
  beállításait a migráció nem lazíthatja.
- A `public-site-media` képeket a nyilvános oldal olvashatja, az írás továbbra is
  aktív, megfelelő gyülekezeti staff jogosultság.

## Railway környezeti változók

Első kódtelepítéskor:

```text
MEMBER_PORTAL_AUTH_ENABLED=false
MEMBER_PORTAL_SCHEMA_READY=false
```

A migrációk és a háromszereplős Auth/RLS próba után:

```text
MEMBER_PORTAL_AUTH_ENABLED=true
MEMBER_PORTAL_SCHEMA_READY=true
NEWSLETTER_WORKER_SECRET=<legalább 32 véletlen karakter>
NEWSLETTER_WORKER_ENDPOINT=https://<production-host>/api/internal/member-newsletters
NEWSLETTER_WORKER_BATCH_SIZE=10
NEWSLETTER_WORKER_LEASE_SECONDS=900
NEWSLETTER_WORKER_MAX_ATTEMPTS=4
NEWSLETTER_WORKER_RETRY_BASE_SECONDS=300
```

A levelezéshez a meglévő `EMAIL_PROVIDER` és a kiválasztott Brevo/Resend
hitelesítő adatok is szükségesek. A worker titka kizárólag szerveroldali változó.

## Railway cron

Külön cron service ajánlott, egyperces vagy ötpereces ütemezéssel. A parancs a
repository gyökeréből:

```text
node apps/web/scripts/run-member-newsletter-worker.mjs
```

A cron ugyanazt a `NEWSLETTER_WORKER_SECRET` és `NEWSLETTER_WORKER_ENDPOINT`
értéket kapja. A worker egyszerre kis adagot foglal le, rövid lease-t használ,
és több példány mellett is `FOR UPDATE SKIP LOCKED` védelemmel dolgozik.

## Kötelező működési próba bekapcsolás előtt

1. Nyilvános oldal mindhárom témával, 390 px és 1440 px szélességen.
2. Regisztráció egy új tagi e-maillel; megerősítő link a helyes gyülekezethez tér
   vissza.
3. A függő tag nem lát személyes adatot.
4. A lelkész csak saját gyülekezetének kérelmét látja és létező személyhez köti.
5. Jóváhagyás és új belépés után a tag csak a saját adatát és saját befizetését
   látja; másik gyülekezet/person ID próbája üres vagy tiltott.
6. Adatmódosítás jóváhagyási és elutasítási ága; verzióütközés próbája.
7. Hírlevél-vázlat → címzett-pillanatkép → kézbesítés. Az állapot csak provider
   siker után legyen `sent`; hibánál késleltetett retry, majd korlátos `failed`.
8. Kijelentkezés után a tagi adatoldal ne legyen megnyitható böngészőből.

## Visszaállítási terv

- Első védelmi lépés: `MEMBER_PORTAL_SCHEMA_READY=false` (vagy
  `MEMBER_PORTAL_AUTH_ENABLED=false`), majd Railway restart.
  Ez elrejti az Auth-belépést és leállítja a webes tagi műveleteket.
- A cron service külön leállítható; a már várólistás levelek az adatbázisban
  megmaradnak.
- Az adatbázis-migrációk visszabontása csak külön, élő állapot alapján készített
  rollback SQL-lel történhet. A táblákat és tagi adatokat automatikusan törölni
  tilos.

## Kiadási döntés

A kód és a nyilvános oldal telepíthető kikapcsolt tagi flaggel. A tagi portál
éles bekapcsolása csak a readiness eredmény, a teljes migrációs lánc, az Auth-hook
és az end-to-end RLS próba dokumentált sikerével engedélyezhető.
