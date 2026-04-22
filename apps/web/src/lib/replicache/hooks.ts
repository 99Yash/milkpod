'use client';

import { useEffect, useState } from 'react';
import {
  commentPrefix,
  momentPrefix,
  type SyncedComment,
  type SyncedMoment,
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
      async (tx) => {
        const acc: T[] = [];
        for await (const value of tx.scan({ prefix }).values()) {
          acc.push(value as T);
        }
        return acc;
      },
      {
        onData: (data) => {
          setItems(data);
          setReady(true);
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
