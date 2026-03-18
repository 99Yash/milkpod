'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  CreditCard,
  Loader2,
  MessageCircle,
  Eye,
  Video,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { api } from '~/lib/api';
import { route } from '~/lib/routes';

type UsageBar = {
  label: string;
  used: number;
  limit: number;
  unit: string;
  icon: React.ElementType;
};

type BillingSummary = {
  plan: 'free' | 'pro' | 'team';
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: {
    dailyWords: { used: number; limit: number; remaining: number };
    monthlyVideoMinutes: { used: number; limit: number; remaining: number };
    monthlyVisualSegments: { used: number; limit: number; remaining: number };
    monthlyComments: { used: number; limit: number; remaining: number };
  };
  entitlements: {
    aiWordsDaily: number;
    maxActiveShareLinks: number | null;
    allowedModelIds: string[];
    canUsePublicShareQA: boolean;
    priorityProcessing: boolean;
    maxCollections: number | null;
  };
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};

export function BillingDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.api.billing.summary.get().then(({ data }) => {
      if (cancelled) return;
      if (data) setSummary(data as BillingSummary);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handlePortal = useCallback(async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await api.api.billing.portal.post();
      if (error) {
        const errVal = error.value as { code?: string; message?: string } | undefined;
        if (errVal?.code === 'BILLING_DISABLED') {
          toast.error('Billing is not configured yet.');
          return;
        }
        if (errVal?.code === 'NO_CUSTOMER') {
          toast.error('No billing account found. Subscribe to a plan first.');
          return;
        }
        toast.error(errVal?.message ?? 'Could not open billing portal.');
        return;
      }
      if (data && 'portalUrl' in data && typeof data.portalUrl === 'string') {
        window.location.href = data.portalUrl;
      }
    } catch {
      toast.error('Could not open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const handleCancel = useCallback(async () => {
    setCancelLoading(true);
    try {
      const { error } = await api.api.billing.cancel.post({ atPeriodEnd: true });
      if (error) {
        toast.error('Failed to cancel subscription.');
        return;
      }
      toast.success('Subscription will cancel at the end of the billing period.');
      // Refresh summary
      const { data } = await api.api.billing.summary.get();
      if (data) setSummary(data as BillingSummary);
    } catch {
      toast.error('Failed to cancel subscription.');
    } finally {
      setCancelLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Failed to load billing information.
      </div>
    );
  }

  const isPaid = summary.plan !== 'free';
  const isPastDue = summary.subscription?.status === 'past_due';
  const isCanceling = summary.subscription?.cancelAtPeriodEnd === true;
  const periodEnd = summary.subscription?.currentPeriodEnd
    ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const usageBars: UsageBar[] = [
    {
      label: 'AI words today',
      used: summary.usage.dailyWords.used,
      limit: summary.usage.dailyWords.limit,
      unit: 'words',
      icon: Zap,
    },
    {
      label: 'Video minutes this month',
      used: summary.usage.monthlyVideoMinutes.used,
      limit: summary.usage.monthlyVideoMinutes.limit,
      unit: 'min',
      icon: Video,
    },
    {
      label: 'Visual segments this month',
      used: summary.usage.monthlyVisualSegments.used,
      limit: summary.usage.monthlyVisualSegments.limit,
      unit: 'segments',
      icon: Eye,
    },
    {
      label: 'Comments this month',
      used: summary.usage.monthlyComments.used,
      limit: summary.usage.monthlyComments.limit,
      unit: 'comments',
      icon: MessageCircle,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Past due warning */}
      {isPastDue && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Payment failed</p>
            <p className="text-xs text-muted-foreground">
              Please update your payment method to avoid service interruption.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={handlePortal} disabled={portalLoading}>
            {portalLoading ? 'Opening...' : 'Update payment'}
          </Button>
        </div>
      )}

      {/* Plan card */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{PLAN_LABELS[summary.plan]} plan</h2>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] uppercase tracking-wide',
                  isPaid
                    ? 'border-primary/40 text-primary'
                    : 'border-border/60 text-muted-foreground',
                )}
              >
                {isPaid ? 'Active' : 'Free tier'}
              </Badge>
            </div>
            {periodEnd && (
              <p className="text-sm text-muted-foreground">
                {isCanceling
                  ? `Cancels on ${periodEnd}`
                  : `Renews on ${periodEnd}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {isPaid && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePortal}
                  disabled={portalLoading}
                >
                  <CreditCard className="mr-1.5 size-3.5" />
                  {portalLoading ? 'Opening...' : 'Manage'}
                </Button>
                {!isCanceling && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelLoading}
                    className="text-muted-foreground"
                  >
                    {cancelLoading ? 'Canceling...' : 'Cancel plan'}
                  </Button>
                )}
              </>
            )}
            {!isPaid && (
              <Button size="sm" onClick={() => router.push(route('/pricing'))}>
                Upgrade
                <ArrowUpRight className="ml-1 size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Usage section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Usage</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {usageBars.map((bar) => {
            const pct = bar.limit > 0 ? Math.min(100, (bar.used / bar.limit) * 100) : 0;
            const isHigh = pct > 80;

            return (
              <div
                key={bar.label}
                className="rounded-xl border border-border/60 bg-card p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <bar.icon className="size-3.5" />
                  {bar.label}
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-semibold tabular-nums">
                      {bar.used.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      of {bar.limit.toLocaleString()} {bar.unit}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={bar.used}
                    aria-valuemin={0}
                    aria-valuemax={bar.limit}
                    aria-label={bar.label}
                    className="h-1.5 w-full rounded-full bg-muted"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        isHigh ? 'bg-destructive' : 'bg-primary',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Entitlements section */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Plan features</h3>
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <EntitlementItem
              label="AI models"
              value={`${summary.entitlements.allowedModelIds.length} available`}
            />
            <EntitlementItem
              label="Share links"
              value={summary.entitlements.maxActiveShareLinks === null ? 'Unlimited' : String(summary.entitlements.maxActiveShareLinks)}
            />
            <EntitlementItem
              label="Collections"
              value={summary.entitlements.maxCollections === null ? 'Unlimited' : String(summary.entitlements.maxCollections)}
            />
            <EntitlementItem
              label="Public share Q&A"
              value={summary.entitlements.canUsePublicShareQA ? 'Enabled' : 'Disabled'}
            />
            <EntitlementItem
              label="Priority processing"
              value={summary.entitlements.priorityProcessing ? 'Enabled' : 'Disabled'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EntitlementItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}
