-- Jegyzőkönyv struktúra módosítás:
-- 1. Igevers mező a fő táblában
-- 2. A napirendi pont = jegyzőkönyvi pont (tartalmazza a kifejtést)
-- 3. A határozat közvetlenül a napirendi ponthoz kapcsolódik
-- 4. Az eredeti táblák már léteznek, csak bővítjük

-- Fő tábla bővítése: igevers + felolvasó
ALTER TABLE public.presbiteri_jegyzokonyvek
  ADD COLUMN IF NOT EXISTS igevers text,
  ADD COLUMN IF NOT EXISTS felolvasas text;

-- A napirendi_pontok tábla már van és tartalmaz "targyalas" mezőt
-- (ez a "jegyzőkönyvi pont kifejtése")
-- Nincs módosítás szükséges

-- A hatarozatok tábla már kapcsolódik a napirendi_ponthoz
-- (napirendi_pont_id FK létezik)
-- Nincs módosítás szükséges

-- BIZTONSÁGI MEGJEGYZÉS:
-- Minden server action a getEffectiveAccessContext()-ból kapja a congregation_id-t
-- és azzal szűr — így egy gyülekezet nem láthatja a másik adatait.
-- Az RLS nincs bekapcsolva (ahogy a többi modulnál sem: munkanaplo, iktato, stb.)
-- mert az app szintű szűrés biztosítja a hozzáférés-kontrollt.
