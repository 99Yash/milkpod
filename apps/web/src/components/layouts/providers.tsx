'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from 'sonner';
import { queryClient } from '~/lib/api';
import { OfflineBanner } from '~/components/offline-banner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Toaster richColors closeButton theme="system" />
      <OfflineBanner />
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
