'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '~/components/ui/button';

export default function ShareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ShareError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50svh] items-center justify-center px-6">
      <div className="mx-auto max-w-sm space-y-4 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Shared link unavailable</h2>
          <p className="text-sm text-muted-foreground">
            This shared link may have expired, been revoked, or doesn&apos;t
            exist.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
