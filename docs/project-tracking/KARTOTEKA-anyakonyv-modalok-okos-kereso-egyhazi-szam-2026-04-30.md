# Anyakönyvi modálok: okos kereső + automatikus egyházi szám

**Dátum:** 2026-04-30 (kilencedik / tizedik a napon)
**Állapot:** ✅ Befejezve — TS + ESLint clean
**Modul:** Anyakönyv (5 manuális rögzítő dialóg)

## Mit kért Endre

Két idézet a beszélgetésből, ezekből indultunk:

1. *"Az okos keresőket úgy tedd be, hogy minél látszódjon az életkor, a
   lakhely és utca is, hogy az azonos nevűekkel ne akadjunk össze."*
2. *"az egyházi anyakönyvi szám pedig automatikusan legyen kitöltött mező"*

A háttér: a 8 anyakönyvi fülön (Kereszteltek, Konfirmáltak, Házasultak,
Eltemetettek, Beköltözött, Elköltözött, Áttért, Kitért) látszó adatokat
a manuális rögzítő dialógokon keresztül is el kell tudni venni; eddig a
kereső csak a nevet mutatta (azonos nevű tagoknál bizonytalan), és az
egyházi anyakönyvi szám csak importnál generálódott automatikusan, kézi
rögzítésnél nem.

## Mit csináltunk

### 1. Új közös kereső komponens

**Fájl:** `apps/web/components/registry/member-search-select.tsx`

Egy reusable `<MemberSearchSelect>` komponens — az 5 dialóg mind ezt
használja most. Funkciói:

- 300 ms debounce-olt élő keresés a `searchMemberForRegistry` action-en
- Találatonként mutatja: **családnév + keresztnév**, **♂/♀**, **életkor**
  (a `sz_datum` év-részéből számolva), **születési dátum**, és — ha van
  — **lakhely + utca + házszám** (`adrlocality.name`, `adrstreet.name`,
  `c_szam`).
- Opcionális `genderFilter` (true=férfi, false=nő, null=mind) — esketés-
  dialógnál a vőlegény/menyasszony, keresztelésnél az apa/anya kereséshez.
- Trigger gomb is mutatja a kiválasztott személy életkorát + lakhelyét,
  hogy nyitott dialógnál is látsszon kit választottunk.
- Esc / outside click bezár, X-szel kiüríthető a választás.

### 2. Automatikus egyházi anyakönyvi szám

A `generate_egyhazi_anyakonyvi_szam(uuid, text, integer)` RPC már létezett
(2026-04-28 + 2026-04-29b migráció). Két helyen integráltuk:

- **Server-side (`actions.ts`):** új `getNextEgyhaziSzam(profileKey, year)`
  TypeScript wrapper. A 5 mentő action (`saveBaptism`,
  `saveConfirmationBatch`, `saveMarriage`, `saveBurial`, `saveMovement`)
  most az `egyhazi_szam` mezőt is feltölti — ha a kliens nem küldi, a
  server hívja az RPC-t a dátum-évvel és a megfelelő profile-kulcccsal.
- **Client-side (5 dialog):** új-rögzítéskor a useEffect betölti a
  következő szabad sorszámot az input mezőbe (előnézetként). A felhasználó
  felülírhatja, ha kell. Konfirmáció batch-nél a kezdősorszámot kérjük el
  egyszer, és a többi konfirmandus számát lokálisan inkrementáljuk
  (`YYYY02NNNN+1`, `YYYY02NNNN+2`, …) — így párhuzamos hívásnál nem
  ütközhetnek.

### 3. Új mezők, hogy a dialógok megegyezzenek a táblázatok oszlopaival

A táblázat-fülek már mutatják ezeket az adatokat — most a manuális rögzítés
során is rögzíthetők:

| Dialóg | Új mező |
|---|---|
| Esketés | `vegyes` (jelölőnégyzet — egyik fél nem református) |
| Temetés | `okirat` (állami halotti anyakönyvi szám, opcionális) |
| Elköltözés | `hova_congregation_id` (kereshető célgyülekezet — `CongregationSearchSelect`) |
| Mind az 5 | `egyhazi_szam` (automatikus, felülírható) |

Az elköltözés-dialógba ágyazott célgyülekezet-választó kiváltja a
`create_transfer_notification_on_elkoltozott` triggert, így a lelkész egy
kattintással elindítja az átjelentkezési workflow-t.

### 4. Endre szabálya: állami vs egyházi szám szét van választva

A 2026-04-29b migráció óta a `okirat` (és `hlevel`, `igazolas`) az ÁLLAMI
azonosítót tartalmazza, az új `egyhazi_szam` az EGYHÁZIT (`YYYYTTNNNN`).
A dialógokban most a violet-700 színű mező az egyházi szám, az opcionális
szürke mező az állami. A Zod sémákban az állami mező is opcionális lett —
nem minden új bejegyzés rendelkezik állami számmal.

## Érintett fájlok

- `apps/web/components/registry/member-search-select.tsx` (új)
- `apps/web/app/(dashboard)/anyakonyv/actions.ts` (`getNextEgyhaziSzam` +
  5 save action bővítés)
- `apps/web/lib/validations/registry.ts` (5 Zod séma)
- `apps/web/components/modals/baptism-dialog.tsx` (újraírva)
- `apps/web/components/modals/confirmation-dialog.tsx` (újraírva)
- `apps/web/components/modals/marriage-dialog.tsx` (újraírva)
- `apps/web/components/modals/burial-dialog.tsx` (újraírva)
- `apps/web/components/modals/movement-dialog.tsx` (újraírva)
- `docs/CHANGELOG.md` (`2026-04-30j` bejegyzés)

## Verifikáció

- `npx tsc --noEmit` ✅ clean
- `npx eslint <érintett fájlok>` ✅ clean (set-state-in-effect szabályt is
  átment — a baptism CNP derivációt elhagytuk, a confirmation picker-t
  callback alapú kezelésre cseréltük)

## Hátralevő (későbbre)

- A 2 Kelemen nővér (id 1162, 1163) NULL vallás + elkoltozott rekord
  manuális vizsgálatra vár — Endre szabálya szerint a nem-református
  tagokat nem anyakönyvezzük, viszont előbb el kell dönteni, hogy a
  vallás mező hibás-e (akkor javítani kell), vagy tényleg más felekezetűek
  voltak (akkor törölni kell az `elkoltozott` bejegyzést).
- Anyakönyvi import warning, ha az importálandó tag `vallas != református`
  — Endre 1. szabálya alapján külön commit-ban érdemes (more invasive,
  külön ellenőrzéssel).
- A desktop-Tauri csomagolás még nem tartalmazza ezeket a változásokat —
  következő release-nél `ops/release-build.ps1` futtatása kell (`feedback_auto_update_release.md`).
