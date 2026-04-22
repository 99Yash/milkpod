# Milkpod Sync Engine Plan

A grill-tested plan to add a Replicache-style sync engine to Milkpod for real-time collaborative annotation on video transcripts.

---

## TL;DR

**What ships (v1):** Owners of a Milkpod asset can invite teammates by email. Invitees get editor access to that asset's **moments** (highlights) and **comments**. Edits from any collaborator appear on every other collaborator's screen in under a second, with optimistic local writes. Built on a Replicache-style sync engine with row-versioning CVR, per-user client groups, and Redis pokes.

**What this replaces:** nothing. The monolithic Elysia backend stays. Chat, ingest, transcripts, billing, uploads, shares — all unchanged. This is an additive feature built on the existing `pnpm` + Turborepo + Elysia stack.

**Demo sentence:** *"You and a teammate open the same transcript. You drag to highlight a quote. It appears on their screen, with your name, in 600ms. They reply in a comment thread. No page refresh. Works across tabs. Built on a custom Replicache sync engine with CVR row-versioning and Redis pokes."*

---

## The decision tree (how we got here)

This plan started as "transform Milkpod into microservices." Through grilling, the decision tree resolved:

1. **Why microservices?** → To learn and put on résumé. No production pain point.
2. **Target role?** → Product engineer.
3. **Given (2), microservices or Replicache-style sync?** → Replicache. A sync engine is a stronger product-engineering signal than a 4-service HTTP fan-out, and it ships user-visible value (real-time collab), not backend theater.
4. **Single-user multi-device or multi-user collaborative?** → Multi-user collab. "Real-time shared highlighting on interview videos" is a crisp Linear-for-video pitch; multi-device solo is a weaker story.
5. **Client group scope?** → Per-user with asset-prefixed keys. Canonical Replicache pattern; access revocation falls out of CVR diffing for free.
6. **Quota attribution on shared writes?** → Non-issue for v1 — moments/comments are AI-inference-free, so they don't touch the quota module. Inference-sharing (viewers asking the AI on an owner's video) is a separate product feature in the **chat** module, planned for v2 and out of scope here.
7. **Mutator code location?** → Shared package `@milkpod/sync` with identical mutator functions consumed by both client and server. Duplicating them is the #1 cause of Replicache drift in the wild.

Explicitly rejected along the way:
- **Microservices** — cargo-culted for this codebase size. Better suited to a future scaling bottleneck or a different project.
- **Replicache + microservices** — doubled novelty kills side projects.
- **Full offline mode in v1** — requires conflict resolution UI and queue persistence. Big lift, modest interview-story delta. v2.
- **Presence (live cursors, "X is viewing")** — ephemeral state, different infra (not Replicache-synced). v2 polish.
- **Public anonymous collaborative share links** — rate-limit + abuse surface. Invite-by-email only in v1.
- **Per-range conflict merging** (two users highlight overlapping spans) — product problem, not a sync problem. Deferred.
- **Syncing `collections`** — per-user org structure, no collab value. Stays REST.
- **Rocicorp Zero** (successor to Replicache) — heavier runtime, SQL-ish client query engine. Overkill for the moments+comments surface.

---

## Scope

### v1 — the thing that ships

**User-visible surface:**

- **Invite flow.** Owner of an asset opens a "Share" drawer → enters an email → invitee (must already be a Milkpod user in v1) appears in members list with `editor` role. Owner can remove.
- **Collaborative moments.** Any editor can create, edit, delete moments on the asset. Optimistic local write; appears on other editors' screens after a poke-triggered pull.
- **Collaborative comments.** Same, for timestamped comments.
- **Author attribution.** Every moment/comment shows the editor's name + avatar.
- **Revocation.** When an editor is removed, their next pull (or push attempt) strips their local copy of that asset's moments/comments.

**Data entities in sync scope:**

| Entity | Sync | Scope |
|---|---|---|
| `moments` | Replicache | per-asset, collab |
| `comments` | Replicache | per-asset, collab |
| `collections` | REST (unchanged) | — |
| all others | REST / SSE (unchanged) | — |

**Explicit v1 constraints:**

- Online-optimistic only. No full offline mode (mutations still queue in-memory during short network hiccups, but IndexedDB is not the source of truth when disconnected for hours).
- Last-write-wins per row. No merge UI.
- Invite-by-email, invitee must be a registered Milkpod user. No anonymous/public collab.
- No presence. No typing indicators. No "X is viewing."
- Quota unchanged — moments/comments are free operations today and remain free.

### v2 — planned, not blocking v1

- **Chat Q&A on shared assets** with `assets.allow_viewer_qa: boolean` and `assets.viewer_qa_daily_cap: int`. Owner-configurable; owner pays inference. Lives in the **chat** module, not Replicache.
- **Presence layer.** Separate pub-sub channel for ephemeral cursor/viewing state. Not synced through Replicache.
- **Offline mode.** Persistent mutation queue + reconnection story + conflict resolution UX.
- **Public collaborative share links.** Rate-limited anonymous editors, per-link clientGroup assignment.
- **Collections sync.** 1-day follow-up once the Replicache scaffold exists.
- **Storage/compute split quota model.** Hybrid (c) from the grill — owner pays for storage, actor pays for compute.

---

## Architecture

### Package layout

```
packages/
  sync/                           ← NEW: @milkpod/sync
    src/
      mutators/
        moments.ts                ← shared, pure
        comments.ts
      schema.ts                   ← zod schemas for mutator args
      keys.ts                     ← moment/{assetId}/{id}, comment/{assetId}/{id}
      types.ts                    ← M<MutatorType.CLIENT | SERVER>, shared enums
      index.ts
  api/
    src/
      modules/
        replicache/               ← NEW
          index.ts                ← POST /replicache/push, POST /replicache/pull
          push.ts                 ← mutation processor
          pull.ts                 ← CVR diff
          cvr.ts                  ← Redis CVR store
          authz.ts                ← asset_members ACL
        asset-members/            ← NEW (or folded into assets/)
          index.ts                ← POST/DELETE /assets/:id/members
          service.ts
      ...
```

`@milkpod/sync` rules (mirroring the existing `@milkpod/ai` split):
- Zero runtime imports of `@milkpod/db`, `@milkpod/ai`, `@milkpod/auth`, `fetch`, Node APIs.
- Importable from both `apps/web` (browser) and `packages/api` (Node).
- Frontend uses subpath imports (`@milkpod/sync/mutators/moments`) per existing package-boundary convention.
- tsconfig `lib: ["ESNext"]` compatible — mutators are pure, no DOM.

### Data model changes

**New tables:**

```sql
-- Asset-level ACL
asset_members (
  asset_id    uuid references assets(id) on delete cascade,
  user_id     uuid references users(id),
  role        text check (role in ('owner','editor','viewer')) not null,
  invited_by  uuid references users(id),
  created_at  timestamptz default now(),
  primary key (asset_id, user_id)
)

-- Replicache client bookkeeping
replicache_client_group (
  id           text primary key,             -- clientGroupID, opaque, client-generated
  user_id      uuid references users(id),    -- authorized owner of this group
  cvr_version  integer not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
)

replicache_client (
  id                text primary key,                 -- clientID
  client_group_id   text references replicache_client_group(id) on delete cascade,
  last_mutation_id  integer not null default 0,
  last_modified     timestamptz default now()
)
```

**Modified tables:**

```sql
alter table moments  add column row_version integer not null default 0;
alter table comments add column row_version integer not null default 0;
```

Migrations authored via `pnpm db:generate` per CLAUDE.md. Backfill is free (default 0). Schema changes touch three migrations (add tables, add columns, add indexes on `asset_members` and row_version).

### Client group scoping

**Per-user**, not per-(user, asset). One clientGroupID per browser profile.

- Key namespace: `moment/{assetId}/{momentId}`, `comment/{assetId}/{commentId}`.
- Pull query joins moments/comments against `asset_members` where `user_id = session.userId`, returning every row the user can currently see across every asset they have access to.
- Client subscribes by prefix for the asset on screen: `rep.subscribe(tx => tx.scan({prefix: 'moment/' + assetId}).toArray())`.
- **Access revocation is free.** When a user is removed from `asset_members`, the next pull's row set no longer contains that asset's rows; CVR diff emits `del` ops; IndexedDB garbage-collects. No manual teardown.

**Caveat for the doc:** CVR size grows with everything the user can see. Comfortable up to ~1k assets per user. If Milkpod ever hits Figma-scale (tens of thousands of accessible assets per user), shard by workspace. Not a v1 problem.

### CVR strategy

Row-versioning, mirroring `../../oss/replicache-cvr`:

- Each synced row carries a `row_version` column, bumped on every mutation to that row.
- CVR snapshot = `{ moments: Map<id, rowVersion>, comments: Map<id, rowVersion>, clients: Map<clientId, lastMutationId> }`.
- Stored in Redis, keyed `cvr:{clientGroupID}:{order}` where `order` = `cvr_version`, TTL 12h.
- Pull diff: compute current visible rows, diff against CVR at cookie.order, emit `put` for changed/new, `del` for missing, bump `cvr_version`, write new snapshot, return patch + new cookie.
- First pull (no cookie) returns `{op: "clear"}` + full current set.

### Sync flow

```
┌────────────┐     push (mutations)     ┌────────────────┐
│  Client    │ ────────────────────────▶│  POST /push    │
│  (Replica- │                          │   apply txn    │
│   cache)   │◀─── 200 {success, errs}──│   bump rowVer  │
│            │                          │   poke         │
│            │                          └────────────────┘
│  IDB +     │                                  │
│  optimistic│                          Redis pub: replicache:{uid}
│  writes    │                                  │
│            │◀────── SSE poke ─────────────────┘
│            │                          ┌────────────────┐
│            │ ────── pull (cookie) ───▶│  POST /pull    │
│            │                          │   compute CVR  │
│            │◀── 200 {patch, cookie}───│   diff         │
└────────────┘                          └────────────────┘
```

### Poke transport

Reuse existing Redis pub/sub. `packages/api/src/events/asset-events.ts` already brokers cross-replica SSE; add a `replicache:{userId}` channel alongside the existing asset-event channels. SSE stream to the client already exists — piggyback a `replicache-poke` event type.

**No Ably/Pusher.** Your Redis already does this.

**Fan-out on push:** when a mutation commits on asset X, publish poke to every member in `asset_members WHERE asset_id = X`, one message per user channel. That's a small query, well-bounded.

### Auth & authorization

- **Session:** Better Auth session is already attached to Elysia context via the scoped `.derive` pattern. `/replicache/push` and `/replicache/pull` gate on valid session; 401 otherwise.
- **Client group ownership:** on first push for a `clientGroupID`, bind it to `session.userId`. Subsequent requests must match. Cross-user group reuse is a 403.
- **Row-level ACL:** every server-side mutator re-queries `asset_members` for `(session.userId, args.assetId)`. Client-side mutator assumes access and writes optimistically. Server mismatch → push response `{success:false, errors:[...]}` with code `FORBIDDEN`; Replicache rebases the local view by re-pulling (CVR diff drops the row since the user doesn't actually have access).
- **Pull ACL:** pull query itself joins `asset_members`, so the CVR snapshot is intrinsically user-filtered. A stale client group surviving a permission revocation will just get `del` ops on its next pull.

### Mutator contract

The non-negotiable Replicache invariants, translated to Milkpod:

- **Pure:** no `fetch`, no SDK calls, no DB calls outside the provided transaction handle, no `Math.random`, no `Date.now` unless passed as a mutator argument.
- **Deterministic:** same args + same tx state → same observable effect on both client (IDB tx) and server (pg tx).
- **IDs generated on the client** (ULID or nanoid) and passed as mutator args.
- **Timestamps passed as args** from client clock; server may clamp to `now ± skew` but must otherwise trust.
- **Auth is an input**, not a side-read. `userId` and `assetId` arrive as mutator args; the server mutator re-validates `asset_members` membership before committing.
- **Side effects** (notifications, webhooks, embeddings) happen in the push handler **after** the mutator commits, not inside the mutator. Mutators only touch the three synced tables.

Example mutator shape (abridged):

```ts
// @milkpod/sync/mutators/moments.ts
export const momentCreate = {
  args: z.object({
    id: z.string(),
    assetId: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    title: z.string().max(280),
    authorId: z.string(),
    createdAt: z.string(),
  }),
  async client(tx, args) {
    await tx.set(`moment/${args.assetId}/${args.id}`, { ...args, rowVersion: 0 });
  },
  async server(tx, args, ctx) {
    // ctx.session.userId === args.authorId — enforced upstream in push.ts
    await ctx.authz.requireEditor(args.assetId, ctx.session.userId);
    await tx.insert(moments).values({ ...args, rowVersion: 0 });
  },
};
```

---

## Implementation plan

Sequenced so each phase is independently testable; don't start a phase until the previous is green.

### Phase 0 — Groundwork (half a day)
- Add `@milkpod/sync` empty package, build config, tsdown, tsconfig.
- Add `replicache` dep to `apps/web`.
- No behavior change; just plumbing and lint rules.

### Phase 1 — Access control primitive (1 day)
- Schema: `asset_members` table + migration.
- Service + routes: `POST /assets/:id/members`, `DELETE /assets/:id/members/:userId`, `GET /assets/:id/members`.
- UI: minimal "Share" drawer on the asset page — invite by email, members list, remove action.
- Backfill: every existing asset gets an `asset_members` row for its current owner with role `owner`.
- **Checkpoint:** can invite a teammate and see them in the members list. No sync yet.

### Phase 2 — Read-only sync (1.5 days)
- Schema: `row_version` on moments/comments; `replicache_client*` tables.
- `@milkpod/sync/keys.ts` + schemas.
- `packages/api/src/modules/replicache/pull.ts` + CVR in Redis.
- Wire up `apps/web` Replicache client; render moments from `rep.subscribe` instead of REST.
- No mutators yet — writes still go through existing REST endpoints; pulls reflect them via the poke.
- **Checkpoint:** two browsers on the same asset see each other's REST-created moments within 1s.

### Phase 3 — Mutator roundtrip (1 day)
- Implement `momentCreate`, `momentUpdate`, `momentDelete`, `commentCreate`, `commentUpdate`, `commentDelete` in `@milkpod/sync/mutators/`.
- `packages/api/src/modules/replicache/push.ts`: apply mutations, bump `row_version`, poke.
- Swap `apps/web` to call `rep.mutate.momentCreate(...)` instead of REST.
- Keep old REST endpoints for 1 release as a fallback; remove after.
- **Checkpoint:** optimistic writes in Chrome devtools network throttle "slow 3G" — UI updates instantly, network confirms ~300ms later.

### Phase 4 — Hardening (1 day)
- Revocation test: remove a user mid-session, verify their local moments for that asset are deleted on next poke.
- Mutation conflict test: two users mutate the same moment; verify LWW based on server-applied order.
- Mutator auth test: tamper with `authorId` in a push payload, verify server rejects.
- CVR garbage collection: verify 12h-expired CVRs get rebuilt correctly (full sync fallback).
- Graceful shutdown: verify in-flight mutations aren't lost during `apps/server` restart.

### Phase 5 — Polish for demo (0.5 day)
- Author attribution (avatar + name on every moment/comment).
- Subtle "just synced" pulse animation on incoming rows.
- Empty state when no collaborators.
- Bug bash.

**Total: ~5 days of focused work.** Anything less and scope is lying; anything more and something's been added.

---

## Open questions to resolve before/during build

1. **Invitee-must-be-a-user:** v1 requires invitee to already have a Milkpod account. What UX does "user not found" show? (Suggest: "invite link sent" stub + pending_invites table in v2.)
2. **Moment/comment deletion semantics:** hard delete or soft delete with `deleted_at`? Soft preserves audit + enables undo, but CVR must treat soft-deleted as out-of-view. Suggest soft delete.
3. **Mutator arg size limit:** cap `comments.body` and `moments.title` lengths in the zod schemas before hitting DB constraints. Define limits.
4. **Asset owner leaving:** if owner is removed (by themselves?), does the asset get a new owner or become orphaned? Product decision. Suggest: owner cannot be removed; can transfer ownership in v2.
5. **Asset deletion cascades:** `asset_members` already cascades; does the CVR diff handle mass `del` gracefully when an asset is deleted? Should — every row goes out-of-view simultaneously.

---

## Interview talking points (the reason this exists)

When asked *"tell me about this project"*:

**The 30-second version:** *"I built a Replicache-style sync engine for Milkpod, a video-transcript product, to support real-time collaborative highlighting and commenting. Invite a teammate, both of you annotate a video together, changes show up on each other's screens in under a second, optimistic UX. Row-versioning CVR, per-user client groups, Redis pokes."*

**The hard problems I can talk about:**

- **Why a sync engine, not WebSockets + REST?** Optimistic writes, offline-resilient, CVR diffing beats "send me the whole list" on every change. The UX delta is measurable.
- **Client group scoping decisions.** Why per-user beats per-asset for access revocation ergonomics. Tradeoff: CVR size grows with visible rows. Mitigation: shard by workspace at scale.
- **Mutator purity constraint.** The Replicache contract — same function client + server, no I/O, IDs and clocks as inputs. Why duplicating client/server mutator code is a bug factory, and how `@milkpod/sync` enforces single-source.
- **Access control in a sync world.** Server mutators re-validate ACL; pull query is ACL-filtered so the CVR is intrinsically permission-correct. Revocation falls out of the diff.
- **Poke fan-out.** Why I reused the existing Redis pub/sub instead of bolting on Ably — infra minimization and alignment with the existing SSE bridge.
- **What I deferred and why.** Offline (needs conflict UI), presence (ephemeral, different layer), public anonymous collab (abuse surface). Knowing what NOT to build is the product skill.

**The tradeoffs I accepted:**

- Last-write-wins per row instead of range-merging. Cheap, good enough, product rarely hits it.
- Per-user client groups over per-asset. Larger CVR, but access revocation is free and mental model is simpler.
- Invite-by-email only. No public collab in v1. Ships faster, dodges abuse vectors.

---

## References

- `../../oss/replicache-cvr` — local reference implementation mirroring this plan's CVR + pokes pattern. Direct inspiration.
- `https://github.com/rocicorp/mono/tree/main/packages/replicache` — upstream Replicache source.
- `docs/architecture.md` (this repo) — workspace layout and data flow.
- `docs/package-boundaries.md` — subpath import rules, used as the template for `@milkpod/sync` hygiene.
- `docs/database.md` — migration workflow; relevant for the three schema changes in Phase 1–2.
- `packages/api/src/events/asset-events.ts` — the Redis pub/sub bridge being reused for pokes.
