# Kartotéka v0.5.1

A v0.5.0 telepítője után jelzett három fő probléma javítva, plusz egy új, gyakran kért feature.

## 🐛 Javítások

- **Hiányzó stílusok az irányítópulton** — a közös `@kartoteka/ui-app` csomag (új dashboard widget-ek: KPI-kártyák, születésnapok, közelgő alkalmak stb.) Tailwind class-jai nem kerültek be a CSS-bundle-be, ezért az új kártyák stílus nélkül, hiányos elemekkel jelentek meg. Mostantól mindkét kliens (web és desktop) szkenneli az `@kartoteka/ui-app/src` mappát is — minden új komponens stílusa megjelenik.
- **Üres sávok teljes képernyőn** — a tartalom maximum-szélessége 1280px volt, így nagy monitoron a sidebar utáni terület nagy része üres maradt. Mostantól a tartalom kitölti a teljes ablakot; a beágyazott rács-komponensek (KPI-kártyák, statisztikák) maguk osztják el a helyet.
- **Tagnyilvántartás fejléc-egységesítés** — a webes/közös `PageHero` (eyebrow + serif cím + ikon + statisztikák) helyébe lépett a régi egyedi `<h1>` — így a desktop oldal vizuálisan ugyanaz, mint a többi modul. A táblázat „törlés"-ikonja (Trash2) helyett **ceruza-ikon** mutatja, hogy a sor szerkesztésre nyílik meg.
- **Telepítő hosszú leírás rövidítve** — a hosszú `longDescription` egyes ablakokban tördelési problémákat okozott; mostantól tömörebb, jobban olvasható szöveg.

## ✨ Új — automatikus háttérszinkron + állapotsáv

- **Indításkor azonnal** lefut egy teljes szinkron (mind a 14 lokális mirror-tábla); ezután **percenként** a leggyakrabban változó táblák (tagok, családok, munkanapló, programok, profil, gyülekezet) frissülnek, **5 percenként** pedig az összes (anyakönyv, leltár, iktató, jegyzőkönyvek, sírhelyek, éves jelentés, helyiségek).
- A képernyő alján középen lebegő **állapotsáv** mutatja a szinkron állapotát:
  - 🔵 *„Adatok szinkronizálása…"* — folyamatban
  - 🟢 *„Friss adatok · 12 mp"* — sikeres pull, relatív idővel
  - 🟠 *„Offline — cache-elt adatok"* — nincs net
  - 🔴 *„Szinkronizálási hiba — újrapróbálkozás"* — ideiglenes hiba
- **Kézi frissítés** a sávon lévő ↻ gombbal bármikor kérhető.
- **Online → offline → online** átmenetkor automatikusan újraindul a szinkron.

A frissítés adat-vesztés nélkül és automatikusan települ az auto-updater-en keresztül.

---

Részletek: `docs/CHANGELOG.md`
