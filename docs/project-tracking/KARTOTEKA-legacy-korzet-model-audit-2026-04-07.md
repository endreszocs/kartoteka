# KARTOTEKA legacy korzetmodell audit

Datum: 2026-04-07
Statusz: aktiv referencia

## Cel

Ez a rovid audit azt rogzitI, hogyan viszonyul egymashoz a modern `congregations` modell es a legacy `csoport` / `gyulekezetek` korzetorokseg.

## Megallapitasok

### 1. A modern app fo scope-modellje a `congregations`

- A jelenlegi alkalmazaskod a gyulekezeti scope-ot szeles korben a `congregation_id` mezore epiti.
- A `profiles`, `szemely`, `bealitas`, `befizetes`, `kiadas`, `munkanaplo`, `bankszamlak` es tovabbi fo tablák mind ebbe az iranyba mutatnak.

### 2. A korzeti orokseg tovabbra is a `csoport` tablaban el

- A tagnyilvantartasi dokumentacio a korzetkezelest tovabbra is a `csoport` tablahoz koti.
- A `presbiter` es a `csalad` kapcsolatok is `id_csoport` alapon hivatkoznak korzetre.
- A `csoport` tablan a referencia schema szerint nincs direkt `congregation_id`.

### 3. A referencia schema hordoz egy legacy hidat, de ez nem latszik aktiv app-kapcsolatnak

- A source schema szerint a `gyulekezetek` tabla tartalmaz `id_csoport` kapcsolatot.
- Ugyanakkor a jelenlegi Next.js app kodjaban nem talalhato aktiv `gyulekezetek` tablaolvasas vagy -iras.
- A modern kod a gyulekezeti nezeteket es jogosultsagokat a `congregations` vilagara epiti.

### 4. A jelenlegi rendszerben nincs egyertelmu, hasznalt schema-hid

- A kodoldalon nem latszik olyan aktiv, megbizhato lekepezes, amely a modern `congregations.id` rekordot egy konkret legacy `gyulekezetek` vagy `csoport` rekordhoz kotne.
- Emiatt nem biztonsagos azt feltetelezni, hogy egy `csoport` rekord automatikusan es egyertelmuen egyetlen modern gyulekezethez tartozik.

## Kovetkezmenyek

### Mukodesi kovetkezmeny

- A korzetkezelesnel vedoretegre van szukseg.
- Ez indokolja a lathatosagi szabalyokat: csak a jelenlegi gyulekezethez kotheto vagy meg sehol nem hasznalt korzetek latszanak es szerkeszthetok.

### Fejlesztesi kovetkezmeny

- A `csoport` modellel kapcsolatos tovabbi modositasokat nem szabad egyszeru mezonev-egysegesiteskent kezelni.
- Kulon migracios dontes kell arrol, hogy:
  - megszunik-e a legacy `gyulekezetek` kapcsolat,
  - kap-e a `csoport` direkt modern gyulekezeti scope-ot,
  - vagy egy uj, explicit mapping tabla vezeti at a ket vilag kozott az osszekotest.

## Jelenlegi biztonsagos allapot

- A korzet CRUD es hozzarendeles a lathatosagi szabalyra epul.
- A valasztoi lista csak lathato korzetneveket hasznal.
- A csaladreszletezo nem mutat idegen, nem lathato korzetkapcsolatot legitim adatkent.

## Javasolt kovetkezo lepes

1. Kulon dontesi dokumentum a `csoport` / `gyulekezetek` / `congregations` jovobeli kapcsolatara.
2. Ennek utan a maradek `congregations` es profile-context egysegesites folytatasa.
3. Csak ezutan erdemes melyebben hozzanyulni a korzetek tartos adatmodelljehez.
