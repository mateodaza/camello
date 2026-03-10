import { redirect } from 'next/navigation';

export default async function ConversationDeepLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/dashboard/conversations?selected=${id}`);
}
