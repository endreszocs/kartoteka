# Romániai szabványok és külső integrációk — kutatási jegyzet

**Készült:** 2026-08-14 · a 7., 8., 11. és 16. ponthoz kért online utánajárás eredménye.

---

## 1. Leltár — a hivatalos romániai forma (11. és 16. pont)

### 1.1 A vonatkozó jogszabályok

| Jogszabály | Tárgy |
|---|---|
| **OMFP 2634/2015** (2015. november 5.) | *Documentele financiar-contabile* — a pénzügyi-számviteli bizonylatok rendszere. Ez váltotta a korábbi 3512/2008-at. |
| **OMFP 2861/2009** | *Normele privind organizarea şi efectuarea inventarierii* — a leltározás szabályai (Monitorul Oficial 704/2009.10.20.) |
| **HG 2139/2004** | *Catalogul privind clasificarea şi duratele normale de funcţionare a mijloacelor fixe* — az állóeszköz-osztályozási kódok és normál működési időtartamok katalógusa |
| **Legea 82/1991** (2023-as módosítással) | könyvviteli törvény — megőrzési idők |

### 1.2 ⚠️ Kulcsfontosságú jogi megállapítás

Az **OMFP 2634/2015 eltörölte a kötelező, merev nyomtatványmintákat**. Helyette
**„conţinutul minimal obligatoriu"** — kötelező minimális tartalmat — ír elő, és a gazdálkodó
egység szabadon alakíthatja a nyomtatvány kinézetét, feltéve, hogy a kötelező tartalom megvan.

**Következmény a Kartotékára:** a leltári fisát **szabadon tervezhetjük szépre és kétnyelvűre**
(román/magyar), amíg a kötelező mezők hiánytalanul szerepelnek rajta. Nem kell pixelre másolni
egy állami űrlapot — de a kötelező tartalomból egy mező sem hiányozhat, és a **román megnevezéseknek
a hivatalos terminológiát** kell használniuk.

### 1.3 `FIŞA MIJLOCULUI FIX` (Cod 14-2-2) — az állóeszköz-karton

**Serveşte ca:** „document pentru evidenţa analitică a mijloacelor fixe" — az állóeszközök
analitikus nyilvántartásának bizonylata.

**Szabályok (idézve a normából):**
- Minden egyes állóeszközre külön fisa készül.
- Azonos jellegű, azonos értékű, azonos amortizációs kulcsú és **ugyanabban a hónapban**
  üzembe helyezett állóeszközökre **egyetlen közös fisa** is készíthető.
- Tárolás: állóeszköz-csoportonként, a besorolási kódok sorrendjében; csoporton belül
  **használati helyenként** (`locuri de folosinţă`).
- A **kivont vagy áthelyezett** állóeszközök fisái **archiválandók**.
- A fisa a mozgásokat és az értékváltozásokat igazoló bizonylatok alapján töltendő ki
  (kiegészítés, felújítás, korszerűsítés, átértékelés).
- **Nem cirkulál** — könyvelési nyilvántartási bizonylat; a pénzügyi-számviteli osztályon archiválják.

**Előlap — kötelező mezők (hivatalos román megnevezés → magyar):**

| Román | Magyar |
|---|---|
| `Numărul de inventar` | Leltári szám |
| `Fel, număr şi dată document de provenienţă` | A származási bizonylat fajtája, száma, kelte |
| `Valoarea de inventar` | Leltári érték |
| `Amortizarea lunară` | Havi amortizáció |
| `Denumirea mijlocului fix şi caracteristici tehnice` | Az állóeszköz megnevezése és műszaki jellemzői |
| `Accesorii` | Tartozékok |
| `Grupa` | Csoport |
| `Codul de clasificare` | Besorolási kód *(HG 2139/2004 szerint)* |
| `Data dării în folosinţă` (anul, luna) | Üzembe helyezés (év, hónap) |
| `Data amortizării complete` (anul, luna) | Teljes amortizáció (év, hónap) |
| `Durata normală de funcţionare` | Normál működési időtartam |
| `Cota de amortizare (%)` | Amortizációs kulcs (%) |

**Hátlap — mozgások:**
`Numărul de inventar` · `Documentul (dată, fel, număr)` · `Operaţiunile care privesc mişcarea,
creşterea sau diminuarea valorii mijlocului fix` · `Debit` · `Credit` · `Sold` · `Bucăţi` ·
gaj/zálog adatok.

> **Kitöltési szabály:** a `Bucăţi` (darab) oszlopban a **belépés feketével**, a **kilépés pirossal**
> írandó. A `Debit / Credit / Sold` a **leltári értéken** vezetendő.

### 1.4 Kapcsolódó leltári bizonylatok

| Bizonylat | Kód | Szerepe |
|---|---|---|
| `Registrul numerelor de inventar` | **14-2-1** | Leltári szám kiosztása; az állóeszközök **kronologikus** bejegyzése belépéskor. Csoportonként vagy összevontan vezethető. A kiosztott leltári számot **minden**, az eszközre vonatkozó bizonylaton fel kell tüntetni. Bérelt eszközre nem osztunk leltári számot. |
| `Bon de mişcare a mijloacelor fixe` | **14-2-3A** | Átadás-átvétel két **használati hely** között; kísérőokmány szállításkor; könyvelési bizonylat. |
| `Proces-verbal de scoatere din funcţiune a mijloacelor fixe / de declasare a unor bunuri materiale` | **14-2-3/aA** | Üzemből kivonás / selejtezés jegyzőkönyve. |
| `Lista de inventariere` | **14-3-12** (és `/a` global-valorice, `/b`) | A leltározás fő bizonylata. |

**`Lista de inventariere` — mire szolgál (idézet a normából):**
- a gazdálkodó kezelésében lévő javak leltározása;
- a **hiányok és többletek** megállapítása;
- könyvelési bizonylat a megállapított többletek/hiányok rögzítéséhez;
- a **`Registrul-inventar`** összeállításának alapja;
- az értékvesztési kiigazítások meghatározása;
- a leltározási műveletek **összesítő** bizonylata.

**Kitöltés:** a tárolási helyeken, **évente** (vagy jogszabályban előírt esetben), a
**`comisia de inventariere`** (leltárbizottság) által, kezelésenként és értékszámlánként.
Aláírja a bizottság minden tagja **és a `gestionar`** (anyagilag felelős kezelő).
A **más entitás tulajdonában** lévő javakról **külön** lista készül, amelyen a közös elemeken
(anyag/termék fajtája, mennyiség, érték) túl fel kell tüntetni az **átadás-átvételi okirat számát és keltét**.

### 1.5 ⚠️ Kapcsolat a lelkészi jelentéssel

A lelkészi jelentés **VIII.3. pontja** („alapeszközök beszerzésére fordított összeg") közvetlenül
a leltárra épül:

> **Alapeszköz** = minden olyan leltári tárgy, amelynek beszerzési értéke meghaladja a Román Kormány
> által megállapított küszöböt, és használati ideje **egy évnél több**.
> **2026. január 1-jén ez a küszöb 2 500 lej** (2013. július 1-jétől érvényes).

→ A leltár modulnak **ismernie kell ezt a küszöböt** (konfigurálhatóan, mert a kormány emelheti),
és az e feletti tételeket `mijloc fix`-ként, az alattiakat `obiect de inventar`-ként kell kezelnie.
Ez a megkülönböztetés a román számvitel alapja, és a jelentés VIII.3. sora **csak a küszöb feletti**
tételeket összegzi.

---

## 2. Pénztári bizonylatok (16. pont)

Szintén **OMFP 2634/2015**, ugyanaz a „kötelező minimális tartalom" elv:

| Bizonylat | Kód | Szerepe |
|---|---|---|
| `Chitanţa` | **14-4-1** | Készpénz-bevételezés igazoló bizonylata. Valutában: `Chitanţa pentru operaţiuni în valută` (**14-4-1/a**). |
| `Dispoziţie de plată/încasare către casierie` | **14-4-4** | Utasítás a pénztárosnak összeg kifizetésére/bevételezésére; **igazoló bizonylat a pénztárkönyvbe és a könyvelésbe**, ha a készpénzes kifizetéshez nincs más igazoló bizonylat. Használható **útiköltség-előleg** kifizetésére is. |
| `Registru de casă` | **14-4-7A** | Napi készpénz-bevételek és -kifizetések operatív nyilvántartása; a **napi záró pénztárkészlet** megállapítása; a pénztári műveletek könyvelési bizonylata. **Naponta** töltendő, az igazoló bizonylatok alapján. Valutában: **14-4-7/aA**, **14-4-7/cA**; másik változat: **14-4-7/bA**. |

> **Megjegyzés a Kartotékához:** a memória szerint már van „nyugta-duplikáció" és „Chitanță = utolsó+1"
> logika, valamint a hiányzó nyugta = *Chitanță*-bevétel könyvelői döntés. Ezek illeszkednek a fenti
> szabályozáshoz. A **`Registru de casă` napi zárás** követelménye viszont ellenőrzendő:
> a norma szerint **naponta** kell vezetni és **napi záró egyenleget** megállapítani.

---

## 3. Oblio integráció (7. pont)

### 3.1 Az Oblio API

| Jellemző | Érték |
|---|---|
| **Alap-URL** | `https://www.oblio.eu/api/` |
| **Hitelesítés** | OAuth 2.0 — `POST /api/authorize/token`, `client_id` = e-mail, `client_secret` |
| **Válaszformátum** | JSON |
| **Rate limit** | dokumentum-kiállítás: **30 kérés / 100 mp**; egyéb: **30 kérés / 10 mp** |

**Végpontok:**
- Kiállítás (POST): `/docs/proforma`, `/docs/notice` (aviz), `/docs/invoice`
- Lekérés (GET): `/docs/invoice?cif={cif}&seriesName={...}&number={...}` (proforma/notice ugyanígy)
- **Lista:** `GET /docs/invoice/list` — szűrés dátumtartomány, ügyfél, sorozat és **fizetési állapot** szerint
- Műveletek: `PUT /docs/{type}/cancel`, `/restore`, `DELETE /docs/{type}`, `PUT /docs/invoice/collect`
- e-Factura: `POST /docs/einvoice` (SPV-re küldés), `GET /docs/einvoice` (SPV-archívum letöltése)
- Nómenklatúra: cégek, ÁFA-kulcsok, ügyfelek, termékek, dokumentum-sorozatok, nyelvek, raktárak
- **Webhookok**: létrehozás/listázás/törlés — pub/sub értesítés eseményekre

### 3.2 ⚠️ A kifizetetlen számlák kérdése — megoldott

A felhasználó külön ablakot kért a **még kifizetetlen számláknak**. Az Oblio API ezt **natívan tudja**:

> A `/docs/invoice/list` végpont **`collected`** paramétere: `-1` = mindegy · **`0` = kifizetetlen** · `1` = kifizetett.

→ A „kifizetetlen számlák" ablak tehát **nem** heurisztika: az Oblio hiteles adata.
A ZIP-alapú feldolgozás mellett érdemes az API-t is bekötni, mert a ZIP egy **pillanatfelvétel**,
az API viszont **élő** fizetési állapotot ad.

### 3.3 A ZIP-export tartalma és az e-Factura

- Az Oblio felületén: **Export** gomb → időszak kiválasztása → **Download** — az összes számla egyetlen fájlban.
- Az e-Factura formátum: **XML UBL 2.1**, a **RO_CIUS** specifikáció szerint
  (európai szabvány **SR EN 16931-1**, OPANAF 1366/2021).
- Az ANAF SPV-ből letöltött csomag: **ZIP**, amely tartalmazza az **XML**-t **és az ANAF digitális aláírását**.

### 3.4 ⚠️ Megőrzési kötelezettség — ez teszi a Drive-archívumot jogi szükségletté

| Tény | Következmény |
|---|---|
| Az **SPV csak 60 napig** őrzi a számlákat | a letöltés és archiválás **halaszthatatlan** |
| **Legea 82/1991** (2023-as módosítás): az XML + ANAF-aláírás megőrzése **minimum 5 év** | a gyülekezeti Drive-terület nem kényelmi funkció, hanem **jogszabályi megfelelés** |
| Éves pénzügyi kimutatások és hosszú élettartamú javak: **10 év** | a leltárhoz kapcsolódó számlákat tovább kell őrizni |

→ **Terv-következmény:** a gyülekezeti Drive-terület nem pusztán „feltöltési hely",
hanem **megőrzési archívum**, amelynek biztosítania kell: sértetlenség (az ANAF-aláírás
megbontatlanul), visszakereshetőség, és a **60 napos SPV-ablak** előtti behúzás.
Érdemes emlékeztetőt/automatizmust tenni rá.

### 3.5 Bővíthetőség más szolgáltatókra

A felhasználó jelezte: *„Később az oblió mellé még más is kerül majd, mert minden egyházközség
más szolgáltatót használ."*

**Tervezési következtetés:** a feldolgozó ne „Oblio-importőr" legyen, hanem
**szolgáltató-adapter réteg** egy közös, normalizált számla-modell fölött. A közös nevező
mindenkinél az **e-Factura XML (UBL 2.1 / RO_CIUS)** — ez jogszabályban rögzített, tehát
**minden** romániai szolgáltató ezt állítja elő. Ezért:

> **Az adapter elsődleges bemenete az UBL 2.1 XML legyen, ne a szolgáltató saját formátuma.**
> Így az Oblio, a SmartBill, a Facturis, a FGO és bármely további szolgáltató ZIP-je
> ugyanazon az úton dolgozható fel; szolgáltatóspecifikus kód csak ott kell,
> ahol a ZIP szerkezete vagy az API eltér.

---

## 4. Kétlépcsős belépés (8. pont)

### 4.1 Ajánlás: a Supabase natív MFA

A projekt Supabase Auth-ot használ, és a Supabase **natívan tud TOTP MFA-t** —
**ingyenes, és minden projekten alapból engedélyezett**. Nem kell külső szolgáltató.

**Két faktor-típus:** *app authenticator* (**TOTP**) és *telefonos üzenet*.
→ **Javaslat: TOTP.** SMS-költség nincs, nem függ mobilszolgáltatótól, és a
lelkészek külföldi tartózkodása (a jelentés I.18. pontja is számol vele) nem akadály.

### 4.2 A folyamat

| API | Szerep |
|---|---|
| **Enroll** | faktor hozzáadása — QR-kód generálása az authenticator alkalmazáshoz |
| **Challenge** + **Verify** | a beírt kód ellenőrzése; siker esetén a munkamenet **AAL2**-re lép |
| **List Factors** | a bejelentkezéskor felkínálható faktorok listája |
| **Unenroll** | faktor eltávolítása |

### 4.3 AAL — a biztonsági szint a JWT-ben

- **`aal1`** = hagyományos belépés (jelszó, közösségi belépés, magic link)
- **`aal2`** = legalább egy további faktorral igazolt

A szint a JWT **`aal`** claimjében van. Kliensoldalon: `getAuthenticatorAssuranceLevel()`.
Az **`amr`** claim a használt módszerek időbélyeges listája (legfrissebb elöl).

### 4.4 Kikényszerítés adatbázis-szinten (RLS) — ez a lényeg

Adatbázisban:
```sql
(select auth.jwt()->>'aal') = 'aal2'
```

**Mindenkire kötelező:**
```sql
create policy "Enforce MFA"
  on table_name
  as restrictive
  to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2');
```

**Opt-in (aki bekapcsolta, annak kötelező)** — ez a javasolt bevezetési út:
```sql
create policy "Optional MFA"
  on table_name
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt()->>'aal')] <@ (
      select case
        when count(id) > 0 then array['aal2']
        else array['aal1', 'aal2']
      end from auth.mfa_factors
      where user_id = (select auth.uid())
        and status = 'verified'
    ));
```

> **Figyelem — `as restrictive`:** ezek *restrictive* policyk, tehát a meglévő
> permissive policykkel **ÉS** kapcsolatban állnak. A projekt ismert hibaosztálya
> („a migration-fájl nem bizonyíték: lefutott-e élesben?") miatt a bevezetés
> **fail-closed őrszemmel** és szakaszos állapotfelméréssel történjen.

### 4.5 Csapdák

1. **Az `unenroll` nem azonnal fokoz le.** „Unenrolling a factor will downgrade the assurance
   level from `aal2` to `aal1` **only after the refresh interval has lapsed**." → elveszett eszköz
   esetén a munkamenet-visszavonást **külön** kell elvégezni.
2. **A vártnál alacsonyabb AAL nem hiba, hanem állapot.** A szerveren ne hibakódot adjunk vissza,
   hanem **irányítsuk újra-hitelesítésre** — a felhasználó félbehagyhatta a folyamatot,
   nyitva hagyhatott egy fület, vagy elveszíthette az eszközét.
3. **Mentőkódok / telefonos faktor**: a fő dokumentáció ezeket külön oldalra utalja —
   a bevezetés előtt tisztázandó, mert a **fiókból való kizárás** a legvalószínűbb támadás-független
   üzemzavar egy önkéntes-alapú, idős felhasználókat is kiszolgáló rendszerben.

---

## Források

- [Fisa mijlocului fix — model formular si explicatii completare (contabun.ro)](https://www.contabun.ro/2013/11/28/fisa-mijlocului-fix-model-formular-si-explicatii-completare/)
- [Anexa nr. 2 la Ordinul nr. 2634/2015 — Norme specifice de utilizare a documentelor financiar-contabile (PDF)](https://oradea.ro/wp-content/uploads/2023/10/Anexa-nr.2-la-Ordinul-nr.2634-2015-%E2%80%93-Norme-specifice-din-5-noiembrie-2015-de-utilizare-a-documentelor-financiar-contabile.pdf)
- [ORDIN nr. 2634 din 5 noiembrie 2015 privind documentele financiar-contabile (ANAF, PDF)](https://static.anaf.ro/static/10/Anaf/legislatie/OMFP_2634_2015.pdf)
- [OMFP nr. 2861/2009 — Norme privind organizarea si efectuarea inventarierii (contabun.ro)](https://www.contabun.ro/2013/11/17/omfp-nr-28612009-norme-privind-organizarea-si-efectuarea-inventarierii/)
- [Registrul de casa (Cod 14-4-7A si Cod 14-4-7bA) — portalcontabilitate.ro](https://www.portalcontabilitate.ro/registrul-de-casa-cod-14-4-7a-si-cod-14-4-7ba-102245.htm)
- [Dispozitie de plata/incasare (Cod 14-4-4) — model si completare (contabun.ro)](https://www.contabun.ro/2013/12/19/dispozitie-de-plataincasare-cod-14-4-4-model-si-completare/)
- [Oblio API + Integrari](https://www.oblio.eu/api)
- [Oblio — Cum export toate Facturile intr-un singur fisier](https://www.oblio.eu/intrebari-frecvente/cum-export-toate-facturile-intr-un-singur-fisier)
- [Descărcare e-Factura (XML) din SPV — ghid practic (ArenaFacturel)](https://arenafacturel.ro/blog/descarcare-efactura-xml)
- [e-Factura ANAF 2026 — ghid complet pentru firme (imfs.ro)](https://imfs.ro/en/ghiduri/efactura-anaf-2026/)
- [Multi-Factor Authentication — Supabase Docs](https://supabase.com/docs/guides/auth/auth-mfa)
- [Multi-Factor Authentication (TOTP) — Supabase Docs](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Multi-factor Authentication via Row Level Security Enforcement — Supabase Blog](https://supabase.com/blog/mfa-auth-via-rls)
