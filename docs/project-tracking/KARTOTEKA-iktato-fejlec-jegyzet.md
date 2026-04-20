# Jegyzet — Iktatott iratok fejlécének alapadatokkal való feltöltése

**Státusz**: jegyzet (a user kérte, hogy későbbre dolgozzuk ki)
**Dátum**: 2026-04-21
**User-kérés**: "Az alapadatoknál látható adatok jelenjenek meg az iktatott iratok fejlécében is! (ezt majd később dolgozzuk ki)"

---

## Mit kell később csinálni

A gyülekezeti alapadatok (név, cím, adószám, elérhetőségek, pecsét / címer, bank) **automatikusan** megjelenjenek az iktatott iratok (iktató modul) PDF-es fejlécében.

## Jelenleg

Az iktató modul PDF-generálása önállóan készíti el a fejlécet, valószínűleg statikus adatokkal vagy külön konfigurálható szekcióban.

## Kapcsolódó modulok

- `app/(dashboard)/iktato/` — iktató modul
- `lib/pdf/` — PDF-generáló logika (valószínűleg)
- `components/modals/congregation-dialog-v2.tsx` — az alapadatok forrása

## Elvégzendő

1. Nézzük át az iktató PDF-generátort — mi van jelenleg a fejlécben?
2. Tervezzük meg, **melyik alapadatok** jelennek meg (teljes név HU/RO, adószám, cím, telefon, email, cimer/pecsét, bankszámla)
3. Szükség esetén: egy **"Iratfejléc beállítás"** szekció a gyülekezeti alapadatok modalban (pl. "A PDF fejlécébe kerüljön a címer? Aláírás kép?")
4. Implementáljuk a fejléc-sablont

## Kérdések a tervezéshez

- Kétnyelvű fejléc (magyar + román) egymás mellett vagy alatt?
- A címer a bal oldalon, jobb oldalon, középen?
- Aláírás a lábjegyzetben automatikus (lelkész-profilból)?

Ez egy **nagy feature**, kb. 1-2 munkanap, ha egyszer lemérjük az iktató PDF-állapotot.
