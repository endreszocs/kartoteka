-- ============================================================================
-- KARTOTÉKA — BEKÜLDÉSI LÁNC ÁLLAPOTFELMÉRÉS (2026-08-11, 6. kör)
--
-- MI EZ: CSAK OLVASÓ ellenőrzés. Semmit nem ír, nem töröl, nem módosít.
-- Azt méri fel, hogy az ÉLES adatbázisban mekkora nyoma van annak a hat
-- hibának, amit a kód-oldali javítás megszüntetett — hogy tudd, kellett-e
-- bárkinél kézzel is hozzányúlni.
--
-- HOGYAN FUTTASD: Supabase → SQL Editor → az EGÉSZET illeszd be → Run.
-- (A Studio csak az UTOLSÓ utasítás eredményét mutatja, ezért ez SZÁNDÉKOSAN
--  EGYETLEN SELECT, UNION ALL-lal összefűzve — minden sor egy ellenőrzés.)
--
-- HOGYAN OLVASD: az `ertek` oszlop a talált darabszám. A 0 mindenhol a jó
-- eredmény. Ahol nem 0, ott a `mit_jelent` megmondja, hogy kell-e tenni vele
-- valamit — a legtöbb esetben NEM: a javított kód a régi adatot is helyesen
-- kezeli, a sor csak azt mutatja, hány dokumentumot érintett eddig a hiba.
-- ============================================================================

select *
from (

  -- 1) A megyénél 0 lejjel megjelenő, beküldött SZÁMADÁSOK -------------------
  -- A véglegesítő wizard `actualIncome` / `actualExpense` kulcsokkal küldte be
  -- a pillanatképet, a dokumentumközpont viszont `income` / `expense` kulcsot
  -- olvasott → az esperes minden számadásnál 0 lejt látott, és a
  -- dokumentumközpontból nyomtatott ív is 0 lejes volt.
  select
    1 as sorszam,
    'Beküldött számadás RÉGI kulcsokkal (a megye eddig 0 lejt látott)' as ellenorzes,
    count(*)::text as ertek,
    'NEM kell adatmigráció: a javított dokumentumközpont a régi alakot is olvassa. Ez a szám csak azt mutatja, hány beküldés jelent meg eddig hibásan.' as mit_jelent
  from document_submissions
  where document_type = 'szamadas'
    and snapshot_data ? 'actualIncome'
    and not (snapshot_data ? 'income')

  union all

  -- 2) Beküldött számadás, amiben EGYIK alak sincs meg -----------------------
  select
    2,
    'Beküldött számadás, amiben SEMMILYEN összeg nincs',
    count(*)::text,
    'Ha nem 0: ezeknél a pillanatkép tényleg üres — az érintett gyülekezetnek feloldás után újra be kell küldenie a számadást.'
  from document_submissions
  where document_type = 'szamadas'
    and not (snapshot_data ? 'actualIncome')
    and not (snapshot_data ? 'income')

  union all

  -- 3) BEKÜLDÖTT számadás, de a gyülekezeti év NINCS lezárva -----------------
  -- Ez a néma no-op nyoma: a zárás UPDATE-je 0 sort érintett (nem volt évi
  -- beállítás-sor vagy az RLS elnyelte), a program mégis továbbment a
  -- beküldésre. Az irat elment, az év viszont nyitva maradt — a beküldött
  -- pillanatkép azóta csendben elévülhetett.
  select
    3,
    'Beküldött SZÁMADÁS, de a gyülekezeti év nincs lezárva',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(distinct ds.congregation_id::text || '/' || ds.year::text, ', '),
      'Nincs ilyen — rendben.'
    )
  from document_submissions ds
  left join bealitas b
    on b.congregation_id = ds.congregation_id
   and b.id = ds.year::text
  where ds.document_type = 'szamadas'
    and coalesce(b.accounting_finalized, false) = false
    and ds.status <> 'returned'

  union all

  -- 4) BEKÜLDÖTT költségvetés, de a zár-zászló nincs bekapcsolva -------------
  select
    4,
    'Beküldött KÖLTSÉGVETÉS, de a költségvetés nincs véglegesítve',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(distinct ds.congregation_id::text || '/' || ds.year::text, ', '),
      'Nincs ilyen — rendben.'
    )
  from document_submissions ds
  left join bealitas b
    on b.congregation_id = ds.congregation_id
   and b.id = ds.year::text
  where ds.document_type = 'koltsegvetes'
    and coalesce(b.budget_finalized, false) = false
    and ds.status <> 'returned'

  union all

  -- 5) Feloldási kérelem NEM a naptári évre ----------------------------------
  -- Az egyházmegyei áttekintő a naptári évre volt szegezve, ezért a januárban
  -- beadott (az ELŐZŐ év sorára írt) javítási kérelem sosem jelent meg az
  -- esperesnél, a lelkésznél viszont „elbírálás alatt" állapotba ragadt.
  select
    5,
    'Nyitott feloldási kérelem NEM a naptári évre (eddig láthatatlan volt)',
    count(*)::text,
    coalesce(
      'Érintett (gyülekezet/év): ' || string_agg(congregation_id::text || '/' || id, ', '),
      'Nincs ilyen — rendben.'
    )
  from bealitas
  where (
      coalesce(unlock_requested, false)
      or coalesce(accounting_unlock_requested, false)
      or coalesce(leltar_unlock_requested, false)
    )
    and id <> extract(year from current_date)::int::text

  union all

  -- 6) Duplikált beküldés-csoport --------------------------------------------
  -- A (gyülekezet, év, típus, módosítás-szám) négyesnek egyedinek kell lennie
  -- (NULLS NOT DISTINCT, lásd 2026-07-10-document-submissions-idempotencia.sql).
  -- Ha itt nem 0 áll, az az egyediségi megszorítás hiányzik az éles adatbázisból.
  select
    6,
    'Duplikált beküldés-csoport (gyülekezet + év + típus + módosítás)',
    count(*)::text,
    'Ha nem 0: az egyediségi megszorítás hiányzik — futtasd a 2026-07-10-document-submissions-idempotencia.sql-t.'
  from (
    select congregation_id, year, document_type, modification_number
    from document_submissions
    group by congregation_id, year, document_type, modification_number
    having count(*) > 1
  ) dup

  union all

  -- 7) Feloldott költségvetés-módosítás, ragadt beküldés-sorral --------------
  -- A régi feloldás mindig az ALAP költségvetést nyitotta ki, a módosítás
  -- beküldés-sora viszont zárva maradt — a lelkész a javítás után a
  -- felülírás-védelembe futott bele.
  select
    7,
    'Beküldött költségvetés-MÓDOSÍTÁS lezárt/továbbított állapotban',
    count(*)::text,
    'Tájékoztató. Ha egy gyülekezet ilyet akar javítani, a megye a javított feloldással (legfelső véglegesített szint) most már ki tudja nyitni.'
  from document_submissions
  where document_type = 'koltsegvetes_modositas'
    and (status = 'finalized' or forwarded_to_kerulet = true)

) osszesites
order by sorszam;
