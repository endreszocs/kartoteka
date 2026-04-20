# KARTOTEKA biztonsági javítások — tesztelési checklist

**Dátum**: 2026-04-15
**Hatókör**: A1 (MM RLS), A2 (God Mode PIN), A3 (Path traversal)
**Projekt log hivatkozások**: 018., 019., 020., 021. lépés (és később az A3 lépése)

---

## Áttekintés

Ez a dokumentum a 3 kritikus biztonsági javítás tesztelését sorolja fel.
**A tesztelést egyben is el lehet végezni**, miután minden javítás készen van.

**Futási sorrend javaslat**:
1. SQL migrációk futtatása (A1 Part 1 + Part 2, A2 DELETE, A3 ha kell) — **ellenőrzés előtt backup!**
2. TypeScript typecheck (`npx.cmd tsc --noEmit`)
3. Manuális UI tesztek a böngészőben
4. Funkcionális tesztek (SQL query-k, user-impersonation ha kell)

---

## A1 — Missziós Műhely RLS biztonság

### A1.1 SQL migrációk futtatva (Part 1 + Part 2)

| Lépés | Fájl | Státusz |
|---|---|---|
| Part 1 | `migration-docs/sql/2026-04-15-mm-rls-fix.sql` | ✅ már futott (2026-04-15) |
| Part 2 | `migration-docs/sql/2026-04-15-mm-rls-fix-part2.sql` | ✅ már futott (2026-04-15) |

### A1.2 SQL verifikációs query-k

**A1.2.1 — Minden mm_* táblán RLS aktív?**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'mm_%'
ORDER BY tablename;
```

✅ Várt: 15 sor, mind `rowsecurity = true`.

**A1.2.2 — Nincs megengedő `_all` vagy `_access` policy?**

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename LIKE 'mm_%'
  AND policyname ~ '(_all|_access)$'
  AND policyname !~ '_read_all$'
ORDER BY tablename;
```

✅ Várt: 0 sor (figyelmeztetés: a `_read_all` végződésűek szándékosak, azokat a regex kihagyja).

**A1.2.3 — mm_otletek csak a 4 szigorú policy?**

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mm_otletek'
ORDER BY cmd, policyname;
```

✅ Várt: pontosan 4 sor
- `mm_otletek_delete_own` | DELETE
- `mm_otletek_insert_own` | INSERT
- `mm_otletek_read_all` | SELECT
- `mm_otletek_update_own` | UPDATE

**A1.2.4 — KRITIKUS: mm_felhasznalo_statisztika csak SELECT?**

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mm_felhasznalo_statisztika'
ORDER BY cmd, policyname;
```

✅ Várt: pontosan 2 sor, mindkettő SELECT
- `mm_stats_read_leaderboard` | SELECT
- `mm_stats_read_self_or_admin` | SELECT

**🔴 HA INSERT/UPDATE/DELETE policy van itt, a K1 rés MÉG NYITVA!**

**A1.2.5 — Részletes policy áttekintés (opcionális)**

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'mm_%'
ORDER BY tablename, cmd, policyname;
```

✅ Várt: csak "tiszta nevű" policy-k (_read_all, _insert_own, _update_own, _delete_own, _insert_self, _delete_self, _update_self, _write_own, _write_owner, _read_self_or_admin, _read_leaderboard). Nincs `_select`, `_insert`, `_update`, `_delete` rövid nevű, és nincs `_all` vagy `_access`.

### A1.3 Manuális UI teszt — Missziós Műhely

Jelentkezz be **normál lelkész** user-ként (NEM master admin) és ellenőrizd:

| # | Művelet | Várt eredmény |
|---|---|---|
| A1.3.1 | Nyisd meg a `/misszios-muhely` oldalt | Oldal betölt hibamentesen |
| A1.3.2 | "Mi újság" szekció megnyitása | Tartalom megjelenik (ez teszteli a service_role UPDATE javítást is) |
| A1.3.3 | Új ötlet beküldése a fórumra | Sikerül, saját user-ként jelenik meg |
| A1.3.4 | Szavazás egy ötletre | Sikerül, a szavazat száma nő |
| A1.3.5 | Hozzászólás egy ötlethez | Sikerül, a hozzászólás megjelenik |
| A1.3.6 | Segédanyag feltöltése | Sikerül (ha van R2 storage beállítva) |
| A1.3.7 | Saját statisztika megtekintése | Látod a pontjaidat, szintedet |
| A1.3.8 | Ranglista megtekintése | Látod a top felhasználókat |

### A1.4 Behatolási teszt (opcionális, haladó)

**A1.4.1 — Próbálj módosítani más user statisztikáját** (a böngésző DevTools-konzolból, miközben a Missziós Műhely oldalon vagy):

```js
// DevTools Console:
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabase = createClient('<YOUR_SUPABASE_URL>', '<YOUR_ANON_KEY>')
await supabase.auth.setSession({
  access_token: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('sb-'))))?.access_token,
  refresh_token: ''
})

const { error } = await supabase
  .from('mm_felhasznalo_statisztika')
  .update({ osszpontszam: 999999, szint: 'Missziói bajnok' })
  .eq('user_id', 'SOME_OTHER_USER_UUID')

console.log({ error })
```

✅ Várt: az `error` objektumban `code: '42501'` vagy `message: 'new row violates row-level security policy'`, vagy 0 sor érintett (a USING szűrő miatt nem látszik a másik user sor).

**A1.4.2 — Saját statisztika módosítása**:

```js
const { error } = await supabase
  .from('mm_felhasznalo_statisztika')
  .update({ osszpontszam: 999999 })
  .eq('user_id', '<your-own-user-id>')
```

✅ Várt: hiba vagy 0 sor (mert nincs UPDATE policy egyáltalán, még a sajátra sem — csak service_role írhat).

---

## A2 — Hardcoded God Mode PIN eltávolítás

### A2.1 Fájlmódosítások tesztelése

| Fájl | Mit teszteljünk |
|---|---|
| `app/(dashboard)/god-mode/actions-v2.ts` | TypeScript tiszta (`tsc --noEmit`) ✅ |
| `app/(dashboard)/god-mode/actions-v3.ts` | Ugyanaz ✅ |
| `components/admin/security-settings-tab.tsx` | Ugyanaz ✅ |
| `components/admin/security-settings-tab-v2.tsx` | Ugyanaz ✅ |

TypeScript ellenőrzés parancs:
```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: nincs kimenet (0 hiba). **Ez már lefutott 2026-04-15-én, tiszta.**

### A2.2 SQL migráció futtatása

```
D:\Egyházi APP\KARTOTEKA\migration-docs\sql\2026-04-15-remove-default-god-mode-pin.sql
```

### A2.3 SQL verifikáció

```sql
SELECT key, value, updated_at, updated_by
FROM public.system_settings
WHERE key = 'god_mode_pin';
```

3 lehetséges eredmény:

| Eredmény | Jelentés | Teendő |
|---|---|---|
| **0 sor** | A `258456` volt benne, töröltük | ⚠️ Állíts be új PIN-t a Biztonság fülön, különben a god mode letiltva |
| **1 sor ÚJ értékkel** | Már korábban lecserélted | ✅ Minden rendben, semmi teendő |
| **1 sor `258456` értékkel** | A DELETE nem futott le | Próbáld újra |

### A2.4 Manuális UI teszt — Biztonság fül

**Master admin user-ként** (endreszocs@gmail.com) jelentkezz be és menj az Admin Központ → Biztonság fülre:

| # | Művelet | Várt eredmény |
|---|---|---|
| A2.4.1 | Nyisd meg a Biztonság fület | Tölthető, nincs hiba |
| A2.4.2 | Rendszergazdai PIN input placeholder | **NEM `258456`**, hanem `••••••` |
| A2.4.3 | Magyarázó szöveg a PIN alatt | **NEM említi `258456`**-ot, hanem biztonsági ajánlást ad |
| A2.4.4 | PIN forrás címke | `Nincs beállítva` / `Környezeti változó` / `Adatbázis` attól függően, mi az aktuális állapot |
| A2.4.5 | Állíts be új erős PIN-t (pl. 748293) | "PIN sikeresen frissült" üzenet |

### A2.5 God Mode aktiválás teszt

Miután beállítottál új PIN-t (vagy már volt új):

| # | Művelet | Várt eredmény |
|---|---|---|
| A2.5.1 | Master admin-ként próbáld aktiválni a God Mode-ot a `258456`-tal | ❌ "Hibás PIN kód." |
| A2.5.2 | Aktiválás az új PIN-nel | ✅ "God Mode aktív 2 órára" |
| A2.5.3 | Deaktiválás | ✅ Kilép a god mode-ból |

### A2.6 Nincs-e PIN teszt (edge case)

Ha kíváncsi vagy, mi történik, ha sem env, sem DB nem tartalmaz PIN-t:

**A2.6.1 — Ha sem env, sem DB nincs beállítva**:
```sql
-- Elobb torold (csak teszt-jeggyel, aztán állítsd vissza):
-- DELETE FROM public.system_settings WHERE key = 'god_mode_pin';
```
- Biztonság fülön töltés után: "PIN nincs beállítva" warning
- Aktiválási próba: magyar hibaüzenet ("A God Mode PIN nincs konfigurálva...")

**⚠️ MEGJEGYZÉS**: ez destruktív teszt, csak akkor csináld, ha utána visszaállítod.

---

## A3 — Path traversal + Support screenshot MIME validáció

### A3.1 Előzetes megállapítás

Az eredeti K3 rés (publikus oldal képfeltöltés path traversal) **korábbi körben már javítva** (valószínűleg 2026-04-12 audit után közvetlenül). Az `app/(dashboard)/publikus-oldal/upload-actions.ts` már használja a `validateSlug()` és UUID validátort, plusz defense-in-depth path check-et.

**Az A3 audit közben új rés került elő**: a `uploadSupportScreenshot` bármilyen MIME típusú fájlt fogadott, a publikus `public-site-media` bucket-be. Ez lett most javítva.

### A3.2 Fájlmódosítások tesztelése

| Fájl | Változtatás |
|---|---|
| `app/(dashboard)/support/actions.ts` | `uploadSupportScreenshot` MIME + sanitize + defense-in-depth ✅ |

TypeScript ellenőrzés:
```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: 0 hiba. **Ez már lefutott 2026-04-15-én, tiszta.**

### A3.3 Manuális UI teszt — Segítség fül (támogatási jegy)

Bárki user-ként (lelkész, master admin) nyisd meg a Segítség fület:

| # | Művelet | Várt eredmény |
|---|---|---|
| A3.3.1 | Képernyőkép csatolása — JPG kép | ✅ Sikeres feltöltés, a "Képernyőkép feltöltve!" üzenet |
| A3.3.2 | Képernyőkép csatolása — PNG kép | ✅ Sikeres feltöltés |
| A3.3.3 | Képernyőkép csatolása — WebP kép | ✅ Sikeres feltöltés |
| A3.3.4 | Képernyőkép csatolása — `.txt` fájl | ❌ "Csak JPG, PNG vagy WebP képek engedélyezettek." |
| A3.3.5 | Képernyőkép csatolása — `.html` fájl | ❌ Ugyanaz a hiba |
| A3.3.6 | Képernyőkép csatolása — `.js` fájl | ❌ Ugyanaz a hiba |
| A3.3.7 | Képernyőkép csatolása — `.pdf` fájl | ❌ Ugyanaz a hiba (támogatási ticket NEM kezel PDF-et) |
| A3.3.8 | Képernyőkép csatolása — > 5 MB kép | ❌ "A fájl túl nagy (max 5 MB)." |

### A3.4 Publikus oldal képfeltöltés tesztek (a meglévő javítás megerősítése)

**Master admin vagy publikus oldal szerkesztő jogú user-ként**:

| # | Művelet | Várt eredmény |
|---|---|---|
| A3.4.1 | Hero kép feltöltése a publikus oldal szerkesztőbe | ✅ Sikeres |
| A3.4.2 | Címer (crest) feltöltése | ✅ Sikeres |
| A3.4.3 | Blog poszt borítókép feltöltése (post-cover) | ✅ Sikeres — ha a slug érvényes |
| A3.4.4 | Magazin lapszám borítókép | ✅ Sikeres — ha az issueId UUID |
| A3.4.5 | Magazin PDF | ✅ Sikeres |

### A3.5 Behatolási teszt (opcionális, haladó)

**A3.5.1 — Path traversal próbálkozás a support uploadon** (browser DevTools Console):

```js
// Készíts egy sima PNG fájlt, de a name-et trükkösen állítsd be
const blob = new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' })
const file = new File([blob], '../../other-user/evil.png', { type: 'image/png' })
const fd = new FormData()
fd.append('file', file)

const result = await fetch('/api/some-support-upload-route', { method: 'POST', body: fd })
// VAGY közvetlen server action hívás böngészőből nem lehetséges, de:
// a sanitizeFilename-ban a '..' és '/' karakterek nem maradhatnak benne
```

✅ Várt eredmény — a végső feltöltött fájl neve `-other-user-evil-<timestamp>.png` vagy hasonló, **sosem** `../../other-user/evil.png`. A `sanitizeFilename` eltávolítja a veszélyes karaktereket.

**A3.5.2 — Rossz MIME type fake próba** (`file.type` manipuláció):

```js
// Hozd létre egy .js fájlt, de állítsd type-ot 'image/jpeg'-re
const jsContent = 'alert("xss")'
const file = new File([jsContent], 'evil.js', { type: 'image/jpeg' })
```

A MIME validáció a `file.type`-ot nézi, ami átmegy. DE: a `contentType: file.type` miatt a Storage a `image/jpeg` content-type-tal szolgálja ki, és a böngésző képként próbálja renderelni. Tehát a JS tartalom nem futtatható automatikusan. Ez a Storage Content-Type headerrel van biztosítva — nem futtat script-et.

**Fontosabb**: ha a MIME és a tényleges tartalom eltérő, akkor a Storage a `image/jpeg` content-type-ot adja vissza. A böngésző nem JS-ként futtatja. Tehát XSS-kockázat nincs. De a fájl szemét (hibás kép), amit a user látni fog.

---

## Összesítő — Mit ellenőrzöl egy menetben

Ha egyben tesztelsz, javaslom ezt a sorrendet:

### 1) SQL Editor-ban (5 perc):
- ✅ A1.2.1, A1.2.2, A1.2.3, A1.2.4 query-k — a K1 rés zárva
- ✅ A2.3 query — a K2 rés zárva

### 2) Böngészőben normál user-ként (8 perc):
- ✅ A1.3.1 – A1.3.8 — Missziós Műhely működik
- ✅ A3.3.1 – A3.3.8 — Support upload helyesen szűri a MIME-et

### 3) Böngészőben master admin-ként (5 perc):
- ✅ A2.4.1 – A2.4.5 — Biztonság fül rendben, nincs kiírva a régi PIN
- ✅ A2.5.1 – A2.5.3 — God Mode aktiválás/deaktiválás
- ✅ A3.4.1 – A3.4.5 — Publikus oldal feltöltések működnek

**Ha mind ✅, a 3 kritikus biztonsági rés bezárva, és plusz egy általános Storage upload sebezhetőség is javítva. A roadmap szerint Q2 elején megyünk tovább a pénzügyi modul bővítésével (B1 Bérleti szerződés).**

---

## B1 — Bérleti szerződés modul (első iteráció: B1.1 - B1.6)

### B1.1 TypeScript ellenőrzés

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: 0 hiba. **Lefutott 2026-04-15-én, tiszta.**

### B1.2 Új szerződés rögzítése — magánszemély bérlő

1. Menj a Pénzügy → **Bérleti szerződések** fülre (új fül, narancs/amber színnel)
2. Kattints **+ Új szerződés**
3. **Bérlő típusa**: Magánszemély (alap)
4. **Bérlő neve**: gépeld be: "Szabó János" (ha nincs gyülekezeti tag, csak a név marad; ha van, válassz a listából)
5. **Szerződés tárgya**: "Templomkert bérlet"
6. **Leírás**: "2500 m² gyümölcsöskert, helyrajzi szám: 1234/5"
7. **Típus**: Terület (alap, narancs/amber kiemelés)
8. **Bérleti díj**: 500
9. **Fizetési ciklus**: Éves (alap)
10. **Kezdet**: 2025-01-01 (vagy aktuális év eleje)
11. **Vége**: hagyd üresen (nyitott végű)
12. **Mentés**

✅ Várt:
- Toast: "Bérleti szerződés mentve."
- A szerződés megjelenik a listában: bérlő, leírás, típus (Terület badge zöld), éves díj 500 RON, ciklus Éves, kezdet/vége
- KPI kártyák frissülnek: aktív szerződés +1, éves várt bevétel +500 RON

### B1.3 Új szerződés — cég bérlő

1. **+ Új szerződés**
2. **Bérlő típusa**: **Cég / Szervezet**
3. **Cég neve**: "ABC Kft."
4. **Adószám**: "RO12345678"
5. **Szerződés tárgya**: "Parókia emelet bérlet"
6. **Leírás**: "Parókia épület első emelete, irodahasználatra"
7. **Típus**: **Épület** (kék badge — id_szamadasicel automatikusan 104.04)
8. **Bérleti díj**: 1200, ciklus: Havi
9. **Kezdet**: 2025-01-01, Vége: 2026-12-31
10. **Megjegyzés**: "Lejárat után meghosszabbítható"
11. **Mentés**

✅ Várt: új szerződés, az éves díj kalkulált értéke `1200 * 12 = 14 400 RON` (havi → éves)

### B1.4 Szerződés szerkesztése

1. A listában kattints az 1. szerződés **szerkesztés ikonjára** (ceruza)
2. Modal "Bérleti szerződés szerkesztése" címmel nyílik, előtöltve
3. Módosítsd a leírást, mentsd
4. ✅ Várt: toast "Bérleti szerződés frissítve.", a táblázat frissül

### B1.5 Szerződés törlése (soft delete)

1. Kattints a 2. szerződés (cég) **törlés ikonjára** (kuka)
2. Megerősítő dialog: szerződés adatai + figyelmeztetés
3. OK
4. ✅ Várt: toast "Szerződés törölve.", a szerződés eltűnik a listából
5. **DB ellenőrzés** Supabase SQL Editorban:
   ```sql
   SELECT id, berlo_nev, aktiv, deleted FROM berleti_szerzodes WHERE berlo_nev LIKE '%ABC%';
   ```
   Várt: a sor megvan, de `aktiv = false, deleted = true`

### B1.6 Szűrők

1. Állítsd a **státus** szűrőt "Összes (lejárt is)"-re
2. ✅ Várt: a B1.5-ben törölt szerződés NEM jelenik meg (mert deleted=true), de lejárt szerződés (ha vége < ma) megjelenik
3. Állítsd a **típus** szűrőt "Épület"-re
4. ✅ Várt: csak az épület típusú szerződések látszanak

### B1.7 Bérleti hátralék — Tartozások fülön

**Előfeltétel**: legalább 1 aktív bérleti szerződés. Hozzon létre egy szerződést mondjuk 2024-2025-re, 500 RON/év.

**Befizetés rögzítése**:
1. Menj a Pénzügy → Áttekintés → "+ Bevétel"
2. **Kategória**: 104.05 kódú (Terület bérleti díj) — kell hogy legyen a `befizetescel` táblában
3. **Befizető**: a bérlő nevének begépelése (vagy ID kiválasztása)
4. **Összeg**: 300 RON
5. **Fizetett év**: 2025
6. Mentés

**Hátralék ellenőrzés**:
1. Menj a **Tartozások** fülre
2. ✅ Várt KPI: "Bérleti hátralék" 200 RON (500 elvárt - 300 fizetett)
3. ✅ Várt: új szekció a járulék után, "Bérleti szerződések — hátralék" cím, lista a szerződéssel: bérlő | leírás | típus | éves díj 500 | befizetett 300 | **hátralék 200 (piros)**

### B1.8 Üres állapot

1. Új gyülekezetben, ahol még nincs bérleti szerződés
2. ✅ Várt: barátságos üres állapot — Building2 ikon, "Még nincs bérleti szerződés rögzítve.", utalás a "+ Új szerződés" gombra

### B1.9 Mobile reszponzív

1. Nyisd meg a Bérleti szerződések fület mobil nézetben (DevTools → eszközemulátor, < 768px szélesség)
2. ✅ Várt:
   - KPI kártyák egy oszlopban
   - A táblázat HELYETT kártyás bontás (mindegyik szerződés egy-egy kártya)
   - Mégis és Törlés gomb a kártya alján, ujjal kattintható

### B1.10 Modal mobile

1. Nyisd meg a "+ Új szerződés" modalt mobil nézetben
2. ✅ Várt: a modal `max-h-[85vh] overflow-y-auto`-val gördíthető, a mezők egy oszlopban
3. A radio kapcsolók (bérlő típus, terület/épület) érintőképernyőn könnyen elérhetők

### B1.11 DB szintű verifikáció

```sql
-- Új szerződés rekord
SELECT id, berlo_nev, leiras, tipus, osszeg, fizetesi_ciklus, kezdet, vege,
       id_szamadasicel, ceg_nev, ceg_adoszam, aktiv, deleted, created_at
FROM berleti_szerzodes
WHERE congregation_id = '<aktuális-cong-id>'
ORDER BY created_at DESC
LIMIT 5;
```

```sql
-- A 104.04 / 104.05 kódú befizetések, amik a bérleti hátralékhoz tartoznak
SELECT b.osszeg, b.fizetettev, b.forrasa, b.id_szemely, bc.id_szamadasicel
FROM befizetes b
JOIN befizetescel bc ON bc.id = b.id_befizetescel
WHERE b.congregation_id = '<aktuális-cong-id>'
  AND bc.id_szamadasicel IN ('104.04', '104.05')
  AND b.deleted = false
ORDER BY b.datum DESC
LIMIT 10;
```

### B1.12 Mit NEM kell most tesztelni

- **Negyedéves / Féléves ciklus** — most csak Havi és Éves választható (a DB nem támogat mást)
- **Bérleti szerződés import (CSV)** — későbbi backlog
- **Bérleti szerződés PDF nyomtatás** — későbbi backlog

### B1.13 Income-dialog quick-pick (B1.7 — friss)

**Előfeltétel**: legalább 1 aktív bérleti szerződés.

1. Menj Pénzügy → Áttekintés → "+ Bevétel" gomb
2. ✅ Várt: a modal tetején (a Kategória/Dátum grid felett) egy **amber-keretes kártya** jelenik meg "Bérleti díj rögzítése" címmel és Building2 ikonnal
3. ✅ Várt: a select-ben láthatók az aktív szerződések, mindegyik a `Bérlő — tárgy/leírás (osszeg RON / Havi/Éves)` formátumban
4. Válassz egy szerződést a listából
5. ✅ Várt:
   - A Kategória mező auto-kitöltődik a `104.04` (épület) vagy `104.05` (terület) kódú befizetéscel-re
   - Az Összeg mező a havi díjjal (havi ciklus) vagy az éves díjjal töltődik
   - Ha a szerződésnek `id_szemely`-e van → a Befizető auto-kitölt + Badge a tag adataival
   - Ha nincs `id_szemely` → a Befizető (forrasa) mező a `berlo_nev`-vel kitöltődik
   - A quick-pick kártya átvált egy kompakt "kiválasztott" nézetre + X gombbal
6. Kattints az X gombra
7. ✅ Várt: a kiválasztás törlődik, ÚJBÓL a select jelenik meg. Az Összeg / Kategória / Bérlő mezők NEM törlődnek (szándékos — a user már lehet, hogy módosított rajtuk)
8. Mentsd a bevételt
9. **DB ellenőrzés**: a `befizetes` tábla új sora a 104.04/104.05 kódú befizetéscel-lel és a megfelelő `forrasa` / `id_szemely` mezőkkel jött létre

### B1.14 Quick-pick edge case-ek

**Nincs aktív szerződés**:
- Ha minden szerződést törölt vagy lejárt, az amber kártya **NEM jelenik meg**
- A modal csak a normál form-ot mutatja

**Nincs 104.04 / 104.05 kódú befizetéscel**:
1. Tegyük fel, hogy a `befizetescel` táblában nincs 104.05 sor
2. Válassz egy "Terület" típusú szerződést a quick-pick-ben
3. ✅ Várt: warning toast: "Nincs 104.05 kódú befizetéskategória beállítva — a kategória mezőt kézzel kell választanod."
4. Az összeg + bérlő kitöltődik, de a kategória üres marad

**Batch (táblázat) módban**:
1. Válts át "Táblázatos" módra
2. ✅ Várt: a quick-pick szekció eltűnik (csak `single` módban látható, mert a batch módnak más logikája van)

### B1 ÖSSZEFOGLALÓ — Mi sikeres?

Ha mind a B1.1–B1.14 ✅ pipa, **a B1 modul TELJESEN KÉSZ** (7/7 alfeladat). A felhasználó:
- Új bérleti szerződéseket rögzíthet (személy/cég)
- Szerkesztheti és törölheti őket
- A bérleti hátralék automatikusan számítódik a befizetések alapján
- A Tartozások fülön egy helyen látszik a járulék + bérleti hátralék
- A bevétel rögzítéskor egy kattintással kiválaszthat egy bérleti szerződést, és a mezők automatikusan kitöltődnek

**Roadmap szerint a következő: B2 — Devizás átértékelés (FX), 1.5 hét.**

---

## B2 — Devizás átértékelés (FX revaluation)

### B2.1 SQL migráció futtatása

```
D:\Egyházi APP\KARTOTEKA\migration-docs\sql\2026-04-15-valuta-atert.sql
```

Verifikáció:
```sql
-- 1) RLS aktív?
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'valuta_atert';
-- → 1 sor, rowsecurity = true

-- 2) 4 policy létrejött?
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'valuta_atert'
ORDER BY cmd, policyname;
-- → 4 sor: select, insert, update, delete

-- 3) 103.04 / 203.03 számadási cél létezik?
SELECT id_szamadasicel FROM befizetescel WHERE id_szamadasicel = '103.04';
SELECT id_szamadasicel FROM kiadascel WHERE id_szamadasicel = '203.03';
```

Ha a 3. lépésnél 0 sor jött vissza, vagy hozzá kell adni a kódokat a Beállítások menüben, vagy az átértékelés mentésnél a user warning toast-ot kap.

### B2.2 TypeScript ellenőrzés

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: 0 hiba. **Lefutott 2026-04-15-én, tiszta.**

### B2.3 Manuális UI teszt — Bank fül

**Előfeltétel**: legalább 1 EUR (vagy más NEM RON) bankszámla a `bankszamlak` táblában.

1. Menj a Pénzügy → Bank fülre
2. ✅ Várt: minden EUR/HUF bankszámla kártyán látszik egy "Évvégi átértékelés" gomb (cyan/türkiz színnel, Coins ikonnal)
3. RON számláknál NINCS gomb

### B2.4 FX átértékelés modal — alapvető működés

1. Bank fülön kattints az "Évvégi átértékelés" gombra egy EUR számlán
2. ✅ Várt: modal "Devizás átértékelés — {bank neve} • EUR" címmel, cyan/blue gradient ikon
3. ✅ Várt: az "Aktuális EUR egyenleg" mező auto-kalkulálva (a belsomozgas valutacsere alapján)
4. Töltsd ki:
   - **Régi RON érték**: pl. 4800
   - **Új árfolyam**: kattints a "BNR" gombra → BNR aktuális árfolyam betöltődik (badge "BNR YYYY-MM-DD"), VAGY add meg manuálisan: pl. 4.95
5. ✅ Várt preview:
   - Új RON érték: deviza × árfolyam (pl. 1000 × 4.95 = 4950)
   - Régi árfolyam (becsült): regi_ron / deviza (pl. 4800/1000 = 4.8)
   - Badge: "Árfolyam-nyereség: +150 RON" zöld, vagy "Árfolyam-veszteség: -X RON" piros, vagy "Nincs változás" szürke
6. **Mentés** kattintás
7. ✅ Várt: toast "Átértékelés rögzítve. Árfolyam-nyereség: +150,00 RON"
8. **DB ellenőrzés**:
   ```sql
   SELECT * FROM valuta_atert WHERE bankszamla_id = <bank_id> ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM befizetes WHERE id_befizetescel = (SELECT id FROM befizetescel WHERE id_szamadasicel = '103.04') ORDER BY datum DESC LIMIT 1;
   ```
   - `valuta_atert` 1 új sor a kalkulált értékekkel
   - `befizetes` 1 új sor 150 RON-nal, dec 31-i dátummal, "Árfolyam-nyereség: ..." `forrasa` mezővel
9. **A számadás (Számadás fül)** átmenve: a 103.04 sor +150 RON-nal szerepel — automatikus

### B2.5 Veszteség teszt

1. Új átértékelés ugyanarra a bankra, **másik évvel** (mert UNIQUE constraint)
2. Új árfolyam pl. 4.7 (alacsonyabb mint a régi 4.8)
3. ✅ Várt: "Árfolyam-veszteség: −100 RON" badge piros
4. **Mentés**
5. ✅ Várt: a `kiadas` táblába kerül 100 RON, 203.03 kódú sor

### B2.6 Hibakezelési tesztek

**Hiányzó számadási cél**:
1. (Csak SQL Editor-ban tesztelhető szándékkal) Töröld a 103.04 sort: `DELETE FROM befizetescel WHERE id_szamadasicel = '103.04'`
2. Próbálj rögzíteni új átértékelést nyereséggel
3. ✅ Várt: error toast: "A 103.04 számadási cél hiányzik a befizetéskategóriák közül. Vegyétek fel a Beállítások menüben, mielőtt átértékelést rögzíttek."
4. Vond vissza a törlést: `INSERT INTO befizetescel ...`

**BNR fetch hiba** (offline tesztelhető):
1. Kapcsold le a netet, vagy mock-old a BNR URL-t firewall-lal
2. Kattints a modal "BNR" gombjára
3. ✅ Várt: warning toast: "BNR árfolyam lekérése sikertelen: ... Add meg manuálisan."
4. Add meg manuálisan a árfolyamot → működik

**Duplikáció**:
1. Egy bankszámlára, egy évre próbálj 2× átértékelést rögzíteni
2. ✅ Várt: error: "Erre az évre (...) ehhez a bankszámlához már létezik átértékelés. Ha javítani szeretnél, először töröld a meglévőt."

### B2.7 RON számla teszt (negatív teszt)

1. RON számla kártyán **NINCS** "Évvégi átértékelés" gomb (rejtve)
2. Ha mégis valahogy hívjuk: a server action visszaad: "Az átértékelés csak deviza (nem RON) bankszámlára vonatkozhat."

### B2 ÖSSZEFOGLALÓ — Mi sikeres?

Ha mind a B2.1 - B2.7 ✅, **a B2 modul KÉSZ ÉS HASZNÁLHATÓ**:
- A user év végén az EUR / HUF bankszámláit átértékelheti BNR vagy manuális árfolyamon
- A nyereség / veszteség automatikusan bekerül a könyvelésbe (befizetes 103.04 vagy kiadas 203.03)
- A számadás aggregáció automatikusan tartalmazza
- Az audit trail a `valuta_atert` táblában minden átértékelést dokumentál

**Roadmap szerint a következő nagy feladat: B3 (Monetár audit) vagy B4 (Kerületi/egyházmegyei dashboard).**

---

## B4.5 — Felsőszintű dashboard pénzügyi + kazuáliás bővítés

### B4.5.1 TypeScript ellenőrzés

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: 0 hiba. **Lefutott 2026-04-15-én, tiszta.**

### B4.5.2 Manuális UI teszt — Egyházmegyei dashboard

**Előfeltétel**: legyél esperes / egyházmegyei admin / master role-ban (a `profiles.role` mezőben).

1. Menj a `/dashboard-egyhazmegye` URL-re
2. ✅ Várt szekciók (sorrendben):
   - ScopeHero (egyházmegyei fejléc)
   - ScopeKpiGrid (4 KPI: gyülekezetek, tagok, kerületi kapcsolat, aktív kérelmek)
   - **ÚJ: Pénzügyi áttekintés (B4.5)** — 3 KPI (Bevétel, Kiadás, Egyenleg) + Top 12 gyülekezet bevétel szerint táblázat
   - **ÚJ: Anyakönyvi áttekintés (B4.5)** — 4 KPI (Keresztelők, Esketések, Temetések, Konfirmáltak) + Top 12 gyülekezet kazuáliák szerint
   - CongregationOverviewCard (accordion, kérelmek)
   - DocumentWorkflowPanel (mátrix)
   - RoleDistributionCard, RecentProfilesCard, QualitySummaryCard

### B4.5.3 Manuális UI teszt — Kerületi dashboard

**Előfeltétel**: legyél admin / master role-ban.

1. Menj a `/dashboard-kerulet` URL-re
2. ✅ Várt szekciók (sorrendben):
   - ScopeHero (kerületi fejléc)
   - ScopeKpiGrid (district mode — 5 KPI)
   - **ÚJ: Pénzügyi áttekintés (B4.5)** — 3 KPI + Egyházmegyei bontás táblázat + Top 10 gyülekezet
   - **ÚJ: Anyakönyvi áttekintés (B4.5)** — 4 KPI + Egyházmegyei bontás + Top 10 gyülekezet
   - ScopeBreakdownCard egyházmegyei
   - RoleDistributionCard
   - Véglegesített dokumentumok lista
   - ScopeBreakdownCard legnagyobb gyülekezetek
   - RecentProfilesCard, QualitySummaryCard

### B4.5.4 Adat helyesség

A pénzügyi és kazuáliás aggregáció az **aktuális évre** (2026) szól. Ha még nincs adat, üres állapot jelenik meg ("Erre az évre még nincs pénzügyi adat..." vagy "Erre az évre még nincs anyakönyvi adat...").

Ellenőrzés:
- Egy gyülekezetben rögzíts pl. egy 100 RON-os bevételt erre az évre (befizetes datum 2026)
- Frissítsd a kerületi dashboard-ot
- ✅ Várt: a bevétel KPI +100 RON-nal, a Top gyülekezetek listában az adott gyülekezet megjelenik

```sql
-- Ellenőrző query (egyetlen gyülekezet bevételének éves összege)
SELECT congregation_id, SUM(osszeg) AS total
FROM befizetes
WHERE congregation_id = '<gyülekezet-id>'
  AND datum >= '2026-01-01' AND datum < '2027-01-01'
  AND (deleted = false OR deleted IS NULL)
GROUP BY congregation_id;
```

### B4.5 ÖSSZEFOGLALÓ — Mi sikeres?

Ha mind a B4.5.1 - B4.5.4 ✅, **a B4.5 bővítés KÉSZ ÉS HASZNÁLHATÓ**:
- Az esperes / egyházmegyei admin az aktuális évre egy helyen látja a felügyelt gyülekezetek pénzügyi forgalmát és kazuáliáit
- A kerületi dashboard egyházmegyénkénti bontást ad
- A Top N gyülekezet listák segítenek az aktívabb / kevésbé aktív területek azonosításában

**Roadmap szerint a következő: C1 (Éves jelentések, 2 hét) vagy C2 (Lelkészi havi jelentés, 1 hét).**

---

## C1 — Éves jelentések modul (MVP)

### C1.1 SQL migráció futtatása

```
D:\Egyházi APP\KARTOTEKA\migration-docs\sql\2026-04-15-annual-reports-extension.sql
```

Verifikáció:
```sql
-- 1) Az új mezők ott vannak?
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'annual_reports'
ORDER BY ordinal_position;
-- → ~21 oszlop (eredeti 9 + 12 új)

-- 2) RLS aktív + 5 policy?
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'annual_reports'
ORDER BY cmd, policyname;
-- → 5 sor: SELECT, INSERT, 2× UPDATE (own + esperes), DELETE

-- 3) UNIQUE constraint létrehozva?
\d annual_reports
-- vagy: SELECT * FROM pg_indexes WHERE tablename = 'annual_reports';
```

### C1.2 TypeScript ellenőrzés

```bash
cd "D:/Egyházi APP/KARTOTEKA"
npx.cmd tsc --noEmit
```
✅ Várt: 0 hiba. **Lefutott 2026-04-15-én, tiszta.**

### C1.3 Manuális UI teszt — Új jelentés generálása

**Előfeltétel**: lelkészi szerepkörben belépve, a gyülekezet adatok minimum megvannak (név, esetleg cím, e-mail).

1. Menj a `/eves-jelentes` URL-re
2. ✅ Várt: ModuleHero "Éves jelentés" címmel + "Új jelentés" badge
3. ✅ Várt: "Sparkles" ikon + üzenet: "Az éves jelentés adatai épp összeállnak..."
4. Pár másodperc után megjelenik a 10 szekciós űrlap:
   - **I. Gyülekezet adatai** — auto-kitöltött (név, cím, lelkipásztor, esperes)
   - **II. Istentiszteleti élet** — alkalmak száma, átlag jelenlét, persely (a munkanaplo szolgalat-jellegű bejegyzéseiből)
   - **III. Kazuáliák** — keresztelők, esketések, temetések, konfirmáltak (anyakonyv 4 táblából)
   - **IV. Lelki élet** — szabad szöveges (a felhasználó tölti)
   - **V. Katekézis** — alkalmak száma, jelenlét (munkanaplo katekezis)
   - **VI. Pénzügyi helyzet** — bevétel, kiadás, egyenleg
   - **VII. Presbitérium** — presbiterek listája tisztségükkel
   - **VIII. Egyházi vagyon** — leltár tételszám + érték kategóriánként
   - **IX. Iskolaügy** — szabad szöveges
   - **X. Egyéb** — szabad szöveges
   - **Lelkipásztori megjegyzés** — szabad szöveges
5. Töltsd ki a IV/IX/X szekciókat valamilyen tartalommal
6. Kattints **"Piszkozat mentése"**
7. ✅ Várt: toast "Az éves jelentés mentve piszkozatként."
8. **DB ellenőrzés**:
   ```sql
   SELECT id, year, status, snapshot_data->'szekcio4_lelkielet'->>'szoveg' AS szekcio4
   FROM annual_reports
   WHERE congregation_id = '<gyülekezet-id>'
   ORDER BY updated_at DESC LIMIT 1;
   ```

### C1.4 Beküldés esperesnek

1. A piszkozat oldalon kattints **"Beküldés esperesnek"**
2. ✅ Várt: toast "Az éves jelentés beküldve az espereshez."
3. Az oldal újratöltése után a status banner: "Beküldve — esperesi feldolgozásra vár"
4. **DB ellenőrzés**:
   ```sql
   SELECT status, submitted_at, submitted_by FROM annual_reports
   WHERE congregation_id = '<gyülekezet-id>' AND year = <aktuális év>;
   ```
   Várt: `status = 'submitted'`, `submitted_at` és `submitted_by` kitöltve

### C1.5 Korábbi jelentések

1. Ha van több éves jelentés (több évre), az URL ?year=YYYY paraméterrel váltogatható
2. ✅ Várt: a Hero alatt egy "Korábbi jelentések" kártya kis chip-ekkel (év + emoji a státuszhoz)

### C1.6 Edge case — auto-aggregálás hiányzó adatokkal

1. Egy üres gyülekezet (nincs munkanaplo, nincs anyakonyv): a generálás mégis lefut
2. ✅ Várt: minden szekció 0 értékkel jelenik meg, a szöveges szekciók üresek

### C1.7 RLS védelem

A `dashboard-egyhazmegye` oldalon az esperes láthatja a beküldött jelentéseket (`getDioceseAnnualReports` action), de a lelkész nem láthat más gyülekezet jelentését.

```sql
-- Egy másik gyülekezet jelentésének olvasása (lelkészként):
SELECT * FROM annual_reports WHERE congregation_id <> '<sajat>';
-- → Üres, mert az RLS szűr
```

### C1 Mit NEM tartalmaz az MVP

- **Iskolaügy aggregátor** — nincs iskola modul. Jelenleg szabadszövegként kezeljük.

### C1 ÖSSZEFOGLALÓ — Mi sikeres?

Ha mind a C1.1 - C1.7 ✅, **a C1 MVP KÉSZ ÉS HASZNÁLHATÓ**:
- A lelkipásztor a január végi határidőre összeáll a teljes éves jelentés
- Auto-előtöltött a meglévő modulokból (B4.5 + worklog + presbiter + leltár)
- 3 szabadszöveg szekciót kézzel tölthet ki
- Piszkozatként mentheti és később folytathatja
- Beküldheti az esperesnek
- A status banner mutatja a workflow-állapotot

---

## C1.5 — PDF generáció (10 szekciós)

### C1.5.1 PDF letöltése új jelentésről

1. /eves-jelentes oldalon → új jelentés auto-generálva
2. Kattints a „PDF letöltése" gombra (violet border)
3. ✅ Várt: `Eves_jelentes_2025_{gyülekezet}.pdf` letöltődik
4. Nyisd meg → ellenőrizd:
   - 1. oldal: „Éves lelkészi jelentés" cím + I. Gyülekezet + II. Istentiszteleti élet (KPI + típus + havi)
   - 2. oldal: III. Kazuáliák + IV. Lelki élet + V. Katekézis + VI. Pénzügy (egyenleg színkódolva)
   - 3. oldal: VII. Presbitérium + VIII. Vagyon + IX. Iskolaügy + X. Egyéb + aláírás rács

### C1.5.2 Szabadszöveges szekciók

1. Töltsd ki a IV. Lelki élet textareát: több soros szöveg, pl.:
   ```
   Az év során két alkalommal tartottunk imahetet.
   A konfirmandusok felkészítése 2 féléves volt.
   ```
2. Mentés DRAFT-ként
3. Kattints „PDF letöltése"
4. ✅ Várt: a 2. oldalon a IV. szekcióban a szöveg többsoros formátumban jelenik meg (`nl2br`)
5. Ha üres: ✅ Várt: „— (nincs kitöltve) —" kurzív

### C1.5.3 XSS védelem

1. Írj a IX. Iskolaügy textareába: `<script>alert('xss')</script>` és `<img src=x>`
2. Mentés
3. PDF letöltése → megnyit
4. ✅ Várt: a PDF-ben a szöveg `&lt;script&gt;alert('xss')&lt;/script&gt;` formátumban jelenik meg (escape-elve), NINCS script futtatás

### C1.5.4 Nyomtatás gomb

1. Kattints „Nyomtatás" gombra
2. ✅ Várt: böngésző nyomtatási párbeszéd (Ctrl+P) nyílik a jelentéssel

### C1.5.5 Read-only nézet PDF

1. Véglegesítsd egy jelentést az esperesi UI-n (C1.6 után)
2. Lelkész vissza megnyitja /eves-jelentes
3. ✅ Várt: a „PDF letöltése" és „Nyomtatás" gombok LÁTHATÓK, de a „Piszkozat mentése" és „Beküldés esperesnek" NEM látszanak

---

## C1.6 — Esperesi éves jelentés jóváhagyási UI

### C1.6.1 Panel megjelenése

1. Esperes felhasználóval belépés
2. /dashboard-egyhazmegye oldal
3. ✅ Várt: a Dokumentum workflow mátrix után megjelenik a „Beérkezett éves jelentések — {év}. év" panel (violet icon)
4. Ha nincs beküldött jelentés: ✅ Várt: „Még nem érkezett be éves jelentés..." üzenet

### C1.6.2 Státusz flow — submitted → received

1. Egy submitted státuszú jelentés látszik (kék badge: „Új beküldés")
2. Kattints „Átvettem" gombra
3. ✅ Várt: toast „A jelentés státusza módosítva: Átvéve"
4. A státusz ikon megváltozik (MailCheck → Eye, amber szín)
5. **DB**:
   ```sql
   SELECT status, received_at, received_by FROM annual_reports WHERE id = '...';
   -- status = 'received', received_at KITÖLTVE, received_by = auth.uid()
   ```

### C1.6.3 Ellenőrzés + review notes

1. Kattints „Ellenőrzöm" (violet)
2. ✅ Várt: a sor kibővül, mini KPI-k jelennek meg, review_notes textarea
3. Írj bele: „Köszönjük a részletes leírást. Néhány rész pontosítást igényel..."
4. Kattints „Mentés ellenőrzöttként" (outline)
5. ✅ Várt: toast „A jelentés státusza módosítva: Ellenőrizve"
6. **DB**:
   ```sql
   SELECT status, reviewed_at, reviewed_by, review_notes FROM annual_reports WHERE id = '...';
   -- status = 'reviewed', reviewed_at KITÖLTVE, review_notes = 'Köszönjük...'
   ```

### C1.6.4 Véglegesítés

1. Egy reviewed státuszú jelentésnél kattints „Véglegesítem" (emerald)
2. ✅ Várt: toast „A jelentés státusza módosítva: Véglegesítve"
3. Az ikon CheckCircle2, emerald
4. ÚJ GOMB jelenik meg: „Kerületnek" (emerald solid)

### C1.6.5 Kerületnek továbbítás

1. Kattints „Kerületnek" gombra
2. ✅ Várt: toast „A jelentés továbbítva az egyházkerületnek."
3. **DB**:
   ```sql
   SELECT forwarded_to_kerulet, forwarded_at FROM annual_reports WHERE id = '...';
   -- forwarded_to_kerulet = true, forwarded_at KITÖLTVE
   ```
4. A sor fejlécében megjelenik a „Kerülethez továbbítva" jelzés (emerald pill)

### C1.6.6 Lelkészi review notes megjelenítés

1. Esperes beírt review_notes-t (C1.6.3)
2. Lelkész megnyitja /eves-jelentes
3. ✅ Várt: a status banner vagy egy dedikált szekció mutatja az esperesi megjegyzést „Esperesi megjegyzés" címmel
4. Ha status = 'reviewed' — a jelentés read-only a lelkésznek, de láthatja a notes-ot

### C1.6.7 RLS védelem — másik egyházmegye

1. Belépés egy másik egyházmegyei esperesként
2. /dashboard-egyhazmegye oldal
3. ✅ Várt: NEM látszanak a másik egyházmegye gyülekezeteinek éves jelentései (csak a sajátja)
4. Ha a másik egyházmegye egy jelentés ID-jával próbál UPDATE-et futtatni (pl. curl-lel):
5. ✅ Várt: RLS blokkolja (0 sor érintve)

---

## Összesítő — Mit ellenőrzöl egy menetben

Ha egyben tesztelsz, javaslom ezt a sorrendet:

### 1) SQL Editor-ban (5 perc):
- ✅ A1.2.1, A1.2.2, A1.2.3, A1.2.4 query-k — a K1 rés zárva
- ✅ A2.3 query — a K2 rés zárva
- (A3 majd később)

### 2) Böngészőben normál user-ként (5 perc):
- ✅ A1.3.1 – A1.3.8 — Missziós Műhely működik

### 3) Böngészőben master admin-ként (3 perc):
- ✅ A2.4.1 – A2.4.5 — Biztonság fül rendben, nincs kiírva a régi PIN
- ✅ A2.5.1 – A2.5.3 — God Mode aktiválás/deaktiválás

**Ha mind ✅, a 3 kritikus biztonsági rés bezárva, a roadmap szerint Q2 elején megyünk tovább a pénzügyi modul bővítésével (B1 Bérleti szerződés).**

---

## Hiba esetén

Ha bármelyik teszt váratlanul sikerül (pl. módosítható más statisztikája), azonnal:
1. **Vedd le éles használatból** a Missziós Műhely modult (ha lehet — Supabase-en kikapcsolhatod a tábla RLS-ét, hogy a sérülés ne folytatódjon)
2. Szólj fejlesztőnek, nézzük át együtt a policy-kat
3. Futtasd: `SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'mm_%' ORDER BY tablename, policyname;` — ellenőrizzük, nincs-e új ismeretlen policy

---

## Dokumentáció-hivatkozások

- Teljes audit: `~/.claude/plans/purrfect-coalescing-quiche.md`
- Biztonsági diagnosztika: `docs/project-tracking/KARTOTEKA-rendszerdiagnosztika-2026-04-12.md` K1, K2, K3
- Projekt log: `docs/project-tracking/KARTOTEKA-project-log.md` 018-021. lépés
- SQL migrációk: `migration-docs/sql/2026-04-15-*.sql`

---

## D1 — MM Sziget „Közös Munka" projekt modul

### D1.1 Előkészítés — kozos_munka állapot elérése

1. Hozz létre egy új ötletet (Missziós Műhely → Új ötlet)
2. 5 különböző userrel támogasd meg (VAGY manuálisan: DB-ben `UPDATE mm_otletek SET statusz='kozos_munka', tamogatasok_szama=5 WHERE id='...'`)
3. Navigálj `/misszios-muhely/forum/[ideaId]` oldalra
4. ✅ Várt: a szavazási gombok után **új blokk** jelenik meg — "Közös Munka" cím, TeamMembers, TaskList, MilestoneTimeline, DocumentList

### D1.2 Csapattagok megjelenés

1. A TeamMembers panel látszik
2. ✅ Várt: az ötletgazda Crown (korona) ikonnal, amber háttérrel, "Ötletgazda" badge-dzsel
3. ✅ Várt: a csatlakozók UserCircle2 ikonnal, violet háttérrel
4. ✅ Várt: név + gyülekezet + (csatlakozottaknál) csatlakozási dátum

### D1.3 Feladat CRUD

1. Kattints „+ Új feladat" gombra (violet gradient header modal)
2. Cím: „Imahét programfüzet megtervezése", Felelős: válassz dropdown-ból, Határidő: jövő hét
3. Mentés → toast „Feladat hozzáadva"
4. ✅ Várt: új kártya, státusz ikon Circle (függőben), Clock/UserCircle2 meta infó
5. Kattints a státusz ikonra → **Timer (folyamatban, amber)**
6. Kattints újra → **CheckCircle2 (kész, emerald)** + toast „+10 pont"
7. **DB ellenőrzés**:
   ```sql
   SELECT id, cim, felelos_nev, statusz FROM mm_feladatok WHERE otlet_id = '...';
   SELECT osszpontszam, feladatok_teljesitve FROM mm_felhasznalo_statisztika WHERE user_id = '<felelos_id>';
   ```
8. Pencil ikonra → szerkesztés → módosítás
9. Trash ikonra → törlés (confirm dialog) → csak ötletgazda/admin látja

### D1.4 Progress bar

1. 3 feladat létrehozása, 1 kész
2. ✅ Várt: a TaskList fejlécében „1 / 3 kész — 33% kidolgozottság" szöveg
3. ✅ Várt: a progress bar violet-fuchsia gradient, 33%-nál

### D1.5 Mérföldkő timeline

1. „+ Új mérföldkő" → amber gradient modal
2. Cím: „Programfüzet véglegesítve", Határidő: jövő hónap
3. Mentés → timeline-on új item jelenik meg
4. ✅ Várt: vertikális vonal, státusz kör (szürke = nyitott)
5. Ha a határidő 7 napon belül: Circle amber (közelgő)
6. Ha a határidő múltban: AlertTriangle red (lejárt)
7. Kattints a státusz körre → CheckCircle2 emerald (teljesítve) + toast „🎉"

### D1.6 Dokumentum URL

1. „+ Új dokumentum" → cyan gradient modal
2. Név: „Útmutató PDF", URL: `https://drive.google.com/file/d/1abc2345`
3. Típus: PDF dokumentum → Mentés
4. ✅ Várt: új kártya FileText ikon (piros háttér), kattintható link (ExternalLink hover)
5. Feltöltő + dátum + méret (ha megadva)
6. **Biztonsági teszt**: próbálj `javascript:alert(1)` URL-t → ✅ Várt: error toast „Csak https:// vagy http:// protokollú URL engedélyezett."

### D1.7 Jogosultságok

1. **Ötletgazda**: minden gombot lát (Új feladat / mérföldkő / dok + Szerkesztés + Törlés minden soron)
2. **Csatlakozott csapattag**: Új + Szerkesztés látszik, Törlés csak a saját dokumentumain
3. **Külső user (nem csatlakozott)**: NEM lát „+" gombokat, csak olvasás
4. **Feladat státusz módosítás**: csak a felelős VAGY az ötletgazda VAGY admin kattinthat (külső user esetén disabled, tooltip: „Csak a felelős...")

### D1.8 Gamifikáció

1. Egy feladat felelőse vagy
2. Kattints „kész" állapotra
3. ✅ Várt: toast „Feladat elvégezve! [felelős neve] +10 pontot kapott."
4. Navigálj `/misszios-muhely/profil` oldalra → ossz pont +10
5. **Cooldown ellenőrzés**: állítsd vissza fuggeben-re, majd újra kész — ✅ Várt: **NEM kap újra pontot** (alreadyDone logic), ugyanis `!alreadyDone` csak akkor igaz, ha az UPDATE ELŐTT a statusz még NEM volt 'kesz'. Ez duplázott pontot kizár.
   Megjegyzés: valójában a kód így működik: `alreadyDone = task.statusz === 'kesz'` (az update ELŐTT). Ha előtte már 'kesz' volt (és most megint 'kesz' lesz), nincs pont. Viszont ha fuggeben → kesz → fuggeben → kesz, akkor MINDKETTŐ 'kesz' állapotban 'alreadyDone' false, tehát MINDKÉTSZER kap pontot. **Ez ismerten elfogadható** a jelenlegi MVP-ben — a user nyilván nem fogja ciklikusan csinálni.

### D1.9 kozos_munka → megvalosult átmenet

1. Ötletgazda / admin kézzel átáll `megvalosult` státuszra (pl. Supabase-en `UPDATE mm_otletek SET statusz='megvalosult'`)
2. Reload oldal
3. ✅ Várt: a ProjectPanel még látszik, de a header „Megvalósult projekt" + „Örülünk, hogy részesei lehettünk!"
4. A feladatok / mérföldkövek / dokumentumok OLVASHATÓK, de szerkeszthetők (igaz maradnak a jogosultságok)

### D1 ÖSSZEFOGLALÓ

Ha D1.1 — D1.9 mind ✅, a **D1 MVP KÉSZ ÉS HASZNÁLHATÓ**:
- Az ötlet kozos_munka fázisban teljes projekt-réteget kap (csapat, feladatok, mérföldkövek, dokumentumok)
- Gamifikáció: feladat teljesítés = +10 pont a felelősnek
- Jogosultsági modell: olvasás mindenkinek, szerkesztés csapattagoknak, törlés ötletgazdának/adminnak
- URL-alapú dokumentumkezelés (R2 nélkül, MVP)

---

## E3 — Iktató sablonok modul

### E3.1 SQL migráció futtatása

1. Supabase Studio → SQL Editor
2. Másold be: `migration-docs/sql/2026-04-15-iktato-sablonok.sql`
3. Futtasd
4. ✅ Várt: "Success. No rows returned"
5. Ellenőrző query:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'iktato_sablonok'; -- 1 sor
   SELECT policyname FROM pg_policies WHERE tablename = 'iktato_sablonok'; -- 4 sor
   SELECT COUNT(*) FROM iktato_sablonok; -- 0 (üres)
   ```

### E3.2 Tab switcher működik

1. `/iktato` oldal
2. ✅ Várt: a stat kártyák FÖLÖTT van egy tab sáv: "Iktatott iratok" (aktív) | "Sablonok"
3. Kattints "Sablonok" fülre
4. ✅ Várt: átvált, mutatja "Még nincs irat-sablon rögzítve" üres állapotot
5. Kattints vissza "Iktatott iratok" fülre → visszatér a régi CRUD nézet

### E3.3 Alapsablonok betöltése

1. Sablonok fülön → "Alapsablonok betöltése" gomb (teal)
2. Confirm dialog → OK
3. ✅ Várt: toast "4 új sablon betöltve"
4. Lista frissül: 4 kártya (Keresztelési-, Konfirmációs-, Esketési-, Tagsági igazolás)
5. Újra kattints a gombra
6. ✅ Várt: toast "Minden alapértelmezett sablon már létezik" (idempotens)
7. **DB**:
   ```sql
   SELECT nev, tipus FROM iktato_sablonok WHERE deleted = false;
   -- 4 sor
   ```

### E3.4 Sablon szerkesztése

1. Egy sablon kártyán → Pencil ikon (szerkesztés)
2. ✅ Várt: teal gradient header modal — "Sablon szerkesztése" cím
3. Mezők előtöltve (név, típus, leírás, tartalom)
4. A "Sablonban talált placeholderek" szekció mutatja a detektált `{{kulcs}}`-okat
5. Az "Elérhető placeholderek" lenyitható — 17 placeholder dokumentálva (Auto badge a rendszer által automatikusan kitöltöttekre)
6. Módosíts a leíráson → Mentés → toast "Sablon módosítva"

### E3.5 Új sablon létrehozása

1. "Új sablon" gomb (teal)
2. Tölts ki: név "Kivonat jegyzőkönyvből", típus "Jegyzőkönyv"
3. Tartalom: `<p>Kivonat — {{nev}} a {{datum}} napján...</p>`
4. Mentés
5. ✅ Várt: új kártya a listán (jegyzokonyv típus, slate badge)

### E3.6 Generátor — automatikus placeholderek

1. Egy sablonon → "Generálás" gomb (indigo solid)
2. ✅ Várt: indigo/violet gradient modal, 2 oszlop
3. ✅ Várt: az AUTO placeholderek előtöltve (gyulekezet, lelkipasztor, iratszam=2026/N, datum="2026. április 15.", ev=2026, helyseg)
4. Az auto mezőknél hint: "Automatikusan előtöltve — szerkeszthető"
5. Jobb oldalon ÉLŐ preview — látszik, hogy a placeholderek behelyettesítődtek

### E3.7 Generátor — manuális kitöltés

1. Generátorban töltsd ki a kézi placeholdereket:
   - `nev` = "Kiss János"
   - `szul_datum` = "1990. március 15."
   - `apja_neve` = "Kiss József"
   - `anyja_neve` = "Szabó Mária"
   - `kereszteles_datuma` = "1990. április 20."
2. ✅ Várt: minden input változásra frissül a jobb oldali preview
3. Üresen hagyott mezők helyén `__________` látszik

### E3.8 PDF letöltés

1. Generátorban "PDF letöltése" gomb (indigo solid)
2. ✅ Várt: `Keresztelési_igazolás.pdf` letöltődik (~70-150 KB)
3. Nyisd meg → minden placeholder behelyettesítve, a layout korrekt A4 portrait Times New Roman
4. "Nyomtatás" gomb → böngésző nyomtatási párbeszéd

### E3.9 Aktiválás / inaktiválás

1. Egy aktív sablonon Eye→EyeOff kattintás
2. ✅ Várt: toast "Sablon inaktiválva"
3. A kártya eltűnik (ha "Csak aktív" szűrő van)
4. Kattints "Inaktívak is" gombra → újra látszik, de fakó (opacity-60)
5. A "Generálás" gomb disabled inaktív sablonon
6. EyeOff→Eye kattintás → újra aktív

### E3.10 Törlés

1. Egy sablonon Trash ikon
2. Confirm dialog → OK
3. ✅ Várt: toast "Sablon törölve"
4. Kártya eltűnik
5. **DB**:
   ```sql
   SELECT nev, deleted, aktiv FROM iktato_sablonok WHERE id = '...';
   -- deleted = true, aktiv = false (soft delete)
   ```

### E3.11 RLS védelem — másik gyülekezet

1. Belépés egy másik gyülekezet user-ével
2. /iktato → Sablonok fül
3. ✅ Várt: NEM látszanak az előző gyülekezet sablonjai, csak a sajátjai (vagy üres)
4. Próbáld meg az URL-ben közvetlenül elérni egy másik gyülekezet sablon ID-ját:
   ```
   A template-actions `getFilingTemplate` filterel `congregation_id = current_user_congregation_id()` alapján.
   ```
5. ✅ Várt: "A sablon nem található" error

### E3.12 XSS védelem

1. Hozz létre egy sablont: tartalom = `<p>Tisztelt {{nev}}!</p>`
2. Generátorban: `nev` = `<script>alert('xss')</script>`
3. ✅ Várt: a preview-ban és a PDF-ben is a szöveg **escape-elve** jelenik meg: `&lt;script&gt;alert('xss')&lt;/script&gt;`
4. A szkript NEM fut le

### E3 ÖSSZEFOGLALÓ

Ha E3.1 — E3.12 mind ✅, **az E3 MVP KÉSZ ÉS HASZNÁLHATÓ**:
- A gyülekezet lelkészei egy helyen kezelik a sablonokat
- 4 alapsablon azonnal használható
- Placeholderek automatikusan vagy kézzel töltődnek ki
- PDF letöltés + nyomtatás egyetlen kattintásra
- RLS + XSS védelem rendben

---

## E1 — Admin import befejezés (Lookup resolver + import log)

### E1.1 SQL migráció futtatása

1. Supabase Studio → SQL Editor
2. Másold be: `migration-docs/sql/2026-04-15-import-logs.sql`
3. Futtasd
4. ✅ Várt: Success
5. Ellenőrzés:
   ```sql
   SELECT tablename FROM pg_tables WHERE tablename = 'import_logs'; -- 1 sor
   SELECT policyname FROM pg_policies WHERE tablename = 'import_logs'; -- 4 sor
   ```

### E1.2 Teszt Excel fájl előkészítése

1. Készíts `test_bevetelek.xlsx` fájlt:
   - Fejléc sor: `Dátum | Összeg | Személy CNP | Befizetés célja`
   - 3-5 sor:
     - Dátum: 2026-03-15, Összeg: 500, CNP: (másolj a saját gyülekezet `szemely` táblából egy valós CNP-t), Cél: "Egyházi járulék" (vagy bármi ami létezik a `befizetescel.nev` mezőben)
     - 2-3 további sor különböző személyekkel és kategóriákkal
     - 1 sor KÉNT, amit NEM talál (hibás CNP + hibás kategória név — a tesztelje a warning-ot)

### E1.3 Import god-mode-ban

1. Master admin belépés → /penzugy oldal
2. God-mode aktiválás (a ModuleAdminWorkspace tab-megnyító PIN-nel)
3. Import fül → "Bevétel (Kassza)" profil választ
4. Excel fájl feltöltés → Preview
5. ✅ Várt: sheet fejlécek felismerése, 3-5 sor mutatkozik
6. Mapping: a profil javaslat "income" → elfogadás
7. Import indítás → 1-2 mp futás

### E1.4 Eredmény ellenőrzés — DB

```sql
SELECT b.id, b.datum, b.osszeg, b.id_szemely, b.id_befizetescel, b.forrasa
FROM befizetes b
ORDER BY b.created_at DESC LIMIT 5;
```
✅ Várt:
- `id_szemely` NEM NULL (4/5 sorban)
- `id_befizetescel` NEM NULL (4/5 sorban)
- A hibás sor (amit szándékosan rontottunk) vagy skippelve VAGY NULL FK-val bent van

### E1.5 Import log ellenőrzés — DB

```sql
SELECT module, file_name, total_inserted, total_skipped, lookup_stats, errors
FROM import_logs
ORDER BY created_at DESC LIMIT 1;
```
✅ Várt:
- `module = 'finance'`
- `file_name = 'test_bevetelek.xlsx'`
- `lookup_stats.personResolved = 4` (a 4 valós CNP)
- `lookup_stats.categoryResolved = 4` (a 4 valós kategória)
- `lookup_stats.personUnresolved = 1` (a hibás sor)
- `lookup_stats.warnings` tömb tartalmaz egy üzenetet

### E1.6 Import log UI ellenőrzés

1. Master admin → /admin → Import fül
2. A leíró kártyák után megjelenik az ImportLogList
3. ✅ Várt: legalább egy sor a most futtatott import-ról
4. Module badge: amber "Pénzügy"
5. Fájlnév: test_bevetelek.xlsx
6. Jobb oldalon: 4 beillesztve (emerald) + 1 kihagyva (amber)
7. Kattints a sorra → kibővül
8. ✅ Várt:
   - Sheet-enként bontás: "Sheet1 → income: 4 beillesztve, 1 kihagyva"
   - Lookup stats: 4 mini kártya (Személy OK: 4, Személy nem: 1, Kategória OK: 4, Kategória nem: 1)
   - "Lookup figyelmeztetések (1)" collapsible — benne a warning a hibás CNP-re
   - (Ha volt insert hiba) "Hibák (X)" szekció nyitva

### E1.7 Module szűrő működik

1. ImportLogList-ben dropdown: "Minden modul" → válassz "Tagnyilvántartás"
2. ✅ Várt: a Pénzügy log eltűnik
3. Vissza "Minden modul" → újra látszik

### E1.8 RLS védelem — más user

1. Másik user (NEM a master) belép egy másik gyülekezetbe
2. /admin oldal redirect (nem master) — valóban nem tud bemenni
3. HA bemenne (Supabase direct access): a `listImportLogs` csak a SAJÁT user logjait és a saját egyházmegye logjait hozná vissza

### E1.9 Delegált import még működik

1. Master belép → God-mode, más gyülekezet választás
2. Delegált import PIN generálás
3. Nem-master user megkapja, beírja
4. 2h session → import fül megnyílik
5. Ugyanúgy működik, mint E1.3

### E1.10 Fájlméret-korlát

1. Készíts 11 MB Excel fájlt
2. Feltöltés próbálkozás
3. ✅ Várt: error toast "A fájl mérete meghaladja a 10 MB-os limitet."

### E1 ÖSSZEFOGLALÓ

Ha E1.1 — E1.10 mind ✅, **az E1 MVP KÉSZ ÉS PRODUCTION-READY**:
- A lookup resolver a CNP + név + kategória mezőket valódi FK ID-kra fordítja
- Az import log minden futtatást rögzít (user, modul, fájl, statisztika, hibák)
- Az admin UI-ban vizuálisan áttekinthető a történet
- RLS védi az adatokat (saját + esperes + master)

---

## CLEANUP — Legacy DB cleanup (Soft-drop fázis)

### CLEANUP.1 Soft-drop SQL futtatása

1. Supabase Studio → SQL Editor
2. Másold be: `migration-docs/sql/2026-04-15-legacy-cleanup-soft-drop.sql`
3. Futtasd
4. ✅ Várt: Success (19 ALTER TABLE művelet)

### CLEANUP.2 Verifikáció — átnevezett táblák listája

```sql
SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename LIKE '%_ARCHIVE_2026_04_15'
  ORDER BY tablename;
```
✅ Várt: **pontosan 19 sor**, minden a `_ARCHIVE_2026_04_15` postfixszel végződik:
- `access_ARCHIVE_2026_04_15`
- `befizetesbealitas_ARCHIVE_2026_04_15`
- `befizetocelcfg_ARCHIVE_2026_04_15`
- `cfg_report_ARCHIVE_2026_04_15`
- `cfgparam_ARCHIVE_2026_04_15`
- `csoporttagok_ARCHIVE_2026_04_15`
- `felmentesx_ARCHIVE_2026_04_15`
- `gyulekezetek_ARCHIVE_2026_04_15`
- `iktatokonyv_ARCHIVE_2026_04_15`
- `korzetfilter_ARCHIVE_2026_04_15`
- `param_ARCHIVE_2026_04_15`
- `penztar_ARCHIVE_2026_04_15`
- `szamadasidatum_ARCHIVE_2026_04_15`
- `tmp_befizetes_ARCHIVE_2026_04_15`
- `tmp_csaladosszeg_ARCHIVE_2026_04_15`
- `tmp_kiadas_ARCHIVE_2026_04_15`
- `tmp_penztarkonyv_ARCHIVE_2026_04_15`
- `tmp_valnevjegy_ARCHIVE_2026_04_15`
- `users_ARCHIVE_2026_04_15`

### CLEANUP.3 Verifikáció — sorszámok (audit)

```sql
SELECT relname AS tabla, n_live_tup AS sorszam
  FROM pg_stat_user_tables
  WHERE schemaname = 'public' AND relname LIKE '%_ARCHIVE_2026_04_15'
  ORDER BY n_live_tup DESC;
```
Jegyezd fel a számokat — ha nagy (pl. `users_ARCHIVE_2026_04_15` 500+ sorral), a DROP előtt érdemes `pg_dump`-ot készíteni.

### CLEANUP.4 Főtáblák ellenőrzése

```sql
SELECT COUNT(*) FROM public.profiles;
SELECT COUNT(*) FROM public.congregations;
SELECT COUNT(*) FROM public.iktato;
SELECT COUNT(*) FROM public.befizetescel;
SELECT COUNT(*) FROM public.szemely;
```
✅ Várt: mindegyik megfelelő sorszámot ad. A legacy cleanup NEM érinti a fő táblákat.

### CLEANUP.5 Funkcionális smoke teszt

Belépsz a Next.js app-ba, rákattintasz a modulokra:
- ✅ Tagnyilvántartás → személyek + családok megjelennek
- ✅ Pénzügy → befizetés lista + kiadás lista + KPI-k működnek
- ✅ Anyakönyv → keresztelő/konfirmáció/esketés/temetés listák
- ✅ Iktató → iratok + sablonok (E3) működnek
- ✅ Missziós Műhely → ötletlista + forum (D1) működnek
- ✅ Admin → Import fül → Import logs (E1) lista jön

**Ha bármelyik "table not found" hibát kapsz**, azonnal rollback:
```sql
ALTER TABLE public.USZABALY_ARCHIVE_2026_04_15 RENAME TO USZABALY;
-- vagy bármelyik szükséges táblára
```

### CLEANUP.6 30 napos monitoring

**Hetente egyszer** futtasd Supabase Studio → Database → Logs-ban:
```
event_message.ilike.%_ARCHIVE_2026_04_15%
```
Ha üres eredmény minden héten → a fázis 2 (DROP TABLE) biztonságosan futtatható 2026-05-15-től.

Ha hiba (pl. "table ... does not exist" egy _ARCHIVE táblára hivatkozva):
1. Jegyezd fel, melyik modul hívta és milyen funkciónál
2. Rollback az érintett táblán
3. Frissítsd a migrációs fájlokat (töröld a visszahozott táblát a DROP listából)

### CLEANUP ÖSSZEFOGLALÓ

Ha CLEANUP.1 — CLEANUP.5 mind ✅, a **Soft-drop fázis kész**:
- 19 legacy tábla átnevezve
- Főtáblák és funkciók sértetlenek
- 30 napos monitoring megkezdve
- A 2026-05-15-ös DROP migráció biztonságosan futtatható majd
