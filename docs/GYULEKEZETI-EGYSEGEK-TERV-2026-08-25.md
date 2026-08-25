# Gyülekezeti egységek (anya–leány–missziói–szórvány) + gyülekezetenkénti kimutatás a lelkészi jelentésben — TERV

**Dátum:** 2026-08-25 · **Állapot: JÓVÁHAGYVA ÉS MEGVALÓSÍTVA** (Endre 2026-08-25-i jóváhagyása alapján; a megvalósítás kibővült: admin kötés-kezelő + vizuális szervezeti térkép admin/megyei/kerületi szinten + súgók + lelkész-barát útmutató. SQL: `2026-08-25-gyulekezeti-egysegek.sql` — futtatásra vár.)
**Előzmény-felmérés:** 4 párhuzamos kód-felderítés + teljességi kritika (adatmodell, lelkészi jelentés, hatókör/RLS, statisztika-források).

---

## 1. Mit kérünk

Az EREK egyházközségei eltérő szervezeti formában működnek (anyaegyházközség, leányegyházközség,
missziói egyházközség, szórvány; kapcsolat: szórvány → anya, leány → anya). A Kartotéka ezt ma
egyáltalán nem ismeri. A cél kettős:

1. **A szervezeti modell beépítése** — látsszon, melyik gyülekezet milyen típusú, és ki kihez tartozik.
2. **A lelkészi jelentés összeállításánál táblázatos kimutatás**: oszloponként az anyaegyházközség és a
   hozzá kapcsolt gyülekezetek helyzete + összesítő oszlop.

## 2. Mai állapot (a felmérés kulcs-tényei)

- A `congregations` táblán (~44+ oszlop) **nincs** szervezeti típus és **nincs** anya→leány kapcsolat
  (a hiányt a KONYVELES-2026 összehasonlító terv 213–219. sora már dokumentálta). A „Missziói" jelleg
  kizárólag a névszövegben van. A hierarchia csak felfelé létezik: `congregations.diocese_id → dioceses.district_id`.
- A **lelkészi jelentés** (`lelkeszi_jelentes` tábla, `lib/lelkeszi-jelentes/`, aggregátor a
  `munkanaplo/lelkeszi-jelentes-actions.ts`-ben) minden rétege **szigorúan egy-gyülekezetes**:
  UNIQUE(congregation_id, ev), computeAuto egy `congregation_id`-ra fut, a nyomtatvány egy egyházközségről szól.
  Az EREK hivatalos űrlapban **nincs** gyülekezetenkénti bontás — a kimutatás Kartotéka-többlet
  (a spec kimondja: többet szabad, kevesebbet nem).
- A **hatókör** mindenhol egyetlen skalár (`effectiveCongregationId`); az RLS
  `current_user_can_access_congregation` függvényének **nincs** anya→leány lába. Egy lelkész ma két
  gyülekezet között csak profilt **váltani** tud (`/valassz-profilt`), együtt látni nem.
- A **munkanaplón nincs helyszín/gyülekezetrész mező** — ha az anya lelkésze egy naplóba rögzít mindent,
  az alkalmak ma nem bonthatók gyülekezetenként. A tagok település szerinti bontása viszont már ma
  levezethető (`szemely.c_utcaid → adrstreet → adrlocality`).
- Gyülekezeti törzsadatot **három** felület szerkeszt: `/welcome` onboarding-wizard,
  a (2026-06-05 óta egylapos) Gyülekezet-beállító varázsló, és a Beállítások-dialógus (dialog-v2);
  a „Gyülekezetünk adatai" ablak read-only. Új mező mindhármat + a strip-listát érinti.
- Kísérő lelet: a `saveCongregationSetup` / `saveCongregationSetupStep` / `uploadCongregationCimer`
  jogosultság-ellenőrzése **skalár** `profiles.congregation_id`-t hasonlít (nem roles-first) — a rögzített
  hibaosztály-minta sérül; a `saveCongregationSetupStep`-nek ráadásul nincs hívója (halott kód).

## 3. A javasolt modell: „egy kartoték, címkézett egységek" — két réteg

### 3.1 Hivatalos szervezeti réteg — a `congregations` táblán (admin kezeli)

Két új oszlop:

| Oszlop | Típus | Jelentés |
|---|---|---|
| `szervezeti_tipus` | text CHECK (`'anya'`, `'leany'`, `'misszioi'`), default `'anya'` | Az egyházközség hivatalos formája. Szórvány nem önálló egyházközség, ezért itt nem érték. |
| `anya_congregation_id` | uuid FK → congregations(id), nullable | Csak `leany` típusnál kötelező; `anya`/`misszioi` sornál NULL (CHECK). |

Ez a hivatalos (egyházmegyei javaslat + kerületi jóváhagyás szerinti) tény, ezért **nem a lelkész
állítgatja**: az admin Gyülekezetek fül (`components/admin/congregations-tab.tsx`) kap típus- és
anya-kötés-kezelőt (minta: `admin/congregation-diocese-actions.ts` hatókör-assertjei). Változás
audit_log-ba. Backfill: a „Missziói" név-mintájú sorok javaslatként `misszioi`-ra, admin megerősítéssel.

Védelem: `CHECK (anya_congregation_id <> id)` + egyszintűség (leánynak nem lehet leánya) — a kötést
kizárólag admin-action írja, amely ellenőrzi, hogy a kiszemelt anya `szervezeti_tipus='anya'` vagy
`'misszioi'`, és hogy a gyereknek nincs saját gyereke. (A fejlődési út — szórvány→leány→anya — így
adminisztratív átsorolás, dátuma az audit_logból visszakereshető.)

### 3.2 Napi működési réteg — `gyulekezeti_egysegek` az anya kartotékán BELÜL (lelkész kezeli)

Ez a terv magja. A tipikus élethelyzet: az anyaegyházközség lelkészi hivatala vezet **egy** munkanaplót,
**egy** tagnyilvántartást, **egy** számadást — és ugyanez a hivatal gondozza a leányegyházközséget és a
szórványokat. Ezért a kapcsolt közösségek **nem külön Kartoték-fiókok**, hanem az anya kartotékán belüli
címkézhető egységek:

```sql
CREATE TABLE gyulekezeti_egysegek (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,
  nev text NOT NULL,                          -- pl. „Páva (leányegyházközség)", „Kovászna-szórvány"
  tipus text NOT NULL CHECK (tipus IN ('leany','szorvany')),
  adrlocality_id integer NULL,                -- település-kapcsolat a besorolási javaslathoz
  linked_congregation_id uuid NULL REFERENCES congregations(id),  -- ha az egységnek van hivatalos sora is
  sorrend integer NOT NULL DEFAULT 0,
  aktiv boolean NOT NULL DEFAULT true,
  megjegyzes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Az anya „önmaga" nem kap sort — az egység nélküli adat (NULL címke) mindig az anyaközpontot jelenti,
így a meglévő adatok visszamenőleg is helyesek. Missziói egyházközségnél az egyes gondozott
települések `szorvany` típusú egységként vehetők fel.

**Miért ez a modell (és nem külön gyülekezet-sorok minden leánynak/szórványnak):**

- **Nulla RLS-módosítás az élő táblákon** — minden adat az anya `congregation_id`-ja alatt marad.
  A felmérés szerint a külön-soros út új RLS-lábat igényelne minden élő táblán (szemely, munkanaplo,
  befizetes, …) — ez pontosan a „skalár hatókör = néma teljes szivárgás" hibaosztály terepe.
- **Nincs mellékhatás máshol**: a megyei összesítő nem látna tucatnyi „hiányzó" leány-sort, a
  regisztrációs gyülekezet-választó nem szennyeződik, a `bealitas` zárak, a mentés-hatókör és a
  desktop-sync érintetlen.
- **Az Σ oszlop konstrukcióból helyes**: a fő jelentés auto-értékei változatlanul az ÖSSZES sorból
  számolódnak; mivel minden sor pontosan egy egységhez tartozik (NULL = anya), a részoszlopok összege
  automatikusan a fő jelentés száma.
- A lelkész **egy helyen dolgozik**, nem kell profilt váltania.

**Kivétel** (2. ütem, opcionális): ha egy leányegyházközség már ma **önállóan** kartotékázik (saját
userek, saját munkanapló), azt nem olvasztjuk be — ott a `linked_congregation_id` köti össze, és az ő
oszlopa a saját **véglegesített/beküldött** lelkészi jelentése snapshotjából töltődik (a megyei
összesítő bevált snapshot-mintája). Ehhez egyetlen szűk RLS-láb kell: az anya lelkésze SELECT-elheti a
gyerek `lelkeszi_jelentes` sorát (roles-first, fail-closed). Kettős számolás elleni szabály: **kapcsolt
egység soha nem küld be önálló jelentést ÉS nem szerepel az anya Σ-jában egyszerre** — a bontás-tábla
jelzi, melyik oszlop jön külső jelentésből, és az Σ ilyenkor a fő (csak-anya) jelentéstől külön sorban
mutatja a „mindösszesen"-t.

### 3.3 Címkézés — honnan tudja a rendszer, mi hol történt

| Adat | Megoldás |
|---|---|
| **Munkanapló** (`munkanaplo`) | Új `egyseg_id` oszlop (nullable FK, NULL = anyaközpont). A rögzítőben helyszín-választó, **csak akkor jelenik meg, ha a gyülekezetnek van egysége** (alapérték: anyaközpont). Mobilon is egy kis legördülő. |
| **Tagnyilvántartás** (`szemely`) | Új `egyseg_id` oszlop (nullable FK). Tömeges besorolás-segéd: „minden X településen lakó tag → Y egység" (a meglévő `c_utcaid → adrstreet → adrlocality` láncból javasolva), plusz egyéni átsorolás a személyi kartonon. |
| **Anyakönyv** (keresztseg, temetes, hazassag, konfirmalas) | **Nincs sémamódosítás** — az esemény a személy egység-besorolását örökli. (Ritka határeset — pl. a szertartás máshol volt — a jelentés-cellában felülírható.) |
| **Pénzügy** | Első körben **nem nyúlunk a befizetes/kiadas táblákhoz**. A perselypénz egységenként a munkanapló alkalom-soraiból adódik; a járulék egység-bontása a befizető személy egysége szerinti **javaslat**; minden más pénzügyi bontás kézi cella. |

Fail-closed elv (rögzített munkaszabály): ahol nincs címkézett adat (pl. a naplózás év közben indult,
vagy a desktopon rögzített sorokon még nincs egység), a cella **üres + magyar jelzés**, soha nem néma 0.

## 4. A gyülekezetenkénti kimutatás (bontás-tábla)

Új fül a lelkészi jelentés dialógusában (worklog-tabs → lelkeszi-jelentes-dialog):
**„Gyülekezetenkénti bontás"**.

- **Oszlopok:** Anyaegyházközség · egység₁ … egységₙ · **Σ Összesen**.
- **Sorok (javasolt induló mutató-készlet — bővíthető, append-only):**
  - Lélekszám dec. 31. (I.10) · Választók (I.11) · Keresztelt (I.2c) · Temetett (I.3c) ·
    Esketett (I.16) · Konfirmált (V.7c)
  - Vasárnapi istentisztelet — alkalmak és átlagjelenlét (II.1a/II.1b) · Hétköznapi alkalmak (II.6a) ·
    Úrvacsoraosztások (II.12)
  - Vallásóra/katekézis alkalmak (V.3) · Családlátogatás (III.7)
  - Egyházfenntartói járulék (VII.1, javaslat-jellegű) · Perselypénz (VII.3, munkanaplóból)
- **Cellalogika:** ugyanaz, mint a fő jelentésben — `felulirasok > auto > kezi`. Az auto érték az adott
  egységre szűrt ugyanazon aggregátor-számítás; minden cella felülírható. Tárolás a meglévő
  `lelkeszi_jelentes.kezi_adatok` / `felulirasok` jsonb-kben **namespaced kulcsokkal**:
  `egyseg:<egyseg_id>:<mezoId>` (append-only — a meglévő mezoId-k és a snapshot-formátum nem sérül;
  véglegesítéskor a bontás a snapshot új `bontas` kulcsa alá fagy).
- **Σ-egyeztetés:** az auto-mutatóknál az Σ = a fő jelentés értéke (konstrukcióból). Kézi celláknál a
  tábla összegzi az oszlopokat, és **hangosan jelzi**, ha az összeg eltér a fő jelentés rovatától.
- **Nyomtatás:** a hivatalos A4 űrlap **érintetlen marad** (az EREK-formátumban nincs bontás).
  A kimutatás külön gombbal nyomtatható **fekvő A4 melléklet** („Gyülekezetenkénti kimutatás — belső
  használatra / vizitációra"), 3-nál több egységnél is olvashatóan. Képernyőn mobile-first:
  vízszintesen görgethető tábla, ragadós első (mutató-) oszloppal.
- Az Adatlap-fül (10 éves összevetés) változatlan; a bontás évenként a snapshotból visszanézhető.

## 5. Hibaosztály-védelmek (kötelező elemek a megvalósításban)

1. `gyulekezeti_egysegek` RLS: congregation-láb **roles-first** (profile_roles-láb + skalár fallback),
   írás a saját gyülekezet lelkésze/gondnoka; GRANT-ok az auth-séma GRANT-csapda memória szerint.
2. **`backup_table_policy` INSERT ugyanabban a migrációban** — különben a napi mentés hangosan elhasal
   („BESOROLATLAN TÁBLA").
3. Minden új selftest a régi hibás viselkedés újrajátszásával bizonyít (őrszem negatív asszert nélkül vak);
   a „régi világ" a mai forrásból áll elő (nem `git show HEAD:`).
4. `.in()` szűrők 80-as darabolással, lapozás `fetchAllPagedRows`-zal; lekérdezés-hiba mindig továbbadva.
5. Kísérő javítás: a `saveCongregationSetup` / `uploadCongregationCimer` canManage-e roles-first-re
   (a skalár-hasonlítás már ma eltér a rögzített mintától); a hívó nélküli `saveCongregationSetupStep` törlése.
6. Desktop: az új oszlopok az explicit sync-oszloplistából kimaradva **nem törnek semmit** (a lelkészi
   jelentés a desktopon dokumentáltan web-only); a desktopon rögzített munkanapló-sor egysége NULL
   (= anyaközpont) — ismert, dokumentált korlát, később pótolható.

## 6. Ütemezés (fázisonként changelog + PR + deploy, a szokott rend szerint)

| Ütem | Tartalom | SQL |
|---|---|---|
| **0.** | Ellenőrző SQL-ek élesben (Endre futtatja): `migration-docs/sql/2026-08-25-gyulekezeti-egysegek-ellenorzo.sql` — congregations élő oszloplista, több-gyülekezetes lelkészek, Missziói név-minták, oszlopnév-ütközés | csak SELECT |
| **1.** | Adatmodell: congregations 2 új oszlopa + `gyulekezeti_egysegek` tábla (RLS + GRANT + backup-policy) + `munkanaplo.egyseg_id` + `szemely.egyseg_id`; admin típus/kötés-kezelő; a 3 szerkesztő-felület + „Gyülekezetünk adatai" megjelenítés; Missziói backfill-javaslat; canManage-javítás | 1–2 fájl |
| **2.** | Rögzítők: munkanapló helyszín-választó; tag-besorolás (tömeges település-javaslattal + egyéni) | – |
| **3.** | A lelkészi jelentés „Gyülekezetenkénti bontás" füle: egységenkénti aggregálás, kézi/felülíró cellák, Σ-egyeztetés, fekvő nyomtatott melléklet, snapshot-bővítés | – |
| **4.** *(opcionális, külön döntés)* | Önállóan kartotékázó leány oszlopa beküldött snapshotból + 1 szűk RLS-láb a `lelkeszi_jelentes` SELECT-hez; desktop munkanapló egység-mező szinkron | 1 fájl |

## 7. Döntési pontok (Endre jóváhagyására)

- **D1 — Architektúra (a terv sarokköve):** a kapcsolt közösségek az anya kartotékán belüli **egységek**
  (3.2 szerint), NEM külön teljes értékű gyülekezet-fiókok. *Javaslat: igen.* (Külön fiók csak ott marad,
  ahol ma is önállóan kartotékáznak — az a 4. ütem.)
- **D2 — Mutató-készlet:** a 4. pontban felsorolt sorok jók-e induló készletnek? (Bővíteni utólag is lehet.)
- **D3 — Pénzügy:** első körben perselypénz automatikusan (munkanaplóból), járulék javaslatként, minden
  más pénzügyi bontás kézi — elegendő-e így? *Javaslat: igen, a befizetes-tábla címkézése külön kör legyen.*
- **D4 — Érintett élesben:** hozzávetőleg hány anya–leány/szórvány párost kell felvinni indulásként?
  (Csak a méretezéshez; a felvitel az admin felületen + a gyülekezeti egység-kezelőben történik.)

## 8. Ami tudatosan NEM része ennek a körnek

- A hivatalos EREK űrlap szerkezetének bármilyen módosítása (a bontás külön melléklet).
- A `befizetes`/`kiadas` táblák egység-címkézése (D3).
- A régi `/eves-jelentes` (annual_reports) modul bővítése — a célpont kizárólag a hivatalos
  `lelkeszi_jelentes` modul.
- Megyei/kerületi szintű bontás-aggregálás (a beküldött snapshot változatlan szerkezetű marad).
