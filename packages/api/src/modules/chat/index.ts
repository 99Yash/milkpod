import { Elysia, status, t } from 'elysia';
import { createChatStream, generateThreadTitle, HARD_WORD_CAP } from '@milkpod/ai';
import { authMacro } from '../../middleware/auth';
import { ChatModel } from './model';
import { ChatService } from './service';
import { ThreadService } from '../threads/service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';
import { UsageService } from '../usage/service';

export const chat = new Elysia({ prefix: '/api/chat' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

      // Check daily word quota and cap the response to remaining budget
      const remaining = await UsageService.getRemainingWords(userId);
      if (remaining <= 0) {
        return status(429, { message: 'Daily word limit reached. Resets at midnight UTC.' });
      }

      const requestedLimit = body.wordLimit ?? HARD_WORD_CAP;
      const cappedWordLimit = Math.min(requestedLimit, remaining);

      // Verify ownership of referenced resources
      if (body.threadId) {
        const thread = await ThreadService.getById(body.threadId, userId);
        if (!thread) {
          return status(403, { message: 'Access denied to thread' });
        }
      }

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

      // Auto-create thread if none provided
      let threadId = body.threadId;
      let isNewThread = false;
      if (!threadId) {
        const thread = await ThreadService.create(userId, {
          assetId: body.assetId,
          collectionId: body.collectionId,
        });
        threadId = thread!.id;
        isNewThread = true;
      }

      // Save the incoming user message (last in the array)
      const lastMessage = body.messages.at(-1);
      if (lastMessage && lastMessage.role === 'user') {
        await ChatService.saveMessages(threadId, [lastMessage]);

        // Auto-title untitled threads using AI (fire-and-forget)
        const needsTitle = isNewThread
          || !(await ThreadService.getById(threadId, userId))?.title;
        if (needsTitle) {
          const textPart = lastMessage.parts?.find(
            (p) => p.type === 'text',
          );
          if (textPart && 'text' in textPart && typeof textPart.text === 'string') {
            generateThreadTitle(textPart.text)
              .then((title) => ThreadService.update(threadId, userId, { title }))
              .catch((err) =>
                console.error(`[chat] Failed to generate title for thread ${threadId}:`, err),
              );
          }
        }
      }

      const response = await createChatStream({
        messages: body.messages,
        threadId,
        assetId: body.assetId,
        collectionId: body.collectionId,
        modelId: body.modelId,
        wordLimit: cappedWordLimit,
        headers: { 'X-Thread-Id': threadId },
        onFinish: async ({ responseMessage, wordCount }) => {
          try {
            await ChatService.saveMessages(threadId!, [responseMessage]);
          } catch (err) {
            console.error(`[chat] Failed to save assistant message for thread ${threadId}:`, err);
          }
          try {
            await UsageService.recordUsage(userId, wordCount);
          } catch (err) {
            console.error(`[chat] Failed to record usage for user ${userId}:`, err);
          }
        },
      });

      // Set pre-response remaining as a best-effort hint. The client
      // should call /api/usage/remaining after the stream ends for the
      // accurate post-response value (headers can't be mutated once
      // streaming starts).
      response.headers.set('X-Words-Remaining', String(Math.max(0, remaining - cappedWordLimit)));

      return response;
    },
    { auth: true, body: ChatModel.send }
  )
  .get(
    '/:threadId',
    async ({ params, user }) => {
      const thread = await ThreadService.getById(
        params.threadId,
        user.id
      );
      if (!thread) return status(404, { message: 'Thread not found' });

      const messages = await ChatService.getMessages(params.threadId);

      return { threadId: thread.id, messages };
    },
    { auth: true, params: t.Object({ threadId: t.String() }) }
  );
