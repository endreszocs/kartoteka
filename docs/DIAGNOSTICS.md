# KARTOTEKA — Diagnosztika és known issues

**Utolsó frissítés**: 2026-04-25

A Kartotéka rendszer állapota, ismert hibák és tervezett javítások.
A fájl a lelkészi / admin / fejlesztői nézetben is hasznos referenciaként.

---

## 🟢 Most működő dolgok

### Web (kartotekaweb-production.up.railway.app)

- ✅ Teljes admin-felület (felhasználók, szerepkörök, gyülekezetek, tagdíjak, broadcasts)
- ✅ Tagnyilvántartás (lista + szerkesztés + új tag + család)
- ✅ Pénzügyi modulok (bevétel, kiadás, chitanța, belső mozgás, Oblio, TVA)
- ✅ Anyakönyv (keresztelés, házasság, temetés)
- ✅ Munkanapló
- ✅ Leltár, jegyzőkönyvek, éves jelentés
- ✅ Publikus gyülekezeti oldalak (/gy/[slug])
- ✅ PWA telepíthető a böngészőből
- ✅ „Tiszta lap" admin-gomb a teszt-fázis végéhez
- ✅ `/offline` oldal desktop-letöltés gombbal

### Desktop (v0.4.0 GitHub Releases)

- ✅ Bejelentkezés + offline PIN + SQLCipher lokál DB
- ✅ Tagnyilvántartás teljes CRUD (offline-is)
- ✅ Család-nyilvántartás teljes CRUD (offline-is, gyerek-junction)
- ✅ Munkanapló teljes CRUD (offline-is)
- ✅ Pénzügy: chitanța, befizetés, kiadás, belső mozgás (offline-is)
- ✅ Pénzügyi dashboard + TVA-plafon figyelmeztetés
- ✅ Bank-import BCR E2E (CSV + match + auto-rögzítés)
- ✅ Background-sync (chitanta, befizetes, kiadas, szemely, csalad, gyerek)
- ✅ Konfliktus-feloldó dialogok a pending ütközésekhez
- ✅ Auto-update support (Tauri v2 updater, Ed25519-aláírt .sig)

---

## 🟡 Ismert hibák (prioritás szerint)

### P0 — Kritikus

**❌ Session-lejárat kezelés robusztusabbá tétele**
- Tünet: a képen látszik a sárga sáv „A munkamenet hamarosan lejár — csatlakozz a h…" — a toast-banner nem biztos, hogy teljesen látható
- Gond: a `SessionStatusIndicator` + a Supabase auto-refresh együttműködését újra kell nézni
- Javaslat: a session-refresh API-val (`supabase.auth.refreshSession()`) 5 perccel a lejárat előtt silently frissít, és ha az sikertelen, pasztorális banner jelenik meg
- **Érintett fájlok**: `apps/desktop/src/components/session-status-indicator.tsx`, `apps/desktop/src/lib/auth-gate.tsx`

### P1 — Magas

**✅ Pénzügyi bevétel/kiadás lista SQL hiba**
- Tünet: "column bankszamlak_1.nev does not exist"
- **Javítva** 2026-04-25: `packages/core/src/finance/befizetes/list.ts` + `kiadas/list.ts` — `bankszamlak.nev` → `bankszamlak.bank_neve`
- Commit: `34492695`

**✅ Tagnyilvántartás üres a desktop első indításakor**
- Tünet: "0 tag · offline-kompatibilis" még akkor is, ha a szerveren van adat
- **Javítva** 2026-04-25: `members-page.tsx` mount-kor `pullMembersOfOwnCongregation(userId, 'delta')` fut, csendesen hibázik offline-ban
- Commit: `34492695`

### P2 — Közepes

**⚠️ Desktop UI nem 100%-ban pixel-pontos a webhez képest**
- Tünet: a desktop members-page egyszerűbb megjelenítésű, mint a webes `tagnyilvantartas/persons-tab`
- Gond: a desktop saját React-komponenseket használ, nem a webes gazdagabbakat (perfil-kártya, részletesebb adatok, több fül)
- Javaslat: fokozatos közös-komponens migráció (`packages/ui`-ba `Presentational` komponenseket, a desktop + web ugyanazokat használja; a data-fetching külön marad)
- **Nagyszabású projekt** — hetes munka, folyamatosan közelítjük

**⚠️ `c_utcaid` FK továbbra is dummy `-1`**
- Tünet: az új szemely / csalad sorok `c_utcaid=-1` szerver-oldalon (FK violation-t nem dob, mert a constraint nincs ellenőrizve)
- Gond: a cím-hierarchia (utca-FK) nem normalizált; csak a szöveges `c_szcim` + `c_szam` + `c_tombhaz` stb. van kitöltve
- Javaslat: `adrstreet` lookup-komponens (AdresForm-szerű, a webben már létezik `apps/web/components/ui/address-form.tsx`), amely a user beírt város-utca alapján auto-complete-t ad, és az `id`-t menti

**⚠️ Sok `dynamic import` warning a Vite build-ben**
- Tünet: "tauri-sqlite-backend is dynamically imported by sync.ts but also statically imported by ..."
- Gond: a `sync.ts`-ben lévő `await import(...)` a circular-import elkerülésére szolgált, de redundáns
- Javaslat: refactor — vagy mind dinamikus, vagy mind statikus
- **Nem blokkoló**

**⚠️ Vite chunks > 500 KB figyelmeztetés**
- Tünet: a desktop bundle 1.57 MB JS egyetlen chunk-ban
- Gond: nincs code-splitting, az összes modul egy fájlba kerül
- Javaslat: `manualChunks` a `vite.config.ts`-ben (react, supabase, dexie külön chunk)
- **Nem blokkoló** — a desktop app nem internet-függő a JS-letöltéshez

### P3 — Alacsony

**ℹ️ NSIS telepítő magyar nyelvű kell legyen**
- Tünet: alapértelmezésben angol varázsló
- **Javítva** 2026-04-25: `tauri.conf.json` `nsis.languages: ["Hungarian"]` + header + sidebar BMP kép
- Bemutatkozó: a default magyar NSIS welcome-text elegendő, extra license-page nem kell
- Kép-generálás: `ops/nsis-images-setup.ps1`

**ℹ️ Telepítő-ikon**
- **Javítva** 2026-04-25: `tauri.conf.json` `nsis.installerIcon: "icons/icon.ico"` (már KARTOTEKA_V3-alapú)

---

## 🔴 Hátralévő nagy fejlesztési feladatok

### Desktop paritás (nagy)

| Modul | Web | Desktop | Megjegyzés |
|---|---|---|---|
| Bejelentkezés + PIN | ✅ | ✅ | Kész |
| Tagnyilvántartás | ✅ | ✅ | M8 teljes, de az UI egyszerűbb |
| Család-nyilvántartás | ✅ | ✅ | M8.3 teljes |
| Munkanapló | ✅ | ✅ | Kész |
| Pénzügy (chitanța, befizetés, kiadás, belső mozgás) | ✅ | ✅ | Kész |
| Pénzügyi dashboard + TVA | ✅ | ✅ | Kész |
| Bank-import BCR | ✅ | ✅ | Kész |
| **Bank-import Raiffeisen + BT** | 🟡 | ❌ | A-M7.10d — hátra |
| **Oblio e-Factura** | 🟡 | ❌ | Edge Fn — hátra |
| **Anyakönyv** (keresztelés, házasság, temetés) | ✅ | ❌ | Desktop paritás hátra |
| **Leltár** | ✅ | ❌ | Desktop paritás hátra |
| **Jegyzőkönyvek** (presbiteri, közgyűlési) | ✅ | ❌ | Desktop paritás hátra |
| **Éves jelentés** | ✅ | ❌ | Desktop paritás hátra |
| **Sírhelyek** | ✅ | ❌ | Desktop paritás hátra |
| **Iktató** | ✅ | ❌ | Desktop paritás hátra |
| **Gyülekezeti programok** | ✅ | ❌ | Desktop paritás hátra |
| **Missziós műhely** | ✅ | ❌ | Desktop paritás hátra |
| **Notifications + Profile + Kuka + Support** | ✅ | ❌ | Desktop paritás hátra |

### Infrastrukturális polish

- **`adrstreet` FK lookup** (cím-normalizálás)
- **Code-splitting** a desktop bundle-ben
- **Session-refresh robusztusítása**
- **100% UI paritás** — közös design-system migráció (hetes projekt)

---

## 📋 Javasolt következő sprint

### Rövid távú (1-2 nap)

1. **UI paritás első lépés** — a desktop `members-page`-et a webes `persons-tab` mintájára bővíteni (több oszlop, részletes tag-kártyák, több info)
2. **Session-refresh** robusztusítása
3. **Code-splitting** a vite.config.ts-ben

### Középtávú (1-2 hét)

4. **Anyakönyv desktop-paritás** — keresztelés, házasság, temetés Rust-migráció + write-offline + UI
5. **Leltár desktop-paritás** — hasonlóan
6. **Bank-import Raiffeisen + BT parser** (~1.5 óra)

### Hosszútávú (1-2 hónap)

7. **Jegyzőkönyvek, éves jelentés, sírhelyek, iktató, gyülekezeti programok** — mind desktop-paritás
8. **Oblio e-Factura** desktop Edge Fn + UI
9. **Teljes UI design-system migráció** — a `packages/ui` kibővítése minden common page-komponenssel, a webes + desktop azokat használja

---

## 💬 Hogyan jelents hibát

Ha futás közben hibába ütközöl:

1. **Leírd a szituációt** (melyik menü, milyen művelet)
2. **Képernyőkép** ha van
3. **Developer-console log** — a desktop-on a F12 megnyitja
4. Küldd el a `support@kartoteka.hu`-ra, vagy a webes admin „Támogatás" felületén

A `data_wipe_log` tábla audit-ja a drasztikus törlésekhez is megnéznható.
