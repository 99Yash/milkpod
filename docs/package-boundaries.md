# Package boundaries and tree-shaking

`@milkpod/ai` pulls in server-only dependencies — `@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, and `@milkpod/db`. The barrel export re-exports everything, so importing `@milkpod/ai` from `apps/web` drags Node.js modules (`pg` → `dns`) into the Next.js client bundle and breaks the build.

## Rules of thumb

- Frontend code imports via subpaths: `@milkpod/ai/models`, `@milkpod/ai/limits`, `@milkpod/ai/types`, `@milkpod/ai/schemas`. The barrel `@milkpod/ai` is server-only.
- Keep client-safe modules free of server imports. If a file is reachable from `apps/web` (e.g. `models.ts`, `limits.ts`, `types.ts`), it must not import `@ai-sdk/openai`, `@ai-sdk/google`, `drizzle-orm`, or any `@milkpod/db` module. Move server-only helpers (like provider constructors) into server-only files such as `stream.ts`.
- The same transitive-import check applies to every `@milkpod/*` package. Any `src/*.ts` is importable via `@milkpod/*/*` thanks to the `./*` wildcard in `package.json` exports, so a single server-only import buried deep can still poison the bundle.
