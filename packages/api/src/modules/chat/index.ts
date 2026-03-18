import { Elysia, status, t } from 'elysia';
import { createChatStream, generateThreadTitle, streamTranslation, HARD_WORD_CAP } from '@milkpod/ai';
import { authMacro } from '../../middleware/auth';
import { ChatModel } from './model';
import { ChatService } from './service';
import { ThreadService } from '../threads/service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';
import { isAdminEmail, UsageService } from '../usage/service';
import { resolveUserPlan, getEntitlementsForPlan } from '../quota/plans';

export const chat = new Elysia({ prefix: '/api/chat' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;
      const admin = isAdminEmail(user.email);

      // Phase 1: Run all independent lookups in parallel.
      // Each of these is a separate DB round-trip (~225ms cross-region).
      // Running them concurrently cuts total wait from ~1350ms to ~450ms.
      const [plan, thread, assetResult, collection] = await Promise.all([
        resolveUserPlan(userId),
        body.threadId
          ? ThreadService.getById(body.threadId, userId)
          : null,
        body.assetId
          ? Promise.all([
              AssetService.getById(body.assetId, userId),
              AssetService.getTranscriptLanguage(body.assetId),
            ])
          : null,
        body.collectionId
          ? CollectionService.getById(body.collectionId, userId)
          : null,
      ]);

      // Validate ownership of referenced resources
      if (body.threadId && !thread) {
        return status(403, { message: 'Access denied to thread' });
      }
      const existingThreadTitle = thread?.title;

      let assetTitle: string | undefined;
      let transcriptLanguage: string | null = null;
      if (body.assetId) {
        const [asset, language] = assetResult!;
        if (!asset) {
          return status(403, { message: 'Access denied to asset' });
        }
        assetTitle = asset.title ?? undefined;
        transcriptLanguage = language;
      }

      if (body.collectionId && !collection) {
        return status(403, { message: 'Access denied to collection' });
      }

      // Model gating: reject requests for models not in the user's plan
      const entitlements = getEntitlementsForPlan(plan);
      if (body.modelId && !admin && !entitlements.allowedModelIds.includes(body.modelId)) {
        return new Response(
          JSON.stringify({
            message: `Model ${body.modelId} is not available on the ${plan} plan. Upgrade for access.`,
            code: 'MODEL_NOT_ALLOWED',
            allowedModels: entitlements.allowedModelIds,
          }),
          { status: 402, headers: { 'content-type': 'application/json' } },
        );
      }

      // Phase 2: Reserve words (depends on plan from Phase 1).
      const requestedLimit = Math.min(body.wordLimit ?? HARD_WORD_CAP, HARD_WORD_CAP);
      let reserved: number;
      if (admin) {
        reserved = requestedLimit;
      } else {
        reserved = await UsageService.reserveWords(userId, requestedLimit, entitlements.aiWordsDaily);
        if (reserved <= 0) {
          return status(429, {
            message: 'Daily word limit reached. Resets at midnight UTC.',
            code: 'WORD_BUDGET_EXHAUSTED',
            limit: entitlements.aiWordsDaily,
          });
        }
      }

      // Auto-create thread if none provided
      let threadId = body.threadId;
      let isNewThread = false;
      if (!threadId) {
        const newThread = await ThreadService.create(userId, {
          assetId: body.assetId,
          collectionId: body.collectionId,
        });

        if (!newThread) {
          return status(500, { message: 'Failed to create or resolve thread' });
        }

        threadId = newThread.id;
        isNewThread = true;
      }

      if (!threadId) {
        return status(500, { message: 'Failed to create or resolve thread' });
      }

      // Save the incoming user message (last in the array)
      const lastMessage = body.messages.at(-1);

      if (lastMessage && lastMessage.role === 'user') {
        await ChatService.saveMessages(threadId, [lastMessage]);

        // Prepare title generation for new/untitled threads
        const needsTitle = isNewThread || !existingThreadTitle;
        if (needsTitle) {
          const textPart = lastMessage.parts?.find(
            (p) => p.type === 'text',
          );
          if (textPart && 'text' in textPart && typeof textPart.text === 'string') {
            void (async () => {
              try {
                const title = await generateThreadTitle(textPart.text);
                await ThreadService.update(threadId, userId, { title });
              } catch (err) {
                console.error(
                  `[chat] Title generation failed for thread ${threadId}:`,
                  err instanceof Error ? err.message : String(err)
                );
              }
            })();
          }
        }
      }

      const response = await createChatStream({
        messages: body.messages,
        threadId,
        assetId: body.assetId,
        assetTitle,
        collectionId: body.collectionId,
        modelId: body.modelId,
        wordLimit: reserved,
        transcriptLanguage,
        headers: { 'X-Thread-Id': threadId },
        onFinish: async ({ responseMessage, wordCount }) => {
          try {
            await ChatService.saveMessages(threadId, [responseMessage]);
          } catch (err) {
            console.error(`[chat] Failed to save assistant message for thread ${threadId}:`, err instanceof Error ? err.message : String(err));
          }
          // Release unused reserved words back to the budget
          if (!admin) {
            const unused = reserved - wordCount;
            if (unused > 0) {
              try {
                await UsageService.releaseWords(userId, unused);
              } catch (err) {
                console.error(`[chat] Failed to release unused words for user ${userId}:`, err instanceof Error ? err.message : String(err));
              }
            }
          }
        },
      });

      response.headers.set('X-Plan', plan);
      if (admin) {
        response.headers.set('X-Is-Admin', 'true');
      } else {
        const remaining = await UsageService.getRemainingWords(userId, entitlements.aiWordsDaily);
        response.headers.set('X-Words-Remaining', String(remaining));
      }

      return response;
    },
    { auth: true, body: ChatModel.send }
  )
  .post(
    '/translate',
    async ({ body, user }) => {
      // Verify message ownership before persisting anything
      if (body.messageId) {
        const owns = await ChatService.verifyMessageOwnership(body.messageId, user.id);
        if (!owns) return status(403, { message: 'Access denied to message' });
      }

      // Lightweight quota check — translations count against the daily word budget
      const admin = isAdminEmail(user.email);
      if (!admin) {
        const plan = await resolveUserPlan(user.id);
        const entitlements = getEntitlementsForPlan(plan);
        const wordEstimate = Math.ceil(body.text.split(/\s+/).length * 1.5);
        const reserved = await UsageService.reserveWords(user.id, wordEstimate, entitlements.aiWordsDaily);
        if (reserved <= 0) {
          return status(429, {
            message: 'Daily word limit reached. Resets at midnight UTC.',
            code: 'WORD_BUDGET_EXHAUSTED',
          });
        }
      }

      const { response, text } = streamTranslation(body.text, body.targetLanguage);

      // Fire-and-forget: persist translation when stream completes
      if (body.messageId && body.partIndex != null) {
        const { messageId, partIndex } = body;
        Promise.resolve(text)
          .then((translatedText: string) =>
            ChatService.saveTranslation(messageId, partIndex, translatedText),
          )
          .catch((err: unknown) =>
            console.error(
              '[chat] Failed to save translation:',
              err instanceof Error ? err.message : String(err),
            ),
          );
      }

      return response;
    },
    {
      auth: true,
      body: t.Object({
        text: t.String({ minLength: 1, maxLength: 10000 }),
        targetLanguage: t.Optional(t.String({ maxLength: 100 })),
        messageId: t.Optional(t.String()),
        partIndex: t.Optional(t.Integer({ minimum: 0 })),
      }),
    }
  )
  .get(
    '/:threadId',
    async ({ params, user }) => {
      const thread = await ThreadService.getById(
        params.threadId,
        user.id
      );
      if (!thread) return status(404, { message: 'Thread not found' });

      const [messages, translations] = await Promise.all([
        ChatService.getMessages(params.threadId),
        ChatService.getTranslations(params.threadId),
      ]);

      return { threadId: thread.id, messages, translations };
    },
    { auth: true, params: t.Object({ threadId: t.String() }) }
  );
