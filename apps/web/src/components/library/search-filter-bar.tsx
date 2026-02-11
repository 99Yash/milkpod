'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

export interface AssetFilters {
  q: string;
  status: string;
  sourceType: string;
}

interface SearchFilterBarProps {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}

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
        {localQuery && (
          <button
            type="button"
            onClick={() => {
              setLocalQuery('');
              onChange({ ...filters, q: '' });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Select
        value={filters.status || '_all'}
        onValueChange={(v) =>
          onChange({ ...filters, status: v === '_all' ? '' : v })
        }
      >
        <SelectTrigger size="sm" className="h-8 text-xs min-w-[110px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All statuses</SelectItem>
          <SelectItem value="ready">Ready</SelectItem>
          <SelectItem value="queued">Queued</SelectItem>
          <SelectItem value="fetching">Fetching</SelectItem>
          <SelectItem value="transcribing">Transcribing</SelectItem>
          <SelectItem value="embedding">Embedding</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.sourceType || '_all'}
        onValueChange={(v) =>
          onChange({ ...filters, sourceType: v === '_all' ? '' : v })
        }
      >
        <SelectTrigger size="sm" className="h-8 text-xs min-w-[110px]">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">All sources</SelectItem>
          <SelectItem value="youtube">YouTube</SelectItem>
          <SelectItem value="podcast">Podcast</SelectItem>
          <SelectItem value="upload">Upload</SelectItem>
          <SelectItem value="external">External</SelectItem>
        </SelectContent>
      </Select>
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
