# Oblio API kutatás — bejövő/kimenő számlák API-lekérése (S4 #5)

**Dátum:** 2026-07-10 (S4-kutatás) · **Kérdés:** lekérhetők-e az Oblio API-n keresztül a bejövő/kimenő számlák úgy, hogy a felhasználónak csak az API-kulcsot kelljen megadnia (ne kelljen kézzel XML/ZIP fájlokat letöltögetnie az ANAF-ról / Oblio Wallet-ből)?

---

## 0. Vezetői összefoglaló (a rövid válasz)

| Irány | Oblio API-val lekérhető? |
|---|---|
| **KIMENŐ számlák** (amit a gyülekezet állít ki) | **IGEN** — már ma is ezt csináljuk (`listInvoices`, lásd 1. fejezet). |
| **BEJÖVŐ számlák** (szállítói e-Facturák az ANAF SPV-ből) | **NEM.** Az Oblio Wallet a *felületén* automatikusan szinkronizálja őket az SPV-ből, de ehhez **nincs publikus API-végpont**, és webhook-esemény sincs rá. A fájl-alapú (ZIP-letöltögetős) flow-t az Oblio API jelenleg NEM váltja ki. |

A „csak az API-kulcsot adja meg" élmény a bejövő számlákra **egyetlen román szolgáltatónál sem létezik tisztán**, mert az ANAF-korlát megkerülhetetlen: az SPV-hozzáférést **egyszer** (évente egyszer, a refresh token lejártakor) minősített digitális tanúsítvánnyal engedélyezni kell — bármelyik szolgáltatót is használjuk. A reálisan elérhető legjobb élmény: **API-kulcs + egyszeri (évi egyszeri) tanúsítványos SPV-összekötés**. Ezt ma az **emite-facturi.ro** (dedikált bejövő-API + webhook) és az **ANAF közvetlen API-ja** (ingyenes) tudja; az Oblio, a SmartBill és a factureaza.ro a bejövőket csak a saját UI-jában adja, API-ban nem.

**Ajánlás dióhéjban:** rövid távon marad a fájl-alapú flow + a [OBLIO_DESKTOP_WEB_TERV_2026-07-10.md](./OBLIO_DESKTOP_WEB_TERV_2026-07-10.md) hibrid Storage-szinkronja; közép távon **ANAF-direkt integráció** a KARTOTEKA-ba (5. és 6. fejezet).

---

## 1. A jelenlegi Oblio-integráció állapota a repóban

### 1.1 Autentikáció — `apps/web/lib/finance/oblio/oblio-auth.ts`
- `getOblioToken()` (`oblio-auth.ts:49–100`): OAuth2 `client_credentials` grant a `https://www.oblio.eu/api/authorize/token` végponton (`:17–18`), email + API secret párossal. In-memory token-cache, lejárat előtt 5 perccel frissít (`:19,36–39`).
- `clearTokenCache()` (`:105–107`) — új secret mentésekor hívjuk.

### 1.2 API-kliens — `apps/web/lib/finance/oblio/oblio-client.ts`
Mind **KIMENŐ** (Oblio-ban kiállított) dokumentumokra vonatkozik:
- `getCompanies` (`oblio-client.ts:100–105`) — `GET /api/nomenclature/companies` (CIF-ellenőrzéshez).
- `createInvoice` (`:112–118`) — `POST /api/docs/invoice`; a válaszban PDF-URL + e-Factura UUID.
- `getInvoice` (`:125–138`) — `GET /api/docs/invoice?cif&seriesName&number`.
- `listInvoices` (`:148–163`) — lista-lekérdezés dátum/partner/sorozat szűréssel, `withEInvoiceStatus=1`-gyel.
- `collectInvoice` (`:168–174`) — kifizetés rögzítése; `deleteInvoice` (`:184–190`) — törlés/sztornó.
- `testConnection` (`:196–227`) — kapcsolat-teszt CIF-egyeztetéssel.
- 401-nél egyszeri token-frissítés + retry (`:58–84`), 20 mp timeout (`:25`).

### 1.3 Server actions
- **Konfig:** `apps/web/app/(dashboard)/penzugy/oblio-config-actions.ts` — `getOblioConfig` (`:40–57`, a secret sosem megy ki), `saveOblioConfig` (`:71–139`, titkosított tárolás `encryptSecret`-tel az `oblio_fiokok` táblába), `testOblioConnection` (`:145–195`, eredmény-naplózással), `deleteOblioConfig` (`:200–225`, soft delete).
- **Lookup:** `apps/web/app/(dashboard)/penzugy/oblio-lookup-actions.ts` — `findOblioMatchForTransaction` (`:107–299`): kétlépcsős keresés (1. lokális `oblio_szamlak` tábla `:129–196`, 2. Oblio `listInvoices` API `:198–243`), találatkor DB-be szinkronizál (`:259–284`), 60 mp memória-cache (`:69–91`).

### 1.4 A BEJÖVŐ számlák jelenlegi (fájl-alapú) útja
A szállítói e-Facturákat a felhasználó **kézzel** tölti le (Oblio Wallet-ből / ANAF SPV-ből ZIP-ben), és a rendszer fájlként dolgozza fel: webes ZIP-kibontás + UBL-parse + párosítás (`packages/ui-app/src/finance/oblio/ubl-parser.ts`, `oblio-matcher.ts`, `apps/web/lib/finance/oblio/oblio-folder.ts`), desktopon Rust-ingest (`apps/desktop/src-tauri/src/excel.rs`). Részletes architektúra + hibrid felhő-szinkron terv: **[docs/OBLIO_DESKTOP_WEB_TERV_2026-07-10.md](./OBLIO_DESKTOP_WEB_TERV_2026-07-10.md)**. Az ANAF 60 napos letöltési határidejére csengő-figyelmeztetés van (`check_oblio_deadline_for_user()` RPC).

**Vagyis:** az API-integrációnk a *kimenő* oldalon teljes; a *bejövő* oldal ma 100%-ban kézi fájl-letöltésre épül — pontosan ezt szeretné a felhasználó kiváltani.

---

## 2. Mit tud az Oblio API — és mit NEM (a bejövő számlákról)

Forrás: hivatalos API-dokumentáció — <https://www.oblio.eu/api>

### 2.1 Dokumentált végpontok (mind kimenő irány)
- Auth: `POST /api/authorize/token` (Bearer, 3600 mp).
- Dokumentumok: `POST/GET/PUT/DELETE /api/docs/invoice` (+ `/list`, `/collect`, `/cancel`, `/restore`), ugyanez proformára, avizra.
- **e-Factura:** `POST /api/docs/einvoice` (küldés SPV-re) és `GET /api/docs/einvoice?cif&seriesName&number` — ez utóbbi **kizárólag az Oblio-ban KIÁLLÍTOTT számla SPV-archívumát** tölti le (a sajátunkét), NEM a szállítói bejövőket.
- Nómenklatúrák: companies, clients, products, series, vat_rates, languages, management.
- Webhookok: `POST/GET/DELETE /api/webhooks` — feliratkozható események: `stock`, `Invoice/SaveDraft|Update|Cancel`, `Proforma/...`, `Notice/...`, `TaxReceipt/...`, `Collect/Inserted`. **Bejövő számlára NINCS esemény** (nincs `Wallet/...` vagy `Received/...` topic).
- Rate limit: dokumentum-generálás 30 kérés/100 mp; egyéb 30 kérés/10 mp.

### 2.2 A hiányzó képesség
Az **Oblio Wallet** (<https://www.oblio.eu/wallet>) a *felületen* automatikusan fogadja a szállítói e-Facturákat az SPV-ből („Primesti instant facturile de la furnizorii tai…"), és a Rapoarte → Documente din SPV alatt listázza (<https://www.oblio.eu/report/wallet>) — **de ehhez se lekérdező API-végpont, se webhook nincs a publikus dokumentációban**, és az Oblio hivatalos API-kliensei (GitHub: [OblioSoftware/OblioApiJs](https://github.com/OblioSoftware/OblioApiJs), [OblioSoftware/OblioApi](https://github.com/OblioSoftware/OblioApi)) sem implementálnak ilyet. A bejövő számlák Oblio-n keresztüli programozott lekérése tehát **jelenleg nem lehetséges** (2026-07-10-i állapot).

### 2.3 Oblio árazás
Forrás: <https://www.oblio.eu/cat-costa>, <https://www.oblio.eu/pret-onest>
- **29 €/év** (~2,49 €/hó) — minden benne: korlátlan számla/felhasználó/cég/telephely, e-Factura + e-Transport + SAF-T + Wallet + API.
- Első év **ingyenes**; **örökre ingyenes**, ha max. 3 dokumentum/hó.
- Ár szempontból az Oblio verhetetlen — csak épp a bejövő-API hiányzik belőle.

---

## 3. Alternatívák — összehasonlító táblázat

| Szolgáltató | Bejövő e-Factura a FELÜLETEN | Bejövő e-Factura API-ból | Webhook bejövőre | Ár | Forrás |
|---|---|---|---|---|---|
| **Oblio** | ✅ Wallet, automatikus SPV-sync | ❌ nincs végpont | ❌ | **29 €/év**, 1. év ingyen; ≤3 dok/hó örökre ingyen | [oblio.eu/api](https://www.oblio.eu/api), [oblio.eu/cat-costa](https://www.oblio.eu/cat-costa) |
| **SmartBill** | ✅ „Preia e-Facturi" (Cheltuieli riport), tömeges ZIP-letöltés XML/PDF | ❌ a publikus API (api.smartbill.ro) csak kimenő dokumentumokat fed (invoice, estimate, payment, stock) | ❌ | alap ~5,44 €/hó+ÁFA (5 bejövő e-számla/hó); **API csak a drágább csomagokban** (~59–119 lej/hó) | [ajutor.smartbill.ro #1128](https://ajutor.smartbill.ro/article/1128-preluarea-e-facturilor-din-s-p-v), [api.smartbill.ro](https://api.smartbill.ro/), [smartbill.ro/preturi](https://www.smartbill.ro/preturi/facturare-gestiune) |
| **FGO** | ✅ automatikus SPV-preluare, jóváhagyási sorral | ⚠️ a publikus API dokumentáltan a *kiállított* számlákat/státuszokat/ügyféladatokat adja; bejövőre nincs nyilvánosan dokumentált végpont (rákérdezés: suport@fgo.ro) | ? | van ingyenes szint; részletes API-árazás nem publikus | [fgo.ro/e-factura](https://www.fgo.ro/e-factura/), [fgo.ro/integrare/api](https://www.fgo.ro/integrare/api/) |
| **Facturis-Online** | ✅ automatikus, időzített SPV-sync (küldött+fogadott letöltés+archiválás) | ⚠️ bejövőre nyilvánosan nem dokumentált | ? | csomagfüggő, nem publikus részletesség | [facturis-online.ro/e-factura](https://facturis-online.ro/facturare/e-factura) |
| **factureaza.ro** | ✅ automatikus pull 60 percenként (aktiváláshoz a cég ANAF-tanúsítványa kell egyszer) | ❌ az API v1 (REST/XML, API-kulcs) csak kimenő erőforrásokat fed (invoices, proformas, clients, products…) | ❌ | 3 hónap ingyen; a bejövők a havi dokumentumkeretet fogyasztják | [factureaza.ro/e-factura-furnizori](https://factureaza.ro/e-factura-furnizori), [factureaza.ro/documentatie-api-v1](https://factureaza.ro/documentatie-api-v1) |
| **emite-facturi.ro** (API-first aggregátor) | ✅ | ✅ **„listare și descărcare e-facturi primite"** + recepció-párosítás | ✅ `inbox.invoice.received` esemény | 5 számla/hó ingyen; e feletti sávos árazás (ajánlatkérés) | [emite-facturi.ro/integrari-api](https://www.emite-facturi.ro/integrari-api) |
| **ANAF direkt** (SPV API) | — (nincs UI) | ✅ `listaMesajeFactura` + `descarcare` (ZIP: XML + aláírás) | ❌ (polling kell) | **ingyenes** | [static.anaf.ro OAuth-eljárás (PDF)](https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf), [anaf.ro API-regisztráció](https://www.anaf.ro/anaf/internet/ANAF/servicii_online/inreg_api) |

> ⚠️ = nyilvános dokumentációban nem szerepel; hivatalos megerősítés (support-megkeresés) nélkül nemlétezőnek kezelendő. A táblázat a 2026-07-10-i nyilvános dokumentáció-állapotot tükrözi.

**Ár-összevetés az Oblióval:** az Oblio 29 €/év árát senki sem üti meg úgy, hogy bejövő-API-t is adjon. Az emite-facturi.ro ingyen-sávja (5 számla/hó) egy kis gyülekezetnek határeset; a SmartBill API-s csomagja (~12–24 €/hó) a többszöröse az Oblio évi díjának. **Az egyetlen, ami az Oblio áránál is jobb ÉS teljes bejövő-API-t ad: az ANAF saját, ingyenes API-ja** — cserébe a fejlesztés a miénk.

---

## 4. Az ANAF saját e-Factura API-ja — mi kellene a közvetlen integrációhoz

Ez a megkerülhetetlen alapréteg (a fenti szolgáltatók is mind ezt hívják a háttérben).

**Egyszeri, fejlesztői oldalon (KARTOTEKA mint alkalmazás):**
1. OAuth-profil regisztrálása az anaf.ro portálon (Dezvoltatori Aplicații → Înregistrare pentru API-uri): alkalmazásnév + callback URL + E-Factura szolgáltatás kiválasztása → **Client ID + Client Secret**. (A regisztráló személynek SPV-hozzáférés kell tanúsítvánnyal.)

**Gyülekezetenként (a felhasználó oldalán):**
2. A gyülekezet (CUI) legyen regisztrálva az SPV-ben, és a tanúsítvány-birtokos (tipikusan a könyvelő vagy a lelkész) **egyszer** végigkattintja a böngészős OAuth2 authorize-t (`https://logincert.anaf.ro/anaf-oauth2/v1/authorize`) — **ehhez a gépén ott kell lennie a minősített digitális tanúsítványnak** (ez az ANAF követelménye, nem kerülhető meg).
3. A visszakapott kódból a szerver tokent vált (`https://logincert.anaf.ro/anaf-oauth2/v1/token`): **access token 90 napig, refresh token 365 napig érvényes**. A refresh-hez már NEM kell tanúsítvány → a szerver egy évig teljesen automatikusan újíthat. Évente egyszer kell a tanúsítványos újra-engedélyezés.

**Ezután a bejövő számlák lekérése:**
- `listaMesajeFactura` (üzenetlista CUI-ra, `zile` vagy intervallum paraméterrel; a bejövők `FACTURA PRIMITA` típusú üzenetek),
- `descarcare?id=` (ZIP: a számla XML-je + ANAF-aláírás) — **pontosan az a formátum, amit a mostani `ubl-parser.ts` + matcher pipeline már feldolgoz.**
- Nincs webhook → időzített polling kell (pl. óránkénti cron / Edge Function).

Források: [ANAF OAuth-eljárás PDF](https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf) · [token-érvényességek (közösségi dok.)](https://lorand.work/autentificare-oauth-si-obtinere-token-jwt-de-la-anaf-folosind-php/) · [integrációs útmutató](https://getmandato.dev/guides/romania-anaf/)

---

## 5. Ajánlás

**5.1 Rövid táv (Sprint 4–5): marad a fájl-alapú flow, felhő-szinkronnal.**
Az Oblio API-ból a bejövő számlák nem jönnek le, ezért a kézi ZIP-letöltés kiváltása Oblio-oldalon most nem lehetséges. A meglévő, tesztelt parser/matcher pipeline-ra épülő **hibrid Storage-szinkron** (desktop = kanonikus tár, XML mindig felhőbe, web olvasó — lásd [OBLIO_DESKTOP_WEB_TERV_2026-07-10.md](./OBLIO_DESKTOP_WEB_TERV_2026-07-10.md) 2. fejezet, (c) opció) a legkisebb kockázatú előrelépés.

**5.2 Közép táv (külön sprint): ANAF-direkt bejövő-szinkron a KARTOTEKA-ba.** Indoklás:
- **Ingyenes** (nincs harmadik fél díja; az Oblio 29 €/év a kimenő oldalra marad).
- A letöltött ZIP/XML **byte-ra ugyanaz**, mint amit ma kézzel töltenek le → a teljes meglévő pipeline (ubl-parser → matcher → `oblio_kiadas_match`) változtatás nélkül újrahasznosul; csak a „fájl bedobása" lépést váltja ki egy szerveroldali letöltő.
- Nem függünk egy aggregátor üzleti modelljétől/áremelésétől; multi-gyülekezetes izolációnk (RLS, congregation_id) alá természetesen illeszkedik.
- Költsége: egyszeri fejlesztés (OAuth-folyam + token-tár + polling + a meglévő ingest meghívása) + évi egyszeri tanúsítványos re-authorize gyülekezetenként.

**5.3 Ha a saját ANAF-integráció túl nagy falat:** az **emite-facturi.ro** az egyetlen talált szolgáltató dokumentált bejövő-API-val (`inbox.invoice.received` webhookkal) — kis gyülekezetnél (≤5 bejövő számla/hó) akár ingyen. Hátránya: új külső függőség, sávos árazás a keret felett, és az SPV-összekötés tanúsítványos lépése ott is kell.

**5.4 Amit NE tegyünk:** ne várjunk az Oblio-ra („majd lesz Wallet-API"), és ne scrape-eljük az Oblio webfelületét (törékeny, ÁSZF-kockázat).

---

## 6. A felhasználói élmény — „csak az API-kulcsot adja meg"

**Ma (fájl-alapú):** a lelkész kéthetente belép az Oblio Wallet-be / SPV-be → ZIP-et letölt → bedobja a `befogadott` mappába → ingest → párosítás. *Fájdalompont: a letöltögetés + a 60 napos ANAF-ablak.*

**A cél-élmény (ANAF-direkt szinkronnal):**
1. **Egyszeri beállítás (évente egyszer megismételve):** a Pénzügy → Oblio beállítások panelen egy „ANAF SPV összekötése" gomb → átirányítás az ANAF authorize-oldalára → a tanúsítvány-birtokos (könyvelő) jóváhagyja → kész. *Nem API-kulcs-gépelés, hanem egy OAuth-kattintás — a felhasználónak ez még egyszerűbb is.* (A kimenő oldalhoz az Oblio API-kulcs megadása marad, ahogy ma: `saveOblioConfig`.)
2. **Utána nulla kézimunka:** a szerver óránként lekéri az új bejövő számlákat (`listaMesajeFactura` → `descarcare`), az XML bekerül a meglévő pipeline-ba, a párosító fül magától frissül; a 60 napos határidő-csengő okafogyottá válik.
3. **Visszajelzés a UI-ban:** „Utolsó SPV-szinkron: ma 14:00 · 3 új számla", és a token lejárta előtt 30 nappal figyelmeztetés: „Az ANAF-engedély hamarosan lejár — kattints az újra-engedélyezéshez."

**Fontos, kommunikálandó korlát:** a szó szerinti „csak API-kulcs" élmény a bejövő számlákra **fizikailag nem létezik** egyik szolgáltatónál sem — az ANAF a cég SPV-hozzáférésének engedélyezését minősített tanúsítványhoz köti. A legjobb elérhető élmény az évi egyszeri tanúsítványos kattintás + teljes automatika a két kattintás között.

---

## 7. Források (ellenőrzés dátuma: 2026-07-10)

- Oblio API dokumentáció: <https://www.oblio.eu/api>
- Oblio Wallet: <https://www.oblio.eu/wallet> · SPV-riport: <https://www.oblio.eu/report/wallet>
- Oblio árazás: <https://www.oblio.eu/cat-costa> · <https://www.oblio.eu/pret-onest>
- Oblio hivatalos API-kliensek: <https://github.com/OblioSoftware/OblioApiJs> · <https://github.com/OblioSoftware/OblioApi>
- SmartBill SPV-preluare (UI): <https://ajutor.smartbill.ro/article/1128-preluarea-e-facturilor-din-s-p-v> · letöltés: <https://ajutor.smartbill.ro/article/1157-descarcarea-e-facturilor-preluate-din-spv> · API: <https://api.smartbill.ro/> · árak: <https://www.smartbill.ro/preturi/facturare-gestiune>
- FGO e-Factura: <https://www.fgo.ro/e-factura/> · API: <https://www.fgo.ro/integrare/api/> · szállítói számlák: <https://www.fgo.ro/facturi-furnizori/>
- Facturis-Online e-Factura: <https://facturis-online.ro/facturare/e-factura>
- factureaza.ro szállítói e-Facturák: <https://factureaza.ro/e-factura-furnizori> · API v1: <https://factureaza.ro/documentatie-api-v1> · OAuth-integráció: <https://factureaza.ro/ajutor/integrare-efactura-oauth2>
- emite-facturi.ro API: <https://www.emite-facturi.ro/integrari-api>
- ANAF OAuth2 regisztráció (hivatalos PDF): <https://static.anaf.ro/static/10/Anaf/Informatii_R/API/Oauth_procedura_inregistrare_aplicatii_portal_ANAF.pdf> · API-regisztráció: <https://www.anaf.ro/anaf/internet/ANAF/servicii_online/inreg_api>
- ANAF token-érvényesség + PHP-példa: <https://lorand.work/autentificare-oauth-si-obtinere-token-jwt-de-la-anaf-folosind-php/> · <https://getmandato.dev/guides/romania-anaf/>
