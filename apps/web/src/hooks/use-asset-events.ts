'use client';

import { useEffect, useRef } from 'react';
import { clientEnv } from '@milkpod/env/client';
import type { AssetStatus } from '@milkpod/api/types';

const SERVER_URL = clientEnv().NEXT_PUBLIC_SERVER_URL;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;
/** How many consecutive retries at max delay before switching to polling */
const MAX_RETRIES_AT_MAX_DELAY = 3;
const POLL_INTERVAL = 5_000;

export interface AssetStatusEvent {
  assetId: string;
  status: AssetStatus;
  message?: string;
  progress?: number;
}

/**
 * Subscribe to real-time asset status changes via SSE.
 * Falls back to polling via `onPollFallback` if SSE fails permanently.
 */
export function useAssetEvents(
  onStatusChange: (event: AssetStatusEvent) => void,
  options?: { onPollFallback?: () => void }
): void {
  const callbackRef = useRef(onStatusChange);
  callbackRef.current = onStatusChange;

  const pollFallbackRef = useRef(options?.onPollFallback);
  pollFallbackRef.current = options?.onPollFallback;

  useEffect(() => {
    let reconnectAttempt = 0;
    let maxDelayHits = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let es: EventSource | null = null;
    let disposed = false;

    function startPolling() {
      if (disposed || pollTimer) return;
      pollFallbackRef.current?.();
      pollTimer = setInterval(() => {
        if (!disposed) pollFallbackRef.current?.();
      }, POLL_INTERVAL);
    }

    function open() {
      if (disposed) return;
      es = new EventSource(`${SERVER_URL}/api/assets/events`, {
        withCredentials: true,
      });

      es.onopen = () => {
        reconnectAttempt = 0;
        maxDelayHits = 0;
        // SSE recovered — stop polling if active
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = undefined;
        }
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

        const delay = Math.min(
          BASE_RECONNECT_DELAY * 2 ** reconnectAttempt,
          MAX_RECONNECT_DELAY
        );
        reconnectAttempt++;

        if (delay >= MAX_RECONNECT_DELAY) {
          maxDelayHits++;
        }

        // After repeated failures at max delay, fall back to polling
        if (maxDelayHits >= MAX_RETRIES_AT_MAX_DELAY && pollFallbackRef.current) {
          startPolling();
          return;
        }

        reconnectTimer = setTimeout(open, delay);
      };
    }

    open();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
      es?.close();
    };
  }, []);
}
