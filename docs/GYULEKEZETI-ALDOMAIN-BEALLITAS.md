# Gyülekezeti aldomain — `<slug>.kartoteka.app`

**Endre kérése (2026-08-27):** „Ha lehet, akkor legyen ennek külön domainja,
pl. `baratosi-reformatus-egyhazkozseg.kartoteka.app`."

Az **alkalmazás oldali rész elkészült és él**: ha egy kérés
`<slug>.kartoteka.app` címre érkezik, a rendszer a gyülekezet oldalát szolgálja
ki (belül a már meglévő `/gy/<slug>` útvonalon). Ehhez **nem kell külön build,
nem másolódik az oldal, és a régi cím is működik tovább.**

A hiányzó rész **nem a kódban van**: a DNS-rekordokat és a Railway egyéni
domainjét kézzel kell felvenni. Amíg ez nincs meg, minden a megszokott módon
működik — az aldomain egyszerűen nem oldódik fel.

---

## 1. Amit tudni kell előre

**Az aldomain csak ékezet nélküli, ASCII betűkből állhat.** A példádban szereplő
`baratosi-reformatus-egyhazkozség.kartoteka.app` **így nem működne** — az `ő`
és a `g`+`ség` végződés miatt. A tényleges cím a gyülekezet **slugja** lesz, ami
már most is ékezet nélküli:

```
baratosi-reformatus-egyhazkozseg.kartoteka.app
```

Ez ugyanaz a szó, ami ma a `kartoteka.app/gy/…` után áll, tehát nincs vele
külön teendő.

**Mit ér el a látogató az aldomainen?** Kizárólag a gyülekezet nyilvános
oldalát. Az alkalmazás belső felületei (bejelentkezés, vezérlőpult,
adminisztráció) az aldomainen **szándékosan nem elérhetők** — ott 404-et adnak.
Belépni továbbra is csak a `kartoteka.app` címen lehet. Ez nem korlátozás, hanem
biztonsági döntés: így a bejelentkezési munkamenet felülete nem sokszorozódik
meg a gyülekezetek számával.

---

## 2. DNS — a domain szolgáltatójánál

A `kartoteka.app` DNS-kezelőjében **három rekord** kell. A pontos értékeket a
Railway írja ki, amikor a 3. lépésben felveszed a wildcard domaint — az alábbi
`<érték>` helyekre azokat másold be.

| Típus   | Név                          | Érték                        |
|---------|------------------------------|------------------------------|
| `CNAME` | `*`                          | `<érték>.up.railway.app`     |
| `CNAME` | `_acme-challenge`            | `authorize.railwaydns.net`   |
| `TXT`   | (amit a Railway megad)        | (amit a Railway megad)       |

- A `*` (csillag) a **wildcard**: minden aldomaint lefed, amelyre nincs saját,
  konkrét rekord.
- Az `_acme-challenge` **nélkül a Railway nem tud SSL-tanúsítványt kiállítani**,
  tehát a `https://` nem fog működni.
- A `TXT` rekord a tulajdonjogot igazolja. **A wildcard domain enélkül nem
  hitelesítődik** — ez a leggyakrabban kifelejtett lépés.

**A meglévő rekordjaidat ez nem bántja.** A wildcard csak ott lép életbe, ahol
nincs konkrét rekord, tehát a levelezés (`mail`, `smtp`, Brevo SPF/DKIM) és
minden más már felvett aldomain változatlanul működik. A kód ezen felül is
véd: a `www`, `mail`, `api`, `admin` és társaik soha nem értelmeződnek
gyülekezetként.

---

## 3. Railway — egyéni domain

1. Railway → a Kartotéka projekt → a webes szolgáltatás → **Settings →
   Networking → Custom Domain**.
2. Add hozzá: `*.kartoteka.app`
3. A Railway kiírja a fenti CNAME + TXT értékeket — ezeket vidd fel a DNS-be
   (2. lépés).
4. Várd meg, amíg a domain státusza zöld lesz (a tanúsítvány kiállítása
   néhány perctől ~1 óráig tarthat).

> **Csomag-korlát:** a Hobby csomagban szolgáltatásonként 2 egyéni domain fér
> el, és a wildcard ebből egyet elhasznál. A `kartoteka.app` maga a másik.
> Ha később további egyéni domain kell, csomagváltás szükséges.

---

## 4. Alkalmazás — nincs teendő

A `GYULEKEZETI_ALDOMAIN_BAZIS` környezeti változó **üresen hagyható**: ilyenkor
a `NEXT_PUBLIC_APP_URL` gazdagépneve (alap: `kartoteka.app`) az alap-domain.
Csak akkor kell beállítani, ha az app egy másik domainen is fut, és ott nem
akarod a gyülekezeti aldomaineket.

---

## 5. Ellenőrzés

A DNS terjedése után:

```bash
curl -sI https://baratosi-reformatus-egyhazkozseg.kartoteka.app/ | head -1
```

`HTTP/2 200` a jó válasz. Ha `404` jön, a gyülekezet publikus oldala nincs
közzétéve (Publikus oldal → közzététel), vagy a slug más.

```bash
curl -sI https://baratosi-reformatus-egyhazkozseg.kartoteka.app/dashboard | head -1
```

Itt `404` a **helyes** válasz: a belső felület az aldomainen nem érhető el.

---

## 6. Mi marad a régi címen

A `kartoteka.app/gy/<slug>` továbbra is működik, és **a keresők számára az
marad a hivatalos cím** (`canonical`). Így ugyanaz a tartalom nem verseng
önmagával a találati listában. A látogató szempontjából nincs különbség: az
aldomainen marad végig, csak a keresőnek szól a megjelölés.

Ha később az aldomaint szeretnéd hivatalos címként is, az külön kör: a
`canonical`, az `openGraph.url` és a `sitemap.xml` gazdagépét is át kell
állítani gyülekezetenként.
