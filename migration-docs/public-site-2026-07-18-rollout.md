# Publikus oldal – alkalmak és sitemap rollout (2026-07-18)

Ez a kiegészítés két kiadási hibát zár le:

- a nyilvános oldal többé nem mutat kitalált, minden gyülekezetnél azonos
  istentiszteleti időpontokat;
- a `sitemap.xml` a `public_sites` közvetlen anonim olvasásának visszavonása
  után is működik, de csak a keresők számára engedélyezett útvonalakat kapja meg.

## Kötelező sorrend

1. Futtasd le és ellenőrizd a teljes 2026-07-17-es tagi portál migrációs láncot.
2. Futtasd a `migration-docs/sql/2026-07-17-public-site-v2-themes.sql` fájlt.
3. Futtasd a `migration-docs/sql/2026-07-17-public-site-read-security.sql` fájlt.
4. Közvetlenül utána futtasd a
   `migration-docs/sql/2026-07-18-public-site-content-and-sitemap.sql` fájlt.
5. Csak a postflightok sikeres lefutása után telepítsd a webes release-t.

A 4. és 5. lépést nem szabad felcserélni. A frontend ugyan visszafelé
kompatibilis, de a 2026-07-17-es hardening és a 2026-07-18-as sitemap RPC közötti
állapotban a sitemap biztonságosan üres lehet.

## Mit módosít az adatbázisban?

- `public.public_sites.service_times jsonb NOT NULL DEFAULT '[]'::jsonb`;
- validált CHECK constraint: legfeljebb 12 alkalom, egyedi UUID, kötött mezők,
  `ÓÓ:PP` idő, méretkorlátok és ismeretlen JSON-kulcsok tiltása;
- `public_site_private` belső séma a két `SECURITY DEFINER` olvasóhoz;
- két szűk, `SECURITY INVOKER` publikus wrapper:
  `public_site_context_v2(text)` és `public_sitemap_entries()`.
- a `postgres` tulajdonú jövőbeli rutinok globális default `PUBLIC EXECUTE`
  joga visszavonásra kerül; minden új RPC-hez külön, exact signature GRANT kell.

Az `anon` szerep nem kap közvetlen `public_sites` vagy `congregations` SELECT
jogot. A belső függvények rögzített üres `search_path` mellett, teljesen
minősített objektumnevekkel futnak. A `public_site_private` sémát a Supabase
Data API „Exposed schemas” listájához tilos hozzáadni.

Contract-migrációs TODO: amikor minden frontend példány bizonyítottan a V2
contextet használja, a 2026-07-17-ből kompatibilitásként megmaradó public
`SECURITY DEFINER` rutinokat is privát implementáció + invoker wrapper mögé kell
húzni, majd a már nem használt V1 signature-t eltávolítani.

## Expand/contract viselkedés

- Migráció előtt a publikus loader előbb a V2, majd a V1 RPC-t próbálja, végül
  csak a régi környezetben használja az explicit, szűk táblás fallbacket.
- A beállítási oldal hiányzó `service_times` oszlop esetén továbbra is betölti
  és menti az összes korábbi mezőt; az alkalomszerkesztőt ilyenkor letiltja.
- Üres alkalomlistánál a nyilvános oldal tényszerű üzenetet mutat, időpontot nem.
- A sitemap frontendje migráció előtt a régi anon policyval kompatibilis; az új
  RPC telepítése után már kizárólag a szűk RPC eredményét használja.

## Kötelező ellenőrzések

A migráció saját postflightja tranzakción belül ellenőrzi a típust, a validált
constraintet, a függvények tulajdonosát, `search_path`-ját, invoker/definer
jellegét, markerét, ACL-jét és azt, hogy a közvetlen anon `public_sites` olvasás
nem tért vissza.

Ezután futtasd:

```sql
select *
from public.public_site_context_v2('baratosi-reformatus-egyhazkozseg');

select *
from public.public_sitemap_entries()
order by site_slug, route_kind, content_slug nulls first;

select slug, service_times
from public.public_sites
where slug = 'baratosi-reformatus-egyhazkozseg';
```

Elvárt eredmény:

- a context pontosan egy publikált gyülekezetet ad vissza, benne a
  `service_times` tömbbel;
- a sitemap csak `robots_index=true`, aktív és publikált gyülekezetet,
  publikált bejegyzést és publikált lapszámot listáz;
- nem jelenik meg személyes adat vagy belső gyülekezeti azonosító a sitemapben.

## Visszaállítás

Hibánál először a frontend deployt vond vissza. Az új mezőt ne töröld, mert az
adatvesztést okozhat. A V1 context RPC változatlanul megmarad, ezért a korábbi
frontend visszaállítható. Adatbázis-visszavonás csak külön, az élő
`service_times` tartalom ellenőrzése után készüljön.

## Ismert háttértár-karbantartás

A magazin PDF-je és borítója lapszámonként determinisztikus objektumkulcsra
kerül, ezért az ismételt feltöltés nem halmoz új fájlokat. Törléskor először a
tenant-szűkített adatbázisrekord tűnik el, majd best-effort Storage-takarítás
fut; így takarítási hiba esetén sem marad törött hivatkozás a publikus oldalon.

Egy böngészőlap feltöltés közbeni bezárása vagy átmeneti Storage-hiba azonban
nem linkelt objektumot hagyhat a publikus bucketben. Későbbi üzemeltetési
feladat egy időkorlátos reconciliation/GC, amely a DB-rekord nélküli
`{congregation_id}/{issue_id}/` mappákat ellenőrzött naplózás mellett eltávolítja.
