# Aladár AI Asszisztens + Admin Panel — Üzleti szabályok

---

## 1. Jogosultságok

### Aladár AI

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| AI chat használat | ✅ | ✅ | ✅ | ✅ |

Az AI asszisztens MINDEN bejelentkezett felhasználónak elérhető, szerepkörtől függetlenül. Nincs korlátozás a kérdések számára (csak rate limiting: 2.5 mp szünet kérések között).

### Admin Panel

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Admin panel megnyitása | ❌ | ❌ | ❌ | ✅ (KIZÁRÓLAG) |
| Áttekintés megtekintése | ❌ | ❌ | ❌ | ✅ |
| Gyülekezetek listázása | ❌ | ❌ | ❌ | ✅ |
| Gyülekezet részletek megtekintése | ❌ | ❌ | ❌ | ✅ |
| Admin Override (belépés bármely gyülekezetbe) | ❌ | ❌ | ❌ | ✅ |
| Felhasználó jóváhagyás | ❌ | ❌ | ❌ | ✅ |
| Szerepkör módosítás | ❌ | ❌ | ❌ | ✅ |
| Támogatási jegy válasz | ❌ | ❌ | ❌ | ✅ |
| Adatminőség ellenőrzés | ❌ | ❌ | ❌ | ✅ |
| Tömeges Excel import | ❌ | ❌ | ❌ | ✅ |

Az Admin Panel **KIZÁRÓLAG** a Master Admin számára érhető el. Az azonosítás **e-mail cím** alapján történik (a `.env.local`-ban konfigurált e-mail).

---

## 2. Szabályok

### ALADÁR AI

#### Szolgáltató fallback sorrend

A rendszer **három AI szolgáltatót** használ automatikus fallback rendszerrel:

| Sorrend | Szolgáltató | Modellek | Mikor vált |
|:-------:|-------------|---------|-----------|
| 1. | OpenRouter | minimax/m2.5, stepfun/flash, nemotron | Elsődleges (ingyenes) |
| 2. | Groq | llama-3.3-70b, llama-3.1-8b | Ha az OpenRouter összes modellje kimerül |
| 3. | Gemini | gemini-2.0-flash, gemini-1.5-flash | Ha a Groq is hibázik |

Ha MINDEN szolgáltató és modell kimerül → „Jelenleg nem tudok válaszolni" üzenet.

#### Kérdés osztályozás

A rendszer a kérdéseket három kategóriába sorolja:
- **Üdvözlés** (pl. „Szia", „Jó napot") → barátságos válasz az AI nélkül
- **Rendszer kérdés** (pl. „Hogyan rögzítsek bevételt?") → AI válasz a rendszer-ismeretekkel
- **Off-topic** (pl. „Mi az élet értelme?") → udvariasan áttereli a rendszerrel kapcsolatos kérdésekre

#### Session perzisztencia

- A beszélgetés **oldal-navigálásnál megmarad** (sessionStorage)
- A böngésző fül bezárásakor **törlődik**
- Maximum **10 üzenet** kontextus (régebbiek kiesnek)

#### Figyelemfelkeltés

- **3 perc inaktivitás** → gondolat-buborék animáció: „Miben segíthetek?"
- **10 mp** az első oldal betöltés után → üdvözlő üzenet
- **1 óra** → bátorító üzenet
- **2 óra** → elismerő üzenet
- A figyelemfelkeltés **óránként egyszer** jelenik meg (localStorage rate limit)

### ADMIN PANEL

#### Felhasználó jóváhagyás szabályai

1. Minden új regisztrált felhasználó **pending** státuszba kerül
2. A Master Admin az Admin Panelen keresztül hagyja jóvá
3. Jóváhagyáskor:
   - Az admin kiválaszt egy **egyházmegyét**
   - Ha a gyülekezet nem létezik → a rendszer **automatikusan létrehozza**
   - A felhasználó státusza **active**-ra változik
   - A felhasználó **értesítést kap** a jóváhagyásról
4. Jóváhagyás nélkül a felhasználó **NEM léphet be**

#### Szerepkör módosítás

A Master Admin a következő szerepköröket állíthatja be:
- **lelkesz** — alap szint (saját gyülekezet)
- **esperes** — egyházmegyei szint
- **egyhazmegyei_admin** — egyházmegyei admin (= esperes jogokkal)
- **admin** — kerületi szint

A szerepkör módosítás **azonnali** — a felhasználónak nem kell újra bejelentkeznie.

#### Adatminőség ellenőrzés

A rendszer a következő hibákat keresi a `szemely` táblában:
- **Hiányzó CNP** (személyi szám) — a családfa-összekötés nem működik nélküle
- **Ismeretlen nem** (ferfi = null) — a statisztikák pontatlanok lesznek
- **Hiányzó születési dátum** — a kor-alapú számítások nem működnek

Az eredmények **gyülekezetenként** bontva jelennek meg + összesítés.

#### Tömeges import szabályok

Minden import típusra érvényes:
- **100 rekordos batch-ek** — az adatbázis terhelés korlátozása
- **Duplikáció védelem** — `xkey` generálás (bevételnél) vagy meglévő rekord ellenőrzés
- **Multi-formátum dátum parsing** — 6+ formátumot ismer (Excel serial, ISO, DD.MM.YYYY, stb.)
- **Előnézet** — az import előtt a felhasználó áttekintheti az adatokat

---

## 3. Validációk

### AI

| Mező | Szabály |
|------|---------|
| Üzenet szöveg | Nem üres |
| Rate limit | Minimum 2500ms kérések között |
| API kulcs | Legalább 1 szolgáltató konfigurálva kell legyen |

### Admin — Felhasználó jóváhagyás

| Mező | Szabály |
|------|---------|
| Egyházmegye | **Kötelező** a jóváhagyáskor |
| Felhasználó státusz | `pending` → `active` (nem visszafordítható ezen az úton) |

### Admin — Szerepkör módosítás

| Mező | Szabály |
|------|---------|
| Szerepkör | **Kötelező** (lelkesz/esperes/egyhazmegyei_admin/admin) |
| Felhasználó | Aktív státuszú kell legyen |

### Admin — Bevétel import

| Mező | Szabály |
|------|---------|
| Összeg | Pozitív szám (≤ 0 → kihagyás) |
| Dátum | Érvényes dátum (6+ formátum) |
| Kategória kód | Érvényes befizetescel kód (szamadasicel-ben létezik) |
| Személy | Opcionális — fuzzy név-párosítás ha megadva |

### Admin — Munkanapló import

| Mező | Szabály |
|------|---------|
| Dátum | **Kötelező**, érvényes |
| Kategória | **Kötelező** (szolgalat/katekezis/latogatas) |
| Hivatalos EREK sablon | 3 munkalap: Szolgálati_alkalmak, Katekézis, Családlátogatás |
| Egyedi Excel | Fejléc-alapú mezőpárosítás szükséges |

### Admin — Keresztelés import

| Mező | Szabály |
|------|---------|
| Személy név | **Kötelező** |
| Dátum | **Kötelező** |
| Személy párosítás | Fuzzy név + dátum egyezés a szemely táblával (manuális felülbírálás lehetséges) |

### Admin — Iktatás import

| Mező | Szabály |
|------|---------|
| Iktatószám | **Kötelező** (formátum: `{sorszám}/{év}` pl. `42/2024`) |
| Dátum | **Kötelező** |
| Irány | Érkező / Kimenő |

---

## 4. Korlátozások

### AI

- **Rate limiting:** 2500ms szünet kérések között (a felhasználó nem spammelhet)
- **Kontextus ablak:** utolsó 10 üzenet (régebbiek elvesznek)
- **Max válasz:** 1800 token (~1200-1400 magyar szó)
- **API kulcsok szerveren:** a Next.js-ben a kulcsok `.env.local`-ban vannak, NEM a kliens-kódban
- **Session-szintű:** a beszélgetés a böngésző fül bezárásakor elvész

### Admin Panel

- **KIZÁRÓLAG Master Admin** — más szerepkörrel nem érhető el
- **Import batch méret:** 100 rekord egyszerre (adatbázis terhelés korlátozás)
- **Személy párosítás:** fuzzy — nem 100%-os, manuális felülbírálás szükséges lehet
- **Jóváhagyás:** egyirányú (pending → active, nem vonható vissza az Admin Panelen — csak direkt adatbázis módosítással)
- **Támogatási jegy:** lezárt jegy nem nyitható újra

---

## 5. Workflow szabályok

### AI — Üzenet küldés

```
1. A felhasználó begépeli a kérdést
2. Rate limit ellenőrzés (2500ms az utolsó kérdés óta)
3. Kérdés osztályozás:
   a) Üdvözlés → helyi válasz (nincs API hívás)
   b) Rendszer/off-topic → API hívás a fallback láncban
4. API hívás a fallback sorrendben:
   — OpenRouter: modell 1 → 2 → 3
   — Ha mind hibázik → Groq: modell 1 → 2
   — Ha az is hibázik → Gemini: modell 1 → 2
5. A válasz Markdown-ként renderelődik
6. A beszélgetés sessionStorage-ba mentődik
```

### Admin — Felhasználó jóváhagyás

```
1. Master Admin az Admin Panelen a „Felhasználók" fülre navigál
2. A függő regisztrációk listája megjelenik
3. Az admin kiválaszt egy felhasználót
4. Egyházmegye kiválasztás (dropdown)
5. „Jóváhagyás" gomb
6. A rendszer:
   — Ha a gyülekezet nem létezik → INSERT congregations
   — UPDATE profiles: status='active', congregation_id, diocese_id
   — INSERT ertesitesek: „Fiókja jóváhagyásra került"
7. A felhasználó bejelentkezhet
```

### Admin — Gyülekezet belépés (Admin Override)

```
1. Master Admin a „Gyülekezetek" fülön egy gyülekezetet választ
2. „Belépés" gomb
3. A rendszer:
   — INSERT admin_access_requests (status: 'approved', expires_at: +24h)
   — A session-ben tárolt gyülekezet ID megváltozik
4. A Master Admin az adott gyülekezet adatait látja (Dashboard, Tagnyilvántartás, stb.)
5. Az override banner jelenik meg: „Engedélyezett hozzáférés — X gyülekezet"
6. Lejárat vagy kilépés → visszatérés az admin panelre
```

### Admin — Tömeges bevétel import

```
1. Master Admin az „Import" fülön a „Bevétel (Kassza)" alfülre navigál
2. Gyülekezet kiválasztás (dropdown)
3. Excel fájl feltöltés
4. A rendszer elemzi a fájlt:
   — Fejléc felismerés (oszlop nevek → mező párosítás)
   — Dátum formátum konverzió
   — Összeg parsing (vessző → pont, szóközök eltávolítás)
5. Előnézet: a felhasználó áttekinti a párosított adatokat
6. „Import végrehajtás" gomb
7. 100 rekordos batch-ekben INSERT befizetes
8. Eredmény: „X rekord importálva, Y személy párosítva, Z kihagyva"
```

### Admin — Adatminőség ellenőrzés

```
1. Master Admin a „Minőség" gombra kattint
2. A rendszer végigfut az összes gyülekezet összes tagján
3. Ellenőrzi:
   — CNP hiányzik?
   — Nem (ferfi) hiányzik?
   — Születési dátum hiányzik?
4. Az eredmény gyülekezetenként jelenik meg:
   — Gyülekezet neve + hibák száma (CNP / nem / dátum)
   — Összesítő sor
```

---

## 6. Edge case-ek

### AI

| Eset | Mi történik |
|------|-------------|
| Nincs egyetlen API kulcs sem konfigurálva | Az AI widget **nem jelenik meg** |
| Minden szolgáltató rate limit-be ütközik | „Jelenleg nem tudok válaszolni. Kérem, próbálja néhány perc múlva." |
| A felhasználó gyorsan egymás után küld üzeneteket | Rate limit: a küldés gomb letiltódik 2.5 másodpercre |
| Nagyon hosszú kérdés (>500 karakter) | A rendszer elküldi, de a kontextus ablak szűkül (max 10 üzenet) |
| Off-topic kérdés (pl. „Mi az élet értelme?") | Az AI udvariasan áttereli: „Szívesen segítek a Kartotéka használatában..." |
| A session lejár (böngésző fül bezárás) | A beszélgetés elvész — nincs hosszú távú mentés |
| Hálózati hiba az API hívás közben | A fallback rendszer a következő szolgáltatót próbálja — ha mind hibázik: hibaüzenet |
| A lelkész neve nem lekérdezhető | Az üdvözlés név nélkül jelenik meg: „Jó napot kívánok!" |

### Admin — Felhasználók

| Eset | Mi történik |
|------|-------------|
| Jóváhagyás: a felhasználó e-mail címe nem egyedi | A Supabase Auth kezeli — nem fordulhat elő (az auth regisztrációnál szűri) |
| Jóváhagyás: az egyházmegye nem létezik | A dropdown a meglévő egyházmegyékből tölt — nem fordulhat elő |
| Jóváhagyás: a gyülekezet már létezik | NEM hoz létre új gyülekezetet — a meglévőhöz rendeli a felhasználót |
| Szerepkör módosítás: a felhasználó éppen be van jelentkezve | A szerepkör azonnal érvényesül — de a sidebar NEM frissül automatikusan (következő oldalbetöltésnél) |
| Felhasználó deaktiválás | NEM implementált az Admin Panelen — csak direkt DB módosítás |

### Admin — Import

| Eset | Mi történik |
|------|-------------|
| Excel fájl: nem xlsx formátum | Hiba: „Nem támogatott fájlformátum" |
| Excel: üres munkalap | „Nincs importálható adat" |
| Excel: ismeretlen fejléc oszlopok | A párosítás modal megnyílik — a felhasználó manuálisan rendeli hozzá |
| Bevétel: összeg ≤ 0 | A sor kihagyásra kerül (nem hiba — csendben skip) |
| Bevétel: személy nem párosítható | A sor importálódik `id_szemely = null`-lal (később párosítható az audit-ban) |
| Munkanapló: nem EREK sablon | „Egyedi Excel" mód → fejléc-alapú párosítás |
| Keresztelés: a személy nem található | „Nem párosított" jelölés → a felhasználó manuálisan választ |
| Import: 1000+ rekord | 100-as batch-ekben fut → progress jelzés |
| Import: adatbázis hiba egy batch-nél | A hiba batch nem importálódik, a többi igen → részleges import |

### Admin — Támogatás

| Eset | Mi történik |
|------|-------------|
| Jegy lezárás: a felhasználó újra ír | NEM nyitja újra a jegyet — új jegy keletkezik |
| Válasz küldés: üres szöveg | Validáció blokkolja |
| Válasz küldés: a felhasználó időközben törlődött | A válasz mentődik, de az értesítés nem kézbesíthető (a felhasználó nem létezik) |

### Admin — Adatminőség

| Eset | Mi történik |
|------|-------------|
| Nincs egyetlen hiba sem | „Gratulálunk! Minden rendben!" üzenet |
| 10.000+ tag ellenőrzése | Lassabb lehet — nincs progress jelzés |
| Gyülekezet nincs egyetlen taggal sem | Nem jelenik meg a listában (kihagyva) |
