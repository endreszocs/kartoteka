# KARTOTÉKA — P3-utómunka kör (desktop · naptár · eszköz-kapcsolás · profil · értesítések) — ÉLŐ ÁLLAPOT (2026-09-05)

**Cél:** ha a munka félbeszakad, ebből a lapból látszik, MI KÉSZÜLT EL, MI FUT, MI HALT EL, és HONNAN
KELL FOLYTATNI. Az előző kör lapja: `KARTOTEKA-desktop-naptar-ertesites-profil-allapot-2026-09-05.md`
(annak „Maradék" listája ennek a körnek a bemenete).

## 0. Hol vagyunk

| Mi | Érték |
|---|---|
| Munkafa | `C:\Users\endre\Documents\APPS\Egyházi APP\KARTOTEKA\.claude\worktrees\p3-utomunka` |
| Ág | `feat/utomunka-p3-naptar-desktop-profil` (bázis `d8a5d4d6` = main v0.9.227, PR #231 squash) |
| Cél-verziók | web **0.9.230** (az `origin/main` közben `e5f96e05` v0.9.229-re ment: PR #233 betöltés-jelző + #234 GYIK-súgó + #232 docs → merge kell PR előtt, várható ütközés: `apps/web/package.json`, `docs/CHANGELOG.md`, gyökér `package.json` lánc), desktop **0.9.14** (package.json + tauri.conf.json + Cargo.toml — a `selftest-desktop-sync-print` M4 őre a hármas egyezést méri) |
| Asztali build 0.9.13 | **ELKÉSZÜLT** (2026-09-05 15:23, a `naptar-desktop-kor` fából, detached `d8a5d4d6`): `C:\kartoteka-target\release\bundle\nsis\Kartotéka_0.9.13_x64-setup.exe` (30,16 MB) + `.sig`, `msi\Kartotéka_0.9.13_x64_hu-HU.msi` (33,38 MB) + `.sig`, `nsis\latest.json`; Authenticode: EREK Kartoteka Developer (önaláírt, ugyanaz, mint a korábbi kiadásoknál), DigiCert időbélyeg; updater Ed25519-aláírás kész. **FELTÖLTVE ÉS KIADVA** (Endre „igen!"-jével, 2026-09-05 18:46Z): `updater/windows-x86_64/Kartoteka_0.9.13_x64-setup.exe` (30,16 MB, HTTP 200) + `latest.json` (version 0.9.13, kiadási jegyzettel) — az asztali appok a Frissítés-ellenőrzéssel megkapják |
| Endre engedélyei | „mehet!" (a kör indítására); az asztali buildet a koordinátor készíti; a FELTÖLTÉS (updater-bucket) külön kérdés |
| Commit | `ca7dc847` (a kör) + `2b343d7c` (merge origin/main v0.9.229) + `ea1132aa` (állapot-lap) — **PR #235 nyitva:** https://github.com/endreszocs/kartoteka/pull/235 |

## 1. A kör tartalma (5 ügynök, diszjunkt fájl-tulajdon)

| Ügynök | Feladat | Tulajdon |
|---|---|---|
| desk-p3 | notifyLocalWriteCommitted az online dialógus-mentésekbe; getLocalUpcomingPrograms az 5 új típussal (magán → csak a lelkész); stopAllWriteSyncs export; allapot-útvonal átmeneti 5xx = újrapróbálás (nem végleges hiba); verifyOtp-bukás (elhalt token) → érthető „indítsd újra" a varázslóban; desktop verzió 0.9.14 (3 fájl) | `apps/desktop/**` (kivéve amit más ügynök birtokol: semmi), `scripts/selftest-desktop-*.mjs` |
| naptar-p3 | ismétlődő sorozat anyakönyvezése TILOS (a toggleProgramDone mintája); cal-print-11 (előző évben kezdődő, nem ismétlődő többnapos program januárban: csempe + nyomtatvány); hibás réteg-betöltésnél a köszöntő naptár NEM nyomtat üres papírt; a nyomtatvány-modál mérete EGY forrásból; ui-app barrel-export az építőkre; a naptár-SQL fejléc-kommentje (ICS: mind az 5 típus kizárva) | `apps/web/app/(dashboard)/programs/**`, `apps/web/components/dashboard/**`, `apps/web/lib/calendar/**`, `packages/ui-app/src/dashboard/**`, `packages/ui-app/src/members/koszonto-naptar.ts`, `packages/ui-app/src/index.ts`, `migration-docs/sql/2026-09-05-naptar-*.sql` (CSAK komment), `scripts/selftest-naptar-*.mjs` |
| kapcsolas-p3 | middleware: pontos allowlist a 3 útvonalra; szerver.ts: a jóváhagyás új sora ELŐTT az ugyanazon felhasználó korábbi, még le nem kért `jovahagyva` sorai `lejart`-ra (érthető ok), hogy a másik gép ne kapjon halott tokent; allapot-válasz: külön állapot-üzenet erre | `apps/web/lib/desktop-kapcsolas/**`, `apps/web/lib/supabase/middleware.ts`, `apps/web/app/api/desktop-kapcsolas/**`, `scripts/selftest-desktop-kapcsolas.mjs` |
| profil-p3 | „Google-fotó használata" NEM törli a feltöltött képet (csak a forrást váltja; törlés külön, megerősítéssel); a Storage remove() visszaadott listáját ellenőrizni (RLS-néma no-op → warning); „örökölt szerep" pontos egyezés; Kapcsolatok-link és a /profile/kapcsolatok oldal UGYANABBÓL a forrásból dönt; fülek min-h-11; React-kulcs tartalomból → stabil azonosító/index; ProfileStatus típus bővítése | `apps/web/components/modals/profile-dialog.tsx`, `apps/web/app/(dashboard)/profile/**`, `apps/web/components/profile/**`, `apps/web/lib/types/auth.ts`, `apps/web/lib/profile-roles/**`, `scripts/selftest-profil-pontossag.mjs` |
| ertesites-p3 | a régi (2026-09-05 előtti) hozzáférés-kérelem sorok „Válaszra vár" pillje: olvasáskor a kérelem tényleges állapotából levezetve + egyszeri SQL visszatöltés (új fájl Endrének) + `ertesites_felado_levezetes` explicit EXECUTE ugyanabban a fájlban | `apps/web/lib/notifications/**`, `apps/web/components/notifications/**`, `apps/web/app/(dashboard)/notifications/**`, `migration-docs/sql/2026-09-05-ertesitesek-p3.sql` (ÚJ), `scripts/selftest-ertesites-*.mjs` |

Utána: ellenőrzés-ügynök (typecheck/lint/selftest + javítás) → 5 bíráló (területenként, cáfoló szemlélet) → javítók.

## 2. Kötegenkénti átvétel (a koordinátor pipálja)

- [x] Workflow elindítva — run id **`wf_b6205211-63d`**, script: `…\workflows\scripts\kartoteka-p3-utomunka-wf_b6205211-63d.js` (resume: `Workflow({scriptPath, resumeFromRunId: 'wf_b6205211-63d'})`), napló: `…\subagents\workflows\wf_b6205211-63d\journal.jsonl`
- [x] 5 megvalósító ügynök KÉSZ (mind kesz=true) + a 2 új selftest regisztrálva a gyökér `package.json`-ban
      (`selftest:desktop-kapcsolas-kliens`, `selftest:ertesites-p3-sql`; a lánc 145 tagú)
- [x] Ellenőrzés-ügynök KÉSZ (typecheck/lint/selftest zöld, az ügynökök nyitott kérdéseit is lezárta) + 5 bíráló KÉSZ
      (találatok: desk 1×P2+4×P3, naptár 1×P2+2×P3, értesítés 1×P2+4×P3, profil 1×P2+4×P3, kapcsolás 6×P3; P0/P1 NINCS)
- [x] Javítók KÉSZ (az első futásban 4 a session-limit miatt elhalt, de a javítások zömét már felvitték; a RESUME
      újrafuttatta mind az 5-öt): desk 7 javítás (5 bírálói + 2 saját P2: az élő közelgő-programok út is az év-metszet
      szabályt kapta; SQL-szintű őr), naptár 3 (desktop cal-print-11 a getLocalPrograms WHERE-jében: `datum <= év-vége AND
      (datum_vege >= év-eleje OR datum >= év-eleje)`), kapcsolás 6 (W5b őr pontos szöveg; keresMasikFuggoJovahagyast fail-closed
      őr; sorrend: a felülírás CSAK a sikeres generateLink után; párhuzamos jóváhagyás dokumentálva; a már lejárt sorra nem
      „felülírta" audit; allowlist⇄route-fájl őr), értesítés 5 (a kérelmező saját döntés-sora nem kap gombpárt; a zöld sáv mondata
      a döntéshez igazodik; az őr a kérelem-bekötést is méri; UUID-szűrés az `admin_access:` hivatkozásra; KERELEM_ELDOLT_ALLAPOTOK
      fehérlista), profil 5 (Kapcsolatok-döntés az aktív szerepből — `aktiv-szerep.ts` egy forrás; legacy metaadat-képnél is
      elrejthető; örökölt `avatar_source` NULL-nál a választó kimondja; `removeProfilePhoto` RLS-néma listázás → hiba; a nem saját
      fájlok érintése rendezve). 0 elutasított találat. Őrszemek: desktop-szinkron 130/130, desktop-kapcsolas-kliens 40/40,
      desktop-kapcsolas 99/99, ertesites-nezet 160/160, ertesites-p3-sql 40/40, profil-pontossag 186/186, naptar-nyomtatvany 121/121.
- [x] Verziók: web **0.9.230** (apps/web/package.json), desktop **0.9.14** (3 fájl + Cargo.lock a cargo check után);
      CHANGELOG-bejegyzés (`2026-09-05-p3-utomunka-desktop-naptar-profil`); `_RUN_LOG` PENDING a `2026-09-05-ertesitesek-p3.sql`-re
      + kozmetikai megjegyzés a naptár-SQL komment-javításáról
- [x] Rust: `cargo check` zöld (desktop v0.9.14, db.rs v34 migráció fordul), `cargo test auth` 28/28 — a `C:\kartoteka-target` közös target-mappával
- [x] Teljes ellenőrzés a merge ELŐTT és UTÁN is: `npm run typecheck` 11/11 · web lint 0 hiba (a 4 figyelmeztetés a main-ről örökölt
      fájlokban: finance-tabs, tagnyilvantartas-help — az ágon nem módosultak) · `lint:imports` 124 fájl OK · `cargo check` + `cargo test auth`
      28/28 · **146/146 őrszem** · web build 85/85
- [x] Kör-commit `ca7dc847` → merge `origin/main` (v0.9.229: #232 docs, #233 betöltés-jelző, #234 GYIK-súgó; 2 ütközés feloldva: lánc +
      CHANGELOG) → merge-commit `2b343d7c` → push → **PR #235: https://github.com/endreszocs/kartoteka/pull/235** — Endre engedélyére vár
      a merge (a main-re push blokkolt). Squash után a következő kör előtt `git reset --hard origin/main`.
- [ ] Asztali build 0.9.14: a p3 fából (`2b343d7c`) INDÍTVA (`ops/release-build.ps1 -Version 0.9.14 -SkipUpload`, napló a scratchpadban:
      `release-0.9.14.log`); a feltöltés az updater-bucketbe KÜLÖN igen-re (érdemes a PR merge-e után)

## 3. HONNAN FOLYTASD, ha félbeszakadt

1. `git -C <munkafa> status` + `git diff` → mi módosult; `npm run typecheck` (mind a 11 workspace).
2. Ha a workflow félbeszakadt: `Workflow({scriptPath: <a scratchpad workflow-script>, resumeFromRunId: <run id>})` — a kész ügynökök gyorsítótárból jönnek.
3. Ha nem folytatható: az 1. táblázat feladat-listái elegendők egy új ügynöknek vagy a koordinátornak.
4. Az ügynökök után a 2. lista sorrendjében.

## 4. Ismert kockázatok

- A desktop 0.9.14 verzió-bump HÁROM fájlban egyszerre (package.json, tauri.conf.json, Cargo.toml + Cargo.lock frissül a következő cargo-futásnál).
- A `packages/ui-app` barrel: hook-os modul 'use client' nélkül a CI-n átmegy, a DEPLOY bukik — az építők tiszta függvények, de a barrel-bővítés után helyi `npm run build --workspace=@kartoteka/web` KÖTELEZŐ.
- Új SQL-fájl → nem hoz létre táblát, mentés-besorolás nem kell; de a `_RUN_LOG`-ba PENDING sor kell.
- A Bash-eszköz heredocja elnyeli a backslash-t → regexes szkript CSAK Write-tal.

## 5. AUTOMATIKUS ÜGYNÖK-STÁTUSZ

<!-- AUTO-START — ezt a szakaszt a KARTOTEKA-p3-utomunka-allapot-frissites-2026-09-05.py írja; kézzel ne szerkeszd -->
_Utolsó automatikus frissítés: 2026-09-05 21:58_

### P3-utómunka (5 impl + ellenőrzés + 5 bíráló + javítók) — `wf_b6205211-63d`
Ügynökök: **17 kész · 0 fut · 4 elhalt** (összesen 21).

#### desk-p3 — asztali alkalmazás, apps/desktop/** + scripts/selftest-desktop-*.mjs): — **KÉSZ**
- kész: igen
- Összefoglaló: desk-p3: mind a 6 feladat kesz. Desktop tsc --noEmit zold, lint:imports OK, sajat selftestek zoldek: selftest-desktop-szinkron 105/105 (+R3/R3n, R4/R4n, N1/N1n, PR1/PR1n, PR2/PR2n, PR3/PR3n), UJ selftest-desktop-kapcsolas-kliens 35/35 (K1-K3, F1-F7 + F1n ket mutans, W1/W1n, U1/U1n), selftest-desktop-sync-print 6/6 (a 3 verzio-fajl egyezese), selftest-desktop-kapcsolas 71/71. A db.rs rustfmt-tel parse-ol (ugyanaz a 8 regi formazasi diff, mint HEAD-en, uj hiba nincs).

1) notifyLocalWriteCommitted az ONLINE mentesekbe: a felmeres szerint az online iras + tukor-frissites mintat az 5 sync.ts-beli mento hordozza, ezeket hivjak a dialogusok (updateOwnProfile <- dashboard-page; createWorklogEntry/updateWorklogEntry <- worklog-create-dialog; deleteWorklogEntry <- munkanaplo-page; updateSzemelyEntry <- member-detail-dialog es family-detail-dialog). Mind az 5 online siker-aga a revision-visszairas…
- Módosított: `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/db.rs`, `apps/desktop/src/lib/write-sync-registry.ts`, `apps/desktop/src/lib/shell/desktop-shell.tsx`, `apps/desktop/src/lib/auth-gate.tsx`, `apps/desktop/src/lib/sync.ts`, `apps/desktop/src/lib/program-tipusok.ts`, `apps/desktop/src/lib/desktop-kapcsolas.ts`, `apps/desktop/src/pages/dashboard-page.tsx`, `apps/desktop/src/pages/elso-inditas-page.tsx`, `apps/desktop/src/pages/home-page.tsx`, `scripts/selftest-desktop-szinkron.mjs`, `scripts/selftest-desktop-kapcsolas-kliens.mjs`
- Új selftestek (REGISZTRÁLANDÓ a package.json-ba): `scripts/selftest-desktop-kapcsolas-kliens.mjs`
- Nyitott kérdések: scripts/selftest-desktop-kapcsolas.mjs egyszerre a kapcsolas-p3 ugynok tulajdona is (a git status szerint o modositotta kozben), ezert az asztali-oldali oroket NEM oda, hanem az UJ scripts/selftest-desktop-kapcsolas-klie… · apps/desktop/src-tauri/src/db.rs v34 migracio (4 ALTER a gyulekezeti_programok_local-on, user_version 34): Rust-szerkesztes cargo nelkul; a koordinator cargo check-je kotelezo (rustfmt-tel parse-ol, uj hiba nincs; a Carg… · A penzugyi rogzito (apps/desktop/src/components/combined-entry-dialog.tsx handleIncomeBatch/handleExpenseBatch) online agban a @kartoteka/core use-case kozvetlenul a Supabase-be ir, a tukrot NEM frissiti (a penzugy-page/… · apps/desktop/src/components/desktop-budget-tab.tsx (saveBudgetRows/saveBudgetModification/finalize*, void pullFinanceSettings) es member-detail-dialog.tsx (voter recompute + delta pull) online iras utan PULL-alapu tukor-… · A packages/ui-app/src/dashboard/UpcomingPrograms.tsx (naptar-p3 tulajdon) a 21 tipus cimke/szin/ikon terkepet NEM exportalt belso masolatkent tartja; a desktop uj program-tipusok.ts-e a WEBES dashboard.ts-hez van merve (… · getLocalUpcomingPrograms-t ma egyetlen desktop felulet sem hivja (a kezdolap a getLocalPrograms + expandUpcomingProgramOccurrences utat jarja, ami az ismetlodest is kibontja); a fuggveny javitva es orzott, de ha a jovobe… · A varazslo lejart/elhalt uzenete a szerver uzenetet adja tovabb, ha van (a kapcsolas-p3 uj lejart-uzenete igy latszik); ha a kapcsolas-p3 mas allapot-nevet vezetne be (nem lejart), a kliens ismeretlen-agon vegleges hibak…

#### kapcsolas-p3 — asztali eszköz-kapcsolás webes oldala — **KÉSZ**
- kész: igen
- Összefoglaló: kapcsolas-p3 — mind a 4 pont kész, kizárólag a saját tulajdonban (middleware.ts, lib/desktop-kapcsolas/szerver.ts, scripts/selftest-desktop-kapcsolas.mjs; az API-route-ok nem igényeltek változást).

1) middleware.ts: az isDesktopKapcsolasApiRoute a startsWith('/api/desktop-kapcsolas/') előtag helyett PONTOS allowlist (DESKTOP_KAPCSOLAS_NYILVANOS_UTVONALAK ReadonlySet: /inditas, /allapot, /nyit). Minden más — al-útvonal, záró perjeles alak, jövőbeli végpont — alapból a bejelentkezés-kapura esik (fail-closed). A Next proxy-doksi (node_modules/next/dist/docs/.../proxy.md, Execution order) szerint a beépített trailing-slash redirect a proxy ELŐTT fut, ezért a pontos egyezés nem szigorúbb a kelleténél.

2) szerver.ts jovahagyKapcsolast: a generateLink ELŐTT felulirKorabbiJovahagyasokat — az ugyanazon user_id korábbi 'jovahagyva' sorai 'lejart'-ra, token_hash NULL-lal (.eq(user_id).eq(allapot,…
- Módosított: `apps/web/lib/supabase/middleware.ts`, `apps/web/lib/desktop-kapcsolas/szerver.ts`, `scripts/selftest-desktop-kapcsolas.mjs`
- Nyitott kérdések: apps/web/app/(dashboard)/desktop-kapcsolas/actions.ts (NEM az én fájlom): 77. sor → olvasKapcsolasKeres(id.toLowerCase(), f.userId); a KapcsolasKeresNezet kapjon egy masikGepVarakozik mezőt (a sor.masikFuggoJovahagyas-bó… · apps/web/components/desktop/desktop-kapcsolas-panel.tsx (NEM az én fájlom): a 'keres' fázisban, ha keres.masikGepVarakozik van, borostyán sáv a gombok fölé (ShieldAlert): Egy másik gép (<eszközNév>) jóváhagyását az aszta… · apps/web/lib/export/betekintes-naplo.ts (ebben a körben senkié): a MUVELET_MONDATOK-ba a 'desktop.kapcsolas_jovahagyva' sor mellé: 'desktop.kapcsolas_felulirva': 'lezárta egy asztali gép korábbi, még át nem vett összekap… · Le nem zárható versenyablak (dokumentálva a szerver.ts-ben): ha a másik gép PONT a felülírás pillanatában igényli a tokent (felhasznalva), de a verifyOtp-je csak a mi generateLink-ünk után fut, a token ott hal el — ezt a… · A felülírt sor, ha az asztali app csak a lejar UTÁN kérdezi le, az általános (két okot megnevező) üzenetet kapja — szándékos, sémaváltozás nélkül; ha később pontos ok kell, egy lezaras_oka oszlop (SQL) kellene. · desk-p3-nak jelzés: az apps/desktop/src/lib/desktop-kapcsolas.ts:146 helyi lejárat-üzenete ('A kérés lejárt (10 perc). Indíts újat.') és a szerver új szövege ('…Indítsd újra az összekapcsolást.') eltér — érdemes egységes… · Koordinátornak: a tsc-futásaim alatt a profil-p3 app/(dashboard)/profile/actions.ts átmeneti hibái (TS2739 ProfileDialogData; TS2304 torolRegiProfilkepeket) látszottak; a záró futásban 0 hiba — a végső ellenőrzésnél újra…

#### ertesites-p3 — értesítések — **KÉSZ**
- kész: igen
- Összefoglaló: ERTESITES-P3 KESZ. Ellenorzes: apps/web tsc exit 0; eslint a modositott fajlokon exit 0; lint:desktop-imports OK; selftest-ertesites-nezet 72 -> 117/117; UJ selftest-ertesites-p3-sql 34/34; selftest-ertesites-felado 56/56 es felado-sql 6/6 tovabbra is zold.

(1a) OLVASASKOR (apps/web/lib/notifications/uzenetek-actions.ts): uj kerelemAllapotok() a sorok altal hivatkozott hozzaferes-kerelmek TENYLEGES allapotat keri le az admin_access_requests tablabol (id, status, approved_at, denied_at, expires_at; a nevek a Database_schema.sql-bol es a 2026-08-25 b1-b2 SQL-bol: status CHECK pending|approved|denied|expired), 80-as .in() darabokban (414-or), a bejelentkezett felhasznalo kliensevel (aar_olvasas policy: kerelmezo / megszolitott lelkesz / globalis jog = pontosan akik ertesitest kaptak). Az azonosito EGY szabalybol: kerelemAzonosito (admin_request_id oszlop, vagy a regi sorok admin_access:<id…
- Módosított: `apps/web/lib/notifications/uzenetek-shared.ts`, `apps/web/lib/notifications/uzenetek-actions.ts`, `apps/web/lib/notifications/beszelgetesek.ts`, `apps/web/components/notifications/ertesites-inbox.tsx`, `apps/web/app/(dashboard)/notifications/page.tsx`, `scripts/selftest-ertesites-nezet.mjs`, `migration-docs/sql/2026-09-05-ertesitesek-p3.sql`, `scripts/selftest-ertesites-p3-sql.mjs`
- Új selftestek (REGISZTRÁLANDÓ a package.json-ba): `scripts/selftest-ertesites-p3-sql.mjs`
- SQL-igény: migration-docs/sql/2026-09-05-ertesitesek-p3.sql - Endre futtassa (Supabase SQL Editor, az EGESZ fajl, idempotens, tobbszor futtathato). ELOFELTETEL (a fajl 0) lepese fail-closed meri, es RAISE EXCEPTION-nel MEGALL, semmit nem modositva, ha hianyzik): (a) 2026-08-11-ertesites-megoldva.sql (a megoldva / megoldva_at oszlop) - a _RUN_LOG-ban NINCS bejegyzese, allapota ismeretlen; ha az oszlop hianyzi…
- Nyitott kérdések: A 2026-08-11-ertesites-megoldva.sql statusza ismeretlen (nincs a _RUN_LOG-ban). Ha nem futott, a P3 SQL 0) lepese megall - elobb azt kell futtatni. Az OLVASASI ut (megoldasLevezetes) ettol fuggetlenul mar most helyesen m… · Kozmetika, koordinatori dontes: a kerelmezo (rendszergazda) sajat 'Hozzaferes johagyva/elutasitva' soran (2026-09-05 ota admin_request_id-vel) most zold 'Megoldva' pill + sav jelenik meg 'A hozzaferesi kerelem idokozben … · Szandekos elteres a brieftol: megoldva_at = coalesce(e.megoldva_at, <a dontes ideje: approved_at/denied_at/expires_at status szerint>, now()) - a brief coalesce(megoldva_at, now())-ot irt. Indok: a buborek zold savja ezt… · A csengo (apps/web/components/layout/notification-bell-refined.tsx - NEM az en tulajdonom) a kerelem-allapot figyelmeztetest a meglevo friss.error piros role=alert dobozaban mutatja (a szamlalo-hibakkal azonos lanc). Ha … · Regisztracio a gyoker package.json-ban (koordinator): "selftest:ertesites-p3-sql": "node scripts/selftest-ertesites-p3-sql.mjs" (a selftest:ertesites-felado-sql melle). · A SQL-t elo adatbazison nem tudtam probafuttatni (nincs Kartoteka-Supabase eleres; a forras-or es a gondos atolvasas a biztositek). Ha a 0) lepes vagy az UPDATE barmelyik hibaval megall, a Supabase-szerkeszto egy tranzak…

#### naptar-p3 — webes naptár — **KÉSZ**
- kész: igen
- Összefoglaló: Mind a 6 pont kész, minden ellenőrzés zöld (web tsc 0, ui-app typecheck 0, ESLint 0 az érintett fájlokon, selftest-naptar-nyomtatvany 121/121, selftest-naptar-retegek 84/84, `npm run build --workspace=@kartoteka/web` exit 0, 85/85 lap — a barrel-bővítés miatt kötelező deploy-próba).

1) ISMÉTLŐDŐ SOROZAT ANYAKÖNYVEZÉSE TILOS — `kapcsolProgramAnyakonyvhoz` a `select`-be felveszi az `ismetlodes_tipus`-t, és az UPDATE ELŐTT (a toggleProgramDone kapujának mintájára) `{ ok:false, error: ISMETLODO_SOROZAT_ANYAKONYV_HIBA }`-val tér vissza. Az üzenet EGY forrásból jön (`lib/calendar/naptar-retegek-types.ts`, direktíva-mentes): „Ismétlődő sorozat nem anyakönyvezhető… Hozz létre erre a napra egy egyedi (nem ismétlődő) alkalmat…". A csempe (`program-scheduler.tsx` `onAnyakonyvezes`) a dialógus megnyitása ELŐTT ugyanezt toastolja és megáll — különben a registry-sor már mentve lenne, a kötés meg elbu…
- Módosított: `apps/web/app/(dashboard)/programs/actions.ts`, `apps/web/lib/calendar/program-ev-metszet.ts`, `apps/web/lib/calendar/naptar-retegek-types.ts`, `apps/web/components/dashboard/program-scheduler.tsx`, `apps/web/components/dashboard/program-agenda-card.tsx`, `apps/web/components/dashboard/szuletesnapos-naptar-print.tsx`, `apps/web/components/dashboard/naptar-nyomtatvany-modal.tsx`, `packages/ui-app/src/dashboard/index.ts`, `packages/ui-app/src/members/index.ts`, `migration-docs/sql/2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql`, `scripts/selftest-naptar-nyomtatvany.mjs`, `scripts/selftest-naptar-retegek.mjs`
- Nyitott kérdések: Az ÉLŐ adatbázisban a public_calendar_feed függvény-kommentje (pg_description) a régi „szabadság-típus NÉLKÜL” szöveggel marad, amíg a fájl nem fut újra — kozmetikai; ha Endre rendezni akarja újrafuttatás nélkül, egyetle… · packages/ui/src/kartoteka.css `.kt-eves-modal` (nem tulajdonom) — nem kellett módosítani, mert már ugyanazt a méretet hordozza; az F2c őr mostantól OLVASSA ezt a CSS-t (reszponzív min(…vw)×min(…vh)-t vár rajta), tehát ha… · apps/web/lib/utils/program-recurrence.ts fejléc-kommentje (16–19. sor, nem tulajdonom: lib/utils) még azt mondja, hogy „évhatáron túli ismétlődés nincs” és a horizont a kezdő év vége — a PR-20 óta elavult (horizonYear + … · Éves programterv (annual-plan-print.tsx, tulajdonom): réteg-hibánál továbbra is épít (toast + hibalista a panelen), mert ott a programok a fő tartalom, a réteg csak kiegészítés — tudatos döntés; ha a bíráló a lelkészi pé… · Desktop-paritás: a desk-p3 ügynök (apps/desktop) mostantól a barrelből importálhatja a buildEvesNaptar/buildKoszontoNaptar építőket (`@kartoteka/ui-app`) — a bekötés nem része ennek a körnek.

#### profil-p3 — profil — **KÉSZ**
- kész: igen
- Összefoglaló: profil-p3 — mind a 6 pont kész. apps/web typecheck (tsc --noEmit) ZÖLD, eslint a módosított fájlokon ZÖLD, scripts/selftest-profil-pontossag.mjs 148/148 (106 → 148: +42 új őr, mind mutánssal), a fájljaimat olvasó selftest-hatokor és selftest-jelszo-munkamenet is zöld.

1) Google-fotó ≠ törlés (profile/actions.ts): a DÖNTÉS és a FÁJL különvált. Új közös valtAvatarForras(supabase, user, source) csak az avatar_source-t írja (CHECK értékek a 2026-09-05-profil-pontossag.sql-ből: upload | google | none), a photo_url és a fájl érintetlen (irAvatarDontes: photoUrl === undefined → a photo_url-hoz nem nyúl). applyGooglePhoto mostantól csak vált; ÚJ applyUploadedPhoto (fail-closed: csak ha van photo_url) és applyNoPhoto (monogram, törlés nélkül). removeProfilePhoto = a FELTÖLTÖTT kép végleges törlése: előbb a tárhely (igazolt törlés), csak utána a DB; Google-döntésnél a Google marad, különben none.…
- Módosított: `apps/web/app/(dashboard)/profile/actions.ts`, `apps/web/app/(dashboard)/profile/profile-dialog-shared.ts`, `apps/web/app/(dashboard)/profile/page.tsx`, `apps/web/app/(dashboard)/profile/kapcsolatok/page.tsx`, `apps/web/app/(dashboard)/profile/kapcsolatok/actions.ts`, `apps/web/components/modals/profile-dialog.tsx`, `apps/web/lib/types/auth.ts`, `apps/web/lib/profile-roles/labels.ts`, `apps/web/lib/profile-roles/aktiv-szerep.ts (ÚJ)`, `apps/web/lib/profile-roles/orokolt-szerep.ts (ÚJ)`, `scripts/selftest-profil-pontossag.mjs`
- Nyitott kérdések: Nincs új SQL, de a törlés-ág a MÁR ÁTADOTT migration-docs/sql/2026-09-05-profil-pontossag.sql 4) részére (logos_profilkep_sajat_delete policy) épül: amíg az nem fut le élesben, a Feltöltött kép törlése fail-closed HIBÁT … · apps/web/lib/utils/date.ts:104-114 (nem az én tulajdonom): az ugyanazABukarestiNap docblockja még a profil örökölt-szerep jelzésére hivatkozik, de az app már nem használja (csak a selftest, a hibaosztály bizonyítékaként)… · apps/web/components/admin/users/user-visuals.ts:34 getUserStatusMeta (admin-tulajdon): saját switch a 4 státuszra, string paraméterrel — javaslat: ProfileStatus | null paraméter + Record<ProfileStatus, ...> térkép, hogy … · Tervezési megjegyzés: a profil-dialógus a components/admin/admin-confirm-dialog.tsx-et importálja (a meglévő megerősítő minta). Ha a koordinátor területi határt akar, a komponens egy általános components/ui helyre költöz… · Feltételezés (fail-closed irányban): a Storage remove() válaszában a name a teljes objektum-út (profiles/<uid>/avatar.jpg — a Storage API így adja). Ha valaha prefix-relatív nevet adna, az ellenőrzés hangos figyelmezteté…

#### ellenőrzés-ügynök — **KÉSZ**
- typecheck: True · lint: True · selftest: True
- Javítások: ELLENŐRZÉS (mind ZÖLD): (1) npm run typecheck a gyökérben — mind a 11 workspace exit 0; a saját szerkesztéseim után apps/web npx tsc --noEmit újra exit 0 (csak apps/web fájlt módosítottam). (2) apps/w… · kapcsolas-p3 nyitott #1 MEGOLDVA — apps/web/app/(dashboard)/desktop-kapcsolas/actions.ts: getKapcsolasKeres a f.userId-vel hívja az olvasKapcsolasKeres-t; új MasikGepVarakozik típus ({eszkozNev, jovah… · kapcsolas-p3 nyitott #2 MEGOLDVA — apps/web/components/desktop/desktop-kapcsolas-panel.tsx: a döntés ELŐTT borostyán role=status sáv, ha egy másik gép jóváhagyása még nincs átvéve (eszköznévvel; 'isme… · kapcsolas-p3 nyitott #3 MEGOLDVA — apps/web/lib/export/betekintes-naplo.ts MUVELET_MONDATOK: 'desktop.kapcsolas_felulirva' magyar mondattal (eddig a kimutatás 'ismeretlen műveletet végzett' felvezetés… · kapcsolas-p3 #6 / desk-p3 #7 ELLENŐRIZVE, változtatás nem kellett: apps/desktop/src/lib/desktop-kapcsolas.ts:303 helyi lejárat-üzenete már azonos a szerver LEJART_UZENET.varakozasKozben szövegével ('A… · profil-p3 nyitott #3 MEGOLDVA — apps/web/components/admin/users/user-visuals.ts getUserStatusMeta: a switch helyett Record<ProfileStatus, Omit<UserStatusMeta,'label'>> látvány-térkép (új DB-érték → fo… · profil-p3 nyitott #2 MEGOLDVA — apps/web/lib/utils/date.ts ugyanazABukarestiNap docblockja: kimondja, hogy a profil örökölt-szerep döntése az orokolt-szerep.ts-ben él, a függvény a hibaosztály bizonyí… · naptar-p3 nyitott #3 MEGOLDVA — apps/web/lib/utils/program-recurrence.ts fejléc-kommentje: az elavult 'évhatáron túli ismétlődés nincs (nincs záró-dátum mező)' helyett a valóság: horizonYear (PR-20) +… · ertesites-p3 nyitott #4 MEGOLDVA — a csengő nem végzetes figyelmeztetése borostyán, mint a listában: apps/web/lib/notifications/uzenetek-shared.ts FrissErtesitesek.warning; uzenetek-actions.ts listFri… · desk-p3 nyitott #5 részben (MÉRVE, nem összevonva): scripts/selftest-desktop-szinkron.mjs PR1f + PR1fn/a,b — az ui-app UpcomingPrograms.tsx NEM exportált címke/szín-tükrét a webes dashboard.ts-hez mér… · ŐRSZEMEK minden javításhoz, mutánssal: scripts/selftest-desktop-kapcsolas.mjs A1/A1n/A1u/A2/A2n/A3 (71→78; a leképezés kivágva és FUTTATVA; a userId nélkül olvasó akció- és a sáv nélküli panel-mutáns …
- MARADÉK HIBÁK: KOORDINÁTOR (gyökér package.json tiltott nekem): a két ÚJ selftest regisztrálása — package.json:165 után 'selftest:desktop-kapcsolas-kliens': 'node scripts/selftest-desktop-kapcsolas-kliens.mjs' és 's… · KOORDINÁTOR: cargo check + cargo test auth — apps/desktop/src-tauri/src/db.rs v34 migráció (4 ALTER a gyulekezeti_programok_local-on, user_version 34) cargo nélkül készült; a Cargo.lock 0.9.14-re ekko… · KOORDINÁTOR: web verzió — apps/web/package.json:3 még 0.9.227 (cél 0.9.228 a lap szerint); a CHANGELOG-bejegyzéssel együtt (mindkettő koordinátori). · KOORDINÁTOR _RUN_LOG: PENDING sor a migration-docs/sql/2026-09-05-ertesitesek-p3.sql-re; + egy sor, hogy a 2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql 2026-09-05-i változata CSAK komment-javítás,… · ENDRE (SQL, kozmetika): az ÉLŐ DB-ben a public_calendar_feed függvény-kommentje a régi szöveg marad, amíg a fájl nem fut újra; egy sor elég: COMMENT ON FUNCTION public.public_calendar_feed(uuid) IS '<… · ENDRE (SQL): a 'Feltöltött kép törlése' a MÁR ÁTADOTT migration-docs/sql/2026-09-05-profil-pontossag.sql 4) részére (logos_profilkep_sajat_delete policy) épül — amíg nem fut le élesben, a törlés fail-… · KÉSŐBBI REFAKTOR (EGY igazságforrás): a program-típus térképek HÁROM példányban élnek (apps/web/lib/constants/dashboard.ts kanonikus; packages/ui-app/src/dashboard/UpcomingPrograms.tsx:45–75 belső más… · desk-p3 tudatos kihagyás, koordinátori döntés: apps/desktop/src/components/combined-entry-dialog.tsx handleIncomeBatch/handleExpenseBatch online ága nem hív notifyLocalWriteCommitted-et (a core use-ca… · apps/desktop/src/lib/sync.ts getLocalUpcomingPrograms-nak ma egyetlen desktop felület sem hívója (a kezdőlap a getLocalPrograms + expandUpcomingProgramOccurrences utat járja) — javítva és őrzött; ha n… · ertesites-p3 kozmetika, koordinátori döntés: a kérelmező rendszergazda saját 'Hozzáférés jóváhagyva/elutasítva' sora zöld Megoldva pill + 'A hozzáférési kérelem időközben jóváhagyásra került.' mondatt… · ertesites-p3 szándékos eltérés a brieftől (elfogadásra): a SQL megoldva_at = coalesce(e.megoldva_at, <a döntés ideje status szerint>, now()) — a brief now()-ot írt; indok: a buborék zöld sávja ezt írj… · Le nem zárható versenyablak (dokumentálva apps/web/lib/desktop-kapcsolas/szerver.ts-ben): ha a másik gép PONT a felülírás pillanatában igényli a tokent, de a verifyOtp-je a mi generateLink-ünk után fu…

#### BÍRÁLÓ — desk-p3 — **KÉSZ**
- Bírálati találatok: 5 (P2 Az ÉLŐ közelgő-programok út az előző évben kezdődő, még tartó többnapos alkalmat (dec. 27 …, P3 getLocalUpcomingPrograms: hívó nélküli függvény, az ablak-szabály második (SQL) példányáva…, P3 ismeretlenAllapotAtmeneti: a vezérlés egy magyar üzenetszövegre kulcsol a hálózati határon…, P3 program-tipusok.ts: a címke/emoji/szín tükör és a segédfüggvények egyetlen desktop-fogyasz…, P3 A várakozás alatti zavar-doboz nyers amber paletta + dark: variánsok a téma-token/alpha mi…)

#### BÍRÁLÓ — naptar-p3 — **KÉSZ**
- Bírálati találatok: 3 (P2 cal-print-11 a desktopon MEGMARADT: a getLocalPrograms év-szűrője a KEZDŐ napot nézi (web …, P3 A köszöntő naptár réteg-kulcsai (szuletesnapok/nevnapok) sztringként, nem a hibak-unióhoz …, P3 Az F2c őr a modál CSS-méretének csak az ALAKJÁT méri (min(…vw)/min(…vh)), az értékét nem —…)

#### BÍRÁLÓ — ertesites-p3 — **KÉSZ**
- Bírálati találatok: 5 (P2 A kérelmező SAJÁT döntés-során a tartalék-ágon „Válaszra vár” pill + Jóváhagyás/Elutasítás…, P3 A kérelmező döntés-során a zöld sáv önellentmondó mondata: „Ez a baj azóta elmúlt. A hozzá…, P3 Az őr vak az alakit() kérelem-bekötésére: a `kerelem: kerelmek.get(...)` és az `allapotok.…, P3 A régi `admin_access:<id>` hivatkozás elfogadási szabálya eltér TS-ben és SQL-ben — egy ro…, P3 kerelemEldoltE: a komment „ISMERT, nem-pending” állapotot ígér, a kód feketelistás (bármil…)

#### BÍRÁLÓ — profil-p3 — **KÉSZ**
- Bírálati találatok: 5 (P2 Kapcsolatok-döntés: a dialógus adata a NYERS profile.role-ból, a másik három hely az acces…, P3 Csak metaadat-forrású (legacy) profilképnél eltűnt minden elrejtési lehetőség — a régi „El…, P3 Örökölt (avatar_source NULL) sornál a forrás-váltó egyetlen gombja sem aktív, miközben a f…, P3 removeProfilePhoto: ha a hivatkozott fájl nincs a list() eredményében, a törlés „igazoltna…, P3 Tulajdonon kívüli fájlok módosultak (date.ts docblock, user-visuals.ts), és a selftest egy…)

#### BÍRÁLÓ — kapcsolas-p3 — **KÉSZ**
- Bírálati találatok: 6 (P3 A W5b őr vak: a „felülírta” minta az ÁLTALÁNOS lejárt-üzenetre is illik — a pontos ok leve…, P3 A 3. pont szerver-oldala (keresMasikFuggoJovahagyast) funkcionálisan őrizetlen — a fail-op…, P3 Sorrend-mellékhatás: ha a generateLink (vagy a fiók-eltérés kapu) bukik, a másik gép ÉLŐ j…, P3 Dokumentálatlan második versenyablak: két EGYIDEJŰ jóváhagyás esetén egyik felülírás sem l…, P3 Az audit a MÁR LEJÁRT (mar_lejart=true) sorokra is a „felülírta” cselekvés-kulcsot írja — …, P3 Az allowlist három helyen élő útvonal-literál, és nincs őr, ami a három bejegyzést a létez…)

#### JAVÍTÓ — kapcsolas-p3 — **ELHALT**
- hiba: ismeretlen hiba

#### JAVÍTÓ — ertesites-p3 — **ELHALT**
- hiba: ismeretlen hiba

#### JAVÍTÓ — naptar-p3 — **KÉSZ**
- Összefoglaló: Mind a 3 bírálói találat a forrásban IGAZOLVA, mind a 3 javítva, mindhez őrszem mutánssal.

(1) P2 — desktop-paritás (cal-print-11): apps/desktop/src/lib/sync.ts getLocalPrograms WHERE-je `datum >= ?2 AND datum <= ?3` volt (a kezdő nap éve). Most a webes program-ev-metszet.ts tükre: `AND datum <= ?3 AND (datum_vege >= ?2 OR datum >= ?2)` — szándékosan NEM COALESCE (a kezdő nap előtti hibás záró napnál a COALESCE a hibás napot venné, a webes programZaroNapja a kezdőre esik vissza); a MIÉRT a függvény fejléc-kommentjében, a webes fájlra hivatkozva. A paraméterek (év első/utolsó napja) változatlanok. Egyetlen hívó a home-page.tsx (curYear + évhatárnál curYear+1), az expandUpcomingProgramOccurrences ablak-szűrője a záró napot nézi, így a dec. 30. – jan. 2. tábor januárban most már az asztali kezdőlapon is látszik. A fájl a desk-p3 tulajdona — a brief szerint kis, célzott Edit-tel javítottam …
- Módosított: `apps/desktop/src/lib/sync.ts`, `apps/web/components/dashboard/szuletesnapos-naptar-print.tsx`, `apps/web/components/dashboard/naptar-nyomtatvany-modal.tsx`, `scripts/selftest-naptar-nyomtatvany.mjs`, `scripts/selftest-desktop-szinkron.mjs`
- Javítva: 3 · elutasítva: 0

#### JAVÍTÓ — profil-p3 — **ELHALT**
- hiba: ismeretlen hiba

#### JAVÍTÓ — desk-p3 — **ELHALT**
- hiba: ismeretlen hiba

#### JAVÍTÓ — desk-p3 — **KÉSZ**
- Összefoglaló: desk-p3 JAVÍTÓ — mind az 5 bírálói találat a forrásban igazolva; 5/5 javítva (a P2 lényegét a párhuzamos naptar-p3 javító SQL-alakja már lezárta, én az ÉLŐ útra tettem funkcionális őrt), 0 elutasítva; közben 2 SAJÁT, P2-osztályú lelet is javítva. Ellenőrzés ZÖLD: selftest-desktop-szinkron 118→130/130, selftest-desktop-kapcsolas-kliens 35→40/40, selftest-desktop-sync-print 6/6, selftest-desktop-pin-fiok 53/53 (a fájljaimat olvassa), apps/desktop `npx tsc --noEmit` exit 0, lint:desktop-imports OK (124 fájl, 0 tiltott).

MIT ÉS MIÉRT (röviden):
(1) P2 — home-page.tsx:165 „előző évben kezdődő szabadság januárban eldobva”: IGAZOLTAM, hogy a forrásban a getLocalPrograms WHERE-je már az intervallum-metszet (sync.ts, a naptar-p3 javító tette: `datum <= ?3 AND (datum_vege >= ?2 OR datum >= ?2)`), így a januári tárgyévi lekérdezés hozza a dec. 27. – jan. 5. szabadságot; a bíráló needPrevYear-eszkö…
- Módosított: `apps/desktop/src/lib/sync.ts`, `apps/desktop/src/pages/home-page.tsx`, `apps/desktop/src/lib/program-tipusok.ts`, `apps/desktop/src/lib/desktop-kapcsolas.ts`, `apps/desktop/src/pages/elso-inditas-page.tsx`, `scripts/selftest-desktop-szinkron.mjs`, `scripts/selftest-desktop-kapcsolas-kliens.mjs`
- Javítva: 7 · elutasítva: 0

#### JAVÍTÓ — naptar-p3 — **KÉSZ**
- Összefoglaló: A bíráló 3 találatát (1 P2 + 2 P3) a p3-utomunka munkafa forrásában soronként igazoltam. MIND A HÁROM MÁR JAVÍTVA ÁLL a munkafában (a bírálat lefutása után, más ügynök/korábbi javító-futás által), őrszemekkel, mutánsokkal — ezért ebben a futásban fájlt NEM módosítottam, hanem a javítások teljességét és a kapukat ellenőriztem.

(1) P2 — desktop cal-print-11 (apps/desktop/src/lib/sync.ts, getLocalPrograms): a WHERE már `AND datum <= ?3 AND (datum_vege >= ?2 OR datum >= ?2)` (NEM COALESCE — a fejléc-komment kimondja a miértet: a kezdő nap előtti hibás záró napnál a webes programZaroNapja a kezdő napra esik vissza), a komment a program-ev-metszet.ts programEvMetszetSzuro-jára hivatkozik. Őr: scripts/selftest-desktop-szinkron.mjs PR4 (node:sqlite-val FUTTATVA: dec. 30.–jan. 2. tábor januárban látszik; előző évi egynapos kimarad; hibás záró napú, az évben kezdődő sor látszik), PR4n/PR4nc mután…
- Javítva: 3 · elutasítva: 0

#### JAVÍTÓ — kapcsolas-p3 — **KÉSZ**
- Összefoglaló: KAPCSOLAS-P3 JAVITO — allapot: mind a 6 biraloi P3 talalat VALOS (forrasban igazolva) es LEZARVA. A munkafaban a javitasok zome mar allt (egy korabbi javito-menet vitte fel, a kommentek is hivatkoznak rajuk) — ezt tetelesen ellenoriztem fajl:sor szinten, es a hianyzo sorrend-mutanst potoltam. Vegeredmeny: scripts/selftest-desktop-kapcsolas.mjs 99/99 zold (97 -> 99 az uj W4an-elofeltetel + W4an mutanssal); apps/web `npx tsc --noEmit` kilepesi kod 0, ures kimenet. Nem futtattam: teljes selftest-lanc, cargo (koordinator).

TETELES IGAZOLAS:
1) W5b vak — selftest 735-749: a felulirt sorra a KONKRET szoveg (/egy ujabb jovahagyas lezarta/ ES !/vagy egy ujabb/ ES /inditsd ujra/i); W5bn mutans: lejartOka -> mindig LEJART_UZENET.altalanos — az or meri, hogy a REGI laza (/felulirta/ + /inditsd ujra/) minta meg atengedne, az uj bukik. Levezetes: szerver.ts:204-208.
2) keresMasikFuggoJovahagyast ori…
- Módosított: `scripts/selftest-desktop-kapcsolas.mjs`, `apps/web/lib/desktop-kapcsolas/szerver.ts`, `apps/web/lib/supabase/middleware.ts`
- Javítva: 6 · elutasítva: 0

#### JAVÍTÓ — ertesites-p3 — **KÉSZ**
- Összefoglaló: ERTESITES-P3 JAVÍTÓ KÖR — kesz=true. Mérés: apps/web tsc --noEmit ZÖLD (exit 0); selftest-ertesites-nezet.mjs 160/160, selftest-ertesites-p3-sql.mjs 40/40 (ÚJ fájl — a koordinátor regisztrálja a láncba), selftest-ertesites-felado.mjs 56/56, selftest-ertesites-felado-sql.mjs 6/6.

ÁLLAPOT BELÉPÉSKOR: a munkafa forrásfájljai már hordozták mind az 5 javítást (egy korábbi menet): uzenetek-shared.ts (kerelemDontesSorE; KERELEM_ELDOLT_ALLAPOTOK fehérlista; UUID_MINTA + kerelemAzonosito UUID-szűrés; kerelemAllapotTerkep tiszta térkép-építő; megoldasLevezetes(tipus, adminRequestId) → dontesSor), notifications/actions.ts + ertesites-insert.ts (a döntés-sor beszúráskor megoldva:true + megoldva_at:dontesIdeje, mindkét ágon; oszlop-hiánynál visszaesés), uzenet-buborek.tsx (zöld sáv csak megoldva ÉS nem döntés-sor), az SQL (r.status IN approved/denied/expired; a TS-sel azonos UUID-regex). Az ŐRSZEMEK…
- Módosított: `scripts/selftest-ertesites-nezet.mjs`, `scripts/selftest-ertesites-p3-sql.mjs`, `apps/web/lib/notifications/uzenetek-shared.ts`, `apps/web/lib/notifications/uzenetek-actions.ts`, `apps/web/lib/notifications/ertesites-insert.ts`, `apps/web/lib/notifications/beszelgetesek.ts`, `apps/web/app/(dashboard)/notifications/actions.ts`, `apps/web/app/(dashboard)/notifications/page.tsx`, `apps/web/components/notifications/uzenet-buborek.tsx`, `apps/web/components/notifications/ertesites-inbox.tsx`, `apps/web/components/layout/notification-bell-refined.tsx`, `migration-docs/sql/2026-09-05-ertesitesek-p3.sql`
- Javítva: 5 · elutasítva: 0

#### JAVÍTÓ — profil-p3 — **KÉSZ**
- Összefoglaló: profil-p3 JAVÍTÓ — mind az 5 bírálati találat IGAZOLVA a forrásban és javítva; elutasítás nincs. Végállapot: scripts/selftest-profil-pontossag.mjs 186/186 (154 → +32 új őr, mindegyik mutánssal), apps/web tsc --noEmit exit 0, ESLint a módosított fájlokon exit 0; a fájljaimat olvasó szomszéd őrök (selftest-hatokor, selftest-jelszo-munkamenet, selftest-status-kapu) zöldek. Git-művelet, gyökér package.json, CHANGELOG, _RUN_LOG NEM érintve.

KIINDULÓ ÁLLAPOT: a munkafában a SZERVER-oldal (actions.ts, profile-dialog-shared.ts, profile-avatar-shared.ts, aktiv-szerep.ts) már hordozta a bírálati pontokra adott javításokat (egy korábbi, félbeszakadt javító-futásból — a lap 4 elhalt ügynököt jelez), de a dialógus (profile-dialog.tsx) és az őrszem elmaradt: a selftest 3 őre bukott (P2b, P2d, P4c), a felület nem használta az új adatszerződést. Ezt zártam le.

1) P2 — Kapcsolatok-döntés bemenete: acti…
- Módosított: `apps/web/components/modals/profile-dialog.tsx`, `apps/web/app/(dashboard)/profile/profile-dialog-shared.ts`, `scripts/selftest-profil-pontossag.mjs`, `apps/web/app/(dashboard)/profile/actions.ts`, `apps/web/lib/auth/profile-avatar-shared.ts`, `apps/web/lib/profile-roles/aktiv-szerep.ts`
- Javítva: 5 · elutasítva: 0

<!-- AUTO-END -->
