# Milkpod

Milkpod is an AI video transcription and Q&A workspace. Drop in a link or
upload a file and get clean transcripts, highlights, and timestamped answers
you can share with your team.

## Product highlights

- Transcribe meetings, lectures, and interviews with timestamps and speaker
  labels.
- Ask questions and get answers with citations back to the source moments.
- Generate highlights, summaries, and action items for quick sharing.
- Search across your video library and export notes or clips.

## Tech stack

- Next.js 16 App Router (`apps/web`)
- Elysia + Eden (`apps/server`, `packages/api`)
- Better Auth (`packages/auth`)
- Drizzle ORM + PostgreSQL (`packages/db`)
- Tailwind CSS + shadcn/ui
- Turborepo + pnpm

## Local development

1. Install dependencies: `pnpm install`
2. Configure environment files:
   - `cp apps/server/.env.example apps/server/.env`
   - `cp apps/web/.env.example apps/web/.env`
3. Update values in the env files (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.)
4. Push the schema: `pnpm db:push`
5. Start the dev stack: `pnpm dev`

More details live in `SETUP.md`.

## Scripts

- `pnpm dev` - Start all apps in development mode
- `pnpm dev:web` - Start only the web application
- `pnpm dev:server` - Start only the API server
- `pnpm build` - Build all applications for production
- `pnpm check-types` - Type-check all packages
- `pnpm db:push` - Push schema changes to database
- `pnpm db:studio` - Open Drizzle Studio (database GUI)
- `pnpm db:generate` - Generate migrations
- `pnpm db:migrate` - Run migrations

## Project structure

```
milkpod/
├── apps/
│   ├── web/         # Next.js frontend application
│   └── server/      # Elysia backend
├── packages/
│   ├── api/         # Elysia routes + Eden types
│   ├── auth/        # Better Auth configuration
│   ├── db/          # Drizzle schema and database utilities
│   └── config/      # Shared TypeScript configs
```

## Deployment

### Vercel (Web App)

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the root directory to `apps/web`
4. Add environment variables
5. Deploy

### Railway/Render (API Server)

1. Connect your repository
2. Set the root directory to `apps/server`
3. Add the `DATABASE_URL` environment variable
4. Deploy
