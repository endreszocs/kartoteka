# KARTOTÉKA — Tagnyilvántartás teljes átvilágítás (2026-06-10)

**Módszertan:** 5 párhuzamos audit-ágens (architektúra, adatmodell, biztonság/GDPR, UI/UX/teljesítmény, keresztmodul-integráció) + a P0-gyanús leletek kézi kód-verifikációja.
**Jelölés:** ✔ = kézzel ellenőrzött (kód beolvasva) · Ⓐ = ágens-lelet, szúrópróba nélkül elfogadva.

> **Állapot (2026-06-10): Fázis 1 KÉSZ — kód implementálva, SQL lefutott élesben.**
> Kód: `tagnyilvantartas/actions.ts` (ownership-check, törlés-RPC-hívás, felmentes-szűrés,
> getOrCreate* RPC-re állítva), `tagnyilvantartas/presbyter-actions.ts` (congregation_id az
> insertekben), `penzugy/actions.ts` (felmentes-szűrés). SQL:
> `2026-06-10-tagnyilvantartas-fazis1-biztonsag.sql` ✅ **LEFUTOTT 2026-06-10** —
> verifikáció: felmentes NULL=0, presbiter NULL=0, csoport NULL=0 (az egyetlen árva
> körzet-sort töröltük — backfill 100%). A deploy szabad. A P0-2 'meghalt'-ág
> haztartas-lezárási egységesítése (P1-7b) szándékosan a 3. fázisban marad.

---

## 1. Modultérkép

### Belépési pont és adatfolyam

```
page.tsx (SSR)
 ├─ getEffectiveAccessContext() → jogosultság, master flag
 ├─ getMembers() [actions.ts:62] — 10 párhuzamos query:
 │   szemely (TELJES lista, select *, nincs limit) + befizetes (idei + "valaha fizetett")
 │   + felmentes + haztartas_tag (hibrid családmapping) + bealitas + jarulek_kedvezmeny
 │   + congregations + member_transfer_notifications (pending átjelentkezések)
 └─ MemberTabsV4 [CLIENT] — hash-routing (#overview, #persons, #families, …)
     ├─ Áttekintés (OverviewTab) — statisztikák az initialMembers-ből
     ├─ Személyek (PersonsTab) — keresés/szűrés/rendezés kliensoldalon, modálok
     ├─ Családok (FamiliesTab-v2) — getFamilies(), hibrid csalad↔haztartas modell
     ├─ Presbiterek (PresbytersTab) — csoport + szemely
     ├─ Körzetek (DistrictsTab) — csoport (iskorzet)
     ├─ Választók (VotersTab) — voter_eligible + nyomtatás (voter-print-dialog)
     ├─ Hibák (ValidationErrorsTab) — member_validation_errors, runValidation()
     ├─ Súgó (54 KB statikus tartalom)
     └─ Rendszergazdai importáló (7 lépéses wizard; csak god mode / delegated import)
```

### Szerver-akciók (5 fájl, ~104 KB)

| Fájl | Fő akciók | Táblák |
|---|---|---|
| actions.ts | getMembers, getMemberDetails, saveMember, removeMember, getOrCreateLocality/Street, searchParent | szemely, befizetes, felmentes, haztartas_tag, bealitas, jarulek_kedvezmeny, member_transfer_notifications |
| family-actions.ts | getFamilies, getFamilyDetails, saveFamily, deleteFamily, syncHouseholdFromCsalad, wipeFamilyStructure, getFamilyVisits, saveFamilyVisit | csalad, haztartas, haztartas_tag, cim, gyerek, csaladlatogatas |
| presbyter-actions.ts | getDistricts(+Counts), saveDistrict, deleteDistrict, assign/removeFamilyToDistrict, get/save/deletePresbyter | csoport, presbiter, szemely |
| validation-actions.ts | runValidation, getValidationErrors/Stats, resolve/ignore/reopenError | member_validation_errors, szemely |
| voter-actions.ts | getVoters, getVoterPrintContext | szemely, konfirmalas, haztartas, befizetes, bealitas |

**Pozitívum (✔):** az akciók belépési pontjain következetes a guard-minta (`getProfileCongregation` / `getFamilyAccessContext` / `getScopedContext`), a fő mutációk zod-sémával validálnak, és a szemely-lekérdezések congregation-szűrtek. A hibrid család-modell (csalad → haztartas/haztartas_tag, 2026-06-01) átgondolt, visszafelé kompatibilis (`legacy_csalad_id`).

### Adatmodell-sarokpontok

- `szemely`: congregation_id ✔, soft-delete = `isvisible`/`meghalt`/`member_status` kombináció; szülő-link **CNP-szövegen** keresztül (`id_apja`/`id_anyja` varchar → szemely.cnp) + `apjaneve`/`anyjaneve` szabadszöveg.
- `csalad`, `presbiter`, `csoport`, `gyerek`: **NINCS congregation_id oszlop** (✔) — tenant-szűrés csak közvetve (szemely-en át) lehetséges.
- RLS: szemely/befizetes/anyakönyvi táblák congregation-szűrtek Ⓐ; **`presbiter_all` és `felmentes_all` = `FOR ALL … USING (true)`** (✔ 2026-04-13-rls-ALL-FIXED.sql:146,235), `csoport_read` = read-all (✔ :127).
- `befizetes.id_csalad`: **nincs FK** a csalad-ra (✔ — a felmentes/gyerek/csaladlatogatas FK-i léteznek, a befizetesé nem).
- `szemely.cnp`: **nincs UNIQUE** (gyülekezeten belül sem) (✔).

---

## 2. Leletek

### 🔴 P0 — kritikus

**P0-1 ✔ removeMember('torles'): kereszt-gyülekezeti destruktív IDOR + nem tranzakcionális törlés**
`actions.ts:644–710`. A kapcsolt rekordok törlése (`keresztseg`, `konfirmalas`, `bekoltozott`, `attert`, `felmentes`, `gyerek`, `presbiter` — 669–677) **congregation-szűrés nélkül** fut, és a személy tulajdonjogát SEMMI nem ellenőrzi a végső szemely-delete előtt (701). Mivel a `felmentes`/`presbiter` RLS `USING (true)`, egy tetszőleges (másik gyülekezetbeli) szemely-id-vel hívva **más gyülekezet felmentés-/presbiter-/gyerek-rekordjai véglegesen törölhetők**, miközben maga a személy megmarad. Ugyanez az ág tranzakció nélkül fut: részleges hiba esetén az anyakönyvi sorok már törlődtek, a személy még él → inkonzisztens állapot.
*Javítás:* a branch elején ownership-check (`szemely.id ∈ congregation`), minden child-delete congregation-szűréssel VAGY az egész művelet egyetlen SECURITY DEFINER RPC-ben, tranzakcióban.

**P0-2 ✔ A 'meghalt'/'elkoltozott'/'kitert' ágak tetszőleges személyre szúrnak be rekordot**
`actions.ts:604–642`. A `temetes`/`elkoltozott`/`kitert` insert `id_szemely: id`-vel történik tulajdonjog-ellenőrzés nélkül (a szemely-update már szűrt, de az insert előtte megtörténik) → más gyülekezet tagjára is létrehozható temetési/elköltözési bejegyzés a hívó gyülekezete alatt. Adatszennyezés + félrevezető anyakönyv.
*Javítás:* ownership-check az akció elején (ugyanaz, mint P0-1).

**P0-3 ✔ Hard delete anyakönyvi adatokra**
`actions.ts:670–671`. A 'torles' ág **véglegesen törli a keresztelési és konfirmációs anyakönyvi bejegyzéseket**. Ez (a) egyházi nyilvántartási elvekkel ütközik (az anyakönyv történeti dokumentum), (b) a GDPR-tervben rögzített „redact/soft-delete, ha anyakönyvi vagy pénzügyi hivatkozás van" elvvel is — a pénzügyi ágon van ilyen védelem (646–652), az anyakönyvin nincs.
*Javítás:* anyakönyvi rekord léte esetén csak elrejtés/redact (mint a befizetéses ágon), vagy archív tábla.

**P0-4 ✔ RLS-rések: `felmentes_all`, `presbiter_all` = USING(true); csalad/presbiter/csoport/gyerek congregation_id nélkül**
`2026-04-13-rls-ALL-FIXED.sql:146,235` + séma (✔). Bármely bejelentkezett felhasználó DB-szinten olvashatja/írhatja/törölheti bármely gyülekezet felmentéseit és presbitereit. Ez a P0-1 támadási felülete, és önmagában is tenant-izolációs hiba. A tartós megoldáshoz congregation_id oszlop kell ezekre a táblákra (backfill a szemely-kapcsolatokon át), majd szűrt policy.
*Megjegyzés:* kapcsolódik a [KARTOTEKA-admin-atvilagitas-terv-2026-06-07.md] Fázis 4 RLS-munkájához — érdemes egy menetben kezelni.

### 🟠 P1 — fontos

**P1-1 ✔ Nincs audit-naplózás a teljes modulban**
`logAuditEvent` 0 hívás a tagnyilvantartas route-ban, miközben a `lib/audit/log.ts` létezik és 10 másik fájl (admin, profile, god-mode, login…) használja. A vallási hovatartozás GDPR Art. 9 szerinti **különleges kategóriájú adat** — létrehozása/módosítása/törlése (saveMember, removeMember, saveFamily, wipeFamilyStructure) jelenleg nyomon követhetetlen. Kapcsolódik a 2026-06-05-ös törlés/átadás/audit tervhez (actor_id injektálás).

**P1-2 ✔ Skálázódási plafon: teljes taglista a kliensen**
`actions.ts:76` — `select('*', …)` limit nélkül, minden mezővel; a teljes lista props-ként megy a MemberTabsV4-be, szűrés/rendezés kliensoldalon, virtualizáció nélkül (PersonsTab/FamiliesTab `map()` render Ⓐ). 2000+ tagnál több MB payload + észrevehető lag várható. *Javítás iránya:* mezőlista szűkítése, szerveroldali lapozás/keresés VAGY lista-virtualizáció (react-window) első lépésként.

**P1-3 ✔ getOrCreateLocality/Street: guard nélküli exportált server action + hibaelnyelő fallback**
`actions.ts:42–58`. (a) Nincs auth/congregation-ellenőrzés → bármely bejelentkezett user szennyezheti a globális település-/utcatörzset; (b) sikertelen insert esetén **csendben 1-es id-t ad vissza** → a tag rossz (1-es) településre/utcára kötődik, észrevétlen adatromlás.
*Javítás:* guard + hiba esetén explicit error (ne fallback id).

**P1-4 ✔ felmentes-lekérdezés gyülekezet-szűrés nélkül**
`actions.ts:82` — `from('felmentes').select(…)` nincs `.eq('congregation_id', …)` (nem is lehet, mert nincs oszlop) → a USING(true) RLS miatt az ÖSSZES gyülekezet felmentés-sora letöltődik minden getMembers-híváskor. Adatszivárgás + felesleges payload; az id-ütközés elvi kockázata a fizetési státuszjelzésben.

**P1-5 ✔ saveFamily: nem tranzakcionális gyerek-csere + csendben elhasaló hibrid-sync**
`family-actions.ts:448→459` — gyerekrekordok delete+insert két lépésben: ha az insert elbukik, a család gyerekei eltűnnek. A `syncHouseholdFromCsalad` hibája csak `console.warn` (467–471) → a csalad és a haztartas modell észrevétlenül széttarthat. Ugyanez a minta a removeMember hibrid-lezárásánál (`actions.ts:683–698`).

**P1-6 ✔ Adatmodell-adósságok: hiányzó FK és UNIQUE**
(a) `befizetes.id_csalad` → csalad FK hiányzik → árva család-hivatkozású befizetések lehetségesek. (b) `szemely.cnp`-re nincs UNIQUE (congregation-szinten) → duplikált személy + a CNP-alapú szülő-feloldás (`id_apja`/`id_anyja` → cnp) kétértelművé válhat. (c) A szülő-link CNP-szövegen át megy integer FK helyett — a 2026-04-30k/l diagnosztika+backfill pont az ebből eredő adatminőségi lyukakat kezeli (a backfill éles blokkja még kommentben van Ⓐ).

**P1-7 ✔ Anyakönyv-integráció féloldalas**
(a) Keresztelésnél van `checkAndCreateFamily` (anyakonyv/actions.ts:638,702–810), **házasságkötésnél nincs** család-létrehozás/összevonás → az új házaspár nem jelenik meg családként a tagnyilvántartásban. (b) Két halál-adminisztrációs út viselkedik eltérően: az anyakönyvi saveBurial lezárja a haztartas_tag/szemely_kapcsolat sorokat Ⓐ, a tagnyilvántartási removeMember('meghalt') (actions.ts:604–617) **nem** ✔. (c) `sirhelyelhunyt`-nak nincs szemely-FK-ja Ⓐ → a sírnyilvántartás felől nem köthető vissza az elhunyt tag.

### 🟡 P2 — közepes

- **P2-1 Ⓐ Éves jelentés: nincs tagnyilvántartásból számolt lélekszám** — a generátor kazuáliákat, pénzügyet, presbiter-számot aggregál, de aktívtag-számot (I. rubrika) nem; kézzel kell tudni. Kis munkával származtatható a member_status-ból.
- **P2-2 ✔ revalidatePath('/tagnyilvantartas') minden mutáció után** (7+ hely actions.ts-ben, validation-actions-ben is) → minden szerkesztés teljes SSR-újratöltést triggerel; nagy listánál érezhető. Granulárisabb kliens-state frissítés javasolt.
- **P2-3 Ⓐ wipeFamilyStructure: egyetlen 'TÖRLÉS' string a megerősítés** — admin-only, de az egész gyülekezet családstruktúráját törli; audit-log (P1-1) és/vagy kétlépcsős megerősítés nélkül kockázatos.
- **P2-4 Ⓐ Hash-routing `history.pushState` monkeypatch** a member-tabs-v4-ben — globális hatású, más route-okkal interferálhat; URL-query-paramos tabkezelés tisztább lenne.
- **P2-5 Ⓐ Export hiánya**: Személyek/Családok tabon nincs Excel/PDF/nyomtatás (a Választóknál van print) — lelkészi munkában gyakori igény. Tömeges műveletek (multi-select) sehol.
- **P2-6 Ⓐ Import-wizard hiányosságok**: nincs vissza-gomb a lépésekből; duplikátum-detektálás (újra-import ugyanabból a fájlból) nem jelez; family-link lépés bekötése kérdéses (STEPS-ben szerepel, trigger nem egyértelmű).
- **P2-7 Ⓐ Validáció-tab: „Újra futtatás" gomb nincs letiltva futás közben** (dupla-indítás); pár eslint-disable/`as any` a wizardban.
- **P2-8 Ⓐ Mobil-UX**: sortörlés gomb csak hoverre látszik (mobilon elérhetetlen), széles táblák (min-w 1080px) scroll-jelzés nélkül.
- **P2-9 Ⓐ csoport vs. districts kettősség** — a régi `csoport` (presbiteri körzetek, család-hozzárendelés) és az új `districts` (profiles.district_id) párhuzamosan él, migrációs terv nélkül.
- **P2-10 ✔ console.warn-ba elnyelt hibák** (family-actions.ts:469, actions.ts:696 stb.) — a hibrid-modell széttartása így észrevétlen marad; legalább validation-errors-tabra vagy audit-logba kellene kerülnie.

### 🟢 P3 — fejlesztési / új funkció ötletek

- **P3-1 Születésnap- és névnaplista** — a `nevnap` tábla létezik, de a modul nem használja; Áttekintés-widget vagy külön lista (lelkészi köszöntésekhez) olcsón megvalósítható.
- **P3-2 Korfa / életkor-eloszlás** az Áttekintés tabon (sz_datum-ból).
- **P3-3 Tagsági igazolás nyomtatás** — az anyakönyvi emléklap-rendszer (components/registry/emleklap) mintájára.
- **P3-4 Családlátogatási áttekintés** — a getFamilyVisits/saveFamilyVisit akciók léteznek ✔, de tab-szintű rálátás („mely családnál mikor jártunk utoljára") nincs.
- **P3-5 GDPR-mezők**: fotó-/levelezési hozzájárulás, hozzájárulás dátuma a szemely-en; tagsági adatexport (Art. 15) és alanyi törlési kérelem workflow (Art. 17) — illeszkedik a 2026-06-05-ös törlés/átadás/audit tervhez.
- **P3-6 Lakcím-történet** — címváltozáskor a régi cím elvész; a haztartas/cim modell `ervenyes_tol/ig` mezői jó alapot adnak.
- **P3-7 voter_eligible automatizálás** — jelenleg kézi flag; szabály-alapú frissítés (18+, él, nem költözött el, konfirmált) + eltérés-riport.
- **P3-8 Offline/desktop**: a packages/offline-sync-ban a 'tagnyilvantartas' ModuleKey definiált, backend üres; a desktop appban a modul nem létezik — tudatos döntés kell: web-only marad-e.
- **P3-9 Családfa-modul frissítése** — a get-family-tree a régi gyerek/hazassag/csalad ágat járja, az új szemely_kapcsolat táblát nem ismeri Ⓐ.

---

## 3. Téves riasztások (ágens-leletek, amiket a kézi ellenőrzés cáfolt)

1. **„isBirthdayThisMonth bug"** — a függvény (persons-tab.tsx:39) szándékosan *havi* születésnap-jelölő, a hónap-összevetés helyes.
2. **„saveFamily gyerekIds kereszt-gyülekezeti injektálás"** — a family-actions.ts:416–427 minden kiválasztott tagot (gyerekeket is) validál a gyülekezetre. Le van védve.
3. **„Éves jelentés lélekszáma = presbiterszám"** — a presbiterekSzama a VII. szekció helyes adata; a valódi hiány az, hogy lélekszám-szekció nincs (→ P2-1).

---

## 4. Javasolt ütemezés

| Fázis | Tartalom | Tételek |
|---|---|---|
| **1. Biztonsági hotfix** (azonnal) | removeMember ownership-check + tranzakcióba/RPC-be szervezés; anyakönyvi hard delete leállítása; getOrCreate* guard; felmentes/presbiter RLS szigorítás (congregation_id oszlop + backfill + policy) | P0-1…P0-4, P1-3, P1-4 |
| **2. Megbízhatóság** (1–2 hét) | audit-log bekötés minden mutációra; saveFamily/removeMember tranzakciók; FK + UNIQUE constraintek; backfill-SQL élesítés | P1-1, P1-5, P1-6 |
| **3. Integráció-zárás** | házasság→család automatika; halál-utak egységesítése; sirhelyelhunyt→szemely link; éves jelentés lélekszám | P1-7, P2-1 |
| **4. Skálázás + UX** | szerveroldali lapozás vagy virtualizáció; export; import-wizard duplikátum + vissza-gomb; mobil-finomítások | P1-2, P2-2, P2-5…P2-8 |
| **5. Új funkciók** | születésnap/névnap, korfa, tagsági igazolás, GDPR-mezők, voter-automatika | P3-* |
