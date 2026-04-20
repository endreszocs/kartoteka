# KARTOTEKA — Esperes és egyházmegyei admin RLS-szintű szűkítése (JÖVŐBELI KÖR)

**Dátum**: 2026-04-16 (feltárva, elhalasztva)
**Állapot**: nyitva — **NEM része a WC-7-nek**
**Fontosság**: magas biztonsági javítás, de nem blokkoló
**Hatálya**: a teljes RLS rendszer + minden `esperes`/`egyhazmegyei_admin` jogosultsági pont

---

## Probléma

Jelenleg a `current_user_has_global_access()` függvény:

```sql
SELECT EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'active'
    AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
);
```

Emiatt az **esperes** és az **egyházmegyei admin** is **RLS-szinten globális** hozzáférésűek — azaz **bármely gyülekezet minden adatát** láthatják, nem csak a saját egyházmegyéjükben lévőket.

**Felhasználói megerősítés 2026-04-16**: „Így van: az esperes csak a saját egyházmegyéjéhez kellene hozzáférjen RLS szinten."

## Jelenlegi valós biztonság

- Az **alkalmazás kódja** (Server Action-ök, Dashboard komponensek) valószínűleg **szerver oldalon szűrik** az esperes adatait a saját egyházmegyéjére (`diocese_id`)
- Az RLS csak **engedélyező réteg** — ha az alkalmazás hibázik, **azonnal** kilát más egyházmegyékre
- **Defence in depth NEM érvényesül** a jelenlegi állapotban

## Miért halasztottuk el

1. **Kockázat**: ha az app kódja valahol **ténylegesen** használja az RLS-ből jövő „globális esperes" jelleget, egy hirtelen szűkítés **láthatatlan regressziót** okozhat
2. **Audit igény**: meg kell vizsgálnunk MINDEN esperes-releváns lekérdezést az app kódjában, hogy stabil legyen az áttérés
3. **WC-7 fókusz**: az új szerepkörök integrálása elsődleges, a meglévő szerepkörök átszabása másodlagos

## Javasolt megoldás (amikor sorra kerül)

### 1. Új helper függvény

```sql
CREATE OR REPLACE FUNCTION public.current_user_diocese_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT diocese_id FROM public.profiles
  WHERE id = auth.uid() AND status = 'active';
$function$;
```

### 2. `has_global_access()` szűkítése

```sql
CREATE OR REPLACE FUNCTION public.current_user_has_global_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role = 'admin'  -- KORÁBBI: 'admin', 'esperes', 'egyhazmegyei_admin'
  );
$function$;
```

### 3. `can_access_congregation()` bővítés — esperes + egyházmegyei admin ágak

```sql
-- hozzáadni a can_access_congregation() függvényhez:

OR (
  target_cong IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.congregations c ON c.id = target_cong
    WHERE p.id = auth.uid()
      AND p.status = 'active'
      AND p.role IN ('esperes', 'egyhazmegyei_admin')
      AND c.diocese_id = p.diocese_id
  )
)
```

## Audit lépések, mielőtt futtatjuk

1. **Grep minden `esperes`/`egyhazmegyei_admin` használatot** a kódban
2. **Minden Server Action-ben ellenőrizni**: szerver oldalon szűr-e a diocese_id-ra minden esperes-kérésre?
3. **Pénzügyi dashboard** (`/dashboard-egyhazmegye`): szűr-e az esperes saját megyéjére?
4. **Esperes-specifikus listák** (pl. éves jelentés jóváhagyás, gyülekezet-lista): minden lekérdezés átgondolása
5. **TESZTELÉS**: 2-3 teszt-esperes fiók, különböző egyházmegyékben, minden pénzügyi művelet kipróbálása

## Mikor szánjuk erre időt

- Ha **a WC-7 lezárult** (szerepkör-integráció stabil)
- Ha **az új szerepkörök UI** (konyvelo, szamvevo) tesztelt és stabil
- Ha **van min. 2-3 valódi gyülekezet** a rendszerben, hogy a szűkítés hatását értékelni tudjuk
- Nem előbb, mint **a teljes WC-1..WC-8 ciklus befejezése**

## Hivatkozás

Ez a munkacsomag a `KARTOTEKA-penzugy-rls-takaritas-terv-2026-04-16.md` "ÚJ KOCKÁZAT" szekciójából emelkedik ki.
