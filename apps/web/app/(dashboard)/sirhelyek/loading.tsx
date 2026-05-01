import { SkeletonTable } from '@kartoteka/ui-app'

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="card-raised p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="kt-skeleton size-12 rounded-xl" />
          <div className="space-y-2">
            <div className="kt-skeleton h-6 w-40 rounded-md" />
            <div className="kt-skeleton h-4 w-56 rounded-md" />
          </div>
        </div>
        <SkeletonTable rows={10} columns={5} />
      </div>
    </div>
  )
}
