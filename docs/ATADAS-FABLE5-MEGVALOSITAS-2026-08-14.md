# Átadási dokumentum — megvalósítási brief

**Címzett:** a megvalósítást végző modell (Fable 5)
**Készítette:** Opus 5, 2026-08-14 · 14 párhuzamos kódfelmérő ágens + hivatalos forrásdokumentumok elemzése
**Ág:** `feature/kor6-mentes-szelet-tulelese` · web **v0.9.165**

> **Ez a dokumentum önmagában elegendő a munka elvégzéséhez.** Nem feltételezi, hogy olvastad
> az előzményeket. Minden állítás mögött **ellenőrzött** fájl:sor hivatkozás áll — ahol nem,
> ott külön jelzem, hogy **feltételezés**.

---

## 0. Mielőtt bármihez hozzányúlsz

### 0.1 A projekt öt vasszabálya

1. **⚠️ Ez NEM az a Next.js, amit ismersz.** Saját verzió, törő változtatásokkal.
   **Olvasd el a vonatkozó útmutatót a `node_modules/next/dist/docs/` alatt**, mielőtt kódot írsz.
   *(Forrás: `AGENTS.md`.)*
2. **A migration-fájl NEM bizonyíték arra, hogy lefutott élesben.** A repó és a produkció
   **bizonyítottan széthúz**. Nincs `supabase/migrations/` — minden SQL a `migration-docs/sql/`
   alatt fájlként él, és **a felhasználó futtatja kézzel**. Ha valamit az élő DB-ről kell tudni,
   **írj ellenőrző SELECT-et a felhasználónak**, ne tippelj.
3. **Nincs Supabase MCP ehhez a projekthez.** (A csatolt „Baratosi Project" **nem** a Kartotéka DB-je.)
4. **Fail-closed mindig.** Ha egy hatókör nem oldható fel, az eredmény **üres** legyen, ne „országos".
   Ez a projekt dokumentált hibaosztálya: *skalár hatókör + `if (id) filter` = néma teljes szivárgás.*
5. **Minden javítás a `docs/CHANGELOG.md`-be kerül**, **lelkész-barát nyelven** (nem fejlesztőnyelven):
   mi volt a baj, mi változott, kell-e tenned valamit. A formátumot lásd a fájl tetején.

### 0.2 Ellenőrzés — minden kör végén kötelező

```bash
npm run typecheck
```
```bash
npm run selftest
```

Mindkettőnek **tisztán** kell lefutnia. A `selftest` lánc önellenőrző szkripteket futtat
(`scripts/selftest-*.mjs`), amelyek **build és tesztkeret nélkül**, a `typescript` csomaggal
transpile-olják a forrást. **Új üzleti logikához írj új önellenőrzést**, és kösd be a
`package.json` `selftest` láncába — ez a projekt bevett mintája.

### 0.3 Munkamódszer

Feature-ág → PR → merge a `main`-be, **fázisonként**. A `main`-re **közvetlen push tiltott**.
Push után **automatikus deploy**. Verziószám a `apps/web/package.json`-ban.

⚠️ **Bash-ben a commit-üzenethez használj heredoc-ot**, ne `-m "..."`-t backtickekkel —
a shell értelmezi és lenyeli a részeket.

---

## 1. Ami MÁR KÉSZ (ne csináld újra)

**Commit `9498ccf`** — nyomtatási központ, 14./15./17. pont:

- `packages/ui-app/src/finance/FinancePrintDialogBody.tsx` — a „racsni"-hiba javítva
  (mérés előtt `el.style.height = '0px'`), és scroll-reset `report.html` változásra.
- `packages/ui-app/src/finance/reporting.ts` — a csoportnapló súly-alapú lapozót kapott.
- `packages/ui-app/src/finance/budget-reporting.ts` — a „Belső használatra…" felirat törölve.
- **Új:** `scripts/selftest-csoportnaplo.mjs` (C1–C10), bekötve a `selftest` láncba.

**Commit `1a18a514`** — a négy döntés + a mentés működés-ellenőrző SQL.

---

## 2. A négy döntés — KÖTELEZŐ betartani

Részletesen: [`docs/DONTESEK-2026-08-14.md`](./DONTESEK-2026-08-14.md). Röviden:

| # | Döntés |
|---|---|
| **1** | A `szemely` **NEM kap `deleted` oszlopot**. Elhalálozás és hibás felvitel **két külön út**. Végleges törlés **csak tiszta kapcsolat-ellenőrzés után**, naplózva. Ha van kapcsolat → **csak láthatatlanná tétel**. |
| **2** | A kassza **képernyős** rendezése marad **csökkenő**. ⚠️ A **nyomtatvány kronologikus** — a kettő szándékosan külön. |
| **3** | Gyülekezeti fájl-terület = **Supabase Storage**, `{congregation_id}/…` útvonallal. **NEM** gyülekezetenkénti Google Drive. ⚠️ **Cloudflare nincs bekötve a rendszerbe** (ellenőrizve: nincs `wrangler`, R2, S3, sem függőség). |
| **4** | 2FA = **opt-in**, Supabase natív TOTP-vel. **Mentőkódokkal** és a **desktop-flow-val együtt** szállítandó. |

---

## 3. Megvalósítási sorrend

### 1. hullám — blokkolók (a rendszer ma adatot rejt el vagy hazudik)

---

#### 🔴 1.1 — Kuka: három független blokkoló (6. pont)

**A) Az oldal MINDEN betöltésnél kivétellel elszáll — ELLENŐRIZVE**

`apps/web/app/(dashboard)/kuka/page.tsx:32` egy **függvényt** ad prop-ként
Server Componentből Client Componentbe:

```ts
labelBuilder: buildRecycleBinLabel(t.dexieTable),
```

`apps/web/lib/offline/recycle-bin-labels.ts:8-9` — a `buildRecycleBinLabel` **függvényt ad vissza**
(`return (record) => string`), a `apps/web/components/shared/recycle-bin-client.tsx:1` pedig
`'use client'`. A Next.js ezt nem engedi: *„Functions cannot be passed directly to Client Components."*

**Javítás iránya:** ne a függvény menjen át, hanem a **`dexieTable` név**, és a
`labelBuilder`-t a **kliens oldalon** állítsa elő ugyanabból a `buildRecycleBinLabel`-ből.
A `recycle-bin-labels.ts` tiszta függvény, kliensen is importálható.

**B) A ténylegesen törölt modulok SOHA nem jelennek meg — ELLENŐRIZVE**

`page.tsx:26` szűr: `TABLE_REGISTRY.filter(t => t.softDelete)`.
`apps/web/lib/offline/table-registry.ts`-ben **mindössze 7 tábla** van `softDelete: true`-val:
`berleti_szerzodes`, `iktato`, `iktato_sablonok`, `sirhelytemeto`, `sirhely`, `sirhelyberles`,
`sirhelyelhunyt`.

**Hiányzik**: `befizetes`, `kiadas`, `belsomozgas`, `munkanaplo`, `leltar_tetelek` —
**pedig ezek IS soft-delete-eltek**. Bizonyíték: `packages/ui-app/src/finance/reporting.ts:837`
a tételeket `r.deleted` szerint szűri, tehát a `deleted` oszlop létezik és használatban van.

**Javítás iránya:** a `softDelete` flag felzárkóztatása a valósághoz.
⚠️ **Előbb ellenőrizd SQL-lel**, mely táblán van valóban `deleted` oszlop (ne a flagből indulj ki) —
a `leltar_tetelek` állítólag `is_deleted` nevű oszlopot használna, ami **PostgREST 42703-mal bukna**.

**C) A „Végleges törlés" nem töröl véglegesen — ELLENŐRIZENDŐ**

A felmérés szerint a `_hardDelete` jelzőnek **nincs feldolgozó ága** a
`processMutation`/`processDelete`-ben, és a `stripClientFields` amúgy is eldobná →
a rekord a **következő szinkronnal visszajön**. **Ezt a javítás előtt igazold vissza.**

**Kell hozzá:** külön `op` a mutation-sorban a hard delete-hez, **szerver-oldali RPC**
(`recycle_bin_restore` és `recycle_bin_purge`), és **valódi `deleted_at` oszlop** —
ma a „30 nap múlva törlődik" visszaszámláló az `updated_at`-ból van hamisítva.

**D) A személyek külön útja** — lásd a 2. pont 1. döntését. Ez **új munka**, nem javítás.

---

#### 🔴 1.2 — Leltár: néma 1000 soros plafon (10. pont)

**A leltár olvasója nem lapoz** → a PostgREST alapértelmezett 1000 soros korlátja
**némán csonkolja az EGÉSZ modult**. Nem hibaüzenet: egyszerűen hiányoznak a tételek.

**Javítás iránya:** `range()`-alapú lapozás a leltár olvasóiban.
⚠️ **Három testvér-olvasó** van, **három különböző kategória-névvel és aktivitás-definícióval** —
a jegyzőkönyv-melléklet vagyonleltára is lapozás nélkül olvas. Mindet javítsd.

**Kapcsolódó, ugyanitt:** az **RLS-hatókör szűkebb, mint az app-hatókör** → néma ÜRES lista
könyvelőnek, számvevőnek, kerületi adminnak. ⚠️ Az élő RLS állapota **nem ellenőrizhető a repóból** —
írj SELECT-et a felhasználónak.

**Ellenőrző SQL (add oda a felhasználónak):**
```sql
-- Hány gyülekezetnél lépi át a leltár az 1000 tételt? (a csonkolás súlyossága)
SELECT congregation_id, count(*) AS tetel
  FROM public.leltar_tetelek
 WHERE COALESCE(deleted, false) = false
 GROUP BY congregation_id
HAVING count(*) > 900
 ORDER BY tetel DESC;
```

---

#### 🔴 1.3 — 2FA: a jogi nyilatkozat hazudik (8. pont)

**A rendszer jogi nyilatkozata azt állítja, hogy van kétlépcsős azonosítás — de NINCS.**
Az egész monorepóban **nulla** MFA-kód van (se `enroll`, se `challenge/verify`, se AAL-ellenőrzés).

**Ez két lépés, és az elsőt AZONNAL meg kell tenni:**

1. **A nyilatkozat javítása** — egysoros szövegjavítás. Amíg nincs 2FA, ne állítsuk, hogy van.
2. Utána a tényleges bevezetés (lásd 3. hullám).

**Ugyanebben a körben rendezendő, független a 2FA-tól:**
- **A god-mode PIN PLAINTEXTBEN áll az adatbázisban**, és az összevetés nem időzítés-biztos.
  A **default PIN benne van egy migration-fájlban**.
- Az `audit_log` `ip` és `user_agent` oszlopa **soha nem töltődik**, a felület mégis mutatja.
- **A sikertelen bejelentkezés és a kijelentkezés soha nem kerül naplóba.**
- Nincs alkalmazás-szintű **login rate-limit** (a god-mode PIN-nek van: 5/10 perc).

---

#### 🔴 1.4 — Sötét mód + mobil: két blokkoló (9. pont)

**A) A 9 fő modul fülsora (`ColorTabs`) sötét módban olvashatatlan** — az aktív fül
majdnem fehér pirula, világos szöveggel.

**B) A shell gyökere `h-screen`** → telefonon a lap alja a böngésző-címsáv alá kerül,
**és nem görgethető oda**. **100 dialógus `vh`-val írja felül a `dvh`-alapot** →
a **Mentés gomb a képernyő alá kerülhet**. *(20 helyen `100vh`/`h-screen`/`min-h-screen`.)*

**⚠️ Fontos kontextus a témázáshoz:**
- Az **éles accent OLÍVAZÖLD (`#6b8e4e`)**, nem arany. A `:where(:root)` fallback paletta
  **arany** accentet visz — ez ellentmond az élő arculatnak.
- A `.dark` kompatibilitási blokk **hardkódolt teal rgba-kat** használ tokenek helyett.
- A globális `.dark{…!important}` **átszivárog a szándékosan mindig világos felületekre**
  (Missziós Műhely, publikus gyülekezeti oldal) — ezeket ki kell zárni.
- **A `themes.css` `:where(:root)` 0-specificitású trükkje kritikus** — ne törd el.
- **A `Recharts` diagramok inline stílust használnak** → CSS-sel **nem javíthatók**;
  téma-aware színkészlet kell (hook, ami futásidőben olvassa a CSS-változókat).

**Léptékadat a döntéshez:** 589 komponensből **82** ismer `dark:` variánst;
**268 fájlban** van hardkódolt szín **nulla** `dark:` párral; összesen **~11 549** hardkódolt
paletta-osztály. **Ezt nem lehet egy körben letakarítani** — a két blokkolót javítsd,
a többihez tegyél **lint-szabályt**, hogy ne nőjön tovább.

---

### 2. hullám — a kért napi javítások

#### 2.1 — Profil (1. pont)

**a) Az e-mail levágódik.** `apps/web/components/modals/profile-dialog.tsx:459-465` —
a `StatCard` értékén nincs `break-words`/`break-all`, és nincs `min-w-0`;
a hero-konténer viszont `overflow-hidden` (`:249`). Ugyanez `:484` (`ProfileRow`).
A fejlécben `truncate` + `hidden lg:block` (`header-refined-v3.tsx:565`) → **mobilon nem is látszik**.

**b) A szolgálati előzmény: a tábla LÉTEZIK, csak senki nem olvassa.**
`pastor_service_history` (migráció: `migration-docs/sql/2026-05-05-pastor-service-history-tartozas-mod.sql:15-99`,
**5 RLS policyval**). Írja: **csak** a welcome-varázsló (`app/(setup)/welcome/actions.ts:784-815`).
Olvassa: **senki az egész repóban**. Ezért áll a profilban „Még nincs rögzítve".

**c) A szolgálati hely sehol nincs a gyülekezethez kötve** — sem a `pastor_service_history`-ban,
sem a `pastor_profiles.previous_service_places`-ben nincs `congregation_id` FK. **Ez új oszlop/tábla.**

**d) A `profiles.congregation_id` helyben íródik felül** (`admin_activate_user` RPC,
`2026-07-01-admin-activate-user-reassign.sql:66-83`) — **nincs előzmény-sor, nincs mezőszintű audit**.
Áthelyezéskor a lelkész **nem kap értesítést**, pedig az `ertesitesek` mechanizmus él.

⚠️ **A profil mentése FELÜLÍRJA a varázsló szolgálati előzményét** → két divergáló tároló.
⚠️ **A `/profile` OLDAL és a profil DIALÓGUS széthúz** — az oldal a `pastor_profiles`-t nem is
olvassa, tehát **minden új mezőt kétszer kell megépíteni**, vagy előbb egyesíteni a kettőt.

#### 2.2 — „Gyülekezetünk adatai" újratervezés (4. pont)

- **A 7 kártya akcentusa élesben EGYFORMA** — a színkódolás némán megsemmisül.
- **Sötét módban minden kártyafejléc világos pasztell sáv, világos szöveggel → olvashatatlan.**
- **Mobilon az IBAN és az adószám kilóg és levágódik** (szóköz nélküli, tördelhetetlen sztringek).
- **A megosztható publikus link MÁR BE VAN TÖLTVE a szülőben**
  (`congregation-dialog-v2.tsx:157-160, 232-235`), de **nem kerül át a `summaryData`-ba** (`305-328`).
- A komponens **0 db design-tokent** használ.

**Kész minták, amiket használj (ne találj ki újat):**
- **Web Share**: `apps/web/components/dashboard/birthday-card-dialog.tsx:317-346` — kiforrott
  (`canShare`-ellenőrzés, `AbortError` = mégse, `NotAllowedError` → letöltés-fallback).
- **PDF**: `printToPdf(htmlContent, filename)` — `print-engine-v2.ts:133`, készen áll.
- **Token-készlet**: `apps/web/components/admin/_shared/` — bevált, széles körben adoptált.

⚠️ **Nincs közös copy-to-clipboard hook** — 5 helyen ismételt inline logika, egyenetlen
hibakezeléssel (csak 1 guardol a hiányzó `navigator.clipboard`-ra). **Emeld ki közösbe.**

#### 2.3 — Leltár oldal (12. pont)

- A kategória-szűrő **legördülő, nem gombsáv**, és **nincs darabszám sehol**.
- Az „Új tétel" gomb **a négy egyforma outline-gomb egyike**.
- ⚠️ **Nincs kategóriánkénti aggregátum** a képernyőn — a kért gombok feliratozásához
  (`Kegytárgyak (12)`) ezt **meg kell írni**.
- ⚠️ **Nincs DB-szintű kategória-kényszer**: a `kategoria` szabad `varchar`.
  A `normalizeInventoryCategory` ismeretlen értékre **`null`**-t ad → a tétel **eltűnik** a képernyőről.

#### 2.4 — Készpénz oldal (13. pont)

⚠️ **A `CashbookTab` és a `CombinedEntryBody` MEGOSZTOTT a desktoppal**
(`packages/ui-app/src/finance/`). Minden itteni változás **a desktopot is elmozdítja** —
használd a projekt bevett **`*Slot` prop-mintáját**, ne drótozz be web-specifikus dolgot.

- A rögzítő gomb **nem a Kassza fülön van**, hanem a hero-sávban (`finance-tabs.tsx:406-413`).
- ⚠️ **Az új sor alapértelmezett dátuma MA, nem a nézett pénzügyi év** → a mentett tétel
  **eltűnhet a listáról**. Ez adatvesztésnek *látszik* a felhasználónak.
- A rendezés **működik** és **marad csökkenő** (2. döntés).
- **Igevers:** ma **nulla** lelki tartalom van a pénzügy modulban. A `/api/daily-verse`
  **31** igét tartalmaz (a kommentje 366-ot ígér), és **nincs** pénzügyi/sáfársági készlet.
  Új `FINANCE_VERSES` gyűjtemény kell (pl. 2Kor 9,7 · Lk 16,10 · Péld 3,9).
  A szövegforrás: `apps/web/public/bibles/karoli.json` (natív Károli, nincs API-kulcs).

#### 2.5 — Nyomtatási előnézet mobil (14. pont maradéka)

Nincs zoom, nincs „teljes oldal / teljes szélesség" kapcsoló, nincs lapléptetés
többoldalas dokumentumnál — kizárólag görgetés.

#### 2.6 — Leltári fisă RO/HU (11. pont)

**Jó hír:** az **OMFP 2634/2015 eltörölte a merev nyomtatványmintákat** — csak
**kötelező minimális tartalmat** ír elő. A `Fişa mijlocului fix` (cod **14-2-2**) tehát
**szabadon tervezhető** szépre és kétnyelvűre, amíg a kötelező mezők megvannak.

**A kötelező mezők román↔magyar párokkal:** [`docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md`](./ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md) §1.3.

⚠️ **A projektben NINCS i18n-infrastruktúra**, csak egy hazudós placeholder-kapcsoló a
Beállításokban. A 11. pont ezért **modul-lokális** megoldást igényel (nyelv-paraméter a
`buildInventoryItemCardHtml`-nek és a hívóinak), **nem** globális nyelvváltást.

⚠️ A `getInventoryCategoryRomanianLabel` **halott kód**, és a jelenlegi román szöveg
**elavult helyesírású** (ş/ţ helyett ș/ț kellene).

⚠️ **Alapeszköz-küszöb: 2 500 lej** (2026-01-01). **Konfigurálhatónak kell lennie** —
a kormány emelheti. Ez köti a leltárt a lelkészi jelentés VIII.3. sorához.

---

### 3. hullám — nagy építkezés

#### 3.1 — Munkanapló + lelkészi jelentés (18. pont) — XL

**Teljes specifikáció:** [`docs/EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md`](./EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md)

**⚠️ A LEGFONTOSABB KORLÁT — olvasd el, mielőtt bármit átnevezel:**
A mező-azonosítók (`I.2a`, `II.3b`, …) **jsonb-kulcsok** a `lelkeszi_jelentes` tábla
`kezi_adatok` / `felulirasok` mezőiben **és a véglegesítési snapshotban**.
**A katalógus átszámozása ADATVESZTÉS.** Csak **append-only** bővítés lehetséges.
*(Forrás: `apps/web/lib/lelkeszi-jelentes/types.ts:1-15`.)*

**⚠️ A második legfontosabb: a `De.2` / `Du.2` szabály.**
Ma nincs megvalósítva → a templomlátogatási átlag **ÁTLAGOL, ahol ÖSSZEADNI kellene**.
A hivatalos súgó példája: vasárnap 9-kor 100-an, 11-kor 200-an. `De.2` jelöléssel **300**;
jelölés nélkül **150**. A mai `napszak` mező (`'de'|'du'|'este'`) ezt nem ismeri.

**Taxonómia-ütközés (ez a kiindulópont, minden más erre épül):**

| | Ma | Hivatalos EREK |
|---|---|---|
| Szolgálati alkalmak | 17 | **37** |
| Katekézis | 8 | **11** (köztük *Vallásóra 1–5. csoport*) |
| Látogatás | 6 | **2** (CsL / BL) |

*Jó hír:* a Kartotéka `szolgalat`/`katekezis`/`latogatas` hármasa **pontosan megfelel**
az Excel három munkalapjának — a struktúra jó, a listák térnek el.

**További kritikus szabály:** a vallásóra-átlag nevezője a **`Vallásóra 1. csoport`**
alkalmainak száma (= a vallásórás hetek száma), **nem** az összes vallásóra.

**Amit fel lehet használni (ne írd újra):**
- ✅ **A következtetés-motor KÉSZ**: `apps/web/lib/annual-report/conclusions.ts` —
  12 kategória, rövid/hosszú táv, `basis` + `dataQuality`, min. 3 év a trendhez.
  **Csak nincs bekötve a lelkészi jelentésbe.**
- ✅ **Recharts 3.8.1 megvan** a projektben — de a munkanapló/jelentés **egyetlen grafikont
  sem** használ. ⚠️ Hardkódolt hexekkel rajzol, és **nem érhető el a `packages/ui-app`-ból**
  (tehát desktopon nincs grafikon).
- ✅ Nyomtatható lelkészi jelentés **már van**, 122 mezővel.

⚠️ **KÉT párhuzamos „éves jelentés" él a kódban**, más adatmodellel, **más számokkal**:
`lelkeszi_jelentes` (I–X.) · `annual_reports` (10 szekció) · `reporting.ts buildEvesJelentes`.
**Ezt tisztázni kell**, mielőtt új mezőket veszel fel — különben három igazság lesz.

#### 3.2 — Oblio ZIP + gyülekezeti fájl-terület (7. pont) — XL

**Kutatás:** [`docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md`](./ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md) §3

**Tervezési sarokpontok:**
- **Supabase Storage**, `{congregation_id}/{ev}/{forras}/{fajl}` útvonal (3. döntés).
  ⚠️ Ma a webes Drive-mappa a gyülekezet **nevéből** slugolódik → **átnevezés = néma fájlvesztés**.
- **Az adapter bemenete az e-Factura XML (UBL 2.1 / RO_CIUS) legyen**, ne az Oblio saját
  formátuma — ezt **törvény írja elő minden** romániai szolgáltatónak, így a SmartBill,
  Facturis, FGO stb. lényegében ingyen jön.
- **A „kifizetetlen számla" nem heurisztika**: az Oblio API `/docs/invoice/list` végpontjának
  **`collected=0`** paramétere hitelesen adja.
- ⚠️ **Megőrzési kötelezettség:** az ANAF SPV **csak 60 napig** őrzi a számlákat, a törvény
  **5–10 évet** ír elő → a vödörre **nem** szabad automatikus törlést tenni, és **be kell
  sorolni a mentésbe**.

**Blokkolók, amiket meg kell oldani:**
- Ma **nincs szerveroldali ZIP/UBL feldolgozó** — a parser böngésző-only (`DOMParser` nélkül kilép).
- **Egy számla csak EGY kiadáshoz köthető** (`UNIQUE (congregation_id, anaf_uuid)`) →
  a kért **szétosztás strukturálisan lehetetlen**; allokációs kapcsolótábla kell.
- **Nincs `forras`/`szolgaltato` dimenzió** sehol — minden ANAF-UUID-központú.

**Kész minták:** `iktato-csatolmanyok` feltöltési lánc · QR-alapú, token-kapus mobil feltöltő ·
`/api/internal/backup` cron-minta.

#### 3.3 — Desktop paritás (3. pont) — XL

Teljes paritás-mátrix: [`docs/18-PONT-FELMERES-2026-08-14.md`](./18-PONT-FELMERES-2026-08-14.md) §1.

**A gyökérok:** a `@kartoteka/offline-sync` **csontváz maradt** — a web és a desktop
**két teljes, párhuzamos sync-motort** tart fenn. Amíg ez nincs kitöltve, minden paritás-javítás
kétszeres munka.

⚠️ **A desktop hatóköre a `profiles.role` SKALÁRBÓL** származik, nem a `profile_roles`-ból,
és **nincs fail-closed őrszem**. Ez ugyanaz a hibaosztály, amit a weben már lezártunk.

---

## 4. Amit NE tegyél

1. **Ne nevezd át a lelkészi jelentés mező-azonosítóit** — adatvesztés (lásd 3.1).
2. **Ne állítsd `auto: true`-ra a `III.17`-et** — a `types.ts:243-260` három okot sorol fel,
   mindegyik **aláírt papíron** üt vissza.
3. **Ne „egységesítsd" a kassza képernyős és nyomtatási rendezését** — szándékosan külön (2. döntés).
4. **Ne törd el a `themes.css` `:where(:root)` 0-specificitású trükkjét.**
5. **Ne támaszkodj az `utility-overrides.css`-re** új kódban — tudatos, dokumentált technikai adósság.
6. **Ne vedd bizonyítéknak a migration-fájlt.** Ha az élő DB állapotáról van szó, kérdezz SQL-lel.
7. **Ne adj függvényt propként Server → Client Component irányban** (ez a mai kuka-hiba).

---

## 5. Nyitott, ELLENŐRIZENDŐ pontok

Ezekre **nincs bizonyítékom**, a megvalósítás előtt tisztázandók:

| # | Kérdés | Hogyan |
|---|---|---|
| 1 | Mely táblán van **valóban** `deleted` oszlop, és melyiken `is_deleted`? | SQL a felhasználónak |
| 2 | A `leltar_tetelek` élő **RLS-policyja** a csupasz skalárt használja-e? | SQL a felhasználónak |
| 3 | A `_hardDelete` tényleg feldolgozatlan-e a push-ban? | kódolvasás |
| 4 | Hány gyülekezetnél lépi át a leltár az 1000 tételt? | SQL (fentebb megadva) |
| 5 | A **member-portal P0 auth-izolációs lánc** (12 SQL fájl) éles állapota | SQL a felhasználónak |

---

## 6. Forrásdokumentumok a repóban

| Fájl | Tartalom |
|---|---|
| [`docs/18-PONT-FELMERES-2026-08-14.md`](./18-PONT-FELMERES-2026-08-14.md) | Pontonkénti állapot, súlyozva, fájl:sor hivatkozásokkal |
| [`docs/EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md`](./EREK-MUNKANAPLO-LELKESZI-JELENTES-SPEC-2026-08-14.md) | A hivatalos EREK űrlap teljes specifikációja (I–X. fejezet, 37+11+2 típus, számítási szabályok) |
| [`docs/ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md`](./ROMAN-SZABVANYOK-KUTATAS-2026-08-14.md) | OMFP 2634/2015 · OMFP 2861/2009 · Oblio API · e-Factura · Supabase MFA |
| [`docs/DONTESEK-2026-08-14.md`](./DONTESEK-2026-08-14.md) | A négy döntés kifejtve, megvalósítási következményekkel |
| `migration-docs/sql/2026-08-14-mentes-mukodes-ellenorzes.sql` | A napi mentés működés-ellenőrzése (csak olvas) |

| [`docs/KONYVELES-2026-OSSZEHASONLITAS-TERV-2026-08-14.md`](./KONYVELES-2026-OSSZEHASONLITAS-TERV-2026-08-14.md) | A hivatalos Könyvelés 2026 csomag ⇄ Kartotéka: **164 eltérés** (18 ⛔, 53 🔴), K1–K8 megvalósítási csomagok |
| `migration-docs/sql/2026-08-14-konyveles-2026-ellenorzesek.sql` | **97 read-only ellenőrző SELECT** az élő adatbázisra (a felhasználó futtatja, az eredmények visszaérkeznek) |

> ⚠️ **A K1–K8 csomagok megvalórítása CSAK a felhasználó (Endre) explicit jóváhagyása után
> indulhat** — ő kérte, hogy a felmérés után álljunk meg. A 97 SQL eredménye a K-csomagok
> pontos hatókörét is módosíthatja (mi tényleges adathiba élesben, mi csak kód-hiányosság).
