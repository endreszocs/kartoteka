-- ═══════════════════════════════════════════════════════════════════════════
--  KUKA deleted_at — RÉSZLETES ellenőrzés táblánként (CSAK OLVAS)
-- ═══════════════════════════════════════════════════════════════════════════
--  A 2026-08-14-kuka-deleted-at.sql futtatásakor az editor csak az UTOLSÓ
--  lekérdezés (3 soros összegzés) eredményét mutatta — ez itt az ELSŐ,
--  12 táblás ellenőrzés önállóan. Mind a 12 sorban ✅✅✅-nak kell lennie.
--  Ha valahol ❌ van, azt a táblát a migráció hangos figyelmeztetéssel
--  kihagyta (pl. hiányzó jelző-oszlop) — küldd vissza, megnézem!
-- ═══════════════════════════════════════════════════════════════════════════

WITH terv(tabla) AS (
  VALUES ('berleti_szerzodes'), ('iktato'), ('iktato_sablonok'),
         ('sirhelytemeto'), ('sirhely'), ('sirhelyberles'), ('sirhelyelhunyt'),
         ('befizetes'), ('kiadas'), ('belsomozgas'), ('munkanaplo'), ('leltar_tetelek')
)
SELECT
  t.tabla,
  CASE WHEN c.column_name IS NOT NULL THEN '✅' ELSE '❌ NINCS deleted_at' END AS deleted_at_oszlop,
  CASE WHEN tg.tgname     IS NOT NULL THEN '✅' ELSE '❌ NINCS trigger'    END AS belyegzo_trigger,
  CASE WHEN tg.tgenabled = 'O'        THEN '✅' ELSE '❌ trigger NEM aktív' END AS trigger_aktiv
FROM terv t
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public' AND c.table_name = t.tabla AND c.column_name = 'deleted_at'
LEFT JOIN pg_trigger tg
       ON tg.tgrelid = to_regclass('public.' || t.tabla)
      AND tg.tgname  = 'kuka_deleted_at_' || t.tabla
      AND NOT tg.tgisinternal
ORDER BY t.tabla;
