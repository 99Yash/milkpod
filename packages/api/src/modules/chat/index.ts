import { Elysia, t } from 'elysia';
import { createChatStream } from '@milkpod/ai';
import { authMiddleware } from '../../middleware/auth';
import { ChatModel } from './model';
import { ChatService } from './service';
import { ThreadService } from '../threads/service';
import { AssetService } from '../assets/service';
import { CollectionService } from '../collections/service';

export const chat = new Elysia({ prefix: '/api/chat' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }

      const userId = session.user.id;

      // Verify ownership of referenced resources
      if (body.threadId) {
        const thread = await ThreadService.getById(body.threadId, userId);
        if (!thread) {
          set.status = 403;
          return { message: 'Access denied to thread' };
        }
      }

      if (body.assetId) {
        const asset = await AssetService.getById(body.assetId, userId);
        if (!asset) {
          set.status = 403;
          return { message: 'Access denied to asset' };
        }
      }

      if (body.collectionId) {
        const collection = await CollectionService.getById(
          body.collectionId,
          userId
        );
        if (!collection) {
          set.status = 403;
          return { message: 'Access denied to collection' };
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
        onFinish: async ({ messages }) => {
          // Save all assistant messages from the finished conversation
          const assistantMessages = messages.filter(
            (m) => m.role === 'assistant'
          );
          await ChatService.saveMessages(threadId!, assistantMessages);
        },
      });
    },
    { body: ChatModel.send }
  )
  .get(
    '/:threadId',
    async ({ params, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }

      const thread = await ThreadService.getById(
        params.threadId,
        session.user.id
      );
      if (!thread) {
        set.status = 404;
        return { message: 'Thread not found' };
      }

      const messages = await ChatService.getMessages(params.threadId);

      return { threadId: thread.id, messages };
    },
    { params: t.Object({ threadId: t.String() }) }
  );
