import { t } from 'elysia';

/**
 * Replicache push/pull body schemas. Types are derived from these (not the
 * other way around) so the runtime validator and the handler's expected
 * body shape cannot drift. Pulled into a module so they can be referenced
 * by both the route definitions and the handler signatures.
 */
export namespace ReplicacheModel {
  /**
   * Per-request mutation cap. Client batches larger than this are rejected
   * with 413. Replicache batches 1–a-few mutations per push in practice;
   * any batch over this size is almost certainly a client bug or abuse.
   */
  export const MAX_MUTATIONS = 100;

  /**
   * Defense-in-depth cap enforced by TypeBox (returns 422 before the handler
   * runs). Sized large enough that legitimate clients never hit it, small
   * enough to bound the memory cost of parsing a pathological payload.
   */
  export const HARD_MUTATION_LIMIT = 1000;

  /**
   * Cookie identifies the client's previous CVR snapshot. `order` is unique
   * only within a client group, so the cookie embeds `clientGroupID` to make
   * it self-describing — a stale cookie carrying a different group ID can be
   * detected and treated as a cold sync rather than silently miss the CVR
   * cache. The top-level `clientGroupID` on the request identifies the
   * current requester; in normal operation it matches the cookie's, but the
   * two roles are distinct.
   */
  export const pullCookie = t.Object({
    order: t.Integer({ minimum: 0 }),
    clientGroupID: t.String({ minLength: 1, maxLength: 200 }),
  });
  export type PullCookie = typeof pullCookie.static;

  export const pull = t.Object({
    pullVersion: t.Literal(1),
    clientGroupID: t.String({ minLength: 1, maxLength: 200 }),
    cookie: t.Nullable(pullCookie),
    profileID: t.Optional(t.String({ maxLength: 200 })),
    schemaVersion: t.Optional(t.String({ maxLength: 50 })),
  });
  export type Pull = typeof pull.static;

  export const pushMutation = t.Object({
    id: t.Integer({ minimum: 0 }),
    clientID: t.String({ minLength: 1, maxLength: 200 }),
    name: t.String({ minLength: 1, maxLength: 100 }),
    args: t.Unknown(),
    timestamp: t.Integer({ minimum: 0 }),
  });
  export type PushMutation = typeof pushMutation.static;

  export const push = t.Object({
    pushVersion: t.Literal(1),
    clientGroupID: t.String({ minLength: 1, maxLength: 200 }),
    mutations: t.Array(pushMutation, { maxItems: HARD_MUTATION_LIMIT }),
    profileID: t.Optional(t.String({ maxLength: 200 })),
    schemaVersion: t.Optional(t.String({ maxLength: 50 })),
  });
  export type Push = typeof push.static;
}
