'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '~/lib/utils';

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
    <div className="relative flex shrink-0 items-end gap-2 border-b border-border/40 px-1 pt-1 pb-2">
      {tabs.map(({ id, label, suffix }) => {
        const isActive = id === activeTab;
        return (
          <Link
            key={id}
            href={`/asset/${assetId}${suffix}`}
            className={cn(
              'relative rounded-lg px-3.5 py-1.5 text-sm transition-colors',
              isActive
                ? 'font-medium text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            {label}
            {/* Active underline — sits on the border-b line */}
            {isActive && (
              <span className="absolute -bottom-[calc(0.5rem+1px)] left-1/2 h-0.5 w-3/4 -translate-x-1/2 rounded-full bg-foreground" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
