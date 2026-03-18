'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  FolderPlus,
  Gauge,
  Home,
  Library,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  DashboardPanel,
  DashboardPanelContent,
} from '~/components/dashboard/dashboard-panel';
import { DashboardSidebarToggle } from '~/components/dashboard/sidebar-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { AppShell } from '~/components/layouts/main';
import { authClient } from '~/lib/auth/client';
import { route } from '~/lib/routes';
import { siteConfig } from '~/lib/site';
import { cn, getErrorMessage } from '~/lib/utils';
import { fetchBillingSummary } from '~/lib/sidebar-data';
import { setCachedPlan, setMonthlyUsage } from '~/lib/plan-cache';
import type { PlanId } from '@milkpod/ai/plans';

export type DashboardTab = 'home' | 'library' | 'agent';

type NavItem = {
  id: DashboardTab;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'agent', label: 'Agent', icon: Sparkles },
];

type DashboardShellProps = {
  initialTab?: DashboardTab;
  children: ReactNode;
};

type DashboardShellContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  activeTab: DashboardTab;
  handleTabChange: (tab: DashboardTab) => void;
};

const DashboardShellContext = createContext<DashboardShellContextValue | null>(
  null,
);

export function useDashboardShell() {
  const context = useContext(DashboardShellContext);
  if (!context) {
    throw new Error('useDashboardShell must be used within DashboardShell.');
  }
  return context;
}

export function DashboardShell({
  initialTab: initialTabProp,
  children,
}: DashboardShellProps) {
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const tabParam = searchParams.get('tab');
  const sessionParam = searchParams.get('session');
  const derivedTab: DashboardTab =
    initialTabProp ??
    (tabParam === 'library'
      ? 'library'
      : tabParam === 'agent' || sessionParam
        ? 'agent'
        : 'home');

  const [activeTab, setActiveTab] = useState<DashboardTab>(derivedTab);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  const router = useRouter();

  const handleTabChange = useCallback(
    (nextTab: DashboardTab) => {
      setActiveTab(nextTab);
      setMobileOpen(false);

      if (typeof window === 'undefined') return;

      const onDashboard = window.location.pathname === '/dashboard';

      if (onDashboard) {
        const url = new URL(window.location.href);
        if (nextTab === 'library') {
          url.searchParams.set('tab', 'library');
          url.searchParams.delete('session');
          url.searchParams.delete('asset');
        } else if (nextTab === 'agent') {
          url.searchParams.set('tab', 'agent');
        } else {
          url.searchParams.delete('tab');
          url.searchParams.delete('session');
          url.searchParams.delete('asset');
        }
        url.hash = '';
        window.history.replaceState(null, '', url.toString());
      } else {
        const target =
          nextTab === 'library'
            ? '/dashboard?tab=library'
            : nextTab === 'agent'
              ? '/dashboard?tab=agent'
              : '/dashboard';
        router.push(route(target));
      }
    },
    [router],
  );

  const contextValue = useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
      activeTab,
      handleTabChange,
    }),
    [collapsed, toggleCollapsed, activeTab, handleTabChange],
  );

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div
        className="h-full bg-background overflow-hidden sm:overflow-x-hidden sm:overflow-y-auto sm:[scrollbar-gutter:stable]"
        data-dashboard-root
      >
        <div className="mx-auto box-border flex h-full w-full max-w-[90rem] gap-8 px-0 py-0 sm:px-4 lg:px-6 lg:py-6 sm:h-auto sm:min-h-full">
          <aside
            className={cn(
              'sticky top-6 hidden h-[calc(100svh-3rem)] shrink-0 flex-col gap-6 self-start pb-4 transition-[width] duration-200 lg:flex lg:h-[calc(100svh-4rem-2px)]',
              collapsed ? 'w-16 items-center' : 'w-60',
            )}
          >
            <SidebarBrand collapsed={collapsed} />

            <SidebarSections collapsed={collapsed} activeNav={activeTab} />
          </aside>

          <main className="flex-1 min-w-0 min-h-0">
            <AppShell
              outerClassName="h-full lg:p-0 sm:h-auto"
              innerClassName="border-border/60 sm:h-auto"
              scrollClassName="pb-6 pt-4 sm:flex-none sm:overflow-visible lg:py-6"
            >
              <div className="px-4 lg:px-6">
                <div className="mb-4 flex items-center gap-3 lg:hidden">
                  <DashboardSidebarToggle
                    collapsed={false}
                    onToggle={() => setMobileOpen(true)}
                    label="Open sidebar"
                  />
                  <div>
                    <p className="text-sm font-semibold leading-tight">
                      {siteConfig.name}
                    </p>
                    <p className="text-xs text-muted-foreground">Dashboard</p>
                  </div>
                </div>
                {children}
              </div>
            </AppShell>
          </main>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-72 bg-background p-4 [&>button]:hidden"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Dashboard navigation</SheetTitle>
              <SheetDescription>Access your dashboard sections.</SheetDescription>
            </SheetHeader>
            <div className="flex items-center justify-between">
              <SidebarUserSummary collapsed={false} />
            </div>
            <div className="mt-6 flex h-full flex-col">
              <SidebarSections collapsed={false} activeNav={activeTab} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </DashboardShellContext.Provider>
  );
}

function SidebarBrand({
  collapsed,
}: {
  collapsed: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <SidebarUserSummary collapsed={collapsed} />
    </div>
  );
}

function SidebarSections({
  collapsed,
  activeNav,
}: {
  collapsed: boolean;
  activeNav: string;
}) {
  return (
    <div className="flex h-full flex-col gap-6">
      <nav className="space-y-1" aria-label="Dashboard">
        {navItems.map((item) => (
          <NavItemLink
            key={item.id}
            item={item}
            isActive={item.id === activeNav}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className={cn('space-y-3', collapsed && 'hidden')}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Private
        </p>
        <SidebarActionButton
          icon={FolderPlus}
          label="Create collection"
          collapsed={collapsed}
          disabled
        />
      </div>

      <div className="mt-auto space-y-4">
        <div className={cn('space-y-4', collapsed && 'hidden')}>
          <DashboardPanel className="gap-3 py-4">
            <DashboardPanelContent className="space-y-2 px-4 py-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Bell className="size-3.5" />
                What's new
              </div>
              <p className="text-xs text-muted-foreground">
                Video transcription is in preview. Upload a video to see
                timestamped results.
              </p>
            </DashboardPanelContent>
          </DashboardPanel>

          <SidebarPlanUsage />
        </div>

        <div className="border-t border-border/60 pt-2">
          <SidebarSignOutButton collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};

function SidebarPlanUsage() {
  const router = useRouter();
  const [summary, setSummary] = useState<{
    plan: PlanId;
    used: number;
    budget: number;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchBillingSummary().then((data) => {
      if (cancelled || !data) return;
      const plan = data.plan as PlanId;
      setCachedPlan(plan);
      const u = data.usage;
      if (u?.dailyWords) {
        setSummary({ plan, used: u.dailyWords.used, budget: u.dailyWords.limit });
      }
      // Populate monthly usage cache for client-side quota pre-checks
      const vm = u?.monthlyVideoMinutes as { used: number } | undefined;
      const vs = u?.monthlyVisualSegments as { used: number } | undefined;
      const cm = u?.monthlyComments as { used: number } | undefined;
      setMonthlyUsage({
        videoMinutes: vm?.used ?? 0,
        visualSegments: vs?.used ?? 0,
        comments: cm?.used ?? 0,
      });
      if (data.isAdmin) {
        setIsAdmin(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) {
    return (
      <DashboardPanel className="gap-3 py-4">
        <DashboardPanelContent className="space-y-2 px-4 py-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gauge className="size-3.5" />
            Plan usage
          </div>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
        </DashboardPanelContent>
      </DashboardPanel>
    );
  }

  if (isAdmin) {
    return (
      <DashboardPanel className="gap-3 py-4">
        <DashboardPanelContent className="space-y-2 px-4 py-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gauge className="size-3.5" />
            Plan usage
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Words today</span>
            <span className="text-2xl font-semibold leading-none text-muted-foreground">
              ∞
            </span>
          </div>
        </DashboardPanelContent>
      </DashboardPanel>
    );
  }

  const pct = Math.min(100, (summary.used / summary.budget) * 100);
  const isHigh = pct > 80;
  const isPaid = summary.plan === 'pro' || summary.plan === 'team';

  return (
    <DashboardPanel className="gap-3 py-4">
      <DashboardPanelContent className="space-y-2 px-4 py-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gauge className="size-3.5" />
            {`${PLAN_LABELS[summary.plan] ?? summary.plan} plan`}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Words today</span>
            <span className={cn(isHigh && 'text-destructive font-medium')}>
              {summary.used.toLocaleString()}/{summary.budget.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                isHigh ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {isPaid ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => router.push(route('/dashboard/billing'))}
          >
            Manage plan
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => router.push(route('/pricing'))}
          >
            Upgrade
          </Button>
        )}
      </DashboardPanelContent>
    </DashboardPanel>
  );
}

function SidebarUserSummary({ collapsed }: { collapsed: boolean }) {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'New member';
  const emailLabel = user?.email ?? 'Connect your email';
  const initials = getUserInitials(user?.name ?? user?.email ?? 'Milkpod');

  return (
    <div
      className={cn(
        'flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card/90 px-3 py-2.5 shadow-sm',
        collapsed && 'size-10 justify-center rounded-xl p-0',
      )}
      aria-label={collapsed ? displayName : undefined}
      title={collapsed ? displayName : undefined}
    >
      <Avatar className="size-8 rounded-full border border-border/70 bg-card">
        {user?.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
        <AvatarFallback className="text-xs font-semibold text-muted-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className={cn('min-w-0', collapsed && 'sr-only')}>
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {displayName}
        </p>
        <p className="truncate text-xs text-muted-foreground">{emailLabel}</p>
      </div>
    </div>
  );
}

function SidebarSignOutButton({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    // Fire signout in background — don't block the redirect
    authClient.signOut().catch(() => {
      // Signout may race with navigation; cookie will be cleared regardless
    });

    // Navigate immediately for instant feel
    router.replace('/signin');
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isSigningOut}
      onClick={() => void handleSignOut()}
      className={cn(
        'w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive',
        collapsed && 'w-10 justify-center px-0',
      )}
      title={collapsed ? 'Log out' : undefined}
      aria-label={collapsed ? 'Log out' : undefined}
    >
      <LogOut className="size-4" />
      <span className={cn('font-medium', collapsed && 'sr-only')}>
        {isSigningOut ? 'Signing out...' : 'Log out'}
      </span>
    </Button>
  );
}

function getUserInitials(value: string) {
  const sanitized = value.split('@')[0].trim();
  if (!sanitized) {
    return 'MP';
  }

  const parts = sanitized.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase() || 'MP';
}

type SidebarActionButtonProps = {
  icon: LucideIcon;
  label: string;
  collapsed: boolean;
} & Omit<ComponentProps<typeof Button>, 'children'>;

function SidebarActionButton({
  icon: Icon,
  label,
  collapsed,
  className,
  type = 'button',
  ...props
}: SidebarActionButtonProps) {
  return (
    <Button
      type={type}
      variant="ghost"
      size="sm"
      className={cn(
        'w-full justify-start gap-2 text-muted-foreground hover:text-foreground',
        collapsed && 'w-10 justify-center px-0',
        className,
      )}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      {...props}
    >
      <Icon className="size-4" />
      <span className={cn(collapsed && 'sr-only')}>{label}</span>
    </Button>
  );
}

function NavItemLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const { handleTabChange } = useDashboardShell();

  return (
    <button
      type="button"
      onClick={() => handleTabChange(item.id)}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
        collapsed && 'justify-center px-2',
        isActive
          ? 'border-ring/30 bg-accent/45 text-foreground'
          : 'border-transparent text-muted-foreground hover:border-ring/20 hover:bg-accent/24 hover:text-foreground focus-visible:border-ring/30 focus-visible:bg-accent/28 focus-visible:text-foreground',
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="size-4" />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </button>
  );
}
