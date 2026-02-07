import { useEffect, useState } from 'react';
import { LAST_AUTH_METHOD_KEY, type AuthOptionsType } from '~/lib/constants';
import { getLocalStorageItem, LOCAL_STORAGE_CHANGE_EVENT } from '~/lib/utils';

export function useLastAuthMethod() {
  const [lastAuthMethod, setLastAuthMethod] =
    useState<AuthOptionsType | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncLastAuthMethod = () => {
      setLastAuthMethod(getLocalStorageItem(LAST_AUTH_METHOD_KEY) ?? null);
    };

    syncLastAuthMethod();

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== LAST_AUTH_METHOD_KEY) {
        return;
      }

      syncLastAuthMethod();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, syncLastAuthMethod);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, syncLastAuthMethod);
    };
  }, []);

  return lastAuthMethod;
}
