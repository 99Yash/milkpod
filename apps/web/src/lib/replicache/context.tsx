'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { clientEnv } from '@milkpod/env/client';
import {
  createMilkpodReplicache,
  type MilkpodReplicache,
} from './client';

const ReplicacheCtx = createContext<MilkpodReplicache | null>(null);

/**
 * Provides a Replicache instance for the signed-in user and keeps it pulling
 * fresh data whenever the server publishes a poke over SSE.
 *
 * Heartbeats on the SSE channel every ~30s; the browser will auto-reconnect
 * when the connection drops. Every poke triggers a `rep.pull()`.
 */
export function ReplicacheProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [rep, setRep] = useState<MilkpodReplicache | null>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastUserIdRef.current === userId && rep) return;
    lastUserIdRef.current = userId;

    const instance = createMilkpodReplicache(userId);
    setRep(instance);
    // Kick an initial pull — pullInterval:null disables the startup one too.
    void instance.pull();

    return () => {
      void instance.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!rep) return;
    const serverUrl = clientEnv().NEXT_PUBLIC_SERVER_URL;
    const es = new EventSource(`${serverUrl}/api/replicache/events`, {
      withCredentials: true,
    });

    es.addEventListener('poke', () => {
      void rep.pull();
    });
    es.onerror = () => {
      // EventSource auto-reconnects on transient errors. If the server is
      // permanently unreachable the browser will keep retrying with backoff.
    };

    return () => {
      es.close();
    };
  }, [rep]);

  return (
    <ReplicacheCtx.Provider value={rep}>{children}</ReplicacheCtx.Provider>
  );
}

export function useReplicache(): MilkpodReplicache | null {
  return useContext(ReplicacheCtx);
}
