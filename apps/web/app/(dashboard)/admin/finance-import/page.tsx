import Link from 'next/link'
import { Wallet, ArrowRight } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'

/**
 * 2026-05-06 — átköltöztetve.
 *
 * A pénzügyi import (Kassza + Egyházfenntartás) mostantól a normál
 * `/penzugy` oldal "Rendszergazdai importáló" fülén érhető el — egy
 * helyen, együtt a többi pénzügyi funkcióval.
 *
 * A régi /admin/finance-import linkre érkezőket itt egy CTA-val
 * irányítjuk át. (Hard redirect helyett, mert a `ModuleAdminWorkspace`
 * az aktív tab-ot belső state-tel kezeli — a query string nem hat rá.)
 */
export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Pénzügyi import"
        description="Az import új helye: a Pénzügy oldal Rendszergazdai importáló füle."
        icon={Wallet}
      />
      <div className="card-raised p-5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h3 className="font-heading text-lg text-emerald-900">
            ✨ Az import átköltözött
          </h3>
          <p className="mt-2 text-sm text-emerald-800">
            A pénzügyi import-rendszer (Kassza + Egyházfenntartás) mostantól a
            normál Pénzügy modulon belül érhető el — egy helyen, együtt a
            pénzügyi munkafelülettel. Aktiváld a rendszergazdai módot, és
            kattints a „Rendszergazdai importáló” fülre.
          </p>
          <Link
            href="/penzugy"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
          >
            Megyek a Pénzügy modulhoz
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </>
  )
}
