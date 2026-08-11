# A napi biztonsági mentés élesítése — lépésről lépésre

*Készült: 2026-08-11 · Kartotéka v0.9.161*

Ez az egyetlen rész, amit nem tudtam elvégezni helyetted: a Google Drive-hoz **a te Google-fiókod engedélye** kell, a titkos kulcsokat pedig csak te teheted be a szerver beállításai közé.

Nagyjából **20–30 perc**, egyszer kell megcsinálni. Ha bármelyik lépésnél elakadsz, szólj — a képernyők időnként átalakulnak, de a lényeg ugyanaz marad.

---

## Mielőtt nekikezdesz — mit csinálunk és miért

A mentés a **te Drive-odba** kerül, a te tulajdonodba. Ehhez a Google-nak tudnia kell, hogy a Kartotéka jogosult fájlt tenni oda. Ezt egy „OAuth" nevű engedéllyel adod meg — ez ugyanaz, mint amikor egy alkalmazás „Bejelentkezés Google-fiókkal" gombot kínál.

A mentés **titkosítva** megy fel, tehát a Google csak értelmezhetetlen adatot lát. A titkosítás kulcsa a szerveren van, nem a Drive-on.

Egyetlen jogosultságot kérünk: **`drive.file`**. Ez azt jelenti, hogy a Kartotéka **kizárólag azokat a fájlokat látja, amelyeket ő maga hozott létre** — a Drive-od többi tartalmához nincs hozzáférése. Ez szándékos.

---

## 1. rész — Google Cloud (kb. 15 perc)

> **A gombnevek angolul is ott vannak zárójelben.** A Google Cloud konzol nyelve fiókonként eltér —
> ha nálad angolul jelenik meg (a legtöbb esetben így van), a **zárójeles** alakot keresd a képernyőn.
> A menüpontok sorrendje néha átalakul, de a nevek évek óta ugyanazok.

### 1. Projekt létrehozása *(Create a project)*

1. Nyisd meg: **https://console.cloud.google.com**
2. Jelentkezz be azzal a Google-fiókkal, **amelyiknek a Drive-jába a mentést szeretnéd**.
3. Fent, a Google Cloud felirat mellett kattints a **projektválasztóra** *(project selector)* → **ÚJ PROJEKT** *(NEW PROJECT)*.
4. Név *(Project name)*: `Kartoteka mentes` (bármi lehet). **LÉTREHOZÁS** *(CREATE)*.
5. Várj, amíg elkészül, majd **válaszd ki** a projektválasztóban.

> **A „Free trial" / „$300 credit" sávot nyugodtan hagyd figyelmen kívül**, és **ne** kattints az
> **Activate** gombra. Amit itt használunk (Drive API, saját fiók, napi egy mentés), az **ingyenes** —
> nincs szükség fizetős fiókra. A sáv minden új projektnél megjelenik.

### 2. A Drive API bekapcsolása *(Enable the Drive API)*

6. Bal oldali menü → **API-k és szolgáltatások** *(APIs & Services)* → **Könyvtár** *(Library)*.
7. Keresés: `Google Drive API` → kattints rá → **ENGEDÉLYEZÉS** *(ENABLE)*.
   - Ha már be van kapcsolva, a gomb helyén **Disable API** felirat áll, és a **Status** mezőben **Enabled** — ez a jó állapot, menj tovább.

### 3. Hozzájárulási képernyő *(OAuth consent screen)*

> **A Google 2025-ben átnevezte ezt a részt.** Két felülettel találkozhatsz — a lépések tartalma
> ugyanaz, csak máshol vannak. Nézd meg, melyiket látod, és azt az oszlopot kövesd.
>
> | Amit el kell intézni | **Új felület** *(Google Auth Platform)* | **Régi felület** |
> |---|---|---|
> | Alkalmazás neve, támogatási e-mail | **Branding** | OAuth consent screen → App information |
> | Külső/Belső, tesztfelhasználók, közzététel | **Audience** | OAuth consent screen → User type / Test users |
> | Jogosultságok *(scopes)* | **Data Access** | OAuth consent screen → Scopes |
> | Ügyfél-azonosító (4. rész) | **Clients** | Credentials |
>
> **Ha az új felületet látod, jó eséllyel ezt már ki is töltötted:** a Google nem enged a „Create
> client" oldalra addig, amíg a Branding és az Audience üres. Ha odáig eljutottál, ugorj a 4. részre —
> **de a 12/b lépést akkor is végezd el**, mert az a 7 napos csapda.

8. Bal oldali menü → **OAuth hozzájárulási képernyő** *(OAuth consent screen)*, új felületen: **Branding**.
9. Felhasználótípus *(User type / Audience)*: **Külső** *(External)*.
   *(A **Belső** *(Internal)* csak Google Workspace-fiókoknál választható; ha a fiókod Workspace-es, válaszd azt — egyszerűbb, és nem jár a lenti 7 napos csapdával.)*
10. Alkalmazás neve *(App name)*: `Kartoteka`.
    Felhasználói támogatás e-mail *(User support email)* és Fejlesztői kapcsolattartási adatok *(Developer contact information)*: a **saját címed**. → **MENTÉS** *(SAVE)*.
11. **Hatókörök** *(Scopes / Data Access)*: itt **ne adj hozzá semmit**.
    *(A jogosultságot maga az alkalmazás kéri majd a bejelentkezéskor, nem itt kell felvenni.)*
12. **Tesztfelhasználók** *(Test users)* — az **Audience** oldalon: **ADD USERS** → írd be a **saját e-mail-címedet** → **SAVE**.

> ### ⚠️ 12/b. Ezt olvasd el — enélkül 7 naponta elromlik
>
> Az **Audience** oldalon (régi felületen: OAuth consent screen) nézd meg a **Publishing status**
> mezőt. Ha **„Tesztelés"** *(Testing)* áll benne, a Google **7 nap után érvényteleníti** a
> hozzáférést, és a mentés **némán** leáll.
>
> Ezért nyomd meg a **KÖZZÉTÉTEL** *(**PUBLISH APP**)* gombot — az állapot ekkor **Éles**
> *(**In production**)* lesz. Mivel csak a `drive.file` hatókört kérjük — ami nem „érzékeny"
> *(sensitive)* a Google besorolásában —, **nem kell átesned a hosszú felülvizsgálaton**
> *(verification)*; a közzététel azonnal érvényes.
>
> Ha mégis „Tesztelés" állapotban hagyod: működni fog, de **hetente újra kell kapcsolnod**.
> A rendszer ezt észre is veszi, és a 48 órás figyelmeztetés szólni fog.

### 4. Azonosítók létrehozása *(Create credentials)*

13. **Hitelesítő adatok** *(Credentials)* → **CREATE CREDENTIALS** → **OAuth client ID**.
    Új felületen: bal oldali menü → **Clients** → **Create client**.
    - ⚠️ **Ne** a **Szolgáltatásfiók** *(Service account)* lehetőséget válaszd — az a te Drive-odhoz nem fér hozzá, és néma hibát okoz.
14. Alkalmazás típusa *(Application type)*: **Webalkalmazás** *(Web application)*.
15. Név *(Name)*: `Kartoteka szerver`. *(Ha `Web client 1` az alapértelmezés, nyugodtan írd át — csak a konzolban látszik.)*
16. **Engedélyezett átirányítási URI-k** *(Authorized redirect URIs)* → **+ ADD URI**, és írd be pontosan ezt:

    ```
    https://kartoteka.app/api/auth/google-drive/callback
    ```

    > Egyetlen karakter eltérés is elég, hogy a Google elutasítsa. Nincs `/` a végén.
    > ⚠️ Ez **nem** ugyanaz, mint az **Authorized JavaScript origins** mező — azt **hagyd teljesen üresen**.
    > Két „+ Add URI" gomb van az oldalon; a **másodikat** használd, az „Authorized redirect URIs" felirat alattit.

17. **LÉTREHOZÁS** *(CREATE)*. A felugró ablakban *(OAuth client created)* két érték jelenik meg — **másold ki mindkettőt**, ezek kellenek a következő részhez:
    - **Ügyfél-azonosító** *(Client ID)* — valami ilyesmi: `1234...apps.googleusercontent.com`
    - **Ügyfélkulcs** *(Client secret)*

    A kulcsot később is meg tudod nézni ugyanitt, de egyszerűbb most félretenni.

    > **Ezt a két értéket senkinek ne küldd el** — nekem sem. A helyük a Railway beállításai közt van (2. rész).

---

## 2. rész — Railway (kb. 10 perc)

Nyisd meg a Railway-en a Kartotéka projektet → a webes szolgáltatás *(service)* → **Variables** fül *(Változók)*. Itt add hozzá az alábbiakat a **New Variable** *(Új változó)* gombbal.

> A Railway felülete **csak angolul** van. A változónevek amúgy is angolok — azokat **betűre pontosan** másold, ahogy a táblázatban állnak.

### Kötelező

| Változó | Mit írj bele |
|---|---|
| `GOOGLE_DRIVE_CLIENT_ID` | Az imént kimásolt **Ügyfél-azonosító** |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Az imént kimásolt **Ügyfélkulcs** |
| `GOOGLE_DRIVE_REDIRECT_URI` | `https://kartoteka.app/api/auth/google-drive/callback` |
| `BACKUP_ENCRYPTION_KEY` | **Generálni kell — lásd alább.** Ez titkosítja a mentést. |
| `BACKUP_WORKER_SECRET` | **Generálni kell — lásd alább.** Ez engedi be az éjjeli futást. |

### A két titok legenerálása

Nyiss egy PowerShell-ablakot, és futtasd le **kétszer** ezt a parancsot — az első eredmény lesz a `BACKUP_ENCRYPTION_KEY`, a második a `BACKUP_WORKER_SECRET`:

```powershell
$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

> **Miért pont ez a parancs?** Az útmutató első változatában `Get-Random` állt. Az egy hétköznapi
> véletlenszám-generátor: gyors, de kiszámítható — nem titkok előállítására való. Ez a parancs a
> Windows kriptográfiai generátorát használja. A `BACKUP_ENCRYPTION_KEY` a mentéseid zárja, ott ez
> nem elméleti különbség. Ha az első változattal már generáltál kulcsot, generáld újra ezzel —
> **amíg nem készült vele éles mentés, cserélni ingyenes**; utána a régi mentések már csak a régi
> kulccsal nyithatók.

> **A `BACKUP_ENCRYPTION_KEY`-t őrizd meg külön is** — például egy jelszókezelőben, vagy kinyomtatva egy borítékban. Ha a Railway-projekt elveszne, **ezzel a kulccsal lehet megnyitni a Drive-ban lévő mentéseket**. Enélkül azok visszafejthetetlenek.

### Ajánlott

| Változó | Mit írj bele |
|---|---|
| `BACKUP_ALERT_EMAIL` | A címed, ahová a hibajelzés menjen (ha nincs megadva, a rendszergazda címére megy) |
| `EXPIRY_REMINDER_SECRET` | A heti lejárat-emlékeztetőhöz — ugyanazzal a paranccsal generálhatod |
| `BACKUP_WORKER_ENDPOINT` | `https://kartoteka.app/api/internal/backup` — **az ütemezett futáshoz kell** (lásd a 3. részt) |
| `BACKUP_MAX_SZELET` | Hány szeletet vigyen egy éjszakai futás. Ha nem adod meg: **24** (≈4 óra). |

> ⚠️ **A `BACKUP_MAX_RUN_MS`-t NE állítsd be**, hacsak nem tudod pontosan, mit csinálsz.
> Ez a szelet időkeretét írja felül, és **erősebb**, mint a felületről indított futás saját
> beállítása. Egy elgépelt érték itt a mentést nem állítja meg, de fölöslegesen hosszú
> szeleteket okoz.

---

## 3. rész — Az ütemezés (Railway cron)

A Railway-en a szolgáltatás beállításai *(Settings)* közt keresd a **Cron Schedule** *(ütemezés)* vagy **Scheduled jobs** *(ütemezett feladatok)* részt, és vegyél fel egy napi futást:

- **Időpont:** `17 2 * * *`
- **Amit futtat:** `node apps/web/scripts/run-backup-worker.mjs`

### ⚠️ A `17 2 * * *` UTC-ben értendő — NEM romániai időben

A Railway ütemezője **UTC** szerint jár *(„schedules are based on UTC")*. A `17 2 * * *` tehát:

| | Romániai idő |
|---|---|
| **Nyáron** (márc. vége – okt. vége, UTC+3) | **05:17** |
| **Télen** (okt. vége – márc. vége, UTC+2) | **04:17** |

*(Az útmutató korábbi változata azt írta, hogy „ez hajnali 2:17". Ez tévedés volt. A Railway nem
ismer időzónát, tehát választani kell: vagy elfogadjuk, hogy a futás évente kétszer egy órát
vándorol, vagy évente kétszer átírjuk az időpontot. A mentésnek nem számít, hogy hajnali 4 vagy 5
óra — a félrevezető dokumentáció viszont igen, ezért inkább az igazságot írjuk ki.)*

*(A perc szándékosan nem kerek: egész órakor a világ összes ütemezett feladata egyszerre indul.)*

### ⚠️ Miért a szkriptet futtatjuk, és nem egy sima HTTP-hívást

Az útmutató korábbi változata egyetlen `POST https://kartoteka.app/api/internal/backup` hívást
ütemezett. Ez **egyetlen szeletet** futtatna — 784 gyülekezethez pedig több tucat kell. Ráadásul egy
ilyen kérést a Railway edge-proxyja **300 másodperc** után elvág, ha közben nem mozog adat: a futás
15 gyülekezet után elhalna, és éjszakánként ugyanennyivel haladna.

A `run-backup-worker.mjs` ezzel szemben **szeletekben** hívja a motort, egymás után, amíg el nem fogy
a munka — és minden szelet ott folytatja, ahol az előző abbahagyta. Ehhez kell a
`BACKUP_WORKER_ENDPOINT` változó (lásd az „Ajánlott" táblázatot).

Ha a Railway-változatod nem tud parancsot ütemezni, szólj — akkor GitHub Actions-szel oldjuk meg.
*(A `.github/workflows` mappában jelenleg **csak** a `ci.yml` van, ütemezés nélkül; azt előbb meg
kell írni.)*

> **Nem kell megvárnod az éjszakát.** Az **Admin → Biztonsági mentés → „Mentés most"** gomb ugyanezt
> a munkát elvégzi: elindítja a teljes futást a szerveren, és a lap megmutatja, hol tart
> (`N / 784`). Az oldalt nyugodtan bezárhatod — a mentés a szerveren fut tovább.

---

## 4. rész — Összekapcsolás és próba (5 perc)

1. Nyisd meg a Kartotékát → **Admin** → **Biztonsági mentés**.
2. **„Google Drive összekapcsolása"** gomb → a Google engedélykérő képernyője jön. Válaszd ki a fiókot, és engedélyezd.
   - Ha „Ez az alkalmazás nincs ellenőrizve" figyelmeztetés jön: **Speciális** → *„Ugrás a Kartoteka oldalára (nem biztonságos)"*. Ez a saját alkalmazásod; a figyelmeztetés minden nem hitelesített alkalmazásnál megjelenik.
3. Vissza a Kartotékára → a kártyán zöld állapotnak kell lennie, a Drive-odban pedig megjelenik egy **Kartoteka** mappa.
4. Állítsd be a **mentési jelszót** ugyanezen az oldalon. Ez **nem** a belépési jelszavad. Ez őrzi a letöltést és a visszaállítást.

   > **Ha ezt elveszíted, a mentések nem állíthatók vissza.** Nincs „elfelejtett jelszó" gomb — ha lenne, más is vissza tudná fejteni őket. Írd fel oda, ahová a titkosítási kulcsot is.
5. **„Mentés indítása most"** — futtasd le kézzel. A végén a listában megjelenik egy sor a mérettel és egy zöld pipával.
6. **Töltsd le** a mentést, és nyisd meg. A `scripts/kartoteka-mentes-megnyitas.mjs` szkripttel bármikor megnyitható, a Kartotéka nélkül is — ez a garancia arra, hogy nem egy zárt dobozt őrzöl.
7. **A legfontosabb próba:** másnap nézd meg, hogy magától lefutott-e. Ha nem, e-mailt kapsz róla, és az admin felületen borostyán sáv jelenik meg.

---

## Ha valami nem megy

| Tünet | Mi a teendő |
|---|---|
| „redirect_uri_mismatch" a Google-nál | Az átirányítási cím nem pontosan egyezik. Nézd meg a 16. lépést — nincs `/` a végén, és az **Authorized redirect URIs** mezőben van, nem a JavaScript origins mezőben. **Ha biztosan jó, várj:** a Google maga írja ki a létrehozáskor, hogy a beállítás életbe lépése *5 perctől néhány óráig* tarthat. |
| „Access blocked: … has not completed the Google verification process" | Az e-mail-címed nincs a **Test users** *(Tesztfelhasználók)* közt — 12. lépés —, vagy az app „Testing" állapotban van. |
| „This app isn't verified" *(Ez az alkalmazás nincs ellenőrizve)* | Normális a saját alkalmazásodnál. **Advanced** *(Speciális)* → **Go to Kartoteka (unsafe)** *(Ugrás a Kartoteka oldalára)*. |
| Az **OAuth client ID** lehetőség szürke / nem választható | A 3. rész (hozzájárulási képernyő) még nincs kitöltve. Előbb azt fejezd be. |
| A kártya azt írja, nincs beállítva a titok | A `BACKUP_ENCRYPTION_KEY` vagy a `BACKUP_WORKER_SECRET` hiányzik, vagy 32 karakternél rövidebb. Railway → **Variables**. |
| 7 nap múlva megszakad a kapcsolat | Az alkalmazás „Tesztelés" *(Testing)* állapotban maradt. Google Cloud → **OAuth consent screen** → **PUBLISH APP**. |
| A mentés „sikertelen"-t ír, de nem tudod, miért | A részletek a Railway logban *(Deployments → View logs)* vannak, és e-mailben is megkapod. Küldd át, és megnézem. |

---

## Amit érdemes tudni a mentésről

- **Két mentés készül:** gyülekezetenként egy (a te gyülekezeted adata), és külön egy rendszerszintű (minden gyülekezet + a Missziós Műhely közösségi tartalma).
- **Megőrzés:** 14 napi, 8 heti és 6 havi mentés marad meg; a régebbieket a rendszer törli a Drive-ból, hogy ne teljen be.
- **Ami NEM kerül bele (v1):** a feltöltött fájlok maguk — iktatói szkennek, arcképek, csatolmányok. Ezek a Supabase tárolójában vannak. A mentés az **adatbázist** őrzi; a fájlok mentése külön kör lesz. Ez az admin felületen is ki van írva, hogy ne higgy többet a mentésről, mint amennyi.
- **A visszaállítás** gyülekezeti szinten működik gombbal, szárazpróbával. Országos helyreállítás nem gomb — az leírt eljárás, mert 500 gyülekezet nem fér egyetlen műveletbe.
