# KARTOTÉKA sebességdiagnosztika
Dátum: 2026-04-09

## Kiinduló észrevétel
A felhasználói visszajelzés szerint több modulnál 5 másodperc körüli vagy annál is lassabb betöltés érzékelhető. A mostani körben kódszintű diagnosztika készült, és több azonnali javítás is bekerült.

## Feltárt fő okok
1. Dupla szerveroldali kontextus-lekérés
A dashboard layout és több oldal külön-külön is meghívta az effektív hozzáférési kontextust, ami ugyanazon kérésen belül ismételt auth/profile/congregation lekérdezéseket jelentett.

2. Túl korán betöltött kliensoldali modálok
A profil, gyülekezet és God Mode modálok akkor is bekerültek a kezdeti klienscsomagba, amikor a felhasználó nem nyitotta meg őket.

3. Túl korán betöltött AI widget
Aladár a kezdeti dashboard renderrel együtt töltődött, pedig használat szempontjából másodlagos elem.

4. Leltár schema-drift
A leltárnál a kód és a tényleges/legacy adatmodell között eltérés volt (`deleted` vs `is_deleted`, `beszerzes_erteke` vs `beszerzesi_ertek` stb.). Ez nemcsak hibás listázást okozott, hanem felesleges hibaköröket és újrapróbálkozásokat is.

5. Több modul még kliensoldali `useEffect` + server action mintára tölt
Ez kényelmes, de nagyobb késleltetést okozhat, mert az oldal render után újabb kört fut a szerver felé. Ez különösen érezhető gyengébb hálózaton vagy nagyobb tábláknál.

## A most beépített javítások
1. `getEffectiveAccessContext()` request-szintű cache-t kapott.
Ezzel a layout és az oldalak ugyanabban a kérésben újrahasznosítják a hozzáférési kontextust.

2. A dashboard shell modáljai dinamikus importtal töltődnek.
A `ProfileDialog`, `CongregationDialog` és `GodModeDialog` már csak megnyitáskor kerül a kliensbe.

3. Aladár widget dinamikus importtal kerül a layoutba.
A lebegő asszisztens nem terheli feleslegesen az első rendercsomagot.

4. A leltár kompatibilitási réteget kapott.
A listázás most már kezeli a legacy és az újabb oszlopneveket is, így a valódi adatok ismét megjelenhetnek.

## Várható hatás
- Gyorsabb első dashboard render a kisebb kezdeti klienscsomag miatt.
- Kevesebb ismételt szerverhívás ugyanazon kérésen belül.
- Stabilabb leltárbetöltés és kevesebb hibából fakadó újrapróbálkozás.

## Következő erős optimalizációs célpontok
1. A nagy kliensmodulok szerver-előtöltése
Elsőként: `Leltár`, `Iktató`, `Sírhelyek`, néhány admin lista.

2. Dashboard query-k finomítása
A dashboard jelenleg sok párhuzamos lekérést használ. Ez jó alap, de további gyorsulás érhető el néhány összesítés előaggregálásával vagy könnyebb selectekkel.

3. Adatbázis indexaudit
Különösen ezeknél érdemes ellenőrizni a kompozit indexeket:
- `befizetes(congregation_id, datum)`
- `kiadas(congregation_id, datum)`
- `munkanaplo(congregation_id, created_at)`
- `leltar_tetelek(congregation_id, created_at)`
- `admin_access_requests(admin_user_id, congregation_id, status, expires_at)`

4. Dialog-open adatbetöltések mérése
A személyi, családi és profilablakok esetén érdemes a következő körben tényleges mérési logot is beépíteni fejlesztői módban.

## Megjegyzés
Ez a diagnosztika kódszintű elemzésen és a most beépített javításokon alapul. Valós DB-indexek és production hálózati késleltetés nélkül ez nem teljes APM-szintű mérés, hanem megalapozott fejlesztői diagnózis.
