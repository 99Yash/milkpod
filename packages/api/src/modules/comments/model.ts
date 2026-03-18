import { t } from 'elysia';

export namespace CommentModel {
  export const generate = t.Object({
    assetId: t.String({ maxLength: 100 }),
    regenerate: t.Optional(t.Boolean()),
  });
  export type Generate = typeof generate.static;

  export const listQuery = t.Object({
    assetId: t.String({ maxLength: 100 }),
  });
  export type ListQuery = typeof listQuery.static;

  export const feedback = t.Object({
    action: t.Union([t.Literal('dismiss')]),
  });
  export type Feedback = typeof feedback.static;
}
