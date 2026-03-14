'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '~/components/ui/command';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';
import { fetchAssetsPage } from '~/lib/api-fetchers';
import { queryKeys } from '~/lib/query-keys';
import type { Asset } from '@milkpod/api/types';

const PAGE_SIZE = 20;

interface AssetComboboxProps {
  assets: Asset[];
  value: string | undefined;
  onChange: (id: string) => void;
}

export function AssetCombobox({ assets, value, onChange }: AssetComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const query = useMemo(
    () => ({ status: 'ready', ...(search ? { q: search } : {}) }),
    [search],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.assets.page(query),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        fetchAssetsPage({
          q: query.q,
          status: query.status,
          cursor: pageParam,
          limit: PAGE_SIZE,
        }),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: open,
    });

  const paginatedAssets = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // Use paginated results when the popover is open (and we have data),
  // otherwise fall back to the initial assets prop for the trigger label.
  const items = open && data ? paginatedAssets : assets;

  const selectedLabel = useMemo(() => {
    if (!value) return undefined;
    // Check both sources for the label
    const fromItems = items.find((a) => a.id === value);
    if (fromItems) return fromItems.title;
    const fromInitial = assets.find((a) => a.id === value);
    return fromInitial?.title;
  }, [value, items, assets]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  // Attach scroll listener to the cmdk list element
  useEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [open, handleScroll]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 max-w-[320px] justify-between gap-2 border-ring/20 bg-background px-3 text-xs font-normal hover:bg-accent/18"
        >
          <span className="truncate">
            {selectedLabel ?? 'Select a video...'}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] border-ring/20 p-0 font-open-runde"
        side="bottom"
        align="end"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search videos..."
            className="h-8 text-xs"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList ref={listRef}>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Spinner className="size-4" />
              </div>
            ) : items.length === 0 ? (
              <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                No videos found.
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {items.map((asset) => (
                  <CommandItem
                    key={asset.id}
                    value={asset.id}
                    onSelect={(id) => {
                      onChange(id);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={cn(
                        'size-3 shrink-0',
                        asset.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate text-xs">{asset.title}</span>
                  </CommandItem>
                ))}
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-2">
                    <Spinner className="size-3.5" />
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
