'use client';

import { useEffect, useRef, useCallback } from 'react';
import { clientEnv } from '@milkpod/env/client';
import type { AssetStatus } from '@milkpod/api/types';

const SERVER_URL = clientEnv().NEXT_PUBLIC_SERVER_URL;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

export interface AssetStatusEvent {
  assetId: string;
  status: AssetStatus;
  message?: string;
  progress?: number;
}

export function useAssetEvents(
  onStatusChange: (event: AssetStatusEvent) => void
): void {
  const callbackRef = useRef(onStatusChange);
  callbackRef.current = onStatusChange;

  const connect = useCallback(() => {
    let reconnectAttempt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let es: EventSource | null = null;
    let disposed = false;

    function open() {
      if (disposed) return;
      es = new EventSource(`${SERVER_URL}/api/assets/events`, {
        withCredentials: true,
      });

      es.onopen = () => {
        reconnectAttempt = 0;
      };

      es.onmessage = (e) => {
        try {
          const event: AssetStatusEvent = JSON.parse(e.data);
          callbackRef.current(event);
        } catch {
          // ignore malformed messages
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (disposed) return;
        // Reconnect with exponential backoff
        const delay = Math.min(
          BASE_RECONNECT_DELAY * 2 ** reconnectAttempt,
          MAX_RECONNECT_DELAY
        );
        reconnectAttempt++;
        reconnectTimer = setTimeout(open, delay);
      };
    }

    open();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);
}
