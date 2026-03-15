import type { App } from '@milkpod/api';
import { treaty } from '@elysiajs/eden';
import { clientEnv } from '@milkpod/env/client';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const URL_PATTERN = /https?:\/\/\S+/gi;
const MAX_TOAST_ERROR_LENGTH = 160;

function toToastErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error && error.message
      ? error.message
      : 'Request failed. Please try again.';

  const normalized = raw.replace(URL_PATTERN, '[link]').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Request failed. Please try again.';

  if (normalized.length <= MAX_TOAST_ERROR_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_TOAST_ERROR_LENGTH - 3)}...`;
}

export const api = treaty<App>(clientEnv().NEXT_PUBLIC_SERVER_URL, {
  fetch: {
    credentials: 'include',
  },
});

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = toToastErrorMessage(error);

      toast.error(message, {
        action: {
          label: 'Retry',
          onClick: () => {
            void queryClient.refetchQueries({
              queryKey: query.queryKey,
              type: 'active',
            });
          },
        },
      });
    },
  }),
});
