# Tagnyilvántartás — Üzleti szabályok

---

## 1. Jogosultságok

### Ki mit lát

- A lelkész KIZÁRÓLAG a saját gyülekezetéhez tartozó tagokat, családokat, presbitereket és körzeteket látja
- Adatbázis szinten kikényszerített szeparáció (RLS) — nem felületi szűrés
- Master Admin Admin Override módban más gyülekezet tagnyilvántartását is megtekintheti

### Ki mit tehet

| Művelet | Lelkész | Esperes | Admin | Master Admin |
|---------|:-------:|:-------:|:-----:|:------------:|
| Tagok megtekintése | saját gyül. | saját gyül. | saját gyül. | bármelyik (override) |
| Tag felvétele | ✅ | ✅ | ✅ | ✅ |
| Tag szerkesztése | ✅ | ✅ | ✅ | ✅ |
| Tag kivezetése (elhunyt/elköltözött/kitért) | ✅ | ✅ | ✅ | ✅ |
| Tag végleges törlése | ✅ (korl.) | ✅ (korl.) | ✅ (korl.) | ✅ (korl.) |
| Család CRUD | ✅ | ✅ | ✅ | ✅ |
| Presbiter CRUD | ✅ | ✅ | ✅ | ✅ |
| Körzet CRUD | ✅ | ✅ | ✅ | ✅ |
| Választói névjegyzék zárolás | ✅ | ✅ | ✅ | ✅ |
| Névjegyzék zárolás feloldás | ❌ | ✅ (esperes) | ✅ | ✅ |
| Nem-ellenőrzés (tömeges) | ❌ | ❌ | ❌ | ✅ (God Mode) |
| Tömeges Excel import | ❌ | ❌ | ❌ | ✅ (God Mode) |

### Törlés korlátozása

- Ha egy taghoz pénzügyi tranzakció (bevétel) tartozik → NEM törölhető véglegesen, csak elrejthető
- Ha egy taghoz anyakönyvi bejegyzés (keresztelés, konfirmáció, temetés) tartozik → a bejegyzések is törlődnek a taggal együtt (ha a felhasználó jóváhagyja)
- Ha egy taghoz munkanapló-bejegyzés tartozik → rákérdez: törölje-e a szolgálatokat is

---

## 2. Szabályok

### Személy státuszok

Egy személy a rendszerben az alábbi státuszok egyikébe tartozik:

| Státusz | Mit jelent | Megjelenik a listában? |
|---------|-----------|----------------------|
| **Aktív** | Élő, református (vagy fizetett), nem költözött el | Alapértelmezetten IGEN |
| **Elhunyt** | `meghalt = true` | Csak „Elhunyt" szűrővel |
| **Elköltözött** | `elkoltozott = true` | Csak „Elköltözött" szűrővel |
| **Kitért** | `member_status = 'kitért'` | Csak „Kitért" szűrővel |
| **Törölt** | `member_status = 'törölt'`, `isvisible = false` | Soha (elrejtve) |
| **Más vallású** | Vallás ≠ református ÉS nem fizetett | Csak „Más vallású" szűrővel |

### Aktív tag definíció (alapértelmezett nézet)

Aktív gyülekezeti tag az, aki:
- NEM elhunyt ÉS NEM elköltözött ÉS NEM kitért ÉS NEM törölt
- ÉS (a vallása református VAGY a vallás mező üres VAGY egyházfenntartást fizetett az idei évben)

A más vallásúak alapból ki vannak szűrve, KIVÉVE ha fizetnek egyházfenntartást — akkor egyháztagnak számítanak.

### Fizetési státusz számítás

Egy tag fizetési státusza badge formában jelenik meg:

1. Ha **elhunyt** → „Elhunyt" (sötét badge)
2. Ha **elköltözött** → „Elköltözött" (szürke badge)
3. Ha **kitért** → „Kitért" (sárga badge)
4. Ha **felmentett** (felmentes tábla, aktuális év az érvényességi tartományban) → „Felmentett" (sárga + pajzs ikon)
5. Ha **fizetett** (befizetes tábla, aktuális évre) → „Rendezve" (zöld + pipa ikon)
6. Egyébként → **„Hátralékos"** (piros badge)

A fizetés személyi ÉS családi szinten is ellenőrzött — ha a család fizetett, az összes családtag is „Rendezve" státuszú.

### Név-formázás szabálya

A személynevek megjelenítésekor prefix-ek fűződnek a név elé (ebben a sorrendben):
1. `elv.` — ha az állapot „elvált"
2. `özv.` — ha az állapot „özvegy" VAGY ha a házastársa elhunyt
3. Egyéni prefix (namepattern mező) — pl. „Nt.", „Dr.", „id.", „ifj."

Példa: `özv. Nt. Kovács Mária`

### Személyi szám (CNP) generálás

- Ha a személynek nincs valódi személyi száma (CNP) → a rendszer generál egyet: `999` + 7 véletlenszám
- Ez a szám nem valódi CNP, csak belső azonosító
- A családfa-összekötés erre a CNP-re épül (`id_apja` és `id_anyja` mezőkben a szülő CNP-je van tárolva)

### Automatikus család létrehozás (tag mentéskor)

Ha egy új tagnak szülőt adunk meg:
1. A rendszer megkeresi a szülőket a CNP alapján
2. Megnézi, van-e már család ezzel a szülőpárossal
3. Ha NINCS → automatikusan létrehoz egy családot a gyermek lakcímén
4. A gyermeket beregisztrálja a családba (gyerek tábla)
5. Ha MÁR VAN → a gyermeket a meglévő családba regisztrálja (nem hoz létre újat)

### Település és utca dinamikus létrehozás

- Ha a megadott település nincs az adatbázisban → automatikusan létrehozza (nincs confirm kérdés a tag mentésnél)
- Ha a megadott utca nincs az adott településen → automatikusan létrehozza
- A szülő gyorsrögzítésnél viszont confirm ablak kérdezi meg, hogy létrehozza-e

### Koreloszlás csoportok

Az áttekintés 11 korcsoportot használ (a dashboard-tól eltérően):

| Korcsoport | Elnevezés |
|-----------|-----------|
| 0–6 | Kisgyermek |
| 7–12 | Gyermek |
| 13–14 | Serdülő |
| 15–18 | Ifjú |
| 19–30 | Fiatal felnőtt |
| 31–40 | Felnőtt |
| 41–65 | Középkorú |
| 66–75 | Idős |
| 76–80 | Agg |
| 81–100 | Matuzsálem |
| 100+ | Százéves+ |

### Nem-felismerés heurisztika

A rendszer magyar keresztnév alapján találgatja a nemet:
- Ha a név `a` vagy `e` betűre végződik → **nő**
- Egyébként → **férfi**
- Kivétel lista (férfi nevek amelyek `a`/`e`-re végződnek): Béla, Árpád, Attila, Géza, stb.

---

## 3. Validációk

### Tag felvétel / szerkesztés

| Mező | Szabály |
|------|---------|
| Családnév (csaladnev) | Kötelező |
| Keresztnév (k_nev) | Kötelező |
| Nem (ferfi) | Kötelező, true/false |
| Születési dátum | Opcionális |
| Település | Kötelező (alapértelmezés: „Ismeretlen") |
| Utca | Kötelező (alapértelmezés: „Ismeretlen") |
| Házszám | Kötelező (alapértelmezés: „1") |
| Vallás | Kötelező (alapértelmezés: „Református") |
| Többi mező | Opcionális |

### Belépés oka

| Típus | Kötelező extra mezők |
|-------|---------------------|
| Alap (helyi) | Nincs extra |
| Beköltözött | Dátum, honnan (település), igazolás |
| Áttért | Dátum, korábbi felekezet, honnan |

### Tag kivezetés

| Típus | Kötelező mezők |
|-------|---------------|
| Elhunyt | Halál dátuma (kötelező), temetés dátuma (kötelező), halál helye, temetés helye, halál oka, lelkész neve, munkanapló checkbox |
| Elköltözött | Dátum (alapértelmezés: ma), hová (település), külföldre checkbox, megjegyzés |
| Kitért | Dátum (alapértelmezés: ma), új felekezet (kötelező), hová, megjegyzés |
| Törlés | Megerősítő dialógus |

### Család

| Mező | Szabály |
|------|---------|
| Férj (id_ferfi) | Opcionális — de legalább férj VAGY feleség kötelező |
| Feleség (id_no) | Opcionális — de legalább férj VAGY feleség kötelező |
| Gyerekek | Opcionális, 0 vagy több |
| Cím | A kiválasztott fél (férj/feleség) lakcíméből töltődik |

A férj dropdown-ban csak **egyedülálló férfiak** jelennek meg (akik még nincsenek másik családban).
A feleség dropdown-ban csak **egyedülálló nők** jelennek meg.
A gyerekek dropdown-ban csak **családhoz nem rendelt** tagok jelennek meg.

### Presbiter

| Mező | Szabály |
|------|---------|
| Személy | Kötelező — élő, aktív tagok közül választható |
| Tisztség | Opcionális, szabad szöveg (alapértelmezés: „Presbiter") |
| Körzet | Opcionális — a meglévő körzetek közül |

### Körzet

| Mező | Szabály |
|------|---------|
| Név | Kötelező |
| Aktív | Boolean (alapértelmezés: true) |

### Választói névjegyzék

A választók listájába az kerül, aki:
1. 18 éves vagy idősebb
2. Élő (nem elhunyt)
3. Aktív (isvisible = true)
4. Egyházfenntartói járulékot (101.01 kód) fizetett legalább az előző évre

---

## 4. Korlátozások

### Tag törlés

- Ha van pénzügyi tranzakció (befizetes) a tag nevén → NEM törölhető, csak **elrejthető** (`isvisible = false`, `member_status = 'törölt'`)
- Ha az RLS policy blokkolja a törlést → fallback: elrejtés
- Ha van csatolt anyakönyvi bejegyzés → a bejegyzések is törlődnek (ha a felhasználó jóváhagyja)
- Ha van csatolt munkanapló → rákérdez, törölje-e

### Család korlátok

- Egy személy egyszerre csak **egy családban** lehet férjként vagy feleségként
- Egy személy egyszerre csak **egy családba** lehet gyermekként regisztrálva
- Férfi csak férjként, nő csak feleségként választható (nem felcserélhető)

### Presbiter korlátok

- Egy személy több körzetnek is presbiter lehet (de a jelenlegi implementáció csak egyet tárol — szerkesztéskor a korábbi bejegyzések törlődnek és újak jönnek létre)

### Körzet törlés

- Körzet törlésekor a hozzárendelt presbiteri bejegyzések is törlődnek
- A körzet-család kapcsolatok nullázódnak (a családok „körzet nélküliekké" válnak)

### Választói névjegyzék zárolás

- A zárolás után a névjegyzék nem módosítható
- A zárolás feloldásához esperes jogosultság szükséges

---

## 5. Workflow szabályok

### Új tag felvétel teljes folyamata

```
1. Lelkész megnyomja az „+ Új tag" gombot
2. A pre-screen jelenik meg: 3 belépési ok közül választ
   a) Alap (helyi gyülekezeti tag)
   b) Beköltözött (más gyülekezetből érkezett)
   c) Áttért (más felekezetből érkezett)
3. Az űrlap megnyílik 3 fülön:
   - Személyes (név, nem, dátum, cím, telefon, szülők)
   - Anyakönyvi (keresztelés, konfirmáció adatok — opcionális)
   - Pénzügyi (fizető/felmentett — csak ha 18+ éves)
4. Ha a szülő mezőbe 3+ karakter → okos kereső indul
   - Név + kor + lakcím jelenik meg a találatoknál
   - Kattintás → kiválasztás (CNP mentés háttérben)
   - Ha nincs találat → „Gyorsrögzítés" gomb → szülő form (modal-ban modal)
5. Mentés gombra kattint
6. A rendszer:
   - Település + utca létrehozása ha nincs az adatbázisban
   - CNP generálás (ha nincs)
   - Személy INSERT az adatbázisba
   - Ha szülő van megadva → automatikus család létrehozás + gyerek regisztráció
   - Keresztelés/konfirmáció INSERT (ha kitöltve)
   - Ha felmentett → felmentes INSERT
7. Lista frissül, toast üzenet
```

### Tag kivezetése (4 mód)

```
1. Lelkész a „Kivezetés" gombra kattint a tag sorában
2. A kivezetés modal megnyílik a személy nevével
3. 4 lehetőség közül választ:
   a) Elhunyt → temetés adatok kitöltése (halál + temetés dátum kötelező)
                → temetes tábla INSERT + szemely.meghalt = true
   b) Elköltözött → dátum, céltelepülés, külföld checkbox
                   → elkoltozott tábla INSERT + szemely.elkoltozott = true
   c) Kitért → dátum, új felekezet, céltelepülés
             → kitert tábla INSERT + szemely.member_status = 'kitért'
   d) Törlés → megerősítés
             → ha van pénzügyi tranzakció → elrejtés
             → ha nincs → csatolt adatok törlése + szemely DELETE
             → ha RLS blokkolja → elrejtés
4. Lista frissül (a memóriában élő tömbben is frissül, nem kell újralekérdezés)
```

### Családfa megjelenítés

```
1. Tag kartoték modal megnyílik
2. A modal 'shown' eseményekor indul a családfa betöltés
3. A rendszer CNP alapján megkeresi:
   a) Az apa szüleit (nagyszülők) — max 2 generáció felfelé
   b) Az anya szüleit (nagyszülők)
   c) A házastársat (csalad táblából)
   d) A saját gyermekeit (gyerek + csalad táblából)
   e) A testvéreit (ugyanaz a szülői család)
4. FamilyTree.js rendereli a vizualizációt
5. Ha 1 vagy kevesebb node → „Nincs adat" üzenet
```

### Körzet-család hozzárendelés

```
1. A körzet melletti „Családok" gombra kattint
2. A modal megnyílik az összes családdal
3. Automatikus egyezés jelzés (korzetfilter tábla alapján):
   — ha a család utcája és házszáma beleillik a körzet szűrőjébe → „Cím alapján ide tartozik"
4. Automatikus hozzárendelés ajánlat: „X család cím alapján ebbe a körzetbe tartozna"
5. Egyéni hozzárendelés: család sorában „Hozzárendel" gomb
6. Eltávolítás: „X" gomb a hozzárendelt család mellett
```

### Választók névjegyzéke

```
1. A rendszer lekérdezi az összes 18+ éves, élő, aktív tagot
2. Ellenőrzi, hogy az előző évre fizettek-e egyházfenntartói járulékot (101.01 kód)
3. A fizetők listája = választói névjegyzék
4. Szűrhető: körzet, nem, járulékfizetés éve
5. Zárolható: a zárolás után nem módosítható
6. Feloldás: csak esperes jogosultsággal
7. Nyomtatható: PDF/HTML formátumban
```

---

## 6. Edge case-ek

### Személyek

| Eset | Mi történik |
|------|-------------|
| Tag nincs születési dátuma | A kor „-"-ként jelenik meg. Az áttekintésben nem számít a korcsoportba. |
| Tag vallása üres | Reformátusnak számít (aktív tag). |
| Tag más vallású de fizet | Aktív tagként jelenik meg (a fizetés felülírja a vallás-szűrőt). |
| Tag elhunyt ÉS elköltözött | Mindkét szűrő kizárja — csak az egyikben jelenik meg (meghalt elsőbbséget kap a badge-ben). |
| Tag pénzügyi tranzakcióval, törlés | Nem törlődik fizikailag — `isvisible = false`, „Sikeresen elrejtette" üzenet. |
| Tag anyakönyvi bejegyzésekkel, törlés | Rákérdez: a szolgálatokat is törölje-e. Bejegyzések (keresztelés, konfirmáció, stb.) mindenképp törlődnek. |
| Tag RLS blokkolja a törlést | Fallback: elrejtés (`isvisible = false`). Tájékoztató üzenet a felhasználónak. |
| Szülő kereséskor nincs találat | „Gyorsrögzítés" gomb jelenik meg → helyben rögzítheti a szülőt. |
| Szülő gyorsrögzítés: település nem létezik | Confirm dialog: „Kívánja rögzíteni a szótárba?" → ha igen, létrehozza. |
| Anyakönyvből jöttünk, tag mentés sikeres | Automatikus visszatérés az anyakönyvi modalba + személy kiválasztás. |
| CNP duplikáció | A generált CNP `999XXXXXXX` formátumú — elméletileg lehetséges duplikáció, de a valószínűsége nagyon alacsony (1/10 millió). |

### Családok

| Eset | Mi történik |
|------|-------------|
| Család férj nélkül | Megengedett — a férj mező „-"-ként jelenik meg. (Pl. egyedülálló anyák.) |
| Család feleség nélkül | Megengedett — a feleség mező „-"-ként jelenik meg. (Pl. özvegy férfiak.) |
| Család gyerek nélkül | Megengedett — a gyermekek szekció üres. |
| Családtag törlésekor a család üres marad | A család megmarad az adatbázisban (nem törlődik automatikusan). |
| Két család azonos szülőkkel | Megelőzve: a dropdown-ból kiszűrődnek a már családhoz rendelt személyek. |
| Házastárs elhunyt | A másik fél `özv.` prefix-et kap a nevében. |
| Mindkét házastárs elhunyt | A család megmarad, de az áttekintésben nem számít aktívnak. |

### Körzetek

| Eset | Mi történik |
|------|-------------|
| Körzet törlése hozzárendelt családokkal | A családok `id_csoport = null`-ra állnak — „körzet nélkülivé" válnak. |
| Körzet törlése presbiteri bejegyzésekkel | A presbiteri bejegyzések törlődnek. |
| Család körzet nélkül | A „Körzet nélküliek" sávban jelenik meg, ahol egyénileg vagy tömegesen hozzárendelhető. |
| Személy család nélkül, körzethez rendelés | Nem lehetséges — a körzet családokhoz van rendelve, nem személyekhez. Előbb családba kell sorolni. |

### Választók

| Eset | Mi történik |
|------|-------------|
| Tag 18 éves de nem fizetett | NEM jelenik meg a választók listájában (járulékfizetés szükséges). |
| Tag 17 éves és fizetett | NEM jelenik meg (18 év alattiak kiszűrődnek). |
| Tag fizetett de elhunyt | NEM jelenik meg (meghalt = true kiszűri). |
| Tag fizetett de kitért | NEM jelenik meg (isvisible check + member_status). |
| Zárolás utáni módosítás | Nem lehetséges — a zárolás megakadályozza. |
| Zárolás feloldás kérelem | Az esperes kapja a kérelmet — ő oldja fel. |

### Tömeges import

| Eset | Mi történik |
|------|-------------|
| Duplikált rekordok az Excel-ben | Duplikáció felismerés: meglévő rekordok kiszűrődnek a mentés előtt. |
| 500+ rekord | Chunk-olva mentődik (500 rekordos csomagokban). |
| Excel oszlopok nem egyeznek a mezőkkel | Mező-mappálás UI: a felhasználó manuálisan párosítja. |
| Excel dátum formátum (szám) | Automatikus konverzió: Excel serial number → ISO dátum. |

### Nem-ellenőrzés

| Eset | Mi történik |
|------|-------------|
| Minden tag neme ki van töltve | „Minden aktív tag esetén meg van adva a nem!" üzenet. |
| „Ne módosítsa" opció kiválasztva | Az adott tag kimarad a mentésből. |
| Heurisztika hibás tippet ad | A felhasználó felülírhatja a dropdown-ból (férfi/nő/ne módosítsa). |
