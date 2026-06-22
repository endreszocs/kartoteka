# 2b — Gyülekezet-beállító ablak összeolvasztás: VÉGREHAJTÁSI TERV (blueprint)

> Adversariálisan kidolgozott terv (4-ágenses workflow, 2026-06-22). Cél: a **setup-varázsló**
> (`congregation-setup-wizard.tsx`, szép sidebar+készültség héj, 3 kategória) és a **dialog-v2**
> (`congregation-dialog-v2.tsx`, teljes tartalom, top-fülek + beszúrt al-fülek) **EGY** ablakba
> olvasztása: 6 kategória, egy belépési pont, dialog-v2 nyugdíjazás.

## Irány: **B — dialog-v2 NYER** (megkapja a varázsló héját)
**Miért:** a dialog-v2-ben MÁR egy helyen ül az összes teher (8-ágú `loadData`, ~15 handler, 6+
segédkomponens, mind a 6 kategória tartalma). A varázslóban csak 3 kategória + a jól izolált héj
(~120 sor). Az „A" irány ~1150 sor logika+JSX migrációt kívánna (a varázsló `saveCongregationSetup`-ja
NEM tud járulékot/kedvezményt/átadást menteni). B-ben csak a héj-réteg kerül át, az adat/handler-réteg
ÉRINTETLEN.

## Kulcs-csatolások (meg kell tartani)
- **Egy `<form>` + `handleSubmit` MARAD** (`updateCongregation` a TELJES form-mal, dialog-v2:208-214).
  Az „alap" formot 3 panelre bontva is EGY `<form>` wrappeli az egész tartalom-területet; a panelek
  feltételes renderrel (`activePane === X &&`). A form-adat React state-ben (`form`) él → panelváltáskor
  NEM vész el (nem a DOM-ból olvas).
- **Pénzügyi alapadat** (`eves_jarulek`, `tartozas_szamitas_mod`, `jarulek_kedvezmenyes`, `jarulek_hatarid`):
  marad `updateCongregation` (NE bővítsd a setup-payloadot).
- **Hozzáférés:** a dialog-v2 szigorúbb `requireActiveCongregation` MARAD (NE cseréld setup-`canManage`-re).
  Admin/master/egyházkerületi admin írása god-mode override-dal (a harmonizáció KÜLÖN feladat). FONTOS:
  a banner/auto-open eddig a lazább setup-úton engedett — ezután a szigorúbb úton megy → admin override
  nélkül elbukhat (elfogadott szigorítás; a sima lelkész `congregation_id===id` MINDKÉT kaput átmegy).
- **4 schemaReady amber banner MEGŐRZENDŐ** (dialog-v2:651 pastors / 1079 discount / 1311 bank / 1415 customFee).
- **Badge:** kötelező panelek → Kész/hiányzó-szám (paneMissing); nem-kötelező → számláló-pötty
  (Pénzügy=discounts+customFees, Lelkészek=pastors). MetricCard hero (629-632) változatlan.
- **Completeness Tier-1 CSAK** Áttekintés/Cím/Bankszámlák (varázsló:277-286); Pénzügy/Lelkészek/Haladó
  MINDIG „done" → az onboarding-banner le tud zárulni.
- **primaryBank ↔ congregations.bank/iban:** EGY mechanizmus (`saveCongregationBankAccount` isDefault-ág,
  actions.ts:766-774); NE a setup-payload duplikált bank/iban írása.

## Render-szerkezet (dialog-v2 jelenleg)
- `<Dialog>`/`<DialogContent ...sm:max-w-6xl>` (577-578), hero+MetricCard (591-635, KÍVÜL a fülön).
- Outer `<Tabs defaultValue="alap">` (637) → TabsList 3 trigger (638-642):
  - `lelkeszek` (644-855), `alap` (857-975), `penzugy` (976-1593, benne nested `<Tabs alapdij>` 977-1591:
    alapdij 1015 / kedvezmenyek 1078 / bankszamlak 1309 / egyebdij 1414).
- outer `</Tabs>` 1594, `</DialogContent>` 1596.

## 6 kategória → tartalom-leképezés
1. **Áttekintés** (Church/teal) — Megnevezések (nev/nevHu/nevRo/nevEn/adoszam) + Szervezeti hovatartozás (dioceseId) + a hero MetricCardok. Tier-1: nev_hu, adoszam, (cimer).
2. **Cím és elérhetőség** (MapPin/sky) — Hivatalos cím (AddressForm) + Kapcsolati adatok (email/telefon/web). Tier-1: megye/varos/cim/email/telefon.
3. **Bankszámlák** (Landmark/indigo) — a penzugy/bankszamlak al-tab tartalma. Tier-1: fő számla név+IBAN.
4. **Pénzügy és kedvezmények** (Coins/violet) — penzugy/alapdij + kedvezmenyek + egyebdij (a BELSŐ Radix-Tabs maradhat, VAGY stacked kártyák). Nem-kötelező.
5. **Lelkészek** (Users/emerald) — a lelkeszek tab (napló + átadás-workflow) CSAK. A lelkész SAJÁT profilja a ProfileDialog-ban marad (NEM ide!). Nem-kötelező.
6. **Haladó** (Settings2/slate) — ritka beállítások (pl. inaktív-státusz, dioceseId ha nem az Áttekintésben). Nem-kötelező.

## Sorrendezett lépések (mind tsc/eslint-ellenőrzött)
1. **Belépési pontok grep-térkép** (0 kódváltozás): `kartoteka:open-congregation-dialog` vs `-setup-wizard`;
   párok: header-refined-v3.tsx:234/:276; dashboard-shell.tsx:86-104/:130/:148-152/:164-170;
   current-year-fee-banner.tsx ~:81 (dialog event!); congregation-setup-banner.tsx:74 + congregation-setup-auto-open.tsx:100 (inline wizard).
2. **Héj átültetése dialog-v2-be:** `DialogContent` → full-height flex (varázsló:363-371 mintára); outer
   `<Tabs>`/`TabsList` (637-642) → `activePane` state (6 kulcs) + bal sáv-nav (varázsló:394-427). A 3
   meglévő TabsContent-törzset EGYELŐRE NE bontsd — ideiglenes mapping (alap→attekintes, penzugy→penzugy,
   lelkeszek→lelkeszek), hogy lépésenként verifikálható legyen. **Figyelem:** Radix Tabs → manuális
   `activePane` feltételes render; a belső penzugy Radix-Tabs MARADHAT.
3. **„Alap" form szétbontása + completeness:** a Megnevezések/Szervezeti → Áttekintés; Hivatalos cím/Kapcsolati
   → Cím; a `<form>` az EGÉSZ tartalom-területet wrappeli (egy handleSubmit). paneMissing (varázsló:277-286)
   CSAK attekintes/cim/bank; a többi mindig done. Sidebar-badge + felső készültség-sáv.
4. **Pénzügy al-tabok + Lelkészek + badge/schemaReady:** bankszamlak→Bankszámlák pane; alapdij/kedvezmenyek/
   egyebdij→Pénzügy pane; lelkeszek→Lelkészek pane. 4 schemaReady amber banner megőrizve.
5. **Egységes lábléc mentés-sáv + onboarding:** varázsló:486-518 mintára; Mentés = meglévő handleSubmit;
   `onCompleted?` prop + „Később" soft-gate + `router.refresh()`.
6. **4 belépési pont átkötése dialog-v2-re:** shell `handleOpenCongregationSetupWizard`→`setCongregationOpen(true)`;
   fee-banner event-név egyeztetés; banner+auto-open inline wizard→dialog-v2 (vagy a shell event-re).
7. **Wizard nyugdíjazása:** CSAK miután a grep 0 hivatkozást mutat — shell import/state/render/listener törlés,
   majd `congregation-setup-wizard.tsx` törlés. Verify: `npm run build` zöld.

## Kockázatok
- Form 3-pane szétbontásnál mező kimaradhat/duplázódhat → mező-leltár + teljes-form mentés teszt.
- schemaReady rossz pane alá → néma üres lista → 4. lépés verify.
- Tier-1 hibásan kiterjed → banner sosem zárul → „minden-kész" teszt.
- fee-banner `open-congregation-dialog` eventet használ — NE töröld a listenert átkötés előtt.
- Wizard túl korai törlése build-törés → grep-gate, 7. a 6. után.
- Hozzáférés-szigorítás admin/banner úton (lásd fent) — elfogadott, de teszteld admin override-dal.

## Állapot
A funkcionális munka KÉSZ + main-ben (deploy): #24/#25/#26/#28/#29. Ez a 2b TISZTÁN strukturális.
Ág: `feature/egyseges-beallitas-2b-osszeolvaszt` (main-ről). A blueprint végrehajtása friss kontextusban
ajánlott (a ~300 soros restruktúra a 2006 soros dialog-v2-n — egy élő, produkciós beállító-ablak).
