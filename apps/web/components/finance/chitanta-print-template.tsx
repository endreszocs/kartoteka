'use client'

/**
 * Chitanță (papír nyugta) nyomtatási sablon.
 *
 * A felhasználó által csatolt hivatalos EREK nyugtatömb másolata, A6 méretre
 * tervezve. Minden mező magyar–román kétnyelvű, ahogy az eredetin is.
 *
 * Használat:
 *   <ChitantaPrintTemplate data={chitantaPrintData} />
 *
 * A nyomtatáshoz a parent komponens hívja a `window.print()`-et — a
 * @media print CSS már gondoskodik arról, hogy csak ez a komponens
 * látszódjon, oldal-mérettel A6 fekvő.
 */

import type { ChitantaPrintData } from '@kartoteka/validations'
import { amountInWordsHu, amountInWordsRo } from '@/lib/utils/number-to-words'

type Props = {
  data: ChitantaPrintData
  /** Ha true, a "MÁSOLAT" vízjel megjelenik — utólagos újranyomtatáshoz. */
  copyWatermark?: boolean
  /** Ha true, A5 lapon kétszer egymás alatt — egy az átvevőnek, egy lefűzni. */
  dualMode?: boolean
}

function formatDateParts(d: string): { day: string; month: string; year: string } {
  const dt = new Date(d + (d.length <= 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(dt.getTime())) return { day: '', month: '', year: '' }
  return {
    day: String(dt.getDate()).padStart(2, '0'),
    month: String(dt.getMonth() + 1).padStart(2, '0'),
    year: String(dt.getFullYear()),
  }
}

function padNumber(n: number, len = 7): string {
  return String(n).padStart(len, '0')
}

/**
 * Ékezet-érzéketlenül eltávolítja a diakritikusokat. Hasznos annak
 * ellenőrzésére, hogy egy név már tartalmazza-e a hivatalos prefixet
 * (pl. "Parohia Reformată Brateș" vs "parohia reformata brates").
 */
function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Visszaadja a hivatalos román nevet uppercase-olva — ha a rendelkezésre
 * álló `nev` már tartalmazza a prefixet (pl. "PAROHIA REFORMATĂ"), akkor
 * csak azt adjuk vissza duplázás nélkül; egyébként hozzáillesztjük.
 */
function formatRoHeaderName(
  name: string | null | undefined,
  prefix: string,
  fallback: string,
): string {
  if (!name || !name.trim()) return fallback
  const normalized = stripDiacritics(name)
  const normalizedPrefix = stripDiacritics(prefix)
  if (normalized.startsWith(normalizedPrefix)) {
    return name.toUpperCase()
  }
  return `${prefix.toUpperCase()} ${name.toUpperCase()}`
}

export function ChitantaPrintTemplate({ data, copyWatermark, dualMode }: Props) {
  // Dual mode: A5 portrait lap, két nyugta egymás alatt szaggatott vágóvonallal.
  // A felhasználó kettéverja a vágóvonal mentén → egyik az átvevőnek, másik
  // a lefűzéshez.
  if (dualMode) {
    return (
      <ChitantaDualLayout
        data={data}
        copyWatermark={copyWatermark}
      />
    )
  }
  return <ChitantaSingle data={data} copyWatermark={copyWatermark} />
}

function ChitantaSingle({ data, copyWatermark }: { data: ChitantaPrintData; copyWatermark?: boolean }) {
  const { day, month, year } = formatDateParts(data.szamlaDatum)
  const huWords = amountInWordsHu(data.osszegBrut)
  const roWords = amountInWordsRo(data.osszegBrut)

  return (
    <div className="chitanta-print-root mx-auto bg-white text-slate-900 print:m-0">
      {/* Print-only stílusok — csak ez a komponens látszik nyomtatáskor */}
      <style jsx global>{`
        @media print {
          @page {
            size: A6 landscape;
            margin: 6mm;
          }
          html, body {
            background: white !important;
            margin: 0;
            padding: 0;
          }
          body * {
            visibility: hidden;
          }
          .chitanta-print-root, .chitanta-print-root * {
            visibility: visible;
          }
          .chitanta-print-root {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .chitanta-no-print {
            display: none !important;
          }
        }
        .chitanta-print-root {
          font-family: 'Times New Roman', Times, serif;
          font-size: 9pt;
          line-height: 1.3;
          color: #1f2937;
          width: 148mm;
          padding: 4mm;
          box-sizing: border-box;
        }
        .chitanta-print-root {
          position: relative;
        }
        .chitanta-print-root h1 {
          font-family: 'Georgia', serif;
          font-style: italic;
          font-size: 18pt;
          letter-spacing: 0.3pt;
          margin: 0;
          color: #2c4d6e;
          white-space: nowrap;
        }
      `}</style>

      {/* EREK címer háttér-vízjel — mindig megjelenik, diszkréten */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        style={{
          opacity: 0.06,
          zIndex: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/EREK.png"
          alt=""
          style={{
            width: '75%',
            maxWidth: '100mm',
            height: 'auto',
          }}
        />
      </div>

      {/* Utólagos másolat esetén diszkrét jelölés a sarokban */}
      {copyWatermark && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-2 right-3 select-none"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '7pt',
            fontStyle: 'italic',
            color: '#94a3b8',
            letterSpacing: '0.5pt',
            zIndex: 1,
          }}
        >
          — másolat —
        </div>
      )}

      {/* ─── Fejléc — kompakt 3 sor egyháztartó struktúra + pecsét helye jobbra ─── */}
      <div className="grid grid-cols-[2fr_1fr] gap-3 border-b border-slate-300 pb-2 relative" style={{ zIndex: 2 }}>
        <div className="space-y-0.5 text-[9pt] leading-tight">
          <div className="font-bold uppercase tracking-tight">
            EPARHIA REFORMATĂ DIN ARDEAL
          </div>
          <div className="italic text-slate-700">
            {data.egyhazkeruletNevHu || 'ERDÉLYI REFORMÁTUS EGYHÁZKERÜLET'}
          </div>
          <div className="border-t border-dotted border-slate-400 pt-0.5 mt-0.5">
            <span className="font-semibold uppercase">
              {formatRoHeaderName(data.egyhazmegyeNevRo, 'Protopopiat Reformat', 'PROTOPOPIAT REFORMAT')}
            </span>
            <div className="italic text-slate-700">
              {data.egyhazmegyeNevHu ? `${data.egyhazmegyeNevHu.toUpperCase()}` : 'REFORMÁTUS EGYHÁZMEGYE'}
            </div>
          </div>
          <div className="border-t border-dotted border-slate-400 pt-0.5 mt-0.5">
            <span className="font-semibold uppercase">
              {formatRoHeaderName(data.gyulekezet.nevRo, 'Parohia Reformată', 'PAROHIA REFORMATĂ')}
            </span>
            <div className="italic text-slate-700">
              {data.gyulekezet.nevHu ? data.gyulekezet.nevHu.toUpperCase() : 'REFORMÁTUS EGYHÁZKÖZSÉG'}
            </div>
          </div>
          <div className="pt-0.5">
            <span className="font-semibold">C.I.F.:</span> {data.gyulekezet.cif || '________'}
          </div>
          <div>
            <span className="italic text-slate-700">Sediul / Székhely:</span>{' '}
            {[data.gyulekezet.cim, data.gyulekezet.varos, data.gyulekezet.megye]
              .filter(Boolean)
              .join(', ') || '________________'}
          </div>
        </div>

        {/* Pecsét helye — egyszerű placeholder keret */}
        <div className="flex flex-col items-center justify-center gap-0.5 border border-dashed border-slate-300 rounded p-2 text-center min-h-[22mm]">
          <div className="text-[8pt] uppercase font-semibold text-slate-500">
            Pecsét / Ștampilă
          </div>
        </div>
      </div>

      {/* ─── Sorozat (bal) + CHITANȚA fejléc (jobb) a nyomtatvány felett ─── */}
      <div className="mt-2 relative flex items-start justify-between gap-3" style={{ zIndex: 2 }}>
        <div className="text-[10pt] pt-1">
          Seria <span className="font-bold tracking-wider">{data.sorozat}</span>{' '}
          nr. <span className="font-bold">{padNumber(data.nyomdaiSzam ?? data.szam)}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <h1>CHITANȚA / Nyugta</h1>
          {/* Gyülekezeti saját szám (Nr.) + Data — egymás mellett a CHITANȚA alatt */}
          <div className="flex items-center gap-5 text-[10pt]">
            <div>
              <span className="text-slate-500">Nr.</span>{' '}
              <span className="font-bold underline underline-offset-2 decoration-slate-400">
                {data.gyulekezetiSzam ?? data.szam}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Data</span>{' '}
              <span className="font-bold underline underline-offset-2 decoration-slate-400">
                {day}.{month}.{year}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Adatok ─── */}
      <div className="mt-3 space-y-2 text-[9pt]">
        <FieldLine roLabel="Am primit de la" huLabel="Átvettem">
          <strong>{data.klienessegNev}</strong>
        </FieldLine>

        <div className="grid grid-cols-2 gap-3">
          <FieldLine roLabel="Nr.ORC/an" huLabel="">
            {data.klienessegNrOrcAn || '—'}
          </FieldLine>
          <FieldLine roLabel="CIF" huLabel="">
            {data.klienessegCui || '—'}
          </FieldLine>
        </div>

        <FieldLine roLabel="Adresa" huLabel="Cím">
          {data.klienessegCim || '—'}
        </FieldLine>

        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <FieldLine roLabel="Suma de" huLabel="Összeg">
            <strong>{data.osszegBrut.toLocaleString('hu-HU', { maximumFractionDigits: 2 })}</strong>{' '}
            <span className="text-slate-500">RON</span>
          </FieldLine>
          <FieldLine roLabel="adică" huLabel="éspedig">
            <span className="italic">{huWords}</span>{' '}
            <span className="text-slate-400">/ {roWords}</span>
          </FieldLine>
        </div>

        <FieldLine roLabel="reprezentând" huLabel="címén">
          {data.reprezentand || data.reprezentandRo ? (
            <>
              <span className="italic">{data.reprezentand || '—'}</span>
              {data.reprezentandRo && (
                <>
                  {' '}
                  <span className="text-slate-400">/ {data.reprezentandRo}</span>
                </>
              )}
            </>
          ) : (
            '—'
          )}
        </FieldLine>
      </div>

      {/* ─── Pénztáros aláírás — lejjebb tolva a kézi aláírásnak helyet hagyva ─── */}
      <div className="mt-10 flex items-end justify-end pr-4 relative" style={{ zIndex: 2 }}>
        <div className="text-center text-[9pt]">
          <div className="border-t border-slate-400 pt-0.5 px-6">
            Casier
            <div className="italic text-slate-600">(Pénztáros)</div>
          </div>
        </div>
      </div>

      {/* Sztornózási jelzés */}
      {data.stornozott && (
        <div className="mt-2 text-center text-[9pt] text-red-700 font-bold border border-red-300 rounded px-2 py-1">
          STORNATĂ / SZTORNÓZVA
          {data.stornozottIndok && (
            <div className="text-[7pt] font-normal text-red-600 italic mt-0.5">
              Indok: {data.stornozottIndok}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldLine({
  roLabel,
  huLabel,
  children,
}: {
  roLabel: string
  huLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-slate-700">
        {roLabel}
        {huLabel && (
          <span className="italic text-slate-500"> ({huLabel})</span>
        )}
        :
      </span>
      <span className="flex-1 border-b border-dotted border-slate-300 pb-0.5">
        {children}
      </span>
    </div>
  )
}

/**
 * Dual layout — egy A4 portrait lapon két nyugta egymás alatt.
 * A vágóvonal mentén a felhasználó kettévágja a lapot.
 *   - Felső: az átvevőnek
 *   - Alsó: lefűzni az irattárba
 *
 * A4 210mm × 297mm, 8mm margóval a tartalom: 194mm × 281mm,
 * amit a két fél osztva: ~138mm magasan egy nyugta + vágóvonal (5mm).
 */
function ChitantaDualLayout({
  data,
  copyWatermark,
}: {
  data: ChitantaPrintData
  copyWatermark?: boolean
}) {
  return (
    <div className="chitanta-dual-root mx-auto bg-white text-slate-900">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            background: white !important;
            margin: 0;
            padding: 0;
          }
          body * {
            visibility: hidden;
          }
          .chitanta-dual-root, .chitanta-dual-root * {
            visibility: visible;
          }
          .chitanta-dual-root {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
          .chitanta-no-print {
            display: none !important;
          }
        }
        .chitanta-dual-root {
          font-family: 'Times New Roman', Times, serif;
          color: #1f2937;
          width: 194mm;
          box-sizing: border-box;
        }
        .chitanta-dual-half {
          width: 194mm;
          min-height: 135mm;
          padding: 6mm 8mm;
          font-size: 10pt;
          line-height: 1.4;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
        }
        .chitanta-dual-divider {
          border-top: 1.5px dashed #94a3b8;
          margin: 0;
          position: relative;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .chitanta-dual-divider::before {
          content: '✂';
          position: absolute;
          left: 8mm;
          top: -8px;
          background: white;
          padding: 0 4px;
          font-size: 12pt;
          color: #94a3b8;
        }
        .chitanta-dual-divider .label {
          background: white;
          padding: 0 10px;
          font-size: 8pt;
          color: #94a3b8;
          font-style: italic;
          letter-spacing: 0.5pt;
        }
        .chitanta-dual-half h1 {
          font-family: 'Georgia', serif;
          font-style: italic;
          font-size: 22pt;
          letter-spacing: 0.5pt;
          margin: 0;
          color: #2c4d6e;
          white-space: nowrap;
        }
        .chitanta-dual-marker {
          position: absolute;
          right: 6mm;
          top: 3mm;
          font-size: 7pt;
          color: #94a3b8;
          font-style: italic;
          letter-spacing: 0.5pt;
          z-index: 2;
        }
      `}</style>

      {/* Felső példány — átvevőnek */}
      <div className="chitanta-dual-half" style={{ position: 'relative' }}>
        <span className="chitanta-dual-marker">— átvevő példánya —</span>
        <ChitantaInnerContent data={data} copyWatermark={copyWatermark} />
      </div>

      {/* Vágóvonal */}
      <div className="chitanta-dual-divider">
        <span className="label">— Itt vágható el —</span>
      </div>

      {/* Alsó példány — irattárba */}
      <div className="chitanta-dual-half" style={{ position: 'relative' }}>
        <span className="chitanta-dual-marker">— irattári példány —</span>
        <ChitantaInnerContent data={data} copyWatermark={copyWatermark} />
      </div>
    </div>
  )
}

/**
 * A nyugta belső tartalma (a brand fejléc + adatok). Ez a duál
 * layoutban kétszer renderelődik. Egyszerűsített verzió A5/2 méretre.
 */
function ChitantaInnerContent({
  data,
  copyWatermark,
}: {
  data: ChitantaPrintData
  copyWatermark?: boolean
}) {
  const { day, month, year } = formatDateParts(data.szamlaDatum)
  const huWords = amountInWordsHu(data.osszegBrut)
  const roWords = amountInWordsRo(data.osszegBrut)

  return (
    <>
      {/* EREK címer háttér-vízjel — középen, max 50mm magasan, hogy ne vágódjon el */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.06,
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/EREK.png"
          alt=""
          style={{
            maxWidth: '70mm',
            maxHeight: '70mm',
            width: 'auto',
            height: 'auto',
          }}
        />
      </div>

      {copyWatermark && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '3mm',
            left: '6mm',
            fontFamily: 'Georgia, serif',
            fontSize: '7pt',
            fontStyle: 'italic',
            color: '#94a3b8',
            letterSpacing: '0.5pt',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          — másolat —
        </div>
      )}

      {/* Fejléc — kompakt, A4 szélességre igazítva (telefon eltávolítva) */}
      <div className="grid grid-cols-[2fr_1fr] gap-3 border-b border-slate-300 pb-2 mb-2 text-[9pt] leading-tight relative" style={{ zIndex: 2 }}>
        <div>
          <div className="font-bold uppercase">EPARHIA REFORMATĂ DIN ARDEAL</div>
          <div className="italic text-slate-700">
            {data.egyhazkeruletNevHu || 'ERDÉLYI REFORMÁTUS EGYHÁZKERÜLET'}
          </div>
          <div className="font-semibold uppercase mt-0.5">
            {formatRoHeaderName(data.gyulekezet.nevRo, 'Parohia Reformată', 'PAROHIA REFORMATĂ')}
          </div>
          <div className="italic text-slate-700">
            {data.gyulekezet.nevHu ? data.gyulekezet.nevHu.toUpperCase() : 'REFORMÁTUS EGYHÁZKÖZSÉG'}
          </div>
          <div className="mt-0.5">
            <span className="font-semibold">C.I.F.:</span> {data.gyulekezet.cif || '________'}
          </div>
        </div>
        <div className="text-right text-[8pt] pr-1">
          {(data.gyulekezet.cim || data.gyulekezet.varos || data.gyulekezet.megye) && (
            <div className="mb-0.5">
              <span className="italic text-slate-700">Sediul / Székhely:</span>
              <div>
                {[data.gyulekezet.cim, data.gyulekezet.varos, data.gyulekezet.megye]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sorozat (bal) + CHITANȚA + Nr/Data (jobb) */}
      <div className="flex items-start justify-between mb-2 gap-3 relative" style={{ zIndex: 2 }}>
        <div className="text-[8pt] pt-1">
          Seria <span className="font-bold">{data.sorozat}</span> nr.{' '}
          <span className="font-bold">{String(data.nyomdaiSzam ?? data.szam).padStart(7, '0')}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <h1>CHITANȚA / Nyugta</h1>
          {/* Gyülekezeti saját szám (Nr.) + Data — egymás mellett a CHITANȚA alatt */}
          <div className="flex items-center gap-5 text-[8pt]">
            <div>
              <span className="text-slate-500">Nr.</span>{' '}
              <span className="font-bold underline underline-offset-2 decoration-slate-400">{data.gyulekezetiSzam ?? data.szam}</span>
            </div>
            <div>
              <span className="text-slate-500">Data</span>{' '}
              <span className="font-bold underline underline-offset-2 decoration-slate-400">
                {day}.{month}.{year}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Adatok — A4 szélességre igazítva */}
      <div className="space-y-1.5 text-[9pt] relative" style={{ zIndex: 2 }}>
        <FieldLine roLabel="Am primit de la" huLabel="Átvettem">
          <strong>{data.klienessegNev}</strong>
        </FieldLine>

        <div className="grid grid-cols-2 gap-3">
          <FieldLine roLabel="Nr.ORC/an" huLabel="">
            {data.klienessegNrOrcAn || '—'}
          </FieldLine>
          <FieldLine roLabel="CIF" huLabel="">
            {data.klienessegCui || '—'}
          </FieldLine>
        </div>

        <FieldLine roLabel="Adresa" huLabel="Cím">
          {data.klienessegCim || '—'}
        </FieldLine>

        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <FieldLine roLabel="Suma" huLabel="Összeg">
            <strong>{data.osszegBrut.toLocaleString('hu-HU', { maximumFractionDigits: 2 })}</strong>{' '}
            <span className="text-slate-500">RON</span>
          </FieldLine>
          <FieldLine roLabel="adică" huLabel="éspedig">
            <div className="text-[8pt] leading-tight">
              <div className="italic">{huWords}</div>
              <div className="italic text-slate-500">{roWords}</div>
            </div>
          </FieldLine>
        </div>

        <FieldLine roLabel="reprezentând" huLabel="címén">
          {data.reprezentand || data.reprezentandRo ? (
            <div className="text-[8pt] leading-tight">
              <div className="italic">{data.reprezentand || '—'}</div>
              {data.reprezentandRo && (
                <div className="italic text-slate-500">{data.reprezentandRo}</div>
              )}
            </div>
          ) : (
            '—'
          )}
        </FieldLine>
      </div>

      {/* Pénztáros aláírás — lejjebb tolva a kézi aláírásnak helyet hagyva */}
      <div className="mt-10 flex items-end justify-end pr-4 relative" style={{ zIndex: 2 }}>
        <div className="text-center text-[9pt]">
          <div className="border-t border-slate-400 pt-0.5 px-6">
            Casier <span className="italic text-slate-600">(Pénztáros)</span>
          </div>
        </div>
      </div>

      {/* Sztornó jelzés */}
      {data.stornozott && (
        <div className="mt-1 text-center text-[7pt] text-red-700 font-bold border border-red-300 rounded px-2 py-0.5">
          STORNATĂ / SZTORNÓZVA
        </div>
      )}
    </>
  )
}
