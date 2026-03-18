'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { cn } from '~/lib/utils';
import { getCachedPlan } from '~/lib/plan-cache';
import { getEntitlementsForPlan } from '@milkpod/ai/plans';
import { DAILY_WORD_BUDGET } from '@milkpod/ai/limits';

interface DailyQuotaProps {
  remaining: number | null;
}

export function DailyQuota({ remaining }: DailyQuotaProps) {
  if (remaining === null) return null;

  const plan = getCachedPlan();
  const budget = plan ? getEntitlementsForPlan(plan).aiWordsDaily : DAILY_WORD_BUDGET;
  const isLow = remaining < 200;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center px-2 text-xs tabular-nums',
            isLow ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {remaining} left
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{remaining} of {budget.toLocaleString()} words remaining today</p>
        <p className="text-muted-foreground">Resets at midnight UTC</p>
      </TooltipContent>
    </Tooltip>
  );
}
