import type { ReactNode } from 'react';
import {
  DashboardShell,
  type DashboardTab,
} from '~/components/dashboard/dashboard-shell';
import { ReplicacheProvider } from '~/lib/replicache/context';
import { getServerSession } from '~/lib/auth/session';

type DashboardLayoutProps = {
  initialTab?: DashboardTab;
  children: ReactNode;
};

export async function DashboardLayout({
  initialTab,
  children,
}: DashboardLayoutProps) {
  // Wrap the whole dashboard in a Replicache provider so the notification
  // bell + any future globally-subscribed UI can read user-scoped state.
  // Asset pages used to mount their own provider; they still work because
  // the outer provider is keyed on userId (same user → same instance).
  const session = await getServerSession();
  const userId = session?.user?.id;

  // Unauthenticated case: render the shell without a provider. Client hooks
  // that need replicache will simply see `null` and no-op.
  if (!userId) {
    return (
      <DashboardShell initialTab={initialTab}>{children}</DashboardShell>
    );
  }

  return (
    <ReplicacheProvider userId={userId}>
      <DashboardShell initialTab={initialTab}>{children}</DashboardShell>
    </ReplicacheProvider>
  );
}
