import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PlanId } from '../../quota/plans';
import type { BillingProvider, NormalizedWebhookEvent } from '../provider';

// ---------------------------------------------------------------------------
// Config — lazily resolved from env
// ---------------------------------------------------------------------------

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

const POLAR_API = 'https://api.polar.sh';

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env('POLAR_ACCESS_TOKEN')}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Map Polar product UUID → internal PlanId.
 * Env vars hold comma-separated product IDs (monthly,yearly) per plan.
 */
function resolveProductPlanId(productId: string): PlanId {
  const proIds = (process.env.POLAR_PRODUCT_PRO ?? '').split(',').map((s) => s.trim());
  const teamIds = (process.env.POLAR_PRODUCT_TEAM ?? '').split(',').map((s) => s.trim());

  if (proIds.includes(productId)) return 'pro';
  if (teamIds.includes(productId)) return 'team';
  return 'free';
}

function resolvePlanProductId(planId: 'pro' | 'team', interval: 'month' | 'year'): string {
  const key = planId === 'pro' ? 'POLAR_PRODUCT_PRO' : 'POLAR_PRODUCT_TEAM';
  const ids = env(key).split(',').map((s) => s.trim());
  // Env format: "monthly_id,yearly_id"
  const id = interval === 'year' ? ids[1] : ids[0];
  if (!id) throw new Error(`No ${interval}ly product ID configured for ${planId} plan`);
  return id;
}

// ---------------------------------------------------------------------------
// Webhook signature verification (Standard Webhooks / HMAC-SHA256)
// ---------------------------------------------------------------------------

const TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutes

function verifySignature(
  body: string,
  webhookId: string,
  timestamp: string,
  signatureHeader: string,
  secret: string,
): boolean {
  // Validate timestamp tolerance
  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  // Decode secret: strip "whsec_" prefix and base64-decode
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  // Compute expected signature
  const content = `${webhookId}.${timestamp}.${body}`;
  const expected = createHmac('sha256', secretBytes).update(content).digest();

  // Check each signature in the header (space-separated, prefixed with "v1,")
  const signatures = signatureHeader.split(' ');
  for (const sig of signatures) {
    const [version, encoded] = sig.split(',', 2);
    if (version !== 'v1' || !encoded) continue;
    const decoded = Buffer.from(encoded, 'base64');
    if (decoded.length === expected.length && timingSafeEqual(decoded, expected)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Polar adapter
// ---------------------------------------------------------------------------

type PolarSubscription = {
  id: string;
  status: string;
  product_id: string;
  customer_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  customer?: { email?: string };
};

function mapPolarStatus(
  status: string,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'revoked':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

export const polarProvider: BillingProvider = {
  name: 'polar',

  async createCheckoutSession(params) {
    const productId = resolvePlanProductId(params.planId, params.interval);

    const res = await fetch(`${POLAR_API}/v1/checkouts/`, {
      method: 'POST',
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        products: [productId],
        customer_email: params.email,
        external_customer_id: params.userId,
        success_url: params.successUrl,
        metadata: {
          milkpod_user_id: params.userId,
          milkpod_plan_id: params.planId,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polar checkout failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { url: string };
    return { checkoutUrl: data.url };
  },

  async createPortalSession(params) {
    const res = await fetch(`${POLAR_API}/v1/customer-sessions/`, {
      method: 'POST',
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        customer_id: params.customerId,
        return_url: params.returnUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polar portal session failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { customer_portal_url: string };
    return { portalUrl: data.customer_portal_url };
  },

  async cancelSubscription(params) {
    const body: Record<string, unknown> = params.atPeriodEnd
      ? { cancel_at_period_end: true }
      : { revoke: true };

    const res = await fetch(`${POLAR_API}/v1/subscriptions/${params.subscriptionId}`, {
      method: 'PATCH',
      headers: headers(),
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polar cancel failed (${res.status}): ${text}`);
    }
  },

  verifyWebhookSignature(params) {
    const secret = env('POLAR_WEBHOOK_SECRET');
    const webhookId = params.headers['webhook-id'] ?? '';
    const timestamp = params.headers['webhook-timestamp'] ?? '';
    const signature = params.headers['webhook-signature'] ?? '';

    if (!webhookId || !timestamp || !signature) return false;

    return verifySignature(params.body, webhookId, timestamp, signature, secret);
  },

  parseWebhookEvent(body, headers) {
    const payload = JSON.parse(body) as {
      type: string;
      data: PolarSubscription;
    };

    const sub = payload.data;

    // Map Polar event types to normalized types
    let type: NormalizedWebhookEvent['type'];
    switch (payload.type) {
      case 'subscription.created':
      case 'subscription.active':
        type = 'checkout.completed';
        break;
      case 'subscription.updated':
      case 'subscription.uncanceled':
        type = 'subscription.updated';
        break;
      case 'subscription.canceled':
      case 'subscription.revoked':
        type = 'subscription.canceled';
        break;
      case 'subscription.past_due':
        type = 'payment.failed';
        break;
      default:
        type = 'subscription.updated';
    }

    // Use Standard Webhooks webhook-id header as the unique event ID
    const providerEventId =
      headers['webhook-id'] ?? `${payload.type}_${sub.id}_${Date.now()}`;

    return {
      providerEventId,
      type,
      customerId: sub.customer_id,
      subscriptionId: sub.id,
      email: sub.customer?.email ?? null,
      planId: resolveProductPlanId(sub.product_id),
      status: mapPolarStatus(sub.status),
      currentPeriodStart: sub.current_period_start ? new Date(sub.current_period_start) : null,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      rawPayload: payload,
    };
  },
};
