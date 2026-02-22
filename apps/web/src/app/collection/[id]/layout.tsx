import type { ReactNode } from 'react';
import { DashboardLayout } from '~/components/layouts/dashboard';

export default function Layout({ children }: { children: ReactNode }) {
  return <DashboardLayout activeNav="library">{children}</DashboardLayout>;
}
