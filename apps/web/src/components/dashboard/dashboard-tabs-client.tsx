'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  useDashboardShell,
  type DashboardTab,
} from '~/components/dashboard/dashboard-shell';
import { DashboardSidebarToggle } from '~/components/dashboard/sidebar-toggle';

type DashboardTabsClientProps = {
  home: ReactNode;
  library: ReactNode;
  agent: ReactNode;
};

const isDashboardTab = (value: string): value is DashboardTab =>
  value === 'home' || value === 'library' || value === 'agent';

export function DashboardTabsClient({
  home,
  library,
  agent,
}: DashboardTabsClientProps) {
  const { collapsed, toggleCollapsed, activeTab, handleTabChange } =
    useDashboardShell();

  // Track which tabs have been mounted using a ref so the update is
  // synchronous — no extra render frame with empty content.
  const mountedTabsRef = useRef<Record<DashboardTab, boolean>>({
    home: activeTab === 'home',
    library: activeTab === 'library',
    agent: activeTab === 'agent',
  });
  mountedTabsRef.current[activeTab] = true;
  const mountedTabs = mountedTabsRef.current;

  // Reset scroll position when switching tabs — the actual scroll
  // container on desktop is [data-dashboard-root], not .app-shell-scroll.
  useEffect(() => {
    document
      .querySelector('[data-dashboard-root]')
      ?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

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

      <div onClickCapture={handlePanelClick}>
        {mountedTabs.home ? (
          <div className={activeTab !== 'home' ? 'hidden' : undefined}>
            {home}
          </div>
        ) : null}
        {mountedTabs.library ? (
          <div className={activeTab !== 'library' ? 'hidden' : undefined}>
            {library}
          </div>
        ) : null}
        {mountedTabs.agent ? (
          <div className={activeTab !== 'agent' ? 'hidden' : undefined}>
            {agent}
          </div>
        ) : null}
      </div>
    </div>
  );
}
