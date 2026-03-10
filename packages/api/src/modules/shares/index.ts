import { Elysia, status } from 'elysia';
import { createChatStream } from '@milkpod/ai';
import { authMacro } from '../../middleware/auth';
import { ShareModel } from './model';
import { ShareService } from './service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';
import { resolveUserPlan, getEntitlementsForPlan } from '../quota/plans';
import { isAdminEmail, UsageService } from '../usage/service';

export const shares = new Elysia({ prefix: '/api/shares' })
  .use(authMacro)
  // Create a share link
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

      // Must scope to exactly one of asset or collection
      if (!body.assetId && !body.collectionId) {
        return status(400, { message: 'Either assetId or collectionId is required' });
      }
      if (body.assetId && body.collectionId) {
        return status(400, { message: 'Provide either assetId or collectionId, not both' });
      }

      // Enforce share-link limit per plan
      const plan = await resolveUserPlan(userId);
      const entitlements = getEntitlementsForPlan(plan);
      if (entitlements.maxActiveShareLinks !== null) {
        const activeCount = await ShareService.countActive(userId);
        if (activeCount >= entitlements.maxActiveShareLinks) {
          return status(402, {
            message: `Share link limit reached (${entitlements.maxActiveShareLinks}). Upgrade your plan for more.`,
            code: 'SHARE_LINK_LIMIT',
            used: activeCount,
            limit: entitlements.maxActiveShareLinks,
          });
        }
      }

      // Verify ownership of the resource being shared
      if (body.assetId) {
        const asset = await AssetService.getById(body.assetId, userId);
        if (!asset) {
          return status(403, { message: 'Access denied to asset' });
        }
      }
      if (body.collectionId) {
        const collection = await CollectionService.getById(
          body.collectionId,
          userId
        );
        if (!collection) {
          return status(403, { message: 'Access denied to collection' });
        }
      }

      return ShareService.create(userId, body);
    },
    { auth: true, body: ShareModel.create }
  )
  // List user's active share links
  .get('/', async ({ user }) => {
    return ShareService.list(user.id);
  }, { auth: true })
  // Revoke a share link
  .delete('/:id', async ({ params, user }) => {
    const revoked = await ShareService.revoke(
      params.id,
      user.id
    );
    if (!revoked) {
      return status(404, { message: 'Share link not found or already revoked' });
    }
    return revoked;
  }, { auth: true })
  // Validate a share token (public endpoint — no auth required)
  .get('/validate/:token', async ({ params }) => {
    const result = await ShareService.getSharedResource(params.token);
    if (!result) {
      return status(404, { message: 'Invalid or expired share link' });
    }
    return {
      type: result.type,
      resource: result.resource,
      canQuery: result.link.canQuery,
      expiresAt: result.link.expiresAt,
    };
  })
  // Ephemeral Q&A for shared links (public, rate-limited)
  .post(
    '/chat/:token',
    async ({ params, body }) => {
      const result = await ShareService.getSharedResource(params.token);
      if (!result) {
        return status(404, { message: 'Invalid or expired share link' });
      }

      if (!result.link.canQuery) {
        return status(403, { message: 'Q&A is not enabled for this share link' });
      }

      // Verify the link owner's plan allows public share Q&A
      const ownerId = result.link.userId;
      const ownerPlan = await resolveUserPlan(ownerId);
      const ownerEntitlements = getEntitlementsForPlan(ownerPlan);
      if (!ownerEntitlements.canUsePublicShareQA) {
        return status(402, {
          message: 'The owner\'s plan does not include public share Q&A. They need to upgrade.',
          code: 'PUBLIC_SHARE_QA_NOT_ALLOWED',
        });
      }

      const { allowed, remaining } = await ShareService.checkRateLimit(
        result.link.id
      );
      if (!allowed) {
        return status(429, { message: 'Rate limit exceeded. Try again later.' });
      }

      // Reserve words from the share link owner's daily budget
      const ownerAdmin = isAdminEmail(
        // We only need the email to check admin status; look it up
        (await ShareService.getOwnerEmail(ownerId)) ?? '',
      );
      let reserved = 0;
      if (!ownerAdmin) {
        reserved = await UsageService.reserveWords(ownerId, 500, ownerEntitlements.aiWordsDaily);
        if (reserved <= 0) {
          return status(429, { message: 'The share link owner\'s daily word limit is exhausted.' });
        }
      } else {
        reserved = 500;
      }

      // Extract question text from last user message for audit log
      const lastUserMsg = body.messages.findLast((m) => m.role === 'user');
      const questionText =
        lastUserMsg?.parts
          ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join(' ') ?? '';

      // Log before streaming so aborted requests still count
      await ShareService.logQuery(result.link.id, questionText);

      const transcriptLanguage = result.link.assetId
        ? await AssetService.getTranscriptLanguage(result.link.assetId)
        : null;

      return createChatStream({
        messages: body.messages,
        assetId: result.link.assetId ?? undefined,
        collectionId: result.link.collectionId ?? undefined,
        transcriptLanguage,
        wordLimit: reserved,
        headers: {
          'X-RateLimit-Remaining': String(remaining - 1),
        },
        onFinish: async ({ wordCount }) => {
          // Release unused reserved words back to the owner's budget
          if (!ownerAdmin) {
            const unused = reserved - wordCount;
            if (unused > 0) {
              try {
                await UsageService.releaseWords(ownerId, unused);
              } catch (err) {
                console.error(`[shares] Failed to release unused words for owner ${ownerId}:`, err);
              }
            }
          }
        },
      });
    },
    { body: ShareModel.chat }
  );
