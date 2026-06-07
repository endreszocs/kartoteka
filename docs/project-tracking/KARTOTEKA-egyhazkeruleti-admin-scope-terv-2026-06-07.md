# Terv: Egyházkerületi admin — „csak a saját egyházkerületére" (#2)

> Ez **terv**, nem kód. Beszéljük át, mielőtt nekiállok. A többi 9 admin-javítás
> már kész és élesben; ez a 10., a legnagyobb és **biztonság-kritikus** pont.

---

## Mit jelent — érthetően

Ma az **egyházkerületi admin** beléphet az admin felületre, és — ha eljut egy
művelethez — elvileg **BÁRMELYIK** gyülekezet/egyházmegye adatát módosíthatja.
A cél: **csak a SAJÁT egyházkerületéhez** tartozó gyülekezeteket/egyházmegyéket
lássa és módosíthassa. A **fő rendszergazda (master)** és a teljes **rendszergazda
(admin)** továbbra is mindent lát és kezel — náluk nincs változás.

## Honnan tudjuk, mi az ő egyházkerülete

A rendszer **már tárolja**: az „egyházkerületi admin" szerepkörhöz tartozik egy
egyházkerület-azonosító (a `profile_roles` táblában, `scope='district'`). Ezt
használjuk — nem kell új adat. A lánc, amin az ellenőrzés fut:
**gyülekezet → egyházmegye → egyházkerület**.

---

## A munka 4 fázisból áll (sorban, mindegyik után commit + teszt)

### 1. fázis — Alapok (segédeszközök) · kockázat: kicsi
- Egy közös segéd: „melyik egyházkerület(ek)hez tartozik ez az admin?"
- Egy ellenőrző: „ez a gyülekezet (vagy egyházmegye) az ő egyházkerületében van-e?"
- Új kód, semmit nem tör el.

### 2. fázis — LÁTÁS szűrése (mit lát) · kockázat: közepes
A listák a kerületi adminnak **csak a saját egyházkerülete** adatait mutassák:
- Gyülekezetek, Felhasználók, Könyvelők/számvevők, Rendszer-pénzügyei.
- A master/teljes admin mindent lát, mint eddig.
- Ha valamit kihagynánk, a kerületi admin **többet látna** a kelleténél — de
  módosítani akkor sem tudna (azt a 3. fázis védi).

### 3. fázis — MÓDOSÍTÁS védelme (mit tehet) · ez a LEGFONTOSABB biztonsági rész
Minden módosító műveletnél ellenőrizzük, hogy a cél **az ő egyházkerületében**
van-e; ha nem → elutasítás. Az érintett, **egyenként átnézendő** műveletek:
- Gyülekezet adatainak szerkesztése
- Felhasználó jóváhagyása / szerepkör kiosztása egy gyülekezethez
- Könyvelő / számvevő hozzárendelése
- Import (tagok betöltése egy gyülekezetbe)
- Rendszer-pénzügyek (előfizetés) gyülekezetenként
- **Veszélyes zóna — adattisztítás (wipe):** itt különösen fontos
  *(megjegyzés: a wipe-nak már van adatbázis-oldali újraellenőrzése, de azt is
  ki kell egészíteni a kerület-ellenőrzéssel — ezt külön megnézem)*
- Lelkészcsere / átadás-átvétel, ha gyülekezetet érint

Kis lépésekre bontom (műveletenként), hogy **se a jogos kerületi admint ne zárjuk
ki, se rést ne hagyjunk**.

### 4. fázis — Adatbázis-szintű védőháló (opcionális, de ajánlott) · SQL-munka
A legbiztosabb: maga az adatbázis (RLS-szabályok) se engedje, hogy egy kerületi
admin más kerület adatát módosítsa — még akkor sem, ha a kódban valahol kimaradna
az ellenőrzés. Ez **SQL-fájl, amit te futtatsz le**. Nagyobb, gondos lépés.

---

## Döntések — RÖGZÍTVE (2026-06-07)

1. **Más kerületek adatait NE is lássa** a kerületi admin. A listák csak a saját
   egyházkerületét mutatják. ✅
2. **Előbb a kód-szintű védelem** (1–3. fázis), az adatbázis-háló (4. fázis, SQL)
   külön, későbbi lépésben. ✅
3. **Az adattisztítás (wipe) csak a fő rendszergazdáé** — a kerületi admin hozzá
   sem fér. ✅
4. **Több egyházkerület esetén mindegyikhez hozzáfér** (a profile_roles összes
   district-scope sora). ✅

> Nyitott teendő: ellenőrizni, hogy a meglévő egyházkerületi adminoknál be van-e
> állítva a kerület (`profile_roles.scope_id`). Ha nincs, pótolni kell, különben
> „semmit nem lát". → ezt SQL-diagnosztikával nézzük meg a 2. fázis tesztjekor.

---

## Ütemezés
Fázisonként haladnék, mindegyik után commit + teszt. A 3. fázis (módosítás-védelem)
a kritikus — azt műveletenként, apró lépésekben csinálom, hogy biztonságos legyen.

**Becslés:** 1–2. fázis együtt egy menet; a 3. fázis több kis menet (műveletenként);
a 4. fázis (SQL) külön. Nem kapkodom — ez biztonsági rész.

---

## MEGVALÓSÍTÁS ÁLLAPOTA (2026-06-07)

### ✅ Kész és élesben (kód-szint, 4 commit a main-en)

**Fázis 1 — segédeszközök** (`apps/web/lib/auth/admin-scope.ts`):
`getAdminDistrictScope`, `getScopedDioceseIds`, `getScopedCongregationIds`,
`getScopedActiveUserIds`, `assertCongregationInScope`, `assertDioceseInScope`,
`assertUserInScope` (pending usernél az access_request kért kerülete dönt),
`assertDistrictInScope`, `assertScopeTargetInScope`.

**Fázis 2 — látás (listák szűrése):** admin Áttekintő, Gyülekezetek (lista +
egyházmegye-bontás), Felhasználók, gyülekezet-részletek, egyházmegye-lista,
adatminőség-ellenőrzés, szerepkör-form legördülői, szerepkör-lista.

**Fázis 3 — módosítás-védelem:**
- Felhasználó: jóváhagyás / gyors-jóváhagyás / elutasítás / törlés / szerep-állítás
  / gyülekezetbe-belépés — mind a hatókörre ellenőriz.
- Szerepkörök: kiosztás / visszavonás / engedély-módosítás — a cél hatókör a saját
  kerületben kell (system szint csak teljes adminnak).
- Könyvelő/számvevő: hozzárendelés / visszavonás / lista — a saját kerületre.
- Körlevél/hírlevél: bármilyen célzás mellett is csak a saját kerület tagjaihoz;
  a célzó legördülők is szűrve.
- **Adattisztítás (wipe): csak fő rendszergazda / teljes admin** (kerületi admin
  hozzá sem fér — `allowDistrictAdmin: false`).

### ⏳ Hátralévő — Fázis 4 (adatbázis-szintű védőháló, SQL — később)

1. **Diagnosztika (kész, futtatásra vár):**
   `migration-docs/sql/2026-06-07a-diagnoszt-egyhazkeruleti-admin-scope.sql` —
   ellenőrzi, hogy a meglévő kerületi adminoknál be van-e állítva a kerület
   (`profile_roles.scope_id` vagy `profiles.district_id`). Ha valakinél hiányzik,
   célzott UPDATE-et küldök. **Ezt futtasd le, mielőtt élesben tesztelnéd a
   kerületi admin nézetét** — enélkül a hiányos beállítású admin „semmit nem lát".

2. **`wipe_congregation_data` RPC szigetése:** a szerveroldali jogosultság-check
   jelenleg `admin / egyhazkeruleti_admin / egyhazmegyei_admin`-t enged. A TS-guard
   már blokkolja a kerületi admint az UI-ról, de defense-in-depth-ként az RPC-t is
   `admin`-only-ra kell szűkíteni. Az élő RPC későbbi FIX-ekkel módosulhatott, ezért
   a teljes élő forrás ellenőrzésével írom újra (nem vakon).

3. **RLS védőháló (opcionális, legbiztosabb):** policy-k, hogy az adatbázis maga is
   tiltsa a kerületen kívüli módosítást — még ha a kódból kimaradna egy ellenőrzés.
