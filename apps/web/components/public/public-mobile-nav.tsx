'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, Newspaper, BookOpen, Users, ChevronRight } from 'lucide-react'

interface Props {
  slug: string
  displayName: string
  crestImageUrl?: string | null
}

export function PublicMobileNav({ slug, displayName, crestImageUrl }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setMounted(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setOpen(false)
      document.body.style.overflow = ''
    })
    return () => {
      cancelled = true
    }
  }, [pathname])

  const handleOpen = useCallback(() => {
    setOpen(true)
    document.body.style.overflow = 'hidden'
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    document.body.style.overflow = ''
  }, [])

  const items = [
    { href: `/gy/${slug}`, label: 'Kezdőlap', icon: Home, desc: 'Főoldal és hírek' },
    { href: `/gy/${slug}/posts`, label: 'Hírek', icon: Newspaper, desc: 'Bejegyzések és aktualitások' },
    { href: `/gy/${slug}/magazin`, label: 'Magazin', icon: BookOpen, desc: 'Gyülekezeti újság' },
    { href: `/gy/${slug}/rolunk`, label: 'Rólunk', icon: Users, desc: 'Bemutatkozás' },
  ]

  const drawerContent = open && mounted ? createPortal(
    <div className="lg:hidden" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
      {/* Overlay animált */}
      <div
        onClick={handleClose}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0,
          width: '300px', maxWidth: '88vw',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafb 100%)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
          animation: 'slideIn 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Fejléc — dekoratív */}
        <div style={{
          padding: '24px 20px 20px',
          background: 'linear-gradient(135deg, var(--public-primary, #14514b) 0%, color-mix(in srgb, var(--public-primary, #14514b) 80%, #000) 100%)',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              {crestImageUrl ? (
                <img
                  src={crestImageUrl}
                  alt=""
                  style={{ width: '44px', height: '44px', borderRadius: '12px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }}
                />
              ) : (
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 'bold',
                }}>
                  {displayName.charAt(0)}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>Gyülekezeti weboldal</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: '8px', borderRadius: '10px', cursor: 'pointer',
                border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              aria-label="Menü bezárása"
            >
              <X style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>

        {/* Menüpontok */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleClose}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '14px 14px', borderRadius: '14px',
                  textDecoration: 'none', marginBottom: '4px',
                  backgroundColor: isActive ? 'rgba(20,81,75,0.08)' : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isActive ? 'var(--public-primary, #14514b)' : '#f1f5f9',
                  color: isActive ? '#fff' : '#64748b',
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}>
                  <Icon style={{ width: '18px', height: '18px' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: isActive ? 'var(--public-primary, #14514b)' : '#1e293b' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '1px' }}>
                    {item.desc}
                  </div>
                </div>
                <ChevronRight style={{ width: '16px', height: '16px', color: '#cbd5e1', flexShrink: 0 }} />
              </Link>
            )
          })}
        </nav>

        {/* Lábléc */}
        <div style={{
          padding: '16px 20px', borderTop: '1px solid #f1f5f9',
          background: '#fff',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            fontSize: '11px', color: '#94a3b8',
          }}>
            <span>Működik a</span>
            <span style={{ fontWeight: 600, color: '#64748b' }}>Kartotéka</span>
            <span>rendszerrel</span>
          </div>
        </div>
      </div>

      {/* Animációk */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </div>,
    document.body,
  ) : null

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={handleOpen}
        className="p-2.5 rounded-xl hover:bg-black/5 transition-colors"
        style={{ color: 'var(--public-ink, #1e293b)' }}
        aria-label="Menü megnyitása"
      >
        <Menu className="w-6 h-6" />
      </button>
      {drawerContent}
    </div>
  )
}
