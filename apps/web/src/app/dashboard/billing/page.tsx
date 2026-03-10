import { redirect } from 'next/navigation';
import { getServerSession } from '~/lib/auth/session';
import { BillingDashboard } from '~/components/billing/billing-dashboard';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/signin');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, usage, and payment details.
        </p>
      </div>
      <BillingDashboard />
    </div>
  );
}
