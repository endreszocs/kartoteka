import { BrandLoadingScreen } from '@/components/layout/brand-loading-screen'

export default function ModuleLoading() {
  return (
    <div className="space-y-5">
      <BrandLoadingScreen
        compact
        title="Szolgálati tér"
        subtitle="Kartotéka"
        message="A modul betöltése folyamatban van, az adatok hamarosan megérkeznek."
      />

      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-2xl bg-white/80 shadow-sm" />
        <div className="h-11 rounded-[1.6rem] bg-white/80 shadow-sm" />
        <div className="h-96 rounded-[1.8rem] bg-white/80 shadow-sm" />
      </div>
    </div>
  )
}
