# KARTOTEKA — Diagnosztika és known issues

**Utolsó frissítés**: 2026-05-15 (teljes újra-audit)
**Web verzió**: v0.9.54 (Railway, kartotekaweb-production.up.railway.app)
**Desktop verzió**: v0.8.7 (GitHub Releases + Supabase Storage updater)

A Kartotéka rendszer állapota, ismert hibák és tervezett javítások. A korábbi 2026-04-25-i diagnosztikai bejegyzések részben tárgytalanok (P1 javítva, P2 részben rendezve), részben átsoroltam az új súlyossági szintekre. A most frissített dokumentum a 2026-05-15-i teljes audit eredménye (lint + build + 5 párhuzamos audit-agent: tech-debt, biztonság, verzió, SQL, paritás).

---

## 🟢 Build / typecheck / lint állapot (2026-05-15)

| Workspace | Parancs | Eredmény |
|---|---|---|
| `@kartoteka/ui-app` | `npm run typecheck` | ✅ zöld |
| `@kartoteka/web` | `npm run build` | ✅ zöld (80+ oldal, Next.js webpack) |
| `@kartoteka/web` | `npm run lint` | ❌ **77 error + 76 warning** (l. P2 — Lint hibák) |
| `@kartoteka/desktop` | `npm run build` | ⏸ nem futtattam — a Vite/tsc/Cargo build a memória szerint utoljára zöld volt v0.8.7-nél |

A lint hibák túlnyomó többsége `react/no-unescaped-entities` (idézőjel-escape) — vizuális/HTML-validitás kérdés, nem futási hiba. Egyetlen érdemi hiba van köztük (l. P2-1).

---

## 🔴 KRITIKUS (P0) — biztonsági kockázat, azonnali teendő

### P0-1. Brevo SMTP API kulcs plain text-ben a repo-ban

**Fájl**: [migration-docs/BREVO-SMTP.txt](migration-docs/BREVO-SMTP.txt)
**Lelet**: a fájl tartalmaz egy `xsmtpsib-…` formátumú élő Brevo (Sendinblue) SMTP API kulcsot. A `.gitignore` jelenleg **NEM fedi** ezt a fájlt. Ha valaha `git add migration-docs/`, vagy `git add .` futott, a kulcs felkerült a remote repo-ba és a teljes git history-ban szerepel.
**Teendő**:
1. **Most azonnal** — Brevo dashboard → API keys → rotáld az API-kulcsot, az új értéket csak `apps/web/.env.local`-be írd.
2. `.gitignore` kibővítése: `migration-docs/BREVO-SMTP.txt` vagy általánosabban `migration-docs/**/*SMTP*`, `migration-docs/**/*SECRET*`.
3. Ha a kulcs valaha is committed volt: `git log --all --oneline -- migration-docs/BREVO-SMTP.txt` ellenőrzés, és ha igen, history-rewrite (BFG / `git filter-repo`) + force-push (engedéllyel).

### P0-2. Google OAuth client_secret JSON commit-előtti állapotban

**Fájl**: [migration-docs/google.cloud.console/client_secret_516713595012-…apps.googleusercontent.com.json](migration-docs/google.cloud.console/)
**Lelet**: tartalmaz valódi `client_id`-t, `project_id`-t és majdnem biztos a `client_secret`-et is. `git ls-files` szerint még NINCS trackelve, de a `.gitignore` egyik mintája sem fedi. Egyetlen `git add .` és felkerül.
**Teendő**:
1. `.gitignore`-hoz: `migration-docs/google.cloud.console/`
2. Google Cloud Console → OAuth client → secret rotálása.

### P0-3. Tauri `db_execute` / `db_select` tetszőleges SQL-t fogad

**Fájl**: [apps/desktop/src-tauri/src/db.rs:1993-2056](apps/desktop/src-tauri/src/db.rs#L1993-L2056)
**Lelet**: mindkét `#[tauri::command]` paramétere `sql: String`. A frontend tetszőleges DDL/DML-t küldhet (`DROP TABLE`, `ATTACH DATABASE`, `PRAGMA key=…`). Ha bármi XSS/HTML-injekció a renderer-be kerül (jövőbeli AI chat-widget, CMS előnézet, link-followup), az **teljes lokális SQLCipher DB-t kompromittálhat**.
**Mitigáció ami már van**: SQLCipher kulcs OS keyringben; a Tauri ablak nem renderel publikus oldalakat; capabilities szűk (csak `core:default`, `opener:default`, `updater:default`).
**Teendő**: cseréld a generikus SQL-felületet typed command-okra (`outbox_insert`, `setting_set`, `select_for_table(table, where)`). Tervezz Sprint-et — nem azonnali, de stratégiai.

### P0-4. `GOD_MODE_PIN=258456` a `.env.local`-ban

**Fájl**: `apps/web/.env.local` (gitignore-olva, csak helyi gépen)
**Lelet**: a memóriában rögzítve van a [`2026-04-15-remove-default-god-mode-pin.sql`](migration-docs/sql/2026-04-15-remove-default-god-mode-pin.sql) migráció, ami a hardkódolt fallback PIN-t törölte a kódból. A `.env.local`-ban viszont **még szerepel a `258456` érték**. Ha ez ténylegesen él a production Railway-en is (`GOD_MODE_PIN` env), akkor egy publikusan kitalálható (egyszer kiszivárgott) PIN-nel god-mode aktiválható.
**Teendő**:
1. Ellenőrizd a Railway → kartotekaweb-production → Variables panelen, mi a `GOD_MODE_PIN` értéke.
2. Ha még a régi: rotáld 8+ jegyű random értékre, írd be Railway-re és a helyi `.env.local`-be is.
3. Ellenőrizd, ki használta utoljára god-mode-ot (`audit_log` `event_type = 'god_mode_activate'`).

### P0-5. Valódi anon-key + project_ref dokumentációban commitálva

**Fájlok**:
- [migration-docs/source-links/supabase_config.js:4](migration-docs/source-links/supabase_config.js#L4)
- [docs/project-tracking/KARTOTEKA-standalone-production-deployment.md:200](docs/project-tracking/KARTOTEKA-standalone-production-deployment.md#L200)

**Lelet**: a publikus Supabase project_ref (`bjytiawckbibqmtlezfl`) és a valódi anon-key trackelt fájlokban szerepel. Az anon-key per-design publikus, **de** a project_ref is azonosítja a projektet — direkt `https://bjytiawckbibqmtlezfl.supabase.co` támadás-felület.
**Teendő**: a két fájl tartalmát maszkold (`SUPABASE_URL=https://<your-project>.supabase.co`, `ANON_KEY=<from-env>`). A history-ban marad, de új commitokba ne kerüljön.

---

## 🟠 MAGAS (P1) — funkcionális hibák, deprecated kód még a bundle-ben

### P1-1. Csendes hibaelnyelés a `anyakonyv/actions.ts`-ben

**Fájlok**: [apps/web/app/(dashboard)/anyakonyv/actions.ts:595](apps/web/app/(dashboard)/anyakonyv/actions.ts#L595), [:706](apps/web/app/(dashboard)/anyakonyv/actions.ts#L706)
**Lelet**: `try { await supabase.from('munkanaplo').insert(…) } catch {}` — a munkanaplo log csendben elnyeli a hibát. Egy lelkész nem kap visszajelzést, ha a munkanapló-bejegyzés nem sikerült.
**Sérti**: `feedback_lelkesz_informalas.md` (nincs néma hiba).
**Teendő**: cseréld `console.warn(…)` + telemetry-event-re, vagy nyomd vissza a hibát, hogy a hívó döntse el.

### P1-2. „HIBÁS KÖNYVELÉSI LOGIKA" még a bundle-ben

**Fájl**: [apps/web/app/(dashboard)/penzugy/bank-nyito-egyenleg-actions.ts:351,366,382](apps/web/app/(dashboard)/penzugy/bank-nyito-egyenleg-actions.ts#L351)
**Lelet**: `previewFxAtYearStart` függvény `@deprecated`-ként megjelölve, kommentár szerint „HIBÁS KÖNYVELÉSI LOGIKA — ne használd!". Még a build-ben, importálható.
**Teendő**: töröld a függvényt és minden hivatkozást. Ha valamelyik kliens még használja, az pénzügyileg hibás eredményt ad.

### P1-3. `dangerouslySetInnerHTML` sanitize nélkül 3 helyen

| Fájl | Sor | Tartalom forrása | Kockázat |
|---|---|---|---|
| `apps/web/components/ai/ai-chat-widget.tsx` | 240 | `mdToHtml()` saját renderer + `escapeHtml` | KÖZEPES (a user-input escape-elt) |
| `apps/web/components/auth/terms-dialog.tsx` | 48 | `content || defaultContent` (statikus, de nincs sanitize) | MAGAS, ha valaha admin szerkeszti |
| `apps/web/components/filing/filing-template-generator.tsx` | 220 | admin sablon + felhasználó értékek | MAGAS — sablon-szerkesztő injektelhet |

**Teendő**: mindhárom helyen `sanitizeHtml()` a már létező [`apps/web/lib/public-site/sanitize.ts`](apps/web/lib/public-site/sanitize.ts) helper-rel.

### P1-4. Tauri CSP null

**Fájl**: [apps/desktop/src-tauri/tauri.conf.json:25](apps/desktop/src-tauri/tauri.conf.json#L25)
**Lelet**: `"csp": null`. A Tauri 2 ablak CSP nélkül fut → minden inline script/style + remote `<script>` engedélyezett. Az M1 (innerHTML) önmagában low-impact lenne CSP-vel.
**Teendő**: szigorú CSP, pl.:
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co"
```
Tesztelés: Tauri dev mode-ban + release-build-en is.

### P1-5. Service-role kliens user-input alapján a `welcome/actions.ts`-ben

**Fájl**: [apps/web/app/(setup)/welcome/actions.ts:411-431](apps/web/app/(setup)/welcome/actions.ts#L411-L431)
**Lelet**: `completeWizard()` service-role klienssel ír profilba/congregationsbe. Guard: csak `auth.getUser()`. A `wizard_progress.data` JSON-ban a user bármit elhelyezhet — a wizard-payload runtime-validátora hiányzik.
**Teendő**: Zod-séma a `WizardData`-hoz, `parse()` a service-role írás előtt.

### P1-6. `notifications/actions.ts` szerepkör-független approve/deny

**Fájl**: [apps/web/app/(dashboard)/notifications/actions.ts:11-60](apps/web/app/(dashboard)/notifications/actions.ts#L11-L60)
**Lelet**: `approveAdminAccess` / `denyAdminAccess` csak az `userId + congId` egyezést ellenőrzi. Egy bejelentkezett, nem-lelkész user is jóváhagyhat admin-override request-et a saját gyülekezetében.
**Teendő**: kösd `lelkesz` / `egyhazmegyei_admin` / `esperes` szerepkörhöz a `requireAdminAccess()` mintán.

### P1-7. `delegated-import/actions.ts` rate-limit + audit-log hiánya

**Fájl**: [apps/web/app/(dashboard)/delegated-import/actions.ts:37,110-144](apps/web/app/(dashboard)/delegated-import/actions.ts#L37)
**Lelet**: `activateDelegatedImport(moduleKey, pin)` PIN-validáció után 2 órás cookie. Brute-force PIN-aktiválás ellen nincs rate-limit; nincs audit-log a sikeres aktiválásra.
**Teendő**: `audit_log`-ba rögzíteni minden hívást (siker/sikertelen + IP), 5 sikertelen PIN után 10 perc cooldown.

### P1-8. Pénzügyi járulék-kategória felismerés hiányzik

**Fájl**: [apps/web/app/(dashboard)/penzugy/finalization-actions.ts:227](apps/web/app/(dashboard)/penzugy/finalization-actions.ts#L227)
**Lelet**: `// TODO: a befizetescel → szamadasicel.kod === '101.01' join kellene` + `isJarulekCategory = false` hardcoded. A finalizáció-flow nem ismeri fel, hogy egy befizetés egyházfenntartói járulék-e. Ez funkcionális gap.
**Teendő**: implementáld a join-t a `befizetescel` → `szamadasicel` táblára, és állítsd be `isJarulekCategory`-t.

---

## 🟡 KÖZEPES (P2) — kódminőség, paritás, dokumentáció

### P2-1. Lint: 77 error + 76 warning a webben

**Parancs**: `npm run lint --workspace=@kartoteka/web` → exit code 1.
**Bontás**:
- ~70 `react/no-unescaped-entities` — szabad idézőjel/aposztróf JSX-ben (kozmetikai)
- 1 `react-hooks/set-state-in-effect` — [apps/web/components/members/validation-errors-tab.tsx:125](apps/web/components/members/validation-errors-tab.tsx#L125): `useEffect(() => { if (open) setReason('') }, [open])` — kaszkádoló render
- ~30 unused-imports / unused-vars
- ~10 `@next/next/no-img-element` (publikus oldal + dialog logók)

**Teendő**: 1) az érdemi `set-state-in-effect` hibát átírni `useMemo`-ra vagy `key` propra; 2) a többi error-t `npx eslint --fix`-szel rendezni; 3) a publikus oldal `<img>` → `next/image` migráció külön sprintben.

### P2-2. `OblioEllenorzesTab` shared komponens 7 console.* hívást tartalmaz

**Fájl**: [packages/ui-app/src/finance/oblio/OblioEllenorzesTab.tsx](packages/ui-app/src/finance/oblio/OblioEllenorzesTab.tsx)
**Lelet**: a shared bundle-be kerül (web prod + desktop) 7 debug `console.*` hívás. Csendes log-zaj.
**Teendő**: cseréld `if (DEBUG) console.log(…)`-ra vagy egy `createLogger('oblio')` shimre.

### P2-3. 9 deprecated re-export shim a webes Oblio lib-ben

**Mappa**: [apps/web/lib/finance/oblio/](apps/web/lib/finance/oblio/) (9 fájl)
**Lelet**: mind csak `export * from '@kartoteka/ui-app/finance/oblio/...'` — v0.7.7 / 2026-04-26 backward-compat shimek. Funkcionálisan halottak.
**Teendő**: grep `import .* from '@/lib/finance/oblio'` → ha minden hivatkozást átírtál a `@kartoteka/ui-app`-ra, töröld a 9 fájlt.

### P2-4. Pénzügy paritás: desktop 0%-ban használja a shared komponenseket

**Lelet**: a `packages/ui-app/src/finance/`-ben **17 shared komponens** (FinanceDashboard, TransactionsTab, BankTab, MonetaryTab, CashbookTab, BudgetTab, AccountingTab, IncomeDialogBody, ExpenseDialogBody stb.) + **18 fájlos Oblio almodul** kész. A desktop 8 pénzügyi oldalának (`apps/desktop/src/pages/`) **egyik se importálja őket** — saját UI-t használnak.
**Hatás**: a `feedback_web_desktop_parity.md` „pixelpontos paritás" elv sérül a pénzügyben.
**Teendő**: tervezz egy desktop-pénzügy migrációs sprintet (chitanta → befizetes → kiadas → bank → dashboard). A web wrapper-mintát kell követni.

### P2-5. Oblio nincs portolva desktopra

**Lelet**: `grep -i oblio apps/desktop/` → 5 puszta megjegyzés-szintű találat, sem UI, sem actions, sem SQLite-mirror (`oblio_*` tábla nincs).
**Teendő**: a memóriában felvett „Oblio e-Factura — Edge Fn — hátra" tétel továbbra is áll. Hosszú-távú fejlesztés.

### P2-6. Hiányzó desktop modulok

| Modul | Web | Desktop | SQLite-mirror | Megjegyzés |
|---|---|---|---|---|
| gyülekezeti programok | ✅ | ❌ (csak placeholder) | ✅ `gyulekezeti_programok_local` | UI felszín hiányzik |
| profil | ✅ | ❌ | — | online-only is lehet |
| értesítések | ✅ | ❌ | — | broadcast-célú |
| kuka | ✅ | ❌ | — | |
| support | ✅ | ❌ | — | |
| publikus oldal admin | ✅ | ❌ | — | online-only |
| admin / kerület / egyházmegye / god-mode / delegated-import | ✅ | ❌ | — | nem desktop-cél |
| **anyakönyv** | ✅ | ✅ READ-ONLY | részben | íráshoz Sprint E |
| oblio | ✅ | ❌ | ❌ | l. P2-5 |

### P2-7. 6 read-only desktop modul nem mutat offline-state UI-t

**Modulok**: anyakonyv, leltar, sirhelyek, iktato, jegyzokonyvek, eves-jelentes
**Lelet**: csak a 4 pénzügyi + dashboard oldal jelzi explicit `WifiOff` / `navigator.onLine`-nal az offline állapotot. A read-only modulok hallgatnak, holott lokális cache-ből szolgálnak ki adatot.
**Sérti**: `feedback_lelkesz_informalas.md` (loading/online-state kötelező).
**Teendő**: minden desktop-oldal tetejére konzisztens `OnlineStatePill` komponens.

### P2-8. PageHero web-oldali használata gyenge

**Lelet**: `apps/web/app/(dashboard)/`-ban csak 1 oldal (notifications/page.tsx) importálja a `PageHero`-t. A többi saját `<h1>` blokkot használ. Desktop ellenben 18-ból 15 oldalon konzisztens.
**Sérti**: `feedback_page_hero_konvenció.md` (új oldalak shared PageHero-t használnak — a régi web oldalakat fokozatosan migrálni).
**Teendő**: web migráció külön sprintben (nem sürgős).

### P2-9. SQL migrációk nincsenek nyilvántartva

**Lelet**: `migration-docs/sql/`-ban 196 fájl, nincs `_RUN_LOG.md` / `applied/` mappa / `_PENDING.md`. Csak Endre memóriájából tudható, mi futott.
**Teendő**: hozz létre egy `migration-docs/sql/_RUN_LOG.md`-t. Formátum:
```
- [x] 2026-05-05 21:30 — 2026-05-05-pastor-service-history-tartozas-mod.sql
- [ ] 2026-05-06-egyhfenntartas-import-dup-index.sql
- [ ] 2026-05-15-legacy-cleanup-drop.sql
```

### P2-10. Pending SQL migrációk (mai napra)

A 2026-05-05 utáni mtime-mel rendelkező migrációk közül vélhetően pending:
- [`2026-05-06-egyhfenntartas-import-dup-index.sql`](migration-docs/sql/2026-05-06-egyhfenntartas-import-dup-index.sql) — partial index, biztonságos
- [`2026-05-15-legacy-cleanup-drop.sql`](migration-docs/sql/2026-05-15-legacy-cleanup-drop.sql) — **mai napra ütemezett** 19 db `DROP TABLE IF EXISTS` az `_ARCHIVE_2026_04_15` táblákra. Jól dokumentált, idempotens, PITR rollback-tervvel. A 04-15-i soft-drop óta 30 nap eltelt. **Futtatás előtt** Studio-ban ellenőrizd a fájl elején lévő verifikációs SELECT-et.
- `2026-05-03-finance-300-01-INSTALL.sql` — 2 INSERT ON CONFLICT, biztonságos (futtatási státusz nem ellenőrizhető a sémából)

**Sorrend**: nem számít, mind független művelet.

### P2-11. SECURITY DEFINER egy függvénynek hiányzik a `SET search_path`

**Fájl**: [migration-docs/sql/2026-04-15-standalone-licenses.sql](migration-docs/sql/2026-04-15-standalone-licenses.sql)
**Lelet**: a `standalone_licenses_updated_at` trigger-funkció `SECURITY DEFINER`, de nincs `SET search_path = pg_catalog, public`. CVE-2018-1058 mitigáció hiánya.
**Teendő**: új migrációval `CREATE OR REPLACE FUNCTION … SET search_path = pg_catalog, public` LANGUAGE plpgsql AS $$…$$;`

### P2-12. RPC-installer migrációk nincsenek tranzakcióban

**Példa**: [`2026-05-04-admin-user-status-rpc.sql`](migration-docs/sql/2026-05-04-admin-user-status-rpc.sql) (6 RPC), `2026-05-03-finance-import-rpc-v2.sql` (2 RPC).
**Lelet**: ha a 3. RPC közben hibázik, az első kettő bent marad — részleges állapot.
**Teendő**: az új installereket csomagold `BEGIN; … COMMIT;`-be.

### P2-13. CHANGELOG `version` mező inkonzisztens

**Lelet**:
- 38/199 bejegyzésnek nincs `version` mezője (a sablon szerint opcionális, de a parser jobban él vele)
- formátum-keveredés: `0.9.54` vs. `v0.9.24 (csak web)` vs. `—`
- **`2026-05-03d`** és **`2026-05-03f`** key-ek azonos név-bázissal (`felhasznalok-szerepkorok-egyesites`) — szuffixxel egyértelműsítendők

**Teendő**: normalizáció (kis script, ami minden bejegyzést átfut).

### P2-14. Web release-notes md hiányosság (v0.9.48 — v0.9.54)

**Lelet**: a CHANGELOG tartalmazza a 7 webes release-t, de a `docs/release-notes-v0.9.48.md` … `v0.9.54.md` fájlok hiányoznak. Az inkonzisztencia abból ered, hogy korábban (v0.9.4 — v0.9.45) sem volt md, majd v0.9.46 + v0.9.47-nél visszatértünk hozzá.
**Teendő**: vagy konvenció szerint web-only release-eknél nem kell md (akkor töröld a v0.9.46/v0.9.47-et), vagy pótold a 7 hiányt + alakítsd ki a szabályt.

---

## 🔵 ALACSONY (P3) — kozmetika, későbbi feladatok

### P3-1. `react`/`react-dom` verzió-pin inkonzisztencia
- web: `19.2.4` (rögzített)
- desktop: `^19.1.0` (caret)
**Teendő**: rögzítsd mindkettőt `19.2.4`-re a determinisztikus build érdekében.

### P3-2. `design-tokens` és `schema-types` package-ek `0.0.0` verzión
A többi shared package `0.1.0`. Kozmetikai inkonzisztencia.

### P3-3. `register/actions.ts` password-min 6 karakter
**Fájl**: [apps/web/app/(auth)/register/actions.ts:57](apps/web/app/(auth)/register/actions.ts#L57)
A `(public)/hozzaferes-kerese` flow 8 karakter min-t kér. Egységesítsd 8-ra.

### P3-4. Mester admin email hardkódolva
**Fájl**: [apps/web/app/(public)/hozzaferes-kerese/contact-actions.ts:13](apps/web/app/(public)/hozzaferes-kerese/contact-actions.ts#L13)
`endreszocs@gmail.com` — env-be (`SUPPORT_EMAIL`) érdemes átrakni.

### P3-5. Race condition: `iktato/saveFilingEntry getNextSequenceNumber`
**Fájl**: [apps/web/app/(dashboard)/iktato/actions.ts:47](apps/web/app/(dashboard)/iktato/actions.ts#L47)
Két párhuzamos hívás ugyanazt a sequence number-t kaphatja. Üzleti integritási kockázat. Megoldás: SECURITY DEFINER RPC `nextval()`-lal vagy advisory lock.

### P3-6. CORS `*` az Edge Function-on
**Fájl**: [supabase/functions/issue-license/index.ts:27](supabase/functions/issue-license/index.ts#L27)
`Access-Control-Allow-Origin: *`. JWT-validáció megvan, gyakorlati kockázat alacsony, de szűkítsd a Railway prod URL-re és `tauri://localhost`-ra.

### P3-7. Email-enumeration potenciális
**Fájl**: [apps/web/app/(public)/hozzaferes-kerese/actions.ts:166-176](apps/web/app/(public)/hozzaferes-kerese/actions.ts#L166-L176)
Explicit „Ez az email-cím már regisztrálva van" üzenet. Rate-limit van (3/24h IP szerint), de érdemes erre a csatornára is figyelni.

### P3-8. Funkcionális TODO-k backlog-ban
- [`packages/ui/src/layout/kartoteka-header.tsx:176`](packages/ui/src/layout/kartoteka-header.tsx#L176) — NotificationBell + ProfileSwitcher integráció
- [`packages/ui-app/src/finance/BankTab.tsx:19`](packages/ui-app/src/finance/BankTab.tsx#L19) + `FinanceSugoChecklist.tsx:16` — iOS UX `window.confirm()` → callback prop
- [`apps/desktop/src/pages/pin-setup-page.tsx:27`](apps/desktop/src/pages/pin-setup-page.tsx#L27) — A-M15 Biztonság fülről PIN újra-beállítás

### P3-9. Production debug-log a webes server actionökben
**Fájlok**: `apps/web/app/(dashboard)/anyakonyv/actions.ts:351`, `apps/web/app/(dashboard)/penzugy/actions.ts:768,792`, `apps/web/components/modals/baptism-dialog.tsx:127,130`
Több `console.log` debug-maradvány, ami productionben Railway logba kerül zajként.

### P3-10. `apps/web/components/minutes/minutes-editor.tsx:21` file-szintű eslint-disable
`/* eslint-disable @typescript-eslint/no-explicit-any */` — felülvizsgálandó, érdemes inline-disable-re bontani.

---

## 📊 Web–desktop paritás táblázat (2026-05-15)

| Modul | Web | Desktop oldal | Shared `ui-app` használat | Offline-state UI |
|---|---|---|---|---|
| home / dashboard | ✅ | ✅ home + dashboard | részben | igen |
| tagnyilvántartás | ✅ | ✅ members-page | igen (PageHero) | nincs |
| család | ✅ | ✅ families-page | igen | nincs |
| munkanapló | ✅ | ✅ munkanaplo-page | igen | nincs |
| pénzügy (8 aloldal) | ✅ | ✅ landing+dashboard+6 | **❌ saját UI** | ✅ 4 oldalon |
| anyakönyv | ✅ | ✅ READ-ONLY | igen | ❌ |
| leltár | ✅ | ✅ leltar-page | igen | ❌ |
| jegyzőkönyvek | ✅ | ✅ jegyzokonyvek + detail | igen | ❌ |
| éves jelentés | ✅ | ✅ eves-jelentes-page | igen | ❌ |
| sírhelyek | ✅ | ✅ sirhelyek-page | igen | ❌ |
| iktató | ✅ | ✅ iktato-page | igen | ❌ |
| missziós műhely | ✅ | ✅ misszios-muhely-page | igen | n/a (online) |
| **gyülekezeti programok** | ✅ | ❌ placeholder | — | — |
| **publikus oldal admin** | ✅ | ❌ | — | online-only |
| **profil** | ✅ | ❌ | — | — |
| **értesítések** | ✅ | ❌ | — | — |
| **kuka** | ✅ | ❌ | — | — |
| **támogatás** | ✅ | ❌ | — | — |
| **Oblio e-Factura** | ✅ | ❌ | — | online-only |
| **bank-import Raiffeisen + BT** | 🟡 részleges | ❌ | — | — |

---

## 📊 Tauri SQLite-mirror táblák állapota

**Megvan** (40 tábla): profiles, congregations, szemely (+pending), csalad, gyerek, keresztseg, konfirmalas, hazassag, temetes, bekoltozott/elkoltozott/attert/kitert, chitantak, chitanta_tombok, chitanta_wallet, befizetes (+pending), kiadas (+pending), iratszam_wallet, munkanaplo, leltar_tetelek, iktato, presbiteri_jegyzokonyvek + 3 al-tábla, sirhely* (4 tábla), gyulekezeti_programok, annual_reports, adrlocality, outbox, settings.

**Hiányzik** (várható következő-fázisok):
- `oblio_*` (számla-cache)
- `koltsegvetes_*` (költségvetés-tételek)
- `bankkivonat_*` (bank-import nyersanyag)
- `berleti_*` (bérleti szerződések)
- `fx_revalvacio` (átértékelés)

---

## 📋 Javasolt következő sprintek

### Azonnali (1-2 nap, biztonság)

1. **P0-1 + P0-2 + P0-5** — Brevo SMTP kulcs + Google client_secret + anon-key dokumentációból. Rotálás + .gitignore + history-rewrite ha kell.
2. **P0-4** — Railway `GOD_MODE_PIN` ellenőrzése + rotálása.
3. **P1-1 + P1-2** — anyakonyv catch + previewFxAtYearStart törlése.
4. **P1-5 + P1-6 + P1-7** — Zod-validáció a wizardban, szerepkör-check a notifications/actions.ts-ben, audit-log + rate-limit a delegated-import-ben.

### Rövid táv (1-2 hét)

5. **P0-3 + P1-4** — Tauri db_execute typed command refaktor + CSP konfiguráció (egy sprint).
6. **P1-3** — `dangerouslySetInnerHTML` 3 helyen sanitize.
7. **P1-8** — járulék-kategória felismerés a finalization flow-ban.
8. **P2-9 + P2-10** — `_RUN_LOG.md` létrehozása, pending SQL migrációk lefuttatása.
9. **P2-1** — lint hibák `eslint --fix`-szel + a valódi `react-hooks/set-state-in-effect` átírása.

### Középtáv (1-2 hónap)

10. **P2-4** — Desktop pénzügy migráció a shared `@kartoteka/ui-app/finance` komponensekre.
11. **P2-7** — `OnlineStatePill` minden read-only desktop oldalra.
12. **P2-6** — desktop modulok pótlása (programs UI, profile, notifications, kuka, support).
13. **P2-2 + P2-3** — Oblio shared cleanup + 9 deprecated shim törlése.

### Hosszú táv (1-2 hónap+)

14. **Oblio desktop-paritás** (P2-5)
15. **Bank-import Raiffeisen + BT parser** desktopra
16. **Anyakönyv íráshoz Sprint E** desktopra
17. **Web → PageHero** migráció (P2-8)

---

## 💬 Hogyan jelents hibát

Ha futás közben hibába ütközöl:

1. **Leírd a szituációt** (melyik menü, milyen művelet)
2. **Képernyőkép** ha van
3. **Developer-console log** — a desktop-on a F12 megnyitja
4. Küldd el a `support@kartoteka.hu`-ra, vagy a webes admin „Támogatás" felületén

A `data_wipe_log` tábla audit-ja a drasztikus törlésekhez is megnézhető.

---

## 🗂 Diagnosztika módszertan (2026-05-15-i futás)

A jelen dokumentumot 5 párhuzamos audit-agent + lokális build/lint generálta:
- **Tech-debt**: TODO/FIXME, console.log, eslint-disable, any, üres catch
- **Biztonsági**: server actions guard, service-role, secrets, RLS, CORS, Tauri command, dangerouslySetInnerHTML, SECURITY DEFINER
- **Verzió/release**: package.json verziók, release-notes md hiányok, CHANGELOG mezők
- **SQL migráció**: 196 fájl naming/idempotencia/SECURITY DEFINER, schema snapshot frissesség, drop-fájl audit
- **Pénzügy/paritás**: shared finance modul, Oblio állapot, web–desktop modul-mátrix, PageHero, offline UI

A következő futáskor érdemes:
- ezt a fájlt a `## 🟢 Build` szakasztól újragenerálni
- a P0-P1 tételeket átsorolni (javítva → archív)
- új P2-P3 tételeket hozzáadni

---

## 🔄 Appendix — Verifikációs audit (2026-05-15, második futás)

Ugyanaznap 5 párhuzamos sanity-check ágens ellenőrizte a fenti táblázatokat. Az utolsó commit `3dd04e98` (2026-05-06 01:26) — **9 napja nincs új commit**, így a P0-P1 állapota lényegében nem változott. Eltérések / új leletek:

### Megerősítve (még áll)
- **P0-1** (Brevo SMTP), **P0-3** (Tauri db_execute), **P0-5** (anon-key + project_ref), **P1-1** (anyakonyv üres catch), **P1-2** (`previewFxAtYearStart`), **P1-3** (`terms-dialog.tsx:48` + `filing-template-generator.tsx:220` sanitize nélkül; `ai-chat-widget.tsx:240` viszont `escapeHtml`-elt — elfogadható), **P1-4** (Tauri CSP null), **P1-5** (`completeWizard` service-role + nincs Zod), **P1-6**, **P1-7**, **P2-2** (7 console.* a `OblioEllenorzesTab`-ban — pontosan 7), **P2-3** (10 deprecated re-export shim a `lib/finance/oblio/`-ban), **P3-9**, **P3-10**.

### Részleges javulás
- **P0-2** (Google `client_secret`): a [`.gitignore:50`](.gitignore#L50) most már fedi → **JAVÍTVA**, csak history-rotáció maradt.
- `.tmp-*/` és `.codex-node_modules/` → gitignore fedi → **JAVÍTVA**.
- **P3-10**: a `minutes-editor.tsx:21` eslint-disable csak 2 sor (`/* eslint-enable */` a 23. soron), nem file-level → súlyosság csökkentve.

### Új tételek (P1/P2)

#### P1-9 [ÚJ]. `egyhfenntartas-import-actions.ts` Zod- és scope-ellenőrzés hiánya
**Fájl**: [apps/web/app/(dashboard)/penzugy/egyhfenntartas-import-actions.ts](apps/web/app/(dashboard)/penzugy/egyhfenntartas-import-actions.ts) (608 sor új, `eb78995c` commit)
**Lelet**: auth-guard van, service-role-t nem használ — de:
- xlsx/xml feltöltésnél nincs MIME-type / max-size check (csak `size === 0`) → DoS-rizikó nagy XML-en.
- `executeEgyhfImport(items)` a kliens-tól érkezett `ExecuteImportItem[]`-et közvetlenül használja (`forrasa`, `osszeg`, `iratszam`, `manualSzemelyId` — semmi Zod). Az `id_szemely` / `id_csalad` sincs RLS-aware vizsgálva → más gyülekezet ID-jét scope-on belül is be tudná írni.
- Rate-limit nincs.
**Teendő**: Zod-séma a `ExecuteImportItem`-re, MIME/size check, és `id_szemely.congregation_id === user.congregation_id` ellenőrzés a RPC-ben.

#### P2-4b [ÚJ]. Új paritás-rés: `egyhfenntartas-import` web-only
**Fájlok**: [apps/web/components/finance/finance-import/egyhfenntartas/](apps/web/components/finance/finance-import/egyhfenntartas/) (wizard + 4 step + 3 helper)
**Lelet**: a teljes új import-wizard a `apps/web/components/`-ba került, nem a `packages/ui-app/src/finance/`-be → desktopra nem portolható shared importtal. Ugyanez a `finance-import/` mappára (penzugy-import-wizard). A megsértett konvenció: új pénzügyi UI-t a shared csomagba kell írni.
**Teendő**: refaktor → `packages/ui-app/src/finance/finance-import/egyhfenntartas/` alá (kompatibilis adapter pattern a web-only IO-hoz: parsers maradhatnak helyileg, csak a UI-réteg menjen át).

#### P2-11b [ÚJ]. SECURITY DEFINER search_path kiterjesztve
A fenti P2-11 egy fájlt nevez meg; valójában **~25 függvény** érintett. Sürgős fájlok (admin/RPC):
- `migration-docs/sql/2026-05-04b-grant-service-role-profiles.sql:19`
- `migration-docs/sql/2026-05-04-admin-user-status-rpc.sql:2,14`
- `migration-docs/sql/2026-05-04c-profile-congregations-rpc.sql:2,15`
- `migration-docs/sql/2026-05-04f-complete-user-onboarding-rpc.sql:79`
- `migration-docs/sql/2026-04-26-family-link-inference-rpc.sql:18`
- `migration-docs/sql/2026-05-02-finance-import-rpc.sql:17`
- `migration-docs/sql/2026-04-12-missziós-muhely-rls.sql:305`
- `migration-docs/sql/2026-04-21-m6-2-rls-audit-full.sql` (6 def)
- `migration-docs/sql/2026-04-24-admin-wipe-congregation-data.sql:18`
- `migration-docs/sql/2026-04-25-a-m7-9a-iratszam-pointers.sql` (4 def)
**Teendő**: egyetlen migrációval pótold a `SET search_path = public, pg_temp` (vagy `''`) sort minden érintett függvényben.

#### P2-13b [ÚJ]. CHANGELOG duplikált címke (újabb)
- `[2026-05-02c]-legal-laikus` és `[2026-05-02c]-legal-dialog` (mindkettő v0.9.23) → ugyanaz a `[2026-05-02c]` címke két különböző bejegyzéshez.
- `[2026-05-03f]-felhasznalok-szerepkorok-egyesites` és `[2026-05-03d]-…` ugyanazzal a slug-gel, mindkettő v0.9.47-re hivatkozik.

#### P3-11 [ÚJ]. 3dd04e98 commit nincs dokumentálva
**Lelet**: a `3dd04e98 fix: 201.1↔201.10 ekvivalencia + 300.01 + cím a candidate-grid-en` (2026-05-06) commit
- NEM szerepel a `CHANGELOG.md`-ban (legutolsó bejegyzés `[2026-05-06b]` v0.9.54),
- a `apps/web/package.json` 0.9.54-en maradt (nem bump-olt 0.9.55-re),
- nincs `docs/release-notes-v0.9.55.md`.
**Teendő**: vagy fűzd a 3dd04e98-at egy korábbi `[2026-05-06b]` bejegyzéshez (kis változás), vagy nyiss új `[2026-05-06c]` címkét és bump-olj 0.9.55-re.

#### Megjegyzés: pending SQL státusz
- A `2026-05-15-legacy-cleanup-drop.sql` (19 `DROP TABLE IF EXISTS`) **nincs `BEGIN; … COMMIT;` wrapperben**. Futtatás előtt manuálisan körbe kell zárni, vagy a fájlt szerkeszteni.
- `2026-05-06-egyhfenntartas-import-dup-index.sql` (partial index) — `CREATE INDEX` self-tx, safe.
- `2026-04-30k-diagnoszt-…sql` és `2026-04-30l-backfill-…sql` (untracked) — diagnosztika + DRY-RUN backfill. Az élő UPDATE blokk kommentben.

### Új schema-elemek (HEAD~5 óta)
- `public.member_transfer_notifications` (elköltözött tag értesítés-tábla)
- `public.member_validation_errors` (tag-validáció)
- `public.pastor_service_history` (lelkész-szolgálati hely lista)
- Több táblán új `egyhazi_szam`, `okirat`, `read_at`, `archived` mezők + `elkoltozott.hova_congregation_id` FK

---

## ✅ Javítás-napló — 2026-05-15 (alacsony-kockázatú futás)

A second-pass audit után az alábbi tételeket javítottam.

### P0-2 → **JAVÍTVA** (gitignore)
`.gitignore` kibővítve: `migration-docs/google.cloud.console/`, `migration-docs/BREVO-SMTP.txt`, `migration-docs/**/*SMTP*`, `migration-docs/**/*SECRET*`, `.tmp-*/`, `.tmp-*.tar`, `.tmp-*.html`, `.tmp-*.unzipped`, `.codex-node_modules`, `.claude/`. Verifikálva: `git check-ignore -v` mind az 5 tesztelt fájlra OK.

### P0-1 → **RÉSZBEN** (csak felület)
A `.gitignore` most már fedi a BREVO-SMTP.txt-t — véletlen `git add` ellen véd. **TEENDŐ Endrének**:
1. Brevo dashboard → API keys → kulcs rotálása
2. Új kulcs CSAK `apps/web/.env.local`-be
3. `git log --all --oneline -- migration-docs/BREVO-SMTP.txt` ellenőrzése — ha valaha committed volt, BFG / `git filter-repo` szükséges
4. Railway env `SMTP_API_KEY` frissítése az új értékkel

### P0-5 → **JAVÍTVA**
- [migration-docs/source-links/supabase_config.js:3-4](migration-docs/source-links/supabase_config.js#L3-L4) — placeholderre cserélve, komment magyarázattal.
- [docs/project-tracking/KARTOTEKA-standalone-production-deployment.md:199-200](docs/project-tracking/KARTOTEKA-standalone-production-deployment.md#L199-L200) — URL és anon-key teljesen placeholderre.
- Megjegyzés: a régi értékek a git history-ban maradnak. Ha kritikus, history-rewrite szükséges.

### P3-9 → **JAVÍTVA**
Mind az 5 debug console.log most `if (process.env.NODE_ENV === 'development')` wrapperben:
- [apps/web/app/(dashboard)/anyakonyv/actions.ts:351-356](apps/web/app/(dashboard)/anyakonyv/actions.ts#L351-L356)
- [apps/web/app/(dashboard)/penzugy/actions.ts:768-770](apps/web/app/(dashboard)/penzugy/actions.ts#L768-L770)
- [apps/web/app/(dashboard)/penzugy/actions.ts:792-794](apps/web/app/(dashboard)/penzugy/actions.ts#L792-L794)
- [apps/web/components/modals/baptism-dialog.tsx:127-131](apps/web/components/modals/baptism-dialog.tsx#L127-L131)
- [apps/web/components/modals/baptism-dialog.tsx:132-134](apps/web/components/modals/baptism-dialog.tsx#L132-L134)

Lint-státusz változatlan: 153 problems (77 errors, 76 warnings) — nem hoztam új error-t.

### P3-10 → **TISZTÁZVA**
A `apps/web/components/minutes/minutes-editor.tsx:21-23` `/* eslint-disable */` … `/* eslint-enable */` valójában csak 2 sort fed (`type SpeechRecognitionType = any` a 22. soron). Megfelelően szűk hatókör, nem file-level. **Nincs teendő.**

### Maradék P0 — kézi (Endrenek)

**Endre döntése (2026-05-17)**: a Brevo / Google Cloud / GOD_MODE_PIN rotációkat **NEM kezeljük most**. Az alábbiak _javaslatok_, nem kötelező teendők:

- **P0-1** Brevo kulcs rotáció — később, ha indokolt (a `.gitignore` már fedi a fájlt → új véletlen leak ellen védve)
- **P0-2** Google Cloud `client_secret` rotáció — később, ha indokolt
- **P0-4** `GOD_MODE_PIN` változtatása — javasolt, hogy az admin oldalon (a megfelelő helyén) rendszeresen frissüljön; ne legyen automatikus rotáció
- **P0-3** Tauri `db_execute`/`db_select` typed refaktor (Sprint méretű feladat — kézi sprint döntésen)

---

## ✅ Második javítás-batch — 2026-05-15 (P1 funkcionális)

A P0/P3 alacsony-kockázatú futás után a következő P1-eket vettem át (mind „minden változtatás előtt mutasd a tervet" módban):

### P1-1 → **JAVÍTVA** — commit `4e751ce4`
Csendes `catch {}` 3 helyen az `apps/web/app/(dashboard)/anyakonyv/actions.ts`-ben → `catch (error) { console.warn(...) }`-ra cserélve. Az anyakönyvi mentés (keresztelő/temetés/konfirmáció) sikerét továbbra is NEM blokkolja a munkanaplo-insert hiba (helyes minta), de a Railway logban most már látszik, ha a munkanaplo-log kimaradt. A saveBurial szemely.meghalt catch-hez (sor 610) nem nyúltam — ott a komment indokolja a szándékos néma viselkedést.

### P1-2 → **JAVÍTVA** — commit `f2b1e674`
A `previewFxAtYearStart`, `applyFxAtYearStart`, `FxYearStartPreview` és a `_legacyApplyFxAtYearStartRemoved` belső helper (172 sor) törölve a `bank-nyito-egyenleg-actions.ts`-ből. A január 1-i FX könyvelés könyvelésileg hibás volt — a helyes út a december 31-i FX revaluation (`FxRevaluationDialog`). Külső hivatkozás: 0 (grep verifikálva). Plus: 2 unused-import lint-warningot is megszüntetett.

### P1-6 → **JAVÍTVA** — commit `1a4eefc4`
Új `canManageAdminAccessRequest(role, esperes)` helper a `notifications/actions.ts`-ben. A `approveAdminAccess` és `denyAdminAccess` mostantól csak akkor megy át, ha a hívó `role === 'lelkesz'` VAGY `esperes` flag (ami magában foglalja az egyhazmegyei_admin / egyhazkeruleti_admin / admin / master szerepköröket). Egy konyvelo, szamvevo vagy „custom" szerepkörű user már nem hagyhat jóvá admin-override kérelmet a saját gyülekezetében.

### Lint-állapot (e javítások után)
- 151 problems (77 errors, 74 warnings) — a P1-2 törlése után 2 warninggal kevesebb
- Build és typecheck: nem rontottam

### Maradék P1 (még nyitva)
- **P1-4** Tauri CSP — DESKTOP-teszt kell, óvatosan
- **P1-8** járulék-kategória felismerés a finalization flow-ban

### Maradék P2 (még nyitva)
- **P2-3** Oblio shim refaktor (Sprint-méretű — 10 SHIM + 4 LIVE + 6 alkalmazás-szintű hivatkozás migrálása)
- **P2-4** desktop pénzügy migráció a shared finance modulokra (17 komponens)
- **P2-1** lint 77 error rendezése (főleg react/no-unescaped-entities — nem auto-fixable)
- **P2-7** OnlineStatePill minden read-only desktop oldalra
- **P2-14** 7 hiányzó release-notes md (v0.9.{48..54})

### Maradék P3 (még nyitva)
- **P3-5** iktato race condition (`getNextSequenceNumber` → SECURITY DEFINER RPC nextval vagy advisory lock)
- **P3-8** UI TODO-k (NotificationBell+ProfileSwitcher integráció, iOS `window.confirm` callback, PIN újra-beállítás A-M15)

---

## ✅ Harmadik javítás-batch — 2026-05-15 (P1-3a + P1-9)

### P1-3a → **JAVÍTVA** — commit `4ad50360`
A `terms-dialog.tsx` `dangerouslySetInnerHTML`-jét a meglévő `sanitizeAboutHtml()` helper-rel burkoltam. A statikus `defaultContent` és a fetch-elt `/felhasznaloi-feltetelek-content` HTML egyaránt átmegy. P1-3b (filing-template-generator) külön sprintbe halasztva — egyedi sanitizeFilingHtml helper kell, mert a sablonok inline style + div tageket használnak.

### P1-9 → **JAVÍTVA** — commit `97d95607`
Az új `egyhfenntartas-import-actions.ts`-be 3 alág került be:
- **P1-9a**: Zod-séma `finalRowSchema` + `executeImportItemSchema` + `importBatchSchema` (max 10 000 sor, év 2000-2100, összeg max 1 mrd RON, regex YYYY-MM-DD a dátumra, etc.). `safeParse()` hibájára korai error-return.
- **P1-9b**: MIME-type whitelist (`ACCEPTED_XLSX_MIMES`, `ACCEPTED_XML_MIMES`) + max 50 MB méret-check a `parseAndPreviewEgyhf` upload-jában.
- **P1-9c**: RLS-aware batch-check — minden hivatkozott `szemely.id` és `csalad.id` egyetlen `IN (...) AND congregation_id = own` query-vel verifikálva. Nem-saját ID esetén az összerendelés NULL-lá lesz, a tétel mentve marad, a `skippedReason` magyaráz.

Verifikáció:
- npx eslint: csak 2 már-létező unused-import warning, 0 új hiba
- Teljes lint: 151 problems (változatlan)
- Funkcionális hatás: sikeres importok ugyanúgy mennek át, hibás kliens-payload most korai hibajelzést kap

### Lint-állapot (e batch után)
- Web: 151 problems (77 errors, 74 warnings) — változatlan a P1-2 utáni állapothoz

---

## ✅ Negyedik javítás-batch — 2026-05-16 (P1-5 + P1-7)

### P1-5 → **JAVÍTVA** — commit `f41fdb72`
Zod-séma a `wizard_progress.data` runtime validációjához. Új `wizardDataSchema` az 8 Wizard*Slot-ra (congregation, bankAccounts, pastor, serviceHistory, finance, discountPeriods, ageDiscount, pastYears). Strict type + range + max-length + regex (`YYYY-MM-DD`/`MM-DD`), array-szintű korlátok (DoS-védelem), Zod default `.strip` mode kidobja az ismeretlen kulcsokat. A `completeWizard` mostantól `safeParse(progress.data)`-val parse-eli, az `as WizardData` cast helyett a parsed adatból dolgozik. Hiba esetén részletes magyar hibajelzés a mezőnévvel — mielőtt bármilyen service-role írás történne.

### P1-7 → **JAVÍTVA** — commit `0233a018`
A `delegated-import/actions.ts` `activateDelegatedImport` mostantól:
- **Audit-log**: 3 új event-típus (`delegated_import_activate_success` + 2 alesetes `_failed`: `invalid_format` és `wrong_pin`) a `logAuditEvent` helper-en keresztül.
- **Rate-limit**: új `checkActivationRateLimit(userId)` helper olvassa az `audit_log` táblát service-role klienssel — max 5 failed attempt / 10 perc / user. Cooldown esetén X perc retry-after üzenet a usernek. Ha service-role nincs konfigurálva (dev mode), nem blokkolunk.
- **Brute-force védelem**: 10^6 PIN-tér + max 30 attempt/óra → gyakorlatban ~3.8 év a teljes téren át.

### Lint-állapot (e batch után)
- Web: 151 problems (77 errors, 74 warnings) — változatlan

---

## ✅ Ötödik javítás-batch — 2026-05-17 (P3 csomag + P1-3b, P2-3 halasztva)

### P2-3 → **HALASZTVA** (Sprint-méretű)
A `apps/web/lib/finance/oblio/` mappában 10 SHIM és 4 LIVE fájl van. A LIVE fájlok (`oblio-auth.ts`, `oblio-client.ts`, `oblio-folder.ts`, `oblio-invoice-builder.ts`) IMPORT-olnak a shim-ekből (`oblio-types`, `oblio-errors`), és 6 alkalmazás-szintű fájl is hivatkozik shim-ekre. A törlés Sprint-méretű migráció: minden hivatkozást át kell írni `@kartoteka/ui-app`-ra.

### P3-1, P3-2, P3-3, P3-4 → **JAVÍTVA** — commit `d96ab76e`
- **P3-1**: `apps/desktop/package.json` react/react-dom `^19.1.0` → `19.2.4` (pinned, egységes a webbel)
- **P3-2**: `packages/design-tokens` és `packages/schema-types` `0.0.0` → `0.1.0`
- **P3-3**: `apps/web/lib/validations/auth.ts` registerSchema password `min(6)` → `min(8)`
- **P3-4**: `apps/web/app/(public)/hozzaferes-kerese/contact-actions.ts` `SYSADMIN_EMAIL`/`SYSADMIN_NAME` env-fallback

### P2-2 → **JAVÍTVA** — commit `4f915a6c`
A `packages/ui-app/src/finance/oblio/OblioEllenorzesTab.tsx` 7 `console.*` hívásából a 3 debug `console.log` (sor 656, 910, 936) most `NODE_ENV === 'development'` wrapperben. A 4 `console.warn` (valódi hibajelzések — XML parse, duplikátum-cleanup, átnevezés) megőrizve. Shared bundle (web + desktop) most már nem szennyezi a prod konzolt.

### P2-11 → **JAVÍTVA** — commit `8e98bb24` + **production-audit utáni javítás** (lásd lent)
Új migráció: [`migration-docs/sql/2026-05-17-security-definer-search-path-pin.sql`](migration-docs/sql/2026-05-17-security-definer-search-path-pin.sql). 17 SECURITY DEFINER függvény `ALTER FUNCTION ... SET search_path = public, pg_temp`-re (a `pg_temp` LAST helyre kerül → CVE-2018-1058 osztály támadás-felület megszüntetve). BEGIN/COMMIT-be csomagolva (P2-12 betartva), idempotens, verifikációs SELECT a végén.

**Production-audit (2026-05-17 Supabase Studio SELECT)**: az eredeti migráció 19 függvényre céloz volt, de a productionben csak 17 létezik. A 2 hiányzó (`issue_license`, `revoke_license`) a `2026-04-15-standalone-licenses.sql` migrációból származna, de az még nem futott (a Tauri standalone licensz-flow nincs élesben). Az első próbafutás `42883: function does not exist` hibára futott, a tranzakció rollback-elt. A migráció szerkesztve — az `issue_license` és `revoke_license` ALTER-ek kivéve (komment a fájlban + `_RUN_LOG.md`-ben). Új futás hibamentes lesz.

### P3-6 → **JAVÍTVA** — commit `8e98bb24`
A `supabase/functions/issue-license/index.ts` CORS-konfigurációja most explicit `ALLOWED_ORIGINS` whitelist (`kartotekaweb-production.up.railway.app`, `tauri://localhost`, `localhost:3000`, `localhost:5173`) — wildcard `*` helyett. Új `corsHeadersForRequest(req)` helper origin-szerinti reflection-rel + `Vary: Origin` header.

### P3-11 → **JAVÍTVA** — commit `8e98bb24`
A `3dd04e98` commit dokumentálva a `docs/CHANGELOG.md`-ban új bejegyzéssel: `[2026-05-06c] — 201.1↔201.10 ekvivalencia + 300.01 belső mozgás kód + cím a candidate-grid-en`. A web verzió 0.9.54-en marad (bugfix, nem új feature).

### P2-9 + P2-10 → **JAVÍTVA** — commit `afd08c63`
Új fájl: [`migration-docs/sql/_RUN_LOG.md`](migration-docs/sql/_RUN_LOG.md). Struktúra: konvenció (`[x]`/`[ ]`/`[?]`), PENDING szakasz (5 fájl prioritás+indok+megjegyzés), LEFUTOTT szakasz csoportosítva sprintekenként (2026-04-09 — 2026-05-05), hibajavítás-szakasz későbbi PITR-rollbackek számára. A 197+ teljes lista lekérdezhető Supabase Studio-ban: `SELECT version, name, executed_at FROM supabase_migrations.schema_migrations`.

### P2-13 → **RÉSZBEN JAVÍTVA** — commit `afd08c63`
A `[2026-05-02c]` címke valódi duplikátuma javítva: a sor 2307-en lévő "felülről eltolva" placeholder header eltávolítva, helyette a korrekt `[2026-05-02d] — Sidebar click-elhetetlen overlay javítva (v0.9.24)` header. A 2349-en lévő igazi `[2026-05-02c] — Legal-dialog` változatlan. **Tisztázás**: a `[2026-05-03d]` vs `[2026-05-03f]` esetében az eredeti audit téves volt — ezek KÜLÖNBÖZŐ key-ek (csak a slug-suffix azonos), nem konfliktus. A 38 hiányzó `version:` mező és a 7 hiányzó release-notes md (P2-14) továbbra is nyitva.

### P3-7 → **NEM JAVÍTJUK** (design-döntés)
A `hozzaferes-kerese/actions.ts:158-176` email-enumeration kockázat egy **tudatos UX-kompromisszum**, amit a kódban kommentár részletesen indokol (`2026-05-02 (v0.9.43) — Felhasználó kérése...`). A rate-limit megvan (3 kérelem / IP / 24h), és belső gyülekezeti rendszerben az email-enumeration kockázata alacsony — a UX (átirányítás Belépés/Elfelejtett-jelszó oldalra) fontosabb. Lezárva.

### P1-3b → **JAVÍTVA** — commit `df31ec4e`
Új `sanitizeFilingHtml()` helper a `lib/public-site/sanitize.ts`-be:
- 25+ tag whitelist (div, span, p, b, br, ul/ol/li, h1-h6, table-stack, blockquote, …)
- Inline `style` engedélyezve 40+ property-re (padding, margin, font-*, text-*, line-height, display, flex-*, color, border-*)
- Style-érték regex `/^[^;<>]+$/` kizárja a többes-property csempészést
- URL scheme `https + mailto`, img-re `data` is
- `javascript:` URL, `<script>`, `<iframe>`, inline event handlers auto-kiszűrve
A `filing-template-generator.tsx` mostantól `sanitizeFilingHtml(renderTemplate(...))`-en keresztül rendereli a sablonokat. A 4 default sablon tag-jei és style-property-jei ellenőrizve — mind a whitelisten.

### Lint-állapot (e batch után)
- Web: 151 problems (77 errors, 74 warnings) — változatlan
