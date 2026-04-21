import { BrandLoadingScreen } from '@/components/layout/brand-loading-screen'

export default function DashboardLoading() {
  return (
    <div className="space-y-5 md:space-y-6">
      <BrandLoadingScreen
        compact
        title="Irányítópult"
        subtitle="Mai áttekintés"
        message="Összegyűjtjük a mai szolgálathoz tartozó legfontosabb mutatókat, eseményeket és pénzügyi adatokat."
      />

      <div className="space-y-4 md:space-y-5 animate-pulse">
        <div className="h-40 rounded-[2rem] bg-white/80 shadow-sm" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-[1.6rem] bg-white/80 shadow-sm" />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="h-64 rounded-[1.8rem] bg-white/80 shadow-sm" />
          <div className="h-64 rounded-[1.8rem] bg-white/80 shadow-sm" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 rounded-[1.8rem] bg-white/80 shadow-sm" />
          <div className="h-72 rounded-[1.8rem] bg-white/80 shadow-sm" />
        </div>
      </div>
    </div>
  )
}
