# Egyházmegyei szint — Endre tulajdonosi döntései (2026-08-15)

A `docs/EGYHAZMEGYEI-SZINT-TERV-2026-08-15.md` kiviteli tervének KÖTELEZŐ
bemenete. A terv (és a megvalósítás) ezekhez igazodik.

## 1. Kik dolgoznak megyei profillal?

Három szerep: **esperes**, **egyházmegyei számvevő**, **egyházmegyei
adminisztrátorok**. A tervnek tisztáznia kell a jogosultság-mátrixot
(ki írhat az egyházmegye saját leltárába/könyvelésébe/iktatásába, ki
véglegesíthet, ki csak olvas) — javaslatot kell adnia, Endre hagyja jóvá.

## 2. Visszamenőleges évek archívuma

**Egyelőre CSAK a rendszerből véglegesített évektől él** a beküldött iratok
archívuma. Papír-alapú korábbi évek kézi feltöltése NEM része az első körnek
(későbbi bővítés lehet).

## 3. Egyházkerületi felküldés

- Az **egyházkerületnek SAJÁT belépése lesz — ez egy HARMADIK szint, KÜLÖN
  körben** épül (a mostani tervben csak fejezet-vázlat).
- Az egyházmegyénél **ugyanaz a véglegesítés-gomb minta**, mint az
  egyházközségeknél, KÉT külön úton:
  1. az egyházmegye **SAJÁT** számadásának / költségvetésének /
     költségvetés-módosításának véglegesítése és felküldése;
  2. az egyházmegye gyülekezetei által beküldött dokumentumok
     **ÖSSZESÍTŐINEK** külön véglegesítése és felküldése.

## 4. Egységes véglegesítés-gomb (Endre, 2026-08-15)

**A véglegesítés-gomb MINDEN jelentés esetén EGYFORMA legyen, és ugyanúgy
elhelyezve, már az EGYHÁZKÖZSÉGI szinten** — mind a hat irat-típusnál:
számadás, költségvetés, költségvetés-módosítás, vagyonleltári jelentés,
választók névjegyzéke, lelkészi jelentés. Ma csak a költségvetés/számadás
(és részben a leltár) ismeri a véglegesítést — a többinél meg kell építeni,
KÖZÖS komponensként (egy megjelenés, egy viselkedés: véglegesítés →
zárolás → feloldás-kérés útja is azonos). Ez ELŐFELTÉTELE az egyházmegyei
archívumnak: a megye azt látja, amit a gyülekezet véglegesített.

## Korábbról rögzített követelmények (2026-08-15, Endre)

- Az egyházmegye KIZÁRÓLAG a saját gyülekezeteit láthatja (más megye adatai
  soha).
- Saját leltár, könyvelés, iktatás — a MEGLÉVŐ modulok újrahasznosításával,
  diocese-ID-hez kötve.
- Beküldött hivatalos iratok gyülekezetenként, évekre visszamenőleg,
  átláthatóan: számadás, költségvetés, költségvetés-módosítás, vagyonleltári
  jelentés, választók névjegyzéke, **és a LELKÉSZI JELENTÉS is** (Endre
  kiegészítése 2026-08-15): a lelkészi jelentésnek is van véglegesítése és
  beküldése, az egyházmegyei archívum és az összesítő erre is kiterjed.
- Kinézet: a gyülekezeti felülettel azonos design-nyelv, megyei kimutatásokkal.
- Header megyei profilnál: „Egyházmegyénk" + „Egyházmegye beállításai";
  admin oldalon rejtve.
- Későbbi fázis: egyházmegyei offline Windows program (a gyülekezeti desktop
  mintájára).
