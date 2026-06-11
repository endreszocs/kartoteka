-- ============================================================================
-- KARTOTÉKA — Bevétel-kategória duplikátum-kereső (2026-06-11) · EGY lekérdezés
--
-- MIÉRT: a rögzítőben 31 bevételi kategória maradt, a hivatalos egyházközségi
-- lista viszont 30 tételes. A hivatalos Excel-sablonban a 101.06 (Sírhelyek…)
-- sor KÉTSZER szerepel — valószínű, hogy a választékban is duplán van egy
-- kategória. Ez a lekérdezés megmutatja. CSAK OLVAS.
--
-- HA AD TALÁLATOT: küldd vissza — adok biztonságos összevonó szkriptet
-- (a duplikátum kikapcsolása, a rögzített tételek átkötésével).
-- ============================================================================
SELECT b.id_szamadasicel AS kod, s.nev,
       COUNT(*) AS hany_peldany,
       array_agg(b.id ORDER BY b.id) AS befizetescel_id_k
  FROM befizetescel b
  LEFT JOIN szamadasicel s ON s.id = b.id_szamadasicel
 WHERE b.aktiv = true
 GROUP BY b.id_szamadasicel, s.nev
HAVING COUNT(*) > 1
 ORDER BY b.id_szamadasicel;
