import { FinanceLoadingState } from '@kartoteka/ui-app'

/**
 * 2026-07-11 (S6-#2): a /penzugy fő route betöltő-állapota — év-váltásnál és
 * első navigációnál eddig SEMMI visszajelzés nem volt (a régi oldal befagyva
 * állt, amíg az új szerver-render megérkezett). Ugyanaz a logós, csíkos
 * betöltő, mint a Költségvetés/Számadás fülön.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <FinanceLoadingState label="Pénzügy betöltése…" logoSrc="/kartoteka-icon.png" />
    </div>
  )
}
