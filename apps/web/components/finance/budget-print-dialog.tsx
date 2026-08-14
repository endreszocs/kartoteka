'use client'

/**
 * Webes BudgetPrintDialog wrapper.
 *
 * 2026-04-25 (Sprint Q F1, v0.7.5): a vizuális réteg + state-management
 * átkerült a `@kartoteka/ui-app/finance` shared package-be
 * (`BudgetPrintDialogBody`). A wrapper a Dialog shell-t (shadcn-radix),
 * a print-engine-t, a Supabase client-tel beolvasott budget-sorokat
 * (`loadBudgetRowsCompat`), a tényleges adatok aggregálását, és a HTML
 * builder-t (`buildBudgetPrintDocument`) köti be a callback prop-okra.
 */

import { useCallback, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  BudgetPrintDialogBody,
  type BudgetPrintFilters,
  type PrintReport,
  // 2026-08-15 (átvilágítás 15.): a borító iktató-/határozat-mezőinek KÖZÖS
  // leképezése — ugyanaz, amit a Pénzügyi nyomtatási központ is használ.
  hivatalosHatarozatMezok,
} from '@kartoteka/ui-app'
import {
  buildBudgetPrintDocument,
  BUDGET_PRINT_TYPES,
  type BudgetPrintData,
} from '@/lib/finance/budget-reporting'
import { loadBudgetRowsCompat } from '@/lib/finance/budget-compat'
import { createClient } from '@/lib/supabase/client'
import { printToBrowser, printToPdf } from '@/lib/utils/print-engine-v2'
import { toast } from 'sonner'
import type { SzamadasiCel, BealitasRow, BefitetesRow, KiadasRow } from '@/lib/constants/finance'

/**
 * 2026-08-15 (átvilágítás 13.): magyarázó „nyomtatvány" a hibás/hiányzó
 * bemenet helyett. A testvér-változata a Pénzügyi nyomtatási központban
 * (`finance-print-dialog.tsx` `blockedPreview`) — a `blocked: true` ott tiltja
 * is a gombokat; itt a lelkész legfeljebb ezt a magyarázatot mentheti PDF-be,
 * hamis hivatalos ív helyett.
 */
function magyarazoElonezet(cim: string, uzenet: string): PrintReport {
  return {
    html: `<!doctype html><html lang="hu"><head><meta charset="utf-8"><style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
      .box{max-width:620px;margin:8vh auto;border:2px solid #111;border-radius:10px;padding:24px}
      h1{font-size:17px;margin:0 0 10px}p{font-size:14px;line-height:1.65;margin:0 0 10px}
    </style></head><body><div class="box"><h1>${cim}</h1><p>${uzenet}</p></div></body></html>`,
    title: cim,
    filename: 'dokumentum.pdf',
    orientation: 'portrait',
    blocked: true,
  }
}

/** A kiválasztott év `bealitas` sorának betöltési állapota. */
type EvBeallitasAllapot =
  | { allapot: 'kesz'; ev: number; sor: BealitasRow | null }
  | { allapot: 'hiba'; ev: number }

interface BudgetPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cellek: SzamadasiCel[]
  settings: BealitasRow
  bevCelMap: Record<number, string>
  kiaCelMap: Record<number, string>
  incomeRecords: BefitetesRow[]
  expenseRecords: KiadasRow[]
  congregationName: string
  carryoverCash: number
  carryoverBank: number
  currentYear: number
}

export function BudgetPrintDialog({
  open,
  onOpenChange,
  cellek,
  settings,
  bevCelMap,
  kiaCelMap,
  incomeRecords,
  expenseRecords,
  congregationName,
  carryoverCash,
  carryoverBank,
  currentYear,
}: BudgetPrintDialogProps) {
  // Tényleges adatok aggregálása szamadasicel kódonként.
  // 2026-08-11 (6. kör): a részszámadás INNEN KIKERÜLT (a FinancePrintDialogba
  // költözött) — nincs többé időszak-szűrés ebben az ablakban.
  const computeActuals = useCallback(
    () => {
      const actualIncome: Record<string, number> = {}
      const actualExpense: Record<string, number> = {}

      // 2026-07-10 (S3 audit KRITIKUS #1): a stornózott tétel a hivatalos
      // költségvetés/számadás nyomtatvány tény-oszlopába SEM számíthat.
      // 2026-08-11 (K5-#6): a tény-oszlop a NYERS deviza-összeget (`osszeg`) adta
      // össze, a Registru Casa/Banca/Jurnal viszont a RON-ekvivalenst
      // (`osszeg_ron`) — egy devizás banki tétel így két ELTÉRŐ hivatalos
      // nyomtatványt eredményezett ugyanarra az évre. A könyvelés RON-ban folyik:
      // mindenhol `osszeg_ron ?? osszeg` (RON-számlán a kettő azonos).
      // 2026-08-11 (6. kör, P1 #6): a `deleted` is szűrve. Eddig csak a
      // `stornozott` volt — ez ma véletlenül működött (a hívó már szűrt
      // sorokat ad), de KIMONDATLAN hívói invariánsra épült; a
      // finance-print-dialog mindkettőt nézi. Egy jövőbeli hívó némán
      // beleszámíttatta volna a soft-törölt tételeket az ALÁÍRT Számadásba.
      for (const r of incomeRecords) {
        if (r.deleted || r.stornozott) continue
        if (r.id_befizetescel) {
          const code = bevCelMap[r.id_befizetescel]
          if (code) {
            actualIncome[code] = (actualIncome[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
          }
        }
      }
      for (const r of expenseRecords) {
        if (r.deleted || r.stornozott) continue
        if (r.id_kiadascel) {
          const code = kiaCelMap[r.id_kiadascel]
          if (code) {
            actualExpense[code] = (actualExpense[code] || 0) + (Number(r.osszeg_ron ?? r.osszeg) || 0)
          }
        }
      }

      return { actualIncome, actualExpense }
    },
    [incomeRecords, expenseRecords, bevCelMap, kiaCelMap],
  )

  // ── 2026-08-15 (átvilágítás 13. + 15.): ÉV-SCOPE-OLT beállítás-sor ───────
  //
  // MI VOLT A ROSSZ: az év-választó a TERV sorokat évhelyesen töltötte újra, de
  // a véglegesítés-zászló (és vele a borító presbitériumi határozata) mindig az
  // OLDAL évének `settings` propjából jött. Egy 2024-es Költségvetés így a
  // 2026-os véglegesítés-állapottal ment ki.
  // A `bealitas` sor évenként külön létezik (id = év), ezért a terv-sorok
  // betöltésével EGYÜTT az adott év beállítás-sorát is elhozzuk.
  const [evBeallitas, setEvBeallitas] = useState<EvBeallitasAllapot | null>(null)

  const onLoadBudgetRows = useCallback(
    async (year: number) => {
      const supabase = createClient()

      // A beállítás-sor lekérése SOSEM buktathatja el a terv-sorok betöltését:
      // külön kezeljük, és a hibát `allapot: 'hiba'`-ként jelezzük (fail-closed
      // — a nyomtatvány ilyenkor magyarázó előnézetet ad, nem rossz évi adatot).
      const beallitasBetoltes = (async (): Promise<EvBeallitasAllapot> => {
        try {
          const { data, error } = await supabase
            .from('bealitas')
            // `select('*')` SZÁNDÉKOSAN: a `szamadas_tartozasok` oszlop csak a
            // 2026-08-14-i migráció után létezik — explicit oszloplistával a
            // TELJES lekérés 42703-mal bukna.
            .select('*')
            .eq('congregation_id', settings.congregation_id)
            .eq('id', String(year))
            .maybeSingle()
          if (error) return { allapot: 'hiba', ev: year }
          return { allapot: 'kesz', ev: year, sor: (data as BealitasRow | null) ?? null }
        } catch {
          return { allapot: 'hiba', ev: year }
        }
      })()

      try {
        const [data, beallitas] = await Promise.all([
          loadBudgetRowsCompat(supabase, year, settings.congregation_id),
          beallitasBetoltes,
        ])
        setEvBeallitas(beallitas)
        return { data: data.map((r) => ({
          szamadasicelid: r.szamadasicelid,
          tervezett: r.tervezett,
          modositott: r.modositott,
          mod2: r.mod2,
          mod3: r.mod3,
        })) }
      } catch (error) {
        setEvBeallitas(await beallitasBetoltes)
        return {
          error: error instanceof Error ? error.message : 'Költségvetés-sorok betöltése sikertelen.',
        }
      }
    },
    [settings.congregation_id],
  )

  // A panel „Véglegesítve" sorához: a betöltött év sora, betöltés előtt a
  // props-beli (folyó évi) — az induló év úgyis a folyó év. Hibánál `null`
  // (fail-closed: inkább „Nem", mint egy másik év „Igen"-je).
  const panelBeallitas: BealitasRow | null =
    evBeallitas === null
      ? settings
      : evBeallitas.allapot === 'kesz'
        ? (evBeallitas.sor ?? (evBeallitas.ev === currentYear ? settings : null))
        : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[96dvh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="sticky top-0 z-10 bg-background pb-2">
          <DialogTitle>Költségvetés és számadás nyomtatási központ</DialogTitle>
        </DialogHeader>

        <BudgetPrintDialogBody
          open={open}
          // 2026-08-11 (6. kör): a Részszámadás INNEN KIVEZETVE — a „Pénzügyi
          // nyomtatási központban" van, mert csak ott áll rendelkezésre az
          // év-scope-olt tétel-betöltés és a SZÁMLÁNKÉNTI feloldott nyitó.
          printableTypes={BUDGET_PRINT_TYPES.filter((t) => t.id !== 'reszszamadas')}
          currentYear={currentYear}
          // 2026-08-15 (átvilágítás 13.): a bal oldali „Véglegesítve" sor is a
          // KIVÁLASZTOTT évé. Enélkül a képernyő „Igen"-t írt volna, miközben a
          // papírra „Nincs véglegesítve" került — ellentmondó két állítás
          // ugyanarról az évről, ami a lelkészt bizonytalanságban hagyja.
          budgetFinalized={!!panelBeallitas?.budget_finalized}
          accountingFinalized={!!panelBeallitas?.accounting_finalized}
          computeActuals={computeActuals}
          onLoadBudgetRows={onLoadBudgetRows}
          buildReport={(filters: BudgetPrintFilters) => {
            const isSzamadas = filters.printType === 'szamadas'

            // 2026-08-15 (átvilágítás 13.): a véglegesítés-állapot és a
            // presbitériumi határozat a KIVÁLASZTOTT évé.
            //  - betöltött sor az évre → azt használjuk (akkor is, ha `null`:
            //    az évhez nincs beállítás-sor, tehát nincs is véglegesítés);
            //  - a folyó évnél a props-beli `settings` PONTOSAN ez a sor, így
            //    az első megnyitáskor (még betöltés előtt) is helyes;
            //  - minden más esetben (más év, még tölt / hibára futott) NEM
            //    tippelünk: magyarázó előnézet megy, nem hamis borító.
            const betoltott =
              evBeallitas && evBeallitas.ev === filters.selectedYear ? evBeallitas : null
            let evSettings: BealitasRow | null
            if (betoltott) {
              if (betoltott.allapot === 'hiba') {
                return magyarazoElonezet(
                  'Ez a nyomtatvány most nem készíthető el',
                  `A(z) ${filters.selectedYear}. évi pénzügyi beállítások (véglegesítés, presbitériumi határozat) nem tölthetők be, ezért a borító hibás adatokkal készülne. Ellenőrizd az internetkapcsolatot, és próbáld újra. Ha újra ezt írja, jelezd a rendszergazdának.`,
                )
              }
              // Ha az évhez nincs `bealitas` sor, de ez ÉPP az oldal éve, a
              // props-beli sor a mérvadó: azt a szerver oldotta fel (egyházmegyei
              // nézetben a `diocese_bealitas`-ból, ahol a fenti lekérés nem talál).
              evSettings =
                betoltott.sor ?? (filters.selectedYear === currentYear ? settings : null)
            } else if (filters.selectedYear === currentYear) {
              evSettings = settings
            } else {
              return magyarazoElonezet(
                'A nyomtatvány készül',
                `A(z) ${filters.selectedYear}. évi pénzügyi beállítások betöltése folyamatban van. Egy pillanat, és megjelenik az előnézet.`,
              )
            }

            const finalized = isSzamadas
              ? !!evSettings?.accounting_finalized
              : !!evSettings?.budget_finalized
            const printData: BudgetPrintData = {
              cellek,
              budgetRows: filters.budgetRows,
              actualIncome: filters.actualIncome,
              actualExpense: filters.actualExpense,
              congregationName,
              year: filters.selectedYear,
              carryoverCash,
              carryoverBank,
              finalized,
              // 2026-08-15 (átvilágítás 15.): eddig CSAK a `finalized` zászló ment
              // át a borító-építőnek, ezért a véglegesített ív „Tárgyalta és
              // jóváhagyta a presbitérium…" sora ÜRESEN maradt — miközben a
              // határozat száma és dátuma a `bealitas` sorban ott volt.
              ...hivatalosHatarozatMezok(evSettings, isSzamadas ? 'szamadas' : 'koltsegvetes'),
            }
            return buildBudgetPrintDocument(filters.printType, printData)
          }}
          onPrintToBrowser={(html) => printToBrowser(html)}
          onPrintToPdf={(html, filename, options) =>
            printToPdf(html, filename, {
              orientation: options?.orientation,
              margin: options?.margin,
              format: options?.format,
            })
          }
          onToast={(msg, kind) => {
            if (kind === 'error') toast.error(msg)
            else if (kind === 'success') toast.success(msg)
            else if (kind === 'warning') toast.warning(msg)
            else toast(msg)
          }}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
