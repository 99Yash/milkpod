'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, MessageSquareText, Sparkles } from 'lucide-react';
import { cn } from '~/lib/utils';

interface AssetTabBarProps {
  assetId: string;
}

const tabs = [
  { id: 'transcript', label: 'Transcript', icon: FileText, suffix: '' },
  { id: 'ask-ai', label: 'Ask AI', icon: MessageSquareText, suffix: '/chat' },
  { id: 'moments', label: 'Moments', icon: Sparkles, suffix: '/moments' },
] as const;

function getActiveTab(pathname: string) {
  if (pathname.includes('/chat')) return 'ask-ai';
  if (pathname.includes('/moments')) return 'moments';
  return 'transcript';
}

export function AssetTabBar({ assetId }: AssetTabBarProps) {
  const pathname = usePathname();
  const activeTab = getActiveTab(pathname);

  return (
    <div className="flex shrink-0 gap-1 border-b border-border/40">
      {tabs.map(({ id, label, icon: Icon, suffix }) => {
        const isActive = id === activeTab;
        return (
          <Link
            key={id}
            href={`/asset/${assetId}${suffix}`}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80',
            )}
          >
            <Icon className="size-4" />
            {label}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
