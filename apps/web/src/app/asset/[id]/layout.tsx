import type { ReactNode } from 'react';
import { DashboardLayout } from '~/components/layouts/dashboard';

export default function AssetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <DashboardLayout initialTab="library">
      {children}
    </DashboardLayout>
  );
}
