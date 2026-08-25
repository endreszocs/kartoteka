'use client'

/**
 * Leltar 3_43 export — a hivatalos egyházmegyei munkafüzet KITÖLTÖTT letöltése
 * (2026-08-26).
 *
 * MIÉRT A KLIENSEN: a sablon (public/leltar343/Leltar-3_43-sablon.xlsx) bájtra
 * változatlanul marad — a jszip-pel kicsomagolt lap-XML-ek meglévő, üres
 * celláiba injektálunk értékeket (lib/inventory/leltar343-xml), így a
 * lapvédelem, a legördülők, az érvényesítések és a több tízezer származtatott
 * képlet mind érintetlen. Egy szerver-oldali exceljs-körutazás ezeket
 * BIZONYÍTOTTAN elvesztené (exceljs#1207/#1184) — ezért tilos az az út.
 */

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { InventoryItem } from '@/lib/constants/inventory.next'
import {
  LELTAR343_CIMLAP,
  LELTAR343_KATEGORIA_LAPOK,
  LELTAR343_PENZTAR,
  epitHelyszinFelelosParok,
  epitLeltar343ExportSorok,
} from '@/lib/inventory/leltar343-shared'
import {
  bekapcsolFullCalc,
  foltozCimlap,
  foltozPenztarKezdoEgyenlegek,
  injektalSorok,
  sheetXmlUtvonalak,
} from '@/lib/inventory/leltar343-xml'
import { getLeltar343ExportContext } from '@/app/(dashboard)/leltar/leltar343-actions'

const SABLON_URL = '/leltar343/Leltar-3_43-sablon.xlsx'

interface Leltar343ExportButtonProps {
  items: InventoryItem[]
  congregationName: string
  disabled?: boolean
}

export function Leltar343ExportButton({ items, congregationName, disabled }: Leltar343ExportButtonProps) {
  const [exportalas, setExportalas] = useState(false)

  const handleExport = async () => {
    if (exportalas) return
    setExportalas(true)
    try {
      // 1. Fej-adatok (egyházmegye, intézmény, vezető, pénztár-kezdőegyenleg).
      const kontextus = await getLeltar343ExportContext()
      if (kontextus.error) {
        toast.error(kontextus.error)
        return
      }

      // 2. A bájthű sablon letöltése.
      const valasz = await fetch(SABLON_URL)
      if (!valasz.ok) {
        toast.error('A Leltar 3_43 sablon nem tölthető le — frissítsd az oldalt, és próbáld újra.')
        return
      }
      const sablonBuffer = await valasz.arrayBuffer()

      // 3. Kicsomagolás + cél-zott XML-foltozás.
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(sablonBuffer)

      const workbookXml = await zip.file('xl/workbook.xml')!.async('string')
      const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
      const utvonalak = sheetXmlUtvonalak(workbookXml, relsXml)

      const figyelmeztetesek: string[] = []
      let osszesTetel = 0

      for (const lap of LELTAR343_KATEGORIA_LAPOK) {
        const utvonal = utvonalak.get(lap.sheet)
        if (!utvonal) {
          figyelmeztetesek.push(`A(z) ${lap.sheet} lap nem található a sablonban.`)
          continue
        }
        const { sorok, kapacitasFelett } = epitLeltar343ExportSorok({
          lap,
          items,
          intezmenyvezeto: kontextus.vezeto,
        })
        if (sorok.length === 0) continue
        osszesTetel += sorok.length
        const lapXml = await zip.file(utvonal)!.async('string')
        const { xml, szintetizalt } = injektalSorok(lapXml, sorok)
        zip.file(utvonal, xml)
        if (kapacitasFelett > 0 || szintetizalt > 0) {
          figyelmeztetesek.push(
            `${lap.cimke}: ${Math.max(kapacitasFelett, szintetizalt)} tétel a munkafüzet belső ` +
            `kapacitása (${lap.kapacitas} sor) fölé került — ezeket a munkafüzet Hibak/Fisa/Leltáriv ` +
            'lapjai nem dolgozzák fel.',
          )
        }
      }

      // Cimlap: fej-adatok + helyszín/felelős katalógus (a G-legördülő forrása).
      const cimlapUtvonal = utvonalak.get(LELTAR343_CIMLAP)
      if (cimlapUtvonal) {
        const cimlapXml = await zip.file(cimlapUtvonal)!.async('string')
        zip.file(
          cimlapUtvonal,
          foltozCimlap(cimlapXml, {
            egyhazmegye: kontextus.egyhazmegye,
            intezmeny: kontextus.intezmeny || congregationName,
            vezeto: kontextus.vezeto,
            parok: epitHelyszinFelelosParok(items),
          }),
        )
      }

      // Pénztár/Kinnlevőségek kezdő egyenleg — csak hiteles számmal.
      const penztarUtvonal = utvonalak.get(LELTAR343_PENZTAR)
      if (penztarUtvonal && (kontextus.penztarKezdo != null || kontextus.kinnlevosegKezdo != null)) {
        const penztarXml = await zip.file(penztarUtvonal)!.async('string')
        zip.file(
          penztarUtvonal,
          foltozPenztarKezdoEgyenlegek(penztarXml, {
            penztarKezdo: kontextus.penztarKezdo,
            kinnlevosegKezdo: kontextus.kinnlevosegKezdo,
          }),
        )
      }

      // A származtatott lapok (Hibak, Fisa, Leltáriv…) gyorsítótárazott
      // képlet-értékei elavultak — megnyitáskor teljes újraszámolást kérünk.
      zip.file('xl/workbook.xml', bekapcsolFullCalc(workbookXml))

      // 4. Letöltés.
      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        compression: 'DEFLATE',
      })
      const nevResz = (congregationName || 'gyulekezet')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
      const datum = new Date().toISOString().slice(0, 10)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Leltar-3_43-${nevResz || 'gyulekezet'}-${datum}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      if (figyelmeztetesek.length > 0) {
        toast.warning(figyelmeztetesek.join(' '), { duration: 12000 })
      }
      toast.success(
        `A kitöltött Leltar 3_43 munkafüzet letöltve (${osszesTetel} tétel). ` +
        'Megnyitáskor engedélyezd az újraszámolást, ha az Excel rákérdez — a Hibak/Fisa/Leltáriv lapok abból frissülnek.',
      )
    } catch (e) {
      toast.error(`Az export nem sikerült: ${e instanceof Error ? e.message : 'ismeretlen hiba'}`)
    } finally {
      setExportalas(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="min-h-11 rounded-xl"
      onClick={handleExport}
      disabled={disabled || exportalas}
      title="A hivatalos egyházmegyei Leltar 3_43 munkafüzet letöltése a leltár tételeivel kitöltve"
    >
      <FileDown className="mr-1.5 size-3.5" />
      {exportalas ? 'Exportálás…' : 'Export (Leltar 3_43)'}
    </Button>
  )
}
