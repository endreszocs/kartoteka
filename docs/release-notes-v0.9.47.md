# Kartotéka v0.9.47 · Felhasználók és szerepkörök egyesítése

*2026. május 3.*

Kedves Endre, kedves Lelkipásztorok!

Ebben a kis frissítésben egyetlen, központi UX-csapdát oldottunk fel az adminisztrátori felületen, és vele együtt rendet raktunk a felhasználók és szerepkörök kezelésében.

## Mi változott?

### Egy oldalra olvadt a Felhasználók és a Szerepkörök modul

Korábban két különálló oldal kezelte ugyanazt a felhasználói listát — két különböző UX-szel. Mostantól egyetlen, egységes oldal — `/admin/felhasznalok` — fogadja az adminisztrátort. A régi `/admin/szerepkorok` URL automatikusan átirányít az új közös oldalra.

### A „jóváhagyás" most már egyértelmű

A korábbi rendszerben, ha az admin a Szerepkörök oldalon szerepkört rendelt egy várakozó (új regisztrált) felhasználóhoz, az illető csak a szerepkör-jelvényt kapta meg, de a fiókja `pending` állapotban maradt. Belépéskor mégis azt látta: *„Fiókja még jóváhagyásra vár"*.

**Mostantól**: ha az admin szerepkört rendel egy várakozó felhasználóhoz, a fiók egyúttal aktiválódik is. A popover tetején figyelmeztető banner jelzi: *„A felhasználó fiókja még nincs aktiválva. A szerepkör hozzáadása aktiválja a fiókot is."*

### A pending-üzenet pasztorálisabb lett

A régi technikai szöveg — *„Fiókja még jóváhagyásra vár a kerületi SzuperAdmin által!"* — átírva pasztorálisra: *„Fiókja még jóváhagyásra vár — a rendszergazda értesítve van. Türelmét kérjük."*

A regisztráció és OAuth-visszaigazolás üzenetei szintén a *rendszergazda* megfogalmazásra vált.

### Most már tényleg megérkeznek az értesítések

Az admin által küldött értesítések („Fiókja jóváhagyva", „Hozzáférése aktiválva") korábban a háttérben silent fail-eltek — a tábla mezőnevei nem stimmeltek. Most rendezve: minden admin-művelet után tényleg odaér az értesítés a felhasználó dashboardjára.

### Audit-napló minden adminisztrátori döntéshez

Minden szerepkör-műveletre — kiosztás, visszavonás, lelkészi jóváhagyás — bekerül a rendszer-naplóba, hogy később vissza lehessen követni *ki, mikor, miért, kinek* osztott vagy vont vissza valamit. A felhasználó-jóváhagyások és törlések szintén auditolva.

### Adminisztrátori jogosultság konzisztens lett

A kerületi adminisztrátorok eddig a felületet ugyan elérték, de minden gomb hibára futott. Most már a felhasználók kezelése konzisztens: a master, az admin és az egyházkerületi admin egyaránt használhatja a felhasználói modult.

## Hátra

A felület az új közös sablonra épült, de a többi rendszergazdai akció (Hozzáférés-kérelmek, Frissítések, Eszközök stb.) belső guard-rendszere még nem egyesített — ez egy következő sprintben kerül sorra.

A teljes Excel-export, a 2-lépcsős szerepkör-popover, a részletes (custom) szerepkör-kiosztás és a részletes jóváhagyás (gyülekezet-választással) mind változatlanul elérhető.

## Köszönöm

Endre, hogy a panaszt rögtön jeleztedhozzám — ez a hiba sok lelkipásztornak okozott volna fájdalmas kalandot. Szelíd vasárnapot, és Isten áldását a következő hét munkájára!
