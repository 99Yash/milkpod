# Template Setup Guide

This guide will help you customize this template for your own project.

## 1. Initial Setup

After creating your repository from this template:

```bash
# Clone your new repository
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name

# Install dependencies
pnpm install
```

## 2. Required Customizations

### Update Site Configuration

Edit `apps/web/src/lib/site.ts`:

```typescript
export const siteConfig = {
  name: 'Your App Name', // Your application name
  url: 'https://your-app.com', // Your production URL
  ogImage: 'https://your-app.com/og.png', // Your OG image
  description: 'Your app description', // SEO description
  links: {
    twitter: 'https://x.com/yourusername',
    github: 'https://github.com/yourusername/your-repo',
    website: 'https://your-website.com',
  },
};
```

### Update Package Names (Recommended)

Replace the `@milkpod` namespace with your own throughout the project:

```bash
# Find all occurrences
grep -r "@milkpod" .

# Files to update:
# - package.json (root)
# - apps/web/package.json
# - apps/server/package.json
# - packages/*/package.json
```

**Important locations:**

- Root `package.json`: Update the `name` field and workspace references
- All package.json files: Replace `@milkpod/` with `@your-app/`
- Scripts in root package.json (db commands)

### Set Up Environment Variables

1. **Server** (`apps/server/.env`):

   ```bash
   cp apps/server/.env.example apps/server/.env
   ```

   Update with your actual values:

   - `DATABASE_URL`: Your PostgreSQL connection string
   - `BETTER_AUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `BETTER_AUTH_URL`: Your backend URL
   - `CORS_ORIGIN`: Your frontend URL

2. **Web** (`apps/web/.env`):
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```
   Update with your actual values:
   - `NEXT_PUBLIC_SERVER_URL`: Your API URL
   - `BETTER_AUTH_SECRET`: Same as server
   - `BETTER_AUTH_URL`: Your frontend URL
   - `DATABASE_URL`: Same as server

## 3. Database Setup

```bash
# Make sure PostgreSQL is running
# Then push the schema
pnpm run db:push

# Optional: Open database studio to verify
pnpm run db:studio
```

## 4. Optional Customizations

### Update README.md

Replace the template README with information specific to your project:

- Project name and description
- Your specific features
- Your deployment instructions
- Your contributing guidelines

### Update License

Edit the `LICENSE` file to include your name/organization and the current year.

### Update GitHub Templates

Customize the issue and PR templates in `.github/` to match your workflow.

## 5. Verification

Run these commands to verify everything works:

```bash
# Type check
pnpm run check-types

# Build
pnpm run build

# Development
pnpm run dev
```

Visit:

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## 6. Clean Up Template Files

Once you're done setting up, you can optionally remove:

- This file (`TEMPLATE_SETUP.md`)
- Template-specific content from README

## 7. First Commit

```bash
git add .
git commit -m "chore: customize template for [your project name]"
git push
```

## Need Help?

- Check the main [README.md](./README.md)
- Review [CONTRIBUTING.md](./CONTRIBUTING.md)
- Open an issue in the original template repository

Happy building! 🚀
