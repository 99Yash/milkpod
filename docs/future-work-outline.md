# Future Work Outline

Last updated: 2026-03-10

This file summarizes roadmap items that are still open in project docs and
gives a concrete implementation path for each.

## 1) Upload parity follow-ups (multimodal)

Source docs:
- `docs/video-multimodal-implementation-plan.md`
- `docs/video-multimodal-prd.md`

### ~~1.1 Retention policy for uploaded raw media~~ ✅

Why:
- We now keep durable upload objects for reprocessing/retries.
- We still need explicit lifecycle rules for cost and compliance.

Implementation path:
1. ~~Add retention columns on `media_asset` (for example `raw_media_retention_until` and `raw_media_deleted_at`).~~
2. ~~Add a daily purge worker that:~~
   - ~~selects expired upload assets,~~
   - ~~deletes object storage keys,~~
   - ~~marks purge status in DB.~~
3. ~~Add legal-hold bypass support (`retention_hold=true`) for support/admin flows.~~
4. ~~Add metrics (`purge_attempted`, `purge_succeeded`, `purge_failed`) and alerting on failures.~~

### ~~1.2 Full upload multimodal parity hardening~~ ✅

Why:
- Upload videos now have durable URLs and visual extraction trigger paths, but
  parity should be enforced and observable as a first-class workflow.

Implementation path:
1. ~~Add visual-stage state tracking (`visual_status`, `visual_attempts`, `visual_last_error`).~~
2. ~~Add a requeue path that refreshes signed URLs when visual jobs outlive URL TTL.~~
3. ~~Add integration tests for upload video: transcript, visual extraction,
   hybrid chat retrieval, and comments.~~
4. ~~Add parity dashboards comparing success rates for YouTube vs upload sources.~~

### ~~1.3 Tenant-level multimodal quota policy~~ ✅

Why:
- PRD still lists this as an open decision and implementation gap.

Implementation path:
1. ~~Define quota units (`video_minutes_processed`, `visual_segments_generated`,
   `comments_generated`) per plan.~~
2. ~~Add counters and reservation APIs around ingest/comment pipelines.~~
3. ~~Return upgrade-aware API errors when limits are exceeded.~~
4. ~~Surface usage in dashboard and billing summary endpoints.~~

## 2) SaaS billing and entitlement system

Source docs:
- `docs/saas-plan.md`
- `docs/saas-billing-entitlements-plan.md`

Current state:
- Billing modules/tables described in plan docs are not yet implemented in
  `packages/api/src/modules/billing`.

Implementation path:
1. ~~**Foundation**: plans catalog, billing schema, entitlement resolver, summary endpoint.~~ ✅
2. ~~**Provider integration**: provider interface, first adapter, checkout/portal/cancel/webhook routes.~~ ✅
3. **Enforcement**: plan-aware word budgets, model gating, ingest minute quotas,
   share-link limits, and shared-chat budget accounting.
4. **Frontend UX**: pricing page, billing dashboard, upgrade prompts at all gates.
5. **Verification**: entitlement unit tests + webhook/idempotency integration tests.

## 3) Open decisions that block implementation sequencing

1. ~~Billing provider choice (`polar` vs `razorpay`).~~ ✅ Polar selected as first provider. Provider abstraction (`BillingProvider` interface) allows adding Razorpay later.
2. Annual billing timing (ship monthly first vs launch both).
3. ~~Multimodal quota thresholds per plan and overage policy.~~ ✅ Free: 120 min / 200 visual / 100 comments; Pro: 1200 / 2000 / 1000; Team: 4000 / 6000 / 3000. Overage blocked with 402 upgrade prompt.
4. ~~Upload retention defaults (TTL length, legal hold process, hard-delete SLA).~~ ✅ Defaults: 90 days via `RAW_MEDIA_RETENTION_DAYS`, legal hold via `retention_hold` column, purge via admin API.
