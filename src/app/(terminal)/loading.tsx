export default function Loading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 animate-pulse rounded bg-panel-2" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-panel bg-panel" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-panel bg-panel" />
    </div>
  );
}
