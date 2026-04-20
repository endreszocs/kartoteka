-- ═══════════════════════════════════════════════════════════════════════════
-- DEFAULT GOD MODE PIN ELTÁVOLÍTÁSA
-- Dátum: 2026-04-15
-- Hivatkozott audit: docs/project-tracking/KARTOTEKA-rendszerdiagnosztika-2026-04-12.md (K2)
-- Projekt log: docs/project-tracking/KARTOTEKA-project-log.md (021. lépés)
--
-- PROBLÉMA:
-- A 2026-04-09-god-mode-and-congregation-finance.sql migráció seedelt egy
-- alapértelmezett PIN-t a system_settings táblába:
--
--   INSERT INTO public.system_settings (key, value)
--   VALUES ('god_mode_pin', '258456')
--   ON CONFLICT (key) DO NOTHING;
--
-- Ez egy hardcoded ismert érték, ami a kódbázisban is szerepelt
-- (actions-v2.ts, actions-v3.ts régi DEFAULT_GOD_MODE_PIN konstansként).
-- Mivel a kódbázis idővel kikerülhet (bár privát), és a régi UI komponensek
-- a felületen is megmutatták ("Ha nincs külön beállítva, az alapértelmezett
-- PIN: 258456"), ez egy nyilvános belépési vektort képezett.
--
-- MEGOLDÁS:
-- Eltávolítjuk a sort a system_settings-ből, DE CSAK akkor, ha még a
-- 258456 érték van benne. Ha a master admin közben már lecserélte egy
-- erős PIN-re, azt megtartjuk.
--
-- HATÁS:
-- - Ha a sort töröljük → a kód env-fallback-re vagy "nincs PIN" hibára esik
-- - Ha még az új actions-v4 működik (és van GOD_MODE_PIN env), nincs zavaró
--   hatás. A master admin ezután a Settings UI-ban beállíthat új PIN-t.
-- - Ha sem env, sem DB → a god mode aktiválás "nincs konfigurálva" hibát ad
--
-- IDEMPOTENS: A DELETE WHERE clause védelmet ad — többször futtatható.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Töröljük a sort, csak ha még a hardcoded alapértelmezett van benne
-- ─────────────────────────────────────────────────────────────────────────

DELETE FROM public.system_settings
WHERE key = 'god_mode_pin'
  AND value = '258456';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Verifikáció (futtasd kézzel a migráció után)
-- ─────────────────────────────────────────────────────────────────────────

-- 2a. Mi van most a system_settings.god_mode_pin sorban?
-- Várt eredmény: vagy egy új, erős PIN, vagy 0 sor (nincs DB-érték)
--
--   SELECT key, value, updated_at, updated_by
--   FROM public.system_settings
--   WHERE key = 'god_mode_pin';

-- 2b. KÖVETKEZŐ TEENDŐ a master admin-nak:
-- Ha 0 sor jött vissza (és az env GOD_MODE_PIN sincs), akkor:
-- - a god mode jelenleg nem aktiválható
-- - jelentkezz be master admin-ként
-- - menj az Admin Központ → Biztonság fülre
-- - állíts be egy új, erős 6 számjegyű PIN-t (NEM könnyen kitalálható,
--   pl. NEM születési dátum, NEM 123456, NEM 111111)
-- - A PIN automatikusan a system_settings táblába kerül.

-- ═══════════════════════════════════════════════════════════════════════════
-- VÉGE — A K2 biztonsági rés ezzel zárva (kód + DB szinten).
-- ═══════════════════════════════════════════════════════════════════════════
