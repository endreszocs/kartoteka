'use client'

/**
 * Fejlesztői letöltések kártya — csak rendszergazdai / egyházkerületi admin látja.
 *
 * A Kartoteka fejlesztői környezethez tartozó `.bat` telepítőket és egyéb
 * segédeszközöket listázza, amelyeket a fejlesztő letölt és a saját gépén futtat.
 *
 * Letölthető forrás: `public/downloads/*`
 */

import { Download, ExternalLink, Package } from 'lucide-react'

interface DeveloperDownloadsCardProps {
  show: boolean
}

const DOWNLOADS: Array<{
  href: string
  label: string
  description: string
  version?: string
}> = [
  {
    href: '/downloads/install-resend.bat',
    label: 'install-resend.bat',
    description:
      'A Resend email szolgáltató telepítése — ha a broadcast üzeneteket email-ben is kézbesíteni szeretné a címzetteknek.',
    version: 'resend ^4.0.1',
  },
  // A jövőbeli frissítők ide kerülnek (pl. install-updates-2026-05.bat)
]

export function DeveloperDownloadsCard({ show }: DeveloperDownloadsCardProps) {
  if (!show) return null

  return (
    <div className="card-raised overflow-hidden">
      <div className="bg-indigo-50/40 px-5 py-4 border-b border-indigo-100 flex items-center gap-2">
        <Package className="size-4 text-indigo-700" />
        <h3 className="font-heading text-base text-slate-800">Fejlesztői letöltések</h3>
        <span className="ml-auto text-xs text-indigo-700/70">csak rendszergazdák számára</span>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-sm text-slate-600 leading-relaxed">
          Ezek a telepítő segédeszközök a Kartotéka <strong>fejlesztői környezetéhez</strong>{' '}
          tartoznak. Töltse le a fájlt, másolja a Kartotéka mappába
          (pl. <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">D:\Egyházi APP\KARTOTEKA\</code>),
          majd duplán kattintva futtassa.
        </p>

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {DOWNLOADS.map((d) => (
            <li key={d.href} className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-slate-50 p-2">
                <Download className="size-4 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-slate-800 truncate">{d.label}</p>
                  {d.version && (
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                      {d.version}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{d.description}</p>
              </div>
              <a
                href={d.href}
                download
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 transition"
              >
                Letöltés
                <ExternalLink className="size-3" />
              </a>
            </li>
          ))}
        </ul>

        <p className="text-xs text-slate-500 italic">
          A telepítők futtatásához telepített Node.js és internet kapcsolat szükséges.
          A teljes lista:{' '}
          <a href="/downloads/README.md" className="text-indigo-600 hover:text-indigo-800 underline">
            README
          </a>
          .
        </p>
      </div>
    </div>
  )
}
