'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

const ERROR_MESSAGES: Record<string, string> = {
  USER_ALREADY_EXISTS:
    'This email is already registered with email sign-in. Please use email instead.',
  ACCOUNT_NOT_FOUND:
    'No account found for this provider. Please sign in with your original method.',
};

export function AuthErrorToast() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (!error) return;

    const message =
      ERROR_MESSAGES[error] ??
      searchParams.get('message') ??
      'An authentication error occurred. Please try again.';

    toast.error(message);

    // Clean up the URL
    window.history.replaceState({}, '', window.location.pathname);
  }, [searchParams]);

  return null;
}
