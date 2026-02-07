# Milkpod setup guide

This guide covers local development and configuration for Milkpod.

## 1. Install dependencies

```bash
pnpm install
```

## 2. Configure site metadata

Update `apps/web/src/lib/site.ts` with your URL, OG image, and brand links.

## 3. Environment variables

### Server (`apps/server/.env`)

```bash
cp apps/server/.env.example apps/server/.env
```

Set the following values:

- `DATABASE_URL`: PostgreSQL connection string
- `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
- `BETTER_AUTH_URL`: Backend URL (ex: `http://localhost:3001`)
- `CORS_ORIGIN`: Frontend URL (ex: `http://localhost:3000`)

### Web (`apps/web/.env`)

```bash
cp apps/web/.env.example apps/web/.env
```

Set the following values:

- `NEXT_PUBLIC_SERVER_URL`: API URL (ex: `http://localhost:3001`)
- `BETTER_AUTH_SECRET`: Same secret as the server
- `BETTER_AUTH_URL`: Frontend URL (ex: `http://localhost:3000`)
- `DATABASE_URL`: Same database URL as the server

## 4. Database setup

```bash
pnpm db:push
```

Optional: launch Drizzle Studio with `pnpm db:studio`.

## 5. Run locally

```bash
pnpm dev
```

- Web app: http://localhost:3000
- API server: http://localhost:3001

## 6. Optional customization

- Replace the OG image and favicon in `apps/web/public/`.
- Update copy and branding in `apps/web/src/app/page.tsx`.
- Adjust issue and PR templates under `.github/` if needed.
