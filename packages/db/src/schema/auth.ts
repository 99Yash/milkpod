import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import {
  createId,
  lifecycle_dates,
  type UserId,
  type SessionId,
  type AccountId,
  type VerificationId,
} from '../helpers';

export const user = pgTable('user', {
  id: text('id')
    .$type<UserId>()
    .primaryKey()
    .$defaultFn(() => createId<UserId>('usr')),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...lifecycle_dates,
});

export const session = pgTable('session', {
  id: text('id')
    .$type<SessionId>()
    .primaryKey()
    .$defaultFn(() => createId<SessionId>('ses')),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  ...lifecycle_dates,
});

export const account = pgTable('account', {
  id: text('id')
    .$type<AccountId>()
    .primaryKey()
    .$defaultFn(() => createId<AccountId>('acc')),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  ...lifecycle_dates,
});

export const verification = pgTable('verification', {
  id: text('id')
    .$type<VerificationId>()
    .primaryKey()
    .$defaultFn(() => createId<VerificationId>('ver')),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ...lifecycle_dates,
});
