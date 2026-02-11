'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { AssetStatus } from '@milkpod/api/types';

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

interface AssetStatusEvent {
  assetId: string;
  status: AssetStatus;
  message?: string;
}

export function useAssetEvents(
  onStatusChange: (assetId: string, status: AssetStatus) => void
) {
  const callbackRef = useRef(onStatusChange);
  callbackRef.current = onStatusChange;

  const connect = useCallback(() => {
    const es = new EventSource(`${SERVER_URL}/api/assets/events`, {
      withCredentials: true,
    });

    es.onmessage = (e) => {
      try {
        const event: AssetStatusEvent = JSON.parse(e.data);
        callbackRef.current(event.assetId, event.status);
      } catch {
        // ignore malformed messages
      }
    };

    return es;
  }, []);

  useEffect(() => {
    const es = connect();

    return () => {
      es.close();
    };
  }, [connect]);
}
