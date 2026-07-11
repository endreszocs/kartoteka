# Kartotéka Admin — teljes audit + újradizájn jelentés (2026-07-11)

**Módszertan:** 7 párhuzamos terület-auditáló ágens + 1 teljességi kritikus + 13 adverzáriális
verifikátor (a magas/kritikus találatok mindegyikét külön szkeptikus ágens erősítette meg vagy
cáfolta). Eredmény: 86 potenciális hiba, 87 UX-észrevétel; a 13 high/critical tételből
**12 CONFIRMED, 1 PARTIAL, 0 cáfolat**.

Az UI-szintű hibákat az admin-újradizájn (feature/admin-redesign ág) javítja.
Az alábbi **backend-hibák külön kört igényelnek** — itt dokumentálva, prioritással.

---

## A) KRITIKUS backend-hibák (P0 — mielőbb javítandó, NEM része a redesignnak)

### A1. Broadcast/hírlevél: címzett-email-címek kiszivárgása (GDPR!)
- **Hely:** `apps/web/lib/broadcasts/email.ts:43-54` + `apps/web/lib/email/providers/brevo.ts:63-73` + `resend.ts:55-68`
- **Mi történik:** a kiküldés 50 fős csoportokban megy, de mind az 50 címzett UGYANAZON levél
  közös `to:` mezőjébe kerül → **minden címzett látja a másik 49 email-címét**. Minden
  „Mindenkinek" típusú küldésnél adatvédelmi incidens.
- **Javítás iránya:** Brevo `messageVersions` batch-mező (1 hívás, címzettenként külön To) vagy
  per-címzett küldés ciklusban; Resend-nél `batch.send`. A `EmailSendArgs` típusból a bcc is hiányzik.

### A2. God-mode PIN: plaintext tárolás + (javítás előtt) plaintext kliens-expozíció
- **Hely:** `apps/web/app/(dashboard)/god-mode/actions-v4.ts:233-272`
- **Mi történik:** a PIN hash nélkül tárolódik a `system_settings.value`-ban, és a
  `getGodModePinSettings` a tényleges PIN-t adta vissza a kliensnek, ami sima szöveges inputban
  jelent meg. A „titkosan tárolódik" UI-szöveg hamis volt.
- **A redesign UI-oldali javítást tartalmaz** (a PIN nem megy le a kliensre, type="password",
  őszinte szöveg), de a **tárolás továbbra is plaintext** → hash-elés (bcrypt/scrypt) külön kör,
  mert az `activateGodMode` plaintext-összehasonlítását és a desktop-klienst is érinti.

## B) MAGAS prioritású backend-hibák (P1)

### B1. Rendszer-pénzügy bevétel-számítás — 3 összefüggő hiba
`apps/web/app/(dashboard)/admin/system-finance-actions.ts`
1. **:451-464** — a `teszt`/`kedvezmeny`/`ingyenes` típusú előfizetés a Havi bevétel KPI-ból
   TELJESEN kimarad akkor is, ha egyedi `dij_ron` van beállítva (a kód saját kommentje szerint
   felül kellene írnia). A sáv-bontás táblázat viszont beszámítja → a két nézet ellentmond.
2. **:472** — a `congregationsByTier` statisztika éves típusnál az ÉVES `dij_ron`-t havi
   díj-bucketbe összegzi (egység-keverés).
3. **:451** — az `aktiv=true`, de `veg` dátummal már lejárt előfizetés továbbra is teljes
   bevételként számolódik; az „Aktív előfizetők" KPI sorokat számol, nem gyülekezeteket.
- *(A UI-oldali egység-jelzést — RON/hó vs RON/év — a redesign pótolja.)*

### B2. Jóváhagyás: néma Supabase-invite-hiba
`apps/web/app/(dashboard)/admin/access-requests-actions.ts:273-313`
- A kérelem státusza MÁR `approved`, mielőtt a user-létrehozás megtörténne; ha az invite elbukik,
  csak `console.warn` szól, a kliens „Jóváhagyva és aktiválva" toast-ot mutat, és a kérelmezőnek
  ilyenkor is kimegy a „jóváhagyva" email login-linkkel — miközben a fiók nem jött létre.
- *(A redesign hozzáadja az `info` visszatérő mezőt + toast-ot; a súlyosabb rész — approved-email
  visszatartása invite-bukásnál, „kézi intervenció szükséges" állapot — backend-döntés.)*

### B3. Kerületi admin nem tud kérelmet jóváhagyni
`access-requests-actions.ts:35-42` — a guard (`requireAdmin`) csak teljes admint/mastert enged,
miközben a Felhasználók oldal kerületi adminnak is elérhető és a pending-kérelmeket neki is
összeállítja. Javítás iránya: `requireAdminAccess({ allowDistrictAdmin: true })` + a kérelem
`requested_district_id`-jének scope-ellenőrzése.
- *(A redesign kliens-oldali fallbackot ad — hiba esetén quickApproveUser + látható hibaüzenet.)*

### B4. runQualityCheck N+1
`apps/web/app/(dashboard)/admin/actions.ts:1356` — gyülekezetenként szekvenciális query (~100+
roundtrip), query-hibánál néma kihagyás → hiányos jelentés hibajelzés nélkül. A `getAdminOverview`
már RPC-s GROUP BY mintára lett átírva — ugyanaz kell ide.

## C) KÖZEPES backend-tételek (P2 — következő körökben)

| Hely | Probléma |
|---|---|
| `admin/actions.ts:1030` | rejectPendingUser után az access_requests sor 'pending' marad (státusz-drift) |
| `admin/actions.ts:1110` | approveUser gyülekezet-keresés: ilike név-egyezés egyházmegye-szűrés nélkül, többes találatnál találomra |
| `admin/actions.ts:1224` | getPendingUsers/getActiveUsers/getAllUsers exportált actionök kerületi scope-szűrés NÉLKÜL (élő endpointok!) |
| `admin/actions.ts:1291` | replySupportTicket „lezárt jegy" guard halott kód (a compat-út már mentett) |
| `access-requests-actions.ts:67` | keresőszöveg nyersen a PostgREST .or() filterben — vessző/zárójel szétbontja |
| `profile-roles-actions.ts:60` | listProfileRoles nem szűr approval_status-ra → visszavont szerepek is találatot adnak |
| `broadcasts-actions.ts:311` | sendNewsletter kulcs alapján az ÖSSZES egyező broadcast-sorra ráírja az email-státuszt |
| `system-finance-actions.ts:313` | inaktívvá tett előfizetés eltűnik a felületről (csak aktiv=true listázódik) |
| `system-finance-actions.ts:272` | deletePricingTier nem ellenőrzi az aktív hivatkozó előfizetéseket |
| `devices-licenses-actions` | „user email-ben értesítve" toast, miközben az email-hiba a szerveren némán elnyelődik |
| `newsletter-compose-dialog:375` | congregation/diocese/district célzás felkínálva, de id-lista sosem megy → üres címzett-kör |
| `public-site/post-editor:137` | TipTap HTML-kimenet a body_markdown mezőben markdown-parserrel dolgozódik fel |
| `public-site/tiptap-editor:110` | a toolbar H1-et kínál, a sanitizer kidobja (néma tartalomvesztés) |
| `app/dev-reset/page.tsx` | auth nélküli oldal, ami betöltéskor minden SW-t/cache-t/storage-ot töröl — élesben is elérhető |

## D) Amit az újradizájn JAVÍTOTT (feature/admin-redesign)

1. **[CRITICAL]** Admin főoldal „Legutóbbi üzenetek": nemlétező mezőnevek (title/created_at/category
   a cim/sent_at/release_category helyett) → üres cím + „Invalid Date" minden sorban.
2. **[HIGH]** Kerületi admin soha nem érte el a /admin-t (layout-guard scope-ellentmondás) + a
   sidebar sem mutatta neki a Rendszerszint szekciót. Mostantól eléri (master-only oldalak nélkül).
3. **[HIGH]** Admin-override „Kilépés": nem-master admin számára a kilépés-action guard hibát adott,
   a banner gombja pedig örökre „Kilépés..." állapotban ragadt (hiba-elnyelés). Mindkettő javítva.
4. **[HIGH]** „+ Új szerepkör" popover levágódott az overflow-hidden konténerben (rövid listánál
   használhatatlan volt).
5. **[HIGH]** Tömeges broadcast-küldés némán force-újraküldte a már elküldötteket.
6. **[HIGH]** profile-congregations néma hibaelnyelés (üres lista ≠ hiba megkülönböztetés).
7. **[HIGH]** Tevékenység-napló (AuditLogTab) a halott admin-tabs-v3 alá temetve elérhetetlen volt →
   új /admin/naplo oldal + menüpont.
8. **[HIGH]** Dark módban olvashatatlan from-*-50/to-white KPI-kártyák (a .dark shim nem ír át
   gradient-stopokat) → token-alapú kártyák.
9. **[CRITICAL UI-rész]** God-mode PIN nem megy le többé a kliensre, password-mező, őszinte szöveg.
10. Halott kód törölve: admin-tabs-v3, users-tab/profile-roles-tab shimek.
11. + Teljes vizuális egységesítés: token-first színek (3 téma + dark mód natív követése),
    AdminTable/StatusBadge/AdminEmptyState/AdminSkeleton, mobil-first minden oldalon,
    admin loading.tsx + error.tsx (eddig egyik sem volt).

## E) Takarítási javaslatok (külön commit/kör)

- **God-mode verzió-temető** (7 halott fájl): god-mode-dialog v1–v4, god-mode-banner v1,
  god-mode/actions.ts + actions-v2.ts + actions-v3.ts (az élő: v5 dialog + banner-v3 + actions-v4).
- `components/admin/public-site/*` — a /publikus-oldal admin-felülete külön redesign-kört érdemel
  (TipTap-sanitizer párral együtt javítandó).
- ColorTabs ARIA (role=tablist/tab) a közös csomagban — members/finance/admin egyszerre profitál.
