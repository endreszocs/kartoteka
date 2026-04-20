# Forrás rendszer symlink-ek

Symlink-ek a Vanilla JS forrás rendszer fájlaihoz.
Forrás: `D:\Egyházi APP Vanilla JS\project\`

## JS modulok (pages/js/)

### Pénzügy (16 fájl)
- `penzugy_init.js` — inicializálás, beállítások
- `penzugy_income.js` — bevétel kezelés
- `penzugy_expense.js` — kiadás kezelés
- `penzugy_bank_api.js` — kassza + bank motor
- `penzugy_budget.js` — költségvetés
- `penzugy_accounting.js` — számadás
- `penzugy_belsomozgas.js` — belső mozgás (kassza↔bank)
- `penzugy_transactions.js` — tranzakciók listázás
- `penzugy_audit.js` — párosítatlan befizetések
- `penzugy_print_engine.js` — nyomtatás motor
- `penzugy_print_budget.js` — költségvetés PDF
- `penzugy_print_accounting.js` — számadás PDF
- `penzugy_unified_modal.js` — egységes bevétel/kiadás modal
- `penzugy_tartozasok.js` — tartozások
- `penzugy_monetary.js` — monetár

### Tagnyilvántartás (6 fájl)
- `member_api.js` — személy CRUD
- `csalad_api.js` — család CRUD + kartoték
- `presbiter_korzet_api.js` — presbiterek + körzetek
- `mass_import_api.js` — tömeges import
- `lookup_api.js` — keresés
- `sync_api.js` — szinkronizálás

### Anyakönyv + Egyéb modulok
- `anyakonyv_api.js` — anyakönyv (8 típus)
- `worklog_api.js` — munkanapló
- `leltar.js` — leltár
- `leltar_print_jelentes.js` — leltár nyomtatás
- `iktato_api.js` — iktatás
- `sirhely_api.js` — sírhelyek

### Missziós Műhely (5 fájl)
- `misszios_muhely_api.js` — fő API
- `misszios_muhely_otletek.js` — ötletek + szavazás
- `misszios_muhely_gamification.js` — gamifikáció
- `misszios_muhely_sziget.js` — sziget missziók
- `r2_config.js` — Cloudflare R2 konfig

### Admin + AI + Dashboard
- `admin_api.js` — admin panel
- `superadmin_import_api.js` — tömeges import
- `dashboard_api.js` — irányítópult
- `ai_chat.js` — Aladár AI chat
- `ai_config.js` — AI szolgáltató konfig
- `notifications.js` — értesítések

### Core + Offline (10 fájl)
- `auth_roles.js` — szerepkör kezelés
- `supabase_config.js` — Supabase init
- `session_cache.js` — session cache
- `congregation_api.js` — gyülekezet API
- `offline_db.js` — IndexedDB
- `offline_sync.js` — offline szinkron
- `data_cache.js` — adat cache
- `smart_query.js` — smart query wrapper
- `lazy_libs.js` — lazy loading
- `component_cache.js` — komponens cache

## HTML oldalak (html/)
- `dashboard.html`, `tagnyilvantartas.html`, `csaladok.html`
- `penzugy.html`, `anyakonyv.html`, `munkanaplo.html`
- `leltar.html`, `iktato.html`, `sirhelyek.html`
- `misszios_muhely.html`, `admin.html`, `index_login.html`

## Konfig fájlok
- `Database_schema.sql` — teljes adatbázis séma
- `sw.js` — Service Worker
- `manifest.json` — PWA manifest
- `build.js` — build script
- `capacitor.config.json` — Capacitor konfig
