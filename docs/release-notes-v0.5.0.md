# Kartotéka v0.5.0

A v0.4.1 telepítője után **jelentős bővülés** — a sidebar-on lévő „hamarosan" oldalak mindegyike valódi modullá vált.

## 6 új modul (READ-ONLY) — offline böngészhető

- **Anyakönyv** (8 tábla) — keresztelés, konfirmáció, házasság, temetés + 4 mozgás (beköltözött / elköltözött / áttért / kitért)
- **Leltár** — alapeszközök, könyvek, műkincsek; kategória-szűrő + össz-érték
- **Iktató** — beérkező és kimenő iratok év szerinti sorszámmal; függőben jelölés
- **Jegyzőkönyvek** — presbiteri/közgyűlési ülések részletes nézettel (résztvevők, napirendek szavazási eredménnyel, határozatok)
- **Sírhelyek** — temetők, parcellák, bérletek, elhunytak; lejáró bérletek figyelmeztetése
- **Éves jelentés** — workflow-státuszokkal (vázlat → beküldve → befogadva → áttekintve → lezárva)

Mind a 6 modul **„Frissítés most" gombbal** online egy kattintással áthúzza a teljes tartalmat — onnantól offline is böngészhető.

## Új üdvözlő oldal — webes paritás

- Üdvözlő gradient-banner napi igével
- 5 KPI-kártya (aktív tagok, családok élesen, pénzforgalom, weboldal, prezentáció)
- 7 demográfiai stat (férfiak, nők, gyermekek, átlagéletkor, presbiterek stb.) — élesen kalkulálva
- **Közelgő alkalmak** widget — mai/14 napos programok automatikusan
- **Mai + 14 napos születésnapok** widget
- **Friss munkanapló** widget (10 utolsó alkalom)

## Stabilitás és UX javítások

- **Adatbázis automatikus helyreállítás** — nincs többé manual fájl-törlés
- **Szöveg kijelölhető** mindenhol
- **Munkamenet-üzenet** egyértelműbb („jelentkezz be újra a megújításhoz")
- **Tartalom centerálva** nagy ablakon (max 1280px)

## Belső séma-finomhangolás

- Leltár soft-delete fix
- Jegyzőkönyvek stabil UUID-FK
- 10 új adat-mező a 7 modulra
- Új helyiség-mirror tábla
- Minden új tábla `revision`+`updated_at` mezőkkel a jövőbeli WRITE-flow-hoz

A frissítés **adat-vesztés nélkül** és **automatikusan** lefut indításkor (kb. 1-2 másodperc).

## Megjegyzések

- Az **új bejegyzés rögzítése** (új keresztelés, házasság, temetés, leltári tétel stb.) **a következő release-ben jön** — most az adatok megtekinthetők, a webes felületen szerkeszthetők.
- A **Missziós Műhely** és **kerületi/egyházmegyei dashboard** webes marad.

---

Részletek: `docs/CHANGELOG.md` és `docs/project-tracking/KARTOTEKA-Sprint-{A-L}-*.md`
