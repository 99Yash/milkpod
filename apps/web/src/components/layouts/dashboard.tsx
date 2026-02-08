import type { ReactNode } from 'react';
import { DashboardShell } from '~/components/dashboard/dashboard-shell';

type DashboardLayoutProps = {
  children: ReactNode;
  activeNav?: string;
};

export function DashboardLayout({
  children,
  activeNav = 'home',
}: DashboardLayoutProps) {
  return <DashboardShell activeNav={activeNav}>{children}</DashboardShell>;
}
