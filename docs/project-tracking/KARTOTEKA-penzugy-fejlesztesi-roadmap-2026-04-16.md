# KARTOTEKA — Pénzügyi modul fejlesztési roadmap (SAGA-kompatibilitás + jogszabályi megfelelés)

**Dátum**: 2026-04-16
**Állapot**: tervezés
**Döntéshozó**: felhasználó (egyházi app fejlesztő + karbantartó)
**Projekt log lépés**: (következő szám)

---

## 🛡️ VEZÉRELV — Gyülekezeti autonómia

> **Minden gyülekezet önálló és autonóm.** A lelkész explicit jóváhagyása nélkül senki (könyvelő, egyházmegyei számvevő) nem fér hozzá a gyülekezet adataihoz. Az egyházmegye, kerület, rendszergazda szolgáló-koordináló szerepben vannak — **nem felette** állnak a gyülekezetnek.
>
> Minden tervezési döntést, UX üzenetet és jogosultsági szabályt **ezzel az elvvel összhangban** kell meghozni. A lelkész sosem érezheti, hogy a gyülekezete adatait az engedélye nélkül kezelik.

---

## Vezetői összefoglaló

A pénzügyi modul jelenleg **erős pasztorális-egyházi szinten** (járulék, persely, nyugtafigyelő, monetár, belső mozgás, BNR árfolyam, bérleti szerződés), de **hiányosságai vannak** a könyvelői/jogszabályi kimeneten — ezek pótlása szükséges ahhoz, hogy a rendszer a hivatalos könyvelést **ne helyettesítse, hanem megfelelően előkészítse**, és a 2025. július 1. óta élesben futó ANAF kötelezettségeknek megfeleljen.

A roadmap **4 nagy munkacsomagot** fog össze, mindegyikhez külön részletes tervdokumentum tartozik:

1. **Használati útmutató fül** (pénzügy/13. fül) — lelkész-barát szoftverhasználati kézikönyv, a leltár modul mintájára
2. **Amortizáció audit + bővítés** — a meglévő amortizáció jogszabályi és UX finomhangolása, lelkész-barát magyarázatok
3. **TVA figyelő** — forgalmi plafon (395 000 RON) monitorozása, comodat vs. locațiune megkülönböztetéssel
4. **Oblio / e-Factura integráció** — bérleti számla kiállítás REST API-n keresztül, automatikus ANAF SPV továbbítás

---

## Felhasználói döntések (2026-04-16)

| Kérdés | Döntés | Hatás |
|---|---|---|
| Oblio fiók modell | **Minden gyülekezet saját fiókkal** | Nincs multi-tenant bonyolultság; `bealitas` vagy új tábla tárolja a gyülekezetenkénti API-kulcsot |
| Útmutató elhelyezés | **13. fül a végén, „Útmutató" néven** | EREK PÉNZÜGYEK marad elvi fül, az új fül szoftver-funkcionális |
| Amortizáció katalógus | **Marad 10 tétel + kézi „egyéb"** | Nincs nagy katalógus-bővítés, fókusz a UX-en és a jogszabályi finomhangoláson |
| Bérleti számlázás | **Rendszeres** | Oblio első use case: `berleti_szerzodes` → Oblio invoice → ANAF SPV |

---

## Prioritási sorrend (javaslat)

### P0 — Kötelező, jogszabályi kockázattal

| # | Munkacsomag | Miért kritikus | Kapcsolódó terv |
|---|---|---|---|
| 1 | **TVA figyelő** (comodat/locațiune megkülönböztetés) | A gyülekezet 395 000 RON átlépésekor 10 napon belül köteles 010-est beadni; ha ezt elmulasztja, **visszamenőleg ÁFA-t fizethet**. | `KARTOTEKA-tva-figyelo-terv-2026-04-16.md` |
| 2 | **Oblio / e-Factura integráció** | 2025.07.01 óta az ONG/cult gazdasági tevékenysége (bérleti díj!) **kötelezően e-Factura SPV-re kell**. | `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md` |

### P1 — Nagy értékű, nem jogszabályi

| # | Munkacsomag | Érték | Kapcsolódó terv |
|---|---|---|---|
| 3 | **Használati útmutató fül** | Az 1000 lelkész ezt fogja használni → ettől lesz a rendszer „öröm használni". | `KARTOTEKA-penzugy-hasznalati-utmutato-2026-04-16.md` |
| 4 | **Amortizáció audit és UX javítás** | Már működik, csak finomhangolás + lelkészi magyarázat. | `KARTOTEKA-amortizacio-audit-2026-04-16.md` |

---

## Nem része ennek a roadmapnek (későbbi körben)

Ezeket a SAGA-elemzés során felvetettük, de **most nem kezdjük el**:

- Notă contabilă CSV/XML export SAGA-ba (külön kör)
- Bankkivonat import (CSV / MT940 / OFX) — külön kör
- Partner regiszter (szállítók/vevők) és folyószámla — külön kör
- Egyszerűsített lelkészbér modul — külön kör
- Mérleg (Bilanț prescurtat) ONG sablon — külön kör
- SAF-T D406 közvetlen ANAF export — nem célunk, az Oblio-n keresztül megy

---

## Keresztfüggőségek

```
TVA figyelő ────► szamadasicel katalógus flag ◄──── Oblio számla kiállítás
                       (tvaPlafonbaSzamit)
                              │
                              ▼
                   Használati útmutató magyarázza
```

- A **TVA figyelő** és az **Oblio integráció** közös adatfüggést igényel a `szamadasicel` katalógustól: minden bevétel-kategóriához kell egy `tvaPlafonbaSzamit` zászló.
- A **szerződés típusa** (comodat vs. locațiune) a `berleti_szerzodes.tipus` mezővel bővítendő → hatással az Oblio számla kibocsátásra és a TVA-plafon számításra.
- A **Használati útmutató** minden funkciót dokumentál, tehát a három másik terv befejezése után frissítendő (a dokumentáció utoljára készül, de szekcióváz már most írható).

---

## Kockázatok

1. **Jogszabályi változás kockázata** — a TVA-küszöb és az e-Factura kötelezettség évente módosulhat. A rendszerben **konfigurálható értékeket** kell tartani (nem hardcoded 395 000), és a Használati útmutató minden kritikus szabálynál **jelzi a hatályosság dátumát**.
2. **Oblio API változás** — a bearer token, a hivatalos PHP SDK és az endpoint-szerkezet változhat. **Absztrakciós réteget** érdemes tenni (`lib/finance/oblio-client.ts`), hogy egy SmartBill vagy saját SPV-integrációra **cserélhető** legyen.
3. **Felhasználó képzettségi szint** — a lelkipásztor nem könyvelő. **Minden konfigurációs flag-hez** (pl. "ez gazdasági tevékenység?") egyértelmű, laikus magyarázat kell, különben rosszul címkéz, és a TVA-számítás téves lesz. Ezt az **Útmutató fül kritikusan fedezi**.
4. **Comodat vs. locațiune jogi bizonytalanság** — a temetői díj, tábordíj, szimbolikus bérleti díj esetei nem fehér-feketék. A rendszer **alapértelmezett + felülbírálható** logikával dolgozik, és a könyvelővel való konzultációt javasolja.
5. **Mentesített tevékenységek listája változhat** — pl. új kormányrendelet hozzátehet vagy elvehet. Katalógus-szintű, frissíthető zászlók kellenek, nem kódba égetett szabályok.

---

## Nyitott kérdések (a fejlesztés megkezdése előtt tisztázandó)

1. A lelkészeknek **hol és hogyan adjuk meg az Oblio API-kulcsot**? Gyülekezeti beállítások menüben, egy biztonságosan tárolt mezőben (encrypted at rest, Supabase vault)?
2. Az **SPV státusz visszajelzés** legyen polling (egyszerűbb) vagy webhook (élő)? A polling kódban egyszerűbb, de extra server terhelés.
3. A **TVA figyelő küszöbök** (80%/90%/100%) legyenek **gyülekezetenként testreszabhatók**, vagy rendszerszintű fix?
4. Az **Útmutató tartalma** legyen csak magyar nyelvű, vagy román is (egyes gyülekezetek vegyes nyelvű dokumentációt várnak el)?
5. A **régi `kiadasikiseroiv` és `belsomozgas` táblákat** hogyan dokumentáljuk a Használati útmutatóban — a lelkipásztor nevezi ezt egyébként „belső bizonylat"-nak, „áthelyezés"-nek vagy más szóhasználattal?

---

## Részletes tervek

A roadmap **nem tartalmaz implementációt**, csak az irányt jelöli ki. A részletes fájlok tartalmazzák:

- `KARTOTEKA-penzugy-hasznalati-utmutato-2026-04-16.md` — Használati útmutató fül szekció-váz, komponens-struktúra, tartalomterv
- `KARTOTEKA-amortizacio-audit-2026-04-16.md` — a meglévő amortizáció audit, hiányosságok, javasolt UX változtatások, lelkész-magyarázó tartalom
- `KARTOTEKA-oblio-efactura-integracio-terv-2026-04-16.md` — Oblio REST API integráció, adatmodell bővítés, server action szerkezet, UI flow
- `KARTOTEKA-tva-figyelo-terv-2026-04-16.md` — TVA-plafon figyelő adatmodell bővítés (`tvaPlafonbaSzamit` flag), comodat/locațiune megkülönböztetés, küszöb-logika, UI widget
