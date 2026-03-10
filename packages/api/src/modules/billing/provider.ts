import type { PlanId } from '../quota/plans';

// ---------------------------------------------------------------------------
// Normalized webhook event types
// ---------------------------------------------------------------------------

export type NormalizedEventType =
  | 'checkout.completed'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'payment.failed';

export type NormalizedWebhookEvent = {
  providerEventId: string;
  type: NormalizedEventType;
  /** Provider customer ID (created at checkout or subscription start). */
  customerId: string;
  /** Provider subscription ID. */
  subscriptionId: string;
  /** Email of the customer (from checkout). */
  email: string | null;
  /** Internal plan ID derived from the provider product/price. */
  planId: PlanId;
  /** Subscription status after this event. */
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete';
  /** Current billing period start. */
  currentPeriodStart: Date | null;
  /** Current billing period end. */
  currentPeriodEnd: Date | null;
  /** Whether the subscription cancels at period end. */
  cancelAtPeriodEnd: boolean;
  /** Raw provider payload for audit logging. */
  rawPayload: unknown;
};

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface BillingProvider {
  readonly name: 'polar' | 'razorpay';

  createCheckoutSession(params: {
    userId: string;
    email: string;
    planId: 'pro' | 'team';
    interval: 'month' | 'year';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ checkoutUrl: string }>;

  createPortalSession(params: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ portalUrl: string }>;

  cancelSubscription(params: {
    subscriptionId: string;
    atPeriodEnd: boolean;
  }): Promise<void>;

  verifyWebhookSignature(params: {
    body: string;
    headers: Record<string, string | undefined>;
  }): boolean;

  parseWebhookEvent(
    body: string,
    headers: Record<string, string | undefined>,
  ): NormalizedWebhookEvent;
}
