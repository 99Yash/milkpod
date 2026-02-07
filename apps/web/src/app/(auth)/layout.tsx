import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { siteConfig } from '~/lib/site';

export default function AuthLayout(props: { children: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden bg-background">
      <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-linear-to-br from-amber-500/10 via-amber-300/5 to-transparent blur-3xl dark:from-amber-400/15 dark:via-amber-300/10" />
      <Link
        href="/"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {siteConfig.name}
      </Link>
      <div className="relative mx-auto flex h-full w-full max-w-md flex-col items-center justify-center px-6">
        {props.children}
      </div>
    </div>
  );
}
