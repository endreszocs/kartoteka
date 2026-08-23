'use client'

/**
 * ÁSZF-elfogadások naplója (2026-08-23).
 *
 * MIÉRT: az ÁSZF 13. pontja szerint „a további használat elfogadásnak
 * minősül". Ez jogilag akkor ér valamit, ha bizonyítani tudjuk: KI, MIKOR,
 * MELYIK verziót látta. A napló pontosan ezt a három adatot őrzi — és
 * SZÁNDÉKOSAN semmi mást (nincs IP-cím, nincs böngésző-ujjlenyomat), mert
 * azokat az Adatvédelmi tájékoztató nem sorolja fel az adatkörök között.
 */

import { ScrollText } from 'lucide-react'

import type { AszfElfogadasSor } from '@/app/(dashboard)/admin/adatvedelem-shared'
import { AdminEmptyState } from '@/components/admin/_shared/admin-empty-state'
import { AdminTable, type AdminTableColumn } from '@/components/admin/_shared/admin-table'
import { StatusBadge } from '@/components/admin/_shared/status-badge'

import { magyarIdopont } from './datum'

const OSZLOPOK: AdminTableColumn[] = [
  { key: 'nev', label: 'Felhasználó' },
  { key: 'verzio', label: 'Verzió', className: 'w-28' },
  { key: 'mikor', label: 'Elfogadva', className: 'w-56 tabular-nums', hideBelow: 'sm' },
]

interface AszfNaploProps {
  sorok: AszfElfogadasSor[]
  betoltes: boolean
}

export function AszfNaplo({ sorok, betoltes }: AszfNaploProps) {
  return (
    <AdminTable<AszfElfogadasSor>
      columns={OSZLOPOK}
      rows={sorok}
      rowKey={(s) => s.id}
      loading={betoltes}
      minWidthClass="min-w-[520px]"
      empty={
        <AdminEmptyState
          icon={ScrollText}
          title="Még nincs rögzített ÁSZF-elfogadás"
          hint={
            'A sorok akkor keletkeznek, amikor a felhasználók a következő belépésükkor először ' +
            'találkoznak az aktuális verzióval. Régi belépéseket visszamenőleg nem tudunk ' +
            'igazolni — a napló innentől épül.'
          }
        />
      }
      renderMobileCard={(s) => (
        <div className="card-raised space-y-1 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-heading text-sm text-foreground">{s.nev || s.email || 'Ismeretlen'}</p>
            <StatusBadge intent="info">{s.verzio || '—'}</StatusBadge>
          </div>
          {s.email && s.nev ? <p className="text-xs text-muted-foreground">{s.email}</p> : null}
          <p className="text-xs tabular-nums text-muted-foreground">
            {magyarIdopont(s.elfogadvaAt)}
          </p>
        </div>
      )}
      renderCell={(s, key) => {
        if (key === 'nev') {
          return (
            <div className="min-w-0">
              <p className="truncate text-foreground">{s.nev || 'Ismeretlen'}</p>
              {s.email ? <p className="truncate text-xs text-muted-foreground">{s.email}</p> : null}
            </div>
          )
        }
        if (key === 'verzio') return <StatusBadge intent="info">{s.verzio || '—'}</StatusBadge>
        if (key === 'mikor') return magyarIdopont(s.elfogadvaAt)
        return null
      }}
    />
  )
}
