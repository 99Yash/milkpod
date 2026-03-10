import type { ReactNode } from 'react';
import {
  DashboardShell,
  type DashboardTab,
} from '~/components/dashboard/dashboard-shell';

type DashboardLayoutProps = {
  initialTab?: DashboardTab;
  children: ReactNode;
};

export function DashboardLayout({
  initialTab,
  children,
}: DashboardLayoutProps) {
  return (
    <DashboardShell initialTab={initialTab}>{children}</DashboardShell>
  );
}
