import { Download } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { ImportHub } from '@/components/admin/import-hub/import-hub'
import { ImportLogList } from '@/components/admin/import-log-list'
import {
  FILING_PROFILES,
  FINANCE_PROFILES,
  INVENTORY_PROFILES,
  REGISTRY_PROFILES,
  WORKLOG_PROFILES,
  type ImportModule,
  type ImportProfile,
} from '@/lib/import/import-profiles'

// Endre kérése (2026-05-04): a god mode aktiválás kivéve. Az admin layout
// (requireAdminAccess) már garantálja, hogy csak rendszergazda léphet ide be.
//
// 2026-07-11 (admin-redesign, import-hub): az oldal gyülekezet-választós központtá
// alakult — a rendszergazda bármelyik gyülekezethez importálhat tagokat, anyakönyvet,
// pénzügyet, munkanaplót, iktatót. A multi-sheet import-profilokat szerver oldalon
// olvassuk be és adjuk át a kliens hubnak (a members modul saját vezetett varázslóval megy).
const IMPORT_PROFILES_BY_MODULE: Partial<Record<ImportModule, ImportProfile[]>> = {
  registry: REGISTRY_PROFILES,
  finance: FINANCE_PROFILES,
  worklog: WORKLOG_PROFILES,
  filing: FILING_PROFILES,
  // 2026-08-26 (Leltar 3_43 kör): a leltár eddig 'soon' volt — a valódi
  // 'inventory_items' profillal a hub is tud egyszerű listát importálni.
  // (A hivatalos Leltar 3_43 munkafüzet dedikált kártyája a /leltar oldal
  // rendszergazdai importáló fülén él — a parse-út ott ismeri fel.)
  inventory: INVENTORY_PROFILES,
}

export default function Page() {
  return (
    <>
      <AdminPageHeader
        title="Import központ"
        description="Válassz cél-gyülekezetet, majd importálj hozzá tagokat, anyakönyvet, pénzügyet, munkanaplót vagy iktatót. Minden futás bekerül az import előzményekbe."
        icon={Download}
      />
      <ImportHub importProfilesByModule={IMPORT_PROFILES_BY_MODULE} />
      <ImportLogList />
    </>
  )
}
