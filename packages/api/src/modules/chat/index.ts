import { Elysia, t } from 'elysia';
import { createChatStream } from '@milkpod/ai';
import { authMiddleware } from '../../middleware/auth';
import { ChatModel } from './model';
import { ChatService } from './service';
import { ThreadService } from '../threads/service';

export const chat = new Elysia({ prefix: '/api/chat' })
  .use(authMiddleware)
  .post(
    '/',
    async ({ body, session, set }) => {
      if (!session) {
        set.status = 401;
        return { message: 'Authentication required' };
      }

      // Auto-create thread if none provided
      let threadId = body.threadId;
      if (!threadId) {
        const thread = await ThreadService.create(session.user.id, {
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
