import { t } from 'elysia';

export namespace MomentModel {
  export const generate = t.Object({
    assetId: t.String({ maxLength: 100 }),
    preset: t.Union([
      t.Literal('default'),
      t.Literal('hook'),
      t.Literal('insight'),
      t.Literal('quote'),
      t.Literal('actionable'),
      t.Literal('story'),
    ]),
    regenerate: t.Optional(t.Boolean()),
  });
  export type Generate = typeof generate.static;

  export const listQuery = t.Object({
    assetId: t.String({ maxLength: 100 }),
    preset: t.Optional(
      t.Union([
        t.Literal('default'),
        t.Literal('hook'),
        t.Literal('insight'),
        t.Literal('quote'),
        t.Literal('actionable'),
        t.Literal('story'),
      ]),
    ),
  });
  export type ListQuery = typeof listQuery.static;

  export const feedback = t.Object({
    action: t.Union([
      t.Literal('save'),
      t.Literal('dismiss'),
      t.Literal('upvote'),
      t.Literal('downvote'),
    ]),
  });
  export type Feedback = typeof feedback.static;
}
