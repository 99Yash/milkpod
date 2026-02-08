'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  ChevronDown,
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
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
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
  DropdownMenuLabel,
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
import { cn, getErrorMessage } from '~/lib/utils';

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: Route;
  disabled?: boolean;
};

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, href: route('/dashboard') },
  { id: 'library', label: 'Library', icon: Library, disabled: true },
  {
    id: 'agent',
    label: 'Agent',
    icon: Sparkles,
    disabled: true,
  },
];

type UserStat = {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
};

const userStats: UserStat[] = [
  { id: 'videos', label: 'Videos', value: '0', icon: Video },
  { id: 'minutes', label: 'Minutes', value: '0', icon: Sparkles },
];

type DashboardShellProps = {
  activeNav?: string;
  children: ReactNode;
};

type DashboardShellContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
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
  activeNav = 'home',
  children,
}: DashboardShellProps) {
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const tabParam = searchParams.get('tab');
  const sessionParam = searchParams.get('session');
  const resolvedActiveNav =
    tabParam === 'agent' || sessionParam ? 'agent' : activeNav;
  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);
  const contextValue = useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
    }),
    [collapsed, toggleCollapsed],
  );

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div
        className="h-svh bg-background overflow-hidden sm:overflow-x-hidden sm:overflow-y-auto"
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

            <SidebarSections collapsed={collapsed} activeNav={resolvedActiveNav} />
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
              <SidebarSections collapsed={false} activeNav={resolvedActiveNav} />
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

          <DashboardPanel className="gap-3 py-4">
            <DashboardPanelContent className="space-y-2 px-4 py-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Gauge className="size-3.5" />
                Plan usage
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Minutes transcribed</span>
                  <span>0/60</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div className="h-full w-1/12 rounded-full bg-primary" />
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full">
                Upgrade
              </Button>
            </DashboardPanelContent>
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
}

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const displayName =
    user?.name?.trim() || user?.email?.split('@')[0] || 'New member';
  const emailLabel = user?.email ?? 'Connect your email';
  const initials = getUserInitials(user?.name ?? user?.email ?? 'Milkpod');

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
            'group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2 text-left shadow-sm transition hover:border-border/80 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            collapsed && 'w-10 justify-center p-0'
          )}
          aria-label={collapsed ? `${displayName} menu` : undefined}
          title={collapsed ? displayName : undefined}
        >
          <Avatar className="size-9 border border-border/60 bg-muted/40">
            {user?.image ? (
              <AvatarImage src={user.image} alt={displayName} />
            ) : null}
            <AvatarFallback className="text-xs font-semibold text-muted-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className={cn('min-w-0', collapsed && 'sr-only')}>
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-muted-foreground">Dashboard</p>
          </div>
          <ChevronDown
            className={cn(
              'ml-auto size-4 text-muted-foreground transition group-data-[state=open]:rotate-180',
              collapsed && 'hidden'
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="space-y-2">
          <div className="flex items-center gap-2">
            <Avatar className="size-9 border border-border/60 bg-muted/40">
              {user?.image ? (
                <AvatarImage src={user.image} alt={displayName} />
              ) : null}
              <AvatarFallback className="text-xs font-semibold text-muted-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {displayName}
                </p>
                <Badge
                  variant="outline"
                  className="border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground"
                >
                  Starter
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {emailLabel}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="grid grid-cols-2 gap-2 px-2 pb-2">
          {userStats.map((stat) => (
            <div
              key={stat.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-2 py-2"
            >
              <stat.icon className="size-3.5 text-primary" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-xs font-semibold text-foreground">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled>
            <User className="size-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <CreditCard className="size-4" />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <LifeBuoy className="size-4" />
            Support
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isSigningOut}
          onSelect={() => void handleSignOut()}
        >
          <LogOut className="size-4" />
          {isSigningOut ? 'Signing out...' : 'Log out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const baseClassName = cn(
    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
    collapsed && 'justify-center px-2',
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
    item.disabled &&
      'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground',
  );

  const content = (
    <>
      <item.icon className="size-4" />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </>
  );

  if (!item.href || item.disabled) {
    return (
      <div
        className={baseClassName}
        aria-disabled="true"
        title={collapsed ? item.label : undefined}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      className={baseClassName}
      href={item.href}
      title={collapsed ? item.label : undefined}
    >
      {content}
    </Link>
  );
}
