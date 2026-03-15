import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  Search,
  X,
} from 'lucide-react';
import { useCallback } from 'react';
import { Avatar, AvatarFallback } from '~/components/ui/avatar';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import type { SpeakerNamesMap } from './speaker-names';
import { SpeakerNamesPopover } from './speaker-names-popover';

function getSpeakerInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }

  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

interface TranscriptToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  totalMatches: number;
  activeMatchIndex: number;
  onPrevMatch: () => void;
  onNextMatch: () => void;
  isSearching?: boolean;
  speakerIds?: string[];
  speakerNames?: SpeakerNamesMap;
  onSaveSpeakerNames?: (speakerNames: SpeakerNamesMap) => Promise<void>;
  isSavingSpeakerNames?: boolean;
  speakerFilters?: Array<{
    id: string;
    label: string;
    count: number;
    active: boolean;
  }>;
  isAllSpeakersActive?: boolean;
  onToggleSpeakerFilter?: (speakerId: string) => void;
  onSelectAllSpeakers?: () => void;
}

export function TranscriptToolbar({
  search,
  onSearchChange,
  totalMatches,
  activeMatchIndex,
  onPrevMatch,
  onNextMatch,
  isSearching,
  speakerIds = [],
  speakerNames = {},
  onSaveSpeakerNames,
  isSavingSpeakerNames,
  speakerFilters = [],
  isAllSpeakersActive = true,
  onToggleSpeakerFilter,
  onSelectAllSpeakers,
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
          <Input
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

        {onSaveSpeakerNames && speakerIds.length > 0 && (
          <SpeakerNamesPopover
            speakerIds={speakerIds}
            speakerNames={speakerNames}
            onSaveSpeakerNames={onSaveSpeakerNames}
            isSavingSpeakerNames={isSavingSpeakerNames}
          />
        )}

      </div>

      {speakerFilters.length > 1 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Mic className="size-3.5" />
            Speaker focus
          </span>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSelectAllSpeakers}
            className={cn(
              'h-7 rounded-full px-2 text-xs',
              isAllSpeakersActive
                ? 'border-ring/60 bg-accent text-foreground ring-2 ring-ring/35'
                : 'text-muted-foreground',
            )}
            aria-pressed={isAllSpeakersActive}
          >
            All
          </Button>

          {speakerFilters.map((speaker) => (
            <Button
              key={speaker.id}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onToggleSpeakerFilter?.(speaker.id)}
              className={cn(
                'h-7 rounded-full px-2 text-xs',
                speaker.active
                  ? 'border-ring/60 bg-accent text-foreground ring-2 ring-ring/35'
                  : 'text-muted-foreground',
              )}
              aria-pressed={speaker.active}
            >
              <Avatar className="size-4 border border-border/60">
                <AvatarFallback className="text-[9px] font-semibold">
                  {getSpeakerInitials(speaker.label)}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[8rem] truncate">{speaker.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
