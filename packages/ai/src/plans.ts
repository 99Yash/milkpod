/**
 * Client-safe plan entitlements config.
 *
 * This module contains ONLY static, deterministic plan data — no DB imports.
 * Both the frontend (`@milkpod/ai/plans`) and backend (`packages/api`)
 * consume these definitions so entitlement logic stays in one place.
 */

export type PlanId = 'free' | 'pro' | 'team';

// ---------------------------------------------------------------------------
// Multimodal quotas
// ---------------------------------------------------------------------------

export type MultimodalQuota = {
  videoMinutesMonthly: number;
  visualSegmentsMonthly: number;
  commentsMonthly: number;
};

const PLAN_QUOTAS: Record<PlanId, MultimodalQuota> = {
  free: {
    videoMinutesMonthly: 120,
    visualSegmentsMonthly: 200,
    commentsMonthly: 100,
  },
  pro: {
    videoMinutesMonthly: 1200,
    visualSegmentsMonthly: 2000,
    commentsMonthly: 1000,
  },
  team: {
    videoMinutesMonthly: 4000,
    visualSegmentsMonthly: 6000,
    commentsMonthly: 3000,
  },
};

export type QuotaUnit = 'video_minutes' | 'visual_segments' | 'comments';

export function getQuotaForPlan(planId: PlanId): MultimodalQuota {
  return PLAN_QUOTAS[planId];
}

// ---------------------------------------------------------------------------
// Full plan entitlements
// ---------------------------------------------------------------------------

export type PlanEntitlements = {
  aiWordsDaily: number;
  maxActiveShareLinks: number | null; // null = unlimited
  allowedModelIds: string[];
  canUsePublicShareQA: boolean;
  priorityProcessing: boolean;
  maxCollections: number | null; // null = unlimited
};

const FREE_MODEL_IDS = [
  'openai:gpt-4.1-mini',
  'google:gemini-2.5-flash',
  'google:gemini-2.0-flash',
];

const ALL_MODEL_IDS = [
  'openai:gpt-5.2',
  'openai:gpt-4.1',
  'openai:gpt-4.1-mini',
  'openai:o4-mini',
  'google:gemini-2.5-pro',
  'google:gemini-2.5-flash',
  'google:gemini-2.0-flash',
];

const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    aiWordsDaily: 2_000,
    maxActiveShareLinks: 1,
    allowedModelIds: FREE_MODEL_IDS,
    canUsePublicShareQA: false,
    priorityProcessing: false,
    maxCollections: 5,
  },
  pro: {
    aiWordsDaily: 30_000,
    maxActiveShareLinks: null,
    allowedModelIds: ALL_MODEL_IDS,
    canUsePublicShareQA: true,
    priorityProcessing: true,
    maxCollections: null,
  },
  team: {
    aiWordsDaily: 100_000,
    maxActiveShareLinks: null,
    allowedModelIds: ALL_MODEL_IDS,
    canUsePublicShareQA: true,
    priorityProcessing: true,
    maxCollections: null,
  },
};

export function getEntitlementsForPlan(planId: PlanId): PlanEntitlements {
  return PLAN_ENTITLEMENTS[planId];
}
