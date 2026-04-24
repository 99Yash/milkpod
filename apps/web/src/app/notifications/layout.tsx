import type { ReactNode } from 'react';
import { DashboardLayout } from '~/components/layouts/dashboard';

export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
