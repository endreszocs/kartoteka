# Kartotéka — teljes adatlánc-átvilágítás

**Készült:** 2026-08-15 · **Kérte:** Endre („végezz teljes ellenőrzést az eddig elvégzett és a még megoldásra váró feladatokról… mindenhol menj végig az adatláncon").

**Módszer:** 10 párhuzamos vizsgáló ágens modulonként (pénzügy, tagnyilvántartás/anyakönyv, törlés-kuka, leltár + munkanapló/jelentés, jogosultság/RLS/2FA, mentés-visszaállítás, beállítás-láncok, desktop-paritás, sötét mód/mobil, terv-dokumentum ⇄ kód), majd **minden egyes megállapításra egy független cáfoló ágens** (adverzariális ellenőrzés), végül teljesség-kritika. Összesen **41 ágens**.

**Eredmény:** 33 megállapítás — **5 kritikus**, **22 magas**, **6 közepes**. A cáfoló kör egyet sem döntött meg.

> A megállapítások a **kód tényleges olvasásából** származnak, nem a dokumentációból — a vizsgálók kifejezett utasítása volt, hogy a `docs/` állításait ne fogadják el bizonyítéknak. Mindegyikhez tartozik pontos fájl:sor és végigjátszható forgatókönyv.

**Már javítva** (a jelentés készítése közben, külön PR-ekben): a napló-függvény biztonsági visszalépése, a De.2/Du.2 menthetetlensége, a `gyerek` tábla 2FA-védelme, és a korábbi évek járulékának hatástalansága.

---

## ⛔ KRITIKUS

### 1. A tétel-törlés (soft delete) megkerüli a számadás-zárat — sem app-, sem RLS-szinten nincs kapu

**Hol:** `apps/web/app/(dashboard)/penzugy/actions.ts:2187` · *res*

**Mi a baj:** A `deleted=true` az EGYETLEN írási út, amely nem olvassa a `bealitas.accounting_finalized`-et: sem a webes `deleteTransaction`, sem a core `softDeleteIncomeUseCase`/`softDeleteExpenseUseCase`/`softDeleteInternalTransferUseCase` — miközben a create (year-lock.ts assertYearsNotFinalizedForCreate), a szerkesztés (update-transaction.ts:222) és a stornó (edit-storno-actions.ts:342, core storno.ts:130) mind fail-closed módon zár, és DB-oldali backstop sincs (a RESTRICTIVE zár-policy csak a `koltsegvetes` táblára készült, migration-docs/sql/2026-07-10-koltsegvetes-zar-rls.sql).

**Mikor jön elő:** A 2026-os számadás véglegesítve és beküldve (accounting_finalized=true, a snapshot az egyházmegyénél). A lelkész a desktop Befizetés oldalán rákattint a Törlés gombra egy 2026-os 500 lejes nyugtán (apps/desktop/src/pages/befizetes-page.tsx:1055 → softDeleteIncomeUseCase, packages/core/src/finance/befizetes/soft-delete.ts:45 — csak egy update({deleted:true})). A sor eltűnik: a kassza-egyenleg, a Registru Casa/Jurnal, a Csoportnapló és a Számadás tény-oszlopa 500 lejjel csökken, a beküldött és aláírt papír viszont változatlan marad. Hibaüzenet nincs. Ugyanez a webről a `deleteTransaction` élő POST-végponton át (belső mozgásnál mindkét oldalt törli, actions.ts:2216–2226).

**Javítási irány:** A storno mintájára fail-closed `readYearFinalized` a törlés elé MINDKÉT rétegben (web deleteTransaction + core befizetes/kiadas/belsomozgas soft-delete), és a koltsegvetes-zár mintájú RESTRICTIVE RLS kiterjesztése a befizetes/kiadas UPDATE-re, hogy a `deleted` flag zárt évben DB-szinten se legyen írható.

### 2. A Railway cron-szkript a RÉGI válaszkontraktusra épül: nulla mentésre „kész"-t jelent, exit 0

**Hol:** `apps/web/scripts/run-backup-worker.mjs:243` · *adatlanc szakadas*

**Mi a baj:** A 2026-08-14-i átállás óta a POST /api/internal/backup 202-vel, `{ok:true, inditva, allapot}` törzzsel válaszol, a szkript viszont még a régi szelet-mezőket (`sikeres`, `hatralevo`, `futottVegig`) olvassa — ezek hiányában `hatralevo = 0`, ezért az első kör után „végigment"-nek nyilvánítja a futást és 0-s kilépési kóddal zöldet jelent.

**Mikor jön elő:** A Railway cron (a docs/project-tracking/KARTOTEKA-mentes-beallitas-utmutato.md 165. sora szerint ez a beállítandó parancs) elindítja a szkriptet. A route 202-t ad → `response.ok` igaz, `payload.ok === true` → átmegy az (1) kapun. `osszSikeres += Number(payload.sikeres || 0)` → 0. `const hatralevo = Number(payload.hatralevo || 0)` → 0. A 243. sor `if (payload.futottVegig === true || hatralevo <= 0)` → `vegigment = true`, `break`. A 319-327. sor kiírja: „[backup-cron] Mentés-futás kész." `sikeres: 0` mellett, `process.exitCode` marad 0. Ha közben a supervisor háttér-ciklusa az előkészítő fázisban elhasal (élesben ez a mai állapot: besorolatlan táblák → `assertInventoryClassified` dob), az a POST VÁLASZA UTÁN történik, tehát a cron-előzményben soha nem jelenik meg — a fájl fejlécében ígért „1-es kilépési kód, ha bármelyik gyülekezet mentése bukott" garancia teljesen inertté vált.

**Javítási irány:** Vagy töröld a szkriptet és a telepítési útmutató 3. részét írd át a .github/workflows/napi-mentes.yml-re (egyetlen igazság-forrás), vagy állítsd át a szkriptet a supervisor-modellre: POST → majd GET /api/internal/backup pollozás `allapot.fut` / `allapot.befejezesOka` alapján, és CSAK `befejezesOka === 'kesz'` esetén exit 0. A `BACKUP_MAX_SZELET` / `BACKUP_WORKER_ENDPOINT` sorokat is javítani kell az útmutatóban.

### 3. Sötét módban ~32 felület FEHÉR marad: a gradiens-színpontok kimaradtak az utility-override listából

**Hol:** `packages/ui/src/utility-overrides.css:74` · *hiba*

**Mi a baj:** Az override-réteg a `.bg-white` osztályt `var(--card)`-ra fordítja, de a `from-white` / `via-white` / `to-white` gradiens-színpontokat (és a `blue-`, `red-`, `zinc-`, `green-` családot) nem — így a gradienses felületek sötét módban fehérek maradnak, miközben ugyanez a fájl a rajtuk lévő `text-slate-600..900` szöveget krémszínűre (`var(--foreground)` = #e8e1d2) fordítja: 1,30:1 kontraszt.

**Mikor jön elő:** Bejelentkezés → fejléc avatár-menü → „Sötét mód” → megnyitom a Gyülekezet-beállítás varázslót (apps/web/components/modals/congregation-setup-wizard.tsx:429 — `bg-gradient-to-br from-white via-white to-teal-50/20`). A dialógus háttere tiszta fehér marad (a background-image gradiens ráfestődik a `bg-popover`-re), a DialogTitle `text-slate-800`-ja viszont #e8e1d2 krém lesz → a „Gyülekezet beállítása” felirat és a teljes űrlap-tartalom eltűnik. Ugyanez: apps/web/app/(setup)/layout.tsx:69 (`from-amber-50 via-white to-teal-50` — a TELJES onboarding oldal), apps/web/app/(dashboard)/dashboard-kerulet/page.tsx:248, apps/web/app/(dashboard)/dashboard-egyhazmegye/page.tsx:207 és 244, apps/web/components/finance/finance-tabs.tsx:359, bank-account-dialog.tsx:554, bcr-import-wizard-dialog.tsx:560, decont-dialog.tsx:39, dispozitie-dialog.tsx:49, diocese-setup-wizard.tsx:348, accounting-finalize-wizard-dialog.tsx:310, a 4 oblio-* dialógus, packages/ui-app/src/finance/BankTab.tsx:725 — összesen 32 fájl. A tisztán színes light hátterek is kimaradtak: bg-blue-50 56×, bg-red-50 99×, bg-zinc-50 25× (pl. apps/web/components/support/support-main.tsx:121 `text-slate-600 bg-blue-50` → krém a #eff6ff-en = 1,15:1).

**Javítási irány:** 1) Az override-fájlba fel kell venni a gradiens-színpontokat (`& .from-white, & .via-white, & .to-white { --tw-gradient-from/via/to: var(--card) }`, a `to-*-50` tinták a meglévő accent-keverékre) és a blue/red/zinc/green/yellow családot a már meglévő minta szerint. 2) Hosszabb távon a 32 gradienses fájlt át kell írni `card-raised` + token-alapú háttérre — minden új hardkódolt osztály újra kilyukasztja a réteget. 3) CI-grep vagy lint-szabály, ami elbukik új `from-white|via-white|to-white|bg-(blue|red|zinc|green)-(50|100)` bevezetésekor.

### 4. De.2/Du.2 jelölés: a DB CHECK constraint elutasítja — a bejegyzés MENTHETETLEN, a hozzá tartozó SQL nem létezik

**Hol:** `apps/web/app/(dashboard)/munkanaplo/actions.ts:152` · *adatlanc szakadas*

**Mi a baj:** A 2026-08-14-i „De.2/Du.2 jelölés" (5e02101d, 18. pont 1. szelet) új 'de2'/'du2' napszak-értékeket vezetett be a UI-ban és a jelentés-logikában, de a `munkanaplo` táblán 2026-07-11 óta élő `munkanaplo_napszak_check CHECK (napszak IN ('de','du','este'))` constraintet EGYETLEN SQL SEM lazítja fel — a commit nem is nyúlt migration-docs/sql-hez.

**Mikor jön elő:** A lelkész a Munkanapló → új bejegyzés ablakban a napszak-listából a „De. 2. — második délelőtti" opciót választja (apps/web/lib/constants/worklog.ts:29-30, desktop worklog-create-dialog.tsx:85) és Mentést nyom. Az `apps/web/app/(dashboard)/munkanaplo/actions.ts:152` a `napszak: 'de2'` értéket közvetlenül a `munkanaplo` táblába írja → Postgres 23514 (check_violation, munkanaplo_napszak_check, definíció: migration-docs/sql/2026-07-11-f1-munkanaplo-oszlopok.sql:58-59). A `worklogSaveError` (actions.ts:21-30) CSAK a 42703/schema-cache hibát fordítja le, így nyers Postgres-üzenet jelenik meg, a bejegyzés elvész. Következmény: a lelkeszi-jelentes-actions.ts:641-643 `napszak === 'de2'` ága SOHA nem fut, tehát a CHANGELOG-ban bejelentett hivatalos összeadó szabály (100+200 → 300) és a rá épülő templomlátogatási százalék halott kód — a rendszer viszont azt állítja, hogy működik. Ráadásul a web a legacy `du` boolean-t hibásan számolja: `du: d.napszak === 'du'` → 'du2'-nél FALSE, míg a desktop (worklog-create-dialog.tsx:301) helyesen `napszak === 'du' || napszak === 'du2'`-t ír — a két felület széthúz, és a repóban létrehozott `napszakDelutani()` helper (lib/constants/worklog.ts:44) SEHOL nincs használva.

**Javítási irány:** Új SQL: `ALTER TABLE munkanaplo DROP CONSTRAINT IF EXISTS munkanaplo_napszak_check; ALTER TABLE munkanaplo ADD CONSTRAINT munkanaplo_napszak_check CHECK (napszak IN ('de','du','este','de2','du2'));` + ellenőrző SELECT. A web `du`-számítását cseréld a meglévő `napszakDelutani(d.napszak)` helperre, és a `worklogSaveError`-ba vedd fel a 23514/check-violation ágat érthető üzenettel.

### 5. A Beállítások „Szinkronizálás most" megkerüli a pénzügyi push-szinkront

**Hol:** `apps/desktop/src/lib/sync.ts:604` · *adatlanc szakadas*

**Mi a baj:** A `processOutbox()` a KÖZÖS `outbox` táblából minden `status='pending'` sort felküld (sync.ts:604-609 → generikus insert 663-666 → `status='sent'` 679), beleértve az offline befizetés/kiadás/nyugta mutation-öket is, amelyeket a dedikált pushereknek kellene kezelniük — így a lokális pending-sor sosem lesz `synced`, és az Excel-várólistába sem kerül be semmi.

**Mikor jön elő:** A lelkész offline rögzít egy készpénzes befizetést (tárcából kapott iratszámmal). Ez a `befizetes_pending_local`-ba és az `outbox`-ba kerül (packages/core/src/finance/befizetes/save.ts:453, `mutation_id` kitöltve, `status='pending'`). Online visszatéréskor a 30 mp-es pusher helyett a fejlécből megnyitja a Beállítások → Adat és biztonság → „Szinkronizálás most" gombot (adat-biztonsag-panel.tsx:106). A `processOutbox` beszúrja a sort a `befizetes` táblába és `status='sent'`-re állítja az outbox-sort. Ettől kezdve: (1) a `getPendingMutations` (tauri-sqlite-backend.ts:297 — csak `status='pending'`) soha többé nem látja, így `markBefizetesSynced` nem fut → a desktop örökre „feltöltésre vár"-t mutat, a sornak nincs `server_id`; (2) az `enqueueEntryExcelRow` csak a pusher siker-ágán fut (befizetes-write-sync.ts:197) → a tétel NÉMÁN kimarad a hivatalos Excel-könyvelésből; (3) ha közben elindul a 30 mp-es poll, mindkét út beszúr → 23505 → a tétel „konfliktus" lesz azzal a félrevezető üzenettel, hogy az iratszám foglalt (kiadásnál unique index nélkül valódi duplikált kiadás keletkezik).

**Javítási irány:** A `processOutbox` SELECT-jébe (sync.ts:607) tegyél `AND mutation_id IS NULL` feltételt — a mutation_id-s sorok kizárólag a dedikált pusherek hatásköre. Egyúttal a „Szinkronizálás most" hívja meg a `runBefizetesSyncManually`/`runKiadasSyncManually`/`runChitantaSyncManually`-t is, hogy a gomb tényleg mindent felküldjön.


## 🔴 MAGAS

### 6. A Kuka „Véglegesen törölve" üzenete a szerver megkérdezése ELŐTT jelenik meg

**Hol:** `apps/web/lib/offline/recycle-bin-actions.ts:193` · *hiba*

**Mi a baj:** A hardDelete() csak beteszi a törlést a mutation-sorba és AZONNAL kiveszi a sort a Dexie-ből, a felület pedig már ekkor „Véglegesen törölve."-t ír — így egy tartósan bukó szerver-oldali DELETE után a sor eltűnik a Kukából, miközben az adatbázisban deleted=true-val tovább él.

**Mikor jön elő:** A lelkész a Kukában egy FK-védett befizetésen (a purge-fájl 165–166. sora „bizonyítottan élő eset"-ként nevezi meg a sirhelyberles.befizetesid → befizetes és a kiadasikiseroiv.id_kiadas → kiadas hivatkozást) megnyomja a „Végleges" gombot. A recycle-bin-view.tsx 220–221. sora await hardDelete() után rögtön toast.success('Véglegesen törölve.')-t hív, pedig a hardDelete csak enqueue-t + dexieTable.delete(id)-t végzett. A push (push.ts:274–282) 30 másodperccel később 23503-mal elbukik, markFailed 5 próba után 'dead'-re állítja, és SEMMI nem hozza vissza a Dexie-sort (discardMutation delete-ága már nem létező kulcsot próbál update-elni → no-op; a delta-pull sem hozza vissza, mert a sor updated_at-ja nem változott, a kurzor viszont elment fölötte). A sor véglegesen kiesik a Kukából, a purge_recycle_bin() pedig ugyanezen FK miatt minden éjjel átugorja (skipped_count) → örökre láthatatlanul benne marad az adatbázisban. Ugyanez tömegesen: az emptyBin a BESOROLT (enqueue-olt) darabszámot adja vissza, és a felület ezt írja ki „N rekord véglegesen törölve"-ként. A push.ts 240–241. sorának kommentje az ellenkezőjét állítja („hangos hibával bukik… nem hazudik sikert") — a felület sosem várja meg a push-t.

**Javítási irány:** A végleges törlés ne optimista Dexie-műveletként fusson: vagy egy szerver-akció végezze el a DELETE-et és a válasza alapján szóljon a felület (RETURNING/.select() sorszámmal, 0 sor = hangos hiba), vagy a Kuka-sor maradjon a listában „törlés folyamatban" állapotban, amíg a mutation vissza nem igazolódik, és dead státusznál kerüljön vissza a kukába hangos hibaüzenettel.

### 7. A végleges törlés árva fájlokat hagy a privát storage-ban (iktató csatolmányok)

**Hol:** `migration-docs/sql/2026-08-14-kuka-deleted-at.sql:211` · *adatlanc szakadas*

**Mi a baj:** Az iktato sor végleges törlése (Kuka „Végleges"/„Ürítés", illetve a napi purge_recycle_bin()) az iktato_csatolmany sorokat ON DELETE CASCADE elviszi, de az „iktato-csatolmanyok" privát bucketben lévő beszkennelt oldalakat senki nem törli — és a storage_path-ot hordozó sor eltűnésével az árva fájl már azonosíthatatlan.

**Mikor jön elő:** Egy iratot befotóznak (csatolmany-actions.ts feltölti a fájlt az 'iktato-csatolmanyok' bucketbe {congregation_id}/{iktato_id}/{uuid}-{fájlnév} úton, és iktato_csatolmany sort ír), majd az iratot törlik (iktato/actions.ts:279 → deleted=true). 30 nap múlva a purge_recycle_bin() lefuttatja a DELETE FROM public.iktato … sort (2026-08-14-kuka-deleted-at.sql:211), az iktato_csatolmany_iktato_id_fkey (2026-07-17-f6-iktato-csomok-csatolmanyok.sql:174–176) ON DELETE CASCADE-je elviszi a metaadat-sort — a fájl viszont bent marad a bucketben, örökre, hivatkozás nélkül. Ugyanez történik a Kuka „Végleges" gombjával (push.ts:274) is. A divergencia bizonyítéka, hogy az alkalmazás SAJÁT csatolmány-törlője (csatolmany-actions.ts:289–355) pont ezt kerüli el: előbb a storage-objektumot törli, létezés-próbával ellenőrzi, és HANGOSAN hibázik + meghagyja a sort, ha a fájl túlélte. A hatás kettős: a bucket korlátlanul hízik takaríthatatlan szeméttel, és a „véglegesen törölt" irat személyes adatot tartalmazó szkennelt oldala tovább él (GDPR).

**Javítási irány:** A végleges törlés elé kell egy takarító lépés, ami a storage-objektumokat is elviszi: vagy szerver-akcióba (service-role) kerüljön a Kuka hard-delete-je és a purge, vagy a purge írjon egy „törlendő objektum-utak" táblát (a CASCADE ELŐTT, BEFORE DELETE triggerrel begyűjtve), amit egy Edge Function / cron ürít a storage-ból. Egyszeri visszamenőleges összevetés is kell: storage.objects ⇄ iktato_csatolmany.storage_path.

### 8. Négy soft-delete tábla a Kukán ÉS a takarításon is kívül esik — a törölt sor sehol nem jön elő

**Hol:** `apps/web/app/(dashboard)/munkanaplo/igeterv-actions.ts:293` · *res*

**Mi a baj:** Az igehirdetesi_terv, kulonleges_alkalom, decont és dispozitie táblákat az alkalmazás soft-delete-eli (deleted=true), de egyikük sincs benne sem a TABLE_REGISTRY-ben (tehát a Kuka SOHA nem listázza őket → nincs visszaállítás és nincs végleges törlés), sem a purge_recycle_bin() 12 táblás tervében, sem a deleted_at-bélyegző trigger tervében.

**Mikor jön elő:** A lelkész a munkanapló felületén töröl egy igehirdetési tervet (deleteSermonPlan → igehirdetesi_terv.deleted=true), vagy visszavon egy különleges alkalom-választ (kulonleges-alkalom-actions.ts:493 → kulonleges_alkalom.deleted=true). A sor eltűnik minden listából. Ezután megnyitja a /kuka oldalt: az csak a TABLE_REGISTRY softDelete:true bejegyzéseiből épül (kuka/page.tsx:24–36), amelyek között e táblák nincsenek — a Kuka „A kuka üres"-t mutat. A teljes kódbázisban egyetlen deleted:false-ra visszaállító út sincs e táblákhoz (a `deleted: false` találatok mind INSERT-payloadok), tehát a törlés visszavonhatatlan; ugyanakkor a purge_recycle_bin() terv-tömbje (2026-08-14-kuka-deleted-at.sql:182–199) sem nevezi meg őket, így a sor soha nem is törlődik ki fizikailag — örökre ott ül az adatbázisban, láthatatlanul. A decont/dispozitie esetében ez pénzügyi bizonylat-sorokat érint (decont-actions.ts:379–380, 426–427; dispozitie-actions.ts:396, 423, 449), amelyek visszagörgetéskor is így „tűnnek el".

**Javítási irány:** Vagy vedd fel a négy táblát a TABLE_REGISTRY-be (softDelete:true, select-lista, recycle-bin-labels címke) ÉS a purge_recycle_bin() + kuka_deleted_at trigger tervébe, vagy — ahol a soft-delete csak technikai visszagörgetés (decont/dispozitie) — cseréld valódi tranzakciós rollbackre. Emellett kell egy őr (selftest vagy SQL-ellenőrzés), amely kiveti azt a táblát, amelynek van `deleted`/`is_deleted` oszlopa, de nincs se Kuka-, se purge-bejegyzése.

### 9. A delegált import PIN-kapuja aláíratlan sütire épül — bármely lelkész megkerüli

**Hol:** `apps/web/app/(dashboard)/delegated-import/guard.ts:101` · *res*

**Mi a baj:** A `delegated_import_<modul>` süti értéke aláíratlan `"<congregationId>|<epoch>"` szöveg (actions.ts:247), a kapuőr pedig ezt nyersen elhiszi, ezért a 6 jegyű PIN, a brute-force korlát és az aktiválási audit-nyom egyetlen kézzel írt sütivel megkerülhető.

**Mikor jön elő:** Egy közönséges lelkész (nem admin) megnézi a saját gyülekezete UUID-ját (bármely oldal forrásában/hálózati válaszában látszik), majd a bejelentkezett munkamenetével POST-ol az `executeBatchImport` szerver-akcióra egy preparált munkafüzettel, és a kéréshez kézzel hozzáadja a `Cookie: delegated_import_members=<saját-cong-uuid>|99999999999999` fejlécet (böngészőből: `document.cookie=...`, mivel aktív delegált munkamenet híján nincs httpOnly süti, amit ez ütközne). A guard.ts:101–107 ága `{ok:true, grant:'delegated'}`-ot ad → tömeges INSERT megy a `szemely` / `befizetes` / `kiadas` / `iktato` / `leltar_tetelek` táblákba PIN nélkül, `delegated_import_activate_success` audit-sor nélkül. Pontosan az a támadás, amit a 2026-08-11 (#16) fejléc-komment lezárni akart.

**Javítási irány:** A süti értékét ugyanúgy HMAC-aláírni, ahogy a god-mode-ét már aláírják: `lib/auth/god-mode-session.ts` mintájára egy `signDelegatedImportCookie(userId, congregationId, moduleKey, expiresAt)` + `verify...` pár, a `parseDelegatedImportCookie` pedig CSAK ellenőrzött aláírás mellett adjon vissza értéket (örökölt, aláíratlan érték = érvénytelen, fail-closed). Az aláírásba a userId is menjen bele, hogy a süti ne legyen átjátszható másik fiókra.

### 10. A log_audit_event DROP+CREATE visszavonja a 2026-08-11-i audit-keményítést (anon is írhat)

**Hol:** `migration-docs/sql/2026-08-15-audit-ip-useragent.sql:29` · *adatlanc szakadas*

**Mi a baj:** A fájl DROP-olja a keményített 5 paraméteres `log_audit_event`-et, és az új 7 paraméteres törzsből kimarad mind a négy védelem (anon fail-closed, action/target hossz-korlát, metadata 8 KB-korlát, 2000 esemény/óra), a DROP-pal együtt pedig elvész a `REVOKE ALL … FROM PUBLIC, anon` is — az új függvény alapértelmezésben PUBLIC EXECUTE.

**Mikor jön elő:** A kliens-bundle-ben nyilvános anon kulccsal bárki POST-ol a `/rest/v1/rpc/log_audit_event` végpontra tetszőleges `p_action` / `p_metadata` értékkel. A törzs SECURITY DEFINER, `auth.uid()` NULL → nem dob (a 2026-08-11-security-definer-hardening.sql:711 `RAISE EXCEPTION` ága eltűnt), tehát `user_id = NULL`-lal beszúr; méret- és óránkénti korlát sincs, így ciklusban futtatva az `audit_log` korlátlanul hízik és a valódi nyomvonal (god_mode_activate_failed, mfa.*, logout) elfullad. Ellenőrzés: `SELECT proacl FROM pg_proc WHERE proname='log_audit_event'` — a 7 paraméteres soron nem lesz `authenticated=X/…`-ra szűkített ACL.

**Javítási irány:** Az új törzsbe visszaemelni a 2026-08-11-es négy őrt (auth.uid() kötelező, 120 karakteres action/target_table, 8192 bájtos metadata, 2000/óra WARNING+NULL), és a COMMIT elé betenni: `REVOKE ALL ON FUNCTION public.log_audit_event(text,text,uuid,jsonb,uuid,text,text) FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated;`. Általános szabály: minden DROP+CREATE után a GRANT/REVOKE-blokkot is meg kell ismételni, és az SQL ellenőrző szakasza kérdezze le a `proacl`-t, ne csak a paraméterszámot.

### 11. Leltári kivezetés: torles_datuma/indoklás soha nem íródik — a korábbi évek leltáríve visszamenőleg megváltozik

**Hol:** `apps/web/app/(dashboard)/leltar/actions.ts:327` · *adatlanc szakadas*

**Mi a baj:** A `deleteInventoryItem` KIZÁRÓLAG az `is_deleted` jelzőt állítja, a séma `torles_datuma` / `torles_bizonylat` / `torles_indoklasa` oszlopait (Database_schema.sql:974–976) az egész repóban SEMMI nem írja (csak olvassa: lib/inventory/reporting.ts:217, 265, 294, 583, 593, 599), így a leltár-riportok törlés-dátum nélküli, „mindig most törölt" adatból dolgoznak.

**Mikor jön elő:** A lelkész 2026-08-15-én kivezet egy 2019-ben beszerzett padot (Törlés gomb → is_deleted=true, torles_datuma marad NULL). (1) Nyomtatja a 2025. évi Leltárívet: `buildLeltarivReport` a `isItemActiveOn(item, 2025-12-31)`-et hívja, ez `isItemDeletedByDate`-en keresztül torles_datuma híján az `item.deleted`-et adja vissza → a pad KIMARAD a 2025-ös ívből is, pedig 2025-ben még megvolt; a már beküldött/aláírt 2025-ös vagyonleltári jelentés többé nem reprodukálható, és a záró darabszám/érték is csökken. (2) Nyomtatja a „Leltárból törölt tárgyak" ívet 2025-re: a `deletedItems` szűrő `item.deleted && year === new Date().getFullYear()` ága miatt a pad csak a FOLYÓ évben jelenik meg, 2025-re üres a lap. (3) Ha a nyomtatási dialógusban időszak-szűrőt ad meg, az `applyInventoryFilters(..., 'deleted')` → `isDateWithinPeriod(null, filters)` false-t ad → MINDEN kivezetett tárgy eltűnik a kivezetési ívről. (4) Ami megjelenik, ott a Dátum oszlop „—", az Indoklás „Nincs részletezve" — a hivatalos kivezetési íven kötelező tartalom hiányzik.

**Javítási irány:** A törlés kapjon kivezetés-dialógust (dátum + igazoló irat + indoklás), és a `deleteInventoryItem` írja a `torles_datuma`/`torles_bizonylat`/`torles_indoklasa` mezőket (dátum hiányában legalább a mai napot). A meglévő, dátum nélkül törölt sorokra egyszeri SQL-lel töltsük fel a `torles_datuma`-t (pl. `updated_at`/`created_at` alapján), különben a régi évek ívei továbbra sem reprodukálhatók.

### 12. Lelkészi jelentés II.8/III.2: a legacy „Ifjúsági bibliaóra (IKE)" / „Ifjúsági óra" néma 0-t ad, pedig a nyomtatott munkanaplón szerepel

**Hol:** `apps/web/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts:694` · *hiba*

**Mi a baj:** A bibliaóra-számlálás a `if (kategoria === 'szolgalat')` őr mögött van, de a `JELENTES_BIBLIAORA_TIPUSOK`-ban felsorolt legacy nevek ('Ifjúsági bibliaóra (IKE)', 'Ifjúsági óra') a LEGACY_WORKLOG_TYPES.katekezis listában élnek (lib/constants/worklog.ts:99), így a `categorizeWorklogEntry` 'katekezis'-t ad rájuk — az őr kizárja őket, holott a kód kommentje (:654–657, :872) kifejezetten azt ígéri, hogy „a legacy nevek is számítanak".

**Mikor jön elő:** Egy gyülekezet importált munkanaplójában 30 sor van 'Ifjúsági óra' jellegével (az official-journal.ts:126–128 kommentje szerint pont ilyen importált sorok léteznek élesben). A hivatalos NYOMTATOTT munkanaplón mind a 30 megjelenik: `isJournalEntry` (official-journal.ts:114–118) kifejezetten átengedi őket, a `classifyForOfficialJournal` a 13. oszlop „Ifjúsági" al-rovatába teszi. A lelkészi jelentésben viszont: III.2 („Ifjúsági bibliaórák (IKE) száma") = 0, a II.8a/II.8b bibliaóra-alkalom és -átlagjelenlét szintén 0-val számol, miközben ugyanez a 30 alkalom a `katekezisDb`-n keresztül BELESZÁMÍT a V.3 („Katekézis-alkalmak") rubrikába — vagyis ugyanaz az esemény rossz fejezetben landol. Nincs `autoHibak` üzenet és nincs null: a lelkész egy aláírt, egyházmegyének beküldött nyomtatványon 0-t jelent, miközben a saját nyomtatott naplója 30-at mutat.

**Javítási irány:** A típusnév-alapú II.8/III.2 számlálást vegyük ki a `kategoria === 'szolgalat'` őr alól (a `JELENTES_BIBLIAORA_TIPUSOK` halmaz maga már elég szűrő), vagy — konzisztensebben — használjuk ugyanazt a predikátumot, amit a nyomtatvány: `isJournalEntry(e)`. Ugyanekkor a legacy ifjúsági sorok ne duplázódjanak a V.3 katekézis-számlálóba.

### 13. Korábbi évi Számadás a FOLYÓ év tartozásaival nyomtatódik (116–134. sor)

**Hol:** `apps/web/components/finance/finance-print-dialog.tsx:301` · *adatlanc szakadas*

**Mi a baj:** A Pénzügyi nyomtatási központ év-választója a tételeket (getYearFinanceRecords) és a költségvetés-sorokat (loadBudgetRowsCompat(year)) évhelyesen tölti újra, de a hivatalos záró blokk adatai (`settings.szamadas_tartozasok`) és a `finalized` flag (finance-print-dialog.tsx:286) a MEGNYITÓ OLDAL évének bealitas-sorából jönnek — pedig a szamadas_tartozasok évenként külön tárolódik (actions.ts:4674–4678, bealitas.id = év).

**Mikor jön elő:** Az oldal 2026-on áll, a 2026-os tartozásoknál 12 000 lej van rögzítve. A nyomtatási központban a lelkész Számadás + 2025 évet választ: a tételek és a terv helyesen 2025-ösek, de a 116–127. Datorii sorokba a 2026-os 12 000 lej kerül, és mivel a 134. Záróegyenleg = 113 − 116 + 128 (budget-reporting.ts:1276–1311), a 2025-ös ív VÉGSŐ egyenlege is 12 000 lejjel hibás. A papír aláírható és beküldhető. (A BudgetPrintDialogBody-ban pont ilyen év-keveredés ellen van yearMismatch blokkoló kapu — itt nincs.)

**Javítási irány:** A szamadas_tartozasok + accounting_finalized a KIVÁLASZTOTT évre töltődjön (év-scope-olt bealitas-lekérés a yearRecords mellé), vagy amíg ez nincs meg, a szamadas típus év-eltérésnél adjon `blocked` előnézetet a BudgetPrintDialogBody yearMismatch mintájára.

### 14. A webes nyugta-duplikátumvédelem lyukas: a szerver nem ellenőriz, a UNIQUE index nem fogja a mai sorokat

**Hol:** `apps/web/app/(dashboard)/penzugy/actions.ts:680` · *res*

**Mi a baj:** Az `insertIncomeRecord` (a webes saveIncome / saveIncomeBatch egyetlen beszúró útja) sem duplikátum-ellenőrzést, sem 23505-kezelést nem tartalmaz — szemben a desktop core saveIncomeUseCase-szel (befizetes/save.ts:283) —, a védelemként hivatkozott partial UNIQUE index pedig `irattipus ILIKE '%észpénz%'`-re szűr (migration-docs/sql/2026-04-25-a-m7-9a-iratszam-pointers.sql:266–271), miközben a mai rögzítő 'Chitanță'/'Factură' értéket ír (CombinedEntryBody.tsx:37 és 870), tehát az index a valóságban egyetlen új nyugtára sem érvényes.

**Mikor jön elő:** A lelkész kétszer rögzíti ugyanazt a Chitanță 145-öt (két lapon, vagy figyelmen kívül hagyva a mezőelhagyáskor megjelenő „Ez az iratszám már létezik” feliratot — a dupRowIds csak felirat, a handleSave nem blokkol, CombinedEntryBody.tsx:929 és 1062). Mindkét sor bekerül a befizetes táblába azonos iratszámmal: a Registru Casán és a Csoportnaplón kétszer szerepel ugyanaz a nyugtaszám két különböző összeggel, a getNextReceiptNumbers MAX+1-je pedig zavartalanul lép tovább, így a hiba csak a nyugtafigyelő duplikátum-listáján derül ki — utólag.

**Javítási irány:** checkReceiptDuplicateUseCase-zel egyenértékű SELECT + 23505-lekezelés az insertIncomeRecord/insertExpenseRecord elé (a /N utótagos több-befizetős esetet a receiptBaseKey szemantikája szerint kezelve), és a partial index predikátumának cseréje a kanonikus készpénz-jelzőre (bankszamla_id IS NULL) az irattípus-szöveg helyett.

### 15. A presbitériumi határozat száma/dátuma sosem kerül a hivatalos Számadás/Költségvetés borítójára

**Hol:** `apps/web/components/finance/finance-print-dialog.tsx:286` · *adatlanc szakadas*

**Mi a baj:** A véglegesítéskor a bealitas.szamadas_hatarozat_szam / szamadas_hatarozat_datum mezőbe mentett presbitériumi határozat soha nem jut el a nyomtatványra, mert a két nyomtató dialógus csak a `finalized` zászlót adja át a buildCoverPage-nek, az iktatoszam/hatarozatSzam/hatarozatDatum mezőket nem.

**Mikor jön elő:** A lelkész az accounting-finalize-wizard-dialog.tsx:256-257-ben megadja a jegyzőkönyvi számot (pl. 12/2026) és a tárgyalás dátumát -> penzugy/actions.ts:3304-3305 kiírja a bealitas sorba (és a beküldött snapshotba, amit az egyházmegye lát) -> a lelkész a Nyomtatási központban kinyomtatja a Számadást -> finance-print-dialog.tsx:277-287 (és budget-print-dialog.tsx:146-156) csak `finalized: true`-t ad a BudgetPrintData-ba -> budget-reporting.ts:574-580-ban `fin === true`, de iktatoszam/hatarozatSzam/hatarozatDatum undefined -> a borítón a 'Tárgyalta és jóváhagyta a presbitérium a ____ tartott gyűlésén ____ szám alatt.' ÜRESEN marad, RÁADÁSUL a 'Nincs véglegesítve — a presbitériumi határozat ... a véglegesítés után kerül a nyomtatványra' magyarázó sor is eltűnik (budget-reporting.ts:610), mert az csak `!fin` esetén jelenik meg. A lelkész tehát kitöltetlen határozat-sorral adja be az aláírt papírt, miközben az adat a DB-ben ott van. A presbiteriumi_hatarozat_szam/_datum, egyhazkozsegi_iktatoszam, egyhazmegyei_iktatoszam, szamadas_iktatoszam oszlopokra pedig a teljes repóban 0 író és 0 olvasó van — a költségvetés-ág (finalizeBudget) be sem kéri őket.

**Javítási irány:** A BealitasRow típusba (packages/ui-app/src/finance/types.ts:194) vedd fel a szamadas_hatarozat_szam/_datum, presbiteriumi_hatarozat_szam/_datum, egyhazkozsegi_iktatoszam mezőket, és a két print-dialógusban add át őket a printData-ba (számadásnál a szamadas_*, költségvetésnél a presbiteriumi_*). A finalizeBudget kapjon ugyanolyan határozat-bekérő lépést, mint a számadás-véglegesítő wizard, különben a költségvetés borítója továbbra sem tölthető ki.

### 16. Múlt év megnyitása a Pénzügyben némán a MAI járulékkal hozza létre az évi beállítást

**Hol:** `apps/web/app/(dashboard)/penzugy/page.tsx:142` · *hiba*

**Mi a baj:** Ha egy korábbi évhez nincs bealitas sor, az oldal betöltése némán létrehozza azt a MAI congregations.eves_jarulek / jarulek_kedvezmenyes / jarulek_hatarid értékekkel, és onnantól a tartozás-motor visszamenőleg ezzel a díjjal számol.

**Mikor jön elő:** A gyülekezetbe importálva vannak a 2019-es egyházfenntartási befizetések, ezért a listFinanceYears (penzugy/actions.ts:1123-1164) a befizetes/kiadas dátumaiból felkínálja a 2019-et az év-választóban. A lelkész rákattint -> initFinance settings = null -> page.tsx:131-148 kiolvassa a mai congregations.eves_jarulek-et (pl. 250 RON) és meghívja a createYearlySettings(2019, 250, '07-01')-t -> penzugy/actions.ts:2884-2889 a 2019-es sorba beírja a 250-et ÉS a mai jarulek_kedvezmenyes-t. Ezután a 2019-es Tartozások lista minden tagra 250 RON elvárást számol a valós (akkori) 100 helyett, a személyi karton többéves hátralék-bontása (tagnyilvantartas/actions.ts:529, ami MINDEN bealitas év-sort beolvas) ugyanezt az összeget használja, az Évenkénti díjak panel pedig (annual-fees-manager.tsx:146) 'rögzített díj'-ként mutatja a 2019-et, holott senki nem rögzítette. Ez egyben ellentmond a panel saját ígéretének is ('a régebbi évekhez nincs kedvezmény'), amit a saveAnnualFee (tartozas-actions.ts:91-94) explicit jarulekKedvezmenyes: 0-val be is tart — az automatikus úton viszont a mai kedvezmény kerül a múlt évbe.

**Javítási irány:** A page.tsx automatikus createYearlySettings-hívása csak selectedYear >= currentYear esetén fusson; korábbi évnél a YearlySettingsDialog kérje be az AKKORI díjat (vagy a sor jöjjön létre eves_jarulek: 0 + jarulek_kedvezmenyes: 0 értékkel, és a felület jelezze, hogy az évhez díjat kell rögzíteni).

### 17. Desktop: a költségvetés véglegesítése és a feloldás-kérés 0 soros íráskor is sikert jelent

**Hol:** `apps/desktop/src/components/desktop-budget-tab.tsx:107` · *hiba*

**Mi a baj:** A desktop finalizeBudget (107), finalizeBudgetModification (120) és requestBudgetUnlock (202) UPDATE-je `.select()` nélkül fut, ezért a 0 sort érintő írás is `success: true`-t ad — a web ugyanezt a P0-t 2026-08-11-én javította (penzugy/actions.ts:2984-3012, updateYearlyFinanceFlags).

**Mikor jön elő:** A bealitas fő RLS-policy-je (migration-docs/sql/2026-04-13-rls-congregation-tables.sql:24) a `congregation_id = current_user_congregation_id()` SKALÁRRA épül. Egy könyvelő (aki a gyülekezethez a profile_congregations many-to-many soron át van rendelve, tehát a profiles.congregation_id-je más vagy NULL), illetve bármely olyan eset, amikor az évre nincs szerveroldali bealitas sor, a desktopon megnyomja a 'Véglegesítés és beküldés' gombot -> az UPDATE 0 sorra fut, a PostgREST NEM ad hibát -> a callback `{ success: true }` -> a közös BudgetTab.tsx:485-513 'zár-először' ága átengedi -> a submitDocument beküldi a költségvetést az egyházmegyének, miközben a gyülekezeti év NYITVA marad és tovább szerkeszthető (pontosan a 'beküldött-de-nyitott, némán elévülő snapshot' állapot). Ugyanez a requestBudgetUnlock-nál: a lelkész 'Elküldve' visszajelzést kap, az esperes viszont soha nem látja a javítási kérelmet — fejlesztő nélkül diagnosztizálhatatlan zsákutca.

**Javítási irány:** Mindhárom desktop-írás kapjon `.select('id')`-t, és 0 találatnál adjon vissza magyar hibaüzenetet a web updateYearlyFinanceFlags mintájára (vagy a desktop is a közös use-case-en át írjon, ne nyers Supabase-hívással).

### 18. A félbeszakadt vagy el sem indult napi mentésről SEMMILYEN riasztás nem megy ki — csak belépéskor látszó sáv

**Hol:** `apps/web/lib/google-drive/alerts.ts:128` · *res*

**Mi a baj:** Az `elavult` („régen készült ellenőrzött mentés") és a `drive_kapcsolat` riasztás-fajta definiálva van, de az egész kódbázisban EGYETLEN hívó sincs rájuk; a `sendDriveFailureAlert` csak `nyeses`, `egyeztetes`, `proba` és `futas_bukas` kulccsal hívódik, vagyis a „a napi futás egyáltalán nem történt meg / félúton meghalt" eset e-mail és harang nélkül marad.

**Mikor jön elő:** 05:17-kor a GitHub Action elindítja a mentést, 5 perc után (napi-mentes.yml:166-174) 0-s kóddal kilép ezzel: „A befejezést az admin → Biztonsági mentés oldal és az őrszem-riasztás igazolja." 05:40-kor a Railway telepítést vagy újraindítást kap — a supervisor modul-szintű `allapot`/`futoCiklus` (supervisor.ts:183-185) elvész, a ciklus meghal. 500+ gyülekezet aznap mentés nélkül marad. A `worker.ts` hatókörönkénti riasztója nem fut le (nem volt bukott hatókör, csak megszűnt a folyamat), az összesítő sem, a `feloldMegoldottMentesRiasztasok` és a `computeBannerHealth` pedig CSAK oldalbetöltéskor számol (health.ts:6-12 maga mondja ki: „a figyelmeztető sáv MAGA az őrszem"). Ha Endre két hétig nem lép be az admin felületre, két hétig nincs jelzés — pontosan az az eset, amit a health.ts „BEVALLOTT KORLÁT" szakasza is elismer, de amire a pótlás (cron-szkript hibás kilépési kódja) az 1. megállapítás miatt szintén nem működik.

**Javítási irány:** Kell egy futástól FÜGGETLEN őrszem-végpont (pl. GET /api/internal/backup-orszem, Bearer-védve), amit a napi-mentes.yml a mentés után néhány órával, külön ütemezéssel meghív: az `computeCoverage`-ből számolja a tegnapi/mai lefedettséget, és hiány esetén `sendDriveFailureAlert({kind:'elavult'})`-tal e-mailt + harangot küld. Alternatívaként a workflow második jobja pollozza az állapotot addig, amíg `fut===false`, és `befejezesOka !== 'kesz'` esetén hívjon riasztó végpontot.

### 19. Desktop: a sötét mód választása újraindítás után némán elveszik (applyTheme sosem fut boot-kor)

**Hol:** `apps/desktop/src/components/settings-dialog.tsx:151` · *adatlanc szakadas*

**Mi a baj:** Az `applyTheme()` kizárólag a `saveTheme()`-ből hívódik (sor 112), az pedig csak felhasználói kattintásra (sor 193); induláskor a `loadTheme()` csak a React state-et tölti fel (sor 151), a `dark` osztályt soha nem teszi vissza a `<html>`-re — és sem az apps/desktop/index.html (2. sor: `<html lang="hu" data-theme="kert">`, nincs `class="dark"`, nincs boot-script), sem az apps/desktop/src/main.tsx nem alkalmazza a témát.

**Mikor jön elő:** Desktop app → Beállítások → Megjelenés → „Sötét”: az ablak azonnal sötétre vált, a `kartoteka-desktop-theme-v1` kulcs értéke `dark` lesz. Bezárom, újraindítom → az app VILÁGOS módban jön fel. Megnyitom a Beállításokat: a „Sötét” kártya kiválasztva látszik (a state a localStorage-ból jön), de a felület világos — a beállítás és a valóság széthúz, a választás csak újrakattintásra áll vissza. Ugyanez a „Rendszer” módra: nincs `matchMedia('(prefers-color-scheme: dark)')` change-listener sehol a desktopban, tehát ha az OS napszak szerint vált, a desktop nem követi. A web ezt helyesen csinálja (next-themes boot-szkript) — vagyis a második felület a hiányos implementációt őrzi.

**Javítási irány:** A mentett módot render ELŐTT alkalmazni: legjobb blokkoló inline szkriptként az apps/desktop/index.html `<head>`-jébe (így nincs világos-villanás), vagy legalább az apps/desktop/src/main.tsx tetején. `system` módban fel kell iratkozni a `matchMedia` change eseményére. A loadTheme/applyTheme/saveTheme hármast érdemes közös modulba (pl. apps/desktop/src/lib/theme.ts) emelni, hogy a boot és a dialógus ugyanazt a kódot hívja.

### 20. A menü-fókusz láthatatlan mind a 3 témában: a 25 oldalsáv-menüpontra nincs rákötve a --sidebar-ring

**Hol:** `apps/web/components/layout/sidebar-adaptive-v4.tsx:232` · *res*

**Mi a baj:** Az oldalsáv fő menüpontjai (sor 232-239), az almenü-nyitó chevron gombok (sor 292) és az almenü-linkek (sor 362-370) egyetlen `focus-visible:` szabályt sem kapnak; az egyetlen szerzői outline-szín a kartoteka.css:170 globális `* { @apply border-border outline-ring/50 }`, ami a `--ring` tokent használja 50% átlátszósággal — a sötét `--sidebar` háttéren ez világos módban mindhárom témában bukja a WCAG 1.4.11 / 2.4.7 3:1-es küszöbét.

**Mikor jön elő:** Világos mód (ez az alapértelmezett: apps/web/app/layout.tsx:40 `defaultTheme="light"`), Tab-bal végigmegyek az oldalsávon. Mért értékek a themes.css tokenjeiből: parókia `--ring: #1f3a3a` (sor 178) a `--sidebar: #1f3a3a`-n (sor 179) — szó szerint AZONOS SZÍN, 1,00:1, a fókuszgyűrű teljesen láthatatlan; kert #264e4a a #143030-on = 1,52:1; zsoltáros #2c4a3e a #2a2218-on = 1,61:1 — és mindhárom még 50%-os alfával tovább halványul. A billentyűzettel navigáló felhasználó nem látja, hol áll. Bizonyíték, hogy a helyes token létezik és ismert: a mobil fiók „Menü bezárása” gombja (sor 776) már `focus-visible:outline-[var(--sidebar-ring)]`-et használ — a `--sidebar-ring` a kert-témában #9bbf6e, ami ugyanezen a háttéren bőven 3:1 fölött van; a 25 menüpontra csak nem került rá.

**Javítási irány:** A SidebarItem linkjeire, a chevron gombra és az almenü-linkekre ugyanaz a minta, mint a 776. sorban: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sidebar-ring)]`; mivel mindhárom szekció ugyanazt a `cn(...)` bázist kapja, egy közös konstansba kiemelve egyszer kell megírni. Utána ellenőrizni a `--sidebar-ring` / `--sidebar` kontrasztot mind a 6 téma-blokkban (a jelenlegi 6 érték megfelel).

### 21. Lelkészi jelentés VII.: egy még futtatásra váró oszlop explicit selectje az EGÉSZ számadás-blokkot némán nullázza

**Hol:** `apps/web/app/(dashboard)/munkanaplo/lelkeszi-jelentes-actions.ts:475` · *adatlanc szakadas*

**Mi a baj:** A `bealitas` lekérdezés explicit módon kéri a `szamadas_tartozasok` oszlopot, amit csak a még futtatásra váró migration-docs/sql/2026-08-14-szamadas-tartozasok.sql hoz létre; hiányában a TELJES lekérdezés 42703-mal bukik, és nem csak az új VII.9/VII.10, hanem a korábban működő VII.6–VII.8 is némán null lesz.

**Mikor jön elő:** Az SQL még nem futott le élesben (a CHANGELOG maga is jelzi: „Ehhez egy adatbázis-bővítés szükséges"). A lelkész megnyitja a Lelkészi jelentést egy VÉGLEGESÍTETT számadású évre. A `.select('accounting_finalized, szamadas_zaro_adatok, szamadas_tartozasok')` PostgREST 42703-at ad → `bealitasRes.error` igaz → a kód a 1027-1029. sorban csak `console.error`-t ír, és a teljes `else` blokk (1030-1050+) kimarad. Így VII.6/VII.7/VII.8 (a `szamadas_zaro_adatok`-ból élő, 2026-08-14 ELŐTT is helyesen működő pénzügyi rubrikák) is üresen maradnak — a lelkész nem kap hibaüzenetet, csak üres mezőket, és kézzel tölti ki azt, aminek a CHANGELOG szerint „kézi átírás és eltérés-lehetőség nélkül" a Számadásból kellene jönnie. Ez REGRESSZIÓ: a 7616d074 commit előtt a select csak `accounting_finalized, szamadas_zaro_adatok` volt, és migráció nélkül is működött.

**Javítási irány:** Vagy `select('*')` (ahogy az initFinance teszi, ott a hiányzó oszlop csak `undefined`), vagy 42703-fallback a `szamadas_tartozasok` nélküli selectre. A minta ugyanebből a körből már megvan: apps/web/app/(dashboard)/kuka/actions.ts:73-77 (fail-soft) és penzugy/actions.ts:4680-4687 (explicit 42703-ág).

### 22. Áttekintés: az elköltözött tag aktívnak számít, az „Elköltözött" pirula mindig 0

**Hol:** `apps/web/lib/members/member-overview.ts:90` · *hiba*

**Mi a baj:** A `living` szűrő és a `moved` számláló ékezet nélküli `'elkoltozott'` member_status-ra és a nem létező `szemely.elkoltozott` oszlopra hasonlít, miközben az app minden elköltözés-írása ékezetes `'elköltözött'`-et ír.

**Mikor jön elő:** Tagnyilvántartás → Tag kivezetése → „Elköltözött": a removeMember (tagnyilvantartas/actions.ts:1392) `member_status = 'elköltözött'`-et ír (az iktató átadás-ága, atadas-actions.ts:269 szintén). A getMembers SELECT-je (actions.ts:138) nem is kéri le az `elkoltozott` mezőt (nincs ilyen oszlop a szemely táblán), így `member.elkoltozott` mindig undefined, a `member_status !== 'elkoltozott'` pedig ékezet miatt mindig igaz → a tag bent marad a `living`, majd az `activeMembers` halmazban. Következmény az Áttekintés fülön: a lélekszám (`stats.total`), a férfi/nő bontás, a korcsoportok, a `currentVoters` és az 5/10 éves előrejelzés is tartalmazza az elköltözöttet, az „Elköltözött" pirula (overview-tab.tsx:186, `stats.moved`) viszont 0-t mutat — miközben az „Elhunyt" és a „Kitért" pirula ugyanott helyesen működik (azok ékezetezése egyezik). Ugyanazon a képernyőn a Személyek fül szerver-oldali `isActiveMember`-je (registry-list-actions.ts:199-215) ékezet-normalizálva HELYESEN kizárja ugyanezt a tagot → a két fül száma azonnal ellentmond egymásnak. Ráadásul a `vallas` összevetése is ékezetes ('református'), szemben a registry-list NFD-normalizált 'reformatus'-ával, így az importált, ékezet nélküli vallású tag a két felületen szintén máshogy számít.

**Javítási irány:** A member-overview.ts `living`/`moved`/vallás-ága használja ugyanazt a normalizált predikátumot, mint a registry-list-actions.ts (normalizeMemberStatus + normalizeForSearch), legjobb esetben közös, egyetlen exportált `isActiveMember`-rel; a `member.elkoltozott` hivatkozásokat törölni kell (nincs ilyen oszlop). Kiegészítésként érdemes a member_status írását egyetlen kanonikus konstansra szűkíteni, hogy a két írásmód ne szaporodjon tovább.

### 23. A választói jogosultság csak kézi gombra frissül — az elköltözött a névjegyzéken marad

**Hol:** `apps/web/app/(dashboard)/tagnyilvantartas/actions.ts:1392` · *adatlanc szakadas*

**Mi a baj:** A `recompute_voter_eligibility` RPC-t az egész kódbázisban csak a Választók fül három művelete hívja (voter-actions.ts:250/303/332) — a tag-kivezetés, a temetés-mentés, a tagmozgás és a konfirmáció-rögzítés egyike sem, és sem adatbázis-trigger, sem cron nem futtatja.

**Mikor jön elő:** Egy 45 éves, konfirmált, tavaly járulékot fizető tag elköltözik. A lelkész: Tagnyilvántartás → Tag kivezetése → Elköltözött. A removeMember beszúrja az `elkoltozott` sort és átírja a member_status-t, de a `szemely.voter_eligible` TRUE marad. A getVoters (voter-actions.ts:56-62) csak `isvisible=true` és `meghalt=false` szerint szűr — member_status-ra NEM —, ezért a tag a Választók fülön továbbra is „Jogosult", és mivel tavaly fizetett, a `nevjegyzekTag` (voter-actions.ts:227) is igaz. A voter-print-dialog kanonikus szűrője pontosan erre a mezőre épül (voter-print-dialog.tsx:105), így az elköltözött tag RÁKERÜL a kinyomtatott hivatalos választói névjegyzékre. Ugyanez fordítva is áll: egy frissen konfirmált 18+ tag (saveConfirmationBatch, anyakonyv/actions.ts:1591) a szabály szerint jogosult lenne, de `voter_eligible=false` marad, tehát KIMARAD a névjegyzékből. Mindkét eltérés csak akkor tűnik el, ha valaki véletlenül megnyomja a „Jogosultság frissítése" gombot; a szabály `CURRENT_DATE - 18 years` feltétele miatt egyébként is naponta avulna.

**Javítási irány:** Hívd meg a `recompute_voter_eligibility(congId)`-t a removeMember mind a négy ágának végén, a saveBurial, a saveMovement és a saveConfirmationBatch/Single után is (best-effort, a hiba figyelmeztetésként menjen ki, a setVoterOverride mintájára), VAGY tedd a szemely/konfirmalas/elkoltozott táblákra kötött AFTER-triggerbe, illetve napi pg_cron-ba. Emellett a getVoters szűrjön a member_status-ra is, hogy a képernyő ne múljon egyetlen perzisztált flag frissességén.

### 24. Az offline munkanaplót (és a személy/profil módosítást) semmi nem küldi fel automatikusan

**Hol:** `apps/desktop/src/lib/sync.ts:2071` · *adatlanc szakadas*

**Mi a baj:** A `createWorklogEntry` offline ága `enqueueOutbox('insert','munkanaplo',…)`-ba ír, de az outbox klasszikus ágát KIZÁRÓLAG a kézi `processOutbox()` üríti, amit sem az AuthGate pusher-indítója (auth-gate.tsx:155-163), sem a percenkénti AutoSyncOrchestrator (sync-orchestrator.ts:101-127, tisztán PULL) nem hív meg.

**Mikor jön elő:** A lelkész offline rögzít 6 istentiszteletet a Munkanaplóba; mindegyikre azt olvassa: „✓ Új bejegyzés mentve offline — a következő online-kapcsolatnál szinkronizálódik." (munkanaplo-page.tsx:653). Hazaérve a gép online lesz: a 60 mp-es orchestrator csak PULL-t futtat, az `online` esemény csak a chitanta/befizetés/kiadás/Excel pushereket indítja, a fejléc `SyncStatusIndicator` pedig kizárólag a chitanta/befizetés/kiadás pending sorait számolja (sync-status-indicator.tsx:68-72) — semmi nem jelzi, hogy 6 outbox-sor várakozik. A bejegyzések a lokális tükörben (negatív id-vel) látszanak, ezért késznek tűnnek, de a szerverre és a webre soha nem jutnak fel, amíg meg nem találja a Beállítások → Adat és biztonság → „Szinkronizálás most" gombot; gépcsere/újratelepítés = végleges adatvesztés. Ugyanez érvényes a `szemely` és `profiles` update-outbox soraira (sync.ts:566 és 2273 környéke). Súlyosbító: a `markOutboxFailed` (sync.ts:715) EGYETLEN hiba után `status='failed'`-re állít backoff és automatikus újrapróbálkozás nélkül — egy pillanatnyi hálózati hiba a kézi sync közben véglegesen kiparkolja a sort, visszatenni csak a sidebarból el nem érhető `/dev` oldalról lehet.

**Javítási irány:** Indítsd a `processOutbox()`-ot ugyanazokkal a triggerekkel, mint a pénzügyi push-ereket (AuthGate mount + `online` esemény + periodikus poll), exponenciális backoff-fal a végleges `failed` helyett; és a fejléc sync-jelvénye számolja bele a `status IN ('pending','failed')` outbox-sorokat is.

### 25. Új tag: online szerver-hibánál a desktop „offline elmentve" sikert jelent, a hibát eldobja

**Hol:** `apps/desktop/src/lib/sync.ts:2811` · *hiba*

**Mi a baj:** A `createSzemelyEntry` online ága MINDEN nem-23505 szerver-hibára `pending: true`-val tér vissza, a `member-create-dialog.tsx:235` pedig ezt a kék „mentve offline-ban" bannerrel jutalmazza, meghívja az `onCreated()`-et és 1,5 mp múlva bezárja az ablakot — a `result.error` sosem jelenik meg.

**Mikor jön elő:** A lelkész online, a Tagnyilvántartás → „Új tag" ablakban rögzít egy tagot. A payload (sync.ts:2871-2882) nem tartalmaz `c_utcaid`-t, márpedig a `szemely.c_utcaid` a séma szerint NOT NULL (migration-docs/Database_schema.sql), és csak a `2026-07-24-pr8-c-utcaid-null-migracio.sql` veszi le róla — ha az élesben nem futott le (a migration-fájl megléte nem bizonyíték), a szerver 23502-vel utasít el. A dialógus mégis azt írja: „Új tag mentve offline-ban. A szinkron feltölti, amint online leszünk.", és bezáródik. A háttér-pusher (szemely-write-sync.ts:83) 5 sikertelen próbálkozás után (~24 perc) `conflict`-ra billenti a sort olyan üzenettel, amit a lelkész csak a pending-listát megnyitva látna. Ugyanez a néma „siker" jön RLS-elutasításnál is (pl. aal1-es munkamenet a 2026-08-15-ös mfa_opt_in_aal2 RESTRICTIVE policy mellett). Mellékhatás: a mentett sor `c_helysegid`/`c_utcaid` nélkül csak a szabad-szöveges `c_szcim`-et kapja, amit a webes tagi portál „Irányítószám" címkével jelenít meg (member-dashboard.tsx:111), a desktopon viszont „Teljes cím" a mező felirata.

**Javítási irány:** A `createSzemelyEntry` különítse el az „offline / hálózati hiba" ágat a „szerver elutasította" ágtól (pl. `serverRejected: true`), és a dialógus ez utóbbinál piros hibabannert mutasson a tényleges `result.error`-ral, ne zárja be az ablakot. Emellett a payload kapjon explicit `c_utcaid: null`-t + futtatásigazolást a c_utcaid-migrációra, és a mezőfelirat egyezzen a webbel.

### 26. Sírhely-modul: négy írás-út gyülekezet-ellenőrzés nélkül fut (kereszt-gyülekezeti IDOR)

**Hol:** `apps/web/app/(dashboard)/sirhelyek/actions.ts:210` · *res*

**Mi a baj:** A deletePlot (210-225), a deleteRental (262-278), a deleteDeceased (321-336), valamint a savePlot update-ága (196-202), a saveRental (250-256) és a saveDeceased (309-315) kizárólag .eq('id', id)-vel dolgozik: sem a congId-t nem ellenőrzi (a deletePlot még a !congId őrt is kihagyja), sem azt, hogy a sirhely/sirhelyberles/sirhelyelhunyt sor a saját gyülekezet temetőjéhez tartozik-e — az egyetlen hatókör-kapu a DB-policy, a sírhely-modul pedig teljesen kimaradt a 10 dimenziós átvilágításból.

**Mikor jön elő:** A lelkész bejelentkezik, és a szerver-akciót közvetlenül hívja deletePlot(1234) / saveRental({sirhelyid: 1234, berlo: 'X'}) alakban (a sirhely.id egész szám, végigpróbálható). Ha a 2026-08-10-nyitott-rls-policyk-takaritas.sql nem futott le élesben — a _RUN_LOG.md-ben nincs róla bejegyzés, a naplózás 2026-07-18-nál megáll —, akkor a sirhely/sirhelyberles/sirhelyelhunyt táblán még a 2026-04-13-as USING (true) policy él, és a hívás egy MÁSIK gyülekezet sírhelyét törli, illetve annak sírjára ír bérlő-nevet, címet és elérhetőséget. Semmilyen naplózás nem marad utána (az audit.log_change trigger ezeken a táblákon nem ül).

**Javítási irány:** A három temetői táblán minden írás-út oldja fel a tulajdonost a temetoid → sirhelytemeto.congregation_id láncon (a savePlot insert-ága már ezt teszi, 174-180), és a delete/update mindig kapjon .in('temetoid', sajatTemetoIds) vagy előzetes verifikációt; a deletePlot kapja meg a hiányzó !congId őrt. Ezzel párhuzamosan Endre futtassa le és naplózza a 2026-08-10-nyitott-rls-policyk-takaritas.sql 5. szakaszát, majd a fájl végi ellenőrző SELECT-tel igazolja.

### 27. Offline pull + Kuka: idegen gyülekezet sorai a Kukába kerülnek és véglegesen törölhetők

**Hol:** `apps/web/lib/offline/recycle-bin-actions.ts:92` · *adatlanc szakadas*

**Mi a baj:** A listDeletedRecords hatókör-szűrője fail-open: ha a rekordnak nincs congregation_id oszlopa (cid === undefined), feltétel nélkül átengedi — a pull.ts:115 pedig csak a scopeFilter === 'congregation_id' táblákra tesz szűrőt, tehát a 10 db scopeFilter 'none' tábla (köztük sirhely / sirhelyberles / sirhelyelhunyt) szűretlenül töltődik a Dexie-be, és onnan szűretlenül jelenik meg a Kukában.

**Mikor jön elő:** A böngésző szinkronizál: a pull.ts a sirhelyberles/sirhelyelhunyt táblát szűrő nélkül kéri le (csak updated_at kurzorral). Nyitott USING (true) policy mellett az ország ÖSSZES temetői sora leérkezik a helyi Dexie-be (bérlő neve, címe, elérhetősége; elhunytak neve, anyja neve). A lelkész megnyitja a Kukát: a kuka/page.tsx az effectiveCongregationId-t adja át, de a 92. sor a congregation_id nélküli sorokat mind átengedi, így idegen gyülekezetek törölt sírhely-sorai listázódnak. A „Kuka ürítése” (emptyBin → hardDelete → push _hardDelete: true) valódi DELETE-et küld rájuk, gyülekezet-szűrő nélkül; ha a policy nyitott, az idegen sorok VÉGLEG elvesznek, naplózatlanul.

**Javítási irány:** A listDeletedRecords 92. sora legyen fail-closed (congregation_id nélküli tábla esetén a hívó adjon meg explicit, FK-n feloldott ID-halmazt, vagy a tábla ne jelenjen meg a Kukában); a table-registry három temetői bejegyzése kapjon FK-alapú scopeFilter-t (temetoid IN sajat temetok, sirhelyid IN sajat sirhelyek), és a pull.ts ismerje ezt az új szűrő-fajtát. Ezen felül a már letöltött idegen sorokat egy egyszeri Dexie-takarítással el kell távolítani.


## 🟠 KÖZEPES

### 28. A 2FA aal2-kényszer SECURITY DEFINER RPC-ken megkerülhető, és a `gyerek` tábla kimaradt

**Hol:** `migration-docs/sql/2026-08-15-mfa-optin-rls.sql:51` · *res*

**Mi a baj:** A `mfa_opt_in_aal2` RESTRICTIVE policy csak a közvetlen tábla-hozzáférést zárja, a SECURITY DEFINER RPC-k viszont tulajdonosként futnak és minden RLS-t (így ezt is) megkerülnek — ráadásul a `gyerek` tábla be sem került a 14 védett közé.

**Mikor jön elő:** Egy 2FA-t bekapcsolt lelkész jelszavát megszerzi a támadó (pontosan az az eset, ami ellen a 2FA véd). Belép jelszóval → aal1-es access token. A böngésző/middleware a 2. lépcsőre terelné, de a támadó nyersen POST-ol a `/rest/v1/rpc/get_csaladok_for_congregation` és `/rest/v1/rpc/get_gyerek_for_congregation` végpontokra a saját gyülekezet UUID-jával. Ezek `SECURITY DEFINER` (2026-08-11-security-definer-hardening.sql:186 és :242), kapujuk csak bejelentkezést + aktív tisztségviselőt + gyülekezeti hatókört néz, aal-szintet NEM — így a teljes családi és gyermek-nyilvántartás (kiskorúak szülő-kapcsolata, lakcímek) kijön aal1-gyel, holott a `csalad` szerepel a védett táblák között. A `gyerek` közvetlen SELECT-tel is kijön, mert nincs rajta policy.

**Javítási irány:** (1) A `gyerek` (és a hasonlóan érzékeny `iktato` / `jegyzokonyvek` / `sirhely`) felvétele a `tablak` tömbbe. (2) Egy közös `public.mfa_aal_rendben()` STABLE segédfüggvény bevezetése (ugyanaz a feltétel, mint a policyben), és beemelése minden érzékeny adatot visszaadó SECURITY DEFINER RPC fail-closed kapujába — ott, ahol ma a `current_user_can_access_congregation()` áll. Az SQL fejlécében szereplő „API-megkerülés ellen is" ígéret e nélkül nem teljesül.

### 29. VII.5 kézi→auto váltás: a nyomtatványon az „a + b − c" nem jön ki (kétféle prioritás-sorrend)

**Hol:** `apps/web/lib/lelkeszi-jelentes/types.ts:440` · *hiba*

**Mi a baj:** A `deriveAutoMezok` belső `nyersErtek`-je `felulirasok > kezi > auto` sorrenddel old fel, a megjelenítést végző `mezoErtek` (types.ts:385–392, a nyomtatás print.ts:131 is ezt hívja) viszont `felulirasok > auto > kezi` sorrenddel — a 2026-08-14-én kézibből AUTO-vá tett VII.5 mezőnél a két sorrend különböző számot ad, és a VII.8 egyenleg a kijelzettől eltérő komponenssel számol.

**Mikor jön elő:** A lelkész a 2025-ös jelentésben még kézzel írta be az előző évi maradványt: `kezi_adatok['VII.5'] = 5000`. A 18. pont 3D után a VII.5 auto lett, és mivel a 2024-es jelentés véglegesített, `auto['VII.5']` = 3200 (lelkeszi-jelentes-actions.ts:544). A képernyőn és a nyomtatványon az 5. tétel = 3200 (mezoErtek: auto nyer), a 8. tétel viszont `deriveAutoMezok`-ból = 5000 + VII.6 − VII.7 (nyersErtek: kezi nyer). Az aláírt, egyházmegyének beküldött íven tehát a 8. sor 1800 lejjel eltér az 5+6−7 összegtől; véglegesítéskor ez az inkonzisztens érték FAGY BE a snapshotba (buildJelentesData → computeAuto a DB-ből olvasott `kezi`-vel hívódik), mert a finalize nem menti újra a kezi_adatokat, tehát a `saveLelkesziJelentes` keziMezok-szűrője (ami a VII.5-öt kidobná) nem is fut le közben. Ugyanez a néma érték-elrejtés érinti a szintén kézibből autóvá tett II.10/II.11-et is (ott a korábbi kézi szám csak láthatatlanná válik).

**Javítási irány:** A `deriveAutoMezok` `nyersErtek`-je használja UGYANAZT a sorrendet, mint a `mezoErtek` (`felulirasok > auto > kezi`) — egy közös helperrel, hogy ne tudjanak széthúzni. Emellett egyszeri migráció/tisztítás: az `auto: true`-vá vált mezők (VII.5, VII.9, VII.10, II.10, II.11) kulcsait töröljük a még nem véglegesített sorok `kezi_adatok` jsonb-jéből, vagy emeljük át őket `felulirasok`-ba, hogy a lelkész korábbi kézi száma tudatos felülírásként éljen tovább.

### 30. A fénykép-fájl feltöltése az `ensureFolder()` ELŐTT történik — hiányzó vödörnél minden fényképes gyülekezet bukik

**Hol:** `apps/web/lib/backup/export.ts:450` · *hiba*

**Mi a baj:** Az `exportScope` a 3/b lépésben (450. sor) már feltölti a média-fájlt, de a tároló előkészítését (`opts.storage.ensureFolder()`) csak a 6. lépésben, az 544. sorban hívja meg — a Supabase Storage háttérnél viszont épp az `ensureFolder()` az, ami a hiányzó `biztonsagi-mentes` vödröt létrehozza (storage.ts:169-184).

**Mikor jön elő:** Google Drive nincs összekötve (vagy a token lejárt és a `resolveBackupStorage` a Supabase Storage-ra esik), és a `biztonsagi-mentes` vödör még nem létezik. Az első gyülekezet, amelynek van legalább egy `szemely.kep` fényképe: `media.darab > 0` → a 450. sori `uploadFile` fut le ELŐSZÖR, ami `admin.storage.from('biztonsagi-mentes').upload(...)` → „Bucket not found" → az `exportScope` dob, a hatókör `feltoltes` szakaszban bukik. Mivel az `ensureFolder()` sosem éri el a végrehajtást, a vödör nem jön létre, tehát MINDEN fényképes gyülekezet ugyanígy bukik — a hibaüzenet („A mentés feltöltése sikertelen (km-….kbk): Bucket not found") pedig nem mondja meg, hogy a vödör hiányzik.

**Javítási irány:** Az `ensureFolder()` hívását vidd fel az `exportScope` elejére (a 349. sori számlálás elé, vagy legalább a 3/b média-blokk elé), és hagyd meg a 6. lépésben lévőt idempotens biztosításként.

### 31. A készpénz-korlát figyelmeztetések csak az éppen nyitott rögzítő-ablak sorait látják — a feldarabolás-detektor a valós esetben soha nem szólal meg

**Hol:** `packages/ui-app/src/finance/CombinedEntryBody.tsx:691` · *res*

**Mi a baj:** A `keszpenzKorlatFigyelmeztetesek()` bemenete kizárólag a dialógus saját `incomeRows`/`expenseRows` állapota, amely új sorból vagy localStorage-vázlatból indul — a MÁR RÖGZÍTETT, ugyanaznapi tételek soha nem kerülnek bele, így a napi aggregációra épülő szabályok (feldarabolás, napi 10 000, partnerenkénti 5 000/10 000) csak akkor jeleznek, ha mindkét tétel ugyanabban a megnyitásban készül.

**Mikor jön elő:** A gondnok délelőtt rögzít egy 3 000 lejes készpénzes kifizetést az „X Kft."-nek, ment, az ablak bezárul (a vázlat törlődik: 371-373. sor). Délután újra megnyitja a rögzítőt, és ugyanarra a napra, ugyanannak a partnernek beír még 3 000 lejt. Az `incomeRows`/`expenseRows` ekkor csak az új sort tartalmazza (281. sor: `useState(() => [newRow(currentYear)])`), a napi összeg 3 000 < 5 000 → SEMMILYEN figyelmeztetés nem jelenik meg, pedig a napi összeg 6 000 lej, és a KONYVELES-2026 terv ezt ⛔ BLOKKOLÓ-ként nevesíti („(f) A kifizetés feldarabolásának tilalma: nincs detektor"). A CHANGELOG 2026-08-14 viszont késznek jelenti: „ugyanannak a partnernek ugyanazon a napon több készpénzes kifizetés összesen lépi át az 5 000 lejt". Ugyanez igaz a napi 10 000 lejes összesített kifizetésre is. (A kasszaplafon-figyelmeztetés ellenben VALÓS, mert a CashbookTab.tsx:689 a tényleges záró egyenleget nézi.)

**Javítási irány:** A dialógus nyitásakor / dátum-változáskor kérdezd le szerver-akcióval az érintett nap(ok) már rögzített készpénzes tételeit (befizetes+kiadas, bankId IS NULL), és fűzd hozzá a `tetelek` tömbhöz `keszpenz: true` jelöléssel — a szabály-mag (packages/core/src/finance/keszpenz-korlatok.ts) már erre van tervezve („egy nap már rögzített tételei a köteggel együtt"), csak a hívó nem adja át őket.

### 32. A hivatalos F./N. keresztelő/temetés típusnév névtippelésből jön, nem a szemely.ferfi-ből

**Hol:** `apps/web/app/(dashboard)/anyakonyv/actions.ts:57` · *hiba*

**Mi a baj:** A `hivatalosNemTipus()` csak a `k_nev`-et kéri le és a `guessGender()` heurisztikájával dönt (az „a"/„e" végű nevek nőnek számítanak, 20 elemű kivétel-listával), holott a `szemely.ferfi` NOT NULL boolean ott van ugyanabban a sorban.

**Mikor jön elő:** Keresztelés mentése egy „Ágnes" nevű kislányra: guessGender('ágnes') → nem 'a'/'e' végű és nincs a MALE_NAME_EXCEPTIONS-ban (member-helpers.ts:28-34) → 'ferfi' → a munkanapló-bejegyzés jellege „F. keresztelő" lesz. Ugyanez történik Judit, Katalin, Edit, Erzsébet, Margit, Ildikó, Enikő esetén. Fordítva: egy „Bence" vagy „Levente" nevű fiúnál az 'e' végződés miatt „N. keresztelő". Temetésnél ugyanez a hiba (actions.ts:1420), és a szerkesztő úton is (tagnyilvantartas/actions.ts:1828-1835 ugyanezt a heurisztikát ismétli). A hibás típusnév a hivatalos EREK-ív munkanapló-során jelenik meg (print-columns.ts:181-182 OFFICIAL_EGYEB), miközben UGYANANNAK a lelkészi jelentésnek az I. anyakönyvi fejezete a `szemely.ferfi` boolean kötegelt lookupjából számol (lelkeszi-jelentes-actions.ts:257 körül) — a nyomtatvány így önmagával kerül ellentmondásba ugyanarra a keresztelőre.

**Javítási irány:** A `hivatalosNemTipus()` SELECT-je kérje le a `ferfi` oszlopot is, és elsődlegesen abból döntsön (`ferfi === false → 'N. …'`); a guessGender csak akkor maradjon tartalék, ha a személy nem olvasható. A tagnyilvantartas/actions.ts:1828-1835 duplikátumot cseréld le ugyanerre a közös helperre — a `personRows` lekérdezés úgyis egy mezővel bővítendő.

### 33. AI chat végpont: a sebességfék csak a kliens-widgetben van, a szerveren semmi

**Hol:** `apps/web/app/api/ai/chat/route.ts:22` · *res*

**Mi a baj:** A POST /api/ai/chat egyetlen kapuja a getUser() létezés-ellenőrzése (20. sor): nincs szerveroldali sebességfék (az AI_CONFIG.rateLimitMs kizárólag a components/ai/ai-chat-widget.tsx:100 setTimeout-jában él), nincs hosszkorlát a message-en, és a kliens által küldött history tömb tartalma változtatás nélkül megy tovább a fizetős szolgáltatóhoz.

**Mikor jön elő:** Bármely bejelentkezett felhasználó (profil-státusz és szerepkör nincs ellenőrizve — pending user is átmegy) egy egyszerű ciklusban POST-olja a /api/ai/chat végpontot néhány száz kilobájtos message + 10 elemű history hasznos teherrel, a böngésző-widget megkerülésével (curl vagy fetch a saját munkamenet-sütijével). A szerver minden kérést továbbít az OPENROUTER/GROQ/GEMINI kulccsal; a kvóta percek alatt elfogy vagy a számla felfut, és a rendszer-prompt teljesen felülírható a history-ban elhelyezett hamis system/assistant üzenetekkel. Semmilyen napló, számláló vagy riasztás nem keletkezik.

**Javítási irány:** A route kapjon szerveroldali, felhasználónkénti sebességfeket (az AI_CONFIG.rateLimitMs értékére, pl. a profiles vagy egy kis táblás számláló alapján), max. hosszkorlátot a message-re és a history minden elemére, a history role mezőjének 'user'/'assistant'-ra szűkítését (system csak szerveroldalról), valamint az aktív profil-státusz ellenőrzését.

