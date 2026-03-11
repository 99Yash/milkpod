'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { api } from '~/lib/api';
import { route } from '~/lib/routes';

type PlanId = 'free' | 'pro' | 'team';
type Interval = 'month' | 'year';

type PlanDef = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  highlighted?: boolean;
};

const plans: PlanDef[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For getting started with video transcription.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      '120 video minutes/month',
      '2,000 AI words/day',
      '100 comments/month',
      '3 AI models',
      '1 share link',
      '5 collections',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For power users who need more capacity.',
    monthlyPrice: 19,
    yearlyPrice: 190,
    highlighted: true,
    features: [
      '1,200 video minutes/month',
      '30,000 AI words/day',
      '1,000 comments/month',
      'All 7 AI models',
      'Unlimited share links',
      'Unlimited collections',
      'Public share Q&A',
      'Priority processing',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    description: 'For teams that collaborate on video content.',
    monthlyPrice: 49,
    yearlyPrice: 490,
    features: [
      '4,000 video minutes/month',
      '100,000 AI words/day',
      '3,000 comments/month',
      'All 7 AI models',
      'Unlimited share links',
      'Unlimited collections',
      'Public share Q&A',
      'Priority processing',
    ],
  },
];

export function PricingGrid() {
  const router = useRouter();
  const [interval, setInterval] = useState<Interval>('month');
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.api.billing.summary.get().then(({ data }) => {
      if (!cancelled && data && 'plan' in data) {
        setCurrentPlan(data.plan as PlanId);
      }
    }).catch(() => {
      // Non-critical — grid still works without current plan indicator
    });
    return () => { cancelled = true; };
  }, []);

  const handleCheckout = async (planId: PlanId) => {
    if (planId === 'free') return;
    setLoadingPlan(planId);
    try {
      const { data, error } = await api.api.billing.checkout.post({
        planId,
        interval,
      });
      if (error) {
        const errVal = error.value;
        if (typeof errVal === 'object' && errVal && 'error' in errVal && errVal.error === 'billing_disabled') {
          toast.error('Billing is not configured yet.');
          return;
        }
        toast.error('Failed to start checkout. Please try again.');
        return;
      }
      if (data && 'checkoutUrl' in data && typeof data.checkoutUrl === 'string') {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error('Failed to start checkout. Please try again.');
      }
    } catch {
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Interval toggle */}
      <div role="radiogroup" aria-label="Billing interval" className="flex items-center justify-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 w-fit mx-auto">
        <button
          type="button"
          role="radio"
          aria-checked={interval === 'month'}
          onClick={() => setInterval('month')}
          className={cn(
            'rounded-sm px-4 py-1.5 text-sm font-medium transition-colors',
            interval === 'month'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Monthly
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={interval === 'year'}
          onClick={() => setInterval('year')}
          className={cn(
            'rounded-sm px-4 py-1.5 text-sm font-medium transition-colors',
            interval === 'year'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Yearly
          <Badge variant="outline" className="ml-2 border-emerald-500/40 text-emerald-600 text-[10px]">
            Save 17%
          </Badge>
        </button>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          const price = interval === 'month' ? plan.monthlyPrice : plan.yearlyPrice;

          return (
            <div
              key={plan.id}
              className={cn(
                'relative flex flex-col rounded-xl border bg-card p-6 shadow-sm',
                plan.highlighted
                  ? 'border-primary/50 ring-1 ring-primary/20'
                  : 'border-border/60',
              )}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px]">
                  Most popular
                </Badge>
              )}

              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-balance">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight tabular-nums">
                  ${price}
                </span>
                {plan.monthlyPrice > 0 && (
                  <span className="text-sm text-muted-foreground">
                    /{interval === 'month' ? 'mo' : 'yr'}
                  </span>
                )}
              </div>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Current plan
                  </Button>
                ) : plan.id === 'free' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(route('/dashboard/billing'))}
                  >
                    {currentPlan ? 'Downgrade' : 'Get started'}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.highlighted ? 'default' : 'outline'}
                    disabled={loadingPlan !== null}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {loadingPlan === plan.id ? 'Redirecting...' : 'Upgrade'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
