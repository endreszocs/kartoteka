'use client'

/**
 * Oblio ellenőrzés — figyelmeztető sáv
 * (Sprint Q F2.2, v0.7.8, 2026-04-26).
 *
 * Csak az ismeretlen formátumú fájlok jelennek meg itt manuális akcióval.
 * A duplikátumok automatikus takarítást kapnak (silent), a frissítés végén.
 *
 * Pure UI: csak react + lucide-react import. iOS-future-proof.
 */

import { AlertTriangle, FileX, Trash2 } from 'lucide-react'
import type { OblioLocalFile } from './folder-types'

interface OblioEllenorzesWarningsProps {
  unknownFiles: OblioLocalFile[]
  cleaningUp: boolean
  onDeleteUnknownFiles: () => void
}

export function OblioEllenorzesWarnings({
  unknownFiles,
  cleaningUp,
  onDeleteUnknownFiles,
}: OblioEllenorzesWarningsProps) {
  if (unknownFiles.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Ismeretlen fájlok */}
      {unknownFiles.length > 0 && (
        <div className="card-raised border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <FileX className="size-5" />
              </span>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-amber-800">
                  {unknownFiles.length} ismeretlen formátumú fájl a mappában
                </p>
                <p className="text-sm leading-6 text-slate-700">
                  Csak <strong>Oblio Wallet ZIP</strong>, és az abból kibontott{' '}
                  <strong>.xml</strong> + <strong>.pdf</strong> fájlok kerülhetnek
                  ide. A többi fájlt a KARTOTEKA nem tudja feldolgozni.
                </p>
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-700">
                    Fájlok megjelenítése ({unknownFiles.length})
                  </summary>
                  <ul className="mt-2 ml-2 space-y-0.5 max-h-40 overflow-y-auto">
                    {unknownFiles.map((f) => (
                      <li key={f.name} className="font-mono break-all">
                        {f.name}{' '}
                        <span className="text-slate-400">
                          ({(f.size / 1024).toFixed(1)} KB)
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </div>
            <button
              type="button"
              onClick={onDeleteUnknownFiles}
              disabled={cleaningUp}
              className="inline-flex items-center justify-center whitespace-nowrap h-9 px-3 text-sm font-medium border bg-white transition-colors disabled:pointer-events-none disabled:opacity-50 rounded-xl border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
            >
              <Trash2 className="mr-1.5 size-4" /> Törlés a mappából
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Letöltési útmutató kártya — mit kell pontosan letölteni az Oblio-ból.
 * Mindig megjelenik (felül), hogy a lelkész lássa, mit várunk.
 */
export function OblioFormatGuideCard() {
  return (
    <details className="card-raised border border-cyan-100 bg-cyan-50/30 p-4 sm:p-5 group">
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-cyan-900 list-none">
        <AlertTriangle className="size-4 text-cyan-700" />
        Milyen formátumban tölts le az Oblio-ból?
        <span className="ml-auto text-xs text-cyan-700 group-open:rotate-180 transition-transform">
          ▼
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Lépj be az <strong>Oblio Wallet</strong>-be:{' '}
            <a
              href="https://www.oblio.eu/report/wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 underline hover:text-cyan-900"
            >
              oblio.eu/report/wallet
            </a>
          </li>
          <li>
            A <strong>Documente din SPV</strong> szekcióban a befogadott számlákat
            konvertáld <strong>&bdquo;Adaugă document furnizor&rdquo;</strong> gombbal beszállítói
            dokumentummá (ha még nem tetted)
          </li>
          <li>
            Menj a <strong>Setări → Import/Export</strong> menübe:{' '}
            <a
              href="https://www.oblio.eu/account/import_export"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-700 underline hover:text-cyan-900"
            >
              oblio.eu/account/import_export
            </a>
          </li>
          <li>
            Válaszd a <strong>&bdquo;Documente furnizori&rdquo;</strong> kategóriát + dátumtartomány →{' '}
            <strong>Export</strong> gomb → letöltődik egy <strong>ZIP fájl</strong>
          </li>
          <li>
            A ZIP-et <strong>változtatás nélkül</strong> tedd a KARTOTEKA helyi mappájába:
            <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded break-all">
              KARTOTEKA / &lt;gyülekezet&gt; / oblio-ellenorzes / befogadott /
            </code>
            <span className="block mt-1 text-[11px] text-slate-500">
              Ez egy <strong>állandó mappa</strong> — évente NEM változik.
              A felső sávon (mappa-státusz kártya) a pontos útvonalat egy kattintással vágólapra másolhatod.
            </span>
          </li>
          <li>
            Itt kattints a <strong>&bdquo;Frissítés a mappából&rdquo;</strong> gombra — a KARTOTEKA
            kibontja a ZIP-et, és párosítja a számlákat a kiadásokkal.
          </li>
        </ol>
        <div className="rounded-xl bg-white border border-cyan-100 p-3 text-xs">
          <p className="font-semibold text-cyan-900 mb-1">⚠️ FONTOS:</p>
          <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
            <li>
              <strong>Csak ZIP, XML és PDF</strong> fájlokat tegyél a mappába
            </li>
            <li>
              Ha más formátumot teszel oda (pl. .doc, .jpg, .png), a KARTOTEKA jelzi
              és felajánlja a törlést
            </li>
            <li>
              Az ANAF SPV csak <strong>60 napra visszamenőleg</strong> engedi letölteni —
              ne hagyd ki a csengő-figyelmeztetést!
            </li>
          </ul>
        </div>
      </div>
    </details>
  )
}
