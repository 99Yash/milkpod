export function ChatTabSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/40 md:flex-row">
      {/* Sidebar */}
      <div className="hidden w-64 shrink-0 border-r border-border/40 p-3 md:block">
        <div className="mb-3 h-8 w-full animate-pulse rounded-lg bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-lg bg-muted"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
      {/* Chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 p-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex gap-3" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        {/* Input bar */}
        <div className="shrink-0 px-3 pb-3 pt-2">
          <div className="h-[72px] animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function MomentsTabSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl bg-muted"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export function CommentsTabSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl border-x border-b border-border/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl bg-muted"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
