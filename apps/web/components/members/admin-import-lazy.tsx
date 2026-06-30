'use client'

import dynamic from 'next/dynamic'

// 2026-06-30 (perf): a ~32KB-os import-varázsló (8 al-lépés komponenssel) CSAK
// rendszergazdai / delegált importnál kell. Kliens-oldali lazy wrapper, hogy a
// varázsló kódja kikerüljön a tagnyilvántartás route kezdeti JS-bundle-jéből —
// a felhasználók többsége (nem-admin) sosem tölti le. Az ssr:false azért
// helyénvaló, mert a varázsló amúgy is kliens-oldali (fájlfeltöltés, drag-drop),
// és a page.tsx Server Component-ben az ssr:false tiltott (ezért kell e wrapper).
const TagnyilvantartasImportWizard = dynamic(
  () => import('@/components/members/tagnyilvantartas-import-wizard').then((m) => m.TagnyilvantartasImportWizard),
  { ssr: false, loading: () => <div className="p-4 text-sm text-slate-500">Importáló betöltése…</div> },
)

export function AdminImportLazy({
  congregationId,
  congregationName,
}: {
  congregationId: string | null
  congregationName: string | null
}) {
  return (
    <TagnyilvantartasImportWizard
      mode="module"
      congregationId={congregationId}
      congregationName={congregationName}
    />
  )
}
