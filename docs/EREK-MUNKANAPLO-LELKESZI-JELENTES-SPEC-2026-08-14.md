# EREK digitális munkanapló + lelkészi jelentés — hivatalos specifikáció

**Forrás:** `Munkanaplo_Lelkeszi jelentes.xlsx` (a felhasználó által 2026-08-14-én átadott hivatalos EREK űrlap)
**Kivonatolta:** gépi elemzés (openpyxl) — a munkalapok, képletek, legördülők és a két súgólap teljes átolvasásával.

Ez a dokumentum a 18. pont (munkanapló + nyomtatható lelkészi jelentés) **kötelező tartalmi minimuma**.
A Kartotékában megjelenő adatok ennél **több** lehetnek (előző évek statisztikái, grafikonok, következtetések),
de **kevesebb nem**.

---

## 0. Jogi alap és határidők

| Rendelkezés | Tartalom |
|---|---|
| **Igazgatótanács 66/2023.** | 2024. január 1-től kötelező a digitális munkanapló az EREK egyházközségeiben. „A munkanaplóba kerül **minden** lelkipásztori szolgálat, amit egyházközségünkben végzünk, mi, vagy a vendég, beszolgáló, meghívott lelkipásztor, szolgálati körök szerint." |
| **Igazgatótanács 65/2025.** (2025. október 8-i ülés) | Az **új lelkészi jelentés űrlap** elfogadása. **2026-tól kötelező.** |

**Kritikus következmény:** a 2026-os lelkészi jelentés **magába foglalja** a
lélekszámjelentést, az építési-javítási jelentést és a diakóniai jelentést —
ezeket **külön nem kell elkészíteni, leadni**.

**Új fejezetek** a korábbi jelentéshez képest:
- **IV. Belmissziós tevékenységek**
- **VI. Szeretetszolgálat**
- **VIII. Ingatlanok**

Az űrlap két változatban létezik: egyszerű űrlapként, és **egybeépítve a digitális munkanaplóval**.
A Kartotékának a **második** változatot kell megvalósítania: a munkanapló adataiból automatikusan
áll elő a jelentés nagy része.

---

## 1. A munkabizonylat szerkezete (3 + 2 munkalap)

| Munkalap | Szerep |
|---|---|
| `Szolgalati_alkalmak` | Istentiszteletek, bibliaórák, kazuáliák — a fő napló |
| `Katekezis` | Vallásóra, konfirmációi felkészítő, gyermek-istentisztelet |
| `Csaladlatogatas` | Család- és beteglátogatás |
| `Adatlap` | Kézi adatbevitel **10 év** oszlopaival (C..L = év1..év10) |
| `Jelentes` | Read-only, nyomtatható kimenet; fejlécen évszám vagy „összesítő" választható |

**Mindhárom naplólapon kötelező:** dátum + a szolgálat jellege.
A többi oszlop kitöltése is kötelező (hagyományos munkanapló-hűség), de a
**jelentésbe csak** a dátum, a jelleg, a de./du. és a résztvevőszám kerül be.

---

## 2. `Szolgálati alkalmak` — oszlopok

| Oszlop | Megnevezés | Megjegyzés |
|---|---|---|
| D | S.sz. | automatikus; **évváltásnál 1-től újraindul**, piros vonal választja el az éveket |
| E | Dátum | kötelező |
| F | Szolgálat jellege | kötelező, legördülő (37 érték — lásd lentebb) |
| G | Du. | legördülő: *üres* / `Du.` / `De.2` / `Du.2` |
| H | Férfi | résztvevők száma |
| I | Nő | résztvevők száma |
| J | Bibliaolvasás | |
| K | Alapige | |
| L–Q | 1.–6. ének | hat énekszám |
| R | Szolgált | a szolgálatot végző neve (saját / vendég / beszolgáló) |
| S | Perselypénz | |
| T | Megjegyzés | |

### 2.1 A 37 szolgálati típus (kanonikus lista, `Szolgalatok` = `BA3:BA39`)

| # | Érték | Magyarázat a súgóból |
|---|---|---|
| 1 | Vasárnapi i.t. | a közönséges vasárnapi istentiszteletek |
| 2 | Ünnepi i.t. | Újév, Böjtfő, Virágvasárnap, Nagypéntek, Áldozócsütörtök, Újzsenge, Reformáció, Advent, Óév |
| 3 | Bűnbánati i.t. | |
| 4 | Hétköznapi i.t. | **csak a rendszeresen tartott**; az alkalmi hétköznapi i.t. nem kerülhet ide |
| 5 | Úrvacsora templomban | |
| 6 | Betegúrvacsora | |
| 7 | Felnőtt bibliaóra | |
| 8 | Ifj. vagy IKE bibliaóra | |
| 9 | Presbiteri bibliaóra | |
| 10 | Nőszöv. bibliaóra | |
| 11 | Házasok bibliaórája | |
| 12 | Más bibliaóra 1 | a megnevezés az Adatlapra kerül, a legördülőben csak „Más bibliaóra 1" látszik |
| 13 | Más bibliaóra 2 | ugyanígy |
| 14 | F. keresztelő | férfi/fiú; **több keresztelés esetén személyenként külön sor** |
| 15 | N. keresztelő | nő/lány; ugyanígy |
| 16 | Keresztelői felkészítő | |
| 17 | F. temetés | **személyenként külön sor**, akkor is, ha egyszerre két temetés van |
| 18 | N. temetés | ugyanígy |
| 19 | Virrasztó | |
| 20 | Azonos esketés | **mindkét fél református** |
| 21 | Vegyes esketés | csak az egyik fél református |
| 22 | Jegyesbeszélgetés | |
| 23 | Digitális alkalmak | **kizárólag digitális** alkalmak; a közvetített alkalmakat NEM kell ide írni |
| 24 | Imahét | |
| 25–27 | Húsvét I./II./III. it. | |
| 28–30 | Pünkösd I./II./III. it. | |
| 31–33 | Karácsony I./II./III. it. | |
| 34 | Vallásos ünnepély | |
| 35 | Szeretetvendégség | |
| 36 | Presbiteri felkészítő | |
| 37 | Egyéb szolgálat | ami nem sorolható a fentiekbe. **NEM azonos** a jelentés II.1.g „más alkalmak" számával |

### 2.2 De./Du. szemantika — ⚠️ kritikus számítási szabály

- **Alapértelmezés: délelőtt.** Ha a G oszlop üres, az alkalom délelőtti.
- A de./du. megkülönböztetésnek **csak** a vasárnapi, ünnepi, bűnbánati és hétköznapi
  istentiszteleteknél van jelentősége; a többi szolgálatnál nincs.
- A bűnbánati alkalmak általában délutániak → **itt kötelező** kitölteni.
- Ha egy vasárnap/ünnepnap **délelőtt (vagy délután) több istentisztelet** van, a
  másodikhoz `De.2` (ill. `Du.2`) írandó.
- **Miért számít:** ez a templomlátogatási százalék számításának alapja.
  Példa a súgóból: vasárnap 9-kor 100-an, 11-kor 200-an. Ha a második alkalomhoz
  beírjuk a `De.2`-t, a rendszer **összeadja** → 300. Ha nem írjuk be, **átlagol** → 150.

  A Kartotékában ezt a szabályt pontosan reprodukálni kell, különben a
  templomlátogatási statisztika hibás lesz.

---

## 3. `Katekézis` — oszlopok és típusok

Oszlopok: Sorszám, Dátum, **Katekézis jellege**, Részt vett, Tananyag, Perselypénz,
A katekézist tartotta, Megjegyzés.

Típusok (`AA3:AA13`, 11 érték):

1. Vallásóra 1. csoport
2. Elsőéves konf. felkészítő
3. Másodéves konf. felkészítő
4. Gyermekistentisztelet
5. Vasárnapi iskola
6. Vallásóra 2. csoport
7. Vallásóra 3. csoport
8. Vallásóra 4. csoport
9. Vallásóra 5. csoport
10. VBH – Vakációs Bibliahét
11. Egyéb foglalkozás

### 3.1 ⚠️ A vallásóra-átlag számítási szabálya

A „vallásórára járt átlag egy alkalommal" **nem** a vallásórák számával oszt, hanem a
**vallásórás hetek számával** — konkrétan a **`Vallásóra 1. csoport`** alkalmainak számával.

> Súgó-példa: két csoport, heti egy-egy vallásóra, az elsőbe 10-en, a másodikba 20-an járnak.
> Egy héten tehát 30 gyerek jár vallásórára. Ha az összlétszámot a *vallásórák* számával
> osztjuk, 15 jön ki — ami hamis. A *vallásórás hetek* számával osztva 30 — ez a helyes.

---

## 4. `Családlátogatás` — oszlopok és típusok

Oszlopok: Sorszám, Dátum, **CsL/BL**, A meglátogatott család neve, A meglátogatott család címe,
Jelen volt, Jegyzet (olvasott bibliai rész, ének, egyéb).

Típusok: `CsL` (családlátogatás), `BL` (beteglátogatás).

---

## 5. A lelkészi jelentés fejezetei (I–X)

Jelölés: **[M]** = a munkanaplóból automatikusan származik · **[K]** = kézi bevitel ·
**[SZ]** = a számadásból származik · **[Σ]** = képlettel számított

### Fejléc
Egyházmegye [K, legördülő] · Egyházközség neve (*„Református Egyházközség" nélkül*) ·
Lelkipásztor · Főgondnok/Gondnok [K, legördülő] · Presbiteri gyűlés dátuma + határozat száma ·
Közgyűlés dátuma + határozat száma · Egyházközségi iktatószám · Egyházmegyei iktatószám · Esperes

### I. Adatok a lélekszámról
| # | Tétel | Forrás |
|---|---|---|
| 1 | Az előző évi lélekszám: férfi / nő | [K] induló évben, utána [Σ] |
| 2 | Keresztelésben részesült: férfi / nő | **[M]** `F. keresztelő` / `N. keresztelő` |
| 3 | Eltemettetett: férfi / nő | **[M]** `F. temetés` / `N. temetés` |
| 4 | Természetes szaporulat | [Σ] |
| 5 | Természetes apadás | [Σ] |
| 6 | Egyházunkba tért: férfi / nő + *milyen felekezetből* | [K] |
| 7 | Egyházunkból kitért: férfi / nő + *milyen felekezetbe* | [K] |
| 8 | Beköltözött az egyházközségbe: férfi / nő | [K] |
| 9 | Kiköltözött más egyházközségbe: férfi / nő | [K] |
| 10 | Kiköltözött külföldre: férfi / nő | [K] |
| 11 | Általános szaporulat | [Σ] |
| 12 | Általános apadás | [Σ] |
| 13 | A gyülekezet lélekszáma dec. 31-én | [Σ] |
| 14 | A választói névjegyzékben szereplő tagok száma | [K] |
| 15 | Az egyházfenntartás személyenkénti éves összege | [K] — *a jelentés évére vonatkozó összeg, nem a következő évi* |
| 16 | Akik 5+ éve nem fizetik az egyházfenntartói járulékot | [K] |
| 17 | Más nemzetiségű egyháztagok (10 fő felett): Román / Német / Roma / Más (megnevezés) / más tagok száma | [K] |
| 18 | Külföldön élő egyháztagok (életvitelszerűen vagy évi 6+ hónap) | [K] |
| 19 | Más településen élő egyháztagok | [K] |
| 20 | Más gyülekezetben is tagságot vállalók | [K] |
| 21 | Családok száma az előző évben | [K] induló évben, utána [Σ] |
| 22 | Családok száma dec. 31-én: Egyező vallású / Vegyes vallású / Özvegy / Egyedülálló (30 évet betöltött és nőtlen) | [K] |
| 23 | Házassági esküt tett: Egyező vallású **[M]** `Azonos esketés` / Nem egyező vallású **[M]** `Vegyes esketés` / Azonos nemzetiségű [K] / Nem azonos nemzetiségű [K] |

> A képletsor `=SUM(C12,C14,-C16,C18,-C21,C24,-C26,-C28)` mutatja a lélekszám-görgetést:
> előző lélekszám + keresztelés − temetés + betért − kitért + beköltözött − kiköltözött − külföldre költözött.

### II. Istentisztelet
1. **Alkalmak száma** (de./du. bontásban): a. közönséges vasárnapon **[M]** · b. ünnepnapokon **[M]** ·
   c. rendszeres hétköznapi **[M]** · d. bűnbánati héten **[M]** · e. bibliaórák **[M, Σ]** ·
   f. kazuáliák és felkészítők **[M, Σ]** · g. más alkalmak **[M, Σ]** · h. digitális alkalmak **[M]**
2. Vasárnapi i.t. résztvevő-átlag (de./du.) **[M]**
3. Ünnepi i.t. résztvevő-átlag (de./du.) **[M]** — *Újév, Böjtfő, Virágvasárnap, Nagypéntek, Mennybemenetel, Újkenyér, Reformáció, Advent, Óév*
4. Külön a sátoros ünnepeken: Karácsony I–III., Húsvét I–III., Pünkösd I–III. (de./du.) **[M]**
5. Rendszeres hétköznapi i.t. átlag (de./du.) **[M]**
6. Bűnbánati i.t. átlag (de./du.) **[M]**
7. Hány alkalommal volt úrvacsoraosztás **[M]** `Úrvacsora templomban`
8. Úrvacsorával élt átlag egy alkalommal: férfi / nő **[M]**

> Származtatások a képletekből:
> - **e. bibliaórák** = a `Felnőtt / Ifj. vagy IKE / Presbiteri / Nőszöv. / Házasok / Más bibliaóra 1 / Más bibliaóra 2` összege
> - **f. kazuáliák és felkészítők** = keresztelők + esketések + `Keresztelői felkészítő` + `Jegyesbeszélgetés` + `Virrasztó` + temetések
> - **g. más alkalmak** = `Vallásos ünnepély` + `Szeretetvendégség` + `Imahét` + `Úrvacsora templomban` + `Betegúrvacsora` + `Egyéb szolgálat`
> - **b. ünnepnapokon** = az `Ünnepi i.t.` + a kilenc sátoros ünnepi típus összege

### III. Gyülekezetgondozás
1. Bibliaórák alkalmainak száma típusonként **[M]**: felnőtt · ifjúsági · presbiteri · nőszövetségi ·
   házasok · Más bibliaóra 1 (megnevezés [K] + alkalmak [M]) · Más bibliaóra 2 (ugyanígy)
2. Vallásos ünnepélyek száma **[M]**
3. Szeretetvendégségek száma **[M]**
4. Egyetemes imahét: `vendégszolgálatokkal` / `vendégszolgálatok nélkül` / `nem volt egyetemes imahét` [K] ·
   ha vendégszolgálatok nélkül, mi az oka [K, 200 kar.] · résztvevő-átlag **[M]**
5. A lelkipásztor meglátogatott: **családot [M]** `CsL` · **beteget [M]** `BL`
6. A presbiterek végeztek-e családlátogatást? [K, IGEN/NEM]
7. Választott presbiterek száma [K] — *lelkipásztor(ok) nélkül, a gondnokot/főgondnokot beleszámolva* ·
   Pótpresbiterek száma [K] — *a betöltött tisztségek száma, nem a keret*
8. Presbiteri felkészítők száma **[M]**
9. Fegyelmi esetek száma [K] + oka [K, 200 kar.]
10. Hány körzetre van osztva a gyülekezet [K]
11. Hány közgyűlést tartottak [K]
12. Utolsó esperesi vizitáció dátuma [K] · utolsó generális vizitáció dátuma [K]
13. Van-e testvérgyülekezet [K, IGEN/NEM] + felsorolás [K, 200 kar.]

### IV. Belmissziós tevékenységek *(ÚJ fejezet)*
1. **Gyerek tevékenységek:** a. rendszeres gyerekfoglalkozások (vallásórán kívül) [K, 200] ·
   b. Vakációs bibliahét: `KOEN program` / `más program alapján` / `nem volt` [K] + ha más, milyen [K, 200] ·
   c. szervezett gyerektábort [IGEN/NEM] · d. részt vettek más táborban [IGEN/NEM] · e. más rendezvény [K, 200]
2. **Ifjúsági tevékenység:** a. rendszeres foglalkozások [K, 200] · b. `FIT7 program` / `más program` [K] +
   ha más, milyen [K, 200] · c. szervezett regionális/egyházmegyei ifjúsági találkozót [IGEN/NEM] ·
   d. szervezett ifitábort [IGEN/NEM] · e. részt vettek más táborban [IGEN/NEM] ·
   f. részt vettek munkatársképzőn [IGEN/NEM] · g. más rendezvény [K, 200]
3. **Nőszövetségi tevékenység:** a. rendszeres foglalkozások [K, 200] · b. diakóniai munka [K, 200] ·
   c. szervezett regionális/egyházmegyei találkozót [IGEN/NEM] + felsorolás [K, 200] ·
   d. Ökumenikus Világimanap: megszervezték [IGEN/NEM] / részt vettek máshol [IGEN/NEM] ·
   e. Kárpát-medencei imanap: megszervezték [IGEN/NEM] / részt vettek máshol [IGEN/NEM] · f. más rendezvény [K, 200]
4. **Presbiterszövetségi tevékenység:** a. tevékenységek, események [K, 200] ·
   b. szervezett presbiterképzőt [IGEN/NEM] / részt vettek máshol [IGEN/NEM] ·
   c. szervezett regionális/egyházmegyei találkozót [IGEN/NEM] + felsorolás [K, 200] · d. más rendezvény [K, 200]
5. Egyházközségi kórus vagy énekkar tevékenysége [K, 200]
6. Más belmissziós tevékenységek [K, 200]

> **Rövidítések:** *KOEN* = Keresztyén Oktatásért Erkölcsi Nevelésért Alapítvány (Vakációs Bibliahét programja).
> *FIT7* = Fiatal Tanítványok hete — az EREK Ifjúsági Szövetsége által összeállított program.

### V. Vallásos oktatás (csak gyülekezeti)
1. A vallásórás korú gyermekek összlétszáma [K] — *az I. és II. éves konfirmandusok nélkül*
2. Ebből vallásórára jár átlag egy alkalommal **[M, Katekézis]** — *lásd a 3.1 szabályt*
3. Hány csoportban folyt a vallásóra [K]
4. Hány vallásóra volt az év folyamán **[M, Katekézis]**
5. Gyermekistentiszteletek száma **[M]** · vasárnapi iskolák száma **[M]**
6. Konfirmációi felkészítés I. évén résztvevők száma [K] — *a résztvevők száma, nem az átlag* ·
   van/nincs kiskonfirmáció [K] · a kiskonfirmáción részt vett [K]
7. Konfirmációi felkészítés II. évén résztvevők száma [K] · ebből konfirmált: fiú / lány [K]
8. Áttérő, illetve felnőtt konfirmáltak száma [K]

### VI. Szeretetszolgálat *(ÚJ fejezet)*
1. Működik-e állandó diakóniai intézmény [IGEN/NEM] + felsorolás [K, 200] + **a rá költött összeg** [K]
2. Van-e rendszeres diakóniai szolgálat [VAN/NINCS] + felsorolás [K, 200] + összeg [K]
3. Van-e alkalmi diakóniai szolgálat [VAN/NINCS] + felsorolás [K, 200] + összeg [K]
4. Más diakóniai szolgálat [K, 200]
5. Működik-e a gyülekezet területén nem egyházközségi szeretetszolgálati intézmény [IGEN/NEM] + felsorolás [K, 200]

### VII. Anyagi helyzet
> **A fejezetet a számadás alapján kell kitölteni, és azonos számokat kell tartalmaznia a számadással.**
> Ez közvetlen kapcsolatot teremt a Kartotéka pénzügyi moduljával — a mezők a részszámadás
> konkrét soraiból származnak:

| Tétel | Számadás sora |
|---|---|
| 1. Egyházfenntartói járulék éves összege | **5.** |
| 2. A perselypénz éves összege | **7.** |
| 3.a Előző évi egyenleg | **1.** |
| 3.b Összbevétel | **52.** |
| 3.c Összkiadás | **112.** |
| 3.e Kintlévőségek | **116.** |
| 3.f Tartozások | **128.** |

4. Eleget tudott-e tenni időben a kifizetési kötelességeinek [IGEN/NEM]
5. Ha tartozása van, részletezni — *a VII.3.f-hez beírt tartozásokat*

### VIII. Ingatlanok *(ÚJ fejezet)*
1. Milyen épületei vannak az egyházközségnek [K, 200]
2. **A.** Új ingatlanberuházás értéke — *a számadás **97.** sorából, a **csoportnapló** alapján külön
   választva az ingatlanokra vonatkozó részt* + mi történt [K, 200]
   **B.** Épületek általános javítására költött összeg — *számadás **98.** sora* + mi történt [K, 200]
   **C.** Épületek karbantartására fordított összeg — *számadás **66.** sora* + jelentősebb munkálatok [K, 200]
3. Alapeszközök beszerzésére fordított összeg + felsorolás [K, 200]
   > **Alapeszköz:** minden olyan leltári tárgy, amelynek beszerzési értéke meghaladja a Román Kormány
   > által megállapított küszöböt, és használati ideje egy évnél több.
   > **2026. január 1-én ez az érték 2 500 lej** (2013. július 1-től érvényes).
   > Ha a kormány megemeli, a következő években az új érték szerint kell besorolni.
   > → **Ez közvetlenül köti a leltár modult a jelentéshez (10–12. pont).**
4. Az év folyamán adományba kapott ingatlanok, alapeszközök értéke + felsorolás [K, 200]
5. Történt-e elidegenítés, épületbontás [IGEN/NEM] + felsorolás [K, 200]

### IX. Az elmúlt év legjelentősebb gyülekezeti eseményei
Szabad szöveg, **2 × 400 karakter** (a `Jelentés` lap egyesíti a két cellát).
*Amelyek nincsenek belefoglalva az előző fejezetekbe — az előző év missziói tervének megvalósulásai.*

### X. Missziói terv
Szabad szöveg, **2 × 400 karakter**.
*A lelkipásztor és a presbitérium elgondolásai, javaslatai a gyülekezet lelki, erkölcsi, szellemi,
anyagi életének jobbítására.*

---

## 6. Amit az Excel natívan tud, és a Kartotékának is tudnia kell

1. **10 év egymás mellett.** Az `Adatlap` C..L oszlopa tíz év jelentése. A `Jelentés` lap fejlécén
   évszám **vagy „összesítő"** választható. → A kért „5 éves összehasonlítás" ennek a részhalmaza;
   a Kartotékában legalább 5, de inkább 10 év tárolása és összevetése a cél.
2. **Görgetett lélekszám.** Az induló évben kézzel, utána képlettel — a rendszernek is így kell.
3. **Évváltás a naplóban.** A sorszámozás évente 1-től indul, az éveket vizuális elválasztó jelöli.
4. **Szűrés.** A munkalapon szűrni lehet; a Kartotékában ez a lista-szűrő megfelelője.
5. **Nyomtatás.** Külön `Nyomtathato_munkanaplo` lap a naplóhoz, és a `Jelentés` lap a jelentéshez.
   → A Kartotékában **két** nyomtatvány kell: nyomtatható munkanapló + nyomtatható lelkészi jelentés.

## 7. Megvalósítási figyelmeztetések

- ⚠️ A **de.2 / du.2** szabály nélkül a templomlátogatási statisztika **hibás** (átlagol összeadás helyett).
- ⚠️ A **vallásóra-átlag** nevezője a `Vallásóra 1. csoport` alkalmainak száma, **nem** az összes vallásóra.
- ⚠️ A keresztelést és a temetést **személyenként külön sorba** kell vezetni, különben a lélekszám hibás.
- ⚠️ A `Hétköznapi i.t.` **csak rendszeres** alkalom; az alkalmi hétköznapi istentisztelet `Egyéb szolgálat`.
- ⚠️ A `Digitális alkalmak` **csak kizárólag online** alkalom; a közvetített (streamelt) istentisztelet nem az.
- ⚠️ Az `Egyéb szolgálat` **nem azonos** a jelentés II.1.g „más alkalmak" sorával.
- ⚠️ A VII. fejezet számainak **egyezniük kell a számadással** — nem lehet külön kézi adat.
