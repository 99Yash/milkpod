# PRD: Client-Side Quota & Entitlement Pre-Checks

## Problem

Multiple user actions (ingest video, send chat, create collection, create share link, generate comments) make an API call that the server immediately rejects with a 402 if the user is over quota or outside their plan entitlements. The user waits for the round-trip only to be told "no". These checks are deterministic given the user's plan and current usage — data the client already has (or can cheaply cache from a single billing summary call).

## Goal

Pre-check plan entitlements and quota limits **client-side** before making the API call. The server remains the authoritative fallback, but the client can block early for a snappier UX and fewer wasted requests.

## Principles

1. **Server is always the authority.** Client-side checks are optimistic fast-paths. If the cache is stale or missing, the request proceeds to the server.
2. **Plan config is static.** The mapping from `PlanId` -> entitlements/quotas lives in `@milkpod/ai/plans` (no DB). Both client and server import the same source of truth.
3. **Usage counters are best-effort.** Populated from the billing summary on dashboard mount and updated optimistically after successful operations. Not guaranteed to be perfectly in sync — the server's advisory-lock-protected counters are canonical.
4. **Admin bypass.** `isAdmin` from the billing summary disables all client-side gating. Admin users should never see quota-blocked UI.

## Data Flow

```
Dashboard mount
  └─ GET /api/billing/summary
       ├─ plan (free | pro | team)     → setCachedPlan()
       ├─ isAdmin                       → skip all gating if true
       ├─ usage.dailyWords              → sidebar widget
       ├─ usage.monthlyVideoMinutes     ─┐
       ├─ usage.monthlyVisualSegments   ─┼→ setMonthlyUsage()
       └─ usage.monthlyComments         ─┘

Chat response headers
  ├─ X-Plan            → setCachedPlan()
  ├─ X-Words-Remaining → DailyQuota display
  └─ X-Is-Admin        → hide quota UI
```

## What's Already Done

| Check | Component | Approach |
|---|---|---|
| Model access (`allowedModelIds`) | ChatPanel, ModelPicker | Derived locally from `getCachedPlan()` via `getEntitlementsForPlan()`. Updated by `X-Plan` header after each chat. |
| Daily word budget display | DailyQuota | Plan-aware budget from cache; remaining from `X-Words-Remaining` header. |
| Video minutes quota | UrlInputForm | `checkQuotaLocal('video_minutes')` before ingest. Counter incremented optimistically on success. |
| Billing summary dedup | SidebarPlanUsage | Single `fetchBillingSummary()` call (30s TTL, inflight dedup). Eliminated redundant `GET /api/usage/remaining`. |

## What Remains

### 1. Collection Limit (CreateCollectionDialog)

**Server check:** `POST /api/collections` — resolves plan, counts user's collections, returns 402 `COLLECTION_LIMIT` if `count >= maxCollections`.

**Client-side approach:**
- Track collection count in plan-cache (initialize from billing summary or a lightweight count query).
- Before `api.api.collections.post()`, check `count >= getEntitlementsForPlan(plan).maxCollections`.
- Increment on success, decrement on delete.
- `maxCollections = null` (Pro/Team) means unlimited — skip check.

**Complexity:** Low. The count is simple; creation and deletion happen infrequently.

### 2. Share Link Limit (ShareDialog)

**Server check:** `POST /api/shares` — resolves plan, counts active (non-revoked) share links, returns 402 `SHARE_LINK_LIMIT` if `activeCount >= maxActiveShareLinks`.

**Client-side approach:**
- The dialog already fetches `fetchShareLinks()` for the current resource. The total active count across all resources is what matters.
- Cache total active share link count on first fetch; increment on create, decrement on revoke.
- `maxActiveShareLinks = null` (Pro/Team) means unlimited — skip check.

**Complexity:** Low-medium. The dialog fetches per-resource links, but the server limit is global. Either cache the global count from billing summary, or accept that the pre-check is per-resource (less precise but still useful).

### 3. Public Share Q&A Entitlement (ShareDialog)

**Server check:** `POST /api/shares/chat/:token` — checks owner's plan `canUsePublicShareQA`, returns 402 `PUBLIC_SHARE_QA_NOT_ALLOWED`.

**Client-side approach:**
- When the user toggles the "Allow AI Q&A" switch in ShareDialog, check `getEntitlementsForPlan(plan).canUsePublicShareQA`.
- If false, show upgrade prompt and revert the toggle — don't even create the link with `canQuery: true`.

**Complexity:** Very low. Pure entitlement check, no counter needed.

### 4. Monthly Comments Quota (CommentsTab)

**Server check:** `POST /api/comments/generate` — checks `comments` quota, returns 402 `QUOTA_EXCEEDED`.

**Client-side approach:**
- `checkQuotaLocal('comments')` before `api.api.comments.generate.post()`.
- Increment counter by the number of comments returned on success.

**Complexity:** Low. Same pattern as video minutes.

### 5. Monthly Visual Segments Quota (MomentsTab)

**Server check:** Visual segments are consumed as a background task during ingest — no explicit pre-check endpoint. But the moments generate endpoint could in theory be gated too.

**Client-side approach:**
- `checkQuotaLocal('visual_segments')` before `api.api.moments.generate.post()`.
- Increment counter by number of moments returned.
- **Also:** MomentsTab is missing `handleUpgradeError()` on the generate call — this is a bug regardless of client-side pre-checks.

**Complexity:** Low for the pre-check. Determining exact segment count increment is approximate (server computes actual stored segments).

### 6. Daily Word Quota (Chat — pre-submit)

**Server check:** `POST /api/chat` — reserves words atomically, returns 429 `WORD_BUDGET_EXHAUSTED` if budget is 0.

**Client-side approach:**
- `wordsRemaining` is already tracked via `X-Words-Remaining` header.
- Before `sendMessage()`, check if `wordsRemaining` is 0 (or below a threshold).
- Show the same upgrade/wait toast without making the request.
- Already partially implemented — `wordsRemaining` is displayed but not used as a gate.

**Complexity:** Very low. The data is already in state.

## Counters and Entitlements Not Worth Client-Side Checking

| Check | Why |
|---|---|
| Resource ownership (asset, thread, collection) | Requires DB — can't be cached generically |
| Rate limiting (token bucket) | Inherently server-side; transient state |
| Word reservation atomicity | Advisory locks prevent races — client can't replicate |
| Webhook-driven plan changes | Plan changes mid-session are rare; 30s billing summary TTL + X-Plan header handle staleness |

## Error Codes Reference

| Code | HTTP | Meaning | Gatable client-side? |
|---|---|---|---|
| `QUOTA_EXCEEDED` | 402 | Monthly resource limit (video_minutes, comments, visual_segments) | Yes — via `checkQuotaLocal()` |
| `MODEL_NOT_ALLOWED` | 402 | Model not in plan's allowedModelIds | Yes — via `getEntitlementsForPlan()` |
| `COLLECTION_LIMIT` | 402 | Max collections reached | Yes — with cached count |
| `SHARE_LINK_LIMIT` | 402 | Max active share links reached | Yes — with cached count |
| `PUBLIC_SHARE_QA_NOT_ALLOWED` | 402 | Q&A on public shares needs Pro/Team | Yes — pure entitlement |
| `WORD_BUDGET_EXHAUSTED` | 429 | Daily word budget is 0 | Yes — from `wordsRemaining` state |
