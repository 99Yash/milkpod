import { ArrowLeft } from 'lucide-react';

/**
 * Pulse-animated skeleton that matches AssetShell's layout.
 * Shown via Suspense while the server fetches asset data.
 */
export function AssetShellSkeleton() {
  return (
    <div className="relative isolate flex flex-col lg:h-[calc(100svh-7rem-4px)]">
      <div className="pointer-events-none absolute inset-x-0 top-[-120px] h-[220px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.95_0.04_238)_0%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,oklch(0.36_0.06_245)_0%,transparent_70%)] dark:opacity-50" />
      {/* Header */}
      <div className="shrink-0 space-y-3 pb-4 pt-1">
        {/* Row 1: back + status badge */}
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <ArrowLeft className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Library</span>
          </span>
          <div className="h-5 w-14 animate-pulse rounded-full bg-muted" />
        </div>

        {/* Row 2: title */}
        <div className="h-6 w-3/5 animate-pulse rounded bg-muted" />

        {/* Row 3: metadata */}
        <div className="flex items-center gap-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-16 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex gap-1 border-b border-border/40 px-1 pb-px">
          {['w-20', 'w-14', 'w-18', 'w-20'].map((w, i) => (
            <div
              key={i}
              className={`h-8 ${w} animate-pulse rounded-t bg-muted/60`}
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>

        {/* Transcript area skeleton */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl border-x border-b border-border/40 p-5">
          <div className="space-y-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-2" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-12 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                </div>
                <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
