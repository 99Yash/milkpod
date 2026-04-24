---
branch: feat/replicache
base: main
scope: 87 files, +39465 / -272
themes: Replicache sync engine, asset members/collab, notifications, invite emails, 8 migrations
---

# Replicache PR — Pristine-Quality Review Checklist

A concrete, file-scoped punch list for getting this branch to merge quality. Organized by subsystem in the diff, with the generic rules from `review-prompt.md` applied to what's actually changed.

Work top-down. Each section lists the files to open, the things that usually go wrong in this subsystem, and the specific project rules to check.

---

## 1. Replicache sync engine (server)

**Files**
- `packages/api/src/modules/replicache/pull.ts` (312 lines)
- `packages/api/src/modules/replicache/push.ts` (207 lines)
- `packages/api/src/modules/replicache/cvr.ts` (84 lines)
- `packages/api/src/modules/replicache/authz.ts` (12 lines)
- `packages/api/src/modules/replicache/server-mutators.ts` (214 lines)
- `packages/api/src/modules/replicache/index.ts` (113 lines)
- `packages/api/src/events/replicache-events.ts` (83 lines)
- `packages/db/src/schema/replicache.ts` (25 lines)
- `sync-engine-plan.md` (design doc — verify implementation matches)

**Sync-engine-specific risks (these are the ones that bite in production)**
- [ ] **CVR correctness.** Pull must be deterministic given `(cookie, clientGroupID)`. Any non-determinism (ordering, clock reads, random IDs) corrupts downstream clients. Verify `ORDER BY` is stable (tiebreak on id), no `Date.now()` in the CVR payload, no `Math.random()`.
- [ ] **Pull/push transactional boundary.** Every push must commit mutations + mutation ID bump + row-version bumps atomically, or a retry will double-apply. Wrap in `db.transaction()`. Same for pull building the CVR + patch.
- [ ] **Mutation ID monotonicity.** `lastMutationID` per clientID must only increase. Duplicates must be ignored (not errored) because Replicache retries. Check for `onConflictDoNothing` or `WHERE id > $last`.
- [ ] **Authz on every mutator.** `server-mutators.ts` runs server-authoritative logic — each mutator must re-check ownership/membership, not trust the client. Grep for every mutator and confirm it calls `authz.ts` helpers.
- [ ] **Authz scope.** `authz.ts` is only 12 lines — confirm it actually covers read (pull visibility filter) AND write (push mutation allowance) for all entity types: assets, moments, comments, notifications, asset-members.
- [ ] **Soft-deletes in pull.** If any row-version table supports delete, pull must emit a `del` patch when visibility is revoked (e.g. member removed from asset). Otherwise client keeps stale data forever. Test: revoke membership, confirm client drops asset.
- [ ] **Pull patch size bound.** First pull (no cookie) can dump the entire world. Verify there's a per-client filter (asset-member scoped) so a user doesn't receive other users' assets.
- [ ] **Server-sent events / realtime fan-out.** `replicache-events.ts` — verify `poke` messages are sent AFTER the transaction commits, not inside it (otherwise clients pull a not-yet-visible state). Look for `await tx.commit()` ordering.
- [ ] **Ably/realtime channel authorization.** Confirm clients subscribe to channels scoped to them (e.g. per-user or per-asset), not a global firehose.

**Generic rules applied here**
- [ ] No `console.error('ctx', err)` anywhere in this module — errors in pull/push will contain SQL state. Use `err instanceof Error ? err.message : String(err)`.
- [ ] Rate limiter's `categorize()` covers `/api/replicache/pull` and `/api/replicache/push`. These will get *hammered*; the default bucket is likely wrong. Separate bucket with a generous limit.
- [ ] Timeouts on any external call inside a mutator (notifications, emails).
- [ ] Input validation: `t.Object` schemas on the pull/push request bodies. Verify `cookie`, `clientGroupID`, `mutations[]` shape. Reject oversized pushes.
- [ ] Elysia `.guard({ auth: true })` on the whole Replicache route group, not per-route.
- [ ] Prepared statements for the hot-path CVR query — this runs on every pull.

---

## 2. Row-version triggers & migrations

**Files**
- `packages/db/src/migrations/0030_boring_mach_iv.sql` (new tables)
- `packages/db/src/migrations/0031_backfill_asset_member_owners.sql`
- `packages/db/src/migrations/0032_violet_wendell_vaughn.sql`
- `packages/db/src/migrations/0033_sync_row_version_triggers.sql` ← **read carefully**
- `packages/db/src/migrations/0034_asset_invite_role_not_owner.sql` (check constraint)
- `packages/db/src/migrations/0035_backfill_orphan_asset_member_owners.sql`
- `packages/db/src/migrations/0036_nasty_tony_stark.sql`
- `packages/db/src/migrations/0037_notification_row_version_trigger.sql`

**Trigger-specific checks**
- [ ] Every row-version trigger is `BEFORE INSERT OR UPDATE` and sets `NEW.row_version = (SELECT nextval(...))` or bumps a per-table counter. Verify it fires on UPDATE not just INSERT, else edits don't sync.
- [ ] Trigger does NOT bump row_version on no-op updates (prevents sync storms). Use `WHEN (OLD.* IS DISTINCT FROM NEW.*)` or column-level guards.
- [ ] Backfill migrations (`0031`, `0035`) are idempotent — safe to re-run. Use `INSERT ... ON CONFLICT DO NOTHING` or `WHERE NOT EXISTS`.
- [ ] Zero-downtime safety: any `ALTER TABLE ... ALTER COLUMN` on a large table? Any NOT NULL added without a default? Any new FK without `NOT VALID` + later `VALIDATE CONSTRAINT`?
- [ ] Check constraint in `0034_asset_invite_role_not_owner.sql` — confirm this doesn't break existing rows (if run against prod with orphans). 0035's backfill needs to run FIRST. Verify migration ordering and that `_journal.json` reflects it.
- [ ] Indexes on new FKs in `asset-members`, `notifications` — every FK column queried in a WHERE needs an index.
- [ ] Schema `$type<>()` used on any new `jsonb` columns (check `packages/db/src/schema/replicache.ts`, `notifications.ts`, `asset-members.ts`).

**Meta files**
- [ ] 8 new snapshot files (`0030_snapshot.json` through `0037_snapshot.json`) are auto-generated — spot-check the last one matches the cumulative schema. Don't hand-edit.
- [ ] `_journal.json` entries are in order, no duplicate IDs.

---

## 3. Asset members / sharing

**Files**
- `packages/api/src/modules/asset-members/index.ts` (79 lines — routes)
- `packages/api/src/modules/asset-members/model.ts` (37 lines)
- `packages/api/src/modules/asset-members/service.ts` (316 lines — the meaty one)
- `packages/db/src/schema/asset-members.ts` (65 lines)
- `apps/web/src/components/share/share-dialog.tsx` (+361)
- `apps/web/src/components/share/collaborators-section.tsx` (249 new)

**Authz/ownership — this is where privacy bugs live**
- [ ] Every service method scopes by `userId` or checks membership. No `SELECT * FROM assets WHERE id = ?` without an ownership/membership join.
- [ ] Role checks: owner vs editor vs viewer — are the capability boundaries enforced in the service, not only in the UI? A viewer should get 403 if they POST a comment/moment via a hand-crafted request.
- [ ] Invite flow: what prevents an attacker from inviting themselves to someone else's asset? Confirm the invite endpoint requires owner role on the target asset.
- [ ] Invite token: cryptographic randomness (`crypto.randomUUID()` or `randomBytes`), single-use, expires, and compared with `timingSafeEqual` on redemption.
- [ ] Removing a member: does it revoke their Replicache subscription and trigger a pull delta? See §1 "soft-deletes in pull."
- [ ] Last-owner protection: can the last owner demote/remove themselves, orphaning the asset? Should 409.

**Frontend**
- [ ] `share-dialog.tsx` and `collaborators-section.tsx` — confirm role dropdowns are disabled for non-owners (UI-side, but cheap to add).
- [ ] Keyboard a11y on the invite form (every input has a label, submit button has `type="submit"`).
- [ ] Error feedback: every `.catch()` calls `toast.error()` with a human-readable message. No silent swallow.
- [ ] No `dangerouslySetInnerHTML` on invitee-supplied names/emails.

---

## 4. Notifications

**Files**
- `packages/api/src/modules/notifications/service.ts` (239 new)
- `packages/db/src/schema/notifications.ts` (62 lines)
- `apps/web/src/components/notifications/notification-bell.tsx` (134)
- `apps/web/src/components/notifications/notification-row.tsx` (80)
- `apps/web/src/components/notifications/notifications-page.tsx` (84)
- `apps/web/src/app/notifications/{layout,page}.tsx`
- `apps/web/src/lib/server/notifications.ts` (49)

**Checks**
- [ ] Notification insertion happens in the same transaction as the triggering event (comment created, mention, invite accepted). Otherwise notifications go missing on rollback.
- [ ] Pagination on the notifications list endpoint — users accumulate thousands of these. Verify `.limit(100)` with cursor.
- [ ] `notifications.ts` schema has an index on `(userId, createdAt DESC)` and `(userId, readAt) WHERE readAt IS NULL` (partial index for unread count).
- [ ] Discriminated union on notification `type` — exhaustive switch in the render with `default: never` check in `notification-row.tsx`.
- [ ] `notification-bell.tsx` — unread count source: is it derived from the notifications list (via Replicache) or a separate query? If derived, no redundant state.
- [ ] Mark-as-read: optimistic update via Replicache mutator, not a separate REST call that races with pull.

---

## 5. Auth / invite email

**Files**
- `packages/auth/src/invite-email.ts` (45)
- `packages/auth/src/invite-email-template.ts` (70)
- `packages/auth/src/signup-hooks.ts` (97)
- `packages/auth/src/index.ts` (+7)

**Checks**
- [ ] Invite email sending has a timeout (`AbortSignal.timeout(30_000)`).
- [ ] Email provider errors are caught and NOT bubbled to the client — return a generic "Failed to send invite" and log server-side.
- [ ] `signup-hooks.ts` — if this is a Better Auth lifecycle hook, does it handle the case where the invite has already been redeemed / expired / revoked? Race condition between invite issuance and signup.
- [ ] Email template does not inject user-supplied HTML. If `invite-email-template.ts` interpolates an inviter's name or asset name, it must be escaped.
- [ ] No PII in logs when invite sending fails.

---

## 6. Client-side Replicache integration

**Files**
- `apps/web/src/lib/replicache/client.ts` (66)
- `apps/web/src/lib/replicache/context.tsx` (71)
- `apps/web/src/lib/replicache/hooks.ts` (135)
- `packages/sync/src/index.ts`
- `packages/sync/src/keys.ts` (44)
- `packages/sync/src/types.ts` (89)
- `packages/sync/src/mutators/{comments,moments,notifications,index}.ts`

**Checks**
- [ ] `client.ts` initialization must be guarded against SSR (`typeof window !== 'undefined'` or deferred to `useEffect`). Replicache touches IndexedDB.
- [ ] `context.tsx` — provider creates the Replicache instance once, memoized. Confirm it's not recreated on every render (would reset local state).
- [ ] Replicache instance is closed on unmount / user change. Leaked instances hold IndexedDB connections.
- [ ] Per-user DB name: the Replicache `name` option includes the userID, so logging out + in as a different user doesn't surface the previous user's cached data.
- [ ] `hooks.ts` — `useSubscribe` queries have stable dependencies. Inline object/array deps cause re-subscription storms.
- [ ] Package-boundary rule: `packages/sync/` is imported by both web and server. Its types and mutator definitions must be client-safe (no `@milkpod/db`, no `drizzle-orm`, no `@ai-sdk/*`). Verify.
  - Grep: `rg "from '@milkpod/db'" packages/sync/src` should return zero.
- [ ] `packages/sync/src/mutators/` — client mutators should be pure (no fetch, no side effects outside the Replicache tx). Server has its own `server-mutators.ts` in `packages/api`. Confirm the split.
- [ ] Query keys in `apps/web/src/lib/query-keys.ts` and `packages/sync/src/keys.ts` — no collisions, no duplicated key generators.

---

## 7. Touched existing modules (regression surface)

These files were modified as part of wiring the sync engine in — small diffs but high regression risk.

**Files**
- `packages/api/src/modules/assets/service.ts` (+157 / existing file)
- `packages/api/src/modules/assets/model.ts` (+3)
- `packages/api/src/modules/comments/service.ts` (+11)
- `packages/api/src/modules/moments/service.ts` (+14)
- `packages/api/src/modules/podcasts/episode-pipeline.ts` (+9)
- `packages/db/src/schema/{comments,moments}.ts` (+4 each — likely `rowVersion` column)
- `apps/web/src/components/library/{asset-card,asset-list,library-tab}.tsx`
- `apps/web/src/components/moments/{moment-card,moments-tab}.tsx`

**Checks**
- [ ] `assets/service.ts` grew by 157 lines — this is probably where membership-scoped queries were added. Confirm the old owner-scoped queries are fully replaced, not just supplemented (otherwise owner-only paths still exist and members get 404s).
- [ ] Comment/moment services write through Replicache now? If so, the old REST write path must be removed or kept in parity. Having both = double-writes.
- [ ] Library + moments components — switched from REST/query-client to Replicache `useSubscribe`? Confirm loading states still render (Replicache returns undefined on first render).
- [ ] No stale `useQuery` calls left behind fetching the same data Replicache now provides.

---

## 8. Project-wide nudges (apply everywhere in the diff)

From `review-prompt.md` "Common Patterns" — scan the entire diff for these:

- [ ] `grep -rn "console.error" <changed files>` — every `console.error('msg', err)` → `err instanceof Error ? err.message : String(err)`.
- [ ] `grep -rn "fetch(" apps/web/src packages/api/src` on changed files — every `fetch` has `signal: AbortSignal.timeout(...)`.
- [ ] Rate limiter `categorize()` covers: `/api/replicache`, `/api/asset-members`, `/api/notifications`.
- [ ] `grep -rn "opacity-0 group-hover" <changed tsx>` — each one also has `group-focus-within:opacity-100`.
- [ ] `grep -rn "} catch" <changed tsx>` — no empty catches, no "handled elsewhere" comments without a real handler.
- [ ] Every `switch` on a union type in new code has `default: { const _: never = x; throw ... }`.
- [ ] `grep -rn " as " <changed ts tsx>` — each `as T` is justified or replaceable by a type guard.
- [ ] Verify client-safe package boundaries: `@milkpod/sync`, `@milkpod/auth`, `@milkpod/ai/*` subpaths only in `apps/web`. No barrel imports that drag in server deps.

---

## 9. Build & verify

- [ ] `pnpm build` (schema packages rebuild for downstream types — per CLAUDE.md).
- [ ] `pnpm check-types` clean across all packages.
- [ ] `pnpm dev` starts cleanly; open the app, drive:
  - [ ] Share an asset with another account; confirm it appears in their library.
  - [ ] Create a comment as user A; confirm it streams to user B within ~1s (Replicache poke path).
  - [ ] Revoke user B; confirm their library drops the asset on next pull.
  - [ ] Notification bell updates optimistically on mark-as-read.
  - [ ] Log out + log in as a different user — no cross-user data leakage in IndexedDB.
- [ ] Check console (browser + server) for errors during the above flows.
- [ ] Test on a narrow connection (DevTools → Slow 3G) — Replicache is supposed to make this feel instant; if it doesn't, something is over-fetching.

---

## 10. Pre-merge hygiene

- [ ] `sync-engine-plan.md` is kept OR moved under `docs/` — root-level plan files tend to rot. Decide now.
- [ ] `pnpm-lock.yaml` diff is only the two new packages (`@milkpod/sync`, anything auth-email). No drive-by version bumps.
- [ ] No leftover `console.log`, `debugger`, `TODO`, `FIXME` in the 87 files. `grep -rn "console\.log\|debugger\|TODO\|FIXME" <changed paths>`.
- [ ] Commit history: 5 commits including "fix" and "more changes" — consider squashing to 3-4 meaningful commits (replicache engine / asset-members / notifications / wiring) before merge. Not required, but makes rollback surgical.
