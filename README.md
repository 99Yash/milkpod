

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, production-ready TypeScript monorepo template that combines Next.js, Elysia, Eden, and more for building full-stack applications with end-to-end type safety.

> **📝 Using this as a template?** Check out the [Template Setup Guide](./TEMPLATE_SETUP.md) for step-by-step customization instructions.

## Features

- **TypeScript** - Full type safety across the entire stack
- **Next.js 16** - Latest React framework with App Router
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Beautiful, accessible UI components
- **Elysia** - Type-safe, high-performance backend framework
- **Eden** - End-to-end type safety between Elysia and the frontend
- **Drizzle ORM** - TypeScript-first database toolkit
- **PostgreSQL** - Robust, scalable database
- **Better-Auth** - Modern authentication solution
- **Turborepo** - High-performance monorepo build system
- **pnpm** - Fast, disk space efficient package manager

## Quick Start

### 1. Clone and Install

```bash
# Clone this template
git clone <your-repo-url>
cd <your-project-name>

# Install dependencies
pnpm install
```

### 2. Customize Your App

Update the site configuration in `apps/web/src/lib/site.ts`:

```typescript
export const siteConfig = {
  name: 'Your App Name',
  url: 'https://your-app.com',
  ogImage: 'https://your-app.com/og.png',
  description: 'Your app description',
  links: {
    twitter: 'https://x.com/yourusername',
    github: 'https://github.com/yourusername/your-repo',
    website: 'https://your-website.com',
  },
};
```

**Optional but recommended:** Update the package namespace from `@milkpod` to your own:

- Find and replace `@milkpod` with `@your-app-name` across:
  - `package.json` files in `apps/` and `packages/`
  - Import statements in your code
- Update the root `package.json` name field

### 3. Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have PostgreSQL installed and running
2. Create a `.env` file in `apps/server/` with your database URL:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
```

3. Push the schema to your database:

```bash
pnpm run db:push
```

### 4. Run Development Server

```bash
pnpm run dev
```

- **Web app**: [http://localhost:3000](http://localhost:3000)
- **API server**: [http://localhost:3001](http://localhost:3001)

## Project Structure

```
milkpod/
├── apps/
│   ├── web/         # Next.js frontend application
│   └── server/      # Elysia backend
├── packages/
│   ├── api/         # Elysia routes + Eden types
│   ├── auth/        # Better-Auth configuration
│   ├── db/          # Drizzle schema and database utilities
│   └── config/      # Shared TypeScript configs
```

## Available Scripts

### Development

- `pnpm run dev` - Start all apps in development mode
- `pnpm run dev:web` - Start only the web application
- `pnpm run dev:server` - Start only the API server

### Building

- `pnpm run build` - Build all applications for production
- `pnpm run check-types` - Type-check all packages

### Database

- `pnpm run db:push` - Push schema changes to database
- `pnpm run db:studio` - Open Drizzle Studio (database GUI)
- `pnpm run db:generate` - Generate migrations
- `pnpm run db:migrate` - Run migrations

## Tech Stack Details

### Frontend (`apps/web`)

- **Framework**: Next.js 16 with App Router
- **Styling**: TailwindCSS 4 + shadcn/ui components
- **State Management**: TanStack Query + Eden
- **Forms**: React Hook Form + Zod validation
- **Auth**: Better-Auth client

### Backend (`apps/server`)

- **Framework**: Elysia
- **API**: Elysia routes with Eden treaty client
- **Database**: Drizzle ORM + PostgreSQL
- **Auth**: Better-Auth server

### Shared Packages

- **`@milkpod/api`**: Elysia routes + App type
- **`@milkpod/auth`**: Authentication configuration
- **`@milkpod/db`**: Database schema and queries
- **`@milkpod/config`**: Shared TypeScript configurations

## Deployment

### Vercel (Web App)

1. Push your code to GitHub
2. Import project in Vercel
3. Set root directory to `apps/web`
4. Add environment variables
5. Deploy

### Railway/Render (API Server)

1. Connect your repository
2. Set root directory to `apps/server`
3. Add `DATABASE_URL` environment variable
4. Deploy

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Eden Documentation](https://elysiajs.com/eden/overview)
- [Drizzle Documentation](https://orm.drizzle.team/docs)
- [Better-Auth Documentation](https://better-auth.com/docs)
- [Elysia Documentation](https://elysiajs.com/introduction)
- [Turborepo Documentation](https://turbo.build/repo/docs)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
