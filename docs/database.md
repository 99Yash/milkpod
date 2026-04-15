# Database workflow

Schema changes go through Drizzle migrations, not `db:push`.

## Standard flow

1. Edit schema files under `packages/db/src/schema/`.
2. Run `pnpm db:generate` to produce a migration.
3. Run `pnpm db:migrate` to apply it.
4. Run `pnpm build` before `pnpm check-types`. Downstream packages (`@milkpod/api`) resolve types from `dist/` via the `types` field in `package.json` exports, so stale `.d.ts` files show up as phantom type errors.

## Migrations Drizzle can't infer

For ambiguous changes like renames (Drizzle can't tell a rename from a drop-plus-create), skip auto-generation: `drizzle-kit generate --custom --name <name>` scaffolds an empty migration file and you write the SQL by hand.

## Drizzle Studio

`pnpm db:studio` opens the Drizzle Studio GUI against the configured database.

## Why not `db:push`?

`db:push` bypasses migrations and diffs schema directly against the live database. It's destructive and leaves no history — the project treats it as legacy.
