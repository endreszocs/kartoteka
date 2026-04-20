# Kartotéka — Tauri 2 migrációs terv

**Dátum**: 2026-04-21 (w — frissítve a Railway + Brevo döntésekkel)
**Készítette**: Szőcs Endre (a Kartotéka fejlesztője) + Claude (elemzési segítség)
**Státusz**: Döntési anyag — nem jóváhagyott, nem implementáció-indítás
**Célközönség**: Endre (fejlesztő-lelkész), Erdélyi Református Egyházkerület (EREK) Elnöksége, esetleg külső fejlesztő-kollégák
**Hatókör**: a jelenlegi offline-first rendszer lehetséges átalakítása Tauri 2 desktop kliensre, Supabase backend bővítéssel

---

## 1. Vezetői összefoglaló

### A helyzet

A Kartotéka jelenleg **működő** Next.js 16 PWA, ami a böngészőben és opcionálisan Windows standalone csomagként is fut. Az offline képesség **több rétegben ki van építve** — Service Worker, IndexedDB (Dexie), sync-orchestrator, mutation queue, konfliktus-kezelő, Excel I/O, ZIP backup, SQLite standalone wrapper —, és a rendszer napi használatra **alkalmas**.

Egy külső szakértő azonban megnézte ezt az architektúrát és egy **gyökeresen más** megközelítést javasolt: **Tauri 2 desktop kliens + SQLCipher titkosított lokális adatbázis + Stronghold kulcstár + bővített Supabase backend** (access-request approval, eszközhöz kötés, E2E titkosított dokumentumtár, aláírt updater).

A szakértő érvelése erős:
- A jelenlegi PWA biztonsági garanciái gyengébbek (nincs lokális DB-titkosítás, nincs eszköz-bind, nincs admin-approval)
- A lelkészek gépein érzékeny adatok vannak (tagnyilvántartás, anyakönyv, pénzügy) — GDPR-szempontból kellemetlen, ha ellopott laptop → plaintext
- A desktop app-élmény stabilabb, mint a böngészőbeli PWA (aláírt bináris, auto-update, nincs "böngésző-tab")

Ez a tervdokumentum azt vizsgálja, hogy **mibe kerül**, **mit kapunk érte**, és **reális-e** ez az átállás a jelenlegi környezetben (1 fő fejlesztő, erdélyi református egyházkerületi keretek).

### Mit javasol a szakértő?

1. **Tauri 2 desktop shell** (Rust + WebView2) Windows-ra
2. **Közös webes UI** (React/Vite SPA) — online és offline mód
3. **SQLCipher** (AES-256 titkosított SQLite) lokálisan
4. **Stronghold** kulcstár (argon2 derivált mester-kulcs)
5. **Supabase backend bővítve**: access-request (nincs nyílt regisztráció), admin approval, email confirm, custom JWT claim, RLS minden táblán
6. **Aláírt Tauri updater** (ed25519 signature, GitHub Releases)
7. **Eszközhöz kötés + licenc** (max 2 eszköz / user)
8. **E2E titkosított dokumentumtár** (DEK + device public key wrap, Storage csak ciphertextet tárol)
9. **Outbox-alapú sync** (pull/push, Realtime trigger, revision-alapú konfliktus-kezelés)

### Mit javaslok Endrének?

**Rövid válasz**: először ez a tervdokumentum kerüljön az EREK Elnöksége elé. A Tauri-kaland vállalható, **DE nem a fejlesztő dönt**, ez üzleti-szervezeti kérdés. Három lehetőség áll elő:

| Variáns | Idő (Endre saját munkája) | Szolgáltatási költség | Kockázat | Megfontolás |
|---------|---------------------------|----------------------|----------|-------------|
| **V1** — Csak backend biztonsági erősítés | 3-4 hét | **$0 plusz** (már meglévő Supabase) | Alacsony | 80% nyereség saját időben |
| **V3** — Tauri SQLite (titkosítás nélkül) | 5-6 hónap | +$100-200/év code-sign | Közepes | Fizikai desktop app, de DB olvasható |
| **V4** — Teljes terv (szakértő) | 9-12 hónap | +$100-200/év code-sign + Railway ~$15-30/hó | Közepes-magas | Legszigorúbb biztonság |

**Fontos**: mivel **Endre maga a fejlesztő**, nincs külső fizetős munka. Csak saját idő-ráfordítás és a futó szolgáltatási költségek (lásd 11. szekció).

**Javaslatom**:
1. **Azonnal**: V1 bevezetése — függetlenül attól, hogy mi jön később. Ez mindenképp értékes, a jelenlegi rendszerhez nem-törő módon illeszthető.
2. **3-6 hónap múlva**: Elnökségi döntés a V3 vagy V4-ről, ha releváns. Addig V1 működik, és tapasztalatot szerzünk.
3. **Soha**: ne indítsuk a V4-et a V1 nélkül. A V1 előfeltétele bármilyen további lépésnek.

### A dokumentum szerkezete

A következő szekciók sorra átmennek: (2) jelenlegi állapot tényszerűen, (3) szakértői ajánlás kivonata, (4) architektúra-ábra, (5) négy variáns részletes összehasonlítása, (6) ha V4 — fázisos roadmap, (7) Supabase bővítés konkrét SQL-vázlatokkal, (8) mit törlünk/cserélünk/tartsunk, (9) Next.js sorsa, (10) kockázati mátrix, (11) költség-összefoglaló, (12) stakeholder-kommunikáció, (13) Word-export, (14) konkrét ajánlás Endrének, (15) zárókép.

---

## 2. Jelenlegi állapot — tényszerűen

A jelenlegi offline rendszer részletes diagnosztikája megtalálható: **`docs/project-tracking/KARTOTEKA-offline-diagnosztika-2026-04-21u.md`**. Az ott szereplő adatok összefoglalva:

### 2.1 Offline stack LOC-mérlege

| Modul / könyvtár | Fájlok száma | Becsült LOC |
|------------------|-------------|-------------|
| `lib/offline/` (Dexie séma, sync, queue, conflict, Excel I/O, full-backup) | 18 | ~2000 |
| `lib/standalone/` (better-sqlite3 wrapper, licenc, monthly-sync) | 9 | ~600 |
| `components/offline/` (status-bar, queue-panel, conflict-dialog, Excel UI) | 16 | ~800 |
| `components/standalone/` (license-banner, wizard) | ~5 | ~400 |
| `app/api/standalone/*` (5 Next.js API route) | 5 | ~400 |
| `app/sw.ts` + `next.config.ts` Serwist-wrapper | — | ~150 |
| `app/(dashboard)/offline/page.tsx` | 1 | ~100 |
| **Összesen** | **~55 fájl** | **~4450 LOC** |

### 2.2 Csomag-függőségek (`package.json`)

**Offline stack**:
- `dexie` ^4.4.2, `dexie-react-hooks` ^4.4.0 (IndexedDB ORM)
- `@serwist/next` ^9.5.7, `serwist` ^9.5.7 (PWA service worker)
- `better-sqlite3` ^12.9.0 (standalone natív SQLite)
- `node-machine-id` ^1.1.12 (licenc-fingerprint)

**Megmaradó (Excel / backup)**:
- `exceljs` ^4.4.0, `xlsx` ^0.18.5, `jszip` ^3.10.1

### 2.3 Mi működik, mi hiányosság

**Működik** (Fázis 0-6 elkészült):
- Service Worker precache (Serwist)
- IndexedDB mirror 26 táblával, scope-filter (per-congregation)
- Pull/push sync revision-alapú optimistic lockingal
- Mutation queue FIFO + exponential backoff
- Konfliktus-dialog (keep_server / keep_local / manual_merge)
- Excel import/export (FileSystem Access API)
- ZIP backup (30 modul + metaadat)
- Offline diagnostics oldal (`/offline`)
- Standalone Windows portable build (`output: 'standalone'`, better-sqlite3)

**Hiányos / kockázatos**:
- **Nincs lokális DB-titkosítás** — IndexedDB és better-sqlite3 egyaránt **plaintext**. Ha a laptopot ellopják, a tagnyilvántartás, pénzügy, anyakönyv adatok mind olvashatóak (akár offline DB-kinyeréssel is)
- **Nincs eszköz-bind** — ugyanaz a login akárhány eszközön használható
- **Nyílt regisztráció** — bárki, aki tud egy regisztrációs URL-t, be tud lépni (igaz, email-confirm utáni)
- **Nincs admin-approval** — a profilt senki nem vizsgálja felül az első belépés előtt
- **Background Sync API nincs** — ha a tab bezárul pending queue-val, a feltöltés megáll
- **Offline auth token refresh nincs** — 1 órás JWT lejár offline, re-auth szükséges
- **Havi cloud-sync endpoint (Fázis 7d)** — standalone módra tervezve, de **untested**

### 2.4 Coupling-audit eredménye

A jelenlegi offline kód **jól elkülönített**:
- A `/offline` oldalon **kívüli** dashboard-oldalak (pl. `dashboard/page.tsx`, `tagnyilvantartas/*`, `penzugy/*`) **NEM importálnak** a `lib/offline/`-ból, sem Dexie-ből
- A **42 fájl importálja** a `lib/offline/`-t, **27 fájl** a `lib/standalone/`-t — mind-mind az offline-UI körében
- Jó hír: a Tauri-migráció **moduláris** lehet, nem kell az egész app-ot újraírni

### 2.5 Meglévő dokumentáció

- `docs/project-tracking/KARTOTEKA-pwa-offline-first-2026-04-15.md` — PWA user guide, magyar
- `docs/project-tracking/KARTOTEKA-pwa-testing-checklist-2026-04-15.md` — kézi teszt-forgatókönyvek
- `docs/project-tracking/KARTOTEKA-standalone-offline-terv-2026-04-15.md` — a jelenlegi standalone fázisos terve
- `docs/project-tracking/KARTOTEKA-offline-diagnosztika-2026-04-21u.md` — részletes jelenlegi diagnózis

---

## 3. A szakértő ajánlása — kivonat

A szakértői vélemény kulcs-pontjai (idézett és tömörített formában):

### 3.1 Architektúra
- Tauri 2 desktop shell + közös webes UI (nem natív Windows)
- SQLCipher + Stronghold a lokális oldalon
- Supabase marad szerver-autoritatív (Postgres + RLS + Storage + Edge Functions + Realtime)

### 3.2 Access-request workflow
- **Nincs nyílt regisztráció** — a publikus oldalon csak hozzáférés-kérő űrlap
- Admin elfogadja → `profiles.approved = true`
- Email confirm kötelező, custom JWT claim (`approved`)
- Service-role kulcs sosem kerül böngészőbe

### 3.3 Első belépés és eszköz-bind
- Első használat mindig online
- Edge Function ellenőrzi: email confirmed, approved, device regisztrálható, licenc aktív, verzió kompatibilis
- Csak ezután ad bootstrap manifest-et és signed URL-eket

### 3.4 Titkosított lokális adattár
- SQLCipher (AES-256) → DB-key Stronghold-ban
- Dokumentumok: minden DEK külön, a user/device public key-ével wrap-olva
- Lemezen csak ciphertext

### 3.5 Updater és verzió
- **Tauri Updater** aláírt frissítésekkel (signature ellenőrzés nem kikapcsolható)
- Két réteg: app-bináris (Windows MSI) + tartalom (frontend asset pack, DB migrációk)
- Minden release-hez: verzió, `min_supported_version`, release note MD, mandatory-flag, checksum

### 3.6 Offline használat bejelentkezés nélkül
- Online első aktiválás után, az eszköz "felismert"
- Offline működés: helyi DB-ről, helyi "unlock" (PIN / session-unlock)
- Online visszatérés: outbox push + Realtime pull

### 3.7 Fontos őszinte megjegyzés (a szakértőtől idézve)
> „Teljes, 100%-os ne-lehessen-másolni védelem nincs, ha a támadó teljes hozzáférést kap a saját gépéhez. Amit reálisan el lehet érni: eszközhöz kötés, aktív licencellenőrzés, rövid életű letöltési URL-ek, titkosított helyi DB és dokumentumok, egyszerre korlátozott számú aktív eszköz, watermark / audit log / exportkorlátozás. Ez erős védelem, de nem abszolút DRM."

Ezt az őszinteséget **megőrizzük** a döntéshozatal során is: a cél **reális védelem**, nem DRM-illúzió.

---

## 4. Architektúra-ábra

### 4.1 Teljes terv (V4)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       WINDOWS GÉP (lelkész)                               │
│                                                                            │
│   ┌────────────────────────────────────────────────────────────────┐    │
│   │  TAURI 2 DESKTOP SHELL (Rust bináris, ~15 MB)                   │    │
│   │                                                                  │    │
│   │  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────┐ │    │
│   │  │  WebView2        │   │  Rust core       │   │  Stronghold │ │    │
│   │  │  (MS Edge eng.)  │◀─▶│  - tauri::cmd    │◀─▶│  (kulcstár) │ │    │
│   │  │                  │   │  - IPC bridge    │   │  argon2     │ │    │
│   │  │  React/Vite SPA  │   │  - HTTP client   │   └─────────────┘ │    │
│   │  │  (UI + állapot)  │   │  - SQLite-wrap   │                   │    │
│   │  └──────────────────┘   └────────┬─────────┘                   │    │
│   │                                   │                             │    │
│   │                          ┌────────┴──────┐                      │    │
│   │                          │   SQLCipher   │                      │    │
│   │                          │   (AES-256)   │                      │    │
│   │                          │   kartoteka.  │                      │    │
│   │                          │      db       │                      │    │
│   │                          └───────────────┘                      │    │
│   │                                                                  │    │
│   │   ┌────────────────────────────────────────────────────────┐    │    │
│   │   │  Tauri Updater (aláírt MSI, ed25519, GitHub Releases)  │    │    │
│   │   └────────────────────────────────────────────────────────┘    │    │
│   └────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │ HTTPS + WSS
                                       │ (JWT + device-key header)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│          RAILWAY (EU West Metal, Amsterdam — europe-west4-drams3a)        │
│          Next.js 16 webes app (landing, /gy/[slug], admin, access-req.)   │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     SUPABASE EU (Frankfurt — felhő-autoritatív)           │
│                                                                            │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│   │ Postgres+RLS │  │ Auth (email  │  │ Storage      │  │ Edge         ││
│   │ + triggers   │  │  confirm +   │  │ (titkosított │  │ Functions    ││
│   │ + revision   │  │  admin app.) │  │  blobok)     │  │ (sync, acc.) ││
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                                            │
│   Realtime (WebSocket) — pull trigger a más eszközökön                    │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       │ SMTP / REST
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│          BREVO (Franciaország — transactional email szolgáltató)          │
│          access-request értesítő, admin-approval email, broadcast         │
│          Free tier: 300/nap = ~9000/hó, GDPR-szigorú                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Rétegek és felelősségek

| Réteg | Technológia | Felelősség |
|-------|-------------|-----------|
| UI | React + Vite SPA (TypeScript) | User interakció, állapotkezelés (Zustand vagy Jotai), routing |
| Desktop shell | Tauri 2 + Rust | Ablakkezelés, IPC, WebView2 host, updater, OS-integráció |
| Lokális DB | SQLCipher (AES-256) | Offline-autoritatív adattárolás, tranzakciók |
| Kulcstár | Tauri Stronghold | DB-key, device-key, Supabase refresh-token |
| Sync | Rust HTTP kliens + outbox | Pull/push Supabase-el, Realtime előfizetés |
| Backend | Supabase Postgres + Edge Fn | Szerver-autoritatív sync, RLS, admin approval |
| Dokumentumok | Supabase Storage + DEK | E2E titkosított fájltárolás |
| Auth | Supabase Auth + custom claim | Email confirm + admin approve + device bind |

### 4.3 Next.js webes oldal (C variáns)

A Tauri kliens **nem helyettesíti** a Next.js app-ot, hanem **mellette** létezik:

```
                  ┌─────────────────────────────────┐
                  │   NEXT.JS 16 app (kartoteka.hu) │
                  │   - landing oldal               │
                  │   - /gy/[slug] publikus oldalak │
                  │   - admin felület (online)      │
                  │   - access-request űrlap        │
                  └────────────────┬────────────────┘
                                   │
                                   │ shared Supabase
                                   │
                  ┌────────────────┴────────────────┐
                  │   TAURI 2 kliens (Windows)       │
                  │   - lelkészi dashboard           │
                  │   - offline-first működés         │
                  │   - helyi titkosított DB          │
                  └──────────────────────────────────┘
```

A két app **közös** Supabase backend-et használ, de **külön UI-kódbázisuk** van. A `lib/supabase/client.ts`, `components/ui/*`, design-tokenek, brand-elemek **átemelhetők** a Tauri-SPA-ba monorepo-workspace vagy manuális copy formájában.

---

## 5. Négy variáns — döntési anyag

Ez a szekció a legfontosabb a döntéshozóknak. Négy fokozat van — **nem mindegyiket kell választani**, lehet egymásra építeni (V1 → V3 → V4).

### V1 — Csak biztonsági backend-erősítés

**Idő**: 3-4 hét (solo dev)
**Költség**: ~3-5K EUR (fejlesztő-órák) + 0 eszköz-költség

**Mit csinálunk**:
- `access_requests` tábla + Edge Function + admin UI (egy új oldal a meglévő admin-dashboardban)
- `profiles.approved` oszlop (default false) + custom JWT claim hook
- Email confirm kötelezővé tétele (Supabase Dashboard)
- RLS policy-audit minden nyilvános-schema táblán (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` és policy-k)
- Storage buckets → private, signed URL csak RLS-ellenőrzés után
- Jelenlegi "nyílt regisztráció" kikapcsolása — csak admin-invite után lehet bejelentkezni

**Mit NEM csinálunk**:
- Tauri nincs
- Lokális DB titkosítás nincs (marad IndexedDB/better-sqlite3 plaintext)
- Eszköz-bind nincs
- Updater szabvány (manuális build + deploy)

**Nyereség**:
- ✅ GDPR-komfort: admin-oversight minden új user előtt
- ✅ Egyházkerületi elnökség jóváhagyhatja az új felhasználókat
- ✅ Nincs "ismeretlen lelkész" a rendszerben
- ✅ Storage hozzáférés felügyelt (nem ad-hoc signed URL)

**Elmaradt**:
- ❌ Ellopott laptop → DB olvasható
- ❌ Egy user N eszközön használja (nincs korlát)
- ❌ Desktop app élmény

**Kockázat**: **Alacsony**. Nem változtatjuk a core-működést, csak hozzáadunk. A jelenlegi lelkészek **változatlanul használhatják** a rendszert.

**Ajánlott**: **MINDENKÉPP elvégezni**, függetlenül a nagyobb döntéstől. Ez a biztonsági alapvonal.

---

### V2 — Thin Tauri shell (online-only)

**Idő**: 2-3 hónap
**Költség**: ~6-10K EUR + code-sign cert (~$500/év)

**Mit csinálunk**:
- Tauri 2 projekt init — ablak-wrapper
- WebView2 betölti a `https://kartoteka.hu`-t (vagy embedded export)
- Tauri Updater + aláírt MSI
- Desktop-integráció: rendszerikonok, start menü shortcut, uninstaller
- Offline: csak amit a Service Worker cachel (mint jelenleg)

**Mit NEM csinálunk**:
- Lokális DB nincs (sem Dexie, sem SQLite)
- Offline-írás nincs
- Eszköz-bind csak halvány (JWT)

**Nyereség**:
- ✅ "Desktop app" érzés — nincs böngésző-tab
- ✅ Aláírt bináris — Windows nem figyelmeztet
- ✅ Auto-update
- ✅ Offline-readable cache (kevésbé robusztus, mint Dexie)

**Elmaradt**:
- ❌ Offline-írás nincs
- ❌ DB-titkosítás nincs
- ❌ Minden online-kapcsolatnál Supabase-től függ

**Kockázat**: **Közepes**. A Tauri + Next.js SSR integráció **nem natív** — vagy a webet töltjük be URL-ről (hálózat-függő indítás), vagy SPA-exportot bundle-ölünk (nagy bináris, complex build).

**Ajánlás**: **Elkerülendő**, ha nincs specifikus stakeholder-elvárás. Kis haszon, közepes munka.

---

### V3 — Tauri SQLite (titkosítás nélkül)

**Idő**: 5-6 hónap
**Költség**: ~15-25K EUR + code-sign cert

**Mit csinálunk**:
- Tauri 2 + Vite SPA (új kódbázis)
- Rust core: SQLite (sima, nem titkosított) + `sqlx` vagy `rusqlite`
- Outbox tábla + sync worker (revision-alapú pull/push)
- Realtime-integráció a Supabase-ről
- Eszköz-bind (machine ID + device public key)
- Aláírt updater
- Auth: Supabase-login → JWT Stronghold-ban
- RLS-védett Supabase (V1-gyel közös)

**Mit NEM csinálunk**:
- **Nincs SQLCipher** — a SQLite plaintext
- **Nincs Stronghold** — a Windows DPAPI / Credential Manager védi a Supabase refresh-token-t
- **Nincs E2E dokumentum-titkosítás** — signed URL, de plaintext blobok

**Nyereség**:
- ✅ Teljes offline-first működés
- ✅ Aláírt bináris, auto-update
- ✅ Eszköz-korlát (max N device / user)
- ✅ Ugyanolyan UX mint a szakértő ajánlása, 50% költségen

**Elmaradt**:
- ❌ Ha a támadó kinyeri a SQLite fájlt a laptopról (pl. Linux live USB-vel), plaintext
- ❌ Ha a Windows user-account-t feltörik, DB olvasható

**Kockázat**: **Közepes**. A Rust-tanulóigény valós, a Supabase-sync kompatibilitás szintén. A biztonsági szintje **jobb** mint a jelenlegi PWA, de **rosszabb** mint a V4.

**Ajánlás**: **Megfontolandó alternatíva a V4-hez**, ha a költségvetés korlátos. A Windows user-account védelem sok esetben **elégséges** — főleg gyülekezeti keretek közt, ahol a laptopot a lelkész saját kezében tartja.

---

### V4 — Teljes terv (szakértő ajánlása)

**Idő**: 9-12 hónap (1 fő) vagy 6-8 hónap (2 fő)
**Költség**: ~35-55K EUR + code-sign cert + SQLCipher setup

**Mit csinálunk** — V3 minden + a következők:
- **SQLCipher** helyett a sima SQLite → DB-fájl AES-256 titkosítva
- **Stronghold** a DB-key tárolására (argon2 master-key a user-jelszóból)
- **E2E dokumentum-titkosítás**: DEK (random AES-256) minden doc-hoz, device public key-ével wrap
- **Bootstrap manifest**: első-letöltés-ellenőrzés Edge Function-en át

**Nyereség V3-hoz képest**:
- ✅ Ha a laptopot ellopják, a DB fájl olvashatatlan — még `sqlite3` CLI-vel sem
- ✅ Dokumentumok (PDF-ek, képek) csak az eszköz-tulajdonos által olvashatók
- ✅ Audit-log minden login + sync + doc-letöltés eseményre
- ✅ GDPR-compliance szinte tökéletes

**Elmaradt**:
- Nincs. Ez a maximum reális védelem.

**Kockázat**: **Közepes-magas**. SQLCipher Community Edition használata (BSD-3-license, OK), de integrációja (SQLCipher + Rust + Tauri) mérsékelt tanulóigényű. Stronghold stabil, de kevésbé dokumentált mint a többi. A **12 hónapos** commitment valós.

**Ajánlás**: **Csak akkor**, ha:
- Az egyházkerület **kifejezetten kéri** a legszigorúbb szintet
- A költségvetés **dokumentált** (35-55K EUR)
- Legalább 6 hónap **nyugodt fejlesztési idő** biztosított (nem megszakítva sürgős feature-ökkel)

---

### Összehasonlító táblázat

| Kritérium | Jelenlegi | V1 | V2 | V3 | V4 |
|-----------|-----------|----|----|----|----|
| Idő | — | 3-4 hét | 2-3 hónap | 5-6 hónap | 9-12 hónap |
| Költség EUR | — | 3-5K | 6-10K | 15-25K | 35-55K |
| Kockázat | — | Alacsony | Közepes | Közepes | Közepes-magas |
| Admin approval | ❌ | ✅ | ✅ | ✅ | ✅ |
| Email confirm | ❌ | ✅ | ✅ | ✅ | ✅ |
| Desktop app | ❌ | ❌ | ✅ | ✅ | ✅ |
| Offline-first | 🟡 | 🟡 | ❌ | ✅ | ✅ |
| Lokális DB | ✅ plaintext | ✅ plaintext | ❌ | ✅ plaintext | ✅ **titkosítva** |
| Eszköz-bind | ❌ | ❌ | 🟡 | ✅ | ✅ |
| E2E doc-titkosítás | ❌ | ❌ | ❌ | ❌ | ✅ |
| Aláírt updater | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 6. Fázisos roadmap (ha V4)

Ez **csak** akkor aktuális, ha az elnökség a V4-et választja. 6 fázis, mindegyik konkrét deliverable-lel.

### M0 — Előkészítés (6 hét)

**Deliverable**: Supabase backend bővítve + V1 is kész
**Siker-kritérium**:
- 8 új tábla létezik: `access_requests`, `user_devices`, `licenses`, `app_releases`, `content_releases`, `documents`, `document_keys`, `audit_log`
- Mindegyiken RLS policy
- 8 Edge Function skeleton (akár no-op is)
- Admin dashboard-ban az "access-request approve" gomb működik
- Email confirm kötelezővé téve
- **V1 befejezve** (biztonsági erősítés)

**Résztvevők**: 1 fő backend-dev (Endre)

### M1 — Tauri PoC (8 hét)

**Deliverable**: Működő Tauri 2 projekt + Vite SPA + bejelentkezés
**Siker-kritérium**:
- `npm run tauri dev` elindul Windows-on, WebView2 renderel
- Supabase Auth működik (email+password + JWT)
- Approved user JWT-vel megkapja a congregation_id claim-et
- Tauri→Rust IPC (pl. `invoke('hello_world')`) működik
- **Még nincs lokális DB** — minden query Supabase-hez

**Kockázat**: Next.js-komponensek átültetése Vite-ra. A `components/ui/*` (shadcn) általában kompatibilis, de pl. a `next/image`, `next/link` alternatívát kell keresni (Vite-ban: `img`, `react-router-dom`).

### M2 — SQLCipher + Stronghold (10 hét)

**Deliverable**: Lokális titkosított DB, DEK Stronghold-ban, első offline-CRUD
**Siker-kritérium**:
- SQLCipher séma az app első indulásnál (26 tábla + outbox + meta)
- Stronghold-ban a DB-key, argon2 derivált master-password-ból
- `list_szemely` Rust cmd offline + online működik
- INSERT/UPDATE/DELETE a `szemely` táblán offline, outbox-ba kerül
- Device-regisztráció Supabase-hez (`register_device` Edge Fn)

**Kockázat**: `rusqlite` + `sqlcipher` feature → natív binding, Windows-specifikus build. Egy hétre biztosan elmegy csak a cross-compile beállítás.

### M3 — Sync + Conflict (8 hét)

**Deliverable**: Rust outbox worker, Realtime, konfliktus-UI
**Siker-kritérium**:
- Pending mutation-ök automatikusan feltöltődnek, ha van net
- Pull minden 2 percben (aktív), 15 percben (háttér)
- Realtime: Postgres change → pull trigger
- 409 konfliktus → React UI dialog (keep_server / keep_local / manual_merge)
- Mind a 26 tábla szinkronizálódik

**Kockázat**: A Supabase Realtime + Rust integráció nem trivial. Alternatíva: HTTP poll minden 10 sec, Realtime későbbi fázisba tolva.

### M4 — Dokumentum-titkosítás (6 hét)

**Deliverable**: E2E titkosított fájltárolás
**Siker-kritérium**:
- Minden doc-nak saját DEK (AES-256 random)
- DEK a `document_keys` táblában, user/device public key-ével wrap-olva
- Feltöltés: kliens AES-titkosít → Storage
- Letöltés: signed URL → letöltés → dekript
- Admin nem látja a plaintextet (hacsak ő a tulajdonos)

**Kockázat**: X25519 kulcsgenerálás + Rust cryptography crate kiválasztása (pl. `age` vagy `crypto_box`). Egy napi kulcsforgatás vs. statikus device-key döntés.

### M5 — Updater + licenc (4 hét)

**Deliverable**: Tauri updater aláírt release-ekkel + device-limit
**Siker-kritérium**:
- Code-signing cert (EV vagy OV) — MSI aláírva
- Tauri updater ellenőrzi GitHub Releases / Supabase Storage
- Új verzió → user jóváhagyja → auto-patch
- Device-limit: 1 licenc = N eszköz, extra → admin approve

**Kockázat**: EV code-sign cert ~$300-700 egyszeri + $200/év. OV elég lehet (olcsóbb, ~$100/év), de SmartScreen-reputation felépítése időbe telik.

### M6 — Tesztelés + stabilizálás (8 hét)

**Deliverable**: Production-ready 1.0
**Siker-kritérium**:
- 3 gyülekezet béta-tesztel 6 héten át
- Playwright / WebDriver e2e tesztek a kritikus flow-kra
- Rust unit tesztek a sync-worker-re, conflict-resolver-re
- Crash-reporting (Sentry vagy Tauri-saját)
- Telepítő dokumentáció magyarul
- V1-től felszámolt átmenet (gyülekezetek migrálása)

### Összesen

**48 hét (~11 hónap)** solo-dev esetén. **32 hét (~7-8 hónap)** 2 fős team esetén.

---

## 7. Supabase backend bővítés — konkrét SQL

### 7.1 Új táblák

```sql
-- Hozzáférés-kérelmek (nincs nyílt regisztráció)
CREATE TABLE public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('lelkesz', 'esperes', 'hivatal')),
  congregation_slug TEXT,  -- opcionális: melyik gyülekezethez szeretne
  justification TEXT,       -- szabad-szöveg indoklás
  phone TEXT,               -- kapcsolat
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT              -- spam-elemzéshez (hashed!)
);

-- Eszköz-bind
CREATE TABLE public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,    -- tauri-generált eszköz-ID
  device_name TEXT,                     -- user-barát név ("Endre laptopja")
  platform TEXT NOT NULL,               -- 'windows-x64' stb.
  public_key BYTEA NOT NULL,            -- X25519 a dokumentum-kulcs wrap-hoz
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_by UUID REFERENCES auth.users,
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, device_fingerprint)
);

-- Licenc (max device, lejárat)
CREATE TABLE public.licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  congregation_id UUID REFERENCES public.congregations,
  device_limit INT NOT NULL DEFAULT 2,
  valid_from DATE NOT NULL DEFAULT now(),
  valid_until DATE NOT NULL,
  issued_jwt TEXT NOT NULL,   -- aláírt JWT, offline-validálható
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App-release-ek (Tauri updater)
CREATE TABLE public.app_releases (
  version TEXT PRIMARY KEY,              -- semver
  platform TEXT NOT NULL,                -- windows-x64
  min_supported_version TEXT,            -- alattról jöjjön force-upgrade
  signature TEXT NOT NULL,               -- ed25519 aláírás
  download_url TEXT NOT NULL,            -- Supabase Storage signed URL template
  sha256 TEXT NOT NULL,
  mandatory BOOLEAN NOT NULL DEFAULT false,
  release_notes_md TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tartalom-release-ek (pl. új közös sablonok, DB migrációk)
CREATE TABLE public.content_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('db_migration', 'template', 'config')),
  payload JSONB NOT NULL,
  min_app_version TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dokumentumok (titkosított)
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users,
  congregation_id UUID REFERENCES public.congregations,
  storage_path TEXT NOT NULL,               -- pl. 'docs/{uuid}.enc'
  filename_encrypted BYTEA NOT NULL,        -- a filename maga is titkos
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- DEK-ek device-enként wrap-olva
CREATE TABLE public.document_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.user_devices ON DELETE CASCADE,
  wrapped_dek BYTEA NOT NULL,   -- a DEK, a device public key-ével titkosítva
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, device_id)
);

-- Audit-log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  device_id UUID REFERENCES public.user_devices,
  action TEXT NOT NULL,                   -- login, sync_push, doc_download, approve, ...
  target_table TEXT,
  target_id UUID,
  metadata JSONB,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- profiles.approved oszlop hozzáadás
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users;
```

### 7.2 RLS policy-minta

```sql
-- Access requests: INSERT anon, SELECT csak admin
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit access request"
  ON public.access_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Only admin can view access requests"
  ON public.access_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Only admin can update access requests"
  ON public.access_requests FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- User devices: tulajdonos + admin
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own devices"
  ON public.user_devices FOR SELECT
  USING (user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Users insert their own devices"
  ON public.user_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Only admin can revoke devices"
  ON public.user_devices FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Licenses: read-own, admin writes
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own license"
  ON public.licenses FOR SELECT
  USING (user_id = auth.uid());

-- Documents: owner + congregation members + admin
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can access documents"
  ON public.documents FOR ALL
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profile_roles pr
               WHERE pr.user_id = auth.uid()
                 AND pr.scope_id = documents.congregation_id
                 AND pr.role IN ('lelkesz', 'esperes'))
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Document keys: csak a kulcs-tulajdonos eszköz user-e
ALTER TABLE public.document_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Device owner sees wrapped keys"
  ON public.document_keys FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_devices ud
                 WHERE ud.id = document_keys.device_id
                   AND ud.user_id = auth.uid()));
```

### 7.3 Auth hookok

**Email confirm kötelezővé tétele** (Supabase Dashboard → Authentication → Providers → Email → "Enable email confirmations: ON").

**Custom JWT claim** — ha a `profiles.approved = true`, csak akkor engedélyezett a belépés:

```sql
-- Custom access token hook (Supabase: Database → Functions → auth.custom_access_token_hook)
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  user_approved boolean;
  user_congregation_id uuid;
BEGIN
  SELECT approved, congregation_id
    INTO user_approved, user_congregation_id
    FROM public.profiles
    WHERE id = (event->>'user_id')::uuid;

  claims := event->'claims';

  IF user_approved THEN
    claims := jsonb_set(claims, '{approved}', 'true');
  ELSE
    claims := jsonb_set(claims, '{approved}', 'false');
  END IF;

  IF user_congregation_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{congregation_id}', to_jsonb(user_congregation_id::text));
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$$;
```

**Sign-up trigger** — új user → ne hozzunk létre profile-t approve nélkül:

```sql
-- Megakadályozzuk, hogy új user automatikusan approved legyen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, approved)
  VALUES (NEW.id, NEW.email, false);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 7.4 Edge Function-ek listája

Mindegyiket Supabase CLI-ben létrehozva, Deno runtime:

| Név | Szerep |
|-----|--------|
| `request-access` | Anonim POST — access-request-et rögzít, admin-nak email |
| `approve-user` | Admin POST — approved=true + user értesítő email |
| `reject-user` | Admin POST — rejection_reason mentés + email |
| `register-device` | Authentikált POST — új device hozzáadás, limit-ellenőrzés |
| `revoke-device` | Admin/self POST — device.revoked = true |
| `issue-bootstrap-manifest` | Első sync-nél — teljes congregation snapshot + signed URL-ek |
| `check-updates` | GET — legújabb app-release + signature |
| `sync-push` | Batch POST — mutation-ök feldolgozása revision-alapon |
| `sync-pull` | GET — delta `updated_at > cursor` a scope-on belül |

---

## 8. Mit töröljünk / cseréljünk / tartsunk

### 8.1 Részletes táblázat (V4 esetén)

| Komponens / fájl | LOC | Döntés | Indoklás |
|---|---|---|---|
| `lib/offline/db.ts` (Dexie schema) | ~400 | **TÖRLÉS** | Helyette SQLCipher séma Rust-ban |
| `lib/offline/sync-orchestrator.ts` | ~350 | **TÖRLÉS** | Helyette Rust outbox worker + Realtime |
| `lib/offline/pull.ts` + `push.ts` | ~500 | **REFAKTOR** | A revision+updated_at logika marad, Rust-ban |
| `lib/offline/mutation-queue.ts` | ~200 | **REFAKTOR** | Outbox tábla SQLCipher-ben, ugyanaz a FIFO |
| `lib/offline/conflict-resolver.ts` | ~150 | **MEGTART (UI)** | A 3 mód (keep_server/local/manual) UI-t tartjuk |
| `lib/offline/excel-reader/writer/watcher.ts` | 1379 | **TÖRLÉS (MVP)** | Fázis 8+ funkció, nem kritikus. FS Access API nincs Tauri-ban |
| `lib/offline/full-backup.ts` | 258 | **REFAKTOR** | ZIP generálás Rust-ban (`zip` crate) |
| `lib/offline/table-registry.ts` | ~100 | **MEGTART** | A 26 tábla listája közös, Rust const-ba átemelhető |
| `lib/offline/fs-handle-store.ts` | ~80 | **TÖRLÉS** | FS Access API nincs Tauri-ban |
| `lib/offline/hooks/*` | ~200 | **REFAKTOR** | `invoke('get_rows')` + `invoke('save_row')` Tauri IPC-re |
| `components/offline/*` (16 komponens) | ~800 | **REFAKTOR** (14/16) | Status-bar, queue-panel, conflict-dialog marad, IPC-re köti |
| `components/offline/excel-*` (5 komponens) | ~200 | **TÖRLÉS (MVP)** | Fázis 8+ |
| `lib/standalone/sqlite-db.ts` + `offline-supabase-wrapper.ts` | ~400 | **TÖRLÉS** | Ez a better-sqlite3 hack — Tauri-ban Rust natív SQLCipher |
| `lib/standalone/license-*.ts` (4 fájl) | ~250 | **REFAKTOR** | JWT-licenc marad, Rust validáció |
| `lib/standalone/machine-fingerprint.ts` | ~40 | **TÖRLÉS** | `node-machine-id` helyett Tauri `getMachineUid()` + Stronghold |
| `lib/standalone/monthly-sync.ts` + `runtime-detect.ts` | ~300 | **TÖRLÉS** | A "havi sync" elavul — folyamatos outbox |
| `components/standalone/*` | ~400 | **REFAKTOR** | Welcome-wizard + access-request flow-val bővül |
| `app/api/standalone/*` (5 route) | ~400 | **TÖRLÉS** | Tauri közvetlen Supabase-kapcsolat |
| `app/sw.ts` + Serwist config | ~50 | **TÖRLÉS** | SW nem kell Tauri-ban |
| `next.config.ts` Serwist wrapper | ~125 | **REFAKTOR** | Serwist eldobva, kimarad |
| `middleware.ts` | ~25 | **MEGTART** (webes) | Tauri-buildben nem fut, web-kompatibilis marad |

### 8.2 Csomag-változás

**Törlés**:
- `dexie` ^4.4.2
- `dexie-react-hooks` ^4.4.0
- `@serwist/next` ^9.5.7
- `serwist` ^9.5.7
- `better-sqlite3` ^12.9.0
- `node-machine-id` ^1.1.12

**Megtartás (az Excel / backup Fázis 8+-ban)**:
- `exceljs` ^4.4.0
- `xlsx` ^0.18.5
- `jszip` ^3.10.1

**Új (Tauri stack)** — `package.json`-ba:
- `@tauri-apps/api` ^2.x
- `@tauri-apps/cli` ^2.x (dev)

**Új Rust crate-ek** (a Tauri projekt `Cargo.toml`-jában):
- `tauri` = "2"
- `tauri-plugin-stronghold` = "2"
- `tauri-plugin-sql` = "2" (SQLCipher feature)
- `tokio` = "1" (async runtime)
- `reqwest` = "0.12" (HTTP client)
- `serde` + `serde_json` (JSON)
- `uuid`, `chrono` (id + idő)
- `zip` (backup)
- `age` vagy `crypto_box` (X25519 key wrap)

### 8.3 Nettó LOC-becslés

- **Törölt**: ~3200 LOC (offline + standalone + Excel + PWA)
- **Refaktorált** (TS logika → Rust): ~1500 LOC TS → **~2000 LOC Rust** (verbose)
- **Új Rust-kód** (Tauri cmd-ek, SQLCipher migration, outbox, Stronghold): ~3000-4000 LOC
- **Új webes SPA-kód** (csak a Tauri-SPA-hoz, nem érinti a Next.js-t): ~3000-5000 LOC
- **Új Supabase SQL** (új táblák + RLS + Edge Function): ~1500 LOC

**Összes új kód**: ~10-12K LOC. **Eldobott kód**: ~3.2K LOC.

---

## 9. Next.js sorsa — a C variáns

### 9.1 A döntés

A Plan agent három opciót vetett fel (A: két kódbázis párhuzamosan, B: Next.js SPA-ra átírás, C: Next.js marad + Tauri külön kliens). Endre a **C variáns** mellett döntött.

### 9.2 A C variáns magyarázata

**Next.js marad** — változatlanul:
- Landing oldal (`/`)
- Publikus gyülekezeti oldalak (`/gy/[slug]`)
- Online admin-felület (`/admin/*`)
- Access-request űrlap (`/hozzaferes-kerese`)
- Marketing-oldalak
- Az **egész jelenlegi dashboard** (Next.js SSR-alapon, 72 Server Action-nel)

**Tauri egy teljesen külön projekt**:
- Új workspace: `apps/desktop/` (vagy külön repo)
- Vite + React SPA (új kódbázis)
- Rust core + Tauri 2 shell
- **Közös Supabase backend**
- **Közös design-rendszer** (a `components/ui/*` átemelve)

### 9.3 Előnyök

- ✅ A 72 Server Action **nem kell átírni** Edge Function-be (óriási munkamennyiség elkerülve)
- ✅ A jelenlegi online admin és publikus oldal **érintetlen** marad
- ✅ Tiszta határok: a web-app = online, a Tauri-app = offline-first desktop
- ✅ Inkrementális migrálás: a lelkészek **választhatnak** — aki szeretné, letölti a Tauri-app-ot, aki nem, a böngészőben marad

### 9.4 Hátrányok

- ❌ Két kódbázis karbantartása (de nem UI-duplikáció — a Tauri csak a dashboard-funkciót viszi át)
- ❌ Közös komponens-frissítés: ha egy UI-elem (pl. dialog) változik, két helyen kell átírni
- ❌ Feature-drift kockázata: a Tauri-app lemaradhat a webes verzióról, vagy fordítva

### 9.5 Mitigáció

- **Monorepo** (npm workspaces): `apps/web/` (Next.js) + `apps/desktop/` (Tauri) + `packages/ui/` (közös)
- **CI**: mindkét app buildje a CI-ben, common tests
- **Dizájn-tokenek**: egy `packages/design-tokens` Tailwind-preset, amit mindkét app használ
- **Supabase-kliens**: egy `packages/supabase-client` lib (typed queries, RLS-aware)

### 9.6 Mit kell megtartani a jelenlegi Next.js-ben?

**Ebbe az app-ba semmi nem változik** (a V1 backend-erősítésén kívül):
- Marad a Next.js 16 SSR
- Marad az offline PWA (Dexie, Serwist) — a lelkészek, akik böngészőben használják, továbbra is offline-első működéshez jutnak
- Maradnak a 72 Server Action
- Marad az önálló Windows "portable" build (`output: 'standalone'`, better-sqlite3)

**Az egyetlen változás**: **a V1 biztonsági erősítés** — access-request, admin approval, email confirm, RLS audit.

---

## 10. Kockázati mátrix

### K1 — Next.js SSR nem-kompatibilitás (C variáns csökkenti)
- **Eredeti kockázat**: ha Next.js SSR-t bele kell kényszeríteni Tauri-ba, 72 Server Action átírandó Edge Function-be (~50-100 munkanap)
- **C variáns**: a Next.js változatlan marad, a Tauri saját SPA-kódbázissal indul — **kockázat: alacsony**
- **Megoldás**: monorepo + közös packages

### K2 — Rust tanulóigény (közepes)
- **Eredeti kockázat**: ha a fejlesztő nem ismer Rust-ot, a Tauri cmd-ek, async sync-worker, SQLCipher-integráció tanulási idő
- **Mitigáció**:
  - Tauri 2 sample-repóból indulás (`tauri-plugin-sql` + SQLCipher példa elérhető)
  - Kezdetben **wrapper cmd-ek** (`invoke('supabase_select', {table, filter})`), az üzleti logika TS-ben marad
  - A Rust csak a kulcskezelés, titkosítás, updater részekre
- **Kockázat**: közepes, de **kezelhető**

### K3 — SQLCipher licenc (alacsony)
- **Eredeti kockázat**: SQLCipher Commercial Edition ~$3000+/év
- **Valóság**: **Community Edition BSD-3 licencű**, kereskedelmi felhasználás megengedett
- **Alternatíva**: `sqlcipher-rs` crate (MIT licencű) — Rust wrapper a Community Edition-höz
- **Kockázat**: alacsony

### K4 — Windows-only korlát (közepes)
- **Eredeti kockázat**: lelkészek 5-10%-a Mac/Linux-ot használ
- **Realitás**: a Kartotéka célközönsége Erdélyi református lelkészek — **95%+ Windows**
- **Mitigáció**: Tauri 2 natív multi-platform — Mac/Linux build a MVP után nyitva. **MVP Windows x64-re** (user explicit döntése)
- **Kockázat**: közepes, de **elfogadott**

### K5 — 2000+ LOC eldobás pszichológiai hatása (alacsony)
- **Eredeti kockázat**: a jelenlegi offline-kód működik, eldobni "pazarlásnak" tűnik
- **Realitás**: a revision+outbox **elve** átkerül Rust-ba, a conflict-resolver UI-ja megmarad, a dokumentáció archívba
- **Pszichológiai mitigáció**: a jelenlegi kód **tanulópályaként** szolgált — az új rendszer **annak mintájára** készül, csak jobb alapokon
- **Kockázat**: alacsony

### K6 — Sync-modell ellentmondás (közepes)
- **Eredeti kockázat**: a Supabase revision-trigger server-authoritative, a Tauri kliens ragaszkodhat a lokálishoz — race condition-ök
- **Mitigáció**:
  - Revision-alapú optimistic lock (a jelenlegi rendszerben is ez van — bevált)
  - Conflict-dialog minden 409-re (user dönt)
  - Audit-log minden push-ra (reproducibility)
- **Kockázat**: közepes, **kezelhető ismert mintákkal**

### K7 — Admin-approval bottleneck (alacsony)
- **Eredeti kockázat**: ha admin nyaral, nincs új user 2 hétig
- **Mitigáció**:
  - 2-3 admin (redundancia az EREK-ben)
  - Email-értesítés mindegyiknek
  - 48 órán túl escalation egyházkerületi elnökhöz
- **Kockázat**: alacsony

### K8 — Elnökségi döntés elhúzódása (közepes)
- **Új kockázat**: az EREK Elnöksége lassan dönt → a fejlesztés tervezhetetlen
- **Mitigáció**:
  - V1 **függetlenül** elindítható (nem igényel elnökségi döntést — biztonsági alapvonal)
  - Konkrét deadline a döntésre (pl. Q3 2026)
  - Ha nincs döntés → V1-nél marad a rendszer, nincs veszteség

### Kockázati összefoglaló

| Kockázat | Szint | Mitigáció | Maradvány |
|----------|-------|-----------|-----------|
| K1 | 🟢 Alacsony | C variáns | Alacsony |
| K2 | 🟡 Közepes | Sample, wrapper-cmd-ek | Alacsony-közepes |
| K3 | 🟢 Alacsony | Community Edition | Nulla |
| K4 | 🟡 Közepes | MVP Windows-only | Alacsony |
| K5 | 🟢 Alacsony | Filozófiai elfogadás | Nulla |
| K6 | 🟡 Közepes | Bevált optimistic lock | Alacsony |
| K7 | 🟢 Alacsony | Redundancia | Nulla |
| K8 | 🟡 Közepes | V1 függetlensége | Alacsony |

---

## 11. Költség-összefoglaló

### 11.0 Fontos tisztázás (2026-04-21w)

A fejlesztést **Endre maga végzi** (belső fejlesztő, nem külső vállalkozás). Ezért a
**fejlesztési órák költsége nem kerül kifizetésre** — csak az ő ideje. A pénzben
kifejezett költségek tehát **kizárólag szolgáltatási költségek** (hosting, email, Supabase).

További döntés: **nem Vercel, hanem Railway (EU Amsterdam, GDPR-kompatibilis)** a
hosting platform. A Vercel USA-alapú, EU-felhasználók adata az Atlanti-óceán túlpartjára
áramolna — ez GDPR-szempontból kockázat.

### 11.1 Munkaidő (Endre saját idejében)

| Fázis | Személy-hónap | Megjegyzés |
|-------|---------------|------------|
| M0 — Előkészítés + V1 | 1.5 | Supabase bővítés, access-request |
| M1 — Tauri PoC | 2.0 | Projekt init, Vite SPA, auth |
| M2 — SQLCipher + Stronghold | 2.5 | Titkosított lokális DB |
| M3 — Sync + Conflict | 2.0 | Outbox, Realtime |
| M4 — Dokumentum-titkosítás | 1.5 | DEK, Storage |
| M5 — Updater + licenc | 1.0 | Code-sign, device-bind |
| M6 — Tesztelés | 2.0 | Béta, stabilizálás |
| **Összes** | **12.5 személy-hónap** | ~11 hónap naptár-idő, saját idő-ráfordítás |

### 11.2 Futó szolgáltatási költségek (V4 rendszer esetén, EU hosting)

| Tétel | Havi | Évi | Megjegyzés |
|-------|------|-----|-----------|
| **Supabase Pro** (már most is ezt használjuk) | $25 | $300 | 8 GB DB, 100 GB file, 100K MAU, EU régió (Frankfurt) |
| **Railway Hobby** (Next.js web-app, EU Amsterdam) | **$15** átlag | $180 | Hobby tier $5/hó min + ~$10 usage. 200+ gyülekezetnél $25-30/hó |
| **Brevo email** (transactional) | **$0** | **$0** | Free tier: 300 email/nap = ~9000/hó, EU (francia), GDPR-szigorú |
| **Code-signing cert** (OV, Windows — Tauri-hoz) | — | ~$100-200 | Első évben + $100 egyszeri |
| **Sentry crash-reporting** (opcionális) | $26 | $312 | 10K események, ha a stabilitás-monitoring kell |
| **Domain név** (amortizált) | ~$1 | ~$15 | kartoteka.ro vagy hasonló |
| **Összesen** | **~$41** (alap) + $26 Sentry ha kell | **~$500-800** | **évi ~450-750 EUR** szolgáltatási költség |

**Megjegyzés**: a Supabase már most is fut, így az nem **extra** költség. A **tényleges
új költség** a Railway (~$180-360/év), a code-sign cert ($100-200), és opcionálisan
Sentry. **Email ingyen marad** Brevo-val.

### 11.3 Futó szolgáltatási költségek (V3 — Tauri SQLite)

Megegyezik V4-gyel — a titkosítás nem jelent extra szolgáltatási költséget (SQLCipher
Community Edition BSD-3 ingyenes). A különbség csak a fejlesztési időben.

### 11.4 Futó szolgáltatási költségek (V1 — csak backend)

Nincs új költség a jelenlegihez képest. A V1 csak szerver-oldali SQL + Edge Function +
admin UI — Supabase-en belül fut. **Email: átállás Resend-ről Brevo-ra = $0 megtakarítás**
(mindkettő ingyenes az adott mennyiségben, de Brevo EU-alapú, GDPR-kompatibilisebb).

### 11.5 Hosting platform — Vercel vs. Railway döntés

Az EREK elvárása a **GDPR-kompatibilitás** és az **EU-adatközpont**. Ezek alapján:

| Platform | Régió | GDPR | Árazás | Next.js-támogatás |
|----------|-------|------|--------|-------------------|
| **Vercel** | USA (primary) | ❌ Problémás — US-headquartered | $20/hó Pro | ✅ Natív |
| **Railway** | EU West Metal — Amsterdam, NL | ✅ EU adatközpont | Hobby $5 min + usage → reális **~$15/hó** | ✅ Natív (Nixpacks) |
| ~~Netlify~~ | USA | ❌ | — | ✅ |
| ~~AWS Amplify~~ | Globális | 🟡 Függ a régiótól | — | ✅ |

**Döntés**: **Railway** az EU West (Amsterdam) régióban. A `europe-west4-drams3a`
azonosító a Railway docs szerint ez az "EU West Metal". Adatközpont: Amsterdam,
Hollandia — EU-területen, GDPR-hatály alatt.

### 11.6 Email-szolgáltató döntés — Resend vs. Brevo

A jelenlegi rendszer **Resend**-et használ (`lib/broadcasts/email.ts`). A Resend
USA-alapú, az emailek USA-szervereken mennek át. A **Brevo** (ex-SendinBlue)
franciaországi alapú, EU-szervereken fut, GDPR-szigorú.

| Szolgáltató | Régió | Free tier | GDPR | Fizetős ár |
|-------------|-------|-----------|------|-----------|
| **Brevo** | Franciaország (EU) | **300 email/nap = ~9000/hó** | ✅ Szigorú | $9/hó = 5K email |
| **Mailjet** | Franciaország (EU) | 6000/hó (200/nap) | ✅ | $17/hó = 15K email |
| Resend | USA | 3000/hó (100/nap) | 🟡 EU data residency csak Pro-tól | $20/hó = 50K email |
| SMTP2GO | USA | 1000/hó | 🟡 | $15/hó |
| Amazon SES | EU-Frankfurt régió elérhető | Gyakorlatilag $0 | ✅ | $0.10/1000 email |

**Javaslat**: **Brevo**. Indoklás:
- **Ingyen 9000 email/hó** — bőven elég a mi használatunkhoz (access-request,
  admin-approval, broadcast: max havi 500 email 50 gyülekezetre)
- **EU (francia)** — GDPR-szigorú, data residency garantált
- **Dokumentált deliverability** — spam-folder-ellenállás nagyobb mint Resend-nek
- **Könnyű migráció** — SMTP vagy REST API, a `lib/broadcasts/email.ts` 20-30 sor
  átírásával becserélhető

**Migrációs lépések** (opcionális, ha elfogadjuk):
1. `npm install @getbrevo/brevo` (vagy SMTP-mel `nodemailer`)
2. `lib/broadcasts/email.ts` — `Resend`-kliens → Brevo-kliens (~20 sor)
3. `.env.local` — `RESEND_API_KEY` → `BREVO_API_KEY`
4. Tesztelés: 1 broadcast-küldés saját címre
5. Resend-csomag eltávolítása

**Becsült idő**: fél nap.

---

## 12. Stakeholder-kommunikáció

### 12.1 Lelkészek (kb. 20-100 user)

- **Nyelv**: magyar, technikai nélkül
- **Dokumentum**: 1-2 oldalas "A Kartotéka új verziója — miben lesz jobb?" pamflet
- **Fókusz**:
  - "A gépeden tárolt adatok titkosítva"
  - "Az app magától frissül"
  - "Új eszközt az esperes jóváhagyja"
- **Időzítés**: M5 után, béta-tesztelés előtt (V4 esetén)

### 12.2 Egyházkerületi Elnökség (EREK)

- **Nyelv**: magyar, középszintű technikai
- **Dokumentum**: 4-6 oldalas összefoglaló, ennek a dokumentumnak az **1, 5, 11, 14. szekcióit** kiemelve
- **Fókusz**:
  - A titkosítás szabványos AES-256
  - Az adatok EU-régióban tárolódnak (Supabase Frankfurt)
  - Admin-jóváhagyás minden új user előtt
  - Ha laptopot elveszítünk, az eszközt távolról revokáljuk
  - **4 variáns összehasonlítása** → konkrét döntés kérése
- **Időzítés**: **most**, a döntés megszületése előtt

### 12.3 Endre (user, fejlesztő)

- **Nyelv**: magyar, teljes technikai mélység
- **Dokumentum**: **EZ A DOKUMENTUM**
- **Fókusz**: minden — döntéshez, kivitelhez, kockázatokhoz
- **Időzítés**: most

### 12.4 Fejlesztő-kollégák (ha jönnek a csapatba)

- **Nyelv**: magyar vagy angol
- **Dokumentum**: `docs/` + `AGENTS.md` + Rust-specifikus kommentárok
- **Fókusz**: folytatható munka, conventions, setup
- **Időzítés**: M1 kezdésekor

---

## 13. Word-export (opcionális)

A döntéshozóknak **Word-ben** is át kell adni a tervet (nyomtatható, jegyzetelhető, email-barát).

### 13.1 Javasolt eszköz: pandoc

**Indoklás**:
- Ingyenes, cross-platform (Windows/Mac/Linux)
- Markdown → .docx natív támogatás
- Stílus-sablon testreszabható (`--reference-doc=reference.docx`)
- Tartalomjegyzék automatikusan generálódik
- **Már valószínűleg telepítve**, ha nem, 1 perc

### 13.2 Telepítés Windows-on

```powershell
# Chocolatey-vel:
choco install pandoc

# vagy a hivatalos installer letöltése:
# https://github.com/jgm/pandoc/releases
```

### 13.3 Generálás

```bash
cd "D:\Egyházi APP\KARTOTEKA\docs\project-tracking"

pandoc KARTOTEKA-tauri-migracio-terv-2026-04-21.md \
  -o KARTOTEKA-tauri-migracio-terv-2026-04-21.docx \
  --toc \
  --toc-depth=2 \
  -M title="Kartotéka — Tauri 2 migrációs terv" \
  -M author="Szőcs Endre, Barátosi Egyház" \
  -M date="2026-04-21" \
  --highlight-style=tango
```

### 13.4 Testreszabás (később, ha szükséges)

Ha a sablonon finomítani szeretnénk (fontok, színek, egyházi logó):
1. `pandoc -o reference.docx --print-default-data-file reference.docx` — a default sablon
2. `reference.docx` megnyitás Word-ben, stílusok módosítása (Heading 1, Heading 2, body-font)
3. `--reference-doc=reference.docx` a pandoc parancshoz

### 13.5 Alternatívák

| Eszköz | Előny | Hátrány |
|--------|-------|---------|
| **docx-js** (npm) | JS-natív, CI/CD-ben könnyű | Kódban írt formázás |
| **Microsoft Graph API** | Enterprise integráció | OAuth, macerás |
| **Manuális copy-paste** | 0 setup | 0 reprodukálhatóság |

### 13.6 Mikor generáljunk?

- **Most nem** — ez a döntés Endrénél
- **Bemutató előtt** (pl. EREK Elnökségi ülés) — 1 parancs, 5 másodperc

---

## 14. Ajánlásom Endrének

### 14.1 Rövid válasz

**Most**:
- Kész van ez a tervdokumentum
- Endre **elolvassa**, **átgondolja**
- Opcionálisan Word-be konvertálja
- Bemutatja az **EREK Elnökségének** (célzott szekciók: 1, 5, 11, 14)

**Döntési ülésen**:
- Két kérdés: **(a)** elindítsuk a V1-et? **(b)** Szükségük van V3-ra vagy V4-re?
- Ha (a) igen — V1 **3-4 héten belül** kész, mindegyiktől függetlenül
- Ha (b) igen — külön büdzsé + időterv + esetlegesen external dev keresés

### 14.2 Részletes ajánlás

1. **V1 mindenképp, ASAP (3-4 hét)**
   Függetlenül attól, hogy mi jön később. Ez a biztonsági alapvonal — kicsi kockázat, nagy nyereség. A jelenlegi lelkészek nem érzékelnek változást, csak az új userek mennek át az approval-on.

2. **V3 vagy V4 elnökségi döntésre vár**
   Nem a fejlesztő dönti el. Endre kérdezze meg: **"Tiszteli-e az egyházkerület a saját lelkészeit annyira, hogy 9-12 hónap + 30-55K EUR-t fektet be a GDPR-csúcsszint biztonságba?"** — ha igen, V4. Ha közepes, V3. Ha "egyelőre túl drága", V1-nél marad.

3. **Ha V3/V4 igen, Q3 2026 indulás**
   Ne siessük. 1-2 hónap M0-előkészítés, közben V1 kifut, hasznos tanulságokat szerzünk. Utána kezdődhet M1 (Tauri PoC).

4. **Soha**: ne induljon V3/V4 V1 nélkül
   A V1 **előfeltétel**. Ha az access-request + admin-approval nincs, hiába titkosítjuk a DB-t — a backend-en folyamatosan új userek jönnek létre.

### 14.3 Alternatív forgatókönyv: "semmi változás"

Ha a döntés "maradjunk ott, ahol vagyunk":
- A rendszer **működni fog**, a lelkészek használni fogják
- A GDPR-kockázat **megmarad** (ellopott laptop → plaintext DB)
- A nyílt regisztráció **megmarad** (bárki be tud lépni, ha ismeri a linket)
- **Hosszú távon** ez valószínűleg nem tartható — egyszer szembesülünk vele (audit, panasz, incident)

Ezért a **V1 minimum** ajánlott, akkor is, ha a nagyobb Tauri-döntés elhalasztott.

---

## 15. Zárókép — őszinte értékelés

A Tauri-ajánlás **szakmailag helyes**. A szakértő által leírt architektúra **jó**, a biztonsági szintje **magas**. **De nem sürgős.**

### 15.1 Mi működik most

- A jelenlegi Next.js PWA + Dexie + standalone **működik**
- A lelkészek **használják** — a visszajelzések pozitívak
- Az offline képesség **elég** a napi munkához

### 15.2 Mi hiányos

- **Biztonsági garanciák** — nincs DB-titkosítás, nincs admin-approval, nincs eszköz-bind
- **GDPR-compliance** — formálisan nem megfelel, ha egy audit jönne
- **Desktop app-élmény** — böngésző-tab, nem "igazi" app

### 15.3 A legdrágább rész — mit kerülünk el a C variánssal

A 72 Server Action átírása Edge Function-be **50-100 munkanap** (~20-40K EUR). Ezt a C variáns **elkerüli**, mert a Next.js változatlan marad. Ez **a legnagyobb tervezési nyereség**.

### 15.4 Végső ítélet

Ez **nagy vállalás**. Reálisan **12 hónap + 35-55K EUR** V4-re. **5-6 hónap + 15-25K EUR** V3-ra. **3-4 hét + 3-5K EUR** V1-re.

**A 3-4 hetes V1 mindenképp a következő lépés.** Ezután meg fog látszani, mennyi valódi igény van a nagyobb ugrásra.

---

## Függelék — Hivatkozások

### Külső erőforrások
- Tauri 2 dokumentáció: https://v2.tauri.app/
- SQLCipher: https://www.zetetic.net/sqlcipher/
- Stronghold (Tauri plugin): https://docs.rs/tauri-plugin-stronghold/
- Supabase: https://supabase.com/docs
- pandoc: https://pandoc.org/

### Belső dokumentumok
- `docs/project-tracking/KARTOTEKA-offline-diagnosztika-2026-04-21u.md` — jelenlegi állapot
- `docs/project-tracking/KARTOTEKA-pwa-offline-first-2026-04-15.md` — PWA user guide
- `docs/project-tracking/KARTOTEKA-pwa-testing-checklist-2026-04-15.md` — manual test
- `docs/project-tracking/KARTOTEKA-standalone-offline-terv-2026-04-15.md` — jelenlegi standalone
- `migration-docs/Database_schema.sql` — DB séma referencia

### Érintett kódfájlok (referencia)
- `lib/offline/db.ts`, `sync-orchestrator.ts`, `pull.ts`, `push.ts`
- `lib/standalone/sqlite-db.ts`, `license-*.ts`, `monthly-sync.ts`
- `components/offline/*` (16 komponens)
- `app/sw.ts`, `next.config.ts`
- `middleware.ts`, `lib/supabase/server.ts`, `lib/supabase/client.ts`

---

*Dokumentum készült: 2026-04-21u. Következő revízió: az EREK Elnökségi döntés után, amennyiben az új fázis indul.*
