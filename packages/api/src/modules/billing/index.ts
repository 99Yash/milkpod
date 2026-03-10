import { serverEnv } from '@milkpod/env/server';
import { Elysia, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { getBillingProvider } from './resolve-provider';
import { BillingService } from './service';

export const billing = new Elysia({ prefix: '/api/billing' })
  .use(authMacro)

  // -------------------------------------------------------------------------
  // GET /api/billing/summary — authenticated
  // -------------------------------------------------------------------------
  .get(
    '/summary',
    async ({ user }) => {
      return BillingService.getSummary(user.id);
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/checkout — authenticated, requires billing provider
  // -------------------------------------------------------------------------
  .post(
    '/checkout',
    async ({ user, body, set }) => {
      const provider = getBillingProvider();
      if (!provider) {
        set.status = 503;
        return { error: 'billing_disabled', message: 'Billing is not configured' };
      }

      const env = serverEnv();
      const origin = env.CORS_ORIGIN;

      const { checkoutUrl } = await provider.createCheckoutSession({
        userId: user.id,
        email: user.email,
        planId: body.planId,
        interval: body.interval,
        successUrl: `${origin}/dashboard?checkout=success`,
        cancelUrl: `${origin}/pricing?checkout=canceled`,
      });

      return { checkoutUrl };
    },
    {
      auth: true,
      body: t.Object({
        planId: t.Union([t.Literal('pro'), t.Literal('team')]),
        interval: t.Union([t.Literal('month'), t.Literal('year')]),
      }),
    },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/portal — authenticated, requires billing provider
  // -------------------------------------------------------------------------
  .post(
    '/portal',
    async ({ user, set }) => {
      const provider = getBillingProvider();
      if (!provider) {
        set.status = 503;
        return { error: 'billing_disabled', message: 'Billing is not configured' };
      }

      const customer = await BillingService.getCustomer(user.id);
      if (!customer) {
        set.status = 404;
        return { error: 'no_customer', message: 'No billing account found' };
      }

      const { portalUrl } = await provider.createPortalSession({
        customerId: customer.providerCustomerId,
        returnUrl: `${serverEnv().CORS_ORIGIN}/dashboard`,
      });

      return { portalUrl };
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/cancel — authenticated, requires billing provider
  // -------------------------------------------------------------------------
  .post(
    '/cancel',
    async ({ user, body, set }) => {
      const provider = getBillingProvider();
      if (!provider) {
        set.status = 503;
        return { error: 'billing_disabled', message: 'Billing is not configured' };
      }

      const sub = await BillingService.getActiveProviderSubscriptionId(user.id);
      if (!sub) {
        set.status = 404;
        return { error: 'no_subscription', message: 'No active subscription found' };
      }

      await provider.cancelSubscription({
        subscriptionId: sub.providerSubscriptionId,
        atPeriodEnd: body.atPeriodEnd,
      });

      return { ok: true };
    },
    {
      auth: true,
      body: t.Object({
        atPeriodEnd: t.Boolean({ default: true }),
      }),
    },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/webhook — unauthenticated, signature-verified
  // -------------------------------------------------------------------------
  .post(
    '/webhook',
    async ({ body, request, set }) => {
      const provider = getBillingProvider();
      if (!provider) {
        set.status = 503;
        return { error: 'billing_disabled' };
      }

      // Read raw body as string for signature verification
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);

      // Extract headers needed for signature verification
      const webhookHeaders: Record<string, string | undefined> = {
        'webhook-id': request.headers.get('webhook-id') ?? undefined,
        'webhook-timestamp': request.headers.get('webhook-timestamp') ?? undefined,
        'webhook-signature': request.headers.get('webhook-signature') ?? undefined,
      };

      // Verify signature
      if (!provider.verifyWebhookSignature({ body: rawBody, headers: webhookHeaders })) {
        set.status = 401;
        return { error: 'invalid_signature' };
      }

      // Parse event
      const event = provider.parseWebhookEvent(rawBody, webhookHeaders);

      // Idempotency check
      const alreadyProcessed = await BillingService.isEventProcessed(event.providerEventId);
      if (alreadyProcessed) {
        return { ok: true, duplicate: true };
      }

      // Process event
      try {
        await BillingService.processWebhookEvent(event, provider.name);
      } catch (err) {
        // If it's a unique constraint violation (race condition), treat as success
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('unique') || msg.includes('duplicate')) {
          return { ok: true, duplicate: true };
        }
        console.error('[billing] Webhook processing error:', err);
        set.status = 500;
        return { error: 'processing_failed' };
      }

      return { ok: true };
    },
    {
      // Webhook endpoints receive raw body — parse: false isn't available
      // in Elysia, but the body will be parsed as JSON automatically.
      // We re-serialize for signature verification above.
    },
  );
