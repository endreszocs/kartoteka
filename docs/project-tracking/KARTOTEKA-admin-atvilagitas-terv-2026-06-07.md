# Admin rész — átvilágítás és javítási terv (2026-06-07)

> Átnéztem a rendszergazdai (admin) felület **minden oldalát**. Itt vannak a talált
> hibák és fejlesztési lehetőségek, **fontossági sorrendben**, közérthetően.
> **Még semmihez nem kezdtem hozzá** — előbb pontról pontra egyeztetünk, mit kérsz.
>
> Jelölés: ✅ = ellenőrzött (biztos), ⚠️ = részben ellenőrzött / közösen pontosítandó.

---

## 🔴 SÜRGŐS — működést vagy sebességet érint

### 1. Lassú betöltés a „Gyülekezetek" és a „Rendszer pénzügyei" oldalon ✅
A rendszer **gyülekezetenként külön-külön** lekérdezi a tagszámot. Kevés gyülekezetnél
nem feltűnő, de 80–150 gyülekezetnél ez 80–150 külön lekérdezés → **belassul** a betöltés.
Ugyanaz a fajta lassúság, amit az **Áttekintő** oldalon már megoldottunk.
- **Javítás:** egyetlen összesítő lekérdezés (mint az Áttekintőnél). Gyors, biztonságos.

### 2. Jogosultság-egyenetlenség az „egyházkerületi admin"-nál ⚠️
Az *egyházkerületi admin* **beléphet** több admin oldalra (a menü engedi), DE bizonyos
műveletek **hibát adnak neki**, mert ott szigorúbb az ellenőrzés (pl. *Hozzáférés-kérelmek*,
*Rendszer pénzügyei*). A *Támogatás* viszont átengedi. Ez következetlen.
- **Eldöntendő (veled):** az egyházkerületi admin **mit csinálhat** pontosan? Aztán
  egységesítjük: vagy mindenhol engedjük, vagy ahol nem, ott a **menüből is elrejtjük**.

---

## 🟠 FONTOS — érthetőség és megbízhatóság

### 3. „Örök betöltés" hiba esetén ✅
Több oldalon (Gyülekezetek, Támogatás), ha egy betöltés **sikertelen**, a képernyő
**örökre „Betöltés…"** marad — azt hiszed, még tölt, pedig hiba volt.
- **Javítás:** rendes hibaüzenet + „Újrapróbálom" gomb.

### 4. Csendben elbukó értesítések ✅
Néhány művelet (pl. könyvelő/számvevő hozzárendelésekor az **értesítés a lelkésznek**)
**csendben elbukhat** — a lelkész nem kap értesítést, és senki nem tudja meg.
- **Javítás:** ha az értesítés nem ment ki, a rendszer jelezze.

### 5. Karakterhibák a Támogatás oldalon ✅
Néhány üzenet **„elromlott" betűkkel** jelenik meg (pl. „A vĂˇlasz szĂ¶vege kĂ¶telezĹ'."
helyett „A válasz szövege kötelező."). Csúnya, de gyors javítás.

### 6. Régimódi böngésző-ablakok lecserélése ✅
Az *Eszközök*, *Gyülekezetek* és *Frissítések* oldalon a megerősítések még a böngésző
**natív felugró ablakát** használják (`window.prompt` / `confirm`) — ezek **mobilon és
Safariban rosszul** működnek, és nem illenek a rendszer kinézetéhez.
- **Javítás:** ugyanazokra a **szép megerősítő ablakokra** cserélni, amiket a
  Felhasználók oldalon már használunk.

### 7. Angol felirat az Eszközök oldalon ✅
A „**Revoke**" gomb angolul maradt. → **„Visszavonás"**.

---

## 🟡 FÉLKÉSZ / PLACEHOLDER — nem működő részek

### 8. Üres KPI-k az Áttekintőn ✅
A **„Rendszer pénzügyei"** és **„Támogatási jegyek"** mutató mindig **„—"**-t mutat
(nincs mögötte valódi szám).
- **Eldöntendő:** töltsük fel valódi adattal, vagy **vegyük ki** ezeket a kártyákat?

### 9. Mindig megjelenő „adatminőség" figyelmeztetés ✅
Az Áttekintőn a *„Tagnyilvántartási adatminőség"* sárga doboz **mindig** látszik, akkor
is, ha nincs hiba.
- **Javítás:** csak akkor mutassa, ha tényleg van adatminőség-probléma.

### 10. Becsült érték figyelmeztetés nélkül a Rendszer pénzügyeiben ⚠️
Az előrejelzésben egy **becsült költség** (kb. 25 RON / 100 gyülekezet) szerepel, de
nincs odaírva, hogy ez **csak becslés**.
- **Javítás:** jelezzük, hogy tervezett/becsült érték.

---

## 🟢 FEJLESZTÉSI ÖTLETEK — kényelem, jövő

11. **Audit-napló bővítése:** nem minden admin-művelet naplózódik (pl. támogatás-válasz,
    pénzügyi módosítás). A visszakövethetőséghez (ki, mikor, mit) érdemes lenne.
12. **Eszközök:** szűrő (csak aktív / összes eszköz).
13. **Frissítések archívum:** legyen kereshető/szűrhető (típus, dátum).
14. **Funkciók ablak:** egy „Szerkesztés" gomb, ami egyből a szerepkör-szerkesztőt nyitja.
15. **Veszélyes zóna / törlési előzmények:** lapozás, ha sok van.

---

## 🔒 BIZTONSÁGI ÁTGONDOLANDÓ (alaposan körüljárandó)

### 16. Az „egyházkerületi admin" hatóköre ⚠️
Jelenleg, ha egy egyházkerületi admin eljut egy veszélyes művelethez (import, törlés,
adattisztítás), **elvileg bármelyik gyülekezeten** módosíthatna. Érdemes lenne a veszélyes
műveleteket a **saját egyházkerületére/egyházmegyéjére** korlátozni.
- Ez nagyobb, gondos munka — külön át kell beszélni.

---

## Mit NEM találtam hibásnak (megnyugtatásul)
- A **Veszélyes zóna** (adattisztítás) **erős**: kétszintű megerősítés + szerver-oldali
  újra-ellenőrzés. ✅
- A **Támogatás-válasz mentése MŰKÖDIK** (ezt külön ellenőriztem — az egyik vizsgálat
  tévesen jelezte hibásnak). ✅
- A **Rendszer (PIN/biztonság)** rész rendben. ✅

---

## Hogyan tovább?
Kérlek, **menjünk végig a pontokon** — mondd meg, melyiket kéred, melyiket hagyjuk, és
ha valamit másképp képzelsz. Amint minden részletben megegyeztünk, **fontossági
sorrendben** nekiállok (a sürgős sebesség- és jogosultság-pontokkal kezdeném).
