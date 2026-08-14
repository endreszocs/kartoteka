# DESKTOP PARITÁS-TERV — 2026-08-15

**Készült:** Endrének, a 7. kör 3. pontjához („Desktop paritás ellenőrzése").
**Módszer:** csak olvasás — az `apps/desktop` oldalai, az `apps/web` új funkciói
(az elmúlt két hét PR-jai, #150–#162) és a `packages/ui-app` közös komponensei
kerültek összevetésre. Minden állításhoz fájl-hivatkozás tartozik.
**Állapot a vizsgálatkor:** web `v0.9.166` (`apps/web/package.json`),
desktop `v0.9.11` (`apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`).

---

## Vezetői összefoglaló (3 mondatban)

1. **A legnagyobb nyereség nem fejlesztés, hanem egy új desktop-kiadás.** A
   pénzügy-mag, a kassza-finomítások (13. pont) és a nyomtatási központ összes
   friss javítása (14–17. pont, K1 Főkönyv-lapozás, kétnyelvű nyomtatványok,
   RO-diakritika) a **közös** `packages/ui-app` csomagban landolt — a desktop
   forráskódja már tartalmazza őket, csak a 0.9.11-es build óta nem jutottak el
   a lelkész gépére.
2. **Két valódi, fájó hiány van:** a **leltár** (a desktop read-only, nincs
   fisa, nincs új tétel — `apps/desktop/src/pages/leltar-page.tsx` 4. és 12. sor)
   és a **személy-kivezetés** (a desktop a régi „elrejtés" utat őrzi, a webes
   négyutas, anyakönyvvel összekötött kivezetés helyett —
   `apps/desktop/src/components/member-detail-dialog.tsx` 88. sor).
3. **Időzített bomba a tükör-másolat:** a munkanapló EREK-típuslistája és több
   címke-készlet a desktopon kézi másolatban él (nem közös csomagban) — ez
   pontosan az a hibaosztály, ami miatt „a második felület a régi
   implementációt őrzi" (lásd 4.5. kockázat).

---

## 1. PARITÁS-TÁBLA

A „súly" oszlop a **lelkész munkájára** vetített hiányt méri, nem a technikai
nagyságot: 🔴 = a napi/hivatalos munkát akadályozza; 🟡 = kerülőúttal (web)
megoldható, de zavaró; 🟢 = nincs érdemi hiány, vagy szándékosan webes funkció.

### 1.1 Ami KÖZÖS komponensből él — a desktopnak csak új kiadás kell

| Modul / pont | Web-állapot | Desktop-állapot | Súly |
|---|---|---|---|
| **Pénzügy-mag** (Kassza, Tranzakciók, Számadás, Tartozások, Súgó) | közös tabok: `packages/ui-app/src/finance/CashbookTab.tsx`, `TransactionsTab.tsx`, `AccountingTab.tsx`, `DebtTab.tsx`, `FinanceSugoTab.tsx` | ugyanezeket a közös tabokat rendereli: `apps/desktop/src/pages/penzugy-page.tsx` 20–43. sor | 🟢 **kiadással jön** |
| **13. pont — kassza-finomítás** (kiemelt rögzítő CTA, felirat, igevers a rögzítő ablakban, dátum-rendezés) | a közös `CashbookTab.tsx`-ben landolt (PR #150 + #160; a fájlban 2026-08-15-ös komment jelzi) | a desktop ugyanazt a komponenst használja — a 0.9.11-es buildből még hiányzik | 🟢 **kiadással jön** |
| **14–17. pont — nyomtatási központ** (részszámadás, csoportnapló lapokra bontása, RO-szabvány, előnézet-görgetés) | mind a közös rétegben: `packages/ui-app/src/finance/FinancePrintDialogBody.tsx`, `reporting.ts`, `budget-reporting.ts` (PR #151, #160, #161, a2fafe00) | a desktop wrapper a közös body-t használja: `apps/desktop/src/components/finance-print-dialog.tsx` 1–14. sor, `budget-print-dialog.tsx` | 🟢 **kiadással jön** |
| **K1 — Főkönyv 40 soros lapozás** | közös: `packages/ui-app/src/finance/reporting.ts` 552. sor („VALÓDI 40 SOROS LAPOZÁS") | ugyanonnan renderel — build kell | 🟢 **kiadással jön** |
| **Bank, Költségvetés, Monetár, Oblio-ellenőrzés** | közös tabok + web-wrapperek | desktop-wrapperek megvannak: `apps/desktop/src/components/desktop-bank-tab.tsx`, `desktop-budget-tab.tsx`, `desktop-monetary-tab.tsx`, `desktop-oblio-tab.tsx` | 🟢 |
| **Hivatalos bizonylatok** (Decont/Dispoziție HTML) | közös: `packages/ui-app/src/finance/official-documents.ts` („web és desktop egyaránt használja") | újranyomtatásra bekötve a print-dialógusban | 🟢 |

### 1.2 Ami web-only — itt van valódi paritás-rés

| Modul / pont | Web-állapot | Desktop-állapot | Súly |
|---|---|---|---|
| **Leltár (10–12. pont):** kategória-szűrők, kiemelt „Új tétel", **fisa** (RO/HU hivatalos forma), amortizáció, anyagraktár, nyomtatás, pénzügy-híd | `apps/web/components/inventory/inventory-main-v3.tsx` (1490 sor, a fisa is itt), `inventory-print-dialog-v2.tsx`, `material-warehouse-tab.tsx`, `inventory-amortization-dialog.tsx`; akciók: `apps/web/app/(dashboard)/leltar/actions.ts` | **read-only lista**, „Új tétel" gomb letiltva, max 200 sor, nincs fisa/nyomtatás: `apps/desktop/src/pages/leltar-page.tsx` (4., 12., 162–168. sor). Kategória-szűrő és keresés VAN (227–255. sor) | 🔴 **magas** — a fisa hivatalos okmány; leltárt tipikusan az irodai gépen vezetik |
| **Személy-kivezetés két útja (19. pont):** meghalt / elköltözött / kitért / végleges törlés (RPC, pillanatkép-napló, választói jegyzék-frissítés) | `apps/web/app/(dashboard)/tagnyilvantartas/actions.ts` — `removeMember` (1306. sortól: temetés-insert, háztartás- és párkapcsolat-lezárás, `tagnyilvantartas_tag_torles` RPC az 1466. sorban, audit) | a **régi** M8.2-es út: `isvisible` flag toggle + kézi „meghalt" pipálógomb — `apps/desktop/src/components/member-detail-dialog.tsx` 88–109. és 620–624. sor. Anyakönyvi lánc, párkapcsolat-lezárás, választói frissítés NINCS | 🔴 **magas** — desktopon rögzített haláleset kihagyja az anyakönyvet: adatminőség-hiba, amit később kézzel kell javítani |
| **Kuka (6. pont)** | `apps/web/app/(dashboard)/kuka/page.tsx` + `apps/web/components/shared/recycle-bin-view.tsx` + `apps/web/lib/offline/recycle-bin-actions.ts` (Dexie + mutation-queue alapú, pontos `deleted_at`-tal) | **nincs** (`apps/desktop/src/App.tsx` route-listájában sem) — desktopon törölt pénzügyi tétel a webes Kukában jelenik meg, de ezt a lelkész a desktopon nem látja | 🟡 közepes — védőháló, a web kerülőút működik |
| **Munkanapló-mélység (18. pont):** Igeterv (énekkereső + konkordancia), Lelkészi jelentés (EREK űrlap), statisztika, csoport-nyomtatás, különleges alkalmak | `apps/web/components/worklog/worklog-tabs.tsx` (433–441. sor: 6+1 fül), `lelkeszi-jelentes-dialog.tsx` (1711 sor), `sermon-plan-tab.tsx`, `worklog-statistics.tsx`, `worklog-print-dialog.tsx`, `kulonleges-alkalom-lista.tsx`; számítási mag: `apps/web/lib/lelkeszi-jelentes/` (web-only lib!) | 3 kategória-fül + táblázat + rögzítő dialógus. A **napi rögzítés paritásban van**: az EREK-készlet (37+11+2) és a De.2/Du.2 a desktopra is bekerült (PR #152) — `apps/desktop/src/components/worklog-create-dialog.tsx` 41–47. és 82–101. sor. Igeterv/jelentés/statisztika/nyomtatás nincs | 🟡 közepes — a jelentés évi egyszeri, webről nyomtatható; a napi rögzítés (a gyakori művelet) rendben |
| **2FA — Biztonság oldal (8. pont)** | kezelés (QR-enroll, mentőkódok, kikapcsolás): `apps/web/app/(dashboard)/profile/biztonsag/page.tsx` + `apps/web/components/profile/two-factor-card.tsx` | a **belépési lépcső KÉSZ** (TOTP + mentőkód-út, PR #158): `apps/desktop/src/pages/login-page.tsx`, aal-őr: `apps/desktop/src/lib/auth-gate.tsx` 47–69. sor. A be-/kikapcsolás desktopról nem érhető el, és a Beállítások nem is mutat rá (`apps/desktop/src/components/settings-dialog.tsx`, `settings/adat-biztonsag-panel.tsx`) | 🟢 alacsony — a védelem működik; a kezelés webes, csak egy útjelző kártya hiányzik |
| **Bérleti szerződések fül** | közös `RentalTab` létezik és a web használja: `packages/ui-app/src/finance/RentalTab.tsx` (a props-kommentek desktop-bekötésre készültek, 45–60. sor), `apps/web/components/finance/rental-tab.tsx` | placeholder, ami a webre küld: `apps/desktop/src/pages/penzugy-page.tsx` 681–685. sor | 🟡 |
| **Decont-fül** | közös body: `packages/ui-app/src/finance/DecontTabBody.tsx`, web-wrapper: `apps/web/components/finance/decont-tab.tsx` | nincs bekötve (a desktop penzugy-page fül-listájában nem szerepel) | 🟡 — a Decont-előleg döntés (08-17 hétfő) után aktuális |
| **Éves jelentés újdonságai:** VII. számadás-egyezés, bibliaóra-bontás, többéves Adatlap grafikonokkal (PR #156) | web-only lib: `apps/web/lib/lelkeszi-jelentes/adatlap-svg.ts`, `print.ts`, `types.ts` | read-only státusz-nézet: `apps/desktop/src/pages/eves-jelentes-page.tsx` (Sprint K) | 🟢 — a jelentés-készítés eleve webes munkafolyamat |

### 1.3 Szándékosan aszimmetrikus területek (nem hiba)

| Terület | Megjegyzés |
|---|---|
| Anyakönyv, Iktató, Jegyzőkönyvek, Sírhelyek | desktopon tervezetten read-only tükrök (fájl-fejlécek: `apps/desktop/src/pages/anyakonyv-page.tsx`, `iktato-page.tsx`, `jegyzokonyvek-page.tsx`, `sirhelyek-page.tsx`) — a rögzítés webes. Ez a felállás eddig nem okozott panaszt; nem javaslom most bolygatni. |
| Admin, God-mode, Publikus oldal, Értesítések, Delegált import | web-only, desktopra nem való (rendszergazdai / online-only funkciók). |
| **Sötét mód** | fordított paritás: a desktop Beállításokban már van Világos/Sötét/Rendszer választó (`apps/desktop/src/components/settings-dialog.tsx` 317–331. sor, `apps/desktop/src/lib/theme.ts`), a weben ez még a 9. pont nyitott feladata. A webes megvalósításkor érdemes a desktop mintáját megnézni. |
| Befizetés/Kiadás rögzítés | desktopon RÉGÓTA él, offline+Excel write-through-val (`apps/desktop/src/pages/befizetes-page.tsx`, `kiadas-page.tsx`, `apps/desktop/src/lib/excel-write-sync.ts`) — itt nincs rés. |

---

## 2. GYORS NYERESÉGEK (1–2 órás tételek)

1. **Desktop kiadás (build + verzió-emelés) — a lista legértékesebb tétele.**
   Nulla új kód: a 13–17. pont, a K1 Főkönyv-lapozás, a kétnyelvű
   nyomtatványok és a RO-diakritika mind a közös `packages/ui-app`-ból jön.
   Érintett fájlok: `apps/desktop/package.json` + `apps/desktop/src-tauri/tauri.conf.json`
   (verzió 0.9.11 → 0.9.12), CHANGELOG. Utána füst-teszt a nyomtatási
   központon (Főkönyv, részszámadás, csoportnapló). *Megjegyzés: aláírt
   Tauri-build kell — ez Endre gépén futó lépés, nem kódmunka.*
2. **BirthdayListDialog a kezdőoldalra.** A közös
   `packages/ui-app/src/dashboard/BirthdayListDialog.tsx`-t a web már használja
   (`apps/web/components/dashboard/celebrations.tsx`), a desktop `home-page.tsx`
   nem — bekötése egy import + egy onClick.
3. **„Kétlépcsős belépés" kártya a desktop Beállításokba.** Csak tájékoztató UI:
   mutassa, hogy a fiókon aktív-e a 2FA (a `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
   már használatban van az `auth-gate.tsx`-ben), és írja le, hogy a kezelés a
   weben történik (kartoteka.app → Profil → Biztonság). Fájl:
   `apps/desktop/src/components/settings/adat-biztonsag-panel.tsx` (+1 kártya).
4. **Bérleti-fül placeholder cseréje közös RentalTab-ra** — feltéve, hogy
   online-only adatforrással indul (direkt Supabase, mint a
   `desktop-bank-tab.tsx`): a `RentalTab` props-a kifejezetten erre készült
   (`packages/ui-app/src/finance/RentalTab.tsx` 45–60. sor). Ez a felső határa
   az „1–2 órának" — ha szerződés-írás is kell, már a 3. szeletbe tartozik.

**Nem gyors nyereség, hiába csábító:** a leltári fisa és a lelkészi jelentés —
mindkettő web-only fájlban él (`inventory-main-v3.tsx`, ill.
`apps/web/lib/lelkeszi-jelentes/`), előbb közös csomagba kell emelni őket
(3–4. szelet).

---

## 3. ÜTEMEZETT TERV — 4 szállítható szelet

Mindegyik szelet önmagában értékes és önállóan kiadható. Az elv ugyanaz, mint
a webes szeleteknél: kicsi, ellenőrizhető, hangos hibákkal.

### 1. szelet — „Kiadás-frissítés" (a 2. pontbeli #1 formalizálva)
*Érték: a lelkész desktopon is a javított nyomtatványokat kapja.*

| Fájl | Változás | Becslés |
|---|---|---|
| `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json` | verzió-emelés | 5 perc |
| `CHANGELOG.md` | lelkész-barát bejegyzés | 15 perc |
| — | `npm run typecheck` (web+desktop) + `cargo check` (PowerShell!) + kézi füst-teszt | 1–2 óra |

Összesen: **fél nap** (a build/aláírás átfutásával).

### 2. szelet — „A törlés egy nyelvet beszéljen" (19. pont desktopra)
*Érték: desktopon rögzített haláleset/elköltözés is végigmegy az anyakönyvi
láncon; megszűnik a két felület közti adatminőség-rés.*

Online-only megvalósítás (offline állapotban hangos, magyarázó elutasítás — a
kivezetés ritka és felelős művelet, nem való outbox-ba):

| Fájl | Változás | Becslés |
|---|---|---|
| `apps/desktop/src/components/member-remove-dialog.tsx` **(új)** | a webes négyutas kivezetés-dialógus portja; a `removeMember` logikájának tükre direkt Supabase-hívásokkal + `tagnyilvantartas_tag_torles` RPC (a szerveren már él, SQL nem kell) | ~350 sor, 1 nap |
| `apps/desktop/src/components/member-detail-dialog.tsx` | az `isvisible`-toggle gomb cseréje az új dialógus megnyitására; a régi „Elrejtés" megmarad admin-műveletként | ~40 sor mód. |
| `apps/desktop/src/pages/members-page.tsx` | dialógus-bekötés + siker utáni full-pull (`pullMembers…`) | ~20 sor |
| — | a webes kézi tulajdonjog-ellenőrzés átvétele (lásd 4.8. kockázat) + `verified-session` őr | a fentiben |

Összesen: **1,5–2 nap**. ⚠️ Az `apps/desktop/src/components/*` jelenleg másik
munkafolyamat alatt áll — a szelet CSAK annak lezárta után indulhat.

### 3. szelet — „Leltár: rögzítés + fisa" (10–12. pont desktopra)
*Érték: a leltár teljes hivatalos munkafolyamata (felvitel + fisa-nyomtatás)
az irodai gépen, webböngésző nélkül.*

| Fájl | Változás | Becslés |
|---|---|---|
| `packages/ui-app/src/inventory/fisa.ts` **(új)** | a fisa-HTML-builder kiemelése az `inventory-main-v3.tsx`-ből tiszta függvénybe (RO/HU, a `official-documents.ts` mintájára) | ~250 sor, fél nap |
| `apps/web/components/inventory/inventory-main-v3.tsx` | a kiemelt builder használata (viselkedés-azonos átemelés) | −150/+10 sor |
| `apps/desktop/src/components/inventory-item-dialog.tsx` **(új)** | új tétel / szerkesztés dialógus, online-only direkt Supabase-írással (`isOnlineWithSession` őrrel), a webes `leltar/actions.ts` validációinak tükrével | ~250 sor, 1 nap |
| `apps/desktop/src/pages/leltar-page.tsx` | „Új tétel" gomb élesítése (162–168. sor), sor-kattintás → dialógus, fisa-gomb → `printHtmlViaIframe` (`apps/desktop/src/lib/print-html.ts`, már létezik) | ~120 sor |

Összesen: **2–2,5 nap**. (Offline leltár-írás — outbox-szal — külön, későbbi
döntés; első lépésben az online-only a fail-closed út.)

### 4. szelet — „Tükör-másolatok felszámolása + pénzügy-maradék"
*Érték: a jövőbeni web-fejlesztések automatikusan desktopra is érvényesek;
a pénzügy fül-készlete teljes lesz.*

| Fájl | Változás | Becslés |
|---|---|---|
| `packages/ui-app/src/worklog/constants.ts` **(új)** | a WORKLOG_TYPES (EREK 37+11+2), NAPSZAK_OPTIONS, kategória-címkék EGY helyre; a web `apps/web/lib/constants/worklog.ts` és a desktop `worklog-create-dialog.tsx` (41–101. sor) innen re-exportál | fél nap |
| `apps/desktop/src/components/desktop-decont-tab.tsx` **(új)** | `DecontTabBody` bekötése direkt Supabase-adapterrel (a `desktop-bank-tab.tsx` mintájára) | ~150 sor, fél nap |
| `apps/desktop/src/components/desktop-rental-tab.tsx` **(új)** | `RentalTab` bekötése, a 681. sori placeholder cseréje a `penzugy-page.tsx`-ben | ~180 sor, fél nap |

Összesen: **1,5–2 nap**.

**Tudatosan NEM ütemezett** (későbbi kör, ha igény lesz rá): lelkészi jelentés
desktopon (előfeltétel: az `apps/web/lib/lelkeszi-jelentes/` átemelése közös
csomagba — nagy munka, évi egyszeri használatért), desktop Kuka-oldal
(előfeltétel: a 4.6. kockázat modell-döntése), anyakönyvi írás desktopon.

---

## 4. KOCKÁZATOK

1. **Párhuzamos munkafolyamat a desktop-fájlokon.** Az
   `apps/desktop/src/components/*`, `apps/desktop/src/lib/sync.ts`,
   `apps/desktop/src/main.tsx`, `apps/desktop/index.html` most másik folyamat
   alatt áll — a 2–4. szelet ezekhez nyúlna. **Sorrend: előbb az lezárul, aztán
   indul a szelet** (különben merge-pokol és széthúzó implementáció).

2. **Auth: desktopon SOHA nem `auth.getUser()`.** Minden új desktop-UI a
   3-lépcsős `getDesktopUser()`-t használja
   (`apps/desktop/src/lib/desktop-user.ts`) — offline indulásnál az
   `auth.getUser()` némán null-t adna, és a fail-closed helyett üres oldalt
   kapna a lelkész. (Memória-hibaosztály: „desktop offline user-feloldás".)

3. **Minden felhő-írás a `verified-session` őrön át.** Új írás-funkció
   (kivezetés, leltár, Decont) kizárólag a
   `apps/desktop/src/lib/verified-session.ts` három ellenőrzése után írhat
   (session + lejárat + fiók-egyezőség), és 2FA-s fióknál az aal2-lépcső után
   (`apps/desktop/src/lib/auth-gate.tsx` 47–69. sor). Az aal-kényszer valódi őre
   a szerver-oldali opt-in restrictive RLS (PR #158) — a kliens-ellenőrzés csak
   UX.

4. **Offline-szinkron ütközések.** A meglévő write-flow-knak kidolgozott
   ütközés-kezelése van (`apps/desktop/src/components/szemely-conflict-dialog.tsx`,
   `chitanta-conflict-dialog.tsx`, `write-sync-conflict-dialog.tsx`). Az új
   írás-funkciókat ezért **online-only-ként** javaslom indítani
   (`isOnlineWithSession` — `apps/desktop/src/lib/use-session-online.ts`), és
   offline-nál hangosan elutasítani. Outbox-osítás csak külön döntéssel, az
   ütközés-dialógus megtervezésével együtt.

5. **Hibaosztály: „a második felület a régi implementációt őrzi" — élő
   példákkal.** A desktopon kézi másolatban él: az EREK-típuslista
   (`apps/desktop/src/components/worklog-create-dialog.tsx` 41. sortól, saját
   kommentje szerint is „tükör"), a leltár-kategóriacímkék
   (`apps/desktop/src/pages/leltar-page.tsx` 45–54. sor), a hónapnevek
   (`apps/desktop/src/pages/munkanaplo-page.tsx` 43–47. sor). Amíg a 4. szelet
   nem fut le, minden webes lista-módosítást kézzel kell utánahúzni a
   desktopon — ez már egyszer megtörtént rendben (PR #152), de nem fog mindig.

6. **Soft-delete modell-divergencia (a desktop-Kuka előfeltétele).** Három
   különböző törlés-modell él: pénzügy/munkanapló/iktató = `deleted` flag
   (a webes Kuka ezt kezeli — `apps/web/lib/offline/table-registry.ts`
   `softDelete: true` bejegyzései); leltár = `is_deleted` (ugyanott, 467. sor);
   személy = FIZIKAI DELETE + `isvisible` elrejtés (a desktop `sync.ts`
   115–130. sori kommentje dokumentálja, és ezért kell az F6.5 id-söprés). A
   desktop pull a pénzügyben `deleted=false`-ra szűr + teljes pull után söpör
   (`apps/desktop/src/lib/finance-sync.ts` 39–51. sor) — ez konzisztens, DE:
   a webes Kukából **visszaállított** tétel csak a következő teljes pull után
   jelenik meg desktopon. Desktop-Kuka építésekor a webes, Dexie-alapú
   `recycle-bin-actions.ts` NEM újrahasználható — direkt Supabase-lekérdezéses
   változat kell.

7. **A közös komponens sem ér el a lelkészhez kiadás nélkül.** A desktop csak
   aláírt release-szel frissül (`apps/desktop/src/lib/updater.ts`) — a mostani
   0.9.11 ↔ web 0.9.166 rés pont így nőtt meg. Javaslat munkaszabálynak:
   minden `packages/ui-app`-ot érintő PR végén expliciten dönteni („kell-e
   desktop-build?"), és a CHANGELOG-ban jelölni, ha igen.

8. **RLS ≠ a webes Server Action-ök kézi őrei.** A webes akciók a RLS-en FELÜL
   kézzel is ellenőriznek (pl. a `removeMember` IDOR-védelme: a tag a saját
   gyülekezethez tartozik-e — `apps/web/app/(dashboard)/tagnyilvantartas/actions.ts`
   1315–1325. sor). Desktopon nincs middleware és nincs server action: a direkt
   Supabase-hívás portolásakor **ezeket a kézi ellenőrzéseket is át kell hozni**,
   különben a desktop lesz a gyengébb kapu. (Rokon memória-hibaosztály:
   „skalár hatókör + `if (id) filter` = néma teljes szivárgás" — minden szűrő
   fail-closed legyen.)

9. **Excel write-through hatóköre.** A desktop pénzügyi írásai Excel-sort is
   írnak (`apps/desktop/src/lib/excel-write-sync.ts`). Az új bekötéseknél
   (Decont, bérleti) tételesen tisztázandó, kell-e Excel-tükör — ha igen, az a
   becslést növeli; ha nem, azt kommentben rögzíteni kell, hogy szándékos.

---

*A dokumentum csak olvasáson alapul, kód nem változott. A becslések
fájl-szintűek és feltételezik, hogy az érintett fájlokon nincs párhuzamos
munka (4.1. kockázat).*
