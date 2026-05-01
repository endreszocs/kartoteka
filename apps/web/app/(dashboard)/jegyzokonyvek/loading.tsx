import { SkeletonCard } from '@kartoteka/ui-app'

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="card-raised p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <div className="kt-skeleton h-6 w-48 rounded-md" />
            <div className="kt-skeleton h-4 w-64 rounded-md" />
          </div>
          <div className="kt-skeleton h-10 w-36 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
