import { BrandLoadingScreen } from '@/components/layout/brand-loading-screen'

export default function RootLoading() {
  return (
    <div className="min-h-screen p-4 md:p-6">
      <BrandLoadingScreen
        title="Kartotéka"
        subtitle="Erdélyi Református Egyházkerület"
        message="A rendszer indul, az adatok és a közös szolgálati tér előkészítése folyamatban van."
      />
    </div>
  )
}
