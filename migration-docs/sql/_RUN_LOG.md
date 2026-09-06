# SQL migráció napló — Kartotéka

A `migration-docs/sql/` mappa 197+ SQL fájlt tartalmaz. Ez a napló követi, melyik migráció **futott le** a production Supabase-en, melyik **PENDING** (futtatásra vár), és melyiknek a státusza **ELLENŐRIZENDŐ** (csak Endre tudja).

## Konvenció

```
- [x] YYYY-MM-DD HH:MM — fájlnév.sql
       Megjegyzés (opcionális)

- [ ] fájlnév.sql — PENDING (még nem futott)
       Indok: ...

- [?] fájlnév.sql — ELLENŐRIZENDŐ
       (csak Endre tudja megerősíteni, hogy futott-e)
```

A `[x]` kipipált bejegyzéseknek időbélyeg jár (mikor futott le). A `[ ]` pending bejegyzéseknek **indok** kell (miért nem futott még, mire vár). A `[?]` ellenőrizendő bejegyzéseknek nem kell indok — csak Endre kell hogy futtassa `SELECT * FROM pg_proc WHERE proname = '...'` típusú ellenőrzést.

---

## ✅ LEFUTOTT – asztali első indítás + naptár + értesítések + profil (2026-09-05)

Mind a 4 fájl ebben a sorrendben futott le (Endre, 2026-09-05), az ellenőrző rácsok tiszták:

- [x] 2026-09-05 — **`2026-09-05-desktop-kapcsolas.sql`** ✅ LEFUTOTT
       Rács 8/8 ✅: tábla, RLS, 2 policy (own_select/own_delete), anon-nak nincs joga,
       authenticated SELECT+DELETE igen / INSERT+UPDATE nem, mentés-besorolás `kizart_titok`,
       takarító függvény, besorolatlan élő tábla NINCS.

- [x] 2026-09-05 — **`2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql`** ✅ LEFUTOTT
       Rács 15/15 ✅: az 5 új típus a CHECK-ben (a régi 16 megmaradt), anyakönyvi link-oszlopok +
       részleges egyedi index, magán-típus trigger, 0 publikus magán program, public_site_events
       V1/V2 + public_calendar_feed kizár, `naptar_nev_kulcs` próba („Özv. Kovács-Nagy" →
       „ozv.kovacsnagy"), `naptar_szemely_alap/nevnapok` (anon NEM, authenticated IGEN),
       `lelkeszi_naptar_feed` V2 csak service_role, névnap-egyeztetés próba (Anna Mária → Anna).

- [x] 2026-09-05 — **`2026-09-05-naptar-feed-kapuk.sql`** ✅ LEFUTOTT
       Rács 18/18 ✅: `public_calendar_feed` V4 — `c.status='active'` kapu, a MAGÁN típusok
       kizárása MEGMARADT (V3 vívmány), a `megjegyzes` ÉS a `leiras` mostantól CSAK a
       `calendar_feed_reszletes` opt-innel megy ki (eddig az adatbázis feltétel nélkül kiadta,
       a szűrés csak az app-rétegben élt → PostgREST-en megkerülhető volt).
       `lelkeszi_naptar_feed` V3 — `profiles.status='active'` kapu + fail-closed fallback.
       Mérés: 0 gyülekezetnél áll BE a részletes feed · 0 gyülekezet esik ki a státusz-kaputól ·
       0 új token-kiesés · a fallback ág BIZONYÍTOTTAN HALOTT KÓD (0 db `scope=congregation`
       + `scope_id IS NULL` sor, a CHECK áll).

       ⛔⛔ **A `2026-09-05-naptar-anyakonyv-szabadsag-nevnap.sql` ETTŐL KEZDVE NEM
       FUTTATHATÓ ÚJRA VÁLTOZATLANUL.** A benne lévő `CREATE OR REPLACE` a két feedet
       visszavinné V3/V2-re, és NÉMÁN visszavenné a fenti négy kaput — miközben a saját
       15/15-ös rácsa VÉGIG ZÖLD MARADNA, tehát semmi nem figyelmeztetne rá.
       Ha mégis újra kell futtatni: UTÁNA a `2026-09-05-naptar-feed-kapuk.sql`-t is futtasd le.

       ⏳ Kísérő app-oldali teendő: `apps/web/lib/auth/effective-access.ts:509-511` ugyanazt a
       szűretlen `profiles.congregation_id` fallbackot használja a lelkészi token KIADÁSAKOR,
       mint amit a feedben most bezártunk. Ma ártalmatlan (a fallback halott kód), de ha a
       `profile_roles_scope_id_check` valaha megszűnik, az app kiadhat olyan linket, amit a
       feed elutasít.

- [x] 2026-09-05 — **`2026-09-05-ertesitesek-felado.sql`** ✅ LEFUTOTT
       Rács 10/10 ✅: feladó-oszlopok + CHECK, levezető függvény + INSERT-trigger, 0 feladó
       nélküli sor, eloszlás: rendszergazda=76 · rendszer=12 · felhasznalo=1; index; írásvédelmi
       UPDATE-trigger; 64 hírlevél-sor markdown; mentés: `globalis_predikatum` az ertesitesek-en.

- [x] 2026-09-05 — **`2026-09-05-profil-pontossag.sql`** ✅ LEFUTOTT
       Rács ✅: `avatar_source` oszlop + CHECK, logos saját profilkép-mappa policy-k, 2 szolgálati
       előzmény-sor átemelve (0 maradt strukturált sor nélkül), 0 „sürgősségi telefon = saját
       telefon". Tájékoztató: 2 profilnál `profiles.email ≠ auth.users.email` (a felület ⚠️-t
       mutat), 0 diocese-eltérés, 6 avatar_url / 6 picture / 0 explicit avatar-döntés.

---

## ✅ LEFUTOTT – pénzügy-átvilágítás (2026-08-27 / 2026-08-28)

- [x] 2026-08-27 — **`docs/2026-08-27-belsotetel-1-meres.sql`** ✅ LEFUTOTT (mérés)
- [x] 2026-08-27 — **`docs/2026-08-27-belsotetel-2-javitas.sql`** ✅ LEFUTOTT
       A `szamadasicel.belsotetel` NULL-ok kitöltve. Endre külön kérése volt — a
       mérés szerint semmi nem OLVASSA az oszlopot, tehát nem hibajavítás, hanem
       az Excellel való egyezés helyreállítása.

- [x] 2026-08-28 — **`docs/2026-08-27-hasonlo-tetel-indexek.sql`** ✅ LEFUTOTT
       Mind a 4 kapu zöld: `idx_befizetes_dup_lookup` és `idx_kiadas_dup_lookup`
       létrejött, **partial (`deleted = false`)** definícióval — tehát nem egy
       korábbi, azonos nevű index maradt a helyükben.
       Érintett sorszám (banki, nem belső mozgás, élő): **befizetés 36 · kiadás 196**.
       ⚠️ A fájl definíciója 2026-05-02 óta állt a repóban, de **élesben sosem futott
       le** — lásd a „a migrációs fájl nem bizonyíték" hibaosztályt.

---

---

## ✅ LEFUTOTT / 🔴 PENDING – gyülekezeti weboldal 2. kör (2026-08-27)

- [x] 2026-08-27 — **`2026-08-27-ALLAPOTFELMERES-publikus-oldal.sql`** ✅ LEFUTOTT
       Eredmény: **C ÁLLAPOT** — sem a 2026-07-17-es, sem a 2026-07-18-as lánc
       nem futott le; nincs `service_times`, nincs `public_site_private` séma,
       az appot a KÖZVETLEN `public_sites` táblaolvasás szolgálja ki.

- [x] 2026-08-27 — **`2026-08-27-gyulekezeti-oldal-naptar-cimer.sql`** ✅ LEFUTOTT
       Mind a 7 kapu zöld (a 6. `➖`, mert nincs V2 — helyes). Élesben mérve:
       a gyülekezet címere és elérhetőségei megjelennek a weboldalon.

- [x] 2026-08-27 — **`2026-08-27-ALLAPOTFELMERES-ketnyelvu-elerhetoseg.sql`** ✅ LEFUTOTT
       Eredmény: gyülekezet román neve ✅, kétnyelvű cím ✅ teljes,
       **egyházmegye és egyházkerület román neve ❌ NINCS** (adathiány, nem
       kódhiba — a felület ilyenkor a magyart mutatja egyedül).

- [x] 2026-08-27 — **`2026-08-27-gyulekezeti-oldal-ketnyelvu-elerhetoseg.sql`** ✅ LEFUTOTT
       Mind az 5 kapu zöld. A 4. kapu igazolta, hogy a kétnyelvű cím TÉNYLEG
       két különböző szöveg. Az 5. sor jelezte a hiányzó román egyházmegye- és
       egyházkerület-nevet (adathiány — a felület ilyenkor a magyart mutatja).
       Hatás: ÚJ, önhordó `public.public_site_identitas(text)` RPC — a
       gyülekezet hivatalos neve, címe (kétnyelvűen), e-mail, telefon,
       egyházmegye és egyházkerület. Nem módosít meglévő függvényt.
       Amíg nem fut le, a weboldal az egynyelvű alakot mutatja (néma tartalék).

- [x] 2026-08-27 — **`2026-08-27-ALLAPOTFELMERES-ketnyelvu-elerhetoseg.sql`** ✅ LEFUTOTT
       ⚠️ Az ÍTÉLET-sora ELŐSZÖR „✅ teljes"-t jelentett a címre, holott CSAK a
       `name_ro`-t nézte — a `name_hu` hiányzott, és a magyar cím a román alakra
       esett vissza. **A félig ellenőrzött kapu rosszabb a nyitottnál.**
       Javítva: most mindkét nyelvet nézi, mindkét szinten, és megnevezi a
       hiányzó felet.

- [x] 2026-08-27 — **`2026-08-27-magyar-telepulesnevek-potlasa.sql`** ✅ LEFUTOTT (csak olvas)
       3 települést talált, ahol gyülekezet van, de az `adrlocality.name_hu` üres.

- [x] 2026-08-27 — **`2026-08-27-magyar-telepulesnevek-KITOLTVE.sql`** ✅ LEFUTOTT
       Brateş → Barátos, Ozun → Uzon, Sfântu Gheorghe → Sepsiszentgyörgy.
       Mindhárom név a gyülekezet SAJÁT magyar nevéből levezetve (nem külső
       tudásból). Élesben igazolva: a magyar cím már
       „Parohiei 214, 527050 **Barátos**, Kovászna megye".
       ⚠️ Az első kiadás elszállt: `42601 too many parameters specified for RAISE`
       — a `%%` a PL/pgSQL RAISE-ben LITERÁLIS százalékjel, nem helyőrző.
       Ezért készült a `scripts/selftest-sql-raise-helyorzo.mjs` őrszem, ami
       MINDEN migráció MINDEN RAISE-ét ellenőrzi (1468 utasítás, 471 fájl).

---

## ✅ LEFUTOTT – presbitérium, tisztségek, naptár (2026-08-26)

- [x] 2026-08-26 — **`2026-08-26-presbiterium-tisztsegek.sql`** ✅ LEFUTOTT (17/17 zöld)
       Ez hozza a `gyulekezeti_programok.publikus` + `ismetlodes_vege` + `'evi'`
       ismétlődést, a `public_sites.show_tisztsegek` / `show_events` kapcsolókat,
       valamint a `public_site_tisztsegek` és `public_site_events` RPC-ket.
       ⚠️ A `public_site_stats` ÉLES változatát is EZ frissítette V3-ra (aktív +
       teljes értékű presbiter-számlálás). **Bármilyen későbbi `CREATE OR REPLACE`
       a régebbi láncokból (pl. 2026-07-17) NÉMÁN visszaírná a V2 törzset.**
       Az ACL-blokkja szerep-toleráns — ezért tudott lefutni ott, ahol a
       2026-07-17/18-as lánc nem.

---

## 🔴 PENDING – gyülekezeti weboldal: címer, elérhetőség, éves naptár (2026-08-27)

**⚠️ FONTOS ÉLES-TÉNY, AMI EBBEN A KÖRBEN DERÜLT KI.** A publikus gyülekezeti
oldal ma a `site-loader.ts` HARMADIK, „átmeneti kompatibilitási" ágán fut:
KÖZVETLEN `public_sites` táblaolvasáson. Sem a `public_site_context` (V1), sem
a `public_site_context_v2` NEM létezik élesben, mert a hozzájuk tartozó
2026-07-17-es és 2026-07-18-as lánc egyike sem futott le (lásd feljebb).
Következmények, amikre eddig senki nem gondolt:

- **nincs `public_sites.service_times` oszlop** → az adminban a „Rendszeres
  alkalmak" szerkesztő MEG SEM JELENIK (a felület kecsesen elrejti), ezért
  látszik üresnek az Alkalmaink menetrend
- **nincs `public_sitemap_entries`** → a `sitemap.xml` ÜRES
- minden javítás, ami csak a kontextus-RPC-kbe kerül, ÉLESBEN HATÁSTALAN

⚠️ **A 2026-07-17/18-as láncot NE tegye senki „szerep-toleránssá" és futtassa
le vakon.** A `2026-07-17-public-site-read-security.sql` `CREATE OR REPLACE`-szel
újraírná a `public_site_stats` függvényt a RÉGI (V2) törzsre, némán visszavonva
a 2026-08-26-i presbitérium-körben élesített V3 javítást (aktív + teljes
presbiter-számlálás). Az a lánc külön, gondos kört érdemel.

- [x] **`2026-08-27-ALLAPOTFELMERES-publikus-oldal.sql`** ✅ LEFUTOTT (lásd feljebb)
       Bármikor futtatható, semmit nem módosít. Megmutatja, melyik publikus RPC
       létezik, megvan-e a `service_times` oszlop, mi az `anon` jogosultsága a
       `public_sites`-on, és gyülekezetenként hány program van nyilvánosnak
       jelölve. Az alábbi migráció ELŐTT érdemes lefuttatni.

- [x] **`2026-08-27-gyulekezeti-oldal-naptar-cimer.sql`** ✅ LEFUTOTT 2026-08-27 (lásd feljebb)
       Indok: Endre SQL Editor-futtatására vár (PR #194 / v0.9.184).
       **2. KIADÁS.** Az 1. kiadás élesben elhasalt a saját előfeltétel-őrén
       (`public_site_private.public_site_context_v2` nem létezik) — az az őr
       olyat követelt, ami a működéshez nem is kellett.
       Hatás:
         · `public.public_site_congregation_fallback(text)` — ÚJ, ÖNHORDÓ RPC:
           a gyülekezet saját címere és elérhetőségei tartaléknak. Nem függ
           semmilyen korábbi publikus-oldal migrációtól, ezért MINDHÁROM élő
           betöltési ág fölött hat.
         · `public.public_site_events_v2(text, integer)` — ÚJ: nyilvános
           programok egy teljes évre, LEÍRÁSSAL (Endre kifejezett kérése; a
           belső `megjegyzes` továbbra sem megy ki).
         · `public_sites.service_times` oszlop + validátor + CHECK —
           SZEREP-TOLERÁNSAN átvéve a 2026-07-18-as fájlból (a validátor törzse
           bájthű másolat), hogy a „Rendszeres alkalmak" szerkesztő végre
           látszódjon.
       **Minden GRANT/REVOKE szerep-toleráns**: az `app_staff_user`,
       `app_pending_user`, `member_portal_user` élesben nem létezik — pontosan
       ezen bukott el a 2026-07-18-as migráció.
       Amit SZÁNDÉKOSAN nem vesz át: az `ALTER DEFAULT PRIVILEGES … REVOKE
       EXECUTE ON FUNCTIONS` globális beállítást (az minden jövőbeli rutint
       érintene az egész adatbázisban — külön döntés kell hozzá).

## ✅ LEFUTOTT – Egyházkerületi S5: könyvelés + leltár + iktatás (2026-08-22)

**⚠️ A SORREND KÖTÖTT: S5a → S5b → S5c.** Az S5c őrszeme ellenőrzi, hogy az S5a
lefutott (`iktato.district_id` léte); az S5b független, de a felület csak
mindhárom után lesz teljes. Mindegyik fájl 3 szakaszos: a 0. csak olvas, az 1.
EGYETLEN tranzakció fail-closed őrszemmel, a 2. ellenőriz.

- [x] 2026-08-22 — **`2026-08-17-egyhazkeruleti-S5a-scope-oszlopok.sql`** ✅ LEFUTOTT
       A 2. szakasz MINDEN sora zöld: 6/6 `district_id` + FK, **6/6 háromoszlopos
       scope-CHECK**, 4/4 kerületi egyediségi index, **8/8 régi index VÁLTOZATLAN**,
       `iktato_id_district_uk` + kompozit FK ✅, `next_iktato_sequence_dis` + GRANT ✅
       (a cong/dio RPC érintetlen), 12/12 kerületi policy, **0 beburkolt kerületi láb**
       + **12/12 immunitás**, 0 írási láb olvasó-feloldóval, 32 nem-kerületi policy
       (érintetlen), `purge_recycle_bin()` szűkítve ✅ **és a törzse a 2026-08-14-es,
       3 oszlopos, 12 táblás, `deleted_at`-alapú alak maradt** ✅, 6/6
       `globalis_predikatum`, 3 egyházkerület. Eredeti teendő-leírás: A LELTÁR és az IKTATÓ kerületi hatóköre — nem új
       táblák, hanem a MEGLÉVŐ 6 táblán (`leltar_tetelek`, `iktato`,
       `iktato_sablonok`, `iktato_yearly_closures`, `iktato_csatolmany`,
       `iktato_sequence_pointers`) egy `district_id` oszlop.
       **(1)** A scope-őr CHECK cseréje kétoszloposról háromoszloposra mind a 6
       táblán — enélkül az ELSŐ kerületi leltári tétel `23514`-gyel elhasalna
       (`num_nonnulls(...) = 1`, kerületi sornál mindkét régi oszlop NULL).
       Az idempotencia-őr a DEFINÍCIÓRA néz, nem a névre: a név ugyanaz marad.
       **(2)** A 4 kerületi RÉSZLEGES EGYEDISÉGI index (leltári szám, iktatószám,
       évzárás, sorszám-mutató) — enélkül DUPLIKÁLT IKTATÓSZÁM kerülhetne egy
       hivatalos iratra.
       **(3)** `iktato_id_district_uk` + a HARMADIK kompozit FK az
       `iktato_csatolmany`-on: kerületi sornál a két meglévő kompozit FK
       MATCH SIMPLE mellett vákuumosan teljesülne, tehát a csatolmány BÁRMELYIK,
       akár idegen iktató-sorra mutathatna.
       **(4)** `next_iktato_sequence_dis()` + GRANT, az `ON CONFLICT` arbitere a
       (2)-ben, UGYANEBBEN a tranzakcióban létrejövő részleges index.
       **(5)** ⛔ `purge_recycle_bin()` **DROP + újralétrehozás** a 2026-08-14-es
       (élő) törzsből, `congregation_id IS NOT NULL` scope-szűrővel kiegészítve.
       Ma NINCS szűkítve: a NAPI takarítás (03:15 UTC) FIZIKAILAG törölné a
       kerületi ÉS a MEGYEI sorokat, pedig azoknak nincs Kuka-útjuk. **Ez a
       megyei szintet is megvédi — ma azok is törlődnének.**
       ⚠️ MIÉRT DROP ÉS NEM `CREATE OR REPLACE`: az élő függvénynek HÁROM kimeneti
       oszlopa van (`tbl, deleted_count, skipped_count`), és a PostgreSQL a
       visszatérési típus megváltoztatását `CREATE OR REPLACE`-szel nem engedi
       (42P13). Mivel az 1. szakasz egyetlen tranzakció, ez az EGÉSZ S5a-t
       visszagörgetné. A DROP elviszi a jogokat, ezért a `GRANT EXECUTE … TO
       service_role` visszaállítása kötelező — az utó-ellenőrző DO ezt méri is.
       ⚠️ A `2026-08-14-kuka-deleted-at.sql` is megkapta a scope-szűrőt, mert
       annak újrafuttatása különben NÉMÁN visszaállítaná a szűretlen törzset.
       **(6)** 12 új kerületi RLS-policy, a kanonikus szerep-szűrt függvényekkel.

- [x] 2026-08-22 — **`2026-08-17-egyhazkeruleti-S5b-penzugy-tablak.sql`** ✅ LEFUTOTT
       5/5 tábla, mindegyiken RLS BE + pontosan 2 policy; 5/5 író policy a SZEREP-SZŰRT
       feloldóval és **0 szerep-szűrő nélküli `profile_roles`-ág**; 5/5 számvevő SELECT;
       **0 írási láb olvasó-feloldóval**; **0 hatókör-szivárgás** (egyetlen district-policy
       sem hivatkozik megyei/gyülekezeti feloldóra); 20/20 GRANT, **0 jog az anonnak**,
       3/3 szekvencia-USAGE, 3/3 függvény-EXECUTE; 3/3 upsert-kulcs; **0 hiányzó
       oszlop-pár a `diocese_*` tükörhöz** (tökéletes tükör); 5/5 mentés-besorolás és
       **0 besorolatlan élő tábla az EGÉSZ sémában** (a napi mentés elindul);
       10/10 megyei policy változatlan. Eredeti teendő-leírás: Az 5 kerületi pénzügyi tábla a `diocese_*` párjaik
       betűhű tükreként: `district_bealitas`, `district_befizetes`,
       `district_kiadas`, `district_koltsegvetes`, `district_annual_reports`.
       A `bealitas` MÁR a 2026-08-15 utáni TELJES alakban készül (9
       `koltsegvetes_mod*` + 3 `koltsegvetes_unlock_*` + `szamadas_hatarozat_*`),
       tehát a kerület nem örökli a megyénél utólag pótolt hiányokat.
       RLS táblánként 2 policy (író + kerületi számvevő olvasó), a GRANT-ok a
       policy-csere ELŐTT, egy tranzakcióban.
       **⛔ MENTÉS-BESOROLÁS UGYANEBBEN A TRANZAKCIÓBAN**: mind az 5 tábla bekerül
       a `backup_table_policy`-ba (`tabla` kulcsoszlop, `hatokor='globalis'`,
       `reteg=2`) — besorolatlan tábla esetén a NAPI MENTÉS MINDEN gyülekezetnél
       LEÁLL.

- [x] 2026-08-22 — **`2026-08-17-egyhazkeruleti-S5c-storage-bank.sql`** ✅ LEFUTOTT
       3/3 kerületi storage-láb, **a kerületi és a megyei policy UGYANAZZAL a módszerrel
       bontja az utat** (`storage.foldername()`) — ez volt a „két szint máshogy elemzi,
       az egyik némán sosem illeszkedik" csapda őre; 3/3 megyei láb érintetlen.
       `bankszamlak.district_id` + `chitanta_tombok.district_id` FK-val ✅; mindkét
       CHECK a RÉGI kifejezéshez OR-olt új ággal bővült (szigorú felsőhalmaz);
       4 részleges index; 8/8 kerületi policy, **0 írási láb olvasó-feloldóval**,
       **8/8 COALESCE fail-closed**; a meglévő sorok (bankszamlak 4 gyülekezeti,
       chitanta_tombok 11 gyülekezeti) és a régi policy-k VÁLTOZATLANOK.
       **(A)** 3 storage-policy az `iktato-csatolmanyok` bucket kerületi prefixű
       útjaihoz (`{district_id}/{iktato_id}/…`), a megyei `_dio_*` betűhű tükre.
       Enélkül a kerületi irat iktatható, de a MELLÉKLETE 403-mal bukna.
       **(B)** `bankszamlak` + `chitanta_tombok` kerületi kinyitása: `district_id`
       oszlop, a `*_scope_check` és `*_scope_fk_check` bővítése, 4 részleges index,
       8 RLS-láb. ⚠️ **Ez ÉLŐ, gyülekezeti táblákat érint.** A CHECK-cserénél a
       régi ágakat nem gépeljük újra: a `pg_get_constraintdef()` élő kifejezéséhez
       OR-olunk egy ágat, tehát a predikátum szigorú felsőhalmaz — ma érvényes sor
       nem eshet ki. A célzás `conkey` + `conname` szerint (`LIKE` sehol — az
       egyszer már elsült élesben).

**Utólagos kiegészítés két MÁR LEFUTOTT megyei fájlban** (csak újrafuttatáskor
számít, a megyei viselkedést nem változtatja): a `2026-08-15-egyhazmegyei-scope-oszlopok.sql`
és a `2026-08-15-egyhazmegyei-iktato-leltar-s4.sql` policy-burkoló DO-blokkja
megkapta az `AND p.policyname NOT LIKE '%district%'` sort. Enélkül egy jövőbeli
újrafuttatás a kerületi policy-kat is beburkolná `congregation_id IS NOT NULL AND (…)`
alakra, ami kerületi sorra örökre hamis — MINDEN kerületi sor NÉMÁN eltűnne.

---

## ✅ LEFUTOTT – Egyházkerületi S3: fogadó felület (2026-08-16)

- [x] 2026-08-16 — **`2026-08-16-egyhazkeruleti-S3-fogado.sql`** ✅ LEFUTOTT
       A 2. szakasz minden sora zöld: az oszlop-őrszem RÁ VAN KÖTVE a táblára
       (BEFORE UPDATE), a kompozit FK és a `dioceses` UNIQUE (id, district_id)
       létrejött, 0 hamis district_id, a kerületi számvevő SELECT policy-ja él
       és NEM kapott írási jogot, mind a 3 függvény-GRANT megvan, és a megyei
       felküldés útja érintetlen. Eredeti teendő-leírás:
       A kerületi fogadó felület adatbázis-alapja. NÉGY dolgot old meg:
       **(1) 9. csapda — a fagyasztott irat védelme.** BEFORE UPDATE trigger
       (`diocese_felterjesztes_kerulet_oszlopvedelem`): kerületi útról CSAK a
       status / received_* / returned_reason / notes / unlock_* / updated_at
       változhat. A `snapshot_data`, `iktatoszam`, `submitted_*`, `doc_type`,
       `year`, `diocese_id`, `district_id` SOHA — a kerület nem hamisíthatja meg
       a megye beküldött iratát. **Engedélyezési listás** (`to_jsonb` diff),
       tehát minden később hozzáadott oszlop automatikusan védett. A MEGYEI
       felküldés (`rogzitDioceseFelterjesztes`) és a rendszergazda átmegy rajta.
       Külön záradék köti a `received_by`-t (csak a saját uid) és az
       `unlock_requested_by`-t (kerület felől csak NULL-ra) — okirat-integritás.
       **(2) 10. csapda — a valódi lánc.** `dioceses` UNIQUE (id, district_id) +
       kompozit FK (diocese_id, district_id): egy esperes nem küldhet fel
       tetszőleges kerülethez. ⚠️ Ettől KÉT FK mutat a `dioceses`-re, tehát a
       PostgREST-beágyazás kétértelmű (PGRST201) — a fájl 2/B-205 sora és a
       fejléce is figyelmeztet rá.
       **(3) A kerületi SZÁMVEVŐ olvasása.** A meglévő `_kerulet_select` a
       `current_user_district_ids()`-t hívja (csak admin) → az ellenőr ÜRES
       listát látott volna, ami „nincs beküldve"-nek látszik. Új, külön SELECT
       policy a `current_user_district_olvaso_ids()`-re.
       **(4) Az ÉRTESÍTÉS-LÁNC kerületi vége.** Az `ertesitesek_szint_insert`
       `congregation_id IS NOT NULL`-t követel, a felterjesztés viszont a MEGYE
       irata (nincs gyülekezete) → kerületi adminként MINDEN átvétel/
       visszaküldés/feloldás-értesítés elbukott volna az RLS-en, némán. Új,
       szűk `ertesitesek_kerulet_insert` policy: gyülekezet nélküli sor, a hívó
       kerületébe eső egyházmegye AKTÍV tisztségviselőjének címezve.

---

## ✅ LEFUTOTT – Egyházkerületi szint: S1c rálátás-bezárás + S2 identitás (2026-08-16)

- [x] 2026-08-16 — **`2026-08-16-egyhazkeruleti-S1c-ralatas-bezaras.sql`** ✅ LEFUTOTT
       **35 policy / 33 tábláról** tűnt el a kerületi sor-szintű rálátás. A megye
       írása SÉRTETLEN (5/5 policy hívja a megyei feloldót), a `document_submissions`
       és a `diocese_felterjesztes` kerületi ablakai (2+2) megmaradtak, az
       `annual_reports_select_district` és a `district_member_counts()` is.
       A `felettes_szint_szerkesztheto` kerületi lába szándékosan MEGMARADT.
       Eredeti teendő-leírás:
       ENDRE K4 DÖNTÉSE: „A kerület nem írhatja és nem is olvassa a kerület
       gyülekezeteinek és egyházmegyéinek az adatait, csak a hivatalosan
       beküldött adatokat illetve azoknak az összesítőjét."
       A `felettes_szint_hozzaferese()` és a `felettes_szint_gyulekezet_ids()`
       megye-only alakra vált (a 2026-08-11-es fájl előkészített, sosem futott
       „2/B" szakaszából, betűhűen), és az 5 megyei pénzügyi policy kerületi ága
       megszűnik. Egy csapásra ~40 tábláról tűnik el a kerületi sor-szintű
       rálátás — a 0/D szakasz NÉV SZERINT felsorolja őket futtatás előtt.
       ⚠️ MEGMARAD (fail-closed őrszem ellenőrzi, mielőtt bármit elvenne):
       `document_submissions_district_select/_update` (a beküldött iratok — csak
       a továbbított/véglegesített sorokra), `diocese_felterjesztes_kerulet_*`
       (a felterjesztési csatorna), a törzsadat-olvasás és a
       `district_member_counts()` összesítő RPC.
       ⚠️ MEGMARAD a `felettes_szint_szerkesztheto()` kerületi lába is: az a
       GYÜLEKEZETI TÖRZSADAT (név, cím) szerkesztése, ami adminisztratív
       funkció, nem „a gyülekezet adata" — ha ezt is el akarod venni, szólj.
       A 2/E szakasz 4 lépéses KÉZI PRÓBÁT ír le.

- [x] 2026-08-16 — **`2026-08-16-egyhazkeruleti-S2-identitas.sql`** ✅ LEFUTOTT
       29/29 oszlop, a kerületi vezetői négyes (puspok_nev/puspok_cim/
       adminisztrator_nev/szamvevo_nev), `esperes_*` NEM jött létre, a teszt-jelölés
       PONTOSAN a „Teszt Egyházkerület"-re, az anon CSAK (id, name)-et olvashat
       (CIF/IBAN/pecsét/aláírás/cím/e-mail/telefon mind ZÁRVA), az írás-policy
       MINDKÉT ágával (rendszergazda + saját kerület), `districts-logos` bucket
       + 4 policy, `tg_districts_updated` trigger.
       ⏳ NYITOTT DÖNTÉS marad: a pecsét/aláírás publikus bucketben van.
       Eredeti teendő-leírás:
       A `districts` hivatalos identitása: 29 új oszlop a `dioceses` mintájára,
       de KERÜLETI vezetői nevekkel (`puspok_nev`, `puspok_cim`,
       `adminisztrator_nev`, `szamvevo_nev`) — `esperes_*` NEM jön létre.
       Plusz `teszt boolean` (a „Teszt Egyházkerület" látható megjelöléséhez),
       `districts-logos` storage bucket, és az ELSŐ írás-policy a táblán
       (`districts_update_district_scope`) — eddig egyetlen sem volt, tehát a
       kerületi admin nem tudta menteni a saját adatait.
       ⚠️ ANON-VÉDELEM: a fájl EGYETLEN GRANT-ot sem ad az anonnak, és a COMMIT
       ELŐTT `has_column_privilege()`-dzsel végigméri mind a 29 új oszlopot —
       szivárgás esetén RAISE EXCEPTION-nel VISSZAGÖRDÍTI az egész tranzakciót.
       ❓ **ENDRE DÖNTÉSÉRE VÁR** (a fájl fejlécében is): a püspöki pecsét és az
       aláírás publikus bucketbe kerül, tehát az URL birtokában bejelentkezés
       nélkül letölthető. Ez okirat-hamisítási felület. Ma a gyülekezeti és a
       megyei szint is így működik — a döntés mind a hármat érinti.

---

## ✅ LEFUTOTT – Egyházmegyei számvevő neve (2026-08-15, Endre kérése)

- [x] 2026-08-16 — **`2026-08-15-egyhazmegyei-szamvevo-nev.sql`** ✅ LEFUTOTT
       `dioceses.szamvevo_nev` text (nullable), a négy vezetői oszlop mind megvan.
       Eredeti teendő-leírás:
       Indok: egyetlen NULLABLE oszlop (`dioceses.szamvevo_nev`) a hivatalos
       megyei irat aláírás-rovatához. A beállítás-varázsló mostantól LISTÁBÓL
       kínálja fel a vezetőket (esperes / jegyző / számvevő) — a megye
       gyülekezeteinek lelkészei és a megyéhez kiosztott szerepkörök közül —,
       de a számvevő nevének eddig nem volt hova kerülnie.
       ⚠️ NEM sürgős: az app FAIL-SOFT. Amíg nem fut le, a mentés a
       `szamvevo_nev` nélkül megy végbe (updateDioceseFailSoft), tehát semmi
       más adat nem vész el — csak ez az egy mező nem tárolódik.

---

## ✅ LEFUTOTT – Egyházkerületi szint (3. szint) S0 + S1 + javítások (2026-08-15/16)

- [x] 2026-08-16 — **`2026-08-15-egyhazkeruleti-S1b-anon-truncate.sql`** ✅ LEFUTOTT
       Mind a 8 TRUNCATE/REFERENCES/TRIGGER jog visszavonva (anon + authenticated,
       districts + dioceses), mind az 5 regressziós őr zöld, a service_role
       érintetlen. Eredeti teendő-leírás:
       Indok: az S0 0/B szakasza kimutatta, hogy az `anon` szerepnek
       **TRUNCATE** joga van a `districts` és a `dioceses` táblán (a
       `authenticated`-nek szintén). **A TRUNCATE-re az RLS SOHA nem
       vonatkozik**: hiába nincs a `districts`-en egyetlen írás-policy sem,
       a TRUNCATE joggal a teljes törzsadat kiüríthető — és a `districts`
       kiürítése az egész rendszert megbénítaná (mind a 25 egyházmegye FK-val
       mutat rá). Az S1 abban a változatában, ami lefutott, csak a SELECT-et és
       a három DML-jogot vonta vissza. Ez a fájl `REVOKE ALL PRIVILEGES`-szel
       zárja le, és MEGMÉRI, hány másik táblán él ugyanez (azokhoz nem nyúl).

- [x] 2026-08-15 — **`2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql`** ✅ LEFUTOTT
       A 2. szakasz mind a 26 sora zöld: az új szerep kiosztható, az olvasó
       függvény megvan GRANT-tal, és a `has_column_privilege()` döntő próbája
       igazolta, hogy az anon a CIF-et, IBAN-t, pecsétet, aláírást, címet és
       elérhetőségeket **már NEM olvassa**, miközben az (id, name, district_id)
       hármas megmaradt a regisztrációs űrlapnak.
       ⚠️ **DE:** a fájl 1/A szakaszának `LIKE '%role%'` szűrője MELLÉFOGOTT —
       lásd a következő tételt. A repóban a szűrő azóta oszlop-alapú
       (`conkey`), tehát egy ÚJRAfuttatás már nem okozná ugyanezt.

- [x] 2026-08-16 — **`2026-08-15-egyhazkeruleti-S1-JAVITAS-custom-label-check.sql`** ✅ LEFUTOTT
       A `profile_roles_custom_label_check` visszaállt az eredeti, 2026-04-17-i
       alakra; mind az 5 CHECK a nevéhez illő definíciót hordja, és a szerep-lista
       megőrizte az `egyhazkeruleti_szamvevo`-t ÉS a `custom`-ot.
       Eredeti teendő-leírás:
       Indok: az S1 1/A szakasza a szerep-értéklista CHECK-jét kereste
       `pg_get_constraintdef(...) LIKE '%role%'` szűrővel. Ez a
       `profile_roles_custom_label_check`-et IS megfogta (a definíciója említi
       a `role` oszlopot), eldobta, és a helyére — ugyanazzal a névvel — a
       szerep-értéklistát tette. Következmény: az egyedi szerepkörök
       CÍMKE-integritási őre némán megszűnt (ezután `role = 'custom'` sor
       létrejöhetne címke nélkül). **Adat nem veszett el, egyetlen sor sem
       módosult** — csak egy CHECK cserélődött ki. Ez a fájl visszateszi az
       eredeti, 2026-04-17-i alakra, fail-closed módon (ha közben keletkezett
       szabálysértő sor, megáll és név szerint felsorolja).
       A másik három CHECK (scope, approval_status, scope_id) és a `profiles`
       tábla érintetlen — a 0. szakasz ezt bizonyítja is.

- [x] 2026-08-16 — **`2026-08-15-egyhazkeruleti-S0-allapotfelmeres.sql`** ✅ LEFUTOTT (csak olvasó)
       Az eredményéből épült az S1c és az S2. Fő megállapításai: `districts` = 3
       oszlop; 3 kerület (köztük a Teszt); 25/25 megyének van kerülete; 0 eltérés
       a `congregations.district` szövegben; mind a 6 scope-tábla CHECK-je
       kétoszlopos (az S5 dolga); a PK-k már surrogate `id`-k.
       Eredeti teendő-leírás:
       ⚠️ Az első próbálkozás `42P01: missing FROM-clause entry for table "t"`
       hibával elszállt (a 0/C szakasz második ágából kimaradt a saját
       `FROM (VALUES …) AS t(tabla)` záradéka). JAVÍTVA. Az egész repót
       őrzi ezután a `scripts/selftest-sql-union-from.mjs` önellenőrzés,
       ami pontosan ezt a hibaosztályt keresi minden SQL riport-blokkban.
       Indok: ez a 3. szint MINDEN további SQL-jének bemenete. Egyetlen SELECT,
       semmit nem módosít. A `migration-docs/Database_schema.sql` dump ELAVULT
       (2026-07-10-ig ér), a 2026-08-15-ös migrációk nincsenek benne — ezért
       tilos belőle tervezni. Ez a fájl az ÉLŐ adatbázisból adja vissza: a
       `districts` oszlopkészletét, a 6 scope-oszlopos tábla CHECK-jét és
       részleges indexeit, a `current_user_*` függvények meglétét ÉS
       GRANT-jait, a `felettes_szint_hozzaferese()` kerületi lábát (K4 döntés),
       a `district` hatókörű `profile_roles` sorokat, a
       `diocese_felterjesztes` egyedi indexének oszlopszámát (3 = rossz,
       4 = helyes), valamint a 14 dokumentált csapda mérési pontjait.
       ⚠️ FUTTASD ELŐBB, MINT AZ S1-ET, és az eredményt küldd vissza.

- [x] 2026-08-15 — **`2026-08-15-egyhazkeruleti-S1-hatokor-biztonsag.sql`** ✅ LEFUTOTT
       (Lásd a fenti, részletes bejegyzést is.) Eredeti teendő-leírás:
       Indok: három, egymástól független javítás egyetlen tranzakcióban.
       (A) Az `egyhazkeruleti_szamvevo` szerep felvétele a `profiles.role` és a
       `profile_roles.role` CHECK-jébe — enélkül az app-oldali szerep
       KIOSZTHATATLAN (23514). (B) `current_user_district_olvaso_ids()` — a
       kerületi OLVASÓ hatókör, a `current_user_diocese_olvaso_ids()` betűhű
       párja; az app-tükre `apps/web/lib/auth/level-scope.ts`
       (DISTRICT_WRITE_ROLES / DISTRICT_READ_ROLES), a két réteget a
       `scripts/selftest-kerulet-hatokor.mjs` köti össze. (C) ⛔ ÉLŐ SZIVÁRGÁS
       ZÁRÁSA: a `dioceses` hivatalos adatai (CIF, IBAN, pecsét-URL,
       aláírás-URL) MA bejelentkezés nélkül olvashatók — az `anon` szerep
       tábla-szintű SELECT joga oszlop-szintűre szűkül
       (`districts` → id, name; `dioceses` → id, name, district_id).
       Ez fail-closed a jövőre: az S2-ben érkező érzékeny oszlopokra az anon
       automatikusan NEM kap jogot.
       ⚠️ FUTTATÁS UTÁN 2 PERCES PRÓBA: inkognitó ablakban a
       `/hozzaferes-kerese` oldal két legördülőjének MEG KELL TELNIE.

---

## 🔴 PENDING – Dokumentumtár: gyülekezeti fájl-terület (2026-08-15, 7. pont A)

- [ ] **`2026-08-15-dokumentumtar-gyulekezeti-fajlok.sql`** — PENDING (még nem futott)
       Indok: a dokumentumtár PR merge előtt kell futtatni a Supabase SQL
       Editorban. Új `gyulekezeti_dokumentum` tábla (RLS + oszlop-szintű
       UPDATE grant a soft-delete-hez) + `gyulekezeti-dokumentumok` privát
       bucket (25 MB) + storage policy-k. Idempotens; a végén beépített
       verifikációs SELECT (minden sor ✅ kell legyen). Amíg nem fut le, az
       app hangos magyar hibával jelzi a hiányt (fail-closed).

---

## 🔴 PENDING – filmszerű honlaptéma és publikus témaolvasás (2026-07-18)

- [x] 2026-07-18 — **`2026-07-17-public-site-v2-themes.sql`** ✅ LEFUTOTT
       A négysoros produkciós eredmény igazolta mind a négy aktív témát; a
       `filmszeru-tortenet` preset `sort_order=4` értékkel létrejött. A seed
       tiszta, idempotens DML; policyt és grantet nem módosított.

- [ ] **`2026-07-17-public-site-read-security.sql`** — REVIEW-DRAFT / BLOKKOLT
       Nem része a filmszerű téma kiadásának. Csak a teljes tagiportál-P0 és
       workflow cutover után futtatható. A 2026-07-18-i téves próbafutás a
       hiányzó `KARTOTEKA_P0_AUTH_ISOLATION_V1` exact marker preflightján
       fail-closed leállt; a tranzakció teljesen visszagördült, részleges
       adatbázis-módosítás nem maradt.

---

## 🔴 PENDING – publikus oldal adatvezérelt alkalmak és sitemap (2026-07-18)

- [ ] **`2026-07-18-public-site-content-and-sitemap.sql`** — PENDING (még nem futott)
       Indok: a 2026-07-17-es tagi portál és `public-site-read-security` lánc
       sikeres postflightjára, majd felhasználói SQL Editor-jóváhagyásra vár.
       Hatás: validált `public_sites.service_times` JSONB, privát SECURITY DEFINER
       olvasók és két szűk, anon SECURITY INVOKER RPC a publikus contexthez és
       sitemaphez. Kötelező sorrend:
       `migration-docs/public-site-2026-07-18-rollout.md`.

---

## 🔵 DIAGNOSZTIKA — csak OLVAS (SELECT), 2026-06-19

Az import-párosítás audithoz. Nem módosítanak semmit; futtasd a Supabase SQL editorban,
és az eredményt küldd vissza — ezek alapján döntünk a spouse-bridge-ről és az idempotencia-indexről.

- [ ] **`2026-06-19-diag-asszonynevek-szcs-nev.sql`** — DIAGNOSZTIKA (csak olvas)
       Férjes asszonyok név-tárolása + lánykori (szcs_nev) kitöltöttség → eldönti, kell-e spouse-bridge (P1-4).
- [ ] **`2026-06-19-diag-import-duplikatumok.sql`** — DIAGNOSZTIKA (csak olvas)
       Meglévő befizetés-duplikátumok kimutatása egy esetleges idempotens UNIQUE index ELŐTT.
- [x] 2026-06-19 — **`2026-06-19-diag-300-belso-mozgas.sql`** ✅ LEFUTOTT
       Eredmény: 300.01 belsotetel="300.01" → valóban belső mozgás → a fix (eda5237a) IGAZOLT, marad.
- [x] 2026-06-19 — **`2026-06-19-diag-asszonynevek-szcs-nev.sql`** ✅ LEFUTOTT
       Eredmény: 125/183 (~68%) nő a férj nevén → spouse-bridge ELVETVE.
- [x] 2026-06-19 — **`2026-06-19-diag-import-duplikatumok.sql`** ✅ LEFUTOTT
       Eredmény: 0 ütközés → idempotens UNIQUE index NEM ajánlott (app-szintű dedup elég).
- [x] 2026-06-19 — **`2026-06-19-diag-berleti-dupla-szamitas.sql`** ✅ LEFUTOTT
       Eredmény: szerzodes_db=0 → NINCS bérleti szerződés → a dupla-számítás jelenleg nem fordulhat elő.
- [ ] **`2026-06-19-diag-azonos-nevu-szemelyek.sql`** — DIAGNOSZTIKA (csak olvas)
       Azonos nevű személyek a tagnyilvántartásban + a cím feloldja-e őket (egyházfenntartás-import
       duplikáció-kockázat). Az A)–C) eredmény kell a robusztus párosítás-tervhez.

---

## 🔴 PENDING (futtatásra vár) — 2026-05-17

### Sorrend nem számít (mind független művelet)

- [x] 2026-05-17 — **`2026-05-15-legacy-cleanup-drop.sql`** ✅ LEFUTOTT
       19× `DROP TABLE IF EXISTS *_ARCHIVE_2026_04_15` (Endre megerősítette: sikeresen lefutott).

- [x] 2026-05-17 — **`2026-05-17-security-definer-search-path-pin.sql`** ✅ LEFUTOTT
       17× `ALTER FUNCTION ... SET search_path = public, pg_temp` (CVE-2018-1058 mitigation).
       A verifikációs SELECT mind a 17 függvényre `✅ OK (public, pg_temp)` státuszt adott.
       **Történet**: az 1. próbafutás (eredeti, 19 függvényt céloz) `42883: function public.issue_license(text, text, text, inet, text) does not exist` hibára futott — a tranzakció rollback-elt. Production-audit (Supabase Studio diagnosztikai SELECT) megerősítette, hogy 2 függvény (`issue_license`, `revoke_license`) hiányzik (a standalone-licenses.sql migráció nem futott — a Tauri standalone licensz-flow nincs élesben). A migráció szerkesztve, 2 ALTER kivéve → 2. futás hibamentes.

- [x] 2026-05-17 — **`2026-05-06-egyhfenntartas-import-dup-index.sql`** ✅ LEFUTOTT
       `CREATE INDEX IF NOT EXISTS idx_befizetes_egyhf_import_lookup` (5-mezős partial). Verifikáció: a `befizetescel.id_szamadasicel='101.01'` lookup visszaadta `{id: 80, nev: 'Egyházfenntartói járulék', aktiv: true}` — a downstream import-flow használhatja.

- [ ] **`2026-05-29-keresztseg-alapige-oszlop.sql`** — PENDING (még nem futott)
       Indok: Schema cache hiba "Could not find the 'alapige' column of 'keresztseg'".
       Hatás: `ALTER TABLE keresztseg ADD COLUMN IF NOT EXISTS alapige varchar` (nullable, idempotens).
       A baptism-dialog, registry validation és Excel-import már most is hivatkozik az oszlopra.

- [ ] **`2026-05-29-iktato-fazis-3-workflow.sql`** — PENDING (még nem futott)
       Indok: Iktató Fázis 3 — Workflow. Évvégi lezárás + másodpéldány-flag + hivatali út.
       Hatás: (1) `iktato.has_duplicate boolean DEFAULT false` oszlop hozzáadása;
       (2) új `iktato_yearly_closures` tábla (PK: congregation_id+year) — egy év csak egyszer zárható le;
       (3) RLS POLICY-k a yearly_closures-re (SELECT a saját gyülekezetre, INSERT csak admin/pastor/master).
       A `closeFilingYear` action és a UI „X-es év lezárása" gomb használja.
       BEGIN/COMMIT csomagolva (P2-12 betartva).

- [ ] **`2026-04-30k-diagnoszt-baptism-szulok.sql`** — diagnosztikai SELECT-ek a keresztelő szülő-load hibakereséséhez. Read-only, séma-érintetlen. Hardcoded `id = 1163`, cserélendő.

- [ ] **`2026-04-30l-backfill-csalad-text-szulokbol.sql`** — DRY-RUN előnézet (1-3. blokk) + élő backfill (4-7. blokk, kommentelt). Az élő UPDATE/INSERT a `/* ... */` blokkban — uncomment szükséges.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis5-gdpr-valasztoi.sql`** ✅ LEFUTOTT
       Verifikáció (Endre): `recompute_voter_eligibility` RPC létezik. A GDPR-mezők +
       választói automatika élesben.
       Tartalom: Tagnyilvántartás Fázis 5 — GDPR-hozzájárulások (P3-5) + választói automatika (P3-7).
       Hatás: (1) `szemely` új oszlopok: `gdpr_consent_at`, `photo_consent`, `mailing_consent`,
       `voter_manual_override` (+ CHECK 0/1); (2) `recompute_voter_eligibility(uuid)` RPC —
       szabály-alapú választói névjegyzék (18+, konfirmált, élő aktív tag), a kézi felülbírálást
       tiszteletben tartva; beállítja a `szemely.voter_eligible` flag-et, visszaad { eligible,
       total, added, removed }.
       ⚠️ A webapp-kód (GDPR-panel a személyi kartonon, „Jogosultság frissítése" gomb a Választók
       fülön) hivatkozik ezekre — a migráció nélkül a mezők nem jelennek meg / az újraszámítás
       hibát ad, de adatvesztés nincs. Verifikáció: fájl végi diagnosztika (4 oszlop + RPC).
       BEGIN/COMMIT csomagolva.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql`** ✅ LEFUTOTT
       Tagnyilvántartás Fázis 1 biztonsági hotfix (átvilágítás P0-1…P0-4, P1-3, P1-4 —
       lásd `docs/project-tracking/KARTOTEKA-tagnyilvantartas-atvilagitas-2026-06-10.md`).
       Hatás: (1) `felmentes`/`presbiter`/`csoport` táblákra `congregation_id` oszlop + backfill
       + BEFORE INSERT trigger (felmentes, presbiter); (2) a `USING (true)` policyk
       (felmentes_all/felmentes_access, presbiter_all/presbiter_read, csoport_read) cseréje
       gyülekezet-szűrt policykra; (3) új `tagnyilvantartas_tag_torles(integer)` RPC — atomikus,
       jogosultság-ellenőrzött végleges törlés pénzügyi + anyakönyvi védelemmel; (4) új
       `app_get_or_create_locality(text)` / `app_get_or_create_street(text, integer)` RPC-k
       (guardolt címtörzs-bővítés a korábbi csendes 1-es fallback helyett).
       **Verifikáció (Endre, 2026-06-10):** felmentes NULL=0 ✅ · presbiter NULL=0 ✅ ·
       csoport NULL=1 → az árva „1. körzet" sor (id=1; 0 presbiter/csalad/haztartas
       hivatkozás, a kód sem használja defaultként) még aznap TÖRÖLVE —
       utóellenőrzés: 0 árva sor ✅. A backfill így 100%-os mindhárom táblán.
       A 2026-06-10-es webapp-kód (tag-törlés RPC, címtörzs-RPC-k) mostantól deployolható.

- [x] 2026-06-10 — **`2026-06-10-tagnyilvantartas-fazis2-3-megbizhatosag.sql`** ✅ LEFUTOTT
       Tagnyilvántartás Fázis 2-3 (átvilágítás P1-5, P1-6, P1-7c).
       **Verifikáció (Endre, 2026-06-10):** `uidx_szemely_cnp_per_congregation` index
       létrejött ✅ — ez egyben igazolja, hogy CNP-duplikátum nem volt; az árva
       befizetes.id_csalad hivatkozásokat a migráció nullázta, a FK él.
       Hatás: (1) `befizetes.id_csalad` FK a csalad-ra (árva hivatkozások NULL-ozása után);
       (2) `uidx_szemely_cnp_per_congregation` partial unique — CNP-egyediség gyülekezeten
       belül (duplikátumnál NEM bukik el: NOTICE + a fájl végi diagnosztika listázza);
       (3) `sirhelyelhunyt.id_szemely` oszlop + backfill a temetes-hivatkozáson át + trigger;
       (4) `tagnyilvantartas_csalad_mentes(...)` RPC — atomikus család+gyerek mentés,
       tag-szintű gyülekezet-ellenőrzéssel.
       ⚠️ SORREND: a Fázis 2-3 webapp-kód deployja ELŐTT futtatandó (a saveFamily már az
       RPC-t hívja; nélküle a család-mentés érthető hibaüzenettel leáll, adatvesztés nélkül).
       Verifikáció: fájl végi diagnosztika — árva befizetes=0, CNP-duplikátum lista üres
       (vagy rendezendő), sirhelyelhunyt-linkek feltöltve, index létrejött.
       BEGIN/COMMIT csomagolva (P2-12 betartva).

- [x] 2026-05-17 — **`2026-05-17-iktato-sequence-pointer-rpc.sql`** ✅ LEFUTOTT
       Új `iktato_sequence_pointers` tábla + `next_iktato_sequence(uuid, integer)` SECURITY DEFINER RPC + backfill + partial UNIQUE INDEX (P3-5 race-fix).
       Verifikáció: `next_iktato_sequence` ✅ OK, `search_path=public, pg_temp`, partial UNIQUE INDEX létrejött, pointer-tábla 0 sor (productionben még nincs iktato-bejegyzés). A frontend `saveFilingEntry` mostantól az RPC-t hívja az atomic sorszámért.

---

## 🟢 LEFUTOTT (a kódbázis ezekre épít) — 2026-04-08 — 2026-05-06

A 2026-04-08 és 2026-05-06 közötti migrációk feltehetően mind lefutottak — a Kartotéka kódbázisa épít rájuk (lásd `apps/web/app/(dashboard)/**/actions.ts` import-ok, RPC-hivatkozások, table-referenciák, RLS-policy-k). A pontos időbélyeg-listához a Supabase Studio `supabase_migrations.schema_migrations` táblát kell lekérdezni, vagy Endre memóriáját.

Tipikus chronologia (csoportosítva fő-csomagok szerint):

### 2026-04-09 — Alapok (3 fájl)
- [?] `2026-04-09-extension-table-policies.sql`
- [?] `2026-04-09-god-mode-and-congregation-finance.sql`
- [?] `2026-04-09-profile-and-congregation-extensions.sql`

### 2026-04-12 — Phase 0 RLS hardening + új modulok (10 fájl)
- [?] `2026-04-12-budget-modifications.sql`
- [?] `2026-04-12-document-submissions.sql`
- [?] `2026-04-12-jegyzokonyv-restructure.sql`
- [?] `2026-04-12-missziós-muhely-rls.sql`
- [?] `2026-04-12-phase-0-rls-hardening.sql`
- [?] `2026-04-12-presbiteri-jegyzokonyvek.sql`
- [?] `2026-04-12-public-magazines.sql`
- [?] `2026-04-12-public-site-stats.sql`
- [?] `2026-04-12-public-site-tables.sql`
- [?] `2026-04-12-storage-buckets.sql`
- [?] `2026-04-12-support-tickets.sql`

### 2026-04-13 — RLS finomítás (5 fájl)
- [?] `2026-04-13-rls-ALL-FIXED.sql`
- [?] `2026-04-13-rls-congregation-tables.sql`
- [?] `2026-04-13-rls-hybrid-admin-tables.sql`
- [?] `2026-04-13-rls-mm-misc-tables.sql`
- [?] `2026-04-13-rls-reference-tables.sql`

### 2026-04-15 — Annual reports, MM RLS fix, standalone licenses
- [?] `2026-04-15-annual-reports-extension.sql`
- [?] `2026-04-15-mm-rls-fix.sql`
- [?] `2026-04-15-mm-rls-fix-part2.sql`
- [?] `2026-04-15-remove-default-god-mode-pin.sql`
- [?] `2026-04-15-standalone-licenses.sql`

### 2026-04-21 — M6 RLS audit + DIAG-only (1 fájl)
- [?] `2026-04-21-m6-2-rls-audit-full.sql` (AUDIT-only — SELECT-ek, semmilyen DDL)

### 2026-04-23 — M0 hotfixes (3 fájl)
- [?] `2026-04-23-m0-DIAGNOSTIC.sql`
- [?] `2026-04-23-m0-HOTFIX-grants.sql`
- [?] `2026-04-23-m0-REPAIR-idempotent.sql`
- [?] `2026-04-23-m0-5-devices-licenses-audit.sql`

### 2026-04-24 — M7 sorszámok + admin wipe (2 fájl)
- [?] `2026-04-24-a-m7-2d1-reserve-chitanta-numbers.sql`
- [?] `2026-04-24-admin-wipe-congregation-data.sql`

### 2026-04-25 — M0.5 + M7 iratszám pointers (2 fájl)
- [?] `2026-04-25-m0-5-audit-log-view.sql`
- [?] `2026-04-25-a-m7-9a-iratszam-pointers.sql`

### 2026-04-26 — Family-link inference RPC (1 fájl)
- [?] `2026-04-26-family-link-inference-rpc.sql`

### 2026-04-30 — Tag-validáció diagnoszt + backfill (2 fájl)
- [?] `2026-04-30k-diagnoszt-baptism-szulok.sql` (lásd PENDING fent)
- [?] `2026-04-30l-backfill-csalad-text-szulokbol.sql` (lásd PENDING fent)

### 2026-05-02 — Finance import RPC + access-requests + user-trigger (10+ fájl)
- [?] `2026-05-02-diagnose-users-visibility.sql`
- [?] `2026-05-02-finance-dup-lookup-indexes.sql`
- [?] `2026-05-02-finance-import-rpc.sql`
- [?] `2026-05-02-fix-access-requests-COMPLETE.sql`
- [?] `2026-05-02-fix-access-requests-anon-insert.sql`
- [?] `2026-05-02-handle-new-user-trigger.sql`
- [?] `2026-05-02-member-validation-errors.sql`
- [?] `2026-05-02-profiles-approved-to-active.sql`
- [?] `2026-05-02-rls-fix-merge-v7-result.sql`

### 2026-05-03 — Finance kódok (4 fájl)
- [?] `2026-05-03-finance-300-01-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-INSTALL.sql`
- [?] `2026-05-03-finance-belso-mozgas-celok.sql`
- [?] `2026-05-03-finance-import-rpc-v2.sql`

### 2026-05-04 — Admin RPC-k + onboarding (13 fájl)
- [?] `2026-05-04-admin-user-status-rpc.sql`
- [?] `2026-05-04b-grant-service-role-profiles.sql`
- [?] `2026-05-04c-profile-congregations-rpc.sql`
- [?] `2026-05-04d-ertesitesek-read-at-archived.sql`
- [?] `2026-05-04e-system-broadcasts-allow-resend.sql`
- [?] `2026-05-04f-complete-user-onboarding-rpc.sql`
- [?] `2026-05-04g-pending-wizard-diagnosis.sql`
- [?] `2026-05-04h-beke-tivadar-diagnosis.sql`
- [?] `2026-05-04i-restart-user-onboarding-rpc.sql`
- [?] `2026-05-04j-complete-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04k-restart-onboarding-fix-ambiguous.sql`
- [?] `2026-05-04l-chitanta-tombok-rls-fix.sql`
- [?] `2026-05-04m-create-teszt-congregation.sql`

### 2026-05-05 — Pastor service history (1 fájl)
- [?] `2026-05-05-pastor-service-history-tartozas-mod.sql`

---

## Nem érintett SQL fájlok (197+ a többi)

A fenti chronologia nem teljes — a `migration-docs/sql/` mappa 197 fájlt tartalmaz, és a 2026-04-08 előtti (M0, M1, M2, M3, M4, M5 sprintek) migrációk százainak száma. Ezek mind lefutottak (mert a fő séma — `congregations`, `profiles`, `szemely`, `csalad`, `befizetes`, `kiadas`, `chitanta_*`, `befizetescel`, `kiadascel`, `szamadasicel`, `iratszam_*`, `audit_log` stb. — már létezik a productionben).

A teljes lista lekérése Supabase Studio-ban:
```sql
SELECT version, name, executed_at FROM supabase_migrations.schema_migrations ORDER BY version;
```

---

## Hibajavítások (drop, restore)

Eddig nem volt katasztrofális PITR-rollback. Ha jövőben szükség lesz, ide jegyezzük:

| Időpont | Művelet | Indok | Eredmény |
|---|---|---|---|
| (üres) | | | |

---

## Hivatkozások

- **DIAGNOSTICS P2-9 + P2-10**: a _RUN_LOG.md hiánya és pending SQL-ek
- **DIAGNOSTICS P2-11**: SECURITY DEFINER search_path → `2026-05-17-security-definer-search-path-pin.sql`
- **DIAGNOSTICS P2-12**: a RPC-installer migrációk BEGIN/COMMIT csomagolása — új migrációknál betartani
- [ ] 2026-09-05-szemelyi-szam-kulon-tabla.sql — PENDING (a hivatalos személyi szám külön, szűkebb hozzáférésű táblába kerül; a szemely.cnp ÉRINTETLEN marad)

---

## ❓ ELLENŐRIZENDŐ / 🔴 PENDING — függvény-jogtisztítás lánc (2026-09-05b)

- [?] **`2026-09-05-token-hook-p0-zaras.sql`** — ÁLLAPOT ISMERETLEN (eddig NEM volt
      bejegyzése ebben a naplóban, pedig a jogtisztítás-lánc hivatkozik rá).
      Szándéka: a `public.custom_access_token_hook` lezárása anon / authenticated /
      PUBLIC felé, `supabase_auth_admin` megtartásával.
      ⚠️ Hogy élesben LEFUTOTT-e, azt a `docs/2026-09-05b-jogtisztitas-1-elomeres.sql`
      **22. sora MÉRI** — a migrációs fájl önmagában NEM bizonyíték.
      A `2026-09-05b-jogtisztitas-2-migracio.sql` mindkét esetben lezárja (ha már
      zárva volt, no-op), tehát nem blokkolja a láncot.

- [ ] **`docs/2026-09-05b-jogtisztitas-1-elomeres.sql`** — PENDING (csak olvasó előmérés,
      NULLA adatkockázat). Ez adja meg a migráció összes bemenetét: a 15. sor a
      megállító kaput jelzi előre, a 26. sor a `v_atmentendo_szerepek` döntést, a
      27–28. sor pedig azt, mely rutinok kapnának visszafordíthatatlan explicit grantot.

- [ ] **`docs/2026-09-05b-jogtisztitas-1b-acl-mentes.sql`** — PENDING (csak olvasó
      ACL-pillanatkép = A MENTÉS). CSV-be kell menteni a migráció ELŐTT.
      ⚠️ A sorait EGÉSZBEN (REVOKE + GRANT-ok) kell visszajátszani.

- [ ] **`2026-09-05b-jogtisztitas-2-migracio.sql`** — PENDING (a migráció).
      Csak jogokat ír. Előfeltétel: a fenti két olvasó fájl lefutott, a mentés
      megvan, a 15. sor üres, és a `v_atmentendo_szerepek` / `v_tudomasul_vett_szerepek`
      tömbök az előmérés 26. sora alapján ki vannak töltve.
      Futás után ide kell bevezetni a záró rács **0., 1., 5. és 8. sorát**.
