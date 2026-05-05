# Kartotéka v0.8.7 — Welcome wizard átdolgozás + offline kód perszisztencia

**Megjelenés dátuma:** 2026-05-05
**Webes verzió (Railway):** v0.9.51
**Desktop verzió:** v0.8.7

---

## Kedves Lelkipásztorok, Munkatársak!

Egy nagyobb, alapos frissítéssel jelentkezünk. A **beállító varázsló**
(welcome wizard) a több észrevétel alapján alaposan átalakult, és a
**desktop offline belépési kódot** is rendbe tettük — már nem kell
minden frissítés után újra megadni.

## Mit hozott a frissítés?

### 🎨 A beállító varázsló — átláthatóbb, kategorizáltabb

A varázsló minden szakasza külön kártyán szerepel ikonokkal — egyértelmű,
hogy hova mit kell írni. A **gyülekezet elérhetőségei** és a **saját
elérhetőségek** most már külön, jól megkülönböztetett szakaszban vannak,
figyelmeztetéssel.

### 💳 Több bankszámla — nem csak egy!

A gyülekezetnél lehet egy fő RON-számla és egy valutás (EUR) számla? **Igen!**
A varázslóban most "+ Új bankszámla hozzáadása" gombbal annyit vehetsz fel,
amennyi van — minden számlához külön bank, IBAN, valuta, és egyet "fő számla"-ként
megjelölhetsz. Mind a Pénzügy modul saját bankszámla-listájába kerülnek.

### 📜 Szolgálati előzmények — listásan

A korábbi szolgálati helyek mostantól nem egy szövegmezőben, hanem külön
kártyákon szerepelnek. "+ Új szolgálati hely hozzáadása" gombbal bővítheted —
minden helyhez tartozik gyülekezet/intézmény neve, szerep (lelkipásztor,
segédlelkész stb.), kezdő-záró év és megjegyzés.

### 💰 Egyházfenntartási járulék — alaposabb beállítások

A pénzügyi szakasz mostantól sokkal részletesebb:

- **Tartozás-számítási mód:** a régi tartozások az akkori év szerint vagy
  az aktuális év szerint legyenek-e számolva — radio gombbal választható
- **Kedvezményes időszakok:** több early-bird kedvezmény vehető fel
  (pl. március 31-ig 50%, május 31-ig 25%)
- **Kor-alapú kedvezmény (opcionális):** pl. 70 év felettieknek 50%
- **Múlt évek beállításai (opcionális):** 5 visszamenő évre megadható
  alapösszeg + kedvezményes + határidő, hogy a régi tartozások pontosan
  legyenek számolva

### 🗑 A nyitó egyenleg lépés eltávolítva

A "Nyitó kassza" és "Nyitó bank" mezők kikerültek a varázslóból. A pontos
kezdőegyenlegek a Pénzügy modulban állíthatók be — bankszámlánként, valutához
illesztve, nyitóegyenleg-történettel.

### 🔐 Offline belépési kód — már nem felejt

**A nagy újdonság a desktop felhasználóknak:** a "Emlékezz erre a gépre"
checkbox a PIN-bevitel oldalán. Ha bepipálod, a frissítések és újraindítások
után **7 napig nem kell újra megadni a kódot**. A PIN továbbra is titkosítva
van a Windows Credential Manager-ben — csak az "ezen a gépen még érvényes"
flag perzisztálódik.

A jelölés kijelentkezéskor automatikusan törlődik.

### 🆘 "Elfelejtettem a kódot"

Új gomb a PIN-bevitel oldalon. Megerősítés után törli a kódot, és átirányít
az online bejelentkezésre. A sikeres belépés után automatikusan az "Új
belépési kód beállítása" oldalra kerülsz, ahol új kódot adhatsz meg. A
lokális adatok érintetlenek maradnak.

## Frissítés

A Kartotéka asztali kliens **automatikusan** frissül a háttérben.
Indítsd újra az alkalmazást — a v0.8.7 hamarosan települ.

## Egy kérés Endrétől (rendszergazda)

Kérlek, futtasd a `migration-docs/sql/2026-05-05-pastor-service-history-tartozas-mod.sql`
SQL migrációt a Supabase Studio SQL Editorában (új tábla a szolgálati
előzményeknek + új oszlop a tartozás-számítási módhoz).

## Köszönet

Köszönjük a 7 részletes észrevételt — ennyi finomítást egyszerre csak az
alapos visszajelzés után lehet beépíteni. Áldott szolgálatot kívánunk!

— *Kartotéka fejlesztői csapat*
*Erdélyi Református Egyházkerület*
