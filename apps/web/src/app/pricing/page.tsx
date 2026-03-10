import { redirect } from 'next/navigation';
import { getServerSession } from '~/lib/auth/session';
import { PricingGrid } from '~/components/billing/pricing-grid';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const session = await getServerSession();

  if (!session?.user) {
    redirect('/signin');
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Plans & Pricing</h1>
        <p className="text-muted-foreground">
          Choose a plan that fits your workflow. Upgrade or downgrade anytime.
        </p>
      </div>
      <div className="mt-10">
        <PricingGrid />
      </div>
    </div>
  );
}
