'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { trpc } from '@/lib/trpc';

interface GuideState {
  dismissed?: boolean;
  testedChat?: boolean;
  addedKnowledge?: boolean;
  sharedLink?: boolean;
}

interface FirstSessionGuideProps {
  guideState: GuideState | null | undefined;
  testedChatAuto: boolean;
}

export function FirstSessionGuide({ guideState, testedChatAuto }: FirstSessionGuideProps) {
  const t = useTranslations('firstSessionGuide');
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();
  const tenantQuery = trpc.tenant.me.useQuery();
  const docCountQuery = trpc.knowledge.docCount.useQuery();
  const updateStep = trpc.tenant.updateGuideStep.useMutation({
    onSuccess: () => void utils.onboarding.getStatus.invalidate(),
  });

  const testedChat = testedChatAuto || (guideState?.testedChat ?? false);
  const addedKnowledge = (docCountQuery.data ?? 0) > 0 || (guideState?.addedKnowledge ?? false);
  const sharedLink = guideState?.sharedLink ?? false;
  const allDone = testedChat && addedKnowledge && sharedLink;

  if (allDone) return null;

  async function handleCopyLink() {
    const slug = tenantQuery.data?.slug;
    if (!slug) return;
    const url = `${window.location.origin}/chat/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (!sharedLink) {
        updateStep.mutate({ step: 'sharedLink', value: true });
      }
    } catch {
      // Clipboard API unavailable (HTTP context or denied permission) — no-op
    }
  }

  function handleDismiss() {
    updateStep.mutate({ step: 'dismissed', value: true });
  }

  const items = [
    {
      key: 'setup',
      done: true,
      label: t('guideSetup'),
      cta: null,
    },
    {
      key: 'testChat',
      done: testedChat,
      label: t('guideTestChat'),
      cta: { label: t('guideTestChatCta'), href: '/dashboard/agent' as string, onClick: undefined as undefined | (() => void) },
    },
    {
      key: 'addKnowledge',
      done: addedKnowledge,
      label: t('guideAddKnowledge'),
      cta: { label: t('guideAddKnowledgeCta'), href: '/dashboard/knowledge' as string, onClick: undefined as undefined | (() => void) },
    },
    {
      key: 'shareLink',
      done: sharedLink,
      label: t('guideShareLink'),
      cta: { label: copied ? t('guideLinkCopied') : t('guideShareLinkCta'), href: undefined as string | undefined, onClick: handleCopyLink as (() => void) | undefined },
    },
  ];

  return (
    <div
      data-testid="first-session-guide"
      className="mb-4 rounded-lg border border-teal/30 bg-teal/5 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="font-heading text-sm font-medium text-charcoal">{t('guideTitle')}</p>
        <button
          type="button"
          aria-label={t('guideDismiss')}
          onClick={handleDismiss}
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-md text-dune hover:text-charcoal transition-colors"
        >
          ×
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-dune" />
            )}
            <span className={item.done ? 'text-sm line-through text-dune' : 'text-sm text-charcoal'}>
              {item.label}
            </span>
            {!item.done && item.cta && (
              item.cta.href ? (
                <Link
                  href={item.cta.href}
                  className="ml-auto text-xs font-medium text-teal hover:text-teal/80 transition-colors min-h-[36px] flex items-center"
                >
                  {item.cta.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.cta.onClick}
                  className="ml-auto text-xs font-medium text-teal hover:text-teal/80 transition-colors min-h-[36px] px-1"
                >
                  {item.cta.label}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
