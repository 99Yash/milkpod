'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useDashboardShell } from '~/components/dashboard/dashboard-shell';
import { DashboardSidebarToggle } from '~/components/dashboard/sidebar-toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';

type DashboardTab = 'home' | 'library' | 'agent';

type DashboardTabsClientProps = {
  initialTab: DashboardTab;
  home: ReactNode;
  library: ReactNode;
  agent: ReactNode;
};

const isDashboardTab = (value: string): value is DashboardTab =>
  value === 'home' || value === 'library' || value === 'agent';

const dashboardTabs: { id: DashboardTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'agent', label: 'Agent' },
];

export function DashboardTabsClient({
  initialTab,
  home,
  library,
  agent,
}: DashboardTabsClientProps) {
  const { collapsed, toggleCollapsed } = useDashboardShell();
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab');
    const sessionParam = url.searchParams.get('session');

    if (tabParam === 'library' && initialTab !== 'library') {
      setActiveTab('library');
      return;
    }

    if ((tabParam === 'agent' || sessionParam) && initialTab !== 'agent') {
      setActiveTab('agent');
      return;
    }

    if (!tabParam && !sessionParam && initialTab !== 'home') {
      setActiveTab('home');
    }
  }, [initialTab]);

  const handleTabChange = (nextTab: DashboardTab) => {
    setActiveTab(nextTab);

    if (typeof window === 'undefined') return;
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
  };

  const handleTabValueChange = (nextTab: string) => {
    if (isDashboardTab(nextTab)) {
      handleTabChange(nextTab);
    }
  };

  const handlePanelClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tabTarget = target.closest<HTMLElement>('[data-tab-target]');

    if (tabTarget) {
      const nextTab = tabTarget.dataset.tabTarget;
      if (nextTab && isDashboardTab(nextTab)) {
        event.preventDefault();
        handleTabChange(nextTab);
      }
      return;
    }

    const scrollTarget = target.closest<HTMLElement>('[data-scroll-target]');

    if (scrollTarget) {
      const anchor = scrollTarget.dataset.scrollTarget;
      if (anchor) {
        event.preventDefault();
        document.getElementById(anchor)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }
  };

  const pageTitle =
    activeTab === 'library'
      ? 'Library'
      : activeTab === 'agent'
        ? 'Agent'
        : 'Home';

  return (
    <div className="relative isolate space-y-8 pb-10">
      <div className="pointer-events-none absolute inset-x-0 top-[-120px] h-[220px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.95_0.06_95.6)_0%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle_at_center,oklch(0.3_0.03_85)_0%,transparent_70%)] dark:opacity-50" />

      <div className="flex items-center gap-3">
        <div className="hidden lg:flex">
          <DashboardSidebarToggle
            collapsed={collapsed}
            onToggle={toggleCollapsed}
          />
        </div>
        <h1 className="text-lg tracking-tight font-semibold text-foreground">
          {pageTitle}
        </h1>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabValueChange}
        className="gap-6 -mt-[7px]"
      >
        <TabsList
          aria-label="Dashboard tabs"
          className="border border-border/60 bg-muted/70 dark:bg-muted/30"
        >
          {dashboardTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground/80 data-[state=active]:text-foreground dark:data-[state=active]:text-foreground data-[state=active]:bg-background/90 dark:data-[state=active]:bg-background/50"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div onClickCapture={handlePanelClick}>
          <TabsContent
            value="home"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            {home}
          </TabsContent>
          <TabsContent
            value="library"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            {library}
          </TabsContent>
          <TabsContent
            value="agent"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            {agent}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
