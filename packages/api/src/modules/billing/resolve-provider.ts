import { serverEnv } from '@milkpod/env/server';
import type { BillingProvider } from './provider';
import { polarProvider } from './providers/polar';

let _provider: BillingProvider | null | undefined;

/**
 * Returns the configured billing provider, or null if billing is disabled.
 * Throws if the configured provider is not implemented.
 */
export function getBillingProvider(): BillingProvider | null {
  if (_provider !== undefined) return _provider;

  const providerName = serverEnv().BILLING_PROVIDER;
  if (!providerName) {
    _provider = null;
    return null;
  }

  switch (providerName) {
    case 'polar':
      _provider = polarProvider;
      return _provider;
    default:
      throw new Error(`Unsupported billing provider: ${providerName}`);
  }
}
