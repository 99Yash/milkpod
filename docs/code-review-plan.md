# Code Review Plan

Status: Active
Last Updated: 2026-03-10

Each task is a review pass over a logical group of files. The reviewer must:
1. Read every file in the group (using `git diff main -- <file>` to see only changes)
2. Apply the relevant checklist (backend, frontend, or both)
3. Fix issues directly in the code
4. Log findings and fixes in progress.txt
5. Run `pnpm check-types` to verify no regressions

---

## ~~Task 1 - Database Schema & Migrations~~ ✅

Files:
- packages/db/src/schema/billing.ts
- packages/db/src/schema/comments.ts
- packages/db/src/schema/media-assets.ts
- packages/db/src/schema/monthly-usage.ts
- packages/db/src/schema/qa.ts
- packages/db/src/schema/video-context-embeddings.ts
- packages/db/src/schema/video-context-segments.ts
- packages/db/src/schemas.ts

Checklist:
- Appropriate data types (no integers as strings, timestamps as varchar)
- Proper indexes on frequently queried columns, FKs, and composite queries
- Cascade deletes where appropriate; no orphan risk
- Enum values are exhaustive and future-proof
- No redundant columns; proper normalization
- Migrations are safe for zero-downtime deploys (no locks on large tables)
- Column defaults make sense

## ~~Task 2 - Backend: Ingest Module~~ ✅

Files:
- packages/api/src/modules/ingest/pipeline.ts
- packages/api/src/modules/ingest/youtube.ts
- packages/api/src/modules/ingest/video-context.ts
- packages/api/src/modules/ingest/upload-storage.ts
- packages/api/src/modules/ingest/elevenlabs.ts
- packages/api/src/modules/ingest/service.ts
- packages/api/src/modules/ingest/model.ts
- packages/api/src/modules/ingest/index.ts

Checklist:
- No N+1 queries; batch operations where possible
- Input validation on route handlers
- Auth checks on every endpoint
- Proper error handling; no sensitive info in error responses
- Timeouts on external API calls (ElevenLabs, YouTube, Gemini)
- Transactions for atomic multi-step operations
- Idempotency for retryable operations
- No hardcoded secrets/URLs; use env vars
- Rate limiting on ingest endpoints
- Proper HTTP status codes
- File upload validation (size, mime type)
- No connection leaks; cleanup on failure paths

## ~~Task 3 - Backend: Billing Module~~ ✅

Files:
- packages/api/src/modules/billing/service.ts
- packages/api/src/modules/billing/provider.ts
- packages/api/src/modules/billing/providers/polar.ts
- packages/api/src/modules/billing/resolve-provider.ts
- packages/api/src/modules/billing/index.ts

Checklist:
- Webhook signature verification is constant-time (timing-safe comparison)
- Webhook processing is idempotent (duplicate detection)
- Transactions for billing state changes
- No sensitive billing data in logs
- Proper error handling for provider API failures
- Auth checks on checkout/portal/cancel endpoints
- Webhook endpoint is unauthenticated but signature-verified
- Rate limiting on billing endpoints
- Proper HTTP status codes (402 for payment required, 503 for billing disabled)
- No hardcoded product IDs or secrets
- Provider abstraction is clean and extensible
- Check for proper fetch timeout/error handling on Polar API calls

## ~~Task 4 - Backend: Quota, Usage & Plans~~ ✅

Files:
- packages/api/src/modules/quota/plans.ts
- packages/api/src/modules/quota/service.ts
- packages/api/src/modules/quota/index.ts
- packages/api/src/modules/usage/service.ts
- packages/api/src/modules/usage/index.ts

Checklist:
- Advisory locks are properly acquired and released
- Counter increments are atomic; no race conditions
- Quota checks are consistent (check-then-act pattern safe?)
- Plan resolution queries are efficient (not N+1)
- No unbounded queries in stats endpoints
- Admin bypass is properly gated (not bypassable via header spoofing)
- Proper HTTP status codes for quota exceeded (402)
- Error payloads include useful info for client-side upgrade prompts

## ~~Task 5 - Backend: Comments Module~~ ✅

Files:
- packages/api/src/modules/comments/generate.ts
- packages/api/src/modules/comments/service.ts
- packages/api/src/modules/comments/model.ts
- packages/api/src/modules/comments/index.ts

Checklist:
- AI generation has proper timeout/error handling
- Structured output from LLM is validated before DB insertion
- No unbounded arrays (max comments cap enforced)
- Proper auth on generate/list/dismiss endpoints
- Regenerate path cleans up old comments properly
- Evidence references are valid FK references
- No N+1 when loading comments with evidence

## ~~Task 6 - Backend: Retention & Visual Parity~~ ✅

Files:
- packages/api/src/modules/retention/service.ts
- packages/api/src/modules/retention/index.ts
- packages/api/src/modules/visual-parity/service.ts
- packages/api/src/modules/visual-parity/index.ts

Checklist:
- Purge operations are idempotent
- S3 delete errors are handled gracefully (object already gone)
- Admin-only access is enforced
- Batch operations have reasonable limits
- Signed URL refresh logic is correct
- Stats queries use efficient aggregation (not loading all rows)
- Legal hold is respected in all purge paths

## ~~Task 7 - Backend: Chat, Shares & Collections Enforcement~~ ✅

Files:
- packages/api/src/modules/chat/index.ts
- packages/api/src/modules/chat/service.ts
- packages/api/src/modules/shares/index.ts
- packages/api/src/modules/shares/service.ts
- packages/api/src/modules/collections/index.ts
- packages/api/src/modules/collections/service.ts

Checklist:
- Entitlement checks are on every relevant endpoint
- Model gating cannot be bypassed by client
- Word budget reservation/release is atomic and leak-free
- Share link counting query is efficient
- Collection counting doesn't have race conditions
- Shared chat properly attributes usage to owner
- No N+1 queries in message saving or evidence extraction

## Task 8 - Backend: Search & Assets

Files:
- packages/api/src/modules/assets/search-service.ts
- packages/api/src/modules/assets/service.ts
- packages/api/src/modules/assets/index.ts

Checklist:
- Search queries use proper indexes (GIN for FTS, HNSW for vectors)
- Score normalization is correct and doesn't produce NaN/Infinity
- Language detection heuristic handles edge cases (empty strings, mixed scripts)
- Pagination on search results
- No SQL injection in search query construction
- Proper auth scoping (users can only search their own assets)

## Task 9 - AI Package

Files:
- packages/ai/src/retrieval.ts
- packages/ai/src/tools.ts
- packages/ai/src/system-prompt.ts
- packages/ai/src/stream.ts
- packages/ai/src/provider.ts
- packages/ai/src/types.ts

Checklist:
- No barrel import issues (tree-shaking safe for frontend)
- Embedding generation is batched/shared (no duplicate API calls)
- Tool definitions match AI SDK v6 API (`inputSchema`, not `parameters`)
- System prompt is clean and not overly long
- Type exports are correct and don't pull in server deps
- Retrieval query is parameterized (no SQL injection via user query)
- Cosine similarity threshold is reasonable

## Task 10 - Frontend: Billing UI

Files:
- apps/web/src/components/billing/pricing-grid.tsx
- apps/web/src/components/billing/billing-dashboard.tsx
- apps/web/src/lib/upgrade-prompt.ts
- apps/web/src/app/pricing/page.tsx
- apps/web/src/app/dashboard/billing/page.tsx

Checklist:
- No browser APIs used without SSR guards
- No `any` types; proper typing for API responses
- Loading, error, and empty states handled
- No redundant state (derived values should be computed)
- Proper cleanup in useEffects
- No hardcoded prices or plan details that should come from API
- Accessible: proper ARIA, semantic HTML, keyboard navigation
- Tailwind v4: use theme tokens, no unnecessary arbitrary values
- No console.log in production
- Error handling beyond console.log (toast, error boundary)
- Checkout flow handles failures gracefully

## Task 11 - Frontend: Comments UI

Files:
- apps/web/src/components/comments/comment-card.tsx
- apps/web/src/components/comments/comments-tab.tsx
- apps/web/src/app/asset/[id]/comments/page.tsx

Checklist:
- Stable, unique keys for comment list (not array indices)
- Proper loading/empty/error states
- Dismiss action is optimistic or properly handles loading state
- Timestamp click navigation works correctly
- Source badges are accessible (not color-only)
- No redundant re-renders

## Task 12 - Frontend: Chat UI

Files:
- apps/web/src/components/chat/chat-panel.tsx
- apps/web/src/components/chat/chat-shell.tsx
- apps/web/src/components/chat/message.tsx
- apps/web/src/components/chat/tool-result.tsx
- apps/web/src/components/chat/ai-avatar.tsx
- apps/web/src/components/chat/shimmer-text.tsx
- apps/web/src/components/chat/thinking-indicator.tsx
- apps/web/src/components/chat/tool-meta.ts
- apps/web/src/components/chat/model-picker.tsx
- apps/web/src/components/chat/word-limit-picker.tsx
- apps/web/src/components/chat/thread-sidebar.tsx

Checklist:
- No unnecessary re-renders in message list (memoization correct?)
- Streaming state handled without flicker
- Proper cleanup on unmount (abort controllers, etc.)
- Tool result rendering handles all tool types
- No `any` types in message/tool result processing
- Keys are stable and unique
- Accessibility: chat messages have proper roles, aria-live regions
- No dangerouslySetInnerHTML without sanitization
- Tailwind v4 best practices

## Task 13 - Frontend: Library, Dashboard & Asset

Files:
- apps/web/src/components/library/url-input-form.tsx
- apps/web/src/components/library/asset-list.tsx
- apps/web/src/components/library/collection-list.tsx
- apps/web/src/components/library/create-collection-dialog.tsx
- apps/web/src/components/library/add-to-collection-dialog.tsx
- apps/web/src/components/dashboard/dashboard-shell.tsx
- apps/web/src/components/dashboard/dashboard-tabs-client.tsx
- apps/web/src/components/dashboard/dashboard-content.tsx
- apps/web/src/components/asset/asset-shell.tsx
- apps/web/src/components/asset/asset-tab-bar.tsx
- apps/web/src/components/asset/transcript-viewer.tsx
- apps/web/src/components/layouts/dashboard.tsx

Checklist:
- Form validation (URL format, file size/type for uploads)
- Upload progress/error states
- No redundant state
- Proper Tailwind v4 usage
- Accessible: form labels, error messages, focus management
- List rendering with stable keys
- No console.log in production

## Task 14 - Frontend: Share Components

Files:
- apps/web/src/components/share/share-dialog.tsx
- apps/web/src/components/share/shared-chat-panel.tsx
- apps/web/src/components/share/shared-view.tsx

Checklist:
- Share link creation handles errors (402, network)
- Shared view doesn't leak private data
- Proper loading states
- No secrets in client-rendered share URLs

## Task 15 - Frontend: Data Layer & Hooks

Files:
- apps/web/src/lib/api-fetchers.ts
- apps/web/src/lib/data/queries.ts
- apps/web/src/hooks/use-milkpod-chat.ts
- apps/web/src/lib/local-first/chat-cache.ts
- apps/web/src/lib/query-keys.ts
- apps/web/src/lib/format.ts

Checklist:
- API fetchers have proper error handling and typing
- No `any` types in API response handling
- Query keys are consistent and properly scoped
- Cache invalidation strategy is correct
- Chat cache doesn't leak between users/assets
- useEffect cleanup for subscriptions/listeners
- No stale closure bugs in hooks
- Format utilities handle edge cases (null, undefined, empty)

## Task 16 - Config, Env & Server Entry

Files:
- packages/env/src/server.ts
- packages/api/src/index.ts
- packages/api/src/types.ts
- packages/api/src/utils.ts
- packages/api/src/middleware/logger.ts
- packages/api/src/middleware/rate-limit.ts
- apps/server/src/index.ts
- apps/server/tsdown.config.ts
- CLAUDE.md, AGENTS.md

Checklist:
- All new env vars are validated in schema
- Rate limiter config is appropriate
- Logger doesn't log sensitive data
- Module mounting order is correct
- Type exports are clean and reusable
- No circular dependencies
