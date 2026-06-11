/**
 * DesktopMonetaryTab — a megosztott `MonetaryTab` desktop-bekötése
 * (2026-06-11, paritás #5).
 *
 * A web `components/finance/monetary-tab-v2.tsx` wrapper tükre:
 *   - címletjegyzék betöltés/mentés: a web `monetary-actions` logikája
 *     közvetlen Supabase-hívásokkal (`nom_cimlet` + `monetar` táblák,
 *     source='congregation_cash_check', sourceid=`${congId}:${év}`),
 *   - mentés csak igazolt felhő-belépéssel (B6 elv),
 *   - nyomtatás: rejtett iframe + `print()` — a Tauri webview-ben ez nyitja a
 *     rendszer nyomtatás-párbeszédet (PDF-be mentés a „Microsoft Print to
 *     PDF" nyomtatóval onnan is elérhető).
 */

import {
  MonetaryTab as SharedMonetaryTab,
  type MonetaryTabProps,
  type MonetaryDenomination,
} from '@kartoteka/ui-app'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { getVerifiedSession } from '../lib/verified-session'
import { isOnlineWithSession } from '../lib/use-session-online'

type DesktopMonetaryTabProps = Pick<
  MonetaryTabProps,
  'expectedCashBalance' | 'currentYear' | 'bankAccounts' | 'internalTransfers' | 'congregationName' | 'onToast'
> & {
  congregationId: string
}

/** A web `monetary-actions` kanonikus címletlistája (fallback hiányos törzsnél). */
const CANONICAL_DENOMINATIONS = [
  { label: '500 lejes bankjegy', value: 500, category: 'bankjegy' as const },
  { label: '200 lejes bankjegy', value: 200, category: 'bankjegy' as const },
  { label: '100 lejes bankjegy', value: 100, category: 'bankjegy' as const },
  { label: '50 lejes bankjegy', value: 50, category: 'bankjegy' as const },
  { label: '20 lejes bankjegy', value: 20, category: 'bankjegy' as const },
  { label: '10 lejes bankjegy', value: 10, category: 'bankjegy' as const },
  { label: '5 lejes bankjegy', value: 5, category: 'bankjegy' as const },
  { label: '1 lejes címlet', value: 1, category: 'bankjegy' as const },
  { label: '50 banis érme', value: 0.5, category: 'erme' as const },
  { label: '10 banis érme', value: 0.1, category: 'erme' as const },
  { label: '5 banis érme', value: 0.05, category: 'erme' as const },
  { label: '1 banis érme', value: 0.01, category: 'erme' as const },
]

function formatDisplayValue(value: number) {
  if (value >= 1) return `${value} RON`
  return `${Math.round(value * 100)} bani`
}

/** Rejtett iframe-be írt HTML nyomtatása (Tauri webview-kompatibilis). */
async function printHtmlViaIframe(html: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    document.body.removeChild(iframe)
    throw new Error('A nyomtatási nézet nem hozható létre.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  await new Promise((resolve) => setTimeout(resolve, 300))
  try {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
  } finally {
    // A print-dialógus modális — pár másodperc után takarítunk.
    setTimeout(() => {
      try {
        document.body.removeChild(iframe)
      } catch {
        /* már eltávolítva */
      }
    }, 60_000)
  }
}

export function DesktopMonetaryTab({ congregationId, ...props }: DesktopMonetaryTabProps) {
  return (
    <SharedMonetaryTab
      {...props}
      loadSnapshot={async (year) => {
        if (!(await isOnlineWithSession())) {
          return {
            denominations: [],
            counts: {},
            error: 'A monetár (címletjegyzék) megnyitásához internetkapcsolat és felhő-belépés szükséges.',
          }
        }
        try {
          const supabase = getDesktopSupabase()
          const sourceId = `${congregationId}:${year}`
          const [denominationsRes, countsRes] = await Promise.all([
            supabase
              .from('nom_cimlet')
              .select('id, name, val, divide, deleted')
              .or('deleted.eq.false,deleted.is.null')
              .order('val', { ascending: false }),
            supabase
              .from('monetar')
              .select('cimlet_id, darab')
              .eq('source', 'congregation_cash_check')
              .eq('sourceid', sourceId),
          ])
          if (denominationsRes.error) return { denominations: [], counts: {}, error: denominationsRes.error.message }
          if (countsRes.error) return { denominations: [], counts: {}, error: countsRes.error.message }

          const actual: MonetaryDenomination[] = (denominationsRes.data || []).map((row) => {
            const value = Number(row.val) / Math.max(Number(row.divide) || 1, 1)
            return {
              id: Number(row.id),
              name: String(row.name),
              value,
              divide: Number(row.divide),
              displayValue: formatDisplayValue(value),
              category: value >= 1 ? 'bankjegy' : 'erme',
            }
          })

          // Hiányos címlettörzsnél a kanonikus lista pótolja a hiányzókat
          // (negatív ID = még nem menthető) — web-azonos viselkedés.
          const actualByValue = new Map(actual.map((row) => [row.value.toFixed(2), row]))
          const denominations =
            actual.length >= CANONICAL_DENOMINATIONS.length
              ? actual
              : CANONICAL_DENOMINATIONS.map((item, index) => {
                  const found = actualByValue.get(item.value.toFixed(2))
                  if (found) return found
                  return {
                    id: -(index + 1),
                    name: item.label,
                    value: item.value,
                    divide: item.value >= 1 ? 1 : 100,
                    displayValue: formatDisplayValue(item.value),
                    category: item.category,
                  }
                })

          const counts = Object.fromEntries(
            (countsRes.data || []).map((row) => [Number(row.cimlet_id), Number(row.darab) || 0]),
          )
          return { denominations, counts }
        } catch (e) {
          return { denominations: [], counts: {}, error: errorMessage(e) }
        }
      }}
      saveSnapshot={async (year, items) => {
        const verified = await getVerifiedSession()
        if (!verified.ok) return { error: verified.message }
        try {
          const supabase = getDesktopSupabase()
          const sourceId = `${congregationId}:${year}`
          const sanitized = items
            .map((item) => ({
              denominationId: Number(item.denominationId),
              count: Math.max(0, Math.floor(Number(item.count) || 0)),
            }))
            .filter((item) => item.count > 0)

          if (sanitized.some((item) => item.denominationId < 0)) {
            return { error: 'A címlettörzs hiányos, ezért néhány címlet még nem menthető. Frissíteni kell a nom_cimlet táblát.' }
          }

          // Web-azonos: töröl + újraír (a pillanatfelvétel mindig a teljes állapot).
          const del = await supabase
            .from('monetar')
            .delete()
            .eq('source', 'congregation_cash_check')
            .eq('sourceid', sourceId)
          if (del.error) return { error: del.error.message }

          if (sanitized.length > 0) {
            const ins = await supabase.from('monetar').insert(
              sanitized.map((item) => ({
                cimlet_id: item.denominationId,
                darab: item.count,
                source: 'congregation_cash_check',
                sourceid: sourceId,
              })),
            )
            if (ins.error) return { error: ins.error.message }
          }
          return { success: true }
        } catch (e) {
          return { error: errorMessage(e) }
        }
      }}
      onPrint={async ({ html }) => {
        // Desktopon mindkét mód (pdf/browser) a rendszer print-dialógusát
        // nyitja — PDF-be mentés onnan választható.
        await printHtmlViaIframe(html)
      }}
    />
  )
}
