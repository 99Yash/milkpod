import { serverEnv } from '@milkpod/env/server';
import { Elysia, status, t } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { getBillingProvider } from './resolve-provider';
import { BillingService } from './service';
import { isAdminEmail } from '../usage/service';

export const billing = new Elysia({ prefix: '/api/billing' })
  .use(authMacro)
  // Preserve raw body for webhook signature verification — Elysia auto-parses
  // JSON which may re-serialize differently, breaking HMAC verification.
  .onParse({ as: 'local' }, async ({ request, path }) => {
    if (path === '/api/billing/webhook') {
      return request.text();
    }
  })

  // -------------------------------------------------------------------------
  // GET /api/billing/summary — authenticated
  // -------------------------------------------------------------------------
  .get(
    '/summary',
    async ({ user }) => {
      const summary = await BillingService.getSummary(user.id);
      return { ...summary, isAdmin: isAdminEmail(user.email) };
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/checkout — authenticated, requires billing provider
  // -------------------------------------------------------------------------
  .post(
    '/checkout',
    async ({ user, body }) => {
      const provider = getBillingProvider();
      if (!provider) {
        return status(503, { message: 'Billing is not configured', code: 'BILLING_DISABLED' });
      }

      const env = serverEnv();
      const origin = env.CORS_ORIGIN;

      try {
        const { checkoutUrl } = await provider.createCheckoutSession({
          userId: user.id,
          email: user.email,
          planId: body.planId,
          interval: body.interval,
          successUrl: `${origin}/dashboard?checkout=success`,
          cancelUrl: `${origin}/pricing?checkout=canceled`,
        });

        return { checkoutUrl };
      } catch (err) {
        console.error('[billing] Checkout error:', err instanceof Error ? err.message : String(err));
        return status(502, { message: 'Could not create checkout session', code: 'CHECKOUT_FAILED' });
      }
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
    async ({ user }) => {
      const provider = getBillingProvider();
      if (!provider) {
        return status(503, { message: 'Billing is not configured', code: 'BILLING_DISABLED' });
      }

      const customer = await BillingService.getCustomer(user.id);
      if (!customer) {
        return status(404, { message: 'No billing account found', code: 'NO_CUSTOMER' });
      }

      try {
        const { portalUrl } = await provider.createPortalSession({
          customerId: customer.providerCustomerId,
          returnUrl: `${serverEnv().CORS_ORIGIN}/dashboard`,
        });

        return { portalUrl };
      } catch (err) {
        console.error('[billing] Portal error:', err instanceof Error ? err.message : String(err));
        return status(502, { message: 'Could not create portal session', code: 'PORTAL_FAILED' });
      }
    },
    { auth: true },
  )

  // -------------------------------------------------------------------------
  // POST /api/billing/cancel — authenticated, requires billing provider
  // -------------------------------------------------------------------------
  .post(
    '/cancel',
    async ({ user, body }) => {
      const provider = getBillingProvider();
      if (!provider) {
        return status(503, { message: 'Billing is not configured', code: 'BILLING_DISABLED' });
      }

      const sub = await BillingService.getActiveProviderSubscriptionId(user.id);
      if (!sub) {
        return status(404, { message: 'No active subscription found', code: 'NO_SUBSCRIPTION' });
      }

      try {
        await provider.cancelSubscription({
          subscriptionId: sub.providerSubscriptionId,
          atPeriodEnd: body.atPeriodEnd,
        });

        return { ok: true };
      } catch (err) {
        console.error('[billing] Cancel error:', err instanceof Error ? err.message : String(err));
        return status(502, { message: 'Could not cancel subscription', code: 'CANCEL_FAILED' });
      }
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
    async ({ body, request }) => {
      const provider = getBillingProvider();
      if (!provider) {
        return status(503, { message: 'Billing is not configured', code: 'BILLING_DISABLED' });
      }

      // body is raw text from onParse hook above
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);

      // Extract headers needed for signature verification
      const webhookHeaders: Record<string, string | undefined> = {
        'webhook-id': request.headers.get('webhook-id') ?? undefined,
        'webhook-timestamp': request.headers.get('webhook-timestamp') ?? undefined,
        'webhook-signature': request.headers.get('webhook-signature') ?? undefined,
      };

      // Verify signature
      if (!provider.verifyWebhookSignature({ body: rawBody, headers: webhookHeaders })) {
        return status(401, { message: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
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
        console.error('[billing] Webhook processing error:', msg);
        return status(500, { message: 'Webhook processing failed', code: 'PROCESSING_FAILED' });
      }

      return { ok: true };
    },
  );
