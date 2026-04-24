# Replicache PR — Review Plan

Ordered task list for getting `feat/replicache` to merge quality. Work through them in order. Each task references checklist items in `review-prompt.md` (apply the relevant sections). Design intent lives in `sync-engine-plan.md` — verify the implementation matches.

**Scope**: 87 files, +39465 / -272. New subsystems: Replicache sync engine, asset members / collaboration, notifications, invite emails, 8 migrations.

---

## Phase 1: Migrations & schema foundation

### ~~Task 1: Verify row-version triggers fire on INSERT + UPDATE with distinctness guard~~ ✓

**Files**: `packages/db/src/migrations/0033_sync_row_version_triggers.sql`, `0037_notification_row_version_trigger.sql`, `packages/db/src/schema/{comments,moments,notifications,asset-members}.ts`
**What**:

- Read each trigger's SQL. Confirm `BEFORE INSERT OR UPDATE` (not just INSERT — edits won't sync otherwise)
- Confirm no-op updates don't bump row_version (`WHEN (OLD.* IS DISTINCT FROM NEW.*)` or column-level guard). Otherwise unrelated UPDATEs produce sync storms.
- Confirm every table the sync engine publishes has a trigger — cross-reference with what `pull.ts` emits

### ~~Task 2: Verify backfill migrations are idempotent~~ ✓

**Files**: `packages/db/src/migrations/0031_backfill_asset_member_owners.sql`, `0035_backfill_orphan_asset_member_owners.sql`
**What**:

- Confirm each backfill is safe to re-run (`ON CONFLICT DO NOTHING` or `WHERE NOT EXISTS`)
- Confirm 0035 covers the gap it claims in its comment (assets created between 0031 and the `AssetService.create` seeding change)

### ~~Task 3: Pre-deploy check for 0034 CHECK constraint~~ ✓

**Files**: `packages/db/src/migrations/0034_asset_invite_role_not_owner.sql`
**What**:

- The CHECK `role IN ('editor','viewer')` applies to `asset_invite` only — different table from 0035's `asset_member`, no ordering dependency
- Before prod deploy, run `SELECT count(*) FROM asset_invite WHERE role = 'owner';` — if > 0, resolve offending rows (delete or downgrade) first, else 0034 fails
- Record the query + expected zero result in `progress.txt`. No code change required.

### ~~Task 4: Verify indexes on new FK columns and hot query paths~~ ✓

**Files**: `packages/db/src/schema/{asset-members,notifications,replicache}.ts`
**What**:

- Every FK column queried in a WHERE must have an index
- `notifications`: `(userId, createdAt DESC)` + partial index on `(userId)` WHERE `readAt IS NULL` for unread counts
- `asset_member`: PK covers `(assetId, userId)`; verify `userId`-only lookup has an index (per schema line 37 it does — confirm it matches the service's queries)
- Replicache CVR / client-group tables: index on whatever pull queries by

### ~~Task 5: Verify `$type<>()` on new jsonb columns~~ ✓

**Files**: `packages/db/src/schema/{notifications,replicache,asset-members,comments,moments}.ts`
**What**:

- Any jsonb column must use `.$type<>()` for type-safe access
- Notification payloads especially — discriminated union over notification type

---

## Phase 2: Replicache sync engine (server)

### ~~Task 6: Audit pull.ts for CVR determinism and per-user visibility filter~~ ✓

**Files**: `packages/api/src/modules/replicache/pull.ts`, `cvr.ts`
**What**:

- Given `(cookie, clientGroupID, userID)`, pull output must be deterministic. Grep for `Date.now()`, `Math.random()`, `new Date()` inside the CVR/patch construction
- Every `ORDER BY` has a stable tiebreak (id as secondary sort)
- Initial pull (no cookie) is filtered to ONLY assets the user is a member of, and nested entities (moments, comments, notifications) are scoped to those assets. No global firehose.

### ~~Task 7: Wrap push mutations in a transaction; verify mutation-ID monotonicity~~ ✓

**Files**: `packages/api/src/modules/replicache/push.ts`
**What**:

- Entire push handler (apply mutations + bump `lastMutationID` per client + bump row_versions) runs inside a single `db.transaction()`
- Duplicate mutations (`lastMutationID >= incoming.id`) are silently skipped, NOT errored — Replicache retries produce duplicates by design
- On mutator failure, still advance `lastMutationID` with an error record so the client doesn't loop forever

### ~~Task 8: Audit authz.ts coverage for read (pull) and write (push)~~ ✓

**Files**: `packages/api/src/modules/replicache/authz.ts`, `server-mutators.ts`, `pull.ts`
**What**:

- `authz.ts` is only 12 lines — confirm it actually covers every entity exposed to sync (assets, moments, comments, notifications, asset-members) for BOTH read and write
- Every server mutator re-checks ownership/membership; never trusts the client's implied permission
- If authz.ts is too thin, expand — don't let pull/push reimplement checks divergently

### ~~Task 9: Emit `del` patches on visibility loss~~ ✓

**Files**: `packages/api/src/modules/replicache/pull.ts`, `cvr.ts`
**What**:

- When a user's membership is revoked, their next pull must emit `del` for the asset AND all child entities (moments, comments) — otherwise stale data sits in their IndexedDB forever
- The CVR diff mechanism must detect rows that left the user's visible set, not just rows physically deleted
- Cover soft-deletes (if any) the same way

### ~~Task 10: Verify realtime poke is sent AFTER transaction commit~~ ✓

**Files**: `packages/api/src/events/replicache-events.ts`, `push.ts`, any service calling into it
**What**:

- Grep for poke/publish calls; each must run after `await tx.commit()` or entirely outside the transaction block
- Pokes inside an uncommitted tx cause clients to pull before the write is visible → stale pull

### ~~Task 11: Scope realtime channels per user / per asset~~ ✓

**Files**: `packages/api/src/events/replicache-events.ts`, `apps/web/src/lib/replicache/*`
**What**:

- Channel names include the userID or assetID — no global broadcast channel
- Client subscribes only to channels for assets it can see

### ~~Task 12: Add Elysia auth guard and input validation to Replicache routes~~ ✓

**Files**: `packages/api/src/modules/replicache/index.ts`
**What**:

- Wrap pull/push in `.guard({ auth: true }, (app) => ...)` — not per-route `{ auth: true }`
- Add TypeBox validators: `t.Object({ cookie, clientGroupID: t.String(), mutations: t.Array(...) })` on push; cookie + clientGroupID on pull
- Reject oversized pushes (e.g. `mutations.length > 100`) with 413

### ~~Task 13: Register Replicache routes in the rate limiter~~ ✓

**Files**: `packages/api/src/middleware/rate-limit.ts`, `packages/api/src/modules/replicache/index.ts`
**What**:

- `/api/replicache/pull` and `/api/replicache/push` must appear in the `categorize()` function
- Dedicated bucket with a generous limit — these hit on every user action — separate from chat/ingest/crud
- User-keyed, not IP (per existing pattern)

### ~~Task 14: Prepare the hot-path pull query~~ ✓

**Files**: `packages/api/src/modules/replicache/pull.ts`, `cvr.ts`
**What**:

- The per-user row-version lookup runs on every pull. Use drizzle `.prepare('name')` with `sql.placeholder('userId')`
- Prepared statement is module-scope, not recreated per call

---

## Phase 3: Asset members & sharing

### ~~Task 15: Audit asset-members/service.ts for membership-scoped queries~~ ✓

**Files**: `packages/api/src/modules/asset-members/service.ts`, `index.ts`, `model.ts`
**What**:

- Every method takes a userID and scopes queries by membership, not just ownership
- No `SELECT * FROM asset WHERE id = ?` without a membership/ownership join
- Role capability enforcement at the service layer: viewer attempting write → 403. Grep each mutation method for role check.

### ~~Task 16: Audit invite flow safety~~ ✓

**Files**: `packages/api/src/modules/asset-members/service.ts`, `packages/auth/src/invite-email.ts`, `signup-hooks.ts`
**What**:

- Invite creation requires OWNER role on the target asset (not just membership)
- Invite token: `crypto.randomUUID()` / `randomBytes`, expires, single-use, `timingSafeEqual` on redemption
- Email template escapes interpolated inviter names / asset titles (no HTML injection)
- `signup-hooks.ts` handles redeemed / expired / revoked invites gracefully

### ~~Task 17: Add timeout and generic failure path to invite email send~~ ✓

**Files**: `packages/auth/src/invite-email.ts`
**What**:

- Wrap provider call in `AbortSignal.timeout(30_000)`
- Catch provider errors — log safely server-side (`err instanceof Error ? err.message : String(err)`), return a generic "Could not send invite" to the client. No raw provider error bubbled.

### ~~Task 18: Verify last-owner protection~~ ✓

**Files**: `packages/api/src/modules/asset-members/service.ts`
**What**:

- Member removal, role change, and asset delete must refuse to leave an asset with 0 owners (409 or similar)
- Check inside the transaction, not in application logic alone — two concurrent role changes could each see 1 owner and both proceed

### ~~Task 19: Audit share dialog + collaborators-section UI~~ ✓

**Files**: `apps/web/src/components/share/share-dialog.tsx`, `collaborators-section.tsx`
**What**:

- Role dropdowns disabled for non-owners
- Every input has a label; buttons have `type="button"` or `type="submit"`
- Every `.catch()` calls `toast.error()` with a readable message (no silent swallow)
- No `dangerouslySetInnerHTML` on user-supplied names/emails
- Keyboard nav: action buttons with `opacity-0 group-hover` also carry `group-focus-within:opacity-100`

---

## Phase 4: Notifications

### ~~Task 20: Insert notifications inside the triggering transaction~~ ✓

**Files**: `packages/api/src/modules/notifications/service.ts`, `packages/api/src/modules/comments/service.ts`, `moments/service.ts`, `asset-members/service.ts`
**What**:

- Comment create + notification insert must share a transaction
- Same for mentions, invite accepted, member added
- Otherwise a rollback of the trigger leaves a phantom notification

### ~~Task 21: Paginate the notifications list endpoint~~ ✓

**Files**: `packages/api/src/modules/notifications/service.ts`, `apps/web/src/components/notifications/notifications-page.tsx`
**What**:

- Service `list()`: cursor-based, default limit 50, max 100
- Response shape `{ items, nextCursor }` (not bare array)
- Frontend uses the cursor (load-more or infinite scroll)

### ~~Task 22: Exhaustive switch on notification type in the row renderer~~ ✓

**Files**: `apps/web/src/components/notifications/notification-row.tsx`
**What**:

- Render covers every discriminant of the notification type union
- `default: { const _: never = notification.type; throw new Error(\`unknown: \${notification.type}\`); }`
- Adding a new type forces a compile error here

### ~~Task 23: Derive unread count; mark-as-read via Replicache mutator~~ ✓

**Files**: `apps/web/src/components/notifications/notification-bell.tsx`, `packages/sync/src/mutators/notifications.ts`
**What**:

- Unread count derived from notifications list (no separate `useState`)
- Mark-as-read is a Replicache mutator (optimistic, server-authoritative) — not a REST fetch racing with pull

---

## Phase 5: Client-side Replicache integration

### Task 24: SSR-guard Replicache init; memoize provider; per-user DB name

**Files**: `apps/web/src/lib/replicache/client.ts`, `context.tsx`
**What**:

- Replicache init is inside `useEffect` or guarded by `typeof window !== 'undefined'` (IndexedDB doesn't exist on the server)
- Provider creates the instance once per user session; closes on unmount or user change (no leaked IndexedDB handles)
- The Replicache `name` option includes the userID so logout + login as a different user doesn't surface the previous user's cached data

### Task 25: Stabilize `useSubscribe` dependencies

**Files**: `apps/web/src/lib/replicache/hooks.ts`
**What**:

- Any inline object/array in a `useSubscribe` arg is a new reference every render → resubscribe storm
- Memoize, or pass primitives only

### Task 26: Enforce packages/sync client-safety

**Files**: `packages/sync/src/**/*`, `packages/sync/package.json`
**What**:

- `rg "@milkpod/db" packages/sync/src` → zero
- `rg "drizzle-orm" packages/sync/src` → zero
- `rg "@ai-sdk/" packages/sync/src` → zero
- Package deps in `package.json` are client-safe
- If a server-only import slipped in, split via subpath or move to `packages/api`

### Task 27: Verify sync mutator purity and client/server parity

**Files**: `packages/sync/src/mutators/{comments,moments,notifications}.ts`, `packages/api/src/modules/replicache/server-mutators.ts`
**What**:

- Client mutators have no side effects outside the Replicache tx (no fetch, no console.log)
- Every client mutator has a server counterpart with matching name + input shape
- Behavior parity: same invariants enforced both sides (server is authoritative; client is optimistic)

---

## Phase 6: Touched existing modules (regression surface)

### Task 28: Audit assets/service.ts membership migration

**Files**: `packages/api/src/modules/assets/service.ts`
**What**:

- 157 added lines — verify owner-scoped queries are REPLACED, not merely supplemented. Remaining `eq(mediaAssets.userId, userId)` calls should only exist where owner-only is intentional
- list/get return shapes unchanged (frontend contract)
- Members see shared assets; owners see theirs + shared-out

### Task 29: Verify no REST/Replicache double-writes for comments and moments

**Files**: `packages/api/src/modules/comments/{service,index}.ts`, `moments/{service,index}.ts`, `packages/sync/src/mutators/{comments,moments}.ts`
**What**:

- If Replicache mutators are now the write path, the REST POST endpoints are either removed, reserved for non-sync clients only, or share the same service method (no duplicated insert)
- Frontend: no component creates a comment/moment via fetch AND via Replicache

### Task 30: Library / moments UI handles Replicache first-render `undefined`

**Files**: `apps/web/src/components/library/{asset-card,asset-list,library-tab}.tsx`, `moments/{moment-card,moments-tab}.tsx`
**What**:

- `useSubscribe` returns `undefined` on first render before subscribe fires — components must render a loading state, not crash
- No stale `useQuery` / fetch calls overlapping Replicache-sourced data

---

## Phase 7: Diff-wide sweeps

### Task 31: Sweep `console.error` for full-error-object logging

**Files**: all files in the branch diff
**What**:

- `git diff main...HEAD --name-only | xargs rg 'console\.error'` — each `console.error('ctx', err)` → `console.error('ctx', err instanceof Error ? err.message : String(err))`
- Raw `err` can contain connection strings, SQL state, stack traces

### Task 32: Sweep `fetch()` and AI SDK calls for missing timeouts

**Files**: all files in the branch diff
**What**:

- Every `fetch(` has `signal: AbortSignal.timeout(ms)` — 30s APIs, 60s streaming, 300s long AI/transcription jobs
- Same for `generateText`, `streamText`, third-party SDK calls

### Task 33: Sweep `opacity-0 group-hover` for missing `group-focus-within`

**Files**: all `.tsx` in the branch diff
**What**:

- Each match must also carry `group-focus-within:opacity-100` — keyboard users must see hover-revealed controls

### Task 34: Sweep catch blocks for silent error swallowing

**Files**: all files in the branch diff
**What**:

- Every catch rethrows, logs safely, or gives the user feedback (`toast.error`, inline error, error boundary)
- No "handled by global handler" comments without a real global handler
- No empty `catch {}`

### Task 35: Sweep `switch` statements on union types for exhaustiveness

**Files**: all files in the branch diff
**What**:

- Every switch on a union/enum has `default: { const _: never = x; throw new Error(...); }`
- Adding a variant must force a TS error

### Task 36: Sweep `as` assertions

**Files**: all files in the branch diff
**What**:

- Each `as T` is justified (e.g. Eden treaty inference) or replaced with a type guard (`is T`)
- No `as any`, `as unknown as T`

### Task 37: Verify package-boundary rules in web imports

**Files**: `apps/web/src/**/*.ts{,x}`
**What**:

- `@milkpod/ai` — only subpaths (`models`, `limits`, `types`, `schemas`), never the barrel
- `@milkpod/sync` — barrel OK (client-safe after Task 26)
- `@milkpod/auth` — verify only client-safe exports are used
- `@milkpod/db` — zero imports in `apps/web`

---

## Phase 8: Build and manual verification

### Task 38: pnpm build and check-types clean

**Files**: (entire repo)
**What**:

- `pnpm build` (downstream packages rebuild — per CLAUDE.md)
- `pnpm check-types` — zero errors
- Fix the underlying issue; no `// @ts-expect-error` suppression

### Task 39: Manual verify cross-user collab flows in Chrome

**Files**: (manual, no code change expected unless a flow breaks)
**What**:

- Type check alone is not enough — drive the live app (per CLAUDE.md feedback)
- Two browser profiles. Flows:
  1. User A shares asset with B → B's library updates within seconds
  2. A creates a comment → B sees it within ~1s (realtime poke)
  3. A revokes B → B's library drops the asset on next pull
  4. B marks notification read → unread count decrements optimistically
  5. Log out as B, log in as A in same browser → no IndexedDB leakage
- Record observations in `progress.txt`; re-verify after any fix introduced while running this task

---

## Phase 9: Pre-merge hygiene

### Task 40: Decide the fate of sync-engine-plan.md

**Files**: `sync-engine-plan.md`
**What**:

- Root-level plan files rot. Either move to `docs/` (if still useful reference) or delete (if fully realized in code + README)
- Do not leave it at root unchanged

### Task 41: Review pnpm-lock.yaml diff

**Files**: `pnpm-lock.yaml`
**What**:

- Diff should only reflect genuinely new dependencies (replicache, email provider, anything for packages/sync)
- No drive-by version bumps of unrelated packages

### Task 42: Remove debug leftovers

**Files**: all files in the branch diff
**What**:

- `rg 'console\.log|debugger|XXX|FIXME' <changed paths>` — each hit resolved (removed or promoted to a real TODO with ticket reference)

### Task 43: Consider squashing commits for surgical rollback

**Files**: git history
**What**:

- Current 5 commits include "fix" and "more changes" — optional squash into ~3–4 meaningful commits (engine / asset-members / notifications / wiring) so rollback is targeted
- Note, not required — skip if the history is already meaningful enough
