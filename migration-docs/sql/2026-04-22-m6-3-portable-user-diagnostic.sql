-- ════════════════════════════════════════════════════════════════════════════
--  M6.3 — Portable (Inno Setup) felhasználók diagnosztika
--  Dátum: 2026-04-22
--  Futtatás: Endre → Supabase SQL Editor
--  Csak SELECT. Döntési input: van-e aktív standalone-portable-user, aki miatt
--  az M6.3 kivezetést kétlépcsősre kell szabnunk.
--
--  KÉT POPULÁCIÓ:
--    • `licenses`      → Inno Setup .exe portable telepítések (JWT-alapú)
--    • `user_devices`  → Tauri desktop install (M3-ban bevezetett Ed25519)
--
--  A kettőnek NINCS átfedése (két külön auth-flow, két külön env).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1) PORTABLE (licenses) populáció — státuszonként
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 1. Portable licenses státusz-bontás ════════════════════════════' AS section;

SELECT
  CASE
    WHEN revoked                            THEN '🚫 revoked'
    WHEN valid_until < CURRENT_DATE         THEN '⏰ expired'
    WHEN valid_from > CURRENT_DATE          THEN '🕰 future (még nem él)'
    ELSE                                         '✅ active'
  END                                                      AS status,
  COUNT(*)                                                 AS db,
  MIN(created_at)::date                                    AS legelso_kiallitas,
  MAX(created_at)::date                                    AS legutobbi_kiallitas,
  MAX(updated_at)::date                                    AS legutobbi_update
FROM public.licenses
GROUP BY 1
ORDER BY 2 DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) PORTABLE (licenses) — részletes lista az AKTÍV license-ekről
--    (csak ezek blokkolhatják az M6.3 azonnali törlést)
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 2. Aktív portable licenses — részletes lista ═══════════════════' AS section;

SELECT
  l.id,
  p.email                                                  AS user_email,
  p.full_name                                              AS user_name,
  COALESCE(c.nev_hu, c.name)                               AS congregation,
  l.device_limit,
  l.valid_from,
  l.valid_until,
  l.created_at::date                                       AS kiallitva,
  l.updated_at::date                                       AS utoljara_frissitve,
  -- A license kézbesítéskor a kliens kér (initial-pull) → az updated_at
  -- egy jó proxy a „mikor volt utoljára online a portable user" kérdésre
  NOW()::date - l.updated_at::date                         AS napok_utolso_aktivitas_ota,
  COALESCE(LEFT(l.notes, 60), '—')                         AS megjegyzes
FROM public.licenses l
LEFT JOIN public.profiles p      ON p.id = l.user_id
LEFT JOIN public.congregations c ON c.id = l.congregation_id
WHERE NOT l.revoked
  AND l.valid_until >= CURRENT_DATE
  AND l.valid_from  <= CURRENT_DATE
ORDER BY l.updated_at DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) PORTABLE — volt-e az elmúlt 60 napban aktivitás
--    (ha valaki 60 napja nem járt, valószínűleg átállt Tauri-ra vagy elhagyta)
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 3. Portable aktivitás az elmúlt 60 napban ══════════════════════' AS section;

SELECT
  CASE
    WHEN NOW() - l.updated_at < INTERVAL '7 days'   THEN '🔥 aktív (7 napon belül)'
    WHEN NOW() - l.updated_at < INTERVAL '30 days'  THEN '🟢 használt (30 napon belül)'
    WHEN NOW() - l.updated_at < INTERVAL '60 days'  THEN '🟡 csendes (30-60 nap)'
    ELSE                                                 '❄️ régen inaktív (60+ nap)'
  END                                                      AS aktivitas_savn,
  COUNT(*)                                                 AS db
FROM public.licenses l
WHERE NOT l.revoked
  AND l.valid_until >= CURRENT_DATE
GROUP BY 1
ORDER BY MIN(l.updated_at) DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) TAURI (user_devices) összehasonlításul — ez NEM blokkolja az M6.3-at
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 4. Tauri user_devices — referencia, NEM portable ═══════════════' AS section;

SELECT
  CASE
    WHEN revoked                                               THEN '🚫 revoked'
    WHEN last_seen IS NULL                                     THEN '❓ soha nem láttuk'
    WHEN NOW() - last_seen < INTERVAL '7 days'                 THEN '🔥 aktív (7 napon belül)'
    WHEN NOW() - last_seen < INTERVAL '30 days'                THEN '🟢 használt (30 napon belül)'
    ELSE                                                            '🟡 csendes (30+ nap)'
  END                                                          AS status,
  COUNT(*)                                                     AS db,
  MIN(registered_at)::date                                     AS legelso_regisztralas,
  MAX(registered_at)::date                                     AS legutobbi_regisztralas
FROM public.user_devices
GROUP BY 1
ORDER BY 2 DESC;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) DÖNTÉSI ÖSSZEFOGLALÓ — 1 sor
-- ─────────────────────────────────────────────────────────────────────────

SELECT '════ 5. Döntési összefoglaló M6.3-hoz ═══════════════════════════════' AS section;

SELECT
  (SELECT COUNT(*) FROM public.licenses
     WHERE NOT revoked AND valid_until >= CURRENT_DATE)           AS aktiv_portable_license,
  (SELECT COUNT(*) FROM public.licenses
     WHERE NOT revoked AND valid_until >= CURRENT_DATE
       AND NOW() - updated_at < INTERVAL '30 days')               AS portable_aktiv_30nap,
  (SELECT COUNT(*) FROM public.licenses
     WHERE NOT revoked AND valid_until >= CURRENT_DATE
       AND NOW() - updated_at < INTERVAL '7 days')                AS portable_aktiv_7nap,
  (SELECT COUNT(*) FROM public.user_devices
     WHERE NOT revoked)                                           AS aktiv_tauri_eszkoz,
  CASE
    WHEN (SELECT COUNT(*) FROM public.licenses
           WHERE NOT revoked AND valid_until >= CURRENT_DATE
             AND NOW() - updated_at < INTERVAL '30 days') = 0
      THEN '✅ JAVASLAT: azonnali M6.3 kivezetés (nincs aktív portable user az elmúlt 30 napban)'
    WHEN (SELECT COUNT(*) FROM public.licenses
           WHERE NOT revoked AND valid_until >= CURRENT_DATE
             AND NOW() - updated_at < INTERVAL '30 days') < 5
      THEN '🟡 JAVASLAT: irányított migrációs kommunikáció a kevés aktív portable userrel, majd 1 release után törlés'
    ELSE
      '🔴 JAVASLAT: kétlépcsős kivezetés — most deprecation, M12/M13 környékén (Tauri GA után) törlés'
  END                                                             AS javaslat_m6_3;

-- ════════════════════════════════════════════════════════════════════════════
--  A BLOKK 5. sorának utolsó oszlopa (javaslat_m6_3) a döntési input.
--  Endre válasza alapján M6.3 megvalósítása:
--    ✅ zöld  → 2026-04-22-m6-3-standalone-cleanup.sql készül (routok + lib törlése)
--    🟡 sárga → 2026-04-22-m6-3-standalone-deprecation.sql (console.warn + doc)
--    🔴 piros → ua. deprecation, de M12/M13-ig halasztott törlés
-- ════════════════════════════════════════════════════════════════════════════
