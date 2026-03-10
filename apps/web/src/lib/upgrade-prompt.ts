import { toast } from 'sonner';

type UpgradeErrorPayload = {
  message?: string;
  code?: string;
  [key: string]: unknown;
};

const UPGRADE_MESSAGES: Record<string, string> = {
  QUOTA_EXCEEDED: 'You have reached your monthly limit. Upgrade for more capacity.',
  MODEL_NOT_ALLOWED: 'This AI model requires a paid plan.',
  SHARE_LINK_LIMIT: 'Share link limit reached. Upgrade for unlimited links.',
  COLLECTION_LIMIT: 'Collection limit reached. Upgrade for unlimited collections.',
  PUBLIC_SHARE_QA_NOT_ALLOWED: 'Public share Q&A requires a Pro or Team plan.',
};

/**
 * Checks if an Eden treaty error response is a 402 upgrade-required error.
 * If so, shows an upgrade toast and returns true.
 * Otherwise returns false so callers can fall through to normal error handling.
 */
export function handleUpgradeError(error: {
  status?: number;
  value?: unknown;
}): boolean {
  if (error.status !== 402) return false;

  const payload = error.value as UpgradeErrorPayload | undefined;
  const code = payload?.code;
  const message =
    (code && UPGRADE_MESSAGES[code]) ||
    (typeof payload?.message === 'string' ? payload.message : null) ||
    'Upgrade your plan to continue.';

  toast.error(message, {
    action: {
      label: 'View plans',
      onClick: () => {
        window.location.href = '/pricing';
      },
    },
    duration: 8000,
  });

  return true;
}
