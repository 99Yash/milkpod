'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  ListFilter,
  CircleCheck,
  Clock,
  Download,
  AudioLines,
  Layers,
  CircleX,
  Globe,
  Youtube,
  Podcast,
  Upload,
  ExternalLink,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export interface AssetFilters {
  q: string;
  status: string;
  sourceType: string;
}

interface SearchFilterBarProps {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}

const statusOptions = [
  { value: '_all', label: 'All statuses', icon: ListFilter },
  { value: 'ready', label: 'Ready', icon: CircleCheck, className: 'text-emerald-500' },
  { value: 'queued', label: 'Queued', icon: Clock, className: 'text-amber-500' },
  { value: 'fetching', label: 'Fetching', icon: Download, className: 'text-blue-500' },
  { value: 'transcribing', label: 'Transcribing', icon: AudioLines, className: 'text-violet-500' },
  { value: 'embedding', label: 'Embedding', icon: Layers, className: 'text-indigo-500' },
  { value: 'failed', label: 'Failed', icon: CircleX, className: 'text-red-500' },
] as const;

const sourceOptions = [
  { value: '_all', label: 'All sources', icon: Globe },
  { value: 'youtube', label: 'YouTube', icon: Youtube, className: 'text-red-500' },
  { value: 'podcast', label: 'Podcast', icon: Podcast, className: 'text-purple-500' },
  { value: 'upload', label: 'Upload', icon: Upload, className: 'text-blue-500' },
  { value: 'external', label: 'External', icon: ExternalLink, className: 'text-zinc-500' },
] as const;

export function SearchFilterBar({ filters, onChange }: SearchFilterBarProps) {
  const [localQuery, setLocalQuery] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce text search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (localQuery !== filters.q) {
        onChange({ ...filters, q: localQuery });
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [localQuery, filters, onChange]);

  const hasActiveFilters = filters.q || filters.status || filters.sourceType;

  const activeStatus = statusOptions.find(
    (o) => o.value === (filters.status || '_all')
  )!;
  const activeSource = sourceOptions.find(
    (o) => o.value === (filters.sourceType || '_all')
  )!;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by title or channel..."
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          className="h-8 pl-8 pr-8 text-xs"
        />
        <button
          type="button"
          onClick={() => {
            setLocalQuery('');
            onChange({ ...filters, q: '' });
          }}
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-[opacity,transform] duration-150",
            localQuery ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          )}
          tabIndex={localQuery ? 0 : -1}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Status dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 h-8 text-xs font-medium font-open-runde",
            "shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
            "data-[state=open]:bg-accent",
            filters.status && "border-foreground/20"
          )}
        >
          <activeStatus.icon
            className={cn(
              "size-3.5",
              'className' in activeStatus
                ? activeStatus.className
                : "text-muted-foreground"
            )}
          />
          <span>{activeStatus.label}</span>
          <ChevronDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-(--radix-dropdown-menu-trigger-width) font-open-runde"
        >
          {statusOptions.map((opt) => {
            const selected = (filters.status || '_all') === opt.value;
            return (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() =>
                  onChange({ ...filters, status: opt.value === '_all' ? '' : opt.value })
                }
                className="gap-2 text-xs"
              >
                <opt.icon
                  className={cn(
                    "size-3.5",
                    'className' in opt ? opt.className : "text-muted-foreground"
                  )}
                />
                <span className="flex-1">{opt.label}</span>
                {selected && <Check className="size-3.5 text-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sources dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2.5 h-8 text-xs font-medium font-open-runde",
            "shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
            "data-[state=open]:bg-accent",
            filters.sourceType && "border-foreground/20"
          )}
        >
          <activeSource.icon
            className={cn(
              "size-3.5",
              'className' in activeSource
                ? activeSource.className
                : "text-muted-foreground"
            )}
          />
          <span>{activeSource.label}</span>
          <ChevronDown className="size-3 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-(--radix-dropdown-menu-trigger-width) font-open-runde"
        >
          {sourceOptions.map((opt) => {
            const selected = (filters.sourceType || '_all') === opt.value;
            return (
              <DropdownMenuItem
                key={opt.value}
                onSelect={() =>
                  onChange({ ...filters, sourceType: opt.value === '_all' ? '' : opt.value })
                }
                className="gap-2 text-xs"
              >
                <opt.icon
                  className={cn(
                    "size-3.5",
                    'className' in opt ? opt.className : "text-muted-foreground"
                  )}
                />
                <span className="flex-1">{opt.label}</span>
                {selected && <Check className="size-3.5 text-foreground" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            setLocalQuery('');
            onChange({ q: '', status: '', sourceType: '' });
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
