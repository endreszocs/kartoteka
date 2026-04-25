# KARTOTEKA — Egyházi CNP rendszer (cross-congregation tag-azonosítás)

**Dátum**: 2026-04-26
**Státusz**: terv (Fázis 1 implementálva — `generate_egyhazi_cnp()` SQL helper); Fázis 2-5 hátra
**Téma**: minden tag egyedi „egyházi CNP"-t kap, ami **a teljes EREK rendszerben azonosítja**.
Cél: ugyanaz a személy több gyülekezetben legyen detektálható, családfa-összeállítás
támogatása, duplikáció-szűrés.

## Endre eredeti megfogalmazása

> A cnp-t a rendszer adja! Ennek az a szerepe, hogy kapjon mindenki egy egyedi
> „egyházi CNP"-t — ez nem egyezik a hivatalos romániai cnp-vel.
> Szerepe: hogy kiszűrjük azokat akik több gyülekezetben is vannak.
> Úgy van az elképzelés, hogy nyilván tudjuk tartani és a lelkészek lássák azt,
> ha egy személy több gyülekezetben is van — ez a családfa összeállítása miatt
> is nagyon fontos.
>
> Minden személy bevételekor a rendszernek ellenőriznie kell, hogy a név és a
> telefonszám egyezik-e — ha egyezik, akkor jelezze a lelkésznek, hogy ilyen nevű
> van már egy másik gyülekezetben. Ebben az esetben ha tényleg egyezik a két személy,
> akkor ugyanazzal az egyházi CNP-vel lesz rögzítve a két gyülekezetben, jelezve hogy
> ez ugyanaz a személy.

## Architektúra (öt fázis)

### Fázis 1 — `generate_egyhazi_cnp()` SQL helper ✅ KÉSZ

A `2026-04-26-FIX-import-varchar-and-egyhazi-cnp.sql` migrációban implementálva.

**Formátum**: `EC-YYYY-XXXXXXXXXX` (18 karakter)
- `EC` = "Egyházi CNP" prefix (rendszer-szintű azonosító)
- `YYYY` = a regisztrálás éve (mikor került a rendszerbe)
- `XXXXXXXXXX` = 10 karakteres random alphanumerikus hash

**Karakterkészlet** a random részben: `ABCDEFGHJKMNPQRTUVWXYZ234679` (28 karakter, kihagyva a könnyen összetéveszthetők: `0/O`, `1/I/L`, `5/S`, `8/B`). 28^10 ≈ 3 × 10^14 lehetséges érték.

**Egyediség**:
- A `szemely` táblán létezik PARTIAL UNIQUE INDEX `(congregation_id, cnp) WHERE isvisible=true`
- **Ez NEM globális unique** — egy gyülekezeten belül egyedi a CNP, de ugyanaz a CNP **megjelenhet több gyülekezetben** → ez KÖTI ÖSSZE ugyanazt a személyt
- Birthday paradox alapján gyülekezetenként 1000 fő esetén az ütközés-valószínűség < 10^-12

### Fázis 2 — `find_potential_cross_congregation_match` RPC

**Cél**: új tag bevitelnél (kézi vagy importnál) megnézi, van-e másik gyülekezetben azonos név + telefonú személy.

```sql
CREATE FUNCTION public.find_potential_cross_congregation_match(
    p_csaladnev text,
    p_k_nev text,
    p_telefon text,
    p_exclude_congregation_id uuid DEFAULT NULL
) RETURNS TABLE(
    matched_congregation_id uuid,
    matched_congregation_name text,
    egyhazi_cnp varchar(20),
    matched_szemely_id integer,
    confidence text  -- 'name_phone_exact' | 'name_only' | 'phone_only'
)
SECURITY DEFINER
LANGUAGE plpgsql;
```

**Logika**:
1. Ha **név + telefon** egyezik → `confidence='name_phone_exact'` (BIZTOS)
2. Ha csak **név** egyezik (case-insensitive) ÉS születési dátum is egyezik → `confidence='name_birth'` (NAGYON VALÓSZÍNŰ)
3. Ha csak **telefon** egyezik → `confidence='phone_only'` (CSAK FIGYELMEZTETÉS)

**Adatvédelmi szempont** (`feedback_gyulekezeti_autonomia` szerint):
- A lelkész **NEM láthatja** a másik gyülekezet teljes szemely-rekordját
- A visszatérési érték CSAK: gyülekezet neve, az `egyhazi_cnp` (hogy össze tudjuk kötni), confidence
- A lelkész döntés után **csak a CNP-t** kap meg, semmi mást
- A `SECURITY DEFINER` engedélyezi a cross-congregation lookup-ot, a return type szigorúan limitált

### Fázis 3 — `CrossCongregationMatchDialog` UI komponens

**Lokáció**: `apps/web/components/members/cross-congregation-match-dialog.tsx`

**Megjelenés**: ha a `find_potential_cross_congregation_match` talál legalább egy egyezést, modal nyílik:

```
┌──────────────────────────────────────────────────────────┐
│  🔍 Hasonló tag már létezik más gyülekezetben            │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Te most ezt a tagot szeretnéd hozzáadni:                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Tamás Gábor                                          │  │
│  │ Telefon: 0740 123 456                                │  │
│  │ Lakcím: Templom u. 229, Barátos                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  Egy ilyen nevű és telefonú tag már szerepel a            │
│  ✓ Sepsiszentgyörgyi Református Gyülekezet                │
│    címén — az egyházi CNP: EC-2024-K3M7P9R2X4              │
│                                                            │
│  Ugyanaz a személy?                                       │
│                                                            │
│  ○ Igen, ugyanaz a személy → ugyanazzal az egyházi        │
│    CNP-vel rögzítjük (a családfa-összeállításhoz fontos) │
│                                                            │
│  ○ Nem, más személy → új egyházi CNP generálása           │
│                                                            │
│  ○ Mégsem, megszakítom a felvitelt                        │
│                                                            │
│                              [Megszakítás] [Megerősítem]  │
└──────────────────────────────────────────────────────────┘
```

A dialog **soha nem mutatja a másik gyülekezet egyéb adatait** — csak a gyülekezet neve és az egyházi CNP látszik.

### Fázis 4 — Member-form-dialog beépítés

A `apps/web/components/modals/member-form-dialog.tsx`-ben:
- A „Mentés" gomb előtt server action hívás: `find_potential_cross_congregation_match`
- Ha találat van → `CrossCongregationMatchDialog` nyitódik
- A felhasználó döntése alapján:
  - **„Igen, ugyanaz"** → `cnp = matched.egyhazi_cnp` (a meglévő CNP használata)
  - **„Nem, más"** → `cnp = generate_egyhazi_cnp()` (új CNP)
  - **„Mégsem"** → mentés megszakítva

### Fázis 5 — Import wizard beépítés

A `family-link-step` után új lépés a wizardba (vagy az import befejezésekor batch-ellenőrzés):
- Az importált sorok mindegyikére fut a cross-congregation matching
- Az eredmény egy **review tábla**: hány lehetséges duplikáció talált, melyik gyülekezetekben
- A felhasználó **batch-szinten** döntheti:
  - „Az ÖSSZES talált egyezés → ugyanazzal a CNP-vel" (gyors)
  - „Egyenként megnézem és döntök" (manual review)
  - „Most nem foglalkozom vele, később megnézem"

## Új admin nézet — Cross-congregation tagok

**Helye**: `/admin` → Felhasználók fül vagy új „Cross-congregation tagok" tab

**Mit mutat**:
- Egyházi CNP-k, amelyek **több mint 1 gyülekezetben** szerepelnek
- Az adott CNP-hez tartozó gyülekezetek listája + a tag neve
- Lehetőség: split (ha tévesen összevontuk) vagy merge (ha rosszul külön kezeljük)

```sql
-- Példa lekérdezés (admin nézethez)
SELECT
    s.cnp,
    array_agg(DISTINCT c.nev_hu) AS gyulekezetek,
    COUNT(DISTINCT s.congregation_id) AS gyulekezet_szam,
    array_agg(DISTINCT (s.csaladnev || ' ' || s.k_nev)) AS nevek
FROM public.szemely s
JOIN public.congregations c ON c.id = s.congregation_id
WHERE s.isvisible = true
  AND s.cnp LIKE 'EC-%'  -- csak az új egyházi CNP-k
GROUP BY s.cnp
HAVING COUNT(DISTINCT s.congregation_id) > 1
ORDER BY COUNT(DISTINCT s.congregation_id) DESC;
```

## Családfa-összeállítás — hogyan segít az egyházi CNP

A meglévő `szemely.id_apja` és `szemely.id_anyja` mezők CNP-re hivatkoznak (lásd
`Database_schema.sql:2044-2045`):

```sql
CONSTRAINT szemely_id_apja_fk FOREIGN KEY (id_apja) REFERENCES public.szemely(cnp),
CONSTRAINT szemely_id_anyja_fk FOREIGN KEY (id_anyja) REFERENCES public.szemely(cnp),
```

**De a FK NEM a (congregation_id, cnp) párra hivatkozik, csak a CNP-re.** Ez azt jelenti:
- Ha az apa egy másik gyülekezetben van rögzítve (pl. egy idős szülő, aki más
  gyülekezeti tag), DE ugyanaz az egyházi CNP van mindkét helyen → a gyerek
  `id_apja = apja_cnp` mező egyértelműen az adatbázisban azonosítja.
- A családfa-összeállítás a CNP-mező alapján mehet, gyülekezet-független.

## Adatvédelmi és RLS megfontolások

- A `find_potential_cross_congregation_match` RPC `SECURITY DEFINER` — **megkerüli az RLS-t**, mert csak így tud cross-congregation lookup-ot
- A return type szigorúan limitált — soha nem a teljes szemely rekord
- Az új admin nézet (cross-congregation tagok) **csak master admin** számára látható
- Az **éves jelentésekbe és statisztikákba** a cross-congregation tagok továbbra is
  **gyülekezeti rekord-szerint** számítanak (mind a 2 gyülekezet a saját statisztikájában látja)

## Implementációs sorrend

| Fázis | Tartalom | Munkaóra | Státusz |
|---|---|---|---|
| 1 | `generate_egyhazi_cnp()` SQL helper | 0.5 | ✅ KÉSZ (2026-04-26 hotfix) |
| 2 | `find_potential_cross_congregation_match` RPC + tesztek | 2 | ⏳ Hátra |
| 3 | `CrossCongregationMatchDialog` UI komponens | 3 | ⏳ Hátra |
| 4 | Member-form-dialog beépítés | 1.5 | ⏳ Hátra |
| 5 | Import wizard batch-ellenőrzés | 2.5 | ⏳ Hátra |
| 6 | Admin nézet a cross-congregation tagokhoz | 2 | ⏳ Hátra |

**Összes munka: ~11 óra** (1.5 napi munka). Endre döntheti, hogy mikor kezdjük.

## Nyitott kérdések — a részleges implementáció előtt

1. **Telefonszám-formátum normalizálás**: a telefonszámokat eltérő formátumban viszik
   be (pl. `0740123456`, `+40 740 123 456`, `0740-123-456`). A matching előtt
   normalizálni kell. Egy `normalize_phone()` SQL helper kell.

2. **Név-fuzzy egyezés**: a szem-szám érzékeny? Pl. „Tamás Gábor" vs „Tamas Gabor"
   (ékezet nélkül). Az `unaccent` PG kiterjesztés telepítése szükséges? Vagy
   egy custom `normalize_name()` helper?

3. **A meglévő ~85.000+ szemely rekord** mi lesz vele? **NEM** rendelkezik egyházi
   CNP-vel, a `cnp` mezője most a román személyi szám vagy üres. Két opció:
   - **A**: Hagyjuk őket, csak az új rekordok kapnak EC-CNP-t (gradual rollout)
   - **B**: Egyszeri migráció — minden meglévő szemely kap EC-CNP-t (a régi cnp
     mehet egy új `external_cnp` mezőbe)

4. **A jelenlegi `szemely.cnp` mező**: ha eddig is használták (esetleg román CNP-vel),
   akkor a `EC-YYYY-XXX` formátum váltása konfliktusba ütközhet a meglévő rekordokkal.
   **Endre döntése kell.**

## Hivatkozások

- Fázis 1 hotfix SQL: `migration-docs/sql/2026-04-26-FIX-import-varchar-and-egyhazi-cnp.sql`
- Memória: `feedback_gyulekezeti_autonomia.md` (8 alapelv az autonómiáról)
- Korábbi project log: `KARTOTEKA-tagnyilvantartas-import-wizard-2026-04-25.md`
- DB séma referencia: `migration-docs/Database_schema.sql:2044-2045` (id_apja/id_anyja FK)
