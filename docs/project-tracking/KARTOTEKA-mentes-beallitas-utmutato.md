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

### 1. Projekt létrehozása

1. Nyisd meg: **https://console.cloud.google.com**
2. Jelentkezz be azzal a Google-fiókkal, **amelyiknek a Drive-jába a mentést szeretnéd**.
3. Fent, a Google Cloud felirat mellett kattints a **projektválasztóra** → **ÚJ PROJEKT**.
4. Név: `Kartoteka mentes` (bármi lehet). **LÉTREHOZÁS**.
5. Várj, amíg elkészül, majd **válaszd ki** a projektválasztóban.

### 2. A Drive API bekapcsolása

6. Bal oldali menü → **API-k és szolgáltatások** → **Könyvtár**.
7. Keresés: `Google Drive API` → kattints rá → **ENGEDÉLYEZÉS**.

### 3. Hozzájárulási képernyő

8. **API-k és szolgáltatások** → **OAuth hozzájárulási képernyő**.
9. Felhasználótípus: **Külső** *(a Belső csak Google Workspace-fiókoknál választható; ha a fiókod Workspace-es, válaszd a Belsőt — az egyszerűbb)*.
10. Alkalmazás neve: `Kartoteka`. Támogatási e-mail és fejlesztői e-mail: a saját címed. **MENTÉS ÉS FOLYTATÁS**.
11. **Hatókörök**: itt ne adj hozzá semmit, csak **MENTÉS ÉS FOLYTATÁS**. *(A hatókört az alkalmazás kéri majd, nem itt kell felvenni.)*
12. **Tesztfelhasználók**: **FELHASZNÁLÓK HOZZÁADÁSA** → írd be a **saját e-mail-címedet**. **MENTÉS ÉS FOLYTATÁS**.

> ### ⚠️ Ezt olvasd el — enélkül 7 naponta elromlik
>
> Ha az alkalmazás **„Tesztelés" állapotban** marad, a Google **7 nap után érvényteleníti** a hozzáférést, és a mentés némán leáll.
>
> Ezért a hozzájárulási képernyőn kattints a **KÖZZÉTÉTEL** (Publish app) gombra. Mivel csak a `drive.file` hatókört kérjük — ami nem „érzékeny" a Google besorolásában —, **nem kell átesned a hosszú felülvizsgálaton**; a közzététel azonnal érvényes.
>
> Ha mégis „Tesztelés" állapotban hagyod: működni fog, de **hetente újra kell kapcsolnod**. A rendszer ezt észre is veszi, és a 48 órás figyelmeztetés szólni fog.

### 4. Azonosítók létrehozása

13. **API-k és szolgáltatások** → **Hitelesítő adatok** → **HITELESÍTŐ ADATOK LÉTREHOZÁSA** → **OAuth-ügyfélazonosító**.
14. Alkalmazás típusa: **Webalkalmazás**.
15. Név: `Kartoteka szerver`.
16. **Engedélyezett átirányítási URI-k** → **URI HOZZÁADÁSA**, és írd be pontosan ezt:

    ```
    https://kartoteka.app/api/auth/google-drive/callback
    ```

    > Egyetlen karakter eltérés is elég, hogy a Google elutasítsa. Nincs `/` a végén.

17. **LÉTREHOZÁS**. A felugró ablakban két érték jelenik meg — **másold ki mindkettőt**, ezek kellenek a következő részhez:
    - **Ügyfél-azonosító** (Client ID) — valami ilyesmi: `1234...apps.googleusercontent.com`
    - **Ügyfélkulcs** (Client secret)

    A kulcsot később is meg tudod nézni ugyanitt, de egyszerűbb most félretenni.

---

## 2. rész — Railway (kb. 10 perc)

Nyisd meg a Railway-en a Kartotéka projektet → a webes szolgáltatás → **Variables** fül. Itt add hozzá az alábbiakat.

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

```bash
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

> **A `BACKUP_ENCRYPTION_KEY`-t őrizd meg külön is** — például egy jelszókezelőben, vagy kinyomtatva egy borítékban. Ha a Railway-projekt elveszne, **ezzel a kulccsal lehet megnyitni a Drive-ban lévő mentéseket**. Enélkül azok visszafejthetetlenek.

### Ajánlott

| Változó | Mit írj bele |
|---|---|
| `BACKUP_ALERT_EMAIL` | A címed, ahová a hibajelzés menjen (ha nincs megadva, a rendszergazda címére megy) |
| `EXPIRY_REMINDER_SECRET` | A heti lejárat-emlékeztetőhöz — ugyanazzal a paranccsal generálhatod |

---

## 3. rész — Az ütemezés (Railway cron)

A Railway-en a szolgáltatás beállításai közt keresd a **Cron Schedule** vagy **Scheduled jobs** részt, és vegyél fel egy napi futást:

- **Időpont:** `17 2 * * *` — ez hajnali 2:17. *(Szándékosan nem kerek óra: éjfélkor és egész órakor a világ összes ütemezett feladata egyszerre indul.)*
- **Amit futtat:** `POST https://kartoteka.app/api/internal/backup`, `Authorization: Bearer <a BACKUP_WORKER_SECRET értéke>` fejléccel.

Ha a Railway-változatod nem tud HTTP-hívást ütemezni, szólj — akkor GitHub Actions-szel oldjuk meg, az a `.github` mappában már ott van.

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
| „redirect_uri_mismatch" a Google-nál | Az átirányítási cím nem pontosan egyezik. Nézd meg a 16. lépést — nincs `/` a végén. |
| A kártya azt írja, nincs beállítva a titok | A `BACKUP_ENCRYPTION_KEY` vagy a `BACKUP_WORKER_SECRET` hiányzik, vagy 32 karakternél rövidebb. Railway → Variables. |
| 7 nap múlva megszakad a kapcsolat | Az alkalmazás „Tesztelés" állapotban maradt. Google Cloud → OAuth hozzájárulási képernyő → **KÖZZÉTÉTEL**. |
| A mentés „sikertelen"-t ír, de nem tudod, miért | A részletek a Railway logban vannak, és e-mailben is megkapod. Küldd át, és megnézem. |

---

## Amit érdemes tudni a mentésről

- **Két mentés készül:** gyülekezetenként egy (a te gyülekezeted adata), és külön egy rendszerszintű (minden gyülekezet + a Missziós Műhely közösségi tartalma).
- **Megőrzés:** 14 napi, 8 heti és 6 havi mentés marad meg; a régebbieket a rendszer törli a Drive-ból, hogy ne teljen be.
- **Ami NEM kerül bele (v1):** a feltöltött fájlok maguk — iktatói szkennek, arcképek, csatolmányok. Ezek a Supabase tárolójában vannak. A mentés az **adatbázist** őrzi; a fájlok mentése külön kör lesz. Ez az admin felületen is ki van írva, hogy ne higgy többet a mentésről, mint amennyi.
- **A visszaállítás** gyülekezeti szinten működik gombbal, szárazpróbával. Országos helyreállítás nem gomb — az leírt eljárás, mert 500 gyülekezet nem fér egyetlen műveletbe.
