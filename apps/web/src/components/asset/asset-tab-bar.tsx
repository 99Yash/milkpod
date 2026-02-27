'use client';

import { FileText, MessageSquareText } from 'lucide-react';
import { cn } from '~/lib/utils';

export type AssetTab = 'transcript' | 'ask-ai';

interface AssetTabBarProps {
  activeTab: AssetTab;
  onTabChange: (tab: AssetTab) => void;
}

const tabs: { id: AssetTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'transcript', label: 'Transcript', icon: FileText },
  { id: 'ask-ai', label: 'Ask AI', icon: MessageSquareText },
];

export function AssetTabBar({ activeTab, onTabChange }: AssetTabBarProps) {
  return (
    <div className="flex shrink-0 gap-1 border-b border-border/40">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onTabChange(id)}
          className={cn(
            'relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === id
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground/80',
          )}
        >
          <Icon className="size-4" />
          {label}
          {activeTab === id && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
          )}
        </button>
      ))}
    </div>
  );
}
