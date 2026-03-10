import { Elysia } from 'elysia';
import { authMacro } from '../../middleware/auth';
import { BillingService } from './service';

export const billing = new Elysia({ prefix: '/api/billing' })
  .use(authMacro)
  .get(
    '/summary',
    async ({ user }) => {
      return BillingService.getSummary(user.id);
    },
    { auth: true },
  );
