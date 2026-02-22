import type { App } from '@milkpod/api';
import { treaty } from '@elysiajs/eden';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const SERVER_URL =
  process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export const api = treaty<App>(SERVER_URL, {
  fetch: {
    credentials: 'include',
  },
});

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(error.message, {
        action: {
          label: 'retry',
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});
