import { Elysia, status, t } from 'elysia';
import { generateThreadTitle } from '@milkpod/ai';
import { authMacro } from '../../middleware/auth';
import { ThreadModel } from './model';
import { ThreadService } from './service';
import { ChatService } from '../chat/service';

export const threads = new Elysia({ prefix: '/api/threads' })
  .use(authMacro)
  .post(
    '/',
    async ({ body, user }) => {
      return ThreadService.create(user.id, body);
    },
    { auth: true, body: ThreadModel.create }
  )
  .get(
    '/',
    async ({ query, user }) => {
      if (query.assetId) {
        return ThreadService.listForAsset(query.assetId, user.id);
      }
      return ThreadService.list(user.id);
    },
    {
      auth: true,
      query: t.Object({ assetId: t.Optional(t.String()) }),
    }
  )
  .get('/:id', async ({ params, user }) => {
    const thread = await ThreadService.getWithMessages(
      params.id,
      user.id
    );
    if (!thread) return status(404, { message: 'Thread not found' });
    return thread;
  }, { auth: true })
  .patch(
    '/:id',
    async ({ params, body, user }) => {
      const updated = await ThreadService.update(
        params.id,
        user.id,
        body
      );
      if (!updated) return status(404, { message: 'Thread not found' });
      return updated;
    },
    { auth: true, body: ThreadModel.update }
  )
  .post(
    '/:id/generate-title',
    async ({ params, user }) => {
      const thread = await ThreadService.getById(params.id, user.id);
      if (!thread) return status(404, { message: 'Thread not found' });

      const messages = await ChatService.getMessages(params.id);
      const firstUserMessage = messages.find((m) => m.role === 'user');
      if (!firstUserMessage) {
        return status(400, { message: 'No user messages in thread' });
      }

      const textPart = firstUserMessage.parts.find(
        (p) => p.type === 'text' && 'text' in p,
      );
      if (!textPart || !('text' in textPart) || typeof textPart.text !== 'string') {
        return status(400, { message: 'No text content in first message' });
      }

      const title = await generateThreadTitle(textPart.text);
      const updated = await ThreadService.update(params.id, user.id, { title });
      return updated;
    },
    { auth: true },
  )
  .delete('/:id', async ({ params, user }) => {
    const deleted = await ThreadService.remove(params.id, user.id);
    if (!deleted) return status(404, { message: 'Thread not found' });
    return deleted;
  }, { auth: true });
