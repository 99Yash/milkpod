import { redirect } from 'next/navigation';

export default async function MomentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/asset/${id}?tab=moments`);
}
