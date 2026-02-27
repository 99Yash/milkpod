import { useCallback } from 'react';
import { Search, X, List, BookOpen, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '~/lib/utils';
import type { ViewMode } from './types';

interface TranscriptToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  totalMatches: number;
  activeMatchIndex: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showViewToggle: boolean;
  isSearching?: boolean;
}

export function TranscriptToolbar({
  search,
  onSearchChange,
  totalMatches,
  activeMatchIndex,
  onPrevMatch,
  onNextMatch,
  viewMode,
  onViewModeChange,
  showViewToggle,
  isSearching,
}: TranscriptToolbarProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrevMatch();
        } else {
          onNextMatch();
        }
      }
    },
    [onPrevMatch, onNextMatch],
  );

  const hasSearch = search.length > 0;

  return (
    <div className="shrink-0 px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search transcript..."
            aria-label="Search transcript"
            className={cn(
              'h-9 w-full rounded-lg border border-border/50 bg-background/70 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-border/60',
              hasSearch ? 'pr-32' : 'pr-9',
            )}
          />

          {hasSearch && (
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <span className="px-1 text-xs tabular-nums text-muted-foreground">
                {isSearching ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : totalMatches > 0 ? (
                  `${activeMatchIndex + 1}/${totalMatches}`
                ) : (
                  '0/0'
                )}
              </span>
              <button
                type="button"
                onClick={onPrevMatch}
                disabled={totalMatches === 0}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Previous match (Shift+Enter)"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={onNextMatch}
                disabled={totalMatches === 0}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Next match (Enter)"
              >
                <ChevronDown className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {showViewToggle && (
          <div className="flex shrink-0 items-center rounded-full border border-border/60 bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('flat')}
              className={cn(
                'rounded-full p-1.5 transition-colors',
                viewMode === 'flat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="List view"
              aria-pressed={viewMode === 'flat'}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('chapters')}
              className={cn(
                'rounded-full p-1.5 transition-colors',
                viewMode === 'chapters'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Chapter view"
              aria-pressed={viewMode === 'chapters'}
            >
              <BookOpen className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
