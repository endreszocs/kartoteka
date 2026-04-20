'use client'

/**
 * Fejlesztői cache-reset oldal.
 *
 * Akkor használja a felhasználó, ha a böngésző cache vagy a service worker
 * elavult bundle-t szolgál ki (tipikus tünet: „Server Action hash not found"
 * vagy „Module factory not available" runtime hibák).
 *
 * Mit csinál:
 *   1. Unregister-eli az ÖSSZES service worker-t
 *   2. Törli az ÖSSZES cache-storage-ot (PWA cache)
 *   3. Üríti a localStorage és sessionStorage-ot
 *   4. Átirányít a kezdőlapra fresh állapotban
 *
 * Használat: `http://localhost:3000/dev-reset`
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'

type LogEntry = { msg: string; ok: boolean }

export default function DevResetPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    void (async () => {
      const newLogs: LogEntry[] = []
      const log = (msg: string, ok = true) => {
        newLogs.push({ msg, ok })
        setLogs([...newLogs])
      }

      // 1. Service Worker unregister
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          if (regs.length === 0) {
            log('Nincs regisztrált service worker.')
          } else {
            for (const reg of regs) {
              await reg.unregister()
              log(`Service worker unregister: ${reg.scope}`)
            }
          }
        } else {
          log('A böngésző nem támogatja a service worker-eket (nincs teendő).')
        }
      } catch (e) {
        log(`Service worker hiba: ${e instanceof Error ? e.message : String(e)}`, false)
      }

      // 2. Cache Storage clear
      try {
        if ('caches' in window) {
          const keys = await caches.keys()
          if (keys.length === 0) {
            log('Nincs cache-storage entry.')
          } else {
            for (const key of keys) {
              await caches.delete(key)
              log(`Cache törölve: ${key}`)
            }
          }
        }
      } catch (e) {
        log(`Cache hiba: ${e instanceof Error ? e.message : String(e)}`, false)
      }

      // 3. localStorage + sessionStorage
      try {
        const lsCount = localStorage.length
        localStorage.clear()
        log(`localStorage törölve (${lsCount} kulcs).`)
      } catch (e) {
        log(`localStorage hiba: ${e instanceof Error ? e.message : String(e)}`, false)
      }
      try {
        const ssCount = sessionStorage.length
        sessionStorage.clear()
        log(`sessionStorage törölve (${ssCount} kulcs).`)
      } catch (e) {
        log(`sessionStorage hiba: ${e instanceof Error ? e.message : String(e)}`, false)
      }

      log('✓ Reset kész. 3 mp múlva átirányítás a kezdőlapra…')
      setDone(true)

      await new Promise((r) => setTimeout(r, 3000))
      // Force reload — bypassing cache
      window.location.replace('/')
    })()
  }, [])

  return (
    <div
      style={{
        padding: '40px 24px',
        maxWidth: 700,
        margin: '0 auto',
        fontFamily: 'system-ui, sans-serif',
        color: '#1f2937',
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>🧹 Cache reset folyamatban</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Ne zárd be az ablakot. A reset után automatikusan átirányítunk a kezdőlapra.
      </p>

      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: 16,
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {logs.length === 0 ? (
          <p style={{ color: '#94a3b8' }}>Indítás…</p>
        ) : (
          logs.map((entry, i) => (
            <div
              key={i}
              style={{
                color: entry.ok ? '#0f766e' : '#dc2626',
              }}
            >
              {entry.ok ? '✓' : '✗'} {entry.msg}
            </div>
          ))
        )}
      </div>

      {done && (
        <p style={{ marginTop: 16, color: '#0f766e' }}>
          Ha a redirect mégsem fut, kattints ide:{' '}
          <Link href="/" style={{ color: '#0e7490', textDecoration: 'underline' }}>
            Kezdőlap
          </Link>
        </p>
      )}
    </div>
  )
}
