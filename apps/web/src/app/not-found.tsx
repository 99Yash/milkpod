import Link from 'next/link';
import { Button } from '~/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[50svh] items-center justify-center px-6">
      <div className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
