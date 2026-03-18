# Plan: Client-Side Quota & Entitlement Pre-Checks

Implementation plan for the remaining client-side checks described in `docs/client-side-checks-prd.md`.

---

## Phase 1: Low-Hanging Fruit (pure entitlement + existing counters)

### 1.1 Daily Word Gate in ChatPanel

**Files:** `apps/web/src/components/chat/chat-panel.tsx`

- [x] In `handleSubmit`, before `sendMessage()`, check `wordsRemaining === 0`.
- [x] If exhausted, show toast: "Daily word limit reached. Resets at midnight UTC." with "View plans" action. Return early.
- [x] Same check for suggestion button clicks.

**Data needed:** `wordsRemaining` — already in `useMilkpodChat` return value, updated by `X-Words-Remaining` header.

### 1.2 Public Share Q&A Toggle Gate in ShareDialog

**Files:** `apps/web/src/components/share/share-dialog.tsx`

- [x] Import `getCachedPlan`, `getEntitlementsForPlan` from `@milkpod/ai/plans` + `~/lib/plan-cache`.
- [x] Wrap the `<Switch onCheckedChange>` handler: if toggling ON and `!getEntitlementsForPlan(plan).canUsePublicShareQA`, call `handleUpgradeError({ status: 402, value: { code: 'PUBLIC_SHARE_QA_NOT_ALLOWED' } })` and don't flip the switch.
- [x] Optionally dim the switch and show a lock icon when plan doesn't support it.

**Data needed:** `getCachedPlan()` — already populated by sidebar and chat headers.

### 1.3 Comments Quota Pre-Check in CommentsTab

**Files:** `apps/web/src/components/comments/comments-tab.tsx`

- [x] Import `checkQuotaLocal`, `incrementMonthlyUsage` from `~/lib/plan-cache`.
- [x] Before `api.api.comments.generate.post()`, run `checkQuotaLocal('comments')`.
- [x] If `!allowed`, call `handleUpgradeError(...)` and return.
- [x] On success, `incrementMonthlyUsage('comments', (data as Comment[]).length)`.

**Data needed:** `monthlyUsage.comments` — already populated by sidebar billing summary.

### 1.4 MomentsTab: Add Missing 402 Handling + Visual Segments Pre-Check

**Files:** `apps/web/src/components/moments/moments-tab.tsx`

- [x] **Bug fix:** Add `handleUpgradeError` to `handleGenerate`'s error path — currently swallows 402s.
- [x] Import `checkQuotaLocal`, `incrementMonthlyUsage` from `~/lib/plan-cache`.
- [x] Before `api.api.moments.generate.post()`, run `checkQuotaLocal('visual_segments')`.
- [x] If `!allowed`, call `handleUpgradeError(...)` and return.
- [x] On success, `incrementMonthlyUsage('visual_segments', (data as Moment[]).length)`.

**Data needed:** `monthlyUsage.visual_segments` — already populated by sidebar billing summary.

---

## Phase 2: Count-Based Entitlements (need lightweight counters)

### 2.1 Collection Limit Pre-Check in CreateCollectionDialog

**Files:** `apps/web/src/lib/plan-cache.ts`, `apps/web/src/components/library/create-collection-dialog.tsx`

**plan-cache.ts changes:**
- [x] Add `collectionCount: number | null` to the cache (null = not loaded).
- [x] Add `setCollectionCount(n: number)`, `incrementCollectionCount()`, `decrementCollectionCount()`.
- [x] Add `checkCollectionLimit(): { allowed: boolean; used: number; limit: number | null } | null`.
  - Returns `null` if plan or count not loaded.
  - If `maxCollections === null` (unlimited), return `{ allowed: true, ... }`.
  - Otherwise compare `collectionCount >= maxCollections`.

**Populating the count:**
- [x] Option A: Extract from the collections list query that the library page already makes (`.length`).
- [ ] Option B: Add a `collectionCount` field to the billing summary response.
- [x] Option A is simpler — the library component fetches `CollectionService.list()` on mount. After that fetch resolves, call `setCollectionCount(collections.length)`.

**CreateCollectionDialog changes:**
- [x] Before `api.api.collections.post()`, run `checkCollectionLimit()`.
- [x] If `!allowed`, call `handleUpgradeError({ status: 402, value: { code: 'COLLECTION_LIMIT' } })` and return.
- [x] On success, `incrementCollectionCount()`.

**Also:** wherever collections are deleted, call `decrementCollectionCount()`. ✅

### 2.2 Share Link Limit Pre-Check in ShareDialog

**Files:** `apps/web/src/lib/plan-cache.ts`, `apps/web/src/components/share/share-dialog.tsx`

**plan-cache.ts changes:**
- [x] Add `activeShareLinkCount: number | null` to the cache.
- [x] Add `setActiveShareLinkCount(n)`, `incrementActiveShareLinkCount()`, `decrementActiveShareLinkCount()`.
- [x] Add `checkShareLinkLimit(): { allowed: boolean; ... } | null`.

**Populating the count:**
- [x] Option A: After `fetchShareLinks()` resolves in ShareDialog, count non-revoked links globally and `setActiveShareLinkCount(totalActive)`.
  - `fetchShareLinks()` already returns ALL links; dialog filters client-side. Count set before filtering.
- [ ] Option B: Add `activeShareLinkCount` to the billing summary response — cleanest.
- [ ] Option C: On first ShareDialog open, make one unfiltered `fetchShareLinks()` call to count. Cache the total.

**Chosen:** Option A — `fetchShareLinks()` already fetches all links globally; the dialog filters by resource afterward. We call `setActiveShareLinkCount(links.length)` before the filter. No backend change needed.

**ShareDialog changes:**
- [x] Before `createShareLink()`, check `checkShareLinkLimit()`.
- [x] If `!allowed`, call `handleUpgradeError(...)` and return.
- [x] On create, `incrementActiveShareLinkCount()`. On revoke, `decrementActiveShareLinkCount()`.

---

## Phase 3 (optional): Billing Summary Counts Extension

If Phase 2 opts for server-side counts in billing summary:

**Files:** `packages/api/src/modules/billing/service.ts`

- [ ] Extend the summary SQL to include:
  ```sql
  (select count(*) from collections where user_id = $userId)::int as "collectionCount",
  (select count(*) from share_links where user_id = $userId and revoked_at is null and (expires_at is null or expires_at > now()))::int as "activeShareLinkCount"
  ```
- [ ] Add to `BillingSummary` type: `counts: { collections: number; activeShareLinks: number }`.
- [ ] Client: populate `setCollectionCount()` and `setActiveShareLinkCount()` from the summary in the sidebar useEffect.

---

## Testing Checklist

For each pre-check:
- [ ] Verify the client-side gate fires (toast shown, request NOT made).
- [ ] Verify the server fallback still works if cache is stale (clear plan-cache, submit — should still get 402 from server with proper toast).
- [ ] Verify admin bypass: admin users should never see quota gates (isAdmin = true skips all checks).
- [ ] Verify optimistic counter updates: after success, subsequent attempts are correctly gated without a page refresh.
- [ ] Verify counter drift: if the user opens two tabs, the counters may diverge. The server is the fallback. Confirm no broken UX (worst case: one extra round-trip that gets a 402).

---

## File Impact Summary

| File | Phase | Change |
|---|---|---|
| `apps/web/src/components/chat/chat-panel.tsx` | 1.1 | `wordsRemaining === 0` gate on submit |
| `apps/web/src/components/share/share-dialog.tsx` | 1.2, 2.2 | Q&A toggle gate + share link limit pre-check |
| `apps/web/src/components/comments/comments-tab.tsx` | 1.3 | `checkQuotaLocal('comments')` pre-check |
| `apps/web/src/components/moments/moments-tab.tsx` | 1.4 | Bug fix: add `handleUpgradeError` + `checkQuotaLocal('visual_segments')` |
| `apps/web/src/lib/plan-cache.ts` | 2.1, 2.2 | Collection count + share link count tracking |
| `apps/web/src/components/library/create-collection-dialog.tsx` | 2.1 | Collection limit pre-check |
| `packages/api/src/modules/billing/service.ts` | 3 | Optional: add counts to billing summary SQL |
| `apps/web/src/components/dashboard/dashboard-shell.tsx` | 3 | Populate count caches from summary |
