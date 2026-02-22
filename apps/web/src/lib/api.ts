import type { App } from '@milkpod/api';
import { treaty } from '@elysiajs/eden';
import { clientEnv } from '@milkpod/env/client';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const api = treaty<App>(clientEnv().NEXT_PUBLIC_SERVER_URL, {
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
