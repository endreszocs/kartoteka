# Core — Üzleti szabályok: Hitelesítés, Jogosultságok, Munkamenet

---

## 1. Jogosultságok

### Szerepkörök (hierarchikus, felfelé öröklődő)

| Szint | Szerepkör | Ki kapja? | Mit lát? |
| ----- | --------- | --------- | -------- |
| 1 | **lelkesz** | Minden regisztrált, jóváhagyott lelkész | Saját gyülekezete összes modulja |
| 2 | **esperes** | Egyházmegyei vezető | Szint 1 + Egyházmegyei összesítő dashboard |
| 3 | **egyhazmegyei_admin** | Egyházmegyei adminisztrátor | Ugyanaz mint esperes (azonos jogkör) |
| 4 | **admin** | Kerületi szintű rendszergazda | Szint 1-3 + Kerületi dashboard |
| 5 | **Master Admin** | Egyetlen személy (fejlesztő/rendszergazda) | Szint 1-4 + Admin panel + God Mode |

### Master Admin azonosítás szabálya
- Kizárólag **e-mail cím** alapján azonosítva (nem szerepkör!)
- Egy konkrét e-mail cím van beégetve a rendszerbe
- A Master Admin MINDIG beléphet, akkor is ha a profilja `pending` státuszú
- A Master Admin MINDIG `active`-nak számít, függetlenül a profil státuszától

### Gyülekezet-hozzáférés szabálya
- Minden felhasználó pontosan **egy gyülekezethez** van rendelve (`congregation_id`)
- Gyülekezet nélküli felhasználó → korlátozott hozzáférés (csak kerületi/megyei dashboard, ha a szerepköre megengedi)
- A felhasználó KIZÁRÓLAG a saját gyülekezete adatait látja (adatbázis szinten kikényszerítve)

### Rendszergazda gyülekezet-váltás (Admin Override)
- A Master Admin **más gyülekezet adatait is megtekintheti**, de CSAK:
  - Ha a célgyülekezet lelkésze **előzetesen jóváhagyta** a hozzáférést
  - Ha a jóváhagyás **nem járt le** (időkorlátozott: tipikusan 2-24 óra)
  - Ha a jóváhagyás státusza `approved` az adatbázisban
- A rendszer **minden oldalbetöltésnél** ellenőrzi az engedély érvényességét
- Lejárt engedély → automatikus visszavonás + figyelmeztetés + átirányítás admin oldalra

---

## 2. Szabályok

### Regisztráció
- Regisztrálni CSAK **e-mail + jelszó** kombinációval vagy **Google OAuth**-tal lehet
- **Apple OAuth** jelenleg le van tiltva (a jövőben engedélyezhető)
- Kötelező mezők regisztrációnál: teljes név, telefonszám, gyülekezet neve, e-mail, jelszó
- A jelszónak minimum **6 karakter** hosszúnak kell lennie
- A **Felhasználói Feltételek és Adatvédelmi Tájékoztató** elfogadása kötelező (checkbox)
- OAuth regisztrációnál a név előtöltődik az OAuth provider adataiból, de a telefon és gyülekezet kézi bevitel

### Regisztrációs jóváhagyás
- Minden új regisztrált felhasználó **`pending`** státuszba kerül
- A felhasználó NEM léphet be amíg a kerületi SzuperAdmin **nem hagyja jóvá** (státusz → `active`)
- A Master Admin ez alól kivétel — mindig beléphet
- Jóváhagyás nélküli belépési kísérlet → kijelentkeztetés + "Fiókja még jóváhagyásra vár" üzenet

### Bejelentkezés
- Háromféle belépés: e-mail/jelszó, Google OAuth, Apple OAuth (utóbbi jelenleg tiltva)
- Ha az e-mail nem megerősített → "Erősítse meg az e-mail címét" hibaüzenet
- Ha a jelszó hibás → "Érvénytelen e-mail cím vagy jelszó" (nem árulja el melyik rossz)
- Ha a fiók `pending` → kijelentkeztetés + figyelmeztetés

### Jelszó visszaállítás
- A felhasználó megadja az e-mail címét → a rendszer reset linket küld
- Nem árulja el, hogy az e-mail létezik-e a rendszerben (adatvédelem)

### Kijelentkezés
- Bármely oldalról elérhető (header dropdown)
- Kijelentkezés után → átirányítás a bejelentkezési oldalra
- Ha egy felhasználó **másik böngésző fülön** jelentkezik ki → az összes nyitott fül is átirányít (valós idejű figyelés)

---

## 3. Validációk

### Regisztrációs validációk
| Mező | Szabály |
| ---- | ------- |
| Teljes név | Kötelező, szabad szöveg |
| Telefonszám | Kötelező, szabad szöveg (nincs formátum validáció) |
| Gyülekezet | Kötelező, szabad szöveg (nem dropdown — a jóváhagyáskor rendeli hozzá az admin) |
| E-mail | Kötelező, érvényes e-mail formátum |
| Jelszó | Kötelező, minimum 6 karakter |
| Feltételek | Kötelező checkbox — nem elfogadás esetén hibaüzenet |

### Profil szerkesztési validációk
| Mező | Szabály |
| ---- | ------- |
| Teljes név | Módosítható |
| Születési dátum | Módosítható, opcionális |
| E-mail | NEM módosítható (csak megjelenítés) |

### Gyülekezet szerkesztési validációk
| Mező | Szabály |
| ---- | ------- |
| Magyar név (nev_hu) | Kötelező |
| Román név (nev_ro) | Opcionális |
| Angol név (nev_en) | Opcionális |
| Adószám | Opcionális, szabad szöveg |
| Cím | Opcionális |
| E-mail, telefon, web | Opcionális |
| Éves járulék | Szám, alapértelmezés: 100 |
| Kedvezményes járulék | Szám, alapértelmezés: 0 |
| Járulék határidő | Dátum formátum: HH-NN (pl. 07-01), alapértelmezés: 07-01 |
| IBAN, Bank | Opcionális |
| Tartozás számítási mód | Választás: `akkori` vagy `aktuális` |
| Egyházmegye | Dropdown az adatbázisból (dioceses tábla) |
| Címer | Képfeltöltés (Supabase Storage) |

---

## 4. Korlátozások

### Ki MIT nem tehet
| Korlátozás | Érvényes rá |
| ---------- | ----------- |
| Más gyülekezet adatait NEM láthatja | Minden felhasználó (adatbázis szinten kikényszerítve, nem csak UI) |
| Más felhasználó profilját NEM szerkesztheti | Mindenki (kivéve admin az Admin panelen) |
| Gyülekezet beállításait NEM módosíthatja | Aki nem az adott gyülekezet lelkésze |
| Regisztrációt NEM hagyhat jóvá | Csak admin és Master Admin |
| God Mode-ot NEM aktiválhat | Csak Master Admin |
| Más gyülekezet adataihoz NEM férhet hozzá | Csak Master Admin, és CSAK engedéllyel |

### Időkorlátok
| Elem | Időkorlát |
| ---- | --------- |
| Profil cache | 5 perc (utána újra lekérdez) |
| God Mode | 2 óra (utána automatikus deaktiválás) |
| Admin Override | A lelkész által beállított időtartam (tipikusan 2-24 óra) |
| Session token | Supabase kezeli (1 óra access, 7 nap refresh) |
| Splash screen | 3.5 másodperc, session-ben egyszer jelenik meg |

---

## 5. Workflow szabályok

### Új felhasználó regisztrálásának teljes folyamata
```
1. Lelkész megnyitja a Kartotéka weboldalát
2. Splash screen (3.5 mp) → Login oldal
3. "Regisztráljon" link → Regisztrációs űrlap
4. Kitölti: név, telefon, gyülekezet, e-mail, jelszó
5. Elfogadja a Felhasználói Feltételeket (checkbox)
6. "Regisztráció elküldése" → Supabase auth.signUp
7. Profil sor létrejön: status = "pending"
8. Üzenet: "Várja meg a SzuperAdmin jóváhagyását"
9. [A háttérben: a SzuperAdmin értesítést kap]
10. SzuperAdmin az Admin panelen: status → "active", szerepkör beállítás, gyülekezet hozzárendelés
11. Lelkész újra belép → sikeres bejelentkezés → Dashboard
```

### Google OAuth regisztráció folyamata
```
1. Lelkész rákattint a "Google" gombra
2. Google bejelentkezési ablak → engedélyezés
3. Visszakerül az oldalra → OAuth callback
4. Profil ellenőrzés:
   a) Ha VAN profil + active → Dashboard átirányítás
   b) Ha VAN profil + pending → Kijelentkeztetés + figyelmeztetés
   c) Ha NINCS profil → Kiegészítő adatbekérés (név, telefon, gyülekezet)
5. Kiegészítő adatok kitöltése → profil létrehozás (status: "pending")
6. Kijelentkeztetés + "Várja meg a jóváhagyást"
```

### Bejelentkezés utáni átirányítás (routing)
```
Belépés sikeres:
  ├── VAN gyülekezete → Gyülekezeti dashboard (/pages/dashboard.html)
  ├── Master Admin VAGY admin, NINCS gyülekezet → Kerületi dashboard
  ├── Esperes, NINCS gyülekezet → Egyházmegyei dashboard
  └── Egyéb → Gyülekezeti dashboard (biztonsági tartalék)
```

### Admin Override (rendszergazda gyülekezet-váltás)
```
1. Master Admin az Admin panelen kiválaszt egy gyülekezeteet
2. Hozzáférési kérelem küldése a gyülekezet lelkészének
3. A lelkész valós idejű értesítést kap (csengő)
4. A lelkész jóváhagyja/elutasítja + időtartamot állít be
5. Ha jóváhagyva → Master Admin sessionStorage-ban tárolja a gyülekezet ID-t
6. A rendszer minden oldalbetöltésnél ellenőrzi a jóváhagyás érvényességét
7. Piros banner jelzi: "Engedélyezett hozzáférés — X gyülekezet adatai (Y perc hátra)"
8. Lejárat után → automatikus visszavonás + átirányítás admin oldalra
```

### God Mode aktiválás
```
1. Master Admin a sidebar-ban rejtett menüpontra kattint
2. PIN kód beviteli modal jelenik meg
3. Helyes PIN → 2 órás szuperadmin mód aktiválás
4. UI változások: piros fejléc, figyelmeztető banner, extra gombok (tömeges import, nem-ellenőrzés)
5. 1 perc a lejárat előtt → figyelmeztető modal
6. Lejárat → automatikus deaktiválás + oldal újratöltés
```

---

## 6. Edge case-ek

### Bejelentkezés
| Eset | Mi történik |
| ---- | ----------- |
| A felhasználó egyszerre két böngészőben van bejelentkezve, és az egyikben kijelentkezik | A másik böngészőben is kijelentkezik (onAuthStateChange) |
| A session token lejárt de a refresh token érvényes | A Supabase automatikusan frissíti — a felhasználó nem vesz észre semmit |
| A session token ÉS a refresh token is lejárt (7+ nap inaktivitás) | Következő oldalbetöltésnél redirect a login oldalra |
| A felhasználó közvetlenül URL-t ír be egy védett oldalhoz | Auth Guard ellenőriz → ha nincs session → redirect login |
| A rendszer offline állapotban van | JELENLEGI HIBA: redirect login oldalra (helyesen: offline módba kellene váltani) |

### Regisztráció
| Eset | Mi történik |
| ---- | ----------- |
| A felhasználó már regisztrált e-mail címmel próbál regisztrálni | Supabase hibaüzenet: "User already registered" |
| OAuth regisztráció után a kiegészítő adatokat nem tölti ki, bezárja a böngészőt | Nincs profil sor → legközelebbi bejelentkezéskor újra kéri a kiegészítő adatokat |
| Két felhasználó ugyanazzal az e-mail címmel regisztrál (email/jelszó majd Google OAuth) | Supabase kezeli: ha ugyanaz az email, ugyanaz a user — de profil duplikáció lehetséges |

### Admin Override
| Eset | Mi történik |
| ---- | ----------- |
| A lelkész elfogadja a hozzáférési kérelmet de közben leáll az internet | A Master Admin nem tudja aktiválni az override-ot amíg az internet vissza nem jön |
| A Master Admin override közben a lelkész visszavonja az engedélyt | A következő oldalbetöltésnél a rendszer észleli → override törlés + redirect admin |
| A Master Admin override-dal van bejelentkezve és lejár az engedély | Figyelmeztetés + redirect admin oldal |
| A Master Admin sessionStorage-ban manipulálja a congregation_id-t | Az adatbázis szintű RLS véd — nem tud idegen adatot olvasni a manipulált ID-vel |

### God Mode
| Eset | Mi történik |
| ---- | ----------- |
| A Master Admin bezárja a böngészőt God Mode közben | sessionStorage törlődik → God Mode automatikusan megszűnik |
| A Master Admin God Mode-ban más böngészőt nyit | Nincs God Mode — session-specifikus |
| Valaki kitalálja a PIN-t | Beléphet God Mode-ba — NINCS rate limiting, NINCS brute force védelem |
| God Mode lejárata alatt tömeges importot indít | Az import tovább fut a háttérben, de az UI frissül → a gomb eltűnik |

### Profil/Gyülekezet
| Eset | Mi történik |
| ---- | ----------- |
| A felhasználónak nincs gyülekezete (jóváhagyás után sem rendelték hozzá) | "Várakozás a SzuperAdmin jóváhagyására..." üzenet a header-ben |
| Gyülekezet címer feltöltése sikertelen | A Supabase Storage hibát dob, de a többi mező mentése sikeres |
| A `tartozas_szamitas_mod` oszlop nem létezik az adatbázisban | Retry mechanizmus: a mező nélkül újrapróbálja a mentést |
| Két felhasználó egyszerre szerkeszti a gyülekezet adatait | Last-write-wins — nincs optimistic locking |
