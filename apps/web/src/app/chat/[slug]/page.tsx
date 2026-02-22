import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import ChatPage from './chat-page';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Props {
  params: Promise<{ slug: string }>;
}

export interface InfoData {
  tenant_name: string;
  artifact_name: string;
  greeting: string;
  language: string;
  profile: {
    tagline?: string;
    bio?: string;
    avatarUrl?: string;
    socialLinks?: Array<{ platform: string; url: string }>;
    location?: string;
    hours?: string;
  } | null;
  quick_actions: Array<{ label: string; message: string }>;
}

async function fetchInfo(slug: string): Promise<InfoData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${API_URL}/api/widget/info?slug=${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      next: { revalidate: 60 },
    });
    clearTimeout(timeout);
    if (res.ok) return (await res.json()) as InfoData;
  } catch {
    // API down or timeout
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTranslations('publicChat');
  const info = await fetchInfo(slug);

  if (info) {
    const tagline = info.profile?.tagline;
    const bio = info.profile?.bio;
    const title = tagline
      ? `${info.tenant_name} — ${tagline} | Camello`
      : `${info.tenant_name} | Camello`;
    const description = bio
      ? bio.slice(0, 160)
      : t('ogDescription', { name: info.artifact_name });
    const avatarUrl = info.profile?.avatarUrl;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: 'Camello',
        type: 'website',
        ...(avatarUrl ? { images: [{ url: avatarUrl }] } : {}),
      },
    };
  }

  return {
    title: t('ogFallbackTitle'),
    description: t('ogFallbackDescription'),
  };
}

export default async function ChatSlugPage({ params }: Props) {
  const { slug } = await params;
  const ssrInfo = await fetchInfo(slug);
  return <ChatPage slug={slug} ssrInfo={ssrInfo} />;
}
