import { SidebarProvider } from '~/components/ui/sidebar';
import { cn } from '~/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

type AppShellProps = {
  children: React.ReactNode;
  outerClassName?: string;
  innerClassName?: string;
  scrollClassName?: string;
};

export function AppShell({
  children,
  outerClassName,
  innerClassName,
  scrollClassName,
}: AppShellProps) {
  return (
    <div
      className={cn(
        'app-shell-outer relative flex w-full flex-col overflow-hidden lg:p-2',
        outerClassName,
      )}
    >
      <div
        className={cn(
          'app-shell flex h-full w-full flex-col bg-background lg:rounded-lg lg:border',
          innerClassName,
        )}
      >
        <div
          className={cn(
            'app-shell-scroll flex-1 overflow-auto',
            scrollClassName,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <AppShell outerClassName="h-svh">{children}</AppShell>
    </SidebarProvider>
  );
}
