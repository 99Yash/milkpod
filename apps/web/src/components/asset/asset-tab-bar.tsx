'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  NavTabs,
  NavTabIndicator,
  navTabVariants,
} from '~/components/ui/tabs';

interface AssetTabBarProps {
  assetId: string;
}

const tabs = [
  { id: 'transcript', label: 'Transcript', suffix: '' },
  { id: 'ask-ai', label: 'Ask AI', suffix: '/chat' },
  { id: 'moments', label: 'Moments', suffix: '/moments' },
  { id: 'comments', label: 'Comments', suffix: '/comments' },
] as const;

function getActiveTab(pathname: string) {
  if (pathname.includes('/chat')) return 'ask-ai';
  if (pathname.includes('/moments')) return 'moments';
  if (pathname.includes('/comments')) return 'comments';
  return 'transcript';
}

export function AssetTabBar({ assetId }: AssetTabBarProps) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);

  return (
    <NavTabs>
      {tabs.map(({ id, label, suffix }) => {
        const isActive = id === activeTab;
        return (
          <Link
            key={id}
            href={`/asset/${assetId}${suffix}`}
            className={navTabVariants({ active: isActive })}
          >
            {label}
            {isActive && <NavTabIndicator />}
          </Link>
        );
      })}
    </NavTabs>
  );
}
