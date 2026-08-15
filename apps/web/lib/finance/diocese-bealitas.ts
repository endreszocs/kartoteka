/**
 * diocese_bealitas → BealitasRow normalizáló — KÖZÖS helyen.
 *
 * MIÉRT (egyházmegyei terv, 2.1/2 + „közös helper, soha széthúzó másolat"):
 * a megyei éves konfig (diocese_bealitas: eve int, magyar oszlopnevek) és a
 * gyülekezeti bealitas (id string-év, angol oszlopnevek) KÉT séma — a közös
 * pénzügyi felület (FinanceTabs / AccountingTab / BudgetTab / nyomtatók)
 * viszont EGY alakot vár (BealitasRow). Ez a leképezés eddig az
 * `initFinanceDiocese`-ben élt inline, és a költségvetés-módosítás flageket
 * hardkódolt `false`-szal töltötte (a terv 2.1/2 pontja hibaként rögzítette:
 * a megyei felület HAZUDOTT — a véglegesített módosítás nyitottnak látszott).
 *
 * Mostantól MINDEN diocese_bealitas-fogyasztó (initFinanceDiocese szerver-
 * oldalon, BudgetPrintDialog kliens-oldalon) EZT a pure függvényt hívja —
 * ha a séma bővül, egy helyen kell követni.
 *
 * A hiányzó oszlop (migráció előtti adatbázis) itt természetesen `undefined`
 * → `false`/`null` — a felület a TÁROLT valóságot mutatja, nem hibázik.
 */

import type { BealitasRow } from '@kartoteka/ui-app'

/**
 * @param raw       a diocese_bealitas sor (`select('*')` eredménye) vagy null
 * @param dioceseId a megye UUID-ja — a BealitasRow.congregation_id mezőbe kerül
 *                  (a közös felület scope-oszlop-értelemben használja)
 * @param year      a kért év — a BealitasRow.id (string) mezőbe kerül
 */
export function normalizeDioceseBealitas(
  raw: Record<string, unknown> | null,
  dioceseId: string,
  year: number,
): BealitasRow | null {
  if (!raw) return null
  return {
    id: String(year),
    congregation_id: dioceseId,

    // ── Számadás ────────────────────────────────────────────────────────────
    accounting_finalized: Boolean(raw.szamadas_veglegesitve),
    accounting_finalized_at: (raw.szamadas_veglegesites_datuma as string | null) ?? null,
    accounting_finalized_by: (raw.szamadas_veglegesitette as string | null) ?? null,
    accounting_unlock_requested: Boolean(raw.szamadas_unlock_requested),
    accounting_unlock_reason: (raw.szamadas_unlock_request_reason as string | null) ?? null,
    // A megyei borító „Tárgyalta és jóváhagyta…" sora (S6 SQL hozza az oszlopokat;
    // előtte undefined → a nyomtatványon üres vonal, ami a tárolt valóság).
    szamadas_hatarozat_szam: (raw.szamadas_hatarozat_szam as string | null) ?? null,
    szamadas_hatarozat_datum: (raw.szamadas_hatarozat_datum as string | null) ?? null,

    // ── Költségvetés (alap) ─────────────────────────────────────────────────
    budget_finalized: Boolean(raw.koltsegvetes_veglegesitve),
    budget_finalized_at: (raw.koltsegvetes_veglegesites_datuma as string | null) ?? null,
    budget_finalized_by: (raw.koltsegvetes_veglegesitette as string | null) ?? null,
    // A közös BudgetTab a költségvetés feloldás-kérelmét az `unlock_requested` /
    // `unlock_reason` mezőkből olvassa (gyülekezeti oszlopnevek) — megyei
    // forrásuk a koltsegvetes_unlock_* oszloppár (S6 SQL).
    unlock_requested: Boolean(raw.koltsegvetes_unlock_requested),
    unlock_reason: (raw.koltsegvetes_unlock_request_reason as string | null) ?? null,

    // ── Költségvetés-módosítás (1–3. kör) ──────────────────────────────────
    // 2026-08-15 (terv 2.1/2): eddig hardkódolt false volt MIND — a
    // véglegesített megyei módosítás nyitottnak látszott, és újra lehetett
    // volna írni. Az oszlopokat a 2026-08-15-egyhazmegyei-uj-tablak.sql 1/B
    // szakasza hozza létre.
    budget_mod1_finalized: Boolean(raw.koltsegvetes_mod1_veglegesitve),
    budget_mod1_date: (raw.koltsegvetes_mod1_veglegesites_datuma as string | null) ?? null,
    budget_mod2_finalized: Boolean(raw.koltsegvetes_mod2_veglegesitve),
    budget_mod2_date: (raw.koltsegvetes_mod2_veglegesites_datuma as string | null) ?? null,
    budget_mod3_finalized: Boolean(raw.koltsegvetes_mod3_veglegesitve),
    budget_mod3_date: (raw.koltsegvetes_mod3_veglegesites_datuma as string | null) ?? null,

    // ── Megyei szinten nem értelmezett gyülekezeti mezők ───────────────────
    // (tag-járulék, leltár/választók zászlók) — semleges alapértékek.
    eves_jarulek: 0,
    jarulek_kedvezmenyes: null,
    jarulek_hatarid: null,
    szamadas_zaro_adatok: null,
  } as unknown as BealitasRow
}
