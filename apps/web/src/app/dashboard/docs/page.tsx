'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-xs font-bold text-cream">
            {number}
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="prose-sm space-y-3 text-sm text-charcoal">
        {children}
      </CardContent>
    </Card>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-charcoal/8 pb-2">
      <button
        className="flex w-full items-center justify-between py-1.5 text-left text-sm font-medium text-charcoal"
        onClick={() => setOpen(!open)}
      >
        {question}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-dune" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-dune" />
        )}
      </button>
      {open && <p className="pb-1 text-sm text-dune">{answer}</p>}
    </div>
  );
}

export default function DocsPage() {
  const t = useTranslations('help');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">{t('title')}</h1>
        <p className="mt-1 font-body text-sm text-dune">{t('subtitle')}</p>
      </div>

      {/* Section 1: Getting Started */}
      <Section number={1} title={t('gettingStarted.title')}>
        <ol className="list-inside list-decimal space-y-2 text-dune">
          <li>
            <strong className="text-charcoal">{t('gettingStarted.step1Title')}</strong>
            {' — '}{t('gettingStarted.step1Desc')}
          </li>
          <li>
            <strong className="text-charcoal">{t('gettingStarted.step2Title')}</strong>
            {' — '}{t('gettingStarted.step2Desc')}
          </li>
          <li>
            <strong className="text-charcoal">{t('gettingStarted.step3Title')}</strong>
            {' — '}{t('gettingStarted.step3Desc')}
          </li>
        </ol>
      </Section>

      {/* Section 2: Share Your Chat Link */}
      <Section number={2} title={t('shareLink.title')}>
        <p className="text-dune">{t('shareLink.intro')}</p>
        <ul className="list-inside list-disc space-y-1.5 text-dune">
          <li>{t('shareLink.tip1')}</li>
          <li>{t('shareLink.tip2')}</li>
          <li>{t('shareLink.tip3')}</li>
        </ul>
      </Section>

      {/* Section 3: Understanding Your Dashboard */}
      <Section number={3} title={t('dashboardGuide.title')}>
        <p className="text-dune">{t('dashboardGuide.intro')}</p>
        <div className="space-y-1">
          <Faq question={t('dashboardGuide.overviewQ')} answer={t('dashboardGuide.overviewA')} />
          <Faq question={t('dashboardGuide.conversationsQ')} answer={t('dashboardGuide.conversationsA')} />
          <Faq question={t('dashboardGuide.agentsQ')} answer={t('dashboardGuide.agentsA')} />
          <Faq question={t('dashboardGuide.knowledgeQ')} answer={t('dashboardGuide.knowledgeA')} />
          <Faq question={t('dashboardGuide.analyticsQ')} answer={t('dashboardGuide.analyticsA')} />
          <Faq question={t('dashboardGuide.billingQ')} answer={t('dashboardGuide.billingA')} />
          <Faq question={t('dashboardGuide.profileQ')} answer={t('dashboardGuide.profileA')} />
        </div>
      </Section>

      {/* Section 4: Knowledge Base Tips */}
      <Section number={4} title={t('knowledgeTips.title')}>
        <p className="text-dune">{t('knowledgeTips.intro')}</p>
        <ul className="list-inside list-disc space-y-1.5 text-dune">
          <li>{t('knowledgeTips.tip1')}</li>
          <li>{t('knowledgeTips.tip2')}</li>
          <li>{t('knowledgeTips.tip3')}</li>
          <li>{t('knowledgeTips.tip4')}</li>
        </ul>
      </Section>
    </div>
  );
}
