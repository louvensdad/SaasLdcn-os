export function SkeletonCard() {
  return (
    <div className="card space-y-md animate-pulse">
      <div className="skeleton h-5 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
      <div className="flex gap-sm">
        <div className="skeleton h-8 w-20" />
        <div className="skeleton h-8 w-20" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-sm">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-md items-center">
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 w-16" />
        </div>
      ))}
    </div>
  )
}