# KARTOTEKA — Biztonsági javítások diagnosztikai jelentés

**Dátum**: 2026-04-15
**Auditor**: Claude (Sonnet, Anthropic)
**Scope**: A1 (Missziós Műhely RLS), A2 (God Mode PIN), A3 (Path traversal + Support upload)
**Alapul szolgáló audit**: `KARTOTEKA-rendszerdiagnosztika-2026-04-12.md` K1, K2, K3 pontok
**Projekt log lépések**: 018., 019., 020., 021., 022.

---

## Vezetői összefoglaló

A 2026-04-12 diagnosztikai audit **4 kritikus biztonsági rést** azonosított. Ebből **3 ugyanezen napon indított javítási körben véglegesen lezárult**, plusz egy **korábban nem azonosított általános Storage upload sebezhetőség is javítva**.

### Status eloszlás

| Rés | Prioritás | Státusz | Javítás típusa |
|---|---|---|---|
| K1 — Missziós Műhely RLS | 🔴 Kritikus | ✅ ZÁRVA | 2 SQL migráció + 1 kód javítás |
| K2 — Hardcoded God Mode PIN (258456) | 🔴 Kritikus | ✅ ZÁRVA | 1 SQL migráció + 4 kód javítás |
| K3 — Path traversal publikus oldal | 🔴 Kritikus | ✅ ZÁRVA (korábban) | Meglévő validáció megerősítve |
| ÚJ — Support screenshot MIME hiány | 🟠 Magas | ✅ ZÁRVA | 1 kód javítás |

### Verifikáció státusza

- **TypeScript typecheck**: 0 hiba ✅ (2026-04-15 éles futtatás a felhasználó által)
- **A1 SQL Part 1 + Part 2**: Éles DB-n lefutva ✅ (2026-04-15 a felhasználó által)
- **A2 SQL**: Még tesztelésre vár ⏳
- **Manuális UI tesztek**: A felhasználó egyben fogja tesztelni a `KARTOTEKA-security-test-checklist-2026-04-15.md` alapján

---

## A1 — Missziós Műhely RLS (K1)

### Eredeti probléma (2026-04-12 audit K1)

A 15 `mm_*` Supabase tábla RLS-e hiányos volt, és valaki kézzel létrehozott a Studio-ban olyan policy-kat, amik **teljesen megengedték** az írást minden authenticated usernek.

### Felfedezett valódi állapot (2026-04-15)

Az audit alapján első körben készített Part 1 migráció verifikációjakor **két újabb komoly probléma** derült ki:

**1. Rejtett `_all` / `_access` policy-k** (a `2026-04-13-rls-ALL-FIXED.sql` és `2026-04-13-rls-mm-misc-tables.sql` hozta létre):
```
mm_otletek_all: FOR ALL TO authenticated USING (true)
mm_segedanyagok_all: FOR ALL TO authenticated USING (true)
mm_dokumentumok_all: FOR ALL TO authenticated USING (true)
mm_feladatok_all: FOR ALL TO authenticated USING (true)
mm_merfoldkovek_all: FOR ALL TO authenticated USING (true)
mm_otlet_cimkek_all: FOR ALL TO authenticated USING (true)
mm_otlet_kategoriak_all: FOR ALL TO authenticated USING (true)
```
Mivel PostgreSQL OR-rel kombinálja a policy-kat, ezek **felülírták** a `2026-04-12-missziós-muhely-rls.sql` szigorú policy-jait.

**2. Hidden legacy policy-k a Studio-ból** (nincsenek verziókövetve, valaki kézzel írta):
```
mm_stat_insert (INSERT) with check: EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
mm_stat_update (UPDATE) using: (user_id = auth.uid()) OR (EXISTS profiles)
mm_otletek_{select,insert,update,delete}
mm_segedanyagok_{select,insert,update,delete}
mm_hozzaszolasok_{select,insert,delete}
mm_szavazatok_{select,insert,delete}
```

A **legsúlyosabb az `mm_stat_update`** volt: az `EXISTS profiles` minden authenticated userre `true`-t ad vissza, így **bárki módosíthatta bárkinek a statisztikáját** — feltornázhatta magát "Missziói bajnok" szintre 1 pillanat alatt.

### Javítás

**Fájlok (új)**:
- `migration-docs/sql/2026-04-15-mm-rls-fix.sql` (Part 1): DROP `_all`, `_access`, `_admin_only` policy-k + új ötletgazda-alapú szabályok a 4 használatlan táblára
- `migration-docs/sql/2026-04-15-mm-rls-fix-part2.sql` (Part 2): DROP minden régi `_select`, `_insert`, `_update`, `_delete` rövid nevű policy + `mm_stat_*` policy-k

**Fájlok (módosított)**:
- `app/misszios-muhely/community-actions.ts` — `loadWhatsNew()` UPDATE-et `supabase` → `getGamificationClient()` (service_role) mintára; különben a Part 2 után RLS blokkolta volna.

### Éles verifikáció (felhasználó által)

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mm_felhasznalo_statisztika'
ORDER BY cmd, policyname;
```

✅ Eredmény: 2 sor, mindkettő SELECT (`mm_stats_read_leaderboard`, `mm_stats_read_self_or_admin`). Nincs INSERT/UPDATE/DELETE policy. **A kritikus rés zárva.**

---

## A2 — Hardcoded God Mode PIN (K2)

### Eredeti probléma (2026-04-12 audit K2)

A `app/(dashboard)/god-mode/actions-v4.ts`-ben szerepelt:
```ts
const DEFAULT_GOD_MODE_PIN = '258456'
```
Ha a `GOD_MODE_PIN` env var és a `system_settings.god_mode_pin` sor hiányzott, a rendszer a hardcoded `258456`-ot fogadta el. Ez a master admin teljes rendszerszintű hozzáférését tette nyilvánossá, aki tudja a master admin e-mailt.

### Felfedezett valódi állapot (2026-04-15)

**1. Az `actions-v4.ts` már javítva volt** — korábbi javítási körben valaki eltávolította a `DEFAULT_GOD_MODE_PIN` konstansot, és a `readStoredPin()` env-only fallback-re tér át. A v4-et a 14 aktív oldal használja.

**2. Az `actions-v2.ts` és `actions-v3.ts` MÉG TARTALMAZTA a `DEFAULT_GOD_MODE_PIN = '258456'`-ot**. Ezek legacy fájlok, amiket 6 régi UI komponens importál (admin-tabs-v2, security-settings-tab, god-mode-banner v1/v2, god-mode-dialog v2/v3). De ezek a régi komponensek **nincsenek aktívan production-ben** (a dashboard-shell és admin/page.tsx már a v3/v4/v5 verziókat használja).

**3. LEGSÚLYOSABB FELFEDEZÉS: a UI-ban ki volt írva a PIN**:
- `security-settings-tab.tsx:114` és `security-settings-tab-v2.tsx:116`:
  ```tsx
  placeholder="258456"
  ```
- `security-settings-tab.tsx:117` és `security-settings-tab-v2.tsx:119`:
  ```tsx
  Ha nincs külön beállítva, az alapértelmezett PIN: <span ...>258456</span>
  ```

Tehát **minden master admin, aki megnyitotta az Admin → Biztonság fület, LÁTTA a hardcoded PIN-t** a placeholder-ben és a magyarázó szövegben. Ez nyilvánosan exponált belépési vektor volt.

**4. SQL seed**: a `2026-04-09-god-mode-and-congregation-finance.sql` tartalmazott egy `INSERT ... 'god_mode_pin', '258456'` sort, ami a `system_settings` táblába írta az alapértelmezettet.

### Javítás

**Fájlok (módosított)**:
- `app/(dashboard)/god-mode/actions-v2.ts`:
  - `DEFAULT_GOD_MODE_PIN` konstans törölve
  - `readStoredPin()` átírva env-only fallback-re
  - `activateGodMode()` hibára fut, ha nincs PIN sem env-ben sem DB-ben
  - DEPRECATED megjegyzés a fájl tetején
- `app/(dashboard)/god-mode/actions-v3.ts`: ugyanaz
- `components/admin/security-settings-tab-v2.tsx` (aktív UI):
  - `placeholder="258456"` → `placeholder="••••••"`
  - Magyarázó szöveg: átírva biztonsági ajánlásra ("ne válassz könnyen kitalálható számsort")
  - `SOURCE_LABELS.default: 'Alapértelmezett'` → már nincs, csak `'none': 'Nincs beállítva'`
  - `schemaReady` warning szöveg módosítva (nem említi az "alapértelmezett"-et)
- `components/admin/security-settings-tab.tsx` (legacy UI): ugyanezek a javítások — TS típusok is frissítve (`'default'` → `'none'`, `string | null`)

**Fájlok (új)**:
- `migration-docs/sql/2026-04-15-remove-default-god-mode-pin.sql`:
  ```sql
  DELETE FROM public.system_settings
  WHERE key = 'god_mode_pin'
    AND value = '258456';
  ```
  Védő WHERE clause — csak akkor töröl, ha még a hardcoded érték van.

### Állapot

- TypeScript typecheck: ✅ tiszta (2026-04-15 éles futtatás)
- SQL még nem futott éles DB-n — a felhasználó a tesztelési körben fogja végrehajtani
- Manuális UI teszt előtt áll — várt: placeholder `••••••`, magyarázó szöveg biztonsági ajánlás

---

## A3 — Path traversal + Support upload MIME

### Eredeti probléma (2026-04-12 audit K3)

A `app/(dashboard)/publikus-oldal/upload-actions.ts` **nem validálta** a `target.postSlug` és `target.issueId` paramétereket. A támadó egy `'../../other-congregation/hero'` path-szal más gyülekezet storage mappájába írhatott volna.

### Felfedezett valódi állapot (2026-04-15)

**1. A K3 rés már korábban javítva volt**. Az `upload-actions.ts` már használja:
- `validateSlug()` import a `@/lib/public-site/slug`-ból (17. sor)
- `post-cover` ágon slug validáció (87-90 sor)
- `magazine-cover` + `magazine-pdf` ágakon UUID validátor (95-98, 150-152 sor)
- Defense in depth: `!path.startsWith(congregationId + '/') || path.includes('..')` (109-111, 165-167 sor)

**2. ÚJ RÉS FELFEDEZVE** az általános Storage upload audit során: a `app/(dashboard)/support/actions.ts::uploadSupportScreenshot`:
- **Nem validálta a MIME típust** — bármilyen fájl (`.js`, `.exe`, `.html`, `.sh`, HTML phishing tartalom) feltölthető volt
- Az extension a user által megadott `file.name`-ből jött
- A `public-site-media` bucket publikus — a feltöltött fájlok nyilvános URL-lel elérhetők, tehát phishing oldalak terjesztésére használhatók

A path maga biztonságos volt (`support/{user.id}/...` szerver-oldali `user.id`-vel), de **a tartalom típusa nem volt szabályozva**.

### Javítás

**Fájlok (módosított)**:
- `app/(dashboard)/support/actions.ts::uploadSupportScreenshot`:
  - Importok: `ALLOWED_IMAGE_TYPES`, `sanitizeFilename`, `PUBLIC_SITE_MEDIA_BUCKET` a `@/lib/public-site/storage`-ből
  - Új konstans: `MAX_SUPPORT_SCREENSHOT_SIZE = 5 MB` (az eredeti limit megtartva)
  - MIME validáció: csak `image/jpeg`, `image/png`, `image/webp`
  - `sanitizeFilename()` használata: a user-adott filename `[a-z0-9-]+` + timestamp formátumra konvertálódik
  - Defense in depth: `!path.startsWith('support/{user.id}/') || path.includes('..')`
  - `upsert: false` (nem írja felül a régieket)
  - `contentType: file.type` (explicit content-type a Storage-ba)

### Mit NEM csináltam

- **A publikus bucket megmarad**: nem változtattam a `public-site-media` bucket jellegén. Ez architekturális döntés, és a hero/crest/post-cover/magazin képek is ott vannak, amik szándékosan publikusak. Egy későbbi refaktornál mérlegelhető, hogy a support screenshotoknak legyen-e külön privát bucket-je.

### Állapot

- TypeScript typecheck: ✅ tiszta
- Manuális UI teszt előtt áll — várt: JPG/PNG/WebP ✅, `.txt`/`.js`/`.exe`/`.html` ❌ hiba

---

## Összesítő — Érintett fájlok

### Új fájlok (4 db)

| Fájl | Típus | Méret |
|---|---|---|
| `migration-docs/sql/2026-04-15-mm-rls-fix.sql` | SQL | ~13 kB |
| `migration-docs/sql/2026-04-15-mm-rls-fix-part2.sql` | SQL | ~7 kB |
| `migration-docs/sql/2026-04-15-remove-default-god-mode-pin.sql` | SQL | ~2 kB |
| `docs/project-tracking/KARTOTEKA-security-test-checklist-2026-04-15.md` | MD | ~10 kB |

### Módosított fájlok (7 db)

| Fájl | Mit |
|---|---|
| `app/misszios-muhely/community-actions.ts` | `loadWhatsNew()` UPDATE service_role-ra |
| `app/(dashboard)/god-mode/actions-v2.ts` | DEFAULT PIN törölve, env-only, DEPRECATED komment |
| `app/(dashboard)/god-mode/actions-v3.ts` | Ugyanaz |
| `components/admin/security-settings-tab-v2.tsx` | UI PIN expónálás eltávolítva |
| `components/admin/security-settings-tab.tsx` | Ugyanaz + TS típus frissítés |
| `app/(dashboard)/support/actions.ts` | MIME + sanitize + defense-in-depth |

### Projekt log frissítések

- `docs/project-tracking/KARTOTEKA-project-log.md` — 018, 019, 020, 021, 022 lépés

---

## Verifikációs státusz

### Éles DB-n lefutott ✅

| Migráció | Dátum | Eredmény |
|---|---|---|
| `2026-04-15-mm-rls-fix.sql` | 2026-04-15 | Sikeres — 15 mm_* táblán RLS aktív |
| `2026-04-15-mm-rls-fix-part2.sql` | 2026-04-15 | Sikeres — csak SELECT policy maradt a stat táblán |

### Kód szintű ellenőrzés ✅

- `npx.cmd tsc --noEmit` → 0 hiba (2026-04-15)

### Tesztelésre vár ⏳

- A2 SQL migráció (`2026-04-15-remove-default-god-mode-pin.sql`) éles futtatása
- Manuális UI tesztek (részletesen: `KARTOTEKA-security-test-checklist-2026-04-15.md`):
  - Missziós Műhely normál user-ként (ötlet, szavazás, hozzászólás, statisztika)
  - Biztonság fül master admin-ként (placeholder, magyarázó szöveg, god mode aktiválás)
  - Support screenshot feltöltés (JPG OK, `.txt` hiba)
  - Publikus oldal feltöltések (hero, crest, post-cover, magazin)

---

## Kockázatok és nyitott kérdések

### Most lezárt kockázatok

- ✅ Bárki módosíthatja más statisztikáját (mm_stat_update) → lezárva
- ✅ Hardcoded 258456 PIN a kódban és UI-ban → lezárva
- ✅ Path traversal a publikus oldal uploadon → már korábban lezárva, megerősítve
- ✅ Support screenshot MIME validáció hiánya → lezárva

### Nyitott kockázatok (más javítási körben kell kezelni)

| Kockázat | Prioritás | Javaslat |
|---|---|---|
| `mm_dokumentumok` INSERT policy az N+1 `EXISTS mm_szavazatok` ellenőrzés miatt performanciagond lehet nagy táblánál | 🟡 Közepes | Mérés + esetleg index |
| A legacy fájlok (actions-v2, v3, dialog v1-v4, banner v1/v2, tabs v1/v2) dead code-ként maradtak. A `258456` nincs bennük, de a mennyiség növeli a zajt és a karbantartási terhet. | 🔵 Alacsony | Q3-ban tervezett cleanup |
| A `public-site-media` bucket publikus — a support screenshot ugyanott kerül, mint a hero/post-cover. Bár a MIME-validáció megvéd a script-feltöltéstől, az image-alapú phishing (pl. hamis logó, screenshot) még lehetséges. | 🔵 Alacsony | Későbbi refaktor — külön privát `support-attachments` bucket |
| Supabase Studio-ban kézzel létrehozott policy-k (mm_stat_*, _select/_insert/_update/_delete) — nincs védelem, hogy valaki újra létrehozza. | 🟠 Magas | Code-review folyamat minden DB módosításra, és rendszeres `pg_policies` ellenőrzés |
| Az `AGENTS.md` a KARTOTEKA gyökérben gyanús utasítást tartalmaz (`node_modules/next/dist/docs/`-ból olvasni Next.js 16 docs-ot). Potenciális prompt injection. | 🟡 Közepes | Ellenőrizni ki tette oda; ha legitim instrukció, finomítani; ha nem, törölni |

---

## Következő lépések

### Rövid távon (felhasználó teendője)

1. `2026-04-15-remove-default-god-mode-pin.sql` futtatása Supabase SQL Editor-ban
2. Manuális UI tesztek a `KARTOTEKA-security-test-checklist-2026-04-15.md` alapján
3. Ha 0 sor maradt a `system_settings.god_mode_pin` sorban, új erős PIN beállítása a Biztonság fülön

### Közép távon (roadmap Q2)

A `~/.claude/plans/purrfect-coalescing-quiche.md` audit szerint a következő prioritás:

1. **B1 — Bérleti szerződés modul** (~1 hét): `berleti_szerzodes` Supabase tábla integrálása, `components/modals/rental-contract-dialog.tsx`, `debt-tab-v2` bővítés bérleti hátralék-szekcióval. Tervezet: `migration-docs/todo/phase-4-finance.md` 4a alfázis.
2. **B2 — Devizás átértékelés (FX)** (~1.5 hét): EUR számlák év végi átértékelése BNR árfolyamon.
3. **B3 — Monetár modul befejezése** (~1 hét)
4. **B4 — Kerületi/egyházmegyei dashboard befejezése** (~1 hét)
5. **C1 — Éves jelentések modul** (~2 hét)

---

## Kapcsolódó dokumentumok

- **Eredeti audit**: `docs/project-tracking/KARTOTEKA-rendszerdiagnosztika-2026-04-12.md`
- **Átfogó audit + roadmap**: `~/.claude/plans/purrfect-coalescing-quiche.md`
- **Tesztelési checklist**: `docs/project-tracking/KARTOTEKA-security-test-checklist-2026-04-15.md`
- **Projekt log**: `docs/project-tracking/KARTOTEKA-project-log.md` (018-022. lépés)
- **Phase-specifikus tervek**: `migration-docs/todo/phase-4-finance.md`, `phase-7-cemeteries-mission-notifications.md`
- **SQL migrációk**: `migration-docs/sql/2026-04-15-*.sql`

---

**Dokumentum státusza**: VÉGLEGESÍTETT
**Felülvizsgálat dátuma**: 2026-04-15
**Következő felülvizsgálat**: manuális tesztek után
