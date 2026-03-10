export type PlanId = 'free' | 'pro' | 'team';

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

/**
 * Resolve the multimodal quota entitlements for a given plan.
 * Plans are kept in code (not DB) per the billing design doc.
 */
export function getQuotaForPlan(planId: PlanId): MultimodalQuota {
  return PLAN_QUOTAS[planId];
}

/**
 * Everyone defaults to free until billing integration is implemented.
 */
export function resolveUserPlan(_userId: string): PlanId {
  return 'free';
}
