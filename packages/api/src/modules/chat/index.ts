import { Elysia, status, t } from 'elysia';
import { createChatStream } from '@milkpod/ai';
import { authMacro } from '../../middleware/auth';
import { ChatModel } from './model';
import { ChatService } from './service';
import { ThreadService } from '../threads/service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';

export const chat = new Elysia({ prefix: '/api/chat' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      const userId = user.id;

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
      if (!threadId) {
        const thread = await ThreadService.create(userId, {
          assetId: body.assetId,
          collectionId: body.collectionId,
        });
        threadId = thread!.id;
      }

      // Save the incoming user message (last in the array)
      const lastMessage = body.messages.at(-1);
      if (lastMessage && lastMessage.role === 'user') {
        await ChatService.saveMessages(threadId, [lastMessage]);
      }

      return createChatStream({
        messages: body.messages,
        threadId,
        assetId: body.assetId,
        collectionId: body.collectionId,
        headers: { 'X-Thread-Id': threadId },
        onFinish: async ({ responseMessage }) => {
          try {
            await ChatService.saveMessages(threadId!, [responseMessage]);
          } catch (err) {
            console.error(`[chat] Failed to save assistant message for thread ${threadId}:`, err);
          }
        },
      });
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
