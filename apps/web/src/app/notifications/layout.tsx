import { Suspense, type ReactNode } from 'react';
import { DashboardLayout } from '~/components/layouts/dashboard';

export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <DashboardLayout>{children}</DashboardLayout>
    </Suspense>
  );
}
