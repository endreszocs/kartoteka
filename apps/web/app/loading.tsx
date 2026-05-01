import { RouteLoadingScreen } from '@/components/layout/route-loading-screen'

export default function RootLoading() {
  return (
    <div className="min-h-screen p-4 md:p-6">
      <RouteLoadingScreen module="Kartotéka" />
    </div>
  )
}
