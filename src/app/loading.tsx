export default function Loading() {
  return (
    <div className="animate-pulse space-y-6 pl-10 lg:pl-0" aria-busy="true" aria-label="Cargando">
      <div className="h-3 w-32 rounded bg-ink-700" />
      <div className="h-7 w-72 rounded bg-ink-700" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-ink-850" />
        ))}
      </div>
      <div className="h-96 rounded-2xl bg-ink-850" />
    </div>
  );
}
