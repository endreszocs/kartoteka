-- ═══════════════════════════════════════════════════════════════════════════
--  SZÁMADÁS — TARTOZÁSOK / KINTLÉVŐSÉGEK TÁROLÓJA (2026-08-14, K2)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  MIÉRT: a hivatalos Számadás-ív 116–134. sorblokkja (Datorii / Creanţe /
--  Záróegyenleg) eddig SEHOL nem létezett a rendszerben — sem tároló, sem
--  felület. A nyomtatvány már kiírja a blokkot (v0.9.166+), de adat híján
--  nullákkal. Ez az oszlop a tároló; a rögzítő felület a Pénzügy → Könyvelés
--  fülre került („Tartozások és kintlévőségek (év végi)" gomb).
--
--  Az EREK Útmutató a 116. sorhoz: „A jegyzőkönyvbe nem vett tartozásokat nem
--  lehet kifizetni a következő évben. Ha nincs tartozás, akkor jegyzőkönyvezni
--  kell azt is, hogy nincs tartozás."
--
--  ALAK (jsonb): { "tartozasok":    { "117": 1234.56, …, "127": 0 },
--                  "kintlevosegek": { "129": 0, …, "133": 0 } }
--  — a kulcs a HIVATALOS Nr. rând (117–127 / 129–133), az érték lej.
--
--  MIÉRT A bealitas: a tábla kulcsa (id = év, congregation_id) pontosan a
--  számadás dimenziója, és a záró-pillanatkép (szamadas_zaro_adatok) is itt
--  él. A mentés-besorolást NEM érinti (oszlop-bővítés, a tábla már besorolt).
--
--  ⚠️ CSAK BŐVÍT (ADD COLUMN IF NOT EXISTS) — meglévő adatot nem módosít.
--  Bármikor, bármennyiszer futtatható.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bealitas
  ADD COLUMN IF NOT EXISTS szamadas_tartozasok jsonb;

COMMENT ON COLUMN public.bealitas.szamadas_tartozasok IS
  '2026-08-14 (K2): a hivatalos Számadás 116–133. sorainak év végi adatai. '
  'Alak: {"tartozasok":{"117":szam,...,"127":szam},"kintlevosegek":{"129":szam,...,"133":szam}} '
  '— a kulcs a hivatalos Nr. rând, az érték lej. NULL = még nem rögzítették '
  '(a nyomtatvány ilyenkor nullákat mutat). Az írást az app a véglegesített '
  '(accounting_finalized) évre megtagadja.';

-- ─── ELLENŐRZÉS (csak olvas) ────────────────────────────────────────────────
SELECT
  'bealitas.szamadas_tartozasok' AS mit_mer,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bealitas'
       AND column_name = 'szamadas_tartozasok'
  ) THEN 'létezik ✅' ELSE 'HIÁNYZIK ❌' END AS allapot;
