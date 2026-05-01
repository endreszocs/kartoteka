import { TagnyilvantartasImportWizard } from '@/components/members/tagnyilvantartas-import-wizard'
import { ImportLogList } from '@/components/admin/import-log-list'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'

export default async function Page() {
  const godMode = await getGodModeStatus()

  return (
    <div className="card-raised p-4 sm:p-5">
      {godMode.active ? (
        <div className="space-y-6">
          <TagnyilvantartasImportWizard mode="admin" />
          <ImportLogList />
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-5 text-sm text-amber-900">
          <p className="font-semibold">Az importáló rendszergazdai módban érhető el.</p>
          <p className="mt-1">
            Aktiváld a rendszergazdai (god) módot, hogy bármely gyülekezet
            tagnyilvántartási adatait importálhasd egy egységes wizardon keresztül.
          </p>
        </div>
      )}
    </div>
  )
}
