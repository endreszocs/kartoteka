/**
 * SyncStatusIndicator — A-M7.2e (2026-04-24, refaktor 2026-04-25).
 *
 * A logika (Tauri SQLite, navigáció, periodikus polling) a desktop-on marad,
 * a vizuális réteg a `SyncStatusBadge` (`@kartoteka/ui-app`). Új paritás-
 * alapelv szerint a badge maga platform-független, props-vezérelt.
 *
 * Megjelenítési logika:
 *   - 0 pending, 0 conflict      → elrejtve
 *   - N pending, 0 conflict      → 🟡 „N várakozik szinkronra"
 *   - N pending, M conflict      → 🔴 „M konfliktus feloldást vár"
 *
 * Frissítés:
 *   - Mount-kor egyszeri olvasás
 *   - Window `online` event-re azonnal
 *   - 15 s-enként polling
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { SyncStatusBadge } from '@kartoteka/ui-app'

import { getDesktopUser } from '../lib/desktop-user'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'
import { getLocalOwnProfile } from '../lib/sync'

interface SyncCounts {
  pending: number
  conflict: number
  primaryRoute: '/penzugy/chitanta' | '/penzugy/befizetes' | '/penzugy/kiadas'
}

export function SyncStatusIndicator() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<SyncCounts | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    getDesktopUser().then(async (resolvedUser) => {
      if (!mounted) return
      if (!resolvedUser) {
        setCongregationId(null)
        return
      }
      try {
        const profile = await getLocalOwnProfile(resolvedUser.id)
        if (mounted) setCongregationId(profile?.congregation_id ?? null)
      } catch {
        /* csendes — nincs profil-fallback */
      }
    })

    return () => {
      mounted = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!congregationId) {
      setCounts(null)
      return
    }
    try {
      const backend = getTauriSqliteBackend()
      const currentYear = new Date().getFullYear()
      const [chitantaRows, befizetesRows, kiadasRows] = await Promise.all([
        backend.listLocalPendingChitantas(congregationId),
        backend.listLocalPendingBefizetes(congregationId, currentYear),
        backend.listLocalPendingKiadas(congregationId, currentYear),
      ])
      const chitantaPending = chitantaRows.filter((r) => r.sync_state === 'pending').length
      const chitantaConflict = chitantaRows.filter((r) => r.sync_state === 'conflict').length
      const befizetesPending = befizetesRows.filter((r) => r.sync_state === 'pending').length
      const befizetesConflict = befizetesRows.filter((r) => r.sync_state === 'conflict').length
      const kiadasPending = kiadasRows.filter((r) => r.sync_state === 'pending').length
      const kiadasConflict = kiadasRows.filter((r) => r.sync_state === 'conflict').length

      const totalPending = chitantaPending + befizetesPending + kiadasPending
      const totalConflict = chitantaConflict + befizetesConflict + kiadasConflict

      const chitantaTotal = chitantaPending + chitantaConflict
      const befizetesTotal = befizetesPending + befizetesConflict
      const kiadasTotal = kiadasPending + kiadasConflict
      let primaryRoute: SyncCounts['primaryRoute'] = '/penzugy/chitanta'
      if (befizetesTotal > chitantaTotal && befizetesTotal >= kiadasTotal) {
        primaryRoute = '/penzugy/befizetes'
      } else if (kiadasTotal > chitantaTotal && kiadasTotal > befizetesTotal) {
        primaryRoute = '/penzugy/kiadas'
      }

      setCounts({ pending: totalPending, conflict: totalConflict, primaryRoute })
    } catch {
      setCounts(null)
    }
  }, [congregationId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onOnline = () => {
      window.setTimeout(() => {
        void refresh()
      }, 500)
    }
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh()
    }, 15_000)
    return () => window.clearInterval(id)
  }, [refresh])

  if (!counts) return null

  return (
    <SyncStatusBadge
      pending={counts.pending}
      conflict={counts.conflict}
      onClick={() => navigate(counts.primaryRoute)}
    />
  )
}
