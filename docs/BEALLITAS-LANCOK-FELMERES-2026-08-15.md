# Beállítás-láncok teljes felmérése — 2026-08-15

**Endre 2. + 5. pontja.** Csak felmérés — ez a dokumentum egyetlen sort sem változtatott a kódon.

**Mit vizsgáltunk:** (a) a `bealitas` tábla MINDEN mezőjét, (b) a `congregations` tábla
beállítás-jellegű mezőit, (c) a fejléc-menü **Beállítások** ablakát, a **„Gyülekezetünk
adatai"** ablakot (congregation-dialog-v2), a **„Gyülekezet beállítása"** varázslót
(congregation-setup-wizard) és a regisztrációs **welcome-varázslót**. Mindegyik mezőre két
kérdést tettünk fel: *van-e felület, ahol állítható?* és *van-e kód, ami ténylegesen
olvassa?* (repó-szintű grep, minden `from('bealitas')` / `from('congregations')` hívás
végigolvasva).

**Hol vannak a beállító felületek** (tájékozódásul):

| Felület | Megnyitás | Fájl |
|---|---|---|
| „Beállítások" ablak (értesítés, megjelenés, nyelv, biztonság) | fejléc-menü → Fiók → Beállítások | `apps/web/components/modals/settings-dialog.tsx` (menüpont: `components/layout/header-refined-v3.tsx:400–405`) |
| „Gyülekezetünk adatai" (read-only összefoglaló) | fejléc-menü → Gyülekezet → Gyülekezetünk | `apps/web/components/modals/congregation-dialog-v2.tsx` (nyitás: `components/layout/dashboard-shell.tsx:171–175`) |
| „Gyülekezet beállítása" varázsló (minden szerkesztés ide fut) | fejléc-menü → Gyülekezet-beállítás, ill. az összefoglaló „Szerkesztés" gombja | `apps/web/components/modals/congregation-setup-wizard.tsx` (híd: `dashboard-shell.tsx:184–193`, átirányítás: `congregation-dialog-v2.tsx:530–534`) |
| Welcome-varázsló (első regisztráció) | `/welcome` | `apps/web/components/onboarding/welcome-wizard-client.tsx` + `app/(setup)/welcome/actions.ts` |
| Publikus oldal beállításai | Publikus oldal → Beállítások | `app/(dashboard)/publikus-oldal/beallitasok/page.tsx` (a `public_sites` táblát írja) |
| Éves díjak / nyitó egyenlegek panelek | a setup-varázsló „Pénzügyi alap" panelje | `AnnualFeesManager`, `OpeningBalancesManager` (`app/(dashboard)/penzugy/tartozas-actions.ts`, `nyito-egyenleg-settings-actions.ts`) |

⚠️ **Fontos módszertani megjegyzés:** a `migration-docs/Database_schema.sql` dump **elavult**
— a kód olyan `bealitas` oszlopokat is használ, amelyek a dumpban nincsenek benne
(`budget_mod1..3_finalized/_date/_hatarozat`, `szamadas_tartozasok`; hozzáadta:
`migration-docs/sql/2026-04-12-budget-modifications.sql` és
`2026-07-10-koltsegvetes-zar-rls.sql`; olvassa pl.
`app/(dashboard)/dashboard-egyhazmegye/actions.ts:144` és
`packages/ui-app/src/finance/types.ts:249–257`). A lenti állítások a dump + a
migrációs fájlok + a kód együttes olvasatán alapulnak — éles ellenőrzéshez az
`information_schema` a mérvadó (lásd a „migration-fájl nem bizonyíték" hibaosztályt).

---

## 1. HOLT KAPCSOLÓK — beállítható, de SEMMI nem olvassa

*A lelkész átállítja, „Beállítás mentve" visszajelzést kap — és semmi nem történik.*

### 1.1 ⛔ „E-mailben is megkapom az értesítéseket" kapcsoló

- **Hol állítható:** Beállítások ablak → Értesítések fül
  (`apps/web/components/modals/settings-dialog.tsx:201–212`; desktop-párja:
  `apps/desktop/src/components/settings-dialog.tsx:267–268`).
- **Hova mentődik:** kizárólag a böngésző `localStorage`-ába, a
  `kartoteka-user-prefs-v1` kulcs alá (`settings-dialog.tsx:62, 90–93`).
- **Bizonyíték, hogy senki nem olvassa:** a `kartoteka-user-prefs-v1` kulcsra a teljes
  repóban 3 találat van — a webes és a desktopos settings-dialog önmaga (repó-grep,
  2026-08-15). A tényleges levélküldés (`apps/web/lib/email/send.ts`, Brevo/Resend
  providerek) **szerveroldali**, és egyetlen sora sem kérdez felhasználói preferenciát
  (grep `prefs|preference|emailNotifications` a fájlban: 0 találat). A szerver elvből
  nem is látná a böngésző localStorage-át.
- **Következmény:** aki kikapcsolja, ugyanúgy kap e-mailt; azt hiszi, elintézte.

### 1.2 ⛔ Értesítés-típus szűrők (5 jelölőnégyzet)

- **Hol állítható:** ugyanott, „Milyen típusú értesítéseket kapjak?"
  (`settings-dialog.tsx:214–232`; desktop: `apps/desktop/src/components/settings-dialog.tsx:287`).
- **Bizonyíték:** ugyanaz, mint 1.1 — a `notificationTypes` mezőt a két dialoguson kívül
  semmi nem olvassa; sem az in-app értesítés-lista, sem a levélküldés nem szűr vele.

### 1.3 ⛔ Betűméret (Kisebb / Alapértelmezett / Nagyobb)

- **Hol állítható:** Beállítások → Megjelenés → Betűméret (`settings-dialog.tsx:283–310`).
  A felirat maga azt írja: „A betűméret az egész alkalmazásra érvényes (jelenleg béta)."
- **Bizonyíték:** a `prefs.fontSize` értéket semmi nem alkalmazza — nincs kód, ami a
  `<html>`/`<body>` elemre osztályt vagy stílust tenne belőle (a repóban minden
  `fontSize` találat inline SVG/komponens-stílus, nem ez a preferencia). A kártya mégis
  „Beállítás mentve" toastot ad (`settings-dialog.tsx:124`).

### 1.4 ⛔ Felület nyelve (Magyar / Română)

- **Hol állítható:** Beállítások → Nyelv (`settings-dialog.tsx:314–336`). A román opció
  mellett ott a „(hamarosan)", de a kártya **kattintható, menti és pipát tesz rá**.
- **Bizonyíték:** a `prefs.language` mezőt semmi nem olvassa; i18n-réteg nincs bekötve.
- Ugyanezen a fülön a „Fordítási készültség" doboz **statikus, kézzel beírt számokat**
  mutat (15%, 40% — `settings-dialog.tsx:357–376`), nem mért adatot.

### 1.5 ⛔ Welcome-varázsló: `bejegyzesiszam` (bejegyzési szám) — kétszeresen szakadt lánc

- **Állapot-mező van, beviteli mező NINCS:** a wizard state-jében szerepel
  (`welcome-wizard-client.tsx:50, 116`), de egyetlen input sem írja (grep a teljes
  `components/onboarding` alatt: csak a típus + az üres kezdőérték találat) — tehát mindig
  üres stringként utazik.
- **A mentés első ága garantáltan hibázik:** a `completeWizard` a
  `congregations.bejegyzesiszam` oszlopot frissítené (`app/(setup)/welcome/actions.ts:1063–1077`),
  de a `congregations` táblán **nincs ilyen oszlop** (`Database_schema.sql:711–757`); a
  fallback a `bealitas.bejegyzesiszam`-ba ír (`actions.ts:1111–1114`).
- **A `bealitas.bejegyzesiszam`-ot viszont senki nem olvassa.** A „Gyülekezetünk adatai"
  összefoglaló ki tudná írni (`components/modals/congregation-summary.tsx:257`), de a
  hívó (`congregation-dialog-v2.tsx` `summaryData` useMemo, 289–334. sor) **soha nem adja
  át** a mezőt — a sor sosem jelenik meg.
- **Következmény:** a bejegyzési számnak jelenleg se bevitele, se tárolt olvasata, se
  megjelenítése nincs — a lánc mindhárom pontján szakadt.

### 1.6 ⛔ Desktop „Beállítások" ablak — ugyanaz a három holt csoport

`apps/desktop/src/components/settings-dialog.tsx` szándékosan a webes tükörképe
(ugyanaz a `kartoteka-user-prefs-v1` kulcs, 59. sor) — az 1.1–1.4 pontok a desktopra
szó szerint ugyanígy állnak.

### 1.7 Bevallottan inert gomb (őszinte, de említendő)

- „Kijelentkezés minden eszközön (hamarosan)" — kattintásra csak toastot ad
  (`settings-dialog.tsx:468–485`). Legalább jelzi, hogy nem működik.

### 1.8 Halott UI-variáns: a dialog-v2 „haladó szerkesztő" módja

- A `CongregationDialogV2` `variant='advanced-edit'` ága (saját szerkesztő űrlappal és
  az `updateCongregation` mentéssel, `congregation-dialog-v2.tsx:95–98, 363–376`)
  **sehonnan nem hívódik** — a repóban nincs `variant="advanced-edit"` példányosítás; a
  `dashboard-shell.tsx:171–175` a default `'view'`-t nyitja, annak Szerkesztés gombja
  pedig a setup-varázslóba dob át (531–534. sor). Az `updateCongregation` teljes
  írási útvonala (benne a `'12-31'` határidő-defaulttal) **jelenleg elérhetetlen a
  felületről** — de a kódban él, és bármikor „visszakapcsolódhat" (lásd 3.3).

---

## 2. NÉMA ALAPÉRTÉKEK — a kód olvassa, de NINCS felület, ahol állítható

*A rendszer viselkedik valahogy, és a lelkész ezt sehol nem tudja befolyásolni.*

### 2.1 ⛔ `congregations.tva_alany` + `tva_kod` + `tva_alany_tol` — ÁFA-alanyiság

- **Ki olvassa:** a TVA-plafon figyelő (`apps/web/lib/finance/tva-plafon.ts:75–86`,
  widget: `components/finance/tva-plafon-widget.tsx:119`), a lekérdező action
  (`app/(dashboard)/penzugy/tva-actions.ts:77–90`), és — ez a súlyos — az **Oblio
  számlaépítő**: ha `tva_alany = true`, a számla 19% ÁFÁ-val megy ki
  (`lib/finance/oblio/oblio-invoice-builder.ts:8–11`, `penzugy/oblio-actions.ts:154–157`).
- **Ki írja:** SENKI a felületről — a repóban egyetlen `update`/`upsert` sem írja
  (grep, 2026-08-15). Csak kézi SQL-lel állítható.
- **Következmény:** ha egy gyülekezet átlépi a plafont és ÁFA-alany lesz, a lelkész a
  programban ezt NEM tudja rögzíteni — a számlák továbbra is ÁFA nélkül mennének.

### 2.2 ⛔ Számadás-borító: `bealitas.szamadas_iktatoszam` — olvasva van, írva nincs

- **Ki olvassa:** a közös borító-leképezés `hivatalosHatarozatMezok()`
  (`packages/ui-app/src/finance/types.ts:282–302`, 293. sor) — a webes ÉS desktopos
  nyomtató dialógus innen tölti a Számadás borítóját.
- **Ki írja:** senki. A számadás-véglegesítő wizard a határozat-párost kitölti
  (`szamadas_hatarozat_szam/_datum` — `penzugy/actions.ts:3454–3464`), de az
  **iktatószámot nem kérdezi és nem menti**.
- **Következmény:** a hivatalos Számadás borítóján az iktatószám-vonal mindig üres.

### 2.3 ⛔ Költségvetés-borító: `egyhazkozsegi_iktatoszam` + `presbiteriumi_hatarozat_szam/_datum`

- **Ki olvassa:** ugyanaz a borító-leképezés, költségvetés ágon (`types.ts:298–300`).
- **Ki írja:** senki. A `finalizeBudget` CSAK a zászlót billenti
  (`penzugy/actions.ts:3169–3196`: `{ budget_finalized: true }`) — a számadással
  ellentétben itt nincs is határozat-adatot kérő wizard-lépés.
- **Következmény:** a véglegesített Költségvetés borítóján a „Tárgyalta és jóváhagyta a
  presbitérium…" sor mindig üresen marad — pont az a hiba, amit a Számadásnál a
  2026-08-15-ös átvilágítás 15. pontja már javított (lásd a `types.ts:220–234` kommentet).

### 2.4 `bealitas.budget_mod1..3_hatarozat` — típusban előkészítve, lánc nélkül

- A `BealitasRow` típus tartalmazza őket (`types.ts:255–257`), de **se író, se olvasó**
  kód nincs rájuk: a `finalizeBudgetModification` csak flag + dátum
  (`penzugy/actions.ts:3698–3703`), a nyomtatás nem használja. A módosítási körök
  borítójára tehát sosem kerül határozatszám.

### 2.5 `congregations.status` (active/inactive) — rendszer-oldali, de következményes

- **Ki olvassa:** a napi mentés-worker, a körlevél-címzettek, az emlékeztető-worker —
  mind `eq('status','active')` szűréssel (`lib/backup/worker.ts:594`,
  `lib/broadcasts/recipients.ts:29`, `lib/dashboard/expiry-reminder-worker.ts:121`).
- **Ki írja:** felületről senki (admin/SQL). Az inaktív jelvény megjelenik a
  „Gyülekezetünk adatai" címsorában (`congregation-dialog-v2.tsx:518–522`).
- **Következmény:** egy `inactive`-ra állított gyülekezet **némán kimarad a napi
  mentésből és a körlevelekből** — ezt a lelkész sehol nem látja, csak a jelvényt.

### 2.6 `jarulek_hatarid` (év-soronként) — a motor olvassa, évre állítani nem lehet

- **Ki olvassa:** a járulék-motor a kedvezményes határidőhöz
  (`packages/ui-app/src/finance/jarulek-calculation.ts:533–551`, forrás: a
  `bealitas` év-sor).
- **Hol állítható:** évre bontva SEHOL. Az Éves díjak panel mentése fixen `'07-01'`-et ír
  új év-sorba (`penzugy/tartozas-actions.ts:91`), meglévő sorban csak az összeget
  frissíti (85–88. sor). A gyülekezeti szintű (congregations) értéket a setup-varázsló
  is csak rejtetten viszi (a Pénzügyi alap panelen nincs határidő-mező —
  `congregation-setup-wizard.tsx:850–901`).
- **Megjegyzés:** a mai modellben a teljes-összeg határideje szándékosan „egész év"
  (welcome-komment, `welcome-wizard-client.tsx:145–148`), a kedvezmények pedig a
  `jarulek_kedvezmeny` táblában időszakosak — de amíg a motor olvassa az év-sor
  mezőjét, addig az egy állíthatatlan, felületen nem látható viselkedés-forrás.

### 2.7 Éles, jól bekötött láncok (ellenpróba — ezek RENDBEN vannak)

Hogy látszódjon, mi a működő minta:

- **Sötét/világos mód + téma-stílus** — next-themes + `kartoteka-theme-style-v1`
  (`packages/ui-app/src/theme/index.tsx:42`), a provider alkalmazza. ✅
- **Jelszó-állítás, profil-törlés** — valódi server actionök (`settings-dialog.tsx:48`). ✅
- **Alapértelmezett dashboard** — `profile_preferences.default_dashboard`, a belépési
  redirect ténylegesen olvassa (`profile/profile-preferences-actions.ts:159–188`). ✅
- **Zárás-zászlók** (`budget_finalized`, `accounting_finalized`, `leltar_finalized`,
  `unlock_*`) — kiterjedt olvasó-hálózat: `packages/core/src/finance/year-lock.ts:75–79`,
  `leltar/actions.ts:384–445`, `dashboard-egyhazmegye/actions.ts:496–499`, desktop-sync
  (`apps/desktop/src/lib/finance-settings-sync.ts:65–69`). ✅
- **`szamadas_zaro_adatok`** — a Lelkészi jelentés VII. és a beküldés forrása. ✅
- **Publikus oldal beállításai** — a `public_sites` táblát írja, a publikus route
  ugyanazt olvassa (`is_published` — `lib/public-site/site-loader.ts:155`). ✅
- **`eves_jarulek` év-soronként** — a tartozás-motor, a névjegyzék és a desktop is a
  `bealitas` év-sorból olvas (pl. `tagnyilvantartas/actions.ts:170`,
  `penzugy/actions.ts:2787`, `apps/desktop/src/lib/finance-entry-lookups.ts:265`). ✅

---

## 3. SZÉTHÚZÓ LÁNCOK — két felület ugyanazt a mezőt másképp írja/értelmezi

### 3.1 ⛔ Díj-hármas kétszer tárolva: `congregations` ⇄ `bealitas` év-sor

- **A helyzet:** az `eves_jarulek`, `jarulek_kedvezmenyes`, `jarulek_hatarid` a
  `congregations`-ben (711–757. sor, „gyülekezeti alap") ÉS a `bealitas` év-sorban
  (92–111. sor, „amiből a motor számol") is él. A motor KIZÁRÓLAG az év-sorból olvas.
- **A mai híd:** a setup-varázsló és az (elérhetetlen) updateCongregation mentése után a
  `syncFeeSettingsToCurrentYearBealitas` átvezeti az AKTUÁLIS évi sorba
  (`congregation/actions.ts:241–277`, hívások: 344, 1434) — de CSAK ha az év-sor már
  létezik, és nem véglegesített. Ha nincs év-sor, a mezők a congregations-ben várnak,
  és az év első Pénzügy-megnyitása másolja át őket (`penzugy/actions.ts:3039–3065`).
- **Maradék rés:** (a) jövő évre előre beállított díj nem létezik mint fogalom — a
  következő év nyitása a congregations AKKORI értékét másolja; (b) a desktop
  fallback-ként közvetlenül a congregations-t olvassa, ha nincs év-sor
  (`finance-entry-lookups.ts:269`) — a két tároló közti bármely eltéréskor a web és a
  desktop mást számolhat; (c) a sync-figyelmeztetés a setup-varázslónál csak
  `console.warn` (`actions.ts:1439`), a lelkész nem látja.

### 3.2 `jarulek_hatarid` alapérték: '07-01' vagy '12-31' — felülettől függ

Ugyanannak a mezőnek négy, kétfelé húzó default-ja van:

| Hely | Alapérték | Hivatkozás |
|---|---|---|
| DB oszlop-default (mindkét tábla) | `'07-01'` | `Database_schema.sql:111, 732` |
| Setup-varázsló form-init | `'07-01'` | `congregation-setup-wizard.tsx:183` |
| Év-sor létrehozás fallback | `'07-01'` | `penzugy/actions.ts:3034–3037` |
| Welcome-varázsló | `'12-31'` | `welcome-wizard-client.tsx:148` |
| Dialog-v2 (advanced-edit) init + sanitizálás | `'12-31'` | `congregation-dialog-v2.tsx:182, 260–262` |

Amelyik úton a gyülekezet beállítódott, az dönti el, hogy a kedvezmény-határidő
július 1. vagy december 31. — a lelkész tudta nélkül.

### 3.3 `tartozas_szamitas_mod`: az egyik író fixál, a másik átenged

- Az `updateCongregation` a 2026-07-17-es kivezetés (F5/Q6) óta **mindig `'akkori'`-t
  ír** (`congregation/actions.ts:327–328` — „a régi kliensből érkező 'aktualis' sem
  kerülhet vissza a DB-be").
- A `saveCongregationSetup` viszont **átengedi a form-értéket**
  (`actions.ts:1316, 1394`), a form pedig betöltéskor a tárolt értéket veszi fel
  (`congregation-setup-wizard.tsx:247`) — egy régről `'aktualis'`-on maradt gyülekezet
  a setup-mentéssel újra `'aktualis'`-t ír vissza.
- A számítás ma már egyik értéket sem olvassa (mindenhol „mindig 'akkori'" — pl.
  `tagnyilvantartas/actions.ts:172, 334`), tehát működési hiba nincs — de a két író
  ellentmondó szabálya pont az a minta, amiből legközelebb hiba lesz.

### 3.4 Publikus oldal kapcsoló: `public_sites.is_published` ⇄ `congregations.public_site_enabled` + `public_slug`

- Az igazság-forrás a `public_sites` (a publikus route csak ezt olvassa —
  `site-loader.ts:155`); a mentés utólag szinkronizálja a redundáns congregations-párost
  (`publikus-oldal/actions.ts:159–168`). A belső felületek (Beállítások-ablak
  „Publikus oldal" füle, a Gyülekezetünk-összefoglaló Megosztás gombja) viszont a
  **másolatot** olvassák (`congregation-dialog-v2.tsx:232–235, 332`).
- A sync hibája ma már hangos (168. sor), de a két olvasó-kör létezése miatt egy
  egyszeri elcsúszás tartósan mást mutat belül, mint ami kifelé él.

### 3.5 `bejegyzesiszam`: két tábla, egy nem létező oszlop

Lásd 1.5 — a welcome-mentés először a `congregations`-be próbál (nem létező oszlop,
mindig hibaágra fut), aztán a `bealitas`-ba ír; olvasó egyik helyen sincs.

### 3.6 Már javított széthúzások (rendben, csak jegyzőkönyvezzük)

- `name` vs `nev_hu` clobber — mindkét író véd rá (`congregation/actions.ts:290–293,
  1363–1367`). ✅
- Kedvezmény/díj-managerek — a dialog-v2 és a setup-varázsló UGYANAZT a megosztott
  komponenst használja (S2-1a, `congregation-dialog-v2.tsx:39–45`). ✅
- Éves díjak panel — a motor által ténylegesen használt `bealitas` év-sorokat mutatja
  (F1-3, `congregation/actions.ts:162–232`). ✅

---

## 4. HALOTT OSZLOPOK a `bealitas` táblában (se felület, se olvasó)

A V1-örökség oszlopai. Bizonyíték: a repó ÖSSZES `from('bealitas')` hívása felsorolt
oszloplistával vagy `select('*')`-gal dolgozik; a felsoroltak között egyik alábbi mező
sem szerepel, a `select('*')` fogyasztói pedig a `BealitasRow` típuson át olvasnak
(`packages/ui-app/src/finance/types.ts:194–258`), amely szintén nem tartalmazza őket.

| Oszlop (Database_schema.sql sora) | Állapot |
|---|---|
| `intezmenyneve` (66), `intezmenyneve_ro` (90) | soha, senki nem írja/olvassa |
| `utcaid` (67), `helysegid` (91) | csak NOT NULL-töltelékként ÍRVA (welcome: `welcome/actions.ts:1094`; év-nyitás: `penzugy/actions.ts:3051–3052`), olvasó nincs |
| `szam` (68), `telefon` (69), `lelkesz` (70), `logo` (71) | halott (a gyülekezeti cím/telefon/címer a `congregations`-ben él) |
| `isszemelyibefizetes` (72), `isszulokkulon` (73), `felmentes70felul` (75), `felmentesideneskudtek` (77), `kedvezmenyxevenfelul` (78) | NOT NULL miatt fixen `false`-szal írva (welcome: 1089–1093; év-nyitás: 3046–3050), olvasó nincs |
| `szemelyibefizetesfilter` (74), `felmenteskorhatar` (76), `kedvezmenykorhatar` (79), `kedvezmeny` (80) | halott (a kedvezmény-rendszer a `jarulek_kedvezmeny` táblában él) |
| `egyhazkerulet` (81), `egyhazmegye` (82), `adoazonosito` (83) | halott (a hovatartozás a `congregations.diocese_id`-n él) |
| `bejegyzesiszam` (84) | írva (welcome), olvasó nincs — lásd 1.5 |
| `aktiv` (85) | írva (welcome: aktuális év `true`, múlt évek `false` — 1087, 1144; év-nyitás: `true` — 3045), de SEMMI nem szűr rá — az „archív év" jelölés hatástalan |
| `ervenyessegiev` (86), `version` (87), `created` (88) | halott |
| `diak_felmentes` (92) | halott (a diák-mentesség a `felmentes` táblában él) |
| `nyito_keszpenz` (108), `nyito_bank` (109) | 0-val írva év-nyitáskor (3063–3064), a welcome deprecated ága is írhatja (1105–1110) — de a VALÓDI nyitó-lánc a `keszpenz_nyito_egyenleg` + `bankszamla_nyito_egyenleg` táblákban él (`nyito-egyenleg-settings-actions.ts:60–72`); olvasó nincs |
| `egyhazmegyei_iktatoszam` (98) | se író, se olvasó |
| `leltar_iktatoszam` (115), `leltar_hatarozat_datum` (116), `leltar_hatarozat_szam` (117) | se író, se olvasó (a leltár-véglegesítés csak a zászlókat kezeli — `leltar/actions.ts:408–413`) |

---

## 5. JAVÍTÁSI TERV — priorizált, tételes

### P0 — hivatalos irat / pénz múlik rajta

1. **TVA-alanyiság beállító felület** (2.1): kapcsoló + TVA-kód + dátum a
   Gyülekezet beállítása varázsló Pénzügyi alap paneljére (vagy admin-felületre),
   írás a `congregations.tva_alany/tva_kod/tva_alany_tol` mezőkbe. Amíg nincs,
   legalább a TVA-widget mutassa meg, hogy a mező kézi SQL-lel állítandó.
2. **Költségvetés-borító határozat-mezők bekötése** (2.3): a `finalizeBudget` kapjon
   ugyanolyan határozat-lépést (jkv-szám + dátum + iktatószám), mint a számadás-wizard;
   írás: `egyhazkozsegi_iktatoszam`, `presbiteriumi_hatarozat_szam/_datum`. A borító-
   olvasó már kész (`hivatalosHatarozatMezok`).
3. **Számadás iktatószám-mező** (2.2): a meglévő számadás-véglegesítő wizard kérdezze
   be és mentse a `szamadas_iktatoszam`-ot is.
4. **A Beállítások-ablak holt kapcsolóinak őszintesítése** (1.1–1.4): vagy (a) tényleges
   bekötés (értesítés-prefek a `profile_preferences`-be + a levélküldés szűrjön rá),
   vagy (b) a nem működő szakaszok „hamarosan" jelölése és a hamis „Beállítás mentve"
   toast eltávolítása. Az e-mail kapcsoló a legfélrevezetőbb — a lelkész azt hiszi,
   leiratkozott. (Desktopon ugyanez — 1.6.)

### P1 — csendes széthúzások megszüntetése

5. **`jarulek_hatarid` default egységesítése** (3.2): egyetlen konstans (javaslat:
   `'12-31'`, mert a mai modell szerint a teljes összeg egész évben fizethető), és a
   welcome + setup + év-nyitás + dialog-v2 mind ezt használja; DB-default igazító SQL.
6. **`tartozas_szamitas_mod` teljes kivezetése az írókból** (3.3): a
   `saveCongregationSetup` is fixen `'akkori'`-t írjon (vagy hagyja ki a payloadból);
   a form-state-ből és a welcome-slotból törölhető.
7. **`bejegyzesiszam` lánc döntése** (1.5): VAGY input a setup-varázsló Alapadatok
   paneljére + átadás a Gyülekezetünk-összefoglalónak (a megjelenítő sor már kész),
   VAGY a mező és a welcome-írás kivezetése. A congregations-be célzó halott
   update-ág (welcome/actions.ts:1063–1077) mindenképp törlendő.
8. **Belső publikus-oldal nézetek az igazság-forrásból** (3.4): a Beállítások-ablak
   „Publikus oldal" füle és a Megosztás gomb a `public_sites`-ból olvasson, vagy a
   redundáns páros kapjon rendszeres konzisztencia-ellenőrzést.
9. **A setup-varázsló fee-sync figyelmeztetése jusson el a lelkészig** (3.1c): a
   `console.warn` helyett a mentés-válasz `warning` mezőjébe (a minta már létezik:
   `saveCongregationSetup` → `strippedWarning`).

### P2 — takarítás, karbantarthatóság

10. **Halott `bealitas` oszlopok kivezetési terve** (4. fejezet): külön dátumozott SQL,
    két lépcsőben — előbb a NOT NULL kényszerek feloldása (ettől az év-nyitó és a
    welcome „false-töltelék" kódja egyszerűsödik: `penzugy/actions.ts:3046–3051`,
    `welcome/actions.ts:1089–1094`), majd — élesben igazolt nem-használat után — a
    DROP COLUMN-ok. NEM most futtatandó; a „migration-fájl nem bizonyíték" szabály
    szerint állapotfelmérő SELECT-tel kezdve.
11. **`nyito_keszpenz`/`nyito_bank` kivezetése** (4. fej.): a welcome deprecated
    írási ága törölhető; az oszlopok a 10. pont SQL-jébe kerülnek.
12. **`advanced-edit` variáns eltávolítása** (1.8): a `CongregationDialogV2`-ből az
    elérhetetlen szerkesztő-mód és az `updateCongregation`-lánc kivezetése (a
    kedvezmény/díj-managerek a setup-varázslóban élnek tovább); VAGY tudatos
    visszakötése egy menüpontra — de a mai se-nem-él, se-nem-halott állapot a
    legrosszabb.
13. **`budget_mod*_hatarozat` döntés** (2.4): vagy bekérdezés a módosítás-véglegesítéskor
    + borító-olvasás, vagy a típus-mezők törlése.
14. **Beállítás-prefek Supabase-perzisztencia**: a dialog saját tipp-doboza is ígéri
    („A jövőben Supabase-ben perzisztálódnak majd" — `settings-dialog.tsx:182–185`);
    a `profile_preferences` tábla már létezik és működő mintát ad.
15. **`Database_schema.sql` dump frissítése** (módszertani): a `budget_mod*` és
    `szamadas_tartozasok` oszlopok hiánya a dumpból már most téves következtetésekre
    csábít.

---

## 6. ÖSSZEFOGLALÓ TÁBLÁZAT

| # | Mező / kapcsoló | Állítható? | Olvassa valaki? | Ítélet | Prioritás |
|---|---|---|---|---|---|
| 1 | E-mail értesítés kapcsoló | ✅ Beállítások | ❌ (localStorage, a levélküldés nem látja) | HOLT KAPCSOLÓ | P0 |
| 2 | Értesítés-típus szűrők (5 db) | ✅ Beállítások | ❌ | HOLT KAPCSOLÓ | P0 |
| 3 | Betűméret | ✅ Beállítások | ❌ | HOLT KAPCSOLÓ | P0 |
| 4 | Felület nyelve (HU/RO) | ✅ Beállítások | ❌ | HOLT KAPCSOLÓ | P0 |
| 5 | `congregations.tva_alany` (+kód, +dátum) | ❌ | ✅ Oblio-számla ÁFA + TVA-widget | NÉMA ALAPÉRTÉK | P0 |
| 6 | Költségvetés-borító határozat-mezők | ❌ | ✅ nyomtatás-borító | NÉMA ALAPÉRTÉK | P0 |
| 7 | `szamadas_iktatoszam` | ❌ | ✅ nyomtatás-borító | NÉMA ALAPÉRTÉK | P0 |
| 8 | Díj-hármas kettős tárolás (congregations ⇄ bealitas) | ✅ setup-varázsló | ✅ motor (év-sor) | SZÉTHÚZÓ (hidalt, réselt) | P1 |
| 9 | `jarulek_hatarid` default ('07-01' vs '12-31') | részben | ✅ motor | SZÉTHÚZÓ | P1 |
| 10 | `tartozas_szamitas_mod` írói | (kivezetett) | ❌ számítás | SZÉTHÚZÓ ÍRÓK | P1 |
| 11 | `bejegyzesiszam` | ❌ (nincs input) | ❌ | SZAKADT LÁNC | P1 |
| 12 | Publikus-oldal flag redundancia | ✅ publikus-beállítások | ✅ (két külön kör) | SZÉTHÚZÓ | P1 |
| 13 | `congregations.status` | ❌ (admin/SQL) | ✅ mentés/körlevél szűrő | NÉMA ALAPÉRTÉK (tudatos) | P2 |
| 14 | `budget_mod*_hatarozat` | ❌ | ❌ (csak típus) | ELŐKÉSZÍTETT CSONK | P2 |
| 15 | ~15 V1-örökség `bealitas` oszlop (4. fej.) | ❌ | ❌ | HALOTT OSZLOP | P2 |
| 16 | `nyito_keszpenz` / `nyito_bank` | ❌ | ❌ (valódi lánc külön táblákban) | HALOTT OSZLOP | P2 |
| 17 | `bealitas.aktiv` | ❌ | ❌ (írva, sosem szűrve) | HALOTT SZEMANTIKA | P2 |
| 18 | dialog-v2 `advanced-edit` mód | — | — | ELÉRHETETLEN UI-ÁG | P2 |
| 19 | Sötét mód, téma, jelszó, dashboard-pref, zárás-zászlók, publikus oldal, éves díjak | ✅ | ✅ | RENDBEN ✅ | — |

*Készült: 2026-08-15. Módszer: statikus kódelemzés (grep + a teljes írási/olvasási
láncok végigkövetése); élesbeli állapot-ellenőrzéshez a szokásos diagnosztikai SQL
ajánlott a döntések előtt.*
