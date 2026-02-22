export const dynamic = 'force-dynamic';

import { SharedView } from '~/components/share/shared-view';

type SharePageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  return <SharedView token={token} />;
}
