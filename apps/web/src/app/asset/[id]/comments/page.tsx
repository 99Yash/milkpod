import { redirect } from 'next/navigation';

export default async function CommentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/asset/${id}?tab=comments`);
}
