import { redirect } from 'next/navigation';
import { getServerSession } from '~/lib/auth/session';
import { LandingContent } from './landing-content';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await getServerSession();
  if (session?.user) redirect('/dashboard');

  return <LandingContent />;
}
