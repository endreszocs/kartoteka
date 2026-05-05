# Kartotéka v0.8.6 — Reszponzív splash képernyő

**Megjelenés dátuma:** 2026-05-05
**Webes verzió (Railway):** v0.9.50
**Desktop verzió:** v0.8.6

---

## Kedves Lelkipásztorok, Munkatársak!

Egy apró, de fontos finomítás érkezett — különösen azoknak, akik a
Kartotékát **telefonról** vagy **kisebb tabletről** használják.

## Mi változott?

A bejelentkezés előtti splash képernyő — az a hangulatos üdvözlő
képernyő, amelyen "Békesség Istentől!" felirat fogadja Önt a KARTOTEKA
és a két egyházkerületi címer mellett — eddig **fix, nagy felbontású**
képet jelenített meg, kicsinyítve. Telefonon emiatt levágódott a két
oldalsó címer, és a betűk is nehezebben voltak olvashatók.

**Mostantól minden képernyőméreten szépen illeszkedik:**

### 📱 Telefonon

Vertikális, viewport-fit elrendezés: a KARTOTEKA logó középen, alatta a
két egyházkerületi címer kicsi formában, felül a "Békesség Istentől!"
headline, alul az alcím, a tagline és a betöltés-jelző. Minden méret
arányosan a képernyőhöz igazodik (kis és közepes telefonok egyaránt).

### 📐 Tableten

A régi 1920×1080-as színpad marad, de **letterboxing** módban — minden
látszik, semmi sem vágódik le. A 3 logó és a szöveg teljes egészében
megjelenik, akár portrait, akár landscape orientációban.

### 🖥 Asztali gépen

Az eredeti, tervezett "fill" mód marad érvényben. Aki eddig is szépnek
látta a splash-t a számítógépén, ugyanazt fogja látni — semmi sem
változik az élményben.

## Mi nem változott

- A splash 5-fázisos animációja (háttér → címerek → KARTOTEKA logó →
  headline → szöveg + loader) változatlan.
- Egy session alatt egyszer jelenik meg, ahogy eddig is.
- A teljes tartalom — szöveg, képek, időzítés — változatlan.

## A Kartotéka belső "kis splash"-e

A desktop kliens indításakor 1,5 másodpercig megjelenik egy egyszerűbb
betöltő képernyő (Kartotéka logo + cím + haladás-sáv). Ezt is
reszponzívvá tettük — telefonon, tableten és asztali gépen különböző,
egymáshoz illesztett méretekben jelenik meg.

## Frissítés

A Kartotéka asztali kliens **automatikusan** frissül a háttérben.
Indítsa újra az alkalmazást — a v0.8.6 hamarosan települ.

## Köszönet

Ezt a finomítást egyetlen visszajelzés kérte. Köszönjük a türelmet és
az alaposságot — ezért érdemes szólni, ha valami részletet javítani
kell!

Áldott szolgálatot kívánunk!

— *Kartotéka fejlesztői csapat*
*Erdélyi Református Egyházkerület*
