'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FolderPlus,
  Gauge,
  Home,
  Library,
  LifeBuoy,
  LogOut,
  Settings,
  Sparkles,
  User,
  Video,
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
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
import { api } from '~/lib/api';
import { cn, getErrorMessage } from '~/lib/utils';

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

type UserStat = {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
};

type DailyUsage = {
  remaining: number;
  budget: number;
  isAdmin: boolean;
};

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
        } else if (nextTab === 'agent') {
          url.searchParams.set('tab', 'agent');
        } else {
          url.searchParams.delete('tab');
          url.searchParams.delete('session');
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
        <div className="mx-auto box-border flex h-full w-full max-w-7xl gap-8 px-0 py-0 sm:px-4 lg:px-6 lg:py-6 sm:h-auto sm:min-h-full">
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
              <SidebarUserMenu collapsed={false} />
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
  children,
}: {
  collapsed: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <SidebarUserMenu collapsed={collapsed} />
      {children}
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
  const [usage, setUsage] = useState<{
    remaining: number;
    budget: number;
    isAdmin: boolean;
  } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.api.usage.remaining.get().then(({ data }) => {
      if (!cancelled && data) {
        setUsage(data);
      }
    });
    api.api.billing.summary.get().then(({ data }) => {
      if (!cancelled && data && 'plan' in data) {
        setPlan((data as { plan: string }).plan);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage) {
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

  if (usage.isAdmin) {
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

  const used = usage.budget - usage.remaining;
  const pct = Math.min(100, (used / usage.budget) * 100);
  const isHigh = pct > 80;
  const isPaid = plan === 'pro' || plan === 'team';

  return (
    <DashboardPanel className="gap-3 py-4">
      <DashboardPanelContent className="space-y-2 px-4 py-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gauge className="size-3.5" />
            {plan ? `${PLAN_LABELS[plan] ?? plan} plan` : 'Plan usage'}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Words today</span>
            <span className={cn(isHigh && 'text-destructive font-medium')}>
              {used.toLocaleString()}/{usage.budget.toLocaleString()}
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

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [planLabel, setPlanLabel] = useState('Free');
  const [dailyUsage, setDailyUsage] = useState<DailyUsage | null>(null);

  const [userStats, setUserStats] = useState<UserStat[]>([
    { id: 'videos', label: 'Videos', value: '–', icon: Video },
    { id: 'minutes', label: 'Minutes', value: '–', icon: Sparkles },
  ]);

  useEffect(() => {
    let cancelled = false;
    api.api.usage.stats.get().then(({ data }) => {
      if (!cancelled && data) {
        setUserStats([
          { id: 'videos', label: 'Videos', value: String(data.videoCount), icon: Video },
          { id: 'minutes', label: 'Minutes', value: String(data.totalMinutes), icon: Sparkles },
        ]);
      }
    });
    api.api.usage.remaining.get().then(({ data }) => {
      if (!cancelled && data) {
        setDailyUsage(data);
      }
    });
    api.api.billing.summary.get().then(({ data }) => {
      if (!cancelled && data && 'plan' in data) {
        const p = (data as { plan: string }).plan;
        setPlanLabel(PLAN_LABELS[p] ?? 'Free');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'New member';
  const emailLabel = user?.email ?? 'Connect your email';
  const initials = getUserInitials(user?.name ?? user?.email ?? 'Milkpod');
  const wordsRemainingLabel =
    dailyUsage && !dailyUsage.isAdmin
      ? `${dailyUsage.remaining.toLocaleString()} words left today`
      : null;
  const wordsRemainingRatio =
    dailyUsage && !dailyUsage.isAdmin && dailyUsage.budget > 0
      ? dailyUsage.remaining / dailyUsage.budget
      : null;
  const wordsStatusDotClass =
    wordsRemainingRatio === null
      ? null
      : wordsRemainingRatio <= 0.2
        ? 'bg-destructive'
        : 'bg-emerald-500';

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      const { error } = await authClient.signOut();
      if (error) {
        throw error;
      }

      router.replace('/signin');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setIsSigningOut(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card/90 px-3 py-2.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            collapsed && 'size-10 justify-center rounded-xl p-0'
          )}
          aria-label={collapsed ? `${displayName} menu` : undefined}
          title={collapsed ? displayName : undefined}
        >
          <span
            className={cn(
              'pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/12 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100',
              collapsed && 'hidden'
            )}
          />
          <WordsRemainingAvatar
            size="sm"
            image={user?.image}
            displayName={displayName}
            initials={initials}
            usage={dailyUsage}
          />
          <div className={cn('relative min-w-0', collapsed && 'sr-only')}>
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {displayName}
            </p>
            {wordsRemainingLabel ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('size-1.5 rounded-full', wordsStatusDotClass)} />
                <p className="truncate">{wordsRemainingLabel}</p>
              </div>
            ) : null}
          </div>
          <ChevronDown
            className={cn(
              'relative ml-auto size-4 text-muted-foreground transition group-data-[state=open]:rotate-180',
              collapsed && 'hidden'
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={collapsed ? 'center' : 'start'}
        sideOffset={8}
        className="w-80 overflow-hidden rounded-2xl border border-border/65 bg-card/95 p-0 shadow-2xl"
      >
        <div className="border-b border-border/60 bg-background/70 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <WordsRemainingAvatar
              size="md"
              image={user?.image}
              displayName={displayName}
              initials={initials}
              usage={dailyUsage}
            />
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName}
                </p>
                <Badge
                  variant="outline"
                  className="h-5 rounded-md border-border/70 bg-muted/35 px-1.5 text-[10px] font-medium text-muted-foreground"
                >
                  {planLabel}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {emailLabel}
              </p>
              {wordsRemainingLabel ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {wordsRemainingLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          {userStats.map((stat) => (
            <div
              key={stat.id}
              className="rounded-lg border border-border/60 bg-background/55 px-3 py-2"
            >
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <stat.icon className="size-3.5 text-muted-foreground/90" />
                <p>
                  {stat.label}
                </p>
              </div>
              <p className="mt-1 text-xl font-semibold leading-none text-foreground">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="px-2 pb-2">
          <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
            Workspace
          </p>
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="rounded-lg px-2.5 py-2"
              onSelect={() => router.push(route('/dashboard/billing'))}
            >
              <CreditCard className="size-4" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate font-medium">Billing</span>
                <ChevronRight className="size-4 text-muted-foreground/70" />
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled
              className="rounded-lg px-2.5 py-2 data-[disabled]:opacity-70"
            >
              <User className="size-4" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate font-medium">Profile</span>
                <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Soon
                </span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled
              className="rounded-lg px-2.5 py-2 data-[disabled]:opacity-70"
            >
              <Settings className="size-4" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate font-medium">Settings</span>
                <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Soon
                </span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled
              className="rounded-lg px-2.5 py-2 data-[disabled]:opacity-70"
            >
              <LifeBuoy className="size-4" />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate font-medium">Support</span>
                <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  Soon
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-2">
          <DropdownMenuItem
            variant="destructive"
            disabled={isSigningOut}
            onSelect={() => void handleSignOut()}
            className="rounded-lg px-2.5 py-2"
          >
            <LogOut className="size-4" />
            <span className="font-medium">
              {isSigningOut ? 'Signing out...' : 'Log out'}
            </span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type WordsRemainingAvatarProps = {
  size: 'sm' | 'md';
  image?: string | null;
  displayName: string;
  initials: string;
  usage: DailyUsage | null;
};

function WordsRemainingAvatar({
  size,
  image,
  displayName,
  initials,
  usage,
}: WordsRemainingAvatarProps) {
  const radius = 44;
  const remainingPercentage = usage?.isAdmin
    ? 100
    : usage
      ? Math.max(0, Math.min(100, (usage.remaining / Math.max(usage.budget, 1)) * 100))
      : 0;
  const roundedPercentage = Math.round(remainingPercentage);
  const ringStrokeClass =
    usage && !usage.isAdmin && roundedPercentage <= 20
      ? 'stroke-destructive/70'
      : 'stroke-foreground/45';
  const hasPartialSegments = remainingPercentage > 0 && remainingPercentage < 100;
  const segmentGap = hasPartialSegments
    ? Math.min(3, remainingPercentage, 100 - remainingPercentage)
    : 0;
  const remainingArcLength = hasPartialSegments
    ? Math.max(0, remainingPercentage - segmentGap)
    : remainingPercentage;
  const spentArcLength = hasPartialSegments
    ? Math.max(0, 100 - remainingPercentage - segmentGap)
    : 100 - remainingPercentage;
  const shouldRenderSpentArc = spentArcLength > 0;
  const shouldRenderRemainingArc = remainingArcLength > 0;
  const ringLineCap: 'butt' | 'round' = hasPartialSegments ? 'round' : 'butt';
  const finiteUsage = usage && !usage.isAdmin ? usage : null;
  const containerClass = size === 'sm' ? 'size-10' : 'size-12';
  const insetClass = size === 'sm' ? 'inset-[4px]' : 'inset-[5px]';
  const percentageClass = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const label = finiteUsage
    ? `${finiteUsage.remaining.toLocaleString()} of ${finiteUsage.budget.toLocaleString()} words remaining today`
    : 'Account avatar';
  const hoverLabel = finiteUsage ? `${roundedPercentage}% remaining today` : undefined;
  const hoverText = usage?.isAdmin ? '∞' : usage ? `${roundedPercentage}%` : '--';

  return (
    <div
      className={cn('group/quota relative shrink-0', containerClass)}
      aria-label={label}
      title={hoverLabel}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        aria-hidden="true"
      >
        {shouldRenderSpentArc ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            transform="rotate(-90 50 50)"
            className="fill-none stroke-border/70 transition-all duration-300"
            strokeWidth="8"
            strokeLinecap={ringLineCap}
            pathLength={100}
            strokeDasharray={`${spentArcLength} 100`}
            strokeDashoffset={
              hasPartialSegments ? -(remainingPercentage + segmentGap / 2) : -remainingPercentage
            }
          />
        ) : null}
        {shouldRenderRemainingArc ? (
          <circle
            cx="50"
            cy="50"
            r={radius}
            transform="rotate(-90 50 50)"
            className={cn('fill-none transition-all duration-300', ringStrokeClass)}
            strokeWidth="8"
            strokeLinecap={ringLineCap}
            pathLength={100}
            strokeDasharray={`${remainingArcLength} 100`}
            strokeDashoffset={hasPartialSegments ? -(segmentGap / 2) : 0}
          />
        ) : null}
      </svg>

      <div className={cn('absolute', insetClass)}>
        <Avatar className="size-full rounded-full border border-border/70 bg-card shadow-sm transition-opacity duration-200 group-hover/quota:opacity-0">
          {image ? <AvatarImage src={image} alt={displayName} /> : null}
          <AvatarFallback
            className={cn(
              'font-semibold text-muted-foreground',
              size === 'sm' ? 'text-xs' : 'text-sm',
            )}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      <div
        className={cn(
          'absolute flex items-center justify-center rounded-full bg-card text-foreground opacity-0 transition-opacity duration-200 group-hover/quota:opacity-100',
          insetClass,
        )}
      >
        <span className={cn('font-semibold tabular-nums', percentageClass)}>
          {hoverText}
        </span>
      </div>
    </div>
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
