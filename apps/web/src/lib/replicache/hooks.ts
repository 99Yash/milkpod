'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  commentPrefix,
  momentPrefix,
  notificationPrefix,
  type SyncedComment,
  type SyncedMoment,
  type SyncedNotification,
} from '@milkpod/sync';
import { useReplicache } from './context';

export interface SubscriptionResult<T> {
  items: T[];
  /** True once the underlying Replicache subscription has fired at least once for this prefix. */
  ready: boolean;
}

function usePrefixSubscription<T>(prefix: string): SubscriptionResult<T> {
  const rep = useReplicache();
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!rep) {
      setItems([]);
      setReady(false);
      return;
    }
    setReady(false);
    const unsubscribe = rep.subscribe(
      async (tx) => (await tx.scan({ prefix }).toArray()) as T[],
      {
        onData: (data) => {
          setItems(data);
          setReady(true);
        },
        onError: (err) => {
          console.error(
            `replicache subscribe failed for prefix "${prefix}":`,
            err instanceof Error ? err.message : String(err),
          );
        },
      },
    );
    return unsubscribe;
  }, [rep, prefix]);

  return { items, ready };
}

export function useSubscribedMoments(
  assetId: string,
): SubscriptionResult<SyncedMoment> {
  return usePrefixSubscription<SyncedMoment>(momentPrefix(assetId));
}

export function useSubscribedComments(
  assetId: string,
): SubscriptionResult<SyncedComment> {
  return usePrefixSubscription<SyncedComment>(commentPrefix(assetId));
}

export interface NotificationsSubscription {
  items: SyncedNotification[];
  unreadCount: number;
  ready: boolean;
}

/**
 * Subscribe to the caller's notification stream. Always returns rows sorted
 * newest-first by `createdAt`, with the unread count computed from the same
 * data so the bell badge stays in sync without a second round-trip.
 */
export function useSubscribedNotifications(): NotificationsSubscription {
  const { items, ready } = usePrefixSubscription<SyncedNotification>(
    notificationPrefix,
  );
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.createdAt - a.createdAt),
    [items],
  );
  const unreadCount = useMemo(
    () => sorted.reduce((n, it) => n + (it.readAt == null ? 1 : 0), 0),
    [sorted],
  );
  return { items: sorted, unreadCount, ready };
}

/**
 * Track which synced rows have arrived or changed `rowVersion` since the last
 * render. Useful for flashing a subtle highlight when sync brings something
 * in. Skips the initial population so the whole list doesn't light up at once.
 */
export function useRecentlyChanged(
  items: ReadonlyArray<{ id: string; rowVersion: number }>,
  highlightMs = 1200,
): Set<string> {
  const prevRef = useRef<Map<string, number>>(new Map());
  const [recent, setRecent] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prev = prevRef.current;
    const now = new Map<string, number>();
    const newlyChanged: string[] = [];
    for (const it of items) {
      now.set(it.id, it.rowVersion);
      const prevV = prev.get(it.id);
      if (prevV === undefined || prevV !== it.rowVersion) {
        newlyChanged.push(it.id);
      }
    }
    const isInitialPopulation = prev.size === 0 && items.length > 0;
    prevRef.current = now;

    if (isInitialPopulation || newlyChanged.length === 0) return;

    setRecent((cur) => {
      const next = new Set(cur);
      for (const id of newlyChanged) next.add(id);
      return next;
    });
    const timer = setTimeout(() => {
      setRecent((cur) => {
        const next = new Set(cur);
        for (const id of newlyChanged) next.delete(id);
        return next;
      });
    }, highlightMs);
    return () => clearTimeout(timer);
  }, [items, highlightMs]);

  return recent;
}
